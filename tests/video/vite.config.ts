import { defineConfig, mergeConfig } from 'vite'
import base from '../../vite.config'

const config = mergeConfig(base, defineConfig({
  server: {host:'127.0.0.1',port:5188,strictPort:true,proxy:{}},
}))
config.server!.https = undefined
config.server!.proxy = {
  '/mtx': {target:'http://127.0.0.1:18889',changeOrigin:true,rewrite:path=>path.replace(/^\/mtx/,'')},
  '/site-mtx': {target:'http://100.69.226.19:5173',changeOrigin:true,rewrite:path=>path.replace(/^\/site-mtx/,'/mtx'),timeout:45000,proxyTimeout:45000},
}
export default config
