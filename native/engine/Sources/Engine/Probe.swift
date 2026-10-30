import AppKit
import Carbon
import CoreGraphics
import Foundation

// `cua-engine --probe <command>` (Interfaces, UserProbe). A probe binds no socket; every command exits except
// `watch-activations`, which is resident until killed. The commands: `input-source current` (the active source, read
// only), `input-source <id> [--at <unix ms>]` (selects that source, a keyboard layout or an input mode such as Korean
// 2-Set, at the scheduled time when `--at` is given, and reads it back; the harness saves and restores the owner's), `keystroke` (the stand-in user: HID-state events posted at the HID
// event tap, only while the named window is frontmost, with each character's string, the layout's key codes alone, the
// fixed ANSI keys, or press_key's key specs posted as a keyboard posts them; KeystrokeProbe.swift), `focus` (the focused app and window, and the named window's focused value
// as a hash; FocusProbe.swift), `text-view` (a harness-owned text view's selected range and scroll bars by Accessibility,
// past the engine's observation; TextViewProbe.swift) and `watch-activations` (every NSWorkspace activation and deactivation with its time, the probe's
// own pid printed first, so the harness can stop it and the oracles can exclude probe instances), `cursor` (the agent
// cursor drawn and run through its moves and states, or held over a window; Cursor/CursorProbe.swift). Every command but
// `watch-activations` prints one JSON line, its result, carrying `exitStatus` (the process's exit code, which `open`
// does not pass through); `watch-activations` streams lines until killed and has no final line, so none of its lines
// carries one.
enum Probe {
  static func run(_ arguments: [String]) -> Int32 {
    switch arguments.first {
    case "input-source":
      do { return inputSource(try InputSourceRequest.parse(Array(arguments.dropFirst()))) } catch { return emit(["error": error.message], status: 64) }
    case "keystroke":
      return keystroke(Array(arguments.dropFirst()))
    case "focus":
      return focus(Array(arguments.dropFirst()))
    case "text-view":
      return textView(Array(arguments.dropFirst()))
    case "watch-activations":
      return watchActivations()
    case "cursor":
      return CursorProbe.run(Array(arguments.dropFirst()))
    default:
      return emit(["error": "usage: --probe input-source current|<id> [--at <unix ms>] | keystroke --user-pid <n> --user-bounds <x,y,w,h> [--at <unix ms>] [--key-codes-only|--ansi-keys] <text> | keystroke --user-pid <n> --user-bounds <x,y,w,h> [--at <unix ms>] --keys <press_key spec>... | focus [--window <pid,x,y,w,h>] | text-view --pid <n> [--set-horizontal <0..1>] [--set-vertical <0..1>] | watch-activations | cursor [--window <n> [--seconds <n>]]"],
                  status: 64)
    }
  }

  /// `input-source current` reads; `input-source <id> [--at <unix ms>]` waits for `--at` when given, then selects and
  /// reads back, printing `selectedAt`, the time the selection was made (the matrix's mid-switch row places it inside
  /// a keyed type_text's interval).
  private static func inputSource(_ request: InputSourceRequest) -> Int32 {
    let argument = request.source
    if argument == "current" { return emit(currentWire(), status: 0) }
    let filter = [kTISPropertyInputSourceID as String: argument] as CFDictionary
    guard let list = TISCreateInputSourceList(filter, true)?.takeRetainedValue() as? [TISInputSource], let source = list.first else {
      return emit(["error": "no input source with that id"], status: 2)
    }
    if let at = request.at { while unixMilliseconds() < at { usleep(1_000) } }
    let previous = currentWire()
    let selectedAt = unixMilliseconds()
    let status = TISSelectInputSource(source)
    // Read back: the selection holds only when the current source is the one asked for (an input mode's parent method
    // may take a moment to switch), polled for up to 500 ms.
    var current = currentInputSource()
    for _ in 0..<10 where status == noErr && current.id != argument {
      usleep(50_000)
      current = currentInputSource()
    }
    let selected = status == noErr && current.id == argument
    return emit(["previous": previous, "current": sourceWire(current, layout: currentKeyboardLayoutID(), perContextInput: perContextInputEnabled()), "selected": selected,
                 "selectedAt": Int(selectedAt)], status: selected ? 0 : 3)
  }

