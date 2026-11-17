// Runner-only side tool for the #354 fence spike: foreground checks, clipboard writes, window titles and focused AX evidence.
// One JSON request per stdin line, one JSON answer per stdout line. focusEvidence never activates or moves focus;
// only publicValue/public-rendered may read a public fixture's text-entry value. labelsOnly/terminal-tab never reads values.
// safariAXPaths (safari-no-key-ax, an observer-effect diagnostic) only reads AX paths: no values, writes or activation.
import AppKit
import ApplicationServices
import Foundation

func windowTitles(_ pid: pid_t) -> [String] {
  let app = AXUIElementCreateApplication(pid)
  AXUIElementSetMessagingTimeout(app, 0.5)
  var raw: CFTypeRef?
  guard AXUIElementCopyAttributeValue(app, kAXWindowsAttribute as CFString, &raw) == .success, let windows = raw as? [AnyObject] else { return [] }
  return windows.compactMap { item in
    guard CFGetTypeID(item as CFTypeRef) == AXUIElementGetTypeID() else { return nil }
    var title: CFTypeRef?
    guard AXUIElementCopyAttributeValue(item as! AXUIElement, kAXTitleAttribute as CFString, &title) == .success else { return nil }
    return title as? String
  }
}

func focusAttributeString(_ element: AXUIElement, _ attribute: String) -> String? {
  var raw: CFTypeRef?
  guard AXUIElementCopyAttributeValue(element, attribute as CFString, &raw) == .success else { return nil }
  return raw as? String
}

// Diagnostic-only late observations. CFIndex/CFNumber replies are decimal strings, never field text.
func caretSideRange(_ raw: CFTypeRef?, _ code: AXError) -> [String: Any] {
  var result: [String: Any] = ["axError": code.rawValue, "shape": "missing", "range": NSNull()]
  guard let raw else { return result }
  guard CFGetTypeID(raw) == AXValueGetTypeID() else { result["shape"] = "wrongType"; return result }
  let value = raw as! AXValue
  if AXValueGetType(value) == .cfRange {
    var range = CFRange(location: 0, length: 0)
    if AXValueGetValue(value, .cfRange, &range) { result["shape"] = "range"; result["range"] = ["location": String(range.location), "length": String(range.length)]; return result }
  } else if AXValueGetType(value) == .axError {
    var embedded = AXError.success
    if AXValueGetValue(value, .axError, &embedded) { result["shape"] = "axError"; result["embeddedAXError"] = embedded.rawValue; return result }
  }
  result["shape"] = "wrongType"; return result
}
func caretSideCount(_ raw: CFTypeRef?, _ code: AXError) -> [String: Any] {
  var result: [String: Any] = ["axError": code.rawValue, "shape": "missing", "count": NSNull()]
  guard let raw else { return result }
  guard CFGetTypeID(raw) == CFNumberGetTypeID() else { result["shape"] = "wrongType"; return result }
  var count: Int64 = 0
  if CFNumberGetValue(raw as! CFNumber, .sInt64Type, &count) { result["shape"] = "number"; result["count"] = String(count) }
  else { result["shape"] = "wrongType" }
  return result
}
func focusEvidence(_ q: [String: Any]) -> [String: Any] {
  let mode = q["mode"] as? String
  let lane = q["lane"] as? String
  let labelsOnly = mode == "labelsOnly"
  let caretOnly = mode == "caretRangeCount"
  // readable means a string AXValue was obtained, not that labels were available.
  // secure is null until classification, or true if either known identifier is secure.
  var evidence: [String: Any] = [
    "ok": false, "role": NSNull(), "subrole": NSNull(), "secure": NSNull(),
    "readable": false, "valueRead": false
  ]
  var labels: [String: Any] = [
    "role": NSNull(), "subrole": NSNull(), "title": NSNull(), "description": NSNull()
  ]
  func failure(_ reason: String) -> [String: Any] {
    var result = evidence
    result["error"] = "focus evidence unavailable"
    result["reason"] = reason
    if labelsOnly { result["labels"] = labels }
    return result
  }
  guard (mode == "publicValue" && lane == "public-rendered") ||
        (labelsOnly && lane == "terminal-tab") ||
        (caretOnly && lane == "firefox-caret") else { return failure("invalid-mode-lane") }
  guard let number = q["pid"] as? NSNumber,
        CFGetTypeID(number as CFTypeRef) != CFBooleanGetTypeID(),
        number.int32Value > 0, number.doubleValue == Double(number.int32Value) else {
    return failure("invalid-pid")
  }

  let app = AXUIElementCreateApplication(number.int32Value)
  AXUIElementSetMessagingTimeout(app, 0.5)
  var rawFocus: CFTypeRef?
  guard AXUIElementCopyAttributeValue(app, kAXFocusedUIElementAttribute as CFString, &rawFocus) == .success,
        let rawFocus = rawFocus, CFGetTypeID(rawFocus) == AXUIElementGetTypeID() else {
    return failure("focused-element-unreadable")
  }
  let focus = rawFocus as! AXUIElement
  AXUIElementSetMessagingTimeout(focus, 0.5)
  // Read both identifiers before requesting any labels or value. Only explicit AX absence permits a missing subrole.
  let role = focusAttributeString(focus, kAXRoleAttribute)
  var rawSubrole: CFTypeRef?
  let subroleStatus = AXUIElementCopyAttributeValue(focus, kAXSubroleAttribute as CFString, &rawSubrole)
  let subrole = subroleStatus == .success ? rawSubrole as? String : nil
  let subroleAbsent = subroleStatus == .noValue || subroleStatus == .attributeUnsupported
  if let role = role { evidence["role"] = role; labels["role"] = role }
  if let subrole = subrole { evidence["subrole"] = subrole; labels["subrole"] = subrole }
  let secure = [role, subrole].compactMap { $0 }.contains { identifier in
    let name = identifier.lowercased()
    return name.contains("secure") || name.contains("password")
  }
  if secure { evidence["secure"] = true }
  guard let role = role, !role.isEmpty else { return failure("role-unreadable") }
  guard subroleAbsent || (subroleStatus == .success && subrole != nil) else {
    return failure("subrole-unreadable")
  }
  evidence["secure"] = secure
  guard !secure else { return failure("secure-focus") }

  if labelsOnly {
    if let title = focusAttributeString(focus, kAXTitleAttribute) { labels["title"] = title }
    if let description = focusAttributeString(focus, kAXDescriptionAttribute) { labels["description"] = description }
    evidence["labels"] = labels
    evidence["ok"] = true
    return evidence
  }
  guard role == kAXTextFieldRole || role == kAXTextAreaRole else { return failure("non-text-entry-role") }
  if caretOnly {
    let rangeStarted = now(); var rawRange: CFTypeRef?
    let rangeCode = AXUIElementCopyAttributeValue(focus, kAXSelectedTextRangeAttribute as CFString, &rawRange)
    var range = caretSideRange(rawRange, rangeCode)
    range["source"] = "diagnostic-added-late"; range["api"] = "single"; range["attribute"] = "AXSelectedTextRange"; range["pollIndex"] = NSNull()
    range["startedAt"] = rangeStarted; range["endedAt"] = now()
    let countStarted = now(); var rawCount: CFTypeRef?
    let countCode = AXUIElementCopyAttributeValue(focus, kAXNumberOfCharactersAttribute as CFString, &rawCount)
    var count = caretSideCount(rawCount, countCode)
    count["source"] = "diagnostic-added-late"; count["attribute"] = "AXNumberOfCharacters"; count["queried"] = true
    count["startedAt"] = countStarted; count["endedAt"] = now()
    evidence["range"] = range; evidence["characterCount"] = count; evidence["ok"] = true
    return evidence
  }
  evidence["valueRead"] = true
  guard let value = focusAttributeString(focus, kAXValueAttribute) else { return failure("value-unreadable") }
  evidence["value"] = value
  evidence["readable"] = true
  evidence["ok"] = true
  return evidence
}

