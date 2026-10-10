'use strict';
const {spawn}=require('node:child_process');
// Fixed voice and stdin prevent user-authored lines from becoming shell flags or speech commands.
function validateVoice(fields){
 if(!fields||typeof fields.id!=='string'||fields.id.length>500||typeof fields.text!=='string'||!fields.text.trim()||fields.text.length>240||/[\x00-\x1f]|\[\[|\]\]/.test(fields.text))throw new Error('Use a voice line of 1–240 plain-text characters.');
 const rate=Number(fields.rate??175);if(!Number.isFinite(rate)||rate<120||rate>220)throw new Error('Voice speed must be 120–220 words per minute.');
 return {id:fields.id,text:fields.text.trim(),rate:Math.round(rate)};
}
function createVoice({launch=spawn,platform=process.platform}={}){
 let active=null;const queue=[],seen=new Map();
 function next(){
  if(active||!queue.length)return;
  const fields=queue.shift();active=launch('/usr/bin/say',['-v','Daniel','-r',String(fields.rate)],{stdio:['pipe','ignore','pipe']});
  const child=active;let error='',finished=false;child.stderr.on('data',chunk=>{error=(error+chunk).slice(0,1000);});
  const finish=(failure)=>{if(finished)return;finished=true;if(active===child)active=null;child.notificationStopped?fields.resolve({stopped:true}):failure?fields.reject(new Error('British voice unavailable: '+failure)):fields.resolve({spoken:true});next();};
  child.once('error',err=>finish(err.message));child.once('close',code=>finish(code===0?null:error||'speech process exited'));
  child.stdin.on('error',()=>{});child.stdin.end(fields.text);
 }
 return {
  speak(input){const fields=validateVoice(input);if(platform!=='darwin')return Promise.reject(new Error('Daniel voice alerts are available on macOS.'));
   const now=Date.now();for(const [id,at] of seen)if(now-at>3600000)seen.delete(id);
   if(seen.has(fields.id))return Promise.resolve({duplicate:true});
   if(queue.length>=8)return Promise.reject(new Error('Voice alert queue is full.'));
   seen.set(fields.id,now);return new Promise((resolve,reject)=>{queue.push({...fields,resolve,reject});next();});},
  stop(){for(const item of queue.splice(0))item.resolve({stopped:true});if(active){active.notificationStopped=true;active.kill();}}
 };
}
module.exports={createVoice,validateVoice};