  /// `watch-activations`: prints its own pid, then every NSWorkspace application activation and deactivation with its
  /// time, until killed (the resident probe runs without -W).
  private static func watchActivations() -> Int32 {
    stream(["pid": Int(getpid()), "watch": "activations"])
    let center = NSWorkspace.shared.notificationCenter
    for (name, kind) in [(NSWorkspace.didActivateApplicationNotification, "activated"), (NSWorkspace.didDeactivateApplicationNotification, "deactivated")] {
      center.addObserver(forName: name, object: nil, queue: .main) { notification in
        guard let application = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication else { return }
        stream(["at": Int(unixMilliseconds()), "kind": kind, "pid": Int(application.processIdentifier),
                "bundleId": application.bundleIdentifier ?? NSNull()])
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

  /// A source as the probe reports it: its id and kind, the per-context preference, and `layout`, the keyboard layout
  /// key events are translated with now (TISCopyCurrentKeyboardLayoutInputSource; null when unreadable). An input
  /// method that has engaged in the focused client reports its own layout (2-Set's com.apple.keylayout.2SetHangul);
  /// a selection made while a field already held focus can read the method as current while the layout stays the
  /// previous one and keys arrive raw (MAWS B2), so the harness reads both.
  static func sourceWire(_ info: InputSourceInfo, layout: String?, perContextInput: Bool) -> [String: Any] {
    var wire = info.wire
    wire["perContextInput"] = perContextInput
    wire["layout"] = layout ?? NSNull()
    return wire
  }

  private static func currentWire() -> [String: Any] {
    sourceWire(currentInputSource(), layout: currentKeyboardLayoutID(), perContextInput: perContextInputEnabled())
  }

  /// The current keyboard layout's source id.
  private static func currentKeyboardLayoutID() -> String? {
    onMain {
      guard let pointer = TISGetInputSourceProperty(TISCopyCurrentKeyboardLayoutInputSource().takeRetainedValue(), kTISPropertyInputSourceID) else { return nil }
      return Unmanaged<CFString>.fromOpaque(pointer).takeUnretainedValue() as String
    }
  }

  /// Where a probe's lines go: standard output (the unit tests capture them).
  nonisolated(unsafe) static var write: (Data) -> Void = { FileHandle.standardOutput.write($0) }

  /// A command's final line, with `exitStatus`, the status the process exits with: a harness that launches the probe
  /// through `open` never sees the exit code. Every command's result goes through here, so every final line carries it.
  static func emit(_ object: [String: Any], status: Int32) -> Int32 {
    stream(object.merging(["exitStatus": Int(status)]) { $1 })
    return status
  }

  /// A line before the final one: watch-activations' stream, which ends only when the resident probe is killed.
  static func stream(_ object: [String: Any]) {
    if let data = encodeJSON(object) { write(data + Data("\n".utf8)) }
  }
}

/// The input-source command's arguments: `current` or one source id, and `--at` (a selection only).
struct InputSourceRequest: Equatable {
  let source: String
  let at: Int64?

  static func parse(_ arguments: [String]) throws(ProbeUsage) -> InputSourceRequest {
    var source: String?
    var at: Int64?
    var index = 0
    while index < arguments.count {
      if arguments[index] == "--at" {
        guard index + 1 < arguments.count, let time = Int64(arguments[index + 1]) else { throw ProbeUsage(message: "--at needs a unix ms number") }
        at = time; index += 2
      } else {
        guard source == nil else { throw ProbeUsage(message: "input-source takes one source") }
        source = arguments[index]; index += 1
      }
    }
    guard let source else { throw ProbeUsage(message: "input-source needs current or a source id") }
    if source == "current", at != nil { throw ProbeUsage(message: "--at schedules a selection, not a reading of the current source") }
    return InputSourceRequest(source: source, at: at)
  }
}
