# 绿通快检系统 — Vue 前端

基于原 Qt `LvTongPro` 界面复现的 Web 前端工程。

## 技术栈

- Vue 3 + TypeScript + Vite
- Vue Router + Pinia
- Sass

## 快速开始

```bash
cd e:\bibl\lvtong-ui
npm install
npm run dev
```

浏览器打开 http://localhost:5173

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
