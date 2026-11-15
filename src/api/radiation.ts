import { request } from '@/api/request'

export interface RadiationState {
  runId: string
  revision: number
  active: boolean
  phase: 'idle' | 'measuring' | 'stopping' | 'completed' | 'cancelled' | 'failed'
  startedAt: number | null
  finishedAt: number | null
  samples: { time: number; value: number }[]
  error: string
  result: { value: number; level: 'normal' | 'high' } | null
  stopAttempts: number
  bothSourcesOn: boolean
  bothSourcesOff: boolean
  elapsedSeconds: number
  durationSeconds: number
  threshold: number
  unit: string
  latest: { value: number; receivedAt: number } | null
  sources: boolean[] | null
}

export function getRadiationApi() {
  return request<RadiationState>('/device/radiation-detection', { timeout: 3000 })
}

export function startRadiationApi() {
  return request<RadiationState>('/device/radiation-detection', {
    method: 'POST', body: JSON.stringify({ action: 'start', confirmed: true }), timeout: 4000,
  })
}

export function stopRadiationApi(runId: string) {
  return request<RadiationState>('/device/radiation-detection', {
    method: 'POST', body: JSON.stringify({ action: 'stop', runId }), timeout: 3000,
  })
}
