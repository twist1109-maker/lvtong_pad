// 人工优先及AI非阻塞回归：真实生产组件，AI/设备网络全隔离；断言修正后的业务行为。
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1117-835-0_26.1117.835.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'../..'),out=path.join(__dirname,'artifacts/sync-regression');fs.mkdirSync(out,{recursive:true});
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
useAuthStore().user={username:'ai-sync-audit',realName:'AI同步审计',role:1};app.mount('#app');`;
 const server=await createServer({configFile:false,root,plugins:[vue(),{name:'ai-sync-audit',configureServer(s){s.middlewares.use((req,res,next)=>{
  if(req.url==='/tests/ai/'){res.setHeader('Content-Type','text/html');res.end('<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><script type="module" src="/audit-fixture.js"></script></body></html>');return;}next();});},resolveId(id){if(id==='/audit-fixture.js')return '\0audit-fixture'},load(id){if(id==='\0audit-fixture')return source}}],resolve:{alias:{'@':root+'/src'}},define:{'import.meta.env.VITE_USE_MOCK':'"true"'},server:{host:'127.0.0.1',port:5196,strictPort:true}});
 await server.listen();const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const results=[],clients=[],errors=[],forbidden=[];
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jOj0AAAAASUVORK5CYII=',dataUrl='data:image/png;base64,'+png;
 async function client(flags={}){
  const context=await browser.newContext({viewport:{width:1920,height:1080}}),page=await context.newPage();
  const c={context,page,flags,calls:{truck:0,crop:0,ocr:0,goods:0,submit:0},release:{},syncReleases:[],revision:0};clients.push(c);
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  async function hold(kind){if(c.flags[kind])await new Promise(resolve=>{c.release[kind]=()=>{delete c.release[kind];resolve()}})}
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.hostname!=='127.0.0.1')return route.abort();
   if(u.pathname.startsWith('/socket.io'))return route.abort();
   if(!u.pathname.startsWith('/api/')&&!u.pathname.startsWith('/fixture/')&&!u.pathname.startsWith('/mtx/'))return route.continue();
   if(u.pathname.endsWith('/inspection/submit')&&c.flags.submit){c.calls.submit++;return route.fulfill({json:{code:0,data:{id:1}}})}
   if(u.pathname.endsWith('/booking/reset')&&c.flags.submit)return route.fulfill({json:{code:0,data:{}}});
   if(/\/booking\/(accept|open|stop|reset)|\/device\/control|ai-goods-xray|\/inspection\/submit/.test(u.pathname)){forbidden.push(u.pathname);return route.abort()}
   if(u.pathname.startsWith('/fixture/'))return route.fulfill({contentType:'image/png',body:Buffer.from(png,'base64')});
   if(u.pathname.endsWith('/ai-truck-real')){c.calls.truck++;await hold('truck');return route.fulfill({json:{code:0,data:c.flags.changedTruck&&c.calls.truck>1?{wheel_count:3,vehicle_type:'13',vehicle_container_type:'4.3'}:{wheel_count:2,vehicle_type:'11',vehicle_container_type:'4.1'}}})}
   if(u.pathname.endsWith('/license/ai-crop')){c.calls.crop++;await hold('crop');return route.fulfill({json:{code:0,data:{mainDataUrl:dataUrl,imageDataUrl:dataUrl,mode:'single'}}})}
   if(u.pathname.endsWith('/ocr/driving-license')){c.calls.ocr++;await hold('ocr');return route.fulfill({json:{code:0,data:{plate_number:c.flags.changedOcr&&c.calls.ocr>1?'鄂B54321':'鄂A12345',weight_min:13000,weight_max:16800}}})}
   if(u.pathname.endsWith('/ai-goods-real')){c.calls.goods++;return route.fulfill({json:{code:0,data:{goods:[{code:'29',name:'香蕉',score:.98}]}}})}
   if(u.pathname.endsWith('/truck-types'))return route.fulfill({json:{code:0,data:[{type_code:'11',type_name:'一型货车'},{type_code:'12',type_name:'二型货车'},{type_code:'16',type_name:'六型货车'}]}});
   if(u.pathname.endsWith('/container-types'))return route.fulfill({json:{code:0,data:[{type_code:'4.1',type_name:'厢式货车'},{type_code:'4.3',type_name:'其他货车'}]}});
   if(u.pathname.includes('/inspection/plate/')){await hold('history');return route.fulfill({json:{code:0,data:c.flags.historyResult?{count:2,vehicle_type:'16',vehicle_container_type:'4.3'}:{count:0}}})}
   // 并发顺序由本测试直接送入生产receive方法控制，待发送草稿不提前ACK。
   if(u.pathname==='/api/inspection-session/current'){await new Promise(resolve=>c.syncReleases.push(resolve));return route.abort().catch(()=>{})}
   return route.fulfill({json:{code:0,data:[]}});
  });
  await page.goto('http://127.0.0.1:5196/tests/ai/');await page.waitForFunction(()=>!!window.aiTest);
  return c;
 }
 async function read(c){return c.page.evaluate(()=>JSON.parse(JSON.stringify(window.aiTest.readSharedDraft())))}
 async function snapshot(c,mutate=()=>{},owner='other',incoming){
  const draft=incoming||await read(c);mutate(draft);const revision=++c.revision;
  await c.page.evaluate(({draft,revision,owner})=>window.aiTest.sharedSession.receive({sessionId:'audit-session',revision,phase:'detecting',booking:{},workflow:{},draft,activeClientId:owner==='self'?window.aiClientId:'another-or-closed-client'}),{draft,revision,owner});
  await c.page.waitForFunction(r=>window.aiTest.sharedSession.snapshot?.revision===r,revision);await c.page.waitForTimeout(30);
 }
 async function waitHeld(c,kind){while(!c.release[kind])await c.page.waitForTimeout(20)}
 async function close(c){await c.page.evaluate(()=>window.aiTest.sharedSession.dispose());Object.values(c.release).forEach(fn=>fn());c.syncReleases.forEach(fn=>fn());await c.context.close()}
 function result(id,title,evidence){results.push({id,title,evidence});console.log(id+' '+title)}
 try{
  {
   const c=await client();await c.page.evaluate(()=>window.aiTest.syncReady=false);
   await snapshot(c,d=>{d.form.plate='鄂A12345';d.form.plateColor='0';d.panelImages.body={'1':'/fixture/restore-body.png'};d.licensePaths={license:'/fixture/restore-license.png',licenseGc:'',licenseStitched:''}});
   await c.page.waitForFunction(()=>window.aiTest.licenseAiStatus==='裁剪、OCR已完成');assert.equal(c.calls.truck,1);assert.equal(c.calls.crop,1);assert.equal(c.calls.ocr,1);
   result('F01','恢复原图后当前终端可补做车型和证照识别',{calls:c.calls});await close(c);
  }
  {
   const c=await client({crop:true});await c.page.evaluate(()=>window.aiTest.licensePaths={license:'/fixture/main.png',licenseGc:'',licenseStitched:''});await waitHeld(c,'crop');
   await snapshot(c,d=>d.form.phone='13800000000');c.release.crop();
   await c.page.waitForFunction(()=>window.aiTest.licenseAiStatus==='裁剪、OCR已完成');const state=await c.page.evaluate(()=>({license:window.aiTest.licensePaths.license,status:window.aiTest.licenseAiStatus,busy:window.aiTest.aiLicenseCropBusy}));
   assert.equal(c.calls.ocr,1);assert.equal(state.license,dataUrl);assert.equal(state.busy,false);
   result('F02','另一端只改电话不打断裁剪，OCR正常完成',{calls:c.calls,...state});await close(c);
  }
  {
   const c=await client({ocr:true});await c.page.evaluate(()=>window.aiTest.licensePaths={license:'/fixture/main.png',licenseGc:'',licenseStitched:''});await waitHeld(c,'ocr');
   await snapshot(c,d=>d.form.phone='13800000000');c.release.ocr();await c.page.waitForFunction(()=>window.aiTest.licenseAiStatus==='裁剪、OCR已完成');
   const state=await c.page.evaluate(()=>({plate:window.aiTest.form.plate,range:window.aiTest.weightRangeHint,status:window.aiTest.licenseAiStatus,busy:window.aiTest.aiLicenseCropBusy}));
   assert.equal(state.range,'(13000-16800)');assert.equal(state.plate,'鄂A12345');assert.equal(state.busy,false);
   result('F03','另一端只改电话，OCR结果正常补空',{calls:c.calls,...state});await close(c);
  }
  {
   const c=await client({truck:true});await c.page.evaluate(()=>{const v=window.aiTest;v.form.plate='鄂A12345';v.form.plateColor='0';v.bodyImageUrls={body:'/fixture/body.png',top:'',side:''}});await waitHeld(c,'truck');
   await snapshot(c,d=>{d.form.truckType='16';d.form.containerType='4.3';d.manualFields={truckType:true,containerType:true}});c.release.truck();
   await c.page.waitForFunction(()=>!window.aiTest.aiTruckRealBusy);
   const state=await c.page.evaluate(()=>({truck:window.aiTest.form.truckType,container:window.aiTest.form.containerType,marks:JSON.parse(JSON.stringify(window.aiTest.aiMarks))}));
   assert.equal(state.truck,'16');assert.equal(state.container,'4.3');assert.equal(state.marks.truckType,'');assert.equal(state.marks.containerType,'');
   result('F04','AI请求期间另一端手工选择车型/车厢，迟到AI不覆盖人工值',{manual:{truck:'16',container:'4.3'},after:state,calls:c.calls});await close(c);
  }
  {
   const c=await client();await c.page.evaluate(()=>{const v=window.aiTest;v.form.plate='鄂A12345';v.form.plateColor='0';v.bodyImageUrls={body:'/fixture/body.png',top:'',side:''}});
   await c.page.waitForFunction(()=>window.aiTest.form.truckType==='11'&&!window.aiTest.aiTruckRealBusy);
   await c.page.evaluate(()=>{window.aiTest.form.truckType='16';window.aiTest.aiMarks.truckType=''});
   await snapshot(c,d=>d.form.phone='13800000000','self');
   const state=await c.page.evaluate(()=>({truck:window.aiTest.form.truckType,mark:window.aiTest.aiMarks.truckType}));assert.equal(state.truck,'16');assert.equal(state.mark,'');assert.equal(c.calls.truck,1);
   result('F05','人工车型在普通同步回写后保留，AI标记不复活',{manual:'16',after:state,calls:c.calls});await close(c);
  }
  {
   const a=await client();await a.page.evaluate(()=>{const v=window.aiTest;v.form.plate='鄂A12345';v.form.plateColor='0';v.bodyImageUrls={body:'/fixture/body.png',top:'',side:''}});
   await a.page.waitForFunction(()=>window.aiTest.form.truckType==='11'&&!window.aiTest.aiTruckRealBusy);const draft=await read(a);
   const b=await client();await snapshot(b,()=>{},'other',draft);await b.page.evaluate(()=>window.aiTest.form.plateColor='1');await a.page.evaluate(()=>window.aiTest.form.plateColor='1');await a.page.waitForTimeout(60);
   const aType=await a.page.evaluate(()=>window.aiTest.form.truckType),bType=await b.page.evaluate(()=>window.aiTest.form.truckType);
   assert.equal(aType,'12');assert.equal(bType,'12');assert.equal(b.calls.truck,0);
   result('F06','共享轴数后两端改牌色均按二轴规则重算',{recognizedTerminal:aType,otherTerminal:bType,otherCalls:b.calls});await close(a);await close(b);
  }
  {
   const a=await client(),b=await client();
   for(const c of [a,b])await snapshot(c,d=>{d.captureLists.goods=['/fixture/same-photo-raw.png']});
   for(const c of [a,b])await c.page.waitForFunction(()=>window.aiTest.goodsRecommendations.length===1&&!window.aiTest.aiGoodsRealBusy);
   for(const c of [a,b])await snapshot(c,d=>{d.captureLists.goods=['/fixture/same-photo-shared.png']});
   for(const c of [a,b])await c.page.waitForFunction(()=>window.aiTest.goodsRecommendations.length===1&&!window.aiTest.aiGoodsRealBusy);
   assert.equal(a.calls.goods,2);assert.equal(b.calls.goods,2);
   result('F07','两端可独立补做货物推荐；上游内容去重由后端专项验证',{terminalA:a.calls.goods,terminalB:b.calls.goods,total:4});await close(a);await close(b);
  }
  {
   const a=await client({crop:true,submit:true});await a.page.evaluate(()=>{const v=window.aiTest;v.form.plate='鄂A12345';v.form.plateColor='0';v.form.phone='13800000000';v.form.weight='15000';v.form.truckType='16';v.form.containerType='4.3';v.licensePaths={license:'/fixture/main.png',licenseGc:'',licenseStitched:''}});await waitHeld(a,'crop');
   assert.equal(await a.page.evaluate(()=>window.aiTest.aiSilentBusy),true);
   await a.page.evaluate(()=>window.aiTest.onSubmitConfirmYes());assert.equal(a.calls.submit,1);
   result('F08','裁剪仍在等待响应时人工提交成功，不等待AI且旧响应失效',{calls:a.calls});await close(a);
  }
  {
   const c=await client({crop:true,truck:true});await c.page.evaluate(()=>{const v=window.aiTest;v.form.plate='鄂A12345';v.form.plateColor='0';v.bodyImageUrls={body:'/fixture/body.png',top:'',side:''};v.licensePaths={license:'/fixture/main.png',licenseGc:'',licenseStitched:''}});await waitHeld(c,'truck');await waitHeld(c,'crop');
   await c.page.evaluate(()=>window.aiTest.doReset());c.release.truck();c.release.crop();await c.page.waitForTimeout(200);
   const state=await c.page.evaluate(()=>({truck:window.aiTest.form.truckType,container:window.aiTest.form.containerType,license:window.aiTest.licensePaths.license,range:window.aiTest.weightRangeHint}));
   assert.equal(state.truck,'');assert.equal(state.container,'');assert.equal(state.license,'');assert.equal(state.range,'');assert.equal(c.calls.ocr,0);
   result('C01','重置后迟到的车型/裁剪结果均丢弃，没有回填新车',state);await close(c);
  }
  {
   const c=await client();await c.page.evaluate(()=>window.aiTest.licensePaths={license:'/fixture/old-main.png',licenseGc:'',licenseStitched:''});
   await c.page.waitForFunction(()=>window.aiTest.licenseAiStatus==='裁剪、OCR已完成');
   await snapshot(c,d=>{d.licensePaths={license:'/fixture/new-main.png',licenseGc:'',licenseStitched:''}});
   await c.page.waitForTimeout(100);
   const state=await c.page.evaluate(()=>({license:window.aiTest.licensePaths.license,range:window.aiTest.weightRangeHint,rangeMarked:window.aiTest.hasAiMark('weightRange',window.aiTest.weightRangeHint),plateMarked:window.aiTest.hasAiMark('plate',window.aiTest.form.plate)}));
   assert.equal(state.license,'/fixture/new-main.png');assert.equal(state.range,'');assert.equal(state.rangeMarked,false);assert.equal(state.plateMarked,false);assert.equal(c.calls.crop,1);
   result('F09','另一端换证照，立即隐藏旧OCR范围和AI来源，不冒用旧结果',{after:state,calls:c.calls});await close(c);
  }
  {
   const c=await client({crop:true});await c.page.evaluate(()=>window.aiTest.licensePaths={license:'/fixture/main.png',licenseGc:'',licenseStitched:''});await waitHeld(c,'crop');
   await snapshot(c,d=>d.form.phone='13800000000','self');c.flags.crop=false;c.release.crop();
   await c.page.waitForFunction(()=>window.aiTest.licenseAiStatus==='裁剪、OCR已完成');
   assert.equal(c.calls.crop,1);assert.equal(c.calls.ocr,1);
   result('F10','裁剪进行中本机普通同步ACK不重启请求',{calls:c.calls});await close(c);
  }
  {
   const c=await client();await snapshot(c,d=>{d.licensePaths={license:'/fixture/cropped.png',licenseGc:'',licenseStitched:''};d.aiMarks.license=d.licensePaths.license;d.aiContext.license={source:d.licensePaths.license,hangSource:'',baseRevision:0}});
   await c.page.waitForFunction(()=>window.aiTest.weightRangeHint==='(13000-16800)');
   assert.equal(c.calls.crop,0);assert.equal(c.calls.ocr,1);
   result('C02','恢复到已裁剪但OCR未完成的检测，只补OCR不重裁剪',{calls:c.calls});await close(c);
  }
  {
   const c=await client({changedTruck:true});await c.page.evaluate(()=>{const v=window.aiTest;v.form.plate='鄂A12345';v.form.plateColor='0';v.bodyImageUrls={body:'/fixture/first-body.png',top:'',side:''}});
   await c.page.waitForFunction(()=>window.aiTest.form.truckType==='11'&&!window.aiTest.aiTruckRealBusy);
   await c.page.evaluate(()=>window.aiTest.bodyImageUrls.body='/fixture/second-body.png');
   await c.page.waitForFunction(()=>!window.aiTest.aiTruckRealBusy&&window.aiTest.aiContext.truck?.source==='/fixture/second-body.png');
   const state=await c.page.evaluate(()=>({truck:window.aiTest.form.truckType,container:window.aiTest.form.containerType}));
   assert.equal(state.truck,'13');assert.equal(state.container,'4.3');
   result('C03','换车身图后可更新未经人工修改的旧AI车型/车厢',state);await close(c);
  }
  {
   const c=await client({history:true,historyResult:true});await c.page.evaluate(()=>window.aiTest.onPlateConfirm('鄂A12345','0'));await waitHeld(c,'history');
   await c.page.evaluate(()=>{const v=window.aiTest;v.form.truckType='';v.form.containerType='';v.manualField('truckType');v.manualField('containerType')});
   c.release.history();await c.page.waitForFunction(()=>window.aiTest.form.historyCount==='2');
   const state=await c.page.evaluate(()=>({truck:window.aiTest.form.truckType,container:window.aiTest.form.containerType}));assert.equal(state.truck,'');assert.equal(state.container,'');
   result('C04','主动清空车型/车厢后，迟到历史回填不覆盖人工操作',state);await close(c);
  }
  {
   const c=await client();await c.page.evaluate(()=>window.aiTest.licensePaths={license:'/fixture/main.png',licenseGc:'',licenseStitched:''});
   await c.page.waitForFunction(()=>window.aiTest.licenseAiStatus==='裁剪、OCR已完成');
   await c.page.evaluate(()=>window.aiTest.retryLicenseAi());await c.page.waitForFunction(()=>window.aiTest.licenseAiStatus==='裁剪、OCR已完成'&&!window.aiTest.aiLicenseCropBusy);
   const marked=await c.page.evaluate(()=>window.aiTest.hasAiMark('plate',window.aiTest.form.plate));assert.equal(marked,true);assert.equal(c.calls.ocr,2);
   result('C05','OCR重试成功后，未人工修改的车牌仍保留AI来源',{marked,calls:c.calls});await close(c);
  }
  {
   const c=await client({changedOcr:true});await c.page.evaluate(()=>window.aiTest.licensePaths={license:'/fixture/main.png',licenseGc:'',licenseStitched:''});
   await c.page.waitForFunction(()=>window.aiTest.licenseAiStatus==='裁剪、OCR已完成');
   await c.page.evaluate(()=>window.aiTest.licensePaths={license:'/fixture/new-main.png',licenseGc:'',licenseStitched:''});
   await c.page.waitForFunction(()=>window.aiTest.licenseAiStatus==='裁剪、OCR已完成'&&!window.aiTest.aiLicenseCropBusy);
   const state=await c.page.evaluate(()=>({plate:window.aiTest.form.plate,marked:window.aiTest.hasAiMark('plate',window.aiTest.form.plate)}));assert.equal(state.plate,'鄂B54321');assert.equal(state.marked,true);
   await c.page.evaluate(()=>{const v=window.aiTest;v.onPlateConfirm('鄂C67890','0');v.retryLicenseAi()});
   await c.page.waitForFunction(()=>window.aiTest.licenseAiStatus==='裁剪、OCR已完成'&&!window.aiTest.aiLicenseCropBusy);
   assert.equal(await c.page.evaluate(()=>window.aiTest.form.plate),'鄂C67890');assert.equal(await c.page.evaluate(()=>window.aiTest.hasAiMark('plate',window.aiTest.form.plate)),false);
   result('C06','换证照可更新旧AI车牌，人工确认后再重试仍保留人工车牌',state);await close(c);
  }
  assert.deepEqual(errors,[]);assert.deepEqual(forbidden,[]);
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({scope:'生产组件及同步receive，本地模拟响应/延迟/快照顺序，无真实AI/设备/数据库',results,errors,deviceActions:0},null,2));
  console.log(JSON.stringify({results,errors,deviceActions:0},null,2));
 }finally{for(const c of clients){Object.values(c.release).forEach(fn=>fn());c.syncReleases.forEach(fn=>fn())}await browser.close();await server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
