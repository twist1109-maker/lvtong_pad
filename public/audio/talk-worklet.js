// G.711 / continuous resampling, shared by the AudioWorklet and known-vector tests.
export function encodeG711(sample, codec) {
  let pcm = Math.max(-32768, Math.min(32767, Math.round(sample * 32768)))
  if (codec === 'ulaw') {
    const sign = pcm < 0 ? 0x80 : 0
    pcm = Math.min(Math.abs(pcm), 32635) + 132
    let exponent = 7
    for (let mask = 0x4000; exponent > 0 && !(pcm & mask); mask >>= 1) exponent--
    return (~(sign | (exponent << 4) | ((pcm >> (exponent + 3)) & 15))) & 255
  }
  const mask = pcm >= 0 ? 0xd5 : 0x55
  pcm = pcm >= 0 ? pcm : -pcm - 1
  let segment = 0
  for (let boundary = 255; segment < 8 && pcm > boundary; boundary = (boundary << 1) | 1) segment++
  const value = segment >= 8 ? 127 : (segment << 4) | ((pcm >> (segment < 2 ? 4 : segment + 3)) & 15)
  return value ^ mask
}

export function decodeG711(value, codec) {
  if (codec === 'ulaw') {
    value = (~value) & 255
    const pcm = (((value & 15) << 3) + 132) << ((value >> 4) & 7)
    return ((value & 128) ? 132 - pcm : pcm - 132) / 32768
  }
  value ^= 0x55
  let pcm = (value & 15) << 4
  const segment = (value & 0x70) >> 4
  pcm += segment ? 264 : 8
  if (segment > 1) pcm <<= segment - 1
  return ((value & 128) ? pcm : -pcm) / 32768
}

export class VoiceResampler {
  constructor(inputRate, outputRate = 8000) {
    this.ratio = inputRate / outputRate
    this.weight = 0
    this.total = 0
    // A box average alone folds microphone hiss above 4kHz into telephone speech.
    // Blackman-windowed FIR, ~4ms long, keeps 300–3000Hz and rejects the alias band.
    if (inputRate > outputRate) {
      const length = Math.ceil(inputRate / 250) | 1
      const middle = (length - 1) / 2
      const cutoff = outputRate * .425 / inputRate
      this.taps = Float64Array.from({ length }, (_, i) => {
        const x = i - middle
        const sinc = x === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * x) / (Math.PI * x)
        return sinc * (.42 - .5 * Math.cos(2 * Math.PI * i / (length - 1)) + .08 * Math.cos(4 * Math.PI * i / (length - 1)))
      })
      const sum = this.taps.reduce((a, b) => a + b, 0)
      this.taps = this.taps.map(tap => tap / sum)
      this.history = new Float64Array(length)
      this.cursor = 0
      this.initialized = false
    }
  }
  push(samples, output) {
    // Weighted area resampling keeps fractional phase across render quanta (e.g. 44.1k).
    for (let sample of samples) {
      if (this.taps) {
        if (!this.initialized) { this.history.fill(sample); this.initialized = true }
        this.history[this.cursor] = sample
        let filtered = 0
        let at = this.cursor
        for (const tap of this.taps) {
          filtered += tap * this.history[at]
          if (--at < 0) at = this.history.length - 1
        }
        this.cursor = (this.cursor + 1) % this.history.length
        sample = filtered
      }
      let remaining = 1
      while (remaining > 1e-9) {
        const take = Math.min(remaining, this.ratio - this.weight)
        this.total += sample * take
        this.weight += take
        remaining -= take
        if (this.weight >= this.ratio - 1e-9) {
          output(this.total / this.ratio)
          this.weight = this.total = 0
        }
      }
    }
  }
}

const WorkletBase = globalThis.AudioWorkletProcessor || class {}
class TalkAudioProcessor extends WorkletBase {
  constructor() {
    super()
    this.codec = null
    this.frame = new Uint8Array(320)
    this.index = 0
    this.resampler = new VoiceResampler(sampleRate)
    this.speaker = []
    this.offset = 0
    this.playing = false
    this.micSamples = this.micEnergy = this.micPeak = this.micClipped = 0
    this.port.onmessage = ({ data }) => {
      if (data.codec) this.codec = data.codec
      if (data.audio && this.codec) {
        for (const value of new Uint8Array(data.audio)) this.speaker.push(decodeG711(value, this.codec))
        // At most 200ms; discard old sound on a stalled UI/network.
        if (this.speaker.length > 1600) {
          this.speaker.splice(0, this.speaker.length - 800)
          this.offset = 0
        }
      }
    }
  }
  process(inputs, outputs) {
    if (this.codec && inputs[0]?.[0]) {
      for (const value of inputs[0][0]) {
        this.micSamples++
        this.micEnergy += value * value
        this.micPeak = Math.max(this.micPeak, Math.abs(value))
        if (Math.abs(value) >= .99) this.micClipped++
      }
      if (this.micSamples >= sampleRate) {
        this.port.postMessage({ microphone: { sampleRate,
          rmsDb: 10 * Math.log10(Math.max(1e-12, this.micEnergy / this.micSamples)),
          peak: this.micPeak, clippedFraction: this.micClipped / this.micSamples } })
        this.micSamples = this.micEnergy = this.micPeak = this.micClipped = 0
      }
      this.resampler.push(inputs[0][0], (value) => {
        this.frame[this.index++] = encodeG711(value, this.codec)
        if (this.index === 320) {
          this.port.postMessage({ audio: this.frame.buffer }, [this.frame.buffer])
          this.frame = new Uint8Array(320)
          this.index = 0
        }
      })
    }
    const output = outputs[0][0]
    if (!this.playing && this.speaker.length >= 320) this.playing = true
    if (this.playing) {
      for (let i = 0; i < output.length; i++) {
        const at = Math.floor(this.offset)
        if (at + 1 >= this.speaker.length) {
          this.playing = false
          break
        }
        const fraction = this.offset - at
        output[i] = this.speaker[at] * (1 - fraction) + this.speaker[at + 1] * fraction
        this.offset += 8000 / sampleRate
      }
      const consumed = Math.floor(this.offset)
      this.speaker.splice(0, consumed)
      this.offset -= consumed
    }
    return true
  }
}
if (typeof registerProcessor === 'function') registerProcessor('lvtong-talk', TalkAudioProcessor)
