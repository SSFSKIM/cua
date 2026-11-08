// #328's AppKit app, bundled twice by the workflow: Probe328.app (the target) and Cover328.app (the cover, argv[3] =
// "cover"). The target has two windows of scroll views, each instrumented, so a reading says where a posted scroll was
// dropped: never reached the app (no monitor entry), reached it for the wrong or no window (the monitor's window), or
// reached the scroll view and was ignored (its scrollWheel count rises but its offset does not).
//   window "probe328 A" (not key in the app: B is made key after it)   A.text   NSTextView in an NSScrollView
//                                                                       A.table  NSTableView, 200 rows
//   window "probe328 B" (the app's key window, once the app is active)  B.text   NSTextView in an NSScrollView
//                                                                       B.legacy the same, its scroll view not
//                                                                                compatible with responsive scrolling
// Its state goes to argv[1] as JSON every 50 ms; argv[2] is a command file polled by sequence number:
//   reset              every scroll view at the top, the logs cleared
//   bottom <id>        that scroll view at its end
//   front              the app activated, B ordered front and key
//   key A|B            makeKey on that window (no order change)
import AppKit

let statePath = CommandLine.arguments[1]
let commandPath = CommandLine.arguments[2]
let isCover = CommandLine.arguments.count > 3 && CommandLine.arguments[3] == "cover"
func now() -> Double { (Date().timeIntervalSince1970 * 10_000).rounded() / 10 }

let app = NSApplication.shared
app.setActivationPolicy(.regular)
final class Flipped: NSView { override var isFlipped: Bool { true } }

var wheelLog: [[String: Any]] = []
func logWheel(_ entry: [String: Any]) { wheelLog.append(entry); if wheelLog.count > 200 { wheelLog.removeFirst(wheelLog.count - 200) } }

class InstScroll: NSScrollView {
  var name = ""
  var wheels = 0
  override func scrollWheel(with event: NSEvent) {
    wheels += 1
    logWheel(["t": now(), "at": "view", "view": name, "phase": event.phase.rawValue, "momentum": event.momentumPhase.rawValue,
              "dy": event.scrollingDeltaY, "precise": event.hasPreciseScrollingDeltas, "before": contentView.bounds.origin.y])
    super.scrollWheel(with: event)
    logWheel(["t": now(), "at": "view.after", "view": name, "after": contentView.bounds.origin.y])
  }
}
final class LegacyScroll: InstScroll { override class var isCompatibleWithResponsiveScrolling: Bool { false } }

final class Rows: NSObject, NSTableViewDataSource, NSTableViewDelegate {
  func numberOfRows(in tableView: NSTableView) -> Int { 200 }
  func tableView(_ tableView: NSTableView, objectValueFor tableColumn: NSTableColumn?, row: Int) -> Any? { "table row \(row)" }
}
let rows = Rows()

var views: [String: InstScroll] = [:]
func textScroll(_ name: String, _ frame: NSRect, legacy: Bool = false) -> InstScroll {
  let s: InstScroll = legacy ? LegacyScroll(frame: frame) : InstScroll(frame: frame)
  s.name = name
  s.hasVerticalScroller = true
  let t = NSTextView(frame: NSRect(x: 0, y: 0, width: frame.width, height: frame.height))
  t.isVerticallyResizable = true
  t.minSize = NSSize(width: 0, height: frame.height)
  t.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
  t.autoresizingMask = [.width]
  t.textContainer?.widthTracksTextView = true
  t.string = (0..<120).map { "\(name) line \($0) alpha bravo charlie" }.joined(separator: "\n")
  t.setAccessibilityLabel("\(name) text")
  s.documentView = t
  s.setAccessibilityIdentifier(name)
  views[name] = s
  return s
}
func tableScroll(_ name: String, _ frame: NSRect) -> InstScroll {
  let s = InstScroll(frame: frame)
  s.name = name
  s.hasVerticalScroller = true
  let table = NSTableView(frame: NSRect(x: 0, y: 0, width: frame.width, height: frame.height))
  let col = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("c"))
  col.width = frame.width - 20
  col.title = "Rows"
  table.addTableColumn(col)
  table.dataSource = rows
  table.delegate = rows
  table.rowHeight = 20
  s.documentView = table
  s.setAccessibilityIdentifier(name)
  views[name] = s
  return s
}
func makeWindow(_ title: String, _ origin: NSPoint, _ size: NSSize) -> NSWindow {
  let w = NSWindow(contentRect: NSRect(origin: .zero, size: size), styleMask: [.titled, .closable], backing: .buffered, defer: false)
  w.title = title
  w.contentView = Flipped(frame: NSRect(origin: .zero, size: size))
  w.isReleasedWhenClosed = false
  let h = NSScreen.main?.frame.height ?? 768
  w.setFrameTopLeftPoint(NSPoint(x: origin.x, y: h - origin.y))
  return w
}

