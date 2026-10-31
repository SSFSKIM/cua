import AppKit
import Carbon
import CoreGraphics
import Foundation
import XCTest
@testable import Engine

// The input half's pure logic (the spec's Design, "Keys", "Text" and "User intervention"; R/F-helper-logic.md §5–6, §9;
// R/sky-behaviour.md §11, §13–14, §18): the vendor's exact key table and grammar, the four-event sequence, the typed
// units' chunking, the US layout's reverse map, the mouse-event plan, the tap's pinned fields and route 3's sequencing
// through its seam. Nothing here posts.

// MARK: press_key's grammar and table

final class KeySequenceTests: XCTestCase {
  func testTheVendorsExactNamesAreAccepted() throws {
    for (name, code) in [("BackSpace", 0x33), ("Tab", 0x30), ("Linefeed", 0x24), ("Return", 0x24), ("Clear", 0x47),
                         ("Escape", 0x35), ("Delete", 0x75), ("space", 0x31), ("Help", 0x72), ("Menu", 0x6E),
                         ("Caps_Lock", 0x39), ("Shift_Lock", 0x39), ("Home", 0x73), ("Begin", 0x73), ("End", 0x77),
                         ("Left", 0x7B), ("Up", 0x7E), ("Right", 0x7C), ("Down", 0x7D), ("Prior", 0x74), ("Page_Up", 0x74),
                         ("Next", 0x79), ("Page_Down", 0x79), ("KP_Enter", 0x4C), ("KP_Equal", 0x51), ("KP_Multiply", 0x43),
                         ("KP_Add", 0x45), ("KP_Subtract", 0x4E), ("KP_Decimal", 0x41), ("KP_Divide", 0x4B), ("KP_0", 0x52),
                         ("KP_9", 0x5C), ("F1", 0x7A), ("F20", 0x5A), ("grave", 0x32), ("equal", 0x18)] {
      XCTAssertEqual(try parseKeySequence(name).single, KeyPress(keyCode: kx(code), modifiers: []), name)
    }
    for (name, code) in [("a", 0x00), ("q", 0x0C), ("z", 0x06), ("0", 0x1D), ("9", 0x19), ("apostrophe", 0x27), ("minus", 0x1B)] {
      XCTAssertEqual(try parseKeySequence(name).single, KeyPress(keyCode: kx(code), modifiers: []), name)
    }
    for (name, code) in [("A", 0x00), ("exclam", 0x12), ("at", 0x13), ("numbersign", 0x14), ("dollar", 0x15), ("percent", 0x17),
                         ("asciicircum", 0x16), ("ampersand", 0x1A), ("asterisk", 0x1C), ("parenleft", 0x19), ("parenright", 0x1D),
                         ("underscore", 0x1B), ("plus", 0x18), ("colon", 0x29), ("quotedbl", 0x27), ("less", 0x2B), ("greater", 0x2F),
                         ("question", 0x2C), ("braceleft", 0x21), ("braceright", 0x1E), ("bar", 0x2A), ("asciitilde", 0x32)] {
      XCTAssertEqual(try parseKeySequence(name).single, KeyPress(keyCode: kx(code), modifiers: .shift), name)
    }
  }

  func testTheVendorsModifierNamesAreAcceptedAndTheAliasesTheDocumentationClaimsDoNotExistAreRejected() throws {
    for name in ["shift", "Shift_L", "Shift_R"] { XCTAssertEqual(try parseKeySequence(name).single?.modifiers, .shift, name) }
    for name in ["ctrl", "Control_L", "Control_R"] { XCTAssertEqual(try parseKeySequence(name).single?.modifiers, .control, name) }
    for name in ["alt", "Alt_L", "Alt_R"] { XCTAssertEqual(try parseKeySequence(name).single?.modifiers, .option, name) }
    for name in ["super", "cmd", "command", "Command", "meta", "Meta_L", "Meta_R", "Super_L", "Super_R"] {
      XCTAssertEqual(try parseKeySequence(name).single?.modifiers, .command, name)
    }
    // The vendor's documentation lists aliases; its code has none of them (F §6.4).
    for name in ["Control", "Ctrl", "Alt", "Shift", "Enter", "Esc", "PageUp", "Option", "return", "COMMAND", "kp_0", "f1", "left"] {
      XCTAssertThrowsError(try parseKeySequence(name)) { error in
        XCTAssertEqual((error as? EngineError)?.errorName, "invalidKey", name)
      }
    }
  }

