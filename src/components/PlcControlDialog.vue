<script setup lang="ts">
/**
 * PLC 设备状态控制 — 对齐 Qt PLCControlDialog (160×290)
 * 开关图：plcctrl_open.png / plcctrl_close.png
 * 确认：QMessageBox「系统提醒」Yes/No
 * 标题栏图标：logo.ico，点击弹出系统菜单
 */
import { onMounted, onUnmounted, ref, computed } from 'vue'
import { useWsStore } from '@/stores/useWsStore'
import { request } from '@/api/request'
import QtMessageBox from '@/components/common/QtMessageBox.vue'
import { parsePlcSignalLights } from '@/utils/plcXrayStatus'
import { parsePlcVoiceStatus, voiceStatusText, type PlcVoiceStatus } from '@/utils/plcVoiceStatus'
import { useDeviceSwitchFeedback } from '@/composables/useDeviceSwitchFeedback'

const props = defineProps<{
  /** 对齐 Qt：btn_plccontrol 左下角全局坐标 */
  anchor?: { left: number; top: number } | null
}>()

const emit = defineEmits<{ close: [] }>()

const wsStore = useWsStore()
const voiceStatus = ref<PlcVoiceStatus>({ front: null, back: null })
const voiceRows = [{ key: 'front', label: '前语音' }, { key: 'back', label: '后语音' }] as const
const plcFeedbackFresh = ref(true)
const radiometer = ref<{ value: number; fresh: boolean; unit: string | null } | null>(null)

/** 确认框 */
const confirmVisible = ref(false)
const confirmMessage = ref('')
let pending: { key: string; next: boolean } | null = null

/** 错误提示框 */
const errorVisible = ref(false)
const errorMessage = ref('')

/** 标题栏系统菜单（对齐 Windows 点窗口图标） */
const sysMenuOpen = ref(false)

interface SwitchItem {
  /** 下发参数名 — 对齐 Qt setPLC params；只读行仅作 key */
  key: string
  label: string
  /** 本地状态字段 */
  field: string
  /** 确认文案：next=true / next=false（只读行可空） */
  tipOn?: string
  tipOff?: string
  /** STATUS 反馈：仅显示，不可点控 */
  readonly?: boolean
}

/** 可下发控制项 — 对齐原 PLCControlDialog.ui */
const controlSwitches: SwitchItem[] = [
  { key: 'urgentstop', field: 'urgentstop', label: '急停', tipOn: '设备急停 ?', tipOff: '设备打开 ?' },
  { key: 'redlight', field: 'redlight', label: '红灯', tipOn: '红灯打开 ?', tipOff: '红灯关闭 ?' },
  { key: 'yellowlight', field: 'yellowlight', label: '黄灯', tipOn: '黄灯打开 ?', tipOff: '黄灯关闭 ?' },
  { key: 'greenlight', field: 'greenlight', label: '绿灯', tipOn: '绿灯打开 ?', tipOff: '绿灯关闭 ?' },
  { key: 'filllight', field: 'filllight', label: '补光灯', tipOn: '补光灯打开 ?', tipOff: '补光灯关闭 ?' },
  { key: 'soundalarm', field: 'soundalarm', label: '声音报警', tipOn: '声音报警打开 ?', tipOff: '声音报警关闭 ?' },
]

/** 暂不展示 STATUS 反馈区；面板只保留可下发控制项 */
const switches: SwitchItem[] = controlSwitches

const switchFeedback = useDeviceSwitchFeedback({
  urgentstop: false,
  redlight: false,
  yellowlight: false,
  greenlight: false,
  filllight: false,
  soundalarm: false,
}, 3000)
const { display: displayStates, pending: pendingSwitches, messages: feedbackMessages } = switchFeedback

function applyStatus(d: Record<string, unknown>) {
  const lights = parsePlcSignalLights(d)
  if (!switchFeedback.feedback({ redlight: lights.red, yellowlight: lights.yellow, greenlight: lights.green, filllight: lights.fillLight,
    soundalarm: !!(d.soundalarmCmd ?? d.soundalarm), urgentstop: !!(d.urgentStopStatus ?? d.urgentstop ?? d.urgentStopCmd) }, d)) return
  plcFeedbackFresh.value = d.fresh !== false
  voiceStatus.value = parsePlcVoiceStatus(plcFeedbackFresh.value ? d : {})
}

function onWsPlcStatus(msg: { data?: unknown }) {
  if (msg.data && typeof msg.data === 'object') {
    applyStatus(msg.data as Record<string, unknown>)
  }
}

function onSysMenuDocClick() {
  sysMenuOpen.value = false
}

/** 打开期间 500ms 拉一次后端缓存的 DEVICE 状态（发令后设备未动也能回弹） */
let statusPollTimer: ReturnType<typeof setInterval> | null = null
let unsubPlcStatus: (() => void) | null = null
let unsubRadiometer: (() => void) | null = null

