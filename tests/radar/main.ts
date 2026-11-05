import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import RadarImagePanel from '../../src/modules/booking/components/RadarImagePanel.vue'
import { calcCarHeadLength } from '../../src/modules/booking/utils/bookingMath'

createApp(defineComponent({setup() {
  const result = ref('正在解码 PNG 并测量显示区域…')
  const position = ref(.25)
  let loaded = 0
  async function verify() {
    if (++loaded < 3) return
    await nextTick()
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const stages = Array.from(document.querySelectorAll<HTMLElement>('.radar-stage'))
      const checks: string[] = []
      for (const stage of stages) {
        const image = stage.querySelector('img')!
        const panel = stage.parentElement!.getBoundingClientRect()
        const box = stage.getBoundingClientRect()
        const expectedScale = Math.min(panel.width / image.naturalWidth, panel.height / image.naturalHeight)
        if (Math.abs(box.width - image.naturalWidth * expectedScale) > 1 ||
            Math.abs(box.height - image.naturalHeight * expectedScale) > 1) throw Error('图片有效区域不匹配')
        const line = stage.querySelector<HTMLElement>('.radar-line')!.getBoundingClientRect()
        if (Math.abs(line.left + 1 - (box.left + box.width * .25)) > 1) throw Error('红线错位')
        checks.push(`${image.naturalWidth}×${image.naturalHeight}：图片区域和红线对齐`)
      }
      const length = calcCarHeadLength(150 / 401, 401, '', '', 1.5, {vehicleSx:0, metersPerPixel:.01})
      if (Math.abs(length - 1.5) > .001) throw Error('物理长度换算错误')
      result.value = `PASS：${checks.join('；')}；150px = ${length.toFixed(2)}米`
      document.title = 'PASS 雷达图显示与测距'
    }))
  }
  return () => h('main', {style:'font-family:sans-serif;padding:20px;background:#eef5ef'}, [
    h('h2','LAZ 解码预览与拖线验证（本地测试）'), h('p',{id:'result'},result.value),
    h('p',{id:'position'},`第一张图红线位置：${position.value.toFixed(3)}`),
    ...['cloud-wide.png','cloud-square.png','cloud-tall.png'].map((name,index) => h('section',{style:'display:inline-flex;flex-direction:column;margin:10px;border:1px solid #888'},[
      h('p',name),h(RadarImagePanel, {imageUrl:`/tests/radar/${name}`,linePosition:index===0?position.value:.25,
        'onUpdate:linePosition':(value:number)=>{if(index===0)position.value=value}, onLoaded:verify}),
    ])),
  ])
}})).mount('#app')
