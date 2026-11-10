import assert from 'node:assert/strict'
import test from 'node:test'
import { whepSessionUrl, isTailscaleIpv4, preferTcpCandidates } from '../../src/utils/whepSession.ts'

test('WHEP 删除会话保留代理前缀，避免请求内部端口', () => {
  for (const location of ['/cam2/whep/abc', 'http://127.0.0.1:8889/cam2/whep/abc', '/mtx/cam2/whep/abc']) {
    assert.equal(whepSessionUrl('/mtx/cam2/whep', location, 'https://site:5174/'), 'https://site:5174/mtx/cam2/whep/abc')
  }
})

test('没有合法资源标识时不猜测删除地址', () => {
  for (const location of [null, '', '/cam2/whep', '/other/abc']) {
    assert.equal(whepSessionUrl('/mtx/cam2/whep', location, 'https://site/'), null)
  }
})

test('自动模式识别Tailscale；TCP筛选保持SDP与无TCP候选时的兼容性', () => {
  for (const host of ['100.69.226.19','100.86.211.35','100.64.0.1','100.127.255.255']) assert.equal(isTailscaleIpv4(host),true)
  for (const host of ['localhost','192.168.88.253','100.63.0.1','100.128.0.1','100.69.999.1']) assert.equal(isTailscaleIpv4(host),false)
  const sdp='v=0\r\na=candidate:1 1 udp 99 100.69.226.19 8189 typ host\r\na=candidate:2 1 tcp 98 100.69.226.19 8189 typ host tcptype passive\r\na=end-of-candidates\r\n'
  assert.equal(preferTcpCandidates(sdp,false),sdp)
  const tcp=preferTcpCandidates(sdp,true)
  assert.ok(!tcp.includes(' 1 udp '))
  assert.ok(tcp.includes(' 1 tcp '))
  assert.ok(tcp.includes('a=end-of-candidates'))
  const udpOnly=sdp.replace(/^a=candidate:2.*\r\n/m,'')
  assert.equal(preferTcpCandidates(udpOnly,true),udpOnly)
})
