import AppKit
import ApplicationServices
import CoreGraphics
import Foundation
import XCTest
@testable import Engine

// The second sitting's spike-only route override (the own native engine spec, Design "Input"): route 2′ (`"2'"`, the
// plain post) and the numbered routes as `spikeRoute` spells them. Nothing here posts, activates or touches another app.
// probe_spike and probe_tap left the engine with M2a.1; the range helpers select_text needs are pinned below.

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

  /// The rule that separates 2′ from 2: only route 2 adds ⌘, and only into an app that is not active; route 3's click,
  /// the default for every synthesized click, carries no flag.
  func testOnlyRouteTwoCarriesCommand() {
    XCTAssertEqual(clickFlags(.commandPost, targetActive: false), .maskCommand)
    XCTAssertEqual(clickFlags(.commandPost, targetActive: true), [])
    for route in [InputRoute.plainPost, .activation, .action] {
      XCTAssertEqual(clickFlags(route, targetActive: false), [], "\(route)")
    }
  }
}

// MARK: The selected-text range as AX carries it

final class RangeValueTests: XCTestCase {
  func testTheRangeRoundTripsThroughAnAXValue() {
    let value = axRangeValue(CFRange(location: 5, length: 2))
    XCTAssertEqual(rangeWire(value), ["location": 5, "length": 2])
    var point = CGPoint(x: 1, y: 2)
    XCTAssertNil(rangeWire(AXValueCreate(.cgPoint, &point)), "a value of another type is no range")
    XCTAssertNil(rangeWire(nil))
  }
}
