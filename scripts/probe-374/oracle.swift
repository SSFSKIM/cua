// #374's side oracle, independent of the engine: JSON lines on stdin, one answer per line on stdout.
//   {"op":"menus","pid":N}   what is open now: the process's on-screen windows at the pop-up menu level or above
//                            (CGWindowList, layer >= kCGPopUpMenuWindowLevel; what a native menu draws), its
//                            application element's AXMenu children, and its focused element's role and its parent's.
//   {"op":"close","pid":N}   AXCancel on each AXMenu child of the application, then Escape posted to the process while
//                            menu windows remain (at most 10 tries, 50 ms apart); answers what is open after.
//   {"op":"front","pid":N}   activates the process and waits up to 2 s for it to be frontmost.
// It reads windows and the AX tree and never captures pixels (no Screen Recording needed).
import AppKit
import ApplicationServices

func attr(_ e: AXUIElement, _ name: String) -> CFTypeRef? { var v: CFTypeRef?; return AXUIElementCopyAttributeValue(e, name as CFString, &v) == .success ? v : nil }
func element(_ v: CFTypeRef?) -> AXUIElement? {
  guard let v, CFGetTypeID(v) == AXUIElementGetTypeID() else { return nil }
  let e = v as! AXUIElement; AXUIElementSetMessagingTimeout(e, 0.5); return e
}
func role(_ e: AXUIElement) -> String? { attr(e, kAXRoleAttribute) as? String }
func children(_ e: AXUIElement) -> [AXUIElement] { (attr(e, kAXChildrenAttribute) as? [AnyObject] ?? []).compactMap { element($0 as CFTypeRef) } }
func application(_ pid: pid_t) -> AXUIElement { let a = AXUIElementCreateApplication(pid); AXUIElementSetMessagingTimeout(a, 0.5); return a }

let menuLevel = Int(CGWindowLevelForKey(.popUpMenuWindow))
/// On-screen windows at the pop-up menu level or above that are not the system's own (the menu bar, the Dock, the
/// window server's); `pid` nil for every owner. Owner, layer and bounds need no Screen Recording.
func popUpWindows(_ pid: pid_t?) -> [[String: Any]] {
  let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] ?? []
  let system: Set<String> = ["Window Server", "Dock", "SystemUIServer", "Control Center", "Spotlight", "Notification Center", "TextInputMenuAgent"]
  return list.filter { entry in
    let owner = (entry[kCGWindowOwnerPID as String] as? Int).map(pid_t.init)
    guard (entry[kCGWindowLayer as String] as? Int ?? 0) >= menuLevel else { return false }
    if let pid { return owner == pid }
    return !system.contains(entry[kCGWindowOwnerName as String] as? String ?? "")
  }.map { entry in
    let b = entry[kCGWindowBounds as String] as? [String: Any] ?? [:]
    return ["layer": entry[kCGWindowLayer as String] ?? 0, "number": entry[kCGWindowNumber as String] ?? 0,
            "owner": entry[kCGWindowOwnerName as String] ?? "", "ownerPid": entry[kCGWindowOwnerPID as String] ?? 0,
            "x": b["X"] ?? 0, "y": b["Y"] ?? 0, "w": b["Width"] ?? 0, "h": b["Height"] ?? 0]
  }
}
func menuWindows(_ pid: pid_t) -> [[String: Any]] { popUpWindows(pid) }

