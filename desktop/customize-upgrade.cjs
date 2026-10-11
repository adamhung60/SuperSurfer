'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {validateConfig}=require('./connection.cjs');
const digest=bundle=>createHash('sha256').update(bundle).digest('hex');
function read(file){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return {};}}
function write(file,state){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(state),{mode:0o600});fs.renameSync(file+'.tmp',file);}
function authorizeWorkspaceUpgrade(file,config,bundle){
 if(!config){clearWorkspaceUpgrade(file);return;}
 write(file,{...read(file),pendingWorkspaceUpgrade:{config:validateConfig(config),bundle:digest(bundle),expires:Date.now()+24*60*60*1000}});
}
function workspaceUpgrade(file,config,bundle,consume=false){
 const state=read(file),grant=state.pendingWorkspaceUpgrade;
 if(!grant||!Number.isFinite(grant.expires)||grant.expires<Date.now()||grant.bundle!==digest(bundle))return false;
 try{if(JSON.stringify(validateConfig(grant.config))!==JSON.stringify(validateConfig(config)))return false;}catch{return false;}
 if(consume){delete state.pendingWorkspaceUpgrade;write(file,state);}
 return true;
}
function clearWorkspaceUpgrade(file){const state=read(file);delete state.pendingWorkspaceUpgrade;write(file,state);}
module.exports={authorizeWorkspaceUpgrade,workspaceUpgrade,clearWorkspaceUpgrade};
