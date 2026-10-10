'use strict';
// Explicit one-time setup. Never called automatically by packaging or Customize.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {signingConfigPath,resolveMacSigning}=require('../desktop/mac-signing.cjs');
function configure({create=false,identity,run=execFileSync,configPath=signingConfigPath()}={}){
 if(process.platform!=='darwin')throw new Error('Local signing setup requires macOS.');
 if(fs.existsSync(configPath)){
  const saved=resolveMacSigning({env:{},configPath,run});
  if(identity&&identity.toUpperCase()!==saved.identity)throw new Error('A different signing identity is already saved. Keep the existing certificate to preserve app permissions.');
  return saved;
 }
 if(!create&&!identity)throw new Error('Use --identity CERTIFICATE_SHA1 or --create. --create adds a persistent private signing key to your login Keychain and trusts its certificate for code signing only. macOS may request approval.');
 let temporary,stage='validation';
 try{
  if(create){
   temporary=fs.mkdtempSync(path.join(os.tmpdir(),'supersurfer-signing-'));fs.chmodSync(temporary,0o700);
   const cert=path.join(temporary,'certificate.pem'),key=path.join(temporary,'private.pem'),p12=path.join(temporary,'identity.p12'),pass=path.join(temporary,'password');
   const password=crypto.randomBytes(32).toString('hex');fs.writeFileSync(pass,password,{mode:0o600});
   const config=path.join(temporary,'certificate.conf');
   fs.writeFileSync(config,'[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=SuperSurfer Local Development '+crypto.randomUUID().slice(0,16)+'\n[ext]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=critical,codeSigning\n',{mode:0o600});
   stage='certificate generation';
   run('/usr/bin/openssl',['req','-new','-x509','-newkey','rsa:3072','-nodes','-days','3650','-config',config,'-keyout',key,'-out',cert],{stdio:'pipe'});
   fs.chmodSync(key,0o600);
   stage='certificate export';
   run('/usr/bin/openssl',['pkcs12','-export','-inkey',key,'-in',cert,'-out',p12,'-passout','file:'+pass],{stdio:'pipe'});
   stage='default Keychain lookup';
   const keychain=String(run('/usr/bin/security',['default-keychain','-d','user'],{encoding:'utf8'})).trim().replace(/^"|"$/g,'');
   if(!keychain)throw new Error('No default user Keychain is available.');
   stage='Keychain import';
   run('/usr/bin/security',['import',p12,'-k',keychain,'-P',password,'-T','/usr/bin/codesign'],{stdio:'pipe'});
   // No system trust, TLS trust, TCC edits, Gatekeeper changes, or all-app key access.
   stage='code-signing trust';
   run('/usr/bin/security',['add-trusted-cert','-r','trustRoot','-p','codeSign','-k',keychain,cert],{stdio:'pipe'});
   const fingerprint=String(run('/usr/bin/openssl',['x509','-in',cert,'-noout','-fingerprint','-sha1'],{encoding:'utf8'}));
   identity=fingerprint.split('=').pop().replace(/[:\s]/g,'').toUpperCase();
  }
  const signing=resolveMacSigning({env:{SUPERSURFER_SIGNING_IDENTITY:identity},configPath,run});
  if(!signing.persistent)throw new Error('A persistent signing certificate is required.');
  fs.mkdirSync(path.dirname(configPath),{recursive:true});
  // Exclusive creation protects a concurrent setup; only a public fingerprint is saved.
  fs.writeFileSync(configPath,JSON.stringify({schema:1,identity:signing.identity})+'\n',{mode:0o600,flag:'wx'});
  return signing;
 }catch(error){
  // Never print child-process arguments: Keychain import has a transient password.
  throw new Error('Mac signing setup failed. Check Keychain Access for SuperSurfer Local Development and retry with --identity and its SHA-1 fingerprint. '+'Setup did not complete during '+stage+'.');
 }finally{if(temporary)fs.rmSync(temporary,{recursive:true,force:true});}
}
if(require.main===module){
 try{const args=process.argv.slice(2);if(args.length!==1&&!(args.length===2&&args[0]==='--identity'))throw new Error('Usage: node scripts/configure-mac-signing.cjs --create | --identity CERTIFICATE_SHA1');const result=configure({create:args[0]==='--create',identity:args[0]==='--identity'?args[1]:undefined});console.log('Persistent Mac signing configured. Future local builds reuse this identity. One final App Management approval may be needed when moving from the old ad-hoc build.');}
 catch(error){console.error(error.message);process.exitCode=1;}
}
module.exports={configure};
