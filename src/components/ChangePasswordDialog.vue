<script setup lang="ts">
/**
 * 修改密码弹窗 — 对齐 Qt ChangePasswordDialog
 * 尺寸 400×250，表单校验逻辑与 Qt 一致；不调用后端接口
 */
import { ref } from 'vue'
import QtMessageBox from '@/components/common/QtMessageBox.vue'

const emit = defineEmits<{
  close: []
  success: []
}>()

const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')

const alertVisible = ref(false)
const alertTitle = ref('警告')
const alertMessage = ref('')
const alertIcon = ref<'warning' | 'critical' | 'info'>('warning')
let pendingClose = false

function showAlert(
  title: string,
  message: string,
  icon: 'warning' | 'critical' | 'info' = 'warning',
  closeAfter = false,
) {
  alertTitle.value = title
  alertMessage.value = message
  alertIcon.value = icon
  pendingClose = closeAfter
  alertVisible.value = true
}

function onAlertDone() {
  alertVisible.value = false
  if (pendingClose) {
    pendingClose = false
    emit('success')
    emit('close')
  }
}

function onConfirm() {
  if (!oldPassword.value) {
    showAlert('警告', '请输入原密码！')
    return
  }
  if (!newPassword.value) {
    showAlert('警告', '请输入新密码！')
    return
  }
  if (newPassword.value.length < 6) {
    showAlert('警告', '新密码长度不能少于6位！')
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    showAlert('警告', '两次输入的新密码不一致！')
    return
  }
  if (oldPassword.value === newPassword.value) {
    showAlert('警告', '新密码不能与原密码相同！')
    return
  }

  // 对齐 Qt 成功提示；不请求后端
  showAlert('成功', '密码修改成功！', 'info', true)
}

function onCancel() {
  emit('close')
}
</script>

<template>
  <div class="pwd-overlay" @click.self="onCancel">
    <div class="pwd-dialog" role="dialog" aria-modal="true" aria-labelledby="pwd-title">
      <div class="pwd-titlebar">
        <div class="pwd-title-left">
          <img class="pwd-logo" src="/assets/img/logo.png" alt="" />
          <span id="pwd-title">修改密码</span>
        </div>
        <button type="button" class="pwd-x" title="关闭" @click="onCancel">×</button>
      </div>

      <div class="pwd-body">
        <div class="pwd-form-box">
          <div class="pwd-row">
            <label>原密码:</label>
            <input
              v-model="oldPassword"
              type="password"
              placeholder="请输入原密码"
              autocomplete="current-password"
            />
          </div>
          <div class="pwd-row">
            <label>新密码:</label>
            <input
              v-model="newPassword"
              type="password"
              placeholder="请输入新密码"
              autocomplete="new-password"
            />
          </div>
          <div class="pwd-row">
            <label>确认新密码:</label>
            <input
              v-model="confirmPassword"
              type="password"
              placeholder="请再次输入新密码"
              autocomplete="new-password"
              @keyup.enter="onConfirm"
            />
          </div>
        </div>

        <div class="pwd-footer">
          <button type="button" class="pwd-btn" @click="onConfirm">确认</button>
          <button type="button" class="pwd-btn" @click="onCancel">取消</button>
        </div>
      </div>
    </div>
  </div>

  <QtMessageBox
    v-if="alertVisible"
    :title="alertTitle"
    :message="alertMessage"
    :icon="alertIcon"
    :buttons="['yes']"
    @yes="onAlertDone"
    @close="onAlertDone"
  />
</template>

<style scoped lang="scss">
.pwd-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
}

.pwd-dialog {
  width: 400px;
  height: 250px;
  background: #f5f5f5;
  border: 1px solid #b0b0b0;
  border-radius: 6px 6px 2px 2px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: 'Microsoft YaHei', 'Segoe UI', sans-serif;
}

.pwd-titlebar {
  height: 32px;
  padding: 0 8px 0 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(180deg, #fafafa 0%, #ececec 100%);
  border-bottom: 1px solid #d0d0d0;
  flex-shrink: 0;
}

.pwd-title-left {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #222;
}

.pwd-logo {
  width: 16px;
  height: 16px;
  object-fit: contain;
}

.pwd-x {
  width: 28px;
  height: 24px;
  border: none;
  background: transparent;
  font-size: 18px;
  line-height: 1;
  color: #555;
  cursor: pointer;
  border-radius: 2px;

  &:hover {
    background: #e81123;
    color: #fff;
  }
}

.pwd-body {
  flex: 1;
  padding: 16px 20px 12px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.pwd-form-box {
  flex: 1;
  border: 1px solid #ddd;
  border-radius: 5px;
  background: #f0f0f0;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pwd-row {
  display: flex;
  align-items: center;
  gap: 10px;

  label {
    width: 88px;
    flex-shrink: 0;
    text-align: right;
    font-size: 13px;
    color: #222;
  }

  input {
    flex: 1;
    height: 28px;
    padding: 0 8px;
    border: 1px solid #ccc;
    border-radius: 3px;
    background: #fff;
    font-size: 13px;
    outline: none;

    &::placeholder {
      color: #999;
    }

    &:focus {
      border-color: #5fbb9e;
    }
  }
}

.pwd-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 12px;
  flex-shrink: 0;
}

.pwd-btn {
  min-width: 80px;
  height: 30px;
  padding: 0 15px;
  border: 1px solid #c0c0c0;
  border-radius: 3px;
  background: #f8f8f8;
  font-size: 13px;
  color: #222;
  cursor: pointer;

  &:hover {
    background: #e0e0e0;
  }
}
</style>
