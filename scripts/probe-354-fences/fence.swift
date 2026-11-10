// Runner-only #354 fence spike, copied into a scratch build of the pinned engine by patch.mjs. Never product code.
// press_key `spike354Fence`: "marker" posts F20 behind the key (no wait: a page acknowledges it, the harness waits);
// "ax" registers an AXObserver before posting and waits, soft 1000 ms, for a selected-text change arriving after the
// first event was posted. type_text `spike354Readback: "exact"` snapshots the focused field immediately before posting
// and polls, soft 1000 ms, for its value to equal the snapshot with the selection replaced by the typed text.
import ApplicationServices
import Foundation

func fence354Now() -> Double { Date().timeIntervalSince1970 * 1000 }
let fence354BudgetMs = 1000.0
let fence354AXTimeout: Float = 0.1

struct Fence354Arrival: @unchecked Sendable {
  let name: String
  let element: AXUIElement
  let at: Double
  let source: String
}

final class Fence354Box: @unchecked Sendable {
  let source: String
  let lock = NSLock()
  var received: [Fence354Arrival] = []
  init(_ source: String) { self.source = source }
}

private let fence354Callback: AXObserverCallback = { _, element, name, refcon in
  guard let refcon else { return }
  let box = Unmanaged<Fence354Box>.fromOpaque(refcon).takeUnretainedValue()
  let arrival = Fence354Arrival(name: name as String, element: element, at: fence354Now(), source: box.source)
  box.lock.lock()
  box.received.append(arrival)
  box.lock.unlock()
}

private struct Fence354Removal: @unchecked Sendable {
  let observer: AXObserver
  let registrations: [(AXUIElement, String, UnsafeMutableRawPointer)]
  let refcons: [UnsafeMutableRawPointer]

  func remove() {
    for (element, name, _) in registrations { AXObserverRemoveNotification(observer, element, name as CFString) }
    CFRunLoopRemoveSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(observer), .commonModes)
    for refcon in refcons { Unmanaged<Fence354Box>.fromOpaque(refcon).release() }
  }
}

func fence354Range(_ element: AXUIElement) -> [Int]? {
  guard let raw = attribute(element, kAXSelectedTextRangeAttribute), CFGetTypeID(raw) == AXValueGetTypeID() else { return nil }
  var range = CFRange()
  guard AXValueGetValue(raw as! AXValue, .cfRange, &range) else { return nil }
  return [range.location, range.length]
}

func fence354Null(_ value: Any?) -> Any { value ?? NSNull() }

/// One observer for one key: the app element (selected text, value, focus and menu traffic) and the focused field
/// (selected text), its run-loop source on the main run loop the engine's NSApplication turns, as Monitor.swift's.
final class Fence354Observer {
  private var observer: AXObserver?
  private let appBox = Fence354Box("app"), fieldBox = Fence354Box("field")
  private let appRefcon: UnsafeMutableRawPointer, fieldRefcon: UnsafeMutableRawPointer
  private var registered: [(AXUIElement, String, UnsafeMutableRawPointer)] = []
  private var closed = false
  private(set) var wire: [[String: Any]] = []
  private(set) var selectionRegistered = false
  private(set) var registerMs = 0.0
  private(set) var createError = 0

  init(pid: pid_t) {
    let start = fence354Now()
    appRefcon = Unmanaged.passRetained(appBox).toOpaque()
    fieldRefcon = Unmanaged.passRetained(fieldBox).toOpaque()
    let application = AXUIElementCreateApplication(pid)
    AXUIElementSetMessagingTimeout(application, fence354AXTimeout)
    var created: AXObserver?
    let error = AXObserverCreate(pid, fence354Callback, &created)
    createError = Int(error.rawValue)
    if error == .success, let created {
      observer = created
      let appNames = [kAXSelectedTextChangedNotification, kAXValueChangedNotification, kAXFocusedUIElementChangedNotification,
                      kAXMenuItemSelectedNotification, kAXMenuOpenedNotification]
      for name in appNames { add(created, application, name, appRefcon, target: "app") }
      if let field = elementAttribute(application, kAXFocusedUIElementAttribute) {
        AXUIElementSetMessagingTimeout(field, fence354AXTimeout)
        var owner: pid_t = 0
        AXUIElementGetPid(field, &owner)
        add(created, field, kAXSelectedTextChangedNotification, fieldRefcon, target: "field",
            extra: ["role": fence354Null(stringAttribute(field, kAXRoleAttribute)), "ownerPid": Int(owner)])
      } else {
        wire.append(["target": "field", "error": "noFocusedElement"])
      }
      CFRunLoopAddSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(created), .commonModes)
      CFRunLoopWakeUp(CFRunLoopGetMain())
    }
    registerMs = fence354Now() - start
  }

  private func add(_ observer: AXObserver, _ element: AXUIElement, _ name: String, _ refcon: UnsafeMutableRawPointer, target: String,
                   extra: [String: Any] = [:]) {
    let error = AXObserverAddNotification(observer, element, name as CFString, refcon)
    var entry: [String: Any] = ["target": target, "name": name, "error": Int(error.rawValue)]
    entry.merge(extra) { a, _ in a }
    wire.append(entry)
    if error == .success {
      registered.append((element, name, refcon))
      if name == kAXSelectedTextChangedNotification { selectionRegistered = true }
    }
  }

  func drain() -> [Fence354Arrival] {
    var all: [Fence354Arrival] = []
    for box in [appBox, fieldBox] {
      box.lock.lock()
      all += box.received
      box.received = []
      box.lock.unlock()
    }
    return all.sorted { $0.at < $1.at }
  }

  func close() {
    guard !closed else { return }
    closed = true
    guard let observer else {
      Unmanaged<Fence354Box>.fromOpaque(appRefcon).release()
      Unmanaged<Fence354Box>.fromOpaque(fieldRefcon).release()
      return
    }
    let removal = Fence354Removal(observer: observer, registrations: registered, refcons: [appRefcon, fieldRefcon])
    if Thread.isMainThread { removal.remove() } else { DispatchQueue.main.async { removal.remove() } }
  }
}

