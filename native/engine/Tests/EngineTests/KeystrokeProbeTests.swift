import CoreGraphics
import Foundation
import XCTest
@testable import Engine

// The probe's `keystroke` command (Interfaces, UserProbe; the Decision Log's "M2b pre-flight" item 1): its arguments and
// the events it posts, with and without `--key-codes-only`. Nothing here posts an event or reads the session's layout:
// the layout is a synthetic press map.

final class KeystrokeProbeTests: XCTestCase {
  private let base = ["--user-pid", "600", "--user-bounds", "400,20,600,800"]

  func testTheArguments() throws {
    let plain = try KeystrokeRequest.parse(base + ["rk"])
    XCTAssertEqual(plain, KeystrokeRequest(pid: 600, bounds: CGRect(x: 400, y: 20, width: 600, height: 800), at: nil, mode: .typed, text: "rk"))
    let keyed = try KeystrokeRequest.parse(["--key-codes-only"] + base + ["--at", "1700000000000", "rk"])
    XCTAssertEqual(keyed, KeystrokeRequest(pid: 600, bounds: CGRect(x: 400, y: 20, width: 600, height: 800), at: 1_700_000_000_000, mode: .keyCodesOnly, text: "rk"))
    XCTAssertEqual(try KeystrokeRequest.parse(base + ["rk", "--key-codes-only"]).mode, .keyCodesOnly, "the flag may come after the text")
    XCTAssertEqual(try KeystrokeRequest.parse(base + ["--ansi-keys", "rk"]).mode, .ansiKeys)
    XCTAssertEqual(try KeystrokeRequest.parse(base + ["\n"]).text, "\n")
  }

  func testMalformedArgumentsAreUsageErrors() {
    let cases: [([String], String)] = [
      (["--user-bounds", "1,2,3,4", "rk"], "keystroke needs --user-pid, --user-bounds and a text"),
      (["--user-pid", "x"] + Array(base.suffix(2)) + ["rk"], "--user-pid needs a number"),
      (["--user-pid", "600", "--user-bounds", "1,2,3", "rk"], "--user-bounds needs x,y,w,h"),
      (base + ["--at"], "--at needs a unix ms number"),
      (base + ["rk", "more"], "keystroke takes one text argument"),
      (base, "keystroke needs --user-pid, --user-bounds and a text"),
      (base + ["--key-codes-only", "--ansi-keys", "rk"], "keystroke takes at most one of --key-codes-only, --ansi-keys and --keys"),
      (base + ["--keys", "--ansi-keys", "r"], "keystroke takes at most one of --key-codes-only, --ansi-keys and --keys"),
      (base + ["--keys"], "keystroke needs --user-pid, --user-bounds and a text"),
    ]
    for (arguments, message) in cases {
      XCTAssertThrowsError(try KeystrokeRequest.parse(arguments), "\(arguments)") { error in
        XCTAssertEqual(error as? ProbeUsage, ProbeUsage(message: message), "\(arguments)")
      }
    }
  }

  // A Latin layout: r and k unmodified, Return its own key.
  private let latin: (UInt16) -> KeyPress? = { unit in
    [UInt16(0x72): KeyPress(keyCode: 15, modifiers: []), 0x6B: KeyPress(keyCode: 40, modifiers: []),
     0x0D: KeyPress(keyCode: returnKeyCode, modifiers: [])][unit]
  }

  func testTheDefaultCarriesEachCharactersStringAsToday() throws {
    let units = try XCTUnwrap(keystrokeUnits("rk", mode: .typed, press: latin))
    XCTAssertEqual(units, typedUnits("rk", press: latin).map(\.events), "the default is the typed units' events, unchanged")
    XCTAssertEqual(units.map { $0.filter { $0.kind == .down }.map(\.text) }, [[[0x72]], [[0x6B]]])
  }

  func testKeyCodesOnlyIsTheSamePressesWithNoStringOnAnyEvent() throws {
    let keyed = try XCTUnwrap(keystrokeUnits("rk\n", mode: .keyCodesOnly, press: latin))
    let typed = try XCTUnwrap(keystrokeUnits("rk\n", mode: .typed, press: latin))
    XCTAssertTrue(keyed.joined().allSatisfy { $0.text == nil }, "no CGEventKeyboardSetUnicodeString on any event")
    let shape = { (units: [[KeyEvent]]) in units.map { $0.map { [Int($0.keyCode), Int($0.flags.rawValue)] + [$0.kind == .down ? 1 : $0.kind == .up ? 2 : 0] } } }
    XCTAssertEqual(shape(keyed), shape(typed), "the same key codes, flags and event kinds as the default")
    XCTAssertEqual(keyed.map { $0.first { $0.kind == .down }?.keyCode }, [15, 40, returnKeyCode])
  }

