// #282 probe diagnostics, one JSON line each.
//   hit <pid> <x> <y>   what AX answers at a screen point asked of the process's first window and of its application, each
//                       hit's role chain up to its window (the walk the engine's pointerView makes)
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
func hit(_ e: AXUIElement) -> (String, [String]) {
  var h: AXUIElement?
  let err = AXUIElementCopyElementAtPosition(e, x, y, &h)
  return ("\(err.rawValue)", chain(h))
}
let app = AXUIElementCreateApplication(pid)
let windows = (attr(app, kAXWindowsAttribute) as? [AXUIElement]) ?? []
let (we, wc) = windows.first.map(hit) ?? ("noWindow", [])
let (ae, ac) = hit(app)
emit(["trusted": AXIsProcessTrusted(), "windows": windows.count, "windowHitError": we, "windowChain": wc, "appHitError": ae, "appChain": ac])
