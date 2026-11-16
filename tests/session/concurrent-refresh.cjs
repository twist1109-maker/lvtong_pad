// 两个真实生产页面 + 真实草稿REST/WS + 临时数据库；禁止现场视频/设备控制。
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/13006/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const artifacts = path.join(__dirname, 'artifacts');
fs.mkdirSync(artifacts, { recursive: true });
const photo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const url = 'http://127.0.0.1:5197/tests/session/';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const pc = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const pad = await browser.newPage({ viewport: { width: 1280, height: 800 }, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 13; Tablet) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36' });
    const errors = [], patches = [], conflicts = [];
    for (const page of [pc, pad]) {
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => { if (response.url().includes('inspection-session') && response.status() === 409) conflicts.push(response.status()); });
      await page.route('**/mtx/**', route => route.fulfill({ status: 503 }));
      await page.route('**/api/inspection/plate/*', route => route.fulfill({ json: { code: 0, data: { count: 0 } } }));
      await page.route(/\/api\/(?:booking\/(?:open|accept|reject)|device\/(?:control|radiation))/, route => { errors.push('unexpected device request ' + route.request().url()); return route.abort(); });
    }
    let mode = '', held, release;
    await pad.route('**/api/inspection-session/current', async route => {
      if (route.request().method() !== 'PATCH') return route.continue();
      patches.push(route.request().postDataJSON());
      if (mode === 'offline') return route.abort('failed');
      if (mode === 'hold') {
        mode = ''; held = true;
        await new Promise(resolve => { release = resolve });
      }
      return route.continue();
    });
    const until = async (check, label) => {
      const deadline = Date.now() + 15000;
      while (!(await check())) {
        if (Date.now() > deadline) throw new Error('timeout: ' + label);
        await pad.waitForTimeout(40);
      }
    };
    const synced = async page => (await page.locator('.session-sync-status').innerText()) === '已同步';
    const phone = page => page.getByPlaceholder('请输入11位手机号');
    const thumbs = page => page.locator('.capture-btn[title="货物"] img');
    const addPhoto = async page => {
      await page.locator('.capture-btn[title="货物"]').click();
      const choose = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: '本地相机', exact: true }).click();
      await (await choose).setFiles({ name: 'manual.png', mimeType: 'image/png', buffer: photo });
      await page.getByRole('button', { name: '确认选择', exact: true }).click();
    };
    const outbox = () => pad.evaluate(async () => {
      const request = indexedDB.open('lvtong-inspection-outbox', 1);
      const db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = reject });
      const rows = await new Promise((resolve, reject) => { const get = db.transaction('drafts').objectStore('drafts').getAll(); get.onsuccess = () => resolve(get.result); get.onerror = reject });
      db.close(); return rows;
    });
    await pc.goto(url); await pc.locator('.session-restore-mask').waitFor({ state: 'hidden' });
    await pc.request.post('http://127.0.0.1:5198/fixture/begin');
    await pad.goto(url); await pad.locator('.session-restore-mask').waitFor({ state: 'hidden' });
    await until(async () => await synced(pc) && await synced(pad), 'initial sync');

    // 自动回填 + 自动抓拍先到，再人工改同一字段；主动采用收到的最新版本。
    await pc.request.post('http://127.0.0.1:5198/fixture/automatic', { data: { phone: '13800000000', kind: 'head' } });
    await until(async () => await phone(pad).inputValue() === '13800000000', 'automatic fill');
    await phone(pad).fill('13712345678');
    await addPhoto(pad);
    await until(async () => await phone(pc).inputValue() === '13712345678' && await thumbs(pc).count() === 2 && await synced(pad), 'manual after automatic');

    // 人工字段请求已发出但尚未处理，PC同时改同一字段，制造生产后端真实409。
    mode = 'hold'; await phone(pad).fill('13612345678');
    await until(() => held, 'held Pad patch');
    await phone(pc).fill('13912345678');
    await until(async () => await synced(pc), 'PC concurrent edit');
    assert.equal(await phone(pad).inputValue(), '13612345678', 'pending input remains visible');
    release();
    await until(async () => await synced(pad) && await phone(pc).inputValue() === '13612345678', 'real conflict recovery');
    assert.equal(conflicts.length, 1);

    // Pad新字段+新blob照片上传失败，落入真实IndexedDB后刷新，随后自动续传。
    mode = 'offline';
    await phone(pad).fill('13512345678');
    // 使用另一张真实像素不同的照片，服务端内容去重不能掩盖丢图。
    await pad.locator('.capture-btn[title="货物"]').click();
    const choose = pad.waitForEvent('filechooser');
    await pad.getByRole('button', { name: '本地相机', exact: true }).click();
    const nextPhoto = await pad.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 16; const ctx = c.getContext('2d'); ctx.fillStyle = '#cc8855'; ctx.fillRect(0,0,16,16); return c.toDataURL().split(',')[1]; });
    await (await choose).setFiles({ name: 'second.png', mimeType: 'image/png', buffer: Buffer.from(nextPhoto, 'base64') });
    await pad.getByRole('button', { name: '确认选择', exact: true }).click();
    await until(async () => (await outbox()).some(row => row.draft.changes.some(c => c.path.join('.') === 'form.phone' && c.value === '13512345678') && row.draft.changes.some(c => c.path.join('.') === 'captureLists.goods' && c.value.length === 3 && c.value.some(v => v.startsWith('data:image/')))), 'durable field and blob contents');
    await until(async () => (await pad.locator('.session-sync-status').innerText()).includes('未同步'), 'upload failure');
    assert.equal(await phone(pc).inputValue(), '13612345678');
    await pad.reload(); await pad.locator('.session-restore-mask').waitFor({ state: 'hidden' });
    assert.equal(await phone(pad).inputValue(), '13512345678');
    assert.equal(await thumbs(pad).count(), 3);
    mode = ''; await pad.evaluate(() => window.dispatchEvent(new Event('online')));
    await until(async () => await synced(pad) && await phone(pc).inputValue() === '13512345678' && await thumbs(pc).count() === 3, 'refresh auto recovery');
    await until(async () => (await outbox()).length === 0, 'ack clears outbox');
    await pc.reload(); await pc.locator('.session-restore-mask').waitFor({ state: 'hidden' });
    assert.equal(await phone(pc).inputValue(), '13512345678'); assert.equal(await thumbs(pc).count(), 3);
    const sources = await thumbs(pc).evaluateAll(images => images.map(i => i.getAttribute('src')));
    assert.equal(new Set(sources).size, 3); assert.ok(sources.every(src => src.includes('/api/images/')));

    // 暂存内容不能带到下一辆车；即使断线未确认，收到新会话也必须清除。
    mode = 'offline'; await phone(pad).fill('13412345678');
    await until(async () => (await outbox()).length === 1, 'old vehicle durable');
    await pc.request.post('http://127.0.0.1:5198/fixture/begin');
    await until(async () => await phone(pad).inputValue() !== '13412345678' &&
      !(await outbox()).some(row => row.draft.changes.some(c => c.path.join('.') === 'form.phone' && c.value === '13412345678')), 'old vehicle isolated');
    mode = '';
    await pad.screenshot({ path: path.join(artifacts, 'pad-refresh-recovered.png') });
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(artifacts, 'concurrent-refresh.json'), JSON.stringify({ realConflicts: conflicts.length, padPatches: patches.length, photosAfterRefresh: sources.length, errors }, null, 2));
    console.log('PASS 自动采集后人工照片/字段、真实同字段409、双端一致、字段和blob照片断线刷新恢复、ACK清理、旧车暂存隔离；pageerrors=0');
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) });
