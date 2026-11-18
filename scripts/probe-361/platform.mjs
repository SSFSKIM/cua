// The lane's owned target, its fixture and the owned cover, adapted from ../probe-414/platform.mjs for plain text fields:
// no password page, and every lane (AppKit included) tries the background under the cover before a frontmost fallback.
import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {firefoxProfile} from '../probe-pw-walk/firefox-profile.mjs';
import {createFixture} from '../probe-414/fixture-server.mjs';
import {owned,stop,pause,until,environment} from '../probe-414/platform.mjs';
import {page} from './page.mjs';

export {owned,stop,pause,until,environment};
const plistVersion=bundle=>execFileSync('/usr/libexec/PlistBuddy',['-c','Print :CFBundleShortVersionString',bundle+'/Contents/Info.plist'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
const safari='/Applications/Safari.app', cft='/Applications/Google Chrome for Testing.app', firefox='/Applications/Firefox.app';
const setupFail=step=>Object.assign(Error('setup '+step),{setupStep:step});

// The owned helper (host.swift) alone: input sources and the pasteboard need no target. It keeps the disposable runner's
// own HOME, so the input-source selection it makes is the session's (the engine and the targets keep temporary homes).
export const helperEnv=()=>({...environment(process.env.HOME),TMPDIR:process.env.RUNNER_TEMP??process.env.TMPDIR});
export function startHelper(helper){
  const side=owned(helper,[],helperEnv());
  return {ask:(q,ms)=>side.ask(q,()=>true,ms),close:()=>stop(side)};
}

export async function startPlatform({lane,home,helper,cover,appkit,stage}){
  const env=environment(home), profile=join(home,'profile');
  const ask=q=>helper.ask(q);
  let fx,app,coverApp,pid,bundle,version,active,presentation='background',fallback=null,appkitRequest=0,appReady,coverReady;
  const dispose=async()=>{
    fx?.close();
    // As in #414's kit: the owned Chrome for Testing and Safari are never signalled; the hosted job's cleanup ends them.
    const release=child=>{if(child){child.stdin?.destroy();child.stdout?.destroy();child.stderr?.destroy();child.unref();}return true;};
    await Promise.all([stop(coverApp),lane==='cft'?release(app):stop(app)]);
  };
  const front=async(target,activate=false)=>(await ask({op:'front',pid:target,activate,safariPid:pid})).frontmostPid===target;
  const ensureFront=target=>until(()=>front(target,true),9000);
  const command=(q,ms=8000)=>fx?fx.command(q,ms):app.ask({...q,request:++appkitRequest},r=>r.request===appkitRequest,ms);
  try{
    stage('launch');
    if(lane!=='appkit')fx=await createFixture(page(),{lostMs:8000});
    if(lane==='safari'){
      bundle='com.apple.Safari';
      if((await ask({op:'lookup',bundle})).pid)throw Error('Safari already present');
      execFileSync('/usr/bin/open',['-a',safari,'--env','HOME='+home,fx.url],{env,stdio:'ignore'});
      pid=await until(async()=>(await ask({op:'lookup',bundle})).pid,30000);
      version=plistVersion(safari);
    }else if(lane==='appkit'){
      app=owned(appkit,[],env,{stdout:l=>{try{if(JSON.parse(l).ready===true)appReady=true;}catch{}}});
      pid=app.pid;version='NSTextField + NSTextView';
      await until(()=>appReady,30000);
    }else if(lane==='electron'){
      const dir=resolve('scripts/probe-390/fixture'), require=createRequire(join(dir,'package.json'));
      app=owned(require('electron'),[dir],{...env,PROBE366_URL:fx.url,PROBE366_PROFILE:profile,PROBE366_WINDOW_STYLE:'default'},{stdout:l=>{
        try{const q=JSON.parse(l);if(q.kind==='fixture-ready'&&q.pid===app.pid)appReady=q;}catch{}
      }});
      pid=app.pid;const r=await until(()=>appReady,60000);version=`Electron ${r.electron} / Chromium ${r.chrome}`;
    }else if(lane==='firefox'){
      app=owned(firefox+'/Contents/MacOS/firefox',['-no-remote','-profile',firefoxProfile(profile),fx.url],env);
      pid=app.pid;version=plistVersion(firefox);
    }else if(lane==='cft'){
      const bin=cft+'/Contents/MacOS/Google Chrome for Testing';
      if(!existsSync(bin))throw Error('CfT unavailable');
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
    if(fx)await fx.bindVisible(async()=>(await ask({op:'titles',pid})).titles,15000);
    await ask({op:'enable',pid});
    if(lane==='safari'){
      try{execFileSync('/usr/bin/osascript',['-e',`tell application "System Events"\ntell (first process whose unix id is ${pid})\nset position of window 1 to {400, 30}\nset size of window 1 to {620, 720}\nend tell\nend tell`],{env,stdio:'ignore',timeout:15000});}catch{stage('safari-placement');throw Error('owned Safari placement');}
    }
    stage('cover-launch');
    coverApp=owned(cover,['--cover'],env,{stdout:l=>{try{if(JSON.parse(l).pid===coverApp.pid)coverReady=true;}catch{}}});
    await until(()=>coverReady);
    await until(async()=>{const r=await ask({op:'cover',pid:coverApp.pid});return r.bundleOk&&r.onScreen;});
    active=coverApp.pid;
    // Every trial: the target raised and its setup field focused, then the cover raised, the activation witness armed, and
    // the target field seeded (value, selection, control) without activating anything. Fails before any input.
    async function arm(trial,m,onStage=()=>{}){
      onStage('foreground');
      try{await ensureFront(pid);}catch{throw setupFail('foreground-activation');}
      onStage('prepare');
      const prep=await command({op:'prepare',trial,setupText:m.setupText});
      if(prep.trial!==trial||!prep.setupFocused||prep.setupExact!==true)throw setupFail('prepare');
      if(presentation==='background'){
        onStage('cover');
        try{await ensureFront(active);}catch{throw setupFail('cover-activation');}
        await pause(250);
      }
      onStage('witness');
      const a=await ask({op:'arm',pid,coverPid:active});
      if(!a.valid)throw setupFail('witness');
      const q={trial,target:m.field,initial:m.initial,start:m.start,end:m.end,effect:m.effect,staleTo:m.staleTo,rewriteChar:m.rewriteChar,
        expected:m.initial,setupText:m.setupText};
      const seeded=s=>s.trial===trial&&s.target===m.field&&s.shape&&s.focused&&s.exact&&s.selection&&s.setupExact===true&&!s.hit&&s.pastes===0&&s.pasteInputs===0;
      try{
        onStage('seed');
        if(!seeded(await command({op:'seed',...q})))throw setupFail('seed');
        if(presentation==='background')await pause(250);
        if(!seeded(await command({op:'read',...q})))throw setupFail('seed-unstable');
      }catch(e){await ask({op:'disarm'});throw e;}
    }
    // The witness's verdict over the action: whether anything other than the cover activated (the paste route's own
    // activation is meant to be fake). A measurement, not a setup verdict, once the arm was valid.
    const disarm=async()=>{const r=await ask({op:'disarm'});return {held:r.valid===true,reason:typeof r.reason==='string'?r.reason:null};};
    stage('presentation-probe');
    const empty={field:'single',initial:'',start:0,end:0,effect:'none',staleTo:null,rewriteChar:'',setupText:'probe'};
    try{await arm(-1,empty);if(!(await disarm()).held)throw setupFail('presentation-witness');}
    catch(e){
      // The background could not be set up (before any cua call): the lane runs frontmost, and says why.
      fallback=e.setupStep??'presentation';presentation='frontmost';active=pid;
      await arm(-2,empty);if(!(await disarm()).held)throw Error('frontmost witness');
    }
    return {pid,bundle,version,get presentation(){return presentation;},get fallback(){return fallback;},arm,disarm,command,dispose};
  }catch(e){await dispose();throw e;}
}
