import { onBeforeUnmount, ref, type Ref } from 'vue'

/** 浏览器内直接预览和拍摄设备摄像头，不经过系统文件选择器。 */
export function useDeviceCamera(videoRef: Ref<HTMLVideoElement | null>) {
  const status = ref<'idle' | 'opening' | 'ready' | 'error'>('idle')
  const error = ref('')
  let stream: MediaStream | null = null
  let generation = 0

  function stop() {
    generation++
    const previous = stream
    stream = null
    previous?.getTracks().forEach((track) => track.stop())
    if (videoRef.value?.srcObject === previous && videoRef.value) {
      videoRef.value.srcObject = null
    }
    status.value = 'idle'
  }

  async function start(facingMode: 'user' | 'environment' = 'environment', exactFacing = false): Promise<boolean> {
    stop()
    const request = generation
    status.value = 'opening'
    error.value = ''
    try {
      if (!window.isSecureContext) {
        throw new Error('请使用 HTTPS 并信任网站证书后打开摄像头')
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('当前浏览器不支持网页摄像头，请使用最新版 Chrome 或 Edge')
      }
      const acquired = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: exactFacing ? { exact: facingMode } : { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      })
      if (request !== generation) {
        acquired.getTracks().forEach((track) => track.stop())
        return false
      }
      stream = acquired
      const video = videoRef.value
      if (!video) throw new Error('摄像头预览未就绪，请重试')
      video.srcObject = acquired
      await video.play()
      if (request !== generation) return false
      status.value = 'ready'
      return true
    } catch (cause) {
      if (request !== generation) return false
      stop()
      const name = cause instanceof Error ? cause.name : ''
      const messages: Record<string, string> = {
        NotAllowedError: '摄像头权限未开启，请在浏览器网站设置中允许使用摄像头后重试',
        NotFoundError: '未找到可用摄像头，请检查设备后重试',
        NotReadableError: '摄像头无法打开，可能被其他应用占用，请关闭其他相机应用后重试',
        OverconstrainedError: '摄像头不支持当前拍摄设置，请更换浏览器后重试',
      }
      error.value = messages[name] || (cause instanceof Error ? cause.message : '摄像头打开失败，请重试')
      status.value = 'error'
      return false
    }
  }

  function captureCanvas(): HTMLCanvasElement {
    const video = videoRef.value
    if (status.value !== 'ready' || !video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      throw new Error('摄像头画面尚未就绪，请稍后再拍照')
    }
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('无法拍照，请重试')
    context.drawImage(video, 0, 0)
    return canvas
  }

  function captureJpeg(): string {
    return captureCanvas().toDataURL('image/jpeg', 0.92)
  }

  onBeforeUnmount(stop)
  return { status, error, start, stop, captureCanvas, captureJpeg }
}
