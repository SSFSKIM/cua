// #321's window-order tool: every on-screen window (CGWindowList), and a watch of the target's windows against
// TextEdit's. Times are Unix milliseconds, to line up with the engine's delivery record (holdStartedAt, postedAt,
// releasedAt).
//   win dump                         every on-screen window front to back: owner, pid, layer, number, bounds, name, alpha
//   win watch <pid> <cover> <ms> <interval>  prints {ready}, waits for a line on stdin, then samples every <interval>
//                                    ms for <ms>: the first sample and every change of the layer-0 order (owners and
//                                    numbers), each with whether a <pid> window is above the cover app's (owner name
//                                    <cover>) front window (aboveFront) and above any of its windows (aboveAny), the
//                                    frontmost app, and every 10th sample the frontmost app's key window (its
//                                    AXFocusedWindow's title)
//   win sel <pid>                    the app's focused element's AXSelectedTextRange
//   win sel0 <pid>                   writes it {0, 0}
import AppKit
import ApplicationServices
import Foundation

setvbuf(stdout, nil, _IOLBF, 0)
func emit(_ object: Any) { print(String(data: try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]), encoding: .utf8)!) }
func unixMs() -> Double { (Date().timeIntervalSince1970 * 1000 * 10).rounded() / 10 }
func all() -> [[String: Any]] { (CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]) ?? [] }
func row(_ w: [String: Any]) -> [String: Any] {
  let b = w[kCGWindowBounds as String] as? [String: Any] ?? [:]
  return ["owner": w[kCGWindowOwnerName as String] ?? "?", "pid": w[kCGWindowOwnerPID as String] ?? 0, "layer": w[kCGWindowLayer as String] ?? 0,
          "number": w[kCGWindowNumber as String] ?? 0, "name": w[kCGWindowName as String] ?? NSNull(), "alpha": w[kCGWindowAlpha as String] ?? NSNull(),
          "bounds": [b["X"] ?? 0, b["Y"] ?? 0, b["Width"] ?? 0, b["Height"] ?? 0]]
}
func front() -> String { NSWorkspace.shared.frontmostApplication?.bundleIdentifier ?? "?" }

let a = CommandLine.arguments
if a.count == 2, a[1] == "dump" {
  let w = all()
  let layer0 = w.filter { ($0[kCGWindowLayer as String] as? Int) == 0 }
  let te = layer0.enumerated().filter { ($0.element[kCGWindowOwnerName as String] as? String) == "TextEdit" }.map { $0.offset }
  emit(["atMs": unixMs(), "frontmost": front(), "windows": w.map(row), "textEditWindows": te.count, "textEditLayer0Indices": te])
  exit(0)
}
func focusedElement(_ pid: pid_t) -> AXUIElement? {
  var f: CFTypeRef?
  guard AXUIElementCopyAttributeValue(AXUIElementCreateApplication(pid), kAXFocusedUIElementAttribute as CFString, &f) == .success, let f,
        CFGetTypeID(f) == AXUIElementGetTypeID() else { return nil }
  return (f as! AXUIElement)
}
if a.count == 3, a[1] == "sel" || a[1] == "sel0", let pid = pid_t(a[2]) {
  guard let e = focusedElement(pid) else { emit(["focused": false]); exit(0) }
  if a[1] == "sel0" {
    var r = CFRange(location: 0, length: 0)
    emit(["written": AXUIElementSetAttributeValue(e, "AXSelectedTextRange" as CFString, AXValueCreate(.cfRange, &r)!).rawValue])
    exit(0)
  }
  var v: CFTypeRef?
  var r = CFRange()
  if AXUIElementCopyAttributeValue(e, "AXSelectedTextRange" as CFString, &v) == .success, let v, CFGetTypeID(v) == AXValueGetTypeID(),
     AXValueGetValue(v as! AXValue, .cfRange, &r) { emit(["loc": r.location, "len": r.length]) } else { emit(["loc": NSNull()]) }
  exit(0)
}
func keyWindow() -> String {
  guard let app = NSWorkspace.shared.frontmostApplication else { return "?" }
  var w: CFTypeRef?, t: CFTypeRef?
  let ax = AXUIElementCreateApplication(app.processIdentifier)
  AXUIElementSetMessagingTimeout(ax, 0.2)
  guard AXUIElementCopyAttributeValue(ax, kAXFocusedWindowAttribute as CFString, &w) == .success, let w, CFGetTypeID(w) == AXUIElementGetTypeID() else { return "\(app.localizedName ?? "?"): none" }
  AXUIElementCopyAttributeValue(w as! AXUIElement, kAXTitleAttribute as CFString, &t)
  return "\(app.localizedName ?? "?"): \((t as? String) ?? "")"
}
guard a.count == 6, a[1] == "watch", let pid = Int(a[2]), let total = Double(a[4]), let interval = Double(a[5]) else { emit(["usage": true]); exit(2) }
let cover = a[3]
var lastKey = keyWindow()
func sample() -> [String: Any] {
  let layer0 = all().filter { ($0[kCGWindowLayer as String] as? Int) == 0 }
  let target = layer0.indices.filter { (layer0[$0][kCGWindowOwnerPID as String] as? Int) == pid }
  let te = layer0.indices.filter { (layer0[$0][kCGWindowOwnerName as String] as? String) == cover }
  let order = layer0.map { "\($0[kCGWindowOwnerName as String] ?? "?")#\($0[kCGWindowNumber as String] ?? 0)" }
  return ["order": order, "aboveFront": (target.min().map { t in te.min().map { t < $0 } ?? false } ?? false),
          "aboveAny": (target.min().map { t in te.max().map { t < $0 } ?? false } ?? false), "frontmost": front(), "coverWindows": te.count, "key": lastKey]
}
emit(["ready": true, "initial": sample()])
guard readLine() != nil else { exit(0) }
let t0 = unixMs()
var changes: [[String: Any]] = [], last: NSDictionary?, samples = 0
while unixMs() - t0 < total {
  if samples % 10 == 0 { lastKey = keyWindow() }
  var s = sample()
  samples += 1
  let key = NSDictionary(dictionary: s)
  if last == nil || !key.isEqual(last!) { s["atMs"] = unixMs(); s["t"] = unixMs() - t0; changes.append(s); last = key }
  usleep(UInt32(interval * 1000))
}
emit(["goAt": t0, "samples": samples, "changes": changes])
