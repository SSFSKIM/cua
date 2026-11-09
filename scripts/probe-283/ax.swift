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

// The character whose AXBoundsForRange box holds the point, over [from, to): its left half before it. Nil when none does.
func scan(_ e: AXUIElement, _ p: CGPoint, from: Int, to: Int) -> (found: Int?, calls: Int, ms: Double) {
  let t0 = nowMs()
  var calls = 0
  for i in max(0, from)..<max(from, to) {
    calls += 1
    guard let r = rect(param(e, "AXBoundsForRange", rangeValue(i, 1)).0) else { continue }
    if p.x >= r.minX && p.x < r.maxX && p.y >= r.minY && p.y <= r.maxY { return (p.x < r.midX ? i : i + 1, calls, nowMs() - t0) }
  }
  return (nil, calls, nowMs() - t0)
}
func textLength(_ e: AXUIElement) -> Int {
  max((attr(e, "AXNumberOfCharacters") as? NSNumber)?.intValue ?? 0, str(e, kAXValueAttribute)?.utf16.count ?? 0)
}
func number(_ ref: CFTypeRef?) -> Int? { (ref as? NSNumber)?.intValue }
func pointArgs(_ i: Int) -> CGPoint? {
  guard args.count > i + 1, let x = Double(args[i]), let y = Double(args[i + 1]) else { return nil }
  return CGPoint(x: x, y: y)
}

