<script setup lang="ts">
import WorkflowIcons, { type WorkflowStepKey } from '@/components/WorkflowIcons.vue'
import TruckScene from '@/components/TruckScene.vue'
import HardwareStatusBar from '@/components/HardwareStatusBar.vue'
import type { PlcSignalLights, PlcXrayBits, XrayMachinePhase } from '@/utils/plcXrayStatus'

defineProps<{
  bookingActive?: boolean
  bookingPending?: boolean
  distance?: number
  gateOnline?: boolean
  gateOpen?: boolean
  xrayPhase?: XrayMachinePhase
  xrayBits?: PlcXrayBits
  signalLights?: PlcSignalLights
  kv200?: string
  ma200?: string
  temp200?: string
  kv160?: string
  ma160?: string
  temp160?: string
}>()

const emit = defineEmits<{
  workflowClick: [key: WorkflowStepKey]
  talkClick: []
  dmTempClick: []
}>()
</script>

<template>
  <div class="left-bottom">
    <WorkflowIcons
      :booking-active="bookingActive"
      :booking-pending="bookingPending"
      :gate-online="gateOnline"
      :gate-open="gateOpen"
      :xray-phase="xrayPhase"
      @click="emit('workflowClick', $event)"
    />

    <TruckScene :distance="distance" />

    <HardwareStatusBar
      :kv200="kv200"
      :ma200="ma200"
      :temp200="temp200"
      :kv160="kv160"
      :ma160="ma160"
      :temp160="temp160"
      :xray-bits="xrayBits"
      :signal-lights="signalLights"
      @talk-click="emit('talkClick')"
      @dm-temp-click="emit('dmTempClick')"
    />
  </div>
</template>

<style scoped lang="scss">
.left-bottom {
  display: flex;
  flex-direction: column;
  width: 100%;
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}
</style>