// MARK: safariAXPaths begin (#354 Safari no-key AX diagnostic)
// Observer-effect diagnostic, never primary evidence: a bounded, read-only snapshot of the AX paths that could name
// Safari's focused web field while Safari is not active (#354's follow-up: the readback's application and window paths
// found no focused element in 20 of 20 no-key cells). It never activates Safari, writes an attribute, performs an
// action or moves focus. It never reads a field's value, selected text or the text for a marker, and never serializes
// a text marker's bytes. Every AX request goes through SafariAXSnapshot.query, which checks the time budget before
// sending and records each request it sends (each one it does not send goes to notIssued). Every element gets the
// bounded messaging timeout when first seen; the process-wide timeout is never set, so the other ops keep theirs.

/// The text-marker API HIServices declares in AXUIElement.h ("Text Marker API", macOS SDK 13.3 to 27.0, exported by
/// HIServices.tbd), looked up at run time: the header's CF_ASSUME_NONNULL imports Copy*'s result as non-optional, where
/// a NULL result would trap, and a missing symbol must be reported rather than keep the whole side tool from loading.
enum SafariAXMarkerAPI {
  typealias TypeIDFunction = @convention(c) () -> CFTypeID
  typealias CopyMarkerFunction = @convention(c) (UnsafeRawPointer) -> UnsafeRawPointer?
  /// dlsym over every loaded image (RTLD_DEFAULT is ((void *)-2) on Darwin).
  static func symbol(_ name: String) -> UnsafeMutableRawPointer? { dlsym(UnsafeMutableRawPointer(bitPattern: -2), name) }
  static let rangeTypeID: CFTypeID? = SafariAXMarkerAPI.symbol("AXTextMarkerRangeGetTypeID").map { unsafeBitCast($0, to: TypeIDFunction.self)() }
  static let markerTypeID: CFTypeID? = SafariAXMarkerAPI.symbol("AXTextMarkerGetTypeID").map { unsafeBitCast($0, to: TypeIDFunction.self)() }
  static let copyStart: CopyMarkerFunction? = SafariAXMarkerAPI.symbol("AXTextMarkerRangeCopyStartMarker").map { unsafeBitCast($0, to: CopyMarkerFunction.self) }
  static var wire: [String: Any] {
    ["AXTextMarkerRangeGetTypeID": rangeTypeID != nil, "AXTextMarkerGetTypeID": markerTypeID != nil,
     "AXTextMarkerRangeCopyStartMarker": copyStart != nil]
  }
}

final class SafariAXSnapshot {
  struct WalkLimits {
    let maxDepth: Int
    let maxNodes: Int
    let budgetMs: Double
    var wire: [String: Any] { ["maxDepth": maxDepth, "maxNodes": maxNodes, "budgetMs": budgetMs] }
  }
  enum Request {
    case attribute
    case parameterized(CFTypeRef)
    case settable
    var name: String {
      switch self {
      case .attribute: return "attribute"
      case .parameterized: return "parameterized"
      case .settable: return "settable"
      }
    }
  }
  enum WalkGoal: String { case webArea, focused }
  /// One request as sent: its error, its value when it succeeded, and the elements it named, by registry index.
  struct Reply {
    let seq: Int
    let code: AXError
    let raw: CFTypeRef?
    var typed: [String: Any] = [:]
    var element: Int? = nil
    var items: [Int] = []
    var capped = false
  }

