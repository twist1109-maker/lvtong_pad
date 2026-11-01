/**
 * 与安卓 LvTongPhotoHttp2 使用同一套上传协议：
 * POST /api/mobile/upload/image  （dirName + file）
 * POST /api/mobile/upload/json   （file，文件名 photo_yyyyMMddHHmmss.json）
 * 字段名对齐 JsonUtil.CaptureImgEntity。提交整单时不带通行码，通行码单独上传。
 */
import { appConfig } from '@/config/env'
import { parsePasscode } from './passcode'

export interface CaptureJson {
  carHeadImg: string
  carBodyImg: string
  carTailImg: string
  goodsImg1: string
  goodsImg2: string
  goodsImg3: string
  evidenceImg_Optional: string
  goodsImg_Chase: string
  evidenceImg_Chase: string
  passCodeImg: string
  vehicleLicenseImg1: string
  vehicleLicenseImg2: string
  passcodeQRCodeInfo: string
  phone: string
  plate_number_gc: string
  goods_type: string
}

export function emptyCaptureJson(): CaptureJson {
  return {
    carHeadImg: '',
    carBodyImg: '',
    carTailImg: '',
    goodsImg1: '',
    goodsImg2: '',
    goodsImg3: '',
    evidenceImg_Optional: '',
    goodsImg_Chase: '',
    evidenceImg_Chase: '',
    passCodeImg: '',
    vehicleLicenseImg1: '',
    vehicleLicenseImg2: '',
    passcodeQRCodeInfo: '',
    phone: '',
    plate_number_gc: '',
    goods_type: '',
  }
}

export function photoStamp(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`
  )
}

/** 对齐后端 _parse_passcode：至少 14 段，且车牌展示号非空，才视为有效通行码 */
export function isPasscodeContentValid(raw: string): boolean {
  return parsePasscode(raw) !== null
}

export function passcodeDisplayPlate(raw: string): string {
  return (raw.split('|')[0] ?? '').trim().replace(/_[0-9]+$/, '')
}

function mobileUrl(path: string): string {
  const base = appConfig.apiBaseUrl.replace(/\/$/, '')
  return `${base}${path}`
}

async function readCode(res: Response): Promise<boolean> {
  if (!res.ok) return false
  try {
    const body = (await res.json()) as { code?: number }
    return body.code === 0
  } catch {
    return false
  }
}

export async function pingMobileHealth(signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(mobileUrl('/mobile/health'), { signal })
    return readCode(res)
  } catch {
    return false
  }
}

export async function uploadMobileImage(
  dirName: string,
  filename: string,
  blob: Blob,
  signal?: AbortSignal,
): Promise<boolean> {
  const form = new FormData()
  form.append('dirName', dirName)
  form.append('file', blob, filename)
  try {
    const res = await fetch(mobileUrl('/mobile/upload/image'), {
      method: 'POST',
      body: form,
      signal,
    })
    return readCode(res)
  } catch {
    return false
  }
}

export async function uploadMobileJson(
  filename: string,
  json: CaptureJson,
  signal?: AbortSignal,
): Promise<boolean> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (signal?.aborted) return false
  signal?.addEventListener('abort', abort, { once: true })
  const timeout = setTimeout(abort, 15000)
  const form = new FormData()
  const file = new Blob([JSON.stringify(json)], { type: 'application/json' })
  form.append('file', file, filename)
  try {
    const res = await fetch(mobileUrl('/mobile/upload/json'), {
      method: 'POST',
      body: form,
      signal: controller.signal,
    })
    return readCode(res)
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}

function fitSize(width: number, height: number, maxEdge: number) {
  const edge = Math.max(width, height)
  if (edge <= maxEdge) return { width, height }
  const scale = maxEdge / edge
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

function canvasToJpeg(
  source: CanvasImageSource,
  width: number,
  height: number,
  maxEdge: number,
  quality: number,
): Promise<Blob> {
  const size = fitSize(width, height, maxEdge)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.reject(new Error('无法创建画布'))
  ctx.drawImage(source, 0, 0, size.width, size.height)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('图片压缩失败'))),
      'image/jpeg',
      quality,
    )
  })
}

export function videoToJpeg(
  video: HTMLVideoElement,
  maxEdge = 1920,
  quality = 0.85,
): Promise<Blob> {
  const width = video.videoWidth
  const height = video.videoHeight
  if (!width || !height) return Promise.reject(new Error('摄像头画面未就绪'))
  return canvasToJpeg(video, width, height, maxEdge, quality)
}

export function fileToJpeg(file: File, maxEdge = 1920, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      canvasToJpeg(img, img.naturalWidth, img.naturalHeight, maxEdge, quality).then(resolve, reject)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片无法读取'))
    }
    img.src = url
  })
}

let qrReader: import('@zxing/browser').BrowserQRCodeReader | null = null

/** 与 PC 后台相同：从通行码原文生成标准 QR 图，本地回填无需等 WebSocket。 */
export async function createPasscodeQrImage(raw: string): Promise<string> {
  const { QRCodeWriter, BarcodeFormat, EncodeHintType } = await import('@zxing/library')
  const matrix = new QRCodeWriter().encode(raw, BarcodeFormat.QR_CODE, 300, 300,
    new Map([[EncodeHintType.CHARACTER_SET, 'UTF-8']]))
  const canvas = document.createElement('canvas')
  canvas.width = matrix.getWidth()
  canvas.height = matrix.getHeight()
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法生成通行码图片')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#000'
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) if (matrix.get(x, y)) ctx.fillRect(x, y, 1, 1)
  }
  return canvas.toDataURL('image/png')
}

function qrCanvas(source: HTMLCanvasElement, center: boolean) {
  const edge = Math.min(source.width, source.height) * 0.8
  const width = center ? edge : source.width
  const height = center ? edge : source.height
  const size = fitSize(width, height, 1600)
  const canvas = document.createElement('canvas')
  // 白边兼容二维码贴边／缺少静区的画面。保留长宽比例，不裁掉全帧中的其他区域。
  canvas.width = size.width + 48
  canvas.height = size.height + 48
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, (source.width - width) / 2, (source.height - height) / 2,
    width, height, 24, 24, size.width, size.height)
  return canvas
}

export async function decodeQrFromCanvas(canvas: HTMLCanvasElement): Promise<string | null> {
  const Detector = (
    globalThis as unknown as {
      BarcodeDetector?: new (opts: { formats: string[] }) => {
        detect: (src: CanvasImageSource) => Promise<{ rawValue?: string }[]>
      }
    }
  ).BarcodeDetector
  if (typeof Detector === 'function') {
    try {
      const codes = await new Detector({ formats: ['qr_code'] }).detect(canvas)
      const raw = codes[0]?.rawValue
      if (raw) return raw
    } catch {
      /* 交给 zxing */
    }
  }
  try {
    if (!qrReader) {
      const [{ BrowserQRCodeReader }, { DecodeHintType }] = await Promise.all([
        import('@zxing/browser'), import('@zxing/library'),
      ])
      qrReader = new BrowserQRCodeReader(new Map([[DecodeHintType.TRY_HARDER, true]]))
    }
    // 全帧优先，随后尝试中心区域和原始分辨率，兼容没有 BarcodeDetector 的平板浏览器。
    for (const candidate of [qrCanvas(canvas, false), qrCanvas(canvas, true), canvas]) {
      try { return qrReader.decodeFromCanvas(candidate).getText() } catch { /* 下一种取景 */ }
    }
    return null
  } catch {
    return null
  }
}
