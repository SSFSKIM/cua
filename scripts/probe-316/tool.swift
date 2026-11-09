// #316's side tool (scripts/probe-316/measure.mjs runs it as a child of the job shell, which holds the runner image's
// Accessibility and Screen Recording grants). A line server on stdin, one JSON answer per line on stdout. Nothing here
// posts input. It reads what a narrower detector could read at click time, and the native apps' ground truth.
//   {"op":"signals","pid","x","y","window":[x,y,w,h]}  at a point about to be clicked: the on-screen window list front to
//       back (owner pid and name, layer, bounds, alpha; never a window's title), the target window's place in it and
//       every window above it that holds the point; the app's focused element, its focused window, its windows and its
//       own children; the hit at the point asked of the application and of the system, each with its chain; the window's
//       text-entry controls outside every web area (focused, expanded, identifier) and its popover-like elements
//   {"op":"focus","pid"}                     the app's focused element: role, subrole, identifier, frame, selected range
//   {"op":"textpoint","pid","phrase","after"} the focused window's first text area: the screen point of the phrase's
//       character `after` characters in (its bounds' centre), and the phrase's index
//   {"op":"caret","pid","phrase"}            the text area's selected range, the phrase's index now, and the line the
//       caret is on (the document is the probe's own)
//   {"op":"settext","pid","text"}            the text area's value set to text, its caret put at 0
//   {"op":"value","pid","x","y"}             the hit at the point: role, subrole, description, AXValue when a number
//   {"op":"focusweb","pid"}                  AXFocused written on the focused window's first web area (the reset's)
import AppKit
import ApplicationServices
import Foundation

setvbuf(stdout, nil, _IOFBF, 1 << 20)
func nowMs() -> Double { Double(clock_gettime_nsec_np(CLOCK_UPTIME_RAW)) / 1e6 }
func emit(_ object: Any) {
  print(String(data: try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]), encoding: .utf8)!)
  fflush(stdout)
}
func r1(_ v: Double) -> Double { (v * 10).rounded() / 10 }
func prepare(_ e: AXUIElement) -> AXUIElement { AXUIElementSetMessagingTimeout(e, 1.0); return e }
func attr(_ e: AXUIElement, _ name: String) -> CFTypeRef? {
  var v: CFTypeRef?
  return AXUIElementCopyAttributeValue(e, name as CFString, &v) == .success ? v : nil
}
func element(_ v: CFTypeRef?) -> AXUIElement? {
  guard let v, CFGetTypeID(v) == AXUIElementGetTypeID() else { return nil }
  return prepare(v as! AXUIElement)
}
func elements(_ v: CFTypeRef?) -> [AXUIElement] {
  guard let v, CFGetTypeID(v) == CFArrayGetTypeID() else { return [] }
  return (v as! [AnyObject]).compactMap { element($0 as CFTypeRef) }
}
func str(_ e: AXUIElement, _ name: String) -> String? {
  guard let v = attr(e, name) else { return nil }
  if CFGetTypeID(v) == CFStringGetTypeID() { return v as? String }
  if CFGetTypeID(v) == CFAttributedStringGetTypeID() { return (v as! NSAttributedString).string }
  return nil
}
func short(_ s: String?) -> Any { s.map { $0.count > 80 ? String($0.prefix(80)) : $0 } ?? NSNull() }
func frameOf(_ e: AXUIElement) -> CGRect? {
  guard let p = attr(e, kAXPositionAttribute), let s = attr(e, kAXSizeAttribute),
        CFGetTypeID(p) == AXValueGetTypeID(), CFGetTypeID(s) == AXValueGetTypeID() else { return nil }
  var pt = CGPoint.zero, sz = CGSize.zero
  guard AXValueGetValue(p as! AXValue, .cgPoint, &pt), AXValueGetValue(s as! AXValue, .cgSize, &sz) else { return nil }
  return CGRect(origin: pt, size: sz)
}
func wire(_ r: CGRect?) -> Any { r.map { [r1($0.origin.x), r1($0.origin.y), r1($0.width), r1($0.height)] } ?? NSNull() }
func boolAttr(_ e: AXUIElement, _ name: String) -> Any {
  guard let v = attr(e, name), CFGetTypeID(v) == CFBooleanGetTypeID() else { return NSNull() }
  return CFBooleanGetValue((v as! CFBoolean))
}
func numberValue(_ e: AXUIElement) -> Any {
  guard let v = attr(e, kAXValueAttribute), CFGetTypeID(v) == CFNumberGetTypeID() || CFGetTypeID(v) == CFBooleanGetTypeID() else { return NSNull() }
  return (v as! NSNumber).doubleValue
}
func range(_ e: AXUIElement) -> [Int]? {
  guard let v = attr(e, kAXSelectedTextRangeAttribute), CFGetTypeID(v) == AXValueGetTypeID() else { return nil }
  var r = CFRange()
  guard AXValueGetValue(v as! AXValue, .cfRange, &r) else { return nil }
  return [r.location, r.length]
}
func role(_ e: AXUIElement) -> String { str(e, kAXRoleAttribute) ?? "?" }
/// An element as a row of the answer: role, subrole, identifier, description, title and frame (UI labels only).
func describe(_ e: AXUIElement) -> [String: Any] {
  ["role": role(e), "subrole": short(str(e, kAXSubroleAttribute)), "identifier": short(str(e, "AXIdentifier")),
   "description": short(str(e, kAXDescriptionAttribute)), "title": short(str(e, kAXTitleAttribute)), "frame": wire(frameOf(e))]
}
/// The element's parents up to its window (included) or 30 levels.
func chain(_ e: AXUIElement) -> [AXUIElement] {
  var out = [e], cur = e
  for _ in 0..<30 {
    guard let p = element(attr(cur, kAXParentAttribute)) else { break }
    out.append(p)
    if ["AXWindow", "AXApplication"].contains(role(p)) { break }
    cur = p
  }
  return out
}
func chainWire(_ c: [AXUIElement]) -> [Any] { c.prefix(16).map { e -> Any in [role(e), short(str(e, kAXSubroleAttribute)), short(str(e, "AXIdentifier")), wire(frameOf(e)), short(str(e, kAXTitleAttribute)), short(str(e, kAXDescriptionAttribute)), short(str(e, kAXValueAttribute))] } }
let textRoles: Set<String> = ["AXTextField", "AXTextArea", "AXComboBox", "AXSearchField", "AXSecureTextField"]
let overlayRoles: Set<String> = ["AXPopover", "AXSheet", "AXMenu", "AXList", "AXTable", "AXOutline", "AXDrawer", "AXDialog", "AXBrowser"]
func pidOf(_ e: AXUIElement) -> pid_t { var p: pid_t = 0; AXUIElementGetPid(e, &p); return p }

