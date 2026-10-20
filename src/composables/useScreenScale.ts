import { onMounted, onUnmounted, ref } from 'vue'
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  SCALE_MAX,
  SCALE_MIN,
} from '@/config/layout'

export function useScreenScale() {
  const scale = ref(1)

  function updateScale() {
    const scaleX = window.innerWidth / DESIGN_WIDTH
    const scaleY = window.innerHeight / DESIGN_HEIGHT
    scale.value = Math.min(
      SCALE_MAX,
      Math.max(SCALE_MIN, Math.min(scaleX, scaleY)),
    )
  }

  onMounted(() => {
    updateScale()
    window.addEventListener('resize', updateScale)
  })

  onUnmounted(() => {
    window.removeEventListener('resize', updateScale)
  })

  return {
    scale,
    designWidth: DESIGN_WIDTH,
    designHeight: DESIGN_HEIGHT,
  }
}
