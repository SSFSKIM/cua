import AppKit
import ApplicationServices
import Foundation
let hosted = ProcessInfo.processInfo.environment["RUNNER_ENVIRONMENT"] == "github-hosted"
guard hosted else { fatalError("hosted only") }
func emit(_ q:[String:Any]) { let d=try! JSONSerialization.data(withJSONObject:q,options:[.sortedKeys]);print(String(data:d,encoding:.utf8)!);fflush(stdout) }
func attr(_ e:AXUIElement,_ n:String)->CFTypeRef? { var v:CFTypeRef?;return AXUIElementCopyAttributeValue(e,n as CFString,&v) == .success ? v:nil }
func summary(_ v:CFTypeRef?,_ pw:String)->[String:Any] {
 guard let v=v else {return ["kind":"nil"]}
 let s: String? = (v as? NSAttributedString)?.string ?? (v as? String)
 if let s=s {
  let mask = !s.isEmpty && s.allSatisfy { "•●*◦∙▪︎".contains($0) }
  return ["kind":"string","length":s.utf16.count,"empty":s.isEmpty,"exactMatch":!pw.isEmpty && s == pw,"syntheticSubstring":!s.isEmpty && !pw.isEmpty && pw.contains(s),"allMaskCharacters":mask,"text":s.isEmpty ? "" : (mask ? s : ((!pw.isEmpty && pw.contains(s)) ? "[TEST_PW]" : "[OTHER_TEXT]"))]
 }
 if let n=v as? NSNumber {return ["kind":"number","value":n]}
 if CFGetTypeID(v) == AXValueGetTypeID(),AXValueGetType(v as! AXValue) == .cfRange {var r=CFRange();AXValueGetValue(v as! AXValue,.cfRange,&r);return ["kind":"range","location":r.location,"length":r.length]}
 return ["kind":"other","type":String(describing:type(of:v))]
}
while let line=readLine(){do {
 let q=try JSONSerialization.jsonObject(with:Data(line.utf8)) as! [String:Any],op=q["op"] as? String ?? "",pid=(q["pid"] as? NSNumber)?.int32Value ?? 0
 let app=AXUIElementCreateApplication(pid);AXUIElementSetMessagingTimeout(app,0.5)
 if op == "lookup" {emit(["pid":NSRunningApplication.runningApplications(withBundleIdentifier:q["bundle"] as! String).first?.processIdentifier ?? 0]);continue}
 if op == "front" {let accepted=NSRunningApplication(processIdentifier:pid)?.activate(options:[]) ?? false;let end=Date().addingTimeInterval(5);while NSWorkspace.shared.frontmostApplication?.processIdentifier != pid && Date()<end {RunLoop.current.run(until:Date().addingTimeInterval(0.01))};emit(["accepted":accepted,"frontmostPid":NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 0]);continue}
 if op == "enable" {emit(["manual":AXUIElementSetAttributeValue(app,"AXManualAccessibility" as CFString,kCFBooleanTrue).rawValue,"enhanced":AXUIElementSetAttributeValue(app,"AXEnhancedUserInterface" as CFString,kCFBooleanTrue).rawValue]);continue}
 guard op == "scan" else {emit(["error":"unknown operation"]);continue}
 let pw=q["pw"] as? String ?? "";var pending=[app],seen=Set<AXUIElement>(),rows=[[String:Any]](),count=0
 while let e=pending.popLast(),count<6000 {
  if seen.contains(e){continue};seen.insert(e);count+=1
  let role=attr(e,"AXRole") as? String ?? "",subrole=attr(e,"AXSubrole") as? String ?? "",title=attr(e,"AXTitle") as? String ?? "",desc=attr(e,"AXDescription") as? String ?? ""
  if subrole.contains("Secure") || [title,desc].contains("PW walk test") {
   var row:[String:Any] = ["role":role,"subrole":subrole,"titleIsFixture":title == "PW walk test","descriptionIsFixture":desc == "PW walk test"]
   var attrs=[String:Any]()
   for key in ["AXValue","AXSelectedText","AXNumberOfCharacters","AXSelectedTextRange","AXVisibleCharacterRange","AXValueDescription","AXPlaceholderValue","AXTitle","AXDescription","AXHelp","AXAttributedValue"] {
    var v:CFTypeRef?;let err=AXUIElementCopyAttributeValue(e,key as CFString,&v);attrs[key]=["error":err.rawValue,"result":summary(v,pw)]
   }
   var range=CFRange(location:0,length:pw.utf16.count);let param=AXValueCreate(.cfRange,&range)!
   for key in ["AXStringForRange","AXAttributedStringForRange","AXRTFForRange"] {var v:CFTypeRef?;let err=AXUIElementCopyParameterizedAttributeValue(e,key as CFString,param,&v);attrs[key]=["error":err.rawValue,"result":summary(v,pw)]}
   row["attributes"]=attrs;rows.append(row)
  }
  pending.append(contentsOf:attr(e,"AXChildren") as? [AXUIElement] ?? [])
 }
 emit(["pid":pid,"visited":count,"fields":rows])
 } catch {emit(["error":"helper JSON failure"])}
}
