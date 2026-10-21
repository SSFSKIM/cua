import CoreGraphics
import Foundation

// `cua-engine --probe keystroke --user-pid <n> --user-bounds <x,y,w,h> [--at <unix ms>] [--key-codes-only|--ansi-keys]
// <text>`
// (Interfaces, UserProbe): the stand-in user. Waits for `--at`, checks that the front window is the named one, then
// types `text` from an HID-state event source at the HID event tap, checking the front window before every unit, and
// prints the post time, the layout it keyed through and the presses it posted.
//
// By default each typed unit is what type_text's keyed route posts: the layout's key press, its key down and up
// carrying the character (CGEventKeyboardSetUnicodeString), a character the layout cannot key sent as a string run.
// `--key-codes-only` posts the same key codes and flags with no string on any event, so whatever the target reads comes
// from the key codes through its input method alone (the Decision Log's "M2b pre-flight" item 1, MAWS P4-B2); a text
// with a character the layout cannot key is refused before anything is sent, since it has no key to press.
// `--ansi-keys` posts the physical keys whatever the layout: each character's key code from press_key's fixed ANSI
// table (`keyTable`, the vendor's pressKey table, F §6.4; r is 15, k is 40, a newline Return), no modifier flag and no
// string on any event, which is what the vendor's pressKey r, k posted in MAWS P4-B2; a character outside that table,
// or one the table keys only under a modifier (an upper-case letter), is refused before anything is sent.

/// A probe's malformed command line: the message the probe prints before it exits 64.
struct ProbeUsage: Error, Equatable {
  let message: String
}

/// What each key press carries: the layout's press with its character's string (the default, as type_text keys), the
/// layout's press alone, or the fixed ANSI key alone.
enum KeystrokeMode: String, Equatable {
  case typed, keyCodesOnly, ansiKeys
}

/// The keystroke command's arguments.
struct KeystrokeRequest: Equatable {
  let pid: pid_t
  let bounds: CGRect
  let at: Int64?
  let mode: KeystrokeMode
  let text: String

  /// The flags in any order, one text argument; throws ProbeUsage naming what is wrong.
  static func parse(_ arguments: [String]) throws(ProbeUsage) -> KeystrokeRequest {
    var pid: pid_t?
    var bounds: CGRect?
    var at: Int64?
    var modes: [KeystrokeMode] = []
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
        modes.append(.keyCodesOnly); index += 1
      case "--ansi-keys":
        modes.append(.ansiKeys); index += 1
      default:
        guard text == nil else { throw ProbeUsage(message: "keystroke takes one text argument") }
        text = arguments[index]; index += 1
      }
    }
    guard let pid, let bounds, let text else { throw ProbeUsage(message: "keystroke needs --user-pid, --user-bounds and a text") }
    guard Set(modes).count <= 1 else { throw ProbeUsage(message: "keystroke takes at most one of --key-codes-only and --ansi-keys") }
    return KeystrokeRequest(pid: pid, bounds: bounds, at: at, mode: modes.first ?? .typed, text: text)
  }

  private static func parseBounds(_ text: String) -> CGRect? {
    let parts = text.split(separator: ",").compactMap { Double($0) }
    guard parts.count == 4 else { return nil }
    return CGRect(x: parts[0], y: parts[1], width: parts[2], height: parts[3])
  }
}

/// The events the probe posts for `text`, one group per unit (the front window is checked before each group). Typed:
/// the typed units' events. Key codes only: every unit's layout press with no string on any event; nil when a character
/// has no key in the layout. ANSI keys: one press per character from the fixed table, no flag and no string; nil when a
/// character is outside it or keyed there only under a modifier. `press` is the current layout's (unused for ANSI keys).
func keystrokeUnits(_ text: String, mode: KeystrokeMode, press: (UInt16) -> KeyPress?) -> [[KeyEvent]]? {
  switch mode {
  case .typed:
    return typedUnits(text, press: press).map(\.events)
  case .keyCodesOnly:
    var keyed: [[KeyEvent]] = []
    for unit in typedUnits(text, press: press) {
      guard let press = unit.press else { return nil }
      keyed.append(keyPressEvents(press))
    }
    return keyed
  case .ansiKeys:
    var keyed: [[KeyEvent]] = []
    for character in text {
      let name = character.unicodeScalars.allSatisfy({ $0 == "\n" || $0 == "\r" }) ? "Return" : String(character)
      guard let fixed = keyTable[name], fixed.keyCode != nil, fixed.modifiers.isEmpty else { return nil }
      keyed.append(keyPressEvents(fixed))
    }
    return keyed
  }
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
  /// units), 5 when the layout or an event could not be made or the mode cannot key the text, 64 on a usage error.
  static func keystroke(_ arguments: [String]) -> Int32 {
    let request: KeystrokeRequest
    do { request = try KeystrokeRequest.parse(arguments) } catch { return emit(["error": error.message], status: 64) }
    if let at = request.at { while unixMilliseconds() < at { usleep(1_000) } }
    guard frontWindowIs(pid: request.pid, bounds: request.bounds) else {
      return emit(["error": "the front window is not the named one; nothing was sent"], status: 4)
    }
    guard let layout = KeyLayout.current() else { return emit(["error": "Unable to get the current keyboard layout."], status: 5) }
    guard let units = keystrokeUnits(request.text, mode: request.mode, press: layout.press(for:)) else {
      let why = request.mode == .ansiKeys ? "the fixed ANSI key table cannot key every character of the text without a modifier"
        : "the current layout cannot key every character of the text with key codes alone"
      return emit(["error": "\(why); nothing was sent", "layout": layout.layoutID, "mode": request.mode.rawValue], status: 5)
    }
    // The current layout is reported in every mode, though ANSI keys never consult it.
    let report: [String: Any] = ["pid": Int(getpid()), "layout": layout.layoutID, "mode": request.mode.rawValue, "presses": pressesWire(units)]
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
