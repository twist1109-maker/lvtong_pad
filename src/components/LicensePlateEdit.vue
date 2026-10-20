<script setup lang="ts">
/**
 * 车牌修改弹窗 — 1:1 对齐 Qt LicensePlateDialog
 * 尺寸 900×700：号牌输入 + 三态虚拟键盘 + 10 色单选 + 取消/确认
 */
import { computed, nextTick, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    currentPlate?: string
    currentColor?: string
    title?: string
  }>(),
  {
    currentPlate: '',
    currentColor: '',
    title: '车牌修改',
  },
)

const emit = defineEmits<{
  confirm: [plate: string, color: string]
  close: []
}>()

type KeyboardMode = 'province' | 'letter' | 'number'

const PROVINCES = [
  '京', '津', '沪', '渝', '冀', '豫', '云', '辽', '黑', '湘',
  '皖', '鲁', '新', '苏', '浙', '赣', '鄂', '桂', '甘', '晋',
  '蒙', '陕', '吉', '闽', '贵', '粤', '青', '藏', '川', '宁',
  '琼', '港', '澳', '台',
]

const LETTERS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K',
  'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'U', 'V',
  'W', 'X', 'Y', 'Z',
]

const NUMBERS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

/** 对齐截图两行布局；value 对齐 Qt QButtonGroup id */
const COLOR_OPTIONS = [
  { value: '0', label: '蓝色' },
  { value: '1', label: '黄色' },
  { value: '2', label: '黑色' },
  { value: '3', label: '白色' },
  { value: '4', label: '渐变绿色' },
  { value: '6', label: '蓝白渐变色' },
  { value: '5', label: '黄绿双拼色' },
  { value: '7', label: '临时牌照' },
  { value: '11', label: '绿色' },
  { value: '12', label: '红色' },
] as const

const VALID_COLORS = new Set<string>(COLOR_OPTIONS.map((c) => c.value))

const visible = ref(false)
const plate = ref('')
const color = ref('') // 空 = 未选，对齐 Qt checkedId==-1
const mode = ref<KeyboardMode>('province')
const tipVisible = ref(false)
const tipMessage = ref('')
const tipTop = ref(120)
const plateInputRef = ref<HTMLInputElement | null>(null)

const keys = computed(() => {
  if (mode.value === 'letter') return LETTERS
  if (mode.value === 'number') return NUMBERS
  return PROVINCES
})

function normalizeColor(raw?: string): string {
  if (!raw) return ''
  const s = String(raw).trim()
  if (VALID_COLORS.has(s)) return s
  // 兼容中文色名
  const byLabel = COLOR_OPTIONS.find((c) => c.label === s)
  return byLabel?.value ?? ''
}

function show() {
  const p = props.currentPlate?.trim() || ''
  plate.value = p === '--' ? '' : p
  color.value = normalizeColor(props.currentColor)
  mode.value = 'province'
  tipVisible.value = false
  visible.value = true
  nextTick(() => plateInputRef.value?.focus())
}

function hide() {
  visible.value = false
  tipVisible.value = false
  emit('close')
}

function setMode(m: KeyboardMode) {
  mode.value = m
}

function insertKey(ch: string) {
  plate.value = `${plate.value}${ch}`
}

function onBackspace() {
  if (!plate.value) return
  plate.value = plate.value.slice(0, -1)
}

function onClear() {
  plate.value = ''
}

function showTip(msg: string, near: 'plate' | 'color' = 'plate') {
  tipMessage.value = msg
  tipTop.value = near === 'plate' ? 110 : 520
  tipVisible.value = true
  window.setTimeout(() => {
    tipVisible.value = false
  }, 2000)
}

function onConfirm() {
  const plateNumber = plate.value.trim()
  if (!plateNumber) {
    showTip('车牌号码不能为空 ！ ', 'plate')
    return
  }
  if (plateNumber.length <= 6 || plateNumber.length > 10) {
    showTip(`无效车牌号码: ${plateNumber}`, 'plate')
    return
  }
  if (!color.value || !VALID_COLORS.has(color.value)) {
    showTip('请选择车牌颜色 ! ', 'color')
    return
  }
  emit('confirm', plateNumber, color.value)
  visible.value = false
}

defineExpose({ show })
</script>

