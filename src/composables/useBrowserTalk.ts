import { computed, onBeforeUnmount, ref } from 'vue'
import { io, type Socket } from 'socket.io-client'
import { appConfig } from '@/config/env'

/** Independent authenticated audio connection; never calls booking/control APIs. */
export function useBrowserTalk() {
  const state = ref<'idle' | 'connecting' | 'talking' | 'error'>('idle')
  const error = ref('')
  const speakerMuted = ref(false)
  const stats = ref({ sentBytes: 0, receivedBytes: 0, droppedFrames: 0 })
  const diagnostics = ref<{ capture?: MediaTrackSettings; microphone?: { sampleRate: number; rmsDb: number; peak: number; clippedFraction: number }; uplinkDroppedFrames: number }>({ uplinkDroppedFrames: 0 })
  const talking = computed(() => state.value === 'talking')
  const busy = computed(() => state.value === 'connecting')
  const hint = computed(() => error.value || (busy.value ? '正在连接对讲…' : talking.value ? '实时对讲中' : ''))
  let generation = 0
  let socket: Socket | null = null
  let context: AudioContext | null = null
  let mic: MediaStream | null = null
  let node: AudioWorkletNode | null = null
  let source: MediaStreamAudioSourceNode | null = null
  let outputGain: GainNode | null = null
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let deadline: ReturnType<typeof setTimeout> | undefined

  function stop(message = '') {
    generation++
    clearInterval(heartbeat)
    clearTimeout(deadline)
    mic?.getTracks().forEach(track => track.stop())
    mic = null
    source?.disconnect()
    source = null
    if (node) { node.port.onmessage = null; node.disconnect(); node = null }
    outputGain?.disconnect()
    outputGain = null
    speakerMuted.value = false
    const ac = context
    context = null
    if (ac) { ac.onstatechange = null; void ac.close().catch(() => {}) }
    if (socket) {
      socket.removeAllListeners()
      socket.disconnect() // server disconnect handler releases the camera, also while opening
      socket = null
    }
    error.value = message
    state.value = message ? 'error' : 'idle'
  }

  async function start() {
    stop()
    const current = generation
    const active = () => current === generation
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('请使用 HTTPS 地址打开页面并允许麦克风权限')
      }
      const token = localStorage.getItem('lvtong_token') || sessionStorage.getItem('lvtong_token')
      if (!token) throw new Error('请先登录再开启对讲')
      state.value = 'connecting'
      stats.value = { sentBytes: 0, receivedBytes: 0, droppedFrames: 0 }
      diagnostics.value = { uplinkDroppedFrames: 0 }
      const ac = new AudioContext({ latencyHint: 'interactive' })
      context = ac
      // Resume directly from the user's click, before async permission/network operations.
      await ac.resume()
      const stream = await navigator.mediaDevices.getUserMedia({ audio: {
        channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true,
      }, video: false })
      if (!active()) { stream.getTracks().forEach(track => track.stop()); return }
      mic = stream
      diagnostics.value.capture = stream.getAudioTracks()[0]?.getSettings()
      stream.getAudioTracks().forEach(track => track.addEventListener('ended', () => {
        if (active()) stop('麦克风已断开，请重新连接')
      }))
      await ac.audioWorklet.addModule('/audio/talk-worklet.js')
      if (!active()) return
      node = new AudioWorkletNode(ac, 'lvtong-talk', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] })
      outputGain = ac.createGain()
      node.connect(outputGain)
      outputGain.connect(ac.destination)
      source = ac.createMediaStreamSource(stream)
      source.connect(node)
      const base = appConfig.wsUrl.startsWith('/') ? window.location.origin : appConfig.wsUrl.replace(/\/socket\.io\/?$/, '')
      const client = io(`${base}/talk`, {
        path: appConfig.wsUrl.startsWith('/') ? appConfig.wsUrl : '/socket.io',
        transports: ['websocket'], auth: { token }, forceNew: true, reconnection: false, timeout: 12000,
      })
      socket = client
      deadline = setTimeout(() => { if (active()) stop('连接对讲超时，请检查相机后重试') }, 20000)
      let pending = 0
      node.port.onmessage = ({ data }) => {
        if (!active()) return
        if (data.microphone) diagnostics.value.microphone = data.microphone
        if (!talking.value || !client.connected || !data.audio) return
        if (pending >= 24) { diagnostics.value.uplinkDroppedFrames++; return }
        pending++
        client.timeout(2000).emit('audio', data.audio, (err: Error | null, result?: { ok: boolean; error?: string }) => {
          pending--
          if (active() && (err || !result?.ok)) stop(result?.error || '对讲网络中断，请重试')
        })
      }
      client.on('connect', () => {
        if (!active()) return
        client.timeout(10000).emit('start', (err: Error | null, result?: { ok: boolean; error?: string }) => {
          if (active() && (err || !result?.ok)) stop(result?.error || '启动对讲失败')
        })
        heartbeat = setInterval(() => { if (client.connected) client.emit('heartbeat') }, 2000)
      })
      client.on('ready', (config: { codec: string; sampleRate: number }) => {
        if (!active()) return
        if (!['alaw', 'ulaw'].includes(config.codec) || config.sampleRate !== 8000) {
          stop('相机音频格式不支持'); return
        }
        clearTimeout(deadline)
        node?.port.postMessage({ codec: config.codec })
        state.value = 'talking'
        ac.onstatechange = () => {
          if (active() && ac.state === 'suspended') stop('音频已暂停，请点击重新开始对讲')
        }
      })
      client.on('audio', (data: ArrayBuffer, ack?: () => void) => {
        if (active() && talking.value) node?.port.postMessage({ audio: data })
        ack?.()
      })
      client.on('stats', data => { if (active()) stats.value = data })
      client.on('ended', data => { if (active()) stop(data.message === '对讲已结束' ? '' : data.message || '对讲已结束') })
      client.on('disconnect', () => { if (active()) stop('对讲连接已断开，请重试') })
      client.on('connect_error', () => { if (active()) stop('无法连接对讲服务，请检查网络和登录状态') })
    } catch (exc) {
      if (!active()) return
      const message = exc instanceof DOMException && ['NotAllowedError', 'SecurityError'].includes(exc.name)
        ? '麦克风权限被拒绝，请在浏览器设置中允许后重试'
        : exc instanceof DOMException && exc.name === 'NotFoundError'
          ? '未找到可用麦克风，请连接麦克风后重试'
          : exc instanceof Error ? exc.message : '对讲启动失败'
      stop(message)
    }
  }
  function toggle() { if (state.value === 'talking' || state.value === 'connecting') stop(); else void start() }
  function toggleSpeaker() {
    if (!talking.value || !outputGain) return
    speakerMuted.value = !speakerMuted.value
    outputGain.gain.value = speakerMuted.value ? 0 : 1
  }
  function pageHide() { stop() }
  window.addEventListener('pagehide', pageHide)
  onBeforeUnmount(() => { window.removeEventListener('pagehide', pageHide); stop() })
  return { state, error, stats, diagnostics, talking, busy, hint, speakerMuted, start, stop, toggle, toggleSpeaker }
}
