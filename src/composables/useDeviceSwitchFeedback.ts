import { onUnmounted, shallowRef } from 'vue'
import { DeviceSwitchFeedback } from '@/utils/deviceSwitchFeedback'

export function useDeviceSwitchFeedback(initial: Record<string, boolean>, waitMs = 5000) {
  const model = new DeviceSwitchFeedback(initial, 1000, waitMs)
  const display = shallowRef(model.display())
  const pending = shallowRef<Record<string, boolean>>({})
  const messages = shallowRef<Record<string, string>>({})
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  function sync() {
    if (disposed) return
    clearTimeout(timer)
    model.advance(Date.now())
    display.value = model.display()
    pending.value = Object.fromEntries(Object.keys(model.pending).map(key => [key, true]))
    messages.value = { ...model.messages }
    const wake = model.nextWake()
    if (Number.isFinite(wake)) timer = setTimeout(sync, Math.max(0, wake - Date.now()))
  }
  function feedback(values: Record<string, boolean>, meta: Record<string, unknown>) {
    if (disposed) return false
    const accepted = model.feedback(values, meta, Date.now())
    if (accepted) sync()
    return accepted
  }
  function begin(key: string, target: boolean) { const token = model.begin(key, target, Date.now()); sync(); return token }
  function sent(key: string, token: number) { model.sent(key, token, Date.now()); sync() }
  function fail(key: string, token: number) { model.fail(key, token); sync() }
  onUnmounted(() => { disposed = true; clearTimeout(timer) })
  return { display, pending, messages, feedback, begin, sent, fail }
}
