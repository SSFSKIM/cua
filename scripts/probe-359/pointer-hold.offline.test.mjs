import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {qualificationCells,qualificationSummary} from './qualification-readers.mjs';
import {SEED,REQUESTED} from './page.mjs';

// The hold-pointer stress runs only on the hosted fixture. Offline, the watcher's pure queue/state model is compiled
// alone (Foundation only) against fake events; nothing here creates a tap or posts input.
const watchPath=new URL('./watch.swift',import.meta.url).pathname;
const source=readFileSync(watchPath,'utf8');
const BEGIN='// pointer-hold model: BEGIN',END='// pointer-hold model: END';

// Fake events are named by CGEventType raw value: D=1 leftDown, U=2 leftUp, M=5 mouseMoved, K=10 keyDown, k=11 keyUp, F=12 flags.
const driver=String.raw`
import Foundation
let types: [Character: UInt32] = ["D": 1, "U": 2, "M": 5, "K": 10, "k": 11, "F": 12]
func emit(_ name: String, _ h: PointerHold359<String>, _ extra: [String: Any] = [:]) {
  var o = h.summary(); o["case"] = name; for (k, v) in extra { o[k] = v }
  print(String(data: try! JSONSerialization.data(withJSONObject: o, options: [.sortedKeys]), encoding: .utf8)!)
}
// Feeds "D1@10" style tokens; returns each verdict as [suppress, releaseAt|null, overflowed].
func feed(_ h: inout PointerHold359<String>, _ tokens: [String], copyFails: Set<String> = []) -> [[Any]] {
  tokens.map { t in
    let parts = t.split(separator: "@"), name = String(parts[0]), at = Double(parts[1])!
    let r = h.observe(type: types[name.first!]!, at: at, sourcePid: 7, copy: { copyFails.contains(name) ? nil : name })
    return [r.suppress, r.releaseAt as Any? ?? NSNull(), r.overflowed]
  }
}
do { // FIFO: nothing held before the down; from it, the pair and every later key are held and released together, once
  var h = PointerHold359<String>(delayMs: 900, armedAt: 0)
  let v = feed(&h, ["K0@1", "k0@2", "M0@5", "D1@10", "M1@11", "U1@30", "F1@40", "K1@41", "k1@42"])
  let first = h.release(at: 910, early: false, reason: "timer"), second = h.release(at: 920, early: true, reason: "stop")
  // Released originals re-entering (they never should: the tap is closed first) pass and are never re-held.
  let again = feed(&h, ["D1@930", "K1@931"])
  emit("fifo", h, ["v": v, "first": first, "second": second, "again": again])
}
do { // wrong and extra pointer events: an early up passes; later downs/ups are held in order but counted as extra
  var h = PointerHold359<String>(delayMs: 900, armedAt: 0)
  let v = feed(&h, ["U0@5", "D1@10", "D2@12", "U1@20", "U2@25"])
  let posted = h.release(at: 910, early: false, reason: "timer")
  emit("extra", h, ["v": v, "posted": posted])
}
do { // the timer fires before the up: everything held is released; the pair is incomplete
  var h = PointerHold359<String>(delayMs: 900, armedAt: 0)
  _ = feed(&h, ["D1@10", "K1@20"])
  let posted = h.release(at: 910, early: false, reason: "timer"); let late = feed(&h, ["U1@950"])
  emit("timeout-half", h, ["posted": posted, "late": late])
}
do { // stop before the timer: the buffer is released once and marked early
  var h = PointerHold359<String>(delayMs: 900, armedAt: 0)
  _ = feed(&h, ["D1@10", "U1@30", "K1@40"])
  let posted = h.release(at: 200, early: true, reason: "stop"), timer = h.release(at: 910, early: false, reason: "timer")
  emit("early", h, ["posted": posted, "timer": timer])
}
do { // cleanup with nothing captured
  var h = PointerHold359<String>(delayMs: 900, armedAt: 0)
  let posted = h.release(at: 50, early: true, reason: "rebind"); emit("empty", h, ["posted": posted])
}
do { // an uncopyable event is never suppressed: before the trigger it does not trigger, after it it breaks FIFO
  var a = PointerHold359<String>(delayMs: 900, armedAt: 0)
  let va = feed(&a, ["D1@10"], copyFails: ["D1"]); emit("copy-failed-trigger", a, ["v": va])
  var b = PointerHold359<String>(delayMs: 900, armedAt: 0)
  let vb = feed(&b, ["D1@10", "K1@15", "U1@20"], copyFails: ["K1"])
  let posted = b.release(at: 910, early: false, reason: "timer"); emit("copy-failed-later", b, ["v": vb, "posted": posted])
}
// A type_text producer posting NEW359 as Keyboard.swift does (flags, down, up, restore per unit) after a click whose
// down/up the hold captured. Events posted before the release are held; the watcher then closes the tap and replays,
// and any post landing during that replay reaches the pid directly (here, right after the replayed down).
func producer(_ name: String, keyStart: Double, keyStep: Double) {
  var h = PointerHold359<String>(delayMs: 900, armedAt: 9900)
  var posts: [(String, Double)] = [("D", 10005), ("U", 10006)]
  for i in 0..<24 { posts.append((["F", "K", "k", "F"][i % 4] + String(i), keyStart + Double(i) * keyStep)) }
  let releaseAt = 10905.0
  _ = feed(&h, posts.filter { $0.1 <= releaseAt }.map { "\($0.0)@\($0.1)" })
  let replay = h.release(at: releaseAt, early: false, reason: "timer")
  var delivered: [String] = []
  for (i, e) in replay.enumerated() {
    delivered.append(e)
    // After the replayed down, later posts the tap no longer sees reach the pid before the rest of the buffer.
    if i == 0 { for p in posts where p.1 > releaseAt { _ = feed(&h, ["\(p.0)@\(p.1)"]); delivered.append(p.0) } }
  }
  emit(name, h, ["delivered": delivered, "firstPost": keyStart, "lastPost": posts.last!.1])
}
producer("quiescent", keyStart: 10022, keyStep: 0.25)
producer("replay-overtake", keyStart: 10040, keyStep: 40)
do { // overflow: the event past the limit is still held (never dropped) and the caller is told to release now
  var h = PointerHold359<String>(delayMs: 900, armedAt: 0, limit: 3)
  let v = feed(&h, ["D1@10", "U1@11", "K1@12", "k1@13", "K2@14"])
  let posted = h.release(at: 15, early: true, reason: "overflow"); emit("overflow", h, ["v": v, "posted": posted])
}
`;

