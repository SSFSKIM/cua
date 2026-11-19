// #398's hosted measurement and qualification of placeholder changes. Hosted runners only. Never prints child output or
// a raw reply; it stages closed codes, booleans, counts and times. Field truth is the owned fixture's; cua is driven on
// the engine's own wire (get_app_state, then click and set_value or type_text by the observation's token), one engine
// connection per trial, so each trial starts a fresh lineage.
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {Wire} from './wire.mjs';
import {owned,stop,pause,environment,startPlatform,startHelper} from './platform.mjs';
import {LANES,STALE_CELLS,TARGET_LABEL,unitKey,materialize,plan,ascii} from './cells.mjs';
import {outcomeOf,whyOf,axChangedOf,score,summarize,coverage,gates,placeholderShape,roleCode,findTargets} from './check.mjs';

const setupLabel=e=>typeof e?.setupStep==='string'?e.setupStep:'other';
const stepError=step=>Object.assign(Error(step),{setupStep:step});

async function startEngine({name,bin,root,platform}){
  const home=join(root,'e-'+name);mkdirSync(home,{mode:0o700});const socket=join(home,'e.sock');
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
    // Prime AX access before the first scored trial; then no connection is held between trials.
    await w.execute('get_app_state',{pid:platform.pid,includeScreenshot:false,disableDiff:true});
    await disconnect();
    // One timed engine call on the trial's connection.
    const call=async(method,args)=>{
      const started=performance.now();
      let reply;
      try{reply=await w.execute(method,args);}catch{reply=null;}
      return {reply,ms:Math.round(performance.now()-started)};
    };
    return {appPath:target.appPath,attach,disconnect,call,close:async()=>{await disconnect();return stop(child);}};
  }catch(e){w?.close();await stop(child);throw e;}
}

