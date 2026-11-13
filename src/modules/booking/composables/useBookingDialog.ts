/**
 * 预约弹窗控制器 — 对齐 OrderDialog 槽函数与局部状态
 */
import { computed, onScopeDispose, ref, watch } from 'vue'
import { DEFAULT_HEAD_WIDTH, getBookingApi } from '../api/bookingApi'
import { useBookingStore } from '../store/useBookingStore'
import type { BookingAcceptPayload, BookingConfirmConfig, VehicleSizeType } from '../types'
import type { BookingPort } from '../ports/bookingPort'
import {
  calcCarHeadLength,
  defaultLinePositionAfterOrigin,
  envelopeFirstNumber,
  linePositionFromVehicleSx,
  PIXEL_TO_METER,
  MANUAL_HEAD_LENGTH_M,
  MANUAL_SCALE_METERS,
  manualHeadLength,
  vehicleTypeFromRadarHeight,
} from '../utils/bookingMath'

const CONFIRM_TEXT: Record<string, BookingConfirmConfig> = {
  accept: { kind: 'accept', title: '受理确认', message: '确定受理此操作吗？' },
  reject: { kind: 'reject', title: '驳回确认', message: '确定要驳回此操作吗？' },
  close: { kind: 'close', title: '确认关闭', message: '确定要关闭对话框吗？' },
}

