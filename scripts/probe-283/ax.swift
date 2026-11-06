// #283 probe's AX side, one JSON line per invocation (scripts/probe-283/probe.mjs runs it as a child of the job shell,
// which holds the runner image's Accessibility grant).
//   ax act <pid> <x> <y> <spec-json>   the hit asked of the application at the point (the engine's hit-test), its role
//       chain up to the AXWebArea, the target the spec names (the hit, or its AXEditableAncestor), the spec's writes on
//       it (focus: AXFocused true; press: AXPress; in the order given, joined by +), then a poll of the target's AXFocused,
//       the application's AXFocusedUIElement, the target's AXPress and the front window's owner, every 25 ms for
//       pollMs, recording changes; then the spec's caret placements (range: AXRangeForPosition at the point, then
//       AXSelectedTextRange {loc, 0}; marker: AXTextMarkerForPosition, AXTextMarkerRangeForUnorderedTextMarkers [m, m],
//       then AXSelectedTextMarkerRange), each read back; the window order (CGWindowListCopyWindowInfo) before and after.
//       Spec: {route: "none"|"focus"|"press"|"focus+press"|…, target: "hit"|"editable", pollMs, dump: "before"|"after"|
//       "none", place: [{kind, x, y, expect}], placeDelayMs, expect: [{name, offset, x, y}]}
//   ax order <pid>                       the on-screen layer-0 windows front to back, and where the pid's and TextEdit's are
import AppKit
import ApplicationServices
import Foundation

setvbuf(stdout, nil, _IOLBF, 0)
func nowMs() -> Double { (Date().timeIntervalSince1970 * 1000).rounded() }
func emit(_ object: Any) {
  print(String(data: try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]), encoding: .utf8)!)
}

func copy(_ e: AXUIElement, _ name: String) -> (CFTypeRef?, Int32) {
  var v: CFTypeRef?
  let r = AXUIElementCopyAttributeValue(e, name as CFString, &v)
  return (r == .success ? v : nil, r.rawValue)
}
func attr(_ e: AXUIElement, _ name: String) -> CFTypeRef? { copy(e, name).0 }
func str(_ e: AXUIElement, _ name: String) -> String? { attr(e, name) as? String }
func orNull(_ s: Any?) -> Any { s ?? NSNull() }
func element(_ ref: CFTypeRef?) -> AXUIElement? {
  guard let ref, CFGetTypeID(ref) == AXUIElementGetTypeID() else { return nil }
  return (ref as! AXUIElement)
}
func param(_ e: AXUIElement, _ name: String, _ p: CFTypeRef) -> (CFTypeRef?, Int32) {
  var v: CFTypeRef?
  let r = AXUIElementCopyParameterizedAttributeValue(e, name as CFString, p, &v)
  return (r == .success ? v : nil, r.rawValue)
}
func names(_ e: AXUIElement) -> [String] { var n: CFArray?; return AXUIElementCopyAttributeNames(e, &n) == .success ? (n as? [String] ?? []) : [] }
func pnames(_ e: AXUIElement) -> [String] {
  var n: CFArray?
  return AXUIElementCopyParameterizedAttributeNames(e, &n) == .success ? (n as? [String] ?? []) : []
}
func actions(_ e: AXUIElement) -> [String]? { var n: CFArray?; return AXUIElementCopyActionNames(e, &n) == .success ? (n as? [String] ?? []) : nil }
func settable(_ e: AXUIElement, _ name: String) -> Any {
  var b: DarwinBoolean = false
  let r = AXUIElementIsAttributeSettable(e, name as CFString, &b)
  return r == .success ? b.boolValue : "error \(r.rawValue)" as Any
}

