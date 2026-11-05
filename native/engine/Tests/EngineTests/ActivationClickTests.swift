import AppKit
import CoreGraphics
import Foundation
import XCTest
@testable import Engine

// Route 3's activation click (Activation.swift; the Decision Log's 2026-10-22 review entry and #187's of 2026-11-01):
// posted at the window's AXActivationPoint only when a hit-test there answers the window itself or window chrome that is
// not a control (U13's reading on TextEdit, Finder and Electron); otherwise an inert click outside the window's frame
// takes its place, so the activation's arm is always consumed, unless nothing can be stamped or placed. The meta says
// which. Everything runs over the recorded guard seam.

/// Every event route 3 was asked to post, kept whole (the click's window fields are read from them).
private final class PostedCopies {
  var all: [CGEvent] = []
}

final class ActivationClickTests: XCTestCase {
  private let target: pid_t = 990_001, user: pid_t = 990_002
  private let window = CGRect(x: 80, y: 60, width: 610, height: 860)
  private let point = CGPoint(x: 110, y: 76)

  private func decide(_ point: CGPoint?, frame: CGRect? = nil, sparing: CGRect? = nil, hit: ActivationHit?) -> ActivationClick {
    activationClickDecision(point, windowFrame: frame ?? window, sparing: sparing) { hit }
  }

  func testTheClickIsPostedOnTheWindowOrOnChromeThatIsNoControl() {
    XCTAssertEqual(decide(point, hit: ActivationHit(role: "AXWindow", actions: ["AXRaise"])), .posted)
    XCTAssertEqual(decide(point, hit: ActivationHit(role: "AXStaticText", actions: [])), .posted, "the title")
    XCTAssertEqual(decide(point, hit: ActivationHit(role: "AXGroup", actions: ["AXShowMenu"])), .posted, "a context menu is no left click")
  }

  func testTheClickIsSkippedOnAControlOutsideTheFrameOrWithoutAnAnswer() {
    XCTAssertEqual(decide(point, hit: ActivationHit(role: "AXButton", actions: ["AXPress"])), .control)
    XCTAssertEqual(decide(point, hit: ActivationHit(role: "AXCheckBox", actions: [])), .control, "a control by its role")
    XCTAssertEqual(decide(point, hit: ActivationHit(role: "AXGroup", actions: ["AXPress"])), .control, "a pressable group")
    XCTAssertEqual(decide(point, hit: ActivationHit(role: nil, actions: [])), .control, "an element of no known role is not trusted")
    XCTAssertEqual(decide(point, hit: nil), .hitTestFailed)
    XCTAssertEqual(decide(CGPoint(x: -1, y: 1441), hit: ActivationHit(role: "AXWindow", actions: [])), .outsideFrame, "Chrome's corner")
    XCTAssertEqual(decide(CGPoint(x: 690, y: 400), hit: ActivationHit(role: "AXWindow", actions: [])), .outsideFrame, "the far edge")
    XCTAssertEqual(decide(nil, hit: ActivationHit(role: "AXWindow", actions: [])), .noPoint)
    XCTAssertEqual(activationClickDecision(point, windowFrame: nil, sparing: nil) { nil }, .outsideFrame, "no frame to place it in")
    XCTAssertEqual(decide(point, sparing: CGRect(x: 100, y: 70, width: 40, height: 20), hit: ActivationHit(role: "AXWindow", actions: [])),
                   .spared, "a middle click's target")
  }

  private func activation(_ seam: GuardSeam) -> FakeActivation {
    seam.activationPoint = point
    return FakeActivation(pid: target, window: AXUIElementCreateApplication(target), windowFrame: window, windowID: 41, system: seam.system)
  }

  func testAControlAtThePointTakesNoClickThereButTheInertOneOutsideTheFrame() throws {
    let seam = GuardSeam(frontmost: user)
    seam.activationHit = ActivationHit(role: "AXButton", actions: ["AXPress"])
    let subject = activation(seam)
    try subject.activate()
    subject.deactivate()
    XCTAssertEqual(seam.posts.map(\.kind), [.appKit(1), .mouse(.leftMouseDown), .mouse(.leftMouseUp), .appKit(2)],
                   "the inert click, the activation still withdrawn")
    XCTAssertFalse(seam.posts.contains { $0.location == point }, "nothing at the control")
    XCTAssertEqual(subject.click, .control)
    XCTAssertEqual(subject.clickKind, .inertOutside(.offset, .early))
  }

