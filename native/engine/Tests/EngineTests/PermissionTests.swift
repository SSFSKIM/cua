import Foundation
import XCTest
@testable import Engine

// The permission boundary with fake preflight and request calls: no TCC request, capture or GUI access.
final class PermissionTests: XCTestCase {
  private let bundle = "/Users/Fixture/Library/Application Support/cua/engine/cua Engine.app"

  func testGrantedPermissionsNeverPrompt() throws {
    for permission in [EnginePermission.accessibility, .screenRecording] {
      try permission.require(bundlePath: bundle, granted: { true }, request: { XCTFail("already granted") })
    }
  }

  func testMissingAccessibilityNamesThePaneAddButtonAndActualBundleWithoutRequiringRelaunch() {
    var requests = 0
    XCTAssertThrowsError(try EnginePermission.accessibility.require(bundlePath: bundle, granted: { false }, request: { requests += 1 })) { error in
      let refusal = error as? EngineError
      XCTAssertEqual(refusal?.code, -10014)
      XCTAssertEqual(refusal?.errorName, "permissionsPending")
      XCTAssertEqual((refusal?.extra["meta"] as? [String: Any])?["permission"] as? String, "accessibility")
      let message = refusal?.message ?? ""
      XCTAssertTrue(message.hasPrefix("cua Engine needs Accessibility: "))
      XCTAssertTrue(message.contains("System Settings → Privacy & Security → Accessibility"))
      XCTAssertTrue(message.contains("click \"+\", press ⌘⇧G and enter \(bundle), then switch it on"))
      XCTAssertTrue(message.hasSuffix(", then retry."))
      XCTAssertFalse(message.contains("relaunch"))
    }
    XCTAssertEqual(requests, 1, "the system request is still made once (the owner's decision of 2026-10-24)")
  }

  func testMissingScreenRecordingNamesTheByHandPathAndPendingRelaunchEvenIfTheRequestGrantsIt() {
    var granted = false
    var requests = 0
    XCTAssertThrowsError(try EnginePermission.screenRecording.require(bundlePath: bundle, granted: { granted }, request: { requests += 1; granted = true })) { error in
      let refusal = error as? EngineError
      XCTAssertEqual(refusal?.code, -10014)
      XCTAssertEqual(refusal?.errorName, "permissionsPending")
      XCTAssertEqual((refusal?.extra["meta"] as? [String: Any])?["permission"] as? String, "screenRecording")
      let message = refusal?.message ?? ""
      XCTAssertTrue(message.hasPrefix("cua Engine needs Screen & System Audio Recording: "))
      XCTAssertTrue(message.contains("System Settings → Privacy & Security → Screen & System Audio Recording"))
      XCTAssertTrue(message.contains("click \"+\", press ⌘⇧G and enter \(bundle), then switch it on"))
      XCTAssertTrue(message.contains("a relaunch of the engine is pending before screenshots can use it"))
    }
    XCTAssertTrue(granted)
    XCTAssertEqual(requests, 1)
  }

  func testTheDefaultBundlePathIsTheRunningBundle() {
    XCTAssertThrowsError(try EnginePermission.accessibility.require(granted: { false }, request: {})) { error in
      XCTAssertTrue((error as? EngineError)?.message.contains("enter \(Bundle.main.bundlePath), then") == true)
    }
  }
}