  func testUnsupportedNamesThrow() {
    for name in ["Pause", "Scroll_Lock", "Sys_Req", "Num_Lock", "Hyper_L", "KP_Space", "KP_F1", "Insert", "Undo"] {
      XCTAssertThrowsError(try parseKeySequence(name)) { error in
        XCTAssertEqual((error as? EngineError)?.errorName, "invalidKey", name)
      }
    }
  }

  func testCombosAndSequences() throws {
    let chord = try parseKeySequence("super+n")
    XCTAssertEqual(chord.single, KeyPress(keyCode: kx(0x2D), modifiers: .command))
    let layered = try parseKeySequence("ctrl+shift+Tab")
    XCTAssertEqual(layered.single, KeyPress(keyCode: kx(0x30), modifiers: [.control, .shift]))
    let sequence = try parseKeySequence("super+n super+m")
    XCTAssertEqual(sequence.count, 2)
    // A combination of modifiers alone is a press without a key; two non-modifier keys are refused.
    XCTAssertEqual(try parseKeySequence("ctrl").single?.keyCode, nil)
    XCTAssertThrowsError(try parseKeySequence("a+b")) { error in XCTAssertEqual((error as? EngineError)?.errorName, "invalidKey") }
    // cua's departure: the vendor drops empty tokens, so `ctrl++` silently presses ctrl alone; cua refuses and names plus.
    XCTAssertThrowsError(try parseKeySequence("ctrl++")) { error in
      XCTAssertEqual((error as? EngineError)?.message, "A key combination has an empty key name; the + key is named 'plus'")
    }
    XCTAssertThrowsError(try parseKeySequence(" ")) { error in XCTAssertEqual((error as? EngineError)?.errorName, "invalidArguments") }
  }

  func testEqualIsCorrectedToTheUnshiftedKey() throws {
    // The vendor's table maps equal to shift+0x18, which types `+` (F §6.4, a vendor defect cua does not copy).
    XCTAssertEqual(try parseKeySequence("equal").single, KeyPress(keyCode: kx(0x18), modifiers: []))
    XCTAssertEqual(try parseKeySequence("plus").single, KeyPress(keyCode: kx(0x18), modifiers: .shift))
  }
}

// MARK: The events of a press

final class KeyPressEventTests: XCTestCase {
  func testOnePressIsTheVendorsFourEvents() {
    let events = keyPressEvents(KeyPress(keyCode: kx(0x2D), modifiers: .command), text: [0x6E])
    XCTAssertEqual(events.map(\.kind), [.flags, .down, .up, .restore])
    XCTAssertEqual(events[0].flags, .maskCommand)
    XCTAssertEqual(events[1].keyCode, 0x2D)
    XCTAssertEqual(events[1].flags, .maskCommand)
    XCTAssertEqual(events[1].text, [0x6E])
    XCTAssertEqual(events[2].keyCode, 0x2D)
    XCTAssertEqual(events[2].text, [0x6E])
    XCTAssertEqual(events[3].flags, [])
    XCTAssertEqual(events[3].text, nil)
  }

  func testAModifiersOnlyPressIsItsTwoFlagsEvents() {
    let events = keyPressEvents(KeyPress(keyCode: nil, modifiers: .shift))
    XCTAssertEqual(events.map(\.kind), [.flags, .restore])
    XCTAssertEqual(events[0].flags, .maskShift)
  }

  func testATypedUnitsEventsCarryTheCharacter() {
    let unit = TypedUnit(press: KeyPress(keyCode: kx(0x00), modifiers: .shift), text: [0x41], consumed: 1)
    XCTAssertEqual(unit.events.map(\.kind), [.flags, .down, .up, .restore])
    XCTAssertEqual(unit.events[1].text, [0x41])
    let unkeyable = TypedUnit(press: nil, text: [0xD55C], consumed: 1)
    XCTAssertEqual(unkeyable.events.map(\.kind), [.flags, .down, .up, .restore])
    XCTAssertEqual(unkeyable.events[1].keyCode, 0)
    XCTAssertEqual(unkeyable.events[1].text, [0xD55C])
  }
}

