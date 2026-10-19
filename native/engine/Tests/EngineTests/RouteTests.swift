import AppKit
import CoreGraphics
import Foundation
import XCTest
@testable import Engine

// M1a's input routes (the spec's Design, "Input", "Keys", "Text"; Interfaces, input results and errors): the clicks'
// ladder 1 → 3 with the descendant hit-test gate, route 2′ for keys, route 3's guard refusing as activationFailed with
// the click's events never posted, the activation click skipped outside the window's frame, the screen-update hold's
// cap, and the forbidden list on the target's owning process. Everything runs over synthetic data and recorded seams:
// nothing here posts, activates, holds the screen or reads another process.

// MARK: The route choice

final class ElementClickPlanTests: XCTestCase {
  private func plan(forced: InputRoute? = nil, button: MouseButton = .left, count: Int = 1, role: String = "AXButton",
                    actions: [String], descendant: Bool = false, gateCalls: UnsafeMutablePointer<Int>? = nil) throws -> ElementClickPlan {
    try elementClickPlan(forced: forced, button: button, count: count, role: role, actions: actions) {
      gateCalls?.pointee += 1
      return descendant
    }
  }

  func testAPlainClickOnAnAdvertisingElementTakesItsAction() throws {
    XCTAssertEqual(try plan(actions: ["AXShowMenu", "AXPress"]), .action("AXPress"))
    XCTAssertEqual(try plan(actions: ["AXPress", "AXPick"]), .action("AXPick"), "AXPick before AXPress (F §5.1)")
  }

  func testTheGateSendsAClickWhosePointLandsOnADescendantToRouteThree() throws {
    XCTAssertEqual(try plan(actions: ["AXPress"], descendant: true), .synthesized(.activation))
  }

  func testEverySynthesizedClickGoesByRouteThreeAndTheGateRunsOnlyForARouteOneCandidate() throws {
    var calls = 0
    // No advertised action: the TextEdit document's text area and a Finder row's cell (the second sitting).
    XCTAssertEqual(try plan(role: "AXTextArea", actions: ["AXShowMenu", "AXScrollToVisible"], gateCalls: &calls), .synthesized(.activation))
    // Right clicks and multi-clicks are synthesized whatever the element advertises (AXShowMenu is never used).
    XCTAssertEqual(try plan(button: .right, actions: ["AXPress", "AXShowMenu"], gateCalls: &calls), .synthesized(.activation))
    XCTAssertEqual(try plan(count: 2, actions: ["AXPress"], gateCalls: &calls), .synthesized(.activation))
    XCTAssertEqual(try plan(button: .middle, actions: ["AXPress"], gateCalls: &calls), .synthesized(.activation))
    XCTAssertEqual(try plan(button: .right, role: "AXMenuBarItem", actions: ["AXPress"], gateCalls: &calls), .synthesized(.activation))
    XCTAssertEqual(calls, 0, "the hit-test is taken only for a click route 1 could carry")
    _ = try plan(actions: ["AXPress"], gateCalls: &calls)
    XCTAssertEqual(calls, 1)
  }

  /// The decompiled click shows no role-gated activation before a menu-bar press: a menu-bar item is an element like any.
  func testAMenuBarItemTakesPlainRouteOneOrRouteThreeLikeAnyElement() throws {
    XCTAssertEqual(try plan(role: "AXMenuBarItem", actions: ["AXPress", "AXCancel"]), .action("AXPress"))
    XCTAssertEqual(try plan(role: "AXMenuBarItem", actions: []), .synthesized(.activation))
    XCTAssertEqual(try plan(role: "AXMenuBarItem", actions: ["AXPress"], descendant: true), .synthesized(.activation))
  }

  func testNoDefaultChoiceIsEverRouteTwoOrTwoPrime() throws {
    for button in [MouseButton.left, .right, .middle] {
      for count in [1, 2, 3] {
        for actions in [[], ["AXPress"], ["AXPick"], ["AXShowMenu"]] {
          for role in ["AXButton", "AXMenuBarItem", "AXRow"] {
            for descendant in [false, true] {
              let chosen = try plan(button: button, count: count, role: role, actions: actions, descendant: descendant)
              XCTAssertNotEqual(chosen, .synthesized(.commandPost))
              XCTAssertNotEqual(chosen, .synthesized(.plainPost))
            }
          }
        }
      }
    }
    XCTAssertEqual(coordinateClickRoute(forced: nil), .activation, "every coordinate click goes by route 3")
  }

