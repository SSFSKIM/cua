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
// One readbackPoll iteration, role/subrole/value (a caret read joins the iteration that sees the expected value), and a poll phase:
// `n` plain retries, then (when `caret`) the caret iteration, then the confirming one. Its raw length varies; its shape does not.
const iter=(at,caret=false)=>[[API.phaseBegin,'fieldClosed',-1,0,at],[API.single,'AXRole',1,0,at+1],[API.single,'AXSubrole',1,0,at+2],[API.phaseEnd,'fieldClosed',-1,0,at+3],[API.single,'AXValue',1,0,at+4],...(caret?[[API.single,'AXSelectedTextRange',1,0,at+5]]:[])];
const poll=(n,caret=false)=>[[API.phaseBegin,'poll',-1,0,1000],...Array.from({length:n},(_,i)=>iter(1010+i*40)).flat(),...(caret?iter(5000,true):[]),...iter(5100),[API.phaseEnd,'poll',-1,0,1000,4000]];
const rows=(polls,caret=true)=>[...discovery,[API.event,'keyDown',-1,0,900],...poll(polls,caret)];
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
function fresh(mode='audit'){const a=createAuditCapture({mode});a.registerSecret(SECRET_S,'secret');a.registerSecret(SECRET_L,'secret');a.registerSecret(PLAIN,'plain');a.registerSecret('Old draft sentence goes here.','seed');const hooks={boundaries:{eventPost:true,eventHid:true},phases:{applied:['walk','poll','fieldClosed'],skipped:[]}};a.setProvenance('main',hooks);a.setProvenance('fix',{...hooks,phases:{applied:['markedField','poll','fieldClosed'],skipped:[]}});return a}

