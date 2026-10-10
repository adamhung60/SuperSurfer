'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {install}=require('./fixtures/workspace-demo.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],calls=[];
  page.on('pageerror',error=>errors.push(error.message));
  const {data}=await install(page,{tab:'overview'});let busy=false,steerable=true,fail=false,hold=null,archived=false,question=false;
  const attachment={id:'context-one',kind:'code',project_id:'demo-vla',path:'ui/cards.js',label:'Unsaved selection',text:'Unsaved selected text <kept>',absolute_path:'/workspace/ui/cards.js'};
  const messages=[{id:'user-original',role:'user',text:'Make the cards compact. <original>',created:1,attachments:[attachment]},{id:'agent-reply',role:'assistant',text:'Here is the first version.',created:2}];
  await page.route('http://demo.test/api/chat?*',route=>route.fulfill({json:{busy,steerable,archived,messages,agent:{name:'Project agent'},questions:question?[{id:'q',status:'pending',questions:[{id:'q1',question:'Which layout?'}]}]:[],approvals:[],preferences:{editable:true,defaults:{model:'sample',reasoning:'high'},overrides:{},effective:{model:'sample',reasoning:'high'}}}}));
  await page.route('http://demo.test/api/action',async route=>{
   const call=route.request().postDataJSON();calls.push(call);
   if(['chat.send','chat.steer'].includes(call.op)){
    if(hold)await hold;
    if(fail)return route.fulfill({status:503,json:{error:'Connection unavailable'}});
    messages.push({id:'sent-'+messages.length,role:'user',text:call.params.text,attachments:call.params.attachments,created:3});
   }
   return route.fulfill({json:{accepted:true}});
  });
  await page.goto('http://demo.test/');
  const original=page.locator('[data-message-id="user-original"]');
  await original.getByRole('button',{name:'Edit and resend',exact:true}).waitFor();
  await page.locator('#chat-input').fill('Keep my separate composer draft.');
  await original.getByRole('button',{name:'Edit and resend',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Edit and resend',exact:true}),edit=dialog.getByRole('textbox',{name:'Edit message',exact:true});
  assert.equal(await edit.inputValue(),messages[0].text);
  await edit.fill('Make the cards spacious instead.');
  // Chat polling must not replace the editor or steal focus.
  await page.waitForTimeout(3300);assert.equal(await edit.inputValue(),'Make the cards spacious instead.');
  assert.equal(await edit.evaluate(el=>el===document.activeElement),true);
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  assert.equal(calls.filter(call=>call.op==='chat.send').length,0);
  assert.equal(await page.locator('#chat-input').inputValue(),'Keep my separate composer draft.');
  await original.getByRole('button',{name:'Edit and resend',exact:true}).click();
  await edit.fill('Make the cards spacious instead.');
  await dialog.getByRole('button',{name:'Send again',exact:true}).click();
  await dialog.waitFor({state:'hidden'});
  const sent=calls.find(call=>call.op==='chat.send');
  assert.equal(sent.params.text,'Make the cards spacious instead.');
  assert.deepEqual(sent.params.attachments,[Object.fromEntries(Object.entries(attachment).filter(([key])=>key!=='absolute_path'))]);
  assert.equal(messages[0].text,'Make the cards compact. <original>');assert.equal(messages[1].text,'Here is the first version.');
  assert.equal(await page.locator('#chat-input').inputValue(),'Keep my separate composer draft.');
  // Resend uses an explicit review; it does not immediately run work.
  await original.getByRole('button',{name:'Resend',exact:true}).click();
  const resend=page.getByRole('dialog',{name:'Resend message',exact:true});
  assert.equal(await resend.getByRole('textbox').getAttribute('readonly'),'');
  let release;hold=new Promise(resolve=>release=resolve);
  await resend.getByRole('button',{name:'Send again',exact:true}).click();
  await resend.getByRole('button',{name:'Sending…',exact:true}).waitFor();
  await page.keyboard.press('Control+Enter');
  assert.equal(calls.filter(call=>call.op==='chat.send').length,2);
  release();hold=null;await resend.waitFor({state:'hidden'});
  assert.equal(calls.filter(call=>call.op==='chat.send').at(-1).params.text,messages[0].text);
  fail=true;await original.getByRole('button',{name:'Edit and resend',exact:true}).click();await edit.fill('Keep this after failure.');
  await dialog.getByRole('button',{name:'Send again',exact:true}).click();await dialog.getByRole('alert').waitFor();
  assert.equal(await edit.inputValue(),'Keep this after failure.');assert.equal(await dialog.getByRole('button',{name:'Send again',exact:true}).isEnabled(),true);
  fail=false;await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  const refresh=()=>page.getByRole('button',{name:'Refresh connection',exact:true}).click();
  busy=true;await refresh();await page.waitForFunction(()=>document.querySelector('#chat-send').getAttribute('aria-label')==='Steer current work');
  await original.getByRole('button',{name:'Edit and resend',exact:true}).click();await edit.fill('Use the active turn.');
  await dialog.getByRole('button',{name:'Send direction again',exact:true}).click();await dialog.waitFor({state:'hidden'});
  assert.equal(calls.filter(call=>call.op==='chat.steer').length,1);assert.equal(calls.some(call=>call.op==='chat.stop'),false);
  steerable=false;await refresh();await page.waitForFunction(()=>document.querySelector('[data-message-action="edit"]').disabled);
  busy=false;steerable=true;archived=true;await refresh();assert.equal(await original.getByRole('button',{name:'Resend',exact:true}).isDisabled(),true);
  archived=false;question=true;await refresh();assert.equal(await original.getByRole('button',{name:'Resend',exact:true}).isDisabled(),true);
  question=false;data.read_only=true;await refresh();await page.waitForFunction(()=>document.querySelector('[data-message-action="resend"]').disabled);assert.equal(await original.getByRole('button',{name:'Resend',exact:true}).isDisabled(),true);
  data.read_only=false;await refresh();await page.waitForFunction(()=>!document.querySelector('[data-message-action="edit"]').disabled);
  messages[0].status='uncertain';await refresh();await original.getByRole('button',{name:'Resend',exact:true}).click();await resend.getByText(/may already have reached the agent/).waitFor();await resend.getByRole('button',{name:'Cancel',exact:true}).click();
  // Responsive/light/dark visual evidence from the actual app UI.
  const out=process.env.SUPERSURFER_QA_OUTPUT||'/tmp/supersurfer-chat-message-actions';fs.mkdirSync(out,{recursive:true});
  await original.getByRole('button',{name:'Edit and resend',exact:true}).click();
  await edit.fill('Make the project cards easier to scan, with more space between rows.');
  for(const [theme,width] of [['light',1280],['dark',390]]){
   await page.setViewportSize({width,height:900});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   const bounds=await dialog.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1);
   await page.screenshot({path:path.join(out,'edit-resend-'+theme+'.png')});
  }
  assert.deepEqual(errors,[]);
  console.log('PASS edit/cancel, polling, original history, attachment validation shape, composer preservation, resend, duplicate guard, failure draft, active steering, archived/read-only/question gating, uncertain-delivery warning, light/dark responsive layout');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
