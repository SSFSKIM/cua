import AppKit
import ApplicationServices
import CoreGraphics
import Foundation
import XCTest
@testable import Engine

// #328 (the design session's ruling b1921fc3): a pointer action's point outside the screenshot is refused, and every
// scroll is confirmed by reading the scroll container under the point before the wheel and after it, with the bar's
// write as the fallback. A fake tree answers the Accessibility calls (FakeAX, ElementMethodTests.swift); nothing reaches
// any process, and the "post" is a closure that moves the fake tree or does not.

private func el(_ id: Int) -> AXUIElement { Engine.element(id) }

// MARK: The refusal outside the screenshot

final class OutsideScreenshotTests: XCTestCase {
  private let app = ResolvedApp(appPath: "/Applications/Fake.app", bundleIdentifier: "com.example.fake", displayName: "Fake", running: nil)
  private let window = AXUIElementCreateApplication(61_001)
  /// A 1220 × 860 image of a 610 × 430 window at scale 2.
  private func connection() -> ConnectionState {
    let connection = ConnectionState(id: 1, fd: -1)
    let lineage = Lineage()
    lineage.commit(Revision())
    let image = CapturedScreenshot(url: "file:///x.jpg", width: 1220, height: 860, frame: CGRect(x: 0, y: 0, width: 610, height: 430), scale: 2)
    lineage.screenshot = ObservedScreenshot(window: window, image: image)
    connection.lineages[app.key] = lineage
    return connection
  }

  private func place(_ x: Double, _ y: Double) throws -> CGPoint {
    try connection().screenshotPoint(x, y, app: app, window: window, lineage: nil)
  }

  private func assertRefused(_ x: Double, _ y: Double, _ what: String, file: StaticString = #filePath, line: UInt = #line) {
    XCTAssertThrowsError(try place(x, y), what, file: file, line: line) { error in
      let error = error as? EngineError
      XCTAssertEqual(error?.errorName, "pointOutsideScreenshot", what, file: file, line: line)
      XCTAssertTrue(error?.message.contains("outside the screenshot, which is 1220 × 860 pixels") == true, what, file: file, line: line)
      XCTAssertTrue(error?.message.contains("Give a point inside it") == true, what, file: file, line: line)
    }
  }

  /// Every pointer action's coordinates pass `screenshotPoint` before anything is read or posted: a click's (x, y)
  /// (coordinatePlacement), a scroll's (x, y) and a drag's start and end (coordinatePoint). Each side of the image.
  func testEachPointerActionsPointOutsideTheScreenshotIsRefused() {
    assertRefused(1220, 400, "a click at the image's width")
    assertRefused(-1, 400, "a click left of the image")
    assertRefused(600, 860, "a scroll at the image's height: #324's aim, the centre of a text area below its window")
    assertRefused(600, 2000, "a scroll far below")
    assertRefused(-0.5, -0.5, "a drag's start above and left of the image")
    assertRefused(600, -1, "a drag's start above the image")
    assertRefused(1220.25, 10, "a drag's end just past the right edge")
    assertRefused(10, 860.5, "a drag's end just past the bottom")
  }

  func testTheImagesEdgePointsPass() throws {
    XCTAssertEqual(try place(0, 0), CGPoint(x: 0, y: 0))
    XCTAssertEqual(try place(1219, 859), CGPoint(x: 609.5, y: 429.5))
    XCTAssertEqual(try place(1219.5, 0), CGPoint(x: 609.75, y: 0), "a fraction short of the width")
  }

  func testTheSentenceNamesThePointAndTheImage() {
    let error = pointOutsideScreenshot(1300, 12.5, width: 1220, height: 860)
    XCTAssertEqual(error.message, "The point (1300, 12.50) lies outside the screenshot, which is 1220 × 860 pixels. Give a point inside it: x from 0 to 1219 and y from 0 to 859.")
  }

