<script setup lang="ts">
/**
 * AI智能体连接状态 — 对齐 Qt WebServiceDialog (180×160)
 * 定位：btn_webservice 左下角（与 PLC 弹窗相同）
 * 状态色：灰=未知，绿=在线，红=离线
 * deviceId "0" → 行驶证识别(OCR)；"1" → 货车类型 + 货箱类型(AI)
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { request } from '@/api/request'

export type ServiceLight = 'unknown' | 'online' | 'offline'

const props = defineProps<{
  /** 对齐 Qt：btn_webservice.mapToGlobal(0, height) */
  anchor?: { left: number; top: number } | null
}>()

const emit = defineEmits<{
  close: []
  /** 对齐顶栏图标刷新：AI 模型在线态 */
  statusChange: [aiOnline: boolean]
}>()

/** 行驶证识别服务 — deviceId "0" */
const ocrState = ref<ServiceLight>('unknown')
/** 货车/货箱类型识别 — deviceId "1"（Qt 同步刷新两路） */
const aiState = ref<ServiceLight>('unknown')

const sysMenuOpen = ref(false)

const lightClass: Record<ServiceLight, string> = {
  unknown: 'is-gray',
  online: 'is-green',
  offline: 'is-red',
}

const tipOcr = computed(() =>
  ocrState.value === 'online'
    ? '行驶证识别服务：在线'
    : ocrState.value === 'offline'
      ? '行驶证识别服务：离线'
      : '行驶证识别服务',
)

const tipTruck = computed(() =>
  aiState.value === 'online'
    ? 'AI货车类型识别服务：在线'
    : aiState.value === 'offline'
      ? 'AI货车类型识别服务：离线'
      : '货车类型识别服务',
)

const tipContainer = computed(() =>
  aiState.value === 'online'
    ? 'AI货箱类型识别服务：在线'
    : aiState.value === 'offline'
      ? 'AI货箱类型识别服务：离线'
      : '货箱类型识别服务',
)

/** 对齐 onWebServiceClicked → onWebServiceSatusUpdated */
async function refreshStatus() {
  try {
    const res = await request<{ aiOnline?: boolean; ocrOnline?: boolean }>('/device/health')
    if (res.code === 0 && res.data) {
      applyOcr(!!res.data.ocrOnline)
      applyAi(!!res.data.aiOnline)
      emit('statusChange', !!res.data.aiOnline)
      return
    }
  } catch {
    /* 仅 UI：探测失败按离线展示 */
  }
  applyOcr(false)
  applyAi(false)
  emit('statusChange', false)
}

function applyOcr(online: boolean) {
  ocrState.value = online ? 'online' : 'offline'
}

function applyAi(online: boolean) {
  aiState.value = online ? 'online' : 'offline'
}

const dialogStyle = computed(() => {
  const left = props.anchor?.left ?? 0
  const top = props.anchor?.top ?? 72
  const w = 180
  const h = 160
  const maxLeft = Math.max(0, window.innerWidth - w - 4)
  const maxTop = Math.max(0, window.innerHeight - h - 4)
  return {
    left: `${Math.min(Math.max(0, left), maxLeft)}px`,
    top: `${Math.min(Math.max(0, top), maxTop)}px`,
  }
})

function toggleSysMenu(e: MouseEvent) {
  e.stopPropagation()
  sysMenuOpen.value = !sysMenuOpen.value
}

function onSysClose() {
  sysMenuOpen.value = false
  emit('close')
}

function onDocClick() {
  sysMenuOpen.value = false
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
  // 对齐 Qt：show 后立刻刷状态
  void refreshStatus()
})

onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
})
</script>

