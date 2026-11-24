// The matrix's own Accessibility writes on TextEdit's panels (#117 M5, rulings 1195 and 1196), outside either engine:
// the harness's device side, never the engine under test, so the lanes meet the same panel and no pointer event is
// posted. Run as a binary compiled into the run directory (./matrix-device.mjs `place` and `panel cancel`):
//   panel-ax move <pid> <x,y,w,h> <x,y,w,h>
//       The window of <pid> at the first bounds (global top-left points, the window list's; within 2 pt) given the
//       second frame: AXSize, then AXPosition, then its frame read back.
//       -> {"trusted", "found", "windows", "size", "position", "readBack"}: the AXError of each write (0 is success,
//       null when not attempted) and the frame read back (null when unread).
//   panel-ax cancel <pid> <x,y,w,h>
//       That window cancelled: its AXCancelButton pressed; else the first AXButton titled Cancel (or 취소) under it,
//       breadth first (at most 5000 elements, 40 levels); else the window's own AXCancel action.
//       -> {"trusted", "found", "windows", "via": "cancelButton" | "button" | "action" | null, "pressed", "walked"}:
//       `pressed` the AXError of the press (0 is success, null when nothing was found to press).
// Numbers and booleans only: a title is compared inside, never printed.
// Hosted only (rulings 1188 and 1195): both commands write to another app's windows, so each refuses off a GitHub-hosted
// runner here, before any Accessibility call, however the binary was run (exit 3). It never asks for a grant: an
// untrusted process answers {"trusted": false} and touches nothing.
import ApplicationServices
import Foundation

func emit(_ object: [String: Any]) {
  let data = try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
  FileHandle.standardOutput.write(data + Data("\n".utf8))
}
let args = CommandLine.arguments
guard args.count >= 4, ["move", "cancel"].contains(args[1]), let pid = Int32(args[2]), args.count == (args[1] == "move" ? 5 : 4) else {
  FileHandle.standardError.write(Data("usage: panel-ax move <pid> <x,y,w,h> <x,y,w,h> | panel-ax cancel <pid> <x,y,w,h>\n".utf8))
  exit(64)
}
if ProcessInfo.processInfo.environment["RUNNER_ENVIRONMENT"] != "github-hosted" {
  FileHandle.standardError.write(Data("panel-ax \(args[1]): refused: it runs only on a GitHub-hosted runner (RUNNER_ENVIRONMENT=github-hosted), never on a Mac of the owner's\n".utf8))
  exit(3)
}
guard AXIsProcessTrusted() else { emit(["trusted": false]); exit(0) }
let app = AXUIElementCreateApplication(pid)

func read(_ e: AXUIElement, _ attribute: String) -> CFTypeRef? {
  var value: CFTypeRef?
  return AXUIElementCopyAttributeValue(e, attribute as CFString, &value) == .success ? value : nil
}
func axValue<T>(_ value: CFTypeRef?, _ type: AXValueType, _ empty: T) -> T? {
  guard let value, CFGetTypeID(value) == AXValueGetTypeID() else { return nil }
  var out = empty
  return AXValueGetValue(value as! AXValue, type, &out) ? out : nil
}
func frame(_ e: AXUIElement) -> CGRect? {
  guard let origin = axValue(read(e, kAXPositionAttribute), .cgPoint, CGPoint.zero),
        let size = axValue(read(e, kAXSizeAttribute), .cgSize, CGSize.zero) else { return nil }
  return CGRect(origin: origin, size: size)
}
func rectWire(_ r: CGRect?) -> Any {
  guard let r else { return NSNull() }
  return ["x": Double(r.minX), "y": Double(r.minY), "width": Double(r.width), "height": Double(r.height)]
}
func rect(_ text: String) -> CGRect? {
  let parts = text.split(separator: ",").compactMap { Double($0) }
  return parts.count == 4 ? CGRect(x: parts[0], y: parts[1], width: parts[2], height: parts[3]) : nil
}
func near(_ a: CGRect, _ b: CGRect) -> Bool {
  abs(a.minX - b.minX) <= 2 && abs(a.minY - b.minY) <= 2 && abs(a.width - b.width) <= 2 && abs(a.height - b.height) <= 2
}

guard let bounds = rect(args[3]) else { emit(["trusted": true, "found": false, "failed": "bounds"]); exit(64) }
let windows = (read(app, kAXWindowsAttribute) as? [AXUIElement]) ?? []
let window = windows.first { frame($0).map { near($0, bounds) } ?? false }
var answer: [String: Any] = ["trusted": true, "found": window != nil, "windows": windows.count]

if args[1] == "move" {
  guard let target = rect(args[4]) else { emit(["trusted": true, "found": false, "failed": "frame"]); exit(64) }
  answer["size"] = NSNull(); answer["position"] = NSNull(); answer["readBack"] = NSNull()
  if let window {
    var size = target.size, origin = target.origin
    if let value = AXValueCreate(.cgSize, &size) { answer["size"] = Int(AXUIElementSetAttributeValue(window, kAXSizeAttribute as CFString, value).rawValue) }
    if let value = AXValueCreate(.cgPoint, &origin) { answer["position"] = Int(AXUIElementSetAttributeValue(window, kAXPositionAttribute as CFString, value).rawValue) }
    usleep(200_000)
    answer["readBack"] = rectWire(frame(window))
  }
  emit(answer)
  exit(0)
}

// cancel
func title(_ e: AXUIElement) -> String? { read(e, kAXTitleAttribute) as? String }
func role(_ e: AXUIElement) -> String? { read(e, kAXRoleAttribute) as? String }
var via: Any = NSNull(), pressed: Any = NSNull(), walked = 0
if let window {
  if let raw = read(window, kAXCancelButtonAttribute), CFGetTypeID(raw) == AXUIElementGetTypeID() {
    via = "cancelButton"
    pressed = Int(AXUIElementPerformAction(raw as! AXUIElement, kAXPressAction as CFString).rawValue)
  } else {
    var level: [AXUIElement] = [window], found: AXUIElement?
    var depth = 0
    while found == nil, !level.isEmpty, depth < 40, walked < 5_000 {
      var next: [AXUIElement] = []
      for e in level where found == nil && walked < 5_000 {
        walked += 1
        if role(e) == kAXButtonRole, let t = title(e), ["Cancel", "취소"].contains(t) { found = e; break }
        next.append(contentsOf: (read(e, kAXChildrenAttribute) as? [AXUIElement]) ?? [])
      }
      level = next
      depth += 1
    }
    if let found {
      via = "button"
      pressed = Int(AXUIElementPerformAction(found, kAXPressAction as CFString).rawValue)
    } else {
      via = "action"
      pressed = Int(AXUIElementPerformAction(window, kAXCancelAction as CFString).rawValue)
    }
  }
}
answer["via"] = via; answer["pressed"] = pressed; answer["walked"] = walked
emit(answer)
