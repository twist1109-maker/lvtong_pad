<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { controlPromptVoiceApi, getPromptVoiceApi, type PromptVoiceState } from '@/api/device'

const active = ref(false)
const busy = ref(false)
const visible = ref(false)
const error = ref('')
const options = ref([{ step: 9, text: '前方超限车辆倒车，请注意避让' }])
const tiles = computed(() => options.value.map(option => ({
  ...option,
  label: option.step === 9 ? '超限倒车' : option.text,
  icon: option.step === 9 ? '/assets/img/broadcast-reverse.png' : '/assets/img/a_sh.png',
})))
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
          <header><strong>广播语音</strong><button ref="closeButton" type="button" aria-label="关闭广播语音" @click="closeList">×</button></header>
          <div class="prompt-content">
            <div class="prompt-grid" role="group" aria-label="广播语音选择">
              <button v-for="option in tiles" :key="option.step" class="prompt-option" type="button"
                :title="option.text" :aria-label="option.label"
                :disabled="busy || active" @click="control('start', option.step)">
                <img :src="option.icon" alt="" />
                <span>{{ option.label }}</span>
              </button>
            </div>
            <div v-if="error" role="alert" class="prompt-error">{{ error }}</div>
            <button v-if="active" class="prompt-stop" type="button" :disabled="busy" @click="control('stop')">停止播报</button>
          </div>
          <footer>点击图标循环播报，再次点击底部“广播”停止。</footer>
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
.prompt-mask { position: fixed; inset: 0; z-index: 20000; display: grid; place-items: center; padding: 16px; background: #152a4266; }
.prompt-dialog { width: min(580px, 100%); max-height: calc(100dvh - 32px); overflow: auto; background: #fbfdfc; color: #294d40; border: 1px solid #c4dcd3; border-radius: 12px; box-shadow: 0 18px 60px #163d3038; box-sizing: border-box;
  header { display: flex; align-items: center; justify-content: space-between; padding: 16px 22px; border-bottom: 1px solid #cfe2da; background: linear-gradient(180deg, #d6ebe3, #eff7f3); font-size: 20px; }
  header button { display: grid; place-items: center; width: 36px; height: 36px; border: 0; border-radius: 6px; background: transparent; color: #628276; font: inherit; font-size: 28px; cursor: pointer; padding: 0; }
  header button:hover { background: #dbece4; }
  footer { padding: 14px 22px; border-top: 1px solid #e1ece6; color: #71877d; font-size: 13px; line-height: 1.6; }
}
.prompt-content { padding: 22px; }
.prompt-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-template-rows: repeat(3, minmax(120px, auto)); gap: 14px; }
.prompt-option { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; min-width: 0; padding: 14px 8px; border: 1px solid #c5ddd2; border-radius: 9px; background: #f0f7f3; color: #326c55; font: inherit; font-size: 16px; font-weight: 600; line-height: 1.4; text-align: center; cursor: pointer; transition: background .15s, border-color .15s, box-shadow .15s;
  img { display: block; width: 90px; max-width: 100%; height: 64px; object-fit: contain; }
  &:hover:enabled { border-color: #83b89e; background: #e5f2eb; box-shadow: 0 3px 12px #387f5b12; }
  &:active:enabled { background: #d6eade; }
  &:disabled { opacity: .5; cursor: default; }
}
.prompt-dialog button:focus-visible { outline: 3px solid #438d77; outline-offset: 3px; }
.prompt-error { color: #b91c1c; margin-top: 12px; font-size: 15px; }
.prompt-stop { margin-top: 14px; padding: 10px 20px; color: #fff; background: #b91c1c; border: 0; border-radius: 6px; cursor: pointer; }
@media (max-width: 480px) {
  .prompt-mask { padding: 12px; }
  .prompt-dialog { max-height: calc(100dvh - 24px); header { padding: 12px 16px; } footer { padding: 12px 16px; font-size: 12px; } }
  .prompt-content { padding: 16px; }
  .prompt-grid { gap: 10px; grid-template-rows: repeat(3, minmax(96px, auto)); }
  .prompt-option { padding: 10px 4px; gap: 8px; font-size: 14px; img { height: 52px; } }
}
</style>
