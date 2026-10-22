import Foundation
import XCTest
@testable import Engine

// Every probe command's final JSON line carries `exitStatus`, the status the process exits with: a harness that launches
// the probe through `open` never sees the exit code. Each family is driven down a path that reads nothing of the session
// and posts nothing (usage errors, a refused key spec, an input source that does not exist); watch-activations is
// resident and is covered by its streamed line, which is not a final line and carries no status.

final class ProbeExitStatusTests: XCTestCase {
  private var lines: [Data] = []
  private var saved: ((Data) -> Void)?

  override func setUp() {
    saved = Probe.write
    Probe.write = { [unowned self] in self.lines.append($0) }
  }

  override func tearDown() {
    Probe.write = saved!
  }

  /// Runs the probe command and returns its status and its only line, parsed.
  private func run(_ arguments: [String], file: StaticString = #filePath, line: UInt = #line) throws -> (Int32, [String: Any]) {
    lines = []
    let status = Probe.run(arguments)
    XCTAssertEqual(lines.count, 1, "one line", file: file, line: line)
    let object = try XCTUnwrap(JSONSerialization.jsonObject(with: try XCTUnwrap(lines.last)) as? [String: Any], file: file, line: line)
    return (status, object)
  }

  private func assertStatus(_ arguments: [String], _ expected: Int32, file: StaticString = #filePath, line: UInt = #line) throws {
    let (status, object) = try run(arguments, file: file, line: line)
    XCTAssertEqual(status, expected, "\(arguments)", file: file, line: line)
    XCTAssertEqual(object["exitStatus"] as? Int, Int(status), "\(arguments)", file: file, line: line)
  }

  func testKeystroke() throws {
    try assertStatus(["keystroke"], 64)
    try assertStatus(["keystroke", "--user-pid", "1", "--user-bounds", "0,0,1,1", "--keys", "r", "Bogus"], 5)
  }

  func testInputSource() throws {
    try assertStatus(["input-source"], 64)
    try assertStatus(["input-source", "com.example.no-such-source"], 2)
  }

  func testFocus() throws {
    try assertStatus(["focus", "--bogus"], 64)
    try assertStatus(["focus", "--window", "x"], 64)
  }

  func testTextView() throws {
    try assertStatus(["text-view"], 64)
  }

  func testWindowFrameUsageIsOneFinalLine() throws {
    let (status, object) = try run(["window-frame"])
    XCTAssertEqual(status, 64)
    XCTAssertEqual(object["exitStatus"] as? Int, 64)
    XCTAssertTrue((object["error"] as? String)?.hasPrefix("usage: --probe window-frame ") == true)
  }

  func testAnUnknownCommand() throws {
    try assertStatus(["no-such-command"], 64)
  }

  func testAStreamedLineIsNotAFinalLine() throws {
    lines = []
    Probe.stream(["pid": 1, "watch": "activations"])
    XCTAssertEqual(lines.count, 1)
    let object = try XCTUnwrap(JSONSerialization.jsonObject(with: try XCTUnwrap(lines.last)) as? [String: Any])
    XCTAssertNil(object["exitStatus"], "watch-activations' lines are streamed: the resident probe has no final line")
    XCTAssertEqual(object["watch"] as? String, "activations")
  }
}
