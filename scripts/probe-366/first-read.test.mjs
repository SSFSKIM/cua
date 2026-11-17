import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {firstPlan,firstJudge,firstSummarize,firstCoverage} from './first-read.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const BROWSERS=['electron-parity','electron','cft'];

const page=(presses=0,open=true)=>({pageId:'a'.repeat(32),timeOrigin:1000,trial:'t1',presses,open,events:[]});
const quiet={dialogClosed:false,frontmostChanged:false,raised:false,windowMoved:false,otherPointer:false,ownerLost:false};
const base={id:'x',phase:'first-press',operation:'press',foreground:false,browser:'electron',temperature:'cold',scene:'modal',variant:'main',age:'immediate',observeFirst:true,rep:0};
const primer=()=>({call:{startedAt:1500,endedAt:1510,raw:{result:{meta:{}}}},before:{primerPresses:0},after:{primerPresses:1}});
// A valid row; warm rows get the prior press count and primer unless the test overrides them.
const row=(extra={})=>{
 const temperature=extra.temperature??base.temperature,warm=temperature==='warm';
 const r={...base,valid:true,appLaunchId:'L'+(extra.id??'x'),preMeasureAXPressCount:warm?1:0,targetObservationCount:(extra.observeFirst??base.observeFirst)?((extra.age??base.age)==='aged'?2:1):0,ageAtPressMs:(extra.age??base.age)==='aged'?10500:900,before:page(),after:page(1),
  call:{startedAt:2000,endedAt:2010,raw:{result:{meta:{}}}},samples:[],trace:[],sideEffects:{...quiet},...extra};
 if(warm&&!('primer' in extra))r.primer=primer();
 return r;
};
const sig=j=>[j.eligible,j.ran,j.exact,j.duplicate,j.falseSuccess];

