<script setup lang="ts">
import { useScreenScale } from '@/composables/useScreenScale'

const { scale, designWidth, designHeight } = useScreenScale()
</script>

<template>
  <div class="screen-scaler-viewport">
    <div
      class="screen-scaler-stage"
      :style="{
        width: `${designWidth}px`,
        height: `${designHeight}px`,
        transform: `scale(${scale})`,
      }"
    >
      <slot />
    </div>
  </div>
</template>

<style scoped lang="scss">
.screen-scaler-viewport {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ebebeb;
}

.screen-scaler-stage {
  transform-origin: center center;
  flex-shrink: 0;
  overflow: hidden;
}
</style>