  /// A drag's middle event is the midpoint of its two ends, so inside the screenshot whenever both ends are: the ends'
  /// check covers every point of the path (no separate check of the middle exists).
  func testADragsMiddleLiesBetweenItsEnds() {
    let window = ClickTarget(point: .zero, windowFrame: CGRect(x: 0, y: 0, width: 610, height: 430), windowID: 7, pid: 1)
    let events = dragEvents(from: CGPoint(x: 0, y: 0), to: CGPoint(x: 609.5, y: 429.5), window: window, flags: [])
    XCTAssertEqual(events.map(\.location)[2], CGPoint(x: 304.75, y: 214.75))
  }
}

// MARK: The confirmation

/// A window (1) holding a scroll area (2), viewport y 100…300, whose content (3) is 1000 points tall and holds 50 rows
/// (100…149) of 20 points, and whose vertical bar (5) reads its position over the 800 scrollable points.
private final class ScrollScene {
  let ax = FakeAX()
  var offset: CGFloat = 0
  var moves: [CGFloat] = []

  init(offset: CGFloat = 0, barSettable: Bool = false) {
    ax.roles = [1: kAXWindowRole, 2: kAXScrollAreaRole, 3: "AXList", 5: kAXScrollBarRole]
    ax.parents = [2: 1, 3: 2, 5: 2]
    ax.children = [1: [2], 2: [3, 5], 3: Array(100..<150)]
    ax.frames[1] = CGRect(x: 0, y: 0, width: 400, height: 400)
    ax.frames[2] = CGRect(x: 0, y: 100, width: 400, height: 200)
    ax.frames[5] = CGRect(x: 390, y: 100, width: 10, height: 200)
    ax.values[2] = [kAXContentsAttribute: [el(3)] as CFArray, kAXVerticalScrollBarAttribute: el(5)]
    for row in 100..<150 { ax.roles[row] = kAXRowRole; ax.parents[row] = 3 }
    if barSettable { ax.settable[5] = [kAXValueAttribute] }
    ax.onWrite = { [unowned self] id, name, value in
      if id == 5, name == kAXValueAttribute { self.place(CGFloat((value as! NSNumber).doubleValue) * 800) }
    }
    place(offset)
  }

  /// The content scrolled `offset` points down: every frame and the bar follow.
  func place(_ offset: CGFloat) {
    self.offset = min(max(offset, 0), 800)
    ax.frames[3] = CGRect(x: 0, y: 100 - self.offset, width: 390, height: 1000)
    for row in 100..<150 { ax.frames[row] = CGRect(x: 0, y: 100 - self.offset + CGFloat(row - 100) * 20, width: 390, height: 20) }
    ax.values[5, default: [:]][kAXValueAttribute] = NSNumber(value: Double(self.offset / 800))
  }

  /// The row under a point of the viewport now.
  func row(at y: CGFloat) -> AXUIElement { el(100 + Int((y - 100 + offset) / 20)) }

  /// A wheel the app takes: the content moves `points` down at once.
  func wheel(_ points: CGFloat) -> () -> Void { { self.moves.append(points); self.place(self.offset + points) } }
}

final class ScrollConfirmTests: XCTestCase {
  func testAMoveIsSuccessWithTheMoveInTheMeta() throws {
    let scene = ScrollScene(offset: 200)
    let record = try confirmScroll(hit: scene.row(at: 200), direction: .down, delta: 120, ax: scene.ax.ops, post: scene.wheel(120))
    XCTAssertEqual(record.outcome, .moved)
    XCTAssertEqual(record.container, .scrollArea)
    XCTAssertEqual(record.moved, 120)
    XCTAssertEqual(record.by, "content")
    XCTAssertEqual(record.polls, 1, "the first reading that moved ends the poll")
    XCTAssertNil(try scrollAnswer(record, direction: .down, app: "Fake"))
    let wire = record.wire
    XCTAssertEqual(wire["moved"] as? Double, 120)
    XCTAssertEqual(wire["outcome"] as? String, "moved")
    XCTAssertEqual(wire["barBefore"] as? Double, 0.25)
    XCTAssertNil(wire["atEnd"])
    XCTAssertTrue(scene.ax.writes.isEmpty, "no fallback after a move")
  }