  static let messagingTimeout: Float = 0.5
  static let totalBudgetMs: Double = 5000
  static let maxWindows = 8
  static let maxChildren = 200
  static let maxMarkerAncestors = 6
  static let settleMs: Double = 20
  static let webAreaWalk = WalkLimits(maxDepth: 12, maxNodes: 400, budgetMs: 1500)
  static let focusWalk = WalkLimits(maxDepth: 40, maxNodes: 800, budgetMs: 1500)
  static let textEntryRoles: Set<String> = ["AXTextField", "AXTextArea", "AXComboBox", "AXSearchField"]
  static let errorNames: [Int32: String] = [
    0: "success", -25200: "failure", -25201: "illegalArgument", -25202: "invalidUIElement",
    -25203: "invalidUIElementObserver", -25204: "cannotComplete", -25205: "attributeUnsupported",
    -25206: "actionUnsupported", -25207: "notificationUnsupported", -25208: "notImplemented",
    -25209: "notificationAlreadyRegistered", -25210: "notificationNotRegistered", -25211: "apiDisabled",
    -25212: "noValue", -25213: "parameterizedAttributeUnsupported", -25214: "notEnoughPrecision"
  ]
  static var limitsWire: [String: Any] {
    ["messagingTimeoutSeconds": Double(messagingTimeout), "totalBudgetMs": totalBudgetMs, "maxWindows": maxWindows,
     "maxChildrenPerNode": maxChildren, "maxMarkerAncestors": maxMarkerAncestors, "workspaceSettleMs": settleMs,
     "webAreaWalk": webAreaWalk.wire, "focusWalk": focusWalk.wire,
     "afterTraversalRead": "outside the total budget, bounded by the messaging timeout"]
  }
  static func id(_ index: Int) -> String { "e\(index)" }
  static func index(_ ref: Any?) -> Int? {
    guard let ref = ref as? String, ref.hasPrefix("e") else { return nil }
    return Int(ref.dropFirst())
  }
  static func orNull(_ value: Any?) -> Any { value ?? NSNull() }
  static func errorName(_ code: AXError) -> String { errorNames[code.rawValue] ?? "unknown" }
  /// A value's type and, for booleans, numbers (decimal strings) and the strings asked for, the value itself. Any other
  /// string is withheld; a text marker or marker range is named by type only.
  static func typedValue(_ value: CFTypeRef, strings: Bool) -> [String: Any] {
    let type = CFGetTypeID(value)
    if type == CFBooleanGetTypeID() { return ["valueType": "bool", "value": CFBooleanGetValue((value as! CFBoolean))] }
    if type == CFNumberGetTypeID() {
      var number: Int64 = 0
      if CFNumberGetValue((value as! CFNumber), .sInt64Type, &number) { return ["valueType": "number", "value": String(number)] }
      return ["valueType": "number", "value": NSNull()]
    }
    if type == CFStringGetTypeID() {
      return strings ? ["valueType": "string", "value": value as! String] : ["valueType": "string", "withheld": true]
    }
    if let rangeType = SafariAXMarkerAPI.rangeTypeID, type == rangeType { return ["valueType": "textMarkerRange", "opaque": true] }
    if let markerType = SafariAXMarkerAPI.markerTypeID, type == markerType { return ["valueType": "textMarker", "opaque": true] }
    if type == AXValueGetTypeID() { return ["valueType": "axValue", "axValueType": Int(AXValueGetType((value as! AXValue)).rawValue)] }
    let description: CFString? = CFCopyTypeIDDescription(type)
    return ["valueType": "other", "cfType": description.map { $0 as String } ?? "unknown"]
  }

  let startedAt: Double
  let deadline: Double
  var elements: [AXUIElement] = []
  var info: [[String: Any]] = []
  var buckets: [CFHashCode: [Int]] = [:]
  var roleDone: Set<Int> = []
  var roleValue: [Int: String] = [:]
  var subroleStatus: [Int: String] = [:]
  var subroleValue: [Int: String] = [:]
  var queries: [[String: Any]] = []
  var notIssued: [[String: Any]] = []
  var omissions: [[String: Any]] = []

  init(application: AXUIElement) {
    startedAt = now()
    deadline = startedAt + SafariAXSnapshot.totalBudgetMs
    let index = register(application, seq: nil)
    info[index]["kind"] = "application"
  }

  /// The element's stable id within this snapshot: an element equal (CFEqual) to one already seen keeps its id.
  func register(_ element: AXUIElement, seq: Int?) -> Int {
    let hash = CFHash(element)
    for index in buckets[hash] ?? [] where CFEqual(elements[index], element) { return index }
    let index = elements.count
    AXUIElementSetMessagingTimeout(element, Self.messagingTimeout)
    elements.append(element)
    buckets[hash, default: []].append(index)
    info.append(["id": Self.id(index), "firstSeenQuery": Self.orNull(seq)])
    return index
  }

