import ApplicationServices
import Foundation

// `cua-engine --probe text-view --pid <n>` (Interfaces, UserProbe; M2b.1b's residue cells): a reading of a text view the
// harness owns that goes around the engine's observation, through the approved bundle's Accessibility grant. For each
// of the process's windows (AXWindows, a minimized one included): whether it reads minimized, and its first text area's
// AXSelectedTextRange and the scroll bars' values of the scroll area around it. Plus the application's focused element:
// its role, and which window's text area it is, if any. Numbers, Booleans and roles only: no title, value or text ever
// leaves. With `--set-horizontal <v>` it first writes that value to the first text area's horizontal scroll bar (the
// only write it makes, on a harness-owned window). The `select_text` minimized cell reads the selection the engine's observation (which goes through the focused
// element) may not see; the horizontal scroll cell reads the content's position for both engines' lanes alike.

/// The probe's arguments: `--pid <n>`, and optionally `--set-horizontal <v>`, a value in [0, 1] written to the text
/// area's horizontal scroll bar before the reading (the hscroll cell's starting position, set by the harness's own AX
/// path, not by either lane under test).
struct TextViewRequest: Equatable {
  let pid: pid_t
  var setHorizontal: Double? = nil

  static func parse(_ arguments: [String]) -> TextViewRequest? {
    var pid: pid_t?, set: Double?
    var rest = arguments[...]
    while let flag = rest.popFirst() {
      guard let value = rest.popFirst() else { return nil }
      switch flag {
      case "--pid" where pid == nil:
        guard let n = Int32(value), n > 0 else { return nil }
        pid = n
      case "--set-horizontal" where set == nil:
        guard let v = Double(value), v.isFinite, v >= 0, v <= 1 else { return nil }
        set = v
      default: return nil
      }
    }
    return pid.map { TextViewRequest(pid: $0, setHorizontal: set) }
  }
}

/// `--pid <n>` alone (the read-only form); nil for anything else.
func textViewProbePid(_ arguments: [String]) -> pid_t? {
  guard let request = TextViewRequest.parse(arguments), request.setHorizontal == nil else { return nil }
  return request.pid
}

/// The bounds of the walk that looks for a window's text area: preorder, breadth first, this many elements at most.
let textViewSearchLimit = 4_000

/// The first element of `role` under `root` (root excluded), breadth first, at most `limit` elements visited.
func firstDescendant<Element>(of root: Element, role: String, roleOf: (Element) -> String?, children: (Element) -> [Element],
                              limit: Int = textViewSearchLimit) -> Element? {
  var queue = children(root)
  var visited = 0
  while !queue.isEmpty, visited < limit {
    let element = queue.removeFirst()
    visited += 1
    if roleOf(element) == role { return element }
    queue.append(contentsOf: children(element))
  }
  return nil
}

/// The nearest ancestor of `element` with `role`, at most `levels` up.
func nearestAncestor<Element>(of element: Element, role: String, roleOf: (Element) -> String?, parent: (Element) -> Element?,
                              levels: Int = 12) -> Element? {
  var current = parent(element)
  var level = 0
  while let node = current, level < levels {
    if roleOf(node) == role { return node }
    current = parent(node)
    level += 1
  }
  return nil
}

extension Probe {
  static func textView(_ arguments: [String]) -> Int32 {
    guard let request = TextViewRequest.parse(arguments) else { return emit(["error": "usage: --probe text-view --pid <n> [--set-horizontal <0..1>]"], status: 64) }
    let pid = request.pid
    var setWire: [String: Any]? = nil
    guard AXIsProcessTrusted() else { return emit(["error": "this bundle has no Accessibility grant"], status: 3) }
    let app = prepare(AXUIElementCreateApplication(pid))
    let windowsRead = copyAttribute(app, kAXWindowsAttribute)
    guard windowsRead.error == .success else {
      return emit(["pid": Int(pid), "error": "the windows could not be read (AXError \(windowsRead.error.rawValue))"], status: 2)
    }
    let roleOf: (AXUIElement) -> String? = { stringAttribute($0, kAXRoleAttribute) }
    let children: (AXUIElement) -> [AXUIElement] = { elementList(attribute($0, kAXChildrenAttribute)).map(prepare) }
    let focused = elementAttribute(app, kAXFocusedUIElementAttribute)
    var focusedWindow: Int? = nil
    var windows: [[String: Any]] = []
    for (index, window) in elementList(windowsRead.value).map(prepare).enumerated() {
      var entry: [String: Any] = ["minimized": bool(attribute(window, kAXMinimizedAttribute)) ?? NSNull()]
      if let area = firstDescendant(of: window, role: kAXTextAreaRole, roleOf: roleOf, children: children) {
        var read: [String: Any] = ["selectedRange": rangeWire(attribute(area, kAXSelectedTextRangeAttribute)) ?? NSNull()]
        if let scrollArea = nearestAncestor(of: area, role: kAXScrollAreaRole, roleOf: roleOf, parent: { elementAttribute($0, kAXParentAttribute) }) {
          if let target = request.setHorizontal, setWire == nil {
            let bar = elementAttribute(scrollArea, kAXHorizontalScrollBarAttribute)
            let written = bar.map { AXUIElementSetAttributeValue($0, kAXValueAttribute as CFString, NSNumber(value: target)) }
            setWire = ["requested": target, "written": written.map { $0 == .success } ?? false, "error": written.map { Int($0.rawValue) } ?? NSNull()]
            usleep(200_000)  // the scroll view moves its content on the next pass of the app's run loop
          }
          let value: (String) -> Any = { name in
            elementAttribute(scrollArea, name).flatMap { scalar(attribute($0, kAXValueAttribute)) } ?? NSNull()
          }
          read["scrollBars"] = ["horizontal": value(kAXHorizontalScrollBarAttribute), "vertical": value(kAXVerticalScrollBarAttribute)]
        }
        if let focused, CFEqual(focused, area) { focusedWindow = index }
        entry["textArea"] = read
      } else {
        entry["textArea"] = NSNull()
      }
      windows.append(entry)
    }
    let focusedRole: Any = focused.flatMap(roleOf) ?? NSNull()
    let focusedArea: Any = focusedWindow ?? NSNull()
    var answer: [String: Any] = ["pid": Int(pid), "windows": windows, "focused": ["role": focusedRole, "textAreaOfWindow": focusedArea]]
    if let target = request.setHorizontal { answer["set"] = setWire ?? ["requested": target, "written": false, "error": "no horizontal scroll bar"] }
    return emit(answer, status: 0)
  }
}
