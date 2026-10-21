import AppKit
import Carbon
import CoreGraphics
import Foundation

// `cua-engine --probe <command>` (Interfaces, UserProbe). A probe binds no socket; every command exits except
// `watch-activations`, which is resident until killed. The commands: `input-source current` (the active source, read
// only), `input-source <id>` (selects that source, a keyboard layout or an input mode such as Korean 2-Set, and reads it
// back; the harness saves and restores the owner's), `keystroke` (the stand-in user: HID-state events posted at the HID
// event tap, only while the named window is frontmost, with each character's string, the layout's key codes alone or
// the fixed ANSI keys; KeystrokeProbe.swift), `focus` (the focused app and window, and the named window's focused value
// as a hash; FocusProbe.swift) and `watch-activations` (every NSWorkspace activation and deactivation with its time, the probe's
// own pid printed first, so the harness can stop it and the oracles can exclude probe instances).
enum Probe {
  static func run(_ arguments: [String]) -> Int32 {
    switch arguments.first {
    case "input-source":
      guard arguments.count == 2 else { return emit(["error": "usage: --probe input-source current|<id>"], status: 64) }
      return inputSource(arguments[1])
    case "keystroke":
      return keystroke(Array(arguments.dropFirst()))
    case "focus":
      return focus(Array(arguments.dropFirst()))
    case "watch-activations":
      return watchActivations()
    default:
      return emit(["error": "usage: --probe input-source current|<id> | keystroke --user-pid <n> --user-bounds <x,y,w,h> [--at <unix ms>] [--key-codes-only|--ansi-keys] <text> | focus [--window <pid,x,y,w,h>] | watch-activations"],
                  status: 64)
    }
  }

  private static func inputSource(_ argument: String) -> Int32 {
    let previous = currentInputSource()
    if argument == "current" { return emit(sourceWire(previous), status: 0) }
    let filter = [kTISPropertyInputSourceID as String: argument] as CFDictionary
    guard let list = TISCreateInputSourceList(filter, true)?.takeRetainedValue() as? [TISInputSource], let source = list.first else {
      return emit(["error": "no input source with that id"], status: 2)
    }
    let status = TISSelectInputSource(source)
    // Read back: the selection holds only when the current source is the one asked for (an input mode's parent method
    // may take a moment to switch), polled for up to 500 ms.
    var current = currentInputSource()
    for _ in 0..<10 where status == noErr && current.id != argument {
      usleep(50_000)
      current = currentInputSource()
    }
    let selected = status == noErr && current.id == argument
    return emit(["previous": sourceWire(previous), "current": sourceWire(current), "selected": selected], status: selected ? 0 : 3)
  }

  /// `watch-activations`: prints its own pid, then every NSWorkspace application activation and deactivation with its
  /// time, until killed (the resident probe runs without -W).
  private static func watchActivations() -> Int32 {
    _ = emit(["pid": Int(getpid()), "watch": "activations"], status: 0)
    let center = NSWorkspace.shared.notificationCenter
    for (name, kind) in [(NSWorkspace.didActivateApplicationNotification, "activated"), (NSWorkspace.didDeactivateApplicationNotification, "deactivated")] {
      center.addObserver(forName: name, object: nil, queue: .main) { notification in
        guard let application = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication else { return }
        _ = emit(["at": Int(unixMilliseconds()), "kind": kind, "pid": Int(application.processIdentifier),
                  "bundleId": application.bundleIdentifier ?? NSNull()], status: 0)
      }
    }
    RunLoop.main.run()
    return 0
  }

  /// The frontmost on-screen window of the window list: the first entry at layer 0. The list's head on a real session
  /// is the Window Server's overlays (Control Center sits at layer 25), so `list.first` is never a document window;
  /// FrontWindowProbe filters the same way.
  static func frontLayer0Window(_ list: [[String: Any]]) -> [String: Any]? {
    list.first { ($0[kCGWindowLayer as String] as? NSNumber)?.intValue == 0 }
  }

  /// Whether the frontmost on-screen window is the named one, by owner pid and bounds (no window name is read).
  static func frontWindowIs(pid: pid_t, bounds: CGRect) -> Bool {
    guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]],
          let front = frontLayer0Window(list) else { return false }
    return matchesFront(front, pid: pid, bounds: bounds)
  }

  /// One window-list entry against the named window: same owner, and bounds within a point.
  static func matchesFront(_ entry: [String: Any], pid: pid_t, bounds: CGRect) -> Bool {
    guard (entry[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value == pid,
          let dictionary = entry[kCGWindowBounds as String] as? NSDictionary,
          let rect = CGRect(dictionaryRepresentation: dictionary) else { return false }
    return abs(rect.minX - bounds.minX) < 1 && abs(rect.minY - bounds.minY) < 1
      && abs(rect.width - bounds.width) < 1 && abs(rect.height - bounds.height) < 1
  }

  private static func sourceWire(_ info: InputSourceInfo) -> [String: Any] {
    var wire = info.wire
    wire["perContextInput"] = perContextInputEnabled()
    return wire
  }

  static func emit(_ object: [String: Any], status: Int32) -> Int32 {
    if let data = encodeJSON(object) { FileHandle.standardOutput.write(data + Data("\n".utf8)) }
    return status
  }
}