  func testKeyCodesOnlyKeepsTheLayoutsModifiers() throws {
    // A layout whose r and k sit under Option (as the 2-Set Hangul layout's do): the press keeps the mask.
    let optioned: (UInt16) -> KeyPress? = { unit in
      [UInt16(0x72): KeyPress(keyCode: 15, modifiers: .option), 0x6B: KeyPress(keyCode: 40, modifiers: .option)][unit]
    }
    let units = try XCTUnwrap(keystrokeUnits("rk", mode: .keyCodesOnly, press: optioned))
    XCTAssertEqual(units.map { $0.first { $0.kind == .down }?.flags }, [.maskAlternate, .maskAlternate])
    XCTAssertTrue(units.joined().allSatisfy { $0.text == nil })
  }

  func testKeyCodesOnlyRefusesACharacterTheLayoutCannotKey() {
    XCTAssertNil(keystrokeUnits("r가", mode: .keyCodesOnly, press: latin), "가 could only go as a string; nothing is sent")
    XCTAssertNotNil(keystrokeUnits("r가", mode: .typed, press: latin), "the default sends it as a string run, as today")
  }

  func testThePressesAsTheProbeReportsThem() throws {
    let units = try XCTUnwrap(keystrokeUnits("rk", mode: .typed, press: latin))
    XCTAssertEqual(pressesWire(units) as NSArray, [["keyCode": 15, "flags": 0, "unicode": "r"], ["keyCode": 40, "flags": 0, "unicode": "k"]] as NSArray)
    let keyed = try XCTUnwrap(keystrokeUnits("rk", mode: .keyCodesOnly, press: { KeyPress(keyCode: $0 == 0x72 ? 15 : 40, modifiers: .option) }))
    XCTAssertEqual(pressesWire(keyed) as NSArray, [["keyCode": 15, "flags": Int(CGEventFlags.maskAlternate.rawValue), "unicode": NSNull()],
                                                     ["keyCode": 40, "flags": Int(CGEventFlags.maskAlternate.rawValue), "unicode": NSNull()]] as NSArray)
  }
  // A layout under which r and k sit under Option and nothing else keys: the fixed codes never consult it.
  private let hangul: (UInt16) -> KeyPress? = { unit in
    [UInt16(0x72): KeyPress(keyCode: 15, modifiers: .option), 0x6B: KeyPress(keyCode: 40, modifiers: .option)][unit]
  }

  func testAnsiKeysAreTheVendorsFixedCodesWithNoFlagsAndNoString() throws {
    let units = try XCTUnwrap(keystrokeUnits("rk\n", mode: .ansiKeys, press: hangul))
    XCTAssertEqual(units.map { $0.first { $0.kind == .down }?.keyCode }, [0x0F, 0x28, returnKeyCode], "press_key's table: r, k, Return")
    XCTAssertEqual(units.map { $0.first { $0.kind == .down }?.keyCode }, ["r", "k", "Return"].map { keyTable[$0]?.keyCode })
    XCTAssertTrue(units.joined().allSatisfy { $0.text == nil }, "no string on any event")
    XCTAssertTrue(units.joined().filter { $0.kind != .restore }.allSatisfy { $0.flags.isEmpty }, "no modifier flag on any event")
    XCTAssertEqual(units.map(\.count), [4, 4, 4], "the vendor's four events per press")
  }

  func testAnsiKeysRefuseACharacterOutsideTheTableOrUnderAModifier() {
    XCTAssertNil(keystrokeUnits("r가", mode: .ansiKeys, press: latin), "가 has no fixed key")
    XCTAssertNil(keystrokeUnits("R", mode: .ansiKeys, press: latin), "R is r under Shift: a modifier flag")
    XCTAssertNil(keystrokeUnits("r k", mode: .ansiKeys, press: latin), "a space is named, not keyed by its character")
    XCTAssertNotNil(keystrokeUnits("09az", mode: .ansiKeys, press: { _ in nil }), "digits and lower-case letters need no layout")
  }

