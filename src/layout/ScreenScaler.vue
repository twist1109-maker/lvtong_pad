<script setup lang="ts">
import { ref } from 'vue'
import { useScreenScale } from '@/composables/useScreenScale'

const viewport = ref<HTMLElement | null>(null)
const { scale, designWidth, designHeight, viewportHeight } = useScreenScale(viewport)
</script>

<template>
  <div class="screen-scaler-viewport" :style="{ height: `${viewportHeight}px` }">
    <div ref="viewport" class="screen-scaler-available">
      <div class="screen-scaler-fit" :style="{ width: `${designWidth * scale}px`, height: `${designHeight * scale}px` }">
        <div
          class="screen-scaler-stage"
          :style="{
            width: `${designWidth}px`,
            height: `${designHeight}px`,
            transform: `scale(${scale})`,
          }"
        >
          <div id="app-overlay-root" />
          <slot />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.screen-scaler-viewport {
  position: fixed;
  inset: 0;
  height: 100vh;
  height: 100dvh;
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  background: #ebebeb;
  overflow: hidden;
}

.screen-scaler-available {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.screen-scaler-fit {
  position: relative;
  flex-shrink: 0;
}

.screen-scaler-stage {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: top left;
  isolation: isolate;
}
</style>