  /// Route 3's synthesized click keeps working with the click posted on the window, and its meta says so; with a control
  /// at the point no click goes before the click itself, whose own mouse down consumes the arm, and the meta names the
  /// reason and the kind.
  func testRouteThreesSynthesizedClickKeepsWorkingAndItsMetaSaysWhatTheActivationClickDid() throws {
    for (hit, expected, clicks, kind) in [(ActivationHit(role: "AXWindow", actions: []), ActivationClick.posted, 2, "activationPoint"),
                                          (ActivationHit(role: "AXButton", actions: ["AXPress"]), .control, 1, "action")] {
      let seam = GuardSeam(frontmost: user)
      seam.activationHit = hit
      var meta = InputMeta(ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
      try deliverClick(ClickTarget(point: CGPoint(x: 300, y: 400), windowFrame: window, windowID: 41, pid: target), route: .activation,
                       button: .left, count: 1, activation: activation(seam), targetActive: { false }, post: seam.system.post, meta: &meta)
      let downs = seam.posts.filter { $0.kind == .mouse(.leftMouseDown) }
      XCTAssertEqual(downs.count, clicks, "the click itself always lands, after the activation's click at an inert point")
      XCTAssertEqual(downs.last?.location, CGPoint(x: 300, y: 400))
      XCTAssertEqual(seam.posts.map(\.kind).last, .appKit(2))
      XCTAssertEqual(meta.activationClick, expected)
      XCTAssertEqual(meta.wire["activationClick"] as? String, expected.rawValue)
      XCTAssertEqual((meta.wire["activationClickKind"] as? [String: Any])?["kind"] as? String, kind)
    }
  }

  // MARK: An activation never leaves an arm (#187, the design session's ruling of 2026-11-01)

  /// The inert click's offset point for `window`: 24 pt left of the frame, at its mid-height, in global coordinates.
  private var offsetPoint: CGPoint { CGPoint(x: window.minX - 24, y: window.midY) }

  /// One activation over the seam, `at` the window's AXActivationPoint and `hit` there; it, the seam and every event posted.
  private func activated(_ at: CGPoint?, hit: ActivationHit? = ActivationHit(role: "AXWindow", actions: []), placed: Bool = true,
                         id: CGWindowID? = 41, sparing: CGRect? = nil) throws -> (FakeActivation, GuardSeam, [CGEvent]) {
    let seam = GuardSeam(frontmost: user)
    seam.activationPoint = at
    seam.activationHit = hit
    let events = PostedCopies()
    var system = seam.system
    let post = system.post
    system.post = { event, pid in
      events.all.append(event.copy()!)
      post(event, pid)
    }
    let subject = FakeActivation(pid: target, window: AXUIElementCreateApplication(target), windowFrame: placed ? window : nil, windowID: id,
                                 sparing: sparing, system: system)
    try subject.activate()
    return (subject, seam, events.all)
  }

  /// Every skip of the click at the activation point now posts the inert click instead: a left down and up stamped with
  /// the window's number (the NSEvent's, and fields 91 and 92), no flags, at the activation point itself when it lies at
  /// least 8 pt beyond the frame, else 24 pt left of the frame at mid-height. Right after subtype 1, before the guard.
  func testEverySkipAtTheActivationPointPostsTheInertClickOutsideTheFrame() throws {
    let control = ActivationHit(role: "AXButton", actions: ["AXPress"])
    let cases: [(String, CGPoint?, ActivationHit?, ActivationClick, CGPoint, InertClickPoint)] = [
      ("Chrome's corner, far outside", CGPoint(x: -1, y: 1441), nil, .outsideFrame, CGPoint(x: -1, y: 1441), .activationPoint),
      ("exactly 8 pt left of the frame", CGPoint(x: window.minX - 8, y: 400), nil, .outsideFrame, CGPoint(x: window.minX - 8, y: 400), .activationPoint),
      ("8 pt below the frame", CGPoint(x: 300, y: window.maxY + 8), nil, .outsideFrame, CGPoint(x: 300, y: window.maxY + 8), .activationPoint),
      ("in the 4 pt resize band", CGPoint(x: window.minX - 3, y: 400), nil, .outsideFrame, offsetPoint, .offset),
      ("just short of 8 pt above", CGPoint(x: 300, y: window.minY - 7.5), nil, .outsideFrame, offsetPoint, .offset),
      ("on the far edge", CGPoint(x: window.maxX, y: 400), nil, .outsideFrame, offsetPoint, .offset),
      ("a control at the point", point, control, .control, offsetPoint, .offset),
      ("no answer at the point", point, nil, .hitTestFailed, offsetPoint, .offset),
      ("unread actions at the point", point, ActivationHit(role: "AXGroup", actions: nil), .actionsUnknown, offsetPoint, .offset),
      ("no activation point", nil, nil, .noPoint, offsetPoint, .offset),
    ]
    for (name, at, hit, reason, expected, place) in cases {
      let (subject, seam, events) = try activated(at, hit: hit)
      XCTAssertEqual(seam.posts.map(\.kind), [.appKit(1), .mouse(.leftMouseDown), .mouse(.leftMouseUp)], name)
      XCTAssertEqual(seam.posts.dropFirst().map(\.location), [expected, expected], name)
      XCTAssertEqual(seam.posts.dropFirst().first?.flags, [], "no modifier: \(name)")
      for event in events.dropFirst() {
        XCTAssertEqual(event.getIntegerValueField(CGEventField(rawValue: 91)!), 41, name)
        XCTAssertEqual(event.getIntegerValueField(CGEventField(rawValue: 92)!), 41, name)
        XCTAssertEqual(NSEvent(cgEvent: event)?.windowNumber, 41, "routed by the window's number: \(name)")
      }
      XCTAssertFalse(window.insetBy(dx: -4, dy: -4).contains(expected), "clear of the resize band: \(name)")
      XCTAssertEqual(subject.click, reason, "the activation point's own decision is kept: \(name)")
      XCTAssertEqual(subject.clickKind, .inertOutside(place, .early), name)
      XCTAssertEqual(subject.clickKind?.wire as NSDictionary?, ["kind": "inertOutside", "point": place.rawValue, "when": "early"], name)
      XCTAssertNotNil(subject.clickPostedAt, name)
    }
  }

  /// A click at an inert activation point inside the frame is posted exactly as before.
  func testTheClickAtAnInertPointInsideTheFrameIsUnchanged() throws {
    let (subject, seam, _) = try activated(point)
    XCTAssertEqual(seam.posts.map(\.kind), [.appKit(1), .mouse(.leftMouseDown), .mouse(.leftMouseUp)])
    XCTAssertEqual(seam.posts.dropFirst().map(\.location), [point, point])
    XCTAssertEqual(subject.click, .posted)
    XCTAssertEqual(subject.clickKind, .activationPoint)
    XCTAssertEqual(subject.clickKind?.wire as NSDictionary?, ["kind": "activationPoint", "when": "early"])
  }

  /// The exceptions stay click-less, and say so: the activation point in a non-left click's target (spared), a window
  /// with no number to stamp, a window whose frame is unknown (no point is known to lie outside it).
  func testTheExceptionsStayClickLessAndAreRecorded() throws {
    let spared = try activated(point, sparing: CGRect(x: 100, y: 70, width: 40, height: 20))
    let unnumbered = try activated(CGPoint(x: -1, y: 1441), id: nil)
    let unplaced = try activated(CGPoint(x: -1, y: 1441), placed: false)
    for ((subject, seam, _), reason) in [(spared, ActivationClickSkip.spared), (unnumbered, .noWindowNumber), (unplaced, .noFrame)] {
      XCTAssertEqual(seam.posts.map(\.kind), [.appKit(1)], "no click: \(reason)")
      XCTAssertEqual(subject.clickKind, .skipped(reason))
      XCTAssertEqual(subject.clickKind?.wire as NSDictionary?, ["kind": "skipped", "skippedReason": reason.rawValue])
      XCTAssertNil(subject.clickPostedAt)
    }
    XCTAssertEqual(spared.0.click, .spared)
  }

  private func chromeActivation(_ seam: GuardSeam) -> FakeActivation {
    seam.activationPoint = CGPoint(x: -1, y: 1441)
    return FakeActivation(pid: target, window: AXUIElementCreateApplication(target), windowFrame: window, windowID: 41, system: seam.system)
  }

  private func freshMeta() -> InputMeta {
    InputMeta(ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
  }

  /// Chrome's pointer routes post their own left mouse down, which consumes the arm on AppKit's armed branch with no
  /// ordering (#200's reading): exactly the events before the inert click existed, no early click. A left click (the
  /// coordinate click and the synthesized element click share `deliverClick`) and a drag; the meta says the action's own
  /// mouse down consumed it. The agent cursor is told of the action's events alone (`announce`, its only hook).
  func testChromesPointerRoutesPostExactlyTheirOwnEventsAndTheirMouseDownConsumesTheArm() throws {
    let seam = GuardSeam(frontmost: user)
    var meta = freshMeta()
    var announced: [Int] = []
    try deliverClick(ClickTarget(point: CGPoint(x: 300, y: 400), windowFrame: window, windowID: 41, pid: target), route: .activation,
                     button: .left, count: 1, activation: chromeActivation(seam), targetActive: { false },
                     announce: { announced.append(seam.posts.count) }, post: seam.system.post, meta: &meta)
    XCTAssertEqual(seam.posts.map(\.kind), [.appKit(1), .mouse(.leftMouseDown), .mouse(.leftMouseUp), .appKit(2)], "no inert click")
    XCTAssertEqual(seam.posts[1].location, CGPoint(x: 300, y: 400))
    XCTAssertEqual(announced, [1], "announced once, after subtype 1, before the action's events")
    XCTAssertEqual(meta.activationClick, .outsideFrame)
    XCTAssertEqual(meta.wire["activationClickKind"] as? NSDictionary, ["kind": "action", "when": "consumedByAction"])
    XCTAssertNil(meta.paste, "no paste record off the paste route")

    let dragSeam = GuardSeam(frontmost: user)
    var dragMeta = freshMeta()
    let start = ClickTarget(point: CGPoint(x: 200, y: 300), windowFrame: window, windowID: 41, pid: target)
    try deliverPointer(to: target, route: .activation, activation: chromeActivation(dragSeam), postsLeftMouseDown: true,
                       post: dragSeam.system.post, meta: &dragMeta) {
      dragEvents(from: start.point, to: CGPoint(x: 400, y: 500), window: start, flags: [])
    }
    XCTAssertEqual(dragSeam.posts.filter { $0.kind == .mouse(.leftMouseDown) }.map(\.location), [start.point], "the drag's own down only")
    XCTAssertEqual(dragSeam.posts.last?.kind, .appKit(2))
    XCTAssertEqual(dragMeta.activationClickKind, .action)
  }

  /// A pointer action refused before its events (an intervention, or its activation's guard failing) leaves the arm set:
  /// the kept inert click goes out before subtype 2, recorded as the release's.
  func testARefusedPointerActionGetsTheInertClickBeforeSubtypeTwo() throws {
    let stopped = GuardSeam(frontmost: user)
    var meta = freshMeta()
    XCTAssertThrowsError(try deliverClick(ClickTarget(point: CGPoint(x: 300, y: 400), windowFrame: window, windowID: 41, pid: target),
                                          route: .activation, button: .left, count: 1, activation: chromeActivation(stopped), targetActive: { false },
                                          beforePosting: { throw userChanged("TextEdit") }, post: stopped.system.post, meta: &meta))
    XCTAssertEqual(stopped.posts.map(\.kind), [.appKit(1), .mouse(.leftMouseDown), .mouse(.leftMouseUp), .appKit(2)])
    XCTAssertEqual(stopped.posts[1].location, CGPoint(x: -1, y: 1441), "the inert click, never the action's")
    XCTAssertEqual(meta.wire["activationClickKind"] as? NSDictionary, ["kind": "inertOutside", "point": "activationPoint", "when": "release"])

    let failed = GuardSeam(frontmost: user, targetInFront: { _ in true })  // the target's window never stays behind
    var failedMeta = freshMeta()
    XCTAssertThrowsError(try deliverClick(ClickTarget(point: CGPoint(x: 300, y: 400), windowFrame: window, windowID: 41, pid: target),
                                          route: .activation, button: .left, count: 1, activation: chromeActivation(failed), targetActive: { false },
                                          post: failed.system.post, meta: &failedMeta)) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "activationFailed")
    }
    XCTAssertEqual(failed.posts.map(\.kind), [.appKit(1), .mouse(.leftMouseDown), .mouse(.leftMouseUp), .appKit(2)])
    XCTAssertEqual(failed.posts[1].location, CGPoint(x: -1, y: 1441))
    XCTAssertEqual(failedMeta.activationClickKind, .inertOutside(.activationPoint, .release))
  }