  /// The one place this op sends an AX request. Nothing is sent once the budget is spent: the request is listed in
  /// notIssued instead. `budgeted: false` is for the single afterTraversal read.
  @discardableResult
  func query(_ phase: String, _ path: String, _ target: Int, _ attribute: String, request: Request = .attribute,
             strings: Bool = false, arrayCap: Int = 0, phaseDeadline: Double = .infinity, budgeted: Bool = true) -> Reply? {
    let limit = min(deadline, phaseDeadline)
    let started = now()
    guard !budgeted || started < limit else {
      notIssued.append(["phase": phase, "path": path, "target": Self.id(target), "attribute": attribute,
                        "kind": request.name, "reason": started >= deadline ? "totalBudget" : "phaseBudget"])
      return nil
    }
    let element = elements[target]
    var raw: CFTypeRef?
    let code: AXError
    switch request {
    case .attribute:
      code = AXUIElementCopyAttributeValue(element, attribute as CFString, &raw)
    case .parameterized(let parameter):
      code = AXUIElementCopyParameterizedAttributeValue(element, attribute as CFString, parameter, &raw)
    case .settable:
      var settable: DarwinBoolean = false
      code = AXUIElementIsAttributeSettable(element, attribute as CFString, &settable)
      if code == .success { raw = settable.boolValue ? kCFBooleanTrue : kCFBooleanFalse }
    }
    let ended = now()
    let seq = queries.count + 1
    var reply = Reply(seq: seq, code: code, raw: code == .success ? raw : nil)
    reply.typed = ["valueType": "none"]
    if let value = reply.raw {
      let type = CFGetTypeID(value)
      if type == AXUIElementGetTypeID() {
        let index = register(value as! AXUIElement, seq: seq)
        reply.element = index
        reply.typed = ["valueType": "element", "element": Self.id(index)]
      } else if type == CFArrayGetTypeID() {
        let items = value as? [AnyObject] ?? []
        var nonElements = 0
        for item in items {
          guard CFGetTypeID(item as CFTypeRef) == AXUIElementGetTypeID() else { nonElements += 1; continue }
          guard reply.items.count < arrayCap else { reply.capped = true; continue }
          reply.items.append(register(item as! AXUIElement, seq: seq))
        }
        reply.typed = ["valueType": "array", "count": items.count, "elements": reply.items.map { Self.id($0) },
                       "nonElements": nonElements, "capped": reply.capped, "cap": arrayCap]
      } else {
        reply.typed = Self.typedValue(value, strings: strings)
      }
    }
    var entry: [String: Any] = [
      "seq": seq, "phase": phase, "path": path, "target": Self.id(target), "attribute": attribute, "kind": request.name,
      "axError": Int(code.rawValue), "axErrorName": Self.errorName(code),
      "startedAt": started, "endedAt": ended, "durationMs": ended - started
    ]
    if case .parameterized(let parameter) = request { entry["parameter"] = Self.typedValue(parameter, strings: false) }
    entry.merge(reply.typed) { _, new in new }
    queries.append(entry)
    return reply
  }

  func stepWire(_ reply: Reply?) -> [String: Any] {
    guard let reply else { return ["notIssued": true] }
    var wire = reply.typed
    wire["query"] = reply.seq
    wire["axError"] = Int(reply.code.rawValue)
    wire["axErrorName"] = Self.errorName(reply.code)
    return wire
  }

  /// AXRole, read once per element. A read the budget stopped is not remembered, so a later phase may still send it.
  func role(_ index: Int, phase: String, phaseDeadline: Double = .infinity) -> String? {
    if roleDone.contains(index) { return roleValue[index] }
    guard let reply = query(phase, Self.id(index) + ".AXRole", index, "AXRole", strings: true, phaseDeadline: phaseDeadline) else { return nil }
    roleDone.insert(index)
    if let value = reply.raw as? String, !value.isEmpty { roleValue[index] = value }
    info[index]["role"] = Self.orNull(roleValue[index])
    info[index]["roleQuery"] = reply.seq
    return roleValue[index]
  }

  /// AXSubrole's status: value, absent (noValue or attributeUnsupported, as focusEvidence counts it), unreadable, or
  /// notIssued.
  func subrole(_ index: Int, phase: String) -> String {
    if let status = subroleStatus[index] { return status }
    guard let reply = query(phase, Self.id(index) + ".AXSubrole", index, "AXSubrole", strings: true) else { return "notIssued" }
    let status: String
    if reply.code == .success, let value = reply.raw as? String { status = "value"; subroleValue[index] = value }
    else if reply.code == .noValue || reply.code == .attributeUnsupported { status = "absent" }
    else { status = "unreadable" }
    subroleStatus[index] = status
    info[index]["subrole"] = Self.orNull(subroleValue[index])
    info[index]["subroleStatus"] = status
    info[index]["subroleQuery"] = reply.seq
    return status
  }

  /// readable, secure or unclassifiable, from AXRole and AXSubrole alone, as focusEvidence classifies a field: secure
  /// when either names a secure or password field; unclassifiable when the role is unreadable or the subrole neither
  /// reads nor is explicitly absent. Only a readable element's identifiers are read; every other is an omission.
  @discardableResult
  func classify(_ index: Int, phase: String) -> String {
    if let done = info[index]["classification"] as? String { return done }
    let role = self.role(index, phase: phase)
    let subrole = self.subrole(index, phase: phase)
    let secure = [role, subroleValue[index]].compactMap { $0 }.contains { name in
      let lowered = name.lowercased()
      return lowered.contains("secure") || lowered.contains("password")
    }
    var result = "readable", reason = "classified"
    if secure { result = "secure"; reason = "secureRoleOrSubrole" }
    else if role == nil { result = "unclassifiable"; reason = roleDone.contains(index) ? "roleUnreadable" : "roleNotIssued" }
    else if subrole == "unreadable" { result = "unclassifiable"; reason = "subroleUnreadable" }
    else if subrole == "notIssued" { result = "unclassifiable"; reason = "subroleNotIssued" }
    if !reason.hasSuffix("NotIssued") {
      info[index]["classification"] = result
      info[index]["classificationReason"] = reason
    }
    guard result == "readable" else {
      omissions.append(["element": Self.id(index), "phase": phase, "classification": result, "reason": reason,
                        "withheld": "identifiers"])
      return result
    }
    for (attribute, key) in [("AXIdentifier", "identifier"), ("AXDOMIdentifier", "domIdentifier")] {
      guard let reply = query(phase, Self.id(index) + "." + attribute, index, attribute, strings: true) else { continue }
      info[index][key] = Self.orNull(reply.raw as? String)
      info[index][key + "AXError"] = Int(reply.code.rawValue)
    }
    return result
  }

