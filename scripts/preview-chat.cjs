'use strict';
// Local, synthetic interaction preview. It serves only these UI assets and never
// connects to an agent, workspace API, account, or native desktop bridge.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const assets=new Set(['chat-message-actions.js','chat-context.js','styles.css']);
const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Edit and resend preview</title><link rel="stylesheet" href="styles.css"><style>
body{display:block;overflow:auto;background:var(--bg);color:var(--text);padding:20px}main{max-width:640px;margin:auto}.preview-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.preview-heading h1{font-size:20px;margin:0}.preview-note{font-size:12px;color:var(--muted);margin:12px 0 20px}.preview-chat{border:1px solid var(--line);border-radius:12px;padding:20px;background:var(--surface)}.preview-chat .message{margin:0 0 22px}.preview-chat .message-text{white-space:pre-wrap}.preview-status{font-size:12px;color:var(--muted);margin-top:12px}.preview-controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:12px}
</style></head><body><main><div class="preview-heading"><h1>Edit and resend messages</h1><button class="button" id="theme">Switch theme</button></div><p class="preview-note">Interactive preview · Sample conversation. Sends are simulated; no agent runs.</p><section class="preview-chat" aria-label="Agent conversation"><div id="messages"></div><div class="preview-controls"><label><input id="busy" type="checkbox"> Agent working</label><label><input id="fail" type="checkbox"> Simulate send failure</label></div><p class="preview-status" role="status" id="status">Try Edit and resend or Resend below your message.</p></section></main><script type="module">
import {createMessageActions} from './chat-message-actions.js';
import {contextMarkup} from './chat-context.js';
const container=document.querySelector('#messages');
const messages=[{id:'sample-user',role:'user',text:'Make the project cards easier to scan. Use a compact layout.',attachments:[{id:'sample-context',kind:'code',project_id:'preview',path:'ui/cards.js',label:'Selected card layout',text:'Sample selected context; original attachments are kept.'}]},{id:'sample-agent',role:'assistant',text:'I’ll adjust the spacing and show you a preview.'}];
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const actions=createMessageActions({container,getState:()=>({scope:'project:preview',messages,busy:document.querySelector('#busy').checked}),send:async ({text,attachments})=>{if(document.querySelector('#fail').checked)throw new Error('Simulated connection error. Your draft is kept.');messages.push({id:'sample-'+messages.length,role:'user',text,attachments});render();document.querySelector('#status').textContent='Sample message sent. Your original message and replies are still here.';return true;}});
function render(){container.innerHTML=messages.map(message=>'<div class="message '+message.role+'"><div class="message-label"><strong>'+ (message.role==='user'?'You':'Project agent')+'</strong><time>Preview</time></div><div class="message-text markdown">'+esc(message.text)+'</div>'+contextMarkup(message.attachments)+actions.markup(message)+'</div>').join('');actions.update();}
document.querySelector('#busy').onchange=()=>actions.update();
document.querySelector('#theme').onclick=()=>document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';
render();
</script></body></html>`;
function start(port=Number(process.env.PORT||8768)){
 const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname.replace(/^\//,'');
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);return res.end();}
  if(!name||name==='index.html'){
   const app=fs.readFileSync(path.join(root,'ui/index.html'),'utf8').replace('<head>','<head><script src="workshop-preview-runtime.js"></script>');
   res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(req.method==='HEAD'?'':app);
  }
  if(name==='message-preview.html'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}
  if(name==='workshop-preview-runtime.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(__dirname,name)));}
  const file=path.resolve(root,'ui',name),uiRoot=path.join(root,'ui')+path.sep;
  if(file.startsWith(uiRoot)&&fs.existsSync(file)&&fs.statSync(file).isFile()&&fs.realpathSync(file).startsWith(uiRoot)){
   res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)]||'application/octet-stream');
   return res.end(req.method==='HEAD'?'':fs.readFileSync(file));
  }
  if(!assets.has(name)){res.writeHead(404);return res.end('Not found');}
  res.setHeader('Content-Type',name.endsWith('.css')?'text/css':'text/javascript');
  res.end(req.method==='HEAD'?'':fs.readFileSync(path.join(root,'ui',name)));
 });
 server.listen(port,'127.0.0.1',()=>console.log('Chat preview listening on http://127.0.0.1:'+server.address().port));
 return server;
}
if(require.main===module)start();
module.exports={start};
