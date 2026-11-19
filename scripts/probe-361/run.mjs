// #361's hosted measurement and qualification of type_text's paste route. Hosted runners only. Never prints child output
// or a raw reply; it stages closed codes, booleans, counts and times. Field truth is the owned fixture's; the clipboard's is
// the owned helper's; nothing is read through cua but the action's own answer.
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {Wire} from '../probe-366/wire.mjs';
import {owned,stop,pause,environment,startPlatform,startHelper,helperEnv} from './platform.mjs';
import {SOURCES,LANES,CELLS,PLAIN,REWRITE_CHAR,materialize,plan,ascii} from './cells.mjs';
import {LABELS} from './page.mjs';
import {CODES,routeOf,outcomeOf,readbackConfirmed,scan,score,summarize,coverage,gates,percentile,disclosure} from './check.mjs';

const word=x=>typeof x==='string'&&/^[A-Za-z][A-Za-z0-9]{0,40}$/.test(x)?x:x==null?null:'other';
const setupLabel=e=>typeof e?.setupStep==='string'?e.setupStep:'other';

async function startEngine({name,src,bin,root,platform,ax}){
  const home=join(root,'e-'+name);mkdirSync(home,{mode:0o700});const socket=join(home,'e.sock');
  const env=environment(home),traces=new Map();let output=[];
  const child=owned(bin,[],{...env,CUA_ENGINE_SOCKET:socket},{stdout:l=>output.push(l),stderr:l=>{
    if(ax){try{const d=JSON.parse(l)?.probe361Ax;if(d&&typeof d.id==='string'){traces.set(d.id,d);return;}}catch{}}
    output.push(l);
  }});
  let w,identity;
  async function attach(){
    if(w)return;
    w=await Wire.connect(socket,{timeoutMs:15000});
    const ping=await w.call('ping',{clientApiVersion:'cua-engine-1',desktop:'shared'});
    if(ping.error||!ping.result)throw Error('engine ping failed');
    identity=ping.result;
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
    const load=f=>import(pathToFileURL(join(src,'src',f)).href);
    const [skyModule,nativeModule,storeModule,protocol]=await Promise.all([
      load('services/sky.mjs'),load('services/engine/service.mjs'),load('secrets/store.mjs'),load('services/engine/protocol.mjs')]);
    const store=storeModule.fileStore({dir:storeModule.storeDir(env)});
    const target=(await w.execute('resolve_app',{pid:platform.pid})).result;
    if(target?.pid!==platform.pid||target?.bundleIdentifier!==platform.bundle||!target.appPath?.startsWith('/'))throw Error('owned target unresolved');
    // One type_text through the production sky wrapper, native service and protocol of this head's own source.
    async function type(m,id){
      const meta={},content=[],logged=[],original={};let native=null,sent=0,guarded=true;
      const nodeRepl={env,setResponseMeta:x=>Object.assign(meta,x),emitContentItem:x=>content.push(x),createElicitation:async q=>{
        if(q.meta?.tool_params?.app!==target.bundleIdentifier)throw Error('unexpected approval');
        return {action:'accept'};
      }};
      const client={identity,async execute(method,args){
        const started=performance.now();
        if(method==='type_text'){
          sent++;
          if(args.app!==target.appPath||args.text!==m.text||args.concealed||sent!==1){guarded=false;throw Error('unexpected type request');}
        }
        const extra=method==='type_text'&&ax?{probe361Ax:{id,expected:m.expected,label:LABELS[m.field],setupLabel:LABELS.setup}}:null;
        const r=await w.execute(method,extra?{...args,...extra}:args);
        if(method==='type_text')native=r;
        if(r.error)throw protocol.serverError(r.error);
        return {result:r.result,engineMs:performance.now()-started};
      }};
      const service=nativeModule.createService({nodeRepl,client});
      const sky=skyModule.createSkyService({env,platform:'darwin',nodeRepl,secrets:store,loadVendor:async()=>service,setResponseMeta:x=>Object.assign(meta,x)});
      const originalHome=process.env.HOME;
      process.env.HOME=home;
      for(const k of ['log','warn','error','info','debug']){original[k]=console[k];console[k]=(...a)=>logged.push(...a);}
      let rendered=null,error=null;
      try{rendered=await sky.handleRpc({type:'execute',method:'type_text',args:[{app:target.appPath,text:m.text}]});}
      catch(e){error=e;}
      finally{
        Object.assign(console,original);
        if(originalHome==null)delete process.env.HOME;else process.env.HOME=originalHome;
      }
      return {native,guarded:guarded&&sent===1,rendered,error,forwarded:meta,content,logged};
    }
    // Prime AX access before the first scored field; then no connection is held between trials.
    await w.execute('get_app_state',{pid:platform.pid,includeScreenshot:false,disableDiff:true});
    await disconnect();
    return {type,attach,disconnect,traces,collect:()=>{const o=output;output=[];return o;},close:async()=>{await disconnect();return stop(child);}};
  }catch(e){w?.close();await stop(child);throw e;}
}

