import AppKit
import ApplicationServices
import Foundation
import Darwin

// Independent of cua: AX geometry/visibility, CG window lists, NSWorkspace and WindowServer Spaces.
guard ProcessInfo.processInfo.environment["RUNNER_ENVIRONMENT"] == "github-hosted" else { fputs("hosted runners only\n",stderr); exit(2) }
@_silgen_name("_AXUIElementGetWindow") func windowNumber(_ element: AXUIElement, _ number: UnsafeMutablePointer<CGWindowID>) -> AXError
let sky = dlopen("/System/Library/PrivateFrameworks/SkyLight.framework/SkyLight", RTLD_LAZY)!
func symbol<T>(_ name: String, _: T.Type) -> T? { dlsym(sky, name).map { unsafeBitCast($0, to: T.self) } }
let connection = symbol("CGSMainConnectionID", (@convention(c) () -> Int32).self)?() ?? 0
let active = symbol("CGSGetActiveSpace", (@convention(c) (Int32) -> UInt64).self)
let managed = symbol("CGSCopyManagedDisplaySpaces", (@convention(c) (Int32) -> Unmanaged<CFArray>?).self)
let spaces = symbol("CGSCopySpacesForWindows", (@convention(c) (Int32, Int32, CFArray) -> Unmanaged<CFArray>?).self)
func attr(_ e: AXUIElement, _ key: String) -> CFTypeRef? { var v: CFTypeRef?; return AXUIElementCopyAttributeValue(e, key as CFString, &v) == .success ? v : nil }
func windows(_ pid: pid_t) -> [AXUIElement] { attr(AXUIElementCreateApplication(pid), kAXWindowsAttribute) as? [AXUIElement] ?? [] }
func rect(_ r: CGRect) -> [String: Double] { ["x":r.minX,"y":r.minY,"width":r.width,"height":r.height] }
func frame(_ w: AXUIElement) -> CGRect? {
  guard let p = attr(w,kAXPositionAttribute), let s = attr(w,kAXSizeAttribute), CFGetTypeID(p) == AXValueGetTypeID(), CFGetTypeID(s) == AXValueGetTypeID() else { return nil }
  var pt = CGPoint.zero; var sz = CGSize.zero
  guard AXValueGetValue(p as! AXValue,.cgPoint,&pt), AXValueGetValue(s as! AXValue,.cgSize,&sz) else { return nil }
  return CGRect(origin:pt,size:sz)
}
func info(_ pid: pid_t) -> [String: Any] {
  let app = AXUIElementCreateApplication(pid), ws = windows(pid)
  let all = CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID) as? [[String: Any]] ?? []
  let on = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] ?? []
  let top = NSScreen.screens.first?.frame.maxY ?? 0
  let screens = NSScreen.screens.map { CGRect(x:$0.frame.minX,y:top-$0.frame.maxY,width:$0.frame.width,height:$0.frame.height) }
  let front = NSWorkspace.shared.frontmostApplication
  let rows: [[String: Any]] = ws.map { w in
    var n: CGWindowID = 0; let numberResult = windowNumber(w,&n)
    let f = frame(w)
    let cg = all.first { ($0[kCGWindowNumber as String] as? UInt32) == n }
    return ["number": n, "numberResult":numberResult.rawValue, "title":attr(w,kAXTitleAttribute) as? String ?? "", "frame":f.map(rect) ?? [:],
      "overlapsDisplay":f.map { f in screens.contains { let r=$0.intersection(f); return !r.isNull && r.width>0 && r.height>0 } } ?? false,
      "minimized":attr(w,kAXMinimizedAttribute) ?? NSNull(),"fullScreen":attr(w,"AXFullScreen") ?? NSNull(),
      "cg":cg ?? [:], "inOnscreenList":on.contains { ($0[kCGWindowNumber as String] as? UInt32)==n },
      "spaces":spaces?(connection,7,[NSNumber(value:n)] as CFArray)?.takeRetainedValue() as Any? ?? NSNull()]
  }
  return ["at":Date().timeIntervalSince1970,"pid":pid,"hidden":attr(app,kAXHiddenAttribute) ?? NSNull(),"windows":rows,"screens":screens.map(rect),
    "frontmost":["pid":front?.processIdentifier ?? 0,"bundleId":front?.bundleIdentifier ?? ""],
    "activeSpace":active?(connection) as Any? ?? NSNull(),"managedDisplaySpaces":managed?(connection)?.takeRetainedValue() as Any? ?? NSNull(),
    "symbols":["active":active != nil,"managed":managed != nil,"windowSpaces":spaces != nil]]
}
func set(_ w: AXUIElement,_ key: String,_ value: CFTypeRef) -> Int32 { AXUIElementSetAttributeValue(w,key as CFString,value).rawValue }
let args = Array(CommandLine.arguments.dropFirst())
var result: [String: Any] = [:]
if args[0] == "find" {
  result = ["apps":NSRunningApplication.runningApplications(withBundleIdentifier:args[1]).map { ["pid":$0.processIdentifier,"path":$0.bundleURL?.path ?? ""] }]
} else if args[0] == "switch-left" || args[0] == "mission-control" {
  let code: CGKeyCode = args[0] == "switch-left" ? 123 : 126
  for down in [true,false] { let e=CGEvent(keyboardEventSource:nil,virtualKey:code,keyDown:down)!;e.flags = .maskControl;e.post(tap:.cghidEventTap) }
  result = ["posted":args[0]]
} else if args[0] == "activate" {
  let a=NSRunningApplication.runningApplications(withBundleIdentifier:args[1]).first
  result=["activated":a?.activate(options:[]) ?? false]
} else {
  let pid = pid_t(args[1])!
  if args[0] == "info" { result=info(pid) }
  else if args[0] == "hide" { result=["success":NSRunningApplication(processIdentifier:pid)?.hide() ?? false] }
  else if args[0] == "unhide" { result=["success":NSRunningApplication(processIdentifier:pid)?.unhideWithoutActivation() ?? false] }
  else if let w=windows(pid).first {
    switch args[0] {
    case "move": var p=CGPoint(x:Double(args[2])!,y:Double(args[3])!); result=["axResult":set(w,kAXPositionAttribute,AXValueCreate(.cgPoint,&p)!)]
    case "size": var s=CGSize(width:Double(args[2])!,height:Double(args[3])!); result=["axResult":set(w,kAXSizeAttribute,AXValueCreate(.cgSize,&s)!)]
    case "fullscreen": result=["axResult":set(w,"AXFullScreen",args[2]=="true" ? kCFBooleanTrue : kCFBooleanFalse)]
    default: result=["error":"unknown command"]
    }
  } else { result=["error":"no AX window"] }
}
let data=try JSONSerialization.data(withJSONObject:result,options:[.sortedKeys])
print(String(data:data,encoding:.utf8)!)
