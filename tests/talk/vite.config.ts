import { defineConfig, mergeConfig } from 'vite'
import base from '../../vite.config'
export default mergeConfig(base, defineConfig({
  server: {
    host: '127.0.0.1', port: 5187, strictPort: true, https: undefined,
    proxy: { '/socket.io': { target: 'http://100.69.226.19:8080', ws: true, changeOrigin: true } },
  },
}))
