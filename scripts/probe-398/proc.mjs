// Process helpers, copied from ../probe-414/platform.mjs (probe/414-qual): owned children with a one-question-at-a-time
// JSON-line channel, a bounded stop, and the minimal environment every owned process gets. Disposable kit.
import {spawn,execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';

export const pause=ms=>new Promise(ok=>setTimeout(ok,ms));
export async function until(fn,ms=15000){
  const deadline=performance.now()+ms;
  do{const r=await fn();if(r)return r;await pause(100);}while(performance.now()<deadline);
  throw Error('condition timeout');
}
export function environment(home){
  const allowed=['PATH','LANG','LC_ALL','USER','LOGNAME','__CF_USER_TEXT_ENCODING'];
  return {...Object.fromEntries(allowed.filter(k=>process.env[k]).map(k=>[k,process.env[k]])),
    HOME:home,TMPDIR:home,RUNNER_ENVIRONMENT:'github-hosted'};
}
export function owned(bin,args,env,{stdout=()=>{},stderr=()=>{}}={}){
  const child=spawn(bin,args,{env,stdio:['pipe','pipe','pipe']});
  let ended=false,pending=null;
  const broken=()=>{ended=true;pending?.finish(null);};
  child.closed=new Promise(ok=>child.once('close',()=>{broken();ok(true);}));
  child.on('error',broken);child.stdin.on('error',broken);
  createInterface({input:child.stdout}).on('line',line=>{
    stdout(line);
    if(!pending)return;
    let r;try{r=JSON.parse(line);}catch{return;}
    if(pending.matches(r))pending.finish(r);
  });
  createInterface({input:child.stderr}).on('line',stderr);
  child.ask=(q,matches=()=>true,ms=10000)=>{
    if(ended||pending)throw Error('owned helper unavailable');
    return new Promise((ok,no)=>{
      const t=setTimeout(()=>{ended=true;pending?.finish(null);},ms);
      pending={matches,finish:r=>{clearTimeout(t);pending=null;if(r)ok(r);else no(Error('owned helper timeout'));}};
      child.stdin.write(JSON.stringify(q)+'\n');
    });
  };
  return child;
}
export async function stop(child){
  if(!child)return true;
  if(child.pid&&child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');
  const stopped=await Promise.race([child.closed,pause(3000).then(()=>false)]);
  if(!stopped)child.kill('SIGKILL');
  return stopped;
}
export const plistVersion=bundle=>execFileSync('/usr/libexec/PlistBuddy',['-c','Print :CFBundleShortVersionString',bundle+'/Contents/Info.plist'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
