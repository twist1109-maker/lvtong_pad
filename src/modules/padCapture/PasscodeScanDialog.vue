<script setup lang="ts">
/**
 * 通行码扫码 — 对齐安卓 App 扫通行码后立即上传 JSON（仅 passcodeQRCodeInfo）
 * 识别结果立即回填；上传走 /api/mobile/upload/json，与手机 App 共用协议。
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import QtMessageBox from '@/components/common/QtMessageBox.vue'
import { useDeviceCamera } from '@/composables/useDeviceCamera'
import {
  decodeQrFromCanvas,
  createPasscodeQrImage,
  emptyCaptureJson,
  photoStamp,
  uploadMobileJson,
} from '@/modules/padCapture/mobileProtocol'
import {
  hasScannerEncodingArtifacts,
  normalizePasscodeRaw,
  parsePasscode,
  type PasscodeInfo,
} from '@/modules/padCapture/passcode'

const props = withDefaults(defineProps<{ autoScan?: boolean; initialSource?: 'camera' | 'scanner' }>(), { autoScan: true })
const emit = defineEmits<{ close: []; decoded: [info: PasscodeInfo, image: string] }>()

const source = ref(props.initialSource ?? null)
const videoRef = ref<HTMLVideoElement | null>(null)
const photoInput = ref<HTMLInputElement | null>(null)
const scannerInput = ref<HTMLTextAreaElement | null>(null)
const scannerText = ref('')
const photoPicking = ref(false)
const camera = useDeviceCamera(videoRef)
const { status: cameraStatus, error: cameraError } = camera
const uploading = ref(false)
const capturing = ref(false)
const decoding = ref(false)
const tipVisible = ref(false)
const tipMessage = ref('')
const tipOk = ref(true)
const scannedRaw = ref('')

let scanTimer = 0
let scannerTimer = 0
let closed = false
const uploadController = new AbortController()

function showTip(message: string, ok = true) {
  tipMessage.value = message
  tipOk.value = ok
  tipVisible.value = true
}

function stopStream() {
  camera.stop()
}

function stopScan() {
  if (scanTimer) {
    window.clearTimeout(scanTimer)
    scanTimer = 0
  }
}

function onClose() {
  closed = true
  uploadController.abort()
  stopScan()
  window.clearTimeout(scannerTimer)
  stopStream()
  emit('close')
}

async function selectSource(value: 'camera' | 'scanner') {
  source.value = value
  await nextTick()
  if (value === 'camera') await openStream()
  else scannerInput.value?.focus()
}

function backToSources() {
  stopScan()
  stopStream()
  window.clearTimeout(scannerTimer)
  scannerText.value = ''
  source.value = null
}

async function openStream(): Promise<boolean> {
  if (closed) return false
  const ok = await camera.start()
  if (ok) scheduleScan()
  return ok
}

function scheduleScan() {
  stopScan()
  if (source.value !== 'camera' || !props.autoScan || closed || photoPicking.value || capturing.value || scannedRaw.value || uploading.value || tipVisible.value || cameraStatus.value !== 'ready') return
  scanTimer = window.setTimeout(() => {
    void scanOnce()
  }, 400)
}

async function scanOnce() {
  if (closed || uploading.value || capturing.value || decoding.value || tipVisible.value) return
  decoding.value = true
  try {
    const frame = camera.captureCanvas()
    const text = await decodeQrFromCanvas(frame)
    if (!closed && source.value === 'camera' && !photoPicking.value && text) await acceptPasscode(text, frame.toDataURL('image/jpeg', 0.9))
  } catch {
    // 预览首帧尚未到达时继续等待。
  } finally {
    decoding.value = false
    scheduleScan()
  }
}

async function acceptPasscode(raw: string, snapshot = '') {
  if (closed || uploading.value) return
  const normalizedRaw = normalizePasscodeRaw(raw)
  // 扫码枪输入框也展示规范化结果，避免界面仍显示设备原始乱码而让操作员误判。
  if (source.value === 'scanner' && scannerText.value !== normalizedRaw) {
    scannerText.value = normalizedRaw
  }
  const info = parsePasscode(normalizedRaw)
  if (!info) {
    showTip(
      hasScannerEncodingArtifacts(normalizedRaw)
        ? '扫码枪输出存在乱码。请设置为 USB KBW/HID、美式键盘和正确中文字符集后重新扫描。'
        : '通行码内容无效',
      false,
    )
    scheduleScan()
    return
  }
  uploading.value = true
  stopScan()
  if (!scannedRaw.value) {
    scannedRaw.value = normalizedRaw
    stopStream()
    const image = await createPasscodeQrImage(normalizedRaw).catch(() => snapshot)
    if (closed) return
    emit('decoded', info, image)
  }
  const name = `photo_${photoStamp()}_${Date.now()}.json`
  const json = emptyCaptureJson()
  json.passcodeQRCodeInfo = normalizedRaw
  let ok = false
  try {
    ok = await uploadMobileJson(name, json, uploadController.signal)
  } catch {
    ok = false
  } finally {
    uploading.value = false
  }
  if (closed) return
  if (ok) {
    stopStream()
    onClose()
  } else {
    showTip('通行码已识别并回填，上传失败。请检查网络后点击“重试上传”。', false)
    scheduleScan()
  }
}

function onTipClose() {
  tipVisible.value = false
  if (tipOk.value) onClose()
  else {
    scheduleScan()
    if (source.value === 'scanner') void nextTick(() => {
      scannerInput.value?.focus()
      scannerInput.value?.select()
    })
  }
}

function pickPhoto() {
  if (closed || capturing.value || uploading.value) return
  photoPicking.value = true
  stopScan()
  photoInput.value?.click()
}

function cancelPhoto() {
  photoPicking.value = false
  scheduleScan()
}

async function recognizePhoto(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return cancelPhoto()

  capturing.value = true
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    if (closed) return
    const frame = document.createElement('canvas')
    const ratio = Math.min(1, 2560 / Math.max(image.naturalWidth, image.naturalHeight))
    frame.width = Math.max(1, Math.round(image.naturalWidth * ratio))
    frame.height = Math.max(1, Math.round(image.naturalHeight * ratio))
    const ctx = frame.getContext('2d')
    if (!ctx) throw new Error('无法读取照片')
    ctx.drawImage(image, 0, 0, frame.width, frame.height)
    const text = await decodeQrFromCanvas(frame)
    if (closed) return
    if (!text) {
      showTip('所选照片未识别到通行码，请选择清晰的二维码照片重试', false)
      return
    }
    await acceptPasscode(text, frame.toDataURL('image/jpeg', 0.9))
  } catch (cause) {
    if (!closed) showTip(cause instanceof Error ? cause.message : '照片识别失败，请重试', false)
  } finally {
    URL.revokeObjectURL(url)
    capturing.value = false
    cancelPhoto()
  }
}

async function recognizeScanner(showInvalid = false) {
  window.clearTimeout(scannerTimer)
  if (closed || source.value !== 'scanner' || scannedRaw.value || uploading.value || tipVisible.value) return
  const raw = scannerText.value.trim()
  if (!parsePasscode(raw)) {
    if (showInvalid) showTip('扫码仪未读取到有效通行码，请重新扫描', false)
    return
  }
  await acceptPasscode(raw)
}

watch(scannerText, () => {
  window.clearTimeout(scannerTimer)
  // 兼容以回车结束或仅连续输入字符的键盘式扫码仪，也支持粘贴完整通行码。
  scannerTimer = window.setTimeout(() => { void recognizeScanner() }, 200)
})

onMounted(async () => {
  await nextTick()
  if (source.value) await selectSource(source.value)
})

onBeforeUnmount(() => {
  closed = true
  uploadController.abort()
  stopScan()
  window.clearTimeout(scannerTimer)
  stopStream()
})
</script>

<template>
  <div class="scan-overlay">
    <div class="scan-dialog" :class="{ 'scan-dialog-compact': source !== 'camera' }" role="dialog" aria-modal="true" :aria-label="!source ? '选择扫码方式' : source === 'camera' ? '扫描通行码' : '扫码仪识别'">
      <div class="scan-titlebar">
        <span class="scan-title">{{ !source ? '选择扫码方式' : source === 'camera' ? '扫描通行码' : '扫码仪识别' }}</span>
        <button type="button" class="scan-x" title="关闭" @click="onClose">×</button>
      </div>

      <div v-if="!source" class="source-options">
        <button type="button" class="source-option" @click="selectSource('camera')">摄像头<span>实时扫描，自动识别</span></button>
        <button type="button" class="source-option" @click="selectSource('scanner')">扫码仪<span>USB／蓝牙扫码仪输入</span></button>
      </div>
      <div v-else-if="source === 'scanner'" class="scanner-body">
        <label for="passcode-scanner-input">请连接扫码仪，将光标保持在下方输入框，扫描后自动识别。</label>
        <textarea id="passcode-scanner-input" ref="scannerInput" v-model="scannerText" aria-label="扫码仪输入" placeholder="等待扫码仪输入，也可粘贴通行码" :disabled="uploading || !!scannedRaw" spellcheck="false" @keydown.enter.prevent="recognizeScanner(true)" />
        <p>支持以键盘方式输入的 USB／蓝牙扫码仪。</p>
      </div>
      <div v-else class="scan-body">
        <div class="scan-stage">
          <video ref="videoRef" class="scan-video" autoplay playsinline muted />
          <div class="scan-frame" aria-hidden="true" />
          <p v-if="uploading" class="scan-hint">正在上传通行码…</p>
          <p v-else-if="scannedRaw" class="scan-hint">已识别通行码，信息已回填</p>
          <p v-else-if="cameraError" class="scan-hint">{{ cameraError }}</p>
          <p v-else-if="cameraStatus === 'opening'" class="scan-hint">正在打开摄像头…</p>
          <p v-else class="scan-hint">将二维码置于框内，自动识别</p>
        </div>
      </div>

      <input ref="photoInput" type="file" accept="image/*" hidden @change="recognizePhoto" @cancel="cancelPhoto" />
      <div v-if="source" class="scan-footer">
        <button v-if="source === 'camera' && cameraStatus === 'error'" type="button" class="btn-secondary" @click="openStream">
          重新打开摄像头
        </button>
        <button v-if="scannedRaw" type="button" class="btn-primary" :disabled="uploading" @click="acceptPasscode(scannedRaw)">
          重试上传
        </button>
        <button
          v-else-if="source === 'camera'"
          type="button"
          class="btn-primary"
          :disabled="uploading || capturing || photoPicking"
          @click="pickPhoto"
        >
          {{ capturing ? '识别中…' : '照片识别' }}
        </button>
        <button v-if="!scannedRaw" type="button" class="btn-secondary" :disabled="uploading || capturing || photoPicking" @click="backToSources">返回选择</button>
        <button type="button" class="btn-secondary" :disabled="uploading" @click="onClose">
          取消
        </button>
      </div>
    </div>

    <QtMessageBox
      v-if="tipVisible"
      title="系统提醒"
      :message="tipMessage"
      :icon="tipOk ? 'info' : 'warning'"
      :buttons="['ok']"
      @ok="onTipClose"
      @close="onTipClose"
    />
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.scan-overlay {
  position: fixed;
  inset: 0;
  z-index: 12000;
  background: rgba(0, 0, 0, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.scan-dialog {
  width: min(640px, 94vw);
  max-height: 92vh;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: linear-gradient(180deg, $gradient-start 0%, $gradient-mid 12%, $gradient-end 100%);
  border: 1px solid $primary;
  border-radius: 8px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.22);
  font-family: 'Microsoft YaHei', 'Segoe UI', sans-serif;
}

.scan-dialog-compact { width: 560px; }
.source-options { display: flex; gap: 20px; padding: 32px 24px; }
.source-option {
  flex: 1;
  padding: 24px 12px;
  border: 1px solid $primary;
  border-radius: 6px;
  background: #fff;
  color: $text-dark;
  font-size: 24px;
  font-weight: 700;
  span { display: block; margin-top: 12px; font-size: 14px; font-weight: 400; }
  &:hover { background: #e9f7f2; }
}
.scanner-body {
  display: grid;
  gap: 14px;
  padding: 24px;
  font-size: 16px;
  textarea { width: 100%; height: 140px; padding: 12px; border: 1px solid $primary; border-radius: 4px; resize: none; font-size: 16px; }
  p { color: #666; font-size: 14px; }
}

.scan-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 42px;
  padding: 0 10px 0 16px;
  flex-shrink: 0;
}

.scan-title {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.12);
}

.scan-x {
  width: 36px;
  height: 32px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #fff;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.18);
  }
}

.scan-body {
  flex: 1;
  min-height: 0;
  padding: 10px 14px 0;
}

.scan-stage {
  position: relative;
  background: #1a1a1a;
  border: 2px solid $border-color;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 280px;
}

.scan-video {
  width: 100%;
  height: min(48vh, 380px);
  object-fit: contain;
  background: #1a1a1a;
}

.scan-frame {
  position: absolute;
  width: min(200px, 42vw);
  height: min(200px, 42vw);
  border: 2px solid $primary;
  border-radius: 6px;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.22);
  pointer-events: none;
}

.scan-hint {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 12px;
  margin: 0;
  text-align: center;
  color: #fff;
  font-size: 14px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.65);
}

.scan-footer {
  display: flex;
  justify-content: center;
  gap: 12px;
  padding: 14px 16px 16px;
  flex-shrink: 0;
}

.btn-primary,
.btn-secondary {
  min-width: 100px;
  height: 36px;
  padding: 0 12px;
  border: none;
  border-radius: 4px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}

.btn-primary {
  background: $accept-green;
  color: #fff;

  &:hover:not(:disabled) {
    background: #047857;
  }
}

.btn-secondary {
  background: #e8e8e8;
  color: $text-dark;
  border: 1px solid #c8c8c8;

  &:hover:not(:disabled) {
    background: #dedede;
  }
}

</style>
