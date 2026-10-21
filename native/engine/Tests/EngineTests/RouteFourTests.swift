import AppKit
import CoreGraphics
import Foundation
import XCTest
@testable import Engine

// M2a.1's routes (the own native engine spec, Design "Input" route 4; Interfaces, InputRoute and the input meta): route
// 4, the foreground assist, reachable only through the owner's per-app override; `routeAdvice` after route 3's guard has
// failed three actions in a row for an app; the intervention check between the activation and the click's events; and
// the new meta keys. Everything runs over the recorded seam: nothing is posted, activated or raised.

// MARK: The route choice with the override

final class RouteFourChoiceTests: XCTestCase {
  func testRouteFourIsFourOnTheWire() {
    XCTAssertEqual(String(data: encodeJSON(["r": InputRoute.foreground.wire])!, encoding: .utf8), #"{"r":4}"#)
  }

  func testOnlyAnAppTheOwnerNamedGetsRouteFour() {
    let routes = ["com.example.canvas": 4]
    XCTAssertTrue(routeFourOverride("com.example.canvas", routes: routes))
    XCTAssertFalse(routeFourOverride("com.apple.TextEdit", routes: routes))
    XCTAssertFalse(routeFourOverride(nil, routes: routes), "an app without a bundle id is never named")
    XCTAssertFalse(routeFourOverride("com.example.canvas", routes: [:]))
  }

  func testTheOverrideTurnsEverySynthesizedClickIntoRouteFourAndLeavesRouteOneAlone() throws {
    XCTAssertEqual(synthesizedClickRoute(forced: nil, foreground: false), .activation)
    XCTAssertEqual(synthesizedClickRoute(forced: nil, foreground: true), .foreground)
    XCTAssertEqual(synthesizedClickRoute(forced: .plainPost, foreground: true), .plainPost, "a spike cell's forced route wins")
    XCTAssertEqual(coordinateClickRoute(forced: nil, foreground: true), .foreground)
    XCTAssertEqual(coordinateClickRoute(forced: nil), .activation)
    let synthesized = synthesizedClickRoute(forced: nil, foreground: true)
    XCTAssertEqual(try elementClickPlan(forced: nil, button: .right, count: 1, role: "AXButton", actions: ["AXPress"], synthesized: synthesized) { false },
                   .synthesized(.foreground))
    XCTAssertEqual(try elementClickPlan(forced: nil, button: .left, count: 1, role: "AXButton", actions: ["AXPress"], synthesized: synthesized) { false },
                   .action("AXPress"), "an advertised action needs no front: route 1 stays")
  }
}

// MARK: Route 4's delivery

final class ForegroundAssistTests: XCTestCase {
  private let target: pid_t = 990_021, user: pid_t = 990_022
  private let frame = CGRect(x: 80, y: 60, width: 610, height: 860)

  private func clickTarget() -> ClickTarget {
    ClickTarget(point: CGPoint(x: 300, y: 400), windowFrame: frame, windowID: 41, pid: target)
  }

  private func meta() -> InputMeta {
    InputMeta(ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
  }

  /// Activate the app, post, then restore the previously frontmost app and its key window (Design, route 4).
  func testTheAppIsBroughtToTheFrontThenTheUsersAppAndWindowAreRestored() throws {
    let seam = GuardSeam(frontmost: user, reactivationTakesFront: true)
    var order: [String] = []
    try ForegroundAssist(appPid: target, system: seam.system).run {
      order.append("deliver with \(seam.frontmost.map(String.init) ?? "none") in front")
    }
    XCTAssertEqual(order, ["deliver with \(target) in front"])
    XCTAssertEqual(seam.reactivated, [target, user], "the app, then the user's app again")
    XCTAssertEqual(seam.frontmost, user)
    XCTAssertEqual(seam.raises, 1, "the user's key window raised again")
  }

  func testAnAppAlreadyInFrontIsNeitherActivatedNorRestored() throws {
    let seam = GuardSeam(frontmost: target, reactivationTakesFront: true)
    var delivered = 0
    try ForegroundAssist(appPid: target, system: seam.system).run { delivered += 1 }
    XCTAssertEqual(delivered, 1)
    XCTAssertEqual(seam.reactivated, [])
    XCTAssertEqual(seam.raises, 0)
  }

  /// An app that never comes to the front is refused as activationFailed with nothing delivered, and the user's app is
  /// restored.
  func testAnAppThatNeverComesToTheFrontIsRefusedAndNothingIsDelivered() {
    let seam = GuardSeam(frontmost: user, reactivates: false)
    var delivered = 0
    XCTAssertThrowsError(try ForegroundAssist(appPid: target, system: seam.system).run { delivered += 1 }) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "activationFailed")
      XCTAssertTrue((error as? EngineError)?.message.contains("front") == true)
    }
    XCTAssertEqual(delivered, 0)
    XCTAssertEqual(seam.reactivated.first, target)
    XCTAssertGreaterThanOrEqual(seam.clock, foregroundWaitMs, "the wait is bounded")
    XCTAssertLessThan(seam.clock, foregroundWaitMs + 100)
  }