test('handler count scores delivery: 1 exact, >1 duplicate, 0 with success reply is false success',()=>{
 assert.deepEqual(sig(firstJudge(row())),[true,true,true,false,false]);
 assert.deepEqual(sig(firstJudge(row({after:page(2)}))),[true,true,false,true,false]);
 assert.deepEqual(sig(firstJudge(row({after:page(0)}))),[true,false,false,false,true]);
});
test('a surviving dialog never establishes delivery or confirmation',()=>{
 const j=firstJudge(row({after:page(0,true),samples:[{at:2020,ax:{marker:0,dialog:true}}]}));
 assert.equal(j.falseSuccess,true);assert.equal(j.exact,false);assert.equal(j.ran,false);
 assert.equal(firstJudge(row({after:page(1,true)})).exact,true);
});
test('handler count decides even when the dialog closed; closing is a side effect only',()=>{
 const j=firstJudge(row({after:page(1,false),sideEffects:{...quiet,dialogClosed:true}}));
 assert.deepEqual(sig(j),[true,true,true,false,false]);
 assert.equal(firstJudge(row({after:page(0,false)})).falseSuccess,true);
});
test('an error reply is not a false success, and a handler that ran under an error is reported',()=>{
 const e=firstJudge(row({after:page(0),call:{startedAt:1,endedAt:2,raw:{error:{name:'unconfirmed'}}}}));
 assert.deepEqual([e.answeredOK,e.falseSuccess,e.errorWithHandler],[false,false,false]);
 const w=firstJudge(row({after:page(1),call:{startedAt:1,endedAt:2,raw:{error:{name:'unconfirmed'}}}}));
 assert.deepEqual([w.answeredOK,w.exact,w.errorWithHandler],[false,true,true]);
});
test('cold needs zero prior AXPress; warm needs exactly one, from a marker-checked primer',()=>{
 assert.equal(firstJudge(row({temperature:'cold'})).eligible,true);
 assert.equal(firstJudge(row({temperature:'cold',preMeasureAXPressCount:1})).eligible,false);
 assert.equal(firstJudge(row({temperature:'warm'})).eligible,true);
 assert.equal(firstJudge(row({temperature:'warm',preMeasureAXPressCount:0})).eligible,false);
 assert.equal(firstJudge(row({temperature:'warm',preMeasureAXPressCount:2})).eligible,false);
 const warm=row({temperature:'warm'});
 assert.equal(firstJudge({...warm,primer:undefined}).eligible,false);
 for(const unknown of [undefined,null,'1',-1,1.5])assert.equal(firstJudge({...warm,primer:{...warm.primer,after:{primerPresses:unknown}}}).eligible,false);
 assert.equal(firstJudge({...warm,primer:{...warm.primer,before:{primerPresses:1}}}).eligible,false);
 assert.equal(firstJudge(row({temperature:'cold',primer:warm.primer})).eligible,false);
});
test('a known dropped primer does not disqualify the warm measured press',()=>{
 const warm=row({temperature:'warm'});
 const dropped=row({temperature:'warm',after:page(0),primer:{...warm.primer,after:{primerPresses:0}}});
 const j=firstJudge(dropped);
 assert.deepEqual([j.eligible,j.primerDrop,j.primerFalseSuccess,j.falseSuccess],[true,true,true,true]);
 assert.equal(firstJudge({...warm,primer:{...warm.primer,after:{primerPresses:2}}}).eligible,true);
 const ok=firstJudge(warm);assert.deepEqual([ok.primerDrop,ok.primerFalseSuccess],[false,false]);
 const errPrimer=firstJudge({...dropped,primer:{...dropped.primer,call:{raw:{error:{name:'e'}}}}});
 assert.deepEqual([errPrimer.eligible,errPrimer.primerDrop,errPrimer.primerFalseSuccess],[true,true,false]);
 const s=firstSummarize([warm,dropped])[0];
 assert.deepEqual([s.valid,s.primerDrops,s.primerFalseSuccess],[2,1,1]);
});
test('unknown context or identity is invalid, never a known drop',()=>{
 for(const bad of [
  {valid:false,failureStage:'launch',problem:'no app'},{appLaunchId:undefined},{appLaunchId:''},
  {before:{...page(),presses:1}},{before:undefined},{after:undefined},
  {after:{...page(),presses:undefined}},{after:{...page(1),presses:null}},
  {after:{...page(1),pageId:'b'.repeat(32)}},{after:{...page(1),timeOrigin:5}},{after:{...page(1),trial:'t2'}},
  {sideEffects:{...quiet,ownerLost:true}},{sideEffects:undefined},{call:undefined},
 ]) {
  const j=firstJudge(row(bad));
  assert.equal(j.eligible,false,JSON.stringify(Object.keys(bad)));
  assert.equal(j.falseSuccess,false);assert.equal(j.exact,false);
 }
});
test('observation count is 1 for immediate observed, 2 for aged observed, 0 unobserved; aged presses are at least 10 s old',()=>{
 assert.equal(firstJudge(row({observeFirst:true,targetObservationCount:1})).eligible,true);
 assert.equal(firstJudge(row({observeFirst:true,age:'aged',targetObservationCount:2})).eligible,true);
 assert.equal(firstJudge(row({observeFirst:true,age:'aged',targetObservationCount:1})).eligible,false);
 assert.equal(firstJudge(row({observeFirst:true,age:'immediate',targetObservationCount:2})).eligible,false);
 assert.equal(firstJudge(row({observeFirst:false,age:'aged',targetObservationCount:0})).eligible,true);
 assert.equal(firstJudge(row({observeFirst:false,age:'aged',targetObservationCount:2})).eligible,false);
 assert.equal(firstJudge(row({observeFirst:true,targetObservationCount:0})).eligible,false);
 assert.equal(firstJudge(row({observeFirst:true,targetObservationCount:2})).eligible,false);
 assert.equal(firstJudge(row({observeFirst:false,targetObservationCount:0})).eligible,true);
 assert.equal(firstJudge(row({observeFirst:false,targetObservationCount:1})).eligible,false);
 assert.equal(firstJudge(row({observeFirst:false,targetObservationCount:undefined})).eligible,false);
 assert.equal(firstJudge(row({age:'aged',ageAtPressMs:10000})).eligible,true);
 assert.equal(firstJudge(row({age:'aged',ageAtPressMs:9999})).eligible,false);
 assert.equal(firstJudge(row({age:'aged',ageAtPressMs:undefined})).eligible,false);
 assert.equal(firstJudge(row({age:'immediate',ageAtPressMs:undefined})).eligible,true);
 assert.equal(firstJudge(row({age:'later'})).eligible,false);
 assert.equal(firstJudge(row({observeFirst:'yes'})).eligible,false);
});
const key=c=>[c.temperature,c.scene,c.variant,c.age,c.observeFirst].join('/');
test('plan: 408 full and 40 smoke rows per browser, unique ids containing every factor',()=>{
 const all=[];
 for(const browser of BROWSERS) {
  const full=firstPlan({browser}),smoke=firstPlan({browser,smoke:true});
  assert.equal(full.length,408);assert.equal(smoke.length,40);
  assert.ok(smoke.every(c=>c.rep===0));
  assert.equal(new Set(smoke.map(key)).size,40);assert.equal(new Set(full.map(key)).size,40);
  for(const cells of [full,smoke]) {
   assert.equal(new Set(cells.map(c=>c.id)).size,cells.length);
   for(const c of cells) {
    assert.deepEqual([c.phase,c.operation,c.foreground,c.browser],['first-press','press',false,browser]);
    for(const f of [c.browser,c.temperature,c.scene,c.variant,c.age,c.observeFirst?'observed':'unobserved',String(c.rep)])assert.ok(c.id.split('/').includes(f),c.id+' lacks '+f);
   }
  }
  assert.deepEqual(smoke.map(c=>c.id),full.filter(c=>c.rep===0).map(c=>c.id));
  all.push(...full);
 }
 assert.equal(new Set(all.map(c=>c.id)).size,1224);
 assert.throws(()=>firstPlan({browser:'safari'}));
});
test('plan allocation: critical observed main/bare cells run reps 0..19, exploratory cells are spread',()=>{
 const cells=firstPlan({browser:'electron'});
 const repsOf=f=>{const m=new Map();for(const c of cells.filter(f)){const k=key(c);m.set(k,[...(m.get(k)??[]),c.rep].sort((a,b)=>a-b))}return m};
 const inRange=(m,expected,n)=>{assert.equal(m.size,n);for(const r of m.values())assert.deepEqual(r,expected)};
 const range=Array.from({length:20},(_,i)=>i);
 inRange(repsOf(c=>c.observeFirst&&['main','bare'].includes(c.variant)),range,16);
 inRange(repsOf(c=>c.observeFirst&&c.variant.startsWith('inert')),[0,4,9,14,19],8);
 inRange(repsOf(c=>!c.observeFirst),[0,9,19],16);
 // every temperature x scene appears for every distinct (variant, age, observeFirst)
 const combos=new Set(cells.map(c=>[c.variant,c.age,c.observeFirst].join('/')));
 assert.equal(combos.size,10);
 for(const k of combos)assert.equal(new Set(cells.filter(c=>[c.variant,c.age,c.observeFirst].join('/')===k).map(c=>c.temperature+c.scene)).size,4);
 // the unobserved and aged-observed arms contain only main/bare, aged never has inert
 assert.ok(cells.filter(c=>!c.observeFirst||c.age==='aged').every(c=>['main','bare'].includes(c.variant)));
 assert.deepEqual([...new Set(cells.filter(c=>!c.observeFirst).map(c=>c.age))].sort(),['aged','immediate']);
 // exploratory reps are not all early
 assert.ok(cells.filter(c=>c.variant.startsWith('inert')).some(c=>c.rep===19));
});
test('critical observed main/bare cells run first, interleaved by repetition, then the exploratory cells at their assigned indices',()=>{
 const critical=c=>c.observeFirst&&['main','bare'].includes(c.variant);
 for(const smoke of [false,true]) {
  const cells=firstPlan({browser:'cft',smoke}),n=smoke?16:320,head=cells.slice(0,n),tail=cells.slice(n);
  assert.ok(head.every(critical));assert.ok(tail.every(c=>!critical(c)));
  assert.deepEqual(head.map(c=>c.rep),[...head.map(c=>c.rep)].sort((a,b)=>a-b));
  assert.deepEqual(tail.map(c=>c.rep),[...tail.map(c=>c.rep)].sort((a,b)=>a-b));
  assert.equal(tail.length,smoke?24:88);
  assert.deepEqual([...new Set(head.map(c=>c.age))].sort(),['aged','immediate']);
 }
 const tail=firstPlan({browser:'cft'}).slice(320);
 assert.deepEqual([...new Set(tail.map(c=>c.rep))],[0,4,9,14,19]);
 assert.deepEqual(tail.filter(c=>c.observeFirst).map(c=>c.rep).filter((r,i,a)=>a.indexOf(r)===i),[0,4,9,14,19]);
});
test('plan rotates treatment, trap and temperature order across repetitions',()=>{
 const cells=firstPlan({browser:'electron'});
 const blocks=Array.from({length:20},(_,r)=>cells.filter(c=>c.rep===r));
 assert.deepEqual(blocks.map(b=>b.length),[40,16,16,16,24,16,16,16,16,40,16,16,16,16,24,16,16,16,16,40]);
 assert.equal(blocks.filter(b=>b[0].scene==='modal').length,10);
 assert.equal(blocks.filter(b=>b[0].temperature==='cold').length,10);
 assert.ok(new Set(blocks.map(b=>b[0].variant)).size>=2);
 assert.ok(new Set(blocks.map(b=>b[0].age+b[0].observeFirst)).size>=2);
 assert.ok(new Set(blocks.map(b=>b.map(key).join())).size>=4);
 // main does not always run before bare within the same rep
 const mainFirst=blocks.map(b=>b.findIndex(c=>c.variant==='main')<b.findIndex(c=>c.variant==='bare'));
 assert.ok(mainFirst.includes(true)&&mainFirst.includes(false));
});
test('summary groups by browser/temperature/scene/variant and counts every outcome',()=>{
 const rows=[
  row({id:'1'}),
  row({id:'2',after:page(2)}),
  row({id:'3',after:page(0),call:{startedAt:0,endedAt:30,raw:{result:{}}}}),
  row({id:'4',after:page(1),call:{startedAt:0,endedAt:20,raw:{error:{name:'e'}}},sideEffects:{...quiet,raised:true,dialogClosed:true}}),
  row({id:'5',valid:false,failureStage:'launch',problem:'x'}),
  row({id:'6',temperature:'warm'}),
  row({id:'8',age:'aged'}),row({id:'9',observeFirst:false}),
  // Lost the page after the call: ground truth unknown, but its side effects still count.
  row({id:'7',valid:false,failureStage:'readback',problem:'page lost',after:undefined,sideEffects:{...quiet,raised:true,ownerLost:true}}),
 ];
 const s=firstSummarize(rows);
 assert.equal(s.length,4);
 assert.deepEqual(s.map(x=>[x.temperature,x.age,x.observeFirst].join('/')).sort(),['cold/aged/true','cold/immediate/false','cold/immediate/true','warm/immediate/true']);
 const g=s.find(x=>x.temperature==='cold'&&x.age==='immediate'&&x.observeFirst);
 assert.deepEqual([g.browser,g.scene,g.variant],['electron','modal','main']);
 assert.deepEqual([g.attempted,g.valid,g.invalid],[6,4,2]);
 assert.deepEqual([g.repliesOK,g.errors],[3,1]);
 assert.deepEqual([g.exact,g.ran,g.duplicates,g.falseSuccess],[2,3,1,1]);
 assert.equal(g.errorWithHandler,1);
 assert.deepEqual([g.sideEffects.raised,g.sideEffects.dialogClosed,g.sideEffects.ownerLost],[2,1,1]);
 assert.deepEqual(g.invalidByStage,{launch:1,readback:1});
 assert.deepEqual(g.callMs,{p50:10,p95:30,max:30});
});
test('coverage rejects missing, duplicate, invalid and unplanned rows, and accepts a full plan',()=>{
 const rowsFor=(browser,smoke)=>firstPlan({browser,smoke}).map(c=>row({...c,smoke}));
 const ok=rowsFor('cft',true);
 assert.equal(firstCoverage(ok,{browser:'cft',smoke:true}).ok,true);
 assert.equal(firstCoverage(ok.slice(1),{browser:'cft',smoke:true}).missing.length,1);
 const dup=firstCoverage([...ok,ok[3]],{browser:'cft',smoke:true});
 assert.deepEqual(dup.duplicates,[ok[3].id]);assert.equal(dup.ok,false);
 const bad=[{...ok[0],valid:false,failureStage:'launch',problem:'p'},...ok.slice(1)];
 const rep=firstCoverage(bad,{browser:'cft',smoke:true});
 assert.equal(rep.invalid.length,1);assert.equal(rep.ok,false);
 const extra=firstCoverage([...ok,{...ok[0],id:'zzz',appLaunchId:'Lzzz'}],{browser:'cft',smoke:true});
 assert.deepEqual(extra.unexpected,['zzz']);assert.equal(extra.ok,false);
 assert.equal(firstCoverage(ok,{browser:'cft',smoke:false}).missing.length,368);
 const full=firstCoverage(rowsFor('electron',false),{browser:'electron'});
 assert.deepEqual([full.expected,full.ok],[408,true]);
 const two=firstCoverage([...rowsFor('cft',true),...rowsFor('electron',true)],{smoke:true});
 assert.deepEqual([two.expected,two.ok],[80,true]);
});
test('coverage exposes a reused appLaunchId because every cell needs a fresh launch',()=>{
 const ok=firstPlan({browser:'cft',smoke:true}).map(c=>row(c));
 const reused=ok.map((r,i)=>i===5?{...r,appLaunchId:ok[2].appLaunchId}:r);
 const rep=firstCoverage(reused,{browser:'cft',smoke:true});
 assert.deepEqual(rep.reusedLaunchIds,[{appLaunchId:ok[2].appLaunchId,ids:[ok[2].id,ok[5].id]}]);
 assert.equal(rep.ok,false);
});
test('empty evidence is never complete, with or without an explicit browser',()=>{
 assert.equal(firstCoverage([]).ok,false);
 assert.equal(firstCoverage([],{smoke:true}).ok,false);
 const named=firstCoverage([],{browser:'cft',smoke:true});
 assert.deepEqual([named.ok,named.missing.length],[false,40]);
});
test('CLI plan, summary and coverage modes read directories and rows.jsonl',()=>{
 const dir=mkdtempSync(join(tmpdir(),'first-read-'));
 try {
  const sub=join(dir,'run');mkdirSync(sub);
  const rows=firstPlan({browser:'cft',smoke:true}).map(c=>row({...c,smoke:true}));
  writeFileSync(join(sub,'rows.jsonl'),rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
  const run=(...a)=>spawnSync(process.execPath,[join(here,'first-read.mjs'),...a],{encoding:'utf8'});
  const p=run('plan','cft','smoke');assert.equal(p.status,0);assert.equal(JSON.parse(p.stdout).length,40);
  const s=run('summary',dir);assert.equal(s.status,0);assert.equal(JSON.parse(s.stdout).length,40);
  const c=run('coverage',join(sub,'rows.jsonl'));assert.equal(c.status,0,c.stdout+c.stderr);assert.equal(JSON.parse(c.stdout).ok,true);
  writeFileSync(join(sub,'rows.jsonl'),rows.slice(1).map(r=>JSON.stringify(r)).join('\n')+'\n');
  assert.equal(run('coverage',dir).status,1);
  writeFileSync(join(sub,'rows.jsonl'),'');
  assert.equal(run('coverage',dir).status,1);
  assert.notEqual(run('bogus').status,0);
 } finally {rmSync(dir,{recursive:true,force:true})}
});
