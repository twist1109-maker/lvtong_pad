<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { ScreenScaler } from '@/layout'
import { appConfig } from '@/config/env'
import { useWsStore } from '@/stores/useWsStore'
import { installTouchInteractionGuard } from '@/utils/touchInteraction'

const wsStore = useWsStore()
let removeTouchGuard: (() => void) | undefined

onMounted(() => {
  removeTouchGuard = installTouchInteractionGuard()
  if (!appConfig.useMock) {
    wsStore.connect()
  }
})

onUnmounted(() => {
  removeTouchGuard?.()
  wsStore.disconnect()
})
</script>

<template>
  <ScreenScaler>
    <router-view />
  </ScreenScaler>
</template>
