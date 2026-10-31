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
