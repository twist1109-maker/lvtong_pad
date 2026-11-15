export interface CloudGeometryPayload {
  encoding: 'float32-le-base64'
  positions: string
  pointCount: number
  totalPointCount: number
  originMeters: number[]
  boundsMeters: { min: number[]; max: number[] }
  dimensionsMeters: { length: number; width: number; height: number }
}

/** 表单取全部有效点的真实包络；宽度按现场录入规则限制，原始点云保持不变。 */
export function cloudVehicleSize(data: CloudGeometryPayload | null): string {
  const bounds = data?.boundsMeters
  if (!bounds || !Array.isArray(bounds.min) || !Array.isArray(bounds.max)
    || bounds.min.length !== 3 || bounds.max.length !== 3
    || ![...bounds.min, ...bounds.max].every(Number.isFinite)) return ''
  const dimensions = bounds.max.map((value, axis) => value - bounds.min[axis])
  if (dimensions.some(value => !Number.isFinite(value) || value <= 0)) return ''
  const [length, width, height] = dimensions
  // 两位小数也必须小于2.55，避免2.549等测量值四舍五入后显示为2.55。
  const formWidth = Math.min(width, 2.54)
  return `长${length.toFixed(2)}m|宽${formWidth.toFixed(2)}m|高${height.toFixed(2)}m`
}

export function decodeCloudGeometry(data: CloudGeometryPayload) {
  if (data.encoding !== 'float32-le-base64' || !Number.isInteger(data.pointCount) || data.pointCount < 1 || data.pointCount > 500000) {
    throw new Error('点云格式或点数无效')
  }
  const bytes = atob(data.positions)
  if (bytes.length !== data.pointCount * 12) throw new Error('三维点云数据不完整')
  const buffer = Uint8Array.from(bytes, char => char.charCodeAt(0)).buffer
  const view = new DataView(buffer)
  const positions = new Float32Array(data.pointCount * 3)
  for (let i = 0; i < positions.length; i++) {
    const value = view.getFloat32(i * 4, true)
    if (!Number.isFinite(value)) throw new Error('点云包含无效坐标')
    positions[i] = value
  }
  const { min, max } = data.boundsMeters
  if ([min, max, data.originMeters].some(values => values.length !== 3 || !values.every(Number.isFinite)) || max.some((value, i) => value < min[i])) {
    throw new Error('点云测量范围无效')
  }
  return { positions, min: min.map((v, i) => v - data.originMeters[i]), max: max.map((v, i) => v - data.originMeters[i]) }
}
