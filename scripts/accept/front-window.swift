// FrontWindowProbe (the own native engine spec, Interfaces): the device-side oracle of what is in front, read
// independently of either engine. Run with `swift scripts/accept/front-window.swift [command]`; one JSON line out.
// Promoted in M1b from the M0 spike's copy (scripts/spike/engine/front-window.swift, kept as M0's record); its users are
// the key guard (./key-guard.mjs, frontmostFromProbe) and the macOS scenes (scripts/repl-parity/scenes-mac.mjs).
//
//   front           (default) {"at": <unix ms>, "frontmost": {"bundleId", "pid"} | null, "topWindow": <window> | null}
//                   frontmost from `lsappinfo front` then `lsappinfo info -only pid,bundleid`; topWindow is the frontmost
//                   on-screen window at the normal level (layer 0) with a visible size and alpha, from
//                   CGWindowListCopyWindowInfo, front to back.
//   windows <pid>   {"at", "pid", "hidden", "windows": [<window>]}: every layer-0 window of that process with a visible
//                   size, front to back, each with its `onScreen` (false for a minimized window, one on another Space, or
//                   every window of a hidden app); `hidden` is NSRunningApplication's isHidden for the process (Cmd-H),
//                   null when LaunchServices does not know the pid.
//   <window>        {"ownerPid", "number", "bounds": {"x", "y", "width", "height"}, "onScreen"}
//
// `order` returns every on-screen layer-0 window with ownerName, ownerBundleId and layer for the scene guard.
// It reads no window titles: kCGWindowOwnerPID, kCGWindowNumber, kCGWindowBounds, kCGWindowLayer, kCGWindowAlpha,
// kCGWindowIsOnscreen and (only for `order`) kCGWindowOwnerName need no Screen Recording grant. App metadata is NSRunningApplication's, so
// it never raises a permission dialog. Exit 0 with the JSON; exit 2 with {"error"} on a usage error.
import AppKit
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

func windows(_ option: CGWindowListOption, owners: Bool = false) -> [[String: Any]] {
  guard let list = CGWindowListCopyWindowInfo(option, kCGNullWindowID) as? [[String: Any]] else { return [] }
  return list.compactMap { entry in
    guard (entry[kCGWindowLayer as String] as? Int) == 0,
          let pid = entry[kCGWindowOwnerPID as String] as? Int,
          let number = entry[kCGWindowNumber as String] as? Int,
          let boundsDictionary = entry[kCGWindowBounds as String] as? NSDictionary,
          let bounds = CGRect(dictionaryRepresentation: boundsDictionary as CFDictionary),
          bounds.width > 1, bounds.height > 1,
          (entry[kCGWindowAlpha as String] as? Double ?? 1) > 0 else { return nil }
    var out: [String: Any] = [
      "ownerPid": pid, "number": number,
      "bounds": ["x": Double(bounds.origin.x), "y": Double(bounds.origin.y), "width": Double(bounds.width), "height": Double(bounds.height)],
      "onScreen": (entry[kCGWindowIsOnscreen as String] as? Bool) ?? false,
    ]
    if owners {
      out["layer"] = 0
      out["ownerName"] = entry[kCGWindowOwnerName as String] as? String ?? "unknown process"
      out["ownerBundleId"] = NSRunningApplication(processIdentifier: pid_t(pid))?.bundleIdentifier as Any? ?? NSNull()
    }
    return out
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
case "order":
  emit(["at": now, "windows": windows([.optionOnScreenOnly, .excludeDesktopElements], owners: true)])
case "windows":
  guard arguments.count == 2, let pid = Int(arguments[1]), pid > 0 else { emit(["error": "usage: windows <pid>"], status: 2) }
  let hidden = NSRunningApplication(processIdentifier: pid_t(pid))?.isHidden
  emit(["at": now, "pid": pid, "hidden": hidden as Any? ?? NSNull(),
        "windows": windows([.optionAll, .excludeDesktopElements]).filter { ($0["ownerPid"] as? Int) == pid }])
default:
  emit(["error": "usage: front | order | windows <pid>"], status: 2)
}
