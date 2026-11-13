<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { installKeyboardScanner } from './keyboardScanner'
import { parsePasscode, type PasscodeInfo } from './passcode'
import { createPasscodeQrImage, emptyCaptureJson, photoStamp, uploadMobileJson } from './mobileProtocol'

const props = defineProps<{ enabled: boolean }>()
const emit = defineEmits<{ decoded: [info: PasscodeInfo, image: string] }>()
const input = ref<HTMLTextAreaElement | null>(null)
const message = ref('扫码仪可直接扫描')
const failed = ref(false)
const uploading = ref(false)
const dialogOpen = ref(false)
const receiving = computed(() => props.enabled && !dialogOpen.value)
let receiver: ReturnType<typeof installKeyboardScanner> | undefined
let observer: MutationObserver | undefined
let lastRaw = ''
let lastAt = 0
let closed = false
const controller = new AbortController()

async function upload(raw: string) {
  uploading.value = true
  failed.value = false
  const json = emptyCaptureJson()
  json.passcodeQRCodeInfo = raw
  const ok = await uploadMobileJson(`photo_${photoStamp()}_${Date.now()}.json`, json, controller.signal)
  if (closed) return
  uploading.value = false
  failed.value = !ok
  message.value = ok ? '扫码已自动填入' : '已填入，上传失败'
}

async function accept(raw: string) {
  if (closed) return
  if (uploading.value) { message.value = '正在处理，请稍后重扫'; return }
  if (raw === lastRaw && Date.now() - lastAt < 5000) return
  const info = parsePasscode(raw)
  if (!info) return
  lastRaw = raw
  lastAt = Date.now()
  uploading.value = true
  message.value = '正在回填通行码…'
  const image = await createPasscodeQrImage(raw).catch(() => '')
  if (closed) return
  emit('decoded', info, image)
  await upload(raw)
}

onMounted(() => {
  const checkDialogs = () => {
    dialogOpen.value = Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"], .qt-msgbox-overlay'))
      .some(element => element.getClientRects().length > 0)
  }
  checkDialogs()
  observer = new MutationObserver(checkDialogs)
  observer.observe(document.body, { childList: true, subtree: true })
  receiver = installKeyboardScanner({
    input: input.value!, enabled: () => receiving.value,
    accept: raw => { void accept(raw) },
    invalid: () => { message.value = '通行码不完整，请重新扫描' },
  })
  receiver.refresh()
})
watch(receiving, async () => { await nextTick(); receiver?.refresh() })
onUnmounted(() => { closed = true; observer?.disconnect(); receiver?.dispose(); controller.abort() })
</script>

<template>
  <div class="scanner-status" :class="{ 'scanner-warning': failed }" role="status" aria-live="polite">
    <span>{{ receiving ? message : '扫码接收已暂停' }}</span>
    <button v-if="failed" type="button" :disabled="uploading" @click="upload(lastRaw)">重试上传</button>
    <textarea ref="input" class="scanner-receiver" tabindex="-1" aria-hidden="true" inputmode="none"
      autocomplete="off" autocapitalize="off" :spellcheck="false" :disabled="!receiving" />
  </div>
</template>

<style scoped>
.scanner-status { min-width: 0; font-size: 12px; color: #497b6d; text-align: right; }
.scanner-status span { display: inline-block; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle; }
.scanner-warning { color: #b45309; }
.scanner-status button { border: 0; background: transparent; color: #b45309; text-decoration: underline; cursor: pointer; }
.scanner-receiver { position: fixed; left: 0; top: 0; width: 1px; height: 1px; opacity: 0; pointer-events: none; padding: 0; border: 0; font-size: 16px; }
</style>