  func testADeliveryThatFailsStillRestoresTheUsersApp() {
    let seam = GuardSeam(frontmost: user, reactivationTakesFront: true)
    XCTAssertThrowsError(try ForegroundAssist(appPid: target, system: seam.system).run { throw userChanged("x") })
    XCTAssertEqual(seam.reactivated, [target, user])
  }

  /// The activation takes and the click is posted, but the user's app does not come back: the action fails
  /// foregroundRestoreFailed, within the bound, and its meta still says the click was posted.
  func testARestoreThatDoesNotTakeIsReportedWithTheClickPosted() {
    let seam = GuardSeam(frontmost: user, reactivationTakesFront: true)
    seam.reactivationRefused = [user]
    var meta = meta()
    XCTAssertThrowsError(try deliverClick(clickTarget(), route: .foreground, button: .left, count: 1, activation: nil,
                                          foreground: ForegroundAssist(appPid: target, system: seam.system), targetActive: { true },
                                          post: seam.system.post, meta: &meta)) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "foregroundRestoreFailed")
      XCTAssertTrue((error as? EngineError)?.message.contains("Do not repeat the click") == true)
    }
    XCTAssertEqual(seam.posts.map(\.kind), [.mouse(.leftMouseDown), .mouse(.leftMouseUp)])
    XCTAssertNotNil(meta.startedAt, "the click was posted")
    XCTAssertNotNil(meta.endedAt)
    XCTAssertEqual(meta.inputRoute, .foreground)
    XCTAssertEqual(seam.reactivated, [target, user])
    XCTAssertEqual(seam.raises, 1, "the user's window is still raised")
    XCTAssertGreaterThanOrEqual(seam.clock, foregroundWaitMs, "the restore's read is bounded")
    XCTAssertLessThan(seam.clock, foregroundWaitMs + 100)
  }

  /// A delivery that failed is the error reported, even when the restore did not take either.
  func testADeliverysFailureComesBeforeTheRestores() {
    let seam = GuardSeam(frontmost: user, reactivationTakesFront: true)
    seam.reactivationRefused = [user]
    XCTAssertThrowsError(try ForegroundAssist(appPid: target, system: seam.system).run { throw userChanged("x") }) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "userIntervened")
    }
  }

  func testRouteFourPostsThePlainClickWhileTheAppIsInFront() throws {
    let seam = GuardSeam(frontmost: user, reactivationTakesFront: true)
    var meta = meta()
    var frontAtPost: [pid_t?] = []
    var system = seam.system
    let post = system.post
    system.post = { event, pid in frontAtPost.append(seam.frontmost); post(event, pid) }
    try deliverClick(clickTarget(), route: .foreground, button: .left, count: 1, activation: nil,
                     foreground: ForegroundAssist(appPid: target, system: seam.system), targetActive: { true }, post: system.post, meta: &meta)
    XCTAssertEqual(seam.posts.map(\.kind), [.mouse(.leftMouseDown), .mouse(.leftMouseUp)], "no fake activation, no ⌘")
    XCTAssertEqual(seam.posts.compactMap(\.flags), [[], []])
    XCTAssertEqual(frontAtPost, [target, target])
    XCTAssertEqual(meta.inputRoute, .foreground)
    XCTAssertNotNil(meta.startedAt)
    XCTAssertEqual(seam.frontmost, user)
  }
}

// MARK: The intervention check inside a click

final class ClickInterventionTests: XCTestCase {
  private let target: pid_t = 990_031, user: pid_t = 990_032
  private let frame = CGRect(x: 80, y: 60, width: 610, height: 860)

  /// The check between the activation and the click's own events: a user event attributed during the activation stops
  /// the click before any of its events is posted, and the activation is withdrawn.
  func testAnInterventionDuringTheActivationStopsTheClickBeforeItsEvents() {
    let seam = GuardSeam(frontmost: user)
    let activation = FakeActivation(pid: target, window: AXUIElementCreateApplication(target), windowFrame: frame, windowID: 41, system: seam.system)
    var meta = InputMeta(ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
    XCTAssertThrowsError(try deliverClick(ClickTarget(point: CGPoint(x: 300, y: 400), windowFrame: frame, windowID: 41, pid: target),
                                          route: .activation, button: .left, count: 1, activation: activation, targetActive: { false },
                                          beforePosting: { throw userChanged("/Applications/TextEdit.app") },
                                          post: seam.system.post, meta: &meta)) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "userIntervened")
    }
    XCTAssertEqual(seam.posts.map(\.kind), [.appKit(1), .appKit(2)], "the activation and its withdrawal, never the click")
    XCTAssertNil(meta.startedAt)
  }
}

