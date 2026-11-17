import {spawn,spawnSync} from 'node:child_process';
export function parseCpu(text) {
 return text.trim().split('\n').flatMap(line=>{const m=/^\s*(\d+)\s+([\d.]+)\s+([\d:.]+)\s*$/.exec(line);if(!m)return [];const parts=m[3].split(':').map(Number);return [{pid:Number(m[1]),percent:Number(m[2]),cpuSeconds:parts.reduce((n,p)=>n*60+p,0)}];});
}
export function cpuUsageBetween(before,after) {
 if(!before||!after||after.at<=before.at||!before.workers.length||before.workers.length!==after.workers.length)return null;
 if((before.expected!==undefined&&before.workers.length!==before.expected)||(after.expected!==undefined&&after.workers.length!==after.expected))return null;
 let seconds=0;for(const a of before.workers){const b=after.workers.find(b=>b.pid===a.pid);if(!b||!Number.isFinite(b.cpuSeconds)||b.cpuSeconds<a.cpuSeconds)return null;seconds+=b.cpuSeconds-a.cpuSeconds;}
 return seconds*100000/(after.at-before.at);
}
export async function startCpu2() {
 if(process.env.RUNNER_ENVIRONMENT!=='github-hosted')throw Error('hosted load only');
 const cores=Number(spawnSync('/usr/sbin/sysctl',['-n','hw.ncpu'],{encoding:'utf8'}).stdout.trim());
 if(!Number.isInteger(cores)||cores<1)throw Error('logical core count unavailable');
 // Exact hosted parity cpu:2 recipe: two normal-priority yes burners per logical core, no inherited fd 3.
 const workers=Array.from({length:cores*2},()=>spawn('/usr/bin/yes',[],{stdio:['ignore','ignore','ignore']})),pids=workers.map(w=>w.pid);
 if(pids.some(p=>!Number.isInteger(p)))throw Error('burner failed to launch');
 const sample=()=>{const result=spawnSync('/bin/ps',['-p',pids.join(','),'-o','pid=,pcpu=,time='],{encoding:'utf8',timeout:10000});return {at:Date.now(),workers:parseCpu(result.stdout??''),expected:pids.length,status:result.status};};
 await new Promise(ok=>setTimeout(ok,1000));
 return {sample,stop:async()=>{const final=sample();for(const w of workers)if(w.exitCode===null&&w.signalCode===null)w.kill('SIGTERM');return {recipe:'cpu:2',cores,burners:workers.length,pids,final};}};
}
