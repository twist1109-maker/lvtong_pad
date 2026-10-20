/**
 * 实时视频 / 预约画面地址
 *
 * - 主页「实时视频」：MediaMTX WHEP cam1（海康 RTSP → MediaMTX → `<video>`）
 * - 预约右侧：MediaMTX WHEP cam4；对讲另走海康插件
 */
export const DEFAULT_WHEP_URL =
  (import.meta.env.VITE_WHEP_URL as string | undefined)?.trim() || '/mtx/cam1/whep'

export const TALK_WHEP_URL =
  (import.meta.env.VITE_TALK_WHEP_URL as string | undefined)?.trim() || '/mtx/cam4/whep'
