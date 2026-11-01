/** 可在浏览器控制台执行，也可由浏览器自动化 evaluate。只读取页面。 */
export function auditLayout() {
  const stage = document.querySelector('.screen-scaler-stage')
  const issues = []
  if (!stage) return { viewport: [innerWidth, innerHeight], checked: 0, issues: ['缺少缩放画布'] }
  const bounds = stage.getBoundingClientRect()
  const epsilon = 1.5
  if (bounds.left < -epsilon || bounds.top < -epsilon || bounds.right > innerWidth + epsilon || bounds.bottom > innerHeight + epsilon) {
    issues.push('设计画布超出可见视口')
  }
  const available = document.querySelector('.screen-scaler-available').getBoundingClientRect()
  if (Math.abs(bounds.width - available.width) > epsilon || Math.abs(bounds.height - available.height) > epsilon) issues.push('画布未铺满可用视口')
  const scale = bounds.width / stage.offsetWidth
  if (Math.abs(scale - bounds.height / stage.offsetHeight) > 0.002) issues.push('控件缩放比例失真')
  const dashboard = document.querySelector('.dashboard')
  if (dashboard) {
    const page = dashboard.getBoundingClientRect()
    if (Math.abs(page.height - bounds.height) > epsilon || Math.abs(page.width - bounds.width) > epsilon) issues.push('主页未铺满画布（检查懒加载样式覆盖）')
  }
  // 遮罩必须覆盖整个画布，不能被针对弹窗内容的最大尺寸规则截断。
  for (const overlay of stage.querySelectorAll('.scan-overlay')) {
    const rect = overlay.getBoundingClientRect()
    if (['left', 'top', 'right', 'bottom'].some(edge => Math.abs(rect[edge] - bounds[edge]) > epsilon)) {
      issues.push('扫码遮罩未铺满画布')
    }
  }

  const controls = Array.from(stage.querySelectorAll('button, input:not([type="hidden"]), select, textarea, [role="dialog"]'))
  let checked = 0
  for (const el of controls) {
    const rect = el.getBoundingClientRect()
    if (!rect.width || !rect.height || getComputedStyle(el).visibility === 'hidden') continue
    checked++
    const name = el.getAttribute('title') || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.textContent.trim().slice(0, 24) || el.className
    if (rect.left < bounds.left - epsilon || rect.right > bounds.right + epsilon || rect.top < bounds.top - epsilon || rect.bottom > bounds.bottom + epsilon) {
      issues.push(`控件超出画布: ${name}`)
      continue
    }
    for (let ancestor = el.parentElement; ancestor && ancestor !== stage; ancestor = ancestor.parentElement) {
      const css = getComputedStyle(ancestor)
      const clip = ancestor.getBoundingClientRect()
      const clippedX = /hidden|auto|scroll|clip/.test(css.overflowX) && (rect.left < clip.left - epsilon || rect.right > clip.right + epsilon)
      const clippedY = /hidden|auto|scroll|clip/.test(css.overflowY) && (rect.top < clip.top - epsilon || rect.bottom > clip.bottom + epsilon)
      if (clippedX || clippedY) {
        issues.push(`控件被裁切或需要滚动: ${name} / ${ancestor.className}`)
        break
      }
    }
  }
  const noScroll = '.dashboard,.dashboard-body,.panel-left,.panel-right,.form-body,.capture-grid,.hardware-bar,.cap-dialog,.cap-dialog .split,.cap-dialog .col,.drv-dialog,.drv-dialog .body,.scan-dialog,.camera-dialog,.login-page,.history-dialog,.history-dialog .dialog-body,.booking-dialog'
  for (const el of stage.querySelectorAll(noScroll)) {
    if (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2) issues.push(`布局需要滚动: ${el.className}`)
  }
  return { viewport: [innerWidth, innerHeight], scale, checked, issues }
}
