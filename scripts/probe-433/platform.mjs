// The fixture lanes' owned browser, its page and the owned cover, adapted from ../probe-398/platform.mjs (probe/398-qual)
// without its AppKit lane: every lane tries the background under the cover (with #395's activation witness) before a
// frontmost fallback.
import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {createFixture} from './fixture-server.mjs';
import {owned,stop,pause,until,environment,plistVersion} from './proc.mjs';
import {page} from './page.mjs';
import {CELLS} from './cells.mjs';

export {owned,stop,pause,until,environment};
const safari='/Applications/Safari.app', cft='/Applications/Google Chrome for Testing.app';
const setupFail=step=>Object.assign(Error('setup '+step),{setupStep:step});

export function startHelper(helper,env){
  const side=owned(helper,[],env);
  return {ask:(q,ms)=>side.ask(q,()=>true,ms),close:()=>stop(side)};
}

export async function startPlatform({lane,home,helper,cover,stage}){
  const env=environment(home), profile=join(home,'profile');
  const ask=q=>helper.ask(q);
  let fx,app,coverApp,pid,bundle,version,active,presentation='background',fallback=null,appReady,coverReady;
  const dispose=async()=>{
    fx?.close();
    // As in #414's kit: the owned Chrome for Testing and Safari are never signalled; the hosted job's cleanup ends them.
    const release=child=>{if(child){child.stdin?.destroy();child.stdout?.destroy();child.stderr?.destroy();child.unref();}return true;};
    await Promise.all([stop(coverApp),lane==='cft'?release(app):stop(app)]);
  };
  const front=async(target,activate=false)=>(await ask({op:'front',pid:target,activate})).frontmostPid===target;
  const ensureFront=target=>until(()=>front(target,true),9000);
  const command=(q,ms=8000)=>fx.command(q,ms);
  try{
    stage('launch');
    fx=await createFixture(page(),{lostMs:8000});
    if(lane==='safari'){
      bundle='com.apple.Safari';
      if((await ask({op:'lookup',bundle})).pid)throw Error('Safari already present');
      execFileSync('/usr/bin/open',['-a',safari,'--env','HOME='+home,fx.url],{env,stdio:'ignore'});
      pid=await until(async()=>(await ask({op:'lookup',bundle})).pid,30000);
      version=plistVersion(safari);
    }else if(lane==='electron'){
      const dir=resolve('scripts/probe-433/electron'), require=createRequire(join(dir,'package.json'));
      app=owned(require('electron'),[dir],{...env,PROBE433_URL:fx.url,PROBE433_PROFILE:profile},{stdout:l=>{
        try{const q=JSON.parse(l);if(q.kind==='fixture-ready'&&q.pid===app.pid)appReady=q;}catch{}
      }});
      pid=app.pid;const r=await until(()=>appReady,60000);version=`Electron ${r.electron} / Chromium ${r.chrome}`;
    }else if(lane==='cft'){
      const bin=cft+'/Contents/MacOS/Google Chrome for Testing';
      if(!existsSync(bin))throw Error('CfT unavailable');
      app=owned(bin,['--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','--disable-search-engine-choice-screen',
        '--disable-features=Translate','--lang=en-US','--window-position=400,30','--window-size=620,700',fx.url],{...env,HOME:process.env.HOME});
      pid=app.pid;version=plistVersion(cft);
    }else throw Error('unknown lane');
    stage('target-ready');
    await fx.waitReady(45000);
    const info=await until(async()=>{const r=await ask({op:'status',pid});return r.ready&&r.bundle&&r;},45000);
    if(bundle&&bundle!==info.bundle)throw Error('owned bundle mismatch');
    bundle=info.bundle;
    await ensureFront(pid);
    await fx.bindVisible(async()=>(await ask({op:'titles',pid})).titles,15000);
    await ask({op:'enable',pid});
    if(lane==='safari'){
      try{execFileSync('/usr/bin/osascript',['-e',`tell application "System Events"\ntell (first process whose unix id is ${pid})\nset position of window 1 to {400, 30}\nset size of window 1 to {620, 720}\nend tell\nend tell`],{env,stdio:'ignore',timeout:15000});}catch{stage('safari-placement');throw Error('owned Safari placement');}
    }
    stage('cover-launch');
    coverApp=owned(cover,['--cover'],env,{stdout:l=>{try{if(JSON.parse(l).pid===coverApp.pid)coverReady=true;}catch{}}});
    await until(()=>coverReady);
    await until(async()=>{const r=await ask({op:'cover',pid:coverApp.pid});return r.bundleOk&&r.onScreen;});
    active=coverApp.pid;
    // Every trial: the target raised and the page prepared for the cell (its three links built afresh, the target with
    // the cell's text), then the cover raised and the activation witness armed. Fails before any cua call.
    async function arm(trial,m,onStage=()=>{}){
      onStage('foreground');
      try{await ensureFront(pid);}catch{throw setupFail('foreground-activation');}
      onStage('prepare');
      const prep=await command({op:'prepare',trial,cell:m.cell},20000);
      if(prep.error||prep.trial!==trial||prep.present!==true||prep.text!==CELLS[m.cell].before||!prep.geometry?.textRect)throw setupFail('prepare');
      if(presentation==='background'){
        onStage('cover');
        try{await ensureFront(active);}catch{throw setupFail('cover-activation');}
        await pause(250);
      }
      onStage('witness');
      const a=await ask({op:'arm',pid,coverPid:active});
      if(!a.valid)throw setupFail('witness');
      return prep;
    }
    // Still the presentation armed, just before the first action: a loss here is setup, not the action's.
    const witness=async()=>(await ask({op:'witness'})).valid===true;
    // The witness's verdict over the actions: whether anything other than the cover activated. A measurement, once armed.
    const disarm=async()=>{const r=await ask({op:'disarm'});return {held:r.valid===true,reason:typeof r.reason==='string'?r.reason:null};};
    // How many of the owned app's AXStaticTexts read the cell's text before and after its change (counts only): whether
    // the change reached the accessibility tree before the click.
    const axText=async(before,after)=>{
      const r=await helper.ask({op:'axtext',pid,before,after},5000);
      return Number.isInteger(r?.before)&&Number.isInteger(r?.after)?{before:r.before,after:r.after}:null;
    };
    stage('presentation-probe');
    const probe={cell:'plain'};
    try{await arm(-1,probe);if(!(await disarm()).held)throw setupFail('presentation-witness');}
    catch(e){
      // The background could not be set up (before any cua call): the lane runs frontmost, and says why.
      fallback=e.setupStep??'presentation';presentation='frontmost';active=pid;
      await arm(-2,probe);if(!(await disarm()).held)throw Error('frontmost witness');
    }
    return {pid,bundle,version,get presentation(){return presentation;},get fallback(){return fallback;},arm,witness,disarm,command,axText,dispose};
  }catch(e){await dispose();throw e;}
}