<template>
  <div class="ai-overlay" @click.self="emit('close')">
    <div
      class="ai-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-dlg-title"
      :style="dialogStyle"
      @click.stop
    >
      <div class="dialog-titlebar">
        <button
          type="button"
          class="title-icon-btn"
          title="系统菜单"
          @click="toggleSysMenu"
          @dblclick.prevent="onSysClose"
        >
          <img class="title-icon" src="/assets/img/logo.ico" alt="" />
        </button>
        <span id="ai-dlg-title" class="dialog-title">AI智能体连接状态</span>
        <button type="button" class="dialog-close" title="关闭" @click="emit('close')">×</button>

        <div v-if="sysMenuOpen" class="sys-menu" @click.stop>
          <button type="button" class="sys-item" disabled>还原(R)</button>
          <button type="button" class="sys-item" disabled>移动(M)</button>
          <button type="button" class="sys-item" disabled>大小(S)</button>
          <button type="button" class="sys-item" disabled>最小化(N)</button>
          <button type="button" class="sys-item" disabled>最大化(X)</button>
          <div class="sys-sep" />
          <button type="button" class="sys-item" @click="onSysClose">关闭(C)</button>
        </div>
      </div>

      <!-- 对齐 WebServiceDialog.ui groupBox 三行 -->
      <div class="dialog-body">
        <div class="svc-row">
          <span class="svc-label">行驶证识别服务：</span>
          <span
            class="svc-light"
            :class="lightClass[ocrState]"
            :title="tipOcr"
            role="img"
            :aria-label="tipOcr"
          />
        </div>
        <div class="svc-row">
          <span class="svc-label">货车类型识别服务：</span>
          <span
            class="svc-light"
            :class="lightClass[aiState]"
            :title="tipTruck"
            role="img"
            :aria-label="tipTruck"
          />
        </div>
        <div class="svc-row">
          <span class="svc-label">货箱类型识别服务：</span>
          <span
            class="svc-light"
            :class="lightClass[aiState]"
            :title="tipContainer"
            role="img"
            :aria-label="tipContainer"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ai-overlay {
  position: fixed;
  inset: 0;
  z-index: 1500;
  background: transparent;
}

/* 对齐 Qt geometry 180×160 */
.ai-dialog {
  position: fixed;
  width: 180px;
  height: 160px;
  box-sizing: border-box;
  background: #f0f0f0;
  border: 1px solid #a0a0a0;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.28);
  font-family: 'Microsoft YaHei', 'Segoe UI', sans-serif;
  display: flex;
  flex-direction: column;
  overflow: visible;
}

.dialog-titlebar {
  position: relative;
  display: flex;
  align-items: center;
  height: 28px;
  padding: 0 2px 0 4px;
  background: linear-gradient(180deg, #fff 0%, #ececec 100%);
  border-bottom: 1px solid #d0d0d0;
  flex-shrink: 0;
  user-select: none;
}

.title-icon-btn {
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: default;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.title-icon {
  width: 16px;
  height: 16px;
  object-fit: contain;
  display: block;
}

.dialog-title {
  flex: 1;
  margin-left: 4px;
  font-size: 12px;
  font-weight: 600;
  color: #1a1a1a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dialog-close {
  width: 28px;
  height: 22px;
  border: none;
  background: transparent;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  color: #333;
  flex-shrink: 0;

  &:hover {
    background: #e81123;
    color: #fff;
  }
}

.sys-menu {
  position: absolute;
  top: 26px;
  left: 2px;
  z-index: 20;
  min-width: 120px;
  padding: 2px 0;
  background: #f2f2f2;
  border: 1px solid #a0a0a0;
  box-shadow: 2px 2px 6px rgba(0, 0, 0, 0.25);
}

.sys-item {
  display: block;
  width: 100%;
  padding: 4px 18px 4px 28px;
  border: none;
  background: transparent;
  text-align: left;
  font-size: 12px;
  font-family: 'Microsoft YaHei', sans-serif;
  color: #1a1a1a;
  cursor: default;

  &:hover:not(:disabled) {
    background: #0078d7;
    color: #fff;
  }

  &:disabled {
    color: #a0a0a0;
  }
}

.sys-sep {
  height: 1px;
  margin: 3px 4px;
  background: #c8c8c8;
}

.dialog-body {
  flex: 1;
  margin: 2px 4px 4px;
  padding: 8px 8px;
  border: 1px solid #c8c8c8;
  background: #f5f5f5;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;
  gap: 4px;
}

.svc-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 22px;
}

.svc-label {
  font-size: 12px;
  color: #1a1a1a;
  white-space: nowrap;
  line-height: 1.2;
}

/* 对齐 QPushButton 32×16 + stylesheet gray/green/red */
.svc-light {
  width: 32px;
  height: 16px;
  flex-shrink: 0;
  border: 1px solid rgba(0, 0, 0, 0.2);
  box-sizing: border-box;

  &.is-gray {
    background: gray;
  }

  &.is-green {
    background: green;
  }

  &.is-red {
    background: red;
  }
}
</style>
