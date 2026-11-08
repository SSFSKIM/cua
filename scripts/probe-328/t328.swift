// #328's trial tool: one scroll, by a posted event or an element route, into a background app's scroll area, read back
// by Accessibility, with the window order, the front app and the key windows watched while it runs.
//   t328 scan <pid>            every window of the app (title, frame, number, main/focused) and every scroll area in it
//                              (DFS order = its index): frame, contents, bars (value, actions, settable, children's
//                              subroles and actions), its own actions, whether it scrolls, a descendant below the fold
//   t328 read <pid> <win> <area>   one reading of a scroll area's position
//   t328 setbar <pid> <win> <area> <fraction>   the vertical bar's AXValue written (a reset)
//   t328 trial <json>          one trial (the spec below); prints one JSON line
// The spec: {pid, cover (pid), win (index or title substring), area (index), route, post: {tap, units, delta, phase,
// continuous, fields, pre, source}, at: content|[x, y] (default the viewport's centre), pidFrom: app (default the area's
// own process), pointer: over|away|none, away: [x, y], direction: down|up|auto, delta (px requested), watchMs,
// settleMs}. Routes: post, barWrite, barIncrement, pagePress, arrowPress, scrollByPage, scrollToVisible, visibleRange,
// makeRectVisible, none (a control: nothing done), external (another process scrolls: `{"ready":true}` once read, then
// the clock starts on a line from stdin).
import AppKit
import ApplicationServices
import Foundation

setvbuf(stdout, nil, _IOLBF, 0)
func emit(_ o: Any) { print(String(data: try! JSONSerialization.data(withJSONObject: o, options: [.sortedKeys]), encoding: .utf8)!) }
func unixMs() -> Double { (Date().timeIntervalSince1970 * 10_000).rounded() / 10 }
func n(_ v: Any?) -> Any { v ?? NSNull() }
func r1(_ v: Double?) -> Any { v.map { ($0 * 10).rounded() / 10 } ?? NSNull() }
func r4(_ v: Double?) -> Any { v.map { ($0 * 10_000).rounded() / 10_000 } ?? NSNull() }

typealias GetWindow = @convention(c) (AXUIElement, UnsafeMutablePointer<CGWindowID>) -> AXError
let getWindow: GetWindow? = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "_AXUIElementGetWindow").map { unsafeBitCast($0, to: GetWindow.self) }
typealias SetWindowLocation = @convention(c) (CGEvent, CGPoint) -> Void
let setWindowLocation: SetWindowLocation? = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "CGEventSetWindowLocation").map { unsafeBitCast($0, to: SetWindowLocation.self) }

// ---- Accessibility ----------------------------------------------------------------------------------------------------
func attr(_ e: AXUIElement, _ n: String) -> CFTypeRef? { var v: CFTypeRef?; return AXUIElementCopyAttributeValue(e, n as CFString, &v) == .success ? v : nil }
func el(_ v: CFTypeRef?) -> AXUIElement? { v.flatMap { CFGetTypeID($0) == AXUIElementGetTypeID() ? ($0 as! AXUIElement) : nil } }
func els(_ v: CFTypeRef?) -> [AXUIElement] { (v as? [AnyObject])?.compactMap { CFGetTypeID($0) == AXUIElementGetTypeID() ? ($0 as! AXUIElement) : nil } ?? [] }
func str(_ e: AXUIElement, _ n: String) -> String? { attr(e, n) as? String }
func role(_ e: AXUIElement) -> String { str(e, kAXRoleAttribute) ?? "?" }
func num(_ e: AXUIElement, _ n: String) -> Double? { (attr(e, n) as? NSNumber)?.doubleValue }
func frameOf(_ e: AXUIElement) -> CGRect? {
  var p = CGPoint.zero, s = CGSize.zero
  guard let pv = attr(e, kAXPositionAttribute), let sv = attr(e, kAXSizeAttribute), CFGetTypeID(pv) == AXValueGetTypeID(), CFGetTypeID(sv) == AXValueGetTypeID(),
        AXValueGetValue(pv as! AXValue, .cgPoint, &p), AXValueGetValue(sv as! AXValue, .cgSize, &s) else { return nil }
  return CGRect(origin: p, size: s)
}
func actions(_ e: AXUIElement) -> [String] { var a: CFArray?; return AXUIElementCopyActionNames(e, &a) == .success ? (a as? [String] ?? []) : [] }
func settable(_ e: AXUIElement, _ n: String) -> Bool { var b: DarwinBoolean = false; return AXUIElementIsAttributeSettable(e, n as CFString, &b) == .success && b.boolValue }
func rangeOf(_ e: AXUIElement, _ n: String) -> CFRange? {
  var r = CFRange()
  guard let v = attr(e, n), CFGetTypeID(v) == AXValueGetTypeID(), AXValueGetValue(v as! AXValue, .cfRange, &r) else { return nil }
  return r
}
func rect(_ r: CGRect?) -> Any { r.map { [($0.minX * 10).rounded() / 10, ($0.minY * 10).rounded() / 10, ($0.width * 10).rounded() / 10, ($0.height * 10).rounded() / 10] } ?? NSNull() }
func windowNumber(_ w: AXUIElement) -> CGWindowID? { var id: CGWindowID = 0; return getWindow?(w, &id) == .success && id != 0 ? id : nil }
func appElement(_ pid: pid_t) -> AXUIElement { let a = AXUIElementCreateApplication(pid); AXUIElementSetMessagingTimeout(a, 2); return a }
func windowsOf(_ pid: pid_t) -> [AXUIElement] { els(attr(appElement(pid), kAXWindowsAttribute)) }