function runModel(){
 const b=source.indexOf(BEGIN),e=source.indexOf(END);
 assert.ok(b>=0&&e>b,'watch.swift must carry the delimited pure pointer-hold model');
 const root=mkdtempSync(join(tmpdir(),'pointer-hold-'));
 try{
  writeFileSync(join(root,'Model.swift'),'import Foundation\n'+source.slice(b,e));writeFileSync(join(root,'main.swift'),driver);
  const built=spawnSync('swiftc',[join(root,'Model.swift'),join(root,'main.swift'),'-o',join(root,'model')],{encoding:'utf8'});
  assert.equal(built.status,0,built.stderr);
  const ran=spawnSync(join(root,'model'),{encoding:'utf8'});assert.equal(ran.status,0,ran.stderr);
  return Object.fromEntries(ran.stdout.trim().split('\n').map(l=>JSON.parse(l)).map(o=>[o.case,o]));
 }finally{rmSync(root,{recursive:true,force:true})}
}
const cases=runModel();
const P=[false,null,false],H=[true,null,false];

test('from the first down, the pair and every later event are held in order and released together exactly once',()=>{
 const f=cases.fifo;
 assert.deepEqual(f.v,[P,P,P,[true,910,false],H,H,H,H,H]);
 assert.deepEqual(f.first,['D1','M1','U1','F1','K1','k1']);assert.deepEqual(f.second,[]);assert.deepEqual(f.again,[P,P]);
 assert.deepEqual(f.captures.map(c=>[c.type,c.at,c.sourcePid]),[[1,10,7],[5,11,7],[2,30,7],[12,40,7],[10,41,7],[11,42,7]]);
 assert.deepEqual([f.captured,f.released,f.pointerCaptured,f.pointerReleased,f.keyCaptured],[6,6,2,2,3]);
 assert.deepEqual([f.earlyRelease,f.stressExercised,f.releaseReason,f.releasedAt,f.releaseDueAt,f.armedAt],[false,true,'timer',910,910,0]);
 assert.deepEqual(f.extras.map(x=>[x.type,x.why]),[[1,'after-release']],'keys are required, not extra; only a re-entering pointer is');
});

test('an up before the down passes; extra downs and ups are held in order and counted',()=>{
 const x=cases.extra;
 assert.deepEqual(x.v,[P,[true,910,false],H,H,H]);
 assert.deepEqual(x.posted,['D1','D2','U1','U2']);
 assert.deepEqual([x.captured,x.released,x.pointerCaptured,x.extraEvents],[4,4,2,3]);
 assert.deepEqual(x.extras.map(e=>[e.type,e.why]),[[2,'up-before-down'],[1,'second-down'],[2,'after-pair']]);
});

test('a timer before the up releases the buffer and leaves the pair incomplete',()=>{
 const t=cases['timeout-half'];
 assert.deepEqual(t.posted,['D1','K1']);assert.deepEqual(t.late,[P]);
 assert.deepEqual([t.captured,t.released,t.pointerCaptured,t.pointerReleased,t.earlyRelease,t.stressExercised],[2,2,1,1,false,false]);
});

