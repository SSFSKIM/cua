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
import {containsSynthetic,judgeControls,judgePassword,passwordNodes,pasteDisclosures,syntheticFragments,timingStats} from './check.mjs';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') throw Error('GitHub-hosted runners only');
const cli = Object.fromEntries(process.argv.slice(2).reduce((a,v,i,args)=>i%2 ? a : [...a,[v.slice(2),args[i+1]]],[]));
const out = resolve(cli.out), browser = cli.browser, smoke = cli.mode === 'smoke';
const repCount = smoke ? 1 : 5, headNames = ['main','fix'], timingBlocks = smoke ? 1 : 4, blockSamples = smoke ? 2 : 5;
const lengthCases = [0,23,31], benchFields = 216;
const benchLane = ['cft','appkit'].includes(browser), isAppKit = browser === 'appkit';
const timingArms=['small','large','large-reused-settle'];
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
  reps:repCount,lengths:lengthCases,plannedSelection:7,timingSamplesPerHead:benchLane?timingBlocks*blockSamples:0,benchFields,timingArms:benchLane?timingArms:[],
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
const markerPrefix = trial => `pw-fixture-generation-${trial}-`;
const checkpointKeys = ['trial','pageId','marker','focused','selectionStart','selectionEnd','large'];
const matchesCheckpoint = (actual,expected,hash) => actual?.digest===hash && checkpointKeys.every(k=>actual[k]===expected[k]);
const checkpointEvidence = actual => ({...Object.fromEntries(checkpointKeys.map(k=>[k,actual[k]])),serial:actual.serial,exact:true});
async function setup(value,large=false) {
  await front(pid);
  const trial=seed.trial+1, end=Math.min(7,value.length), hash=digest(value);
  const expected={trial,marker:markerPrefix(trial)+'0',focused:true,selectionStart:0,selectionEnd:end,large};
  seed={trial,value,large};ack=null;state=null;
  if(isAppKit) app.stdin.write(JSON.stringify(seed)+'\n');
  return until(`trial ${trial} fixture setup`,()=>{
    const a=isAppKit ? parseLines(children.get(app)).find(q=>q.trial===trial) : ack;
    if(!a || a.length!==value.length || a.marker!==expected.marker) return null;
    if(isAppKit) return Object.entries(expected).every(([k,v])=>a[k]===v) ? a : null;
    if(matchesCheckpoint(state,{...expected,pageId:a.pageId},hash)) return {...checkpointEvidence(state),length:a.length};
    return null;
  });
}
const rawPasswordFields = q => q.fields.filter(n=>(n.titleIsFixture||n.descriptionIsFixture) && (n.role==='AXSecureTextField'||n.subrole==='AXSecureTextField'));
async function rawVerify(value, expected) {
  return until('raw AX fixture role, value length and available selection range',async()=>{
    const q=await ask({op:'scan',pid,pw:value}), [n,...extra]=rawPasswordFields(q);
    if(!n || extra.length) return null;
    const a=n.attributes.AXValue.result, selection=n.attributes.AXSelectedTextRange.result;
    if(a.kind!=='string'||a.length!==value.length) return null;
    if (selection.kind==='range' && (selection.location!==expected.selectionStart||selection.length!==expected.selectionEnd-expected.selectionStart)) return null;
    return q;
  });
}
function judgeOptions(raw,changed) {
  const selected=rawPasswordFields(raw)[0].attributes.AXSelectedText.result;
  return {changed,requireFocus:browser!=='firefox',selectedMaskLength:selected.allMaskCharacters ? selected.length : null,knownValues:[...keys.keys()]};
}
async function attest(native,expected,value) {
  const {nodes,lineage,revision}=native.result;
  // The polling page serializes ticks. Only the first checkpoint received after the RPC can have been in flight before it returned.
  const after=checkpoints;
  if(native.result.app?.pid!==pid) throw Error('native observation did not belong to the owned process');
  if(!nodes.some(n=>n.role==='AXStaticText'&&[n.value,n.title,n.description].includes(expected.marker))) {
    throw Error('native fixture generation marker missing: '+expected.marker);
  }
  if(typeof lineage!=='string'||!lineage||!Number.isSafeInteger(revision)||revision<1) throw Error('native observation lacks lineage or revision');
  if(isAppKit) return {marker:expected.marker};
  const fresh=await until('fresh fixture checkpoint after native read',()=>state?.serial>=after+2 && state,5000);
  if(!matchesCheckpoint(fresh,expected,digest(value))) throw Error('fixture state changed across native read (generation, focus, selection or exact value)');
  return checkpointEvidence(fresh);
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
    let numbering=null, previous=null;
    async function read(fixture,value,disableDiff=false,settle=false) {
      const start=performance.now();
      const native=await w.execute('get_app_state',{pid,includeScreenshot:false,disableDiff,...(settle && {settle:true})});
      const wallMs=performance.now()-start;
      if(native.error||!native.result)throw Error('native observation refused: '+JSON.stringify(native.error));
      const checkpoint=await attest(native,fixture,value);
      return {native,wallMs,checkpoint};
    }
    async function observe(fixture,disableDiff=false,value='') {
      const result=await read(fixture,value,disableDiff), shot=result.native.result;
      if(previous && (disableDiff ? shot.lineage===previous.lineage : shot.lineage!==previous.lineage || shot.revision<=previous.revision)) {
        throw Error(disableDiff ? 'native disableDiff did not reset observation lineage' : 'native diff did not advance revision in the same observation lineage');
      }
      // The production cache does not expose its numbering; advance the same production numbering over the same shots.
      numbering=advanceNumbering(numbering,shot);
      const text=render(shot,numbering), rendered=observations.observe(key,shot,{disableDiff});
      const previousText=previous?.text;
      previous={lineage:shot.lineage,revision:shot.revision,text};
      return {...result,text,rendered,previousText};
    }
    await run({source,w,read,observe});
  } finally {
    if (w) {try{await w.call('endTask',{});}catch{}w.close();}
    await stop(engine);currentEngine=null;
  }
}
function nativeFocus(native) {
  const {focused,nodes,menuBar}=native.result;
  const target=[...nodes,...(menuBar??[])].find(n=>n.token===focused);
  return {token:focused??null,role:target?.role??null,subrole:target?.subrole??null,ownedPassword:passwordNodes(native).some(n=>n.token===focused)};
}
async function surface(engine,row,fixture,initial=false,value='') {
  const current=await engine.observe(fixture,initial,value);
  Object.assign(row,{native:current.native,diff:current.rendered,previousText:current.previousText,sequencedText:current.text,
    checkpoints:{native:current.checkpoint},nativeFocus:{native:nativeFocus(current.native)}});
  const repeated=await engine.observe(fixture,false,value);
  Object.assign(row,{repeatNative:repeated.native,repeated:repeated.rendered});
  row.checkpoints.repeatNative=repeated.checkpoint;
  row.nativeFocus.repeatNative=nativeFocus(repeated.native);
  // A real full RPC starts a new lineage, so it goes last and serves as the next transition's baseline.
  const full=initial ? current : await engine.observe(fixture,true,value);
  Object.assign(row,{fullNative:full.native,text:full.rendered});
  row.checkpoints.fullNative=full.checkpoint;
  row.nativeFocus.fullNative=nativeFocus(full.native);
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
          for(const [idx,value] of values.entries()) {
            const row={kind:'seeded',rep,head,length:value.length};
            try {
              row.fixture=await setup(value);
              row.raw=await rawVerify(value,row.fixture);
              await surface(engine,row,row.fixture,idx===0,value);
              if(isAppKit) row.rawAfter=await rawVerify(value,row.fixture);
              const opts=judgeOptions(row.raw,idx!==0);
              row.failures=judgePassword(head,row,value,opts);
              coverage.password[head].push({rep,length:value.length,failures:row.failures,nativeFocus:row.nativeFocus,
                selectedMaskLength:opts.selectedMaskLength});
              paired[head].set(value.length,row);
            } catch(e) {row.invalid=String(e.stack??e);throw e;}
            finally {record('observations.jsonl',row);}
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
async function waitForDelivery(fixture,value,after) {
  const hash=digest(value), end=value.length, prefix=markerPrefix(fixture.trial);
  return until('one input delivered exact value and caret to focused password field',()=>{
    const fresh=state, marker=fresh?.marker;
    if(fresh?.serial<after+2||!marker?.startsWith(prefix)||marker===fixture.marker)return null;
    if(!matchesCheckpoint(fresh,{...fixture,marker,selectionStart:end,selectionEnd:end},hash))return null;
    return checkpointEvidence(fresh);
  },5000);
}
async function actionBaseline(engine,row,value) {
  row.fixture=await setup(value);
  row.beforeRaw=await rawVerify(value,row.fixture);
  const before=await engine.observe(row.fixture,true,value);
  Object.assign(row,{before:before.native,beforeText:before.rendered,beforeCheckpoint:before.checkpoint});
  const [field,...extra]=passwordNodes(row.before);
  if(extra.length||!field?.token||row.before.result.focused!==field.token)throw Error('AX pre-observation did not focus the owned password field');
  return containsSynthetic(JSON.stringify(row.before),keys.keys()) || containsSynthetic(row.beforeText,keys.keys())
    ? ['action pre-observation exposes a synthetic password or fragment'] : [];
}
function actionDisclosures(reply) {
  const found=new Set();
  for(const value of keys.keys()) for(const path of pasteDisclosures(reply,value)) found.add(path);
  if(containsSynthetic(JSON.stringify(reply),keys.keys())) found.add('synthetic value or fragment');
  return [...found];
}
async function actionSurface(engine,row,value,after) {
  row.delivery=await waitForDelivery(row.fixture,value,after);
  row.raw=await rawVerify(value,row.delivery);
  await surface(engine,row,row.delivery,false,value);
}
async function secrets() {
  if(browser!=='cft')return;
  for(let rep=0;rep<repCount;rep++) {
    const value=synthetic(23,'[TEST_SECRET]');
    for(const head of order(rep)) {
      let row={kind:'secret',rep,head};
      try {
        await useEngine(head,async engine=>{
          const label='PROBE405_PASSWORD', placeholder=`{{secret:${label}}}`;
          const failures=await actionBaseline(engine,row,'');
          const secretHome=mkdtempSync(join(home,'secret-')),store=join(secretHome,'.config','claude-secrets');
          mkdirSync(store,{recursive:true,mode:0o700});writeFileSync(join(store,label),value,{mode:0o600});
          try {
            const [{createSkyService},{secretsFromEnv},{serverError}]=await Promise.all(['services/sky.mjs','services/secret-input.mjs','services/engine/protocol.mjs'].map(f=>importFrom(engine.source,f)));
            const sky=createSkyService({...secretsFromEnv({HOME:secretHome,CUA_SECRETS_DIR:store}),platform:'darwin',setResponseMeta:meta=>{row.wrapperMeta=meta;},loadVendor:async()=>({
              async handleRpc({method,args:[a]}) {
                row.boundary={method,placeholder,concealed:a.concealed===true,valueMatches:a.text===value};
                if(method!=='type_text'||!row.boundary.concealed||!row.boundary.valueMatches)throw Error('incorrect secret boundary');
                row.action=await engine.w.execute(method,{pid,text:a.text,concealed:a.concealed});
                if(row.action.error) throw serverError(row.action.error);
                return row.action.result;
              },
            })});
            try {row.wrapperResult=await sky.handleRpc({type:'execute',method:'type_text',args:[{app:'probe405-owned',text:placeholder}]});}
            catch(e){row.wrapperError={...e,name:e.name,code:e.code,message:e.message};}
          } finally {rmSync(secretHome,{force:true,recursive:true});}
          const after=checkpoints;
          if(!row.boundary?.valueMatches||!row.boundary?.concealed||!row.action)throw Error('production substitution did not reach the native IPC');
          const meta=row.action.error?.meta??row.action.result?.meta, readback=meta?.typeReadback;
          if(meta?.inputRoute!=="2'" || !Number.isFinite(meta.startedAt) || readback?.concealed!==true ||
             !['secure','becameSecure'].includes(readback.reason) || row.action.error?.errorName!=='typeUnconfirmed' ||
             row.wrapperError?.code!=='secret_input_failed') throw Error('concealed keyed action or secure readback refusal not proven');
          row.actionDisclosures=actionDisclosures(row.action);
          row.wrapperDisclosures=actionDisclosures({result:row.wrapperResult,error:row.wrapperError,meta:row.wrapperMeta});
          const readingFields=['concealed','confirmed','reason','snapshotMs','keysUnconfirmed','stoppedBeforeKey'];
          if(row.actionDisclosures.length || Object.keys(readback).some(k=>!readingFields.includes(k)) ||
             ['keysUnconfirmed','stoppedBeforeKey'].some(k=>k in readback && typeof readback[k]!=='boolean')) failures.push('concealed native type reply exposes private input metadata or value');
          if(row.wrapperDisclosures.length) failures.push('concealed wrapper reply exposes private input metadata or value');
          await actionSurface(engine,row,value,after);
          row.failures=[...failures,...judgePassword(head,row,value,judgeOptions(row.raw,true))];
          coverage.secret[head].push({rep,failures:row.failures,actionError:row.action.error?.errorName??null});
        });
      } catch(e) {row.invalid=String(e.stack??e);invalid('secret',head,e,{rep});}
      finally {record('secrets.jsonl',row);}
    }
    save('summary.json',coverage);
  }
}
function pasteStatus(reply) {
  const {note,meta}=reply.result??{}, p=meta?.paste, line=p?.perLine?.[0];
  if(reply.error||meta?.inputRoute!=='paste'||p?.stage!=='effect'||p.perLine?.length!==1||line?.confirmed!==p.confirmed) return null;
  if(p.confirmed===true && ['notification','reading'].includes(p.effectWait) && note==null) return 'confirmed';
  if(p.confirmed===false && p.effectWait==='noChannel' && p.unconfirmedLines===1 && Number.isFinite(p.firstReadAfterPostMs) &&
     typeof note==='string' && note.startsWith('Pasted, unconfirmed:')) return 'unconfirmed';
  return null;
}
function matchingReading(reading,characters,location,length) {
  return reading?.characters===characters || (reading?.range?.length===2 && reading.range[0]===location && reading.range[1]===length);
}
const secureReading = r => r?.secure===true && Object.keys(r).length===1;
async function paste() {
  if (browser!=='cft') return;
  const prior=synthetic(7), value=synthetic(23,'[TEST_SECRET]');
  for (const head of headNames) {
    const row={kind:'paste',head};
    try {
      await useEngine(head,async engine=>{
        const failures=await actionBaseline(engine,row,prior);
        // This is a disposable synthetic string, not a secret-store reference. The real wrapper deliberately forbids
        // pasting a concealed value into the system clipboard, and the type cell above proves that production path.
        row.action=await engine.w.execute('paste',{pid,text:value,format:'text'});
        const after=checkpoints, p=row.action.result?.meta?.paste, line=p?.perLine?.[0];
        row.metaDisclosures=actionDisclosures(row.action);
        row.status=pasteStatus(row.action);
        row.rawCountOrRange=matchingReading(line?.baseline,prior.length,0,prior.length) || matchingReading(line?.confirming,value.length,value.length,0);
        if(!row.status) failures.push('paste did not report confirmed or affirmative unconfirmed success');
        if(head==='main' && row.metaDisclosures.includes('synthetic value or fragment')) failures.push('main paste reply exposes the synthetic value');
        if(head==='main' && !smoke && !row.rawCountOrRange) failures.push('main paste reply did not expose the expected raw count or range');
        if(head==='fix' && (row.metaDisclosures.length || Object.keys(row.action.result??{}).some(k=>k!=='meta'&&k!=='note') ||
           !secureReading(line?.baseline) || ('confirming' in (line??{}) && !secureReading(line.confirming)))) {
          failures.push('paste reply did not keep secure readings value-free');
        }
        await actionSurface(engine,row,value,after);
        row.failures=[...failures,...judgePassword(head,row,value,judgeOptions(row.raw,true))];
        coverage.paste[head].push({failures:row.failures,metaDisclosures:row.metaDisclosures,status:row.status,
          rawCountOrRange:row.rawCountOrRange,actionError:row.action.error?.errorName??null});
      });
    } catch(e) {row.invalid=String(e.stack??e);invalid('paste',head,e);}
    finally {record('paste.jsonl',row);}
  }
  save('summary.json',coverage);
}
async function timings() {
  if(!benchLane)return;
  for(const [arm,size] of timingArms.entries()) {
    const large=size!=='small', reuse=size==='large-reused-settle';
    const timing={main:[],fix:[]}, fixture=await setup('',large);
    for(let block=0;block<timingBlocks;block++)for(const head of order(block+arm)) {
      try {
        await useEngine(head,async engine=>{
          const pending=[];
          const rawBefore=isAppKit ? await rawVerify('',fixture) : undefined;
          const check=({native,wallMs,checkpoint},settled=false)=>{
            const {nodes,timings,truncated}=native.result;
            const markers=new Set(nodes.map(n=>n.value).filter(v=>typeof v==='string'&&/^bench-value-\d+$/.test(v)));
            const observed=markers.size, {walkMs,settleBusyWalkMs}=timings;
            const validTree=!timings.deadlineHit&&!timings.budgetHit&&!timings.nodeCapHit&&!(truncated?.count>0)&&passwordNodes(native).length===1
              && observed===(large?benchFields:0) && Number.isFinite(walkMs) && walkMs>=0;
            const validSettle=!settled || (timings.settleTreeReused===true && Number.isFinite(settleBusyWalkMs) && settleBusyWalkMs>=0);
            return {validTree,validSettle,wallMs,walkMs,settleBusyWalkMs,checkpoint,nodeCount:nodes.length,benchValues:observed,truncated,timings};
          };
          const warm=check(await engine.read(fixture,'',true));
          record('timing.jsonl',{size,head,block,warmup:true,rawBefore,...warm});
          if(!warm.validTree) throw Error(`warm-up did not observe owned ${size} tree (${warm.benchValues} benchmark controls)`);
          for(let sample=0;sample<blockSamples;sample++) {
            const row=check(await engine.read(fixture,'',true,reuse),reuse);
            record('timing.jsonl',{size,head,block,sample,...row});
            if(!row.validTree) throw Error(`timed sample did not observe owned ${size} tree (${row.benchValues} benchmark controls)`);
            if(!row.validSettle) throw Error('timed settled sample did not reuse its tree or report its busy walk');
            pending.push(row);
          }
          if(isAppKit) record('timing.jsonl',{size,head,block,rawAfter:await rawVerify('',fixture)});
          timing[head].push(...pending);
        });
      } catch(e) {invalid('timing',head,e,{size,block,n:timing[head].length});}
    }
    coverage.timing[size]={};
    for(const head of headNames) {
      const rows=timing[head];
      coverage.timing[size][head]=rows.length ? {...timingStats(rows),nodes:[Math.min(...rows.map(r=>r.nodeCount)),Math.max(...rows.map(r=>r.nodeCount))],
        benchValues:rows[0].benchValues,...(reuse && {settleBusyWalkMs:timingStats(rows.map(r=>({...r,walkMs:r.settleBusyWalkMs}))).walkMs})} : {n:0};
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
    if(benchLane)for(const size of timingArms)if(coverage.timing[size]?.[head]?.n!==timingBlocks*blockSamples) failures.push(`${head} ${size} timings incomplete`);
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
