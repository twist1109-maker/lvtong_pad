// 启动后端tests/geometry_refresh_browser_server.py和前端session Vite；不访问现场。
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/13006/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-webgl', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage(), errors = [], refreshes = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.url().includes('/api/device/body-radar-image')) refreshes.push(request.postDataJSON()); });
    await page.route('**/mtx/**', route => route.fulfill({ status: 503 }));
    await page.request.post('http://127.0.0.1:5198/fixture/no-cloud');
    await page.goto('http://127.0.0.1:5197/tests/session/');
    await page.locator('.session-restore-mask').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.app-header .title').innerText(), '高速公路绿通智能快检系统');
    await page.locator('.panel-header-body').getByTitle('切换视角', { exact: true }).click();
    await page.waitForTimeout(200);
    assert.equal((await (await page.request.get('http://127.0.0.1:5198/fixture/laz-requests')).json()).calls, 0);
    await page.getByRole('button', { name: '刷新3D视图' }).click();
    await page.locator('.body-cloud-3d[data-ready="true"]').waitFor();
    assert.match(await page.locator('.cloud-dimensions').innerText(), /4\.404/);
    assert.deepEqual(refreshes, [{ view: 'top', refresh: true }]);
    assert.equal((await (await page.request.get('http://127.0.0.1:5198/fixture/laz-requests')).json()).calls, 1);
    const initial = await page.evaluate(async () => (await (await fetch('/api/inspection-session/current', { headers: { Authorization: 'Bearer ' + sessionStorage.getItem('lvtong_token') } })).json()).data);
    assert.ok(initial.geometryUrl); assert.ok(initial.draft.radarCloudTopImageUrl); assert.ok(initial.draft.radarCloudSideImageUrl);
    await page.reload();
    await page.locator('.session-restore-mask').waitFor({ state: 'hidden' });
    await page.locator('.panel-header-body').getByTitle('切换视角', { exact: true }).click();
    await page.locator('.body-cloud-3d[data-ready="true"]').waitFor();
    assert.equal((await (await page.request.get('http://127.0.0.1:5198/fixture/laz-requests')).json()).calls, 1, '刷新页面只恢复缓存，不重启或重读设备');
    // 拉取失败时保留已加载点云，并明确显示失败。
    await page.route('**/api/device/body-radar-image', route => route.fulfill({ status: 502, json: { code: 502, message: '点云接口尚未返回有效LAZ' } }));
    await page.getByRole('button', { name: '刷新3D视图' }).click();
    await page.locator('.projection-error').waitFor();
    assert.match(await page.locator('.cloud-dimensions').innerText(), /4\.404/);
    await page.goto('http://127.0.0.1:5197/tests/session/?login=1#/login');
    await page.locator('.login-page').waitFor();
    for (const title of await page.locator('h1').allTextContents()) assert.equal(title, '高速公路绿通智能快检系统');
    assert.deepEqual(errors, []);
    console.log('PASS 系统名称、手动刷新真实LAZ解码持久化、页面刷新恢复缓存不重复读设备、失败保留点云；pageerrors=0');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
