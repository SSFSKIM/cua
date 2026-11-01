// Every on-screen window, front to back, for item 1's no-clip glide check (./glide.mjs coverOver): the owner's pid,
// the window number, its layer and its bounds (global top-left points), the same fields the engine's occlusion rule
// reads (CursorAttachment.swift `occluded`). No window or owner names, so no Screen Recording grant. One JSON line out.
import CoreGraphics
import Foundation

let list = (CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]) ?? []
let windows: [[String: Any]] = list.compactMap { entry in
  guard let pid = entry[kCGWindowOwnerPID as String] as? Int, let number = entry[kCGWindowNumber as String] as? Int,
        let layer = entry[kCGWindowLayer as String] as? Int, let b = entry[kCGWindowBounds as String] as? NSDictionary,
        let rect = CGRect(dictionaryRepresentation: b) else { return nil }
  return ["ownerPid": pid, "number": number, "layer": layer, "onScreen": true,
          "bounds": ["x": rect.minX, "y": rect.minY, "width": rect.width, "height": rect.height]]
}
let data = try! JSONSerialization.data(withJSONObject: ["windows": windows], options: [.sortedKeys])
FileHandle.standardOutput.write(data + Data("\n".utf8))
