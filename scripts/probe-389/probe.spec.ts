// Copied into MAWS/e2e on a hosted disposable checkout. Product source is never edited.
import { test, expect } from '@playwright/test';
import { launchMaws } from './support/launch';
import { seedTranscript } from '../test/support/transcripts';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, appendFileSync, writeFileSync, mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
// @ts-ignore -- the kit checkout is .cua-probe under MAWS's root; Playwright transpiles the test.
import { Wire } from '../.cua-probe/scripts/probe-389/wire.mjs';
const OUT=process.env.PROBE389_OUT!, TEMP=process.env.RUNNER_TEMP!;
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const reps=Number(process.env.PROBE389_REPS??10);
const rows:any[]=[];
// Explicit arm plan; every arm is reported separately, never pooled. The historical arm is the main engine of 2026-11-11 (fresh-observation only).
const ALL=['fresh-observation','earlier-click','covered'];
const cohort=process.env.PROBE389_COHORT??'matrix';
const matrixPlan=[
 {arm:'unmodified',engineDir:'build389',ref:process.env.ENGINE_REF,sequences:ALL,reps},
 {arm:'trace',engineDir:'trace389',ref:process.env.ENGINE_REF,sequences:ALL,reps:2},
 {arm:'history-unmodified',engineDir:'history389',ref:process.env.HISTORY_REF,sequences:['fresh-observation'],reps},
 {arm:'history-trace',engineDir:'history-trace389',ref:process.env.HISTORY_REF,sequences:['fresh-observation'],reps:2},
];
// Panel cohort: the same four arms, after a real native chooser round trip on the foreground scratch MAWS.
const PANEL=['panel-roundtrip'];
const panelPlan=matrixPlan.map(a=>({...a,sequences:PANEL}));
if(cohort!=='matrix'&&cohort!=='panel')throw Error('PROBE389_COHORT must be matrix or panel');
const plan=cohort==='panel'?panelPlan:matrixPlan;
mkdirSync(OUT,{recursive:true});
function save(row:any){rows.push(row);appendFileSync(join(OUT,'rows.jsonl'),JSON.stringify(row)+'\n');console.log(JSON.stringify({id:row.id,valid:row.valid,closed:row.after?.dialog===false,handler:row.handlerRan,error:row.problem,meta:row.call?.raw?.result?.meta}));}
async function stop(p:any){if(!p||p.exitCode!==null)return;p.kill('SIGTERM');await Promise.race([new Promise(r=>p.once('exit',r)),sleep(4000)]);if(p.exitCode===null)p.kill('SIGKILL');}
function origin(profile:string,folder:string){return execFileSync('/usr/bin/sqlite3',['-readonly',join(profile,'index.sqlite'),`SELECT origin FROM projects WHERE directory='${folder.replaceAll("'","''")}';`],{encoding:'utf8'}).trim();}
function summarize(){const groups:any={};for(const r of rows){const key=[r.arm,r.sequence,r.operation].join('/');const g=groups[key]??={rows:0,valid:0,closures:0,handlers:0,unexpectedClosures:0,errors:0};g.rows++;if(!r.valid){g.errors++;continue;}g.valid++;if(r.after.dialog===false)g.closures++;if(r.handlerRan)g.handlers++;if(r.after.dialog===false&&!r.handlerRan)g.unexpectedClosures++;}writeFileSync(join(OUT,'summary.json'),JSON.stringify({groups,rows:rows.length},null,2));}

