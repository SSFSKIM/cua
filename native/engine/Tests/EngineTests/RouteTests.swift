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
    XCTAssertEqual(calls, 0, "the hit-test is taken only for a click route 1 could carry")
    _ = try plan(actions: ["AXPress"], gateCalls: &calls)
    XCTAssertEqual(calls, 1)
  }

  /// The vendor opens a menu-bar item by recording its menu (FUN_100083904's role test), never by a press or a
  /// synthesized click: a click that reaches the plan (the record path, MenuRecord.swift, takes the plain left click on
  /// an item with a menu before it) is refused before anything is posted, whatever the button, count or forced route,
  /// and the gate is never consulted. The menu bar's own node is refused the same way: a synthesized click at its
  /// midpoint would land on one of its items.
  func testEveryClickOnAMenuBarItemOrTheMenuBarIsRefused() {
    var calls = 0
    for role in ["AXMenuBarItem", "AXMenuBar"] {
    for (forced, button, count) in [(InputRoute?.none, MouseButton.left, 1), (nil, .right, 1), (nil, .left, 2), (.action, .left, 1),
                                    (.activation, .left, 1), (.plainPost, .left, 1)] {
      XCTAssertThrowsError(try plan(forced: forced, button: button, count: count, role: role, actions: ["AXPress", "AXCancel"],
                                    gateCalls: &calls)) { error in
        XCTAssertEqual((error as? EngineError)?.errorName, "menuBarItemUnsupported")
        let message = (error as? EngineError)?.message ?? ""
        XCTAssertTrue(message.contains("Only a plain left click") && message.contains("Nothing was clicked"), message)
        XCTAssertTrue(message.contains("keyboard shortcut") && message.contains("pressKey"), "the sentence names the alternative: \(message)")
        XCTAssertFalse(message.contains("M2a"), "no milestone names in model-facing text")
      }
    }
    }
    XCTAssertEqual(calls, 0)
  }

  func testNoDefaultChoiceIsEverRouteTwoOrTwoPrime() throws {
    for button in [MouseButton.left, .right, .middle] {
      for count in [1, 2, 3] {
        for actions in [[], ["AXPress"], ["AXPick"], ["AXShowMenu"]] {
          for role in ["AXButton", "AXMenuButton", "AXRow"] {
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

// MARK: The element click's record (#188)

/// What an element click's result meta says of how it was carried: the plan (the element's own action or a synthesized
/// click), why the ladder chose it, and the hit-test's answer against the element when one was taken, so a recorded
/// click on a text field tells an AXPress (which keeps the field's selection) from a synthesized click (which places a
/// caret). Value-free: action names and enumeration words only.
final class ElementClickRecordTests: XCTestCase {
  private func record(forced: InputRoute? = nil, button: MouseButton = .left, count: Int = 1, actions: [String],
                      hit: HitRelation? = nil) throws -> ElementClickRecord {
    let plan = try elementClickPlan(forced: forced, button: button, count: count, role: "AXTextArea", actions: actions) { hit == .descendant }
    return elementClickRecord(plan, forced: forced, button: button, count: count, actions: actions, hit: hit)
  }

  func testEachRungOfTheLadderNamesWhyItWasTaken() throws {
    // The Electron field advertises AXPress and the application's hit-test answers the field itself (hold 10).
    let pressed = try record(actions: ["AXPress", "AXShowMenu", "AXScrollToVisible"], hit: .element)
    XCTAssertEqual(pressed.plan, .action("AXPress"))
    XCTAssertEqual(pressed.reason, .advertised)
    // The gate: the point lands inside the element, so the click is synthesized.
    XCTAssertEqual(try record(actions: ["AXPress"], hit: .descendant).reason, .descendant)
    // The TextEdit text view advertises no press; no hit-test was taken for the plan.
    let synthesized = try record(actions: ["AXShowMenu"])
    XCTAssertEqual(synthesized.plan, .synthesized(.activation))
    XCTAssertEqual(synthesized.reason, .noAction)
    XCTAssertEqual(try record(button: .right, actions: ["AXPress"]).reason, .notPlainLeft)
    XCTAssertEqual(try record(count: 2, actions: ["AXPress"]).reason, .notPlainLeft)
    XCTAssertEqual(try record(forced: .activation, actions: ["AXPress"]).reason, .forced)
    XCTAssertEqual(try record(forced: .action, actions: ["AXPress"]).reason, .forced)
  }

  func testTheWireNamesThePlanTheReasonAndTheHitAgainstTheApplicationsHitTest() throws {
    let pressed = try record(actions: ["AXPress"], hit: .element).wire
    XCTAssertEqual(pressed["plan"] as? String, "action")
    XCTAssertEqual(pressed["action"] as? String, "AXPress")
    XCTAssertEqual(pressed["reason"] as? String, "advertised")
    XCTAssertEqual(pressed["hit"] as? String, "element")
    XCTAssertEqual(pressed["hitTest"] as? String, "application", "cua hit-tests the owner's application element, not the window")
    var synthesized = try record(actions: ["AXShowMenu"])
    XCTAssertEqual(synthesized.wire["plan"] as? String, "synthesized")
    XCTAssertNil(synthesized.wire["action"])
    XCTAssertNil(synthesized.wire["hit"], "no hit-test taken: none reported")
    XCTAssertNil(synthesized.wire["hitTest"])
    synthesized.hit = .ancestor  // the synthesized click's own reach check, recorded after it
    XCTAssertEqual(synthesized.wire["hit"] as? String, "ancestor")
    for relation in [HitRelation.noAnswer, .element, .descendant, .ancestor, .other] {
      XCTAssertEqual(try record(actions: ["AXShowMenu"], hit: relation).wire["hit"] as? String, "\(relation)")
    }
    XCTAssertTrue(JSONSerialization.isValidJSONObject(pressed))
  }

  func testTheInputMetaCarriesTheRecordOnlyForAnElementClick() throws {
    var meta = InputMeta(ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
    XCTAssertNil(meta.wire["elementClick"])
    meta.elementClick = try record(actions: ["AXPress"], hit: .element)
    XCTAssertEqual((meta.wire["elementClick"] as? [String: Any])?["plan"] as? String, "action")
  }
}

// MARK: A coordinate click's placement (#259)

final class CoordinateClickRecordTests: XCTestCase {
  /// #259's cell: the Electron fixture's window 720 × 560 at (140, 100), a screenshot at scale 2, the point [120, 168].
  private let windowFrame = CGRect(x: 140, y: 100, width: 720, height: 560)
  private func target(windowID: CGWindowID? = 41) -> ClickTarget {
    ClickTarget(point: CGPoint(x: 200, y: 184), windowFrame: windowFrame, windowID: windowID, pid: 990_001)
  }

  /// Every step from the model's point to the posted events, as numbers: the screenshot point as given, the window-local
  /// point the conversion computed, the global location and the window location the events carry, the AX frame the
  /// conversion used, and the frame read again just before the events (null until read).
  func testTheRecordNamesEveryStepOfTheConversionAsNumbers() throws {
    var record = CoordinateClickRecord(screenshotPoint: CGPoint(x: 120, y: 168), windowPoint: CGPoint(x: 60, y: 84), target: target())
    let wire = record.wire
    XCTAssertEqual(wire["screenshotPoint"] as? NSDictionary, ["x": 120, "y": 168])
    XCTAssertEqual(wire["windowPoint"] as? NSDictionary, ["x": 60, "y": 84])
    XCTAssertEqual(wire["postedLocation"] as? NSDictionary, ["x": 200, "y": 184])
    XCTAssertEqual(wire["postedWindowLocation"] as? NSDictionary, ["x": 60, "y": 84], "the point less the frame's origin, unflipped")
    XCTAssertEqual(wire["windowFrame"] as? NSDictionary, ["x": 140, "y": 100, "width": 720, "height": 560])
    XCTAssertTrue(wire["frameBeforePost"] is NSNull, "not read yet")
    record.frameBeforePost = CGRect(x: 140, y: 116, width: 720, height: 544)
    XCTAssertEqual(record.wire["frameBeforePost"] as? NSDictionary, ["x": 140, "y": 116, "width": 720, "height": 544])
    XCTAssertTrue(JSONSerialization.isValidJSONObject(record.wire))
    let unnamed = CoordinateClickRecord(screenshotPoint: CGPoint(x: 120, y: 168), windowPoint: CGPoint(x: 60, y: 84), target: target(windowID: nil))
    XCTAssertTrue(unnamed.wire["postedWindowLocation"] is NSNull, "no window number: no window location is stamped")
  }

  /// The posted fields are the click events' own: every event's global location, and the window location the events
  /// are stamped with (`stampWindow`'s, through the one helper it stamps by).
  func testThePostedFieldsAreTheClickEventsOwn() throws {
    let record = CoordinateClickRecord(screenshotPoint: CGPoint(x: 120, y: 168), windowPoint: CGPoint(x: 60, y: 84), target: target())
    let events = clickEvents(target(), button: .left, count: 2, flags: [])
    XCTAssertEqual(events.count, 4)
    for event in events { XCTAssertEqual(event.location, record.postedLocation) }
    XCTAssertEqual(stampedWindowLocation(target().point, id: 41, frame: windowFrame), record.postedWindowLocation)
    XCTAssertNil(stampedWindowLocation(target().point, id: nil, frame: windowFrame), "stampWindow stamps nothing without an id")
    XCTAssertNil(stampedWindowLocation(target().point, id: 41, frame: nil))
  }

  func testTheInputMetaCarriesTheRecordOnlyForACoordinateClick() {
    var meta = InputMeta(ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
    XCTAssertNil(meta.wire["coordinateClick"])
    meta.coordinateClick = CoordinateClickRecord(screenshotPoint: CGPoint(x: 120, y: 168), windowPoint: CGPoint(x: 60, y: 84), target: target())
    XCTAssertEqual((meta.wire["coordinateClick"] as? [String: Any])?["windowPoint"] as? NSDictionary, ["x": 60, "y": 84])
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

  private func relation(_ hit: Int?, _ target: Int) -> HitRelation {
    hitRelation(hit, to: target, parent: { self.finder[$0]?.parent }, same: { $0 == $1 })
  }

  /// The header band lies inside the scroll area's frame, so the walk keeps a row scrolled under it; the hit-test at
  /// the chosen point, which answers the header, refuses it.
  func testARowUnderTheColumnHeaderIsRefusedByTheHitTest() {
    XCTAssertEqual(visible(7, in: finder), CGRect(x: 0, y: 105, width: 800, height: 20), "the frame walk cannot see the header")
    XCTAssertEqual(relation(8, 7), .other)
    XCTAssertTrue(relation(8, 7).covered, "the header answers: refused, never clicked through")
  }

  func testTheElementOrADescendantConfirmsThePoint() {
    for (hit, expected) in [(4, HitRelation.element), (9, .descendant)] {
      XCTAssertEqual(relation(hit, 4), expected)
      XCTAssertFalse(relation(hit, 4).covered)
      XCTAssertFalse(relation(hit, 4).unconfirmed)
    }
  }

  /// No answer (a timeout, a busy app) or a container (coarse hit-testing answers the window or the app) cannot confirm a
  /// cover, and the vendor has no such check: the click proceeds, reported as unconfirmed.
  func testNoAnswerOrAnAncestorProceedsUnconfirmed() {
    for (hit, expected) in [(Int?.none, HitRelation.noAnswer), (3, .ancestor), (1, .ancestor), (0, .ancestor)] {
      XCTAssertEqual(relation(hit, 4), expected, "\(String(describing: hit))")
      XCTAssertFalse(relation(hit, 4).covered)
      XCTAssertTrue(relation(hit, 4).unconfirmed)
    }
  }

  func testTheUnconfirmedPointIsReportedInTheMetaOnlyWhenSet() {
    var meta = InputMeta(ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
    XCTAssertNil(meta.wire["pointUnconfirmed"])
    meta.pointUnconfirmed = true
    XCTAssertEqual(meta.wire["pointUnconfirmed"] as? Bool, true)
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
    let window = ActivationHit(role: "AXWindow", actions: [])
    XCTAssertEqual(activationClickDecision(CGPoint(x: 110, y: 76), windowFrame: textEdit, sparing: nil) { window }, .posted)
    let chrome = CGRect(x: 80, y: 60, width: 1000, height: 760)
    XCTAssertEqual(activationClickDecision(CGPoint(x: -1, y: 1441), windowFrame: chrome, sparing: nil) { window }, .outsideFrame)
    XCTAssertEqual(activationClickDecision(CGPoint(x: 1080, y: 400), windowFrame: chrome, sparing: nil) { window }, .outsideFrame, "the far edge is outside")
    XCTAssertEqual(activationClickDecision(nil, windowFrame: chrome, sparing: nil) { window }, .noPoint, "the attribute unsupported")
    XCTAssertEqual(activationClickDecision(CGPoint(x: 110, y: 76), windowFrame: nil, sparing: nil) { window }, .outsideFrame, "no frame to place it in")
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

  /// The click at the activation point only inside the window's frame; outside it, or with no point, the inert click
  /// outside the frame (#187, 2026-11-01), so the arm subtype 1 sets is always consumed. All to the target's pid.
  func testTheActivationClickIsPostedAtThePointOnlyInsideTheWindowsFrame() throws {
    let inside = GuardSeam(frontmost: user)
    try activation(inside, activationPoint: CGPoint(x: 110, y: 76)).activate()
    XCTAssertEqual(inside.posts.map(\.kind), [.appKit(1), .mouse(.leftMouseDown), .mouse(.leftMouseUp)])
    XCTAssertEqual(inside.posts.map(\.pid), [target, target, target])
    XCTAssertEqual(inside.posts[1].location, CGPoint(x: 110, y: 76))

    let outside = GuardSeam(frontmost: user)
    try activation(outside, activationPoint: CGPoint(x: -1, y: 1441)).activate()
    XCTAssertEqual(outside.posts.map(\.kind), [.appKit(1), .mouse(.leftMouseDown), .mouse(.leftMouseUp)], "Chrome's: the inert click")
    XCTAssertEqual(outside.posts[1].location, CGPoint(x: -1, y: 1441), "far enough outside: at the point itself")
    XCTAssertEqual(outside.posts.map(\.pid), [target, target, target])

    let unsupported = GuardSeam(frontmost: user)
    try activation(unsupported, activationPoint: nil).activate()
    XCTAssertEqual(unsupported.posts.map(\.kind), [.appKit(1), .mouse(.leftMouseDown), .mouse(.leftMouseUp)])
    XCTAssertEqual(unsupported.posts[1].location, CGPoint(x: frame.minX - 24, y: frame.midY), "no point: the offset point")
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
    XCTAssertFalse(seam.posts.contains { $0.location == clickTarget().point }, "the click's own events are never posted")
    XCTAssertEqual(seam.posts.map(\.kind), [.appKit(1), .mouse(.leftMouseDown), .mouse(.leftMouseUp)],
                   "the activation and its inert click; never retried with ⌘ or otherwise")
    XCTAssertEqual(meta.inputRoute, .activation, "the refusal names the route that failed")
    XCTAssertNil(meta.startedAt)
    XCTAssertNil(meta.endedAt)
    XCTAssertNotNil(meta.activationGuardMs, "the failed guard's duration is kept for the diagnosis")
  }

  func testRouteThreePostsThePlainClickAfterTheActivationAndWithdrawsIt() throws {
    let seam = GuardSeam(frontmost: user)
    let activation = FakeActivation(pid: target, window: AXUIElementCreateApplication(target), windowFrame: frame, windowID: 41, system: seam.system)
    var meta = meta()
    try deliverClick(clickTarget(), route: .activation, button: .left, count: 1, activation: activation, targetActive: { false },
                     post: seam.system.post, meta: &meta)
    XCTAssertEqual(seam.posts.map(\.kind), [.appKit(1), .mouse(.leftMouseDown), .mouse(.leftMouseUp), .mouse(.leftMouseDown),
                                           .mouse(.leftMouseUp), .appKit(2)], "the activation's inert click, then the click")
    XCTAssertEqual(seam.posts.compactMap(\.flags), [[], [], [], []], "no ⌘ on route 3's clicks")
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

  func testTheCursorIsToldAfterTheGuardAndBeforeTheClicksEventsAndNeverForARefusedClick() throws {
    // The agent cursor's pointer hook (the spec's Design, "Hooks"): it only enqueues, so it is told once the click is
    // sure to go out, just before its events; a click the guard refuses moves no cursor.
    let refused = GuardSeam(frontmost: user, frontmostAfterPost: target)
    var announced = 0
    var meta = meta()
    XCTAssertThrowsError(try deliverClick(clickTarget(), route: .activation, button: .left, count: 1,
                                          activation: FakeActivation(pid: target, window: AXUIElementCreateApplication(target), windowFrame: frame,
                                                                     windowID: 41, system: refused.system),
                                          targetActive: { false }, announce: { announced += 1 }, post: refused.system.post, meta: &meta))
    XCTAssertEqual(announced, 0)
    let seam = GuardSeam(frontmost: target)
    var postsWhenAnnounced: Int?
    meta = self.meta()
    try deliverClick(clickTarget(), route: .activation, button: .left, count: 1,
                     activation: FakeActivation(pid: target, window: AXUIElementCreateApplication(target), windowFrame: frame, windowID: 41, system: seam.system),
                     targetActive: { true }, announce: { postsWhenAnnounced = seam.posts.count }, post: seam.system.post, meta: &meta)
    XCTAssertEqual(postsWhenAnnounced, 0, "told before the click's events")
    XCTAssertEqual(seam.posts.count, 2)
    var stopped = 0
    meta = self.meta()
    XCTAssertThrowsError(try deliverClick(clickTarget(), route: .plainPost, button: .left, count: 1, activation: nil, targetActive: { true },
                                          beforePosting: { throw userChanged("TextEdit") }, announce: { stopped += 1 },
                                          post: { _, _ in }, meta: &meta))
    XCTAssertEqual(stopped, 0, "an in-flight stop before the events moves no cursor")
  }

  // MARK: The delivery guard (#200)

  private func freshActivation(_ seam: GuardSeam) -> FakeActivation {
    FakeActivation(pid: target, window: AXUIElementCreateApplication(target), windowFrame: frame, windowID: 41, system: seam.system)
  }

  private func click(_ seam: GuardSeam, activation: FakeActivation? = nil, count: Int = 1, meta: inout InputMeta) throws {
    try deliverClick(clickTarget(), route: .activation, button: .left, count: count, activation: activation ?? freshActivation(seam),
                     targetActive: { false }, post: seam.system.post, meta: &meta)
  }

  /// The click's own mouse down raises the target's window above the user's (AppKit's ordering click): the guard that
  /// follows the click's events raises the user's window back, inside the activation's one screen-update hold.
  func testARaiseAtTheClickIsUndoneInsideTheActivationsOneHold() throws {
    let seam = GuardSeam(frontmost: user)
    seam.targetAbove = false
    var postsAtRaise: Int?
    seam.onMouseDown = { seam.targetAbove = true; postsAtRaise = seam.posts.count }
    var meta = meta()
    try click(seam, meta: &meta)
    XCTAssertEqual(seam.targetAbove, false, "the user's window is back on top")
    XCTAssertEqual(seam.raises, 1)
    XCTAssertEqual(seam.holds, 1, "one hold for the activation and the click")
    XCTAssertEqual(seam.releases, 1)
    XCTAssertNotNil(postsAtRaise)
    let delivery = try XCTUnwrap(meta.delivery)
    XCTAssertEqual(delivery.restores, 1)
    XCTAssertFalse(delivery.frontmostRestored)
    XCTAssertFalse(delivery.raiseLeft)
    XCTAssertFalse(delivery.capped)
    XCTAssertEqual(delivery.restoreLatencyMs, 10, "found at the first sample after the click")
    XCTAssertEqual(delivery.guardMs, deliveryGuardMinimumMs, "the restore's sample, three stable ones, and on to the minimum wait")
    XCTAssertEqual(seam.releasedAt, seam.clock, "released once the delivery guard settled")
    XCTAssertEqual(delivery.screenHoldMs, seam.releasedAt, "the hold ran from the activation's start (clock 0)")
    XCTAssertEqual(Double(delivery.releasedAt - delivery.holdStartedAt), try XCTUnwrap(seam.releasedAt) - 0,
                   "the hold's start on the release's Unix clock: the activation's, before the click's events")
    XCTAssertEqual(meta.activationGuardMs, 10, "the activation's own guard settles on one sample when a delivery guard follows")
    XCTAssertEqual(seam.posts.map(\.kind), [.appKit(1), .mouse(.leftMouseDown), .mouse(.leftMouseUp), .mouse(.leftMouseDown),
                                           .mouse(.leftMouseUp), .appKit(2)], "the activation's inert click raises nothing; the click does")
  }

  /// A click that brings the target's process to the front: the user's app is made frontmost again.
  func testTheFrontmostProcessIsRestoredWhenTheClickBringsTheTargetForward() throws {
    let seam = GuardSeam(frontmost: user, reactivationTakesFront: true)
    seam.onMouseDown = { seam.frontmost = self.target }
    var meta = meta()
    try click(seam, meta: &meta)
    XCTAssertEqual(seam.reactivated, [user])
    XCTAssertEqual(meta.delivery?.frontmostRestored, true)
    XCTAssertEqual(meta.delivery?.raiseLeft, false)
  }

  /// A third app coming to the front during the click is most likely the user's own switch: left alone.
  func testAThirdAppComingToTheFrontDuringTheClickIsLeftAlone() throws {
    let seam = GuardSeam(frontmost: user)
    seam.onMouseDown = { seam.frontmost = 990_003 }
    var meta = meta()
    try click(seam, meta: &meta)
    XCTAssertEqual(seam.reactivated, [])
    XCTAssertEqual(meta.delivery?.otherAppFront, true)
    XCTAssertEqual(seam.releases, 1)
  }

  /// A target that keeps raising itself: the guard stops at the hold's cap, leaves the raise as it is and says so, and
  /// never takes a second hold.
  func testARaiseStillThereAtTheCapIsLeftAndReportedWithNoSecondHold() throws {
    // The activation's own sample finds the order right; every sample after the click finds the target above again.
    let seam = GuardSeam(frontmost: user, targetInFront: { sample in sample > 1 })
    var meta = meta()
    try click(seam, meta: &meta)
    let delivery = try XCTUnwrap(meta.delivery)
    XCTAssertTrue(delivery.capped)
    XCTAssertTrue(delivery.raiseLeft)
    XCTAssertGreaterThan(delivery.restores, 0)
    XCTAssertEqual(seam.holds, 1, "never a second hold")
    XCTAssertEqual(seam.releases, 1)
    XCTAssertEqual(delivery.screenHoldMs, activationHoldCapMs)
    XCTAssertGreaterThan(seam.repairsOutsideHold, 0, "after the release it keeps repairing inside the repair window")
    XCTAssertTrue(delivery.repairedAfterRelease)
    XCTAssertGreaterThanOrEqual(delivery.guardMs, deliveryRepairWindowMs, "until the window ends, the raise never settling")
  }

  /// #200's first live sample: the app raised only after the cap had released the hold. The guard repairs it after the
  /// release, inside the repair window, reported apart from the restores made under the hold.
  func testARaiseFoundAfterTheReleaseIsRepairedAndReportedApart() throws {
    // 40 ms samples: the activation's sample at 40, the post, a stable sample at 80, the raise found at 120 (past the cap).
    let seam = GuardSeam(frontmost: user, step: 40, targetInFront: { sample in sample == 3 })
    var meta = meta()
    try click(seam, meta: &meta)
    let delivery = try XCTUnwrap(meta.delivery)
    XCTAssertTrue(delivery.capped)
    XCTAssertTrue(delivery.repairedAfterRelease)
    XCTAssertEqual(delivery.repairAfterReleaseLatencyMs, 80)
    XCTAssertEqual(delivery.restores, 0, "none under the hold")
    XCTAssertFalse(delivery.raiseLeft)
    XCTAssertEqual(seam.repairsOutsideHold, 1)
    XCTAssertEqual(seam.holds, 1, "never a second hold")
  }

  /// The person's input since the click stops the repairs after the release: their own click into the app is never
  /// undone. The raise is left, reported.
  func testAPersonsInputSinceTheClickStopsTheRepairsAfterTheRelease() throws {
    let seam = GuardSeam(frontmost: user, step: 40, targetInFront: { sample in sample >= 3 })
    seam.secondsSinceInput = 0.01
    var meta = meta()
    try click(seam, meta: &meta)
    let delivery = try XCTUnwrap(meta.delivery)
    XCTAssertTrue(delivery.personInput)
    XCTAssertFalse(delivery.repairedAfterRelease)
    XCTAssertTrue(delivery.raiseLeft)
    XCTAssertEqual(seam.repairsOutsideHold, 0)
  }

  /// A restore that blocks past the cap (an AXRaise waiting out its timeout): the guard ends there, on what the order
  /// is after the restore, and repairs nothing more.
  func testARestoreThatBlocksPastTheCapEndsOnTheOrderItLeft() throws {
    let seam = GuardSeam(frontmost: user, raiseCost: 95)
    seam.targetAbove = false
    seam.onMouseDown = { seam.targetAbove = true }
    var meta = meta()
    try click(seam, meta: &meta)
    let delivery = try XCTUnwrap(meta.delivery)
    XCTAssertTrue(delivery.capped)
    XCTAssertEqual(delivery.restores, 1)
    XCTAssertFalse(delivery.raiseLeft, "the restore took: no raise is left, though the guard ended at the cap")
    XCTAssertEqual(seam.raises, 1)
    XCTAssertEqual(seam.repairsOutsideHold, 0)
  }

  /// A re-activation the system accepts but that leaves the target in front is no restore: at the window's end the target
  /// is still frontmost, reported as a raise left.
  func testAReactivationThatLeavesTheTargetInFrontIsReportedAsARaiseLeft() throws {
    let seam = GuardSeam(frontmost: user)  // re-activations accepted, never effective
    seam.onMouseDown = { seam.frontmost = self.target }
    var meta = meta()
    try click(seam, meta: &meta)
    let delivery = try XCTUnwrap(meta.delivery)
    XCTAssertFalse(seam.reactivated.isEmpty)
    XCTAssertFalse(delivery.frontmostRestored, "no sample saw the user's app in front again")
    XCTAssertTrue(delivery.capped)
    XCTAssertTrue(delivery.raiseLeft)
    XCTAssertTrue(delivery.repairedAfterRelease, "re-activations go on after the release, inside the window")
  }

  /// A frontmost restore that a sample saw, then lost again to the target: the restore is reported, and so is the raise
  /// left at the guard's end.
  func testAFrontmostRestoreSeenAndThenLostIsReportedWithTheRaiseLeft() throws {
    let seam = GuardSeam(frontmost: user, reactivationTakesFront: true)
    seam.onMouseDown = { seam.frontmost = self.target }
    var seenRestored = false
    seam.onFrontmostRead = {
      guard !seam.reactivated.isEmpty else { return }
      if seenRestored {
        seam.frontmost = self.target
        seam.reactivationRefused = [self.user]
      } else if seam.frontmost == self.user {
        seenRestored = true
      }
    }
    var meta = meta()
    try click(seam, meta: &meta)
    let delivery = try XCTUnwrap(meta.delivery)
    XCTAssertEqual(seam.reactivated, [user, user])
    XCTAssertTrue(delivery.frontmostRestored)
    XCTAssertTrue(delivery.raiseLeft)
    XCTAssertFalse(delivery.capped)
  }

  /// A click with nothing raised: three stable samples after the click, no restore.
  func testAClickThatRaisesNothingSettlesOnThreeSamples() throws {
    let seam = GuardSeam(frontmost: user)
    var meta = meta()
    try click(seam, meta: &meta)
    let delivery = try XCTUnwrap(meta.delivery)
    XCTAssertEqual(delivery.restores, 0)
    XCTAssertNil(delivery.restoreLatencyMs)
    XCTAssertEqual(delivery.guardMs, deliveryGuardMinimumMs, "three stable samples, and on to the minimum wait")
    XCTAssertEqual(seam.holds, 1)
    XCTAssertEqual(seam.releases, 1)
  }

  /// A drag's down is an ordering click too: the same guard.
  func testADragIsGuardedLikeAClick() throws {
    let seam = GuardSeam(frontmost: user)
    seam.targetAbove = false
    seam.onMouseDown = { seam.targetAbove = true }
    var meta = meta()
    try deliverPointer(to: target, route: .activation, activation: freshActivation(seam), post: seam.system.post, meta: &meta) {
      dragEvents(from: CGPoint(x: 300, y: 400), to: CGPoint(x: 400, y: 500), window: clickTarget(), flags: [])
    }
    XCTAssertEqual(meta.delivery?.restores, 1)
    XCTAssertEqual(seam.targetAbove, false)
  }

  /// A stop just before the click's events (the in-flight intervention check) ends the activation's hold too.
  func testAStopBeforeTheEventsReleasesTheHold() {
    let seam = GuardSeam(frontmost: user)
    var meta = meta()
    XCTAssertThrowsError(try deliverClick(clickTarget(), route: .activation, button: .left, count: 1, activation: freshActivation(seam),
                                          targetActive: { false }, beforePosting: { throw userChanged("TextEdit") },
                                          post: seam.system.post, meta: &meta))
    XCTAssertEqual(seam.holds, 1)
    XCTAssertEqual(seam.releases, 1)
    XCTAssertNil(meta.delivery)
  }

  /// No delivery guard where no fake activation stands: an app that already believes it has focus.
  func testNoDeliveryGuardForAnAppThatBelievesItHasFocus() throws {
    let seam = GuardSeam(frontmost: target)
    var meta = meta()
    try deliverClick(clickTarget(), route: .activation, button: .left, count: 1, activation: freshActivation(seam), targetActive: { true },
                     post: seam.system.post, meta: &meta)
    XCTAssertNil(meta.delivery)
    XCTAssertEqual(seam.holds, 0)
  }

  // MARK: The after-release watch (#200)

  /// A click on `connection`, whose meta's context carries it (the watch's registry is the connection's).
  private func click(_ seam: GuardSeam, on connection: ConnectionState) throws -> InputMeta {
    var meta = InputMeta(ExecutionContext(connection: connection, receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
    try click(seam, meta: &meta)
    return meta
  }

  /// The action returns at the hold's release as before; a raise that comes after it (the live check's: 21 ms after a
  /// 14 ms settle) is repaired by the watch that runs on after the release, and recorded on the connection for the next
  /// result's meta, keyed by the action's post time.
  func testTheActionReturnsAtTheReleaseAndTheWatchRepairsARaiseAfterIt() throws {
    let seam = GuardSeam(frontmost: user)
    seam.targetAbove = false
    let connection = ConnectionState(id: 7, fd: -1)
    let meta = try click(seam, on: connection)
    let delivery = try XCTUnwrap(meta.delivery)
    XCTAssertEqual(delivery.guardMs, deliveryGuardMinimumMs, "no added latency: the action returned at its release")
    XCTAssertEqual(seam.releasedAt, seam.clock)
    XCTAssertNil(connection.afterAction.wire, "nothing repaired yet")
    seam.advance(15)
    XCTAssertEqual(seam.raises, 0)
    seam.targetAbove = true  // the app raises its window after the release
    seam.advance(20)
    XCTAssertEqual(seam.targetAbove, false, "the user's window is back on top")
    XCTAssertEqual(seam.raises, 1)
    XCTAssertEqual(seam.repairsOutsideHold, 1, "a flash: made with no hold open")
    let wire = try XCTUnwrap(connection.afterAction.wire)
    XCTAssertEqual(wire["repairs"] as? Int, 1)
    let actions = try XCTUnwrap(wire["actions"] as? [[String: Any]])
    XCTAssertEqual(actions.count, 1)
    XCTAssertEqual(actions[0]["postedAt"] as? Int, Int(delivery.postedAt), "keyed by the action's post time, as its delivery meta says it")
    XCTAssertEqual(actions[0]["repairs"] as? Int, 1)
    XCTAssertEqual(actions[0]["latencyMs"] as? Double, delivery.guardMs + 20,
                   "from the post: the guard's 60 ms, a quiet sample 10 ms after the release, then the one that found it")
    XCTAssertNotNil(InputMeta(meta.context).wire["afterActionRepairs"], "every later input result on the connection carries it")
    XCTAssertNil(InputMeta(ExecutionContext(connection: ConnectionState(id: 8, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil)).wire["afterActionRepairs"],
                 "another connection's results do not")
    seam.advance(deliveryRepairWindowMs)
    let posts = seam.posts.count
    seam.targetAbove = true
    seam.advance(deliveryRepairWindowMs)
    XCTAssertEqual(seam.targetAbove, true, "past post + 1 s the watch has ended")
    XCTAssertEqual(seam.posts.count, posts)
  }

  /// The target's process taking the front after the release: the user's app made frontmost again, only that app.
  func testTheWatchRestoresTheFrontmostAppWhenTheTargetTakesItAfterTheRelease() throws {
    let seam = GuardSeam(frontmost: user, reactivationTakesFront: true)
    let connection = ConnectionState(id: 7, fd: -1)
    _ = try click(seam, on: connection)
    seam.frontmost = target
    seam.advance(15)
    XCTAssertEqual(seam.reactivated, [user])
    XCTAssertEqual(seam.frontmost, user)
    XCTAssertEqual(connection.afterAction.wire?["repairs"] as? Int, 1)
  }

  /// The next action on the connection ends the watch before anything of its own happens: a target that comes to the
  /// front then (the next action's own doing, say a menu's deliberate activation) is never answered by the old watch.
  func testTheNextActionOnTheConnectionCancelsTheWatchWithNoRepairAfter() throws {
    let seam = GuardSeam(frontmost: user, reactivationTakesFront: true)
    let connection = ConnectionState(id: 7, fd: -1)
    _ = try click(seam, on: connection)
    seam.frontmost = target  // the next click's app believes it has focus: no activation, no guard of its own
    _ = try click(seam, on: connection)
    seam.advance(deliveryRepairWindowMs)
    XCTAssertEqual(seam.reactivated, [], "the first click's watch was cancelled as the next action began")
    XCTAssertNil(connection.afterAction.wire)
  }

  /// Every execute on the connection cancels the watch at its start (here one refused at once by the lock screen).
  func testEveryRequestThatActsOrObservesOnTheConnectionCancelsTheWatch() throws {
    let seam = GuardSeam(frontmost: user)
    seam.targetAbove = false
    let connection = ConnectionState(id: 7, fd: -1)
    _ = try click(seam, on: connection)
    let engine = Engine(paths: ServerPaths(socket: "/tmp/x.sock", directory: "/tmp", lock: "/tmp/x.lock", usage: "/tmp/cua-engine-test-usage.json"),
                        intervention: InterventionMonitor(listenGranted: { false }), screenLocked: { true })
    let params: [String: Any] = ["method": "get_app_state", "args": ["app": "TextEdit"], "deadlineUnixMilliseconds": unixMilliseconds() + 60_000]
    _ = engine.handle(Request(id: 1, method: "execute", params: params), on: connection, receivedAt: unixMilliseconds())
    seam.targetAbove = true
    seam.advance(deliveryRepairWindowMs)
    XCTAssertEqual(seam.raises, 0)
    XCTAssertEqual(seam.targetAbove, true)
  }

  /// A cancel waits out a sample already running, so no repair starts once it has returned; a watch cancelled from
  /// inside its own sample (the race at its tightest) repairs nothing.
  func testACancelDuringASampleLeavesNoRepairAfterIt() throws {
    let seam = GuardSeam(frontmost: user)
    seam.targetAbove = false
    let connection = ConnectionState(id: 7, fd: -1)
    _ = try click(seam, on: connection)
    let done = DispatchSemaphore(value: 0)
    seam.onFrontmostRead = {
      seam.onFrontmostRead = nil
      seam.targetAbove = true
      // Another thread's cancel, taken while this sample runs: it returns only once the sample is over.
      DispatchQueue.global().async { connection.afterAction.cancel(); done.signal() }
      XCTAssertEqual(done.wait(timeout: .now() + 0.2), .timedOut, "the cancel waits for the running sample")
    }
    seam.advance(15)
    XCTAssertEqual(seam.raises, 1, "the sample the cancel waited for finished its own repair")
    XCTAssertEqual(done.wait(timeout: .now() + 5), .success, "and the cancel returned once it was over")
    seam.targetAbove = true
    seam.advance(deliveryRepairWindowMs)
    XCTAssertEqual(seam.raises, 1, "nothing after the cancel")
    XCTAssertEqual(seam.targetAbove, true)
  }

  /// The person's input since the click, or a third app in front, ends the watch: their own click into the app is never
  /// undone, and a third app's front is theirs.
  func testThePersonsInputOrAThirdAppInFrontEndsTheWatchWithNoRepair() throws {
    let input = GuardSeam(frontmost: user)
    input.targetAbove = false
    let inputConnection = ConnectionState(id: 7, fd: -1)
    _ = try click(input, on: inputConnection)
    input.secondsSinceInput = 0.005
    input.targetAbove = true
    input.advance(deliveryRepairWindowMs)
    XCTAssertEqual(input.raises, 0)
    XCTAssertNil(inputConnection.afterAction.wire)

    let third = GuardSeam(frontmost: user, reactivationTakesFront: true)
    let thirdConnection = ConnectionState(id: 8, fd: -1)
    _ = try click(third, on: thirdConnection)
    third.frontmost = 990_003
    third.advance(15)
    third.frontmost = target  // the watch has ended: even the target in front later is left
    third.advance(deliveryRepairWindowMs)
    XCTAssertEqual(third.reactivated, [])
    XCTAssertNil(thirdConnection.afterAction.wire)
  }

  private func lockedEngine() -> Engine {
    Engine(paths: ServerPaths(socket: "/tmp/x.sock", directory: "/tmp", lock: "/tmp/x.lock", usage: "/tmp/cua-engine-test-usage.json"),
           intervention: InterventionMonitor(listenGranted: { false }), screenLocked: { true })
  }

  /// An execute on `connection`, refused at once by the lock screen: it begins as every execute does.
  private func execute(_ engine: Engine, on connection: ConnectionState) {
    let params: [String: Any] = ["method": "get_app_state", "args": ["app": "TextEdit"], "deadlineUnixMilliseconds": unixMilliseconds() + 60_000]
    _ = engine.handle(Request(id: 1, method: "execute", params: params), on: connection, receivedAt: unixMilliseconds())
  }

  /// #237: a connection that closes right after an action (end_task closes the session's connection) leaves its watch
  /// running to its natural end: a raise 200 ms after the events is still repaired for the client that has gone, and the
  /// watch, its rules unchanged, ends at the window's end and lets go of the closed connection's watches.
  func testAClosedConnectionsWatchRunsToItsEndAndRepairsALateRaise() throws {
    let seam = GuardSeam(frontmost: user)
    seam.targetAbove = false
    let engine = lockedEngine()
    weak var watches: AfterActionWatches?
    do {
      let connection = ConnectionState(id: 7, fd: -1)
      watches = connection.afterAction
      _ = try click(seam, on: connection)
      engine.closedWatches.adopt(connection.afterAction)  // the close (Server.swift `retire`)
      XCTAssertTrue(connection.afterAction.watching, "the close does not end the watch")
    }
    XCTAssertEqual(engine.closedWatches.count, 1)
    XCTAssertNotNil(watches, "held while the watch runs, the connection gone")
    seam.advance(200 - deliveryGuardMinimumMs)
    seam.targetAbove = true  // the app raises its window 200 ms after the events
    seam.advance(activationGuardSampleMs)
    XCTAssertEqual(seam.raises, 1, "repaired after the client closed")
    XCTAssertEqual(seam.targetAbove, false)
    seam.advance(deliveryRepairWindowMs)
    XCTAssertEqual(engine.closedWatches.count, 0, "ended at post + 1 s")
    XCTAssertNil(watches, "and released: no cycle keeps the closed connection's watches alive")
    seam.targetAbove = true
    seam.advance(deliveryRepairWindowMs)
    XCTAssertEqual(seam.raises, 1, "no repair after the watch ended")
  }

  /// #237: the next request that acts or observes on any other connection ends a closed connection's watch before
  /// anything of its own happens; with no watch running a close holds nothing.
  func testARequestOnAnotherConnectionEndsAClosedConnectionsWatch() throws {
    let seam = GuardSeam(frontmost: user)
    seam.targetAbove = false
    let engine = lockedEngine()
    let closing = ConnectionState(id: 7, fd: -1), next = ConnectionState(id: 8, fd: -1)
    _ = try click(seam, on: closing)
    engine.closedWatches.adopt(closing.afterAction)
    XCTAssertEqual(engine.closedWatches.count, 1)
    execute(engine, on: next)
    XCTAssertEqual(engine.closedWatches.count, 0)
    XCTAssertFalse(closing.afterAction.watching)
    seam.targetAbove = true
    seam.advance(deliveryRepairWindowMs)
    XCTAssertEqual(seam.raises, 0, "nothing repaired once another client's request began")
    engine.closedWatches.adopt(next.afterAction)
    XCTAssertEqual(engine.closedWatches.count, 0, "a connection with no watch running holds nothing at its close")
  }

  /// #237: a closed connection stops counting at once (status's `connections`, shutdown's busy count), while its watch
  /// still runs; the watch's end changes no count.
  func testAClosedConnectionStopsCountingAtOnceWhileItsWatchRuns() throws {
    let seam = GuardSeam(frontmost: user)
    seam.targetAbove = false
    let server = Server(paths: ServerPaths(socket: "/tmp/x.sock", directory: "/tmp", lock: "/tmp/x.lock", usage: "/tmp/cua-engine-test-usage.json"),
                        settings: EngineSettings(peerPolicy: .uid, cursor: false))
    let asker = try XCTUnwrap(server.register(-1)), closing = try XCTUnwrap(server.register(-1))
    XCTAssertEqual(server.others(than: asker), 1)
    _ = try click(seam, on: closing)
    server.unregister(closing)
    XCTAssertEqual(server.others(than: asker), 0, "not counted from the close on")
    XCTAssertEqual(server.engine.closedWatches.count, 1, "its watch runs on")
    seam.advance(deliveryRepairWindowMs)
    XCTAssertEqual(server.engine.closedWatches.count, 0)
    XCTAssertEqual(server.others(than: asker), 0)
  }

  /// #237's review: the close's first step moves the connection out of the open ones and its watch into the closed
  /// connections' in one step, before any other teardown, so a request that finds the connection gone (here right after
  /// that step, the holds and drives not yet ended) ends the watch, and a shutdown's count finds it neither open nor
  /// missing from the drain.
  func testAnExecuteRightAfterTheConnectionLeavesTheOpenOnesEndsItsWatch() throws {
    let seam = GuardSeam(frontmost: user)
    seam.targetAbove = false
    let server = Server(paths: ServerPaths(socket: "/tmp/x.sock", directory: "/tmp", lock: "/tmp/x.lock", usage: "/tmp/cua-engine-test-usage.json"),
                        settings: EngineSettings(peerPolicy: .uid, cursor: false))
    let next = try XCTUnwrap(server.register(-1)), closing = try XCTUnwrap(server.register(-1))
    _ = try click(seam, on: closing)
    server.retire(closing)
    XCTAssertEqual(server.others(than: next), 0, "gone from the open connections")
    XCTAssertEqual(server.engine.closedWatches.count, 1, "and its watch already where an execute ends it")
    // What every execute on `next` does first (Methods.swift; testARequestOnAnotherConnectionEndsAClosedConnectionsWatch
    // runs a whole execute on a locked engine): this server's engine is unlocked, so no real request is sent to it.
    server.engine.closedWatches.cancelAll()
    XCTAssertEqual(server.engine.closedWatches.count, 0)
    seam.targetAbove = true
    seam.advance(deliveryRepairWindowMs)
    XCTAssertEqual(seam.raises, 0, "nothing repaired over the next request")
  }

  /// #237's review: two requests draining the closed connections' watches at once. The first takes the watch and waits
  /// out its sample in progress; the second must not go ahead until that sample is over, or the sample could repair
  /// during the second request.
  func testASecondDrainWaitsForTheWatchTheFirstIsStopping() throws {
    let seam = GuardSeam(frontmost: user)
    seam.targetAbove = false
    let engine = lockedEngine()
    let closing = ConnectionState(id: 7, fd: -1)
    _ = try click(seam, on: closing)
    engine.closedWatches.adopt(closing.afterAction)
    let first = DispatchSemaphore(value: 0), second = DispatchSemaphore(value: 0)
    seam.onFrontmostRead = {
      seam.onFrontmostRead = nil
      DispatchQueue.global().async { engine.closedWatches.cancelAll(); first.signal() }
      // Until the first drain has emptied the registry and is waiting on this sample.
      let deadline = Date().addingTimeInterval(5)
      while engine.closedWatches.count > 0 && Date() < deadline { usleep(1_000) }
      DispatchQueue.global().async { engine.closedWatches.cancelAll(); second.signal() }
      XCTAssertEqual(second.wait(timeout: .now() + 0.2), .timedOut, "the second drain waits while the watch it raced can still repair")
      XCTAssertEqual(first.wait(timeout: .now()), .timedOut, "as does the first")
    }
    seam.advance(15)
    XCTAssertEqual(first.wait(timeout: .now() + 5), .success)
    XCTAssertEqual(second.wait(timeout: .now() + 5), .success, "both return once the sample is over")
    seam.targetAbove = true
    seam.advance(deliveryRepairWindowMs)
    XCTAssertEqual(seam.raises, 0)
  }

  /// A watch that runs to its window's end lets go of itself: the connection no longer holds it, and with the connection
  /// gone nothing holds the connection's watches.
  func testAWatchThatEndsIsReleased() throws {
    let seam = GuardSeam(frontmost: user)
    seam.targetAbove = false
    weak var watches: AfterActionWatches?
    do {
      let connection = ConnectionState(id: 7, fd: -1)
      watches = connection.afterAction
      _ = try click(seam, on: connection)
      XCTAssertTrue(connection.afterAction.watching)
      seam.advance(deliveryRepairWindowMs)
      XCTAssertFalse(connection.afterAction.watching, "ended at post + 1 s, and no longer held")
    }
    XCTAssertNil(watches, "no cycle keeps the connection's watches alive")
  }

  /// A re-activation the system refuses is no repair: not counted, and the watch ends.
  func testARefusedReactivationIsNotCountedAsARepair() throws {
    let seam = GuardSeam(frontmost: user, reactivates: false)
    let connection = ConnectionState(id: 7, fd: -1)
    _ = try click(seam, on: connection)
    seam.frontmost = target
    seam.advance(deliveryRepairWindowMs)
    XCTAssertEqual(seam.reactivated, [user], "tried once, then the watch ended")
    XCTAssertNil(connection.afterAction.wire, "nothing was repaired")
  }

  /// The action interval is the events' own posting (InputMeta.posting's contract): it ends before the guard releases its
  /// hold, never at the guard's end.
  func testTheActionIntervalEndsWithTheEventsNotTheGuard() throws {
    let seam = GuardSeam(frontmost: user)
    var releasedAtUnix: Int64?
    seam.onRelease = { releasedAtUnix = unixMilliseconds(); usleep(30_000) }
    let meta = try click(seam, on: ConnectionState(id: 7, fd: -1))
    XCTAssertLessThanOrEqual(try XCTUnwrap(meta.endedAt), try XCTUnwrap(releasedAtUnix), "stamped as the events went out, before the guard's release")
  }

  func testTheDeliveryGuardIsOnTheWire() {
    var meta = meta()
    meta.delivery = DeliveryGuardOutcome(restores: 1, frontmostRestored: false, otherAppFront: false, restoreLatencyMs: 10, guardMs: 40,
                                         screenHoldMs: 52.5, capped: false, raiseLeft: false, holdStartedAt: 1_793_399_999_947, releasedAt: 1_793_400_000_000)
    let wire = meta.wire["delivery"] as? [String: Any]
    XCTAssertEqual(wire?["restores"] as? Int, 1)
    XCTAssertEqual(wire?["restoreLatencyMs"] as? Double, 10)
    XCTAssertEqual(wire?["screenHoldMs"] as? Double, 52.5)
    XCTAssertEqual(wire?["releasedAt"] as? Int, 1_793_400_000_000)
    XCTAssertEqual(wire?["holdStartedAt"] as? Int, 1_793_399_999_947)
    XCTAssertEqual(wire?["capped"] as? Bool, false)
    XCTAssertNil(InputMeta(meta.context).wire["delivery"], "absent when no delivery guard ran")
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
    XCTAssertEqual(meta.inputRoute, .action, "route 1, never 3, for an element's own action")
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

  /// The amended table (Decision Log, 2026-10-22, "route 3 for key equivalents and element actions"): a ⌘ chord is a
  /// menu key equivalent, which a background app does not perform (TextEdit's ⌘A left the selection unchanged by 2′), so
  /// press_key takes route 3 when the app does not believe it has focus; plain keys stay on 2′.
  func testACommandChordGoesByRouteThreeOnlyWhenTheAppDoesNotBelieveItHasFocus() throws {
    func route(_ keys: String, focus: Bool, forced: InputRoute? = nil) throws -> InputRoute {
      pressKeyRoute(forced: forced, presses: try parseKeySequence(keys), believesFocus: focus)
    }
    XCTAssertEqual(try route("super+a", focus: false), .activation)
    XCTAssertEqual(try route("cmd+shift+z", focus: false), .activation)
    XCTAssertEqual(try route("Down super+a", focus: false), .activation, "a sequence with a chord is activated before its first press")
    XCTAssertEqual(try route("super+a", focus: true), .plainPost, "an app that believes it has focus needs no activation")
    for plain in ["a", "Return", "shift+a", "ctrl+a", "alt+Return", "Tab Down"] {
      XCTAssertEqual(try route(plain, focus: false), .plainPost, plain)
    }
    XCTAssertEqual(try route("super", focus: false), .plainPost, "a modifier alone is no key equivalent")
    XCTAssertEqual(try route("super+a", focus: false, forced: .plainPost), .plainPost, "a spike cell's forced route wins")
    XCTAssertEqual(try route("a", focus: false, forced: .activation), .activation)
  }

  func testTypedTextStaysOnRouteTwoPrimeWhateverTheFocus() {
    XCTAssertEqual(keyRoute(forced: nil), .plainPost, "type_text is measured and delivered by 2′ (U12)")
  }

  /// An element's own action or attribute write (a click by AXPress, set_value, select_text, perform_secondary_action)
  /// takes route 3 into an app that does not believe it has focus; inside a recorded menu's held activation it stays 1.
  func testAnElementActionTakesRouteThreeWhenTheAppDoesNotBelieveItHasFocus() {
    XCTAssertEqual(elementActionRoute(believesFocus: false, insideHeldMenu: false), .activation)
    XCTAssertEqual(elementActionRoute(believesFocus: true, insideHeldMenu: false), .action)
    XCTAssertEqual(elementActionRoute(believesFocus: false, insideHeldMenu: true), .action, "the menu's own span already holds it")
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
  /// A mouse event's global point.
  var location: CGPoint? = nil
}

/// Route 3's outside world on a fake clock: posts, holds and re-activations recorded; the frontmost app, the window
/// order and the activation point answered.
final class GuardSeam {
  var posts: [GuardPost] = []
  /// Run after each left mouse down is posted but the activation's own click (#200: what the app does at the action's own
  /// mouse down).
  var onMouseDown: (() -> Void)?
  /// When set, the window order the guards read: whether the target's window is above the user's. A raise of the
  /// user's window puts it back on top.
  var targetAbove: Bool?
  /// Seconds since the last HID input, as the delivery guard reads it after the hold's release (no person's input by
  /// default).
  var secondsSinceInput: Double = 1_000
  /// When set, the window order by window: the target process's windows above the user's (a guard's read names the one
  /// it checks). A raise of the user's window puts it back above them all. Takes precedence over `targetAbove`.
  var windowsAbove: Set<CGWindowID>?
  /// Run before each read of the frontmost app answers (#200: what the apps do between a guard's samples).
  var onFrontmostRead: (() -> Void)?
  /// Raises and re-activations made while no screen-update hold was open (#200: none once the cap released it).
  var repairsOutsideHold = 0
  var holds = 0
  var releases = 0
  /// Run as each screen-update hold is taken, and as each is released (on the test's thread).
  var onHold: (() -> Void)?
  var onRelease: (() -> Void)?
  var releasedAt: Double?
  /// When the last screen-update hold was taken, on the fake clock.
  var heldAt: Double?
  var reactivated: [pid_t] = []
  var raises = 0
  var clock: Double = 0
  let step: Double
  let raiseCost: Double
  var frontmost: pid_t?
  let frontmostAfterPost: pid_t?
  let reactivates: Bool
  var activationPoint: CGPoint?
  /// What the hit-test at the activation point answers: the window itself, as U13 read on TextEdit, Finder and Electron.
  var activationHit: ActivationHit? = ActivationHit(role: "AXWindow", actions: [])
  let targetInFront: (Int) -> Bool
  /// Scheduled work by due time on the fake clock, run as the clock passes it.
  private var timers: [(due: Double, work: () -> Void)] = []

  /// Whether a successful re-activation makes its app frontmost (route 4's activation and restore).
  let reactivationTakesFront: Bool
  /// Processes whose re-activation fails (route 4's restore of the user's app).
  var reactivationRefused: Set<pid_t> = []
  /// The user's key window: 42 at the first read, this one at every later read (route 4's read after the restore).
  var keyWindowAfterFirstRead: CGWindowID? = 42
  var userWindowReads = 0

  init(frontmost: pid_t?, frontmostAfterPost: pid_t? = nil, reactivates: Bool = true, step: Double = 10, raiseCost: Double = 0,
       reactivationTakesFront: Bool = false, targetInFront: @escaping (Int) -> Bool = { _ in false }) {
    self.reactivationTakesFront = reactivationTakesFront
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
        self.posts.append(GuardPost(kind: kind, pid: pid, flags: event.flags.intersection([.maskCommand, .maskShift, .maskControl, .maskAlternate]),
                                    location: event.location))
      } else {
        self.posts.append(GuardPost(kind: kind, pid: pid, flags: nil))
      }
      if let after = self.frontmostAfterPost { self.frontmost = after }
      // The activation's own click, the mouse down right after subtype 1, takes AppKit's armed branch: key and main, no
      // ordering (#200's reading, #187's for the inert click). What the app does is at the action's mouse down.
      let activationClick = self.posts.dropLast().last?.kind == .appKit(1)
      if made?.type == .leftMouseDown && !activationClick { self.onMouseDown?() }
    }
    system.frontmost = {
      self.onFrontmostRead?()
      return self.frontmost
    }
    system.keyFocus = { nil }
    system.secondsSinceInput = { self.secondsSinceInput }
    system.holdScreenUpdates = {
      self.holds += 1
      self.heldAt = self.clock
      self.onHold?()
      return { self.releases += 1; self.releasedAt = self.clock; self.onRelease?() }
    }
    system.reactivate = { pid in
      self.reactivated.append(pid)
      if self.holds == self.releases { self.repairsOutsideHold += 1 }
      let reactivates = self.reactivates && !self.reactivationRefused.contains(pid)
      if reactivates && self.reactivationTakesFront { self.frontmost = pid }
      return reactivates
    }
    system.userWindow = { _ in
      self.userWindowReads += 1
      let id: CGWindowID? = self.userWindowReads == 1 ? 42 : self.keyWindowAfterFirstRead
      return id.map { (AXUIElementCreateApplication(990_002), $0) }
    }
    system.userWindowNumber = { _ in 42 }
    var samples = 0
    system.isInFront = { window, _ in
      samples += 1
      if let above = self.windowsAbove { return above.contains(window) }
      return self.targetAbove ?? self.targetInFront(samples)
    }
    system.raise = { _ in
      self.raises += 1
      if self.holds == self.releases { self.repairsOutsideHold += 1 }
      if self.targetAbove != nil { self.targetAbove = false }
      if self.windowsAbove != nil { self.windowsAbove = [] }
      self.advance(self.raiseCost)
    }
    system.activationPoint = { _ in self.activationPoint }
    system.hitAt = { _, _ in self.activationHit }
    system.now = { self.clock }
    system.sleep = { _ in self.advance(self.step) }
    system.schedule = { ms, work in self.timers.append((self.clock + ms, work)) }
    return system
  }
}
