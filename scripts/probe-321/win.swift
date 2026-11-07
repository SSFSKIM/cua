// #321's window-order tool: every on-screen window (CGWindowList), and a watch of the target's windows against
// TextEdit's. Times are Unix milliseconds, to line up with the engine's delivery record (holdStartedAt, postedAt,
// releasedAt).
//   win dump                         every on-screen window front to back: owner, pid, layer, number, bounds, name, alpha
//   win watch <pid> <ms> <interval>  prints {ready}, waits for a line on stdin, then samples every <interval> ms for <ms>:
//                                    the first sample and every change of the layer-0 order (owners and numbers), each
//                                    with whether a <pid> window is above TextEdit's front window (aboveFront) and above
//                                    any TextEdit window (aboveAny), and the frontmost app
import AppKit
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
guard a.count == 5, a[1] == "watch", let pid = Int(a[2]), let total = Double(a[3]), let interval = Double(a[4]) else { emit(["usage": true]); exit(2) }
func sample() -> [String: Any] {
  let layer0 = all().filter { ($0[kCGWindowLayer as String] as? Int) == 0 }
  let target = layer0.indices.filter { (layer0[$0][kCGWindowOwnerPID as String] as? Int) == pid }
  let te = layer0.indices.filter { (layer0[$0][kCGWindowOwnerName as String] as? String) == "TextEdit" }
  let order = layer0.map { "\($0[kCGWindowOwnerName as String] ?? "?")#\($0[kCGWindowNumber as String] ?? 0)" }
  return ["order": order, "aboveFront": (target.min().map { t in te.min().map { t < $0 } ?? false } ?? false),
          "aboveAny": (target.min().map { t in te.max().map { t < $0 } ?? false } ?? false), "frontmost": front(), "textEditWindows": te.count]
}
emit(["ready": true, "initial": sample()])
guard readLine() != nil else { exit(0) }
let t0 = unixMs()
var changes: [[String: Any]] = [], last: NSDictionary?, samples = 0
while unixMs() - t0 < total {
  var s = sample()
  samples += 1
  let key = NSDictionary(dictionary: s)
  if last == nil || !key.isEqual(last!) { s["atMs"] = unixMs(); s["t"] = unixMs() - t0; changes.append(s); last = key }
  usleep(UInt32(interval * 1000))
}
emit(["goAt": t0, "samples": samples, "changes": changes])
