<script setup lang="ts">
/**
 * 图像采集海康预览长连接宿主：Dashboard 挂载后预热，弹窗关闭也不断流。
 */
import { onMounted, onUnmounted, ref } from 'vue'
import { useHikvisionPlayer } from '@/composables/useHikvisionPlayer'
import {
  registerHikCapturePlayer,
  unregisterHikCapturePlayer,
} from '@/composables/hikCaptureContext'
import { HIK_CAPTURE_DEVICE_IDS } from '@/config/hikvision'

const hiddenAnchorRef = ref<HTMLElement | null>(null)

const player = useHikvisionPlayer(hiddenAnchorRef)

registerHikCapturePlayer(player)

const {
  iframeRef,
  iframeSrc,
  initIframe,
  warmupAll,
  hide,
  onIframeLoad,
} = player

onMounted(async () => {
  initIframe()
  await warmupAll([...HIK_CAPTURE_DEVICE_IDS])
  window.setTimeout(() => hide(), 400)
})

onUnmounted(() => {
  unregisterHikCapturePlayer(player)
  void player.stop()
})
</script>

<template>
  <div ref="hiddenAnchorRef" class="hik-hidden-anchor" aria-hidden="true" />
  <iframe
    v-if="iframeSrc"
    ref="iframeRef"
    class="hik-iframe-fs"
    :src="iframeSrc"
    title="图像采集摄像头"
    allow="fullscreen"
    @load="onIframeLoad"
  />
</template>

<style scoped lang="scss">
.hik-hidden-anchor {
  position: fixed;
  left: -10000px;
  top: -10000px;
  width: 160px;
  height: 90px;
  pointer-events: none;
  visibility: hidden;
}

.hik-iframe-fs {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  border: 0;
  margin: 0;
  padding: 0;
  background: transparent;
  pointer-events: none;
  z-index: 10001;
}
</style>
