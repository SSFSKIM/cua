// Hosted-only, owned synthetic Safari fixture. No AX writes or AXValue reads.
import AppKit
import ApplicationServices
import Darwin
import Foundation

func ms() -> Double { Double(DispatchTime.now().uptimeNanoseconds) / 1_000_000 }
struct Reply {
  let raw: CFTypeRef?
  let error: AXError
  let ms: Double
  var element: AXUIElement? {
    guard error == .success, let raw, CFGetTypeID(raw) == AXUIElementGetTypeID() else { return nil }
    return (raw as! AXUIElement)
  }
  var type: String {
    guard error == .success, let raw else { return "none" }
    switch CFGetTypeID(raw) {
    case Marker.rangeType: return "markerRange"
    case Marker.markerType: return "marker"
    case AXUIElementGetTypeID(): return "element"
    case CFStringGetTypeID(): return "string"
    case CFNumberGetTypeID(): return "number"
    case CFBooleanGetTypeID(): return "boolean"
    case AXValueGetTypeID(): return "AXValue"
    default: return "other"
    }
  }
  var wire: [String: Any] { ["error": error.rawValue, "type": type, "ms": ms] }
  var absent: Bool { error == .noValue || error == .attributeUnsupported }
}
func get(_ e: AXUIElement, _ name: String, _ param: CFTypeRef? = nil) -> Reply {
  let start = ms()
  var raw: CFTypeRef?
  let error: AXError
  if let param { error = AXUIElementCopyParameterizedAttributeValue(e, name as CFString, param, &raw) }
  else { error = AXUIElementCopyAttributeValue(e, name as CFString, &raw) }
  return Reply(raw: raw, error: error, ms: ms() - start)
}

enum Marker {
  typealias TypeID = @convention(c) () -> CFTypeID
  typealias Endpoint = @convention(c) (UnsafeRawPointer) -> UnsafeRawPointer?
  typealias Length = @convention(c) (UnsafeRawPointer) -> CFIndex
  typealias Bytes = @convention(c) (UnsafeRawPointer) -> UnsafePointer<UInt8>?
  static let lib = dlopen("/System/Library/Frameworks/ApplicationServices.framework/Frameworks/HIServices.framework/HIServices", RTLD_LAZY)
  static func symbol<T>(_ name: String, _ type: T.Type) -> T? {
    guard let lib, let p = dlsym(lib, name) else { return nil }
    return unsafeBitCast(p, to: type)
  }
  static let rangeType = symbol("AXTextMarkerRangeGetTypeID", TypeID.self)?() ?? 0
  static let markerType = symbol("AXTextMarkerGetTypeID", TypeID.self)?() ?? 0
  static let start = symbol("AXTextMarkerRangeCopyStartMarker", Endpoint.self)
  static let end = symbol("AXTextMarkerRangeCopyEndMarker", Endpoint.self)
  static let length = symbol("AXTextMarkerGetLength", Length.self)
  static let bytes = symbol("AXTextMarkerGetBytePtr", Bytes.self)
  static var available: Bool { rangeType != 0 && markerType != 0 && start != nil }
  static func pointer(_ cf: CFTypeRef) -> UnsafeRawPointer { UnsafeRawPointer(Unmanaged.passUnretained(cf).toOpaque()) }
  static func endpoint(_ r: Reply, end last: Bool = false) -> CFTypeRef? {
    guard r.type == "markerRange", let raw = r.raw, let copy = last ? end : start,
          let p = withExtendedLifetime(raw, { copy(pointer(raw)) }) else { return nil }
    let cf = Unmanaged<AnyObject>.fromOpaque(p).takeRetainedValue()
    return CFGetTypeID(cf) == markerType ? cf : nil
  }
  // Post-path synthetic diagnostic, never the means of resolving the element. No bytes, hashes, identifiers or
  // decoded offsets are persisted; summarize width and locations of LE32 words that equal the designed caret.
  static func inspect(_ marker: CFTypeRef, expected: Int) -> [String: Any] {
    guard let length, let bytes else { return ["available": false] }
    return withExtendedLifetime(marker) {
      let p = pointer(marker), n = length(p)
      guard (4...512).contains(n), let buf = bytes(p) else { return ["available": false] }
      let matches = stride(from: 0, through: n - 4, by: 4).filter { i in
        let w = UInt32(buf[i]) | UInt32(buf[i+1]) << 8 | UInt32(buf[i+2]) << 16 | UInt32(buf[i+3]) << 24
        return w == UInt32(expected)
      }
      return ["available": true, "bytes": n, "le32SlotsEqualDesignedOffset": matches]
    }
  }
  static func compare(_ a: CFTypeRef, _ b: CFTypeRef) -> Bool? {
    guard let length, let bytes else { return nil }
    return withExtendedLifetime((a,b)) {
      let p = pointer(a), q = pointer(b), n = length(p)
      guard (1...512).contains(n), let x = bytes(p), let y = bytes(q) else { return nil }
      return n == length(q) && memcmp(x, y, n) == 0
    }
  }
}

