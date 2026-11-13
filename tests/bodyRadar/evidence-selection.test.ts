import test from 'node:test'
import assert from 'node:assert/strict'
import { evidenceCandidates, appendEvidence } from '../../src/utils/evidenceSelection.ts'

test('全部已有图片合并同一来源，标识已添加证据', () => {
  const items = evidenceCandidates([
    { label: '车头', src: 'head' }, { label: '货物照1', src: 'goods' },
    { label: '证据照1', src: 'head' }, { label: '透视', src: 'xray' },
    { label: '空', src: '' },
  ], ['head'])
  assert.deepEqual(items.map(item => [item.label, item.alreadyAdded]), [['车头 / 证据照1', true], ['货物照1', false], ['透视', false]])
})

test('追加保留原证据顺序和已有重复，不用新选择覆盖；选择自身不重复添加', () => {
  const existing = ['old', 'old']
  const result = appendEvidence(existing, [
    { source: 'old', src: 'old' }, { source: 'new', src: 'new' },
    { source: 'new', src: 'new' }, { source: '', src: '' },
  ], new Set())
  assert.deepEqual(existing, ['old', 'old'])
  assert.deepEqual(result.images, ['old', 'old', 'new'])
})

test('临时图片固化为独立数据后，再选同一来源不会重复加入', () => {
  const sources = new Set<string>()
  const first = appendEvidence([], [{ source: '/api/temp-images/one', src: 'data:image/png;base64,snapshot' }], sources)
  first.sources.forEach(src => sources.add(src))
  const second = appendEvidence(first.images, [{ source: '/api/temp-images/one', src: 'data:image/png;base64,later' }], sources)
  assert.deepEqual(second.images, ['data:image/png;base64,snapshot'])
  assert.deepEqual(second.sources, [])
})
