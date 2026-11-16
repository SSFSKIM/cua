import AppKit
import ApplicationServices
import Foundation

func now() -> Double { Date().timeIntervalSince1970 * 1000 }
func copy(_ e: AXUIElement, _ name: String) -> (CFTypeRef?, AXError) {
 var v: CFTypeRef?; let error = AXUIElementCopyAttributeValue(e, name as CFString, &v)
 return (error == .success ? v : nil, error)
}
func attr(_ e: AXUIElement, _ name: String) -> CFTypeRef? { copy(e, name).0 }
func text(_ e: AXUIElement, _ name: String) -> String { attr(e, name) as? String ?? "" }
func element(_ value: CFTypeRef?) -> AXUIElement? {
 guard let value, CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
 let e = value as! AXUIElement; AXUIElementSetMessagingTimeout(e, 0.2); return e
}
func appElement(_ pid: pid_t) -> AXUIElement { let e = AXUIElementCreateApplication(pid); AXUIElementSetMessagingTimeout(e, 0.2); return e }
func window(_ pid: pid_t) -> AXUIElement? {
 let a = appElement(pid)
 return element(attr(a, kAXFocusedWindowAttribute)) ?? element(attr(a, kAXMainWindowAttribute)) ?? (attr(a, kAXWindowsAttribute) as? [AXUIElement])?.first
}
func walk(_ root: AXUIElement) -> ([AXUIElement], Bool) {
 var queue = [root], i = 0, seen = Set<CFHashCode>(), nodes: [AXUIElement] = [], complete = true
 while i < queue.count && i < 1500 {
  let e = queue[i]; i += 1
  if !seen.insert(CFHash(e)).inserted { continue }
  AXUIElementSetMessagingTimeout(e, 0.2); nodes.append(e)
  let (v, error) = copy(e, kAXChildrenAttribute)
  if error != .success && error != .attributeUnsupported && error != .noValue { complete = false }
  if let children = v as? [AXUIElement] { queue += children }
 }
 return (nodes, complete && i == queue.count)
}
func named(_ e: AXUIElement, _ name: String) -> Bool {
 [kAXTitleAttribute, kAXDescriptionAttribute, "AXDOMIdentifier", kAXIdentifierAttribute].contains { text(e, $0) == name }
}
struct Controls { let window: AXUIElement; let button: AXUIElement; let field: AXUIElement }
var bound: [pid_t: Controls] = [:]
func bind(_ pid: pid_t) throws -> Controls {
 guard let w = window(pid) else { throw NSError(domain: "no owned window", code: 1) }
 let (nodes, complete) = walk(w)
 guard complete, let b = nodes.first(where: { text($0,kAXRoleAttribute) == "AXButton" && named($0,"Run probe button") }),
       let f = nodes.first(where: { ["AXTextField","AXSearchField","AXTextArea"].contains(text($0,kAXRoleAttribute)) && (named($0,"Probe search") || named($0,"search")) }) else {
  let labels = nodes.map { text($0,kAXRoleAttribute)+" "+text($0,kAXTitleAttribute)+" "+text($0,kAXDescriptionAttribute) }
  throw NSError(domain: "controls missing: "+labels.joined(separator: " | "), code: 2)
 }
 let c = Controls(window:w, button:b, field:f); bound[pid] = c; return c
}
func read(_ pid: pid_t) -> [String: Any] {
 guard let c = bound[pid] else { return ["dialog":NSNull(), "error":"unbound AX controls"] }
 let started = now(), (nodes, complete) = walk(c.window)
 let b = nodes.first { text($0,kAXRoleAttribute) == "AXButton" && named($0,"Run probe button") }
 let f = nodes.first { ["AXTextField","AXSearchField","AXTextArea"].contains(text($0,kAXRoleAttribute)) && (named($0,"Probe search") || named($0,"search")) }
 let strings = nodes.flatMap { [text($0,kAXValueAttribute),text($0,kAXTitleAttribute)] }
 let marker = strings.first { $0.hasPrefix("Press marker ") }.flatMap { Int($0.dropFirst("Press marker ".count)) }
 return ["startedAt":started,"at":now(),"complete":complete,"dialog":complete ? (b != nil) as Any : NSNull(),
         "marker":marker as Any? ?? NSNull(),"value":f.flatMap { attr($0,kAXValueAttribute) as? String } as Any? ?? NSNull(),
         "fieldFocused":f.flatMap { attr($0,kAXFocusedAttribute) as? Bool } as Any? ?? NSNull(),
         "main":attr(c.window,kAXMainAttribute) as Any? ?? NSNull(),
         "frontmost":attr(appElement(pid),kAXFrontmostAttribute) as Any? ?? NSNull()]
}
func order(_ pid: pid_t, _ cover: pid_t) -> [String: Any] {
 guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly,.excludeDesktopElements],kCGNullWindowID) as? [[String:Any]] else { return [:] }
 let ordinary = list.filter { ($0[kCGWindowLayer as String] as? Int) == 0 }
 let t = ordinary.firstIndex { ($0[kCGWindowOwnerPID as String] as? Int) == Int(pid) }
 let c = ordinary.firstIndex { ($0[kCGWindowOwnerPID as String] as? Int) == Int(cover) }
 return ["targetAboveCover":t.flatMap { ti in c.map { ti < $0 } } as Any? ?? NSNull()]
}
func emit(_ v: [String: Any]) {
 if let data = try? JSONSerialization.data(withJSONObject: v, options: [.sortedKeys]), let s = String(data:data,encoding:.utf8) { print(s); fflush(stdout) }
}
if CommandLine.arguments.contains("--cover") {
 guard ProcessInfo.processInfo.environment["RUNNER_ENVIRONMENT"] == "github-hosted" else { fatalError("hosted only") }
 let app = NSApplication.shared; app.setActivationPolicy(.regular)
 let w = NSWindow(contentRect:NSRect(x:20,y:100,width:300,height:400),styleMask:[.titled,.closable],backing:.buffered,defer:false)
 w.title = "probe366 owned cover"; w.makeKeyAndOrderFront(nil); app.activate(ignoringOtherApps:true)
 emit(["pid":ProcessInfo.processInfo.processIdentifier]); app.run()
} else {
 while let line = readLine() { do {
  guard ProcessInfo.processInfo.environment["RUNNER_ENVIRONMENT"] == "github-hosted" else { fatalError("hosted only") }
  let q = try JSONSerialization.jsonObject(with:Data(line.utf8)) as! [String:Any]
  let pid = (q["pid"] as? NSNumber)?.int32Value ?? 0, op = q["op"] as? String ?? ""
  var r: [String:Any] = ["startedAt":now()]
  if op == "front" {
   if q["activate"] as? Bool != false { r["accepted"] = NSRunningApplication(processIdentifier:pid)?.activate(options:[]) ?? false }
   let deadline = now()+2000
   while NSWorkspace.shared.frontmostApplication?.processIdentifier != pid && now() < deadline { RunLoop.current.run(until:Date().addingTimeInterval(0.01)) }
   r["ok"] = NSWorkspace.shared.frontmostApplication?.processIdentifier == pid
  } else if op == "title" { r["title"] = window(pid).map { text($0,kAXTitleAttribute) } as Any? ?? NSNull() }
  else if op == "bind" { _ = try bind(pid); r["ax"] = read(pid) }
  else if op == "read" { r["ax"] = read(pid) }
  else if op.hasPrefix("raw-") {
   guard let c = bound[pid] else { throw NSError(domain:"bind first",code:3) }
   let error: AXError
   switch op {
   case "raw-press": error = AXUIElementPerformAction(c.button,kAXPressAction as CFString)
   case "raw-value": error = AXUIElementSetAttributeValue(c.field,kAXValueAttribute as CFString,(q["value"] as! String) as CFString)
   case "raw-focus": error = AXUIElementSetAttributeValue(c.field,kAXFocusedAttribute as CFString,kCFBooleanTrue)
   case "raw-main": error = AXUIElementSetAttributeValue(c.window,kAXMainAttribute as CFString,kCFBooleanTrue)
   case "raw-frontmost": error = AXUIElementSetAttributeValue(appElement(pid),kAXFrontmostAttribute as CFString,kCFBooleanTrue)
   case "raw-caret":
    var range = CFRange(location:0,length:0)
    error = AXUIElementSetAttributeValue(c.field,kAXSelectedTextRangeAttribute as CFString,AXValueCreate(.cfRange,&range)!)
   default: throw NSError(domain:"unknown raw operation",code:4)
   }
   r["axError"] = error.rawValue
  } else { throw NSError(domain:"unknown operation",code:5) }
  if let cover = q["coverPid"] as? NSNumber { r["order"] = order(pid,cover.int32Value) }
  r["endedAt"] = now(); r["frontmostPid"] = NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 0; emit(r)
 } catch { emit(["error":String(describing:error),"at":now()]) } }
}
