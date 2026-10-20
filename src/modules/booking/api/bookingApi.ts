/**
 * 预约 API 适配器 — Http / Mock
 * 实现 BookingPort，对接 lvtong-backend /api/booking/*
 */
import type { BookingPort } from '../ports/bookingPort'
import type {
  BookingAcceptPayload,
  BookingOpenResult,
  BookingProcessState,
  RadarImageResponse,
} from '../types'
import { request } from '@/api/request'

/** 默认车头宽度（米）— 对齐 config radar.headDefaultWidth */
export const DEFAULT_HEAD_WIDTH = 1.5

/** 并发 open 合并为同一请求，避免多次抢 TwoWayAudio */
let sharedOpenPromise: Promise<BookingOpenResult> | null = null

/** 真实 HTTP 实现 */
export function createHttpBookingApi(): BookingPort {
  return {
    async fetchRadarImage() {
      // 后端最多 3×12s 重试，前端超时放宽避免被 Abort
      const res = await request<RadarImageResponse>('/booking/radar-image', {
        timeout: 60000,
      })
      if (res.code === 0 && res.data?.imageUrl) {
        return res.data
      }
      if (res.code === 0 && res.data) {
        return res.data.imageUrl ? res.data : null
      }
      console.warn('[BookingPort] 雷达图像获取失败:', res.message)
      throw new Error(res.message || '雷达图像获取失败')
    },

    async recordBtnPress(source: 'ui' | 'plc' = 'ui') {
      const res = await request<{
        btnPressTime?: string
        lastBtnClickTime?: string
        openDialog?: boolean
        btnPrebookState?: boolean
      }>('/booking/btn-press', {
        method: 'POST',
        body: JSON.stringify({ source, pushWs: source !== 'ui' }),
      })
      if (res.code !== 0) {
        throw new Error(res.message || '预约按键记时失败')
      }
      const t = res.data?.btnPressTime || res.data?.lastBtnClickTime || ''
      return {
        btnPressTime: t,
        openDialog: res.data?.openDialog,
        btnPrebookState: res.data?.btnPrebookState,
      }
    },

    async openDialog() {
      // 对齐 onRefreshOrderDialog：设备侧效应由后端执行
      // 合并并发 open，防止弹窗重复挂载时多次播报/抢通道
      if (!sharedOpenPromise) {
        sharedOpenPromise = (async () => {
          try {
            const res = await request<BookingOpenResult>('/booking/open', {
              method: 'POST',
              // open 内阻塞播报 step2，超时放宽
              timeout: 90000,
            })
            if (res.code === 0 && res.data) {
              return res.data
            }
            // 兼容旧后端仅有 /state
            const stateRes = await request<BookingProcessState>('/booking/state')
            return {
              videoStreamUrl: null,
              devicesReady: false,
              state: stateRes.code === 0 ? stateRes.data ?? undefined : undefined,
            }
          } finally {
            sharedOpenPromise = null
          }
        })()
      }
      return sharedOpenPromise
    },

    async stopVideoSession() {
      try {
        await request('/booking/stop-video', { method: 'POST' })
      } catch (e) {
        // 后端未就绪时不阻断受理/驳回主流程
        console.warn('[BookingPort] stop-video 失败（可忽略）:', e)
      }
    },

    async acceptBooking(payload: BookingAcceptPayload) {
      const body: BookingAcceptPayload = {
        ...payload,
        acceptanceTime: payload.acceptanceTime ?? new Date().toISOString(),
      }
      const res = await request('/booking/accept', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      if (res.code !== 0) {
        throw new Error(res.message || '受理失败')
      }
    },

    async rejectBooking() {
      const res = await request('/booking/reject', { method: 'POST' })
      if (res.code !== 0) {
        throw new Error(res.message || '驳回失败')
      }
    },

    async getState() {
      const res = await request<BookingProcessState>('/booking/state')
      if (res.code === 0 && res.data) return res.data
      return null
    },
  }
}

/** Mock 实现 — 本地无后端时联调 UI */
export function createMockBookingApi(): BookingPort {
  return {
    async fetchRadarImage() {
      // 返回 null：UI 显示「雷达测量来车信息区域」占位（对齐 Qt 无图态）
      return null
    },
    async recordBtnPress(source: 'ui' | 'plc' = 'ui') {
      const t = new Date().toISOString()
      console.info('[BookingPort] mock btn-press', source, t)
      return { btnPressTime: t, openDialog: true, btnPrebookState: true }
    },
    async openDialog() {
      return { videoStreamUrl: null, devicesReady: true }
    },
    async stopVideoSession() {},
    async acceptBooking(payload) {
      console.info('[BookingPort] mock accept', payload)
    },
    async rejectBooking() {
      console.info('[BookingPort] mock reject')
    },
    async getState() {
      return {
        is_detection: false,
        last_booking_state: false,
        booking_dialog_shown: false,
        btn_prebook_state: false,
        car_height: 3.0,
        car_length: DEFAULT_HEAD_WIDTH,
        is_check_xray: true,
        check_step: 0,
        radar_count: 0,
      }
    },
  }
}

let bookingApi: BookingPort

const useMock = import.meta.env.VITE_USE_MOCK === 'true'
bookingApi = useMock ? createMockBookingApi() : createHttpBookingApi()

export function getBookingApi(): BookingPort {
  return bookingApi
}

export function setBookingApi(api: BookingPort): void {
  bookingApi = api
}

/** @deprecated 使用 getBookingApi */
export const getBookingPort = getBookingApi
export const setBookingPort = setBookingApi
