// #298's original AppKit fixture, adapted only with a reset command for live coordinate A/B cells.
import AppKit

let cmdPath = CommandLine.arguments[1], logPath = CommandLine.arguments[2]
FileManager.default.createFile(atPath: logPath, contents: nil)
let logHandle = FileHandle(forWritingAtPath: logPath)!
func log(_ o: [String: Any]) {
  var o = o; o["t"] = Date().timeIntervalSince1970 * 1000
  logHandle.write(try! JSONSerialization.data(withJSONObject: o) + Data("\n".utf8))
}
final class Flipped: NSView { override var isFlipped: Bool { true } }
final class Target: NSObject { @objc func hit(_ sender: NSButton) { log(["ev":"click","id":sender.identifier?.rawValue ?? "","title":sender.title]) } }
let target = Target(), app = NSApplication.shared
app.setActivationPolicy(.regular)
let window = NSWindow(contentRect:NSRect(x:0,y:0,width:620,height:420),styleMask:[.titled,.closable],backing:.buffered,defer:false)
window.title = "probe298 native"
let root = Flipped(frame:NSRect(x:0,y:0,width:620,height:420)); window.contentView = root
var slot = 0
func button(_ id:String?, _ title:String) -> NSButton {
  let b = NSButton(title:title,target:target,action:#selector(Target.hit(_:)))
  b.bezelStyle = .rounded
  b.frame = NSRect(x:20+CGFloat(slot%3)*190,y:20+CGFloat(slot/3)*50,width:170,height:32)
  slot += 1
  if let id { b.identifier = NSUserInterfaceItemIdentifier(id) }
  root.addSubview(b); return b
}
let tick = button("tick","Elapsed 0.0 s"), like = button("like","Like (12)"), items = button("items","1 item")
let follow = button("follow","Follow"), play = button("play","Play"), more = button("more","Show more")
let toggle = button("toggle","Follow")
toggle.setButtonType(.pushOnPushOff); toggle.alternateTitle = "Following"; toggle.state = .off
let relabel = button("relabel","Save"), relabelid = button("save-2","Save"), noid = button(nil,"Save")
let alabel = button("alabel","")
alabel.image = NSImage(systemSymbolName:"square.and.arrow.down",accessibilityDescription:nil)
alabel.setAccessibilityLabel("Save")
let deleteall = button("deleteall","Delete")
var started = Date()
Timer.scheduledTimer(withTimeInterval:0.1,repeats:true) { _ in tick.title = String(format:"Elapsed %.1f s",Date().timeIntervalSince(started)) }
func reset() {
  started = Date(); tick.title = "Elapsed 0.0 s"; like.title = "Like (12)"; items.title = "1 item"
  follow.title = "Follow"; play.title = "Play"; more.title = "Show more"; toggle.state = .off
  relabel.title = "Save"; relabelid.title = "Save"; relabelid.identifier = NSUserInterfaceItemIdentifier("save-2")
  noid.title = "Save"; alabel.setAccessibilityLabel("Save"); deleteall.title = "Delete"; window.title = "probe298 native"
}
func mutate() {
  like.title = "Like (13)"; items.title = "2 items"; follow.title = "Following"; play.title = "Pause"
  more.title = "Show less"; toggle.state = .on; relabel.title = "Delete"
  relabelid.title = "Delete"; relabelid.identifier = NSUserInterfaceItemIdentifier("delete-2")
  noid.title = "Delete"; alabel.setAccessibilityLabel("Delete"); deleteall.title = "Delete all"; window.title = "(3) probe298 native"
}
var lastNonce = ""
Timer.scheduledTimer(withTimeInterval:0.05,repeats:true) { _ in
  guard let text = try? String(contentsOfFile:cmdPath,encoding:.utf8) else { return }
  let parts = text.trimmingCharacters(in:.whitespacesAndNewlines).split(separator:" ").map(String.init)
  guard parts.count == 2, parts[0] != lastNonce else { return }
  lastNonce = parts[0]
  if parts[1] == "mutate" { mutate() }; if parts[1] == "reset" { reset() }
  log(["ev":"cmd","op":parts[1],"nonce":parts[0]])
}
window.setFrameTopLeftPoint(NSPoint(x:400,y:(NSScreen.main?.frame.height ?? 900)-30))
window.orderFrontRegardless(); NSApp.activate(ignoringOtherApps:true)
log(["ev":"ready","pid":Int(getpid())]); app.run()
