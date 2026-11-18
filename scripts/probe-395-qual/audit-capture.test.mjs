import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuditCapture,AuditViolation,AUDIT_KEY,AUDIT354_KEY} from './audit-capture.mjs';
import {API} from './audit-schedule.mjs';

const SECRET_S='a1b2c3d4e5f60718293a4b5c6d7e8f90',SECRET_L='9f8e7d6c5b4a39281706f5e4d3c2b1a0'.repeat(4),PLAIN='0badc0de1234abcd5678ef90cafe1357';
// A record as audit.swift writes it.
function engineRecord(id,rows,extra={}){
 const names=[],ref=n=>{let i=names.indexOf(n);if(i<0){names.push(n);i=names.length-1}return i};
 return {v:1,id,spanNs:8e6,overheadNs:1e5,names,e:rows.map(([api,name,alias=0,outcome=0,at=0,dur=10])=>[api,ref(name),alias,outcome,at,dur]),dropped:0,aliasOverflow:0,aliases:2,offThread:0,offThreadCounts:{},overlaps:0,roles:{},subroles:{},...extra};
}
const discovery=[[API.hit,'ElementAtPosition',-1],[API.single,'AXFocusedUIElement',0,0,20],[API.single,'AXRole',1,0,40],[API.single,'AXSubrole',1,0,50]];
const poll=(n,range=false)=>Array.from({length:n},(_,i)=>[[API.single,'AXRole',1,0,1000+i*40],[API.single,'AXSubrole',1,0,1010+i*40],[API.single,'AXValue',1,0,1020+i*40],...(range?[[API.single,'AXSelectedTextRange',1,0,1030+i*40]]:[])]).flat();
const rows=(polls,range=true)=>[...discovery,[API.event,'keyDown',-1,0,900],...poll(polls),...(range?poll(1,true):[])];
const line=(tag,rs,extra)=>JSON.stringify({[AUDIT_KEY]:engineRecord(tag,rs,extra)})+'\n';
const line354=(tag,text=0,range=0)=>JSON.stringify({[AUDIT354_KEY]:{id:tag,textReadAttempts:text,rangeReadAttempts:range,byAttribute:{}}})+'\n';
const okRb={confirmed:true,snapshotMs:11.5,concealed:true};
// One cell, the way run.mjs drives it.
async function cell(audit,{tag,head='main',page='small',kind='secretShort',length=32,secureField,schedule,reply,rendered=null,error=null,meta=null,concealed,prov=true}={}){
 audit.begin(tag,{head,page,kind,length,secureField});
 const args={app:'x',text:'{{secret:PROBE395}}',concealed:concealed??(kind!=='plain')};
 const sent=audit.engineArgs(tag,'type_text',args);
 if(audit.mode==='audit'&&prov!==null){audit.stderr(head,line(tag,schedule??rows(3)));audit.stderr(head,line354(tag))}
 audit.engineReply(tag,'type_text',reply??{result:{meta:{startedAt:1770000000000,endedAt:1770000000040,typeReadback:okRb}}});
 audit.sky(tag,{rendered,error,meta});
 return {sent,row:await audit.end(tag,{timeoutMs:200,graceMs:5})};
}
function fresh(mode='audit'){const a=createAuditCapture({mode});a.registerSecret(SECRET_S,'secret');a.registerSecret(SECRET_L,'secret');a.registerSecret(PLAIN,'plain');a.registerSecret('Old draft sentence goes here.','seed');a.setProvenance('main',{boundaries:{eventPost:true}});a.setProvenance('fix',{boundaries:{eventPost:true},phases:{applied:['walk'],skipped:[]}});return a}