  /// A right click posts no left mouse down of its own: its activation takes the inert click early, as every route with
  /// none does (outside the frame, never on the clicked element).
  func testANonLeftClickTakesTheInertClickEarly() throws {
    let seam = GuardSeam(frontmost: user)
    var meta = freshMeta()
    try deliverClick(ClickTarget(point: CGPoint(x: 300, y: 400), windowFrame: window, windowID: 41, pid: target), route: .activation,
                     button: .right, count: 1, activation: chromeActivation(seam), targetActive: { false }, post: seam.system.post, meta: &meta)
    XCTAssertEqual(seam.posts.map(\.kind), [.appKit(1), .mouse(.leftMouseDown), .mouse(.leftMouseUp), .mouse(.rightMouseDown),
                                           .mouse(.rightMouseUp), .appKit(2)])
    XCTAssertEqual(seam.posts[1].location, CGPoint(x: -1, y: 1441))
    XCTAssertEqual(meta.activationClickKind, .inertOutside(.activationPoint, .early))
  }

  /// The registry's two kinds of holder: one with no left mouse down of its own (keys, element actions, the menu record,
  /// paste) gets the inert click right after subtype 1; one with its own (`postsLeftMouseDown`) gets none, and a holder
  /// of the first kind joining its unconsumed hold posts the kept click itself, recorded in its meta; once consumed, a
  /// later joiner posts nothing.
  func testANoClickHolderGetsTheInertClickEarlyAndPostsItWhenJoiningAnUnconsumedHold() throws {
    let early = GuardSeam(frontmost: user)
    var meta = freshMeta()
    let released = try HeldActivations().acquire(pid: target, holder: ActivationHolder(connection: 1), beforeActivating: {}, make: { self.chromeActivation(early) }, meta: &meta)
    XCTAssertEqual(early.posts.map(\.kind), [.appKit(1), .mouse(.leftMouseDown), .mouse(.leftMouseUp)], "before the holder's input")
    XCTAssertEqual(meta.activationClickKind, .inertOutside(.activationPoint, .early))
    _ = released()
    XCTAssertEqual(early.posts.map(\.kind).last, .appKit(2))
    XCTAssertEqual(early.posts.filter { $0.kind == .mouse(.leftMouseDown) }.count, 1, "no second click at the release")

    let seam = GuardSeam(frontmost: user)
    let registry = HeldActivations()
    var pointerMeta = freshMeta()
    let pointer = try registry.acquire(pid: target, holder: ActivationHolder(connection: 1), pointer: PointerHold(), beforeActivating: {}, make: { self.chromeActivation(seam) },
                                       meta: &pointerMeta)
    XCTAssertEqual(seam.posts.map(\.kind), [.appKit(1)], "a pointer holder's activation: no early click")
    XCTAssertNil(pointerMeta.activationClickKind, "awaiting the action's own mouse down")
    XCTAssertEqual(pointerMeta.activationJoin, .fresh)
    var joinMeta = freshMeta()
    let joined = try registry.acquire(pid: target, holder: ActivationHolder(connection: 1), beforeActivating: {}, make: { XCTFail("shared, not made"); return self.chromeActivation(seam) },
                                      meta: &joinMeta)
    XCTAssertEqual(seam.posts.map(\.kind), [.appKit(1), .mouse(.leftMouseDown), .mouse(.leftMouseUp)], "the joiner consumed the arm")
    XCTAssertEqual(joinMeta.activationClickKind, .inertOutside(.activationPoint, .early))
    XCTAssertEqual(joinMeta.activationJoin, .shared, "a joiner consuming the arm runs no activation")
    var laterMeta = freshMeta()
    let later = try registry.acquire(pid: target, holder: ActivationHolder(connection: 1), beforeActivating: {}, make: { self.chromeActivation(seam) }, meta: &laterMeta)
    XCTAssertEqual(seam.posts.count, 3, "consumed already: nothing more")
    XCTAssertNil(laterMeta.activationClickKind)
    XCTAssertEqual(laterMeta.activationJoin, .shared)
    _ = later(); _ = joined(); _ = pointer()
    XCTAssertEqual(seam.posts.map(\.kind), [.appKit(1), .mouse(.leftMouseDown), .mouse(.leftMouseUp), .appKit(2)], "no release click")
  }

