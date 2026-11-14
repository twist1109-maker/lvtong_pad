export type Draft = Record<string, unknown>
export interface SessionSnapshot {
  sessionId: string
  revision: number
  phase: 'idle' | 'booking' | 'detecting' | 'submitted'
  booking: Record<string, unknown>
  workflow: { step?: number; message?: string; gateReleased?: boolean; laneOccupied?: boolean }
  draft: Draft
  images?: Record<string, Record<string, string>>
  geometryUrl?: string
  submittedId?: number | null
  activeClientId?: string
  geometryCapture?: unknown
}
export interface DraftChange { path: string[]; value: unknown }
const objectFields = new Set(['form', 'captureThumbs', 'licensePaths', 'captureLists', 'bookingDraft', 'panelImages', 'submissionDraft'])
const clone = <T>(v: T): T => v == null ? v : JSON.parse(JSON.stringify(v))
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const valueAt = (draft: Draft, path: string[]) => path.reduce<unknown>((value, key) =>
  value && typeof value === 'object' ? (value as Draft)[key] : undefined, draft)
const mergeList = (base: unknown[], local: unknown[], remote: unknown[]) => {
  const removed = base.filter(value => !local.some(item => same(item, value)))
  const added = local.filter(value => !base.some(item => same(item, value)))
  return [...remote.filter(value => !removed.some(item => same(item, value))),
    ...added.filter(value => !remote.some(item => same(item, value)))]
}

export function diffDraft(before: Draft, after: Draft): DraftChange[] {
  const changes: DraftChange[] = []
  for (const [key, value] of Object.entries(after)) {
    if (objectFields.has(key)) {
      const old = (before[key] || {}) as Draft
      for (const [child, entry] of Object.entries((value || {}) as Draft)) {
        if (!same(old[child], entry)) changes.push({ path: [key, child], value: clone(entry) })
      }
    } else if (!same(before[key], value)) changes.push({ path: [key], value: clone(value) })
  }
  return changes
}

function overlay(draft: Draft, changes: Iterable<DraftChange>) {
  const result = clone(draft)
  for (const { path, value } of changes) {
    if (path.length === 1) result[path[0]!] = clone(value)
    else {
      const field = path[0]!, child = path[1]!
      result[field] = { ...((result[field] || {}) as Draft), [child]: clone(value) }
    }
  }
  return result
}

/** 不依赖页面生命周期；快照先恢复，未确认的本机编辑覆盖快照，ACK后采用共享URL。 */
export class InspectionSessionSync {
  snapshot: SessionSnapshot | null = null
  ready = false
  applying = false
  private observed: Draft = {}
  private pending = new Map<string, DraftChange>()
  private pendingBases = new Map<string, unknown>()
  private pendingRevision: number | null = null
  private saving: Promise<void> | null = null
  private loading: Promise<void> | null = null
  private timer?: ReturnType<typeof setTimeout>
  private recoveryTimer?: ReturnType<typeof setTimeout>
  private pollTimer?: ReturnType<typeof setTimeout>
  private failures = 0
  private closed = false
  private options: {
    read: () => Draft
    apply: (snapshot: SessionSnapshot, draft: Draft, changedSession: boolean) => void
    load: () => Promise<SessionSnapshot>
    save: (snapshot: SessionSnapshot, changes: DraftChange[]) => Promise<SessionSnapshot>
    status: (message: string, error: boolean) => void
    pollIntervalMs?: number
    retryDelayMs?: number
  }
  constructor(options: InspectionSessionSync['options']) { this.options = options }

