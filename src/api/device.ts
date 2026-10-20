import { request } from './request'

/** 海康 Web 预览登录配置（来自 devices 表） */
export interface DevicePreviewConfig {
  deviceId: string
  deviceName?: string
  deviceType?: string
  ip: string
  port: number
  username: string
  password: string
  channelId: number
  streamType: number
  protocol: number
  zeroChannel: boolean
}

/** 预约机双工通道占用状态 */
export interface VoiceChannelStatus {
  busy: boolean
  owner: 'announce' | 'talk' | null
  token?: string | null
  heldMs?: number
  since?: number | null
  ok?: boolean
  error?: string
  reentrant?: boolean
  stolenFrom?: string
  released?: string
  idle?: boolean
}

/**
 * 读取摄像头 Web 预览配置
 * GET /api/device/<deviceId>/preview-config
 */
export function getDevicePreviewConfigApi(deviceId: string) {
  return request<DevicePreviewConfig>(
    `/device/${encodeURIComponent(deviceId)}/preview-config`,
  )
}

/** POST /api/device/voice/acquire — 开对讲前必须拿到锁 */
export function acquireVoiceChannelApi(opts?: {
  owner?: 'talk' | 'announce'
  wait?: boolean
  timeout?: number
}) {
  return request<VoiceChannelStatus>('/device/voice/acquire', {
    method: 'POST',
    body: JSON.stringify({
      owner: opts?.owner ?? 'talk',
      wait: opts?.wait ?? true,
      timeout: opts?.timeout ?? 45,
    }),
    // 可能阻塞等待播报结束
    timeout: Math.max(60000, ((opts?.timeout ?? 45) + 5) * 1000),
  })
}

/** POST /api/device/voice/release — 关对讲后释放 */
export function releaseVoiceChannelApi(opts?: {
  owner?: 'talk' | 'announce'
  token?: string | null
  force?: boolean
}) {
  return request<VoiceChannelStatus>('/device/voice/release', {
    method: 'POST',
    body: JSON.stringify({
      owner: opts?.owner ?? 'talk',
      token: opts?.token ?? undefined,
      force: opts?.force ?? false,
    }),
  })
}

export interface GateStatus {
  connected: boolean
  gateOpen: boolean
  stickdown?: boolean | null
  lastError?: string
  /** 最近一次控制：组播是否发出 */
  sent?: boolean
  /** DEVICE bit6 是否在等待窗口内变成目标值 */
  confirmed?: boolean
  packet?: string
  cmdRaw?: number | null
  note?: string
}

/** GET /api/device/gate-status */
export function getGateStatusApi() {
  return request<GateStatus>('/device/gate-status')
}

/**
 * 主闸栏杆控制 — 对齐 Qt Gate::openGate / closeGate / 图标点击 toggle
 * POST /api/device/gate_001/control
 */
export function controlGateApi(action: 'open' | 'close' | 'toggle') {
  return request<GateStatus | null>('/device/gate_001/control', {
    method: 'POST',
    body: JSON.stringify({ action }),
  })
}

/** POST /api/device/body-radar-image — 切换显示车顶/车侧雷达图时按需拉图 */
export function fetchBodyRadarImageApi(view: 'top' | 'side') {
  return request<{ imageUrl: string; view: string; slot?: string }>(
    '/device/body-radar-image',
    {
      method: 'POST',
      body: JSON.stringify({ view }),
      timeout: 45000,
    },
  )
}
