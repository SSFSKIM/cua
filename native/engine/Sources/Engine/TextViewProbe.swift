import ApplicationServices
import Foundation

// `cua-engine --probe text-view --pid <n>` (Interfaces, UserProbe; M2b.1b's residue cells): a reading of a text view the
// harness owns that goes around the engine's observation, through the approved bundle's Accessibility grant. For each
// of the process's windows (AXWindows, a minimized one included): whether it reads minimized, and its first text area's
// AXSelectedTextRange and the scroll bars' values of the scroll area around it. Plus the application's focused element:
// its role, and which window's text area it is, if any. Numbers, Booleans and roles only: no title, value or text ever
// leaves. The `select_text` minimized cell reads the selection the engine's observation (which goes through the focused
// element) may not see; the horizontal scroll cell reads the content's position for both engines' lanes alike.

/// `--pid <n>`, the one argument; nil for anything else.
func textViewProbePid(_ arguments: [String]) -> pid_t? {
  guard arguments.count == 2, arguments[0] == "--pid", let pid = Int32(arguments[1]), pid > 0 else { return nil }
  return pid
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
    guard let pid = textViewProbePid(arguments) else { return emit(["error": "usage: --probe text-view --pid <n>"], status: 64) }
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
    return emit(["pid": Int(pid), "windows": windows, "focused": ["role": focusedRole, "textAreaOfWindow": focusedArea]], status: 0)
  }
}
