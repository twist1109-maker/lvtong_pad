<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { ApiError } from '@/api/request'
import { getRadiationApi, startRadiationApi, stopRadiationApi, type RadiationState } from '@/api/radiation'
import { appConfig } from '@/config/env'

const emit = defineEmits<{ close: [] }>()
const state = ref<RadiationState | null>(null)
const busy = ref(false)
const known = ref(false)
const error = ref('')
const closeRequested = ref(false)
const dialog = ref<HTMLElement | null>(null)
const now = ref(Date.now())
let disposed = false
let polling = false
let sequence = 0
let applied = 0
let timer: ReturnType<typeof setInterval>
let sampledAt = Date.now()
let mayHaveStarted = false

const active = computed(() => state.value?.active === true)
const gateLowered = computed(() => known.value && state.value?.gateLowered === true)
const gateText = computed(() => !known.value || state.value?.gateLowered == null
  ? '栏杆机：状态待确认，禁止检测'
  : state.value.gateLowered ? '栏杆机：已落下（设备反馈）' : '栏杆机：已抬起，请先落杆')
const measuring = computed(() => state.value?.phase === 'measuring')
const samples = computed(() => state.value?.samples || [])
const maximum = computed(() => samples.value.length ? Math.max(...samples.value.map(point => point.value)) : null)
const detected = computed(() => state.value?.result?.value ?? maximum.value)
const resultText = computed(() => {
  if (!known.value) return '状态待确认'
  switch (state.value?.phase) {
    case 'measuring': return '检测中'
    case 'stopping': return '等待光源关闭'
    case 'completed': return state.value.result?.level === 'normal' ? '正常' : '较高'
    case 'cancelled': return '已中止'
    case 'failed': return '无法判定'
    default: return '待检测'
  }
})
const elapsed = computed(() => {
  const base = state.value?.elapsedSeconds || 0
  return Math.min(6, base + (measuring.value ? Math.max(0, now.value - sampledAt) / 1000 : 0))
})
const liveValue = computed(() => {
  const last = state.value?.latest
  return known.value && last && now.value - last.receivedAt <= 2000 ? last.value : null
})
const yMax = computed(() => Math.max(35, Math.ceil((maximum.value || 0) / 10) * 10))
const y = (value: number) => 246 - value / yMax.value * 216
const x = (time: number) => 84 + time / 6 * 576
const points = computed(() => samples.value.map(point => `${x(point.time)},${y(point.value)}`).join(' '))
const lastPoint = computed(() => samples.value[samples.value.length - 1])
const isHigh = computed(() => (detected.value || 0) > 15)
const format = (value: number | null) => value == null ? '—' : Number(value.toFixed(3)).toString()
const detectedTime = computed(() => state.value?.startedAt
  ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(state.value.startedAt)
  : '—')

function apply(value: RadiationState, requestId: number) {
  if (disposed || !value || typeof value.active !== 'boolean' || requestId < applied) return
  if (state.value?.runId === value.runId && value.revision < state.value.revision) return
  applied = requestId
  state.value = value
  sampledAt = Date.now()
  known.value = true
  if (closeRequested.value && !value.active) emit('close')
}

async function refresh() {
  if (disposed || polling || busy.value) return
  polling = true
  const requestId = ++sequence
  try {
    const response = await getRadiationApi()
    apply(response.data, requestId)
    if (requestId >= applied) error.value = ''
  } catch {
    if (!disposed && requestId >= applied) {
      known.value = false
      error.value = '连接中断，检测状态待确认。恢复连接后继续核对两个光源是否关闭。'
    }
  } finally { polling = false }
}

async function control(action: 'start' | 'stop') {
  if (busy.value || (action === 'start' && (!gateLowered.value || active.value))) return
  if (action === 'stop' && !state.value?.runId) return
  busy.value = true
  if (action === 'start') mayHaveStarted = true
  const requestId = ++sequence
  applied = requestId
  error.value = ''
  try {
    const response = action === 'start' ? await startRadiationApi() : await stopRadiationApi(state.value!.runId)
    apply(response.data, requestId)
  } catch (reason) {
    if (disposed) return
    known.value = false
    if (reason instanceof ApiError && reason.data && typeof reason.data === 'object') {
      apply(reason.data as RadiationState, requestId)
    }
    error.value = reason instanceof Error ? reason.message : '请求结果待确认'
    // 请求结果不明时只补查，绝不自动重发开启命令。
  } finally { busy.value = false }
}

function requestClose() {
  if (busy.value) return
  if (!known.value && !active.value && !mayHaveStarted) { emit('close'); return }
  if (!known.value) { error.value = '请先恢复连接并确认检测及光源状态'; void refresh(); return }
  if (active.value) {
    closeRequested.value = true
    void control('stop')
  } else emit('close')
}

