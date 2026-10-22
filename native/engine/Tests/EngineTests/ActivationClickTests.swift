import AppKit
import CoreGraphics
import Foundation
import XCTest
@testable import Engine

// Route 3's activation click (Activation.swift; the Decision Log's 2026-10-22 review entry): posted at the window's
// AXActivationPoint only when a hit-test there answers the window itself or window chrome that is not a control (U13's
// reading on TextEdit, Finder and Electron); otherwise the activation rests on its events alone, as it does for Chrome's
// point outside the frame. The meta says which. Everything runs over the recorded guard seam.

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

  func testAControlAtThePointLeavesTheActivationToItsEventsAlone() throws {
    let seam = GuardSeam(frontmost: user)
    seam.activationHit = ActivationHit(role: "AXButton", actions: ["AXPress"])
    let subject = activation(seam)
    try subject.activate()
    subject.deactivate()
    XCTAssertEqual(seam.posts.map(\.kind), [.appKit(1), .appKit(2)], "no left click before the action, the activation still withdrawn")
    XCTAssertEqual(subject.click, .control)
  }

  /// Route 3's synthesized click keeps working with the click posted on the window, and its meta says so; with a control
  /// at the point it still delivers, on the events alone, and the meta names the reason.
  func testRouteThreesSynthesizedClickKeepsWorkingAndItsMetaSaysWhatTheActivationClickDid() throws {
    for (hit, expected) in [(ActivationHit(role: "AXWindow", actions: []), ActivationClick.posted),
                            (ActivationHit(role: "AXButton", actions: ["AXPress"]), .control)] {
      let seam = GuardSeam(frontmost: user)
      seam.activationHit = hit
      var meta = InputMeta(ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
      try deliverClick(ClickTarget(point: CGPoint(x: 300, y: 400), windowFrame: window, windowID: 41, pid: target), route: .activation,
                       button: .left, count: 1, activation: activation(seam), targetActive: { false }, post: seam.system.post, meta: &meta)
      let clicks = seam.posts.filter { $0.kind == .mouse(.leftMouseDown) }
      XCTAssertEqual(clicks.count, expected == .posted ? 2 : 1, "the click itself always lands")
      XCTAssertEqual(clicks.last?.location, CGPoint(x: 300, y: 400))
      XCTAssertEqual(seam.posts.map(\.kind).last, .appKit(2))
      XCTAssertEqual(meta.activationClick, expected)
      XCTAssertEqual(meta.wire["activationClick"] as? String, expected.rawValue)
    }
  }

  func testNoActivationClickFieldWhenNoActivationRan() {
    let meta = InputMeta(ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
    XCTAssertNil(meta.wire["activationClick"])
  }
}
