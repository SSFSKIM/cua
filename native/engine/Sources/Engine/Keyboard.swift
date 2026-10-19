import Carbon
import CoreGraphics
import Foundation

// Keys and the keyboard layout (the spec's Design, "Keys" and "Text"; R/F-helper-logic.md §6, R/sky-behaviour.md §13–14):
// the active input source, read directly; the layout's reverse map from one UTF-16 unit to (virtual key code, Carbon
// modifiers), built as the vendor builds it; press_key's grammar over the vendor's exact, case-sensitive key table; the
// four events of one key press and the typed units of a text, as data; and the posting of those events. TIS calls are
// made on the main thread (`onMain`), since the engine's requests run on connection threads.

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

/// Runs `body` on the main thread (HIToolbox's input-source calls expect it); directly when already there.
func onMain<T>(_ body: () -> T) -> T {
  Thread.isMainThread ? body() : DispatchQueue.main.sync(execute: body)
}

func currentInputSource() -> InputSourceInfo { onMain { inputSourceInfo(TISCopyCurrentKeyboardInputSource().takeRetainedValue()) } }

/// The id alone, for the check before every keyed event.
func currentInputSourceID() -> String {
  onMain { property(TISCopyCurrentKeyboardInputSource().takeRetainedValue(), kTISPropertyInputSourceID, as: String.self) ?? "" }
}

/// Keyboard → Input Sources → "Automatically switch to a document's input source": macOS then holds a source per app,
/// so the session's source says nothing reliable about a background app's.
func perContextInputEnabled() -> Bool {
  let properties = CFPreferencesCopyAppValue("AppleGlobalTextInputProperties" as CFString, "com.apple.HIToolbox" as CFString) as? [String: Any]
  return (properties?["TextInputGlobalPropertyPerContextInput"] as? NSNumber)?.boolValue ?? false
}

// MARK: Key presses

/// Carbon modifier masks, as the vendor's key presses carry them (F §5's constants).
struct CarbonModifiers: OptionSet, Hashable {
  let rawValue: UInt32
  static let command = CarbonModifiers(rawValue: 0x100)
  static let shift = CarbonModifiers(rawValue: 0x200)
  static let option = CarbonModifiers(rawValue: 0x800)
  static let control = CarbonModifiers(rawValue: 0x1000)

  var eventFlags: CGEventFlags {
    var flags: CGEventFlags = []
    if contains(.command) { flags.insert(.maskCommand) }
    if contains(.shift) { flags.insert(.maskShift) }
    if contains(.option) { flags.insert(.maskAlternate) }
    if contains(.control) { flags.insert(.maskControl) }
    return flags
  }
}

/// One key press: a virtual key code under modifiers. `keyCode` nil is a combination of modifiers alone.
struct KeyPress: Equatable {
  let keyCode: CGKeyCode?
  let modifiers: CarbonModifiers
}

let returnKeyCode: CGKeyCode = 0x24

// MARK: The layout's reverse map

/// The vendor's eight masks, searched in this order (F §6.2): shift, option, control and their combinations, never ⌘.
let reverseMapMasks: [CarbonModifiers] = [0, 0x200, 0x800, 0xA00, 0x1000, 0x1200, 0x1800, 0x1A00].map(CarbonModifiers.init(rawValue:))

/// The layout's reverse map, as the vendor builds it (F §6.2): for each mask in order, key codes 0–127, the text
/// `UCKeyTranslate` displays for the key (kUCKeyActionDisplay, no dead-key state); a UTF-16 unit maps to the first key
/// press that displays exactly it. Keypad keys are not excluded, so `*` and `+` key from the keypad, as the vendor's do.
/// Rebuilt when the current layout's id differs from the one it was built for, which is when the selected-source
/// notification would have rebuilt it.
final class KeyLayout: @unchecked Sendable {
  let layoutID: String
  private let presses: [UInt16: KeyPress]

  init(layoutID: String, presses: [UInt16: KeyPress]) {
    self.layoutID = layoutID
    self.presses = presses
  }

  /// The press for one UTF-16 unit; a newline is looked up as a carriage return, as the vendor does.
  func press(for unit: UInt16) -> KeyPress? { presses[unit == 0x0A ? 0x0D : unit] }

  private static let lock = NSLock()
  nonisolated(unsafe) private static var cached: KeyLayout?

  /// The current layout's map (TISCopyCurrentKeyboardLayoutInputSource: under an input method, its layout).
  static func current() -> KeyLayout? {
    guard let (id, data) = onMain({ layoutData(TISCopyCurrentKeyboardLayoutInputSource().takeRetainedValue()) }) else { return nil }
    lock.lock()
    defer { lock.unlock() }
    if let cached, cached.layoutID == id { return cached }
    let built = KeyLayout(layoutID: id, presses: build(data))
    cached = built
    return built
  }

