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
      (base + ["--key-codes-only", "--ansi-keys", "rk"], "keystroke takes at most one of --key-codes-only and --ansi-keys"),
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
}
