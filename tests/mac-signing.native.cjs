'use strict';
// Explicit local test; requires the user's already-configured signing certificate.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync:run}=require('node:child_process');
const {resolveMacSigning}=require('../desktop/mac-signing.cjs');
if(process.platform!=='darwin')throw new Error('Requires macOS');
const signing=resolveMacSigning();if(!signing.persistent)throw new Error('Configure a persistent signing identity first.');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'supersurfer-signing-test-'));
try{
 const requirements=[];
 for(const revision of ['before','after']){
  const app=path.join(temp,revision+'.app'),contents=path.join(app,'Contents');fs.mkdirSync(path.join(contents,'MacOS'),{recursive:true});fs.mkdirSync(path.join(contents,'Resources'));
  fs.copyFileSync('/usr/bin/true',path.join(contents,'MacOS','probe'));
  fs.writeFileSync(path.join(contents,'Info.plist'),'<?xml version="1.0"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>research.supersurfer.signing-probe</string><key>CFBundleExecutable</key><string>probe</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>');
  fs.writeFileSync(path.join(contents,'Resources','revision.txt'),revision);
  run('/usr/bin/codesign',['--force','--sign',signing.identity,'--timestamp=none',app],{stdio:'pipe'});
  run('/usr/bin/codesign',['--verify','--deep','--strict',app],{stdio:'pipe'});
  const value=run('/usr/bin/codesign',['-d','-r-',app],{encoding:'utf8',stdio:['ignore','pipe','pipe']});requirements.push(value.trim());
 }
 assert.equal(requirements[0],requirements[1],'Changed source must retain the designated requirement');assert.match(requirements[0],/identifier/);assert.doesNotMatch(requirements[0],/cdhash/);
 console.log('PASS: two different local app bundles verify strictly and share a certificate-backed designated requirement. No app installed, opened, or restarted.');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
