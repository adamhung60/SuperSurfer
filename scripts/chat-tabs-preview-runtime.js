// Synthetic API used only by preview-chat-tabs.cjs. No accounts or live work.
(()=>{
 const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};};
 Object.defineProperty(window,'localStorage',{value:storage()});Object.defineProperty(window,'sessionStorage',{value:storage()});
 localStorage.setItem('supersurfer-workspace',JSON.stringify({view:'workspace',projectId:'preview',experimentId:'sample',tab:'overview',chatVisible:true,chatMaximized:true}));
 const project={id:'preview',name:'Chat preview',repo:'Isolated sample workspace',initialized:true,surfboard:{workflow:'software',name:'Software engineering',item_label:'Feature'}};
 const exp={id:'sample',project_id:'preview',name:'Chat tabs',status:'draft',markdown:'',version:1};
 const data={connected:true,read_only:false,projects:[project],experiments:[exp],agents:[],runs:[],hosts:[],queue:{paused:false,run_ids:[]},monitoring:{},settings:{models:{},reasoning:{},approval_mode:'ask',timezone:'America/New_York'}};
 const chats=new Map([['experiment:sample',{name:'New chat',messages:[]}],['conversation:layout',{name:'Layout ideas',messages:[{id:'sample-user',role:'user',text:'Keep conversations easy to switch between.',created:1},{id:'sample-reply',role:'assistant',text:'Each conversation now has a tab. Try typing a draft, switching tabs, and coming back.',created:2}]}],['conversation:review',{name:'Review',messages:[]}]]);
 let selected='experiment:sample';
 const directory=()=>({selected_scope:selected,agents:[...chats].map(([scope,c])=>({scope,name:c.name,owner:'supersurfer',status:'idle',archived:!!c.archived}))});
 window.fetch=async(input,options={})=>{
  const url=new URL(String(input),location.href),endpoint=url.pathname.split('/api/')[1];let body={};
  if(!endpoint)return new Response('Preview blocks external requests',{status:403});
  if(endpoint==='state')body=data;
  else if(endpoint==='account')body={account:{type:'chatgpt'},login_required:false};
  else if(endpoint==='models')body={models:[{id:'preview',displayName:'Preview'}]};
  else if(endpoint==='experiment')body=exp;
  else if(['experiment-agents','project-agents'].includes(endpoint))body=directory();
  else if(endpoint==='chat'){
   const c=chats.get(url.searchParams.get('scope'))||{name:'Sample chat',messages:[]};body={busy:false,agent:{name:c.name},messages:c.messages,archived:!!c.archived,questions:[],approvals:[],preferences:{editable:false,defaults:{},overrides:{},effective:{model:'preview'}}};
  }else if(endpoint==='action'){
   const {op,params}=JSON.parse(options.body||'{}');
   if(op==='experiment.agent.select'){selected=params.scope;body=directory();}
   else if(['experiment.agent.create','chat.create'].includes(op)){selected='conversation:sample-'+chats.size;chats.set(selected,{name:'New chat '+chats.size,messages:[]});body={...directory(),scope:selected,experiment_id:exp.id};}
   else if(op==='chat.send'){
    const c=chats.get(params.scope);if(c){c.messages.push({id:crypto.randomUUID(),role:'user',text:params.text,created:Date.now()/1000},{id:crypto.randomUUID(),role:'assistant',text:'Sample reply. This preview does not run agents.',created:Date.now()/1000});}body={accepted:true};
   }else if(op==='chat.rename'){const c=chats.get(params.scope);if(c)c.name=params.name;body=directory();}
   else if(op==='chat.archive'){const c=chats.get(params.scope);if(c)c.archived=params.archived;body=directory();}
   else if(op==='settings.save'){}
   else return new Response(JSON.stringify({error:'This action is unavailable in the isolated preview.'}),{status:400});
  }
  return new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}});
 };
 document.addEventListener('DOMContentLoaded',()=>{
  const banner=document.createElement('div');banner.textContent='INTERACTIVE PREVIEW · Sample chats · No real agent runs';banner.style.cssText='position:fixed;top:0;left:0;right:0;height:28px;text-align:center;background:#eef3e8;color:#35472b;font:11px/28px system-ui;z-index:10000';document.body.append(banner);
 });
})();
