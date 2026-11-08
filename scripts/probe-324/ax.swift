// #324's AX reader for TextEdit as the target (its effects, read without the engine):
//   ax324 state <pid>        the app's focused element: role, value (its length and first 160 characters), the selected
//                            range; the focused window's title; its first vertical scroll bar's value (a scroll moved it)
//   ax324 reset <pid> <text> the focused element's value set to <text> and its caret put at 0, the scroll bar at the top
import AppKit
import ApplicationServices
import Foundation

setvbuf(stdout, nil, _IOLBF, 0)
func emit(_ o: [String: Any]) { print(String(data: try! JSONSerialization.data(withJSONObject: o, options: [.sortedKeys]), encoding: .utf8)!) }
func attr(_ e: AXUIElement, _ name: String) -> CFTypeRef? {
  var v: CFTypeRef?
  return AXUIElementCopyAttributeValue(e, name as CFString, &v) == .success ? v : nil
}
func element(_ v: CFTypeRef?) -> AXUIElement? { v.flatMap { CFGetTypeID($0) == AXUIElementGetTypeID() ? ($0 as! AXUIElement) : nil } }
func scrollBar(_ e: AXUIElement, depth: Int = 0) -> AXUIElement? {
  if (attr(e, kAXRoleAttribute) as? String) == "AXScrollArea", let bar = element(attr(e, kAXVerticalScrollBarAttribute)) { return bar }
  guard depth < 6, let kids = attr(e, kAXChildrenAttribute) as? [AXUIElement] else { return nil }
  for k in kids { if let b = scrollBar(k, depth: depth + 1) { return b } }
  return nil
}
let a = CommandLine.arguments
guard a.count >= 3, let pid = pid_t(a[2]) else { emit(["usage": true]); exit(2) }
let app = AXUIElementCreateApplication(pid)
AXUIElementSetMessagingTimeout(app, 1)
let focused = element(attr(app, kAXFocusedUIElementAttribute))
let window = element(attr(app, kAXFocusedWindowAttribute)) ?? element((attr(app, kAXWindowsAttribute) as? [AXUIElement])?.first as CFTypeRef?)
if a[1] == "reset", a.count >= 4 {
  var out: [String: Any] = [:]
  if let f = focused {
    out["value"] = AXUIElementSetAttributeValue(f, kAXValueAttribute as CFString, a[3] as CFString).rawValue
    var r = CFRange(location: 0, length: 0)
    out["sel"] = AXUIElementSetAttributeValue(f, kAXSelectedTextRangeAttribute as CFString, AXValueCreate(.cfRange, &r)!).rawValue
  }
  if let w = window, let bar = scrollBar(w) { out["scroll"] = AXUIElementSetAttributeValue(bar, kAXValueAttribute as CFString, 0 as CFNumber).rawValue }
  emit(out)
  exit(0)
}
var out: [String: Any] = ["focused": focused != nil]
if let f = focused {
  out["role"] = attr(f, kAXRoleAttribute) as? String ?? NSNull()
  let value = attr(f, kAXValueAttribute) as? String
  out["length"] = value.map { $0.utf16.count } ?? NSNull()
  out["value"] = value.map { String($0.prefix(160)) } ?? NSNull()
  var r = CFRange()
  if let v = attr(f, kAXSelectedTextRangeAttribute), CFGetTypeID(v) == AXValueGetTypeID(), AXValueGetValue(v as! AXValue, .cfRange, &r) {
    out["sel"] = [r.location, r.length]
    // The text around the caret, 40 UTF-16 units each side (a typed marker lands there).
    if let value {
      let u = Array(value.utf16), lo = max(0, r.location - 40), hi = min(u.count, r.location + 40)
      out["around"] = lo < hi ? String(utf16CodeUnits: Array(u[lo..<hi]), count: hi - lo) : ""
    }
  }
}
if let w = window {
  out["window"] = attr(w, kAXTitleAttribute) as? String ?? NSNull()
  if let bar = scrollBar(w) { out["scroll"] = (attr(bar, kAXValueAttribute) as? NSNumber)?.doubleValue ?? NSNull() }
}
emit(out)
