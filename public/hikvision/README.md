# 海康 WebSDK（插件版）接入说明

## 当前方案：全屏透明 iframe + 内部坐标定位

1. 业务弹窗黑色预览区只作**锚点**（测量 `getBoundingClientRect`）
2. 全屏透明 `iframe` 加载 [`player.html`](./player.html)
3. 父页把黑区屏幕坐标 `postMessage` 给 iframe（`hik-layout`）
4. iframe 内把 `#divPlugin` 绝对定位到该坐标，再 Init/预览  
   → 海康 HWND 落在黑色区域内（修正「钉在浏览器左上角」）

`iframe` 使用 `pointer-events: none`，避免挡住拍照/关闭按钮；插件窗口自身仍可接收点击。

## 官方包位置

```text
public/hikvision/codebase/demo/
  ├── jquery-1.7.1.min.js
  └── codebase/
      ├── webVideoCtrl.js
      ├── jsVideoPlugin-1.0.0.min.js
      └── HCWebSDKPlugin.exe
```
