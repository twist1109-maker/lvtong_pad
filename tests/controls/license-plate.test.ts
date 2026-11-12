import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizePlate, plateFormatError, plateColorStyle } from '../../src/utils/licensePlate.ts'

test('普通、新能源、挂车及常见特殊尾缀通过粗略检查', () => {
  for (const plate of ['鄂ACA3532', '云AC0403', '豫GH7159', '鄂MD02173', '粤A12345D', '鄂A1234挂', '鄂A1234学', '鄂A1234警', '粤Z1234港', '鄂X1234应急']) {
    assert.equal(plateFormatError(plate), '', plate)
  }
})
test('阻止错位省份、无效第二位、非法字符及错误长度', () => {
  for (const plate of ['', 'AA12345', '鄂鄂12345', '鄂I12345', '鄂O12345', '鄂A12I45', '鄂A1234', '鄂A123456789', '渝DRRGG44', '鄂A12-45', '鄂A挂1234']) {
    assert.notEqual(plateFormatError(plate), '', plate)
  }
})
test('物理键盘和粘贴的小写、全角、空白规范化后保存', () => {
  assert.equal(normalizePlate('  鄂ａ １２３４５\n'), '鄂A12345')
  assert.equal(plateFormatError('  鄂ａ １２３４５\n'), '')
})
test('数字颜色与中文颜色一致，未选颜色保持默认底色', () => {
  assert.deepEqual(plateColorStyle('1'), { background: '#f1c40f', color: '#2c3e50' })
  assert.deepEqual(plateColorStyle('渐变绿色'), plateColorStyle('4'))
  assert.deepEqual(plateColorStyle('黄绿双拼色'), plateColorStyle('5'))
  assert.deepEqual(plateColorStyle('蓝色'), plateColorStyle('0'))
  assert.deepEqual(plateColorStyle(''), {})
})
