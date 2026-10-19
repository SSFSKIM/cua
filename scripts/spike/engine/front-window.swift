// FrontWindowProbe (the own native engine spec, Interfaces): the device-side oracle of what is in front, read
// independently of either engine. Run with `swift scripts/spike/engine/front-window.swift [command]`; one JSON line out.
//
//   front           (default) {"at": <unix ms>, "frontmost": {"bundleId", "pid"} | null, "topWindow": <window> | null}
//                   frontmost from `lsappinfo front` then `lsappinfo info -only pid,bundleid`; topWindow is the frontmost
//                   on-screen window at the normal level (layer 0) with a visible size and alpha, from
//                   CGWindowListCopyWindowInfo, front to back.
//   windows <pid>   {"at", "pid", "windows": [<window>]}: every layer-0 window of that process with a visible size, on
//                   screen or not (a minimized or other-Space window counts), front to back.
//   <window>        {"ownerPid", "number", "bounds": {"x", "y", "width", "height"}, "onScreen"}
//
// It reads no window names and no owner names: only kCGWindowOwnerPID, kCGWindowNumber, kCGWindowBounds,
// kCGWindowLayer, kCGWindowAlpha and kCGWindowIsOnscreen, none of which needs Screen Recording, so it never raises a
// permission dialog. Exit 0 with the JSON; exit 2 with {"error"} on a usage error.
import CoreGraphics
import Foundation

func lsappinfo(_ arguments: [String]) -> String? {
  let process = Process()
  process.executableURL = URL(fileURLWithPath: "/usr/bin/lsappinfo")
  process.arguments = arguments
  let pipe = Pipe()
  process.standardOutput = pipe
  process.standardError = FileHandle.nullDevice
  do { try process.run() } catch { return nil }
  let data = pipe.fileHandleForReading.readDataToEndOfFile()
  process.waitUntilExit()
  return process.terminationStatus == 0 ? String(decoding: data, as: UTF8.self) : nil
}

// `lsappinfo info -only pid,bundleid` prints `"pid"=736` and `"CFBundleIdentifier"="<id>"` (macOS 26) or the older
// `pid = 736` and `bundleID="<id>"`.
func frontmost() -> [String: Any]? {
  guard let asn = lsappinfo(["front"])?.trimmingCharacters(in: .whitespacesAndNewlines), !asn.isEmpty,
        let info = lsappinfo(["info", "-only", "pid,bundleid", asn]) else { return nil }
  func capture(_ pattern: String) -> String? {
    guard let regex = try? NSRegularExpression(pattern: pattern),
          let match = regex.firstMatch(in: info, range: NSRange(info.startIndex..., in: info)),
          let range = Range(match.range(at: 1), in: info) else { return nil }
    return String(info[range])
  }
  guard let pid = capture("\"?pid\"?\\s*=\\s*(\\d+)").flatMap({ Int($0) }) else { return nil }
  let bundleId = capture("(?:bundleID|\"CFBundleIdentifier\")=\"([^\"]+)\"")
  return ["pid": pid, "bundleId": bundleId as Any? ?? NSNull()]
}

func windows(_ option: CGWindowListOption) -> [[String: Any]] {
  guard let list = CGWindowListCopyWindowInfo(option, kCGNullWindowID) as? [[String: Any]] else { return [] }
  return list.compactMap { entry in
    guard (entry[kCGWindowLayer as String] as? Int) == 0,
          let pid = entry[kCGWindowOwnerPID as String] as? Int,
          let number = entry[kCGWindowNumber as String] as? Int,
          let boundsDictionary = entry[kCGWindowBounds as String] as? NSDictionary,
          let bounds = CGRect(dictionaryRepresentation: boundsDictionary as CFDictionary),
          bounds.width > 1, bounds.height > 1,
          (entry[kCGWindowAlpha as String] as? Double ?? 1) > 0 else { return nil }
    return [
      "ownerPid": pid, "number": number,
      "bounds": ["x": Double(bounds.origin.x), "y": Double(bounds.origin.y), "width": Double(bounds.width), "height": Double(bounds.height)],
      "onScreen": (entry[kCGWindowIsOnscreen as String] as? Bool) ?? false,
    ]
  }
}

func emit(_ object: [String: Any], status: Int32 = 0) -> Never {
  let data = try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write("\n".data(using: .utf8)!)
  exit(status)
}

let now = Int((Date().timeIntervalSince1970 * 1000).rounded())
let arguments = Array(CommandLine.arguments.dropFirst())
switch arguments.first ?? "front" {
case "front":
  let top = windows([.optionOnScreenOnly, .excludeDesktopElements]).first
  emit(["at": now, "frontmost": frontmost() as Any? ?? NSNull(), "topWindow": top as Any? ?? NSNull()])
case "windows":
  guard arguments.count == 2, let pid = Int(arguments[1]), pid > 0 else { emit(["error": "usage: windows <pid>"], status: 2) }
  emit(["at": now, "pid": pid, "windows": windows([.optionAll, .excludeDesktopElements]).filter { ($0["ownerPid"] as? Int) == pid }])
default:
  emit(["error": "usage: front | windows <pid>"], status: 2)
}
