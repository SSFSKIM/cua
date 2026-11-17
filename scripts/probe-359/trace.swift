// Runner-only instrumentation. Type trace derives identities from existing reads, never raw values or new AX reads.
import ApplicationServices
import CoreGraphics
import Foundation

private let spike359SelectedCallback: AXObserverCallback = { _, element, name, refcon in
  guard let refcon else { return }
  Unmanaged<Spike359Session>.fromOpaque(refcon).takeUnretainedValue().selectedNotification(element, name as String)
}

final class Spike359Session {
  nonisolated(unsafe) static var active: Spike359Session?
  let mode: String
  let typeTrace: Bool
  var events: [[String: Any]] = []
  var target: AXUIElement?
  var requestedRange: [Int]?
  private var selectedObserver: AXObserver?
  private var selectedField: AXUIElement?
  private var selectedLoop: CFRunLoop?
  private var selectedRegistered = false
  private var selectedRangeWritten = false
  private var selectedRegistration: [String: Any] = [:]
  private var selectedReceipts: [[String: Any]] = []
  private let selectedMode = CFRunLoopMode(rawValue: "cua.probe359.selected" as CFString)
  init(_ mode: String, typeTrace: Bool = false) { self.mode = mode; self.typeTrace = typeTrace }
  static func start(_ args: [String: Any]) -> Spike359Session? {
    guard ProcessInfo.processInfo.environment["RUNNER_ENVIRONMENT"] == "github-hosted",
          args["spike359Trace"] as? Bool == true || args["spike359Mode"] as? String != nil else { return nil }
    let session = Spike359Session(args["spike359Mode"] as? String ?? "natural")
    active = session
    session.event("click-enter")
    return session
  }
  static func startType(_ args: [String: Any]) -> Spike359Session? {
    guard ProcessInfo.processInfo.environment["RUNNER_ENVIRONMENT"] == "github-hosted",
          args["spike359TypeTrace"] as? Bool == true, args["text"] as? String == "NEW359",
          (args["concealed"] as? NSNumber)?.boolValue != true else { return nil }
    let session = Spike359Session("type", typeTrace: true)
    active = session
    session.event("type-enter")
    return session
  }
  private func valueIdentity(_ value: String?) -> [String: Any] {
    guard let value else { return ["length": NSNull(), "isSeed": false, "isRequested": false, "isOffset3Insertion": false] }
    return ["length": value.utf16.count,
            "isSeed": value.utf16.elementsEqual("Old draft sentence goes here.".utf16),
            "isRequested": value.utf16.elementsEqual("NEW359".utf16),
            "isOffset3Insertion": value.utf16.elementsEqual("OldNEW359 draft sentence goes here.".utf16)]
  }
  func typeSnapshotStart() {
    if typeTrace { event("type-snapshot-start") }
  }
  func typeSnapshotEnd<Element>(_ plan: ReadbackPlan<Element>) {
    guard typeTrace else { return }
    switch plan {
    case .refused(let reason): event("type-snapshot-end", ["outcome": "refused", "reason": reason.rawValue])
    case .expect(_, _, let before, let range, _):
      event("type-snapshot-end", ["outcome": "expect", "range": [range.location, range.length], "valueIdentity": valueIdentity(before)])
    }
  }
  func typeExpect(_ expected: String) {
    if typeTrace { event("type-expect", ["valueIdentity": valueIdentity(expected)]) }
  }
  func event(_ kind: String, _ data: [String: Any] = [:]) {
    var e = data; e["kind"] = kind; e["at"] = Date().timeIntervalSince1970 * 1000
    e["monoMs"] = ProcessInfo.processInfo.systemUptime * 1000; e["seq"] = events.count
    events.append(e)
  }
  func range(_ value: CFTypeRef?) -> [Int]? {
    guard let r = rangeWire(value), let p = r["location"], let n = r["length"] else { return nil }
    return [p, n]
  }
  func write(_ element: AXUIElement, _ name: String, _ value: CFTypeRef, _ kind: String, _ error: AXError?) {
    var data: [String: Any] = ["name": name, "element": CFHash(element)]
    if name == kAXSelectedTextRangeAttribute {
      data["range"] = range(value) as Any? ?? NSNull()
      if mode != "notify-selected" { target = element; requestedRange = range(value) }
      else if let selectedField, CFEqual(selectedField, element) { selectedRangeWritten = true; requestedRange = range(value) }
    }
    if name == kAXFocusedAttribute { data["focused"] = bool(value) as Any? ?? NSNull() }
    if let error { data["error"] = error.rawValue }
    event(kind, data)
  }
  func read(_ element: AXUIElement, _ name: String, _ value: CFTypeRef?, _ error: AXError, _ begun: Double) {
    guard [kAXSelectedTextRangeAttribute, kAXFocusedAttribute, kAXFocusedUIElementAttribute].contains(name) || (typeTrace && name == kAXValueAttribute) else { return }
    var data: [String: Any] = ["name": name, "element": CFHash(element), "error": error.rawValue, "startedAt": begun]
    if name == kAXSelectedTextRangeAttribute { data["range"] = range(value) as Any? ?? NSNull() }
    if name == kAXFocusedAttribute { data["focused"] = bool(value) as Any? ?? NSNull() }
    if typeTrace && name == kAXValueAttribute {
      var text: String?
      if error == .success, let value, CFGetTypeID(value) == CFStringGetTypeID() { text = (value as! String) }
      data["valueIdentity"] = valueIdentity(text)
    }
    event("read", data)
  }
  // Candidates alone pay this ancestry read; baseline and natural trace do not.
  func bind(_ hit: AXUIElement?) {
    var current = hit
    for _ in 0..<100 {
      guard let e = current else { return }
      let role = attribute(e, kAXRoleAttribute) as? String
      if role == "AXSecureTextField" { return }
      if role == kAXTextFieldRole || role == kAXTextAreaRole {
        guard !secureTextField(role: role, subrole: subroleRead(e)) else { return }
        target = e
        if mode == "notify-selected" { armSelected(e) }
        return
      }
      current = elementAttribute(e, kAXParentAttribute)
    }
  }
  // Source, callback and teardown all belong to the synchronous engine worker, never the main run loop.
  private func armSelected(_ field: AXUIElement) {
    guard selectedRegistration.isEmpty else { return }
    selectedField = field
    selectedRegistration = ["startedAt": Date().timeIntervalSince1970 * 1000,
                            "startedMonoMs": ProcessInfo.processInfo.systemUptime * 1000, "element": CFHash(field)]
    defer {
      selectedRegistration["endedAt"] = Date().timeIntervalSince1970 * 1000
      selectedRegistration["endedMonoMs"] = ProcessInfo.processInfo.systemUptime * 1000
      event("notify-selected-registration", selectedRegistration)
    }
    guard !Thread.isMainThread else { selectedRegistration["reason"] = "not-worker-thread"; return }
    AXUIElementSetMessagingTimeout(field, 0.1)
    defer { AXUIElementSetMessagingTimeout(field, elementMessagingTimeout) }
    var owner: pid_t = 0
    let pidError = AXUIElementGetPid(field, &owner)
    selectedRegistration["pidError"] = pidError.rawValue
    guard pidError == .success else { return }
    var observer: AXObserver?
    let createError = AXObserverCreate(owner, spike359SelectedCallback, &observer)
    selectedRegistration["createError"] = createError.rawValue
    guard createError == .success, let observer else { return }
    selectedObserver = observer
    selectedLoop = CFRunLoopGetCurrent()
    let addError = AXObserverAddNotification(observer, field, kAXSelectedTextChangedNotification as CFString,
                                             Unmanaged.passUnretained(self).toOpaque())
    selectedRegistration["addError"] = addError.rawValue
    selectedRegistered = addError == .success
    if selectedRegistered { CFRunLoopAddSource(selectedLoop, AXObserverGetRunLoopSource(observer), selectedMode) }
  }
  func selectedNotification(_ element: AXUIElement, _ name: String) {
    let sameTarget = selectedField.map { CFEqual($0, element) } ?? false
    event("notify-selected-receipt", ["name": name, "element": CFHash(element), "sameTarget": sameTarget])
    selectedReceipts.append(events[events.count - 1])
  }
  func close() {
    guard let observer = selectedObserver else { return }
    if let selectedLoop { CFRunLoopRemoveSource(selectedLoop, AXObserverGetRunLoopSource(observer), selectedMode) }
    if selectedRegistered, let selectedField {
      let error = AXObserverRemoveNotification(observer, selectedField, kAXSelectedTextChangedNotification as CFString)
      selectedRegistration["removeError"] = error.rawValue
      event("notify-selected-remove", ["error": error.rawValue])
    }
    selectedRegistered = false; selectedLoop = nil; selectedObserver = nil
  }
  private func selectedBarrier(refusal: String?) -> [String: Any] {
    let start = ProcessInfo.processInfo.systemUptime * 1000
    var samples = 0, consumed = 0, lastRange: [Int]?
    func elapsed() -> Double { ProcessInfo.processInfo.systemUptime * 1000 - start }
    func result(_ confirmed: Bool, _ reason: String) -> [String: Any] {
      close()
      var output: [String: Any] = ["confirmed": confirmed, "reason": reason, "ms": elapsed(), "samples": samples,
        "budgetMs": 1000, "bound": "soft; 10ms run-loop slices; each AX read capped100ms", "registration": selectedRegistration,
        "receipts": selectedReceipts, "rangeWritten": selectedRangeWritten, "requestedRange": requestedRange as Any? ?? NSNull(),
        "observedRange": lastRange as Any? ?? NSNull(), "evidence": "callback receipt, not a unique acknowledgement; may be stale or coalesced"]
      if let refusal { output["clickError"] = refusal }
      return output
    }
    if refusal != nil { return result(false, "click-error") }
    guard let field = selectedField else { return result(false, "no-target") }
    guard selectedRegistered else { return result(false, selectedRegistration["reason"] as? String ?? "observer-registration-failed") }
    AXUIElementSetMessagingTimeout(field, 0.1)
    defer { AXUIElementSetMessagingTimeout(field, elementMessagingTimeout) }
    var reason = "notification-timeout"
    while elapsed() < 1000 {
      if selectedReceipts.count > consumed {
        let receipts = selectedReceipts[consumed...]
        consumed = selectedReceipts.count
        if receipts.contains(where: { $0["sameTarget"] as? Bool == true && $0["name"] as? String == kAXSelectedTextChangedNotification }) {
          samples += 1
          if bool(attribute(field, kAXFocusedAttribute)) != true { reason = "not-focused" }
          else if let r = range(attribute(field, kAXSelectedTextRangeAttribute)) {
            lastRange = r
            if !selectedRangeWritten || requestedRange == r { return result(true, "notification-and-range") }
            reason = "range-mismatch"
          } else { reason = "range-unreadable" }
        }
      }
      let remaining = 1000 - elapsed()
      if remaining <= 0 { break }
      let status = CFRunLoopRunInMode(selectedMode, min(10, remaining) / 1000, true)
      if status == .finished || status == .stopped { return result(false, "runloop-ended") }
    }
    return result(false, reason)
  }
  func finish(refusal: String? = nil) -> [String: Any] {
    var output: [String: Any] = ["mode": mode]
    if !typeTrace && mode != "natural" { output["barrier"] = mode == "notify-selected" ? selectedBarrier(refusal: refusal) : barrier() }
    event("before-return")
    output["events"] = events
    return output
  }
  // Counterfactual: refusal never retries or rewrites. The driver still selects/types to falsify it.
  func barrier() -> [String: Any] {
    let start = ProcessInfo.processInfo.systemUptime * 1000
    var samples = 0
    func elapsed() -> Double { ProcessInfo.processInfo.systemUptime * 1000 - start }
    guard let field = target, ["reread50", "reread100", "stable50", "stable100"].contains(mode) else {
      return ["confirmed": false, "ms": elapsed(), "reason": "no-target-or-mode", "samples": samples]
    }
    // Bound each new candidate AX read. Natural route's own timeouts remain unchanged.
    AXUIElementSetMessagingTimeout(field, 0.1)
    defer { AXUIElementSetMessagingTimeout(field, elementMessagingTimeout) }
    func snapshot() -> [Int]? {
      samples += 1
      guard bool(attribute(field, kAXFocusedAttribute)) == true,
            let r = range(attribute(field, kAXSelectedTextRangeAttribute)) else { return nil }
      if let requestedRange, r != requestedRange { return nil }
      return r
    }
    let first = snapshot()
    let dwell: Double = mode.hasSuffix("100") ? 100 : 50
    var confirmed = false
    if mode.hasPrefix("reread") {
      usleep(UInt32(dwell * 1000)); let after = snapshot()
      confirmed = first != nil && after == first
    } else {
      var previous = first, since = elapsed()
      while elapsed() < 1000 {
        usleep(10_000)
        let current = snapshot()
        if current == nil || current != previous { since = elapsed() }
        previous = current
        if current != nil && elapsed() - since >= dwell { confirmed = true; break }
      }
    }
    return ["confirmed": confirmed, "ms": elapsed(), "samples": samples, "dwellMs": dwell,
            "budgetMs": 1000, "bound": "soft; each in-flight AX read capped100ms", "initialRange": first as Any? ?? NSNull()]
  }
}
