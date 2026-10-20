import { request } from './request'

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  token: string
  user: {
    username: string
    realName: string
    phone: string
    role: number
    groupId?: number
  }
}

export interface ChangePasswordRequest {
  password: string
}

/**
 * 登录
 * POST /api/auth/login
 */
export function loginApi(data: LoginRequest) {
  return request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/**
 * 获取当前用户信息
 * GET /api/auth/me
 */
export function getCurrentUserApi() {
  return request<LoginResponse['user']>('/auth/me')
}

/**
 * 修改密码
 * POST /api/auth/change-password
 */
export function changePasswordApi(data: ChangePasswordRequest) {
  return request<null>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}
