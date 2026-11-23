// Read-only: every active display's bounds, its current mode and every mode CoreGraphics offers it (duplicate
// low-resolution modes included), as one JSON object on stdout. Configures nothing. #117 M5: the hosted runner's
// 1024×768 display leaves no room to place the scenes clear of replayd's alerts (ruling 1154); this reads whether
// another mode is offered (docs/evidence/2026-11-23-own-native-engine/hosted.md).
import CoreGraphics
import Foundation

func describe(_ mode: CGDisplayMode) -> [String: Any] {
  ["width": mode.width, "height": mode.height, "pixelWidth": mode.pixelWidth, "pixelHeight": mode.pixelHeight,
   "refreshRate": mode.refreshRate, "usableForDesktopGUI": mode.isUsableForDesktopGUI(), "ioFlags": mode.ioFlags,
   "modeId": mode.ioDisplayModeID]
}

var count: UInt32 = 0
CGGetActiveDisplayList(0, nil, &count)
var ids = [CGDirectDisplayID](repeating: 0, count: Int(count))
CGGetActiveDisplayList(count, &ids, &count)
let options = [kCGDisplayShowDuplicateLowResolutionModes: kCFBooleanTrue] as CFDictionary
let displays: [[String: Any]] = ids.map { id in
  let b = CGDisplayBounds(id)
  var entry: [String: Any] = [
    "id": id, "main": CGMainDisplayID() == id, "builtin": CGDisplayIsBuiltin(id) != 0,
    "bounds": ["x": b.origin.x, "y": b.origin.y, "width": b.size.width, "height": b.size.height],
    "vendor": CGDisplayVendorNumber(id), "model": CGDisplayModelNumber(id),
  ]
  if let current = CGDisplayCopyDisplayMode(id) { entry["current"] = describe(current) }
  let modes = (CGDisplayCopyAllDisplayModes(id, options) as? [CGDisplayMode]) ?? []
  entry["modes"] = modes.map(describe)
  return entry
}
let data = try JSONSerialization.data(withJSONObject: ["displays": displays], options: [.prettyPrinted, .sortedKeys])
print(String(data: data, encoding: .utf8)!)
