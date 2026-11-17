// #390: unmodified engines, ordinary observation tokens, owned page/cover, no action retries.
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createInterface} from 'node:readline';
import {mkdirSync,readFileSync,writeFileSync,appendFileSync,rmSync,existsSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {FixtureTransport} from '../probe-366/transport.mjs';
import {Wire} from '../probe-366/wire.mjs';
import {plan,judge,summarize,coverage} from './read.mjs';
if(process.env.RUNNER_ENVIRONMENT!=='github-hosted')throw Error('hosted only');
const arg=n=>process.argv[process.argv.indexOf('--'+n)+1],OUT=resolve(arg('out')),browser=arg('browser'),smoke=arg('smoke')==='true',dir=dirname(fileURLToPath(import.meta.url)),fixture=join(dir,'fixture');
const engines={main:arg('main-engine'),fix:arg('fix-engine')},sources={main:arg('main-source'),fix:arg('fix-source')},refs={main:arg('main-ref'),fix:arg('fix-ref')};
const sleep=ms=>new Promise(ok=>setTimeout(ok,Math.max(0,ms)));
async function until(fn,ms=15000){const end=Date.now()+ms;while(Date.now()<end){const v=await fn();if(v)return v;await sleep(25);}throw Error('condition timeout');}
mkdirSync(OUT,{recursive:true});const transport=new FixtureTransport({onEvent:e=>appendFileSync(join(OUT,'transport.jsonl'),JSON.stringify(e)+'\n')});
const server=createServer(async(req,res)=>{try{res.setHeader('Cache-Control','no-store');const u=new URL(req.url,'http://fixture');if(u.pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><div id="root"></div><script src="/bundle.js"></script>');return;}if(u.pathname==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(readFileSync(join(fixture,'bundle.js')));return;}res.setHeader('Content-Type','application/json');if(u.pathname==='/cmd'){transport.poll({pageId:u.searchParams.get('pageId'),timeOrigin:Number(u.searchParams.get('timeOrigin'))},res);return;}if(u.pathname==='/answer'){let s='';for await(const b of req){s+=b;if(s.length>2000000)throw Error('oversized answer');}const a=JSON.parse(s);res.statusCode=(a.op==='ready'?transport.register(a):transport.accept(a))?200:409;res.end('{}');return;}res.statusCode=404;res.end('{}');}catch(e){res.statusCode=500;res.end(JSON.stringify({error:String(e)}));}});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const url='http://127.0.0.1:'+server.address().port+'/';
async function command(q){const n=transport.send(q);try{const a=await until(()=>transport.answer(n));if(a.error)throw Error(a.error);if(a.pageId!==transport.owner.pageId||a.timeOrigin!==transport.owner.timeOrigin)throw Error('owner mismatch');return a;}finally{transport.cancel(n);}}
const helper=spawn(arg('tool'),[],{stdio:['pipe','pipe','inherit']}),waiters=[];
createInterface({input:helper.stdout}).on('line',line=>{const w=waiters.shift();if(!w)return;clearTimeout(w.timer);try{const a=JSON.parse(line);if(a.error)throw Error(a.error);w.ok(a);}catch(e){w.no(e);}});
function ask(q){return new Promise((ok,no)=>{const w={ok,no,timer:setTimeout(()=>no(Error('helper timeout')),15000)};waiters.push(w);helper.stdin.write(JSON.stringify(q)+'\n');});}
async function front(pid){const r=await ask({op:'front',pid});if(r.frontmostPid!==pid)throw Error('frontmost not verified');return r;}
async function stop(child){if(!child||child.exitCode!==null||child.signalCode!==null)return;child.kill('SIGTERM');try{await until(()=>child.exitCode!==null||child.signalCode!==null,5000);}catch{child.kill('SIGKILL');await until(()=>child.exitCode!==null||child.signalCode!==null,3000);}}
const config={browser,smoke,refs,kit:process.env.GITHUB_SHA,image:process.env.ImageVersion,os:execFileSync('sw_vers',['-productVersion'],{encoding:'utf8'}).trim(),startedAt:Date.now(),cells:plan(browser,smoke),judge:'DOM and React value at 0,50,250,1000ms after RPC; same page/timeOrigin/trial',nativeSampling:'CGWindow/frontmost polls every 10ms during RPC, then each DOM checkpoint; sampled, not continuous proof',secret:'production sky wrapper and production file store from the matching pinned source, temp HOME; adapter maps its substituted request to native token; no vendor/service error rewriting tested'};
writeFileSync(join(OUT,'config.json'),JSON.stringify(config,null,2));
let cover,target,engine,w,coverPid,targetPid,safariOwned=false;const rows=[];
try{
 let text='';cover=spawn(join(process.env.RUNNER_TEMP,'Probe366 Cover.app/Contents/MacOS/cover366'),['--cover'],{stdio:['ignore','pipe','inherit']});cover.stdout.on('data',d=>text+=d);coverPid=await until(()=>{try{return JSON.parse(text.trim()).pid;}catch{return null;}});
 const require=createRequire(join(fixture,'package.json')),isElectron=browser.startsWith('electron'),profile=join(OUT,'profile');
 if(browser==='safari'){
  const prior=await ask({op:'lookup',bundle:'com.apple.Safari'});if(prior.pid)throw Error('Safari already running: do not adopt unowned app');
  execFileSync('open',['-a','Safari',url]);targetPid=await until(async()=> (await ask({op:'lookup',bundle:'com.apple.Safari'})).pid);safariOwned=true;
  config.version=execFileSync('/usr/libexec/PlistBuddy',['-c','Print :CFBundleShortVersionString','/Applications/Safari.app/Contents/Info.plist'],{encoding:'utf8'}).trim();
 }else{
  const bin=isElectron?require('electron'):'/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';if(!existsSync(bin))throw Error('browser missing');
  target=isElectron?spawn(bin,[fixture],{env:{...process.env,PROBE366_URL:url,PROBE366_WINDOW_STYLE:browser==='electron-parity'?'maws':'default',PROBE366_PROFILE:profile},stdio:['ignore','pipe','pipe']}):spawn(bin,['--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','--disable-search-engine-choice-screen','--disable-features=Translate','--window-position=0,25','--window-size=650,700',url],{stdio:['ignore','pipe','pipe']});targetPid=target.pid;
  let info='';target.stdout.on('data',d=>{info+=d;appendFileSync(join(OUT,'app-stdout.txt'),d);});target.stderr.on('data',d=>appendFileSync(join(OUT,'app-stderr.txt'),d));
  if(isElectron){await until(()=>info.split('\n').some(l=>{try{return JSON.parse(l).kind==='fixture-ready';}catch{return false;}}));config.version=info.split('\n').map(l=>{try{return JSON.parse(l);}catch{return null;}}).find(x=>x?.kind==='fixture-ready');}else config.version=execFileSync(bin,['--version'],{encoding:'utf8'}).trim();
 }
 await until(()=>transport.clients.size>0,25000);await front(targetPid);await until(async()=>{try{transport.bind((await ask({op:'title',pid:targetPid})).title);return true;}catch{return false;}});
 writeFileSync(join(OUT,'config.json'),JSON.stringify(config,null,2));
 for(const cell of config.cells){
  const home=join(OUT,'homes',randomUUID()),socket=join(process.env.RUNNER_TEMP,'p390.sock'),row={...cell,valid:false,targetPid,coverPid,startedAt:Date.now(),samples:[]};let secret=null;
  mkdirSync(home,{recursive:true});rmSync(socket,{force:true});
  try{
   await front(targetPid);await command({op:'reset',trial:row.id,mode:cell.cell==='guard'?'uppercase':'plain'});
   engine=spawn(engines[cell.head],[],{env:{...process.env,HOME:home,CUA_ENGINE_SOCKET:socket},stdio:['ignore','ignore','pipe']});engine.stderr.on('data',d=>appendFileSync(join(OUT,'engine-stderr.txt'),d));
   w=await Wire.connect(socket);const ping=await w.call('ping',{clientApiVersion:'cua-engine-1',desktop:'shared'});if(ping.error)throw Error('ping '+JSON.stringify(ping.error));
   if(cell.cell!=='foreground')await front(coverPid);
   const obStart=Date.now(),ob=await w.execute('get_app_state',{pid:targetPid,includeScreenshot:false,disableDiff:true});row.observation={startedAt:obStart,endedAt:Date.now(),raw:ob};if(ob.error)throw Error('observation '+JSON.stringify(ob.error));
   const node=ob.result?.nodes?.find(n=>['AXTextField','AXTextArea','AXSearchField'].includes(n.role)&&[n.title,n.description].includes('Probe search'));if(!node?.token)throw Error('ordinary field token missing');
   row.before=await command({op:'clear-events'});if(row.before.active==='search'||row.before.value!==''||row.before.reactValue!=='')throw Error('field setup not unfocused and empty');
   row.nativeBefore=await ask({op:'status',pid:targetPid,coverPid});const want=cell.cell==='foreground'?targetPid:coverPid;if(row.nativeBefore.frontmostPid!==want)throw Error('frontmost precondition lost');if(cell.cell!=='foreground'&&row.nativeBefore.order.targetAboveCover!==false)throw Error('target not behind cover');
   row.expected='value-'+randomUUID().slice(0,8)+'-'+cell.rep;if(cell.cell==='long')row.expected=row.expected+'x'.repeat(12000)+randomUUID();let action=()=>w.execute('set_value',{pid:targetPid,element:node.token,value:row.expected});
   if(cell.cell==='secret'){
    secret='probe-value-'+randomUUID();row.expected=secret;
    const {createSkyService}=await import(pathToFileURL(join(sources[cell.head],'src/services/sky.mjs'))),{secretsFromEnv}=await import(pathToFileURL(join(sources[cell.head],'src/services/secret-input.mjs')));
    const store=join(home,'.config','claude-secrets');mkdirSync(store,{recursive:true,mode:0o700});writeFileSync(join(store,'PROBE390_VALUE'),secret,{mode:0o600});
    const sky=createSkyService({...secretsFromEnv({HOME:home,CUA_SECRETS_DIR:store}),platform:'darwin',setResponseMeta:()=>{},loadVendor:async()=>({handleRpc:request=>{const a=request.args[0];row.secretBoundary={placeholder:'{{secret:PROBE390_VALUE}}',concealed:a.concealed===true,valueMatches:a.value===secret};return w.execute('set_value',{pid:targetPid,element:node.token,value:a.value,concealed:a.concealed});}})});
    action=()=>sky.handleRpc({type:'execute',method:'set_value',args:[{app:'probe390-owned',element_index:0,value:'{{secret:PROBE390_VALUE}}'}]});
   }
   let sampling=true;const sampler=(async()=>{while(sampling){row.samples.push(await ask({op:'status',pid:targetPid,coverPid}));await sleep(10);}})();
   try{row.call={startedAt:Date.now()};row.call.raw=await action();row.call.endedAt=Date.now();}finally{sampling=false;await sampler;}
   row.checkpoints=[];
   for(const ms of [0,50,250,1000]){await sleep(row.call.endedAt+ms-Date.now());row.samples.push(await ask({op:'status',pid:targetPid,coverPid}));const after=await command({op:'read'});row.checkpoints.push({requestedMs:ms,after});row.after=after;}
   row.valid=true;
  }catch(e){row.problem=String(e.stack??e);}
  finally{
   if(w){try{await w.call('endTask',{});}catch{}w.close();w=null;}await stop(engine);engine=null;rmSync(home,{recursive:true,force:true});
   row.endedAt=Date.now();let saved=JSON.stringify(row);if(secret)saved=saved.split(secret).join('[TEST_SECRET]');const clean=JSON.parse(saved);rows.push(clean);appendFileSync(join(OUT,'rows.jsonl'),saved+'\n');writeFileSync(join(OUT,'progress.json'),JSON.stringify({complete:rows.length,planned:config.cells.length,last:row.id}));console.log(row.id,row.problem??JSON.stringify(judge(clean)));
  }
 }
 const c=coverage(rows,browser,smoke);writeFileSync(join(OUT,'summary.json'),JSON.stringify(summarize(rows),null,2));writeFileSync(join(OUT,'coverage.json'),JSON.stringify(c,null,2));if(!c.ok)process.exitCode=1;
}catch(e){writeFileSync(join(OUT,'fatal.json'),JSON.stringify({error:String(e.stack??e),rows:rows.length},null,2));throw e;}
finally{w?.close();await stop(engine);await stop(target);if(safariOwned){process.kill(targetPid,'SIGTERM');}await stop(cover);helper.kill();transport.close();server.closeAllConnections();server.close();rmSync(join(OUT,'profile'),{recursive:true,force:true});}
