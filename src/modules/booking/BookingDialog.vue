<script setup lang="ts">
/**
 * 预约处理 — 左侧竖屏视频、中间雷达、右侧设置。
 * 左侧竖屏预约视频，中间雷达图，右侧设置；对讲经后端连接预约海康。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import RadarImagePanel from './components/RadarImagePanel.vue'
import SlipToggle from './components/SlipToggle.vue'
import { useBookingDialog } from './composables/useBookingDialog'
import type { BookingAcceptPayload } from './types'
import { useWhepPlayer } from '@/composables/useWhepPlayer'
import { TALK_WHEP_URL } from '@/config/liveVideo'
import { useBrowserTalk } from '@/composables/useBrowserTalk'

const emit = defineEmits<{
  close: []
  accept: [payload: BookingAcceptPayload]
  reject: []
}>()

const {
  loading,
  submitting,
  radarImageUrl,
  manualScale,
  setLinePosition,
  onRadarImageLoaded,
  onRadarImageError,
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
let disposed = false

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
  if (!el || disposed) return
  try {
    await playVideo({ video: el, whepUrl: TALK_WHEP_URL })
  } catch {
    if (disposed) return
    window.clearTimeout(videoRetryTimer)
    videoRetryTimer = window.setTimeout(() => {
      void startBookingVideo()
    }, 3000)
  }
}

const { talking, busy: talkBusy, hint: talkHint, error: talkError,
  speakerMuted, toggleSpeaker, stop: stopTalk, toggle: toggleTalk } = useBrowserTalk()
const canToggleTalk = computed(() => !submitting.value)

/** 媒体加载不限制业务决定；仅正在提交时防止重复操作。 */
const canAccept = computed(() => !submitting.value)
const canReject = computed(() => !submitting.value)
const decideHint = computed(() => manualScale.value
  ? '暂无雷达图：按参考刻度估算车头长度，向右拖动红线增大距离' : '')

async function handleConfirmYes() {
  stopTalk()
  try {
    void stopVideo().catch(() => { /* 视频清理不阻塞受理/驳回 */ })
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
  if (submitting.value) return
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
  await initDialog({ fetchRadar: true })
})

onBeforeUnmount(() => {
  disposed = true
  window.clearTimeout(videoRetryTimer)
  void stopVideo()
})
</script>

