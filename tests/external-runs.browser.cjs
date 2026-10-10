'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');

(async()=>{
 const root=path.resolve(__dirname,'..');
 const child=spawn('python3',['tests/layout_runtime_fixture.py'],{cwd:root,stdio:['pipe','pipe','pipe']});
 let browser,errors='';child.stderr.on('data',chunk=>errors+=chunk);
 try{
  const fixture=await new Promise((resolve,reject)=>{let output='';child.stdout.on('data',chunk=>{output+=chunk;if(output.includes('\n'))resolve(JSON.parse(output.split('\n')[0]));});child.on('exit',code=>reject(new Error(`Fixture stopped ${code}: ${errors}`)));});
  const token=fs.readFileSync(path.join(fixture.directory,'token'),'utf8').trim();
  const base=`http://127.0.0.1:${fixture.port}`;
  const experimentId=fixture.items.research,projectId=fixture.projects.research;
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1280,height:850}});
  const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
  await page.route(`**/api/experiment?id=${experimentId}`,async route=>{
   const response=await route.fetch();const data=await response.json();
   data.external_runs={source_id:'trinity',source_label:'Trinity',observed_at:Date.now()/1000,runs:[
    {id:'idm_rgb_100_seed0',name:'IDM RGB',status:'running',health:'healthy',method:'RGB only',host:'trinity-0-13',gpus:[1],step:1000,total_steps:40000,step_seconds:1,heartbeat_at:Date.now()/1000},
    {id:'vm_hud_100_seed0',name:'VM HUD',status:'failed',health:'failed',health_reason:'Process exited',host:'trinity-0-13',error:'Worker exited before checkpoint'}]};
   await route.fulfill({response,json:data});
  });
  await page.addInitScript(({token,projectId,experimentId})=>{
   sessionStorage.setItem('supersurfer-token',token);
   localStorage.setItem('supersurfer-workspace',JSON.stringify({view:'workspace',projectId,experimentId,tab:'runs',chatVisible:false}));
  },{token,projectId,experimentId});
  await page.goto(base);await page.locator('.external-run').first().waitFor();
  assert.equal(await page.locator('.external-run').count(),1);
  assert.match(await page.locator('.external-run').first().textContent(),/1,000 \/ 40,000 steps · 2%/);
  assert.match(await page.locator('.external-run').first().textContent(),/ETA ≈ 10h 50m/);
  assert.match(await page.locator('.external-run').first().textContent(),/trinity-0-13 · GPU 1/);
  await page.locator('[data-action="filter-runs"][data-filter="failed"]').click();
  assert.equal(await page.locator('.external-run').count(),1);
  assert.match(await page.locator('.external-run').first().textContent(),/Worker exited before checkpoint/);
  assert.deepEqual(pageErrors,[]);
  console.log('PASS external Runs progress, ETA, compute, health and failed filter');
 }finally{child.stdin.end();await browser?.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