  func testAForcedRouteIsTheSpikesAndSkipsTheGate() throws {
    var calls = 0
    XCTAssertEqual(try plan(forced: .commandPost, actions: ["AXPress"], gateCalls: &calls), .synthesized(.commandPost))
    XCTAssertEqual(try plan(forced: .plainPost, actions: ["AXPress"], gateCalls: &calls), .synthesized(.plainPost))
    XCTAssertEqual(try plan(forced: .activation, actions: ["AXPress"], gateCalls: &calls), .synthesized(.activation))
    XCTAssertEqual(try plan(forced: .action, actions: ["AXPress"], descendant: true, gateCalls: &calls), .action("AXPress"))
    XCTAssertEqual(calls, 0)
    XCTAssertThrowsError(try plan(forced: .action, actions: ["AXShowMenu"])) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "invalidArguments")
    }
    XCTAssertEqual(coordinateClickRoute(forced: .commandPost), .commandPost)
    XCTAssertEqual(coordinateClickRoute(forced: .plainPost), .plainPost)
  }
}

// MARK: The descendant hit-test gate

final class DescendantGateTests: XCTestCase {
  /// A synthetic tree by parent: 1 the window, 2 a web area under it, 3 a link inside the web area, 4 its text, 5 a
  /// sibling button of the web area.
  private let parents: [Int: Int] = [2: 1, 3: 2, 4: 3, 5: 1]
  private func lands(_ hit: Int?, on target: Int, parents: [Int: Int]? = nil) -> Bool {
    let table = parents ?? self.parents
    return landsOnStrictDescendant(hit, of: target, parent: { table[$0] }, same: { $0 == $1 })
  }

  func testAPointOnAStrictDescendantSendsTheClickToSynthesis() {
    XCTAssertTrue(lands(3, on: 2), "a child")
    XCTAssertTrue(lands(4, on: 2), "a grandchild")
  }

  func testAPointOnTheElementItselfOrOutsideItsSubtreeKeepsTheAction() {
    XCTAssertFalse(lands(2, on: 2), "the control itself: not strict")
    XCTAssertFalse(lands(5, on: 2), "a sibling")
    XCTAssertFalse(lands(1, on: 2), "an ancestor")
    XCTAssertFalse(lands(nil, on: 2), "no hit")
  }

  func testTheWalkIsBoundedOnACycle() {
    XCTAssertFalse(lands(7, on: 2, parents: [7: 8, 8: 7]))
    // 300 levels, the vendor's cap: a target 301 parents up is not found.
    var deep: [Int: Int] = [:]
    for level in 0..<400 { deep[level] = level + 1 }
    XCTAssertTrue(lands(0, on: 300, parents: deep))
    XCTAssertFalse(lands(0, on: 301, parents: deep))
  }
}

// MARK: The visible frame

final class VisibleFrameTests: XCTestCase {
  /// A synthetic element: its role, frame, parent and actions.
  private struct Node {
    let role: String
    let frame: CGRect?
    let parent: Int?
    var actions: [String] = []
  }

  private func visible(_ id: Int, in nodes: [Int: Node]) -> CGRect? {
    visibleFrame(of: id, frame: { nodes[$0]?.frame }, role: { nodes[$0]?.role }, parent: { nodes[$0]?.parent },
                 actions: { nodes[$0]?.actions ?? [] })
  }

  /// Finder's list as the real tree has it (spike/iter1-input/cua/run-1/goldens/finder.action.after-diff.skyshot.json:
  /// the AXScrollArea at y 313, the AXOutline's rows from y 340): a window, a scroll area whose frame includes the column
  /// header's band (100–127 here), the header, the outline scrolled up, and rows at their content positions.
  private let finder: [Int: Node] = [
    0: Node(role: "AXApplication", frame: nil, parent: nil),
    1: Node(role: "AXWindow", frame: CGRect(x: 0, y: 0, width: 800, height: 600), parent: 0),
    2: Node(role: "AXScrollArea", frame: CGRect(x: 0, y: 100, width: 800, height: 300), parent: 1),
    3: Node(role: "AXOutline", frame: CGRect(x: 0, y: -900, width: 800, height: 4000), parent: 2),
    4: Node(role: "AXRow", frame: CGRect(x: 0, y: 200, width: 800, height: 20), parent: 3),
    5: Node(role: "AXRow", frame: CGRect(x: 0, y: 60, width: 800, height: 20), parent: 3),     // above the scroll area
    6: Node(role: "AXRow", frame: CGRect(x: 0, y: 390, width: 800, height: 20), parent: 3),    // half shown
    7: Node(role: "AXRow", frame: CGRect(x: 0, y: 105, width: 800, height: 20), parent: 3),    // under the header, inside the scroll area
    8: Node(role: "AXGroup", frame: CGRect(x: 0, y: 100, width: 800, height: 27), parent: 2),   // the column header
    9: Node(role: "AXCell", frame: CGRect(x: 0, y: 200, width: 400, height: 20), parent: 4),
  ]

  func testARowScrolledOutOfItsListIsNotVisibleThoughItLiesInsideTheWindow() {
    XCTAssertEqual(visible(4, in: finder), CGRect(x: 0, y: 200, width: 800, height: 20))
    XCTAssertNil(visible(5, in: finder), "outside the scroll area: refused by the walk")
    XCTAssertEqual(visible(6, in: finder), CGRect(x: 0, y: 390, width: 800, height: 10))
    XCTAssertNil(clickablePoint(frame: visible(5, in: finder), visibleIn: finder[1]!.frame))
  }

