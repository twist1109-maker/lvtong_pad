import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// 本地交互预览：不配置生产代理，对讲只模拟状态，不调用麦克风或设备。
export default defineConfig({
  cacheDir: 'node_modules/.vite-booking-preview',
  plugins: [vue()],
  resolve: { alias: [
    { find: '@/composables/useBrowserTalk', replacement: fileURLToPath(new URL('./previewTalk.ts', import.meta.url)) },
    { find: '@', replacement: fileURLToPath(new URL('../../src', import.meta.url)) },
  ] },
  server: { host: '127.0.0.1', port: 5186, strictPort: true, proxy: {} },
})
