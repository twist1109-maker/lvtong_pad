# 默认相机与PLC交互验收

运行 `npx vite --config tests/controls/vite.config.ts`，打开 `/tests/controls/`。所有HTTP请求均在测试入口拦截，不连接现场；默认错误访问本机摄像头时直接报错。

- 打开head/tail/top/goods，检查相机标签和WHEP请求依次为车头cam2、车尾cam1、车顶cam6、球机cam5；手动切换平板仍保留；证据照沿用平板默认。
- PLC只操作模拟红灯。确认后应立即显示目标图标；stale场景约1000ms后恢复反馈；match场景收到设备新反馈后保持；slow场景请求1600ms才成功，图标仍立即改变，且1000ms后按旧反馈回退，迟到成功不得覆盖反馈；fail场景发送失败应立即回退并显示错误。
- 页面事件列表记录真实组件aria-pressed变化时刻，用于核对1秒保持；关闭重开PLC检查无旧定时器影响。取消确认不得改变图标。