  /// The header band lies inside the scroll area's frame, so the walk keeps a row scrolled under it; the hit-test at
  /// the chosen point, which answers the header, refuses it.
  func testARowUnderTheColumnHeaderIsRefusedByTheHitTest() {
    XCTAssertEqual(visible(7, in: finder), CGRect(x: 0, y: 105, width: 800, height: 20), "the frame walk cannot see the header")
    let reaches = { (hit: Int?, target: Int) in
      hitReachesElement(hit, of: target, parent: { self.finder[$0]?.parent }, same: { $0 == $1 })
    }
    XCTAssertFalse(reaches(8, 7), "the header answers: refused, never clicked through")
    XCTAssertTrue(reaches(4, 4), "the row itself")
    XCTAssertTrue(reaches(9, 4), "a cell inside the row")
    XCTAssertFalse(reaches(3, 4), "its outline, an ancestor")
    XCTAssertFalse(reaches(nil, 4), "no answer")
  }

  func testWebContentScrolledOutOfThePageIsNotVisible() {
    // Chrome: the window, the web area's viewport below the tab strip, a link scrolled above it.
    let chrome: [Int: Node] = [
      1: Node(role: "AXWindow", frame: CGRect(x: 80, y: 60, width: 1000, height: 760), parent: nil),
      2: Node(role: "AXGroup", frame: CGRect(x: 80, y: 60, width: 1000, height: 760), parent: 1),
      3: Node(role: "AXWebArea", frame: CGRect(x: 80, y: 140, width: 1000, height: 680), parent: 2),
      4: Node(role: "AXGroup", frame: CGRect(x: 80, y: -400, width: 1000, height: 3000), parent: 3),
      5: Node(role: "AXLink", frame: CGRect(x: 100, y: 90, width: 60, height: 20), parent: 4),
      6: Node(role: "AXLink", frame: CGRect(x: 100, y: 300, width: 60, height: 20), parent: 4),
    ]
    XCTAssertNil(visible(5, in: chrome), "inside the window, under the tab strip: not visible")
    XCTAssertEqual(visible(6, in: chrome), CGRect(x: 100, y: 300, width: 60, height: 20))
  }

  func testAGroupClipsOnlyWhenItScrollsByThePage() {
    var nodes: [Int: Node] = [
      1: Node(role: "AXWindow", frame: CGRect(x: 0, y: 0, width: 800, height: 600), parent: nil),
      2: Node(role: "AXGroup", frame: CGRect(x: 0, y: 0, width: 800, height: 100), parent: 1),
      3: Node(role: "AXButton", frame: CGRect(x: 10, y: 200, width: 50, height: 20), parent: 2),
    ]
    XCTAssertEqual(visible(3, in: nodes), CGRect(x: 10, y: 200, width: 50, height: 20), "a plain group does not clip")
    nodes[2]!.actions = ["AXScrollDownByPage"]
    XCTAssertNil(visible(3, in: nodes), "a page-scrolling group does (the vendor's FUN_10078e9b8)")
  }

  func testTheWalkStopsAtTheWindowSheetMenuOrPopover() {
    // A sheet over its window: the sheet clips and ends the walk, so the window's frame is never read.
    let nodes: [Int: Node] = [
      1: Node(role: "AXWindow", frame: CGRect(x: 0, y: 0, width: 10, height: 10), parent: nil),
      2: Node(role: "AXSheet", frame: CGRect(x: 100, y: 100, width: 400, height: 300), parent: 1),
      3: Node(role: "AXButton", frame: CGRect(x: 420, y: 360, width: 70, height: 30), parent: 2),
    ]
    XCTAssertEqual(visible(3, in: nodes), CGRect(x: 420, y: 360, width: 70, height: 30))
  }

  func testAMenuBarItemKeepsItsWholeFrame() {
    // TextEdit's File item: its ancestors are the menu bar and the application, and its frame lies outside every window.
    let nodes: [Int: Node] = [
      0: Node(role: "AXApplication", frame: nil, parent: nil),
      1: Node(role: "AXMenuBar", frame: CGRect(x: 0, y: 0, width: 1512, height: 30), parent: 0),
      2: Node(role: "AXMenuBarItem", frame: CGRect(x: 116, y: 0, width: 42, height: 30), parent: 1),
    ]
    XCTAssertEqual(visible(2, in: nodes), CGRect(x: 116, y: 0, width: 42, height: 30))
    XCTAssertEqual(clickablePoint(frame: visible(2, in: nodes), visibleIn: nil), CGPoint(x: 137, y: 15), "no window of its own to cut by")
  }

