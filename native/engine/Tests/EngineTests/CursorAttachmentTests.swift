import CoreGraphics
import XCTest
@testable import Engine

// Where the cursor's panel sits (Cursor/CursorAttachment.swift; the spec's Design, "Where it shows" and "The overlay
// window"): directly above its target window at that window's level, at 102 while the target app is in front or has a
// menu open, hidden while the window is not on screen; coordinates flipped into the panel's screen.

final class CursorAttachmentTests: XCTestCase {
  private let list = [
    ListedWindow(number: 10, owner: 500, layer: 0, bounds: CGRect(x: 0, y: 0, width: 800, height: 600)),     // the user's front window
    ListedWindow(number: 20, owner: 600, layer: 0, bounds: CGRect(x: 100, y: 100, width: 900, height: 700)), // the target, under it
  ]

  func testTheCursorSitsAtTheTargetsLevelWhileItsAppIsBehind() {
    let a = cursorAttachment(window: 20, list: list, frontmostPid: 500)
    XCTAssertEqual(a, CursorAttachment(window: 20, owner: 600, level: 0, visible: true))
  }

  func testItRisesAboveMenusWhileTheTargetAppIsInFront() {
    XCTAssertEqual(cursorAttachment(window: 20, list: list, frontmostPid: 600).level, 102)
  }

  func testItRisesWhileTheTargetAppHasAMenuOpenEvenInTheBackground() {
    let menu = ListedWindow(number: 30, owner: 600, layer: 101, bounds: CGRect(x: 120, y: 120, width: 200, height: 300))
    XCTAssertEqual(cursorAttachment(window: 20, list: [menu] + list, frontmostPid: 500).level, 102)
    let otherMenu = ListedWindow(number: 31, owner: 500, layer: 101, bounds: CGRect(x: 0, y: 0, width: 10, height: 10))
    XCTAssertEqual(cursorAttachment(window: 20, list: [otherMenu] + list, frontmostPid: 500).level, 0, "another app's menu")
  }

  func testItHidesWhileTheTargetWindowIsNotOnScreen() {
    // Minimised, closed or on another Space: the on-screen list leaves it out.
    let a = cursorAttachment(window: 99, list: list, frontmostPid: 500)
    XCTAssertFalse(a.visible)
  }

  func testAPointIsFlippedIntoThePanelsScreen() {
    let primary = CursorScreen(frame: CGRect(x: 0, y: 0, width: 1440, height: 900), visibleFrame: CGRect(x: 0, y: 0, width: 1440, height: 875))
    let right = CursorScreen(frame: CGRect(x: 1440, y: 100, width: 1920, height: 1080), visibleFrame: CGRect(x: 1440, y: 100, width: 1920, height: 1055))
    let screens = CursorScreens(primaryHeight: 900, all: [primary, right])
    // Global top-left (100, 50) is AppKit (100, 850) on the primary screen.
    XCTAssertEqual(screens.screen(containing: CGPoint(x: 100, y: 50)), primary)
    XCTAssertEqual(screens.local(CGPoint(x: 100, y: 50), in: primary), CGPoint(x: 100, y: 850))
    // Global (1500, 0) is AppKit (1500, 900): on the right screen, whose frame starts at y 100.
    XCTAssertEqual(screens.screen(containing: CGPoint(x: 1500, y: 0)), right)
    XCTAssertEqual(screens.local(CGPoint(x: 1500, y: 0), in: right), CGPoint(x: 60, y: 800))
    XCTAssertNil(screens.screen(containing: CGPoint(x: -50, y: 50)), "off every screen")
    // A target in the menu bar's row is on the screen (its full frame), though outside the visible frame.
    XCTAssertEqual(screens.screen(containing: CGPoint(x: 700, y: 5)), primary)
  }

  func testTheNearestEdgePointOfANewScreen() {
    let right = CursorScreen(frame: CGRect(x: 1440, y: 0, width: 1920, height: 1080), visibleFrame: CGRect(x: 1440, y: 0, width: 1920, height: 1055))
    XCTAssertEqual(right.nearestPoint(to: CGPoint(x: 1000, y: 500)), CGPoint(x: 1440, y: 500))
  }

  func testOcclusionLooksAtTheTopmostWindowAtThePoint() {
    // The point (50, 50) is under the user's window 10; (950, 750) only under the target.
    XCTAssertTrue(occluded(CGPoint(x: 50, y: 50), target: 20, list: list, enginePid: 1))
    XCTAssertFalse(occluded(CGPoint(x: 950, y: 750), target: 20, list: list, enginePid: 1))
    let own = ListedWindow(number: 5, owner: 1, layer: 0, bounds: CGRect(x: 0, y: 0, width: 2000, height: 2000))
    XCTAssertFalse(occluded(CGPoint(x: 950, y: 750), target: 20, list: [own] + list, enginePid: 1), "the engine's own panels never occlude")
  }
}