//   ax mce <pid> <x> <y> <spec-json>   #283 round 2: a contenteditable of several text nodes. The hit (an AXStaticText),
//       AXFocused on its AXEditableAncestor, the hit's local offset at the point from its AXBoundsForRange, the hit's
//       start in the editable's offset space every way it can be read, then the spec's route:
//         a           AXSelectedTextRange {local, 0} on the static text
//         b-children  AXSelectedTextRange {start + local, 0} on the editable, start from the editable's text leaves in order
//         b-marker    the same, start = AXIndexForTextMarker(hit's AXStartTextMarker) - the editable's, asked of the web area
//         c           the hit's start marker stepped `local` times with AXNextTextMarkerForTextMarker, then
//                     AXSelectedTextMarkerRange = AXTextMarkerRangeForUnorderedTextMarkers(m, m) on the editable, else the web area
//         d           AXTextMarkerForIndex (the editable's, else the web area's at its own index) of start + local, then as c
if args.count == 6, args[1] == "mce", let pid = pid_t(args[2]), let p = pointArgs(3),
   let spec = try? JSONSerialization.jsonObject(with: Data(args[5].utf8)) as? [String: Any] {
  let app = AXUIElementCreateApplication(pid)
  AXUIElementSetMessagingTimeout(app, 3)
  var out: [String: Any] = ["trusted": AXIsProcessTrusted(), "startMs": nowMs(), "orderBefore": order(pid)]
  var hitRef: AXUIElement?
  out["hitError"] = AXUIElementCopyElementAtPosition(app, Float(p.x), Float(p.y), &hitRef).rawValue
  guard let hit = hitRef else { emit(out); exit(0) }
  let chainElements = ancestors(hit)
  out["chain"] = chainElements.map { ["role": str($0, kAXRoleAttribute) ?? "?", "dom": orNull(str($0, "AXDOMIdentifier")), "value": describe(attr($0, kAXValueAttribute)),
                                     "actions": actions($0) ?? ["error"]] as [String: Any] }
  let webArea = chainElements.first { str($0, kAXRoleAttribute) == "AXWebArea" }
  guard let editable = element(attr(hit, "AXEditableAncestor")), let webArea else { out["problem"] = "no editable ancestor or web area"; emit(out); exit(0) }
  out["editable"] = ["role": str(editable, kAXRoleAttribute) ?? "?", "dom": orNull(str(editable, "AXDOMIdentifier")), "value": describe(attr(editable, kAXValueAttribute)),
                     "valueLength": orNull(str(editable, kAXValueAttribute)?.utf16.count), "numberOfCharacters": describe(attr(editable, "AXNumberOfCharacters")),
                     "actions": actions(editable) ?? ["error"]]
  let tf = nowMs()
  out["focusWrite"] = ["atMs": tf, "error": AXUIElementSetAttributeValue(editable, kAXFocusedAttribute as CFString, kCFBooleanTrue).rawValue]
  usleep(UInt32(((spec["settleMs"] as? NSNumber)?.doubleValue ?? 150) * 1000))
  out["focusedAfterSettle"] = describe(attr(editable, "AXFocused"))
  out["selectedAfterFocus"] = ["editable": describe(attr(editable, "AXSelectedTextRange")), "hit": describe(attr(hit, "AXSelectedTextRange"))]

  // The local offset.
  let n = textLength(hit)
  let s = scan(hit, p, from: 0, to: n)
  out["local"] = ["characters": n, "found": orNull(s.found), "calls": s.calls, "ms": s.ms]
  // Before complete mode the boxes are empty and the scan finds nothing: the page's offset then stands in, so the
  // writes are still measured.
  let local = s.found ?? (spec["knownLocal"] as? NSNumber)?.intValue ?? 0
  out["localSource"] = s.found != nil ? "scan" : (spec["knownLocal"] != nil ? "page" : "zero")

  // The hit's start in the editable's offset space.
  var starts: [String: Any] = [:]
  // 1. The editable's text leaves in document order (an AXStaticText or a leaf), their AXValue lengths summed.
  var leaves: [[String: Any]] = [], startChildren: Int?, acc = 0
  func walk(_ e: AXUIElement, _ depth: Int) {
    guard depth < 12 else { return }
    let kids = (attr(e, kAXChildrenAttribute) as? [AXUIElement]) ?? []
    let role = str(e, kAXRoleAttribute) ?? "?"
    if kids.isEmpty || role == "AXStaticText" {
      let v = str(e, kAXValueAttribute) ?? ""
      let isHit = CFEqual(e, hit)
      if isHit, startChildren == nil { startChildren = acc }
      leaves.append(["role": role, "value": v, "length": v.utf16.count, "isHit": isHit, "startSoFar": acc])
      acc += v.utf16.count
      return
    }
    for k in kids { walk(k, depth + 1) }
  }
  for k in (attr(editable, kAXChildrenAttribute) as? [AXUIElement]) ?? [] { walk(k, 0) }
  starts["children"] = ["start": orNull(startChildren), "leaves": leaves, "leafTotal": acc]
  // 1b. Each leaf found in the editable's AXValue in order (the value spells a <br> as a line break no leaf holds).
  let edValue = (str(editable, kAXValueAttribute) ?? "") as NSString
  var startValue: Int?, cursor = 0
  for leaf in leaves {
    let v = leaf["value"] as? String ?? ""
    if v.isEmpty { continue }
    let r = edValue.range(of: v, options: [], range: NSRange(location: cursor, length: edValue.length - cursor))
    if r.location == NSNotFound { break }
    if leaf["isHit"] as? Bool == true { startValue = r.location; break }
    cursor = r.location + r.length
  }
  starts["value"] = ["start": orNull(startValue)]
  // The AXStartTextMarker attributes, indexed in the web area (round 2's first run: both read as the document's start).
  func idx(_ m: CFTypeRef?) -> Any { guard let m else { return NSNull() }; let (a, e) = param(webArea, "AXIndexForTextMarker", m); return a != nil ? describe(a) : "error \(e)" }
  starts["attributeStartIndex"] = ["hit": idx(attr(hit, "AXStartTextMarker")), "editable": idx(attr(editable, "AXStartTextMarker"))]
  // The start markers used below: AXTextMarkerRangeCopyStartMarker of AXTextMarkerRangeForUIElement, asked of the web area.
  func rangeStart(_ of: AXUIElement) -> CFTypeRef? {
    guard let r = param(webArea, "AXTextMarkerRangeForUIElement", of).0, CFGetTypeID(r) == AXTextMarkerRangeGetTypeID() else { return nil }
    return AXTextMarkerRangeCopyStartMarker(r as! AXTextMarkerRange)
  }
  // 2. AXIndexForTextMarker of the start markers, asked of the web area (and of the editable, to see it refused).
  let mHit = rangeStart(hit), mEditable = rangeStart(editable)
  var idxHit: Int?, idxEditable: Int?
  if let mHit, let mEditable {
    let (a1, e1) = param(webArea, "AXIndexForTextMarker", mHit), (a2, e2) = param(webArea, "AXIndexForTextMarker", mEditable)
    idxHit = number(a1); idxEditable = number(a2)
    let (a3, e3) = param(editable, "AXIndexForTextMarker", mHit)
    starts["marker"] = ["hitIndexInWebArea": orNull(idxHit), "hitIndexError": e1, "editableIndexInWebArea": orNull(idxEditable), "editableIndexError": e2,
                        "start": orNull(idxHit.flatMap { h in idxEditable.map { h - $0 } }),
                        "askedOfEditable": a3 != nil ? describe(a3) : "error \(e3)"]
    // 3. The length of the marker range from the editable's start to the hit's.
    let (r, re) = param(webArea, "AXTextMarkerRangeForUnorderedTextMarkers", [mEditable, mHit] as CFArray)
    if let r { let (l, le) = param(webArea, "AXLengthForTextMarkerRange", r); starts["rangeLength"] = l != nil ? describe(l) : "error \(le)"
               let (sv, _) = param(webArea, "AXStringForTextMarkerRange", r); starts["rangeString"] = describe(sv) }
    else { starts["rangeLength"] = "error \(re)" }
  } else {
    starts["marker"] = ["hitStartTextMarker": mHit != nil, "editableStartTextMarker": mEditable != nil]
  }
  // AXTextMarkerRangeForUIElement of the hit, asked of each level: its length (it should be the hit's own text length).
  var uiRanges: [String: Any] = [:]
  for (name, el) in [("hit", hit), ("editable", editable), ("webArea", webArea)] {
    let (r, e) = param(el, "AXTextMarkerRangeForUIElement", hit)
    if let r { let (l, _) = param(webArea, "AXLengthForTextMarkerRange", r); let (sv, _) = param(webArea, "AXStringForTextMarkerRange", r)
               uiRanges[name] = ["length": describe(l), "string": describe(sv)] } else { uiRanges[name] = "error \(e)" }
  }
  starts["rangeForUIElement"] = uiRanges
  let (ic, ice) = param(editable, "AXIndexForChildUIElement", hit)
  starts["indexForChildUIElement"] = ic != nil ? describe(ic) : "error \(ice)"
  out["starts"] = starts

  // The route.
  let route = spec["route"] as? String ?? "none"
  var w: [String: Any] = ["route": route]
  func writeMarker(_ m: CFTypeRef) {
    guard let range = param(webArea, "AXTextMarkerRangeForUnorderedTextMarkers", [m, m] as CFArray).0 else { w["markerRange"] = "error"; return }
    var tries: [[String: Any]] = []
    for (name, el) in [("editable", editable), ("webArea", webArea)] {
      let t = nowMs()
      let e = AXUIElementSetAttributeValue(el, "AXSelectedTextMarkerRange" as CFString, range)
      tries.append(["on": name, "atMs": t, "error": e.rawValue])
      if w["atMs"] == nil { w["atMs"] = t }
      if e == .success { break }
    }
    w["writes"] = tries
  }
  switch route {
  case "a":
    w["atMs"] = nowMs(); w["loc"] = local
    w["error"] = AXUIElementSetAttributeValue(hit, "AXSelectedTextRange" as CFString, rangeValue(local, 0)).rawValue
  case "b-children", "b-marker", "b-value":
    let start = route == "b-children" ? startChildren : route == "b-value" ? startValue : (idxHit != nil && idxEditable != nil ? idxHit! - idxEditable! : nil)
    if let start {
      w["atMs"] = nowMs(); w["loc"] = start + local
      w["error"] = AXUIElementSetAttributeValue(editable, "AXSelectedTextRange" as CFString, rangeValue(start + local, 0)).rawValue
    } else { w["problem"] = "no start" }
  case "c":
    if var m = mHit {
      var steps: [Any] = []
      for _ in 0..<local {
        let (next, e) = param(hit, "AXNextTextMarkerForTextMarker", m)
        if let next { m = next; steps.append("hit") } else {
          let (next2, e2) = param(webArea, "AXNextTextMarkerForTextMarker", m)
          guard let next2 else { steps.append("error hit \(e) webArea \(e2)"); break }
          m = next2; steps.append("webArea")
        }
      }
      w["steps"] = Dictionary(grouping: steps.map { "\($0)" }, by: { $0 }).mapValues { $0.count }
      if let r = param(webArea, "AXTextMarkerRangeForUnorderedTextMarkers", [mHit!, m] as CFArray).0 {
        w["prefix"] = describe(param(webArea, "AXStringForTextMarkerRange", r).0)
      }
      w["stepsIndexInWebArea"] = describe(param(webArea, "AXIndexForTextMarker", m).0)
      writeMarker(m)
    } else { w["problem"] = "no AXStartTextMarker on the hit" }
  case "d":
    let start = startValue ?? startChildren
    if let start {
      let target = start + local
      w["editableOffset"] = target
      // Round 2's first run: the editable answers AXTextMarkerForIndex in the web area's index space, so the web area is
      // asked at the editable's own start index plus the offset; the editable's answer at the bare offset is recorded.
      let (me, ee) = param(editable, "AXTextMarkerForIndex", NSNumber(value: target))
      w["askedOfEditable"] = me != nil ? ["index": idx(me)] : "error \(ee)"
      var m: CFTypeRef?
      if let idxEditable {
        let (mw, ew) = param(webArea, "AXTextMarkerForIndex", NSNumber(value: idxEditable + target))
        m = mw; w["askedOfWebArea"] = mw != nil ? "ok index \(idxEditable + target)" : "error \(ew)"
      }
      if let m { w["markerIndexBack"] = describe(param(webArea, "AXIndexForTextMarker", m).0); writeMarker(m) }
    } else { w["problem"] = "no start" }
  default: break
  }
  out["write"] = w
  usleep(500_000)
  out["after"] = ["editableSelected": describe(attr(editable, "AXSelectedTextRange")), "hitSelected": describe(attr(hit, "AXSelectedTextRange")),
                  "editableFocused": describe(attr(editable, "AXFocused")), "editableActions": actions(editable) ?? ["error"]]
  out["orderAfter"] = order(pid)
  out["endMs"] = nowMs()
  emit(out)
  exit(0)
}

