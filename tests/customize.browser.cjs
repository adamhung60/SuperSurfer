'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const {install}=require('./fixtures/workspace-demo.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const {data}=await install(page,{tab:'overview'});
  data.projects.push({id:'app-source',name:'SuperSurfer source',repo:'/workspace/SuperSurfer',initialized:true,app_source:true});
  await page.route('http://demo.test/api/project-agents?*',route=>{const id=new URL(route.request().url()).searchParams.get('project_id');return route.fulfill({json:{agents:[{scope:'project:'+id,name:id==='app-source'?'SuperSurfer source lead':'Second checkout lead',owner:'supersurfer',status:'idle'}]}});});
  await page.addInitScript(()=>{
   window.superSurferDesktop={getCustomizeStatus:async()=>({platform:'darwin',version:'0.1.40',installed:'/Applications/SuperSurfer.app',source:null,prepared:null}),chooseCustomizeSource:async()=>({platform:'darwin',version:'0.1.40',installed:'/Applications/SuperSurfer.app',source:{root:'/Users/me/SuperSurfer'},prepared:null}),buildCustomize:async projectId=>{window.builtProject=projectId;return {platform:'darwin',version:'0.1.40',installed:'/Applications/SuperSurfer.app',source:{root:'/Users/me/SuperSurfer'},prepared:{version:'0.1.40'}};},applyCustomize:async()=>({cancelled:true})};
  });
  await page.goto('http://demo.test/');
  await page.locator('[data-view="customize"]').click();
  await page.getByRole('heading',{name:'Customize SuperSurfer'}).waitFor();
  assert.equal(await page.locator('#customize-project').inputValue(),'app-source');
  await page.waitForFunction(()=>document.querySelector('#chat-name')?.textContent==='SuperSurfer source lead');
  data.projects.push({id:'app-source-two',name:'Second checkout',repo:'/workspace/Second',initialized:true,app_source:true});
  await page.locator('#customize-project').selectOption('app-source-two');
  await page.waitForFunction(()=>document.querySelector('#customize-project')?.options.length===2);
  await page.locator('#customize-project').selectOption('app-source');
  await page.waitForFunction(()=>document.querySelector('#customize-project')?.value==='app-source');
  await page.getByText('/workspace/SuperSurfer',{exact:true}).waitFor();
  await page.locator('[data-action="customize-build"]').click();
  await page.getByText('Version 0.1.40 is ready to install.').waitFor();
  assert.equal(await page.evaluate(()=>window.builtProject),'app-source');
  await page.locator('.customize-local summary').click();
  await page.locator('[data-action="customize-source"]').click();
  await page.getByText('/Users/me/SuperSurfer',{exact:true}).waitFor();
  await page.locator('[data-action="customize-build-local"]').click();
  assert.equal(await page.evaluate(()=>window.builtProject),null);
  await page.screenshot({path:'/tmp/supersurfer-customize-desktop.png',fullPage:true});
  await page.locator('[data-action="customize-apply"]').click();
  assert.deepEqual(errors,[]);
  console.log('PASS Customize navigation, project selection, local source, build and restart actions');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
