<script setup lang="ts">
/**
 * 图像采集弹窗 — 1:1 对齐 Qt GetPic/Tail/Top/Goods/Evidence (1400×713)
 * - 车顶/车头/车尾：WebRTC cam1；预约相机：WebRTC cam4；截帧拍照
 * - 球机：海康插件 + 云台
 * - 货物/证据才有「图片数量」+「选中删除」（GetGoods/Evidence）；车头/尾/顶无
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  HIK_DISABLED_CAMERAS,
  HIK_ENABLED_CAMERAS,
  isWhepCaptureCamera,
  resolveCameraDeviceId,
} from '@/config/hikvision'
import { resolveCaptureWhepUrl } from '@/config/liveVideo'
import { getHikCapturePlayer } from '@/composables/hikCaptureContext'
import { useWhepPlayer } from '@/composables/useWhepPlayer'

export type CaptureKind = 'head' | 'tail' | 'top' | 'goods' | 'evidence'

const props = defineProps<{
  kind: CaptureKind
  initialImages?: string[]
}>()

const emit = defineEmits<{
  close: []
  confirm: [images: string[]]
}>()

const TITLE_MAP: Record<CaptureKind, string> = {
  head: '车头图片',
  tail: '车尾图片',
  top: '车顶图片',
  goods: '货物图片',
  evidence: '证据照',
}

/** 打开弹窗时默认选中的相机 Tab（货物/证据仍默认车头） */
const DEFAULT_CAMERA: Record<CaptureKind, string> = {
  head: '车头相机',
  tail: '车尾相机',
  top: '车顶相机',
  goods: '车头相机',
  evidence: '车头相机',
}

const MAX_MAP: Partial<Record<CaptureKind, number>> = {
  goods: 16,
  evidence: 8,
}

/** 截图顺序：车顶 → 车头 → 车尾 → 球机 → 预约 */
const CAMERAS = ['车顶相机', '车头相机', '车尾相机', '球机', '预约相机'] as const
const DISABLED_CAMERAS = new Set<string>(HIK_DISABLED_CAMERAS)
const ENABLED_CAMERAS = new Set<string>(HIK_ENABLED_CAMERAS)

const isMulti = computed(() => props.kind === 'goods' || props.kind === 'evidence')
const maxCount = computed(() => MAX_MAP[props.kind] ?? 1)
const thumbW = computed(() => (isMulti.value ? 110 : 200))
const thumbH = 110

const activeCamera = ref(DEFAULT_CAMERA[props.kind])
/** 对齐 switchToCamera：仅球机显示云台 */
const showPtz = computed(() => activeCamera.value === '球机')
/** 枪机三 Tab + 预约相机 → WHEP；球机 → 海康插件 */
const useWhepPreview = computed(() => isWhepCaptureCamera(activeCamera.value))
const switchingCamera = ref(false)

const photos = ref<string[]>([])
const selectedIndex = ref(0)
const fileInputRef = ref<HTMLInputElement | null>(null)
const capturing = ref(false)
const closing = ref(false)
/** 黑色预览锚点：把屏幕坐标发给全屏 iframe，在内部摆插件 */
const liveStageRef = ref<HTMLElement | null>(null)
const whepVideoRef = ref<HTMLVideoElement | null>(null)

const hik = getHikCapturePlayer()
const {
  status: whepStatus,
  error: whepError,
  play: playWhep,
  stop: stopWhep,
} = useWhepPlayer()

const {
  status: hikStatus,
  statusText: hikStatusText,
  currentDeviceId,
  setAnchor,
  setTalkOnly,
  ensureDevice,
  hide: hideHik,
  captureJpegDataUrl,
  postLayout,
  ptzStart,
  ptzStop,
  setPreset,
  goPreset,
} = hik

const liveHint = computed(() => {
  if (useWhepPreview.value) {
    if (whepError.value) return whepError.value
    if (whepStatus.value === 'connecting') return '连接中…'
    if (whepStatus.value === 'playing') return ''
    if (whepStatus.value === 'failed' || whepStatus.value === 'disconnected') {
      return '连接中断，正在重试…'
    }
    if (whepStatus.value === 'error') return whepError.value || '实时视频连接失败'
    return '准备播放…'
  }
  return hikStatusText.value || '实时摄像头画面区域'
})
const showLiveHint = computed(() => {
  if (switchingCamera.value) return false
  if (useWhepPreview.value) return whepStatus.value !== 'playing'
  return hikStatus.value !== 'playing'
})
const previewPlaying = computed(() =>
  useWhepPreview.value ? whepStatus.value === 'playing' : hikStatus.value === 'playing',
)