  func testNoFrameNoPointAndOnlyAFramelessClippingAncestorRefuses() {
    XCTAssertNil(visible(9, in: [9: Node(role: "AXButton", frame: nil, parent: nil)]), "a frame that cannot be read now is refused")
    for role in ["AXScrollArea", "AXWebArea", "AXWindow", "AXSheet", "AXMenu", "AXPopover"] {
      let nodes: [Int: Node] = [
        1: Node(role: role, frame: nil, parent: nil),
        2: Node(role: "AXButton", frame: CGRect(x: 1, y: 1, width: 10, height: 10), parent: 1),
      ]
      XCTAssertNil(visible(2, in: nodes), "a \(role) whose frame cannot be read: nothing known to show (the vendor's nil)")
    }
    let scrolling: [Int: Node] = [
      1: Node(role: "AXGroup", frame: nil, parent: nil, actions: ["AXScrollUpByPage"]),
      2: Node(role: "AXButton", frame: CGRect(x: 1, y: 1, width: 10, height: 10), parent: 1),
    ]
    XCTAssertNil(visible(2, in: scrolling), "a page-scrolling group clips, so its missing frame refuses too")
    let plain: [Int: Node] = [
      1: Node(role: "AXGroup", frame: nil, parent: nil),
      2: Node(role: "AXButton", frame: CGRect(x: 1, y: 1, width: 10, height: 10), parent: 1),
    ]
    XCTAssertEqual(visible(2, in: plain), CGRect(x: 1, y: 1, width: 10, height: 10), "a non-clipping role without a frame does not clip")
  }
}

// MARK: Points

final class ClickPointTests: XCTestCase {
  func testTheClickablePointIsTheMidpointOfTheVisiblePart() {
    let window = CGRect(x: 100, y: 100, width: 400, height: 300)
    XCTAssertEqual(clickablePoint(frame: CGRect(x: 150, y: 150, width: 100, height: 40), visibleIn: window), CGPoint(x: 200, y: 170))
    // Cut by the window's bottom edge: the midpoint of what shows.
    XCTAssertEqual(clickablePoint(frame: CGRect(x: 150, y: 380, width: 100, height: 40), visibleIn: window), CGPoint(x: 200, y: 390))
    XCTAssertNil(clickablePoint(frame: CGRect(x: 150, y: 450, width: 100, height: 40), visibleIn: window), "wholly outside")
    XCTAssertNil(clickablePoint(frame: CGRect(x: 150, y: 150, width: 0, height: 40), visibleIn: window), "no area")
    XCTAssertNil(clickablePoint(frame: nil, visibleIn: window))
    XCTAssertEqual(clickablePoint(frame: CGRect(x: 0, y: 0, width: 10, height: 10), visibleIn: nil), CGPoint(x: 5, y: 5), "no window frame to cut by")
  }

  func testTheActivationClickIsSkippedOutsideTheWindowsFrame() {
    // The second sitting's readings (U13): TextEdit's point 16 points below the top edge, inside; Chrome's at the
    // screen's bottom-left corner, outside its frame.
    let textEdit = CGRect(x: 80, y: 60, width: 610, height: 860)
    XCTAssertEqual(activationClickPoint(CGPoint(x: 110, y: 76), windowFrame: textEdit), CGPoint(x: 110, y: 76))
    let chrome = CGRect(x: 80, y: 60, width: 1000, height: 760)
    XCTAssertNil(activationClickPoint(CGPoint(x: -1, y: 1441), windowFrame: chrome))
    XCTAssertNil(activationClickPoint(CGPoint(x: 1080, y: 400), windowFrame: chrome), "the far edge is outside")
    XCTAssertNil(activationClickPoint(nil, windowFrame: chrome), "the attribute unsupported")
    XCTAssertNil(activationClickPoint(CGPoint(x: 110, y: 76), windowFrame: nil), "no frame to place it in")
  }
}

// MARK: Route 3's activation and its guard

final class ActivationGuardTests: XCTestCase {
  private let target: pid_t = 990_001, user: pid_t = 990_002, other: pid_t = 990_003
  private let frame = CGRect(x: 80, y: 60, width: 610, height: 860)

  private func activation(_ seam: GuardSeam, activationPoint: CGPoint? = nil) -> FakeActivation {
    seam.activationPoint = activationPoint
    return FakeActivation(pid: target, window: AXUIElementCreateApplication(target), windowFrame: frame, windowID: 41,
                          system: seam.system)
  }

