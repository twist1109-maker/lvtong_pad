<script setup lang="ts">
/**
 * 平板拍照采集板。界面按安卓 App 的槽位和提交流程来。
 * 照片不直接改主界面数据，提交后走现有 /api/mobile/upload/*，
 * 由原来的 mobile_upload / mobile_passcode 回填主界面。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import AgriculturalSelect from '@/components/AgriculturalSelect.vue'
import type { AgriculturalSelection } from '@/components/AgriculturalSelect.vue'
import {
  decodeQrFromCanvas,
  emptyCaptureJson,
  fileToJpeg,
  isPasscodeContentValid,
  passcodeDisplayPlate,
  photoStamp,
  pingMobileHealth,
  uploadMobileImage,
  uploadMobileJson,
  videoToJpeg,
  type CaptureJson,
} from '@/modules/padCapture/mobileProtocol'

const props = defineProps<{ active: boolean }>()
const emit = defineEmits<{ close: [] }>()

type SlotStatus = 'idle' | 'ok' | 'fail'

interface PhotoSlot {
  key: keyof CaptureJson
  label: string
  filePrefix: string
  url: string
  filename: string
  blob: Blob | null
  status: SlotStatus
}

function makeSlots(): PhotoSlot[] {
  const defs: { key: keyof CaptureJson; label: string; filePrefix: string }[] = [
    { key: 'carHeadImg', label: '车头照', filePrefix: 'carHeadImg' },
    { key: 'carBodyImg', label: '车身照', filePrefix: 'carBodyImg' },
    { key: 'carTailImg', label: '车尾照', filePrefix: 'carTailImg' },
    { key: 'goodsImg1', label: '货物照', filePrefix: 'goodsImg1' },
    { key: 'goodsImg2', label: '货物照', filePrefix: 'goodsImg2' },
    { key: 'goodsImg3', label: '货物照', filePrefix: 'goodsImg3' },
    { key: 'evidenceImg_Optional', label: '证据照(选拍)', filePrefix: 'evidenceImg_Optional' },
    { key: 'goodsImg_Chase', label: '货物照(追拍)', filePrefix: 'goodsImg_Chase' },
    { key: 'evidenceImg_Chase', label: '证据照(追拍)', filePrefix: 'evidenceImg_Chase' },
    { key: 'vehicleLicenseImg1', label: '行驶证(主)', filePrefix: 'vehicleLicenseIdImg1' },
    { key: 'vehicleLicenseImg2', label: '行驶证(挂)', filePrefix: 'vehicleLicenseIdImg2' },
  ]
  return defs.map((d) => ({
    ...d,
    url: '',
    filename: '',
    blob: null,
    status: 'idle',
  }))
}

const slots = ref<PhotoSlot[]>(makeSlots())
const phone = ref('')
const plateGc = ref('')
const goods = ref<AgriculturalSelection[]>([])
const passcodeRaw = ref('')
const passcodePlate = ref('')
const passcodeStatus = ref<SlotStatus>('idle')
const online = ref(false)
const serviceText = ref('Web服务连接中......')
const timerText = ref('上传计时(秒):')
const submitText = ref('提交')
const uploading = ref(false)
const retryCount = ref(0)
const dirName = ref('')
const secureCamera = typeof window !== 'undefined' && window.isSecureContext

const agriRef = ref<{ show: (prev?: AgriculturalSelection[]) => void } | null>(null)
const videoRef = ref<HTMLVideoElement | null>(null)
const fileRef = ref<HTMLInputElement | null>(null)

const cameraOpen = ref(false)
const cameraMode = ref<'photo' | 'scan'>('photo')
const cameraSlotKey = ref<keyof CaptureJson | null>(null)
const cameraError = ref('')
let stream: MediaStream | null = null
let scanTimer = 0
let pingTimer = 0
let uploadTimer = 0
let uploadStartedAt = 0
let uploadAbort: AbortController | null = null
let uploadSession = 0

const dialog = ref<{
  message: string
  yesText: string
  noText: string | null
  resolve: (yes: boolean) => void
} | null>(null)

const goodsText = computed(() => goods.value.map((g) => g.varietyName).join('|'))
const pendingSlots = computed(() => slots.value.filter((s) => s.blob && s.status !== 'ok'))
const submitDisabled = computed(() => !online.value || uploading.value)

function ask(message: string, yesText = '是', noText: string | null = '否'): Promise<boolean> {
  return new Promise((resolve) => {
    dialog.value = { message, yesText, noText, resolve }
  })
}

function closeDialog(yes: boolean) {
  const current = dialog.value
  dialog.value = null
  current?.resolve(yes)
}

function slotByKey(key: keyof CaptureJson) {
  return slots.value.find((s) => s.key === key) ?? null
}

function revokeSlot(slot: PhotoSlot) {
  if (slot.url) URL.revokeObjectURL(slot.url)
  slot.url = ''
}

function rememberPhoto(slot: PhotoSlot, blob: Blob) {
  revokeSlot(slot)
  slot.blob = blob
  slot.filename = `${slot.filePrefix}_${photoStamp()}.jpeg`
  slot.url = URL.createObjectURL(blob)
  slot.status = 'idle'
}

function stopStream() {
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
  if (videoRef.value) videoRef.value.srcObject = null
}

function stopScan() {
  if (scanTimer) {
    window.clearTimeout(scanTimer)
    scanTimer = 0
  }
}

function closeCamera() {
  stopScan()
  stopStream()
  cameraOpen.value = false
  cameraSlotKey.value = null
  cameraError.value = ''
}

async function openStream(): Promise<boolean> {
  cameraError.value = ''
  if (!secureCamera || !navigator.mediaDevices?.getUserMedia) {
    cameraError.value = '当前地址不是安全连接，浏览器不能直接打开摄像头。请用系统相机拍照。'
    return false
  }
  try {
    stopStream()
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' } },
    })
    const video = videoRef.value
    if (!video) throw new Error('摄像头画面未就绪')
    video.srcObject = stream
    await video.play()
    return true
  } catch {
    stopStream()
    cameraError.value = '没有摄像头权限，或摄像头被占用。请用系统相机拍照。'
    return false
  }
}

async function openPhoto(slot: PhotoSlot) {
  cameraMode.value = 'photo'
  cameraSlotKey.value = slot.key
  cameraOpen.value = true
  await nextTick()
  const ok = await openStream()
  if (!ok) fileRef.value?.click()
}

async function shoot() {
  const video = videoRef.value
  const key = cameraSlotKey.value
  if (!video || !key) return
  const slot = slotByKey(key)
  if (!slot) return
  try {
    const blob = await videoToJpeg(video)
    rememberPhoto(slot, blob)
    closeCamera()
  } catch (err) {
    cameraError.value = err instanceof Error ? err.message : '拍照失败'
  }
}

function openSystemCamera() {
  fileRef.value?.click()
}

async function onFileChosen(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    if (cameraMode.value === 'scan') {
      const blob = await fileToJpeg(file)
      const text = await decodeBlob(blob)
      closeCamera()
      if (!text) {
        await ask('未识别到通行码', '确定', null)
        return
      }
      await acceptPasscode(text)
      return
    }
    const key = cameraSlotKey.value
    const slot = key ? slotByKey(key) : null
    if (!slot) return
    rememberPhoto(slot, await fileToJpeg(file))
    closeCamera()
  } catch (err) {
    cameraError.value = err instanceof Error ? err.message : '图片无法读取'
  }
}

async function decodeBlob(blob: Blob): Promise<string | null> {
  const url = URL.createObjectURL(blob)
  try {
    const img = await loadImage(url)
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0)
    return decodeQrFromCanvas(canvas)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片无法读取'))
    img.src = url
  })
}

async function scanOnce() {
  const video = videoRef.value
  if (!cameraOpen.value || cameraMode.value !== 'scan' || !video || !video.videoWidth) {
    scheduleScan()
    return
  }
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    scheduleScan()
    return
  }
  ctx.drawImage(video, 0, 0)
  const text = await decodeQrFromCanvas(canvas)
  if (text) {
    closeCamera()
    await acceptPasscode(text)
    return
  }
  scheduleScan()
}

function scheduleScan() {
  if (!cameraOpen.value || cameraMode.value !== 'scan') return
  scanTimer = window.setTimeout(() => {
    void scanOnce()
  }, 400)
}

async function openPasscodeScan() {
  cameraMode.value = 'scan'
  cameraSlotKey.value = null
  cameraOpen.value = true
  await nextTick()
  const ok = await openStream()
  if (ok) scheduleScan()
  else fileRef.value?.click()
}

async function acceptPasscode(raw: string) {
  if (!isPasscodeContentValid(raw)) {
    await ask('通行码内容无效', '确定', null)
    return
  }
  passcodeRaw.value = raw
  passcodePlate.value = passcodeDisplayPlate(raw)
  passcodeStatus.value = 'idle'
  const name = `photo_${photoStamp()}.json`
  const json = emptyCaptureJson()
  json.passcodeQRCodeInfo = raw
  const ok = await uploadMobileJson(name, json)
  passcodeStatus.value = ok ? 'ok' : 'fail'
  await ask(ok ? '通行码信息上传成功 !' : '通行码信息上传失败 !', '确定', null)
}

function openGoods() {
  agriRef.value?.show(goods.value)
}

function onGoodsConfirm(items: AgriculturalSelection[]) {
  goods.value = items
}

function removeGoods(code: string) {
  goods.value = goods.value.filter((g) => g.productCode !== code)
}

function hasAnything(): boolean {
  return (
    slots.value.some((s) => !!s.blob || (s.status === 'ok' && !!s.filename)) ||
    phone.value.trim() !== '' ||
    plateGc.value.trim() !== '' ||
    goodsText.value !== '' ||
    passcodeRaw.value !== ''
  )
}

function clearLocal() {
  for (const slot of slots.value) {
    revokeSlot(slot)
    slot.blob = null
    slot.filename = ''
    slot.status = 'idle'
  }
  phone.value = ''
  plateGc.value = ''
  goods.value = []
  passcodeRaw.value = ''
  passcodePlate.value = ''
  passcodeStatus.value = 'idle'
  dirName.value = ''
  retryCount.value = 0
  submitText.value = '提交'
  timerText.value = '上传计时(秒):'
}

async function onReset() {
  if (uploading.value) return
  const yes = await ask('你确定要重置吗？')
  if (yes) clearLocal()
}

function buildJson(): CaptureJson {
  const json = emptyCaptureJson()
  for (const slot of slots.value) {
    if (slot.status === 'ok' && slot.filename) {
      json[slot.key] = slot.filename
    }
  }
  json.phone = phone.value.trim()
  json.plate_number_gc = plateGc.value.trim()
  json.goods_type = goodsText.value
  return json
}

function stopUploadClock() {
  if (uploadTimer) {
    window.clearInterval(uploadTimer)
    uploadTimer = 0
  }
}

function startUploadClock() {
  stopUploadClock()
  uploadStartedAt = Date.now()
  uploadTimer = window.setInterval(() => {
    const sec = (Date.now() - uploadStartedAt) / 1000
    timerText.value = `上传计时(秒): ${sec.toFixed(2)},(重传次数:${retryCount.value})`
    if (sec >= 60 && uploading.value) {
      uploadAbort?.abort()
    }
  }, 200)
}

async function runUpload(isRetry: boolean) {
  const session = ++uploadSession
  uploading.value = true
  submitText.value = '进度:0%'
  if (!dirName.value) dirName.value = `photo_${photoStamp()}`
  uploadAbort = new AbortController()
  startUploadClock()
  const batch = pendingSlots.value.slice()
  let done = 0
  for (const slot of batch) {
    if (session !== uploadSession) return
    const ok = await uploadMobileImage(dirName.value, slot.filename, slot.blob as Blob, uploadAbort.signal)
    if (session !== uploadSession) return
    if (ok) {
      slot.status = 'ok'
      slot.blob = null
      done += 1
    } else {
      slot.status = 'fail'
    }
    const pct = batch.length === 0 ? 100 : Math.round((done * 100) / batch.length)
    submitText.value = `进度:${pct}%`
  }
  if (session !== uploadSession) return
  const failed = slots.value.filter((s) => s.status === 'fail').length
  if (failed > 0) {
    stopUploadClock()
    uploading.value = false
    submitText.value = '提交'
    const again = await ask(
      `有 ${failed} 张图片上传失败，请检查网络后重新上传。`,
      '重新上传',
      '稍后处理',
    )
    if (again) {
      retryCount.value += 1
      await runUpload(true)
    }
    return
  }
  submitText.value = '上传进度：95%'
  const jsonOk = await uploadMobileJson(
    `${dirName.value}.json`,
    buildJson(),
    uploadAbort.signal,
  )
  if (session !== uploadSession) return
  stopUploadClock()
  uploading.value = false
  submitText.value = '提交'
  if (!jsonOk) {
    await ask(isRetry ? '查验图片补拍上传失败 !' : '查验图片补拍上传失败 !', '确定', null)
    return
  }
  if (passcodeRaw.value) passcodeStatus.value = 'ok'
  await ask('查验图片补拍上传完成 !', '确定', null)
  clearLocal()
}

async function onSubmit() {
  if (uploading.value || !online.value) return
  if (!hasAnything()) {
    await ask('请先补拍图片,或扫描通行码或输入司机号码或选择货物或输入车牌号 !', '确定', null)
    return
  }
  const retry = submitText.value !== '提交'
  const yes = await ask(retry ? '是否重新上传失败项？' : '你确定要提交吗？')
  if (!yes) return
  if (retry) retryCount.value += 1
  await runUpload(retry)
}

async function ping() {
  const ok = await pingMobileHealth()
  online.value = ok
  serviceText.value = ok ? 'Web服务：在线' : 'Web服务：离线'
}

function startPing() {
  void ping()
  if (pingTimer) window.clearInterval(pingTimer)
  pingTimer = window.setInterval(() => {
    void ping()
  }, 2000)
}

function stopPing() {
  if (pingTimer) {
    window.clearInterval(pingTimer)
    pingTimer = 0
  }
}

watch(
  () => props.active,
  (on) => {
    if (on) startPing()
    else {
      stopPing()
      closeCamera()
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  uploadSession += 1
  stopPing()
  stopUploadClock()
  uploadAbort?.abort()
  closeCamera()
  for (const slot of slots.value) revokeSlot(slot)
})
</script>

<template>
  <div class="pad-capture" role="dialog" aria-modal="true" aria-label="平板拍照">
    <header class="pad-capture-head">
      <span v-if="passcodePlate" class="head-plate">{{ passcodePlate }}</span>
      <span v-else>绿通快检移动端采集</span>
      <button type="button" class="head-close" @click="emit('close')">返回检测</button>
    </header>

    <div class="slot-grid">
      <button
        v-for="photo in slots.slice(0, 9)"
        :key="photo.key"
        type="button"
        class="slot"
        @click="openPhoto(photo)"
      >
        <span class="slot-photo">
          <img v-if="photo.url" :src="photo.url" :alt="photo.label" />
          <span v-else class="slot-empty">拍照</span>
        </span>
        <span class="slot-label" :class="photo.status">{{ photo.label }}</span>
      </button>

      <button type="button" class="slot" @click="openPasscodeScan">
        <span class="slot-photo">
          <span class="slot-empty">{{ passcodePlate || '扫码' }}</span>
        </span>
        <span class="slot-label" :class="passcodeStatus">通行码</span>
      </button>

      <button
        v-for="photo in slots.slice(9)"
        :key="photo.key"
        type="button"
        class="slot"
        @click="openPhoto(photo)"
      >
        <span class="slot-photo">
          <img v-if="photo.url" :src="photo.url" :alt="photo.label" />
          <span v-else class="slot-empty">拍照</span>
        </span>
        <span class="slot-label" :class="photo.status">{{ photo.label }}</span>
      </button>
    </div>

    <div class="goods-row">
      <button type="button" class="text-btn" @click="openGoods">选择货物</button>
      <div class="chips">
        <button
          v-for="item in goods"
          :key="item.productCode"
          type="button"
          class="chip"
          @click="removeGoods(item.productCode)"
        >
          {{ item.varietyName }} ×
        </button>
      </div>
    </div>

    <div class="field-row">
      <input v-model="phone" class="field" inputmode="numeric" maxlength="11" placeholder="司机手机号码" />
      <input v-model="plateGc" class="field" placeholder="行驶证（挂）车牌号" />
    </div>

    <div class="action-row">
      <button type="button" class="text-btn grow" :disabled="uploading" @click="onReset">重置</button>
      <button type="button" class="text-btn grow" :disabled="submitDisabled" @click="onSubmit">
        {{ submitText }}
      </button>
    </div>

    <footer class="status-row">
      <span :class="{ off: !online }">{{ serviceText }}</span>
      <span class="timer">{{ timerText }}</span>
    </footer>

    <p v-if="!secureCamera" class="secure-hint">
      现在是 http 打开。拍照会调用系统相机；要在页面里直接预览摄像头，需要用 https 打开这个页面。
    </p>

    <div v-if="cameraOpen" class="camera-layer">
      <video ref="videoRef" class="camera-video" autoplay playsinline muted />
      <p v-if="cameraError" class="camera-error">{{ cameraError }}</p>
      <div class="camera-actions">
        <button type="button" class="text-btn" @click="closeCamera">取消</button>
        <button v-if="cameraMode === 'photo'" type="button" class="text-btn" @click="shoot">拍照</button>
        <button type="button" class="text-btn" @click="openSystemCamera">系统相机</button>
      </div>
      <p v-if="cameraMode === 'scan'" class="scan-tip">请把通行码二维码放进画面</p>
    </div>

    <input
      ref="fileRef"
      type="file"
      accept="image/*"
      capture="environment"
      class="file-hide"
      @change="onFileChosen"
    />

    <AgriculturalSelect ref="agriRef" @confirm="onGoodsConfirm" />

    <div v-if="dialog" class="ask-mask">
      <div class="ask-box" role="alertdialog">
        <p>{{ dialog.message }}</p>
        <div class="ask-actions">
          <button type="button" class="text-btn" @click="closeDialog(true)">{{ dialog.yesText }}</button>
          <button v-if="dialog.noText" type="button" class="text-btn" @click="closeDialog(false)">
            {{ dialog.noText }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.pad-capture {
  position: fixed;
  inset: 0;
  z-index: 12000;
  background: #f4f7f6;
  display: flex;
  flex-direction: column;
  overflow: auto;
  color: #173028;
}

.pad-capture-head {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  min-height: 48px;
  background: #20a063;
  color: #fff;
  font-size: 22px;
  font-weight: 700;
}

.head-close {
  position: absolute;
  right: 8px;
  top: 6px;
  height: 36px;
  padding: 0 12px;
  border: none;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  font-size: 15px;
}

.slot-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  padding: 8px;
}

.slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: none;
  background: transparent;
}

.slot-photo {
  width: 100%;
  height: 92px;
  background: #dfe8e4;
  border: 1px solid #c5d5ce;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.slot-empty {
  color: #6b7c76;
  font-size: 14px;
  padding: 0 6px;
  text-align: center;
}

.slot-label {
  font-size: 15px;
  font-weight: 700;
  color: #222;

  &.ok { color: #20a063; }
  &.fail { color: #e02424; }
}

.goods-row,
.field-row,
.action-row,
.status-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px 8px;
}

.chips {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  flex: 1;
  min-width: 0;
}

.chip {
  flex-shrink: 0;
  height: 32px;
  padding: 0 10px;
  border: 1px solid #20a063;
  border-radius: 16px;
  background: #e8f6ef;
  color: #146b42;
  font-size: 14px;
}

.field {
  flex: 1;
  min-width: 0;
  height: 40px;
  border: 1px solid #c5d5ce;
  border-radius: 4px;
  padding: 0 10px;
  font-size: 16px;
  color: #146b42;
}

.text-btn {
  height: 44px;
  padding: 0 16px;
  border: none;
  border-radius: 4px;
  background: #20a063;
  color: #fff;
  font-size: 18px;
  font-weight: 700;

  &:disabled {
    opacity: 0.45;
  }
}

.grow { flex: 1; }

.status-row {
  color: #8aa;
  font-size: 12px;
  justify-content: space-between;
}

.timer { color: #0a0; }
.off { color: #e02424; }

.secure-hint {
  margin: 0 8px 12px;
  color: #8a5a00;
  font-size: 13px;
}

.camera-layer {
  position: fixed;
  inset: 0;
  z-index: 2;
  background: #000;
  display: flex;
  flex-direction: column;
}

.camera-video {
  flex: 1;
  width: 100%;
  min-height: 0;
  object-fit: contain;
  background: #000;
}

.camera-error,
.scan-tip {
  color: #fff;
  text-align: center;
  padding: 8px 12px;
}

.camera-actions {
  display: flex;
  gap: 8px;
  padding: 12px;
  justify-content: center;
}

.file-hide {
  display: none;
}

.ask-mask {
  position: fixed;
  inset: 0;
  z-index: 3;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
}

.ask-box {
  width: min(420px, 90vw);
  background: #fff;
  border-radius: 8px;
  padding: 18px 16px 12px;

  p {
    margin: 0 0 14px;
    font-size: 16px;
    line-height: 1.5;
  }
}

.ask-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
