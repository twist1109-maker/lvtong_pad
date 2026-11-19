// 真实生产App、REST、Socket.IO、临时SQLite；只模拟AI推理，设备操作全部隔离。
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1117-835-0_26.1117.835.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const errors=[],cases=[],held={truck:[],crop:[],ocr:[]},hold={truck:true,crop:true,ocr:true},calls={truck:0,crop:0,ocr:0},out=path.join(__dirname,'artifacts/real-sync');fs.mkdirSync(out,{recursive:true});
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
  await a.reload();await a.waitForFunction(()=>document.querySelector('.dashboard')&&document.querySelector('.session-sync-status')?.textContent==='已同步');
  await a.evaluate(()=>{window.v=document.querySelector('.dashboard').__vueParentComponent.setupState});
  assert.equal(await a.evaluate(()=>window.v.manualFields.truckType),true);assert.equal(await a.evaluate(()=>window.v.form.truckType),'16');
  assert.equal(await a.evaluate(()=>window.v.weightRangeHint),'(13000-16800)');cases.push('刷新恢复人工保护、来源与OCR参考，不复活旧AI车型');
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
