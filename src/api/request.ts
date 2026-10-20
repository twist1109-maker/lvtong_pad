import { appConfig } from '@/config/env'

export interface RequestOptions extends RequestInit {
  /** 请求超时时间（毫秒），默认 30000 */
  timeout?: number
}

export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
}

/**
 * 统一请求封装
 * - 自动附加 Authorization: Bearer <token>
 * - 401 时清除 token 并跳转登录页
 * - 默认 30 秒超时，防止后端阻塞导致前端卡死
 */
export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const token = localStorage.getItem('lvtong_token')
    || sessionStorage.getItem('lvtong_token')

  const { timeout = 30000, ...fetchOptions } = options

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> ?? {}),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  // 超时控制：使用 AbortController 防止请求无限等待
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  let res: Response
  try {
    res = await fetch(`${appConfig.apiBaseUrl}${path}`, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    })
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('请求超时，请检查网络或后端服务')
    }
    throw e
  } finally {
    clearTimeout(timeoutId)
  }

  // 401 自动跳转登录页
  if (res.status === 401) {
    localStorage.removeItem('lvtong_token')
    localStorage.removeItem('lvtong_user')
    if (window.location.pathname !== '/login') {
      window.location.href = '/login'
    }
    throw new Error('登录已过期，请重新登录')
  }

  if (!res.ok) {
    // 尝试读取后端返回的错误信息
    let message = `请求失败: ${res.status}`
    try {
      const body: ApiResponse = await res.json()
      if (body.message) message = body.message
    } catch { /* 无法解析 body 时使用默认 message */ }
    throw new Error(message)
  }

  return res.json() as Promise<ApiResponse<T>>
}
