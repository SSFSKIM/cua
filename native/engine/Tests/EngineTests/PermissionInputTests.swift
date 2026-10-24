import Foundation
import XCTest
@testable import Engine

final class PermissionInputTests: XCTestCase {
  func testInputMetadataKeepsThePermissionMarker() {
    let context = ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 10, hidIdleMs: 50, deadline: 100, lineage: nil)
    let pending = EngineError(.permissionsPending, "Grant Accessibility", extra: ["meta": ["permission": "accessibility"]])
    let wrapped = withMeta(pending, InputMeta(context))
    let meta = wrapped.extra["meta"] as? [String: Any]
    XCTAssertEqual(meta?["permission"] as? String, "accessibility")
    XCTAssertEqual(meta?["receivedAt"] as? Int, 10)
    XCTAssertTrue(meta?["startedAt"] is NSNull)
    XCTAssertEqual(wrapped.code, -10014)
  }
}
