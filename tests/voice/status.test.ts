import assert from 'node:assert/strict'
import test from 'node:test'
import { parsePlcVoiceStatus, voiceStatusText } from '../../src/utils/plcVoiceStatus.ts'

test('前后播放反馈互不影响，开始和结束都能更新', () => {
  for (const front of [false, true]) {
    for (const back of [false, true]) {
      assert.deepEqual(parsePlcVoiceStatus({ frontVoiceAnnounceStatus: front, backVoiceAnnounceStatus: back }), { front, back })
    }
  }
  assert.equal(voiceStatusText(true), '播报中')
  assert.equal(voiceStatusText(false), '未播报')
})

test('没有反馈或非法字段不能显示成未播报，声音报警也不是语音反馈', () => {
  for (const value of [undefined, null, '', 'false', 2, {}, []]) {
    assert.deepEqual(parsePlcVoiceStatus({ soundalarmCmd: true, frontVoiceAnnounceStatus: value }), { front: null, back: null })
  }
  assert.equal(voiceStatusText(null), '待反馈')
})

test('兼容中间件布尔值与数字状态', () => {
  assert.deepEqual(parsePlcVoiceStatus({ frontVoiceAnnounceStatus: '1', backVoiceAnnounceStatus: 0 }), { front: true, back: false })
})