  func descriptor(_ index: Int) -> [String: Any] {
    var wire: [String: Any] = ["element": Self.id(index)]
    for key in ["role", "subrole", "subroleStatus", "classification", "identifier", "domIdentifier"] {
      wire[key] = info[index][key] ?? NSNull()
    }
    return wire
  }

  /// A path of element-valued attributes from `start`: the element at its end, or where and why it stopped (an AX
  /// error, a success with no value, a value that is not an element, or a request the budget kept from being sent).
  func chain(_ root: String, from start: Int, _ attributes: [String], phase: String,
             budgeted: Bool = true) -> (wire: [String: Any], element: Int?, replies: [Reply]) {
    let name = ([root] + attributes).joined(separator: ".")
    var current = start
    var label = root
    var replies: [Reply] = []
    var outcome = "element"
    var stoppedAt: Any = NSNull()
    for attribute in attributes {
      label += "." + attribute
      guard let reply = query(phase, label, current, attribute, budgeted: budgeted) else { outcome = "notIssued"; stoppedAt = label; break }
      replies.append(reply)
      guard reply.code == .success else { outcome = "axError"; stoppedAt = label; break }
      guard let next = reply.element else { outcome = reply.raw == nil ? "emptySuccess" : "notElement"; stoppedAt = label; break }
      current = next
    }
    let element: Int? = outcome == "element" ? current : nil
    var wire: [String: Any] = ["path": name, "phase": phase, "outcome": outcome, "stoppedAt": stoppedAt,
                               "queries": replies.map { $0.seq }, "element": Self.orNull(element.map { Self.id($0) })]
    if let last = replies.last {
      wire["axError"] = Int(last.code.rawValue)
      wire["axErrorName"] = Self.errorName(last.code)
    }
    return (wire, element, replies)
  }

  /// A breadth-first walk from `root`, bounded by depth, node count, children per node and its own time budget inside
  /// the snapshot's. .webArea stops at the first AXWebArea by AXRole; .focused visits every node in bounds and
  /// collects those whose AXFocused reads true.
  func walk(_ phase: String, from root: Int, goal: WalkGoal, limits: WalkLimits) -> (wire: [String: Any], matches: [Int]) {
    let started = now()
    let phaseDeadline = started + limits.budgetMs
    let firstQuery = queries.count
    let firstNotIssued = notIssued.count
    var queue: [(index: Int, depth: Int)] = [(index: root, depth: 0)]
    var seen: Set<Int> = [root]
    var head = 0, visited = 0, deepest = 0, depthLimited = 0, childrenCapped = 0
    var matches: [Int] = []
    var matchWire: [[String: Any]] = []
    var truncation: [String] = []
    var stoppedAtMatch = false
    while head < queue.count {
      if visited >= limits.maxNodes { truncation.append("nodes"); break }
      if now() >= min(deadline, phaseDeadline) { truncation.append("budget"); break }
      let (index, depth) = queue[head]
      head += 1
      visited += 1
      deepest = max(deepest, depth)
      switch goal {
      case .webArea:
        if role(index, phase: phase, phaseDeadline: phaseDeadline) == "AXWebArea" {
          matches.append(index)
          matchWire.append(["element": Self.id(index), "depth": depth])
          stoppedAtMatch = true
        }
      case .focused:
        if let reply = query(phase, Self.id(index) + ".AXFocused", index, "AXFocused", phaseDeadline: phaseDeadline),
           let raw = reply.raw, CFGetTypeID(raw) == CFBooleanGetTypeID(), CFBooleanGetValue((raw as! CFBoolean)) {
          matches.append(index)
          matchWire.append(["element": Self.id(index), "depth": depth])
        }
      }
      if stoppedAtMatch { break }
      guard depth < limits.maxDepth else { depthLimited += 1; continue }
      guard now() < min(deadline, phaseDeadline) else { truncation.append("budget"); break }
      guard let children = query(phase, Self.id(index) + ".AXChildren", index, "AXChildren", arrayCap: Self.maxChildren,
                                 phaseDeadline: phaseDeadline) else { continue }
      if children.capped { childrenCapped += 1 }
      for child in children.items where !seen.contains(child) {
        seen.insert(child)
        queue.append((index: child, depth: depth + 1))
      }
    }
    if depthLimited > 0 { truncation.append("depth") }
    if childrenCapped > 0 { truncation.append("children") }
    let ended = now()
    let walkQueries = queries[firstQuery...]
    let queryMs = walkQueries.reduce(0.0) { $0 + (($1["durationMs"] as? Double) ?? 0) }
    let wire: [String: Any] = [
      "goal": goal.rawValue, "root": Self.id(root), "matches": matchWire, "stoppedAtFirstMatch": stoppedAtMatch,
      "nodesVisited": visited, "nodesQueued": queue.count, "deepestDepth": deepest, "depthLimitedNodes": depthLimited,
      "childrenCappedNodes": childrenCapped, "truncated": !truncation.isEmpty, "truncation": truncation,
      "limits": limits.wire, "maxChildrenPerNode": Self.maxChildren, "queryCount": walkQueries.count,
      "querySeqRange": walkQueries.isEmpty ? [Int]() : [firstQuery + 1, queries.count], "queryMs": queryMs,
      "notIssuedCount": notIssued.count - firstNotIssued, "startedAt": started, "endedAt": ended,
      "durationMs": ended - started
    ]
    return (wire, matches)
  }

