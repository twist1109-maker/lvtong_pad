import test from 'node:test'
import assert from 'node:assert/strict'
import { cloudPixelBounds } from '../../src/modules/bodyRadar/cloudScreenshot.ts'

test('crop uses visible pixels including final row/column, ignoring background and transparent pixels', () => {
  const pixels = new Uint8ClampedArray(100 * 60 * 4)
  for (let i = 0; i < pixels.length; i += 4) pixels.set([247, 251, 250, 255], i)
  pixels.set([40, 120, 160, 255], (12 * 100 + 30) * 4)
  pixels.set([40, 120, 160, 255], (49 * 100 + 72) * 4)
  pixels.set([0, 0, 0, 0], 0)
  pixels.set([240, 245, 245, 255], 4)
  assert.deepEqual(cloudPixelBounds(pixels, 100, 60), { x: 30, y: 12, width: 43, height: 38 })
  pixels.set([40, 120, 160, 255], (60 * 100 - 1) * 4)
  assert.deepEqual(cloudPixelBounds(pixels, 100, 60), { x: 30, y: 12, width: 70, height: 48 })
})

test('empty render has no bounds instead of exporting a blank vehicle screenshot', () => {
  const pixels = new Uint8ClampedArray(20 * 10 * 4)
  for (let i = 0; i < pixels.length; i += 4) pixels.set([247, 251, 250, 255], i)
  assert.equal(cloudPixelBounds(pixels, 20, 10), null)
})
