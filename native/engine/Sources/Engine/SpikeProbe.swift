import AppKit
import ApplicationServices
import Foundation

// The spike-only `probe_spike` method (the second measurement sitting; the spec's Design, "Input", and the Decision Log's
// delegated unknowns): `{op, app, ...}`, the app resolved as every method resolves it (bundle id, path, name, or pid),
// which the facade never sends. Three ops, each a read or route 3's own activation, never an action:
//
//   activationPoint  the primary window's AXActivationPoint (read whether or not the window lists it), the window's
//                    frame, and what the AX hit-test finds at the point: where route 3's activation click lands.
//   activate         route 3's activation exactly as a route-3 action runs it (the believed-focus check, the guarded
//                    pair, the deactivation after) with no action event between, so its side effects can be measured
//                    alone.
//   selection        the primary window's first text element (an AXTextArea, else the first AXTextField, depth first,
//                    bounded); with `set: {location, length}` its AXSelectedTextRange set first; the range read back.
//
// Nothing here returns a title, a value or a description: roles, pids, geometry, ranges and AXError codes only.

/// The most elements the selection walk visits.
let selectionWalkLimit = 3000

extension Engine {
  func probeSpike(_ params: [String: Any], receivedAt: Int64) throws -> [String: Any] {
    guard let op = params["op"] as? String, ["activationPoint", "activate", "selection"].contains(op) else {
      throw EngineError.invalidArguments("probe_spike needs op \"activationPoint\", \"activate\" or \"selection\"")
    }
    let range = op == "selection" ? try params["set"].map(selectionRangeArg) : nil  // validated before anything is read
    let app = try resolveApp(params)
    guard let appPid = app.pid else { throw EngineError(.runningApplicationNotFound, "Running application not found: \(app.displayName)") }
    try requireAccessibility()
    try refuseWhenLocked()
    let application = prepare(AXUIElementCreateApplication(appPid))
    var answer: [String: Any]
    switch op {
    case "activationPoint":
      guard let window = primaryWindow(of: application) else { throw EngineError(name: "noWindowsAvailable", "noWindowsAvailable") }
      answer = activationPointReport(application: application, window: window, appPid: appPid)
    case "activate":
      // The keyboard actions' shape of route 3: the app's pid and its primary window, else the application element.
      let window = primaryWindow(of: application)
      answer = try activationProbe(pid: appPid, window: window ?? AXUIElementCreateApplication(appPid))
      answer["windowFound"] = window != nil
      answer["receivedAt"] = Int(receivedAt)
    default:
      guard let window = primaryWindow(of: application) else { throw EngineError(name: "noWindowsAvailable", "noWindowsAvailable") }
      answer = try selectionReport(window: window, set: range)
    }
    answer["op"] = op
    answer["app"] = app.appWire
    return answer
  }

  /// `activationPoint`: {listed, axError, point, relative, windowFrame, hitFrom, hit}.
  private func activationPointReport(application: AXUIElement, window: AXUIElement, appPid: pid_t) -> [String: Any] {
    var names: CFArray?
    let listed = AXUIElementCopyAttributeNames(window, &names) == .success
      && ((names as? [String])?.contains("AXActivationPoint") ?? false)
    let read = copyAttribute(window, "AXActivationPoint")
    let activationPoint = point(read.value)
    let windowFrame = frame(of: window)
    var answer: [String: Any] = [
      "listed": listed,
      "axError": Int(read.error.rawValue),
      "point": pointWire(activationPoint),
      "relative": pointWire(activationPoint.flatMap { p in windowFrame.map { CGPoint(x: p.x - $0.minX, y: p.y - $0.minY) } }),
      "windowFrame": rectWire(windowFrame),
      "hitFrom": NSNull(),
      "hit": NSNull(),
    ]
    guard let activationPoint else { return answer }
    // The application element first, as route 3's click is addressed to the app; the system-wide element when it errs.
    var hit: AXUIElement?
    var from = "application"
    var error = AXUIElementCopyElementAtPosition(application, Float(activationPoint.x), Float(activationPoint.y), &hit)
    if error != .success {
      from = "systemWide"
      hit = nil
      error = AXUIElementCopyElementAtPosition(prepare(AXUIElementCreateSystemWide()), Float(activationPoint.x), Float(activationPoint.y), &hit)
    }
    answer["hitFrom"] = from
    guard error == .success, let hit else {
      answer["hit"] = ["axError": Int(error.rawValue), "role": NSNull(), "subrole": NSNull(), "isWindow": false, "inWindow": false,
                       "sameApp": false, "ownerPid": NSNull()] as [String: Any]
      return answer
    }
    let element = prepare(hit)
    let owner = pid(of: element)
    answer["hit"] = [
      "axError": Int(error.rawValue),
      "role": stringAttribute(element, kAXRoleAttribute) ?? NSNull(),
      "subrole": stringAttribute(element, kAXSubroleAttribute) ?? NSNull(),
      "isWindow": CFEqual(element, window),
      "inWindow": elementAttribute(element, kAXWindowAttribute).map { CFEqual($0, window) } ?? false,
      "sameApp": owner == appPid,
      "ownerPid": Int(owner),
    ] as [String: Any]
    return answer
  }

