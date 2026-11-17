import AppKit
import ApplicationServices
import Foundation
func now()->Double { Date().timeIntervalSince1970*1000 }
func emit(_ q:[String:Any]) { let d=try! JSONSerialization.data(withJSONObject:q,options:[.sortedKeys]); print(String(data:d,encoding:.utf8)!);fflush(stdout) }
func attr(_ e:AXUIElement,_ n:String)->CFTypeRef? {var v:CFTypeRef?;return AXUIElementCopyAttributeValue(e,n as CFString,&v) == .success ? v:nil}
func title(_ pid:pid_t)->String? {let a=AXUIElementCreateApplication(pid);AXUIElementSetMessagingTimeout(a,0.2);guard let w=(attr(a,kAXWindowsAttribute) as? [AXUIElement])?.first else{return nil};return attr(w,kAXTitleAttribute) as? String}
func status(_ pid:pid_t,_ cover:pid_t)->[String:Any] {
 let ws=(CGWindowListCopyWindowInfo([.optionOnScreenOnly,.excludeDesktopElements],kCGNullWindowID) as? [[String:Any]] ?? []).filter {($0[kCGWindowLayer as String] as? Int) == 0}
 let ti=ws.firstIndex{($0[kCGWindowOwnerPID as String] as? Int) == Int(pid)},ci=ws.firstIndex{($0[kCGWindowOwnerPID as String] as? Int) == Int(cover)}
 return ["at":now(),"frontmostPid":NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 0,"order":["targetAboveCover":ti.flatMap{t in ci.map{t<$0}} as Any? ?? NSNull()],"windows":ws.map{["id":$0[kCGWindowNumber as String] as Any? ?? NSNull(),"pid":$0[kCGWindowOwnerPID as String] as Any? ?? NSNull(),"bounds":$0[kCGWindowBounds as String] as Any? ?? NSNull()]}]
}
guard ProcessInfo.processInfo.environment["RUNNER_ENVIRONMENT"] == "github-hosted" else {fatalError("hosted only")}
if CommandLine.arguments.contains("--cover") {
 let app=NSApplication.shared;app.setActivationPolicy(.regular)
 let w=NSWindow(contentRect:NSRect(x:0,y:0,width:1100,height:1000),styleMask:[.titled],backing:.buffered,defer:false)
 w.title="probe390 owned cover";if let screen=NSScreen.main {w.setFrame(screen.frame,display:true)};w.makeKeyAndOrderFront(nil);app.activate(ignoringOtherApps:true);emit(["pid":ProcessInfo.processInfo.processIdentifier]);app.run()
} else {
 while let line=readLine(){do{
  let q=try JSONSerialization.jsonObject(with:Data(line.utf8)) as! [String:Any],op=q["op"] as? String ?? "",pid=(q["pid"] as? NSNumber)?.int32Value ?? 0,cover=(q["coverPid"] as? NSNumber)?.int32Value ?? 0
  var r:[String:Any]=[:]
  if op == "front" {
   r["accepted"]=NSRunningApplication(processIdentifier:pid)?.activate(options:[]) ?? false
   let deadline=now()+3000
   while NSWorkspace.shared.frontmostApplication?.processIdentifier != pid && now()<deadline {RunLoop.current.run(until:Date().addingTimeInterval(0.01))}
  } else if op == "title" {r["title"]=title(pid) as Any? ?? NSNull()}
  else if op == "lookup" {r["pid"]=NSRunningApplication.runningApplications(withBundleIdentifier:q["bundle"] as! String).first?.processIdentifier as Any? ?? NSNull()}
  else if op != "status" {throw NSError(domain:"unknown helper operation",code:1)}
  r.merge(status(pid,cover)){a,b in b};emit(r)
 } catch {emit(["error":String(describing:error)])}}
}
