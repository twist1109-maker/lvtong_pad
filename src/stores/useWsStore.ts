import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { appConfig } from '@/config/env'
import {
  WebSocketClient,
  WsMessageType,
  type WsConnectionStatus,
  type WsEnvelope,
  type WsMessageHandler,
} from '@/services/websocket'

let client: WebSocketClient | null = null

export const useWsStore = defineStore('websocket', () => {
  const status = ref<WsConnectionStatus>('idle')
  const lastMessage = ref<WsEnvelope | null>(null)
  const lastError = ref<string | null>(null)
  /** 最近一次 plc_status（面板晚开时回放） */
  const lastPlcStatus = ref<Record<string, unknown> | null>(null)
  /** 雷达位置不属于预约状态；页面晚订阅时仍能恢复最近的实时位置。 */
  const lastRadarDistance = ref<WsEnvelope | null>(null)
  let lastRadarReceivedAt = 0

  const isConnected = computed(() => status.value === 'open')

  function ensureClient() {
    if (client) return client

    client = new WebSocketClient({
      url: appConfig.wsUrl,
      reconnectMaxRetries: appConfig.wsReconnectMaxRetries,
      heartbeatInterval: appConfig.wsHeartbeatInterval,
      onStatusChange: (next) => {
        status.value = next
      },
      onMessage: (payload) => {
        lastMessage.value = payload
        if (payload?.type === 'radar_distance') {
          lastRadarDistance.value = payload
          lastRadarReceivedAt = Date.now()
        }
        if (
          payload?.type === 'plc_status' &&
          payload.data &&
          typeof payload.data === 'object'
        ) {
          lastPlcStatus.value = payload.data as Record<string, unknown>
        }
      },
      onError: () => {
        lastError.value = 'WebSocket 连接异常'
      },
    })

    return client
  }

  function connect() {
    if (appConfig.useMock) {
      console.info('[WebSocket] Mock 模式，跳过连接')
      return
    }
    ensureClient().connect()
  }

  function disconnect() {
    client?.disconnect()
    status.value = 'idle'
  }

  function send<T>(message: WsEnvelope<T>) {
    return ensureClient().send(message)
  }

  function subscribe(type: WsMessageType | string, handler: WsMessageHandler) {
    const unsubscribe = ensureClient().subscribe(type, handler)
    const radar = lastRadarDistance.value
    if (type === 'radar_distance' && radar && Date.now() - lastRadarReceivedAt <= 5000) {
      handler(radar)
    }
    return unsubscribe
  }

  /** 订阅全部消息（调试用） */
  function subscribeAll(handler: WsMessageHandler) {
    return ensureClient().subscribe('*', handler)
  }

  return {
    status,
    lastMessage,
    lastPlcStatus,
    lastError,
    isConnected,
    connect,
    disconnect,
    send,
    subscribe,
    subscribeAll,
  }
})
