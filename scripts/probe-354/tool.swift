import AppKit
import ApplicationServices
import Foundation
setvbuf(stdout,nil,_IOFBF,1<<20)
func now()->Double { Date().timeIntervalSince1970*1000 }
func attr(_ e:AXUIElement,_ name:String)->CFTypeRef? {var v:CFTypeRef?;return AXUIElementCopyAttributeValue(e,name as CFString,&v) == .success ? v:nil}
func el(_ v:CFTypeRef?)->AXUIElement? {guard let v,CFGetTypeID(v)==AXUIElementGetTypeID() else{return nil};let e=v as! AXUIElement;AXUIElementSetMessagingTimeout(e,0.5);return e}
func children(_ e:AXUIElement)->[AXUIElement] {(attr(e,kAXChildrenAttribute) as? [AnyObject] ?? []).compactMap {el($0 as CFTypeRef)}}
func role(_ e:AXUIElement)->String {attr(e,kAXRoleAttribute) as? String ?? ""}
func field(_ pid:pid_t,focusedOnly:Bool,allowTextEditFallback:Bool)->(AXUIElement,String)? {
 let app=AXUIElementCreateApplication(pid);AXUIElementSetMessagingTimeout(app,0.5)
 if let f=el(attr(app,kAXFocusedUIElementAttribute)) {
  if focusedOnly || ["AXTextArea","AXTextField"].contains(role(f)) {return (f,"focused")}
 }
 // Only the native TextEdit control may use a tree fallback. Browser calibrations never do.
 guard !focusedOnly,allowTextEditFallback,NSRunningApplication(processIdentifier:pid)?.bundleIdentifier == "com.apple.TextEdit" else{return nil}
 var q=children(app),i=0
 while i<q.count && i<1000 {let e=q[i];i+=1;if role(e)=="AXTextArea" {return (e,"TextEdit-bfs")};q+=children(e)}
 return nil
}
func state(_ e:AXUIElement,_ source:String)->[String:Any] {
 var range:[Int]?
 if let v=attr(e,kAXSelectedTextRangeAttribute),CFGetTypeID(v)==AXValueGetTypeID(){var r=CFRange();if AXValueGetValue(v as! AXValue,.cfRange,&r){range=[r.location,r.length]}}
 let text=attr(e,kAXValueAttribute) as? String
 return ["text":text as Any? ?? NSNull(),"selection":range as Any? ?? NSNull(),"readable":text != nil && range != nil,"role":role(e),"source":source,"at":now(),"frontmostPid":NSWorkspace.shared.frontmostApplication?.processIdentifier as Any? ?? NSNull()]
}
while let line=readLine(){do{
 let q=try JSONSerialization.jsonObject(with:Data(line.utf8)) as! [String:Any]
 let pid=(q["pid"] as? NSNumber)?.int32Value ?? 0,op=q["op"] as? String ?? ""
 var answer:[String:Any]=["startedAt":now()]
 if op=="clip" {NSPasteboard.general.clearContents();answer["ok"]=NSPasteboard.general.setString(q["text"] as! String,forType:.string)}
 else if op=="front" {
  let deadline=Date().addingTimeInterval(2)
  answer["activationAccepted"]=NSRunningApplication(processIdentifier:pid)?.activate(options:[]) ?? false
  while NSWorkspace.shared.frontmostApplication?.processIdentifier != pid && Date()<deadline {RunLoop.current.run(until:Date().addingTimeInterval(0.01))}
  let actual=NSWorkspace.shared.frontmostApplication?.processIdentifier
  answer["frontmostPid"]=actual as Any? ?? NSNull();answer["ok"]=actual==pid
  if actual != pid {answer["error"]="target did not become foreground"}
 }
 else if let (f,source)=field(pid,focusedOnly:op=="focused",allowTextEditFallback:q["allowTextEditFallback"] as? Bool ?? false) {
  if op=="reset" {let text=q["text"] as! String;answer["setValue"]=AXUIElementSetAttributeValue(f,kAXValueAttribute as CFString,text as CFString).rawValue;answer["focus"]=AXUIElementSetAttributeValue(f,kAXFocusedAttribute as CFString,kCFBooleanTrue).rawValue}
  if let s=q["range"] as? [Int],s.count==2 {var r=CFRange(location:s[0],length:s[1]);answer["setRange"]=AXUIElementSetAttributeValue(f,kAXSelectedTextRangeAttribute as CFString,AXValueCreate(.cfRange,&r)!).rawValue}
  answer["state"]=state(f,source)
 }else{answer["error"]=op=="focused" ? "no focused AX element" : "no field"}
 answer["endedAt"]=now()
 print(String(data:try JSONSerialization.data(withJSONObject:answer,options:[.sortedKeys]),encoding:.utf8)!);fflush(stdout)
 }catch{print("{\"error\":\"bad request\"}");fflush(stdout)}
}
