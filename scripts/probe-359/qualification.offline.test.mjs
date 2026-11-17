import test from 'node:test';
import assert from 'node:assert/strict';
import {qualificationCells,qualificationExpected,qualificationFollow,qualificationSummary} from './qualification-readers.mjs';
import {SEED,REQUESTED} from './page.mjs';

const HEADS={main:'a'.repeat(40),fix:'b'.repeat(40)};
const full=qualificationCells({heads:HEADS}),smoke=qualificationCells({smoke:true,heads:HEADS});
const clone=x=>JSON.parse(JSON.stringify(x));
const caretOf=c=>qualificationExpected(c).caret;

// A row that satisfies every expectation for its cell; tests perturb one fact at a time.
function good(c,over={}){
 const e=qualificationExpected(c),tail=c.cohort==='tail',t=10000;
 const click=c.suite==='control'?{startedAt:t,endedAt:t,noClick:true}:{startedAt:t,endedAt:t+10,error:null,meta:{elementClick:{caret:'placed',plan:'action',action:'AXSelectedTextRange'}}};
 const next={startedAt:t+11,endedAt:t+20,error:null,meta:{}};
 const typeMeta=tail?{entered:0,typeReadback:{confirmed:false,reason:'selectionChanged'}}:{entered:6,typeReadback:{confirmed:true}};
 const type=tail?{startedAt:t+21,endedAt:t+30,error:{errorName:'typeUnconfirmed',meta:typeMeta}}:{startedAt:t+21,endedAt:t+30,error:null,meta:typeMeta};
 const sample=(at)=>({at,text:e.text,selection:e.caret??[0,0]});
 const r={...c,requested:REQUESTED,valid:true,smoke:false,click,next,type,clockUncertaintyMs:2,preClick:{text:SEED},
  samples:[sample(t+30),sample(t+280),sample(t+1530)],events:[],foregroundViolation:false,windowRaiseObserved:false};
 if(c.selection==='set_value_type')r.valueWrite=next;
 if(tail){r.stress={busyStartedAt:t-100,busyUntil:t+900};r.events=[{event:'busy-start',at:t-100},{event:'mousedown',at:t+905},{event:'busy-end',at:t+900}]}
 const out={...r,...over};
 // Unless a test supplies its own, the tail's hold wire is what the watcher would capture from this row's real posts.
 if(tail&&!('ax' in over))out.ax={pointerHold:holdFor(out.type,out.events)};
 return out;
}
// Keyboard.swift's keyPressEvents: flags, down, up, restore per typed unit; NEW359 is 6 units, so 24 posted key events.
const KEYS=(first,last,n=24)=>Array.from({length:n},(_,i)=>({type:[12,10,11,12][i%4],at:first+(n>1?(last-first)*i/(n-1):0),sourcePid:1}));
function hold(keys=[],over={}){
 const captures=[{type:1,at:10005,sourcePid:1},{type:2,at:10006,sourcePid:1},...keys];
 return {delayMs:900,armedAt:9900,captured:captures.length,released:captures.length,pointerCaptured:2,pointerReleased:2,keyCaptured:keys.length,earlyRelease:false,extraEvents:0,copyFailures:0,overflow:false,
  stressExercised:true,captures,extras:[],releaseDueAt:10905,releasedAt:10905,releaseReason:'timer',...over};
}
// The click's down is held from 10005; the release lands in the same millisecond as the row's observed mousedown
// (10905 by default, a 900 ms hold). Rows that move the mousedown to test other boundaries move the release with it, never after it.
const holdFor=(type,events)=>{
 const m=type?.meta??type?.error?.meta,md=(events??[]).find(e=>e.event==='mousedown')?.at,releasedAt=Number.isFinite(md)?md:10905;
 return hold(m?.entered===6&&Number.isFinite(m.startedAt)&&Number.isFinite(m.endedAt)?KEYS(m.startedAt,m.endedAt):[],{releasedAt,releaseDueAt:releasedAt,delayMs:releasedAt-10005});
};
// A tail type_text that really posted all six units: first and last actual post times, well before the release.
const typedOk=(over={})=>({startedAt:10021,endedAt:10030,error:null,meta:{startedAt:10022,endedAt:10028,entered:6,typeReadback:{confirmed:true}},...over});
const rowsFor=cells=>cells.map(c=>good(c));
const find=(cells,pred)=>cells.find(pred);
const group=(s,pred)=>s.groups.find(g=>pred(g));
const fg=find(full,c=>c.cohort==='foreground'&&c.selection==='select_text'&&c.suite==='rate'&&c.head==='main'&&c.browser==='cft');
const tailCell=find(full,c=>c.cohort==='tail'&&c.head==='main'&&c.browser==='cft');
const bg=(editor='input',selection='script')=>find(full,c=>c.cohort==='background'&&c.editor===editor&&c.selection===selection&&c.head==='main'&&c.browser==='cft');
const only=(cell,row)=>qualificationSummary([row],[cell]).groups[0];

test('the plan crosses both heads with foreground textarea routes, a FIFO-held tail and every background editor',()=>{
 const per=(cs,h,b)=>cs.filter(c=>c.head===h&&c.browser===b);
 // foreground: 3 routes x rate/control x 20 ; tail 20 ; background: 4 editors x 2 routes x 10
 assert.equal(full.length,2*3*(120+20+80));
 assert.equal(smoke.length,2*3*(6+1+8));
 assert.equal(new Set(full.map(c=>c.id)).size,full.length);
 for(const h of ['main','fix'])for(const b of ['safari','cft','firefox']){
  const cs=per(full,h,b),f=cs.filter(c=>c.cohort==='foreground'),t=cs.filter(c=>c.cohort==='tail'),k=cs.filter(c=>c.cohort==='background');
  assert.equal(f.length,120);assert.equal(t.length,20);assert.equal(k.length,80);
  assert.ok([...f,...t].every(c=>c.editor==='textarea'&&c.foreground===true&&c.initialCaret==='target'));
  assert.deepEqual([...new Set(f.map(c=>c.selection))].sort(),['cmd+a','select_text','set_value_type']);
  assert.deepEqual([...new Set(f.map(c=>c.suite))].sort(),['control','rate']);
  assert.equal(f.filter(c=>c.suite==='control'&&c.selection==='cmd+a').length,20);
  assert.ok(t.every(c=>c.selection==='select_text'&&c.suite==='rate'&&c.stressQueueMs===900));
  assert.ok(k.every(c=>c.suite==='rate'&&c.foreground===false&&c.initialCaret==='end'&&['script','cmd+a'].includes(c.selection)));
  assert.deepEqual([...new Set(k.map(c=>c.editor))].sort(),['compose','contenteditable','input','textarea']);
  assert.equal(k.filter(c=>c.editor==='compose'&&c.selection==='script').length,10);
 }
 for(const c of full){
  assert.equal(c.qualification,true);assert.equal(c.mode,'natural');assert.equal(c.engineRef,HEADS[c.head]);
  for(const k of ['cohort','head','engineRef','suite','browser','editor','selection','rep'])assert.ok(c[k]!==undefined,k);
  for(const k of [c.cohort,c.head,c.suite,c.browser,c.editor,c.selection,String(c.rep)])assert.ok(c.id.split('/').includes(k),c.id+' lacks '+k);
  if(c.cohort!=='tail')assert.equal(c.stressQueueMs,undefined);
 }
 assert.ok(smoke.every(c=>c.rep===1));
});

