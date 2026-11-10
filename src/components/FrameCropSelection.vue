<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { selectionPoint, selectionPixels, type SelectionPoint } from '@/modules/bodyRadar/screenshot'

const props = defineProps<{ image: string; sample?: boolean }>()
const emit = defineEmits<{ crop: [image: string]; cancel: []; error: [message: string] }>()
const host = ref<HTMLElement | null>(null)
const imageRef = ref<HTMLImageElement | null>(null)
const start = ref<SelectionPoint | null>(null)
const end = ref<SelectionPoint | null>(null)
const activePointer = ref<number | null>(null)
const box = computed(() => start.value && end.value ? {
  left: `${Math.min(start.value.x, end.value.x) * 100}%`, top: `${Math.min(start.value.y, end.value.y) * 100}%`,
  width: `${Math.abs(start.value.x - end.value.x) * 100}%`, height: `${Math.abs(start.value.y - end.value.y) * 100}%`,
} : null)
function point(event: PointerEvent) { return selectionPoint(event.clientX, event.clientY, host.value!.getBoundingClientRect()) }
function down(event: PointerEvent) {
  if (activePointer.value !== null || event.button !== 0 || !imageRef.value?.complete) return
  activePointer.value = event.pointerId
  start.value = end.value = point(event)
  host.value!.setPointerCapture(event.pointerId)
}
function move(event: PointerEvent) { if (activePointer.value === event.pointerId) end.value = point(event) }
function cancelPointer() {
  if (activePointer.value !== null && host.value?.hasPointerCapture(activePointer.value)) host.value.releasePointerCapture(activePointer.value)
  start.value = end.value = null; activePointer.value = null
}
function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); cancelPointer(); emit('cancel') }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => { window.removeEventListener('keydown', onKey); cancelPointer() })
function up(event: PointerEvent) {
  if (activePointer.value !== event.pointerId || !start.value) return
  end.value = point(event)
  const finish = end.value
  const begin = start.value
  const rect = host.value!.getBoundingClientRect()
  if (host.value!.hasPointerCapture(event.pointerId)) host.value!.releasePointerCapture(event.pointerId)
  cancelPointer()
  // Ignore taps/accidental very small drags; stay in selection mode for another try.
  if (Math.abs(begin.x - finish.x) * rect.width < 8 || Math.abs(begin.y - finish.y) * rect.height < 8) return
  try {
    const source = imageRef.value!
    const crop = selectionPixels(begin, finish, source.naturalWidth, source.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = crop.width; canvas.height = crop.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height)
    if (props.sample) {
      ctx.font = `${Math.max(12, Math.min(24, crop.width / 8))}px sans-serif`
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, Math.min(crop.width, 150), 32)
      ctx.fillStyle = '#9a4e12'; ctx.fillText('示范数据', 5, 24)
    }
    emit('crop', canvas.toDataURL('image/png'))
  } catch { emit('error', '截图失败，请重新框选') }
}
</script>

<template>
  <div ref="host" class="frame-crop-selection" aria-label="框选截图区域" @pointerdown.stop.prevent="down" @pointermove.stop.prevent="move" @pointerup.stop.prevent="up" @pointercancel="cancelPointer">
    <img ref="imageRef" :src="image" alt="待框选的当前画面" draggable="false" @error="emit('error', '截图画面加载失败，请重新截图')" />
    <div v-if="box" class="selection-box" :style="box" />
    <span class="selection-hint">拖动框选截图，松开后放入右侧实时视频</span>
  </div>
</template>

<style scoped>
.frame-crop-selection { position: absolute; inset: 0; z-index: 10; touch-action: none; cursor: crosshair; overflow: hidden; user-select: none; }
.frame-crop-selection img { display: block; width: 100%; height: 100%; pointer-events: none; }
.selection-box { position: absolute; border: 2px solid #e46528; box-sizing: border-box; background: #e4652812; pointer-events: none; }
.selection-hint { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); padding: 5px 9px; background: #ffffffed; color: #42594f; white-space: nowrap; font-size: 13px; pointer-events: none; }
</style>