func scrollAreas(_ root: AXUIElement) -> [AXUIElement] {
  var out: [AXUIElement] = []
  var budget = 3000
  func walk(_ e: AXUIElement, _ d: Int) {
    budget -= 1
    guard budget > 0, d < 30 else { return }
    if role(e) == kAXScrollAreaRole { out.append(e) }
    for k in els(attr(e, kAXChildrenAttribute)) { walk(k, d + 1) }
  }
  walk(root, 0)
  if !out.isEmpty { return out }
  // No AXScrollArea (Catalyst's UIKit, smoke run 42524809432): what advertises a page scroll or answers a vertical bar.
  budget = 3000
  func walk2(_ e: AXUIElement, _ d: Int) {
    budget -= 1
    guard budget > 0, d < 30 else { return }
    if e != root, actions(e).contains("AXScrollDownByPage") || el(attr(e, kAXVerticalScrollBarAttribute)) != nil { out.append(e); return }
    for k in els(attr(e, kAXChildrenAttribute)) { walk2(k, d + 1) }
  }
  walk2(root, 0)
  return out
}
/// The window's tree to `depth`, at most `limit` nodes: role, subrole, identifier, frame, actions, child count.
func tree(_ root: AXUIElement, depth: Int = 8, limit: Int = 220) -> [[String: Any]] {
  var out: [[String: Any]] = []
  func walk(_ e: AXUIElement, _ d: Int) {
    guard out.count < limit, d <= depth else { return }
    let kids = els(attr(e, kAXChildrenAttribute))
    out.append(["d": d, "role": role(e), "sub": n(str(e, kAXSubroleAttribute)), "id": n(str(e, "AXIdentifier")), "frame": rect(frameOf(e)),
                "actions": actions(e).filter { !$0.hasPrefix("AXShow") }, "kids": kids.count, "title": n(str(e, kAXTitleAttribute).map { String($0.prefix(40)) })])
    for k in kids { walk(k, d + 1) }
  }
  walk(root, 0)
  return out
}
/// The on-screen windows under `point`, front to back (WindowServer's view of who gets a wheel there): owner, pid,
/// number, layer, bounds.
func windowsAt(_ point: CGPoint) -> [[String: Any]] {
  let list = (CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]) ?? []
  return list.compactMap { w -> [String: Any]? in
    guard let b = w[kCGWindowBounds as String] as? [String: Any], let r = CGRect(dictionaryRepresentation: b as CFDictionary), r.contains(point) else { return nil }
    return ["owner": w[kCGWindowOwnerName as String] ?? "?", "pid": w[kCGWindowOwnerPID as String] ?? 0, "number": w[kCGWindowNumber as String] ?? 0,
            "layer": w[kCGWindowLayer as String] ?? 0, "bounds": rect(r), "alpha": w[kCGWindowAlpha as String] ?? 1]
  }.prefix(4).map { $0 }
}
func findWindow(_ pid: pid_t, _ spec: Any?) -> AXUIElement? {
  let ws = windowsOf(pid)
  if let i = spec as? Int { return i < ws.count ? ws[i] : nil }
  if let t = spec as? String { return ws.first { (str($0, kAXTitleAttribute) ?? "").contains(t) } }
  return ws.first
}
/// The content a scroll area moves: its AXContents' first element, else its first child that is not a scroll bar.
func contentOf(_ area: AXUIElement) -> AXUIElement? {
  if let c = els(attr(area, kAXContentsAttribute)).first { return c }
  return els(attr(area, kAXChildrenAttribute)).first { role($0) != kAXScrollBarRole }
}
func bar(_ area: AXUIElement) -> AXUIElement? { el(attr(area, kAXVerticalScrollBarAttribute)) }
/// A descendant of the area whose frame lies wholly below the viewport: the first (DFS) that advertises AXScrollToVisible,
/// else the first whose AXScrollToVisible attribute is settable (a cell's, F §16.8), else the first of the plain roles.
func belowFold(_ area: AXUIElement, viewport: CGRect, min: CGFloat) -> AXUIElement? {
  var budget = 2500
  var byAction: AXUIElement?, byAttribute: AXUIElement?, plain: AXUIElement?
  func walk(_ e: AXUIElement, _ d: Int) {
    budget -= 1
    guard budget > 0, d < 14, byAction == nil else { return }
    let r = role(e)
    if r == kAXScrollBarRole { return }
    if r != kAXScrollBarRole, e != area, let f = frameOf(e), f.minY > viewport.maxY + min, f.height > 0, f.height < viewport.height {
      if actions(e).contains("AXScrollToVisible") { byAction = e; return }
      if byAttribute == nil, settable(e, "AXScrollToVisible") { byAttribute = e }
      if plain == nil, ["AXRow", "AXCell", "AXStaticText", "AXButton", "AXTextField", "AXGroup", "AXImage"].contains(r) { plain = e }
    }
    for k in els(attr(e, kAXChildrenAttribute)) { walk(k, d + 1) }
  }
  walk(area, 0)
  return byAction ?? byAttribute ?? plain
}
/// A descendant inside the viewport, near its top, tracked across the trial (its frame's y).
func tracked(_ area: AXUIElement, viewport: CGRect) -> AXUIElement? {
  var budget = 800
  var best: (AXUIElement, CGFloat)?
  func walk(_ e: AXUIElement, _ d: Int) {
    budget -= 1
    guard budget > 0, d < 10 else { return }
    let r = role(e)
    if r == kAXScrollBarRole { return }
    if r != kAXScrollBarRole, e != area, let f = frameOf(e), f.height > 2, f.height < viewport.height * 0.6, f.minY >= viewport.minY, f.minY < viewport.midY {
      if best == nil || f.minY < best!.1 { best = (e, f.minY) }
    }
    for k in els(attr(e, kAXChildrenAttribute)) { walk(k, d + 1) }
  }
  walk(area, 0)
  return best?.0
}

