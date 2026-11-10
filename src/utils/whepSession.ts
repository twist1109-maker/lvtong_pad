/** MediaMTX 的 Location 是上游路径；删除会话时保留当前同源 /mtx 代理前缀。 */
export function whepSessionUrl(whepUrl: string, location: string | null, pageUrl: string): string | null {
  if (!location) return null
  const endpoint = new URL(whepUrl, pageUrl)
  const upstream = new URL(location, endpoint)
  const suffix = upstream.pathname.match(/\/whep\/([^/]+)$/)?.[1]
  if (!suffix) return null
  endpoint.pathname = endpoint.pathname.replace(/\/$/, '') + '/' + suffix
  endpoint.hash = ''
  return endpoint.href
}

export function isTailscaleIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map(Number)
  return parts.length === 4 && parts.every(n=>Number.isInteger(n)&&n>=0&&n<=255)
    && parts[0] === 100 && parts[1]! >= 64 && parts[1]! <= 127
}

/** 无线局域网和远程链路都可能丢失视频分片；有TCP候选时使用可靠传输。 */
export function preferTcpCandidates(sdp: string, preferTcp: boolean): string {
  if (!preferTcp || !/^a=candidate:\S+ \d+ tcp /im.test(sdp)) return sdp
  return sdp.split('\n').filter(line=>!/^a=candidate:/i.test(line)||/^a=candidate:\S+ \d+ tcp /i.test(line)).join('\n')
}
