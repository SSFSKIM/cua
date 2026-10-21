import Foundation
import XCTest
@testable import Engine

// The probe's `input-source` command (Interfaces, UserProbe; Verification system part 6's mid-switch row): its
// arguments. Nothing here selects or reads an input source.

final class InputSourceProbeTests: XCTestCase {
  func testTheArguments() throws {
    XCTAssertEqual(try InputSourceRequest.parse(["current"]), InputSourceRequest(source: "current", at: nil))
    XCTAssertEqual(try InputSourceRequest.parse(["com.apple.keylayout.ABC"]), InputSourceRequest(source: "com.apple.keylayout.ABC", at: nil))
    XCTAssertEqual(try InputSourceRequest.parse(["com.apple.inputmethod.Korean.2SetKorean", "--at", "1700000000000"]),
                   InputSourceRequest(source: "com.apple.inputmethod.Korean.2SetKorean", at: 1_700_000_000_000))
    XCTAssertEqual(try InputSourceRequest.parse(["--at", "1700000000000", "com.apple.keylayout.ABC"]).at, 1_700_000_000_000, "the flag may come first")
  }

  func testMalformedArgumentsAreUsageErrors() {
    let cases: [([String], String)] = [
      ([], "input-source needs current or a source id"),
      (["--at", "1700000000000"], "input-source needs current or a source id"),
      (["a", "b"], "input-source takes one source"),
      (["com.apple.keylayout.ABC", "--at"], "--at needs a unix ms number"),
      (["com.apple.keylayout.ABC", "--at", "soon"], "--at needs a unix ms number"),
      (["current", "--at", "1700000000000"], "--at schedules a selection, not a reading of the current source"),
    ]
    for (arguments, message) in cases {
      XCTAssertThrowsError(try InputSourceRequest.parse(arguments), "\(arguments)") { error in
        XCTAssertEqual(error as? ProbeUsage, ProbeUsage(message: message), "\(arguments)")
      }
    }
  }
}
