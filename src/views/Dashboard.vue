<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useAuthStore } from '@/stores/useAuthStore'
import { useWsStore } from '@/stores/useWsStore'
import { request } from '@/api/request'
import { getCurrentUserApi } from '@/api/auth'
import { controlGateApi, fetchBodyRadarImageApi, type BodyRadarCaptureStatus } from '@/api/device'
import { useDeviceSwitchFeedback } from '@/composables/useDeviceSwitchFeedback'

import AppHeader from '@/components/AppHeader.vue'
import type { ToolAnchor } from '@/components/AppHeader.vue'
import BodyPointCloudPanel from '@/components/BodyPointCloudPanel.vue'
import type { CloudGeometryPayload } from '@/modules/bodyRadar/cloudGeometry'
const BodyCloud3DPanel = defineAsyncComponent(() => import('@/components/BodyCloud3DPanel.vue'))
import PreviewButton from '@/components/PreviewButton.vue'
import ImageGalleryDialog, { type GalleryItem } from '@/components/common/ImageGalleryDialog.vue'
import EvidenceImagePicker from '@/components/capture/EvidenceImagePicker.vue'
import { evidenceCandidates, appendEvidence, type EvidenceCandidate, type EvidenceChoice } from '@/utils/evidenceSelection'
import BottomWorkflowPanel from '@/components/BottomWorkflowPanel.vue'
import type { WorkflowStepKey } from '@/components/WorkflowIcons.vue'
import {
  deriveXrayMachinePhase,
  parsePlcSignalLights,
  parsePlcXrayBits,
  type PlcSignalLights,
  type PlcXrayBits,
  type XrayMachinePhase,
} from '@/utils/plcXrayStatus'
import BookingDialog from '@/modules/booking/BookingDialog.vue'
import TalkDialog from '@/components/TalkDialog.vue'
import SafeCameraDialog from '@/components/SafeCameraDialog.vue'
import AgriculturalSelect from '@/components/AgriculturalSelect.vue'
import LicensePlateEdit from '@/components/LicensePlateEdit.vue'
import CarSizeDialog from '@/components/CarSizeDialog.vue'
import DeviceStatusPanel from '@/components/DeviceStatusPanel.vue'
import PlcControlDialog from '@/components/PlcControlDialog.vue'
import AiStatusDialog from '@/components/AiStatusDialog.vue'
import UserManager from '@/components/UserManager.vue'
import QtMessageBox from '@/components/common/QtMessageBox.vue'
import HistoryDialog from '@/modules/history/HistoryDialog.vue'
import DetailDialog from '@/modules/history/DetailDialog.vue'
import type { InspectionDetail } from '@/modules/history'
import { formatVehicleSizeDisplay } from '@/modules/history/utils/passCodeDisplay'
import CaptureCameraDialog from '@/components/capture/CaptureCameraDialog.vue'
import type { CaptureKind } from '@/components/capture/CaptureCameraDialog.vue'
import DrivingLicenseDialog from '@/components/capture/DrivingLicenseDialog.vue'
import PasscodeScanDialog from '@/modules/padCapture/PasscodeScanDialog.vue'
import type { PasscodeInfo } from '@/modules/padCapture/passcode'
import { useBookingStore } from '@/modules/booking'
import type {
  BookingAcceptPayload,
  BookingAcceptedPayload,
  BookingComingPayload,
} from '@/modules/booking'
import { useRouter } from 'vue-router'
import { toApiUrl, toStoragePath, joinImagePaths } from '@/utils/imagePath'
import { processImage } from '@/utils/imageProcess'
import { resolveCropPreview, type CropBoxPayload } from '@/utils/cropPreview'
import { plateColorStyle } from '@/utils/licensePlate'
import { useWhepPlayer } from '@/composables/useWhepPlayer'
import { PTZ_WHEP_URL } from '@/config/liveVideo'
import { appConfig } from '@/config/env'
const auth = useAuthStore()
const wsStore = useWsStore()
const bookingStore = useBookingStore()
const router = useRouter()

const showHistory = ref(false)
/** 左下第四个“拍照”流程图标：周界相机 A 纯视频。 */
const showSafeCameraDialog = ref(false)
const showTalkDialog = ref(false)
watch(() => bookingStore.dialogVisible, () => { showTalkDialog.value = false })
/** 通行码先选择摄像头或键盘式扫码仪。 */
const showPasscodeScan = ref(false)

function onPasscodeScan() {
  showPasscodeScan.value = true
}
/** 从查验次数打开历史时的预填条件 */
const historyPreset = ref<{
  plate: string
  startTime: string
  endTime: string
} | null>(null)
/** 当前车牌历史最早/最晚查验时间（供点查验次数用） */
const plateHistoryRange = ref<{ earliest: string; latest: string } | null>(null)
const showPlcControl = ref(false)
const showAiStatus = ref(false)
const showDeviceStatus = ref(false)
/** 主页闸机图标 — 对齐 GateUIController */
const gateOnline = ref(false)
const gateFeedback = useDeviceSwitchFeedback({ gate: false }, 5000)
const gateDisplayOpen = computed(() => gateFeedback.display.value.gate)
const gateFeedbackPending = computed(() => !!gateFeedback.pending.value.gate)
const gateFeedbackMessage = computed(() => gateFeedbackPending.value ? '等待设备反馈' : gateFeedback.messages.value.gate || '')
const gateBusy = ref(false)
let gateStatusTimer: ReturnType<typeof setInterval> | null = null
let lastGateFeedbackAt = 0
/** 组播 XRSUP/XRSDOWN（或旧 XRAY200/160）→ 底栏光机读数 */
const xrayTelemetry = ref({
  kv200: '-',
  ma200: '-',
  temp200: '-',
  kv160: '-',
  ma160: '-',
  temp160: '-',
})
/** DEVICE bit9–12 光源/光闸 + 信号灯 — 来自 plc_status */
const plcXrayBits = ref<PlcXrayBits>({
  source200: false,
  source160: false,
  gate200: false,
  gate160: false,
})
const plcSignalLights = ref<PlcSignalLights>({
  red: false,
  yellow: false,
  green: false,
  fillLight: false,
})
const xrayMachinePhase = computed<XrayMachinePhase>(() =>
  deriveXrayMachinePhase(plcXrayBits.value),
)

function applyPlcDeviceStatus(data: Record<string, unknown>) {
  const values: Record<string, boolean> = typeof data.stickdown === 'boolean' ? { gate: data.stickdown } : {}
  if (!gateFeedback.feedback(values, data)) return false
  lastGateFeedbackAt = Date.now()
  gateOnline.value = gateFeedbackOnline(data)
  plcXrayBits.value = parsePlcXrayBits(data)
  plcSignalLights.value = parsePlcSignalLights(data)
  return true
}

function _fmtXrayNum(v: unknown): string {
  const n = Number(v)
  if (!Number.isFinite(n)) return '-'
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}
const showUserMgr = ref(false)
const showUsrMgrDenied = ref(false)
/** 对齐 Qt：弹窗贴在对应按钮下方 */
const plcAnchor = ref<{ left: number; top: number } | null>(null)
const aiAnchor = ref<{ left: number; top: number } | null>(null)
const deviceAnchor = ref<{ left: number; top: number } | null>(null)
/** 对齐 btn_webservice / btn_setting 在线图标 */
const aiOnline = ref(false)
const devicesOnline = ref(false)
/** 小车位置为实时遥测，不随受理、驳回、提交或重置业务状态清空。 */
const radarDistance = ref(0)
const workflow = ref({
  bookingActive: false,
  /** 对齐 Qt m_checkstep：0 待机 1 预约等待 2 放行中 3 检测中 4 采集完成 6 已离开 */
  checkStep: 0,
  /** 当前检测步骤文字提示（来自 WS detection_step message） */
  stepMessage: '',
  // ---- 6 个时间字段：权威源是后端 _booking_state；前端仅镜像显示 ----
  btnPrebookTime: '',        // 司机按键预约
  acceptanceTime: '',         // 受理
  opengateTime: '',           // 开闸
  openlightscreenTime: '',    // 光幕开
  closelightscreenTime: '',   // 光幕关
  cdPhotoTime: '',            // 车顶拍照
})

/** 弹窗可见：与 Pinia 同步 — 对齐 m_pOrderDialog->show */
const showBooking = computed({
  get: () => bookingStore.dialogVisible,
  set: (v: boolean) => {
    if (v) bookingStore.openDialog()
    else bookingStore.closeDialog()
  },
})

// ---- 下拉选项 ----
const truckTypeOptions = ref<{ type_code: string; type_name: string }[]>([])
const containerTypeOptions = ref<{ type_code: string; type_name: string }[]>([])

async function loadDicts() {
  try {
    const [truckRes, containerRes] = await Promise.all([
      request<{ type_code: string; type_name: string }[]>('/dict/truck-types'),
      request<{ type_code: string; type_name: string }[]>('/dict/container-types'),
    ])
    if (truckRes.code === 0 && truckRes.data) {
      truckTypeOptions.value = truckRes.data
    }
    if (containerRes.code === 0 && containerRes.data) {
      containerTypeOptions.value = containerRes.data
    }
  } catch (e) {
    console.warn('加载字典失败:', e)
  }
}

// ---- 透视参数 — 对齐 color_demo：灰场/亮场三档 + 渲染伪彩 ----
/** 灰场：高 3.00 / 中 2.00 / 低 1.00 */
const GAMMA_LEVELS = [
  { key: 'high', label: '高', value: 3.0 },
  { key: 'mid', label: '中', value: 2.0 },
  { key: 'low', label: '低', value: 1.0 },
] as const
/** 亮场：高 64 / 中 128 / 低 255 */
const WHITE_LEVELS = [
  { key: 'high', label: '高', value: 64 },
  { key: 'mid', label: '中', value: 128 },
  { key: 'low', label: '低', value: 255 },
] as const

type LevelKey = 'high' | 'mid' | 'low'
type XrayOpenMenu = 'gamma' | 'white' | null

const gammaKey = ref<LevelKey>('mid')
const whiteKey = ref<LevelKey>('mid')
const xrayOpenMenu = ref<XrayOpenMenu>(null)
/** 对齐 btn_pseudoColor：开 = 伪彩 */
const xrayRenderOn = ref(false)
/** 色阶/伪彩处理后的显示 URL */
const xrayDisplayUrl = ref('')
let xrayApplyTimer: number | undefined
let xrayApplySeq = 0

const gammaValue = computed(
  () => GAMMA_LEVELS.find((x) => x.key === gammaKey.value)!.value,
)
const whiteValue = computed(
  () => WHITE_LEVELS.find((x) => x.key === whiteKey.value)!.value,
)
const gammaLabel = computed(
  () => GAMMA_LEVELS.find((x) => x.key === gammaKey.value)!.label,
)
const whiteLabel = computed(
  () => WHITE_LEVELS.find((x) => x.key === whiteKey.value)!.label,
)

function toggleXrayMenu(menu: XrayOpenMenu) {
  xrayOpenMenu.value = xrayOpenMenu.value === menu ? null : menu
}

function pickGamma(key: LevelKey) {
  gammaKey.value = key
  xrayOpenMenu.value = null
}

function pickWhite(key: LevelKey) {
  whiteKey.value = key
  xrayOpenMenu.value = null
}

function toggleXrayRender() {
  xrayRenderOn.value = !xrayRenderOn.value
}

function onXrayDocClick(ev: MouseEvent) {
  const t = ev.target as HTMLElement | null
  if (t?.closest('.xray-dropdown')) return
  xrayOpenMenu.value = null
}

async function applyXrayProcess() {
  const src = transparentImageUrl.value
  if (!src) {
    xrayDisplayUrl.value = ''
    return
  }
  // 先立刻上原图，色阶放到空闲时再算，避免堵小车动画 / 右侧抓拍缩略图
  xrayDisplayUrl.value = src
  const seq = ++xrayApplySeq
  await new Promise<void>((resolve) => {
    const ric = (window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
    }).requestIdleCallback
    if (typeof ric === 'function') {
      ric(() => resolve(), { timeout: 200 })
    } else {
      window.setTimeout(() => resolve(), 50)
    }
  })
  if (seq !== xrayApplySeq) return
  try {
    const url = await processImage(src, {
      gamma: gammaValue.value,
      white: whiteValue.value,
      black: 0,
      pseudoColor: xrayRenderOn.value,
    })
    if (seq !== xrayApplySeq) return
    xrayDisplayUrl.value = url
  } catch (e) {
    if (seq !== xrayApplySeq) return
    console.error('[透视影像] 处理失败', e)
    xrayDisplayUrl.value = src
  }
}

function scheduleXrayApply() {
  window.clearTimeout(xrayApplyTimer)
  xrayApplyTimer = window.setTimeout(() => {
    void applyXrayProcess()
  }, 120)
}

function resetXrayProcessState() {
  window.clearTimeout(xrayApplyTimer)
  xrayApplySeq++
  xrayDisplayUrl.value = ''
  gammaKey.value = 'mid'
  whiteKey.value = 'mid'
  xrayRenderOn.value = false
  xrayOpenMenu.value = null
}

/** 车身影像 — 车身图 / 3D视图切换 */
type BodyView = 'body' | 'cloud'
const BODY_VIEW_ORDER: BodyView[] = ['body', 'cloud']
const BODY_VIEW_LABELS: Record<BodyView, string> = {
  body: '车身图',
  cloud: '3D视图',
}
const bodyView = ref<BodyView>('body')
const bodyCaptureError = ref('')
const bodyCloudPanelRef = ref<{ ready: boolean; getPreviewImage: () => string } | null>(null)
const bodyCanCapture = computed(() => bodyView.value === 'body' ? !!bodyPcPanelRef.value?.ready : !!bodyCloudPanelRef.value?.ready)
function captureBodyCloud() {
  bodyCaptureError.value = ''
  try {
    if (!bodyCloudPanelRef.value?.ready) return
    onBody3DScreenshot(bodyCloudPanelRef.value.getPreviewImage())
  } catch (error) {
    onBodyCaptureError(error instanceof Error ? error.message : '点云截图失败，请重试')
  }
}
function onBodyCaptureError(message: string) { bodyCaptureError.value = message }
const bodyImageUrls = ref<Record<'body' | 'top' | 'side', string>>({
  body: '',
  top: '',
  side: '',
})
const bodyImageUrl = computed(() => bodyImageUrls.value.body)
watch(bodyImageUrl, () => { bodyCaptureError.value = '' })
const bodyViewLabel = computed(() => BODY_VIEW_LABELS[bodyView.value])
const bodyProjectionMeta = ref({
  top: { source: '', metersPerPixel: .01 },
  side: { source: '', metersPerPixel: .01 },
})
const bodyProjectionError = ref('')
const bodyCloudGeometry = shallowRef<CloudGeometryPayload | null>(null)
const bodyRadarCapture = ref<BodyRadarCaptureStatus | null>(null)
const bodyRadarStatusText = computed(() => {
  const capture = bodyRadarCapture.value
  if (capture?.error) return capture.error
  switch (capture?.state) {
    case 'armed': return '等待放行开启几何采集'
    case 'capturing': return '几何采集已开启，等待车辆驶入'
    case 'polling': return capture.hasData ? '正在采集三维点云' : '正在采集，等待有效点云'
    case 'finished': return capture.hasData ? '点云采集完成' : '采集已结束，暂无有效点云'
    case 'timeout': return '点云采集等待超时'
    default: return '等待车辆几何采集'
  }
})
function bodyRadarForSave(view: 'top' | 'side') {
  return bodyImageUrls.value[view]
}

/** 车身图无图时的占位：车道占用(红) → 等待驶入(绿) → 默认 */
const laneOccupied = ref(false)
const gateReleased = ref(false)
const radarObjectCount = ref(0)

const isPreGateLaneBlocked = computed(() => {
  if (!bookingStore.isDetection || gateReleased.value) return false
  // 占用状态由后端按统一阈值和连续帧判定；前端不再用抖动的物体数重复推断。
  return laneOccupied.value
})

const bodyPlaceholderTone = computed((): 'default' | 'occupied' | 'waiting' => {
  if (bodyImageUrls.value.body || bodyView.value !== 'body') return 'default'
  if (isPreGateLaneBlocked.value) return 'occupied'
  if (gateReleased.value) return 'waiting'
  return 'default'
})
const bodyPlaceholderText = computed(() => {
  if (bodyView.value !== 'body') {
    if (bodyRadarFetching.value.top || bodyRadarFetching.value.side) return '正在加载三维点云…'
    return bodyProjectionError.value || `${bodyViewLabel.value}暂无图像`
  }
  if (bodyPlaceholderTone.value === 'occupied') return '车道占用'
  if (bodyPlaceholderTone.value === 'waiting') return '等待驶入'
  return '车身影像'
})

function onBodyViewSwap() {
  const idx = BODY_VIEW_ORDER.indexOf(bodyView.value)
  bodyView.value = BODY_VIEW_ORDER[(idx + 1) % BODY_VIEW_ORDER.length]
}

const bodyRadarFetching = ref<{ top: boolean; side: boolean }>({ top: false, side: false })
let bodyProjectionGeneration = 0
let bodyRadarRefreshQueued = false
let bodyRadarLoadedFrame = -1