struct Pos {
  var bar: Double?
  var offset: Double?      // the area's top less the content's top: grows as the view scrolls down
  var contentH: Double?
  var viewH: Double?
  var trackedY: Double?
  var vis: CFRange?
  func wire() -> [String: Any] {
    var w: [String: Any] = ["bar": r4(bar), "offset": r1(offset), "contentH": r1(contentH), "viewH": r1(viewH), "trackedY": r1(trackedY)]
    if let v = vis { w["vis"] = [v.location, v.length] }
    return w
  }
}
func read(_ area: AXUIElement, trackedEl: AXUIElement?) -> Pos {
  var p = Pos()
  let af = frameOf(area)
  p.viewH = af.map { Double($0.height) }
  if let b = bar(area) { p.bar = num(b, kAXValueAttribute) }
  if let c = contentOf(area), let cf = frameOf(c), let af {
    p.offset = Double(af.minY - cf.minY); p.contentH = Double(cf.height)
    var size = CGSize.zero
    if cf.height <= af.height + 1, let v = attr(area, "AXContentSize"), CFGetTypeID(v) == AXValueGetTypeID(), AXValueGetValue(v as! AXValue, .cgSize, &size), size.height > af.height {
      p.contentH = Double(size.height)
    }
    if role(c) == kAXTextAreaRole { p.vis = rangeOf(c, "AXVisibleCharacterRange") }
  }
  if let t = trackedEl, let f = frameOf(t) { p.trackedY = Double(f.minY) }
  return p
}
/// The view's move in points between two readings (positive = the content moved up, a scroll down) by each measure:
/// the content's offset, the tracked element, the bar times the scrollable length; `px` is the first that moved (a web
/// area's frame stays put while its page scrolls), else the first that reads.
func measures(_ a: Pos, _ b: Pos) -> [(String, Double)] {
  var m: [(String, Double)] = []
  if let x = a.offset, let y = b.offset { m.append(("offset", y - x)) }
  if let x = a.trackedY, let y = b.trackedY { m.append(("tracked", x - y)) }
  if let x = a.bar, let y = b.bar, let c = a.contentH, let v = a.viewH, c > v { m.append(("bar", (y - x) * (c - v))) }
  return m
}
func moved(_ a: Pos, _ b: Pos) -> (px: Double?, by: String) {
  let m = measures(a, b)
  if let hit = m.first(where: { abs($0.1) > 0.4 }) { return (hit.1, hit.0) }
  if let first = m.first { return (first.1, first.0) }
  if let x = a.bar, let y = b.bar, x != y { return (nil, "bar only") }
  return (nil, "none")
}

