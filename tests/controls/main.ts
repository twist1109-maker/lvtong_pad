// 所有HTTP在此拦截；不连接现场，不下发真实PLC或云台命令。
import { createApp, h, onMounted, onUnmounted, ref } from 'vue'
import { createPinia } from 'pinia'
import { ScreenScaler } from '../../src/layout'
import CaptureCameraDialog, { type CaptureKind } from '../../src/components/capture/CaptureCameraDialog.vue'
import PlcControlDialog from '../../src/components/PlcControlDialog.vue'
import '../../src/styles/global.scss'
import '../../src/styles/fitted-screen.scss'

const mode = ref('stale')
const events = ref<string[]>([])
let feedback: Record<string, boolean> = {}
let commandAt = 0
function log(value: string) { events.value.push(`${Math.round(performance.now() - commandAt)}ms ${value}`) }
const response = (data: unknown, status = 200, code = 0) => new Response(JSON.stringify({ code, data, message: status === 200 ? 'fixture' : '模拟发送失败' }), { status, headers: { 'Content-Type': 'application/json' } })
window.fetch = async (input, init) => {
  const url = String(input)
  if (url.includes('/mtx/')) { log(`WHEP ${url}`); return new Response('隔离验收无视频源', { status: 503 }) }
  if (url.endsWith('/device/plc-status')) return response({ ...feedback, fresh: true })
  if (url.endsWith('/device/radiometer-status')) return response(null)
  if (url.endsWith('/device/plc-control') && init?.method === 'POST') {
    commandAt = performance.now(); events.value = []
    const payload = JSON.parse(String(init.body)); log(`command ${JSON.stringify(payload)}`)
    if (mode.value === 'match') setTimeout(() => { feedback = { ...feedback, ...payload }; log('设备反馈更新') }, 300)
    await new Promise(resolve => setTimeout(resolve, mode.value === 'slow' ? 1600 : 120))
    return mode.value === 'fail' ? response(null, 500, 500) : response({})
  }
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
        }
      })
      observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['aria-pressed'] })
    })
    onUnmounted(() => observer.disconnect())
    return () => h(ScreenScaler, {}, () => [
      h('main', { style: 'padding:20px 20px 20px 230px;font:18px sans-serif' }, [
        h('p', '隔离验收：无真实相机、设备或网络控制'),
        ...(['head', 'tail', 'top', 'goods', 'evidence'] as CaptureKind[]).map(kind => h('button', { onClick: () => { cameraKind.value = kind; plcOpen.value = false } }, `打开${kind}`)),
        h('button', { onClick: () => { cameraKind.value = null; plcOpen.value = true } }, '打开PLC'),
        h('div', ['PLC模拟场景：', ...['stale', 'match', 'slow', 'fail'].map(value => h('button', { onClick: () => { mode.value = value; feedback = {}; events.value = [] } }, value))]),
        h('pre', { id: 'events' }, events.value.join('\n')),
      ]),
      plcOpen.value && h(PlcControlDialog, { anchor: { left: 20, top: 20 }, onClose: () => { plcOpen.value = false } }),
      cameraKind.value && h(CaptureCameraDialog, { kind: cameraKind.value, onClose: () => { cameraKind.value = null } }),
    ])
  },
})
app.use(createPinia()); app.mount('#app')
