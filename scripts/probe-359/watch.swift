// Hosted fixture AX observer and isolated-step carrier. Compiling this file does not drive a GUI.
import AppKit
import ApplicationServices
import Foundation

func now359() -> Double { Date().timeIntervalSince1970 * 1000 }
func read359(_ e: AXUIElement, _ name: String) -> CFTypeRef? {
  var value: CFTypeRef?; return AXUIElementCopyAttributeValue(e, name as CFString, &value) == .success ? value : nil
}
func element359(_ value: CFTypeRef?) -> AXUIElement? {
  guard let value, CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
  let e = value as! AXUIElement; AXUIElementSetMessagingTimeout(e, 0.1); return e
}
var field359: AXUIElement?
var window359: AXUIElement?
var title359 = ""
var observer359: AXObserver?
var timer359: Timer?
var events359: [[String: Any]] = []
var pid359: pid_t = 0
var observed359 = false
var registrations359: [[String: Any]] = []
var coverPid359: pid_t = 0
var lastOrder359: Double = 0
func order359() -> [String: Any] {
  let windows = (CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []).filter { ($0[kCGWindowLayer as String] as? Int) == 0 }
  let order = windows.compactMap { w -> [String: Int]? in
    guard let pid = w[kCGWindowOwnerPID as String] as? Int, let id = w[kCGWindowNumber as String] as? Int else { return nil }
    return ["pid": pid, "id": id]
  }
  let b = order.firstIndex { $0["pid"] == Int(pid359) }, c = order.firstIndex { $0["pid"] == Int(coverPid359) }
  return ["order": order, "browserAboveCover": b != nil && c != nil ? (b! < c!) as Any : NSNull()]
}
func event359(_ kind: String, _ extra: [String: Any] = [:]) {
  guard events359.count < 10_000 else { return }
  var e = extra; e["kind"] = kind; e["at"] = now359(); e["monoMs"] = ProcessInfo.processInfo.systemUptime * 1000
  e["seq"] = events359.count; e["frontmostPid"] = NSWorkspace.shared.frontmostApplication?.processIdentifier as Any? ?? NSNull()
  events359.append(e)
}
func sample359() {
  guard let f = field359 else { return }
  if now359() - lastOrder359 >= 50 { lastOrder359 = now359(); event359("window-order", order359()) }
  let started = now359(); var range: [Int]?
  if let value = read359(f, kAXSelectedTextRangeAttribute), CFGetTypeID(value) == AXValueGetTypeID() {
    var r = CFRange(); if AXValueGetValue(value as! AXValue, .cfRange, &r) { range = [r.location, r.length] }
  }
  event359("sample", ["startedAt": started, "range": range as Any? ?? NSNull(), "focused": read359(f, kAXFocusedAttribute) as Any? ?? NSNull()])
}
// pointer-hold model: BEGIN (pure Foundation; pointer-hold.offline.test.mjs compiles this section alone)
// From the first original left-down routed to the bound pid, holds EVERY later event to that pid in arrival order
// (the pointer pair and any keys posted after it), then hands the whole buffer back exactly once.
// Types are CGEventType raw values: 1 leftMouseDown, 2 leftMouseUp, 10 keyDown, 11 keyUp, 12 flagsChanged.
struct PointerHold359<Event> {
  let delayMs: Double, armedAt: Double, limit: Int
  private var held: [Event] = []
  private(set) var captures: [[String: Any]] = []
  private(set) var extras: [[String: Any]] = []
  private(set) var pointerCaptured = 0
  private(set) var keyCaptured = 0
  private(set) var copyFailures = 0
  private(set) var overflow = false
  private(set) var releasedAt: Double?
  private(set) var releaseReason: String?
  private(set) var early = false
  private(set) var releasedCount = 0
  init(delayMs: Double, armedAt: Double, limit: Int = 2000) { self.delayMs = delayMs; self.armedAt = armedAt; self.limit = limit }
  var releaseDueAt: Double? { (captures.first?["at"] as? Double).map { $0 + delayMs } }
  // suppress: drop the original (a copy is held). releaseAt: set once, at the triggering down.
  // overflowed: the buffer passed its limit; the caller releases now (the event is still held, never dropped).
  mutating func observe(type: UInt32, at: Double, sourcePid: Int, copy: () -> Event?) -> (suppress: Bool, releaseAt: Double?, overflowed: Bool) {
    let pointer = type == 1 || type == 2, triggered = !captures.isEmpty
    var why: String?
    if releasedAt != nil { why = pointer ? "after-release" : nil }
    else if !triggered && type != 1 { why = type == 2 ? "up-before-down" : nil }
    else {
      guard let event = copy() else {
        // Cannot hold it: it passes, so FIFO is broken and the stress is not exercised.
        copyFailures += 1; extras.append(["type": Int(type), "at": at, "why": "copy-failed", "sourcePid": sourcePid]); return (false, nil, false)
      }
      held.append(event); captures.append(["type": Int(type), "at": at, "sourcePid": sourcePid])
      if (type == 1 && pointerCaptured == 0) || (type == 2 && pointerCaptured == 1) { pointerCaptured += 1 }
      else if pointer { extras.append(["type": Int(type), "at": at, "why": type == 1 ? "second-down" : "after-pair", "sourcePid": sourcePid]) }
      if type == 10 || type == 11 || type == 12 { keyCaptured += 1 }
      let overflowed = !overflow && captures.count > limit; if overflowed { overflow = true }
      return (true, triggered ? nil : at + delayMs, overflowed)
    }
    if let why { extras.append(["type": Int(type), "at": at, "why": why, "sourcePid": sourcePid]) }
    return (false, nil, false)
  }
  // Returns the held originals, in arrival order, on the first call only.
  mutating func release(at: Double, early: Bool, reason: String) -> [Event] {
    guard releasedAt == nil else { return [] }
    releasedAt = at; releaseReason = reason; self.early = early
    let out = held; held = []; releasedCount = out.count; return out
  }
  var stressExercised: Bool {
    releasedAt != nil && !early && pointerCaptured == 2 && releasedCount == captures.count && copyFailures == 0 && !overflow
  }
  func summary() -> [String: Any] {
    ["delayMs": delayMs, "armedAt": armedAt, "captured": captures.count, "released": releasedCount,
     "pointerCaptured": pointerCaptured, "pointerReleased": releasedAt == nil ? 0 : pointerCaptured, "keyCaptured": keyCaptured,
     "earlyRelease": releasedAt != nil && early, "extraEvents": extras.count, "copyFailures": copyFailures, "overflow": overflow,
     "captures": captures, "extras": extras, "releaseDueAt": releaseDueAt as Any? ?? NSNull(),
     "releasedAt": releasedAt as Any? ?? NSNull(), "releaseReason": releaseReason as Any? ?? NSNull(), "stressExercised": stressExercised]
  }
}
// pointer-hold model: END
var hold359: PointerHold359<CGEvent>?
var holdPid359: pid_t = 0
var holdTap359: CFMachPort?
var holdSource359: CFRunLoopSource?
var holdGeneration359 = 0
var holdError359: String?
var holdSignal359: DispatchSourceSignal?
func closeHoldTap359() {
  if let tap = holdTap359 { CGEvent.tapEnable(tap: tap, enable: false); CFMachPortInvalidate(tap) }
  if let source = holdSource359 { CFRunLoopRemoveSource(CFRunLoopGetMain(), source, .commonModes) }
  holdTap359 = nil; holdSource359 = nil
}
// Idempotent: the tap is disabled and invalidated before the originals are reposted, so they are never seen again.
// That also means events still being posted during the replay reach the pid directly and can overtake the buffer;
// stressExercised is not FIFO proof, and the reader qualifies only producers that finished posting before releasedAt.
func releaseHold359(_ reason: String, early: Bool, generation: Int? = nil) {
  if let generation, generation != holdGeneration359 { return }
  guard hold359 != nil, hold359!.releasedAt == nil else { closeHoldTap359(); return }
  closeHoldTap359()
  let originals = hold359!.release(at: now359(), early: early, reason: reason)
  for event in originals { event.postToPid(holdPid359) }
  event359("pointer-hold-release", ["reason": reason, "early": early, "released": originals.count, "postedAt": now359()])
}
func holdSummary359() -> [String: Any]? {
  guard var s = hold359?.summary() else { return nil }
  s["pid"] = holdPid359; if let holdError359 { s["error"] = holdError359 }; return s
}
let holdCallback359: CGEventTapCallBack = { _, type, event, _ in
  if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
    // Input is no longer filtered: hand back what is held now, marked early.
    holdError359 = type == .tapDisabledByTimeout ? "tap disabled by timeout" : "tap disabled by user input"
    let generation = holdGeneration359
    DispatchQueue.main.async { releaseHold359("tap-disabled", early: true, generation: generation) }
    return Unmanaged.passUnretained(event)
  }
  guard hold359 != nil else { return Unmanaged.passUnretained(event) }
  let at = now359(), sourcePid = Int(event.getIntegerValueField(.eventSourceUnixProcessID))
  let r = hold359!.observe(type: type.rawValue, at: at, sourcePid: sourcePid, copy: { event.copy() })
  let generation = holdGeneration359
  if let releaseAt = r.releaseAt {
    event359("pointer-hold-trigger", ["eventAt": at, "sourcePid": sourcePid])
    DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(Int((releaseAt - at).rounded()))) {
      releaseHold359("timer", early: false, generation: generation)
    }
  }
  if r.overflowed { DispatchQueue.main.async { releaseHold359("overflow", early: true, generation: generation) } }
  return r.suppress ? nil : Unmanaged.passUnretained(event)
}
func armHold359(_ q: [String: Any]) -> String? {
  guard hold359 == nil else { return "pointer hold already armed" }
  guard let delay = (q["delayMs"] as? NSNumber)?.doubleValue, delay >= 1, delay <= 5000 else { return "pointer hold delay invalid" }
  guard field359 != nil, let w = window359, !title359.isEmpty, pid359 > 0,
        (read359(w, kAXTitleAttribute) as? String)?.contains(title359) == true else { return "owned bound window unavailable" }
  var owner: pid_t = 0
  guard AXUIElementGetPid(w, &owner) == .success, owner == pid359 else { return "owned bound window unavailable" }
  // Every event to this pid is seen; nothing is held before the first left-down after arming.
  let mask = CGEventMask.max
  guard let tap = CGEvent.tapCreateForPid(pid: pid359, place: .headInsertEventTap, options: .defaultTap, eventsOfInterest: mask, callback: holdCallback359, userInfo: nil) else { return "pointer hold tap create failed" }
  holdTap359 = tap; holdSource359 = CFMachPortCreateRunLoopSource(nil, tap, 0)
  guard let source = holdSource359 else { closeHoldTap359(); return "pointer hold tap source failed" }
  CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes); CGEvent.tapEnable(tap: tap, enable: true)
  guard CGEvent.tapIsEnabled(tap: tap) else { closeHoldTap359(); return "pointer hold tap enable failed" }
  if holdSignal359 == nil {
    // A SIGTERM while events are held hands them back before the default termination.
    signal(SIGTERM, SIG_IGN)
    let s = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
    s.setEventHandler { releaseHold359("sigterm", early: true); signal(SIGTERM, SIG_DFL); kill(getpid(), SIGTERM) }
    s.resume(); holdSignal359 = s
  }
  holdGeneration359 += 1; holdPid359 = pid359; holdError359 = nil
  hold359 = PointerHold359(delayMs: delay, armedAt: now359())
  event359("pointer-hold-arm", ["delayMs": delay, "pid": Int(pid359)])
  return nil
}
func disarm359() {
  releaseHold359("cleanup", early: true)
  timer359?.invalidate(); timer359 = nil
  if let observer359 { CFRunLoopRemoveSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(observer359), .defaultMode) }
  observer359 = nil; field359 = nil; window359 = nil; title359 = ""; observed359 = false
  hold359 = nil; holdError359 = nil
}
func handle359(_ q: [String: Any]) -> [String: Any] {
  let started = now359(), op = q["op"] as? String ?? ""
  var out: [String: Any] = ["startedAt": started]
  if op == "bind" {
    releaseHold359("rebind", early: true); let previousHold = holdSummary359()
    disarm359(); events359 = []; registrations359 = []
    if let previousHold { out["previousPointerHold"] = previousHold }
    pid359 = (q["pid"] as? NSNumber)?.int32Value ?? 0
    coverPid359 = (q["coverPid"] as? NSNumber)?.int32Value ?? 0
    lastOrder359 = 0
    let app = AXUIElementCreateApplication(pid359); AXUIElementSetMessagingTimeout(app, 0.1)
    let expected = q["title"] as? String ?? ""
    guard expected.hasPrefix("probe354:"), let w = element359(read359(app, kAXFocusedWindowAttribute)),
          (read359(w, kAXTitleAttribute) as? String)?.contains(expected) == true else { return ["error": "visible owner window mismatch", "startedAt": started, "endedAt": now359()] }
    var nodes = [w], i = 0
    while i < nodes.count && i < 5000 {
      let e = nodes[i]; i += 1
      let role = read359(e, kAXRoleAttribute) as? String ?? ""
      let label = [read359(e, kAXTitleAttribute) as? String, read359(e, kAXDescriptionAttribute) as? String].compactMap { $0 }.joined(separator: " ")
      if (role == "AXTextArea" || role == "AXTextField") && (label.contains("Draft control") || label.contains("Message Body")) {
        var subrole: CFTypeRef?
        let err = AXUIElementCopyAttributeValue(e, kAXSubroleAttribute as CFString, &subrole)
        guard err == .success || err == .noValue || err == .attributeUnsupported,
              subrole == nil || CFGetTypeID(subrole!) == CFStringGetTypeID(), (subrole as? String) != "AXSecureTextField" else { break }
        field359 = e; out["element"] = CFHash(e); out["role"] = role; break
      }
      if let list = read359(e, kAXChildrenAttribute) as? [AnyObject] { nodes += list.compactMap { element359($0 as CFTypeRef) } }
    }
    guard let f = field359 else { return ["error": "fixture text field unavailable", "startedAt": started, "endedAt": now359()] }
    window359 = w; title359 = expected
    observed359 = q["observe"] as? Bool == true
    if observed359 {
      var observer: AXObserver?
      let created = AXObserverCreate(pid359, { _, element, notification, _ in event359("notification", ["name": notification as String, "element": CFHash(element)]) }, &observer)
      out["observerCreateError"] = created.rawValue
      if let observer {
        observer359 = observer
        for (element, name) in [(f, kAXSelectedTextChangedNotification), (f, kAXFocusedUIElementChangedNotification), (app, kAXFocusedUIElementChangedNotification)] {
          let error = AXObserverAddNotification(observer, element, name as CFString, nil)
          registrations359.append(["name": name, "element": CFHash(element), "error": error.rawValue])
        }
        CFRunLoopAddSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(observer), .defaultMode)
      }
      timer359 = Timer.scheduledTimer(withTimeInterval: 0.01, repeats: true) { _ in sample359() }
      sample359()
    } else if q["observeWindows"] as? Bool == true {
      // Qualification's background constraint lane observes order without AX range reads.
      timer359 = Timer.scheduledTimer(withTimeInterval: 0.01, repeats: true) { _ in
        if now359() - lastOrder359 >= 50 { lastOrder359 = now359(); event359("window-order", order359()) }
      }
      event359("window-order", order359())
    }
    out["registrations"] = registrations359
  } else if op == "raise" {
    // Setup only: a PID may be foreground while its window is still behind the cover (Firefox's held-focus route).
    guard field359 != nil, let w = window359, !title359.isEmpty,
          (read359(w, kAXTitleAttribute) as? String)?.contains(title359) == true else { return ["error": "owned foreground window unavailable"] }
    let error = AXUIElementPerformAction(w, kAXRaiseAction as CFString)
    out["raiseError"] = error.rawValue; event359("setup-raise", ["error": error.rawValue])
    if error != .success { out["error"] = "owned foreground window raise failed" }
  } else if op == "mutate" {
    guard let f = field359 else { return ["error": "no bound field"] }
    let kind = q["kind"] as? String ?? ""
    // Safari's AXFocused write is known to raise it: it is never an isolation arm.
    guard (kind == "focus-only" && q["browser"] as? String == "cft") || kind == "range-only" || (kind == "press-only" && q["browser"] as? String == "firefox") else { return ["error": "unsupported isolation"] }
    event359("mutation-start", ["name": kind]); var error = AXError.failure
    if kind == "range-only" { var range = CFRange(location: 3, length: 0); error = AXUIElementSetAttributeValue(f, kAXSelectedTextRangeAttribute as CFString, AXValueCreate(.cfRange, &range)!) }
    else if kind == "focus-only" { error = AXUIElementSetAttributeValue(f, kAXFocusedAttribute as CFString, kCFBooleanTrue) }
    else { error = AXUIElementPerformAction(f, kAXPressAction as CFString) }
    event359("mutation-end", ["name": kind, "error": error.rawValue]); out["axError"] = error.rawValue
    if error != .success { out["error"] = "isolated AX step failed" }
  } else if op == "mark" {
    out["windows"] = order359(); out["frontmostPid"] = NSWorkspace.shared.frontmostApplication?.processIdentifier as Any? ?? NSNull(); event359("mark", ["windows": order359()])
  } else if op == "hold-pointer" {
    // Hosted stress only: from the next original left-down, delay every event to the bound pid, in order; inert unless armed here.
    if let error = armHold359(q) { out["error"] = error }
    else { out["pointerHold"] = holdSummary359() }
  } else if op == "stop" {
    releaseHold359("stop", early: true); if let held = holdSummary359() { out["pointerHold"] = held }
    event359("window-order", order359()); event359("stop"); out["events"] = events359; out["registrations"] = registrations359; out["truncated"] = events359.count >= 10_000
    disarm359()
  } else { out["error"] = "unknown operation" }
  out["endedAt"] = now359(); return out
}
if ProcessInfo.processInfo.environment["RUNNER_ENVIRONMENT"] != "github-hosted" { fputs("hosted fixture only\n", stderr); exit(2) }
let frontObserver359 = NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { note in
  if let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication { event359("workspace-activation", ["pid": app.processIdentifier]) }
}
Thread.detachNewThread {
  while let line = readLine() {
    let data = Data(line.utf8)
    DispatchQueue.main.async {
      do { let q = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        let answer = handle359(q)
        print(String(data: try JSONSerialization.data(withJSONObject: answer, options: [.sortedKeys]), encoding: .utf8)!); fflush(stdout)
      } catch { print("{\"error\":\"bad request\"}"); fflush(stdout) }
    }
  }
  // Queued after any pending command: held events are handed back before exit.
  DispatchQueue.main.async { releaseHold359("input-closed", early: true); exit(0) }
}
// Keep the command loop alive even before the first observer or sampling timer is armed.
let keepAlive359 = Port()
RunLoop.current.add(keepAlive359, forMode: .default)
RunLoop.current.run()
