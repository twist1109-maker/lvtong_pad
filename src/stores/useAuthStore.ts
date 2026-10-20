import { defineStore } from 'pinia'
import { ref } from 'vue'
import { loginApi, getCurrentUserApi } from '@/api/auth'

export interface UserInfo {
  username: string
  realName: string
  phone: string
  role: number
  /** users.group_id，提交时写入查验记录班组 */
  groupId?: number
}

const STORAGE_TOKEN = 'lvtong_token'
const STORAGE_USER = 'lvtong_user'
const STORAGE_REMEMBER = 'lvtong_remember'
const STORAGE_REMEMBERED_USERNAME = 'lvtong_remembered_username'
/** 「记住我」：密码（仅在勾选时写入 localStorage，现场终端便利优先） */
const STORAGE_REMEMBERED_PASSWORD = 'lvtong_remembered_password'
/** 「记住我」：复核人手机号 */
const STORAGE_REMEMBERED_REVIEWER = 'lvtong_remembered_reviewer'
/** 仅 session：当前登录复核人（刷新后提交确认页仍能回填） */
const STORAGE_SESSION_REVIEWER = 'lvtong_session_reviewer'
/** 仅 session：班组切换弹窗预填用，退出即清，不进 localStorage */
const STORAGE_SESSION_PWD = 'lvtong_session_pwd'

const CHANGE_USR_KEY = 'lvtong_change_usr'

/** 登录页硬编码复核人（恢复缓存时补名称） */
const KNOWN_REVIEWERS: { phone: string; name: string }[] = [
  { name: '胡喆', phone: '18627774208' },
  { name: '吴凯立', phone: '18771903739' },
  { name: '王斌林', phone: '13971005568' },
  { name: '陈支源', phone: '15623150061' },
  { name: '徐露', phone: '19872071002' },
]

function store(): Storage {
  return localStorage.getItem(STORAGE_REMEMBER) === '1'
    ? localStorage
    : sessionStorage
}

