<script setup lang="ts">
/**
 * 可视对讲 — 对齐 Qt TalkDialog.ui / TalkDialog.cpp
 * 画面：MediaMTX WHEP cam4（预约机）；对讲：海康插件 talkOnly（对齐 BookingDialog）
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { getHikCapturePlayer } from '@/composables/hikCaptureContext'
import { DEFAULT_GUN_DEVICE_ID, TALK_CAMERA_DEVICE_ID } from '@/config/hikvision'
import { TALK_WHEP_URL } from '@/config/liveVideo'
import { useWhepPlayer } from '@/composables/useWhepPlayer'

const emit = defineEmits<{
  close: []
}>()

const liveVideoRef = ref<HTMLVideoElement | null>(null)

const {
  status: videoStatus,
  error: videoError,
  play: playVideo,
  stop: stopVideo,
} = useWhepPlayer()

let videoRetryTimer: number | undefined

const hik = getHikCapturePlayer()
const {
  status: talkStatus,
  talking,
  talkBusy,
  setTalkOnly,
  ensureDevice,
  hide: hideHik,
  hidePluginOverlay,
  startTalk,
  stopTalk,
  toggleTalk,
} = hik

const videoHint = computed(() => {
  if (videoError.value) return videoError.value
  if (videoStatus.value === 'connecting') return '连接中…'
  if (videoStatus.value === 'playing') return ''
  if (videoStatus.value === 'failed' || videoStatus.value === 'disconnected') {
    return '连接中断'
  }
  if (videoStatus.value === 'error') return videoError.value || '视频连接失败'
  return '视频区域'
})
const showVideoHint = computed(() => videoStatus.value !== 'playing')

const canToggleTalk = computed(
  () =>
    !talkBusy.value &&
    (talkStatus.value === 'playing' || talking.value || videoStatus.value === 'playing'),
)

async function startTalkVideo() {
  const el = liveVideoRef.value
  if (!el) return
  try {
    await playVideo({ video: el, whepUrl: TALK_WHEP_URL })
  } catch {
    window.clearTimeout(videoRetryTimer)
    videoRetryTimer = window.setTimeout(() => {
      void startTalkVideo()
    }, 3000)
  }
}

async function onClose() {
  try {
    stopTalk()
  } catch {
    /* ignore */
  }
  hidePluginOverlay()
  setTalkOnly(true)
  try {
    await ensureDevice(DEFAULT_GUN_DEVICE_ID)
  } catch {
    /* ignore */
  }
  hideHik()
  emit('close')
}

onMounted(async () => {
  await nextTick()
  await new Promise<void>((r) => requestAnimationFrame(() => r()))
  setTalkOnly(true)
  hideHik()
  void startTalkVideo()
  try {
    stopTalk()
  } catch {
    /* ignore */
  }
  void ensureDevice(TALK_CAMERA_DEVICE_ID)
  void (async () => {
    for (let i = 0; i < 80; i++) {
      if (talkStatus.value === 'playing' || videoStatus.value === 'playing') break
      await new Promise<void>((r) => window.setTimeout(r, 100))
    }
    await new Promise<void>((r) => window.setTimeout(r, 300))
    await startTalk()
  })()
})

onBeforeUnmount(() => {
  window.clearTimeout(videoRetryTimer)
  try {
    stopTalk()
  } catch {
    /* ignore */
  }
  hidePluginOverlay()
  setTalkOnly(true)
  void ensureDevice(DEFAULT_GUN_DEVICE_ID)
  hideHik()
  void stopVideo()
})
</script>

<template>
  <div class="talk-overlay" @click.self="onClose">
    <div class="talk-dialog" role="dialog" aria-modal="true" aria-label="可视对讲" @click.stop>
      <h2 class="dialog-title">可视对讲</h2>

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

      <div class="bottom-row">
        <button
          type="button"
          class="btn-talk"
          :class="{ on: talking }"
          :disabled="!canToggleTalk"
          @click="toggleTalk"
        >
          {{ talking ? '停止对讲' : '开始对讲' }}
        </button>
        <button type="button" class="btn-close" @click="onClose">关 闭</button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.talk-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.talk-dialog {
  width: 840px;
  max-width: 98vw;
  max-height: 96vh;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: 0 12px 12px;
  background: linear-gradient(180deg, #5fbb9e 0%, #f0f9f5 12%, #ffffff 100%);
  border: 1px solid #5fbb9e;
  font-family: 'Microsoft YaHei', '新宋体', sans-serif;
  overflow: hidden;
}

.dialog-title {
  flex: 0 0 auto;
  min-height: 50px;
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

.video-panel {
  width: 800px;
  max-width: 100%;
  height: 450px;
  max-height: 55vh;
  margin: 0 auto;
  flex-shrink: 0;
  position: relative;
  background: #1a1a1a;
  overflow: hidden;
}

.live-webrtc {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #1a1a1a;
  display: block;
}

.video-status {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  text-align: center;
  font-size: 16px;
  color: #999;
  pointer-events: none;

  &.err {
    color: #c0392b;
  }
}

.bottom-row {
  display: flex;
  justify-content: center;
  gap: 24px;
  margin-top: 16px;
  padding-bottom: 8px;
}

.btn-talk,
.btn-close {
  min-width: 120px;
  max-width: 120px;
  height: 40px;
  border: none;
  border-radius: 4px;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
}

.btn-talk {
  background: #5fbb9e;
  color: #fff;

  &.on {
    background: #e67e22;
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}

.btn-close {
  background: #e8e8e8;
  color: #333;
}
</style>
