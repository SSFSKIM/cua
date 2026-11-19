// #431's hosted measurement and qualification of #296's stale-point guard (on #340's kit): a control removed or changed between the
// screenshot and a coordinate click. Hosted runners only. Never prints child output or a raw reply; it stages closed
// codes, booleans, counts, frames of the owned page's links and times. Link truth is the owned page's pointer-event
// log; cua is driven on the engine's own wire (get_app_state with a screenshot, then click at the screenshot's pixels),
// one engine connection per trial, so each trial starts a fresh lineage and a fresh stale-point record.
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {Wire} from './wire.mjs';
import {owned,stop,pause,environment,startPlatform,startHelper} from './platform.mjs';
import {LANES,CELLS,recordedRole,controlRole,unitKey,unitsForLane,isReportOnly,repsOf,plan,pointFor} from './cells.mjs';
import {outcomeOf,stalePointOf,routeOf,findLink,uncoveredBy,nodeAt,landingOf,delta,score,summarize,coverage,judge} from './check.mjs';

const setupLabel=e=>typeof e?.setupStep==='string'?e.setupStep:'other';
const stepError=step=>Object.assign(Error(step),{setupStep:step});

// A screen point in the observation's screenshot pixels (what a coordinate click is given), and the screen point the
// engine will post from them (its pixels divided by the image's size over the window's frame, per axis).
export function toPixels(sky,p){
  const f=sky?.window?.frame,shot=sky?.screenshot;
  if(!f||!shot||!(f.width>0)||!(f.height>0)||!(shot.width>0)||!(shot.height>0)||!p)return null;
  const sx=shot.width/f.width,sy=shot.height/f.height;
  const px={x:Math.round((p.x-f.x)*sx),y:Math.round((p.y-f.y)*sy)};
  return {px,screen:{x:f.x+px.x/sx,y:f.y+px.y/sy}};
}

async function startEngine({name,bin,root,platform,linkText}){
  const home=join(root,'e-'+name);mkdirSync(home,{mode:0o700});const socket=join(home,'e.sock'),prime=join(home,'prime');
  mkdirSync(prime,{mode:0o700});
  const child=owned(bin,[],{...environment(home),CUA_ENGINE_SOCKET:socket});
  let w;
  async function attach(){
    if(w)return w;
    w=await Wire.connect(socket,{timeoutMs:15000});
    const ping=await w.call('ping',{clientApiVersion:'cua-engine-1',desktop:'shared'});
    if(ping.error||!ping.result)throw Error('engine ping failed');
    return w;
  }
  async function disconnect(){
    if(!w)return;
    const old=w;w=null;
    try{await old.call('endTask',{});}catch{}
    const closed=new Promise(ok=>old.socket.once('close',()=>ok(true)));
    old.close();
    if(!await Promise.race([closed,pause(2000).then(()=>false)]))old.socket.destroy();
  }
  try{
    await attach();
    const target=(await w.execute('resolve_app',{pid:platform.pid})).result;
    if(target?.pid!==platform.pid||target?.bundleIdentifier!==platform.bundle||!target.appPath?.startsWith('/'))throw Error('owned target unresolved');
    // Prime AX access and the screenshot path before the first scored trial, as the trials observe: each priming
    // observation must answer with a screenshot (else the lane aborts as setup), up to three until it finds the prepared
    // page's link. Then no connection is held between trials.
    let primed=false;
    for(let i=0;i<3&&!primed;i++){
      if(i)await pause(1000);
      const r=await w.execute('get_app_state',{pid:platform.pid,includeScreenshot:true,outputDirectory:prime,disableDiff:true});
      if(r?.error||!r?.result?.screenshot)throw stepError('prime');
      primed=!!findLink(r.result.nodes,linkText);
    }
    await disconnect();
    const call=async(method,args)=>{
      const started=performance.now();
      let reply;
      try{reply=await w.execute(method,args);}catch{reply=null;}
      return {reply,ms:Math.round(performance.now()-started)};
    };
    return {appPath:target.appPath,primed,attach,disconnect,call,close:async()=>{await disconnect();return stop(child);}};
  }catch(e){w?.close();await stop(child);throw e;}
}

