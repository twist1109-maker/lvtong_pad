// 启动 npx vite --config tests/layout/vite.config.ts 后运行；不连接真实相机。
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/13006/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.RTCPeerConnection = class {
        iceGatheringState = 'complete';
        addTransceiver() {}
        async createOffer() { return { type: 'offer', sdp: 'v=0\r\n' }; }
        async setLocalDescription(value) { this.localDescription = value; }
        async setRemoteDescription() {
          const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
          canvas.getContext('2d').fillRect(0, 0, 320, 180);
          this.stream = canvas.captureStream(10);
          this.ontrack?.({ streams: [this.stream] });
        }
        getReceivers() { return this.stream?.getTracks().map(track => ({ track })) || []; }
        close() { this.stream?.getTracks().forEach(track => track.stop()); }
      };
    });
    await page.route('**/mtx/**', route => route.fulfill({ status: 201, contentType: 'application/sdp', body: 'v=0\r\n' }));
    let pending, mode = 'normal';
    const photo = async (route) => {
      const device = route.request().url().split('/').pop();
      requests.push(device);
      if (mode === 'delay') { pending = route; return; }
      if (mode === 'fail') return route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ code: 502, message: '主码流拍照失败' }) });
      await respond(route, device);
    };
    async function respond(route, device = 'cam_head') {
      const dataUrl = await page.evaluate((roof) => {
        const canvas = document.createElement('canvas'); canvas.width = roof ? 1280 : 1920; canvas.height = 1080;
        canvas.getContext('2d').fillRect(0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', .95);
      }, device === 'cam_road');
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 0, data: { dataUrl, deviceId: device, streamType: 1 } }) });
    }
    await page.route('**/api/capture/camera/*', photo);
    await page.goto('http://127.0.0.1:5186/tests/layout/?captureBlocked=0#/capture');
    const shutter = page.getByRole('button', { name: '拍照', exact: true });
    for (const [name, device] of [['车头相机','cam_head'], ['车顶相机','cam_road'], ['车尾相机','cam_lane'], ['球机','cam_ptz'], ['预约相机','cam_booking']]) {
      await page.getByRole('button', { name, exact: true }).click();
      await shutter.waitFor();
      await page.waitForFunction(() => !document.querySelector('.btn-capture')?.disabled && document.querySelector('video')?.videoWidth > 0);
      const before = await page.locator('.thumb').count();
      await shutter.click();
      await page.waitForFunction(n => document.querySelectorAll('.thumb').length === n, before + 1);
      assert.equal(requests.at(-1), device);
      await page.waitForFunction(() => document.querySelector('.stage-img')?.naturalHeight === 1080);
      assert.equal(await page.locator('.stage-img').evaluate(img => img.naturalWidth), device === 'cam_road' ? 1280 : 1920);
      assert.equal(await page.locator('video').evaluate(video => video.videoWidth), 320);
    }
    const count = await page.locator('.thumb').count();
    mode = 'fail'; await shutter.click();
    await page.getByText('主码流拍照失败', { exact: true }).waitFor();
    assert.equal(await page.locator('.thumb').count(), count);
    mode = 'delay'; await shutter.click();
    await page.waitForTimeout(100); assert.ok(pending);
    await page.getByRole('button', { name: '车头相机', exact: true }).click();
    await respond(pending); pending = null;
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.thumb').count(), count, '切换相机后不能接收上一相机的迟到图');
    await shutter.click(); await page.waitForTimeout(100); assert.ok(pending);
    await page.getByRole('button', { name: '模拟车道占用', exact: true }).dispatchEvent('click');
    await page.getByRole('button', { name: '模拟解除占用', exact: true }).dispatchEvent('click');
    await respond(pending);
    await page.getByText('采集期间车道状态已变化，已丢弃本次照片，请重新拍照', { exact: true }).waitFor();
    assert.equal(await page.locator('.thumb').count(), count);
    assert.deepEqual(errors, []);
    console.log('PASS 五路拍照独立主码流分辨率；子码流预览；主码流失败不降级；相机切换及车道占用丢弃迟到图');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
