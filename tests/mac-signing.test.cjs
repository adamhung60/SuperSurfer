'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {resolveMacSigning}=require('../desktop/mac-signing.cjs');
const fingerprint='AB'.repeat(20),other='CD'.repeat(20);
const missing=()=>{throw Object.assign(new Error('missing'),{code:'ENOENT'});};
test('unconfigured development builds remain explicitly ad-hoc',()=>assert.deepEqual(resolveMacSigning({env:{},read:missing}),{identity:'-',persistent:false}));
test('fresh source snapshots reuse the same saved signing identity',()=>{
 const read=()=>JSON.stringify({schema:1,identity:fingerprint.toLowerCase()}),run=()=>`  1) ${fingerprint} "SuperSurfer Local Development"\n  1 valid identities found`;
 assert.deepEqual(resolveMacSigning({env:{},read,run}),{identity:fingerprint,persistent:true});
 assert.deepEqual(resolveMacSigning({env:{},read,run}),{identity:fingerprint,persistent:true});
});
test('missing, expired or invalid saved identity never silently falls back',()=>{
 assert.throws(()=>resolveMacSigning({env:{},read:()=>JSON.stringify({schema:1,identity:fingerprint}),run:()=>`  1) ${other} "Other"`}),/refusing to fall back/);
 assert.throws(()=>resolveMacSigning({env:{},read:()=>'{broken'}),/Cannot read/);
 assert.throws(()=>resolveMacSigning({env:{},read:()=>JSON.stringify({schema:1,identity:'-'})}),/Invalid saved/);
});
test('explicit fingerprint is checked without opening a shell or trusting a name match',()=>{
 const calls=[];assert.equal(resolveMacSigning({env:{SUPERSURFER_SIGNING_IDENTITY:fingerprint},read:missing,run:(cmd,args)=>{calls.push([cmd,args]);return `  1) ${fingerprint} "Local"`;}}).identity,fingerprint);
 assert.deepEqual(calls,[['/usr/bin/security',['find-identity','-v','-p','codesigning']]]);
 assert.throws(()=>resolveMacSigning({env:{SUPERSURFER_SIGNING_IDENTITY:'Some certificate name'},read:missing}),/40 hex/);
});
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {configure}=require('../scripts/configure-mac-signing.cjs');
test('one-time setup is explicit, code-signing-only, and reused without rotating the key',{skip:process.platform!=='darwin'},()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'signing-config-test-')),configPath=path.join(temp,'config.json'),calls=[];let privateDirectory;
 const run=(command,args)=>{
  calls.push([command,args]);
  if(args[0]==='req'){
   const config=fs.readFileSync(args[args.indexOf('-config')+1],'utf8');assert.ok(config.match(/CN=(.*)/)[1].length<=64);
   const key=args[args.indexOf('-keyout')+1];privateDirectory=path.dirname(key);fs.writeFileSync(key,'fixture key');return '';
  }
  if(args[0]==='default-keychain')return '"/sample/login.keychain-db"';
  if(args[0]==='x509')return 'SHA1 Fingerprint='+fingerprint;
  if(args[0]==='find-identity')return `  1) ${fingerprint} "Local"`;
  return '';
 };
 try{
  assert.throws(()=>configure({configPath,run}),/Use --identity/);assert.equal(calls.length,0);
  assert.equal(configure({create:true,configPath,run}).identity,fingerprint);
  assert.equal(fs.existsSync(privateDirectory),false,'temporary private material removed');
  const trust=calls.find(c=>c[1][0]==='add-trusted-cert');assert.equal(trust[1][trust[1].indexOf('-p')+1],'codeSign');assert.equal(trust[1].includes('-d'),false);
  const imported=calls.find(c=>c[1][0]==='import');assert.equal(imported[1].includes('-A'),false);assert.equal(imported[1][imported[1].indexOf('-T')+1],'/usr/bin/codesign');
  calls.length=0;assert.equal(configure({create:true,configPath,run}).identity,fingerprint);assert.deepEqual(calls.map(c=>c[1][0]),['find-identity']);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