  // MARK: Key specs (`--keys`, MAWS P4-B2's L6/L7)

  func testTheKeysArgumentsArePressKeysKeyStringOneSpecPerArgument() throws {
    let keys = try KeystrokeRequest.parse(base + ["--keys", "r", "k", "BackSpace", "k"])
    XCTAssertEqual(keys, KeystrokeRequest(pid: 600, bounds: CGRect(x: 400, y: 20, width: 600, height: 800), at: nil, mode: .keySpecs, text: "r k BackSpace k"))
    XCTAssertEqual(try KeystrokeRequest.parse(["r", "--keys"] + base + ["alt+Return"]).text, "r alt+Return", "flags in any order")
  }

  func testKeySpecsArePressKeysGrammarAndTable() throws {
    let units = try keySpecUnits("r k BackSpace k")
    XCTAssertEqual(units.count, 4, "one unit per spec")
    XCTAssertEqual(units.map { $0.first { $0.kind == .down }?.keyCode }, [0x0F, 0x28, 0x33, 0x28])
    XCTAssertEqual(try keySpecUnits("r k").map { $0.first { $0.kind == .down }?.keyCode }, ["r", "k"].map { keyTable[$0]?.keyCode },
                   "letters are press_key's fixed ANSI codes, as --ansi-keys keys them")
    let named: [(String, CGKeyCode)] = [("BackSpace", 0x33), ("Left", 0x7B), ("Right", 0x7C), ("Return", 0x24), ("Escape", 0x35)]
    for (name, code) in named {
      let unit = try XCTUnwrap(try keySpecUnits(name).first, name)
      XCTAssertEqual(unit.first { $0.kind == .down }?.keyCode, code, name)
      XCTAssertEqual(unit.first { $0.kind == .down }?.flags, [], name)
    }
    let chord = try XCTUnwrap(try keySpecUnits("alt+Return").first)
    XCTAssertEqual(chord.first { $0.kind == .down }?.keyCode, 0x24)
    XCTAssertEqual(chord.first { $0.kind == .down }?.flags, alt, "option+Return, spelled in press_key's modifier names")
  }

  func testAnUnknownOrUnparseableSpecRefuses() {
    for spec in ["r Bogus", "option+Return", "ctrl++", "a+b"] {
      XCTAssertThrowsError(try keySpecUnits(spec), spec) { error in
        XCTAssertEqual((error as? EngineError)?.errorName, "invalidKey", spec)
      }
    }
  }

  func testAPlainLetterOrNamedKeyIsItsKeyDownAndUpAlone() throws {
    for (spec, code) in [("r", CGKeyCode(0x0F)), ("BackSpace", 0x33)] {
      let events = try XCTUnwrap(try keySpecUnits(spec).first, spec)
      XCTAssertEqual(events, [KeyEvent(kind: .down, keyCode: code, flags: [], text: nil), KeyEvent(kind: .up, keyCode: code, flags: [], text: nil)],
                     "a keyboard sends no flags-changed event without a modifier")
    }
  }

  // A keyboard's flags: each modifier's generic mask with its left-hand device bit (NX_DEVICEL…KEYMASK).
  private let alt = CGEventFlags(rawValue: 0x80000 | 0x20), ctl = CGEventFlags(rawValue: 0x40000 | 0x01)
  private let shf = CGEventFlags(rawValue: 0x20000 | 0x02)

