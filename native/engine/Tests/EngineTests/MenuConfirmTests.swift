import ApplicationServices
import Foundation
import XCTest
@testable import Engine

// #374: perform_secondary_action "Show Menu" (AXShowMenu) answers success only once a menu is seen to open within the
// menu wait, and `menuUnconfirmed` otherwise, the "sent, effect not seen" family's answer beside clickUnconfirmed and
// scrollUnconfirmed (the Linux engine's contract, cua #171 M4, ruling 687). A fake tree answers the Accessibility calls
// (FakeAX, ElementMethodTests.swift); the "action" is a closure that opens a menu in the fake tree or does not.

private func el(_ id: Int) -> AXUIElement { Engine.element(id) }

/// An application (1) with a window (2) and its menu bar (3); the window holds a web area (4) whose text area (10) is
/// the element asked to show its menu, and a popup button (11).
private final class MenuScene {
  let ax = FakeAX()

  init() {
    ax.roles = [1: kAXApplicationRole, 2: kAXWindowRole, 3: kAXMenuBarRole, 4: "AXWebArea", 10: kAXTextAreaRole, 11: kAXPopUpButtonRole]
    ax.parents = [2: 1, 3: 1, 4: 2, 10: 4, 11: 2]
    ax.children = [1: [2, 3], 2: [4, 11], 4: [10]]
    ax.actions = [10: [kAXShowMenuAction], 11: [kAXPressAction, kAXShowMenuAction]]
  }

  /// A context menu (20) the application puts up as its own child, as AppKit, Chromium, Gecko and WebKit's UI process do.
  func openApplicationMenu(_ id: Int = 20) {
    ax.roles[id] = kAXMenuRole
    ax.parents[id] = 1
    ax.children[1, default: []].append(id)
  }

  /// The popup button's menu (21), a child of the button.
  func openElementMenu() {
    ax.roles[21] = kAXMenuRole
    ax.parents[21] = 11
    ax.children[11] = [21]
  }

  /// A page's ARIA menu (30, role=menu, which Chrome and Safari expose as AXMenu) inside the web area, with the focus on
  /// its first item (31), as the WAI-ARIA menu pattern moves it.
  func openARIAMenu() {
    ax.roles[30] = kAXMenuRole
    ax.roles[31] = kAXMenuItemRole
    ax.parents[30] = 4
    ax.parents[31] = 30
    ax.children[4, default: []].append(30)
    ax.children[30] = [31]
    focus(31)
  }

  func focus(_ id: Int) { ax.values[1, default: [:]][kAXFocusedUIElementAttribute] = el(id) }

  /// The menu wait run after `act` (the action), with the baseline read before it, as performSecondaryAction runs it.
  func confirm(element: Int = 10, performed: AXError = .success, act: () -> Void = {}) -> MenuConfirmRecord {
    let before = openMenus(element: el(element), applications: [el(1)], ax: ax.ops)
    act()
    return awaitShownMenu(element: el(element), applications: [el(1)], before: before, performed: performed, ax: ax.ops)
  }
}

final class MenuConfirmTests: XCTestCase {
  func testNoMenuWithinTheWaitIsUnconfirmed() {
    let scene = MenuScene()
    let record = scene.confirm()
    XCTAssertNil(record.seen)
    XCTAssertGreaterThanOrEqual(record.ms, menuConfirmWindowMs, "the whole wait")
    XCTAssertLessThan(record.ms, menuConfirmWindowMs + menuConfirmIntervalMs)
    XCTAssertEqual(record.polls, Int(menuConfirmWindowMs / menuConfirmIntervalMs) + 1, "a read every 20 ms, the first at once")
    XCTAssertThrowsError(try menuAnswer(record, app: "Fake")) { error in
      let error = error as? EngineError
      XCTAssertEqual(error?.errorName, "menuUnconfirmed")
      XCTAssertEqual(error?.message, "The Show Menu action was sent to Fake, but no menu was seen to open within 1 s. Fake may have shown a menu of its own that accessibility does not expose (a web page's own menu, for one), or ignored the request. Observe the app (take a screenshot or call getAXState()) before any retry, and never retry blindly.")
    }
  }

  func testAMenuTheApplicationOpensIsConfirmed() throws {
    let scene = MenuScene()
    let record = scene.confirm { scene.openApplicationMenu() }
    XCTAssertEqual(record.seen, .application)
    XCTAssertEqual(record.polls, 1, "seen on the first read")
    XCTAssertEqual(record.ms, 0)
    XCTAssertNoThrow(try menuAnswer(record, app: "Fake"))
  }

  /// A menu that comes up while the wait runs is seen at the first read after it, and the wait stops there.
  func testAMenuOpeningDuringTheWaitStopsIt() {
    let scene = MenuScene()
    let ops = scene.ax.ops
    var reads = 0
    var ax = ops
    ax.childrenRead = { element in
      if FakeAX.id(element) == 1 { reads += 1; if reads == 4 { scene.openApplicationMenu() } }  // the third read after the action
      return ops.childrenRead(element)
    }
    let before = openMenus(element: el(10), applications: [el(1)], ax: ax)
    let record = awaitShownMenu(element: el(10), applications: [el(1)], before: before, performed: .success, ax: ax)
    XCTAssertEqual(record.seen, .application)
    XCTAssertEqual(record.polls, 3)
    XCTAssertEqual(record.ms, 2 * menuConfirmIntervalMs)
  }