// MARK: typed_units

final class TypedUnitsTests: XCTestCase {
  private func keyed(_ text: String) -> [TypedUnit] {
    typedUnits(text, press: { unit in unit == 0x0D ? KeyPress(keyCode: returnKeyCode, modifiers: []) : KeyPress(keyCode: kx(1), modifiers: []) })
  }
  private func unkeyable(_ text: String) -> [TypedUnit] { typedUnits(text, press: { _ in nil }) }

  func testASCIITypesAsOneKeyedUnitPerCharacter() {
    XCTAssertEqual(keyed("abc").count, 3)
    XCTAssertEqual(keyed("abc").map(\.consumed), [1, 1, 1])
    XCTAssertTrue(keyed("a").allSatisfy { $0.press != nil })
  }

  func testNewlinesAreReturnPresses() {
    let units = keyed("a\nb")
    XCTAssertEqual(units.count, 3)
    XCTAssertEqual(units[1].press?.keyCode, returnKeyCode)
    XCTAssertEqual(units[1].consumed, 1)
    // \r\n is one grapheme and one unit, accounting for both UTF-16 units.
    let crlf = keyed("a\r\nb")
    XCTAssertEqual(crlf.count, 3)
    XCTAssertEqual(crlf[1].consumed, 2)
    XCTAssertEqual(crlf[1].press?.keyCode, returnKeyCode)
  }

  func testUnkeyableCharactersCollectIntoUnicodeRuns() {
    let korean = unkeyable("한글")
    XCTAssertEqual(korean.count, 1)
    XCTAssertEqual(korean[0].press, nil)
    XCTAssertEqual(korean[0].text, Array("한글".utf16))
    XCTAssertEqual(korean[0].consumed, 2)
  }

  func testASurrogatePairIsNeverSplit() {
    let emoji = unkeyable("😀")
    XCTAssertEqual(emoji.count, 1)
    XCTAssertEqual(emoji[0].text, Array("😀".utf16))
    XCTAssertEqual(emoji[0].consumed, 2)
    // 11 emoji are 22 UTF-16 units: two chunks, 20 then 2, each whole pairs.
    let chunked = unkeyable("😀😀😀😀😀😀😀😀😀😀😀")
    XCTAssertEqual(chunked.map(\.consumed), [20, 2])
    for unit in chunked {
      XCTAssertEqual(unit.text.count % 2, 0)
      for (index, unit16) in unit.text.enumerated() where UTF16.isTrailSurrogate(unit16) {
        XCTAssertEqual(index % 2, 1, "a trail surrogate is always the second half of its pair")
      }
    }
  }

  func testACombiningSequenceStaysWhole() {
    // e plus its combining mark is one grapheme, two UTF-16 units: one unit carrying both, never split between them.
    let combining = unkeyable("e\u{301}")
    XCTAssertEqual(combining.count, 1)
    XCTAssertEqual(combining[0].text, Array("e\u{301}".utf16))
    XCTAssertEqual(combining[0].consumed, 2)
    XCTAssertEqual(combining[0].press, nil)
    let mixed = typedUnits("e\u{301}", press: { unit in unit == 0x65 ? KeyPress(keyCode: kx(14), modifiers: []) : nil })
    XCTAssertEqual(mixed.count, 1, "a keyable base does not split the grapheme it begins")
    XCTAssertEqual(mixed[0].press, nil)
    XCTAssertEqual(mixed[0].text, Array("e\u{301}".utf16))
  }

  func testMixedTextBatchesUnkeyableRunsTogether() {
    // The fake layout keys ASCII only; the Korean syllables (single BMP units) are unkeyable and batch.
    let units = typedUnits("a한b글c", press: { unit in unit < 0x80 ? KeyPress(keyCode: kx(1), modifiers: []) : nil })
    XCTAssertEqual(units.map(\.consumed), [1, 1, 1, 1, 1])
    XCTAssertEqual(units.map { $0.press == nil }, [false, true, false, true, false])
    XCTAssertEqual(units[1].text, Array("한".utf16))
    XCTAssertEqual(units[3].text, Array("글".utf16))
    // A long run of unkeyable text between keyable characters still chunks at the limit without splitting a character.
    let long = typedUnits("a" + String(repeating: "한", count: 25) + "b", press: { unit in unit == 0x61 || unit == 0x62 ? KeyPress(keyCode: kx(1), modifiers: []) : nil })
    XCTAssertEqual(long.map(\.consumed), [1, 20, 5, 1])
  }
}

