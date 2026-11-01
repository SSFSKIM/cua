import Foundation
import XCTest
@testable import Engine

/// The desktop gate's test observer (#237): registered as the test bundle loads (EngineTestGate.m), it turns each call
/// the closed gate refuses (Sources/Engine/DesktopGate.swift) into a failure of the test running when it was made, so a
/// test that reaches the real desktop instead of a stub fails loudly rather than launching, posting or writing.
@objc(CUADesktopGateObserver)
final class DesktopGateObserver: NSObject, XCTestObservation, @unchecked Sendable {
  private static let lock = NSLock()
  nonisolated(unsafe) private static var registeredFlag = false
  nonisolated(unsafe) private static var running: XCTestCase?

  /// Whether the bundle-load hook registered an observer (the proving test checks it).
  static var registered: Bool { lock.withLock { registeredFlag } }

  override init() {
    super.init()
    Self.lock.withLock { Self.registeredFlag = true }
    DesktopGate.onRefusal = { call in
      let test = Self.lock.withLock { Self.running }
      let issue = XCTIssue(type: .assertionFailure,
                           compactDescription: "the desktop gate refused \(call): a unit test reached the real desktop; stub it through its seam")
      if let test { test.record(issue) } else { FileHandle.standardError.write(Data("cua-engine tests: \(issue.compactDescription) (outside any test)\n".utf8)) }
    }
  }

  func testCaseWillStart(_ testCase: XCTestCase) { Self.lock.withLock { Self.running = testCase } }
  func testCaseDidFinish(_ testCase: XCTestCase) { Self.lock.withLock { if Self.running === testCase { Self.running = nil } } }
}
