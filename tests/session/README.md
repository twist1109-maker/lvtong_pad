# PC / Pad 检测同步隔离验收

在两个终端分别启动本机fixture，测试完成Ctrl+C关闭，不启动正式后端。

后端目录：

```powershell
venv\Scripts\python.exe -u tests/session_browser_server.py
```

前端目录：

```powershell
npx vite --config tests/session/vite.config.ts
```

再在前端目录运行：

```powershell
node tests/session/browser.cjs
```

fixture只监听127.0.0.1:5198，使用临时SQLite/图片目录，提供模拟检测和LAZ。前端5197运行生产App/ScreenScaler/Dashboard及REST/WS同步；浏览器模拟终端相机并拦截视频请求。不会连接现场或发送设备命令。临时库在fixture退出时删除。

脚本覆盖PC1920×1080、Android Pad1280×800：Pad先进入真实登录页建立匿名WS，再登录重新认证，验证后续检测持续同步；此外覆盖恢复检测、Pad追加照片、PC追加车身框图、证据选择、3D尺寸和截图、透视删除同步、提交选择同步、备注、两新雷达图片字段上传、提交双端重置、预约草稿恢复不重复下发、检测中预约不发请求。截图和提交请求记录保存在忽略提交的 `artifacts/`。

默认使用本机Chrome及Codex运行时Playwright，可通过 `CHROME_PATH`、`PLAYWRIGHT_MODULE` 指定绝对路径。模拟测试不代替现场跑车、真实Pad相机权限及硬件采集验收。
