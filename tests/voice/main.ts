// 仅用于本地 Vite 隔离验证：所有 HTTP 请求被拦截，不连接中间件或设备。
import { createApp, h, ref } from 'vue'
import { createPinia } from 'pinia'
import PlcControlDialog from '../../src/components/PlcControlDialog.vue'
import { useWsStore } from '../../src/stores/useWsStore'

let feedback: Record<string, unknown> = {}
window.fetch = async (input, init) => {
  if ((init?.method || 'GET') !== 'GET' || !String(input).endsWith('/device/plc-status')) {
    throw new Error('Fixture forbids real requests: ' + input)
  }
  return new Response(JSON.stringify({ code: 0, data: feedback }), { headers: { 'Content-Type': 'application/json' } })
}
const pinia = createPinia()
const app = createApp({
  setup() {
    const ws = useWsStore()
    ws.status = 'open'
    const fixture = ref('待反馈')
    function show(name: string, front?: boolean, back?: boolean) {
      ws.status = 'open'
      fixture.value = name
      feedback = front === undefined ? {} : { frontVoiceAnnounceStatus: front, backVoiceAnnounceStatus: back }
    }
    return () => h('main', { style: 'font:16px sans-serif;padding:12px 210px' }, [
      h('p', '隔离验证：不连接真实设备，不允许控制请求。'),
      ...[
        ['无反馈', undefined, undefined], ['前播报', true, false],
        ['后播报', false, true], ['双播报', true, true], ['停止播报', false, false],
      ].map(([name, front, back]) => h('button', { onClick: () => show(name as string, front as boolean | undefined, back as boolean | undefined) }, name)),
      h('button', { onClick: () => { ws.status = 'closed'; fixture.value = '断线' } }, '断线'),
      h('p', `当前模拟：${fixture.value}`),
      h(PlcControlDialog, { anchor: { left: 16, top: 16 } }),
    ])
  },
})
app.use(pinia)
app.mount('#app')