// MARK: The US layout's reverse map

final class KeyLayoutTests: XCTestCase {
  func testTheReverseMapPrefersTheEarlierMaskAndIgnoresMultiUnitText() {
    // A synthetic translator: code 5 under no modifier and code 9 under shift both display "z"; the mask-0 press wins,
    // and a key displaying two units is not a match.
    var calls: [UInt32] = []
    let map = KeyLayout.reverseMap { code, mask in
      if code == 5 && mask == [] { calls.append(0); return Array("z".utf16) }
      if code == 9 && mask == .shift { return Array("z".utf16) }
      if code == 7 && mask == [] { return Array("ab".utf16) }
      return []
    }
    XCTAssertEqual(map[Array("z".utf16)[0]], KeyPress(keyCode: kx(5), modifiers: []))
    XCTAssertNil(map[Array("a".utf16)[0]], "a two-unit display is not a match for either of its units")
    XCTAssertEqual(reverseMapMasks, [0, 0x200, 0x800, 0xA00, 0x1000, 0x1200, 0x1800, 0x1A00].map(CarbonModifiers.init(rawValue:)))
    XCTAssertEqual(calls.count, 1, "the search stops at the first exact match")
  }

  func testTheUSLayout() throws {
    guard let us = KeyLayout.named("com.apple.keylayout.US") else { throw XCTSkip("the US layout is not installed") }
    XCTAssertEqual(us.press(for: Array("a".utf16)[0]), KeyPress(keyCode: kx(0x00), modifiers: []))
    XCTAssertEqual(us.press(for: Array("A".utf16)[0]), KeyPress(keyCode: kx(0x00), modifiers: .shift))
    XCTAssertEqual(us.press(for: Array("!".utf16)[0]), KeyPress(keyCode: kx(0x12), modifiers: .shift))
    XCTAssertEqual(us.press(for: Array("\n".utf16)[0])?.keyCode, 0x24, "a newline is looked up as a carriage return")
    // Vendor parity with the keypad left in: `*` and `+` key from the keypad (mask 0 comes before shift+8 and shift+=).
    XCTAssertEqual(us.press(for: Array("*".utf16)[0])?.keyCode, 0x43)
    XCTAssertEqual(us.press(for: Array("+".utf16)[0])?.keyCode, 0x45)
  }
}

// MARK: The mouse-event plan

final class MousePlanTests: XCTestCase {
  func testTheFacadeMouseButtonsParse() {
    XCTAssertEqual(MouseButton(wire: nil), .left)
    for (wire, button) in [("left", MouseButton.left), ("l", .left), ("0", .left), ("right", .right), ("r", .right), ("1", .right),
                           ("middle", .middle), ("m", .middle), ("2", .middle)] {
      XCTAssertEqual(MouseButton(wire: wire), button, wire)
      if let number = Int(wire) { XCTAssertEqual(MouseButton(wire: NSNumber(value: number)), button, wire) }
    }
    for bad in ["sideways", 3, -1, true] as [Any] { XCTAssertNil(MouseButton(wire: bad), "\(bad)") }
  }

  func testNClicksAreDownThenUpWithCountI() {
    XCTAssertEqual(clickEventPlan(.left, count: 1).map(\.type), [.leftMouseDown, .leftMouseUp])
    XCTAssertEqual(clickEventPlan(.left, count: 1).map(\.clickCount), [1, 1])
    XCTAssertEqual(clickEventPlan(.right, count: 3).map(\.clickCount), [1, 1, 2, 2, 3, 3])
    XCTAssertEqual(clickEventPlan(.middle, count: 2).map(\.type),
                   [.otherMouseDown, .otherMouseUp, .otherMouseDown, .otherMouseUp])
  }
}