/// press_key's fence: created before the route's activation hold, so its traffic shows as pre-post.
final class Fence354Key {
  let mode: String
  let pid: pid_t
  private var observer: Fence354Observer?
  private var prePost: [Fence354Arrival] = []
  private var createdAt = 0.0, postStartedAt = 0.0, postEndedAt = 0.0

  init(_ args: [String: Any], pid: pid_t) {
    mode = args["spike354Fence"] as? String ?? "none"
    self.pid = pid
    createdAt = fence354Now()
    if mode == "ax" { observer = Fence354Observer(pid: pid) }
  }

  func willPost() {
    postStartedAt = fence354Now()
    prePost = observer?.drain() ?? []
  }

  private func arrivals(_ list: [Fence354Arrival], limit: Int = 30) -> [[String: Any]] {
    list.prefix(limit).map { ["name": $0.name, "source": $0.source, "at": $0.at, "afterPostStartMs": $0.at - postStartedAt] }
  }

  func didPost(poster: EventPoster) -> [String: Any] {
    postEndedAt = fence354Now()
    var wire: [String: Any] = ["mode": mode, "createdAt": createdAt, "keyPostStartedAt": postStartedAt, "keyPostEndedAt": postEndedAt]
    if mode == "marker" {
      let at = fence354Now()
      var posted = true
      for spec in keyPressEvents(KeyPress(keyCode: 0x5A, modifiers: [])) { posted = poster.post(spec) && posted }  // F20
      wire["marker"] = ["key": "F20", "postedAt": at, "postEndedAt": fence354Now(), "posted": posted]
      return wire
    }
    guard mode == "ax", let observer else { return wire }
    wire["registrations"] = observer.wire
    wire["registerMs"] = observer.registerMs
    wire["observerCreateError"] = observer.createError
    wire["prePost"] = arrivals(prePost)
    wire["prePostCount"] = prePost.count
    wire["budgetMs"] = fence354BudgetMs
    wire["budgetKind"] = "soft: 1 ms drains of callback arrivals, no AX request while waiting"
    guard observer.selectionRegistered else {
      // No registration for the effect's notification: nothing can acknowledge it, so it is refused before text.
      wire["confirmed"] = false
      wire["status"] = "keyUnconfirmed"
      wire["reason"] = "notificationUnsupported"
      wire["fenceMs"] = 0
      return wire
    }
    var seen: [Fence354Arrival] = []
    var accepted: Fence354Arrival?
    repeat {
      for arrival in observer.drain() {
        seen.append(arrival)
        if accepted == nil, fence354Accepts(name: arrival.name, arrivedAt: arrival.at, postStartedAt: postStartedAt) { accepted = arrival }
      }
      if accepted != nil { break }
      usleep(1000)
    } while fence354Now() - postEndedAt < fence354BudgetMs
    let ended = fence354Now()
    wire["arrivals"] = arrivals(seen)
    wire["arrivalCount"] = seen.count
    wire["waitedMs"] = ended - postEndedAt
    wire["confirmed"] = accepted != nil
    wire["status"] = accepted != nil ? "confirmed" : "keyUnconfirmed"
    wire["reason"] = accepted != nil ? NSNull() : "noNotificationWithinBudget"
    wire["fenceMs"] = (accepted?.at ?? ended) - postEndedAt
    if let accepted {
      // Evidence only, never the predicate: who sent it and the focused range right after (role and range, no value).
      let readStart = fence354Now()
      AXUIElementSetMessagingTimeout(accepted.element, fence354AXTimeout)
      wire["ackSource"] = accepted.source
      wire["ackAt"] = accepted.at
      wire["ackRole"] = fence354Null(stringAttribute(accepted.element, kAXRoleAttribute))
      let application = AXUIElementCreateApplication(pid)
      AXUIElementSetMessagingTimeout(application, fence354AXTimeout)
      if let field = elementAttribute(application, kAXFocusedUIElementAttribute) {
        AXUIElementSetMessagingTimeout(field, fence354AXTimeout)
        wire["rangeAfterAck"] = fence354Null(fence354Range(field))
      }
      wire["postAckReadMs"] = fence354Now() - readStart
    }
    return wire
  }

