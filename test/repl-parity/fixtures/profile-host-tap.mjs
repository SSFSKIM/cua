// Harness-owned pass-through; records only the bounded profiles host observation.
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {writeFileSync} from 'node:fs';
import {profileObserver} from '../../../scripts/repl-parity/profile-observer.mjs';
const [command,...args]=JSON.parse(process.env.CUA_PARITY_PROFILE_COMMAND);
const observer=profileObserver(),child=spawn(command,args,{env:process.env,stdio:['pipe','pipe','inherit']});
child.stdin.on('error',()=>{});
for(const [input,output,observe] of [[process.stdin,child.stdin,'request'],[child.stdout,process.stdout,'response']]){
 const lines=createInterface({input});lines.on('line',line=>{try{observer[observe](JSON.parse(line));output.write(line+'\n');if(observe==='response'){try{writeFileSync(process.env.CUA_PARITY_PROFILE_PROOF,JSON.stringify(observer.proof()),{mode:0o600});}catch(e){if(!e.message.startsWith('Missing initialized'))throw e;}}}catch{process.exitCode=1;child.kill('SIGTERM');}});
 if(input===process.stdin)lines.on('close',()=>child.stdin.end());
}
child.on('error',()=>{process.exitCode=1;});child.on('exit',(code)=>{process.exitCode??=code??1;process.stdin.destroy();});
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>child.kill(signal));
