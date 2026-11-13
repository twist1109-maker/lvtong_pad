<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useDeviceCamera } from '@/composables/useDeviceCamera'

const props = defineProps<{ captureBlocked?: boolean; remaining: number }>()
const emit = defineEmits<{ close: []; photo: [image: string]; error: [message: string] }>()
const visible = ref(false)
const systemCapture = ref<HTMLInputElement | null>(null)
const mobilePicker = ref<HTMLInputElement | null>(null)
const mobilePending = ref(false)
const preferSystemCamera = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const mode = ref<'system' | 'web'>(preferSystemCamera ? 'system' : 'web')
const viewport = ref({ width: window.innerWidth, height: window.innerHeight, left: 0, top: 0 })
const viewportStyle = computed(() => ({ width: `${viewport.value.width}px`, height: `${viewport.value.height}px`, left: `${viewport.value.left}px`, top: `${viewport.value.top}px` }))
function resizeViewport() {
  const v = window.visualViewport
  viewport.value = { width: v?.width ?? window.innerWidth, height: v?.height ?? window.innerHeight, left: v?.offsetLeft ?? 0, top: v?.offsetTop ?? 0 }
}
const video = ref<HTMLVideoElement | null>(null)
const album = ref<HTMLInputElement | null>(null)
const backButton = ref<HTMLButtonElement | null>(null)
let previousFocus: HTMLElement | null = null
let session = 0
let blockedVersion = 0
let captureBlockedVersion = 0
watch(() => props.captureBlocked, blocked => { if (blocked) blockedVersion++ }, { flush: 'sync' })
const camera = useDeviceCamera(video)
const facing = ref<'user' | 'environment'>('environment')
const error = ref('')
watch(error, message => { if (message && !visible.value) emit('error', message) })
const busy = ref(false)
const latest = ref('')
const added = ref(0)
let disposed = false
const hint = computed(() => error.value || (mode.value === 'web' ? camera.error.value : '') || (props.captureBlocked
  ? '车道占用，已暂停拍照' : mode.value === 'web' && camera.status.value === 'opening' ? '正在打开摄像头…' : ''))

async function openCamera(exact = false) {
  if (!visible.value || mode.value !== 'web') return
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
  if (disposed || (!visible.value && !mobilePending.value) || props.remaining <= 0) return
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
  const fromCamera = input === systemCapture.value || input === mobilePicker.value
  const request = session
  const files = Array.from(input.files || [])
  input.value = ''
  if (!files.length) { mobilePending.value = false; return }
  busy.value = true
  error.value = ''
  try {
    for (const file of files) {
      if (disposed || (!visible.value && !mobilePending.value) || request !== session || props.remaining <= 0) break
      if (fromCamera && (props.captureBlocked || captureBlockedVersion !== blockedVersion)) { error.value = '车道占用，已丢弃本次拍照'; break }
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
      if (disposed || (!visible.value && !mobilePending.value) || request !== session) break
      if (fromCamera && (props.captureBlocked || captureBlockedVersion !== blockedVersion)) { error.value = '车道占用，已丢弃本次拍照'; break }
      addPhoto(image)
      // 等父组件更新剩余数量，批量选择不能超过图片上限。
      await nextTick()
    }
  } catch { if (request === session) error.value = '图片无法读取，请选择浏览器支持的照片（如 JPG、PNG）' }
  finally {
    if (request === session) {
      busy.value = false
      mobilePending.value = false
    }
  }
}
function close() {
  session++
  visible.value = false
  mobilePending.value = false
  camera.stop()
  busy.value = false
  previousFocus?.focus()
  emit('close')
}
function requestSystemCapture() {
  if (!visible.value || busy.value || props.remaining <= 0) return
  if (props.captureBlocked) { error.value = '车道占用，已暂停拍照'; return }
  mode.value = 'system'
  camera.stop()
  error.value = ''
  captureBlockedVersion = blockedVersion
  // 必须在真实点击的同步调用栈里触发，await/挂载后再click会丢失移动端用户激活。
  systemCapture.value?.click()
}
function open(fromClick = false) {
  if (busy.value) return
  session++
  previousFocus = document.activeElement as HTMLElement | null
  visible.value = !preferSystemCamera
  mode.value = preferSystemCamera ? 'system' : 'web'
  added.value = 0
  latest.value = ''
  error.value = ''
  busy.value = false
  mobilePending.value = false
  if (preferSystemCamera) {
    // 移动端仅调用系统来源选择器，不渲染网页相机或中转页。
    // 不带capture且单选，让系统保留拍照与相册两种来源。
    if (fromClick && props.remaining > 0) {
      mobilePending.value = true
      captureBlockedVersion = blockedVersion
      if (props.captureBlocked) album.value?.click()
      else mobilePicker.value?.click()
    }
    return
  }
  resizeViewport()
  if (mode.value === 'system' && fromClick) requestSystemCapture()
  void nextTick().then(() => {
    if (!visible.value) return
    if (!(fromClick && mode.value === 'system')) backButton.value?.focus()
    if (mode.value === 'web') void openCamera()
  })
}
async function useWebCamera() {
  if (busy.value) return
  mode.value = 'web'
  error.value = ''
  await nextTick()
  await openCamera()
}
function keydown(event: KeyboardEvent) {
  if (visible.value && event.key === 'Escape') { event.stopImmediatePropagation(); close() }
}
onMounted(() => {
  window.addEventListener('keydown', keydown, true)
  window.addEventListener('resize', resizeViewport)
  window.visualViewport?.addEventListener('resize', resizeViewport)
  window.visualViewport?.addEventListener('scroll', resizeViewport)
})
onBeforeUnmount(() => {
  disposed = true
  session++
  window.removeEventListener('keydown', keydown, true)
  window.removeEventListener('resize', resizeViewport)
  window.visualViewport?.removeEventListener('resize', resizeViewport)
  window.visualViewport?.removeEventListener('scroll', resizeViewport)
})
defineExpose({ open, close })
</script>