test('manifest options are validated and restrict the plan',()=>{
 assert.throws(()=>qualificationCells({heads:{}}));
 assert.throws(()=>qualificationCells({heads:{main:''}}));
 assert.throws(()=>qualificationCells({heads:HEADS,browsers:['edge']}));
 assert.throws(()=>qualificationCells({heads:HEADS,editors:['textarea','canvas']}));
 const noTextarea=qualificationCells({heads:HEADS,editors:['input'],browsers:['cft'],smoke:true});
 assert.ok(noTextarea.every(c=>c.cohort==='background'&&c.editor==='input'));
 assert.equal(noTextarea.length,2*2);
});

test('expectations: set_value_type types onto the written value, tails demand an untouched seed',()=>{
 assert.deepEqual(qualificationExpected(fg),{text:'NEW359',caret:[6,0],requested:'NEW359',safeRefusalRequired:false});
 const sv=find(full,c=>c.selection==='set_value_type');
 assert.equal(qualificationExpected(sv).text,'NEW359NEW359');assert.deepEqual(qualificationExpected(sv).caret,[12,0]);
 const e=qualificationExpected(tailCell);assert.equal(e.text,SEED);assert.equal(e.caret,null);assert.equal(e.safeRefusalRequired,true);
 assert.equal(qualificationExpected(bg()).text,'NEW359');
});

test('qualificationFollow runs exactly the route call, passes lineage through target, and never retries or rewrites the result',async()=>{
 const calls=[],answer={error:{errorName:'valueUnconfirmed'},meta:{x:1}};
 const rpc=async(m,a)=>{calls.push(['rpc',m,a]);return answer},command=async q=>{calls.push(['cmd',q]);return answer};
 const target={element:'e1',lineage:'l1'},run=selection=>qualificationFollow({id:'i',selection},{rpc,command,target});
 assert.equal(await run('script'),answer);assert.deepEqual(calls.pop(),['cmd',{op:'select-all',id:'i'}]);
 assert.equal(await run('cmd+a'),answer);assert.deepEqual(calls.pop(),['rpc','press_key',{key:'cmd+a'}]);
 assert.equal(await run('select_text'),answer);assert.deepEqual(calls.pop(),['rpc','select_text',{element:'e1',lineage:'l1',text:SEED,selection_type:'text'}]);
 assert.equal(await run('set_value_type'),answer);assert.deepEqual(calls.pop(),['rpc','set_value',{element:'e1',lineage:'l1',value:'NEW359'}]);
 assert.equal(calls.length,0);
 await assert.rejects(run('nope'));
 await assert.rejects(qualificationFollow({id:'i',selection:'select_text'},{rpc,command,target:{element:'e1'}}));
 await assert.rejects(qualificationFollow({id:'i',selection:'set_value_type'},{rpc,command}));
 assert.equal(calls.length,0);
});

test('a fully satisfied plan scores clean with every head and arm denominator present',()=>{
 const s=qualificationSummary(rowsFor(full),full);
 assert.equal(s.requested,full.length);assert.equal(s.attempted,full.length);
 assert.deepEqual([s.missing,s.unexpected,s.duplicates,s.mismatched],[[],[],[],[]]);assert.equal(s.complete,true);
 assert.deepEqual(Object.keys(s.arms).sort(),['fix/background','fix/foreground','fix/tail','main/background','main/foreground','main/tail']);
 assert.equal(s.arms['fix/foreground'].requested,360);assert.equal(s.arms['main/tail'].scorable,60);
 for(const g of s.groups){assert.equal(g.requested,g.valid);assert.equal(g.wrongFinal,0);assert.equal(g.wrongPlacement,0);assert.equal(g.typeFalseSuccess,0)}
 assert.equal(s.arms['main/foreground'].finalMet,360);assert.equal(s.arms['main/tail'].safeRefusal,60);
});

test('a head whose arm produced no rows stays in the denominator',()=>{
 const rows=rowsFor(full.filter(c=>c.head==='main'));
 const s=qualificationSummary(rows,full);
 assert.equal(s.complete,false);assert.equal(s.missing.length,full.filter(c=>c.head==='fix').length);
 const g=group(s,g=>g.head==='fix'&&g.cohort==='foreground'&&g.selection==='select_text'&&g.suite==='rate'&&g.browser==='cft');
 assert.deepEqual([g.requested,g.attempted,g.valid],[20,0,0]);
 assert.equal(s.arms['fix/foreground'].attempted,0);assert.equal(s.arms['fix/foreground'].requested,360);
});

test('missing, unexpected, duplicate and lineage-mismatched rows are preserved, never scored silently',()=>{
 const cells=[fg,bg()],stray={...good(fg),id:'qual/stray'};
 const dup=good(fg,{type:{startedAt:1,endedAt:2,error:{errorName:'typeUnconfirmed'}}});
 const wrongHead=good(bg(),{head:'fix',engineRef:HEADS.fix});
 let s=qualificationSummary([good(fg),dup,stray],cells);
 assert.deepEqual(s.missing,[bg().id]);assert.deepEqual(s.unexpected,['qual/stray']);assert.deepEqual(s.duplicates,[fg.id]);
 const g=group(s,g=>g.id===undefined&&g.head==='main'&&g.cohort==='foreground');
 assert.equal(g.valid,1,'the duplicate is not scored twice');assert.equal(g.typeUnconfirmed??0,0);
 s=qualificationSummary([good(fg),wrongHead],cells);
 assert.deepEqual(s.mismatched,[bg().id]);assert.deepEqual(s.missing,[bg().id]);assert.equal(s.complete,false);
 for(const field of ['engineRef','cohort','foreground','initialCaret','qualification','mode','stressQueueMs']){
  const c=field==='stressQueueMs'?tailCell:fg,bad=good(c,{[field]:field==='foreground'?!c.foreground:field==='qualification'?false:'zz'});
  assert.deepEqual(qualificationSummary([bad],[c]).mismatched,[c.id],field);
 }
});

test('smoke and primary evidence cannot mix',()=>{
 assert.throws(()=>qualificationSummary([good(fg,{smoke:true})],[fg]));
 assert.throws(()=>qualificationSummary([good(fg)],[fg],{smoke:true}));
 assert.equal(qualificationSummary([good(fg,{smoke:true})],[fg],{smoke:true}).attempted,1);
});

test('invalid rows count against the denominator but are not scored',()=>{
 const g=only(fg,good(fg,{valid:false,problem:'x'}));
 assert.deepEqual([g.requested,g.attempted,g.valid,g.invalid,g.wrongFinal],[1,1,0,1,0]);
});

