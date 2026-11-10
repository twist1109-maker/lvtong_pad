import { createApp, h, ref, onUnmounted } from 'vue'
import { useWhepPlayer } from '../../src/composables/useWhepPlayer'

createApp({
  setup() {
    const video = ref<HTMLVideoElement | null>(null)
    const player = useWhepPlayer()
    const site = ref(new URLSearchParams(location.search).get('site') === '1')
    const path = ref('cam2')
    const transport = ref(new URLSearchParams(location.search).get('transport') === 'auto' ? 'auto' : 'default')
    const stats = ref('')
    const timer = setInterval(()=>{void player.getStats().then(rows=>stats.value=JSON.stringify(rows,null,2))},1000)
    onUnmounted(()=>clearInterval(timer))
    return () => h('main', { style: 'font:16px sans-serif;padding:16px' }, [
      h('h2', 'H.265 → H.264 浏览器解码验证'),
      h('label', [h('input', {type:'checkbox',checked:site.value,onChange:(e:Event)=>site.value=(e.target as HTMLInputElement).checked}), '现场相机（只读视频）']),
      h('select', {value:path.value,onChange:(e:Event)=>path.value=(e.target as HTMLSelectElement).value}, Array.from({length:6},(_,i)=>h('option',{value:`cam${i+1}`},`cam${i+1}`))),
      h('select', {'aria-label':'视频传输方式',value:transport.value,onChange:(e:Event)=>transport.value=(e.target as HTMLSelectElement).value}, [h('option',{value:'default'},'默认（优先TCP）'),h('option',{value:'auto'},'对照（自动协商）')]),
      h('button', {onClick:()=>{if(video.value) void player.play({video:video.value,whepUrl:`/${site.value?'site-mtx':'mtx'}/${path.value}/whep`,...(transport.value==='auto'?{transport:'auto' as const}:{})}).catch(()=>{})}}, '播放'),
      h('button', {onClick:()=>void player.stop()}, '停止'),
      h('p', {id:'status'}, `${player.status.value} ${player.error.value}`),
      h('video', {ref:video,autoplay:true,muted:true,playsinline:true,controls:true,style:'width:min(100%,960px);background:#101820'}),
      h('pre', {id:'stats'}, stats.value),
    ])
  },
}).mount('#app')
