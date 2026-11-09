// Hosted-only AppKit mail-like list for the shared #330 / #298 gate. No Mail account, permissions or owner data.
import AppKit
import Foundation

final class MailList: NSObject, NSApplicationDelegate, NSTableViewDataSource, NSTableViewDelegate {
  var window: NSWindow!
  let table = NSTableView()
  var tick = 0
  var timer: Timer?
  let path = ProcessInfo.processInfo.environment["P330_NATIVE_LOG"]!
  func record(_ event: String) {
    let data = try! JSONSerialization.data(withJSONObject: ["event": event, "tick": tick, "selection": table.selectedRow, "time": Date().timeIntervalSince1970])
    if !FileManager.default.fileExists(atPath: path) { FileManager.default.createFile(atPath: path, contents: nil) }
    let f = try! FileHandle(forWritingTo: URL(fileURLWithPath: path))
    try! f.seekToEnd(); try! f.write(contentsOf: data); try! f.write(contentsOf: Data([10])); try! f.close()
  }
  func applicationDidFinishLaunching(_ note: Notification) {
    window = NSWindow(contentRect: NSRect(x: 400, y: 30, width: 620, height: 720), styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
    window.title = "Shared gate — Mail-like list"
    let scroll = NSScrollView(frame: NSRect(x: 12, y: 12, width: 590, height: 650))
    scroll.hasVerticalScroller = true
    let subject = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("subject")); subject.title = "Subject"; subject.width = 340
    let age = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("age")); age.title = "Received"; age.width = 210
    table.addTableColumn(subject); table.addTableColumn(age)
    table.rowHeight = 32; table.dataSource = self; table.delegate = self
    table.setAccessibilityLabel("Messages")
    scroll.documentView = table; window.contentView!.addSubview(scroll)
    window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
    timer = Timer.scheduledTimer(withTimeInterval: 0.4, repeats: true) { [self] _ in
      tick += 1; table.reloadData(); record("updated")
    }
    record("ready")
  }
  func numberOfRows(in tableView: NSTableView) -> Int { 20 }
  func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
    let key = tableColumn!.identifier.rawValue
    let text = NSTextField(labelWithString: key == "subject" ? "Message \(row + 1) (\(tick % 30))" : "\(tick) seconds ago")
    text.setAccessibilityIdentifier("mail-\(key)-\(row)")
    return text
  }
  func tableViewSelectionDidChange(_ notification: Notification) { record("selection") }
  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}
let delegate = MailList()
let app = NSApplication.shared
app.setActivationPolicy(.regular)
app.delegate = delegate
app.run()
