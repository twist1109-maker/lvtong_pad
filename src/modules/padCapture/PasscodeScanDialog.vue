<script setup lang="ts">
/**
 * 通行码扫码 — 对齐安卓 App 扫通行码后立即上传 JSON（仅 passcodeQRCodeInfo）
 * 上传走 /api/mobile/upload/json，主界面仍由 mobile_passcode / mobile_upload 回填。
 */
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import QtMessageBox from '@/components/common/QtMessageBox.vue'
import { useDeviceCamera } from '@/composables/useDeviceCamera'
import {
  decodeQrFromCanvas,
  emptyCaptureJson,
  isPasscodeContentValid,
  photoStamp,
  uploadMobileJson,
} from '@/modules/padCapture/mobileProtocol'

const emit = defineEmits<{ close: [] }>()

const videoRef = ref<HTMLVideoElement | null>(null)
const camera = useDeviceCamera(videoRef)
const { status: cameraStatus, error: cameraError } = camera
const uploading = ref(false)
const capturing = ref(false)
const decoding = ref(false)
const tipVisible = ref(false)
const tipMessage = ref('')
const tipOk = ref(true)

let scanTimer = 0
let closed = false

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
  stopScan()
  stopStream()
  emit('close')
}

async function openStream(): Promise<boolean> {
  if (closed) return false
  const ok = await camera.start()
  if (ok) scheduleScan()
  return ok
}

function scheduleScan() {
  stopScan()
  if (closed || uploading.value || tipVisible.value || cameraStatus.value !== 'ready') return
  scanTimer = window.setTimeout(() => {
    void scanOnce()
  }, 400)
}

async function scanOnce() {
  if (closed || uploading.value || capturing.value || decoding.value || tipVisible.value) return
  decoding.value = true
  try {
    const text = await decodeQrFromCanvas(camera.captureCanvas())
    if (!closed && text) await acceptPasscode(text)
  } catch {
    // 预览首帧尚未到达时继续等待。
  } finally {
    decoding.value = false
    scheduleScan()
  }
}

async function acceptPasscode(raw: string) {
  if (closed || uploading.value) return
  if (!isPasscodeContentValid(raw)) {
    showTip('通行码内容无效', false)
    scheduleScan()
    return
  }
  uploading.value = true
  stopScan()
  const name = `photo_${photoStamp()}.json`
  const json = emptyCaptureJson()
  json.passcodeQRCodeInfo = raw
  let ok = false
  try {
    ok = await uploadMobileJson(name, json)
  } catch {
    ok = false
  } finally {
    uploading.value = false
  }
  if (closed) return
  if (ok) {
    stopStream()
    showTip('通行码信息上传成功 !', true)
  } else {
    showTip('通行码信息上传失败 !', false)
    scheduleScan()
  }
}

function onTipClose() {
  tipVisible.value = false
  if (tipOk.value) onClose()
  else scheduleScan()
}

async function captureCurrentFrame() {
  if (closed || capturing.value || uploading.value || decoding.value) return

  capturing.value = true
  stopScan()
  try {
    const text = await decodeQrFromCanvas(camera.captureCanvas())
    if (closed) return
    if (!text) {
      showTip('当前画面未识别到通行码，请对准后重试', false)
      scheduleScan()
      return
    }
    await acceptPasscode(text)
  } catch (cause) {
    if (!closed) showTip(cause instanceof Error ? cause.message : '拍照识别失败，请重试', false)
  } finally {
    capturing.value = false
  }
}

onMounted(async () => {
  await nextTick()
  await openStream()
})

onBeforeUnmount(() => {
  closed = true
  stopScan()
  stopStream()
})
</script>

<template>
  <div class="scan-overlay" role="dialog" aria-modal="true" aria-label="扫描通行码">
    <div class="scan-dialog">
      <div class="scan-titlebar">
        <span class="scan-title">扫描通行码</span>
        <button type="button" class="scan-x" title="关闭" @click="onClose">×</button>
      </div>

      <div class="scan-body">
        <div class="scan-stage">
          <video ref="videoRef" class="scan-video" autoplay playsinline muted />
          <div class="scan-frame" aria-hidden="true" />
          <p v-if="uploading" class="scan-hint">正在上传通行码…</p>
          <p v-else-if="cameraError" class="scan-hint">{{ cameraError }}</p>
          <p v-else-if="cameraStatus === 'opening'" class="scan-hint">正在打开摄像头…</p>
          <p v-else class="scan-hint">将二维码置于框内，自动识别</p>
        </div>
      </div>

      <div class="scan-footer">
        <button v-if="cameraStatus === 'error'" type="button" class="btn-secondary" @click="openStream">
          重新打开摄像头
        </button>
        <button
          type="button"
          class="btn-primary"
          :disabled="uploading || capturing || decoding || cameraStatus !== 'ready'"
          @click="captureCurrentFrame"
        >
          {{ capturing ? '识别中…' : '直接拍照' }}
        </button>
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
  background: rgba(0, 0, 0, 0.4);
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
  gap: 16px;
  padding: 14px 16px 16px;
  flex-shrink: 0;
}

.btn-primary,
.btn-secondary {
  min-width: 100px;
  height: 36px;
  padding: 0 20px;
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
