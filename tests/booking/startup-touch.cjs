const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/13006/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const lineChecks = [], errors = [];
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      // 特意让缓存图先解码、布局测量后到，复现默认区域→真实图片区域的跳动窗口。
      const Observer = window.ResizeObserver;
      window.ResizeObserver = class extends Observer {
        constructor(callback) { super((entries, observer) => setTimeout(() => callback(entries, observer), 120)); }
      };
      window.lineSamples = [];
      const sample = () => { const line = document.querySelector('.radar-line'); if (line) window.lineSamples.push(line.getBoundingClientRect().x); requestAnimationFrame(sample) };
      requestAnimationFrame(sample);
    });
    for (const [width, height, query] of [[1920,1080,'?fast=1'],[1280,800,'?fast=1'],[768,1024,'?fast=1'],[1366,768,'?fast=1&wide=1']]) {
      await page.setViewportSize({ width, height });
      await page.goto('http://127.0.0.1:5186/tests/booking/preview.html' + query);
      await page.locator('.radar-line').waitFor(); await page.waitForTimeout(400);
      const spread = await page.evaluate(() => Math.max(...window.lineSamples) - Math.min(...window.lineSamples));
      assert.ok(spread < .1, `cached startup line jumped ${spread}px`);
      const before = await page.locator('.radar-line').boundingBox();
      await page.evaluate(() => { window.lineSamples = [] });
      await page.getByRole('button', { name: '恢复当前分割线', exact: true }).click();
      await page.locator('.radar-line').waitFor(); await page.waitForTimeout(400);
      const after = await page.locator('.radar-line').boundingBox();
      assert.ok(Math.abs(before.x - after.x) < .1);
      assert.ok(await page.evaluate(() => Math.max(...window.lineSamples) - Math.min(...window.lineSamples) < .1));
      lineChecks.push({ width, height, spread });
    }
    const pad = await browser.newPage({ viewport: { width: 1280, height: 800 }, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 13; Tablet) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36' });
    pad.on('pageerror', error => errors.push(error.message));
    await pad.route('**/mtx/**', route => route.fulfill({ status: 503 }));
    await pad.goto('http://127.0.0.1:5197/tests/session/');
    await pad.locator('.session-restore-mask').waitFor({ state: 'hidden' });
    const guard = await pad.evaluate(() => {
      const app = document.querySelector('#app'), input = document.querySelector('input[placeholder="请输入11位手机号"]');
      const dispatched = (target, type) => target.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
      const scroll = document.createElement('div'); scroll.id = 'touch-scroll-test'; scroll.style.cssText = 'position:fixed;left:20px;top:20px;width:180px;height:120px;overflow:auto;z-index:999999;background:white';
      const content = document.createElement('div'); content.style.height = '2000px'; content.textContent = 'SCROLL'; scroll.append(content); document.body.append(scroll);
      return { context: dispatched(app, 'contextmenu'), selectText: dispatched(app, 'selectstart'), inputSelect: dispatched(input, 'selectstart'),
        nativeDrag: dispatched(app, 'dragstart'), doubleClick: dispatched(app, 'dblclick'), touch: dispatched(app, 'touchstart'),
        rootTouchAction: getComputedStyle(document.documentElement).touchAction, selection: getComputedStyle(app).userSelect };
    });
    assert.deepEqual(guard, { context: false, selectText: false, inputSelect: true, nativeDrag: false, doubleClick: false, touch: true, rootTouchAction: 'pan-x pan-y', selection: 'none' });
    const cdp = await pad.context().newCDPSession(pad);
    await pad.waitForTimeout(150); // 等滚动层进入合成树后再发送真实手势。
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 100, y: 125 }] });
    for (let y = 115; y >= 35; y -= 10) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 100, y }] });
      await pad.waitForTimeout(20);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await pad.waitForTimeout(100);
    assert.ok(await pad.locator('#touch-scroll-test').evaluate(el => el.scrollTop > 0), 'native list scroll must remain usable');
    await pad.locator('#touch-scroll-test').evaluate(el => el.remove());
    const scale = await pad.evaluate(() => visualViewport.scale);
    await cdp.send('Input.synthesizeTapGesture', { x: 640, y: 30, tapCount: 2, gestureSourceType: 'touch' });
    await cdp.send('Input.synthesizePinchGesture', { x: 640, y: 30, scaleFactor: 1.6, relativeSpeed: 800, gestureSourceType: 'touch' });
    assert.equal(await pad.evaluate(() => visualViewport.scale), scale, 'native gestures must not zoom whole page');
    await pad.getByPlaceholder('请输入11位手机号').fill('13812345678');
    assert.equal(await pad.getByPlaceholder('请输入11位手机号').inputValue(), '13812345678');
    assert.deepEqual(errors, []);
    console.log('PASS 缓存图片先到/布局后到及草稿恢复四尺寸红线稳定、Pad原生菜单/选字/拖图/双击/捏合拦截，输入/触摸事件/列表滚动保留；' + JSON.stringify(lineChecks));
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) });
