// Hosted-only, unmodified main engine. Only redacted synthetic evidence is persisted.
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createInterface} from 'node:readline';
import {mkdirSync,readFileSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
import {Wire} from '../probe-366/wire.mjs';
import {firefoxProfile} from './firefox-profile.mjs';
if(process.env.RUNNER_ENVIRONMENT!=='github-hosted')throw Error('hosted only');
const arg=n=>process.argv[process.argv.indexOf('--'+n)+1],out=resolve(arg('out')),browser=arg('browser'),source=resolve(arg('source'));
const root=process.env.RUNNER_TEMP,home=join(root,'pw-home-'+browser),fixture=resolve('scripts/probe-390/fixture');
mkdirSync(out,{recursive:true});mkdirSync(home,{recursive:true});
const passwords=['',randomBytes(16).toString('hex').slice(0,23),randomBytes(20).toString('hex').slice(0,31)];
const redact=s=>{for(const pw of passwords.filter(Boolean)){s=s.split(pw).join('[TEST_PW]').split(pw.slice(0,7)).join('[TEST_PW]');}return s;};
const save=(name,q)=>writeFileSync(join(out,name),redact(typeof q==='string'?q:JSON.stringify(q,null,2)));
const disclosure=v=>{const s=typeof v==='string'?v:JSON.stringify(v);return{serializedLength:s.length,perPassword:passwords.map((pw,password)=>({password,passwordLength:pw.length,full:!!pw&&s.includes(pw),selected:!!pw&&s.includes(pw.slice(0,7))}))};};
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
async function until(fn,ms=25000){const end=Date.now()+ms;while(Date.now()<end){const v=await fn();if(v)return v;await sleep(100);}throw Error('condition timeout');}
const logs=new Map(),children=[];
function child(bin,args,env={}){const p=spawn(bin,args,{env:{...process.env,HOME:home,...env},stdio:['pipe','pipe','pipe']});children.push(p);const log={stdout:'',stderr:''};logs.set(p,log);p.stdout.on('data',d=>log.stdout+=d);p.stderr.on('data',d=>log.stderr+=d);return p;}
async function stop(p){if(!p||p.exitCode!==null||p.signalCode!==null)return;p.kill('SIGTERM');try{await until(()=>p.exitCode!==null||p.signalCode!==null,5000);}catch{p.kill('SIGKILL');}}
const helper=child(arg('tool'),[]),waiters=[];
createInterface({input:helper.stdout}).on('line',line=>{const w=waiters.shift();if(!w)return;clearTimeout(w.timer);try{const r=JSON.parse(line);if(r.error)throw Error(r.error);w.ok(r);}catch(e){w.no(e);}});
function ask(q){return new Promise((ok,no)=>{const w={ok,no,timer:setTimeout(()=>no(Error('helper timeout')),20000)};waiters.push(w);helper.stdin.write(JSON.stringify(q)+'\n');});}
async function front(pid){const r=await ask({op:'front',pid});if(r.frontmostPid!==pid)throw Error('frontmost mismatch '+JSON.stringify(r));}
let trial=0,ack=-1,seedRequests=0;const requests={};
const html=`<!doctype html><meta charset="utf-8"><title>PW walk owned fixture</title><h1>Owned password field</h1><label>Public control<input aria-label="Public control" value="public-control"></label><label>Password<input id="pw" type="password" aria-label="PW walk test" autocomplete="off"></label><script>
let seen=-1;async function tick(){try{const q=await(await fetch('/seed',{cache:'no-store'})).json();if(q.trial!==seen){seen=q.trial;const f=document.getElementById('pw');f.value=q.value;f.focus();f.setSelectionRange(0,Math.min(7,q.value.length));await fetch('/ack?trial='+seen+'&length='+f.value.length);}}catch{}setTimeout(tick,100)}tick();</script>`;
const server=createServer((req,res)=>{res.setHeader('Cache-Control','no-store');const u=new URL(req.url,'http://fixture');requests[u.pathname]=(requests[u.pathname]??0)+1;if(u.pathname==='/seed'){seedRequests++;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({trial,value:passwords[trial]}));}else if(u.pathname==='/ack'){if(Number(u.searchParams.get('trial'))===trial&&Number(u.searchParams.get('length'))===passwords[trial].length)ack=trial;res.end('{}');}else{res.setHeader('Content-Type','text/html');res.end(html);}});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const url='http://127.0.0.1:'+server.address().port+'/';
const config={browser,engineRef:arg('engine-ref'),kit:process.env.GITHUB_SHA,image:process.env.ImageVersion,os:execFileSync('sw_vers',['-productVersion'],{encoding:'utf8'}).trim(),lengths:passwords.map(s=>s.length),selectedLength:7,home:browser==='cft'?'Engine/raw probe use empty temporary HOME; Chrome uses disposable hosted runner HOME and a fresh explicit temporary user-data-dir, as probe-390':'Empty temporary HOME; Firefox/Electron also use explicit temporary profiles',rawProbe:'AXUIElementCopyAttributeValue independently of cua; secure or owned-label fields, with per-attribute error/length/match flags',accessibility:'helper sets app AXManualAccessibility and AXEnhancedUserInterface before raw reads, as needed by Chromium; engine source/binary unmodified'};save('config.json',config);
let app,pid,engine,w,safariOwned=false;const rows=[];
try{
 const require=createRequire(join(fixture,'package.json'));
 if(browser==='appkit'){
  config.version='standard NSSecureTextField, AppKit on macOS '+config.os;app=child(arg('fixture'),[]);pid=app.pid;await until(()=>logs.get(app).stdout.includes('"ready":true'));if((await ask({op:'lookup',bundle:'dev.cua.probe.pwwalk.fixture'})).pid!==pid)throw Error('AppKit fixture is not a registered bundle app');
 }else if(browser==='safari'){
  if((await ask({op:'lookup',bundle:'com.apple.Safari'})).pid)throw Error('Safari already running, not adopting it');
  execFileSync('/usr/bin/open',['-a','/Applications/Safari.app','--env','HOME='+home,url]);pid=await until(async()=> (await ask({op:'lookup',bundle:'com.apple.Safari'})).pid);safariOwned=true;
  config.version=execFileSync('/usr/libexec/PlistBuddy',['-c','Print :CFBundleShortVersionString','/Applications/Safari.app/Contents/Info.plist'],{encoding:'utf8'}).trim();
 }else if(browser.startsWith('electron')){
  app=child(require('electron'),[fixture],{PROBE366_URL:url,PROBE366_PROFILE:join(home,'profile'),PROBE366_WINDOW_STYLE:browser==='electron-parity'?'maws':'default'});pid=app.pid;await until(()=>logs.get(app).stdout.includes('fixture-ready'));config.version=logs.get(app).stdout.split('\n').map(l=>{try{return JSON.parse(l);}catch{return null;}}).find(q=>q?.kind==='fixture-ready');
 }else if(browser==='firefox'){
  const profile=firefoxProfile(join(home,'profile'));
  const bin='/Applications/Firefox.app/Contents/MacOS/firefox';app=child(bin,['-no-remote','-profile',profile,url]);pid=app.pid;config.version=execFileSync('/usr/libexec/PlistBuddy',['-c','Print :CFBundleShortVersionString','/Applications/Firefox.app/Contents/Info.plist'],{encoding:'utf8'}).trim();
 }else{
  const bundle='/Applications/Google Chrome for Testing.app',bin=bundle+'/Contents/MacOS/Google Chrome for Testing';if(!existsSync(bin))throw Error('CfT missing');config.version=execFileSync('/usr/libexec/PlistBuddy',['-c','Print :CFBundleShortVersionString',bundle+'/Contents/Info.plist'],{encoding:'utf8'}).trim();config.launch='probe-390 direct executable route, disposable runner HOME, explicit temporary profile, foreground before readiness';app=child(bin,['--user-data-dir='+join(home,'profile'),'--no-first-run','--no-default-browser-check','--disable-search-engine-choice-screen','--disable-features=Translate','--lang=en-US','--window-position=0,25','--window-size=650,700',url],{HOME:process.env.HOME});pid=app.pid;
 }
 config.pid=pid;save('config.json',config);
 if(browser==='cft'){config.startup={startedAt:Date.now(),polls:0,last:null};await until(async()=>{config.startup.polls++;config.startup.last=await ask({op:'status',pid});const s=config.startup.last;return s.registered&&s.finishedLaunching&&s.windowCount>0;},60000);config.startup.endedAt=Date.now();save('config.json',config);}
 if(browser!=='appkit'){await front(pid);await until(()=>ack===0,45000);}
 await front(pid);config.enablement=await ask({op:'enable',pid});config.pid=pid;save('config.json',config);
 const socket=join(root,'pw-'+browser+'.sock');rmSync(socket,{force:true});engine=child(arg('engine'),[],{CUA_ENGINE_SOCKET:socket});w=await Wire.connect(socket);const ping=await w.call('ping',{clientApiVersion:'cua-engine-1',desktop:'shared'});if(ping.error)throw Error('engine ping error');
 const {createObservations}=await import(pathToFileURL(join(source,'src/services/engine/observations.mjs')));
 const observations=createObservations();
 for(trial=0;trial<passwords.length;trial++){
  const pw=passwords[trial];
  if(browser==='appkit'){app.stdin.write(JSON.stringify({trial,value:pw})+'\n');await until(()=>logs.get(app).stdout.split('\n').some(l=>{try{return JSON.parse(l).trial===trial;}catch{return false;}}));}else await until(()=>ack===trial);
  await front(pid);
  const raw=await until(async()=>{const q=await ask({op:'scan',pid,pw});return q.fields.length?q:null;});
  const reply=await w.execute('get_app_state',{pid,includeScreenshot:false,disableDiff:true});if(reply.error)throw Error('native observation error '+JSON.stringify(reply.error));
  const text=observations.observe('pw-owned-fixture',reply.result,{disableDiff:true});
  const repeated=await w.execute('get_app_state',{pid,includeScreenshot:false});if(repeated.error)throw Error('repeat observation error');
  const repeatText=observations.observe('pw-owned-fixture',repeated.result,{disableDiff:false});
  const row={trial,expectedLength:pw.length,raw,native:reply,text,repeatText,repeatNative:repeated,nativeContainsFullPassword:!!pw&&JSON.stringify(reply).includes(pw),nativeContainsSelectedSubstring:!!pw&&JSON.stringify(reply).includes(pw.slice(0,7)),textContainsFullPassword:!!pw&&String(text).includes(pw),textContainsSelectedSubstring:!!pw&&String(text).includes(pw.slice(0,7)),disclosure:{native:disclosure(reply),text:disclosure(text),repeatNative:disclosure(repeated),repeatText:disclosure(repeatText)}};
  rows.push(row);save('rows.json',rows);
 }
 save('summary.json',{complete:true,rows:rows.length,seedRequests});
}catch(e){let diagnostic;try{if(pid)diagnostic=await ask({op:'scan',pid,pw:passwords[trial]??'',diagnostic:browser==='cft'&&trial===0&&ack<0});}catch{}save('fatal.json',{error:String(e.stack??e),rows:rows.length,trial,ack,seedRequests,requests,startup:config.startup,appPid:app?.pid,appExitCode:app?.exitCode,appSignal:app?.signalCode,diagnostic});process.exitCode=1;}
finally{
 if(w){try{await w.call('endTask',{});}catch{}w.close();}
 for(const p of children.reverse())await stop(p);
 if(safariOwned&&pid!==app?.pid){try{process.kill(pid,'SIGTERM');}catch{}}
 for(const [p,log]of logs){const name=p===helper?'helper':p===engine?'engine':'app';save(name+'-stdout.txt',log.stdout);save(name+'-stderr.txt',log.stderr);}
 server.closeAllConnections();server.close();rmSync(home,{recursive:true,force:true});
}
