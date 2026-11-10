import test from 'node:test'
import assert from 'node:assert/strict'
import { selectionPoint, selectionPixels } from '../../src/modules/bodyRadar/screenshot.ts'

test('reverse selection maps CSS scaled panel to full resolution screenshot', () => {
  const rect = { left: 100, top: 50, width: 400, height: 200 }
  const a = selectionPoint(400, 200, rect)
  const b = selectionPoint(200, 100, rect)
  assert.deepEqual(selectionPixels(a, b, 1600, 800), { x: 400, y: 200, width: 800, height: 400 })
})

test('selection beyond panel is clamped without losing the last row or column', () => {
  const rect = { left: 100, top: 50, width: 400, height: 200 }
  assert.deepEqual(selectionPixels(selectionPoint(0, 0, rect), selectionPoint(900, 900, rect), 1601, 801),
    { x: 0, y: 0, width: 1601, height: 801 })
})
