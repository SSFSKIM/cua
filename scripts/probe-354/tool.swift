import AppKit
import ApplicationServices
import Foundation
setvbuf(stdout,nil,_IOFBF,1<<20)
func now()->Double { Date().timeIntervalSince1970*1000 }
func attr(_ e:AXUIElement,_ name:String)->CFTypeRef? {var v:CFTypeRef?;return AXUIElementCopyAttributeValue(e,name as CFString,&v) == .success ? v:nil}
func el(_ v:CFTypeRef?)->AXUIElement? {guard let v,CFGetTypeID(v)==AXUIElementGetTypeID() else{return nil};let e=v as! AXUIElement;AXUIElementSetMessagingTimeout(e,0.5);return e}
func children(_ e:AXUIElement)->[AXUIElement] {(attr(e,kAXChildrenAttribute) as? [AnyObject] ?? []).compactMap {el($0 as CFTypeRef)}}
func role(_ e:AXUIElement)->String {attr(e,kAXRoleAttribute) as? String ?? ""}
var retainedTextEdit:[pid_t:(path:String,element:AXUIElement)]=[:]
func matchesDocument(_ document:String?,_ title:String?,path:String)->Bool {
 let expected=URL(fileURLWithPath:path).standardizedFileURL
 if let document,!document.isEmpty {
  if let url=URL(string:document),url.isFileURL {return url.standardizedFileURL.path==expected.path}
  if document.hasPrefix("/") {return URL(fileURLWithPath:document).standardizedFileURL.path==expected.path}
  return false
 }
 return title==expected.lastPathComponent || title?.hasPrefix(expected.lastPathComponent+" —")==true
}
func documentMatches(_ window:AXUIElement,path:String)->Bool {matchesDocument(attr(window,kAXDocumentAttribute) as? String,attr(window,kAXTitleAttribute) as? String,path:path)}
func textControl(_ e:AXUIElement)->Bool {role(e)=="AXTextArea"}
func field(_ pid:pid_t,focusedOnly:Bool,allowTextEditFallback:Bool,documentPath:String?)->(AXUIElement,String)? {
 let app=AXUIElementCreateApplication(pid);AXUIElementSetMessagingTimeout(app,0.5)
 // The candidate oracle always reads the actual focused element, never the retained ground-truth control.
 if focusedOnly {return el(attr(app,kAXFocusedUIElementAttribute)).map {($0,"focused")}}
 guard allowTextEditFallback,let documentPath,NSRunningApplication(processIdentifier:pid)?.bundleIdentifier == "com.apple.TextEdit" else{return nil}
 let path=URL(fileURLWithPath:documentPath).standardizedFileURL.path
 if let kept=retainedTextEdit[pid],kept.path==path,textControl(kept.element) {return (kept.element,"TextEdit-retained")}
 retainedTextEdit.removeValue(forKey:pid)
 if let f=el(attr(app,kAXFocusedUIElementAttribute)),textControl(f),let window=el(attr(f,kAXWindowAttribute)),documentMatches(window,path:path) {
  retainedTextEdit[pid]=(path,f);return (f,"TextEdit-focused-bound")
 }
 // AXChildren on the application can disappear after an emptying cut. Search only the named document's windows.
 var windows=(attr(app,kAXWindowsAttribute) as? [AnyObject] ?? []).compactMap {el($0 as CFTypeRef)}
 if let window=el(attr(app,kAXFocusedWindowAttribute)) {windows.append(window)}
 for window in windows where documentMatches(window,path:path) {
  var q=children(window),i=0
  while i<q.count && i<1000 {let e=q[i];i+=1;if textControl(e) {retainedTextEdit[pid]=(path,e);return (e,"TextEdit-document-bfs")};q+=children(e)}
 }
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
  let activate=q["activate"] as? Bool ?? true;answer["activationRequested"]=activate
  if activate {answer["activationAccepted"]=NSRunningApplication(processIdentifier:pid)?.activate(options:[]) ?? false}
  while NSWorkspace.shared.frontmostApplication?.processIdentifier != pid && Date()<deadline {RunLoop.current.run(until:Date().addingTimeInterval(0.01))}
  let actual=NSWorkspace.shared.frontmostApplication?.processIdentifier
  answer["frontmostPid"]=actual as Any? ?? NSNull();answer["ok"]=actual==pid
  if actual != pid {answer["error"]="target did not become foreground"}
 }
 else if let (f,source)=field(pid,focusedOnly:op=="focused",allowTextEditFallback:q["allowTextEditFallback"] as? Bool ?? false,documentPath:q["documentPath"] as? String) {
  if op=="reset" {let text=q["text"] as! String;answer["setValue"]=AXUIElementSetAttributeValue(f,kAXValueAttribute as CFString,text as CFString).rawValue;answer["focus"]=AXUIElementSetAttributeValue(f,kAXFocusedAttribute as CFString,kCFBooleanTrue).rawValue}
  if let s=q["range"] as? [Int],s.count==2 {var r=CFRange(location:s[0],length:s[1]);answer["setRange"]=AXUIElementSetAttributeValue(f,kAXSelectedTextRangeAttribute as CFString,AXValueCreate(.cfRange,&r)!).rawValue}
  var observed=state(f,source);if op != "focused",let documentPath=q["documentPath"] as? String {observed["controlDocument"]=documentPath};answer["state"]=observed
 }else{answer["error"]=op=="focused" ? "no focused AX element" : "no control for named TextEdit document"}
 answer["endedAt"]=now()
 print(String(data:try JSONSerialization.data(withJSONObject:answer,options:[.sortedKeys]),encoding:.utf8)!);fflush(stdout)
 }catch{print("{\"error\":\"bad request\"}");fflush(stdout)}
}
