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
    XCTAssertEqual(plain, KeystrokeRequest(pid: 600, bounds: CGRect(x: 400, y: 20, width: 600, height: 800), at: nil, keyCodesOnly: false, text: "rk"))
    let keyed = try KeystrokeRequest.parse(["--key-codes-only"] + base + ["--at", "1700000000000", "rk"])
    XCTAssertEqual(keyed, KeystrokeRequest(pid: 600, bounds: CGRect(x: 400, y: 20, width: 600, height: 800), at: 1_700_000_000_000, keyCodesOnly: true, text: "rk"))
    XCTAssertEqual(try KeystrokeRequest.parse(base + ["rk", "--key-codes-only"]).keyCodesOnly, true, "the flag may come after the text")
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
    let units = try XCTUnwrap(keystrokeUnits("rk", keyCodesOnly: false, press: latin))
    XCTAssertEqual(units, typedUnits("rk", press: latin).map(\.events), "the default is the typed units' events, unchanged")
    XCTAssertEqual(units.map { $0.filter { $0.kind == .down }.map(\.text) }, [[[0x72]], [[0x6B]]])
  }

  func testKeyCodesOnlyIsTheSamePressesWithNoStringOnAnyEvent() throws {
    let keyed = try XCTUnwrap(keystrokeUnits("rk\n", keyCodesOnly: true, press: latin))
    let typed = try XCTUnwrap(keystrokeUnits("rk\n", keyCodesOnly: false, press: latin))
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
    let units = try XCTUnwrap(keystrokeUnits("rk", keyCodesOnly: true, press: optioned))
    XCTAssertEqual(units.map { $0.first { $0.kind == .down }?.flags }, [.maskAlternate, .maskAlternate])
    XCTAssertTrue(units.joined().allSatisfy { $0.text == nil })
  }

  func testKeyCodesOnlyRefusesACharacterTheLayoutCannotKey() {
    XCTAssertNil(keystrokeUnits("r가", keyCodesOnly: true, press: latin), "가 could only go as a string; nothing is sent")
    XCTAssertNotNil(keystrokeUnits("r가", keyCodesOnly: false, press: latin), "the default sends it as a string run, as today")
  }

  func testThePressesAsTheProbeReportsThem() throws {
    let units = try XCTUnwrap(keystrokeUnits("rk", keyCodesOnly: false, press: latin))
    XCTAssertEqual(pressesWire(units) as NSArray, [["keyCode": 15, "flags": 0, "unicode": "r"], ["keyCode": 40, "flags": 0, "unicode": "k"]] as NSArray)
    let keyed = try XCTUnwrap(keystrokeUnits("rk", keyCodesOnly: true, press: { KeyPress(keyCode: $0 == 0x72 ? 15 : 40, modifiers: .option) }))
    XCTAssertEqual(pressesWire(keyed) as NSArray, [["keyCode": 15, "flags": Int(CGEventFlags.maskAlternate.rawValue), "unicode": NSNull()],
                                                     ["keyCode": 40, "flags": Int(CGEventFlags.maskAlternate.rawValue), "unicode": NSNull()]] as NSArray)
  }
}
