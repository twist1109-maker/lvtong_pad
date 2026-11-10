# 车身截图验收

`node --test tests/bodyRadar/*.test.ts` 验证点云数据校验及框选在CSS缩放、反向拖动和超出边界时的像素映射。

`npx vite --config tests/bodyRadar/capture.vite.config.ts` 提供隔离Dashboard，URL为 `/tests/bodyRadar/?bodyCapture=1`。API及Socket.IO仅连接本机5194测试服务，不能转发到现场。

另一个终端用后端虚拟环境启动 `python tests/bodyRadar/serve_fixture.py E:/code_product/gcms_src/flask_backend`，测试服务仅监听127.0.0.1:5194。只加载示范LAZ、内存临时图缓存和Socket.IO测试消息，不导入业务启动文件，不连接数据库或设备。页面右上角“模拟车身影像”用于加载四色原图。

验证步骤：无图时截图禁用；加载车身图后点击截图，拖框后右侧出现裁块；确认后进入货物图，删除后清空；切换3D视图，旋转缩放后截图，拖框不能旋转模型，完成/取消后恢复旋转；反向框选、短按忽略、鼠标越界、取消及切换视图；检查平板缩放下坐标一致。示范3D截图带“示范数据”水印。
