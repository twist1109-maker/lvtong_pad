<script setup lang="ts">
/**
 * Qt QMessageBox 风格确认框
 * 对齐 LvTongPro::onStopClicked / onPLCStopChanged 等处的 QMessageBox::question
 */
export type MessageBoxIcon = 'question' | 'warning' | 'info' | 'critical'
export type MessageBoxButton = 'yes' | 'no' | 'ok'

const props = withDefaults(
  defineProps<{
    title?: string
    message: string
    icon?: MessageBoxIcon
    /** 显示的按钮，默认 是/否 */
    buttons?: MessageBoxButton[]
    /** 是否允许点遮罩关闭（Qt QMessageBox 通常不允许） */
    closeOnOverlay?: boolean
  }>(),
  {
    title: '系统提醒',
    icon: 'question',
    buttons: () => ['yes', 'no'],
    closeOnOverlay: false,
  },
)

const emit = defineEmits<{
  yes: []
  no: []
  ok: []
  close: []
}>()

function onOverlayClick() {
  if (props.closeOnOverlay) emit('close')
}

function onTitleClose() {
  // 对齐 QMessageBox 点 X：等价于取消/否（有否则否，否则关闭）
  if (props.buttons.includes('no')) {
    emit('no')
  } else if (props.buttons.includes('ok')) {
    emit('ok')
  } else {
    emit('close')
  }
}
</script>

<template>
  <div class="qt-msgbox-overlay" @click.self="onOverlayClick">
    <div
      class="qt-msgbox"
      role="alertdialog"
      aria-modal="true"
      :aria-labelledby="'qt-msgbox-title'"
      @click.stop
    >
      <!-- 标题栏 — 对齐 Windows QMessageBox 标题 -->
      <div class="qt-msgbox-titlebar">
        <span id="qt-msgbox-title" class="qt-msgbox-title">{{ title }}</span>
        <button type="button" class="qt-msgbox-x" title="关闭" @click="onTitleClose">
          ×
        </button>
      </div>

      <div class="qt-msgbox-body">
        <div class="qt-msgbox-icon" :class="`is-${icon}`" aria-hidden="true">
          <span v-if="icon === 'question'">?</span>
          <span v-else-if="icon === 'warning'">!</span>
          <span v-else-if="icon === 'critical'">✕</span>
          <span v-else>i</span>
        </div>
        <p class="qt-msgbox-message">{{ message }}</p>
      </div>

      <div class="qt-msgbox-footer">
        <button
          v-if="buttons.includes('yes')"
          type="button"
          class="qt-btn qt-btn-yes"
          autofocus
          @click="emit('yes')"
        >
          是(Yes)
        </button>
        <button
          v-if="buttons.includes('no')"
          type="button"
          class="qt-btn qt-btn-no"
          @click="emit('no')"
        >
          否(No)
        </button>
        <button
          v-if="buttons.includes('ok')"
          type="button"
          class="qt-btn"
          autofocus
          @click="emit('ok')"
        >
          确定
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.qt-msgbox-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 对齐 Windows 风格 QMessageBox 尺寸与层次 */
.qt-msgbox {
  width: 380px;
  max-width: 92vw;
  background: #f0f0f0;
  border: 1px solid #a0a0a0;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.28);
  font-family: 'Microsoft YaHei', 'Segoe UI', sans-serif;
  overflow: hidden;
}

.qt-msgbox-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 32px;
  padding: 0 8px 0 12px;
  background: linear-gradient(180deg, #ffffff 0%, #f0f0f0 100%);
  border-bottom: 1px solid #d0d0d0;
}

.qt-msgbox-title {
  font-size: 13px;
  font-weight: 600;
  color: #1a1a1a;
  user-select: none;
}

.qt-msgbox-x {
  width: 28px;
  height: 24px;
  border: none;
  background: transparent;
  font-size: 18px;
  line-height: 1;
  color: #333;
  cursor: pointer;
  border-radius: 2px;

  &:hover {
    background: #e81123;
    color: #fff;
  }
}

.qt-msgbox-body {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 22px 20px 16px;
  background: #fff;
  min-height: 72px;
}

.qt-msgbox-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: 700;
  color: #fff;

  &.is-question {
    background: #0078d7;
  }

  &.is-warning {
    background: #ffb900;
    color: #1a1a1a;
  }

  &.is-critical {
    background: #e81123;
    font-size: 16px;
  }

  &.is-info {
    background: #0078d7;
    font-size: 18px;
    font-family: Georgia, serif;
    font-style: italic;
  }
}

.qt-msgbox-message {
  flex: 1;
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.55;
  color: #1a1a1a;
  white-space: pre-wrap;
  word-break: break-word;
}

.qt-msgbox-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  background: #f0f0f0;
  border-top: 1px solid #e0e0e0;
}

.qt-btn {
  min-width: 78px;
  height: 26px;
  padding: 0 14px;
  border: 1px solid #adadad;
  border-radius: 2px;
  background: linear-gradient(180deg, #fdfdfd 0%, #f0f0f0 100%);
  color: #1a1a1a;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;

  &:hover {
    border-color: #0078d7;
    background: linear-gradient(180deg, #eaf4fc 0%, #d8ebf8 100%);
  }

  &:active {
    background: #cce4f7;
  }

  &:focus {
    outline: 1px solid #0078d7;
    outline-offset: 1px;
  }
}
</style>
