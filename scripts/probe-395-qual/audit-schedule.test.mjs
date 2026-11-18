import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {API,TEXT_ATTRIBUTES,RANGE_ATTRIBUTES,classOf,markerKind,canonicalPoll,decodeRecord,buildSchedule,compareSchedules,AuditError,VALUE_BEARING} from './audit-schedule.mjs';
import {compareAudits} from './audit-summary.mjs';

const src=f=>readFileSync(new URL(f,import.meta.url),'utf8');
const listIn=(text,name)=>[...text.match(new RegExp('let '+name+' = \\[([^\\]]*)\\]'))[1].matchAll(/"([^"]+)"/g)].map(m=>m[1]);

test('classification reuses the #354 text and range vocabulary exactly',()=>{
 const swift354=src('../probe-354-fences/audit.swift');
 assert.deepEqual([...TEXT_ATTRIBUTES],listIn(swift354,'textAttributes'));
 assert.deepEqual([...RANGE_ATTRIBUTES],listIn(swift354,'rangeAttributes'));
 for(const n of TEXT_ATTRIBUTES)assert.equal(classOf(n),'text');
 for(const n of RANGE_ATTRIBUTES)assert.equal(classOf(n),'range');
});
test('api codes match the Swift accumulator',()=>{
 const swift=src('./audit.swift'),codes=Object.fromEntries([...swift.matchAll(/api([A-Za-z]+) = (\d+)/g)].map(m=>[m[1][0].toLowerCase()+m[1].slice(1),Number(m[2])]));
 assert.deepEqual(codes,{...API});
});
test('markers are recognised by rule, including attributes not yet seen',()=>{
 for(const n of ['AXSelectedTextMarkerRange','AXStartTextMarker','AXStringForTextMarkerRange','AXLengthForTextMarkerRange','AXSomeFutureTextMarkerThing'])assert.equal(classOf(n),'marker',n);
 assert.equal(classOf('AXNumberOfCharacters'),'length');assert.equal(classOf('AXRole'),'role');assert.equal(classOf('AXChildren'),'walk');assert.equal(classOf('AXTitle'),'other');
 assert.equal(markerKind('AXStringForTextMarkerRange'),'text');assert.equal(markerKind('AXLengthForTextMarkerRange'),'length');assert.equal(markerKind('AXNextTextMarkerForTextMarker'),'navigation');assert.equal(markerKind('AXSelectedTextMarkerRange'),'range');
 assert.deepEqual([...VALUE_BEARING],['text','range','marker','length']);
});
// Build a record the way audit.swift writes it: [api,nameIndex,alias,outcome,atUs,durUs].
function record(id,rows,extra={}){
 const names=[],ref=n=>{let i=names.indexOf(n);if(i<0){names.push(n);i=names.length-1}return i};
 const e=rows.map(([api,name,alias=0,outcome=0,at=0,dur=10])=>[api,ref(name),alias,outcome,at,dur]);
 return {v:1,id,spanNs:5e6,overheadNs:1e5,names,e,dropped:0,aliasOverflow:0,aliases:2,offThread:0,offThreadCounts:{},overlaps:0,roles:{'0':'AXTextField'},subroles:{},...extra};
}
let clock=1000;
const tick=()=>clock+=10;
// One readbackPoll iteration: fieldClosed (role, subrole), the value read, and the caret read when the value was the expected one.
const iteration=caret=>[[API.phaseBegin,'fieldClosed',-1,0,tick()],[API.single,'AXRole',0,0,tick()],[API.single,'AXSubrole',0,0,tick()],[API.phaseEnd,'fieldClosed',-1,0,tick()],[API.single,'AXValue',0,0,tick()],
 ...(caret?[[API.single,'AXSelectedTextRange',0,0,tick()]]:[])];
// A poll phase of iterations, each flagged with whether it read the caret: poll(false) is `ABC`, poll(true,false) is `ABCD ABC`.
const poll=(...carets)=>[[API.phaseBegin,'poll',-1,0,tick()],...carets.flatMap(iteration),[API.phaseEnd,'poll',-1,0,tick()]];
const discovery=[[API.hit,'ElementAtPosition',-1,0,0],[API.single,'AXFocusedUIElement',0,0,20],[API.single,'AXRole',1,0,40],[API.single,'AXSubrole',1,0,50]];
const afterEvent=[[API.event,'keyDown',-1,0,900]];
const shapeOf=rows=>buildSchedule(record('x',rows));