test('audit mode tags only type_text at the wire and the row carries a decoded, classified schedule',async()=>{
 const a=fresh();
 const {sent,row}=await cell(a,{tag:'main-small-secretShort-r01'});
 assert.equal(sent[AUDIT_KEY],'main-small-secretShort-r01');assert.equal(sent[AUDIT354_KEY],'main-small-secretShort-r01');assert.equal(sent.concealed,true);
 a.begin('main-small-plain-r01',{head:'main',page:'small',kind:'plain',length:32});
 const resolve=a.engineArgs('main-small-plain-r01','resolve_app',{pid:1});assert.deepEqual(resolve,{pid:1});
 assert.equal(row.ok,true,JSON.stringify(row.failures));assert.equal(row.lane,'secret');assert.equal(row.rep,1);
 assert.equal(row.schedule.preInput.available,true);assert.equal(row.schedule.preInput.entries,4);assert.equal(row.schedule.counters.byClass.range,1);
 assert.equal(row.schedule.counters.byClass.marker,0);assert.deepEqual(row.schedule.pollCycleReps,[5]); // raw iterations: three retries, the caret read, the confirming one
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
 assert.equal(g['secureNoValueReads:main.small'],'pass');assert.equal(g['secureNoValueReads:fix.small'],'fail');
 const permitted=a.summarize([good.row,reading.row],{securePermitted:{'fix.small':{names:['AXSelectedTextMarkerRange']}}}).gates;
 assert.equal(permitted['secureNoValueReads:fix.small'],'pass');
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
 assert.equal(s.gates['preInputIdentical:main.small'],'pass');assert.equal(s.gates['concealShortLong:main.small'],'pass');
 assert.equal(s.gates['concealShortLong:fix.small'],'pass');assert.equal(s.ok,true,JSON.stringify(s.gates));
 assert.equal(s.informational['plainVsConcealed:main.small'].secretShort.equalSets,false); // by design, reported not gated
 assert.ok('headDiff:fix-main.small.secretShort' in s.informational);
 assert.equal(s.groups['main.small.secretLong'].markerAttempts.max,0);
 // Divergent discovery for the long secret.
 const odd=(await cell(a,{tag:'main-small-secretLong-r09',kind:'secretLong',length:128,schedule:[...discovery,[API.single,'AXChildren',0,0,60],[API.event,'keyDown',-1,0,900],...poll(3)]})).row;
 s=a.summarize([...out,odd]);assert.equal(s.gates['preInputIdentical:main.small'],'fail');assert.equal(s.gates['concealShortLong:main.small'],'fail');assert.equal(s.ok,false);
 assert.ok(s.informational['preInputIdentical:main.small'].example.preNamesDiff.AXChildren);
 // A kind not run is unknown, never a pass.
 s=a.summarize(out.filter(r=>r.kind!=='secretLong'));assert.equal(s.gates['preInputIdentical:main.small'],'unknown');assert.equal(s.gates['concealShortLong:main.small'],'unknown');assert.equal(s.ok,false);
 // Warmups (rep 0) are never summarized.
 const warm={...out[0],tag:'warmup-main-small',rep:0};assert.equal(a.summarize([warm]).rows,0);
});
test('a build without the pre-input boundary makes the discovery gate unknown, not pass',async()=>{
 const a=fresh();a.setProvenance('main',{boundaries:{eventPost:false}});
 const out=[];for(const kind of ['plain','secretShort','secretLong'])out.push((await cell(a,{tag:'main-small-'+kind+'-r01',kind,length:kind==='secretLong'?128:32})).row);
 assert.equal(a.summarize(out).gates['preInputIdentical:main.small'],'unknown');
});
test('marker counts and timing are carried beside the full counts',async()=>{
 const a=fresh();
 const m=(await cell(a,{tag:'fix-large-plain-r01',head:'fix',page:'large',kind:'plain',length:32,concealed:false,schedule:[...discovery,[API.single,'AXSelectedTextMarkerRange',1,0,70,400],[API.param,'AXStringForTextMarkerRange',1,0,500,900],[API.event,'keyDown',-1,0,2000],...poll(2)]})).row;
 assert.equal(m.schedule.counters.byClass.marker,2);assert.equal(m.schedule.timeline.markerAttempts.length,2);assert.equal(m.schedule.timeline.classWindows.marker.calls,2);
 assert.equal(m.schedule.timeline.markerAttempts[0].preInput,true);
 const s=a.summarize([m]);assert.equal(s.groups['fix.large.plain'].markerAttempts.max,2);assert.ok(s.groups['fix.large.plain'].fullAttempts.max>2);
});
test('a head needs both event hooks in its own provenance, and a typed row an actual first event; the hooks are kept per head on the row',async()=>{
 const a=fresh();a.setProvenance('main',{boundaries:{eventPost:true,eventHid:false},phases:{applied:['poll'],skipped:[]}});
 const mk=async(head,tag,kind,sched)=>(await cell(a,{tag,head,page:'small',kind,length:kind==='secretLong'?128:32,schedule:sched})).row;
 const kinds=['plain','secretShort','secretLong'];
 const half=[];for(const kind of kinds)half.push(await mk('main','main-small-'+kind+'-r01',kind));
 assert.deepEqual(half[0].schedule.eventHooks,{post:true,hid:false});assert.equal(half[0].schedule.preInput.available,false);
 assert.equal(a.summarize(half).gates['preInputIdentical:main.small'],'unknown');assert.equal(a.summarize(half).gates['concealShortLong:main.small'],'unknown');
 const whole=[];for(const kind of kinds)whole.push(await mk('fix','fix-small-'+kind+'-r01',kind));
 assert.deepEqual(whole[0].schedule.eventHooks,{post:true,hid:true});
 let s=a.summarize(whole);assert.equal(s.gates['preInputIdentical:fix.small'],'pass');assert.equal(s.gates['concealShortLong:fix.small'],'pass');
 // No provenance at all is no boundary, never an assumed one.
 const b=createAuditCapture({mode:'audit'});b.registerSecret(SECRET_S,'secret');
 const none=(await cell(b,{tag:'main-small-plain-r01',kind:'plain',length:32,concealed:false})).row;assert.equal(none.schedule.preInput.available,false);assert.equal(none.schedule.boundaryProvenance,'unknown');
 // A typed row that never posted an event fails the pre-input gate (the refusal control is the secure kind, which is not required to).
 const silent=[];for(const kind of kinds)silent.push(await mk('fix','fix-small-'+kind+'-r02',kind,[...discovery,...poll(1,true)]));
 assert.equal(silent[0].schedule.preInput.boundary,'none');
 s=a.summarize(silent);assert.equal(s.gates['preInputIdentical:fix.small'],'fail');assert.equal(s.gates['concealShortLong:fix.small'],'fail');
});
test('short and long concealed shapes agree rep by rep after poll retries are removed; equal sets do not hide a rep that differs',async()=>{
 const a=fresh();
 const mk=async(kind,rep,sched)=>(await cell(a,{tag:'main-small-'+kind+'-r0'+rep,kind,length:kind==='secretLong'?128:32,schedule:sched})).row;
 const plain=async rep=>(await cell(a,{tag:'main-small-plain-r0'+rep,kind:'plain',length:32,concealed:false,schedule:rows(rep)})).row;
 // Different numbers of retries in short and long reps: one shape.
 let out=[await plain(1),await plain(2)];
 for(const rep of [1,2]){out.push(await mk('secretShort',rep,rows(rep*2)));out.push(await mk('secretLong',rep,rows(9-rep,true)))}
 let s=a.summarize(out);assert.equal(s.gates['concealShortLong:main.small'],'pass',JSON.stringify(s.informational['concealShortLong:main.small']));
 assert.equal(s.informational['concealShortLong:main.small'].shapeEqual,2);
 // Short rep 3 and long rep 4 take one shape, short rep 4 and long rep 3 the other: both kinds show both shapes, no rep agrees.
 const A=rows(2,true),B=[...discovery,[API.event,'keyDown',-1,0,900],...poll(2,true),[API.single,'AXChildren',1,0,6000]];
 out=[await plain(3),await plain(4),await mk('secretShort',3,A),await mk('secretShort',4,B),await mk('secretLong',3,B),await mk('secretLong',4,A)];
 s=a.summarize(out);const info=s.informational['concealShortLong:main.small'];
 assert.equal(info.equalSets,true);assert.equal(info.shapeEqual,0);assert.equal(s.gates['concealShortLong:main.small'],'fail');
 // A short rep with no long partner is not evidence.
 out=[await plain(5),await mk('secretShort',5,rows(1,true)),await mk('secretShort',6,rows(1,true)),await mk('secretLong',5,rows(4,true))];
 assert.equal(a.summarize(out).gates['concealShortLong:main.small'],'unknown');
 // A head built without the poll hook cannot be normalized: unknown.
 a.setProvenance('main',{boundaries:{eventPost:true,eventHid:true},phases:{applied:['walk'],skipped:[]}});
 const lone=[await plain(7),await mk('secretShort',7,rows(1,true)),await mk('secretLong',7,rows(1,true))];
 assert.equal(a.summarize(lone).gates['concealShortLong:main.small'],'unknown');
});
const MARKER_NAMES=['AXSelectedTextMarkerRange','AXUIElementForTextMarker'];
const PAIR=[[API.single,'AXSelectedTextMarkerRange',2,0,60,200],[API.param,'AXUIElementForTextMarker',2,0,300,200]];
const SECURE_REPLY={error:{errorName:'typeUnconfirmed',message:'Secret text is not confirmed.',meta:{startedAt:1,endedAt:2,typeReadback:{confirmed:false,reason:'secure',snapshotMs:2,concealed:true,secure:true}}}};
async function kindRows(_a,head,page,{typed,secure,skip=[]}){
 const a=fresh(); // tags are single-use per capture
 const out=[];
 for(const kind of ['plain','secretShort','secretLong','secure'].filter(k=>!skip.includes(k))){
  const isSecure=kind==='secure',tag=head+'-'+page+'-'+kind+'-r01';
  out.push((await cell(a,{tag,head,page,kind,length:kind==='secretLong'?128:32,secureField:isSecure||undefined,concealed:kind!=='plain',schedule:isSecure?secure:typed,reply:isSecure?SECURE_REPLY:undefined})).row);
 }
 return out;
}
const gate=(a,rows,k)=>a.summarize(rows,{securePermitted:{'fix.small':{names:MARKER_NAMES},'fix.large':{names:MARKER_NAMES}}}).gates['markerRouting:'+k];
test('marker routing: the baseline makes none; the candidate makes exactly one allowed pair before input, on every large-page row, secure included',async()=>{
 const a=fresh();
 const typedPair=[...discovery,...PAIR,[API.event,'keyDown',-1,0,900],...poll(1,true)],securePair=[...discovery,...PAIR],typedNone=rows(1,true),secureNone=[...discovery];
 // Baseline.
 assert.equal(gate(a,await kindRows(a,'main','large',{typed:typedNone,secure:secureNone}),'main.large'),'pass');
 assert.equal(gate(a,await kindRows(a,'main','large',{typed:typedPair,secure:secureNone}),'main.large'),'fail');
 // Candidate, large page: all four kinds carry the pair.
 assert.equal(gate(a,await kindRows(a,'fix','large',{typed:typedPair,secure:securePair}),'fix.large'),'pass');
 // The secure row is required to carry it too, and so is every typed row.
 assert.equal(gate(a,await kindRows(a,'fix','large',{typed:typedPair,secure:secureNone}),'fix.large'),'fail');
 assert.equal(gate(a,await kindRows(a,'fix','large',{typed:typedNone,secure:securePair}),'fix.large'),'fail');
 // A missing kind is not evidence of a pass.
 assert.equal(gate(a,await kindRows(a,'fix','large',{typed:typedPair,secure:securePair,skip:['secure']}),'fix.large'),'unknown');
 // Small page: the pair is allowed, its absence too.
 assert.equal(gate(a,await kindRows(a,'fix','small',{typed:typedNone,secure:secureNone}),'fix.small'),'pass');
 assert.equal(gate(a,await kindRows(a,'fix','small',{typed:typedPair,secure:securePair}),'fix.small'),'pass');
});
test('marker routing: any other, repeated, post-input, other-receiver or other-thread marker operation fails, whatever its answer',async()=>{
 const a=fresh();
 const bad=async typed=>gate(a,await kindRows(a,'fix','large',{typed,secure:[...discovery,...PAIR]}),'fix.large');
 const tail=[[API.event,'keyDown',-1,0,900],...poll(1,true)];
 assert.equal(await bad([...discovery,...PAIR,...PAIR,...tail]),'fail'); // a second pair
 assert.equal(await bad([...discovery,...PAIR,...tail,[API.single,'AXSelectedTextMarkerRange',2,0,7000]]),'fail'); // after input
 assert.equal(await bad([...discovery,...PAIR,...tail,...PAIR]),'fail');
 assert.equal(await bad([...discovery,[API.single,'AXSelectedTextMarkerRange',2,0,60],[API.param,'AXUIElementForTextMarker',1,0,300],...tail]),'fail'); // another receiver
 assert.equal(await bad([...discovery,PAIR[1],PAIR[0],...tail]),'fail'); // lookup before range
 assert.equal(await bad([...discovery,PAIR[0],PAIR[1],[API.param,'AXStringForTextMarkerRange',2,0,400],...tail]),'fail'); // a different marker read
 assert.equal(await bad([...discovery,[API.batch,'AXSelectedTextMarkerRange+AXRole',2,0,60],PAIR[1],...tail]),'fail'); // batched
 assert.equal(await bad([...discovery,[API.single,'AXSelectedTextMarkerRange',2,2,60],PAIR[1],...tail]),'pass'); // an answer neither excuses nor accuses
 // Another thread's marker traffic is counted by name by the recorder and fails here.
 const rest=await kindRows(a,'fix','large',{typed:[...discovery,...PAIR,...tail],secure:[...discovery,...PAIR],skip:['plain']});
 const plainRow=(await cell(a,{tag:'fix-large-plain-r09',head:'fix',page:'large',kind:'plain',length:32,concealed:false,schedule:[...discovery,...PAIR,...tail]})).row;
 assert.equal(gate(a,[plainRow,...rest],'fix.large'),'pass');
 assert.equal(gate(a,[{...plainRow,schedule:{...plainRow.schedule,offThreadCounts:{AXSelectedTextMarkerRange:1}}},...rest],'fix.large'),'fail');
 // An incomplete schedule is unknown.
 assert.equal(gate(a,[{...plainRow,schedule:{...plainRow.schedule,complete:false}},...rest],'fix.large'),'unknown');
});
test('route durations: the marker route and the walk are reported apart with p50 and p95, unadjusted',async()=>{
 const a=fresh();
 const withPhase=(name,ms)=>[[API.phaseBegin,name,-1,0,100,0],[API.phaseEnd,name,-1,0,100,ms*1000]];
 const rowsOf=[];
 for(const [i,ms] of [[1,5],[2,10],[3,20]])rowsOf.push((await cell(a,{tag:'fix-large-plain-r0'+i,head:'fix',page:'large',kind:'plain',length:32,concealed:false,schedule:[...discovery,...withPhase('markedField',ms),...withPhase('walk',ms*2),[API.event,'keyDown',-1,0,9000],...poll(1)]})).row);
 const s=a.summarize(rowsOf),t=s.groups['fix.large.plain'].timing;
 assert.deepEqual([t.markerRouteMs.n,t.markerRouteMs.p50,t.markerRouteMs.p95],[3,10,20]);assert.deepEqual([t.walkMs.p50,t.walkMs.p95],[20,40]);
 assert.equal(s.informational['markerRouting:fix.large'].routeMs.markerRoute.p95,20);
 assert.equal(JSON.stringify(s).includes('ev:'),false); // no keyboard event is named or counted in the output
});
