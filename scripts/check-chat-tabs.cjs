'use strict';
const {spawnSync}=require('node:child_process'),fs=require('node:fs');
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const env={...process.env,...(!process.env.CHROME_PATH&&fs.existsSync(chrome)?{CHROME_PATH:chrome}:{})};
for(const [command,args] of [['node',['--check','ui/app.js']],['node',['tests/chat-tabs.browser.cjs']],['python3',['scripts/check-agent-skills.py']],['git',['diff','--check']]]){
 const result=spawnSync(command,args,{stdio:'inherit',env});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);
}