test('type outcomes: reasons are read from every meta location and unknown stays explicit',()=>{
 const refuse=meta=>good(fg,{type:{startedAt:1,endedAt:2,error:{errorName:'typeUnconfirmed',...meta}},samples:[{text:SEED,selection:[0,SEED.length]}]});
 let g=only(fg,refuse({meta:{entered:6,typeReadback:{reason:'valueMismatch'}}}));
 assert.deepEqual(g.typeUnconfirmedReasons,{valueMismatch:1});assert.equal(g.wrongFinal,1);assert.equal(g.typeHonestUnconfirmed,1);
 g=only(fg,refuse({data:{meta:{entered:0,typeReadback:{reason:'selectionChanged'}}}}));assert.deepEqual(g.typeUnconfirmedReasons,{selectionChanged:1});
 g=only(fg,good(fg,{type:{startedAt:1,endedAt:2,error:{errorName:'typeUnconfirmed'},meta:{typeReadback:{reason:'valueMismatch'}}},samples:[{text:SEED,selection:[0,0]}]}));
 assert.deepEqual(g.typeUnconfirmedReasons,{valueMismatch:1},'row-level meta as the driver records it');
 g=only(fg,refuse({}));assert.deepEqual(g.typeUnconfirmedReasons,{unknown:1});
 g=only(fg,good(fg,{type:{startedAt:1,endedAt:2,error:{errorName:'weird'}}}));assert.deepEqual(g.typeAnswers,{weird:1});
 g=only(fg,good(fg,{type:{startedAt:1,endedAt:2,error:'boom'}}));assert.deepEqual(g.typeAnswers,{otherError:1});
 g=only(fg,good(fg));assert.deepEqual(g.typeAnswers,{success:1});assert.equal(g.typeSuccess,1);
});

test('false success and a late wrong caret are wrong placements',()=>{
 let g=only(fg,good(fg,{samples:[{text:'NEWOld draft sentence goes here.',selection:[6,0]}]}));
 assert.deepEqual([g.wrongFinal,g.wrongPlacement,g.typeFalseSuccess,g.finalMet,g.placedFinalWrong],[1,1,1,0,1]);
 g=only(fg,good(fg,{samples:[{text:'NEW359',selection:[3,0]}]}));assert.equal(g.wrongFinal,1,'right text with the wrong final caret is not met');
 g=only(fg,good(fg,{samples:[{text:'NEW359',selection:[6,0]},{text:'NEW359',selection:[6,0]},{text:'x',selection:[1,0]}]}));
 assert.equal(g.wrongFinal,1,'the final sample decides');assert.equal(g.finalUnstable,1);
 g=only(fg,good(fg,{type:undefined}));assert.deepEqual([g.typeMissing,g.wrongFinal,g.wrongPlacement],[1,1,1]);
 g=only(fg,good(fg,{samples:[]}));assert.deepEqual([g.noFinalSample,g.wrongFinal],[1,1]);
 g=only(fg,good(fg,{type:{startedAt:1,endedAt:2,error:{errorName:'typeUnconfirmed',meta:{typeReadback:{reason:'valueMismatch'}}}}}));
 assert.deepEqual([g.typeUnconfirmedCorrect,g.wrongFinal],[1,0],'an unconfirmed answer with a correct final is reported, not wrong');
});

test('an honest selectionChanged refusal is a safe no-type, never a successful placement, only when nothing was typed',()=>{
 const refuse=(over={})=>good(fg,{type:{startedAt:20000,endedAt:20010,error:{errorName:'typeUnconfirmed',meta:{entered:0,typeReadback:{reason:'selectionChanged'}}}},samples:[{text:SEED,selection:[5,0]}],...over});
 let g=only(fg,refuse());
 assert.deepEqual([g.safeNoType,g.wrongFinal,g.wrongPlacement,g.finalMet,g.unsafeRefusal],[1,1,0,0,0]);
 g=only(fg,refuse({events:[{event:'input',at:20005}]}));
 assert.deepEqual([g.safeNoType,g.wrongPlacement,g.unsafeRefusal],[0,1,1],'typed input after the refusal call began');
 g=only(fg,refuse({events:[{event:'beforeinput',at:19000}]}));assert.equal(g.safeNoType,1,'input before the type call (set_value) is not typing');
 g=only(fg,refuse({type:{startedAt:20000,endedAt:20010,error:{errorName:'typeUnconfirmed',meta:{entered:3,typeReadback:{reason:'selectionChanged'}}}}}));
 assert.deepEqual([g.safeNoType,g.unsafeRefusal],[0,1]);
 g=only(fg,refuse({type:{startedAt:20000,endedAt:20010,error:{errorName:'typeUnconfirmed',meta:{typeReadback:{reason:'selectionChanged'}}}}}));
 assert.equal(g.safeNoType,0,'entered must be reported as 0');
});

test('set_value_type: set_value is not terminal; the typed continuation and final text decide',()=>{
 const sv=find(full,c=>c.selection==='set_value_type'&&c.suite==='rate'&&c.browser==='cft'&&c.head==='main');
 const unconfirmed={startedAt:1,endedAt:2,error:{errorName:'valueUnconfirmed',meta:{pendingClick:{drift:'caretMoved',waitMs:12}}}};
 let g=only(sv,good(sv));
 assert.deepEqual([g.valueSuccess,g.valueUnconfirmed,g.wrongFinal,g.typeSuccess],[1,0,0,1]);
 g=only(sv,good(sv,{valueWrite:unconfirmed,next:unconfirmed}));
 assert.deepEqual([g.valueUnconfirmed,g.wrongFinal],[1,0],'valueUnconfirmed followed by a correct type is not wrong');
 assert.deepEqual(g.valueUnconfirmedDrift,{caretMoved:1});
 g=only(sv,good(sv,{valueWrite:{startedAt:1,endedAt:2,error:{errorName:'valueUnconfirmed',meta:{pendingClick:{}}}}}));assert.deepEqual(g.valueUnconfirmedDrift,{unknown:1});
 g=only(sv,good(sv,{valueWrite:{startedAt:1,endedAt:2,error:{errorName:'valueUnconfirmed',data:{meta:{pendingClick:{drift:'fieldClosed'}}}}}}));
 assert.deepEqual([g.valueUnconfirmedDrift,g.valueFieldClosed],[{fieldClosed:1},1]);
 g=only(sv,good(sv,{valueWrite:{startedAt:1,endedAt:2,error:{errorName:'valueUnconfirmed',meta:{typeReadback:{reason:'fieldClosed'}}}}}));assert.equal(g.valueUnconfirmedDrift.unknown,1);
 g=only(sv,good(sv,{valueWrite:{startedAt:1,endedAt:2,error:{errorName:'valueUnconfirmed',meta:{}},meta:{pendingClick:{drift:'x'}}}}));assert.deepEqual(g.valueUnconfirmedDrift,{x:1},'row-level meta');
 g=only(sv,good(sv,{valueWrite:{startedAt:1,endedAt:2,error:{errorName:'otherThing'}}}));assert.deepEqual(g.valueAnswers,{otherThing:1});
 // a single NEW359 means the typed continuation never ran onto the written value
 g=only(sv,good(sv,{samples:[{text:'NEW359',selection:[6,0]}]}));assert.deepEqual([g.wrongFinal,g.typeFalseSuccess],[1,1]);
 // set_value success with no type call at all is a missing continuation, not a pass
 g=only(sv,good(sv,{type:undefined,samples:[{text:'NEW359',selection:[6,0]}]}));assert.deepEqual([g.typeMissing,g.wrongFinal],[1,1]);
});

