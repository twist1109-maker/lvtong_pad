import { createApp, h, ref, nextTick } from 'vue'
import { createPinia } from 'pinia'
import BookingDialog from '../../src/modules/booking/BookingDialog.vue'
import { setBookingApi } from '../../src/modules/booking/api/bookingApi'
import { useBookingStore } from '../../src/modules/booking/store/useBookingStore'
import { ScreenScaler } from '../../src/layout'
import '../../src/styles/global.scss'
import '../../src/styles/fitted-screen.scss'

const parameters = new URLSearchParams(location.search)
const missing = ref(parameters.has('missing'))
const wide = parameters.has('wide')
const pending = new Set<ReturnType<typeof setTimeout>>()
function delay(duration: number) { return new Promise<void>(resolve => { const timer = setTimeout(() => { pending.delete(timer); resolve() }, duration); pending.add(timer) }) }
const canvas = document.createElement('canvas')
canvas.width = wide ? 1000 : 800
canvas.height = wide ? 230 : 500
const ctx = canvas.getContext('2d')!
ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
ctx.fillStyle = '#92b171'
for (let x = 90; x < canvas.width - 70; x += 3) {
  const top = x < 245 ? 210 : 110
  for (let y = top; y < canvas.height - 60; y += 3) {
    if ((x * 37 + y * 17) % 23 < 11) ctx.fillRect(x, y, 1.6, 1.6)
  }
}
const imageUrl = canvas.toDataURL()
setBookingApi({
  async fetchRadarImage() {
    if (!parameters.has('fast')) await delay(1100)
    if (missing.value) return null
    return { imageUrl, originalImageWidth: canvas.width, originalImageHeight: canvas.height,
      imageEnvelope: '0', vehicleHeaderEnvelope: '90', contentOriginX: 90,
      vehicleHeight: 3.5, vehicleSx: .9, metersPerPixel: .01 }
  },
  async openDialog() { return { videoStreamUrl: null, devicesReady: true } },
  async stopVideoSession() {},
  async acceptBooking() {},
  async rejectBooking() {},
  async recordBtnPress() { return { btnPressTime: '', openDialog: true, btnPrebookState: true } },
  async getState() { return {} as never },
})

// 预览进程禁止任何后端请求，包括视频、业务操作和光源命令。
window.fetch = async () => new Response('本地预览：未连接现场设备', { status: 503 })
const mounted = ref(true)
const message = ref('')
const app = createApp({ setup() {
  const store = useBookingStore()
  async function restart(restore = false) {
    mounted.value = false
    if (!restore) store.sharedDialogDraft = {}
    await nextTick()
    mounted.value = true
    message.value = ''
  }
  return () => h(ScreenScaler, {}, () => [
    mounted.value && h(BookingDialog, { onClose: () => { mounted.value = false },
      onAccept: () => { message.value = '已模拟受理，未连接现场' },
      onReject: () => { message.value = '已模拟驳回，未连接现场' } }),
    h('div', { style: 'position:absolute;left:16px;bottom:12px;z-index:30000;display:flex;align-items:center;gap:12px;font:14px Microsoft YaHei;color:#42665c;background:#fff;padding:8px 14px;border:1px solid #bdd8cf;border-radius:6px' }, [
      h('span', '本地效果预览 · 雷达与通话均为模拟'),
      h('button', { onClick: () => { void restart() }, style: 'padding:5px 10px' }, '重新打开'),
      h('button', { onClick: () => { void restart(true) }, style: 'padding:5px 10px' }, '恢复当前分割线'),
      h('label', [h('input', { type: 'checkbox', checked: missing.value, onChange: (event: Event) => { missing.value = (event.target as HTMLInputElement).checked; void restart() } }), '模拟无雷达图']),
      message.value && h('span', message.value),
    ]),
  ])
} })
app.use(createPinia())
app.mount('#app')
