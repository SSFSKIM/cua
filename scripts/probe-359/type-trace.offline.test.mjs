import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {patch} from './patch.mjs';

const kit=new URL('../..',import.meta.url).pathname;
const pinned='15acf09b';
const swift=String.raw`
import ApplicationServices
import Foundation

// Only framework boundaries are substituted. Type tracing must never reach an AX read stub.
nonisolated(unsafe) var unexpectedAXReads = 0
nonisolated(unsafe) var scriptedAX: ((AXUIElement, String) -> CFTypeRef?)?
let elementMessagingTimeout: Float = 1
func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
  if let scriptedAX { return scriptedAX(element, name) }
  unexpectedAXReads += 1; return nil
}
func copyAttribute(_ element: AXUIElement, _ name: String) -> (CFTypeRef?, AXError) { unexpectedAXReads += 1; return (nil, .failure) }
func stringAttribute(_ element: AXUIElement, _ name: String) -> String? { unexpectedAXReads += 1; return nil }
func elementAttribute(_ element: AXUIElement, _ name: String) -> AXUIElement? { unexpectedAXReads += 1; return nil }
func subroleRead(_ element: AXUIElement) -> Bool {
  if scriptedAX != nil { _ = attribute(element, kAXSubroleAttribute); return false }
  unexpectedAXReads += 1; return false
}
func secureTextField(role: String?, subrole: Bool) -> Bool { false }
func elementList(_ value: CFTypeRef?) -> [AXUIElement] { [] }
func bool(_ value: CFTypeRef?) -> Bool? { (value as? NSNumber)?.boolValue }
func rangeWire(_ value: CFTypeRef?) -> [String: Int]? {
  guard let value, CFGetTypeID(value) == AXValueGetTypeID(), AXValueGetType(value as! AXValue) == .cfRange else { return nil }
  var range = CFRange()
  guard AXValueGetValue(value as! AXValue, .cfRange, &range) else { return nil }
  return ["location": range.location, "length": range.length]
}
// The observer is synthetic; delivery uses a real private CFRunLoop source on a worker Thread.
struct ObserverScript {
  var createError = AXError.success, addError = AXError.success
  var emit = true, wrongTarget = false, focused = true
  var selection = [3, 0], written: [Int]? = nil
  var refuse = false
}
nonisolated(unsafe) var observerScript = ObserverScript()
nonisolated(unsafe) var observerAdded = 0, observerRemoved = 0
nonisolated(unsafe) var lastObserver: AXObserver?
typealias AXObserverCallback = @Sendable (AXObserver, AXUIElement, CFString, UnsafeMutableRawPointer?) -> Void
final class AXObserver {
  let callback: AXObserverCallback
  var source: CFRunLoopSource!, field: AXUIElement?, refcon: UnsafeMutableRawPointer?
  init(_ callback: @escaping AXObserverCallback) { self.callback = callback }
}
func AXObserverCreate(_ pid: pid_t, _ callback: @escaping AXObserverCallback, _ output: UnsafeMutablePointer<AXObserver?>) -> AXError {
  guard observerScript.createError == .success else { return observerScript.createError }
  let observer = AXObserver(callback)
  var context = CFRunLoopSourceContext()
  context.info = Unmanaged.passUnretained(observer).toOpaque()
  context.perform = { info in
    let observer = Unmanaged<AXObserver>.fromOpaque(info!).takeUnretainedValue()
    let field = observerScript.wrongTarget ? AXUIElementCreateApplication(getpid() + 1) : observer.field!
    observer.callback(observer, field, kAXSelectedTextChangedNotification as CFString, observer.refcon)
  }
  observer.source = CFRunLoopSourceCreate(nil, 0, &context)
  output.pointee = observer; lastObserver = observer
  return .success
}
func AXObserverAddNotification(_ observer: AXObserver, _ field: AXUIElement, _ name: CFString, _ refcon: UnsafeMutableRawPointer?) -> AXError {
  observerAdded += 1
  guard observerScript.addError == .success else { return observerScript.addError }
  observer.field = field; observer.refcon = refcon
  if observerScript.emit { CFRunLoopSourceSignal(observer.source) } // deliberately queued before the click
  return .success
}
func AXObserverGetRunLoopSource(_ observer: AXObserver) -> CFRunLoopSource { observer.source }
func AXObserverRemoveNotification(_ observer: AXObserver, _ field: AXUIElement, _ name: CFString) -> AXError {
  observerRemoved += 1; return .success
}
func AXUIElementGetPid(_ field: AXUIElement, _ pid: UnsafeMutablePointer<pid_t>) -> AXError { pid.pointee = getpid(); return .success }
@discardableResult func AXUIElementSetMessagingTimeout(_ field: AXUIElement, _ timeout: Float) -> AXError { .success }
func monotonicMilliseconds() -> Double { ProcessInfo.processInfo.systemUptime * 1000 }
struct TypedUnit { var text: [UInt16]; var press: Int? = nil }
struct KeyEvent {}
struct InputMeta { var typeReadback: TypeReadbackRecord?; var wire: [String: Any] { ["unchanged": true] } }
struct EngineError: Error, @unchecked Sendable {
  let errorName: String; let message: String; var extra: [String: Any] = [:]
  init(name: String, _ message: String, extra: [String: Any] = [:]) { errorName = name; self.message = message; self.extra = extra }
}
func withMeta(_ error: EngineError, _ meta: InputMeta) -> EngineError { var e = error; e.extra["meta"] = meta.wire; return e }
func keyText(_ units: [TypedUnit], concealed: Bool, checkSource: (Int, Int) throws -> Void,
             beforeUnit: ((Int) throws -> Void)? = nil, checkIntervention: () throws -> Void,
             post: (KeyEvent) -> Bool, pause: () -> Void, meta: inout InputMeta) throws { fatalError("not used") }

let seed = "Old draft sentence goes here."
let requested = "NEW359"
let offset3 = "OldNEW359 draft sentence goes here."
func begin(_ overrides: [String: Any] = [:]) -> Spike359Session? {
  Spike359Session.active = nil
  let args: [String: Any] = ["spike359TypeTrace": true, "text": "NEW359"]
  return Spike359Session.startType(args.merging(overrides) { _, value in value })
}
func demand(_ value: @autoclosure () -> Bool, _ message: String) { if !value() { fatalError(message) } }
setenv("RUNNER_ENVIRONMENT", "github-hosted", 1)
demand(begin(["spike359TypeTrace": false]) == nil, "type trace must be opt-in")
demand(begin(["text": "NEW"]) == nil, "only the synthetic fixture request is allowed")
demand(begin(["concealed": true]) == nil, "concealed requests cannot be traced")
setenv("RUNNER_ENVIRONMENT", "self-hosted", 1)
demand(begin() == nil, "non-hosted runners cannot trace values")
setenv("RUNNER_ENVIRONMENT", "github-hosted", 1)
demand(begin(["concealed": false]) != nil, "the explicit hosted fixture request must trace")

func trial(_ selection: NSRange, _ actual: String, traced: Bool, settle: Bool = false, refused: Bool = false,
           before: String = "Old draft sentence goes here.") -> [String: Any] {
  let session = traced ? begin() : nil
  if !traced { Spike359Session.active = nil }
  var calls: [String] = [], clock = 0.0, rangeReads = 0
  let reads = ReadbackReads<Int>(focused: { calls.append("focus"); return 7 },
    role: { _ in calls.append("role"); return kAXTextAreaRole },
    subrole: { _ in calls.append("subrole"); return refused ? .value("AXSecureTextField") : .absent },
    value: { _ in calls.append("value"); return rangeReads < (settle ? 3 : 1) ? before : actual },
    valueUnits: { _ in fatalError("concealed value read") },
    range: { _ in calls.append("range"); rangeReads += 1; return settle && rangeReads == 1 ? NSRange(location: 3, length: 0) : selection },
    same: { $0 == $1 }, now: { clock }, sleep: { clock += $0 })
  let units = requested.utf16.map { TypedUnit(text: [$0]) }
  let readback = TypeReadback(units: units, concealed: false, settle: settle, reads: reads)
  for index in units.indices { try! readback.beforeUnit(index) }
  var failed = false
  do { try readback.finish() } catch { failed = true }
  let trace = session?.finish() ?? [:]
  Spike359Session.active = nil
  return ["calls": calls, "failed": failed, "record": readback.record.wire, "trace": trace]
}

var trials: [[String: Any]] = []
for (selection, actual, settle, refused, before) in [
  (NSRange(location: 0, length: 29), requested, false, false, seed),
  (NSRange(location: 3, length: 0), offset3, false, false, seed),
  (NSRange(location: 3, length: 0), requested, false, false, seed),
  (NSRange(location: 0, length: 29), requested, true, false, seed),
  (NSRange(location: 0, length: 29), requested, false, true, seed),
  (NSRange(location: 0, length: 4), requested, false, false, "DO_NOT_RECORD_THIS")
] {
  let plain = trial(selection, actual, traced: false, settle: settle, refused: refused, before: before)
  let traced = trial(selection, actual, traced: true, settle: settle, refused: refused, before: before)
  demand(NSDictionary(dictionary: plain["record"] as! [String: Any]).isEqual(to: traced["record"] as! [String: Any]), "trace changed product read-back metadata")
  demand((plain["calls"] as! [String]) == (traced["calls"] as! [String]), "trace changed the read/wait sequence")
  demand((plain["failed"] as! Bool) == (traced["failed"] as! Bool), "trace changed confirmation behavior")
  trials.append(traced)
}

let field = AXUIElementCreateApplication(getpid()) // an inert handle; no attribute is fetched
let natural = Spike359Session.start(["spike359Trace": true])!
natural.read(field, kAXValueAttribute, seed as CFString, .success, 1)
let naturalTrace = natural.finish()
let candidate = Spike359Session.start(["spike359Mode": "stable50"])!
let candidateTrace = candidate.finish()
let type = begin()!
for value in [seed, requested, offset3, "DO_NOT_RECORD_THIS"] { type.read(field, kAXValueAttribute, value as CFString, .success, 1) }
type.read(field, kAXValueAttribute, nil, .noValue, 1)
let valueTrace = type.finish()

// The real patched Input.swift response/catch suffix runs against a controlled outcome, not the GUI driver.
__RESPONSE_FUNCTION__
__CLICK_FAILURE_FUNCTION__
let success = try response(begin()!, nil) as! [String: Any]
var failure: [String: Any] = [:]
do { _ = try response(begin()!, "typeUnconfirmed") } catch let error as EngineError { failure = error.extra }
var unrelated: [String: Any] = [:]
do { _ = try response(begin()!, "inputSourceChanged") } catch let error as EngineError { unrelated = error.extra }
demand(unexpectedAXReads == 0, "measurement performed additional AX reads")

nonisolated(unsafe) var notificationOutputs: [[String: Any]] = []
func notificationTrials() {
  for script in [ObserverScript(), ObserverScript(written: [3, 0]), ObserverScript(selection: [0, 29], written: [3, 0]),
                 ObserverScript(focused: false), ObserverScript(emit: false), ObserverScript(wrongTarget: true),
                 ObserverScript(createError: .failure), ObserverScript(addError: .notificationUnsupported), ObserverScript(refuse: true)] {
    observerScript = script; observerAdded = 0; observerRemoved = 0; lastObserver = nil
    var calls: [String] = []
    scriptedAX = { _, name in
      calls.append(name)
      if name == kAXRoleAttribute { return kAXTextAreaRole as CFString }
      if name == kAXFocusedAttribute { return NSNumber(value: script.focused) }
      if name == kAXSelectedTextRangeAttribute {
        var range = CFRange(location: script.selection[0], length: script.selection[1])
        return AXValueCreate(.cfRange, &range)
      }
      return nil
    }
    let session = Spike359Session.start(["spike359Mode": "notify-selected"])!
    let field = AXUIElementCreateApplication(getpid())
    session.bind(field)
    let armedBeforeClick = observerAdded
    session.event("synthetic-click")
    if let written = script.written {
      var range = CFRange(location: written[0], length: written[1])
      session.write(field, kAXSelectedTextRangeAttribute, AXValueCreate(.cfRange, &range)!, "write-end", .success)
    }
    let result: [String: Any]
    if script.refuse {
      do { _ = try clickFailure(session); fatalError("the refused click succeeded") }
      catch let error as EngineError {
        demand(error.errorName == "clickUnconfirmed" && error.extra["retained"] as? Bool == true, "refusal lost existing error data")
        result = error.extra["probe359"] as? [String: Any] ?? [:]
      } catch { fatalError("unexpected error") }
    } else { result = session.finish() }
    if let observer = lastObserver {
      demand(!CFRunLoopContainsSource(CFRunLoopGetCurrent(), observer.source, CFRunLoopMode(rawValue: "cua.probe359.selected" as CFString)), "observer source leaked after return")
    }
    notificationOutputs.append(["trace": result, "armedBeforeClick": armedBeforeClick,
      "removed": observerRemoved, "calls": calls])
  }
  scriptedAX = nil; Spike359Session.active = nil
}
let done = DispatchSemaphore(value: 0)
Thread { notificationTrials(); done.signal() }.start()
done.wait()
let output: [String: Any] = ["trials": trials, "natural": naturalTrace, "candidate": candidateTrace,
  "values": valueTrace, "success": success, "failure": failure, "unrelated": unrelated, "notifications": notificationOutputs]
let encoded = try JSONSerialization.data(withJSONObject: output, options: [.sortedKeys])
print(String(data: encoded, encoding: .utf8)!)
`;