  /// The web area's AXSelectedTextMarkerRange, its start marker only through the type-checked HIServices accessor, and
  /// AXUIElementForTextMarker on that marker. The element it names is classified before any identifier is read; when it
  /// is not a text-entry role, its readable ancestors up to maxMarkerAncestors are read (a marker usually names a leaf).
  func textMarker(_ webArea: Int) -> [String: Any] {
    var wire: [String: Any] = ["attempted": true, "symbols": SafariAXMarkerAPI.wire]
    let range = query("textMarker", "frontWindow.webArea.AXSelectedTextMarkerRange", webArea, "AXSelectedTextMarkerRange")
    wire["selectedRange"] = stepWire(range)
    guard let raw = range?.raw else { wire["stoppedAt"] = range == nil ? "selectedRangeNotIssued" : "selectedRange"; return wire }
    guard let rangeType = SafariAXMarkerAPI.rangeTypeID else { wire["stoppedAt"] = "rangeTypeUnavailable"; return wire }
    guard CFGetTypeID(raw) == rangeType else { wire["stoppedAt"] = "rangeWrongType"; return wire }
    guard let copyStart = SafariAXMarkerAPI.copyStart else { wire["stoppedAt"] = "copyStartUnavailable"; return wire }
    let started = now()
    let pointer: UnsafeRawPointer? = withExtendedLifetime(raw) {
      copyStart(UnsafeRawPointer(Unmanaged<AnyObject>.passUnretained(raw).toOpaque()))
    }
    let ended = now()
    var start: [String: Any] = ["api": "AXTextMarkerRangeCopyStartMarker", "localCall": true,
                                "startedAt": started, "endedAt": ended, "durationMs": ended - started]
    guard let pointer else {
      start["valueType"] = "none"
      wire["startMarker"] = start
      wire["stoppedAt"] = "startMarkerNull"
      return wire
    }
    let marker = Unmanaged<AnyObject>.fromOpaque(pointer).takeRetainedValue()
    guard let markerType = SafariAXMarkerAPI.markerTypeID, CFGetTypeID(marker) == markerType else {
      start["valueType"] = SafariAXMarkerAPI.markerTypeID == nil ? "typeUnavailable" : "wrongType"
      wire["startMarker"] = start
      wire["stoppedAt"] = "startMarkerType"
      return wire
    }
    start["valueType"] = "textMarker"
    start["opaque"] = true
    wire["startMarker"] = start
    let forMarker = query("textMarker", "frontWindow.webArea.AXUIElementForTextMarker(startMarker)", webArea,
                          "AXUIElementForTextMarker", request: .parameterized(marker))
    wire["elementForMarker"] = stepWire(forMarker)
    guard var current = forMarker?.element else {
      wire["stoppedAt"] = forMarker == nil ? "elementForMarkerNotIssued" : "elementForMarker"
      return wire
    }
    var ancestors: [[String: Any]] = []
    for level in 1...Self.maxMarkerAncestors {
      guard classify(current, phase: "textMarker") == "readable", let role = self.role(current, phase: "textMarker"),
            !Self.textEntryRoles.contains(role), role != "AXWebArea" else { break }
      guard let parent = query("textMarker", Self.id(current) + ".AXParent", current, "AXParent"),
            let next = parent.element else { break }
      ancestors.append(["level": level, "query": parent.seq, "element": Self.id(next)])
      current = next
    }
    classify(current, phase: "textMarker")
    wire["ancestors"] = ancestors
    return wire
  }
}

/// Who is frontmost, by NSWorkspace (after a short run-loop turn, so a pending activation notification is applied)
/// and by the window server's frontmost layer-0 window. Neither sends Safari an AX request.
func safariAXFrontmost(_ pid: pid_t) -> [String: Any] {
  RunLoop.current.run(until: Date().addingTimeInterval(SafariAXSnapshot.settleMs / 1000))
  let at = now()
  let workspace = NSWorkspace.shared.frontmostApplication?.processIdentifier
  var owner: Any = NSNull()
  if let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]],
     let first = windows.first(where: { ($0[kCGWindowLayer as String] as? Int) == 0 }),
     let ownerPid = first[kCGWindowOwnerPID as String] as? Int {
    owner = ownerPid
  }
  return ["at": at, "workspacePid": SafariAXSnapshot.orNull(workspace.map { Int($0) }), "frontWindowOwnerPid": owner,
          "targetIsWorkspaceFrontmost": workspace == pid]
}