/** 球机预置位 1-9：本机记住「已设置」状态；真正坐标在摄像机内 */
const PRESET_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const
const presetSetMode = ref(false)
const presetBusy = ref(false)
const presetHint = ref('')
const presetConfigured = ref<Set<number>>(new Set())

function presetStorageKey(deviceId: string) {
  return `gcms_ptz_presets_${deviceId || 'cam_ptz'}`
}

function loadPresetConfigured(deviceId: string) {
  try {
    const raw = localStorage.getItem(presetStorageKey(deviceId))
    const arr = raw ? (JSON.parse(raw) as number[]) : []
    presetConfigured.value = new Set(
      (Array.isArray(arr) ? arr : []).filter((n) => n >= 1 && n <= 9),
    )
  } catch {
    presetConfigured.value = new Set()
  }
}

function savePresetConfigured(deviceId: string) {
  localStorage.setItem(
    presetStorageKey(deviceId),
    JSON.stringify([...presetConfigured.value].sort((a, b) => a - b)),
  )
}

function markPresetConfigured(id: number) {
  const next = new Set(presetConfigured.value)
  next.add(id)
  presetConfigured.value = next
  savePresetConfigured(currentDeviceId.value)
}

async function onPresetClick(id: number) {
  if (!showPtz.value || !previewPlaying.value || presetBusy.value) return
  presetBusy.value = true
  presetHint.value = ''
  try {
    if (presetSetMode.value) {
      await setPreset(id)
      markPresetConfigured(id)
      presetHint.value = `预置位 ${id} 已设置`
      presetSetMode.value = false
    } else {
      await goPreset(id)
      presetHint.value = `已转到预置位 ${id}`
    }
  } catch (e) {
    presetHint.value = e instanceof Error ? e.message : '预置位操作失败'
  } finally {
    presetBusy.value = false
  }
}

function onPresetKeydown(ev: KeyboardEvent) {
  if (!showPtz.value || !previewPlaying.value) return
  if (ev.ctrlKey || ev.altKey || ev.metaKey) return
  const t = ev.target as HTMLElement | null
  if (t) {
    const tag = t.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) {
      return
    }
  }
  // 主键盘与小键盘数字 1-9
  let id = 0
  if (ev.code.startsWith('Digit')) id = Number(ev.code.slice(5))
  else if (ev.code.startsWith('Numpad')) id = Number(ev.code.slice(6))
  if (!(id >= 1 && id <= 9)) return
  ev.preventDefault()
  void onPresetClick(id)
}

const countText = computed(() => {
  if (!isMulti.value) return ''
  return `图片数量: ${photos.value.length}/${maxCount.value}`
})

const selectedSrc = computed(() => {
  if (!photos.value.length) return ''
  const i = Math.min(Math.max(0, selectedIndex.value), photos.value.length - 1)
  return photos.value[i] || ''
})

function isCameraDisabled(name: string) {
  return DISABLED_CAMERAS.has(name) || !ENABLED_CAMERAS.has(name)
}

function syncKind() {
  activeCamera.value = DEFAULT_CAMERA[props.kind]
  photos.value = [...(props.initialImages ?? [])].filter(Boolean)
  selectedIndex.value = 0
}

watch(() => props.kind, syncKind)
watch(
  () => props.initialImages,
  (next, prev) => {
    // 仅内容变化时同步；父组件每次重渲染若给新数组引用，不能把弹窗内新拍清掉
    const a = next ?? []
    const b = prev ?? []
    if (a.length === b.length && a.every((v, i) => v === b[i])) return
    photos.value = [...a].filter(Boolean)
    selectedIndex.value = 0
  },
)

async function startWhepPreview(cameraName: string) {
  hideHik()
  setAnchor(null)
  await nextTick()
  const el = whepVideoRef.value
  if (!el) return
  try {
    await playWhep({ video: el, whepUrl: resolveCaptureWhepUrl(cameraName) })
  } catch {
    /* useWhepPlayer 已写入 error/status */
  }
}

