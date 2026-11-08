<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useDeviceCamera } from '@/composables/useDeviceCamera'

const props = defineProps<{ title: string; captureBlocked?: boolean }>()
const emit = defineEmits<{ close: []; capture: [image: string] }>()
const videoRef = ref<HTMLVideoElement | null>(null)
const camera = useDeviceCamera(videoRef)
const { status, error } = camera
const shotError = ref('')
const photoInput = ref<HTMLInputElement | null>(null)
const photoPicking = ref(false)

function capture() {
  if (props.captureBlocked) return
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

function pickPhoto() {
  if (photoPicking.value) return
  photoPicking.value = true
  photoInput.value?.click()
}

function cancelPhoto() {
  photoPicking.value = false
}

async function selectPhoto(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return cancelPhoto()

  try {
    const image = new Image()
    const objectUrl = URL.createObjectURL(file)
    try {
      image.src = objectUrl
      await image.decode()
    } finally {
      URL.revokeObjectURL(objectUrl)
    }

    const imageData = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(reader.error || new Error('读取照片失败'))
      reader.readAsDataURL(file)
    })
    if (!imageData) throw new Error('读取照片失败')
    camera.stop()
    emit('capture', imageData)
  } catch (cause) {
    shotError.value = cause instanceof Error ? cause.message : '照片加载失败，请重试'
  } finally {
    cancelPhoto()
  }
}

onMounted(() => { void camera.start() })
</script>

<template>
  <Teleport to="#app-overlay-root">
    <div class="camera-overlay" @click.self="close">
      <section class="camera-dialog" role="dialog" aria-modal="true" :aria-label="title">
        <header>{{ title }}<button type="button" aria-label="关闭" @click="close">×</button></header>
        <video ref="videoRef" autoplay playsinline muted />
        <p role="status">{{ captureBlocked ? '车道占用，已暂停拍照' : error || shotError || (status === 'opening' ? '正在打开摄像头…' : '对准证件后点击拍照') }}</p>
        <footer>
          <button v-if="status === 'error'" type="button" @click="camera.start()">重新打开摄像头</button>
          <button type="button" :disabled="captureBlocked || status !== 'ready'" @click="capture">拍照</button>
          <input ref="photoInput" type="file" accept="image/*" hidden @change="selectPhoto" @cancel="cancelPhoto" />
          <button type="button" class="photo-button" :disabled="photoPicking" @click="pickPhoto">
            {{ photoPicking ? '选择中…' : '选择照片' }}
          </button>
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
.photo-button { background: #16a34a; }
.photo-button:hover:not(:disabled) { background: #15803d; }
button:disabled { background: #9ca3af; cursor: default; }
</style>
