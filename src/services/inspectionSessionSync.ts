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
  private pendingRevision: number | null = null
  private saving: Promise<void> | null = null
  private timer?: ReturnType<typeof setTimeout>
  private closed = false
  private options: {
    read: () => Draft
    apply: (snapshot: SessionSnapshot, draft: Draft, changedSession: boolean) => void
    load: () => Promise<SessionSnapshot>
    save: (snapshot: SessionSnapshot, changes: DraftChange[]) => Promise<SessionSnapshot>
    status: (message: string, error: boolean) => void
  }
  constructor(options: InspectionSessionSync['options']) { this.options = options }

  async restore() {
    try {
      this.receive(await this.options.load())
      this.options.status(this.pending.size ? '有内容待同步' : '已同步', false)
    } catch (e) { this.options.status(e instanceof Error ? e.message : '同步失败', true); throw e }
  }
  receive(snapshot: SessionSnapshot) {
    if (this.closed || !snapshot?.sessionId || !Number.isFinite(snapshot.revision)) return
    if (this.snapshot && snapshot.revision < this.snapshot.revision) return
    const changed = !!this.snapshot && snapshot.sessionId !== this.snapshot.sessionId
    if (changed || snapshot.phase === 'submitted') { this.pending.clear(); this.pendingRevision = null }
    this.snapshot = clone(snapshot)
    this.ready = true
    this.applying = true
    try {
      this.options.apply(snapshot, overlay(snapshot.draft || {}, this.pending.values()), changed)
      this.observed = clone(this.options.read())
    } finally { this.applying = false }
  }
  changed() {
    if (!this.ready || this.applying || this.closed) return
    const next = this.options.read()
    for (const change of diffDraft(this.observed, next)) {
      if (!this.pending.size) this.pendingRevision = this.snapshot?.revision ?? null
      this.pending.set(change.path.join('.'), change)
    }
    this.observed = clone(next)
    if (!this.pending.size) return
    this.options.status('正在同步…', false)
    clearTimeout(this.timer)
    this.timer = setTimeout(() => { void this.flush().catch(() => {}) }, 350)
  }
  async flush(): Promise<void> {
    clearTimeout(this.timer)
    if (this.saving) { await this.saving; if (this.pending.size) return this.flush(); return }
    if (!this.pending.size || !this.snapshot || this.closed) return
    const snapshot = clone(this.snapshot)
    snapshot.revision = this.pendingRevision ?? snapshot.revision
    const changes = clone([...this.pending.values()])
    this.saving = (async () => {
      try {
        const result = await this.options.save(snapshot, changes)
        if (this.snapshot?.sessionId !== snapshot.sessionId) return
        for (const change of changes) {
          const key = change.path.join('.')
          if (same(this.pending.get(key), change)) this.pending.delete(key)
        }
        this.pendingRevision = this.pending.size ? result.revision : null
        this.receive(result.revision >= this.snapshot.revision ? result : this.snapshot)
        this.options.status(this.pending.size ? '正在同步…' : '已同步', false)
      } catch (e) {
        const conflict = e as { status?: number; data?: SessionSnapshot }
        if (conflict.status === 409 && conflict.data?.sessionId !== this.snapshot?.sessionId && conflict.data?.sessionId) this.receive(conflict.data)
        this.options.status(e instanceof Error ? `未同步：${e.message}` : '未同步，请重试', true)
        throw e
      }
    })()
    try { await this.saving } finally { this.saving = null }
    if (this.pending.size) return this.flush()
  }
  dispose() { this.closed = true; clearTimeout(this.timer) }
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
