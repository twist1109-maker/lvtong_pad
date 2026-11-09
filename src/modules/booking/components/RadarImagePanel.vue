<script setup lang="ts">
/**
 * 雷达来车图 + 可拖分界红线 — 对齐 Qt ImageLabelWithLine
 * 面板透明无边框，对话框绿渐变透过
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { MANUAL_SCALE_METERS } from '../utils/bookingMath'

const props = defineProps<{
  imageUrl?: string | null
  linePosition: number
  darkness?: number
  alwaysShowLine?: boolean
  manualScale?: boolean
}>()

const emit = defineEmits<{
  'update:linePosition': [value: number]
  loaded: []
  error: []
}>()

const dragging = ref(false)
const panelRef = ref<HTMLElement | null>(null)
const stageRef = ref<HTMLElement | null>(null)
const naturalSize = ref({ width: 0, height: 0 })
const panelSize = ref({ width: 0, height: 0 })
let observer: ResizeObserver | undefined

// 红线坐标以实际图片区域为准；不同点云宽高比下留白不能参与米/像素换算。
const stageStyle = computed(() => {
  const image = naturalSize.value
  const panel = panelSize.value
  if (props.manualScale || !image.width || !image.height || !panel.width || !panel.height) return {}
  const scale = Math.min(panel.width / image.width, panel.height / image.height)
  return { width: `${image.width * scale}px`, height: `${image.height * scale}px` }
})

onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    if (entry) panelSize.value = { width: entry.contentRect.width, height: entry.contentRect.height }
  })
  if (panelRef.value) observer.observe(panelRef.value)
})
onUnmounted(() => observer?.disconnect())

const linePercent = computed(() => `${props.linePosition * 100}%`)
const showLine = computed(() => props.alwaysShowLine || !!props.imageUrl)
const maskOpacity = computed(() => (props.darkness ?? 0) / 255)

function clampPosition(clientX: number) {
  const el = stageRef.value
  if (!el) return props.linePosition
  const rect = el.getBoundingClientRect()
  if (rect.width <= 0) return props.linePosition
  return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
}

function onPointerDown(e: PointerEvent) {
  if (!showLine.value) return
  const el = panelRef.value
  if (!el) return
  const rect = stageRef.value?.getBoundingClientRect()
  if (!rect || e.clientY < rect.top || e.clientY > rect.bottom) return
  const lineX = rect.width * props.linePosition
  if (Math.abs(e.clientX - rect.left - lineX) <= 10) {
    dragging.value = true
    el.setPointerCapture(e.pointerId)
  }
}

function onPointerMove(e: PointerEvent) {
  if (!dragging.value) return
  emit('update:linePosition', clampPosition(e.clientX))
}

function onPointerUp(e: PointerEvent) {
  if (!dragging.value) return
  dragging.value = false
  if (panelRef.value?.hasPointerCapture(e.pointerId)) {
    panelRef.value.releasePointerCapture(e.pointerId)
  }
}

watch(
  () => props.imageUrl,
  () => {
    dragging.value = false
    naturalSize.value = { width: 0, height: 0 }
  },
)

function onImageLoad(event: Event) {
  const image = event.target as HTMLImageElement
  naturalSize.value = { width: image.naturalWidth, height: image.naturalHeight }
  emit('loaded')
}

function onImageError() {
  emit('error')
}
</script>

<template>
  <div
    ref="panelRef"
    class="radar-panel"
    :class="{ 'is-dragging': dragging, 'has-line': showLine }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <div ref="stageRef" class="radar-stage" :style="stageStyle">
    <img
      v-if="imageUrl"
      v-show="!manualScale"
      :src="imageUrl"
      class="radar-image"
      alt="雷达来车图"
      @load="onImageLoad"
      @error="onImageError"
    />
    <span v-if="manualScale" class="radar-placeholder">无雷达图，可拖动红线估算车头长度</span>
    <span v-else-if="!imageUrl" class="radar-placeholder">雷达测量来车信息区域</span>

    <div v-if="manualScale" class="manual-ruler" aria-label="车头长度参考刻度，单位米">
      <span v-for="meter in MANUAL_SCALE_METERS + 1" :key="meter" class="ruler-tick" :style="{ left: `${(meter - 1) / MANUAL_SCALE_METERS * 100}%` }">
        <span>{{ meter - 1 }}m</span>
      </span>
    </div>

    <template v-if="showLine">
      <div
        v-if="maskOpacity > 0"
        class="radar-mask"
        :style="{ width: linePercent, opacity: maskOpacity }"
      />
      <div class="radar-line" :style="{ left: linePercent }" />
    </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.radar-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  width: 512px;
  height: 256px;
  flex-shrink: 0;
  background: transparent;
  border: none;
  outline: none;
  box-shadow: none;
  overflow: hidden;
  cursor: default;
  user-select: none;

  &.has-line {
    cursor: col-resize;
  }

  &.is-dragging {
    cursor: grabbing;
  }
}

.radar-stage {
  position: relative;
  width: 100%;
  height: 100%;
  flex-shrink: 0;
  touch-action: none;
}

.radar-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  pointer-events: none;
}

.radar-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666;
  font-size: 16px;
  pointer-events: none;
}

.radar-mask {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: #000;
  pointer-events: none;
}

.manual-ruler {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 18px;
  height: 22px;
  border-top: 1px solid #657c77;
  pointer-events: none;
}
.ruler-tick {
  position: absolute;
  top: -1px;
  height: 8px;
  border-left: 1px solid #657c77;
  span { position: absolute; top: 9px; transform: translateX(-50%); color: #415e56; font-size: 12px; white-space: nowrap; }
  &:first-child span { transform: none; }
  &:last-child span { transform: translateX(-100%); }
}

/* 对齐 ImageLabelWithLine：2px 红线 + 半径 5 白边圆点 */
.radar-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: #ff0000;
  z-index: 2;
  pointer-events: none;

  &::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 10px;
    height: 10px;
    margin: -5px 0 0 -5px;
    border-radius: 50%;
    background: #ff0000;
    border: 1px solid #ffffff;
    box-sizing: border-box;
  }
}
</style>
