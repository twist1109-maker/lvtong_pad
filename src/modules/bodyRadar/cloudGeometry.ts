export interface CloudGeometryPayload {
  encoding: 'float32-le-base64'
  positions: string
  pointCount: number
  totalPointCount: number
  originMeters: number[]
  boundsMeters: { min: number[]; max: number[] }
  dimensionsMeters: { length: number; width: number; height: number }
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
