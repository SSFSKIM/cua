// #296 probe's native app (bundled as Probe296.app by the workflow): one window at (400, 30) of AppKit controls whose
// content changes, each button logging its click as a JSON line to argv[2]; commands arrive in the file argv[1]
// ("<nonce> <op>", polled every 50 ms).
//   static   a plain button (the control)
//   nextto   a button beside a label that shows the time every 100 ms
//   label    a button whose own title ticks every 100 ms (sized to fit, its origin kept)
//   again    a button replaced every 500 ms by an identical one at the same frame (a new element each time)
//   save     replaced, on "swap", by a "Delete" button of the same frame (the same role)
//   keep     replaced, on "swaprole", by a "Remove" checkbox of the same frame
//   move     moved 140 pt right on "move"
//   "reset" puts every one back.
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
final class Target: NSObject {
  @objc func hit(_ sender: NSButton) {
    log(["ev": "click", "id": sender.identifier?.rawValue ?? "", "title": sender.title, "gen": sender.tag])
  }
}
let target = Target()
func button(_ id: String, _ title: String, _ frame: NSRect, checkbox: Bool = false, gen: Int = 0) -> NSButton {
  let b = checkbox ? NSButton(checkboxWithTitle: title, target: target, action: #selector(Target.hit(_:)))
                   : NSButton(title: title, target: target, action: #selector(Target.hit(_:)))
  if !checkbox { b.bezelStyle = .rounded }
  b.frame = frame
  b.identifier = NSUserInterfaceItemIdentifier(id)
  b.tag = gen
  return b
}

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 620, height: 420), styleMask: [.titled, .closable], backing: .buffered, defer: false)
window.title = "probe296 native"
let root = Flipped(frame: NSRect(x: 0, y: 0, width: 620, height: 420))
window.contentView = root
let H: CGFloat = 32, W: CGFloat = 120
let staticFrame = NSRect(x: 20, y: 20, width: W, height: H)
let clockFrame = NSRect(x: 20, y: 74, width: 150, height: 22), nextFrame = NSRect(x: 180, y: 70, width: W, height: H)
let labelOrigin = NSPoint(x: 20, y: 120)
let againFrame = NSRect(x: 20, y: 170, width: W, height: H)
let saveFrame = NSRect(x: 20, y: 220, width: W, height: H)
let keepFrame = NSRect(x: 20, y: 270, width: W, height: H)
let moveFrame = NSRect(x: 20, y: 320, width: W, height: H)

root.addSubview(button("static", "Static", staticFrame))
let clock = NSTextField(labelWithString: "")
clock.frame = clockFrame
clock.identifier = NSUserInterfaceItemIdentifier("clock")
root.addSubview(clock)
root.addSubview(button("nextto", "Clock", nextFrame))
let label = button("label", "Elapsed 0.0 s", NSRect(origin: labelOrigin, size: NSSize(width: W, height: H)))
root.addSubview(label)
var again = button("again", "Again", againFrame)
root.addSubview(again)
var save = button("save", "Save", saveFrame)
root.addSubview(save)
var keep = button("keep", "Keep", keepFrame)
root.addSubview(keep)
let move = button("move", "Move", moveFrame)
root.addSubview(move)

let started = Date()
let formatter = DateFormatter()
formatter.dateFormat = "HH:mm:ss.S"
Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { _ in
  clock.stringValue = formatter.string(from: Date())
  label.title = String(format: "Elapsed %.1f s", Date().timeIntervalSince(started))
  label.sizeToFit()
  label.setFrameOrigin(labelOrigin)
}
var gen = 0
Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { _ in
  gen += 1
  let fresh = button("again", "Again", againFrame, gen: gen)
  root.replaceSubview(again, with: fresh)
  again = fresh
}
func reset() {
  let s = button("save", "Save", saveFrame); root.replaceSubview(save, with: s); save = s
  let k = button("keep", "Keep", keepFrame); root.replaceSubview(keep, with: k); keep = k
  move.setFrameOrigin(moveFrame.origin)
}
var lastNonce = ""
Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { _ in
  guard let text = try? String(contentsOfFile: cmdPath, encoding: .utf8) else { return }
  let parts = text.trimmingCharacters(in: .whitespacesAndNewlines).split(separator: " ").map(String.init)
  guard parts.count == 2, parts[0] != lastNonce else { return }
  lastNonce = parts[0]
  switch parts[1] {
  case "swap": let d = button("delete", "Delete", saveFrame); root.replaceSubview(save, with: d); save = d
  case "swaprole": let c = button("remove", "Remove", keepFrame, checkbox: true); root.replaceSubview(keep, with: c); keep = c
  case "move": move.setFrameOrigin(NSPoint(x: moveFrame.minX + 140, y: moveFrame.minY))
  case "reset": reset()
  default: break
  }
  log(["ev": "cmd", "op": parts[1], "nonce": parts[0]])
}
window.setFrameTopLeftPoint(NSPoint(x: 400, y: (NSScreen.main?.frame.height ?? 900) - 30))
window.orderFrontRegardless()
log(["ev": "ready", "pid": Int(getpid())])
app.run()
