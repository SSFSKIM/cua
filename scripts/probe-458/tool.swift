// #458's side tool: #454's (scripts/probe-454/tool.swift) with `state`, `watch`, `order`, `restore` and `cancel` added;
// scripts/probe-458/closed.mjs and restore.mjs run it
// as a child of the job shell, which holds the runner image's Accessibility and Screen Recording grants. A line server on stdin, one JSON answer per line on stdout. Nothing here but
// `hover` posts input. It reads what a narrower detector could read at click time, and the native apps' ground truth.
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
//   {"op":"popup","pid","window":[x,y,w,h]}  the app's on-screen windows (number, layer, owner, bounds, z index), the
//       target window among them, and the overlay: the frontmost other window of the app in front of it (any layer); for
//       it the AX root inside it (a window, an app child, or the opener's menu), that root's elements breadth-first (role,
//       labels, value, menu mark, frame), and the application's and the system's hit-tests scanned down it every 4 pt
//   {"op":"open","pid","find":{roles,title,description,value,any},"action"}  the first matching element of the app's
//       windows, remembered as the opener, and an action taken on it ("focus" or an AX action name)
//   {"op":"opener"}                          the opener's value, title, frame and focus now
//   {"op":"hover","x","y"}                   the kit's pointer move for hover setups (the one op here that posts an event)
//   {"op":"menu","pid","path":[...]}         a menu bar item pressed through accessibility
//   {"op":"twowin","pid","a","b"}            two windows of the app placed, the back one made focused if the app allows
//   {"op":"menuinfo","pid","title"}          every open AXMenu the app's tree reaches (the opener's children, the app's
//       children, the windows' trees outside web areas): its chain up to its window or the app, its items (title, enabled,
//       AXSelected, mark); the item titled `title`: role, subrole, actions, chain; the highlighted item (AXSelected)
//       `bar`: [title, ...] scopes it to a menu-bar menu: the bar item's AXMenu, then each next title's submenu (added first)
//   {"op":"pressitem","pid","bar":[...],"title"}  AXPress on the item `title` of the menu `bar` names (a submenu's opener)
//   {"op":"select","pid","phrase","window"}  the text area's selection written to the phrase (AXSelectedTextRange)
//   {"op":"post","pid","x","y","stamp","win":[n,x,y,w,h]}  the kit's own left click (not the engine's), the engine's events
//       rebuilt (Mouse.swift: NSEvent down/up, field 3 button, field 7 subtype 3) and posted to pid: stamp "observed" or
//       "menu" sets fields 91/92 to win's number and the window location from win's origin; "none" stamps no window;
//       "hid" posts the down and up at the HID tap instead (a person's click, the cursor warped there); "move" posts a
//       mouse-moved (stamped alike) 200 ms before the down and 80 ms between down and up; "warp" moves the cursor there first
//   {"op":"state","pid"}                     the opener's value, AXExpanded, AXFocused, actions and its AXMenu children
//       (frame, item count); the app's AXFrontmost, its focused element (and whether it is the opener), its focused
//       window's frame; the on-screen layer-0 windows front to back (owner, pid, number), the top 6
//   {"op":"watch","pid","ms","target","user","skip","person"}  the window list sampled every 10 ms (5 ms with `person`,
//       whose AXFocusedWindow and AXMainWindow frames are read each sample): each change of the app's
//       menu-level windows, of whether `target` is in front of `user`, and of the layer-0 order (run on a second tool)
//   {"op":"order","skip"}                    the on-screen layer-0 windows front to back
//   {"op":"restore","user","target","hold"}  route 3's repair by the kit: AXRaise on the user app's focused window while
//       `target` is in front of it, inside a screen-update hold
//   {"op":"cancel","pid"}                    AXCancel on the app's open menu (else its first item)
//   {"op":"combo","pid"}                     the first AXComboBox's frame and its children's frames (the arrow's)
//   {"op":"arrange","wins":[n]}              the windows raised by AXRaise, back to front (the qualification's layouts)
//   {"op":"front","n"}                       window n made main, raised, its app activated with no options
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
func chainWire(_ c: [AXUIElement]) -> [Any] { c.prefix(16).map { e -> Any in [role(e), short(str(e, kAXSubroleAttribute)), short(str(e, "AXIdentifier")), wire(frameOf(e))] } }
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
  var hit: AXUIElement?
  if AXUIElementCopyElementAtPosition(app, Float(x), Float(y), &hit) == .success, let h = hit {
    let c = chain(prepare(h))
    var d: [String: Any] = ["chain": chainWire(c), "inWebArea": c.contains { role($0) == "AXWebArea" }, "pid": pidOf(h)]
    // The hit's nearest web area, remembered at the screenshot (`remember`) and compared at the click (`compare`):
    // whether the click's hit lies in the same web area (CFEqual) as the screenshot's hit at the point did.
    let area = c.first { role($0) == "AXWebArea" }
    if (q["remember"] as? Bool) == true { rememberedArea[pid] = area }
    if (q["compare"] as? Bool) == true {
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
/// The window a text op names by its frame (`"window":[x,y,w,h]` on textpoint, caret and settext), else the focused one.
var textWindowFrame: CGRect? = nil
func textArea(_ pid: pid_t) -> AXUIElement? {
  let app = prepare(AXUIElementCreateApplication(pid))
  let named = textWindowFrame.flatMap { want in elements(attr(app, kAXWindowsAttribute)).first { frameOf($0).map { near($0, want, 6) } ?? false } }
  guard let w = named ?? element(attr(app, kAXFocusedWindowAttribute)) ?? elements(attr(app, kAXWindowsAttribute)).first else { return nil }
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

func rectOf(_ w: [String: Any]) -> CGRect {
  var b = CGRect.zero
  if let d = w[kCGWindowBounds as String] as? NSDictionary { CGRectMakeWithDictionaryRepresentation(d, &b) }
  return b
}
func near(_ a: CGRect, _ b: CGRect, _ t: CGFloat = 2) -> Bool {
  abs(a.minX - b.minX) <= t && abs(a.minY - b.minY) <= t && abs(a.width - b.width) <= t && abs(a.height - b.height) <= t
}
func row(_ e: AXUIElement, depth: Int) -> [String: Any] {
  var d = describe(e); d["value"] = short(str(e, kAXValueAttribute)); d["depth"] = depth; d["selected"] = boolAttr(e, kAXSelectedAttribute)
  return d
}
func windowAncestor(_ e: AXUIElement) -> AXUIElement? { chain(e).first { role($0) == "AXWindow" } }

func popup(_ q: [String: Any]) -> [String: Any] {
  guard let pid = (q["pid"] as? NSNumber)?.int32Value, let wa = q["window"] as? [Double], wa.count == 4 else { return ["error": "args"] }
  let wanted = CGRect(x: wa[0], y: wa[1], width: wa[2], height: wa[3])
  let list = (CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]) ?? []
  var mine: [[String: Any]] = [], target: [String: Any]? = nil, pop: [String: Any]? = nil, popRect = CGRect.null
  for (i, w) in list.enumerated() {
    guard ((w[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value ?? 0) == pid else { continue }
    let b = rectOf(w), layer = (w[kCGWindowLayer as String] as? NSNumber)?.intValue ?? 0
    let r: [String: Any] = ["i": i, "n": (w[kCGWindowNumber as String] as? NSNumber)?.intValue ?? 0, "layer": layer, "bounds": wire(b),
                            "alpha": (w[kCGWindowAlpha as String] as? NSNumber)?.doubleValue ?? 1,
                            "owner": short(w[kCGWindowOwnerName as String] as? String)]
    mine.append(r)
    if target == nil, layer == 0, near(b, wanted, 3) { target = r; continue }
    // The overlay: the frontmost window of the app in front of the target (any layer: a menu's is 101), 20 pt each way.
    if pop == nil, target == nil, b.height >= 20, b.width >= 20 { pop = r; popRect = b }
  }
  var out: [String: Any] = ["appWindows": mine, "target": target ?? NSNull(), "popup": pop ?? NSNull()]
  guard pop != nil else { return out }
  let app = prepare(AXUIElementCreateApplication(pid))
  var roots = elements(attr(app, kAXWindowsAttribute)) + elements(attr(app, kAXChildrenAttribute)).filter { role($0) != "AXMenuBar" }
  // A popup button's menu hangs under the button that opened it; a sheet under its window.
  if let opener { roots += elements(attr(opener, kAXChildrenAttribute)).filter { role($0) == "AXMenu" } }
  for w in elements(attr(app, kAXWindowsAttribute)) { roots += elements(attr(w, kAXChildrenAttribute)).filter { role($0) == "AXSheet" } }
  out["axRoots"] = roots.prefix(12).map { describe($0) }
  let grown = popRect.insetBy(dx: -8, dy: -8)
  if let axPop = roots.first(where: { frameOf($0).map { grown.contains($0) && $0.width * $0.height >= popRect.width * popRect.height * 0.5 } ?? false }) {
    out["axPopup"] = describe(axPop)
    var queue: [(AXUIElement, Int)] = [(axPop, 0)], head = 0, rows: [[String: Any]] = []
    while head < queue.count && queue.count < 900 {
      let (e, depth) = queue[head]; head += 1
      if depth > 0, let f = frameOf(e), f.height >= 8, f.width >= 8, grown.contains(f) {
        var d = row(e, depth: depth); d["mark"] = short(str(e, "AXMenuItemMarkChar")); d["enabled"] = boolAttr(e, kAXEnabledAttribute)
        rows.append(d)
      }
      if depth < 20 { for k in elements(attr(e, kAXChildrenAttribute)) { queue.append((k, depth + 1)) } }
    }
    out["axRows"] = Array(rows.prefix(160))
  } else { out["axPopup"] = NSNull() }
  // The hit-test scanned down the overlay, asked of the application and of the system.
  let system = prepare(AXUIElementCreateSystemWide())
  for (name, root) in [("scan", app), ("systemScan", system)] {
    var scan: [[String: Any]] = [], last = ""
    let x = popRect.minX + popRect.width * 0.3
    var y = popRect.minY + 2
    while y < popRect.maxY - 1 && scan.count < 80 {
      var hit: AXUIElement?
      if AXUIElementCopyElementAtPosition(root, Float(x), Float(y), &hit) == .success, let h = hit {
        let e = prepare(h)
        var d = describe(e)
        d["windowFrame"] = wire(windowAncestor(e).flatMap(frameOf))
        d["value"] = short(str(e, kAXValueAttribute))
        d["pid"] = pidOf(e)
        let key = "\(d["role"] ?? "")|\(d["frame"] ?? "")"
        if key != last { d["y"] = r1(Double(y)); scan.append(d); last = key }
      } else if last != "none" { scan.append(["y": r1(Double(y)), "role": NSNull()]); last = "none" }
      y += 4
    }
    out[name] = scan
  }
  out["scanX"] = r1(Double(popRect.minX + popRect.width * 0.3))
  return out
}

/// The element the last `open` found (the kit's opener), read again after the click for its value.
var opener: AXUIElement? = nil
func matches(_ e: AXUIElement, _ q: [String: Any]) -> Bool {
  if let roles = q["roles"] as? [String], !roles.contains(role(e)) { return false }
  for (key, name) in [("title", kAXTitleAttribute), ("description", kAXDescriptionAttribute), ("value", kAXValueAttribute)] {
    guard let want = q[key] as? String else { continue }
    guard let have = str(e, name as String), have.trimmingCharacters(in: .whitespaces) == want else { return false }
  }
  if let any = q["any"] as? String {
    let text = [kAXTitleAttribute, kAXDescriptionAttribute, kAXHelpAttribute, "AXPlaceholderValue"].compactMap { str(e, $0 as String) }.joined(separator: " | ")
    if text.range(of: any, options: [.regularExpression, .caseInsensitive]) == nil { return false }
  }
  return true
}
func actionList(_ e: AXUIElement) -> [String] { var n: CFArray?; return AXUIElementCopyActionNames(e, &n) == .success ? (n as? [String] ?? []) : [] }
/// The first element of the app's windows that matches `find` (breadth-first), remembered as the opener, then `action`
/// taken on it: "focus" writes AXFocused, any other names an AX action. A press that opens a menu may answer only when
/// the menu closes, so its AXError is often the 1 s timeout's.
func open(_ q: [String: Any]) -> [String: Any] {
  guard let pid = (q["pid"] as? NSNumber)?.int32Value, let find = q["find"] as? [String: Any] else { return ["error": "args"] }
  let app = prepare(AXUIElementCreateApplication(pid))
  var queue: [(AXUIElement, Int)] = elements(attr(app, kAXWindowsAttribute)).map { ($0, 0) }, head = 0
  var found: AXUIElement? = nil
  while head < queue.count && queue.count < 6000 {
    let (e, depth) = queue[head]; head += 1
    if matches(e, find), let f = frameOf(e), f.width > 2, f.height > 2 { found = e; break }
    if depth < 40 { for k in elements(attr(e, kAXChildrenAttribute)) { queue.append((k, depth + 1)) } }
  }
  guard let found else { opener = nil; return ["error": "not found", "visited": head] }
  opener = found
  var out: [String: Any] = ["opener": describe(found), "value": short(str(found, kAXValueAttribute)), "actions": actionList(found)]
  let t0 = nowMs()
  switch q["action"] as? String {
  case "focus"?: out["result"] = AXUIElementSetAttributeValue(found, kAXFocusedAttribute as CFString, kCFBooleanTrue).rawValue
  case let a?: out["result"] = AXUIElementPerformAction(found, a as CFString).rawValue
  case nil: break
  }
  out["ms"] = r1(nowMs() - t0)
  return out
}
/// {"op":"hover","x","y"}: the kit's own pointer move (setup, not the engine's): the cursor warped there and a mouse-moved
/// event posted at the HID tap, twice, so an app's hover state (a link's status bubble, a tab's hover card) follows it.
func hover(_ q: [String: Any]) -> [String: Any] {
  guard let x = (q["x"] as? NSNumber)?.doubleValue, let y = (q["y"] as? NSNumber)?.doubleValue else { return ["error": "args"] }
  let p = CGPoint(x: x, y: y)
  let warp = CGWarpMouseCursorPosition(p).rawValue
  for dx in [-1.0, 0.0] {
    CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: CGPoint(x: x + dx, y: y), mouseButton: .left)?.post(tap: .cghidEventTap)
    usleep(60_000)
  }
  return ["warp": warp]
}
/// {"op":"menu","pid","path":[regex,...]}: the app's menu bar item pressed through accessibility along the path (titles
/// matched whole by the regexes), the last one with AXPress. No activation, no event.
func menu(_ q: [String: Any]) -> [String: Any] {
  guard let pid = (q["pid"] as? NSNumber)?.int32Value, let path = q["path"] as? [String], !path.isEmpty else { return ["error": "args"] }
  let app = prepare(AXUIElementCreateApplication(pid))
  guard var cur = element(attr(app, kAXMenuBarAttribute)) else { return ["error": "no menu bar"] }
  for (i, want) in path.enumerated() {
    var queue = [cur], head = 0, found: AXUIElement? = nil
    while head < queue.count && queue.count < 2000 {
      let e = queue[head]; head += 1
      if head > 1, ["AXMenuBarItem", "AXMenuItem"].contains(role(e)), let t = str(e, kAXTitleAttribute),
         t.range(of: "^(\(want))$", options: .regularExpression) != nil { found = e; break }
      if role(e) == "AXMenuItem" && i < path.count - 1 && head > 1 { continue }
      queue.append(contentsOf: elements(attr(e, kAXChildrenAttribute)))
    }
    guard let found else { return ["error": "no item \(want)"] }
    cur = found
  }
  return ["result": AXUIElementPerformAction(cur, kAXPressAction as CFString).rawValue, "title": short(str(cur, kAXTitleAttribute))]
}
/// {"op":"raise","pid","frame":[x,y,w,h]}: the app's window at that frame (within 6 pt) raised through accessibility
/// (AXRaise, then AXMain written), no activation. Answers the results, the focused window's frame and the app's layer-0
/// windows front to back.
func raise(_ q: [String: Any]) -> [String: Any] {
  guard let pid = (q["pid"] as? NSNumber)?.int32Value, let f = q["frame"] as? [Double], f.count == 4 else { return ["error": "args"] }
  let want = CGRect(x: f[0], y: f[1], width: f[2], height: f[3])
  let app = prepare(AXUIElementCreateApplication(pid))
  guard let w = elements(attr(app, kAXWindowsAttribute)).first(where: { frameOf($0).map { near($0, want, 6) } ?? false }) else {
    return ["error": "no window at \(f)", "windows": elements(attr(app, kAXWindowsAttribute)).map { wire(frameOf($0)) }]
  }
  let raised = AXUIElementPerformAction(w, kAXRaiseAction as CFString).rawValue
  let main = AXUIElementSetAttributeValue(w, kAXMainAttribute as CFString, kCFBooleanTrue).rawValue
  usleep(400_000)
  let list = (CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]) ?? []
  let order = list.filter { (($0[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value ?? 0) == pid && (($0[kCGWindowLayer as String] as? NSNumber)?.intValue ?? 0) == 0 }
    .map { ["n": ($0[kCGWindowNumber as String] as? NSNumber)?.intValue ?? 0, "bounds": wire(rectOf($0))] as [String: Any] }
  return ["raise": raised, "main": main, "focused": wire(element(attr(app, kAXFocusedWindowAttribute)).flatMap(frameOf)), "order": order]
}
/// {"op":"twowin","pid","a":[x,y,w,h],"b":[x,y,w,h]}: the app's two front standard windows placed (the second at `a`, the
/// observed one; the first at `b`, over it), then the attempt to have `a` focused while `b` stays in front of it: B raised,
/// then the application's AXFocusedWindow written to A. Answers each step's state: the focused window's frame and the
/// two windows' order in the on-screen list.
func twowin(_ q: [String: Any]) -> [String: Any] {
  guard let pid = (q["pid"] as? NSNumber)?.int32Value, let a = q["a"] as? [Double], let b = q["b"] as? [Double], a.count == 4, b.count == 4 else { return ["error": "args"] }
  let app = prepare(AXUIElementCreateApplication(pid))
  let wins = elements(attr(app, kAXWindowsAttribute)).filter { (str($0, kAXSubroleAttribute) ?? "") == "AXStandardWindow" }
  guard wins.count >= 2 else { return ["error": "windows \(wins.count)"] }
  let wB = wins[0], wA = wins[1]
  func place(_ w: AXUIElement, _ f: [Double]) {
    var p = CGPoint(x: f[0], y: f[1]), s = CGSize(width: f[2], height: f[3])
    AXUIElementSetAttributeValue(w, kAXPositionAttribute as CFString, AXValueCreate(.cgPoint, &p)!)
    AXUIElementSetAttributeValue(w, kAXSizeAttribute as CFString, AXValueCreate(.cgSize, &s)!)
  }
  place(wA, a); place(wB, b)
  let fa = CGRect(x: a[0], y: a[1], width: a[2], height: a[3])
  func state(_ step: String, _ result: Int32) -> [String: Any] {
    let list = (CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]) ?? []
    let mine = list.enumerated().filter { ((($0.element[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value) ?? 0) == pid && ((($0.element[kCGWindowLayer as String] as? NSNumber)?.intValue) ?? 0) == 0 }
    let order = mine.map { ["i": $0.offset, "n": ($0.element[kCGWindowNumber as String] as? NSNumber)?.intValue ?? 0, "bounds": wire(rectOf($0.element))] as [String: Any] }
    let focused = element(attr(app, kAXFocusedWindowAttribute)).flatMap(frameOf)
    let aIndex = mine.first { near(rectOf($0.element), fa, 3) }?.offset
    let behind = mine.contains { $0.offset < (aIndex ?? -1) && rectOf($0.element).intersects(fa) }
    return ["step": step, "result": result, "focused": wire(focused), "aFocused": focused.map { near($0, fa, 3) } ?? false, "aBehind": behind, "order": order]
  }
  var steps: [[String: Any]] = []
  steps.append(state("placed", 0))
  steps.append(state("raiseB", AXUIElementPerformAction(wB, kAXRaiseAction as CFString).rawValue))
  usleep(300_000)
  steps.append(state("focusedWindowA", AXUIElementSetAttributeValue(app, kAXFocusedWindowAttribute as CFString, wA).rawValue))
  usleep(300_000)
  steps.append(state("settled", 0))
  let last = steps.last!
  return ["ok": (last["aFocused"] as? Bool) == true && (last["aBehind"] as? Bool) == true, "steps": steps]
}

/// The opener's value, title, frame and focus now.
func openerNow(_ q: [String: Any]) -> [String: Any] {
  guard let opener else { return ["error": "no opener"] }
  return ["value": short(str(opener, kAXValueAttribute)), "title": short(str(opener, kAXTitleAttribute)), "frame": wire(frameOf(opener)),
          "focused": boolAttr(opener, kAXFocusedAttribute)]
}

/// Every open AXMenu the app's tree reaches, deduplicated: the opener's children, the app's children, then the windows'
/// trees (breadth-first, web areas not entered, 4000 elements).
/// The menu a menu-bar path names: the bar item titled path[0]'s AXMenu, then the AXMenu of each next title's item in it.
func barMenu(_ pid: pid_t, _ path: [String]) -> AXUIElement? {
  let app = prepare(AXUIElementCreateApplication(pid))
  guard let bar = element(attr(app, kAXMenuBarAttribute)), let first = path.first,
        let item = elements(attr(bar, kAXChildrenAttribute)).first(where: { str($0, kAXTitleAttribute) == first }),
        var menu = elements(attr(item, kAXChildrenAttribute)).first(where: { role($0) == "AXMenu" }) else { return nil }
  for title in path.dropFirst() {
    guard let i = elements(attr(menu, kAXChildrenAttribute)).first(where: { str($0, kAXTitleAttribute) == title }),
          let sub = elements(attr(i, kAXChildrenAttribute)).first(where: { role($0) == "AXMenu" }) else { return nil }
    menu = sub
  }
  return menu
}
func openMenus(_ pid: pid_t, bar: [String]? = nil) -> [AXUIElement] {
  let app = prepare(AXUIElementCreateApplication(pid))
  var found: [AXUIElement] = []
  func add(_ e: AXUIElement) { if !found.contains(where: { CFEqual($0, e) }) { found.append(e) } }
  if let bar, let m = barMenu(pid, bar) { add(m) }
  if let opener { for k in elements(attr(opener, kAXChildrenAttribute)) where role(k) == "AXMenu" { add(k) } }
  for k in elements(attr(app, kAXChildrenAttribute)) where role(k) == "AXMenu" { add(k) }
  var queue: [(AXUIElement, Int)] = elements(attr(app, kAXWindowsAttribute)).map { ($0, 0) }, head = 0
  while head < queue.count && queue.count < 4000 {
    let (e, depth) = queue[head]; head += 1
    let r = role(e)
    if r == "AXMenu" { add(e); continue }
    if r == "AXWebArea" { continue }
    if depth < 30 { for k in elements(attr(e, kAXChildrenAttribute)) { queue.append((k, depth + 1)) } }
  }
  return found
}
func menuinfo(_ q: [String: Any]) -> [String: Any] {
  guard let pid = (q["pid"] as? NSNumber)?.int32Value else { return ["error": "args"] }
  let want = q["title"] as? String
  var out: [String: Any] = [:]
  var item: AXUIElement? = nil, highlighted: Any = NSNull()
  out["menus"] = openMenus(pid, bar: q["bar"] as? [String]).prefix(6).map { m -> [String: Any] in
    var d = describe(m)
    d["chain"] = chainWire(chain(m))
    d["pid"] = pidOf(m)
    let items = elements(attr(m, kAXChildrenAttribute)).filter { role($0) == "AXMenuItem" }
    d["count"] = items.count
    d["items"] = items.prefix(40).map { i -> [String: Any] in
      ["title": short(str(i, kAXTitleAttribute)), "enabled": boolAttr(i, kAXEnabledAttribute), "selected": boolAttr(i, kAXSelectedAttribute),
       "mark": short(str(i, "AXMenuItemMarkChar")), "frame": wire(frameOf(i))]
    }
    d["titles"] = items.prefix(600).filter { (boolAttr($0, kAXEnabledAttribute) as? Bool) != false }.compactMap { str($0, kAXTitleAttribute) }.filter { !$0.isEmpty }
    // The menu's highlighted item: the first titled item reading AXSelected; the answer's is the one of the menu that holds
    // `title` (Chrome's <select> also has an untitled AXMenu under the page's pop-up button), else the first found.
    var lit: Any = NSNull()
    var holds = false
    for i in items {
      let t = str(i, kAXTitleAttribute)
      if let want, t == want { holds = true; if item == nil { item = i } }
      if (lit as? String) == nil, let t, !t.isEmpty, (boolAttr(i, kAXSelectedAttribute) as? Bool) == true { lit = short(t) }
    }
    d["highlighted"] = lit
    d["holdsTitle"] = holds
    if (holds && want != nil) || (want == nil && (highlighted as? String) == nil) { highlighted = lit }
    return d
  }
  out["highlighted"] = highlighted
  if let item {
    var t = describe(item)
    t["actions"] = actionList(item)
    t["chain"] = chainWire(chain(item))
    t["enabled"] = boolAttr(item, kAXEnabledAttribute)
    t["selected"] = boolAttr(item, kAXSelectedAttribute)
    t["pid"] = pidOf(item)
    out["item"] = t
  } else { out["item"] = NSNull() }
  return out
}

func pressitem(_ q: [String: Any]) -> [String: Any] {
  guard let pid = (q["pid"] as? NSNumber)?.int32Value, let bar = q["bar"] as? [String], let title = q["title"] as? String else { return ["error": "args"] }
  guard let menu = barMenu(pid, bar), let item = elements(attr(menu, kAXChildrenAttribute)).first(where: { str($0, kAXTitleAttribute) == title }) else { return ["error": "no item"] }
  return ["result": AXUIElementPerformAction(item, kAXPressAction as CFString).rawValue]
}
func selectPhrase(_ q: [String: Any]) -> [String: Any] {
  guard let pid = (q["pid"] as? NSNumber)?.int32Value, let phrase = q["phrase"] as? String else { return ["error": "args"] }
  guard let ta = textArea(pid), let value = str(ta, kAXValueAttribute) else { return ["error": "no text area"] }
  let r = (value as NSString).range(of: phrase)
  guard r.location != NSNotFound else { return ["error": "phrase not found"] }
  var cr = CFRange(location: r.location, length: r.length)
  return ["result": AXUIElementSetAttributeValue(ta, kAXSelectedTextRangeAttribute as CFString, AXValueCreate(.cfRange, &cr)!).rawValue, "range": range(ta) ?? NSNull()]
}

private typealias SetWindowLocation = @convention(c) (CGEvent, CGPoint) -> Void
private let setWindowLocation: SetWindowLocation? = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "CGEventSetWindowLocation")
  .map { unsafeBitCast($0, to: SetWindowLocation.self) }
func field(_ raw: UInt32) -> CGEventField { CGEventField(rawValue: raw) ?? unsafeBitCast(raw, to: CGEventField.self) }
var kitEventNumber = 50_000
func post(_ q: [String: Any]) -> [String: Any] {
  guard let pid = (q["pid"] as? NSNumber)?.int32Value, let x = (q["x"] as? NSNumber)?.doubleValue, let y = (q["y"] as? NSNumber)?.doubleValue,
        let stamp = q["stamp"] as? String else { return ["error": "args"] }
  let p = CGPoint(x: x, y: y)
  let move = (q["move"] as? Bool) == true
  if stamp == "hid" {
    let warp = CGWarpMouseCursorPosition(p).rawValue
    usleep(40_000)
    if move {
      for dx in [-2.0, 0.0] { CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: CGPoint(x: p.x + dx, y: p.y), mouseButton: .left)?.post(tap: .cghidEventTap); usleep(100_000) }
    }
    let right = (q["button"] as? String) == "right"
    for type in right ? [CGEventType.rightMouseDown, .rightMouseUp] : [CGEventType.leftMouseDown, .leftMouseUp] {
      CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: p, mouseButton: right ? .right : .left)?.post(tap: .cghidEventTap)
      usleep(move ? 80_000 : 40_000)
    }
    return ["stamp": stamp, "warp": warp, "move": move]
  }
  var warped: Any = NSNull()
  if (q["warp"] as? Bool) == true { warped = CGWarpMouseCursorPosition(p).rawValue; usleep(100_000) }
  var id = 0, origin = CGPoint.zero
  if stamp != "none" {
    guard let w = q["win"] as? [Double], w.count == 5 else { return ["error": "win"] }
    id = Int(w[0]); origin = CGPoint(x: w[1], y: w[2])
  }
  kitEventNumber += 1
  var made = 0
  for type in (move ? [NSEvent.EventType.mouseMoved] : []) + [NSEvent.EventType.leftMouseDown, .leftMouseUp] {
    guard let e = NSEvent.mouseEvent(with: type, location: p, modifierFlags: [], timestamp: 0, windowNumber: id, context: nil,
                                     eventNumber: type == .mouseMoved ? 0 : kitEventNumber, clickCount: type == .mouseMoved ? 0 : 1,
                                     pressure: type == .mouseMoved ? 0 : 1.0)?.cgEvent else { continue }
    e.location = p
    e.setIntegerValueField(.mouseEventButtonNumber, value: 0)
    e.setIntegerValueField(.mouseEventSubtype, value: 3)
    if id != 0 {
      e.setIntegerValueField(field(91), value: Int64(id))
      e.setIntegerValueField(field(92), value: Int64(id))
      setWindowLocation?(e, CGPoint(x: p.x - origin.x, y: p.y - origin.y))
    }
    e.timestamp = DispatchTime.now().uptimeNanoseconds
    e.postToPid(pid)
    made += 1
    if move { usleep(type == .mouseMoved ? 200_000 : 80_000) }
  }
  return ["stamp": stamp, "move": move, "warp": warped, "window": id, "windowLocation": [r1(p.x - origin.x), r1(p.y - origin.y)], "posted": made, "setWindowLocation": setWindowLocation != nil]
}

/// {"op":"state","pid"}: the closed pop-up's state and the app's activation, read through accessibility and the window list.
func state(_ q: [String: Any]) -> [String: Any] {
  guard let pid = (q["pid"] as? NSNumber)?.int32Value else { return ["error": "args"] }
  let app = prepare(AXUIElementCreateApplication(pid))
  var out: [String: Any] = ["axFrontmost": boolAttr(app, kAXFrontmostAttribute)]
  if let f = element(attr(app, kAXFocusedUIElementAttribute)) {
    var d = describe(f)
    d["isOpener"] = opener.map { CFEqual($0, f) } ?? false
    out["focused"] = d
  } else { out["focused"] = NSNull() }
  out["focusedWindow"] = wire(element(attr(app, kAXFocusedWindowAttribute)).flatMap(frameOf))
  if let opener {
    out["opener"] = ["value": short(str(opener, kAXValueAttribute)), "expanded": boolAttr(opener, kAXExpandedAttribute),
                     "focused": boolAttr(opener, kAXFocusedAttribute), "actions": actionList(opener)]
    out["openerMenus"] = elements(attr(opener, kAXChildrenAttribute)).filter { ["AXMenu", "AXList", "AXScrollArea"].contains(role($0)) }.map { m -> [String: Any] in
      ["role": role(m), "frame": wire(frameOf(m)), "children": elements(attr(m, kAXChildrenAttribute)).count]
    }
  }
  let list = (CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]) ?? []
  out["order"] = list.filter { (($0[kCGWindowLayer as String] as? NSNumber)?.intValue ?? 0) == 0 }.prefix(6).map { w -> [Any] in
    [short(w[kCGWindowOwnerName as String] as? String), (w[kCGWindowOwnerPID as String] as? NSNumber)?.intValue ?? 0, (w[kCGWindowNumber as String] as? NSNumber)?.intValue ?? 0]
  }
  return out
}

/// {"op":"watch","pid","ms","target","user","skip":[pid]}: the window list sampled every 10 ms for `ms`: each change of
/// (the app's on-screen windows at layer >= 100 and at least 20 pt each way, whether window `target` is in front of window
/// `user`, the layer-0 order of every window not owned by a `skip` pid, as their numbers front to back) as
/// [ms since start, menus, above, order or null when unchanged]; and the time `target` spent in front of `user`.
func watch(_ q: [String: Any]) -> [String: Any] {
  guard let pid = (q["pid"] as? NSNumber)?.int32Value else { return ["error": "args"] }
  let ms = (q["ms"] as? NSNumber)?.doubleValue ?? 2000
  let target = (q["target"] as? NSNumber)?.intValue ?? -1, user = (q["user"] as? NSNumber)?.intValue ?? -1
  let skip = Set((q["skip"] as? [NSNumber] ?? []).map { $0.int32Value })
  // `person`: the person's app, whose AXFocusedWindow and AXMainWindow frames are read every sample (5 ms apart), each
  // change kept as [ms, focused frame, main frame] (null where a read fails).
  let personApp = (q["person"] as? NSNumber).map { prepare(AXUIElementCreateApplication($0.int32Value)) }
  var personSamples: [[Any]] = [], lastPerson = "", personReads = 0
  let t0 = nowMs()
  var samples: [[Any]] = [], last = "", lastOrder = "", reads = 0
  var aboveMs = 0.0, aboveSince: Double? = nil, firstAbove: Double? = nil, lastAboveEnd: Double? = nil
  while nowMs() - t0 < ms {
    let list = (CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]) ?? []
    let t = nowMs() - t0
    reads += 1
    let menus = list.filter { w in
      let b = rectOf(w)
      return ((w[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value ?? 0) == pid && ((w[kCGWindowLayer as String] as? NSNumber)?.intValue ?? 0) >= 100 && b.width >= 20 && b.height >= 20
    }.count
    let zero = list.filter { (($0[kCGWindowLayer as String] as? NSNumber)?.intValue ?? 0) == 0 && !skip.contains((($0[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value ?? 0)) }
    let numbers = zero.map { ($0[kCGWindowNumber as String] as? NSNumber)?.intValue ?? 0 }
    let ti = numbers.firstIndex(of: target), ui = numbers.firstIndex(of: user)
    let above = ti != nil && ui != nil && ti! < ui!
    if above { if aboveSince == nil { aboveSince = t; if firstAbove == nil { firstAbove = t } } }
    else if let since = aboveSince { aboveMs += t - since; aboveSince = nil; lastAboveEnd = t }
    let order = numbers.map(String.init).joined(separator: ",")
    let key = "\(menus)|\(above)|\(order)"
    if key != last {
      samples.append([r1(t), menus, above, order == lastOrder ? NSNull() : numbers])
      last = key; lastOrder = order
    }
    if let personApp {
      let focused = wire(element(attr(personApp, kAXFocusedWindowAttribute)).flatMap(frameOf))
      let main = wire(element(attr(personApp, kAXMainWindowAttribute)).flatMap(frameOf))
      personReads += 1
      let k = "\(focused)|\(main)"
      if k != lastPerson { personSamples.append([r1(nowMs() - t0), focused, main]); lastPerson = k }
      usleep(5_000)
    } else { usleep(10_000) }
  }
  if let since = aboveSince { aboveMs += nowMs() - t0 - since }
  return ["samples": samples, "reads": reads, "personSamples": personSamples, "personReads": personReads, "aboveMs": r1(aboveMs), "firstAbove": firstAbove.map(r1) ?? NSNull(),
          "lastAboveEnd": lastAboveEnd.map(r1) ?? NSNull(), "aboveAtEnd": aboveSince != nil]
}

/// {"op":"order","skip":[pid]}: the on-screen layer-0 windows front to back (number, owner pid and name, bounds), but
/// those of the `skip` pids.
func order(_ q: [String: Any]) -> [String: Any] {
  let skip = Set((q["skip"] as? [NSNumber] ?? []).map { $0.int32Value })
  let list = (CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]) ?? []
  let rows = list.filter { (($0[kCGWindowLayer as String] as? NSNumber)?.intValue ?? 0) == 0 && !skip.contains((($0[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value ?? 0)) }
    .map { w -> [String: Any] in
      ["n": (w[kCGWindowNumber as String] as? NSNumber)?.intValue ?? 0, "pid": (w[kCGWindowOwnerPID as String] as? NSNumber)?.intValue ?? 0,
       "owner": short(w[kCGWindowOwnerName as String] as? String), "bounds": wire(rectOf(w))]
    }
  return ["windows": rows]
}

private enum Sky {
  typealias ConnectionID = @convention(c) () -> Int32
  typealias Update = @convention(c) (Int32) -> Int32
  static let main: ConnectionID? = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "SLSMainConnectionID").map { unsafeBitCast($0, to: ConnectionID.self) }
  static let disable: Update? = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "SLSDisableUpdate").map { unsafeBitCast($0, to: Update.self) }
  static let reenable: Update? = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "SLSReenableUpdate").map { unsafeBitCast($0, to: Update.self) }
}
func windowInFront(_ a: Int, of b: Int) -> Bool {
  let list = (CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]) ?? []
  for w in list {
    let n = (w[kCGWindowNumber as String] as? NSNumber)?.intValue ?? 0
    if n == a { return true }
    if n == b { return false }
  }
  return false
}
/// {"op":"restore","user":pid,"target":n,"hold":bool,"users":[n]}: route 3's delivery-guard repair (engine Activation.swift
/// `deliver`: `guardedUser` -> `ActivationSystem.userWindow` + `raise`), done by the kit: the user app's focused window
/// (AXFocusedWindow, its number matched in the window list by pid and frame), then, inside a screen-update hold
/// (SLSDisableUpdate .. SLSReenableUpdate) when `hold`, sampled every 2 ms: while window `target` is in front of it, AXRaise
/// on it; ends on 3 stable samples no sooner than 60 ms, or at 1000 ms.
func restoreOrder(_ q: [String: Any]) -> [String: Any] {
  guard let user = (q["user"] as? NSNumber)?.int32Value, let target = (q["target"] as? NSNumber)?.intValue else { return ["error": "args"] }
  let t0 = nowMs()
  let app = prepare(AXUIElementCreateApplication(user))
  guard let win = element(attr(app, kAXFocusedWindowAttribute)), let f = frameOf(win) else { return ["error": "no focused window", "ms": r1(nowMs() - t0)] }
  let list = (CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]) ?? []
  let mine = list.filter { (($0[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value ?? 0) == user && (($0[kCGWindowLayer as String] as? NSNumber)?.intValue ?? 0) == 0 }
  guard let userN = mine.first(where: { near(rectOf($0), f, 3) }).flatMap({ ($0[kCGWindowNumber as String] as? NSNumber)?.intValue }) else { return ["error": "focused window not on screen", "frame": wire(f)] }
  // `users` (back to front): every window of the person's app that was in front of `target`, each raised in that order,
  // so their own order comes back with them; else the focused window alone (the engine's repair).
  var guarded: [(n: Int, element: AXUIElement)] = [(userN, win)]
  if let users = (q["users"] as? [NSNumber])?.map({ $0.intValue }), !users.isEmpty {
    let axWindows = elements(attr(app, kAXWindowsAttribute))
    guarded = users.compactMap { n in
      guard let b = mine.first(where: { (($0[kCGWindowNumber as String] as? NSNumber)?.intValue ?? 0) == n }).map(rectOf),
            let e = axWindows.first(where: { frameOf($0).map { near($0, b, 3) } ?? false }) else { return nil }
      return (n, e)
    }
    if guarded.count != users.count { return ["error": "person's windows not all found", "found": guarded.map { $0.n }, "users": users] }
  }
  let found = nowMs() - t0
  let hold = (q["hold"] as? Bool) == true
  var held = false
  if hold, let c = Sky.main?(), let d = Sky.disable { _ = d(c); held = true }
  let tHold = nowMs()
  let covering = { guarded.contains { windowInFront(target, of: $0.n) } }
  let firstAbove = covering()
  var raises: [Int32] = [], stable = 0
  while (stable < 3 || nowMs() - tHold < 60) && nowMs() - tHold < 1000 {
    if covering() { for g in guarded { raises.append(AXUIElementPerformAction(g.element, kAXRaiseAction as CFString).rawValue) }; stable = 0 }
    else { stable += 1 }
    usleep(2_000)
  }
  let lastAbove = covering()
  if held, let c = Sky.main?(), let r = Sky.reenable { _ = r(c) }
  return ["userWindow": userN, "userFrame": wire(f), "guarded": guarded.map { $0.n }, "firstAbove": firstAbove, "lastAbove": lastAbove, "raises": raises,
          "held": held, "findMs": r1(found), "loopMs": r1(nowMs() - tHold), "ms": r1(nowMs() - t0)]
}

/// {"op":"cancel","pid"}: AXCancel on the app's open menu (the first AXMenu `openMenus` finds holding items), else on its
/// first item.
func cancel(_ q: [String: Any]) -> [String: Any] {
  guard let pid = (q["pid"] as? NSNumber)?.int32Value else { return ["error": "args"] }
  guard let m = openMenus(pid).first(where: { elements(attr($0, kAXChildrenAttribute)).contains { role($0) == "AXMenuItem" } }) else { return ["error": "no open menu"] }
  let t0 = nowMs()
  let onMenu = AXUIElementPerformAction(m, kAXCancelAction as CFString).rawValue
  var out: [String: Any] = ["menu": onMenu, "menuActions": actionList(m)]
  if onMenu != 0, let item = elements(attr(m, kAXChildrenAttribute)).first(where: { role($0) == "AXMenuItem" }) {
    out["item"] = AXUIElementPerformAction(item, kAXCancelAction as CFString).rawValue
  }
  out["ms"] = r1(nowMs() - t0)
  return out
}

/// {"op":"combo","pid"}: the app's first AXComboBox (its windows breadth-first): its frame and actions, and each child's
/// role, subrole, frame, actions and trailing gap (the combo's right edge less the child's); `press` then AXPress on its
/// trailing AXButton child.
func combo(_ q: [String: Any]) -> [String: Any] {
  guard let pid = (q["pid"] as? NSNumber)?.int32Value else { return ["error": "args"] }
  let app = prepare(AXUIElementCreateApplication(pid))
  var queue = elements(attr(app, kAXWindowsAttribute)), head = 0
  while head < queue.count && queue.count < 4000 {
    let e = queue[head]; head += 1
    if role(e) == "AXComboBox", let f = frameOf(e) {
      let kids = elements(attr(e, kAXChildrenAttribute)).map { k -> [String: Any] in
        var d = describe(k); d["actions"] = actionList(k)
        if let kf = frameOf(k) { d["trailingGap"] = r1(Double(f.maxX - kf.maxX)); d["leadingFromComboX"] = r1(Double(kf.minX - f.minX)) }
        return d
      }
      var out: [String: Any] = ["frame": wire(f), "actions": actionList(e), "value": short(str(e, kAXValueAttribute)), "children": kids]
      // `press`: AXPress on the trailing AXButton child (the arrow).
      if (q["press"] as? Bool) == true, let arrow = elements(attr(e, kAXChildrenAttribute)).filter({ role($0) == "AXButton" }).max(by: { (frameOf($0)?.maxX ?? 0) < (frameOf($1)?.maxX ?? 0) }) {
        let t0 = nowMs()
        out["press"] = AXUIElementPerformAction(arrow, kAXPressAction as CFString).rawValue
        out["pressMs"] = r1(nowMs() - t0)
      }
      return out
    }
    queue.append(contentsOf: elements(attr(e, kAXChildrenAttribute)))
  }
  return ["error": "no combo box"]
}

/// {"op":"arrange","wins":[n,...]}: the windows named by number raised through accessibility, back to front (AXRaise on the
/// window of its owner's AXWindows whose frame is the listed one), 150 ms apart, no activation: the qualification's
/// layouts. Answers each raise's AXError (or "missing").
func arrange(_ q: [String: Any]) -> [String: Any] {
  guard let wins = (q["wins"] as? [NSNumber])?.map({ $0.intValue }) else { return ["error": "args"] }
  var out: [Any] = []
  for n in wins {
    let list = (CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]) ?? []
    guard let w = list.first(where: { (($0[kCGWindowNumber as String] as? NSNumber)?.intValue ?? 0) == n }),
          let owner = (w[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value else { out.append("missing"); continue }
    let b = rectOf(w)
    let app = prepare(AXUIElementCreateApplication(owner))
    guard let e = elements(attr(app, kAXWindowsAttribute)).first(where: { frameOf($0).map { near($0, b, 3) } ?? false }) else { out.append("no AX window"); continue }
    out.append(AXUIElementPerformAction(e, kAXRaiseAction as CFString).rawValue)
    usleep(150_000)
  }
  return ["raised": out]
}

/// {"op":"front","n"}: window n brought to the front as a person would bring one window of an app forward: AXMain written
/// on it, AXRaise, then its app activated with no options (NSRunningApplication.activate: only the main and key windows
/// come forward). The qualification's layouts, where an AXRaise of a background app's window stays under the active
/// app's windows (smoke run 44920398171).
func frontWindow(_ q: [String: Any]) -> [String: Any] {
  guard let n = (q["n"] as? NSNumber)?.intValue else { return ["error": "args"] }
  let list = (CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]) ?? []
  guard let w = list.first(where: { (($0[kCGWindowNumber as String] as? NSNumber)?.intValue ?? 0) == n }),
        let owner = (w[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value else { return ["error": "missing"] }
  let b = rectOf(w)
  let app = prepare(AXUIElementCreateApplication(owner))
  guard let e = elements(attr(app, kAXWindowsAttribute)).first(where: { frameOf($0).map { near($0, b, 3) } ?? false }) else { return ["error": "no AX window"] }
  let main = AXUIElementSetAttributeValue(e, kAXMainAttribute as CFString, kCFBooleanTrue).rawValue
  let raise = AXUIElementPerformAction(e, kAXRaiseAction as CFString).rawValue
  let activated = NSRunningApplication(processIdentifier: owner)?.activate(options: []) ?? false
  usleep(350_000)
  return ["main": main, "raise": raise, "activated": activated]
}

while let line = readLine() {
  guard let data = line.data(using: .utf8), let q = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { emit(["error": "bad request"]); continue }
  textWindowFrame = (q["window"] as? [Double]).flatMap { $0.count == 4 ? CGRect(x: $0[0], y: $0[1], width: $0[2], height: $0[3]) : nil }
  switch q["op"] as? String {
  case "signals": emit(signals(q))
  case "focus": emit(focus(q))
  case "textpoint": emit(textpoint(q))
  case "caret": emit(caret(q))
  case "settext": emit(settext(q))
  case "value": emit(value(q))
  case "focusweb": emit(focusweb(q))
  case "popup": emit(popup(q))
  case "open": emit(open(q))
  case "opener": emit(openerNow(q))
  case "forget": opener = nil; emit(["ok": true])
  case "hover": emit(hover(q))
  case "menu": emit(menu(q))
  case "twowin": emit(twowin(q))
  case "raise": emit(raise(q))
  case "menuinfo": emit(menuinfo(q))
  case "post": emit(post(q))
  case "pressitem": emit(pressitem(q))
  case "select": emit(selectPhrase(q))
  case "state": emit(state(q))
  case "watch": emit(watch(q))
  case "order": emit(order(q))
  case "restore": emit(restoreOrder(q))
  case "cancel": emit(cancel(q))
  case "combo": emit(combo(q))
  case "arrange": emit(arrange(q))
  case "front": emit(frontWindow(q))
  default: emit(["error": "unknown op"])
  }
}
