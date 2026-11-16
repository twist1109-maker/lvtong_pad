const background = [247, 251, 250] as const

/** 在未叠加文字的渲染帧中查找点云及测量框像素，排除背景和极淡抗锯齿边缘。 */
export function cloudPixelBounds(data: Uint8ClampedArray, width: number, height: number) {
  let left = width, top = height, right = -1, bottom = -1
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = (y * width + x) * 4
    if (data[index + 3]! < 16 || Math.max(Math.abs(data[index]! - background[0]),
      Math.abs(data[index + 1]! - background[1]), Math.abs(data[index + 2]! - background[2])) < 16) continue
    left = Math.min(left, x); right = Math.max(right, x)
    top = Math.min(top, y); bottom = Math.max(bottom, y)
  }
  return right < left ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
}

/** 仅裁剪导出图片；保留当前视角和像素比例，右下角三行尺寸不遮挡车辆。 */
export function createCloudScreenshot(frame: HTMLCanvasElement, measured: number[], pixelRatio: number) {
  const source = frame.getContext('2d', { willReadFrequently: true })!
  const bounds = cloudPixelBounds(source.getImageData(0, 0, frame.width, frame.height).data, frame.width, frame.height)
  if (!bounds) throw new Error('当前视角没有可见点云，请复位视角后再截图')
  const ratio = Math.max(1, pixelRatio)
  const padding = Math.ceil(Math.max(6 * ratio, Math.min(14 * ratio, bounds.width * .025)))
  const inset = Math.ceil(8 * ratio), lineHeight = Math.ceil(20 * ratio)
  const font = `${14 * ratio}px "Microsoft YaHei", sans-serif`
  const names = ['长', '宽', '高'], colors = ['#d66d42', '#148c79', '#407ed0']
  const lines = names.map((name, i) => `${name} ${measured[i]!.toFixed(3)} m`)
  source.font = font
  const legendWidth = Math.ceil(Math.max(...lines.map(text => source.measureText(text).width))) + inset * 2
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(bounds.width + padding * 2, legendWidth + padding * 2)
  canvas.height = bounds.height + padding * 2 + lineHeight * 3 + inset
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#f7fbfa'; ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(frame, bounds.x, bounds.y, bounds.width, bounds.height,
    Math.floor((canvas.width - bounds.width) / 2), padding, bounds.width, bounds.height)
  const legendX = canvas.width - padding - legendWidth
  const legendY = canvas.height - padding - lineHeight * 3 - inset
  ctx.fillStyle = '#fff'; ctx.fillRect(legendX, legendY, legendWidth, lineHeight * 3 + inset)
  ctx.font = font; ctx.textBaseline = 'middle'
  lines.forEach((text, i) => {
    ctx.fillStyle = colors[i]!
    ctx.fillText(text, legendX + inset, legendY + inset / 2 + lineHeight * (i + .5))
  })
  return canvas.toDataURL('image/png')
}
