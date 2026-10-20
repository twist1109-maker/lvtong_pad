<script setup lang="ts">
/**
 * 农产品信息查询 — 1:1 对齐 Qt AgriculturalProductDialog + ProductCard
 * 尺寸 1370×820，4 列卡片网格，每页 20，多选跨页记忆
 */
import { computed, ref } from 'vue'
import { request } from '@/api/request'
import QtMessageBox from '@/components/common/QtMessageBox.vue'

export interface AgriculturalSelection {
  productCode: string
  varietyName: string
  varietyNamePinYin: string
}

interface Product {
  product_code: string
  variety_name: string
  variety_name_pinyin: string
  product_type: string
  category: string
  aliases?: string[] | string | null
}

/** DB 品种名与 png 文件名不完全一致时的回退 */
const IMG_FALLBACK: Record<string, string> = {
  '木耳（不含干木耳 ）': '木耳',
  '香菇（不含干香菇 ）': '香菇',
  柚: '柚子',
  '桔（橘）': '桔',
  '蜜蜂（转地放蜂）': '蜜蜂',
}

const PRODUCT_TYPES = [
  '全部类型',
  '新鲜蔬菜',
  '新鲜水果',
  '鲜活水产品',
  '活的畜禽',
  '新鲜的肉、蛋、奶',
  '其他',
]

/** 前端兜底排序：与后端一致，防止旧后端/缓存导致混排 */
const TYPE_RANK: Record<string, number> = {
  新鲜蔬菜: 1,
  新鲜水果: 2,
  鲜活水产品: 3,
  活的畜禽: 4,
  '新鲜的肉、蛋、奶': 5,
  其他: 6,
}

function codeRank(code: string): number {
  if (!code) return 9
  const c = code.trim()
  if (c.startsWith('1')) return 1
  if (c.startsWith('2')) return 2
  if (c.startsWith('3')) return 3
  if (c.startsWith('4')) return 4
  if (c.startsWith('5')) return 5
  if (c.startsWith('L') || c.startsWith('l')) return 6
  return 9
}

function sortProducts(list: Product[]): Product[] {
  // 仅按大类重排；同类内保持后端顺序（对齐 Qt ORDER BY id）
  return [...list].sort((a, b) => {
    const ra = Math.min(codeRank(a.product_code), TYPE_RANK[a.product_type] ?? 9)
    const rb = Math.min(codeRank(b.product_code), TYPE_RANK[b.product_type] ?? 9)
    return ra - rb
  })
}

const emit = defineEmits<{
  confirm: [items: AgriculturalSelection[]]
  close: []
}>()