async function refreshRadiometer() {
  try {
    const res = await request<typeof radiometer.value>('/device/radiometer-status')
    radiometer.value = res.data ?? null
  } catch { radiometer.value = null }
}

async function refreshPlcStatus() {
  if (statusPollInFlight) return
  statusPollInFlight = true
  try {
    const res = await request<Record<string, unknown> | null>('/device/plc-status', { timeout: 5000 })
    if (res.code === 0 && res.data && typeof res.data === 'object') applyStatus(res.data)
  } catch {
    /* 无缓存 / 网络抖动时忽略 */
  } finally { statusPollInFlight = false }
}
let statusPollInFlight = false

onMounted(() => {
  // 先回放缓存，再订阅读取；DEVICE 相同寄存器只推一次，晚开面板会全灰
  if (wsStore.lastPlcStatus) {
    applyStatus(wsStore.lastPlcStatus)
  }
  void refreshPlcStatus()
  void refreshRadiometer()
  statusPollTimer = setInterval(() => {
    void refreshPlcStatus()
    void refreshRadiometer()
  }, 500)
  unsubPlcStatus = wsStore.subscribe('plc_status', onWsPlcStatus)
  unsubRadiometer = wsStore.subscribe('radiometer_status', msg => {
    const data = msg.data as typeof radiometer.value
    if (data && Number.isFinite(data.value)) radiometer.value = data
  })
  document.addEventListener('click', onSysMenuDocClick)
})

onUnmounted(() => {
  unsubRadiometer?.()
  document.removeEventListener('click', onSysMenuDocClick)
  if (statusPollTimer != null) {
    clearInterval(statusPollTimer)
    statusPollTimer = null
  }
  unsubPlcStatus?.()
  unsubPlcStatus = null
})

/** 点击开关：先弹确认，对齐 onBtnClicked */
/** 正在请求中的开关 key，非空时对应按钮显示加载动画 */
const loadingKey = ref<string | null>(null)

function onSwitchClick(item: SwitchItem) {
  if (item.readonly) return
  if (confirmVisible.value || errorVisible.value || loadingKey.value || pendingSwitches.value[item.key]) return
  const next = !displayStates.value[item.field]
  pending = { key: item.key, next }
  confirmMessage.value = next ? (item.tipOn || '') : (item.tipOff || '')
  confirmVisible.value = true
}

/** 即时显示目标；至少保持1秒，并等待本次操作之后的新反馈确认。 */
async function onConfirmYes() {
  confirmVisible.value = false
  if (!pending) return

  const { key, next } = pending
  pending = null

  if (loadingKey.value) return
  loadingKey.value = key
  const token = switchFeedback.begin(key, next)

  try {
    // POST /api/device/plc-control → { [key]: next }
    const result = await request('/device/plc-control', {
      method: 'POST',
      body: JSON.stringify({ [key]: next }),
    })
    if (result.code !== 0) throw new Error(result.message || 'PLC 控制指令发送失败')
    switchFeedback.sent(key, token)
    void refreshPlcStatus()
  } catch (e: any) {
    switchFeedback.fail(key, token)
    errorMessage.value = e?.message || 'PLC 控制指令发送失败'
    errorVisible.value = true
  } finally {
    loadingKey.value = null
  }
}

function onConfirmNo() {
  confirmVisible.value = false
  pending = null
}

function toggleSysMenu(e: MouseEvent) {
  e.stopPropagation()
  sysMenuOpen.value = !sysMenuOpen.value
}

function onSysClose() {
  sysMenuOpen.value = false
  emit('close')
}

/** 对齐 LvTongPro::onPlcControl：move(btn.mapToGlobal(0, height))；高度随开关条数收缩 */
const dialogStyle = computed(() => {
  const left = props.anchor?.left ?? 0
  const top = props.anchor?.top ?? 72
  const w = 176
  // 仅限制最大高度，避免矮屏溢出；实际高度由内容决定
  const canvas = document.querySelector('.screen-scaler-stage') as HTMLElement | null
  const canvasWidth = canvas?.offsetWidth ?? window.innerWidth
  const canvasHeight = canvas?.offsetHeight ?? window.innerHeight
  const maxH = Math.min(460, Math.max(120, canvasHeight - 16))
  const maxLeft = Math.max(0, canvasWidth - w - 4)
  const maxTop = Math.max(0, canvasHeight - 80)
  return {
    left: `${Math.min(Math.max(0, left), maxLeft)}px`,
    top: `${Math.min(Math.max(0, top), maxTop)}px`,
    width: `${w}px`,
    height: 'auto',
    maxHeight: `${maxH}px`,
  }
})
</script>

