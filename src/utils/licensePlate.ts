export const PLATE_PROVINCES = [
  '京', '津', '沪', '渝', '冀', '豫', '云', '辽', '黑', '湘',
  '皖', '鲁', '新', '苏', '浙', '赣', '鄂', '桂', '甘', '晋',
  '蒙', '陕', '吉', '闽', '贵', '粤', '青', '藏', '川', '宁',
  '琼', '港', '澳', '台',
]

export function normalizePlate(raw: string): string {
  return raw.normalize('NFKC').toUpperCase().replace(/\s+/g, '')
}

/** 人工录入的粗略格式检查，不校验发牌地区、号段或车牌真实性。 */
export function plateFormatError(raw: string): string {
  const plate = normalizePlate(raw)
  if (!plate) return '请输入车牌号码'
  if (!PLATE_PROVINCES.includes(plate[0])) return '车牌首位请选择省份简称'
  if (!/^[A-HJ-NP-Z]$/.test(plate[1] || '')) return '车牌第二位应为字母（不含 I、O）'
  if (plate.length === 7 && /^[A-HJ-NP-Z0-9]{4}[A-HJ-NP-Z0-9挂学警港澳领使]$/.test(plate.slice(2))) return ''
  if (plate.length === 8) {
    const tail = plate.slice(2)
    // 新能源号段已不局限于D/F；仅粗查6位序号且至少4位数字，兼容CA3532等号段。
    if (/^[A-HJ-NP-Z0-9]{6}$/.test(tail) && (tail.match(/\d/g)?.length || 0) >= 4) return ''
    if (/^\d{4}应急$/.test(tail)) return ''
  }
  return '请检查号牌：普通号牌7位，新能源号牌8位且序号至少4位数字；挂、学等仅可作尾缀'
}

// 与 gongsi_LvTong 车辆查验页的车牌颜色一致，仅复用底色及可读的文字色。
const plateColors: Record<string, { background: string; color: string }> = {
  '0': { background: '#2980b9', color: '#ffffff' },
  '1': { background: '#f1c40f', color: '#2c3e50' },
  '2': { background: '#2c3e50', color: '#ecf0f1' },
  '3': { background: '#ecf0f1', color: '#2c3e50' },
  '4': { background: '#27ae60', color: '#ffffff' },
  '5': { background: '#16a085', color: '#ffffff' },
  '6': { background: '#16a085', color: '#ffffff' },
  '7': { background: '#8e44ad', color: '#ffffff' },
  '11': { background: '#27ae60', color: '#ffffff' },
  '12': { background: '#ff0000', color: '#ffffff' },
}
const colorAliases: Record<string, string> = {
  蓝色: '0', 黄色: '1', 黑色: '2', 白色: '3', 渐变绿色: '4', 渐变绿: '4',
  黄绿双拼色: '5', 蓝白渐变色: '6', 临时牌照: '7', 绿色: '11', 红色: '12',
}
export function normalizePlateColor(raw: string): string {
  const color = String(raw || '').trim()
  return Object.hasOwn(plateColors, color) ? color : Object.hasOwn(colorAliases, color) ? colorAliases[color] : ''
}
export function plateColorStyle(raw: string) {
  return plateColors[normalizePlateColor(raw)] || {}
}
