import AppKit
import ApplicationServices
import XCTest
@testable import Engine

// The desktop gate (Sources/Engine/DesktopGate.swift; #237): closed in the test bundle from its load, so a call that
// reaches the real desktop instead of a stub is refused and fails the running test. Every target here is one nothing
// can act on even if the gate were open: an app bundle that does not exist, a pid no process has, this process's own
// application element.
final class DesktopGateTests: XCTestCase {
  /// A pid no process has: a post or an activation aimed at it reaches nothing.
  private let nobody: pid_t = 99_999_999

  func testTheGateIsClosedFromTheBundlesLoadAndItsObserverIsRegistered() {
    XCTAssertTrue(DesktopGate.closed, "XCTest is loaded: the gate refuses")
    XCTAssertTrue(DesktopGateObserver.registered, "the bundle-load hook registered the observer that fails a test on a refusal")
  }

  /// #237's incident: an execute on an engine the test had not stubbed resolved TextEdit and launched it. The same
  /// launch now throws, launches nothing, and fails the test that made it.
  func testAnUnstubbedLaunchFailsTheTestInsteadOfLaunching() throws {
    let path = NSTemporaryDirectory() + "cua-desktop-gate-\(UUID().uuidString).app"  // never created: nothing could launch
    let apps = AppDirectory(usagePath: NSTemporaryDirectory() + "cua-desktop-gate-usage-\(UUID().uuidString).json")
    let app = ResolvedApp(appPath: path, bundleIdentifier: "io.github.ssfskim.cua.desktop-gate-test", displayName: "Gate", running: nil)
    let before = DesktopGate.refusals.count
    try XCTExpectFailure("the closed gate makes the refused launch this test's failure") {
      XCTAssertThrowsError(try apps.launch(app, deadline: unixMilliseconds() + 5_000)) { error in
        XCTAssertEqual((error as? EngineError)?.errorName, "desktopGateClosed")
        XCTAssertTrue((error as? EngineError)?.message.contains("NSWorkspace.openApplication") == true, "the error names the call")
      }
    }
    XCTAssertEqual(Array(DesktopGate.refusals.dropFirst(before)), ["NSWorkspace.openApplication"], "the gate's own record: refused, not run")
  }

  /// The other real acts behind the seams' defaults: each is refused, recorded, and fails the test.
  func testTheSeamsDefaultActsAreRefused() throws {
    let system = ActivationSystem()
    let own = AXUIElementCreateApplication(getpid())
    let event = try XCTUnwrap(CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: true))
    let before = DesktopGate.refusals.count
    try XCTExpectFailure("every refusal fails the running test", options: {
      let options = XCTExpectedFailure.Options()
      options.issueMatcher = { $0.compactDescription.contains("the desktop gate refused") }
      return options
    }()) {
      system.post(event, nobody)
      XCTAssertFalse(system.reactivate(nobody))
      system.raise(own)
      XCTAssertEqual(AXOps.live.perform(own, "AXPress"), .cannotComplete)
      XCTAssertEqual(AXOps.live.write(own, "AXManualAccessibility", kCFBooleanTrue), .cannotComplete)
      EventPoster.toProcess(nobody).deliver(event)
    }
    XCTAssertEqual(Array(DesktopGate.refusals.dropFirst(before)), [
      "CGEvent.postToPid", "NSRunningApplication.activate", "AXUIElementPerformAction(AXRaise)", "AXUIElementPerformAction(AXPress)",
      "AXUIElementSetAttributeValue(AXManualAccessibility)", "CGEvent.postToPid",
    ])
  }
}
