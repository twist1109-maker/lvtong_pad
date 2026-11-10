export type SelectionPoint = { x: number; y: number }

/** Client coordinates use the rendered rectangle, including the page's CSS scale. */
export function selectionPoint(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): SelectionPoint {
  return { x: Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width))),
    y: Math.max(0, Math.min(1, (clientY - rect.top) / Math.max(1, rect.height))) }
}

export function selectionPixels(a: SelectionPoint, b: SelectionPoint, width: number, height: number) {
  const x1 = Math.max(0, Math.floor(Math.min(a.x, b.x) * width))
  const y1 = Math.max(0, Math.floor(Math.min(a.y, b.y) * height))
  const x2 = Math.min(width, Math.ceil(Math.max(a.x, b.x) * width))
  const y2 = Math.min(height, Math.ceil(Math.max(a.y, b.y) * height))
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
}
