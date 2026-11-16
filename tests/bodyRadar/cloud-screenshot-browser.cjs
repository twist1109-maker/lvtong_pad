// 自启本机隔离页面，使用生产3D组件；不连接数据库、摄像头或现场设备。
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/13006/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '../..'), out = path.join(__dirname, 'artifacts/cloud-screenshot');
fs.mkdirSync(out, { recursive: true });
function truckGeometry() {
  const points = [];
  for (let x = -6; x <= 6; x += .08) for (let y = -1.2; y <= 1.2; y += .08) {
    const roof = x < -3.5 ? .8 : 1.8;
    points.push(x,y,roof,x,y,-1.8);
    if (Math.abs(y) > 1.1) for (let z = -1.8; z <= roof; z += .12) points.push(x,y,z);
  }
  const bytes = Buffer.alloc(points.length * 4); points.forEach((v, i) => bytes.writeFloatLE(v,i*4));
  return { encoding:'float32-le-base64', positions:bytes.toString('base64'), pointCount:points.length/3, totalPointCount:points.length/3,
    originMeters:[0,0,0], boundsMeters:{min:[-6,-1.2,-1.8],max:[6,1.2,1.8]}, dimensionsMeters:{length:12,width:2.4,height:3.6} };
}
(async () => {
  const { createServer } = await import(pathToFileURL(root + '/node_modules/vite/dist/node/index.js'));
  const vue = (await import(pathToFileURL(root + '/node_modules/@vitejs/plugin-vue/dist/index.mjs'))).default;
  const source = `import {createApp,h,ref,nextTick} from 'vue';
import Panel from '/src/components/BodyCloud3DPanel.vue';
const panel=ref(), geometry=ref(null);
window.setGeometry=async value=>{geometry.value=value;await nextTick()};
window.capture=()=>panel.value.getPreviewImage();
window.resizePanel=async(w,h)=>{const el=document.querySelector('#cloud-host');el.style.width=w+'px';el.style.height=h+'px';await nextTick()};
createApp({setup:()=>()=>h('div',{id:'cloud-host',style:'width:1100px;height:360px;display:flex'},[h(Panel,{ref:panel,geometry:geometry.value})])}).mount('#app');`;
  const server = await createServer({root,configFile:false,resolve:{alias:{'@':root+'/src'}},plugins:[vue(),{
    name:'cloud-export-fixture',resolveId(id){if(id==='/__cloud.ts')return id},load(id){if(id==='/__cloud.ts')return source},
    configureServer(s){s.middlewares.use((req,res,next)=>{if(req.url!=='/cloud-export')return next();res.setHeader('Content-Type','text/html');res.end('<html><body><div id="app"></div><script type="module" src="/__cloud.ts"></script></body></html>')})}
  }],server:{host:'127.0.0.1',port:5199,strictPort:true}});
  await server.listen();
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--enable-unsafe-swiftshader']});
  const checks=[],errors=[];
  try {
    for(const [name,w,h,dpr] of [['pc',1100,360,1],['pad',650,400,2]]) {
      const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:dpr});
      page.on('pageerror',e=>errors.push(e.message));
      await page.goto('http://127.0.0.1:5199/cloud-export');
      await page.evaluate(({w,h,geometry})=>{window.resizePanel(w,h);return window.setGeometry(geometry)},{w,h,geometry:truckGeometry()});
      await page.locator('.body-cloud-3d[data-ready=true]').waitFor();
      await page.waitForTimeout(100);
      await page.getByRole('button',{name:'复位视角',exact:true}).click();
      // 只记录导出时的文本/画布绘制，产品无测试入口。
      await page.evaluate(()=>{
        const text=CanvasRenderingContext2D.prototype.fillText,draw=CanvasRenderingContext2D.prototype.drawImage;
        window.exportText=[];window.rawFrame='';
        CanvasRenderingContext2D.prototype.fillText=function(...args){window.exportText.push(args);return text.apply(this,args)};
        CanvasRenderingContext2D.prototype.drawImage=function(...args){const result=draw.apply(this,args);if(args[0] instanceof HTMLCanvasElement&&args[0].getAttribute('aria-label')?.startsWith('车辆三维点云'))window.rawFrame=this.canvas.toDataURL();return result};
      });
      async function checkCapture(label) {
        const state=await page.evaluate(async()=>{
          const {cloudPixelBounds}=await import('/src/modules/bodyRadar/cloudScreenshot.ts');
          window.exportText=[];const result=window.capture();
          async function inspect(src){const img=new Image();img.src=src;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);return {w:c.width,h:c.height,bounds:cloudPixelBounds(ctx.getImageData(0,0,c.width,c.height).data,c.width,c.height)}}
          const raw=await inspect(window.rawFrame),cropped=await inspect(result);
          const upper=document.createElement('canvas');upper.width=cropped.w;upper.height=cropped.h;const ctx=upper.getContext('2d');const img=new Image();img.src=result;await img.decode();ctx.drawImage(img,0,0);
          // 尺寸面板在点云下方，按文本最上行位置截开后核对车辆像素范围。
          const firstY=window.exportText[0][2];const vehicle=cloudPixelBounds(ctx.getImageData(0,0,cropped.w,Math.floor(firstY-12*devicePixelRatio)).data,cropped.w,Math.floor(firstY-12*devicePixelRatio));
          return {result,raw,cropped,vehicle,text:window.exportText};
        });
        fs.writeFileSync(path.join(out,`${name}-${label}.png`),Buffer.from(state.result.split(',')[1],'base64'));
        assert.equal(state.text.length,3);
        assert.deepEqual(state.text.map(row=>row[0]),['长 12.000 m','宽 2.400 m','高 3.600 m']);
        assert.ok(state.text.every(row=>row[1]===state.text[0][1]));
        assert.ok(state.text[0][2]<state.text[1][2]&&state.text[1][2]<state.text[2][2]);
        assert.ok(state.text[0][1]>state.cropped.w*.5,'legend belongs at the right');
        assert.ok(state.text[0][2]>state.cropped.h*.6,'legend belongs at the bottom');
        assert.equal(state.vehicle.width,state.raw.bounds.width);assert.equal(state.vehicle.height,state.raw.bounds.height);
        assert.ok(state.vehicle.x<=14*dpr+1,'left margin must remain small');
        assert.ok(state.cropped.w-state.vehicle.x-state.vehicle.width<=14*dpr+1,'right margin must remain small');
        checks.push({name,label,source:[state.raw.w,state.raw.h],exported:[state.cropped.w,state.cropped.h],vehicle:state.vehicle,text:state.text});
      }
      await checkCapture('default');
      const canvas=page.locator('.cloud-canvas canvas'), box=await canvas.boundingBox();
      await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.6,box.y+box.height*.55,{steps:8});await page.mouse.up();
      await checkCapture('rotated');
      await page.mouse.wheel(0,600);await page.waitForTimeout(100);await checkCapture('zoomed-out');
      await page.getByRole('button',{name:'包围盒',exact:true}).click();await checkCapture('without-box');
      await page.close();
    }
    assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({checks,errors},null,2));
    console.log(JSON.stringify({checks,errors}));
  } finally {await browser.close();await server.close()}
})().catch(e=>{console.error(e);process.exit(1)});
