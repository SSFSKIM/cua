// Hosted runner only. Range/identity observations, never AXValue/selected text.
import AppKit
import ApplicationServices
import Foundation
import Darwin

guard ProcessInfo.processInfo.environment["RUNNER_ENVIRONMENT"] == "github-hosted" else { fatalError("hosted runner only") }
func attr(_ e: AXUIElement, _ name: String) -> CFTypeRef? { var v: CFTypeRef?; return AXUIElementCopyAttributeValue(e, name as CFString, &v) == .success ? v : nil }
func element(_ v: CFTypeRef?) -> AXUIElement? { guard let v, CFGetTypeID(v) == AXUIElementGetTypeID() else { return nil }; let e = v as! AXUIElement; AXUIElementSetMessagingTimeout(e, 0.1); return e }
func app(_ pid: pid_t) -> AXUIElement { let e = AXUIElementCreateApplication(pid); AXUIElementSetMessagingTimeout(e, 0.1); return e }
// NSWorkspace's cached foreground app. NSRunningApplication.h: time-varying properties persist until the next turn of
// the main run loop in a common mode, so this is only as fresh as the main run loop's last turn (see `serve`).
func front() -> pid_t? { NSWorkspace.shared.frontmostApplication?.processIdentifier }
typealias GetWindow = @convention(c) (AXUIElement, UnsafeMutablePointer<CGWindowID>) -> AXError
func windowID(_ w: AXUIElement?) -> CGWindowID? {
  guard let w, let p = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "_AXUIElementGetWindow") else { return nil }
  var id: CGWindowID = 0; let f = unsafeBitCast(p, to: GetWindow.self)
  return f(w, &id) == .success && id > 0 ? id : nil
}
func identity(_ pid: pid_t) -> [String: Any] {
  let a = app(pid), w = element(attr(a, kAXFocusedWindowAttribute))
  return ["windowTitle": w.flatMap { attr($0, kAXTitleAttribute) as? String } as Any? ?? NSNull(),
    "windowID": windowID(w) as Any? ?? NSNull(), "frontmostPid": front() as Any? ?? NSNull(), "at": now()]
}
var retained: AXUIElement?, retainedPid: pid_t = 0
func rangeRead(_ pid: pid_t, bind: Bool) -> [String: Any] {
  let started = now(), f = element(attr(app(pid), kAXFocusedUIElementAttribute))
  if bind { retained = f; retainedPid = pid }
  var result: [String: Any] = ["startedAt": started, "range": NSNull(), "sameFocused": false, "valueRead": false]
  guard let kept = retained, retainedPid == pid else { result["error"] = "no retained field"; return result }
  result["sameFocused"] = f.map { CFEqual($0, kept) } ?? false
  result["fieldHash"] = String(CFHash(kept))
  var rawRole: CFTypeRef?, rawSubrole: CFTypeRef?
  let roleCode = AXUIElementCopyAttributeValue(kept, kAXRoleAttribute as CFString, &rawRole)
  let subCode = AXUIElementCopyAttributeValue(kept, kAXSubroleAttribute as CFString, &rawSubrole)
  let role = rawRole as? String, sub = rawSubrole as? String
  result["role"] = role as Any? ?? NSNull(); result["subrole"] = sub as Any? ?? NSNull()
  result["roleError"] = roleCode.rawValue; result["subroleError"] = subCode.rawValue
  let secure = [role, sub].compactMap { $0 }.contains { $0.lowercased().contains("secure") || $0.lowercased().contains("password") }
  guard !secure, let role, ["AXTextField", "AXTextArea"].contains(role),
        (subCode == .noValue || subCode == .attributeUnsupported || (subCode == .success && sub != nil)) else {
    result["error"] = "unreadable, secure or non-text-entry identifiers"; return result
  }
  var raw: CFTypeRef?
  let code = AXUIElementCopyAttributeValue(kept, kAXSelectedTextRangeAttribute as CFString, &raw)
  result["axError"] = code.rawValue; result["shape"] = "missing"
  if code == .success, let raw {
    result["shape"] = "wrongType"
    if CFGetTypeID(raw) == AXValueGetTypeID(), AXValueGetType(raw as! AXValue) == .cfRange {
      var r = CFRange(); if AXValueGetValue(raw as! AXValue, .cfRange, &r) {
        result["shape"] = "range"; result["rawRange"] = [String(r.location), String(r.length)]
        if r.location >= 0 && r.length >= 0 && r.location <= 9_007_199_254_740_991 && r.length <= 9_007_199_254_740_991 { result["range"] = [r.location, r.length] }
      }
    } else if CFGetTypeID(raw) == AXValueGetTypeID(), AXValueGetType(raw as! AXValue) == .axError {
      var embedded = AXError.success
      if AXValueGetValue(raw as! AXValue, .axError, &embedded) { result["shape"] = "axError"; result["embeddedError"] = embedded.rawValue }
    }
  }
  result["endedAt"] = now(); return result
}
// logic:begin (side.test.mjs compiles this region verbatim: Foundation only, no AppKit, AX or window access)
func mono() -> Double { Double(DispatchTime.now().uptimeNanoseconds) / 1e6 }
/// Optional watch-start intervalMs: absent means the legacy 20 ms, anything else must be a finite number in [2, 100].
func watchInterval(_ raw: Any?) throws -> Double {
  guard let raw else { return 20 }
  guard let n = raw as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID(), n.doubleValue.isFinite, n.doubleValue >= 2, n.doubleValue <= 100 else {
    throw NSError(domain: "intervalMs must be a number from 2 to 100", code: 1)
  }
  return n.doubleValue
}
/// CGWindowListCreate's elements are the raw CGWindowID values stored as pointers (null callbacks), not CF objects.
func idsFromList(from list: CFArray) -> [UInt32] {
  (0..<CFArrayGetCount(list)).compactMap { i in CFArrayGetValueAtIndex(list, i).flatMap { UInt32(exactly: UInt(bitPattern: $0)) } }
}
/// ids are front to back. Both windows must be present for the order to be readable.
func orderObservation(_ ids: [UInt32], target: UInt32, cover: UInt32) -> (readable: Bool, above: Bool?) {
  guard let t = ids.firstIndex(of: target), let c = ids.firstIndex(of: cover) else { return (false, nil) }
  return (true, t < c)
}
func percentiles(_ values: [Double]) -> [String: Any] {
  guard !values.isEmpty else { return ["n": 0] }
  let v = values.sorted(), rank = { (p: Double) in v[max(0, Int((p * Double(v.count)).rounded(.up)) - 1)] }
  return ["n": v.count, "p50": rank(0.5), "p95": rank(0.95), "max": v[v.count - 1]]
}
/// Actual cadence evidence from monotonic query times. gap: start to start; blind: previous query's end to this query's
/// start (nothing observed); span: previous start to this end (the most the order could have changed unseen).
func observationSummary(_ obs: [(start: Double, end: Double)]) -> [String: Any] {
  let pairs = Array(zip(obs, obs.dropFirst()))
  return ["samples": obs.count, "queryMs": percentiles(obs.map { $0.end - $0.start }),
    "gapMs": percentiles(pairs.map { $1.start - $0.start }), "blindMs": percentiles(pairs.map { $1.start - $0.end }),
    "spanMs": percentiles(pairs.map { $1.end - $0.start })]
}
// logic:end
/// CGWindowListCreate is CF_SWIFT_UNAVAILABLE ("No replacement at present"), so it is resolved by name. It returns the
/// on-screen CGWindowIDs front to back, without the per-window dictionaries CGWindowListCopyWindowInfo builds.
typealias WindowListCreate = @convention(c) (CGWindowListOption, CGWindowID) -> Unmanaged<CFArray>?
let windowListCreate: WindowListCreate? = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "CGWindowListCreate").map { unsafeBitCast($0, to: WindowListCreate.self) }
/// The requested interval is a timer target, never a resolution guarantee: each sample carries its own query start/end
/// times and the stop summary reports the gaps actually achieved, so blind intervals are measured, not assumed.
final class Watch: @unchecked Sendable {
  var queue = DispatchQueue(label: "probe360.watch")
  var timer: DispatchSourceTimer?, samples: [[String: Any]] = [], obs: [(start: Double, end: Double)] = []
  var target: CGWindowID = 0, cover: CGWindowID = 0, intervalMs = 20.0, requestedFast = false, fast = false
  var source = "windowInfoDictionaries", fallbackReason: Any = NSNull()
  let beat: Beat
  init(beat: Beat) { self.beat = beat }
  func windowIDs() -> [UInt32] {
    if fast, let create = windowListCreate { return create([.optionOnScreenOnly], kCGNullWindowID).map { idsFromList(from: $0.takeRetainedValue()) } ?? [] }
    let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
    return list.compactMap { ($0[kCGWindowNumber as String] as? NSNumber)?.uint32Value }
  }
  func sample(_ reason: String) {
    // Foreground and order are separate reads; each is stamped so they are not taken as contemporaneous.
    // The heartbeat age is taken with the foreground read, before the (possibly long) window query: it bounds that read's
    // staleness. A later heartbeat must not make an older foreground observation look cache-fresh.
    let frontAt = now(), age = beat.ageMs, pid = front(), qStart = now(), qMono = mono()
    let ids = windowIDs(), qEnd = now(), qEndMono = mono()
    let o = orderObservation(ids, target: target, cover: cover)
    var s: [String: Any] = ["at": qEnd, "reason": reason, "seq": samples.count, "frontAt": frontAt, "frontmostPid": pid as Any? ?? NSNull(),
      "queryStartedAt": qStart, "queryEndedAt": qEnd, "queryMs": qEndMono - qMono, "mainLoopAgeMs": age, "mainLoopAgeAtQueryEndMs": beat.ageMs,
      "orderReadable": o.readable, "targetAboveCover": o.above as Any? ?? NSNull()]
    if let last = obs.last { s["gapMs"] = qMono - last.start; s["blindMs"] = qMono - last.end; s["spanMs"] = qEndMono - last.start }
    samples.append(s); obs.append((qMono, qEndMono))
  }
  func start(_ target: CGWindowID, _ cover: CGWindowID, intervalMs: Double, fastIDs: Bool) {
    queue.sync { timer?.cancel(); timer = nil }
    // Legacy keeps its default-QoS queue; the fast watcher takes the top class so a tight cadence is serviceable.
    queue = fastIDs ? DispatchQueue(label: "probe360.watch.fast", qos: .userInteractive) : DispatchQueue(label: "probe360.watch")
    queue.sync {
      self.target = target; self.cover = cover; self.intervalMs = intervalMs; samples = []; obs = []
      requestedFast = fastIDs; fast = fastIDs && windowListCreate != nil
      source = fast ? "CGWindowListCreate:ids" : "windowInfoDictionaries"
      fallbackReason = fastIDs && !fast ? "CGWindowListCreate unavailable via dlsym" as Any : NSNull()
      sample("start")
      let t = DispatchSource.makeTimerSource(flags: fastIDs ? [.strict] : [], queue: queue)
      let period = DispatchTimeInterval.nanoseconds(Int(intervalMs * 1e6))
      t.schedule(deadline: fastIDs ? .now() + period : .now(), repeating: period)
      t.setEventHandler { self.sample("timer") }; timer = t; t.resume()
    }
  }
  func info() -> [String: Any] { ["intervalMs": intervalMs, "requestedFastIDs": requestedFast, "source": source, "fallbackReason": fallbackReason] }
  func stop() -> [String: Any] {
    queue.sync {
      timer?.cancel(); timer = nil; sample("stop")
      var r = info(); r["complete"] = true; r["samples"] = samples; r["summary"] = observationSummary(obs)
      return r
    }
  }
}
// serve:begin (side.test.mjs compiles this region verbatim: Foundation only, no AppKit or AX)
func now() -> Double { Date().timeIntervalSince1970 * 1000 }
/// Heartbeat of the main run loop. Watch samples carry its age, so a main thread that stopped turning shows in the data.
final class Beat: @unchecked Sendable {
  private let lock = NSLock()
  private var last = now(), turns = 0
  func tick() { lock.lock(); last = now(); turns += 1; lock.unlock() }
  var count: Int { lock.lock(); defer { lock.unlock() }; return turns }
  var ageMs: Double { lock.lock(); defer { lock.unlock() }; return now() - last }
}
/// Serial JSON-lines server: one request is read, answered and flushed before the next is read. The main thread never
/// blocks on stdin or on a request. It turns its run loop for the life of the process, which is what refreshes
/// NSWorkspace/NSRunningApplication's cached foreground state for the watch timer's reads. Requests run on one
/// dedicated thread, so a slow AX read cannot park the main run loop either.
func serve(beat: Beat, handle: @escaping (String) -> String?) -> Never {
  let requests = Requests(handle)
  requests.name = "probe360.requests"; requests.stackSize = 4 << 20; requests.start()
  RunLoop.main.add(Timer(timeInterval: 0.005, repeats: true) { _ in beat.tick() }, forMode: .common)
  beat.tick()
  while true { RunLoop.main.run(mode: .default, before: .distantFuture) }
}
final class Requests: Thread, @unchecked Sendable {
  let handle: (String) -> String?
  init(_ handle: @escaping (String) -> String?) { self.handle = handle; super.init() }
  override func main() {
    while let line = readLine() { if let answer = handle(line) { print(answer); fflush(stdout) } }
    Foundation.exit(0)
  }
}
// serve:end
let beat = Beat(), watch = Watch(beat: beat)
func respond(_ line: String) -> String? {
  var answer: [String: Any] = ["startedAt": now()]
  do {
    let q = try JSONSerialization.jsonObject(with: Data(line.utf8)) as! [String: Any]
    let pid = (q["pid"] as? NSNumber)?.int32Value ?? 0
    switch q["op"] as? String {
    case "front":
      // SETUP ONLY. There is no activation operation while the watch is armed.
      let activate = q["activate"] as? Bool ?? false
      if activate {
        guard watch.timer == nil else { throw NSError(domain: "activation during watch", code: 1) }
        answer["activationAccepted"] = DispatchQueue.main.sync { NSRunningApplication(processIdentifier: pid)?.activate(options: []) ?? false }
        // The main run loop is turning on its own thread, so front() refreshes while this request polls it.
        let deadline = Date().addingTimeInterval(2)
        while front() != pid && Date() < deadline { Thread.sleep(forTimeInterval: 0.01) }
      }
      answer.merge(identity(pid)) { _, n in n }; answer["ok"] = front() == pid
    case "window-title": answer.merge(identity(pid)) { _, n in n }
    case "bind", "range": answer.merge(rangeRead(pid, bind: q["op"] as? String == "bind")) { _, n in n }
    case "watch-start":
      guard let t = q["targetWindow"] as? UInt32, let c = q["coverWindow"] as? UInt32, t > 0, c > 0 else { throw NSError(domain: "window ids missing", code: 1) }
      // Optional: intervalMs (default 20) and fastIDs (default false) keep the original spike behavior when absent.
      let interval = try watchInterval(q["intervalMs"]), fast = q["fastIDs"] as? Bool ?? false
      watch.start(t, c, intervalMs: interval, fastIDs: fast); answer["ok"] = true; answer.merge(watch.info()) { _, n in n }
    case "watch-stop": answer.merge(watch.stop()) { _, n in n }
    default: answer["error"] = "unknown side operation"
    }
  } catch { answer["error"] = String(describing: error) }
  answer["endedAt"] = now()
  guard let data = try? JSONSerialization.data(withJSONObject: answer, options: [.sortedKeys]) else { return nil }
  return String(data: data, encoding: .utf8)
}
serve(beat: beat) { respond($0) }