  /// A pointer holder claims the arm before its own left mouse down goes out (the review of 0d888300..c32bec9c, finding
  /// 1): a no-click holder joining on another connection while a drag's events are posting waits for them and posts no
  /// inert click, so nothing lands between the drag's down and its up, and the drag's own mouse down consumed the arm.
  func testANoClickJoinerDuringAPointerHoldersEventsPostsNoInertClickBetweenThem() throws {
    let seam = GuardSeam(frontmost: user)
    let registry = HeldActivations()
    let joining = DispatchSemaphore(value: 0)
    let joinerDone = DispatchSemaphore(value: 0)
    final class Joiner: @unchecked Sendable {
      var meta: InputMeta
      var release: (() -> Bool)?
      var triggered = false
      init(_ meta: InputMeta) { self.meta = meta }
    }
    let joiner = Joiner(freshMeta())
    let pid = target
    let start = ClickTarget(point: CGPoint(x: 200, y: 300), windowFrame: window, windowID: 41, pid: target)
    seam.onMouseDown = {
      guard !joiner.triggered, seam.posts.last?.location == start.point else { return }
      joiner.triggered = true
      DispatchQueue.global().async {
        joiner.release = try? registry.acquire(pid: pid, holder: ActivationHolder(connection: 2), beforeActivating: {}, make: {
          XCTFail("shared, not made")
          return FakeActivation(pid: pid, window: AXUIElementCreateApplication(pid), windowFrame: nil, windowID: nil)
        }, meta: &joiner.meta)
        joining.signal()
        joinerDone.signal()
      }
      // The joiner gets every chance to post while the drag's down has gone and its up has not.
      _ = joining.wait(timeout: .now() + .milliseconds(300))
    }
    var meta = freshMeta()
    try deliverPointer(to: target, route: .activation, activation: chromeActivation(seam), activations: registry, postsLeftMouseDown: true,
                       post: seam.system.post, meta: &meta) {
      dragEvents(from: start.point, to: CGPoint(x: 400, y: 500), window: start, flags: [])
    }
    XCTAssertEqual(joinerDone.wait(timeout: .now() + .seconds(2)), .success, "the joiner went on once the drag's events were out")
    XCTAssertEqual(seam.posts.filter { $0.kind == .mouse(.leftMouseDown) }.map(\.location), [start.point], "no inert click at all")
    let mouse = seam.posts.filter { if case .mouse = $0.kind { return true } else { return false } }.map(\.kind)
    XCTAssertEqual(mouse, [.mouse(.leftMouseDown), .mouse(.leftMouseUp)], "the drag's down and up, nothing between")
    XCTAssertEqual(meta.activationClickKind, .action)
    XCTAssertNil(joiner.meta.activationClickKind, "the drag's mouse down consumed the arm")
    XCTAssertEqual(registry.holders(target), 1)
    _ = joiner.release?()
    XCTAssertEqual(seam.posts.map(\.kind).last, .appKit(2))
    XCTAssertEqual(seam.posts.filter { $0.kind == .mouse(.leftMouseDown) }.count, 1, "no release click")
  }

