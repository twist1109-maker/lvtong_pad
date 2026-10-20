/** 车牌底色 — 对齐原 Qt 界面黄牌 #ffc000 */
export function plateColorStyle(color?: string | null): {
  backgroundColor: string
  color: string
} | null {
  if (!color) return null
  switch (color) {
    case '0':
      return { backgroundColor: '#2980b9', color: '#ffffff' }
    case '1':
      return { backgroundColor: '#ffc000', color: '#2c3e50' }
    case '2':
      return { backgroundColor: '#2c3e50', color: '#ecf0f1' }
    case '3':
      return { backgroundColor: '#ecf0f1', color: '#2c3e50' }
    case '4':
    case '11':
      return { backgroundColor: '#27ae60', color: '#ffffff' }
    case '5':
    case '6':
      return { backgroundColor: '#16a085', color: '#ffffff' }
    case '7':
      return { backgroundColor: '#8e44ad', color: '#ffffff' }
    case '12':
      return { backgroundColor: '#ff0000', color: '#ffffff' }
    default:
      return { backgroundColor: '#7f8c8d', color: '#ffffff' }
  }
}

/** 满载率 — 原 Qt：≥80 绿色，<80 红色 */
export function loadRateTextClass(value: number | string | undefined | null): string {
  if (value === '' || value == null) return ''
  const n = Number(value)
  if (Number.isNaN(n)) return ''
  return n >= 80 ? 'load-rate-ok' : 'load-rate-low'
}

/** 班组下拉 — 对齐 cb_group */
export const GROUP_OPTIONS = [
  { value: 0, label: '未分组' },
  { value: 1, label: '班组1' },
  { value: 2, label: '班组2' },
  { value: 3, label: '班组3' },
  { value: 4, label: '班组4' },
  { value: 5, label: '班组5' },
] as const

/** 查验结果 — 0 合格 / 1 不合格 */
export const RESULT_OPTIONS = [
  { value: 0, label: '合格' },
  { value: 1, label: '不合格' },
] as const

/** 图片占位 — 对齐 setPreviewImage */
export const IMAGE_PLACEHOLDER = {
  default: '/assets/img/detail.png',
  body: '/assets/img/body.png',
  transparent: '/assets/img/transparent.png',
  good: '/assets/img/good.png',
} as const

/** 证据照/货物照边框 — 对齐 DetailDialog 蓝绿交替 */
export function goodsBorderClass(index: number): string {
  return index % 2 === 0 ? 'border-blue' : 'border-green'
}

/** 证据照网格列数 — 简化对齐 setPreviewEvidenceImages */
export function evidenceGridCols(count: number): number {
  if (count <= 0) return 1
  if (count <= 4) return count
  if (count <= 6) return 3
  return 4
}

/** 货物照网格列数 */
export function goodsGridCols(count: number): number {
  if (count <= 0) return 1
  if (count <= 5) return Math.min(count, 3)
  return 5
}
