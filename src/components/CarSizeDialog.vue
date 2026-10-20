<script setup lang="ts">
/**
 * 货车轮廓尺寸修改 — 对齐 Qt CarSizeDialog.ui / CarSizeDialog.cpp
 * 固定尺寸 294×211；输出格式：长Xm|宽Ym|高Zm
 * 仅前端交互，不请求后端
 */
import { ref, watch } from 'vue'

const props = defineProps<{
  /** 当前尺寸串，如 长12.00m|宽2.50m|高3.80m */
  modelValue?: string
}>()

const emit = defineEmits<{
  close: []
  confirm: [sizeText: string]
}>()

const lengthM = ref('')
const widthM = ref('')
const heightM = ref('')

/** 对齐 FormatEditInput：仅允许数字与一个小数点 */
function filterNumeric(raw: string): string {
  let out = ''
  let dotSeen = false
  for (const ch of raw) {
    if (ch >= '0' && ch <= '9') {
      out += ch
    } else if (ch === '.' && !dotSeen) {
      out += ch
      dotSeen = true
    }
  }
  return out
}

function onLengthInput(e: Event) {
  const el = e.target as HTMLInputElement
  lengthM.value = filterNumeric(el.value)
}
function onWidthInput(e: Event) {
  const el = e.target as HTMLInputElement
  widthM.value = filterNumeric(el.value)
}
function onHeightInput(e: Event) {
  const el = e.target as HTMLInputElement
  heightM.value = filterNumeric(el.value)
}

/** 对齐 setCarSizeStr */
function parseIncoming(raw?: string) {
  if (!raw?.trim()) {
    lengthM.value = ''
    widthM.value = ''
    heightM.value = ''
    return
  }
  const cleaned = raw.replace(/长/g, '').replace(/宽/g, '').replace(/高/g, '').replace(/m/g, '')
  const parts = cleaned.split('|')
  if (parts.length === 3) {
    lengthM.value = parts[0].trim()
    widthM.value = parts[1].trim()
    heightM.value = parts[2].trim()
  } else {
    lengthM.value = ''
    widthM.value = ''
    heightM.value = ''
  }
}

watch(
  () => props.modelValue,
  (v) => parseIncoming(v),
  { immediate: true },
)

/** 对齐 GetCarSizeStr */
function getCarSizeStr(): string {
  if (!lengthM.value || !widthM.value || !heightM.value) return ''
  const lenVal = Number(lengthM.value).toFixed(2)
  const widthVal = Number(widthM.value).toFixed(2)
  const heightVal = Number(heightM.value).toFixed(2)
  if (Number.isNaN(Number(lenVal)) || Number.isNaN(Number(widthVal)) || Number.isNaN(Number(heightVal))) {
    return ''
  }
  return `长${lenVal}m|宽${widthVal}m|高${heightVal}m`
}

function onOk() {
  const text = getCarSizeStr()
  if (!text) {
    emit('close')
    return
  }
  emit('confirm', text)
  emit('close')
}

function onCancel() {
  emit('close')
}
</script>

<template>
  <div class="carsz-overlay" @click.self="onCancel">
    <div
      class="carsz-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="carsz-title"
      @click.stop
    >
      <div class="carsz-titlebar">
        <div class="carsz-title-left">
          <img class="carsz-logo" src="/assets/img/logo.png" alt="" />
          <span id="carsz-title">货车轮廓尺寸修改</span>
        </div>
        <button type="button" class="carsz-x" title="关闭" @click="onCancel">×</button>
      </div>

      <div class="carsz-body">
        <div class="carsz-group">
          <div class="carsz-row">
            <label>车长(m):</label>
            <input
              :value="lengthM"
              type="text"
              inputmode="decimal"
              placeholder="（0m~30.00m)"
              @input="onLengthInput"
            />
          </div>
          <div class="carsz-row">
            <label>车宽(m):</label>
            <input
              :value="widthM"
              type="text"
              inputmode="decimal"
              placeholder="（0m~2.55m)"
              @input="onWidthInput"
            />
          </div>
          <div class="carsz-row">
            <label>车高(m):</label>
            <input
              :value="heightM"
              type="text"
              inputmode="decimal"
              placeholder="（0m~4.00m)"
              @input="onHeightInput"
              @keyup.enter="onOk"
            />
          </div>
        </div>

        <div class="carsz-footer">
          <button type="button" class="btn-ok" @click="onOk">确定</button>
          <button type="button" class="btn-exit" @click="onCancel">退出</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.carsz-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
}

/* Qt 294×211 ×1.5 → 441×317 */
.carsz-dialog {
  width: 441px;
  height: 317px;
  background: #f0f0f0;
  border: 1px solid #b0b0b0;
  border-radius: 9px 9px 3px 3px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.22);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: 'Microsoft YaHei', 'Segoe UI', sans-serif;
}

.carsz-titlebar {
  height: 42px;
  padding: 0 9px 0 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(180deg, #fafafa 0%, #ececec 100%);
  border-bottom: 1px solid #d0d0d0;
  flex-shrink: 0;
}

.carsz-title-left {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  color: #222;
}

.carsz-logo {
  width: 21px;
  height: 21px;
  object-fit: contain;
}

.carsz-x {
  width: 39px;
  height: 33px;
  border: none;
  background: transparent;
  font-size: 24px;
  line-height: 1;
  color: #555;
  cursor: pointer;
  border-radius: 3px;

  &:hover {
    background: #e81123;
    color: #fff;
  }
}

.carsz-body {
  flex: 1;
  padding: 12px 15px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.carsz-group {
  flex: 1;
  border: 1px solid #c8c8c8;
  border-radius: 3px;
  background: #ececec;
  padding: 12px 15px;
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;
  gap: 9px;
}

.carsz-row {
  display: flex;
  align-items: center;
  gap: 12px;

  label {
    width: 87px;
    flex-shrink: 0;
    font-size: 18px;
    color: #222;
    text-align: left;
  }

  input {
    flex: 1;
    height: 42px;
    padding: 0 12px;
    border: 1px solid #bbb;
    border-radius: 3px;
    background: #fff;
    font-size: 18px;
    outline: none;

    &::placeholder {
      color: #888;
    }

    &:focus {
      border-color: #5fbb9e;
    }
  }
}

.carsz-footer {
  display: flex;
  justify-content: center;
  gap: 15px;
  padding-top: 12px;
  flex-shrink: 0;
}

.btn-ok,
.btn-exit {
  width: 90px;
  height: 42px;
  padding: 0;
  border-radius: 3px;
  font-size: 18px;
  color: #222;
  background: #fff;
  cursor: pointer;
}

/* 对齐截图：确定为蓝边，退出为灰边 */
.btn-ok {
  border: 1px solid #0078d7;

  &:hover {
    background: #e5f1fb;
  }
}

.btn-exit {
  border: 1px solid #8a8a8a;

  &:hover {
    background: #f0f0f0;
  }
}
</style>