// The AX probe's record, as differences on the one wall clock: from the last posted event (the meta's endedAt) and the
// first (startedAt). A difference is null unless both operands are times. `firstEqualAt` is when the equal AXValue read
// returned; `afterAnswer` is the first sample begun after the paste route answered.
const diff=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&b>0?Math.round((a-b)*10)/10:null;
function axFacts(trace,meta){
  if(!trace)return null;
  const count=x=>Number.isSafeInteger(x)?x:null;
  const focus=Object.fromEntries(['target','setup','other','none'].map(k=>[k,count(trace.focus?.[k])??0]));
  return {samples:count(trace.samples),equalSamples:count(trace.equalSamples),targetEqualSamples:count(trace.targetEqualSamples),flipsBack:count(trace.flipsBack),
    everEqual:Number.isFinite(trace.firstEqualAt),firstEqualFromLastPostMs:diff(trace.firstEqualAt,meta?.endedAt),
    firstEqualFromFirstPostMs:diff(trace.firstEqualAt,meta?.startedAt),firstTargetFromFirstPostMs:diff(trace.firstTargetAt,meta?.startedAt),
    answerFromLastPostMs:diff(trace.finishedAt,meta?.endedAt),equalAfterAnswer:trace.equalAtFinish===true,focusAfterAnswer:CODES.focus(trace.focusAtFinish),
    equalAtEnd:trace.equalAtEnd===true,focusAtEnd:CODES.focus(trace.focusAtEnd),focus,
    roles:Array.isArray(trace.roles)?[...new Set(trace.roles.map(CODES.role))].slice(0,8):[]};
}
const stepError=step=>Object.assign(Error(step),{setupStep:step});