<template>
  <div v-if="visible" class="overlay" @click.self="hide">
    <div class="dialog" role="dialog" :aria-label="title">
      <div class="title-bar">
        <span class="title">{{ title }}</span>
        <button type="button" class="btn-x" title="关闭" @click="hide">×</button>
      </div>

      <div class="body">
        <label class="section-label" for="plate-input">车牌号码</label>
        <input
          id="plate-input"
          ref="plateInputRef"
          v-model="plate"
          class="plate-input"
          autocomplete="off"
          spellcheck="false"
        />

        <!-- 虚拟键盘 -->
        <div class="keyboard">
          <div class="kb-toolbar">
            <button
              type="button"
              class="mode-btn"
              :class="{ active: mode === 'province' }"
              @click="setMode('province')"
            >
              省份
            </button>
            <button
              type="button"
              class="mode-btn"
              :class="{ active: mode === 'letter' }"
              @click="setMode('letter')"
            >
              字母
            </button>
            <button
              type="button"
              class="mode-btn"
              :class="{ active: mode === 'number' }"
              @click="setMode('number')"
            >
              数字
            </button>
            <button type="button" class="func-btn" @click="onBackspace">退格</button>
            <button type="button" class="func-btn" @click="onClear">清空</button>
          </div>
          <div class="kb-grid">
            <button
              v-for="k in keys"
              :key="`${mode}-${k}`"
              type="button"
              class="key-btn"
              @click="insertKey(k)"
            >
              {{ k }}
            </button>
          </div>
        </div>

        <label class="section-label">车牌颜色</label>
        <div class="color-box">
          <label
            v-for="opt in COLOR_OPTIONS"
            :key="opt.value"
            class="color-item"
          >
            <input v-model="color" type="radio" name="plate-color" :value="opt.value" />
            <span>{{ opt.label }}</span>
          </label>
        </div>

        <div class="actions">
          <button type="button" class="btn-cancel" @click="hide">取消</button>
          <button type="button" class="btn-confirm" @click="onConfirm">确认</button>
        </div>
      </div>

      <div v-if="tipVisible" class="toast" :style="{ top: `${tipTop}px` }">
        {{ tipMessage }}
      </div>
    </div>
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
  z-index: 1300;
}

.dialog {
  position: relative;
  width: 900px;
  height: 700px;
  max-width: 98vw;
  max-height: 96vh;
  background: #f5f5f5;
  border: 1px solid #c8c8c8;
  border-radius: 2px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.22);
  font-family: 'Microsoft YaHei', 'Segoe UI', sans-serif;
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
  flex: 1;
  min-height: 0;
  padding: 16px 20px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: auto;
}

.section-label {
  font-size: 14px;
  color: #333;
  font-weight: 500;
}

.plate-input {
  width: 100%;
  box-sizing: border-box;
  height: 56px;
  padding: 8px 14px;
  border: 2px solid #ddd;
  border-radius: 8px;
  background: #fff;
  font-size: 24px;
  font-weight: 700;
  text-align: center;
  letter-spacing: 2px;
  color: #222;
  outline: none;
  &:focus {
    border-color: #007bff;
  }
}

.keyboard {
  background: transparent;
  flex-shrink: 0;
}

.kb-toolbar {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  margin-bottom: 10px;
}

.mode-btn,
.func-btn {
  min-height: 38px;
  font-size: 14px;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
}

.mode-btn {
  border: 2px solid #007bff;
  background: #e3f2fd;
  color: #0d47a1;
  &:hover {
    background: #bbdefb;
  }
  &.active {
    background: #007bff;
    color: #fff;
  }
}

.func-btn {
  border: 2px solid #dc3545;
  background: #fff;
  color: #dc3545;
  &:hover {
    background: #f8d7da;
  }
}

.kb-grid {
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 6px;
  min-height: 210px;
  align-content: start;
}

.key-btn {
  min-height: 48px;
  font-size: 18px;
  font-weight: 700;
  border: 2px solid #ddd;
  border-radius: 6px;
  background: #fff;
  color: #222;
  cursor: pointer;
  font-family: inherit;
  &:hover {
    background: #e9ecef;
    border-color: #007bff;
  }
  &:active {
    background: #007bff;
    color: #fff;
  }
}

.color-box {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px 12px;
  padding: 12px 14px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #fafafa;
}

.color-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: #333;
  cursor: pointer;
  user-select: none;

  input {
    width: 16px;
    height: 16px;
    accent-color: #007bff;
    cursor: pointer;
  }
}

.actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-top: auto;
  padding-top: 8px;
}

.btn-cancel,
.btn-confirm {
  min-height: 44px;
  border: none;
  border-radius: 4px;
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  cursor: pointer;
  font-family: inherit;
}

.btn-cancel {
  background: #6c757d;
  &:hover {
    opacity: 0.92;
  }
}

.btn-confirm {
  background: #007bff;
  &:hover {
    opacity: 0.92;
  }
}

.toast {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
  max-width: 80%;
  padding: 10px 18px;
  background: rgba(50, 50, 50, 0.92);
  color: #fff;
  border-radius: 6px;
  font-size: 14px;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  pointer-events: none;
}
</style>
