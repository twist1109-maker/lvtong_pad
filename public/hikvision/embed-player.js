/**
 * 海康插件嵌入页 —— 对齐官方 demo，并通过 hik-layout 把画面摆到父页黑色预览区坐标。
 */
(function () {
  var g_iWndIndex = 0
  var g_deviceIdentify = ''
  var g_inited = false
  var g_playing = false
  var g_talking = false
  var g_busy = false
  /** 对讲最终意图：true=开 / false=关 / null=无待办（串行泵） */
  var g_talkWant = null
  var g_talkPumping = false
  var g_layout = null
  var g_layoutWaiters = []
  var g_analogInfoReady = false
  /** 各设备登录会话：identify -> { cfg, channelId, analogReady, audioChannel, loggedIn } */
  var g_sessions = {}
  /** 当前预览通道，供云台 ISAPI 使用 */
  var g_playChannelId = 1
  /** 对讲通道（I_GetAudioInfo） */
  var g_audioChannel = null
  /** 切换队列：快速连点时只保留最后一次 */
  var g_switchPending = null

  /** 吞掉 SDK 内部未 catch 的 reject（IPC 无数字通道等） */
  window.addEventListener('unhandledrejection', function (ev) {
    var r = ev && ev.reason
    if (!r || typeof r !== 'object') return
    var code = r.errorCode
    var msg = r.errorMsg
    if (code == null) return
    if (
      code === 403 ||
      code === 404 ||
      code === 2001 ||
      code === 3001 ||
      msg === 'document' ||
      msg == null
    ) {
      ev.preventDefault()
    }
  })

  function post(msg) {
    try {
      parent.postMessage(Object.assign({ source: 'hik-embed' }, msg), '*')
    } catch (e) {}
  }

  function status(text, state) {
    post({ type: 'hik-status', text: text, status: state || 'loading' })
  }

  function applyLayout(rect, forceResize) {
    if (!rect) return false
    var left = Math.round(Number(rect.left) || 0)
    var top = Math.round(Number(rect.top) || 0)
    var width = Math.max(1, Math.round(Number(rect.width) || 0))
    var height = Math.max(1, Math.round(Number(rect.height) || 0))

    var prev = g_layout
    var posChanged =
      !prev ||
      Math.abs(prev.left - left) > 1 ||
      Math.abs(prev.top - top) > 1
    var sizeChanged =
      !prev ||
      Math.abs(prev.width - width) > 1 ||
      Math.abs(prev.height - height) > 1

    // 坐标几乎不变时直接跳过，避免反复 I_Resize 导致黑闪
    if (!forceResize && !posChanged && !sizeChanged) {
      return false
    }

    g_layout = { left: left, top: top, width: width, height: height }

    var el = document.getElementById('divPlugin')
    if (!el) return false
    el.style.position = 'absolute'
    el.style.left = left + 'px'
    el.style.top = top + 'px'
    el.style.width = width + 'px'
    el.style.height = height + 'px'
    el.style.pointerEvents = 'auto'

    // 仅尺寸变化时 Resize；纯位移只改 DOM，减少插件重绘闪烁
    if (g_inited && (forceResize || sizeChanged)) {
      try {
        if (typeof WebVideoCtrl !== 'undefined' && WebVideoCtrl.I_Resize) {
          WebVideoCtrl.I_Resize(width, height)
        }
      } catch (e) {}
    }

    var waiters = g_layoutWaiters
    g_layoutWaiters = []
    for (var i = 0; i < waiters.length; i++) {
      try {
        waiters[i](g_layout)
      } catch (e2) {}
    }
    return true
  }

  function waitForLayout(timeoutMs) {
    return new Promise(function (resolve) {
      if (g_layout && g_layout.width >= 80 && g_layout.height >= 80) {
        resolve(g_layout)
        return
      }
      var done = false
      var timer = setTimeout(function () {
        if (done) return
        done = true
        resolve(g_layout)
      }, timeoutMs || 3000)
      g_layoutWaiters.push(function (layout) {
        if (done) return
        done = true
        clearTimeout(timer)
        resolve(layout)
      })
    })
  }

  function initPlugin() {
    return new Promise(function (resolve, reject) {
      if (g_inited) {
        resolve()
        return
      }
      if (typeof WebVideoCtrl === 'undefined') {
        reject(new Error('WebVideoCtrl 未加载'))
        return
      }
      var installRet = -1
      try {
        installRet = WebVideoCtrl.I_CheckPluginInstall()
      } catch (e) {}
      if (installRet === -1) {
        reject(new Error('未安装海康浏览插件，请安装 HCWebSDKPlugin.exe 后重启浏览器'))
        return
      }

      var timer = setTimeout(function () {
        reject(new Error('插件初始化超时'))
      }, 15000)

      try {
        WebVideoCtrl.I_InitPlugin({
          bWndFull: true,
          iWndowType: 1,
          cbSelWnd: function (xmlDoc) {
            try {
              g_iWndIndex = parseInt($(xmlDoc).find('SelectWnd').eq(0).text(), 10) || 0
            } catch (e) {
              g_iWndIndex = 0
            }
          },
          cbDoubleClickWnd: function () {},
          cbEvent: function () {},
          cbInitPluginComplete: function () {
            WebVideoCtrl.I_InsertOBJECTPlugin('divPlugin').then(
              function () {
                clearTimeout(timer)
                g_inited = true
                resolve()
              },
              function () {
                clearTimeout(timer)
                reject(new Error('插件插入失败，请确认已安装 HCWebSDKPlugin.exe'))
              },
            )
          },
        })
      } catch (e) {
        clearTimeout(timer)
        reject(e)
      }
    })
  }

  function cfgIdentify(cfg) {
    return (cfg.ip || '') + '_' + String(cfg.port || 80)
  }

  function isAlreadyLoginError(oError) {
    if (!oError) return false
    var code = oError.errorCode != null ? oError.errorCode : oError.code
    return code === 2001 || code === '2001'
  }

  function login(cfg) {
    return loginSafe(cfg).then(function (identify) {
      g_deviceIdentify = identify
    })
  }

  function loginSafe(cfg) {
    var identify = cfgIdentify(cfg)
    var sess = g_sessions[identify]
    if (sess && sess.loggedIn) {
      return Promise.resolve(identify)
    }

    return new Promise(function (resolve, reject) {
      var ip = cfg.ip
      var port = String(cfg.port || 80)
      var username = cfg.username
      var password = cfg.password

      var timer = setTimeout(function () {
        reject(new Error('设备登录超时'))
      }, 10000)

      function finishOk() {
        clearTimeout(timer)
        if (!g_sessions[identify]) g_sessions[identify] = {}
        g_sessions[identify].loggedIn = true
        g_sessions[identify].cfg = cfg
        resolve(identify)
      }

      function finishErr(oError) {
        clearTimeout(timer)
        if (isAlreadyLoginError(oError)) {
          finishOk()
          return
        }
        reject(
          new Error(
            (oError && oError.errorMsg) ||
              (oError && oError.message) ||
              '设备登录失败',
          ),
        )
      }

      try {
        var ret = WebVideoCtrl.I_Login(ip, 1, port, username, password, {
          timeout: 3000,
          success: finishOk,
          error: finishErr,
        })
        if (ret && typeof ret.then === 'function') {
          ret.then(finishOk, finishErr)
        }
      } catch (e) {
        finishErr(e)
      }
    })
  }

  function getFirstChannelIdFor(identify) {
    return new Promise(function (resolve) {
      var fallback = 1
      var settled = false
      function done(id) {
        if (settled) return
        settled = true
        resolve(id > 0 ? id : fallback)
      }
      setTimeout(function () {
        done(fallback)
      }, 600)

      try {
        WebVideoCtrl.I_GetAnalogChannelInfo(identify, {
          success: function (xmlDoc) {
            var id = parseInt(
              $(xmlDoc).find('VideoInputChannel').eq(0).find('id').eq(0).text(),
              10,
            )
            if (id > 0) done(id)
          },
          error: function () {},
        })
      } catch (e) {}
      // 独立 IPC 无数字通道，不调 I_GetDigitalChannelInfo（否则控制台 403）
    })
  }

  function ensureAnalogChannelInfoFor(identify) {
    var sess = g_sessions[identify]
    if (!sess) {
      sess = g_sessions[identify] = {}
    }
    if (sess.analogReady) return Promise.resolve()

    return new Promise(function (resolve) {
      var settled = false
      function done() {
        if (settled) return
        settled = true
        sess.analogReady = true
        resolve()
      }
      setTimeout(done, 500)
      try {
        WebVideoCtrl.I_GetAnalogChannelInfo(identify, {
          success: done,
          error: done,
        })
      } catch (e) {
        done()
      }
    })
  }

  function stopPlayOnly() {
    return new Promise(function (resolve) {
      if (!g_playing) {
        resolve()
        return
      }
      try {
        WebVideoCtrl.I_Stop({
          success: function () {
            g_playing = false
            resolve()
          },
          error: function () {
            g_playing = false
            resolve()
          },
        })
      } catch (e) {
        g_playing = false
        resolve()
      }
    })
  }

  async function switchToDevice(cfg, opts) {
    opts = opts || {}
    var identify = await loginSafe(cfg)
    var sess = g_sessions[identify] || (g_sessions[identify] = { cfg: cfg })
    sess.cfg = cfg
    g_deviceIdentify = identify
    g_analogInfoReady = !!sess.analogReady

    if (sess.analogReady) {
      /* 已预热则跳过 */
    } else {
      await ensureAnalogChannelInfoFor(identify)
    }

    var channelId = cfg.channelId || sess.channelId
    if (!channelId) {
      channelId = await getFirstChannelIdFor(identify)
      sess.channelId = channelId > 0 ? channelId : 1
    }
    g_playChannelId = channelId > 0 ? channelId : 1

    var streamType = cfg.streamType || 1

    if (g_playing) {
      await stopPlayOnly()
    }

    await startPlay(g_playChannelId, streamType)
    if (g_layout) applyLayout(g_layout, false)
    return finishSwitchResult(identify, sess, opts)
  }

  function finishSwitchResult(identify, sess, opts) {
    var audioCh = sess.audioChannel
    if (!opts.skipAudio && audioCh == null) {
      return getAudioInfo()
        .then(function (ch) {
          sess.audioChannel = ch
          return { identify: identify, audioChannel: ch }
        })
        .catch(function () {
          return { identify: identify, audioChannel: null }
        })
    }
    return Promise.resolve({ identify: identify, audioChannel: audioCh })
  }

  function getFirstChannelId() {
    return new Promise(function (resolve) {
      var fallback = 1
      var settled = false
      function done(id) {
        if (settled) return
        settled = true
        resolve(id > 0 ? id : fallback)
      }
      setTimeout(function () {
        done(fallback)
      }, 600)

      try {
        WebVideoCtrl.I_GetAnalogChannelInfo(g_deviceIdentify, {
          success: function (xmlDoc) {
            var id = parseInt($(xmlDoc).find('VideoInputChannel').eq(0).find('id').eq(0).text(), 10)
            if (id > 0) done(id)
          },
          error: function () {},
        })
      } catch (e) {}
    })
  }

  /**
   * 登录后必须拉一次模拟通道信息，写入 iAnalogChannelNum。
   * 否则该值保持 0，云台会走 PTZCtrlProxy（NVR 数字通道）地址，
   * 独立 IPC/球机上会返回 HTTP 403，表现为云台无反应。
   */
  function ensureAnalogChannelInfo() {
    if (g_analogInfoReady) return Promise.resolve()
    return new Promise(function (resolve) {
      var settled = false
      function done() {
        if (settled) return
        settled = true
        g_analogInfoReady = true
        resolve()
      }
      setTimeout(done, 500)
      try {
        WebVideoCtrl.I_GetAnalogChannelInfo(g_deviceIdentify, {
          success: function () {
            done()
          },
          error: function () {
            done()
          },
        })
      } catch (e) {
        done()
      }
    })
  }

  function startPlay(channelId, streamType) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        reject(new Error('开启预览超时'))
      }, 15000)

      function doPlay() {
        var ret = WebVideoCtrl.I_StartRealPlay(g_deviceIdentify, {
          iStreamType: streamType || 1,
          iChannelID: channelId || 1,
          bZeroChannel: false,
          success: function () {
            clearTimeout(timer)
            g_playing = true
            resolve()
          },
          error: function (oError) {
            clearTimeout(timer)
            reject(new Error((oError && oError.errorMsg) || '开启预览失败'))
          },
        })
        if (ret && typeof ret.then === 'function') {
          ret.then(
            function () {
              clearTimeout(timer)
              g_playing = true
              resolve()
            },
            function (oError) {
              clearTimeout(timer)
              reject(new Error((oError && oError.errorMsg) || '开启预览失败'))
            },
          )
        }
      }

      var oWndInfo = null
      try {
        oWndInfo = WebVideoCtrl.I_GetWindowStatus(g_iWndIndex)
      } catch (e) {}
      if (oWndInfo != null) {
        WebVideoCtrl.I_Stop({
          success: function () {
            doPlay()
          },
          error: function () {
            doPlay()
          },
        })
      } else {
        doPlay()
      }
    })
  }

  function formatTalkErr(oError, fallback) {
    if (!oError) return fallback || '未知错误'
    if (typeof oError === 'string') return oError
    var code = oError.errorCode
    var msg = oError.errorMsg
    if (msg && typeof msg === 'object') {
      try {
        msg = JSON.stringify(msg)
      } catch (e) {
        msg = String(msg)
      }
    }
    var text = ''
    if (code != null) text += '[' + code + '] '
    text += msg || fallback || '未知错误'
    if (
      code === 1000 ||
      code === 5000 ||
      /unknown error/i.test(String(msg || ''))
    ) {
      text +=
        ' | 排查: ①Windows麦克风允许桌面应用 ②本机有可用麦克风 ③设备未被其它客户端占用对讲 ④先关预览声音再对讲'
    }
    return text
  }

  function closeAllSound() {
    return new Promise(function (resolve) {
      try {
        var all = WebVideoCtrl.I_GetWindowStatus() || []
        var i
        for (i = 0; i < all.length; i++) {
          if (all[i] && all[i].bSound) {
            try {
              WebVideoCtrl.I_CloseSound(all[i].iIndex)
            } catch (e) {}
          }
        }
      } catch (e2) {}
      try {
        WebVideoCtrl.I_CloseSound().then(
          function () {
            resolve()
          },
          function () {
            resolve()
          },
        )
      } catch (e3) {
        resolve()
      }
    })
  }

  function getAudioInfo() {
    return new Promise(function (resolve, reject) {
      WebVideoCtrl.I_GetAudioInfo(g_deviceIdentify, {
        success: function (xmlDoc) {
          var id = null
          var compress = ''
          try {
            id = $(xmlDoc)
              .find('TwoWayAudioChannel')
              .eq(0)
              .find('id')
              .eq(0)
              .text()
            compress = $(xmlDoc).find('audioCompressionType').eq(0).text()
          } catch (e) {}
          if (!id) id = '1'
          g_audioChannel = parseInt(id, 10)
          post({
            type: 'hik-log',
            text:
              '音频参数 channel=' +
              g_audioChannel +
              (compress ? ' compress=' + compress : ''),
          })
          resolve(g_audioChannel)
        },
        error: function (oError) {
          var code = oError && oError.errorCode
          // 部分 IPC 无 TwoWayAudio ISAPI，仍可用通道 1 对讲
          if (code === 404 || code === 403) {
            g_audioChannel = 1
            post({
              type: 'hik-log',
              text: '音频参数 ISAPI ' + code + '，fallback channel=1',
            })
            resolve(1)
            return
          }
          reject(new Error(formatTalkErr(oError, '获取对讲通道失败')))
        },
      })
    })
  }

  function forceCloseTalkChannel() {
    return new Promise(function (resolve) {
      if (!g_deviceIdentify) {
        resolve()
        return
      }
      var settled = false
      function done(msg) {
        if (settled) return
        settled = true
        if (msg) post({ type: 'hik-log', text: msg })
        resolve()
      }
      var ch = g_audioChannel || 1
      var uri = 'ISAPI/System/TwoWayAudio/channels/' + ch + '/close'
      // 硬超时缩短：正常应很快返回；挂死时别卡死开讲
      setTimeout(function () {
        done(null)
      }, 400)
      try {
        WebVideoCtrl.I_SendHTTPRequest(g_deviceIdentify, uri, {
          type: 'PUT',
          data: '',
          success: function () {
            done('已强制关闭对讲通道 ' + ch)
          },
          error: function () {
            done(null)
          },
        })
      } catch (e) {
        done(null)
      }
    })
  }

  function stopVoiceTalk() {
    return new Promise(function (resolve) {
      try {
        WebVideoCtrl.I_StopVoiceTalk().then(
          function () {
            g_talking = false
            resolve()
          },
          function () {
            g_talking = false
            resolve()
          },
        )
      } catch (e) {
        g_talking = false
        resolve()
      }
    })
  }

  function startVoiceTalk() {
    return new Promise(function (resolve, reject) {
      if (!g_playing) {
        reject(new Error('请先预览成功再对讲'))
        return
      }

      var chain = Promise.resolve()
      if (g_talking) {
        chain = chain
          .then(function () {
            return stopVoiceTalk()
          })
          .then(function () {
            return forceCloseTalkChannel()
          })
      }

      // 海康要求：开对讲前先关预览声音，否则易 [1000]
      chain
        .then(function () {
          return closeAllSound()
        })
        .then(function () {
          if (g_audioChannel != null && !isNaN(g_audioChannel)) {
            return g_audioChannel
          }
          return getAudioInfo()
        })
        .then(function (ch) {
          post({
            type: 'hik-log',
            text: 'I_StartVoiceTalk ' + g_deviceIdentify + ' ch=' + ch,
          })
          return WebVideoCtrl.I_StartVoiceTalk(g_deviceIdentify, ch)
        })
        .then(
          function () {
            g_talking = true
            resolve()
          },
          function (oError) {
            g_talking = false
            // 点太快/通道未释放时重试一次
            closeAllSound()
              .then(function () {
                return stopVoiceTalk()
              })
              .then(function () {
                return forceCloseTalkChannel()
              })
              .then(function () {
                return new Promise(function (r) {
                  setTimeout(r, 200)
                })
              })
              .then(function () {
                var ch = g_audioChannel || 1
                post({
                  type: 'hik-log',
                  text: 'I_StartVoiceTalk retry ch=' + ch,
                })
                return WebVideoCtrl.I_StartVoiceTalk(g_deviceIdentify, ch)
              })
              .then(
                function () {
                  g_talking = true
                  resolve()
                },
                function (oError2) {
                  g_talking = false
                  forceCloseTalkChannel()
                    .then(function () {
                      return stopVoiceTalk()
                    })
                    .then(function () {
                      reject(
                        new Error(formatTalkErr(oError2 || oError, '开始对讲失败')),
                      )
                    })
                },
              )
          },
        )
    })
  }

  function destroyAll() {
    return new Promise(function (resolve) {
      function finish() {
        g_playing = false
        g_talking = false
        g_inited = false
        g_deviceIdentify = ''
        g_analogInfoReady = false
        g_sessions = {}
        g_playChannelId = 1
        g_audioChannel = null
        try {
          var el = document.getElementById('divPlugin')
          if (el) el.innerHTML = ''
        } catch (e) {}
        resolve()
      }

      var chain = Promise.resolve()
      if (g_talking) {
        chain = chain.then(stopVoiceTalk)
      }

      chain
        .then(function () {
          try {
            WebVideoCtrl.I_Stop({
              success: function () {},
              error: function () {},
            })
          } catch (e) {
            try {
              WebVideoCtrl.I_Stop()
            } catch (e2) {}
          }
        })
        .then(function () {
          return new Promise(function (r) {
            setTimeout(r, 150)
          })
        })
        .then(function () {
          if (g_deviceIdentify) {
            try {
              WebVideoCtrl.I_Logout(g_deviceIdentify)
            } catch (e) {}
          }
          return new Promise(function (r) {
            setTimeout(r, 150)
          })
        })
        .then(function () {
          try {
            if (typeof WebVideoCtrl.I_DestroyPlugin === 'function') {
              WebVideoCtrl.I_DestroyPlugin()
            }
          } catch (e) {}
          setTimeout(finish, 100)
        })
    })
  }

  function capture() {
    return new Promise(function (resolve, reject) {
      var oWndInfo = null
      try {
        oWndInfo = WebVideoCtrl.I_GetWindowStatus(g_iWndIndex)
      } catch (e) {}
      if (!oWndInfo) {
        reject(new Error('当前无预览画面'))
        return
      }
      WebVideoCtrl.I_CapturePicData().then(
        function (data) {
          if (!data) {
            reject(new Error('抓图为空'))
            return
          }
          resolve(data.indexOf('data:') === 0 ? data : 'data:image/jpeg;base64,' + data)
        },
        function () {
          reject(new Error('抓图失败'))
        },
      )
    })
  }

  async function handleStart(cfg) {
    if (g_busy) return
    g_busy = true
    try {
      status('正在定位预览区域…', 'loading')
      await waitForLayout(4000)
      if (g_layout) applyLayout(g_layout, true)

      status('正在初始化插件…', 'loading')
      await initPlugin()
      if (g_layout) applyLayout(g_layout, true)

      status('正在连接摄像头…', 'loading')
      var result = await switchToDevice(cfg)
      status(result.audioChannel != null ? '预览成功，可对讲' : '预览中', 'playing')
      post({
        type: 'hik-playing',
        audioChannel: result.audioChannel,
        deviceKey: result.identify,
      })
    } catch (e) {
      status((e && e.message) || '启动失败', 'error')
      try {
        await destroyAll()
      } catch (e2) {}
      post({ type: 'hik-error', message: (e && e.message) || '启动失败' })
    } finally {
      g_busy = false
    }
  }

  async function handleStop() {
    try {
      await destroyAll()
    } catch (e) {}
    post({ type: 'hik-stopped' })
  }

  /** 预热：登录全部相机，默认设备出流，切换时只停流/换设备 */
  async function handleWarmup(payload) {
    if (g_busy) return
    g_busy = true
    try {
      var list = (payload && payload.devices) || []
      var defaultIndex =
        payload && payload.defaultIndex != null ? payload.defaultIndex : 0
      if (defaultIndex < 0) defaultIndex = 0
      if (defaultIndex >= list.length) defaultIndex = 0

      status('正在定位预览区域…', 'loading')
      await waitForLayout(4000)
      if (g_layout) applyLayout(g_layout, true)

      status('正在初始化插件…', 'loading')
      await initPlugin()
      if (g_layout) applyLayout(g_layout, true)

      for (var i = 0; i < list.length; i++) {
        var cfg = list[i]
        var identify = cfgIdentify(cfg)
        status('预热摄像头 ' + (i + 1) + '/' + list.length + '…', 'loading')
        await loginSafe(cfg)
        await ensureAnalogChannelInfoFor(identify)
        var sess = g_sessions[identify] || (g_sessions[identify] = { cfg: cfg })
        if (!sess.channelId) {
          var ch = cfg.channelId || (await getFirstChannelIdFor(identify))
          sess.channelId = ch > 0 ? ch : 1
        }
      }

      var result = { identify: '', audioChannel: null }
      if (list.length > 0) {
        status('正在开启默认预览…', 'loading')
        result = await switchToDevice(list[defaultIndex])
      }

      status('预览中', 'playing')
      post({
        type: 'hik-playing',
        audioChannel: result.audioChannel,
        deviceKey: result.identify,
      })
      post({ type: 'hik-warmup-done', count: list.length })
    } catch (e) {
      status((e && e.message) || '预热失败', 'error')
      post({ type: 'hik-error', message: (e && e.message) || '预热失败' })
    } finally {
      g_busy = false
    }
  }

  /** 切换设备：不登出；采集场景 skipAudio 跳过对讲 ISAPI */
  async function handleSwitch(cfg) {
    g_switchPending = cfg
    if (g_busy) return
    while (g_switchPending) {
      var nextCfg = g_switchPending
      g_switchPending = null
      g_busy = true
      try {
        var skipAudio = !!(nextCfg && nextCfg.skipAudio)
        var result = await switchToDevice(nextCfg, {
          skipAudio: skipAudio,
        })
        status('预览中', 'playing')
        post({
          type: 'hik-playing',
          audioChannel: result.audioChannel,
          deviceKey: result.identify,
        })
      } catch (e) {
        status((e && e.message) || '切换失败', 'error')
        post({ type: 'hik-error', message: (e && e.message) || '切换失败' })
      } finally {
        g_busy = false
      }
    }
  }

  async function handleReconnect(cfg) {
    await handleSwitch(cfg)
  }

  async function handleTalkStart() {
    g_talkWant = true
    post({ type: 'hik-talk', talking: true, pending: true })
    pumpTalkWant()
  }

  async function handleTalkStop() {
    g_talkWant = false
    post({ type: 'hik-talk', talking: false, pending: true })
    pumpTalkWant()
  }

  /** 串行开/关：点快了只记最终意图，避免 Start/Stop 叠在一起报 [1000] */
  function pumpTalkWant() {
    if (g_talkPumping) return
    g_talkPumping = true
    ;(function run() {
      if (g_talkWant === null) {
        g_talkPumping = false
        return
      }
      var want = g_talkWant
      g_talkWant = null
      var op = Promise.resolve()
      if (want && !g_talking) {
        op = startVoiceTalk().then(
          function () {
            status('对讲中', 'playing')
            post({ type: 'hik-talk', talking: true })
          },
          function (e) {
            status((e && e.message) || '对讲失败', 'error')
            post({
              type: 'hik-talk',
              talking: false,
              error: (e && e.message) || '对讲失败',
            })
          },
        )
      } else if (!want && g_talking) {
        op = stopVoiceTalk().then(
          function () {
            status(g_playing ? '预览成功，可对讲' : '已停止对讲', 'playing')
            post({ type: 'hik-talk', talking: false })
          },
          function () {
            status(g_playing ? '预览成功，可对讲' : '已停止对讲', 'playing')
            post({ type: 'hik-talk', talking: false })
          },
        )
      } else {
        // 已是目标状态
        post({ type: 'hik-talk', talking: !!g_talking })
      }
      op.then(run, run)
    })()
  }

  async function handleCapture() {
    try {
      var dataUrl = await capture()
      post({ type: 'hik-capture-result', ok: true, dataUrl: dataUrl })
    } catch (e) {
      post({ type: 'hik-capture-result', ok: false, message: (e && e.message) || '抓图失败' })
    }
  }

  /**
   * 云台：不走 I_PTZControl（其在 iAnalogChannelNum=0 时会误用 NVR Proxy 地址导致 403）。
   * 直接对 IPC 常用模拟通道 ISAPI 发 PUT；失败再试数字通道代理。
   * 热路径禁止 await，避免按下后还在等通道探测、松开停止已先发出。
   *
   * index: 1上 2下 3左 4右 5左上 6左下 7右上 8右下 9自动 10变焦+ 11变焦-
   */
  function formatPtzError(oError) {
    if (!oError) return '云台控制失败'
    var code = oError.errorCode
    var msg = oError.errorMsg
    if (msg && typeof msg === 'object') {
      try {
        var statusString = ''
        var subStatus = ''
        if (window.$ && msg.nodeType) {
          statusString = $(msg).find('statusString').eq(0).text() || ''
          subStatus = $(msg).find('subStatusCode').eq(0).text() || ''
        }
        if (statusString) {
          return (
            '云台失败 ' +
            code +
            ': ' +
            statusString +
            (subStatus ? ' (' + subStatus + ')' : '')
          )
        }
      } catch (e) {}
      return '云台控制失败 (' + code + ')'
    }
    if (typeof msg === 'string' && msg && msg !== 'document') {
      return '云台失败 ' + code + ': ' + msg
    }
    return '云台控制失败 (' + (code || '?') + ')'
  }

  function ptzSpeedValue(speed, stop) {
    if (stop) return 0
    var s = typeof speed === 'number' ? speed : 4
    return s < 7 ? s * 15 : 100
  }

  function buildPtzBody(index, speed, stop) {
    var v = ptzSpeedValue(speed, stop)
    // 与 SDK ptzControl 方向表一致
    var dir = [
      null,
      { pan: 0, tilt: v },
      { pan: 0, tilt: -v },
      { pan: -v, tilt: 0 },
      { pan: v, tilt: 0 },
      { pan: -v, tilt: v },
      { pan: -v, tilt: -v },
      { pan: v, tilt: v },
      { pan: v, tilt: -v },
    ]
    if (index >= 1 && index <= 8) {
      return (
        "<?xml version='1.0' encoding='UTF-8'?>" +
        '<PTZData><pan>' +
        dir[index].pan +
        '</pan><tilt>' +
        dir[index].tilt +
        '</tilt></PTZData>'
      )
    }
    if (index === 10 || index === 11) {
      var zoom = stop ? 0 : index === 10 ? v : -v
      return (
        "<?xml version='1.0' encoding='UTF-8'?>" +
        '<PTZData><zoom>' +
        zoom +
        '</zoom></PTZData>'
      )
    }
    if (index === 9) {
      return (
        "<?xml version='1.0' encoding='UTF-8'?>" +
        '<autoPanData><autoPan>' +
        v +
        '</autoPan></autoPanData>'
      )
    }
    return ''
  }

  function sendHttp(szURI, szData) {
    return WebVideoCtrl.I_SendHTTPRequest(g_deviceIdentify, szURI, {
      type: 'PUT',
      data: szData,
    })
  }

  function sendPtzIsapi(index, stop, speed) {
    var channelId = g_playChannelId || 1
    var oWndInfo = null
    try {
      oWndInfo = WebVideoCtrl.I_GetWindowStatus(g_iWndIndex)
    } catch (e) {}
    if (oWndInfo && oWndInfo.iChannelID > 0) {
      channelId = oWndInfo.iChannelID
      g_playChannelId = channelId
    }

    var szData = buildPtzBody(index, speed, stop)
    if (!szData) {
      return Promise.reject({ errorCode: 1002, errorMsg: '不支持的云台指令' })
    }

    var analogUri
    var digitalUri
    if (index === 9) {
      analogUri = 'ISAPI/PTZCtrl/channels/' + channelId + '/autoPan'
      digitalUri = 'ISAPI/ContentMgmt/PTZCtrlProxy/channels/' + channelId + '/autoPan'
    } else {
      analogUri = 'ISAPI/PTZCtrl/channels/' + channelId + '/continuous'
      digitalUri = 'ISAPI/ContentMgmt/PTZCtrlProxy/channels/' + channelId + '/continuous'
    }

    // 独立球机优先模拟通道；403 时再试数字通道代理
    return sendHttp(analogUri, szData).then(
      function (ok) {
        return ok
      },
      function () {
        return sendHttp(digitalUri, szData)
      },
    )
  }

  function handlePtz(payload) {
    var p = payload || {}
    var index = parseInt(p.index, 10)
    var stop = !!p.stop
    var speed = typeof p.speed === 'number' ? p.speed : 4
    if (!g_deviceIdentify || !index) return
    if (typeof WebVideoCtrl === 'undefined' || !WebVideoCtrl.I_SendHTTPRequest) {
      post({ type: 'hik-status', text: '当前插件不支持云台控制', status: 'playing' })
      return
    }

    var oWndInfo = null
    try {
      oWndInfo = WebVideoCtrl.I_GetWindowStatus(g_iWndIndex)
    } catch (e) {}
    if (!oWndInfo) {
      post({ type: 'hik-status', text: '预览窗口未就绪，无法云台', status: 'playing' })
      return
    }

    // 自动巡航：父页用 speed=0 表示关闭
    if (index === 9 && (stop || speed === 0)) {
      stop = true
      speed = 0
    }

    try {
      sendPtzIsapi(index, stop, speed).then(
        function () {},
        function (oError) {
          if (stop) return
          post({
            type: 'hik-status',
            text: formatPtzError(oError),
            status: 'playing',
          })
        },
      )
    } catch (e) {
      post({
        type: 'hik-status',
        text: (e && e.message) || '云台控制异常',
        status: 'playing',
      })
    }
  }

  function resolvePtzChannelId() {
    var channelId = g_playChannelId || 1
    try {
      var oWndInfo = WebVideoCtrl.I_GetWindowStatus(g_iWndIndex)
      if (oWndInfo && oWndInfo.iChannelID > 0) {
        channelId = oWndInfo.iChannelID
        g_playChannelId = channelId
      }
    } catch (e) {}
    return channelId
  }

  /**
   * 预置点：优先 ISAPI（与 continuous 云台同路），失败再试 SDK I_SetPreset / I_GoPreset。
   * action: 'set' | 'goto'；id: 1~9
   */
  function handlePreset(payload) {
    var p = payload || {}
    var action = p.action === 'set' ? 'set' : 'goto'
    var presetId = parseInt(p.id, 10)
    if (!g_deviceIdentify || !(presetId >= 1 && presetId <= 255)) {
      post({
        type: 'hik-preset-result',
        ok: false,
        action: action,
        id: presetId,
        message: '预置点参数无效',
      })
      return
    }
    if (typeof WebVideoCtrl === 'undefined') {
      post({
        type: 'hik-preset-result',
        ok: false,
        action: action,
        id: presetId,
        message: '插件未就绪',
      })
      return
    }

    var oWndInfo = null
    try {
      oWndInfo = WebVideoCtrl.I_GetWindowStatus(g_iWndIndex)
    } catch (e) {}
    if (!oWndInfo) {
      post({
        type: 'hik-preset-result',
        ok: false,
        action: action,
        id: presetId,
        message: '预览窗口未就绪',
      })
      return
    }

    var channelId = resolvePtzChannelId()
    var analogBase = 'ISAPI/PTZCtrl/channels/' + channelId + '/presets/' + presetId
    var digitalBase =
      'ISAPI/ContentMgmt/PTZCtrlProxy/channels/' + channelId + '/presets/' + presetId
    var setBody =
      "<?xml version='1.0' encoding='UTF-8'?>" +
      '<PTZPreset><id>' +
      presetId +
      '</id></PTZPreset>'

    function finishOk() {
      post({
        type: 'hik-preset-result',
        ok: true,
        action: action,
        id: presetId,
        message: action === 'set' ? '预置点已设置' : '已转到预置点',
      })
    }

    function finishErr(oError) {
      post({
        type: 'hik-preset-result',
        ok: false,
        action: action,
        id: presetId,
        message: formatPtzError(oError) || (action === 'set' ? '设置预置点失败' : '调用预置点失败'),
      })
    }

    function trySdkPreset() {
      return new Promise(function (resolve, reject) {
        if (action === 'set' && typeof WebVideoCtrl.I_SetPreset === 'function') {
          WebVideoCtrl.I_SetPreset(presetId, {
            success: function () {
              resolve()
            },
            error: function (oError) {
              reject(oError)
            },
          })
          return
        }
        if (action === 'goto' && typeof WebVideoCtrl.I_GoPreset === 'function') {
          WebVideoCtrl.I_GoPreset(presetId, {
            success: function () {
              resolve()
            },
            error: function (oError) {
              reject(oError)
            },
          })
          return
        }
        reject({ errorCode: 1002, errorMsg: '插件不支持预置点' })
      })
    }

    function runIsapi() {
      if (!WebVideoCtrl.I_SendHTTPRequest) {
        return trySdkPreset()
      }
      if (action === 'set') {
        return sendHttp(analogBase, setBody).then(
          function (ok) {
            return ok
          },
          function () {
            return sendHttp(digitalBase, setBody)
          },
        )
      }
      // goto：空 body PUT .../goto
      return sendHttp(analogBase + '/goto', '').then(
        function (ok) {
          return ok
        },
        function () {
          return sendHttp(digitalBase + '/goto', '')
        },
      )
    }

    try {
      runIsapi().then(
        function () {
          finishOk()
        },
        function (oError) {
          trySdkPreset().then(finishOk, function (e2) {
            finishErr(e2 || oError)
          })
        },
      )
    } catch (e) {
      finishErr({ errorCode: 1000, errorMsg: (e && e.message) || '预置点异常' })
    }
  }

  window.addEventListener('message', function (ev) {
    var data = ev.data
    if (!data || data.target !== 'hik-embed') return
    if (data.type === 'hik-layout') {
      applyLayout(data.rect || null, !!data.force)
    } else if (data.type === 'hik-start') {
      handleStart(data.payload || {})
    } else if (data.type === 'hik-stop') {
      handleStop()
    } else if (data.type === 'hik-warmup') {
      handleWarmup(data.payload || {})
    } else if (data.type === 'hik-switch' || data.type === 'hik-reconnect') {
      handleSwitch(data.payload || {})
    } else if (data.type === 'hik-capture') {
      handleCapture()
    } else if (data.type === 'hik-ptz') {
      handlePtz(data)
    } else if (data.type === 'hik-preset') {
      handlePreset(data)
    } else if (data.type === 'hik-talk-start') {
      handleTalkStart()
    } else if (data.type === 'hik-talk-stop') {
      handleTalkStop()
    }
  })

  post({ type: 'hik-ready' })
})()