async function ensureBodyRadarImage(refresh = false) {
  if (!refresh && bodyCloudGeometry.value) return
  if (bodyRadarFetching.value.top || bodyRadarFetching.value.side) {
    if (refresh) bodyRadarRefreshQueued = true
    return
  }
  const generation = bodyProjectionGeneration
  bodyRadarFetching.value = { top: true, side: true }
  bodyProjectionError.value = ''
  try {
    const res = await fetchBodyRadarImageApi('top')
    if (generation !== bodyProjectionGeneration) return
    if (res.code !== 0) throw new Error(res.message || '点云投影获取失败')
    if (res.data?.capture) {
      const incoming = res.data.capture
      const sameGeometry = !!bodyCloudGeometry.value && incoming.generation === bodyRadarCapture.value?.generation && incoming.frame === bodyRadarLoadedFrame
      if (bodyRadarCapture.value && incoming.generation !== bodyRadarCapture.value.generation) {
        bodyCloudGeometry.value = null
        bodyImageUrls.value.top = ''
        bodyImageUrls.value.side = ''
      }
      bodyRadarCapture.value = incoming
      if (sameGeometry) return
    }
    if (!res.data?.geometry) {
      bodyCloudGeometry.value = null
      bodyImageUrls.value.top = ''
      bodyImageUrls.value.side = ''
      return
    }
    bodyCloudGeometry.value = res.data.geometry
    bodyRadarLoadedFrame = res.data.capture?.frame ?? -1
    const url = res?.data?.imageUrl
    if (res.data?.views) {
      for (const v of ['top', 'side'] as const) {
        bodyImageUrls.value[v] = res.data.views[v].imageUrl
        bodyProjectionMeta.value[v] = { source: res.data.source || 'live', metersPerPixel: res.data.views[v].metersPerPixel }
      }
    } else if (url) {
      bodyImageUrls.value.top = url
    }
  } catch (e) {
    if (generation !== bodyProjectionGeneration) return
    bodyProjectionError.value = e instanceof Error ? e.message : '点云投影获取失败'
    console.warn('[BODY] 三维点云按需拉取失败', e)
  } finally {
    if (generation === bodyProjectionGeneration) {
      bodyRadarFetching.value = { top: false, side: false }
      if (bodyRadarRefreshQueued) {
        bodyRadarRefreshQueued = false
        void ensureBodyRadarImage(true)
      }
    }
  }
}

watch(bodyView, (view) => {
  bodyCaptureError.value = ''
  if (view === 'cloud') {
    void ensureBodyRadarImage()
  }
})

/** 透视影像路径 — 对齐 m_currentTanPath；删除确认后清空 */
type XrayView = '200' | '160' | 'mosaic'
const XRAY_VIEW_ORDER: XrayView[] = ['200', '160', 'mosaic']
const XRAY_VIEW_LABELS: Record<XrayView, string> = {
  '200': '200图像',
  '160': '160图像',
  mosaic: '拼接图',
}
const xrayView = ref<XrayView>('200')
const xrayImageUrls = ref<Record<XrayView, string>>({
  '200': '',
  '160': '',
  mosaic: '',
})
const transparentImageUrl = computed(() => xrayImageUrls.value[xrayView.value])
const xrayViewLabel = computed(() => XRAY_VIEW_LABELS[xrayView.value])
const showTransDelConfirm = ref(false)

watch(
  [transparentImageUrl, gammaKey, whiteKey, xrayRenderOn],
  () => {
    scheduleXrayApply()
  },
)

function onXrayViewSwap() {
  const idx = XRAY_VIEW_ORDER.indexOf(xrayView.value)
  xrayView.value = XRAY_VIEW_ORDER[(idx + 1) % XRAY_VIEW_ORDER.length]
}

/** 对齐 LvTongPro::onPreviewTansDel */
function onTransDelClick() {
  showTransDelConfirm.value = true
}

function onTransDelYes() {
  showTransDelConfirm.value = false
  xrayImageUrls.value = { '200': '', '160': '', mosaic: '' }
  xrayDisplayUrl.value = ''
  xrayBoxPanelRef.value?.clearBoxes()
}

function onTransDelNo() {
  showTransDelConfirm.value = false
}

// ---- 绿通信息表单 ----
const form = ref({
  plate: '--',
  plateColor: '',
  plateGc: '--',
  plateGcColor: '',
  goods: '',
  goodsProductCode: '',
  goodsVarietyPinYin: '',
  containerType: '',
  truckType: '',
  size: '',
  loadRate: '',
  weight: '',
  phone: '',
  historyCount: '--',
})

// ---- 农产品选择 ----
const agriculturalSelectRef = ref<InstanceType<typeof AgriculturalSelect> | null>(null)
const previousSelection = ref<{ productCode: string; varietyName: string; varietyNamePinYin: string }[]>([])

function onSelectProduct() {
  agriculturalSelectRef.value?.show(previousSelection.value)
}

function onAgriculturalConfirm(items: { productCode: string; varietyName: string; varietyNamePinYin: string }[]) {
  previousSelection.value = items
  if (items.length > 0) {
    form.value.goods = items.map(i => i.varietyName).join('|')
    form.value.goodsProductCode = items.map(i => i.productCode).join('|')
    form.value.goodsVarietyPinYin = items.map(i => i.varietyNamePinYin).join('|')
  } else {
    form.value.goods = ''
    form.value.goodsProductCode = ''
    form.value.goodsVarietyPinYin = ''
  }
}

/** AI 满载率（静默）：透视拼接图 + 货箱类型齐全时自动调用；厢式→方案1，其他→方案2 */
const aiLoadRateBusy = ref(false)
let aiLoadRateSeq = 0
let aiLoadRateLastKey = ''
let aiLoadRateTimer: ReturnType<typeof setTimeout> | null = null

