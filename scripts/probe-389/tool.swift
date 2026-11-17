import AppKit
import ApplicationServices
import Foundation
func emit(_ v: [String: Any]) { let b = try! JSONSerialization.data(withJSONObject:v,options:[.sortedKeys]); print(String(data:b,encoding:.utf8)!); fflush(stdout) }
func windows(_ pid: Int32) -> [[String:Any]] { (CGWindowListCopyWindowInfo([.optionOnScreenOnly,.excludeDesktopElements],kCGNullWindowID) as? [[String:Any]] ?? []).filter { ($0[kCGWindowLayer as String] as? Int) == 0 && ($0[kCGWindowOwnerPID as String] as? Int) == Int(pid) }.map { ["id":$0[kCGWindowNumber as String]!,"bounds":$0[kCGWindowBounds as String]!] } }
// Native open/save panel (panel-roundtrip cohort). Only a process whose executable is AppKit's own openAndSavePanelService is ever read or acted on.
let panelServiceName = "com.apple.appkit.xpc.openAndSavePanelService"
func executablePath(_ pid: Int32) -> String? { var buf = [CChar](repeating: 0, count: 4096); return proc_pidpath(pid, &buf, UInt32(buf.count)) > 0 ? String(cString: buf) : nil }
func isPanelService(_ pid: Int32) -> Bool { if let path = executablePath(pid) { return path.hasPrefix("/System/") && path.contains(panelServiceName) }; return false }
func panelServicePids() -> [Int32] {
  var pids = Set(NSWorkspace.shared.runningApplications.filter { $0.bundleIdentifier == panelServiceName }.map { $0.processIdentifier })
  for w in (CGWindowListCopyWindowInfo([.optionAll],kCGNullWindowID) as? [[String:Any]] ?? []) where ((w[kCGWindowOwnerName as String] as? String) ?? "").lowercased().contains("open and save panel") { if let p = w[kCGWindowOwnerPID as String] as? Int { pids.insert(Int32(p)) } }
  return pids.filter(isPanelService).sorted()
}
func axString(_ e: AXUIElement, _ attribute: String) -> String? { var v: CFTypeRef?; return AXUIElementCopyAttributeValue(e,attribute as CFString,&v) == .success ? v as? String : nil }
func axChildren(_ e: AXUIElement) -> [AXUIElement] { var v: CFTypeRef?; return AXUIElementCopyAttributeValue(e,kAXChildrenAttribute as CFString,&v) == .success ? (v as? [AXUIElement] ?? []) : [] }
func axEnabled(_ e: AXUIElement) -> Bool { var v: CFTypeRef?; return AXUIElementCopyAttributeValue(e,kAXEnabledAttribute as CFString,&v) == .success ? (v as? Bool ?? false) : false }
// Every AXButton titled Cancel under the service's windows, with whether it is enabled.
func cancelButtons(_ pid: Int32) -> (axWindows: [[String:Any]], buttons: [(element: AXUIElement, enabled: Bool)]) {
  let app = AXUIElementCreateApplication(pid); AXUIElementSetMessagingTimeout(app, 2)
  var v: CFTypeRef?; var wins: [AXUIElement] = []
  if AXUIElementCopyAttributeValue(app,kAXWindowsAttribute as CFString,&v) == .success { wins = v as? [AXUIElement] ?? [] }
  var found: [(element: AXUIElement, enabled: Bool)] = []
  func walk(_ e: AXUIElement, _ depth: Int) {
    if axString(e,kAXRoleAttribute as String) == "AXButton" && axString(e,kAXTitleAttribute as String) == "Cancel" { found.append((e, axEnabled(e))) }
    if depth < 12 { for c in axChildren(e) { walk(c, depth+1) } }
  }
  for w in wins { walk(w, 0) }
  return (wins.map { ["role":axString($0,kAXRoleAttribute as String) ?? "","subrole":axString($0,kAXSubroleAttribute as String) ?? "","title":axString($0,kAXTitleAttribute as String) ?? ""] }, found)
}
func panelStatus() -> [[String:Any]] {
  let all = CGWindowListCopyWindowInfo([.optionAll],kCGNullWindowID) as? [[String:Any]] ?? []
  return panelServicePids().map { pid in
    let scan = cancelButtons(pid)
    let cg = all.filter { ($0[kCGWindowOwnerPID as String] as? Int) == Int(pid) }.map { ["id":$0[kCGWindowNumber as String] ?? 0,"name":$0[kCGWindowName as String] ?? "","layer":$0[kCGWindowLayer as String] ?? 0,"onscreen":$0[kCGWindowIsOnscreen as String] ?? false,"bounds":$0[kCGWindowBounds as String] ?? [:]] as [String:Any] }
    return ["pid":pid,"executable":executablePath(pid) ?? "","cgWindows":cg,"axWindows":scan.axWindows,"cancelButtons":scan.buttons.count,"cancelEnabled":scan.buttons.filter { $0.enabled }.count] as [String:Any]
  }
}

