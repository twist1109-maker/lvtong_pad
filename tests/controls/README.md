# 默认相机与PLC交互验收

运行后端虚拟环境 `python tests/controls/feedback_relay.py`（仅监听本机5197，不导入业务代码），再运行 `npx vite --config tests/controls/vite.config.ts`，打开 `/tests/controls/`。所有HTTP请求均在测试入口拦截，WS也仅连接本机反馈中继，不连接现场；默认错误访问本机摄像头时直接报错。`?gate=1`改为使用真实Dashboard验证闸机图标。

- 打开head/tail/top/goods，检查相机标签和WHEP请求依次为车头cam2、车尾cam1、车顶cam6、球机cam5；手动切换平板仍保留；证据照沿用平板默认。
- PLC只操作模拟红灯。确认后立即显示目标图标，并保持至少1秒；match场景300ms反馈后保持；late场景2200ms才反馈，图标不能先回弹；reorder场景300ms推新WS、约1900ms才返回旧HTTP，新反馈不得被旧响应覆盖。slow场景HTTP请求1600ms才成功，期间保持目标，随后等待反馈；stale/slow未确认时，PLC在HTTP成功后3秒恢复设备反馈并显示未确认提示，闸机为5秒；fail场景发送失败立即恢复并显示错误。
- 页面事件列表记录真实组件aria-pressed/闸机图片变化时刻；关闭重开PLC检查无旧定时器影响。取消确认不得改变图标。

`node --test tests/controls/feedback.test.ts`覆盖延迟、乱序、相同缓存、过期反馈、发送失败、旧操作回调、超时及真实后续状态变化。`npx vue-tsc --noEmit -p tests/controls/tsconfig.json`检查测试入口。2026-11-12隔离浏览器实测：PLC和闸机在300ms新WS/1900ms旧HTTP及2200ms延迟反馈场景均无中途回弹；PLC约5136ms未确认回退，发送失败约130ms回退。证据保存在`tests/layout/artifacts/*-events.txt`和`*feedback*.png`。

上述浏览器超时记录来自最初统一5秒的版本。用户随后要求PLC手动开关改为3秒、闸机保持5秒，已增加两类超时边界回归，8项测试通过。