  /// The map of an installed layout by its source id (the unit tests' US layout), without selecting it.
  static func named(_ sourceID: String) -> KeyLayout? {
    let filter = [kTISPropertyInputSourceID as String: sourceID] as CFDictionary
    guard let list = TISCreateInputSourceList(filter, true)?.takeRetainedValue() as? [TISInputSource], let source = list.first,
          let (id, data) = layoutData(source) else { return nil }
    return KeyLayout(layoutID: id, presses: build(data))
  }

  private static func layoutData(_ source: TISInputSource) -> (String, Data)? {
    guard let data = property(source, kTISPropertyUnicodeKeyLayoutData, as: Data.self) else { return nil }
    return (property(source, kTISPropertyInputSourceID, as: String.self) ?? "", data)
  }

  private static func build(_ data: Data) -> [UInt16: KeyPress] {
    data.withUnsafeBytes { raw in
      let layout = raw.baseAddress!.assumingMemoryBound(to: UCKeyboardLayout.self)
      return reverseMap { code, mask in
        var deadKeys: UInt32 = 0
        var length = 0
        var chars = [UniChar](repeating: 0, count: 4)
        let status = UCKeyTranslate(layout, code, UInt16(kUCKeyActionDisplay), mask.rawValue >> 8, UInt32(LMGetKbdType()),
                                    0, &deadKeys, chars.count, &length, &chars)
        return status == noErr ? Array(chars[0..<length]) : []
      }
    }
  }

  /// The search, over any key translation: the first exact single-unit match per unit, masks outermost.
  static func reverseMap(_ translate: (CGKeyCode, CarbonModifiers) -> [UInt16]) -> [UInt16: KeyPress] {
    var presses: [UInt16: KeyPress] = [:]
    for mask in reverseMapMasks {
      for code in CGKeyCode(0)..<128 {
        let text = translate(code, mask)
        if text.count == 1, presses[text[0]] == nil { presses[text[0]] = KeyPress(keyCode: code, modifiers: mask) }
      }
    }
    return presses
  }
}

// MARK: press_key's grammar

/// The vendor's modifier names (F §6.4), exact and case-sensitive.
private let modifierNames: [String: CarbonModifiers] = [
  "Shift_L": .shift, "Shift_R": .shift, "shift": .shift,
  "Control_L": .control, "Control_R": .control, "ctrl": .control,
  "Alt_L": .option, "Alt_R": .option, "alt": .option,
  "Meta_L": .command, "Meta_R": .command, "meta": .command, "Super_L": .command, "Super_R": .command, "super": .command,
  "command": .command, "Command": .command, "cmd": .command,
]

