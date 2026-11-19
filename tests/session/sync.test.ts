import assert from 'node:assert/strict'
import test from 'node:test'
import { InspectionSessionSync, diffDraft, type Draft, type SessionSnapshot, type PendingDraft } from '../../src/services/inspectionSessionSync.ts'
import { tagAiChange } from '../../src/services/aiDraftPolicy.ts'
const snapshot = (revision = 0): SessionSnapshot => ({ sessionId: 'one', revision, phase: 'detecting', booking: { is_detection: true }, workflow: {}, draft: { form: { plate: '鄂A12345' }, captureLists: { goods: ['pc.jpg'], evidence: [] } } })

test('AI来源按字段同步，清除单项不覆盖其他字段标记', () => {
  assert.deepEqual(diffDraft({ aiMarks: { plate: '鄂A12345', truckType: '11' } },
    { aiMarks: { plate: '', truckType: '11' } }), [{ path: ['aiMarks', 'plate'], value: '' }])
})

test('已裁剪主证不能使新拍挂车证或人工拼接图被误判为可丢弃AI更新', () => {
  const draft = { aiMarks: { license: '/cropped-main.jpg' }, licensePaths: { license: '/cropped-main.jpg' },
    aiContext: { license: { source: '/cropped-main.jpg', hangSource: '/cropped-hang.jpg', stitchedSource: '/cropped-stitch.jpg', baseRevision: 2 } } }
  for (const [field, value] of [['licenseGc', '/manual-new-hang.jpg'], ['licenseStitched', '/manual-stitch.jpg']]) {
    assert.equal(tagAiChange({ path: ['licensePaths', field!], value }, draft, 3).origin, undefined)
  }
  for (const [field, value] of [['license', '/cropped-main.jpg'], ['licenseGc', '/cropped-hang.jpg'], ['licenseStitched', '/cropped-stitch.jpg']]) {
    assert.equal(tagAiChange({ path: ['licensePaths', field!], value }, draft, 3).origin, 'ai')
  }
})

test('另一端人工值优先于未确认AI结果，冲突重试不能复活AI值', async t => {
  let draft: Draft = {}, saved = 0
  const sync = new InspectionSessionSync({ read: () => draft, apply: (_s, d) => { draft = d }, load: async () => ({ ...snapshot(), draft: { form: { truckType: '' } } }),
    save: async () => { saved++; throw new Error('不应保存被人工覆盖的AI') }, status() {}, pollIntervalMs: 0 })
  t.after(() => sync.dispose()); await sync.restore()
  draft = { form: { truckType: '11' }, aiMarks: { truckType: '11' } }; sync.changed()
  sync.receive({ ...snapshot(2), draft: { form: { truckType: '16' }, aiMarks: { truckType: '' }, manualFields: { truckType: true } } })
  await sync.flush()
  assert.equal((draft.form as Draft).truckType, '16'); assert.equal((draft.aiMarks as Draft).truckType, ''); assert.equal(saved, 0)
})

test('AI版本不能在重试时升级；提交不等待尚未完成的AI专用保存', async t => {
  const tagged = tagAiChange({ path: ['form', 'truckType'], value: '11' }, { aiMarks: { truckType: '11' }, aiContext: { truck: { baseRevision: 3 } } }, 8)
  assert.equal(tagged.aiBaseRevision, 3); assert.equal(tagAiChange(tagged, {}, 20).aiBaseRevision, 3)
  let draft: Draft = {}, release!: (s: SessionSnapshot) => void
  const sync = new InspectionSessionSync({ read: () => draft, apply: (_s, d) => { draft = d }, load: async () => ({ ...snapshot(), draft: {} }),
    save: async () => new Promise(resolve => { release = resolve }), status() {}, pollIntervalMs: 0 })
  t.after(() => sync.dispose()); await sync.restore()
  draft = { aiMarks: { weightRange: '(1-2)' } }; sync.changed()
  const inFlight = sync.flush()
  await sync.flushRequired()
  release({ ...snapshot(1), draft: {} }); await inFlight
})

test('PC snapshot restores on Pad; photos append and normalize to shared URL', async () => {
  let draft: Draft = {}, applied: SessionSnapshot | null = null
  const sync = new InspectionSessionSync({ read: () => draft, apply: (s, d) => { draft = d; applied = s },
    load: async () => snapshot(), save: async (_s, changes) => ({ ...snapshot(1), draft: { ...draft, captureLists: { goods: ['pc.jpg', '/api/images/pad.jpg'], evidence: [] } } }), status() {} })
  await sync.restore()
  assert.equal((draft.form as Draft).plate, '鄂A12345')
  draft.captureLists = { goods: ['pc.jpg', 'blob:pad'], evidence: [] }
  sync.changed()
  await sync.flush()
  assert.deepEqual((draft.captureLists as Draft).goods, ['pc.jpg', '/api/images/pad.jpg'])
  assert.equal(applied!.revision, 1)
  sync.dispose()
})

