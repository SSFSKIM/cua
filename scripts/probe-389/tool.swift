import AppKit
import ApplicationServices
import Foundation
func emit(_ v: [String: Any]) { let b = try! JSONSerialization.data(withJSONObject:v,options:[.sortedKeys]); print(String(data:b,encoding:.utf8)!); fflush(stdout) }
func windows(_ pid: Int32) -> [[String:Any]] { (CGWindowListCopyWindowInfo([.optionOnScreenOnly,.excludeDesktopElements],kCGNullWindowID) as? [[String:Any]] ?? []).filter { ($0[kCGWindowLayer as String] as? Int) == 0 && ($0[kCGWindowOwnerPID as String] as? Int) == Int(pid) }.map { ["id":$0[kCGWindowNumber as String]!,"bounds":$0[kCGWindowBounds as String]!] } }
// Native open/save panel (panel-roundtrip cohort). Only a process whose executable is AppKit's own openAndSavePanelService is ever read or acted on.
let panelServiceName = "com.apple.appkit.xpc.openAndSavePanelService"
func executablePath(_ pid: Int32) -> String? { var buf = [CChar](repeating: 0, count: 4096); return proc_pidpath(pid, &buf, UInt32(buf.count)) > 0 ? String(cString: buf) : nil }
func isPanelService(_ pid: Int32) -> Bool { if let path = executablePath(pid) { return path.hasPrefix("/System/") && path.contains(panelServiceName) }; return false }
// Every process is enumerated and filtered by its executable path; no app or window naming is trusted.
func panelServicePids() -> [Int32] {
  let n = proc_listallpids(nil, 0); guard n > 0 else { return [] }
  var all = [Int32](repeating: 0, count: Int(n) + 64)
  let got = proc_listallpids(&all, Int32(all.count * MemoryLayout<Int32>.size)); guard got > 0 else { return [] }
  return all.prefix(Int(got)).filter { $0 > 0 && isPanelService($0) }.sorted()
}
func axString(_ e: AXUIElement, _ attribute: String) -> String? { var v: CFTypeRef?; return AXUIElementCopyAttributeValue(e,attribute as CFString,&v) == .success ? v as? String : nil }
func axChildren(_ e: AXUIElement) -> [AXUIElement] { var v: CFTypeRef?; return AXUIElementCopyAttributeValue(e,kAXChildrenAttribute as CFString,&v) == .success ? (v as? [AXUIElement] ?? []) : [] }
func axEnabled(_ e: AXUIElement) -> Bool { var v: CFTypeRef?; return AXUIElementCopyAttributeValue(e,kAXEnabledAttribute as CFString,&v) == .success ? (v as? Bool ?? false) : false }
// The chooser's accessibility tree is served by the panel service but hangs under the requesting app's window, so it is read from that
// app's own AX windows (read only). AXWebArea subtrees are skipped. A Cancel button counts only when its owning process is a strictly
// validated panel service. Bounded by depth and node count; visited elements are not walked twice.
func rootScan(_ rootPid: Int32) -> (windows: [[String:Any]], nodes: Int, cancels: [(element: AXUIElement, owner: Int32, enabled: Bool)], otherCancels: Int) {
  let app = AXUIElementCreateApplication(rootPid); AXUIElementSetMessagingTimeout(app, 2)
  var v: CFTypeRef?; var wins: [AXUIElement] = []
  if AXUIElementCopyAttributeValue(app,kAXWindowsAttribute as CFString,&v) == .success { wins = v as? [AXUIElement] ?? [] }
  var nodes = 0, other = 0; var seen = Set<CFHashCode>()
  var cancels: [(element: AXUIElement, owner: Int32, enabled: Bool)] = []
  func walk(_ e: AXUIElement, _ depth: Int) {
    guard nodes < 4000, seen.insert(CFHash(e)).inserted else { return }
    nodes += 1
    let role = axString(e,kAXRoleAttribute as String)
    if role == "AXWebArea" { return }
    if role == "AXButton" && axString(e,kAXTitleAttribute as String) == "Cancel" {
      var owner: pid_t = 0
      if AXUIElementGetPid(e,&owner) == .success, isPanelService(owner) { cancels.append((e, owner, axEnabled(e))) } else { other += 1 }
    }
    if depth < 14 { for c in axChildren(e) { walk(c, depth+1) } }
  }
  for w in wins { walk(w, 0) }
  return (wins.map { ["role":axString($0,kAXRoleAttribute as String) ?? "","subrole":axString($0,kAXSubroleAttribute as String) ?? "","title":axString($0,kAXTitleAttribute as String) ?? ""] }, nodes, cancels, other)
}
// Diagnostics only, never acted on: the panel service processes found by path and their own windows.
func serviceDiagnostics() -> [[String:Any]] {
  let all = CGWindowListCopyWindowInfo([.optionAll],kCGNullWindowID) as? [[String:Any]] ?? []
  return panelServicePids().map { pid in
    let app = AXUIElementCreateApplication(pid); AXUIElementSetMessagingTimeout(app, 2)
    var v: CFTypeRef?; var wins: [AXUIElement] = []
    if AXUIElementCopyAttributeValue(app,kAXWindowsAttribute as CFString,&v) == .success { wins = v as? [AXUIElement] ?? [] }
    let cg = all.filter { ($0[kCGWindowOwnerPID as String] as? Int) == Int(pid) }.map { ["id":$0[kCGWindowNumber as String] ?? 0,"name":$0[kCGWindowName as String] ?? "","layer":$0[kCGWindowLayer as String] ?? 0,"onscreen":$0[kCGWindowIsOnscreen as String] ?? false,"bounds":$0[kCGWindowBounds as String] ?? [:]] as [String:Any] }
    return ["pid":pid,"executable":executablePath(pid) ?? "","cgWindows":cg,"ownAXWindows":wins.count] as [String:Any]
  }
}
func panelStatus(_ rootPid: Int32) -> [String:Any] {
  let scan = rootScan(rootPid)
  var byOwner: [Int32:(total: Int, enabled: Int)] = [:]
  for c in scan.cancels { var t = byOwner[c.owner] ?? (0,0); t.total += 1; if c.enabled { t.enabled += 1 }; byOwner[c.owner] = t }
  let panels = byOwner.keys.sorted().map { ["pid":$0,"executable":executablePath($0) ?? "","cancelButtons":byOwner[$0]!.total,"cancelEnabled":byOwner[$0]!.enabled] as [String:Any] }
  return ["at":Date().timeIntervalSince1970*1000,"rootPid":rootPid,"panels":panels,"walkedNodes":scan.nodes,"rootWindows":scan.windows,"cancelNotOwnedByPanelService":scan.otherCancels,"services":serviceDiagnostics()]
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
  let rootPid = (q["rootPid"] as? NSNumber)?.int32Value ?? 0
  if q["op"] as? String == "panel-status" { guard rootPid > 0 else { emit(["error":"rootPid required"]); continue }; emit(panelStatus(rootPid)); continue }
  if q["op"] as? String == "cancel-panel" {
   // Acts only on the single enabled Cancel button, found under the root app's windows, whose owning process is the named validated panel service.
   guard rootPid > 0, isPanelService(pid) else { emit(["error":"rootPid required and pid \(pid) must be the AppKit open/save panel service"]); continue }
   let enabled = rootScan(rootPid).cancels.filter { $0.enabled && $0.owner == pid }
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
