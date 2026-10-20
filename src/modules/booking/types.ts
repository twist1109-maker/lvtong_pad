/**
 * 预约处理 — 对齐 Qt OrderDialog / LvTongPro 预约状态机
 */

/** 货车尺寸类型 — 对齐 OrderDialog btnVehicleType */
export type VehicleSizeType = 'small' | 'big'

/** 雷达来车图响应 — 对齐 OrderDialog::onRequestFinished 响应头 */
export interface RadarImageResponse {
  /** 图片可访问 URL 或 blob URL */
  imageUrl: string
  /** Image-Envelope */
  imageEnvelope: string
  /** Image-Resolution 原始字符串 */
  imageResolution: string
  /**
   * 米/像素（Image-Resolution 数值）。
   * 现场约定：0.01 → 1 像素 = 0.01 米
   */
  metersPerPixel?: number
  /** VehicleHeader-Envelope */
  vehicleHeaderEnvelope: string
  /** Vehicle-Height（米） */
  vehicleHeight: number
  /** Vehicle-SX：车头距图片起始位置（米）；null/缺省表示未返回 */
  vehicleSx?: number | null
  originalImageWidth: number
  originalImageHeight: number
  /** 车头像素起点（由 SX/resolution 推算，或内容最左列） */
  contentOriginX?: number
}

/**
 * 受理提交载荷 — 对齐 emit carInfo(carheight, carlength, isChecked)
 * POST /api/booking/accept
 */
export interface BookingAcceptPayload {
  /** 车高 m_vHeight / m_carHeight */
  vehicleHeight: number
  /** 车头长度 m_carheadlength / m_carLength */
  carHeadLength: number
  /**
   * 预约弹窗车型（与图标一致）：small | big
   * 光机 type：big → large，small → small；以后端收到的为准
   */
  vehicleType: VehicleSizeType
  /** X 光透视开关 */
  xrayEnabled: boolean
  /** 红线相对位置 0~1（后端可选用于调度修正） */
  linePosition: number
  /** 受理时间 ISO，对齐 acceptanceTime */
  acceptanceTime?: string
  /** 预约界面车头雷达图（临时 URL / dataUrl），提交时落库 radar_head_image_path */
  radarHeadImageUrl?: string
}

/**
 * 主流程检测状态 — 对齐 LvTongPro 成员
 * GET /api/booking/state
 */
export interface BookingProcessState {
  /** m_isDetection */
  is_detection: boolean
  last_booking_state: boolean
  booking_dialog_shown: boolean
  btn_prebook_state: boolean
  car_height: number
  car_length: number
  is_check_xray: boolean
  /** m_checkstep: 0待机 1受理后 2检测 3触发采集 4… */
  check_step: number
  radar_count: number
}

/** 弹窗打开会话 — POST /api/booking/open 返回 */
export interface BookingOpenResult {
  /** SP 视频流地址预留（WebRTC / HLS / MJPEG） */
  videoStreamUrl?: string | null
  /** 是否已关闸 / LED step2 等（后端设备侧） */
  devicesReady?: boolean
  state?: BookingProcessState
}

export type BookingConfirmKind = 'accept' | 'reject' | 'close'

export interface BookingConfirmConfig {
  kind: BookingConfirmKind
  title: string
  message: string
}

/**
 * WS 预约相关事件（后端 → 前端）
 * 对齐 PLC bookingStatus / push_booking_event
 */
export const BookingWsEvent = {
  /** 来车/按键预约 → 应弹窗 */
  Request: 'booking_request',
  /** 兼容后端 push_booking_event type=booking */
  Booking: 'booking',
  Accepted: 'booking_accepted',
  Rejected: 'booking_rejected',
} as const

export type BookingWsEvent = (typeof BookingWsEvent)[keyof typeof BookingWsEvent]

export interface BookingComingPayload {
  /** coming | book_button | accepted | rejected */
  action?: string
  plate?: string
  distance?: number
  /** 空闲为 true：前端可弹窗；检测中为 false：只闪烁不弹窗 */
  openDialog?: boolean
  btnPrebookState?: boolean
  btnPressTime?: string
}
