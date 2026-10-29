/**
 * 实时视频 / 预约画面地址
 *
 * - 主页「实时视频」+ 图像采集「车顶/车头/车尾」：MediaMTX WHEP cam1（车道枪机）
 * - 预约弹窗 / 可视对讲画面 + 图像采集「预约相机」：MediaMTX WHEP cam4（预约机）
 * - 预约/对讲的语音仍可能走海康插件 TwoWayAudio
 */
export const DEFAULT_WHEP_URL =
  (import.meta.env.VITE_WHEP_URL as string | undefined)?.trim() || '/mtx/cam1/whep'

export const TALK_WHEP_URL =
  (import.meta.env.VITE_TALK_WHEP_URL as string | undefined)?.trim() || '/mtx/cam4/whep'

/** 球机画面。Pad 端不使用海康本地插件，统一由 MediaMTX 转为 WHEP。 */
export const PTZ_WHEP_URL =
  (import.meta.env.VITE_PTZ_WHEP_URL as string | undefined)?.trim() || '/mtx/cam5/whep'

/** 图像采集 Tab → WHEP 地址 */
export function resolveCaptureWhepUrl(cameraName: string): string {
  if (cameraName === '预约相机') return TALK_WHEP_URL
  if (cameraName === '球机') return PTZ_WHEP_URL
  return DEFAULT_WHEP_URL
}