func describe(_ ref: CFTypeRef?, depth: Int = 0) -> Any {
  guard let ref else { return NSNull() }
  let t = CFGetTypeID(ref)
  if t == CFStringGetTypeID() { let s = ref as! String; return s.count > 120 ? String(s.prefix(120)) + "…" : s }
  if t == CFBooleanGetTypeID() { return (ref as! NSNumber).boolValue }
  if t == CFNumberGetTypeID() { return ref as! NSNumber }
  if t == AXValueGetTypeID() {
    let v = ref as! AXValue
    switch AXValueGetType(v) {
    case .cgPoint: var p = CGPoint.zero; AXValueGetValue(v, .cgPoint, &p); return ["x": p.x, "y": p.y]
    case .cgSize: var s = CGSize.zero; AXValueGetValue(v, .cgSize, &s); return ["w": s.width, "h": s.height]
    case .cgRect: var r = CGRect.zero; AXValueGetValue(v, .cgRect, &r); return ["x": r.minX, "y": r.minY, "w": r.width, "h": r.height]
    case .cfRange: var r = CFRange(); AXValueGetValue(v, .cfRange, &r); return ["loc": r.location, "len": r.length]
    default: return "<AXValue \(AXValueGetType(v).rawValue)>"
    }
  }
  if t == AXUIElementGetTypeID() {
    let e = ref as! AXUIElement
    return ["element": str(e, kAXRoleAttribute) ?? "?", "dom": orNull(str(e, "AXDOMIdentifier"))]
  }
  if t == CFArrayGetTypeID() {
    let a = ref as! [AnyObject]
    if depth > 0 { return "array(\(a.count))" }
    return a.prefix(4).map { describe($0, depth: 1) } + (a.count > 4 ? ["…\(a.count)"] : [])
  }
  return "<\(CFCopyTypeIDDescription(t) as String)>"
}

func rangeValue(_ loc: Int, _ len: Int) -> AXValue { var r = CFRange(location: loc, length: len); return AXValueCreate(.cfRange, &r)! }
func pointValue(_ p: CGPoint) -> AXValue { var q = p; return AXValueCreate(.cgPoint, &q)! }
func rect(_ ref: CFTypeRef?) -> CGRect? {
  guard let ref, CFGetTypeID(ref) == AXValueGetTypeID() else { return nil }
  var r = CGRect.zero
  return AXValueGetValue(ref as! AXValue, .cgRect, &r) ? r : nil
}
func cfRange(_ ref: CFTypeRef?) -> CFRange? {
  guard let ref, CFGetTypeID(ref) == AXValueGetTypeID() else { return nil }
  var r = CFRange()
  return AXValueGetValue(ref as! AXValue, .cfRange, &r) ? r : nil
}

// One level of a role chain. `full` adds every attribute name, the settable ones and the parameterized ones.
let watched = ["AXFocused", "AXEditableAncestor", "AXFocusableAncestor", "AXHighestEditableAncestor", "AXSelectedTextRange",
               "AXNumberOfCharacters", "AXInsertionPointLineNumber", "AXSelectedTextMarkerRange", "AXDOMIdentifier", "AXVisibleCharacterRange"]
func level(_ e: AXUIElement, full: Bool) -> [String: Any] {
  var o: [String: Any] = ["role": str(e, kAXRoleAttribute) ?? "?", "subrole": orNull(str(e, kAXSubroleAttribute)),
                          "roleDescription": orNull(str(e, kAXRoleDescriptionAttribute)),
                          "title": orNull(str(e, kAXTitleAttribute)), "description": orNull(str(e, kAXDescriptionAttribute)),
                          "value": describe(attr(e, kAXValueAttribute)), "actions": actions(e) ?? ["error"]]
  var read: [String: Any] = [:]
  for n in watched { let (v, err) = copy(e, n); read[n] = v != nil ? describe(v) : "error \(err)" }
  o["read"] = read
  o["settableWatched"] = Dictionary(uniqueKeysWithValues: ["AXFocused", "AXSelectedTextRange", "AXSelectedTextMarkerRange", "AXValue"].map { ($0, settable(e, $0)) })
  if full {
    let ns = names(e)
    o["attributes"] = ns
    o["settable"] = ns.filter { settable(e, $0) as? Bool == true }
    o["parameterized"] = pnames(e)
  }
  return o
}

func ancestors(_ start: AXUIElement) -> [AXUIElement] {
  var out: [AXUIElement] = [], cur: AXUIElement? = start
  while let e = cur, out.count < 40 {
    out.append(e)
    let role = str(e, kAXRoleAttribute) ?? "?"
    if ["AXWebArea", "AXWindow", "AXApplication"].contains(role) { break }
    cur = element(attr(e, kAXParentAttribute))
  }
  return out
}
func chain(_ hit: AXUIElement, full: Bool) -> [[String: Any]] {
  let editable = element(attr(hit, "AXEditableAncestor")), focusable = element(attr(hit, "AXFocusableAncestor"))
  return ancestors(hit).map { e in
    var o = level(e, full: full)
    o["isHitEditableAncestor"] = editable.map { CFEqual($0, e) } ?? false
    o["isHitFocusableAncestor"] = focusable.map { CFEqual($0, e) } ?? false
    return o
  }
}