let fields: Set<String> = ["AXTextField", "AXTextArea", "AXComboBox", "AXSearchField", "AXSecureTextField"]
let knownRoles = fields.union(["AXWebArea", "AXStaticText", "AXGroup", "AXUnknown"])
func role(_ e: AXUIElement) -> String? { get(e, "AXRole").raw as? String }
func children(_ e: AXUIElement) -> [AXUIElement]? { get(e, "AXChildren").raw as? [AXUIElement] }
func owned(_ e: AXUIElement, _ pid: pid_t) -> Bool {
  var actual: pid_t = 0
  return AXUIElementGetPid(e, &actual) == .success && actual == pid
}
let subroles: Set<String> = ["AXSecureTextField", "AXSearchField"]
struct Class {
  let role: String, kind: String, subrole: String, subroleStatus: Int32, alias: String
  var wire: [String: Any] { ["role": role, "classification": kind, "subrole": subrole, "subroleStatus": subroleStatus, "secureAlias": alias] }
}
// Roles and subroles are recorded only through allowlists; secureAlias says which attribute made it secure.
func classify(_ e: AXUIElement) -> Class {
  let r = role(e), s = get(e, "AXSubrole"), sub = s.raw as? String
  let observed = r.map { knownRoles.contains($0) ? $0 : "other" } ?? "unavailable"
  let shownSub = s.error != .success ? "unavailable" : sub.map { subroles.contains($0) ? $0 : "other" } ?? "none"
  let alias = r == "AXSecureTextField" ? "role" : sub == "AXSecureTextField" ? "subrole" : "none"
  func make(_ kind: String) -> Class { Class(role: observed, kind: kind, subrole: shownSub, subroleStatus: s.error.rawValue, alias: alias) }
  if alias != "none" { return make("secure") }
  guard let r, s.absent || (s.error == .success && sub != nil) else { return make("unclassified") }
  return make(fields.contains(r) ? "plain" : "nonField")
}
func tree(_ root: AXUIElement, pid: pid_t, visit: (AXUIElement) -> Bool) {
  var queue = [root], i = 0
  while i < min(queue.count, 100) {
    let e = queue[i]; i += 1
    if owned(e, pid), visit(e) { queue += (children(e) ?? []).prefix(100) }
  }
}
func window(_ app: AXUIElement) -> AXUIElement? { get(app, "AXFocusedWindow").element ?? get(app, "AXMainWindow").element }
func webArea(_ win: AXUIElement, pid: pid_t) -> AXUIElement? {
  var found: AXUIElement?
  tree(win, pid: pid) { e in
    guard found == nil else { return false }
    if role(e) == "AXWebArea" { found = e; return false }
    return true
  }
  return found
}
func fixtureElements(_ web: AXUIElement, pid: pid_t) -> (AXUIElement?, AXUIElement?) {
  var field: AXUIElement?, filler: AXUIElement?
  tree(web, pid: pid) { e in
    switch get(e, "AXDOMIdentifier").raw as? String {
    case "probe395-target": field = e; return false
    case "large-before-editor": filler = e; return false
    default: return role(e).map { !fields.contains($0) } ?? false
    }
  }
  return (field, filler)
}

