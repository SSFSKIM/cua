// By default read-only: every active display's bounds, its current mode and every mode CoreGraphics offers it
// (duplicate low-resolution modes included), as one JSON object on stdout. Configures nothing. #117 M5: the hosted
// runner's 1024×768 display leaves no room to place the scenes clear of replayd's alerts (ruling 1154); this reads
// whether another mode is offered (docs/evidence/2026-11-23-own-native-engine/hosted.md).
//
// `set <width> <height>` (ruling 1164; ./display-mode.mjs, setup's display mode step, hosted runners only): the main
// display switched to its offered mode of that size, chosen by size (1x: its pixels its points; usable for the desktop),
// never by id, for the session (CGCompleteDisplayConfiguration .forSession: it outlives this process, where app-only
// would revert when it exits), then the display read back. One JSON object on stdout: {set, readBack: {bounds,
// current}}, or {error} (exit 1) when no such mode is offered or a configuration call fails.
import CoreGraphics
import Foundation

func describe(_ mode: CGDisplayMode) -> [String: Any] {
  ["width": mode.width, "height": mode.height, "pixelWidth": mode.pixelWidth, "pixelHeight": mode.pixelHeight,
   "refreshRate": mode.refreshRate, "usableForDesktopGUI": mode.isUsableForDesktopGUI(), "ioFlags": mode.ioFlags,
   "modeId": mode.ioDisplayModeID]
}
func rect(_ b: CGRect) -> [String: Any] { ["x": b.origin.x, "y": b.origin.y, "width": b.size.width, "height": b.size.height] }
func emit(_ object: [String: Any]) {
  let data = try! JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys])
  print(String(data: data, encoding: .utf8)!)
}
let options = [kCGDisplayShowDuplicateLowResolutionModes: kCFBooleanTrue] as CFDictionary
func modes(_ id: CGDirectDisplayID) -> [CGDisplayMode] { (CGDisplayCopyAllDisplayModes(id, options) as? [CGDisplayMode]) ?? [] }

func setMode(width: Int, height: Int) -> Int32 {
  let id = CGMainDisplayID()
  guard let mode = modes(id).first(where: { $0.width == width && $0.height == height && $0.pixelWidth == width && $0.pixelHeight == height && $0.isUsableForDesktopGUI() }) else {
    emit(["error": "no \(width)x\(height) mode at 1x is offered on the main display"]); return 1
  }
  var config: CGDisplayConfigRef?
  let begun = CGBeginDisplayConfiguration(&config)
  guard begun == .success, let config else { emit(["error": "CGBeginDisplayConfiguration: \(begun.rawValue)"]); return 1 }
  let configured = CGConfigureDisplayWithDisplayMode(config, id, mode, nil)
  guard configured == .success else { CGCancelDisplayConfiguration(config); emit(["error": "CGConfigureDisplayWithDisplayMode: \(configured.rawValue)"]); return 1 }
  let completed = CGCompleteDisplayConfiguration(config, .forSession)
  guard completed == .success else { emit(["error": "CGCompleteDisplayConfiguration: \(completed.rawValue)"]); return 1 }
  var readBack: [String: Any] = ["bounds": rect(CGDisplayBounds(id))]
  if let current = CGDisplayCopyDisplayMode(id) { readBack["current"] = describe(current) }
  emit(["set": describe(mode), "readBack": readBack])
  return 0
}

let arguments = Array(CommandLine.arguments.dropFirst())
if arguments.first == "set" {
  guard arguments.count == 3, let width = Int(arguments[1]), let height = Int(arguments[2]) else {
    emit(["error": "usage: display-modes.swift [set <width> <height>]"]); exit(64)
  }
  exit(setMode(width: width, height: height))
}

var count: UInt32 = 0
CGGetActiveDisplayList(0, nil, &count)
var ids = [CGDirectDisplayID](repeating: 0, count: Int(count))
CGGetActiveDisplayList(count, &ids, &count)
let displays: [[String: Any]] = ids.map { id in
  var entry: [String: Any] = [
    "id": id, "main": CGMainDisplayID() == id, "builtin": CGDisplayIsBuiltin(id) != 0,
    "bounds": rect(CGDisplayBounds(id)),
    "vendor": CGDisplayVendorNumber(id), "model": CGDisplayModelNumber(id),
  ]
  if let current = CGDisplayCopyDisplayMode(id) { entry["current"] = describe(current) }
  entry["modes"] = modes(id).map(describe)
  return entry
}
emit(["displays": displays])