async function startHikPreview(deviceId: string) {
  await stopWhep()
  setTalkOnly(false)
  if (liveStageRef.value) setAnchor(liveStageRef.value)
  await ensureDevice(deviceId)
  window.setTimeout(() => postLayout(true), 120)
}

async function applyPreviewForCamera(name: string) {
  if (isWhepCaptureCamera(name)) {
    await startWhepPreview(name)
    return
  }
  loadPresetConfigured(resolveCameraDeviceId(name))
  await startHikPreview(resolveCameraDeviceId(name))
}

onMounted(async () => {
  syncKind()
  loadPresetConfigured(resolveCameraDeviceId(activeCamera.value))
  window.addEventListener('keydown', onPresetKeydown)
  await nextTick()
  await new Promise<void>((r) => requestAnimationFrame(() => r()))
  // 关闭对讲弹窗后 talkOnlyMode 可能仍为 true，导致 measureAnchor 返回屏外坐标 → 画面空白
  setTalkOnly(false)
  await applyPreviewForCamera(activeCamera.value)
})

function detachPreview() {
  void stopWhep()
  hideHik()
  setAnchor(null)
}

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onPresetKeydown)
  detachPreview()
})

async function selectCamera(name: string) {
  if (isCameraDisabled(name) || switchingCamera.value || closing.value) return
  if (name === activeCamera.value) return

  const prevName = activeCamera.value
  const nextWhep = isWhepCaptureCamera(name)
  const prevWhep = isWhepCaptureCamera(prevName)
  const nextId = resolveCameraDeviceId(name)
  const prevId = currentDeviceId.value
  activeCamera.value = name

  // 同一路 WHEP（如枪机三 Tab）只改高亮；枪机↔预约需换流
  if (
    nextWhep &&
    prevWhep &&
    resolveCaptureWhepUrl(name) === resolveCaptureWhepUrl(prevName)
  ) {
    return
  }
  // 同一物理海康设备只改高亮
  if (!nextWhep && !prevWhep && nextId === prevId) return

  switchingCamera.value = true
  presetSetMode.value = false
  presetHint.value = ''
  try {
    await applyPreviewForCamera(name)
  } finally {
    switchingCamera.value = false
  }
}

/** 海康 PTZ 索引：↖5 ↑1 ↗7 ←3 ↻9 →4 ↙6 ↓2 ↘8 −11 +10 */
function onPtzPointerDown(ev: PointerEvent, index: number) {
  if (!showPtz.value || !previewPlaying.value) return
  const el = ev.currentTarget as HTMLElement
  try {
    el.setPointerCapture(ev.pointerId)
  } catch {
    /* ignore */
  }
  if (index === 9) {
    ptzStart(9)
    return
  }
  ptzStart(index)
}

function onPtzPointerUp(ev: PointerEvent, index: number) {
  if (!showPtz.value) return
  const el = ev.currentTarget as HTMLElement
  try {
    if (el.hasPointerCapture(ev.pointerId)) el.releasePointerCapture(ev.pointerId)
  } catch {
    /* ignore */
  }
  // 自动为点击切换，不在 pointerup 停
  if (index === 9) return
  ptzStop(index)
}

function pushPhoto(url: string) {
  if (isMulti.value) {
    if (photos.value.length >= maxCount.value!) {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url)
      return
    }
    photos.value.push(url)
    selectedIndex.value = photos.value.length - 1
  } else {
    photos.value.push(url)
    selectedIndex.value = photos.value.length - 1
  }
}

function captureFromWhepVideo(): string {
  const video = whepVideoRef.value
  if (!video || !video.videoWidth || !video.videoHeight) {
    throw new Error('画面未就绪')
  }
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法截帧')
  ctx.drawImage(video, 0, 0)
  return canvas.toDataURL('image/jpeg', 0.92)
}

async function onCaptureClick() {
  if (isMulti.value && photos.value.length >= maxCount.value!) return
  capturing.value = true
  try {
    if (useWhepPreview.value && whepStatus.value === 'playing') {
      pushPhoto(captureFromWhepVideo())
      return
    }
    if (!useWhepPreview.value && hikStatus.value === 'playing') {
      try {
        const dataUrl = await captureJpegDataUrl()
        pushPhoto(dataUrl)
        return
      } catch {
        // SDK 抓图失败时回退本地选图，避免阻断现有流程
      }
    }
  } finally {
    capturing.value = false
  }
  fileInputRef.value?.click()
}

