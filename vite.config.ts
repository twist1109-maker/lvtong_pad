import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

const defaultCertFile = fileURLToPath(
  new URL('../lvtong-backend/certs/cert.pem', import.meta.url),
)
const defaultKeyFile = fileURLToPath(
  new URL('../lvtong-backend/certs/key.pem', import.meta.url),
)

const certFile = process.env.HTTPS_CERT_FILE || defaultCertFile
const keyFile = process.env.HTTPS_KEY_FILE || defaultKeyFile

function loadHttpsConfig() {
  if (!existsSync(certFile) || !existsSync(keyFile)) {
    console.warn(
      `[Vite HTTPS] 未找到证书，开发服务器将回退为 HTTP。\n` +
        `请先启动 flask_backend 生成证书，或设置 HTTPS_CERT_FILE 和 HTTPS_KEY_FILE。`,
    )
    return undefined
  }

  return {
    cert: readFileSync(certFile),
    key: readFileSync(keyFile),
  }
}

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
    // 局域网 IP 不属于浏览器认可的 HTTP 安全上下文；启用 HTTPS 后才能调用摄像头。
    // 默认复用 flask_backend 自动生成且包含本机网卡 IP 的开发证书。
    https: loadHttpsConfig(),
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
      // flask_backend HTTP 8080（HTTPS 跑 8082 给移动 app，Vite 走 HTTP）
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
