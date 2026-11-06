<script setup lang="ts">
/** 预约海康无插件对讲；视频与音频独立，点击后申请麦克风。 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { TALK_WHEP_URL } from '@/config/liveVideo'
import { useWhepPlayer } from '@/composables/useWhepPlayer'
import { useBrowserTalk } from '@/composables/useBrowserTalk'
const emit = defineEmits<{ close: [] }>()
const liveVideoRef = ref<HTMLVideoElement | null>(null)
const { status: videoStatus, error: videoError, play: playVideo, stop: stopVideo } = useWhepPlayer()
const { talking, busy: talkBusy, hint: talkHint, error: talkError, stop: stopTalk, toggle: toggleTalk } = useBrowserTalk()
let videoRetryTimer: number | undefined
let disposed = false
const videoHint = computed(() => videoError.value || (videoStatus.value === 'connecting' ? '连接中…' : '视频连接中断'))
const showVideoHint = computed(() => videoStatus.value !== 'playing')
async function startTalkVideo() {
  const el = liveVideoRef.value
  if (!el || disposed) return
  try { await playVideo({ video: el, whepUrl: TALK_WHEP_URL }) }
  catch { if (!disposed) videoRetryTimer = window.setTimeout(() => { void startTalkVideo() }, 3000) }
}
function onClose() { stopTalk(); emit('close') }
onMounted(async () => { await nextTick(); void startTalkVideo() })
onBeforeUnmount(() => { disposed = true; window.clearTimeout(videoRetryTimer); void stopVideo() })
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

      <p v-if="talkHint" class="talk-hint" :class="{ err: !!talkError }">{{ talkHint }}</p>
      <div class="bottom-row">
        <button
          type="button"
          class="btn-talk"
          :class="{ on: talking }"
          :title="talkHint || '对讲'"
          @click="toggleTalk"
        >
          {{ talking ? '结束对讲' : talkBusy ? '取消连接' : '开始对讲' }}
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
  container-type: size;
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
  position: absolute;
  left: 50%;
  top: 50%;
  width: 100cqh;
  height: 100cqw;
  max-width: none;
  transform: translate(-50%, -50%) rotate(90deg);
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

.talk-hint { text-align: center; margin: 8px 0 0; color: #059669; }
.talk-hint.err { color: #c0392b; }

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