  /// `selection`: {role, range, axError, setError?, settable, visited}.
  private func selectionReport(window: AXUIElement, set range: CFRange?) throws -> [String: Any] {
    let found = firstTextElement(from: window, limit: selectionWalkLimit,
                                 role: { stringAttribute($0, kAXRoleAttribute) },
                                 children: { elementList(attribute($0, kAXChildrenAttribute)).map(prepare) })
    guard let element = found.element else {
      throw EngineError(name: "noTextElement", "The primary window has no text area or text field within \(selectionWalkLimit) elements.")
    }
    var settable = DarwinBoolean(false)
    let settableError = AXUIElementIsAttributeSettable(element, kAXSelectedTextRangeAttribute as CFString, &settable)
    var answer: [String: Any] = [
      "role": stringAttribute(element, kAXRoleAttribute) ?? NSNull(),
      "settable": settableError == .success && settable.boolValue,
      "visited": found.visited,
    ]
    if let range {
      answer["setError"] = Int(AXUIElementSetAttributeValue(element, kAXSelectedTextRangeAttribute as CFString, axRangeValue(range)).rawValue)
    }
    let read = copyAttribute(element, kAXSelectedTextRangeAttribute)
    answer["axError"] = Int(read.error.rawValue)
    answer["range"] = rangeWire(read.value) ?? NSNull()
    return answer
  }
}

/// `activate`: route 3's activation of `pid` for `window` as a route-3 action runs it, with nothing posted between the
/// activation and the deactivation. Answers {believedBefore, activationRan, deactivationPosted, inputRoute (what a real
/// action would report: 3, whether or not the app already believed it had focus), activationGuardMs (null when no guard
/// ran), activateMs, startedAt, endedAt, frontmostBefore, frontmostAfter}; a failed guard refuses with
/// `activationFailed` and the same report as the refusal's `probe`, after the deactivation, as the real path's defer runs it.
func activationProbe(pid: pid_t, window: AXUIElement, system: ActivationSystem = ActivationSystem()) throws -> [String: Any] {
  let activation = FakeActivation(pid: pid, window: window, system: system)
  defer { activation.deactivate() }
  var report: [String: Any] = ["frontmostBefore": system.frontmost().map { Int($0) } ?? NSNull()]
  let believedBefore = system.believesItHasFocus(pid)
  let startedAt = unixMilliseconds()
  let started = monotonicMilliseconds()
  var failure: EngineError?
  do {
    if !believedBefore { try activation.activate() }
  } catch let error as EngineError {
    failure = error
  }
  let activateMs = ((monotonicMilliseconds() - started) * 1000).rounded() / 1000
  let ran = activation.activated
  activation.deactivate()
  report["believedBefore"] = believedBefore
  report["activationRan"] = ran
  report["deactivationPosted"] = ran && !activation.activated
  report["inputRoute"] = InputRoute.activation.wire
  report["activationGuardMs"] = activation.guardMs ?? NSNull()
  report["activateMs"] = activateMs
  report["startedAt"] = Int(startedAt)
  report["endedAt"] = Int(unixMilliseconds())
  report["frontmostAfter"] = system.frontmost().map { Int($0) } ?? NSNull()
  if var failure {
    failure.extra["probe"] = report
    throw failure
  }
  return report
}

/// The selection walk: depth first from `root` (preorder), at most `limit` elements; the first AXTextArea, else the
/// first AXTextField seen. `visited` counts the elements whose role was read.
func firstTextElement<Node>(from root: Node, limit: Int, role: (Node) -> String?, children: (Node) -> [Node]) -> (element: Node?, visited: Int) {
  var stack = [root]
  var visited = 0
  var firstField: Node?
  while let node = stack.popLast(), visited < limit {
    visited += 1
    switch role(node) {
    case "AXTextArea": return (node, visited)
    case "AXTextField" where firstField == nil: firstField = node
    default: break
    }
    stack.append(contentsOf: children(node).reversed())
  }
  return (firstField, visited)
}

/// `set: {location, length}`: two non-negative integers.
func selectionRangeArg(_ value: Any) throws -> CFRange {
  let invalid = EngineError.invalidArguments("set must be {location, length}, two non-negative integers")
  guard let object = value as? [String: Any] else { throw invalid }
  func integer(_ key: String) throws -> Int {
    guard let number = object[key] as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
          number.doubleValue == number.doubleValue.rounded(), number.intValue >= 0 else { throw invalid }
    return number.intValue
  }
  return CFRange(location: try integer("location"), length: try integer("length"))
}

/// A CFRange as the AXValue AXSelectedTextRange takes.
func axRangeValue(_ range: CFRange) -> AXValue {
  var range = range
  return AXValueCreate(.cfRange, &range)!
}

/// An AXSelectedTextRange value as {location, length}; nil for anything that is not a range.
func rangeWire(_ value: CFTypeRef?) -> [String: Int]? {
  guard let value, CFGetTypeID(value) == AXValueGetTypeID(), AXValueGetType(value as! AXValue) == .cfRange else { return nil }
  var range = CFRange()
  guard AXValueGetValue(value as! AXValue, .cfRange, &range) else { return nil }
  return ["location": range.location, "length": range.length]
}

private func pointWire(_ point: CGPoint?) -> Any {
  guard let point else { return NSNull() }
  return ["x": Double(point.x), "y": Double(point.y)]
}