  func testAMoveUpIsSeenTheAskedWay() throws {
    let scene = ScrollScene(offset: 400)
    let record = try confirmScroll(hit: scene.row(at: 200), direction: .up, delta: 120, ax: scene.ax.ops, post: scene.wheel(-120))
    XCTAssertEqual(record.outcome, .moved)
    XCTAssertEqual(record.moved, 120, "positive: the way asked")
  }

  func testAMoveTheOtherWayIsNotAMove() throws {
    let scene = ScrollScene(offset: 400)
    let record = try confirmScroll(hit: scene.row(at: 200), direction: .down, delta: 120, ax: scene.ax.ops, post: scene.wheel(-120))
    XCTAssertEqual(record.outcome, .unconfirmed)
  }

  func testUnmovedAtTheEndIsSuccessWithAtEnd() throws {
    let scene = ScrollScene(offset: 800, barSettable: true)
    let record = try confirmScroll(hit: scene.row(at: 200), direction: .down, delta: 120, ax: scene.ax.ops, post: {})
    XCTAssertEqual(record.outcome, .atEnd)
    XCTAssertEqual(record.wire["atEnd"] as? Bool, true)
    XCTAssertEqual(try scrollAnswer(record, direction: .down, app: "Fake"),
                   "Nothing moved: what is at that point in Fake is already scrolled as far down as it goes.")
    XCTAssertGreaterThanOrEqual(scene.ax.clock, scrollConfirmWindowMs, "the end is told only after the whole window")
  }

  /// The end must read before and after: a bar that left its end while nothing moved is not the end's answer.
  func testTheEndMustReadBeforeAndAfter() throws {
    let scene = ScrollScene(offset: 800)
    let record = try confirmScroll(hit: scene.row(at: 200), direction: .down, delta: 120, ax: scene.ax.ops,
                                   post: { scene.ax.values[5]?[kAXValueAttribute] = NSNumber(value: 0.9) })
    XCTAssertEqual(record.outcome, .unconfirmed)
  }