test('人工提交不会排在悬挂的AI保存后面，人工字段仍会保存', async t => {
  let draft: Draft = {}, release!: (s: SessionSnapshot) => void, saves = 0
  const sync = new InspectionSessionSync({ read: () => draft, apply: (_s, d) => { draft = d },
    load: async () => ({ ...snapshot(), draft: {} }),
    save: async (_s, changes) => {
      if (++saves === 1) return new Promise(resolve => { release = resolve })
      assert.equal(changes.some(c => c.origin === 'ai'), false)
      assert.equal(changes.find(c => c.path.join('.') === 'form.phone')?.value, '13800000000')
      return { ...snapshot(2), draft: { form: { phone: '13800000000' } } }
    }, status() {}, pollIntervalMs: 0 })
  t.after(() => sync.dispose()); await sync.restore()
  draft = { aiMarks: { weightRange: '(1-2)' } }; sync.changed()
  const aiSaving = sync.flush()
  draft.form = { phone: '13800000000' }; sync.changed()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([sync.flushRequired(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('人工保存被AI请求阻塞')), 300) })])
    assert.equal(saves, 2)
  } finally {
    clearTimeout(timer)
    release({ ...snapshot(1), draft: { aiMarks: { weightRange: '(1-2)' } } })
    await aiSaving
  }
  assert.equal((draft.form as Draft).phone, '13800000000')
})

test('live snapshot does not overwrite typing awaiting ACK', async () => {
  let draft: Draft = {}
  const sync = new InspectionSessionSync({ read: () => draft, apply: (_s, d) => { draft = d }, load: async () => snapshot(), save: async () => snapshot(2), status() {} })
  await sync.restore()
  draft.form = { plate: '鄂B12345' }
  sync.changed()
  sync.receive({ ...snapshot(1), workflow: { gateReleased: true } })
  assert.equal((draft.form as Draft).plate, '鄂B12345')
  sync.dispose()
})

test('reset changes session, clears pending edits and rejects old snapshot', async () => {
  let draft: Draft = {}
  const sync = new InspectionSessionSync({ read: () => draft, apply: (_s, d) => { draft = d }, load: async () => snapshot(), save: async () => snapshot(), status() {} })
  await sync.restore()
  draft.submitRemark = '旧车'
  sync.changed()
  sync.receive({ ...snapshot(5), sessionId: 'two', phase: 'idle', draft: {} })
  sync.receive(snapshot(4))
  assert.deepEqual(draft, {})
  assert.equal(sync.snapshot!.sessionId, 'two')
  sync.dispose()
})

test('diff sends only changed fields and keeps list additions', () => {
  const changes = diffDraft(snapshot().draft, { form: { plate: '鄂B12345' }, captureLists: { goods: ['pc.jpg', 'pad.jpg'], evidence: [] } })
  assert.deepEqual(changes.map(c => c.path), [['form', 'plate'], ['captureLists', 'goods']])
})

test('same-field conflict automatically rebases and saves pending local input', async () => {
  let draft: Draft = {}
  const savedRevisions: number[] = []
  const sync = new InspectionSessionSync({ read: () => draft, apply: (_s, d) => { draft = d }, load: async () => snapshot(),
    save: async (s) => {
      savedRevisions.push(s.revision)
      if (s.revision < 2) throw Object.assign(new Error('字段冲突'), { status: 409, data: { ...snapshot(2), draft: { form: { plate: '鄂C12345' } } } })
      return { ...snapshot(3), draft: { ...draft } }
    }, status() {} })
  await sync.restore()
  draft.form = { plate: '鄂B12345' }; sync.changed()
  sync.receive({ ...snapshot(1), draft: { form: { plate: '鄂C12345' } } })
  await sync.flush()
  assert.deepEqual(savedRevisions, [1, 2])
  assert.equal((draft.form as Draft).plate, '鄂B12345')
  sync.dispose()
})

