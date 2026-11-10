import AppKit
import ApplicationServices
import Foundation
setvbuf(stdout,nil,_IOFBF,1<<20)
func attr(_ e: AXUIElement,_ name: String)->CFTypeRef? { var v:CFTypeRef?;return AXUIElementCopyAttributeValue(e,name as CFString,&v) == .success ? v:nil }
func el(_ v:CFTypeRef?)->AXUIElement? { guard let v,CFGetTypeID(v)==AXUIElementGetTypeID() else{return nil};let e=v as! AXUIElement;AXUIElementSetMessagingTimeout(e,0.5);return e }
func children(_ e:AXUIElement)->[AXUIElement] { (attr(e,kAXChildrenAttribute) as? [AnyObject] ?? []).compactMap {el($0 as CFTypeRef)} }
func role(_ e:AXUIElement)->String {attr(e,kAXRoleAttribute) as? String ?? ""}
func field(_ pid:pid_t)->AXUIElement? {let app=AXUIElementCreateApplication(pid);if let f=el(attr(app,kAXFocusedUIElementAttribute)),["AXTextArea","AXTextField"].contains(role(f)){return f};var q=children(app),i=0;while i<q.count && i<1000 {let e=q[i];i+=1;if role(e)=="AXTextArea"{return e};q+=children(e)};return nil}
func state(_ e:AXUIElement)->[String:Any] {var range:Any=NSNull();if let v=attr(e,kAXSelectedTextRangeAttribute),CFGetTypeID(v)==AXValueGetTypeID(){var r=CFRange();if AXValueGetValue(v as! AXValue,.cfRange,&r){range=[r.location,r.length]}};return ["text":attr(e,kAXValueAttribute) as? String ?? "", "selection":range,"role":role(e),"at":Date().timeIntervalSince1970*1000]}
while let line=readLine(){do{let q=try JSONSerialization.jsonObject(with:Data(line.utf8)) as! [String:Any];let pid=(q["pid"] as? NSNumber)?.int32Value ?? 0;let op=q["op"] as? String ?? "";var answer:[String:Any]=[:]
if op=="clip" {NSPasteboard.general.clearContents();answer["ok"]=NSPasteboard.general.setString(q["text"] as! String,forType:.string)}
else if let f=field(pid){if op=="reset" {let text=q["text"] as! String;answer["setValue"]=AXUIElementSetAttributeValue(f,kAXValueAttribute as CFString,text as CFString).rawValue;answer["focus"]=AXUIElementSetAttributeValue(f,kAXFocusedAttribute as CFString,kCFBooleanTrue).rawValue};if let s=q["range"] as? [Int],s.count==2 {var r=CFRange(location:s[0],length:s[1]);answer["setRange"]=AXUIElementSetAttributeValue(f,kAXSelectedTextRangeAttribute as CFString,AXValueCreate(.cfRange,&r)!).rawValue};answer["state"]=state(f)}else{answer["error"]="no field"}
print(String(data:try JSONSerialization.data(withJSONObject:answer,options:[.sortedKeys]),encoding:.utf8)!);fflush(stdout)
}catch{print("{\"error\":\"bad request\"}");fflush(stdout)}}
