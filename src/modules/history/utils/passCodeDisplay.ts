/** 通行介质 — 对齐 PassCodeUtil::GetMediaTypeStr */
export function getMediaTypeStr(mediaType: number | string | undefined | null): string {
  const n = Number(mediaType)
  switch (n) {
    case 1:
      return 'OBU'
    case 2:
      return 'CPC 卡'
    case 3:
      return '纸券'
    case 4:
      return 'M1 卡'
    case 9:
      return '无通行介质'
    default:
      return '未知'
  }
}

/** 交易支付方式 — 对齐 PassCodeUtil::GetTransPayTypeStr */
export function getTransPayTypeStr(payType: number | string | undefined | null): string {
  const n = Number(payType)
  if (n === 1) return '出口 ETC 通行'
  if (n === 2) return '出口 ETC 刷卡通行'
  return '未知'
}

/** 车辆状态标识 — 对齐 PassCodeUtil::GetVehicleSign */
export function getVehicleSignStr(sign: number | string | undefined | null): string {
  const n = Number(sign)
  if (n === 0x02) return '绿通车'
  if (n === 0x03) return '联合收割机'
  if (n === 0xff) return '默认值'
  return '未知'
}

/**
 * 毫米尺寸串 "17300|2550|3960" → "长17.30m|宽2.55m|高3.96m"
 * 对齐 DetailDialog::setVehicleInfo
 */
export function formatVehicleSizeDisplay(vehicleSize?: string | null): string {
  if (!vehicleSize) return ''
  const parts = vehicleSize.split('|')
  if (parts.length !== 3) return vehicleSize
  const [l, w, h] = parts.map((p) => (Number(p) / 1000).toFixed(2))
  return `长${l}m|宽${w}m|高${h}m`
}

/** "长17.30m|宽2.55m|高3.96m" → "17300|2550|3960"（毫米） */
export function parseVehicleSizeToMm(display: string): string {
  const m = display.match(/长\s*([\d.]+)\s*m\s*\|\s*宽\s*([\d.]+)\s*m\s*\|\s*高\s*([\d.]+)\s*m/i)
  if (!m) return display
  const toMm = (v: string) => String(Math.round(Number(v) * 1000))
  return `${toMm(m[1])}|${toMm(m[2])}|${toMm(m[3])}`
}

/** 拆分多图字段路径。统一用 `|` 分隔（dataUrl 含逗号，绝不能用 `,`）。 */
export function splitImagePaths(raw?: string | null): string[] {
  if (!raw) return []
  return raw.split('|').map((p) => p.trim()).filter(Boolean)
}

/** 浏览器是否能直接当 URL 用 */
export function isBrowsableImageUrl(path?: string | null): boolean {
  if (!path) return false
  return (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('blob:') ||
    path.startsWith('data:') ||
    path.startsWith('/api/image') ||
    path.startsWith('/')
  )
}
