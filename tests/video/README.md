# 视频传输与丢包对照

生产播放器默认选择 ICE TCP；服务端未提供 TCP 候选时保留原 SDP。
可在测试页选择“自动协商”作 UDP 对照。TCP 端口必须能从客户端访问；
提供了 TCP 候选但端口被阻断时，不会自动退回 UDP。

## 本机复现

需要已安装后端 Python 依赖、FFmpeg 和 MediaMTX。前端目录中分别运行：

```powershell
& 'E:/code_product/gcms_src/flask_backend/venv/Scripts/python.exe' -u tests/video/loss_fixture.py E:/code_product/gcms_src/flask_backend
npx vite --config tests/video/loss.vite.config.ts
```

打开 `http://127.0.0.1:5189/tests/video/index.html`，不要勾选现场相机。
先选择自动协商播放并保存统计，再停止、改为默认 TCP 播放。
夹具仅使用回环地址合成 H.265，经生产转码配置转为 H.264，
UDP 中继每 35 个 RTP 包丢弃一个，TCP 直接连接测试 MediaMTX。
未修改系统网络或连接现场硬件。播放停止后退出夹具与 Vite。
日志和统计位于已忽略的 `tests/layout/artifacts/video-loss/`。

## 2026-11-10 验证

| 指标 | 自动协商 UDP | 默认 TCP |
| --- | ---: | ---: |
| 观察时间（累计帧间隔） | 55.13 秒 | 37.12 秒 |
| 已解码帧 | 813 | 558 |
| 丢帧 | 1 | 0 |
| NACK 请求 | 317 | 0 |
| 停顿次数 / 时长 | 1 / 1.067 秒 | 0 / 0 秒 |

UDP 中继累计主动丢弃 322/11277 个 RTP 包。浏览器最终 packetsLost 为 0，
因为重传可补包；不能仅用该数值认定链路未丢包。TCP 的启动 PLI 为 3。
两组观察时长不同，结果是功能性对照，不是长期性能统计。
本测试未复现现场绿块的完全相同画面，也不能排除上游或终端解码问题。
