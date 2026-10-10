'use strict';
const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'supersurfer-remote-project-'));
 let app;
 try{
  app=await electron.launch({executablePath:require('electron'),args:[path.resolve(__dirname,'..'),`--user-data-dir=${profile}`],chromiumSandbox:true});
  const original=await app.firstWindow();await original.waitForFunction(()=>!document.querySelector('#connect-button')?.disabled);
  const nextWindow=app.waitForEvent('window');
  await original.evaluate(()=>superSurferDesktop.openRemoteProject());
  const remote=await nextWindow;await remote.waitForFunction(()=>!document.querySelector('#connect-button')?.disabled);
  assert.equal(await remote.locator('#mode').inputValue(),'remote');
  assert.equal(await original.locator('#mode').inputValue(),'local');
  assert.equal(app.windows().length,2);
  assert.equal(await remote.locator('#remote-fields').isVisible(),true);
  assert.equal(await remote.locator('#connect-button').isEnabled(),true);
  await app.evaluate(({BrowserWindow})=>Promise.all(BrowserWindow.getAllWindows().map(window=>window.loadURL('data:text/html,<h1>Untrusted</h1>'))));
  await assert.rejects(remote.evaluate(()=>superSurferDesktop.openRemoteProject()),/trusted workspace window/);
  console.log('PASS native remote setup defaults, separate original window, no automatic connection, untrusted IPC denial');
 }finally{if(app)await app.close();fs.rmSync(profile,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