// ---- the watch: window order, front app, key windows -------------------------------------------------------------------
final class Watch: @unchecked Sendable {
  let target: pid_t, cover: pid_t, ms: Double, interval: Double
  var changes: [[String: Any]] = []
  var samples = 0
  var aboveEver = false
  var frontOther: Set<Int32> = []
  let done = DispatchSemaphore(value: 0)
  init(target: pid_t, cover: pid_t, ms: Double, interval: Double = 5) { self.target = target; self.cover = cover; self.ms = ms; self.interval = interval }
  func start(from t0: Double) {
    Thread.detachNewThread { [self] in
      var last = ""
      let sys = AXUIElementCreateSystemWide()
      AXUIElementSetMessagingTimeout(sys, 0.5)
      while unixMs() - t0 < ms {
        let list = (CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]) ?? []
        let l0 = list.filter { ($0[kCGWindowLayer as String] as? Int) == 0 }
        let ti = l0.firstIndex { ($0[kCGWindowOwnerPID as String] as? Int32) == target }
        let ci = l0.firstIndex { ($0[kCGWindowOwnerPID as String] as? Int32) == cover }
        let above = ti != nil && ci != nil && ti! < ci!
        if above { aboveEver = true }
        var frontPid: Int32 = -1
        if samples % 10 == 0, let f = el(attr(sys, kAXFocusedApplicationAttribute)) { AXUIElementGetPid(f, &frontPid); if frontPid != cover { frontOther.insert(frontPid) } }
        let key = "\(above) \(l0.prefix(4).map { "\($0[kCGWindowOwnerPID as String] ?? 0):\($0[kCGWindowNumber as String] ?? 0)" }.joined(separator: ","))"
        if key != last { changes.append(["atMs": r1(unixMs() - t0), "above": above, "top": l0.first?[kCGWindowOwnerName as String] ?? NSNull()]); last = key }
        samples += 1
        Thread.sleep(forTimeInterval: interval / 1000)
      }
      done.signal()
    }
  }
}
func keys(_ target: pid_t, _ cover: pid_t) -> [String: Any] {
  let t = appElement(target), c = appElement(cover)
  func title(_ a: AXUIElement, _ n: String) -> Any { el(attr(a, n)).flatMap { str($0, kAXTitleAttribute) } ?? NSNull() }
  return ["targetFocused": title(t, kAXFocusedWindowAttribute), "targetMain": title(t, kAXMainWindowAttribute), "targetFrontmost": (attr(t, "AXFrontmost") as? Bool) ?? NSNull(),
          "coverFocused": title(c, kAXFocusedWindowAttribute), "coverFrontmost": (attr(c, "AXFrontmost") as? Bool) ?? NSNull()]
}

