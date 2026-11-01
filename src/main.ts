import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/useAuthStore'
import './styles/global.scss'
import './styles/fitted-screen.scss'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// 初始化认证状态（从 localStorage 恢复 token 并验证有效性）
const auth = useAuthStore()
auth.initAuth().finally(() => {
  app.mount('#app')
})
