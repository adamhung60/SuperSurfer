import {contextMarkup} from './chat-context.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const attachmentFields=['id','kind','project_id','path','label','text'];
// Stored attachments also contain a service-resolved absolute_path. Resubmission
// uses only the original input fields, so the service validates them again.
export const resendAttachments=rows=>(rows||[]).map(row=>Object.fromEntries(attachmentFields.map(key=>[key,row[key]])));

export function createMessageActions({container,getState,send}){
 const drafts=new Map(),dialog=document.createElement('dialog');
 dialog.className='modal message-edit-dialog';dialog.setAttribute('aria-labelledby','message-edit-title');
 document.body.append(dialog);
 let active=null,sending=false;
 const key=(scope,id)=>JSON.stringify([scope,id]);
 const eligible=message=>message?.role==='user'&&typeof message.id==='string'&&typeof message.text==='string'&&message.status!=='steering';
 function markup(message){
  const state=getState();
  if(!eligible(message)||!state.scope||state.scope.startsWith('agent:'))return '';
  return `<div class="message-actions" data-message-id="${escape(message.id)}" data-message-scope="${escape(state.scope)}"><button type="button" data-message-action="edit" ${state.disabledReason?'disabled':''}>Edit and resend</button><button type="button" data-message-action="resend" ${state.disabledReason?'disabled':''}>Resend</button></div>`;
 }
 function remember(){if(active?.mode==='edit')drafts.set(key(active.scope,active.id),dialog.querySelector('textarea').value);}
 function close(discard=false){
  if(sending)return;
  if(discard&&active)drafts.delete(key(active.scope,active.id));else remember();
  dialog.close();active=null;
 }
 function update(){
  const state=getState();
  container.querySelectorAll('[data-message-action]').forEach(button=>{button.disabled=!!state.disabledReason;button.title=state.disabledReason||'';});
  if(!active)return;
  if(state.scope!==active.scope){if(!sending)close();return;}
  const message=(state.messages||[]).find(row=>row.id===active.id);
  const reason=state.disabledReason||(!eligible(message)?'This message is no longer available.':'');
  const button=dialog.querySelector('[data-message-submit]');
  button.disabled=sending||!!reason||!dialog.querySelector('textarea').value.trim();
  button.textContent=sending?'Sending…':state.busy?'Send direction again':'Send again';
  dialog.querySelector('[data-message-cancel]').disabled=sending;
  dialog.querySelector('textarea').readOnly=sending||active.mode==='resend';
  dialog.querySelector('[data-message-note]').textContent=reason|| (state.busy?'Adds direction to the active turn. Original messages and replies stay in the conversation.':'Sends a new message in this conversation. Original messages and replies stay in place.');
 }
 function open(id,mode){
  const state=getState(),message=(state.messages||[]).find(row=>row.id===id);
  if(state.disabledReason||state.scope?.startsWith('agent:')||!eligible(message)||sending)return;
  active={scope:state.scope,id,mode,attachments:resendAttachments(message.attachments)};
  const value=mode==='edit'?(drafts.get(key(state.scope,id))??message.text):message.text;
  dialog.innerHTML=`<div class="modal-body"><h2 id="message-edit-title">${mode==='edit'?'Edit and resend':'Resend message'}</h2><p class="modal-description" data-message-note></p>${message.status==='uncertain'?'<p class="notice warn">The earlier delivery was not confirmed. It may already have reached the agent; sending again can repeat work.</p>':''}<label class="field"><span>Message</span><textarea rows="7" maxlength="100000" aria-label="${mode==='edit'?'Edit message':'Message to resend'}">${escape(value)}</textarea></label>${active.attachments.length?`<div class="message-resend-context"><p>Original attachments will be included.</p>${contextMarkup(message.attachments)}</div>`:''}<p class="message-resend-error" role="alert" hidden></p><div class="modal-footer"><button class="button" type="button" data-message-cancel>Cancel</button><button class="button primary" type="button" data-message-submit>Send again</button></div></div>`;
  dialog.querySelector('[data-message-cancel]').onclick=()=>close(true);
  dialog.querySelector('[data-message-submit]').onclick=submit;
  dialog.querySelector('textarea').oninput=()=>{remember();update();};
  update();dialog.showModal();dialog.querySelector(mode==='edit'?'textarea':'[data-message-submit]').focus();
 }
 async function submit(){
  update();if(!active||sending||dialog.querySelector('[data-message-submit]').disabled)return;
  const original=active,text=dialog.querySelector('textarea').value.trim(),error=dialog.querySelector('[role="alert"]');
  remember();sending=true;error.hidden=true;update();
  try{
   const accepted=await send({scope:original.scope,text,attachments:original.attachments});
   if(!accepted)throw new Error('Message was not sent. Your draft is kept. Check the conversation status and try again.');
   drafts.delete(key(original.scope,original.id));sending=false;dialog.close();active=null;
  }catch(failure){sending=false;error.textContent=failure.message||'Could not send the message.';error.hidden=false;update();}
 }
 container.addEventListener('click',event=>{
  const button=event.target.closest('[data-message-action]'),row=button?.closest('[data-message-id]');
  if(row&&row.dataset.messageScope===getState().scope&&!button.disabled)open(row.dataset.messageId,button.dataset.messageAction);
 });
 dialog.addEventListener('cancel',event=>{event.preventDefault();close(true);});
 dialog.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key==='Enter'){event.preventDefault();void submit();}});
 return {markup,update};
}