// MARK: The review round's pins

/// The spike-only route override parses the string the harness sends and the number the protocol tests send (review
/// round 1, P1: every forced-route cell failed while only numbers parsed).
final class SpikeRouteArgTests: XCTestCase {
  func testBothSpellingsParse() throws {
    XCTAssertEqual(try spikeRouteArg(["spikeRoute": "2"], usable: InputRoute.synthesized), .commandPost)
    XCTAssertEqual(try spikeRouteArg(["spikeRoute": "3"], usable: InputRoute.synthesized), .activation)
    XCTAssertEqual(try spikeRouteArg(["spikeRoute": NSNumber(value: 2)], usable: InputRoute.synthesized), .commandPost)
    XCTAssertNil(try spikeRouteArg([:], usable: InputRoute.elementClick))
  }

  func testAnythingElseIsAnArgumentError() {
    for bad in ["9", "0", "two", "", NSNumber(value: 4), NSNumber(value: true)] as [Any] {
      XCTAssertThrowsError(try spikeRouteArg(["spikeRoute": bad], usable: InputRoute.elementClick)) { error in
        XCTAssertEqual((error as? EngineError)?.errorName, "invalidArguments", "\(bad)")
      }
    }
    XCTAssertThrowsError(try spikeRouteArg(["spikeRoute": "1"], usable: InputRoute.synthesized)) { error in
      XCTAssertTrue((error as? EngineError)?.message.contains("cannot carry this action") == true)
    }
  }
}

/// The keystroke probe's front window: the list's first layer-0 entry, not the list's head, which on a real session is
/// the Window Server's overlay windows (review round 1, P1: the probe never found any named window).
final class FrontWindowTests: XCTestCase {
  private let layer = { (n: Int) in [kCGWindowLayer as String: NSNumber(value: n)] }

  func testTheFirstLayer0WindowWinsOverTheListHead() {
    let overlay = [kCGWindowLayer as String: NSNumber(value: 25), kCGWindowOwnerPID as String: NSNumber(value: 501)]
    let document = [kCGWindowLayer as String: NSNumber(value: 0), kCGWindowOwnerPID as String: NSNumber(value: 502),
                    kCGWindowBounds as String: ["X": 10, "Y": 20, "Width": 300, "Height": 400] as NSDictionary]
    let second = [kCGWindowLayer as String: NSNumber(value: 0), kCGWindowOwnerPID as String: NSNumber(value: 503)]
    XCTAssertEqual(Probe.frontLayer0Window([overlay, overlay, document, second]).map { $0[kCGWindowOwnerPID as String] as? Int },
                   502)
    XCTAssertNil(Probe.frontLayer0Window([overlay, overlay]), "no layer-0 window: no front window")
    XCTAssertTrue(Probe.matchesFront(document, pid: 502, bounds: CGRect(x: 10, y: 20, width: 300, height: 400)))
    XCTAssertFalse(Probe.matchesFront(document, pid: 503, bounds: CGRect(x: 10, y: 20, width: 300, height: 400)), "the owner decides")
    XCTAssertFalse(Probe.matchesFront(document, pid: 502, bounds: CGRect(x: 40, y: 20, width: 300, height: 400)), "the bounds decide")
  }

  /// The agent cursor's panel (#235) is a display-wide layer-0 window of the engine, ordered above the window it acts in:
  /// the gate skips the engine's own windows, which never take a key, and finds the window beneath.
  func testTheEnginesOwnCursorWindowIsSkipped() {
    let cursor = [kCGWindowLayer as String: NSNumber(value: 0), kCGWindowOwnerPID as String: NSNumber(value: 700),
                  kCGWindowBounds as String: ["X": 0, "Y": 0, "Width": 1512, "Height": 982] as NSDictionary]
    let document = [kCGWindowLayer as String: NSNumber(value: 0), kCGWindowOwnerPID as String: NSNumber(value: 502)]
    let engine: (pid_t) -> Bool = { $0 == 700 }
    XCTAssertEqual(Probe.frontLayer0Window([cursor, cursor, document], skipping: engine).map { $0[kCGWindowOwnerPID as String] as? Int }, 502)
    XCTAssertEqual(Probe.frontLayer0Window([cursor, document]).map { $0[kCGWindowOwnerPID as String] as? Int }, 700, "nothing skipped unless asked")
    XCTAssertNil(Probe.frontLayer0Window([cursor], skipping: engine))
  }

