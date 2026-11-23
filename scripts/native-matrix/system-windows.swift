// The paste check's alert watch (./live-device.mjs pasteCheck): every on-screen window at every layer, front to back,
// so a system alert that appears during a paste (a pasteboard-privacy prompt, a UserNotificationCenter alert) is seen
// without touching it. Run with `swift scripts/native-matrix/system-windows.swift`; one JSON line out:
//
//   {"at": <unix ms>, "windows": [{"ownerPid", "ownerName", "ownerBundleId", "layer", "number", "name", "bounds"}],
//    "displays": [{"x", "y", "width", "height"}]}
//
// `displays`: each active display's bounds in the windows' global coordinates (CGDisplayBounds), so a window can be
// placed on its display (the alert guard's avoidance, ./alert-guard.mjs clearFrame); null when none was read.
//
// `windows` is null when the window server answered no list at all: unread, which no caller may take for an empty
// screen (the window-order oracle's after-read fails its row; the alert watch cannot clear a paste).
//
// `ownerName` (kCGWindowOwnerName) needs no permission; `name` (kCGWindowName) is present only where the reading
// process may read titles (Screen Recording) and null otherwise, so nothing here raises a permission dialog. The caller
// keeps only the windows it judges alerts; the baseline's names never leave the device.
import AppKit
import CoreGraphics
import Foundation

let now = Int((Date().timeIntervalSince1970 * 1000).rounded())
let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]
let windows: [[String: Any]]? = list?.compactMap { entry in
  guard let pid = entry[kCGWindowOwnerPID as String] as? Int,
        let number = entry[kCGWindowNumber as String] as? Int,
        let boundsDictionary = entry[kCGWindowBounds as String] as? NSDictionary,
        let bounds = CGRect(dictionaryRepresentation: boundsDictionary as CFDictionary),
        bounds.width > 1, bounds.height > 1,
        (entry[kCGWindowAlpha as String] as? Double ?? 1) > 0 else { return nil }
  return [
    "ownerPid": pid,
    "ownerName": entry[kCGWindowOwnerName as String] as? String ?? NSNull(),
    "ownerBundleId": NSRunningApplication(processIdentifier: pid_t(pid))?.bundleIdentifier ?? NSNull(),
    "layer": entry[kCGWindowLayer as String] as? Int ?? 0,
    "number": number,
    "name": entry[kCGWindowName as String] as? String ?? NSNull(),
    "bounds": ["x": Double(bounds.origin.x), "y": Double(bounds.origin.y), "width": Double(bounds.width), "height": Double(bounds.height)],
  ]
}
var displayCount: UInt32 = 0
var displayIds = [CGDirectDisplayID](repeating: 0, count: 16)
let displays: [[String: Double]]? = CGGetActiveDisplayList(16, &displayIds, &displayCount) == .success && displayCount > 0
  ? displayIds.prefix(Int(displayCount)).map { id in
      let b = CGDisplayBounds(id)
      return ["x": Double(b.origin.x), "y": Double(b.origin.y), "width": Double(b.width), "height": Double(b.height)]
    }
  : nil
let data = try! JSONSerialization.data(withJSONObject: ["at": now, "windows": windows.map { $0 as Any } ?? NSNull(), "displays": displays.map { $0 as Any } ?? NSNull()],
                                       options: [.sortedKeys])
FileHandle.standardOutput.write(data)
FileHandle.standardOutput.write("\n".data(using: .utf8)!)
