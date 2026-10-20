import type { useHikvisionPlayer } from '@/composables/useHikvisionPlayer'

export type HikCapturePlayer = ReturnType<typeof useHikvisionPlayer>

let capturePlayer: HikCapturePlayer | null = null

export function registerHikCapturePlayer(player: HikCapturePlayer) {
  capturePlayer = player
}

export function unregisterHikCapturePlayer(player: HikCapturePlayer) {
  if (capturePlayer === player) capturePlayer = null
}

export function getHikCapturePlayer(): HikCapturePlayer {
  if (!capturePlayer) {
    throw new Error('图像采集海康预览尚未初始化（HikvisionCaptureHost）')
  }
  return capturePlayer
}

export function hasHikCapturePlayer(): boolean {
  return capturePlayer != null
}
