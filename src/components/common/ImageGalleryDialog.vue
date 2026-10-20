<script setup lang="ts">
/**
 * 大图列表查看器 — 历史记录 / 提交确认双击缩略图打开
 * 支持左右切换、缩略图条、滚轮缩放、拖拽平移、Esc / 点击遮罩关闭
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

export type GalleryItem = {
  label: string
  src: string
}

const props = withDefaults(
  defineProps<{
    items: GalleryItem[]
    startIndex?: number
  }>(),
  { startIndex: 0 },
)

const emit = defineEmits<{ close: [] }>()

const index = ref(0)
const scale = ref(1)
const offsetX = ref(0)
const offsetY = ref(0)

const dragging = ref(false)
const dragStartX = ref(0)
const dragStartY = ref(0)
const originX = ref(0)
const originY = ref(0)

watch(
  () => [props.startIndex, props.items.length] as const,
  () => {
    const n = props.items.length
    if (n <= 0) {
      index.value = 0
      return
    }
    const s = Number(props.startIndex) || 0
    index.value = Math.min(Math.max(0, s), n - 1)
    resetView()
  },
  { immediate: true },
)

watch(index, () => resetView())

const current = computed(() => props.items[index.value] || null)
const canPrev = computed(() => index.value > 0)
const canNext = computed(() => index.value < props.items.length - 1)

const imgStyle = computed(() => ({
  transform: `translate(${offsetX.value}px, ${offsetY.value}px) scale(${scale.value})`,
  transition: dragging.value ? 'none' : 'transform 0.12s ease',
  cursor: scale.value > 1 ? (dragging.value ? 'grabbing' : 'grab') : 'default',
}))

function resetView() {
  scale.value = 1
  offsetX.value = 0
  offsetY.value = 0
  dragging.value = false
}

function goPrev() {
  if (canPrev.value) index.value -= 1
}

function goNext() {
  if (canNext.value) index.value += 1
}

function zoomIn() {
  scale.value = Math.min(5, Number((scale.value + 0.15).toFixed(2)))
}

function zoomOut() {
  const next = Math.max(0.3, Number((scale.value - 0.15).toFixed(2)))
  scale.value = next
  if (next <= 1) {
    offsetX.value = 0
    offsetY.value = 0
  }
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  if (e.deltaY < 0) zoomIn()
  else zoomOut()
}

function onPointerDown(e: PointerEvent) {
  if (scale.value <= 1) return
  // 只响应左键
  if (e.button !== 0) return
  dragging.value = true
  dragStartX.value = e.clientX
  dragStartY.value = e.clientY
  originX.value = offsetX.value
  originY.value = offsetY.value
  ;(e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId)
}

function onPointerMove(e: PointerEvent) {
  if (!dragging.value) return
  offsetX.value = originX.value + (e.clientX - dragStartX.value)
  offsetY.value = originY.value + (e.clientY - dragStartY.value)
}

function onPointerUp(e: PointerEvent) {
  if (!dragging.value) return
  dragging.value = false
  try {
    ;(e.currentTarget as HTMLElement | null)?.releasePointerCapture?.(e.pointerId)
  } catch {
    /* ignore */
  }
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
  else if (e.key === 'ArrowLeft') goPrev()
  else if (e.key === 'ArrowRight') goNext()
  else if (e.key === '+' || e.key === '=') zoomIn()
  else if (e.key === '-') zoomOut()
  else if (e.key === '0') resetView()
}

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div class="gallery-overlay" @click.self="emit('close')">
      <div class="gallery-dialog" role="dialog" aria-modal="true" @click.stop>
        <div class="gallery-titlebar">
          <span class="gallery-title">
            {{ current?.label || '大图' }}
            <template v-if="items.length">
              （{{ index + 1 }} / {{ items.length }}）
            </template>
            <span class="zoom-tip">
              滚轮缩放 {{ Math.round(scale * 100) }}%
              <template v-if="scale > 1"> · 按住拖动</template>
            </span>
          </span>
          <button type="button" class="gallery-close" title="关闭" @click="emit('close')">×</button>
        </div>

        <div class="gallery-stage" @wheel.prevent="onWheel">
          <button
            type="button"
            class="nav-btn prev"
            :disabled="!canPrev"
            title="上一张"
            @click="goPrev"
          >
            ‹
          </button>
          <div
            class="gallery-main"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="onPointerUp"
            @lostpointercapture="dragging = false"
          >
            <img
              v-if="current"
              :src="current.src"
              :alt="current.label"
              :style="imgStyle"
              draggable="false"
            />
            <div v-else class="gallery-empty">暂无图片</div>
          </div>
          <button
            type="button"
            class="nav-btn next"
            :disabled="!canNext"
            title="下一张"
            @click="goNext"
          >
            ›
          </button>
        </div>

        <div v-if="items.length" class="gallery-strip">
          <button
            v-for="(it, i) in items"
            :key="`${it.label}-${i}`"
            type="button"
            class="strip-item"
            :class="{ active: i === index }"
            :title="it.label"
            @click="index = i"
          >
            <img :src="it.src" :alt="it.label" />
            <span class="strip-label">{{ it.label }}</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.gallery-overlay {
  position: fixed;
  inset: 0;
  z-index: 20000;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.gallery-dialog {
  width: min(1100px, 96vw);
  height: min(860px, 94vh);
  background: #f5f7f6;
  border: 1px solid #29734b;
  border-radius: 4px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.gallery-titlebar {
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  background: linear-gradient(180deg, #3a9b63 0%, #29734b 100%);
  color: #fff;
}

.gallery-title {
  font-size: 14px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.zoom-tip {
  font-size: 12px;
  font-weight: 500;
  opacity: 0.9;
}

.gallery-close {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: #fff;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  border-radius: 2px;
  &:hover {
    background: rgba(255, 255, 255, 0.18);
  }
}

.gallery-stage {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 48px 1fr 48px;
  align-items: center;
  gap: 4px;
  padding: 10px 6px;
  background: #1a1a1a;
}

.gallery-main {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  touch-action: none;

  img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    display: block;
  }
}

.gallery-empty {
  color: #aaa;
  font-size: 14px;
}

.nav-btn {
  height: 64px;
  border: none;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  font-size: 36px;
  cursor: pointer;
  border-radius: 4px;
  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.22);
  }
  &:disabled {
    opacity: 0.25;
    cursor: default;
  }
}

.gallery-strip {
  flex-shrink: 0;
  height: 108px;
  display: flex;
  gap: 8px;
  padding: 8px 10px;
  overflow-x: auto;
  background: #e8eee9;
  border-top: 1px solid #c5d5c9;
}

.strip-item {
  flex: 0 0 auto;
  width: 96px;
  border: 2px solid transparent;
  border-radius: 3px;
  background: #fff;
  padding: 2px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;

  &.active {
    border-color: #29734b;
  }

  img {
    width: 100%;
    height: 64px;
    object-fit: contain;
    background: #111;
    display: block;
  }
}

.strip-label {
  font-size: 11px;
  color: #333;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