test('tail qualification depends only on observed mousedown timing and stress start, never on the outcome',()=>{
 const t0=10000,ev=at=>[{event:'busy-start',at:9900},{event:'mousedown',at},{event:'busy-end',at:10900}];
 const mk=over=>good(tailCell,over);
 let g=only(tailCell,mk({}));assert.deepEqual([g.tailQualified,g.tailScorable,g.tailUnqualified],[1,1,0]);
 // click returned at t0+10; mousedown must exceed return + 300 + clockUncertainty(2) strictly
 g=only(tailCell,mk({events:ev(t0+10+302)}));assert.equal(g.tailQualified,0,'exactly at the bound is not later than it');
 g=only(tailCell,mk({events:ev(t0+10+303)}));assert.equal(g.tailQualified,1);
 g=only(tailCell,mk({clockUncertaintyMs:50,events:ev(t0+10+340)}));assert.deepEqual([g.tailQualified,g.tailUnqualified],[0,1]);
 assert.deepEqual(g.tailUnqualifiedReasons,{mousedownNotLate:1});
 g=only(tailCell,mk({events:[{event:'busy-start',at:9900}]}));assert.deepEqual(g.tailUnqualifiedReasons,{noMousedown:1});
 g=only(tailCell,mk({stress:undefined,events:[{event:'mousedown',at:t0+500}]}));assert.deepEqual(g.tailUnqualifiedReasons,{stressNotBeforeClick:1});
 g=only(tailCell,mk({stress:{busyStartedAt:t0+5},events:[{event:'mousedown',at:t0+500}]}));assert.deepEqual(g.tailUnqualifiedReasons,{stressNotBeforeClick:1});
 g=only(tailCell,mk({stress:undefined,events:[{event:'busy-start',at:9900},{event:'mousedown',at:t0+500}]}));assert.equal(g.tailQualified,1,'busy-start event is an equivalent stress record');
 // a stress command answer alone does not qualify
 g=only(tailCell,mk({stress:{ok:true},events:[{event:'mousedown',at:t0+500}]}));assert.equal(g.tailQualified,0);
 // outcome independence: an unsafe ok row with a late mousedown still qualifies
 g=only(tailCell,mk({type:typedOk(),samples:[{text:'NEW359',selection:[6,0]}]}));
 assert.deepEqual([g.tailQualified,g.tailOk],[1,1]);
});

test('unqualified tails are preserved with a count and excluded from every tail safety metric',()=>{
 const early=good(tailCell,{events:[{event:'busy-start',at:9900},{event:'mousedown',at:10015}],type:{startedAt:10021,endedAt:10030,error:null,meta:{entered:6,typeReadback:{confirmed:true}}},samples:[{text:'NEW359',selection:[6,0]}]});
 const g=only(tailCell,early);
 assert.deepEqual([g.valid,g.tailUnqualified,g.tailScorable,g.tailOk,g.tailUnsafeOk,g.safeRefusal,g.wrongFinal],[1,1,0,0,0,0,0]);
 assert.equal(g.requested,1);
 const s=qualificationSummary([early],[tailCell]);assert.equal(s.arms['main/tail'].tailUnqualified,1);assert.equal(s.arms['main/tail'].scorable,0);
});

test('tail safe refusal needs typeUnconfirmed/selectionChanged, entered 0, no input events and the seed untouched',()=>{
 let g=only(tailCell,good(tailCell));
 assert.deepEqual([g.safeRefusal,g.selectionChanged,g.nothingTypedSeedUnchanged,g.typedEvents,g.tailOk,g.wrongPlacement,g.wrongFinal],[1,1,1,0,0,0,0]);
 assert.equal(g.finalMet,0,'a refusal is not a successful placement');
 g=only(tailCell,good(tailCell,{events:[...good(tailCell).events,{event:'beforeinput',at:11000}]}));
 assert.deepEqual([g.typedEvents,g.safeRefusal,g.nothingTypedSeedUnchanged,g.wrongPlacement],[1,0,0,1]);
 g=only(tailCell,good(tailCell,{events:[...good(tailCell).events,{event:'input',at:11000}]}));assert.equal(g.typedEvents,1);
 g=only(tailCell,good(tailCell,{samples:[{text:SEED+'x',selection:[0,0]}]}));
 assert.deepEqual([g.nothingTypedSeedUnchanged,g.safeRefusal,g.wrongFinal],[0,0,1]);
 // tail ok is unsafe even when the text is superficially the requested text
 g=only(tailCell,good(tailCell,{type:typedOk(),samples:[{text:'NEW359',selection:[6,0]}]}));
 assert.deepEqual([g.tailOk,g.tailUnsafeOk,g.tailOkTextMatchesRequested,g.safeRefusal,g.wrongPlacement,g.wrongFinal],[1,1,1,0,1,1]);
 // an ok that left the seed untouched and typed nothing is still an unsafe false success
 g=only(tailCell,good(tailCell,{type:{startedAt:10021,endedAt:10030,error:null,meta:{entered:0,typeReadback:{confirmed:true}}}}));assert.deepEqual([g.tailOk,g.tailUnsafeOk],[1,1]);
 // other reasons are not safe
 g=only(tailCell,good(tailCell,{type:{startedAt:10021,endedAt:10030,error:{errorName:'typeUnconfirmed',meta:{entered:0,typeReadback:{reason:'valueMismatch'}}}}}));
 assert.deepEqual([g.selectionChanged,g.safeRefusal,g.wrongPlacement],[0,0,1]);
 g=only(tailCell,good(tailCell,{type:{startedAt:10021,endedAt:10030,error:{errorName:'typeUnconfirmed',meta:{entered:2,typeReadback:{reason:'selectionChanged'}}}}}));
 assert.deepEqual([g.tailUnqualifiedReasons,g.tailUnqualifiedTypeUnconfirmedReasons,g.safeRefusal],[{producerUnaccounted:1},{selectionChanged:1},0],'a partial producer is unqualified, never safe');
});

test('background AX-route rows must not wait anywhere, in any RPC metadata',()=>{
 const b=bg();
 let g=only(b,good(b));assert.equal(g.backgroundWaitViolations,0);
 const pend=ms=>({startedAt:1,endedAt:2,error:null,meta:{pendingClick:{waitMs:ms}}});
 for(const rpcName of ['click','next','type']){
  const base=good(b);
  g=only(b,good(b,{[rpcName]:{...base[rpcName],meta:{...base[rpcName].meta,pendingClick:{waitMs:5}}}}));assert.deepEqual([g.backgroundWaitViolations,g.backgroundWaitPositive],[1,1],rpcName);
  g=only(b,good(b,{[rpcName]:{...base[rpcName],meta:{...base[rpcName].meta,pendingClick:{waitMs:0}}}}));assert.deepEqual([g.backgroundWaitViolations,g.backgroundWaitPositive],[1,0],rpcName+' zero wait still appeared');
  g=only(b,good(b,{[rpcName]:{...base[rpcName],meta:{...base[rpcName].meta,pendingClick:{watchMs:3}}}}));assert.deepEqual([g.backgroundWaitViolations,g.backgroundWaitPositive],[1,0],rpcName+' watch-only record');
 }
 g=only(b,good(b,{type:{startedAt:1,endedAt:2,error:null,meta:{entered:6,typeReadback:{confirmed:true,baselineWait:{waitMs:40}}}}}));assert.equal(g.backgroundWaitViolations,1);
 g=only(b,good(b,{type:{startedAt:1,endedAt:2,error:{errorName:'typeUnconfirmed',meta:{typeReadback:{reason:'valueMismatch',baselineWait:{waitMs:40}}}}}}));assert.equal(g.backgroundWaitViolations,1,'error-side metadata counts too');
 const sv=find(full,c=>c.cohort==='background'&&c.selection==='script');
 g=only(sv,good(sv,{valueWrite:pend(9),next:undefined}));assert.equal(g.backgroundWaitViolations,1,'valueWrite is the fallback when next is absent');
 g=only(b,good(b,{type:{startedAt:1,endedAt:2,error:null,meta:{entered:6,typeReadback:{confirmed:true,baselineWait:{}}}}}));assert.equal(g.backgroundWaitViolations,1,'an empty baselineWait record still appeared');
 // foreground waits are expected behaviour and never violations
 g=only(fg,good(fg,{next:pend(30)}));assert.equal(g.backgroundWaitViolations,0);
});