  /// The in-flight intervention check runs before the fallback's write: a user event then stops the scroll, nothing
  /// written.
  func testTheFallbacksWriteWaitsOnTheInterventionCheck() {
    let scene = ScrollScene(offset: 200, barSettable: true)
    XCTAssertThrowsError(try confirmScroll(hit: scene.row(at: 200), direction: .down, delta: 120, ax: scene.ax.ops, post: {},
                                           beforeWriting: { throw EngineError(.userIntervened, "stopped") })) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "userIntervened")
    }
    XCTAssertTrue(scene.ax.writes.isEmpty)
  }

  func testTheTopIsTheEndOfAScrollUp() throws {
    let scene = ScrollScene(offset: 0, barSettable: true)
    let record = try confirmScroll(hit: scene.row(at: 200), direction: .up, delta: 120, ax: scene.ax.ops, post: {})
    XCTAssertEqual(record.outcome, .atEnd)
  }

  func testUnmovedNotAtTheEndFallsBackToTheBarThenConfirms() throws {
    let scene = ScrollScene(offset: 200, barSettable: true)
    var posted = 0
    let record = try confirmScroll(hit: scene.row(at: 200), direction: .down, delta: 120, ax: scene.ax.ops, post: { posted += 1 })
    XCTAssertEqual(posted, 1, "the wheel posted once, nothing posted by the fallback")
    XCTAssertEqual(scene.ax.writes.map(\.id), [5])
    XCTAssertEqual(record.barWrite ?? 0, 0.4, accuracy: 1e-9, "0.25 + 120 / 800")
    XCTAssertEqual(record.outcome, .moved)
    XCTAssertEqual(record.moved ?? 0, 120, accuracy: 1e-6)
    XCTAssertNil(try scrollAnswer(record, direction: .down, app: "Fake"))
  }

  func testAFallbackThatMovesNothingIsUnconfirmed() throws {
    let scene = ScrollScene(offset: 200, barSettable: true)
    scene.ax.onWrite = { _, _, _ in }  // System Settings' pane would move; this one does not
    let record = try confirmScroll(hit: scene.row(at: 200), direction: .down, delta: 120, ax: scene.ax.ops, post: {})
    XCTAssertEqual(scene.ax.writes.count, 1)
    XCTAssertEqual(record.outcome, .unconfirmed)
    XCTAssertThrowsError(try scrollAnswer(record, direction: .down, app: "Fake")) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "scrollUnconfirmed")
      XCTAssertEqual((error as? EngineError)?.message,
                     "The scroll was sent to Fake, but nothing at that point was seen to move. Observe the app (take a screenshot or call getAXState()) before scrolling again.")
    }
  }

  func testUnmovedWithABarThatCannotBeSetIsUnconfirmed() throws {
    let scene = ScrollScene(offset: 200)
    let record = try confirmScroll(hit: scene.row(at: 200), direction: .down, delta: 120, ax: scene.ax.ops, post: {})
    XCTAssertEqual(record.outcome, .unconfirmed)
    XCTAssertTrue(scene.ax.writes.isEmpty)
  }

  func testNoContainerIsUnconfirmed() throws {
    let ax = FakeAX()
    ax.roles = [1: kAXWindowRole, 2: kAXGroupRole, 3: kAXButtonRole]
    ax.parents = [2: 1, 3: 2]
    ax.frames = [3: CGRect(x: 10, y: 10, width: 50, height: 20)]
    var posted = 0
    let record = try confirmScroll(hit: el(3), direction: .down, delta: 120, ax: ax.ops, post: { posted += 1 })
    XCTAssertEqual(posted, 1, "the wheel still goes")
    XCTAssertNil(record.container)
    XCTAssertEqual(record.polls, 0, "nothing to poll")
    XCTAssertTrue(record.wire["container"] is NSNull)
    XCTAssertThrowsError(try scrollAnswer(record, direction: .down, app: "Fake")) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "scrollUnconfirmed")
    }
    XCTAssertThrowsError(try scrollAnswer(try confirmScroll(hit: nil, direction: .down, delta: 120, ax: ax.ops, post: {}), direction: .down, app: "Fake"),
                         "no element under the point at all")
  }

  /// The poll reads every interval until the window closes: a move that first shows late inside it is seen; one that
  /// shows only after it is not.
  func testAMoveThatFirstAppearsLateInsideTheWindowIsSeen() throws {
    // Literal times, so the window's 300 ms is pinned: a shorter window misses 260, a longer one sees 340.
    for (late, seen) in [(260.0, true), (340.0, false)] {
      let scene = ScrollScene(offset: 200)
      var ops = scene.ax.ops
      var postedAt: Double?
      ops.sleep = { ms in
        scene.ax.clock += ms
        if let at = postedAt, scene.ax.clock - at >= late, scene.offset == 200 { scene.place(320) }
      }
      let record = try confirmScroll(hit: scene.row(at: 200), direction: .down, delta: 120, ax: ops, post: { postedAt = scene.ax.clock })
      XCTAssertEqual(record.outcome, seen ? .moved : .unconfirmed, "a move first at \(late) ms")
      if seen {
        XCTAssertGreaterThanOrEqual(record.firstMoveMs ?? 0, late)
        XCTAssertLessThan(record.firstMoveMs ?? .infinity, 300 + scrollConfirmIntervalMs)
      }
    }
  }

  func testTheFallbackIsNeverWrittenAtTheEnd() throws {
    for (offset, direction) in [(CGFloat(800), ScrollDirection.down), (0, .up)] {
      let scene = ScrollScene(offset: offset, barSettable: true)
      _ = try confirmScroll(hit: scene.row(at: 200), direction: direction, delta: 120, ax: scene.ax.ops, post: {})
      XCTAssertTrue(scene.ax.writes.isEmpty, "\(direction) at the end")
    }
    // At the end after the wheel though not before (the content grew or the bar moved under 0.5 pt): no write either.
    let scene = ScrollScene(offset: 799, barSettable: true)
    let record = try confirmScroll(hit: scene.row(at: 200), direction: .down, delta: 120, ax: scene.ax.ops, post: { scene.place(799.3) })
    XCTAssertEqual(record.outcome, .unconfirmed)
    XCTAssertTrue(scene.ax.writes.isEmpty)
  }

  /// The hit lies in a group that is in no scroll area, while a sibling scroll area's bar is settable: nothing is
  /// written to it, and the scroll answers scrollUnconfirmed.
  func testTheFallbackIsNeverWrittenOnAnotherContainer() throws {
    let scene = ScrollScene(offset: 200, barSettable: true)
    let ax = scene.ax
    ax.roles[6] = kAXGroupRole; ax.roles[7] = kAXStaticTextRole
    ax.parents[6] = 1; ax.parents[7] = 6
    ax.children[1] = [2, 6]
    ax.frames[7] = CGRect(x: 0, y: 320, width: 100, height: 20)
    let record = try confirmScroll(hit: el(7), direction: .down, delta: 120, ax: ax.ops, post: {})
    XCTAssertNil(record.container)
    XCTAssertTrue(ax.writes.isEmpty, "the other scroll area's bar is never written")
    // Nested: an inner scroll area (8) under the point, its bar not settable, inside the outer one whose bar is: the
    // inner is the container, and the outer's bar is never written.
    ax.roles[8] = kAXScrollAreaRole; ax.roles[9] = kAXStaticTextRole; ax.roles[10] = kAXScrollBarRole
    ax.parents[8] = 3; ax.parents[9] = 8; ax.parents[10] = 8
    ax.children[8] = [9, 10]
    ax.frames[8] = CGRect(x: 0, y: 150, width: 390, height: 100); ax.frames[9] = CGRect(x: 0, y: 150, width: 390, height: 300)
    ax.values[8] = [kAXVerticalScrollBarAttribute: el(10)]
    ax.values[10] = [kAXValueAttribute: NSNumber(value: 0.5)]
    let nested = try confirmScroll(hit: el(9), direction: .down, delta: 120, ax: ax.ops, post: {})
    XCTAssertEqual(nested.container, .scrollArea)
    XCTAssertEqual(nested.barBefore, 0.5, "the inner area's bar was read")
    XCTAssertTrue(ax.writes.isEmpty)
  }

  func testTheDeltaIsConvertedOverTheScrollableLength() {
    XCTAssertEqual(scrollBarTarget(from: 0.25, delta: 120, scrollable: 800, direction: .down), 0.4, accuracy: 1e-12)
    XCTAssertEqual(scrollBarTarget(from: 0.25, delta: 120, scrollable: 800, direction: .up), 0.1, accuracy: 1e-12)
    XCTAssertEqual(scrollBarTarget(from: 0.5, delta: 120, scrollable: 600, direction: .right), 0.7, accuracy: 1e-12)
    XCTAssertEqual(scrollBarTarget(from: 0.5, delta: 120, scrollable: 600, direction: .left), 0.3, accuracy: 1e-12)
    XCTAssertEqual(scrollBarTarget(from: 0.95, delta: 120, scrollable: 800, direction: .down), 1, "clamped at the end")
    XCTAssertEqual(scrollBarTarget(from: 0.05, delta: 120, scrollable: 800, direction: .up), 0, "clamped at the start")
  }

  /// The scrollable length is the content's frame less the viewport, or AXContentSize's where the content's frame is no
  /// longer than the viewport.
  func testTheScrollableLengthReadsTheContentSizeWhereTheFrameDoesNotScroll() {
    let scene = ScrollScene(offset: 0)
    XCTAssertEqual(scrollGeometry(el(2), kind: .scrollArea, hit: nil, horizontal: false, ax: scene.ax.ops).scrollableLength, 800)
    scene.ax.frames[3] = CGRect(x: 0, y: 100, width: 390, height: 200)
    var extent = CGSize(width: 390, height: 1500)
    scene.ax.values[2]?["AXContentSize"] = AXValueCreate(.cgSize, &extent)!
    XCTAssertEqual(scrollGeometry(el(2), kind: .scrollArea, hit: nil, horizontal: false, ax: scene.ax.ops).scrollableLength, 1300)
    scene.ax.values[2]?["AXContentSize"] = nil
    XCTAssertNil(scrollGeometry(el(2), kind: .scrollArea, hit: nil, horizontal: false, ax: scene.ax.ops).scrollableLength)
  }

  func testTheContainerIsTheNearestScrollAreaElseAPageScrollerOrAWebArea() {
    let ax = FakeAX()
    ax.roles = [1: kAXWindowRole, 2: kAXScrollAreaRole, 3: "AXWebArea", 4: kAXGroupRole, 5: kAXStaticTextRole]
    ax.parents = [2: 1, 3: 2, 4: 3, 5: 4]
    ax.actions = [4: ["AXScrollDownByPage"]]
    XCTAssertTrue(scrollContainer(of: el(5), ax: ax.ops).map { FakeAX.id($0.element) == 2 && $0.kind == .scrollArea } ?? false,
                  "the scroll area above, past a page scroller and a web area")
    ax.roles[2] = kAXGroupRole
    XCTAssertTrue(scrollContainer(of: el(5), ax: ax.ops).map { FakeAX.id($0.element) == 4 && $0.kind == .pageScroller } ?? false)
    ax.actions = [:]
    XCTAssertTrue(scrollContainer(of: el(5), ax: ax.ops).map { FakeAX.id($0.element) == 3 && $0.kind == .webArea } ?? false)
    ax.roles[3] = kAXGroupRole
    XCTAssertNil(scrollContainer(of: el(5), ax: ax.ops))
    ax.roles[0] = kAXScrollAreaRole; ax.parents[1] = 0  // something above the window answering a scroll area
    XCTAssertNil(scrollContainer(of: el(5), ax: ax.ops), "the walk stops at the window")
    ax.roles[5] = kAXScrollAreaRole
    XCTAssertTrue(scrollContainer(of: el(5), ax: ax.ops).map { FakeAX.id($0.element) == 5 } ?? false, "the hit itself")
  }

  /// A web area whose own frame stays put while its page scrolls, and whose top rows Chrome clips: the descendant about
  /// 40% down the viewport is what moves.
  func testAWebPagesMoveIsSeenOnTheDescendantFortyPercentDown() throws {
    let ax = FakeAX()
    ax.roles = [1: kAXWindowRole, 2: kAXScrollAreaRole, 3: "AXWebArea"]
    ax.parents = [2: 1, 3: 2]
    ax.children = [2: [3], 3: Array(100..<110)]
    ax.frames = [2: CGRect(x: 0, y: 100, width: 400, height: 200), 3: CGRect(x: 0, y: 100, width: 400, height: 200)]
    var offset: CGFloat = 0
    func place() {
      for row in 100..<110 {
        let y = 100 + CGFloat(row - 100) * 20 - offset
        ax.frames[row] = CGRect(x: 0, y: max(y, 100), width: 400, height: y < 100 ? max(0, 20 - (100 - y)) : 20)  // clipped at the top
        ax.roles[row] = kAXStaticTextRole; ax.parents[row] = 3
      }
    }
    place()
    // 60 points down: the top row under the point is clipped and reads no move; row 104, 40% down, moved 60.
    let record = try confirmScroll(hit: el(100), direction: .down, delta: 60, ax: ax.ops, post: { offset = 60; place() })
    XCTAssertEqual(record.outcome, .moved)
    XCTAssertEqual(record.by, "tracked")
    XCTAssertEqual(record.moved, 60)
  }

  /// A nested scroller the tree does not expose as a scroll area (an overflow div): the page's measures stay put, and the
  /// element under the point moves.
  func testANestedScrollersMoveIsSeenOnTheElementUnderThePoint() throws {
    let scene = ScrollScene(offset: 200)
    let ax = scene.ax
    // The tracked row (40% down) is not in the div; the div's text (60) under the point is.
    ax.roles[60] = kAXStaticTextRole; ax.parents[60] = 107
    ax.frames[60] = CGRect(x: 10, y: 250, width: 100, height: 18)
    let record = try confirmScroll(hit: el(60), direction: .down, delta: 120, ax: ax.ops,
                                   post: { ax.frames[60] = CGRect(x: 10, y: 130, width: 100, height: 18) })
    XCTAssertEqual(record.outcome, .moved)
    XCTAssertEqual(record.by, "hit")
    XCTAssertEqual(record.moved, 120)
  }

  func testAHorizontalScrollReadsTheHorizontalBarAndTheXEdges() throws {
    let ax = FakeAX()
    ax.roles = [1: kAXWindowRole, 2: kAXScrollAreaRole, 3: "AXTextArea", 4: kAXScrollBarRole, 5: kAXScrollBarRole]
    ax.parents = [2: 1, 3: 2]
    ax.frames = [2: CGRect(x: 0, y: 0, width: 400, height: 300), 3: CGRect(x: -100, y: 0, width: 1000, height: 300)]
    ax.values = [2: [kAXContentsAttribute: [el(3)] as CFArray, kAXHorizontalScrollBarAttribute: el(4), kAXVerticalScrollBarAttribute: el(5)],
                 4: [kAXValueAttribute: NSNumber(value: 1.0 / 6)], 5: [kAXValueAttribute: NSNumber(value: 1.0)]]
    let record = try confirmScroll(hit: el(3), direction: .right, delta: 120, ax: ax.ops,
                                   post: { ax.frames[3] = CGRect(x: -220, y: 0, width: 1000, height: 300) })
    XCTAssertEqual(record.outcome, .moved)
    XCTAssertEqual(record.moved, 120)
    XCTAssertEqual(record.barBefore ?? 0, 1.0 / 6, accuracy: 1e-9, "the horizontal bar, not the vertical one at its end")
  }
}

