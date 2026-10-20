/** DEVICE STATUS 位 9–12：光源 / 光闸（对齐 ST_XRAY_*） */
export type PlcXrayBits = {
  source200: boolean
  source160: boolean
  gate200: boolean
  gate160: boolean
}

/** 流程栏「光机」三态图标 */
export type XrayMachinePhase = 'idle' | 'warmup' | 'working'

export type PlcSignalLights = {
  red: boolean
  yellow: boolean
  green: boolean
  fillLight: boolean
}

export const XRAY_PHASE_ICONS: Record<XrayMachinePhase, string> = {
  idle: '/assets/img/xray_online.png',
  warmup: '/assets/img/xray_warm.png',
  working: '/assets/img/xray_open.png',
}

export function boolField(data: Record<string, unknown>, ...keys: string[]): boolean {
  for (const k of keys) {
    const v = data[k]
    if (v === true || v === 1 || v === '1') return true
    if (v === false || v === 0 || v === '0') return false
  }
  return false
}

/** 从 plc_status WS 载荷解析光源 / 光闸位 */
export function parsePlcXrayBits(data: Record<string, unknown>): PlcXrayBits {
  return {
    source200: boolField(
      data,
      'lightSource200Status',
      'lightsource200',
      'lightSource200',
    ),
    source160: boolField(
      data,
      'lightSource160Status',
      'lightsource160',
      'lightSource160',
    ),
    gate200: boolField(data, 'lightGate200Status', 'lightgate200', 'xrayGate200Cmd'),
    gate160: boolField(data, 'lightGate160Status', 'lightgate160', 'xrayGate160Cmd'),
  }
}

export function parsePlcSignalLights(data: Record<string, unknown>): PlcSignalLights {
  return {
    // ST_RED/YELLOW/GREEN/FILL_LIGHT = bit0–3
    red: boolField(data, 'redLightCmd', 'redlight', 'red'),
    yellow: boolField(data, 'yellowLightCmd', 'yellowlight', 'yellow'),
    green: boolField(data, 'greenLightCmd', 'greenlight', 'green'),
    fillLight: boolField(data, 'createLightCmd', 'filllight', 'greatlight'),
  }
}

/**
 * 光机三态：
 * - 9&10 均为 0 → 空闲
 * - 9 或 10 为 1 且对应光闸为 0 → 预热
 * - 9 或 10 为 1 且对应光闸为 1 → 工作
 */
export function deriveXrayMachinePhase(bits: PlcXrayBits): XrayMachinePhase {
  const { source200, source160, gate200, gate160 } = bits
  if (!source200 && !source160) return 'idle'

  const working =
    (source200 && gate200) || (source160 && gate160)
  if (working) return 'working'

  return 'warmup'
}

/** 200 侧叠图：上蓝相机 + 光闸（gate=1 时 online1 无光闸） */
export function xrayDtImg200(bits: PlcXrayBits): string {
  if (!bits.source200) {
    return '/assets/img/dt_img/1online0.png'
  }
  return bits.gate200
    ? '/assets/img/dt_img/1online1.png'
    : '/assets/img/dt_img/1online0.png'
}

/** 160 侧叠图：下蓝相机 + 光闸 */
export function xrayDtImg160(bits: PlcXrayBits): string {
  if (!bits.source160) {
    return '/assets/img/dt_img/2online0.png'
  }
  return bits.gate160
    ? '/assets/img/dt_img/2online1.png'
    : '/assets/img/dt_img/2online0.png'
}