func windows() -> [[String: Any]] {
  let list = (CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]) ?? []
  return list.filter { ($0[kCGWindowLayer as String] as? Int) == 0 }
}
func order(_ pid: pid_t) -> [String: Any] {
  let w = windows()
  let top = w.prefix(8).map { ["owner": $0[kCGWindowOwnerName as String] ?? NSNull(), "pid": $0[kCGWindowOwnerPID as String] ?? NSNull(),
                               "number": $0[kCGWindowNumber as String] ?? NSNull()] }
  return ["top": top, "pidIndex": w.firstIndex { ($0[kCGWindowOwnerPID as String] as? Int) == Int(pid) } ?? NSNull(),
          "textEditIndex": w.firstIndex { ($0[kCGWindowOwnerName as String] as? String) == "TextEdit" } ?? NSNull(),
          "frontOwner": w.first?[kCGWindowOwnerName as String] ?? NSNull()]
}
func frontOwner() -> String { windows().first?[kCGWindowOwnerName as String] as? String ?? "?" }

func boundsCheck(_ e: AXUIElement, _ loc: Int, _ p: CGPoint) -> [String: Any] {
  let (v, err) = param(e, "AXBoundsForRange", rangeValue(loc, 1))
  guard let r = rect(v) else { return ["offset": loc, "error": err] }
  return ["offset": loc, "rect": describe(v), "containsPoint": r.insetBy(dx: -1, dy: -1).contains(p), "dx": p.x - r.minX, "dy": p.y - r.midY]
}

let args = CommandLine.arguments
if args.count == 3, args[1] == "order", let pid = pid_t(args[2]) { emit(order(pid)); exit(0) }
guard args.count == 6, args[1] == "act", let pid = pid_t(args[2]), let x = Double(args[3]), let y = Double(args[4]),
      let spec = try? JSONSerialization.jsonObject(with: Data(args[5].utf8)) as? [String: Any] else { emit(["usage": true]); exit(2) }
let point = CGPoint(x: x, y: y)
let app = AXUIElementCreateApplication(pid)
AXUIElementSetMessagingTimeout(app, 3)
var out: [String: Any] = ["trusted": AXIsProcessTrusted(), "startMs": nowMs(), "point": ["x": x, "y": y]]
out["orderBefore"] = order(pid)
var hitRef: AXUIElement?
let hitError = AXUIElementCopyElementAtPosition(app, Float(x), Float(y), &hitRef)
out["hitError"] = hitError.rawValue
out["hitAtMs"] = nowMs()
guard let hit = hitRef else { emit(out); exit(0) }
out["hit"] = ["role": str(hit, kAXRoleAttribute) ?? "?", "dom": orNull(str(hit, "AXDOMIdentifier")), "actions": actions(hit) ?? ["error"]] as [String: Any]
let webArea = ancestors(hit).first { str($0, kAXRoleAttribute) == "AXWebArea" }
let target: AXUIElement
switch spec["target"] as? String ?? "hit" {
case "editable": target = element(attr(hit, "AXEditableAncestor")) ?? hit
default: target = hit
}
out["target"] = ["role": str(target, kAXRoleAttribute) ?? "?", "dom": orNull(str(target, "AXDOMIdentifier")),
                 "isHit": CFEqual(target, hit), "actions": actions(target) ?? ["error"],
                 "selectedTextRange": describe(attr(target, "AXSelectedTextRange")), "focused": describe(attr(target, "AXFocused"))]
let dump = spec["dump"] as? String ?? "none"
if dump == "before" { out["chainBefore"] = chain(hit, full: true); out["chainBeforeDoneMs"] = nowMs() }

