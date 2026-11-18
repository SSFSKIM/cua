// The focused-field walk stops at a node bound (200) or a time bound (40 ms), so on a large page its length follows the clock. The
// summary excuses exactly that and nothing else: one walk that a recorded, corroborated time bound ended where another went on.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuditCapture,AUDIT_KEY,AUDIT354_KEY} from './audit-capture.mjs';
import {API,WALK_CAP,buildSchedule} from './audit-schedule.mjs';
import {walkBoundDivergence} from './audit-summary.mjs';

const SECRET_S='a1b2c3d4e5f60718293a4b5c6d7e8f90',SECRET_L='9f8e7d6c5b4a39281706f5e4d3c2b1a0'.repeat(4);
function engineRecord(id,rows){
 const names=[],ref=n=>{let i=names.indexOf(n);if(i<0){names.push(n);i=names.length-1}return i};
 return {v:1,id,spanNs:8e6,overheadNs:1e5,names,e:rows.map(([api,name,alias=0,outcome=0,at=0,dur=10])=>[api,ref(name),alias,outcome,at,dur]),dropped:0,aliasOverflow:0,aliases:2,offThread:0,offThreadCounts:{},overlaps:0,roles:{},subroles:{}};
}
const discovery=[[API.single,'AXFocusedUIElement',0,1,20],[API.single,'AXFocusedWindow',0,0,30],[API.single,'AXMinimized',1,0,40]];
const iter=at=>[[API.phaseBegin,'fieldClosed',-1,0,at],[API.single,'AXRole',1,0,at+1],[API.single,'AXSubrole',1,0,at+2],[API.phaseEnd,'fieldClosed',-1,0,at+3],[API.single,'AXValue',1,0,at+4]];
const poll=[[API.phaseBegin,'poll',-1,0,5000],...iter(5010),...iter(5100),[API.phaseEnd,'poll',-1,0,5000,400]];
// A walk of `nodes` visited elements (an AXRole then an AXChildren read each), then the bound marker when `cap` names one, in a
// phase of `durUs` microseconds. `deviate` makes one children read an absent value; `more` appends reads still inside the walk.
const walk=(nodes,{cap=null,durUs=5000,deviate=null,more=[]}={})=>[
 [API.phaseBegin,'walk',-1,0,1000,0],
 ...Array.from({length:nodes},(_,i)=>[[API.single,'AXRole',i+2,0,1010+i,5],[API.single,'AXChildren',i+2,i===deviate?1:0,1010+i,5]]).flat(),
 ...more,
 ...(cap?[[API.phaseBegin,cap==='nodes'?'walkCapNodes':'walkCapTime',-1,0,1500,0],[API.phaseEnd,cap==='nodes'?'walkCapNodes':'walkCapTime',-1,0,1500,1]]:[]),
 [API.phaseEnd,'walk',-1,0,1000,durUs]];
const typed=(w,after=[])=>[...discovery,...w,...after,[API.event,'keyDown',-1,0,9000],...poll];
const NODES=typed(walk(200,{cap:'nodes',durUs:38000})),TIME=n=>typed(walk(n,{cap:'time',durUs:40136}));
function fresh(){
 const a=createAuditCapture({mode:'audit'});a.registerSecret(SECRET_S,'secret');a.registerSecret(SECRET_L,'secret');
 const hooks={boundaries:{eventPost:true,eventHid:true},phases:{applied:['walk','poll','fieldClosed'],skipped:[]}};a.setProvenance('main',hooks);a.setProvenance('fix',hooks);return a;
}
async function cell(a,{tag,head='main',page='large',kind,schedule}){
 a.begin(tag,{head,page,kind,length:kind==='secretLong'?128:32});
 a.engineArgs(tag,'type_text',{concealed:kind!=='plain'});
 a.stderr(head,JSON.stringify({[AUDIT_KEY]:engineRecord(tag,schedule)})+'\n'+JSON.stringify({[AUDIT354_KEY]:{id:tag,textReadAttempts:0,rangeReadAttempts:0,byAttribute:{}}})+'\n');
 a.engineReply(tag,'type_text',{error:{errorName:'typeUnconfirmed',message:'not confirmed',meta:{startedAt:1,endedAt:2,typeReadback:{confirmed:false,reason:'noFocusedElement'}}}});
 a.sky(tag,{});
 return a.end(tag,{timeoutMs:200,graceMs:5});
}
// plain, short and long concealed of one head and page, one repetition.
async function kinds({plain,short,long},{head='main',page='large'}={}){
 const a=fresh(),out=[];
 for(const [kind,schedule] of [['plain',plain],['secretShort',short],['secretLong',long]])out.push(await cell(a,{tag:`${head}-${page}-${kind}-r01`,head,page,kind,schedule}));
 const s=a.summarize(out),k=`${head}.${page}`;
 return {a,out,s,pre:s.gates['preInputIdentical:'+k],conceal:s.gates['concealShortLong:'+k],info:s.informational};
}

