import Foundation
import XCTest
@testable import Engine

// Route 3's screen-update hold, released off the request path (Activation.swift's ScreenUpdateReleases; #235's spec,
// Decision Log 2026-10-31): the hold is taken on the caller's thread, its release only enqueues, and a capture drains
// the pending releases first. The SkyLight calls are stand-ins here, so nothing holds the screen.

final class ScreenUpdateReleaseTests: XCTestCase {
  /// A release that blocks until `gate` opens, as SLSReenableUpdate does while the engine's own window animates.
  private final class Recorder: @unchecked Sendable {
    let lock = NSLock()
    var events: [String] = []
    func add(_ event: String) { lock.withLock { events.append(event) } }
    var all: [String] { lock.withLock { events } }
  }

  func testTheHoldIsTakenAtOnceAndItsReleaseDoesNotWaitForTheBlockedReenable() {
    let releases = ScreenUpdateReleases(label: "test.release.blocked")
    let recorder = Recorder(), gate = DispatchSemaphore(value: 0)
    let release = releases.hold {
      recorder.add("hold")
      return { gate.wait(); recorder.add("released") }
    }
    XCTAssertEqual(recorder.all, ["hold"], "taken on the caller's thread before hold returns")
    let started = monotonicMilliseconds()
    release()
    XCTAssertLessThan(monotonicMilliseconds() - started, 50, "the request does not wait for the re-enable")
    XCTAssertEqual(recorder.all, ["hold"])
    gate.signal()
    releases.drain()
    XCTAssertEqual(recorder.all, ["hold", "released"])
  }

  func testACaptureDrainsEveryPendingReleaseFirst() {
    let releases = ScreenUpdateReleases(label: "test.release.drain")
    let recorder = Recorder(), gate = DispatchSemaphore(value: 0)
    let release = releases.hold { { gate.wait(); recorder.add("released") } }
    release()
    let drained = expectation(description: "drained")
    Thread {
      releases.drain()
      recorder.add("capture")
      drained.fulfill()
    }.start()
    usleep(30_000)
    XCTAssertEqual(recorder.all, [], "the capture waits while a release is pending")
    gate.signal()
    wait(for: [drained], timeout: 2)
    XCTAssertEqual(recorder.all, ["released", "capture"])
  }

  func testReleasesRunInTheOrderTheyWereAskedFor() {
    let releases = ScreenUpdateReleases(label: "test.release.order")
    let recorder = Recorder()
    let first = releases.hold { { usleep(5_000); recorder.add("first") } }
    let second = releases.hold { { recorder.add("second") } }
    first()
    second()
    releases.drain()
    XCTAssertEqual(recorder.all, ["first", "second"])
  }

  func testADrainWithNothingPendingReturnsAtOnce() {
    let releases = ScreenUpdateReleases(label: "test.release.idle")
    let started = monotonicMilliseconds()
    releases.drain()
    XCTAssertLessThan(monotonicMilliseconds() - started, 20)
  }
}
