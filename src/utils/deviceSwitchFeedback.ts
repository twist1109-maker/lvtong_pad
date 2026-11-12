/** 将设备反馈、操作目标分开保存；HTTP/WS共用后端receivedAt排序。 */
export class DeviceSwitchFeedback {
  states: Record<string, boolean>
  pending: Record<string, { target: boolean; token: number; baseline: number; minUntil: number; deadline: number; sent: boolean; matchSince: number | null }> = {}
  messages: Record<string, string> = {}
  private receivedAt = 0
  private revision = 0
  private token = 0
  private holdMs: number
  private waitMs: number
  private settleMs: number
  constructor(initial: Record<string, boolean>, holdMs = 1000, waitMs = 5000, settleMs = 250) {
    this.states = { ...initial }
    this.holdMs = holdMs; this.waitMs = waitMs; this.settleMs = settleMs
  }

  feedback(values: Record<string, boolean>, meta: Record<string, unknown>, now: number): boolean {
    const stamp = Number(meta.receivedAt) || 0
    if (this.receivedAt && (!stamp || stamp < this.receivedAt)) return false
    const newer = !stamp || stamp > this.receivedAt
    this.receivedAt = Math.max(this.receivedAt, stamp)
    if (newer) {
      this.revision++
      this.states = { ...this.states, ...values }
    }
    if (meta.fresh === false) {
      for (const entry of Object.values(this.pending)) entry.matchSince = null
      return true // 允许更新离线提示，过期数据不能确认动作。
    }
    if (newer) {
      for (const key of Object.keys(values)) delete this.messages[key]
      for (const [key, entry] of Object.entries(this.pending)) {
        if (entry.baseline < this.revision && key in values && values[key] === entry.target) {
          entry.matchSince ??= now
        } else if (key in values) entry.matchSince = null
      }
    }
    this.advance(now)
    return true
  }

  begin(key: string, target: boolean, now: number): number {
    const token = ++this.token
    this.pending[key] = { target, token, baseline: this.revision, minUntil: now + this.holdMs, deadline: Infinity, sent: false, matchSince: null }
    delete this.messages[key]
    return token
  }

  sent(key: string, token: number, now: number) {
    const entry = this.pending[key]
    if (!entry || entry.token !== token) return
    entry.sent = true
    entry.deadline = now + this.waitMs
    this.advance(now)
  }

  fail(key: string, token: number) {
    if (this.pending[key]?.token === token) delete this.pending[key]
  }

  advance(now: number) {
    for (const [key, entry] of Object.entries(this.pending)) {
      if (!entry.sent) continue
      if (entry.matchSince !== null && now >= Math.max(entry.minUntil, entry.matchSince + this.settleMs)) {
        delete this.pending[key]
      } else if (now >= entry.deadline) {
        delete this.pending[key]
        this.messages[key] = '指令已发送，未收到目标状态，已恢复显示设备反馈'
      }
    }
  }

  nextWake(): number {
    return Math.min(Infinity, ...Object.values(this.pending).filter(entry => entry.sent).map(entry =>
      entry.matchSince === null ? entry.deadline : Math.min(entry.deadline, Math.max(entry.minUntil, entry.matchSince + this.settleMs))))
  }

  display(): Record<string, boolean> {
    return { ...this.states, ...Object.fromEntries(Object.entries(this.pending).map(([key, entry]) => [key, entry.target])) }
  }
}
