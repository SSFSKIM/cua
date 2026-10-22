import ApplicationServices
import Foundation

// `cua-engine --probe text-view --pid <n>` (Interfaces, UserProbe; M2b.1b's residue cells): a reading of a text view the
// harness owns that goes around the engine's observation, through the approved bundle's Accessibility grant. For each
// of the process's windows (AXWindows, a minimized one included): whether it reads minimized, and its first text area's
// AXSelectedTextRange and the scroll bars' values of the scroll area around it. Plus the application's focused element:
// its role, and which window's text area it is, if any. Numbers, Booleans and roles only: no title, value or text ever
// leaves. With `--set-horizontal <v>` and `--set-vertical <v>` it first writes those values to the first text area's
// scroll bars (the only writes it makes, on a harness-owned window), the horizontal one after its far end, reporting
// whether the content moved (`contentMoved`); the reading carries whether the horizontal bar is enabled
// (`horizontalEnabled`). A bar that is disabled, or whose write moves nothing, scrolls nothing horizontally. The
// `select_text` minimized cell and route 4's click read the selection the engine's observation (which goes through the
// focused element) may not see; the horizontal scroll cell reads the content's position for both engines' lanes alike,
// and whether the text area's midpoint shows (`midpointShows`, the condition under which an element scroll's
// positionElement does nothing before its wheel).

/// The probe's arguments: `--pid <n>`, and optionally `--set-horizontal <v>` and `--set-vertical <v>`, values in [0, 1]
/// written to the text area's scroll bars before the reading (the hscroll cell's starting position, set by the harness's
/// own AX path, not by either lane under test).
struct TextViewRequest: Equatable {
  let pid: pid_t
  var setHorizontal: Double? = nil
  var setVertical: Double? = nil

  static func parse(_ arguments: [String]) -> TextViewRequest? {
    var pid: pid_t?, horizontal: Double?, vertical: Double?
    var rest = arguments[...]
    let unit: (String) -> Double? = { value in Double(value).flatMap { $0.isFinite && $0 >= 0 && $0 <= 1 ? $0 : nil } }
    while let flag = rest.popFirst() {
      guard let value = rest.popFirst() else { return nil }
      switch flag {
      case "--pid" where pid == nil:
        guard let n = Int32(value), n > 0 else { return nil }
        pid = n
      case "--set-horizontal" where horizontal == nil:
        guard let v = unit(value) else { return nil }
        horizontal = v
      case "--set-vertical" where vertical == nil:
        guard let v = unit(value) else { return nil }
        vertical = v
      default: return nil
      }
    }
    return pid.map { TextViewRequest(pid: $0, setHorizontal: horizontal, setVertical: vertical) }
  }

  var writes: Bool { setHorizontal != nil || setVertical != nil }
}

/// `--pid <n>` alone (the read-only form); nil for anything else.
func textViewProbePid(_ arguments: [String]) -> pid_t? {
  guard let request = TextViewRequest.parse(arguments), !request.writes else { return nil }
  return request.pid
}

/// The far end of the horizontal bar from `start`, written before it so that writing the start moves the content whenever
/// the bar truly scrolls it, whatever the bar read before (a second lane finds it where the first left it).
func horizontalStartAway(from start: Double) -> Double { start < 0.5 ? 1 : 0 }

/// Writes the horizontal bar to its far end from `start`, then to `start`, reading the content's x (the text area's
/// frame) after each. A bar can take a written value and move nothing: TextEdit's page view laid out within its window
/// reads back the written value from a disabled bar (2026-10-21). -> the start's write error, and whether the content
/// moved (nil when its position could not be read).
func writeHorizontalStart(_ start: Double, write: (Double) -> AXError, settle: () -> Void, contentX: () -> CGFloat?) -> (error: AXError, contentMoved: Bool?) {
  _ = write(horizontalStartAway(from: start))
  settle()
  let away = contentX()
  let error = write(start)
  settle()
  guard let away, let there = contentX() else { return (error, nil) }
  return (error, abs(there - away) >= 0.5)
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
    guard let request = TextViewRequest.parse(arguments) else { return emit(["error": "usage: --probe text-view --pid <n> [--set-horizontal <0..1>] [--set-vertical <0..1>]"], status: 64) }
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
          if request.writes, setWire == nil {
            var wire: [String: Any] = [:]
            let settle = { _ = usleep(200_000) }  // the scroll view moves its content on the next pass of the app's run loop
            for (name, target, attribute) in [("horizontal", request.setHorizontal, kAXHorizontalScrollBarAttribute), ("vertical", request.setVertical, kAXVerticalScrollBarAttribute)] {
              guard let target else { continue }
              guard let bar = elementAttribute(scrollArea, attribute) else {
                wire[name] = ["requested": target, "written": false, "error": "no \(name) scroll bar"]
                continue
              }
              let write = { (value: Double) in AXUIElementSetAttributeValue(bar, kAXValueAttribute as CFString, NSNumber(value: value)) }
              if name == "horizontal" {
                let start = writeHorizontalStart(target, write: write, settle: settle, contentX: { AXOps.live.frame(area)?.minX })
                wire[name] = ["requested": target, "written": start.error == .success, "error": Int(start.error.rawValue), "contentMoved": start.contentMoved ?? NSNull()]
              } else {
                let error = write(target)
                wire[name] = ["requested": target, "written": error == .success, "error": Int(error.rawValue)]
              }
            }
            setWire = wire
            settle()
          }
          let value: (String) -> Any = { name in
            elementAttribute(scrollArea, name).flatMap { scalar(attribute($0, kAXValueAttribute)) } ?? NSNull()
          }
          let horizontalEnabled: Any = elementAttribute(scrollArea, kAXHorizontalScrollBarAttribute).flatMap { bool(attribute($0, kAXEnabledAttribute)) } ?? NSNull()
          read["scrollBars"] = ["horizontal": value(kAXHorizontalScrollBarAttribute), "vertical": value(kAXVerticalScrollBarAttribute), "horizontalEnabled": horizontalEnabled]
        }
        // As positionElement reads it (Positioning.swift): the frame's midpoint inside the part its clipping ancestors show.
        let ax = AXOps.live
        read["midpointShows"] = midpointShows(ax.frame(area), in: ax.visible(area))
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
    if request.writes { answer["set"] = setWire ?? ["error": "no scroll area around a text area"] }
    return emit(answer, status: 0)
  }
}
