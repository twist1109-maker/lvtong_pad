// 所有HTTP在此拦截；不连接现场，不下发真实PLC或云台命令。
import { createApp, h, onMounted, onUnmounted, ref } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import { ScreenScaler } from '../../src/layout'
import CaptureCameraDialog, { type CaptureKind } from '../../src/components/capture/CaptureCameraDialog.vue'
import PlcControlDialog from '../../src/components/PlcControlDialog.vue'
import Dashboard from '../../src/views/Dashboard.vue'
import { appConfig } from '../../src/config/env'
import { useWsStore } from '../../src/stores/useWsStore'
import { useAuthStore } from '../../src/stores/useAuthStore'
import '../../src/styles/global.scss'
import '../../src/styles/fitted-screen.scss'

const mode = ref('stale')
const events = ref<string[]>([])
const gateMode = new URLSearchParams(location.search).has('gate')
Object.assign(appConfig, { useMock: false, wsUrl: 'http://127.0.0.1:5197' })
let feedback: Record<string, unknown> = { receivedAt: Date.now(), fresh: true, stickdown: false, sensors: [{ bit: 6, online: true }] }
let commandAt = 0
let delayedPoll = false
let generation = 0
let wsStore: ReturnType<typeof useWsStore>
function log(value: string) { events.value.push(`${Math.round(performance.now() - commandAt)}ms ${value}`) }
const response = (data: unknown, status = 200, code = 0) => new Response(JSON.stringify({ code, data, message: status === 200 ? 'fixture' : '模拟发送失败' }), { status, headers: { 'Content-Type': 'application/json' } })
window.fetch = async (input, init) => {
  const url = String(input)
  if (url.includes('/mtx/')) { log(`WHEP ${url}`); return new Response('隔离验收无视频源', { status: 503 }) }
  if (url.endsWith('/device/plc-status')) {
    const snapshot = { ...feedback }
    if (mode.value === 'reorder' && commandAt && !delayedPoll) {
      delayedPoll = true; log('旧HTTP开始')
      await new Promise(resolve => setTimeout(resolve, 1800))
      log('旧HTTP返回')
    }
    return response(snapshot)
  }
  if (url.endsWith('/device/radiometer-status')) return response(null)
  if ((url.endsWith('/device/plc-control') || url.endsWith('/device/gate_001/control')) && init?.method === 'POST') {
    commandAt = performance.now(); events.value = []
    delayedPoll = false
    const current = ++generation
    const raw = JSON.parse(String(init.body))
    const payload = raw.action ? { stickdown: raw.action === 'open' } : raw
    log(`command ${JSON.stringify(payload)}`)
    if (['match', 'late', 'reorder'].includes(mode.value)) setTimeout(() => {
      if (current !== generation) return
      feedback = { ...feedback, ...payload, receivedAt: Date.now() }
      wsStore.send({ type: 'fixture_feedback', data: feedback }); log('新WS反馈更新')
    }, mode.value === 'late' ? 2200 : 300)
    await new Promise(resolve => setTimeout(resolve, mode.value === 'slow' ? 1600 : 120))
    return mode.value === 'fail' ? response(null, 500, 500) : response({})
  }
  if (url.endsWith('/device/status')) return response({ sensors: [{ connected: true }] })
  if (url.endsWith('/auth/me')) return response({ username: 'test', realName: '隔离测试', role: 1 })
  if (url.includes('/api/')) return response([])
  throw new Error(`Fixture forbids requests: ${url}`)
}
// 若错误启动了本机相机，验收会直接报错，不请求用户摄像头。
Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => { throw new Error('隔离验收：本机相机不应自动启动') } })

const app = createApp({
  setup() {
    const cameraKind = ref<CaptureKind | null>(null)
    const plcOpen = ref(true)
    let observer: MutationObserver
    onMounted(() => {
      observer = new MutationObserver(records => {
        for (const record of records) {
          const el = record.target as HTMLElement
          if (el.matches('.switch-btn') && record.attributeName === 'aria-pressed') log(`${el.title}=${el.getAttribute('aria-pressed')}`)
          if (el.matches('.wf-icon') && el.getAttribute('alt') === '闸机') log(`gate=${el.getAttribute('src')?.split('/').pop()}`)
        }
      })
      observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['aria-pressed','src'] })
    })
    onUnmounted(() => observer.disconnect())
    return () => h(ScreenScaler, {}, () => [
      h('main', { style: gateMode
        ? 'position:absolute;top:0;right:0;z-index:1600;width:50%;padding:10px;background:#fff;font:14px sans-serif'
        : 'position:relative;z-index:1600;margin-left:230px;padding:20px;font:18px sans-serif' }, [
        h('p', '隔离验收：无真实相机、设备或网络控制'),
        ...(['head', 'tail', 'top', 'goods', 'evidence'] as CaptureKind[]).map(kind => h('button', { onClick: () => { cameraKind.value = kind; plcOpen.value = false } }, `打开${kind}`)),
        h('button', { onClick: () => { cameraKind.value = null; plcOpen.value = true } }, '打开PLC'),
        h('div', ['PLC模拟场景：', ...['stale', 'match', 'late', 'reorder', 'slow', 'fail'].map(value => h('button', { onClick: () => {
          mode.value = value; generation++; commandAt = 0; delayedPoll = false
          feedback = { receivedAt: Date.now(), fresh: true, stickdown: false, redlight: false, sensors: [{ bit: 6, online: true }] }
          wsStore.send({ type: 'fixture_feedback', data: feedback }); events.value = []
        } }, value))]),
        h('pre', { id: 'events' }, events.value.join('\n')),
      ]),
      gateMode ? h(Dashboard) : plcOpen.value && h(PlcControlDialog, { anchor: { left: 20, top: 20 }, onClose: () => { plcOpen.value = false } }),
      cameraKind.value && h(CaptureCameraDialog, { kind: cameraKind.value, onClose: () => { cameraKind.value = null } }),
    ])
  },
})
app.use(createPinia())
app.use(createRouter({ history: createWebHashHistory(), routes: [] }))
useAuthStore().user = { username: 'test', realName: '隔离测试', phone: '', role: 1 }
wsStore = useWsStore(); wsStore.connect()
app.mount('#app')