  func testAChordPostsAsAKeyboardDoes() throws {
    let option = CGKeyCode(0x3A)
    XCTAssertEqual(alt.rawValue, 0x80020)
    XCTAssertEqual(try keySpecUnits("alt+Return").first, [
      KeyEvent(kind: .flags, keyCode: option, flags: alt, text: nil),
      KeyEvent(kind: .down, keyCode: returnKeyCode, flags: alt, text: nil),
      KeyEvent(kind: .up, keyCode: returnKeyCode, flags: alt, text: nil),
      KeyEvent(kind: .flags, keyCode: option, flags: [], text: nil),
    ])
    let control = CGKeyCode(0x3B), shift = CGKeyCode(0x38)
    XCTAssertEqual(try keySpecUnits("ctrl+shift+Tab").first, [
      KeyEvent(kind: .flags, keyCode: control, flags: ctl, text: nil),
      KeyEvent(kind: .flags, keyCode: shift, flags: ctl.union(shf), text: nil),
      KeyEvent(kind: .down, keyCode: 0x30, flags: ctl.union(shf), text: nil),
      KeyEvent(kind: .up, keyCode: 0x30, flags: ctl.union(shf), text: nil),
      KeyEvent(kind: .flags, keyCode: shift, flags: ctl, text: nil),
      KeyEvent(kind: .flags, keyCode: control, flags: [], text: nil),
    ], "each modifier goes down in turn and comes up in reverse, every event carrying the flags then held")
    XCTAssertEqual(try keySpecUnits("R").first?.map(\.keyCode), [shift, 0x0F, 0x0F, shift], "an upper-case letter is r under Shift")
    XCTAssertEqual(try keySpecUnits("shift").first, [KeyEvent(kind: .flags, keyCode: shift, flags: shf, text: nil),
                                                      KeyEvent(kind: .flags, keyCode: shift, flags: [], text: nil)])
    XCTAssertTrue(try keySpecUnits("r BackSpace alt+Return ctrl+shift+Tab").joined().allSatisfy { $0.text == nil }, "no string on any event")
    XCTAssertFalse(try keySpecUnits("alt+Return").joined().contains { $0.kind == .restore }, "every flag is explicit, none read back")
  }

  func testTheMadeEventsAreAKeyboardsTypesAndKeyCodes() throws {
    let poster = EventPoster(source: nil) { _ in }
    let events = try XCTUnwrap(try keySpecUnits("alt+Return").first).map { try XCTUnwrap(poster.event($0)) }
    XCTAssertEqual(events.map(\.type), [.flagsChanged, .keyDown, .keyUp, .flagsChanged])
    XCTAssertEqual(events.map { $0.getIntegerValueField(.keyboardEventKeycode) }, [0x3A, 0x24, 0x24, 0x3A])
    XCTAssertEqual(events.map(\.flags).map { $0.intersection([.maskAlternate, .maskShift, .maskControl, .maskCommand, CGEventFlags(rawValue: 0x2B)]) },
                   [alt, alt, alt, []])
    let pressKeys = try XCTUnwrap(poster.event(KeyEvent(kind: .flags, keyCode: 0, flags: .maskCommand, text: nil)))
    XCTAssertEqual(pressKeys.getIntegerValueField(.keyboardEventKeycode), 0, "press_key's combined flags event keeps key code 0")
  }

  func testTheKeysReportSeparatesTheFlagsChangedEvents() throws {
    let units = try keySpecUnits("r alt+Return")
    XCTAssertEqual(pressesWire(units) as NSArray, [["keyCode": 0x0F, "flags": 0, "unicode": NSNull()],
                                                   ["keyCode": 0x24, "flags": 0x80020, "unicode": NSNull()]] as NSArray)
    XCTAssertEqual(flagsChangedWire(units) as NSArray, [[], [["keyCode": 0x3A, "flags": 0x80020],
                                                             ["keyCode": 0x3A, "flags": 0]]] as NSArray)
  }

  func testPressKeysEventsKeepTheGenericFlagsAlone() throws {
    // press_key's own events are untouched by the probe's device bits: the generic mask only, read back from the made
    // events too.
    let press = try XCTUnwrap(try parseKeySequence("alt+Return").first)
    let events = keyPressEvents(press)
    XCTAssertEqual(events, [
      KeyEvent(kind: .flags, keyCode: 0, flags: .maskAlternate, text: nil),
      KeyEvent(kind: .down, keyCode: returnKeyCode, flags: .maskAlternate, text: nil),
      KeyEvent(kind: .up, keyCode: returnKeyCode, flags: .maskAlternate, text: nil),
      KeyEvent(kind: .restore, keyCode: 0, flags: [], text: nil),
    ])
    let poster = EventPoster(source: nil) { _ in }
    let made = try events.prefix(3).map { try XCTUnwrap(poster.event($0)) }
    XCTAssertEqual(made.map { $0.flags.rawValue & 0xFF }, [0, 0, 0], "no device bit on press_key's events")
    XCTAssertEqual(made.map { $0.flags.contains(.maskAlternate) }, [true, true, true])
  }
}