// A focused offline Swift harness compiles the real trace and patched #354 implementation, not the engine.
test('typing trace observes existing snapshot/comparison results without changing reads, metadata or click barriers',()=>{
 const root=mkdtempSync(join(tmpdir(),'probe359-type-'));
 try{
  const engine=join(root,'native/engine/Sources/Engine');mkdirSync(engine,{recursive:true});
  for(const name of ['Input.swift','TypeReadback.swift','TypeReadbackSettle.swift','AX.swift','DesktopGate.swift']){
   writeFileSync(join(engine,name),execFileSync('git',['-C',kit,'show',`${pinned}:native/engine/Sources/Engine/${name}`]));
  }
  patch(root);
  const input=readFileSync(join(engine,'Input.swift'),'utf8');
  const typeBody=input.slice(input.indexOf('  func typeText('),input.indexOf('  /// A spike cell',input.indexOf('  func typeText(')));
  const end=typeBody.slice(typeBody.indexOf('                          meta: &meta)')+'                          meta: &meta)'.length);
  const response='func response(_ spike359: Spike359Session, _ failure: String?) throws -> Any {\n let spike359: Spike359Session? = spike359\n let meta = InputMeta()\n do {\n if let failure { throw EngineError(name: failure, "test", extra: ["retained": true]) }\n'+end;
  const click=input.slice(input.indexOf('  func click('),input.indexOf('  // MARK: press_key'));
  const clickFailure='func clickFailure(_ spike359: Spike359Session?) throws -> Any {\n let meta = InputMeta()\n do {\n throw EngineError(name: "clickUnconfirmed", "test", extra: ["retained": true])\n'+click.slice(click.lastIndexOf('    } catch let error as EngineError'));
  writeFileSync(join(root,'main.swift'),swift.replace('__RESPONSE_FUNCTION__',response).replace('__CLICK_FAILURE_FUNCTION__',clickFailure));
  const apiStubs=swift.slice(0,swift.indexOf('// The observer is synthetic'))+swift.slice(swift.indexOf('func monotonicMilliseconds'),swift.indexOf('let seed ='));
  writeFileSync(join(root,'APIStubs.swift'),apiStubs);
  const api=spawnSync('swiftc',['-swift-version','6','-typecheck',join(engine,'TypeReadback.swift'),join(engine,'TypeReadbackSettle.swift'),join(engine,'Spike359.swift'),join(root,'APIStubs.swift')],{encoding:'utf8'});
  assert.equal(api.status,0,api.stderr);
  const built=spawnSync('swiftc',['-swift-version','6',join(engine,'TypeReadback.swift'),join(engine,'TypeReadbackSettle.swift'),join(engine,'Spike359.swift'),join(root,'main.swift'),'-o',join(root,'offline')],{encoding:'utf8'});
  assert.equal(built.status,0,built.stderr);
  const run=spawnSync(join(root,'offline'),[],{encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
  const output=JSON.parse(run.stdout);
  assert.equal(run.stdout.includes('DO_NOT_RECORD_THIS'),false,'unknown AX text must never be serialized');
  assert.equal(run.stdout.includes('Old draft sentence goes here.'),false);
  const identity=(length,isSeed=false,isRequested=false,isOffset3Insertion=false)=>({length,isSeed,isRequested,isOffset3Insertion});
  const events=output.trials.map(t=>t.trace.events);
  for(const [i,trial] of output.trials.entries()){
   assert.equal('barrier' in trial.trace,false,'type sessions must never execute the click barrier');
   assert.equal(events[i].filter(e=>e.kind==='type-snapshot-start').length,1);
   assert.equal(events[i].filter(e=>e.kind==='type-snapshot-end').length,1);
   for(const e of events[i]){assert.equal(typeof e.at,'number');assert.equal(typeof e.monoMs,'number')}
  }
  const snapshots=events.map(es=>es.find(e=>e.kind==='type-snapshot-end'));
  assert.deepEqual(snapshots[0].range,[0,29]);assert.deepEqual(snapshots[0].valueIdentity,identity(29,true));
  assert.deepEqual(snapshots[1].range,[3,0]);assert.deepEqual(snapshots[1].valueIdentity,identity(29,true));
  assert.deepEqual(snapshots[3].range,[0,29],'the trace must report the settled plan, not the first range read');
  assert.equal(snapshots[4].reason,'secure');assert.equal('valueIdentity' in snapshots[4],false);
  assert.deepEqual(events[0].find(e=>e.kind==='type-expect').valueIdentity,identity(6,false,true));
  assert.deepEqual(events[1].find(e=>e.kind==='type-expect').valueIdentity,identity(35,false,false,true));
  assert.deepEqual(events[2].find(e=>e.kind==='type-expect').valueIdentity,identity(35,false,false,true));
  assert.equal(output.trials[2].failed,true);assert.equal(output.trials[0].failed,false);
  assert.deepEqual(output.natural.events.map(e=>e.kind),['click-enter','before-return']);
  assert.equal('barrier' in output.natural,false);assert.equal(output.candidate.barrier.reason,'no-target-or-mode');
  const values=output.values.events.filter(e=>e.kind==='read');
  assert.deepEqual(values.map(e=>e.valueIdentity),[identity(29,true),identity(6,false,true),identity(35,false,false,true),identity(18),identity(null)]);
  assert.deepEqual(output.success.meta,{unchanged:true});assert.ok(output.success.probe359);
  assert.deepEqual(output.failure.meta,{unchanged:true});assert.equal(output.failure.retained,true);assert.ok(output.failure.probe359);
  assert.equal('probe359' in output.unrelated,false);
  const notifications=output.notifications;
  assert.equal(notifications[0].trace.barrier.confirmed,true,'a target callback plus focused/range read must qualify');
  assert.equal(notifications[0].armedBeforeClick,1,'registration must precede click effects');
  assert.equal(notifications[0].removed,1,'successful registration must be removed before returning');
  const receipts=notifications[0].trace.barrier.receipts;
  assert.equal(receipts.length,1);assert.equal(receipts[0].sameTarget,true);
  assert.equal(typeof receipts[0].at,'number');assert.equal(typeof receipts[0].monoMs,'number');
  assert.match(notifications[0].trace.barrier.evidence,/not.*unique|stale|coalesced/i);
  assert.equal(notifications[1].trace.barrier.confirmed,true);
  for(const i of [2,3,4,5,6,7])assert.equal(notifications[i].trace.barrier.confirmed,false,`candidate must refuse scenario ${i}`);
  assert.equal(notifications[2].trace.barrier.reason,'range-mismatch');
  assert.equal(notifications[3].trace.barrier.reason,'not-focused');
  assert.equal(notifications[4].trace.barrier.reason,'notification-timeout');
  assert.equal(notifications[5].trace.barrier.receipts[0].sameTarget,false);
  assert.equal(notifications[6].trace.barrier.registration.createError,-25200);
  assert.equal(notifications[7].trace.barrier.registration.addError,-25207);
  for(const n of notifications.slice(0,6)){assert.equal(n.removed,1);assert.equal(n.trace.barrier.budgetMs,1000)}
  assert.ok(notifications[4].trace.barrier.ms>=900,'a missing receipt must really spend the soft budget');
  assert.equal(notifications[6].removed,0);assert.equal(notifications[7].removed,0);
  assert.equal(notifications[8].trace.barrier.reason,'click-error');
  assert.equal(notifications[8].trace.barrier.clickError,'clickUnconfirmed');assert.equal(notifications[8].removed,1);
  assert.equal(notifications[8].trace.barrier.receipts.length,0,'a refusal must not pump queued callbacks');
 }finally{rmSync(root,{recursive:true,force:true})}
});
