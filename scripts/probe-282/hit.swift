// #282 probe diagnostics, one JSON line each.
//   hit <pid> <x> <y>   what AX answers at a screen point asked of the process's first window and of its application, each
//                       hit's role chain up to its window (the walk the engine's pointerView makes), and the application
//                       hit's action names as AXUIElementCopyActionNames reads them now (the engine's webAreaPress reads)
//   hit geom <pid>      the first window's frame and AXActivationPoint read before one fresh activation (subtype 1, posted
//                       to the process as the engine posts it), after it, and after its deactivation (subtype 2)
import AppKit
import ApplicationServices
import Foundation

func attr(_ e: AXUIElement, _ name: String) -> CFTypeRef? { var v: CFTypeRef?; return AXUIElementCopyAttributeValue(e, name as CFString, &v) == .success ? v : nil }
func emit(_ object: [String: Any]) { print(String(data: try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]), encoding: .utf8)!) }
let args = CommandLine.arguments

func chain(_ start: AXUIElement?) -> [String] {
  var out: [String] = [], cur = start, n = 0
  while let e = cur, n < 300 {
    let role = attr(e, kAXRoleAttribute) as? String ?? "?"
    out.append(role)
    if ["AXWindow", "AXSheet", "AXApplication"].contains(role) { break }
    cur = attr(e, kAXParentAttribute).map { $0 as! AXUIElement }
    n += 1
  }
  return out
}

func value<T>(_ ref: CFTypeRef?, _ type: AXValueType, _ empty: T) -> T? {
  guard let ref, CFGetTypeID(ref) == AXValueGetTypeID() else { return nil }
  var out = empty
  return AXValueGetValue(ref as! AXValue, type, &out) ? out : nil
}

func geometry(_ w: AXUIElement) -> [String: Any] {
  let p = value(attr(w, kAXPositionAttribute), .cgPoint, CGPoint.zero), s = value(attr(w, kAXSizeAttribute), .cgSize, CGSize.zero)
  let a = value(attr(w, "AXActivationPoint"), .cgPoint, CGPoint.zero)
  return ["frame": p.flatMap { p in s.map { ["x": p.x, "y": p.y, "width": $0.width, "height": $0.height] } } ?? NSNull(),
          "activationPoint": a.map { ["x": $0.x, "y": $0.y] } ?? NSNull(),
          "frontmost": NSWorkspace.shared.frontmostApplication?.bundleIdentifier ?? NSNull()]
}

func actionNames(_ e: AXUIElement) -> Any {
  var names: CFArray?
  let error = AXUIElementCopyActionNames(e, &names)
  return error == .success ? (names as? [String] ?? []) : "error \(error.rawValue)"
}
func hasPress(_ actions: Any) -> Bool { (actions as? [String])?.contains("AXPress") == true }

// What `actions` held over a timeline: when AXPress first appeared, and every later change (appeared or disappeared).
func pressSummary(_ ticks: [(Int, Any)]) -> [String: Any] {
  var first: Int?, changes: [[String: Any]] = [], last: Bool?
  for (t, actions) in ticks {
    let now = hasPress(actions)
    if now, first == nil { first = t }
    if let last, last != now { changes.append(["t": t, "axPress": now]) }
    last = now
  }
  return ["firstAXPressMs": first ?? NSNull(), "changes": changes, "disappeared": changes.contains { $0["axPress"] as? Bool == false }]
}

