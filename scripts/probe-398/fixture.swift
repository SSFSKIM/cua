// The owned AppKit fixture for #398: the browser page's fields (./page.mjs) as NSTextFields and an NSSearchField, each
// with its own accessibility label (so the placeholder is the only attribute that changes), and the two twins alike in
// everything but their placeholder. It judges its own fields: only booleans, counts and closed names leave it.
// - static: never changes; focus: cleared when it becomes first responder, restored when editing ends; rotate: rotates
//   every 150 ms while its cell runs; input: switches on the first text change; search: an NSSearchField whose hint
//   switches when it becomes first responder and back when editing ends.
// - twins: rebuilt at every prepare; `mark` recreates the first alike, recreates it with another placeholder, or removes it.
// - solo: its own label, no twin; `mark` recreates it with another placeholder.
// Every field but the target, the setup field's canary included, is reported when written (`othersWritten`).
import AppKit
import Foundation

guard ProcessInfo.processInfo.environment["RUNNER_ENVIRONMENT"] == "github-hosted" else { exit(2) }
func emit(_ q: [String: Any]) {
  let d = try! JSONSerialization.data(withJSONObject: q)
  print(String(decoding: d, as: UTF8.self)); fflush(stdout)
}
let P: [String: [String]] = [
  "static": ["Probe398 static hint"], "focus": ["Probe398 email address", ""],
  "rotate": ["Probe398 search people", "Probe398 search files", "Probe398 search messages"],
  "input": ["Probe398 type a name", "Probe398 keep typing"], "search": ["Probe398 search", "Probe398 search this folder"],
  "twinA": ["Probe398 first name"], "twinB": ["Probe398 last name"], "twinRenamed": ["Probe398 given name"],
  "solo": ["Probe398 street address"], "soloRenamed": ["Probe398 street and number"],
]
let names = ["static", "focus", "rotate", "input", "search", "twinA", "twinB", "solo"]

/// A field that reports becoming first responder (its focus event).
final class Field: NSTextField {
  var onFocus: (() -> Void)?
  override func becomeFirstResponder() -> Bool {
    let ok = super.becomeFirstResponder()
    if ok { onFocus?() }
    return ok
  }
}
final class Search: NSSearchField {
  var onFocus: (() -> Void)?
  override func becomeFirstResponder() -> Bool {
    let ok = super.becomeFirstResponder()
    if ok { onFocus?() }
    return ok
  }
}

final class Fixture: NSObject, NSTextFieldDelegate, NSSearchFieldDelegate {
  let window = NSWindow(contentRect: NSRect(x: 400, y: 120, width: 600, height: 420), styleMask: [.titled, .closable],
                        backing: .buffered, defer: false)
  let setup = NSTextField(frame: NSRect(x: 25, y: 370, width: 540, height: 26))
  var f: [String: NSTextField] = [:]
  var trial = -1, cell = "", target = ""
  var marked: NSTextField?
  var rotation: Timer?, rotateAt = 0
  var changes: [String: Int] = [:], focuses: [String: Int] = [:], inputs: [String: Int] = [:]
  let frames: [String: NSRect] = [
    "static": NSRect(x: 25, y: 330, width: 540, height: 26), "focus": NSRect(x: 25, y: 290, width: 540, height: 26),
    "rotate": NSRect(x: 25, y: 250, width: 540, height: 26), "input": NSRect(x: 25, y: 210, width: 540, height: 26),
    "search": NSRect(x: 25, y: 170, width: 540, height: 26), "twinA": NSRect(x: 25, y: 110, width: 540, height: 26),
    "twinB": NSRect(x: 25, y: 70, width: 540, height: 26), "solo": NSRect(x: 25, y: 25, width: 540, height: 26),
  ]

  func name(of field: NSTextField) -> String? { names.first { f[$0] === field } }
  func setPlaceholder(_ k: String, _ text: String) {
    guard let field = f[k], field.placeholderString != text else { return }
    field.placeholderString = text
    changes[k, default: 0] += 1
  }
  func make(_ k: String, placeholder: String, label: String) -> NSTextField {
    let field: NSTextField
    if k == "search" {
      let s = Search(frame: frames[k]!)
      s.onFocus = { [weak self, weak s] in self?.focused(k, s) }
      field = s
    } else {
      let t = Field(frame: frames[k]!)
      t.onFocus = { [weak self, weak t] in self?.focused(k, t) }
      field = t
    }
    field.setAccessibilityLabel(label)
    field.placeholderString = placeholder
    field.isAutomaticTextCompletionEnabled = false
    field.delegate = self
    return field
  }
  func focused(_ k: String, _ field: NSTextField?) {
    guard let field, f[k] === field else { return }
    focuses[k, default: 0] += 1
    if k == "focus" { setPlaceholder("focus", "") }
    if k == "search" { setPlaceholder("search", P["search"]![1]) }
  }
  func controlTextDidChange(_ n: Notification) {
    guard let field = n.object as? NSTextField, let k = name(of: field) else { return }
    inputs[k, default: 0] += 1
    if k == "input" { setPlaceholder("input", P["input"]![1]) }
  }
  func controlTextDidEndEditing(_ n: Notification) {
    guard let field = n.object as? NSTextField, let k = name(of: field) else { return }
    if k == "focus" { setPlaceholder("focus", P["focus"]![0]) }
    if k == "search" { setPlaceholder("search", P["search"]![0]) }
  }
  func rebuildTwins() {
    f["twinA"]?.removeFromSuperview(); f["twinB"]?.removeFromSuperview()
    f["twinA"] = make("twinA", placeholder: P["twinA"]![0], label: "Probe398 twin")
    f["twinB"] = make("twinB", placeholder: P["twinB"]![0], label: "Probe398 twin")
    window.contentView?.addSubview(f["twinA"]!); window.contentView?.addSubview(f["twinB"]!)
    f["solo"]?.removeFromSuperview()
    f["solo"] = make("solo", placeholder: P["solo"]![0], label: "Probe398 solo")
    window.contentView?.addSubview(f["solo"]!)
  }

