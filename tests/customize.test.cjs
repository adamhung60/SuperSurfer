'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {sourcePackage,installedAppRoot,workspaceSource,createCustomize}=require('../desktop/customize.cjs');
const {workspacePreference}=require('../desktop/preferences.cjs');

test('Customize navigation survives a desktop window restore',()=>{
 assert.equal(workspacePreference({view:'customize',projectId:'proj_source'}).view,'customize');
});

test('only a SuperSurfer source checkout can be selected',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ss-customize-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'desktop'));fs.mkdirSync(path.join(root,'scripts'));fs.mkdirSync(path.join(root,'.git'));
 fs.writeFileSync(path.join(root,'desktop','main.cjs'),'');fs.writeFileSync(path.join(root,'scripts','package.cjs'),'');
 fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'another-app',version:'1.0.0'}));
 assert.throws(()=>sourcePackage(root),/Choose a SuperSurfer/);
 fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'supersurfer',version:'1.0.0'}));
 assert.deepEqual(sourcePackage(root),{root,version:'1.0.0'});
});

test('replacement target is the packaged Mac bundle, never workspace data',()=>{
 assert.equal(installedAppRoot('/Applications/SuperSurfer.app/Contents/Resources/app','darwin'),'/Applications/SuperSurfer.app');
 assert.throws(()=>installedAppRoot('/tmp/source','darwin'),/packaged SuperSurfer/);
 assert.throws(()=>installedAppRoot('/tmp/source','linux'),/macOS/);
});

test('status and build keep installer disabled outside a packaged Mac client',t=>{
 const userData=fs.mkdtempSync(path.join(os.tmpdir(),'ss-customize-state-'));t.after(()=>fs.rmSync(userData,{recursive:true,force:true}));
 const app={getPath:()=>userData,getVersion:()=> '0.1.40',getAppPath:()=>'/tmp/source',isPackaged:false};
 const customize=createCustomize({app,dialog:{},getWindow:()=>null,quit:()=>{}});
 assert.equal(customize.status().version,'0.1.40');
 assert.equal(customize.status().installed,null);
 assert.rejects(customize.build(),/macOS|packaged/);
 assert.rejects(customize.apply(),/Build and verify/);
});

test('native build confirmation leaves source and app untouched when cancelled',async t=>{
 const userData=fs.mkdtempSync(path.join(os.tmpdir(),'ss-customize-confirm-'));t.after(()=>fs.rmSync(userData,{recursive:true,force:true}));
 let prompts=0;
 const app={getPath:()=>userData,getVersion:()=> '0.1.40',getAppPath:()=>'/Applications/SuperSurfer.app/Contents/Resources/app',isPackaged:true};
 const dialog={showMessageBox:async()=>{prompts++;return {response:0};}};
 const customize=createCustomize({app,dialog,getWindow:()=>null,quit:()=>assert.fail('quit must not run'),platform:'darwin'});
 const result=await customize.build({connection:{origin:'http://127.0.0.1:1',token:'test'},projectId:'proj_source'});
 assert.equal(prompts,1);assert.equal(result.cancelled,true);assert.equal(result.busy,false);
 assert.equal(fs.readdirSync(userData).length,0);
});

test('workspace source transfer is scoped, authenticated and extracted locally',async t=>{
 const http=require('node:http'),{execFileSync}=require('node:child_process');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ss-customize-transfer-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 const input=path.join(temp,'input'),output=path.join(temp,'output');fs.mkdirSync(input);fs.mkdirSync(output);
 for(const file of ['desktop/main.cjs','scripts/package.cjs']){const target=path.join(input,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,'saved source');}
 fs.writeFileSync(path.join(input,'package.json'),JSON.stringify({name:'supersurfer',version:'0.1.40'}));
 const archive=execFileSync('tar',['-czf','-','-C',input,'.']);
 const server=http.createServer((request,response)=>{
  assert.equal(request.url,'/api/app-source?project_id=proj_1');
  assert.equal(request.headers.authorization,'Bearer test-token');
  response.writeHead(200,{'Content-Type':'application/gzip','Content-Length':archive.length});response.end(archive);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());
 const source=await workspaceSource(output,{origin:`http://127.0.0.1:${server.address().port}`,token:'test-token'},'proj_1');
 assert.equal(source.version,'0.1.40');assert.match(source.fingerprint,/^[a-f0-9]{16}$/);assert.equal(fs.readFileSync(path.join(source.root,'desktop','main.cjs'),'utf8'),'saved source');
 await assert.rejects(workspaceSource(output,{origin:'http://127.0.0.1',token:'test-token'},'../escape'),/Choose a connected/);
});

test('automatic updates require one native opt-in and remain scoped to its workspace source',async t=>{
 const http=require('node:http');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ss-customize-auto-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 const appPath=path.join(temp,'SuperSurfer.app','Contents','Resources','app');fs.mkdirSync(appPath,{recursive:true});
 fs.writeFileSync(path.join(appPath,'supersurfer-build.json'),JSON.stringify({source_fingerprint:'a'.repeat(16)}));
 const app={getPath:()=>temp,getVersion:()=> '0.1.40',getAppPath:()=>appPath,isPackaged:true};
 let prompts=0,requests=0,sourceRoot='/workspace/SuperSurfer';
 const server=http.createServer((request,response)=>{requests++;assert.equal(request.url,'/api/app-source/fingerprint?project_id=proj_source');assert.equal(request.headers.authorization,'Bearer test-token');response.writeHead(200,{'Content-Type':'application/json'});response.end(JSON.stringify({fingerprint:'a'.repeat(16),source_root:sourceRoot,clean:true}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());
 const connection={origin:`http://127.0.0.1:${server.address().port}`,token:'test-token'};
 const dialog={showMessageBox:async()=>{prompts++;return {response:1};}};
 const customize=createCustomize({app,dialog,getWindow:()=>null,quit:()=>assert.fail('matching installed source must not restart'),platform:'darwin'});
 assert.equal(customize.status().automaticProjectId,null);
 await customize.setAutomaticUpdate({connection,projectId:'proj_source'});
 assert.equal(prompts,1);
 assert.equal(customize.status().automaticProjectId,'proj_source');
 assert.equal(await customize.checkAutomaticUpdate(connection),null);
  assert.equal(await customize.checkAutomaticUpdate({origin:'http://127.0.0.1:1',token:'other'}),null);
  assert.equal(requests,2);
  sourceRoot='/workspace/AnotherCheckout';
  assert.match((await customize.checkAutomaticUpdate(connection)).error,/source project moved/);
  assert.equal(requests,3);
 await customize.setAutomaticUpdate({connection,projectId:null});
 assert.equal(customize.status().automaticProjectId,null);
 assert.equal(prompts,1);
});
