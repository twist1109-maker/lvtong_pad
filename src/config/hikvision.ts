/**
 * 海康预览前端常量（不含设备凭证）
 * 设备 IP/账号/密码由 GET /api/device/<id>/preview-config 从 devices 表读取。
 *
 * 现场三台（device_id → IP）：
 * - cam_booking：预约机 192.168.88.101 — 预约弹窗画面/对讲 +「预约相机」Tab
 * - cam_lane：车道枪机 192.168.88.103 — 车顶/车头/车尾 + 主页实时视频
 * - cam_ptz：球机 192.168.88.104 — 带云台
 */

/** 与官方包实际落盘路径一致（整包放在 public/hikvision/codebase 下） */
export const HIK_SDK_PATHS = {
  /** iframe 内嵌官方同款播放页（推荐，避开 Vue 冲突） */
  playerPage: '/hikvision/player.html',
  jquery: '/hikvision/codebase/demo/jquery-1.7.1.min.js',
  webVideoCtrl: '/hikvision/codebase/demo/codebase/webVideoCtrl.js',
  basePath: '/hikvision/codebase/demo/codebase/',
  pluginInstaller: '/hikvision/codebase/demo/codebase/HCWebSDKPlugin.exe',
} as const

/** Tab 显示名 → devices.device_id */
export const CAMERA_DEVICE_ID: Record<string, string> = {
  车顶相机: 'cam_lane',
  车头相机: 'cam_lane',
  车尾相机: 'cam_lane',
  预约相机: 'cam_booking',
  球机: 'cam_ptz',
}

/** 打开弹窗默认枪机 Tab 对应的 device_id */
export const DEFAULT_GUN_DEVICE_ID = 'cam_lane'

/** 预约弹窗右侧 / 可视对讲：devices.device_id */
export const TALK_CAMERA_DEVICE_ID = 'cam_booking'

/** 图像采集：需预热的全部物理相机（切换 Tab 不再重新登录） */
export const HIK_CAPTURE_DEVICE_IDS = [
  'cam_lane',
  'cam_ptz',
  'cam_booking',
] as const

/** 已接入的相机 Tab */
export const HIK_ENABLED_CAMERAS = [
  '车顶相机',
  '车头相机',
  '车尾相机',
  '球机',
  '预约相机',
] as const
export const HIK_DISABLED_CAMERAS = [] as const

export type HikEnabledCamera = (typeof HIK_ENABLED_CAMERAS)[number]

export function resolveCameraDeviceId(cameraName: string): string {
  return CAMERA_DEVICE_ID[cameraName] || DEFAULT_GUN_DEVICE_ID
}