  /// No subtype 2 ever goes to a process that was frontmost before the action: its activation posts nothing (it believes
  /// it has focus), so there is nothing to withdraw, and the action's click goes alone. Nor to one that came to the front
  /// during the action.
  func testNoDeactivationGoesToAProcessThatWasFrontmostBeforeTheAction() throws {
    let seam = GuardSeam(frontmost: target)
    seam.activationPoint = CGPoint(x: -1, y: 1441)
    let made = FakeActivation(pid: target, window: AXUIElementCreateApplication(target), windowFrame: window, windowID: 41, system: seam.system)
    var meta = InputMeta(ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
    try deliverClick(ClickTarget(point: CGPoint(x: 300, y: 400), windowFrame: window, windowID: 41, pid: target), route: .activation,
                     button: .left, count: 1, activation: made, targetActive: { true }, post: seam.system.post, meta: &meta)
    XCTAssertEqual(seam.posts.map(\.kind), [.mouse(.leftMouseDown), .mouse(.leftMouseUp)], "no activation, no inert click, no deactivation")
    XCTAssertNil(made.clickKind)
    XCTAssertNil(meta.wire["activationClickKind"])
    let other = GuardSeam(frontmost: user)
    let late = FakeActivation(pid: target, window: AXUIElementCreateApplication(target), windowFrame: window, windowID: 41, system: other.system)
    try late.activate()
    other.frontmost = target
    late.deactivate()
    XCTAssertFalse(other.posts.contains { $0.kind == .appKit(2) }, "frontmost by the end: not deactivated")
  }

  func testNoActivationClickFieldWhenNoActivationRan() {
    let meta = InputMeta(ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
    XCTAssertNil(meta.wire["activationClick"])
  }

  /// A hit element whose action query failed is not known to be inert: a pressable group whose AXUIElementCopyActionNames
  /// erred must not be clicked (the second review, finding 4); the inert click outside the frame goes instead.
  func testAFailedActionQuerySkipsTheClick() throws {
    XCTAssertEqual(decide(point, hit: ActivationHit(role: "AXGroup", actions: nil)), .actionsUnknown)
    XCTAssertEqual(decide(point, hit: ActivationHit(role: "AXWindow", actions: nil)), .actionsUnknown)
    XCTAssertEqual(decide(point, hit: ActivationHit(role: "AXButton", actions: nil)), .control, "a control by its role either way")
    let seam = GuardSeam(frontmost: user)
    seam.activationHit = ActivationHit(role: "AXGroup", actions: nil)
    let subject = activation(seam)
    try subject.activate()
    XCTAssertFalse(seam.posts.contains { $0.location == point }, "no left click at the group")
    XCTAssertEqual(seam.posts.filter { $0.kind == .mouse(.leftMouseDown) }.map(\.location), [offsetPoint])
    XCTAssertEqual(subject.click, .actionsUnknown)
  }

  /// A per-action borrower runs the intervention check under the registry's lock, so a user event that lands while it
  /// waits behind another holder's activation stops it before the activation and its click (the second review, finding 5).
  func testAUserEventWhileAClickWaitsStopsItBeforeItsActivation() {
    let seam = GuardSeam(frontmost: user)
    let registry = HeldActivations()
    var meta = InputMeta(ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
    var underLock = false
    XCTAssertThrowsError(try deliverClick(ClickTarget(point: CGPoint(x: 300, y: 400), windowFrame: window, windowID: 41, pid: target),
                                          route: .activation, button: .left, count: 1, activation: activation(seam), activations: registry,
                                          targetActive: { false }, beforeActivating: {
                                            underLock = registry.isLocked
                                            throw userChanged("TextEdit")
                                          }, post: seam.system.post, meta: &meta)) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "userIntervened")
    }
    XCTAssertTrue(underLock, "the check runs once the registry's lock is held")
    XCTAssertTrue(seam.posts.isEmpty, "no activation, no activation click, no click")
    XCTAssertNil(meta.startedAt)
    XCTAssertEqual(registry.holders(target), 0)
  }
}
