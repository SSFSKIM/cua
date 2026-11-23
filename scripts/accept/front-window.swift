// FrontWindowProbe (the own native engine spec, Interfaces): the device-side oracle of what is in front, read
// independently of either engine. Run with `swift scripts/accept/front-window.swift [command]`; one JSON line out.
// Promoted in M1b from the M0 spike's copy (scripts/spike/engine/front-window.swift, kept as M0's record); its users are
// the key guard (./key-guard.mjs, frontmostFromProbe) and the macOS scenes (scripts/repl-parity/scenes-mac.mjs).
//
//   front [--skip-pid <pid>]...
//                   (default) {"at": <unix ms>, "frontmost": {"bundleId", "pid"} | null, "topWindow": <window> | null}
//                   frontmost from `lsappinfo front` then `lsappinfo info -only pid,bundleid`; topWindow is the frontmost
//                   on-screen window at the normal level (layer 0) with a visible size and alpha, from
//                   CGWindowListCopyWindowInfo, front to back, passing over the windows of each skipped pid (the
//                   engine's own: the agent cursor's display-wide panel, which never takes a key, #235).
//   order [--skip-pid <pid>]...
//                   {"at", "windows": [<window> with "ownerName", "ownerBundleId" and "layer"]}: every on-screen layer-0
//                   window, front to back, as one snapshot (the Finder scene's activation guard), passing over the
//                   skipped pids' windows as `front` does.
//   windows <pid>   {"at", "pid", "hidden", "windows": [<window>]}: every layer-0 window of that process with a visible
//                   size, front to back, each with its `onScreen` (false for a minimized window, one on another Space, or
//                   every window of a hidden app); `hidden` is NSRunningApplication's isHidden for the process (Cmd-H),
//                   null when LaunchServices does not know the pid.
//   windows <pid> --all
//                   the same, with "all": true, and every layer-0 window of that process whatever its size or alpha
//                   (bounds null when the window server gives none): the inventory of what remains, for the fixture's
//                   cleanup, which must not take an invisible window for none.
//   <window>        {"ownerPid", "number", "bounds": {"x", "y", "width", "height"}, "onScreen"}
//
// It reads no window titles: kCGWindowOwnerPID, kCGWindowNumber, kCGWindowBounds, kCGWindowLayer, kCGWindowAlpha,
// kCGWindowIsOnscreen and (only for `order`) kCGWindowOwnerName need no Screen Recording grant. App metadata is NSRunningApplication's, so
// it never raises a permission dialog. Exit 0 with the JSON; exit 2 with {"error"} on a usage error; exit 3 with {"error"}
// when `windows` cannot read the window server's list (`front` and `order` still read it as empty).
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

// nil when the window server's list cannot be read: `windows <pid>` reports that as an error, never as no window.
// visibleOnly (every caller but `windows <pid> --all`): only windows with a visible size and a nonzero alpha.
func windows(_ option: CGWindowListOption, owners: Bool = false, visibleOnly: Bool = true) -> [[String: Any]]? {
  guard let list = CGWindowListCopyWindowInfo(option, kCGNullWindowID) as? [[String: Any]] else { return nil }
  return list.compactMap { entry in
    guard (entry[kCGWindowLayer as String] as? Int) == 0,
          let pid = entry[kCGWindowOwnerPID as String] as? Int,
          let number = entry[kCGWindowNumber as String] as? Int else { return nil }
    let bounds = (entry[kCGWindowBounds as String] as? NSDictionary).flatMap { CGRect(dictionaryRepresentation: $0 as CFDictionary) }
    if visibleOnly {
      guard let bounds, bounds.width > 1, bounds.height > 1,
            (entry[kCGWindowAlpha as String] as? Double ?? 1) > 0 else { return nil }
    }
    var out: [String: Any] = [
      "ownerPid": pid, "number": number,
      "bounds": bounds.map { ["x": Double($0.origin.x), "y": Double($0.origin.y), "width": Double($0.width), "height": Double($0.height)] } as Any? ?? NSNull(),
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
// `--skip-pid <pid>`, any number of times, after `front` or `order`: the owners whose windows the reading passes over.
func skippedPids(_ command: String) -> Set<Int> {
  var skipped = Set<Int>()
  var rest = arguments.dropFirst()
  while let flag = rest.first {
    guard flag == "--skip-pid", rest.count >= 2, let pid = Int(rest[rest.startIndex + 1]), pid > 0 else {
      emit(["error": "usage: \(command) [--skip-pid <pid>]..."], status: 2)
    }
    skipped.insert(pid)
    rest = rest.dropFirst(2)
  }
  return skipped
}

switch arguments.first ?? "front" {
case "front":
  let skipped = skippedPids("front")
  let top = (windows([.optionOnScreenOnly, .excludeDesktopElements]) ?? []).first { !skipped.contains($0["ownerPid"] as? Int ?? -1) }
  emit(["at": now, "frontmost": frontmost() as Any? ?? NSNull(), "topWindow": top as Any? ?? NSNull()])
case "order":
  let skipped = skippedPids("order")
  emit(["at": now, "windows": (windows([.optionOnScreenOnly, .excludeDesktopElements], owners: true) ?? [])
    .filter { !skipped.contains($0["ownerPid"] as? Int ?? -1) }])
case "windows":
  let unfiltered = arguments.count == 3 && arguments[2] == "--all"
  guard arguments.count == 2 || unfiltered, let pid = Int(arguments[1]), pid > 0 else { emit(["error": "usage: windows <pid> [--all]"], status: 2) }
  let hidden = NSRunningApplication(processIdentifier: pid_t(pid))?.isHidden
  guard let all = windows([.optionAll, .excludeDesktopElements], visibleOnly: !unfiltered) else { emit(["error": "the window list could not be read"], status: 3) }
  var reading: [String: Any] = ["at": now, "pid": pid, "hidden": hidden as Any? ?? NSNull(),
                                "windows": all.filter { ($0["ownerPid"] as? Int) == pid }]
  if unfiltered { reading["all"] = true }
  emit(reading)
default:
  emit(["error": "usage: front [--skip-pid <pid>]... | order [--skip-pid <pid>]... | windows <pid> [--all]"], status: 2)
}