  async restore(): Promise<void> {
    if (this.closed) return
    if (this.loading) return this.loading
    const job = (async () => {
      try {
        const incoming = await this.options.load()
        if (this.closed) return
        const latest = this.snapshot && incoming.revision < this.snapshot.revision ? this.snapshot : incoming
        this.rebase(latest)
        this.receive(latest)
        this.options.status(this.pending.size ? '正在同步…' : '已同步', false)
        if (this.pending.size) this.scheduleSave()
        else this.recovered()
      } catch (e) { if (!this.closed) this.failed(e); throw e }
    })()
    this.loading = job
    try { await job } finally {
      this.loading = null
      this.schedulePoll()
    }
  }
  private rebase(snapshot: SessionSnapshot) {
    if (snapshot.sessionId !== this.snapshot?.sessionId || snapshot.phase === 'submitted') return
    for (const [key, change] of this.pending) {
      const remote = valueAt(snapshot.draft, change.path), base = this.pendingBases.get(key)
      // 两端同时追加照片时保留双方新增项；删除仅作用于本机原先见过的项。
      if (Array.isArray(base) && Array.isArray(change.value) && Array.isArray(remote)) {
        this.pending.set(key, { path: change.path, value: mergeList(base, change.value, remote) })
      }
      this.pendingBases.set(key, clone(remote))
    }
    this.pendingRevision = this.pending.size ? snapshot.revision : null
  }
  private scheduleSave() {
    clearTimeout(this.timer)
    if (!this.closed) this.timer = setTimeout(() => { void this.flush().catch(() => {}) }, 350)
  }
  private schedulePoll() {
    clearTimeout(this.pollTimer)
    const interval = this.options.pollIntervalMs ?? 5000
    if (!this.closed && interval > 0) this.pollTimer = setTimeout(() => {
      void this.restore().then(() => this.flush()).catch(() => {})
    }, interval)
  }
  private recovered() {
    this.failures = 0
    clearTimeout(this.recoveryTimer)
    this.recoveryTimer = undefined
  }
  private failed(error: unknown) {
    const status = (error as { status?: number })?.status
    this.options.status(`未同步：${error instanceof Error ? error.message : '连接失败'}，正在自动重试`, true)
    if (this.closed || this.recoveryTimer || status === 401 || status === 403) return
    const delay = Math.min((this.options.retryDelayMs ?? 1000) * 2 ** this.failures++, 10000)
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = undefined
      void this.restore().then(() => this.flush()).catch(() => {})
    }, delay)
  }
  receive(snapshot: SessionSnapshot) {
    if (this.closed || !snapshot?.sessionId || !Number.isFinite(snapshot.revision)) return
    if (this.snapshot && snapshot.revision < this.snapshot.revision) return
    const changed = !!this.snapshot && snapshot.sessionId !== this.snapshot.sessionId
    if (changed || snapshot.phase === 'submitted') {
      this.pending.clear(); this.pendingBases.clear(); this.pendingRevision = null
      clearTimeout(this.timer)
    }
    this.snapshot = clone(snapshot)
    this.ready = true
    this.applying = true
    try {
      this.options.apply(snapshot, overlay(snapshot.draft || {}, this.pending.values()), changed)
      this.observed = clone(this.options.read())
    } finally { this.applying = false }
    if (!this.pending.size) { this.recovered(); this.options.status('已同步', false) }
    else if (!this.saving) this.scheduleSave()
  }
  changed() {
    if (!this.ready || this.applying || this.closed) return
    const next = this.options.read()
    for (const change of diffDraft(this.observed, next)) {
      if (!this.pending.size) this.pendingRevision = this.snapshot?.revision ?? null
      const key = change.path.join('.')
      if (!this.pending.has(key)) this.pendingBases.set(key, clone(valueAt(this.observed, change.path)))
      this.pending.set(key, change)
    }
    this.observed = clone(next)
    if (!this.pending.size) return
    this.options.status('正在同步…', false)
    this.scheduleSave()
  }
  async flush(): Promise<void> {
    clearTimeout(this.timer)
    if (this.saving) { await this.saving; if (this.pending.size && !this.closed) return this.flush(); return }
    if (!this.pending.size || !this.snapshot || this.closed) return
    const job = this.savePending()
    this.saving = job
    try { await job } finally { this.saving = null }
  }
  private async savePending() {
    let conflicts = 0
    while (this.pending.size && this.snapshot && !this.closed) {
      const snapshot = clone(this.snapshot)
      snapshot.revision = this.pendingRevision ?? snapshot.revision
      const changes = clone([...this.pending.values()])
      try {
        const result = await this.options.save(snapshot, changes)
        if (this.closed) return
        if (this.snapshot?.sessionId !== snapshot.sessionId) continue
        for (const change of changes) {
          const key = change.path.join('.')
          if (same(this.pending.get(key), change)) {
            this.pending.delete(key); this.pendingBases.delete(key)
          } else if (this.pending.has(key)) this.pendingBases.set(key, clone(change.value))
        }
        this.pendingRevision = this.pending.size ? result.revision : null
        this.receive(result.revision >= this.snapshot.revision ? result : this.snapshot)
        this.options.status(this.pending.size ? '正在同步…' : '已同步', false)
        this.recovered()
      } catch (e) {
        if (this.closed) return
        if (this.snapshot?.sessionId !== snapshot.sessionId) continue
        const conflict = e as { status?: number; data?: SessionSnapshot }
        if (conflict.status === 409 && conflicts++ < 2) {
          if (conflict.data?.sessionId) {
            const latest = conflict.data.revision >= this.snapshot.revision ? conflict.data : this.snapshot
            this.rebase(latest)
            this.receive(latest)
          } else await this.restore()
          if (!this.pending.size) { this.options.status('已同步', false); this.recovered() }
          continue
        }
        this.failed(e)
        throw e
      }
    }
  }
  dispose() {
    this.closed = true
    clearTimeout(this.timer); clearTimeout(this.recoveryTimer); clearTimeout(this.pollTimer)
  }
}

export async function materializeDraftImages(changes: DraftChange[]): Promise<DraftChange[]> {
  async function convert(value: unknown): Promise<unknown> {
    if (typeof value === 'string' && value.startsWith('blob:')) {
      const response = await fetch(value)
      if (!response.ok) throw new Error('读取本机照片失败')
      const blob = await response.blob()
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('照片上传准备失败'))
        reader.readAsDataURL(blob)
      })
    }
    if (Array.isArray(value)) return Promise.all(value.map(convert))
    return value
  }
  return Promise.all(changes.map(async c => ({ ...c, value: await convert(c.value) })))
}