// MARK: routeAdvice

final class RouteAdviceTests: XCTestCase {
  func testThreeGuardFailuresInARowAdviseTheOverride() {
    let tracker = RouteAdviceTracker()
    XCTAssertNil(tracker.record("com.example.canvas", guardFailed: true))
    XCTAssertNil(tracker.record("com.example.canvas", guardFailed: true))
    let advice = tracker.record("com.example.canvas", guardFailed: true)
    XCTAssertNotNil(advice)
    XCTAssertTrue(advice?.contains(#""routes": {"com.example.canvas": 4}"#) == true, advice ?? "")
    XCTAssertTrue(advice?.contains("~/.config/cua/engine.json") == true, advice ?? "")
    XCTAssertNotNil(tracker.record("com.example.canvas", guardFailed: true), "the fourth still advises")
    XCTAssertEqual(tracker.advised, ["com.example.canvas"], "doctor's list")
  }

  func testASuccessResetsTheRunAndAppsAreCountedApart() {
    let tracker = RouteAdviceTracker()
    _ = tracker.record("a", guardFailed: true)
    _ = tracker.record("a", guardFailed: true)
    _ = tracker.record("b", guardFailed: true)
    XCTAssertNil(tracker.record("a", guardFailed: false))
    XCTAssertNil(tracker.record("a", guardFailed: true), "the run starts again")
    XCTAssertNil(tracker.record("b", guardFailed: true))
    XCTAssertNotNil(tracker.record("b", guardFailed: true))
    XCTAssertEqual(tracker.advised, ["b"])
    _ = tracker.record("b", guardFailed: false)
    XCTAssertEqual(tracker.advised, [], "a success takes the app off the list")
  }

  func testAnAppWithoutABundleIdIsNeverAdvised() {
    let tracker = RouteAdviceTracker()
    for _ in 0..<4 { XCTAssertNil(tracker.record(nil, guardFailed: true)) }
  }
}

// MARK: The input meta's new keys

final class InputMetaKeysTests: XCTestCase {
  private func meta() -> InputMeta {
    InputMeta(ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 70, deadline: 2, lineage: nil))
  }

  func testTheOptionalKeysAppearOnlyWhenSet() {
    let wire = meta().wire
    for key in ["intervention", "entered", "routeAdvice"] { XCTAssertNil(wire[key], key) }
    XCTAssertEqual(wire["hidIdleMs"] as? Int, 70, "the machine-wide reading until the guard says otherwise")
  }

  func testInterventionOffEnteredAndAdvice() {
    var meta = meta()
    meta.interventionOff = true
    meta.entered = 7
    meta.routeAdvice = "advice"
    let wire = meta.wire
    XCTAssertEqual(wire["intervention"] as? String, "off")
    XCTAssertEqual(wire["entered"] as? Int, 7)
    XCTAssertEqual(wire["routeAdvice"] as? String, "advice")
  }

  /// With detection on, hidIdleMs is the guard's reading: since the app's last attributed event, null when none.
  func testTheGuardsIdleReadingReplacesTheMachineWideOne() throws {
    var meta = meta()
    meta.apply(try InterventionGuard.check(app: "x", cleared: 1, now: 9_000, latest: { AttributedEvent(sequence: 1, at: 0) }))
    XCTAssertEqual(meta.wire["hidIdleMs"] as? Int, 1)
    XCTAssertNil(meta.wire["intervention"])
    var none = self.meta()
    none.apply(try InterventionGuard.check(app: "x", cleared: 0, now: 9_000, latest: { nil }))
    XCTAssertTrue(none.wire["hidIdleMs"] is NSNull)
    var off = self.meta()
    off.apply(InterventionGuard.off(app: "x"))
    XCTAssertEqual(off.wire["hidIdleMs"] as? Int, 70)
    XCTAssertEqual(off.wire["intervention"] as? String, "off")
  }

  /// The pre-action refusal carries the reading too: the matrix's validity rule reads `hidIdleMs` on refusals.
  func testARefusingGuardsReadingReachesTheMetaBeforeItRefuses() {
    var meta = meta()
    let guarding = InterventionGuard.reading(app: "x", cleared: 0, now: 3_000, latest: { AttributedEvent(sequence: 1, at: 0) })
    meta.apply(guarding)
    XCTAssertThrowsError(try guarding.checkBeforePosting()) { error in
      XCTAssertEqual((error as? EngineError)?.message, stillInteracting("x").message)
    }
    XCTAssertEqual(withMeta(stillInteracting("x"), meta).extra["meta"].flatMap { ($0 as? [String: Any])?["hidIdleMs"] as? Int }, 1)
  }
}
