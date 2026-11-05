<script setup lang="ts">
/**
 * 预约处理 — 1:1 对齐 Qt OrderDialog.ui / OrderDialog.cpp
 * 右侧：WHEP 看画面（cam4）。Pad 暂不接入对讲硬件。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import RadarImagePanel from './components/RadarImagePanel.vue'
import SlipToggle from './components/SlipToggle.vue'
import { useBookingDialog } from './composables/useBookingDialog'
import type { BookingAcceptPayload } from './types'
import { useWhepPlayer } from '@/composables/useWhepPlayer'
import { TALK_WHEP_URL } from '@/config/liveVideo'

const emit = defineEmits<{
  close: []
  accept: [payload: BookingAcceptPayload]
  reject: []
}>()

const {
  loading,
  submitting,
  radarImageUrl,
  radarFetchFailed,
  linePosition,
  xrayEnabled,
  confirmVisible,
  pendingConfirm,
  errorMessage,
  vehicleTypeIcon,
  vehicleTypeTip,
  xrayLabel,
  xrayLabelClass,
  xrayIcon,
  imgInfoText,
  refreshRadarImage,
  toggleVehicleType,
  requestConfirm,
  cancelConfirm,
  confirmYes,
  initDialog,
} = useBookingDialog()

// ---- 画面：MediaMTX WHEP（cam_booking → /mtx/cam4）----
const liveVideoRef = ref<HTMLVideoElement | null>(null)
const {
  status: videoStatus,
  error: videoError,
  play: playVideo,
  stop: stopVideo,
} = useWhepPlayer()

let videoRetryTimer: number | undefined

const videoHint = computed(() => {
  if (videoError.value) return videoError.value
  if (videoStatus.value === 'connecting') return '连接中…'
  if (videoStatus.value === 'playing') return ''
  if (videoStatus.value === 'failed' || videoStatus.value === 'disconnected') {
    return '连接中断'
  }
  if (videoStatus.value === 'error') return videoError.value || '视频连接失败'
  return '视频对讲区域'
})
const showVideoHint = computed(() => videoStatus.value !== 'playing')

async function startBookingVideo() {
  const el = liveVideoRef.value
  if (!el) return
  try {
    await playVideo({ video: el, whepUrl: TALK_WHEP_URL })
  } catch {
    window.clearTimeout(videoRetryTimer)
    videoRetryTimer = window.setTimeout(() => {
      void startBookingVideo()
    }, 3000)
  }
}

/** 初始化预约会话期间；不把命令提交当作设备正在播放。 */
const sessionInitializing = ref(true)
const talking = ref(false)
const talkHint = computed(() =>
  sessionInitializing.value ? '预约初始化中' : 'Pad 对讲设备暂未接入',
)
const canToggleTalk = computed(() => false)
function toggleTalk() {
  // 预留按钮位置；新对讲硬件到场后接入浏览器原生方案。
}

/** 左侧雷达图是否已在浏览器解码完成 */
const radarImageReady = ref(false)
watch(radarImageUrl, () => {
  radarImageReady.value = false
})

const videoReady = computed(() => videoStatus.value === 'playing')
const radarReady = computed(
  () => !!radarImageUrl.value && radarImageReady.value && !loading.value,
)
/** 受理：视频 + 左侧图就绪（初始化完成即可，不等待语音播放） */
const canAccept = computed(
  () =>
    !sessionInitializing.value &&
    videoReady.value &&
    radarReady.value &&
    !submitting.value,
)
/** 驳回：拉图失败或非加载中即可驳回（避免雷达超时把界面卡死） */
const canReject = computed(
  () =>
    !sessionInitializing.value &&
    !submitting.value &&
    !loading.value &&
    (radarReady.value || radarFetchFailed.value),
)
const decideHint = computed(() => {
  if (submitting.value) return ''
  if (sessionInitializing.value) return '正在初始化预约…'
  if (loading.value) return '正在拉取雷达图（失败会自动重试），请稍候…'
  if (canAccept.value) return ''
  if (radarFetchFailed.value && !radarReady.value) {
    return '雷达图拉取失败：可点刷新重试，或直接驳回'
  }
  const missing: string[] = []
  if (!radarReady.value) missing.push('左侧图')
  if (!videoReady.value) missing.push('视频')
  if (!missing.length) return ''
  return `请等待${missing.join('、')}加载完成后再受理`
})

function onRadarImageLoaded() {
  radarImageReady.value = true
}

function onRadarImageError() {
  radarImageReady.value = false
}

async function handleConfirmYes() {
  try {
    try {
      await stopVideo()
    } catch {
      /* ignore */
    }
    const result = await confirmYes()
    if (result?.kind === 'accept') {
      emit('accept', result.payload)
      emit('close')
    } else if (result?.kind === 'reject') {
      emit('reject')
      emit('close')
    }
  } catch {
    // errorMessage 已写入，保持弹窗打开
  }
}

