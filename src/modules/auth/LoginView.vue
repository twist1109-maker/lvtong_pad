<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/useAuthStore'

const router = useRouter()
const auth = useAuthStore()

const username = ref(auth.getRememberedUsername() || '')
const password = ref(auth.getRememberedPassword() || '')
const remember = ref(auth.getRememberedUsername() !== '')
const showPassword = ref(false)
const reviewerPhone = ref(auth.getRememberedReviewerPhone() || '18627774208')
const errorMsg = ref('')
const submitting = ref(false)

const reviewers = [
  { name: '胡喆', phone: '18627774208' },
  { name: '吴凯立', phone: '18771903739' },
  { name: '王斌林', phone: '13971005568' },
  { name: '陈支源', phone: '15623150061' },
  { name: '徐露', phone: '19872071002' },
]

async function handleLogin() {
  errorMsg.value = ''

  if (!username.value || !password.value) {
    errorMsg.value = '账号和密码不能为空！'
    return
  }

  const reviewer = reviewers.find((r) => r.phone === reviewerPhone.value)
  if (!reviewer) {
    errorMsg.value = '请选择复核人'
    return
  }

  if (reviewer.phone === username.value) {
    errorMsg.value = '查验与复核人员不能相同！'
    return
  }

  submitting.value = true
  const success = await auth.login(
    username.value,
    password.value,
    { phone: reviewer.phone, name: reviewer.name },
    remember.value,
  )
  submitting.value = false

  if (success) {
    router.push('/')
  } else {
    errorMsg.value = auth.error || '登录失败，请检查用户名和密码'
  }
}
</script>

<template>
  <div class="login-page">
    <!-- 左侧品牌区 -->
    <aside class="login-brand">
      <div class="brand-content">
        <div class="brand-heading">
          <h1 class="brand-title">硚孝高速王母湖收费站绿通快检系统</h1>
          <p class="brand-subtitle">X透视成像 · AI大数据模型 · 创新查验机制</p>
        </div>
        <ul class="brand-features">
          <li>货物智能识别，自动标定</li>
          <li>车头智能识别，安全避让</li>
          <li>北斗卫星系统，授时定位</li>
          <li>查验机制优化，提升效率</li>
        </ul>
        <p class="brand-flow">立体化核查 → 精细化管理 → 智能化决策</p>
        <p class="brand-footer">© 2025 达生智能 绿通检测系统 · 版本 v1.1.5</p>
      </div>
    </aside>

    <!-- 右侧表单区 -->
    <main class="login-form-area">
      <button class="btn-close" title="关闭" type="button">
        <img src="/assets/img/s_close.png" alt="关闭" />
      </button>

      <div class="form-wrapper">
        <div class="form-header">
          <img class="form-logo" src="/assets/img/logo.png" alt="logo" />
          <h1 class="form-system-title">硚孝高速王母湖收费站绿通快检系统</h1>
        </div>

        <h2 class="form-title">欢迎登录</h2>
        <p class="form-subtitle">请输入您的账户信息以访问系统</p>

        <div v-if="errorMsg" class="error-box">{{ errorMsg }}</div>

        <label class="field-label">查验人账号</label>
        <input
          v-model="username"
          class="field-input"
          placeholder="请输入查验人账号"
          @keyup.enter="handleLogin"
        />

        <label class="field-label">密码</label>
        <div class="password-wrap">
          <input
            v-model="password"
            class="field-input"
            :type="showPassword ? 'text' : 'password'"
            placeholder="请输入密码"
            @keyup.enter="handleLogin"
          />
          <button
            type="button"
            class="password-eye"
            :title="showPassword ? '隐藏密码' : '显示密码'"
            @mousedown.prevent="showPassword = true"
            @mouseup="showPassword = false"
            @mouseleave="showPassword = false"
          >👁</button>
        </div>

        <label class="field-label">复核人</label>
        <div class="select-wrap">
          <select v-model="reviewerPhone" class="field-input field-select">
            <option v-for="r in reviewers" :key="r.phone" :value="r.phone">
              {{ r.name }}-{{ r.phone }}
            </option>
          </select>
          <span class="select-arrow" aria-hidden="true" />
        </div>

        <div class="form-options">
          <label class="remember">
            <input v-model="remember" type="checkbox" class="remember-input" />
            <span class="remember-box" aria-hidden="true" />
            记住我
          </label>
          <a href="#" class="forgot">忘记密码？</a>
        </div>

        <button
          class="btn-login"
          type="button"
          :disabled="submitting"
          @click="handleLogin"
        >
          {{ submitting ? '登录中...' : '登录系统' }}
        </button>

        <hr class="form-divider" />

        <p class="form-help">
          需要帮助？<a href="#">联系管理员</a>
        </p>
      </div>
    </main>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.login-page {
  display: flex;
  width: 100vw;
  height: 100vh;
  min-width: 1010px;
  background: #fff;
  overflow: hidden;
}

