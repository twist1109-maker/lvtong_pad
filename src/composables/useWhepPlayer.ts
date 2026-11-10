/**
 * MediaMTX WHEP 播放（标准 WebRTC）
 */
import { onUnmounted, ref, shallowRef } from 'vue'
import { whepSessionUrl, isTailscaleIpv4, preferTcpCandidates } from '@/utils/whepSession'

export type WhepStatus =
  | 'idle'
  | 'connecting'
  | 'playing'
  | 'error'
  | 'failed'
  | 'disconnected'

export type WhepPlayOptions = {
  video: HTMLVideoElement
  whepUrl: string
  /** 默认优先TCP，减少无线丢片对画面的影响；auto保留浏览器协商。 */
  transport?: 'auto' | 'tcp'
}

export function useWhepPlayer() {
  const status = ref<WhepStatus>('idle')
  const error = ref('')
  const pc = shallowRef<RTCPeerConnection | null>(null)
  let videoEl: HTMLVideoElement | null = null
  let generation = 0
  let requestController: AbortController | null = null
  let sessionUrl: string | null = null
  let removePlayingListener: (() => void) | null = null

  function releaseSession(url: string | null) {
    if (!url) return
    void fetch(url, { method: 'DELETE', keepalive: true, signal: AbortSignal.timeout(5000) }).catch(() => {})
  }

  async function play({ video, whepUrl, transport = 'tcp' }: WhepPlayOptions) {
    void stop()
    const current = generation
    const controller = new AbortController()
    requestController = controller
    videoEl = video
    error.value = ''
    status.value = 'connecting'

    const peer = new RTCPeerConnection({
      iceServers: [],
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
    })
    pc.value = peer

    peer.addTransceiver('video', { direction: 'recvonly' })
    peer.addTransceiver('audio', { direction: 'recvonly' })

    peer.ontrack = (ev) => {
      if (generation !== current) return
      const stream = ev.streams[0] || new MediaStream([ev.track])
      if (stream && video.srcObject !== stream) video.srcObject = stream
      void video.play().catch(() => {})
    }

    const onPlaying = () => {
      if (generation === current) status.value = 'playing'
    }
    video.addEventListener('playing', onPlaying)
    removePlayingListener = () => video.removeEventListener('playing', onPlaying)

    peer.onconnectionstatechange = () => {
      if (generation !== current) return
      const s = peer.connectionState
      if (s === 'failed' || s === 'disconnected') status.value = s
    }

    const requestTimeout = window.setTimeout(() => controller.abort(), 35000)
    try {
      const offer = await peer.createOffer()
      await peer.setLocalDescription(offer)
      await waitIce(peer)
      if (generation !== current) return

      const res = await fetch(whepUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: peer.localDescription?.sdp || '',
        signal: controller.signal,
      })
      const resource = whepSessionUrl(whepUrl, res.headers.get('Location'), window.location.href)
      if (generation !== current) {
        releaseSession(resource)
        return
      }
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`WHEP 失败 ${res.status}: ${text.slice(0, 160)}`)
      }
      sessionUrl = resource

      const answer = await res.text()
      if (generation !== current) return
      if (!answer?.includes('v=0')) {
        throw new Error('流未就绪（检查摄像头与 MediaMTX）')
      }

      const tcp = transport === 'tcp' || isTailscaleIpv4(new URL(whepUrl, window.location.href).hostname)
      await peer.setRemoteDescription({ type: 'answer', sdp: preferTcpCandidates(answer, tcp) })
    } catch (e) {
      if (generation !== current) return
      error.value = controller.signal.aborted ? '视频连接超时，请重试' : e instanceof Error ? e.message : String(e)
      status.value = 'error'
      await stop()
      throw e
    } finally {
      window.clearTimeout(requestTimeout)
      if (requestController === controller) requestController = null
    }
  }

  async function stop() {
    generation += 1
    requestController?.abort()
    requestController = null
    removePlayingListener?.()
    removePlayingListener = null
    const resource = sessionUrl
    sessionUrl = null
    if (pc.value) {
      try {
        pc.value.ontrack = null
        pc.value.onconnectionstatechange = null
        pc.value.getReceivers().forEach((r) => r.track?.stop())
        pc.value.close()
      } catch {
        /* ignore */
      }
      pc.value = null
    }
    if (videoEl) videoEl.srcObject = null
    videoEl = null
    releaseSession(resource)
    if (status.value !== 'error') status.value = 'idle'
  }

  onUnmounted(() => {
    void stop()
  })

  async function getStats() {
    const report = await pc.value?.getStats()
    const rows: Record<string, unknown>[] = []
    report?.forEach((row) => {
      if (['inbound-rtp', 'codec', 'candidate-pair', 'local-candidate', 'remote-candidate'].includes(row.type)) rows.push({...row})
    })
    return rows
  }

  return { status, error, play, stop, getStats }
}

function waitIce(peer: RTCPeerConnection, timeoutMs = 2000) {
  if (peer.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise<void>((resolve) => {
    const t = window.setTimeout(() => {
      peer.removeEventListener('icegatheringstatechange', onChange)
      resolve()
    }, timeoutMs)
    function onChange() {
      if (peer.iceGatheringState === 'complete') {
        window.clearTimeout(t)
        peer.removeEventListener('icegatheringstatechange', onChange)
        resolve()
      }
    }
    peer.addEventListener('icegatheringstatechange', onChange)
  })
}
