// Fixture-only adapter for private turn_ended. Witnesses are written by the fixture hook as its final action.
// Host results are otherwise untouched; the runner extracts this adapter's metadata into separate timing/proof fields.
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
const [command,...args]=JSON.parse(process.env.PARITY_HOST_COMMAND),observed=new Set();
const child=spawn(command,args,{env:process.env,cwd:process.cwd(),stdio:['pipe','pipe','inherit']});
createInterface({input:child.stdout}).on('line',line=>{
 const m=JSON.parse(line);
 if(observed.delete(m.id)&&m.result){
  const ackAtNs=process.hrtime.bigint().toString();let witness=null;
  try{witness=JSON.parse(readFileSync(join(process.cwd(),'.parity-turn-completed.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(Object.hasOwn(m.result._meta??{},'cua/parityTurnObservation'))throw new Error('Host used the fixture observation key');
  const originalMetaPresent=Object.hasOwn(m.result,'_meta');
  m.result._meta={...m.result._meta,'cua/parityTurnObservation':{ackAtNs,completedAtNs:witness?.atNs??null,completedHooks:witness?.count??0,originalMetaPresent}};
 }
 process.stdout.write(JSON.stringify(m)+'\n');
});
createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line);
 if(m.method==='parity/turn-ended'){
  if(m.params._parityWitness)observed.add(m.id);
  const {_parityWitness,...args}=m.params;m.method='tools/call';m.params={name:'turn_ended',arguments:args};
 }
 child.stdin.write(JSON.stringify(m)+'\n');
}).on('close',()=>child.stdin.end());
child.on('exit',code=>{process.exitCode=code??1;});
