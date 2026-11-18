// The owned AppKit fixture: a setup NSTextField, a single-line NSTextField and a multi-line NSTextView, with the Edit menu
// a real app has (⌘V reaches a text view through its key equivalent). It judges its own content: only booleans and counts
// leave it. Negative controls, each at most once per trial and recorded as `hit`:
// - rewrite: the first text change of the target rewrites the first pasted character in place (same length);
// - add: the first text change of the target inserts one 'z' at the caret;
// - stale: ⌘V's key-down, before the menu dispatches it, moves the caret to the field's start.
import AppKit
import Foundation

guard ProcessInfo.processInfo.environment["RUNNER_ENVIRONMENT"] == "github-hosted" else { exit(2) }
/// Equality by UTF-16 units, as the browser fixture and #354's read-back compare (Swift's `==` accepts canonical
/// equivalents, such as precomposed and decomposed Hangul).
func same(_ a: String?, _ b: Any?) -> Bool {
  guard let a, let b = b as? String else { return false }
  return Array(a.utf16) == Array(b.utf16)
}
func emit(_ q: [String: Any]) {
  let d = try! JSONSerialization.data(withJSONObject: q)
  print(String(decoding: d, as: UTF8.self)); fflush(stdout)
}

final class Fixture: NSObject {
  let window = NSWindow(contentRect: NSRect(x: 400, y: 120, width: 600, height: 330), styleMask: [.titled, .closable],
                        backing: .buffered, defer: false)
  let setup = NSTextField(frame: NSRect(x: 25, y: 280, width: 540, height: 26))
  let single = NSTextField(frame: NSRect(x: 25, y: 240, width: 540, height: 26))
  let scroll = NSScrollView(frame: NSRect(x: 25, y: 20, width: 540, height: 200))
  let multi = NSTextView(frame: NSRect(x: 0, y: 0, width: 540, height: 200))
  var trial = -1, target = "", effect = "none", start = 0, staleTo = 0, rewriteChar = ""
  var hit = false, hitVia = "", pastes = 0, changes = 0, keys = 0, applying = false

  /// The target's text view: the single field's field editor while it is edited, or the multi-line view.
  var view: NSTextView? {
    if target == "multi" { return multi }
    if target == "single" { return single.currentEditor() as? NSTextView }
    return nil
  }
  var value: String? {
    if target == "multi" { return multi.string }
    if target == "single" { return (single.currentEditor() as? NSTextView)?.string ?? single.stringValue }
    return nil
  }

