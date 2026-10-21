import Carbon
import CoreGraphics
import Foundation

// `cua-engine --probe keystroke --user-pid <n> --user-bounds <x,y,w,h> [--at <unix ms>] [--key-codes-only|--ansi-keys]
// <text>` or `… --keys <spec>…`
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
// `--keys` (MAWS P4-B2's L6 and L7) takes press_key's key string instead of a text, one spec per argument, in order:
// `--keys r k BackSpace k`, `--keys alt+Return`. Each argument is one of press_key's space-separated combinations, so the
// arguments joined by spaces are the key string press_key would be given, parsed by press_key's own parser over its
// whole table (`parseKeySequence`, `keyTable`): letters are their fixed ANSI codes, modifiers press_key's exact names
// (option is `alt`, `Alt_L` or `Alt_R`). Each spec is one unit, posted as a keyboard posts it: a flags-changed event
// down per modifier, the key down and up carrying the flags, a flags-changed event up per modifier, no string on any
// event. An unknown or malformed spec is refused (exit 5) before the wait and before anything is sent. A chord keeps
// press_key's `+`: the harness's probe arguments admit `+` for it (launchProbe), so the probe takes press_key's syntax
// verbatim rather than a second spelling of it that would need translating back before the shared parser.

/// A probe's malformed command line: the message the probe prints before it exits 64.
struct ProbeUsage: Error, Equatable {
  let message: String
}

/// What each key press carries: the layout's press with its character's string (the default, as type_text keys), the
/// layout's press alone, the fixed ANSI key alone, or press_key's key specs posted as a keyboard does.
enum KeystrokeMode: String, Equatable {
  case typed, keyCodesOnly, ansiKeys, keySpecs
}

/// The keystroke command's arguments.
struct KeystrokeRequest: Equatable {
  let pid: pid_t
  let bounds: CGRect
  let at: Int64?
  let mode: KeystrokeMode
  /// The text to type, or (key specs) press_key's key string: the spec arguments joined by spaces.
  let text: String

  /// The flags in any order, one text argument (one or more spec arguments with `--keys`); throws ProbeUsage naming
  /// what is wrong.
  static func parse(_ arguments: [String]) throws(ProbeUsage) -> KeystrokeRequest {
    var pid: pid_t?
    var bounds: CGRect?
    var at: Int64?
    var modes: [KeystrokeMode] = []
    var texts: [String] = []
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
      case "--keys":
        modes.append(.keySpecs); index += 1
      default:
        texts.append(arguments[index]); index += 1
      }
    }
    guard let pid, let bounds, !texts.isEmpty else { throw ProbeUsage(message: "keystroke needs --user-pid, --user-bounds and a text") }
    guard Set(modes).count <= 1 else { throw ProbeUsage(message: "keystroke takes at most one of --key-codes-only, --ansi-keys and --keys") }
    let mode = modes.first ?? .typed
    guard mode == .keySpecs || texts.count == 1 else { throw ProbeUsage(message: "keystroke takes one text argument") }
    return KeystrokeRequest(pid: pid, bounds: bounds, at: at, mode: mode, text: texts.joined(separator: " "))
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
/// character is outside it or keyed there only under a modifier. Key specs: `keySpecUnits`, nil when a spec is refused.
/// `press` is the current layout's (unused for ANSI keys and key specs).
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
  case .keySpecs:
    return try? keySpecUnits(text)
  }
}

/// The modifier keys in the order a chord presses them (⌃⌥⇧⌘, the menus' order), each with its left-hand key code and
/// that key's device bit (NX_DEVICELCTLKEYMASK, …LALT…, …LSHIFT…, …LCMD…), which a physical keyboard's events carry
/// beside the generic mask; released in reverse.
private let modifierKeys: [(CarbonModifiers, CGKeyCode, device: UInt64)] = [
  (.control, CGKeyCode(kVK_Control), 0x01), (.option, CGKeyCode(kVK_Option), 0x20),
  (.shift, CGKeyCode(kVK_Shift), 0x02), (.command, CGKeyCode(kVK_Command), 0x08),
]

/// One press as a keyboard posts it: a flags-changed event per modifier going down, carrying that modifier's key code and
/// the flags held so far; the key down and up carrying every flag; a flags-changed event per modifier coming up, in
/// reverse, carrying the flags still held. A held modifier's flags are its generic mask and its left-hand device bit. Every flag is explicit (no `restore`, which reads the session's state back)
/// and no event carries a string. A press of modifiers alone is its flags-changed events.
func keyboardPressEvents(_ press: KeyPress) -> [KeyEvent] {
  let held = modifierKeys.filter { press.modifiers.contains($0.0) }
  var flags: CGEventFlags = []
  var events: [KeyEvent] = []
  for (modifier, code, device) in held {
    flags.formUnion(modifier.eventFlags.union(CGEventFlags(rawValue: device)))
    events.append(KeyEvent(kind: .flags, keyCode: code, flags: flags, text: nil))
  }
  if let code = press.keyCode {
    events.append(KeyEvent(kind: .down, keyCode: code, flags: flags, text: nil))
    events.append(KeyEvent(kind: .up, keyCode: code, flags: flags, text: nil))
  }
  for (modifier, code, device) in held.reversed() {
    flags.subtract(modifier.eventFlags.union(CGEventFlags(rawValue: device)))
    events.append(KeyEvent(kind: .flags, keyCode: code, flags: flags, text: nil))
  }
  return events
}

/// The events the probe posts for press_key's key string `keys`, one group per spec: press_key's parse (which throws its
/// invalidKey or invalidArguments error), each press as a keyboard posts it.
func keySpecUnits(_ keys: String) throws -> [[KeyEvent]] {
  try parseKeySequence(keys).map(keyboardPressEvents)
}

/// Key specs' flags-changed events as the probe reports them, a list per unit (empty for a key without modifiers):
/// each event's key code (the modifier key's) and flags (CGEventFlags' raw value). `presses` carries each unit's key
/// down, as in every mode.
func flagsChangedWire(_ units: [[KeyEvent]]) -> [[[String: Any]]] {
  units.map { unit in unit.filter { $0.kind == .flags }.map { ["keyCode": Int($0.keyCode), "flags": Int($0.flags.rawValue)] } }
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
  /// units), 5 when the layout or an event could not be made, the mode cannot key the text or a key spec is unknown or
  /// malformed, 64 on a usage error.
  static func keystroke(_ arguments: [String]) -> Int32 {
    let request: KeystrokeRequest
    do { request = try KeystrokeRequest.parse(arguments) } catch { return emit(["error": error.message], status: 64) }
    // Key specs need no layout: one press_key refuses is refused at once, with press_key's reason, before the wait.
    if request.mode == .keySpecs {
      do { _ = try keySpecUnits(request.text) } catch {
        let why = (error as? EngineError)?.message ?? "\(error)"
        return emit(["error": "\(why); nothing was sent", "mode": request.mode.rawValue], status: 5)
      }
    }
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
    // The current layout is reported in every mode, though ANSI keys and key specs never consult it.
    var report: [String: Any] = ["pid": Int(getpid()), "layout": layout.layoutID, "mode": request.mode.rawValue, "presses": pressesWire(units)]
    if request.mode == .keySpecs { report.merge(["keys": request.text, "flagsChanged": flagsChangedWire(units)]) { $1 } }
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
    let size: [String: Any] = request.mode == .keySpecs ? [:] : ["chars": request.text.utf16.count]
    return emit(report.merging(["postedAt": Int(postedAt), "units": units.count].merging(size) { $1 }) { $1 }, status: 0)
  }
}
