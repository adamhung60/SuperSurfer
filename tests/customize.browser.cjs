'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const {install}=require('./fixtures/workspace-demo.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],calls=[],chats=[];
  let previewReads=0,holdCreation=false,releaseCreation,creationStarted;
  page.on('pageerror',error=>errors.push(error.message));
  const {data}=await install(page,{tab:'overview'});
  data.projects.push({id:'app-source',name:'SuperSurfer source',repo:'/workspace/SuperSurfer',initialized:true,app_source:true,surfboard:{workflow:'software'}});
  await page.route('http://demo.test/api/project-activity?*',route=>{if(new URL(route.request().url()).searchParams.get('project_id')==='app-source')previewReads++;return route.fulfill({json:{actions:[{node_id:'preview-1',node_label:'Visual change',status:'running',preview_url:'/board-preview/demo/'}]}});});
  await page.route('http://demo.test/board-preview/demo/',route=>route.fulfill({contentType:'text/html',body:'<h1>Visual change preview</h1>'}));
  await page.route('http://demo.test/api/project-agents?*',route=>{const id=new URL(route.request().url()).searchParams.get('project_id');return route.fulfill({json:{agents:[{scope:'project:'+id,name:'SuperSurfer source lead',owner:'supersurfer',status:'idle'},...chats]}});});
  await page.route('http://demo.test/api/chat?*',route=>{const scope=new URL(route.request().url()).searchParams.get('scope');return route.fulfill({json:{messages:[],busy:false,agent:{name:chats.find(c=>c.scope===scope)?.name||'SuperSurfer source lead'},preferences:{editable:true,defaults:{},overrides:{},effective:{}}}});});
  await page.route('http://demo.test/api/action',async route=>{
   const call=route.request().postDataJSON();calls.push(call);let body={accepted:true};
   if(call.op==='chat.create'){
    if(holdCreation){holdCreation=false;await new Promise(resolve=>{releaseCreation=resolve;creationStarted();});}
    const id='chat-'+chats.length;body={experiment_id:id,scope:'experiment:'+id};
    chats.push({scope:body.scope,name:call.params.name,owner:'supersurfer',status:'idle'});
    data.experiments.push({id,project_id:call.params.project_id,name:call.params.name,status:'draft'});
   }
   return route.fulfill({json:body});
  });
  await page.addInitScript(()=>{
   window.installCalls=[];window.buildMode='success';window.sourceConfigured=false;
   window.superSurferDesktop={
    getCustomizeStatus:async()=>({platform:'darwin',version:'0.1.40',installed:'/Applications/SuperSurfer.app',source:window.sourceConfigured?{root:'/local/SuperSurfer'}:null,prepared:null,updateStatus:'Restart command sent. Previous app backup: /private/backup.app'}),
    chooseCustomizeSource:async()=>{window.sourceConfigured=true;return window.superSurferDesktop.getCustomizeStatus();},
    buildCustomize:async projectId=>{window.installCalls.push(['build',projectId]);if(window.buildMode==='fail')throw new Error('Simulated build failed');return {platform:'darwin',version:'0.1.40',installed:'/Applications/SuperSurfer.app',cancelled:window.buildMode==='cancel',prepared:window.buildMode==='cancel'?null:{version:'0.1.40'}};},
    applyCustomize:async()=>{window.installCalls.push(['apply']);return {cancelled:true};}
   };
  });
  await page.goto('http://demo.test/');await page.locator('[data-view="customize"]').click();
  await page.getByRole('heading',{name:'Customize SuperSurfer',exact:true}).waitFor();
  assert.equal(await page.locator('#project-tree [data-project="app-source"]').count(),0);
  assert.equal(await page.locator('#customize-project').count(),0);
  await page.locator('#chat-input').fill('Keep the lead draft.');
  const previewToggle=page.getByRole('switch',{name:'Show visual preview'});
  assert.equal(await previewToggle.isChecked(),false);
  assert.equal(await page.locator('.customize-preview').count(),0);
  assert.equal(previewReads,0);
  const switchBox=await previewToggle.boundingBox(),sendBox=await page.getByRole('button',{name:'Send idea',exact:true}).boundingBox();
  assert.ok(switchBox.y+switchBox.height<sendBox.y,'Switch is above Send idea');
  for(const text of ['What would you like different?','Each idea opens a separate agent chat.','One action builds the saved source','Restart command sent.'])assert.equal((await page.locator('.customize-page').innerText()).includes(text),false);
  assert.equal(await page.getByRole('button',{name:'Open source',exact:true}).count(),0);
  assert.match(await page.locator('.customize-path').innerText(),/Source location:.*\/workspace\/SuperSurfer/);
  await page.screenshot({path:'/tmp/supersurfer-customize-cleanup-hidden.png',fullPage:true});
  await page.locator('#customize-idea').fill('Keep this idea while toggling.');
  await previewToggle.focus();await previewToggle.press('Space');
  await page.frameLocator('.customize-preview iframe').getByRole('heading',{name:'Visual change preview'}).waitFor();
  await page.screenshot({path:'/tmp/supersurfer-customize-switch-on.png',fullPage:true});
  assert.equal(await previewToggle.evaluate(el=>el===document.activeElement),true);
  await previewToggle.press('Space');
  assert.equal(await page.locator('.customize-preview').count(),0);
  const readsWhenOff=previewReads;
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('[data-view=customize]').click();
  assert.equal(previewReads,readsWhenOff);
  assert.equal(await previewToggle.isChecked(),false);
  assert.equal(await page.locator('#customize-idea').inputValue(),'Keep this idea while toggling.');
  assert.equal(await page.locator('#chat-input').inputValue(),'Keep the lead draft.');
  for(const [index,idea] of ['Make project cards easier to scan.','Add keyboard shortcuts.'].entries()){
   // First submit OFF then toggle ON; second submit ON then toggle OFF.
   assert.equal(await previewToggle.isChecked(),index===1);
   await page.locator('#customize-idea').fill(idea);
   holdCreation=true;const started=new Promise(resolve=>{creationStarted=resolve;});
   await page.getByRole('button',{name:'Send idea',exact:true}).click();await started;
   await previewToggle.click();
   if(index===1){
    await page.locator('#customize-idea').fill('Keep my newer unsent idea.');
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    await page.locator('[data-view=customize]').click();
   }
   releaseCreation();
   await page.waitForFunction(()=>!document.querySelector('[data-action="customize-send-idea"]').disabled,{},{timeout:8000});
   assert.equal(calls.filter(call=>call.op==='chat.send').length,index+1);
   assert.equal(await page.locator('#customize-idea').inputValue(),index===1?'Keep my newer unsent idea.':'');
  }
  const sends=calls.filter(call=>call.op==='chat.send');assert.equal(sends.length,2);
  assert.doesNotMatch(sends[0].params.text,/preview/i);
  assert.match(sends[1].params.text,/show a running preview in Customize SuperSurfer/);
  for(const send of sends)assert.match(send.params.text,/Do not install or restart the app; I will use that button when ready\./);
  assert.notEqual(sends[0].params.scope,sends[1].params.scope);
  assert.equal(calls.some(call=>call.op==='chat.steer'),false);assert.equal(calls.filter(call=>call.op==='chat.create').length,2);
  await page.getByRole('button',{name:'Expand agents section',exact:true}).click();
  await page.locator('[data-conversation="project:app-source"]').click();
  assert.equal(await page.locator('#chat-input').inputValue(),'Keep the lead draft.');
  await page.getByRole('button',{name:'New chat',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#chat-name')?.textContent==='New chat');
  assert.equal(calls.filter(call=>call.op==='chat.create').length,3);assert.equal(calls.filter(call=>call.op==='chat.send').length,2);
  assert.equal(await page.locator('#modal[open]').count(),0);
  assert.equal(await previewToggle.isChecked(),false);
  const installButton=page.getByRole('button',{name:'Install and restart',exact:true});
  assert.equal(await page.getByRole('button',{name:'Build changes',exact:true}).count(),0);
  await installButton.click();await page.waitForFunction(()=>window.installCalls.length===2&&!document.querySelector('[data-action="customize-install"]').disabled);
  assert.deepEqual(await page.evaluate(()=>window.installCalls),[['build','app-source'],['apply']]);
  await page.evaluate(()=>{window.installCalls=[];window.buildMode='cancel';});await installButton.click();
  await page.waitForFunction(()=>!document.querySelector('[data-action="customize-install"]').disabled);assert.deepEqual(await page.evaluate(()=>window.installCalls),[['build','app-source']]);
  await page.evaluate(()=>{window.installCalls=[];window.buildMode='fail';});await installButton.click();
  await page.getByText('Simulated build failed',{exact:true}).waitFor();assert.deepEqual(await page.evaluate(()=>window.installCalls),[['build','app-source']]);
  await page.evaluate(()=>{window.buildMode='success';});await installButton.click();await page.waitForFunction(()=>!document.querySelector('[data-action="customize-install"]').disabled);
  await previewToggle.uncheck();
  await page.locator('.customize-page').evaluate(el=>el.parentElement.scrollTop=0);
  await page.screenshot({path:'/tmp/supersurfer-customize-streamlined.png',fullPage:true});
  await page.setViewportSize({width:900,height:800});
  assert.equal(await page.locator('.customize-page').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
  data.projects.splice(data.projects.findIndex(p=>p.id==='app-source'),1);
  await page.reload();await page.locator('[data-view="customize"]').click();
  await page.getByRole('button',{name:'Set up…',exact:true}).click();
  await page.getByRole('button',{name:'Change…',exact:true}).waitFor();
  assert.match(await page.locator('.customize-path').innerText(),/\/local\/SuperSurfer/);
  assert.deepEqual(errors,[]);
  console.log('PASS default-off accessible switch above Send idea, no OFF loading/section, keyboard focus and drafts, captured OFF/ON outgoing messages across async toggles/navigation, independent no-install instruction; hidden source navigation, separate agent per idea, New chat without popup/inference, preserved lead draft, running preview, one install button, build-before-apply, cancellation and build failure');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
