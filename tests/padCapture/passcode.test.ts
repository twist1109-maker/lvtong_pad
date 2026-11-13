import test from 'node:test'
import assert from 'node:assert/strict'
import { parsePasscode } from '../../src/modules/padCapture/passcode.ts'
import { formatPasscodeAmount } from '../../src/modules/history/utils/passCodeDisplay.ts'

const fields = ['鄂A12345_1', 'S_ENTRY', 'S_EXIT', '16800', '16440', '2', 'TRANSACTION', 'PASS',
  '2026-11-01T10:43:22', '0', '125100', '125100', '0xFF', '3']

test('确认页金额由分转元，零金额与空值区分，解析原值不变', () => {
  assert.equal(formatPasscodeAmount('125100'), '1251.00')
  assert.equal(formatPasscodeAmount('1'), '0.01')
  assert.equal(formatPasscodeAmount('0'), '0.00')
  assert.equal(formatPasscodeAmount(''), '')
  assert.equal(parsePasscode(fields.join('|'))?.fee, '125100')
})

test('通行码 14 段映射，金额保留分，出口重量保留 kg', () => {
  assert.deepEqual(parsePasscode(fields.join('|')), {
    valid: true, vehicleId: '鄂A12345_1', vehicleDisplayId: '鄂A12345', vehicleColorName: '1',
    enStationId: 'S_ENTRY', exStationId: 'S_EXIT', enWeight: '16800', exWeight: '16440',
    mediaTypeId: 2, transactionId: 'TRANSACTION', passId: 'PASS', exTime: '2026-11-01T10:43:22',
    transPayTypeId: 0, fee: '125100', payFee: '125100', vehicleSignId: 255, provinceCount: '3',
  })
})

test('兼容首尾空白和后续扩展字段', () => {
  assert.equal(parsePasscode(` \n${fields.map(f => ` ${f} `).join('|')}|extension\n`)?.exWeight, '16440')
})

test('缺字段、空车牌和损坏字符不回填', () => {
  assert.equal(parsePasscode('https://example.com'), null)
  assert.equal(parsePasscode(fields.slice(0, 13).join('|')), null)
  for (const plate of ['', '_1', '\uFFFDA12345_1']) {
    assert.equal(parsePasscode([plate, ...fields.slice(1)].join('|')), null)
  }
})

test('损坏数字不上传，避免后端 int 转换失败', () => {
  for (const index of [3, 4, 5, 9, 10, 11, 12, 13]) {
    const corrupt = [...fields]
    corrupt[index] = 'not-a-number'
    assert.equal(parsePasscode(corrupt.join('|')), null)
  }
})

test('兼容空可选数值和不带 0x 的十六进制车辆标识', () => {
  const optional = [...fields]
  optional[4] = ''
  optional[5] = ''
  optional[12] = '02'
  const parsed = parsePasscode(optional.join('|'))
  assert.equal(parsed?.exWeight, '')
  assert.equal(parsed?.mediaTypeId, 0)
  assert.equal(parsed?.vehicleSignId, 2)
})

test('车牌没有颜色后缀时保留完整车牌，避免误用车牌末位作颜色', () => {
  const plain = [...fields]
  plain[0] = '鄂A12345'
  assert.equal(parsePasscode(plain.join('|'))?.vehicleDisplayId, '鄂A12345')
  assert.equal(parsePasscode(plain.join('|'))?.vehicleColorName, '')
})

test('现场USB扫码样本按原14段回填，不丢入口、重量、金额及车辆标识', () => {
  const raw = '鄂ACB1870_4|S0002420010010|S0017420020020|4120|3140|2|S001742002002040101302026111312139932|020000450101620038065020261113113728|2026-11-13T12:13:43|0|2600|2600|0xFF|1'
  assert.deepEqual(parsePasscode(raw), {
    valid: true, vehicleId: '鄂ACB1870_4', vehicleDisplayId: '鄂ACB1870', vehicleColorName: '4',
    enStationId: 'S0002420010010', exStationId: 'S0017420020020', enWeight: '4120', exWeight: '3140',
    mediaTypeId: 2, transactionId: 'S001742002002040101302026111312139932',
    passId: '020000450101620038065020261113113728', exTime: '2026-11-13T12:13:43', transPayTypeId: 0,
    fee: '2600', payFee: '2600', vehicleSignId: 255, provinceCount: '1',
  })
})
