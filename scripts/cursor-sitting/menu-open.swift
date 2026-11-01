// Chrome for Testing's open menus, for #187's slot (./item-187.mjs): whether an activation click the paste posts outside
// the window's frame opened a menu. Run as a binary compiled into the harness cache:
//   menu-open read <pid>
//       One JSON line: {"trusted", "ok", "failed", "menuBar", "items", "selected", "openMenus", "focusedRole"}: the menu
//       bar's items and how many are selected (an open menu bar menu), the menus among the application's own children (an
//       open context or pop-up menu), and the role of the focused element. `ok` is false, and `failed` names the reads,
//       when any read the snapshot rests on did not succeed: zero counts then say nothing. Roles, booleans and counts
//       only: no title is read.
//   menu-open watch <pid> [<max seconds>]
//       An AXObserver on the application for AXMenuOpened, one JSON line at the start ({"kind": "start", "at", "pid",
//       "target"}; `pid` is this watcher's own), one per notification ({"kind": "menu-opened", "at"}) and one at the end
//       ({"kind": "end", "at", "why"}), on SIGTERM or SIGINT, when its parent exits, or after <max seconds> (1200).
// `at` is wall-clock milliseconds, as the kit's. It never asks for a grant: an untrusted terminal answers
// {"trusted": false} and reads nothing.
import ApplicationServices
import Foundation

let wall = { Date().timeIntervalSince1970 * 1000 }
func emit(_ object: [String: Any]) {
  let data = try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
  FileHandle.standardOutput.write(data + Data("\n".utf8))
}

let args = CommandLine.arguments
guard (3...4).contains(args.count), ["read", "watch"].contains(args[1]), let pid = Int32(args[2]) else {
  FileHandle.standardError.write(Data("usage: menu-open read|watch <pid> [<max seconds>]\n".utf8))
  exit(64)
}
guard AXIsProcessTrusted() else { emit(["trusted": false]); exit(0) }
let app = AXUIElementCreateApplication(pid)

func copy(_ element: AXUIElement, _ attribute: String) -> CFTypeRef? {
  var value: CFTypeRef?
  return AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success ? value : nil
}
func element(_ value: CFTypeRef?) -> AXUIElement? {
  guard let value, CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
  return (value as! AXUIElement)
}
func role(_ e: AXUIElement) -> String? { copy(e, kAXRoleAttribute) as? String }

/// One attribute read with its status: a value only on success.
func read(_ e: AXUIElement, _ attribute: String) -> (ok: Bool, value: CFTypeRef?) {
  var value: CFTypeRef?
  let status = AXUIElementCopyAttributeValue(e, attribute as CFString, &value)
  return (status == .success, status == .success ? value : nil)
}

if args[1] == "read" {
  // `ok` only when every read the snapshot rests on succeeded: the menu bar, its items, each item's selection, the
  // application's children with their roles, and the focused element (none focused, AXError noValue, is a reading).
  var ok = true, items = 0, selected = 0, openMenus = 0
  var failed: [String] = []
  let barRead = read(app, kAXMenuBarAttribute), bar = element(barRead.value)
  if bar == nil { ok = false; failed.append("menuBar") }
  if let bar {
    let children = read(bar, kAXChildrenAttribute)
    if let list = children.value as? [AXUIElement] {
      for item in list {
        items += 1
        let sel = read(item, kAXSelectedAttribute)
        if !sel.ok { ok = false; failed.append("selected") }
        if (sel.value as? Bool) == true { selected += 1 }
      }
    } else { ok = false; failed.append("menuBarItems") }
  }
  if let list = read(app, kAXChildrenAttribute).value as? [AXUIElement] {
    for child in list {
      let r = read(child, kAXRoleAttribute)
      if !r.ok { ok = false; failed.append("childRole") }
      if (r.value as? String) == kAXMenuRole { openMenus += 1 }
    }
  } else { ok = false; failed.append("children") }
  var value: CFTypeRef?
  let focusStatus = AXUIElementCopyAttributeValue(app, kAXFocusedUIElementAttribute as CFString, &value)
  var focused: String? = nil
  if focusStatus == .success, let f = element(value) { focused = role(f) } else if focusStatus != .noValue { ok = false; failed.append("focused") }
  emit(["trusted": true, "ok": ok, "failed": Array(Set(failed)).sorted(), "menuBar": bar != nil, "items": items, "selected": selected, "openMenus": openMenus,
        "focusedRole": focused ?? NSNull()])
  exit(0)
}

let maxSeconds = args.count > 3 ? max(1, Double(args[3]) ?? 1200) : 1200
var created: AXObserver?
let callback: AXObserverCallback = { _, _, _, _ in emit(["kind": "menu-opened", "at": wall()]) }
guard AXObserverCreate(pid, callback, &created) == .success, let observer = created else {
  emit(["kind": "end", "at": wall(), "why": "the observer could not be created"])
  exit(1)
}
let added = AXObserverAddNotification(observer, app, kAXMenuOpenedNotification as CFString, nil)
CFRunLoopAddSource(CFRunLoopGetCurrent(), AXObserverGetRunLoopSource(observer), .defaultMode)
emit(["kind": "start", "at": wall(), "pid": Int(ProcessInfo.processInfo.processIdentifier), "target": Int(pid), "registered": added == .success])

func finish(_ why: String) -> Never {
  emit(["kind": "end", "at": wall(), "why": why])
  exit(0)
}
signal(SIGTERM, SIG_IGN)
signal(SIGINT, SIG_IGN)
let term = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
term.setEventHandler { finish("SIGTERM") }
term.resume()
let interrupt = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
interrupt.setEventHandler { finish("SIGINT") }
interrupt.resume()
let parent = getppid()
let orphan = Timer(timeInterval: 1, repeats: true) { _ in if getppid() != parent { finish("its parent exited") } }
RunLoop.main.add(orphan, forMode: .default)
DispatchQueue.main.asyncAfter(deadline: .now() + maxSeconds) { finish("max seconds") }
CFRunLoopRun()