function onOverlayClick() {
  if (submitting.value || loading.value || sessionInitializing.value) return
  requestConfirm('close')
}

function onRejectClick() {
  if (!canReject.value) return
  requestConfirm('reject')
}

function onAcceptClick() {
  if (!canAccept.value) return
  requestConfirm('accept')
}

onMounted(async () => {
  await nextTick()
  await new Promise<void>((r) => requestAnimationFrame(() => r()))
  // 开窗立刻加载 WHEP 视频。
  void startBookingVideo()
  // /open 提交 step2 组播；雷达图与之并行立刻拉取。
  sessionInitializing.value = true
  try {
    await initDialog({ fetchRadar: true })
  } finally {
    sessionInitializing.value = false
  }
})

onBeforeUnmount(() => {
  window.clearTimeout(videoRetryTimer)
  void stopVideo()
})
</script>

<template>
  <div class="booking-overlay" @click.self="onOverlayClick">
    <div class="booking-dialog" role="dialog" aria-modal="true" @click.stop>
      <h2 class="dialog-title">预约处理</h2>

      <div class="preview-row">
        <RadarImagePanel
          v-model:line-position="linePosition"
          :image-url="radarImageUrl"
          :darkness="0"
          always-show-line
          @loaded="onRadarImageLoaded"
          @error="onRadarImageError"
        />
        <div class="video-panel">
          <video
            ref="liveVideoRef"
            class="live-webrtc"
            muted
            autoplay
            playsinline
          />
          <div
            v-if="showVideoHint"
            class="video-status"
            :class="{ err: videoStatus === 'error' || !!videoError }"
          >
            {{ videoHint }}
          </div>
        </div>
      </div>

      <div class="tool-row">
        <span class="sp sp-40" />
        <button
          type="button"
          class="btn-refresh"
          title="点击刷新雷达图"
          :disabled="loading || submitting"
          @click="() => refreshRadarImage({ maxRetries: 2 })"
        >
          <img src="/assets/img/a_refresh.png" alt="刷新" />
        </button>
        <span class="img-info" :title="imgInfoText">{{ imgInfoText }}</span>
        <span class="warning-text">请认真确认分界线位置，确保安全！</span>
        <button
          type="button"
          class="btn-talk"
          :class="{ on: talking, announcing: sessionInitializing }"
          :disabled="!canToggleTalk"
          :title="talkHint || '对讲'"
          @click="toggleTalk"
        >
          {{ sessionInitializing ? '初始化中' : '对讲暂未接入' }}
        </button>
        <span
          v-if="talkHint && !sessionInitializing"
          class="talk-hint"
        >
          {{ talkHint }}
        </span>
        <span class="sp sp-120" />
        <button type="button" class="btn-hidden" hidden aria-hidden="true" />
        <span class="sp sp-220" />
      </div>

      <p v-if="errorMessage" class="error-tip">{{ errorMessage }}</p>
      <p v-else-if="decideHint" class="decide-hint">{{ decideHint }}</p>

      <div class="bottom-row">
        <span class="sp sp-80" />
        <span class="label-vehicle">车型：</span>
        <button
          type="button"
          class="btn-vehicle"
          :title="vehicleTypeTip"
          :disabled="submitting"
          @click="toggleVehicleType"
        >
          <img :src="vehicleTypeIcon" :alt="vehicleTypeTip" />
        </button>
        <span class="sp sp-100" />

        <div class="xray-group">
          <span class="xray-label" :class="xrayLabelClass">{{ xrayLabel }}</span>
          <img :src="xrayIcon" class="xray-status-icon" alt="" />
          <SlipToggle v-model="xrayEnabled" />
        </div>

        <span class="flex-2" />

        <button
          type="button"
          class="btn-reject"
          :disabled="!canReject"
          :title="canReject ? '驳回' : decideHint || '驳回'"
          @click="onRejectClick"
        >
          <img src="/assets/img/a_dismiss.png" alt="" />
          驳 回
        </button>
        <span class="flex-2" />
        <button
          type="button"
          class="btn-accept"
          :disabled="!canAccept"
          :title="canAccept ? '受理' : decideHint || '受理'"
          @click="onAcceptClick"
        >
          <img src="/assets/img/a_accept.png" alt="" />
          受 理
        </button>
        <span class="sp sp-100" />
      </div>
    </div>

    <ConfirmDialog
      v-if="confirmVisible && pendingConfirm"
      :title="pendingConfirm.title"
      :message="pendingConfirm.message"
      @confirm="handleConfirmYes"
      @cancel="cancelConfirm"
    />

  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.booking-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.booking-dialog {
  width: 1289px;
  height: 560px;
  max-width: 98vw;
  max-height: 96vh;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: 0;
  background: linear-gradient(
    180deg,
    #5fbb9e 0%,
    #f0f9f5 12%,
    #ffffff 100%
  );
  border: 1px solid #5fbb9e;
  font-family: 'Microsoft YaHei', '新宋体', sans-serif;
  overflow: hidden;
}

