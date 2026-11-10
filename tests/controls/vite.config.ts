import { defineConfig, mergeConfig } from 'vite'
import base from '../../vite.config'
const config = mergeConfig(base, defineConfig({ server: { host: '127.0.0.1', port: 5195, strictPort: true } }))
config.server!.https = undefined
config.server!.proxy = {}
export default config
