'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{EventEmitter}=require('node:events');
const {createVoice,validateVoice}=require('../desktop/notification-voice.cjs');
async function model(){return import('data:text/javascript;base64,'+fs.readFileSync(require.resolve('../ui/notifications.js')).toString('base64'));}
test('notifications baseline quietly, badge decisions, dedup, persist read and source isolation',async()=>{
 const {createNotificationModel}=await model();const m=createNotificationModel();const row={id:'h:q',kind:'question',source_id:'h',pending:true,created:1};
 assert.deepEqual(m.observe([row],['h']),[]);assert.equal(m.unread(),1);m.markAll();assert.equal(m.unread(),0);
 const done={id:'h:t',kind:'complete',source_id:'h',pending:false,created:2};assert.deepEqual(m.observe([row,done],['h']),[done]);assert.deepEqual(m.observe([row,done],['h']),[]);
 const other={...done,id:'remote:t',source_id:'remote'};assert.deepEqual(m.observe([row,done,other],['h','remote']),[]);assert.equal(m.unread(),1);
 const restored=createNotificationModel(m.snapshot());assert.deepEqual(restored.observe([row,done,other],['h','remote']),[]);assert.equal(restored.unread(),1);
});
test('native speech uses fixed British voice, stdin, queue and cross-window event dedup',async()=>{
 const launches=[];function launch(command,args,opts){const child=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new EventEmitter();child.stdin.end=text=>{launches.push({command,args,opts,text});setImmediate(()=>child.emit('close',0));};return child;}
 const voice=createVoice({launch,platform:'darwin'});await Promise.all([voice.speak({id:'a',text:'Please approve.'}),voice.speak({id:'b',text:'Task complete.',rate:150})]);assert.equal(launches.length,2);assert.deepEqual(launches[0].args,['-v','Daniel','-r','175']);assert.equal(launches[0].text,'Please approve.');assert.deepEqual(await voice.speak({id:'a',text:'Duplicate.'}),{duplicate:true});
 assert.throws(()=>validateVoice({id:'x',text:'[[rate 0]]'}));assert.throws(()=>validateVoice({id:'x',text:'Okay',rate:1}));
 await assert.rejects(createVoice({platform:'linux'}).speak({id:'a',text:'Hello'}),/macOS/);
});
