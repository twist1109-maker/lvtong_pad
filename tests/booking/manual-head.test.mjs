import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { createPinia, setActivePinia } from 'pinia'
import { effectScope, nextTick } from 'vue'

const server = await createServer({ configFile: false, server: { middlewareMode: true },
  resolve: { alias: { '@': fileURLToPath(new URL('../../src', import.meta.url)) } } })
const { useBookingDialog } = await server.ssrLoadModule('/src/modules/booking/composables/useBookingDialog.ts')
const { useBookingStore } = await server.ssrLoadModule('/src/modules/booking/store/useBookingStore.ts')
test.after(() => server.close())
const deferred = () => {
  let resolve
  const promise = new Promise(r => { resolve = r })
  return { promise, resolve }
}
const image = { imageUrl: '/radar.png', originalImageWidth: 1000, originalImageHeight: 300,
  imageEnvelope: '0', vehicleHeaderEnvelope: '100', contentOriginX: 100, vehicleHeight: 3,
  vehicleSx: 1, metersPerPixel: .01 }

function fixture(overrides = {}) {
  setActivePinia(createPinia())
  const calls = []
  const api = { fetchRadarImage: async () => null, openDialog: async () => ({}),
    stopVideoSession: async () => {}, acceptBooking: async payload => calls.push(['accept', payload]),
    rejectBooking: async () => calls.push(['reject']), ...overrides }
  const scope = effectScope()
  const dialog = scope.run(() => useBookingDialog(api))
  return { dialog, calls, scope }
}

test('初始化及雷达、相机清理均未完成时可受理，默认无图长度1.8米', async () => {
  const open = deferred(), radar = deferred(), stop = deferred()
  const { dialog: d, calls, scope } = fixture({ openDialog: () => open.promise,
    fetchRadarImage: () => radar.promise, stopVideoSession: () => stop.promise })
  const initializing = d.initDialog()
  assert.equal(d.carHeadLength.value, 1.8)
  assert.equal(d.linePosition.value, .3)
  d.setLinePosition(.5)
  assert.equal(d.carHeadLength.value, 3)
  d.requestConfirm('accept')
  const result = await d.confirmYes()
  assert.equal(result.kind, 'accept')
  assert.equal(calls[0][1].carHeadLength, 3)
  assert.equal(calls[0][1].radarHeadImageUrl, undefined)
  radar.resolve(image); open.resolve({ state: { is_detection: false, check_step: 0 } })
  await initializing
  await Promise.resolve()
  assert.equal(d.carHeadLength.value, 3)
  assert.equal(d.radarImageUrl.value, null)
  stop.resolve(); scope.stop()
})

test('雷达仍在等待时可立即驳回', async () => {
  const pending = deferred()
  const { dialog: d, calls, scope } = fixture({ fetchRadarImage: () => pending.promise })
  await d.initDialog()
  d.requestConfirm('reject')
  assert.equal((await d.confirmYes()).kind, 'reject')
  assert.deepEqual(calls, [['reject']])
  pending.resolve(null); scope.stop()
})

test('无图尺从左向右增大，不随显示尺寸变化；加载失败保留人工长度', async () => {
  const { dialog: d, scope } = fixture()
  await d.initDialog({ fetchRadar: false })
  for (const [position, length] of [[.3, 1.8], [.6, 3.6], [1, 6], [0, .1]]) {
    d.setLinePosition(position)
    assert.equal(d.carHeadLength.value, length)
  }
  d.setLinePosition(.6)
  d.onRadarImageError()
  assert.equal(d.carHeadLength.value, 3.6)
  assert.equal(d.linePosition.value, .6)
  scope.stop()
})

test('图片迟到后保留人工长度，随后按真实米像素比例拖动', async () => {
  const pending = deferred()
  const { dialog: d, scope } = fixture({ fetchRadarImage: () => pending.promise })
  await d.initDialog()
  d.setLinePosition(.5)
  pending.resolve(image)
  await Promise.resolve(); await Promise.resolve()
  d.onRadarImageLoaded()
  assert.equal(d.manualScale.value, false)
  assert.equal(d.carHeadLength.value, 3)
  assert.equal(d.linePosition.value, .4) // 1米车头起点+3米人工长度，整图10米
  d.setLinePosition(.5)
  assert.equal(d.carHeadLength.value, 4)
  scope.stop()
})

test('正常有图仍沿用真实标定和原默认长度，坏图回到参考尺', async () => {
  const { dialog: d, scope } = fixture({ fetchRadarImage: async () => image })
  await d.initDialog()
  d.onRadarImageLoaded()
  assert.equal(d.manualScale.value, false)
  assert.equal(d.carHeadLength.value, 1.5)
  d.onRadarImageError()
  assert.equal(d.manualScale.value, true)
  assert.equal(d.buildAcceptPayload().radarHeadImageUrl, undefined)
  scope.stop()
})

