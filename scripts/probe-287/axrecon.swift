// #287's AX reader for the recon cells (scripts/probe-287/recon.mjs runs it as a child of the job shell, which holds the
// runner image's Accessibility grant). One JSON object on stdout per invocation. It reads only, except `write`.
//   axrecon state <pid>              the application element's enablement attributes (scripts/probe-288/ax.swift's
//       appState), its window count, and a breadth-first walk of window 1 (up to 4,000 elements): the role histogram,
//       the first AXWebArea's depth and its element count, the first AXCheckBox's action names, the walk's ms
//   axrecon write <pid> <attr> <0|1>  one Boolean write on the application element: its AXError, and the value read after
import AppKit
import ApplicationServices
import Foundation

func emit(_ object: Any) {
  print(String(data: try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]), encoding: .utf8)!)
}
func prepare(_ e: AXUIElement) -> AXUIElement { AXUIElementSetMessagingTimeout(e, 1.0); return e }
func copy(_ e: AXUIElement, _ name: String) -> (CFTypeRef?, Int32) {
  var v: CFTypeRef?
  let r = AXUIElementCopyAttributeValue(e, name as CFString, &v)
  return (r == .success ? v : nil, r.rawValue)
}
func attr(_ e: AXUIElement, _ name: String) -> CFTypeRef? { copy(e, name).0 }
func str(_ e: AXUIElement, _ name: String) -> String? { attr(e, name) as? String }
func element(_ ref: CFTypeRef?) -> AXUIElement? {
  guard let ref, CFGetTypeID(ref) == AXUIElementGetTypeID() else { return nil }
  return (ref as! AXUIElement)
}
func elements(_ ref: CFTypeRef?) -> [AXUIElement] {
  guard let ref, CFGetTypeID(ref) == CFArrayGetTypeID() else { return [] }
  return (ref as! [AnyObject]).compactMap { element($0 as CFTypeRef) }
}
func names(_ e: AXUIElement) -> [String] { var n: CFArray?; return AXUIElementCopyAttributeNames(e, &n) == .success ? (n as? [String] ?? []) : [] }
func actions(_ e: AXUIElement) -> [String]? { var n: CFArray?; return AXUIElementCopyActionNames(e, &n) == .success ? (n as? [String] ?? []) : nil }
func boolValue(_ ref: CFTypeRef?) -> Any {
  guard let ref else { return NSNull() }
  if CFGetTypeID(ref) == CFBooleanGetTypeID() { return (ref as! NSNumber).boolValue }
  if CFGetTypeID(ref) == CFNumberGetTypeID() { return (ref as! NSNumber).intValue != 0 }
  return "<\(CFCopyTypeIDDescription(CFGetTypeID(ref)) as String)>"
}
func appState(_ app: AXUIElement) -> [String: Any] {
  let (eui, euiErr) = copy(app, "AXEnhancedUserInterface"), (man, manErr) = copy(app, "AXManualAccessibility")
  var euiSettable: DarwinBoolean = false, manSettable: DarwinBoolean = false
  let es = AXUIElementIsAttributeSettable(app, "AXEnhancedUserInterface" as CFString, &euiSettable)
  let ms = AXUIElementIsAttributeSettable(app, "AXManualAccessibility" as CFString, &manSettable)
  let ns = names(app)
  return ["eui": eui != nil ? boolValue(eui) : "error \(euiErr)", "manual": man != nil ? boolValue(man) : "error \(manErr)",
          "euiSettable": es == .success ? euiSettable.boolValue : "error \(es.rawValue)" as Any,
          "manualSettable": ms == .success ? manSettable.boolValue : "error \(ms.rawValue)" as Any,
          "listsManual": ns.contains("AXManualAccessibility"), "listsEUI": ns.contains("AXEnhancedUserInterface"), "names": ns]
}

let args = CommandLine.arguments
guard args.count >= 3, let pid = pid_t(args[2]) else { emit(["error": "usage"]); exit(2) }
let app = prepare(AXUIElementCreateApplication(pid))
switch args[1] {
case "state":
  let started = Date()
  var out = appState(app)
  let windows = elements(attr(app, kAXWindowsAttribute))
  out["windows"] = windows.count
  if let window = windows.first.map(prepare) {
    out["windowTitle"] = str(window, kAXTitleAttribute) ?? NSNull()
    var ap = CGPoint.zero
    if let v = attr(window, "AXActivationPoint"), CFGetTypeID(v) == AXValueGetTypeID(), AXValueGetValue(v as! AXValue, .cgPoint, &ap) {
      out["activationPoint"] = ["x": Double(ap.x), "y": Double(ap.y)]
    }
    var roles: [String: Int] = [:]
    var queue: [(AXUIElement, Int)] = [(window, 0)], head = 0
    var webAreaDepth: Int?, webArea: AXUIElement?, checkboxActions: Any = NSNull(), maxDepth = 0
    while head < queue.count && head < 4000 {
      let (e, depth) = queue[head]; head += 1
      let role = str(prepare(e), kAXRoleAttribute) ?? "unreadable"
      roles[role, default: 0] += 1
      maxDepth = max(maxDepth, depth)
      if role == "AXWebArea" && webArea == nil { webArea = e; webAreaDepth = depth }
      if role == "AXCheckBox", checkboxActions is NSNull { checkboxActions = actions(e) ?? NSNull() }
      for c in elements(attr(e, kAXChildrenAttribute)) { queue.append((c, depth + 1)) }
    }
    out["walked"] = head
    out["maxDepth"] = maxDepth
    out["roles"] = roles
    out["webAreaDepth"] = webAreaDepth ?? NSNull()
    out["checkboxActions"] = checkboxActions
    if let webArea {
      var r = CGRect.zero
      if let v = attr(prepare(webArea), "AXFrame"), CFGetTypeID(v) == AXValueGetTypeID(), AXValueGetValue(v as! AXValue, .cgRect, &r) {
        out["webAreaFrame"] = [Double(r.origin.x), Double(r.origin.y), Double(r.size.width), Double(r.size.height)]
      }
      // The width rule's inputs on the web area: its child count and whether it answers a visible subset.
      let wa = prepare(webArea)
      out["webAreaChildren"] = elements(attr(wa, kAXChildrenAttribute)).count
      let (vis, visErr) = copy(wa, "AXVisibleChildren")
      out["webAreaVisibleChildren"] = vis != nil ? elements(vis).count as Any : "error \(visErr)"
      out["webAreaListsVisibleChildren"] = names(wa).contains("AXVisibleChildren")
      var n = 0
      var q = [webArea], h = 0
      while h < q.count && h < 4000 { let e = prepare(q[h]); h += 1; n += 1; q.append(contentsOf: elements(attr(e, kAXChildrenAttribute))) }
      out["webAreaElements"] = n
    }
  }
  out["ms"] = Int(Date().timeIntervalSince(started) * 1000)
  emit(out)
case "write":
  guard args.count >= 5 else { emit(["error": "usage"]); exit(2) }
  let value: CFBoolean = args[4] == "1" ? kCFBooleanTrue : kCFBooleanFalse
  let r = AXUIElementSetAttributeValue(app, args[3] as CFString, value)
  let (after, afterErr) = copy(app, args[3])
  emit(["attribute": args[3], "error": Int(r.rawValue), "after": after != nil ? boolValue(after) : "error \(afterErr)"])
default:
  emit(["error": "unknown op"])
}
