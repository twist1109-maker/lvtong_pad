import test from 'node:test'
import assert from 'node:assert/strict'
import { encodeG711, decodeG711, VoiceResampler } from '../../public/audio/talk-worklet.js'

test('G.711 ITU sample vectors encode and decode with expected sign and magnitude', () => {
  const samples = [0, 1000, -1000, 32767, -32768]
  for (const [codec, codes] of [['alaw', [213, 250, 122, 170, 42]], ['ulaw', [255, 206, 78, 128, 0]]]) {
    samples.forEach((pcm, i) => {
      assert.equal(encodeG711(pcm / 32768, codec), codes[i])
      assert.ok(Math.abs(decodeG711(codes[i], codec) * 32768 - pcm) <= Math.max(8, Math.abs(pcm) * .04))
    })
  }
})
test('all G.711 codewords roundtrip except equivalent signed zero', () => {
  for (const codec of ['alaw', 'ulaw']) for (let code = 0; code < 256; code++) {
    const actual = encodeG711(decodeG711(code, codec), codec)
    assert.equal(actual, codec === 'ulaw' && code === 127 ? 255 : code)
  }
})
test('fractional resampling across 128-sample quanta preserves timing and DC level', () => {
  for (const rate of [44100, 48000, 8000, 16000]) {
    const resampler = new VoiceResampler(rate)
    const output = []
    for (let at = 0; at < rate; at += 128) resampler.push(new Float32Array(Math.min(128,rate-at)).fill(.25), v => output.push(v))
    assert.equal(output.length, 8000)
    assert.ok(output.every(v => Math.abs(v-.25)<1e-6))
  }
})
