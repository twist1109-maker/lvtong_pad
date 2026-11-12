<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { decodeCloudGeometry, type CloudGeometryPayload } from '@/modules/bodyRadar/cloudGeometry'
import FrameCropSelection from '@/components/FrameCropSelection.vue'

const props = defineProps<{ geometry?: CloudGeometryPayload | null; loading?: boolean; error?: string; captureMode?: boolean }>()
const emit = defineEmits<{ screenshot: [image: string]; captureError: [message: string]; cancelCapture: [] }>()
const captureImage = ref('')
const host = ref<HTMLDivElement | null>(null)
const renderError = ref('')
const ready = ref(false)
const rangeOpen = ref(false)
const boundsVisible = ref(true)
const ranges = ref([[0, 100], [0, 100], [0, 100]])
const labels = ref<{ text: string; x: number; y: number; color: string }[]>([])
const axisNames = ['长', '宽', '高']
const axisColors = ['#d66d42', '#148c79', '#407ed0']
const dimensions = computed(() => props.geometry ? props.geometry.boundsMeters.max.map((v, i) => v - props.geometry!.boundsMeters.min[i]) : [0, 0, 0])
const measured = computed(() => dimensions.value.map((v, i) => v * (ranges.value[i][1] - ranges.value[i][0]) / 100))
let renderer: THREE.WebGLRenderer | undefined
let scene: THREE.Scene
let camera: THREE.OrthographicCamera
let controls: OrbitControls
let cloudGroup: THREE.Group | undefined
let boxGroup: THREE.Group | undefined
let observer: ResizeObserver | undefined
let min = [0, 0, 0], max = [0, 0, 0]
let height = 1, width = 1, halfHeight = 3
let contextLost = false
let labelAnchors: { p: THREE.Vector3; axis: number }[] = []

