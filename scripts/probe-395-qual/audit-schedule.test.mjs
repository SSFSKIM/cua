import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {API,TEXT_ATTRIBUTES,RANGE_ATTRIBUTES,classOf,markerKind,collapse,decodeRecord,buildSchedule,compareSchedules,AuditError,VALUE_BEARING} from './audit-schedule.mjs';
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
test('collapse folds contiguous repeated cycles, keeps order and singles, and is deterministic',()=>{
 const t=s=>s.split('');
 assert.deepEqual(collapse(t('ABABABC')),[{block:['A','B'],reps:3},{block:['C'],reps:1}]);
 assert.deepEqual(collapse(t('AAAB')),[{block:['A'],reps:3},{block:['B'],reps:1}]);
 assert.deepEqual(collapse(t('XCDCDCDCDY')).map(r=>[r.block.join(''),r.reps]),[['X',1],['CD',4],['Y',1]]);
 assert.deepEqual(collapse([]),[]);
});
// Build a record the way audit.swift writes it: [api,nameIndex,alias,outcome,atUs,durUs].
function record(id,rows,extra={}){
 const names=[],ref=n=>{let i=names.indexOf(n);if(i<0){names.push(n);i=names.length-1}return i};
 const e=rows.map(([api,name,alias=0,outcome=0,at=0,dur=10])=>[api,ref(name),alias,outcome,at,dur]);
 return {v:1,id,spanNs:5e6,overheadNs:1e5,names,e,dropped:0,aliasOverflow:0,aliases:2,offThread:0,offThreadCounts:{},overlaps:0,roles:{'0':'AXTextField'},subroles:{},...extra};
}
const poll=(n,range=false,start=1000)=>Array.from({length:n},(_,i)=>[[API.single,'AXRole',0,0,start+i*40],[API.single,'AXSubrole',0,0,start+i*40+10],[API.single,'AXValue',0,0,start+i*40+20],...(range?[[API.single,'AXSelectedTextRange',0,0,start+i*40+30]]:[])]).flat();
const discovery=[[API.hit,'ElementAtPosition',-1,0,0],[API.single,'AXFocusedUIElement',0,0,20],[API.single,'AXRole',1,0,40],[API.single,'AXSubrole',1,0,50]];
test('pre-input is everything before the first posted event; poll cycles collapse after it and raw repeats are kept apart',()=>{
 const short=buildSchedule(record('s',[...discovery,[API.event,'keyDown',-1,0,900],...poll(3),[API.single,'AXSelectedTextRange',0,0,2000]]));
 const long=buildSchedule(record('l',[...discovery,[API.event,'keyDown',-1,0,900],...poll(11),[API.single,'AXSelectedTextRange',0,0,3000]]));
 assert.equal(short.preInput.entries,4);
 assert.equal(short.preInput.exactKey,long.preInput.exactKey);
 assert.equal(short.shape,long.shape);
 assert.deepEqual(short.pollCycleReps,[3]);assert.deepEqual(long.pollCycleReps,[11]);
 assert.notEqual(short.strictKey,long.strictKey);
 const cmp=compareSchedules(short,long);
 assert.equal(cmp.preInput.exactEqual,true);assert.equal(cmp.whole.shapeEqual,true);assert.equal(cmp.whole.exactEqual,false);
 assert.deepEqual(cmp.pollCycleReps,[[3],[11]]);
 assert.equal(cmp.full.attemptsEqual,false); // counts are reported exactly, never normalized
 assert.deepEqual(cmp.full.diff.AXValue,[3,11]);
});
test('a range-bearing cycle before the terminal equal changes the shape; marker counts are split from the full counts',()=>{
 const base=[...discovery,[API.event,'keyDown',-1,0,900]];
 const plain=buildSchedule(record('p',[...base,...poll(2),...poll(1,true,5000)]));
 const concealed=buildSchedule(record('c',[...base,...poll(7),...poll(1,true,5000)]));
 const noRange=buildSchedule(record('n',[...base,...poll(8)]));
 assert.equal(plain.shape,concealed.shape);assert.notEqual(plain.shape,noRange.shape);
 const withMarker=buildSchedule(record('m',[...base,[API.single,'AXSelectedTextMarkerRange',0,0,1500],[API.param,'AXStringForTextMarkerRange',0,0,1600],...poll(2)]));
 assert.equal(withMarker.counters.byClass.marker,2);assert.deepEqual(withMarker.counters.markerByName,{AXSelectedTextMarkerRange:1,AXStringForTextMarkerRange:1});
 const cmp=compareAudits(plain,withMarker);
 assert.equal(cmp.marker.countsEqual,false);assert.deepEqual(cmp.marker.total,[0,2]);assert.equal(cmp.full.attemptsEqual,false);
 assert.equal(withMarker.timeline.markerAttempts.length,2);assert.equal(withMarker.timeline.markerAttempts[0].preInput,false);
});
test('a build with no event hook reports pre-input unavailable, not empty, and a refusal with no event is all pre-input',()=>{
 const refusal=buildSchedule(record('r',[...discovery]));
 assert.equal(refusal.preInput.entries,4);assert.equal(refusal.postInput.entries,0);assert.equal(refusal.preInput.boundary,'none');
 assert.equal(buildSchedule(record('r2',[...discovery]),{preInputAvailable:false}).preInput.available,false);
});
test('phases are timing only: they never enter a shape, and their bounds and calls are reported',()=>{
 const base=[...discovery,[API.event,'keyDown',-1,0,900]];
 const a=buildSchedule(record('a',[...base,[API.phaseBegin,'walk',-1,0,1000,0],...poll(2,false,1010),[API.phaseEnd,'walk',-1,0,1000,500]]));
 const b=buildSchedule(record('b',[...base,...poll(2,false,1010)]));
 assert.equal(a.shape,b.shape);assert.equal(a.strictKey,b.strictKey);
 assert.equal(a.timeline.phases.walk.length,1);assert.equal(a.timeline.phases.walk[0].durMs,0.5);assert.equal(a.timeline.phases.walk[0].calls,6);
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
