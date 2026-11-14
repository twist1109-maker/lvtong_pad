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

历史自动回填专项：仅启动上述前端Vite，运行 `node tests/session/plate-history.cjs`。浏览器拦截REST和Socket.IO，覆盖扫码通知/共享快照的两种顺序、只收到快照、刷新恢复、已有人工字段不覆盖、同车牌跨检测会话的迟到响应隔离；不启动后端、不访问数据库或设备。

同步与重置恢复专项：仅启动上述前端Vite，运行 `node tests/session/recovery.cjs`。全部REST及Socket.IO由浏览器模拟，覆盖409自动采用最新版本并保留本机输入、短暂断线自动续传、漏推送5秒补查、正常实时更新、确认框期间切单拦截、重置成功但响应丢失、重复点击、重置后快照暂时读取失败、真实失败保留当前内容。重置请求不会自动重发，不访问现场数据库或设备。

同步服务单测：`node --test tests/session/sync.test.ts`。另覆盖多端照片追加/删除合并、上传时继续输入、旧会话迟到响应隔离、有界冲突重试及页面关闭后的定时器清理。正常通过WebSocket即时同步，断线/冲突自动恢复，联网恢复及返回页面时补查；5秒轮询用于补齐漏推送。同字段待上传输入保留，多端照片以原始列表为基准合并。

LAZ手动刷新专项：后端改为启动 `tests/geometry_refresh_browser_server.py`，运行 `node tests/session/geometry-refresh.cjs`。使用临时SQLite、模拟中间件HTTP返回真实压缩LAZ，验证生产刷新API、解码、共享持久化及页面刷新后恢复，失败时保留点云；同时检查主页和登录页统一名称。设备命令全部拦截，不访问现场。

默认使用本机Chrome及Codex运行时Playwright，可通过 `CHROME_PATH`、`PLAYWRIGHT_MODULE` 指定绝对路径。模拟测试不代替现场跑车、真实Pad相机权限及硬件采集验收。

2026-11-14增加点云顶部、侧面：两端恢复同帧正交投影，确认页可打开顶部大图，提交同时包含当前视角截图、顶部XY和侧面XZ图。测试检查两张新增图均为有效PNG且内容不同，图片随提交持久化。后端需先执行`20261114_radar_3d_views.sql`迁移；历史记录两新列默认留空。

2026-11-14 面板轻量预览：fixture使用4000×1000原图，生产面板只取1600×400缩略图；车身/透视框选在后端映射到原图，右侧局部约1400×500，测试检查透视局部保留原始像素而非色阶处理结果。提交仍使用共享原图地址，无数据库迁移。

慢帧显示专项：`node tests/bodyRadar/frame-browser.cjs` 自启127.0.0.1:5199，验证500毫秒加载保留上一帧、尺寸不超出容器、积压只处理最新输入、框选冻结同帧及原图引用、清空后迟到图不能恢复；结果在忽略提交的`tests/bodyRadar/artifacts/frame-display/`。
