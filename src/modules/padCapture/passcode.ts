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

/**
 * 统一扫码枪、粘贴和摄像头识别的文本形态。
 * HID 扫码枪可能附带 CR/LF，中文输入法也可能把 ASCII 标点变为全角标点。
 */
export function normalizePasscodeRaw(raw: string): string {
  const normalized = raw
    .replace(/^\uFEFF/, '')
    .replace(/[\r\n\t\0]+/g, '')
    .replace(/｜/g, '|')
    .replace(/：/g, ':')
    .trim()

  // NS012 的部分固件会把「辽」(U+8FBD) 的码值 8FBD 当作 GBK 输出成「徑」。
  // 已用同一二维码的支付宝识别结果交叉确认，只修正通行码首字，避免影响正文。
  return normalized.startsWith('徑') ? `辽${normalized.slice(1)}` : normalized
}

/** 明确拦截 HID 键盘布局/字符集损坏，避免错误车牌进入查验记录。 */
export function hasScannerEncodingArtifacts(raw: string): boolean {
  const vehicleId = normalizePasscodeRaw(raw).split('|', 1)[0] ?? ''
  const province = vehicleId.charAt(0)
  const validProvinces = '京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼港澳'
  return (
    /[\u2500-\u257f\uFFFD]/u.test(vehicleId)
    || /[—－]{2}/u.test(vehicleId)
    || (!!province && !validProvinces.includes(province))
  )
}

export function parsePasscode(raw: string): PasscodeInfo | null {
  const normalized = normalizePasscodeRaw(raw)
  if (hasScannerEncodingArtifacts(normalized)) return null
  const parts = normalized.split('|').map(p => p.trim())
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
