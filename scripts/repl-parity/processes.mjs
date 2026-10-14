import {execFileSync} from 'node:child_process';
export function descendants(rows,root){const owned=new Set([root]);let changed=true;while(changed){changed=false;for(const row of rows)if(owned.has(row.ppid)&&!owned.has(row.pid)){owned.add(row.pid);changed=true;}}return rows.filter(r=>r.pid!==root&&owned.has(r.pid));}
export function ownedProcesses(pid){
 const rows=execFileSync('ps',['-axo','pid=,ppid=,comm='],{encoding:'utf8'}).trim().split('\n').map(line=>{const match=line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);return match?{pid:Number(match[1]),ppid:Number(match[2]),comm:match[3]}:null;}).filter(Boolean);
 return descendants(rows,pid);
}
export function killOwnedKernel(pid,cwd){
 for(const child of ownedProcesses(pid)){
  if(!/(^|\/)node(?:js)?$/.test(child.comm))continue;
  let command;try{command=execFileSync('ps',['-p',String(child.pid),'-o','command='],{encoding:'utf8'});}catch{continue;}
  if(command.includes('/kernel.js')&&command.includes(cwd)){
   // Recheck ancestry immediately before signalling; no name-wide kills, ever.
   if(!ownedProcesses(pid).some(p=>p.pid===child.pid))throw new Error('Kernel ownership changed');
   process.kill(child.pid,'SIGKILL');return child.pid;
  }
 }
 throw new Error('No owned kernel found');
}
export function alive(pid){try{process.kill(pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;throw e;}}
