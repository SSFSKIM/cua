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

  /// A per-action activation (a synthesized click's, a paste's) on a process the hold keeps active neither activates it
  /// again nor withdraws it after its events, which would leave the hold believing in an activation the app no longer has.
  func testAPerActionActivationOnAHeldProcessNeitherActivatesNorWithdraws() throws {
    let seam = GuardSeam(frontmost: user)
    var system = seam.system
    system.held = { $0 == self.target }
    let perAction = FakeActivation(pid: target, window: AXUIElementCreateApplication(target), windowFrame: window, windowID: 41, system: system)
    try perAction.activate()
    perAction.deactivate()
    XCTAssertTrue(seam.posts.isEmpty)
    XCTAssertNil(perAction.guardMs, "no guard ran")

    let other = FakeActivation(pid: panel, window: AXUIElementCreateApplication(panel), windowFrame: window, windowID: 43, system: system)
    try other.activate()
    XCTAssertEqual(seam.posts.first?.kind, .appKit(1), "a process no hold keeps is activated as before")
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
}
