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
func menuWindows(_ pid: pid_t) -> [[String: Any]] {
  let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] ?? []
  return list.filter { ($0[kCGWindowOwnerPID as String] as? Int).map(pid_t.init) == pid && ($0[kCGWindowLayer as String] as? Int ?? 0) >= menuLevel }
    .map { ["layer": $0[kCGWindowLayer as String] ?? 0, "number": $0[kCGWindowNumber as String] ?? 0] }
}

func menus(_ pid: pid_t) -> [String: Any] {
  let app = application(pid)
  let axMenus = children(app).filter { role($0) == kAXMenuRole }.count
  let focused = element(attr(app, kAXFocusedUIElementAttribute))
  let parent = focused.flatMap { element(attr($0, kAXParentAttribute)) }
  return ["windows": menuWindows(pid).count, "axMenus": axMenus, "focusedRole": focused.flatMap(role) ?? NSNull(),
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
    case "close":
      var cancels: [Int32] = []
      for menu in children(application(pid)) where role(menu) == kAXMenuRole { cancels.append(AXUIElementPerformAction(menu, kAXCancelAction as CFString).rawValue) }
      var escapes = 0
      while !menuWindows(pid).isEmpty && escapes < 10 { escape(pid); escapes += 1; usleep(50_000) }
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