test('early cleanup releases the buffer once and marks it early and unexercised',()=>{
 const e=cases.early;
 assert.deepEqual(e.posted,['D1','U1','K1']);assert.deepEqual(e.timer,[]);
 assert.deepEqual([e.earlyRelease,e.releaseReason,e.releasedAt,e.stressExercised,e.pointerReleased],[true,'stop',200,false,2]);
 const n=cases.empty;assert.deepEqual(n.posted,[]);
 assert.deepEqual([n.captured,n.released,n.earlyRelease,n.stressExercised,n.releaseDueAt],[0,0,true,false,null]);
});

test('an uncopyable event is passed, never suppressed, and breaks the stress',()=>{
 const a=cases['copy-failed-trigger'];
 assert.deepEqual(a.v,[P]);assert.deepEqual([a.captured,a.copyFailures,a.releaseDueAt],[0,1,null]);
 const b=cases['copy-failed-later'];
 assert.deepEqual(b.v,[[true,910,false],P,H]);assert.deepEqual(b.posted,['D1','U1']);
 assert.deepEqual([b.pointerCaptured,b.copyFailures,b.stressExercised],[2,1,false]);
});

test('overflow keeps every event and asks for one early release',()=>{
 const o=cases.overflow;
 assert.deepEqual(o.v,[[true,910,false],H,H,[true,null,true],H]);
 assert.deepEqual(o.posted,['D1','U1','K1','k1','K2']);
 assert.deepEqual([o.overflow,o.earlyRelease,o.stressExercised,o.captured,o.released],[true,true,false,5,5]);
});

test('the real path closes the tap before reposting, and the watcher compiles',()=>{
 const body=source.slice(source.indexOf('func releaseHold359('));
 const fn=body.slice(0,body.indexOf('\n}\n'));
 assert.ok(fn.indexOf('closeHoldTap359()')>=0&&fn.indexOf('closeHoldTap359()')<fn.indexOf('postToPid('),'tap must be gone before the originals are reposted');
 const r=spawnSync('swiftc',['-typecheck',watchPath],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
});

// The reviewer's scenario on the real model: a producer still posting at the release overtakes the buffer during replay.
// The watcher's raw flag still says exercised; the reader must reject it from the wire and the real post interval.
test('a producer still posting at the hand-back is rejected by the reader even though the raw flag says exercised',()=>{
 const tail=qualificationCells({heads:{main:'a'.repeat(40),fix:'b'.repeat(40)}}).find(c=>c.cohort==='tail');
 const row=(c,meta={})=>{const {case:_,delivered,firstPost,lastPost,...wire}=c;return {...tail,requested:REQUESTED,valid:true,smoke:false,clockUncertaintyMs:2,
  click:{startedAt:10000,endedAt:10010,error:null,meta:{}},next:{startedAt:10011,endedAt:10020,error:null,meta:{}},stress:{startedAt:9900},
  type:{startedAt:10021,endedAt:11500,error:{errorName:'typeUnconfirmed'},meta:{startedAt:firstPost,endedAt:lastPost,entered:6,typeReadback:{reason:'valueMismatch'},...meta}},
  ax:{pointerHold:wire},events:[{event:'mousedown',at:10906,seq:1},{event:'keydown',at:10921,seq:2},{event:'mouseup',at:10922,seq:3}],
  samples:[{text:SEED,selection:[0,0]}],foregroundViolation:false,windowRaiseObserved:false}};
 const verdict=r=>{const g=qualificationSummary([r],[tail]).groups[0];return [g.tailQualified,g.tailUnqualifiedReasons]};
 const q=cases.quiescent,o=cases['replay-overtake'];
 assert.deepEqual([q.captured,q.keyCaptured,q.stressExercised],[26,24,true]);assert.deepEqual(q.delivered.slice(0,3),['D','U','F0']);
 assert.deepEqual(verdict(row(q)),[1,{}]);
 // 22 of the 24 key posts were held; k22 and F23 arrived during the replay, after the replayed down and before U.
 assert.deepEqual([o.captured,o.released,o.keyCaptured,o.pointerCaptured,o.extraEvents,o.stressExercised],[24,24,22,2,0,true]);
 assert.deepEqual(o.delivered.slice(0,4),['D','k22','F23','U'],'newer keys overtook the buffered up and keys');
 assert.deepEqual(verdict(row(o)),[0,{producerNotQuiescent:1}]);
 // Even if the last post were (wrongly) stamped before the release, the incomplete stream is still refused.
 assert.deepEqual(verdict(row(o,{endedAt:10900})),[0,{keyboardStreamIncomplete:1}]);
});
