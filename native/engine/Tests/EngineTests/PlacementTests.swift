import XCTest
@testable import Engine

// #367: a primary window off every display or on another Space is named, observed with no screenshot, and the reason
// given (Placement.swift); an on-screen window is observed as before.

final class WindowPlacementTests: XCTestCase {
  /// Two displays side by side, top-left global points: the primary 1440 × 900 and one to its right.
  private let screens = [CGRect(x: 0, y: 0, width: 1440, height: 900), CGRect(x: 1440, y: 0, width: 1920, height: 1080)]
  private let shown: () -> Bool? = { true }
  private let notHidden: () -> Bool = { false }

  private func placement(_ frame: CGRect?, screens: [CGRect]? = nil, onScreen: (() -> Bool?)? = nil, appHidden: (() -> Bool)? = nil) -> WindowPlacement? {
    windowPlacement(frame: frame, screens: screens ?? self.screens, onScreen: onScreen ?? shown, appHidden: appHidden ?? notHidden)
  }

  func testAWindowOutsideEveryDisplayIsOffScreenWhateverTheWindowServerSays() {
    XCTAssertEqual(placement(CGRect(x: -5000, y: 200, width: 800, height: 600)), .offScreen)
    XCTAssertEqual(placement(CGRect(x: 100, y: 3000, width: 800, height: 600)), .offScreen, "below both displays")
    XCTAssertEqual(placement(CGRect(x: 100, y: 3000, width: 800, height: 600), onScreen: { false }), .offScreen,
                   "the geometry is read first, so the flag's absence does not rename it")
  }

  func testAWindowTouchingADisplaysEdgeOnlyIsOffScreen() {
    XCTAssertEqual(placement(CGRect(x: -800, y: 0, width: 800, height: 600)), .offScreen, "no area in common with the primary")
  }

  func testAWindowPartlyOnADisplayIsNotPlaced() {
    XCTAssertNil(placement(CGRect(x: -790, y: 100, width: 800, height: 600)), "ten points on the primary")
    XCTAssertNil(placement(CGRect(x: 3300, y: 1000, width: 800, height: 600)), "a corner on the second display")
  }

  func testAWindowOnADisplayIsNotPlaced() {
    XCTAssertNil(placement(CGRect(x: 100, y: 100, width: 800, height: 600)))
    XCTAssertNil(placement(CGRect(x: 1300, y: 100, width: 800, height: 600)), "across the two displays")
  }

  func testAWindowOnADisplayThatTheWindowServerDoesNotShowIsOnAnotherSpace() {
    XCTAssertEqual(placement(CGRect(x: 100, y: 100, width: 800, height: 600), onScreen: { false }), .anotherSpace)
  }

  func testAHiddenAppsWindowIsNotClaimedToBeOnAnotherSpace() {
    XCTAssertNil(placement(CGRect(x: 100, y: 100, width: 800, height: 600), onScreen: { false }, appHidden: { true }))
  }

  func testNothingReadMeansNoClaim() {
    XCTAssertNil(placement(nil), "no frame read, and the window server shows it")
    XCTAssertNil(placement(CGRect(x: -5000, y: 0, width: 800, height: 600), screens: []), "no screens read")
    XCTAssertNil(placement(CGRect(x: -5000, y: 0, width: 0.5, height: 600)), "a frame under one point is the capture's case")
    XCTAssertNil(placement(CGRect(x: 100, y: 100, width: 800, height: 600), onScreen: { nil }), "no window number or no window info")
  }

  func testTheHiddenReadAndTheFlagReadAreMadeOnlyWhenNeeded() {
    var flagReads = 0, hiddenReads = 0
    _ = placement(CGRect(x: -5000, y: 0, width: 800, height: 600), onScreen: { flagReads += 1; return true }, appHidden: { hiddenReads += 1; return false })
    XCTAssertEqual(flagReads, 0, "a window off every display needs no window server read")
    _ = placement(CGRect(x: 100, y: 100, width: 800, height: 600), onScreen: { flagReads += 1; return true }, appHidden: { hiddenReads += 1; return false })
    XCTAssertEqual(flagReads, 1)
    XCTAssertEqual(hiddenReads, 0, "the app's AXHidden is read only when the flag is absent")
  }
}