function stopOnLeave() {
  if (!state.value?.active || !state.value.runId) return
  const token = localStorage.getItem('lvtong_token') || sessionStorage.getItem('lvtong_token')
  void fetch(`${appConfig.apiBaseUrl}/device/radiation-detection`, {
    method: 'POST', keepalive: true,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ action: 'stop', runId: state.value.runId }),
  }).catch(() => {})
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); requestClose() }
  if (event.key !== 'Tab') return
  const controls = Array.from(dialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') || [])
  const first = controls[0], last = controls[controls.length - 1]
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
}

onMounted(() => {
  void refresh()
  timer = setInterval(() => { now.value = Date.now(); void refresh() }, 250)
  document.addEventListener('keydown', onKeydown)
  window.addEventListener('pagehide', stopOnLeave)
  void nextTick(() => dialog.value?.focus())
})
onUnmounted(() => {
  stopOnLeave()
  disposed = true
  clearInterval(timer)
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('pagehide', stopOnLeave)
})
</script>

<template>
  <Teleport to="body">
    <div class="radiation-mask">
      <section ref="dialog" class="radiation-dialog" role="dialog" aria-modal="true" aria-labelledby="radiation-title" tabindex="-1">
        <header>
          <div><h2 id="radiation-title">辐射值检测</h2><span>双光源 · 6 秒定时检测</span></div>
          <button type="button" class="close" aria-label="关闭辐射检测" :disabled="busy" @click="requestClose">×</button>
        </header>
        <div class="radiation-content">
          <div class="readings">
            <div><span>检测值 <small>（6秒峰值）</small></span><strong>{{ format(detected) }} <small>μSv/h</small></strong></div>
            <div class="result" :class="{ high: isHigh, normal: state?.phase === 'completed' && !isHigh }"><span>结果</span><strong>{{ resultText }}</strong></div>
            <div class="timestamp"><span>检测时间</span><b>{{ detectedTime }}</b></div>
            <div class="live"><span>实时</span><b>{{ format(liveValue) }} <small>μSv/h</small></b></div>
          </div>
          <svg class="radiation-chart" viewBox="0 0 780 300" role="img" aria-label="辐射剂量率随时间曲线，横坐标0至6秒，纵坐标微希沃特每小时">
            <text x="84" y="18" class="axis-label">剂量率（μSv/h）</text>
            <template v-for="tick in [0, 15, 30]" :key="tick">
              <line x1="84" :y1="y(tick)" x2="660" :y2="y(tick)" class="reference" :class="`line-${tick}`" />
              <text x="16" :y="y(tick) + 5">{{ tick === 0 ? '本底' : tick === 15 ? '正常' : '较高' }}</text>
              <text x="678" :y="y(tick) + 5">{{ tick }} μSv/h</text>
            </template>
            <line x1="84" y1="30" x2="84" y2="246" class="axis" />
            <template v-for="tick in [0, 1, 2, 3, 4, 5, 6]" :key="tick">
              <line :x1="x(tick)" y1="246" :x2="x(tick)" y2="252" class="axis" />
              <text :x="x(tick)" y="275" text-anchor="middle" class="axis-label">{{ tick }}</text>
            </template>
            <text x="678" y="275" class="axis-label">时间（s）</text>
            <polyline v-if="samples.length" :points="points" class="curve" :class="{ high: isHigh }" />
            <circle v-if="lastPoint" :cx="x(lastPoint.time)" :cy="y(lastPoint.value)" r="5" class="curve-point" :class="{ high: isHigh }" />
            <text v-if="!samples.length" x="372" y="180" text-anchor="middle" class="empty">点击检测，采集实时辐射值</text>
          </svg>
          <div class="progress-row"><span>{{ elapsed.toFixed(1) }} / 6.0 s</span><div class="progress"><i :style="{ width: `${elapsed / 6 * 100}%` }" /></div></div>
          <div class="source-feedback" aria-live="polite">
            <span v-for="(source, index) in ['200', '160']" :key="source" :class="{ on: known && state?.sources?.[index] === true }">{{ source }} 光源：{{ !known || state?.sources?.[index] == null ? '待反馈' : state.sources[index] ? '已开启' : '已关闭' }}</span>
            <b v-if="state?.bothSourcesOff">两个光源均已确认关闭</b>
            <b v-else-if="state?.phase === 'stopping'" class="stopping">正在停机，等待两个光源关闭确认…</b>
          </div>
          <p v-if="error || state?.error" role="alert" class="error">{{ error || state?.error }}</p>
          <footer>
            <span class="gate-feedback" :class="{ ready: gateLowered }" role="status"><i aria-hidden="true" />{{ gateText }}</span>
            <button v-if="active" type="button" class="detect stop" :disabled="busy" @click="control('stop')">{{ busy ? '正在停止…' : '停止检测' }}</button>
            <button v-else type="button" class="detect" :disabled="busy || !gateLowered" @click="control('start')">{{ busy ? '正在启动…' : '检 测' }}</button>
          </footer>
          <p class="footnote">检测值取 6 秒内最大值；≤15 μSv/h 正常，>15 μSv/h 较高。到时自动停机，双光源关闭确认后结束。</p>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.radiation-mask { position: fixed; inset: 0; z-index: 25000; background: #152a4266; display: flex; align-items: center; justify-content: center; padding: 16px; }
.radiation-dialog { width: min(900px, 100%); max-height: calc(100dvh - 32px); overflow: auto; background: #fff; border-radius: 12px; box-shadow: 0 18px 70px #102a4344; color: #1d3346; outline: none; }
header { display: flex; align-items: center; justify-content: space-between; padding: 18px 26px; border-bottom: 1px solid #e2e9ec; h2 { margin: 0 0 5px; font-size: 22px; } span { font-size: 13px; color: #738490; } }
.close { border: 0; background: none; font-size: 30px; color: #74838c; cursor: pointer; padding: 4px 10px; }
.radiation-content { padding: 26px 32px 20px; }
.readings { display: grid; grid-template-columns: 1.4fr 1fr; gap: 25px 12px; > div { display: flex; align-items: baseline; gap: 16px; } span { font-size: 16px; white-space: nowrap; } strong { font-size: 24px; } small { font-size: 14px; font-weight: normal; } b { font-size: 17px; } .result, .live { justify-content: flex-end; } .normal strong { color: #059669; } .high strong { color: #e5483b; } }
.radiation-chart { display: block; width: 100%; height: auto; margin: 24px 0 0; overflow: visible; text { font-size: 16px; font-family: inherit; fill: #263f50; } .axis-label { font-size: 13px; fill: #738490; } .empty { fill: #98a8b2; font-size: 15px; } }
.reference { stroke-dasharray: 10 8; stroke-width: 2; }.line-0 { stroke: #53636d; }.line-15 { stroke: #69c779; }.line-30 { stroke: #ed5045; }.axis { stroke: #b8c5ca; }.curve { fill: none; stroke: #61be72; stroke-width: 3; stroke-linejoin: round; }.curve-point { fill: #61be72; stroke: white; stroke-width: 2; }.curve.high { stroke: #ed5045; }.curve-point.high { fill: #ed5045; }
.progress-row { display: flex; align-items: center; gap: 18px; color: #74838c; font-size: 13px; }.progress { height: 5px; background: #eaf0f2; flex: 1; border-radius: 3px; overflow: hidden; i { display: block; height: 100%; background: #099c83; transition: width .2s linear; } }
.source-feedback { display: flex; flex-wrap: wrap; gap: 10px 24px; margin-top: 20px; font-size: 13px; color: #58717b; .on, .stopping { color: #d96c18; } b { color: #078f77; font-weight: 500; } }
footer { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-top: 24px; }
.gate-feedback { display: flex; gap: 8px; align-items: center; font-size: 15px; color: #b76c20; i { flex: 0 0 8px; width: 8px; height: 8px; border-radius: 50%; background: currentColor; } &.ready { color: #078f77; } }
.detect { min-width: 140px; min-height: 52px; border: 0; border-radius: 7px; background: #ed493e; color: white; font-size: 22px; font-weight: 700; cursor: pointer; }.detect:disabled { opacity: .45; cursor: default; }.stop { background: #c53c32; font-size: 18px; }
.footnote { font-size: 12px; color: #7c8d96; line-height: 1.7; margin: 18px 0 0; }.error { padding: 10px 14px; background: #fff0ed; color: #c53c32; font-size: 14px; line-height: 1.6; border-radius: 4px; }
@media (max-width: 600px) { .radiation-mask { padding: 8px; }.radiation-dialog { max-height: calc(100dvh - 16px); }header { padding: 14px 16px; }.radiation-content { padding: 20px 14px; }.readings { grid-template-columns: 1fr; gap: 14px; .result, .live { justify-content: flex-start; } strong { font-size: 22px; } }.readings .timestamp b { font-size: 14px; }.radiation-chart { margin-top: 20px; }footer { align-items: stretch; flex-direction: column; gap: 18px; }.gate-feedback { font-size: 14px; }.source-feedback { gap: 8px 18px; } }
</style>