// Metadata-only replay of #354's live 200-node, 12-depth, 40-ms reference walk.
func walk(_ win: AXUIElement, target: AXUIElement) -> [String: Any] {
  let start = ms()
  var queue: [(AXUIElement, Int)] = [(win, 0)], i = 0
  var reason = "complete", found: AXUIElement?
  while i < queue.count {
    if i >= 200 { reason = "nodes"; break }
    if ms() - start > 40 { reason = "time"; break }
    let (e, depth) = queue[i]; i += 1
    let r = get(e, "AXRole")
    if let name = r.raw as? String {
      if fields.contains(name) {
        let f = get(e, "AXFocused")
        if let b = f.raw as? Bool {
          if b { if found != nil { reason = "ambiguous"; break }; found = e }
        } else if !f.absent { reason = "failed"; break }
        continue
      }
    } else if !r.absent { reason = "failed"; break }
    let c = get(e, "AXChildren")
    if let kids = c.raw as? [AXUIElement] {
      if depth >= 12 && !kids.isEmpty { reason = "depth"; break }
      queue += kids.map { ($0, depth + 1) }
    } else if !c.absent { reason = "failed"; break }
  }
  return ["ms": ms() - start, "reason": reason, "nodes": i,
          "correctTarget": reason == "complete" && (found.map { CFEqual($0, target) } ?? false)]
}

struct Route {
  let range: Reply
  let start: CFTypeRef?
  let field: AXUIElement?
  let origin: AXUIElement?
  let originClass: Class?
  let wire: [String: Any]
}
func route(_ web: AXUIElement, pid: pid_t) -> Route {
  let began = ms(), range = get(web, "AXSelectedTextMarkerRange"), before = ms()
  let start = Marker.endpoint(range), endpointMs = ms() - before
  var path: [[String: Any]] = [], element: [String: Any]?, field: AXUIElement?
  var origin: AXUIElement?, originClass: Class?, aliasRole = 0, aliasSubrole = 0
  if let start {
    let resolved = get(web, "AXUIElementForTextMarker", start)
    element = resolved.wire
    origin = resolved.element
    var current = origin
    for hop in 0...4 {
      guard let e = current, owned(e, pid) else { break }
      let c = classify(e)
      if hop == 0 { originClass = c }
      if c.alias == "role" { aliasRole += 1 } else if c.alias == "subrole" { aliasSubrole += 1 }
      var step = c.wire
      if c.kind == "plain" || c.kind == "secure" { field = e }
      if c.kind == "nonField" && c.role != "AXWebArea" && hop < 4 {
        let p = get(e, "AXParent")
        step["parent"] = p.wire
        current = p.element
      } else { current = nil }
      path.append(step)
    }
  }
  return Route(range: range, start: start, field: field, origin: origin, originClass: originClass,
    wire: ["range": range.wire, "startMarker": start != nil, "endpointMs": endpointMs,
           "element": element.map { $0 as Any } ?? NSNull(), "path": path,
           "originClass": originClass.map { $0.wire as Any } ?? NSNull(),
           "secureRoleAliasCount": aliasRole, "secureSubroleAliasCount": aliasSubrole, "ms": ms() - began])
}

