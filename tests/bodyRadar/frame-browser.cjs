// 真实生产组件：慢帧/积压帧/框选/清空隔离验证，不连接任何设备。
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/13006/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '../..');
const out = path.join(__dirname, 'artifacts/frame-display');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const { createServer } = await import(pathToFileURL(root + '/node_modules/vite/dist/node/index.js'));
  const vue = (await import(pathToFileURL(root + '/node_modules/@vitejs/plugin-vue/dist/index.mjs'))).default;
  const source = `import {createApp,h,ref,nextTick} from 'vue';
import Panel from '/src/components/BodyPointCloudPanel.vue';
const frame=ref({url:'',source:''});
window.setFrame=async (url,source=url)=>{frame.value={url,source};await nextTick()};
window.crops=[];window.captureErrors=[];
createApp({setup:()=>()=>h('div',{id:'frame-host',style:'width:900px;height:300px;display:flex;flex-direction:column;overflow:hidden'},[h(Panel,{imageUrl:frame.value.url,sourceTempUrl:frame.value.source,view:'body',captureMode:true,onCrop:p=>window.crops.push(p),onCaptureError:e=>window.captureErrors.push(e)})])}).mount('#app');
window.probeReady=true;`;
  const server = await createServer({ root, configFile: false, resolve: { alias: { '@': root + '/src' } },
    plugins: [vue(), { name: 'isolated-frame-test', resolveId(id) { if (id === '/__frame_test.ts') return id }, load(id) { if (id === '/__frame_test.ts') return source }, configureServer(s) { s.middlewares.use((req, res, next) => { if (req.url !== '/diagnostic') return next(); res.setHeader('Content-Type', 'text/html'); res.end('<html><body><div id="app"></div><script type="module" src="/__frame_test.ts"></script></body></html>') }) } }],
    server: { host: '127.0.0.1', port: 5199, strictPort: true } });
  await server.listen();
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:5199/diagnostic');
    await page.waitForFunction(() => window.probeReady);
    const images = await page.evaluate(() => [400, 200, 1000].map(h => { const c = document.createElement('canvas'); c.width = 1600; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#cbe8dd'; x.fillRect(0, 0, 1600, h); x.fillStyle = '#27624b'; x.font = '70px sans-serif'; x.fillText('BODY XRAY SCAN', 60, 160); return c.toDataURL('image/png').split(',')[1] }));
    await page.route('**/frame-*.png', async r => {
      const url = r.request().url();
      if (url.includes('slow')) await new Promise(resolve => setTimeout(resolve, 500));
      if (url.includes('bad')) { await r.fulfill({ status: 404 }); return }
      await r.fulfill({ contentType: 'image/png', body: Buffer.from(images[url.includes('tall') ? 2 : url.includes('wide') ? 1 : 0], 'base64') });
    });
    const waitFrame = url => page.waitForFunction(url => document.querySelector('.body-image')?.getAttribute('src') === url, url);
    const geometry = () => page.evaluate(() => { const f = document.querySelector('.fit'), s = document.querySelector('.stage'), i = document.querySelector('.body-image'), fr = f.getBoundingClientRect(), sr = s.getBoundingClientRect(); return { fit: [f.clientWidth, f.clientHeight], stage: [s.clientWidth, s.clientHeight], centerOffset: [(fr.left + fr.right - sr.left - sr.right) / 2, (fr.top + fr.bottom - sr.top - sr.bottom) / 2], src: i.getAttribute('src'), complete: i.complete } });
    const assertCentered = state => assert.ok(state.centerOffset.every(n => Math.abs(n) <= 1), JSON.stringify(state));
    await page.evaluate(() => window.setFrame('/frame-first.png', '/original-first'));
    await waitFrame('/frame-first.png');
    await page.waitForTimeout(170);
    const initial = await geometry();
    assert.deepEqual(initial.fit, [900, 225]);
    assertCentered(initial);
    await page.evaluate(() => { window.samples = []; function sample() { const f = document.querySelector('.fit'), s = document.querySelector('.stage'), i = document.querySelector('.body-image'); if (f && s && i) window.samples.push({ fit: [f.clientWidth, f.clientHeight], stage: [s.clientWidth, s.clientHeight], complete: i.complete, src: i.getAttribute('src') }); requestAnimationFrame(sample) } sample() });
    await page.evaluate(() => window.setFrame('/frame-slow-same.png'));
    await page.waitForTimeout(200);
    const duringLoading = await geometry();
    assert.deepEqual(duringLoading.fit, initial.fit);
    assertCentered(duringLoading);
    assert.equal(duringLoading.src, '/frame-first.png');
    await page.screenshot({ path: out + '/slow-frame-retained.png' });
    await waitFrame('/frame-slow-same.png');
    // 后续输入合并为最新一帧，不堆积、不因持续新帧取消所有在途解码。
    await page.evaluate(() => window.setFrame('/frame-slow-next.png'));
    await page.waitForTimeout(60);
    await page.evaluate(() => window.setFrame('/frame-skip.png'));
    await page.evaluate(() => window.setFrame('/frame-wide-latest.png'));
    await waitFrame('/frame-wide-latest.png');
    await page.waitForTimeout(200);
    const wide = await geometry(); assert.deepEqual(wide.fit, [900, 112]);
    assertCentered(wide);
    const samples = await page.evaluate(() => window.samples);
    assert.ok(samples.every(s => s.complete && s.fit[0] <= s.stage[0] && s.fit[1] <= s.stage[1]));
    assert.ok(!samples.some(s => s.src === '/frame-skip.png'));
    await page.screenshot({ path: out + '/wide-frame-fitted.png' });
    // 高度限制时左右留白均分，覆盖PC截图中明显偏左的布局。
    await page.evaluate(() => window.setFrame('/frame-tall.png'));
    await waitFrame('/frame-tall.png'); await page.waitForTimeout(180);
    const tall = await geometry(); assert.deepEqual(tall.fit, [476, 298]); assertCentered(tall);
    await page.screenshot({ path: out + '/height-limited-centered.png' });
    // 框选期间即便新帧已就绪，裁切仍使用手势开始时的原图和尺寸。
    await page.evaluate(() => window.setFrame('/frame-select.png', '/original-selected'));
    await waitFrame('/frame-select.png'); await page.waitForTimeout(180);
    const box = await page.locator('.fit').boundingBox();
    await page.mouse.move(box.x + box.width * .2, box.y + box.height * .2); await page.mouse.down();
    await page.evaluate(() => window.setFrame('/frame-wide-during-selection.png', '/original-new'));
    await page.waitForTimeout(200);
    assert.equal((await geometry()).src, '/frame-select.png');
    await page.mouse.move(box.x + box.width * .5, box.y + box.height * .6, { steps: 4 }); await page.mouse.up();
    await waitFrame('/frame-wide-during-selection.png');
    const crop = await page.evaluate(() => { const { fallbackImage, ...p } = window.crops[0]; return p });
    assert.deepEqual(crop, { x1: 320, y1: 80, x2: 800, y2: 240, sourceTempUrl: '/original-selected', displayWidth: 1600, displayHeight: 400 });
    await page.evaluate(() => window.setFrame('/frame-bad.png')); await page.waitForTimeout(150);
    assert.equal((await geometry()).src, '/frame-wide-during-selection.png');
    // 清空后迟到的解码不能复活旧图。
    await page.evaluate(() => window.setFrame('/frame-slow-stale.png'));
    await page.waitForTimeout(80); await page.evaluate(() => window.setFrame(''));
    await page.waitForTimeout(600); assert.equal(await page.locator('.body-image').count(), 0);
    // 生产ScreenScaler会整体transform；屏幕像素不能写回布局CSS尺寸。
    await page.evaluate(() => { const host = document.querySelector('#frame-host'); host.style.transform = 'scale(0.5)'; host.style.transformOrigin = 'left top'; return window.setFrame('/frame-scaled.png', '/original-scaled') });
    await waitFrame('/frame-scaled.png'); await page.waitForTimeout(180);
    assertCentered(await geometry());
    const scaledBox = await page.locator('.fit').boundingBox();
    await page.mouse.move(scaledBox.x + scaledBox.width * .2, scaledBox.y + scaledBox.height * .2); await page.mouse.down();
    await page.mouse.move(scaledBox.x + scaledBox.width * .5, scaledBox.y + scaledBox.height * .6, { steps: 4 }); await page.mouse.up();
    const scaledCrop = await page.evaluate(() => { const { fallbackImage, ...p } = window.crops[1]; return p });
    assert.deepEqual(scaledCrop, { x1: 320, y1: 80, x2: 800, y2: 240, sourceTempUrl: '/original-scaled', displayWidth: 1600, displayHeight: 400 });
    assert.deepEqual(errors, []);
    const report = { initial, duringLoading, wide, tall, sampledFrames: samples.length, noOversizeFrames: true, selection: crop, scaledSelection: scaledCrop, lateFrameCannotReviveClearedPanel: true, errors };
    fs.writeFileSync(out + '/report.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
  } finally { await browser.close(); await server.close() }
})().catch(e => { console.error(e); process.exit(1) });
