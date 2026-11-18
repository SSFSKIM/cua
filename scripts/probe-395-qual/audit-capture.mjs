// #395 qualification audit capture. One instance per run, driven by run.mjs at the engine boundary:
//   const audit = createAuditCapture({mode:'audit'|'stock'});
//   audit.registerSecret(value, 'secret'|'plain'|'seed');            // every synthetic value, before it is typed
//   audit.begin(tag, {head,page,kind,length,rep?,secret?,secureField?,fieldLengths?,route?});
//   args2 = audit.engineArgs(tag, method, args);                      // in the wire wrapper, right before w.execute(method, args2)
//   audit.engineReply(tag, method, rawReply);                         // raw {result|error}, before sky/service processing
//   audit.sky(tag, {rendered, error, meta});                          // after handleRpc returns or throws
//   audit.stderr(head, chunk);  audit.stderr(head, null) /*flush*/;   // every engine child's piped stderr, always drained
//   row = await audit.end(tag);  audit.assertClean(row);               // a scrubbed, persistable row
//   summary = audit.summarize(rows);                                   // cross-row gates and distributions
// Mode 'stock' (an unmodified engine build) injects no tag and waits for no engine record, so its rows can claim outcome and
// privacy of the exact build. Mode 'audit' (the scratch build from audit-patch.mjs) tags type_text, requires exactly one engine
// schedule record per tag, and must never be used as stock outcome or privacy evidence.
// Nothing raw is retained: replies, rendered values, errors and stderr lines are scanned and kept only as sanitized copies;
// the sole path to a persisted row is end().
import {createScanner,digest} from './audit-scan.mjs';
import {AuditError,buildSchedule,decodeRecord,compareSchedules,CLASSES} from './audit-schedule.mjs';
import {summarizeRows} from './audit-summary.mjs';
export {AuditError,compareSchedules};
export {compareAudits} from './audit-summary.mjs';
export const AUDIT_KEY='probe395Audit',AUDIT354_KEY='probe354Audit';
export class AuditViolation extends Error{constructor(row){super('privacy violations in '+row.tag+': '+Object.entries(row.privacy.codes).map(([c,n])=>c+'x'+n).join(', ')+' at '+row.privacy.paths.slice(0,8).join(', '));this.name='AuditViolation';this.tag=row.tag;this.codes=row.privacy.codes}}
const KINDS=Object.freeze(['plain','secretShort','secretLong','secure']);
const TAG=/^[A-Za-z0-9_./:-]{1,200}$/,LABEL=/^[A-Za-z0-9_-]{1,40}$/;
const laneOf=(kind,secureField)=>secureField===true||kind==='secure'?'secure':kind==='plain'?'plain':'secret';
const repOf=(tag,rep)=>Number.isSafeInteger(rep)?rep:(/[/-]r(\d{1,3})$/.exec(tag)?.[1]!==undefined?Number(/[/-]r(\d{1,3})$/.exec(tag)[1]):null);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const reasonOf=raw=>{const r=(raw?.result?.meta??raw?.error?.meta)?.typeReadback?.reason;return typeof r==='string'?r:null};
export function createAuditCapture({mode='audit',sink=null,clock=()=>performance.now(),extraSecretReadbackKeys=[],maxRowBytes=400000}={}){
 if(!['audit','stock'].includes(mode))throw Error('invalid mode');
 const scanner=createScanner({extraSecretReadbackKeys});
 const tags=new Map(),openByHead=new Map(),provenance=new Map(),records=new Map(),records354=new Map(),partial=new Map(),fullSchedules=new Map();
 const stray={audit:0,audit354:0,lines:0,findings:{}};
 const emit=e=>{if(sink)try{sink(e)}catch{}};
 const need=tag=>{const t=tags.get(tag);if(!t)throw Error('unknown audit tag');return t};
 const add=(t,found,surfaceStats)=>{for(const f of found){t.findings.push(f);t.codes[f.code]=(t.codes[f.code]??0)+1}if(surfaceStats){t.stats.withheld+=surfaceStats.withheld;t.stats.plainQuotes+=surfaceStats.plainQuotes;for(const k of surfaceStats.novelKeys)t.stats.novelKeys.add(k)}};
 function scanInto(t,value,surface){
  const r=scanner.scan(value,{lane:t.lane,lengths:t.lengths,surface});add(t,r.findings,r.stats);return r.clean;
 }
 function handleLine(head,line){
  if(line.startsWith('{"'+AUDIT_KEY+'":')||line.startsWith('{"'+AUDIT354_KEY+'":')){
   let parsed;try{parsed=JSON.parse(line)}catch{stray.lines++;return}
   if(parsed[AUDIT_KEY]!==undefined){const id=parsed[AUDIT_KEY]?.id;if(typeof id==='string'&&tags.has(id)){(records.get(id)??records.set(id,[]).get(id)).push(parsed[AUDIT_KEY])}else stray.audit++}
   else{const r=parsed[AUDIT354_KEY],id=r?.id;if(typeof id==='string'&&tags.has(id))(records354.get(id)??records354.set(id,[]).get(id)).push(r);else stray.audit354++}
   return;
  }
  const tag=openByHead.get(head),t=tag?tags.get(tag):null;
  const found=scanner.scanLine(line,{lane:t?.lane??'secret',lengths:t?[...t.lengths]:[],surface:'engine-stderr'});
  if(t){t.stderrLines++;add(t,found)}else{stray.lines++;for(const f of found)stray.findings[f.code]=(stray.findings[f.code]??0)+1}
 }
 const api={
  mode,
  registerSecret(value,kind='secret'){if(!['secret','plain','seed'].includes(kind))throw Error('invalid value kind');scanner.register(value,kind)},
  // The patch's stdout JSON for a head, so the pre-input boundary is known to exist (or not) in that build.
  setProvenance(head,patch){provenance.set(head,patch)},
  begin(tag,{head,page,kind,length,rep,secret,secureField,fieldLengths=[],route=null}={}){
   if(typeof tag!=='string'||!TAG.test(tag))throw Error('invalid audit tag');
   if(scanner.carries(tag).size)throw Error('audit tag carries a registered value');
   if(!KINDS.includes(kind)||!LABEL.test(String(head))||!LABEL.test(String(page)))throw Error('invalid audit labels');
   if(tags.has(tag))throw Error('audit tag already used');
   if(openByHead.has(head))throw Error('another audited request is open on this head');
   if(typeof secret==='string')scanner.register(secret,'secret');
   const lane=laneOf(kind,secureField),typed=Number.isSafeInteger(length)?length:(typeof secret==='string'?secret.length:null);
   const lengths=lane==='plain'?[]:[typed,...fieldLengths].filter(Number.isSafeInteger);
   const t={tag,head,page,kind,lane,rep:repOf(tag,rep),length:typed,route:typeof route==='string'&&LABEL.test(route)?route:null,lengths,openedAt:clock(),
    requests:0,methods:{},concealedOk:null,sentAt:null,recvAt:null,engine:null,sky:{rendered:null,error:null,meta:null},extra:{},findings:[],codes:{},stats:{withheld:0,plainQuotes:0,novelKeys:new Set()},stderrLines:0,ended:false,hasReply:false};
   tags.set(tag,t);openByHead.set(head,tag);return {tag};
  },
  engineArgs(tag,method,args){
   const t=need(tag);t.methods[method]=(t.methods[method]??0)+1;
   if(method!=='type_text')return args;
   t.requests++;t.sentAt=clock();
   const concealed=args?.concealed===true;
   t.concealedOk=t.lane==='plain'?!concealed:concealed;
   return mode==='audit'?{...args,[AUDIT_KEY]:tag,[AUDIT354_KEY]:tag}:args;
  },
  engineReply(tag,method,raw){
   const t=need(tag),at=clock();
   if(method==='type_text'){t.recvAt=at;t.hasReply=true}
   const clean=scanInto(t,raw,'engine-reply:'+method);
   if(method==='type_text'){
    t.engine={clean,wall:(()=>{const m=raw?.result?.meta??raw?.error?.meta;return Number.isFinite(m?.startedAt)&&Number.isFinite(m?.endedAt)?m.endedAt-m.startedAt:null})(),reason:reasonOf(raw)};
   }
  },
  sky(tag,{rendered=null,error=null,meta=null}={}){
   const t=need(tag);
   t.sky.rendered=scanInto(t,rendered,'sky-rendered');t.sky.error=scanInto(t,error,'sky-error');t.sky.meta=scanInto(t,meta,'sky-meta');
  },
  surface(tag,name,value){const t=need(tag);if(!LABEL.test(String(name)))throw Error('invalid surface name');t.extra[name]=scanInto(t,value,'surface:'+name)},
  stderr(head,chunk){
   if(chunk===null||chunk===undefined){const rest=partial.get(head);partial.delete(head);if(rest)handleLine(head,rest);return}
   let text=(partial.get(head)??'')+(Buffer.isBuffer(chunk)?chunk.toString('utf8'):String(chunk));
   if(text.length>64e6){partial.delete(head);stray.lines++;return}
   const parts=text.split('\n');partial.set(head,parts.pop());
   for(const line of parts)if(line)handleLine(head,line);
  },
  async end(tag,{timeoutMs=4000,expectedRequests=1,graceMs=40}={}){
   const t=need(tag);if(t.ended)throw Error('audit tag already ended');
   const wait=async()=>{const stop=Date.now()+timeoutMs;
    while(Date.now()<stop&&!((records.get(tag)?.length??0)>=1&&(records354.get(tag)?.length??0)>=1))await sleep(10);
    await sleep(graceMs);}; // a duplicate record would land just after the first
   if(mode==='audit')await wait();
   t.ended=true;openByHead.delete(t.head);
   const failures=[];
   if(t.requests!==expectedRequests)failures.push('type-text-count');
   if(!t.hasReply)failures.push('no-engine-reply');
   if(t.concealedOk===false)failures.push('concealed-flag-mismatch');
   let schedule=null,audit354=null,auditClock=null;
   if(mode==='audit'){
    const list=records.get(tag)??[],list354=records354.get(tag)??[];
    if(list.length===0)failures.push('audit-record-missing');
    else if(list.length!==expectedRequests)failures.push('audit-record-count');
    if(list.length>=1){
     try{
      const prov=provenance.get(t.head),decoded=decodeRecord(list[0]);
      const built=buildSchedule(decoded,{preInputAvailable:prov?prov.boundaries?.eventPost===true:true});
      if(!built.complete)failures.push('audit-incomplete');
      const {strictKey,...kept}=built;
      fullSchedules.set(tag,built);
      schedule={...kept,strictHash:digest(strictKey),entriesTotal:strictKey?strictKey.split('|').length:0,preInput:{...built.preInput,exactHash:digest(built.preInput.exactKey),exactKey:undefined},boundaryProvenance:prov?'known':'unknown',phasesApplied:prov?.phases?.applied??null};
      auditClock=decoded.spanMs;
     }catch(e){failures.push(e instanceof AuditError?e.code:'audit-record-malformed')}
    }
    if(list354.length>=1){
     const r=list354[0],okInt=n=>Number.isSafeInteger(n)&&n>=0;
     if(okInt(r.textReadAttempts)&&okInt(r.rangeReadAttempts)&&r.byAttribute&&typeof r.byAttribute==='object')
      audit354={textReadAttempts:r.textReadAttempts,rangeReadAttempts:r.rangeReadAttempts,byAttribute:Object.fromEntries(Object.entries(r.byAttribute).filter(([k,v])=>/^[A-Za-z0-9_]{1,64}$/.test(k)&&okInt(v)))};
     else failures.push('audit-record-malformed');
    }
   }
   const privacyOk=t.findings.length===0;
   if(!privacyOk)failures.push('privacy');
   const rpcMs=t.sentAt!==null&&t.recvAt!==null?t.recvAt-t.sentAt:null;
   // The three clocks are independent and are never subtracted from one another: node's monotonic clock around the socket call,
   // the engine's wall clock between its startedAt and endedAt, and the audit's own monotonic span inside the tagged request.
   const clocks={rpcMs:rpcMs===null?null:Math.round(rpcMs*1000)/1000,routeWallMs:t.engine?.wall??null,auditSpanMs:auditClock===null?null:Math.round(auditClock*1000)/1000,
    checks:{auditWithinRpc:auditClock!==null&&rpcMs!==null?auditClock<=rpcMs+1:null,routeWithinRpc:t.engine?.wall!=null&&rpcMs!==null?t.engine.wall<=rpcMs+5:null}};
   const rb=r=>{const x=(r?.result?.meta??r?.error?.meta)?.typeReadback;return x===undefined?null:x};
   const engineClean=t.engine?.clean??null,typeReadback=rb(engineClean),skyTypeReadback=t.sky.meta?.['cua/typeReadback']??t.sky.meta?.typeReadback??null;
   const routeTimings=(()=>{
    const m=engineClean?.result?.meta??engineClean?.error?.meta,out={};
    if(m&&typeof m==='object'){
     for(const [k,v] of Object.entries(typeReadback??{}))if(typeof v==='number'&&/Ms$/.test(k))out[k]=v;
     if(typeof m.inputRoute==='string')out.inputRoute=m.inputRoute;
     if(typeof m.route==='string')out.route=m.route;
    }
    return Object.keys(out).length||clocks.routeWallMs!==null?{...out,routeWallMs:clocks.routeWallMs}:null;
   })();
   const sanitizedOutcome=engineClean?.error?{outcome:'error',errorName:typeof engineClean.error.errorName==='string'?engineClean.error.errorName:null,errorCode:Number.isFinite(engineClean.error.code)?engineClean.error.code:null}:engineClean?.result!==undefined?{outcome:'success'}:{outcome:null};
   const row={tag,head:t.head,page:t.page,kind:t.kind,lane:t.lane,rep:t.rep,length:t.length,route:t.route,mode,ok:failures.length===0,failures:[...new Set(failures)],
    privacy:{ok:privacyOk,violations:t.findings.length,codes:t.codes,paths:[...new Set(t.findings.map(f=>f.surface+':'+f.path+':'+f.code))].slice(0,50),withheldStrings:t.stats.withheld,plainQuotesWithheld:t.stats.plainQuotes,novelPlainReadbackKeys:[...t.stats.novelKeys].sort(),stderrLines:t.stderrLines},
    engine:{...sanitizedOutcome,reply:engineClean},typeReadback,skyTypeReadback,
    typeReadbackConcealed:typeReadback&&typeof typeReadback==='object'?typeReadback.concealed===true:null,
    sky:t.sky,surfaces:t.extra,routeTimings,clocks,schedule,audit354,requests:{typeText:t.requests,methods:t.methods}};
   // A row too large to keep is a harness fault, not a reason to drop the privacy verdict.
   let size=JSON.stringify(row).length;
   if(size>maxRowBytes){row.engine.reply='[omitted: oversize]';row.sky={rendered:null,error:null,meta:null};row.surfaces={};row.ok=false;row.failures.push('row-oversize');size=JSON.stringify(row).length}
   // Defence in depth: a registered value in the finished row is a violation and the row is stripped, not returned.
   const text=JSON.stringify(row);
   if(scanner.carries(text).size){
    const stripped={tag,head:t.head,page:t.page,kind:t.kind,lane:t.lane,rep:t.rep,length:t.length,mode,ok:false,failures:['privacy'],privacy:{ok:false,violations:t.findings.length+1,codes:{...t.codes,'row-scan':1},paths:['row:row-scan'],withheldStrings:0,plainQuotesWithheld:0,novelPlainReadbackKeys:[],stderrLines:t.stderrLines},engine:null,schedule:null};
    emit({tag,event:'end',ok:false});records.delete(tag);records354.delete(tag);return stripped;
   }
   records.delete(tag);records354.delete(tag);
   emit({tag,event:'end',ok:row.ok});
   return row;
  },
  assertClean(row){if(!row||!row.privacy||row.privacy.violations>0||row.privacy.ok!==true)throw new AuditViolation(row)},
  // In-memory full schedule (with the exact keys a persisted row replaces by hashes) for divergence detail.
  schedule(tag){return fullSchedules.get(tag)??null},
  summarize(rows,options){return summarizeRows(rows,{...options,full:tag=>fullSchedules.get(tag)??null,stray:{...stray}})},
  stats(){return {...stray,open:[...openByHead.entries()]}},
  close(){for(const head of [...partial.keys()])api.stderr(head,null)},
  classes:CLASSES,
 };
 return api;
}
