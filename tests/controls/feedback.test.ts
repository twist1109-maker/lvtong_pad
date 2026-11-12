import test from 'node:test'
import assert from 'node:assert/strict'
import { DeviceSwitchFeedback } from '../../src/utils/deviceSwitchFeedback.ts'

function setup() {
  const model = new DeviceSwitchFeedback({ gate: false, redlight: false })
  model.feedback({ gate: false }, { receivedAt: 100, fresh: true }, 0)
  const token = model.begin('gate', true, 0)
  return { model, token }
}

test('设备到位超过1秒时继续显示目标，新反馈确认后不经过旧状态', () => {
  const { model, token } = setup()
  model.sent('gate', token, 100)
  model.feedback({ gate: false }, { receivedAt: 110, fresh: true }, 1200)
  model.advance(2000)
  assert.equal(model.display().gate, true)
  assert.ok(model.pending.gate)
  model.feedback({ gate: true }, { receivedAt: 120, fresh: true }, 2500)
  model.advance(2750)
  assert.equal(model.display().gate, true)
  assert.equal(model.pending.gate, undefined)
})

test('迟到HTTP及无时间戳的本机记忆值不能覆盖较新WS', () => {
  const { model, token } = setup()
  model.sent('gate', token, 100)
  model.feedback({ gate: true }, { receivedAt: 200, fresh: true }, 400)
  model.advance(1000)
  assert.equal(model.feedback({ gate: false }, { receivedAt: 150, fresh: true }, 1200), false)
  assert.equal(model.feedback({ gate: false }, {}, 1300), false)
  assert.equal(model.display().gate, true)
})

test('HTTP请求慢于1秒时不会提前回退，HTTP成功也不会充当设备反馈', () => {
  const { model, token } = setup()
  model.advance(2000)
  assert.equal(model.display().gate, true)
  assert.ok(model.pending.gate)
  model.sent('gate', token, 2200)
  model.advance(7199)
  assert.ok(model.pending.gate)
  model.advance(7200)
  assert.equal(model.display().gate, false)
  assert.match(model.messages.gate!, /未收到目标状态/)
})

test('短暂目标反馈后又回旧值不会提前确认，需目标稳定250毫秒', () => {
  const { model, token } = setup()
  model.sent('gate', token, 100)
  model.feedback({ gate: true }, { receivedAt: 120, fresh: true }, 900)
  model.feedback({ gate: false }, { receivedAt: 130, fresh: true }, 1000)
  model.advance(1200)
  assert.ok(model.pending.gate)
  model.feedback({ gate: true }, { receivedAt: 140, fresh: true }, 1400)
  model.advance(1649)
  assert.ok(model.pending.gate)
  model.advance(1650)
  assert.equal(model.pending.gate, undefined)
  assert.equal(model.display().gate, true)
})

test('相同缓存反复回放不能确认新指令，过期反馈也不能确认', () => {
  const model = new DeviceSwitchFeedback({ gate: false })
  model.feedback({ gate: true }, { receivedAt: 100, fresh: true }, 0)
  const token = model.begin('gate', true, 100)
  model.sent('gate', token, 200)
  model.feedback({ gate: true }, { receivedAt: 100, fresh: true }, 1200)
  assert.ok(model.pending.gate)
  model.feedback({ gate: true }, { receivedAt: 200, fresh: false }, 1300)
  model.advance(1600)
  assert.ok(model.pending.gate)
})

test('发送失败立即恢复实态；旧请求结果不能影响后续操作', () => {
  const { model, token } = setup()
  model.fail('gate', token)
  assert.equal(model.display().gate, false)
  const next = model.begin('gate', false, 200)
  model.sent('gate', token, 300)
  model.fail('gate', token)
  assert.equal(model.pending.gate!.token, next)
})

test('稳定确认后仍接受设备后续真实变化，各开关独立等待', () => {
  const { model, token } = setup()
  const red = model.begin('redlight', true, 0)
  model.sent('gate', token, 0); model.sent('redlight', red, 0)
  model.feedback({ gate: true, redlight: false }, { receivedAt: 110, fresh: true }, 300)
  model.advance(1000)
  assert.equal(model.pending.gate, undefined)
  assert.ok(model.pending.redlight)
  model.feedback({ gate: false }, { receivedAt: 120, fresh: true }, 1500)
  assert.equal(model.display().gate, false)
})
