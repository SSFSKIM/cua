import AppKit
import XCTest
@testable import Engine

// The second review of the focus hold (findings 1–3, reviewer-high on c2049262..43ee3e22, kept as its reproductions): a
// real activation cycle interleaved with an activation's guard or AX reads must neither be lost nor invalidate a newer
// activation, on success or failure (HeldActivations' real-activation epoch).

final class ReviewRaceTests: XCTestCase {
  let target: pid_t = 990001
  func meta() -> InputMeta {
    InputMeta(ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
  }
  func activation(_ system: ActivationSystem) -> FakeActivation {
    FakeActivation(pid: target, window: AXUIElementCreateApplication(target), windowFrame: CGRect(x: 0, y: 0, width: 800, height: 600), windowID: 41, system: system)
  }
  func testCycleDuringFirstActivationMustNotBeLost() throws {
    let registry = HeldActivations()
    let seam = GuardSeam(frontmost: 990002)
    var system = seam.system
    var cycled = false
    let sleep = system.sleep
    system.sleep = { ms in
      if !cycled {
        cycled = true
        registry.realActivationChanged(self.target)
        registry.realActivationChanged(self.target)
      }
      sleep(ms)
    }
    var meta = meta()
    let release = try registry.acquire(pid: target, beforeActivating: {}, make: { self.activation(system) }, meta: &meta)
    try registry.refresh(pid: target, beforeActivating: {}, make: { self.activation(seam.system) }, meta: &meta)
    XCTAssertEqual(seam.posts.filter { $0.kind == .appKit(1) }.count, 2, "a cycle during the first guard must cause a fresh activation")
    _ = release()
  }
  func testCycleBeforeRefreshPostsMustNotInvalidateNewActivation() throws {
    let registry = HeldActivations()
    let seam = GuardSeam(frontmost: 990002)
    var meta = meta()
    let release = try registry.acquire(pid: target, beforeActivating: {}, make: { self.activation(seam.system) }, meta: &meta)
    registry.realActivationChanged(target)
    try registry.refresh(pid: target, beforeActivating: {}, make: {
      // Notification while obtaining the window/frame, before the replacement's subtype 1.
      registry.realActivationChanged(self.target)
      return self.activation(seam.system)
    }, meta: &meta)
    _ = release()
    XCTAssertEqual(seam.posts.filter { $0.kind == .appKit(2) }.count, 1, "new activation after the real cycle needs a matching deactivation")
  }
  func testStaleFailedRefreshMustNotPostDeactivation() throws {
    let registry = HeldActivations()
    let seam = GuardSeam(frontmost: 990002)
    var meta = meta()
    let release = try registry.acquire(pid: target, beforeActivating: {}, make: { self.activation(seam.system) }, meta: &meta)
    registry.realActivationChanged(target)
    var system = seam.system
    system.sleep = { _ in
      registry.realActivationChanged(self.target)
      seam.frontmost = 990003
    }
    XCTAssertThrowsError(try registry.refresh(pid: target, beforeActivating: {}, make: { self.activation(system) }, meta: &meta))
    _ = release()
    XCTAssertEqual(seam.posts.filter { $0.kind == .appKit(2) }.count, 0, "a real cycle invalidates the replacement even on its failure path")
  }
}
