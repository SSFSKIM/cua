import AppKit
import ApplicationServices
import CoreGraphics
import Foundation
import XCTest
@testable import Engine

// The second sitting's spike-only capabilities (the own native engine spec, Design "Input": the ladder 1 → 2′ → 3 → 2 → 4
// and the Decision Log's delegated unknowns): route 2′ (`"2'"`, the plain post), probe_spike's pure parts and probe_tap's
// mode and refusal data. Nothing here posts, activates, taps or touches another app.

// MARK: Route 2′

final class InputRouteTests: XCTestCase {
  func testRoute2PrimeParsesFromItsSpellingAndAnswersItOnTheWire() throws {
    XCTAssertEqual(try spikeRouteArg(["spikeRoute": "2'"], usable: InputRoute.synthesized), .plainPost)
    XCTAssertEqual(try spikeRouteArg(["spikeRoute": "2'"], usable: InputRoute.elementClick), .plainPost)
    XCTAssertEqual(String(data: encodeJSON(["inputRoute": InputRoute.plainPost.wire])!, encoding: .utf8), #"{"inputRoute":"2'"}"#)
  }

  func testTheNumberedRoutesStayNumbersOnTheWire() throws {
    XCTAssertEqual(try spikeRouteArg(["spikeRoute": "1"], usable: InputRoute.elementClick), .action)
    XCTAssertEqual(try spikeRouteArg(["spikeRoute": "2"], usable: InputRoute.synthesized), .commandPost)
    XCTAssertEqual(try spikeRouteArg(["spikeRoute": NSNumber(value: 3)], usable: InputRoute.synthesized), .activation)
    for (route, number) in [(InputRoute.action, 1), (.commandPost, 2), (.activation, 3)] {
      XCTAssertEqual(String(data: encodeJSON(["r": route.wire])!, encoding: .utf8), "{\"r\":\(number)}", "\(route)")
    }
    XCTAssertEqual(String(data: encodeJSON(["r": InputRoute.paste.wire])!, encoding: .utf8), #"{"r":"paste"}"#)
  }

  func testOtherSpellingsOfTwoPrimeAreArgumentErrors() {
    for bad in ["2p", "2\u{2032}", "2’", "2 '", "'2", NSNumber(value: 2.5)] as [Any] {
      XCTAssertThrowsError(try spikeRouteArg(["spikeRoute": bad], usable: InputRoute.synthesized), "\(bad)") { error in
        XCTAssertEqual((error as? EngineError)?.errorName, "invalidArguments")
      }
    }
  }

  func testRouteOneOnlyWhereAnElementCarriesIt() {
    XCTAssertThrowsError(try spikeRouteArg(["spikeRoute": "1"], usable: InputRoute.synthesized)) { error in
      XCTAssertTrue((error as? EngineError)?.message.contains("cannot carry this action") == true)
      XCTAssertTrue((error as? EngineError)?.message.contains("2'") == true, "the sentence names the routes that apply")
    }
  }

  /// The rule that separates 2′ from 2: only route 2 adds ⌘, and only into an app that is not active; neither post runs
  /// the fake activation, which only the default choice and route 3 do.
  func testOnlyRouteTwoCarriesCommandAndOnlyRouteThreeActivates() {
    XCTAssertEqual(clickFlags(.commandPost, targetActive: false), .maskCommand)
    XCTAssertEqual(clickFlags(.commandPost, targetActive: true), [])
    for route in [InputRoute.plainPost, .activation, .action] {
      XCTAssertEqual(clickFlags(route, targetActive: false), [], "\(route)")
    }
    XCTAssertEqual(clickFlags(nil, targetActive: false), [], "an unforced synthesized click carries no flag")
    XCTAssertTrue(runsActivation(nil))
    XCTAssertTrue(runsActivation(.activation))
    XCTAssertFalse(runsActivation(.plainPost))
    XCTAssertFalse(runsActivation(.commandPost))
  }
}

// MARK: probe_spike

final class SelectionProbeTests: XCTestCase {
  func testTheRangeArgument() throws {
    let range = try selectionRangeArg(["location": 3, "length": 0])
    XCTAssertEqual(range.location, 3)
    XCTAssertEqual(range.length, 0)
    for bad in [["location": -1, "length": 0], ["location": 1], ["location": true, "length": 1], ["location": 1.5, "length": 1],
                ["location": "1", "length": 1]] as [[String: Any]] {
      XCTAssertThrowsError(try selectionRangeArg(bad), "\(bad)") { error in
        XCTAssertEqual((error as? EngineError)?.errorName, "invalidArguments")
      }
    }
    XCTAssertThrowsError(try selectionRangeArg("3,0"))
  }

  func testTheRangeRoundTripsThroughAnAXValue() {
    let value = axRangeValue(CFRange(location: 5, length: 2))
    XCTAssertEqual(rangeWire(value), ["location": 5, "length": 2])
    var point = CGPoint(x: 1, y: 2)
    XCTAssertNil(rangeWire(AXValueCreate(.cgPoint, &point)), "a value of another type is no range")
    XCTAssertNil(rangeWire(nil))
  }

  private struct Node {
    let role: String
    var children: [Node] = []
  }

  private func find(_ root: Node, limit: Int = 3000) -> (role: String?, visited: Int) {
    let found = firstTextElement(from: root, limit: limit, role: { $0.role }, children: { $0.children })
    return (found.element?.role, found.visited)
  }

  func testATextAreaAnywhereWinsOverAnEarlierTextField() {
    let window = Node(role: "AXWindow", children: [
      Node(role: "AXGroup", children: [Node(role: "AXTextField"), Node(role: "AXScrollArea", children: [Node(role: "AXTextArea")])]),
      Node(role: "AXTextField"),
    ])
    XCTAssertEqual(find(window).role, "AXTextArea")
  }

  func testWithoutATextAreaTheFirstTextFieldInDepthFirstOrder() {
    let first = Node(role: "AXGroup", children: [Node(role: "AXButton"), Node(role: "AXGroup", children: [Node(role: "AXTextField")])])
    let window = Node(role: "AXWindow", children: [first, Node(role: "AXTextField")])
    let found = firstTextElement(from: window, limit: 3000, role: { $0.role }, children: { $0.children })
    XCTAssertEqual(found.element?.role, "AXTextField")
    XCTAssertEqual(found.visited, 6, "the whole tree is walked looking for a text area")
    XCTAssertNil(find(Node(role: "AXWindow", children: [Node(role: "AXButton")])).role)
  }

  func testTheWalkIsBounded() {
    let deep = Node(role: "AXWindow", children: (0..<10).map { _ in Node(role: "AXButton") } + [Node(role: "AXTextArea")])
    let found = find(deep, limit: 5)
    XCTAssertNil(found.role, "the text area lies beyond the bound")
    XCTAssertEqual(found.visited, 5)
    XCTAssertEqual(find(deep, limit: 12).role, "AXTextArea")
  }
}

/// probe_spike activate: route 3's activation and deactivation with nothing posted between them.
final class ActivationProbeTests: XCTestCase {
  private let target: pid_t = 990_011, user: pid_t = 990_012, other: pid_t = 990_013

  func testAnAppThatDoesNotBelieveItHasFocusGetsThePairAndTheDeactivationAndNothingElse() throws {
    let seam = SeamStub(frontmost: user)
    let report = try activationProbe(pid: target, window: AXUIElementCreateApplication(target), system: seam.system)
    XCTAssertEqual(seam.posts, [Posted(subtype: 1, pid: target), Posted(subtype: 2, pid: target)], "no action event between")
    XCTAssertEqual(report["believedBefore"] as? Bool, false)
    XCTAssertEqual(report["activationRan"] as? Bool, true)
    XCTAssertEqual(report["deactivationPosted"] as? Bool, true)
    XCTAssertEqual(report["inputRoute"] as? Int, 3)
    XCTAssertNotNil(report["activationGuardMs"] as? Double)
    XCTAssertEqual(report["frontmostBefore"] as? Int, Int(user))
    XCTAssertEqual(report["frontmostAfter"] as? Int, Int(user))
    XCTAssertNotNil(report["activateMs"] as? Double)
    XCTAssertLessThanOrEqual(report["startedAt"] as! Int, report["endedAt"] as! Int)
  }

  func testAnAppThatBelievesItHasFocusGetsNothing() throws {
    let seam = SeamStub(frontmost: user, keyFocus: target)
    let report = try activationProbe(pid: target, window: AXUIElementCreateApplication(target), system: seam.system)
    XCTAssertEqual(seam.posts, [])
    XCTAssertEqual(report["believedBefore"] as? Bool, true)
    XCTAssertEqual(report["activationRan"] as? Bool, false)
    XCTAssertEqual(report["inputRoute"] as? Int, 2, "what a real action reports when it posts without the activation")
    XCTAssertTrue(report["activationGuardMs"] is NSNull)
  }

  func testAFailedGuardRefusesWithTheReportAndStillDeactivates() {
    let seam = SeamStub(frontmost: user, frontmostAfterPost: other, reactivates: false)
    XCTAssertThrowsError(try activationProbe(pid: target, window: AXUIElementCreateApplication(target), system: seam.system)) { error in
      let refusal = error as? EngineError
      XCTAssertEqual(refusal?.errorName, "activationFailed")
      let report = refusal?.extra["probe"] as? [String: Any]
      XCTAssertEqual(report?["activationRan"] as? Bool, true)
      XCTAssertEqual(report?["deactivationPosted"] as? Bool, true)
    }
    XCTAssertEqual(seam.posts.map(\.subtype), [1, 2])
  }
}

// MARK: probe_tap

final class TapProbeArgumentTests: XCTestCase {
  func testStartDefaultsToTheListenTapForSixtySeconds() throws {
    let start = try TapStart(["op": "start"])
    XCTAssertEqual(start.mode, .listen)
    XCTAssertEqual(start.seconds, 60)
  }

  func testTheActiveModeAndItsWireName() throws {
    let start = try TapStart(["op": "start", "mode": "active", "seconds": 5])
    XCTAssertEqual(start.mode, .active)
    XCTAssertEqual(start.seconds, 5)
    XCTAssertEqual(TapMode.active.rawValue, "active")
    XCTAssertEqual(TapMode.listen.rawValue, "listen")
  }

  func testABadModeOrDurationIsAnArgumentError() {
    for bad in [["mode": "filter"], ["mode": 1], ["seconds": 0], ["seconds": 601]] as [[String: Any]] {
      XCTAssertThrowsError(try TapStart(bad), "\(bad)") { error in
        XCTAssertEqual((error as? EngineError)?.errorName, "invalidArguments")
      }
    }
  }

  /// Every refusal names the mode and both preflights, in its data and in its sentence, and keeps its code and name.
  func testARefusalCarriesTheModeAndBothPreflights() {
    let refused = tapRefusal(EngineError(name: "tapNotCreated", "The event tap could not be created."), mode: .active,
                             preflights: TapPreflights(listen: false, post: true))
    XCTAssertEqual(refused.errorName, "tapNotCreated")
    XCTAssertEqual(refused.code, -10005)
    XCTAssertEqual(refused.extra["mode"] as? String, "active")
    XCTAssertEqual(refused.extra["listenPreflight"] as? Bool, false)
    XCTAssertEqual(refused.extra["postPreflight"] as? Bool, true)
    XCTAssertTrue(refused.message.hasPrefix("The event tap could not be created."))
    XCTAssertTrue(refused.message.contains("listen preflight not granted"), refused.message)
    XCTAssertTrue(refused.message.contains("post preflight granted"), refused.message)

    let vendor = tapRefusal(EngineError(.runningApplicationNotFound, "Running application not found: X"), mode: nil,
                            preflights: TapPreflights(listen: true, post: true))
    XCTAssertEqual(vendor.code, -10007)
    XCTAssertEqual(vendor.errorName, "runningApplicationNotFound")
    XCTAssertTrue(vendor.extra["mode"] is NSNull, "a refusal before the mode is known names none")
    XCTAssertEqual(String(data: encodeJSON(vendor.wire)!, encoding: .utf8)?.contains("\"listenPreflight\":true"), true)
  }

  /// The active callback defers the count off the event path; the time reported is the arrival it stamped, not the
  /// moment the deferred count ran.
  func testADeferredCountKeepsTheCallbacksArrivalTime() {
    let counts = TapCounts(drivenPID: 200)
    counts.record(TapEventFields(type: .keyDown, sourcePID: 100, targetPID: 0, windowID: 0), enginePID: 100, at: 42)
    counts.record(TapEventFields(type: .keyDown, sourcePID: 5, targetPID: 200, windowID: 0), enginePID: 100, at: 43)
    XCTAssertEqual(counts.report["ownTimes"] as? [Int64], [42])
    XCTAssertEqual(counts.report["drivenTimes"] as? [Int64], [43])
  }

  func testTheActiveTapCountsItsReEnables() {
    let counts = TapCounts(drivenPID: 200)
    counts.noteDisabled(.tapDisabledByTimeout)
    counts.noteDisabled(.tapDisabledByTimeout)
    counts.noteDisabled(.tapDisabledByUserInput)
    let report = counts.report
    XCTAssertEqual(report["reenables"] as? Int, 3)
    XCTAssertEqual(report["disabledBy"] as? [String: Int], ["timeout": 2, "userInput": 1])
  }

  /// The active callback's body passes an event on as the same object, unmodified, and counts it (deferred); a
  /// disable notice goes to the disabled counts, never to the event counts. No tap is created: nothing is attached,
  /// so the re-enable has no port to touch.
  func testTheActiveCallbackReturnsTheEventUntouchedAndNeverCountsADisableNotice() throws {
    let counting = TapCounts(drivenPID: 200)
    let event = try XCTUnwrap(CGEvent(keyboardEventSource: nil, virtualKey: 0x0E, keyDown: true))
    event.flags = [.maskShift, .maskCommand]
    event.location = CGPoint(x: 123, y: 456)
    event.setIntegerValueField(eventField(41), value: Int64(getpid()))
    let before = (event.getIntegerValueField(.keyboardEventKeycode), event.flags, event.location, event.type)

    let passed = TapProbe.activeTapEvent(.keyDown, event, counting).takeUnretainedValue()
    XCTAssertTrue(passed === event, "the callback returns the event it was given")
    XCTAssertEqual(passed.getIntegerValueField(.keyboardEventKeycode), before.0)
    XCTAssertEqual(passed.flags, before.1)
    XCTAssertEqual(passed.location, before.2)
    XCTAssertEqual(passed.type, before.3)

    for notice in [CGEventType.tapDisabledByTimeout, .tapDisabledByUserInput] {
      XCTAssertTrue(TapProbe.activeTapEvent(notice, event, counting).takeUnretainedValue() === event)
    }
    TapProbe.deferredCounts.sync {}  // the deferred counts land before the report is read
    let report = counting.report
    XCTAssertEqual(report["counts"] as? [String: [String: Int]], ["keyDown": ["own": 1]])
    XCTAssertEqual(report["disabledBy"] as? [String: Int], ["timeout": 1, "userInput": 1])
    XCTAssertEqual(report["reenables"] as? Int, 2)
  }
}