async function waitFor(check: () => boolean) {
  const until = Date.now() + 2000
  while (!check()) {
    if (Date.now() > until) throw new Error('automatic sync timed out')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

test('manual retry loads newest revision instead of repeating stale conflict forever', async t => {
  let draft: Draft = {}, server = snapshot(), savedRevision = -1
  const sync = new InspectionSessionSync({ read: () => draft, apply: (_s, d) => { draft = d }, load: async () => server,
    save: async s => { savedRevision = s.revision; return { ...server, revision: 3, draft: { ...draft } } }, status() {} })
  t.after(() => sync.dispose())
  await sync.restore(); draft.submitRemark = '保留人工录入'; sync.changed()
  server = { ...snapshot(2), draft: { ...snapshot().draft, form: { plate: '鄂C12345' } } }
  await sync.restore(); await sync.flush()
  assert.equal(savedRevision, 2)
  assert.equal(draft.submitRemark, '保留人工录入')
  assert.equal((draft.form as Draft).plate, '鄂C12345')
})

test('network failure retries automatically and keeps unsent local photos', async t => {
  let draft: Draft = {}, attempts = 0, last = ''
  const sync = new InspectionSessionSync({ read: () => draft, apply: (_s, d) => { draft = d }, load: async () => snapshot(),
    save: async () => {
      if (++attempts === 1) throw new Error('断网')
      return { ...snapshot(1), draft: { ...draft, captureLists: { goods: ['pc.jpg', '/api/images/new.jpg'], evidence: [] } } }
    }, status: message => { last = message }, retryDelayMs: 10, pollIntervalMs: 0 })
  t.after(() => sync.dispose())
  await sync.restore(); draft.captureLists = { goods: ['pc.jpg', 'blob:new'], evidence: [] }; sync.changed()
  await assert.rejects(sync.flush(), /断网/)
  assert.deepEqual((draft.captureLists as Draft).goods, ['pc.jpg', 'blob:new'])
  await waitFor(() => last === '已同步')
  assert.equal(attempts, 2)
  assert.deepEqual((draft.captureLists as Draft).goods, ['pc.jpg', '/api/images/new.jpg'])
})

test('failed initial load recovers automatically without an edit or manual retry', async t => {
  let draft: Draft = {}, calls = 0
  const sync = new InspectionSessionSync({ read: () => draft, apply: (_s, d) => { draft = d },
    load: async () => { if (++calls === 1) throw new Error('断网'); return snapshot() }, save: async () => snapshot(), status() {}, retryDelayMs: 10, pollIntervalMs: 0 })
  t.after(() => sync.dispose())
  await assert.rejects(sync.restore(), /断网/)
  await waitFor(() => sync.ready)
  assert.equal((draft.form as Draft).plate, '鄂A12345')
})

test('poll fallback discovers remote changes when WebSocket message is missed', async t => {
  let draft: Draft = {}, server = snapshot()
  const sync = new InspectionSessionSync({ read: () => draft, apply: (_s, d) => { draft = d }, load: async () => server, save: async () => server, status() {}, pollIntervalMs: 10 })
  t.after(() => sync.dispose())
  await sync.restore()
  server = { ...snapshot(1), draft: { form: { plate: '鄂C12345' } } }
  await waitFor(() => (draft.form as Draft).plate === '鄂C12345')
})

test('simultaneous photo additions merge and local deletions keep remote new photos', async t => {
  let draft: Draft = {}, saved: unknown
  const remote = { ...snapshot(2), draft: { captureLists: { goods: ['pc.jpg', 'remote.jpg'], evidence: [] } } }
  const sync = new InspectionSessionSync({ read: () => draft, apply: (_s, d) => { draft = d }, load: async () => snapshot(),
    save: async (s, changes) => {
      if (s.revision < 2) throw Object.assign(new Error('照片冲突'), { status: 409, data: remote })
      saved = changes.find(c => c.path.join('.') === 'captureLists.goods')?.value
      return { ...remote, revision: 3, draft: { captureLists: { goods: saved, evidence: [] } } }
    }, status() {} })
  t.after(() => sync.dispose())
  await sync.restore(); draft.captureLists = { goods: ['local.jpg'], evidence: [] }; sync.changed()
  await sync.flush()
  assert.deepEqual(saved, ['remote.jpg', 'local.jpg'])
})

test('typing during an upload is saved after ACK instead of being lost', async t => {
  let draft: Draft = {}, resolve!: (s: SessionSnapshot) => void, calls = 0
  const sync = new InspectionSessionSync({ read: () => draft, apply: (_s, d) => { draft = d }, load: async () => snapshot(),
    save: async () => ++calls === 1 ? new Promise(r => { resolve = r }) : ({ ...snapshot(2), draft: { ...draft } }), status() {} })
  t.after(() => sync.dispose())
  await sync.restore(); draft.submitRemark = 'first'; sync.changed()
  const saving = sync.flush()
  draft.submitRemark = 'second'; sync.changed()
  resolve({ ...snapshot(1), draft: { ...snapshot().draft, submitRemark: 'first' } })
  await saving
  assert.equal(calls, 2); assert.equal(draft.submitRemark, 'second')
})

test('old-session upload failure cannot leave error or edits on a new vehicle', async t => {
  let draft: Draft = {}, reject!: (e: Error) => void, last = ''
  const sync = new InspectionSessionSync({ read: () => draft, apply: (_s, d) => { draft = d }, load: async () => snapshot(),
    save: async () => new Promise((_resolve, r) => { reject = r }), status: message => { last = message } })
  t.after(() => sync.dispose())
  await sync.restore(); draft.submitRemark = '上一辆车'; sync.changed()
  const saving = sync.flush()
  sync.receive({ ...snapshot(5), sessionId: 'new', phase: 'idle', draft: {} })
  reject(new Error('旧请求失败')); await saving
  assert.equal(last, '已同步'); assert.deepEqual(draft, {})
})

test('repeated conflicts use bounded immediate attempts then defer recovery', async t => {
  let draft: Draft = {}, calls = 0
  const sync = new InspectionSessionSync({ read: () => draft, apply: (_s, d) => { draft = d }, load: async () => snapshot(),
    save: async () => { calls++; throw Object.assign(new Error('持续冲突'), { status: 409, data: snapshot(calls) }) }, status() {}, retryDelayMs: 1000 })
  t.after(() => sync.dispose())
  await sync.restore(); draft.submitRemark = 'keep'; sync.changed()
  await assert.rejects(sync.flush(), /持续冲突/)
  assert.equal(calls, 3); assert.equal(draft.submitRemark, 'keep')
})

test('dispose ignores late upload results and stops recovery timers', async () => {
  let draft: Draft = {}, resolve!: (s: SessionSnapshot) => void, applies = 0
  const sync = new InspectionSessionSync({ read: () => draft, apply: (_s, d) => { draft = d; applies++ }, load: async () => snapshot(),
    save: async () => new Promise(r => { resolve = r }), status() {} })
  await sync.restore(); draft.submitRemark = 'pending'; sync.changed()
  const saving = sync.flush(); sync.dispose(); resolve(snapshot(1)); await saving
  assert.equal(applies, 1)
})

test('failed upload keeps local photos for explicit retry', async () => {
  let draft: Draft = {}, fail = true
  const statuses: string[] = []
  const sync = new InspectionSessionSync({ read: () => draft, apply: (_s, d) => { draft = d }, load: async () => snapshot(),
    save: async () => { if (fail) throw new Error('断网'); return { ...snapshot(2), draft: { ...draft } } }, status: msg => statuses.push(msg) })
  await sync.restore(); draft.submitRemark = '暂存'; sync.changed()
  await assert.rejects(sync.flush(), /断网/)
  assert.equal(draft.submitRemark, '暂存')
  fail = false; await sync.flush()
  assert.equal(statuses.at(-1), '已同步')
  sync.dispose()
})

test('live remote updates rebase queued fields before sending, without avoidable conflicts', async t => {
  let draft: Draft = {}, sent = -1
  const sync = new InspectionSessionSync({ read: () => draft, apply: (_s, d) => { draft = d }, load: async () => snapshot(),
    save: async (s) => { sent = s.revision; return { ...snapshot(3), draft } }, status() {}, pollIntervalMs: 0 })
  t.after(() => sync.dispose())
  await sync.restore(); draft.form = { plate: '人工填写' }; sync.changed()
  sync.receive({ ...snapshot(2), draft: { form: { plate: '自动识别', phone: '13800000000' } } })
  await sync.flush()
  assert.equal(sent, 2)
  assert.equal((draft.form as Draft).plate, '人工填写')
  assert.equal((draft.form as Draft).phone, '13800000000')
})

test('poll during upload and further photos do not resend an uploaded blob or duplicate canonical photo', async t => {
  let draft: Draft = {}, server = snapshot(), resolve!: (s: SessionSnapshot) => void
  const batches: unknown[][] = []
  const sync = new InspectionSessionSync({ read: () => draft, apply: (_s, d) => { draft = d }, load: async () => server,
    save: async (_s, changes) => {
      const list = changes.find(c => c.path.join('.') === 'captureLists.goods')!.value as unknown[]
      batches.push(list)
      if (batches.length === 1) return new Promise(r => { resolve = r })
      return { ...snapshot(2), draft: { captureLists: { goods: list } } }
    }, status() {}, pollIntervalMs: 0 })
  t.after(() => sync.dispose())
  await sync.restore(); draft.captureLists = { goods: ['pc.jpg', 'blob:first'] }; sync.changed()
  const saving = sync.flush()
  await waitFor(() => batches.length === 1)
  server = { ...snapshot(1), draft: { captureLists: { goods: ['pc.jpg', '/api/images/first.jpg'] } } }
  sync.receive(server); await sync.restore()
  draft.captureLists = { goods: [...(draft.captureLists as Draft).goods as string[], 'blob:second'] }; sync.changed()
  resolve(server); await saving
  assert.deepEqual(batches[1], ['pc.jpg', '/api/images/first.jpg', 'blob:second'])
})

test('refresh recovers pending fields and photos, clears outbox only after server acknowledgement', async t => {
  let stored: PendingDraft | null = null, draft: Draft = {}, server = snapshot()
  const outbox = { load: async () => stored, save: async (value: PendingDraft | null) => { stored = structuredClone(value) } }
  const first = new InspectionSessionSync({ outbox, read: () => draft, apply: (_s, d) => { draft = d },
    load: async () => server, save: async () => { throw new Error('断网') }, status() {}, pollIntervalMs: 0 })
  await first.restore(); draft.submitRemark = '刷新不丢失'; draft.captureLists = { goods: ['pc.jpg', 'data:image/png;base64,new'] }; first.changed()
  await assert.rejects(first.flush(), /断网/); first.dispose()
  assert.equal(stored!.sessionId, 'one')
  draft = {}
  const second = new InspectionSessionSync({ outbox, read: () => draft, apply: (_s, d) => { draft = d },
    load: async () => server, save: async () => (server = { ...snapshot(1), draft: structuredClone(draft) }), status() {}, pollIntervalMs: 0 })
  t.after(() => second.dispose())
  await second.restore()
  assert.equal(draft.submitRemark, '刷新不丢失')
  assert.deepEqual((draft.captureLists as Draft).goods, ['pc.jpg', 'data:image/png;base64,new'])
  await second.flush()
  assert.equal(stored, null)
})

test('a restored outbox cannot replay edits to a submitted or different vehicle', async t => {
  for (const current of [{ ...snapshot(5), sessionId: 'next' }, { ...snapshot(5), phase: 'submitted' as const }]) {
    let draft: Draft = {}, saved = 0, stored: PendingDraft | null = { sessionId: 'one', revision: 0,
      changes: [{ path: ['submitRemark'], value: '旧车' }], bases: [{ path: ['submitRemark'], value: '' }] }
    const sync = new InspectionSessionSync({ outbox: { load: async () => stored, save: async value => { stored = value } },
      read: () => draft, apply: (_s, d) => { draft = d }, load: async () => current,
      save: async () => { saved++; return current }, status() {}, pollIntervalMs: 0 })
    t.after(() => sync.dispose())
    await sync.restore(); await sync.flush()
    await waitFor(() => stored === null)
    assert.equal(saved, 0); assert.equal(draft.submitRemark, undefined)
  }
})

test('pending outbox writes cannot resurrect acknowledged edits after a slow disk write', async t => {
  let draft: Draft = {}, stored: PendingDraft | null = null, writes = 0, release!: () => void
  const sync = new InspectionSessionSync({ outbox: { load: async () => null, save: async value => {
    if (value && ++writes === 1) await new Promise<void>(r => { release = r })
    stored = structuredClone(value)
  } }, read: () => draft, apply: (_s, d) => { draft = d }, load: async () => snapshot(),
    save: async () => ({ ...snapshot(1), draft: structuredClone(draft) }), status() {}, pollIntervalMs: 0 })
  t.after(() => sync.dispose())
  await sync.restore(); draft.submitRemark = 'first'; sync.changed()
  await waitFor(() => !!release)
  draft.submitRemark = 'second'; sync.changed()
  const saving = sync.flush(); release(); await saving
  assert.equal(draft.submitRemark, 'second'); assert.equal(stored, null)
})

test('continuous remote broadcasts cannot keep postponing queued field changes', async t => {
  let draft: Draft = {}, saves = 0
  const sync = new InspectionSessionSync({ read: () => draft, apply: (_s, d) => { draft = d }, load: async () => snapshot(),
    save: async s => { saves++; return { ...snapshot(s.revision + 1), draft: structuredClone(draft) } }, status() {}, pollIntervalMs: 0 })
  t.after(() => sync.dispose())
  await sync.restore(); draft.submitRemark = '连续采集时也能填写'; sync.changed()
  for (let i = 1; i <= 8; i++) {
    await new Promise(resolve => setTimeout(resolve, 60))
    sync.receive({ ...snapshot(i), draft: snapshot().draft })
  }
  assert.equal(saves, 1, 'WS broadcasts must not postpone the 350ms save window')
})