/// Where a menu on screen lives in the AX tree (#374's smoke found Chromium's and Gecko's native menus on screen with no
/// AXMenu among the application's children): for each of the process's pop-up windows, the element the application
/// and the system-wide element hit-test at its centre, with its ancestry's roles; and a bounded search of the
/// application's tree for AXMenu, with each one's path of roles from the application.
func ancestry(_ start: AXUIElement?) -> [String] {
  var roles: [String] = [], node = start
  for _ in 0..<16 { guard let current = node else { break }; roles.append(role(current) ?? "?"); node = element(attr(current, kAXParentAttribute)) }
  return roles
}
func hit(_ root: AXUIElement, _ x: Float, _ y: Float) -> AXUIElement? {
  var found: AXUIElement?
  return AXUIElementCopyElementAtPosition(root, x, y, &found) == .success ? found.map { AXUIElementSetMessagingTimeout($0, 0.5); return $0 } : nil
}
func locate(_ pid: pid_t) -> [String: Any] {
  let app = application(pid), wide = AXUIElementCreateSystemWide()
  AXUIElementSetMessagingTimeout(wide, 0.5)
  let hits: [[String: Any]] = menuWindows(pid).map { window in
    let x = Float((window["x"] as? Double ?? 0) + (window["w"] as? Double ?? 0) / 2), y = Float((window["y"] as? Double ?? 0) + min(12, (window["h"] as? Double ?? 0) / 2))
    let appHit = hit(app, x, y), wideHit = hit(wide, x, y)
    var parentIsApp = false
    if let menu = sequence(first: appHit, next: { $0.flatMap { element(attr($0, kAXParentAttribute)) } }).prefix(16).compactMap({ $0 }).first(where: { role($0) == kAXMenuRole }),
       let parent = element(attr(menu, kAXParentAttribute)) { parentIsApp = role(parent) == kAXApplicationRole }
    return ["window": window, "appHit": ancestry(appHit), "wideHit": ancestry(wideHit), "menuParentIsApplication": parentIsApp]
  }
  var queue: [(AXUIElement, [String])] = [(app, [role(app) ?? "?"])], index = 0, found: [[String]] = []
  while index < queue.count && index < 4000 {
    let (node, path) = queue[index]; index += 1
    for child in children(node) {
      let r = role(child) ?? "?"
      if r == kAXMenuRole { found.append(path + [r]) }
      if path.count < 14 { queue.append((child, path + [r])) }
    }
  }
  let windows = (attr(app, kAXWindowsAttribute) as? [AnyObject] ?? []).compactMap { element($0 as CFTypeRef) }
  return ["hits": hits, "treeMenus": found, "searched": index, "windowsRoles": windows.map { [role($0) ?? "?", attr($0, kAXSubroleAttribute) as? String ?? "-"] },
          "focusedAncestry": ancestry(element(attr(app, kAXFocusedUIElementAttribute))),
          "wideFocusedAncestry": ancestry(element(attr(wide, kAXFocusedUIElementAttribute))), "allPopUps": popUpWindows(nil)]
}

func menus(_ pid: pid_t) -> [String: Any] {
  let app = application(pid)
  let axMenus = children(app).filter { role($0) == kAXMenuRole }.count
  let focused = element(attr(app, kAXFocusedUIElementAttribute))
  let parent = focused.flatMap { element(attr($0, kAXParentAttribute)) }
  return ["windows": menuWindows(pid).count, "popUps": popUpWindows(pid), "allPopUps": popUpWindows(nil), "axMenus": axMenus, "focusedRole": focused.flatMap(role) ?? NSNull(),
          "focusedParentRole": parent.flatMap(role) ?? NSNull(), "frontmostPid": NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 0,
          "at": Date().timeIntervalSince1970 * 1000]
}

func escape(_ pid: pid_t) {
  for down in [true, false] { CGEvent(keyboardEventSource: nil, virtualKey: 53, keyDown: down)?.postToPid(pid) }
}

setvbuf(stdout, nil, _IOLBF, 0)
while let line = readLine() {
  var answer: [String: Any] = [:]
  if let q = try? JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any], let op = q["op"] as? String,
     let pid = (q["pid"] as? NSNumber).map({ pid_t($0.int32Value) }) {
    switch op {
    case "menus": answer = menus(pid)
    case "locate": answer = locate(pid)
    case "hover":
      // A pointer move only (not a type the engine's intervention tap counts), to raise a tooltip.
      let x = (q["x"] as? NSNumber)?.doubleValue ?? 0, y = (q["y"] as? NSNumber)?.doubleValue ?? 0
      for (dx, dy) in [(-3.0, 0.0), (0.0, 0.0)] {
        CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: CGPoint(x: x + dx, y: y + dy), mouseButton: .left)?.post(tap: .cghidEventTap)
        usleep(50_000)
      }
      answer = ["moved": true]
    case "close":
      var cancels: [Int32] = []
      for menu in children(application(pid)) where role(menu) == kAXMenuRole { cancels.append(AXUIElementPerformAction(menu, kAXCancelAction as CFString).rawValue) }
      // Escape is a key event the engine's intervention tap counts as the user's: posted only when AXCancel left a menu
      // window, and the harness then waits out the 5 s debounce (measure.mjs).
      usleep(100_000)
      var escapes = 0
      while !menuWindows(pid).isEmpty && escapes < 10 { escape(pid); escapes += 1; usleep(100_000) }
      answer = menus(pid); answer["cancels"] = cancels; answer["escapes"] = escapes
    case "front":
      _ = NSRunningApplication(processIdentifier: pid)?.activate(options: [])
      let deadline = Date().addingTimeInterval(2)
      while NSWorkspace.shared.frontmostApplication?.processIdentifier != pid && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.01)) }
      answer = ["frontmostPid": NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 0, "ok": NSWorkspace.shared.frontmostApplication?.processIdentifier == pid]
    default: answer = ["error": "unknown op \(op)"]
    }
  } else { answer = ["error": "bad request"] }
  print(String(data: try! JSONSerialization.data(withJSONObject: answer, options: [.sortedKeys]), encoding: .utf8)!)
}
