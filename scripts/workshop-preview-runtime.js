// Runs only in the isolated workshop preview served by preview-chat.cjs.
// All API calls and native installation are simulated in memory.
(()=>{
 const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};};
 Object.defineProperty(window,'localStorage',{value:storage()});Object.defineProperty(window,'sessionStorage',{value:storage()});
 localStorage.setItem('supersurfer-workspace',JSON.stringify({view:'customize',projectId:'preview-source',experimentId:null,tab:'overview',chatVisible:true,chatWidth:390}));
 localStorage.setItem('supersurfer-agents-expanded','true');
 const project={id:'preview-source',name:'SuperSurfer',repo:'Sample local SuperSurfer checkout',initialized:true,app_source:true,surfboard:{workflow:'software',name:'Software engineering',item_label:'Feature'}};
 const data={connected:true,read_only:false,projects:[project],experiments:[],agents:[],runs:[],hosts:[],queue:{paused:false,run_ids:[]},monitoring:{},settings:{models:{},reasoning:{},approval_mode:'ask'}};
 const chats=new Map([['project:preview-source',{name:'SuperSurfer · Technical lead',messages:[{id:'sample-user',role:'user',text:'Make the project cards easier to scan.',created:1},{id:'sample-agent',role:'assistant',text:'Try Edit and resend below your message, or send a new idea to open a separate chat. This is a simulation: no real agents run and the install button cannot change your app.',created:2}]}]]);
 const status=()=>({platform:'darwin',version:'Preview',installed:'Simulation — no installed app is connected',prepared:null});
 window.superSurferDesktop={getCustomizeStatus:async()=>status(),buildCustomize:async()=>({...status(),prepared:{version:'Preview'}}),applyCustomize:async()=>{alert('Preview only: build, verification, installation and restart are simulated. Your installed app is unchanged.');return {cancelled:true};}};
 window.fetch=async(input,options={})=>{
  const url=new URL(String(input),location.href),endpoint=url.pathname.split('/api/')[1];let body={};
  if(!endpoint)return new Response('Preview does not contact external services',{status:403});
  if(endpoint==='state')body=data;
  else if(endpoint==='account')body={account:{type:'chatgpt'},login_required:false};
  else if(endpoint==='models')body={models:[{id:'preview',displayName:'Simulated agent'}]};
  else if(endpoint==='project-agents')body={agents:[...chats].map(([scope,chat])=>({scope,name:chat.name,owner:'supersurfer',status:'idle'}))};
  else if(endpoint==='chat'){
   const chat=chats.get(url.searchParams.get('scope'))||{name:'Sample agent',messages:[]};
   body={busy:false,agent:{name:chat.name},messages:chat.messages,approvals:[],questions:[],preferences:{editable:true,defaults:{model:'preview'},overrides:{},effective:{model:'preview'}}};
  }else if(endpoint==='action'){
   const {op,params}=JSON.parse(options.body||'{}');
   if(op==='chat.create'){
    const id='sample-'+chats.size,scope='experiment:'+id;chats.set(scope,{name:params.name,messages:[]});data.experiments.push({id,project_id:project.id,name:params.name,status:'draft'});body={experiment_id:id,scope};
   }else if(op==='chat.send'||op==='chat.steer'){
    const chat=chats.get(params.scope);if(!chat)return new Response(JSON.stringify({error:'Sample chat not found'}),{status:404});
    chat.messages.push({id:crypto.randomUUID(),role:'user',text:params.text,attachments:params.attachments,created:Date.now()/1000});
    chat.messages.push({id:crypto.randomUUID(),role:'assistant',text:'Sample message received in this separate chat. No real work was started.',created:Date.now()/1000});body={accepted:true};
   }else if(op==='settings.save'){data.settings.timezone=params.timezone;
   }else if(op==='chat.rename'){const chat=chats.get(params.scope);if(chat)chat.name=params.name;}
   else return new Response(JSON.stringify({error:'This control is outside the interaction preview.'}),{status:400});
  }
  return new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}});
 };
 document.addEventListener('DOMContentLoaded',()=>{
  const banner=document.createElement('div');banner.textContent='INTERACTIVE PREVIEW · Sample chats and simulated installation · No real agent runs';
  banner.style.cssText='position:fixed;top:0;left:0;right:0;text-align:center;background:#eef3e8;color:#35472b;font:11px system-ui;padding:6px;z-index:10000;pointer-events:none';document.body.append(banner);
 });
})();
