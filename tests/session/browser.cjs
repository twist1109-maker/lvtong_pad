// 先启动README中的两个本机隔离服务；不连接现场设备或现场数据库。
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/13006/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const artifacts = path.join(__dirname, 'artifacts');
fs.mkdirSync(artifacts, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-webgl', '--enable-unsafe-swiftshader'] });
  try {
    const errors = [], bookingActions = [], padConnections = [], dialogs = [];
    const pcCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const padCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; Tablet) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36' });
    const pc = await pcCtx.newPage(), pad = await padCtx.newPage();
    pad.on('websocket', ws => ws.on('framereceived', ({payload}) => {
      if (typeof payload === 'string' && payload.includes('fixture_connection')) padConnections.push(payload);
    }));
    for (const p of [pc, pad]) {
      p.on('pageerror', e => errors.push(e.message));
      p.on('request', r => { if (/\/api\/booking\/(open|accept|btn-press)$/.test(r.url())) bookingActions.push(r.url()); });
      await p.route('**/mtx/**', r => r.fulfill({ status: 503, body: 'isolated camera' }));
      p.on('dialog', d => { dialogs.push(d.message()); return d.accept(); });
    }
    const url = 'http://127.0.0.1:5197/tests/session/';
    await pc.goto(url); await pc.locator('.session-restore-mask').waitFor({ state: 'hidden' });
    await pc.request.post('http://127.0.0.1:5198/fixture/begin');
    await pc.getByPlaceholder('请输入11位手机号').fill('13812345678');
    await pc.getByPlaceholder('出口称重（kg）').fill('1234');
    await pc.waitForTimeout(800);
    // 先进入真实登录页，已有匿名WS；登录后必须重新认证，不能只验证预填token的页面。
    await pad.goto(url + '?login=1#/login');
    await pad.waitForFunction(() => document.querySelector('.login-page'));
    await pad.waitForTimeout(300);
    assert.ok(padConnections.some(v => v.includes('"authenticated":false')));
    await pad.getByPlaceholder('请输入查验人账号').fill('sync-test');
    await pad.getByPlaceholder('请输入密码').fill('fixture-password');
    await pad.locator('.btn-login').click();
    await pad.locator('.session-restore-mask').waitFor({ state: 'hidden' });
    await pad.waitForTimeout(300);
    assert.ok(padConnections.some(v => v.includes('"authenticated":true')), '登录后仍使用匿名WS，不能接收共享会话');
    assert.equal(await pad.getByPlaceholder('请输入11位手机号').inputValue(), '13812345678');
    assert.equal(await pad.getByPlaceholder('出口称重（kg）').inputValue(), '1234');
    await pc.getByTitle('检测进行中，请提交或重置后再预约', { exact: true }).click();
    assert.deepEqual(dialogs, ['当前处于检测流程中，请提交或重置后再预约']);
    dialogs.length = 0;
    for (const includeOpenDialog of [true, false]) {
      await pc.request.post('http://127.0.0.1:5198/fixture/hardware-booking', { data: { includeOpenDialog } });
      await pc.waitForTimeout(150);
      assert.deepEqual(dialogs, [], '硬件预约反馈不能弹页面点击专用提示');
    }
    assert.deepEqual(bookingActions, []);
    assert.equal(await pc.getByRole('dialog', { name: '预约处理' }).count(), 0);
    // Pad新增一张本地照片，生产草稿接口负责落盘和实时同步。
    await pad.locator('.capture-btn[title="货物"]').click();
    const chooser = pad.waitForEvent('filechooser');
    await pad.getByRole('button', { name: '本地相机', exact: true }).click();
    await (await chooser).setFiles({ name: 'pad-photo.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') });
    await pad.getByRole('button', { name: '确认选择', exact: true }).click();
    await pc.waitForFunction(() => document.querySelectorAll('.capture-btn[title="货物"] img').length === 2);
    await pad.getByPlaceholder('请输入11位手机号').fill('13912345678');
    await pc.waitForFunction(() => document.querySelector('input[placeholder="请输入11位手机号"]').value === '13912345678');
    await pc.reload(); await pc.locator('.session-restore-mask').waitFor({ state: 'hidden' });
    assert.equal(await pc.locator('.capture-btn[title="货物"] img').count(), 2);
    // 车身框选→右侧预览→勾选追加货物，原照片不能被覆盖。
    const body = pc.locator('.panel-left>.panel-card').first();
    await body.locator('.body-image').waitFor();
    const box = await body.locator('.body-image').boundingBox(); assert.ok(box);
    await pc.mouse.move(box.x + box.width * .2, box.y + box.height * .25);
    await pc.mouse.down(); await pc.mouse.move(box.x + box.width * .55, box.y + box.height * .75, { steps: 8 }); await pc.mouse.up();
    await pc.getByTitle('追加到货物照', { exact: true }).click();
    await pad.waitForFunction(() => document.querySelectorAll('.capture-btn[title="货物"] img').length === 3);
    await pad.locator('.capture-btn[title="证据照"]').click();
    const picker = pad.getByRole('dialog', { name: '选择证据照' });
    await picker.locator('input[type=checkbox]:enabled').first().check();
    await picker.getByRole('button', { name: '追加到证据照', exact: true }).click();
    await pc.waitForFunction(() => document.querySelectorAll('.capture-btn[title="证据照"] img').length === 1);
    await body.locator('.header-icon-swap').click();
    await pc.locator('.body-cloud-3d[data-ready=true]').waitFor();
    assert.ok((await pc.locator('.cloud-dimensions').innerText()).includes('4.404'));
    await pc.screenshot({ path: path.join(artifacts, 'pc-synced.png') });
    await pad.screenshot({ path: path.join(artifacts, 'pad-synced.png') });
    // 删除透视图与查验结果选择也必须跟随会话恢复。
    await pc.getByTitle('不合格透视图删除', { exact: true }).click();
    await pc.getByRole('button', { name: '是(Yes)', exact: true }).click();
    await pad.waitForFunction(() => !document.querySelectorAll('.panel-left>.panel-card')[1].querySelector('.body-image'));
    await pad.locator('.form-footer .btn-confirm').click();
    // 固定正交图在两端恢复，预览可直接打开；不依赖当前3D旋转视角。
    await pad.getByRole('button', { name: '顶部', exact: true }).waitFor();
    await pad.getByRole('button', { name: '顶部', exact: true }).click();
    await pad.getByText('点云顶部图', { exact: true }).waitFor();
    await pad.screenshot({ path: path.join(artifacts, 'cloud-top-preview.png') });
    await pad.keyboard.press('Escape');
    await pad.locator('.detail-dialog .result-select').selectOption('1');
    await pad.locator('.session-sync-status').filter({ hasText: '已同步' }).waitFor();
    // 使用真实提交预览和提交路径，验证两新图片字段、备注、照片列表均传到后端。
    await pc.locator('.form-footer .btn-confirm').click();
    assert.equal(await pc.locator('.detail-dialog .result-select').inputValue(), '1');
    await pc.locator('.detail-dialog .result-select').selectOption('0');
    await pc.getByLabel('备注内容', { exact: true }).fill('PC与Pad同步验收');
    await pc.locator('.detail-dialog .btn-modify').click();
    await pc.locator('.session-sync-status').filter({ hasText: '已同步' }).waitFor();
    await pc.waitForFunction(() => document.querySelectorAll('.capture-btn[title="货物"] img').length === 0);
    await pad.waitForFunction(() => document.querySelectorAll('.capture-btn[title="货物"] img').length === 0);
    await pad.locator('.detail-dialog').waitFor({ state: 'hidden' });
    const records = await (await pc.request.get('http://127.0.0.1:5198/fixture/submissions')).json();
    assert.equal(records.length, 1);
    const record = records[0];
    assert.ok(record.appointment_radar_image_path); assert.ok(record.radar_3d_image_path);
    assert.ok(record.radar_3d_top_image_path); assert.ok(record.radar_3d_side_image_path);
    const views = {};
    for (const key of ['radar_3d_top_image_path', 'radar_3d_side_image_path']) {
      const relative = record[key].replaceAll('\\', '/').split('/images/')[1];
      assert.ok(relative);
      const response = await pc.request.get('http://127.0.0.1:5197/api/images/' + relative);
      assert.equal(response.status(), 200);
      views[key] = await response.body();
      assert.equal(views[key].subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    }
    assert.notDeepEqual(views.radar_3d_top_image_path, views.radar_3d_side_image_path);
    assert.ok(record.license_image_path);
    assert.equal(record.history_record, 'PC与Pad同步验收');
    assert.equal(record.goods_image_path.split('|').length, 3);
    assert.equal(record.evidences_image_path.split('|').length, 1);
    for (const old of ['radar_top_image_path', 'radar_side_image_path', 'radar_head_image_path']) assert.equal(record[old], undefined);
    fs.writeFileSync(path.join(artifacts, 'submission.json'), JSON.stringify(record, null, 2));
    // 两终端恢复同一预约红线草稿，不能重复触发open或其他设备动作。
    await pc.request.post('http://127.0.0.1:5198/fixture/booking');
    await pc.getByRole('dialog', { name: '预约处理' }).waitFor();
    await pad.getByRole('dialog', { name: '预约处理' }).waitFor();
    assert.ok((await pad.locator('.booking-dialog').innerText()).includes('4.00米'));
    assert.deepEqual(bookingActions, []);
    assert.deepEqual(errors, []);
    console.log('PASS 匿名WS→真实登录→重新认证并持续同步、PC→Pad恢复、照片追加、证据选择、3D恢复、顶部预览、三张点云图提交且顶部/侧面有效PNG并不同、透视删除同步、查验选择同步、备注保存、双端重置、预约草稿无重复动作、检测中预约零请求；pageerrors=0');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
