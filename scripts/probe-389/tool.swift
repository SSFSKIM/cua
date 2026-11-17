import AppKit
import ApplicationServices
import Foundation
func emit(_ v: [String: Any]) { let b = try! JSONSerialization.data(withJSONObject:v,options:[.sortedKeys]); print(String(data:b,encoding:.utf8)!); fflush(stdout) }
func windows(_ pid: Int32) -> [[String:Any]] { (CGWindowListCopyWindowInfo([.optionOnScreenOnly,.excludeDesktopElements],kCGNullWindowID) as? [[String:Any]] ?? []).filter { ($0[kCGWindowLayer as String] as? Int) == 0 && ($0[kCGWindowOwnerPID as String] as? Int) == Int(pid) }.map { ["id":$0[kCGWindowNumber as String]!,"bounds":$0[kCGWindowBounds as String]!] } }
guard ProcessInfo.processInfo.environment["RUNNER_ENVIRONMENT"] == "github-hosted" else { fatalError("hosted only") }
if CommandLine.arguments.contains("--cover") {
 let app=NSApplication.shared; app.setActivationPolicy(.regular)
 let w=NSWindow(contentRect:NSRect(x:1400,y:80,width:300,height:400),styleMask:[.titled,.closable],backing:.buffered,defer:false)
 w.title="probe389 owned cover"; w.makeKeyAndOrderFront(nil); app.activate(ignoringOtherApps:true)
 emit(["pid":ProcessInfo.processInfo.processIdentifier]); app.run()
} else {
 while let line=readLine() { do {
  let q=try JSONSerialization.jsonObject(with:Data(line.utf8)) as! [String:Any], pid=(q["pid"] as? NSNumber)?.int32Value ?? 0
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