func safariAXPaths(_ q: [String: Any]) -> [String: Any] {
  var result: [String: Any] = ["schema": "probe354.safariAXPaths.v1", "ok": false, "diagnostic": "observer-effect",
                               "primaryEvidence": false]
  func refuse(_ reason: String) -> [String: Any] {
    var refused = result
    refused["error"] = "safari ax paths unavailable"
    refused["reason"] = reason
    return refused
  }
  guard q["lane"] as? String == "safari-no-key-ax" else { return refuse("invalid-lane") }
  result["lane"] = "safari-no-key-ax"
  guard let tag = q["tag"] as? String, (1...64).contains(tag.count),
        tag.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber || "._:/-".contains($0)) }) else {
    return refuse("invalid-tag")
  }
  result["tag"] = tag
  guard let number = q["pid"] as? NSNumber,
        CFGetTypeID(number as CFTypeRef) != CFBooleanGetTypeID(),
        number.int32Value > 0, number.doubleValue == Double(number.int32Value) else {
    return refuse("invalid-pid")
  }
  let pid = number.int32Value
  result["pid"] = Int(pid)
  result["bundleIdentifier"] = SafariAXSnapshot.orNull(NSRunningApplication(processIdentifier: pid)?.bundleIdentifier)

  let before = safariAXFrontmost(pid)
  let snapshot = SafariAXSnapshot(application: AXUIElementCreateApplication(pid))
  var paths: [[String: Any]] = []
  var candidates: [Int] = []
  func consider(_ index: Int?) {
    if let index, !candidates.contains(index) { candidates.append(index) }
  }

  // The required paths first, so the earliest reads see Safari's state before this snapshot walks anything.
  let appFocus = snapshot.chain("app", from: 0, ["AXFocusedUIElement"], phase: "paths")
  let focusedWindowPath = snapshot.chain("app", from: 0, ["AXFocusedWindow", "AXFocusedUIElement"], phase: "paths")
  let mainWindowPath = snapshot.chain("app", from: 0, ["AXMainWindow", "AXFocusedUIElement"], phase: "paths")
  for walked in [appFocus, focusedWindowPath, mainWindowPath] {
    paths.append(walked.wire)
    for reply in walked.replies { consider(reply.element) }
  }

  let windowsReply = snapshot.query("windows", "app.AXWindows", 0, "AXWindows", arrayCap: SafariAXSnapshot.maxWindows)
  var windowEntries: [[String: Any]] = []
  for (position, window) in (windowsReply?.items ?? []).enumerated() {
    consider(window)
    var entry: [String: Any] = ["index": position, "element": SafariAXSnapshot.id(window)]
    for attribute in ["AXFocusedUIElement", "AXMain", "AXFocused"] {
      let reply = snapshot.query("windows", "app.AXWindows[\(position)].\(attribute)", window, attribute)
      consider(reply?.element)
      entry[attribute] = snapshot.stepWire(reply)
    }
    windowEntries.append(entry)
  }
  let focusedWindow = focusedWindowPath.replies.first?.element
  let mainWindow = mainWindowPath.replies.first?.element
  var front: Int? = nil
  var provenance = "none"
  if let window = focusedWindow { front = window; provenance = "AXFocusedWindow" }
  else if let window = mainWindow { front = window; provenance = "AXMainWindow" }
  else if let window = windowsReply?.items.first { front = window; provenance = "AXWindows[0]" }
  let frontInWindows: Int? = front.flatMap { window in windowsReply?.items.firstIndex(of: window) }

  // Reads only. Writing either flag is skipped: see the reason recorded beside the reads.
  var flags: [String: Any] = [:]
  for attribute in ["AXEnhancedUserInterface", "AXManualAccessibility"] {
    let value = snapshot.query("flags", "app." + attribute, 0, attribute)
    let settable = snapshot.query("flags", "app." + attribute + "#settable", 0, attribute, request: .settable)
    flags[attribute] = ["value": snapshot.stepWire(value), "settable": snapshot.stepWire(settable)]
  }
  let mutationReason = [
    "not reversible in a shared Safari: WebKit's AXObjectCache::setEnhancedUserInterfaceAccessibility(true)",
    "also calls enableAccessibility() on macOS, and only a testing path turns accessibility off again, so writing",
    "the flag back to false cannot undo the AX objects and caches Safari's web process builds; AXManualAccessibility",
    "is the Chromium and Electron switch"
  ].joined(separator: " ")
  let mutation: [String: Any] = ["attempted": false, "reason": mutationReason]
  flags["mutation"] = mutation

  var walks: [String: Any] = [:]
  var webArea: Int? = nil
  if let front {
    let found = snapshot.walk("webAreaWalk", from: front, goal: .webArea, limits: SafariAXSnapshot.webAreaWalk)
    walks["webArea"] = found.wire
    webArea = found.matches.first
  } else {
    walks["webArea"] = ["skipped": "noFrontWindow"]
  }
  consider(front)
  consider(webArea)
  if let webArea {
    let webFocus = snapshot.chain("frontWindow.webArea", from: webArea, ["AXFocusedUIElement"], phase: "paths")
    paths.append(webFocus.wire)
    for reply in webFocus.replies { consider(reply.element) }
    let focused = snapshot.walk("focusWalk", from: webArea, goal: .focused, limits: SafariAXSnapshot.focusWalk)
    walks["focused"] = focused.wire
    for match in focused.matches { consider(match) }
  } else {
    paths.append(["path": "frontWindow.webArea.AXFocusedUIElement", "phase": "paths", "outcome": "unreachable",
                  "stoppedAt": "webAreaWalk", "queries": [Int](), "element": NSNull()])
    walks["focused"] = ["skipped": "noWebArea"]
  }

  // Classification, and identifiers for readable elements only, after every path and walk read.
  for index in candidates.sorted() { snapshot.classify(index, phase: "classify") }

  let secureCandidate = candidates.contains { snapshot.info[$0]["classification"] as? String == "secure" }
  let marker: [String: Any]
  if let webArea, !secureCandidate, snapshot.info[webArea]["classification"] as? String == "readable" {
    marker = snapshot.textMarker(webArea)
  } else {
    marker = ["attempted": false, "symbols": SafariAXMarkerAPI.wire,
              "skipped": webArea == nil ? "noWebArea" : (secureCandidate ? "secureCandidate" : "webAreaNotReadable")]
  }

  // The application's focus once more, after everything that may have primed Safari's AX state.
  let afterTraversal = snapshot.chain("app", from: 0, ["AXFocusedUIElement"], phase: "afterTraversal", budgeted: false)
  if let element = afterTraversal.element { snapshot.classify(element, phase: "afterTraversal") }
  paths.append(afterTraversal.wire)

  let after = safariAXFrontmost(pid)
  let ended = now()
  result["frontmostPidBefore"] = before["workspacePid"]
  result["frontmostPidAfter"] = after["workspacePid"]
  let workspaceChanged: Bool = (before["workspacePid"] as? Int) != (after["workspacePid"] as? Int)
  let ownerChanged: Bool = (before["frontWindowOwnerPid"] as? Int) != (after["frontWindowOwnerPid"] as? Int)
  let becameFront: Bool = (after["targetIsWorkspaceFrontmost"] as? Bool) == true && (before["targetIsWorkspaceFrontmost"] as? Bool) != true
  let frontmost: [String: Any] = ["before": before, "after": after, "changed": workspaceChanged || ownerChanged,
                                  "activationDetected": becameFront]
  result["frontmost"] = frontmost
  result["queries"] = snapshot.queries.map { entry -> [String: Any] in
    guard let index = SafariAXSnapshot.index(entry["element"]) else { return entry }
    var enriched = entry
    enriched["elementDescriptor"] = snapshot.descriptor(index)
    return enriched
  }
  result["paths"] = paths.map { wire -> [String: Any] in
    guard let index = SafariAXSnapshot.index(wire["element"]) else { return wire }
    var enriched = wire
    enriched["elementDescriptor"] = snapshot.descriptor(index)
    return enriched
  }
  result["elements"] = snapshot.info
  let windows: [String: Any] = ["query": SafariAXSnapshot.orNull(windowsReply?.seq), "reply": snapshot.stepWire(windowsReply),
                                "entries": windowEntries]
  result["windows"] = windows
  let frontWindow: [String: Any] = ["element": SafariAXSnapshot.orNull(front.map { SafariAXSnapshot.id($0) }),
                                    "provenance": provenance, "windowsIndex": SafariAXSnapshot.orNull(frontInWindows)]
  result["frontWindow"] = frontWindow
  result["walks"] = walks
  result["textMarker"] = marker
  result["flags"] = flags
  result["notIssued"] = snapshot.notIssued
  result["omissions"] = snapshot.omissions
  result["notQueriedByDesign"] = "field values, selected text, text for a marker range, text marker bytes"
  result["mutations"] = "none"
  result["limits"] = SafariAXSnapshot.limitsWire
  let budget: [String: Any] = ["startedAt": snapshot.startedAt, "deadline": snapshot.deadline, "endedAt": ended,
                               "spentMs": ended - snapshot.startedAt, "exhausted": !snapshot.notIssued.isEmpty]
  result["budget"] = budget
  result["ok"] = true
  return result
}
// MARK: safariAXPaths end

