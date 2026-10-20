/**
 * 预约端口 — 对齐 Qt OrderDialog 对外能力边界
 *
 * 前端只依赖本接口；Http / Mock 可切换。
 * 后端契约见各方法注释中的 REST / WS 路径。
 */
import type {
  BookingAcceptPayload,
  BookingOpenResult,
  BookingProcessState,
  RadarImageResponse,
} from '../types'

export interface BookingPort {
  /**
   * 拉取雷达车头图
   * 对齐 OrderDialog::onRefreshClicked → GET radar.headurl
   * REST: GET /api/booking/radar-image
   */
  fetchRadarImage(): Promise<RadarImageResponse | null>

  /**
   * 预约按键（操作台「预约」/ 现场键共用）
   * 任意时刻：记时 + 红灯落杆 + step2；空闲时 openDialog=true
   * REST: POST /api/booking/btn-press
   */
  recordBtnPress(source?: 'ui' | 'plc'): Promise<{
    btnPressTime: string
    openDialog?: boolean
    btnPrebookState?: boolean
  }>

  /**
   * 弹窗打开初始化（空闲弹窗后）
   * 等待按键已发起的 step2 播完，释放对讲通道；拉雷达由前端另调
   * REST: POST /api/booking/open
   */
  openDialog(): Promise<BookingOpenResult>

  /**
   * 停止视频对讲
   * 对齐 OrderDialog::stopSpCamera
   * REST: POST /api/booking/stop-video
   */
  stopVideoSession(): Promise<void>

  /**
   * 受理
   * REST: POST /api/booking/accept
   */
  acceptBooking(payload: BookingAcceptPayload): Promise<void>

  /**
   * 驳回 / 关窗等同驳回
   * REST: POST /api/booking/reject
   */
  rejectBooking(): Promise<void>

  /**
   * 查询检测流程状态
   * REST: GET /api/booking/state
   */
  getState(): Promise<BookingProcessState | null>
}

/** @deprecated 使用 BookingPort */
export type BookingApi = BookingPort