<template>
  <Teleport to="body">
    <section v-if="visible" class="local-camera-fullscreen" :style="viewportStyle" role="dialog" aria-modal="true" aria-label="本地相机">
      <header>
        <button ref="backButton" type="button" @click="close">返回</button>
        <strong>本地相机</strong>
        <button type="button" @click="close">完成</button>
      </header>
      <div v-if="mode === 'system'" class="native-camera-content">
        <div class="native-photo">
          <img v-if="latest" :src="latest" alt="最近添加的照片" />
          <div v-else class="native-empty">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M8 5l2-2h4l2 2h4v15H4V5z"/><circle cx="12" cy="12" r="4"/></svg>
            <strong>使用系统相机拍摄</strong>
            <span>拍摄确认后，照片自动添加到本次资料</span>
          </div>
        </div>
        <p v-if="hint" class="native-message" role="status">{{ hint }}</p>
        <div class="native-actions">
          <button type="button" class="primary" :disabled="captureBlocked || busy || remaining <= 0" @click="requestSystemCapture">{{ latest ? '继续拍摄' : '打开系统相机' }}</button>
          <button type="button" :disabled="busy || remaining <= 0" @click="album?.click()">选择相册</button>
          <button type="button" class="text-button" :disabled="busy" @click="useWebCamera">使用网页相机</button>
        </div>
      </div>
      <template v-else>
        <div class="local-camera-view">
          <video ref="video" autoplay muted playsinline :class="{ mirrored: facing === 'user' }" />
          <div v-if="hint" class="camera-hint" role="status">
            <span>{{ hint }}</span>
            <button v-if="camera.status.value === 'error'" type="button" @click="openCamera()">重试相机</button>
          </div>
        </div>
        <div class="web-alternatives">
          <button type="button" :disabled="captureBlocked || busy || remaining <= 0" @click="requestSystemCapture">系统拍照</button>
        </div>
        <footer>
          <button type="button" aria-label="选择相册" :disabled="busy || remaining <= 0" @click="album?.click()">相册</button>
          <button type="button" class="shutter" aria-label="拍照" :disabled="captureBlocked || busy || remaining <= 0 || camera.status.value !== 'ready'" @click="shoot"><span /></button>
          <button type="button" :disabled="busy || camera.status.value === 'opening'" @click="flip">翻转</button>
        </footer>
      </template>
      <p class="camera-capacity" role="status">{{ busy ? '正在添加照片…' : remaining > 0 ? `${added ? `已添加 ${added} 张 · ` : ''}还可添加 ${remaining} 张` : '已达图片上限，请返回确认或删除照片' }}</p>
    </section>
    <!-- 两个入口分开：系统拍摄指定后置镜头；相册入口不带capture，以保留系统相册。 -->
    <input ref="systemCapture" class="local-camera-file" type="file" accept="image/*" capture="environment" aria-label="系统相机拍照" @change="selectAlbum" />
    <input ref="mobilePicker" class="local-camera-file" type="file" accept="image/*" aria-label="拍照或选择相册" @change="selectAlbum" @cancel="mobilePending = false" />
    <input ref="album" class="local-camera-file" type="file" accept="image/*" :multiple="remaining > 1" aria-label="选择相册照片" @change="selectAlbum" @cancel="mobilePending = false" />
  </Teleport>
