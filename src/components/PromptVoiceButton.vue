<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { controlPromptVoiceApi, getPromptVoiceApi, type PromptVoiceState } from '@/api/device'

const active = ref(false)
const busy = ref(false)
const visible = ref(false)
const error = ref('')
const options = ref([{ step: 9, text: '前方超限车辆倒车，请注意避让' }])
const trigger = ref<HTMLButtonElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
let version = -1
let instance = ''
let disposed = false
let reading = false
let timer: ReturnType<typeof setInterval> | undefined

function apply(state: PromptVoiceState) {
  if (disposed || !state || typeof state.active !== 'boolean') return
  if (state.instance === instance && state.version < version) return
  instance = state.instance
  version = state.version
  active.value = state.active
  if (Array.isArray(state.options) && state.options.length) options.value = state.options
  if (state.error && error.value !== state.error) {
    error.value = state.error
    void openList()
  }
}

async function refresh() {
  if (disposed || busy.value || reading) return
  reading = true
  try {
    const response = await getPromptVoiceApi()
    if (response.code === 0) apply(response.data)
  } catch { /* 网络不确定时保留最近状态，不能误报已停止。 */ }
  finally { reading = false }
}

async function openList() {
  if (disposed) return
  visible.value = true
  await nextTick()
  closeButton.value?.focus()
}

function closeList() {
  visible.value = false
  void nextTick(() => trigger.value?.focus())
}

async function control(action: 'start' | 'stop', step?: number) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    const response = await controlPromptVoiceApi(action, step)
    if (response.code !== 0) throw new Error(response.message || '语音操作失败，请重试')
    apply(response.data)
    if (!disposed) closeList()
  } catch (reason) {
    if (!disposed) {
      error.value = reason instanceof Error ? reason.message : '语音操作失败，请重试'
      await openList()
    }
  } finally { busy.value = false }
}

function onTrigger() {
  if (active.value) void control('stop')
  else { error.value = ''; void openList() }
}

function onKeydown(event: KeyboardEvent) {
  if (!visible.value) return
  if (event.key === 'Escape') { event.preventDefault(); closeList() }
  if (event.key === 'Tab') {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.prompt-dialog button:not(:disabled)'))
    const first = buttons[0], last = buttons[buttons.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
}

onMounted(() => {
  void refresh()
  timer = setInterval(() => { void refresh() }, 1500)
  document.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
  disposed = true
  clearInterval(timer)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="prompt-control">
    <button ref="trigger" type="button" class="prompt-trigger" aria-label="广播"
      :aria-pressed="active" :aria-busy="busy" :disabled="busy"
      :title="active ? '正在循环播报，点击停止' : '选择广播语音'" @click="onTrigger">
      <img src="/assets/img/a_sh.png" alt="广播" :class="{ 'prompt-blink': active }" />
      <span :class="{ active }">广播</span>
    </button>
    <Teleport to="body">
      <div v-if="visible" class="prompt-mask" @click.self="closeList">
        <section class="prompt-dialog" role="dialog" aria-modal="true" aria-label="广播语音">
          <header><strong>广播语音</strong><button ref="closeButton" type="button" aria-label="关闭语音列表" @click="closeList">×</button></header>
          <p>选择后循环播报，每轮间隔 2 秒。再次点击底部“广播”停止。</p>
          <button v-for="option in options" :key="option.step" class="prompt-option" type="button"
            :disabled="busy || active" @click="control('start', option.step)">
            <span class="prompt-number">{{ option.step }}</span><span>{{ option.text }}</span>
          </button>
          <div v-if="error" role="alert" class="prompt-error">{{ error }}</div>
          <button v-if="active" class="prompt-stop" type="button" :disabled="busy" @click="control('stop')">停止播报</button>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.prompt-control { flex-shrink: 0; min-width: 0; }
.prompt-trigger { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 0; border: 0; background: transparent; cursor: pointer;
  img { width: 52px; height: 52px; object-fit: contain; }
  span { font-size: 14px; font-weight: bold; color: #333; white-space: nowrap; }
  span.active { color: #d97706; }
  &:disabled { cursor: wait; }
}
.prompt-blink { animation: prompt-blink 1s ease-in-out infinite; }
@keyframes prompt-blink { 0%, 100% { opacity: 1; } 50% { opacity: .25; } }
.prompt-mask { position: fixed; inset: 0; z-index: 20000; display: grid; place-items: center; padding: 16px; background: #0005; }
.prompt-dialog { width: min(520px, 100%); max-height: 85dvh; overflow: auto; background: #fff; color: #333; border-radius: 12px; padding: 18px; box-shadow: 0 12px 48px #0003; box-sizing: border-box;
  header { display: flex; align-items: center; justify-content: space-between; font-size: 20px; }
  header button { border: 0; background: transparent; font-size: 28px; cursor: pointer; padding: 0 8px; }
  p { font-size: 14px; line-height: 1.6; color: #666; }
}
.prompt-option { display: flex; align-items: center; gap: 12px; width: 100%; padding: 16px 12px; border: 1px solid #b8dcd4; border-radius: 8px; background: #f1faf7; color: #155e50; text-align: left; font-size: 18px; line-height: 1.5; cursor: pointer; }
.prompt-number { flex-shrink: 0; display: grid; place-items: center; width: 32px; height: 32px; background: #d6efe6; border-radius: 50%; font-weight: bold; }
.prompt-error { color: #b91c1c; margin-top: 12px; font-size: 15px; }
.prompt-stop { margin-top: 14px; padding: 10px 20px; color: #fff; background: #b91c1c; border: 0; border-radius: 6px; cursor: pointer; }
</style>
