<script setup lang="ts">
import { computed } from 'vue'
import { SEGMENT_PIX, START_POS_X, SCENE_WIDTH } from '@/constants/workflowLayout'
import type { XrayMachinePhase } from '@/utils/plcXrayStatus'
import { XRAY_PHASE_ICONS } from '@/utils/plcXrayStatus'

export type WorkflowStepKey = 'book' | 'gate' | 'xray' | 'camera' | 'audit'

interface WorkflowItem {
  key: WorkflowStepKey
  label: string
  icon: string
  wide?: boolean
  title?: string
}

const props = withDefaults(
  defineProps<{
    bookingActive?: boolean
    /** 待受理：预约图标闪烁 */
    bookingPending?: boolean
    /** 栏杆在线 — 对齐 GateUIController */
    gateOnline?: boolean
    /** 栏杆抬起 */
    gateOpen?: boolean
    /** 光机三态：空闲 / 预热 / 工作 */
    xrayPhase?: XrayMachinePhase
  }>(),
  {
    bookingActive: false,
    bookingPending: false,
    gateOnline: false,
    gateOpen: false,
    xrayPhase: 'idle',
  },
)

const emit = defineEmits<{
  click: [key: WorkflowStepKey]
}>()

const gateIcon = computed(() => {
  if (!props.gateOnline) return '/assets/img/a_zj.png'
  return props.gateOpen
    ? '/assets/img/a_zj_online_up.png'
    : '/assets/img/a_zj_online.png'
})

const gateTitle = computed(() => {
  if (!props.gateOnline) return '栏杆机未连接'
  return props.gateOpen
    ? '栏杆机状态：开启\n点击切换开关状态'
    : '栏杆机状态：关闭\n点击切换开关状态'
})

const xrayIcon = computed(
  () => XRAY_PHASE_ICONS[props.xrayPhase] ?? XRAY_PHASE_ICONS.idle,
)

const items = computed<WorkflowItem[]>(() => [
  { key: 'book', label: '预约', icon: '/assets/img/a_lc_online.png', wide: true },
  {
    key: 'gate',
    label: '闸机',
    icon: gateIcon.value,
    wide: true,
    title: gateTitle.value,
  },
  { key: 'xray', label: '光机', icon: xrayIcon.value },
  { key: 'camera', label: '拍照', icon: '/assets/img/a_xj_offline.png' },
  { key: 'audit', label: '审核', icon: '/assets/img/a_sh.png' },
])

const leadSpacerPct = `${(START_POS_X / SCENE_WIDTH) * 100}%`
const cellWidthPct = `${(SEGMENT_PIX / SCENE_WIDTH) * 100}%`
</script>

<template>
  <div class="workflow-icons">
    <div class="workflow-row">
      <div class="lead-spacer" :style="{ width: leadSpacerPct }" />
      <button
        v-for="item in items"
        :key="item.key"
        type="button"
        class="wf-btn"
        :class="{
          'is-book-pending': item.key === 'book' && bookingPending,
          'is-book-disabled': item.key === 'book' && bookingActive,
        }"
        :style="{ width: cellWidthPct }"
        :title="
          item.key === 'book' && bookingActive
            ? '检测进行中，无法预约'
            : item.title || item.label
        "
        :disabled="item.key === 'book' && bookingActive"
        @click="emit('click', item.key)"
      >
        <img
          :src="item.icon"
          :alt="item.label"
          class="wf-icon"
          :class="{ wide: item.wide, blink: item.key === 'book' && bookingPending }"
        />
        <span
          class="wf-label"
          :class="{
            active: item.key === 'book' && bookingActive,
            pending: item.key === 'book' && bookingPending,
          }"
        >
          {{ item.label }}
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
/* 吃满虚线以上空间，图标等比放大后垂直居中 */
.workflow-icons {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: center;
  padding: 4px 0 2px;
}

.workflow-row {
  display: flex;
  align-items: flex-start;
  width: 100%;
}

.lead-spacer {
  flex-shrink: 0;
}

.wf-btn {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  min-width: 0;

  &:hover {
    opacity: 0.9;
  }
}

/* 相对原 Qt 再放大一档，对齐目标图饱满观感 */
.wf-icon {
  width: 52px;
  height: 52px;
  object-fit: contain;

  &.wide {
    width: 104px;
    height: 52px;
  }

  &.blink {
    animation: book-blink 1s ease-in-out infinite;
  }
}

.wf-label {
  font-size: 14px;
  font-weight: bold;
  color: #333;
  white-space: nowrap;

  &.active {
    color: #059669;
  }

  &.pending {
    color: #d97706;
  }
}

.wf-btn.is-book-disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

@keyframes book-blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.25;
  }
}
</style>
