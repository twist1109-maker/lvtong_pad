<script setup lang="ts">
/**
 * 车辆长宽高编辑 — 对齐 Qt CarSizeDialog（精简版）
 */
import { ref, watch } from 'vue'

const props = defineProps<{
  visible: boolean
  /** 显示串 长Xm|宽Ym|高Zm 或 毫米串 */
  value?: string
}>()

const emit = defineEmits<{
  confirm: [display: string]
  cancel: []
}>()

const lengthM = ref('0.00')
const widthM = ref('0.00')
const heightM = ref('0.00')

function parseIncoming(raw?: string) {
  if (!raw) {
    lengthM.value = '0.00'
    widthM.value = '0.00'
    heightM.value = '0.00'
    return
  }
  const m = raw.match(/长\s*([\d.]+)\s*m\s*\|\s*宽\s*([\d.]+)\s*m\s*\|\s*高\s*([\d.]+)\s*m/i)
  if (m) {
    lengthM.value = Number(m[1]).toFixed(2)
    widthM.value = Number(m[2]).toFixed(2)
    heightM.value = Number(m[3]).toFixed(2)
    return
  }
  const parts = raw.split('|')
  if (parts.length === 3 && !raw.includes('m')) {
    lengthM.value = (Number(parts[0]) / 1000).toFixed(2)
    widthM.value = (Number(parts[1]) / 1000).toFixed(2)
    heightM.value = (Number(parts[2]) / 1000).toFixed(2)
  }
}

watch(
  () => props.visible,
  (v) => {
    if (v) parseIncoming(props.value)
  },
)

function onConfirm() {
  const display = `长${Number(lengthM.value).toFixed(2)}m|宽${Number(widthM.value).toFixed(2)}m|高${Number(heightM.value).toFixed(2)}m`
  emit('confirm', display)
}
</script>

<template>
  <div v-if="visible" class="carsize-overlay" @click.self="emit('cancel')">
    <div class="carsize-box" role="dialog" aria-modal="true" @click.stop>
      <div class="carsize-title">车辆尺寸</div>
      <div class="carsize-row">
        <label>长(m)</label>
        <input v-model="lengthM" type="number" step="0.01" min="0" />
      </div>
      <div class="carsize-row">
        <label>宽(m)</label>
        <input v-model="widthM" type="number" step="0.01" min="0" />
      </div>
      <div class="carsize-row">
        <label>高(m)</label>
        <input v-model="heightM" type="number" step="0.01" min="0" />
      </div>
      <div class="carsize-actions">
        <button type="button" class="btn-cancel" @click="emit('cancel')">取消</button>
        <button type="button" class="btn-ok" @click="onConfirm">确定</button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.carsize-overlay {
  position: fixed;
  inset: 0;
  z-index: 1800;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
}

.carsize-box {
  width: 320px;
  background: #fff;
  border-radius: 6px;
  padding: 16px 20px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  font-family: 'Microsoft YaHei', sans-serif;
}

.carsize-title {
  font-size: 16px;
  font-weight: bold;
  color: #2c3e50;
  margin-bottom: 14px;
}

.carsize-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;

  label {
    width: 48px;
    font-size: 13px;
    color: #333;
  }

  input {
    flex: 1;
    height: 32px;
    border: 1px solid #ccc;
    border-radius: 3px;
    padding: 0 8px;
  }
}

.carsize-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 14px;
}

.btn-cancel,
.btn-ok {
  min-width: 72px;
  height: 30px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
}

.btn-cancel {
  border: 1px solid #ccc;
  background: #f5f5f5;
}

.btn-ok {
  border: none;
  background: #059669;
  color: #fff;
}
</style>
