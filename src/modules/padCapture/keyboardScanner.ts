import { normalizePasscodeRaw, parsePasscode } from './passcode'

/** 键盘式 USB 扫码：原生输入接收中文，非接收框内用按键缓冲保留完整数据。 */
export function installKeyboardScanner(options: {
  input: HTMLTextAreaElement
  enabled: () => boolean
  accept: (raw: string) => void
  invalid: () => void
}) {
  const sink = options.input
  let buffer = ''
  let timer: ReturnType<typeof setTimeout> | undefined
  let lastKey = ''
  let composing = false
  let committedComposition = ''
  let original: { element: HTMLInputElement | HTMLTextAreaElement; value: string; start: number | null; end: number | null } | null = null
  const editable = (target: EventTarget | null): target is HTMLInputElement | HTMLTextAreaElement =>
    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
  const candidate = () => (buffer.match(/[|｜]/g)?.length ?? 0) >= 6

  function reset() {
    clearTimeout(timer)
    buffer = ''
    sink.value = ''
    original = null
    lastKey = ''
    committedComposition = ''
  }

  function remember(target: EventTarget | null) {
    if (!buffer && editable(target) && target !== sink && !original) {
      original = { element: target, value: target.value, start: target.selectionStart, end: target.selectionEnd }
    }
  }

  function beginCode(text: string, target: EventTarget | null) {
    // 人工输入后立即扫码时，从通行码车牌首字重新收包，保留此前录入。
    if (/^[京津沪渝冀豫云辽徑黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼港澳]/u.test(text)
      && buffer && !buffer.startsWith(text) && !candidate()) {
      reset()
      remember(target)
    }
  }

  function finish() {
    if (composing) return
    const raw = normalizePasscodeRaw(buffer)
    const valid = !!parsePasscode(raw)
    const looksLikeCode = candidate()
    // 扫码落在人工字段时撤销设备键入；普通手工输入不匹配通行码，不干预。
    if ((valid || looksLikeCode) && original) {
      original.element.value = original.value
      original.element.dispatchEvent(new Event('input', { bubbles: true }))
      if (original.start !== null) original.element.setSelectionRange(original.start, original.end)
    }
    reset()
    if (!options.enabled()) return
    if (valid) options.accept(raw)
    else if (looksLikeCode) options.invalid()
  }

  function schedule() {
    clearTimeout(timer)
    if (buffer.length > 4096) { reset(); return }
    timer = setTimeout(finish, 400)
  }

  function onKey(event: KeyboardEvent) {
    if (!options.enabled() || document.hidden) return
    if (event.isComposing || composing || event.key === 'Process') { remember(event.target); return }
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (event.key === 'Enter' || event.key === 'Tab') {
      if ((event.target === sink && buffer) || candidate()) {
        event.preventDefault()
        event.stopImmediatePropagation()
        finish()
      } else reset()
      return
    }
    if (event.key.length !== 1) {
      if (!['Shift', 'CapsLock'].includes(event.key)) reset()
      return
    }
    beginCode(event.key, event.target)
    remember(event.target)
    lastKey = event.key
    if (event.target !== sink) {
      buffer += event.key
      // 无输入焦点时仍接收扫码字符，不触发空格按钮等默认行为。
      if (!editable(event.target) && !(event.target instanceof HTMLSelectElement)
        && !(event.target instanceof HTMLElement && event.target.isContentEditable)) {
        event.preventDefault()
      }
      schedule()
    }
  }

  function onInput(event: Event) {
    if (!options.enabled()) return
    const input = event as InputEvent
    if (input.target === sink) buffer = sink.value
    else if (!input.isComposing && !composing && input.data && input.data !== lastKey && input.data !== committedComposition) buffer += input.data
    lastKey = ''
    committedComposition = ''
    if (!composing && !input.isComposing) schedule()
  }

  function onBeforeInput(event: Event) {
    if (!options.enabled()) return
    const data = (event as InputEvent).data
    if (data) beginCode(data, event.target)
    remember(event.target)
  }
  function onCompositionStart(event: Event) {
    if (!options.enabled()) return
    remember(event.target)
    composing = true
    clearTimeout(timer)
  }
  function onCompositionEnd(event: CompositionEvent) {
    composing = false
    if (!options.enabled()) return
    if (event.target === sink) buffer = sink.value
    else buffer += event.data
    committedComposition = event.data
    schedule()
  }
  function onPaste(event: ClipboardEvent) {
    if (!options.enabled()) return
    const raw = event.clipboardData?.getData('text') ?? ''
    if (!parsePasscode(raw)) return
    event.preventDefault()
    reset()
    options.accept(normalizePasscodeRaw(raw))
  }
  function focus() {
    if (!options.enabled() || document.hidden) return
    const target = document.activeElement
    if (!editable(target) && !(target instanceof HTMLSelectElement)
      && !(target instanceof HTMLElement && target.isContentEditable)) sink.focus({ preventScroll: true })
  }
  function onPointer() { queueMicrotask(focus) }
  function onBlur() { reset(); composing = false }
  function onFocusIn() { reset(); composing = false }
  document.addEventListener('keydown', onKey, true)
  document.addEventListener('beforeinput', onBeforeInput, true)
  document.addEventListener('input', onInput, true)
  document.addEventListener('compositionstart', onCompositionStart, true)
  document.addEventListener('compositionend', onCompositionEnd, true)
  document.addEventListener('paste', onPaste, true)
  document.addEventListener('click', onPointer)
  document.addEventListener('focusin', onFocusIn)
  window.addEventListener('blur', onBlur)
  window.addEventListener('focus', focus)
  return {
    refresh() { reset(); composing = false; focus() },
    dispose() {
      reset()
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('beforeinput', onBeforeInput, true)
      document.removeEventListener('input', onInput, true)
      document.removeEventListener('compositionstart', onCompositionStart, true)
      document.removeEventListener('compositionend', onCompositionEnd, true)
      document.removeEventListener('paste', onPaste, true)
      document.removeEventListener('click', onPointer)
      document.removeEventListener('focusin', onFocusIn)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', focus)
    },
  }
}
