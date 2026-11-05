/** 中间件 ST_FRONT/BACK_VOICE_ANNOUNCE：未反馈与未播报必须区分。 */
export type PlcVoiceStatus = { front: boolean | null; back: boolean | null }

function statusBit(value: unknown): boolean | null {
  if (value === true || value === 1 || value === '1') return true
  if (value === false || value === 0 || value === '0') return false
  return null
}

export function parsePlcVoiceStatus(data: Record<string, unknown>): PlcVoiceStatus {
  return {
    front: statusBit(data.frontVoiceAnnounceStatus),
    back: statusBit(data.backVoiceAnnounceStatus),
  }
}

export function voiceStatusText(value: boolean | null): string {
  return value === null ? '待反馈' : value ? '播报中' : '未播报'
}
