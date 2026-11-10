// Runner-only instrumentation. No values are read or recorded. Natural trace adds no AX read.
import ApplicationServices
import CoreGraphics
import Foundation

final class Spike359Session {
  nonisolated(unsafe) static var active: Spike359Session?
  let mode: String
  var events: [[String: Any]] = []
  var target: AXUIElement?
  var requestedRange: [Int]?
  init(_ mode: String) { self.mode = mode }
  static func start(_ args: [String: Any]) -> Spike359Session? {
    guard ProcessInfo.processInfo.environment["RUNNER_ENVIRONMENT"] == "github-hosted",
          args["spike359Trace"] as? Bool == true || args["spike359Mode"] as? String != nil else { return nil }
    let session = Spike359Session(args["spike359Mode"] as? String ?? "natural")
    active = session
    session.event("click-enter")
    return session
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
      target = element; requestedRange = range(value)
    }
    if name == kAXFocusedAttribute { data["focused"] = bool(value) as Any? ?? NSNull() }
    if let error { data["error"] = error.rawValue }
    event(kind, data)
  }
  func read(_ element: AXUIElement, _ name: String, _ value: CFTypeRef?, _ error: AXError, _ begun: Double) {
    guard [kAXSelectedTextRangeAttribute, kAXFocusedAttribute, kAXFocusedUIElementAttribute].contains(name) else { return }
    var data: [String: Any] = ["name": name, "element": CFHash(element), "error": error.rawValue, "startedAt": begun]
    if name == kAXSelectedTextRangeAttribute { data["range"] = range(value) as Any? ?? NSNull() }
    if name == kAXFocusedAttribute { data["focused"] = bool(value) as Any? ?? NSNull() }
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
        target = e; return
      }
      current = elementAttribute(e, kAXParentAttribute)
    }
  }
  func finish() -> [String: Any] {
    var output: [String: Any] = ["mode": mode]
    if mode != "natural" { output["barrier"] = barrier() }
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