async function main(){
  const [lane,mode,root,out,helperBin,cover,...headSpecs]=process.argv.slice(2);
  if(process.env.RUNNER_ENVIRONMENT!=='github-hosted')throw Error('hosted runners only');
  if(!LANES.includes(lane)||!['smoke','measure','qualify'].includes(mode))throw Error('invalid lane');
  const heads=Object.fromEntries(headSpecs.map(s=>{const [name,bin]=s.split('::');return [name,{bin}];}));
  // Repetitions per unit and head, when the dispatch names them (`reps`); else the mode's.
  const reps=repsOf(process.env.PROBE_REPS||'');
  // A cell measured on some lanes only (`lanes`) is not planned on the others.
  const headNames=Object.keys(heads),units=unitsForLane(process.env.PROBE_CELLS||'',lane);
  if(!headNames.length||headNames.some(h=>!['main','fix'].includes(h))||mode==='qualify'&&headNames.length!==2)throw Error('invalid heads');
  mkdirSync(out,{recursive:true});const tmp=mkdtempSync(join(root,'q431-')),home=join(tmp,'platform'),shots=join(tmp,'shots');
  mkdirSync(home);mkdirSync(shots,{mode:0o700});
  const config={kit:process.env.GITHUB_SHA,refs:{main:process.env.MAIN_SHA,fix:process.env.FIX_SHA||null},image:process.env.ImageVersion,
    os:execFileSync('sw_vers',['-productVersion'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim(),lane,mode,heads:headNames,cells:process.env.PROBE_CELLS||null};
  const rows=[],engines={},planned={};let platform,helper,stage='helper',abort=null,abortStep=null;
  try{
    // A lane with no unit of the dispatch's cells runs nothing and passes nothing (the plan job drops such lanes).
    if(!units.length){stage='no-units';throw Object.assign(Error('no units'),{setupStep:'no-units'});}
    helper=startHelper(helperBin,environment(home));
    stage='launch';
    platform=await startPlatform({lane,home,helper,cover,stage:x=>{stage=x;}});
    Object.assign(config,{version:platform.version,presentation:platform.presentation,foregroundFallback:platform.fallback});
    stage='engine-start';
    // The page holds the presentation probe's prepare (cell `plain`) until the first trial.
    for(const [name,{bin}] of Object.entries(heads))engines[name]=await startEngine({name,bin,root:tmp,platform,linkText:CELLS.plain.before});
    config.primed=Object.fromEntries(Object.entries(engines).map(([k,e])=>[k,e.primed]));
    const cells=plan({mode,heads:headNames,units,reps});
    for(const c of cells)planned[`${c.head}/${unitKey(c)}`]=(planned[`${c.head}/${unitKey(c)}`]??0)+1;
    let trial=0,streak=0;
    for(const c of cells){
      const e=engines[c.head],app=e.appPath,spec=CELLS[c.cell];
      let s='engine-attach',attested=false,armed=false,observeFailed=false,observed=null,found=null,placed=null,mark=null,click=null,read=null,
        after=null,reobserved=false,witness=null,invalid=null,exercised=null,walk=null,observeTries=0;
      try{
        const w=await e.attach();
        await platform.arm(++trial,{cell:c.cell},x=>{s=x;});armed=true;
        s='observe';
        observed=await e.call('get_app_state',{app,includeScreenshot:true,outputDirectory:shots});
        // A cell whose page fills the node cap is prepared only once the browser's accessibility tree holds the filler
        // (Chrome for Testing builds it late: smoke run 44519774336 read 65 nodes): until an observation stops at the cap,
        // up to three more, a second apart. Each replaces the last, record included, and all come before the change.
        observeTries=1;
        for(const capCell=spec.twin==='cap'||spec.big==='cap';capCell&&observeTries<4&&observed.reply?.result?.timings?.nodeCapHit!==true;observeTries++){
          await pause(1000);
          observed=await e.call('get_app_state',{app,includeScreenshot:true,outputDirectory:shots});
        }
        const sky=observed.reply?.result;
        // What the walk read: its node count, what it cut (count and depth) and whether the node cap stopped it.
        if(sky)walk={nodes:Array.isArray(sky.nodes)?sky.nodes.length:null,cut:Number.isInteger(sky.truncated?.count)?sky.truncated.count:0,
          depth:Number.isInteger(sky.truncated?.depth)?sky.truncated.depth:null,nodeCapHit:sky.timings?.nodeCapHit===true};
        // The page is prepared and attested: an observation (or the link in it) missing now is the head's own answer,
        // a valid row whose verdict says so, once the page re-attests that it still holds the prepared link.
        if(sky&&w.lineage)found=findLink(sky.nodes,spec.before,{first:!!spec.twin,role:controlRole(c.cell)});
        if(!found){
          observeFailed=true;
          s='reattest';
          const r=await platform.command({op:'read',trial});
          if(r.error||r.trial!==trial||r.present!==true||r.text!==spec.before)throw stepError('reattest');
          s='witness-before-action';
          if(!await platform.witness())throw stepError('witness-before-action');
          attested=true;
        }else{
          s='placement';
          placed=toPixels(sky,pointFor(c.at,found[c.at]?.frame));
          if(!placed)throw stepError('screenshot');
          // The observation itself puts the unit's role at the point the engine will post: else the unit is not tested.
          if(nodeAt(sky.nodes,placed.screen)?.role!==recordedRole(c.cell,c.at))throw stepError('placement');
          // A twin cell's observation must hold every control it prepares (so the target is the one found), and a ruling-881
          // twin none of its own, else the unit is not tested.
          const gap=uncoveredBy(sky,spec,found,{role:controlRole(c.cell)});if(gap)throw stepError('uncovered-'+gap);
          // The cell's change, after the observation (and so after the record), before the click.
          s='mark';
          mark=await platform.command({op:'mark',trial});
          if(mark.error||mark.trial!==trial||mark.clicksBeforeMark!==0||mark.after?.text!==spec.after)throw stepError('mark');
          const marked=performance.now();
          // A text change must have reached the accessibility tree before the click: the new text read, the old gone.
          if(spec.before!==spec.after){
            s='exercise';exercised=false;
            for(const end=marked+2500;;){
              const n=await platform.axText(spec.before,spec.after);
              if(n&&n.after>=1&&n.before===0){exercised=true;break;}
              if(performance.now()>=end)break;
              await pause(100);
            }
            if(!exercised)throw stepError('unexercised');
          }
          const rest=500-(performance.now()-marked);
          if(rest>0)await pause(rest);
          s='witness-before-action';
          if(!await platform.witness())throw stepError('witness-before-action');
          attested=true;
          s='click';
          click=await e.call('click',{app,x:placed.px.x,y:placed.px.y});
          // The page's log until a click reaches the target (or 1.5 s), then once more 300 ms later.
          s='read';
          const readOnce=async()=>{const d=await platform.command({op:'read',trial});if(d.error||d.trial!==trial)throw Error('fixture trial lost');return d;};
          read=await readOnce();
          const end=performance.now()+1500;
          while(!landingOf(read.clicks).landed&&performance.now()<end){await pause(50);read=await readOnce();}
          await pause(300);read=await readOnce();
          // The engine's own frames after the change: one more observation on this connection.
          s='reobserve';
          const re=await e.call('get_app_state',{app,includeScreenshot:false});
          if(Array.isArray(re.reply?.result?.nodes)){reobserved=true;after=findLink(re.reply.result.nodes,spec.after,{first:!!spec.twin,role:controlRole(c.cell)});}
        }
        s='witness-end';witness=await platform.disarm();armed=false;
      }catch(err){invalid=(attested?'evidence':setupLabel(err))+'@'+s;}
      finally{
        if(armed){try{await platform.disarm();}catch{}}
        await e.disconnect();
      }
      const clickOutcome=click?outcomeOf(click.reply):null,guard=click?stalePointOf(click.reply):null;
      // Placement was checked from the observation before the click: a click after it with no guard record, or one
      // taken at another role, is the head's own answer (`no-guard`, `misplaced`), never an invalid row.
      const ok=attested&&!invalid;
      const verdicts=score({attested:ok,observeFailed,cell:c.cell,at:c.at,click:clickOutcome,stale:guard,clicks:read?.clicks});
      const aim=found?.[c.at];
      const row={lane,...c,valid:ok,invalid:ok?null:invalid??'other',click:clickOutcome,guard,route:click?routeOf(click.reply):null,...verdicts,
        observeError:observeFailed?(observed?.reply?.result?'target-not-found':outcomeOf(observed?.reply)):null,
        clickEvents:read?(read.clicks??[]).map(x=>`${x.type}:${x.link}${x.trusted?'':':untrusted'}`).slice(0,12):null,
        sameNode:read?.sameNode??null,exercised,
        // Geometry: the recorded node's frame (and both nodes') at the observation against the engine's re-observation
        // after the change, in screen points; and the page's own before and after, in CSS pixels.
        ax:found?{recorded:delta(aim?.frame,after?.[c.at]?.frame),text:delta(found.text?.frame,after?.text?.frame),link:delta(found.link.frame,after?.link?.frame),
          reobserved,foundAfter:!!after}:null,
        observeTries,dom:mark?{text:delta(mark.before?.textRect,mark.after?.textRect),link:delta(mark.before?.link,mark.after?.link),twin:delta(mark.before?.link,mark.twin)}:null,walk,
        frames:found?{text:found.text?.frame??null,link:found.link.frame,point:placed?.screen??null}:null,
        presentationHeld:witness?.held??null,observeMs:observed?.ms??null,clickMs:click?.ms??null};
      rows.push(row);
      // A report-only unit's rows never move the abort streak.
      if(!isReportOnly(c))streak=row.valid?0:streak+1;
      if(streak>=8){abort='consecutive-invalid';break;}
    }
  }catch(e){abort=stage;abortStep=setupLabel(e);}
  finally{
    for(const e of Object.values(engines))await e.close();
    await platform?.dispose();
    await helper?.close();
    rmSync(join(tmp,'e-main'),{recursive:true,force:true});rmSync(join(tmp,'e-fix'),{recursive:true,force:true});rmSync(shots,{recursive:true,force:true});
  }
  const cov=coverage(rows,{planned,heads:headNames,units});
  // The qualification gates in mode `qualify` only: smoke and measure, with one head or two, pass on coverage alone.
  const {gates:gate,pass}=judge(rows,{mode,abort,coverage:cov,units,reps});
  const tally=list=>list.reduce((o,k)=>(o[k]=(o[k]??0)+1,o),{});
  const status={lane,mode,kit:config.kit,refs:config.refs,version:config.version??null,os:config.os,image:config.image,
    presentation:config.presentation??null,foregroundFallback:config.foregroundFallback??null,abort,abortStep,
    planned:Object.values(planned).reduce((a,b)=>a+b,0),completed:rows.length,coverage:{complete:cov.complete,covered:cov.covered},
    invalid:tally(rows.filter(r=>!r.valid).map(r=>r.invalid)),gates:gate};
  status.pass=pass;
  status.coverageDetail=cov.per;
  writeFileSync(join(out,'status.json'),JSON.stringify(status,null,2)+'\n');
  writeFileSync(join(out,'summary.json'),JSON.stringify(summarize(rows),null,2)+'\n');
  writeFileSync(join(out,'rows.json'),JSON.stringify(rows,null,2)+'\n');
  writeFileSync(join(out,'config.json'),JSON.stringify(config,null,2)+'\n');
  console.log(JSON.stringify({lane,abort,abortStep,completed:rows.length,pass:status.pass}));
  if(!status.pass)process.exitCode=1;
}
if(process.argv[1]?.endsWith('/run.mjs'))main().catch(()=>{console.error('Qualification harness failed before evidence publication');process.exitCode=1;});
