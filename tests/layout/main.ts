import { createApp, defineComponent, h, nextTick, onMounted, ref, type Component } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from '../../src/App.vue'
import CaptureCameraDialog from '../../src/components/capture/CaptureCameraDialog.vue'
import DrivingLicenseDialog from '../../src/components/capture/DrivingLicenseDialog.vue'
import PasscodeScanDialog from '../../src/modules/padCapture/PasscodeScanDialog.vue'
import HistoryDialog from '../../src/modules/history/HistoryDialog.vue'
import BookingDialog from '../../src/modules/booking/BookingDialog.vue'
import UserManager from '../../src/components/UserManager.vue'
import LicensePlateEdit from '../../src/components/LicensePlateEdit.vue'
import AgriculturalSelect from '../../src/components/AgriculturalSelect.vue'
import { useAuthStore } from '../../src/stores/useAuthStore'
import { useBookingStore } from '../../src/modules/booking/store/useBookingStore'
import '../../src/styles/global.scss'
import '../../src/styles/fitted-screen.scss'

const fixtureOptions = new URLSearchParams(location.search)
const captureBlocked = ref(fixtureOptions.get('captureBlocked') === '1')
if (fixtureOptions.get('detector') === 'absent') {
  Object.defineProperty(globalThis, 'BarcodeDetector', { configurable: true, value: undefined })
}
if (fixtureOptions.get('upload')?.startsWith('fail')) {
  const realFetch = window.fetch.bind(window)
  let attempts = 0
  // 仅模拟上传失败，识别、解析和页面回填仍运行生产代码。
  window.fetch = (input, init) => String(input).includes('/mobile/upload/json') &&
    (fixtureOptions.get('upload') === 'fail' || attempts++ === 0)
    ? Promise.resolve(new Response(JSON.stringify({ code: 500 }), { status: 503 }))
    : realFetch(input, init)
}

// 使用测试图案代替设备镜头，便于验证预览、拍照和旋转屏幕。
Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
  configurable: true,
  value: async () => {
    if (fixtureOptions.get('camera') === 'denied') throw new DOMException('Test camera permission denied', 'NotAllowedError')
    const canvas = document.createElement('canvas')
    canvas.width = 1280
    canvas.height = 720
    const ctx = canvas.getContext('2d')!
    if (fixtureOptions.get('camera') === 'qr') {
      const image = new Image()
      image.src = '/tests/layout/artifacts/sample-passcode.png'
      await image.decode()
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, 1280, 720)
      ctx.imageSmoothingEnabled = false
      ctx.save()
      ctx.translate(640, 360)
      ctx.rotate(Number(fixtureOptions.get('rotation') || 0) * Math.PI / 180)
      const edge = Number(fixtureOptions.get('edge') || 360)
      ctx.drawImage(image, -edge / 2, -edge / 2, edge, edge)
      ctx.restore()
      return canvas.captureStream(1)
    }
    ctx.fillStyle = '#153b36'
    ctx.fillRect(0, 0, 1280, 720)
    ctx.strokeStyle = '#5fbb9e'
    ctx.lineWidth = 8
    ctx.strokeRect(160, 90, 960, 540)
    ctx.fillStyle = '#ffffff'
    ctx.font = '48px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Pad camera preview / 1280 × 720', 640, 370)
    return canvas.captureStream(1)
  },
})

const pinia = createPinia()
function openedDialog(component: Component) {
  return defineComponent({
    setup() {
      const dialog = ref<{ show: () => void } | null>(null)
      onMounted(() => dialog.value?.show())
      return () => h(component, { ref: dialog })
    },
  })
}
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: () => import('../../src/views/Dashboard.vue') },
    { path: '/login', component: () => import('../../src/modules/auth/LoginView.vue') },
    { path: '/capture', component: { render: () => h(CaptureCameraDialog, { kind: 'head', captureBlocked: captureBlocked.value }) } },
    { path: '/goods', component: { render: () => h(CaptureCameraDialog, { kind: 'goods' }) } },
    { path: '/license', component: { render: () => h(DrivingLicenseDialog, { captureBlocked: captureBlocked.value }) } },
    { path: '/scan', component: { render: () => h(PasscodeScanDialog, { initialSource: 'camera' }) } },
    { path: '/scan-manual', component: { render: () => h(PasscodeScanDialog, { initialSource: 'camera', autoScan: false }) } },
    { path: '/scan-source', component: PasscodeScanDialog },
    { path: '/scanner', component: { render: () => h(PasscodeScanDialog, { initialSource: 'scanner' }) } },
    { path: '/history', component: HistoryDialog },
    { path: '/booking', component: BookingDialog },
    { path: '/users', component: UserManager },
    { path: '/plate', component: openedDialog(LicensePlateEdit) },
    { path: '/products', component: openedDialog(AgriculturalSelect) },
  ],
})
const captureGuardFixture = defineComponent({
  setup: () => () => [
    h(App),
    h('button', {
      style: 'position:fixed;top:0;right:0;z-index:20000;padding:8px;background:#fff;color:#000',
      onClick: () => { captureBlocked.value = !captureBlocked.value },
    }, captureBlocked.value ? '模拟解除占用' : '模拟车道占用'),
  ],
})
const app = createApp(fixtureOptions.has('captureBlocked') ? captureGuardFixture : App)
app.use(pinia)
app.use(router)
useAuthStore().user = { username: 'layout-test', realName: '布局测试', phone: '', role: 1 }
if (fixtureOptions.get('bookingBusy') === '1') {
  void router.isReady().then(async () => {
    await nextTick()
    useBookingStore().isDetection = true
    useBookingStore().checkStep = 1
  })
}
app.mount('#app')

// 双摄竖向拼接测试图；仅布局入口使用，不访问任何现场设备。
if (fixtureOptions.get('bookingVideo') === '1') {
  void router.isReady().then(async () => {
    await nextTick()
    const video = document.querySelector<HTMLVideoElement>('.video-panel video')
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 1024
    const ctx = canvas.getContext('2d')!
    ctx.translate(0, 1024)
    ctx.rotate(-Math.PI / 2)
    for (const [index, color] of ['#174e67', '#246a45'].entries()) {
      ctx.fillStyle = color
      ctx.fillRect(index * 512, 0, 512, 512)
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 8
      ctx.strokeRect(index * 512 + 12, 12, 488, 488)
      ctx.fillStyle = '#fff'
      ctx.font = '48px sans-serif'
      ctx.fillText(`CAMERA ${index + 1} ↑`, index * 512 + 60, 270)
    }
    video.poster = canvas.toDataURL()
  })
}