  func testTheActivationClickIsPostedOnlyInsideTheWindowsFrame() throws {
    let inside = GuardSeam(frontmost: user)
    try activation(inside, activationPoint: CGPoint(x: 110, y: 76)).activate()
    XCTAssertEqual(inside.posts.map(\.kind), [.appKit(1), .mouse(.leftMouseDown), .mouse(.leftMouseUp)])
    XCTAssertEqual(inside.posts.map(\.pid), [target, target, target])

    let outside = GuardSeam(frontmost: user)
    try activation(outside, activationPoint: CGPoint(x: -1, y: 1441)).activate()
    XCTAssertEqual(outside.posts.map(\.kind), [.appKit(1)], "subtype 1 alone, as Chrome's route-3 clicks delivered")

    let unsupported = GuardSeam(frontmost: user)
    try activation(unsupported, activationPoint: nil).activate()
    XCTAssertEqual(unsupported.posts.map(\.kind), [.appKit(1)])
  }

  func testTheTargetComingToTheFrontIsRefusedAfterTheUsersAppIsBroughtBack() {
    let seam = GuardSeam(frontmost: user, frontmostAfterPost: target)
    let subject = activation(seam)
    XCTAssertThrowsError(try subject.activate()) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "activationFailed")
      XCTAssertTrue((error as? EngineError)?.message.contains("the frontmost app was restored") == true)
    }
    XCTAssertEqual(seam.reactivated, [user], "the engine undoes the activation it caused")
    XCTAssertEqual(seam.releases, 1)
  }

  func testThePanelsAppComingToTheFrontIsTheEnginesDoingToo() {
    // The target is a panel's service (990_001); the bound app (990_004) is what comes to the front.
    let app: pid_t = 990_004
    let seam = GuardSeam(frontmost: user, frontmostAfterPost: app)
    let subject = FakeActivation(pid: target, appPid: app, window: AXUIElementCreateApplication(target), windowFrame: frame, windowID: 41,
                                 system: seam.system)
    XCTAssertThrowsError(try subject.activate()) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "activationFailed")
    }
    XCTAssertEqual(seam.reactivated, [user])
  }

  func testARestoreThatFailsIsNotReportedAsDone() {
    let seam = GuardSeam(frontmost: user, frontmostAfterPost: target, reactivates: false)
    XCTAssertThrowsError(try activation(seam).activate()) { error in
      let message = (error as? EngineError)?.message ?? ""
      XCTAssertTrue(message.contains("could not be restored"), message)
      XCTAssertFalse(message.contains("was restored"), message)
    }
    XCTAssertEqual(seam.reactivated, [user])
  }

  func testAnotherAppComingToTheFrontIsRefusedWithoutTakingItBack() {
    // Most likely the user's own switch: the engine fails the action and leaves the front alone.
    let seam = GuardSeam(frontmost: user, frontmostAfterPost: other)
    XCTAssertThrowsError(try activation(seam).activate()) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "activationFailed")
    }
    XCTAssertEqual(seam.reactivated, [])
  }

  func testAGuardThatNeverSettlesTimesOutAtOneSecond() {
    let seam = GuardSeam(frontmost: user, targetInFront: { _ in true })
    let subject = activation(seam)
    XCTAssertThrowsError(try subject.activate()) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "activationFailed")
    }
    XCTAssertGreaterThan(seam.raises, 0, "the user's window is raised over the target's on every unsettled sample")
    XCTAssertGreaterThanOrEqual(seam.clock, 1_000)
    XCTAssertLessThan(seam.clock, 1_000 + 2 * seam.step)
    XCTAssertEqual(seam.releases, 1)
    XCTAssertEqual(seam.releasedAt, 100)
  }

  func testTheScreenUpdateHoldIsReleasedWellBeforeASlowGuardEnds() throws {
    // The target's window orders above the user's for the first five samples, so the guard runs eight 40 ms samples.
    let seam = GuardSeam(frontmost: user, step: 40, targetInFront: { sample in sample <= 5 })
    let subject = activation(seam)
    try subject.activate()
    XCTAssertEqual(seam.holds, 1)
    XCTAssertEqual(seam.releases, 1, "released once")
    XCTAssertEqual(seam.releasedAt, 100, "by the cap's timer, between samples")
    XCTAssertEqual(subject.guardMs, 320, "the guard itself ran on")
    XCTAssertLessThan(activationHoldCapMs, 1_000 / 4)
  }

  func testTheCapHoldsWhileTheGuardIsBlocked() {
    // A raise blocked for 500 ms (an app slow to answer its AX request): the timer releases the hold at 100 ms all the
    // same, while the guard goes on to settle.
    let seam = GuardSeam(frontmost: user, step: 10, raiseCost: 500, targetInFront: { $0 == 1 })
    let subject = activation(seam)
    XCTAssertNoThrow(try subject.activate())
    XCTAssertEqual(seam.releasedAt, 100)
    XCTAssertEqual(seam.releases, 1)
    XCTAssertEqual(subject.guardMs, 540)
  }

  func testAQuickGuardHoldsThroughToItsEnd() throws {
    let seam = GuardSeam(frontmost: user, step: 10)
    let subject = activation(seam)
    try subject.activate()
    XCTAssertEqual(seam.releasedAt, 30, "three stable 10 ms samples, then the release, as the vendor's hold")
    XCTAssertEqual(subject.guardMs, 30)
  }
}