var writes: [[String: Any]] = []
let route = spec["route"] as? String ?? "none"
if route != "none" {
  for op in route.split(separator: "+") {
    let t = nowMs()
    let err: AXError
    switch op {
    case "focus": err = AXUIElementSetAttributeValue(target, kAXFocusedAttribute as CFString, kCFBooleanTrue)
    case "select": err = AXUIElementSetAttributeValue(target, "AXSelectedTextRange" as CFString,
                                                      rangeValue((spec["selectLoc"] as? NSNumber)?.intValue ?? 0, 0))
    default: err = AXUIElementPerformAction(target, kAXPressAction as CFString)
    }
    writes.append(["op": String(op), "atMs": t, "error": err.rawValue, "tookMs": nowMs() - t])
  }
}
out["writes"] = writes
let writeAt = writes.first?["atMs"] as? Double ?? nowMs()

// The poll: a row whenever the watched state changes, with its time after the first write.
let pollMs = (spec["pollMs"] as? NSNumber)?.doubleValue ?? 0
var poll: [[String: Any]] = [], last: NSDictionary = [:]
let pollEnd = nowMs() + pollMs
while pollMs > 0 {
  let t = nowMs()
  let appFocus = element(attr(app, kAXFocusedUIElementAttribute))
  let snap: [String: Any] = [
    "focused": describe(attr(target, "AXFocused")), "appFocusIsTarget": appFocus.map { CFEqual($0, target) } ?? false,
    "appFocusRole": appFocus.flatMap { str($0, kAXRoleAttribute) } ?? NSNull(), "appFocusDom": appFocus.flatMap { str($0, "AXDOMIdentifier") } ?? NSNull(),
    "press": (actions(target) ?? []).contains("AXPress"), "frontOwner": frontOwner(),
    "selectedTextRange": describe(attr(target, "AXSelectedTextRange")),
  ]
  if !NSDictionary(dictionary: snap).isEqual(last) { var row = snap; row["t"] = t - writeAt; poll.append(row); last = NSDictionary(dictionary: snap) }
  if t >= pollEnd { break }
  usleep(25_000)
}
out["poll"] = poll