test('MAWS Add project: ordinary background element press and search set_value',async()=>{
 test.setTimeout(65*60*1000);
 if(process.env.RUNNER_ENVIRONMENT!=='github-hosted')throw Error('hosted runners only');
 writeFileSync(join(OUT,'pins.json'),JSON.stringify({cohort,engine:process.env.ENGINE_REF,historyEngine:process.env.HISTORY_REF,plan:plan.map(a=>({...a,sequences:a.sequences.join(',')})),maws:process.env.MAWS_REF,kit:process.env.PROBE389_KIT,reps,image:process.env.ImageVersion,arms:'Unmodified engine rate; separate logging-only engine trace; historical unmodified and logging-only arms at HISTORY_REF, fresh-observation only. No forced routes. MAWS build:app product UI, launchMaws scratch profile; no live engine.'},null,2));
 const helper=spawn(join(TEMP,'tool389'),[],{stdio:['pipe','pipe','inherit']}),waiters:any[]=[];
 createInterface({input:helper.stdout}).on('line',line=>{const w=waiters.shift();if(w){clearTimeout(w.timer);try{w.resolve(JSON.parse(line));}catch(e){w.reject(e);}}});
 function ask(q:any):Promise<any>{return new Promise((resolve,reject)=>{const w={resolve,reject,timer:setTimeout(()=>reject(Error('helper timeout')),10000)};waiters.push(w);helper.stdin.write(JSON.stringify(q)+'\n');});}
 const cover=spawn(join(TEMP,'Probe389 Cover.app/Contents/MacOS/cover389'),['--cover'],{stdio:['ignore','pipe','inherit']});
 let coverPid:number;
 try {
  coverPid=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('cover launch timeout')),10000);createInterface({input:cover.stdout}).once('line',line=>{clearTimeout(timer);resolve(JSON.parse(line).pid);});});
  for(const {arm,engineDir,ref,sequences,reps:armReps} of plan)for(const sequence of sequences)for(const operation of ['click','set_value'])for(let rep=0;rep<armReps;rep++){
   const row:any={id:[arm,sequence,operation,rep].join('-'),arm,engineRef:ref,sequence,operation,rep,valid:false,calls:[],startedAt:Date.now()};
   let maws:any,w:any,engine:any;const work=mkdtempSync('/tmp/p389-');
   try {
    let folder='';
    maws=await launchMaws({env:{MAWS_ENGINE_REPLAY:'1'},prepare:({userData,claudeConfigDir})=>{folder=join(userData,'probe389-folder');mkdirSync(folder);folder=realpathSync.native(folder);seedTranscript(claudeConfigDir,folder,'Probe 389 scratch discovered session');}});
    const {page,app}=maws;const pid=app.process().pid;row.pid=pid;row.folder=folder;
    // Playwright's Electron bootstrap enables focus emulation on the main page (document.hasFocus() stays true whatever is frontmost). Turn it off once; the session lives until the app is cleaned up.
    const cdp=await page.context().newCDPSession(page);row.focusEmulationOff=await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:false}).then(()=>true);
    await expect(page.locator('[data-region="sidebar"]')).toBeVisible({timeout:30000});
    // Pure renderer observation, kept in one clock and sequence. No synthetic events or focus changes here.
    await page.evaluate(()=>{
     const log:any[]=[];(window as any).__probe389={log};let serial=0;
     const target=(v:any)=>v instanceof Element?{tag:v.tagName,role:v.getAttribute('role'),label:v.getAttribute('aria-label'),id:v.id}:String(v);
     const record=(kind:string,e?:any,extra:any={})=>{const r={seq:++serial,kind,at:Date.now(),perf:performance.now(),hasFocus:document.hasFocus(),active:target(document.activeElement),target:target(e?.target),...extra};log.push(r);return r;};
     (window as any).__probe389.mark=(label:string)=>record('mark',null,{label});
     for(const kind of ['focus','blur'])window.addEventListener(kind,e=>record('window.'+kind,e));
     for(const kind of ['focusin','focusout','pointerdown','pointerup','mousedown','mouseup','click','input','change'])document.addEventListener(kind,e=>record(kind,e,{related:target((e as FocusEvent).relatedTarget)}),true);
     for(const kind of ['dismissableLayer.pointerDownOutside','dismissableLayer.focusOutside'])document.addEventListener(kind,e=>{record(kind,e,{originalType:(e as CustomEvent).detail?.originalEvent?.type});queueMicrotask(()=>record(kind+'.settled',e,{defaultPrevented:e.defaultPrevented,dismissEligible:!e.defaultPrevented}));},true);
     new MutationObserver(()=>{const exists=!!document.querySelector('[role="dialog"]');if((window as any).__probe389.present!==exists){(window as any).__probe389.present=exists;record('dialog.presence',null,{present:exists});}}).observe(document.body,{childList:true,subtree:true});
     record('installed');
    });
    await app.evaluate(({BrowserWindow}:any)=>{const w=BrowserWindow.getAllWindows().find((w:any)=>w.isVisible());w.setBounds({x:20,y:50,width:1200,height:900});w.show();w.focus();});
    {
     // Positive control, per launch and for every cohort: native activation of the cover must take the page's focus, and activating MAWS must give it back with a new window.focus event. A failed control invalidates the trial; it is never read as non-reproduction.
     const hasFocus=()=>page.evaluate(()=>document.hasFocus());
     const focusEvents=()=>page.evaluate(()=>(window as any).__probe389.log.filter((e:any)=>e.kind==='window.focus').length);
     const fc:any=row.focusControl={};
     try {
      fc.initialHasFocus=await hasFocus();fc.baselineFocusEvents=await focusEvents();
      fc.coverFront=await ask({op:'front',pid:coverPid});
      await expect.poll(hasFocus,{timeout:5000}).toBe(false);fc.hasFocusWithCoverFront=false;
      fc.mawsFront=await ask({op:'front',pid});
      await expect.poll(hasFocus,{timeout:5000}).toBe(true);fc.hasFocusWithMawsFront=true;
      fc.newFocusEvents=await focusEvents()-fc.baselineFocusEvents;
      if(fc.newFocusEvents<1)throw Error('no new window.focus event after MAWS was activated');
     } catch(e:any){fc.error=String(e.message??e);fc.hasFocusNow=await hasFocus().catch(()=>null);throw Error('focus-control-invalid: '+fc.error);}
    }
    await expect.poll(()=>origin(maws.userData,folder),{timeout:30000}).toBe('discovered');
    row.originBefore=origin(maws.userData,folder);
    engine=spawn(join(TEMP,engineDir,'release/cua-engine'),[],{env:{...process.env,HOME:work,CUA_ENGINE_SOCKET:join(work,'e.sock')},stdio:['ignore','ignore','pipe']});
    engine.stderr.on('data',d=>appendFileSync(join(OUT,row.id+'-engine.txt'),d));
    w=await Wire.connect(join(work,'e.sock'));const ping=await w.call('ping',{clientApiVersion:'cua-engine-1',desktop:'shared'});if(ping.error)throw Error(JSON.stringify(ping.error));
    async function rpc(method:string,args:any){const call={method,args,startedAt:Date.now(),raw:await w.execute(method,{pid,...args}),endedAt:Date.now()};row.calls.push(call);return call;}
    async function observe(){const r=await rpc('get_app_state',{includeScreenshot:false,disableDiff:true});if(r.raw.error)throw Error('observation '+JSON.stringify(r.raw.error));return r.raw.result.nodes;}
    function token(nodes:any[],role:string,name:string){const n=nodes.find(n=>n.role===role&&[n.title,n.description,n.value].includes(name));if(!n?.token)throw Error('token missing '+role+' '+name+' '+JSON.stringify(nodes));return n.token;}
    const dialog=page.getByRole('dialog',{name:'Add project',exact:true});
    const open=page.getByRole('button',{name:'Add project',exact:true}).first();
    // Setup may use CDP, but measured calls use only the real engine's execute facade.
    if(sequence!=='earlier-click')await open.click();
    if(sequence==='panel-roundtrip'){
     // Setup only: with the e2e pick seam off for this one pick, Choose folder... raises the real native chooser, which is cancelled through its own Cancel button. No engine call is made here.
     const panelStatus=async()=>(await ask({op:'panel-status'})).panels as any[];
     const candidates=async()=>(await panelStatus()).filter(p=>p.cancelEnabled>0);
     const invalid=(why:string)=>Error('setup-invalid: '+why);
     const panel:any=row.panel={};
     const before=await panelStatus();panel.preexisting=before;
     if(before.some(p=>p.cancelEnabled>0))throw invalid('a native panel already exists before opening');
     await page.evaluate(()=> (window as any).__probe389.mark('before-panel'));
     await app.evaluate(()=>{delete process.env.MAWS_E2E;});
     try {
      await dialog.getByRole('button',{name:'Choose folder…',exact:true}).click({timeout:5000});
      let found:any[]=[];
      for(const end=Date.now()+10000;Date.now()<end&&found.length===0;){found=await candidates();if(found.length===0)await sleep(200);}
      panel.candidates=found;
      if(found.length!==1)throw invalid('expected one native panel, found '+found.length);
      panel.cancel=await ask({op:'cancel-panel',pid:found[0].pid});
      if(panel.cancel.error||panel.cancel.pressError!==0)throw invalid('panel Cancel press failed '+JSON.stringify(panel.cancel));
      let gone=false;
      for(const end=Date.now()+10000;Date.now()<end&&!gone;){gone=(await candidates()).length===0;if(!gone)await sleep(200);}
      panel.gone=gone;
      if(!gone)throw invalid('native panel did not go after Cancel');
      await page.evaluate(()=> (window as any).__probe389.mark('after-panel-cancel'));
     } finally {
      await app.evaluate(()=>{process.env.MAWS_E2E='1';});
     }
     // Choose folder... closed the Add project dialog before the chooser: reopen it through CDP before anything is measured.
     await expect(dialog).toBeHidden({timeout:5000});
     await open.click();
    }
    await ask({op:'cover',pid:coverPid,wide:sequence==='covered'});
    row.coverSetup=await ask({op:'front',pid:coverPid});if(row.coverSetup.frontmostPid!==coverPid)throw Error('cover not front');
    // Before the first observation the page must really be in the background (an earlier-click opener may legitimately restore focus later).
    await expect.poll(()=>page.evaluate(()=>document.hasFocus()),{timeout:5000,message:'page still has focus after the cover was activated'}).toBe(false);row.hasFocusAfterCover=false;
    if(sequence==='earlier-click'){
     const nodes=await observe();row.earlierClick=await rpc('click',{element:token(nodes,'AXPopUpButton','Add project')});
     await expect(dialog).toBeVisible({timeout:5000});
    }
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button',{name:'Add probe389-folder',exact:true})).toBeEnabled();
    const nodes=await observe();
    const element=operation==='click'?token(nodes,'AXButton','Add probe389-folder'):token(nodes,nodes.some((n:any)=>n.role==='AXSearchField'&&[n.title,n.description].includes('Search projects'))?'AXSearchField':'AXTextField','Search projects');
    row.before=await page.evaluate(()=>({dialog:!!document.querySelector('[role="dialog"]'),hasFocus:document.hasFocus(),events:(window as any).__probe389.log.length}));
    row.frontBefore=await ask({op:'status',pid:coverPid});if(row.frontBefore.frontmostPid!==coverPid)throw Error('not background before measured call');
    await page.evaluate(()=> (window as any).__probe389.mark('before-measured-call'));
    row.call=await rpc(operation,{element,...(operation==='set_value'?{value:'probe389-folder'}:{})});
    await page.evaluate(()=> (window as any).__probe389.mark('after-measured-call'));
    // A bounded effect window: no re-observation or action can hide an earlier dismissal.
    await sleep(3000);
    row.after=await page.evaluate(()=>({dialog:!!document.querySelector('[role="dialog"]'),search:(document.querySelector('input[aria-label="Search projects"]') as HTMLInputElement)?.value??null,hasFocus:document.hasFocus(),events:(window as any).__probe389.log}));
    row.originAfter=origin(maws.userData,folder);row.handlerRan=operation==='click'?row.originAfter==='user':row.after.search==='probe389-folder';
    row.frontAfter=await ask({op:'status',pid:coverPid});
    row.valid=true;
    if(rep===0||(!row.after.dialog&&!row.handlerRan))await page.screenshot({path:join(OUT,row.id+'.png')});
   } catch(e:any){row.problem=String(e.stack??e);if(maws)try{row.failureDOM=await maws.page.locator('body').innerText();}catch{}}
   finally {w?.close();await stop(engine);if(maws)try{await maws.cleanup();}catch(e){row.cleanupError=String(e);row.valid=false;}rmSync(work,{recursive:true,force:true});row.endedAt=Date.now();save(row);summarize();}
   if(!row.valid)throw Error('invalid trial '+row.id+': '+row.problem+' '+row.cleanupError);
  }
 } finally {await stop(cover);helper.stdin.end();await stop(helper);summarize();}
 expect(rows.filter(r=>!r.valid)).toHaveLength(0);
});