// MARK: A synthesized click's delivery

final class ClickDeliveryTests: XCTestCase {
  private let target: pid_t = 990_001, user: pid_t = 990_002
  private let frame = CGRect(x: 80, y: 60, width: 610, height: 860)

  private func clickTarget() -> ClickTarget {
    ClickTarget(point: CGPoint(x: 300, y: 400), windowFrame: frame, windowID: 41, pid: target)
  }

  private func meta() -> InputMeta {
    InputMeta(ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
  }

  func testAFailedGuardIsRefusedWithTheClicksEventsNeverPosted() {
    let seam = GuardSeam(frontmost: user, frontmostAfterPost: target)
    let activation = FakeActivation(pid: target, window: AXUIElementCreateApplication(target), windowFrame: frame, windowID: 41, system: seam.system)
    var meta = meta()
    XCTAssertThrowsError(try deliverClick(clickTarget(), route: .activation, button: .left, count: 1, activation: activation,
                                          targetActive: { false }, post: seam.system.post, meta: &meta)) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "activationFailed")
    }
    XCTAssertFalse(seam.posts.contains { if case .mouse = $0.kind { return true } else { return false } },
                   "no mouse event: the activation click is outside here, and the click's own events are never posted")
    XCTAssertEqual(seam.posts.map(\.kind), [.appKit(1)], "never retried with ⌘ or otherwise")
    XCTAssertEqual(meta.inputRoute, .activation, "the refusal names the route that failed")
    XCTAssertNil(meta.startedAt)
    XCTAssertNil(meta.endedAt)
  }

  func testRouteThreePostsThePlainClickAfterTheActivationAndWithdrawsIt() throws {
    let seam = GuardSeam(frontmost: user)
    let activation = FakeActivation(pid: target, window: AXUIElementCreateApplication(target), windowFrame: frame, windowID: 41, system: seam.system)
    var meta = meta()
    try deliverClick(clickTarget(), route: .activation, button: .left, count: 1, activation: activation, targetActive: { false },
                     post: seam.system.post, meta: &meta)
    XCTAssertEqual(seam.posts.map(\.kind), [.appKit(1), .mouse(.leftMouseDown), .mouse(.leftMouseUp), .appKit(2)])
    XCTAssertEqual(seam.posts.compactMap(\.flags), [[], []], "no ⌘ on route 3's click")
    XCTAssertEqual(meta.inputRoute, .activation)
    XCTAssertNotNil(meta.startedAt)
    XCTAssertNotNil(meta.activationGuardMs)
  }

  func testAnAppThatAlreadyBelievesItHasFocusTakesRouteThreeWithNoActivation() throws {
    let seam = GuardSeam(frontmost: target)
    let activation = FakeActivation(pid: target, window: AXUIElementCreateApplication(target), windowFrame: frame, windowID: 41, system: seam.system)
    var meta = meta()
    try deliverClick(clickTarget(), route: .activation, button: .left, count: 1, activation: activation, targetActive: { true },
                     post: seam.system.post, meta: &meta)
    XCTAssertEqual(seam.posts.map(\.kind), [.mouse(.leftMouseDown), .mouse(.leftMouseUp)])
    XCTAssertEqual(meta.inputRoute, .activation)
    XCTAssertNil(meta.activationGuardMs, "no guard ran")
  }

  func testTheForcedSpikeRoutesPostWithoutTheActivation() throws {
    for (route, flags) in [(InputRoute.commandPost, CGEventFlags.maskCommand), (.plainPost, [])] {
      let seam = GuardSeam(frontmost: user)
      var meta = meta()
      try deliverClick(clickTarget(), route: route, button: .left, count: 1, activation: nil, targetActive: { false },
                       post: seam.system.post, meta: &meta)
      XCTAssertEqual(seam.posts.map(\.kind), [.mouse(.leftMouseDown), .mouse(.leftMouseUp)], "\(route)")
      XCTAssertEqual(seam.posts.compactMap(\.flags), [flags, flags], "\(route)")
      XCTAssertEqual(meta.inputRoute, route)
    }
  }
}

// MARK: An element's action

final class ActionDeliveryTests: XCTestCase {
  private func meta() -> InputMeta {
    InputMeta(ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
  }

  func testAnActionIsRouteOneAndNeverActivates() throws {
    var performed: [String] = []
    var meta = meta()
    try deliverAction("AXPress", perform: { performed.append($0); return .success }, meta: &meta)
    XCTAssertEqual(performed, ["AXPress"])
    XCTAssertEqual(meta.inputRoute, .action, "route 1, never 3, for a plain action (a menu-bar item's included)")
    XCTAssertNil(meta.activationGuardMs)
    XCTAssertNotNil(meta.startedAt)
  }

  func testARefusedActionIsActionFailedWithNoFallThrough() {
    var meta = meta()
    var performed = 0
    XCTAssertThrowsError(try deliverAction("AXPress", perform: { _ in performed += 1; return .cannotComplete }, meta: &meta)) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "actionFailed")
    }
    XCTAssertEqual(performed, 1)
    XCTAssertEqual(meta.inputRoute, .action)
  }
}

