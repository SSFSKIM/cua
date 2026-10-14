import {execFileSync} from 'node:child_process';
export function descendants(rows,root){const owned=new Set([root]);let changed=true;while(changed){changed=false;for(const row of rows)if(owned.has(row.ppid)&&!owned.has(row.pid)){owned.add(row.pid);changed=true;}}return rows.filter(r=>r.pid!==root&&owned.has(r.pid));}
export function ownedProcesses(pid){
 const rows=execFileSync('ps',['-axo','pid=,ppid=,comm='],{encoding:'utf8'}).trim().split('\n').map(line=>{const match=line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);return match?{pid:Number(match[1]),ppid:Number(match[2]),comm:match[3]}:null;}).filter(Boolean);
 return descendants(rows,pid);
}
// The kernel role is an owned interpreter launched for this session's working directory and entry module. Linux
// Node reports comm=MainThread, so comm is never an executable identity. Wrappers mentioning the same argv do not
// start with the selected interpreter. The two entry layouts are the host interface, not a vendor-only assumption.
export function selectOwnedKernel(rows,root,{host,cwd,nodePath}){
 const entry=host==='vendor'?/\/kernel\.js(?: |$)/:/\/src\/repl-host\/kernel\.mjs(?: |$)/;
 const candidates=descendants(rows,root).filter(p=>p.command?.startsWith(`${nodePath} `)&&entry.test(p.command)&&p.command.includes(` --working-dir ${cwd}`)&&
   (p.command.endsWith(` --working-dir ${cwd}`)||p.command.includes(` --working-dir ${cwd} `)));
 if(candidates.length!==1)throw new Error(candidates.length?'Owned kernel role is ambiguous':'No owned kernel found');return candidates[0];
}
export function killOwnedKernel(pid,cwd,{host,nodePath}){
 const inspect=()=>ownedProcesses(pid).flatMap(p=>{try{return [{...p,command:execFileSync('ps',['-ww','-p',String(p.pid),'-o','command='],{encoding:'utf8'}).trim()}];}catch{return [];}});
 const kernel=selectOwnedKernel(inspect(),pid,{host,cwd,nodePath});
 if(selectOwnedKernel(inspect(),pid,{host,cwd,nodePath}).pid!==kernel.pid)throw new Error('Kernel ownership changed');
 process.kill(kernel.pid,'SIGKILL');return kernel.pid;
}
export function alive(pid){try{process.kill(pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;throw e;}}
