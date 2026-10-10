'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const signingConfigPath=()=>path.join(os.homedir(),'Library','Application Support','SuperSurfer','mac-signing.json');
function resolveMacSigning({env=process.env,configPath=signingConfigPath(),read=fs.readFileSync,run=execFileSync}={}){
 let identity=env.SUPERSURFER_SIGNING_IDENTITY;
 if(!identity){
  let saved;
  try{saved=JSON.parse(read(configPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw new Error('Cannot read the saved Mac signing identity. Repair '+configPath+' before building.');}
  if(saved){if(saved.schema!==1||!/^[A-Fa-f0-9]{40}$/.test(saved.identity||''))throw new Error('Invalid saved Mac signing identity. Refusing to change the app identity.');identity=saved.identity;}
 }
 if(!identity||identity==='-')return {identity:'-',persistent:false};
 if(!/^[A-Fa-f0-9]{40}$/.test(identity))throw new Error('SUPERSURFER_SIGNING_IDENTITY must be a certificate SHA-1 fingerprint (40 hex characters).');
 identity=identity.toUpperCase();
 const available=String(run('/usr/bin/security',['find-identity','-v','-p','codesigning'],{encoding:'utf8'}));
 const hashes=[...available.matchAll(/^\s*\d+\)\s+([A-Fa-f0-9]{40})\s+/gm)].map(match=>match[1].toUpperCase());
 if(!hashes.includes(identity))throw new Error('The saved Mac signing certificate is unavailable or expired. Restore it in Keychain Access; refusing to fall back to ad-hoc signing and reset app permissions.');
 return {identity,persistent:true};
}
module.exports={signingConfigPath,resolveMacSigning};
