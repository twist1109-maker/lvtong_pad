/** 手机 App／PC 共用的通行码 14 段协议。金额保留分，车辆标识按十六进制解析。 */
export interface PasscodeInfo {
  valid: true
  vehicleId: string
  vehicleDisplayId: string
  vehicleColorName: string
  enStationId: string
  exStationId: string
  enWeight: string
  exWeight: string
  mediaTypeId: number
  transactionId: string
  passId: string
  exTime: string
  transPayTypeId: number
  fee: string
  payFee: string
  vehicleSignId: number
  provinceCount: string
}

export function parsePasscode(raw: string): PasscodeInfo | null {
  const parts = raw.trim().split('|').map(p => p.trim())
  if (parts.length < 14) return null
  const vehicleId = parts[0]!
  const vehicleDisplayId = vehicleId.replace(/_[0-9]+$/, '')
  if (!vehicleDisplayId || vehicleDisplayId.includes('\uFFFD')) return null
  const decimal = (value: string) => value === '' || /^\d+$/.test(value)
  // 与后端的 int 转换保持一致，避免识别出损坏数字后上传成功、后台解析失败。
  if (![3, 4, 5, 9, 10, 11, 13].every(i => decimal(parts[i]!))) return null
  if (parts[12] && !/^(?:0x)?[0-9a-f]+$/i.test(parts[12])) return null
  return {
    valid: true,
    vehicleId,
    vehicleDisplayId,
    vehicleColorName: vehicleId.match(/_([0-9]+)$/)?.[1] ?? '',
    enStationId: parts[1]!, exStationId: parts[2]!,
    enWeight: parts[3]!, exWeight: parts[4]!,
    mediaTypeId: Number(parts[5] || 0),
    transactionId: parts[6]!, passId: parts[7]!, exTime: parts[8]!,
    transPayTypeId: Number(parts[9] || 0),
    fee: parts[10]!, payFee: parts[11]!,
    vehicleSignId: parseInt(parts[12] || '0', 16),
    provinceCount: parts[13]!,
  }
}