/// The window's elements outside every web area, breadth-first (at most `cap`, depth 9): its text-entry controls and its
/// popover-like elements.
func outsideWebArea(_ window: AXUIElement, cap: Int = 700) -> (text: [[String: Any]], overlays: [[String: Any]], count: Int) {
  var queue: [(AXUIElement, Int)] = [(window, 0)], head = 0
  var text: [[String: Any]] = [], overlays: [[String: Any]] = []
  while head < queue.count && queue.count < cap {
    let (e, depth) = queue[head]; head += 1
    let r = role(e)
    if r == "AXWebArea" { continue }
    if textRoles.contains(r) {
      var d = describe(e); d["focused"] = boolAttr(e, kAXFocusedAttribute); d["expanded"] = boolAttr(e, kAXExpandedAttribute); d["depth"] = depth
      text.append(d)
    }
    if overlayRoles.contains(r) || (str(e, kAXSubroleAttribute) ?? "").contains("Popover") {
      var d = describe(e); d["depth"] = depth; d["children"] = elements(attr(e, kAXChildrenAttribute)).count
      overlays.append(d)
    }
    if depth < 9 { for k in elements(attr(e, kAXChildrenAttribute)) { queue.append((k, depth + 1)) } }
  }
  return (text, overlays, queue.count)
}

