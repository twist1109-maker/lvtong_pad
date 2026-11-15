import test from 'node:test'
import assert from 'node:assert/strict'
import { cloudVehicleSize, decodeCloudGeometry, type CloudGeometryPayload } from '../../src/modules/bodyRadar/cloudGeometry.ts'

function sample(): CloudGeometryPayload {
  const bytes = new Uint8Array(24)
  const view = new DataView(bytes.buffer)
  ;[-2, -1, -.5, 2, 1, .5].forEach((v, i) => view.setFloat32(i * 4, v, true))
  return { encoding: 'float32-le-base64', positions: Buffer.from(bytes).toString('base64'), pointCount: 2, totalPointCount: 20,
    originMeters: [500002, 4000001, 100.5], boundsMeters: { min: [500000, 4000000, 100], max: [500004, 4000002, 101] },
    dimensionsMeters: { length: 4, width: 2, height: 1 } }
}
test('little endian coordinates retain centered precision and original measurement bounds', () => {
  const result = decodeCloudGeometry(sample())
  assert.deepEqual([...result.positions], [-2, -1, -.5, 2, 1, .5])
  assert.deepEqual(result.min, [-2, -1, -.5]); assert.deepEqual(result.max, [2, 1, .5])
})
test('truncated payload, nonfinite coordinates and invalid bounds fail before WebGL upload', () => {
  const truncated = sample(); truncated.positions = truncated.positions.slice(4)
  assert.throws(() => decodeCloudGeometry(truncated), /不完整/)
  const huge = sample(); huge.pointCount = 500001
  assert.throws(() => decodeCloudGeometry(huge), /点数/)
  const invalid = sample(); invalid.boundsMeters.min[0] = Infinity
  assert.throws(() => decodeCloudGeometry(invalid), /范围/)
  const nan = sample(); const bytes = Buffer.from(nan.positions, 'base64'); bytes.writeFloatLE(NaN, 0); nan.positions = bytes.toString('base64')
  assert.throws(() => decodeCloudGeometry(nan), /无效坐标/)
})

test('form size uses full point-cloud bounds and limits only the recorded width', () => {
  for (const [width, expected] of [[2.5, '2.50'], [2.54, '2.54'], [2.549, '2.54'], [2.55, '2.54'], [3.2, '2.54']]) {
    const data = sample()
    data.boundsMeters = { min: [0, 0, 0], max: [12.345, Number(width), 3.678] }
    // dimensionsMeters是冗余字段，尺寸仍与3D视图使用的全点包络同源。
    const before = structuredClone(data)
    assert.equal(cloudVehicleSize(data), `长12.35m|宽${expected}m|高3.68m`)
    assert.deepEqual(data, before, '不能修改原始点云或原始测量值')
  }
})

test('missing, degenerate, reversed and nonfinite bounds do not fill a fabricated size', () => {
  assert.equal(cloudVehicleSize(null), '')
  for (const max of [[4, 0, 1], [4, -1, 1], [4, NaN, 1], [4, Infinity, 1], [4, 2]]) {
    const data = sample(); data.boundsMeters = { min: [0, 0, 0], max }
    assert.equal(cloudVehicleSize(data), '')
  }
})
