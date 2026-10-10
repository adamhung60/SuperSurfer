'use strict';
// Focused, repeatable Surfboard check for the chat/workshop change.
const {spawnSync}=require('node:child_process'),fs=require('node:fs');
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const env={...process.env,TMPDIR:fs.realpathSync(require('node:os').tmpdir()),...(!process.env.CHROME_PATH&&fs.existsSync(chrome)?{CHROME_PATH:chrome}:{})};
for(const [command,args] of [
 ['python3',['-m','unittest','discover','-s','tests','-p','test_new_chat.py','-v']],
 ['node',['--test','tests/customize.test.cjs']],
 ['node',['tests/chat-message-actions.browser.cjs']],
 ['node',['tests/customize.browser.cjs']],
 ['python3',['scripts/check-agent-skills.py']],
 ['git',['diff','--check']],
]){
 const result=spawnSync(command,args,{stdio:'inherit',env});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status||1);
}