function disposeGroup(group?: THREE.Group) {
  group?.traverse(object => {
    if (object instanceof THREE.Points || object instanceof THREE.LineSegments || object instanceof THREE.Line) {
      object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach(m => m.dispose())
    }
  })
  if (group) scene.remove(group)
}
function updateLabels() {
  labels.value = !boundsVisible.value ? [] : labelAnchors.map(({ p, axis }) => {
    const v = p.clone().project(camera)
    return { text: `${axisNames[axis]} ${measured.value[axis].toFixed(3)} m`, x: (v.x + 1) * 50, y: (1 - v.y) * 50, color: axisColors[axis] }
  }).filter(label => label.x >= 0 && label.x <= 100 && label.y >= 0 && label.y <= 100)
}
function render() {
  if (!renderer || contextLost) return
  renderer.render(scene, camera)
  updateLabels()
}
function fitToBounds() {
  camera.zoom = 1
  camera.updateMatrixWorld()
  let x = 0, y = 0
  for (const a of [min[0], max[0]]) for (const b of [min[1], max[1]]) for (const c of [min[2], max[2]]) {
    const v = new THREE.Vector3(a, b, c).applyMatrix4(camera.matrixWorldInverse)
    x = Math.max(x, Math.abs(v.x)); y = Math.max(y, Math.abs(v.y))
  }
  halfHeight = Math.max(y, x / (width / height), .01) * 1.35
}
function resize() {
  if (!renderer || !host.value) return
  if (captureImage.value && (width !== host.value.clientWidth || height !== host.value.clientHeight)) emit('cancelCapture')
  width = Math.max(1, host.value.clientWidth)
  height = Math.max(1, host.value.clientHeight)
  renderer.setSize(width, height, false)
  // 画布尺寸只负责更新视口宽高，不能重新计算模型尺度。否则外层页面缩放、
  // Pad 横竖屏切换或面板像素尺寸变化都会把 camera.zoom 重置为 1，造成点云
  // 看起来随像素值二次缩放，并丢失用户当前的滚轮/双指缩放状态。
  camera.left = -halfHeight * width / height
  camera.right = halfHeight * width / height
  camera.top = halfHeight
  camera.bottom = -halfHeight
  camera.updateProjectionMatrix()
  render()
}
function resetView() {
  if (!renderer || !ready.value) return
  const span = Math.max(...dimensions.value, .01)
  controls.target.set(0, 0, 0)
  camera.up.set(0, 0, 1)
  camera.position.set(.5, -1, .5).multiplyScalar(span * 3)
  camera.lookAt(0, 0, 0)
  fitToBounds()
  controls.update()
  resize()
}
function line(points: number[][], color: string) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p as [number, number, number])))
  return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: .9 }))
}
function updateBox() {
  if (!renderer || !ready.value) return
  disposeGroup(boxGroup)
  boxGroup = new THREE.Group()
  const low = min.map((v, i) => v + dimensions.value[i] * ranges.value[i][0] / 100)
  const high = min.map((v, i) => v + dimensions.value[i] * ranges.value[i][1] / 100)
  const box = new THREE.Box3(new THREE.Vector3(...low as [number, number, number]), new THREE.Vector3(...high as [number, number, number]))
  const helper = new THREE.Box3Helper(box, 0x87b8ab)
  boxGroup.add(helper)
  labelAnchors = []
  for (let axis = 0; axis < 3; axis++) {
    const start = [...low], end = [...low]
    end[axis] = high[axis]
    boxGroup.add(line([start, end], axisColors[axis]))
    labelAnchors.push({ p: new THREE.Vector3(...start.map((v, i) => (v + end[i]) / 2) as [number, number, number]), axis })
  }
  boxGroup.visible = boundsVisible.value
  scene.add(boxGroup)
  render()
}
function resetMeasure() { ranges.value = [[0, 100], [0, 100], [0, 100]] }
function setRange(axis: number, end: number, event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  const range = ranges.value[axis]
  range[end] = end === 0 ? Math.min(value, range[1] - .1) : Math.max(value, range[0] + .1)
}
function rebuild() {
  if (!renderer) return
  const wasReady = ready.value
  ready.value = false
  disposeGroup(cloudGroup); disposeGroup(boxGroup)
  cloudGroup = undefined; boxGroup = undefined
  labels.value = []
  renderError.value = ''
  if (!props.geometry) { render(); return }
  try {
    const decoded = decodeCloudGeometry(props.geometry)
    min = decoded.min; max = decoded.max
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(decoded.positions, 3))
    const colors = new Float32Array(decoded.positions.length)
    const color = new THREE.Color()
    for (let i = 0; i < decoded.positions.length; i += 3) {
      const t = (decoded.positions[i + 2] - min[2]) / Math.max(max[2] - min[2], .0001)
      color.setHSL(.60 - t * .10, .65, .36 + t * .10).convertSRGBToLinear()
      colors.set([color.r, color.g, color.b], i)
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.computeBoundingSphere()
    cloudGroup = new THREE.Group()
    cloudGroup.add(new THREE.Points(geometry, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true })))
    scene.add(cloudGroup)
    if (!wasReady) resetMeasure()
    ready.value = true
    updateBox()
    if (!wasReady) resetView()
  } catch (error) {
    renderError.value = error instanceof Error ? error.message : '三维点云加载失败'
    render()
  }
}
function onContextLost(event: Event) {
  event.preventDefault(); contextLost = true; ready.value = false
  renderError.value = '三维显示已中断，请刷新页面重试'
  emit('cancelCapture')
}
function getPreviewImage() {
  if (!renderer || !ready.value || contextLost) throw new Error('三维画面尚未加载，无法预览')
  // Render and copy synchronously: the default WebGL buffer is cleared after compositing.
  render()
  const canvas = document.createElement('canvas')
  canvas.width = renderer.domElement.width; canvas.height = renderer.domElement.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(renderer.domElement, 0, 0)
  const ratio = canvas.width / width
  ctx.font = `${14 * ratio}px sans-serif`
  ctx.fillStyle = '#fff'; ctx.fillRect(8 * ratio, 6 * ratio, Math.min(width - 16, 390) * ratio, 28 * ratio)
  ctx.fillStyle = '#345a4e'
  ctx.fillText(axisNames.map((name, i) => `${name} ${measured.value[i].toFixed(3)}m`).join('   '), 14 * ratio, 25 * ratio)
  if (boundsVisible.value) for (const label of labels.value) {
    ctx.fillStyle = label.color
    ctx.fillText(label.text, label.x / 100 * canvas.width, label.y / 100 * canvas.height)
  }
  return canvas.toDataURL('image/png')
}
function startCapture() {
  if (!renderer || !ready.value || contextLost) { emit('cancelCapture'); return }
  try {
    captureImage.value = getPreviewImage()
    controls.enabled = false
  } catch { emit('captureError', '三维截图失败，请刷新视图后重试') }
}
onMounted(() => {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.domElement.setAttribute('aria-label', '车辆三维点云，可拖动旋转和缩放')
    renderer.domElement.addEventListener('webglcontextlost', onContextLost)
    host.value!.appendChild(renderer.domElement)
    scene = new THREE.Scene(); scene.background = new THREE.Color('#f7fbfa')
    camera = new THREE.OrthographicCamera(-3, 3, 3, -3, .001, 100000)
    controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = false
    controls.minZoom = .2; controls.maxZoom = 20
    controls.addEventListener('change', render)
    observer = new ResizeObserver(resize); observer.observe(host.value!)
    resize(); rebuild()
  } catch {
    renderError.value = '无法启用3D显示，请开启浏览器硬件加速后刷新页面'
  }
})
watch(() => props.geometry, rebuild)
watch(ranges, updateBox, { deep: true })
watch(boundsVisible, () => { if (boxGroup) boxGroup.visible = boundsVisible.value; render() })
watch(() => props.captureMode, active => {
  if (active) startCapture()
  else { captureImage.value = ''; if (controls) controls.enabled = true }
})
watch(() => props.geometry, () => { captureImage.value = ''; emit('cancelCapture') })
defineExpose({ ready, getPreviewImage })
onBeforeUnmount(() => {
  observer?.disconnect()
  controls?.removeEventListener('change', render); controls?.dispose()
  if (renderer) {
    disposeGroup(cloudGroup); disposeGroup(boxGroup)
    renderer.domElement.removeEventListener('webglcontextlost', onContextLost)
    renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove()
  }
})
</script>