test('the walk phase reports the bound that ended it, with the reads that corroborate it, and no tokens reach a row',async()=>{
 const t=buildSchedule(engineRecord('t',TIME(173))),n=buildSchedule(engineRecord('n',NODES));
 assert.deepEqual(t.walk.pre.segments.map(g=>[g.reason,g.roles,g.children,g.calls,g.durMs,g.demonstrated]),[['time',173,173,346,40.136,true]]);
 assert.deepEqual(n.walk.pre.segments.map(g=>[g.reason,g.roles,g.calls,g.durMs,g.demonstrated]),[['nodes',200,400,38,true]]);
 assert.equal(t.walk.whole.invalid,false);assert.equal(t.counters.calls,3+346+6); // the bound markers are phases, never calls
 assert.equal(t.strictKey,buildSchedule(engineRecord('t2',typed(walk(173,{durUs:40136})))).strictKey);
 const row=await cell(fresh(),{tag:'main-large-plain-r01',kind:'plain',schedule:TIME(173)});
 assert.equal(row.schedule.walks.invalid,false);assert.deepEqual(row.schedule.walks.segments,[{reason:'time',calls:346,roles:173,children:173,durMs:40.136,demonstrated:true,side:'pre'}]);
 assert.equal(JSON.stringify(row.schedule.walks).includes('AXRole'),false);assert.deepEqual(Object.keys(row.schedule.timeline.phases).includes('walkCapTime'),true);
 // Not demonstrated: a clock bound in a short phase, a node bound short of the bound, a bound with no walk around it, two in one walk.
 const seg=s=>buildSchedule(engineRecord('x',s)).walk.pre;
 assert.equal(seg(typed(walk(173,{cap:'time',durUs:30000})))?.segments[0].demonstrated,false);
 assert.equal(seg(typed(walk(173,{cap:'nodes',durUs:50000}))).segments[0].demonstrated,false);
 assert.equal(seg(typed(walk(200,{cap:'time',durUs:50000}))).segments[0].demonstrated,false);
 assert.equal(seg([...discovery,[API.phaseBegin,'walkCapTime',-1,0,1,0],[API.phaseEnd,'walkCapTime',-1,0,1,1]]).invalid,true);
 assert.equal(seg(typed(walk(3,{cap:'time',more:[[API.phaseBegin,'walkCapNodes',-1,0,1,0],[API.phaseEnd,'walkCapNodes',-1,0,1,1]]}))).invalid,true);
 assert.equal(seg([...discovery,[API.phaseBegin,'walk',-1,0,1,0],[API.single,'AXRole',1,0,2]]).invalid,true);
});
test('a walk the clock ended where another ran to its node bound is equal up to the bound; the first difference and each bound are reported',async()=>{
 // The hosted smoke: plain stopped by the clock at 173 nodes, short and long concealed by the node bound at 200.
 const r=await kinds({plain:TIME(173),short:NODES,long:NODES});
 assert.equal(r.pre,'pass');assert.equal(r.conceal,'pass');
 const w=r.info['preInputIdentical:main.large'];
 assert.equal(w.distinctPreInputs,2);assert.equal(w.walkBound.ok,true);assert.equal(w.walkBound.pairs.length,1);
 const p=w.walkBound.pairs[0];
 assert.equal(p.excused,true);assert.equal(p.walks[0].walk,0);assert.equal(p.walks[0].index,346);
 assert.deepEqual([p.walks[0].a.bound,p.walks[0].a.roles,p.walks[0].a.children,p.walks[0].a.next],['time',173,173,null]);
 assert.deepEqual([p.walks[0].b.bound,p.walks[0].b.roles,p.walks[0].b.children],['nodes',200,200]);assert.match(p.walks[0].b.next,/^r:AXRole@e\d+$/);
 const rows=r.info['walkBounds:main.large'];assert.equal(rows.rows,3);assert.equal(rows.undemonstrated,0);assert.deepEqual(rows.perRow.map(x=>x.walks[0].reason),['time','nodes','nodes']);
 // Short and long concealed that differ only by the bound: equal rep by rep and as sets of shapes.
 const c=await kinds({plain:NODES,short:TIME(173),long:NODES});
 assert.equal(c.pre,'pass');assert.equal(c.conceal,'pass');assert.equal(c.info['concealShortLong:main.large'].walkBoundEqual,1);assert.equal(c.info['concealShortLong:main.large'].shapeEqual,0);
 // Every distinct length is checked against every other; two clock stops and a node stop agree.
 const d=await kinds({plain:TIME(173),short:TIME(181),long:NODES});
 assert.equal(d.pre,'pass');assert.equal(d.info['preInputIdentical:main.large'].walkBound.pairs.length,3);
 // Where nothing differs, nothing is excused.
 const e=await kinds({plain:NODES,short:NODES,long:NODES});
 assert.equal(e.pre,'pass');assert.equal(e.info['preInputIdentical:main.large'].walkBound,undefined);
 // The same holds on any head and page.
 assert.equal((await kinds({plain:TIME(150),short:NODES,long:NODES},{head:'fix',page:'small'})).pre,'pass');
});
test('anything else is not excused: no recorded bound, an uncorroborated one, a difference before the stop or outside the walk, or a longer walk out of bounds',async()=>{
 // [gate, why the first pair that is not excused is not]: the reason is the point, a hash that merely differs would also fail.
 const run=async(plain,more={})=>{const r=await kinds({plain,short:NODES,long:NODES,...more});return [r.pre,r.info['preInputIdentical:main.large'].walkBound?.pairs.find(p=>!p.excused)?.why]};
 assert.deepEqual(await run(typed(walk(173,{durUs:40136}))),['fail','stop-not-a-demonstrated-time-bound']); // it stopped, but no bound is recorded
 assert.deepEqual(await run(typed(walk(173,{cap:'time',durUs:30000}))),['fail','stop-not-a-demonstrated-time-bound']); // a clock bound in a phase shorter than the clock bound
 assert.deepEqual(await run(typed(walk(173,{cap:'nodes',durUs:40136}))),['fail','stop-not-a-demonstrated-time-bound']); // a node bound short of 200 nodes
 assert.deepEqual(await run(typed(walk(173,{cap:'time',durUs:40136,deviate:100}))),['fail','walks-differ-before-the-stop']); // a read that differs before the stop
 assert.deepEqual(await run(typed(walk(173,{cap:'time',durUs:40136}),[[API.single,'AXChildren',1,0,8000]])),['fail','non-walk-reads-differ']); // a read after the walk that the other does not make
 assert.deepEqual(await run([...discovery.slice(0,2),...walk(173,{cap:'time',durUs:40136}),[API.event,'keyDown',-1,0,9000],...poll]),['fail','non-walk-reads-differ']); // a discovery read missing before it
 assert.deepEqual(await run(typed([...walk(173,{cap:'time',durUs:40136}),...walk(1)])),['fail','walk-phases-differ']); // another walk phase
 assert.deepEqual(await run(typed(walk(199,{cap:'nodes'}))),['fail','stop-not-a-demonstrated-time-bound']); // a node bound is the page's, not the clock's
 // The longer walk is held to the bounds too: 201 nodes cannot have been visited.
 const over=typed(walk(201,{durUs:5000}));
 assert.deepEqual(await run(TIME(173),{short:over,long:over}),['fail','longer-walk-not-within-the-bounds']);
 // A bound is no excuse for operands that are not prefixes of one another.
 const bent=typed(walk(200,{cap:'nodes',durUs:38000,deviate:5}));
 assert.deepEqual(await run(TIME(173),{short:bent,long:bent}),['fail','walks-differ-before-the-stop']);
 // The short and long concealed rows may not differ beyond the bound, whatever the plain row did.
 const c=await kinds({plain:NODES,short:TIME(173),long:bent});
 assert.equal(c.conceal,'fail');
});
test('walkBoundDivergence: exact ordered prefix of one walk, every other read equal in order, shorter ended by a demonstrated clock bound',()=>{
 const sched=(s)=>buildSchedule(engineRecord('x',s));
 const a=sched(TIME(173)),b=sched(NODES);
 assert.equal(walkBoundDivergence(a,b,'pre').excused,true);assert.equal(walkBoundDivergence(b,a,'pre').excused,true);assert.equal(walkBoundDivergence(a,b,'whole').excused,true);
 assert.equal(walkBoundDivergence(a,a,'pre').why,'identical-walks');
 assert.equal(walkBoundDivergence(a,null,'pre').why,'no-walk-evidence');
 assert.equal(walkBoundDivergence(a,sched(typed(walk(200,{cap:'nodes',durUs:38000}),[[API.single,'AXRole',1,0,8000]])),'pre').why,'non-walk-reads-differ');
 assert.equal(walkBoundDivergence(a,sched([...discovery,[API.event,'keyDown',-1,0,9000]]),'pre').why,'walk-phases-differ');
 assert.equal(walkBoundDivergence(a,sched(typed(walk(200,{cap:'nodes',durUs:38000,deviate:3}))),'pre').why,'walks-differ-before-the-stop');
 assert.equal(WALK_CAP.nodes,200);assert.equal(WALK_CAP.ms,40);
});
