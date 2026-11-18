// Hosted-only qualification. Never print child output or raw responses; staging keeps a closed projection only.
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {randomInt} from 'node:crypto';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {Wire} from '../probe-366/wire.mjs';
import {owned,stop,startPlatform,pause,environment} from './platform.mjs';
import {plan,score,inspect,auditSchedule,auditPairs,summarize,coded,noteAttested,firefoxDisclosure,drainIntervals,terminalEditAtMs,drainIneligible,drainSummary,drainSizingOk,runShape,setupLabel,focusAllowed,concealedFailureTiming,drainStats} from './check.mjs';

const SLOT='PROBE414', safeReasons=new Set(['secure','noFocusedElement','roleUnreadable','notTextField','valueUnreadable','rangeUnreadable',
  'fieldUnreadable','fieldChanged','becameSecure','selectionChanged','concealedMismatch','valueMismatch','unchanged','possiblyTruncated',
  'secureCountUnavailable','secureCountMismatch','secureRangeUnavailable','secureCountUnreadable','secureRangeUnreadable','secureMismatch','lengthUnreadable','lengthMismatch','caretMismatch','selectionUnreadable','noLongerSecure']);
const pickReason=x=>safeReasons.has(x)?x:x==null?null:'other';
const nativeCodes=new Set(['typeUnconfirmed','concealedInputUnavailable','inputSourceChanged','keyboardLayoutUnavailable','userIntervened',
  'timeoutReached','windowMinimized','accessibilityError','permissionsNotGranted','runningApplicationNotFound','screenLocked','invalidArguments','unknownError','jsonRPCError']);
const wrapperCodes=new Set(['secret_input_failed','secret_unavailable','secret_not_found','secret_unreadable','secret_input_unavailable','user_intervened']);
const actionCode=(native,error,guarded)=>!guarded?'request-shape':native?.error?
  nativeCodes.has(native.error.errorName)?native.error.errorName:'native-other':error?
  wrapperCodes.has(error.code)?error.code:'wrapper-other':native?.result?'success':'missing';