// A returned quantity that is not the designed one is classified, never echoed.
func numberShape(_ r: Reply, expected: Int) -> [String: Any] {
  var out = r.wire
  if r.type == "number", let n = r.raw as? NSNumber {
    let v = n.intValue
    out["equalsDesignedQuantity"] = v == expected
    out["valueClass"] = v == 0 ? "zero" : v == Int(Int32.max) || v == NSNotFound || v == -1 ? "notFound" : v < 0 ? "negative" : "other"
  }
  return out
}
func rangeShape(_ r: Reply, caret: Int, end: Int) -> [String: Any] {
  var out = r.wire
  if let v = r.raw, r.type == "AXValue", AXValueGetType(v as! AXValue) == .cfRange {
    var cf = CFRange()
    if AXValueGetValue(v as! AXValue, .cfRange, &cf) {
      out["isRange"] = true
      out["equalsDesignedSelection"] = cf.location == caret && cf.length == end - caret
      out["empty"] = cf.length == 0
    }
  }
  return out
}
// String and length through one token on one receiver. Only shape is kept, never content.
func tokenQueries(_ receiver: AXUIElement, token: CFTypeRef, start: CFTypeRef?, caret: Int, end: Int, masks: Bool) -> [String: Any] {
  var out: [String: Any] = ["attempted": true]
  if let start {
    out["AXUIElementForTextMarker"] = get(receiver, "AXUIElementForTextMarker", start).wire
    out["AXIndexForTextMarker"] = numberShape(get(receiver, "AXIndexForTextMarker", start), expected: caret)
  }
  let str = get(receiver, "AXStringForTextMarkerRange", token)
  var shape = str.wire
  if let raw = str.raw, str.type == "string" {
    let s = raw as! CFString, n = CFStringGetLength(s)
    if masks {
      let allMasked = n > 0 && (0..<n).allSatisfy { [0x2022, 0x25CF, 0x25E6, 0x2A].contains(Int(CFStringGetCharacterAtIndex(s, $0))) }
      shape["stringShape"] = n == 0 ? "empty" : allMasked ? "maskGlyphsOnly" : "unmaskedOrOther"
    } else { shape["stringShape"] = n == 0 ? "empty" : "nonEmpty" }
    shape["lengthEqualsDesignedSelection"] = n == end - caret
  }
  out["AXStringForTextMarkerRange"] = shape
  out["AXLengthForTextMarkerRange"] = numberShape(get(receiver, "AXLengthForTextMarkerRange", token), expected: end - caret)
  return out
}
// Whether a marker start resolves, through the receiver, to exactly the fixture field (bounded parent walk).
func mapsToField(_ receiver: AXUIElement, start: CFTypeRef, field: AXUIElement, pid: pid_t) -> Bool {
  var current = get(receiver, "AXUIElementForTextMarker", start).element
  for _ in 0...4 {
    guard let e = current, owned(e, pid) else { return false }
    if CFEqual(e, field) { return true }
    let c = classify(e)
    guard c.kind == "nonField", c.role != "AXWebArea" else { return false }
    current = get(e, "AXParent").element
  }
  return false
}
// Synthetic-password diagnostic only. No values, offsets, hashes or content retained. A token is queried for string and
// length only when it resolves to exactly the fixture field, and then on either receiver; otherwise only its own result
// is reported.
func secureDiagnostics(web: AXUIElement, field: AXUIElement, pid: pid_t, webRange: Reply, webStart: CFTypeRef?, webMapped: Bool,
                       count: Int, caret: Int, end: Int) -> [String: Any] {
  let own = get(field, "AXSelectedTextMarkerRange"), ownStart = Marker.endpoint(own)
  let ownMapped = ownStart.map { mapsToField(field, start: $0, field: field, pid: pid) || mapsToField(web, start: $0, field: field, pid: pid) } ?? false
  func entry(_ r: Reply, _ start: CFTypeRef?, mapped: Bool) -> [String: Any] {
    var out: [String: Any] = ["range": r.wire, "mappedToFixtureField": mapped]
    guard r.type == "markerRange", let token = r.raw else { out["receivers"] = "not-attempted:no-marker-range"; return out }
    guard mapped else { out["receivers"] = "not-attempted:token-not-mapped-to-fixture-field"; return out }
    out["receivers"] = ["webArea": tokenQueries(web, token: token, start: start, caret: caret, end: end, masks: true),
                        "field": tokenQueries(field, token: token, start: start, caret: caret, end: end, masks: true)]
    return out
  }
  return ["receiver": ["webArea": ["AXNumberOfCharacters": numberShape(get(web, "AXNumberOfCharacters"), expected: count),
                                    "AXSelectedTextRange": rangeShape(get(web, "AXSelectedTextRange"), caret: caret, end: end)],
                       "field": ["AXNumberOfCharacters": numberShape(get(field, "AXNumberOfCharacters"), expected: count),
                                 "AXSelectedTextRange": rangeShape(get(field, "AXSelectedTextRange"), caret: caret, end: end)]],
          "webToken": entry(webRange, webStart, mapped: webMapped),
          "fieldToken": entry(own, ownStart, mapped: ownMapped),
          "skipped": !webMapped && !ownMapped]
}

struct Comparison {
  let kind: String
  let recipe: Int
  let element: AXUIElement
  let origin: AXUIElement?
  let originClass: Class?
  let start: CFTypeRef
  let end: CFTypeRef
}
// Probe-only: retain opaque endpoints in memory for matched-pair comparison, never serialize them.
var comparisons: [String: Comparison] = [:]
func frontPID() -> pid_t? { NSWorkspace.shared.frontmostApplication?.processIdentifier }
func ownerPID() -> Int? {
  let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]
  return windows?.first { ($0[kCGWindowLayer as String] as? Int) == 0 }?[kCGWindowOwnerPID as String] as? Int
}

