<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useDeviceCamera } from '@/composables/useDeviceCamera'

const props = defineProps<{ captureBlocked?: boolean; remaining: number }>()
const emit = defineEmits<{ close: []; photo: [image: string] }>()
const video = ref<HTMLVideoElement | null>(null)
const album = ref<HTMLInputElement | null>(null)
const backButton = ref<HTMLButtonElement | null>(null)
const previousFocus = document.activeElement as HTMLElement | null
const camera = useDeviceCamera(video)
const facing = ref<'user' | 'environment'>('environment')
const error = ref('')
const busy = ref(false)
const latest = ref('')
const added = ref(0)
let disposed = false
const hint = computed(() => error.value || camera.error.value || (props.captureBlocked
  ? '车道占用，已暂停拍照' : camera.status.value === 'opening' ? '正在打开摄像头…' : ''))

async function openCamera(exact = false) {
  error.value = ''
  await camera.start(facing.value, exact)
  // 记录实际方向，避免只有前置镜头的设备第一次翻转仍请求前置。
  const track = (video.value?.srcObject as MediaStream | null)?.getVideoTracks()[0]
  const actual = track?.getSettings().facingMode
  if (actual === 'user' || actual === 'environment') facing.value = actual
}
async function flip() {
  if (busy.value || camera.status.value === 'opening') return
  facing.value = facing.value === 'environment' ? 'user' : 'environment'
  await openCamera(true)
}
function addPhoto(image: string) {
  if (disposed || props.remaining <= 0) return
  latest.value = image
  added.value++
  emit('photo', image)
}
function shoot() {
  if (props.captureBlocked || busy.value || props.remaining <= 0) return
  error.value = ''
  try { addPhoto(camera.captureJpeg()) }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '拍照失败，请重试' }
}
async function selectAlbum(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  busy.value = true
  error.value = ''
  try {
    for (const file of files) {
      if (disposed || props.remaining <= 0) break
      const image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('图片读取失败，请重新选择'))
        reader.readAsDataURL(file)
      })
      // 在加入资料前确认浏览器可解码，防止损坏文件或不支持的格式成为空白图。
      const check = new Image()
      check.src = image
      await check.decode()
      addPhoto(image)
      // 等父组件更新剩余数量，批量选择不能超过图片上限。
      await nextTick()
    }
  } catch { error.value = '图片无法读取，请选择浏览器支持的照片（如 JPG、PNG）' }
  finally { busy.value = false }
}
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.stopImmediatePropagation(); emit('close') }
}
onMounted(() => { backButton.value?.focus(); window.addEventListener('keydown', keydown, true); void openCamera() })
onBeforeUnmount(() => { disposed = true; window.removeEventListener('keydown', keydown, true); previousFocus?.focus() })
</script>

<template>
  <Teleport to="body">
    <section class="local-camera-fullscreen" role="dialog" aria-modal="true" aria-label="本地相机">
      <header>
        <button ref="backButton" type="button" @click="emit('close')">‹ 返回</button>
        <strong>本地相机</strong>
        <span role="status">{{ added ? `已添加 ${added} 张` : '拍摄或从相册选择' }}</span>
        <button type="button" @click="emit('close')">完成</button>
      </header>
      <div class="local-camera-view">
        <video ref="video" autoplay muted playsinline :class="{ mirrored: facing === 'user' }" />
        <div v-if="hint" class="camera-hint" role="status">
          <span>{{ hint }}</span>
          <button v-if="camera.status.value === 'error'" type="button" @click="openCamera()">重试相机</button>
        </div>
      </div>
      <footer>
        <button type="button" aria-label="选择相册" :disabled="busy || remaining <= 0" @click="album?.click()">
          <img v-if="latest" :src="latest" alt="最近添加的照片" />
          <span>选择相册</span>
        </button>
        <button type="button" class="shutter" aria-label="拍照" :disabled="captureBlocked || busy || remaining <= 0 || camera.status.value !== 'ready'" @click="shoot"><span /></button>
        <button type="button" :disabled="busy || camera.status.value === 'opening'" @click="flip">翻转摄像头</button>
      </footer>
      <p class="camera-capacity" role="status">{{ remaining > 0 ? `还可添加 ${remaining} 张` : '已达图片上限，请返回确认或删除照片' }}</p>
      <input ref="album" class="album-input" type="file" accept="image/*" :multiple="remaining > 1" aria-label="选择相册照片" @change="selectAlbum" />
    </section>
  </Teleport>
</template>

<style scoped>
.local-camera-fullscreen { position: fixed; inset: 0; z-index: 30000; display: flex; flex-direction: column; box-sizing: border-box; background: #101414; color: #fff; font: 16px 'Microsoft YaHei', sans-serif; padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }
header { display: flex; align-items: center; gap: 16px; padding: 10px 16px; flex-shrink: 0; }
header strong { font-size: 20px; }
header > span { flex: 1; text-align: right; color: #c6d4d0; }
button { min-height: 48px; border: 1px solid #596b65; border-radius: 10px; padding: 8px 16px; background: #24352f; color: #fff; font: inherit; cursor: pointer; touch-action: manipulation; }
button:disabled { opacity: .45; cursor: default; }
button:focus-visible { outline: 3px solid #8ee1c1; outline-offset: 3px; }
.local-camera-view { position: relative; flex: 1; min-height: 0; overflow: hidden; background: #000; }
video { width: 100%; height: 100%; display: block; object-fit: contain; }
video.mirrored { transform: scaleX(-1); }
.camera-hint { position: absolute; bottom: 12px; left: 12px; right: 12px; display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 12px; padding: 12px; background: #000b; text-align: center; }
footer { display: flex; align-items: center; justify-content: space-evenly; gap: 16px; padding: 14px 16px 6px; flex-shrink: 0; }
footer button { display: flex; align-items: center; gap: 8px; }
footer img { width: 44px; height: 44px; object-fit: cover; border-radius: 6px; }
.shutter { width: 76px; height: 76px; padding: 5px; border: 3px solid #fff; border-radius: 50%; background: transparent; }
.shutter span { width: 100%; height: 100%; border-radius: 50%; background: #fff; }
.camera-capacity { margin: 4px 12px 10px; color: #b3c8bf; text-align: center; font-size: 14px; }
.album-input { display: none; }
@media (max-width: 500px) { header { gap: 8px; padding: 8px; } header > span { font-size: 12px; } button { padding: 8px 10px; font-size: 14px; } footer { gap: 8px; } footer img { width: 30px; height: 30px; } }
@media (max-height: 500px) { header { padding: 4px 12px; } footer { padding: 6px 12px 0; } .shutter { width: 60px; height: 60px; } .camera-capacity { margin: 2px 8px 4px; } }
</style>