function onFileChosen(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const url = URL.createObjectURL(file)
  pushPhoto(url)
}

function selectPhoto(idx: number) {
  selectedIndex.value = idx
}

function onDeleteSelected() {
  if (!isMulti.value || !photos.value.length) return
  const idx = selectedIndex.value
  const [removed] = photos.value.splice(idx, 1)
  if (removed?.startsWith('blob:')) URL.revokeObjectURL(removed)
  selectedIndex.value = Math.min(idx, Math.max(0, photos.value.length - 1))
}

async function closeDialog(after?: () => void) {
  if (closing.value) return
  closing.value = true
  try {
    detachPreview()
  } finally {
    after?.()
    emit('close')
  }
}

async function onConfirm() {
  await closeDialog(() => {
    if (isMulti.value) emit('confirm', [...photos.value])
    else emit('confirm', selectedSrc.value ? [selectedSrc.value] : [])
  })
}

async function onClose() {
  await closeDialog()
}

function openPreview() {
  if (selectedSrc.value) window.open(selectedSrc.value, '_blank')
}
</script>

<template>
  <!-- 必须 Teleport 到 body：父级 ScreenScaler 有 CSS transform，海康原生插件嵌在其中会卡死页面 -->
  <Teleport to="body">
  <div class="cap-overlay" @click.self="onClose">
    <div
      class="cap-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="TITLE_MAP[kind]"
      @click.stop
    >
      <div class="titlebar">
        <img class="title-icon" src="/assets/img/logo.ico" alt="" />
        <span class="title-text">{{ TITLE_MAP[kind] }}</span>
        <button type="button" class="btn-x" title="关闭" :disabled="closing" @click="onClose">
          ×
        </button>
      </div>

      <div class="split">
        <!-- ========== 左栏 ========== -->
        <section class="col col-left">
          <div class="img-stage" @click="openPreview">
            <img v-if="selectedSrc" :src="selectedSrc" class="stage-img" alt="" />
          </div>

          <div class="gallery">
            <div class="gallery-inner">
              <button
                v-for="(src, idx) in photos"
                :key="idx + src.slice(-8)"
                type="button"
                class="thumb"
                :class="{ on: idx === selectedIndex }"
                :style="{ width: thumbW + 'px', height: thumbH + 'px' }"
                @click="selectPhoto(idx)"
              >
                <img :src="src" alt="" />
              </button>
            </div>
          </div>

          <div v-if="isMulti" class="multi-footer">
            <span class="count">{{ countText }}</span>
            <button type="button" class="btn-del" @click="onDeleteSelected">选中删除</button>
          </div>
        </section>

        <!-- ========== 右栏 ========== -->
        <section class="col col-right">
          <div class="cam-row">
            <button
              v-for="cam in CAMERAS"
              :key="cam"
              type="button"
              class="cam-tab"
              :class="{ on: activeCamera === cam, disabled: isCameraDisabled(cam) || switchingCamera }"
              :disabled="isCameraDisabled(cam) || switchingCamera"
              @click="selectCamera(cam)"
            >
              {{ cam }}
            </button>
          </div>

          <div class="live-wrap">
            <div ref="liveStageRef" class="live-stage">
              <!-- WHEP Tab：video；球机：黑区作海康插件锚点 -->
              <video
                v-show="useWhepPreview"
                ref="whepVideoRef"
                class="whep-live"
                muted
                autoplay
                playsinline
              />
            </div>
            <div
              v-if="showLiveHint"
              class="live-status"
              :class="{
                err:
                  (useWhepPreview && (whepStatus === 'error' || !!whepError)) ||
                  (!useWhepPreview && hikStatus === 'error'),
              }"
            >
              {{ liveHint }}
            </div>
          </div>

          <!-- 上下布局：上排 云台 | 预置位；下排 拍照 | 确认 -->
          <div class="bottom-ctrl" :class="{ 'has-ptz': showPtz }">
            <div v-show="showPtz" class="ctrl-top">
              <div class="ptz">
                <div class="ptz-title">360°球机操作云台</div>
                <div class="ptz-body">
                  <div class="ptz-dirs">
                    <button
                      type="button"
                      class="ptz-btn"
                      @pointerdown.prevent="onPtzPointerDown($event, 5)"
                      @pointerup.prevent="onPtzPointerUp($event, 5)"
                      @pointercancel="onPtzPointerUp($event, 5)"
                    >
                      ↖
                    </button>
                    <button
                      type="button"
                      class="ptz-btn"
                      @pointerdown.prevent="onPtzPointerDown($event, 1)"
                      @pointerup.prevent="onPtzPointerUp($event, 1)"
                      @pointercancel="onPtzPointerUp($event, 1)"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      class="ptz-btn"
                      @pointerdown.prevent="onPtzPointerDown($event, 7)"
                      @pointerup.prevent="onPtzPointerUp($event, 7)"
                      @pointercancel="onPtzPointerUp($event, 7)"
                    >
                      ↗
                    </button>
                    <button
                      type="button"
                      class="ptz-btn"
                      @pointerdown.prevent="onPtzPointerDown($event, 3)"
                      @pointerup.prevent="onPtzPointerUp($event, 3)"
                      @pointercancel="onPtzPointerUp($event, 3)"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      class="ptz-btn"
                      title="自动巡航"
                      @click.prevent="ptzStart(9)"
                    >
                      ↻
                    </button>
                    <button
                      type="button"
                      class="ptz-btn"
                      @pointerdown.prevent="onPtzPointerDown($event, 4)"
                      @pointerup.prevent="onPtzPointerUp($event, 4)"
                      @pointercancel="onPtzPointerUp($event, 4)"
                    >
                      →
                    </button>
                    <button
                      type="button"
                      class="ptz-btn"
                      @pointerdown.prevent="onPtzPointerDown($event, 6)"
                      @pointerup.prevent="onPtzPointerUp($event, 6)"
                      @pointercancel="onPtzPointerUp($event, 6)"
                    >
                      ↙
                    </button>
                    <button
                      type="button"
                      class="ptz-btn"
                      @pointerdown.prevent="onPtzPointerDown($event, 2)"
                      @pointerup.prevent="onPtzPointerUp($event, 2)"
                      @pointercancel="onPtzPointerUp($event, 2)"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      class="ptz-btn"
                      @pointerdown.prevent="onPtzPointerDown($event, 8)"
                      @pointerup.prevent="onPtzPointerUp($event, 8)"
                      @pointercancel="onPtzPointerUp($event, 8)"
                    >
                      ↘
                    </button>
                    <button
                      type="button"
                      class="ptz-btn"
                      @pointerdown.prevent="onPtzPointerDown($event, 11)"
                      @pointerup.prevent="onPtzPointerUp($event, 11)"
                      @pointercancel="onPtzPointerUp($event, 11)"
                    >
                      −
                    </button>
                    <button type="button" class="ptz-talk" disabled title="对讲稍后接入">
                      <img src="/assets/img/a_talkstart.png" alt="对讲" />
                    </button>
                    <button
                      type="button"
                      class="ptz-btn"
                      @pointerdown.prevent="onPtzPointerDown($event, 10)"
                      @pointerup.prevent="onPtzPointerUp($event, 10)"
                      @pointercancel="onPtzPointerUp($event, 10)"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              <div class="ptz-presets">
                <div class="ptz-presets-head">
                  <span class="ptz-presets-lab">预置位</span>
                  <button
                    type="button"
                    class="ptz-set-mode"
                    :class="{ on: presetSetMode }"
                    :disabled="!previewPlaying || presetBusy"
                    title="开启后点 1-9 保存当前云台位置"
                    @click="presetSetMode = !presetSetMode"
                  >
                    {{ presetSetMode ? '设置中…点数字保存' : '设置预置位' }}
                  </button>
                </div>
                <div class="ptz-presets-grid">
                  <button
                    v-for="id in PRESET_IDS"
                    :key="id"
                    type="button"
                    class="ptz-preset-btn"
                    :class="{
                      set: presetConfigured.has(id),
                      arm: presetSetMode,
                    }"
                    :disabled="!previewPlaying || presetBusy"
                    :title="
                      presetSetMode
                        ? `将当前位置设为预置位 ${id}`
                        : `转到预置位 ${id}（键盘 ${id}）`
                    "
                    @click="onPresetClick(id)"
                  >
                    {{ id }}
                  </button>
                </div>
                <div v-if="presetHint" class="ptz-preset-hint">{{ presetHint }}</div>
              </div>
            </div>

            <div class="actions">
              <button
                type="button"
                class="btn-shot"
                :disabled="capturing"
                @click="onCaptureClick"
              >
                {{ capturing ? '拍照中…' : '拍照' }}
              </button>
              <button type="button" class="btn-ok" @click="onConfirm">确认选择</button>
            </div>
          </div>
        </section>
      </div>

      <input
        ref="fileInputRef"
        type="file"
        accept="image/*"
        class="file-hide"
        @change="onFileChosen"
      />
    </div>
  </div>
  </Teleport>
