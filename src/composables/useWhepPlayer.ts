/**
 * MediaMTX WHEP 播放（标准 WebRTC）
 */
import { onUnmounted, ref, shallowRef } from 'vue'

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
}

export function useWhepPlayer() {
  const status = ref<WhepStatus>('idle')
  const error = ref('')
  const pc = shallowRef<RTCPeerConnection | null>(null)
  let videoEl: HTMLVideoElement | null = null

  async function play({ video, whepUrl }: WhepPlayOptions) {
    await stop()
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
      const stream = ev.streams[0]
      if (stream && video.srcObject !== stream) video.srcObject = stream
      void video.play().catch(() => {})
      status.value = 'playing'
    }

    peer.onconnectionstatechange = () => {
      const s = peer.connectionState
      if (s === 'connected') status.value = 'playing'
      if (s === 'failed' || s === 'disconnected') status.value = s
    }

    try {
      const offer = await peer.createOffer()
      await peer.setLocalDescription(offer)
      await waitIce(peer)

      const res = await fetch(whepUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: peer.localDescription?.sdp || '',
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`WHEP 失败 ${res.status}: ${text.slice(0, 160)}`)
      }

      const answer = await res.text()
      if (!answer?.includes('v=0')) {
        throw new Error('流未就绪（检查摄像头与 MediaMTX）')
      }

      await peer.setRemoteDescription({ type: 'answer', sdp: answer })
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      status.value = 'error'
      await stop()
      throw e
    }
  }

  async function stop() {
    if (pc.value) {
      try {
        pc.value.getReceivers().forEach((r) => r.track?.stop())
        pc.value.close()
      } catch {
        /* ignore */
      }
      pc.value = null
    }
    if (videoEl) videoEl.srcObject = null
    if (status.value !== 'error') status.value = 'idle'
  }

  onUnmounted(() => {
    void stop()
  })

  return { status, error, play, stop }
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