  func testAMenuAlreadyOpenBeforeTheActionDoesNotCount() {
    let scene = MenuScene()
    scene.openApplicationMenu()
    let record = scene.confirm()
    XCTAssertNil(record.seen, "the menu open before the action confirms nothing")
    XCTAssertEqual(record.openBefore, 1)
    XCTAssertThrowsError(try menuAnswer(record, app: "Fake"))
  }

  /// A menu open before the action does not count, but another one the action opens beside it does.
  func testANewMenuBesideOneAlreadyOpenCounts() {
    let scene = MenuScene()
    scene.openApplicationMenu(20)
    let record = scene.confirm { scene.openApplicationMenu(22) }
    XCTAssertEqual(record.seen, .application)
    XCTAssertEqual(record.openBefore, 1)
  }

  func testThePopupButtonsOwnMenuIsConfirmed() {
    let scene = MenuScene()
    let record = scene.confirm(element: 11) { scene.openElementMenu() }
    XCTAssertEqual(record.seen, .element)
  }

  /// A web page's ARIA menu, inside the page and not a child of the application, is confirmed through the focus the
  /// menu pattern moves into it.
  func testAnARIAMenuTakingTheFocusIsConfirmed() {
    let scene = MenuScene()
    scene.focus(10)
    let record = scene.confirm { scene.openARIAMenu() }
    XCTAssertEqual(record.seen, .focus)
    XCTAssertNoThrow(try menuAnswer(record, app: "Fake"))
  }

  /// The focused element that is itself the menu counts as inside it.
  func testAFocusedMenuIsConfirmed() {
    let scene = MenuScene()
    let record = scene.confirm {
      scene.openARIAMenu()
      scene.focus(30)
    }
    XCTAssertEqual(record.seen, .focus)
  }

  func testAnARIAMenuOpenWithTheFocusInItBeforeTheActionDoesNotCount() {
    let scene = MenuScene()
    scene.openARIAMenu()
    let record = scene.confirm()
    XCTAssertNil(record.seen)
    XCTAssertEqual(record.openBefore, 1)
  }

  /// A page that handles contextmenu itself (preventDefault, and its own menu drawn as plain elements or nothing) shows
  /// no menu accessibility exposes: the answer says the action was sent and the effect not seen.
  func testAPageDrawingAMenuWithNoMenuRoleIsUnconfirmed() {
    let scene = MenuScene()
    scene.focus(10)
    let record = scene.confirm {
      scene.ax.roles[40] = kAXGroupRole
      scene.ax.parents[40] = 4
      scene.ax.children[4, default: []].append(40)
    }
    XCTAssertNil(record.seen)
  }

  /// The focus walk stops a few levels up: a focused element deep in the page is not read up to its window on every poll.
  func testTheFocusWalkIsShort() {
    let scene = MenuScene()
    scene.ax.roles[50] = kAXMenuRole
    scene.ax.parents[50] = 4
    var parent = 50
    for id in 51...(51 + menuFocusLevels) { scene.ax.roles[id] = kAXGroupRole; scene.ax.parents[id] = parent; parent = id }
    let record = scene.confirm { scene.focus(parent) }
    XCTAssertNil(record.seen, "a menu \(menuFocusLevels + 1) levels above the focus is not the focus's menu")
  }

  /// An app that runs the menu's tracking loop inside the action answers it only when the menu closes, so the
  /// Accessibility call times out (cannotComplete) with the menu open: the menu is looked for all the same, and the
  /// action's error is recorded.
  func testAShowMenuThatTimedOutWithItsMenuOpenIsConfirmed() {
    let scene = MenuScene()
    let record = scene.confirm(performed: .cannotComplete) { scene.openApplicationMenu() }
    XCTAssertEqual(record.seen, .application)
    XCTAssertEqual(record.actionError, AXError.cannotComplete.rawValue)
    XCTAssertEqual(record.wire["actionError"] as? Int, Int(AXError.cannotComplete.rawValue))
  }

  func testOnlySuccessOrATimeoutCountsAsSent() {
    XCTAssertTrue(showMenuSent(.success))
    XCTAssertTrue(showMenuSent(.cannotComplete))
    XCTAssertFalse(showMenuSent(.actionUnsupported))
    XCTAssertFalse(showMenuSent(.failure))
    XCTAssertFalse(showMenuSent(.invalidUIElement))
  }

  func testTheRecordsWire() {
    let seen = MenuConfirmRecord(seen: .focus, openBefore: 1, polls: 3, ms: 40.04)
    XCTAssertEqual(seen.wire as NSDictionary, ["seen": "focus", "openBefore": 1, "polls": 3, "ms": 40.0] as NSDictionary)
    let none = MenuConfirmRecord(seen: nil, openBefore: 0, polls: 51, ms: 1000)
    XCTAssertEqual(none.wire as NSDictionary, ["seen": NSNull(), "openBefore": 0, "polls": 51, "ms": 1000.0] as NSDictionary)
  }

