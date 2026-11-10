import { defineConfig, mergeConfig } from 'vite'
import video from './vite.config'
const config = mergeConfig(video, defineConfig({ server: { port: 5189, strictPort: true } }))
config.server!.proxy = {
  '/mtx': { target: 'http://127.0.0.1:18890', changeOrigin: true, rewrite: path => path.replace(/^\/mtx/, '') },
}
export default config
