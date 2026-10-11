'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const { randomUUID, createHash } = require('node:crypto');
const run = promisify(execFile);
const {authorizeWorkspaceUpgrade,workspaceUpgrade,clearWorkspaceUpgrade}=require('./customize-upgrade.cjs');

function sourcePackage(directory, requireGit = true) {
  try {
    const root = fs.realpathSync(directory);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    if (manifest.name === 'supersurfer' && typeof manifest.version === 'string' && manifest.version.length < 80 && fs.statSync(path.join(root, 'desktop', 'main.cjs')).isFile() && fs.statSync(path.join(root, 'scripts', 'package.cjs')).isFile() && (!requireGit || fs.existsSync(path.join(root, '.git')))) return {root, version: manifest.version};
  } catch {}
  throw new Error('Choose a SuperSurfer source checkout with its Git history.');
}
function installedAppRoot(appPath, platform = process.platform) {
  if (platform === 'darwin') {
    const root = path.resolve(appPath, '../../..');
    if (!root.endsWith('.app')) throw new Error('Run the packaged SuperSurfer app to install a new build.');
    return root;
  }
  throw new Error('In-app installation is currently available on macOS.');
}
async function verifyMacApp(candidate, expectedVersion, expectedFingerprint = null) {
  const root = fs.realpathSync(candidate);
  if (path.basename(root) !== 'SuperSurfer.app') throw new Error('Expected a built SuperSurfer.app.');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'Contents', 'Resources', 'app', 'package.json'), 'utf8'));
  if (manifest.name !== 'supersurfer' || manifest.version !== expectedVersion) throw new Error('The built app does not match the selected source.');
  if(expectedFingerprint){
    const build=JSON.parse(fs.readFileSync(path.join(root,'Contents','Resources','app','supersurfer-build.json'),'utf8'));
    if(build.source_fingerprint!==expectedFingerprint)throw new Error('The built app does not match the workspace source snapshot.');
  }
  const { stdout } = await run('/usr/bin/plutil', ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', path.join(root, 'Contents', 'Info.plist')]);
  if (stdout.trim() !== 'research.supersurfer.desktop') throw new Error('The built app has an unexpected bundle identifier.');
  await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', root]);
  return root;
}
function readState(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } }
function npmOnPath() {
  const directories = [...(process.env.PATH||'').split(path.delimiter).filter(Boolean), '/opt/homebrew/bin', '/usr/local/bin', path.join(os.homedir(), '.volta', 'bin')];
  const nvm = path.join(os.homedir(), '.nvm', 'versions', 'node');
  try { directories.push(...fs.readdirSync(nvm).sort().reverse().map(version=>path.join(nvm,version,'bin'))); } catch {}
  for (const directory of directories) {
    const npm = path.join(directory, 'npm');
    try { fs.accessSync(npm, fs.constants.X_OK); return {npm, pathEnv:directory+path.delimiter+(process.env.PATH||'')}; } catch {}
  }
  throw new Error('npm is not available on this Mac. Install Node.js 22.12 or newer.');
}
function writeState(file, state) {
  fs.mkdirSync(path.dirname(file), {recursive:true});
  const temp = file+'.tmp';
  fs.writeFileSync(temp, JSON.stringify(state), {mode:0o600});
  fs.renameSync(temp, file);
}
async function workspaceSource(userData, connection, projectId) {
  if (!connection || typeof projectId !== 'string' || !/^[A-Za-z0-9_:-]{1,128}$/.test(projectId)) throw new Error('Choose a connected SuperSurfer source project.');
  const url = new URL('/api/app-source', connection.origin);
  url.searchParams.set('project_id', projectId);
  const response = await fetch(url, {headers:{Authorization:'Bearer '+connection.token},redirect:'error',signal:AbortSignal.timeout(120000)});
  if (!response.ok) {
    let detail;
    try {detail=(await response.json()).error;} catch {}
    throw new Error(detail||`Could not copy workspace source (${response.status}).`);
  }
  if (Number(response.headers.get('content-length')) > 72*1024*1024) throw new Error('Workspace source is too large for a local build.');
  const chunks=[];let size=0;
  for await (const chunk of response.body) {
    size+=chunk.length;
    if(size>72*1024*1024)throw new Error('Workspace source is too large for a local build.');
    chunks.push(chunk);
  }
  const bytes=Buffer.concat(chunks,size);
  const temp=fs.mkdtempSync(path.join(userData, 'customize-source-'));
  const sourceRoot=path.join(temp, 'source');
  fs.mkdirSync(sourceRoot);
  try {
    const archive=path.join(temp, 'source.tar.gz');
    fs.writeFileSync(archive, bytes, {mode:0o600});
    await run('/usr/bin/tar', ['-xzf', archive, '-C', sourceRoot], {timeout:60*1000});
    fs.rmSync(archive);
    return {...sourcePackage(sourceRoot, false), fingerprint:createHash('sha256').update(bytes).digest('hex').slice(0,16)};
  } catch (error) {fs.rmSync(temp, {recursive:true,force:true});throw error;}
}
function createCustomize({app, dialog, getWindow, quit, platform=process.platform}) {
  const stateFile = path.join(app.getPath('userData'), 'customize.json');
  const statusFile = path.join(app.getPath('userData'), 'customize-update.status');
  let busy = false;
  let prepared = null;
  let automaticChecking = false;
  const state = () => readState(stateFile);
  function status() {
    const saved = state();
    let source = null;
    try { if (saved.source) source = sourcePackage(saved.source); } catch {}
    let installed = null;
    try { if (app.isPackaged) installed = installedAppRoot(app.getAppPath(),platform); } catch {}
    let updateStatus = '';
    try { updateStatus = fs.readFileSync(statusFile, 'utf8').trim(); } catch {}
    let installedFingerprint=null;
    try {installedFingerprint=JSON.parse(fs.readFileSync(path.join(app.getAppPath(),'supersurfer-build.json'),'utf8')).source_fingerprint||null;}catch{}
    return {platform, version: app.getVersion(), installedFingerprint, source, installed, busy, prepared: prepared && {version:prepared.version,fingerprint:prepared.fingerprint||null}, updateStatus,
      automaticProjectId:saved.automaticProjectId||null, automaticOrigin:saved.automaticOrigin||null,
      automaticError:saved.automaticError||null};
  }
  async function chooseSource() {
    const selected = await dialog.showOpenDialog(getWindow(), {title:'Choose your SuperSurfer source checkout', properties:['openDirectory']});
    if (selected.canceled || !selected.filePaths?.length) return status();
    const source = sourcePackage(selected.filePaths[0]);
    writeState(stateFile, {...state(), source:source.root});
    prepared = null;
    return status();
  }
  async function build({connection=null,projectId=null,automatic=false}={}) {
    if (busy) throw new Error('A SuperSurfer build is already running.');
    if (platform !== 'darwin') throw new Error('Build and restart is available on macOS.');
    if (!app.isPackaged) throw new Error('Run a packaged SuperSurfer app to test in-app replacement.');
    if(projectId!==null&&(!connection||typeof projectId!=='string'||!/^[A-Za-z0-9_:-]{1,128}$/.test(projectId)))throw new Error('Choose a connected SuperSurfer source project.');
    if(automatic&&(projectId===null||state().automaticProjectId!==projectId||state().automaticOrigin!==connection.origin))throw new Error('Automatic build is not enabled for this source project.');
    installedAppRoot(app.getAppPath(),platform);
    busy = true;
    let source,fromWorkspace=projectId!==null;
    try {
      if(!automatic){
        const answer=await dialog.showMessageBox(getWindow(),{type:'question',buttons:['Cancel','Build on this Mac'],defaultId:0,cancelId:0,title:'Build SuperSurfer source?',message:'Build this SuperSurfer source on your Mac?',detail:fromWorkspace?`Workspace project ${projectId}. This runs npm install and the package script from its saved source.`:`Local checkout ${state().source||'not selected'}. This runs npm install and the package script from that folder.`});
        if(answer.response!==1)return {...status(),busy:false,cancelled:true};
      }
      if(prepared?.snapshot)fs.rmSync(path.dirname(prepared.source),{recursive:true,force:true});
      prepared=null;
      source=fromWorkspace?await workspaceSource(app.getPath('userData'),connection,projectId):sourcePackage(state().source);
      if(fromWorkspace)fs.writeFileSync(path.join(source.root,'supersurfer-build.json'),JSON.stringify({source_fingerprint:source.fingerprint}),{mode:0o644});
      const nodeTools=npmOnPath();
      const nodeVersion=(await run('/usr/bin/env', ['node', '--version'], {env:{...process.env,PATH:nodeTools.pathEnv}})).stdout.trim();
      const match=/^v(\d+)\.(\d+)\./.exec(nodeVersion);
      if(!match||Number(match[1])<22||Number(match[1])===22&&Number(match[2])<12)throw new Error('Building SuperSurfer requires Node.js 22.12 or newer on this Mac.');
      await run(nodeTools.npm, ['ci'], {cwd:source.root, timeout:10*60*1000, maxBuffer:4*1024*1024, env:{...process.env, PATH:nodeTools.pathEnv}});
      await run(nodeTools.npm, ['run', 'package:mac'], {cwd:source.root, timeout:10*60*1000, maxBuffer:4*1024*1024, env:{...process.env, PATH:nodeTools.pathEnv, SUPERSURFER_PLATFORM:'darwin', SUPERSURFER_ARCH:process.arch}});
      const candidate = await verifyMacApp(path.join(source.root, 'dist', `SuperSurfer-darwin-${process.arch}`, 'SuperSurfer.app'), source.version, source.fingerprint||null);
      prepared = {candidate, version:source.version, source:source.root, snapshot:fromWorkspace, fingerprint:source.fingerprint||null,
                  automaticProjectId:automatic?projectId:null, workspaceConfig:connection?.config||null};
    } catch (error) {
      if(fromWorkspace&&source)fs.rmSync(path.dirname(source.root),{recursive:true,force:true});
      throw new Error(error.stderr?.trim()?.slice(-1600) || error.message);
    } finally { busy = false; }
    return status();
  }
  async function apply({automatic=false}={}) {
    if (busy || !prepared) throw new Error('Build and verify a SuperSurfer app first.');
    if(automatic&&(!prepared.automaticProjectId||state().automaticProjectId!==prepared.automaticProjectId))throw new Error('Automatic install is not enabled for this build.');
    const source = sourcePackage(prepared.source, !prepared.snapshot);
    if (source.version !== prepared.version) throw new Error('The source changed after the build. Build again.');
    await verifyMacApp(prepared.candidate, prepared.version, prepared.fingerprint);
    const target = installedAppRoot(app.getAppPath(),platform);
    const parent = path.dirname(target);
    try{fs.accessSync(parent, fs.constants.W_OK);}catch{throw new Error('Move SuperSurfer.app to a folder you can edit before installing this build.');}
    if(!automatic){
      const answer = await dialog.showMessageBox(getWindow(), {type:'question', buttons:['Cancel','Install and restart'], defaultId:0, cancelId:0, title:'Restart with your changes?', message:'Install the verified SuperSurfer build and restart?', detail:'All app windows will close. Save open editor files first. The connected workspace service will also restart to load the new build; active agent turns may be interrupted and are not replayed. Your workspace data stays in its current location, and a backup of this app is retained.'});
      if (answer.response !== 1) return {cancelled:true};
    }
    const updateRoot = fs.mkdtempSync(path.join(parent, '.supersurfer-update-'));
    const staged = path.join(updateRoot, 'SuperSurfer.app');
    try {
      await run('/usr/bin/ditto', [prepared.candidate, staged], {timeout:5*60*1000});
      await verifyMacApp(staged, prepared.version, prepared.fingerprint);
      const backup = path.join(parent, `.SuperSurfer-backup-${randomUUID()}.app`);
      const helper = path.join(__dirname, 'customize-restart.sh');
      authorizeWorkspaceUpgrade(stateFile,prepared.workspaceConfig,fs.readFileSync(path.join(staged,'Contents','Resources','app','desktop','remote.tar.gz')));
      fs.writeFileSync(statusFile, 'waiting for current app to close\n', {mode:0o600});
      const child = spawn('/bin/sh', [helper, String(process.pid), target, staged, backup, statusFile], {detached:true, stdio:'ignore'});
      await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
      child.unref();
      if(prepared.snapshot)try{fs.rmSync(path.dirname(prepared.source),{recursive:true,force:true});}catch{}
      prepared = null;
      setTimeout(quit, 100);
      return {restarting:true};
    } catch (error) { clearWorkspaceUpgrade(stateFile);fs.rmSync(updateRoot, {recursive:true,force:true}); throw error; }
  }
  async function setAutomaticUpdate({connection,projectId}) {
    if(projectId===null){writeState(stateFile,{...state(),automaticProjectId:null,automaticOrigin:null,automaticRepo:null,automaticError:null,failedFingerprint:null});return status();}
    if(platform!=='darwin'||!app.isPackaged||!connection||typeof projectId!=='string'||!/^[A-Za-z0-9_:-]{1,128}$/.test(projectId))throw new Error('Choose a connected SuperSurfer source project in the packaged Mac app.');
    const url=new URL('/api/app-source/fingerprint',connection.origin);url.searchParams.set('project_id',projectId);
    const response=await fetch(url,{headers:{Authorization:'Bearer '+connection.token},redirect:'error',signal:AbortSignal.timeout(120000)});
    if(!response.ok)throw new Error('The selected workspace project is not a valid SuperSurfer source checkout.');
    const source=await response.json();
    if(!/^[a-f0-9]{16}$/.test(source.fingerprint)||typeof source.source_root!=='string'||!source.source_root.startsWith('/'))throw new Error('The selected source identity is invalid.');
    const answer=await dialog.showMessageBox(getWindow(),{type:'warning',buttons:['Cancel','Enable automatic updates'],defaultId:0,cancelId:0,title:'Allow automatic SuperSurfer updates?',message:'Build and install future saved source changes without another prompt?',detail:'Only this connected source project is trusted. The app verifies each build and keeps a backup before restarting. Save editor changes often; an automatic restart closes all windows and restarts this connected workspace service. Active agent turns may be interrupted and are not replayed.'});
    if(answer.response!==1)return {...status(),cancelled:true};
    writeState(stateFile,{...state(),automaticProjectId:projectId,automaticOrigin:connection.origin,automaticRepo:source.source_root,automaticError:null,failedFingerprint:null});
    return status();
  }
  async function checkAutomaticUpdate(connection) {
    const saved=state();
    if(automaticChecking||busy||prepared||!saved.automaticProjectId||!connection||saved.automaticOrigin!==connection.origin||platform!=='darwin'||!app.isPackaged)return null;
    automaticChecking=true;
    let fingerprint=null;
    try{
      const url=new URL('/api/app-source/fingerprint',connection.origin);url.searchParams.set('project_id',saved.automaticProjectId);
      const response=await fetch(url,{headers:{Authorization:'Bearer '+connection.token},redirect:'error',signal:AbortSignal.timeout(120000)});
      if(!response.ok)throw new Error(`Could not inspect trusted source (${response.status}).`);
      const source=await response.json();
      fingerprint=source.fingerprint;
      if(!/^[a-f0-9]{16}$/.test(fingerprint))throw new Error('Trusted source returned an invalid fingerprint.');
      if(source.source_root!==saved.automaticRepo)throw new Error('The trusted source project moved. Turn automatic updates off and re-enable it for the new checkout.');
      if(fingerprint===status().installedFingerprint||fingerprint===saved.failedFingerprint)return null;
      if(source.clean!==true)return {waiting:'Automatic updates wait for a clean committed source checkout.'};
      await build({connection,projectId:saved.automaticProjectId,automatic:true});
      if(prepared?.fingerprint!==fingerprint)throw new Error('Trusted source changed during the build; waiting for its next saved revision.');
      writeState(stateFile,{...state(),automaticError:null,failedFingerprint:null});
      return await apply({automatic:true});
    }catch(error){
      writeState(stateFile,{...state(),automaticError:error.message,failedFingerprint:fingerprint});
      return {error:error.message};
    }finally{
      automaticChecking=false;
    }
  }
  const upgrade=(config,consume=false)=>workspaceUpgrade(stateFile,config,fs.readFileSync(path.join(app.getAppPath(),'desktop','remote.tar.gz')),consume);
  return {status, chooseSource, build, apply, setAutomaticUpdate, checkAutomaticUpdate,authorizeWorkspaceUpgrade:config=>authorizeWorkspaceUpgrade(stateFile,config,fs.readFileSync(path.join(app.getAppPath(),'desktop','remote.tar.gz'))),workspaceUpgrade:config=>upgrade(config),workspaceConnected:config=>upgrade(config,true)};
}
module.exports = {sourcePackage, installedAppRoot, verifyMacApp, workspaceSource, createCustomize};
