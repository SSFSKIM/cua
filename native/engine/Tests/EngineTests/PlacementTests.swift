import XCTest
@testable import Engine

// #367: a primary window off every display or on another Space is named, observed with no screenshot, and the reason
// given (Placement.swift); an on-screen window is observed as before.

final class WindowPlacementTests: XCTestCase {
  /// Two displays side by side, top-left global points: the primary 1440 × 900 and one to its right.
  private let screens = [CGRect(x: 0, y: 0, width: 1440, height: 900), CGRect(x: 1440, y: 0, width: 1920, height: 1080)]
  private let shown: () -> Bool? = { true }
  private let no: () -> Bool? = { false }

  private func placement(_ frame: CGRect?, screens: [CGRect]? = nil, onScreen: (() -> Bool?)? = nil, minimized: (() -> Bool?)? = nil,
                         appHidden: (() -> Bool?)? = nil) -> WindowPlacement? {
    windowPlacement(frame: frame, screens: screens ?? self.screens, onScreen: onScreen ?? shown, minimized: minimized ?? no, appHidden: appHidden ?? no)
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

  func testAHiddenAppsOrAMinimizedWindowIsNotClaimedToBeOnAnotherSpace() {
    let frame = CGRect(x: 100, y: 100, width: 800, height: 600)
    XCTAssertNil(placement(frame, onScreen: { false }, appHidden: { true }))
    XCTAssertNil(placement(frame, onScreen: { false }, minimized: { true }))
  }

  func testAnUnreadMinimizedOrHiddenAttributeMakesNoSpaceClaim() {
    let frame = CGRect(x: 100, y: 100, width: 800, height: 600)
    XCTAssertNil(placement(frame, onScreen: { false }, appHidden: { nil }), "AXHidden unread: the app may be hidden")
    XCTAssertNil(placement(frame, onScreen: { false }, minimized: { nil }), "AXMinimized unread: the window may be minimized")
  }

  func testNothingReadMeansNoClaim() {
    for onScreen in [shown, no] {
      XCTAssertNil(placement(nil, onScreen: onScreen), "no frame read")
      XCTAssertNil(placement(CGRect(x: -5000, y: 0, width: 800, height: 600), screens: [], onScreen: onScreen), "no screens read")
      XCTAssertNil(placement(CGRect(x: 100, y: 100, width: 0.5, height: 600), onScreen: onScreen), "a frame under one point is the capture's case")
      XCTAssertNil(placement(CGRect(x: -5000, y: 0, width: 0.5, height: 600), onScreen: onScreen))
      XCTAssertNil(placement(CGRect(x: 100, y: 100, width: 800, height: 600), screens: [], onScreen: onScreen))
    }
    XCTAssertNil(placement(CGRect(x: 100, y: 100, width: 800, height: 600), onScreen: { nil }), "no window number or no window info")
  }

  func testTheFlagMinimizedAndHiddenReadsAreMadeOnlyWhenNeeded() {
    var flagReads = 0, minimizedReads = 0, hiddenReads = 0
    let counted = { (frame: CGRect, flag: Bool) in
      _ = self.placement(frame, onScreen: { flagReads += 1; return flag }, minimized: { minimizedReads += 1; return false },
                         appHidden: { hiddenReads += 1; return false })
    }
    counted(CGRect(x: -5000, y: 0, width: 800, height: 600), true)
    XCTAssertEqual(flagReads, 0, "a window off every display needs no window server read")
    counted(CGRect(x: 100, y: 100, width: 800, height: 600), true)
    XCTAssertEqual(flagReads, 1)
    XCTAssertEqual(minimizedReads + hiddenReads, 0, "AXMinimized and AXHidden are read only when the flag is absent")
    counted(CGRect(x: 100, y: 100, width: 800, height: 600), false)
    XCTAssertEqual([flagReads, minimizedReads, hiddenReads], [2, 1, 1])
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
      ("no frame, not shown", nil, false),
      ("a frame under one point", CGRect(x: 100, y: 100, width: 0, height: 600), true),
      ("a frame under one point, not shown", CGRect(x: 100, y: 100, width: 0, height: 600), false),
      ("no window number", CGRect(x: 100, y: 100, width: 800, height: 600), nil),
      ("not in the shareable content, shown by the window server", CGRect(x: 100, y: 100, width: 800, height: 600), true),
    ]
    for (cause, frame, onScreen) in causes {
      let placement = windowPlacement(frame: frame, screens: screens, onScreen: { onScreen }, minimized: { false }, appHidden: { false })
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

// Ruling 1ea561bc:782: an app accessibility lists no window for, whose windows the window server places on another
// Space (Electron's case on the hosted runner, run 44122922177), is refused at once; anything less certain is not.
final class AbsentWindowOnAnotherSpaceTests: XCTestCase {
  /// The current Space of the one display, and the fullscreen Space the hosted Electron window was on.
  private let here: Set<UInt64> = [1]
  private let away: Set<UInt64> = [25]

  private func check(_ windows: [SpacedWindow], current: Set<UInt64>? = nil, spaces: [CGWindowID: Set<UInt64>] = [:],
                     hidden: Bool? = false) -> Bool {
    windowsOnAnotherSpace(windows, currentSpaces: { current ?? self.here }, spaces: { spaces[$0] ?? [] }, appHidden: { hidden })
  }

  private func window(_ number: CGWindowID, layer: Int = 0, onScreen: Bool = false) -> SpacedWindow {
    SpacedWindow(number: number, layer: layer, onScreen: onScreen)
  }

  func testAnAppWhoseWindowIsOnlyOnAnotherSpaceIsOnAnotherSpace() {
    XCTAssertTrue(check([window(10)], spaces: [10: away]))
    XCTAssertTrue(check([window(10), window(11)], spaces: [11: away]), "one window there is enough; the other ordered out")
    XCTAssertTrue(check([window(10)], current: [1, 2], spaces: [10: [3]]), "two displays, each showing its own Space")
  }

  func testAnAppMerelySlowToOpenItsWindowIsNot() {
    XCTAssertFalse(check([]), "no window listed yet")
    XCTAssertFalse(check([window(10)], spaces: [10: here]), "a window on the current Space that is not shown yet")
    XCTAssertFalse(check([window(10)]), "a window ordered out is on no Space")
    XCTAssertFalse(check([window(10), window(11)], spaces: [10: here, 11: away]),
                   "a window opening here vetoes the claim, though another is on another Space")
    XCTAssertFalse(check([window(11), window(10)], spaces: [10: here, 11: away]), "whichever window is listed first")
  }

  func testAWindowShownHereOrSharedWithTheCurrentSpaceMakesNoClaim() {
    XCTAssertFalse(check([window(10, onScreen: true), window(11)], spaces: [10: here, 11: away]), "one of its windows is shown here")
    XCTAssertFalse(check([window(10)], spaces: [10: [1, 25]]), "a window on every Space is on this one too")
    XCTAssertFalse(check([window(10)], current: [1, 2], spaces: [10: [2]]), "on the Space the second display shows")
  }

  func testOnlyNormalWindowsCount() {
    XCTAssertFalse(check([window(10, layer: 3)], spaces: [10: away]), "a floating panel there is not the app's window")
    XCTAssertTrue(check([window(10), window(11, layer: 25, onScreen: true)], spaces: [10: away]),
                  "a status item shown here does not count as a window shown here")
  }

  func testAnUnreadOrHiddenStateMakesNoClaim() {
    XCTAssertFalse(check([window(10)], current: [], spaces: [10: away]), "the current Spaces unread")
    XCTAssertFalse(check([window(10)], spaces: [10: away], hidden: true), "a hidden app")
    XCTAssertFalse(check([window(10)], spaces: [10: away], hidden: nil), "the hidden flag unread")
  }

  func testTheSpaceAndHiddenReadsAreMadeOnlyWhenNeeded() {
    var currentReads = 0, spaceReads = 0, hiddenReads = 0
    let counted = { (windows: [SpacedWindow], spaces: Set<UInt64>) -> Bool in
      windowsOnAnotherSpace(windows, currentSpaces: { currentReads += 1; return self.here }, spaces: { _ in spaceReads += 1; return spaces },
                            appHidden: { hiddenReads += 1; return false })
    }
    XCTAssertFalse(counted([], away))
    XCTAssertFalse(counted([window(10, onScreen: true)], away))
    XCTAssertEqual([currentReads, spaceReads, hiddenReads], [0, 0, 0], "no window, or one shown here, reads no Space")
    XCTAssertFalse(counted([window(10)], here))
    XCTAssertEqual([currentReads, spaceReads, hiddenReads], [1, 1, 0], "the hidden flag only once a window is elsewhere")
    XCTAssertTrue(counted([window(10)], away))
    XCTAssertEqual([currentReads, spaceReads, hiddenReads], [2, 2, 1])
  }

  func testTheRefusalNamesTheReasonAndTheRemedy() {
    let refusal = windowOnAnotherSpace(app: "cua Electron Fixture")
    XCTAssertEqual(refusal.errorName, "windowOnAnotherSpace")
    XCTAssertEqual(refusal.message, "The cua Electron Fixture window is on another Space. Ask the user to bring it here or switch to its Space.")
  }
}

// Ruling 1ea561bc:782: a Raise on a window on another Space answered success and did nothing (run 44122922177), so it is
// refused before anything is sent; a Raise on a window off every display stays as it was.
final class RaiseRefusalTests: XCTestCase {
  private func refusal(_ action: String = kAXRaiseAction, role: String? = kAXWindowRole, placement: WindowPlacement?) -> EngineError? {
    raiseRefusal(action: action, role: role, placement: { placement }, app: "TextEdit")
  }

  func testARaiseOnAWindowOnAnotherSpaceIsRefused() {
    let refused = refusal(placement: .anotherSpace)
    XCTAssertEqual(refused?.errorName, "windowOnAnotherSpace")
    XCTAssertEqual(refused?.message, windowOnAnotherSpace(app: "TextEdit").message)
  }

  func testARaiseOnAWindowShownHereOrOffEveryDisplayGoesAhead() {
    XCTAssertNil(refusal(placement: nil))
    XCTAssertNil(refusal(placement: .offScreen), "off every display, Raise stays as it was")
  }

  func testOtherActionsAndOtherElementsAreNotReadOrRefused() {
    var reads = 0
    let read: () -> WindowPlacement? = { reads += 1; return .anotherSpace }
    XCTAssertNil(raiseRefusal(action: kAXPressAction, role: kAXWindowRole, placement: read, app: "TextEdit"))
    XCTAssertNil(raiseRefusal(action: kAXRaiseAction, role: kAXCellRole, placement: read, app: "TextEdit"), "a Raise a cell offers")
    XCTAssertNil(raiseRefusal(action: kAXRaiseAction, role: nil, placement: read, app: "TextEdit"))
    XCTAssertEqual(reads, 0, "the placement is read only for a Raise on a window")
  }
}