if args.count == 7, args[1] == "button-timeline", let pid = pid_t(args[2]), let x = Float(args[3]), let y = Float(args[4]),
   let total = Int(args[5]), let interval = Int(args[6]) {
  //   hit button-timeline <pid> <x> <y> <ms> <intervalMs>   at the point: the hit asked of the application (the fixed
  //   engine's hit-test), its chain up to AXWebArea with each level's role and action names; the page's Apply button found
  //   in the tree (AXButton titled Apply); then every interval for ms, with no activation, the action names of that tree
  //   button, of the first hit (both held from the start), and of a fresh hit-test at the point.
  let app = AXUIElementCreateApplication(pid)
  func hitAt() -> AXUIElement? { var h: AXUIElement?; return AXUIElementCopyElementAtPosition(app, x, y, &h) == .success ? h : nil }
  let start = DispatchTime.now().uptimeNanoseconds
  let ms = { Int((DispatchTime.now().uptimeNanoseconds - start) / 1_000_000) }
  let hit = hitAt()
  var levels: [[String: Any]] = [], cur = hit
  while let e = cur, levels.count < 300 {
    let role = attr(e, kAXRoleAttribute) as? String ?? "?"
    levels.append(["role": role, "title": attr(e, kAXTitleAttribute) as? String ?? NSNull(), "actions": actionNames(e)])
    if role == "AXWebArea" || ["AXWindow", "AXSheet", "AXApplication"].contains(role) { break }
    cur = attr(e, kAXParentAttribute).map { $0 as! AXUIElement }
  }
  // The tree's Apply button: breadth first from the first window, at most 5000 elements.
  var button: AXUIElement?, queue = (attr(app, kAXWindowsAttribute) as? [AXUIElement])?.prefix(1).map { $0 } ?? [], seen = 0
  while !queue.isEmpty, button == nil, seen < 5000 {
    let e = queue.removeFirst(); seen += 1
    if attr(e, kAXRoleAttribute) as? String == "AXButton", attr(e, kAXTitleAttribute) as? String == "Apply" { button = e; break }
    queue += (attr(e, kAXChildrenAttribute) as? [AXUIElement]) ?? []
  }
  let hitIsButton = hit.flatMap { h in button.map { CFEqual(h, $0) } } ?? false
  var buttonTicks: [(Int, Any)] = [], hitTicks: [(Int, Any)] = [], freshTicks: [(Int, Any)] = [], timeline: [[String: Any]] = []
  var tick = 0
  while tick * interval <= total {
    let due = UInt64(tick * interval) * 1_000_000
    let elapsed = DispatchTime.now().uptimeNanoseconds - start
    if elapsed < due { usleep(UInt32((due - elapsed) / 1000)) }
    let t = ms()
    let b: Any = button.map(actionNames) ?? NSNull(), h: Any = hit.map(actionNames) ?? NSNull()
    let fresh = hitAt()
    let f: Any = fresh.map(actionNames) ?? NSNull()
    buttonTicks.append((t, b)); hitTicks.append((t, h)); freshTicks.append((t, f))
    timeline.append(["t": t, "button": hasPress(b), "hit": hasPress(h), "freshHit": hasPress(f),
                     "freshIsButton": fresh.flatMap { fh in button.map { CFEqual(fh, $0) } } ?? false,
                     "freshRole": fresh.flatMap { attr($0, kAXRoleAttribute) as? String } ?? NSNull()])
    tick += 1
  }
  emit(["trusted": AXIsProcessTrusted(), "hitChain": levels, "buttonFound": button != nil, "searched": seen, "hitIsButton": hitIsButton,
        "button": pressSummary(buttonTicks), "hit": pressSummary(hitTicks), "freshHit": pressSummary(freshTicks),
        "firstActions": ["button": buttonTicks.first?.1 ?? NSNull(), "hit": hitTicks.first?.1 ?? NSNull()],
        "lastActions": ["button": buttonTicks.last?.1 ?? NSNull(), "hit": hitTicks.last?.1 ?? NSNull()], "timeline": timeline])
  exit(0)
}

if args.count == 3, args[1] == "geom", let pid = pid_t(args[2]) {
  let app = AXUIElementCreateApplication(pid)
  guard let w = (attr(app, kAXWindowsAttribute) as? [AXUIElement])?.first else { emit(["error": "noWindow"]); exit(1) }
  let before = geometry(w)
  // The window number: the process's on-screen layer-0 window whose bounds are the AX frame (the engine's windowNumber).
  let list = (CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]]) ?? []
  let mine = list.filter { ($0[kCGWindowOwnerPID as String] as? Int) == Int(pid) && ($0[kCGWindowLayer as String] as? Int) == 0 }
  let frame = before["frame"] as? [String: CGFloat]
  let match = mine.first { w in
    guard let b = w[kCGWindowBounds as String] as? [String: CGFloat], let frame else { return false }
    return b["X"] == frame["x"] && b["Y"] == frame["y"] && b["Width"] == frame["width"] && b["Height"] == frame["height"]
  } ?? mine.first
  let number = match?[kCGWindowNumber as String] as? Int ?? 0
  func post(_ subtype: Int16) -> Bool {
    guard let event = NSEvent.otherEvent(with: .appKitDefined, location: .zero, modifierFlags: NSEvent.ModifierFlags(rawValue: 0xC0000),
                                         timestamp: 0, windowNumber: number, context: nil, subtype: subtype, data1: 0, data2: 0)?.cgEvent else { return false }
    event.timestamp = DispatchTime.now().uptimeNanoseconds
    event.postToPid(pid)
    return true
  }
  let posted1 = post(NSEvent.EventSubtype.applicationActivated.rawValue)
  usleep(150_000)
  let afterActivation = geometry(w)
  let posted2 = post(NSEvent.EventSubtype.applicationDeactivated.rawValue)
  usleep(150_000)
  let afterDeactivation = geometry(w)
  emit(["trusted": AXIsProcessTrusted(), "windowNumber": number, "postedActivation": posted1, "postedDeactivation": posted2,
        "before": before, "afterActivation": afterActivation, "afterDeactivation": afterDeactivation])
  exit(0)
}

guard args.count == 4, let pid = pid_t(args[1]), let x = Float(args[2]), let y = Float(args[3]) else { emit(["usage": true]); exit(2) }
func hit(_ e: AXUIElement) -> (String, [String], Any) {
  var h: AXUIElement?
  let err = AXUIElementCopyElementAtPosition(e, x, y, &h)
  var names: CFArray?
  let actions: Any = h.map { AXUIElementCopyActionNames($0, &names) == .success ? (names as? [String] ?? []) : "unreadable" as Any } ?? NSNull()
  return ("\(err.rawValue)", chain(h), actions)
}
let app = AXUIElementCreateApplication(pid)
let windows = (attr(app, kAXWindowsAttribute) as? [AXUIElement]) ?? []
let (we, wc, _) = windows.first.map(hit) ?? ("noWindow", [], NSNull())
let (ae, ac, aa) = hit(app)
emit(["trusted": AXIsProcessTrusted(), "windows": windows.count, "windowHitError": we, "windowChain": wc, "appHitError": ae, "appChain": ac, "appActions": aa])
