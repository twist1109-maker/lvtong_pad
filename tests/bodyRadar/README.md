# 车身截图验收

`node --test tests/bodyRadar/*.test.ts` 验证点云数据校验及框选在CSS缩放、反向拖动和超出边界时的像素映射。

`npx vite --config tests/bodyRadar/capture.vite.config.ts` 提供隔离Dashboard，URL为 `/tests/bodyRadar/?bodyCapture=1`。API及Socket.IO仅连接本机5194测试服务，不能转发到现场。

另一个终端用后端虚拟环境启动 `python tests/bodyRadar/serve_fixture.py E:/code_product/gcms_src/flask_backend`，测试服务仅监听127.0.0.1:5194。不导入业务启动文件，不连接数据库或现场设备，geomcap发送器被替换为打印。页面右上角“模拟车身影像”用于加载四色原图，同时运行生产几何采集服务：先从本地HTTP读取3次空响应，再返回测试夹具的真实压缩LAZ，第6次响应带 `Capture-Finish: true`。轮询与车身图共用0.2秒间隔和结束判断，收到JSON也结束，正常结束及超时会调用被拦截的geomcap=false。

验证步骤：无采集时3D为空、截图禁用；启动后显示等待有效点云，自动切为3D并显示尺寸（切换视图即可看到，无须刷新），随后提示点云采集完成；模拟采集重置后回到默认车身图且点云清空，新一轮不能显示旧点云。截图步骤：加载车身图后点击截图，拖框后右侧出现裁块；确认后进入货物图，删除后清空；切换3D视图，旋转缩放后截图，拖框不能旋转模型，完成/取消后恢复旋转；反向框选、短按忽略、鼠标越界、取消及切换视图；检查平板缩放下坐标一致。业务页面已无演示标识或演示数据回退。
