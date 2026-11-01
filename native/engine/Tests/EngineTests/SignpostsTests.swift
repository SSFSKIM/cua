import XCTest
@testable import Engine

// The timing signposts' helper (Signposts.swift): with signposts off it runs the body and makes no interval (no ID, no
// interval state); on, it brackets the body, also when the body throws (#235's review of 4ff410f7).
final class SignpostedTests: XCTestCase {
  private final class Counting: TimingIntervals {
    var isEnabled: Bool
    var begun: [String] = [], ended: [String] = []
    init(enabled: Bool) { isEnabled = enabled }
    func beginTimingInterval(_ name: StaticString) -> Int { begun.append("\(name)"); return begun.count }
    func endTimingInterval(_ name: StaticString, _ interval: Int) { ended.append("\(name)#\(interval)") }
  }
  private struct Failure: Error {}

  func testOffItRunsTheBodyAndMakesNoInterval() throws {
    let off = Counting(enabled: false)
    XCTAssertEqual(signposted("click.hitTest", on: off) { 7 }, 7)
    XCTAssertThrowsError(try signposted("click.owner", on: off) { throw Failure() })
    XCTAssertEqual(off.begun, [])
    XCTAssertEqual(off.ended, [])
  }

  func testOnItBracketsTheBodyThrowingOrNot() throws {
    let on = Counting(enabled: true)
    XCTAssertEqual(signposted("click.hitTest", on: on) { 7 }, 7)
    XCTAssertThrowsError(try signposted("click.owner", on: on) { throw Failure() })
    XCTAssertEqual(on.begun, ["click.hitTest", "click.owner"])
    XCTAssertEqual(on.ended, ["click.hitTest#1", "click.owner#2"])
  }
}
