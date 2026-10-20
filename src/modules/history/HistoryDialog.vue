<script setup lang="ts">
/**
 * 历史记录查询弹窗 — 1:1 对齐 Qt HistoryDialog.ui / HistoryDialog.cpp
 * 尺寸：1380 × 983（原 1200×855 ×1.15）
 */
import { computed, onMounted, ref } from 'vue'
import { exportHistoryCsv, fetchHistoryList, fetchOperators } from './api'
import DetailDialog from './DetailDialog.vue'
import type { HistoryRecord, HistorySearchCriteria } from './types'
import QtMessageBox from '@/components/common/QtMessageBox.vue'

const props = withDefaults(
  defineProps<{
    /** 主页查验次数点入：预填车牌与时间范围（API 时间或 datetime-local） */
    initialPlate?: string
    initialStartTime?: string
    initialEndTime?: string
  }>(),
  {
    initialPlate: '',
    initialStartTime: '',
    initialEndTime: '',
  },
)

const emit = defineEmits<{
  close: []
}>()

const detailId = ref<number | null>(null)

const loading = ref(false)
const items = ref<HistoryRecord[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(50)
const selectedIndex = ref(-1)
const operators = ref<string[]>([])

const tipVisible = ref(false)
const tipMessage = ref('')
const tipIcon = ref<'question' | 'warning' | 'info'>('info')

const plateNumber = ref('')
const driverPhone = ref('')
const operatorName = ref('')
const startTime = ref('')
const endTime = ref('')
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value) || 1))

const paginationInfo = computed(() => {
  if (total.value === 0) {
    return '显示第 1 - 0 条记录，共 0 条记录'
  }
  const start = (currentPage.value - 1) * pageSize.value + 1
  const end = Math.min(currentPage.value * pageSize.value, total.value)
  return `显示第 ${start} - ${end} 条记录，共 ${total.value} 条记录`
})

const pageInfo = computed(
  () => `第 ${currentPage.value} 页，共 ${totalPages.value} 页`,
)

const canPrev = computed(() => currentPage.value > 1)
const canNext = computed(() => currentPage.value < totalPages.value)
const detailEnabled = computed(() => selectedIndex.value >= 0 && !!items.value[selectedIndex.value])

function pad(n: number) {
  return String(n).padStart(2, '0')
}

/** 默认日期：今天-30 ～ 今天，对齐 initializeUI */
function defaultDateRange() {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 30)
  startTime.value = toInputValue(start, false)
  endTime.value = toInputValue(end, true)
}

function toInputValue(d: Date, endOfDay: boolean) {
  const y = d.getFullYear()
  const m = pad(d.getMonth() + 1)
  const day = pad(d.getDate())
  if (endOfDay) return `${y}-${m}-${day}T23:59`
  return `${y}-${m}-${day}T00:00`
}

/** ISO / DB 时间 → datetime-local 值 */
function isoToLocalInput(raw: string, endOfDay: boolean): string {
  if (!raw) return ''
  const d = new Date(raw)
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear()
    const m = pad(d.getMonth() + 1)
    const day = pad(d.getDate())
    const hh = pad(d.getHours())
    const mm = pad(d.getMinutes())
    return `${y}-${m}-${day}T${hh}:${mm}`
  }
  const s = raw.replace(' ', 'T').slice(0, 16)
  if (s.length >= 16) return s
  return endOfDay ? `${raw.slice(0, 10)}T23:59` : `${raw.slice(0, 10)}T00:00`
}

/** API 用：补全秒，对齐 Qt 00:00:00 / 23:59:59 */
function toApiTime(local: string, endOfDay: boolean): string {
  if (!local) return ''
  // datetime-local → yyyy-MM-dd HH:mm:ss
  const normalized = local.replace('T', ' ')
  if (normalized.length === 16) {
    return `${normalized}:${endOfDay ? '59' : '00'}`
  }
  return normalized
}

function getCriteria(): HistorySearchCriteria {
  return {
    plateNumber: plateNumber.value.trim(),
    driverPhone: driverPhone.value.trim(),
    operatorName: operatorName.value,
    startTime: toApiTime(startTime.value, false),
    endTime: toApiTime(endTime.value, true),
  }
}

function formatDateTime(raw?: string) {
  if (!raw) return ''
  // 对齐 formatDateTime: yyyy-MM-dd hh:mm:ss
  return raw.replace('T', ' ').slice(0, 19)
}