test('foreground and window constraints are counted per group',()=>{
 let g=only(fg,good(fg,{foregroundViolation:true}));assert.equal(g.foregroundViolations,1);
 g=only(bg(),good(bg(),{windowRaiseObserved:true,foregroundViolation:true}));assert.deepEqual([g.windowRaisesObserved,g.foregroundViolations],[1,1]);
});

test('wait and end-to-end summaries report n/p50/p95/max and never invent zeros for missing metadata',()=>{
 const none=only(fg,good(fg));
 assert.deepEqual(none.pendingClickWaitMs,{n:0,p50:null,p95:null,max:null});assert.deepEqual(none.baselineWaitMs,{n:0,p50:null,p95:null,max:null});
 const rows=[10,20,30,40].map((ms,i)=>good(fg,{id:'x'+i,next:{startedAt:1,endedAt:1+ms+5,error:null,meta:{pendingClick:{waitMs:ms}}},
  type:{startedAt:1,endedAt:1+ms,error:null,meta:{entered:6,typeReadback:{confirmed:true,baselineWait:{waitMs:ms*2}}}}}));
 const cells=rows.map(r=>({...fg,id:r.id})),s=qualificationSummary(rows,cells).groups[0];
 assert.deepEqual(s.pendingClickWaitMs,{n:4,p50:20,p95:40,max:40});assert.deepEqual(s.baselineWaitMs,{n:4,p50:40,p95:80,max:80});
 assert.equal(s.totalWaitMs.max,120);assert.equal(s.totalWaitMs.n,4);
 assert.deepEqual(s.nextMs,{n:4,p50:25,p95:45,max:45});assert.equal(s.typeMs.max,40);assert.equal(s.clickMs.n,4);
 const withNull=only(fg,good(fg,{next:{startedAt:1,endedAt:2,error:null,meta:{pendingClick:{waitMs:null}}}}));assert.equal(withNull.pendingClickWaitMs.n,0);
 const noClick=only(find(full,c=>c.suite==='control'&&c.cohort==='foreground'),good(find(full,c=>c.suite==='control'&&c.cohort==='foreground')));
 assert.equal(noClick.clickMs.n,0,'a no-click control has no click latency');
});

test('entered is the top-level meta field of the real wire, not a typeReadback member',()=>{
 const refuse=meta=>good(fg,{type:{startedAt:20000,endedAt:20010,error:{errorName:'typeUnconfirmed',meta}},samples:[{text:SEED,selection:[5,0]}]});
 assert.equal(only(fg,refuse({entered:0,typeReadback:{reason:'selectionChanged'}})).safeNoType,1);
 assert.equal(only(fg,refuse({typeReadback:{reason:'selectionChanged',entered:0}})).safeNoType,0,'a nested entered is not the wire shape');
 assert.equal(only(fg,refuse({entered:'0',typeReadback:{reason:'selectionChanged'}})).safeNoType,0);
 const g=only(tailCell,good(tailCell,{type:{startedAt:10021,endedAt:10030,error:{errorName:'typeUnconfirmed',meta:{typeReadback:{reason:'selectionChanged',entered:0}}}}}));
 assert.deepEqual([g.tailUnqualifiedReasons,g.safeRefusal],[{producerUnaccounted:1},0],'without the wire entered the producer is unaccounted');
});

test('after a JSON round trip next and valueWrite are one logical RPC, not two',()=>{
 const sv=find(full,c=>c.selection==='set_value_type'&&c.suite==='rate'&&c.browser==='cft'&&c.head==='main');
 const next={startedAt:1,endedAt:51,error:null,meta:{pendingClick:{waitMs:30,watchMs:5}}};
 const r=clone(good(sv,{next,valueWrite:next,type:{startedAt:60,endedAt:90,error:null,meta:{entered:6,typeReadback:{confirmed:true,baselineWait:{waitMs:7}}}}}));
 assert.notEqual(r.next,r.valueWrite);
 const g=only(sv,r);
 assert.deepEqual(g.pendingClickWaitMs,{n:1,p50:30,p95:30,max:30});assert.deepEqual(g.baselineWaitMs,{n:1,p50:7,p95:7,max:7});
 assert.equal(g.totalWaitMs.max,37);assert.equal(g.nextMs.n,1);assert.equal(g.valueSuccess,1);
 const noNext=clone(good(sv,{next:undefined,valueWrite:next}));
 assert.deepEqual(only(sv,noNext).pendingClickWaitMs,{n:1,p50:30,p95:30,max:30},'valueWrite counts when next is absent');
 const bgSv=bg('input','script'),bn={startedAt:1,endedAt:2,error:null,meta:{pendingClick:{waitMs:0}}};
 assert.equal(only(bgSv,clone(good(bgSv,{next:bn,valueWrite:bn}))).backgroundWaitViolations,1,'one row, counted once');
});

