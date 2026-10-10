'use strict';
const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'supersurfer-remote-project-'));
 let app;
 try{
  app=await electron.launch({executablePath:require('electron'),args:[path.resolve(__dirname,'..'),`--user-data-dir=${profile}`],chromiumSandbox:true});
  const original=await app.firstWindow();await original.waitForFunction(()=>!document.querySelector('#connect-button')?.disabled);
  await original.evaluate(()=>superSurferDesktop.openRemoteProject({name:'remote-repo',repo:'/remote/repos/example',surfboard_template:'software'}));
  await original.waitForFunction(()=>!document.querySelector('#connect-button')?.disabled);
  assert.equal(await original.locator('#mode').inputValue(),'remote');
  assert.equal(app.windows().length,1,'Remote setup reuses the current window');
  assert.equal(await original.locator('#remote-fields').isVisible(),true);
  assert.equal(await original.locator('#connect-button').isEnabled(),true);
  const draft=await original.evaluate(()=>superSurferDesktop.takeProjectDraft());
  assert.deepEqual(draft,{name:'remote-repo',repo:'/remote/repos/example',surfboard_template:'software'});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].loadURL('data:text/html,<h1>Untrusted</h1>'));
  await assert.rejects(original.evaluate(()=>superSurferDesktop.openRemoteProject({})),/trusted workspace window/);
  console.log('PASS native remote setup reuses one window, defaults to SSH, keeps the project draft, and rejects untrusted IPC');
 }finally{if(app)await app.close();fs.rmSync(profile,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
