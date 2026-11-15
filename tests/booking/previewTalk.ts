import { computed, onBeforeUnmount, ref } from 'vue'

export function useBrowserTalk() {
  const talking = ref(false)
  const busy = ref(false)
  const speakerMuted = ref(false)
  const error = ref('')
  const hint = computed(() => busy.value ? '正在连接对讲…' : talking.value ? '通话中' : '')
  let timer: ReturnType<typeof setTimeout>
  function stop() { clearTimeout(timer); talking.value = busy.value = speakerMuted.value = false }
  function toggle() {
    if (talking.value || busy.value) stop()
    else { busy.value = true; timer = setTimeout(() => { busy.value = false; talking.value = true }, 600) }
  }
  function toggleSpeaker() { if (talking.value) speakerMuted.value = !speakerMuted.value }
  onBeforeUnmount(stop)
  return { talking, busy, hint, error, speakerMuted, stop, toggle, toggleSpeaker }
}