.login-brand {
  flex: 0 0 50%;
  width: 50%;
  min-width: 0;
  background: linear-gradient(135deg, $primary 0%, $primary 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 30px;
}

.brand-content {
  width: 100%;
  max-width: 850px;
  margin: 0 auto;
  color: #fff;
}

.brand-heading {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  margin-bottom: 45px;
}

.brand-title {
  font-size: 45px;
  font-weight: 700;
  line-height: 1.4;
  color: #fff;
  margin: 0 0 15px;
  text-align: center;
  white-space: nowrap;
}

.brand-subtitle {
  font-size: 25px;
  font-weight: 500;
  line-height: 1.5;
  color: #fff;
  margin: 0;
  text-align: center;
  letter-spacing: 0.5px;
}

.brand-features {
  list-style: none;
  font-size: 14pt;
  color: rgba(255, 255, 255, 0.8);
  line-height: 2;
  text-align: center;
  margin-bottom: 60px;
  padding-left: 25px;
}

.brand-flow {
  text-align: center;
  font-size: 30px;
  color: rgba(255, 255, 255, 0.9);
  margin-bottom: 50px;
}

.brand-footer {
  text-align: center;
  font-size: 10pt;
  color: #c7c3c7;
}

.login-form-area {
  flex: 0 0 50%;
  width: 50%;
  min-width: 0;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 30px;
  background: #fff;
}

.btn-close {
  position: absolute;
  top: 16px;
  right: 16px;
  background: transparent;
  border: none;
  padding: 4px;

  img {
    width: 32px;
    height: 32px;
  }
}

.form-wrapper {
  width: 100%;
  max-width: 550px;
  margin: 0 auto;
}

.form-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: -24px;
  margin-bottom: 20px;
  flex-wrap: nowrap;
}

.form-logo {
  width: 60px;
  height: 60px;
  object-fit: contain;
  flex-shrink: 0;
}

.form-system-title {
  font-size: 20pt;
  font-weight: 700;
  color: $text-dark;
  line-height: 1.25;
  margin: 0;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.form-title {
  font-size: 28px;
  font-weight: 600;
  color: #34495e;
  line-height: 1.15;
  margin-bottom: 10px;
}

.form-subtitle {
  font-size: 12.5pt;
  color: $text-light;
  margin-bottom: 35px;
}

.field-label {
  display: block;
  font-size: 12.5pt;
  font-weight: 600;
  color: $text-dark;
  margin-bottom: 8px;
  margin-top: 20px;
}

.error-box {
  background: #fff0f0;
  border: 1px solid #ffccc7;
  color: #cf1322;
  padding: 10px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 14px;
}

.field-input {
  width: 100%;
  height: 55px;
  padding: 0 16px;
  border: 2px solid #ecf0f1;
  border-radius: 10px;
  font-size: 13.75pt;
  background: #fafbfc;
  outline: none;
  transition: border-color 0.2s, background 0.2s;

  &:focus {
    border-color: $primary;
    background: #fff;
  }
}

.select-wrap {
  position: relative;
}

.field-select {
  appearance: none;
  padding-right: 40px;
  border: none;
  border-bottom: 2px solid #e5e7eb;
  border-radius: 10px;
  background: transparent;

  &:focus {
    border-bottom-color: $accept-green;
    background: #f0fdf4;
  }
}

.select-arrow {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-25%);
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 7px solid $accept-green;
  pointer-events: none;
}

.password-wrap {
  position: relative;
  .field-input {
    padding-right: 44px;
    /* 隐藏 Edge/Chrome 浏览器原生的密码显示按钮 */
    &::-ms-reveal,
    &::-ms-clear,
    &::-webkit-credentials-auto-fill-button,
    &::-webkit-password-toggle-button {
      display: none;
    }
  }
}

.password-eye {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  padding: 4px;
  line-height: 1;
  user-select: none;
  &:hover { opacity: 0.7; }
}

.form-options {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 20px 0 30px;
  font-size: 12.5pt;
}

.remember {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: #7f8c8d;
  cursor: pointer;
  position: relative;
}

.remember-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.remember-box {
  width: 20px;
  height: 20px;
  border: 2px solid $primary;
  border-radius: 4px;
  background: #fff;
  flex-shrink: 0;
  position: relative;
}

.remember-input:checked + .remember-box {
  background: $primary;
  border-color: $primary;

  &::after {
    content: '';
    position: absolute;
    left: 5px;
    top: 2px;
    width: 4px;
    height: 8px;
    border: solid #fff;
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }
}

.forgot {
  color: $primary;
  font-size: 12.5pt;
  text-decoration: underline;
}

.btn-login {
  width: 100%;
  height: 60px;
  background: $primary;
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 15pt;
  font-weight: bold;
  transition: background 0.2s;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: #70d0b1;
  }

  &:active:not(:disabled) {
    background: #4fa88b;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.form-divider {
  border: none;
  border-top: 1px solid #e0e0e0;
  margin: 25px 0 20px;
}

.form-help {
  text-align: center;
  font-size: 14px;
  color: $text-light;
  margin-top: 0;

  a {
    color: $primary;
    margin-left: 5px;
  }
}
</style>

