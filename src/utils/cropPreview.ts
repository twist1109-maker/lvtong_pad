export type CropBoxPayload = {
  x1: number
  y1: number
  x2: number
  y2: number
  sourceTempUrl: string
  /** 松开鼠标时从已加载图像裁出，独立于服务端临时缓存。 */
  fallbackImage: string
}

export function cropLoadedImage(image: HTMLImageElement, box: Pick<CropBoxPayload, 'x1' | 'y1' | 'x2' | 'y2'>): string {
  const x = Math.max(0, Math.floor(Math.min(box.x1, box.x2)))
  const y = Math.max(0, Math.floor(Math.min(box.y1, box.y2)))
  const width = Math.min(image.naturalWidth, Math.ceil(Math.max(box.x1, box.x2))) - x
  const height = Math.min(image.naturalHeight, Math.ceil(Math.max(box.y1, box.y2))) - y
  if (!image.complete || width <= 0 || height <= 0) throw new Error('图片尚未加载，无法截图')
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('截图失败，请重新框选')
  ctx.drawImage(image, x, y, width, height, 0, 0, width, height)
  return canvas.toDataURL('image/png')
}

async function readImage(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) throw new Error('无法读取原图裁块')
  const blob = await response.blob()
  if (!blob.type.startsWith('image/')) throw new Error('原图裁块不是图片')
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('读取截图失败'))
    reader.readAsDataURL(blob)
  })
}

/** 优先保留原图分辨率；缓存失效时使用已显示的图。预览与提交均持有图片数据。 */
export async function resolveCropPreview(
  payload: CropBoxPayload,
  requestOriginal: () => Promise<string>,
  materialize = readImage,
): Promise<string> {
  if (payload.sourceTempUrl.startsWith('/api/temp-images/')) {
    try {
      const image = await materialize(await requestOriginal())
      if (image.startsWith('data:image/')) return image
    } catch (error) {
      console.info('[crop] 原图缓存不可用，使用页面已加载的影像', error)
    }
  }
  if (!payload.fallbackImage.startsWith('data:image/')) throw new Error('没有可用的截图，请重新框选')
  return payload.fallbackImage
}
