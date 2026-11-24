// The matrix's own Accessibility writes on TextEdit's panels (#117 M5, rulings 1195 and 1196), outside either engine:
// the harness's device side, never the engine under test, so the lanes meet the same panel and no pointer event is
// posted. Run as a binary compiled into the run directory (./matrix-device.mjs `place` and `panel cancel`):
//   panel-ax move <pid> <x,y,w,h> <x,y,w,h>
//       The window of <pid> at the first bounds (global top-left points, the window list's; within 2 pt) given the
//       second frame: AXSize only when the frame asks another size than the window's (ruling 1203: the matrix asks
//       none, the panel service refusing to shrink the Open panel), then AXPosition, then its frame read back.
//       -> {"trusted", "found", "windows", "kind", "size", "position", "readBack"}: the AXError of each write (0 is
//       success, null when not attempted) and the frame read back (null when unread). With no top-level window at the
//       bounds, an AXSheet child of one of the app's windows at them (a Save sheet: its own window in the window list, a
//       child in AX) is the panel, `kind` "sheet": a sheet takes no size or position of its own, so its parent is moved by
//       the sheet's offset from the frame's origin ("parentPosition", that write's AXError), size and position stay null,
//       and the sheet's frame is read back.
//   panel-ax element <pid> <x,y,w,h> focused|search
//       A read, no write: the frame of an element of that window (or sheet), where the alert guard checks a key case's
//       input lands when the panel could not be placed clear of the alerts (ruling 1203's fallback): `focused`, the
//       app's AXFocusedUIElement when it lies in that window; `search`, its first AXSearchField (breadth first, as
//       cancel walks). -> {"trusted", "found", "windows", "kind", "element", "inWindow", "frame", "walked"}: `frame`
//       null when no such element was found or its frame unread.
//   panel-ax cancel <pid> <x,y,w,h>
//       That window (or sheet, found as `move` finds it) cancelled: its AXCancelButton pressed; else the first AXButton titled Cancel (or 취소) under it,
//       breadth first (at most 5000 elements, 40 levels); else the window's own AXCancel action.
//       -> {"trusted", "found", "windows", "via": "cancelButton" | "button" | "action" | null, "pressed", "walked"}:
//       `pressed` the AXError of the press (0 is success, null when nothing was found to press).
// Numbers and booleans only: a title is compared inside, never printed.
// Hosted only (rulings 1188 and 1195): move and cancel write to another app's windows, and element serves only a
// hosted fallback, so each refuses off a GitHub-hosted runner here, before any Accessibility call, however the binary was run (exit 3). It never asks for a grant: an
// untrusted process answers {"trusted": false} and touches nothing.
import ApplicationServices
import Foundation