test('a poll phase reads as its terminal path: retries before it, and one versus many, do not change the shape',()=>{
 const lit1=shapeOf([...discovery,...afterEvent,...poll(false)]),lit3=shapeOf([...discovery,...afterEvent,...poll(false,false,false)]);
 assert.equal(lit1.shape,lit3.shape);assert.deepEqual(lit1.pollCycleReps,[1]);assert.deepEqual(lit3.pollCycleReps,[3]); // raw count: informational
 // ABCDABC against ABCABCDABC (and more retries, and a caret read repeated before the confirming iteration).
 const a=shapeOf([...discovery,...afterEvent,...poll(true,false)]),b=shapeOf([...discovery,...afterEvent,...poll(false,true,false)]);
 const c=shapeOf([...discovery,...afterEvent,...poll(false,false,false,true,false)]),d=shapeOf([...discovery,...afterEvent,...poll(false,true,true,true,false)]);
 assert.equal(a.shape,b.shape);assert.equal(a.shape,c.shape);assert.equal(a.shape,d.shape);
 assert.deepEqual([a.pollCycleReps,b.pollCycleReps,c.pollCycleReps,d.pollCycleReps],[[2],[3],[5],[5]]);
 assert.notEqual(a.strictKey,b.strictKey); // the exact schedule is kept beside the shape
 // The caret-bearing path differs from a path without one, and from one whose caret iteration is followed by another read.
 assert.notEqual(a.shape,lit1.shape);
 assert.notEqual(a.shape,shapeOf([...discovery,...afterEvent,...poll(true,false,true,false)]).shape);
 // A poll that ends before its value read (a closed field) is not mistaken for a normal one.
 const closed=[[API.phaseBegin,'poll',-1,0,tick()],...iteration(false).slice(0,4),[API.phaseEnd,'poll',-1,0,tick()]];
 assert.notEqual(shapeOf([...discovery,...afterEvent,...closed]).shape,lit1.shape);
});
test('only retries identical to the plain role, subrole, value loop are dropped; an earlier iteration of other calls stays',()=>{
 const other=[[API.phaseBegin,'fieldClosed',-1,0,tick()],[API.single,'AXRole',0,0,tick()],[API.single,'AXChildren',0,0,tick()],[API.phaseEnd,'fieldClosed',-1,0,tick()],[API.single,'AXValue',0,0,tick()]];
 const body=(...parts)=>shapeOf([...discovery,...afterEvent,[API.phaseBegin,'poll',-1,0,tick()],...parts.flat(),[API.phaseEnd,'poll',-1,0,tick()]]);
 const plainRetry=body(iteration(false),iteration(true),iteration(false)),withOther=body(other,iteration(true),iteration(false));
 assert.notEqual(withOther.shape,plainRetry.shape);assert.match(withOther.shape,/AXChildren/);
 // The plain loop dropped is only the leading run: once another iteration is met, later plain ones stay.
 assert.notEqual(body(other,iteration(false),iteration(true),iteration(false)).shape,withOther.shape);
 // A failed value read is a different call outcome, so a retry that failed is kept too.
 const failed=[...iteration(false).slice(0,4),[API.single,'AXValue',0,2,tick()]];
 assert.match(body(failed,iteration(true),iteration(false)).shape,/AXValue@e0!fail/);
 assert.equal(body(iteration(false),iteration(false),iteration(true),iteration(false)).shape,plainRetry.shape);
});
test('nothing outside a poll phase is normalized: reads and phase markers keep their order and number',()=>{
 const base=[...discovery,...afterEvent,...poll(false)];
 const twice=shapeOf([...discovery,...discovery,...afterEvent,...poll(false)]);
 assert.notEqual(shapeOf(base).shape,twice.shape);assert.notEqual(shapeOf(base).preInput.exactKey,twice.preInput.exactKey);
 // Repeated identical reads before and after the phase stay repeated.
 const rep=shapeOf([...discovery,...afterEvent,[API.single,'AXRole',0,0,1],[API.single,'AXRole',0,0,2],...poll(false)]);
 assert.notEqual(shapeOf(base).shape,rep.shape);
 // A different order of the same reads is a different shape, and the boundary moving past the poll changes the pre-input reads.
 assert.notEqual(shapeOf([...discovery,...afterEvent,[API.single,'AXRole',0,0,1],[API.single,'AXChildren',0,0,2],...poll(false)]).shape,shapeOf([...discovery,...afterEvent,[API.single,'AXChildren',0,0,1],[API.single,'AXRole',0,0,2],...poll(false)]).shape);
 assert.notEqual(shapeOf([...discovery,...poll(false),...afterEvent]).preInput.exactKey,shapeOf(base).preInput.exactKey);
 // Phase markers are reported apart (phaseKey) and never decide a comparison; only the `poll` phase is touched, so another phase's repeated body is exact.
 assert.equal(shapeOf(base).shape.includes('ph'),false);assert.match(shapeOf(base).phaseKey,/ph\+:poll\|.*\|ph-:poll$/);
 const walk=n=>[[API.phaseBegin,'walk',-1,0,tick()],...Array.from({length:n},()=>[API.single,'AXChildren',1,0,tick()]),[API.phaseEnd,'walk',-1,0,tick()]];
 assert.notEqual(shapeOf([...walk(2),...afterEvent]).shape,shapeOf([...walk(3),...afterEvent]).shape);
 // Two poll phases (a checkpoint, then the final) are each reduced and kept in order.
 const two=shapeOf([...discovery,...afterEvent,...poll(false,false),...poll(true,true,false)]);
 assert.equal(two.shape,shapeOf([...discovery,...afterEvent,...poll(false),...poll(true,false)]).shape);assert.deepEqual(two.pollCycleReps,[2,3]);
 // An unclosed phase has no end to reduce to, so it is read exactly.
 const open=[[API.phaseBegin,'poll',-1,0,tick()],...iteration(false),...iteration(false)];
 assert.notEqual(shapeOf([...discovery,...afterEvent,...open]).shape,shapeOf([...discovery,...afterEvent,[API.phaseBegin,'poll',-1,0,tick()],...iteration(false)]).shape);
 assert.deepEqual(canonicalPoll([]),{entries:[],iterations:0});
});
test('keyboard events are the pre-input boundary only: never in a key, a shape or a count beyond the first',()=>{
 const withEvent=shapeOf([...discovery,...afterEvent,...poll(false)]),without=shapeOf([...discovery,...poll(false)]);
 assert.equal(withEvent.strictKey.includes('ev:'),false);assert.equal(withEvent.shape.includes('ev:'),false);
 assert.equal(withEvent.shape,without.shape);assert.equal(withEvent.preInput.boundary,'event');assert.equal(without.preInput.boundary,'none');
 assert.equal(withEvent.preInput.entries,4);assert.deepEqual(withEvent.counters.events,{keyDown:1});
 // A record carrying a second event (a recorder that counts the keys) is refused, never summarized.
 assert.throws(()=>buildSchedule(record('two',[...discovery,...afterEvent,[API.event,'keyDown',-1,0,950],...poll(false)])),e=>e instanceof AuditError&&e.code==='audit-record-malformed');
});
test('pre-input reads are compared exactly: the same ordered discovery, however long the typing',()=>{
 const short=buildSchedule(record('s',[...discovery,...afterEvent,...poll(true,false),[API.single,'AXSelectedTextRange',0,0,2000]]));
 const long=buildSchedule(record('l',[...discovery,...afterEvent,...poll(false,false,false,false,true,false),[API.single,'AXSelectedTextRange',0,0,3000]]));
 assert.equal(short.preInput.entries,4);
 assert.equal(short.preInput.exactKey,long.preInput.exactKey);
 assert.equal(short.shape,long.shape);
 assert.notEqual(short.strictKey,long.strictKey);
 const cmp=compareSchedules(short,long);
 assert.equal(cmp.preInput.exactEqual,true);assert.equal(cmp.whole.shapeEqual,true);assert.equal(cmp.whole.exactEqual,false);
 assert.deepEqual(cmp.pollCycleReps,[[2],[6]]);
 assert.equal(cmp.full.attemptsEqual,false); // counts are reported exactly, never normalized
 assert.deepEqual(cmp.full.diff.AXValue,[2,6]);
});
test('marker counts are split from the full counts, and each marker attempt keeps its api, receiver alias and side of the boundary',()=>{
 const base=[...discovery,...afterEvent];
 const plain=buildSchedule(record('p',[...base,...poll(false)]));
 const withMarker=buildSchedule(record('m',[...discovery,[API.single,'AXSelectedTextMarkerRange',2,0,1500],[API.param,'AXUIElementForTextMarker',2,0,1600],...afterEvent,[API.single,'AXSelectedTextMarkerRange',2,0,2100],...poll(false)]));
 assert.equal(withMarker.counters.byClass.marker,3);assert.deepEqual(withMarker.counters.markerByName,{AXSelectedTextMarkerRange:2,AXUIElementForTextMarker:1});
 const cmp=compareAudits(plain,withMarker);
 assert.equal(cmp.marker.countsEqual,false);assert.deepEqual(cmp.marker.total,[0,3]);assert.equal(cmp.full.attemptsEqual,false);
 const attempts=withMarker.timeline.markerAttempts;
 assert.deepEqual(attempts.map(a=>[a.api,a.alias,a.preInput]),[['r',2,true],['p',2,true],['r',2,false]]);
 assert.equal(withMarker.preInput.entries,6);assert.equal(withMarker.postInput.counters,undefined);
});
test('a build with no event hook reports pre-input unavailable, not empty, and a refusal with no event is all pre-input',()=>{
 const refusal=buildSchedule(record('r',[...discovery]));
 assert.equal(refusal.preInput.entries,4);assert.equal(refusal.postInput.entries,0);assert.equal(refusal.preInput.boundary,'none');
 assert.equal(buildSchedule(record('r2',[...discovery]),{preInputAvailable:false}).preInput.available,false);
});
test('phases are reported apart from the call schedule, with their bounds and calls; the pre-input reads ignore them',()=>{
 const base=[...discovery,...afterEvent];
 const a=buildSchedule(record('a',[...discovery.slice(0,2),[API.phaseBegin,'markedField',-1,0,30,0],...discovery.slice(2),[API.phaseEnd,'markedField',-1,0,30,100],...afterEvent,[API.phaseBegin,'walk',-1,0,1000,0],[API.single,'AXRole',0,0,1010],[API.single,'AXSubrole',0,0,1020],[API.single,'AXValue',0,0,1030],[API.phaseEnd,'walk',-1,0,1000,500]]));
 const b=buildSchedule(record('b',[...base,[API.single,'AXRole',0,0,1010],[API.single,'AXSubrole',0,0,1020],[API.single,'AXValue',0,0,1030]]));
 assert.equal(a.shape,b.shape);assert.equal(a.preInput.exactKey,b.preInput.exactKey);assert.equal(a.strictKey,b.strictKey);
 assert.notEqual(a.phaseKey,b.phaseKey);assert.match(a.phaseKey,/ph\+:walk\|r:AXRole@e0\|r:AXSubrole@e0\|r:AXValue@e0\|ph-:walk$/);assert.match(a.phaseKey,/ph\+:markedField\|r:AXRole@e1/);
 assert.equal(a.timeline.phases.walk.length,1);assert.equal(a.timeline.phases.walk[0].durMs,0.5);assert.equal(a.timeline.phases.walk[0].calls,3);
 assert.equal(a.counters.attempts,b.counters.attempts); // a phase marker is not a call
});
test('malformed engine records are rejected with a code and never partially decoded',()=>{
 const good=record('g',[...discovery]);
 for(const bad of [{...good,v:2},{...good,names:['a b']},{...good,e:[[0,9,0,0,0,0]]},{...good,e:[[0,0,0,5,0,0]]},{...good,spanNs:-1},null,{...good,e:[[0,0,0,0]]}])assert.throws(()=>decodeRecord(bad),e=>e instanceof AuditError&&e.code==='audit-record-malformed');
 assert.equal(buildSchedule(record('d',[...discovery],{dropped:3})).complete,false);
 assert.equal(buildSchedule(record('o',[...discovery],{overlaps:1})).complete,false);
});
test('outcomes other than success are part of the token; element aliases are per row',()=>{
 const x=buildSchedule(record('x',[[API.single,'AXValue',0,0,0]])),y=buildSchedule(record('y',[[API.single,'AXValue',0,2,0]])),z=buildSchedule(record('z',[[API.single,'AXValue',3,0,0]]));
 assert.notEqual(x.strictKey,y.strictKey);assert.notEqual(x.strictKey,z.strictKey);assert.match(y.strictKey,/!fail/);
});
