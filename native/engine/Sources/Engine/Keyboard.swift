import Carbon
import CoreGraphics
import Foundation

// Keys and the keyboard layout (the spec's Design, "Keys" and "Text"): the active input source read directly with
// TISCopyCurrentKeyboardInputSource; a reverse map from the produced text to (virtual key code, modifiers) built with
// UCKeyTranslate over the layout's `uchr` data, once per layout; the xdotool-style key grammar of press_key.

struct InputSourceInfo {
  let id: String
  let name: String
  /// A plain keyboard layout (TIS type KeyboardLayout), whose key events reach the app as the layout keys them; an
  /// input method (Korean, Japanese…) interprets key events by its composition state instead.
  let keyboardLayout: Bool
  let asciiCapable: Bool

  var wire: [String: Any] { ["id": id, "name": name, "keyboardLayout": keyboardLayout, "asciiCapable": asciiCapable] }
}

private func property<T>(_ source: TISInputSource, _ key: CFString, as: T.Type) -> T? {
  guard let pointer = TISGetInputSourceProperty(source, key) else { return nil }
  return Unmanaged<AnyObject>.fromOpaque(pointer).takeUnretainedValue() as? T
}

func inputSourceInfo(_ source: TISInputSource) -> InputSourceInfo {
  let type = property(source, kTISPropertyInputSourceType, as: String.self)
  return InputSourceInfo(
    id: property(source, kTISPropertyInputSourceID, as: String.self) ?? "",
    name: property(source, kTISPropertyLocalizedName, as: String.self) ?? "",
    keyboardLayout: type == (kTISTypeKeyboardLayout as String),
    asciiCapable: property(source, kTISPropertyInputSourceIsASCIICapable, as: Bool.self) ?? false)
}

func currentInputSource() -> InputSourceInfo { inputSourceInfo(TISCopyCurrentKeyboardInputSource().takeRetainedValue()) }

/// The id alone, for the check before every keyed event.
func currentInputSourceID() -> String {
  property(TISCopyCurrentKeyboardInputSource().takeRetainedValue(), kTISPropertyInputSourceID, as: String.self) ?? ""
}

/// Keyboard → Input Sources → "Automatically switch to a document's input source": macOS then holds a source per app,
/// so the session's source says nothing reliable about a background app's.
func perContextInputEnabled() -> Bool {
  let properties = CFPreferencesCopyAppValue("AppleGlobalTextInputProperties" as CFString, "com.apple.HIToolbox" as CFString) as? [String: Any]
  return (properties?["TextInputGlobalPropertyPerContextInput"] as? NSNumber)?.boolValue ?? false
}

struct KeyStroke {
  let keyCode: CGKeyCode
  let flags: CGEventFlags
}

/// The layout's reverse map: for every text one key produces (under no modifier, Shift, Option, Shift+Option), the
/// key and modifiers that produce it, the fewest modifiers winning. Keypad keys are left out so digits key from the
/// main row.
final class KeyLayout: @unchecked Sendable {
  let layoutID: String
  private let strokes: [[UInt16]: KeyStroke]

  private init(layoutID: String, strokes: [[UInt16]: KeyStroke]) {
    self.layoutID = layoutID
    self.strokes = strokes
  }

  func stroke(for text: [UInt16]) -> KeyStroke? { strokes[text] }

  private static let lock = NSLock()
  nonisolated(unsafe) private static var cached: KeyLayout?

  /// The current layout's map, rebuilt when the layout changed since the last build.
  static func current() -> KeyLayout? {
    let source = TISCopyCurrentKeyboardLayoutInputSource().takeRetainedValue()
    let id = property(source, kTISPropertyInputSourceID, as: String.self) ?? ""
    lock.lock()
    defer { lock.unlock() }
    if let cached, cached.layoutID == id { return cached }
    guard let data = property(source, kTISPropertyUnicodeKeyLayoutData, as: Data.self) else { return nil }
    let built = KeyLayout(layoutID: id, strokes: build(data))
    cached = built
    return built
  }

  private static let keypad: Set<CGKeyCode> = [65, 67, 69, 71, 75, 76, 78, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92]

  private static func build(_ data: Data) -> [[UInt16]: KeyStroke] {
    var strokes: [[UInt16]: KeyStroke] = [:]
    // UCKeyTranslate's modifier state is the Carbon modifiers shifted right by 8: Shift 0x02, Option 0x08.
    let combinations: [(state: UInt32, flags: CGEventFlags)] = [(0, []), (0x02, .maskShift), (0x08, .maskAlternate), (0x0A, [.maskShift, .maskAlternate])]
    data.withUnsafeBytes { raw in
      let layout = raw.baseAddress!.assumingMemoryBound(to: UCKeyboardLayout.self)
      for combination in combinations {
        for code in CGKeyCode(0)..<128 where !keypad.contains(code) {
          var deadKeys: UInt32 = 0
          var length = 0
          var chars = [UniChar](repeating: 0, count: 8)
          let status = UCKeyTranslate(layout, code, UInt16(kUCKeyActionDown), combination.state, UInt32(LMGetKbdType()),
                                      OptionBits(kUCKeyTranslateNoDeadKeysMask), &deadKeys, chars.count, &length, &chars)
          guard status == noErr, length > 0 else { continue }
          let text = Array(chars[0..<length])
          guard text.allSatisfy({ $0 >= 0x20 && $0 != 0x7F }), strokes[text] == nil else { continue }
          strokes[text] = KeyStroke(keyCode: code, flags: combination.flags)
        }
      }
    }
    return strokes
  }
}

