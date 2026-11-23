// #117 H0: the runner's displays as AppKit and Quartz see them (size in points and pixels, scale), one JSON line.
import AppKit
var screens: [[String: Any]] = []
for screen in NSScreen.screens {
  let id = (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value ?? 0
  screens.append([
    "name": screen.localizedName,
    "points": [screen.frame.width, screen.frame.height],
    "origin": [screen.frame.origin.x, screen.frame.origin.y],
    "scale": screen.backingScaleFactor,
    "pixels": [CGDisplayPixelsWide(id), CGDisplayPixelsHigh(id)],
    "main": CGDisplayIsMain(id) != 0,
  ])
}
let data = try! JSONSerialization.data(withJSONObject: ["screens": screens, "count": screens.count])
print(String(data: data, encoding: .utf8)!)