  func testTheEnginesProcessesAreThoseRunningFromItsBundle() {
    let paths: [pid_t: String] = [700: "/A/cua Engine.app/Contents/MacOS/cua-engine", 701: "/A/cua Engine.app.old/Contents/MacOS/cua-engine",
                                  702: "/Applications/TextEdit.app/Contents/MacOS/TextEdit"]
    let runs = Probe.runsFrom(bundle: "/A/cua Engine.app", path: { paths[$0] })
    XCTAssertTrue(runs(700))
    XCTAssertFalse(runs(701), "a sibling directory is not the bundle")
    XCTAssertFalse(runs(702))
    XCTAssertFalse(runs(703), "an owner whose path does not resolve is not the engine")
    let own = Probe.executablePath(getpid())
    XCTAssertEqual(own.map { FileManager.default.isExecutableFile(atPath: $0) }, true, "the live reading resolves this process")
    XCTAssertNil(Probe.executablePath(-1))
  }
}

/// Route 3's sequencing through its seam (review round 3's follow-up to round 2's P1): the posts, the screen-update hold
/// and the user's re-activation are recorded instead of made. The window is the application handle of a pid above
/// PID_MAX (99999), which no process can hold, and no window frame or number is given, so the guard's window-order branch
/// and the activation click are not taken; the guard's rules on a fake clock are RouteTests.swift's.
final class FakeActivationTests: XCTestCase {
  /// The real key-focus read, with a window-server connection as the engine always has (the mini sitting's crash: the
  /// call was declared with one argument and faulted in SkyLight's SLPSGetKeyFocusProcess on every typeText).
  @MainActor
  func testTheRealKeyFocusReadAnswersFromAnyThread() {
    _ = NSApplication.shared
    let main = ActivationSystem().keyFocus()
    let background = Box<pid_t?>()
    let done = expectation(description: "background read")
    Thread {
      background.value = .some(ActivationSystem().keyFocus())
      done.fulfill()
    }.start()
    wait(for: [done], timeout: 5)
    XCTAssertEqual(background.value, .some(main), "the read answers the same from a connection's thread as from the main one")
  }

  private let target: pid_t = 990_001, user: pid_t = 990_002, other: pid_t = 990_003

  private func activation(_ seam: SeamStub) -> FakeActivation {
    FakeActivation(pid: target, window: AXUIElementCreateApplication(target), windowFrame: nil, windowID: nil, system: seam.system)
  }

  func testASuccessfulActivationLeavesItInPlaceForTheCallersEvents() throws {
    let seam = SeamStub(frontmost: user)
    let activation = activation(seam)
    try activation.activate()
    XCTAssertEqual(seam.posts, [Posted(subtype: 1, pid: target)], "the pair's subtype 1, and no deactivation before the caller's events")
    XCTAssertTrue(activation.activated)
    XCTAssertEqual(seam.holds, 1)
    XCTAssertEqual(seam.releases, 1)
    XCTAssertEqual(seam.reactivated, [])
    XCTAssertNotNil(activation.guardMs)

    activation.deactivate()
    activation.deactivate()
    XCTAssertEqual(seam.posts, [Posted(subtype: 1, pid: target), Posted(subtype: 2, pid: target)], "one deactivation, once")
    XCTAssertFalse(activation.activated)
  }