func now() -> Double { Date().timeIntervalSince1970 * 1000 }
while let line = readLine() {
  var answer: [String: Any] = ["startedAt": now()]
  if let data = line.data(using: .utf8), let q = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any], q["op"] as? String == "front" {
    let pid = (q["pid"] as? NSNumber)?.int32Value ?? 0
    let activate = q["activate"] as? Bool ?? true
    answer["activationRequested"] = activate
    if activate { answer["activationAccepted"] = NSRunningApplication(processIdentifier: pid)?.activate(options: []) ?? false }
    let deadline = Date().addingTimeInterval(2)
    while NSWorkspace.shared.frontmostApplication?.processIdentifier != pid && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.01)) }
    let actual = NSWorkspace.shared.frontmostApplication?.processIdentifier
    answer["frontmostPid"] = actual.map { Int($0) } ?? NSNull()
    answer["ok"] = actual == pid
    if actual != pid { answer["error"] = "target did not become foreground" }
  } else if let data = line.data(using: .utf8), let q = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any], q["op"] as? String == "clip", let text = q["text"] as? String {
    NSPasteboard.general.clearContents()
    answer["ok"] = NSPasteboard.general.setString(text, forType: .string)
  } else if let data = line.data(using: .utf8), let q = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any], q["op"] as? String == "titles" {
    answer["titles"] = windowTitles((q["pid"] as? NSNumber)?.int32Value ?? 0)
  } else if let data = line.data(using: .utf8), let q = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any], q["op"] as? String == "focusEvidence" {
    answer.merge(focusEvidence(q)) { _, new in new }
  } else if let data = line.data(using: .utf8), let q = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any], q["op"] as? String == "safariAXPaths" {
    answer.merge(safariAXPaths(q)) { _, new in new }
  } else {
    answer["error"] = "bad request"
  }
  answer["endedAt"] = now()
  let out = (try? JSONSerialization.data(withJSONObject: answer, options: [.sortedKeys])).flatMap { String(data: $0, encoding: .utf8) } ?? "{\"error\":\"encode\"}"
  print(out)
  fflush(stdout)
}
