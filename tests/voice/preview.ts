import { createApp, h, nextTick } from 'vue'
import WorkflowIcons from '../../src/components/WorkflowIcons.vue'
import type { PromptVoiceState } from '../../src/api/device'

// 本地页面拦截全部 fetch，不连接现场，也不发送真实语音命令。
const requests: unknown[] = []
const state: PromptVoiceState = {
  active: false, step: null, phase: 'stopped', error: '', version: 0,
  instance: 'local-broadcast-preview',
  options: [{ step: 9, text: '前方超限车辆倒车，请注意避让' }],
}
Object.assign(window, { broadcastPreviewRequests: requests })
window.fetch = async (input, init) => {
  const path = new URL(input instanceof Request ? input.url : String(input), location.href).pathname
  if (!path.endsWith('/device/voice/prompt')) return new Response('', { status: 503 })
  if (init?.method === 'POST') {
    const command = JSON.parse(String(init.body))
    requests.push(command)
    await new Promise(resolve => setTimeout(resolve, 300))
    if (new URLSearchParams(location.search).has('fail')) {
      return Response.json({ code: 1, message: '模拟播报失败，请重试', data: state })
    }
    state.active = command.action === 'start'
    state.step = state.active ? command.step : null
    state.phase = state.active ? 'playing' : 'stopped'
    state.version++
  }
  return Response.json({ code: 0, message: 'ok', data: state })
}

const style = document.createElement('style')
style.textContent = `
  * { box-sizing: border-box; }
  body { margin: 0; background: #edf4ef; color: #294d40; font-family: 'Microsoft YaHei', sans-serif; }
  .preview-header { padding: 22px 28px; background: linear-gradient(#c7e1d5, #e7f2eb); border-bottom: 1px solid #c4dcd0; }
  .preview-header strong { display: block; font-size: 21px; }
  .preview-header p { margin: 8px 0 0; color: #628276; font-size: 13px; }
  .preview-workflow { position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); width: min(800px, 96vw); padding: 28px 0; border: 1px solid #c4dcd0; border-radius: 10px; background: white; }
`
document.head.append(style)
createApp({
  render: () => h('main', [
    h('div', { class: 'preview-header' }, [h('strong', '广播 · 本地效果预览'), h('p', '播报状态已模拟，可点击图标查看开始与停止效果。')]),
    h('div', { class: 'preview-workflow' }, [h(WorkflowIcons)]),
  ]),
}).mount('#app')
void nextTick(() => document.querySelector<HTMLButtonElement>('[aria-label="广播"]')?.click())
