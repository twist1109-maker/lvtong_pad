/** 平板按系统控件操作；滚动、输入及应用自己的拖动/缩放仍由各组件处理。 */
export function installTouchInteractionGuard() {
  const touchDevice = () => navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches
  const editable = (target: EventTarget | null) => target instanceof Element &&
    !!target.closest('input, textarea, [contenteditable="true"]')
  const contextMenu = (event: Event) => { if (touchDevice()) event.preventDefault() }
  const selection = (event: Event) => { if (touchDevice() && !editable(event.target)) event.preventDefault() }
  const gesture = (event: Event) => { if (touchDevice()) event.preventDefault() }
  const doubleClick = (event: MouseEvent) => { if (touchDevice() && !editable(event.target)) event.preventDefault() }
  const drag = (event: DragEvent) => { if (touchDevice() && !editable(event.target)) event.preventDefault() }
  document.addEventListener('contextmenu', contextMenu)
  document.addEventListener('selectstart', selection)
  document.addEventListener('dragstart', drag)
  document.addEventListener('dblclick', doubleClick, { passive: false })
  document.addEventListener('gesturestart', gesture, { passive: false })
  document.addEventListener('gesturechange', gesture, { passive: false })
  return () => {
    document.removeEventListener('contextmenu', contextMenu)
    document.removeEventListener('selectstart', selection)
    document.removeEventListener('dragstart', drag)
    document.removeEventListener('dblclick', doubleClick)
    document.removeEventListener('gesturestart', gesture)
    document.removeEventListener('gesturechange', gesture)
  }
}