// ---- review wave: tail exposure must be proved by the answer boundary, not by the late mousedown alone ----
test('a tail qualifies only when select_text and type_text both completed before the delayed mousedown',()=>{
 const t0=10000,u=2,md=at=>[{event:'busy-start',at:9900},{event:'mousedown',at},{event:'busy-end',at:10900}];
 const sel=(s,e,error=null)=>({startedAt:s,endedAt:e,error,meta:{}});
 const typ=(s,e,error=null)=>({startedAt:s,endedAt:e,error,meta:{entered:0,typeReadback:{reason:'selectionChanged'}}});
 const mk=over=>good(tailCell,{events:md(10500),...over});
 let g=only(tailCell,mk({}));assert.equal(g.tailQualified,1);
 // the pointer landed before the AX selection was written: stress that was recovered from, not a protection test
 g=only(tailCell,mk({next:sel(10600,10610),type:typ(10620,10640)}));
 assert.deepEqual([g.tailQualified,g.tailUnqualifiedReasons],[0,{mousedownBeforeSelection:1}]);
 // select_text returned in time but the type call was still running when the pointer landed
 g=only(tailCell,mk({type:typ(10490,10520)}));assert.deepEqual(g.tailUnqualifiedReasons,{mousedownBeforeTypeReturn:1});
 g=only(tailCell,mk({type:typ(10600,10620)}));assert.deepEqual(g.tailUnqualifiedReasons,{mousedownBeforeTypeReturn:1},'type attempted only after the mousedown');
 // boundary: strictly earlier by the clock uncertainty
 g=only(tailCell,mk({type:typ(10390,10497),events:md(10500)}));assert.equal(g.tailQualified,1);
 g=only(tailCell,mk({type:typ(10390,10498),events:md(10500)}));assert.deepEqual(g.tailUnqualifiedReasons,{mousedownBeforeTypeReturn:1},'type end + uncertainty equals the mousedown');
 g=only(tailCell,mk({next:sel(10300,10498)}));assert.deepEqual(g.tailUnqualifiedReasons,{mousedownBeforeSelection:1});
 g=only(tailCell,mk({next:sel(10300,10497),type:typ(10498,10499)}));assert.equal(g.tailQualified,0,'type end inside the uncertainty margin');
 g=only(tailCell,mk({clockUncertaintyMs:50,type:typ(10390,10449)}));assert.equal(g.tailQualified,1);
 g=only(tailCell,mk({clockUncertaintyMs:50,type:typ(10390,10450)}));assert.equal(g.tailQualified,0);
 // the select_text must have succeeded and type_text must have been attempted
 g=only(tailCell,mk({next:sel(10011,10020,{errorName:'elementStale'})}));assert.deepEqual(g.tailUnqualifiedReasons,{selectionNotSuccessful:1});
 g=only(tailCell,mk({next:undefined}));assert.deepEqual(g.tailUnqualifiedReasons,{selectionNotSuccessful:1});
 g=only(tailCell,mk({type:undefined}));assert.deepEqual(g.tailUnqualifiedReasons,{typeNotAttempted:1});
 g=only(tailCell,mk({type:{error:null}}));assert.deepEqual(g.tailUnqualifiedReasons,{typeNotAttempted:1},'a type record without a call interval');
 // qualification ignores the answer and the wait metadata: ok or unconfirmed, any reason
 g=only(tailCell,mk({type:typedOk(),samples:[{text:'NEW359',selection:[6,0]}]}));
 assert.deepEqual([g.tailQualified,g.tailOk,g.tailUnsafeOk],[1,1,1]);
 g=only(tailCell,mk({type:{startedAt:10021,endedAt:10030,error:{errorName:'typeUnconfirmed',meta:{entered:0,typeReadback:{reason:'valueMismatch'}}}}}));assert.equal(g.tailQualified,1);
});

test('a recovered, correct late-pointer replacement is unqualified stress, never an unsafe ok, and its answers stay countable',()=>{
 const recovered=good(tailCell,{events:[{event:'busy-start',at:9900},{event:'mousedown',at:10500}],next:{startedAt:10600,endedAt:10610,error:null,meta:{}},
  type:{startedAt:10620,endedAt:10640,error:null,meta:{entered:6,typeReadback:{confirmed:true}}},samples:[{text:'NEW359',selection:[6,0]}]});
 const g=only(tailCell,recovered);
 assert.deepEqual([g.tailUnqualified,g.tailOk,g.tailUnsafeOk,g.wrongFinal,g.wrongPlacement,g.safeRefusal,g.scorable],[1,0,0,0,0,0,0]);
 assert.deepEqual(g.tailUnqualifiedTypeAnswers,{success:1});assert.deepEqual(g.typeAnswers,{});
 const refused=good(tailCell,{events:[{event:'busy-start',at:9900},{event:'mousedown',at:10500}],next:{startedAt:10600,endedAt:10610,error:null,meta:{}},
  type:{startedAt:10620,endedAt:10640,error:{errorName:'typeUnconfirmed',meta:{entered:0,typeReadback:{reason:'selectionChanged'}}}}});
 const g2=only(tailCell,refused);assert.deepEqual([g2.tailUnqualifiedTypeAnswers,g2.tailUnqualifiedTypeUnconfirmedReasons,g2.safeRefusal],[{typeUnconfirmed:1},{selectionChanged:1},0]);
});

test('zero qualified tail coverage never reads as passing',()=>{
 const ok=qualificationSummary(rowsFor(full),full);
 assert.equal(ok.exercisedAllTails,true);assert.deepEqual(ok.tailUnexercised,[]);
 const noExposure=rowsFor(full).map(r=>r.cohort==='tail'?{...r,events:[{event:'busy-start',at:9900}]}:r);
 const s=qualificationSummary(noExposure,full);
 assert.equal(s.exercisedAllTails,false);assert.equal(s.tailUnexercised.length,6);assert.ok(s.tailUnexercised.every(k=>k.includes('/tail/')));
 assert.equal(s.arms['main/tail'].tailUnqualified,60);assert.equal(s.arms['main/tail'].safeRefusal,0);
 // one head's tails exposed, the other's not: still not exercised for that head
 const half=rowsFor(full).map(r=>r.cohort==='tail'&&r.head==='fix'?{...r,events:[]}:r);
 assert.equal(qualificationSummary(half,full).tailUnexercised.every(k=>k.startsWith('fix/')),true);
});

// ---- dispatch-wide plan reconstruction ----
import {qualificationPlan} from './qualification-readers.mjs';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const request=(over={})=>({tailStimulus:'queue-hold-v1',smoke:true,heads:{...HEADS},browsers:['safari','cft','firefox'],editors:['textarea','input','contenteditable','compose'],...over});
const config=(over={},req=request())=>({qualification:true,qualificationRequest:req,planned:[],...over});

test('qualificationPlan rebuilds the whole requested plan from any surviving request',()=>{
 assert.deepEqual(qualificationPlan([config()]).map(c=>c.id),smoke.map(c=>c.id));
 assert.equal(qualificationPlan([config(),config()]).length,90);
 assert.equal(qualificationPlan([config({planned:[{id:'only-this'}]})],).length,90,'surviving shard manifests do not bound the plan');
 assert.equal(qualificationPlan([config({},request({smoke:false}))]).length,1320);
 assert.equal(qualificationPlan([config({},request({browsers:['cft'],editors:['textarea']}))]).length,2*(6+1+2));
});

test('qualificationPlan rejects absent, inconsistent or malformed requests',()=>{
 const bad=x=>assert.throws(()=>qualificationPlan(x));
 bad([]);bad([{qualification:true}]);bad([config(),{qualification:true}]);
 bad([config({},request({tailStimulus:undefined}))]);bad([config({},request({tailStimulus:'busy'}))]);
 bad([config(),config({},request({smoke:false}))]);
 bad([config(),config({},request({browsers:['cft']}))]);
 bad([config(),config({},request({editors:['textarea']}))]);
 bad([config(),config({},request({heads:{main:HEADS.main,fix:'c'.repeat(40)}}))]);
 bad([config({},request({heads:{main:HEADS.main}}))]);
 bad([config({},request({heads:{main:HEADS.main,fix:HEADS.fix,extra:'c'.repeat(40)}}))]);
 bad([config({},request({heads:{main:HEADS.main,fix:'short'}}))]);
 bad([config({},request({heads:{main:HEADS.main,fix:HEADS.main}}))]);
 bad([config({},request({smoke:'yes'}))]);
 bad([config({},request({browsers:[]}))]);bad([config({},request({browsers:['cft','cft']}))]);bad([config({},request({browsers:['edge']}))]);
 bad([config({},request({editors:['canvas']}))]);
});