const visible = ref(false)
const loading = ref(false)
const products = ref<Product[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const searchText = ref('')
const productType = ref('全部类型')
/** 跨页选中池 — 对齐 Qt m_selectedPool */
const selectedPool = ref<Map<string, AgriculturalSelection>>(new Map())
const tipVisible = ref(false)
const tipMessage = ref('')

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const statsText = computed(
  () =>
    `已选择 ${selectedPool.value.size} 项 | 共找到 ${total.value} 个农产品 | 当前 ${page.value}/${totalPages.value} 页`,
)

function parseAliases(raw: Product['aliases']): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map(String)
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function imgCandidates(varietyName: string): string[] {
  const stem = varietyName.replace(/[（(].*$/, '').trim()
  const mapped = IMG_FALLBACK[varietyName]
  return [...new Set([varietyName, stem, mapped].filter(Boolean) as string[])]
}

function varietyImgSrc(varietyName: string): string {
  const name = imgCandidates(varietyName)[0]
  return `/assets/variety_img/${encodeURIComponent(name)}.png`
}

function onImgError(e: Event, varietyName: string) {
  const img = e.target as HTMLImageElement
  const tried = Number(img.dataset.try || '0')
  const list = imgCandidates(varietyName)
  if (tried + 1 < list.length) {
    img.dataset.try = String(tried + 1)
    img.src = `/assets/variety_img/${encodeURIComponent(list[tried + 1])}.png`
  } else {
    img.style.visibility = 'hidden'
  }
}

function typeBadgeColor(type: string): string {
  if (type === '新鲜水果') return '#FF9800'
  if (type === '鲜活水产品') return '#2196F3'
  return '#5fbb9e'
}

async function fetchProducts() {
  loading.value = true
  try {
    const params = new URLSearchParams()
    const pt = productType.value === '全部类型' ? '' : productType.value
    if (pt) params.set('product_type', pt)
    const kw = searchText.value.trim()
    if (kw) params.set('keyword', kw)
    params.set('page', String(page.value))
    params.set('page_size', String(pageSize))

    const res = await request<{ items: Product[]; total: number }>(
      `/dict/products?${params.toString()}`,
    )
    if (res.code === 0 && res.data) {
      products.value = sortProducts(res.data.items || [])
      total.value = res.data.total || 0
      const pages = Math.max(1, Math.ceil(total.value / pageSize))
      if (page.value > pages) {
        page.value = pages
      }
    } else {
      products.value = []
      total.value = 0
    }
  } finally {
    loading.value = false
  }
}

function show(prevSelection: AgriculturalSelection[] = []) {
  visible.value = true
  page.value = 1
  searchText.value = ''
  productType.value = '全部类型'
  const map = new Map<string, AgriculturalSelection>()
  for (const item of prevSelection) {
    if (item.productCode) map.set(item.productCode, item)
  }
  selectedPool.value = map
  fetchProducts()
}

function hide() {
  visible.value = false
  emit('close')
}

function toggleCard(p: Product) {
  const code = p.product_code
  const next = new Map(selectedPool.value)
  if (next.has(code)) {
    next.delete(code)
  } else {
    next.set(code, {
      productCode: code,
      varietyName: p.variety_name,
      varietyNamePinYin: p.variety_name_pinyin || '',
    })
  }
  selectedPool.value = next
}

function onSearch() {
  page.value = 1
  fetchProducts()
}

function onClear() {
  searchText.value = ''
  productType.value = '全部类型'
  selectedPool.value = new Map()
  page.value = 1
  fetchProducts()
}

function onTypeChange() {
  page.value = 1
  fetchProducts()
}

function onPrev() {
  if (page.value > 1) {
    page.value -= 1
    fetchProducts()
  }
}

function onNext() {
  if (page.value < totalPages.value) {
    page.value += 1
    fetchProducts()
  }
}

function confirmSelection() {
  if (selectedPool.value.size === 0) {
    tipMessage.value = '请至少选择一个农产品'
    tipVisible.value = true
    return
  }
  emit('confirm', Array.from(selectedPool.value.values()))
  visible.value = false
}

defineExpose({ show })
</script>

<template>
  <div v-if="visible" class="overlay" @click.self="hide">
    <div class="dialog" role="dialog" aria-label="农产品信息查询">
      <div class="title-bar">
        <span class="title">农产品信息查询</span>
        <button type="button" class="btn-x" title="关闭" @click="hide">×</button>
      </div>

      <div class="body">
        <fieldset class="filter-box">
          <legend>搜索筛选</legend>
          <div class="filter-row">
            <label>农产品类型:</label>
            <select v-model="productType" class="type-select" @change="onTypeChange">
              <option v-for="t in PRODUCT_TYPES" :key="t" :value="t">{{ t }}</option>
            </select>
            <label>关键词:</label>
            <input
              v-model="searchText"
              class="keyword-input"
              placeholder="输入品种名称或别名搜索..."
              @keyup.enter="onSearch"
            />
            <button type="button" class="btn" :disabled="loading" @click="onSearch">搜索</button>
            <button type="button" class="btn" :disabled="loading" @click="onClear">清空</button>
            <div class="spacer" />
            <button type="button" class="btn" :disabled="loading || page <= 1" @click="onPrev">
              上一页
            </button>
            <button
              type="button"
              class="btn"
              :disabled="loading || page >= totalPages"
              @click="onNext"
            >
              下一页
            </button>
            <button type="button" class="btn btn-confirm" :disabled="loading" @click="confirmSelection">
              确认选择
            </button>
            <div class="stats">{{ statsText }}</div>
          </div>
        </fieldset>

        <div class="cards-scroll">
          <div class="cards-grid">
            <div
              v-for="p in products"
              :key="p.product_code"
              class="product-card"
              :class="{ selected: selectedPool.has(p.product_code) }"
              @click="toggleCard(p)"
            >
              <div class="card-top">
                <img
                  class="card-icon"
                  :src="varietyImgSrc(p.variety_name)"
                  alt=""
                  data-try="0"
                  @error="onImgError($event, p.variety_name)"
                />
                <span class="card-name">{{ p.variety_name }}</span>
                <span class="type-badge" :style="{ backgroundColor: typeBadgeColor(p.product_type) }">
                  {{ p.product_type }}
                </span>
              </div>
              <div class="aliases">
                <span
                  v-for="(alias, idx) in parseAliases(p.aliases).slice(0, 10)"
                  :key="`${p.product_code}-${idx}`"
                  class="alias-tag"
                >
                  {{ alias }}
                </span>
              </div>
            </div>
          </div>
          <div v-if="!loading && !products.length" class="empty">无匹配结果</div>
        </div>

        <div v-if="loading" class="loading-mask">
          <div class="loading-box">正在加载...</div>
        </div>
      </div>
    </div>

    <QtMessageBox
      v-if="tipVisible"
      title="提示"
      :message="tipMessage"
      icon="info"
      :buttons="['yes']"
      @yes="tipVisible = false"
      @close="tipVisible = false"
    />
  </div>
</template>

<style scoped lang="scss">
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
}

/* 对齐 Qt setFixedSize(1370,820)，并在大屏略放大以更饱满 */
.dialog {
  width: min(1440px, 98vw);
  height: min(900px, 94vh);
  background: #fff;
  border: 1px solid #c8c8c8;
  border-radius: 2px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.22);
}

