// 真实生产App、REST、Socket.IO、临时SQLite；只模拟AI推理，设备操作全部隔离。
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1117-835-0_26.1117.835.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const errors=[],cases=[],held={truck:[],crop:[],ocr:[],load:[]},hold={truck:true,crop:true,ocr:true,load:false},calls={truck:0,crop:0,ocr:0,load:0},out=path.join(__dirname,'artifacts/real-sync');fs.mkdirSync(out,{recursive:true});
 let photo='',wsFrames=0;
 const release=kind=>{hold[kind]=false;held[kind].splice(0).forEach(resolve=>resolve())};
 async function wait(check,label){const until=Date.now()+15000;while(!await check()){if(Date.now()>until)throw Error('timeout: '+label);await new Promise(r=>setTimeout(r,40))}}
 try{
  const a=await browser.newPage({viewport:{width:1920,height:1080}}),b=await browser.newPage({viewport:{width:1280,height:800}});
  await a.request.post('http://127.0.0.1:5197/api/booking/reset');
  for(const page of [a,b]){
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   page.on('websocket',ws=>ws.on('framereceived',({payload})=>{if(typeof payload==='string'&&payload.includes('inspection_session'))wsFrames++}));
   await page.route('**/*',async route=>{
    const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();
    if(u.pathname.startsWith('/mtx/'))return route.fulfill({status:503});
    if(/\/api\/booking\/(open|accept|stop)|\/api\/device\/(control|radiation)/.test(u.pathname)){errors.push('device action '+u.pathname);return route.abort()}
    if(u.pathname.includes('/inspection/plate/'))return route.fulfill({json:{code:0,data:{count:0}}});
    if(u.pathname.endsWith('/truck-types'))return route.fulfill({json:{code:0,data:[{type_code:'11',type_name:'一型货车'},{type_code:'16',type_name:'六型货车'}]}});
    if(u.pathname.endsWith('/container-types'))return route.fulfill({json:{code:0,data:[{type_code:'4.1',type_name:'厢式货车'},{type_code:'4.3',type_name:'其他货车'}]}});
    if(u.pathname.endsWith('/ai-load-rate')){calls.load++;if(hold.load)await new Promise(resolve=>held.load.push(resolve));return route.fulfill({json:{code:0,data:{load_rate_pct:36}}}).catch(()=>{})}
    const kind=u.pathname.endsWith('/ai-truck-real')?'truck':u.pathname.endsWith('/license/ai-crop')?'crop':u.pathname.endsWith('/ocr/driving-license')?'ocr':'';
    if(kind){calls[kind]++;if(hold[kind])await new Promise(resolve=>held[kind].push(resolve));
     return route.fulfill({json:{code:0,data:kind==='truck'?{wheel_count:2,vehicle_type:'11',vehicle_container_type:'4.1'}:kind==='crop'?{mainDataUrl:photo,imageDataUrl:photo,mode:'single'}:{plate_number:'鄂A12345',weight_min:13000,weight_max:16800}}}).catch(()=>{})}
    return route.continue();
   });
   await page.goto('http://127.0.0.1:5197/tests/session/');
   await page.waitForFunction(()=>document.querySelector('.dashboard')&&document.querySelector('.session-sync-status')?.textContent==='已同步');
   await page.evaluate(()=>{window.v=document.querySelector('.dashboard').__vueParentComponent.setupState});
  }
  const token=(await (await a.request.get('http://127.0.0.1:5197/fixture/token')).json()).token;
  const current=async()=>(await (await a.request.get('http://127.0.0.1:5197/api/inspection-session/current',{headers:{Authorization:'Bearer '+token}})).json()).data;
  const start=await (await a.request.post('http://127.0.0.1:5197/fixture/begin',{data:{assist:true}})).json();photo=start.data.draft.licensePaths.license;
  await wait(()=>held.truck.length===2&&held.crop.length===2,'both pages started AI');
  await b.locator('.form-body select').nth(0).selectOption('16');await b.locator('.form-body select').nth(1).selectOption('4.3');
  await b.getByPlaceholder('请输入11位手机号').fill('13900000000');await b.getByPlaceholder('出口称重（kg）').fill('15000');
  await wait(async()=>{const d=(await current()).draft;return d.manualFields?.truckType&&d.manualFields?.containerType&&d.form?.truckType==='16'&&d.form?.containerType==='4.3'},'manual choices persisted');
  release('crop');await wait(()=>held.ocr.length===2,'both OCR requests');
  await a.getByPlaceholder('请输入11位手机号').fill('13700000000');await wait(async()=>(await current()).draft.form.phone==='13700000000','unrelated edit synchronized');
  release('ocr');release('truck');
  for(const page of [a,b])await page.waitForFunction(()=>window.v.weightRangeHint==='(13000-16800)'&&!window.v.aiTruckRealBusy&&!window.v.aiLicenseCropBusy);
  await wait(async()=>(await current()).draft.aiContext?.truck?.wheelCount===2,'AI context persisted');
  for(const page of [a,b]){
   const state=await page.evaluate(()=>({truck:window.v.form.truckType,container:window.v.form.containerType,mark:window.v.aiMarks.truckType,range:window.v.weightRangeHint}));
   assert.equal(state.truck,'16');assert.equal(state.container,'4.3');assert.equal(state.mark,'');assert.equal(state.range,'(13000-16800)');
  }
  cases.push('真实REST/WS下另一端人工车型车厢优先，AI迟到不覆盖，普通电话更新不取消OCR');
  await wait(async()=>{const d=(await current()).draft;return d.form.loadRate==='36'&&d.aiMarks.loadRate==='36'&&d.aiContext.load?.container==='4.3'},'AI load rate persisted');
  for(const page of [a,b])await page.waitForFunction(()=>window.v.form.loadRate==='36'&&window.v.hasAiMark('loadRate',window.v.form.loadRate));
  for(const [name,page] of [['pc',a],['pad',b]])await page.locator('.form-body').screenshot({path:path.join(out,'load-rate-'+name+'.png')});
  const loadsBeforeReload=calls.load;
  await a.reload();await a.waitForFunction(()=>document.querySelector('.dashboard')&&document.querySelector('.session-sync-status')?.textContent==='已同步');
  await a.evaluate(()=>{window.v=document.querySelector('.dashboard').__vueParentComponent.setupState});
  assert.equal(await a.evaluate(()=>window.v.manualFields.truckType),true);assert.equal(await a.evaluate(()=>window.v.form.truckType),'16');
  assert.equal(await a.evaluate(()=>window.v.weightRangeHint),'(13000-16800)');cases.push('刷新恢复人工保护、来源与OCR参考，不复活旧AI车型');
  await a.waitForTimeout(1400);assert.equal(calls.load,loadsBeforeReload);assert.equal(await a.evaluate(()=>window.v.hasAiMark('loadRate',window.v.form.loadRate)),true);
  cases.push('装载率自动回填与AI标记经真实REST/WS双端持久同步，刷新不重复请求');
  await a.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;const ctx=canvas.getContext('2d');ctx.fillStyle='#7048dc';ctx.fillRect(0,0,32,32);window.v.onCaptureConfirm('top',[canvas.toDataURL('image/png')])});
  await wait(async()=>{const d=(await current()).draft;return d.manualPhotos?.top&&d.captureThumbs.top?.startsWith('/api/images/session_assets/')&&d.captureThumbs.top!==photo},'manual photo persisted');
  const manualTop=(await current()).draft.captureThumbs.top;
  await a.request.post('http://127.0.0.1:5197/fixture/auto-photo',{data:{kind:'top',url:photo}});
  for(const page of [a,b])await page.waitForFunction(manualTop=>window.v.manualPhotos.top&&window.v.captureThumbs.top===manualTop,manualTop);
  await b.reload();await b.waitForFunction(()=>document.querySelector('.dashboard')&&document.querySelector('.session-sync-status')?.textContent==='已同步');
  await b.evaluate(()=>{window.v=document.querySelector('.dashboard').__vueParentComponent.setupState});
  assert.equal(await b.evaluate(()=>window.v.manualPhotos.top),true);assert.equal((await current()).draft.captureThumbs.top,manualTop);
  cases.push('手动照片通过真实REST/WS双端共享并在刷新后保留，车道恢复后的自动照片不覆盖');
  hold.load=true;await a.evaluate(manualTop=>window.v.xrayImageUrls={'200':manualTop,'160':'',mosaic:''},manualTop);
  await wait(()=>held.load.length===2,'both load requests waiting');
  await b.getByPlaceholder('请输入满载率，区间0-100').fill('87');
  await wait(async()=>(await current()).draft.manualFields?.loadRate===true,'manual load rate persisted');release('load');
  for(const page of [a,b])await page.waitForFunction(()=>window.v.form.loadRate==='87'&&!window.v.aiLoadRateBusy&&!window.v.hasAiMark('loadRate',window.v.form.loadRate));
  await b.reload();await b.waitForFunction(()=>document.querySelector('.dashboard')&&document.querySelector('.session-sync-status')?.textContent==='已同步');
  await b.evaluate(()=>{window.v=document.querySelector('.dashboard').__vueParentComponent.setupState});assert.equal(await b.evaluate(()=>window.v.form.loadRate),'87');
  cases.push('装载率请求在途时另一端人工填写优先，迟到结果与刷新均不能覆盖');
  hold.crop=true;await a.evaluate(()=>window.v.retryLicenseAi());await wait(()=>held.crop.length>0,'AI retry is waiting');
  assert.equal(await a.evaluate(()=>window.v.aiSilentBusy),true);
  await a.evaluate(()=>window.v.onSubmitConfirmYes());
  const records=await (await a.request.get('http://127.0.0.1:5197/fixture/submissions')).json();assert.equal(records.length,1);assert.equal(records[0].vehicle_type,'16');assert.equal(records[0].vehicle_containertype,'4.3');
  // 后端入库字段兼容层可能将车厢字段重命名，原始人工车型必须保留。
  release('crop');await wait(async()=>(await current()).phase==='idle','submit resets session');
  for(const page of [a,b])await page.waitForFunction(()=>window.v.form.truckType===''&&window.v.licensePaths.license==='');
  cases.push('AI请求悬挂时真实隔离提交成功，双端切换新会话，旧识别不回填');
  assert(wsFrames>0);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({cases,calls,wsFrames,errors,submissions:1,deviceActions:0},null,2));console.log(JSON.stringify({cases,calls,wsFrames,errors,deviceActions:0},null,2));
 }finally{Object.keys(held).forEach(release);await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
