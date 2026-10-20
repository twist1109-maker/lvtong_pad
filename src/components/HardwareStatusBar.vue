<script setup lang="ts">
import { computed } from 'vue'
import type { PlcSignalLights, PlcXrayBits } from '@/utils/plcXrayStatus'
import { xrayDtImg160, xrayDtImg200 } from '@/utils/plcXrayStatus'

const emit = defineEmits<{
  talkClick: []
  dmTempClick: []
}>()

const props = withDefaults(
  defineProps<{
    kv200?: string
    ma200?: string
    temp200?: string
    kv160?: string
    ma160?: string
    temp160?: string
    xrayBits?: PlcXrayBits
    signalLights?: PlcSignalLights
  }>(),
  {
    kv200: '-',
    ma200: '-',
    temp200: '-',
    kv160: '-',
    ma160: '-',
    temp160: '-',
    xrayBits: () => ({
      source200: false,
      source160: false,
      gate200: false,
      gate160: false,
    }),
    signalLights: () => ({
      red: false,
      yellow: false,
      green: false,
      fillLight: false,
    }),
  },
)

const img200 = computed(() => xrayDtImg200(props.xrayBits))
const img160 = computed(() => xrayDtImg160(props.xrayBits))

const PLC_GRAY = '/assets/img/a_plc_gray.png'
const redIcon = computed(() =>
  props.signalLights.red ? '/assets/img/a_plc_red.png' : PLC_GRAY,
)
const yellowIcon = computed(() =>
  props.signalLights.yellow ? '/assets/img/a_plc_yellow.png' : PLC_GRAY,
)
const greenIcon = computed(() =>
  props.signalLights.green ? '/assets/img/a_plc_green.png' : PLC_GRAY,
)
const fillLightIcon = computed(() =>
  props.signalLights.fillLight
    ? '/assets/img/a_plc_greatlight.png'
    : '/assets/img/a_plc_greatlight_gray.png',
)
</script>

<template>
  <div class="hardware-bar">
    <div class="section xray-section">
      <img :src="img200" class="xray-stack-icon" alt="X光200" />
      <span class="stat">
        <img src="/assets/img/a_v.png" class="stat-icon" alt="" />
        {{ kv200 }}kV
      </span>
      <span class="stat">
        <img src="/assets/img/a_a.png" class="stat-icon" alt="" />
        {{ ma200 }}mA
      </span>
      <span class="stat">
        <img src="/assets/img/a_o.png" class="stat-icon" alt="" />
        {{ temp200 }}℃
      </span>
    </div>

    <div class="section center-section">
      <span class="mini-label">DM温度</span>
      <button type="button" class="icon-btn" title="DM温度监测" @click="emit('dmTempClick')">
        <img src="/assets/img/tempature_green.png" class="mini-icon" alt="" />
      </button>
      <span class="mini-label">对讲</span>
      <button type="button" class="icon-btn" title="视频喊话" @click="emit('talkClick')">
        <img src="/assets/img/a_camera_talk.png" class="mini-icon" alt="" />
      </button>
      <span class="mini-label">信号灯</span>
      <img :src="redIcon" class="plc-icon" :class="{ on: signalLights.red }" title="红灯" alt="" />
      <img
        :src="yellowIcon"
        class="plc-icon"
        :class="{ on: signalLights.yellow }"
        title="黄灯"
        alt=""
      />
      <img
        :src="greenIcon"
        class="plc-icon"
        :class="{ on: signalLights.green }"
        title="绿灯"
        alt=""
      />
      <img :src="fillLightIcon" class="plc-icon" title="补光灯" alt="" />
    </div>

    <div class="section xray-section">
      <img :src="img160" class="xray-stack-icon" alt="X光160" />
      <span class="stat">
        <img src="/assets/img/a_v.png" class="stat-icon" alt="" />
        {{ kv160 }}kV
      </span>
      <span class="stat">
        <img src="/assets/img/a_a.png" class="stat-icon" alt="" />
        {{ ma160 }}mA
      </span>
      <span class="stat">
        <img src="/assets/img/a_o.png" class="stat-icon" alt="" />
        {{ temp160 }}℃
      </span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.hardware-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 4px 12px;
  min-height: 36px;
  border-top: none;
  background: #fff;
  flex: 0 0 auto;
  margin-top: 0;
  margin-bottom: 0;
}

.section {
  display: flex;
  align-items: center;
  justify-content: space-evenly;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.center-section {
  flex: 1.2;
}

.xray-section:first-child {
  justify-content: flex-start;
  padding-left: 28px;
}

.xray-section:last-child {
  justify-content: flex-end;
  padding-right: 4px;
}

.xray-stack-icon {
  width: 36px;
  height: auto;
  max-height: 32px;
  object-fit: contain;
  flex-shrink: 0;
}

.stat {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 12px;
  font-weight: bold;
  color: #666;
  white-space: nowrap;
}

.stat-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.mini-label {
  font-size: 8px;
  color: #333;
  white-space: nowrap;
}

.icon-btn {
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  display: inline-flex;
  line-height: 0;
}

.mini-icon {
  width: 16px;
  height: 16px;
  object-fit: contain;
}

.plc-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
  flex-shrink: 0;
}
</style>