<template>
  <div class="plc-overlay" @click.self="emit('close')">
    <div
      class="plc-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="plc-dlg-title"
      :style="dialogStyle"
      @click.stop
    >      <!-- 标题栏 — 对齐 Windows QDialog + logo.ico -->
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
        <span id="plc-dlg-title" class="dialog-title">PLC设备状态控制</span>
        <button type="button" class="dialog-close" title="关闭" @click="emit('close')">×</button>

        <!-- 点图标系统菜单 — 对齐 Windows 标题栏图标菜单 -->
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
        <div
          v-for="item in switches"
          :key="item.key"
          class="switch-row"
        >
          <span class="switch-label">{{ item.label }}</span>
          <button
            type="button"
            class="switch-btn"
            :class="{ 'is-loading': loadingKey === item.key || pendingSwitches[item.key] }"
            :title="item.label"
            :disabled="loadingKey !== null || pendingSwitches[item.key]"
            :aria-pressed="displayStates[item.field]"
            :aria-busy="loadingKey === item.key || !!pendingSwitches[item.key]"
            @click="onSwitchClick(item)"
          >
            <img
              :src="displayStates[item.field] ? '/assets/img/plcctrl_open.png' : '/assets/img/plcctrl_close.png'"
              :alt="displayStates[item.field] ? '开' : '关'"
            />
          </button>
        </div>
      </div>

      <div class="voice-feedback" aria-label="语音播报反馈" aria-live="polite">
        <div v-if="!plcFeedbackFresh" role="status">设备反馈已超时，开关显示为最后状态</div>
        <div v-for="item in switches.filter(row => pendingSwitches[row.key] || feedbackMessages[row.key])" :key="item.key" role="status">{{ item.label }}：{{ pendingSwitches[item.key] ? '等待设备反馈' : feedbackMessages[item.key] }}</div>
        <div v-for="row in voiceRows" :key="row.key" class="voice-row">
          <span>{{ row.label }}</span>
          <span :class="{ playing: wsStore.isConnected && voiceStatus[row.key] === true }">
            {{ voiceStatusText(wsStore.isConnected ? voiceStatus[row.key] : null) }}
          </span>
        </div>
        <div class="voice-row" aria-label="辐射计数值">
          <span>辐射计</span>
          <span v-if="!wsStore.isConnected || !radiometer">待反馈</span>
          <span v-else-if="!radiometer.fresh">数据已过期</span>
          <span v-else>{{ radiometer.value }}</span>
        </div>
      </div>

      <!-- 对齐 QMessageBox::question(this, "系统提醒", tipTxt, Yes|No) -->
      <QtMessageBox
        v-if="confirmVisible"
        title="系统提醒"
        :message="confirmMessage"
        icon="question"
        :buttons="['yes', 'no']"
        @yes="onConfirmYes"
        @no="onConfirmNo"
        @close="onConfirmNo"
      />

      <!-- PLC 控制失败 → QMessageBox::warning 单按钮 -->
      <QtMessageBox
        v-if="errorVisible"
        title="控制失败"
        :message="errorMessage"
        icon="warning"
        :buttons="['ok']"
        @ok="errorVisible = false"
        @close="errorVisible = false"
      />

    </div>
  </div>
</template>

<style scoped lang="scss">
.voice-feedback {
  padding: 6px 10px;
  border-top: 1px solid #d0d0d0;
  font-size: 12px;
  color: #666;
  flex-shrink: 0;
}

.voice-row {
  display: flex;
  justify-content: space-between;
  line-height: 24px;

  .playing {
    color: #168449;
    font-weight: 600;
  }
}

.plc-overlay {
  position: fixed;
  inset: 0;
  z-index: 1500;
  /* 对齐 Qt 非模态挂靠按钮旁，无遮罩压暗 */
  background: transparent;
}

/* 定位由 anchor 决定；高度随开关条数收缩，不再固定撑满 */
.plc-dialog {
  position: fixed;
  box-sizing: border-box;
  background: #f0f0f0;
  border: 1px solid #a0a0a0;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.28);
  font-family: 'Microsoft YaHei', 'Segoe UI', sans-serif;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: auto;
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
  flex: 0 1 auto;
  min-height: 0;
  margin: 2px 4px 4px;
  padding: 2px 6px;
  border: 1px solid #c8c8c8;
  background: #f5f5f5;
  display: flex;
  flex-direction: column;
  gap: 2px;
  box-sizing: border-box;
  overflow-y: auto;
  overflow-x: hidden;
}

.status-sep {
  margin: 4px 0 2px;
  padding-top: 4px;
  border-top: 1px solid #c8c8c8;
  font-size: 11px;
  color: #666;
  line-height: 1.2;
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 18px;

  &.is-readonly .switch-label {
    color: #444;
  }
}

.switch-label {
  font-size: 12px;
  color: #1a1a1a;
  white-space: nowrap;
  line-height: 1;
}

.switch-btn {
  width: 36px;
  height: 18px;
  padding: 0;
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  img {
    width: 32px;
    height: 16px;
    object-fit: contain;
    display: block;
    pointer-events: none;
  }

  &:focus-visible {
    outline: 1px solid #0078d7;
    outline-offset: 1px;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  &.is-readonly:disabled {
    cursor: default;
    opacity: 1;
  }

  &.is-loading {
    opacity: 1;
  }
}

</style>