// Continuous witness of any activation other than the cover, from arm to disarm. Counts and a Safari/WebKit flag only.
final class Witness: @unchecked Sendable {
  private let lock = NSLock()
  private var n = 0, webkit = false
  func add(webkit w: Bool) { lock.lock(); n += 1; webkit = webkit || w; lock.unlock() }
  var snapshot: (count: Int, webkit: Bool) { lock.lock(); defer { lock.unlock() }; return (n, webkit) }
}
struct Armed {
  let pid: pid_t, cover: pid_t
  let witness: Witness
  let observer: NSObjectProtocol
}
var armed: Armed?
func boundary(_ a: Armed) -> (reason: String?, wire: [String: Any]) {
  let owner = ownerPID(), front = frontPID(), w = a.witness.snapshot
  var wire: [String: Any] = ["witnesses": w.count, "webkitWitness": w.webkit, "ownerDeterminable": owner != nil]
  if let owner { wire["ownerIsCover"] = owner == Int(a.cover) }
  let reason: String? = front != a.cover ? "cover-not-front" : front == a.pid ? "safari-front"
    : owner.map { $0 != Int(a.cover) } == true ? "owner-not-cover" : w.count > 0 ? "cover-changed" : nil
  return (reason, wire)
}
func validPair(_ q: [String: Any]) -> (pid: pid_t, cover: pid_t)? {
  guard let pid = (q["pid"] as? NSNumber)?.int32Value, let cover = (q["coverPid"] as? NSNumber)?.int32Value,
        pid > 0, cover > 0, pid != cover,
        NSRunningApplication(processIdentifier: pid)?.bundleIdentifier == "com.apple.Safari",
        NSRunningApplication(processIdentifier: cover)?.bundleIdentifier == "com.apple.TextEdit" else { return nil }
  return (pid, cover)
}
func disarmObserver() {
  if let a = armed { NSWorkspace.shared.notificationCenter.removeObserver(a.observer) }
  armed = nil
}
func arm(_ q: [String: Any]) -> [String: Any] {
  disarmObserver()
  guard let p = validPair(q) else { return ["valid": false, "reason": "request"] }
  let witness = Witness(), center = NSWorkspace.shared.notificationCenter
  // queue nil: delivered synchronously on the posting (main) thread whenever the main run loop runs.
  let observer = center.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: nil) { note in
    guard let a = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication, a.processIdentifier != p.cover else { return }
    let id = a.bundleIdentifier ?? ""
    witness.add(webkit: id == "com.apple.Safari" || id.hasPrefix("com.apple.WebKit"))
  }
  let a = Armed(pid: p.pid, cover: p.cover, witness: witness, observer: observer)
  armed = a
  let b = boundary(a)
  var w = b.wire
  if let reason = b.reason { disarmObserver(); w["valid"] = false; w["reason"] = reason + "-at-arm"; return w }
  w["valid"] = true
  return w
}
func disarm() -> [String: Any] {
  guard let a = armed else { return ["valid": false, "reason": "not-armed"] }
  RunLoop.current.run(until: Date().addingTimeInterval(0.05))
  let b = boundary(a)
  disarmObserver()
  var w = b.wire
  w["valid"] = b.reason == nil
  if let reason = b.reason { w["reason"] = reason + "-at-disarm" }
  return w
}