// Caret placements.
let placeDelay = (spec["placeDelayMs"] as? NSNumber)?.doubleValue ?? 600
var steps: [[String: Any]] = []
for step in spec["place"] as? [[String: Any]] ?? [] {
  usleep(UInt32(placeDelay * 1000))
  let p = CGPoint(x: (step["x"] as? NSNumber)?.doubleValue ?? 0, y: (step["y"] as? NSNumber)?.doubleValue ?? 0)
  let kind = step["kind"] as? String ?? "range"
  var rec: [String: Any] = ["kind": kind, "x": p.x, "y": p.y, "expect": step["expect"] ?? NSNull(),
                            "selectedBefore": describe(attr(target, "AXSelectedTextRange"))]
  func writeRange(_ loc: Int) {
    let t = nowMs()
    rec["writeAtMs"] = t
    rec["writeLoc"] = loc
    rec["writeError"] = AXUIElementSetAttributeValue(target, "AXSelectedTextRange" as CFString, rangeValue(loc, 0)).rawValue
    rec["bounds"] = boundsCheck(target, loc, p)
  }
  if kind == "known" {
    // The offset the page says is under the point, written straight: does the write itself place the caret?
    writeRange((step["expect"] as? NSNumber)?.intValue ?? 0)
  } else if kind == "bounds" || kind == "bounds-hit" {
    // The offset found from AXBoundsForRange: the character whose box holds the point, its left half before it. bounds
    // scans the target; bounds-hit scans the hit (a contenteditable's AXStaticText, whose boxes are real where the
    // editable's own are empty) and writes the offset found on the target as it is (one text node: the same offsets).
    let scanned = kind == "bounds-hit" ? hit : target
    let n = (attr(scanned, "AXNumberOfCharacters") as? NSNumber)?.intValue ?? (str(scanned, kAXValueAttribute)?.utf16.count ?? 0)
    let t0 = nowMs()
    var found: Int?, calls = 0
    for i in 0..<n {
      calls += 1
      guard let r = rect(param(scanned, "AXBoundsForRange", rangeValue(i, 1)).0) else { continue }
      if r.insetBy(dx: 0, dy: -0.5).contains(p) || (p.x >= r.minX && p.x < r.maxX && p.y >= r.minY && p.y <= r.maxY) {
        found = p.x < r.midX ? i : i + 1
        break
      }
    }
    rec["scan"] = ["characters": n, "calls": calls, "ms": nowMs() - t0, "found": found ?? NSNull()]
    if let found { writeRange(found) }
  } else if kind == "range" {
    // AXRangeForPosition answered {0, 0} once in run 1: ask three times, 150 ms apart, in case it answers from a cache.
    var answers: [Any] = [], last: CFRange?
    for i in 0..<3 {
      if i > 0 { usleep(150_000) }
      let (r, err) = param(target, "AXRangeForPosition", pointValue(p))
      answers.append(r != nil ? describe(r) : "error \(err)")
      last = cfRange(r)
    }
    rec["rangeForPosition"] = answers
    if let cr = last { writeRange(cr.location) }
  } else {
    var source = "target", m: CFTypeRef?, err: Int32 = 0, tries: [Any] = []
    for i in 0..<3 where m == nil {
      if i > 0 { usleep(150_000) }
      (m, err) = param(target, "AXTextMarkerForPosition", pointValue(p))
      tries.append(m != nil ? "ok" : "error \(err)")
    }
    rec["markerTries"] = tries
    if m == nil, let webArea { (m, err) = param(webArea, "AXTextMarkerForPosition", pointValue(p)); source = "webArea"; rec["markerErrorWebArea"] = err }
    if m == nil {
      // The other position-to-marker route the elements list: the start marker of a 1-point box at the point.
      var box = CGRect(x: p.x, y: p.y - 0.5, width: 1, height: 1)
      let boxValue = AXValueCreate(.cgRect, &box)!
      (m, err) = param(target, "AXStartTextMarkerForBounds", boxValue)
      source = "startForBounds"; rec["startForBoundsError"] = err
      if m == nil, let webArea { (m, err) = param(webArea, "AXStartTextMarkerForBounds", boxValue); source = "startForBoundsWebArea"; rec["startForBoundsWebAreaError"] = err }
    }
    rec["markerSource"] = m == nil ? "none" : source
    if let m {
      rec["marker"] = describe(m)
      let from = source == "target" || source == "startForBounds" ? target : webArea!
      let (index, indexErr) = param(webArea ?? target, "AXIndexForTextMarker", m)
      rec["indexForTextMarker"] = index != nil ? describe(index) : "error \(indexErr)"
      let (owner, _) = param(from, "AXUIElementForTextMarker", m)
      rec["markerElement"] = describe(owner)
      let (range, rangeErr) = param(from, "AXTextMarkerRangeForUnorderedTextMarkers", [m, m] as CFArray)
      rec["markerRangeError"] = rangeErr
      if let range {
        var tries: [[String: Any]] = []
        for (name, el) in [("target", target)] + (webArea.map { [("webArea", $0)] } ?? []) {
          let t = nowMs()
          let e = AXUIElementSetAttributeValue(el, "AXSelectedTextMarkerRange" as CFString, range)
          tries.append(["on": name, "settable": settable(el, "AXSelectedTextMarkerRange"), "atMs": t, "error": e.rawValue])
          if rec["writeAtMs"] == nil { rec["writeAtMs"] = t }
          if e == .success { break }
        }
        rec["writes"] = tries
      }
    }
  }
  usleep(400_000)
  rec["selectedAfter"] = describe(attr(target, "AXSelectedTextRange"))
  rec["focusedAfter"] = describe(attr(target, "AXFocused"))
  rec["endMs"] = nowMs()
  steps.append(rec)
}
out["place"] = steps

for e in spec["expect"] as? [[String: Any]] ?? [] {
  guard let off = (e["offset"] as? NSNumber)?.intValue else { continue }
  let p = CGPoint(x: (e["x"] as? NSNumber)?.doubleValue ?? 0, y: (e["y"] as? NSNumber)?.doubleValue ?? 0)
  var checks = out["expect"] as? [[String: Any]] ?? []
  var c = boundsCheck(target, off, p)
  c["name"] = e["name"] ?? NSNull()
  let (r, err) = param(target, "AXRangeForPosition", pointValue(p))
  c["rangeForPosition"] = r != nil ? describe(r) : "error \(err)"
  checks.append(c)
  out["expect"] = checks
}
out["targetAfter"] = ["focused": describe(attr(target, "AXFocused")), "selectedTextRange": describe(attr(target, "AXSelectedTextRange")),
                      "actions": actions(target) ?? ["error"]]
if dump == "after" { out["chainAfter"] = chain(hit, full: true) }
out["orderAfter"] = order(pid)
out["endMs"] = nowMs()
emit(out)