/// The vendor's key table (F §6.4, R/sky-behaviour.md §13): fixed ANSI key codes, never the current layout; a name that
/// types a shifted character carries the shift mask. `equal` is corrected to the unshifted key (the vendor's types `+`).
let keyTable: [String: KeyPress] = {
  var table: [String: KeyPress] = [:]
  func add(_ names: [String], _ code: CGKeyCode, _ modifiers: CarbonModifiers = []) {
    for name in names { table[name] = KeyPress(keyCode: code, modifiers: modifiers) }
  }
  add(["BackSpace"], 0x33); add(["Tab"], 0x30); add(["Linefeed", "Return"], 0x24); add(["Clear", "KP_Delete"], 0x47)
  add(["Escape"], 0x35); add(["Delete"], 0x75); add(["space"], 0x31); add(["Help"], 0x72); add(["Menu"], 0x6E)
  add(["Caps_Lock", "Shift_Lock"], 0x39); add(["Home", "Begin"], 0x73); add(["End"], 0x77)
  add(["Left"], 0x7B); add(["Up"], 0x7E); add(["Right"], 0x7C); add(["Down"], 0x7D)
  add(["Prior", "Page_Up"], 0x74); add(["Next", "Page_Down"], 0x79)
  add(["KP_Enter"], 0x4C); add(["KP_Equal"], 0x51); add(["KP_Multiply"], 0x43); add(["KP_Add"], 0x45)
  add(["KP_Subtract"], 0x4E); add(["KP_Decimal"], 0x41); add(["KP_Divide"], 0x4B)
  for (digit, code) in zip(0...9, [0x52, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5B, 0x5C] as [CGKeyCode]) { add(["KP_\(digit)"], code) }
  let functionKeys: [CGKeyCode] = [0x7A, 0x78, 0x63, 0x76, 0x60, 0x61, 0x62, 0x64, 0x65, 0x6D, 0x67, 0x6F, 0x69, 0x6B, 0x71, 0x6A, 0x40, 0x4F, 0x50, 0x5A]
  for (number, code) in zip(1...20, functionKeys) { add(["F\(number)"], code) }
  for (digit, code) in zip(0...9, [0x1D, 0x12, 0x13, 0x14, 0x15, 0x17, 0x16, 0x1A, 0x1C, 0x19] as [CGKeyCode]) { add(["\(digit)"], code) }
  let letters: [Character: CGKeyCode] = [
    "a": 0x00, "b": 0x0B, "c": 0x08, "d": 0x02, "e": 0x0E, "f": 0x03, "g": 0x05, "h": 0x04, "i": 0x22, "j": 0x26,
    "k": 0x28, "l": 0x25, "m": 0x2E, "n": 0x2D, "o": 0x1F, "p": 0x23, "q": 0x0C, "r": 0x0F, "s": 0x01, "t": 0x11,
    "u": 0x20, "v": 0x09, "w": 0x0D, "x": 0x07, "y": 0x10, "z": 0x06,
  ]
  for (letter, code) in letters {
    add([String(letter)], code)
    add([letter.uppercased()], code, .shift)
  }
  add(["apostrophe"], 0x27); add(["comma"], 0x2B); add(["minus"], 0x1B); add(["period"], 0x2F); add(["slash"], 0x2C)
  add(["semicolon"], 0x29); add(["bracketleft"], 0x21); add(["backslash"], 0x2A); add(["bracketright"], 0x1E)
  add(["grave"], 0x32); add(["equal"], 0x18)
  let shifted: [(String, CGKeyCode)] = [
    ("exclam", 0x12), ("at", 0x13), ("numbersign", 0x14), ("dollar", 0x15), ("percent", 0x17), ("asciicircum", 0x16),
    ("ampersand", 0x1A), ("asterisk", 0x1C), ("parenleft", 0x19), ("parenright", 0x1D), ("underscore", 0x1B),
    ("plus", 0x18), ("colon", 0x29), ("quotedbl", 0x27), ("less", 0x2B), ("greater", 0x2F), ("question", 0x2C),
    ("braceleft", 0x21), ("braceright", 0x1E), ("bar", 0x2A), ("asciitilde", 0x32),
  ]
  for (name, code) in shifted { add([name], code, .shift) }
  return table
}()

/// An unknown key name: the token is named when it looks like a key name, never otherwise (a key string is the
/// client's, and the message must not carry arbitrary client text).
func invalidKey(_ token: String) -> EngineError {
  let named = token.count <= 32 && token.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "_") }
  return EngineError(name: "invalidKey", named ? "Unknown key name '\(token)' in the key combination" : "Unknown key name in the key combination")
}

/// press_key's grammar (F §6.3): split on spaces into sequential combinations, each split on `+`; every token matched
/// exactly; a combination's modifiers OR-ed into one press. A combination of modifiers alone is a press without a key;
/// two non-modifier keys in one combination are refused. cua's departure: the vendor drops empty tokens, so `ctrl++`
/// silently presses ctrl alone and the model believes it zoomed; cua refuses an empty token and names `plus`.
func parseKeySequence(_ text: String) throws -> [KeyPress] {
  var presses: [KeyPress] = []
  for combination in text.split(separator: " ") {
    let tokens = combination.split(separator: "+", omittingEmptySubsequences: false).map(String.init)
    guard !tokens.contains(where: \.isEmpty) else {
      throw EngineError(name: "invalidKey", "A key combination has an empty key name; the + key is named 'plus'")
    }
    var modifiers: CarbonModifiers = []
    var keyCode: CGKeyCode?
    for token in tokens {
      if let modifier = modifierNames[token] {
        modifiers.formUnion(modifier)
      } else if let key = keyTable[token] {
        guard keyCode == nil else {
          throw EngineError(name: "invalidKey", "A key combination names one key besides its modifiers")
        }
        keyCode = key.keyCode
        modifiers.formUnion(key.modifiers)
      } else {
        throw invalidKey(token)
      }
    }
    presses.append(KeyPress(keyCode: keyCode, modifiers: modifiers))
  }
  guard !presses.isEmpty else { throw EngineError.invalidArguments("key is required") }
  return presses
}

// MARK: Events as data

/// One event of a key press. `restore` is the flags-changed event that puts back the session's real modifier state,
/// read when it is posted.
struct KeyEvent: Equatable {
  enum Kind: Equatable { case flags, down, up, restore }
  let kind: Kind
  let keyCode: CGKeyCode
  let flags: CGEventFlags
  /// The Unicode string a typed unit's key down and up carry (CGEventKeyboardSetUnicodeString); nil for press_key.
  let text: [UInt16]?
}

