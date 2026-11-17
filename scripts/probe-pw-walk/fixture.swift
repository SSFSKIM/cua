import AppKit
import Foundation
guard ProcessInfo.processInfo.environment["RUNNER_ENVIRONMENT"] == "github-hosted" else {fatalError("hosted only")}
func emit(_ q:[String:Any]) {let d=try! JSONSerialization.data(withJSONObject:q);print(String(data:d,encoding:.utf8)!);fflush(stdout)}
let app=NSApplication.shared;app.setActivationPolicy(.regular)
let w=NSWindow(contentRect:NSRect(x:100,y:100,width:600,height:300),styleMask:[.titled,.closable],backing:.buffered,defer:false);w.title="PW walk owned AppKit fixture"
let field=NSSecureTextField(frame:NSRect(x:30,y:160,width:500,height:30));field.setAccessibilityLabel("PW walk test");w.contentView!.addSubview(field)
let ordinary=NSTextField(frame:NSRect(x:30,y:90,width:500,height:30));ordinary.stringValue="public-control";ordinary.setAccessibilityLabel("Public control");w.contentView!.addSubview(ordinary)
w.makeKeyAndOrderFront(nil);app.activate(ignoringOtherApps:true);w.makeFirstResponder(field);emit(["ready":true,"pid":ProcessInfo.processInfo.processIdentifier])
DispatchQueue.global().async {while let line=readLine(){guard let q=(try? JSONSerialization.jsonObject(with:Data(line.utf8))) as? [String:Any],let value=q["value"] as? String,let trial=q["trial"] as? Int else {continue};DispatchQueue.main.async {field.stringValue=value;w.makeFirstResponder(field);if let editor=field.currentEditor(){editor.selectedRange=NSRange(location:0,length:min(7,value.utf16.count))};emit(["trial":trial,"length":field.stringValue.utf16.count,"matches":field.stringValue == value])}}}
app.run()
