// 仅启动本机 Vite；拦截全部业务请求，重置不会触发数据库或设备。
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/13006/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const clone = value => JSON.parse(JSON.stringify(value));
const fresh = (id, revision, phase = 'detecting') => ({ sessionId: id, revision, phase,
  booking: { is_detection: phase === 'detecting', check_step: phase === 'detecting' ? 2 : 0 },
  workflow: { step: phase === 'detecting' ? 2 : 0 },
  draft: { form: { plate: '--', phone: phase === 'idle' ? '' : '13800000000', weight: '' } } });

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = [], dialogs = [], revisions = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => { dialogs.push(dialog.message()); return dialog.accept(); });
    let snapshot = fresh('first', 1), socket, connected = false;
    let patchMode = '', resetMode = '', resetCount = 0, loadFailures = 0, heldReset;
    const sendSnapshot = () => socket.send('42' + JSON.stringify(['message', { type: 'inspection_session', data: clone(snapshot) }]));
    const until = async (predicate, label) => {
      const deadline = Date.now() + 12000;
      while (Date.now() < deadline) {
        if (await predicate()) return;
        await page.waitForTimeout(50);
      }
      throw new Error('等待超时：' + label);
    };
    const respond = (route, data, status = 200, message = '') => route.fulfill({ status, json: { code: status === 200 ? 0 : status, message, data: clone(data) } });
    await page.routeWebSocket(/\/socket\.io\/?\?/, ws => {
      socket = ws; connected = false;
      ws.send('0' + JSON.stringify({ sid: 'recovery', upgrades: [], pingInterval: 60000, pingTimeout: 60000 }));
      ws.onMessage(message => { if (String(message).startsWith('40')) { ws.send('40{"sid":"recovery"}'); connected = true; } });
    });
    await page.route('**/fixture/token', route => route.fulfill({ json: { token: 'isolated-recovery' } }));
    await page.route('**/mtx/**', route => route.fulfill({ status: 503 }));
    await page.route('**/api/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      if (!path.startsWith('/api/')) return route.fallback();
      if (path === '/api/inspection-session/current') {
        if (request.method() === 'PATCH') {
          const body = request.postDataJSON(); revisions.push(body.revision);
          if (patchMode === 'conflict') {
            patchMode = ''; snapshot.revision += 2; snapshot.draft.form.phone = '13900000000'; snapshot.draft.form.weight = '5678';
            return respond(route, snapshot, 409, '该内容已被其他设备修改，请刷新后核对再操作');
          }
          if (patchMode === 'network') { patchMode = ''; return respond(route, null, 502, '临时断线'); }
          assert.equal(body.sessionId, snapshot.sessionId);
          for (const { path, value } of body.changes) {
            if (path.length === 1) snapshot.draft[path[0]] = value;
            else (snapshot.draft[path[0]] ||= {})[path[1]] = value;
          }
          snapshot.revision++;
        } else if (loadFailures) { loadFailures--; return respond(route, null, 503, '快照暂时不可用'); }
        return respond(route, snapshot);
      }
      if (path === '/api/booking/reset') {
        resetCount++;
        assert.equal(request.headers()['x-inspection-session'], snapshot.sessionId, '重置必须携带核对后的会话');
        if (resetMode === 'hold') { heldReset = route; return; }
        if (resetMode === 'fail') return respond(route, null, 500, '模拟重置失败');
        snapshot = fresh('reset-' + resetCount, snapshot.revision + 1, 'idle');
        if (resetMode === 'lost') return route.abort('failed');
        if (resetMode === 'reload-fail') loadFailures = 1;
        return respond(route, {});
      }
      return respond(route, path.includes('device/') ? { sensors: [], fresh: true } : []);
    });
    const phone = page.getByPlaceholder('请输入11位手机号');
    const status = page.locator('.session-sync-status');
    const reset = page.locator('.btn-reset');
    const confirm = () => page.getByRole('button', { name: '是(Yes)', exact: true }).click();
    await page.goto('http://127.0.0.1:5197/tests/session/');
    await page.locator('.session-restore-mask').waitFor({ state: 'hidden' });
    await until(() => connected, 'WebSocket');

    patchMode = 'conflict';
    await phone.fill('13712345678');
    await until(async () => snapshot.draft.form.phone === '13712345678' && await status.innerText() === '已同步', '冲突自动恢复');
    assert.equal(revisions.at(-1), revisions.at(-2) + 2, '冲突后必须采用新版本号');
    assert.equal(await page.getByPlaceholder('出口称重（kg）').inputValue(), '5678');
    assert.equal(await phone.inputValue(), '13712345678');

    patchMode = 'network';
    await phone.fill('13612345678');
    await until(async () => snapshot.draft.form.phone === '13612345678' && await status.innerText() === '已同步', '断线自动续传');
    // 没有收到WS的更新由定时核对补齐；正常WS仍即时采用。
    snapshot.revision++; snapshot.draft.form.phone = '13512345678';
    await until(async () => await phone.inputValue() === '13512345678', '漏推送自动同步');
    snapshot.revision++; snapshot.draft.form.phone = '13412345678'; sendSnapshot();
    await until(async () => await phone.inputValue() === '13412345678', '实时同步');

    // 打开旧检测的确认框，随后另一端切单：不得重置新检测。
    await reset.click();
    snapshot = fresh('next-vehicle', snapshot.revision + 1);
    await confirm();
    await until(() => dialogs.length === 1, '旧确认拦截');
    assert.match(dialogs.pop(), /检测内容已更新/); assert.equal(resetCount, 0);

    // 重置成功但响应丢失：只读回新会话，不能误报失败或重发设备命令。
    resetMode = 'lost'; await reset.click(); await confirm();
    await until(async () => await phone.inputValue() === '' && await reset.isEnabled(), '丢失响应恢复');
    assert.equal(resetCount, 1); assert.deepEqual(dialogs, []);

    snapshot = fresh('duplicate', snapshot.revision + 1); sendSnapshot();
    await until(async () => await phone.inputValue() === '13800000000', '新检测');
    resetMode = 'hold'; await reset.click(); await confirm();
    await until(() => !!heldReset, '重置请求等待');
    assert.equal(await reset.isDisabled(), true);
    await reset.evaluate(button => { button.click(); button.click(); });
    assert.equal(resetCount, 2, '重复点击不能重复重置');
    snapshot = fresh('held-reset', snapshot.revision + 1, 'idle');
    await respond(heldReset, {}); heldReset = undefined;
    await until(async () => await phone.inputValue() === '' && await reset.isEnabled(), '单次重置结束');

    snapshot = fresh('reload-fail', snapshot.revision + 1); sendSnapshot();
    await until(async () => await phone.inputValue() === '13800000000', '重置前检测');
    resetMode = 'reload-fail'; await reset.click(); await confirm();
    await until(async () => await phone.inputValue() === '' && await status.innerText() === '已同步', '重置后读取失败自动恢复');
    assert.equal(resetCount, 3); assert.deepEqual(dialogs, []);

    snapshot = fresh('genuine-failure', snapshot.revision + 1); sendSnapshot();
    await until(async () => await phone.inputValue() === '13800000000', '失败前检测');
    resetMode = 'fail'; await reset.click(); await confirm();
    await until(() => dialogs.length === 1, '真实失败提示');
    assert.match(dialogs.pop(), /模拟重置失败/);
    assert.equal(await phone.inputValue(), '13800000000', '失败保留当前检测内容');
    await page.waitForTimeout(1500);
    assert.equal(resetCount, 4, '失败后不得自动重复重置');
    assert.deepEqual(errors, []);
    console.log('PASS 冲突自动合并、断线续传、漏WS补齐、实时更新、旧确认隔离、响应丢失核对、重复点击、重置后恢复、失败保留；pageerrors=0');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
