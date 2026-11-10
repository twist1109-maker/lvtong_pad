import { defineConfig, mergeConfig } from 'vite'
import base from '../../vite.config'
import { parsePasscode } from '../../src/modules/padCapture/passcode'

// 独立的布局验收入口，不连接现场后端，也不访问真实摄像头。
const config = mergeConfig(base, defineConfig({
  define: { 'import.meta.env.VITE_USE_MOCK': JSON.stringify('true') },
  server: {
    host: '127.0.0.1',
    port: 5186,
    strictPort: true,
    https: undefined,
    proxy: {},
  },
  plugins: [{
    name: 'layout-fixtures',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/api/')) {
          res.setHeader('Content-Type', 'application/json');
          if (req.url.startsWith('/api/dict/products')) {
            const params = new URL(req.url, 'http://127.0.0.1').searchParams
            const keyword = (params.get('keyword') || '').trim().toLowerCase()
            const type = params.get('product_type')
            const items = [
              { product_code: '10101', variety_name: '大白菜', variety_name_pinyin: 'DBC', product_type: '新鲜蔬菜', category: '蔬菜' },
              { product_code: '10402', variety_name: '菠菜', variety_name_pinyin: 'BC', product_type: '新鲜蔬菜', category: '蔬菜' },
              { product_code: '20101', variety_name: '苹果', variety_name_pinyin: 'PG', product_type: '新鲜水果', category: '水果' },
            ].filter(p => (!type || p.product_type === type) && (!keyword || p.variety_name.includes(keyword) || p.variety_name_pinyin.toLowerCase().includes(keyword)))
            res.end(JSON.stringify({ code: 0, data: { items, total: items.length } }))
            return
          }
          if (req.url.startsWith('/api/dict/stations/')) {
            const stationId = decodeURIComponent(req.url.split('/').pop() || '')
            res.end(JSON.stringify({ code: 0, data: { station_name: stationId === 'S4203510010110' ? '测试入口站' : '测试出口站' } }))
            return
          }
          if (req.url.startsWith('/api/dict/truck-types') || req.url.startsWith('/api/dict/container-types')) {
            const type = req.url.includes('truck-types') ? '6轴货车' : '厢式'
            res.end(JSON.stringify({ code: 0, data: [{ type_code: type, type_name: type }] }))
            return
          }
          if (req.url.startsWith('/api/mobile/upload/json')) {
            let body = ''
            req.setEncoding('utf8')
            req.on('data', chunk => { body += chunk })
            req.on('end', () => {
              const payload = body.match(/\r\n\r\n(\{[^\r\n]+\})\r\n/)
              let valid = false
              try { valid = !!parsePasscode(JSON.parse(payload?.[1] || '{}').passcodeQRCodeInfo || '') } catch { /* 无效 multipart */ }
              res.statusCode = valid ? 200 : 400
              res.end(JSON.stringify({ code: valid ? 0 : 400, message: valid ? '上传协议验证通过' : '无效通行码上传' }))
            })
            return
          }
          if (req.url.startsWith('/api/inspection/plate/')) {
            res.end(JSON.stringify({ code: 0, data: { count: 3, driver_phone: '13800000000', gc_plate: '鄂A12345挂', vehicle_type: '6轴货车', vehicle_container_type: '厢式', vehicle_size: '6000|2500|3500' } }))
            return
          }
          res.end(JSON.stringify({ code: 0, message: 'layout fixture', data: [] }));
        } else if (req.url?.startsWith('/mtx/')) {
          res.statusCode = 503;
          res.end('Layout fixture: network cameras are offline');
        } else next();
      });
    },
  }],
}))

// mergeConfig 会保留被 undefined 覆盖的值，需显式移除生产代理和 TLS。
config.server!.https = undefined
config.server!.proxy = {}
export default config