.dialog-title {
  flex: 0 0 auto;
  min-height: 60px;
  max-height: 66px;
  margin: 8px;
  padding: 10px;
  font-size: 24px;
  font-weight: 700;
  color: #2c3e50;
  text-align: center;
  background: transparent;
  border: none;
  box-sizing: border-box;
}

.preview-row {
  display: flex;
  justify-content: center;
  align-items: stretch;
  gap: 0;
  padding: 0;
  margin: 0;
  flex-shrink: 0;
  background: transparent;
}

.video-panel {
  container-type: size;
  width: 512px;
  height: 256px;
  flex-shrink: 0;
  background: #1a1a1a;
  border: none;
  outline: none;
  box-shadow: none;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
}

.live-webrtc {
  position: absolute;
  left: 50%;
  top: 50%;
  /* 双摄拼接画面整体顺时针旋转；先交换宽高，完整保留两个镜头。 */
  width: 100cqh;
  height: 100cqw;
  max-width: none;
  transform: translate(-50%, -50%) rotate(90deg);
  object-fit: contain;
  background: #1a1a1a;
  z-index: 1;
}

.video-status {
  position: relative;
  z-index: 3;
  color: #999;
  font-size: 16px;
  user-select: none;
  pointer-events: none;

  &.err {
    color: #c0392b;
  }
}

.tool-row {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  padding: 0;
  margin: 28px 0 0;
  min-height: 32px;
}

.btn-talk {
  flex-shrink: 0;
  margin-left: 8px;
  min-width: 72px;
  padding: 4px 10px;
  border: none;
  border-radius: 4px;
  background: #059669;
  color: #ddd;
  font-size: 13px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;

  &.on {
    background: #d97706;
  }

  &.announcing {
    background: #6b7280;
    color: #f3f4f6;
  }

  &:hover:not(:disabled) {
    color: #fff;
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
}

.talk-hint {
  flex-shrink: 0;
  margin-left: 8px;
  font-size: 12px;
  color: #059669;
  white-space: nowrap;

  &.err {
    color: #c0392b;
  }
}

.bottom-row {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  padding: 9px 0;
  margin-top: auto;
}

.sp {
  flex-shrink: 0;
  display: block;
}
.sp-40 {
  width: 40px;
}
.sp-80 {
  width: 80px;
}
.sp-100 {
  width: 100px;
}
.sp-120 {
  width: 120px;
}
.sp-220 {
  width: 220px;
}

.flex-2 {
  flex: 2;
  min-width: 40px;
}

.btn-refresh {
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 2px;
  background: #1677ff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;

  img {
    width: 28px;
    height: 28px;
  }

  &:hover:not(:disabled) {
    background: #40feff;
  }

  &:disabled {
    opacity: 0.6;
    cursor: wait;
  }
}

.img-info {
  flex: 3;
  min-width: 200px;
  font-size: 14.95px;
  color: #666;
  word-break: break-word;
  padding: 0 4px;
}

.warning-text {
  flex: 3;
  font-size: 14px;
  font-weight: 900;
  color: #000;
  font-family: 'Microsoft YaHei', sans-serif;
  white-space: nowrap;
  text-align: left;
}

.error-tip {
  margin: 0 24px;
  font-size: 12px;
  color: #c0392b;
}

.decide-hint {
  margin: 0 24px;
  font-size: 12px;
  color: #b45309;
}

.label-vehicle {
  font-size: 14px;
  color: #2c3e50;
  white-space: nowrap;
}

.btn-vehicle {
  width: 96px;
  height: 60px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  flex-shrink: 0;

  img {
    width: 96px;
    height: 60px;
    object-fit: contain;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.xray-group {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.xray-label {
  max-width: 45px;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;

  &.is-on {
    color: #f00;
  }

  &.is-off {
    color: #999;
  }
}

.xray-status-icon {
  width: 24px;
  height: 24px;
  object-fit: contain;
}

.btn-reject,
.btn-accept {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  max-width: 100px;
  padding: 4px 8px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 700;
  font-family: 'Microsoft YaHei', sans-serif;
  color: #ddd;
  cursor: pointer;
  flex-shrink: 0;

  img {
    width: 20px;
    height: 20px;
  }

  &:hover:not(:disabled) {
    color: #fff;
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
}

.btn-reject {
  background: #ef4444;
}

.btn-accept {
  background: #059669;
}
</style>
