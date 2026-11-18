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
import {routeOf,outcomeOf,readbackConfirmed,scan,score,summarize,gates,percentile} from './check.mjs';

const word=x=>typeof x==='string'&&/^[A-Za-z][A-Za-z0-9]{0,40}$/.test(x)?x:x==null?null:'other';
const setupLabel=e=>typeof e?.setupStep==='string'?e.setupStep:'other';

async function startEngine({name,src,bin,root,platform,ax}){
  const home=join(root,'e-'+name);mkdirSync(home,{mode:0o700});const socket=join(home,'e.sock');
  const env=environment(home),traces=new Map();let output=null;
  const child=owned(bin,[],{...env,CUA_ENGINE_SOCKET:socket},{stdout:l=>output?.push(l),stderr:l=>{
    if(ax){try{const d=JSON.parse(l)?.probe361Ax;if(d&&typeof d.id==='string'){traces.set(d.id,d);return;}}catch{}}
    output?.push(l);
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
    return {type,attach,disconnect,traces,listen:()=>{output=[];},collect:()=>{const o=output??[];output=null;return o;},close:async()=>{await disconnect();return stop(child);}};
  }catch(e){w?.close();await stop(child);throw e;}
}

// The AX probe's record, as differences on the one wall clock: from the last posted event (the meta's endedAt) and the first.
function axFacts(trace,meta){
  if(!trace)return null;
  const num=x=>Number.isFinite(x)?Math.round(x*10)/10:null;
  const ended=meta?.endedAt,started=meta?.startedAt;
  const focus=Object.fromEntries(['target','setup','other','none'].map(k=>[k,Number.isSafeInteger(trace.focus?.[k])?trace.focus[k]:0]));
  return {samples:trace.samples,equalSamples:trace.equalSamples,targetEqualSamples:trace.targetEqualSamples,flipsBack:trace.flipsBack,
    everEqual:Number.isFinite(trace.firstEqualAt),firstEqualFromLastPostMs:num(trace.firstEqualAt-ended),firstEqualFromFirstPostMs:num(trace.firstEqualAt-started),
    answerFromLastPostMs:num(trace.finishedAt-ended),equalAtAnswer:trace.equalAtFinish===true,focusAtAnswer:word(trace.focusAtFinish),
    equalAtEnd:trace.equalAtEnd===true,focusAtEnd:word(trace.focusAtEnd),focus,
    roles:Array.isArray(trace.roles)?trace.roles.map(word).slice(0,8):[]};
}

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
  const rows=[],sourceStatus={},engines={};let platform,helper,stage='helper',abort=null,abortStep=null,inventory=null;
  try{
    helper=startHelper(helperBin);
    inventory=await helper.ask({op:'sources'},15000);
    // Feasibility first: each source enabled and selected through TIS, and read back by a fresh process (as the engine reads it).
    for(const s of sources){
      const sel=await helper.ask({op:'source-select',id:SOURCES[s].id},15000);
      let fresh=null;
      try{fresh=JSON.parse(execFileSync(helperBin,['--source-current'],{env:helperEnv(),encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:10000}));}catch{}
      sourceStatus[s]={id:SOURCES[s].id,found:sel.found===true,enabledBefore:sel.before?.enabled??null,enableStatus:sel.enableStatus??null,
        parentEnableStatus:sel.parentEnableStatus??null,selectStatus:sel.selectStatus??null,selected:sel.selected===true,
        freshReadsIt:fresh?.id===SOURCES[s].id,keyboardLayout:fresh?.keyboardLayout??null,perContext:fresh?.perContext??null,
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
      const sel=await helper.ask({op:'source-select',id:SOURCES[source].id},15000);
      if(sel.selected!==true){sourceStatus[source].skipped='reselect-failed';continue;}
      const cells=plan({mode,heads:headNames,cells:CELLS}),inputs=new Map();
      let streak=0;
      for(const c of cells){
        const key=`${c.cell}/${c.rep}`;
        if(!inputs.has(key))inputs.set(key,materialize(c.cell,source));
        const m=inputs.get(key),e=engines[c.head],id=`${source}-${c.head}-${c.cell}-${c.rep}`;
        const setupText=ascii(12),clipText='q361clip'+ascii(16);
        let s='source-check',attested=false,armed=false,receipt=null,delivery=null,clip=null,witness=null,trace=null,output=[],invalid=null;
        try{
          const cur=await helper.ask({op:'source-current'});
          if(cur.id!==SOURCES[source].id||cur.perContext!==false)throw Object.assign(Error('source drift'),{setupStep:'source-drift'});
          s='engine-attach';await e.attach();
          s='clip-set';if((await helper.ask({op:'clip-set',text:clipText})).ok!==true)throw Object.assign(Error('clip'),{setupStep:'clip-set'});
          await platform.arm(++trial,{...m,setupText,rewriteChar:REWRITE_CHAR},x=>{s=x;});armed=true;attested=true;
          s='action';e.listen();receipt=await e.type(m,id);output=e.collect();
          s='delivery';
          const end=performance.now()+2500;
          do{
            delivery=await platform.command({op:'read',trial,target:m.field,expected:m.expected,control:m.control,setupText,start:null,end:null});
            if(delivery.trial!==trial)throw Error('fixture trial lost');
            if(m.control!==null?delivery.controlExact&&delivery.hit:delivery.exact)break;
            await pause(35);
          }while(performance.now()<end);
          s='clip-check';clip=await helper.ask({op:'clip-check',text:clipText});
          s='witness-end';witness=await platform.disarm();armed=false;
          if(ax){for(let i=0;i<60&&!e.traces.has(id);i++)await pause(50);trace=e.traces.get(id)??null;e.traces.delete(id);}
        }catch(err){if(!attested)invalid=setupLabel(err)+'@'+s;else invalid='evidence@'+s;e.collect();}
        finally{
          if(armed){try{await platform.disarm();}catch{}}
          await e.disconnect();
        }
        const native=receipt?.native,meta=native?.result?.meta??native?.error?.meta;
        const {outcome,reason}=outcomeOf({native,skyError:receipt?.error,guarded:receipt?.guarded??false});
        const route=routeOf(native);
        const row={source,lane,...c,attested:attested&&!invalid,route,...score({cell:c.cell,head:c.head,attested:attested&&!invalid,route,outcome,reason,
          domExact:delivery?.exact,controlExact:delivery?.controlExact,hit:delivery?.hit,confirmed:readbackConfirmed(native,receipt?.forwarded),clip})};
        if(invalid&&row.valid){row.valid=false;row.invalid=invalid;}
        if(invalid)row.invalid=invalid;
        Object.assign(row,{note:typeof native?.result?.note==='string',setupUnchanged:delivery?.setupExact??null,hitVia:word(delivery?.hitVia||null),
          pasteEvents:Number.isSafeInteger(delivery?.pastes)?delivery.pastes:null,pasteInputs:Number.isSafeInteger(delivery?.pasteInputs)?delivery.pasteInputs:null,
          engineRestore:word(meta?.paste?.restore),notificationSource:word(meta?.paste?.notificationSource),entered:Number.isSafeInteger(meta?.entered)?meta.entered:null,
          clipboardChangeDelta:Number.isSafeInteger(clip?.changeCountDelta)?clip.changeCountDelta:null,
          presentationHeld:witness?.held??null,witnessReason:word(witness?.reason?.replace(/-/g,'')??null),
          serviceMs:Number.isFinite(receipt?.forwarded?.['cua/serviceMs'])?receipt.forwarded['cua/serviceMs']:null});
        row.privacy=receipt?scan({native,rendered:receipt.rendered,skyError:receipt.error,forwarded:receipt.forwarded,content:receipt.content,console:receipt.logged,engineOutput:output},
          {setupText,clipText,initial:m.initial,text:m.text,expected:m.expected,control:m.control,canaries:m.canaries,
           mismatch:meta?.typeReadback?.reason==='valueMismatch'}):[];
        if(ax)row.ax=axFacts(trace,meta);
        rows.push(row);
        streak=row.attested?0:streak+1;
        if(streak>=6){sourceStatus[source].aborted='consecutive-invalid';break;}
      }
    }
  }catch(e){abort=stage;abortStep=setupLabel(e);}
  finally{
    for(const e of Object.values(engines))await e.close();
    await platform?.dispose();
    // The runner's default source back, so a later job step types as before.
    const initial=inventory?.current?.id;
    if(typeof initial==='string'&&initial)try{await helper?.ask({op:'source-select',id:initial},15000);}catch{}
    await helper?.close();
    rmSync(join(tmp,'e-main'),{recursive:true,force:true});rmSync(join(tmp,'e-fix'),{recursive:true,force:true});
  }
  const summary=summarize(rows),gate=headNames.length===2?gates(rows):null;
  const tally=list=>list.reduce((o,k)=>(o[k]=(o[k]??0)+1,o),{});
  const status={lane,phase,mode,kit:config.kit,refs:config.refs,version:config.version??null,os:config.os,image:config.image,
    presentation:config.presentation??null,foregroundFallback:config.foregroundFallback??null,abort,abortStep,sources:sourceStatus,
    inventory:Array.isArray(inventory?.sources)?inventory.sources.map(s=>({id:String(s.id).slice(0,80),type:word(s.type),enabled:s.enabled===true,
      enableCapable:s.enableCapable===true,selectCapable:s.selectCapable===true})):null,
    planned:Object.values(sourceStatus).filter(s=>s.usable).length*plan({mode,heads:headNames,cells:CELLS}).length,completed:rows.length,
    invalid:tally(rows.filter(r=>!r.valid).map(r=>r.invalid)),wrongSuccess:{main:rows.filter(r=>r.head==='main'&&r.valid&&r.wrongSuccess).length,
      fix:rows.filter(r=>r.head==='fix'&&r.wrongSuccess).length},
    privacyFlags:tally(rows.flatMap(r=>r.privacy.map(f=>r.head+'/'+f))),gates:gate};
  const pass=gate?Object.values(gate).every(g=>g.pass):abort===null;
  status.pass=pass;
  if(ax){
    const v=rows.filter(r=>r.valid&&r.ax);
    status.ax={traced:v.length,valid:rows.filter(r=>r.valid).length,plainExact:v.filter(r=>!r.control&&r.domExact).length,
      everEqualPlainExact:v.filter(r=>!r.control&&r.domExact&&r.ax.everEqual).length,equalAtAnswerPlainExact:v.filter(r=>!r.control&&r.domExact&&r.ax.equalAtAnswer).length,
      everEqualControls:v.filter(r=>r.control&&r.ax.everEqual).length,controls:v.filter(r=>r.control).length,
      firstEqualFromLastPostMs:Object.fromEntries([50,95,99,100].map(p=>[p,percentile(v.filter(r=>!r.control).map(r=>r.ax.firstEqualFromLastPostMs),p)])),
      focusNotTargetAtAnswer:v.filter(r=>r.ax.focusAtAnswer!=='target').length,focusAtAnswer:tally(v.map(r=>r.ax.focusAtAnswer??'none'))};
  }
  writeFileSync(join(out,'status.json'),JSON.stringify(status,null,2)+'\n');
  writeFileSync(join(out,'summary.json'),JSON.stringify(summary,null,2)+'\n');
  writeFileSync(join(out,'rows.json'),JSON.stringify(rows,null,2)+'\n');
  writeFileSync(join(out,'config.json'),JSON.stringify(config,null,2)+'\n');
  console.log(JSON.stringify({lane,phase,abort,abortStep,completed:rows.length,pass}));
  if(!pass)process.exitCode=1;
}
main().catch(()=>{console.error('Qualification harness failed before evidence publication');process.exitCode=1;});
