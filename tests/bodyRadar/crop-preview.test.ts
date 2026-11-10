import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveCropPreview, type CropBoxPayload } from '../../src/utils/cropPreview.ts'

const payload: CropBoxPayload = { x1: 0, y1: 0, x2: 100, y2: 50, sourceTempUrl: '/api/temp-images/source', fallbackImage: 'data:image/png;base64,displayed' }

test('original crop is materialized before preview so subsequent cache expiry cannot lose evidence', async () => {
  const preview = await resolveCropPreview(payload, async () => '/api/temp-images/crop', async url => {
    assert.equal(url, '/api/temp-images/crop')
    return 'data:image/jpeg;base64,original'
  })
  assert.equal(preview, 'data:image/jpeg;base64,original')
})

test('missing or expired original uses the snapshot of the displayed selection', async () => {
  const image = await resolveCropPreview(payload, async () => { throw new Error('临时预览图不存在或已过期') })
  assert.equal(image, payload.fallbackImage)
})

test('backend restart between crop creation and image read also keeps the selected pixels', async () => {
  const image = await resolveCropPreview(payload, async () => '/api/temp-images/crop', async () => { throw new Error('404') })
  assert.equal(image, payload.fallbackImage)
})

test('stored and inline displayed images can be cropped without the temporary-image API', async () => {
  for (const sourceTempUrl of ['/api/images/body.jpg', 'data:image/png;base64,body']) {
    const image = await resolveCropPreview({ ...payload, sourceTempUrl }, async () => { assert.fail('must not request a temp crop') })
    assert.equal(image, payload.fallbackImage)
  }
})
