// #313's native app (bundled as Probe313.app by the workflow): one window at (400, 30) of AppKit text-entry controls,
// the focus starting on a plain button. Every change of the window's first responder (the control a field editor
// serves) and every text change is a JSON line in argv[1].
//   start   a plain button, first responder at launch
//   field   NSTextField          search  NSSearchField
//   combo   an editable NSComboBox   notes   an NSTextView in a scroll view
import AppKit

let logPath = CommandLine.arguments[1]
FileManager.default.createFile(atPath: logPath, contents: nil)
let logHandle = FileHandle(forWritingAtPath: logPath)!
func log(_ o: [String: Any]) {
  var o = o
  o["t"] = Date().timeIntervalSince1970 * 1000
  logHandle.write(try! JSONSerialization.data(withJSONObject: o) + Data("\n".utf8))
}

final class Flipped: NSView { override var isFlipped: Bool { true } }
final class Watcher: NSObject, NSTextViewDelegate {
  @objc func changed(_ n: Notification) {
    guard let c = n.object as? NSControl else { return }
    log(["ev": "text", "id": c.identifier?.rawValue ?? "?", "value": c.stringValue])
  }
  func textDidChange(_ n: Notification) {
    guard let t = n.object as? NSTextView else { return }
    log(["ev": "text", "id": t.identifier?.rawValue ?? "?", "value": t.string])
  }
  @objc func pressed(_ b: NSButton) { log(["ev": "click", "id": b.identifier?.rawValue ?? "?"]) }
}
let watcher = Watcher()

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 600, height: 400), styleMask: [.titled, .closable], backing: .buffered, defer: false)
window.title = "probe313 native"
let root = Flipped(frame: NSRect(x: 0, y: 0, width: 600, height: 400))
window.contentView = root
func named<T: NSView>(_ v: T, _ id: String, _ frame: NSRect) -> T {
  v.identifier = NSUserInterfaceItemIdentifier(id); v.frame = frame; root.addSubview(v); return v
}
let start = named(NSButton(title: "Start", target: watcher, action: #selector(Watcher.pressed(_:))), "start", NSRect(x: 20, y: 20, width: 120, height: 32))
start.bezelStyle = .rounded
let field = named(NSTextField(string: "alpha bravo"), "field", NSRect(x: 20, y: 70, width: 300, height: 24))
let search = named(NSSearchField(string: ""), "search", NSRect(x: 20, y: 110, width: 300, height: 24))
search.placeholderString = "Probe search"
let combo = named(NSComboBox(frame: .zero), "combo", NSRect(x: 20, y: 150, width: 300, height: 26))
combo.addItems(withObjectValues: ["one", "two", "three"])
combo.isEditable = true
let scroll = named(NSScrollView(frame: .zero), "notesScroll", NSRect(x: 20, y: 200, width: 400, height: 150))
let notes = NSTextView(frame: NSRect(x: 0, y: 0, width: 400, height: 150))
notes.identifier = NSUserInterfaceItemIdentifier("notes")
notes.string = "charlie delta"
notes.delegate = watcher
scroll.documentView = notes
scroll.hasVerticalScroller = true
for c in [field, search, combo] as [NSControl] {
  NotificationCenter.default.addObserver(watcher, selector: #selector(Watcher.changed(_:)), name: NSControl.textDidChangeNotification, object: c)
}
window.setFrameTopLeftPoint(NSPoint(x: 400, y: (NSScreen.main?.frame.height ?? 768) - 30))
window.makeKeyAndOrderFront(nil)
window.makeFirstResponder(start)

// The first responder, as the control a field editor serves.
func responderId() -> String {
  guard let r = window.firstResponder else { return "none" }
  if let t = r as? NSTextView, t.isFieldEditor, let c = t.delegate as? NSView { return c.identifier?.rawValue ?? "fieldEditor" }
  if let v = r as? NSView { return v.identifier?.rawValue ?? String(describing: type(of: v)) }
  return String(describing: type(of: r))
}
var last = ""
Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { _ in
  let now = responderId()
  if now != last { log(["ev": "focus", "id": now, "key": window.isKeyWindow, "active": app.isActive]); last = now }
}
log(["ev": "ready"])
app.run()
