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
}
