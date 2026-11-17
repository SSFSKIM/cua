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
// presence:begin
// An attribute that is legitimately absent is not a failed lookup; every other AX error is.
func benign(_ error: AXError) -> Bool { error == .success || error == .attributeUnsupported || error == .noValue }
// Absence of the dialog is established only by a complete walk whose every lookup answered.
// A found button proves presence whatever else timed out; otherwise a failure leaves presence unknown (nil).
func presence(found: Bool, complete: Bool, errors: [String: Int]) -> Bool? {
 if found { return true }
 return complete && errors.isEmpty ? false : nil
}
// presence:end
struct Node {
 let element: AXUIElement; let role: String, title: String, description: String, domId: String, identifier: String, value: String
 func named(_ name: String) -> Bool { [title, description, domId, identifier].contains(name) }
}
struct Scan { var nodes: [Node] = []; var complete = true; var errors: [String: Int] = [:] }
func walk(_ root: AXUIElement) -> Scan {
 var queue = [root], i = 0, seen = Set<CFHashCode>(), scan = Scan()
 func lookup(_ e: AXUIElement, _ name: String) -> String {
  let (v, error) = copy(e, name)
  if !benign(error) { scan.errors[name + ":" + String(error.rawValue), default: 0] += 1 }
  return v as? String ?? ""
 }
 while i < queue.count && i < 1500 {
  let e = queue[i]; i += 1
  if !seen.insert(CFHash(e)).inserted { continue }
  AXUIElementSetMessagingTimeout(e, 0.2)
  scan.nodes.append(Node(element: e, role: lookup(e, kAXRoleAttribute), title: lookup(e, kAXTitleAttribute), description: lookup(e, kAXDescriptionAttribute),
   domId: lookup(e, "AXDOMIdentifier"), identifier: lookup(e, kAXIdentifierAttribute), value: lookup(e, kAXValueAttribute)))
  let (v, error) = copy(e, kAXChildrenAttribute)
  if !benign(error) { scan.complete = false; scan.errors[kAXChildrenAttribute + ":" + String(error.rawValue), default: 0] += 1 }
  if let children = v as? [AXUIElement] { queue += children }
 }
 scan.complete = scan.complete && i == queue.count
 return scan
}
func isButton(_ n: Node) -> Bool { n.role == "AXButton" && n.named("Run probe button") }
func isField(_ n: Node) -> Bool { ["AXTextField","AXSearchField","AXTextArea"].contains(n.role) && (n.named("Probe search") || n.named("search")) }
struct Controls { let window: AXUIElement; let button: AXUIElement; let field: AXUIElement }
var bound: [pid_t: Controls] = [:]
func bind(_ pid: pid_t) throws -> Controls {
 guard let w = window(pid) else { throw NSError(domain: "no owned window", code: 1) }
 let scan = walk(w)
 guard scan.complete, let b = scan.nodes.first(where: isButton), let f = scan.nodes.first(where: isField) else {
  let labels = scan.nodes.map { $0.role + " " + $0.title + " " + $0.description }
  throw NSError(domain: "controls missing: " + labels.joined(separator: " | "), code: 2)
 }
 let c = Controls(window: w, button: b.element, field: f.element); bound[pid] = c; return c
}
func read(_ pid: pid_t) -> [String: Any] {
 guard let c = bound[pid] else { return ["dialog":NSNull(), "error":"unbound AX controls"] }
 let started = now(), scan = walk(c.window)
 let b = scan.nodes.first(where: isButton), f = scan.nodes.first(where: isField)
 let marker = scan.nodes.flatMap { [$0.value, $0.title] }.first { $0.hasPrefix("Press marker ") }.flatMap { Int($0.dropFirst("Press marker ".count)) }
 return ["startedAt":started,"at":now(),"complete":scan.complete,"dialog":presence(found: b != nil, complete: scan.complete, errors: scan.errors) as Any? ?? NSNull(),
         "axErrors":scan.errors,"marker":marker as Any? ?? NSNull(),"value":f.flatMap { attr($0.element,kAXValueAttribute) as? String } as Any? ?? NSNull(),
         "fieldFocused":f.flatMap { attr($0.element,kAXFocusedAttribute) as? Bool } as Any? ?? NSNull(),
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
func rect(_ e: AXUIElement) -> CGRect? {
 guard let pv = attr(e,kAXPositionAttribute), CFGetTypeID(pv) == AXValueGetTypeID(),
       let sv = attr(e,kAXSizeAttribute), CFGetTypeID(sv) == AXValueGetTypeID() else { return nil }
 var p = CGPoint.zero, s = CGSize.zero
 guard AXValueGetValue(pv as! AXValue,.cgPoint,&p), AXValueGetValue(sv as! AXValue,.cgSize,&s) else { return nil }
 return CGRect(origin:p,size:s)
}
func wireRect(_ r: CGRect) -> [String:Double] { ["x":r.minX,"y":r.minY,"width":r.width,"height":r.height] }
func geometry(_ pid: pid_t) -> [String:Any] {
 guard let c = bound[pid] else { return [:] }
 let scan = walk(c.window), web = scan.nodes.first { $0.role == "AXWebArea" }
 let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly,.excludeDesktopElements],kCGNullWindowID) as? [[String:Any]] ?? []
 let owned = list.filter { ($0[kCGWindowOwnerPID as String] as? Int) == Int(pid) && ($0[kCGWindowLayer as String] as? Int) == 0 }
 return ["windowFrame":rect(c.window).map(wireRect) as Any? ?? NSNull(),
         "webAreaFrame":web.flatMap { rect($0.element) }.map(wireRect) as Any? ?? NSNull(),
         "screenFrame":wireRect(CGDisplayBounds(CGMainDisplayID())),
         "windows":owned.map { ["id":$0[kCGWindowNumber as String] as Any? ?? NSNull(),"bounds":$0[kCGWindowBounds as String] as Any? ?? NSNull()] }]
}
// Window effects without traversing the renderer AX tree (the no-observation arm).
func statusGeometry(_ pid: pid_t, wanted: Int?) -> [String:Any] {
 let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly,.excludeDesktopElements],kCGNullWindowID) as? [[String:Any]] ?? []
 let owned = list.filter { ($0[kCGWindowOwnerPID as String] as? Int) == Int(pid) && ($0[kCGWindowLayer as String] as? Int) == 0 }
 let chosen = wanted.flatMap { id in owned.first { ($0[kCGWindowNumber as String] as? Int) == id } } ?? (wanted == nil ? owned.first : nil)
 let bounds = (chosen?[kCGWindowBounds as String] as? [String:Any]).flatMap { CGRect(dictionaryRepresentation:$0 as CFDictionary) }
 return ["windowID":chosen?[kCGWindowNumber as String] as Any? ?? NSNull(),"windowFrame":bounds.map(wireRect) as Any? ?? NSNull(),
         "screenFrame":wireRect(CGDisplayBounds(CGMainDisplayID())),
         "windows":owned.map { ["id":$0[kCGWindowNumber as String] as Any? ?? NSNull(),"bounds":$0[kCGWindowBounds as String] as Any? ?? NSNull()] }]
}
// Separate diagnostic-only cache: minimal role/name lookup, never used by qualification actions.
var diagnosticCache: [String:Controls] = [:]
func diagnosticControls(_ pid: pid_t) throws -> Controls {
 guard let w = window(pid) else { throw NSError(domain:"diagnostic window missing",code:10) }
 var queue=[w], i=0, seen=Set<CFHashCode>(), button: AXUIElement?, field: AXUIElement?
 while i < queue.count && i < 500 {
  let e=queue[i];i += 1;if !seen.insert(CFHash(e)).inserted { continue }
  AXUIElementSetMessagingTimeout(e,0.2)
  let role=text(e,kAXRoleAttribute)
  if role == kAXButtonRole || role == kAXTextFieldRole {
   let names=[text(e,kAXTitleAttribute),text(e,kAXDescriptionAttribute)]
   if role == kAXButtonRole && names.contains("Run probe button") { button=e }
   if role == kAXTextFieldRole && names.contains("Probe search") { field=e }
  }
  if let button, let field { return Controls(window:w,button:button,field:field) }
  queue += (attr(e,kAXChildrenAttribute) as? [AXUIElement]) ?? []
 }
 throw NSError(domain:"diagnostic owned controls missing",code:11)
}
func diagnosticElement(_ e: AXUIElement) -> [String:Any] {
 var values: [String:Any]=[:]
 for name in [kAXRoleAttribute,kAXTitleAttribute,kAXDescriptionAttribute,kAXIdentifierAttribute,"AXDOMIdentifier",kAXPlaceholderValueAttribute,kAXValueAttribute,kAXFocusedAttribute] {
  let (v,error)=copy(e,name)
  let value: Any = (v as? String) as Any? ?? (v as? NSNumber) as Any? ?? NSNull()
  values[name] = ["error":error.rawValue,"value":value]
 }
 var actions: CFArray?;let error=AXUIElementCopyActionNames(e,&actions);var pid: pid_t=0;AXUIElementGetPid(e,&pid)
 return ["hash":CFHash(e),"pid":pid,"attributes":values,"actions":(actions as? [String]) as Any? ?? NSNull(),"actionsError":error.rawValue]
}
func diagnosticWire(_ c: Controls) -> [String:Any] { ["button":diagnosticElement(c.button),"field":diagnosticElement(c.field)] }
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
  else if op == "bind" { _ = try bind(pid); r["ax"] = read(pid); r["geometry"] = geometry(pid) }
  else if op == "read" { r["ax"] = read(pid); if q["geometry"] as? Bool == true { r["geometry"] = geometry(pid) } }
  else if op == "read-enablement" {
   guard let name=q["attribute"] as? String, ["AXManualAccessibility","AXEnhancedUserInterface"].contains(name) else { throw NSError(domain:"enablement attribute missing",code:13) }
   let (value,error)=copy(appElement(pid),name)
   r["attribute"]=name; r["axError"]=error.rawValue; r["value"]=(value as? Bool) as Any? ?? NSNull()
  }
  else if op == "cache-diagnostic" { let c=try diagnosticControls(pid);let key=String(pid)+":"+(q["cacheName"] as? String ?? "early");diagnosticCache[key]=c;r["cached"]=diagnosticWire(c) }
  else if op == "cached-diagnostic" {
   // Read-only: the cached refs' own attributes and action names, with no fresh walk and no action dispatched.
   let key=String(pid)+":"+(q["cacheName"] as? String ?? "early")
   guard let cached=diagnosticCache[key] else { throw NSError(domain:"diagnostic cache missing",code:12) }
   r["cached"]=diagnosticWire(cached)
  }
  else if op == "compare-diagnostic" {
   let key=String(pid)+":"+(q["cacheName"] as? String ?? "early")
   guard let cached=diagnosticCache[key] else { throw NSError(domain:"diagnostic cache missing",code:12) }
   r["cached"]=diagnosticWire(cached)
   do { let fresh=try diagnosticControls(pid);r["fresh"]=diagnosticWire(fresh);r["buttonEqual"]=CFEqual(cached.button,fresh.button);r["fieldEqual"]=CFEqual(cached.field,fresh.field) }
   catch { r["freshError"]=String(describing:error) }
  }
  else if op == "forget" { bound.removeValue(forKey:pid); diagnosticCache = diagnosticCache.filter { !$0.key.hasPrefix(String(pid)+":") }; r["ok"] = true }
  else if op == "status" { r["geometry"] = statusGeometry(pid,wanted:(q["windowID"] as? NSNumber)?.intValue) }
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
