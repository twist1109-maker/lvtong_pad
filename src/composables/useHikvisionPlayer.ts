import { onMounted, onUnmounted, ref, shallowRef, type Ref } from 'vue'
import {
  acquireVoiceChannelApi,
  getDevicePreviewConfigApi,
  releaseVoiceChannelApi,
  type DevicePreviewConfig,
} from '@/api/device'
import { DEFAULT_GUN_DEVICE_ID } from '@/config/hikvision'

export type HikPlayerStatus = 'idle' | 'loading' | 'ready' | 'playing' | 'error'

export type HikLayoutRect = {
  left: number
  top: number
  width: number
  height: number
}

export type HikStartOptions = {
  /** 预览成功后自动开始对讲（对齐 Qt TalkDialog / OrderDialog SP） */
  autoTalk?: boolean
  /**
   * 仅对讲：插件 HWND 始终钉在屏外，画面由业务侧 WHEP 等另路播放。
   * 插件仍会开 RealPlay（SDK 对讲前置），只是用户看不见插件窗。
   */
  talkOnly?: boolean
}

const PLAYER_URL = '/hikvision/player.html'
const DEFAULT_PTZ_SPEED = 4

function rectChanged(a: HikLayoutRect | null, b: HikLayoutRect): boolean {
  if (!a) return true
  return (
    Math.abs(a.left - b.left) > 1 ||
    Math.abs(a.top - b.top) > 1 ||
    Math.abs(a.width - b.width) > 1 ||
    Math.abs(a.height - b.height) > 1
  )
}

/**
 * 全屏透明 iframe 承载插件；把黑色预览区屏幕坐标发给 iframe，在内部定位 #divPlugin。
 * 注意：避免高频 layout/I_Resize，否则预览会黑闪。
 */
