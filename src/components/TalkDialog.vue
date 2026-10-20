<script setup lang="ts">
/**
 * 可视对讲 — 对齐 Qt TalkDialog.ui / TalkDialog.cpp
 * cam_booking 海康插件预览 + 自动对讲（对齐 lvtong_voice/chat）
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { getHikCapturePlayer } from '@/composables/hikCaptureContext'
import { DEFAULT_GUN_DEVICE_ID, TALK_CAMERA_DEVICE_ID } from '@/config/hikvision'

const emit = defineEmits<{
  close: []
}>()

const liveStageRef = ref<HTMLElement | null>(null)

// 复用宿主 player（与 BookingDialog 一致），避免新建第二个 iframe 抢海康单例插件
const hik = getHikCapturePlayer()
const {
  status: videoStatus,
  statusText: videoStatusText,
  talking,
  talkBusy,
  setAnchor,
  setTalkOnly,
  ensureDevice,
  postLayout,
  hidePluginOverlay,
  startTalk,
  stopTalk,
  toggleTalk,
} = hik

const videoHint = computed(() => {
  if (videoStatus.value === 'playing') return ''
  return videoStatusText.value || '视频区域'
})
const showVideoHint = computed(() => videoStatus.value !== 'playing')

const canToggleTalk = computed(
  () => videoStatus.value === 'playing' && !talkBusy.value,
)

async function onClose() {
  // 停对讲 → HWND 钉屏外 → 切回默认枪机，恢复宿主状态
  try {
    stopTalk()
  } catch {
    /* ignore */
  }
  hidePluginOverlay()
  setTalkOnly(true)
  try {
    await ensureDevice(DEFAULT_GUN_DEVICE_ID)
  } catch {
    /* ignore */
  }
  emit('close')
}

onMounted(async () => {
  await nextTick()
  await new Promise<void>((r) => requestAnimationFrame(() => r()))
  // 对讲需 HWND 可见：取消 talkOnly，锚点设到本弹窗视频区
  setTalkOnly(false)
  setAnchor(liveStageRef.value)
  void ensureDevice(TALK_CAMERA_DEVICE_ID)
  window.setTimeout(() => postLayout(true), 300)
  // 等 playing 后自动开对讲（对齐原 autoTalk）
  void (async () => {
    for (let i = 0; i < 80; i++) {
      if (videoStatus.value === 'playing') break
      await new Promise<void>((r) => window.setTimeout(r, 100))
    }
    await new Promise<void>((r) => window.setTimeout(r, 300))
    await startTalk()
  })()
})

onBeforeUnmount(() => {
  try {
    stopTalk()
  } catch {
    /* ignore */
  }
  hidePluginOverlay()
  setTalkOnly(true)
  void ensureDevice(DEFAULT_GUN_DEVICE_ID)
})
</script>

<template>
  <div class="talk-overlay" @click.self="onClose">
    <div class="talk-dialog" role="dialog" aria-modal="true" aria-label="可视对讲" @click.stop>
      <h2 class="dialog-title">可视对讲</h2>

      <div class="video-panel">
        <div ref="liveStageRef" class="live-stage" />
        <div
          v-if="showVideoHint"
          class="video-status"
          :class="{ err: videoStatus === 'error' }"
        >
          {{ videoHint }}
        </div>
      </div>

      <div class="bottom-row">
        <button
          type="button"
          class="btn-talk"
          :class="{ on: talking }"
          :disabled="!canToggleTalk"
          @click="toggleTalk"
        >
          {{ talking ? '停止对讲' : '开始对讲' }}
        </button>
        <button type="button" class="btn-close" @click="onClose">关 闭</button>
      </div>
    </div>
    <!-- 不再放 iframe：复用 HikvisionCaptureHost 的宿主 iframe，避免抢海康单例插件 -->
  </div>
</template>

<style scoped lang="scss">
.talk-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.talk-dialog {
  width: 840px;
  max-width: 98vw;
  max-height: 96vh;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: 0 12px 12px;
  background: linear-gradient(180deg, #5fbb9e 0%, #f0f9f5 12%, #ffffff 100%);
  border: 1px solid #5fbb9e;
  font-family: 'Microsoft YaHei', '新宋体', sans-serif;
  overflow: hidden;
}

.dialog-title {
  flex: 0 0 auto;
  min-height: 50px;
  margin: 8px;
  padding: 10px;
  font-size: 24px;
  font-weight: 700;
  color: #2c3e50;
  text-align: center;
  background: transparent;
  border: none;
  box-sizing: border-box;
}

.video-panel {
  width: 800px;
  max-width: 100%;
  height: 450px;
  max-height: 55vh;
  margin: 0 auto;
  flex-shrink: 0;
  background: #1a1a1a;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
}

.live-stage {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  background: #000;
  z-index: 1;
}

.video-status {
  position: relative;
  z-index: 2;
  color: #999;
  font-size: 16px;
  user-select: none;
  pointer-events: none;

  &.err {
    color: #c0392b;
  }

  &.talking {
    color: #059669;
    font-weight: 700;
  }
}

.bottom-row {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  padding: 18px 0 8px;
  flex-shrink: 0;
}

.btn-talk,
.btn-close {
  min-width: 120px;
  max-width: 120px;
  padding: 4px 12px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
}

.btn-talk {
  background: #059669;
  color: #ddd;

  &.on {
    background: #d97706;
  }

  &:hover:not(:disabled) {
    color: #fff;
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
}

.btn-close {
  background: #ef4444;
  color: #ddd;

  &:hover {
    color: #fff;
  }
}

.hik-iframe-fs {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  border: 0;
  margin: 0;
  padding: 0;
  background: transparent;
  pointer-events: none;
  z-index: 1001;
}
</style>