<template>
  <div class="body-cloud-3d" :data-ready="ready">
    <div ref="host" class="cloud-canvas" />
    <div v-if="ready" class="cloud-dimensions" aria-label="三维包围盒尺寸">
      <span v-for="(name, i) in axisNames" :key="name" :style="{ color: axisColors[i] }">{{ name }} <strong>{{ measured[i].toFixed(3) }}</strong> m</span>
    </div>
    <div v-for="label in labels" :key="label.text" class="dimension-label" :style="{ left: `${label.x}%`, top: `${label.y}%`, color: label.color }">{{ label.text }}</div>
    <div v-if="!ready || renderError" class="cloud-status" role="status">{{ renderError || (loading ? '正在加载三维点云…' : error || '暂无三维点云，请点击刷新') }}</div>
    <div v-if="ready" class="cloud-tools">
      <button type="button" @click="resetView">复位视角</button>
      <button type="button" :aria-pressed="boundsVisible" @click="boundsVisible = !boundsVisible">包围盒</button>
      <button type="button" :aria-expanded="rangeOpen" @click="rangeOpen = !rangeOpen">调整测量范围</button>
      <span class="cloud-help">拖动旋转 · 滚轮缩放 · 双指缩放/平移</span>
    </div>
    <div v-if="ready && rangeOpen" class="cloud-ranges">
      <div class="range-heading">测量包围盒 <button type="button" @click="resetMeasure">恢复全车</button></div>
      <div v-for="(name, axis) in axisNames" :key="name" class="range-row">
        <span :style="{ color: axisColors[axis] }">{{ name }}</span>
        <input v-for="end in [0, 1]" :key="end" type="range" min="0" max="100" step="0.1" :value="ranges[axis][end]" :aria-label="`${name}${end === 0 ? '起点' : '终点'}`" @input="setRange(axis, end, $event)" />
      </div>
      <small>数值按当前点云范围测量</small>
    </div>
    <FrameCropSelection v-if="captureMode && captureImage" :image="captureImage" @crop="emit('screenshot', $event)" @cancel="emit('cancelCapture')" @error="emit('captureError', $event)" />
  </div>
</template>

<style scoped lang="scss">
.body-cloud-3d { position: relative; flex: 1; width: 100%; min-height: 0; overflow: hidden; border-radius: 0 0 12px 12px; background: #f7fbfa; }
.cloud-canvas { position: absolute; inset: 0; touch-action: none; }
.cloud-canvas :deep(canvas) { display: block; width: 100%; height: 100%; }
.cloud-dimensions { position: absolute; top: 10px; left: 12px; display: flex; gap: 20px; padding: 7px 12px; border-radius: 6px; background: rgba(255,255,255,.9); font-size: 14px; pointer-events: none; }
.cloud-dimensions strong { font-size: 19px; font-variant-numeric: tabular-nums; }
.dimension-label { position: absolute; transform: translate(-50%, -50%); padding: 2px 6px; border-radius: 3px; background: rgba(255,255,255,.85); font-size: 13px; white-space: nowrap; pointer-events: none; }
.cloud-status { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 20px; color: #687b76; text-align: center; background: #f7fbfa; }
.cloud-tools { position: absolute; bottom: 8px; left: 10px; right: 10px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cloud-tools button, .range-heading button { border: 1px solid #bdd9cf; border-radius: 4px; padding: 4px 8px; color: #326c5b; background: rgba(255,255,255,.92); cursor: pointer; font: inherit; font-size: 13px; }
.cloud-tools button[aria-pressed=true] { background: #e1f1e9; }
.cloud-help { color: #78958a; font-size: 12px; }
.cloud-ranges { position: absolute; right: 12px; bottom: 42px; width: 260px; box-sizing: border-box; padding: 10px 12px; border: 1px solid #c4dcd4; border-radius: 6px; background: rgba(255,255,255,.96); box-shadow: 0 3px 12px #0001; }
.range-heading { display: flex; justify-content: space-between; align-items: center; color: #345a4e; font-size: 14px; }
.range-row { display: flex; align-items: center; gap: 6px; margin: 7px 0; font-size: 14px; }
.range-row input { width: 90px; min-width: 0; accent-color: #5fbb9e; }
.cloud-ranges small { color: #73857e; font-size: 12px; }
button:focus-visible, input:focus-visible { outline: 2px solid #1677ff; outline-offset: 2px; }
</style>