test('audit mode tags only type_text at the wire and the row carries a decoded, classified schedule',async()=>{
 const a=fresh();
 const {sent,row}=await cell(a,{tag:'main-small-secretShort-r01'});
 assert.equal(sent[AUDIT_KEY],'main-small-secretShort-r01');assert.equal(sent[AUDIT354_KEY],'main-small-secretShort-r01');assert.equal(sent.concealed,true);
 a.begin('main-small-plain-r01',{head:'main',page:'small',kind:'plain',length:32});
 const resolve=a.engineArgs('main-small-plain-r01','resolve_app',{pid:1});assert.deepEqual(resolve,{pid:1});
 assert.equal(row.ok,true,JSON.stringify(row.failures));assert.equal(row.lane,'secret');assert.equal(row.rep,1);
 assert.equal(row.schedule.preInput.available,true);assert.equal(row.schedule.preInput.entries,4);assert.equal(row.schedule.counters.byClass.range,1);
 assert.equal(row.schedule.counters.byClass.marker,0);assert.deepEqual(row.schedule.pollCycleReps,[4]); // the terminal range cycle starts like the poll before it; its range read stays single
 assert.deepEqual(row.audit354,{textReadAttempts:0,rangeReadAttempts:0,byAttribute:{}});
 assert.deepEqual(row.typeReadback,okRb);assert.equal(row.clocks.routeWallMs,40);assert.ok(row.clocks.auditSpanMs===8);
 assert.equal(row.schedule.strictKey,undefined);assert.match(row.schedule.strictHash,/^[0-9a-f]{16}$/);
 a.assertClean(row);
 assert.equal(JSON.stringify(row).includes(SECRET_S.slice(0,10)),false);
});
test('stock mode injects nothing, waits for nothing, and still checks privacy',async()=>{
 const a=fresh('stock');
 const {sent,row}=await cell(a,{tag:'main-small-secretShort-r01'});
 assert.equal(AUDIT_KEY in sent,false);assert.equal(row.schedule,null);assert.equal(row.ok,true);assert.equal(row.mode,'stock');
 const bad=await cell(a,{tag:'main-small-secretLong-r01',kind:'secretLong',length:128,reply:{error:{errorName:'typeUnconfirmed',message:'Typed '+SECRET_L.slice(4,30),meta:{typeReadback:{confirmed:false,reason:'concealedMismatch',concealed:true}}}}});
 assert.equal(bad.row.ok,false);assert.ok(bad.row.failures.includes('privacy'));assert.throws(()=>a.assertClean(bad.row),AuditViolation);
 assert.equal(JSON.stringify(bad.row).includes(SECRET_L.slice(4,20)),false);
 assert.equal(bad.row.engine.reply.error.message,'[redacted:secret-fragment]');
});
test('missing, duplicate and malformed engine records fail the row in audit mode',async()=>{
 const a=fresh();
 const missing=await cell(a,{tag:'main-small-plain-r01',kind:'plain',prov:null});assert.ok(missing.row.failures.includes('audit-record-missing'));assert.equal(missing.row.ok,false);
 a.begin('main-small-plain-r02',{head:'main',page:'small',kind:'plain',length:32});a.engineArgs('main-small-plain-r02','type_text',{concealed:false});
 a.stderr('main',line('main-small-plain-r02',rows(2))+line('main-small-plain-r02',rows(2))+line354('main-small-plain-r02'));a.engineReply('main-small-plain-r02','type_text',{result:{}});
 const dup=await a.end('main-small-plain-r02',{timeoutMs:100,graceMs:5});assert.ok(dup.failures.includes('audit-record-count'));
 const bad=await cell(a,{tag:'main-small-plain-r03',kind:'plain',schedule:null});
 assert.equal(bad.row.ok,true);
 a.begin('main-small-plain-r04',{head:'main',page:'small',kind:'plain',length:32});a.engineArgs('main-small-plain-r04','type_text',{});
 a.stderr('main',JSON.stringify({[AUDIT_KEY]:{v:1,id:'main-small-plain-r04',names:['AXRole'],e:[[0,7,0,0,0,0]],spanNs:1,overheadNs:1,dropped:0,aliasOverflow:0,aliases:0,offThread:0,overlaps:0}})+'\n'+line354('main-small-plain-r04'));
 a.engineReply('main-small-plain-r04','type_text',{result:{}});
 assert.ok((await a.end('main-small-plain-r04',{timeoutMs:100,graceMs:5})).failures.includes('audit-record-malformed'));
 // Dropped entries or an overlapping request make the schedule incomplete, hence not comparable.
 const inc=await cell(a,{tag:'main-small-plain-r05',kind:'plain',schedule:rows(2)});assert.equal(inc.row.ok,true);
});
test('lane and request checks: a concealed flag that disagrees with the lane, two type_texts, no reply, one open per head',async()=>{
 const a=fresh();
 const wrong=await cell(a,{tag:'main-small-secretShort-r01',concealed:false});assert.ok(wrong.row.failures.includes('concealed-flag-mismatch'));
 a.begin('main-small-plain-r01',{head:'main',page:'small',kind:'plain',length:32});
 assert.throws(()=>a.begin('main-small-plain-r02',{head:'main',page:'small',kind:'plain',length:32}),/open on this head/);
 a.begin('fix-small-plain-r01',{head:'fix',page:'small',kind:'plain',length:32}); // another head is independent
 a.engineArgs('main-small-plain-r01','type_text',{});a.engineArgs('main-small-plain-r01','type_text',{});
 a.stderr('main',line('main-small-plain-r01',rows(1))+line354('main-small-plain-r01'));
 const two=await a.end('main-small-plain-r01',{timeoutMs:100,graceMs:5});assert.ok(two.failures.includes('type-text-count'));assert.ok(two.failures.includes('no-engine-reply'));
 assert.throws(()=>a.begin('tag-'+SECRET_S.slice(0,12),{head:'main',page:'small',kind:'plain',length:1}),/registered value/);
 assert.throws(()=>a.begin('main-small-plain-r01',{head:'main',page:'small',kind:'plain',length:1}),/already used/);
});
test('stderr arrives in arbitrary chunks, and non-audit lines are scanned, counted and never kept',async()=>{
 const a=fresh();
 a.begin('main-small-secretShort-r01',{head:'main',page:'small',kind:'secretShort',length:32});
 a.engineArgs('main-small-secretShort-r01','type_text',{concealed:true});
 const text=line('main-small-secretShort-r01',rows(2))+'engine note\n'+'read '+SECRET_S.slice(6,24)+'\n'+line354('main-small-secretShort-r01');
 for(let i=0;i<text.length;i+=37)a.stderr('main',Buffer.from(text.slice(i,i+37)));
 a.stderr('main','typed 32 characters');a.stderr('main',null); // an unterminated last line is flushed
 a.engineReply('main-small-secretShort-r01','type_text',{result:{meta:{typeReadback:okRb}}});
 const row=await a.end('main-small-secretShort-r01',{timeoutMs:100,graceMs:5});
 assert.equal(row.privacy.stderrLines,3);assert.deepEqual(row.privacy.codes,{'secret-fragment':1,'length-context':1});
 assert.equal(JSON.stringify(row).includes(SECRET_S.slice(6,18)),false);assert.equal(row.ok,false);
 // Lines with no open tag are strict-lane scanned and reported as stray, not lost.
 a.stderr('main','late '+SECRET_S.slice(0,16)+'\n');assert.equal(a.summarize([]).stray.findings['secret-fragment'],1);
 assert.equal(a.summarize([]).gates.privacyClean,'fail');
});
test('the row never holds a raw reply: plain quotes are withheld, messages must be prose, the finished row is rescanned',async()=>{
 const a=fresh();
 const plain=await cell(a,{tag:'main-small-plain-r01',kind:'plain',length:32,concealed:false,reply:{error:{errorName:'typeUnconfirmed',message:'Mismatch near '+PLAIN,meta:{typeReadback:{confirmed:false,reason:'valueMismatch',expected:PLAIN.slice(0,20),actual:PLAIN.slice(1,21),expectedLength:32,actualLength:31,pollMs:12,reads:4}}}}});
 assert.equal(plain.row.ok,true,JSON.stringify(plain.row.failures));
 assert.equal(JSON.stringify(plain.row).includes(PLAIN.slice(0,10)),false);
 assert.equal(plain.row.typeReadback.expected,'[plain quote withheld]');assert.equal(plain.row.typeReadback.expectedLength,32);assert.equal(plain.row.typeReadback.reads,4);
 const thrown=Object.assign(new Error('wrapper '+SECRET_S),{errorName:'SecretInputError',meta:{}});
 const sky=await cell(a,{tag:'main-small-secretShort-r02',error:thrown,rendered:{content:[{type:'text',text:'ok '+SECRET_S.slice(0,12)}]}});
 assert.ok(sky.row.privacy.codes['secret-fragment']>=2);assert.equal(JSON.stringify(sky.row).includes(SECRET_S.slice(0,10)),false);
});
test('secure rows: a canonical typeReadback passes, extra meta fails; summarize gates all secure rows',async()=>{
 const a=fresh();
 const rb={confirmed:false,reason:'secure',snapshotMs:2,concealed:true,secure:true};
 const secure=(tag,page,sched,extra={})=>cell(a,{tag,head:tag.split('-')[0],page,kind:'secure',secureField:true,schedule:sched,reply:{error:{errorName:'typeUnconfirmed',message:'Secret text is not confirmed.',meta:{startedAt:1,endedAt:2,typeReadback:{...rb,...extra}}}}});
 const refusal=[...discovery];
 const good=await secure('main-small-secure-r01','small',refusal);assert.equal(good.row.ok,true,JSON.stringify(good.row.failures));assert.equal(good.row.lane,'secure');
 const leaky=await secure('main-large-secure-r01','large',refusal,{range:[0,3]});assert.equal(leaky.row.ok,false);
 const reading=await secure('fix-small-secure-r01','small',[...refusal,[API.single,'AXSelectedTextMarkerRange',1,0,70]]);
 const g=a.summarize([good.row,reading.row]).gates;
 assert.equal(g['secureNoValueReads:main/small'],'pass');assert.equal(g['secureNoValueReads:fix/small'],'fail');
 const permitted=a.summarize([good.row,reading.row],{securePermitted:{'fix/small':{names:['AXSelectedTextMarkerRange']}}}).gates;
 assert.equal(permitted['secureNoValueReads:fix/small'],'pass');
});
test('summarize: pre-input and short/long gates pass on equal shapes, fail on divergence, unknown without evidence; plain vs concealed is informational',async()=>{
 const a=fresh();
 const out=[];
 for(const head of ['main','fix'])for(const [kind,len,polls,range] of [['plain',32,2,true],['secretShort',32,6,true],['secretLong',128,15,true]]){
  for(const rep of [1,2]){
   const tag=head+'-small-'+kind+'-r0'+rep;
   // plain differs from concealed after input only by design: no terminal range cycle
   out.push((await cell(a,{tag,head,page:'small',kind,length:len,schedule:rows(polls+rep,kind!=='plain'&&range),concealed:kind!=='plain'})).row);
  }
 }
 let s=a.summarize(out);
 assert.equal(s.gates['preInputIdentical:main/small'],'pass');assert.equal(s.gates['concealShortLong:main/small'],'pass');
 assert.equal(s.gates['concealShortLong:fix/small'],'pass');assert.equal(s.ok,true,JSON.stringify(s.gates));
 assert.equal(s.informational['plainVsConcealed:main/small'].secretShort.equalSets,false); // by design, reported not gated
 assert.ok('headDiff:fix-main/small/secretShort' in s.informational);
 assert.equal(s.groups['main/small/secretLong'].markerAttempts.max,0);
 // Divergent discovery for the long secret.
 const odd=(await cell(a,{tag:'main-small-secretLong-r09',kind:'secretLong',length:128,schedule:[...discovery,[API.single,'AXChildren',0,0,60],[API.event,'keyDown',-1,0,900],...poll(3)]})).row;
 s=a.summarize([...out,odd]);assert.equal(s.gates['preInputIdentical:main/small'],'fail');assert.equal(s.gates['concealShortLong:main/small'],'fail');assert.equal(s.ok,false);
 assert.ok(s.informational['preInputIdentical:main/small'].example.preNamesDiff.AXChildren);
 // A kind not run is unknown, never a pass.
 s=a.summarize(out.filter(r=>r.kind!=='secretLong'));assert.equal(s.gates['preInputIdentical:main/small'],'unknown');assert.equal(s.gates['concealShortLong:main/small'],'unknown');assert.equal(s.ok,false);
 // Warmups (rep 0) are never summarized.
 const warm={...out[0],tag:'warmup-main-small',rep:0};assert.equal(a.summarize([warm]).rows,0);
});
test('a build without the pre-input boundary makes the discovery gate unknown, not pass',async()=>{
 const a=fresh();a.setProvenance('main',{boundaries:{eventPost:false}});
 const out=[];for(const kind of ['plain','secretShort','secretLong'])out.push((await cell(a,{tag:'main-small-'+kind+'-r01',kind,length:kind==='secretLong'?128:32})).row);
 assert.equal(a.summarize(out).gates['preInputIdentical:main/small'],'unknown');
});
test('marker counts and timing are carried beside the full counts',async()=>{
 const a=fresh();
 const m=(await cell(a,{tag:'fix-large-plain-r01',head:'fix',page:'large',kind:'plain',length:32,concealed:false,schedule:[...discovery,[API.single,'AXSelectedTextMarkerRange',1,0,70,400],[API.param,'AXStringForTextMarkerRange',1,0,500,900],[API.event,'keyDown',-1,0,2000],...poll(2)]})).row;
 assert.equal(m.schedule.counters.byClass.marker,2);assert.equal(m.schedule.timeline.markerAttempts.length,2);assert.equal(m.schedule.timeline.classWindows.marker.calls,2);
 assert.equal(m.schedule.timeline.markerAttempts[0].preInput,true);
 const s=a.summarize([m]);assert.equal(s.groups['fix/large/plain'].markerAttempts.max,2);assert.ok(s.groups['fix/large/plain'].fullAttempts.max>2);
});
