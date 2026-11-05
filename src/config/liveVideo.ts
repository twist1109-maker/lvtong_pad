/**
 * 实时视频 / 预约画面地址
 *
 * - 主页「实时视频」：cam5（cam_ptz / 104）
 * - 图像采集「车头相机」：cam2（cam_head / 102）
 * - 图像采集「车尾相机」：cam1（cam_lane / 103）
 * - 图像采集「车顶相机」：cam6（cam_road / 107）
 * - 预约弹窗 / 可视对讲画面 + 图像采集「预约相机」：MediaMTX WHEP cam4（预约机）
 * - 自动播报通过 UDP 组播中间件，与视频通道独立
 */
export const DEFAULT_WHEP_URL =
  (import.meta.env.VITE_WHEP_URL as string | undefined)?.trim() || '/mtx/cam2/whep'

/** 车尾枪机。 */
export const LANE_WHEP_URL =
  (import.meta.env.VITE_LANE_WHEP_URL as string | undefined)?.trim() || '/mtx/cam1/whep'

/** 车顶相机。 */
export const ROAD_WHEP_URL =
  (import.meta.env.VITE_ROAD_WHEP_URL as string | undefined)?.trim() || '/mtx/cam6/whep'

/** 左下「拍照」流程图标打开的周界相机 A。 */
export const SAFE_CAMERA_WHEP_URL =
  (import.meta.env.VITE_SAFE_CAMERA_WHEP_URL as string | undefined)?.trim() || '/mtx/cam3/whep'

export const TALK_WHEP_URL =
  (import.meta.env.VITE_TALK_WHEP_URL as string | undefined)?.trim() || '/mtx/cam4/whep'

/** 球机画面。Pad 端不使用海康本地插件，统一由 MediaMTX 转为 WHEP。 */
export const PTZ_WHEP_URL =
  (import.meta.env.VITE_PTZ_WHEP_URL as string | undefined)?.trim() || '/mtx/cam5/whep'

/** 图像采集 Tab → WHEP 地址 */
export function resolveCaptureWhepUrl(cameraName: string): string {
  if (cameraName === '车顶相机') return ROAD_WHEP_URL
  if (cameraName === '车头相机') return DEFAULT_WHEP_URL
  if (cameraName === '车尾相机') return LANE_WHEP_URL
  if (cameraName === '预约相机') return TALK_WHEP_URL
  if (cameraName === '球机') return PTZ_WHEP_URL
  return DEFAULT_WHEP_URL
}