var windows: [String: NSWindow] = [:]
if isCover {
  let w = makeWindow("cover328", NSPoint(x: 0, y: 40), NSSize(width: 380, height: 300))
  let f = NSTextField(string: "the person's window")
  f.frame = NSRect(x: 20, y: 20, width: 300, height: 24)
  w.contentView!.addSubview(f)
  windows["cover"] = w
  w.makeKeyAndOrderFront(nil)
  w.makeFirstResponder(f)
} else {
  let a = makeWindow("probe328 A", NSPoint(x: 420, y: 40), NSSize(width: 590, height: 290))
  a.contentView!.addSubview(textScroll("A.text", NSRect(x: 10, y: 10, width: 280, height: 270)))
  a.contentView!.addSubview(tableScroll("A.table", NSRect(x: 300, y: 10, width: 280, height: 270)))
  let b = makeWindow("probe328 B", NSPoint(x: 420, y: 400), NSSize(width: 590, height: 290))
  b.contentView!.addSubview(textScroll("B.text", NSRect(x: 10, y: 10, width: 280, height: 270)))
  b.contentView!.addSubview(textScroll("B.legacy", NSRect(x: 300, y: 10, width: 280, height: 270), legacy: true))
  windows["A"] = a; windows["B"] = b
  a.makeKeyAndOrderFront(nil)
  b.makeKeyAndOrderFront(nil)
}

// Every scroll-wheel event that reaches the app's dispatch, with the window AppKit gave it.
NSEvent.addLocalMonitorForEvents(matching: [.scrollWheel]) { e in
  logWheel(["t": now(), "at": "app", "window": e.window?.title ?? NSNull(), "windowNumber": e.windowNumber, "loc": [e.locationInWindow.x, e.locationInWindow.y],
            "phase": e.phase.rawValue, "momentum": e.momentumPhase.rawValue, "dy": e.scrollingDeltaY, "precise": e.hasPreciseScrollingDeltas,
            "keyWindow": app.keyWindow?.title ?? NSNull(), "active": app.isActive])
  return e
}
var transitions: [[String: Any]] = []
var lastKey = ""
var seq = 0
func tick() {
  let key = "\(app.isActive) \(app.keyWindow?.title ?? "-") \(app.mainWindow?.title ?? "-")"
  if key != lastKey { transitions.append(["t": now(), "active": app.isActive, "key": app.keyWindow?.title ?? NSNull(), "main": app.mainWindow?.title ?? NSNull()]); lastKey = key }
  if transitions.count > 100 { transitions.removeFirst(transitions.count - 100) }
  var v: [String: Any] = [:]
  for (name, s) in views {
    let doc = s.documentView?.frame.height ?? 0
    v[name] = ["y": s.contentView.bounds.origin.y, "doc": doc, "view": s.contentView.bounds.height, "wheels": s.wheels]
  }
  let state: [String: Any] = ["t": now(), "seq": seq, "active": app.isActive, "key": app.keyWindow?.title ?? NSNull(), "main": app.mainWindow?.title ?? NSNull(),
                              "views": v, "wheels": wheelLog, "transitions": transitions,
                              "windows": windows.mapValues { ["number": $0.windowNumber, "key": $0.isKeyWindow, "main": $0.isMainWindow, "visible": $0.isVisible] }]
  if let d = try? JSONSerialization.data(withJSONObject: state) { try? d.write(to: URL(fileURLWithPath: statePath + ".tmp")); rename(statePath + ".tmp", statePath) }
}
func command() {
  guard let text = try? String(contentsOfFile: commandPath, encoding: .utf8) else { return }
  let parts = text.trimmingCharacters(in: .whitespacesAndNewlines).split(separator: " ").map(String.init)
  guard parts.count >= 2, let n = Int(parts[0]), n > seq else { return }
  seq = n
  switch parts[1] {
  case "reset":
    for s in views.values { s.contentView.scroll(to: .zero); s.reflectScrolledClipView(s.contentView); s.wheels = 0 }
    wheelLog.removeAll(); transitions.removeAll(); lastKey = ""
  case "bottom":
    if parts.count > 2, let s = views[parts[2]], let doc = s.documentView {
      s.contentView.scroll(to: NSPoint(x: 0, y: max(0, doc.frame.height - s.contentView.bounds.height))); s.reflectScrolledClipView(s.contentView)
    }
  case "front":
    app.activate(ignoringOtherApps: true)
    (windows["cover"] ?? windows["B"])?.makeKeyAndOrderFront(nil)
  case "key":
    if parts.count > 2 { windows[parts[2]]?.makeKey() }
  default: break
  }
}
Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { _ in command(); tick() }
app.run()
