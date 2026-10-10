'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const {install}=require('./fixtures/workspace-demo.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],calls=[],chats=[];
  page.on('pageerror',error=>errors.push(error.message));
  const {data}=await install(page,{tab:'overview'});
  data.projects.push({id:'app-source',name:'SuperSurfer source',repo:'/workspace/SuperSurfer',initialized:true,app_source:true,surfboard:{workflow:'software'}});
  await page.route('http://demo.test/api/project-activity?*',route=>route.fulfill({json:{actions:[{node_id:'preview-1',node_label:'Visual change',status:'running',preview_url:'/board-preview/demo/'}]}}));
  await page.route('http://demo.test/board-preview/demo/',route=>route.fulfill({contentType:'text/html',body:'<h1>Visual change preview</h1>'}));
  await page.route('http://demo.test/api/project-agents?*',route=>{const id=new URL(route.request().url()).searchParams.get('project_id');return route.fulfill({json:{agents:[{scope:'project:'+id,name:'SuperSurfer source lead',owner:'supersurfer',status:'idle'},...chats]}});});
  await page.route('http://demo.test/api/chat?*',route=>{const scope=new URL(route.request().url()).searchParams.get('scope');return route.fulfill({json:{messages:[],busy:false,agent:{name:chats.find(c=>c.scope===scope)?.name||'SuperSurfer source lead'},preferences:{editable:true,defaults:{},overrides:{},effective:{}}}});});
  await page.route('http://demo.test/api/action',route=>{
   const call=route.request().postDataJSON();calls.push(call);let body={accepted:true};
   if(call.op==='chat.create'){
    const id='chat-'+chats.length;body={experiment_id:id,scope:'experiment:'+id};
    chats.push({scope:body.scope,name:call.params.name,owner:'supersurfer',status:'idle'});
    data.experiments.push({id,project_id:call.params.project_id,name:call.params.name,status:'draft'});
   }
   return route.fulfill({json:body});
  });
  await page.addInitScript(()=>{
   window.installCalls=[];window.buildMode='success';
   window.superSurferDesktop={
    getCustomizeStatus:async()=>({platform:'darwin',version:'0.1.40',installed:'/Applications/SuperSurfer.app',source:null,prepared:null}),
    buildCustomize:async projectId=>{window.installCalls.push(['build',projectId]);if(window.buildMode==='fail')throw new Error('Simulated build failed');return {platform:'darwin',version:'0.1.40',installed:'/Applications/SuperSurfer.app',cancelled:window.buildMode==='cancel',prepared:window.buildMode==='cancel'?null:{version:'0.1.40'}};},
    applyCustomize:async()=>{window.installCalls.push(['apply']);return {cancelled:true};}
   };
  });
  await page.goto('http://demo.test/');await page.locator('[data-view="customize"]').click();
  await page.getByRole('heading',{name:'Customize SuperSurfer',exact:true}).waitFor();
  assert.equal(await page.locator('#project-tree [data-project="app-source"]').count(),0);
  assert.equal(await page.locator('#customize-project').count(),0);
  await page.locator('#chat-input').fill('Keep the lead draft.');
  await page.frameLocator('.customize-preview iframe').getByRole('heading',{name:'Visual change preview'}).waitFor();
  for(const idea of ['Make project cards easier to scan.','Add keyboard shortcuts.']){
   await page.locator('#customize-idea').fill(idea);await page.getByRole('button',{name:'Send idea',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('#customize-idea')?.value===''&&!document.querySelector('[data-action="customize-send-idea"]').disabled,{},{timeout:8000}).catch(async error=>{console.log({calls,errors,body:(await page.locator('body').innerText()).slice(-3000)});throw error;});
  }
  const sends=calls.filter(call=>call.op==='chat.send');assert.equal(sends.length,2);assert.notEqual(sends[0].params.scope,sends[1].params.scope);
  assert.equal(calls.some(call=>call.op==='chat.steer'),false);assert.equal(calls.filter(call=>call.op==='chat.create').length,2);
  await page.getByRole('button',{name:'Expand agents section',exact:true}).click();
  await page.locator('[data-conversation="project:app-source"]').click();
  assert.equal(await page.locator('#chat-input').inputValue(),'Keep the lead draft.');
  await page.getByRole('button',{name:'New chat',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#chat-name')?.textContent==='New chat');
  assert.equal(calls.filter(call=>call.op==='chat.create').length,3);assert.equal(calls.filter(call=>call.op==='chat.send').length,2);
  assert.equal(await page.locator('#modal[open]').count(),0);
  const installButton=page.getByRole('button',{name:'Install and restart',exact:true});
  assert.equal(await page.getByRole('button',{name:'Build changes',exact:true}).count(),0);
  await installButton.click();await page.waitForFunction(()=>window.installCalls.length===2&&!document.querySelector('[data-action="customize-install"]').disabled);
  assert.deepEqual(await page.evaluate(()=>window.installCalls),[['build','app-source'],['apply']]);
  await page.evaluate(()=>{window.installCalls=[];window.buildMode='cancel';});await installButton.click();
  await page.waitForFunction(()=>!document.querySelector('[data-action="customize-install"]').disabled);assert.deepEqual(await page.evaluate(()=>window.installCalls),[['build','app-source']]);
  await page.evaluate(()=>{window.installCalls=[];window.buildMode='fail';});await installButton.click();
  await page.getByText('Simulated build failed',{exact:true}).waitFor();assert.deepEqual(await page.evaluate(()=>window.installCalls),[['build','app-source']]);
  await page.evaluate(()=>{window.buildMode='success';});await installButton.click();await page.waitForFunction(()=>!document.querySelector('[data-action="customize-install"]').disabled);
  await page.screenshot({path:'/tmp/supersurfer-customize-streamlined.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS hidden source navigation, separate agent per idea, New chat without popup/inference, preserved lead draft, running preview, one install button, build-before-apply, cancellation and build failure');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
