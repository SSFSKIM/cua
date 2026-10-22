import CoreGraphics
import Foundation
// On-screen windows front to back, layer 0 first 12: owner pid, owner name, layer, bounds. No titles, no contents.
let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
var n = 0
for w in list {
  let layer = w[kCGWindowLayer as String] as? Int ?? -1
  let pid = w[kCGWindowOwnerPID as String] as? Int ?? -1
  let owner = w[kCGWindowOwnerName as String] as? String ?? "?"
  let b = w[kCGWindowBounds as String] as? [String: Any] ?? [:]
  let num = w[kCGWindowNumber as String] as? Int ?? -1
  print("layer=\(layer) pid=\(pid) owner=\(owner) number=\(num) bounds=\(b["X"] ?? "?"),\(b["Y"] ?? "?"),\(b["Width"] ?? "?"),\(b["Height"] ?? "?")")
  n += 1; if n >= 14 { break }
}
