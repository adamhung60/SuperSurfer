'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const {install}=require('./fixtures/workspace-demo.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:900}}),errors=[],calls=[];
  page.on('pageerror',error=>errors.push(error.message));
  const {data}=await install(page);data.workspace_hosts=[{id:'host_this',name:'This computer'},{id:'host_remote',name:'gpu-remote'}];
  await page.addInitScript(()=>{window.remoteCalls=0;window.remoteFail=true;window.superSurferDesktop={takeProjectDraft:async()=>({name:'remote-repo',repo:'/remote/repos/example',surfboard_template:'software'}),openRemoteProject:async draft=>{window.remoteCalls++;window.lastProjectDraft=draft;if(window.remoteFail)throw new Error('Could not open SSH setup');return {opened:true};}};});
  await page.route('http://demo.test/api/action',route=>{
   const call=route.request().postDataJSON();calls.push(call);
   if(call.op==='project.add'){const project={id:'remote-repo',...call.params,initialized:true};data.projects.push(project);return route.fulfill({json:{project}});}
   return route.fulfill({json:{ok:true}});
  });
  await page.goto('http://demo.test/?add_project=1');
  await page.locator('#remote-project').waitFor();
  assert.equal(new URL(page.url()).searchParams.has('add_project'),false);
  assert.equal(await page.locator('#modal [name="goal"]').count(),0);
  assert.equal(await page.locator('#modal [name="name"]').inputValue(),'remote-repo');
  assert.equal(await page.locator('#modal [name="surfboard_template"]').inputValue(),'software');
  await page.locator('#modal [name="name"]').fill('remote-repo');
  await page.locator('#project-repo').fill('/remote/repos/example');await page.locator('[name=workspace_host_id]').selectOption('host_remote');
  await page.locator('#remote-project').click();
  await page.getByText('Could not open SSH setup',{exact:true}).waitFor();
  assert.equal(await page.locator('#remote-project').isEnabled(),true);
  assert.equal(await page.locator('#remote-project').innerText(),'Connect a different machine…');
  await page.evaluate(()=>{window.remoteFail=false;});await page.locator('#remote-project').click();
  assert.equal(await page.evaluate(()=>remoteCalls),2);
  assert.deepEqual(await page.evaluate(()=>lastProjectDraft),{name:'remote-repo',repo:'/remote/repos/example',surfboard_template:'software'});
  assert.equal(await page.locator('#project-repo').inputValue(),'/remote/repos/example');
  assert.equal(calls.filter(c=>c.op==='project.add').length,0,'Remote handoff does not create a local project');
  await page.screenshot({path:'/tmp/supersurfer-remote-project.png'});
  await page.getByRole('button',{name:'Connect & enable tools',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('#modal').open);
  const added=calls.find(c=>c.op==='project.add');assert.equal(added.params.repo,'/remote/repos/example');assert.equal(added.params.workspace_host_id,'host_remote');assert.equal(Object.hasOwn(added.params,'goal'),false);
  assert.deepEqual(calls.find(c=>c.op==='editor.trust').params,{project_id:'remote-repo',repo:'/remote/repos/example',trusted:true});
  await page.evaluate(()=>{delete window.superSurferDesktop;});
  await page.getByRole('button',{name:'Add project',exact:true}).click();
  assert.equal(await page.locator('#remote-project').count(),0);
  assert.match(await page.locator('#modal').innerText(),/Remote SSH in this window/);
  assert.deepEqual(errors,[]);
  console.log('PASS remote project arrival, handoff/retry, draft preservation, multi-host project target, goal-free creation, trust, browser fallback');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
