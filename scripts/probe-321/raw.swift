// #321's raw controls, with no engine: route 3's pieces posted to one process the engine's way (Activation.swift's
// subtype events, Mouse.swift's mouse recipe: AppKit's event as a CGEvent, the global point, the button in field 3,
// subtype 3 in field 7, the window id in fields 91 and 92 and the window-local point by CGEventSetWindowLocation), or an
// AX action alone. The window is the process's on-screen layer-0 window under the point. One JSON line: each step's
// Unix milliseconds.
//   raw <step> <pid> <x> <y>
//     activate   subtype 1 (applicationActivated), 300 ms, subtype 2 (applicationDeactivated)
//     down       a left mouse down
//     downup     a left mouse down and up, back to back
//     full       subtype 1, 50 ms, down and up, 150 ms, subtype 2 (the hold's order, without its guard)
//     ax         AXPress on the element the application answers at the point
import AppKit
import ApplicationServices
import Foundation

func emit(_ object: Any) { print(String(data: try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]), encoding: .utf8)!) }
func unixMs() -> Double { (Date().timeIntervalSince1970 * 1000 * 10).rounded() / 10 }
let a = CommandLine.arguments
guard a.count == 5, let pid = pid_t(a[2]), let x = Double(a[3]), let y = Double(a[4]) else { emit(["usage": true]); exit(2) }
let point = CGPoint(x: x, y: y)
let list = (CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]]) ?? []
let window = list.first { w in
  guard (w[kCGWindowOwnerPID as String] as? Int) == Int(pid), (w[kCGWindowLayer as String] as? Int) == 0,
        let b = w[kCGWindowBounds as String] as? [String: CGFloat] else { return false }
  return CGRect(x: b["X"] ?? 0, y: b["Y"] ?? 0, width: b["Width"] ?? 0, height: b["Height"] ?? 0).contains(point)
}
let windowID = window?[kCGWindowNumber as String] as? Int ?? 0
let frame: CGRect = {
  guard let b = window?[kCGWindowBounds as String] as? [String: CGFloat] else { return .zero }
  return CGRect(x: b["X"] ?? 0, y: b["Y"] ?? 0, width: b["Width"] ?? 0, height: b["Height"] ?? 0)
}()
typealias SetWindowLocation = @convention(c) (CGEvent, CGPoint) -> Void
let setWindowLocation: SetWindowLocation? = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "CGEventSetWindowLocation").map { unsafeBitCast($0, to: SetWindowLocation.self) }

var steps: [[String: Any]] = []
func subtype(_ s: Int16, _ name: String) {
  guard let e = NSEvent.otherEvent(with: .appKitDefined, location: .zero, modifierFlags: NSEvent.ModifierFlags(rawValue: 0xC0000), timestamp: 0,
                                   windowNumber: windowID, context: nil, subtype: s, data1: 0, data2: 0)?.cgEvent else { steps.append(["step": name, "made": false]); return }
  e.timestamp = DispatchTime.now().uptimeNanoseconds
  e.postToPid(pid)
  steps.append(["step": name, "atMs": unixMs()])
}
func mouse(_ type: NSEvent.EventType, _ name: String, number: Int) {
  guard let e = NSEvent.mouseEvent(with: type, location: point, modifierFlags: [], timestamp: 0, windowNumber: windowID, context: nil,
                                   eventNumber: number, clickCount: 1, pressure: 1.0)?.cgEvent else { steps.append(["step": name, "made": false]); return }
  e.location = point
  e.setIntegerValueField(.mouseEventButtonNumber, value: 0)
  e.setIntegerValueField(.mouseEventSubtype, value: 3)
  e.setIntegerValueField(CGEventField(rawValue: 91) ?? unsafeBitCast(UInt32(91), to: CGEventField.self), value: Int64(windowID))
  e.setIntegerValueField(CGEventField(rawValue: 92) ?? unsafeBitCast(UInt32(92), to: CGEventField.self), value: Int64(windowID))
  setWindowLocation?(e, CGPoint(x: point.x - frame.minX, y: point.y - frame.minY))
  e.timestamp = DispatchTime.now().uptimeNanoseconds
  e.postToPid(pid)
  steps.append(["step": name, "atMs": unixMs()])
}
let number = Int(getpid()) * 10 + Int(Date().timeIntervalSince1970) % 10
switch a[1] {
case "activate": subtype(1, "subtype1"); usleep(300_000); subtype(2, "subtype2")
case "down": mouse(.leftMouseDown, "down", number: number)
case "downup": mouse(.leftMouseDown, "down", number: number); mouse(.leftMouseUp, "up", number: number)
case "full":
  subtype(1, "subtype1"); usleep(50_000)
  mouse(.leftMouseDown, "down", number: number); mouse(.leftMouseUp, "up", number: number)
  usleep(150_000); subtype(2, "subtype2")
case "ax":
  let app = AXUIElementCreateApplication(pid)
  var hit: AXUIElement?
  AXUIElementCopyElementAtPosition(app, Float(x), Float(y), &hit)
  if let hit {
    let t = unixMs()
    let err = AXUIElementPerformAction(hit, kAXPressAction as CFString)
    var role: CFTypeRef?
    AXUIElementCopyAttributeValue(hit, kAXRoleAttribute as CFString, &role)
    steps.append(["step": "AXPress", "atMs": t, "error": err.rawValue, "role": (role as? String) ?? "?"])
  } else { steps.append(["step": "AXPress", "hit": false]) }
default: emit(["usage": true]); exit(2)
}
emit(["windowID": windowID, "frame": [frame.minX, frame.minY, frame.width, frame.height], "steps": steps])