/// The vendor's four events of one press (F §6.2): flags-changed with the mask, key down, key up (both with the mask),
/// flags-changed restoring the real modifier state. A press of modifiers alone is its two flags-changed events.
func keyPressEvents(_ press: KeyPress, text: [UInt16]? = nil) -> [KeyEvent] {
  let flags = press.modifiers.eventFlags
  guard let code = press.keyCode else {
    return [KeyEvent(kind: .flags, keyCode: 0, flags: flags, text: nil), KeyEvent(kind: .restore, keyCode: 0, flags: [], text: nil)]
  }
  return [
    KeyEvent(kind: .flags, keyCode: 0, flags: flags, text: nil),
    KeyEvent(kind: .down, keyCode: code, flags: flags, text: text),
    KeyEvent(kind: .up, keyCode: code, flags: flags, text: text),
    KeyEvent(kind: .restore, keyCode: 0, flags: [], text: nil),
  ]
}

/// One unit of typed text: a press the layout keys, with the character it types attached, or (`press` nil) a run of
/// characters the layout cannot key, sent as one Unicode-string press with key code 0. `consumed` is how many UTF-16
/// units of the request it accounts for, so a stopped request can say how much was entered.
struct TypedUnit: Equatable {
  let press: KeyPress?
  let text: [UInt16]
  let consumed: Int

  var events: [KeyEvent] { keyPressEvents(press ?? KeyPress(keyCode: 0, modifiers: []), text: text) }
}

/// The most UTF-16 units one Unicode-string event carries (CGEventKeyboardSetUnicodeString's limit).
let unicodeChunkLimit = 20

/// A text as typed units (the spec's Design, "Text"): a newline is a Return press; a character of one UTF-16 unit the
/// layout keys is that press; everything else (an emoji, CJK, a combining sequence) collects into Unicode-string runs
/// of at most 20 units that never split a character, and a single character longer than that is cut only between
/// its Unicode scalars, so no surrogate pair is ever split.
func typedUnits(_ text: String, press: (UInt16) -> KeyPress?) -> [TypedUnit] {
  var units: [TypedUnit] = []
  var pending: [UInt16] = []
  func flush() {
    if !pending.isEmpty { units.append(TypedUnit(press: nil, text: pending, consumed: pending.count)) }
    pending = []
  }
  for character in text {
    let utf16 = Array(character.utf16)
    if character.unicodeScalars.allSatisfy({ $0 == "\n" || $0 == "\r" }) {
      flush()
      units.append(TypedUnit(press: press(0x0D) ?? KeyPress(keyCode: returnKeyCode, modifiers: []), text: [0x0D], consumed: utf16.count))
    } else if utf16.count == 1, let keyed = press(utf16[0]) {
      flush()
      units.append(TypedUnit(press: keyed, text: utf16, consumed: 1))
    } else if utf16.count > unicodeChunkLimit {
      flush()
      for scalar in character.unicodeScalars {
        let scalarUnits = Array(String(scalar).utf16)
        if pending.count + scalarUnits.count > unicodeChunkLimit { flush() }
        pending.append(contentsOf: scalarUnits)
      }
      flush()
    } else {
      if pending.count + utf16.count > unicodeChunkLimit { flush() }
      pending.append(contentsOf: utf16)
    }
  }
  flush()
  return units
}

// MARK: Posting

/// Where key events go and from which source: to one process (input), or to the HID event tap (the keystroke probe,
/// standing in for a user). The engine's keys come from an HID-system source as the vendor's do (F §6.2); a private
/// source is probe (d)'s alternative.
struct EventPoster {
  let source: CGEventSource?
  let deliver: (CGEvent) -> Void

  static func toProcess(_ pid: pid_t, sourceState: CGEventSourceStateID = .hidSystemState) -> EventPoster {
    EventPoster(source: CGEventSource(stateID: sourceState)) { $0.postToPid(pid) }
  }

  static func toHIDTap() -> EventPoster {
    EventPoster(source: CGEventSource(stateID: .hidSystemState)) { $0.post(tap: .cghidEventTap) }
  }

  /// Makes, stamps and posts one key event; false when it could not be made.
  @discardableResult
  func post(_ spec: KeyEvent) -> Bool {
    let event: CGEvent?
    switch spec.kind {
    case .flags, .restore:
      event = CGEvent(source: source)
      event?.type = .flagsChanged
      event?.flags = spec.kind == .restore ? CGEventSource.flagsState(.combinedSessionState) : spec.flags
    case .down, .up:
      event = CGEvent(keyboardEventSource: source, virtualKey: spec.keyCode, keyDown: spec.kind == .down)
      event?.flags = spec.flags
      if let text = spec.text { event?.keyboardSetUnicodeString(stringLength: text.count, unicodeString: text) }
    }
    guard let event else { return false }
    event.timestamp = DispatchTime.now().uptimeNanoseconds
    deliver(event)
    return true
  }
}
