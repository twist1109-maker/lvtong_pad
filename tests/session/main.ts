import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import Dashboard from '../../src/views/Dashboard.vue'
import App from '../../src/App.vue'
import LoginView from '../../src/modules/auth/LoginView.vue'
import { useAuthStore } from '../../src/stores/useAuthStore'
import '../../src/styles/global.scss'
import '../../src/styles/fitted-screen.scss'
const token = (await (await fetch('/fixture/token')).json()).token
const loginFirst = new URLSearchParams(location.search).has('login')
if (!loginFirst) sessionStorage.setItem('lvtong_token', token)
// 仅模拟终端摄像头，后端草稿、图片持久化、Socket.IO均使用生产实现。
Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
  const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#34765c'; ctx.fillRect(0, 0, 1280, 720)
  ctx.fillStyle = '#fff'; ctx.font = '70px sans-serif'; ctx.fillText('PAD CAMERA PHOTO', 150, 350)
  return canvas.captureStream(10)
} })
const pinia = createPinia()
const app = createApp(App)
app.use(pinia)
const auth = useAuthStore(pinia)
if (!loginFirst) auth.user = { username: 'sync-test', realName: '同步测试', phone: '13800000000', role: 0, groupId: 1 }
app.use(createRouter({ history: createWebHashHistory(), routes: [{ path: '/login', component: LoginView }, { path: '/:pathMatch(.*)*', component: Dashboard }] }))
app.mount('#app')
