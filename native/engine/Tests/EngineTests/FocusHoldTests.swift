import AppKit
import CoreGraphics
import Foundation
import XCTest
@testable import Engine

// The focus hold (FocusHold.swift; the Decision Log's 2026-10-22 entry "route 3 for key equivalents and element
// actions"): route 3's activation for an element action or a ⌘ chord is taken once and held across the interaction, as
// the vendor's SyntheticAppFocusEnforcer holds its believed-active state (F §5.5, §16.9 item 6), and released when the
// connection's requests move to another app, after the idle bound, or when the connection closes. Everything runs over
// the recorded guard seam: nothing here posts, activates or holds the screen.

final class FocusHoldTests: XCTestCase {
  private let target: pid_t = 990_001, user: pid_t = 990_002, panel: pid_t = 990_003
  private let activations = HeldActivations()
  private let window = CGRect(x: 80, y: 60, width: 610, height: 860)

  private func meta() -> InputMeta {
    InputMeta(ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
  }

  /// A span whose idle timer the test fires by hand.
  private final class Clock {
    var timers: [(ms: Double, work: @Sendable () -> Void)] = []
    func span() -> ActivationSpan { ActivationSpan(label: "focus", idleMs: focusHoldIdleMs, schedule: { ms, work in self.timers.append((ms, work)) }) }
    func fireLast() { timers.removeLast().work() }
  }

  private func connection(_ clock: Clock = Clock()) -> ConnectionState {
    ConnectionState(id: 1, fd: -1, menuSpan: Clock().span(), focusHold: clock.span())
  }

  private func activation(_ seam: GuardSeam, pid: pid_t? = nil) -> FakeActivation {
    seam.activationPoint = CGPoint(x: 300, y: 70)
    return FakeActivation(pid: pid ?? target, window: AXUIElementCreateApplication(pid ?? target), windowFrame: window, windowID: 41,
                          system: seam.system)
  }

  private func hold(_ connection: ConnectionState, _ seam: GuardSeam, app: String = "a", pid: pid_t? = nil,
                    beforeActivating: () throws -> Void = {}, meta: inout InputMeta) throws {
    try holdFocus(app: app, pid: pid ?? target, connection: connection, activations: activations,
                  activation: { self.activation(seam, pid: pid) }, beforeActivating: beforeActivating, meta: &meta)
  }

  /// A focus hold (a ⌘ key equivalent's, an element action's or write's) posts no left mouse down of its own: on Chrome,
  /// whose activation point lies outside its frame, the inert click goes right after subtype 1, before the holder's
  /// input, so its keys and actions reach a key window (#187); the release adds no second click.
  func testAFocusHoldOnChromeTakesTheInertClickBeforeItsInput() throws {
    let seam = GuardSeam(frontmost: user)
    let connection = connection()
    var meta = meta()
    try holdFocus(app: "chrome", pid: target, connection: connection, activations: activations, activation: {
      seam.activationPoint = CGPoint(x: -1, y: 1441)
      return FakeActivation(pid: self.target, window: AXUIElementCreateApplication(self.target), windowFrame: self.window, windowID: 41,
                            system: seam.system)
    }, beforeActivating: {}, meta: &meta)
    XCTAssertEqual(seam.posts.map(\.kind), [.appKit(1), .mouse(.leftMouseDown), .mouse(.leftMouseUp)])
    XCTAssertEqual(seam.posts[1].location, CGPoint(x: -1, y: 1441))
    XCTAssertEqual(meta.activationClickKind, .inertOutside(.activationPoint, .early))
    connection.endFocusHold()
    XCTAssertEqual(seam.posts.map(\.kind), [.appKit(1), .mouse(.leftMouseDown), .mouse(.leftMouseUp), .appKit(2)])
  }

  /// The vendor's lifecycle: the first action activates, the ones after it find the app already believing itself active
  /// (no second activation, no deactivation between), and the release withdraws it once.
  func testTheFirstActionActivatesAndTheNextOnesRunInsideTheHold() throws {
    let seam = GuardSeam(frontmost: user)
    let connection = connection()
    var first = meta()
    try hold(connection, seam, meta: &first)
    XCTAssertEqual(seam.posts.map(\.kind), [.appKit(1), .mouse(.leftMouseDown), .mouse(.leftMouseUp)], "activated by the first action")
    XCTAssertNotNil(first.activationGuardMs, "the guard's time rides in the meta as today")
    XCTAssertEqual(connection.focusHold.app, "a")

    var second = meta()
    try hold(connection, seam, meta: &second)
    XCTAssertEqual(seam.posts.count, 3, "the second action shares the held activation")
    XCTAssertNil(second.activationGuardMs, "no guard ran for it")
    XCTAssertEqual(activations.holders(target), 1)

    connection.endFocusHold()
    XCTAssertEqual(seam.posts.map(\.kind).last, .appKit(2), "withdrawn when the hold ends")
    XCTAssertEqual(activations.holders(target), 0)
    XCTAssertNil(connection.focusHold.app)
  }

  /// An element served by another process (an open panel's service) is activated in its own process, under the same
  /// hold, and both are withdrawn together.
  func testAProcessServingAPanelJoinsTheAppsHold() throws {
    let seam = GuardSeam(frontmost: user)
    let connection = connection()
    var meta = meta()
    try hold(connection, seam, meta: &meta)
    try hold(connection, seam, pid: panel, meta: &meta)
    try hold(connection, seam, pid: panel, meta: &meta)
    XCTAssertEqual(seam.posts.filter { $0.kind == .appKit(1) }.map(\.pid), [target, panel], "one activation per process")
    connection.endFocusHold()
    XCTAssertEqual(Set(seam.posts.filter { $0.kind == .appKit(2) }.map(\.pid)), [target, panel])
    XCTAssertEqual(activations.holders(panel), 0)
  }

  /// The release points the vendor reading leaves to cua (it holds until its controller's lifecycle ends): a request
  /// aimed at another app ends the hold before it runs; requests without an app keep it; only a request on the held app
  /// that observes it or acts on it renews the idle bound.
  func testARequestAimedAtAnotherAppEndsTheHoldAndOnlyTheHeldAppsRequestsRenewIt() {
    XCTAssertTrue(focusHoldEndsBefore(app: "b", heldApp: "a"))
    XCTAssertFalse(focusHoldEndsBefore(app: "a", heldApp: "a"))
    XCTAssertFalse(focusHoldEndsBefore(app: nil, heldApp: "a"), "list_apps, ping: nothing aimed at")
    XCTAssertFalse(focusHoldEndsBefore(app: "b", heldApp: nil))
    for method in ["get_app_state", "click", "press_key", "type_text", "paste", "set_value", "select_text", "perform_secondary_action", "scroll", "drag"] {
      XCTAssertTrue(focusHoldRenews(method: method, app: "a", heldApp: "a"), method)
    }
    XCTAssertFalse(focusHoldRenews(method: "resolve_app", app: "a", heldApp: "a"), "acts on nothing")
    XCTAssertFalse(focusHoldRenews(method: "get_app_state", app: "b", heldApp: "a"))
    XCTAssertFalse(focusHoldRenews(method: "list_apps", app: nil, heldApp: "a"))
  }

  func testTheIdleBoundReleasesTheHold() throws {
    let seam = GuardSeam(frontmost: user)
    let clock = Clock()
    let connection = connection(clock)
    _ = connection.focusHold.requestBegan()
    var meta = meta()
    try hold(connection, seam, meta: &meta)
    connection.focusHold.requestEnded(onRecord: true)
    XCTAssertEqual(clock.timers.last?.ms, focusHoldIdleMs)
    XCTAssertEqual(focusHoldIdleMs, 120_000, "the menu span's bound")
    clock.fireLast()
    XCTAssertEqual(seam.posts.map(\.kind).last, .appKit(2))
    XCTAssertNil(connection.focusHold.app)

    // The next action on the app activates it again, in a new hold.
    var again = self.meta()
    try hold(connection, seam, meta: &again)
    XCTAssertEqual(seam.posts.filter { $0.kind == .appKit(1) }.count, 2)
    XCTAssertNotNil(again.activationGuardMs)
    XCTAssertEqual(connection.focusHold.app, "a")
  }

  /// A hold for another app on the same connection replaces the first: one held app per connection.
  func testHoldingAnotherAppReleasesTheFirst() throws {
    let seam = GuardSeam(frontmost: user)
    let connection = connection()
    var meta = meta()
    try hold(connection, seam, meta: &meta)
    try hold(connection, seam, app: "b", pid: panel, meta: &meta)
    XCTAssertEqual(seam.posts.filter { $0.kind == .appKit(2) }.map(\.pid), [target])
    XCTAssertEqual(connection.focusHold.app, "b")
  }

  func testAFailedGuardHoldsNothingAndIsRefusedAsActivationFailed() {
    let seam = GuardSeam(frontmost: user, frontmostAfterPost: target)  // the app comes to the front
    let connection = connection()
    var meta = meta()
    XCTAssertThrowsError(try hold(connection, seam, meta: &meta)) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "activationFailed")
    }
    XCTAssertNotNil(meta.activationGuardMs, "the failed guard's time is kept")
    XCTAssertEqual(seam.reactivated, [user], "the user's app is made frontmost again")
    XCTAssertNil(connection.focusHold.app)
    XCTAssertEqual(activations.holders(target), 0)
  }

  func testAUserEventStopsTheHoldBeforeAnythingIsActivated() {
    let seam = GuardSeam(frontmost: user)
    let connection = connection()
    var meta = meta()
    let intervened = EngineError(name: "userIntervened", "The user changed 'a'.")
    XCTAssertThrowsError(try hold(connection, seam, beforeActivating: { throw intervened }, meta: &meta))
    XCTAssertTrue(seam.posts.isEmpty)
    XCTAssertNil(connection.focusHold.app)
  }

  /// The menu's span and the focus hold count as two holders of one activation: the menu's ending keeps the app active
  /// for the hold, and the hold's ending withdraws it.
  func testTheMenuSpanAndTheFocusHoldShareOneActivation() throws {
    let seam = GuardSeam(frontmost: user)
    let connection = connection()
    var meta = meta()
    try recordHeldMenu(Engine.element(90), app: "a", pid: target, connection: connection, activations: activations,
                       activation: { self.activation(seam) }, beforeActivating: {}, meta: &meta)
    var action = self.meta()
    try hold(connection, seam, meta: &action)
    XCTAssertEqual(seam.posts.filter { $0.kind == .appKit(1) }.count, 1)
    connection.endMenuInteraction()
    XCTAssertFalse(seam.posts.contains { $0.kind == .appKit(2) }, "the hold still relies on it")
    connection.endFocusHold()
    XCTAssertEqual(seam.posts.map(\.kind).last, .appKit(2))
  }

  // MARK: Finding 1: a real activation cycle invalidates the held state

  /// The user brings the held app forward and switches away: the real deactivation clears the app's synthetic active
  /// state, so the next action re-establishes the activation (the vendor's tap updates its beliefs on real activation
  /// events, F §5.5's FUN_10072fd24). Driven through the production observer on a private notification center.
  func testARealActivationCycleMakesTheNextActionActivateAgain() throws {
    let seam = GuardSeam(frontmost: user)
    let connection = connection()
    let center = NotificationCenter()
    let observers = observeRealActivations(center, registry: activations)
    defer { observers.forEach(center.removeObserver) }
    let me = NSRunningApplication.current
    var meta = meta()
    try hold(connection, seam, pid: me.processIdentifier, meta: &meta)
    XCTAssertEqual(seam.posts.filter { $0.kind == .appKit(1) }.count, 1)

    for name in [NSWorkspace.didActivateApplicationNotification, NSWorkspace.didDeactivateApplicationNotification] {
      center.post(name: name, object: nil, userInfo: [NSWorkspace.applicationUserInfoKey: me])
    }
    var next = self.meta()
    try hold(connection, seam, pid: me.processIdentifier, meta: &next)
    XCTAssertEqual(seam.posts.filter { $0.kind == .appKit(1) }.count, 2, "re-established after the real cycle")
    XCTAssertNotNil(next.activationGuardMs, "with its own guard")
    XCTAssertEqual(activations.holders(me.processIdentifier), 1, "the same hold, not a second holder")

    var again = self.meta()
    try hold(connection, seam, pid: me.processIdentifier, meta: &again)
    XCTAssertEqual(seam.posts.filter { $0.kind == .appKit(1) }.count, 2, "and held again after that")
    connection.endFocusHold()
    XCTAssertEqual(seam.posts.map(\.kind).last, .appKit(2))
  }

  /// A hold whose app went through a real cycle and saw no action since is released without a deactivation: the
  /// system already withdrew the synthetic state, and a stray subtype 2 is not posted into the app.
  func testAHoldInvalidatedByARealCycleIsReleasedWithoutADeactivation() throws {
    let seam = GuardSeam(frontmost: user)
    let connection = connection()
    var meta = meta()
    try hold(connection, seam, meta: &meta)
    activations.realActivationChanged(target)
    connection.endFocusHold()
    XCTAssertFalse(seam.posts.contains { $0.kind == .appKit(2) })
    XCTAssertEqual(activations.holders(target), 0)
  }

  func testARealCycleOfAnotherProcessLeavesTheHoldAlone() throws {
    let seam = GuardSeam(frontmost: user)
    let connection = connection()
    var meta = meta()
    try hold(connection, seam, meta: &meta)
    activations.realActivationChanged(user)
    try hold(connection, seam, meta: &meta)
    XCTAssertEqual(seam.posts.filter { $0.kind == .appKit(1) }.count, 1)
  }

  /// #200: a click inside a held activation runs no activation of its own, and its mouse down raises the window by
  /// AppKit's rule all the same: it takes a hold of its own for the delivery guard, which raises the user's window back.
  func testAClickInsideAHeldActivationIsGuardedUnderAHoldOfItsOwn() throws {
    let seam = GuardSeam(frontmost: user)
    let connection = connection()
    var meta = meta()
    try hold(connection, seam, meta: &meta)
    let holds = seam.holds, releases = seam.releases
    seam.targetAbove = false
    seam.onMouseDown = { seam.targetAbove = true }
    var clickMeta = self.meta()
    try deliverClick(clickTarget(), route: .activation, button: .left, count: 1, activation: activation(seam), activations: activations,
                     targetActive: { false }, post: seam.system.post, meta: &clickMeta)
    XCTAssertEqual(seam.holds, holds + 1)
    XCTAssertEqual(seam.releases, releases + 1)
    XCTAssertEqual(clickMeta.delivery?.restores, 1)
    XCTAssertEqual(seam.targetAbove, false)
    XCTAssertNil(clickMeta.activationGuardMs, "the click shared the held activation")
    let delivery = try XCTUnwrap(clickMeta.delivery), heldAt = try XCTUnwrap(seam.heldAt)
    XCTAssertGreaterThan(heldAt, 0, "the click's own hold, taken after the held activation's")
    XCTAssertEqual(Double(delivery.releasedAt - delivery.holdStartedAt), try XCTUnwrap(seam.releasedAt) - heldAt,
                   "the hold's start is the guard's own, on the release's Unix clock")
  }

  /// #200: inside a held activation the delivery guard takes its own hold before the events; the action interval starts
  /// as the events go out, after that setup (InputMeta.posting's contract).
  func testAClickInsideAHeldActivationStartsItsIntervalAtTheEventsAfterTheGuardsSetup() throws {
    let seam = GuardSeam(frontmost: user)
    let connection = connection()
    var meta = meta()
    try hold(connection, seam, meta: &meta)
    var heldAtUnix: Int64?
    seam.onHold = { heldAtUnix = unixMilliseconds(); usleep(30_000) }
    var clickMeta = self.meta()
    try deliverClick(clickTarget(), route: .activation, button: .left, count: 1, activation: activation(seam), activations: activations,
                     targetActive: { false }, post: seam.system.post, meta: &clickMeta)
    XCTAssertGreaterThanOrEqual(try XCTUnwrap(clickMeta.startedAt), try XCTUnwrap(heldAtUnix) + 30, "after the guard's hold was taken")
  }

  /// #200: a click on another window of the held process (a dialog) is guarded on that window, not on the one the held
  /// activation was taken for.
  func testAClickOnAnotherWindowOfTheHeldProcessIsGuardedOnThatWindow() throws {
    let seam = GuardSeam(frontmost: user)
    let connection = connection()
    var meta = meta()
    try hold(connection, seam, meta: &meta)
    seam.windowsAbove = []
    seam.onMouseDown = { seam.windowsAbove = [77] }
    let dialog = ClickTarget(point: CGPoint(x: 300, y: 400), windowFrame: window, windowID: 77, pid: target)
    var clickMeta = self.meta()
    try deliverClick(dialog, route: .activation, button: .left, count: 1, activation: activation(seam), activations: activations,
                     targetActive: { false }, post: seam.system.post, meta: &clickMeta)
    XCTAssertEqual(clickMeta.delivery?.restores, 1, "the dialog's raise was seen and undone")
    XCTAssertEqual(clickMeta.delivery?.raiseLeft, false)
    XCTAssertEqual(seam.windowsAbove, [])
  }

  // MARK: Finding 2: a per-action activation leases the process's activation

  private func clickTarget() -> ClickTarget {
    ClickTarget(point: CGPoint(x: 300, y: 400), windowFrame: window, windowID: 41, pid: target)
  }

  private func mouseKinds(_ seam: GuardSeam) -> [GuardPost.Kind] { seam.posts.map(\.kind) }

  /// A hold is held; a synthesized click leases the same process; the hold ends while the click is under way (another
  /// connection's close, a switch, the idle bound). The deactivation waits for the click's own release.
  func testAHoldEndingMidClickDoesNotDeactivateBeforeTheClickEnds() throws {
    let seam = GuardSeam(frontmost: user)
    let connection = connection()
    var meta = meta()
    try hold(connection, seam, meta: &meta)
    let before = seam.posts.count
    var clickMeta = self.meta()
    try deliverClick(clickTarget(), route: .activation, button: .left, count: 1, activation: activation(seam), activations: activations,
                     targetActive: { false }, beforePosting: { connection.endFocusHold() }, post: seam.system.post, meta: &clickMeta)
    let during = Array(seam.posts[before...]).map(\.kind)
    XCTAssertEqual(during, [.mouse(.leftMouseDown), .mouse(.leftMouseUp), .appKit(2)],
                   "no second activation, the click's events, and the deactivation only after them")
    XCTAssertNil(clickMeta.activationGuardMs, "the click shared the held activation")
    XCTAssertEqual(activations.holders(target), 0)
  }

  /// The reverse: a click's per-action activation runs first, and a hold is taken on the same process while the click
  /// is under way. The click's teardown leaves the newly held process active; the hold's end withdraws it.
  func testAClickEndingAfterAHoldBeganLeavesTheHeldProcessActive() throws {
    let seam = GuardSeam(frontmost: user)
    let connection = connection()
    var clickMeta = meta()
    var holdMeta = meta()
    try deliverClick(clickTarget(), route: .activation, button: .left, count: 1, activation: activation(seam), activations: activations,
                     targetActive: { false }, beforePosting: { try self.hold(connection, seam, meta: &holdMeta) },
                     post: seam.system.post, meta: &clickMeta)
    XCTAssertEqual(seam.posts.filter { $0.kind == .appKit(1) }.count, 1, "the hold shared the click's activation")
    XCTAssertFalse(seam.posts.contains { $0.kind == .appKit(2) }, "the click's teardown never withdraws a held process")
    XCTAssertEqual(activations.holders(target), 1)
    connection.endFocusHold()
    XCTAssertEqual(seam.posts.map(\.kind).last, .appKit(2))
  }

  // MARK: #261's hold join (the Decision Log's 2026-11-05 entry): a pointer re-arms its own connection's spent hold

  private let outside = CGPoint(x: -1, y: 1441)

  /// Chrome's activation: its point outside the frame, so a no-click holder spends the arm with the inert click there.
  private func chrome(_ seam: GuardSeam, framed: Bool = true) -> FakeActivation {
    seam.activationPoint = outside
    return FakeActivation(pid: target, window: AXUIElementCreateApplication(target), windowFrame: framed ? window : nil, windowID: 41,
                          system: seam.system)
  }

  /// A ⌘ key equivalent's focus hold on Chrome.
  private func holdChrome(_ connection: ConnectionState, _ seam: GuardSeam, framed: Bool = true, meta: inout InputMeta) throws {
    try holdFocus(app: "chrome", pid: target, connection: connection, activations: activations, activation: { self.chrome(seam, framed: framed) },
                  beforeActivating: {}, meta: &meta)
  }

  private func meta(connection id: Int) -> InputMeta {
    InputMeta(ExecutionContext(connection: ConnectionState(id: id, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
  }

  /// A left coordinate click into Chrome on connection 1's request.
  private func clickChrome(_ seam: GuardSeam, beforePosting: () throws -> Void = {}) throws -> InputMeta {
    var clickMeta = meta()
    try deliverClick(clickTarget(), route: .activation, button: .left, count: 1, activation: chrome(seam), activations: activations,
                     targetActive: { false }, beforePosting: beforePosting, post: seam.system.post, meta: &clickMeta)
    return clickMeta
  }

  private let inertClick: [GuardPost.Kind] = [.appKit(1), .mouse(.leftMouseDown), .mouse(.leftMouseUp)]
  private let click: [GuardPost.Kind] = [.mouse(.leftMouseDown), .mouse(.leftMouseUp)]

  /// ⌘L into background Chrome, then a coordinate click into it within the hold: the hold's inert click spent the arm,
  /// so the click's own mouse down would meet a key window of an app believing itself active (#200's ordering click).
  /// The click withdraws the hold's activation and runs its own, whose arm its mouse down consumes with no ordering; the
  /// focus hold carries over under it, the next ⌘ key runs inside it, and the hold's end withdraws it once.
  func testAPointerJoiningItsOwnConnectionsSpentHoldReArmsIt() throws {
    let seam = GuardSeam(frontmost: user)
    let connection = connection()
    var keys = meta()
    try holdChrome(connection, seam, meta: &keys)
    XCTAssertEqual(mouseKinds(seam), inertClick, "the hold spent its arm early")
    var during = 0
    let clicked = try clickChrome(seam, beforePosting: { during = self.activations.holders(self.target) })
    XCTAssertEqual(Array(mouseKinds(seam).dropFirst(3)), [.appKit(2), .appKit(1)] + click, "withdrawn, re-armed, then the click alone")
    XCTAssertEqual(seam.posts.dropFirst(5).first?.location, clickTarget().point, "the click's own mouse down consumed the new arm")
    XCTAssertEqual(clicked.activationClickKind, .action)
    XCTAssertEqual(clicked.wire["activationClickKind"] as? NSDictionary, ["kind": "action", "when": "consumedByAction"])
    XCTAssertEqual(clicked.activationClick, .outsideFrame, "recorded as a run's")
    XCTAssertNotNil(clicked.activationGuardMs, "the new activation's guard ran")
    XCTAssertEqual(during, 2, "the hold's share kept beside the click's")
    XCTAssertEqual(activations.holders(target), 1, "the focus hold carries over")

    var next = meta()
    try holdChrome(connection, seam, meta: &next)
    XCTAssertEqual(seam.posts.count, 7, "the next ⌘ key runs inside the new activation, its window key")
    XCTAssertNil(next.activationGuardMs)
    connection.endFocusHold()
    XCTAssertEqual(mouseKinds(seam).last, .appKit(2))
    XCTAssertEqual(seam.posts.filter { $0.kind == .appKit(2) }.count, 2, "the old activation's withdrawal and the hold's end, once each")
    XCTAssertEqual(seam.posts.filter { $0.kind == .mouse(.leftMouseDown) }.count, 2, "no release click")
    XCTAssertEqual(activations.holders(target), 0)
  }

  /// Unchanged: a holder with no left mouse down of its own (keys, an element action) joining an unconsumed hold posts
  /// the kept inert click before its input, and one joining a spent hold, on its own connection too, posts nothing.
  func testANoClickJoinerStillConsumesEarlyAndNeverReArms() throws {
    let seam = GuardSeam(frontmost: user)
    var pointerMeta = meta()
    let pointer = try activations.acquire(pid: target, holder: ActivationHolder(connection: 1), postsLeftMouseDown: true, beforeActivating: {},
                                          make: { self.chrome(seam) }, meta: &pointerMeta)
    XCTAssertEqual(mouseKinds(seam), [.appKit(1)], "the pointer holder's arm, unconsumed")
    let connection = connection()
    var keys = meta()
    try holdChrome(connection, seam, meta: &keys)
    XCTAssertEqual(mouseKinds(seam), inertClick, "the joiner consumed the arm before its input")
    XCTAssertEqual(keys.activationClickKind, .inertOutside(.activationPoint, .early))
    _ = pointer()
    var forced = meta()
    let key = try activations.acquire(pid: target, holder: ActivationHolder(connection: 1), beforeActivating: {}, make: {
      XCTFail("shared, not made")
      return self.chrome(seam)
    }, meta: &forced)
    XCTAssertEqual(seam.posts.count, 3, "spent already: nothing more, no re-arming")
    XCTAssertNil(forced.activationClickKind)
    XCTAssertEqual(activations.holders(target), 2)
    _ = key()
    connection.endFocusHold()
    XCTAssertEqual(mouseKinds(seam), inertClick + [.appKit(2)])
  }

  /// Unchanged: a pointer joining a hold whose arm is still set (its click skipped: no frame to place it outside) shares
  /// it, and its own mouse down consumes that arm.
  func testAPointerJoiningAHoldWithItsArmStillSetSharesIt() throws {
    let seam = GuardSeam(frontmost: user)
    let connection = connection()
    var keys = meta()
    try holdChrome(connection, seam, framed: false, meta: &keys)
    XCTAssertEqual(mouseKinds(seam), [.appKit(1)])
    XCTAssertEqual(keys.activationClickKind, .skipped(.noFrame))
    let clicked = try clickChrome(seam)
    XCTAssertEqual(mouseKinds(seam), [.appKit(1)] + click, "no withdrawal, no second activation")
    XCTAssertNil(clicked.activationGuardMs, "the click shared the held activation")
    XCTAssertEqual(clicked.activationClickKind, .action, "its mouse down consumed the held arm")
    connection.endFocusHold()
    XCTAssertEqual(seam.posts.filter { $0.kind == .appKit(2) }.count, 1)
  }

  /// Today's join while another connection holds the activation, alone or beside the clicker's own hold: that holder may
  /// be mid-action under it, so it is never withdrawn (the click's raise is the delivery guard's to repair).
  func testAPointerJoiningAHoldOfAnotherConnectionSharesIt() throws {
    for ownHoldToo in [false, true] {
      let seam = GuardSeam(frontmost: user)
      let other = ConnectionState(id: 2, fd: -1, menuSpan: Clock().span(), focusHold: Clock().span())
      var otherKeys = meta(connection: 2)
      try holdChrome(other, seam, meta: &otherKeys)
      let own = connection()
      if ownHoldToo {
        var keys = meta()
        try holdChrome(own, seam, meta: &keys)
      }
      let clicked = try clickChrome(seam)
      XCTAssertEqual(mouseKinds(seam), inertClick + click, "no withdrawal, no second activation: own hold too \(ownHoldToo)")
      XCTAssertNil(clicked.activationGuardMs)
      own.endFocusHold()
      other.endFocusHold()
      XCTAssertEqual(seam.posts.filter { $0.kind == .appKit(2) }.count, 1)
      XCTAssertEqual(activations.holders(target), 0)
    }
  }

  /// Today's join while the clicker's own connection holds the activation for a recorded menu: withdrawing it could close
  /// the menu the model is about to click into.
  func testAPointerJoiningARecordedMenusSpanSharesIt() throws {
    let seam = GuardSeam(frontmost: user)
    let connection = connection()
    var menuMeta = meta()
    try recordHeldMenu(Engine.element(90), app: "chrome", pid: target, connection: connection, activations: activations,
                       activation: { self.chrome(seam) }, beforeActivating: {}, meta: &menuMeta)
    XCTAssertEqual(mouseKinds(seam), inertClick)
    let clicked = try clickChrome(seam)
    XCTAssertEqual(mouseKinds(seam), inertClick + click, "the menu's activation kept")
    XCTAssertNil(clicked.activationGuardMs)
    connection.endMenuInteraction()
    XCTAssertEqual(seam.posts.filter { $0.kind == .appKit(2) }.count, 1)
  }

  /// The re-arming's new activation fails its guard: the click is refused as a run's is, its activation undone; the old
  /// one stays withdrawn under the focus hold, whose share is kept, so its next ⌘ key activates again with its guard and
  /// its end withdraws that one once.
  func testAReArmingWhoseGuardFailsLeavesTheHoldToActivateAgain() throws {
    let seam = GuardSeam(frontmost: user)
    let connection = connection()
    var keys = meta()
    try holdChrome(connection, seam, meta: &keys)
    let failing = GuardSeam(frontmost: user, targetInFront: { _ in true })  // the new activation's window never stays behind
    var clickMeta = meta()
    XCTAssertThrowsError(try deliverClick(clickTarget(), route: .activation, button: .left, count: 1, activation: chrome(failing),
                                          activations: activations, targetActive: { false }, post: failing.system.post, meta: &clickMeta)) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "activationFailed")
    }
    XCTAssertEqual(mouseKinds(seam), inertClick + [.appKit(2)], "the hold's activation withdrawn")
    XCTAssertEqual(mouseKinds(failing), inertClick + [.appKit(2)], "the new one undone, its kept click at the release")
    XCTAssertNotNil(clickMeta.activationGuardMs)
    XCTAssertEqual(activations.holders(target), 1, "the focus hold keeps its share")

    var next = meta()
    try holdChrome(connection, seam, meta: &next)
    XCTAssertEqual(mouseKinds(seam), inertClick + [.appKit(2)] + inertClick, "activated again for the hold's next key")
    XCTAssertNotNil(next.activationGuardMs)
    connection.endFocusHold()
    XCTAssertEqual(mouseKinds(seam), inertClick + [.appKit(2)] + inertClick + [.appKit(2)])
    XCTAssertEqual(activations.holders(target), 0)
  }

  /// The review of 4ea25f9f..4d68fee4: a click that re-armed the hold and then stopped before its events (a user event)
  /// leaves the hold no set arm, so the hold's next ⌘ key reaches a key window.
  func testAReArmingClickStoppedBeforeItsEventsLeavesTheHeldKeyNoSetArm() throws {
    let seam = GuardSeam(frontmost: user)
    let connection = connection()
    var keys = meta()
    try holdChrome(connection, seam, meta: &keys)
    XCTAssertThrowsError(try clickChrome(seam, beforePosting: { throw userChanged("TextEdit") }))
    var next = meta()
    try holdChrome(connection, seam, meta: &next)
    XCTAssertEqual(mouseKinds(seam), inertClick + [.appKit(2)] + inertClick, "withdrawn, re-armed, and the arm consumed before the key")
    connection.endFocusHold()
    XCTAssertEqual(mouseKinds(seam), inertClick + [.appKit(2)] + inertClick + [.appKit(2)], "withdrawn once more, no release click")
    XCTAssertEqual(activations.holders(target), 0)
  }

  /// The release's guard: a re-arming pointer whose events were never made, leaving only no-click holders, posts the
  /// kept inert click as its share is released, recorded in its own meta as the release's.
  func testAReArmingPointerReleasedWithItsArmSetPostsTheKeptClick() throws {
    let seam = GuardSeam(frontmost: user)
    let connection = connection()
    var keys = meta()
    try holdChrome(connection, seam, meta: &keys)
    var pointerMeta = meta()
    XCTAssertThrowsError(try deliverPointer(to: target, route: .activation, activation: chrome(seam), activations: activations,
                                            postsLeftMouseDown: true, post: seam.system.post, meta: &pointerMeta) { [] }) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "eventCreationFailed")
    }
    XCTAssertEqual(mouseKinds(seam), inertClick + [.appKit(2)] + inertClick, "the kept click at the pointer's release")
    XCTAssertEqual(seam.posts.dropFirst(6).first?.location, outside)
    XCTAssertEqual(pointerMeta.activationClickKind, .inertOutside(.activationPoint, .release))
    XCTAssertEqual(activations.holders(target), 1)
    connection.endFocusHold()
    XCTAssertEqual(seam.posts.filter { $0.kind == .mouse(.leftMouseDown) }.count, 2, "no second release click")
  }

  /// The held path's guard: a ⌘ key inside a hold whose arm is set (a re-arming pointer's share still awaiting its own
  /// mouse down) posts the kept inert click before its input, recorded in its meta, as a no-click joiner does.
  func testAHeldKeyConsumesASetArmBeforeItsInput() throws {
    let seam = GuardSeam(frontmost: user)
    let connection = connection()
    var keys = meta()
    try holdChrome(connection, seam, meta: &keys)
    var pointerMeta = meta()
    let pointer = try activations.acquire(pid: target, holder: ActivationHolder(connection: 1), postsLeftMouseDown: true, beforeActivating: {},
                                          make: { self.chrome(seam) }, meta: &pointerMeta)
    XCTAssertEqual(mouseKinds(seam), inertClick + [.appKit(2), .appKit(1)], "re-armed, the arm set")
    var next = meta()
    try holdChrome(connection, seam, meta: &next)
    XCTAssertEqual(mouseKinds(seam), inertClick + [.appKit(2)] + inertClick, "consumed before the key")
    XCTAssertEqual(next.activationClickKind, .inertOutside(.activationPoint, .early))
    XCTAssertNil(next.activationGuardMs, "no activation ran for it")
    _ = pointer()
    XCTAssertEqual(seam.posts.count, 7, "nothing more at the pointer's release")
    connection.endFocusHold()
    XCTAssertEqual(mouseKinds(seam).last, .appKit(2))
  }

  /// The re-review of 4d68fee4..23d68dae: the held path runs the in-flight intervention check under the registry's lock
  /// before it may consume a set arm, so a user event stops the held key with nothing posted.
  func testAUserEventStopsAHeldKeyBeforeItConsumesASetArm() throws {
    let seam = GuardSeam(frontmost: user)
    let connection = connection()
    var keys = meta()
    try holdChrome(connection, seam, meta: &keys)
    var pointerMeta = meta()
    let pointer = try activations.acquire(pid: target, holder: ActivationHolder(connection: 1), postsLeftMouseDown: true, beforeActivating: {},
                                          make: { self.chrome(seam) }, meta: &pointerMeta)
    let armed = seam.posts.count
    var underLock = false
    var next = meta()
    XCTAssertThrowsError(try holdFocus(app: "chrome", pid: target, connection: connection, activations: activations,
                                       activation: { XCTFail("held, not made"); return self.chrome(seam) }, beforeActivating: {
                                         underLock = self.activations.isLocked
                                         throw userChanged("Chrome")
                                       }, meta: &next)) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "userIntervened")
    }
    XCTAssertTrue(underLock, "the check runs once the registry's lock is held")
    XCTAssertEqual(seam.posts.count, armed, "nothing posted: the arm is left set")
    XCTAssertNil(next.activationClickKind)
    _ = pointer()
    connection.endFocusHold()
    XCTAssertEqual(mouseKinds(seam), inertClick + [.appKit(2)] + inertClick + [.appKit(2)], "the kept click at the pointer's release")
  }
}
