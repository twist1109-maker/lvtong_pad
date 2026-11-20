import { aiChangeAllowed, tagAiChange, type AiGroup } from './aiDraftPolicy.ts'
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
export interface DraftChange { path: string[]; value: unknown; origin?: 'ai'; aiGroup?: AiGroup; aiBaseRevision?: number }
export interface PendingDraft {
  sessionId: string
  revision: number
  changes: DraftChange[]
  bases: DraftChange[]
}
export interface DraftOutbox {
  load: () => Promise<PendingDraft | null>
  save: (value: PendingDraft | null) => Promise<void>
}
const objectFields = new Set(['form', 'captureThumbs', 'licensePaths', 'captureLists', 'bookingDraft', 'panelImages', 'submissionDraft', 'aiMarks', 'manualFields', 'manualPhotos', 'aiContext'])
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
  private savingAiOnly = false
  private cancelOptionalSave?: () => void
  private loading: Promise<void> | null = null
  private timer?: ReturnType<typeof setTimeout>
  private recoveryTimer?: ReturnType<typeof setTimeout>
  private pollTimer?: ReturnType<typeof setTimeout>
  private failures = 0
  private closed = false
  private outboxLoaded = false
  private outboxLoading: Promise<void> | null = null
  private restoredDraft: PendingDraft | null = null
  private persisting: Promise<void> | null = null
  private persistRequested = false
  private persistenceError = false
  private options: {
    read: () => Draft
    apply: (snapshot: SessionSnapshot, draft: Draft, changedSession: boolean) => void
    load: () => Promise<SessionSnapshot>
    save: (snapshot: SessionSnapshot, changes: DraftChange[]) => Promise<SessionSnapshot>
    status: (message: string, error: boolean) => void
    pollIntervalMs?: number
    retryDelayMs?: number
    outbox?: DraftOutbox
  }
  constructor(options: InspectionSessionSync['options']) { this.options = options }

  private async loadOutbox() {
    if (this.outboxLoaded) return
    if (!this.outboxLoading) this.outboxLoading = (async () => {
      try { this.restoredDraft = await this.options.outbox?.load() ?? null }
      catch { this.persistenceError = true }
      finally { this.outboxLoaded = true }
    })()
    await this.outboxLoading
  }
  private persist(): Promise<void> {
    if (!this.options.outbox || !this.outboxLoaded) return Promise.resolve()
    this.persistRequested = true
    if (this.persisting) return this.persisting
    this.persisting = (async () => {
      while (this.persistRequested) {
        this.persistRequested = false
        const pending: PendingDraft | null = this.pending.size && this.snapshot ? {
          sessionId: this.snapshot.sessionId, revision: this.pendingRevision ?? this.snapshot.revision,
          changes: clone([...this.pending.values()]),
          bases: [...this.pending].map(([key, change]) => ({ path: change.path, value: clone(this.pendingBases.get(key)) })),
        } : null
        try {
          // blob地址刷新后失效，先把照片内容持久化；串行合并快速输入，旧写入不能覆盖ACK后的清理。
          if (pending) {
            pending.changes = await materializeDraftImages(pending.changes)
            pending.bases = await materializeDraftImages(pending.bases)
          }
          await this.options.outbox!.save(pending)
          this.persistenceError = false
        } catch {
          this.persistenceError = true
          if (this.pending.size && !this.closed) this.options.status('未同步：本机暂存失败，请保持页面打开等待上传', true)
        }
      }
    })().finally(() => { this.persisting = null })
    return this.persisting
  }

  async restore(): Promise<void> {
    if (this.closed) return
    if (this.loading) return this.loading
    const job = (async () => {
      try {
        await this.loadOutbox()
        const incoming = await this.options.load()
        if (this.closed) return
        const latest = this.snapshot && incoming.revision < this.snapshot.revision ? this.snapshot : incoming
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
    if ((this.snapshot && snapshot.sessionId !== this.snapshot.sessionId) || snapshot.phase === 'submitted') return
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
    if (this.closed || this.timer) return
    // 持续WS更新或连续输入不能不断推迟发送；从首次改动起最多合并350ms。
    this.timer = setTimeout(() => { this.timer = undefined; void this.flush().catch(() => {}) }, 350)
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
    const backup = this.persistenceError ? '；本机暂存不可用，请保持页面打开' : ''
    this.options.status(`未同步：${error instanceof Error ? error.message : '连接失败'}，正在自动重试${backup}`, true)
    if (this.closed || this.recoveryTimer || status === 401 || status === 403) return
    const delay = Math.min((this.options.retryDelayMs ?? 1000) * 2 ** this.failures++, 10000)
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = undefined
      void this.restore().then(() => this.flush()).catch(() => {})
    }, delay)
  }
  receive(snapshot: SessionSnapshot) {
    if (this.closed || !snapshot?.sessionId || !Number.isFinite(snapshot.revision)) return
    if (!this.outboxLoaded && this.options.outbox) {
      void this.loadOutbox().then(() => this.receive(snapshot))
      return
    }
    this.outboxLoaded = true
    if (this.snapshot && snapshot.revision < this.snapshot.revision) return
    const changed = !!this.snapshot && snapshot.sessionId !== this.snapshot.sessionId
    if (this.restoredDraft) {
      const stored = this.restoredDraft
      this.restoredDraft = null
      if (stored.sessionId === snapshot.sessionId && snapshot.phase !== 'submitted') {
        this.pending = new Map(stored.changes.map(c => [c.path.join('.'), c]))
        this.pendingBases = new Map(stored.bases.map(c => [c.path.join('.'), c.value]))
        this.pendingRevision = stored.revision
      }
    }
    if (changed || snapshot.phase === 'submitted') {
      this.pending.clear(); this.pendingBases.clear(); this.pendingRevision = null
      clearTimeout(this.timer)
      this.timer = undefined
    }
    // 上传中保持请求的原始基线，避免把同一照片的blob和服务端URL合并为两张。
    // 空闲时直接采用已收到的新版本，减少自动采集/另一终端编辑造成的409。
    if (!this.saving) this.rebase(snapshot)
    this.snapshot = clone(snapshot)
    for (const [key, change] of this.pending) {
      if (!aiChangeAllowed(change, snapshot.draft || {})) { this.pending.delete(key); this.pendingBases.delete(key) }
    }
    this.ready = true
    this.applying = true
    try {
      this.options.apply(snapshot, overlay(snapshot.draft || {}, this.pending.values()), changed)
      this.observed = clone(this.options.read())
    } finally { this.applying = false }
    void this.persist()
    if (!this.pending.size) { this.recovered(); this.options.status('已同步', false) }
    else {
      this.options.status('正在同步…', false)
      if (!this.saving) this.scheduleSave()
    }
  }
  changed() {
    if (!this.ready || this.applying || this.closed) return
    const next = this.options.read()
    for (const change of diffDraft(this.observed, next)) {
      if (!this.pending.size) this.pendingRevision = this.snapshot?.revision ?? null
      const key = change.path.join('.')
      if (!this.pending.has(key)) this.pendingBases.set(key, clone(valueAt(this.observed, change.path)))
      this.pending.set(key, tagAiChange(change, next, this.snapshot?.revision ?? 0))
    }
    this.observed = clone(next)
    if (!this.pending.size) return
    void this.persist()
    this.options.status(this.persistenceError ? '未同步：本机暂存失败，请保持页面打开等待上传' : '正在同步…', this.persistenceError)
    this.scheduleSave()
  }
  async flush(): Promise<void> {
    clearTimeout(this.timer)
    this.timer = undefined
    if (this.saving) { await this.saving; if (this.pending.size && !this.closed) return this.flush(); return }
    if (!this.pending.size || !this.snapshot || this.closed) return
    const job = this.savePending()
    this.saving = job
    try { await job } finally { this.saving = null }
  }
  /** AI保存失败不能阻止人工提交；保留必需的人工编辑和原有同步校验。 */
  async flushRequired(): Promise<void> {
    this.discardAi()
    // 放弃等待AI专用请求；即便它迟到，响应也不再参与本地ACK或覆盖人工草稿。
    if (this.savingAiOnly) this.cancelOptionalSave?.()
    if (this.saving && this.savingAiOnly && !this.pending.size) return
    if (this.saving) { try { await this.saving } catch { /* 下方只重试人工编辑 */ } }
    this.discardAi()
    await this.flush()
  }
  private discardAi() {
    for (const [key, change] of this.pending) if (change.origin === 'ai') {
      this.pending.delete(key); this.pendingBases.delete(key)
    }
    void this.persist()
  }
  private async savePending() {
    let conflicts = 0
    while (this.pending.size && this.snapshot && !this.closed) {
      const snapshot = clone(this.snapshot)
      snapshot.revision = this.pendingRevision ?? snapshot.revision
      const changes = clone([...this.pending.values()])
      this.savingAiOnly = changes.every(change => change.origin === 'ai')
      const cancelled = Symbol('optional AI save cancelled')
      try {
        // 本机落盘与网络并行，浏览器存储变慢不能阻塞已经可以发送的编辑。
        void this.persist()
        if (this.closed || this.snapshot?.sessionId !== snapshot.sessionId) continue
        const optionalCancellation = new Promise<never>((_, reject) => {
          this.cancelOptionalSave = this.savingAiOnly ? () => reject(cancelled) : undefined
        })
        const result = await Promise.race([this.options.save(snapshot, changes), optionalCancellation])
        if (this.closed) return
        if (this.snapshot?.sessionId !== snapshot.sessionId) continue
        for (const change of changes) {
          const key = change.path.join('.')
          if (same(this.pending.get(key), change)) {
            this.pending.delete(key); this.pendingBases.delete(key)
          } else if (this.pending.has(key)) {
            const pending = this.pending.get(key)!
            const remote = valueAt(result.draft, change.path)
            // 请求期间继续拍照/删除：以已确认的共享URL为底，只重放请求之后的增删。
            if (Array.isArray(change.value) && Array.isArray(pending.value) && Array.isArray(remote)) {
              this.pending.set(key, { path: change.path, value: mergeList(change.value, pending.value, remote) })
            }
            this.pendingBases.set(key, clone(remote))
          }
        }
        this.pendingRevision = this.pending.size ? result.revision : null
        this.receive(result.revision >= this.snapshot.revision ? result : this.snapshot)
        await this.persist()
        this.options.status(this.pending.size ? '正在同步…' : '已同步', false)
        this.recovered()
      } catch (e) {
        if (e === cancelled) continue
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
        await this.persist()
        if (this.closed) return
        if (this.snapshot?.sessionId !== snapshot.sessionId) continue
        this.failed(e)
        throw e
      } finally {
        this.cancelOptionalSave = undefined
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
    if (value && typeof value === 'object') return Object.fromEntries(await Promise.all(
      Object.entries(value).map(async ([key, entry]) => [key, await convert(entry)])))
    return value
  }
  return Promise.all(changes.map(async c => ({ ...c, value: await convert(c.value) })))
}