  func menu() {
    let bar = NSMenu(), appItem = NSMenuItem(), editItem = NSMenuItem()
    bar.addItem(appItem); bar.addItem(editItem)
    let app = NSMenu()
    app.addItem(withTitle: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    appItem.submenu = app
    let edit = NSMenu(title: "Edit")
    edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
    edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
    edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
    edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
    editItem.submenu = edit
    NSApplication.shared.mainMenu = bar
  }

  func launch() {
    menu()
    setup.setAccessibilityLabel("Probe398 setup")
    setup.isAutomaticTextCompletionEnabled = false
    window.contentView?.addSubview(setup)
    for k in ["static", "focus", "rotate", "input", "search"] {
      f[k] = make(k, placeholder: P[k]![0], label: "Probe398 \(k)")
      window.contentView?.addSubview(f[k]!)
    }
    rebuildTwins()
    window.title = "Probe398 owned AppKit fixture"
    window.makeKeyAndOrderFront(nil)
    NSApplication.shared.activate(ignoringOtherApps: true)
    emit(["ready": true])
  }

  func value(_ field: NSTextField) -> String { (field.currentEditor() as? NSTextView)?.string ?? field.stringValue }
  func focusedName() -> String {
    guard let r = window.firstResponder else { return "none" }
    if let editor = r as? NSTextView, editor.isFieldEditor, let owner = editor.delegate as? NSTextField {
      return owner === setup ? "setup" : name(of: owner) ?? "other"
    }
    if let field = r as? NSTextField { return field === setup ? "setup" : name(of: field) ?? "other" }
    return "other"
  }

  func command(_ q: [String: Any]) {
    let op = q["op"] as? String, n = q["trial"] as? Int
    var error = false
    if op == "prepare", let n, let c = q["cell"] as? String {
      rotation?.invalidate(); rotation = nil
      trial = n; cell = c; marked = nil
      target = ["static", "focus", "rotate", "input", "search"].contains(c) ? c : c == "solo-renamed" ? "solo" : c.hasPrefix("twin") ? "twinA" : ""
      if target.isEmpty { error = true }
      window.makeFirstResponder(nil)
      for k in ["static", "focus", "rotate", "input", "search"] { f[k]!.stringValue = "" }
      f["static"]!.placeholderString = P["static"]![0]; f["focus"]!.placeholderString = P["focus"]![0]
      f["rotate"]!.placeholderString = P["rotate"]![0]; f["input"]!.placeholderString = P["input"]![0]
      f["search"]!.placeholderString = P["search"]![0]
      rebuildTwins()
      setup.stringValue = q["setupText"] as? String ?? ""
      window.makeFirstResponder(setup)
      if let e = setup.currentEditor() { e.selectedRange = NSRange(location: (setup.stringValue as NSString).length, length: 0) }
      if c == "rotate" {
        rotateAt = 0
        let t = Timer(timeInterval: 0.15, repeats: true) { [weak self] _ in
          guard let self else { return }
          self.rotateAt = (self.rotateAt + 1) % P["rotate"]!.count
          self.setPlaceholder("rotate", P["rotate"]![self.rotateAt])
        }
        RunLoop.main.add(t, forMode: .common)
        rotation = t
      }
      changes = [:]; focuses = [:]; inputs = [:]
    } else if op == "mark", n == trial {
      if cell == "twin-recreate" || cell == "twin-renamed", let old = f["twinA"] {
        let fresh = make("twinA", placeholder: cell == "twin-renamed" ? P["twinRenamed"]![0] : P["twinA"]![0], label: "Probe398 twin")
        old.removeFromSuperview()
        f["twinA"] = fresh
        window.contentView?.addSubview(fresh)
      } else if cell == "twin-removed" {
        f["twinA"]?.removeFromSuperview()
      } else if cell == "solo-renamed", let old = f["solo"] {
        let fresh = make("solo", placeholder: P["soloRenamed"]![0], label: "Probe398 solo")
        old.removeFromSuperview()
        f["solo"] = fresh
        window.contentView?.addSubview(fresh)
      }
      marked = f[target]
      changes = [:]; focuses = [:]; inputs = [:]
    } else if op != "read" || n != trial {
      error = true
    }
    let t = f[target]
    let others = names.filter { $0 != target && f[$0] != nil }
    var out: [String: Any] = [
      "trial": trial, "cell": cell, "target": target, "present": t?.window === window,
      "sameNode": t != nil && t === marked,
      "exact": t != nil && (q["expected"] as? String).map { Array(value(t!).utf16) == Array($0.utf16) } == true,
      "targetEmpty": t.map { value($0).isEmpty } ?? false,
      // The setup field's canary counts as written once it no longer reads as set.
      "othersWritten": ((q["setupText"] as? String).map { value(setup) != $0 } == true ? ["setup"] : [])
        + others.filter { !value(f[$0]!).isEmpty },
      "focused": focusedName(), "placeholderChanges": changes[target] ?? 0,
      "focusesSinceMark": Dictionary(uniqueKeysWithValues: names.map { ($0, focuses[$0] ?? 0) }),
      "inputsSinceMark": Dictionary(uniqueKeysWithValues: names.map { ($0, inputs[$0] ?? 0) }),
      "rotating": rotation != nil, "request": q["request"] ?? 0,
    ]
    if let s = q["setupText"] as? String { out["setupExact"] = value(setup) == s } else { out["setupExact"] = NSNull() }
    if error { out["error"] = true }
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