</template>

<style scoped lang="scss">
.cap-overlay {
  position: fixed;
  inset: 0;
  /* 高于主界面缩放层，且插件窗口挂在无 transform 的 body 下 */
  z-index: 10000;
  background: rgba(0, 0, 0, 0.32);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 对齐 Qt 1400×713 */
.cap-dialog {
  width: 1400px;
  height: 713px;
  max-width: 98vw;
  max-height: 96vh;
  box-sizing: border-box;
  background: #f2f2f2;
  border: 1px solid #b0b0b0;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.28);
  font-family: 'Microsoft YaHei', 'Segoe UI', sans-serif;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.titlebar {
  height: 28px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 0 4px 0 8px;
  background: linear-gradient(180deg, #ffffff 0%, #ececec 100%);
  border-bottom: 1px solid #d0d0d0;
  user-select: none;
}

.title-icon {
  width: 16px;
  height: 16px;
  margin-right: 6px;
  object-fit: contain;
}

.title-text {
  flex: 1;
  font-size: 12px;
  font-weight: 600;
  color: #222;
}

.btn-x {
  width: 36px;
  height: 24px;
  border: none;
  background: transparent;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  color: #333;
  &:hover {
    background: #e81123;
    color: #fff;
  }
}

.split {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
}

.col {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 10px 12px 12px;
  box-sizing: border-box;
  border-right: 1px solid #d8d8d8;

  &.col-right {
    border-right: none;
  }
}

/* 左侧预览：空态无提示字（对齐截图空白） */
.img-stage {
  flex: 8 1 0;
  min-height: 0;
  background: #e8e8e8;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
  cursor: pointer;
}

.stage-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  background: #ddd;
}

/* 右侧实时区：按 16:9 适配画面，去掉多余黑边（插件一般不拉伸铺满） */
.live-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  justify-content: flex-start;
}

.live-stage {
  flex: 0 1 auto;
  width: 100%;
  aspect-ratio: 16 / 9;
  max-height: 100%;
  /* 与弹窗底色一致，避免画面下方再露一块黑条 */
  background: #f2f2f2;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
}

.whep-live {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #1a1a1a;
}

.hik-plugin-box {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.live-status {
  flex: 0 0 auto;
  min-height: 22px;
  font-size: 13px;
  color: #444;
  line-height: 1.3;
  user-select: none;

  &.err {
    color: #c0392b;
  }
}

.gallery {
  flex: 0 0 120px;
  margin-top: 8px;
  overflow-x: auto;
  overflow-y: hidden;
  background: transparent;
}

.gallery-inner {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 100%;
  min-height: 110px;
}

.thumb {
  flex-shrink: 0;
  padding: 0;
  border: 2px solid transparent;
  background: #ddd;
  cursor: pointer;
  overflow: hidden;
  box-sizing: border-box;

  img {
    width: 100%;
    height: 100%;
    object-fit: fill;
    display: block;
  }

  &.on {
    border: 3px solid #1677ff;
  }
}

.multi-footer {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  margin-top: 10px;
  min-height: 48px;
}

.count {
  flex: 1;
  font-size: 13px;
  color: #333;
}

.btn-del {
  width: 120px;
  height: 48px;
  border: 1px solid #4a9eff;
  background: #fff;
  color: #1677ff;
  font-size: 14px;
  cursor: pointer;
  flex-shrink: 0;
  border-radius: 2px;

  &:hover {
    background: #f0f7ff;
  }
}

/* 相机条 */
.cam-row {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
  margin-bottom: 8px;
}

.cam-tab {
  flex: 1;
  min-width: 0;
  height: 32px;
  border: none;
  border-radius: 4px;
  padding: 0 4px;
  font-size: 14px;
  font-weight: bold;
  color: #fff;
  background: #059669;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    filter: brightness(1.05);
  }

  &.on {
    background: #ff9669;
  }

  &.disabled,
  &:disabled {
    background: #9ca3af;
    color: #eee;
    cursor: not-allowed;
    filter: none;
  }
}

/* 底部：上排 云台|预置位，下排 拍照|确认 */
.bottom-ctrl {
  flex: 0 0 auto;
  margin-top: 18px;
  padding-top: 6px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  min-height: 56px;

  &.has-ptz {
    min-height: 220px;
  }
}

.ctrl-top {
  flex: 1 1 auto;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  gap: 12px;
  min-height: 150px;
  min-width: 0;
}

/* 模拟 Qt QGroupBox：内部横纵 1fr 铺满，对称饱满 */
.ptz {
  flex: 1 1 0;
  position: relative;
  margin: 0;
  padding: 16px 10px 10px;
  border: 1px solid #c8c8c8;
  background: #fafafa;
  box-sizing: border-box;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.ptz-title {
  position: absolute;
  top: -8px;
  left: 12px;
  padding: 0 6px;
  background: #fafafa;
  font-size: 12px;
  color: #333;
  line-height: 1.2;
  pointer-events: none;
}

.ptz-body {
  flex: 1 1 auto;
  display: flex;
  width: 100%;
  min-height: 0;
  box-sizing: border-box;
}

/* 3×4 等分铺满 */
.ptz-dirs {
  flex: 1 1 auto;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: repeat(4, minmax(0, 1fr));
  gap: 6px 10px;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.ptz-btn {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  border: 1px solid #4caf50;
  border-radius: 10px;
  background: #fff;
  color: #222;
  font-size: clamp(14px, 2.2vh, 18px);
  line-height: 1;
  cursor: pointer;
  padding: 0;
  box-sizing: border-box;

  &:hover {
    background: #45a049;
    color: #fff;
  }

  &:active {
    background: #388e3c;
    border: 2px solid #2e7d32;
    color: #fff;
  }
}

/* 对讲图标：落在原「焦距」格 */
.ptz-talk {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  img {
    width: 55%;
    max-width: 36px;
    height: auto;
    aspect-ratio: 1;
    object-fit: contain;
    filter: brightness(0) invert(18%);
  }
}

.ptz-presets {
  flex: 1 1 0;
  min-width: 0;
  margin: 0;
  padding: 10px;
  border: 1px solid #c8c8c8;
  background: #fafafa;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ptz-presets-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex: 0 0 auto;
}

.ptz-presets-lab {
  font-size: 12px;
  color: #64748b;
  font-weight: 600;
}

.ptz-set-mode {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #334155;
  border-radius: 4px;
  font-size: 11px;
  padding: 2px 8px;
  cursor: pointer;
  white-space: nowrap;
  &:hover:not(:disabled) {
    border-color: #f59e0b;
    color: #b45309;
  }
  &.on {
    background: #fff7ed;
    border-color: #f59e0b;
    color: #c2410c;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.ptz-presets-grid {
  flex: 1 1 auto;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: repeat(3, minmax(0, 1fr));
  gap: 6px;
  min-height: 0;
}

.ptz-preset-btn {
  width: 100%;
  height: 100%;
  min-height: 28px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #f8fafc;
  color: #334155;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
  &:hover:not(:disabled) {
    border-color: #22c55e;
    background: #f0fdf4;
  }
  &.set {
    border-color: #22c55e;
    background: #dcfce7;
    color: #166534;
  }
  &.arm {
    border-color: #f59e0b;
    background: #fffbeb;
  }
  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.ptz-preset-hint {
  flex: 0 0 auto;
  font-size: 11px;
  color: #64748b;
  line-height: 1.3;
  min-height: 14px;
}

.actions {
  flex: 0 0 auto;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
  min-width: 0;
  height: 48px;
}

.btn-shot,
.btn-ok {
  flex: 1 1 0;
  height: 48px;
  padding: 0 10px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
}

.btn-shot {
  background: #1677ff;
  color: #fff;
  &:hover:not(:disabled) {
    color: #4096ff;
  }
  &:disabled {
    opacity: 0.7;
    cursor: wait;
  }
}

.btn-ok {
  background: #059669;
  color: #ddd;
  &:hover {
    color: #fff;
  }
}

.file-hide {
  display: none;
}
</style>