test('连续确认不会重复提交，长度在请求前固定', async () => {
  const pending = deferred()
  const { dialog: d, scope } = fixture({ acceptBooking: () => pending.promise })
  await d.initDialog({ fetchRadar: false })
  d.requestConfirm('accept')
  const first = d.confirmYes()
  d.setLinePosition(.8)
  d.requestConfirm('accept')
  assert.equal(await d.confirmYes(), null)
  pending.resolve()
  assert.equal((await first).payload.carHeadLength, 1.8)
  scope.stop()
})

test('刷新返回相同图片URL时无需再次load事件，保留人工长度及真实标定', async () => {
  const { dialog: d, scope } = fixture({ fetchRadarImage: async () => image })
  await d.initDialog()
  d.onRadarImageLoaded()
  d.setLinePosition(.4)
  await d.refreshRadarImage()
  assert.equal(d.manualScale.value, false)
  assert.equal(d.carHeadLength.value, 3)
  assert.equal(d.linePosition.value, .4)
  scope.stop()
})

test('裁切雷达图以图片内车头起点计算，不再次减包络的全局起点', async () => {
  const cropped = { ...image, originalImageWidth: 800, originalImageHeight: 500,
    imageEnvelope: '4,0,8,5', vehicleSx: 5.24, vehicleSourceSx: 9.24,
    imageOriginMeters: 4, contentOriginX: 524, vehicleHeaderEnvelope: '524,0' }
  const { dialog: d, scope } = fixture({ fetchRadarImage: async () => cropped })
  await d.initDialog(); d.onRadarImageLoaded()
  assert.ok(Math.abs(d.carHeadLength.value - 1.5) < 1e-8)
  for (const length of [.03, .5, 1, 2]) {
    d.setLinePosition((5.24 + length) / 8)
    assert.ok(Math.abs(d.carHeadLength.value - length) < 1e-8)
  }
  scope.stop()
})

test('没有SX时统一使用后端内容起点，默认红线、拖动与保留人工长度同一原点', async () => {
  const cropped = { ...image, vehicleSx: null, contentOriginX: 100,
    imageEnvelope: '4,0,10,3', vehicleHeaderEnvelope: '100,0' }
  const { dialog: d, scope } = fixture({ fetchRadarImage: async () => cropped })
  await d.initDialog(); d.onRadarImageLoaded()
  assert.equal(d.carHeadLength.value, 1.5)
  d.setLinePosition(.4)
  assert.equal(d.carHeadLength.value, 3)
  await d.refreshRadarImage()
  assert.equal(d.carHeadLength.value, 3)
  assert.equal(d.linePosition.value, .4)
  scope.stop()
})

test('启动等待标定和图片加载后才显示分割线，仍可主动使用参考尺', async () => {
  const pending = deferred()
  const { dialog: d, scope } = fixture({ fetchRadarImage: () => pending.promise })
  await d.initDialog()
  assert.equal(d.radarPending.value, true)
  d.useManualRuler()
  assert.equal(d.radarPending.value, false)
  d.setLinePosition(.5)
  pending.resolve(image)
  await nextTick(); await nextTick()
  assert.equal(d.radarPending.value, true)
  d.onRadarImageLoaded()
  assert.equal(d.radarPending.value, false)
  assert.equal(d.carHeadLength.value, 3)
  assert.equal(d.linePosition.value, .4)
  scope.stop()
})

test('恢复草稿已保存图像坐标时不再用默认分割线覆盖，保留人工长度', async () => {
  const { dialog: first, scope: scope1 } = fixture({ fetchRadarImage: async () => image })
  const store = useBookingStore()
  await first.initDialog(); first.onRadarImageLoaded()
  first.setLinePosition(.43)
  await nextTick()
  const saved = JSON.parse(JSON.stringify(store.sharedDialogDraft))
  scope1.stop()
  store.sharedDialogDraft = saved
  const scope2 = effectScope()
  const second = scope2.run(() => useBookingDialog({ openDialog: () => { throw Error('cannot reopen') } }))
  await second.initDialog()
  assert.equal(second.radarPending.value, true)
  second.onRadarImageLoaded()
  assert.equal(second.linePosition.value, .43)
  assert.equal(second.carHeadLength.value, 3.3)
  await nextTick()
  assert.equal(store.sharedDialogDraft.linePosition, .43)
  assert.equal(store.sharedDialogDraft.radarImageReady, true)
  scope2.stop()
})

test('旧版自动分割线草稿的图片加载不再跳到0.5', async () => {
  const { scope: firstScope } = fixture()
  const store = useBookingStore()
  store.sharedDialogDraft = { radarImageUrl: '/restored.png', originalImageWidth: 1000,
    linePosition: .25, carHeadLength: 1.5, metersPerPixel: .01, vehicleSx: 1,
    lineAdjusted: false }
  firstScope.stop()
  const scope = effectScope()
  const dialog = scope.run(() => useBookingDialog({ openDialog: () => { throw Error('cannot reopen') } }))
  await dialog.initDialog()
  dialog.onRadarImageLoaded()
  assert.equal(dialog.linePosition.value, .25)
  assert.equal(dialog.carHeadLength.value, 1.5)
  scope.stop()
})