func emit(_ object: [String: Any]) {
  let data = try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
  FileHandle.standardOutput.write(data + Data("\n".utf8))
}
let args = CommandLine.arguments
guard args.count >= 4, ["move", "cancel", "element"].contains(args[1]), let pid = Int32(args[2]), args.count == (args[1] == "cancel" ? 4 : 5),
      args[1] != "element" || ["focused", "search"].contains(args[4]) else {
  FileHandle.standardError.write(Data("usage: panel-ax move <pid> <x,y,w,h> <x,y,w,h> | panel-ax element <pid> <x,y,w,h> focused|search | panel-ax cancel <pid> <x,y,w,h>\n".utf8))
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
let topLevel = windows.first { frame($0).map { near($0, bounds) } ?? false }
// A Save sheet has a window of its own in the window list but is an AXSheet child of its document in AX
// (scripts/cursor-sitting/ax-state.swift reads it so): with no top-level window at the bounds, the sheet at them, by
// role and frame, under one of the app's windows.
var sheetParent: AXUIElement? = nil
let sheet: AXUIElement? = topLevel != nil ? nil : windows.lazy.compactMap { parent -> AXUIElement? in
  let children = (read(parent, kAXChildrenAttribute) as? [AXUIElement]) ?? []
  guard let found = children.first(where: { (read($0, kAXRoleAttribute) as? String) == kAXSheetRole && (frame($0).map { near($0, bounds) } ?? false) }) else { return nil }
  sheetParent = parent
  return found
}.first
let window = topLevel ?? sheet
var answer: [String: Any] = ["trusted": true, "found": window != nil, "windows": windows.count, "kind": sheet != nil ? "sheet" as Any : (topLevel != nil ? "window" as Any : NSNull())]

if args[1] == "move" {
  guard let target = rect(args[4]) else { emit(["trusted": true, "found": false, "failed": "frame"]); exit(64) }
  answer["size"] = NSNull(); answer["position"] = NSNull(); answer["readBack"] = NSNull()
  if let sheet, let parent = sheetParent {
    // A sheet takes no size or position of its own: its parent is moved by the sheet's offset from the frame's origin,
    // so the sheet lands there at its own size, and the sheet's frame is read back.
    answer["parentPosition"] = NSNull()
    if let at = frame(sheet), let from = frame(parent) {
      var origin = CGPoint(x: from.minX + target.minX - at.minX, y: from.minY + target.minY - at.minY)
      if let value = AXValueCreate(.cgPoint, &origin) { answer["parentPosition"] = Int(AXUIElementSetAttributeValue(parent, kAXPositionAttribute as CFString, value).rawValue) }
      usleep(200_000)
    }
    answer["readBack"] = rectWire(frame(sheet))
  } else if let window {
    var size = target.size, origin = target.origin
    let sameSize = frame(window).map { abs($0.width - size.width) <= 2 && abs($0.height - size.height) <= 2 } ?? false
    if !sameSize, let value = AXValueCreate(.cgSize, &size) { answer["size"] = Int(AXUIElementSetAttributeValue(window, kAXSizeAttribute as CFString, value).rawValue) }
    if let value = AXValueCreate(.cgPoint, &origin) { answer["position"] = Int(AXUIElementSetAttributeValue(window, kAXPositionAttribute as CFString, value).rawValue) }
    usleep(200_000)
    answer["readBack"] = rectWire(frame(window))
  }
  emit(answer)
  exit(0)
}

func title(_ e: AXUIElement) -> String? { read(e, kAXTitleAttribute) as? String }
func role(_ e: AXUIElement) -> String? { read(e, kAXRoleAttribute) as? String }
var walked = 0
// The first element under `root` (breadth first, at most 5000 elements, 40 levels) that `matches`.
func walk(_ root: AXUIElement, _ matches: (AXUIElement) -> Bool) -> AXUIElement? {
  var level: [AXUIElement] = [root], depth = 0
  while !level.isEmpty, depth < 40, walked < 5_000 {
    var next: [AXUIElement] = []
    for e in level where walked < 5_000 {
      walked += 1
      if matches(e) { return e }
      next.append(contentsOf: (read(e, kAXChildrenAttribute) as? [AXUIElement]) ?? [])
    }
    level = next
    depth += 1
  }
  return nil
}

if args[1] == "element" {
  answer["element"] = args[4]
  var found: AXUIElement? = nil, inWindow: Any = NSNull()
  if let window {
    if args[4] == "focused" {
      if let raw = read(app, kAXFocusedUIElementAttribute), CFGetTypeID(raw) == AXUIElementGetTypeID() {
        let focused = raw as! AXUIElement
        // In the panel: its own window is the panel's, or (a sheet's) it is found under the panel.
        let own = read(focused, kAXWindowAttribute)
        let inside = (own.map { CFEqual($0, window) } ?? false) || CFEqual(focused, window) || walk(window, { CFEqual($0, focused) }) != nil
        inWindow = inside
        if inside { found = focused }
      }
    } else {
      found = walk(window, { (read($0, kAXSubroleAttribute) as? String) == kAXSearchFieldSubrole })
    }
  }
  answer["inWindow"] = inWindow
  answer["frame"] = rectWire(found.flatMap { frame($0) })
  answer["walked"] = walked
  emit(answer)
  exit(0)
}

// cancel
var via: Any = NSNull(), pressed: Any = NSNull()
if let window {
  if let raw = read(window, kAXCancelButtonAttribute), CFGetTypeID(raw) == AXUIElementGetTypeID() {
    via = "cancelButton"
    pressed = Int(AXUIElementPerformAction(raw as! AXUIElement, kAXPressAction as CFString).rawValue)
  } else {
    if let found = walk(window, { role($0) == kAXButtonRole && (title($0).map { ["Cancel", "취소"].contains($0) } ?? false) }) {
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