</template>

<style scoped>
.local-camera-fullscreen { position: fixed; z-index: 30000; display: flex; flex-direction: column; box-sizing: border-box; overflow: hidden; background: #101414; color: #fff; font: 16px/1.4 'Microsoft YaHei', sans-serif; -webkit-text-size-adjust: none; text-size-adjust: none; padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }
header { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 8px 12px; flex-shrink: 0; }
header strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: center; font-size: 18px; }
button { min-height: 44px; flex-shrink: 0; border: 1px solid #596b65; border-radius: 10px; padding: 8px 16px; background: #24352f; color: #fff; font: inherit; white-space: nowrap; cursor: pointer; touch-action: manipulation; }
button:disabled { opacity: .45; cursor: default; }
button:focus-visible { outline: 3px solid #8ee1c1; outline-offset: 3px; }
.local-camera-view { position: relative; flex: 1; min-height: 0; overflow: hidden; background: #000; }
video { width: 100%; height: 100%; display: block; object-fit: contain; }
video.mirrored { transform: scaleX(-1); }
.camera-hint { position: absolute; bottom: 12px; left: 12px; right: 12px; display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 12px; padding: 12px; background: #000b; text-align: center; }
.web-alternatives { display: flex; justify-content: center; padding: 6px 8px 0; }
.web-alternatives button { min-height: 36px; padding: 4px 12px; font-size: 14px; }
footer { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; justify-items: center; gap: 12px; padding: 10px 12px 4px; flex-shrink: 0; }
.shutter { width: 68px; height: 68px; padding: 5px; border: 3px solid #fff; border-radius: 50%; background: transparent; }
.shutter span { display: block; width: 100%; height: 100%; border-radius: 50%; background: #fff; }
.camera-capacity { flex-shrink: 0; margin: 4px 12px 8px; color: #b3c8bf; text-align: center; font-size: 13px; }
.local-camera-file { display: none; }
.native-camera-content { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 8px 16px; gap: 12px; }
.native-photo { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; border-radius: 12px; background: #080b0a; }
.native-photo > img { width: 100%; height: 100%; object-fit: contain; }
.native-empty { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 16px; text-align: center; color: #b9d3c8; }
.native-empty > strong { font-size: 20px; color: #fff; }
.native-empty > span { font-size: 14px; }
.native-message { font-size: 14px; text-align: center; }
.native-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; flex-shrink: 0; }
.primary { background: #187f61; border-color: #6bc4a5; }
.text-button { grid-column: 1 / -1; background: transparent; border-color: transparent; font-size: 14px; color: #b9d3c8; }
@media (max-height: 450px) { header { padding: 4px 12px; } footer { padding: 4px 12px 0; } .shutter { width: 52px; height: 52px; } .native-camera-content { flex-direction: row; padding: 4px 12px; } .native-actions { width: 220px; align-content: center; } .native-message { align-self: center; } .native-empty svg { display: none; } .camera-capacity { margin-bottom: 4px; } }
</style>
