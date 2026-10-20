/**
 * 纯前端透视影像处理 — 对齐 Qt + color_demo
 * - utils/levels.cpp          色阶 LUT
 * - utils/ImageProcess.cpp    伪彩彩虹映射
 *
 * mock_back 的 /api/mock/captures/file 已将 TIFF 转成 PNG，可直接用 URL。
 */
/** 对齐 Levels::generateLUT(black, gamma, white) */
export function generateLevelsLut(
  black = 0,
  gamma = 1.0,
  white = 255,
): Uint8Array {
  black = Math.max(0, Math.min(254, Math.round(black)))
  gamma = Math.max(0.1, Math.min(5.0, gamma))
  white = Math.max(1, Math.min(255, Math.round(white)))
  if (white <= black) white = black + 1

  const lut = new Uint8Array(256)
  for (let i = 0; i < 256; i++) {
    let value = i
    if (value <= black) {
      value = 0
    } else if (value >= white) {
      value = 255
    } else {
      value = (255 * (value - black)) / (white - black)
    }

    if (gamma !== 1.0) {
      value = 255 * Math.pow(value / 255, 1 / gamma)
    }

    lut[i] = Math.max(0, Math.min(255, Math.round(value)))
  }
  return lut
}

/** HSV → RGB，对齐 QColor::fromHsvF */
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6)
  const f = h * 6 - i
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)
  switch (i % 6) {
    case 0:
      return [v, t, p]
    case 1:
      return [q, v, p]
    case 2:
      return [p, v, t]
    case 3:
      return [p, q, v]
    case 4:
      return [t, p, v]
    default:
      return [v, p, q]
  }
}

/**
 * 伪彩 LUT — 对齐 ImageProcess::pseudoColor
 * i > 180 → 白；否则 hue = (1 - i/255) * 300，S=V=1
 */
export function generatePseudoColorLut(): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 3)
  for (let i = 0; i < 256; i++) {
    let r: number
    let g: number
    let b: number
    if (i > 180) {
      r = g = b = 255
    } else {
      const hue = ((1 - i / 255) * 300) / 360
      const [rf, gf, bf] = hsvToRgb(hue, 1, 1)
      r = Math.round(rf * 255)
      g = Math.round(gf * 255)
      b = Math.round(bf * 255)
    }
    const o = i * 3
    lut[o] = r
    lut[o + 1] = g
    lut[o + 2] = b
  }
  return lut
}

const PSEUDO_LUT = generatePseudoColorLut()

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图像加载失败'))
    img.src = src
  })
}

function toGray(r: number, g: number, b: number): number {
  // 对齐 Qt qGray: (r*11 + g*16 + b*5) / 32
  return (r * 11 + g * 16 + b * 5) >> 5
}

export interface ProcessOptions {
  gamma?: number
  white?: number
  black?: number
  /** 伪彩渲染开关 — 对齐 btn_pseudoColor */
  pseudoColor?: boolean
}

/**
 * 对原图做色阶，可选伪彩。
 * 流程：原图 →（必要时缩小）→ 色阶 LUT → [渲染开?] 伪彩 LUT → DataURL
 *
 * 占位/雷达原图可达万级宽度；不缩小会在主线程扫数千万像素，小车动画明显卡顿。
 */
const PREVIEW_MAX_EDGE = 1600

export async function processImage(
  sourceUrl: string,
  options: ProcessOptions = {},
): Promise<string> {
  const {
    gamma = 2.0,
    white = 128,
    black = 0,
    pseudoColor = false,
  } = options

  const img = await loadImage(sourceUrl)
  const srcW = img.naturalWidth || img.width
  const srcH = img.naturalHeight || img.height
  const edge = Math.max(srcW, srcH)
  const scale = edge > PREVIEW_MAX_EDGE ? PREVIEW_MAX_EDGE / edge : 1
  const w = Math.max(1, Math.round(srcW * scale))
  const h = Math.max(1, Math.round(srcH * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 不可用')

  ctx.drawImage(img, 0, 0, w, h)
  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data
  const levelsLut = generateLevelsLut(black, gamma, white)

  // 按行处理并周期性让出主线程，避免一次扫完整幅把小车卡死
  const rowBytes = w * 4
  const yieldEvery = 48
  for (let y = 0; y < h; y++) {
    const row = y * rowBytes
    for (let x = 0; x < w; x++) {
      const i = row + x * 4
      const gray = toGray(data[i], data[i + 1], data[i + 2])
      const leveled = levelsLut[gray]

      if (pseudoColor) {
        const o = leveled * 3
        data[i] = PSEUDO_LUT[o]
        data[i + 1] = PSEUDO_LUT[o + 1]
        data[i + 2] = PSEUDO_LUT[o + 2]
      } else {
        data[i] = leveled
        data[i + 1] = leveled
        data[i + 2] = leveled
      }
    }
    if (y > 0 && y % yieldEvery === 0) {
      await new Promise<void>((r) => setTimeout(r, 0))
    }
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL('image/jpeg', 0.85)
}
