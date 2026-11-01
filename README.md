# 绿通快检系统 — Vue 前端

基于原 Qt `LvTongPro` 界面复现的 Web 前端工程。

## 技术栈

- Vue 3 + TypeScript + Vite
- Vue Router + Pinia
- Sass

## 快速开始

```bash
cd E:\code_product\lvtong_pad
npm ci
npm run dev
```

开发服务器默认复用 `..\gcms_src\flask_backend\certs` 中的证书，并监听 5174 端口：

- 本机访问：`https://localhost:5174/`
- 局域网设备访问：使用终端显示的 Network 地址，例如 `https://192.168.1.103:5174/`

浏览器只允许安全上下文调用摄像头。通过局域网 IP 访问时必须使用 HTTPS，并在访问设备上信任
`..\gcms_src\flask_backend\certs\cert.pem`。如果证书尚未生成，请先启动一次 Flask 后端。

图像采集默认选择「平板相机」，直接预览设备后置摄像头并截帧拍照；行驶证和通行码也直接在网页内拍摄，
不再弹出相机/相册/文件管理选择器。首次使用请允许浏览器的摄像头权限；打开失败时页面会显示原因并提供重试。
原有车顶、车头、车尾、球机、预约网络相机仍可通过对应标签切换。

屏幕适配以 1920×1080 为尺寸基准，按浏览器实际可见区域等比缩放字体、按钮、图片和弹窗，面板自动填满剩余空间。
主界面所有字段、六个采集入口、流程按钮和状态栏同屏显示，无需滚动；页面不再固定 16:9 留白，也不拉伸图片。
使用实际可见视口高度兼容 Pad 浏览器动态工具栏，路由懒加载样式不会覆盖画布尺寸。

点击「通行码」先选择「摄像头」或「扫码仪」。摄像头打开平板后置相机，对准二维码自动识别，
「照片识别」用于选择已有二维码照片，不再手动截帧；相机权限关闭时仍可识别照片。
扫码仪支持 USB／蓝牙键盘式输入，扫描后回车或输入结束自动识别，也支持粘贴完整通行码。
扫描结果立即回填车牌、颜色和出口称重，
查询历史记录补齐手机号、挂车号、车型、货箱和尺寸等空字段，保留已手工输入的内容。
扫码仍通过手机 App 的 `/api/mobile/upload/json` 协议上传；上传失败时保留本地回填，支持重试。
兼容缺少原生 BarcodeDetector 的浏览器。通行码中的 14 段数据会继续带入提交确认页和提交请求，
站点编号查询成站名，二维码图片本地生成；支付方式等字段的数值 0 也会保留。
确认页金额按分转元显示，提交保留协议原值。
布局验收可运行 `npm run test:layout`，打开 `http://127.0.0.1:5186/tests/layout/index.html#/`。
该入口使用模拟数据和模拟镜头。尺寸矩阵与操作测试结果见 [`tests/layout/REPORT.md`](tests/layout/REPORT.md)。
通行码协议测试运行 `npm run test:passcode`（需要 Node.js 22.18+ 或 24）。

如证书位于其他位置，可在启动前设置 `HTTPS_CERT_FILE` 和 `HTTPS_KEY_FILE`：

```powershell
$env:HTTPS_CERT_FILE = 'D:\certs\cert.pem'
$env:HTTPS_KEY_FILE = 'D:\certs\key.pem'
npm run dev
```

- 登录页：任意账号密码可进入（Mock 模式）
- 主界面：点击「确认」可弹出预约受理弹窗

## 目录结构

```
src/
├── modules/          # 按业务功能封装
│   ├── auth/         # 登录
│   └── booking/      # 预约受理
├── views/            # 页面级组件
│   └── Dashboard.vue # 主界面
├── components/       # 通用 UI 组件
├── styles/           # 设计规范变量
├── api/              # 请求封装
└── stores/           # Pinia 状态
public/assets/img/    # 从 Qt 项目复制的图标
```

## 设计规范

主色 `#5fbb9e`，目标分辨率 1920×1080 工控大屏。

## 待对接 API

见 `src/api/request.ts`，后端 Spring Boot 就绪后替换 Mock 逻辑。