const READERS=new URL('./readers.mjs',import.meta.url).pathname;
function scratch(){return mkdtempSync(join(tmpdir(),'q359-'))}
function shard(root,name,cfg,rows){const d=join(root,name);mkdirSync(d,{recursive:true});if(cfg)writeFileSync(join(d,'config.json'),JSON.stringify(cfg));writeFileSync(join(d,'rows.jsonl'),rows.map(r=>JSON.stringify(r)).join('\n')+(rows.length?'\n':''))}
const cli=(...a)=>spawnSync(process.execPath,[READERS,...a],{encoding:'utf8'});

test('the qualification CLI scores the dispatch against the full plan even when one shard survived',()=>{
 const root=scratch(),out=join(root,'out'),survivor=smoke.find(c=>c.head==='main'&&c.browser==='safari'&&c.cohort==='background');
 shard(join(root,'in'),'main-safari-textarea',config(),[good(survivor,{smoke:true})]);
 const r=cli('summarize',join(root,'in'),out,'--qualification');assert.equal(r.status,0,r.stderr);
 const s=JSON.parse(readFileSync(join(out,'summary.json'),'utf8'));
 assert.equal(s.requested,90);assert.equal(s.attempted,1);assert.equal(s.missing.length,89);assert.equal(s.complete,false);assert.equal(s.smoke,true);
 assert.ok(s.groups.some(g=>g.head==='fix'&&g.browser==='firefox'&&g.requested>0&&g.attempted===0),'absent fix/firefox stays in the denominator');
 assert.equal(s.arms['fix/tail'].requested,3);assert.equal(s.exercisedAllTails,false);
});

test('the qualification CLI rejects absent or inconsistent requests and mismatched smoke flags',()=>{
 const root=scratch(),run=(inputs,...extra)=>{const dir=join(root,String(Math.random()));for(const [n,c,rows] of inputs)shard(dir,n,c,rows);return cli('summarize',dir,join(dir,'out'),'--qualification',...extra)};
 assert.notEqual(run([['a',null,[]]]).status,0);
 assert.notEqual(run([['a',{qualification:true},[]]]).status,0);
 assert.notEqual(run([['a',config(),[]],['b',config({},request({smoke:false})),[]]]).status,0);
 assert.notEqual(run([['a',config(),[]]],'--diagnostic').status,0);
 assert.notEqual(run([['a',config({},request({smoke:false})),[]]],'--smoke').status,0,'an explicit --smoke that contradicts the request');
 assert.equal(run([['a',config(),[]]],'--smoke').status,0);
 assert.equal(run([['a',config(),[]]]).status,0,'smoke is derived from the request');
});

test('the legacy reader and legacy CLI never ingest qualification rows',()=>{
 assert.throws(()=>legacySummary([good(fg)],[]),/qualification/);
 const root=scratch(),out=join(root,'out');
 shard(join(root,'in'),'a',{qualification:true,qualificationRequest:request()},[good(fg,{smoke:false})]);
 const r=cli('summarize',join(root,'in'),out);assert.notEqual(r.status,0);assert.match(r.stderr,/qualification/);
 const t=cli('summarize',join(root,'in'),out,'--smoke');assert.notEqual(t.status,0);
 // and a legacy row in a qualification summary is an unexpected id, not a scored one
 const s=qualificationSummary([{id:'rate/cft/textarea/script/natural/1',valid:true}],smoke);assert.deepEqual(s.unexpected,['rate/cft/textarea/script/natural/1']);
});
import {summary as legacySummary} from './readers.mjs';

// Pointer and later keys must share the same delayed FIFO; AX remains runnable.
test('queue-held tail proves complete once-only FIFO release and an early baseline from actual first-post time',()=>{
 const r=good(tailCell,{stress:{startedAt:9900},ax:{pointerHold:hold(KEYS(10050,10300),{releasedAt:10895})},
  type:{startedAt:10021,endedAt:11500,error:{errorName:'typeUnconfirmed'},meta:{startedAt:10050,endedAt:10300,entered:6,typeReadback:{reason:'valueMismatch'}}},
  events:[{event:'mousedown',at:10900},{event:'mouseup',at:10901},{event:'keydown',at:10902},{event:'beforeinput',at:10903},{event:'input',at:10904}],samples:[{text:'OldNEW359 draft sentence goes here.',selection:[9,0],at:13000}]});
 let g=only(tailCell,r);assert.equal(g.tailQualified,1);assert.deepEqual(g.typeUnconfirmedReasons,{valueMismatch:1});assert.equal(g.tailReadbackDecline,1);assert.equal(g.safeRefusal,0,'declined after typing differs from nothing typed');
 const h=r.ax.pointerHold;
 for(const bad of [{...h,released:13},{...h,pointerCaptured:1},{...h,earlyRelease:true},{...h,extraEvents:1}]){
  g=only(tailCell,{...r,ax:{pointerHold:bad}});assert.equal(g.tailQualified,0);assert.deepEqual(g.tailUnqualifiedReasons,{holdNotComplete:1});
 }
 g=only(tailCell,{...r,events:[{event:'keydown',at:10800},...r.events]});assert.deepEqual(g.tailUnqualifiedReasons,{postedInputOvertookPointer:1});
 const late={...r.type,meta:{...r.type.meta,startedAt:10950}};
 g=only(tailCell,{...r,type:late});assert.equal(g.tailQualified,0,'a first key post after the click does not prove an exposed baseline');
 const ok={...r.type,error:null};g=only(tailCell,{...r,type:ok});assert.equal(g.tailUnsafeOk,1,'qualification never depends on whether the read-back declined');
});

test('background posted-route waits are a cost; only AX-route waits violate the no-arm criterion',()=>{
 const b=bg(),base=good(b),type={...base.type,meta:{...base.type.meta,typeReadback:{confirmed:true,baselineWait:{waitMs:75}}}};
 const post={...base.click,meta:{inputRoute:3,startedAt:10001,coordinateClick:{},activationClick:'posted'}};
 let g=only(b,{...base,click:post,type});assert.equal(g.backgroundWaitViolations,0);assert.equal(g.backgroundPosted,1);assert.equal(g.backgroundWaitObserved,1);
 const ax={...post,meta:{...post.meta,elementClick:{plan:'action',action:'AXSelectedTextRange',caret:'placed'},inputRoute:1}};
 g=only(b,{...base,click:ax,type});assert.equal(g.backgroundWaitViolations,1);assert.equal(g.backgroundAX,1);
 g=only(b,{...base,click:{...base.click,meta:{}},type});assert.equal(g.backgroundWaitUnclassified,1,'an unknown carrier does not become a clean AX-route pass');
});