var rememberedArea: [pid_t: AXUIElement?] = [:]
// Tiny ticking fixtures only: preserve actual AX identities, so a refusal's new hit can be named without guessing
// from a changed label. This side record is diagnostic and does not stand for the engine's private screenshot record.
var rememberedNodes: [pid_t: [AXUIElement]] = [:]
func rememberTree(_ root: AXUIElement) -> ([AXUIElement], Bool) {
  var queue = [root], head = 0
  while head < queue.count && head < 800 {
    let e = queue[head]; head += 1
    for child in elements(attr(e, kAXChildrenAttribute)) where !queue.contains(where: { CFEqual($0, child) }) { queue.append(child) }
  }
  return (Array(queue.prefix(head)), head < queue.count)
}
func signals(_ q: [String: Any]) -> [String: Any] {
  let t0 = nowMs()
  guard let pid = (q["pid"] as? NSNumber)?.int32Value, let x = (q["x"] as? NSNumber)?.doubleValue, let y = (q["y"] as? NSNumber)?.doubleValue else { return ["error": "args"] }
  let point = CGPoint(x: x, y: y)
  var out: [String: Any] = [:]
  // The window list, front to back, on screen only.
  let list = (CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]) ?? []
  var rows: [[String: Any]] = []
  var target: Int? = nil
  let wanted = (q["window"] as? [Double]).flatMap { $0.count == 4 ? CGRect(x: $0[0], y: $0[1], width: $0[2], height: $0[3]) : nil }
  for (i, w) in list.enumerated() {
    let owner = (w[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value ?? 0
    let layer = (w[kCGWindowLayer as String] as? NSNumber)?.intValue ?? 0
    var b = CGRect.zero
    if let d = w[kCGWindowBounds as String] as? NSDictionary { CGRectMakeWithDictionaryRepresentation(d, &b) }
    let row: [String: Any] = ["i": i, "n": (w[kCGWindowNumber as String] as? NSNumber)?.intValue ?? 0, "pid": owner,
      "owner": short(w[kCGWindowOwnerName as String] as? String), "layer": layer, "bounds": wire(b),
      "alpha": (w[kCGWindowAlpha as String] as? NSNumber)?.doubleValue ?? 1, "holdsPoint": b.contains(point)]
    rows.append(row)
    if target == nil, owner == pid, layer == 0, let wanted, abs(b.minX - wanted.minX) <= 2, abs(b.minY - wanted.minY) <= 2,
       abs(b.width - wanted.width) <= 2, abs(b.height - wanted.height) <= 2 { target = i }
  }
  out["windowsTop"] = Array(rows.prefix(24))
  out["windowCount"] = rows.count
  if let target {
    out["targetIndex"] = target
    out["targetWindow"] = rows[target]
    out["aboveAtPoint"] = rows[..<target].filter { ($0["holdsPoint"] as? Bool) == true && (($0["layer"] as? Int) ?? 0) < 1000 }
    out["sameAppAbove"] = rows[..<target].filter { (($0["pid"] as? Int32) ?? 0) == pid }
  }
  out["appWindowsCG"] = rows.filter { (($0["pid"] as? Int32) ?? 0) == pid }
  let app = prepare(AXUIElementCreateApplication(pid))
  if let f = element(attr(app, kAXFocusedUIElementAttribute)) {
    var d = describe(f)
    let c = chain(f)
    d["inWebArea"] = c.dropFirst().contains { role($0) == "AXWebArea" }
    d["isWebArea"] = role(f) == "AXWebArea"
    d["expanded"] = boolAttr(f, kAXExpandedAttribute)
    d["chain"] = chainWire(c)
    d["pid"] = pidOf(f)
    out["focused"] = d
  } else { out["focused"] = NSNull() }
  if let w = element(attr(app, kAXFocusedWindowAttribute)) { out["focusedWindow"] = describe(w) }
  let windows = elements(attr(app, kAXWindowsAttribute))
  out["axWindows"] = windows.map { w -> [String: Any] in
    var d = describe(w); d["main"] = boolAttr(w, kAXMainAttribute)
    d["children"] = elements(attr(w, kAXChildrenAttribute)).map { [role($0), short(str($0, kAXSubroleAttribute)), short(str($0, "AXIdentifier"))] }
    return d
  }
  out["appChildren"] = elements(attr(app, kAXChildrenAttribute)).map { [role($0), short(str($0, kAXSubroleAttribute)), short(str($0, kAXTitleAttribute))] }
  if (q["rememberTree"] as? Bool) == true, let root = windows.first(where: { frameOf($0) == wanted }) ?? windows.first {
    let (nodes, cut) = rememberTree(root)
    rememberedNodes[pid] = nodes
    out["shotTreeCount"] = nodes.count; out["shotTreeCut"] = cut
  }
  var hit: AXUIElement?
  if AXUIElementCopyElementAtPosition(app, Float(x), Float(y), &hit) == .success, let h = hit {
    let c = chain(prepare(h))
    var d: [String: Any] = ["chain": chainWire(c), "inWebArea": c.contains { role($0) == "AXWebArea" }, "pid": pidOf(h)]
    // The hit's nearest web area, remembered at the screenshot (`remember`) and compared at the click (`compare`):
    // whether the click's hit lies in the same web area (CFEqual) as the screenshot's hit at the point did.
    let area = c.first { role($0) == "AXWebArea" }
    if (q["remember"] as? Bool) == true { rememberedArea[pid] = area }
    if (q["compare"] as? Bool) == true {
      if let nodes = rememberedNodes[pid] {
        let recorded = c.map { e in nodes.contains { CFEqual($0, e) } }
        d["chainRecorded"] = recorded
        if let a = c.firstIndex(where: { role($0) == "AXWebArea" }), a > 0,
           let fresh = (0..<a).reversed().first(where: { !recorded[$0] && recorded[$0 + 1] }) {
          d["newElementIndex"] = fresh
          if let children = attr(c[fresh + 1], kAXChildrenAttribute) {
            d["newElementListed"] = elements(children).contains { CFEqual($0, c[fresh]) }
          }
        }
      }
      if let old = rememberedArea[pid] ?? nil, let area { d["sameWebAreaAsShot"] = CFEqual(old, area); d["shotAreaFrame"] = wire(frameOf(old)) }
      else { d["sameWebAreaAsShot"] = NSNull() }
      // The ancestor reading (the build's G with a recorded outer web area): the screenshot's web area anywhere among
      // the hit's ancestors.
      if let old = rememberedArea[pid] ?? nil { d["shotAreaInChain"] = c.contains { CFEqual($0, old) } }
      d["shotHadArea"] = (rememberedArea[pid] ?? nil) != nil
    }
    d["webAreas"] = c.filter { role($0) == "AXWebArea" }.count
    out["hit"] = d
  } else { out["hit"] = NSNull() }
  let system = prepare(AXUIElementCreateSystemWide())
  var sys: AXUIElement?
  if AXUIElementCopyElementAtPosition(system, Float(x), Float(y), &sys) == .success, let h = sys {
    let c = chain(prepare(h))
    out["systemHit"] = ["chain": chainWire(c), "pid": pidOf(h), "inWebArea": c.contains { role($0) == "AXWebArea" }]
  } else { out["systemHit"] = NSNull() }
  // The window the point lies in (by frame), else the focused one: its controls outside the web area.
  let holder = windows.first { frameOf($0)?.contains(point) ?? false } ?? element(attr(app, kAXFocusedWindowAttribute))
  if let holder {
    let o = outsideWebArea(holder)
    out["textOutside"] = o.text
    out["overlays"] = o.overlays
    out["outsideCount"] = o.count
  }
  out["ms"] = r1(nowMs() - t0)
  return out
}

func focus(_ q: [String: Any]) -> [String: Any] {
  guard let pid = (q["pid"] as? NSNumber)?.int32Value else { return ["error": "args"] }
  let app = prepare(AXUIElementCreateApplication(pid))
  guard let f = element(attr(app, kAXFocusedUIElementAttribute)) else { return ["focused": NSNull()] }
  var d = describe(f)
  d["range"] = range(f) ?? NSNull()
  d["inWebArea"] = chain(f).dropFirst().contains { role($0) == "AXWebArea" }
  return ["focused": d]
}

/// The focused window's first text area, breadth-first.
func textArea(_ pid: pid_t) -> AXUIElement? {
  let app = prepare(AXUIElementCreateApplication(pid))
  guard let w = element(attr(app, kAXFocusedWindowAttribute)) ?? elements(attr(app, kAXWindowsAttribute)).first else { return nil }
  var queue = [w], head = 0
  while head < queue.count && queue.count < 400 {
    let e = queue[head]; head += 1
    if role(e) == "AXTextArea" { return e }
    queue.append(contentsOf: elements(attr(e, kAXChildrenAttribute)))
  }
  return nil
}
func boundsFor(_ e: AXUIElement, _ location: Int, _ length: Int) -> CGRect? {
  var r = CFRange(location: location, length: length)
  guard let param = AXValueCreate(.cfRange, &r) else { return nil }
  var v: CFTypeRef?
  guard AXUIElementCopyParameterizedAttributeValue(e, kAXBoundsForRangeParameterizedAttribute as CFString, param, &v) == .success,
        let v, CFGetTypeID(v) == AXValueGetTypeID() else { return nil }
  var rect = CGRect.zero
  guard AXValueGetValue(v as! AXValue, .cgRect, &rect) else { return nil }
  return rect
}

func textpoint(_ q: [String: Any]) -> [String: Any] {
  guard let pid = (q["pid"] as? NSNumber)?.int32Value, let phrase = q["phrase"] as? String else { return ["error": "args"] }
  let after = (q["after"] as? NSNumber)?.intValue ?? 1
  guard let ta = textArea(pid), let value = str(ta, kAXValueAttribute) else { return ["error": "no text area"] }
  let ns = value as NSString
  let r = ns.range(of: phrase)
  guard r.location != NSNotFound else { return ["error": "phrase not found"] }
  let at = r.location + max(0, min(after, ns.length - r.location - 1))
  guard let b = boundsFor(ta, at, 1) else { return ["error": "no bounds"] }
  return ["x": r1(b.midX), "y": r1(b.midY), "index": r.location, "at": at, "bounds": wire(b), "areaFrame": wire(frameOf(ta))]
}

func caret(_ q: [String: Any]) -> [String: Any] {
  guard let pid = (q["pid"] as? NSNumber)?.int32Value else { return ["error": "args"] }
  guard let ta = textArea(pid), let value = str(ta, kAXValueAttribute) else { return ["error": "no text area"] }
  let ns = value as NSString
  var out: [String: Any] = ["range": range(ta) ?? NSNull(), "length": ns.length, "focused": boolAttr(ta, kAXFocusedAttribute)]
  if let phrase = q["phrase"] as? String { let r = ns.range(of: phrase); out["phraseIndex"] = r.location == NSNotFound ? -1 : r.location }
  if let loc = range(ta)?.first, loc <= ns.length {
    let line = ns.lineRange(for: NSRange(location: min(loc, max(0, ns.length - 1)), length: 0))
    out["line"] = ns.substring(with: line).trimmingCharacters(in: .newlines)
    out["lineStart"] = line.location
  }
  return out
}

func settext(_ q: [String: Any]) -> [String: Any] {
  guard let pid = (q["pid"] as? NSNumber)?.int32Value, let text = q["text"] as? String else { return ["error": "args"] }
  guard let ta = textArea(pid) else { return ["error": "no text area"] }
  var out: [String: Any] = ["value": AXUIElementSetAttributeValue(ta, kAXValueAttribute as CFString, text as CFString).rawValue]
  var r = CFRange(location: 0, length: 0)
  out["sel"] = AXUIElementSetAttributeValue(ta, kAXSelectedTextRangeAttribute as CFString, AXValueCreate(.cfRange, &r)!).rawValue
  return out
}

/// The reset's focus write (no event is posted): AXFocused on the window's first AXWebArea.
func focusweb(_ q: [String: Any]) -> [String: Any] {
  guard let pid = (q["pid"] as? NSNumber)?.int32Value else { return ["error": "args"] }
  let app = prepare(AXUIElementCreateApplication(pid))
  guard let w = element(attr(app, kAXFocusedWindowAttribute)) ?? elements(attr(app, kAXWindowsAttribute)).first else { return ["error": "no window"] }
  var queue = [w], head = 0
  while head < queue.count && queue.count < 600 {
    let e = queue[head]; head += 1
    if role(e) == "AXWebArea" {
      return ["write": AXUIElementSetAttributeValue(e, kAXFocusedAttribute as CFString, kCFBooleanTrue).rawValue]
    }
    queue.append(contentsOf: elements(attr(e, kAXChildrenAttribute)))
  }
  return ["error": "no web area"]
}

func value(_ q: [String: Any]) -> [String: Any] {
  guard let pid = (q["pid"] as? NSNumber)?.int32Value, let x = (q["x"] as? NSNumber)?.doubleValue, let y = (q["y"] as? NSNumber)?.doubleValue else { return ["error": "args"] }
  let app = prepare(AXUIElementCreateApplication(pid))
  var hit: AXUIElement?
  guard AXUIElementCopyElementAtPosition(app, Float(x), Float(y), &hit) == .success, let h = hit else { return ["hit": NSNull()] }
  var d = describe(prepare(h)); d["value"] = numberValue(prepare(h))
  return ["hit": d]
}

while let line = readLine() {
  guard let data = line.data(using: .utf8), let q = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { emit(["error": "bad request"]); continue }
  switch q["op"] as? String {
  case "signals": emit(signals(q))
  case "focus": emit(focus(q))
  case "textpoint": emit(textpoint(q))
  case "caret": emit(caret(q))
  case "settext": emit(settext(q))
  case "value": emit(value(q))
  case "focusweb": emit(focusweb(q))
  default: emit(["error": "unknown op"])
  }
}
