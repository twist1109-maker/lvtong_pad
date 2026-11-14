// 仅启动 tests/session/vite.config.ts；REST和Socket.IO由浏览器隔离，不访问数据库/设备。
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/13006/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const clone = value => JSON.parse(JSON.stringify(value));
const pc = { valid: true, vehicleDisplayId: '鄂E45781', vehicleId: '鄂E45781_2', passId: 'history-test', exTime: '2026-11-14 12:00:00', exWeight: '3000' };
const history = { count: 1, driver_phone: '13812345678', gc_plate: '鄂A12345挂', vehicle_type: '14', vehicle_container_type: '3.1', vehicle_size: '20000|2000|3000', license_image_path: '/api/images/history.jpg', earliest_time: '2026-11-13T13:30:32', latest_time: '2026-11-13T13:30:32' };
const fresh = (id, plate = '--') => ({ sessionId: id, revision: 1, phase: 'detecting', booking: { is_detection: true, check_step: 2 }, workflow: { step: 2 }, draft: { form: { plate, phone: '', plateGc: '--', truckType: '', containerType: '', size: '', historyCount: '--' }, passcode: plate === '--' ? null : pc } });

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (process.env.DEBUG_HISTORY) console.log(message.type(), message.text()); });
    let snapshot = fresh('first'), socket, connected = false;
    let queries = 0, hold = false, held = [];
    const send = (type, data) => socket.send('42' + JSON.stringify(['message', { type, data }]));
    const sendSnapshot = next => { next.revision = snapshot.revision + 1; snapshot = clone(next); send('inspection_session', snapshot); };
    const respond = route => route.fulfill({ json: { code: 0, data: history } });
    await page.routeWebSocket(/\/socket\.io\/?\?/, ws => {
      if (process.env.DEBUG_HISTORY) console.log('WS', ws.url());
      socket = ws; connected = false;
      ws.send('0' + JSON.stringify({ sid: 'isolated', upgrades: [], pingInterval: 60000, pingTimeout: 60000 }));
      ws.onMessage(message => { if (process.env.DEBUG_HISTORY) console.log('WS MESSAGE', String(message)); if (String(message).startsWith('40')) { ws.send('40{"sid":"isolated"}'); connected = true; } });
    });
    await page.route('**/fixture/token', route => route.fulfill({ json: { token: 'isolated-history' } }));
    await page.route('**/mtx/**', route => route.fulfill({ status: 503 }));
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (!path.startsWith('/api/')) return route.fallback();
      let data = [];
      if (path.startsWith('/api/images/')) return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') });
      if (path.startsWith('/api/inspection/plate/')) {
        queries++;
        if (hold) { held.push(route); return; }
        return respond(route);
      }
      if (path === '/api/inspection-session/current') {
        if (route.request().method() === 'PATCH') {
          for (const { path, value } of route.request().postDataJSON().changes) {
            if (path.length === 1) snapshot.draft[path[0]] = value;
            else (snapshot.draft[path[0]] ||= {})[path[1]] = value;
          }
          snapshot.revision++;
        }
        data = snapshot;
      } else if (path === '/api/dict/truck-types') data = [{ type_code: '14', type_name: '历史车型' }];
      else if (path === '/api/dict/container-types') data = [{ type_code: '3.1', type_name: '历史货箱' }];
      else if (path.includes('device/')) data = { sensors: [], fresh: true };
      return route.fulfill({ json: { code: 0, data } });
    });
    const until = async predicate => {
      for (let i = 0; i < 100; i++) { if (await predicate()) return; await page.waitForTimeout(50); }
      throw new Error('等待历史回填超时');
    };
    await page.goto('http://127.0.0.1:5197/tests/session/');
    await page.locator('.session-restore-mask').waitFor({ state: 'hidden' });
    await until(() => connected);
    // 现场顺序：先共享快照，后扫码通知。两条消息不能一起被“重复扫码”过滤。
    hold = true;
    sendSnapshot(fresh('first', pc.vehicleDisplayId));
    send('mobile_passcode', pc);
    await until(() => held.length === 1);
    assert.equal(queries, 1, '同一会话同一车牌的在途查询应合并');
    hold = false; await respond(held.shift());
    await until(async () => await page.getByPlaceholder('请输入11位手机号').inputValue() === history.driver_phone);
    assert.equal(await page.getByTitle('查看该车查验历史').innerText(), '1');
    assert.deepEqual(await page.locator('.panel-form select').evaluateAll(nodes => nodes.map(n => n.value)), ['14', '3.1']);
    assert.match(await page.getByPlaceholder('请输入外轮廓长宽高').inputValue(), /20/);
    assert.equal(await page.locator('.capture-btn[title="行驶证"] img').count(), 1);
    // 只收到共享快照、刷新恢复均需补查；已有人工电话不能被覆盖。
    const restored = fresh('restore', pc.vehicleDisplayId);
    restored.draft.form.phone = '13900000000';
    sendSnapshot(restored);
    await until(() => queries === 2);
    await until(async () => await page.getByTitle('查看该车查验历史').innerText() === '1');
    assert.equal(await page.getByPlaceholder('请输入11位手机号').inputValue(), '13900000000');
    await page.waitForTimeout(500);
    snapshot = fresh('reload', pc.vehicleDisplayId);
    await page.reload();
    await until(() => queries === 3);
    await until(async () => await page.getByPlaceholder('请输入11位手机号').inputValue() === history.driver_phone);
    // 反向顺序：扫码通知先到也能回填。
    await until(() => connected);
    sendSnapshot(fresh('scan-first'));
    await until(async () => await page.getByPlaceholder('请输入11位手机号').inputValue() === '');
    send('mobile_passcode', pc);
    // 生产以共享会话为准，独立通知不改表单；随后到达的快照必须触发历史查询。
    sendSnapshot(fresh('scan-first', pc.vehicleDisplayId));
    await until(async () => await page.getByPlaceholder('请输入11位手机号').inputValue() === history.driver_phone);
    // 上辆车的迟到响应不能写入同车牌的新会话。
    hold = true;
    sendSnapshot(fresh('old', pc.vehicleDisplayId));
    await until(() => held.length === 1);
    sendSnapshot(fresh('new', pc.vehicleDisplayId));
    await until(() => held.length === 2);
    await respond(held.shift());
    await page.waitForTimeout(100);
    assert.equal(await page.getByPlaceholder('请输入11位手机号').inputValue(), '');
    hold = false; await respond(held.shift());
    await until(async () => await page.getByPlaceholder('请输入11位手机号').inputValue() === history.driver_phone);
    assert.deepEqual(errors, []);
    console.log('PASS 快照先到/扫码先到、在途合并、仅快照、刷新恢复、已有值保留、同车牌跨会话迟到响应隔离；pageerrors=0');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
