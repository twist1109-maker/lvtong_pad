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

test('remote same-field update does not silently advance pending edit base revision', async () => {
  let draft: Draft = {}, savedRevision = -1
  const sync = new InspectionSessionSync({ read: () => draft, apply: (_s, d) => { draft = d }, load: async () => snapshot(),
    save: async (s) => { savedRevision = s.revision; throw Object.assign(new Error('字段冲突'), { status: 409, data: snapshot(2) }) }, status() {} })
  await sync.restore()
  draft.form = { plate: '鄂B12345' }; sync.changed()
  sync.receive({ ...snapshot(1), draft: { form: { plate: '鄂C12345' } } })
  await assert.rejects(sync.flush(), /字段冲突/)
  assert.equal(savedRevision, 0)
  assert.equal((draft.form as Draft).plate, '鄂B12345')
  sync.dispose()
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
