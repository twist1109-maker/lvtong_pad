import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeCloudGeometry, type CloudGeometryPayload } from '../../src/modules/bodyRadar/cloudGeometry.ts'

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
