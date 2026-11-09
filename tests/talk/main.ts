// Dedicated verification surface: never mounts Dashboard or any booking workflow.
import { createApp, defineComponent, h } from 'vue'
import { useBrowserTalk } from '../../src/composables/useBrowserTalk'
createApp(defineComponent({
  setup() {
    const talk = useBrowserTalk()
    return () => h('main', [
      h('h1', '独立对讲验收'),
      h('button', { onClick: talk.toggle }, talk.talking.value ? '结束对讲' : talk.busy.value ? '取消连接' : '开始对讲'),
      h('div', { id: 'state' }, talk.state.value),
      h('div', { id: 'hint' }, talk.hint.value),
      h('pre', { id: 'stats' }, JSON.stringify(talk.stats.value)),
      h('pre', { id: 'diagnostics' }, JSON.stringify(talk.diagnostics.value)),
    ])
  },
})).mount('#app')
