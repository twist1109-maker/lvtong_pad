<script setup lang="ts">
/**
 * 预约处理 — 1:1 对齐 Qt OrderDialog.ui / OrderDialog.cpp
 * 右侧：WHEP 看画面（cam4）+ 复用 Dashboard 海康长连接只做对讲（HWND 屏外）
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import RadarImagePanel from './components/RadarImagePanel.vue'
import SlipToggle from './components/SlipToggle.vue'
import { useBookingDialog } from './composables/useBookingDialog'
import type { BookingAcceptPayload } from './types'
import { useWhepPlayer } from '@/composables/useWhepPlayer'
import { getHikCapturePlayer } from '@/composables/hikCaptureContext'
import { TALK_WHEP_URL } from '@/config/liveVideo'
import {
  DEFAULT_GUN_DEVICE_ID,
  TALK_CAMERA_DEVICE_ID,
} from '@/config/hikvision'

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

// ---- 对讲：复用 Dashboard 长连接宿主，避免双 iframe 抢插件/TwoWayAudio ----
const hik = getHikCapturePlayer()
const {
  status: talkStatus,
  statusText: talkStatusText,
  talking,
  talkBusy,
  hide: hideHikTalk,
  hidePluginOverlay,
  setTalkOnly,
  ensureDevice: ensureTalkDevice,
  stopTalk,
  startTalk,
  toggleTalk,
} = hik

/** 后端 /booking/open 阻塞播 step2 期间 */
const announcePlaying = ref(true)

const talkHint = computed(() => {
  if (announcePlaying.value) return '播报中'
  if (talkBusy.value) return talking.value ? '对讲连接中…' : '正在停止对讲…'
  if (talking.value) return '对讲中'
  if (talkStatus.value === 'error') return talkStatusText.value || '对讲失败'
  if (talkStatus.value === 'loading') return '对讲连接中…'
  if (talkStatus.value === 'playing') return '可对讲'
  return ''
})
const canToggleTalk = computed(
  () =>
    !announcePlaying.value &&
    !talkBusy.value &&
    (talkStatus.value === 'playing' || talking.value),
)

/** 左侧雷达图是否已在浏览器解码完成 */
const radarImageReady = ref(false)
watch(radarImageUrl, () => {
  radarImageReady.value = false
})

const videoReady = computed(() => videoStatus.value === 'playing')
const talkReady = computed(() => talkStatus.value === 'playing' || talking.value)
const radarReady = computed(
  () => !!radarImageUrl.value && radarImageReady.value && !loading.value,
)
/** 受理：视频 + 左侧图就绪（播报完成后即可，不强制对讲已开） */
const canAccept = computed(
  () =>
    !announcePlaying.value &&
    videoReady.value &&
    radarReady.value &&
    !submitting.value,
)
/** 驳回：拉图失败或非加载中即可驳回（避免雷达超时把界面卡死） */
const canReject = computed(
  () =>
    !announcePlaying.value &&
    !submitting.value &&
    !loading.value &&
    (radarReady.value || radarFetchFailed.value),
)
const decideHint = computed(() => {
  if (submitting.value) return ''
  if (announcePlaying.value) return '播报中，结束后自动开启对讲'
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

async function releaseBookingTalk() {
  try {
    stopTalk()
  } catch {
    /* ignore */
  }
  setTalkOnly(false)
  try {
    await ensureTalkDevice(DEFAULT_GUN_DEVICE_ID)
  } catch {
    /* ignore */
  }
  hideHikTalk()
}

async function handleConfirmYes() {
  try {
    try {
      await stopVideo()
    } catch {
      /* ignore */
    }
    await releaseBookingTalk()
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
  if (submitting.value || loading.value || announcePlaying.value) return
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

watch(confirmVisible, (visible) => {
  if (visible) hidePluginOverlay()
})

onMounted(async () => {
  await nextTick()
  await new Promise<void>((r) => requestAnimationFrame(() => r()))
  setTalkOnly(true)
  hideHikTalk()
  // 1) 开窗立刻：WHEP 视频（不占 TwoWayAudio）
  void startBookingVideo()
  try {
    stopTalk()
  } catch {
    /* ignore */
  }
  // 2) 切到预约机（长连接已预热，仅 hik-switch）
  void ensureTalkDevice(TALK_CAMERA_DEVICE_ID)
  // 3) /open 等 step2；雷达图与之并行立刻拉取
  announcePlaying.value = true
  try {
    await initDialog({ fetchRadar: true })
  } finally {
    announcePlaying.value = false
  }
  // 4) 播报结束、后端 release TwoWayAudio 后再开对讲
  void (async () => {
    for (let i = 0; i < 80; i++) {
      if (talkStatus.value === 'playing') break
      await new Promise<void>((r) => window.setTimeout(r, 100))
    }
    await new Promise<void>((r) => window.setTimeout(r, 450))
    await startTalk()
  })()
})

onBeforeUnmount(() => {
  window.clearTimeout(videoRetryTimer)
  void stopVideo()
  void releaseBookingTalk()
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
          :class="{ on: talking, announcing: announcePlaying }"
          :disabled="!canToggleTalk"
          :title="talkHint || '对讲'"
          @click="toggleTalk"
        >
          {{ announcePlaying ? '播报中' : talking ? '停止对讲' : '对讲' }}
        </button>
        <span
          v-if="talkHint && !announcePlaying"
          class="talk-hint"
          :class="{ err: talkStatus === 'error' }"
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
  inset: 0;
  width: 100%;
  height: 100%;
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