// MARK: The posted wheel, unchanged

final class ScrollWheelUnchangedTests: XCTestCase {
  /// The vendor's route: pixel units from an HID-state source, one wheel for a vertical scroll, the point, and the window
  /// in field 51 (91 and 92 are set too, but read back 0 on a scroll-wheel event).
  func testTheWheelIsTheVendorsPixelEventAimedAtItsWindow() throws {
    let target = ClickTarget(point: CGPoint(x: 300, y: 400), windowFrame: CGRect(x: 100, y: 100, width: 500, height: 500), windowID: 77, pid: 1)
    let event = try XCTUnwrap(scrollEvent(.down, delta: 120, at: target))
    XCTAssertEqual(event.type, .scrollWheel)
    XCTAssertEqual(event.location, CGPoint(x: 300, y: 400))
    XCTAssertEqual(event.getIntegerValueField(.scrollWheelEventIsContinuous), 1, "pixel units")
    XCTAssertEqual(event.getIntegerValueField(.scrollWheelEventPointDeltaAxis1), -120)
    XCTAssertEqual(event.getIntegerValueField(.scrollWheelEventPointDeltaAxis2), 0)
    XCTAssertEqual(event.getIntegerValueField(.scrollWheelEventScrollPhase), 0, "no gesture phase")
    XCTAssertEqual(event.getIntegerValueField(.scrollWheelEventMomentumPhase), 0)
    XCTAssertEqual(event.getIntegerValueField(.eventSourceStateID), Int64(CGEventSourceStateID.hidSystemState.rawValue))
    XCTAssertEqual(event.getIntegerValueField(eventField(51)), 77)
  }
}
