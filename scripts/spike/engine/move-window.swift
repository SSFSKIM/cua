// The harness's own window move for measure.mjs's coordinate group (U2's moved-window case): moves one window of the
// run's own process by (dx, dy) points through Accessibility. Run with
//   swift scripts/spike/engine/move-window.swift <pid> <x,y,w,h> <dx> <dy>
// The window is the one of <pid> whose frame is <x,y,w,h> within 2 points (the bounds FrontWindowProbe read for the
// run's window); no title or other attribute is read. One JSON line out: {"trusted", "moved", "from", "to"} or
// {"trusted", "moved": false, "error"}.
//
// It never asks for a grant: AXIsProcessTrusted is read without the prompt option, and an untrusted shell (the ssh
// session's) answers "not trusted" without touching the window, so the coordinate group records the case as not run.
import ApplicationServices
import Foundation

func emit(_ object: [String: Any]) {
  let data = try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
  print(String(data: data, encoding: .utf8)!)
}
func rect(_ r: CGRect) -> [String: Double] { ["x": Double(r.origin.x), "y": Double(r.origin.y), "width": Double(r.width), "height": Double(r.height)] }

let args = CommandLine.arguments
let parts = args.count == 5 ? args[2].split(separator: ",").compactMap { Double($0) } : []
guard args.count == 5, let pid = Int32(args[1]), parts.count == 4, let dx = Double(args[3]), let dy = Double(args[4]) else {
  emit(["moved": false, "error": "usage: move-window.swift <pid> <x,y,w,h> <dx> <dy>"]); exit(2)
}
let wanted = CGRect(x: parts[0], y: parts[1], width: parts[2], height: parts[3])
let trusted = AXIsProcessTrusted()
guard trusted else { emit(["trusted": false, "moved": false, "error": "this shell is not trusted for Accessibility"]); exit(0) }

func value<T>(_ element: AXUIElement, _ attribute: String, _ type: AXValueType, _ empty: T) -> T? {
  var raw: CFTypeRef?
  guard AXUIElementCopyAttributeValue(element, attribute as CFString, &raw) == .success, let raw, CFGetTypeID(raw) == AXValueGetTypeID() else { return nil }
  var out = empty
  return AXValueGetValue(raw as! AXValue, type, &out) ? out : nil
}

var windows: CFTypeRef?
let app = AXUIElementCreateApplication(pid)
guard AXUIElementCopyAttributeValue(app, kAXWindowsAttribute as CFString, &windows) == .success, let list = windows as? [AXUIElement] else {
  emit(["trusted": true, "moved": false, "error": "the process's windows could not be read"]); exit(0)
}
let match = list.first { window in
  guard let origin = value(window, kAXPositionAttribute, .cgPoint, CGPoint.zero), let size = value(window, kAXSizeAttribute, .cgSize, CGSize.zero) else { return false }
  let frame = CGRect(origin: origin, size: size)
  return abs(frame.minX - wanted.minX) <= 2 && abs(frame.minY - wanted.minY) <= 2 && abs(frame.width - wanted.width) <= 2 && abs(frame.height - wanted.height) <= 2
}
guard let window = match else { emit(["trusted": true, "moved": false, "error": "no window of the process has those bounds"]); exit(0) }
var target = CGPoint(x: wanted.minX + dx, y: wanted.minY + dy)
let position = AXValueCreate(.cgPoint, &target)!
let error = AXUIElementSetAttributeValue(window, kAXPositionAttribute as CFString, position)
let now = value(window, kAXPositionAttribute, .cgPoint, CGPoint.zero)
let to = CGRect(origin: now ?? target, size: wanted.size)
emit(["trusted": true, "moved": error == .success && now.map { abs($0.x - target.x) <= 2 && abs($0.y - target.y) <= 2 } == true,
      "from": rect(wanted), "to": rect(to), "axError": Int(error.rawValue)])
