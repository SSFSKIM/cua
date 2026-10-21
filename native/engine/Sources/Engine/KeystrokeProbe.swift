import CoreGraphics
import Foundation

// `cua-engine --probe keystroke --user-pid <n> --user-bounds <x,y,w,h> [--at <unix ms>] [--key-codes-only] <text>`
// (Interfaces, UserProbe): the stand-in user. Waits for `--at`, checks that the front window is the named one, then
// types `text` from an HID-state event source at the HID event tap, checking the front window before every unit, and
// prints the post time, the layout it keyed through and the presses it posted.
//
// By default each typed unit is what type_text's keyed route posts: the layout's key press, its key down and up
// carrying the character (CGEventKeyboardSetUnicodeString), a character the layout cannot key sent as a string run.
// `--key-codes-only` posts the same key codes and flags with no string on any event, so whatever the target reads comes
// from the key codes through its input method alone (the Decision Log's "M2b pre-flight" item 1, MAWS P4-B2); a text
// with a character the layout cannot key is refused before anything is sent, since it has no key to press.

/// A probe's malformed command line: the message the probe prints before it exits 64.
struct ProbeUsage: Error, Equatable {
  let message: String
}

/// The keystroke command's arguments.
struct KeystrokeRequest: Equatable {
  let pid: pid_t
  let bounds: CGRect
  let at: Int64?
  let keyCodesOnly: Bool
  let text: String

  /// The flags in any order, one text argument; throws ProbeUsage naming what is wrong.
  static func parse(_ arguments: [String]) throws(ProbeUsage) -> KeystrokeRequest {
    var pid: pid_t?
    var bounds: CGRect?
    var at: Int64?
    var keyCodesOnly = false
    var text: String?
    var index = 0
    func value() -> String? { index + 1 < arguments.count ? arguments[index + 1] : nil }
    while index < arguments.count {
      switch arguments[index] {
      case "--user-pid":
        guard let number = value().flatMap({ Int32($0) }) else { throw ProbeUsage(message: "--user-pid needs a number") }
        pid = number; index += 2
      case "--user-bounds":
        guard let rect = value().flatMap(parseBounds) else { throw ProbeUsage(message: "--user-bounds needs x,y,w,h") }
        bounds = rect; index += 2
      case "--at":
        guard let time = value().flatMap({ Int64($0) }) else { throw ProbeUsage(message: "--at needs a unix ms number") }
        at = time; index += 2
      case "--key-codes-only":
        keyCodesOnly = true; index += 1
      default:
        guard text == nil else { throw ProbeUsage(message: "keystroke takes one text argument") }
        text = arguments[index]; index += 1
      }
    }
    guard let pid, let bounds, let text else { throw ProbeUsage(message: "keystroke needs --user-pid, --user-bounds and a text") }
    return KeystrokeRequest(pid: pid, bounds: bounds, at: at, keyCodesOnly: keyCodesOnly, text: text)
  }

  private static func parseBounds(_ text: String) -> CGRect? {
    let parts = text.split(separator: ",").compactMap { Double($0) }
    guard parts.count == 4 else { return nil }
    return CGRect(x: parts[0], y: parts[1], width: parts[2], height: parts[3])
  }
}

/// The events the probe posts for `text`, one group per typed unit (the front window is checked before each group).
/// With `keyCodesOnly`, every unit's layout press with no string on any event; nil when a character has no key in the
/// layout.
func keystrokeUnits(_ text: String, keyCodesOnly: Bool, press: (UInt16) -> KeyPress?) -> [[KeyEvent]]? {
  let units = typedUnits(text, press: press)
  guard keyCodesOnly else { return units.map(\.events) }
  var keyed: [[KeyEvent]] = []
  for unit in units {
    guard let press = unit.press else { return nil }
    keyed.append(keyPressEvents(press))
  }
  return keyed
}

/// The presses as the probe reports them: per unit, its key down's key code, flags (CGEventFlags' raw value) and the
/// string it carried (null with none).
func pressesWire(_ units: [[KeyEvent]]) -> [[String: Any]] {
  units.compactMap { unit in
    unit.first { $0.kind == .down }.map { down in
      ["keyCode": Int(down.keyCode), "flags": Int(down.flags.rawValue),
       "unicode": down.text.map { String(utf16CodeUnits: $0, count: $0.count) as Any } ?? NSNull()]
    }
  }
}

extension Probe {
  /// `keystroke …`: exits 0 when every unit was posted, 4 when the front window is not the named one (before or between
  /// units), 5 when the layout or an event could not be made or the layout cannot key the text with key codes alone,
  /// 64 on a usage error.
  static func keystroke(_ arguments: [String]) -> Int32 {
    let request: KeystrokeRequest
    do { request = try KeystrokeRequest.parse(arguments) } catch { return emit(["error": error.message], status: 64) }
    if let at = request.at { while unixMilliseconds() < at { usleep(1_000) } }
    guard frontWindowIs(pid: request.pid, bounds: request.bounds) else {
      return emit(["error": "the front window is not the named one; nothing was sent"], status: 4)
    }
    guard let layout = KeyLayout.current() else { return emit(["error": "Unable to get the current keyboard layout."], status: 5) }
    guard let units = keystrokeUnits(request.text, keyCodesOnly: request.keyCodesOnly, press: layout.press(for:)) else {
      return emit(["error": "the current layout cannot key every character of the text with key codes alone; nothing was sent",
                   "layout": layout.layoutID, "keyCodesOnly": true], status: 5)
    }
    let report: [String: Any] = ["pid": Int(getpid()), "layout": layout.layoutID, "keyCodesOnly": request.keyCodesOnly, "presses": pressesWire(units)]
    let poster = EventPoster.toHIDTap()
    let postedAt = unixMilliseconds()
    for unit in units {
      guard frontWindowIs(pid: request.pid, bounds: request.bounds) else {
        return emit(report.merging(["postedAt": Int(postedAt), "aborted": true, "units": units.count]) { $1 }, status: 4)
      }
      for spec in unit {
        guard poster.post(spec) else { return emit(["error": "a key event could not be created"], status: 5) }
        usleep(250)
      }
    }
    return emit(report.merging(["postedAt": Int(postedAt), "units": units.count, "chars": request.text.utf16.count]) { $1 }, status: 0)
  }
}
