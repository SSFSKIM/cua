// #313's hosted A/B, the AX side: one JSON line per invocation, run as a child of the job shell (which holds the runner
// image's Accessibility grant).
//   ax at <pid> <x> <y>   the element the application answers at the screen point: its role, subrole, DOM id, action
//                         names, AXFocused (value, and whether it is settable: the walk's focusSettable), whether it has
//                         AXDOMClassList (the vendor's focusFieldIfNeeded skips the AXFocused write when it does), its
//                         AXEditableAncestor's role; then the application's focused element and the window order
//   ax focus <pid>        the application's focused element (role, subrole, DOM id, title, value length) and the order
//   ax order <pid>        the on-screen layer-0 windows front to back, where the pid's and TextEdit's first window are
import AppKit
import ApplicationServices
import Foundation

func emit(_ object: Any) { print(String(data: try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]), encoding: .utf8)!) }
func copy(_ e: AXUIElement, _ name: String) -> (CFTypeRef?, Int32) {
  var v: CFTypeRef?
  let r = AXUIElementCopyAttributeValue(e, name as CFString, &v)
  return (r == .success ? v : nil, r.rawValue)
}
func attr(_ e: AXUIElement, _ name: String) -> CFTypeRef? { copy(e, name).0 }
func str(_ e: AXUIElement, _ name: String) -> Any { (attr(e, name) as? String) ?? NSNull() }
func element(_ ref: CFTypeRef?) -> AXUIElement? {
  guard let ref, CFGetTypeID(ref) == AXUIElementGetTypeID() else { return nil }
  return (ref as! AXUIElement)
}
func actions(_ e: AXUIElement) -> Any { var n: CFArray?; return AXUIElementCopyActionNames(e, &n) == .success ? (n as? [String] ?? []) : "error" }
func settable(_ e: AXUIElement, _ name: String) -> Any {
  var b: DarwinBoolean = false
  let r = AXUIElementIsAttributeSettable(e, name as CFString, &b)
  return r == .success ? b.boolValue : "error \(r.rawValue)" as Any
}
func boolRead(_ e: AXUIElement, _ name: String) -> Any {
  let (v, err) = copy(e, name)
  if let v, CFGetTypeID(v) == CFBooleanGetTypeID() { return (v as! NSNumber).boolValue }
  return v == nil ? "error \(err)" : "not a boolean"
}
func windows() -> [[String: Any]] {
  (CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? [])
    .filter { ($0[kCGWindowLayer as String] as? Int) == 0 }
}
func order(_ pid: pid_t) -> [String: Any] {
  let w = windows()
  return ["top": w.prefix(6).map { "\($0[kCGWindowOwnerName as String] ?? "?")" },
          "pidIndex": w.firstIndex { ($0[kCGWindowOwnerPID as String] as? Int) == Int(pid) } ?? NSNull(),
          "textEditIndex": w.firstIndex { ($0[kCGWindowOwnerName as String] as? String) == "TextEdit" } ?? NSNull(),
          "frontmost": NSWorkspace.shared.frontmostApplication?.bundleIdentifier ?? NSNull()]
}
func describe(_ e: AXUIElement?) -> Any {
  guard let e else { return NSNull() }
  return ["role": str(e, kAXRoleAttribute), "subrole": str(e, kAXSubroleAttribute), "dom": str(e, "AXDOMIdentifier"),
          "title": str(e, kAXTitleAttribute), "description": str(e, kAXDescriptionAttribute),
          "valueLength": (attr(e, kAXValueAttribute) as? String)?.utf16.count ?? NSNull()]
}
func focused(_ app: AXUIElement) -> Any { describe(element(attr(app, kAXFocusedUIElementAttribute))) }

let args = CommandLine.arguments
guard args.count >= 3, let pid = pid_t(args[2]) else { emit(["usage": true]); exit(2) }
let app = AXUIElementCreateApplication(pid)
AXUIElementSetMessagingTimeout(app, 3)
switch args[1] {
case "order": emit(order(pid))
case "focus": emit(["focused": focused(app), "order": order(pid)])
case "at":
  guard args.count == 5, let x = Float(args[3]), let y = Float(args[4]) else { emit(["usage": true]); exit(2) }
  var hit: AXUIElement?
  let err = AXUIElementCopyElementAtPosition(app, x, y, &hit)
  var out: [String: Any] = ["trusted": AXIsProcessTrusted(), "hitError": err.rawValue]
  if let hit {
    let (classes, classErr) = copy(hit, "AXDOMClassList")
    var names: CFArray?
    let attributeNames = AXUIElementCopyAttributeNames(hit, &names) == .success ? (names as? [String] ?? []) : []
    out["hit"] = describe(hit)
    out["actions"] = actions(hit)
    out["focusedValue"] = boolRead(hit, kAXFocusedAttribute)
    out["focusedSettable"] = settable(hit, kAXFocusedAttribute)
    out["domClassList"] = classes.map { "\($0)" } ?? "error \(classErr)"
    out["listsDomClassList"] = attributeNames.contains("AXDOMClassList")
    out["editableAncestor"] = element(attr(hit, "AXEditableAncestor")).map { describe($0) } ?? NSNull()
  }
  out["appFocused"] = focused(app)
  out["order"] = order(pid)
  emit(out)
default: emit(["usage": true]); exit(2)
}
