// #313's focus read-back latency: the element the application answers at a screen point, resolved before the click;
// on a line on stdin ("go", written when the click's answer arrives) its AXFocused is read every <intervalMs> until it
// first reads true or <maxMs> passes, beside whether the application's focused element is it. One JSON line out when
// resolved ({ready}), one when done.
//   poll <pid> <x> <y> <intervalMs> <maxMs>
import AppKit
import ApplicationServices
import Foundation

setvbuf(stdout, nil, _IOLBF, 0)
func emit(_ object: Any) { print(String(data: try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]), encoding: .utf8)!) }
func now() -> Double { Double(DispatchTime.now().uptimeNanoseconds) / 1_000_000 }
func attr(_ e: AXUIElement, _ name: String) -> CFTypeRef? { var v: CFTypeRef?; return AXUIElementCopyAttributeValue(e, name as CFString, &v) == .success ? v : nil }
func focused(_ e: AXUIElement) -> Bool? {
  guard let v = attr(e, kAXFocusedAttribute), CFGetTypeID(v) == CFBooleanGetTypeID() else { return nil }
  return (v as! NSNumber).boolValue
}

let a = CommandLine.arguments
guard a.count == 6, let pid = pid_t(a[1]), let x = Float(a[2]), let y = Float(a[3]), let interval = Double(a[4]), let maxMs = Double(a[5]) else {
  emit(["usage": true]); exit(2)
}
let app = AXUIElementCreateApplication(pid)
AXUIElementSetMessagingTimeout(app, 2)
var hitRef: AXUIElement?
let err = AXUIElementCopyElementAtPosition(app, x, y, &hitRef)
guard let hit = hitRef else { emit(["ready": false, "hitError": err.rawValue]); exit(0) }
let before = focused(hit)
emit(["ready": true, "role": (attr(hit, kAXRoleAttribute) as? String) ?? "?", "dom": (attr(hit, "AXDOMIdentifier") as? String).map { $0 as Any } ?? NSNull(),
      "focusedBefore": before.map { $0 as Any } ?? NSNull()])
guard readLine() != nil else { exit(0) }
let t0 = now()
var reads = 0, firstTrue: Double?, appFirst: Double?, unread = 0
repeat {
  let t = now() - t0
  reads += 1
  switch focused(hit) {
  case .some(true): firstTrue = t
  case .none: unread += 1
  default: break
  }
  if appFirst == nil, let f = attr(app, kAXFocusedUIElementAttribute), CFGetTypeID(f) == AXUIElementGetTypeID(), CFEqual(f, hit) { appFirst = t }
  if firstTrue != nil { break }
  usleep(UInt32(interval * 1000))
} while now() - t0 < maxMs
emit(["firstTrueMs": firstTrue.map { $0 as Any } ?? NSNull(), "appFocusFirstMs": appFirst.map { $0 as Any } ?? NSNull(), "reads": reads,
      "unreadReads": unread, "elapsedMs": now() - t0])
