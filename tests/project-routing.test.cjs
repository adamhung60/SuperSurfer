'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {resolveWorkspaceConnection,mergeWorkspaceStates}=require('../desktop/project-routing.cjs');

test('projects from connected workspaces are combined and retain their owning host',()=>{
 const local={hostId:'local',config:{mode:'local',target:''}},remote={hostId:'gpu',config:{mode:'remote',target:'gpu-01'}};
 const root={connection:local,connections:new Map([['local',local],['gpu',remote]]),projectOwners:new Map(),experimentOwners:new Map(),runOwners:new Map()};
 const merged=mergeWorkspaceStates(root,[local,remote],[
  {connected:true,projects:[{id:'p-local',name:'local'}],experiments:[{id:'e-local',project_id:'p-local'}],runs:[{id:'r-local',project_id:'p-local'}]},
  {connected:true,projects:[{id:'p-gpu',name:'gpu'}],experiments:[{id:'e-gpu',project_id:'p-gpu'}],runs:[{id:'r-gpu',project_id:'p-gpu'}]}
 ]);
 assert.deepEqual(merged.projects.map(project=>project.id),['p-local','p-gpu']);
 assert.equal(merged.projects[1].workspace_host_id,'gpu');
 assert.equal(merged.projects[1].workspace_host_name,'gpu-01');
 assert.equal(resolveWorkspaceConnection(root,'code/file?project_id=p-gpu').connection,remote);
 assert.equal(resolveWorkspaceConnection(root,'chat',{op:'action',params:{scope:'experiment:e-gpu'}}).connection,remote);
 assert.equal(resolveWorkspaceConnection(root,'run-metrics?id=r-gpu').connection,remote);
 assert.equal(resolveWorkspaceConnection(root,'state').connection,local);
});

test('adding a project targets the selected host and strips desktop routing metadata',()=>{
 const local={hostId:'local'},remote={hostId:'gpu'};
 const root={connection:local,connections:new Map([['local',local],['gpu',remote]]),projectOwners:new Map(),experimentOwners:new Map(),runOwners:new Map()};
 const body={op:'action',params:{op:'project.add',workspace_host_id:'gpu',name:'demo'}};
 const route=resolveWorkspaceConnection(root,'action',body);
 assert.equal(route.connection,remote);
 assert.equal(Object.hasOwn(body.params,'workspace_host_id'),false);
 assert.throws(()=>resolveWorkspaceConnection(root,'action',{op:'action',params:{workspace_host_id:'disconnected'}}),/Reconnect the selected machine/);
});
