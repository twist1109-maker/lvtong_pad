import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5174,
    host: true,
    proxy: {
      // MediaMTX WebRTC / WHEP（lvtong-backend/tools/mediamtx，:8889）
      '/mtx': {
        target: 'http://127.0.0.1:8889',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/mtx/, ''),
      },
      // 实时视频帧/流：关闭超时，避免长连接/轮询被代理掐断
      '/api/live/frame.jpg': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0,
      },
      '/api/live/stream.mjpg': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0,
      },
      // flask_backend HTTP 8080（HTTPS 跑 8081 给移动 app，Vite 走 HTTP）
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:8080',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