//   ax boxes <pid> <x> <y> <file> <expect>   #290: the field at the point (its AXEditableAncestor, else the hit), its AXValue
//       and every character's AXBoundsForRange {i, 1} as read (null for a failed read), written to <file> for an offline
//       replay through the engine's caret search; one JSON line with the counts and the time per read.
if args.count == 7, args[1] == "boxes", let pid = pid_t(args[2]), let p = pointArgs(3), let expect = Int(args[6]) {
  let file = args[5]
  let app = AXUIElementCreateApplication(pid)
  AXUIElementSetMessagingTimeout(app, 3)
  var out: [String: Any] = ["trusted": AXIsProcessTrusted(), "point": ["x": p.x, "y": p.y], "expect": expect]
  var hitRef: AXUIElement?
  out["hitError"] = AXUIElementCopyElementAtPosition(app, Float(p.x), Float(p.y), &hitRef).rawValue
  guard let hit = hitRef else { emit(out); exit(0) }
  let field = element(attr(hit, "AXEditableAncestor")) ?? hit
  let value = str(field, kAXValueAttribute) ?? ""
  let n = (value as NSString).length
  out["fieldRole"] = str(field, kAXRoleAttribute) ?? "?"
  out["length"] = n
  out["numberOfCharacters"] = orNull(number(attr(field, "AXNumberOfCharacters")))
  // Past the value's end: whether AXBoundsForRange still answers boxes (Chromium's AXValue stops at 10,000 characters).
  out["boxPastValue"] = [n, n + 400, n + 10_000].map { i in rect(param(field, "AXBoundsForRange", rangeValue(i, 1)).0).map { [$0.origin.x, $0.origin.y, $0.width, $0.height] as Any } ?? NSNull() }
  out["selectedRange"] = describe(attr(field, "AXSelectedTextRange"))
  var boxes: [Any] = []
  var failed = 0, empty = 0
  let t0 = Date()
  for i in 0..<n {
    guard let r = rect(param(field, "AXBoundsForRange", rangeValue(i, 1)).0) else { failed += 1; boxes.append(NSNull()); continue }
    if r.height <= 0 || r.width <= 0 { empty += 1 }
    boxes.append([r.origin.x, r.origin.y, r.width, r.height])
  }
  let ms = Date().timeIntervalSince(t0) * 1000
  out["reads"] = n
  out["ms"] = ms
  out["msPerRead"] = n > 0 ? ms / Double(n) : 0
  out["failed"] = failed
  out["empty"] = empty
  let dump: [String: Any] = ["value": value, "point": ["x": p.x, "y": p.y], "expect": expect, "boxes": boxes]
  if let data = try? JSONSerialization.data(withJSONObject: dump) { out["written"] = FileManager.default.createFile(atPath: file, contents: data) }
  emit(out)
  exit(0)
}