  func testAFailedGuardLeavesItInPlaceForTheCallersDeactivate() {
    // Another app comes frontmost once the pair is posted: refused, and the front is left to whoever took it.
    let seam = SeamStub(frontmost: user, frontmostAfterPost: other)
    let activation = activation(seam)
    XCTAssertThrowsError(try activation.activate()) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "activationFailed")
    }
    XCTAssertEqual(seam.posts, [Posted(subtype: 1, pid: target)], "the throw posts no deactivation of its own")
    XCTAssertTrue(activation.activated, "the caller's deferred deactivate undoes it")
    XCTAssertEqual(seam.reactivated, [])
    XCTAssertEqual(seam.holds, 1)
    XCTAssertEqual(seam.releases, 1, "the screen-update hold is released on the throw")

    activation.deactivate()
    XCTAssertEqual(seam.posts.map(\.subtype), [1, 2])
  }

  func testTheRestoreIsReportedOnlyWhenItHappened() {
    for (reactivates, phrase) in [(true, "the frontmost app was restored"), (false, "the frontmost app could not be restored")] {
      let seam = SeamStub(frontmost: user, frontmostAfterPost: target, reactivates: reactivates)
      XCTAssertThrowsError(try activation(seam).activate()) { error in
        XCTAssertTrue((error as? EngineError)?.message.contains(phrase) == true, phrase)
      }
      XCTAssertEqual(seam.reactivated, [user])
    }
  }

  func testNoDeactivationOnceTheAppReallyBecameActive() throws {
    let seam = SeamStub(frontmost: user)
    let activation = activation(seam)
    try activation.activate()
    seam.frontmost = target
    activation.deactivate()
    XCTAssertEqual(seam.posts.map(\.subtype), [1])
  }

  func testTheTwoShortExits() throws {
    // The app already believes it has focus: nothing is posted or held.
    let focused = SeamStub(frontmost: user, keyFocus: target)
    let unneeded = activation(focused)
    try unneeded.activate()
    unneeded.deactivate()
    XCTAssertEqual(focused.posts, [])
    XCTAssertFalse(unneeded.activated)
    XCTAssertEqual(focused.holds, 0)
    XCTAssertNil(unneeded.guardMs)

    // No app is frontmost: the pair is posted without the hold or the guard.
    let alone = SeamStub(frontmost: nil)
    let unguarded = activation(alone)
    try unguarded.activate()
    XCTAssertEqual(alone.posts, [Posted(subtype: 1, pid: target)])
    XCTAssertTrue(unguarded.activated)
    XCTAssertEqual(alone.holds, 0)
    XCTAssertNil(unguarded.guardMs)
  }
}

/// One event the seam was asked to post: its AppKit-defined subtype (-1 for any other event) and the pid.
struct Posted: Equatable {
  let subtype: Int
  let pid: pid_t
}

/// Route 3's outside world, recorded: what was posted, held and re-activated, and the frontmost app and key focus it
/// answers; the clock is a fake one, so the guard takes no real time.
final class SeamStub {
  var posts: [Posted] = []
  var holds = 0
  var releases = 0
  var reactivated: [pid_t] = []
  var frontmost: pid_t?
  var clock: Double = 0
  let frontmostAfterPost: pid_t?
  let keyFocus: pid_t?
  let reactivates: Bool

  init(frontmost: pid_t?, frontmostAfterPost: pid_t? = nil, keyFocus: pid_t? = nil, reactivates: Bool = true) {
    self.frontmost = frontmost
    self.frontmostAfterPost = frontmostAfterPost
    self.keyFocus = keyFocus
    self.reactivates = reactivates
  }

  var system: ActivationSystem {
    var system = ActivationSystem()
    system.post = { event, pid in
      let subtype = NSEvent(cgEvent: event).map { $0.type == .appKitDefined ? Int($0.subtype.rawValue) : -1 } ?? -1
      self.posts.append(Posted(subtype: subtype, pid: pid))
      if let after = self.frontmostAfterPost { self.frontmost = after }
    }
    system.frontmost = { self.frontmost }
    system.keyFocus = { self.keyFocus }
    system.holdScreenUpdates = { self.holds += 1; return { self.releases += 1 } }
    system.reactivate = { pid in self.reactivated.append(pid); return self.reactivates }
    system.userWindow = { _ in nil }
    system.activationPoint = { _ in nil }
    system.now = { self.clock }
    system.sleep = { self.clock += $0 }
    system.schedule = { _, _ in }  // the cap's timer never fires here: every guard ends first
    return system
  }
}

/// An integer key code as CGKeyCode.
private func kx(_ code: Int) -> CGKeyCode { CGKeyCode(truncatingIfNeeded: code) }

extension Array where Element == KeyPress {
  var single: KeyPress? { count == 1 ? first : nil }
}