function formatLoadRate(rate?: number) {
  if (rate == null || Number.isNaN(Number(rate))) return ''
  return Number(rate).toFixed(2)
}

function resultText(status?: number) {
  // 0=合格，1=不合格
  return Number(status) === 1 ? '不合格' : '合格'
}

function vehicleTypeText(row: HistoryRecord) {
  return row.btypename || row.vehicle_name || ''
}

async function loadData() {
  loading.value = true
  selectedIndex.value = -1
  try {
    const res = await fetchHistoryList(getCriteria(), currentPage.value, pageSize.value)
    if (res.code === 0 && res.data) {
      items.value = res.data.items ?? []
      total.value = res.data.total ?? 0
      if (currentPage.value > totalPages.value) {
        currentPage.value = totalPages.value
      }
    } else {
      items.value = []
      total.value = 0
    }
  } catch {
    items.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

function onSearch() {
  currentPage.value = 1
  loadData()
}

function onReset() {
  plateNumber.value = ''
  driverPhone.value = ''
  operatorName.value = ''
  defaultDateRange()
  currentPage.value = 1
  loadData()
}

function onFirstPage() {
  if (!canPrev.value) return
  currentPage.value = 1
  loadData()
}

function onPrevPage() {
  if (!canPrev.value) return
  currentPage.value -= 1
  loadData()
}

function onNextPage() {
  if (!canNext.value) return
  currentPage.value += 1
  loadData()
}

function onLastPage() {
  if (!canNext.value) return
  currentPage.value = totalPages.value
  loadData()
}

function onPageSizeChange() {
  currentPage.value = 1
  loadData()
}

function onSelectRow(index: number) {
  selectedIndex.value = index
}

function onRowDblClick(index: number) {
  selectedIndex.value = index
  onShowDetail()
}

function onShowDetail() {
  if (!detailEnabled.value) {
    tipIcon.value = 'warning'
    tipMessage.value = '请先选择一条记录'
    tipVisible.value = true
    return
  }
  detailId.value = items.value[selectedIndex.value].id
}

function onDetailClose() {
  detailId.value = null
}

function onDetailModified() {
  loadData()
}

async function onExport() {
  try {
    const res = await exportHistoryCsv(getCriteria())
    if (res.code !== 0 || !res.data?.csv) {
      tipIcon.value = 'warning'
      tipMessage.value = res.message || '导出失败'
      tipVisible.value = true
      return
    }
    const blob = new Blob(['\uFEFF' + res.data.csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `检测记录_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`
    a.click()
    URL.revokeObjectURL(url)
    tipIcon.value = 'info'
    tipMessage.value = '数据已成功导出'
    tipVisible.value = true
  } catch {
    tipIcon.value = 'warning'
    tipMessage.value = '导出失败'
    tipVisible.value = true
  }
}

onMounted(async () => {
  const presetPlate = (props.initialPlate || '').trim()
  if (presetPlate) {
    plateNumber.value = presetPlate
    startTime.value = props.initialStartTime
      ? isoToLocalInput(props.initialStartTime, false)
      : ''
    endTime.value = props.initialEndTime
      ? isoToLocalInput(props.initialEndTime, true)
      : ''
    if (!startTime.value || !endTime.value) {
      defaultDateRange()
    }
  } else {
    defaultDateRange()
  }
  operators.value = await fetchOperators()
  await loadData()
})
</script>

<template>
  <div class="history-overlay" @click.self="emit('close')">
    <div class="history-dialog" role="dialog" aria-modal="true" @click.stop>
      <div class="dialog-titlebar">
        <span class="dialog-title">历史记录查询</span>
        <button type="button" class="dialog-close" title="关闭" @click="emit('close')">×</button>
      </div>

      <div class="dialog-body">
        <!-- 搜索条件 -->
        <fieldset class="group-box">
          <legend>搜索条件</legend>
          <div class="search-grid">
            <label>车牌号码:</label>
            <input
              v-model="plateNumber"
              class="field"
              placeholder="请输入车牌号码"
              @keyup.enter="onSearch"
            />
            <label>司机电话:</label>
            <input
              v-model="driverPhone"
              class="field"
              placeholder="请输入司机电话"
              @keyup.enter="onSearch"
            />

            <label>开始时间:</label>
            <input v-model="startTime" class="field" type="datetime-local" step="1" />
            <label>结束时间:</label>
            <input v-model="endTime" class="field" type="datetime-local" step="1" />

            <label>操作员:</label>
            <select v-model="operatorName" class="field">
              <option value="">请选择操作员</option>
              <option v-for="op in operators" :key="op" :value="op">{{ op }}</option>
            </select>
            <!-- 空出「司机电话」标签列，按钮组与右侧输入框同列左右贴齐 -->
            <span class="search-label-spacer" aria-hidden="true" />
            <div class="search-actions">
              <button type="button" class="btn btn-search" @click="onSearch">搜索</button>
              <button type="button" class="btn" @click="onReset">重置</button>
              <button type="button" class="btn" @click="onExport">导出</button>
            </div>
          </div>
        </fieldset>

        <!-- 查询结果 -->
        <fieldset class="group-box result-box">
          <legend>查询结果</legend>
          <div class="table-wrap">
            <table class="result-table">
              <thead>
                <tr>
                  <th style="width: 100px">车牌号码</th>
                  <th style="width: 120px">司机电话</th>
                  <th style="width: 100px">车辆类型</th>
                  <th style="width: 180px">货物类型</th>
                  <th style="width: 100px">满载率(%)</th>
                  <th style="width: 100px">操作员</th>
                  <th style="width: 100px">查验结果</th>
                  <th>检测时间</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="loading">
                  <td colspan="8" class="empty-cell">加载中...</td>
                </tr>
                <tr v-else-if="!items.length">
                  <td colspan="8" class="empty-cell">暂无记录</td>
                </tr>
                <tr
                  v-for="(row, index) in items"
                  v-else
                  :key="row.id ?? index"
                  :class="{ selected: selectedIndex === index, alt: index % 2 === 1 }"
                  @click="onSelectRow(index)"
                  @dblclick="onRowDblClick(index)"
                >
                  <td>{{ row.plate_number }}</td>
                  <td>{{ row.driver_phone }}</td>
                  <td>{{ vehicleTypeText(row) }}</td>
                  <td :title="row.goods_name">{{ row.goods_name }}</td>
                  <td>{{ formatLoadRate(row.load_rate) }}</td>
                  <td>{{ row.operator_name }}</td>
                  <td>{{ resultText(row.result_status) }}</td>
                  <td>{{ formatDateTime(row.inspection_time) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="pagination-bar">
            <span class="page-total">{{ paginationInfo }}</span>
            <div class="page-nav">
              <button type="button" class="btn btn-page" :disabled="!canPrev" @click="onFirstPage">
                首页
              </button>
              <button type="button" class="btn btn-page" :disabled="!canPrev" @click="onPrevPage">
                上一页
              </button>
              <span class="page-info">{{ pageInfo }}</span>
              <button type="button" class="btn btn-page" :disabled="!canNext" @click="onNextPage">
                下一页
              </button>
              <button type="button" class="btn btn-page" :disabled="!canNext" @click="onLastPage">
                末页
              </button>
              <span class="page-size-label">每页显示：</span>
              <select
                v-model.number="pageSize"
                class="page-size"
                @change="onPageSizeChange"
              >
                <option :value="20">20</option>
                <option :value="50">50</option>
                <option :value="100">100</option>
              </select>
            </div>
          </div>
        </fieldset>

        <div class="detail-row">
          <button
            type="button"
            class="btn btn-detail"
            :disabled="!detailEnabled"
            @click="onShowDetail"
          >
            查看详情
          </button>
        </div>
      </div>
    </div>

    <QtMessageBox
      v-if="tipVisible"
      title="提示"
      :message="tipMessage"
      :icon="tipIcon"
      :buttons="['yes']"
      @yes="tipVisible = false"
      @close="tipVisible = false"
    />

    <!-- 查验记录详情 — 对齐 DetailDialog -->
    <DetailDialog
      v-if="detailId != null"
      :inspection-id="detailId"
      @close="onDetailClose"
      @modified="onDetailModified"
    />
  </div>
</template>

<style scoped lang="scss">
.history-overlay {
  position: fixed;
  inset: 0;
  z-index: 1500;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 对齐 HistoryDialog 1200×855，整体 ×1.15 */
.history-dialog {
  width: 1380px;
  height: 983px;
  max-width: 96vw;
  max-height: 96vh;
  background: #f0f0f0;
  border: 1px solid #a0a0a0;
  box-shadow: 0 10px 36px rgba(0, 0, 0, 0.28);
  display: flex;
  flex-direction: column;
  font-family: 'Microsoft YaHei', 'Segoe UI', sans-serif;
  overflow: hidden;
}

.dialog-titlebar {
  flex: 0 0 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px 0 12px;
  background: linear-gradient(180deg, #fff 0%, #f0f0f0 100%);
  border-bottom: 1px solid #d0d0d0;
}

.dialog-title {
  font-size: 13px;
  font-weight: 600;
  color: #1a1a1a;
}

.dialog-close {
  width: 28px;
  height: 24px;
  border: none;
  background: transparent;
  font-size: 18px;
  cursor: pointer;
  border-radius: 2px;
  color: #333;

  &:hover {
    background: #e81123;
    color: #fff;
  }
}

.dialog-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 10px 12px 12px;
  gap: 8px;
  background: #f5f5f5;
}

.group-box {
  margin: 0;
  padding: 8px 12px 12px;
  border: 1px solid #c0c0c0;
  border-radius: 2px;
  background: #fafafa;

  legend {
    padding: 0 6px;
    font-size: 13px;
    color: #333;
  }
}

.result-box {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.search-grid {
  display: grid;
  grid-template-columns: 72px 1fr 72px 1fr;
  gap: 10px 12px;
  align-items: center;

  label {
    font-size: 13px;
    color: #333;
    text-align: right;
    white-space: nowrap;
  }
}

.field {
  height: 40px;
  padding: 0 10px;
  border: 1px solid #c5c5c5;
  border-radius: 2px;
  background: #fff;
  font-size: 13px;
  font-family: inherit;
  box-sizing: border-box;
  width: 100%;

  &:focus {
    outline: none;
    border-color: #0078d7;
  }
}

/* 与右侧「司机电话 / 结束时间」输入框同宽：左贴输入框左缘，右贴输入框右缘 */
.search-label-spacer {
  /* 占据第 3 列（标签列），内容为空 */
  visibility: hidden;
  pointer-events: none;
}

.search-actions {
  display: flex;
  gap: 10px;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;

  .btn {
    flex: 1 1 0;
    width: 0; /* 强制三等分，撑满输入列 */
    min-width: 0;
    padding: 0 8px;
  }
}

.btn {
  height: 40px;
  min-width: 72px;
  padding: 0 16px;
  border: 1px solid #adadad;
  border-radius: 2px;
  background: linear-gradient(180deg, #fdfdfd 0%, #f0f0f0 100%);
  color: #1a1a1a;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: #0078d7;
    background: linear-gradient(180deg, #eaf4fc 0%, #d8ebf8 100%);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.btn-search {
  border-color: #0078d7;
  color: #0078d7;
}

.btn-page {
  height: 32px;
  min-width: 0;
  padding: 0 8px;
  font-size: 13px;
}

.table-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border: 1px solid #c8c8c8;
  background: #fff;
}

.result-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  table-layout: fixed;

  th,
  td {
    padding: 6px 8px;
    border-bottom: 1px solid #e5e5e5;
    border-right: 1px solid #eee;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: #f3f3f3;
    font-weight: 600;
    border-bottom: 1px solid #c8c8c8;
  }

  tr.alt td {
    background: #f9f9f9;
  }

  tr.selected td {
    background: #cce8ff;
  }

  tbody tr {
    cursor: pointer;

    &:hover:not(.selected) td {
      background: #e8f4fc;
    }
  }
}

.empty-cell {
  text-align: center !important;
  color: #999;
  padding: 40px 8px !important;
}

.pagination-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-top: 10px;
  font-size: 13px;
  color: #222;
}

.page-total {
  flex: 0 0 auto;
  font-size: 13px;
  font-weight: 700;
  color: #000;
  white-space: nowrap;
}

/* 右侧整行：首页~末页等分拉满，每页显示贴右 */
.page-nav {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.page-nav .btn-page {
  flex: 1 1 0;
  width: 0;
}

.page-info {
  flex: 1 1 0;
  min-width: 8.5em;
  text-align: center;
  white-space: nowrap;
  font-size: 13px;
  color: #222;
}

.page-size-label {
  flex: 0 0 auto;
  white-space: nowrap;
  margin-left: 4px;
}

.page-size {
  flex: 0 0 auto;
  height: 32px;
  min-width: 64px;
  border: 1px solid #adadad;
  border-radius: 2px;
  background: #fff;
  font-size: 12px;
}

.detail-row {
  display: flex;
  justify-content: flex-end;
  padding: 4px 50px 0 0;
}

.btn-detail {
  width: 120px;
  height: 50px;
  font-size: 14px;
}
</style>
