<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useWhepPlayer } from '@/composables/useWhepPlayer'

const props = defineProps<{ label: string; whepUrl: string }>()
const videoRef = ref<HTMLVideoElement | null>(null)
const { status, error, play, stop } = useWhepPlayer()
let retryTimer: number | undefined
let disposed = false

const videoHint = computed(() => {
  if (error.value) return error.value
  if (status.value === 'connecting') return '连接中…'
  if (status.value === 'failed' || status.value === 'disconnected') return '连接中断，正在重试…'
  return `${props.label}画面`
})

function retry() {
  if (disposed || retryTimer !== undefined) return
  retryTimer = window.setTimeout(() => {
    retryTimer = undefined
    void startVideo()
  }, 3000)
}

async function startVideo() {
  if (!videoRef.value || disposed) return
  try {
    await play({ video: videoRef.value, whepUrl: props.whepUrl })
  } catch {
    retry()
  }
}

watch(status, value => {
  if (value === 'failed' || value === 'disconnected' || value === 'error') retry()
  else if (value === 'playing') {
    window.clearTimeout(retryTimer)
    retryTimer = undefined
  }
})

onMounted(() => void startVideo())
onBeforeUnmount(() => {
  disposed = true
  window.clearTimeout(retryTimer)
  void stop()
})
</script>

<template>
  <section class="perimeter-camera" :aria-label="label">
    <h3>{{ label }}</h3>
    <div class="video-panel">
      <video ref="videoRef" :aria-label="`${label}视频`" muted autoplay playsinline />
      <div v-if="status !== 'playing'" class="video-status" :class="{ err: !!error }">
        {{ videoHint }}
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.perimeter-camera {
  min-width: 0;
  border: 1px solid #b9ddd1;
  background: #f0f9f5;

  h3 { margin: 0; padding: 10px; color: #2c3e50; font-size: 18px; }
}

.video-panel {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #000;

  video { width: 100%; height: 100%; object-fit: contain; }
}

.video-status {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  color: #aaa;
  overflow-wrap: anywhere;

  &.err { color: #ef8b82; }
}
</style>
