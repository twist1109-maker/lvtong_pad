<script setup lang="ts">
/** 周界相机 A 纯视频弹窗：只播放 WHEP，不占用海康对讲通道。 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useWhepPlayer } from '@/composables/useWhepPlayer'
import { SAFE_CAMERA_WHEP_URL } from '@/config/liveVideo'

const emit = defineEmits<{ close: [] }>()
const videoRef = ref<HTMLVideoElement | null>(null)
const { status, error, play, stop } = useWhepPlayer()
let retryTimer: number | undefined
let disposed = false

const videoHint = computed(() => {
  if (error.value) return error.value
  if (status.value === 'connecting') return '连接中…'
  if (status.value === 'playing') return ''
  if (status.value === 'failed' || status.value === 'disconnected') return '连接中断，正在重试…'
  if (status.value === 'error') return '视频连接失败'
  return '周界相机画面'
})

async function startVideo() {
  const video = videoRef.value
  if (!video || disposed) return
  try {
    await play({ video, whepUrl: SAFE_CAMERA_WHEP_URL })
  } catch {
    if (disposed) return
    window.clearTimeout(retryTimer)
    retryTimer = window.setTimeout(() => void startVideo(), 3000)
  }
}

async function close() {
  disposed = true
  window.clearTimeout(retryTimer)
  await stop()
  emit('close')
}

onMounted(async () => {
  await nextTick()
  await startVideo()
})

onBeforeUnmount(() => {
  disposed = true
  window.clearTimeout(retryTimer)
  void stop()
})
</script>

<template>
  <div class="camera-overlay" @click.self="close">
    <div class="camera-dialog" role="dialog" aria-modal="true" aria-label="周界相机 A" @click.stop>
      <h2>周界相机 A</h2>
      <div class="video-panel">
        <video ref="videoRef" muted autoplay playsinline />
        <div v-if="status !== 'playing'" class="video-status" :class="{ err: status === 'error' || !!error }">
          {{ videoHint }}
        </div>
      </div>
      <button type="button" @click="close">关 闭</button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.camera-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 45%);
}

.camera-dialog {
  width: min(840px, 96vw);
  box-sizing: border-box;
  padding: 8px 20px 20px;
  border: 1px solid #5fbb9e;
  background: linear-gradient(180deg, #5fbb9e 0%, #f0f9f5 12%, #fff 100%);
  text-align: center;

  h2 { margin: 10px 0 18px; color: #2c3e50; font-size: 24px; }

  button {
    width: 120px;
    margin-top: 18px;
    padding: 8px 12px;
    border: 0;
    border-radius: 4px;
    background: #ef4444;
    color: #fff;
    font-weight: 700;
  }
}

.video-panel {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  max-height: 65vh;
  background: #000;

  video { width: 100%; height: 100%; object-fit: contain; }
}

.video-status {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #aaa;

  &.err { color: #ef8b82; }
}
</style>