async function main(){
  const [lane,mode,phase,root,out,helperBin,cover,appkit,sourceList,...headSpecs]=process.argv.slice(2);
  if(process.env.RUNNER_ENVIRONMENT!=='github-hosted')throw Error('hosted runners only');
  if(!LANES.includes(lane)||!['smoke','measure','qualify'].includes(mode)||!['stock','ax'].includes(phase))throw Error('invalid lane');
  const ax=phase==='ax',sources=sourceList.split(',').filter(Boolean);
  if(!sources.length||sources.some(s=>!SOURCES[s]))throw Error('invalid sources');
  const heads=Object.fromEntries(headSpecs.map(s=>{const [name,src,bin]=s.split('::');return [name,{src,bin}];}));
  const headNames=Object.keys(heads);
  if(!headNames.length||headNames.some(h=>!['main','fix'].includes(h))||ax&&headNames.length!==1)throw Error('invalid heads');
  mkdirSync(out,{recursive:true});const tmp=mkdtempSync(join(root,'q361-')),home=join(tmp,'platform');mkdirSync(home);
  const config={kit:process.env.GITHUB_SHA,refs:{main:process.env.MAIN_SHA,fix:process.env.FIX_SHA||null},image:process.env.ImageVersion,
    os:execFileSync('sw_vers',['-productVersion'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim(),lane,mode,phase,heads:headNames,sources};
  const rows=[],sourceStatus={},engines={},planned={};let platform,helper,stage='helper',abort=null,abortStep=null,inventory=null;
  const last={};
  const lateScan=(head,e)=>{
    const late=e.collect(),prior=last[head];
    if(late.length&&prior)for(const f of scan({engineOutput:late},{...prior.ctx,mismatch:false}))if(!prior.row.privacy.includes('late-'+f))prior.row.privacy.push('late-'+f);
  };
  const fresh=(env=helperEnv())=>{try{return JSON.parse(execFileSync(helperBin,['--source-current'],{env,encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:10000}));}catch{return null;}};
  try{
    helper=startHelper(helperBin);
    inventory=await helper.ask({op:'sources'},15000);
    // Feasibility first: each source enabled and selected through TIS, and read back by a fresh process (as the engine reads it).
    for(const s of sources){
      const sel=await helper.ask({op:'source-select',id:SOURCES[s].id},15000),f=fresh();
      sourceStatus[s]={id:SOURCES[s].id,found:sel.found===true,enabledBefore:sel.before?.enabled??null,enableStatus:sel.enableStatus??null,
        parentEnableStatus:sel.parentEnableStatus??null,selectStatus:sel.selectStatus??null,selectRetryStatus:sel.selectRetryStatus??null,selected:sel.selected===true,
        freshReadsIt:f?.id===SOURCES[s].id,keyboardLayout:f?.keyboardLayout??null,perContext:f?.perContext??null,
        enabledAfter:sel.after?.enabled??null,selectCapable:sel.after?.selectCapable??sel.before?.selectCapable??null};
      sourceStatus[s].usable=sourceStatus[s].selected&&sourceStatus[s].freshReadsIt&&sourceStatus[s].keyboardLayout===false&&sourceStatus[s].perContext===false;
    }
    stage='launch';
    platform=await startPlatform({lane,home,helper,cover,appkit,stage:x=>{stage=x;}});
    Object.assign(config,{version:platform.version,presentation:platform.presentation,foregroundFallback:platform.fallback});
    stage='engine-start';
    for(const [name,{src,bin}] of Object.entries(heads))engines[name]=await startEngine({name,src,bin,root:tmp,platform,ax});
    let trial=0;
    for(const source of sources){
      if(!sourceStatus[source].usable){sourceStatus[source].skipped='source-unavailable';continue;}
      const cells=plan({mode,heads:headNames,cells:CELLS}),inputs=new Map();
      for(const c of cells)planned[`${source}/${c.head}/${c.cell}`]=(planned[`${source}/${c.head}/${c.cell}`]??0)+1;
      const sel=await helper.ask({op:'source-select',id:SOURCES[source].id},15000);
      if(sel.selected!==true){sourceStatus[source].skipped='reselect-failed';continue;}
      let streak=0;
      for(const c of cells){
        const key=`${c.cell}/${c.rep}`;
        if(!inputs.has(key))inputs.set(key,materialize(c.cell,source));
        const m=inputs.get(key),e=engines[c.head],id=`${source}-${c.head}-${c.cell}-${c.rep}`;
        const setupText=ascii(12),clipText='Q361CLIP'+ascii(16);
        let s='engine-attach',attested=false,armed=false,receipt=null,answer=null,delivery=null,settled=null,clip=null,witness=null,trace=null,invalid=null;
        // The engine's output since that head's last trial was collected (an after-action watch outlives the connection):
        // scanned against that trial's own values, its flags kept on that row.
        lateScan(c.head,e);
        try{
          await e.attach();
          s='clip-set';if((await helper.ask({op:'clip-set',text:clipText})).ok!==true)throw stepError('clip-set');
          await platform.arm(++trial,{...m,setupText,rewriteChar:REWRITE_CHAR},x=>{s=x;});armed=true;
          // The source at the action boundary, after every setup transition: the helper's and a fresh process's reading.
          s='source-check';
          const cur=await helper.ask({op:'source-current'}),f=fresh(environment(home));
          if(cur.id!==SOURCES[source].id||cur.perContext!==false||f?.id!==SOURCES[source].id||f?.keyboardLayout!==false||f?.perContext!==false)throw stepError('source-drift');
          attested=true;
          s='action';receipt=await e.type(m,id);
          // At the answer, then until the expected state (or 2.5 s), then once more after 300 ms: the settled content.
          const read=async()=>{
            const d=await platform.command({op:'read',trial,target:m.field,expected:m.expected,control:m.control,setupText,start:null,end:null});
            if(d.trial!==trial)throw Error('fixture trial lost');
            return d;
          };
          s='delivery';answer=delivery=await read();
          const end=performance.now()+2500;
          while(!(m.control!==null?delivery.controlExact&&delivery.hit:delivery.exact)&&performance.now()<end){await pause(35);delivery=await read();}
          await pause(300);settled=await read();
          s='clip-check';clip=await helper.ask({op:'clip-check',text:clipText});
          s='witness-end';witness=await platform.disarm();armed=false;
          if(ax){for(let i=0;i<60&&!e.traces.has(id);i++)await pause(50);trace=e.traces.get(id)??null;e.traces.delete(id);}
        }catch(err){invalid=(attested?'evidence':setupLabel(err))+'@'+s;}
        finally{
          if(armed){try{await platform.disarm();}catch{}}
          await e.disconnect();
        }
        const output=e.collect();
        const native=receipt?.native,meta=native?.result?.meta??native?.error?.meta;
        const {outcome,reason}=outcomeOf({native,skyError:receipt?.error,guarded:receipt?.guarded??false});
        const route=routeOf(native),ok=attested&&!invalid;
        const row={source,lane,...c,attested:ok,route,...score({cell:c.cell,attested:ok,route,outcome,reason,
          domExact:settled?.exact,controlExact:settled?.controlExact,hit:settled?.hit,confirmed:readbackConfirmed(native,receipt?.forwarded),clip})};
        if(invalid){row.valid=false;row.invalid=invalid;}
        const count=x=>Number.isSafeInteger(x)?x:null;
        Object.assign(row,{note:typeof native?.result?.note==='string',
          exactFirstPostReply:answer?.exact===true,settledChanged:delivery!=null&&settled!=null&&(delivery.exact!==settled.exact||delivery.controlExact!==settled.controlExact),
          setupUnchanged:settled?.setupExact??null,hitVia:CODES.hitVia(settled?.hitVia||null),
          pasteEvents:count(settled?.pastes),pasteInputs:count(settled?.pasteInputs),
          engineRestore:CODES.restore(meta?.paste?.restore),notificationSource:CODES.source(meta?.paste?.notificationSource),entered:count(meta?.entered),
          clipboardChangeDelta:count(clip?.changeCountDelta),presentationHeld:witness?.held??null,witnessReason:CODES.witness(witness?.reason),
          serviceMs:Number.isFinite(receipt?.forwarded?.['cua/serviceMs'])?receipt.forwarded['cua/serviceMs']:null});
        const ctx={setupText,clipText,initial:m.initial,text:m.text,expected:m.expected,control:m.control,canaries:m.canaries,
          mismatch:meta?.typeReadback?.reason==='valueMismatch',realized:row.realized===true};
        row.privacy=receipt?scan({native,rendered:receipt.rendered,skyError:receipt.error,forwarded:receipt.forwarded,content:receipt.content,console:receipt.logged,engineOutput:output},ctx):
          scan({engineOutput:output},ctx);
        last[c.head]={row,ctx};
        if(receipt)Object.assign(row,disclosure({native,skyError:receipt.error,forwarded:receipt.forwarded}));
        if(ax)row.ax=axFacts(trace,meta);
        rows.push(row);
        streak=row.attested?0:streak+1;
        if(streak>=6){sourceStatus[source].aborted='consecutive-invalid';break;}
      }
    }
  }catch(e){abort=stage;abortStep=setupLabel(e);}
  finally{
    await pause(1500);
    for(const [name,e] of Object.entries(engines)){lateScan(name,e);await e.close();lateScan(name,e);}
    await platform?.dispose();
    // The runner's original source back, so a later job step types as before.
    const initial=inventory?.current?.id;
    if(typeof initial==='string'&&initial)try{await helper?.ask({op:'source-select',id:initial},15000);}catch{}
    await helper?.close();
    rmSync(join(tmp,'e-main'),{recursive:true,force:true});rmSync(join(tmp,'e-fix'),{recursive:true,force:true});
  }
  const usable=sources.filter(s=>sourceStatus[s]?.usable);
  const cov=coverage(rows,{planned,sources:usable,heads:headNames,cells:CELLS});
  const summary=summarize(rows),gate=headNames.length===2?gates(rows,{coverage:cov}):null;
  const tally=list=>list.reduce((o,k)=>(o[k]=(o[k]??0)+1,o),{});
  const status={lane,phase,mode,kit:config.kit,refs:config.refs,version:config.version??null,os:config.os,image:config.image,
    presentation:config.presentation??null,foregroundFallback:config.foregroundFallback??null,abort,abortStep,sources:sourceStatus,
    inventory:Array.isArray(inventory?.sources)?inventory.sources.map(s=>({id:typeof s.id==='string'&&/^com\.apple\.[A-Za-z0-9.]{1,80}$/.test(s.id)?s.id:'other',
      type:closedType(s.type),enabled:s.enabled===true,enableCapable:s.enableCapable===true,selectCapable:s.selectCapable===true})):null,
    initialSource:typeof inventory?.current?.id==='string'&&/^com\.apple\.[A-Za-z0-9.]{1,80}$/.test(inventory.current.id)?inventory.current.id:'other',
    planned:Object.values(planned).reduce((a,b)=>a+b,0),completed:rows.length,coverage:{complete:cov.complete,allValid:cov.allValid},
    invalid:tally(rows.filter(r=>!r.valid).map(r=>r.invalid)),
    wrongSuccess:Object.fromEntries(headNames.map(h=>[h,rows.filter(r=>r.head===h&&r.wrongSuccess).length])),
    wrongSuccessValid:Object.fromEntries(headNames.map(h=>[h,rows.filter(r=>r.head===h&&r.valid&&r.wrongSuccess).length])),
    privacyFlags:tally(rows.flatMap(r=>r.privacy.map(f=>r.head+'/'+f))),gates:gate};
  // Measurement passes when every usable source ran all its rows without an abort (unusable sources are reported, not
  // faked); qualification when every gate passes, coverage included.
  const measured=abort===null&&usable.length>0&&cov.complete&&cov.covered;
  const pass=gate?measured&&Object.entries(gate).every(([k,g])=>k==='perCell'||g.pass):measured;
  status.pass=pass;
  status.coverageDetail=cov.per;
  if(ax){
    const v=rows.filter(r=>r.valid&&r.ax),plainExact=v.filter(r=>!r.control&&r.domExact);
    status.ax={traced:v.length,valid:rows.filter(r=>r.valid).length,plainExact:plainExact.length,
      everEqualPlainExact:plainExact.filter(r=>r.ax.everEqual).length,equalAfterAnswerPlainExact:plainExact.filter(r=>r.ax.equalAfterAnswer).length,
      everEqualControls:v.filter(r=>r.control&&r.ax.everEqual).length,controls:v.filter(r=>r.control).length,
      firstEqualFromLastPostMs:Object.fromEntries([50,95,99,100].map(p=>[p,percentile(plainExact.map(r=>r.ax.firstEqualFromLastPostMs),p)])),
      focusAfterAnswer:tally(v.map(r=>r.ax.focusAfterAnswer??'none')),
      focusNeverTarget:v.filter(r=>r.ax.focus.target===0).length};
  }
  writeFileSync(join(out,'status.json'),JSON.stringify(status,null,2)+'\n');
  writeFileSync(join(out,'summary.json'),JSON.stringify(summary,null,2)+'\n');
  writeFileSync(join(out,'rows.json'),JSON.stringify(rows,null,2)+'\n');
  writeFileSync(join(out,'config.json'),JSON.stringify(config,null,2)+'\n');
  console.log(JSON.stringify({lane,phase,abort,abortStep,completed:rows.length,pass}));
  if(!pass)process.exitCode=1;
}
const closedType=x=>['layout','mode','method-mode-enabled','method','other'].includes(x)?x:'other';
main().catch(()=>{console.error('Qualification harness failed before evidence publication');process.exitCode=1;});
