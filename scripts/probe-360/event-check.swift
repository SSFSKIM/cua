// Copied into the scratch engine's test target. This makes events but never posts or asks AX.
import XCTest
import CoreGraphics
@testable import Engine

final class Probe360EventChecks: XCTestCase {
  func testWindowAndFlagVariantsDoNotChangeKeyOrInventModifiers() throws {
    let poster = EventPoster.toProcess(12345)
    let specs = keyPressEvents(KeyPress(keyCode: 123, modifiers: .option))
    for variant in ["baseline", "window", "nsevent-window", "numpad", "function", "arrow-flags"] {
      let down = try XCTUnwrap(probe360Event(specs[1], variant: variant, poster: poster, window: 77))
      XCTAssertEqual(down.type, .keyDown)
      XCTAssertEqual(down.getIntegerValueField(.keyboardEventKeycode), 123)
      XCTAssertTrue(down.flags.contains(.maskAlternate))
      XCTAssertFalse(down.flags.contains(.maskCommand))
      XCTAssertEqual(down.flags.contains(.maskNumericPad), variant == "numpad" || variant == "arrow-flags")
      XCTAssertEqual(down.flags.contains(.maskSecondaryFn), variant == "function" || variant == "arrow-flags")
      // 91/92 are mouse-only on the local OS: attempted writes do not survive on keyboard events.
      // Assert the actual keyboard window carrier (51), not those unsupported setters.
      let wantsWindow = ["window", "nsevent-window"].contains(variant)
      XCTAssertEqual(down.getIntegerValueField(eventField(51)), wantsWindow ? 77 : 0)
      XCTAssertEqual(probe360Fields(down, target: 12345, phase: "offline")["nsWindowNumber"] as? Int, wantsWindow ? 77 : 0)
      let flags = try XCTUnwrap(probe360Event(specs[0], variant: variant, poster: poster, window: 77))
      XCTAssertEqual(flags.type, .flagsChanged)
      XCTAssertFalse(flags.flags.contains(.maskNumericPad)); XCTAssertFalse(flags.flags.contains(.maskSecondaryFn))
    }
  }
  func testSourceVariantsAreActuallyDifferentSourcesAndBaselineHasNoArrowFlags() throws {
    let spec = keyPressEvents(KeyPress(keyCode: 123, modifiers: []))[1]
    for state in [CGEventSourceStateID.hidSystemState, .combinedSessionState, .privateState] {
      let e = try XCTUnwrap(probe360Event(spec, variant: "baseline", poster: .toProcess(12345, sourceState: state), window: 77))
      let actual = e.getIntegerValueField(.eventSourceStateID)
      if state == .privateState { XCTAssertNotEqual(actual, 0); XCTAssertNotEqual(actual, 1) }
      else { XCTAssertEqual(actual, Int64(state.rawValue)) }
      XCTAssertEqual(e.flags.rawValue, 0)
      let fields = probe360Fields(e, target: 12345, phase: "offline-not-posted")
      let data = try JSONSerialization.data(withJSONObject: fields, options: [.sortedKeys])
      print("probe360-offline-fields " + String(decoding: data, as: UTF8.self))
    }
  }
}
