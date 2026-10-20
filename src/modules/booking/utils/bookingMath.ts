/** 像素到米 — 默认；有 Image-Resolution 时用 metersPerPixel */
export const PIXEL_TO_METER = 0.01

const BIG_HEIGHT_THRESHOLD = 2.8
const SMALL_HEIGHT = 1.8
const BIG_HEIGHT = 3.0

/** 默认红线相对车头的偏移（米） */
export const DEFAULT_LINE_OFFSET_M = 1.5

export function vehicleTypeFromRadarHeight(height: number): 'small' | 'big' {
  return height > BIG_HEIGHT_THRESHOLD ? 'big' : 'small'
}

export function toggleVehicleHeight(current: number): number {
  return current > SMALL_HEIGHT ? SMALL_HEIGHT : BIG_HEIGHT
}

/** 取包络串第一个数值（支持 JSON / 逗号分隔）；失败为 0 */
function envelopeFirstNumber(envelopeStr: string): number {
  const s = (envelopeStr || '').trim()
  if (!s) return 0
  try {
    const obj = JSON.parse(s) as Record<string, unknown>
    for (const key of ['x', 'x1', 'left', 'center'] as const) {
      const val = obj[key]
      if (typeof val === 'number' && Number.isFinite(val)) return val
      if (typeof val === 'string') {
        const n = Number.parseFloat(val)
        if (!Number.isNaN(n)) return n
      }
    }
  } catch {
    /* 非 JSON */
  }
  const first = s.split(',')[0]?.trim() ?? ''
  const n = Number.parseFloat(first)
  return Number.isNaN(n) ? 0 : n
}

/** 解析 Image-Envelope 为竖线相对位置 0~1 */
export function parseImageEnvelope(envelopeStr: string, imageWidth: number): number | null {
  if (!envelopeStr?.trim() || imageWidth <= 0) return null

  try {
    const obj = JSON.parse(envelopeStr) as Record<string, unknown>
    for (const key of ['x', 'x1', 'left', 'center'] as const) {
      const val = obj[key]
      let n = NaN
      if (typeof val === 'number') n = val
      else if (typeof val === 'string') n = Number.parseFloat(val)
      if (!Number.isNaN(n) && n >= 0) {
        return Math.min(1, Math.max(0, n / imageWidth))
      }
    }
  } catch {
    /* 非 JSON */
  }

  const first = envelopeStr.split(',')[0]?.trim()
  const x = Number.parseFloat(first ?? '')
  if (!Number.isNaN(x) && x >= 0) {
    return Math.min(1, Math.max(0, x / imageWidth))
  }
  return null
}

export function distanceFromLinePosition(
  position: number,
  originalImageWidth: number,
  metersPerPixel: number = PIXEL_TO_METER,
): number {
  if (originalImageWidth <= 0) return 0
  const mpp = metersPerPixel > 0 ? metersPerPixel : PIXEL_TO_METER
  return position * originalImageWidth * mpp
}

/**
 * 按 Vehicle-SX（米）+ 偏移放红线。
 * 像素 = (sxM + offsetM) / metersPerPixel；返回相对位置 0~1。
 */
export function linePositionFromVehicleSx(
  vehicleSxM: number,
  imageWidth: number,
  metersPerPixel: number = PIXEL_TO_METER,
  offsetMeters: number = DEFAULT_LINE_OFFSET_M,
): number | null {
  if (imageWidth <= 0) return null
  const mpp = metersPerPixel > 0 ? metersPerPixel : PIXEL_TO_METER
  const px = (Math.max(0, vehicleSxM) + offsetMeters) / mpp
  return Math.min(1, Math.max(0, px / imageWidth))
}

/**
 * 默认红线：有颜色/车头起点往后 defaultMeters（默认 1.5m）对应像素。
 * 返回相对位置 0~1；无法计算时返回 null。
 */
export function defaultLinePositionAfterOrigin(
  originPx: number,
  imageWidth: number,
  defaultMeters: number = DEFAULT_LINE_OFFSET_M,
  metersPerPixel: number = PIXEL_TO_METER,
): number | null {
  if (imageWidth <= 0) return null
  const mpp = metersPerPixel > 0 ? metersPerPixel : PIXEL_TO_METER
  const px = Math.max(0, originPx) + defaultMeters / mpp
  return Math.min(1, Math.max(0, px / imageWidth))
}

/**
 * 车头长度（米）= 红线位置 − 车头起点。
 * 优先用 Vehicle-SX + Image-Resolution；否则回退包络像素 × mpp。
 */
export function calcCarHeadLength(
  linePosition: number,
  originalImageWidth: number,
  imageEnvelope: string,
  vehicleHeaderEnvelope: string,
  defaultWidth: number,
  opts?: { vehicleSx?: number; metersPerPixel?: number },
): number {
  if (originalImageWidth <= 0) return defaultWidth

  const mpp =
    opts?.metersPerPixel && opts.metersPerPixel > 0
      ? opts.metersPerPixel
      : PIXEL_TO_METER
  const lineM = linePosition * originalImageWidth * mpp

  if (opts?.vehicleSx != null && Number.isFinite(opts.vehicleSx)) {
    const r = lineM - Math.max(0, opts.vehicleSx)
    if (!Number.isFinite(r)) return defaultWidth
    return r > 0 ? r : defaultWidth
  }

  const linePx = linePosition * originalImageWidth
  const iw = envelopeFirstNumber(imageEnvelope)
  const vw = envelopeFirstNumber(vehicleHeaderEnvelope)
  const originPx = vw - iw
  const rDistance = (linePx - originPx) * mpp

  if (!Number.isFinite(rDistance)) return defaultWidth
  return rDistance > defaultWidth ? rDistance : defaultWidth
}

/** 导出包络首值，供默认红线起算 */
export { envelopeFirstNumber }
