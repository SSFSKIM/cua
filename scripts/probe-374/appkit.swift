// #374's AppKit fixture app (built on the runner with swiftc, run as a plain process with a regular activation policy).
// One window, four targets, each asked for its menu by the engine's perform_secondary_action "Show Menu":
//   "Fixture text"     an NSTextView: AppKit's own context menu for text.
//   "Fixture popup"    an NSPopUpButton: its menu, a child of the button (the confirmation's `element` source).
//   "Ignored menu"     a view that takes AXShowMenu, answers success and shows nothing: the app that ignores the request.
//   "Blocking menu"    a view whose AXShowMenu runs its menu's tracking loop inside the action, so the Accessibility call
//                      is answered only when the menu closes and the engine's 1 s messaging timeout answers
//                      cannotComplete with the menu open (the Decision Log's #374 item 4, observed here).
// Each view's AXShowMenu count is printed to stdout as JSON lines, so the harness sees what reached the app.
import AppKit

func emit(_ object: [String: Any]) {
  if let data = try? JSONSerialization.data(withJSONObject: object), let line = String(data: data, encoding: .utf8) { print(line); fflush(stdout) }
}

func contextMenu(_ title: String) -> NSMenu {
  let menu = NSMenu(title: title)
  for item in ["Copy", "Rename", "Delete"] { menu.addItem(NSMenuItem(title: item, action: nil, keyEquivalent: "")) }
  return menu
}

/// A labelled button-like view whose Show Menu is the subclass's.
class MenuTarget: NSView {
  let label: String
  var shows = 0
  init(frame: NSRect, label: String) {
    self.label = label
    super.init(frame: frame)
    wantsLayer = true
    layer?.backgroundColor = NSColor.systemTeal.withAlphaComponent(0.3).cgColor
    setAccessibilityElement(true)
    setAccessibilityRole(.button)
    setAccessibilityLabel(label)
  }
  required init?(coder: NSCoder) { fatalError() }
  override func isAccessibilitySelectorAllowed(_ selector: Selector) -> Bool {
    selector == #selector(accessibilityPerformShowMenu) || selector == #selector(accessibilityPerformPress) || super.isAccessibilitySelectorAllowed(selector)
  }
  override func accessibilityPerformPress() -> Bool { true }
  override func accessibilityPerformShowMenu() -> Bool {
    shows += 1
    emit(["event": "showMenu", "target": label, "count": shows, "at": Date().timeIntervalSince1970 * 1000])
    return show()
  }
  func show() -> Bool { true }
}

final class IgnoringTarget: MenuTarget {}

final class BlockingTarget: MenuTarget {
  override func show() -> Bool {
    // The menu's tracking loop runs here, inside the action, until the harness cancels the menu.
    contextMenu("Blocking").popUp(positioning: nil, at: NSPoint(x: 10, y: 10), in: self)
    return true
  }
}

final class Delegate: NSObject, NSApplicationDelegate {
  var window: NSWindow!
  func applicationDidFinishLaunching(_ notification: Notification) {
    window = NSWindow(contentRect: NSRect(x: 420, y: 200, width: 520, height: 420), styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
    window.title = "probe374 AppKit"
    let content = NSView(frame: NSRect(x: 0, y: 0, width: 520, height: 420))
    let scroll = NSScrollView(frame: NSRect(x: 20, y: 290, width: 480, height: 110))
    let text = NSTextView(frame: NSRect(x: 0, y: 0, width: 480, height: 110))
    text.string = "Right-click here for AppKit's own text menu."
    text.setAccessibilityLabel("Fixture text")
    scroll.documentView = text
    let popup = NSPopUpButton(frame: NSRect(x: 20, y: 240, width: 200, height: 30), pullsDown: false)
    popup.addItems(withTitles: ["Alpha", "Bravo", "Charlie"])
    popup.setAccessibilityLabel("Fixture popup")
    let ignoring = IgnoringTarget(frame: NSRect(x: 20, y: 150, width: 220, height: 60), label: "Ignored menu")
    let blocking = BlockingTarget(frame: NSRect(x: 20, y: 60, width: 220, height: 60), label: "Blocking menu")
    ignoring.toolTip = "Tooltip text for the probe"
    for view in [scroll, popup, ignoring, blocking] { content.addSubview(view) }
    window.contentView = content
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
    emit(["event": "ready", "pid": Int(ProcessInfo.processInfo.processIdentifier)])
  }
}

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let delegate = Delegate()
app.delegate = delegate
app.run()
