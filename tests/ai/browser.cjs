// 生产Dashboard及选择器隔离验收：所有业务/设备网络均拦截为本机样例。
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1117-835-0_26.1117.835.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'../..'),out=path.join(__dirname,'artifacts');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const {createServer}=await import(pathToFileURL(root+'/node_modules/vite/dist/node/index.js'));
 const vue=(await import(pathToFileURL(root+'/node_modules/@vitejs/plugin-vue/dist/index.mjs'))).default;
 const source=`import {createApp,h,ref,onMounted,nextTick} from 'vue';
import {createPinia} from 'pinia';import {createRouter,createMemoryHistory} from 'vue-router';
import Dashboard from '/src/views/Dashboard.vue';import ScreenScaler from '/src/layout/ScreenScaler.vue';import {useAuthStore} from '/src/stores/useAuthStore';
import {getInspectionClientId} from '/src/services/inspectionSessionContext';window.aiClientId=getInspectionClientId();
import '/src/styles/global.scss';import '/src/styles/fitted-screen.scss';
const pinia=createPinia(),dashboard=ref();
const app=createApp({setup(){onMounted(async()=>{await nextTick();window.aiTest=dashboard.value.$.setupState});return()=>h(ScreenScaler,{},()=>h(Dashboard,{ref:dashboard}))}});
app.use(pinia);app.use(createRouter({history:createMemoryHistory(),routes:[{path:'/',component:{render:()=>null}}]}));
useAuthStore().user={username:'ai-isolated',realName:'AI本地验证',role:1};app.mount('#app');`;
 const server=await createServer({configFile:false,root,plugins:[vue(),{name:'ai-fixture',configureServer(s){s.middlewares.use((req,res,next)=>{
  if(req.url==='/tests/ai/'){res.setHeader('Content-Type','text/html');res.end('<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><script type="module" src="/ai-fixture.js"></script></body></html>');return;}next();});},resolveId(id){if(id==='/ai-fixture.js')return '\0ai-fixture'},load(id){if(id==='\0ai-fixture')return source}}],resolve:{alias:{'@':root+'/src'}},define:{'import.meta.env.VITE_USE_MOCK':'"true"'},server:{host:'127.0.0.1',port:5198,strictPort:true}});
 await server.listen();const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const errors=[],calls=[],cases=[];
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',d=>d.accept());
  const products=Array.from({length:30},(_,n)=>({product_code:String(n),variety_name:n===29?'香蕉':n===25?'苹果':`品种${n}`,variety_name_pinyin:`P${n}`,product_type:n%2?'新鲜水果':'新鲜蔬菜'}));
  let goodsCalls=0,holdGoods=false,releaseGoods=null,cropFail=false,holdCrop=false,releaseCrop=null,truckCount=0,ocrPartial=false;
  const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jOj0AAAAASUVORK5CYII=';
  const main='data:image/png;base64,'+png,hang=main+'#hang',stitched=main+'#stitched';
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1'){await route.abort();return}
   if(!u.pathname.startsWith('/api/')&&!u.pathname.startsWith('/fixture/')&&!u.pathname.startsWith('/mtx/')){await route.continue();return}
   calls.push(u.pathname);
   if(u.pathname.startsWith('/fixture/'))return route.fulfill({contentType:'image/png',body:Buffer.from(png,'base64')});
   if(u.pathname.includes('ai-goods-xray'))throw new Error('禁止调用透视识别');
   if(u.pathname.endsWith('/ai-goods-real')){
    goodsCalls++;const n=goodsCalls;
    if(holdGoods)await new Promise(resolve=>{releaseGoods=resolve});
    return route.fulfill({json:{code:0,data:{goods:n%2?[{code:'29',name:'香蕉',score:.72},{code:'25',name:'苹果',score:.9}]:[{code:'29',name:'香蕉',score:.98}]}}});
   }
   if(u.pathname.endsWith('/ai-truck-real')){truckCount++;return route.fulfill({json:{code:0,data:{wheel_count:2,vehicle_type:'11',vehicle_container_type:'4.1'}}})}
   if(u.pathname.endsWith('/license/ai-crop')){
    if(holdCrop)await new Promise(resolve=>{releaseCrop=resolve});
    if(cropFail)return route.fulfill({status:502,json:{code:502,message:'fixture crop error'}});
    return route.fulfill({json:{code:0,data:{mainDataUrl:main,hangDataUrl:hang,imageDataUrl:stitched,mode:'stitch'}}});
   }
   if(u.pathname.endsWith('/ocr/driving-license')){
    const raw=route.request().postDataBuffer();assert(raw.includes(Buffer.from(png,'base64')),'OCR必须发送主车图片');
    assert(!raw.includes(Buffer.from('#stitched')),'OCR不能发送主挂拼接图');
    return route.fulfill({json:{code:0,data:ocrPartial?{plate_number:'鄂A12345'}:{plate_number:'鄂A12345',weight_min:13000,weight_max:16800}}});
   }
   if(u.pathname==='/api/dict/products'){
    const rec=u.searchParams.getAll('recommend_code'),kw=u.searchParams.get('keyword'),type=u.searchParams.get('product_type');
    const filtered=products.filter(p=>(!kw||p.variety_name.includes(kw))&&(!type||p.product_type===type));
    filtered.sort((a,b)=>(rec.includes(a.product_code)?rec.indexOf(a.product_code):100)-(rec.includes(b.product_code)?rec.indexOf(b.product_code):100));
    const start=(Number(u.searchParams.get('page')||1)-1)*20;
    return route.fulfill({json:{code:0,data:{items:filtered.slice(start,start+20),total:filtered.length}}});
   }
   if(u.pathname.endsWith('/truck-types'))return route.fulfill({json:{code:0,data:[{type_code:'11',type_name:'一型货车'}]}});
   if(u.pathname.endsWith('/container-types'))return route.fulfill({json:{code:0,data:[{type_code:'4.1',type_name:'厢式货车'}]}});
   if(u.pathname.endsWith('/ai-load-rate'))return route.fulfill({status:502,json:{code:502,message:'上游mask 500'}});
   if(u.pathname.includes('/inspection/plate/'))return route.fulfill({json:{code:0,data:{count:0}}});
   if(u.pathname.endsWith('/ai-status'))return route.fulfill({json:{code:0,data:{models:{axle:{online:true,state:'ready'},ocr:{online:false,state:'loading'}}}}});
   return route.fulfill({json:{code:0,data:[]}});
  });
  await page.goto('http://127.0.0.1:5198/tests/ai/');await page.waitForFunction(()=>!!window.aiTest);
  const run=fn=>page.evaluate(fn);
  await run(()=>{const v=window.aiTest;v.form.goods='人工已选';v.captureLists={goods:['/fixture/goods1.png','/fixture/goods2.png'],evidence:[]}});
  await page.waitForFunction(()=>window.aiTest.goodsRecommendations.length===2&&!window.aiTest.aiGoodsRealBusy);
  assert.equal(await run(()=>window.aiTest.form.goods),'人工已选');assert.equal(goodsCalls,2);
  assert.deepEqual(await run(()=>window.aiTest.goodsRecommendations.map(g=>[g.code,g.score])),[['29',.98],['25',.9]]);
  await run(()=>window.aiTest.onSelectProduct());await page.waitForSelector('.product-card');
  assert.match(await page.locator('.product-card').first().innerText(),/香蕉/);
  assert.equal(await page.locator('.product-card .ai-mark').first().innerText(),'AI提示');
  assert(!/%/.test(await page.locator('.cards-scroll').innerText()),'推荐卡片不显示分数');
  assert.equal(await page.locator('.product-card.selected').count(),0);
  await page.screenshot({path:path.join(out,'recommendations-pc.png')});
  await page.getByRole('button',{name:'下一页',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.stats')?.textContent.includes('2/2'));
  assert.equal(await page.locator('.product-card').count(),10);
  await page.getByRole('button',{name:'上一页',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.stats')?.textContent.includes('1/2'));
  await page.locator('.product-card').first().click();await page.getByRole('button',{name:'确认选择',exact:true}).click();
  assert.equal(await run(()=>window.aiTest.form.goods),'香蕉');cases.push('多图推荐去重排序、全局分页及确认才回填');
  await run(()=>{const v=window.aiTest;v.form.plate='--';v.licensePaths={license:'/fixture/main.png',licenseGc:'/fixture/hang.png',licenseStitched:''}});
  await page.waitForFunction(()=>window.aiTest.licenseAiStatus==='裁剪、OCR已完成');
  assert.equal(await run(()=>window.aiTest.form.plate),'鄂A12345');assert.equal(await run(()=>window.aiTest.form.weight),'');
  assert.match(await run(()=>window.aiTest.weightRangeHint),/13000-16800/);cases.push('双证裁剪、仅主车正副页OCR及称重提示');
  assert.equal(await run(()=>window.aiTest.hasAiMark('plate',window.aiTest.form.plate)),true);
  assert.equal(await run(()=>window.aiTest.hasAiMark('goods',window.aiTest.form.goodsProductCode)),true);
  assert.equal(await page.locator('.weight-hint .ai-mark').innerText(),'AI参考');
  await run(()=>{const v=window.aiTest;v.form.plateColor='0';v.form.phone='13800000000';v.form.weight='15000';v.bodyImageUrls={body:'/fixture/body.png',top:'',side:''}});
  await page.waitForFunction(()=>window.aiTest.hasAiMark('truckType',window.aiTest.form.truckType)&&window.aiTest.hasAiMark('containerType',window.aiTest.form.containerType));
  await page.setViewportSize({width:1920,height:1080});
  await page.waitForTimeout(100);
  await page.locator('.panel-form').screenshot({path:path.join(out,'ai-marks-form-pc.png')});
  for(const viewport of [{width:1280,height:800},{width:800,height:1280}]){
    await page.setViewportSize(viewport);await page.waitForTimeout(100);await page.locator('.panel-form').screenshot({path:path.join(out,`ai-marks-form-${viewport.width}.png`)});
  }
  await page.setViewportSize({width:1440,height:1000});
  await run(()=>{const v=window.aiTest;v.showLicenseDialog=true});await page.screenshot({path:path.join(out,'license-pc.png')});
  assert.equal(await page.locator('.group-title .ai-mark').count(),2);
  await run(()=>window.aiTest.showLicenseDialog=false);
  await run(()=>{const v=window.aiTest;v.form.truckType='';v.form.containerType='';v.onPlateConfirm(v.form.plate,v.form.plateColor)});
  assert.equal(await run(()=>window.aiTest.aiMarks.plate),'');
  assert.equal(await run(()=>window.aiTest.aiMarks.containerType),'');
  await run(()=>window.aiTest.form.truckType='11');
  assert.equal(await run(()=>window.aiTest.hasAiMark('truckType',window.aiTest.form.truckType)),false);
  cases.push('AI字段标记、称重参考与人工修改后去标，PC/横竖Pad截图');
  ocrPartial=true;
  await run(()=>{const v=window.aiTest;v.licensePaths={license:'/fixture/partial.png',licenseGc:'',licenseStitched:''}});
  await page.waitForFunction(()=>window.aiTest.licenseAiStatus.includes('未识别到称重参考范围'));
  assert.equal(await run(()=>window.aiTest.weightRangeHint),'');
  assert.equal(await run(()=>window.aiTest.aiMarks.weightRange),'');
  assert.equal(await page.locator('.weight-hint .ai-mark').count(),0);ocrPartial=false;
  cases.push('OCR部分字段缺失不标AI、不沿用上次范围并提示缺项');
  cropFail=true;
  await run(()=>window.aiTest.licensePaths={license:'/fixture/main-fail.png',licenseGc:'',licenseStitched:''});
  await page.waitForFunction(()=>window.aiTest.licenseAiStatus.includes('OCR已完成')&&!window.aiTest.aiLicenseCropBusy);
  assert.equal(await run(()=>window.aiTest.licensePaths.license),'/fixture/main-fail.png');cases.push('裁剪失败保留原图并继续OCR');
  cropFail=false;holdCrop=true;
  await run(()=>window.aiTest.licensePaths={license:'/fixture/old.png',licenseGc:'',licenseStitched:''});
  await page.waitForFunction(()=>window.aiTest.aiLicenseCropBusy);while(!releaseCrop)await new Promise(r=>setTimeout(r,20));
  await run(()=>{window.aiTest.licensePaths={license:'',licenseGc:'',licenseStitched:''};window.aiTest.form.plate='新车牌'});releaseCrop();holdCrop=false;
  await page.waitForTimeout(200);assert.equal(await run(()=>window.aiTest.form.plate),'新车牌');assert.equal(await run(()=>window.aiTest.licensePaths.license),'');cases.push('换图后丢弃迟到裁剪及OCR');
  await run(()=>{const v=window.aiTest;v.doReset();v.form.plate='鄂A12345';v.form.plateColor='0';v.bodyImageUrls={body:'/fixture/body.png',top:'',side:''}});
  await run(()=>window.aiTest.scheduleAiTruckReal());
  await page.waitForFunction(()=>window.aiTest.form.truckType==='11');
  await run(()=>window.aiTest.form.plateColor='1');await page.waitForFunction(()=>window.aiTest.form.truckType==='12');assert.equal(truckCount,2);cases.push('新车车轴车厢回填、换牌色复用轴数；人工车型不参与自动重算');
  await run(()=>window.aiTest.form.plateColor='');await page.waitForFunction(()=>window.aiTest.form.truckType==='');
  await run(()=>window.aiTest.form.plateColor='1');await page.waitForFunction(()=>window.aiTest.form.truckType==='12');
  await run(()=>{window.aiTest.form.containerType='4.1';window.aiTest.form.loadRate='66';window.aiTest.xrayImageUrls={'200':'/fixture/xray.png','160':'',mosaic:''}});
  await page.waitForTimeout(1400);assert.equal(calls.filter(p=>p.endsWith('/ai-load-rate')).length,0);assert.equal(await run(()=>window.aiTest.form.loadRate),'66');cases.push('人工装载率优先，200图到达不重复请求或覆盖人工值');
  holdGoods=true;await run(()=>window.aiTest.captureLists={goods:['/fixture/late.png'],evidence:[]});
  while(!releaseGoods)await new Promise(r=>setTimeout(r,20));await run(()=>window.aiTest.doReset());releaseGoods();holdGoods=false;
  await page.waitForTimeout(200);assert.equal(await run(()=>window.aiTest.goodsRecommendations.length),0);cases.push('重置丢弃迟到推荐');
  for(const viewport of [{width:1280,height:800},{width:800,height:1280}]){
   await page.setViewportSize(viewport);await run(()=>{const v=window.aiTest;v.captureLists={goods:['/fixture/viewport.png'],evidence:[]}});
   await page.waitForFunction(()=>window.aiTest.goodsRecommendations.length>0&&!window.aiTest.aiGoodsRealBusy);
   await run(()=>window.aiTest.onSelectProduct());
   await page.waitForSelector('.product-card');await page.screenshot({path:path.join(out,`recommendations-${viewport.width}.png`)});
   await page.locator('.dialog .btn-x').click();
  }
  // 真实同步ACK把本机裁剪图换成共享URL，不能触发重复裁剪或抹掉来源。
  await run(()=>{
    const v=window.aiTest;
    v.sharedSession.receive({sessionId:'ai-mark-session',revision:1,phase:'detecting',booking:{},workflow:{},draft:JSON.parse(JSON.stringify(v.readSharedDraft())),activeClientId:window.aiClientId});
  });
  await page.waitForTimeout(20);
  const cropsBeforeAck=calls.filter(p=>p.endsWith('/license/ai-crop')).length;
  await run(()=>{
    const v=window.aiTest,draft=JSON.parse(JSON.stringify(v.readSharedDraft()));
    draft.licensePaths={license:'/fixture/shared-main.png',licenseGc:'/fixture/shared-hang.png',licenseStitched:'/fixture/shared-stitched.png'};
    draft.aiMarks={...draft.aiMarks,license:draft.licensePaths.license,licenseGc:draft.licensePaths.licenseGc,weightRange:'(13000-16800)'};
    draft.aiContext.license={source:draft.licensePaths.license,hangSource:draft.licensePaths.licenseGc,baseRevision:1};
    v.sharedSession.receive({sessionId:'ai-mark-session',revision:2,phase:'detecting',booking:{},workflow:{},draft,activeClientId:window.aiClientId});
  });
  await page.waitForTimeout(1000);
  assert.equal(calls.filter(p=>p.endsWith('/license/ai-crop')).length,cropsBeforeAck);
  assert.equal(await run(()=>window.aiTest.hasAiMark('license',window.aiTest.licensePaths.license)),true);
  assert.equal(await run(()=>window.aiTest.hasAiMark('weightRange',window.aiTest.weightRangeHint)),true);
  await run(()=>window.aiTest.sharedSession.dispose());
  cases.push('同步确认采用共享图片地址后保留AI标记且不重复裁剪');
  assert.deepEqual(errors,[]);assert(!calls.some(p=>/\/booking\/(accept|open|stop|reset)|\/device\/control|ai-goods-xray/.test(p)));
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({cases,errors,goodsCalls,truckCount,deviceActions:0},null,2));console.log(JSON.stringify({cases,errors,deviceActions:0},null,2));
 }finally{await browser.close();await server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
