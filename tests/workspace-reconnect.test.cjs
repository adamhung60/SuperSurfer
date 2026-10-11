'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {connectWorkspace}=require('../desktop/workspace-reconnect.cjs');
const updateError=()=>new Error('Connection failed: A new workspace version was uploaded, but this workspace uses a detached service. Stop that service and reconnect to apply the new version.');
function fixture(response=1){
 const config={mode:'local',remoteRoot:'/fixture',remotePort:8765},calls=[],controller=new AbortController();let grant=false;
 return {config,calls,signal:controller.signal,controller,onStatus:()=>{},getWindow:()=>null,customize:{workspaceUpgrade:c=>{assert.equal(c,config);return grant;},authorizeWorkspaceUpgrade:c=>{assert.equal(c,config);calls.push('authorize');grant=true;},workspaceConnected:c=>{assert.equal(c,config);calls.push('consume');}},dialog:{showMessageBox:async()=>{calls.push('prompt');return {response};}},connect:async(c,_,options)=>{assert.equal(c,config);calls.push(options.customizeUpgrade?'authorized':'ordinary');if(!options.customizeUpgrade)throw updateError();return {ok:true};}};
}
test('legacy installer recovery needs native consent then uses exact-workspace grant once',async()=>{const f=fixture();assert.deepEqual(await connectWorkspace(f),{ok:true});assert.deepEqual(f.calls,['ordinary','prompt','authorize','authorized','consume']);});
test('cancel leaves workspace untouched and grant unissued',async()=>{const f=fixture(0);await assert.rejects(connectWorkspace(f),/detached service/);assert.deepEqual(f.calls,['ordinary','prompt']);});
test('unrelated errors never request permission or restart',async()=>{const f=fixture();f.connect=async()=>{throw new Error('Wrong workspace');};await assert.rejects(connectWorkspace(f),/Wrong workspace/);assert.deepEqual(f.calls,[]);});
test('failed authorized retry is bounded and retains grant for user retry',async()=>{const f=fixture();f.connect=async(_,__,options)=>{f.calls.push(options.customizeUpgrade?'authorized':'ordinary');throw updateError();};await assert.rejects(connectWorkspace(f),/detached service/);assert.deepEqual(f.calls,['ordinary','prompt','authorize','authorized']);});
test('cancellation during confirmation does not authorize or retry',async()=>{const f=fixture();f.dialog.showMessageBox=async()=>{f.controller.abort();return {response:1};};await assert.rejects(connectWorkspace(f),/detached service/);assert.deepEqual(f.calls,['ordinary']);});