// ---- review wave: the held FIFO only qualifies a producer that had finished posting before the hand-back ----
// Closing the tap before replay lets a still-running producer's newer keys overtake buffered ones, so the raw
// stressExercised flag alone is not FIFO proof: the whole measured keyboard stream must already be in the buffer.
test('a typed tail qualifies only with all 24 key posts captured and finished before the release',()=>{
 const typed=(meta={},holdOver={},keys)=>{const m={startedAt:10022,endedAt:10028,entered:6,typeReadback:{reason:'valueMismatch'},...meta};
  return good(tailCell,{type:{startedAt:10021,endedAt:11500,error:{errorName:'typeUnconfirmed'},meta:m},ax:{pointerHold:hold(keys??KEYS(m.startedAt??10022,m.endedAt??10028),holdOver)}})};
 const reason=r=>only(tailCell,r).tailUnqualifiedReasons;
 assert.equal(only(tailCell,typed()).tailQualified,1,'type RPC still reading back at release is fine once its posts are done');
 // the last post must end strictly before release by the clock uncertainty (2)
 assert.equal(only(tailCell,typed({endedAt:10902})).tailQualified,1);
 assert.deepEqual(reason(typed({endedAt:10903})),{producerNotQuiescent:1});
 assert.deepEqual(reason(typed({endedAt:undefined},{},KEYS(10022,10028))),{producerNotQuiescent:1},'no actual last-post time');
 const noFirst=typed({startedAt:undefined},{},KEYS(10022,10028));noFirst.type.endedAt=10030;
 assert.deepEqual(reason(noFirst),{producerNotQuiescent:1},'type returned before the mousedown, but no actual first-post time');
 // inventory: exactly 6 keyDown, 6 keyUp and 12 flagsChanged
 assert.deepEqual(reason(typed({},{},KEYS(10022,10028,23))),{keyboardStreamIncomplete:1});
 assert.deepEqual(reason(typed({},{},[...KEYS(10022,10028),{type:10,at:10028,sourcePid:1}])),{keyboardStreamIncomplete:1});
 const swapped=KEYS(10022,10028).map((k,i)=>i===0?{...k,type:10}:k);
 assert.deepEqual(reason(typed({},{},swapped)),{keyboardStreamIncomplete:1},'7 keyDown and 11 flags is not the keyed stream');
 // a captured event the producer cannot account for
 assert.deepEqual(reason(typed({},{},[...KEYS(10022,10028),{type:5,at:10029,sourcePid:1}])),{capturedStreamUnexpected:1});
 // captures are tap receipts after the post returned: a late receipt before the release is fine, one after it is not
 assert.equal(only(tailCell,typed({},{},KEYS(10022,10028).map((k,i)=>i===23?{...k,at:10048}:k))).tailQualified,1,'last key received 20 ms after its post');
 assert.equal(only(tailCell,typed({},{},KEYS(10022,10028).map((k,i)=>i===23?{...k,at:10907}:k))).tailQualified,1,'received within the uncertainty of the release');
 assert.deepEqual(reason(typed({},{},KEYS(10022,10028).map((k,i)=>i===23?{...k,at:10908}:k))),{capturedStreamUnexpected:1},'a capture after the release');
 assert.deepEqual(reason(typed({},{},KEYS(10022,10028).map((k,i)=>i===0?{...k,at:10019}:k))),{capturedStreamUnexpected:1},'a key held before the first post');
 assert.deepEqual(reason(typed({},{},KEYS(10022,10028).map((k,i)=>i===5?{...k,sourcePid:2}:k))),{capturedStreamUnexpected:1},'a key from another source process');
 assert.deepEqual(reason(typed({},{},KEYS(10022,10028).map((k,i)=>i===5?{...k,at:undefined}:k))),{capturedStreamUnexpected:1},'a capture without its timestamp');
 assert.deepEqual(reason(typed({},{captures:undefined})),{holdNotComplete:1},'counts without the capture sequence');
 // partial or unknown producers are explicitly unqualified, whatever the answer says
 assert.deepEqual(reason(typed({entered:5})),{producerUnaccounted:1});
 assert.deepEqual(reason(typed({entered:undefined})),{producerUnaccounted:1});
});

test('a no-input tail qualifies only with no captured keys and its type RPC complete before release, whatever it answered',()=>{
 const none=(type={},keys=[])=>good(tailCell,{events:[{event:'mousedown',at:10950}],type:{startedAt:10021,endedAt:10030,error:{errorName:'typeUnconfirmed',meta:{entered:0,typeReadback:{reason:'selectionChanged'}}},...type},ax:{pointerHold:hold(keys)}});
 assert.deepEqual([only(tailCell,none()).tailQualified,only(tailCell,none()).safeRefusal],[1,1]);
 assert.equal(only(tailCell,none({endedAt:10902})).tailQualified,1,'type RPC ended u before the release');
 assert.deepEqual(only(tailCell,none({endedAt:10903})).tailUnqualifiedReasons,{producerNotQuiescent:1});
 assert.deepEqual(only(tailCell,none({},KEYS(10022,10028,4))).tailUnqualifiedReasons,{keyboardStreamIncomplete:1},'keys held although nothing was entered');
 const wrongOk=only(tailCell,none({error:null,meta:{entered:0,typeReadback:{confirmed:true}}}));
 assert.deepEqual([wrongOk.tailQualified,wrongOk.tailUnsafeOk,wrongOk.safeRefusal],[1,1,0],'an entered-0 success still qualifies and counts unsafe');
});

// Finding 2: one DOM event stream is ordered by its own seq/mono/epoch, never excused by cross-process RTT.
test('DOM input before the held mousedown is judged within the page stream, ties rejected',()=>{
 const reason=(events,u=2)=>only(tailCell,good(tailCell,{clockUncertaintyMs:u,events})).tailUnqualifiedReasons;
 assert.deepEqual(reason([{event:'keydown',at:10499},{event:'mousedown',at:10500}],50),{postedInputOvertookPointer:1},'1 ms earlier despite u=50');
 assert.deepEqual(reason([{event:'input',at:10500,seq:4,monoMs:99},{event:'mousedown',at:10500,seq:5,monoMs:99}]),{postedInputOvertookPointer:1},'tied epoch, earlier seq');
 assert.deepEqual(reason([{event:'input',at:10500,monoMs:98},{event:'mousedown',at:10500,monoMs:99}]),{postedInputOvertookPointer:1},'tied epoch, earlier mono');
 assert.deepEqual(reason([{event:'mousedown',at:10500,seq:5},{event:'input',at:10500,seq:6}]),{},'same epoch, known later seq');
 assert.equal(only(tailCell,good(tailCell,{events:[{event:'mousedown',at:10500,seq:5},{event:'input',at:10500,seq:6}]})).tailQualified,1);
 assert.deepEqual(reason([{event:'keydown',at:10500},{event:'mousedown',at:10500}]),{domOrderAmbiguous:1},'tie with no stream order');
 assert.deepEqual(reason([{event:'mousedown',at:10500,seq:9},{event:'keyup',at:10499,seq:10}]),{},'seq outranks a skewed epoch');
});

// A DOM mousedown earlier than the release (beyond the cross-process uncertainty) cannot be the held pointer.
test('a mousedown observed before the hold released is not the held pointer',()=>{
 const at=(md,releasedAt)=>only(tailCell,good(tailCell,{events:[{event:'mousedown',at:md}],ax:{pointerHold:hold([],{releasedAt})}}));
 assert.equal(at(10906,10905).tailQualified,1);
 assert.equal(at(10903,10905).tailQualified,1,'within the uncertainty of the release');
 assert.deepEqual(at(10902,10905).tailUnqualifiedReasons,{mousedownBeforeRelease:1});
 assert.deepEqual(at(10500,10905).tailUnqualifiedReasons,{mousedownBeforeRelease:1},'the earlier fixture shape');
});
