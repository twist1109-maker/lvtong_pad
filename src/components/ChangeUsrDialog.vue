<script setup lang="ts">
/**
 * 查验班组切换弹窗 — 对齐 Qt ChangeUsrDialog.ui / ChangeUsrDialog.cpp
 * 尺寸 500×400；仅前端校验与本地状态更新，不改后端
 */
import { onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/useAuthStore'
import QtMessageBox from '@/components/common/QtMessageBox.vue'

const emit = defineEmits<{
  close: []
  success: []
}>()

const auth = useAuthStore()

/** 对齐 Qt getUsersByRole(1) 复核人列表（登录页同源） */
const reviewers = [
  { name: '胡喆', phone: '18627774208' },
  { name: '吴凯立', phone: '18771903739' },
  { name: '王斌林', phone: '13971005568' },
  { name: '陈支源', phone: '15623150061' },
  { name: '徐露', phone: '19872071002' },
]

const username = ref('')
const password = ref('')
const reviewerPhone = ref(reviewers[0]?.phone ?? '')
const remember = ref(false)

const alertVisible = ref(false)
const alertMessage = ref('')
const alertIsSuccess = ref(false)

function showError(message: string) {
  alertMessage.value = message
  alertIsSuccess.value = false
  alertVisible.value = true
}

function showSuccess(message: string) {
  alertMessage.value = message
  alertIsSuccess.value = true
  alertVisible.value = true
}

function onAlertDone() {
  alertVisible.value = false
  if (alertIsSuccess.value) {
    alertIsSuccess.value = false
    emit('success')
    emit('close')
  }
}

onMounted(() => {
  // 默认带入当前登录账号 / 会话密码 / 登录复核人
  username.value = auth.user?.username || ''
  password.value = auth.sessionPassword || ''
  if (auth.reviewerPhone) {
    reviewerPhone.value = auth.reviewerPhone
  }

  try {
    const saved = localStorage.getItem('lvtong_change_usr')
    if (saved) {
      const data = JSON.parse(saved) as {
        username?: string
        password?: string
        reviewerPhone?: string
        remember?: boolean
      }
      // 「记住我」覆盖默认登录态（本弹窗专用记忆）
      if (data.remember) {
        username.value = data.username ?? username.value
        password.value = data.password ?? password.value
        if (data.reviewerPhone) reviewerPhone.value = data.reviewerPhone
        remember.value = true
      }
    }
  } catch {
    // ignore
  }
})

function onRememberChange() {
  if (!remember.value) {
    localStorage.removeItem('lvtong_change_usr')
  }
}

function onConfirm() {
  if (!username.value || !password.value) {
    showError('查验账号和密码不能为空 ！')
    return
  }

  const reviewer = reviewers.find((r) => r.phone === reviewerPhone.value)
  if (!reviewer) {
    showError('请选择复核人 ！')
    return
  }

  if (reviewer.phone === username.value) {
    showError('查验与复核人员不能相同 ！')
    return
  }

  if (remember.value) {
    localStorage.setItem(
      'lvtong_change_usr',
      JSON.stringify({
        username: username.value,
        password: password.value,
        reviewerPhone: reviewer.phone,
        remember: true,
      }),
    )
  } else {
    localStorage.removeItem('lvtong_change_usr')
  }

  // 本地更新当前显示用户与复核人（不请求后端）
  auth.applyLocalUserSwitch(
    {
      username: username.value,
      realName: username.value,
      phone: username.value,
      role: auth.user?.role ?? 1,
      groupId: auth.user?.groupId,
    },
    { phone: reviewer.phone, name: reviewer.name },
    password.value,
  )

  showSuccess('查验与复核人员切换成功 ！')
}

function onCancel() {
  emit('close')
}
</script>

<template>
  <div class="chg-overlay" @click.self="onCancel">
    <div class="chg-dialog" role="dialog" aria-modal="true" aria-labelledby="chg-title">
      <div class="chg-titlebar">
        <div class="chg-title-left">
          <img class="chg-logo" src="/assets/img/logo.png" alt="" />
          <span id="chg-title">查验班组切换</span>
        </div>
        <button type="button" class="chg-x" title="关闭" @click="onCancel">×</button>
      </div>

      <div class="chg-body">
        <label class="field-label">查验人账号</label>
        <input
          v-model="username"
          class="field-input"
          placeholder="请输入查验人账号"
          autocomplete="username"
        />

        <label class="field-label">密码</label>
        <input
          v-model="password"
          class="field-input"
          type="password"
          placeholder="请输入密码"
          autocomplete="current-password"
        />

        <label class="field-label">复核人</label>
        <select v-model="reviewerPhone" class="field-select">
          <option v-for="r in reviewers" :key="r.phone" :value="r.phone">
            {{ r.name }}-{{ r.phone }}
          </option>
        </select>

        <label class="remember">
          <input v-model="remember" type="checkbox" @change="onRememberChange" />
          记住我
        </label>

        <button type="button" class="btn-confirm" @click="onConfirm">确认</button>
      </div>
    </div>
  </div>

  <QtMessageBox
    v-if="alertVisible"
    title="系统提醒"
    :message="alertMessage"
    :icon="alertIsSuccess ? 'info' : 'warning'"
    :buttons="['yes']"
    @yes="onAlertDone"
    @close="onAlertDone"
  />
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.chg-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
}

.chg-dialog {
  width: 500px;
  height: 400px;
  background: #fff;
  border: 1px solid #b0b0b0;
  border-radius: 6px 6px 2px 2px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: 'Microsoft YaHei', 'Segoe UI', sans-serif;
}

.chg-titlebar {
  height: 32px;
  padding: 0 8px 0 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(180deg, #fafafa 0%, #ececec 100%);
  border-bottom: 1px solid #d0d0d0;
  flex-shrink: 0;
}

.chg-title-left {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #222;
}

.chg-logo {
  width: 16px;
  height: 16px;
  object-fit: contain;
}

.chg-x {
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

.chg-body {
  flex: 1;
  padding: 28px 36px 24px;
  display: flex;
  flex-direction: column;
  background: #fff;
}

.field-label {
  display: block;
  font-size: 10pt;
  font-weight: 600;
  color: #2c3e50;
  margin-bottom: 6px;
  margin-top: 4px;
}

.field-input,
.field-select {
  width: 100%;
  height: 44px;
  padding: 0 12px;
  border: 2px solid #ecf0f1;
  border-radius: 8px;
  font-size: 11pt;
  background: #fafbfc;
  outline: none;
  margin-bottom: 10px;
  box-sizing: border-box;

  &:focus {
    border-color: $primary;
    background: #fff;
  }
}

.field-select {
  appearance: auto;
  border: none;
  border-bottom: 2px solid #e5e7eb;
  border-radius: 8px;
  background: transparent;

  &:focus {
    border-bottom-color: $accept-green;
    background: #f0fdf4;
  }
}

.remember {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10pt;
  color: #7f8c8d;
  margin: 8px 0 16px;
  cursor: pointer;

  input {
    width: 16px;
    height: 16px;
    accent-color: $primary;
  }
}

.btn-confirm {
  width: 100%;
  height: 48px;
  border: none;
  border-radius: 8px;
  background: $primary;
  color: #fff;
  font-size: 12pt;
  font-weight: bold;
  cursor: pointer;
  margin-top: auto;

  &:hover {
    background: #70d0b1;
  }

  &:active {
    background: #4fa88b;
  }
}
</style>
