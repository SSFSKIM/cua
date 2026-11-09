// #298 probe's native app (bundled as Probe298.app by the workflow): one AppKit window at (400, 30) whose buttons each
// change their label in place on the command "mutate" (written to the file argv[1], "<nonce> <op>", polled every 50 ms),
// every button kept as the same NSButton (the same AX element). "tick" ticks on its own every 100 ms, as #296's
// label cell. Each change, before -> after:
//   tick         "Elapsed 0.0 s" ticking (#296's ticking-label cell)            content
//   like         "Like (12)" -> "Like (13)"                                      content
//   items        "1 item" -> "2 items"                                           content
//   follow       "Follow" -> "Following"                                         state flip
//   play         "Play" -> "Pause"                                               state flip
//   more         "Show more" -> "Show less"                                      state flip
//   toggle       an on/off button, "Follow" (off) -> "Following" (on), its state flipped
//   relabel      "Save" -> "Delete", its identifier kept ("relabel")             meaning
//   relabelid    "Save" -> "Delete", its identifier changed (save-2 -> delete-2) meaning
//   noid         "Save" -> "Delete", no identifier                               meaning
//   alabel       an untitled button whose accessibility label "Save" -> "Delete" meaning
//   deleteall    "Delete" -> "Delete all"                                        meaning (words only added)
//   the window   "probe298 native" -> "(3) probe298 native"                      container, content
import AppKit

let cmdPath = CommandLine.arguments[1], logPath = CommandLine.arguments[2]
FileManager.default.createFile(atPath: logPath, contents: nil)
let logHandle = FileHandle(forWritingAtPath: logPath)!
func log(_ o: [String: Any]) {
  var o = o
  o["t"] = Date().timeIntervalSince1970 * 1000
  logHandle.write(try! JSONSerialization.data(withJSONObject: o) + Data("\n".utf8))
}
final class Flipped: NSView { override var isFlipped: Bool { true } }
final class Target: NSObject { @objc func hit(_ sender: NSButton) { log(["ev": "click", "id": sender.identifier?.rawValue ?? "", "title": sender.title]) } }
let target = Target()

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 620, height: 420), styleMask: [.titled, .closable], backing: .buffered, defer: false)
window.title = "probe298 native"
let root = Flipped(frame: NSRect(x: 0, y: 0, width: 620, height: 420))
window.contentView = root
var slot = 0
func button(_ id: String?, _ title: String) -> NSButton {
  let b = NSButton(title: title, target: target, action: #selector(Target.hit(_:)))
  b.bezelStyle = .rounded
  b.frame = NSRect(x: 20 + CGFloat(slot % 3) * 190, y: 20 + CGFloat(slot / 3) * 50, width: 170, height: 32)
  slot += 1
  if let id { b.identifier = NSUserInterfaceItemIdentifier(id) }
  root.addSubview(b)
  return b
}
let tick = button("tick", "Elapsed 0.0 s")
let like = button("like", "Like (12)")
let items = button("items", "1 item")
let follow = button("follow", "Follow")
let play = button("play", "Play")
let more = button("more", "Show more")
let toggle = button("toggle", "Follow")
toggle.setButtonType(.pushOnPushOff)
toggle.alternateTitle = "Following"
toggle.state = .off
let relabel = button("relabel", "Save")
let relabelid = button("save-2", "Save")
let noid = button(nil, "Save")
let alabel = button("alabel", "")
alabel.image = NSImage(systemSymbolName: "square.and.arrow.down", accessibilityDescription: nil)
alabel.setAccessibilityLabel("Save")
let deleteall = button("deleteall", "Delete")

let started = Date()
Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { _ in
  tick.title = String(format: "Elapsed %.1f s", Date().timeIntervalSince(started))
}
func mutate() {
  like.title = "Like (13)"
  items.title = "2 items"
  follow.title = "Following"
  play.title = "Pause"
  more.title = "Show less"
  toggle.state = .on
  relabel.title = "Delete"
  relabelid.title = "Delete"; relabelid.identifier = NSUserInterfaceItemIdentifier("delete-2")
  noid.title = "Delete"
  alabel.setAccessibilityLabel("Delete")
  deleteall.title = "Delete all"
  window.title = "(3) probe298 native"
}
var lastNonce = ""
Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { _ in
  guard let text = try? String(contentsOfFile: cmdPath, encoding: .utf8) else { return }
  let parts = text.trimmingCharacters(in: .whitespacesAndNewlines).split(separator: " ").map(String.init)
  guard parts.count == 2, parts[0] != lastNonce else { return }
  lastNonce = parts[0]
  if parts[1] == "mutate" { mutate() }
  log(["ev": "cmd", "op": parts[1], "nonce": parts[0]])
}
window.setFrameTopLeftPoint(NSPoint(x: 400, y: (NSScreen.main?.frame.height ?? 900) - 30))
window.orderFrontRegardless()
log(["ev": "ready", "pid": Int(getpid())])
app.run()
