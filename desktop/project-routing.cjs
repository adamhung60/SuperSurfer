'use strict';

function resolveWorkspaceConnection(root,pathAndQuery,body){
  const route=new URL('/api/'+String(pathAndQuery||'').replace(/^\/+/,''),'http://workspace.invalid');
  if(!route.pathname.startsWith('/api/')||route.pathname.includes('..'))throw new Error('Invalid workspace API request.');
  const params=body?.params||body||{};
  const explicitHost=route.searchParams.get('workspace_host_id')||params.workspace_host_id;
  route.searchParams.delete('workspace_host_id');delete params.workspace_host_id;
  if(explicitHost){const connection=root.connections?.get(explicitHost);if(!connection)throw new Error('Reconnect the selected machine before adding a project.');return {route,connection};}
  const projectId=route.searchParams.get('project_id')||params.project_id;
  const experimentId=route.searchParams.get('experiment_id')||params.experiment_id||
    (route.pathname.endsWith('/experiment')||route.pathname.endsWith('/metrics')?route.searchParams.get('id'):null);
  const recordId=route.searchParams.get('id')||params.id;
  const runId=route.searchParams.get('run_id')||params.run_id;
  let connection=(projectId&&root.projectOwners?.get(projectId))||(experimentId&&root.experimentOwners?.get(experimentId))||
    (recordId&&(root.experimentOwners?.get(recordId)||root.projectOwners?.get(recordId)||root.runOwners?.get(recordId)))||
    (runId&&root.runOwners?.get(runId));
  if(runId&&params.before_id&&root.runOwners?.has(params.before_id)&&root.runOwners.get(params.before_id)!==connection)throw new Error('Queue order can only be changed within one workspace.');
  if(!connection){
    const scope=route.searchParams.get('scope')||params.scope||'',match=/^(?:experiment|conversation|project):([^:]+)$/.exec(scope);
    connection=root.scopeOwners?.get(scope);
    if(!connection&&match)connection=root.experimentOwners?.get(match[1])||root.projectOwners?.get(match[1]);
  }
  return {route,connection:connection||root.connection};
}

function mergeWorkspaceStates(root,connections,states){
  const first=states[0]||{};
  root.scopeOwners||=new Map();
  for(let index=0;index<states.length;index++){
    const connection=connections[index],data=states[index],label=connection.config.mode==='local'?'This computer':connection.config.target;
    for(const notice of data.notifications||[])if(notice.scope)root.scopeOwners.set(notice.scope,connection);
    for(const agent of data.agents||[])if(agent.scope)root.scopeOwners.set(agent.scope,connection);
    for(const project of data.projects||[]){project.workspace_host_id=connection.hostId;project.workspace_host_name=label;root.projectOwners.set(project.id,connection);}
    for(const experiment of data.experiments||[])root.experimentOwners.set(experiment.id,connection);
    for(const run of data.runs||[])root.runOwners.set(run.id,connection);
  }
  return {...first,notification_sources:states.flatMap(s=>s.notification_sources||[]),notifications:states.flatMap((s,index)=>(s.notifications||[]).map(row=>({...row,workspace_host_id:connections[index].hostId,workspace_host_name:connections[index].config.mode==='local'?'This computer':connections[index].config.target}))),projects:states.flatMap(s=>s.projects||[]),experiments:states.flatMap(s=>s.experiments||[]),agents:states.flatMap(s=>s.agents||[]),runs:states.flatMap(s=>s.runs||[]),hosts:states.flatMap(s=>s.hosts||[]),workspace_hosts:connections.map(c=>({id:c.hostId,name:c.config.mode==='local'?'This computer':c.config.target,mode:c.config.mode})),connected:states.some(s=>s.connected)};
}

module.exports={resolveWorkspaceConnection,mergeWorkspaceStates};
