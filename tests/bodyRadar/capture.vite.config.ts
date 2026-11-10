import { defineConfig, mergeConfig } from 'vite'
import base from '../../vite.config'
const config = mergeConfig(base, defineConfig({
  define: { 'import.meta.env.VITE_USE_MOCK': JSON.stringify('true') },
  server: { host: '127.0.0.1', port: 5193, strictPort: true },
}))
config.server!.https = undefined
config.server!.proxy = {
  '/api': { target: 'http://127.0.0.1:5194', changeOrigin: true },
  '/socket.io': { target: 'http://127.0.0.1:5194', ws: true },
}
export default config
