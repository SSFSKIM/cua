// Hosted-only comparative test. Keep fixture state and diagnostics in memory until redacted.
import {spawn,execFileSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {appendFileSync,existsSync,mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {join,resolve} from 'node:path';
import {createInterface} from 'node:readline';
import {pathToFileURL} from 'node:url';
import {Wire} from '../probe-366/wire.mjs';
import {firefoxProfile} from '../probe-pw-walk/firefox-profile.mjs';
import {fixtureHTML} from './page.mjs';
import {judgeControls,judgePassword,passwordNodes,pasteDisclosures,syntheticFragments,timingStats} from './check.mjs';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') throw Error('GitHub-hosted runners only');
const cli = Object.fromEntries(process.argv.slice(2).reduce((a,v,i,args)=>i%2 ? a : [...a,[v.slice(2),args[i+1]]],[]));
const out = resolve(cli.out), browser = cli.browser, smoke = cli.mode === 'smoke';
const repCount = smoke ? 1 : 5, headNames = ['main','fix'], timingBlocks = smoke ? 1 : 4, blockSamples = smoke ? 2 : 5;
const lengthCases = [0,23,31], benchFields = 216;
const benchLane = ['cft','appkit'].includes(browser), isAppKit = browser === 'appkit';
const root = process.env.RUNNER_TEMP, home = mkdtempSync(join(root,'q405-home-'));
const fixture = resolve('scripts/probe-390/fixture');
mkdirSync(out,{recursive:true});
const keys = new Map();
function synthetic(length, marker='[TEST_PW]') {
  const value = randomBytes(Math.ceil(length/2)).toString('hex').slice(0,length);
  if (length) keys.set(value,marker);
  return value;
}
function redact(str) {
  for (const [value,marker] of keys) {
    str = str.replaceAll(value,marker);
    for (const fragment of syntheticFragments(value)) str = str.replaceAll(fragment,marker);
  }
  return str;
}
const save = (name,q) => writeFileSync(join(out,name),redact(JSON.stringify(q,null,2))+'\n');
const record = (name,q) => appendFileSync(join(out,name),redact(JSON.stringify(q))+'\n');
const digest = value => createHash('sha256').update(value).digest('hex');
const pause = ms => new Promise(ok=>setTimeout(ok,ms));
async function until(label,fn,ms=25000) {
  const end = performance.now()+ms;
  do { const v=await fn(); if (v) return v; await pause(100); } while (performance.now()<end);
  throw Error(`${label}: condition timeout`);
}
const children = new Map();
function spawnOwned(bin,args,env={}) {
  const p = spawn(bin,args,{env:{...process.env,HOME:home,...env},stdio:['pipe','pipe','pipe']});
  const log = {out:'',err:'',spawnError:null}; children.set(p,log);
  p.on('error',e=>{log.spawnError=String(e);});
  p.stdout.on('data',d=>{log.out=(log.out+d).slice(-16000);});
  p.stderr.on('data',d=>{log.err=(log.err+d).slice(-16000);});
  return p;
}
async function stop(p) {
  if (!p?.pid || p.exitCode!==null || p.signalCode!==null) return;
  p.kill('SIGTERM');
  try {await until('owned child exit',()=>p.exitCode!==null||p.signalCode!==null,3000);} catch {p.kill('SIGKILL');}
}
const helper = spawnOwned(cli.tool,[]);
let pending;
createInterface({input:helper.stdout}).on('line',line=>{
  const req=pending; if (!req) return;
  pending=null; clearTimeout(req.timer);
  try { const r=JSON.parse(line); if(r.error)throw Error(r.error); req.ok(r); } catch (e) {req.no(e);}
});
let helperTimedOut=false;
function ask(q) {
  if (pending || helperTimedOut) throw Error('AX helper unavailable');
  return new Promise((ok,no)=>{
    pending={ok,no,timer:setTimeout(()=>{pending=null;helperTimedOut=true;no(Error('AX helper timeout'));},20000)};
    helper.stdin.write(JSON.stringify(q)+'\n');
  });
}
async function front(pid) {
  const r=await ask({op:'front',pid});
  if (r.frontmostPid!==pid) throw Error('frontmost owned app not verified');
}
let seed={trial:0,value:'',large:false}, pageId, ack, state, checkpoints=0;
const requests={};
const server=createServer(async(req,res)=>{
  try {
    res.setHeader('Cache-Control','no-store');
    const path=new URL(req.url,'http://fixture').pathname;
    requests[path]=(requests[path]??0)+1;
    if (req.method==='GET' && path==='/seed') {res.setHeader('Content-Type','application/json');res.end(JSON.stringify(seed));return;}
    if (req.method==='GET' && path==='/') {res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fixtureHTML);return;}
    if (req.method==='POST' && (path==='/ack'||path==='/state')) {
      let body=''; for await(const b of req) {body+=b;if(body.length>2048)throw Error('oversized checkpoint');}
      const q=JSON.parse(body);
      if(q.trial===seed.trial && typeof q.pageId==='string' && (!pageId || q.pageId===pageId)) {
        if(path==='/ack') {pageId=q.pageId;ack=q;}
        else if(q.pageId===pageId) state={...q,serial:++checkpoints};
      }
      res.writeHead(200).end('{}');return;
    }
    res.writeHead(404).end();
  } catch {res.writeHead(400).end();}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const url='http://127.0.0.1:'+server.address().port+'/';
const config={browser,mode:cli.mode,kit:process.env.GITHUB_SHA,refs:Object.fromEntries(headNames.map(h=>[h,cli[h+'-ref']])),
  image:process.env.ImageVersion,os:execFileSync('sw_vers',['-productVersion'],{encoding:'utf8'}).trim(),
  product:'Unmodified release engines and matching production renderer/cache and secret wrapper modules; screenshots disabled',
  reps:repCount,lengths:lengthCases,plannedSelection:7,timingSamplesPerHead:benchLane?timingBlocks*blockSamples:0,benchFields,
  home:browser==='cft'?'CfT uses disposable hosted runner HOME with explicit isolated profile; helper and engine have temporary HOME':'Temporary HOME and isolated fixture profiles'};
const coverage={password:{main:[],fix:[]},controls:[],secret:{main:[],fix:[]},paste:{main:[],fix:[]},invalid:[],timing:{}};
let app, pid, safariOwned=false, currentEngine=null;
const plistVersion=bundle=>execFileSync('/usr/libexec/PlistBuddy',['-c','Print :CFBundleShortVersionString',bundle+'/Contents/Info.plist'],{encoding:'utf8'}).trim();
const parseLines = log => log.out.split('\n').flatMap(l=>{try{return [JSON.parse(l)];}catch{return [];}});
async function launch() {
  if (isAppKit) {
    config.version='NSSecureTextField, AppKit on macOS '+config.os;
    app=spawnOwned(cli.fixture,[]); pid=app.pid;
    await until('AppKit ready',()=>parseLines(children.get(app)).some(q=>q.ready===true));
    if ((await ask({op:'lookup',bundle:'dev.cua.probe.pwwalk.fixture'})).pid!==pid) throw Error('AppKit fixture not registered');
  } else if (browser==='safari') {
    if ((await ask({op:'lookup',bundle:'com.apple.Safari'})).pid) throw Error('Safari already running, not adopting it');
    execFileSync('/usr/bin/open',['-a','/Applications/Safari.app','--env','HOME='+home,url]);
    pid=await until('Safari launched',async()=> (await ask({op:'lookup',bundle:'com.apple.Safari'})).pid);safariOwned=true;
    config.version=plistVersion('/Applications/Safari.app');
  } else if (browser.startsWith('electron')) {
    const require=createRequire(join(fixture,'package.json'));
    app=spawnOwned(require('electron'),[fixture],{PROBE366_URL:url,PROBE366_PROFILE:join(home,'profile'),PROBE366_WINDOW_STYLE:browser==='electron-parity'?'maws':'default'});
    pid=app.pid;
    config.version=await until('Electron window ready',()=>parseLines(children.get(app)).find(q=>q.kind==='fixture-ready'));
  } else if (browser==='firefox') {
    const bundle='/Applications/Firefox.app';
    app=spawnOwned(bundle+'/Contents/MacOS/firefox',['-no-remote','-profile',firefoxProfile(join(home,'profile')),url]);pid=app.pid;
    config.version=plistVersion(bundle);
  } else if (browser==='cft') {
    const bundle='/Applications/Google Chrome for Testing.app',bin=bundle+'/Contents/MacOS/Google Chrome for Testing';
    if (!existsSync(bin)) throw Error('CfT missing');
    config.version=plistVersion(bundle);
    app=spawnOwned(bin,['--user-data-dir='+join(home,'profile'),'--no-first-run','--no-default-browser-check','--disable-search-engine-choice-screen','--disable-features=Translate','--lang=en-US','--window-position=0,25','--window-size=650,700',url],{HOME:process.env.HOME});
    pid=app.pid;
    config.startup={polls:0};
    await until('CfT owned window ready',async()=>{const r=await ask({op:'status',pid});config.startup={polls:config.startup.polls+1,last:r};return r.registered&&r.finishedLaunching&&r.windowCount>0;},60000);
  } else throw Error('unknown lane');
  config.pid=pid;
  await front(pid);
  if (!isAppKit) await until('initial owned page',()=>ack && state?.focused,45000);
  config.enablement=await ask({op:'enable',pid});
}
async function setup(value,large=false) {
  await front(pid);
  const trial=seed.trial+1, end=Math.min(7,value.length);
  seed={trial,value,large};ack=null;state=null;
  if(isAppKit) app.stdin.write(JSON.stringify(seed)+'\n');
  const evidence=await until(`trial ${trial} fixture setup`,()=>{
    const a=isAppKit ? parseLines(children.get(app)).find(q=>q.trial===trial) : ack;
    if(!a || a.length!==value.length || a.selectionStart!==0 || a.selectionEnd!==end || a.large!==large) return null;
    if(isAppKit) return a.focused ? a : null;
    if(state?.trial===trial && state.digest===digest(value) && state.focused && state.selectionStart===0 && state.selectionEnd===end && state.large===large) {
      return {trial,length:a.length,focused:true,selectionStart:state.selectionStart,selectionEnd:state.selectionEnd,large,pageId,serial:state.serial};
    }
    return null;
  });
  return evidence;
}
async function rawVerify(value, selectionEnd=Math.min(7,value.length)) {
  return until('raw AX fixture role, value length and available selection range',async()=>{
    const q=await ask({op:'scan',pid,pw:value});
    const n=q.fields.filter(n=>(n.titleIsFixture||n.descriptionIsFixture) && (n.role==='AXSecureTextField'||n.subrole==='AXSecureTextField'));
    if(n.length!==1) return null;
    const a=n[0].attributes.AXValue.result, selection=n[0].attributes.AXSelectedTextRange.result;
    if(a.kind!=='string'||a.length!==value.length) return null;
    if (selection.kind==='range' && (selection.location!==0||selection.length!==selectionEnd)) return null;
    return q;
  });
}
const importFrom = (source,file) => import(pathToFileURL(join(source,'src',file)).href);
async function useEngine(head,run) {
  const source=cli[head+'-source'], socket=join(root,'q405.sock');
  rmSync(socket,{force:true});
  const engine=spawnOwned(cli[head+'-engine'],[],{CUA_ENGINE_SOCKET:socket});
  currentEngine=engine;
  let w;
  try {
    w=await Wire.connect(socket);
    const ping=await w.call('ping',{clientApiVersion:'cua-engine-1',desktop:'shared'});
    if(ping.error)throw Error('engine ping refused');
    const {createObservations}=await importFrom(source,'services/engine/observations.mjs');
    const {advanceNumbering,render}=await importFrom(source,'services/engine/render.mjs');
    const observations=createObservations(), key='probe405-owned';
    async function observe(disableDiff=false) {
      const start=performance.now();
      const native=await w.execute('get_app_state',{pid,includeScreenshot:false,disableDiff});
      const wallMs=performance.now()-start;
      if(native.error||!native.result)throw Error('native observation refused: '+JSON.stringify(native.error));
      return {native,wallMs};
    }
    await run({source,w,observe,asDiff:(shot,disableDiff=false)=>observations.observe(key,shot,{disableDiff}),
      asFull:shot=>render(shot,advanceNumbering(null,shot))});
  } finally {
    if (w) {try{await w.call('endTask',{});}catch{}w.close();}
    await stop(engine);currentEngine=null;
  }
}
async function surface(engine, initial=false) {
  const {native}=await engine.observe(initial);
  const diff=engine.asDiff(native.result,initial);
  const text=initial ? diff : engine.asFull(native.result);
  const repeated=await engine.observe();
  if(native.result.lineage!==repeated.native.result.lineage) throw Error('repeat changed observation lineage');
  return {native,text,diff,repeatNative:repeated.native,repeated:engine.asDiff(repeated.native.result)};
}
const order = index => index%2 ? [...headNames].reverse() : headNames;
function invalid(cell,head,error,extra={}) {
  const info={cell,head,error:String(error.stack??error),...extra};
  coverage.invalid.push(info);
  record('invalid.jsonl',info);
  console.log(redact(JSON.stringify({cell,head,invalid:info.error.split('\n')[0]})));
}
async function seeded() {
  for(let rep=0;rep<repCount;rep++) {
    const values=lengthCases.map(length=>synthetic(length)), paired={main:new Map(),fix:new Map()};
    for(const head of order(rep)) {
      try {
        await useEngine(head,async engine=>{
          let lineage;
          for(const [idx,value] of values.entries()) {
            const fixture=await setup(value), raw=await rawVerify(value);
            const row={kind:'seeded',rep,head,length:value.length,fixture,raw,...await surface(engine,idx===0)};
            if(idx>0&&lineage!==row.native.result.lineage)throw Error('transition changed observation lineage');
            lineage=row.native.result.lineage;
            row.failures=judgePassword(head,row,value,{changed:idx!==0});
            record('observations.jsonl',row);
            coverage.password[head].push({rep,length:value.length,failures:row.failures});
            paired[head].set(value.length,row);
          }
        });
      } catch (e) {invalid('seeded',head,e,{rep,completed:[...paired[head].keys()]});}
    }
    for (const length of lengthCases) if (paired.main.has(length)&&paired.fix.has(length)) {
      coverage.controls.push({rep,length,failures:judgeControls(paired.main.get(length),paired.fix.get(length))});
    }
    save('summary.json',coverage);
  }
}
async function waitForDelivery(fixture,value) {
  return until('one input delivered exact value to focused password field',()=>{
    if(state?.trial!==fixture.trial||state.serial<=fixture.serial||state.digest!==digest(value)||!state.focused)return null;
    return {trial:state.trial,serial:state.serial,focused:state.focused,selectionStart:state.selectionStart,selectionEnd:state.selectionEnd,exact:true};
  },5000);
}
async function secrets() {
  if(browser!=='cft')return;
  for(let rep=0;rep<repCount;rep++) {
    const value=synthetic(23,'[TEST_SECRET]');
    for(const head of order(rep)) {
      let row={kind:'secret',rep,head};
      try {
        await useEngine(head,async engine=>{
          const placeholder='{{secret:PROBE405_PASSWORD}}';
          const fixture=await setup('');
          const {native:before}=await engine.observe(true);
          const [field]=passwordNodes(before);
          if(!field?.token || before.result.focused!==field.token)throw Error('AX pre-observation did not focus the owned password field');
          row={...row,fixture,before,beforeText:engine.asDiff(before.result,true)};
          const secretHome=mkdtempSync(join(home,'secret-')),store=join(secretHome,'.config','claude-secrets');
          mkdirSync(store,{recursive:true,mode:0o700});writeFileSync(join(store,'PROBE405_PASSWORD'),value,{mode:0o600});
          try {
            const [{createSkyService},{secretsFromEnv},{serverError}]=await Promise.all(['services/sky.mjs','services/secret-input.mjs','services/engine/protocol.mjs'].map(f=>importFrom(engine.source,f)));
            const sky=createSkyService({...secretsFromEnv({HOME:secretHome,CUA_SECRETS_DIR:store}),platform:'darwin',setResponseMeta:()=>{},loadVendor:async()=>({
              async handleRpc({method,args:[a]}) {
                row.boundary={method,placeholder,concealed:a.concealed===true,valueMatches:a.text===value};
                if(method!=='type_text'||!row.boundary.concealed||!row.boundary.valueMatches)throw Error('incorrect secret boundary');
                row.action=await engine.w.execute(method,{pid,text:a.text,concealed:a.concealed});
                if(row.action.error) throw serverError(row.action.error);
                return row.action.result;
              },
            })});
            try {await sky.handleRpc({type:'execute',method:'type_text',args:[{app:'probe405-owned',text:placeholder}]});}
            catch(e){row.wrapperError={name:e.name,code:e.code,message:e.message};}
          } finally {rmSync(secretHome,{force:true,recursive:true});}
          try {
            row.delivery=await waitForDelivery(fixture,value);
          } finally {
            // Even when typing or delivery is invalid, retain the attempted follow-up and diff if available.
            Object.assign(row,await surface(engine));
          }
          if(!row.boundary?.valueMatches||!row.boundary?.concealed||!row.action)throw Error('production substitution did not reach the native IPC');
          if(before.result.lineage!==row.native.result.lineage)throw Error('post-type observation changed lineage');
          row.failures=judgePassword(head,row,value,{changed:true});
          coverage.secret[head].push({rep,failures:row.failures,actionError:row.action.error?.errorName??null});
        });
      } catch(e) {row.invalid=String(e.stack??e);invalid('secret',head,e,{rep});}
      finally {record('secrets.jsonl',row);}
    }
    save('summary.json',coverage);
  }
}
async function paste() {
  if (browser!=='cft') return;
  const value=synthetic(23,'[TEST_SECRET]');
  for (const head of headNames) {
    const row={kind:'paste',head};
    try {
      await useEngine(head,async engine=>{
        row.fixture=await setup('');
        ({native:row.before}=await engine.observe(true));
        const [field]=passwordNodes(row.before);
        if(!field?.token||row.before.result.focused!==field.token)throw Error('AX pre-observation did not focus the owned password field');
        row.beforeText=engine.asDiff(row.before.result,true);
        // This is a disposable synthetic string, not a secret-store reference. The real wrapper deliberately forbids
        // pasting a concealed value into the system clipboard, and the type cell above proves that production path.
        row.action=await engine.w.execute('paste',{pid,text:value,format:'text'});
        row.metaDisclosures=pasteDisclosures(row.action,value);
        try {row.delivery=await waitForDelivery(row.fixture,value);}
        finally {Object.assign(row,await surface(engine));}
        if(row.before.result.lineage!==row.native.result.lineage)throw Error('post-paste observation changed lineage');
        row.failures=judgePassword(head,row,value,{changed:true});
        // Paste hardening is not in the requested smoke pin. Its metadata is recorded but doesn't gate smoke.
        if(!smoke&&head==='fix'&&row.metaDisclosures.length)row.failures.push('paste reply leaks length/selection/value');
        coverage.paste[head].push({failures:row.failures,metaDisclosures:row.metaDisclosures,actionError:row.action.error?.errorName??null});
      });
    } catch(e) {row.invalid=String(e.stack??e);invalid('paste',head,e);}
    finally {record('paste.jsonl',row);}
  }
  save('summary.json',coverage);
}
async function timings() {
  if(!benchLane)return;
  for(const large of [false,true]) {
    const size=large?'large':'small';
    const timing={main:[],fix:[]};
    await setup('',large);
    for(let block=0;block<timingBlocks;block++)for(const head of order(block+(large?1:0))) {
      try {
        await useEngine(head,async engine=>{
          const check=({native,wallMs})=>{
            const {nodes,timings,truncated}=native.result;
            const markers=new Set(nodes.map(n=>n.value).filter(v=>typeof v==='string'&&/^bench-value-\d+$/.test(v)));
            const observed=markers.size;
            const validTree=!timings.deadlineHit&&!timings.budgetHit&&!timings.nodeCapHit&&!(truncated?.count>0)&&passwordNodes(native).length===1
              && observed===(large?benchFields:0);
            return {validTree,wallMs,walkMs:timings.walkMs,nodeCount:nodes.length,benchValues:observed,truncated,timings};
          };
          const warm=check(await engine.observe(true));
          record('timing.jsonl',{size,head,block,warmup:true,...warm});
          if(!warm.validTree) throw Error(`warm-up did not observe owned ${size} tree (${warm.benchValues} benchmark controls)`);
          for(let sample=0;sample<blockSamples;sample++) {
            const row=check(await engine.observe(true));
            record('timing.jsonl',{size,head,block,sample,...row});
            if(!row.validTree) throw Error(`timed sample did not observe owned ${size} tree (${row.benchValues} benchmark controls)`);
            timing[head].push(row);
          }
        });
      } catch(e) {invalid('timing',head,e,{size,block,n:timing[head].length});}
    }
    coverage.timing[size]={};
    for(const head of headNames) {
      const rows=timing[head];
      coverage.timing[size][head]=rows.length ? {...timingStats(rows),nodes:[Math.min(...rows.map(r=>r.nodeCount)),Math.max(...rows.map(r=>r.nodeCount))],benchValues:rows[0].benchValues} : {n:0};
    }
    save('summary.json',coverage);
  }
}
function complete() {
  const failures=[];
  const check=(rows,n,label)=>{
    if(rows.length!==n)failures.push(`${label}: ${rows.length}/${n} completed`);
    if(rows.some(r=>r.failures.length))failures.push(`${label}: ${rows.filter(r=>r.failures.length).length} rows failed`);
  };
  for(const head of headNames) {
    check(coverage.password[head],repCount*lengthCases.length,`${head} password`);
    if(browser==='cft') {
      check(coverage.secret[head],repCount,`${head} secret`);
      check(coverage.paste[head],1,`${head} paste`);
    }
    if(benchLane)for(const size of ['small','large'])if(coverage.timing[size]?.[head]?.n!==timingBlocks*blockSamples) failures.push(`${head} ${size} timings incomplete`);
  }
  check(coverage.controls,repCount*lengthCases.length,'paired ordinary controls');
  if(coverage.invalid.length)failures.push(`${coverage.invalid.length} invalid setups/observations`);
  return failures;
}
try {
  save('config.json',config);
  await launch();save('config.json',config);
  await seeded();
  await secrets();
  await paste();
  await timings();
  coverage.failures=complete();
  save('summary.json',coverage);
  console.log(redact(JSON.stringify({failures:coverage.failures,timing:coverage.timing})));
  if(coverage.failures.length)process.exitCode=1;
} catch(e) {
  let initialEmptyDiagnostic;
  if(pid && browser==='cft' && seed.trial===0)try{initialEmptyDiagnostic=await ask({op:'scan',pid,pw:'',diagnostic:true});}catch{}
  save('config.json',config);
  save('fatal.json',{error:String(e.stack??e),requests,initialEmptyDiagnostic});
  console.log(redact(String(e.stack??e)));
  process.exitCode=1;
} finally {
  await stop(currentEngine);
  for(const p of [...children.keys()].reverse())await stop(p);
  if(safariOwned)try{process.kill(pid,'SIGTERM');}catch{}
  save('owned-logs.json',[...children].map(([p,log])=>({pid:p.pid,exitCode:p.exitCode,signal:p.signalCode,...log})));
  server.closeAllConnections();server.close();rmSync(home,{recursive:true,force:true});
}