// MARK: press_key's grammar

enum Modifier {
  case command, shift, option, control

  var flag: CGEventFlags {
    switch self {
    case .command: .maskCommand
    case .shift: .maskShift
    case .option: .maskAlternate
    case .control: .maskControl
    }
  }

  var keyCode: CGKeyCode {
    switch self {
    case .command: 55
    case .shift: 56
    case .option: 58
    case .control: 59
    }
  }
}

private let modifierNames: [String: Modifier] = [
  "super": .command, "super_l": .command, "super_r": .command, "cmd": .command, "command": .command,
  "meta": .command, "meta_l": .command, "meta_r": .command,
  "ctrl": .control, "control": .control, "control_l": .control, "control_r": .control,
  "alt": .option, "alt_l": .option, "alt_r": .option, "option": .option,
  "shift": .shift, "shift_l": .shift, "shift_r": .shift,
]

/// Named keys that produce no text, by lowercased xdotool keysym (and the common aliases), to virtual key codes.
private let namedKeys: [String: CGKeyCode] = [
  "return": 36, "enter": 36, "linefeed": 36, "tab": 48, "space": 49, "backspace": 51, "escape": 53, "esc": 53,
  "delete": 117, "home": 115, "end": 119, "prior": 116, "page_up": 116, "pageup": 116, "next": 121, "page_down": 121,
  "pagedown": 121, "left": 123, "right": 124, "down": 125, "up": 126, "help": 114, "insert": 114, "caps_lock": 57,
  "f1": 122, "f2": 120, "f3": 99, "f4": 118, "f5": 96, "f6": 97, "f7": 98, "f8": 100, "f9": 101, "f10": 109,
  "f11": 103, "f12": 111, "f13": 105, "f14": 107, "f15": 113, "f16": 106, "f17": 64, "f18": 79, "f19": 80, "f20": 90,
  "kp_0": 82, "kp_1": 83, "kp_2": 84, "kp_3": 85, "kp_4": 86, "kp_5": 87, "kp_6": 88, "kp_7": 89, "kp_8": 91, "kp_9": 92,
  "kp_decimal": 65, "kp_multiply": 67, "kp_add": 69, "kp_clear": 71, "clear": 71, "num_lock": 71, "kp_divide": 75,
  "kp_enter": 76, "kp_subtract": 78, "kp_equal": 81, "kp_home": 115, "kp_end": 119, "kp_prior": 116, "kp_page_up": 116,
  "kp_next": 121, "kp_page_down": 121, "kp_left": 123, "kp_right": 124, "kp_up": 126, "kp_down": 125, "kp_tab": 48,
  "kp_space": 49,
]

/// Keysyms that name a character, keyed through the layout like typed text.
private let characterKeysyms: [String: String] = [
  "exclam": "!", "quotedbl": "\"", "numbersign": "#", "dollar": "$", "percent": "%", "ampersand": "&",
  "apostrophe": "'", "quoteright": "'", "parenleft": "(", "parenright": ")", "asterisk": "*", "plus": "+",
  "comma": ",", "minus": "-", "period": ".", "slash": "/", "colon": ":", "semicolon": ";", "less": "<", "equal": "=",
  "greater": ">", "question": "?", "at": "@", "bracketleft": "[", "backslash": "\\", "bracketright": "]",
  "asciicircum": "^", "underscore": "_", "grave": "`", "quoteleft": "`", "braceleft": "{", "bar": "|",
  "braceright": "}", "asciitilde": "~",
]

struct Chord {
  let modifiers: [Modifier]
  /// The main key; nil when the chord is modifiers alone (pressed and released).
  let key: KeyStroke?
}

func invalidKey(_ name: String) -> EngineError {
  EngineError(name: "invalidKey", "Unknown key name '\(name.prefix(32))' in the key combination")
}