// MARK: The owning process and the forbidden list

final class OwnerPolicyTests: XCTestCase {
  func testTheBundlesEnclosingAnExecutableInnermostFirst() {
    XCTAssertEqual(enclosingBundlePaths(ofExecutable: "/Applications/1Password.app/Contents/Library/LoginItems/1Password Helper.app/Contents/MacOS/helper"),
                   ["/Applications/1Password.app/Contents/Library/LoginItems/1Password Helper.app", "/Applications/1Password.app"])
    XCTAssertEqual(enclosingBundlePaths(ofExecutable: "/System/Library/Frameworks/Security.framework/Versions/A/MachServices/SecurityAgent.bundle/Contents/MacOS/SecurityAgent"),
                   ["/System/Library/Frameworks/Security.framework/Versions/A/MachServices/SecurityAgent.bundle"], "a framework is not a process's identity")
    XCTAssertEqual(enclosingBundlePaths(ofExecutable: "/System/Library/Frameworks/AppKit.framework/Versions/C/XPCServices/com.apple.appkit.xpc.openAndSavePanelService.xpc/Contents/MacOS/x"),
                   ["/System/Library/Frameworks/AppKit.framework/Versions/C/XPCServices/com.apple.appkit.xpc.openAndSavePanelService.xpc"])
    XCTAssertEqual(enclosingBundlePaths(ofExecutable: "/usr/libexec/somedaemon"), [])
  }

  func testTheIdentifiersOfAnOwningProcessIncludeTheAppsItLivesIn() {
    let helper = "/Applications/1Password.app/Contents/Library/LoginItems/1Password Helper.app/Contents/MacOS/helper"
    let ids = owningBundleIdentifiers(4242, runningIdentifier: { _ in "com.1password.browser-helper" }, executablePath: { _ in helper },
                                      bundleIdentifier: { path in
                                        [helper.components(separatedBy: "/Contents/MacOS")[0]: "com.1password.browser-helper",
                                         "/Applications/1Password.app": "com.1password.1password"][path]
                                      })
    XCTAssertEqual(ids, ["com.1password.browser-helper", "com.1password.1password"], "deduplicated, innermost first")
  }

  func testAForbiddenOwnerIsRefusedWithTheForbiddenAppSentence() {
    XCTAssertThrowsError(try refuseForbiddenOwner(4242, identifiers: { _ in ["com.1password.browser-helper", "com.1password.1password"] })) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "appNotAllowed")
      XCTAssertEqual((error as? EngineError)?.message,
                     "Computer Use is not allowed to use the app 'com.1password.1password' for safety reasons.")
    }
    XCTAssertThrowsError(try refuseForbiddenOwner(4242, identifiers: { _ in ["com.apple.SecurityAgent"] })) { error in
      XCTAssertEqual((error as? EngineError)?.message, "Computer use actions are not allowed for system security process: com.apple.SecurityAgent")
    }
  }

  func testAnAllowedOwnerOrOneWithNoBundlePasses() throws {
    try refuseForbiddenOwner(4242, identifiers: { _ in ["com.apple.appkit.xpc.openAndSavePanelService"] })
    try refuseForbiddenOwner(4242, identifiers: { _ in [] })
  }
}

// MARK: Keys and typed text

final class KeyRouteTests: XCTestCase {
  func testKeysGoByRouteTwoPrimeUnlessASpikeCellForcesAnother() {
    XCTAssertEqual(keyRoute(forced: nil), .plainPost)
    XCTAssertEqual(keyRoute(forced: .activation), .activation)
    XCTAssertEqual(keyRoute(forced: .commandPost), .commandPost)
  }

  func testTypedTextIsKeyedOnlyUnderAReliableLatinReading() {
    XCTAssertEqual(textRoute(keyboardLayout: true, perContextUnknown: false, concealed: false, spikeKeyed: false), .keyed)
    XCTAssertEqual(textRoute(keyboardLayout: false, perContextUnknown: false, concealed: false, spikeKeyed: false), .paste)
    XCTAssertEqual(textRoute(keyboardLayout: true, perContextUnknown: true, concealed: false, spikeKeyed: false), .paste)
    XCTAssertEqual(textRoute(keyboardLayout: false, perContextUnknown: false, concealed: false, spikeKeyed: true), .keyed, "probe (e)'s override")
  }