  /// An app whose every read hangs for the 1 s messaging timeout ends the wait one read past its window, not after
  /// every read of every poll.
  func testAHungAppEndsTheWaitOneReadPastIt() {
    let scene = MenuScene()
    let ops = scene.ax.ops
    var ax = ops
    var hung = false
    ax.childrenRead = { element in if hung { scene.ax.clock += 1000 }; return ops.childrenRead(element) }
    let before = openMenus(element: el(10), applications: [el(1)], ax: ax)
    hung = true
    let record = awaitShownMenu(element: el(10), applications: [el(1)], before: before, performed: .success, ax: ax)
    XCTAssertNil(record.seen)
    XCTAssertEqual(record.polls, 1)
    XCTAssertEqual(record.ms, 2000, "the application's read, then the element's, which began inside the deadline; no focus read")
  }

  /// An app that answers its children and then stalls on each child's role ends the wait one read past its window too:
  /// the deadline is checked before every read, the role reads inside a children list included.
  func testAnAppStallingOnEachRoleEndsTheWaitOneReadPastIt() {
    let scene = MenuScene()
    scene.ax.children[1] = Array(60..<70)
    for id in 60..<70 { scene.ax.roles[id] = kAXWindowRole }
    let ops = scene.ax.ops
    var ax = ops
    var hung = false
    ax.role = { element in if hung { scene.ax.clock += 1000 }; return ops.role(element) }
    let before = openMenus(element: el(10), applications: [el(1)], ax: ax)
    hung = true
    let record = awaitShownMenu(element: el(10), applications: [el(1)], before: before, performed: .success, ax: ax)
    XCTAssertNil(record.seen)
    XCTAssertEqual(record.polls, 1)
    XCTAssertEqual(record.ms, 2000, "the first child's role, then the second's, begun inside the deadline; not ten seconds")
  }

  /// A source whose baseline read failed confirms nothing: a menu open throughout, unread before the action and read
  /// after it, is not the action's.
  func testAMenuUnderASourceTheBaselineCouldNotReadDoesNotCount() {
    let scene = MenuScene()
    scene.openApplicationMenu()
    scene.ax.unreadable = [1]
    let before = openMenus(element: el(10), applications: [el(1)], ax: scene.ax.ops)
    XCTAssertEqual(before.unread, [.application, .focus])
    scene.ax.unreadable = []
    let record = awaitShownMenu(element: el(10), applications: [el(1)], before: before, performed: .success, ax: scene.ax.ops)
    XCTAssertNil(record.seen, "the open menu was unread in the baseline")
    XCTAssertEqual(record.unreadBefore, ["application", "focus"])
    XCTAssertEqual(record.wire["unreadBefore"] as? [String], ["application", "focus"])
  }

  /// The other sources still confirm when one did not read: the popup's own menu with the application unread.
  func testAnotherSourceStillConfirmsWhenOneDidNotRead() {
    let scene = MenuScene()
    scene.ax.unreadable = [1]
    let before = openMenus(element: el(11), applications: [el(1)], ax: scene.ax.ops)
    scene.ax.unreadable = []
    scene.openElementMenu()
    let record = awaitShownMenu(element: el(11), applications: [el(1)], before: before, performed: .success, ax: scene.ax.ops)
    XCTAssertEqual(record.seen, .element)
  }

  /// A child whose role does not read leaves its source unread, since it may be a menu.
  func testAChildWhoseRoleDoesNotReadLeavesItsSourceUnread() {
    let scene = MenuScene()
    scene.openApplicationMenu()
    let ops = scene.ax.ops
    var ax = ops
    ax.role = { FakeAX.id($0) == 20 ? nil : ops.role($0) }
    XCTAssertEqual(openMenus(element: el(10), applications: [el(1)], ax: ax).unread, [.application])
  }

  /// The focus's walk with a parent missing below the window leaves the focus unread: an ARIA menu above it went unread.
  func testAFocusWalkCutShortLeavesTheFocusUnread() {
    let scene = MenuScene()
    scene.openARIAMenu()
    scene.ax.parents[31] = nil
    XCTAssertEqual(openMenus(element: el(10), applications: [el(1)], ax: scene.ax.ops).unread, [.focus])
    scene.ax.parents[31] = 30
    scene.focus(10)
    let reading = openMenus(element: el(10), applications: [el(1)], ax: scene.ax.ops)
    XCTAssertEqual(reading.unread, [], "a walk that reaches the window is read in full")
    XCTAssertTrue(reading.menus.isEmpty)
  }

  /// The two processes a menu is looked for under: the element's serving process and the app's, once each.
  func testTheApplicationsLookedUnder() {
    XCTAssertEqual(menuApplicationPids(owner: 7, appPid: 7), [7])
    XCTAssertEqual(menuApplicationPids(owner: 8, appPid: 7), [8, 7])
  }
}
