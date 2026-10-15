// Fixture-only control adapter. Production proxy deliberately hides turn_ended; this forwards an explicit harness
// method to that private host tool so repeated/in-flight notifications exercise the host, not proxy deduplication.
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
const [command,...args]=JSON.parse(process.env.PARITY_HOST_COMMAND);
const child=spawn(command,args,{env:process.env,cwd:process.cwd(),stdio:['pipe','pipe','inherit']});
child.stdout.pipe(process.stdout);
createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line);
 if(m.method==='parity/turn-ended'){m.method='tools/call';m.params={name:'turn_ended',arguments:m.params};}
 child.stdin.write(JSON.stringify(m)+'\n');
}).on('close',()=>child.stdin.end());
child.on('exit',(code)=>{process.exitCode=code??1;});