  func testConcealedTextFailsClosedWheneverTheReadingIsUnreliableEvenForASpikeCell() {
    XCTAssertEqual(textRoute(keyboardLayout: true, perContextUnknown: false, concealed: true, spikeKeyed: false), .keyed)
    XCTAssertEqual(textRoute(keyboardLayout: false, perContextUnknown: false, concealed: true, spikeKeyed: false), .refusedConcealed)
    XCTAssertEqual(textRoute(keyboardLayout: true, perContextUnknown: true, concealed: true, spikeKeyed: false), .refusedConcealed)
    XCTAssertEqual(textRoute(keyboardLayout: false, perContextUnknown: false, concealed: true, spikeKeyed: true), .refusedConcealed)
  }

  func testTheConcealedRefusalNamesItsReasonAndTheAlternativeAndNeverTheValue() {
    let source = concealedInputUnavailable(sourceID: "com.apple.inputmethod.Korean.2SetKorean", perContext: false)
    XCTAssertEqual(source.errorName, "concealedInputUnavailable")
    XCTAssertTrue(source.message.hasPrefix("Nothing was entered"))
    XCTAssertTrue(source.message.contains("com.apple.inputmethod.Korean.2SetKorean"))
    XCTAssertTrue(source.message.contains("set_value"))
    let perContext = concealedInputUnavailable(sourceID: "com.apple.keylayout.US", perContext: true)
    XCTAssertTrue(perContext.message.contains("its own input source"))
    XCTAssertTrue(perContext.message.contains("set_value"))
  }
}

// MARK: The seam

/// One event the seam was asked to post: what it was, its pid, and a mouse event's flags.
struct GuardPost: Equatable {
  enum Kind: Equatable {
    case appKit(Int)
    case mouse(NSEvent.EventType)
    case other
  }

  let kind: Kind
  let pid: pid_t
  let flags: CGEventFlags?
}

/// Route 3's outside world on a fake clock: posts, holds and re-activations recorded; the frontmost app, the window
/// order and the activation point answered.
final class GuardSeam {
  var posts: [GuardPost] = []
  var holds = 0
  var releases = 0
  var releasedAt: Double?
  var reactivated: [pid_t] = []
  var raises = 0
  var clock: Double = 0
  let step: Double
  let raiseCost: Double
  var frontmost: pid_t?
  let frontmostAfterPost: pid_t?
  let reactivates: Bool
  var activationPoint: CGPoint?
  let targetInFront: (Int) -> Bool
  /// Scheduled work by due time on the fake clock, run as the clock passes it.
  private var timers: [(due: Double, work: () -> Void)] = []

  init(frontmost: pid_t?, frontmostAfterPost: pid_t? = nil, reactivates: Bool = true, step: Double = 10, raiseCost: Double = 0,
       targetInFront: @escaping (Int) -> Bool = { _ in false }) {
    self.frontmost = frontmost
    self.frontmostAfterPost = frontmostAfterPost
    self.reactivates = reactivates
    self.step = step
    self.raiseCost = raiseCost
    self.targetInFront = targetInFront
  }

  /// Moves the fake clock on, running each timer at its own due time.
  func advance(_ ms: Double) {
    let end = clock + ms
    while let next = timers.indices.min(by: { timers[$0].due < timers[$1].due }), timers[next].due <= end {
      let timer = timers.remove(at: next)
      clock = timer.due
      timer.work()
    }
    clock = end
  }

  var system: ActivationSystem {
    var system = ActivationSystem()
    system.post = { event, pid in
      let made = NSEvent(cgEvent: event)
      let kind: GuardPost.Kind
      switch made?.type {
      case .appKitDefined?: kind = .appKit(Int(made!.subtype.rawValue))
      case let type? where [.leftMouseDown, .leftMouseUp, .rightMouseDown, .rightMouseUp, .otherMouseDown, .otherMouseUp].contains(type):
        kind = .mouse(type)
      default: kind = .other
      }
      if case .mouse = kind {
        self.posts.append(GuardPost(kind: kind, pid: pid, flags: event.flags.intersection([.maskCommand, .maskShift, .maskControl, .maskAlternate])))
      } else {
        self.posts.append(GuardPost(kind: kind, pid: pid, flags: nil))
      }
      if let after = self.frontmostAfterPost { self.frontmost = after }
    }
    system.frontmost = { self.frontmost }
    system.keyFocus = { nil }
    system.holdScreenUpdates = {
      self.holds += 1
      return { self.releases += 1; self.releasedAt = self.clock }
    }
    system.reactivate = { pid in self.reactivated.append(pid); return self.reactivates }
    system.userWindow = { _ in (AXUIElementCreateApplication(990_002), 42) }
    var samples = 0
    system.isInFront = { _, _ in samples += 1; return self.targetInFront(samples) }
    system.raise = { _ in self.raises += 1; self.advance(self.raiseCost) }
    system.activationPoint = { _ in self.activationPoint }
    system.now = { self.clock }
    system.sleep = { _ in self.advance(self.step) }
    system.schedule = { ms, work in self.timers.append((self.clock + ms, work)) }
    return system
  }
}
