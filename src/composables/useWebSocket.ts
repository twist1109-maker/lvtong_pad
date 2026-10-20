import { onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useWsStore } from '@/stores/useWsStore'
import type { WsMessageHandler } from '@/services/websocket'

/**
 * 组件内使用 WebSocket 的 composable。
 * 示例：const { isConnected, send } = useWebSocket(WsMessageType.VehicleInfo, handler)
 */
export function useWebSocket(
  messageType?: string,
  handler?: WsMessageHandler,
) {
  const wsStore = useWsStore()
  const { status, isConnected, lastMessage, lastError } = storeToRefs(wsStore)

  let unsubscribe: (() => void) | undefined

  if (messageType && handler) {
    unsubscribe = wsStore.subscribe(messageType, handler)
  }

  onUnmounted(() => {
    unsubscribe?.()
  })

  return {
    status,
    isConnected,
    lastMessage,
    lastError,
    connect: wsStore.connect,
    disconnect: wsStore.disconnect,
    send: wsStore.send,
    subscribe: wsStore.subscribe,
  }
}
