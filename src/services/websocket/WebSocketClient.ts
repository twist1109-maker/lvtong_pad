import { io, Socket } from 'socket.io-client'
import type {
  WsClientOptions,
  WsConnectionStatus,
  WsEnvelope,
  WsMessageHandler,
} from './types'

/**
 * WebSocket 客户端 — 基于 Socket.IO 协议与 flask-socketio 通信。
 * 业务层通过 useWsStore 使用，不直接 new。
 */
export class WebSocketClient {
  private socket: Socket | null = null
  private status: WsConnectionStatus = 'idle'
  private readonly handlers = new Map<string, Set<WsMessageHandler>>()
  private readonly options: WsClientOptions

  constructor(options: WsClientOptions) {
    this.options = {
      reconnectMaxRetries: 10,
      heartbeatInterval: 30000,
      ...options,
    }
  }

  get connectionStatus(): WsConnectionStatus {
    return this.status
  }

  connect() {
    if (this.socket?.connected) return

    this.setStatus('connecting')

    // 构建 Socket.IO URL：如果以 / 开头，使用当前 host
    let url = this.options.url
    if (url.startsWith('/')) {
      url = window.location.origin
    }

    this.socket = io(url, {
      path: this.options.url.startsWith('/') ? this.options.url : '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: this.options.reconnectMaxRetries,
      reconnectionDelay: 1000,
    })

    this.socket.on('connect', () => {
      this.setStatus('open')
    })

    this.socket.on('message', (payload: WsEnvelope) => {
      if (!payload || typeof payload !== 'object') return
      this.options.onMessage?.(payload)
      this.dispatch(payload.type, payload)
    })

    this.socket.on('disconnect', () => {
      this.setStatus('closed')
    })

    this.socket.on('connect_error', () => {
      this.setStatus('error')
      this.options.onError?.(new Event('connect_error'))
    })

    this.socket.on('reconnect_attempt', () => {
      this.setStatus('reconnecting')
    })
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
    this.setStatus('idle')
  }

  send<T>(message: WsEnvelope<T>) {
    if (!this.socket?.connected) {
      console.warn('[SocketIO] 未连接，消息未发送:', message.type)
      return false
    }
    this.socket.emit('message', message)
    return true
  }

  subscribe(type: string, handler: WsMessageHandler) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set())
    }
    this.handlers.get(type)!.add(handler)

    return () => {
      this.handlers.get(type)?.delete(handler)
    }
  }

  private dispatch(type: string, payload: WsEnvelope) {
    this.handlers.get(type)?.forEach((handler) => handler(payload))
    this.handlers.get('*')?.forEach((handler) => handler(payload))
  }

  private setStatus(status: WsConnectionStatus) {
    this.status = status
    this.options.onStatusChange?.(status)
  }
}
