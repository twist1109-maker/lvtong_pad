export const appConfig = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api',
  wsUrl: import.meta.env.VITE_WS_URL ?? '/socket.io',
  useMock: import.meta.env.VITE_USE_MOCK === 'true',
  enableScreenScale: import.meta.env.VITE_ENABLE_SCREEN_SCALE === 'true',
  wsReconnectMaxRetries: Number(import.meta.env.VITE_WS_MAX_RETRIES ?? 10),
  wsHeartbeatInterval: Number(import.meta.env.VITE_WS_HEARTBEAT_MS ?? 30000),
} as const