.title-bar {
  height: 32px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(180deg, #f7f7f7, #ebebeb);
  border-bottom: 1px solid #d0d0d0;
  flex-shrink: 0;

  .title {
    font-size: 13px;
    font-weight: 600;
    color: #222;
  }

  .btn-x {
    width: 28px;
    height: 24px;
    border: none;
    background: transparent;
    font-size: 20px;
    line-height: 1;
    color: #666;
    cursor: pointer;
    border-radius: 3px;
    &:hover {
      background: #e81123;
      color: #fff;
    }
  }
}

.body {
  position: relative;
  flex: 1;
  min-height: 0;
  padding: 10px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.filter-box {
  margin: 0;
  padding: 10px 10px 10px;
  border: 2px solid #5fbb9e;
  border-radius: 10px;
  background: #fff;
  flex-shrink: 0;

  legend {
    margin-left: 8px;
    padding: 0 8px;
    color: #5fbb9e;
    font-size: 15px;
    font-weight: 700;
  }
}

.filter-row {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 8px;
  overflow-x: auto;

  label {
    font-size: 14px;
    color: #333;
    white-space: nowrap;
  }

  .spacer {
    flex: 1 1 20px;
    min-width: 12px;
  }
}

.type-select,
.keyword-input {
  padding: 6px 10px;
  border: 2px solid #ccc;
  border-radius: 6px;
  font-size: 14px;
  min-height: 34px;
  outline: none;
  background: #fff;
  &:focus {
    border-color: #5fbb9e;
  }
}

.type-select {
  min-width: 120px;
  width: 140px;
}

.keyword-input {
  flex: 1 1 180px;
  min-width: 160px;
  max-width: 280px;
}

.btn {
  background: #1677ff;
  color: #fff;
  font-weight: 700;
  padding: 6px 14px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  min-width: 72px;
  height: 34px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover:not(:disabled) {
    background: #4da58a;
  }
  &:active:not(:disabled) {
    background: #3d8b6f;
  }
  &:disabled {
    background: #ccc;
    color: #666;
    cursor: not-allowed;
  }
}

.btn-confirm {
  background: #5fbb9e;
  &:hover:not(:disabled) {
    background: #4da58a;
  }
}

.stats {
  color: #d32f2f;
  font-weight: 700;
  font-size: 13px;
  padding: 6px 8px;
  background: #ffebee;
  border-radius: 5px;
  white-space: nowrap;
  flex-shrink: 0;
}

.cards-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  /* 去掉多余留白，卡片区铺满 */
  padding: 2px 0 0;
}

/* 4 列均分拉满宽度，5 行尽量一屏看完 — 对齐截图饱满排版 */
.cards-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-auto-rows: minmax(128px, 1fr);
  gap: 12px;
  width: 100%;
  min-height: 100%;
  align-content: stretch;
}

.product-card {
  width: 100%;
  min-height: 128px;
  box-sizing: border-box;
  padding: 10px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  transition: background 0.12s, border-color 0.12s;

  &:hover {
    background: #f8f8f8;
  }

  &.selected {
    border-width: 3px;
    border-color: #5fbb9e;
    background: #f0fff0;
    padding: 9px;
    &:hover {
      background: #e8f5e9;
    }
  }
}

.card-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  min-height: 34px;
}

.card-icon {
  width: 36px;
  height: 36px;
  object-fit: contain;
  flex-shrink: 0;
}

.card-name {
  flex: 1;
  min-width: 0;
  font-size: 17px;
  font-weight: 700;
  color: #222;
  border-bottom: 2px solid #e0e0e0;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-bottom: 2px;
}

.type-badge {
  flex-shrink: 0;
  color: #fff;
  border-radius: 8px;
  padding: 3px 8px;
  font-size: 13px;
  line-height: 1.3;
  white-space: nowrap;
}

.aliases {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 5px;
  flex: 1;
  align-content: start;
  overflow: hidden;
}

.alias-tag {
  background: #fff;
  border: 1px solid #d8d8d8;
  border-radius: 3px;
  padding: 3px 4px;
  font-size: 12px;
  color: #333;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty {
  text-align: center;
  padding: 60px 20px;
  color: #999;
  font-size: 15px;
}

.loading-mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 5;
}

.loading-box {
  width: 200px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  border: 2px solid #5fbb9e;
  border-radius: 10px;
  font-size: 15px;
  color: #333;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}
</style>