const ascii=n=>Array.from({length:n},()=> 'abcdefghijklmnopqrstuvwxy'[randomInt(25)]).join('');
function materialize({kind}){
  const initial=kind==='selection'?ascii(19):'', start=kind==='selection'?4:0, end=kind==='selection'?11:0;
  const text=kind==='unicode'?ascii(4)+String.fromCodePoint(0x1f4a1)+ascii(3):ascii(kind==='long'?31:8), effect=['add','drop','rewrite'].includes(kind)?kind:'none';
  const surround=t=>initial.slice(0,start)+t+initial.slice(end);
  // Exactly one controlled edit; final equality is independently checked by the owned app/document.
  const altered=effect==='add'?'z'+text:effect==='drop'?text.slice(1):effect==='rewrite'?'z'+text.slice(1):null;
  return {seed:{expected:initial,start,end,effect,first:text[0]},text,expected:surround(text),control:altered===null?null:surround(altered),
    requestedCaret:start+text.length,controlCaret:altered===null?null:start+altered.length};
}
const weakReason=()=>{throw Error('owned target could not be resolved');};
// Overlap, drops, an off-thread call or a missing boundary make the trace unusable (a failed row), never a quiet pass.
function decodeAudit(d,lane){
  if(d?.v!==1||d.dropped||d.aliasOverflow||d.offThread||d.overlaps||!Array.isArray(d.e)||!Array.isArray(d.names))return null;
  const events=[];let firstInput=0,poll=0;
  for(const [api,k,id] of d.e){
    const name=d.names[k];
    if(typeof name!=='string'||!Number.isSafeInteger(api)||!Number.isSafeInteger(id))return null;
    const role=d.roles[id],sub=d.subroles[id];
    const s=role==='AXSecureTextField'||sub==='AXSecureTextField'?'secure':role==='AXWebArea'?'webArea':null;
    if(api===6||api===7){if(name==='securePoll'){events.push(['p',api===6?'begin':'end']);if(api===6)poll++;}continue;}
    if(api===5)firstInput++;
    events.push([['r','b','q','w','a','event','p','p','names','actions','hit'][api],name,id,s]);
  }
  if(firstInput!==1||poll<1)return null;
  return auditSchedule(events,{marker:lane==='safari'});
}
const relationLabels=new Set(['self','ancestor','descendant','setupField','other','unknown']);
function decodeFirefox(d){
  if(!/^(main|fix)-(short|literal)-[0-9]+$/.test(d?.id??'')||!relationLabels.has(d.relationship))return null;
  const role=s=>typeof s==='string'&&/^(?:AX[A-Za-z]{1,45}|absent|failed|unrecognized)$/.test(s)?s:null;
  return {role:role(d.role),subrole:role(d.subrole),relationship:d.relationship};
}
async function startEngine({name,src,bin,root,platform,audit,focus,drain,globalPrivacy,lane}){
  const home=join(root,name[0]);mkdirSync(home,{mode:0o700});const socket=join(home,'e.sock');
  const env=environment(home);const traces=new Map(),registry=new Set();let active=null;
  const note=(label,data,opts={})=>{
    const words=active?[active.words[0],...registry]:[...registry];
    for(const code of inspect(data,words,opts))(active?.flags??globalPrivacy).add(label+'/'+code);
  };
  const child=owned(bin,[],{...env,CUA_ENGINE_SOCKET:socket},{stdout:l=>note('stdout',l),stderr:l=>{
    if(audit){try{const d=JSON.parse(l)?.probe395Audit;if(d){traces.set(d.id,decodeAudit(d,lane));return;}}catch{}}
    if(focus){try{const d=JSON.parse(l)?.probe414Firefox;if(d){const decoded=decodeFirefox(d);if(decoded)traces.set(d.id,decoded);return;}}catch{}}
    if(drain){try{const d=JSON.parse(l)?.probe414AppKit;if(d){traces.set(d.id,d);return;}}catch{}}
    note('stderr',l);
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
    const [skyModule,nativeModule,storeModule,protocol,renderer]=await Promise.all([
      load('services/sky.mjs'),load('services/engine/service.mjs'),load('secrets/store.mjs'),load('services/engine/protocol.mjs'),load('services/engine/render.mjs')]);
    const store=storeModule.fileStore({dir:storeModule.storeDir(env)});
    const resolved=await w.execute('resolve_app',{pid:platform.pid});
    const target=resolved.result;
    if(target?.pid!==platform.pid||target?.bundleIdentifier!==platform.bundle||!target.appPath?.startsWith('/'))weakReason();
    async function observe(){
      const r=await w.execute('get_app_state',{pid:platform.pid,includeScreenshot:false,disableDiff:true});
      const shot=r.result;
      if(!shot||shot.app?.pid!==platform.pid||!Array.isArray(shot.nodes))return false;
      if(!audit){
        const nodes=[...shot.nodes,...(shot.menuBar??[])].filter(n=>n.role==='AXSecureTextField'||n.subrole==='AXSecureTextField'||n.secure===true||[n.title,n.description,n.identifier].includes('PW walk test'));
        note('observation-native',nodes);
        note('observation-focus',{selectedText:shot.selectedText,selectedTextRange:shot.selectedTextRange});
        note('observation-text',renderer.render(shot,renderer.advanceNumbering(null,shot)),{names:false});
        // Scan all serialized text for a value/mask that escaped the node or was misclassified; ordinary AX values are legitimate.
        for(const code of inspect(r,[...registry],{stringsOnly:true,names:false}))active.flags.add('observation-native/'+code);
        return nodes.length>0;
      }
      return true;
    }
    async function type(m,id,literal,head,kind){
      const meta={}, content=[], logged=[], original={};let native=null,sent=0,guarded=true,replyAtMs=null;
      const nodeRepl={env,setResponseMeta:x=>Object.assign(meta,x),emitContentItem:x=>content.push(x),createElicitation:async q=>{
        if(q.meta?.tool_params?.app!==target.bundleIdentifier)throw Error('unexpected approval');
        return {action:'accept'};
      }};
      const client={identity,async execute(method,args){
        const started=performance.now();
        if(method==='type_text'){
          sent++;
          if(args.app!==target.appPath||args.text!==m.text||Boolean(args.concealed)===literal||sent!==1){guarded=false;throw Error('unexpected type request');}
        }
        const extra=method==='type_text'?(audit?{probe395Audit:id}:focus?{probe414Firefox:id}:drain?{probe414AppKit:id}:null):null;
        const r=await w.execute(method,extra?{...args,...extra}:args);
        if(method==='resolve_app'&&(r.result?.pid!==target.pid||r.result?.bundleIdentifier!==target.bundleIdentifier))weakReason();
        if(method==='type_text'){native=r;replyAtMs=Date.now();}
        note(method==='type_text'?'ipc-type':'ipc-other',r,{literal:literal&&method==='type_text',surface:'ipc',baseline:head==='main'});
        if(r.error)throw protocol.serverError(r.error);
        return {result:r.result,engineMs:performance.now()-started};
      }};
      const service=nativeModule.createService({nodeRepl,client});
      const sky=skyModule.createSkyService({env,platform:'darwin',nodeRepl,secrets:store,loadVendor:async()=>service,setResponseMeta:x=>Object.assign(meta,x)});
      if(!literal)await store.write(SLOT,m.text);
      const originalHome=process.env.HOME;
      process.env.HOME=home;
      for(const k of ['log','warn','error','info','debug']){original[k]=console[k];console[k]=(...a)=>logged.push(...a);}
      let rendered,error=null;
      try{rendered=await sky.handleRpc({type:'execute',method:'type_text',args:[{app:target.appPath,text:literal?m.text:'{{secret:'+SLOT+'}}'}]});}
      catch(e){error=e;}
      finally{
        Object.assign(console,original);
        if(originalHome==null)delete process.env.HOME;else process.env.HOME=originalHome;
        if(!literal)await store.remove(SLOT);
      }
      const seen={literal,baseline:head==='main'};
      note('sky-result',rendered);note('sky-error',error,{...seen,surface:'sky-error'});note('forwarded',meta,{...seen,surface:'forwarded'});note('rendered-content',content);note('console',logged);
      const nativeMeta=native?.error?.meta??native?.result?.meta;
      const raw=nativeMeta?.typeReadback;
      const engineReason=native?.error?.errorName, expectedWrap=literal?error?.errorName==='typeUnconfirmed':error?.code==='secret_input_failed';
      const skyClass=error?(engineReason==='typeUnconfirmed'&&expectedWrap?'typeUnconfirmed':'unexpected-error'):'ok';
      const action=actionCode(native,error,guarded),serviceMs=Number.isFinite(meta['cua/serviceMs'])?meta['cua/serviceMs']:null;
      if(!guarded||sent!==1||!native) return {reply:false,raw:null,forwarded:null,sky:'missing',serviceMs,action};
      const disclosureOf=surface=>firefoxDisclosure(surface,{setupText:m.seed.setupText,passwordText:m.expected});
      const disclosure=lane==='firefox'?{ipc:disclosureOf(native),forwarded:disclosureOf(meta),skyError:disclosureOf(error),rendered:disclosureOf(rendered)}:null;
      const budget=concealedFailureTiming({head,lane,kind,literal,action,raw,startedAt:nativeMeta?.startedAt,endedAt:nativeMeta?.endedAt,replyAt:replyAtMs});
      return {reply:true,raw,forwarded:meta['cua/typeReadback'],sky:skyClass,noted:noteAttested(native?.result?.note,content),serviceMs,action,disclosure,replyAtMs,budget};
    }
    // Prime AX access before the first scored field. No action and no instrumented audit tag are sent.
    await w.execute('get_app_state',{pid:platform.pid,includeScreenshot:false,disableDiff:true});
    // Two live connections listening to the same target can report the other head's keys as user intervention.
    await disconnect();
    return {type,observe,traces,attach,disconnect,scope:x=>{active=x;if(x)for(const v of x.words)registry.add(v);},close:async()=>{
      await disconnect();return stop(child);
    }};
  }catch(e){w?.close();await stop(child);throw e;}
}

async function main(){
  const [lane,mode,phase,root,out,helper,cover,appkit,mainSrc,mainBin,fixSrc,fixBin]=process.argv.slice(2);
  if(process.env.RUNNER_ENVIRONMENT!=='github-hosted')throw Error('hosted runners only');
  if(!['cft','electron','electron-parity','safari','firefox','appkit'].includes(lane)||!['smoke','full','firefox-focus','firefox-single','appkit-race','drain'].includes(mode)||!['stock','audit','focus','drain'].includes(phase))throw Error('invalid lane');
  const audit=phase==='audit',smoke=mode==='smoke',focus=phase==='focus',drain=phase==='drain',race=mode==='appkit-race',diagnostic=mode.startsWith('firefox-');
  const {singlePassword,setupCanary,requireBackground}=runShape(lane,mode);
  // The focus scratch job of smoke runs the same short/literal pairs as the diagnostics, on the password-only page, without a canary.
  const miniPlan=diagnostic||smoke&&focusAllowed(lane,mode,phase);
  if(diagnostic?(lane!=='firefox'||audit||drain):focus&&!miniPlan)throw Error('invalid focus lane');
  mkdirSync(out,{recursive:true});const tmp=mkdtempSync(join(root,'q414-')),home=join(tmp,'platform');mkdirSync(home);
  const rows=[],schedules=[],firefoxFacts=[],timings=[],globalPrivacy=new Set(),engines={};let platform,capabilities=null,stage='launch',abort=null,abortStep=null,streak=0;
  const additions=Array.from({length:20},(_,rep)=>({head:'fix',kind:'add',rep,literal:rep%2===1}));
  const timingCells=Array.from({length:20},(_,i)=>[{head:'fix',kind:'short',rep:i*2},{head:'fix',kind:'short',rep:i*2+1},
    {head:'fix',kind:'long',rep:i*2},{head:'fix',kind:'long',rep:i*2+1},additions[i]]).flat();
  const cells=race?additions:drain?timingCells:miniPlan?Array.from({length:3},(_,rep)=>['literal','short'].flatMap((kind,i)=>
    ((rep+i)%2?['fix','main']:['main','fix']).map(head=>({head,kind,rep})))).flat():plan(smoke,{audit});
  // Paired primary rows receive the exact same disposable text, not independently generated treatments.
  const inputs=new Map();
  for(const c of cells){
    const k=`${c.kind}/${c.rep}`;
    if(!inputs.has(k)){
      const m=materialize(c);
      if(setupCanary)m.seed.setupText=ascii(11);
      inputs.set(k,m);
    }
  }
  const config={kit:process.env.GITHUB_SHA,refs:{main:process.env.MAIN_SHA,fix:process.env.FIX_SHA},image:process.env.ImageVersion,
    os:execFileSync('sw_vers',['-productVersion'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim(),lane,mode,phase,
    fixtureShape:singlePassword?'password-only':lane==='safari'?'large-with-setup':'with-setup'};
  try{
    platform=await startPlatform({lane,home,helper,cover,appkit,singlePassword,stage:x=>{stage=x;}});
    // The one permitted Firefox retry is only meaningful under a real background cover; a frontmost fallback is not that experiment.
    if(requireBackground&&platform.presentation!=='background'){stage='presentation-probe';throw Error('background cover required');}
    Object.assign(config,{version:platform.version,presentation:platform.presentation,foregroundFallback:platform.fallback});
    if(lane==='appkit')capabilities=await platform.appkitCapabilities();
    stage='engine-start';
    const sources=audit||drain||race?{fix:[fixSrc,fixBin]}:{main:[mainSrc,mainBin],fix:[fixSrc,fixBin]};
    for(const [name,[src,bin]] of Object.entries(sources))engines[name]=await startEngine({name,src,bin,root:tmp,platform,audit,focus,drain,globalPrivacy,lane});
    let trial=0;
    for(const c of cells){
      const id=`${c.head}-${c.kind}-${c.rep}`,m=inputs.get(`${c.kind}/${c.rep}`),e=engines[c.head];
      const row={...c};let s='prepare',armed=false,attested=false,receipt=null,delivery=null,focusFacts=null,timingTrace=null;
      const scope={words:[m.text,...new Set([m.seed.expected,m.expected,m.control].filter(Boolean))],flags:new Set()};e.scope(scope);
      try{
        s='engine-attach';await e.attach();
        await platform.arm(++trial,m.seed,x=>{s=x;});armed=true;
        s='action';receipt=await e.type(m,id,c.kind==='literal'||c.literal===true,c.head,c.kind);
        s='delivery';
        const end=performance.now()+2500;
        do{
          const d=await platform.command({op:'read',trial,expected:m.expected,control:m.control,setupText:m.seed.setupText,
            requestedCaret:m.requestedCaret,controlCaret:m.controlCaret});
          if(d.trial!==trial||!d.shape||!d.focused)throw Error('fixture no longer focused');
          delivery=d;
          if(m.control!==null?d.controlExact&&d.hit&&d.key:d.exact&&d.key)break;
          await pause(35);
        }while(performance.now()<end);
        // An untouched fixture or a delivery mismatch after a witnessed call is a product miss, not setup-invalid.
        s='witness-end';const valid=await platform.disarm();armed=false;
        if(!valid)throw Error('presentation changed');attested=true;
        if(!audit&&!focus&&!drain){s='observation';if(!await e.observe())row.observationMissing=true;}
        if(drain){
          for(let i=0;i<20&&!e.traces.has(id);i++)await pause(20);
          timingTrace=e.traces.get(id)??null;e.traces.delete(id);
        }
        if(focus){
          for(let i=0;i<20&&!e.traces.has(id);i++)await pause(20);
          focusFacts=e.traces.get(id)??null;e.traces.delete(id);
        }
        if(audit){
          s='audit';
          // The recorder always emits complete JSON lines; the wire final reply can win the pipe race.
          for(let i=0;i<20&&!e.traces.has(id);i++)await pause(20);
          const trace=e.traces.get(id);e.traces.delete(id);
          schedules.push({...c,lane,valid:attested&&receipt?.reply&&delivery?.exact===true,...(trace??{pass:false})});
        }
      }catch(e){if(!attested)row.invalid=s;else row.evidenceFailure=s;row.setupStep=setupLabel(e);}
      finally{
        if(armed){try{await platform.disarm();}catch{row.witnessCleanup=false;}}
        await e.disconnect();
        e.scope(null);
      }
      const controlOK=delivery?.controlExact===true&&delivery.hit===true&&delivery.key===true;
      Object.assign(row,score({...c,lane,preliminary:false,raw:receipt?.raw,forwarded:receipt?.forwarded,sky:receipt?.sky,noted:receipt?.noted,fixture:attested,
        domExact:delivery?.exact,controlExact:controlOK}));
      if(!row.valid&&!row.invalid)row.invalid='control-not-realized';
      row.typeRequest=receipt?.reply===true;
      row.action=receipt?.action??null;
      row.keyEvent=delivery?.key===true;
      row.controlRealized=m.control===null?null:controlOK;
      row.reason=pickReason(receipt?.raw?.reason);
      row.snapshotMs=Number.isFinite(receipt?.raw?.snapshotMs)?receipt.raw.snapshotMs:null;
      row.serviceMs=receipt?.serviceMs??null;
      row.concealedFailure=receipt?.budget??null;
      row.privacy=[...scope.flags];
      rows.push(row);
      if(drain){
        // Realized terminal content, judged by the independent fixture: an ordinary row's exact text or a control's exact altered text.
        const realized=m.control===null?row.domExact===true:controlOK;
        const elapsed=drainIntervals(timingTrace,{replyAtMs:receipt?.replyAtMs,confirmed:row.lengthConfirmed,app:lane==='appkit'?delivery:null,editAtMs:terminalEditAtMs(delivery)});
        timings.push({kind:c.kind,rep:c.rep,literal:c.literal===true,valid:row.valid,reason:row.reason,lengthConfirmed:row.lengthConfirmed,wrongSuccess:row.wrongSuccess,
          sampled:timingTrace!==null,realized,elapsed,ineligible:drainIneligible({valid:row.valid,realized,elapsed})});
      }
      if(lane==='firefox')firefoxFacts.push({head:c.head,kind:c.kind,rep:c.rep,valid:row.valid,domExact:row.domExact,setupUnchanged:delivery?.setupExact??null,action:row.action,
        reason:row.reason,disclosure:receipt?.disclosure??null,focus:focusFacts});
      streak=attested?0:streak+1;
      if(streak>=4){abort='consecutive-invalid';break;}
    }
  }catch(e){abort=stage;abortStep=setupLabel(e);}
  finally{
    for(const e of Object.values(engines))if(!await e.close())globalPrivacy.add('engine-drain-incomplete');
    await platform?.dispose();
    // The hosted job, not this probe, releases live browser profiles. Delete only engine homes in those lanes.
    const disposable=['cft','safari'].includes(lane)?['m','f'].map(name=>join(tmp,name)):[tmp];
    for(const path of disposable)rmSync(path,{recursive:true,force:true,maxRetries:2});
  }
  const summary=summarize(rows),auditGate=audit?auditPairs(schedules,smoke?1:5):null;
  const privacyViolations=summary.privacyViolations+(globalPrivacy.size?1:0);
  // Findings carry only the harness's surface label and scanner's fixed code, never the offending text or key.
  const privacyCodes=Object.create(null),actionCodes={main:Object.create(null),fix:Object.create(null)};
  for(const code of [...globalPrivacy,...rows.flatMap(r=>r.privacy)])privacyCodes[code]=(privacyCodes[code]??0)+1;
  for(const row of rows)if(row.action){const tally=actionCodes[row.head];tally[row.action]=(tally[row.action]??0)+1;}
  const needed=cells.filter(c=>c.kind!=='rewrite').length;
  const failureTimes=rows.filter(r=>r.valid&&r.concealedFailure).map(r=>r.concealedFailure);
  const postFailures=failureTimes.filter(t=>t.phase==='after-input'),snapshotRefusals=failureTimes.filter(t=>t.phase==='snapshot-refused');
  const budgetMisses=postFailures.filter(t=>!t.withinBudget).length;
  const concealedBudget={postFailures:postFailures.length,misses:budgetMisses,beforeInput:failureTimes.filter(t=>t.phase==='before-input').length,
    fromLastPostMs:drainStats(postFailures.map(t=>t.fromLastPostMs)),fromFirstPostMs:drainStats(postFailures.map(t=>t.fromFirstPostMs)),
    snapshotRefusals:snapshotRefusals.length,snapshotRefusedFromLastPostMs:drainStats(snapshotRefusals.map(t=>t.fromLastPostMs))};
  const gates={coverage:rows.filter(r=>r.valid&&!r.informational).length===needed&&abort===null,
    privacy:privacyViolations===0, outcome:audit||drain||focus||mode==='firefox-focus'?null:summary.scored.passed===needed&&summary.wrongSuccesses===0&&rows.every(r=>r.informational||!r.observationMissing&&!r.evidenceFailure),
    schedule:auditGate?.pass??null, focus:focus?firefoxFacts.length===needed&&firefoxFacts.every(r=>r.valid&&r.focus!==null):null,
    concealedBudget:mode==='full'&&phase==='stock'&&postFailures.length>0?budgetMisses===0:null,
    // The race run only collects evidence rows; sizing is judged by the drain run alone.
    timing:drain&&!race?drainSizingOk(drainSummary(timings,needed),timings.length):null};
  const publishable=gates.privacy;
  const status={lane,phase,kit:config.kit,refs:config.refs,abort,abortStep,setupSteps:rows.reduce((o,r)=>r.setupStep?{...o,[r.setupStep]:(o[r.setupStep]??0)+1}:o,{}),planned:cells.length,completed:rows.length,invalid:summary.invalid,
    unattempted:cells.length-rows.length,privacyViolations,privacyCodes,actionCodes,observationsMissing:rows.filter(r=>r.observationMissing).length,
    gates,concealedBudget,publishable,presentation:config.presentation??null,foregroundFallback:config.foregroundFallback??null};
  writeFileSync(join(out,'status.json'),JSON.stringify(status,null,2)+'\n');
  // Counts and timings rebuilt from closed codes may leave even a privacy-failed run; rows, hashes and traces never do.
  writeFileSync(join(out,'coded.json'),JSON.stringify(coded(summary,auditGate),null,2)+'\n');
  if(lane==='firefox')writeFileSync(join(out,'focus.json'),JSON.stringify({phase,fixtureShape:config.fixtureShape,presentation:config.presentation??null,rows:firefoxFacts},null,2)+'\n');
  if(capabilities)writeFileSync(join(out,'appkit-capabilities.json'),JSON.stringify(capabilities,null,2)+'\n');
  if(drain){
    writeFileSync(join(out,'timing.json'),JSON.stringify({lane,mode,sizing:!race,...drainSummary(timings,needed),rows:timings},null,2)+'\n');
  }
  if(publishable){
    for(const [name,value] of Object.entries({config,summary,rows,...(audit?{schedules,auditGate}:{})}))writeFileSync(join(out,`${name}.json`),JSON.stringify(value,null,2)+'\n');
  }
  console.log(JSON.stringify(status));
  if(Object.values(gates).some(x=>x===false))process.exitCode=1;
}
main().catch(()=>{console.error('Qualification harness failed before evidence publication');process.exitCode=1;});
