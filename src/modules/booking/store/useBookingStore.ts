/**
 * 预约全局状态 — 对齐 LvTongPro 预约/检测相关成员
 * 弹窗内临时 UI 状态仍由 useBookingDialog 管理；
 * 受理后的流程状态放这里，供 Dashboard / 后续检测步骤使用。
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { BookingAcceptPayload, BookingProcessState } from '../types'
import { DEFAULT_HEAD_WIDTH } from '../api/bookingApi'

export const useBookingStore = defineStore('booking', () => {
  /** 弹窗是否可见 — 对齐 m_pOrderDialog->isVisible */
  const dialogVisible = ref(false)

  /** m_isDetection */
  const isDetection = ref(false)
  /** m_checkstep */
  const checkStep = ref(0)
  /** m_carHeight */
  const carHeight = ref(3.0)
  /** m_carLength（车头长） */
  const carLength = ref(DEFAULT_HEAD_WIDTH)
  /** m_isCheckXRay */
  const isCheckXRay = ref(true)
  /** m_bookingDialogShown */
  const bookingDialogShown = ref(false)
  /** SP 视频流预留 */
  const videoStreamUrl = ref<string | null>(null)
  /** 预约车头雷达图（受理时带入，提交写 radar_head_image_path） */
  const radarHeadImageUrl = ref('')

  // ---- 时间字段（对齐 Qt m_VehicleInspection.* 命名，权威源 = 后端 _booking_state） ----
  /** 司机按键预约时间（来自后端栈） */
  const btnPrebookTime = ref('')
  /** 受理时间 */
  const acceptanceTime = ref('')
  /** 开闸时间 */
  const opengateTime = ref('')
  /** 光幕开启 */
  const openlightscreenTime = ref('')
  /** 光幕关闭 */
  const closelightscreenTime = ref('')
  /** 车顶拍照 */
  const cdPhotoTime = ref('')

  /** 待受理预约（司机/操作台已按键）— 底部「预约」闪烁 */
  const btnPrebookPending = ref(false)

  /** 底部流程「预约」：检测中常亮；待受理闪烁由 bookingPending 另控 */
  const bookingActive = computed(() => isDetection.value || checkStep.value > 0)

  function setBtnPrebookPending(v: boolean) {
    btnPrebookPending.value = v
  }

  function openDialog() {
    if (isDetection.value || checkStep.value > 0) {
      // 对齐：检测中不弹窗
      console.warn('[BookingStore] 检测进行中，忽略预约弹窗')
      return false
    }
    dialogVisible.value = true
    bookingDialogShown.value = true
    return true
  }

  function closeDialog() {
    dialogVisible.value = false
  }

  /** 对齐 onOrderAccept */
  function applyAccept(payload: BookingAcceptPayload) {
    carHeight.value = payload.vehicleHeight
    carLength.value = payload.carHeadLength
    isCheckXRay.value = payload.xrayEnabled
    if (payload.radarHeadImageUrl) {
      radarHeadImageUrl.value = payload.radarHeadImageUrl
    }
    isDetection.value = true
    checkStep.value = 1
    btnPrebookPending.value = false
    dialogVisible.value = false
  }

  /** 对齐 onOrderReject */
  function applyReject() {
    isDetection.value = false
    checkStep.value = 0
    btnPrebookPending.value = false
    dialogVisible.value = false
    radarHeadImageUrl.value = ''
  }

  function setVideoStreamUrl(url: string | null) {
    videoStreamUrl.value = url
  }

  /** 时间字段 setter（WS 收到 booking_accepted 时一次性写） */
  function setTimeFields(p: {
    btnPrebookTime?: string
    acceptanceTime?: string
    opengateTime?: string
    openlightscreenTime?: string
    closelightscreenTime?: string
    cdPhotoTime?: string
  }) {
    if (p.btnPrebookTime !== undefined) btnPrebookTime.value = p.btnPrebookTime
    if (p.acceptanceTime !== undefined) acceptanceTime.value = p.acceptanceTime
    if (p.opengateTime !== undefined) opengateTime.value = p.opengateTime
    if (p.openlightscreenTime !== undefined) openlightscreenTime.value = p.openlightscreenTime
    if (p.closelightscreenTime !== undefined) closelightscreenTime.value = p.closelightscreenTime
    if (p.cdPhotoTime !== undefined) cdPhotoTime.value = p.cdPhotoTime
  }

  /** 用后端 /state 同步 */
  function syncFromServer(state: BookingProcessState) {
    isDetection.value = !!state.is_detection
    checkStep.value = state.check_step ?? 0
    carHeight.value = state.car_height ?? carHeight.value
    carLength.value = state.car_length ?? carLength.value
    isCheckXRay.value = state.is_check_xray ?? isCheckXRay.value
    bookingDialogShown.value = !!state.booking_dialog_shown
    btnPrebookPending.value = !!state.btn_prebook_state
    // 同步时间字段（如果后端 state 里有）
    const s = state as unknown as Record<string, unknown>
    if (typeof s.btn_prebook_time === 'string') btnPrebookTime.value = s.btn_prebook_time
    if (typeof s.acceptance_time === 'string') acceptanceTime.value = s.acceptance_time
    if (typeof s.opengate_time === 'string') opengateTime.value = s.opengate_time
    if (typeof s.openlightscreen_time === 'string') openlightscreenTime.value = s.openlightscreen_time
    if (typeof s.closelightscreen_time === 'string') closelightscreenTime.value = s.closelightscreen_time
    if (typeof s.cd_photo_time === 'string') cdPhotoTime.value = s.cd_photo_time
  }

  function reset() {
    dialogVisible.value = false
    isDetection.value = false
    checkStep.value = 0
    carHeight.value = 3.0
    carLength.value = DEFAULT_HEAD_WIDTH
    isCheckXRay.value = true
    bookingDialogShown.value = false
    videoStreamUrl.value = null
    radarHeadImageUrl.value = ''
    // 重置不清待受理闪烁：与后端保留 btn_prebook_state 一致，由 sync 决定
    // 时间字段也清空
    btnPrebookTime.value = ''
    acceptanceTime.value = ''
    opengateTime.value = ''
    openlightscreenTime.value = ''
    closelightscreenTime.value = ''
    cdPhotoTime.value = ''
  }

  return {
    dialogVisible,
    isDetection,
    checkStep,
    carHeight,
    carLength,
    isCheckXRay,
    bookingDialogShown,
    videoStreamUrl,
    radarHeadImageUrl,
    btnPrebookTime,
    acceptanceTime,
    opengateTime,
    openlightscreenTime,
    closelightscreenTime,
    cdPhotoTime,
    btnPrebookPending,
    bookingActive,
    setBtnPrebookPending,
    openDialog,
    closeDialog,
    applyAccept,
    applyReject,
    setVideoStreamUrl,
    setTimeFields,
    syncFromServer,
    reset,
  }
})
