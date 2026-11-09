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

  /// The bar at its end before the wheel: success at once, the wheel posted, nothing polled, nothing written.
  func testAtTheEndBeforeTheWheelIsAnsweredAtOnce() throws {
    let scene = ScrollScene(offset: 800, barSettable: true)
    var posted = 0
    let record = try confirmScroll(hit: scene.row(at: 200), direction: .down, delta: 120, ax: scene.ax.ops, post: { posted += 1 })
    XCTAssertEqual(record.outcome, .atEnd)
    XCTAssertEqual(record.wire["atEnd"] as? Bool, true)
    XCTAssertEqual(record.wire["endBefore"] as? Bool, true)
    XCTAssertEqual(try scrollAnswer(record, direction: .down, app: "Fake"),
                   "What is at that point in Fake is already scrolled as far down as it goes.")
    XCTAssertEqual(posted, 1, "the wheel still goes, so an outer scroller can take it")
    XCTAssertEqual(record.polls, 0)
    XCTAssertEqual(scene.ax.clock, 0, "no wait")
    XCTAssertTrue(scene.ax.writes.isEmpty)
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
    // The bar alone at 0, nothing else to tell it (no content read).
    let barOnly = ScrollScene(offset: 0, barSettable: true)
    barOnly.ax.values[2]?[kAXContentsAttribute] = nil
    barOnly.ax.children[2] = [5]
    let top = try confirmScroll(hit: barOnly.row(at: 200), direction: .up, delta: 120, ax: barOnly.ax.ops, post: {})
    XCTAssertEqual(top.outcome, .atEnd)
    XCTAssertTrue(top.endBefore, "told before the wheel, at once")
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
    // Literal times, so the window's 800 ms is pinned: a shorter window misses 760, a longer one sees 840.
    for (late, seen) in [(760.0, true), (840.0, false)] {
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
        XCTAssertLessThan(record.firstMoveMs ?? .infinity, 800 + scrollConfirmIntervalMs)
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
    // The bar near its end too: the end judged after the wheel.
    let scene = ScrollScene(offset: 798.6, barSettable: true)
    let record = try confirmScroll(hit: scene.row(at: 200), direction: .down, delta: 120, ax: scene.ax.ops, post: { scene.place(799) })
    XCTAssertEqual(record.outcome, .atEnd)
    XCTAssertFalse(record.endBefore)
    XCTAssertTrue(scene.ax.writes.isEmpty)
    // The content frame at its end after the wheel while the bar reads half way: no write.
    let frameEnd = ScrollScene(offset: 798.6, barSettable: true)
    frameEnd.ax.values[5]?[kAXValueAttribute] = NSNumber(value: 0.5)
    let framed = try confirmScroll(hit: frameEnd.row(at: 200), direction: .down, delta: 120, ax: frameEnd.ax.ops, post: {
      frameEnd.place(799)
      frameEnd.ax.values[5]?[kAXValueAttribute] = NSNumber(value: 0.5)
    })
    XCTAssertEqual(framed.outcome, .unconfirmed)
    XCTAssertTrue(frameEnd.ax.writes.isEmpty)
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

  /// The nearest boundary of any kind, in one walk: a page scroller below a web area below a scroll area is the page
  /// scroller; a page's own web area defers to the scroll area around it; a web area with none around it is its own.
  func testTheContainerIsTheNearestBoundaryOfAnyKind() {
    let ax = FakeAX()
    ax.roles = [1: kAXWindowRole, 2: kAXScrollAreaRole, 3: "AXWebArea", 4: kAXGroupRole, 5: kAXStaticTextRole]
    ax.parents = [2: 1, 3: 2, 4: 3, 5: 4]
    ax.actions = [4: ["AXScrollDownByPage"]]
    func container() -> String? { scrollContainer(of: el(5), ax: ax.ops).map { "\(FakeAX.id($0.element)) \($0.kind.rawValue)" } }
    XCTAssertEqual(container(), "4 pageScroller", "the nearer page scroller, not the scroll area above it")
    ax.actions = [4: ["AXScrollRightByPage"]]
    XCTAssertEqual(container(), "4 pageScroller", "any page scroll action")
    ax.actions = [:]
    XCTAssertEqual(container(), "2 scrollArea", "a page's own web area defers to its scroll area, which holds the bar")
    ax.actions = [3: ["AXScrollDownByPage"]]
    XCTAssertEqual(container(), "2 scrollArea", "even when the page's web area advertises the page scroll")
    ax.actions = [:]
    ax.roles[2] = kAXGroupRole
    XCTAssertEqual(container(), "3 webArea", "a web area with no scroll area around it (an iframe's document)")
    ax.roles[3] = kAXGroupRole
    XCTAssertNil(container())
    ax.roles[0] = kAXScrollAreaRole; ax.parents[1] = 0  // something above the window answering a scroll area
    XCTAssertNil(container(), "the walk stops at the window")
    ax.roles[5] = kAXScrollAreaRole
    XCTAssertEqual(container(), "5 scrollArea", "the hit itself")
  }

  /// #328's review, P1: a page-scrolling group under the point, inside the outer scroll area whose bar is settable and
  /// not at its end. The group is the container: at its own end the scroll answers atEnd, and without a bar of its own
  /// there is no fallback; the outer bar is never written. An iframe's web area inside the page is the same.
  func testANestedScrollerIsItsOwnContainerAndTheOuterBarIsNeverWritten() throws {
    let scene = ScrollScene(offset: 200, barSettable: true)
    let ax = scene.ax
    ax.roles[70] = kAXGroupRole; ax.roles[71] = kAXScrollBarRole; ax.roles[72] = kAXStaticTextRole
    ax.parents[70] = 3; ax.parents[71] = 70; ax.parents[72] = 70
    ax.children[70] = [72, 71]
    ax.actions[70] = ["AXScrollDownByPage", "AXScrollUpByPage"]
    ax.frames[70] = CGRect(x: 0, y: 150, width: 390, height: 100); ax.frames[72] = CGRect(x: 0, y: 160, width: 100, height: 20)
    ax.values[70] = [kAXVerticalScrollBarAttribute: el(71)]
    ax.values[71] = [kAXValueAttribute: NSNumber(value: 1.0)]
    ax.settable[71] = [kAXValueAttribute]
    let atEnd = try confirmScroll(hit: el(72), direction: .down, delta: 120, ax: ax.ops, post: {})
    XCTAssertEqual(atEnd.container, .pageScroller)
    XCTAssertEqual(atEnd.outcome, .atEnd, "the group's own bar at its end")
    XCTAssertTrue(ax.writes.isEmpty)
    XCTAssertEqual(scene.offset, 200, "the outer content never moved")
    ax.values[70] = [:]
    let barless = try confirmScroll(hit: el(72), direction: .down, delta: 120, ax: ax.ops, post: {})
    XCTAssertEqual(barless.outcome, .unconfirmed, "no bar of its own: no fallback")
    XCTAssertTrue(ax.writes.isEmpty)
    ax.roles[70] = "AXWebArea"; ax.actions[70] = []
    let frame = try confirmScroll(hit: el(72), direction: .down, delta: 120, ax: ax.ops, post: {})
    XCTAssertEqual(frame.container, .webArea, "an iframe's document under a list, not its page's scroll area")
    XCTAssertEqual(frame.outcome, .unconfirmed)
    XCTAssertTrue(ax.writes.isEmpty)
  }

  /// Gate (c): the fallback writes only the bar of the hit's nearest scroller, and only a real AXScrollArea's. A
  /// page-scrolling group with a settable bar of its own under the point: nothing is written, its bar nor the outer one
  /// (round 4's P1: page scrollers take the wheel). An inner AXScrollArea with its own settable bar: its bar is written,
  /// never the outer one. A plain group that clips the hit (an unexposed nested scroller): nothing is written though the
  /// outer bar is settable. Web content: nothing either.
  func testTheFallbackWritesOnlyTheNearestScrollersOwnBar() throws {
    let scene = ScrollScene(offset: 200, barSettable: true)
    let ax = scene.ax
    ax.roles[70] = kAXGroupRole; ax.roles[71] = kAXScrollBarRole; ax.roles[72] = kAXStaticTextRole
    ax.parents[70] = 3; ax.parents[71] = 70; ax.parents[72] = 70
    ax.children[70] = [72, 71]
    ax.actions[70] = ["AXScrollDownByPage"]
    ax.frames[70] = CGRect(x: 0, y: 150, width: 390, height: 100); ax.frames[72] = CGRect(x: 0, y: 160, width: 100, height: 20)
    ax.values[70] = [kAXVerticalScrollBarAttribute: el(71), "AXContentSize": AXValueCreate(.cgSize, [CGSize(width: 390, height: 500)])!]
    ax.values[71] = [kAXValueAttribute: NSNumber(value: 0.5)]
    ax.settable[71] = [kAXValueAttribute]
    let page = try confirmScroll(hit: el(72), direction: .down, delta: 120, ax: ax.ops, post: {})
    XCTAssertEqual(page.container, .pageScroller)
    XCTAssertTrue(ax.writes.isEmpty, "no fallback on a page scroller")
    ax.roles[70] = kAXScrollAreaRole; ax.actions[70] = []
    let own = try confirmScroll(hit: el(72), direction: .down, delta: 120, ax: ax.ops, post: {})
    XCTAssertEqual(own.container, .scrollArea)
    XCTAssertEqual(ax.writes.map(\.id), [71], "the nearest scroll area's own bar")
    XCTAssertEqual(own.barWrite ?? 0, 0.8, accuracy: 1e-9, "0.5 + 120 / (500 - 100)")
    XCTAssertNil(own.fallbackSkipped)
    // A plain group (no page action, no bar) smaller than the outer area, the hit reaching past its top: clipped.
    ax.writes = []
    ax.roles[70] = kAXGroupRole
    ax.values[70] = [:]
    ax.frames[72] = CGRect(x: 0, y: 140, width: 100, height: 20)
    let clipped = try confirmScroll(hit: el(72), direction: .down, delta: 120, ax: ax.ops, post: {})
    XCTAssertEqual(clipped.container, .scrollArea)
    XCTAssertEqual(clipped.fallbackSkipped, .clipped)
    XCTAssertEqual(clipped.wire["fallbackSkipped"] as? String, "clipped")
    XCTAssertEqual(clipped.outcome, .unconfirmed)
    XCTAssertTrue(ax.writes.isEmpty, "the outer bar is never written past a scroller the tree cannot see")
    // The same group holding the hit wholly: the outer area is the nearest scroller as far as the tree tells.
    ax.frames[72] = CGRect(x: 0, y: 160, width: 100, height: 20)
    let held = try confirmScroll(hit: el(72), direction: .down, delta: 120, ax: ax.ops, post: {})
    XCTAssertNil(held.fallbackSkipped)
    XCTAssertEqual(ax.writes.map(\.id), [5])
    // Web content: a page's web area between the hit and the scroll area.
    ax.writes = []
    scene.place(200)
    ax.roles[70] = "AXWebArea"; ax.parents[70] = 2; ax.children[2] = [70, 3, 5]
    let web = try confirmScroll(hit: el(72), direction: .down, delta: 120, ax: ax.ops, post: {})
    XCTAssertEqual(web.container, .scrollArea)
    XCTAssertEqual(web.fallbackSkipped, .web)
    XCTAssertTrue(ax.writes.isEmpty)
  }

  /// #328's review, P2: an overflow div the tree exposes as no boundary, its text under the point clipped at the div's
  /// top. Scrolling down shrinks the text from there: its leading edge stays, its trailing edge moves.
  func testAClippedHitIsSeenByItsTrailingEdge() throws {
    let scene = ScrollScene(offset: 200)
    let ax = scene.ax
    ax.roles[61] = kAXGroupRole; ax.parents[61] = 107  // the div: a plain group, its top at 240
    ax.frames[61] = CGRect(x: 10, y: 240, width: 100, height: 60)
    ax.roles[60] = kAXStaticTextRole; ax.parents[60] = 61
    ax.frames[60] = CGRect(x: 10, y: 240, width: 100, height: 40)  // clipped at the div's top, 240
    let record = try confirmScroll(hit: el(60), direction: .down, delta: 120, ax: ax.ops,
                                   post: { ax.frames[60] = CGRect(x: 10, y: 240, width: 100, height: 10) })
    XCTAssertEqual(record.container, .scrollArea)
    XCTAssertEqual(record.outcome, .moved)
    XCTAssertEqual(record.by, "hit")
    XCTAssertEqual(record.moved, 30)
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
    XCTAssertEqual(record.container, .scrollArea, "the page's web area defers to its scroll area")
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

  /// The re-review's P2: an element that grows, its leading edge not clipped (content appended below the visible rows
  /// while an upward wheel goes unanswered, in a container with no readable bar), is no move: the content's trailing
  /// edge never counts, and the hit's only while pinned at a clipping edge.
  func testAnElementThatOnlyGrowsIsNoMove() throws {
    let scene = ScrollScene(offset: 200)
    let ax = scene.ax
    ax.values[2]?[kAXVerticalScrollBarAttribute] = nil  // no readable end: the poll runs its whole window
    let hit = scene.row(at: 200)
    let record = try confirmScroll(hit: hit, direction: .up, delta: 100, ax: ax.ops, post: {
      ax.frames[3] = CGRect(x: 0, y: -100, width: 390, height: 1100)      // content appended below
      ax.frames[FakeAX.id(hit)] = CGRect(x: 0, y: 200, width: 390, height: 120)  // the row under the point grows
    })
    XCTAssertEqual(record.outcome, .unconfirmed)
    XCTAssertNil(record.moved)
    XCTAssertEqual(scene.offset, 200, "the offset never changed")
  }

  /// The hosted A/B, Catalyst328: UIKit gives every row and label of the table the page actions. The container is the
  /// top of that run (the table), not the label under the point; the table's first row is its content, and it moves
  /// while the tracked row, a reused cell, jumps the other way.
  func testACatalystTablesRunOfPageScrollersIsOneContainerAndItsFirstRowMoves() throws {
    let ax = FakeAX()
    let page = ["AXScrollToVisible", "AXCancel", "AXScrollDownByPage", "AXScrollUpByPage"]
    ax.roles = [1: kAXWindowRole, 2: kAXGroupRole, 3: kAXGroupRole]
    ax.parents = [2: 1, 3: 2]
    ax.children = [1: [2], 2: [3], 3: Array(10..<19)]
    ax.actions = [2: ["AXScrollToVisible", "AXCancel"], 3: page]
    ax.frames = [1: CGRect(x: 420, y: 40, width: 560, height: 420), 2: CGRect(x: 420, y: 40, width: 431, height: 308),
                 3: CGRect(x: 420, y: 40, width: 431, height: 308)]
    for (i, row) in (10..<19).enumerated() {
      let label = row + 10
      ax.roles[row] = kAXGroupRole; ax.roles[label] = kAXStaticTextRole
      ax.parents[row] = 3; ax.parents[label] = row; ax.children[row] = [label]
      ax.actions[row] = page; ax.actions[label] = page + ["AXPress"]
      let frame = CGRect(x: 420, y: 71.6 + CGFloat(i) * 33.9, width: 431, height: 33.9)
      ax.frames[row] = frame; ax.frames[label] = frame
    }
    XCTAssertEqual(scrollContainer(of: el(22), ax: ax.ops).map { FakeAX.id($0.element) }, 3, "the table, not the label")
    let record = try confirmScroll(hit: el(22), direction: .down, delta: 308, ax: ax.ops, post: {
      ax.frames[10] = CGRect(x: 420, y: 21.6, width: 431, height: 33.9)    // the first row, 50 up
      for row in 11..<19 { ax.frames[row]?.origin.y += 187 }               // reused cells jump the other way
    })
    XCTAssertEqual(record.container, .pageScroller)
    XCTAssertEqual(record.outcome, .moved)
    XCTAssertEqual(record.by, "content")
    XCTAssertEqual(record.moved ?? 0, 50, accuracy: 1e-6)
  }

  /// The hosted A/B, System Settings' content pane: the hit's chain holds no container. The deepest scroll area in the
  /// window holding the point is taken (not a sibling, not the outer one), and its fallback writes its own bar.
  func testAHitWithNoContainerTakesTheDeepestScrollAreaUnderThePoint() throws {
    let ax = FakeAX()
    ax.roles = [1: kAXWindowRole, 2: kAXScrollAreaRole, 3: kAXScrollAreaRole, 4: kAXGroupRole, 5: kAXScrollBarRole,
                6: kAXScrollAreaRole, 7: kAXScrollBarRole, 8: kAXGroupRole, 9: kAXStaticTextRole]
    ax.parents = [2: 1, 3: 1, 4: 3, 5: 3, 6: 4, 7: 6, 8: 6, 9: 1]
    ax.children = [1: [2, 3, 9], 3: [4, 5], 4: [6], 6: [8, 7]]
    ax.frames = [1: CGRect(x: 0, y: 0, width: 800, height: 600), 2: CGRect(x: 0, y: 0, width: 200, height: 600),
                 3: CGRect(x: 200, y: 0, width: 600, height: 600), 4: CGRect(x: 200, y: 0, width: 600, height: 600),
                 6: CGRect(x: 220, y: 100, width: 500, height: 400), 8: CGRect(x: 220, y: 100, width: 500, height: 900),
                 9: CGRect(x: 0, y: 0, width: 800, height: 600)]
    ax.values = [3: [kAXVerticalScrollBarAttribute: el(5)], 5: [kAXValueAttribute: NSNumber(value: 0.2)],
                 6: [kAXContentsAttribute: [el(8)] as CFArray, kAXVerticalScrollBarAttribute: el(7)],
                 7: [kAXValueAttribute: NSNumber(value: 0)]]
    ax.settable = [5: [kAXValueAttribute], 7: [kAXValueAttribute]]
    ax.onWrite = { id, _, value in
      if id == 7 { ax.frames[8] = CGRect(x: 220, y: 100 - CGFloat((value as! NSNumber).doubleValue) * 500, width: 500, height: 900) }
    }
    XCTAssertTrue(scrollAreaUnder(CGPoint(x: 400, y: 300), in: el(1), ax: ax.ops).map { FakeAX.id($0) == 6 } ?? false)
    XCTAssertTrue(scrollAreaUnder(CGPoint(x: 100, y: 300), in: el(1), ax: ax.ops).map { FakeAX.id($0) == 2 } ?? false, "the sidebar's")
    XCTAssertTrue(scrollAreaUnder(CGPoint(x: 210, y: 50), in: el(1), ax: ax.ops).map { FakeAX.id($0) == 3 } ?? false,
                  "outside the inner one: the outer one holds the point")
    let record = try confirmScroll(hit: el(9), direction: .down, delta: 120, ax: ax.ops, window: el(1), point: CGPoint(x: 400, y: 300), post: {})
    XCTAssertEqual(record.containerBy, "window")
    XCTAssertEqual(record.wire["containerBy"] as? String, "window")
    XCTAssertEqual(ax.writes.map(\.id), [7], "the inner pane's own bar, never the outer or the sibling")
    XCTAssertEqual(record.outcome, .moved, "the pane moved by the bar write")
    XCTAssertNil(try scrollAnswer(record, direction: .down, app: "Settings"))
  }

  /// The hosted A/B, Settings' sidebar: its outline's frame is the viewport's (clipped, never moving) and its bar reads
  /// 0.976 to 0.986 at its real bottom. The end is told by the bar near its end with the last row inside the viewport:
  /// answered at once, nothing written. With rows still below, it is not the end.
  func testTheEndIsToldWithoutTheBarAtOne() throws {
    let ax = FakeAX()
    ax.roles = [1: kAXWindowRole, 2: kAXScrollAreaRole, 3: "AXOutline", 4: kAXScrollBarRole]
    ax.parents = [2: 1, 3: 2, 4: 2]
    ax.children = [2: [3, 4], 3: Array(10..<20)]
    ax.frames = [2: CGRect(x: 408, y: 138, width: 215, height: 364), 3: CGRect(x: 408, y: 138, width: 215, height: 364)]
    var extent = CGSize(width: 215, height: 1156)
    ax.values = [2: [kAXContentsAttribute: [el(3)] as CFArray, kAXVerticalScrollBarAttribute: el(4), "AXContentSize": AXValueCreate(.cgSize, &extent)!],
                 4: [kAXValueAttribute: NSNumber(value: 0.976)]]
    ax.settable = [4: [kAXValueAttribute]]
    func rows(lastAt y: CGFloat) {
      for (i, row) in (10..<20).enumerated() {
        ax.roles[row] = kAXRowRole; ax.parents[row] = 3
        ax.frames[row] = CGRect(x: 408, y: y - CGFloat(9 - i) * 32, width: 198, height: 32)
      }
    }
    rows(lastAt: 460)  // the last row ends at 492, inside the viewport's 502
    let end = try confirmScroll(hit: el(15), direction: .down, delta: 364, ax: ax.ops, post: {})
    XCTAssertEqual(end.outcome, .atEnd)
    XCTAssertTrue(end.endBefore)
    XCTAssertTrue(ax.writes.isEmpty, "the bar is never written at the real end")
    rows(lastAt: 600)  // more rows below the viewport, the bar short of its end
    ax.values[4] = [kAXValueAttribute: NSNumber(value: 0.9)]
    let notEnd = try confirmScroll(hit: el(15), direction: .down, delta: 364, ax: ax.ops, post: {})
    XCTAssertFalse(notEnd.endBefore)
    XCTAssertEqual(ax.writes.map(\.id), [4], "not the end: the fallback writes")
    // The clipped outline's frame equals the viewport: it never tells the end, bar or no bar.
    ax.writes = []
    ax.values[4] = [kAXValueAttribute: NSNumber(value: 0.5)]
    XCTAssertFalse(try confirmScroll(hit: el(15), direction: .down, delta: 364, ax: ax.ops, post: {}).endBefore)
    rows(lastAt: 460)  // the last row inside the viewport, the bar half way: a lazily filled list, not the end
    ax.values[4] = [kAXValueAttribute: NSNumber(value: 0.5)]  // the write above left its value
    XCTAssertFalse(try confirmScroll(hit: el(15), direction: .down, delta: 364, ax: ax.ops, post: {}).endBefore)
    rows(lastAt: 600)
    ax.values[2]?[kAXVerticalScrollBarAttribute] = nil
    XCTAssertFalse(try confirmScroll(hit: el(15), direction: .down, delta: 364, ax: ax.ops, post: {}).endBefore)
  }

  /// A content frame that scrolls (longer than the viewport) whose edge has reached the viewport's tells the end with no
  /// bar at all: its bottom scrolling down, its top scrolling up.
  func testAScrollingContentFrameAtTheViewportsEdgeIsTheEnd() throws {
    for (offset, direction, end) in [(CGFloat(800), ScrollDirection.down, true), (799, .down, true), (797, .down, false),
                                     (0, .up, true), (3, .up, false)] {
      let scene = ScrollScene(offset: offset)
      scene.ax.values[2]?[kAXVerticalScrollBarAttribute] = nil
      let record = try confirmScroll(hit: scene.row(at: 200), direction: direction, delta: 120, ax: scene.ax.ops, post: {})
      XCTAssertEqual(record.endBefore, end, "\(direction) at \(offset)")
    }
  }

  /// The tracked descendant's walk stops at the first candidate in the middle band of the viewport, and reads at most
  /// `scrollTrackedBudget` (200) nodes.
  func testTheTrackedWalkStopsInTheBandAndWithinItsBudget() {
    let ax = FakeAX()
    ax.roles = [2: kAXScrollAreaRole]
    ax.frames = [2: CGRect(x: 0, y: 0, width: 400, height: 1000)]
    ax.children = [2: Array(100..<500)]
    for row in 100..<500 { ax.roles[row] = kAXRowRole; ax.frames[row] = CGRect(x: 0, y: CGFloat(row - 100) * 10, width: 400, height: 10) }
    let banded = trackedDescendant(of: el(2), viewport: ax.frames[2]!, horizontal: false, ax: ax.ops)
    XCTAssertEqual(banded.element.map(FakeAX.id), 125, "the first row whose top is 25% in")
    XCTAssertEqual(banded.walked, 27, "the area and the rows up to it")
    for row in 100..<500 { ax.frames[row] = CGRect(x: 0, y: 900 + CGFloat(row - 100) * 0.2, width: 400, height: 4) }  // none in the band
    let capped = trackedDescendant(of: el(2), viewport: ax.frames[2]!, horizontal: false, ax: ax.ops)
    XCTAssertEqual(capped.walked, 200, "the budget")
    XCTAssertNotNil(capped.element, "the nearest seen still tracked")
  }

  // MARK: Round 4 (the review of 8b5d314f..ca835ff4)

  /// P1: a deeper scroll area whose frame is empty is passed through, never selected; the visible one holding the point
  /// is, and only its bar is written.
  func testTheWindowScanNeverSelectsAnEmptyFramedScrollArea() throws {
    let ax = FakeAX()
    ax.roles = [1: kAXWindowRole, 2: kAXScrollAreaRole, 3: kAXGroupRole, 4: kAXScrollAreaRole, 5: kAXScrollBarRole,
                6: kAXScrollBarRole, 7: kAXGroupRole, 9: kAXStaticTextRole]
    ax.parents = [2: 1, 3: 2, 4: 3, 5: 4, 6: 2, 7: 2, 9: 1]
    ax.children = [1: [2, 9], 2: [7, 3, 6], 3: [4], 4: [5]]
    ax.frames = [1: CGRect(x: 0, y: 0, width: 800, height: 600), 2: CGRect(x: 200, y: 100, width: 500, height: 400),
                 3: .zero, 4: .zero, 7: CGRect(x: 200, y: 100, width: 500, height: 900), 9: CGRect(x: 0, y: 0, width: 800, height: 600)]
    ax.values = [2: [kAXContentsAttribute: [el(7)] as CFArray, kAXVerticalScrollBarAttribute: el(6)], 6: [kAXValueAttribute: NSNumber(value: 0)],
                 4: [kAXVerticalScrollBarAttribute: el(5)], 5: [kAXValueAttribute: NSNumber(value: 0)]]
    ax.settable = [5: [kAXValueAttribute], 6: [kAXValueAttribute]]
    XCTAssertEqual(scrollAreaUnder(CGPoint(x: 400, y: 300), in: el(1), ax: ax.ops).map(FakeAX.id), 2)
    _ = try confirmScroll(hit: el(9), direction: .down, delta: 120, ax: ax.ops, window: el(1), point: CGPoint(x: 400, y: 300), post: {})
    XCTAssertEqual(ax.writes.map(\.id), [6], "the visible area's bar, never the empty one's")
  }

  /// The window scan skips subtrees whose frame does not hold the point, so a large one elsewhere (a sidebar's 3,000
  /// rows) does not spend its budget before the scroll area under the point.
  func testTheWindowScanSkipsSubtreesOffThePoint() {
    let ax = FakeAX()
    ax.roles = [1: kAXWindowRole, 2: kAXGroupRole, 3: kAXScrollAreaRole]
    ax.children = [1: [2, 3], 2: Array(1000..<4000)]
    ax.frames = [1: CGRect(x: 0, y: 0, width: 800, height: 600), 2: CGRect(x: 0, y: 0, width: 200, height: 600),
                 3: CGRect(x: 200, y: 0, width: 600, height: 600)]
    for row in 1000..<4000 { ax.roles[row] = kAXRowRole; ax.frames[row] = CGRect(x: 0, y: 0, width: 200, height: 20) }
    XCTAssertEqual(scrollAreaUnder(CGPoint(x: 400, y: 300), in: el(1), ax: ax.ops).map(FakeAX.id), 3)
  }

  /// P1: two genuinely nested page-scrolling groups, each with a bar of its own. The run stops at the inner one, whose
  /// bar at its end answers atEnd; the outer bar (0.25) is never written.
  func testNestedPageScrollersWithBarsOfTheirOwnAreNotMerged() throws {
    let ax = FakeAX()
    let page = ["AXScrollDownByPage", "AXScrollUpByPage"]
    ax.roles = [1: kAXWindowRole, 2: kAXGroupRole, 3: kAXScrollBarRole, 4: kAXGroupRole, 5: kAXScrollBarRole, 6: kAXStaticTextRole]
    ax.parents = [2: 1, 3: 2, 4: 2, 5: 4, 6: 4]
    ax.children = [2: [4, 3], 4: [6, 5]]
    ax.actions = [2: page, 4: page, 6: page]
    ax.frames = [2: CGRect(x: 0, y: 0, width: 400, height: 400), 4: CGRect(x: 0, y: 100, width: 400, height: 200),
                 6: CGRect(x: 10, y: 150, width: 100, height: 20)]
    ax.values = [2: [kAXVerticalScrollBarAttribute: el(3)], 3: [kAXValueAttribute: NSNumber(value: 0.25)],
                 4: [kAXVerticalScrollBarAttribute: el(5)], 5: [kAXValueAttribute: NSNumber(value: 1)]]
    ax.settable = [3: [kAXValueAttribute], 5: [kAXValueAttribute]]
    XCTAssertEqual(scrollContainer(of: el(6), ax: ax.ops).map { FakeAX.id($0.element) }, 4, "the inner group, not the outer")
    let record = try confirmScroll(hit: el(6), direction: .down, delta: 120, ax: ax.ops, post: {})
    XCTAssertEqual(record.outcome, .atEnd)
    XCTAssertTrue(ax.writes.isEmpty)
  }

  /// P2: the bar near its end tells the end only with the edge child wholly inside the viewport, never past a document
  /// frame that runs on, and only within 0.03 (a virtualized list's bar at 0.96 had 32 points to go).
  func testTheBarNearItsEndNeedsTheEdgeChildWhollyInside() {
    // A clipped outline (frame = viewport) of exposed rows; the last one reported clipped at the viewport's bottom.
    let ax = FakeAX()
    ax.roles = [2: kAXScrollAreaRole, 3: "AXOutline", 4: kAXScrollBarRole]
    ax.parents = [3: 2, 4: 2]
    ax.children = [2: [3, 4], 3: Array(10..<20)]
    ax.frames = [2: CGRect(x: 0, y: 100, width: 300, height: 400), 3: CGRect(x: 0, y: 100, width: 300, height: 400)]
    var extent = CGSize(width: 300, height: 1200)
    ax.values = [2: [kAXContentsAttribute: [el(3)] as CFArray, kAXVerticalScrollBarAttribute: el(4), "AXContentSize": AXValueCreate(.cgSize, &extent)!],
                 4: [kAXValueAttribute: NSNumber(value: 0.96)]]
    for (i, row) in (10..<20).enumerated() { ax.roles[row] = kAXRowRole; ax.frames[row] = CGRect(x: 0, y: 180 + CGFloat(i) * 32, width: 300, height: 32) }
    ax.frames[19] = CGRect(x: 0, y: 468, width: 300, height: 32)  // clipped at 500 as reported
    func atEnd(_ direction: ScrollDirection) -> Bool {
      let geometry = scrollGeometry(el(2), kind: .scrollArea, hit: nil, horizontal: false, ax: ax.ops, towardEnd: scrollSign(direction) > 0)
      return scrollAtEnd(readScroll(geometry, ax: ax.ops), direction: direction, geometry: geometry)
    }
    XCTAssertFalse(atEnd(.down), "0.96 is not near enough")
    ax.values[4] = [kAXValueAttribute: NSNumber(value: 0.98)]
    XCTAssertTrue(atEnd(.down), "0.98 with the last row inside: the sidebar's end")
    // Scrolling up: the bar near 0, the first row's top inside but its bottom past the viewport's: not wholly inside.
    ax.values[4] = [kAXValueAttribute: NSNumber(value: 0.02)]
    ax.frames[10] = CGRect(x: 0, y: 100, width: 300, height: 450)
    XCTAssertFalse(atEnd(.up))
    // A document frame that runs 50 points past the viewport's bottom: never overridden by an edge child inside.
    ax.values[4] = [kAXValueAttribute: NSNumber(value: 0.98)]
    ax.frames[3] = CGRect(x: 0, y: -600, width: 300, height: 1150)
    XCTAssertFalse(atEnd(.down))
  }

  /// The final hosted pass (run 42546633581): the sidebar's real bottom reads 0.976 with its last row clipped, so the
  /// strict rule does not call it the end before the wheel. The wheel goes and nothing moves: the end is judged after
  /// the window, success with atEnd and no write. A bar at 0.98 is never written. A virtualized list at 0.96 that the
  /// wheel moves answers moved. A bar that crosses into the near-end band by less than half a point is not written.
  func testTheEndIsJudgedAfterTheWheelWhenTheBarSitsNearItsEnd() throws {
    let ax = FakeAX()
    ax.roles = [1: kAXWindowRole, 2: kAXScrollAreaRole, 3: "AXOutline", 4: kAXScrollBarRole]
    ax.parents = [2: 1, 3: 2, 4: 2]
    ax.children = [2: [3, 4], 3: Array(10..<20)]
    ax.frames = [2: CGRect(x: 408, y: 138, width: 215, height: 364), 3: CGRect(x: 408, y: 138, width: 215, height: 364)]
    var extent = CGSize(width: 215, height: 1156)
    ax.values = [2: [kAXContentsAttribute: [el(3)] as CFArray, kAXVerticalScrollBarAttribute: el(4), "AXContentSize": AXValueCreate(.cgSize, &extent)!],
                 4: [kAXValueAttribute: NSNumber(value: 0.976)]]
    ax.settable = [4: [kAXValueAttribute]]
    func rows(lastAt y: CGFloat) {
      for (i, row) in (10..<20).enumerated() {
        ax.roles[row] = kAXRowRole; ax.parents[row] = 3
        ax.frames[row] = CGRect(x: 408, y: y - CGFloat(9 - i) * 32, width: 198, height: 32)
      }
    }
    rows(lastAt: 480)  // the last row ends at 512, past the viewport's 502: not wholly inside
    let sidebar = try confirmScroll(hit: el(15), direction: .down, delta: 364, ax: ax.ops, post: {})
    XCTAssertEqual(sidebar.outcome, .atEnd)
    XCTAssertFalse(sidebar.endBefore)
    XCTAssertGreaterThanOrEqual(ax.clock, scrollConfirmWindowMs, "judged after the window")
    XCTAssertTrue(ax.writes.isEmpty)
    XCTAssertEqual(try scrollAnswer(sidebar, direction: .down, app: "Settings"),
                   "What is at that point in Settings is already scrolled as far down as it goes.")
    ax.values[4] = [kAXValueAttribute: NSNumber(value: 0.98)]
    _ = try confirmScroll(hit: el(15), direction: .down, delta: 364, ax: ax.ops, post: {})
    XCTAssertTrue(ax.writes.isEmpty, "a bar at 0.98 is never written")
    // A virtualized list at 0.96 with 32 points left, which the wheel moves: moved.
    ax.values[4] = [kAXValueAttribute: NSNumber(value: 0.96)]
    let moved = try confirmScroll(hit: el(15), direction: .down, delta: 364, ax: ax.ops, post: { rows(lastAt: 448) })
    XCTAssertEqual(moved.outcome, .moved)
    // The bar crossing into the band by under half a point, nothing else moving: not the end, and still not written.
    ax.values[4] = [kAXValueAttribute: NSNumber(value: 0.9699)]
    rows(lastAt: 600)
    let crossed = try confirmScroll(hit: el(15), direction: .down, delta: 364, ax: ax.ops, post: {
      ax.values[4] = [kAXValueAttribute: NSNumber(value: 0.9701)]
    })
    XCTAssertEqual(crossed.outcome, .unconfirmed)
    XCTAssertTrue(ax.writes.isEmpty, "the fallback never writes a bar near its end")
  }

  /// Round 6's P2: a surface that ignores the wheel at offset 784 of 800, bar 0.98: its content frame shows 16 points
  /// left beyond the viewport, so the end judged after the wheel does not apply; unconfirmed, and nothing written.
  func testTheEndAfterTheWheelYieldsToADocumentRunningOn() throws {
    let scene = ScrollScene(offset: 784, barSettable: true)
    XCTAssertEqual((scene.ax.values[5]?[kAXValueAttribute] as? NSNumber)?.doubleValue ?? 0, 0.98, accuracy: 1e-9)
    let record = try confirmScroll(hit: scene.row(at: 200), direction: .down, delta: 120, ax: scene.ax.ops, post: {})
    XCTAssertEqual(record.outcome, .unconfirmed)
    XCTAssertTrue(scene.ax.writes.isEmpty, "the bar near its end is still never written")
  }

  /// P2: a page scroller's first child is a movement probe only: a first row taller than the viewport is neither the
  /// document's extent for the conversion nor its end.
  func testAPageScrollersFirstChildIsNoExtent() throws {
    let ax = FakeAX()
    let page = ["AXScrollDownByPage", "AXScrollUpByPage"]
    ax.roles = [1: kAXWindowRole, 2: kAXGroupRole, 3: kAXGroupRole, 4: kAXStaticTextRole]
    ax.parents = [2: 1, 3: 2, 4: 3]
    ax.children = [2: [3], 3: [4]]
    ax.actions = [2: page, 3: page, 4: page]
    ax.actions[2] = page; ax.roles[1] = kAXWindowRole
    ax.frames = [2: CGRect(x: 0, y: 40, width: 400, height: 308), 3: CGRect(x: 0, y: 40, width: 400, height: 500),
                 4: CGRect(x: 0, y: 40, width: 400, height: 500)]
    let geometry = scrollGeometry(el(2), kind: .pageScroller, hit: nil, horizontal: false, ax: ax.ops, towardEnd: false)
    XCTAssertNil(geometry.scrollableLength, "no extent, so no conversion")
    XCTAssertFalse(scrollAtEnd(readScroll(geometry, ax: ax.ops), direction: .up, geometry: geometry), "no geometric end")
    ax.parents[2] = 1
    let record = try confirmScroll(hit: el(4), direction: .up, delta: 120, ax: ax.ops, post: {})
    XCTAssertFalse(record.endBefore)
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