func measure(_ q: [String: Any]) -> [String: Any] {
  guard let p = validPair(q), let nonce = q["nonce"] as? String, !nonce.isEmpty, let large = q["large"] as? Bool,
        let kind = q["kind"] as? String, ["plain", "secret", "password"].contains(kind),
        let caret = q["expectedCaret"] as? Int, let end = q["expectedSelectionEnd"] as? Int,
        let count = q["expectedLength"] as? Int, 0 <= caret, caret <= end, end <= count, count <= 512 else {
    return ["valid": false, "reason": "request"]
  }
  let pid = p.pid
  guard Marker.available, AXIsProcessTrusted() else { return ["valid": false, "reason": "AX-or-symbols-unavailable"] }
  guard let a = armed, a.pid == pid, a.cover == p.cover else { return ["valid": false, "reason": "not-armed"] }
  let first = boundary(a)
  if let reason = first.reason { var w = first.wire; w["valid"] = false; w["reason"] = reason + "-before"; return w }
  let scopeStart = ms(), app = AXUIElementCreateApplication(pid)
  AXUIElementSetMessagingTimeout(app, 0.5)
  guard let win = window(app), (get(win, "AXTitle").raw as? String)?.contains(nonce) == true,
        let web = webArea(win, pid: pid) else { return ["valid": false, "reason": "scope"] }
  let webClass = classify(web)
  guard webClass.role == "AXWebArea", webClass.kind == "nonField" else { return ["valid": false, "reason": "web-class" ] }
  let scopeMs = ms() - scopeStart, r = route(web, pid: pid)
  let (field, filler) = fixtureElements(web, pid: pid)
  guard let field else { return ["valid": false, "reason": "fixture-field", "route": r.wire] }
  let target = classify(field)
  let expectedClass = kind == "password"
    ? (target.role == "AXTextField" || target.role == "AXSecureTextField") && target.kind == "secure"
    : target.role == "AXTextField" && target.kind == "plain"
  guard expectedClass else {
    return ["valid": false, "reason": "fixture-classification", "target": target.wire, "route": r.wire]
  }
  let nodes = filler.flatMap { children($0)?.count } ?? 0
  guard large ? nodes >= 1000 : filler == nil else { return ["valid": false, "reason": "fixture-size", "axFillerChildren": nodes] }
  let correct = r.field.map { CFEqual($0, field) } ?? false, observedFocus = get(field, "AXFocused")
  var evidence: [String: Any] = ["valid": true, "scopeMs": scopeMs, "route": r.wire, "correctTarget": correct,
    "wrongField": r.field != nil && !correct, "targetRole": target.role, "targetClass": target.kind, "target": target.wire,
    "axFillerChildren": nodes, "focus": observedFocus.wire, "axFocusedTrue": observedFocus.raw as? Bool == true,
    "directFocus": [app, win, web].map { get($0, "AXFocusedUIElement").wire },
    "walk": walk(win, target: field)]
  if kind == "password" {
    evidence["passwordDiagnostics"] = secureDiagnostics(web: web, field: field, pid: pid, webRange: r.range, webStart: r.start,
      webMapped: correct, count: count, caret: caret, end: end)
  } else if correct, let start = r.start, let endMarker = Marker.endpoint(r.range, end: true) {
    evidence["endpointStart"] = Marker.inspect(start, expected: caret)
    evidence["endpointEnd"] = Marker.inspect(endMarker, expected: end)
    evidence["collapsedEndpointsEqual"] = Marker.compare(start, endMarker)
    if kind == "plain", end > caret, r.range.type == "markerRange", let token = r.range.raw {
      // Post-path controls on a non-collapsed plain selection: string/length shape, and the range object itself (not its
      // start marker) handed to AXUIElementForTextMarker, recording error and type only.
      var control = tokenQueries(web, token: token, start: start, caret: caret, end: end, masks: false)
      control["rangeObjectToElementForTextMarker"] = get(web, "AXUIElementForTextMarker", token).wire
      evidence["plainPositiveControl"] = control
    }
    if let key = q["comparisonKey"] as? String, let recipe = q["recipe"] as? Int {
      if let prev = comparisons.removeValue(forKey: key) {
        let same = CFEqual(field, prev.element)
        let sameOrigin: Any = (r.origin != nil && prev.origin != nil) ? CFEqual(r.origin!, prev.origin!) : NSNull()
        evidence["pair"] = ["sameField": same, "sameKind": kind == prev.kind, "sameRecipe": recipe == prev.recipe,
          "sameOrigin": sameOrigin, "originNow": r.originClass.map { $0.wire as Any } ?? NSNull(),
          "originPrevious": prev.originClass.map { $0.wire as Any } ?? NSNull(),
          "startBytesEqual": same ? (Marker.compare(start, prev.start).map { $0 as Any } ?? NSNull()) : NSNull(),
          "endBytesEqual": same ? (Marker.compare(endMarker, prev.end).map { $0 as Any } ?? NSNull()) : NSNull()]
      } else if comparisons.count < 100 {
        comparisons[key] = Comparison(kind: kind, recipe: recipe, element: field, origin: r.origin, originClass: r.originClass,
                                      start: start, end: endMarker)
      }
    }
  }
  RunLoop.current.run(until: Date().addingTimeInterval(0.05))
  let last = boundary(a)
  evidence["witnesses"] = last.wire["witnesses"]
  evidence["webkitWitness"] = last.wire["webkitWitness"]
  evidence["ownerDeterminable"] = last.wire["ownerDeterminable"]
  if let reason = last.reason {
    evidence["valid"] = false
    evidence["reason"] = reason == "cover-changed" ? reason : reason + "-after"
    comparisons.removeAll()
  }
  return evidence
}