<template>
  <div class="booking-overlay" @click.self="onOverlayClick">
    <div class="booking-dialog" role="dialog" aria-modal="true" aria-labelledby="booking-title" @click.stop>
      <h2 id="booking-title" class="dialog-title">预约处理</h2>

      <div class="booking-main">
        <div class="video-panel" aria-label="预约相机画面">
          <video ref="liveVideoRef" class="live-webrtc" muted autoplay playsinline />
          <div v-if="showVideoHint" class="video-status" :class="{ err: videoStatus === 'error' || !!videoError }">
            {{ videoHint }}
          </div>
        </div>

        <div class="radar-area">
          <RadarImagePanel
            :line-position="linePosition"
            @update:line-position="setLinePosition"
            :image-url="radarImageUrl"
            :manual-scale="manualScale"
            :darkness="0"
            always-show-line
            @loaded="onRadarImageLoaded"
            @error="onRadarImageError"
          />
        </div>

        <aside class="settings-column" aria-label="预约设置">
          <div class="xray-group">
            <span class="xray-label" :class="xrayLabelClass">{{ xrayLabel }}</span>
            <img :src="xrayIcon" class="xray-status-icon" alt="" />
            <SlipToggle v-model="xrayEnabled" />
          </div>
          <div class="vehicle-group">
            <span class="label-vehicle">车型：</span>
            <button type="button" class="btn-vehicle" :title="vehicleTypeTip" :disabled="submitting" @click="toggleVehicleType">
              <img :src="vehicleTypeIcon" :alt="vehicleTypeTip" />
            </button>
          </div>
        </aside>

        <div class="radar-meta">
          <div class="radar-toolbar">
            <div class="measurement-info">
              <button type="button" class="btn-refresh" title="点击刷新雷达图" :disabled="loading || submitting" @click="() => refreshRadarImage({ maxRetries: 2 })">
                <img src="/assets/img/a_refresh.png" alt="刷新" />
              </button>
              <span class="img-info" :title="imgInfoText">{{ imgInfoText }}</span>
            </div>
            <span class="warning-text">请认真确认分界线位置，确保安全！</span>
          </div>
          <p v-if="errorMessage" class="error-tip" role="status">{{ errorMessage }}</p>
          <p v-else-if="decideHint" class="decide-hint" role="status">{{ decideHint }}</p>
        </div>

        <div class="booking-actions">
          <div class="voice-controls">
            <div class="voice-buttons">
              <button
                type="button" class="btn-talk"
                :class="{ on: talking, connecting: talkBusy }"
                :disabled="!canToggleTalk"
                :title="talkHint || '开始对讲'"
                :aria-pressed="talking"
                @click="toggleTalk"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                  <rect x="9" y="2" width="6" height="12" rx="3" />
                  <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
                </svg>
                <span>{{ talking ? '结束对讲' : talkBusy ? '取消连接' : '开始对讲' }}</span>
              </button>
              <button
                type="button" class="btn-speaker" :class="{ muted: speakerMuted }"
                :disabled="!talking" :aria-pressed="speakerMuted"
                :title="speakerMuted ? '恢复接收声音' : '静音接收声音'"
                :aria-label="speakerMuted ? '恢复接收声音' : '静音接收声音'"
                @click="toggleSpeaker"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                  <path d="M11 4 6 8H3v8h3l5 4V4Z" stroke-linejoin="round" />
                  <path v-if="!speakerMuted" d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
                  <path v-else d="m16 9 6 6m0-6-6 6" />
                </svg>
              </button>
            </div>
            <p v-if="talkHint" class="talk-hint" :class="{ err: !!talkError }" role="status">{{ talkHint }}</p>
          </div>
          <button type="button" class="btn-reject" :disabled="!canReject" :title="canReject ? '驳回' : decideHint || '驳回'" @click="onRejectClick">
            <img src="/assets/img/a_dismiss.png" alt="" />驳 回
          </button>
          <button type="button" class="btn-accept" :disabled="!canAccept" :title="canAccept ? '受理' : decideHint || '受理'" @click="onAcceptClick">
            <img src="/assets/img/a_accept.png" alt="" />受 理
          </button>
        </div>
      </div>
    </div>

    <ConfirmDialog v-if="confirmVisible && pendingConfirm" :title="pendingConfirm.title" :message="pendingConfirm.message" @confirm="handleConfirmYes" @cancel="cancelConfirm" />
  </div>
</template>