final class PlacementObservationTests: XCTestCase {
  private let capturing: (capture: Bool, screenshotOmitted: String?) = (true, nil)

  func testAPlacedWindowIsNotCapturedAndTheReasonIsNamed() {
    let offScreen = placementObservation(.offScreen, plan: capturing, includeScreenshot: true)
    XCTAssertFalse(offScreen.capture)
    XCTAssertEqual(offScreen.screenshotOmitted, "windowOffScreen")
    let anotherSpace = placementObservation(.anotherSpace, plan: capturing, includeScreenshot: true)
    XCTAssertFalse(anotherSpace.capture, "a window on another Space is no longer a noCapturableWindow failure of the observation")
    XCTAssertEqual(anotherSpace.screenshotOmitted, "windowOnAnotherSpace")
  }

  func testNoScreenshotAskedNoReasonGiven() {
    let plan = placementObservation(.offScreen, plan: (false, nil), includeScreenshot: false)
    XCTAssertFalse(plan.capture)
    XCTAssertNil(plan.screenshotOmitted)
  }

  /// Every other cause of noCapturableWindow (no frame, a frame under one point, no window number, a window the
  /// shareable content does not list) reads as no placement, so the capture is planned and fails as it did.
  func testWithNoPlacementThePlanStandsSoEveryOtherNoCapturableWindowCauseStillFails() throws {
    let screens = [CGRect(x: 0, y: 0, width: 1440, height: 900)]
    let causes: [(String, CGRect?, Bool?)] = [
      ("no frame", nil, true),
      ("a frame under one point", CGRect(x: 100, y: 100, width: 0, height: 600), true),
      ("no window number", CGRect(x: 100, y: 100, width: 800, height: 600), nil),
      ("not in the shareable content, shown by the window server", CGRect(x: 100, y: 100, width: 800, height: 600), true),
    ]
    for (cause, frame, onScreen) in causes {
      let placement = windowPlacement(frame: frame, screens: screens, onScreen: { onScreen }, appHidden: { false })
      XCTAssertNil(placement, cause)
      let plan = placementObservation(placement, plan: try minimizedObservation(minimized: false, exposesTree: true, includeScreenshot: true, app: "TextEdit"),
                                      includeScreenshot: true)
      XCTAssertTrue(plan.capture, "\(cause): the capture runs, and throws noCapturableWindow as before")
      XCTAssertNil(plan.screenshotOmitted, cause)
    }
  }

  func testAMinimizedWindowsPlanIsTheMinimizedRules() throws {
    let minimized = try minimizedObservation(minimized: true, exposesTree: true, includeScreenshot: true, app: "TextEdit")
    let plan = placementObservation(nil, plan: minimized, includeScreenshot: true)
    XCTAssertFalse(plan.capture)
    XCTAssertEqual(plan.screenshotOmitted, "windowMinimized")
  }

  func testTheSkyshotsWindowGainsAPlacementOnlyWhenThereIsOne() {
    let frame = CGRect(x: 10, y: 20, width: 800, height: 600)
    let shown = windowWire(title: "Untitled", frame: frame, pid: 501, placement: nil)
    XCTAssertEqual(Set(shown.keys), ["title", "frame", "pid"], "an on-screen window's Skyshot is as before")
    XCTAssertEqual(shown["title"] as? String, "Untitled")
    XCTAssertEqual(shown["pid"] as? Int, 501)
    XCTAssertTrue(windowWire(title: nil, frame: nil, pid: 501, placement: nil)["title"] is NSNull)
    XCTAssertEqual(windowWire(title: "Untitled", frame: frame, pid: 501, placement: .offScreen)["placement"] as? String, "offScreen")
    XCTAssertEqual(windowWire(title: "Untitled", frame: frame, pid: 501, placement: .anotherSpace)["placement"] as? String, "anotherSpace")
  }
}