  func close() { observer?.close() }
}

/// type_text's exact readback, its snapshot taken immediately before the first text event is posted.
final class Fence354Readback {
  let active: Bool
  private let pid: pid_t
  private let text: String
  private var field: AXUIElement?
  private var role: String?
  private var subrole: Fence354Subrole = .absent
  private var secure = true
  private var value: String?
  private var range: [Int]?
  private var plan: Fence354Plan = .refused("inactive")
  private var snapshotAt = 0.0, snapshotMs = 0.0

  init(_ args: [String: Any], pid: pid_t, text: String, concealed: Bool) {
    active = (args["spike354Readback"] as? String) == "exact"
    self.pid = pid
    self.text = text
    guard active else { return }
    let start = fence354Now()
    defer { snapshotAt = fence354Now(); snapshotMs = snapshotAt - start }
    // The order (concealed reads nothing; role and subrole before any value or range) is logic.swift's, checked offline.
    let snapshot = fence354Snapshot(concealed: concealed, typed: text, focused: { () -> AXUIElement? in
      let application = AXUIElementCreateApplication(pid)
      AXUIElementSetMessagingTimeout(application, fence354AXTimeout)
      guard let field = elementAttribute(application, kAXFocusedUIElementAttribute) else { return nil }
      AXUIElementSetMessagingTimeout(field, fence354AXTimeout)
      return field
    }, role: { stringAttribute($0, kAXRoleAttribute) }, subrole: { field in
      let (raw, error) = copyAttribute(field, kAXSubroleAttribute)
      if error == .success {
        if let raw, CFGetTypeID(raw) == CFStringGetTypeID() { return .value(raw as! String) }
        return .failed
      }
      return error == .noValue || error == .attributeUnsupported ? .absent : .failed
    }, value: { stringAttribute($0, kAXValueAttribute) }, range: { fence354Range($0) })
    field = snapshot.element
    role = snapshot.role
    subrole = snapshot.subrole
    secure = snapshot.secure
    value = snapshot.value
    range = snapshot.range
    plan = snapshot.plan
  }

  func confirm() -> [String: Any] {
    guard active else { return ["active": false] }
    let subroleWire: Any
    switch subrole {
    case .value(let found): subroleWire = found
    case .absent: subroleWire = NSNull()
    case .failed: subroleWire = "unreadable"
    }
    var wire: [String: Any] = [
      "active": true, "role": fence354Null(role), "subrole": subroleWire, "secure": secure, "focused": field != nil,
      "snapshotAt": snapshotAt, "snapshotMs": snapshotMs, "budgetMs": fence354BudgetMs, "perAXTimeoutMs": Double(fence354AXTimeout) * 1000,
      "budgetKind": "soft: 5 ms polls of the snapshotted field plus one in-flight AX request",
      "before": fence354Null(fence354Reported(plan, value)), "beforeRange": plan.reportsValues ? fence354Null(range) : NSNull(),
    ]
    guard case .expect(let expected) = plan, let field else {
      wire["confirmed"] = false
      wire["status"] = "typeUnconfirmed"
      wire["reason"] = fence354Null(plan.reason)
      wire["expected"] = NSNull()
      wire["actual"] = NSNull()
      wire["readbackMs"] = 0
      wire["reads"] = 0
      return wire
    }
    let start = fence354Now()
    var reads = 0
    var actual: String?
    var matched = false
    repeat {
      reads += 1
      actual = stringAttribute(field, kAXValueAttribute)
      if actual == expected { matched = true; break }
      usleep(5000)
    } while fence354Now() - start < fence354BudgetMs
    let ended = fence354Now()
    let application = AXUIElementCreateApplication(pid)
    AXUIElementSetMessagingTimeout(application, fence354AXTimeout)
    let focusedNow = elementAttribute(application, kAXFocusedUIElementAttribute)
    wire["expected"] = expected
    wire["actual"] = fence354Null(fence354Reported(plan, actual))
    wire["actualRange"] = fence354Null(fence354Range(field))
    wire["expectedCaret"] = [(range?[0] ?? 0) + (text as NSString).length, 0]  // evidence only; the predicate is the value
    wire["focusRetained"] = focusedNow.map { CFEqual($0, field) } ?? false
    wire["confirmed"] = matched
    wire["status"] = matched ? "confirmed" : "typeUnconfirmed"
    wire["reason"] = matched ? NSNull() : (actual == nil ? "actualUnreadable" : "valueMismatch")
    wire["readbackMs"] = ended - start
    wire["matchedAt"] = matched ? ended : NSNull()
    wire["reads"] = reads
    wire["overrunMs"] = max(0, ended - start - fence354BudgetMs)
    return wire
  }
}