<style scoped lang="scss">
.booking-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, .45);
  z-index: 1000;
}
.booking-dialog {
  width: 1280px;
  height: 660px;
  max-width: 98vw;
  max-height: 96vh;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: 34px 48px 38px;
  background: linear-gradient(180deg, #83bfaf 0%, #eff7f4 18%, #fbfdfc 65%, #fff 100%);
  border: 1px solid #80b6a7;
  box-shadow: 0 12px 40px rgba(0, 0, 0, .18);
  font-family: 'Microsoft YaHei', '新宋体', sans-serif;
  overflow: hidden;
}
.dialog-title {
  flex: 0 0 auto;
  margin: 0 0 28px;
  font-size: 28px;
  line-height: 40px;
  font-weight: 700;
  color: #29454b;
  text-align: left;
}
.booking-main {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 244px minmax(0, 1fr) 224px;
  grid-template-rows: 304px minmax(66px, 1fr) 64px;
  column-gap: 32px;
  row-gap: 16px;
}
.video-panel {
  grid-column: 1;
  grid-row: 1 / 4;
  container-type: size;
  position: relative;
  min-width: 0;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 8px solid #f3f9f6;
  background: #181c1b;
  overflow: hidden;
}
.live-webrtc {
  position: absolute;
  left: 50%;
  top: 50%;
  /* 竖向容器，双摄整体顺时针90°，完整保留画面。 */
  width: 100cqh;
  height: 100cqw;
  max-width: none;
  transform: translate(-50%, -50%) rotate(90deg);
  object-fit: contain;
  background: #181c1b;
}
.video-status { position: relative; padding: 12px; text-align: center; color: #d1d5db; font-size: 14px; pointer-events: none; }
.video-status.err { color: #f5a29d; }
.radar-area { grid-column: 2; grid-row: 1; min-width: 0; min-height: 0; background: #fff; }
.radar-area :deep(.radar-panel) { width: 100%; height: 100%; }
.settings-column { grid-column: 3; grid-row: 1; display: flex; flex-direction: column; justify-content: space-between; align-items: stretch; min-width: 0; }
.xray-group { display: flex; align-items: center; justify-content: center; gap: 9px; min-height: 60px; padding: 0 8px; background: transparent; }
.xray-label { font-size: 15px; font-weight: 700; white-space: nowrap; }
.xray-label.is-on { color: #cb5a46; }
.xray-label.is-off { color: #6b7280; }
.xray-status-icon { width: 28px; height: 28px; object-fit: contain; }
.vehicle-group { display: flex; align-items: flex-end; justify-content: center; gap: 10px; padding: 0 0 10px; }
.label-vehicle { font-size: 16px; line-height: 26px; color: #222; white-space: nowrap; }
.btn-vehicle { padding: 0; width: 144px; height: 90px; border: none; background: transparent; cursor: pointer; }
.btn-vehicle img { width: 100%; height: 100%; object-fit: contain; }
.radar-meta { grid-column: 2; grid-row: 2; min-width: 0; }
.radar-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; }
.measurement-info { display: flex; align-items: center; gap: 8px; min-width: 0; }
.btn-refresh { flex: 0 0 auto; width: 28px; height: 28px; border: none; border-radius: 2px; padding: 0; background: #1677ff; cursor: pointer; }
.btn-refresh img { display: block; width: 100%; height: 100%; }
.img-info { font-size: 14px; color: #303b38; overflow-wrap: anywhere; }
.warning-text { font-size: 14px; line-height: 24px; font-weight: 700; color: #202724; }
.error-tip, .decide-hint { margin: 8px 0 0; font-size: 13px; line-height: 1.5; overflow-wrap: anywhere; }
.error-tip { color: #b83f32; }
.decide-hint { color: #99621d; }
.booking-actions { grid-column: 2 / 4; grid-row: 3; display: grid; grid-template-columns: minmax(0, 1fr) 132px minmax(0, 1fr); align-items: start; gap: 24px; min-width: 0; }
.voice-controls { min-width: 0; }
.voice-buttons { display: flex; align-items: center; gap: 26px; }
.btn-talk, .btn-speaker { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 40px; border: 0; border-radius: 4px; padding: 6px; background: transparent; color: #6c817b; font: inherit; font-size: 13px; cursor: pointer; }
.btn-talk svg, .btn-speaker svg { width: 24px; height: 24px; flex-shrink: 0; }
.btn-talk.on { color: #15825e; background: #e4f3eb; }
.btn-talk.connecting { color: #99621d; }
.btn-speaker.muted { color: #b83f32; }
.talk-hint { margin: 0; font-size: 12px; line-height: 1.4; color: #15825e; overflow-wrap: anywhere; }
.talk-hint.err { color: #b83f32; }
.btn-reject, .btn-accept { display: inline-flex; align-items: center; justify-content: center; gap: 5px; width: 120px; min-height: 36px; margin-top: 3px; padding: 6px 12px; border: none; border-radius: 4px; color: #fff; font: inherit; font-size: 16px; font-weight: 600; cursor: pointer; }
.btn-reject { justify-self: center; background: #db715b; }
.btn-accept { justify-self: end; background: #438d77; }
.btn-reject img, .btn-accept img { width: 20px; height: 20px; }
button:disabled { opacity: .55; cursor: not-allowed; }
button:focus-visible { outline: 2px solid #1677ff; outline-offset: 3px; }
button:hover:not(:disabled) { filter: brightness(1.06); }
/* 直接嵌入小视口时也可容纳；主系统仍由设计画布统一等比缩放。 */
@media (max-width: 760px) {
  .booking-dialog { padding: 22px; }
  .booking-main { grid-template-columns: 190px minmax(0, 1fr) 180px; column-gap: 20px; }
}
</style>