async function main(){
  const [lane,mode,root,out,helperBin,cover,appkit,...headSpecs]=process.argv.slice(2);
  if(process.env.RUNNER_ENVIRONMENT!=='github-hosted')throw Error('hosted runners only');
  if(!LANES.includes(lane)||!['smoke','measure','qualify'].includes(mode))throw Error('invalid lane');
  const heads=Object.fromEntries(headSpecs.map(s=>{const [name,bin]=s.split('::');return [name,{bin}];}));
  const headNames=Object.keys(heads);
  if(!headNames.length||headNames.some(h=>!['main','fix'].includes(h))||mode==='qualify'&&headNames.length!==2)throw Error('invalid heads');
  mkdirSync(out,{recursive:true});const tmp=mkdtempSync(join(root,'q398-')),home=join(tmp,'platform');mkdirSync(home);
  const config={kit:process.env.GITHUB_SHA,refs:{main:process.env.MAIN_SHA,fix:process.env.FIX_SHA||null},image:process.env.ImageVersion,
    os:execFileSync('sw_vers',['-productVersion'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim(),lane,mode,heads:headNames};
  const rows=[],engines={},planned={};let platform,helper,stage='helper',abort=null,abortStep=null;
  try{
    helper=startHelper(helperBin,environment(home));
    stage='launch';
    platform=await startPlatform({lane,home,helper,cover,appkit,stage:x=>{stage=x;}});
    Object.assign(config,{version:platform.version,presentation:platform.presentation,foregroundFallback:platform.fallback});
    stage='engine-start';
    for(const [name,{bin}] of Object.entries(heads))engines[name]=await startEngine({name,bin,root:tmp,platform});
    const cells=plan({mode,heads:headNames});
    for(const c of cells)planned[`${c.head}/${unitKey(c)}`]=(planned[`${c.head}/${unitKey(c)}`]??0)+1;
    let trial=0,streak=0;
    for(const c of cells){
      const m=materialize(c),e=engines[c.head],setupText=ascii(12),app=e.appPath;
      let s='engine-attach',attested=false,armed=false,observeFailed=false,observed=null,targets=null,click=null,act=null,first=null,read=null,settled=null,
        reobserved=null,after=null,witness=null,invalid=null,typed=null;
      try{
        const w=await e.attach();
        await platform.arm(++trial,{cell:c.cell,setupText},x=>{s=x;});armed=true;
        s='observe';
        observed=await e.call('get_app_state',{app,includeScreenshot:false});
        // The fixture is prepared and attested: an observation (or a target in it) missing now is the head's own answer,
        // a valid row whose verdict says so, never a setup failure.
        if(observed.reply?.result&&w.lineage)targets=findTargets(observed.reply.result.nodes,c.cell);
        if(!targets){
          observeFailed=true;
          s='witness-before-action';
          if(!await platform.witness())throw stepError('witness-before-action');
          attested=true;
        }else{
          // The stale cells' handle made stale (nothing, for the placeholder cells), after the observation, before any action.
          s='mark';
          const mark=await platform.command({op:'mark',trial,setupText});
          if(mark.error||mark.trial!==trial||mark.setupExact!==true||mark.othersWritten?.length||!mark.targetEmpty&&mark.present)throw stepError('mark');
          if(STALE_CELLS.includes(c.cell))await pause(400);
          s='witness-before-action';
          if(!await platform.witness())throw stepError('witness-before-action');
          attested=true;
          s='click';
          click=await e.call('click',{app,element:targets.target.token});
          s='act';
          if(c.seq==='set')act=await e.call('set_value',{app,element:targets.target.token,value:m.value});
          else if(outcomeOf(click.reply)!=='success')act={reply:'skipped',ms:null};
          else if(c.seq==='type')act=await e.call('type_text',{app,text:m.value});
          else{typed=await e.call('type_text',{app,text:m.typed});act=await e.call('set_value',{app,element:targets.target.token,value:m.value});}
          // The first read right after the actions (kept), then until the expected state (or 2 s), then once more after 300 ms.
          s='read';
          const readOnce=async()=>{const d=await platform.command({op:'read',trial,expected:m.value,setupText});if(d.error||d.trial!==trial)throw Error('fixture trial lost');return d;};
          first=read=await readOnce();
          const end=performance.now()+2000;
          while(!read.exact&&performance.now()<end){await pause(50);read=await readOnce();}
          await pause(300);settled=await readOnce();
          // The engine's own view of the target's placeholder after the actions: one more observation on this connection.
          s='reobserve';
          const re=await e.call('get_app_state',{app,includeScreenshot:false});
          const nodes=Array.isArray(re.reply?.result?.nodes)?re.reply.result.nodes:null;
          if(nodes&&TARGET_LABEL[c.cell]){
            const same=nodes.filter(n=>n.description===TARGET_LABEL[c.cell]||n.title===TARGET_LABEL[c.cell]);
            if(same.length<=1){reobserved=true;after=same[0]??null;}
          }
        }
        s='witness-end';witness=await platform.disarm();armed=false;
      }catch(err){invalid=(attested?'evidence':setupLabel(err))+'@'+s;}
      finally{
        if(armed){try{await platform.disarm();}catch{}}
        await e.disconnect();
      }
      const clickOutcome=click?outcomeOf(click.reply):null,actOutcome=act?outcomeOf(act.reply):null,actWhy=act?whyOf(act.reply):null;
      const ok=attested&&!invalid;
      const node=targets?.target,axChanged=axChangedOf(node,after,reobserved);
      const verdicts=score({cell:c.cell,attested:ok,observeFailed,click:clickOutcome,act:actOutcome,actWhy,first,read:settled,axChanged});
      const row={lane,...c,valid:ok,invalid:ok?null:invalid??'other',click:clickOutcome,typeAct:typed?outcomeOf(typed.reply):null,act:actOutcome,actWhy,...verdicts,axChanged,
        observeError:observeFailed?(observed?.reply?.result?'target-not-found':outcomeOf(observed?.reply)):null,
        observedPlaceholder:placeholderShape(node),afterPlaceholder:reobserved?placeholderShape(after)??'gone':null,
        observedRole:roleCode(node?.role),observedSubrole:node?.subrole==='AXSearchField'?'AXSearchField':node?.subrole?'other':null,
        exactAtFirstRead:first?.exact===true,settledChanged:first!=null&&settled!=null&&first.exact!==settled.exact,
        focusedAfter:settled?.focused??null,rotating:settled?.rotating??null,
        presentationHeld:witness?.held??null,observeMs:observed?.ms??null,clickMs:click?.ms??null,actMs:act?.ms??null};
      rows.push(row);
      streak=row.valid?0:streak+1;
      if(streak>=8){abort='consecutive-invalid';break;}
    }
  }catch(e){abort=stage;abortStep=setupLabel(e);}
  finally{
    for(const e of Object.values(engines))await e.close();
    await platform?.dispose();
    await helper?.close();
    rmSync(join(tmp,'e-main'),{recursive:true,force:true});rmSync(join(tmp,'e-fix'),{recursive:true,force:true});
  }
  const cov=coverage(rows,{planned,heads:headNames});
  const gate=headNames.length===2?gates(rows,{coverage:cov}):null;
  const tally=list=>list.reduce((o,k)=>(o[k]=(o[k]??0)+1,o),{});
  const status={lane,mode,kit:config.kit,refs:config.refs,version:config.version??null,os:config.os,image:config.image,
    presentation:config.presentation??null,foregroundFallback:config.foregroundFallback??null,abort,abortStep,
    planned:Object.values(planned).reduce((a,b)=>a+b,0),completed:rows.length,coverage:{complete:cov.complete,covered:cov.covered},
    invalid:tally(rows.filter(r=>!r.valid).map(r=>r.invalid)),gates:gate};
  const measured=abort===null&&cov.complete&&cov.covered;
  status.pass=gate?measured&&Object.values(gate).every(g=>g.pass):measured;
  status.coverageDetail=cov.per;
  writeFileSync(join(out,'status.json'),JSON.stringify(status,null,2)+'\n');
  writeFileSync(join(out,'summary.json'),JSON.stringify(summarize(rows),null,2)+'\n');
  writeFileSync(join(out,'rows.json'),JSON.stringify(rows,null,2)+'\n');
  writeFileSync(join(out,'config.json'),JSON.stringify(config,null,2)+'\n');
  console.log(JSON.stringify({lane,abort,abortStep,completed:rows.length,pass:status.pass}));
  if(!status.pass)process.exitCode=1;
}
main().catch(()=>{console.error('Qualification harness failed before evidence publication');process.exitCode=1;});
