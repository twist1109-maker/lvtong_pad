import { onMounted, onUnmounted, ref, type Ref } from 'vue'
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '@/config/layout'

export function useScreenScale(viewport: Ref<HTMLElement | null>) {
  const scale = ref(1)
  const designWidth = ref(DESIGN_WIDTH)
  const designHeight = ref(DESIGN_HEIGHT)
  const viewportHeight = ref(window.visualViewport?.height ?? window.innerHeight)
  let observer: ResizeObserver | undefined

  function updateScale() {
    // 部分 Pad 浏览器的 100vh 包含动态工具栏，使用实际可见高度避免底部被遮住。
    viewportHeight.value = Math.min(window.innerHeight, window.visualViewport?.height ?? window.innerHeight)
    if (!viewport.value) return
    const { width, height } = viewport.value.getBoundingClientRect()
    // 不设最小缩放限制，避免小尺寸/竖屏设备裁掉画布。
    if (width <= 0 || height <= 0) return
    const nextScale = Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT)
    scale.value = nextScale
    // 控件等比缩放，面板使用剩余空间，避免固定 16:9 画布产生留白。
    designWidth.value = width / nextScale
    designHeight.value = height / nextScale
  }

  onMounted(() => {
    updateScale()
    observer = new ResizeObserver(updateScale)
    if (viewport.value) observer.observe(viewport.value)
    window.addEventListener('resize', updateScale)
    window.visualViewport?.addEventListener('resize', updateScale)
  })

  onUnmounted(() => {
    observer?.disconnect()
    window.removeEventListener('resize', updateScale)
    window.visualViewport?.removeEventListener('resize', updateScale)
  })

  return {
    scale,
    designWidth,
    designHeight,
    viewportHeight,
  }
}
