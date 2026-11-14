import assert from 'node:assert/strict'
import test from 'node:test'
import { InspectionSessionSync, diffDraft, type Draft, type SessionSnapshot } from '../../src/services/inspectionSessionSync.ts'
const snapshot = (revision = 0): SessionSnapshot => ({ sessionId: 'one', revision, phase: 'detecting', booking: { is_detection: true }, workflow: {}, draft: { form: { plate: '鄂A12345' }, captureLists: { goods: ['pc.jpg'], evidence: [] } } })

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
  assert.deepEqual(savedRevisions, [0, 2])
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