export function useHikvisionPlayer(anchorRef?: Ref<HTMLElement | null>) {
  const _anchorRef = anchorRef ?? ref<HTMLElement | null>(null)
  const status = ref<HikPlayerStatus>('idle')
  const statusText = ref('实时摄像头画面区域')
  const iframeRef = shallowRef<HTMLIFrameElement | null>(null)
  const iframeSrc = ref('')
  /** 当前预览对应的 devices.device_id */
  const currentDeviceId = ref(DEFAULT_GUN_DEVICE_ID)
  const talking = ref(false)
  const talkBusy = ref(false)
  const audioChannel = ref<number | null>(null)

  let pendingDeviceId = DEFAULT_GUN_DEVICE_ID
  let startAfterReady = false
  let startSent = false
  let autoTalkAfterPlay = false
  let talkOnlyMode = false
  let lastSentLayout: HikLayoutRect | null = null
  let stopWaiters: Array<() => void> = []
  let captureWaiters: Array<(r: { ok: boolean; dataUrl?: string; message?: string }) => void> =
    []
  let talkWaiters: Array<(r: { ok: boolean; talking: boolean; error?: string }) => void> = []
  let presetWaiters: Array<
    (r: { ok: boolean; action: 'set' | 'goto'; id: number; message?: string }) => void
  > = []
  let ptzAutoOn = false
  /** 后端双工通道锁 token（对讲占用） */
  let voiceLockToken: string | null = null
  let voiceLockAcquiring = false
  /** 待预热 device_id 列表；iframe ready 后一次性登录全部相机 */
  let warmupPending: string[] | null = null
  let warmupDone = false
  /** cfg ip_port -> device_id，用于 hik-playing 回写 currentDeviceId */
  const deviceKeyToId = new Map<string, string>()
  /** 预热后缓存 preview-config，切换 Tab 不再打 REST */
  const configCache = new Map<string, DevicePreviewConfig>()

  const OFFSCREEN_LAYOUT: HikLayoutRect = {
    left: -10000,
    top: -10000,
    width: 160,
    height: 90,
  }

  function postToIframe(msg: Record<string, unknown>) {
    const win = iframeRef.value?.contentWindow
    if (!win) return
    win.postMessage({ target: 'hik-embed', ...msg }, '*')
  }

  function measureAnchor(): HikLayoutRect | null {
    if (talkOnlyMode) return { ...OFFSCREEN_LAYOUT }

    const el = _anchorRef.value
    if (!el) return null
    const r = el.getBoundingClientRect()
    if (r.width < 40 || r.height < 40) return null

    // 按 16:9 裁切测量区域，避免容器过高时插件窗下方留黑
    const targetH = Math.round((r.width * 9) / 16)
    const height = Math.min(Math.round(r.height), targetH)
    const top = Math.round(r.top + (r.height - height) / 2)
    return {
      left: Math.round(r.left),
      top,
      width: Math.round(r.width),
      height,
    }
  }

  /** 仅在坐标真正变化时下发，避免插件反复 Resize 黑闪 */
  function postLayout(force = false) {
    const rect = measureAnchor()
    if (!rect) return
    if (!force && !rectChanged(lastSentLayout, rect)) return
    lastSentLayout = rect
    postToIframe({ type: 'hik-layout', rect, force })
  }

  /** 确认框等遮罩打开时把 HWND 挪走，避免挡住 HTML 按钮 */
  function hidePluginOverlay() {
    lastSentLayout = { left: -10000, top: -10000, width: 1, height: 1 }
    postToIframe({ type: 'hik-layout', rect: lastSentLayout, force: true })
  }

  /** 长连接：弹窗关闭时仅隐藏 HWND，不断流、不销毁插件 */
  function hide(): void {
    hidePluginOverlay()
  }

  /** 对讲专用：插件 HWND 始终屏外（画面由 WHEP 等另路播放） */
  function setTalkOnly(enabled: boolean) {
    talkOnlyMode = enabled
    if (enabled) {
      lastSentLayout = { ...OFFSCREEN_LAYOUT }
      postToIframe({ type: 'hik-layout', rect: lastSentLayout, force: true })
    } else if (_anchorRef.value && status.value === 'playing') {
      postLayout(true)
    }
  }

  function setAnchor(el: HTMLElement | null) {
    _anchorRef.value = el
    if (el && status.value === 'playing') {
      postLayout(true)
    }
  }

  async function fetchPreviewConfig(deviceId: string): Promise<DevicePreviewConfig> {
    const cached = configCache.get(deviceId)
    if (cached) return cached
    const res = await getDevicePreviewConfigApi(deviceId)
    if (res.code !== 0 || !res.data?.ip) {
      throw new Error(res.message || '获取摄像头配置失败')
    }
    configCache.set(deviceId, res.data)
    return res.data
  }

  async function postConnect(deviceId: string, cfg: DevicePreviewConfig, switching: boolean) {
    if (deviceId !== pendingDeviceId) return
    deviceKeyToId.set(`${cfg.ip}_${cfg.port || 80}`, deviceId)
    currentDeviceId.value = deviceId
    if (!switching) {
      statusText.value = '正在连接摄像头…'
    }
    postLayout(false)
    postToIframe({
      type: switching ? 'hik-switch' : 'hik-start',
      payload: {
        ip: cfg.ip,
        port: cfg.port,
        username: cfg.username,
        password: cfg.password,
        channelId: cfg.channelId,
        streamType: cfg.streamType,
        skipAudio: switching,
      },
    })
  }

  async function sendWarmup(deviceIds: string[]) {
    status.value = 'loading'
    statusText.value = '正在预热全部摄像头…'
    const configs: DevicePreviewConfig[] = []
    for (const id of deviceIds) {
      const cfg = await fetchPreviewConfig(id)
      configs.push(cfg)
      deviceKeyToId.set(`${cfg.ip}_${cfg.port || 80}`, id)
    }
    const defaultIndex = deviceIds.indexOf(DEFAULT_GUN_DEVICE_ID)
    postLayout(true)
    postToIframe({
      type: 'hik-warmup',
      payload: {
        devices: configs,
        defaultIndex: defaultIndex >= 0 ? defaultIndex : 0,
      },
    })
  }

  /** Dashboard 挂载：登录 cam_lane / cam_ptz / cam_booking，默认枪机出流 */
  async function warmupAll(deviceIds: string[]): Promise<void> {
    warmupPending = [...deviceIds]
    warmupDone = false
    initIframe()
    if (iframeRef.value?.contentWindow) {
      await sendWarmup(warmupPending)
      warmupPending = null
    }
  }

  /** 已保活时切设备或首次连接；同设备且已在播则只更新布局 */
  async function ensureDevice(deviceId = DEFAULT_GUN_DEVICE_ID): Promise<void> {
    pendingDeviceId = deviceId
    if (currentDeviceId.value === deviceId && status.value === 'playing') {
      postLayout(false)
      return
    }

    const switching = warmupDone && !!iframeSrc.value
    let cfg: DevicePreviewConfig
    try {
      cfg = await fetchPreviewConfig(deviceId)
    } catch (e) {
      status.value = 'error'
      statusText.value = e instanceof Error ? e.message : '获取摄像头配置失败'
      return
    }
    if (deviceId !== pendingDeviceId) return

    if (!switching) {
      status.value = 'loading'
      statusText.value = '正在加载摄像头配置…'
    }
    if (!iframeSrc.value) {
      initIframe()
      startAfterReady = true
      startSent = false
      return
    }
    if (!iframeRef.value?.contentWindow) {
      startAfterReady = true
      startSent = false
      return
    }
    await postConnect(deviceId, cfg, switching)
  }

  async function acquireTalkLock(): Promise<boolean> {
    if (voiceLockToken) return true
    if (voiceLockAcquiring) return false
    voiceLockAcquiring = true
    statusText.value = '等待语音通道…'
    try {
      const res = await acquireVoiceChannelApi({
        owner: 'talk',
        wait: true,
        timeout: 45,
      })
      if (res.code === 0 && res.data?.token) {
        voiceLockToken = res.data.token
        return true
      }
      statusText.value = res.message || '语音通道忙，无法对讲'
      return false
    } catch (e) {
      statusText.value = e instanceof Error ? e.message : '语音通道申请失败'
      return false
    } finally {
      voiceLockAcquiring = false
    }
  }

  async function releaseTalkLock() {
    const token = voiceLockToken
    voiceLockToken = null
    if (!token) return
    try {
      await releaseVoiceChannelApi({ owner: 'talk', token })
    } catch {
      /* 关弹窗时尽力释放，忽略网络错误 */
    }
  }

  async function startTalk() {
    if (status.value !== 'playing') return
    if (talkBusy.value || talking.value) return
    talkBusy.value = true
    talking.value = true
    statusText.value = '对讲连接中…'
    const got = await acquireTalkLock()
    if (!got) {
      talking.value = false
      talkBusy.value = false
      return
    }
    postToIframe({ type: 'hik-talk-start' })
  }

  function stopTalk() {
    talking.value = false
    talkBusy.value = true
    statusText.value = '正在停止对讲…'
    // 锁等插件确认关闭后再释放，避免开讲未完成时被抢通道
    postToIframe({ type: 'hik-talk-stop' })
  }

  function toggleTalk() {
    // 连接中再点：改为停止；已对讲则停止；空闲则开始
    if (talkBusy.value) {
      if (talking.value) stopTalk()
      return
    }
    if (talking.value) stopTalk()
    else void startTalk()
  }

  function onMessage(ev: MessageEvent) {
    const data = ev.data
    if (!data || data.source !== 'hik-embed') return

    if (data.type === 'hik-ready') {
      if (warmupPending && warmupPending.length > 0) {
        const ids = warmupPending
        warmupPending = null
        void sendWarmup(ids)
        return
      }
      tryStartOnce()
      return
    }

    if (data.type === 'hik-status') {
      statusText.value = String(data.text || '')
      if (data.status === 'playing') status.value = 'playing'
      else if (data.status === 'error') status.value = 'error'
      else if (data.status === 'loading') status.value = 'loading'
      return
    }

    if (data.type === 'hik-playing') {
      status.value = 'playing'
      statusText.value = '预览中'
      if (typeof data.deviceKey === 'string') {
        const mapped = deviceKeyToId.get(data.deviceKey)
        if (mapped) currentDeviceId.value = mapped
      }
      if (typeof data.audioChannel === 'number') {
        audioChannel.value = data.audioChannel
        statusText.value = '预览成功，可对讲'
      }
      window.setTimeout(() => postLayout(true), 150)
      if (autoTalkAfterPlay) {
        autoTalkAfterPlay = false
        void startTalk()
      }
      return
    }

    if (data.type === 'hik-warmup-done') {
      warmupDone = true
      status.value = 'playing'
      statusText.value = '预览中'
      return
    }

    if (data.type === 'hik-error') {
      status.value = 'error'
      statusText.value = String(data.message || '摄像头启动失败')
      talking.value = false
      talkBusy.value = false
      void releaseTalkLock()
      return
    }

    if (data.type === 'hik-stopped') {
      talking.value = false
      talkBusy.value = false
      audioChannel.value = null
      void releaseTalkLock()
      const waiters = stopWaiters
      stopWaiters = []
      waiters.forEach((fn) => fn())
      return
    }

    if (data.type === 'hik-talk') {
      talking.value = !!data.talking
      if (!data.pending) {
        talkBusy.value = false
      }
      if (!data.talking && !data.pending) {
        void releaseTalkLock()
      }
      if (data.error) {
        statusText.value = String(data.error)
        talkBusy.value = false
        void releaseTalkLock()
      } else if (!data.pending) {
        statusText.value = talking.value ? '对讲中' : '预览成功，可对讲'
      }
      const waiters = talkWaiters
      talkWaiters = []
      waiters.forEach((fn) =>
        fn({
          ok: !data.error,
          talking: !!data.talking,
          error: data.error ? String(data.error) : undefined,
        }),
      )
      return
    }

    if (data.type === 'hik-capture-result') {
      const waiters = captureWaiters
      captureWaiters = []
      waiters.forEach((fn) =>
        fn({
          ok: !!data.ok,
          dataUrl: data.dataUrl,
          message: data.message,
        }),
      )
      return
    }

    if (data.type === 'hik-preset-result') {
      const waiters = presetWaiters
      presetWaiters = []
      const action = data.action === 'set' ? 'set' : 'goto'
      waiters.forEach((fn) =>
        fn({
          ok: !!data.ok,
          action,
          id: Number(data.id) || 0,
          message: data.message ? String(data.message) : undefined,
        }),
      )
    }
  }

  async function sendStart() {
    const deviceId = pendingDeviceId
    status.value = 'loading'
    statusText.value = '正在加载摄像头配置…'
    talking.value = false
    audioChannel.value = null

    let cfg: DevicePreviewConfig
    try {
      cfg = await fetchPreviewConfig(deviceId)
    } catch (e) {
      status.value = 'error'
      statusText.value = e instanceof Error ? e.message : '获取摄像头配置失败'
      return
    }

    if (deviceId !== pendingDeviceId) return
    await postConnect(deviceId, cfg, false)
  }

  function tryStartOnce() {
    if (!startAfterReady || startSent) return
    if (!iframeRef.value?.contentWindow) return
    startSent = true
    startAfterReady = false
    postLayout(true)
    window.setTimeout(() => {
      void sendStart()
    }, 50)
  }

  function initIframe() {
    if (iframeSrc.value) return
    iframeSrc.value = `${PLAYER_URL}?t=${Date.now()}`
  }

  function start(deviceId = DEFAULT_GUN_DEVICE_ID, opts?: HikStartOptions) {
    pendingDeviceId = deviceId
    currentDeviceId.value = deviceId
    ptzAutoOn = false
    autoTalkAfterPlay = !!opts?.autoTalk
    talkOnlyMode = !!opts?.talkOnly
    talking.value = false
    talkBusy.value = false
    audioChannel.value = null

    if (!iframeSrc.value) {
      startSent = false
      startAfterReady = true
      lastSentLayout = null
      initIframe()
      return
    }

    void ensureDevice(deviceId)
  }

  function onIframeLoad() {
    window.setTimeout(() => tryStartOnce(), 200)
  }

  function stop(): Promise<void> {
    return new Promise((resolve) => {
      ptzAutoOn = false
      autoTalkAfterPlay = false
      talkOnlyMode = false
      talking.value = false
      talkBusy.value = false
      void releaseTalkLock()
      if (!iframeRef.value || !iframeSrc.value) {
        status.value = 'idle'
        statusText.value = '实时摄像头画面区域'
        resolve()
        return
      }

      let done = false
      const finish = () => {
        if (done) return
        done = true
        iframeSrc.value = ''
        lastSentLayout = null
        startSent = false
        startAfterReady = false
        audioChannel.value = null
        warmupDone = false
        warmupPending = null
        deviceKeyToId.clear()
        configCache.clear()
        status.value = 'idle'
        statusText.value = '实时摄像头画面区域'
        resolve()
      }

      stopWaiters.push(finish)
      postToIframe({ type: 'hik-stop' })
      window.setTimeout(finish, 1200)
    })
  }

  function captureJpegDataUrl(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (status.value !== 'playing') {
        reject(new Error('预览未就绪，无法拍照'))
        return
      }
      captureWaiters.push((r) => {
        if (r.ok && r.dataUrl) resolve(r.dataUrl)
        else reject(new Error(r.message || '抓图失败'))
      })
      postToIframe({ type: 'hik-capture' })
      window.setTimeout(() => {
        if (captureWaiters.length) {
          const waiters = captureWaiters
          captureWaiters = []
          waiters.forEach((fn) => fn({ ok: false, message: '抓图超时' }))
        }
      }, 8000)
    })
  }

  /** 海康：1上 2下 3左 4右 5左上 6左下 7右上 8右下 9自动 10变焦+ 11变焦- */
  function ptzStart(index: number, speed = DEFAULT_PTZ_SPEED) {
    if (status.value !== 'playing') return
    if (index === 9) {
      // 自动：已开则用 speed=0 关闭
      if (ptzAutoOn) {
        postToIframe({ type: 'hik-ptz', index: 9, stop: false, speed: 0 })
        ptzAutoOn = false
        return
      }
      postToIframe({ type: 'hik-ptz', index: 9, stop: false, speed })
      ptzAutoOn = true
      return
    }
    ptzAutoOn = false
    postToIframe({ type: 'hik-ptz', index, stop: false, speed })
  }

  function ptzStop(index?: number) {
    if (status.value !== 'playing') return
    // 方向停止：对齐官方 demo 用 index=1 + stop；变焦停止用 11
    const stopIndex = index === 10 || index === 11 ? 11 : 1
    postToIframe({ type: 'hik-ptz', index: stopIndex, stop: true, speed: DEFAULT_PTZ_SPEED })
  }

  function requestPreset(action: 'set' | 'goto', id: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (status.value !== 'playing') {
        reject(new Error('预览未就绪'))
        return
      }
      if (!(id >= 1 && id <= 9)) {
        reject(new Error('预置点仅支持 1-9'))
        return
      }
      presetWaiters.push((r) => {
        if (r.ok) resolve()
        else reject(new Error(r.message || (action === 'set' ? '设置预置点失败' : '调用预置点失败')))
      })
      postToIframe({ type: 'hik-preset', action, id })
      window.setTimeout(() => {
        if (presetWaiters.length) {
          const waiters = presetWaiters
          presetWaiters = []
          waiters.forEach((fn) =>
            fn({ ok: false, action, id, message: '预置点操作超时' }),
          )
        }
      }, 8000)
    })
  }

  function setPreset(id: number) {
    return requestPreset('set', id)
  }

  function goPreset(id: number) {
    return requestPreset('goto', id)
  }

  function onWinResize() {
    postLayout(false)
  }

  onMounted(() => {
    window.addEventListener('message', onMessage)
    window.addEventListener('resize', onWinResize)
  })

  onUnmounted(() => {
    window.removeEventListener('message', onMessage)
    window.removeEventListener('resize', onWinResize)
  })

  return {
    status,
    statusText,
    iframeRef,
    iframeSrc,
    currentDeviceId,
    talking,
    talkBusy,
    audioChannel,
    initIframe,
    start,
    warmupAll,
    ensureDevice,
    stop,
    hide,
    setTalkOnly,
    setAnchor,
    onIframeLoad,
    captureJpegDataUrl,
    postLayout,
    hidePluginOverlay,
    startTalk,
    stopTalk,
    toggleTalk,
    ptzStart,
    ptzStop,
    setPreset,
    goPreset,
  }
}
