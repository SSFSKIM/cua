import {spawn,execFileSync} from 'node:child_process';
import {existsSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createInterface} from 'node:readline';
import {createRequire} from 'node:module';
import {firefoxProfile} from '../probe-pw-walk/firefox-profile.mjs';
import {createFixture} from './fixture-server.mjs';
import {page,FILLER} from './page.mjs';

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
const plistVersion=bundle=>execFileSync('/usr/libexec/PlistBuddy',['-c','Print :CFBundleShortVersionString',bundle+'/Contents/Info.plist'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
const safari='/Applications/Safari.app', cft='/Applications/Google Chrome for Testing.app', firefox='/Applications/Firefox.app';
export async function startPlatform({lane,home,helper,cover,appkit,stage,singlePassword=false}){
  const env=environment(home), profile=join(home,'profile');
  const side=owned(helper,[],env), ask=q=>side.ask(q);
  let fx,app,coverApp,pid,safariStarted=false,bundle,version,active,presentation='background',fallback=null,appkitRequest=0;
  let appReady,coverReady;
  const dispose=async()=>{
    fx?.close();
    // The owned Chrome for Testing child is never signalled (project rule); the job's cleanup ends it. Its parent-side pipes are
    // closed and it is unreferenced so Node can exit.
    const release=child=>{if(child){child.stdin?.destroy();child.stdout?.destroy();child.stderr?.destroy();child.unref();}return true;};
    await Promise.all([stop(coverApp),lane==='cft'?release(app):stop(app)]);
    // The owned Safari process belongs to the disposable hosted job; do not signal a browser or browser host.
    await stop(side);
  };
  let lastFront=null,coverActivation=null,coverEstablished=false;
  const front=async(target,activate=false)=>{
    const r=await ask({op:'front',pid:target,activate,safariPid:pid});
    // Fixed-label host diagnostics only, never a pid.
    if(activate)lastFront={activationAccepted:r.activationAccepted??null,workspaceFront:r.workspaceFront??null,targetBundle:r.targetBundle??null,targetTerminated:r.targetTerminated??null};
    return r.frontmostPid===target;
  };
  const ensureFront=target=>until(()=>front(target,true),9000);
  // A setup failure names the fixed step that failed, so a cover failure is never confused with a seed or focus failure.
  const setupFail=(step,extra={})=>Object.assign(Error('setup '+step),{setupStep:step,...extra});
  // The owned cover only: normal verified activation, then at most one `open -a` of its own bundle. Only the cover's own pid
  // ever counts as frontmost, and nothing here touches the target.
  const raiseCover=async()=>{
    try{await ensureFront(coverApp.pid);coverActivation='ns';return;}catch{}
    const normal=lastFront;
    const bundlePath=/^(.*?\.app)\//.exec(cover)?.[1];
    let opened=false;
    if(bundlePath){try{execFileSync('/usr/bin/open',['-a',bundlePath],{env,stdio:'ignore',timeout:10000});opened=true;}catch{}}
    if(opened){try{await until(()=>front(coverApp.pid),6000);coverActivation='open';return;}catch{}}
    throw setupFail('cover-activation',{coverDiagnostic:{normal,openAttempted:opened,final:lastFront}});
  };
  const command=(q,ms=8000)=>fx?fx.command(q,ms):app.ask({...q,request:++appkitRequest},r=>r.request===appkitRequest,ms);
  try{
    stage('launch');
    if(lane!=='appkit')fx=await createFixture(page(lane==='safari'?FILLER:0,singlePassword),{lostMs:8000});
    if(lane==='safari'){
      bundle='com.apple.Safari';
      if((await ask({op:'lookup',bundle})).pid)throw Error('Safari already present');
      execFileSync('/usr/bin/open',['-a',safari,'--env','HOME='+home,fx.url],{env,stdio:'ignore'});
      safariStarted=true;
      pid=await until(async()=> (await ask({op:'lookup',bundle})).pid,30000);
      version=plistVersion(safari);
    }else if(lane==='appkit'){
      app=owned(appkit,[],env,{stdout:l=>{try{if(JSON.parse(l).ready===true)appReady=true;}catch{}}});
      pid=app.pid;version='NSSecureTextField';
      await until(()=>appReady,30000);
    }else if(lane.startsWith('electron')){
      const dir=resolve('scripts/probe-390/fixture'), require=createRequire(join(dir,'package.json'));
      app=owned(require('electron'),[dir],{...env,PROBE366_URL:fx.url,PROBE366_PROFILE:profile,
        PROBE366_WINDOW_STYLE:lane==='electron-parity'?'maws':'default'}, {stdout:l=>{
        try{const q=JSON.parse(l);if(q.kind==='fixture-ready'&&q.pid===app.pid)appReady=q;}catch{}
      }});
      pid=app.pid;const r=await until(()=>appReady,60000);version=`Electron ${r.electron} / Chromium ${r.chrome}`;
    }else if(lane==='firefox'){
      app=owned(firefox+'/Contents/MacOS/firefox',['-no-remote','-profile',firefoxProfile(profile),fx.url],env);
      pid=app.pid;version=plistVersion(firefox);
    }else if(lane==='cft'){
      const bin=cft+'/Contents/MacOS/Google Chrome for Testing';
      if(!existsSync(bin))throw Error('CfT unavailable');
      // As in #405, Chrome for Testing inherits the disposable runner HOME and has an explicit isolated profile.
      app=owned(bin,['--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','--disable-search-engine-choice-screen',
        '--disable-features=Translate','--lang=en-US','--window-position=400,30','--window-size=620,700',fx.url],{...env,HOME:process.env.HOME});
      pid=app.pid;version=plistVersion(cft);
    }else throw Error('unknown lane');
    stage('target-ready');
    if(fx)await fx.waitReady(45000);
    const info=await until(async()=>{const r=await ask({op:'status',pid});return r.ready&&r.bundle&&r;},45000);
    if(bundle&&bundle!==info.bundle)throw Error('owned bundle mismatch');
    bundle=info.bundle;
    await ensureFront(pid);
    if(fx)await fx.bindVisible(async()=> (await ask({op:'titles',pid})).titles,15000);
    await ask({op:'enable',pid});
    if(safariStarted){
      // Keep the same visible, nonoverlapping frames as the #395 proof; only address our owned Safari PID.
      try{execFileSync('/usr/bin/osascript',['-e',`tell application "System Events"\ntell (first process whose unix id is ${pid})\nset position of window 1 to {400, 30}\nset size of window 1 to {620, 720}\nend tell\nend tell`],{env,stdio:'ignore',timeout:15000});}catch{stage('safari-placement');throw Error('owned Safari placement');}
    }
    if(lane==='appkit'){
      // Its secure editor has activated the fixture during background input, even after a clean empty preflight.
      presentation='frontmost';fallback='background-secure-editor';active=pid;
    }else{
      stage('cover-launch');
      coverApp=owned(cover,['--cover'],env,{stdout:l=>{try{if(JSON.parse(l).pid===coverApp.pid)coverReady=true;}catch{}}});
      await until(()=>coverReady);
      await until(async()=>{const r=await ask({op:'cover',pid:coverApp.pid});return r.bundleOk&&r.onScreen;});
      active=coverApp.pid;
    }
    async function arm(trial,m,onStage=()=>{}){
      const q={op:'seed',trial,...m},plain=m.target==='plain';
      // #420's plain cells: the pre-action check is the setup field empty and focused, no key or input on it yet, and the
      // password field empty too. A row whose check fails is setup-invalid, never scored.
      const seeded=s=>s.trial===trial&&s.shape&&(plain?s.plainFocused&&s.plainEmpty===true&&!s.plainKey&&!s.plainInput:s.focused&&s.selection)&&
        s.exact&&!s.key&&!s.hit;
      // The password-only Firefox cell has no setup input. The one first trial focuses and seeds the password while Firefox is
      // frontmost and then raises the owned cover; every later trial keeps that same focused node and never raises Firefox or
      // focuses the page again. If the background cannot be verified the setup is invalid; there is no frontmost fallback.
      const keep=singlePassword&&coverEstablished;
      onStage('prepare');
      if(keep){if(!await front(active))throw setupFail('cover-lost');}
      else{try{await ensureFront(pid);}catch{throw setupFail('foreground-activation');}}
      const prep=await command({op:'prepare',trial,expected:'',setupText:m.setupText,keepFocus:keep||undefined});
      if(prep.trial!==trial||!prep.shape||!(singlePassword?prep.focused:prep.plainFocused)||!prep.exact||(m.setupText&&prep.setupExact!==true)||
        (plain&&prep.plainEmpty!==true))
        throw singlePassword?setupFail(keep?'password-focus-lost':'foreground-focus'):Error('prepare fixture');
      if(singlePassword&&!keep){
        onStage('foreground-seed');
        if(!seeded(await command(q)))throw setupFail('foreground-seed');
      }
      if(presentation==='background'){
        onStage('cover');
        if(singlePassword){if(!keep){await raiseCover();coverEstablished=true;await pause(250);}}
        else{await ensureFront(active);await pause(250);}
      }
      onStage('witness');
      const a=await ask({op:'arm',pid,coverPid:active});
      if(!a.valid)throw singlePassword?setupFail('witness',{reason:typeof a.reason==='string'?a.reason:null}):Error('arm witness');
      try{
        onStage('seed');
        if(!singlePassword&&!seeded(await command(q)))throw Error('seed fixture');
        if(keep&&!seeded(await command({...q,keepFocus:true})))throw setupFail('background-seed');
        if(presentation==='background')await pause(250);
        if(!seeded(await command({...q,op:'read'})))throw singlePassword?setupFail('seed-unstable'):Error('seed unstable');
      }catch(e){await ask({op:'disarm'});throw e;}
    }
    const disarm=async()=> (await ask({op:'disarm'})).valid===true;
    // A frontmost fallback is a setup capability decision made without cua and before any input. Safari must use its cover.
    stage('presentation-probe');
    let probeStage='prepare';
    const empty={expected:'',start:0,end:0,effect:'none',first:''};
    try{await arm(-1,empty,x=>{probeStage=x;});if(!await disarm())throw Error('presentation witness');}
    catch(e){
      // Password-only Firefox gets exactly one background attempt: a failure names its step and is setup-invalid, never frontmost.
      if(singlePassword){stage('presentation-'+probeStage);throw e;}
      if(lane==='safari'||probeStage==='prepare')throw e;
      fallback=probeStage;presentation='frontmost';active=pid;
      await arm(-2,empty);if(!await disarm())throw Error('frontmost witness');
    }
    async function appkitCapabilities(){
      if(lane!=='appkit')return null;
      const expected='appkit-probe';
      try{
        await arm(-3,{expected,start:0,end:0,effect:'none',first:''});
        const answer=await ask({op:'appkit-capabilities',pid,expectedUnits:expected.length});
        if(!await disarm()||answer.unavailable===true)return {unavailable:true};
        const names=a=>Array.isArray(a)?a.filter(n=>typeof n==='string'&&/^AX[A-Za-z0-9]{1,80}$/.test(n)):null;
        const bool=v=>typeof v==='boolean'?v:null;
        return {attributeNames:names(answer.attributeNames),parameterizedNames:names(answer.parameterizedNames),
          visibleRange:{readable:bool(answer.visibleRange?.readable),atZero:bool(answer.visibleRange?.atZero),matchesFixture:bool(answer.visibleRange?.matchesFixture)}};
      }catch{try{await disarm();}catch{}return {unavailable:true};}
    }
    // #420: the general pasteboard's change count, read around a secret's type call.
    const pasteboard=async()=>{const n=(await ask({op:'pasteboard'})).changeCount;return Number.isSafeInteger(n)?n:null;};
    return {pid,bundle,version,presentation,fallback,get coverActivation(){return coverActivation;},arm,disarm,command,dispose,appkitCapabilities,pasteboard};
  }catch(e){await dispose();throw e;}
}