// ---- the posted event ---------------------------------------------------------------------------------------------------
func scrollEvents(_ p: [String: Any], point: CGPoint, window: CGWindowID?, windowFrame: CGRect?, down: Bool) -> [CGEvent] {
  let units: CGScrollEventUnit = (p["units"] as? String) == "line" ? .line : .pixel
  let amount = Int32((p["delta"] as? Double) ?? (units == .line ? 3 : 120))
  let sign: Int32 = down ? -1 : 1
  let phase = p["phase"] as? String ?? "none"
  let fields = p["fields"] as? String ?? "vendor"
  let source: CGEventSource? = (p["source"] as? String) == "nil" ? nil : CGEventSource(stateID: (p["source"] as? String) == "combined" ? .combinedSessionState : .hidSystemState)
  func one(_ d: Int32, scrollPhase: Int64?, momentum: Int64? = nil) -> CGEvent? {
    guard let e = CGEvent(scrollWheelEvent2Source: source, units: units, wheelCount: 1, wheel1: d, wheel2: 0, wheel3: 0) else { return nil }
    e.location = point
    if let c = p["continuous"] as? Int { e.setIntegerValueField(.scrollWheelEventIsContinuous, value: Int64(c)) }
    if let s = scrollPhase { e.setIntegerValueField(.scrollWheelEventScrollPhase, value: s) }
    if let m = momentum { e.setIntegerValueField(.scrollWheelEventMomentumPhase, value: m) }
    if let id = window {
      if fields == "vendor" || fields == "51" || fields == "vendor-noloc" { e.setIntegerValueField(CGEventField(rawValue: 51)!, value: Int64(id)) }
      if fields == "vendor" || fields == "9192" || fields == "vendor-noloc" {
        e.setIntegerValueField(CGEventField(rawValue: 91)!, value: Int64(id)); e.setIntegerValueField(CGEventField(rawValue: 92)!, value: Int64(id))
      }
      if (fields == "vendor" || fields == "loc"), let f = windowFrame { setWindowLocation?(e, CGPoint(x: point.x - f.minX, y: point.y - f.minY)) }
    }
    return e
  }
  switch phase {
  case "gesture":
    // A trackpad's: began, changed ×3 carrying the delta in quarters, ended with none.
    let q = sign * amount / 4
    return [one(q, scrollPhase: 1), one(q, scrollPhase: 2), one(q, scrollPhase: 2), one(sign * amount - 3 * q, scrollPhase: 2), one(0, scrollPhase: 4)].compactMap { $0 }
  case "momentum":
    return [one(sign * amount / 2, scrollPhase: 1), one(0, scrollPhase: 4), one(sign * amount - sign * amount / 2, scrollPhase: 0, momentum: 1), one(0, scrollPhase: 0, momentum: 3)].compactMap { $0 }
  default:
    return [one(sign * amount, scrollPhase: nil)].compactMap { $0 }
  }
}
func post(_ events: [CGEvent], tap: String, pid: pid_t, gapMs: Double) {
  for (i, e) in events.enumerated() {
    e.timestamp = DispatchTime.now().uptimeNanoseconds
    switch tap {
    case "session": e.post(tap: .cgSessionEventTap)
    case "hid": e.post(tap: .cghidEventTap)
    case "annotated": e.post(tap: .cgAnnotatedSessionEventTap)
    default: e.postToPid(pid)
    }
    if i < events.count - 1 && gapMs > 0 { Thread.sleep(forTimeInterval: gapMs / 1000) }
  }
}
func moveEvent(_ point: CGPoint, window: CGWindowID?, frame: CGRect?) -> CGEvent? {
  guard let e = CGEvent(mouseEventSource: CGEventSource(stateID: .hidSystemState), mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left) else { return nil }
  if let id = window {
    e.setIntegerValueField(CGEventField(rawValue: 91)!, value: Int64(id)); e.setIntegerValueField(CGEventField(rawValue: 92)!, value: Int64(id))
    if let f = frame { setWindowLocation?(e, CGPoint(x: point.x - f.minX, y: point.y - f.minY)) }
  }
  return e
}

