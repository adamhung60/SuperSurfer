'use strict';
const detachedUpdateMessage='A new workspace version was uploaded, but this workspace uses a detached service.';
async function connectWorkspace({connect,customize,dialog,getWindow,config,onStatus,signal}) {
 const attempt=()=>connect(config,onStatus,{signal,customizeUpgrade:customize.workspaceUpgrade(config)});
 let result;
 try { result=await attempt(); }
 catch(error) {
  if(!error.message.includes(detachedUpdateMessage)||signal?.aborted)throw error;
  const answer=await dialog.showMessageBox(getWindow(),{type:'question',buttons:['Cancel','Restart workspace'],defaultId:0,cancelId:0,title:'Apply the installed workspace update?',message:'Restart this connected workspace to use the installed app version?',detail:'The authenticated workspace owner will be verified before stopping it. Active agent turns may be interrupted and are not replayed. Workspace data stays in place; failed startup restores the previous service.'});
  if(answer.response!==1||signal?.aborted)throw error;
  customize.authorizeWorkspaceUpgrade(config);
  result=await attempt();
 }
 customize.workspaceConnected(config);
 return result;
}
module.exports={connectWorkspace};