//   ax longta <pid> <x> <y> <expect>   #283 round 2: a long scrolled textarea. AXVisibleCharacterRange, the AXBoundsForRange
//       scan for the point from 0 and bounded by the visible range (each timed), the boxes of the visible range's first and
//       last characters, then AXSelectedTextRange {found, 0}.
if args.count == 6, args[1] == "longta", let pid = pid_t(args[2]), let p = pointArgs(3), let expect = Int(args[5]) {
  let app = AXUIElementCreateApplication(pid)
  AXUIElementSetMessagingTimeout(app, 3)
  var out: [String: Any] = ["trusted": AXIsProcessTrusted(), "startMs": nowMs(), "orderBefore": order(pid)]
  var hitRef: AXUIElement?
  out["hitError"] = AXUIElementCopyElementAtPosition(app, Float(p.x), Float(p.y), &hitRef).rawValue
  guard let hit = hitRef else { emit(out); exit(0) }
  let field = element(attr(hit, "AXEditableAncestor")) ?? hit
  out["hit"] = ["role": str(hit, kAXRoleAttribute) ?? "?", "dom": orNull(str(hit, "AXDOMIdentifier")), "fieldRole": str(field, kAXRoleAttribute) ?? "?",
                "isField": CFEqual(hit, field), "actions": actions(field) ?? ["error"]]
  let n = textLength(field)
  let tv = nowMs()
  let (v, ve) = copy(field, "AXVisibleCharacterRange")
  out["visible"] = ["value": v != nil ? describe(v) : "error \(ve)", "readMs": nowMs() - tv, "characters": n,
                    "containsExpected": orNull(cfRange(v).map { expect >= $0.location && expect < $0.location + $0.length })]
  if let vr = cfRange(v) {
    out["visibleEdges"] = ["first": boundsCheck(field, vr.location, p), "last": boundsCheck(field, max(vr.location, vr.location + vr.length - 1), p)]
    let b = scan(field, p, from: vr.location, to: vr.location + vr.length)
    out["boundedScan"] = ["found": orNull(b.found), "calls": b.calls, "ms": b.ms]
  }
  let f = scan(field, p, from: 0, to: n)
  out["fullScan"] = ["found": orNull(f.found), "calls": f.calls, "ms": f.ms]
  // A binary search over offsets in reading order (rows top to bottom, then left to right): the first character whose
  // box is past the point or holds it, then that character's box checked.
  do {
    let t0 = nowMs()
    var calls = 0, lo = 0, hi = n
    func box(_ i: Int) -> CGRect? { calls += 1; return rect(param(field, "AXBoundsForRange", rangeValue(i, 1)).0).flatMap { $0.height > 0 ? $0 : nil } }
    func past(_ i: Int) -> Bool { guard let r = box(i) else { return false }; return r.minY > p.y || (r.maxY > p.y && r.maxX > p.x) }
    while lo < hi { let mid = (lo + hi) / 2; if past(mid) { hi = mid } else { lo = mid + 1 } }
    var found: Int?
    if lo < n, let r = box(lo), p.x >= r.minX, p.x < r.maxX, p.y >= r.minY, p.y <= r.maxY { found = p.x < r.midX ? lo : lo + 1 }
    out["binarySearch"] = ["found": orNull(found), "firstPast": lo, "calls": calls, "ms": nowMs() - t0]
  }
  // The whole field's boxes once, to see what an unbounded scan costs when nothing matches.
  let all = scan(field, CGPoint(x: -10_000, y: -10_000), from: 0, to: n)
  out["exhaustiveScan"] = ["calls": all.calls, "ms": all.ms]
  if let found = f.found ?? (out["boundedScan"] as? [String: Any])?["found"] as? Int {
    let t = nowMs()
    out["write"] = ["atMs": t, "loc": found, "error": AXUIElementSetAttributeValue(field, "AXSelectedTextRange" as CFString, rangeValue(found, 0)).rawValue]
  }
  usleep(500_000)
  out["after"] = ["selected": describe(attr(field, "AXSelectedTextRange")), "focused": describe(attr(field, "AXFocused")),
                  "visible": describe(attr(field, "AXVisibleCharacterRange"))]
  out["orderAfter"] = order(pid)
  out["endMs"] = nowMs()
  emit(out)
  exit(0)
}
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
    // Chromium's AXStaticText reads AXNumberOfCharacters 0: its AXValue's length counts too.
    let n = max((attr(scanned, "AXNumberOfCharacters") as? NSNumber)?.intValue ?? 0, str(scanned, kAXValueAttribute)?.utf16.count ?? 0)
    rec["scanCountSources"] = ["numberOfCharacters": describe(attr(scanned, "AXNumberOfCharacters")), "valueLength": str(scanned, kAXValueAttribute)?.utf16.count ?? NSNull()]
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