/// Parses `super+n`, `ctrl+shift+Tab`, `Return`, `KP_0`, `a`, `A`, `exclam`, `ctrl++`.
func parseChord(_ text: String, layout: KeyLayout?) throws -> Chord {
  let trimmed = text.trimmingCharacters(in: .whitespaces)
  guard !trimmed.isEmpty else { throw EngineError.invalidArguments("key is required") }
  var parts: [String]
  if trimmed == "+" { parts = ["+"] }
  else if trimmed.hasSuffix("++") { parts = trimmed.dropLast(2).split(separator: "+").map(String.init) + ["+"] }
  else { parts = trimmed.split(separator: "+", omittingEmptySubsequences: false).map(String.init) }
  guard !parts.contains(where: \.isEmpty) else { throw invalidKey(trimmed) }
  var modifiers: [Modifier] = []
  for part in parts.dropLast() {
    guard let modifier = modifierNames[part.lowercased()] else { throw invalidKey(part) }
    if !modifiers.contains(modifier) { modifiers.append(modifier) }
  }
  let last = parts.last!
  if let modifier = modifierNames[last.lowercased()] {
    if !modifiers.contains(modifier) { modifiers.append(modifier) }
    return Chord(modifiers: modifiers, key: nil)
  }
  if let code = namedKeys[last.lowercased()] { return Chord(modifiers: modifiers, key: KeyStroke(keyCode: code, flags: [])) }
  let character = characterKeysyms[last.lowercased()] ?? (last.count == 1 ? last : nil)
  guard let character, let stroke = layout?.stroke(for: Array(character.utf16)) ?? layout?.stroke(for: Array(character.lowercased().utf16)).map({
    KeyStroke(keyCode: $0.keyCode, flags: $0.flags.union(character != character.lowercased() ? .maskShift : []))
  }) else { throw invalidKey(last) }
  return Chord(modifiers: modifiers, key: stroke)
}

// MARK: Posting

/// Where key and mouse events go: to one process (the engine's route 2, from a private event source, so they never
/// count as the user's input) or to the HID event tap (the probe, from an HID-state source, so they do).
struct EventPoster {
  let source: CGEventSource?
  let deliver: (CGEvent) -> Void

  static func toProcess(_ pid: pid_t) -> EventPoster {
    EventPoster(source: CGEventSource(stateID: .privateState)) { $0.postToPid(pid) }
  }

  static func toHIDTap() -> EventPoster {
    EventPoster(source: CGEventSource(stateID: .hidSystemState)) { $0.post(tap: .cghidEventTap) }
  }

  func key(_ code: CGKeyCode, down: Bool, flags: CGEventFlags, text: [UInt16]? = nil) {
    guard let event = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: down) else { return }
    event.flags = flags
    if let text { event.keyboardSetUnicodeString(stringLength: text.count, unicodeString: text) }
    deliver(event)
  }

  /// One chord: modifiers down in order, the key down and up, modifiers up in reverse; every held modifier released.
  /// `check` runs before each event and may stop the chord by throwing.
  func chord(_ chord: Chord, check: () throws -> Void) throws {
    var held: CGEventFlags = []
    var pressed: [Modifier] = []
    defer {
      for modifier in pressed.reversed() {
        held.remove(modifier.flag)
        key(modifier.keyCode, down: false, flags: held)
      }
    }
    for modifier in chord.modifiers {
      try check()
      held.insert(modifier.flag)
      key(modifier.keyCode, down: true, flags: held)
      pressed.append(modifier)
    }
    if let stroke = chord.key {
      try check()
      let flags = held.union(stroke.flags)
      key(stroke.keyCode, down: true, flags: flags)
      key(stroke.keyCode, down: false, flags: flags)
    }
  }
}

/// A unit of typed text: one keyed character, one Return, or a run of characters the layout cannot key, sent as
/// Unicode-string events of at most 20 UTF-16 units that never split a character.
enum TypedUnit {
  case keyed(KeyStroke, [UInt16])
  case newline
  case unicode([UInt16])

  var length: Int {
    switch self {
    case .keyed(_, let text): text.count
    case .newline: 1
    case .unicode(let text): text.count
    }
  }
}

let unicodeChunkLimit = 20
let returnKeyCode: CGKeyCode = 36

func typedUnits(_ text: String, layout: KeyLayout?) -> [TypedUnit] {
  var units: [TypedUnit] = []
  var pending: [UInt16] = []
  func flush() { if !pending.isEmpty { units.append(.unicode(pending)); pending = [] } }
  for character in text {
    let utf16 = Array(character.utf16)
    if character == "\n" || character == "\r" || character == "\r\n" {
      flush()
      units.append(.newline)
    } else if character == "\t" {
      flush()
      units.append(.keyed(KeyStroke(keyCode: 48, flags: []), utf16))
    } else if let stroke = layout?.stroke(for: utf16) {
      flush()
      units.append(.keyed(stroke, utf16))
    } else {
      if pending.count + utf16.count > unicodeChunkLimit { flush() }
      pending.append(contentsOf: utf16)
    }
  }
  flush()
  return units
}

extension EventPoster {
  func type(_ unit: TypedUnit) {
    switch unit {
    case .keyed(let stroke, let text):
      key(stroke.keyCode, down: true, flags: stroke.flags, text: text)
      key(stroke.keyCode, down: false, flags: stroke.flags, text: text)
    case .newline:
      key(returnKeyCode, down: true, flags: [])
      key(returnKeyCode, down: false, flags: [])
    case .unicode(let text):
      key(0, down: true, flags: [], text: text)
      key(0, down: false, flags: [], text: text)
    }
  }
}
