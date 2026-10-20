<script setup lang="ts">
/**
 * 设备连接状态弹窗 — 对齐 LvTongPro::onSettingClicked (DeviceStatusPopup)
 * - 固定 235×400，Qt::Popup 风格贴按钮下方偏左 (-50, height)
 * - 设备重连按钮 + s_reconnect.png
 * - 两列表格：设备名称 / 状态（绿在线 / 红离线 / 橙忙碌）
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { request } from '@/api/request'

export interface DeviceRow {
  deviceId: string
  deviceName: string
  deviceType?: string
  status: string
  connected: boolean
}

const props = defineProps<{
  /** 对齐 Qt：btn_setting.mapToGlobal(QPoint(-50, height)) 后的 left/top */
  anchor?: { left: number; top: number } | null
}>()

const emit = defineEmits<{
  close: []
  /** 全部在线时顶栏用 s_connect，否则 s_disconnect */
  statusChange: [allOnline: boolean]
}>()

const devices = ref<DeviceRow[]>([])
const loading = ref(false)
const toastVisible = ref(false)
const toastText = ref('')
let toastTimer: ReturnType<typeof setTimeout> | null = null

const sysMenuOpen = ref(false)

function statusColor(d: DeviceRow): string {
  // 对齐 Qt：离线/错误红 #c0392b，忙橙 #f39c12，否则绿 #27ae60
  const t = d.status || ''
  if (!d.connected || t.includes('离线') || t.includes('错误')) return '#c0392b'
  if (t.includes('忙')) return '#f39c12'
  return '#27ae60'
}

async function fetchStatus() {
  loading.value = true
  try {
    const res = await request<{ devices: DeviceRow[]; onlineCount: number; total: number }>(
      '/device/status',
    )
    if (res.code === 0 && res.data?.devices) {
      devices.value = res.data.devices
      const allOnline =
        res.data.devices.length > 0 && res.data.devices.every((d) => d.connected)
      emit('statusChange', allOnline)
    } else {
      devices.value = []
      emit('statusChange', false)
    }
  } catch {
    devices.value = []
    emit('statusChange', false)
  } finally {
    loading.value = false
  }
}

function showToast(msg: string) {
  toastText.value = msg
  toastVisible.value = true
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastVisible.value = false
  }, 2000)
}

async function onReconnect() {
  // 对齐 onLinkClicked → attemptReconnect + ToastWidget
  try {
    await request('/device/reconnect', { method: 'POST' })
  } catch {
    /* UI：仍提示已处理 */
  }
  showToast('已处理设备重连请求，请稍后查看设备连接状态！')
  setTimeout(() => {
    void fetchStatus()
  }, 2000)
}

const dialogStyle = computed(() => {
  // Qt: mapToGlobal(QPoint(-50, height))
  const left = props.anchor?.left ?? 0
  const top = props.anchor?.top ?? 72
  const w = 235
  const h = 400
  const maxLeft = Math.max(0, window.innerWidth - w - 4)
  const maxTop = Math.max(0, window.innerHeight - h - 4)
  return {
    left: `${Math.min(Math.max(0, left), maxLeft)}px`,
    top: `${Math.min(Math.max(0, top), maxTop)}px`,
  }
})

/** Toast 贴近弹窗上方偏左 — 对齐 ToastWidget 相对 btn_setting 的偏移 */
const toastStyle = computed(() => {
  const left = (props.anchor?.left ?? 0) - 40
  const top = (props.anchor?.top ?? 72) - 8
  return {
    left: `${Math.max(8, left)}px`,
    top: `${Math.max(8, top)}px`,
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
  void fetchStatus()
})

onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  if (toastTimer) clearTimeout(toastTimer)
})
</script>

<template>
  <div class="dev-overlay" @click.self="emit('close')">
    <div
      class="dev-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dev-dlg-title"
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
        <span id="dev-dlg-title" class="dialog-title">设备连接状态</span>
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

      <div class="dialog-body">
        <!-- 对齐 pReconnBtn：图标 s_reconnect +「设备重连」高 32 -->
        <button
          type="button"
          class="btn-reconnect"
          title="单击重新连接设备"
          @click="onReconnect"
        >
          <img src="/assets/img/s_reconnect.png" alt="" />
          <span>设备重连</span>
        </button>

        <div class="table-wrap">
          <table class="status-table">
            <thead>
              <tr>
                <th>设备名称</th>
                <th class="col-status">状态</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!loading && devices.length === 0">
                <td colspan="2" class="empty-cell">暂无设备信息</td>
              </tr>
              <tr v-for="d in devices" :key="d.deviceId">
                <td>{{ d.deviceName || d.deviceId }}</td>
                <td class="col-status" :style="{ color: statusColor(d) }">
                  {{ d.status || (d.connected ? '在线' : '离线') }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- 对齐 ToastWidget::showSuccess -->
    <div v-if="toastVisible" class="dev-toast" :style="toastStyle">
      {{ toastText }}
    </div>
  </div>
</template>

<style scoped lang="scss">
.dev-overlay {
  position: fixed;
  inset: 0;
  z-index: 1500;
  background: transparent;
}

/* 对齐 Qt setFixedSize(235, 400) */
.dev-dialog {
  position: fixed;
  width: 235px;
  height: 400px;
  box-sizing: border-box;
  background: #f0f0f0;
  border: 1px solid #a0a0a0;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.28);
  font-family: 'Microsoft YaHei', 'Segoe UI', sans-serif;
  display: flex;
  flex-direction: column;
  overflow: hidden;
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

/* 对齐 layout margins 8 */
.dialog-body {
  flex: 1;
  min-height: 0;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-sizing: border-box;
  background: #fff;
}

.btn-reconnect {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 32px;
  flex-shrink: 0;
  border: 1px solid #adadad;
  border-radius: 2px;
  background: linear-gradient(180deg, #fdfdfd 0%, #f0f0f0 100%);
  font-size: 13px;
  font-family: inherit;
  color: #1a1a1a;
  cursor: pointer;

  img {
    width: 20px;
    height: 20px;
    object-fit: contain;
  }

  &:hover {
    border-color: #0078d7;
    background: linear-gradient(180deg, #eaf4fc 0%, #d8ebf8 100%);
  }

  &:active {
    background: #d0e8f7;
  }
}

.table-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border: 1px solid #d0d0d0;
}

.status-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  table-layout: fixed;

  th,
  td {
    padding: 6px 8px;
    border-bottom: 1px solid #e8e8e8;
    border-right: 1px solid #e8e8e8;
    text-align: left;
    vertical-align: middle;
    word-break: break-all;
  }

  th:last-child,
  td:last-child {
    border-right: none;
  }

  th {
    background: #f5f5f5;
    color: #333;
    font-weight: 600;
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .col-status {
    width: 64px;
    text-align: center;
    font-weight: 600;
    white-space: nowrap;
  }

  .empty-cell {
    text-align: center;
    color: #999;
    padding: 24px 8px;
    border-right: none;
  }

  tbody tr:last-child td {
    border-bottom: none;
  }
}

.dev-toast {
  position: fixed;
  z-index: 1600;
  max-width: 320px;
  padding: 10px 14px;
  background: #2ecc71;
  color: #fff;
  font-size: 13px;
  font-family: 'Microsoft YaHei', sans-serif;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  pointer-events: none;
}
</style>