// ---- the commands ---------------------------------------------------------------------------------------------------------
let a = CommandLine.arguments
guard a.count >= 3 else { emit(["usage": true]); exit(2) }
switch a[1] {
case "scan":
  let pid = pid_t(a[2])!
  let app = appElement(pid)
  var ws: [[String: Any]] = []
  let focused = el(attr(app, kAXFocusedWindowAttribute)), main = el(attr(app, kAXMainWindowAttribute))
  for (wi, w) in windowsOf(pid).enumerated() {
    var areas: [[String: Any]] = []
    for (i, s) in scrollAreas(w).enumerated() {
      let f = frameOf(s)
      var e: [String: Any] = ["index": i, "frame": rect(f), "actions": actions(s), "id": str(s, "AXIdentifier") ?? NSNull(),
                              "attributes": { var n: CFArray?; return AXUIElementCopyAttributeNames(s, &n) == .success ? (n as? [String] ?? []) : [] }()]
      if let c = contentOf(s) {
        e["content"] = ["role": role(c), "frame": rect(frameOf(c)), "actions": actions(c), "visibleRangeSettable": settable(c, "AXVisibleCharacterRange"),
                        "id": str(c, "AXIdentifier") ?? NSNull(), "desc": str(c, kAXDescriptionAttribute) ?? NSNull()]
      }
      if let b = bar(s) {
        e["bar"] = ["value": n(num(b, kAXValueAttribute)), "settable": settable(b, kAXValueAttribute), "actions": actions(b),
                    "enabled": (attr(b, kAXEnabledAttribute) as? Bool) ?? NSNull(),
                    "children": els(attr(b, kAXChildrenAttribute)).map { ["role": role($0), "subrole": n(str($0, kAXSubroleAttribute)), "actions": actions($0)] as [String: Any] }]
      }
      e["scrollable"] = { if let c = contentOf(s).flatMap(frameOf), let f { return c.height > f.height + 4 } else { return NSNull() } }() as Any
      if let f { e["windowsAt"] = windowsAt(CGPoint(x: f.midX, y: f.midY)) }
      var areaPid: pid_t = 0
      AXUIElementGetPid(s, &areaPid)
      e["pid"] = Int(areaPid)
      e["role"] = role(s)
      if let f, let t = belowFold(s, viewport: f, min: 10) { e["belowFold"] = ["role": role(t), "frame": rect(frameOf(t)), "actions": actions(t), "settableSTV": settable(t, "AXScrollToVisible")] }
      areas.append(e)
    }
    var entry: [String: Any] = ["index": wi, "title": n(str(w, kAXTitleAttribute)), "frame": rect(frameOf(w)), "number": n(windowNumber(w).map { Int($0) }),
               "focused": focused.map { CFEqual($0, w) } ?? false, "main": main.map { CFEqual($0, w) } ?? false, "areas": areas]
    if !areas.contains(where: { ($0["scrollable"] as? Bool) == true }) { entry["tree"] = tree(w) }
    ws.append(entry)
  }
  emit(["pid": Int(pid), "windows": ws, "setWindowLocation": setWindowLocation != nil, "getWindow": getWindow != nil])
case "read", "setbar":
  let pid = pid_t(a[2])!
  guard let w = findWindow(pid, Int(a[3]) ?? (a[3] as Any)), let area = scrollAreas(w).dropFirst(Int(a[4]) ?? 0).first else { emit(["error": "no area"]); exit(1) }
  if a[1] == "setbar", let v = Double(a[5]), let b = bar(area) {
    let rc = AXUIElementSetAttributeValue(b, kAXValueAttribute as CFString, v as CFNumber).rawValue
    Thread.sleep(forTimeInterval: 0.15)
    emit(["rc": Int(rc), "pos": read(area, trackedEl: nil).wire()])
  } else { emit(["pos": read(area, trackedEl: nil).wire()]) }
case "trial":
  guard let spec = try? JSONSerialization.jsonObject(with: Data(a[2].utf8)) as? [String: Any], let pidN = spec["pid"] as? Int else { emit(["error": "bad spec"]); exit(2) }
  let pid = pid_t(pidN), cover = pid_t(spec["cover"] as? Int ?? 0)
  var out: [String: Any] = ["spec": spec]
  guard let w = findWindow(pid, spec["win"]) else { emit(["error": "no window", "spec": spec]); exit(1) }
  let areas = scrollAreas(w)
  let ai = spec["area"] as? Int ?? 0
  guard ai < areas.count, let viewport = frameOf(areas[ai]) else { emit(["error": "no area \(ai) of \(areas.count)", "spec": spec]); exit(1) }
  let area = areas[ai]
  let wid = windowNumber(w), wf = frameOf(w)
  // The point: the viewport's centre, the content's centre (#324's kit aimed there: below a long text's window), or given.
  let contentFrame = contentOf(area).flatMap(frameOf)
  let point = (spec["at"] as? [Double]).map { CGPoint(x: $0[0], y: $0[1]) }
    ?? ((spec["at"] as? String) == "content" ? contentFrame.map { CGPoint(x: $0.midX, y: $0.midY) } : nil)
    ?? CGPoint(x: viewport.midX, y: viewport.midY)
  out["pointInWindow"] = wf.map { $0.contains(point) } ?? false
  // The process the events go to: the area's own (an out-of-process view's, as the engine's hit-test owner), or the app's.
  var areaPid: pid_t = 0
  AXUIElementGetPid(area, &areaPid)
  let under = windowsAt(point)
  out["windowsAt"] = under
  let cgTop = under.first { ($0["layer"] as? Int ?? 0) >= 0 && ($0["alpha"] as? Double ?? 1) > 0 }
  let postPid: pid_t
  switch spec["pidFrom"] as? String {
  case "app": postPid = pid
  case "cg": postPid = (cgTop?["pid"] as? Int).map { pid_t($0) } ?? pid
  default: postPid = areaPid == 0 ? pid : areaPid
  }
  out["areaPid"] = Int(areaPid); out["postPid"] = Int(postPid)
  out["window"] = ["title": n(str(w, kAXTitleAttribute)), "number": n(wid.map { Int($0) }), "frame": rect(wf)] as [String: Any]
  out["viewport"] = rect(viewport); out["point"] = [point.x, point.y]
  let track = tracked(area, viewport: viewport)
  let before = read(area, trackedEl: track)
  let route = spec["route"] as? String ?? "post"
  let requested = spec["delta"] as? Double ?? 120
  var down = true
  switch spec["direction"] as? String ?? "auto" {
  case "up": down = false
  case "down": down = true
  default: down = (before.bar ?? 0) < 0.6
  }
  out["down"] = down
  out["before"] = before.wire()
  out["keysBefore"] = keys(pid, cover)
  // The pointer: over the point, away (over the cover), or left where it is.
  let saved = CGEvent(source: nil)?.location ?? .zero
  let away = (spec["away"] as? [Double]).map { CGPoint(x: $0[0], y: $0[1]) } ?? CGPoint(x: 190, y: 200)
  switch spec["pointer"] as? String ?? "none" {
  case "over": CGWarpMouseCursorPosition(point); Thread.sleep(forTimeInterval: 0.08)
  case "away": CGWarpMouseCursorPosition(away); Thread.sleep(forTimeInterval: 0.08)
  default: break
  }
  out["pointerAt"] = { let l = CGEvent(source: nil)?.location ?? .zero; return [l.x, l.y] }()
  let watchMs = spec["watchMs"] as? Double ?? 1200, settleMs = spec["settleMs"] as? Double ?? 900
  var detail: [String: Any] = [:]
  // Anything prepared before the clock starts: the events, the route's element.
  let p = spec["post"] as? [String: Any] ?? [:]
  // pidFrom cg: the window the events name is the topmost one under the point (its owner's), as WindowServer would route.
  var stampId = wid, stampFrame = wf
  if (spec["pidFrom"] as? String) == "cg", let top = cgTop, let num = top["number"] as? Int, let b = top["bounds"] as? [Double] {
    stampId = CGWindowID(num); stampFrame = CGRect(x: b[0], y: b[1], width: b[2], height: b[3])
  }
  let events = route == "post" ? scrollEvents(p, point: point, window: stampId, windowFrame: stampFrame, down: down) : []
  if route == "external" { emit(["ready": true]); _ = readLine() }
  let t0 = unixMs()
  let watch = Watch(target: pid, cover: cover, ms: watchMs)
  watch.start(from: t0)
  var rc: Int32? = nil
  switch route {
  case "post":
    if (p["pre"] as? String) == "moved", let m = moveEvent(point, window: wid, frame: wf) {
      m.timestamp = DispatchTime.now().uptimeNanoseconds
      if (p["tap"] as? String ?? "pid") == "pid" { m.postToPid(postPid) } else { m.post(tap: .cgSessionEventTap) }
      Thread.sleep(forTimeInterval: 0.02)
    }
    post(events, tap: p["tap"] as? String ?? "pid", pid: postPid, gapMs: p["gapMs"] as? Double ?? 8)
    detail["events"] = events.count
    detail["continuous"] = events.first.map { Int($0.getIntegerValueField(.scrollWheelEventIsContinuous)) } ?? NSNull()
  case "barWrite":
    if let b = bar(area), let v = before.bar {
      // The step that moves `requested` points when the content's height reads; else 0.15 of the range.
      let step = before.contentH.flatMap { c in before.viewH.map { vh in c > vh ? requested / (c - vh) : 0.15 } } ?? 0.15
      detail["step"] = r4(step)
      let target = min(max(v + (down ? 1 : -1) * step, 0), 1)
      detail["wrote"] = r4(target)
      rc = AXUIElementSetAttributeValue(b, kAXValueAttribute as CFString, target as CFNumber).rawValue
    } else { detail["missing"] = "bar, value or content" }
  case "barIncrement":
    if let b = bar(area) { detail["actions"] = actions(b); rc = AXUIElementPerformAction(b, (down ? kAXIncrementAction : kAXDecrementAction) as CFString).rawValue } else { detail["missing"] = "bar" }
  case "pagePress", "arrowPress":
    let sub = route == "pagePress" ? (down ? kAXIncrementPageSubrole : kAXDecrementPageSubrole) : (down ? kAXIncrementArrowSubrole : kAXDecrementArrowSubrole)
    if let b = bar(area), let k = els(attr(b, kAXChildrenAttribute)).first(where: { str($0, kAXSubroleAttribute) == sub }) {
      rc = AXUIElementPerformAction(k, kAXPressAction as CFString).rawValue
    } else { detail["missing"] = "the bar's \(sub) child" }
  case "scrollByPage":
    let action = down ? "AXScrollDownByPage" : "AXScrollUpByPage"
    let holder = [area, contentOf(area)].compactMap { $0 }.first { actions($0).contains(action) }
    detail["advertisedOn"] = holder.map { role($0) } ?? NSNull()
    rc = AXUIElementPerformAction(holder ?? area, action as CFString).rawValue
  case "scrollToVisible":
    if let t = belowFold(area, viewport: viewport, min: CGFloat(requested) - 30) ?? belowFold(area, viewport: viewport, min: 10) {
      let tf = frameOf(t)
      detail["target"] = ["role": role(t), "frame": rect(tf), "actions": actions(t)]
      if actions(t).contains("AXScrollToVisible") { rc = AXUIElementPerformAction(t, "AXScrollToVisible" as CFString).rawValue; detail["by"] = "action" }
      else if settable(t, "AXScrollToVisible") { rc = AXUIElementSetAttributeValue(t, "AXScrollToVisible" as CFString, kCFBooleanTrue).rawValue; detail["by"] = "attribute" }
      else { rc = AXUIElementPerformAction(t, "AXScrollToVisible" as CFString).rawValue; detail["by"] = "unadvertised action" }
      detail["targetAfter"] = rect(frameOf(t))
      detail["targetShows"] = frameOf(t).map { viewport.contains(CGPoint(x: $0.midX, y: $0.midY)) } ?? NSNull()
    } else { detail["missing"] = "a descendant below the fold" }
  case "visibleRange":
    if let c = contentOf(area), let v = rangeOf(c, "AXVisibleCharacterRange") {
      detail["settable"] = settable(c, "AXVisibleCharacterRange")
      var r = CFRange(location: v.location + v.length + 200, length: 40)
      rc = AXUIElementSetAttributeValue(c, "AXVisibleCharacterRange" as CFString, AXValueCreate(.cfRange, &r)!).rawValue
    } else { detail["missing"] = "a text area's visible range" }
  case "makeRectVisible":
    var r = CGRect(x: viewport.minX + 4, y: viewport.maxY + CGFloat(requested) - 24, width: 40, height: 20)
    detail["settable"] = settable(area, "AXMakeScreenRectVisible")
    rc = AXUIElementSetAttributeValue(area, "AXMakeScreenRectVisible" as CFString, AXValueCreate(.cgRect, &r)!).rawValue
  default: break
  }
  let t1 = unixMs()
  out["costMs"] = r1(t1 - t0)
  if let rc { detail["rc"] = Int(rc) }
  out["detail"] = detail
  // The read-back every 10 ms until settleMs: the first move and the last change.
  var last = before, firstMove: Double? = nil, lastChange: Double? = nil
  var polls = 0
  while unixMs() - t0 < settleMs {
    Thread.sleep(forTimeInterval: 0.01)
    let now = read(area, trackedEl: track)
    polls += 1
    let m = moved(last, now)
    if let px = m.px, abs(px) > 0.4 || (now.bar != nil && last.bar != nil && abs(now.bar! - last.bar!) > 0.0005) {
      if firstMove == nil { firstMove = unixMs() - t0 }
      lastChange = unixMs() - t0
    }
    last = now
  }
  let after = read(area, trackedEl: track)
  let m = moved(before, after)
  out["after"] = after.wire()
  out["movedPx"] = r1(m.px); out["movedBy"] = m.by
  out["measures"] = Dictionary(measures(before, after).map { ($0.0, r1($0.1)) }, uniquingKeysWith: { x, _ in x })
  out["barDelta"] = r4(after.bar.flatMap { x in before.bar.map { x - $0 } })
  out["firstMoveMs"] = r1(firstMove); out["settledMs"] = r1(lastChange); out["polls"] = polls
  watch.done.wait()
  out["keysAfter"] = keys(pid, cover)
  out["raised"] = watch.aboveEver
  out["frontOther"] = watch.frontOther.map { Int($0) }
  out["order"] = Array(watch.changes.prefix(12))
  out["samples"] = watch.samples
  // The pointer goes back where the spec asked it away to (or where it was).
  if (spec["pointer"] as? String ?? "none") != "none" { CGWarpMouseCursorPosition(spec["away"] != nil ? away : saved) }
  emit(out)
default:
  emit(["usage": true]); exit(2)
}