  func menu() {
    let bar = NSMenu(), appItem = NSMenuItem(), editItem = NSMenuItem()
    bar.addItem(appItem); bar.addItem(editItem)
    let app = NSMenu()
    app.addItem(withTitle: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    appItem.submenu = app
    let edit = NSMenu(title: "Edit")
    edit.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
    edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
    edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
    edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
    edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
    editItem.submenu = edit
    NSApplication.shared.mainMenu = bar
  }

  func launch() {
    menu()
    setup.setAccessibilityLabel("Probe361 setup")
    single.setAccessibilityLabel("Probe361 single")
    multi.setAccessibilityLabel("Probe361 multi")
    for f in [setup, single] { f.isAutomaticTextCompletionEnabled = false }
    multi.isRichText = false
    multi.isAutomaticQuoteSubstitutionEnabled = false; multi.isAutomaticDashSubstitutionEnabled = false
    multi.isAutomaticTextReplacementEnabled = false; multi.isAutomaticSpellingCorrectionEnabled = false
    multi.isContinuousSpellCheckingEnabled = false
    scroll.documentView = multi; scroll.hasVerticalScroller = true
    window.contentView?.addSubview(setup); window.contentView?.addSubview(single); window.contentView?.addSubview(scroll)
    window.title = "Probe361 owned AppKit fixture"
    NotificationCenter.default.addObserver(forName: NSText.didChangeNotification, object: nil, queue: nil) { [weak self] n in
      guard let self, !self.applying, let view = self.view, n.object as AnyObject === view else { return }
      self.changes += 1
      guard !self.hit, self.effect == "rewrite" || self.effect == "add", let storage = view.textStorage else { return }
      // A delivery that left no character at the rewrite's offset cannot take the control: it stays unrealized.
      if self.effect == "rewrite" && self.start >= storage.length { return }
      self.hit = true; self.hitVia = "change"
      self.applying = true; defer { self.applying = false }
      let caret = view.selectedRange()
      if self.effect == "rewrite" {
        storage.replaceCharacters(in: NSRange(location: self.start, length: 1), with: self.rewriteChar)
        view.setSelectedRange(caret)
      } else {
        storage.replaceCharacters(in: NSRange(location: NSMaxRange(caret), length: 0), with: "z")
        view.setSelectedRange(NSRange(location: NSMaxRange(caret) + 1, length: 0))
      }
    }
    NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] e in
      guard let self, let view = self.view, self.window.firstResponder === view else { return e }
      self.keys += 1
      if e.modifierFlags.contains(.command) && e.keyCode == 9 {
        self.pastes += 1
        if !self.hit && self.effect == "stale" {
          self.hit = true; self.hitVia = "keydown"
          view.setSelectedRange(NSRange(location: self.staleTo, length: 0))
        }
      }
      return e
    }
    window.makeKeyAndOrderFront(nil)
    NSApplication.shared.activate(ignoringOtherApps: true)
    emit(["ready": true])
  }

  func command(_ q: [String: Any]) {
    let op = q["op"] as? String, n = q["trial"] as? Int
    if op == "prepare", let n {
      trial = n; target = ""; effect = "none"; hit = false; hitVia = ""; pastes = 0; changes = 0; keys = 0
      single.stringValue = ""; multi.string = ""
      setup.stringValue = q["setupText"] as? String ?? ""
      window.makeFirstResponder(setup)
      if let e = setup.currentEditor() { e.selectedRange = NSRange(location: (setup.stringValue as NSString).length, length: 0) }
    } else if op == "seed", n == trial, let t = q["target"] as? String, ["single", "multi"].contains(t),
              let initial = q["initial"] as? String, let s = q["start"] as? Int, let e = q["end"] as? Int {
      target = t; effect = q["effect"] as? String ?? "none"; start = s
      staleTo = q["staleTo"] as? Int ?? 0; rewriteChar = q["rewriteChar"] as? String ?? ""
      if t == "single" {
        single.stringValue = initial
        window.makeFirstResponder(single)
      } else {
        multi.string = initial
        window.makeFirstResponder(multi)
      }
      view?.setSelectedRange(NSRange(location: s, length: e - s))
    }
    let v = view, range = v?.selectedRange(), content = value
    let shape = target == "single" ? single.window === window : target == "multi" ? multi.window === window : false
    var out: [String: Any] = ["trial": trial, "target": target, "shape": shape,
      "focused": v != nil && window.firstResponder === v,
      "setupFocused": setup.currentEditor() != nil && window.firstResponder === setup.currentEditor(),
      "exact": same(content, q["expected"]),
      "controlExact": same(content, q["control"]),
      "selection": range?.location == (q["start"] as? Int) && range.map(NSMaxRange) == (q["end"] as? Int),
      "hit": hit, "hitVia": hitVia, "pastes": pastes, "pasteInputs": changes, "keys": keys, "request": q["request"] ?? 0]
    if let s = q["setupText"] as? String { out["setupExact"] = same(setup.stringValue, s) } else { out["setupExact"] = NSNull() }
    emit(out)
  }
}

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let fixture = Fixture()
fixture.launch()
DispatchQueue.global().async {
  while let line = readLine() {
    guard let q = (try? JSONSerialization.jsonObject(with: Data(line.utf8))) as? [String: Any] else { continue }
    DispatchQueue.main.async { fixture.command(q) }
  }
}
app.run()
