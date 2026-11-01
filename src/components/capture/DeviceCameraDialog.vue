<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useDeviceCamera } from '@/composables/useDeviceCamera'

defineProps<{ title: string }>()
const emit = defineEmits<{ close: []; capture: [image: string] }>()
const videoRef = ref<HTMLVideoElement | null>(null)
const camera = useDeviceCamera(videoRef)
const { status, error } = camera
const shotError = ref('')

function capture() {
  try {
    const image = camera.captureJpeg()
    camera.stop()
    emit('capture', image)
  } catch (cause) {
    shotError.value = cause instanceof Error ? cause.message : '拍照失败，请重试'
  }
}

function close() {
  camera.stop()
  emit('close')
}

onMounted(() => { void camera.start() })
</script>

<template>
  <Teleport to="#app-overlay-root">
    <div class="camera-overlay" @click.self="close">
      <section class="camera-dialog" role="dialog" aria-modal="true" :aria-label="title">
        <header>{{ title }}<button type="button" aria-label="关闭" @click="close">×</button></header>
        <video ref="videoRef" autoplay playsinline muted />
        <p role="status">{{ error || shotError || (status === 'opening' ? '正在打开摄像头…' : '对准证件后点击拍照') }}</p>
        <footer>
          <button v-if="status === 'error'" type="button" @click="camera.start()">重新打开摄像头</button>
          <button type="button" :disabled="status !== 'ready'" @click="capture">拍照</button>
          <button type="button" @click="close">取消</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.camera-overlay { position: fixed; inset: 0; z-index: 13000; background: #0009; display: flex; align-items: center; justify-content: center; padding: 16px; }
.camera-dialog { width: min(800px, 92vw); max-height: 92dvh; overflow: auto; background: #fff; border-radius: 8px; padding: 16px; }
header { display: flex; justify-content: space-between; align-items: center; font-weight: bold; margin-bottom: 12px; }
video { display: block; width: 100%; height: min(56dvh, 500px); object-fit: contain; background: #111; }
p { margin: 12px 0; }
footer { display: flex; justify-content: center; gap: 12px; }
button { padding: 10px 20px; background: #059669; color: white; border: 0; border-radius: 4px; cursor: pointer; }
button:disabled { background: #9ca3af; cursor: default; }
</style>
