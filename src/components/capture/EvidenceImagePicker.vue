<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import ImageGalleryDialog from '@/components/common/ImageGalleryDialog.vue'
import { cropLoadedImage } from '@/utils/cropPreview'
import type { EvidenceCandidate, EvidenceChoice } from '@/utils/evidenceSelection'

const props = defineProps<{ items: EvidenceCandidate[] }>()
const emit = defineEmits<{ close: []; confirm: [images: EvidenceChoice[]] }>()
const selected = ref(new Set<string>())
const loaded = ref(new Set<string>())
const failed = ref(new Set<string>())
const imageElements = new Map<string, HTMLImageElement>()
const preview = ref<number | null>(null)
const error = ref('')
const dialog = ref<HTMLElement | null>(null)
let previousFocus: HTMLElement | null = null
const selectable = computed(() => props.items.filter(item => !item.alreadyAdded && loaded.value.has(item.src) && !failed.value.has(item.src)))

function toggle(src: string) {
  const next = new Set(selected.value)
  if (next.has(src)) next.delete(src)
  else next.add(src)
  selected.value = next
  error.value = ''
}
function imageLoaded(src: string, event: Event) {
  imageElements.set(src, event.target as HTMLImageElement)
  loaded.value = new Set([...loaded.value, src])
}
function imageFailed(src: string) {
  failed.value = new Set([...failed.value, src])
  const next = new Set(selected.value); next.delete(src); selected.value = next
}
function confirm() {
  const images: EvidenceChoice[] = []
  try {
    for (const item of selectable.value) {
      if (!selected.value.has(item.src)) continue
      let src = item.src
      // 临时图片在已加载时固化，避免选入证据后随缓存过期丢失。
      if (src.startsWith('/api/temp-images/') || src.startsWith('blob:')) {
        const image = imageElements.get(src)
        if (!image) throw new Error('图片尚未加载，请稍后重试')
        src = cropLoadedImage(image, { x1: 0, y1: 0, x2: image.naturalWidth, y2: image.naturalHeight })
      }
      images.push({ source: item.src, src })
    }
    if (images.length) emit('confirm', images)
  } catch (e) { error.value = e instanceof Error ? e.message : '读取图片失败，请重新选择' }
}
function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && preview.value === null) emit('close')
}
onMounted(() => {
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  dialog.value?.focus()
  window.addEventListener('keydown', onKey)
})
onUnmounted(() => { window.removeEventListener('keydown', onKey); if (previousFocus?.isConnected) previousFocus.focus() })
</script>

<template>
  <Teleport to="body">
    <div class="evidence-overlay" @click.self="emit('close')">
      <section ref="dialog" class="evidence-picker" role="dialog" aria-modal="true" aria-label="选择证据照" tabindex="-1">
        <header><strong>选择证据照</strong><button type="button" aria-label="关闭证据照选择" @click="emit('close')">×</button></header>
        <p class="hint">从本次已有图片中选择，确认后追加到证据照。已添加的图片可预览。</p>
        <div class="image-grid">
          <p v-if="!items.length" class="empty" role="status">暂无已有图片，请先拍照或截图。</p>
          <article v-for="(item, index) in items" :key="item.src" class="image-card" :class="{ selected: selected.has(item.src) }">
            <button type="button" class="preview" :aria-label="`预览${item.label}`" :disabled="!loaded.has(item.src) || failed.has(item.src)" @click="preview = index">
              <img :src="item.src" :alt="item.label" @load="imageLoaded(item.src, $event)" @error="imageFailed(item.src)" />
            </button>
            <label>
              <input type="checkbox" :checked="item.alreadyAdded || selected.has(item.src)" :disabled="item.alreadyAdded || !loaded.has(item.src) || failed.has(item.src)" @change="toggle(item.src)" />
              <span>{{ item.label }}</span>
            </label>
            <small v-if="item.alreadyAdded">已添加</small>
            <small v-else-if="failed.has(item.src)" class="error">图片不可用</small>
            <small v-else-if="!loaded.has(item.src)">正在加载…</small>
          </article>
        </div>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <footer>
          <span>已选择 {{ selected.size }} 张</span>
          <button type="button" :disabled="!selectable.length" @click="selected = new Set(selectable.map(item => item.src))">全选可用图片</button>
          <button type="button" @click="emit('close')">取消</button>
          <button type="button" class="confirm" :disabled="!selected.size" @click="confirm">追加到证据照</button>
        </footer>
      </section>
    </div>
    <ImageGalleryDialog v-if="preview !== null" :items="items" :start-index="preview" full-screen @close="preview = null" />
  </Teleport>
</template>

<style scoped>
.evidence-overlay { position: fixed; inset: 0; z-index: 1450; display: flex; align-items: center; justify-content: center; padding: 20px; background: #0008; }
.evidence-picker { width: min(1100px, 96vw); max-height: 92vh; display: flex; flex-direction: column; color: #253b35; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 8px 32px #0004; }
header, footer { display: flex; align-items: center; gap: 12px; padding: 16px 20px; background: #f1f7f4; flex-shrink: 0; }
header { justify-content: space-between; font-size: 20px; }
button { cursor: pointer; font: inherit; border: 1px solid #b7cfc4; border-radius: 6px; background: #fff; color: inherit; padding: 8px 14px; }
button:disabled { cursor: default; opacity: .55; }
.hint { margin: 12px 20px; }
.image-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); grid-auto-rows: max-content; align-content: start; gap: 14px; padding: 4px 20px 20px; overflow: auto; min-height: 150px; }
.image-card { border: 2px solid #dce8e2; border-radius: 8px; overflow: hidden; }
.image-card.selected { border-color: #169c72; background: #eaf9f2; }
.preview { display: block; width: 100%; height: 140px; padding: 0; border: 0; border-radius: 0; background: #f3f5f4; }
.preview img { width: 100%; height: 100%; object-fit: contain; }
label { display: flex; gap: 8px; padding: 10px; cursor: pointer; word-break: break-word; }
input { width: 20px; height: 20px; flex-shrink: 0; accent-color: #169c72; }
small { display: block; margin: 0 10px 8px; }
.empty { grid-column: 1/-1; align-self: center; text-align: center; color: #73877e; }
.error { color: #c83b37; padding: 0 12px; }
footer { flex-wrap: wrap; }
footer span { margin-right: auto; }
.confirm { background: #169c72; color: #fff; border-color: #169c72; }
@media (max-width: 600px) { .evidence-overlay { padding: 8px; } header, footer { padding: 10px; gap: 8px; } .image-grid { padding: 4px 10px 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); } .preview { height: 110px; } }
</style>
