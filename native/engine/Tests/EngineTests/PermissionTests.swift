import Foundation
import XCTest
@testable import Engine

// Permission boundaries with fake preflight/request calls: no TCC request, capture or GUI access.
final class PermissionTests: XCTestCase {
  private let bundle = "/Users/Fixture/Library/Application Support/cua/engine/cua Engine.app"

  func testGrantedPermissionsNeverPrompt() throws {
    for permission in [EnginePermission.accessibility, .screenRecording] {
      for _ in 0..<3 {
        try permission.require(bundlePath: bundle, granted: { true }, request: { XCTFail("already granted") })
      }
    }
  }

  func testMissingAccessibilityRepeatedlyReturnsExactGuidanceAndMarkerWithoutRequesting() {
    var requests = 0
    let message = "cua Engine needs Accessibility: at the console, open System Settings → Privacy & Security → Accessibility, "
      + "click \"+\", press ⌘⇧G and enter \(bundle), then switch it on, then retry."
    for _ in 0..<3 {
      XCTAssertThrowsError(try EnginePermission.accessibility.require(bundlePath: bundle, granted: { false }, request: { requests += 1 })) { error in
        self.assertPending(error, permission: "accessibility", message: message)
      }
      XCTAssertEqual(requests, 0, "An ordinary missing-grant check must never request a system prompt")
    }
  }

  func testMissingScreenRecordingRepeatedlyReturnsExactGuidanceAndMarkerWithoutRequesting() {
    var requests = 0
    let message = "cua Engine needs Screen & System Audio Recording: at the console, open System Settings → Privacy & Security → Screen & System Audio Recording, "
      + "click \"+\", press ⌘⇧G and enter \(bundle), then switch it on"
      + "; a relaunch of the engine is pending before screenshots can use it. Retry after granting it."
    for _ in 0..<3 {
      XCTAssertThrowsError(try EnginePermission.screenRecording.require(bundlePath: bundle, granted: { false }, request: { requests += 1 })) { error in
        self.assertPending(error, permission: "screenRecording", message: message)
      }
      XCTAssertEqual(requests, 0, "An ordinary missing-grant check must never request a system prompt")
    }
  }

  private func assertPending(_ error: Error, permission: String, message: String, file: StaticString = #filePath, line: UInt = #line) {
    let refusal = error as? EngineError
    XCTAssertEqual(refusal?.code, -10014, file: file, line: line)
    XCTAssertEqual(refusal?.errorName, "permissionsPending", file: file, line: line)
    XCTAssertEqual(refusal?.extra["meta"] as? [String: String], ["permission": permission], file: file, line: line)
    XCTAssertEqual(refusal?.message, message, file: file, line: line)
  }

  func testExplicitApproveRequestsMissingGrantsAndCapturesOnlyWhenBothSucceed() {
    let engine = Engine(paths: ServerPaths(socket: "/tmp/x.sock", directory: "/tmp", lock: "/tmp/x.lock", usage: "/tmp/cua-engine-test-usage.json"))
    for accessibility in [false, true] {
      for screenRecording in [false, true] {
        var calls: [String] = []
        let result = engine.approve(
          requestAccessibility: { calls.append("requestAX"); return accessibility },
          screenRecordingGranted: { calls.append("preflightSR"); return false },
          requestScreenRecording: { calls.append("requestSR"); return screenRecording },
          captureConfirmation: { calls.append("capture"); return true }
        )
        XCTAssertEqual(result as? [String: Bool], ["accessibility": accessibility, "screenRecording": screenRecording, "captured": accessibility && screenRecording])
        XCTAssertEqual(calls, ["requestAX", "preflightSR", "requestSR"] + (accessibility && screenRecording ? ["capture"] : []))
      }
    }
  }

  func testExplicitApproveWithScreenRecordingGrantedSkipsItsRequestButRetainsAXRequestAndCapture() {
    let engine = Engine(paths: ServerPaths(socket: "/tmp/x.sock", directory: "/tmp", lock: "/tmp/x.lock", usage: "/tmp/cua-engine-test-usage.json"))
    for captureSucceeded in [false, true] {
      var calls: [String] = []
      let result = engine.approve(
        requestAccessibility: { calls.append("requestAX"); return true },
        screenRecordingGranted: { calls.append("preflightSR"); return true },
        requestScreenRecording: { XCTFail("An existing SR grant must short-circuit its request"); return false },
        captureConfirmation: { calls.append("capture"); return captureSucceeded }
      )
      XCTAssertEqual(result as? [String: Bool], ["accessibility": true, "screenRecording": true, "captured": captureSucceeded])
      XCTAssertEqual(calls, ["requestAX", "preflightSR", "capture"])
    }
  }
}
