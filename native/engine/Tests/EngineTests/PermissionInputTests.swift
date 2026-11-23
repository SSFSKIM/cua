import Foundation
import XCTest
@testable import Engine

// An input method's permissionsPending keeps its permission marker under the input meta the method attaches.
final class PermissionInputTests: XCTestCase {
  private func context() -> ExecutionContext {
    ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 10, hidIdleMs: 50, deadline: 100, lineage: nil)
  }

  func testInputMetadataKeepsThePermissionMarker() {
    let pending = EngineError(.permissionsPending, "Grant Accessibility", extra: ["meta": ["permission": "accessibility"]])
    let wrapped = withMeta(pending, InputMeta(context()))
    let meta = wrapped.extra["meta"] as? [String: Any]
    XCTAssertEqual(meta?["permission"] as? String, "accessibility")
    XCTAssertEqual(meta?["receivedAt"] as? Int, 10)
    XCTAssertTrue(meta?["startedAt"] is NSNull)
    XCTAssertEqual(wrapped.code, -10014)
  }

  func testInputMetadataStillReplacesEveryOtherEarlierKey() {
    let earlier = EngineError(name: "clickUnconfirmed", "x", extra: ["meta": ["entered": 3, "inputRoute": 9]])
    let meta = withMeta(earlier, InputMeta(context())).extra["meta"] as? [String: Any]
    XCTAssertNil(meta?["entered"], "only the permission marker is carried over")
    XCTAssertTrue(meta?["inputRoute"] is NSNull)
    XCTAssertNil(meta?["permission"])
  }
}
