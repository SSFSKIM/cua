// #117 H0, ruling 1135 (ii): the on-screen windows of the processes that show replayd's capture confirmation, read from
// the window server's list only (owner, layer, bounds). Read only: it never touches, focuses or answers a window.
import CoreGraphics
import Foundation

let owners = ["UserNotificationCenter", "replayd", "ScreenCaptureUI", "screencaptureui"]
let list = (CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]) ?? []
var windows: [[String: Any]] = []
for w in list {
  let owner = w[kCGWindowOwnerName as String] as? String ?? ""
  guard owners.contains(owner) else { continue }
  let b = w[kCGWindowBounds as String] as? [String: Any] ?? [:]
  windows.append(["owner": owner, "pid": w[kCGWindowOwnerPID as String] as? Int ?? 0, "layer": w[kCGWindowLayer as String] as? Int ?? 0,
                  "bounds": [b["X"] ?? 0, b["Y"] ?? 0, b["Width"] ?? 0, b["Height"] ?? 0]])
}
let data = try! JSONSerialization.data(withJSONObject: ["windows": windows])
print(String(data: data, encoding: .utf8)!)