export function useBookingDialog(api: BookingPort = getBookingApi()) {
  const bookingStore = useBookingStore()

  const loading = ref(false)
  const submitting = ref(false)
  const radarImageUrl = ref<string | null>(null)
  const radarRetryAttempt = ref(0)
  const linePosition = ref(MANUAL_HEAD_LENGTH_M / MANUAL_SCALE_METERS)
  const radarImageReady = ref(false)
  const manualScale = computed(() => !radarImageReady.value || originalImageWidth.value <= 0)
  let lineAdjusted = false
  let suggestedLinePosition = 0.5
  let requestGeneration = 0
  let sessionGeneration = 0
  onScopeDispose(() => { requestGeneration++; sessionGeneration++ })
  const imageEnvelope = ref('')
  const vehicleHeaderEnvelope = ref('')
  const originalImageWidth = ref(0)
  /** Vehicle-SX（米）；null=接口未返回；有则用 SX+1.5m 放红线 */
  const vehicleSx = ref<number | null>(null)
  const contentOriginX = ref<number | undefined>(undefined)
  /** Image-Resolution：米/像素（0.01 → 1px=0.01m） */
  const metersPerPixel = ref(PIXEL_TO_METER)
  const vehicleHeight = ref(3.0)
  const carHeadLength = ref(MANUAL_HEAD_LENGTH_M)
  const xrayEnabled = ref(true)
  const confirmVisible = ref(false)
  const pendingConfirm = ref<BookingConfirmConfig | null>(null)
  const errorMessage = ref('')

  /** 弹窗车型：默认同步车高；用户点图标后以手动为准 */
  const vehicleType = ref<VehicleSizeType>('big')
  const vehicleTypeManual = ref(false)
  let restoringDraft = false
  let dialogInitialized = false
  function restoreDialogDraft() {
    const d = bookingStore.sharedDialogDraft
    if (!d || !Object.keys(d).length) return false
    restoringDraft = true
    if (typeof d.linePosition === 'number') linePosition.value = d.linePosition
    if (typeof d.carHeadLength === 'number') carHeadLength.value = d.carHeadLength
    if (typeof d.vehicleHeight === 'number') vehicleHeight.value = d.vehicleHeight
    if (d.vehicleType === 'small' || d.vehicleType === 'big') vehicleType.value = d.vehicleType
    if (typeof d.xrayEnabled === 'boolean') xrayEnabled.value = d.xrayEnabled
    if (typeof d.radarImageUrl === 'string') radarImageUrl.value = d.radarImageUrl || null
    if (typeof d.imageEnvelope === 'string') imageEnvelope.value = d.imageEnvelope
    if (typeof d.vehicleHeaderEnvelope === 'string') vehicleHeaderEnvelope.value = d.vehicleHeaderEnvelope
    if (typeof d.originalImageWidth === 'number') originalImageWidth.value = d.originalImageWidth
    if (typeof d.metersPerPixel === 'number') metersPerPixel.value = d.metersPerPixel
    if (typeof d.vehicleSx === 'number' || d.vehicleSx === null) vehicleSx.value = d.vehicleSx as number | null
    if (typeof d.contentOriginX === 'number' || d.contentOriginX === null) contentOriginX.value = d.contentOriginX ?? undefined
    lineAdjusted = typeof d.lineAdjusted === 'boolean' ? d.lineAdjusted : true
    vehicleTypeManual.value = typeof d.vehicleTypeManual === 'boolean' ? d.vehicleTypeManual : true
    restoringDraft = false
    return true
  }
  watch(() => bookingStore.sharedDialogDraft, () => { if (dialogInitialized && !restoringDraft) restoreDialogDraft() }, { deep: true, flush: 'sync' })
  watch(() => ({ linePosition: linePosition.value, carHeadLength: carHeadLength.value,
    vehicleHeight: vehicleHeight.value, vehicleType: vehicleType.value, xrayEnabled: xrayEnabled.value,
    radarImageUrl: radarImageUrl.value || '', imageEnvelope: imageEnvelope.value,
    vehicleHeaderEnvelope: vehicleHeaderEnvelope.value, originalImageWidth: originalImageWidth.value,
    metersPerPixel: metersPerPixel.value, vehicleSx: vehicleSx.value, contentOriginX: contentOriginX.value ?? null,
    lineAdjusted, vehicleTypeManual: vehicleTypeManual.value }), (draft) => {
    if (dialogInitialized && !restoringDraft) {
      restoringDraft = true
      bookingStore.sharedDialogDraft = draft
      restoringDraft = false
    }
  }, { deep: true, flush: 'sync' })

  function syncVehicleTypeFromHeight(height: number) {
    if (vehicleTypeManual.value) return
    vehicleType.value = vehicleTypeFromRadarHeight(height)
  }

  const vehicleTypeIcon = computed(() =>
    vehicleType.value === 'big'
      ? '/assets/img/vehicle_big.png'
      : '/assets/img/vehicle_small.png',
  )

  const vehicleTypeTip = computed(() =>
    vehicleType.value === 'big' ? '货车类型:大型' : '货车类型:小型',
  )

  const xrayLabel = computed(() => (xrayEnabled.value ? '透视开' : '透视关'))
  const xrayLabelClass = computed(() => (xrayEnabled.value ? 'is-on' : 'is-off'))
  const xrayIcon = computed(() =>
    xrayEnabled.value ? '/assets/img/xray_open.png' : '/assets/img/xray_close.png',
  )

  /** 对齐 label_imginfo：有数值即显示（不依赖是否有图） */
  const imgInfoText = computed(
    () =>
      `车头长度: ${carHeadLength.value.toFixed(2)}米，高度: ${vehicleHeight.value.toFixed(2)}米`,
  )

  const videoStreamUrl = computed(() => bookingStore.videoStreamUrl)

  function updateCarHeadLength() {
    if (manualScale.value) {
      carHeadLength.value = manualHeadLength(linePosition.value)
      return
    }
    const next = calcCarHeadLength(
      linePosition.value,
      originalImageWidth.value,
      imageEnvelope.value,
      vehicleHeaderEnvelope.value,
      DEFAULT_HEAD_WIDTH,
      {
        vehicleSx: vehicleSx.value != null ? vehicleSx.value : undefined,
        metersPerPixel: metersPerPixel.value,
        contentOriginX: contentOriginX.value,
      },
    )
    carHeadLength.value = next
  }

  function setLinePosition(position: number) {
    if (submitting.value) return
    lineAdjusted = true
    linePosition.value = Math.min(1, Math.max(manualScale.value ? 0.1 / MANUAL_SCALE_METERS : 0, position))
    updateCarHeadLength()
  }

  function onRadarImageLoaded() {
    const selectedLength = carHeadLength.value
    radarImageReady.value = true
    if (manualScale.value) return
    if (lineAdjusted) {
      const originMeters = vehicleSx.value != null
        ? Math.max(0, vehicleSx.value)
        : (contentOriginX.value ?? (envelopeFirstNumber(vehicleHeaderEnvelope.value) - envelopeFirstNumber(imageEnvelope.value))) * metersPerPixel.value
      const position = (originMeters + selectedLength) / (originalImageWidth.value * metersPerPixel.value)
      // 图片范围容纳不了人工选择时继续使用手动尺，避免悄悄缩短避让长度。
      if (position < 0 || position > 1) { onRadarImageError(); return }
      linePosition.value = position
      carHeadLength.value = selectedLength
    } else {
      linePosition.value = suggestedLinePosition
      updateCarHeadLength()
    }
  }

  function onRadarImageError() {
    radarImageReady.value = false
    radarImageUrl.value = null
    originalImageWidth.value = 0
    linePosition.value = Math.min(1, carHeadLength.value / MANUAL_SCALE_METERS)
    errorMessage.value = '雷达图不可用，可按参考刻度估算车头长度后受理'
  }

  async function refreshRadarImage(options?: { maxRetries?: number }) {
    const generation = ++requestGeneration
    const maxRetries = Math.max(1, options?.maxRetries ?? 2)
    loading.value = true
    errorMessage.value = ''
    radarRetryAttempt.value = 0

    let lastErr = ''
    try {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        if (generation !== requestGeneration) return
        radarRetryAttempt.value = attempt
        try {
          const data = await api.fetchRadarImage()
          if (generation !== requestGeneration) return
          if (data?.imageUrl) {
            const alreadyDecoded = radarImageReady.value && radarImageUrl.value === data.imageUrl
            radarImageReady.value = false
            radarImageUrl.value = data.imageUrl
            imageEnvelope.value = data.imageEnvelope || ''
            vehicleHeaderEnvelope.value = data.vehicleHeaderEnvelope || ''
            originalImageWidth.value = data.originalImageWidth || 0
            contentOriginX.value = typeof data.contentOriginX === 'number' && Number.isFinite(data.contentOriginX)
              && (data.contentOriginX !== 0 || envelopeFirstNumber(vehicleHeaderEnvelope.value) === 0)
              ? data.contentOriginX : undefined
            vehicleSx.value =
              typeof data.vehicleSx === 'number' && Number.isFinite(data.vehicleSx)
                ? data.vehicleSx
                : null
            const mpp =
              typeof data.metersPerPixel === 'number' && data.metersPerPixel > 0
                ? data.metersPerPixel
                : Number.parseFloat(data.imageResolution || '') || PIXEL_TO_METER
            metersPerPixel.value = mpp > 0 ? mpp : PIXEL_TO_METER

            if (data.vehicleHeight > 0) {
              vehicleHeight.value = data.vehicleHeight
              // 车高>2.8 自动切大型；未手动改过时随高度同步
              syncVehicleTypeFromHeight(data.vehicleHeight)
            }

            console.info(
              '[Booking] radar meta',
              `attempt=${attempt}/${maxRetries}`,
              `w=${originalImageWidth.value}`,
              `h=${data.vehicleHeight}`,
              `sx=${vehicleSx.value != null ? `${vehicleSx.value}m` : '-'}`,
              `mpp=${metersPerPixel.value}`,
              `originX=${data.contentOriginX ?? '-'}`,
            )

            const width = data.originalImageWidth || 0
            // 优先：红线放在车头后 1.5m（Vehicle-SX + 1.5）/ Resolution
            if (vehicleSx.value != null) {
              const fromSx = linePositionFromVehicleSx(
                vehicleSx.value,
                width,
                metersPerPixel.value,
                DEFAULT_HEAD_WIDTH,
              )
              if (fromSx != null) {
                suggestedLinePosition = fromSx
              }
            } else {
              const originPx = contentOriginX.value ??
                (envelopeFirstNumber(vehicleHeaderEnvelope.value) - envelopeFirstNumber(imageEnvelope.value))
              const fromOrigin = defaultLinePositionAfterOrigin(
                originPx,
                width,
                DEFAULT_HEAD_WIDTH,
                metersPerPixel.value,
              )
              if (fromOrigin != null) {
                suggestedLinePosition = fromOrigin
              }
            }
            errorMessage.value = ''
            if (alreadyDecoded) onRadarImageLoaded()
            return
          }
          lastErr = '雷达未返回图像'
        } catch (e) {
          if (generation !== requestGeneration) return
          lastErr = e instanceof Error ? e.message : '雷达图获取失败'
          console.warn(`[Booking] radar attempt ${attempt}/${maxRetries}:`, lastErr)
        }

        if (attempt < maxRetries) {
          errorMessage.value = `雷达图获取失败，正在重试（${attempt}/${maxRetries}）…`
          await new Promise((r) => setTimeout(r, 1200))
        }
      }

      if (generation !== requestGeneration) return
      onRadarImageError()
      errorMessage.value = `${lastErr || '雷达图获取失败'}（可按参考刻度估算后受理，或直接驳回）`
    } finally {
      if (generation === requestGeneration) {
        loading.value = false
        radarRetryAttempt.value = 0
      }
    }
  }

  /** 对齐 onRefreshOrderDialog。
   * open 提交 step2 组播命令；雷达图与 open 并行拉取。
   */
  async function initDialog(opts?: { fetchRadar?: boolean }) {
    const session = ++sessionGeneration
    if (restoreDialogDraft()) {
      dialogInitialized = true
      return
    }
    requestGeneration++
    xrayEnabled.value = true
    radarImageUrl.value = null
    radarImageReady.value = false
    lineAdjusted = false
    suggestedLinePosition = 0.5
    linePosition.value = MANUAL_HEAD_LENGTH_M / MANUAL_SCALE_METERS
    carHeadLength.value = MANUAL_HEAD_LENGTH_M
    vehicleHeight.value = 3.0
    vehicleSx.value = null
    contentOriginX.value = undefined
    metersPerPixel.value = PIXEL_TO_METER
    vehicleTypeManual.value = false
    vehicleType.value = vehicleTypeFromRadarHeight(3.0)
    imageEnvelope.value = ''
    vehicleHeaderEnvelope.value = ''
    originalImageWidth.value = 0
    errorMessage.value = ''

    dialogInitialized = true

    // 雷达图立刻拉，与 /open 的组播提交并行
    const radarPromise =
      opts?.fetchRadar === false
        ? Promise.resolve()
        : refreshRadarImage({ maxRetries: 2 })

    // 另一终端只恢复正在打开的预约，不能重复派发open的业务命令。
    if (bookingStore.sharedPhase === 'booking') { void radarPromise; return }

    try {
      const openResult = await api.openDialog()
      if (session !== sessionGeneration) return
      if (openResult.videoStreamUrl) {
        bookingStore.setVideoStreamUrl(openResult.videoStreamUrl)
      }
      if (openResult.state) {
        bookingStore.syncFromServer(openResult.state)
      }
    } catch (e) {
      console.warn('[BookingDialog] openDialog 失败:', e)
    }

    // 初始化、视频和雷达均不阻塞操作员受理或驳回。
    void radarPromise
  }

  /** 手动切换大型/小型；之后不再被车高自动覆盖 */
  function toggleVehicleType() {
    vehicleType.value = vehicleType.value === 'big' ? 'small' : 'big'
    vehicleTypeManual.value = true
  }

  function requestConfirm(kind: keyof typeof CONFIRM_TEXT) {
    pendingConfirm.value = CONFIRM_TEXT[kind]
    confirmVisible.value = true
  }

  function cancelConfirm() {
    confirmVisible.value = false
    pendingConfirm.value = null
  }

  function buildAcceptPayload(): BookingAcceptPayload {
    // acceptanceTime 由后端在受理时打点（对齐 Qt QDateTime::currentDateTime()），前端不再生成
    return {
      vehicleHeight: vehicleHeight.value,
      carHeadLength: carHeadLength.value,
      vehicleType: vehicleType.value,
      xrayEnabled: xrayEnabled.value,
      linePosition: linePosition.value,
      radarHeadImageUrl: radarImageReady.value ? radarImageUrl.value || undefined : undefined,
    }
  }

  /**
   * 确认框「是」
   * accept → stopSpCamera + accept API + store
   * reject/close → stopSpCamera + reject API + store
   */
  async function confirmYes(): Promise<
    { kind: 'accept'; payload: BookingAcceptPayload } | { kind: 'reject' } | null
  > {
    const kind = pendingConfirm.value?.kind
    confirmVisible.value = false
    pendingConfirm.value = null
    if (!kind || submitting.value) return null

    submitting.value = true
    const payload = buildAcceptPayload()
    requestGeneration++
    sessionGeneration++
    loading.value = false
    try {
      // 相机清理不阻塞业务决定；payload在清理和网络等待前固定。
      void api.stopVideoSession().catch((e) => console.warn('[Booking] stop-video:', e))
      bookingStore.setVideoStreamUrl(null)

      if (kind === 'accept') {
        await api.acceptBooking(payload)
        bookingStore.applyAccept(payload)
        // 出图由 flask 受理后的占位/硬件拉图 + WS image_ready 负责，不再调 mock_back
        return { kind: 'accept', payload }
      }

      await api.rejectBooking()
      bookingStore.applyReject()
      return { kind: 'reject' }
    } catch (e) {
      errorMessage.value = e instanceof Error ? e.message : '操作失败'
      throw e
    } finally {
      submitting.value = false
    }
  }

  return {
    loading,
    submitting,
    radarImageUrl,
    manualScale,
    setLinePosition,
    onRadarImageLoaded,
    onRadarImageError,
    linePosition,
    vehicleHeight,
    carHeadLength,
    vehicleType,
    xrayEnabled,
    confirmVisible,
    pendingConfirm,
    errorMessage,
    vehicleTypeIcon,
    vehicleTypeTip,
    xrayLabel,
    xrayLabelClass,
    xrayIcon,
    imgInfoText,
    videoStreamUrl,
    refreshRadarImage,
    toggleVehicleType,
    requestConfirm,
    cancelConfirm,
    buildAcceptPayload,
    confirmYes,
    initDialog,
    api,
  }
}
