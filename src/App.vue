<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { ScreenScaler } from '@/layout'
import { appConfig } from '@/config/env'
import { useWsStore } from '@/stores/useWsStore'

const wsStore = useWsStore()

onMounted(() => {
  if (!appConfig.useMock) {
    wsStore.connect()
  }
})

onUnmounted(() => {
  wsStore.disconnect()
})
</script>

<template>
  <ScreenScaler v-if="appConfig.enableScreenScale">
    <router-view />
  </ScreenScaler>
  <router-view v-else />
</template>