func dispatch(_ q: [String: Any]) -> [String: Any] {
  switch q["op"] as? String {
  case "measure": return measure(q)
  case "arm": return arm(q)
  case "disarm": return disarm()
  default: break
  }
  guard let pid = (q["pid"] as? NSNumber)?.int32Value, pid > 0 else { return [:] }
  switch q["op"] as? String {
  case "front":
    if q["activate"] as? Bool == true {
      let app = NSRunningApplication(processIdentifier: pid)
      let accepted = app?.activate(options: []) ?? false
      let deadline = ms() + 2000
      while frontPID() != pid && ms() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.01)) }
      // Fixed-label diagnostic, never a pid: whether the request was accepted and where the workspace ended up.
      let now = frontPID(), safari = (q["safariPid"] as? NSNumber)?.int32Value
      let where_ = now == pid ? "target" : now == nil ? "none" : now == safari ? "safari" : "other"
      return ["frontmostPid": now.map { $0 as Any } ?? NSNull(), "activationAccepted": accepted,
              "targetBundle": app?.bundleIdentifier == "com.apple.TextEdit" ? "TextEdit" : app?.bundleIdentifier == "com.apple.Safari" ? "Safari" : app == nil ? "none" : "other",
              "targetTerminated": app?.isTerminated ?? true, "workspaceFront": where_]
    }
    return ["frontmostPid": frontPID().map { $0 as Any } ?? NSNull()]
  case "titles":
    let app = AXUIElementCreateApplication(pid)
    AXUIElementSetMessagingTimeout(app, 0.5)
    let windows = get(app, "AXWindows").raw as? [AXUIElement] ?? []
    return ["titles": windows.compactMap { get($0, "AXTitle").raw as? String }]
  default: return [:]
  }
}

func handle(_ line: String) -> String {
  guard let data = line.data(using: .utf8), let q = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
        let reply = try? JSONSerialization.data(withJSONObject: dispatch(q), options: [.sortedKeys]),
        let out = String(data: reply, encoding: .utf8) else { return "{\"valid\":false,\"reason\":\"wire\"}" }
  return out
}

guard ProcessInfo.processInfo.environment["RUNNER_ENVIRONMENT"] == "github-hosted" else { exit(2) }
// Requests are read off the main thread and handled at the top level of the main thread's own run loop (as #354's tool
// does). Running a request inside DispatchQueue.main.sync would hold the main queue for its whole duration, and the
// workspace's activation and frontmost updates are delivered through that queue, so an activation could never complete.
final class Inbox: @unchecked Sendable {
  private let lock = NSLock()
  private var lines: [String?] = []
  func push(_ l: String?) { lock.lock(); lines.append(l); lock.unlock() }
  // nil: nothing queued; .some(nil): end of input.
  func pop() -> String?? { lock.lock(); defer { lock.unlock() }; return lines.isEmpty ? nil : lines.removeFirst() }
}
let inbox = Inbox()
Thread.detachNewThread {
  while let line = readLine() { inbox.push(line) }
  inbox.push(nil)  // end of input: the main thread drains what is queued, then exits
}
RunLoop.main.add(Port(), forMode: .default)  // keeps run(until:) waiting instead of returning at once
while true {
  if let item = inbox.pop() {
    guard let line = item else { exit(0) }
    print(handle(line))
    fflush(stdout)
  } else {
    RunLoop.main.run(mode: .default, before: Date().addingTimeInterval(0.01))
  }
}