async function runAiLoadRateSilent(mosaic: string, containerCode: string, containerName: string) {
  const key = `${mosaic}||${containerCode}`
  if (aiLoadRateBusy.value && aiLoadRateLastKey === key) return
  aiLoadRateLastKey = key
  const seq = ++aiLoadRateSeq
  aiLoadRateBusy.value = true
  try {
    const imgRes = await fetch(mosaic)
    if (!imgRes.ok) throw new Error(`读取拼接图失败: HTTP ${imgRes.status}`)
    const blob = await imgRes.blob()
    const fd = new FormData()
    fd.append('image', new File([blob], 'mosaic.jpg', { type: blob.type || 'image/jpeg' }))
    fd.append('container_type_code', containerCode)
    fd.append('container_type_name', containerName)

    const token =
      localStorage.getItem('lvtong_token') || sessionStorage.getItem('lvtong_token')
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 120000)
    let res: Response
    try {
      res = await fetch(`${appConfig.apiBaseUrl}/imaging/ai-load-rate`, {
        method: 'POST',
        headers,
        body: fd,
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    const json = (await res.json()) as {
      code: number
      message?: string
      data?: { load_rate_pct?: number; scheme?: string }
    }
    if (seq !== aiLoadRateSeq) return
    if (!res.ok || json.code !== 0 || json.data?.load_rate_pct == null) {
      console.warn('[AI满载率]', json.message || `HTTP ${res.status}`)
      return
    }
    form.value.loadRate = String(json.data.load_rate_pct)
    console.info(
      `[AI满载率] ${json.data.load_rate_pct}% (${json.data.scheme === 'scheme1_box' ? '厢式·方案1' : '其他·方案2'})`,
    )
  } catch (e) {
    if (seq !== aiLoadRateSeq) return
    console.warn('[AI满载率]', e instanceof Error ? e.message : e)
  } finally {
    if (seq === aiLoadRateSeq) aiLoadRateBusy.value = false
  }
}

function scheduleAiLoadRate() {
  if (aiLoadRateTimer) clearTimeout(aiLoadRateTimer)
  aiLoadRateTimer = setTimeout(() => {
    aiLoadRateTimer = null
    const mosaic = xrayImageUrls.value.mosaic
    const code = form.value.containerType
    if (!mosaic || !code) return
    const container = containerTypeOptions.value.find((t) => t.type_code === code)
    const name = container?.type_name || ''
    if (!name) return
    const key = `${mosaic}||${code}`
    if (key === aiLoadRateLastKey && form.value.loadRate !== '') return
    void runAiLoadRateSilent(mosaic, code, name)
  }, 400)
}

watch(
  () => [xrayImageUrls.value.mosaic, form.value.containerType] as const,
  ([mosaic, code]) => {
    if (!mosaic || !code) {
      aiLoadRateLastKey = ''
      return
    }
    scheduleAiLoadRate()
  },
)

/** AI 货车/货箱类型（静默）：车身影像「车身图」到位后自动识别 */
const aiTruckRealBusy = ref(false)
let aiTruckRealSeq = 0
let aiTruckRealLastKey = ''
let aiTruckRealLastWheel = 0
let aiTruckRealTimer: ReturnType<typeof setTimeout> | null = null

/** 两轮车：蓝牌(0)/渐变绿(4)→一型，有色其余→二型；未选色/车牌空不赋值。与后端一致 */
function isUsablePlate(plate: string): boolean {
  const p = String(plate || '').trim()
  return !!p && p !== '--' && p !== '-' && p !== '无'
}

function truckTypeFromWheels(wheelCount: number, plateColor: string, plate: string): string {
  // 对齐 JT/T 489：≤2 看牌色；3~5 几轴几型；≥6 → 六型。与后端一致。
  const axles = Number(wheelCount) || 0
  if (axles <= 0) return ''
  if (axles <= 2) {
    const c = String(plateColor || '').trim()
    if (!c || !isUsablePlate(plate)) return '' // 未选色 / 车牌空 → 不赋值
    if (c === '0' || c === '4' || c === '蓝色' || c === '蓝牌' || c === '渐变绿' || c === '渐变绿色') {
      return '11'
    }
    return '12'
  }
  if (axles >= 6) return '16'
  return String(10 + axles)
}

function applyTruckTypeFromLastWheels() {
  if (aiTruckRealLastWheel <= 0 || aiTruckRealLastWheel > 2) return
  const code = truckTypeFromWheels(
    aiTruckRealLastWheel,
    form.value.plateColor,
    form.value.plate,
  )
  // 两轮：可判定则赋值；无法判定则清空（避免沿用错误的一/二型）
  form.value.truckType = code
}

async function runAiTruckRealSilent(bodyUrl: string) {
  if (aiTruckRealBusy.value && aiTruckRealLastKey === bodyUrl) return
  aiTruckRealLastKey = bodyUrl
  const seq = ++aiTruckRealSeq
  aiTruckRealBusy.value = true
  try {
    const imgRes = await fetch(bodyUrl)
    if (!imgRes.ok) throw new Error(`读取车身图失败: HTTP ${imgRes.status}`)
    const blob = await imgRes.blob()
    const fd = new FormData()
    fd.append('image', new File([blob], 'body.jpg', { type: blob.type || 'image/jpeg' }))
    if (form.value.plateColor) {
      fd.append('plate_color', form.value.plateColor)
    }
    if (isUsablePlate(form.value.plate)) {
      fd.append('plate_number', form.value.plate)
    }

    const token =
      localStorage.getItem('lvtong_token') || sessionStorage.getItem('lvtong_token')
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 120000)
    let res: Response
    try {
      res = await fetch(`${appConfig.apiBaseUrl}/imaging/ai-truck-real`, {
        method: 'POST',
        headers,
        body: fd,
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    const json = (await res.json()) as {
      code: number
      message?: string
      data?: {
        vehicle_type?: string
        vehicle_container_type?: string
        wheel_count?: number
        cratetype?: string
      }
    }
    if (seq !== aiTruckRealSeq) return
    if (!res.ok || json.code !== 0 || !json.data) {
      console.warn('[AI货车识别]', json.message || `HTTP ${res.status}`)
      return
    }
    const d = json.data
    aiTruckRealLastWheel = Number(d.wheel_count) || 0
    // 两轮：可判定才赋值，无法判定保持/清空为空；多轴直接用后端结果
    if (aiTruckRealLastWheel > 0 && aiTruckRealLastWheel <= 2) {
      form.value.truckType = d.vehicle_type || ''
    } else if (d.vehicle_type) {
      form.value.truckType = d.vehicle_type
    }
    if (d.vehicle_container_type) form.value.containerType = d.vehicle_container_type
    console.info(
      `[AI货车识别] wheel=${d.wheel_count ?? '-'} plate=${form.value.plate || '-'} ` +
        `color=${form.value.plateColor || '-'} truck=${d.vehicle_type || '(未判定)'} ` +
        `crate=${d.cratetype || '-'} container=${d.vehicle_container_type || '-'}`,
    )
  } catch (e) {
    if (seq !== aiTruckRealSeq) return
    console.warn('[AI货车识别]', e instanceof Error ? e.message : e)
  } finally {
    if (seq === aiTruckRealSeq) aiTruckRealBusy.value = false
  }
}

function scheduleAiTruckReal() {
  if (aiTruckRealTimer) clearTimeout(aiTruckRealTimer)
  aiTruckRealTimer = setTimeout(() => {
    aiTruckRealTimer = null
    const bodyUrl = bodyImageUrls.value.body
    if (!bodyUrl) return
    if (bodyUrl === aiTruckRealLastKey && form.value.truckType && form.value.containerType) {
      return
    }
    void runAiTruckRealSilent(bodyUrl)
  }, 400)
}

watch(
  () => bodyImageUrls.value.body,
  (url) => {
    if (!url) {
      aiTruckRealLastKey = ''
      aiTruckRealLastWheel = 0
      return
    }
    scheduleAiTruckReal()
  },
)

// 两轮车：车牌号/颜色变更时按蓝牌/渐变绿重算一/二型（无法判定则不赋值）
watch(
  () => [form.value.plateColor, form.value.plate] as const,
  () => {
    applyTruckTypeFromLastWheels()
  },
)

// ---- 车牌编辑 ----
const licensePlateRef = ref<InstanceType<typeof LicensePlateEdit> | null>(null)
const licensePlateGCRef = ref<InstanceType<typeof LicensePlateEdit> | null>(null)
const showCarSize = ref(false)

function onEditCarSize() {
  showCarSize.value = true
}

function onCarSizeConfirm(sizeText: string) {
  form.value.size = sizeText
}

function onEditPlate() {
  licensePlateRef.value?.show()
}
function onPlateConfirm(plate: string, color: string) {
  form.value.plate = plate || '--'
  form.value.plateColor = color
  if (plate && plate !== '--') void applyPlateHistory(plate)
  else {
    form.value.historyCount = '--'
    plateHistoryRange.value = null
  }
}
function onEditPlateGC() {
  licensePlateGCRef.value?.show()
}
function onPlateGCConfirm(plate: string, color: string) {
  form.value.plateGc = plate || '--'
  form.value.plateGcColor = color
}

type PlateHistoryData = {
  count: number
  driver_phone?: string
  gc_plate?: string
  vehicle_type?: string
  vehicle_container_type?: string
  vehicle_size?: string
  license_image_path?: string
  /** 后端按磁盘解析后的主证（有旁路用旁路，否则用拼接图） */
  license_image_main?: string
  license_image_path1?: string
  earliest_time?: string
  latest_time?: string
}

/** 表单空值：空串 / -- 视为未填，才允许历史回填 */
function isFormBlank(v: string | undefined | null): boolean {
  const s = String(v ?? '').trim()
  return !s || s === '--'
}

/** 车牌赋值后：查过往记录 → 仅空字段回填 + 查验次数（已填不覆盖） */
async function applyPlateHistory(plate: string) {
  const p = plate.trim()
  if (!p || p === '--') {
    form.value.historyCount = '--'
    plateHistoryRange.value = null
    return
  }
  try {
    const res = await request<PlateHistoryData>(
      `/inspection/plate/${encodeURIComponent(p)}`,
    )
    // 请求期间可能已重新扫码／重置，旧车的历史不能回填到新车。
    if (form.value.plate.trim() !== p) return
    if (res.code !== 0 || !res.data) {
      form.value.historyCount = '--'
      plateHistoryRange.value = null
      return
    }
    const d = res.data
    const count = Number(d.count) || 0
    form.value.historyCount = count > 0 ? String(count) : '0'
    if (d.earliest_time && d.latest_time) {
      plateHistoryRange.value = {
        earliest: d.earliest_time,
        latest: d.latest_time,
      }
    } else {
      plateHistoryRange.value = null
    }
    if (count <= 0) return

    // 仅空字段回填；已有内容不覆盖（避免扫码/改车牌冲掉当前录入的行驶证等）
    if (d.driver_phone && isFormBlank(form.value.phone)) {
      form.value.phone = d.driver_phone
    }
    if (d.gc_plate && isFormBlank(form.value.plateGc)) {
      form.value.plateGc = d.gc_plate
    }
    if (d.vehicle_type && isFormBlank(form.value.truckType)) {
      form.value.truckType = d.vehicle_type
    }
    if (d.vehicle_container_type && isFormBlank(form.value.containerType)) {
      form.value.containerType = d.vehicle_container_type
    }
    if (d.vehicle_size && isFormBlank(form.value.size)) {
      form.value.size = /长/.test(d.vehicle_size)
        ? d.vehicle_size
        : formatVehicleSizeDisplay(d.vehicle_size)
    }

    if (d.license_image_path || d.license_image_main || d.license_image_path1) {
      const needMain = !licensePaths.value.license
      const needGc = !licensePaths.value.licenseGc
      const needStitch = !licensePaths.value.licenseStitched
      if (needMain || needGc || needStitch) {
        const stitched = d.license_image_path ? toImageUrl(d.license_image_path) : ''
        // 用后端校验过的 URL，禁止前端硬拼 -main/-hang（文件可能不存在 → 404）
        const lic = d.license_image_main
          ? toImageUrl(d.license_image_main)
          : stitched
        const licGc = d.license_image_path1 ? toImageUrl(d.license_image_path1) : ''
        let filled = false
        if (needMain && lic) {
          licensePaths.value.license = lic
          filled = true
        }
        if (needGc && licGc) {
          licensePaths.value.licenseGc = licGc
          filled = true
        }
        if (needStitch && stitched) {
          licensePaths.value.licenseStitched = stitched
          filled = true
        }
        if (filled) {
          captureThumbs.value.license =
            licensePaths.value.license || licensePaths.value.licenseGc || ''
          // 仅本次从历史补进的图视为已裁切，避免再跑静默 AI
          aiLicenseCropLastKey = `${licensePaths.value.license}||${licensePaths.value.licenseGc}`
        }
      }
    }
  } catch {
    form.value.historyCount = '--'
    plateHistoryRange.value = null
  }
}

function onHistoryCountClick() {
  const plate = form.value.plate === '--' ? '' : form.value.plate.trim()
  if (!plate) return
  historyPreset.value = {
    plate,
    startTime: plateHistoryRange.value?.earliest || '',
    endTime: plateHistoryRange.value?.latest || '',
  }
  showHistory.value = true
}

function onHistoryClose() {
  showHistory.value = false
  historyPreset.value = null
}

// ---- 图像采集 — 对齐 btn_head/tail/top/goods/license/evidence ----
const captureButtons = [
  { key: 'head' as const, label: '车头' },
  { key: 'tail' as const, label: '车尾' },
  { key: 'top' as const, label: '车顶' },
  { key: 'goods' as const, label: '货物' },
  { key: 'license' as const, label: '行驶证' },
  { key: 'evidence' as const, label: '证据照' },
]

type CaptureKey = (typeof captureButtons)[number]['key']
/** 缩略图槽位：采集按钮 + 通行码图（非按钮） */
type ThumbKey = CaptureKey | 'passcode'

/** 货物/证据主页缩略：最多展示 6 张，按张数排布 */
function multiCaptureThumbs(key: 'goods' | 'evidence'): string[] {
  return (captureLists.value[key] || []).filter(Boolean).slice(0, 6)
}

function multiCaptureThumbClass(key: 'goods' | 'evidence'): string {
  const n = multiCaptureThumbs(key).length
  return n > 0 ? `n-${n}` : ''
}

function captureBtnHasThumb(key: CaptureKey): boolean {
  if (key === 'license') {
    return !!(licensePaths.value.license || licensePaths.value.licenseGc)
  }
  if (key === 'goods' || key === 'evidence') {
    return (captureLists.value[key] || []).length > 0
  }
  return !!captureThumbs.value[key]
}

const captureDialog = ref<CaptureKind | null>(null)
const showLicenseDialog = ref(false)

// ---- 实时视频：MediaMTX WHEP（海康 RTSP → MediaMTX → 前端 <video>）----
const liveVideoRef = ref<HTMLVideoElement | null>(null)
const {
  status: liveVideoStatus,
  error: liveVideoError,
  play: playLiveVideo,
  stop: stopLiveVideoPlayer,
} = useWhepPlayer()

let liveVideoRetryTimer: number | undefined

const videoHint = computed(() => {
  if (liveVideoError.value) return liveVideoError.value
  if (liveVideoStatus.value === 'connecting') return '连接中…'
  if (liveVideoStatus.value === 'playing') return ''
  if (liveVideoStatus.value === 'failed' || liveVideoStatus.value === 'disconnected') {
    return '连接中断，正在重试…'
  }
  if (liveVideoStatus.value === 'error') return liveVideoError.value || '实时视频连接失败'
  return '准备播放…'
})

async function startLiveVideo() {
  const el = liveVideoRef.value
  if (!el) return
  try {
    await playLiveVideo({ video: el, whepUrl: PTZ_WHEP_URL })
  } catch {
    scheduleLiveVideoRetry()
  }
}

function stopLiveVideo() {
  window.clearTimeout(liveVideoRetryTimer)
  void stopLiveVideoPlayer()
}

function scheduleLiveVideoRetry() {
  window.clearTimeout(liveVideoRetryTimer)
  liveVideoRetryTimer = window.setTimeout(() => {
    void startLiveVideo()
  }, 3000)
}

function reconnectLiveVideo() {
  window.clearTimeout(liveVideoRetryTimer)
  void startLiveVideo()
}

/** 框图裁切预览（叠在 WebRTC 视频之上；来自车身/透视框图 → 后端原图裁切） */
const liveCropPreviewUrl = ref('')
const bodyPcPanelRef = ref<{ clearBoxes: () => void; ready: boolean; getPreviewImage: () => string } | null>(null)
const xrayBoxPanelRef = ref<{ clearBoxes: () => void; ready: boolean; getPreviewImage: () => string } | null>(null)
const imagePreview = shallowRef<GalleryItem[] | null>(null)
const imagePreviewError = ref('')
function openImagePreview(kind: 'body' | 'xray') {
  imagePreviewError.value = ''
  const panel = kind === 'xray' ? xrayBoxPanelRef.value : bodyView.value === 'body' ? bodyPcPanelRef.value : bodyCloudPanelRef.value
  if (!panel?.ready) return
  try {
    imagePreview.value = [{ label: kind === 'xray' ? `透视影像 · ${xrayViewLabel.value}` : `车身影像 · ${bodyViewLabel.value}`, src: panel.getPreviewImage() }]
  } catch (error) {
    imagePreviewError.value = error instanceof Error ? error.message : '影像预览失败，请重试'
  }
}
let cropReqSeq = 0

async function requestOriginalCrop(payload: CropBoxPayload): Promise<string> {
  const res = await request<{ url: string }>('/temp-images/crop', {
    method: 'POST',
    body: JSON.stringify({
      previewUrl: payload.sourceTempUrl,
      x1: payload.x1,
      y1: payload.y1,
      x2: payload.x2,
      y2: payload.y2,
    }),
  })
  if (res.code !== 0 || !res.data?.url) {
    throw new Error(res.message || '原图裁切失败')
  }
  return res.data.url
}

async function onBodyBoxCrop(payload: CropBoxPayload) {
  xrayBoxPanelRef.value?.clearBoxes()
  const seq = ++cropReqSeq
  liveCropPreviewUrl.value = ''
  bodyCaptureError.value = ''
  try {
    const url = await resolveCropPreview(payload, () => requestOriginalCrop(payload))
    if (seq !== cropReqSeq) return
    liveCropPreviewUrl.value = url
  } catch (e) {
    if (seq !== cropReqSeq) return
    bodyCaptureError.value = e instanceof Error ? e.message : '截图失败，请重新框选'
    console.error('[Dashboard] 车身原图裁切失败', e)
  }
}

function onBody3DScreenshot(image: string) {
  cropReqSeq++ // invalidate older pending original-image crop requests
  bodyPcPanelRef.value?.clearBoxes()
  xrayBoxPanelRef.value?.clearBoxes()
  liveCropPreviewUrl.value = image
}

async function onXrayBoxCrop(payload: CropBoxPayload) {
  bodyPcPanelRef.value?.clearBoxes()
  const seq = ++cropReqSeq
  liveCropPreviewUrl.value = ''
  bodyCaptureError.value = ''
  try {
    // 透视截图保留当前灰场/亮场/伪彩，不能用未经处理的原图替换。
    const url = await resolveCropPreview({ ...payload, sourceTempUrl: '' }, () => requestOriginalCrop(payload))
    if (seq !== cropReqSeq) return
    liveCropPreviewUrl.value = url
  } catch (e) {
    if (seq !== cropReqSeq) return
    bodyCaptureError.value = e instanceof Error ? e.message : '截图失败，请重新框选'
    console.error('[Dashboard] 透视原图裁切失败', e)
  }
}

/** 「勾」：车身/3D/透视截图统一追加货物照，保留原有图片。 */
function onConfirmCropToGoods() {
  if (!liveCropPreviewUrl.value) return
  cropReqSeq++
  const existing = captureLists.value.goods.length ? captureLists.value.goods
    : captureThumbs.value.goods ? [captureThumbs.value.goods] : []
  cropGoodsImages.add(liveCropPreviewUrl.value)
  const next = [...existing, liveCropPreviewUrl.value]
  captureLists.value = { ...captureLists.value, goods: next }
  captureThumbs.value = { ...captureThumbs.value, goods: next[next.length - 1] || '' }
  liveCropPreviewUrl.value = ''
  bodyPcPanelRef.value?.clearBoxes()
  xrayBoxPanelRef.value?.clearBoxes()
  console.info('[Dashboard] 框图已追加到货物照:', next.length)
}

/** 「×」：清除框图预览 + 车身/透视上的框 */
function onDeleteCropBoxes() {
  bodyCaptureError.value = ''
  cropReqSeq++
  liveCropPreviewUrl.value = ''
  bodyPcPanelRef.value?.clearBoxes()
  xrayBoxPanelRef.value?.clearBoxes()
}
const showVideoHint = computed(() => true)

/** 各格缩略图（blob/url），对齐 Qt setIcon 回写 */
const captureThumbs = ref<Partial<Record<ThumbKey, string>>>({})
/** 多图列表：货物 / 证据 */
const captureLists = ref<{ goods: string[]; evidence: string[] }>({
  goods: [],
  evidence: [],
})
const cropGoodsImages = new Set<string>()
const evidenceSourceKeys = new Set<string>()
const evidencePickerItems = shallowRef<EvidenceCandidate[] | null>(null)

function openEvidencePicker() {
  const images: GalleryItem[] = []
  function add(label: string, src?: string) { if (src) images.push({ label, src: toImageUrl(src) }) }
  for (const key of ['head', 'tail', 'top', 'passcode'] as const) {
    add({ head: '车头', tail: '车尾', top: '车顶', passcode: '通行码' }[key], captureThumbs.value[key])
  }
  add('主行驶证', licensePaths.value.license || captureThumbs.value.license)
  add('挂车行驶证', licensePaths.value.licenseGc)
  add('拼接行驶证', licensePaths.value.licenseStitched)
  for (const key of ['goods', 'evidence'] as const) {
    const list = captureLists.value[key].length ? captureLists.value[key] : [captureThumbs.value[key] || '']
    list.forEach((src, i) => add(`${key === 'goods' ? '货物照' : '证据照'}${i + 1}`, src))
  }
  add('车身图', bodyImageUrls.value.body)
  add('车顶投影', bodyImageUrls.value.top)
  add('车侧投影', bodyImageUrls.value.side)
  for (const view of XRAY_VIEW_ORDER) add(`透视${XRAY_VIEW_LABELS[view]}`, xrayImageUrls.value[view])
  const panel = bodyView.value === 'cloud' ? bodyCloudPanelRef.value : bodyPcPanelRef.value
  for (const [label, imagePanel] of [[`当前${bodyViewLabel.value}`, panel], [`当前透视${xrayViewLabel.value}`, xrayBoxPanelRef.value]] as const) {
    if (imagePanel?.ready) {
      try { add(label, imagePanel.getPreviewImage()) } catch { /* 原始图片仍可选择 */ }
    }
  }
  add('待确认截图', liveCropPreviewUrl.value)
  const existing = [...captureLists.value.evidence, captureThumbs.value.evidence || ''].filter(Boolean).map(toImageUrl)
  evidencePickerItems.value = evidenceCandidates(images, [...existing, ...evidenceSourceKeys])
}

function onEvidenceImagesConfirm(choices: EvidenceChoice[]) {
  const existing = captureLists.value.evidence.length ? captureLists.value.evidence
    : captureThumbs.value.evidence ? [captureThumbs.value.evidence] : []
  const next = appendEvidence(existing, choices, evidenceSourceKeys)
  next.sources.forEach(src => evidenceSourceKeys.add(src))
  captureLists.value = { ...captureLists.value, evidence: next.images }
  captureThumbs.value = { ...captureThumbs.value, evidence: next.images[next.images.length - 1] || '' }
  evidencePickerItems.value = null
}

/** 将 AI 货物列表回填到表单（与农产品选择器同结构） */
function applyAiGoodsFill(
  goods: { code?: string; name?: string; pinyin?: string }[],
  source: string,
) {
  const items = (goods || [])
    .filter((g) => (g.code || g.name || '').trim())
    .map((g) => ({
      productCode: String(g.code || '').trim(),
      varietyName: String(g.name || '').trim(),
      varietyNamePinYin: String(g.pinyin || '').trim(),
    }))
  if (!items.length) return
  previousSelection.value = items
  form.value.goods = items.map((i) => i.varietyName).filter(Boolean).join('|')
  form.value.goodsProductCode = items.map((i) => i.productCode).filter(Boolean).join('|')
  form.value.goodsVarietyPinYin = items.map((i) => i.varietyNamePinYin).filter(Boolean).join('|')
  console.info(
    `[AI货物识别·${source}]`,
    form.value.goods || form.value.goodsProductCode,
  )
}

async function postAiGoodsDetect(endpoint: string, imageUrl: string, filename: string) {
  const imgRes = await fetch(imageUrl)
  if (!imgRes.ok) throw new Error(`读取图片失败: HTTP ${imgRes.status}`)
  const blob = await imgRes.blob()
  const fd = new FormData()
  fd.append('image', new File([blob], filename, { type: blob.type || 'image/jpeg' }))

  const token =
    localStorage.getItem('lvtong_token') || sessionStorage.getItem('lvtong_token')
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 120000)
  let res: Response
  try {
    res = await fetch(`${appConfig.apiBaseUrl}/imaging/${endpoint}`, {
      method: 'POST',
      headers,
      body: fd,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }

  const json = (await res.json()) as {
    code: number
    message?: string
    data?: {
      goods?: { code?: string; name?: string; pinyin?: string; score?: number }[]
      goods_type?: string
      goods_name?: string
    }
  }
  if (!res.ok || json.code !== 0 || !json.data) {
    throw new Error(json.message || `HTTP ${res.status}`)
  }
  return json.data
}

/** AI 货物实物图（静默）：货物照片到位后自动识别 */
const aiGoodsRealBusy = ref(false)
let aiGoodsRealSeq = 0
let aiGoodsRealLastKey = ''
let aiGoodsRealTimer: ReturnType<typeof setTimeout> | null = null

async function runAiGoodsRealSilent(imageUrl: string, key: string) {
  if (aiGoodsRealBusy.value && aiGoodsRealLastKey === key) return
  aiGoodsRealLastKey = key
  const seq = ++aiGoodsRealSeq
  aiGoodsRealBusy.value = true
  try {
    const data = await postAiGoodsDetect('ai-goods-real', imageUrl, 'goods.jpg')
    if (seq !== aiGoodsRealSeq) return
    applyAiGoodsFill(data.goods || [], '实物')
  } catch (e) {
    if (seq !== aiGoodsRealSeq) return
    console.warn('[AI货物识别·实物]', e instanceof Error ? e.message : e)
  } finally {
    if (seq === aiGoodsRealSeq) aiGoodsRealBusy.value = false
  }
}

function scheduleAiGoodsReal() {
  if (aiGoodsRealTimer) clearTimeout(aiGoodsRealTimer)
  aiGoodsRealTimer = setTimeout(() => {
    aiGoodsRealTimer = null
    // 框选截图可为透视/3D，不把它作为相机实物图再次发送AI实物识别。
    const list = (captureLists.value.goods || []).filter(src => !cropGoodsImages.has(src))
    const url = list[list.length - 1] || ''
    if (!url) return
    const key = list.join('|')
    if (key === aiGoodsRealLastKey && form.value.goods) return
    void runAiGoodsRealSilent(url, key)
  }, 500)
}

watch(
  () => (captureLists.value.goods || []).filter(src => !cropGoodsImages.has(src)).join('|'),
  (key) => {
    if (!key) {
      aiGoodsRealLastKey = ''
      return
    }
    scheduleAiGoodsReal()
  },
)

/** AI 货物透视图（静默）：透视拼接图到位后自动识别 */
const aiGoodsXrayBusy = ref(false)
let aiGoodsXraySeq = 0
let aiGoodsXrayLastKey = ''
let aiGoodsXrayTimer: ReturnType<typeof setTimeout> | null = null

async function runAiGoodsXraySilent(mosaic: string) {
  if (aiGoodsXrayBusy.value && aiGoodsXrayLastKey === mosaic) return
  aiGoodsXrayLastKey = mosaic
  const seq = ++aiGoodsXraySeq
  aiGoodsXrayBusy.value = true
  try {
    const data = await postAiGoodsDetect('ai-goods-xray', mosaic, 'mosaic.jpg')
    if (seq !== aiGoodsXraySeq) return
    applyAiGoodsFill(data.goods || [], '透视')
  } catch (e) {
    if (seq !== aiGoodsXraySeq) return
    console.warn('[AI货物识别·透视]', e instanceof Error ? e.message : e)
  } finally {
    if (seq === aiGoodsXraySeq) aiGoodsXrayBusy.value = false
  }
}

function scheduleAiGoodsXray() {
  if (aiGoodsXrayTimer) clearTimeout(aiGoodsXrayTimer)
  aiGoodsXrayTimer = setTimeout(() => {
    aiGoodsXrayTimer = null
    const mosaic = xrayImageUrls.value.mosaic
    if (!mosaic) return
    if (mosaic === aiGoodsXrayLastKey && form.value.goods) return
    void runAiGoodsXraySilent(mosaic)
  }, 500)
}

watch(
  () => xrayImageUrls.value.mosaic,
  (mosaic) => {
    if (!mosaic) {
      aiGoodsXrayLastKey = ''
      return
    }
    scheduleAiGoodsXray()
  },
)

const licensePaths = ref({ license: '', licenseGc: '', licenseStitched: '' })

/** OCR 出口称重提示区间，如 "(7920-18900)"；空则不显示 */
const weightRangeHint = ref('')

/** 手动出口称重：仅允许非负整数（kg）；空与纯整数不提示 */
const weightInputError = computed(() => {
  const raw = String(form.value.weight ?? '').trim()
  if (!raw) return ''
  if (/^\d+$/.test(raw)) return ''
  return '出口称重需为整数（kg），请勿输入小数'
})

/** AI 行驶证裁剪（静默）：主行驶证到位后自动调用；可带挂车证一起裁 */
const aiLicenseCropBusy = ref(false)
let aiLicenseCropSeq = 0
let aiLicenseCropLastKey = ''
let aiLicenseCropTimer: ReturnType<typeof setTimeout> | null = null

async function srcToFileForAi(src: string, filename: string): Promise<File> {
  const res = await fetch(src)
  if (!res.ok) throw new Error(`读取图片失败: ${res.status}`)
  const blob = await res.blob()
  return new File([blob], filename, { type: blob.type || 'image/jpeg' })
}

/** 行驶证 OCR：填车牌（仅空时）+ 出口称重区间提示 */
async function runLicenseOcrSilent(imageSrc: string) {
  if (!imageSrc) return
  try {
    const fd = new FormData()
    fd.append('image', await srcToFileForAi(imageSrc, 'license_ocr.jpg'))
    const token =
      localStorage.getItem('lvtong_token') || sessionStorage.getItem('lvtong_token')
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 60000)
    let res: Response
    try {
      res = await fetch(`${appConfig.apiBaseUrl}/imaging/ocr/driving-license`, {
        method: 'POST',
        headers,
        body: fd,
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    const json = (await res.json()) as {
      code: number
      message?: string
      data?: {
        plate_number?: string
        hdzzl?: string
        zzl?: string
        weight_min?: number
        weight_max?: number
        weight_range_text?: string
      }
    }
    if (!res.ok || json.code !== 0 || !json.data) {
      console.warn('[OCR行驶证]', json.message || `HTTP ${res.status}`)
      return
    }
    const d = json.data
    const plate = String(d.plate_number || '').trim()
    if (plate && !isUsablePlate(form.value.plate)) {
      form.value.plate = plate
      void applyPlateHistory(plate)
      console.info('[OCR行驶证] 已填车牌', plate)
    }
    if (d.weight_min && d.weight_max) {
      weightRangeHint.value = `(${d.weight_min}-${d.weight_max})`
    } else if (d.weight_range_text) {
      weightRangeHint.value = d.weight_range_text
    }
    console.info(
      `[OCR行驶证] hdzzl=${d.hdzzl ?? '-'} zzl=${d.zzl ?? '-'} range=${weightRangeHint.value || '-'}`,
    )
  } catch (e) {
    console.warn('[OCR行驶证]', e instanceof Error ? e.message : e)
  }
}

async function runAiLicenseCropSilent(mainSrc: string, hangSrc: string) {
  const key = `${mainSrc}||${hangSrc}`
  if (aiLicenseCropBusy.value) {
    console.info('[AI行驶证裁剪] 跳过：进行中')
    return
  }
  if (key === aiLicenseCropLastKey) {
    console.info('[AI行驶证裁剪] 跳过：同源已处理')
    return
  }
  const seq = ++aiLicenseCropSeq
  aiLicenseCropBusy.value = true
  console.info(
    '[AI行驶证裁剪] 开始',
    hangSrc ? '主+挂' : '仅主证',
    { main: mainSrc.slice(0, 48), hang: hangSrc ? hangSrc.slice(0, 48) : '' },
  )
  try {
    const fd = new FormData()
    fd.append('crop_image1', await srcToFileForAi(mainSrc, 'crop_image1.jpg'))
    if (hangSrc) {
      fd.append('crop_image2', await srcToFileForAi(hangSrc, 'crop_image2.jpg'))
    }
    const token =
      localStorage.getItem('lvtong_token') || sessionStorage.getItem('lvtong_token')
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 120000)
    let res: Response
    try {
      res = await fetch(`${appConfig.apiBaseUrl}/license/ai-crop`, {
        method: 'POST',
        headers,
        body: fd,
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    const json = (await res.json()) as {
      code: number
      message?: string
      data?: {
        imageDataUrl?: string
        mainDataUrl?: string
        hangDataUrl?: string
        mode?: string
      }
    }
    if (seq !== aiLicenseCropSeq) return
    if (!res.ok || json.code !== 0 || !json.data?.imageDataUrl) {
      throw new Error(json.message || `AI 裁剪失败（HTTP ${res.status}）`)
    }

    const d = json.data
    licensePaths.value = {
      license: d.mainDataUrl || d.imageDataUrl || mainSrc,
      licenseGc: d.hangDataUrl || hangSrc || '',
      licenseStitched: d.imageDataUrl || '',
    }
    captureThumbs.value.license =
      licensePaths.value.license || licensePaths.value.licenseGc || ''
    // 成功后记 key，避免对裁剪结果再次触发
    aiLicenseCropLastKey = `${licensePaths.value.license}||${licensePaths.value.licenseGc}`
    console.info('[AI行驶证裁剪] 静默完成', d.mode || '')
    // 裁剪完成后 OCR：优先主证裁剪图（含正反面信息更完整时也可用拼接图）
    void runLicenseOcrSilent(
      licensePaths.value.licenseStitched || licensePaths.value.license,
    )
  } catch (e) {
    if (seq !== aiLicenseCropSeq) return
    // 失败不记 lastKey，允许下次重试
    console.warn('[AI行驶证裁剪]', e instanceof Error ? e.message : e)
  } finally {
    if (seq === aiLicenseCropSeq) aiLicenseCropBusy.value = false
  }
}

function scheduleAiLicenseCrop() {
  if (aiLicenseCropTimer) clearTimeout(aiLicenseCropTimer)
  // 稍等挂车证可能随后到达（移动端常分两次上传）；弹窗关窗回写也会走这里
  aiLicenseCropTimer = setTimeout(() => {
    aiLicenseCropTimer = null
    const main = licensePaths.value.license
    const hang = licensePaths.value.licenseGc || ''
    if (!main) {
      console.info('[AI行驶证裁剪] 跳过：无主证')
      return
    }
    const key = `${main}||${hang}`
    // 注意：弹窗关闭时会本地拼一张 licenseStitched，不能据此当成「已 AI 裁切」而跳过
    if (key === aiLicenseCropLastKey) {
      console.info('[AI行驶证裁剪] 跳过：同源已处理')
      return
    }
    void runAiLicenseCropSilent(main, hang)
  }, 800)
}

watch(
  () => [licensePaths.value.license, licensePaths.value.licenseGc] as const,
  ([main]) => {
    if (!main) {
      aiLicenseCropLastKey = ''
      return
    }
    scheduleAiLicenseCrop()
  },
)

/** 任一静默 AI 进行中：禁止点确认，避免提交未裁切/未回填的中间态 */
const aiSilentBusy = computed(
  () =>
    aiLoadRateBusy.value ||
    aiTruckRealBusy.value ||
    aiGoodsRealBusy.value ||
    aiGoodsXrayBusy.value ||
    aiLicenseCropBusy.value,
)

const aiSilentBusyHint = computed(() => {
  if (!aiSilentBusy.value) return ''
  if (aiLicenseCropBusy.value) return '行驶证 AI 裁剪中，请稍候…'
  if (aiGoodsRealBusy.value || aiGoodsXrayBusy.value) return '货物 AI 识别中，请稍候…'
  if (aiTruckRealBusy.value) return '车型/货箱 AI 识别中，请稍候…'
  if (aiLoadRateBusy.value) return '满载率 AI 计算中，请稍候…'
  return 'AI 处理中，请稍候…'
})

/** 通行码 14 字段（对齐 Qt PassCodeUtil::GetPassCodeInfoByCodeStr） */
const passcode = ref<PasscodeInfo | null>(null)

/** Pad 本地识别与 PC／手机消息走同一回填入口，不依赖 WebSocket 才显示结果。 */
function applyPasscode(pc: PasscodeInfo, image = '') {
  if (!pc?.valid) return
  const previous = passcode.value
  const duplicate = previous?.vehicleId === pc.vehicleId && previous?.passId === pc.passId && previous?.exTime === pc.exTime
  passcode.value = pc
  if (image) captureThumbs.value.passcode = image
  if (pc.vehicleDisplayId) form.value.plate = pc.vehicleDisplayId
  if (pc.vehicleColorName) form.value.plateColor = pc.vehicleColorName
  if (pc.exWeight != null && String(pc.exWeight).trim() !== '') form.value.weight = String(pc.exWeight).trim()
  // 本地回填后后台会再次推送相同通行码，避免重复查询历史。
  if (!duplicate && pc.vehicleDisplayId) void applyPlateHistory(pc.vehicleDisplayId)
}

/** 把任意图片引用转成可显示的 URL（前端 <img> 用）。
 *  对齐后端 /api/images/<rel> 静态路由；同时兼容旧的绝对路径与 /api/image?path= 形态。
 */
function toImageUrl(reference: string | undefined | null): string {
  return toApiUrl(reference)
}

/** 任意弹窗打开时暂停 Dashboard 视频，避免海康原生窗口穿透到弹窗之上 */
/** 打开采集弹窗时快照初始图，避免父组件重渲染（如雷达距离）生成新数组把弹窗内新拍清掉 */
const captureDialogInitial = ref<string[]>([])

function onCaptureClick(key: CaptureKey) {
  if (key === 'evidence') {
    openEvidencePicker()
    return
  }
  if (key === 'license') {
    showLicenseDialog.value = true
    return
  }
  captureDialogInitial.value = captureInitialImages(key)
  captureDialog.value = key
}

function onCaptureConfirm(kind: CaptureKind, images: string[]) {
  if (kind === 'goods') {
    captureLists.value.goods = images
    captureThumbs.value.goods = images[0] || ''
  } else if (kind === 'evidence') {
    captureLists.value.evidence = images
    captureThumbs.value.evidence = images[0] || ''
  } else {
    captureThumbs.value[kind] = images[0] || ''
  }
}

function onLicenseConfirm(payload: {
  license: string
  licenseGc: string
  licenseStitched: string
}) {
  licensePaths.value = {
    license: payload.license || '',
    licenseGc: payload.licenseGc || '',
    licenseStitched: payload.licenseStitched || '',
  }
  // 主页缩略：有双图时优先主证（格子内分开展示）
  captureThumbs.value.license = payload.license || payload.licenseGc || ''
}

function captureInitialImages(kind: CaptureKind): string[] {
  if (kind === 'goods') return [...captureLists.value.goods]
  if (kind === 'evidence') return [...captureLists.value.evidence]
  const one = captureThumbs.value[kind]
  return one ? [one] : []
}

// ---- 预约 — 按键：任意时刻红灯落杆 step2；仅空闲弹窗 ----
/** @param recordPress 操作台点「预约」需走 btn-press；现场键已记过则 false */
let bookingPressInFlight = false
async function openBookingDialog(opts?: { recordPress?: boolean }) {
  const detecting =
    bookingStore.isDetection || bookingStore.checkStep > 0 || workflow.value.checkStep > 0

  if (opts?.recordPress) {
    if (bookingPressInFlight) return
    bookingPressInFlight = true
    try {
      const { getBookingApi } = await import('@/modules/booking/api/bookingApi')
      const r = await getBookingApi().recordBtnPress('ui')
      bookingStore.setBtnPrebookPending(true)
      if (r.openDialog === false) return
    } catch (e) {
      console.warn('[Booking] 操作台预约记时失败:', e)
      return
    } finally {
      bookingPressInFlight = false
    }
  }

  if (detecting) {
    bookingStore.setBtnPrebookPending(true)
    return
  }
  bookingStore.openDialog()
  workflow.value.bookingActive = bookingStore.bookingActive
}

function onWorkflowClick(key: WorkflowStepKey) {
  if (key === 'book') {
    void openBookingDialog({ recordPress: true })
  } else if (key === 'gate') {
    void onGateIconClick()
  } else if (key === 'camera') {
    showSafeCameraDialog.value = true
  }
}

function onBookingAccept(payload: BookingAcceptPayload) {
  bookingStore.applyAccept(payload)
  workflow.value.bookingActive = true
  bookingStore.setBtnPrebookPending(false)
}

function onBookingReject() {
  bookingStore.applyReject()
  workflow.value.bookingActive = false
  bookingStore.setBtnPrebookPending(false)
}

/** WS 来车/按键预约 → 空闲才弹窗；检测中只闪烁 */
function handleBookingComing(msg: { data?: unknown }) {
  const data = (msg.data ?? {}) as BookingComingPayload
  const action = data.action
  if (action === 'book_button') {
    bookingStore.setBtnPrebookPending(true)
    if (data.openDialog === false) return
    openBookingDialog()
    return
  }
  // coming / 无 action：兼容旧推送，仅空闲弹窗
  if (!action || action === 'coming') {
    if (bookingStore.isDetection || bookingStore.checkStep > 0) return
    openBookingDialog()
  }
}

function gateFeedbackOnline(data: Record<string, unknown>): boolean {
  const sensors = data.sensors as { bit: number; online: boolean | null }[] | undefined
  return data.fresh === true && sensors?.find(row => row.bit === 6)?.online === true
}

async function refreshSensorOnline() {
  if (showDeviceStatus.value) return
  try {
    const res = await request<{ sensors?: { connected: boolean }[] }>('/device/status')
    const sensors = res.data?.sensors
    devicesOnline.value = !!sensors?.length && sensors.every(sensor => sensor.connected)
  } catch { devicesOnline.value = false }
}

async function refreshGateStatus() {
  await refreshGateFromPlcCache()
}

let gatePollInFlight = false
/** 仅以带receivedAt的DEVICE为实态源，避免控制接口记忆值与组播互相覆盖。 */
async function refreshGateFromPlcCache() {
  if (gatePollInFlight) return
  gatePollInFlight = true
  try {
    const res = await request<Record<string, unknown> | null>('/device/plc-status', { timeout: 5000 })
    if (res.code === 0 && res.data) {
      applyPlcDeviceStatus(res.data)
    }
  } catch {
    if (Date.now() - lastGateFeedbackAt > 5000) gateOnline.value = false
  } finally { gatePollInFlight = false }
}

/** 对齐 Qt GateUIController::onIconClicked：点击直接切换抬杆/落杆，无确认弹窗 */
async function onGateIconClick() {
  if (gateBusy.value || gateFeedbackPending.value) return
  if (!gateOnline.value) {
    console.warn('[gate] 栏杆机未连接')
    void refreshGateStatus()
    return
  }
  const targetOpen = !gateDisplayOpen.value
  const token = gateFeedback.begin('gate', targetOpen)
  gateBusy.value = true
  try {
    // 以操作员看到的目标下发明确动作，避免快速再次点击时按旧反馈反向 toggle。
    const res = await controlGateApi(targetOpen ? 'open' : 'close')
    if (res.code === 0) {
      const d = res.data
      // 发送成功不代表实际到位，只接纳后续DEVICE反馈。
      gateFeedback.sent('gate', token)
      void refreshGateStatus()
      if (d && d.confirmed === false && d.sent) {
        console.info(
          '[gate]',
          '栏杆组播已发送，等待后续DEVICE反馈',
        )
      } else if (d && d.confirmed) {
        console.info('[gate]', res.message, d.packet, 'stickdown=', d.stickdown)
      } else if (res.message) {
        console.info('[gate]', res.message)
      }
    } else {
      gateFeedback.fail('gate', token)
      console.warn('[gate]', res.message || '栏杆控制失败')
      await refreshGateStatus()
    }
  } catch (e) {
    gateFeedback.fail('gate', token)
    console.warn('[gate]', e instanceof Error ? e.message : '栏杆控制失败')
    await refreshGateStatus()
  } finally {
    gateBusy.value = false
  }
}

// ---- 重置 / 确认 ----
/** 对齐 LvTongPro::onReset：先弹 QMessageBox 二次确认 */
function onReset() {
  showResetConfirmBox.value = true
}

async function onResetConfirmYes() {
  showResetConfirmBox.value = false
  // 先停后端调度/透视轮询，再清前端，避免迟到的 image_ready 把透视图填回
  try {
    const r = await request('/booking/reset', { method: 'POST' })
    console.info('[booking] reset 响应:', r.code, r.message)
  } catch (e) {
    console.warn('[booking] reset 失败:', e)
  }
  doReset()
}

function onResetConfirmNo() {
  showResetConfirmBox.value = false
}

function doReset() {
  form.value = {
    plate: '--',
    plateColor: '',
    plateGc: '--',
    plateGcColor: '',
    goods: '',
    goodsProductCode: '',
    goodsVarietyPinYin: '',
    containerType: '',
    truckType: '',
    size: '',
    loadRate: '',
    weight: '',
    phone: '',
    historyCount: '--',
  }
  previousSelection.value = []
  plateHistoryRange.value = null
  historyPreset.value = null
  // 清图片（对齐 Qt clearFormData 清除所有图片缩略图）
  captureThumbs.value = {}
  captureLists.value = { goods: [], evidence: [] }
  evidencePickerItems.value = null
  evidenceSourceKeys.clear()
  cropGoodsImages.clear()
  submitRemark.value = ''
  licensePaths.value = { license: '', licenseGc: '', licenseStitched: '' }
  weightRangeHint.value = ''
  aiLicenseCropLastKey = ''
  bodyView.value = 'body'
  bodyImageUrls.value = { body: '', top: '', side: '' }
  bodyProjectionGeneration++
  bodyRadarFetching.value = { top: false, side: false }
  bodyProjectionMeta.value = { top: { source: '', metersPerPixel: .01 }, side: { source: '', metersPerPixel: .01 } }
  bodyProjectionError.value = ''
  bodyCloudGeometry.value = null
  bodyRadarCapture.value = null
  bodyRadarRefreshQueued = false
  laneOccupied.value = false
  gateReleased.value = false
  radarObjectCount.value = 0
  xrayView.value = '200'
  xrayImageUrls.value = { '200': '', '160': '', mosaic: '' }
  onDeleteCropBoxes()
  resetXrayProcessState()
  aiLoadRateLastKey = ''
  aiLoadRateSeq += 1
  if (aiLoadRateTimer) {
    clearTimeout(aiLoadRateTimer)
    aiLoadRateTimer = null
  }
  aiTruckRealLastKey = ''
  aiTruckRealLastWheel = 0
  aiTruckRealSeq += 1
  if (aiTruckRealTimer) {
    clearTimeout(aiTruckRealTimer)
    aiTruckRealTimer = null
  }
  aiLicenseCropLastKey = ''
  aiLicenseCropSeq += 1
  if (aiLicenseCropTimer) {
    clearTimeout(aiLicenseCropTimer)
    aiLicenseCropTimer = null
  }
  aiGoodsRealLastKey = ''
  aiGoodsRealSeq += 1
  if (aiGoodsRealTimer) {
    clearTimeout(aiGoodsRealTimer)
    aiGoodsRealTimer = null
  }
  aiGoodsXrayLastKey = ''
  aiGoodsXraySeq += 1
  if (aiGoodsXrayTimer) {
    clearTimeout(aiGoodsXrayTimer)
    aiGoodsXrayTimer = null
  }
  // 清通行码
  passcode.value = null
  // 清工作流状态
  bookingStore.reset()
  workflow.value.bookingActive = false
  workflow.value.checkStep = 0
  workflow.value.stepMessage = ''
  workflow.value.btnPrebookTime = ''
  workflow.value.acceptanceTime = ''
  workflow.value.opengateTime = ''
  workflow.value.openlightscreenTime = ''
  workflow.value.closelightscreenTime = ''
  workflow.value.cdPhotoTime = ''
}

/** 车顶照：只用图像采集区域（手机上传 / 浏览器拍照），不用车身影像雷达测顶 */
function resolveTopImageRef(): string {
  return captureThumbs.value.top || ''
}

/** 出口称重：主页 form.weight；提交时若仍空则回退通行码 exWeight */
function resolveExitWeight(): string {
  const fromForm = String(form.value.weight ?? '').trim()
  if (fromForm) return fromForm
  const fromPc = passcode.value?.valid ? String(passcode.value.exWeight ?? '').trim() : ''
  return fromPc
}

function buildSubmitPreview(): InspectionDetail {
  const plate = form.value.plate === '--' ? '' : form.value.plate
  const truck = truckTypeOptions.value.find((t) => t.type_code === form.value.truckType)
  const container = containerTypeOptions.value.find(
    (t) => t.type_code === form.value.containerType,
  )
  // 多图字段必须逐张 toApiUrl：移动端绝对路径等否则 <img> 无法加载
  const goodsJoined = (captureLists.value.goods || [])
    .map((p) => toApiUrl(p))
    .filter(Boolean)
    .join('|')
  const evidenceJoined = (captureLists.value.evidence || [])
    .map((p) => toApiUrl(p))
    .filter(Boolean)
    .join('|')
  const pc = passcode.value?.valid ? passcode.value : null
  const exitWeight = resolveExitWeight()
  const activeReviewer = auth.resolveActiveReviewer()

  return {
    id: 0,
    plate_number: plate,
    plate_number_gc: form.value.plateGc === '--' ? '' : form.value.plateGc,
    driver_phone: form.value.phone,
    vehicle_type: form.value.truckType,
    vehicle_name: truck?.type_name || '',
    vehicle_container_type: form.value.containerType,
    vehicle_container_name: container?.type_name || '',
    goods_type: form.value.goodsProductCode || form.value.goods,
    goods_name: form.value.goods,
    load_rate: form.value.loadRate.trim() === '' ? 0 : parseFloat(form.value.loadRate) || 0,
    load_weight: parseFloat(exitWeight) || 0,
    vehicle_size: form.value.size,
    head_image_path: toApiUrl(captureThumbs.value.head || '') || undefined,
    tail_image_path: toApiUrl(captureThumbs.value.tail || '') || undefined,
    top_image_path: toApiUrl(resolveTopImageRef()) || undefined,
    body_image_path: toApiUrl(bodyImageUrls.value.body || '') || undefined,
    radar_side_image_path: toApiUrl(bodyRadarForSave('side')) || undefined,
    radar_top_image_path: toApiUrl(bodyRadarForSave('top')) || undefined,
    radar_head_image_path: toApiUrl(bookingStore.radarHeadImageUrl || '') || undefined,
    transparent_image_path:
      toApiUrl(xrayDisplayUrl.value || xrayImageUrls.value['200'] || '') || undefined,
    goods_image_path: goodsJoined || undefined,
    evidences_image_path: evidenceJoined || undefined,
    license_image_path:
      toApiUrl(
        licensePaths.value.licenseStitched ||
          (!licensePaths.value.licenseGc ? licensePaths.value.license : '') ||
          captureThumbs.value.license ||
          '',
      ) || undefined,
    pass_code_image_path: toApiUrl(captureThumbs.value.passcode || '') || undefined,
    operator_name: auth.user?.realName || '',
    inspector_phone: auth.user?.phone || '',
    reviewer_phone: activeReviewer.phone || '',
    reviewer_name: activeReviewer.name || '',
    group_id: auth.user?.groupId ?? 0,
    result_status: 0,
    history_record: submitRemark.value,
    pass_code_vehicle_color_name: form.value.plateColor || pc?.vehicleColorName || '',
    pass_code_en_station_id: pc?.enStationId,
    pass_code_ex_station_id: pc?.exStationId,
    pass_code_en_weight: pc?.enWeight,
    // 与主页「出口称重」一致：优先 form，回退通行码
    pass_code_ex_weight: exitWeight || pc?.exWeight,
    pass_code_media_type_id: pc != null ? String(pc.mediaTypeId ?? '') : undefined,
    pass_code_transaction_id: pc?.transactionId,
    pass_code_pass_id: pc?.passId,
    pass_code_ex_time: pc?.exTime,
    pass_code_trans_pay_type: pc != null ? String(pc.transPayTypeId ?? '') : undefined,
    pass_code_fee: pc?.fee,
    pass_code_pay_fee: pc?.payFee,
    pass_code_vehicle_sign: pc?.vehicleSignId != null
      ? `0x${pc.vehicleSignId.toString(16).toUpperCase()}`
      : undefined,
    pass_code_province_count: pc?.provinceCount,
  }
}

async function onConfirm() {
  /** 对齐 LvTongPro::onConfirmClicked：先弹查验记录预览，再写库 */
  if (aiSilentBusy.value) {
    alert(aiSilentBusyHint.value || 'AI 处理中，请稍候再确认')
    return
  }
  if (!form.value.goods) {
    alert('请选择农产品类型')
    return
  }
  if (weightInputError.value) {
    alert(weightInputError.value)
    return
  }
  // 打开确认页前刷新登录用户 phone/groupId，保证查验/班组能回显
  try {
    const me = await getCurrentUserApi()
    if (me.code === 0 && me.data && auth.user) {
      auth.user = {
        ...auth.user,
        phone: me.data.phone || auth.user.phone,
        realName: me.data.realName || auth.user.realName,
        role: me.data.role ?? auth.user.role,
        groupId: me.data.groupId ?? auth.user.groupId,
      }
    }
  } catch {
    /* 刷新失败仍用本地缓存用户信息 */
  }
  submitPreview.value = buildSubmitPreview()
  showSubmitPreview.value = true
}

async function onSubmitConfirmYes(payload?: {
  result_status?: number
  reviewer_phone?: string
  inspector_phone?: string
  no_pass_type?: number
  group_id?: number
  history_record?: string
}) {
  submitRemark.value = payload?.history_record ?? submitRemark.value
  showSubmitPreview.value = false
  submitPreview.value = null

  if (aiSilentBusy.value) {
    alert(aiSilentBusyHint.value || 'AI 处理中，请稍候再提交')
    return
  }

  // 行驶证 blob: 后端无法读取 → 提交前转 dataURL，保证三件套（拼接/-main/-hang）都能落盘
  async function materializeForSubmit(src: string): Promise<string> {
    if (!src) return ''
    if (!src.startsWith('blob:')) return toStoragePath(src)
    try {
      const res = await fetch(src)
      if (!res.ok) return ''
      const blob = await res.blob()
      return await new Promise<string>((resolve, reject) => {
        const fr = new FileReader()
        fr.onload = () => resolve(String(fr.result || ''))
        fr.onerror = () => reject(fr.error || new Error('read fail'))
        fr.readAsDataURL(blob)
      })
    } catch (e) {
      console.warn('[submit] 行驶证 blob 转 dataURL 失败', e)
      return ''
    }
  }
  const [licStitched, licMain, licHang] = await Promise.all([
    materializeForSubmit(licensePaths.value.licenseStitched || ''),
    materializeForSubmit(licensePaths.value.license || ''),
    materializeForSubmit(licensePaths.value.licenseGc || ''),
  ])

  // ---- 1. 组装 body（50+ 字段，对齐 Qt VehicleInspection） ----
  // 图片统一交给后端 persist_to_storage 归一：前端只负责把"任何形态的引用"
  // （dataUrl、blob、/api/images/<rel>、绝对路径等）原样/可识别地交给后端；
  // 自动拍与手动拍都先在前端预览，真正落盘与改名在提交时完成。
  const body: Record<string, unknown> = {
    // 业务字段
    plate_number: form.value.plate === '--' ? '' : form.value.plate,
    plate_number_gc: form.value.plateGc === '--' ? '' : form.value.plateGc,
    driver_phone: form.value.phone,
    vehicle_type: form.value.truckType,
    vehicle_container_type: form.value.containerType,
    goods_type: form.value.goodsProductCode || form.value.goods,
    goods_name: form.value.goods,
    // 满载率可空：提交时前端补 0（勿传空串给 numeric 列）
    load_rate: form.value.loadRate.trim() === '' ? 0 : parseFloat(form.value.loadRate) || 0,
    load_weight: parseFloat(resolveExitWeight()) || 0,
    vehicle_size: form.value.size,
    // 8 个图片路径（Qt m_*ImagePath）
    head_image_path: toStoragePath(captureThumbs.value.head || ''),
    tail_image_path: toStoragePath(captureThumbs.value.tail || ''),
    body_image_path: toStoragePath(bodyImageUrls.value.body || ''),
    // 车顶：图像采集区域（与预览一致），不用车身影像雷达测顶
    top_image_path: toStoragePath(resolveTopImageRef()),
    // 雷达三图：车侧/车顶来自车身影像；车头来自预约受理图
    radar_side_image_path: toStoragePath(bodyRadarForSave('side')),
    radar_top_image_path: toStoragePath(bodyRadarForSave('top')),
    radar_head_image_path: toStoragePath(bookingStore.radarHeadImageUrl || ''),
    transparent_image_path: toStoragePath(xrayImageUrls.value['200'] || ''),
    // 通行码 QR 图（对齐 Qt m_codeImagePath，flask 后端生成）
    passcode_image_path: toStoragePath(captureThumbs.value.passcode || ''),
    // 货物图 / 证据照（多张统一 | 分隔）
    goods_image_path: joinImagePaths(captureLists.value.goods || []),
    evidences_image_path: joinImagePaths(captureLists.value.evidence || []),
    // 行驶证：落库用拼接图；主/挂旁路落盘（-main / -hang）
    license_image_path: licStitched,
    license_image_main: licMain,
    license_image_hang: licHang,
    license_image_path1: '',
    // 查验/班组用登录用户；复核人用登录所选（确认页可再改）
    operator_name: auth.user?.realName || '',
    inspector_phone: payload?.inspector_phone || auth.user?.phone || '',
    reviewer_phone:
      payload?.reviewer_phone || auth.resolveActiveReviewer().phone || '',
    group_id: payload?.group_id ?? auth.user?.groupId ?? '',
    // 0=正常，1=异常
    result_status: payload?.result_status ?? 0,
    no_pass_type: payload?.no_pass_type ?? 0,
    history_record: submitRemark.value,
  }

  // ---- 3. 通行码 14 字段（从 passcode ref 读） ----
  if (passcode.value && passcode.value.valid) {
    const pc = passcode.value
    body.passcode_vehicle_id = pc.vehicleId
    body.passcode_vehicle_display_id = pc.vehicleDisplayId
    body.passcode_vehicle_color_name = pc.vehicleColorName
    body.passcode_en_station_id = pc.enStationId
    body.passcode_ex_station_id = pc.exStationId
    body.passcode_en_weight = pc.enWeight
    body.passcode_ex_weight = pc.exWeight
    body.passcode_media_type = String(pc.mediaTypeId ?? '')
    body.passcode_transaction_id = pc.transactionId
    body.passcode_pass_id = pc.passId
    body.passcode_ex_time = pc.exTime
    body.passcode_trans_pay_type = String(pc.transPayTypeId ?? '')
    body.passcode_fee = pc.fee
    body.passcode_pay_fee = pc.payFee
    body.passcode_vehicle_sign = pc.vehicleSignId != null ? `0x${pc.vehicleSignId.toString(16).toUpperCase()}` : ''
    body.passcode_province_count = pc.provinceCount
  }

  // ---- 4. 7 个时间戳（权威源是后端 _booking_state；前端仅在缺失时同步显示） ----
  // 注意：实际入库值由后端 submit_inspection 从 _booking_state 注入（最强权威）。
  // 前端发送的值只用于覆盖（让前端有"重置后还在用老时间"的余地），一般置空让后端注入。
  if (workflow.value.btnPrebookTime) body.btn_prebook_time = workflow.value.btnPrebookTime
  if (bookingStore.acceptanceTime) body.acceptance_time = bookingStore.acceptanceTime
  if (workflow.value.opengateTime) body.opengate_time = workflow.value.opengateTime
  if (workflow.value.openlightscreenTime) body.openlightscreen_time = workflow.value.openlightscreenTime
  if (workflow.value.closelightscreenTime) body.closelightscreen_time = workflow.value.closelightscreenTime
  if (workflow.value.cdPhotoTime) body.cd_photo_time = workflow.value.cdPhotoTime
  // inspection_time ← 后端 submit 时打（不用前端传）

  try {
    const res = await request('/inspection/submit', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    if (res.code === 0) {
      alert('提交成功')
      try {
        await request('/booking/reset', { method: 'POST' })
      } catch (e) {
        console.warn('[booking] reset 失败:', e)
      }
      doReset()
    } else {
      alert(res.message || '提交失败')
    }
  } catch (e) {
    alert('提交失败: ' + (e instanceof Error ? e.message : '未知错误'))
  }
}

function onSubmitConfirmNo() {
  showSubmitPreview.value = false
  submitPreview.value = null
}

// ---- 急停（对齐 LvTongPro::onStopClicked / onPLCStopChanged）----
/** 防止复位弹窗重复弹出 — 对齐 m_openStopFlag */
const openStopFlag = ref(false)
const showStopConfirmBox = ref(false)
const showStopResetBox = ref(false)
const stopErrorVisible = ref(false)
const stopErrorMessage = ref('')

// ---- 提交前查验记录预览 — 对齐 DetailDialog ----
const showSubmitPreview = ref(false)
const submitPreview = ref<InspectionDetail | null>(null)
const submitRemark = ref('')
const showResetConfirmBox = ref(false)

// ---- WebSocket 实时数据 ----
function setupWS() {
  wsStore.connect()

  // 晚进页时回放 WS 已缓存的 DEVICE，避免信号灯/光机图标全灰
  if (wsStore.lastPlcStatus) {
    applyPlcDeviceStatus(wsStore.lastPlcStatus)
  }

  let radarLogN = 0
  let pendingRadarDistance: number | null = null
  let radarRaf = 0
  const unsubscribeRadar = wsStore.subscribe('radar_distance', (msg) => {
    const data = msg.data as {
      distance?: number
      mode?: number
      objectCount?: number
    } | undefined
    if (data?.distance == null || !Number.isFinite(Number(data.distance))) return
    const d = Number(data.distance)
    if (data.objectCount != null && Number.isFinite(Number(data.objectCount))) {
      radarObjectCount.value = Number(data.objectCount)
    }
    // 合并到下一帧再写 ref，避免 10Hz+ 同步重绘压主线程
    pendingRadarDistance = d
    if (!radarRaf) {
      radarRaf = requestAnimationFrame(() => {
        radarRaf = 0
        if (pendingRadarDistance != null) {
          radarDistance.value = pendingRadarDistance
          pendingRadarDistance = null
        }
      })
    }
    radarLogN += 1
    if (radarLogN === 1 || radarLogN % 20 === 0) {
      console.info(`[WS] radar_distance #${radarLogN}: ${d}m mode=${data.mode ?? '-'}`)
    }
  })
  onUnmounted(() => {
    unsubscribeRadar()
    if (radarRaf) cancelAnimationFrame(radarRaf)
  })

  wsStore.subscribe('device_status', (msg) => {
    console.log('[WS] 设备状态:', msg.data)
  })

  wsStore.subscribe('plc_status', (msg) => {
    console.log('[WS] PLC状态:', msg.data)
    const data = msg.data as Record<string, unknown> | undefined
    if (!data || !applyPlcDeviceStatus(data)) return
    const urgent =
      data?.urgentstop === true ||
      data?.urgentStop === true ||
      data?.stop === true
    if (urgent && !openStopFlag.value) {
      openStopFlag.value = true
      showStopResetBox.value = true
    }
  })

  // $NTRMC,XRSUP/XRSDOWN（及旧 XRAY200/160）
  wsStore.subscribe('xray_status', (msg) => {
    const data = msg.data as {
      type?: string
      kv?: number
      ma?: number
      temperature?: number
    } | undefined
    if (!data?.type) return
    const kv = _fmtXrayNum(data.kv)
    const ma = _fmtXrayNum(data.ma)
    const temp = _fmtXrayNum(data.temperature)
    if (String(data.type) === '200') {
      xrayTelemetry.value = { ...xrayTelemetry.value, kv200: kv, ma200: ma, temp200: temp }
    } else if (String(data.type) === '160') {
      xrayTelemetry.value = { ...xrayTelemetry.value, kv160: kv, ma160: ma, temp160: temp }
    }
  })

  wsStore.subscribe('detection_step', (msg) => {
    const data = msg.data as {
      step?: number
      message?: string
      gateReleased?: boolean
    } | undefined
    if (data?.gateReleased) {
      gateReleased.value = true
      laneOccupied.value = false
    }
    if (data?.step != null) {
      workflow.value.checkStep = data.step
      workflow.value.stepMessage = data.message ?? ''
      // 仅抬杆放行更新预约流程 checkStep；距离阈值也会推 step=2 等，勿混淆
      if (data.gateReleased || data.message === '放行中') {
        bookingStore.checkStep = data.step
      }
    }
  })

  wsStore.subscribe('lane_occupied', (msg) => {
    const data = msg.data as { occupied?: boolean } | undefined
    if (data?.occupied != null) {
      laneOccupied.value = Boolean(data.occupied)
    }
  })

  // 对齐 PLC bookingStatus → 弹 OrderDialog
  wsStore.subscribe('booking_request', handleBookingComing)
  wsStore.subscribe('booking', handleBookingComing)

  wsStore.subscribe('booking_accepted', (msg) => {
    // 新一轮不得保留上一辆车的点云或在途缓存响应。
    bodyProjectionGeneration++
    bodyRadarFetching.value = { top: false, side: false }
    bodyRadarRefreshQueued = false
    bodyCloudGeometry.value = null
    bodyImageUrls.value.top = ''
    bodyImageUrls.value.side = ''
    bodyRadarCapture.value = null
    void ensureBodyRadarImage(true)
    const data = msg.data as BookingAcceptedPayload | undefined
    laneOccupied.value = false
    gateReleased.value = false
    radarObjectCount.value = 0
    if (data?.vehicleHeight != null) {
      bookingStore.applyAccept({
        vehicleHeight: data.vehicleHeight,
        carHeadLength: data.carHeadLength,
        // 后端给光机使用 large，前端预约车型使用 big。
        vehicleType: data.vehicleType === 'large' ? 'big' : 'small',
        xrayEnabled: data.xrayEnabled,
        linePosition: data.linePosition ?? 0.5,
        radarHeadImageUrl: data.radarHeadImageUrl,
      })
      workflow.value.bookingActive = true
    } else {
      bookingStore.setBtnPrebookPending(false)
    }
    // 同步 6 个时间字段（来自后端 _booking_state 推送）
    if (data) {
      const a = data as unknown as Record<string, string | undefined>
      bookingStore.setTimeFields({
        btnPrebookTime: a.btnPrebookTime,
        acceptanceTime: a.acceptanceTime,
        opengateTime: a.opengateTime,
        openlightscreenTime: a.openlightscreenTime,
        closelightscreenTime: a.closelightscreenTime,
        cdPhotoTime: a.cdPhotoTime,
      })
      workflow.value.btnPrebookTime = a.btnPrebookTime || workflow.value.btnPrebookTime
      workflow.value.acceptanceTime = a.acceptanceTime || workflow.value.acceptanceTime
      workflow.value.opengateTime = a.opengateTime || workflow.value.opengateTime
      workflow.value.openlightscreenTime = a.openlightscreenTime || workflow.value.openlightscreenTime
      workflow.value.closelightscreenTime = a.closelightscreenTime || workflow.value.closelightscreenTime
      workflow.value.cdPhotoTime = a.cdPhotoTime || workflow.value.cdPhotoTime
    }
  })

  wsStore.subscribe('booking_rejected', () => {
    bookingStore.applyReject()
    workflow.value.bookingActive = false
    laneOccupied.value = false
    gateReleased.value = false
    radarObjectCount.value = 0
  })

  /** 对齐 LvTongPro::onReset：服务端推送 booking_reset 时兜底重置 */
  wsStore.subscribe('booking_reset', () => {
    doReset()
  })

  /** 检测中才接受中间件 progressive 推送，重置后迟到的帧忽略 */
  function shouldAcceptPanelImages() {
    return bookingStore.isDetection
  }

  const unsubscribeBodyRadar = wsStore.subscribe('body_radar', (msg) => {
    const capture = msg.data as BodyRadarCaptureStatus | undefined
    if (!capture) return
    if (bodyRadarCapture.value?.generation !== capture.generation || capture.state === 'stopped') {
      bodyProjectionGeneration++
      bodyRadarFetching.value = { top: false, side: false }
      bodyRadarRefreshQueued = false
      bodyCloudGeometry.value = null
      bodyImageUrls.value.top = ''
      bodyImageUrls.value.side = ''
    }
    bodyRadarCapture.value = capture
    // 通知只携带轻量状态，实际点云通过缓存接口获取，不重复访问中间件。
    if (capture.hasData || capture.state === 'finished' || capture.state === 'timeout') {
      void ensureBodyRadarImage(true)
    }
  })
  // 页面刷新或断线重连后恢复缓存；即使停留在车身图也持续接收本轮点云。
  const unsubscribeBodyRadarConnection = watch(() => wsStore.isConnected, (connected) => {
    if (connected) void ensureBodyRadarImage(true)
  }, { immediate: true })
  onUnmounted(() => { unsubscribeBodyRadar(); unsubscribeBodyRadarConnection() })

  /** 图像就绪：兼容
   *  1) mock_back：{ imageType: body|transparent, urls: {1,2,3} }
   *  2) flask capture_service：{ imageType: head|tail|top|..., url }
   */
  wsStore.subscribe('image_ready', (msg) => {
    const data = msg.data as
      | {
          imageType?: string
          group?: number
          url?: string
          urls?: Record<string, string>
        }
      | undefined
    if (!data?.imageType) return

    const withCacheBust = (raw: string) => {
      const apiUrl = toImageUrl(raw)
      if (!apiUrl) return ''
      if (apiUrl.startsWith('data:') || apiUrl.startsWith('blob:')) return apiUrl
      return `${apiUrl}${apiUrl.includes('?') ? '&' : '?'}t=${Date.now()}`
    }
    /** urls 键兼容 '1' / 1 */
    const pickUrl = (urls: Record<string, string>, key: string) => {
      const raw =
        urls[key] ??
        (urls as Record<string | number, string>)[Number(key)]
      return raw ? withCacheBust(String(raw)) : ''
    }

    // 调度器自动采集 / 手动同逻辑：单张 url（多为 dataUrl，提交时再落盘）
    if (data.url) {
      const raw = String(data.url)
      const isInline =
        raw.startsWith('data:') || raw.startsWith('blob:')
      const viewUrl = withCacheBust(raw)
      const t = data.imageType
      if (t === 'head' || t === 'tail' || t === 'top' || t === 'goods' || t === 'evidence' || t === 'license') {
        captureThumbs.value = { ...captureThumbs.value, [t]: viewUrl }
        // 图像采集(枪机) 与 车身影像(中间 agent) 无关，不要写 bodyImageUrls
      }
      console.info(
        `[WS] image_ready: ${t} → ${isInline ? `dataUrl(${raw.length} chars)` : viewUrl}`,
      )
      return
    }

    // 中间设备 agent / 占位批量出图 → 仅填车身影像、透视影像
    if (!data.urls) return
    if (!shouldAcceptPanelImages()) {
      console.info(`[WS] image_ready ${data.imageType} ignored (idle)`)
      return
    }
    if (data.imageType === 'body') {
      const u1 = pickUrl(data.urls, '1')
      const u2 = pickUrl(data.urls, '2')
      const u3 = pickUrl(data.urls, '3')
      // 整对象替换，保证面板 computed 一定刷新
      if (u2) bodyProjectionMeta.value.top = { source: 'live', metersPerPixel: .01 }
      if (u3) bodyProjectionMeta.value.side = { source: 'live', metersPerPixel: .01 }
      bodyImageUrls.value = {
        body: u1 || bodyImageUrls.value.body,
        top: u2 || bodyImageUrls.value.top,
        side: u3 || bodyImageUrls.value.side,
      }
      console.info(
        `[WS] image_ready body → body=${!!u1} top=${!!u2} side=${!!u3}`,
        data.urls,
      )
    } else if (data.imageType === 'transparent') {
      const u1 = pickUrl(data.urls, '1')
      const u2 = pickUrl(data.urls, '2')
      const u3 = pickUrl(data.urls, '3')
      xrayImageUrls.value = {
        '200': u1 || xrayImageUrls.value['200'],
        '160': u2 || xrayImageUrls.value['160'],
        mosaic: u3 || xrayImageUrls.value.mosaic,
      }
      console.info(
        `[WS] image_ready transparent → 200=${!!u1} 160=${!!u2} mosaic=${!!u3}`,
        data.urls,
      )
    } else {
      console.info(
        `[WS] image_ready group: ${data.imageType} group=${data.group} urls=${Object.keys(data.urls).length}`,
      )
    }
  })

  /** 移动 app 上传 — 对齐 LvTongPro.cpp:1680-1948 JsonFolderWatcher 回调 */
  wsStore.subscribe('mobile_upload', (msg) => {
    const data = msg.data as
      | {
          sessionId?: string
          plate_number_gc?: string
          phone?: string
          goods_type?: string
          head_image_path?: string
          body_image_path?: string
          top_image_path?: string
          tail_image_path?: string
          passcode_image_path?: string
          license_image_path1?: string
          license_image_path2?: string
          goods_image_path?: string  // 多个，| 分隔
          evidences_image_path?: string
        }
      | undefined
    if (!data) return

    // 13 个图片字段 — 对齐 Qt m_headImagePath / m_tailImagePath / m_bodyPath / m_licenseImagePath1/2 / m_codeImagePath
    if (data.head_image_path) captureThumbs.value.head = toImageUrl(data.head_image_path)
    if (data.tail_image_path) captureThumbs.value.tail = toImageUrl(data.tail_image_path)
    if (data.body_image_path) bodyImageUrls.value.body = toImageUrl(data.body_image_path)
    // 手机车顶图 → 图像采集区域（与浏览器拍照同一槽位）
    if (data.top_image_path) captureThumbs.value.top = toImageUrl(data.top_image_path)
    // passcode_image_path 是 flask 后端用 QR 库生成的（对齐 Qt QZXing::encodeData）
    if (data.passcode_image_path) captureThumbs.value.passcode = toImageUrl(data.passcode_image_path)
    if (data.license_image_path1) licensePaths.value.license = toImageUrl(data.license_image_path1)
    if (data.license_image_path2) licensePaths.value.licenseGc = toImageUrl(data.license_image_path2)
    // 主页缩略图读的是 captureThumbs.license；原先只写了 licensePaths，要点开行驶证弹窗确认后才有图
    if (data.license_image_path1 || data.license_image_path2) {
      // 移动上传通常是分开的两张；拼接图提交时由后端补拼
      licensePaths.value.licenseStitched = ''
      captureThumbs.value.license =
        licensePaths.value.license || licensePaths.value.licenseGc || ''
    }

    // 货物图（多张，| 分隔 — 手机多次上传追加，不覆盖）
    if (data.goods_image_path) {
      const urls = data.goods_image_path.split('|').filter(Boolean).map(toImageUrl)
      const next = [...(captureLists.value.goods || []), ...urls]
      captureLists.value = { ...captureLists.value, goods: next }
      captureThumbs.value = {
        ...captureThumbs.value,
        goods: next[next.length - 1] || '',
      }
    }

    // 证据照（多张，| 分隔 — 手机多次上传追加，不覆盖）
    if (data.evidences_image_path) {
      const urls = data.evidences_image_path.split('|').filter(Boolean).map(toImageUrl)
      const next = [...(captureLists.value.evidence || []), ...urls]
      captureLists.value = { ...captureLists.value, evidence: next }
      captureThumbs.value = {
        ...captureThumbs.value,
        evidence: next[next.length - 1] || '',
      }
    }

    // 业务字段 — 对齐 Qt ui.lineEdit_phone / ui.lineEdit_plate_gc / ui.lineEdit_goods
    if (data.phone) form.value.phone = data.phone
    if (data.plate_number_gc) form.value.plateGc = data.plate_number_gc
    if (data.goods_type) {
      form.value.goods = data.goods_type
      // 对齐 Qt ui.lineEdit_goods->setProperty('productCode', ...)
      form.value.goodsProductCode = data.goods_type
    }
    // 若本包自带 passcode，同步主页出口称重（mobile_passcode 事件也会再填一次）
    const embedded = (data as { passcode?: { valid?: boolean; exWeight?: string } }).passcode
    if (embedded?.valid && embedded.exWeight != null && String(embedded.exWeight).trim() !== '') {
      form.value.weight = String(embedded.exWeight).trim()
    }

    console.info(
      `[mobile_upload] session=${data.sessionId} plate_gc=${data.plate_number_gc} ` +
      `phone=${data.phone} head=${!!data.head_image_path} body=${!!data.body_image_path} ` +
      `top=${!!data.top_image_path} license1=${!!data.license_image_path1} ` +
      `license2=${!!data.license_image_path2} goods=${!!data.goods_image_path} ` +
      `evidences=${!!data.evidences_image_path} exWeight=${embedded?.exWeight ?? ''}`,
    )
  })

  /** 通行码 14 字段解析 — 对齐 Qt PassCodeUtil::GetPassCodeInfoByCodeStr */
  wsStore.subscribe('mobile_passcode', (msg) => {
    const pc = msg.data as typeof passcode.value
    if (!pc || !pc.valid) return
    applyPasscode(pc)
    console.info(
      `[mobile_passcode] vehicle=${pc.vehicleDisplayId} color=${pc.vehicleColorName} ` +
      `enSta=${pc.enStationId} exSta=${pc.exStationId} exWeight=${pc.exWeight} fee=${pc.fee}`,
    )
  })
}

function onStopClick() {
  // 对齐 QMessageBox::question(this, "系统提醒", "确定执行急停操作？", Yes|No)
  showStopConfirmBox.value = true
}

/** 顶栏工具 — 对齐 onHistoryClicked / onPlcControl / onWebServiceClicked / onSettingClicked */
function onHeaderToolClick(key: string, anchor?: ToolAnchor) {
  if (key === 'history') {
    historyPreset.value = null
    showHistory.value = true
    return
  }
  if (key === 'plc') {
    if (showPlcControl.value) {
      showPlcControl.value = false
      return
    }
    showAiStatus.value = false
    showDeviceStatus.value = false
    if (anchor) {
      plcAnchor.value = { left: anchor.left, top: anchor.bottom }
    }
    showPlcControl.value = true
    return
  }
  if (key === 'ai') {
    if (showAiStatus.value) {
      showAiStatus.value = false
      return
    }
    showPlcControl.value = false
    showDeviceStatus.value = false
    if (anchor) {
      aiAnchor.value = { left: anchor.left, top: anchor.bottom }
    }
    showAiStatus.value = true
    return
  }
  if (key === 'device') {
    // 对齐 onSettingClicked：再点关闭；位置 mapToGlobal(-50, height)
    if (showDeviceStatus.value) {
      showDeviceStatus.value = false
      return
    }
    showPlcControl.value = false
    showAiStatus.value = false
    if (anchor) {
      deviceAnchor.value = { left: anchor.left - 50, top: anchor.bottom }
    }
    showDeviceStatus.value = true
    return
  }
  if (key === 'stop') {
    onStopClick()
    return
  }
  if (key === 'user') {
    // 对齐 onUsrMgrClicked：仅 role==0 系统管理员可打开
    if (Number(auth.user?.role) === 0) {
      showUserMgr.value = true
    } else {
      showUsrMgrDenied.value = true
    }
  }
}

function onAiStatusChange(online: boolean) {
  aiOnline.value = online
}

function onDevicesStatusChange(allOnline: boolean) {
  devicesOnline.value = allOnline
}

async function onStopConfirmYes() {
  showStopConfirmBox.value = false
  try {
    await request('/booking/urgent-stop', { method: 'POST' })
    openStopFlag.value = false
  } catch {
    stopErrorMessage.value = '停止光机失败'
    stopErrorVisible.value = true
  }
}

function onStopConfirmNo() {
  showStopConfirmBox.value = false
}

async function onStopResetYes() {
  // 对齐 QMessageBox::question(..., "设备急停！ 是否复位？", Yes)
  showStopResetBox.value = false
  try {
    await request('/booking/stop-reset', { method: 'POST' })
    openStopFlag.value = false
  } catch {
    stopErrorMessage.value = '急停复位失败'
    stopErrorVisible.value = true
  }
}

function onStopResetClose() {
  showStopResetBox.value = false
}

onMounted(async () => {
  loadDicts()
  setupWS()
  document.addEventListener('click', onXrayDocClick)
  await nextTick()
  startLiveVideo()
  void refreshGateStatus()
  void refreshGateFromPlcCache()
  void refreshSensorOnline()
  gateStatusTimer = setInterval(() => {
    void refreshGateStatus()
    void refreshSensorOnline()
  }, 2000)
})

onUnmounted(() => {
  document.removeEventListener('click', onXrayDocClick)
  window.clearTimeout(xrayApplyTimer)
  if (gateStatusTimer) {
    clearInterval(gateStatusTimer)
    gateStatusTimer = null
  }
  stopLiveVideo()
  wsStore.disconnect()
})

/** 任意弹窗打开时暂停主页交互。 */
const anyDialogOpen = computed(
  () =>
    showBooking.value ||
    showTalkDialog.value ||
    showSafeCameraDialog.value ||
    showHistory.value ||
    showPlcControl.value ||
    showAiStatus.value ||
    showDeviceStatus.value ||
    showUserMgr.value ||
    showUsrMgrDenied.value ||
    showCarSize.value ||
    captureDialog.value !== null ||
    evidencePickerItems.value !== null ||
    showLicenseDialog.value ||
    showPasscodeScan.value ||
    showStopConfirmBox.value ||
    showStopResetBox.value ||
    stopErrorVisible.value ||
    showTransDelConfirm.value ||
    showSubmitPreview.value,
)
</script>

<template>
  <div class="dashboard">
    <AppHeader
      :username="auth.user?.realName"
      :ai-online="aiOnline"
      :devices-online="devicesOnline"
      @tool-click="onHeaderToolClick"
    />

    <div class="dashboard-body">
      <!-- 左侧 -->
      <section class="panel-left">
        <!-- 车身影像 — 车身图 / 3D视图切换 -->
        <div class="panel-card panel-stretch">
          <div class="panel-header panel-header-body">
            <img src="/assets/img/a_car.png" class="panel-icon" alt="" />
            <span class="panel-title">车身影像</span>
            <span class="header-spacer" aria-hidden="true" />
            <span v-if="bodyView !== 'body'" class="projection-source" :title="bodyRadarStatusText">{{ bodyRadarStatusText }}</span>
            <span v-if="bodyCaptureError" class="projection-error" :title="bodyCaptureError">{{ bodyCaptureError }}</span>
            <span v-if="bodyView !== 'body' && bodyProjectionError" class="projection-error" :title="bodyProjectionError">拉取失败</span>
            <span class="xray-meta">{{ bodyViewLabel }}：</span>
            <button v-if="bodyView !== 'body'" type="button" class="body-capture-btn" :disabled="!bodyCanCapture" title="截取整个当前点云视图" @click="captureBodyCloud">截图</button>
            <button v-if="bodyView !== 'body'" type="button" class="header-icon-btn" title="刷新3D视图" aria-label="刷新3D视图" :disabled="bodyRadarFetching.top || bodyRadarFetching.side" @click="ensureBodyRadarImage(true)">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#5f9182" stroke-width="1.8" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 6.7M20 4v7h-7" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </button>
            <button type="button" class="header-icon-btn header-icon-swap" title="切换视角" @click="onBodyViewSwap">
              <img src="/assets/img/a_leftright.png" alt="" />
            </button>
            <button type="button" class="body-capture-btn" :disabled="!bodyCanCapture" title="全屏预览车身影像" @click="openImagePreview('body')">预览</button>
          </div>
          <BodyCloud3DPanel
            v-if="bodyView !== 'body'"
            ref="bodyCloudPanelRef"
            :geometry="bodyCloudGeometry"
            :loading="bodyRadarFetching.top || bodyRadarFetching.side"
            :error="bodyProjectionError || bodyRadarStatusText"
          />
          <BodyPointCloudPanel
            v-else
            ref="bodyPcPanelRef"
            :placeholder="bodyPlaceholderText"
            :placeholder-tone="bodyPlaceholderTone"
            :image-url="bodyImageUrl || undefined"
            :source-temp-url="bodyImageUrl || undefined"
            :view="bodyView"
            :capture-mode="true"
            :meters-per-pixel=".01"
            @crop="onBodyBoxCrop"
            @capture-error="onBodyCaptureError"
          />
        </div>

        <!-- 透视影像 — 灰场/亮场三档 + 渲染伪彩（对齐 color_demo） -->
        <div class="panel-card panel-stretch">
          <div class="panel-header panel-header-xray">
            <img src="/assets/img/a_xray.png" class="panel-icon" alt="" />
            <span class="panel-title">透视影像</span>
            <span class="xray-meta">{{ xrayViewLabel }}：</span>
            <span class="xray-label">灰场</span>
            <div class="xray-dropdown" :class="{ open: xrayOpenMenu === 'gamma' }">
              <button type="button" class="xray-dropdown-trigger" @click.stop="toggleXrayMenu('gamma')">
                <span>{{ gammaLabel }}</span>
                <i class="xray-caret">▾</i>
              </button>
              <ul v-show="xrayOpenMenu === 'gamma'" class="xray-dropdown-menu">
                <li
                  v-for="item in GAMMA_LEVELS"
                  :key="item.key"
                  :class="{ active: gammaKey === item.key }"
                  @click.stop="pickGamma(item.key)"
                >
                  {{ item.label }}
                </li>
              </ul>
            </div>
            <span class="xray-label">亮场</span>
            <div class="xray-dropdown" :class="{ open: xrayOpenMenu === 'white' }">
              <button type="button" class="xray-dropdown-trigger" @click.stop="toggleXrayMenu('white')">
                <span>{{ whiteLabel }}</span>
                <i class="xray-caret">▾</i>
              </button>
              <ul v-show="xrayOpenMenu === 'white'" class="xray-dropdown-menu">
                <li
                  v-for="item in WHITE_LEVELS"
                  :key="item.key"
                  :class="{ active: whiteKey === item.key }"
                  @click.stop="pickWhite(item.key)"
                >
                  {{ item.label }}
                </li>
              </ul>
            </div>
            <PreviewButton label="删除" title="不合格透视图删除" @click="onTransDelClick" />
            <PreviewButton
              label="渲染"
              title="伪彩渲染"
              :active="xrayRenderOn"
              @click="toggleXrayRender"
            />
            <button type="button" class="header-icon-btn header-icon-swap" title="切换视角" @click="onXrayViewSwap">
              <img src="/assets/img/a_leftright.png" alt="" />
            </button>
            <button type="button" class="body-capture-btn" :disabled="!xrayBoxPanelRef?.ready" title="全屏预览透视影像" @click="openImagePreview('xray')">预览</button>
          </div>
          <!-- 与车身框图相同：在色阶/伪彩结果上画框，裁切进实时视频区（不测距） -->
          <BodyPointCloudPanel
            ref="xrayBoxPanelRef"
            placeholder="透视影像"
            :image-url="xrayDisplayUrl || undefined"
            :source-temp-url="transparentImageUrl || undefined"
            view="body"
            :capture-mode="true"
            @crop="onXrayBoxCrop"
            @capture-error="bodyCaptureError = $event"
          />
        </div>

        <!-- 底部：流程图标 + 车辆动画 + 硬件状态 -->
        <div class="panel-card panel-bottom">
          <BottomWorkflowPanel
            :booking-active="bookingStore.bookingActive"
            :booking-pending="bookingStore.btnPrebookPending"
            :distance="radarDistance"
            :gate-online="gateOnline"
            :gate-open="gateDisplayOpen"
            :gate-pending="gateFeedbackPending || gateBusy"
            :gate-message="gateFeedbackMessage"
            :xray-phase="xrayMachinePhase"
            :xray-bits="plcXrayBits"
            :signal-lights="plcSignalLights"
            :kv200="xrayTelemetry.kv200"
            :ma200="xrayTelemetry.ma200"
            :temp200="xrayTelemetry.temp200"
            :kv160="xrayTelemetry.kv160"
            :ma160="xrayTelemetry.ma160"
            :temp160="xrayTelemetry.temp160"
            :talk-disabled="showBooking"
            @talk-click="showTalkDialog = true"
            @workflow-click="onWorkflowClick"
          />
        </div>
      </section>

      <!-- 右侧 -->
      <section class="panel-right">
        <!-- 实时视频 -->
        <div class="panel-card panel-video">
          <div class="panel-header">
            <img src="/assets/img/live_video.png" class="panel-icon" alt="" />
            <span class="panel-title">实时视频</span>
<button
              type="button"
              class="header-icon-btn"
              title="重新连接实时视频"
              @click="reconnectLiveVideo"
            >
              <span class="reconnect-label">↻</span>
            </button>
            <button
              type="button"
              class="header-icon-btn"
              :class="{ disabled: !liveCropPreviewUrl }"
              :title="liveCropPreviewUrl ? '追加到货物照' : '当前无裁切预览'"
              :disabled="!liveCropPreviewUrl"
              @click="onConfirmCropToGoods"
            >
              <img src="/assets/img/good_save.png" alt="" />
            </button>
            <button
              type="button"
              class="header-icon-btn"
              :class="{ disabled: !liveCropPreviewUrl }"
              :title="liveCropPreviewUrl ? '删除框图' : '当前无框图'"
              :disabled="!liveCropPreviewUrl"
              @click="onDeleteCropBoxes"
            >
              <img src="/assets/img/s_close.png" alt="" />
            </button>
          </div>
          <div class="video-area">
            <video
              ref="liveVideoRef"
              class="live-webrtc"
              :class="{ 'is-obscured': !!liveCropPreviewUrl }"
              muted
              autoplay
              playsinline
            />
            <div v-if="liveCropPreviewUrl" class="video-crop-backdrop" aria-hidden="true" />
            <img
              v-if="liveCropPreviewUrl"
              :src="liveCropPreviewUrl"
              class="video-crop-preview"
              alt="框图预览"
            />
            <div
              v-if="!liveCropPreviewUrl && liveVideoStatus !== 'playing'"
              class="video-status"
              :class="{ err: liveVideoStatus === 'error' || liveVideoStatus === 'idle' || !!liveVideoError }"
            >
              {{ videoHint }}
            </div>
          </div>
        </div>

        <!-- 图像采集 -->
        <div class="panel-card panel-capture">
          <div class="panel-header">
            <img src="/assets/img/image_capture.png" class="panel-icon" alt="" />
            <span class="panel-title">图像采集</span>
          </div>
          <div class="capture-grid">
            <button
              v-for="btn in captureButtons"
              :key="btn.key"
              type="button"
              class="capture-btn"
              :class="{
                'has-thumb': captureBtnHasThumb(btn.key),
                'license-split':
                  btn.key === 'license' && !!(licensePaths.license || licensePaths.licenseGc),
                'multi-thumbs-btn':
                  (btn.key === 'goods' || btn.key === 'evidence') &&
                  multiCaptureThumbs(btn.key).length > 0,
              }"
              :title="btn.label"
              @click="onCaptureClick(btn.key)"
            >
              <template v-if="btn.key === 'license' && (licensePaths.license || licensePaths.licenseGc)">
                <div class="license-split-inner">
                  <div class="license-half">
                    <img v-if="licensePaths.license" :src="licensePaths.license" alt="主行驶证" />
                    <span v-else class="license-half-empty">主</span>
                  </div>
                  <div class="license-half">
                    <img v-if="licensePaths.licenseGc" :src="licensePaths.licenseGc" alt="挂车证" />
                    <span v-else class="license-half-empty">挂</span>
                  </div>
                </div>
              </template>
              <div
                v-else-if="
                  (btn.key === 'goods' || btn.key === 'evidence') &&
                  multiCaptureThumbs(btn.key).length > 0
                "
                class="multi-thumbs"
                :class="multiCaptureThumbClass(btn.key)"
              >
                <img
                  v-for="(src, idx) in multiCaptureThumbs(btn.key)"
                  :key="`${btn.key}-${idx}-${src.slice(-12)}`"
                  :src="src"
                  :alt="`${btn.label}${idx + 1}`"
                />
              </div>
              <img
                v-else-if="captureThumbs[btn.key]"
                :src="captureThumbs[btn.key]"
                :alt="btn.label"
                class="capture-thumb"
              />
              <span v-else>{{ btn.label }}</span>
            </button>
          </div>
        </div>

        <!-- 绿通信息 -->
        <div class="panel-card panel-form">
          <div class="form-header">
            <img src="/assets/img/lv_info.png" class="panel-icon" alt="" />
            <span class="panel-title">绿通信息</span>
            <div class="passcode-scan-wrap">
              <button
                type="button"
                class="header-icon-btn"
                title="通行码"
                @click.stop="onPasscodeScan"
              >
                <img src="/assets/img/ze-scan.png" alt="" />
              </button>
            </div>
          </div>

          <div class="form-body">
            <div class="form-row">
              <label>车牌号码：</label>
              <span class="field-value" :style="plateColorStyle(form.plateColor)">{{ form.plate }}</span>
              <button class="icon-btn" title="号牌号码编辑" @click="onEditPlate">
                <img src="/assets/img/a_chxz.png" alt="" />
              </button>
              <label class="col-right">挂车号码：</label>
              <span class="field-value" :style="plateColorStyle(form.plateGcColor)">{{ form.plateGc }}</span>
              <button class="icon-btn" title="号牌号码编辑" @click="onEditPlateGC">
                <img src="/assets/img/a_chxz.png" alt="" />
              </button>
            </div>

            <div class="form-row">
              <label class="label-required"><span class="req-star">*</span>司机电话：</label>
              <input v-model="form.phone" class="field-input" placeholder="请输入11位手机号" />
              <span class="col-gap" />
              <label class="col-right label-required"><span class="req-star">*</span>货车类型：</label>
              <select v-model="form.truckType" class="field-input">
                <option value="">请选择</option>
                <option v-for="t in truckTypeOptions" :key="t.type_code" :value="t.type_code">
                  {{ t.type_name }}
                </option>
              </select>
            </div>

            <div class="form-row">
              <label class="label-required"><span class="req-star">*</span>货物名称：</label>
              <input v-model="form.goods" class="field-input" placeholder="请选择农产品类型" readonly />
              <button class="icon-btn" title="货物类型选择" @click="onSelectProduct">
                <img src="/assets/img/a_search.png" alt="" />
              </button>
              <label class="col-right label-required"><span class="req-star">*</span>货箱类型：</label>
              <select v-model="form.containerType" class="field-input">
                <option value="">请选择</option>
                <option v-for="c in containerTypeOptions" :key="c.type_code" :value="c.type_code">
                  {{ c.type_name }}
                </option>
              </select>
            </div>

            <div class="form-row">
              <label>满载率约(%)：</label>
              <input v-model="form.loadRate" class="field-input" placeholder="请输入满载率，区间0-100" />
              <span class="col-gap" />
              <label class="col-right">轮廓尺寸：</label>
              <input v-model="form.size" class="field-input" placeholder="请输入外轮廓长宽高" readonly />
              <button class="icon-btn" title="轮廓尺寸编辑" @click="onEditCarSize">
                <img src="/assets/img/a_search.png" alt="" />
              </button>
            </div>

            <div class="form-row">
              <label>出口称重(kg)<span v-if="weightRangeHint" class="weight-hint">{{ weightRangeHint }}</span>：</label>
              <div class="field-input-wrap">
                <input
                  v-model="form.weight"
                  class="field-input"
                  :class="{ 'field-input-err': weightInputError }"
                  placeholder="出口称重（kg）"
                  title="出口称重需为整数（kg）"
                />
                <span v-if="weightInputError" class="field-err-text">{{ weightInputError }}</span>
              </div>
              <span class="col-gap" />
              <label class="col-right">查验次数：</label>
              <button
                type="button"
                class="field-value field-link"
                :disabled="form.plate === '--'"
                title="查看该车查验历史"
                @click="onHistoryCountClick"
              >
                {{ form.historyCount }}
              </button>
            </div>
          </div>

          <div class="form-footer">
            <button class="btn-reset" @click="onReset">重置</button>
            <button
              class="btn-confirm"
              :disabled="aiSilentBusy"
              :title="aiSilentBusy ? aiSilentBusyHint : '确认提交'"
              @click="onConfirm"
            >
              {{ aiSilentBusy ? 'AI处理中…' : '确认' }}
            </button>
          </div>
        </div>
      </section>
    </div>

    <PasscodeScanDialog
      v-if="showPasscodeScan"
      @decoded="applyPasscode"
      @close="showPasscodeScan = false"
    />

    <!-- 预约弹窗 — 对齐 OrderDialog -->
    <TalkDialog v-if="showTalkDialog && !showBooking" @close="showTalkDialog = false" />
    <BookingDialog
      v-if="showBooking"
      @close="bookingStore.closeDialog()"
      @accept="onBookingAccept"
      @reject="onBookingReject"
    />

    <!-- 左下“拍照”：周界相机 A，只显示视频，不启用对讲。 -->
    <SafeCameraDialog
      v-if="showSafeCameraDialog"
      @close="showSafeCameraDialog = false"
    />

<!-- 农产品选择弹窗 -->
    <AgriculturalSelect
      ref="agriculturalSelectRef"
      @confirm="onAgriculturalConfirm"
    />

    <!-- 车牌编辑弹窗 -->
    <LicensePlateEdit
      ref="licensePlateRef"
      :current-plate="form.plate === '--' ? '' : form.plate"
      :current-color="form.plateColor"
      title="车牌修改"
      @confirm="onPlateConfirm"
    />
    <LicensePlateEdit
      ref="licensePlateGCRef"
      :current-plate="form.plateGc === '--' ? '' : form.plateGc"
      :current-color="form.plateGcColor"
      title="挂车车牌修改"
      @confirm="onPlateGCConfirm"
    />

    <!-- 货车轮廓尺寸修改 — 对齐 CarSizeDialog -->
    <CarSizeDialog
      v-if="showCarSize"
      :model-value="form.size"
      @confirm="onCarSizeConfirm"
      @close="showCarSize = false"
    />

    <!-- 图像采集弹窗 — 对齐 GetPic/Tail/Top/Goods/Evidence -->
    <CaptureCameraDialog
      v-if="captureDialog"
      :kind="captureDialog"
      :capture-blocked="isPreGateLaneBlocked"
      :initial-images="captureDialogInitial"
      @confirm="(imgs) => onCaptureConfirm(captureDialog!, imgs)"
      @close="captureDialog = null"
    />

    <EvidenceImagePicker v-if="evidencePickerItems" :items="evidencePickerItems" @confirm="onEvidenceImagesConfirm" @close="evidencePickerItems = null" />

    <!-- 行驶证 — 对齐 GetDrivingPicDialog -->
    <DrivingLicenseDialog
      v-if="showLicenseDialog"
      :license-src="licensePaths.license"
      :license-gc-src="licensePaths.licenseGc"
      :license-stitched-src="licensePaths.licenseStitched"
      :capture-blocked="isPreGateLaneBlocked"
      @confirm="onLicenseConfirm"
      @close="showLicenseDialog = false"
    />

    <!-- 设备连接状态 — 对齐 onSettingClicked DeviceStatusPopup -->
    <DeviceStatusPanel
      v-if="showDeviceStatus"
      :anchor="deviceAnchor"
      @close="showDeviceStatus = false"
      @status-change="onDevicesStatusChange"
    />

    <!-- 开关控制 / PLC设备状态控制 — 对齐 PLCControlDialog -->
    <PlcControlDialog
      v-if="showPlcControl"
      :anchor="plcAnchor"
      @close="showPlcControl = false"
    />

    <!-- AI智能体连接状态 — 对齐 WebServiceDialog -->
    <AiStatusDialog
      v-if="showAiStatus"
      :anchor="aiAnchor"
      @close="showAiStatus = false"
      @status-change="onAiStatusChange"
    />

    <!-- 用户管理 — 对齐 UsrMgrDialog -->
    <UserManager
      v-if="showUserMgr"
      @close="showUserMgr = false"
    />

    <QtMessageBox
      v-if="showUsrMgrDenied"
      title="通知"
      message="系统管理员用户才能进行用户管理操作 !"
      icon="warning"
      :buttons="['yes']"
      @yes="showUsrMgrDenied = false"
      @close="showUsrMgrDenied = false"
    />

    <!-- 历史记录查询 — 对齐 HistoryDialog -->
    <HistoryDialog
      v-if="showHistory"
      :initial-plate="historyPreset?.plate || ''"
      :initial-start-time="historyPreset?.startTime || ''"
      :initial-end-time="historyPreset?.endTime || ''"
      @close="onHistoryClose"
    />

    <!-- 急停确认 — 对齐 QMessageBox::question 系统提醒 / 确定执行急停操作？ -->
    <QtMessageBox
      v-if="showStopConfirmBox"
      title="系统提醒"
      message="确定执行急停操作？"
      icon="question"
      :buttons="['yes', 'no']"
      @yes="onStopConfirmYes"
      @no="onStopConfirmNo"
      @close="onStopConfirmNo"
    />

    <ImageGalleryDialog v-if="imagePreview" :items="imagePreview" full-screen @close="imagePreview = null" />
    <QtMessageBox v-if="imagePreviewError" title="影像预览" icon="warning" :buttons="['ok']" :message="imagePreviewError" @ok="imagePreviewError = ''" @close="imagePreviewError = ''" />
    <!-- 透视图删除 — 对齐 onPreviewTansDel：确认 / 确定要删除透视图 ？ -->
    <QtMessageBox
      v-if="showTransDelConfirm"
      title="确认"
      message="确定要删除透视图 ？"
      icon="question"
      :buttons="['yes', 'no']"
      @yes="onTransDelYes"
      @no="onTransDelNo"
      @close="onTransDelNo"
    />

    <!-- 急停复位 — 对齐 onPLCStopChanged：仅「是」按钮 -->
    <QtMessageBox
      v-if="showStopResetBox"
      title="系统提醒"
      message="设备急停！ 是否复位？"
      icon="question"
      :buttons="['yes']"
      @yes="onStopResetYes"
      @close="onStopResetClose"
    />

    <!-- 提交前查验记录预览 — 对齐 DetailDialog 查验记录页 -->
    <DetailDialog
      v-if="showSubmitPreview && submitPreview"
      mode="submit"
      :preview="submitPreview"
      @confirm="onSubmitConfirmYes"
      @close="onSubmitConfirmNo"
    />

    <!-- 重置确认 — 对齐 LvTongPro::onReset：QMessageBox 二次确认 -->
    <QtMessageBox
      v-if="showResetConfirmBox"
      title="重置"
      message="确定重置录入车辆信息吗？"
      icon="question"
      :buttons="['yes', 'no']"
      @yes="onResetConfirmYes"
      @no="onResetConfirmNo"
      @close="onResetConfirmNo"
    />

    <QtMessageBox
      v-if="stopErrorVisible"
      title="系统提醒"
      :message="stopErrorMessage"
      icon="warning"
      :buttons="['yes']"
      @yes="stopErrorVisible = false"
      @close="stopErrorVisible = false"
    />


    <!-- 主页实时视频：VisualSurveillance MJPEG；裁切叠层来自车身/透视框图（非 MJPEG 截帧） -->
  </div>
</template>

<style scoped lang="scss">

@use '@/styles/variables.scss' as *;
.projection-source { color: #9a650c; font-size: 13px; white-space: nowrap; max-width: 240px; overflow: hidden; text-overflow: ellipsis; }
.projection-error { color: #b83f32; font-size: 13px; white-space: nowrap; }


.dashboard {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: $min-app-width;
  background: #f0f0f0;
  overflow: hidden;
}

.dashboard-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
}

.panel-left {
  flex: 1168;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.panel-right {
  flex: 728;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.panel-card {
  background: #fff;
  border: 2px solid $border-color;
  border-radius: $card-radius;
  margin: 1px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-stretch {
  flex: 2;
  min-height: 0;
}

.panel-bottom {
  flex: 0 0 200px;
  max-height: 200px;
  min-height: 150px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* 去掉 panel-card 底边 1px margin，避免状态栏下露灰缝 */
  margin-bottom: 0;
}

.panel-video {
  flex: 6;
  min-height: 0;
}

.panel-capture {
  flex: 5;
  min-height: 0;
}

.panel-form {
  flex: 5;
  min-height: 0;
  margin-bottom: 0;
}

.panel-header,
.form-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px 8px 40px;
  flex-shrink: 0;
}

.panel-header-xray {
  flex-wrap: nowrap;
  gap: 6px;
  .panel-title { margin-right: 0; }
}

.panel-icon {
  width: 24px;
  height: 24px;
  object-fit: contain;
}

.panel-title {
  font-size: 14px;
  font-weight: bold;
  color: $text-dark;
}

.panel-header-body .panel-title {
  margin-right: 0;
}
.body-capture-btn {
  flex-shrink: 0;
  border: 1px solid #90b5a7;
  border-radius: 5px;
  padding: 3px 10px;
  background: transparent;
  color: #326c5b;
  font: inherit;
  cursor: pointer;
  &.active { background: #e1f1e9; border-color: #43866e; }
  &:disabled { cursor: default; opacity: .45; }
}

.panel-header .panel-title,
.form-header .panel-title {
  margin-right: auto;
}

/* 车身：中间弹性空白，把保存/切换/预览顶到右上角（对齐图1） */
.panel-header-body .header-spacer {
  flex: 1 1 auto;
  width: auto;
  min-width: 8px;
  margin-left: 0;
  margin-right: 0;
}

.header-spacer {
  flex: 0 0 40px;
  width: 40px;
}

.header-icon-btn {
  background: transparent;
  border: none;
  padding: 2px;
  display: flex;
  align-items: center;
  cursor: pointer;
  img {
    width: 24px;
    height: 24px;
  }
  .reconnect-label {
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: 700;
    color: #2c3e50;
    line-height: 1;
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}
.header-icon-swap img {
  width: 16px;
  height: 16px;
}

.xray-meta {
  font-size: 12px;
  color: $text-gray;
}
.xray-label {
  font-size: 12px;
  color: $text-gray;
}

/* 灰场 / 亮场：高中低下拉（对齐 color_demo，样式贴合现有 header） */
.xray-dropdown {
  position: relative;
  flex-shrink: 0;
}

.xray-dropdown-trigger {
  min-width: 52px;
  height: 26px;
  padding: 0 6px 0 8px;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  border: 1px solid #c5d5f8;
  border-radius: 3px;
  background: #fff;
  color: #222;
  cursor: pointer;
  font-size: 12px;
  box-sizing: border-box;
}

.xray-dropdown.open .xray-dropdown-trigger,
.xray-dropdown-trigger:hover {
  background: #dbeafe;
  border-color: #93b4f5;
}

.xray-caret {
  font-style: normal;
  font-size: 10px;
  color: #304daf;
  line-height: 1;
}

.xray-dropdown-menu {
  position: absolute;
  top: calc(100% + 2px);
  left: 0;
  z-index: 30;
  min-width: 100%;
  margin: 0;
  padding: 2px 0;
  list-style: none;
  background: #fff;
  border: 1px solid #c5d5f8;
  border-radius: 3px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

.xray-dropdown-menu li {
  padding: 4px 10px;
  cursor: pointer;
  font-size: 12px;
  color: #222;
  white-space: nowrap;
}

.xray-dropdown-menu li:hover {
  background: #eef4ff;
}

.xray-dropdown-menu li.active {
  background: #dbeafe;
  font-weight: 600;
}

.action-btn {
  /* 与 PreviewButton 一致（若别处仍引用） */
  border: 2px solid $btn-preview-bg;
  border-radius: 10px;
  background: $btn-preview-bg;
  color: $btn-preview-text;
  padding: 2px 12px;
  font-size: 13px;
  font-weight: bold;
  min-height: 28px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: $btn-preview-text;
    background: #c2d8ff;
  }
}

.video-area {
  flex: 1;
  min-height: 200px;
  background: #1a1a1a;
  border-bottom: 2px solid $border-color;
  border-radius: 0 0 12px 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.live-webrtc {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #1a1a1a;
  z-index: 1;

  &.is-obscured {
    visibility: hidden;
  }
}

.video-crop-backdrop {
  position: absolute;
  inset: 0;
  z-index: 2;
  background: #1a1a1a;
  pointer-events: none;
}

.video-crop-preview {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
  z-index: 3;
  pointer-events: none;
}

.video-status {
  position: relative;
  z-index: 3;
  font-size: 16px;
  color: #999;
  user-select: none;
  padding: 12px;
  text-align: center;

  &.err {
    color: #c0392b;
  }
}

/* Dashboard 实时视频 iframe — 略低于弹窗 iframe（10001），避免遮挡采集弹窗 */
.dashboard-video-iframe {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  border: 0;
  margin: 0;
  padding: 0;
  background: transparent;
  pointer-events: none;
  z-index: 9999;
}

.capture-grid {
  display: grid;
  grid-template-columns: repeat(3, 200px);
  gap: 9px;
  padding: 12px 9px;
  justify-content: center;
}

.capture-btn {
  width: 200px;
  height: 110px;
  border: 2px dashed #999;
  border-radius: 0;
  background: #fff;
  font-size: 14px;
  color: #999;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
  padding: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover { color: #666; border-color: #666; }

  &.has-thumb {
    border-style: solid;
    border-color: #ccc;
  }
}

.capture-thumb {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  background: #1a1a1a;
}

.capture-btn.multi-thumbs-btn {
  padding: 0;
}

/* 货物/证据：格内最多 6 张，无滚动；排布按张数 */
.multi-thumbs {
  display: grid;
  width: 100%;
  height: 100%;
  gap: 1px;
  background: #1a1a1a;
  overflow: hidden;
  box-sizing: border-box;

  img {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    object-fit: cover;
    display: block;
    background: #1a1a1a;
  }

  /* 1～3：单排 */
  &.n-1 {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr;
  }
  &.n-2 {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr;
  }
  &.n-3 {
    grid-template-columns: 1fr 1fr 1fr;
    grid-template-rows: 1fr;
  }
  /* 4：2+2 */
  &.n-4 {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
  }
  /* 5：第一行 2，第二行 3 */
  &.n-5 {
    grid-template-columns: repeat(6, 1fr);
    grid-template-rows: 1fr 1fr;

    img:nth-child(1) { grid-column: 1 / 4; }
    img:nth-child(2) { grid-column: 4 / 7; }
    img:nth-child(3) { grid-column: 1 / 3; }
    img:nth-child(4) { grid-column: 3 / 5; }
    img:nth-child(5) { grid-column: 5 / 7; }
  }
  /* 6（及更多只显示前 6）：3+3 */
  &.n-6 {
    grid-template-columns: 1fr 1fr 1fr;
    grid-template-rows: 1fr 1fr;
  }
}

.capture-btn.license-split {
  padding: 0;
}

.license-split-inner {
  display: flex;
  width: 100%;
  height: 100%;
  gap: 2px;
  background: #1a1a1a;
}

.license-half {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }
}

.license-half-empty {
  font-size: 12px;
  color: #888;
}

.form-header { padding-left: 20px; }

.passcode-scan-wrap {
  position: relative;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.form-body {
  flex: 1;
  overflow-y: auto;
  padding: 0 20px;
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.form-row {
  display: grid;
  grid-template-columns: 100px 200px 24px 100px 200px 24px;
  align-items: center;
  gap: 4px 8px;
  font-size: 13px;

  label { color: #444; text-align: right; white-space: nowrap; }
  .col-right { grid-column: 4; }
  .col-gap { grid-column: 3; }

  .label-required {
    color: #000;
    font-weight: 700;
  }

  .req-star {
    color: #e74c3c;
    font-weight: 700;
    margin-right: 2px;
  }
}

.field-input {
  width: 100%;
  height: 30px;
  border: none;
  border-bottom: 2px solid #e5e7eb;
  padding: 2px 8px;
  font-size: 14px;
  background: transparent;
  outline: none;
  &:focus { border-bottom-color: $accept-green; background: #f0fdf4; }
}

.field-input-wrap {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.field-input-err {
  border-bottom-color: #dc2626 !important;
  &:focus {
    border-bottom-color: #dc2626 !important;
    background: #fef2f2;
  }
}

.field-err-text {
  font-size: 12px;
  line-height: 1.3;
  color: #dc2626;
}

.weight-hint {
  margin-left: 2px;
  color: #64748b;
  font-weight: 500;
  font-size: 12px;
  white-space: nowrap;
}

.field-value {
  font-size: 14px;
  color: $text-gray;
  padding: 2px 8px;
}

.field-link {
  border: none;
  background: transparent;
  cursor: pointer;
  color: #1565c0;
  text-decoration: underline;
  text-underline-offset: 2px;
  font: inherit;
  text-align: left;
  &:disabled {
    cursor: default;
    color: $text-gray;
    text-decoration: none;
  }
  &:not(:disabled):hover {
    color: #0d47a1;
  }
}

.icon-btn {
  background: transparent;
  border: none;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  img { width: 20px; height: 20px; }
}

.form-footer {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr;
  gap: 8px;
  padding: 12px 20px 16px;
  flex-shrink: 0;
}

.btn-reset {
  grid-column: 2;
  justify-self: start;
  min-width: 100px;
  height: 32px;
  border: none;
  border-radius: 4px;
  background: $reject-red;
  color: #ddd;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
}

.btn-confirm {
  grid-column: 5;
  justify-self: end;
  min-width: 100px;
  height: 32px;
  border: none;
  border-radius: 4px;
  background: $accept-green;
  color: #ddd;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  &:hover:not(:disabled) { background: #047857; }
  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    background: #6b7280;
  }
}
</style>
