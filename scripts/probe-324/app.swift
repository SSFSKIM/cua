// #324's AppKit app (bundled as Probe324.app by the workflow), from #313's: one window of AppKit text-entry controls,
// the focus starting on a plain button. Its whole state is written to argv[1] as one JSON object every 50 ms; argv[2] is
// a command file it polls (each command once, by its sequence number): `reset` (both texts back, the selections at 0,
// the scroll at the top, the button first responder), `focus field|notes` (that control made first responder by the
// app itself, so nothing of the engine's focuses it), `front` (the app activated, its window ordered front).
//   start   a plain button, first responder at reset       field   an NSTextField
//   notes   an NSTextView in a scroll view, 60 lines, so a scroll moves it
import AppKit

let statePath = CommandLine.arguments[1]
let commandPath = CommandLine.arguments[2]
let fieldText = "alpha bravo charlie"
let notesText = (0..<60).map { "notes line \($0) delta echo foxtrot" }.joined(separator: "\n")

final class Flipped: NSView { override var isFlipped: Bool { true } }
final class Watcher: NSObject {
  var clicks = 0
  @objc func pressed(_ b: NSButton) { clicks += 1 }
}
let watcher = Watcher()
let app = NSApplication.shared
app.setActivationPolicy(.regular)
let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 600, height: 420), styleMask: [.titled, .closable], backing: .buffered, defer: false)
window.title = "probe324 native"
let root = Flipped(frame: NSRect(x: 0, y: 0, width: 600, height: 420))
window.contentView = root
func named<T: NSView>(_ v: T, _ id: String, _ frame: NSRect) -> T {
  v.identifier = NSUserInterfaceItemIdentifier(id); v.frame = frame; root.addSubview(v); return v
}
let start = named(NSButton(title: "Start", target: watcher, action: #selector(Watcher.pressed(_:))), "start", NSRect(x: 20, y: 20, width: 120, height: 32))
start.bezelStyle = .rounded
let field = named(NSTextField(string: fieldText), "field", NSRect(x: 20, y: 70, width: 300, height: 24))
field.setAccessibilityLabel("Probe field")
let scroll = named(NSScrollView(frame: .zero), "notesScroll", NSRect(x: 20, y: 110, width: 460, height: 280))
let notes = NSTextView(frame: NSRect(x: 0, y: 0, width: 460, height: 280))
notes.identifier = NSUserInterfaceItemIdentifier("notes")
notes.string = notesText
notes.setAccessibilityLabel("Probe notes")
scroll.documentView = notes
scroll.hasVerticalScroller = true
window.setFrameTopLeftPoint(NSPoint(x: 400, y: (NSScreen.main?.frame.height ?? 768) - 30))
window.makeKeyAndOrderFront(nil)
window.makeFirstResponder(start)

var mouseDowns = 0
NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown]) { e in mouseDowns += 1; return e }

func responderId() -> String {
  guard let r = window.firstResponder else { return "none" }
  if let t = r as? NSTextView, t.isFieldEditor, let c = t.delegate as? NSView { return c.identifier?.rawValue ?? "fieldEditor" }
  if let v = r as? NSView { return v.identifier?.rawValue ?? String(describing: type(of: v)) }
  return String(describing: type(of: r))
}
func fieldSelection() -> [Int]? {
  guard let editor = field.currentEditor() else { return nil }
  let r = editor.selectedRange
  return [r.location, r.length]
}
// Every change of key, main, active and the first responder, kept with its time (Unix ms).
var transitions: [[String: Any]] = []
var lastKey = ""
var seq = 0
func now() -> Double { (Date().timeIntervalSince1970 * 10_000).rounded() / 10 }
func tick() {
  let key = "\(window.isKeyWindow ? 1 : 0)\(window.isMainWindow ? 1 : 0)\(app.isActive ? 1 : 0) \(responderId())"
  if key != lastKey { transitions.append(["t": now(), "key": window.isKeyWindow, "main": window.isMainWindow, "active": app.isActive, "responder": responderId()]); lastKey = key }
  if transitions.count > 200 { transitions.removeFirst(transitions.count - 200) }
  let state: [String: Any] = ["t": now(), "field": field.stringValue, "notes": notes.string, "fieldSel": fieldSelection() ?? NSNull(),
    "notesSel": [notes.selectedRange().location, notes.selectedRange().length], "responder": responderId(), "key": window.isKeyWindow,
    "main": window.isMainWindow, "active": app.isActive, "scrollY": scroll.contentView.bounds.origin.y, "mouseDowns": mouseDowns,
    "clicks": watcher.clicks, "seq": seq, "transitions": transitions]
  if let d = try? JSONSerialization.data(withJSONObject: state) { try? d.write(to: URL(fileURLWithPath: statePath + ".tmp")); rename(statePath + ".tmp", statePath) }
}
func command() {
  guard let text = try? String(contentsOfFile: commandPath, encoding: .utf8) else { return }
  let parts = text.trimmingCharacters(in: .whitespacesAndNewlines).split(separator: " ").map(String.init)
  guard parts.count >= 2, let n = Int(parts[0]), n > seq else { return }
  seq = n
  switch parts[1] {
  case "reset":
    field.stringValue = fieldText
    notes.string = notesText
    window.makeFirstResponder(start)
    notes.setSelectedRange(NSRange(location: 0, length: 0))
    notes.scroll(.zero)
    transitions.removeAll(); lastKey = ""
  case "focus":
    if parts.count > 2 { window.makeFirstResponder(parts[2] == "field" ? field : notes) }
    if parts.count > 2, parts[2] == "notes" { notes.setSelectedRange(NSRange(location: 0, length: 0)) }
  case "front":
    app.activate(ignoringOtherApps: true)
    window.makeKeyAndOrderFront(nil)
  default: break
  }
}
Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { _ in command(); tick() }
app.run()