guard ProcessInfo.processInfo.environment["RUNNER_ENVIRONMENT"] == "github-hosted" else { fatalError("hosted only") }
if CommandLine.arguments.contains("--cover") {
 let app=NSApplication.shared; app.setActivationPolicy(.regular)
 let w=NSWindow(contentRect:NSRect(x:1400,y:80,width:300,height:400),styleMask:[.titled,.closable],backing:.buffered,defer:false)
 w.title="probe389 owned cover"; w.makeKeyAndOrderFront(nil); app.activate(ignoringOtherApps:true)
 emit(["pid":ProcessInfo.processInfo.processIdentifier]); app.run()
} else {
 while let line=readLine() { do {
  let q=try JSONSerialization.jsonObject(with:Data(line.utf8)) as! [String:Any], pid=(q["pid"] as? NSNumber)?.int32Value ?? 0
  if q["op"] as? String == "panel-status" { emit(["at":Date().timeIntervalSince1970*1000,"panels":panelStatus()]); continue }
  if q["op"] as? String == "cancel-panel" {
   // Acts only on the one validated panel service the caller names, and only on its single enabled Cancel button.
   guard isPanelService(pid) else { emit(["error":"pid \(pid) is not the AppKit open/save panel service"]); continue }
   let enabled = cancelButtons(pid).buttons.filter { $0.enabled }
   guard enabled.count == 1 else { emit(["error":"expected exactly one enabled Cancel, found \(enabled.count)"]); continue }
   let result = AXUIElementPerformAction(enabled[0].element, kAXPressAction as CFString)
   emit(["at":Date().timeIntervalSince1970*1000,"pid":pid,"pressError":result.rawValue]); continue
  }
  if q["op"] as? String == "front" { _=NSRunningApplication(processIdentifier:pid)?.activate(options:[]); let end=Date().addingTimeInterval(3); while NSWorkspace.shared.frontmostApplication?.processIdentifier != pid && Date()<end { RunLoop.current.run(until:Date().addingTimeInterval(0.01)) } }
  if q["op"] as? String == "cover" {
   let app=AXUIElementCreateApplication(pid); var v:CFTypeRef?
   if AXUIElementCopyAttributeValue(app,kAXWindowsAttribute as CFString,&v) == .success, let w=(v as? [AXUIElement])?.first {
    var point=CGPoint(x:(q["wide"] as? Bool == true ? 20:1400),y:50), size=CGSize(width:(q["wide"] as? Bool == true ? 1300:300),height:(q["wide"] as? Bool == true ? 950:400))
    _=AXUIElementSetAttributeValue(w,kAXPositionAttribute as CFString,AXValueCreate(.cgPoint,&point)!); _=AXUIElementSetAttributeValue(w,kAXSizeAttribute as CFString,AXValueCreate(.cgSize,&size)!)
   }
  }
  emit(["at":Date().timeIntervalSince1970*1000,"frontmostPid":NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 0,"windows":windows(pid)])
 } catch { emit(["error":String(describing:error)]) } }
}