function lookupReviewerName(phone: string): string {
  return KNOWN_REVIEWERS.find((r) => r.phone === phone)?.name || ''
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserInfo | null>(null)
  const reviewerPhone = ref('')
  const reviewerName = ref('')
  /** 当前会话登录密码（内存）；供班组切换弹窗默认回填 */
  const sessionPassword = ref('')
  const loading = ref(false)
  const error = ref('')

  function persistSessionReviewer(phone: string, name: string) {
    const resolvedName = name || lookupReviewerName(phone)
    reviewerPhone.value = phone
    reviewerName.value = resolvedName
    if (phone) {
      sessionStorage.setItem(
        STORAGE_SESSION_REVIEWER,
        JSON.stringify({ phone, name: resolvedName }),
      )
    } else {
      sessionStorage.removeItem(STORAGE_SESSION_REVIEWER)
    }
  }

  function readChangeUsrReviewerPhone(): string {
    try {
      const raw = localStorage.getItem(CHANGE_USR_KEY)
      if (!raw) return ''
      const data = JSON.parse(raw) as { reviewerPhone?: string }
      return (data.reviewerPhone || '').trim()
    } catch {
      return ''
    }
  }

  function restoreSessionReviewer() {
    try {
      const raw = sessionStorage.getItem(STORAGE_SESSION_REVIEWER)
      if (raw) {
        const data = JSON.parse(raw) as { phone?: string; name?: string }
        if (data.phone) {
          reviewerPhone.value = data.phone
          reviewerName.value = data.name || lookupReviewerName(data.phone)
          return
        }
      }
    } catch {
      /* ignore */
    }
    // 无会话复核人：回退「记住我」→ 班组切换缓存
    const remembered =
      getRememberedReviewerPhone() || readChangeUsrReviewerPhone()
    if (remembered) {
      persistSessionReviewer(remembered, lookupReviewerName(remembered))
    }
  }

  /**
   * 提交确认页用：内存为空时从 session / 记住我 / 班组切换缓存拉回复核人。
   * 刷新后 Pinia 会丢 reviewerPhone，但 localStorage 仍有缓存。
   */
  function resolveActiveReviewer(): { phone: string; name: string } {
    if (!(reviewerPhone.value || '').trim()) {
      restoreSessionReviewer()
    }
    return {
      phone: (reviewerPhone.value || '').trim(),
      name: (reviewerName.value || '').trim(),
    }
  }

  /** 从 localStorage 恢复用户信息 */
  function restoreUser() {
    const saved = localStorage.getItem(STORAGE_USER)
        || sessionStorage.getItem(STORAGE_USER)
    if (saved) {
      try {
        user.value = JSON.parse(saved)
      } catch {
        // ignore
      }
    }
    sessionPassword.value = sessionStorage.getItem(STORAGE_SESSION_PWD) || ''
    restoreSessionReviewer()
  }

  /** 登录 */
  async function login(
    usernameStr: string,
    pwd: string,
    reviewer: { phone: string; name: string },
    remember = false,
  ): Promise<boolean> {
    loading.value = true
    error.value = ''

    try {
      const res = await loginApi({ username: usernameStr, password: pwd })

      if (res.code === 0 && res.data) {
        const { token, user: userInfo } = res.data

        // 记住我：localStorage（持久），否则 sessionStorage（关浏览器就清）
        const s = remember ? localStorage : sessionStorage
        s.setItem(STORAGE_TOKEN, token)
        s.setItem(STORAGE_USER, JSON.stringify(userInfo))
        if (remember) {
          localStorage.setItem(STORAGE_REMEMBER, '1')
          localStorage.setItem(STORAGE_REMEMBERED_USERNAME, usernameStr)
          localStorage.setItem(STORAGE_REMEMBERED_PASSWORD, pwd)
          localStorage.setItem(STORAGE_REMEMBERED_REVIEWER, reviewer.phone)
        } else {
          localStorage.removeItem(STORAGE_REMEMBER)
          localStorage.removeItem(STORAGE_REMEMBERED_USERNAME)
          localStorage.removeItem(STORAGE_REMEMBERED_PASSWORD)
          localStorage.removeItem(STORAGE_REMEMBERED_REVIEWER)
        }

        user.value = userInfo
        persistSessionReviewer(reviewer.phone, reviewer.name)
        sessionPassword.value = pwd
        sessionStorage.setItem(STORAGE_SESSION_PWD, pwd)

        return true
      }

      error.value = res.message || '登录失败'
      return false
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : '登录请求失败'
      return false
    } finally {
      loading.value = false
    }
  }

  /** 退出登录（保留记住我信息用于下次自动填充） */
  function logout() {
    user.value = null
    reviewerPhone.value = ''
    reviewerName.value = ''
    sessionPassword.value = ''
    error.value = ''
    localStorage.removeItem(STORAGE_TOKEN)
    localStorage.removeItem(STORAGE_USER)
    sessionStorage.removeItem(STORAGE_TOKEN)
    sessionStorage.removeItem(STORAGE_USER)
    sessionStorage.removeItem(STORAGE_SESSION_PWD)
    sessionStorage.removeItem(STORAGE_SESSION_REVIEWER)
    // 保留「记住我」账号/密码/复核人，供下次登录页回填
  }

  /** 获取「记住我」账号（退出后登录页回填） */
  function getRememberedUsername(): string {
    if (localStorage.getItem(STORAGE_REMEMBER) === '1') {
      return localStorage.getItem(STORAGE_REMEMBERED_USERNAME) || ''
    }
    return ''
  }

  /** 获取「记住我」密码 */
  function getRememberedPassword(): string {
    if (localStorage.getItem(STORAGE_REMEMBER) === '1') {
      return localStorage.getItem(STORAGE_REMEMBERED_PASSWORD) || ''
    }
    return ''
  }

  /** 获取「记住我」复核人手机号 */
  function getRememberedReviewerPhone(): string {
    if (localStorage.getItem(STORAGE_REMEMBER) === '1') {
      return localStorage.getItem(STORAGE_REMEMBERED_REVIEWER) || ''
    }
    return ''
  }

  /** 班组切换本地更新 — 对齐 Qt signalUsrChange，不请求后端 */
  function applyLocalUserSwitch(
    userInfo: UserInfo,
    reviewer: { phone: string; name: string },
    pwd?: string,
  ) {
    user.value = userInfo
    persistSessionReviewer(reviewer.phone, reviewer.name)
    store().setItem(STORAGE_USER, JSON.stringify(userInfo))
    if (pwd != null && pwd !== '') {
      sessionPassword.value = pwd
      sessionStorage.setItem(STORAGE_SESSION_PWD, pwd)
    }
  }

  /** 初始化：恢复登录状态 */
  async function initAuth() {
    const token = localStorage.getItem(STORAGE_TOKEN)
        || sessionStorage.getItem(STORAGE_TOKEN)
    if (!token) return

    sessionPassword.value = sessionStorage.getItem(STORAGE_SESSION_PWD) || ''
    restoreSessionReviewer()

    try {
      const res = await getCurrentUserApi()
      if (res.code === 0 && res.data) {
        user.value = res.data
        store().setItem(STORAGE_USER, JSON.stringify(res.data))
      } else {
        logout()
      }
    } catch {
      logout()
    }
  }

  return {
    user,
    reviewerPhone,
    reviewerName,
    sessionPassword,
    loading,
    error,
    login,
    logout,
    getRememberedUsername,
    getRememberedPassword,
    getRememberedReviewerPhone,
    resolveActiveReviewer,
    applyLocalUserSwitch,
    restoreUser,
    initAuth,
  }
})
