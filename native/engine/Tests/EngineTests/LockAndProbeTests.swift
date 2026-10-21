import ApplicationServices
import CoreGraphics
import Foundation
import XCTest
@testable import Engine

// The lock screen on every request (the own native engine spec, Design "Lock screen") and the probe's `focus` command
// (Interfaces, UserProbe). Nothing here reads the session's real lock state, another app's focus or any value: the
// engine's lock reading is replaced, and the probe's reads are its pure parts over synthetic readings.

// MARK: The lock screen

final class LockScreenTests: XCTestCase {
  private func engine(locked: Bool) -> Engine {
    Engine(paths: ServerPaths(socket: "/tmp/x.sock", directory: "/tmp", lock: "/tmp/x.lock", usage: "/tmp/cua-engine-test-usage.json"),
           intervention: InterventionMonitor(listenGranted: { false }), screenLocked: { locked })
  }

  private func execute(_ engine: Engine, _ method: String, _ args: [String: Any] = [:]) -> Result<Any, EngineError> {
    let params: [String: Any] = ["method": method, "args": args, "deadlineUnixMilliseconds": unixMilliseconds() + 60_000]
    return engine.handle(Request(id: 1, method: "execute", params: params), on: ConnectionState(id: 1, fd: -1), receivedAt: unixMilliseconds()).result
  }

  func testTheSessionDictionarysLockFlag() {
    XCTAssertTrue(sessionIsLocked(["CGSSessionScreenIsLocked": true]))
    XCTAssertFalse(sessionIsLocked(["CGSSessionScreenIsLocked": false]))
    XCTAssertFalse(sessionIsLocked([:]))
    XCTAssertFalse(sessionIsLocked(nil))
  }

  func testTheRefusalIsTheVendorsFirstSentence() {
    XCTAssertThrowsError(try refuseWhenLocked(isLocked: { true })) { error in
      let refusal = error as? EngineError
      XCTAssertEqual(refusal?.code, -10020)
      XCTAssertEqual(refusal?.errorName, "screenLocked")
      XCTAssertEqual(refusal?.message,
                     "The Mac is locked and automatic unlock could not unlock it. Ask the user to unlock the Mac manually before continuing.")
    }
    XCTAssertNoThrow(try refuseWhenLocked(isLocked: { false }))
  }

  /// Every execute is refused while the Mac is locked, whatever its method, before the app is resolved; an input
  /// method's refusal carries the input meta with nothing posted.
  func testEveryExecuteIsRefusedWhileLocked() {
    let locked = engine(locked: true)
    for method in ["list_apps", "resolve_app", "get_app_state", "press_key", "type_text", "paste", "scroll", "unknown_method"] {
      guard case .failure(let error) = execute(locked, method, ["app": "io.github.ssfskim.cua.engine-test.no-such-app", "key": "a", "text": "a"]) else {
        return XCTFail("\(method) answered while locked")
      }
      XCTAssertEqual(error.errorName, "screenLocked", method)
    }
    guard case .failure(let click) = execute(locked, "click", ["app": "io.github.ssfskim.cua.engine-test.no-such-app", "x": 1, "y": 1]) else {
      return XCTFail("click answered while locked")
    }
    let meta = click.extra["meta"] as? [String: Any]
    XCTAssertNotNil(meta, "an input method's refusal carries the input meta")
    XCTAssertTrue(meta?["startedAt"] is NSNull)
  }

  /// The protocol's own methods are not app requests: ping and status answer while locked (doctor reads status).
  func testPingAndStatusStillAnswer() {
    let locked = engine(locked: true)
    let connection = ConnectionState(id: 1, fd: -1)
    let ping = locked.handle(Request(id: 1, method: "ping", params: ["clientApiVersion": serverApiVersion]), on: connection, receivedAt: 0)
    guard case .success = ping.result else { return XCTFail("ping refused") }
    let status = locked.handle(Request(id: 2, method: "status", params: [:]), on: connection, receivedAt: 0)
    guard case .success(let answer) = status.result else { return XCTFail("status refused") }
    XCTAssertNotNil((answer as? [String: Any])?["routeAdvice"] as? [String], "doctor's list of apps route 3 failed for")
  }

  func testTheSpikeProbeMethodsAreGone() {
    let unlocked = engine(locked: false)
    for method in ["probe_tap", "probe_spike"] {
      let outcome = unlocked.handle(Request(id: 1, method: method, params: ["op": "stop"]), on: ConnectionState(id: 1, fd: -1), receivedAt: 0)
      guard case .failure(let error) = outcome.result else { return XCTFail("\(method) answered") }
      XCTAssertEqual(error.code, -32601, method)
    }
  }
}

// MARK: The probe's focus command

final class FocusProbeTests: XCTestCase {
  func testTheNamedWindowArgument() {
    let named = NamedWindow.parse("4242,10,20.5,300,400")
    XCTAssertEqual(named?.pid, 4242)
    XCTAssertEqual(named?.bounds, CGRect(x: 10, y: 20.5, width: 300, height: 400))
    for bad in ["", "4242", "4242,1,2,3", "x,1,2,3,4", "4242,1,2,3,4,5", "0,1,2,3,4", "-3,1,2,3,4"] {
      XCTAssertNil(NamedWindow.parse(bad), bad)
    }
  }

  func testTheNamedWindowMatchesByOwnerAndBoundsWithinAPoint() {
    let named = NamedWindow(pid: 7, bounds: CGRect(x: 10, y: 20, width: 300, height: 400))
    XCTAssertTrue(named.matches(pid: 7, frame: CGRect(x: 10.5, y: 19.6, width: 300, height: 400.9)))
    XCTAssertFalse(named.matches(pid: 8, frame: CGRect(x: 10, y: 20, width: 300, height: 400)))
    XCTAssertFalse(named.matches(pid: 7, frame: CGRect(x: 12, y: 20, width: 300, height: 400)))
    XCTAssertFalse(named.matches(pid: 7, frame: nil))
  }

  func testTheValueHashIsSHA256OfTheUTF8Value() {
    XCTAssertEqual(valueHash("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    XCTAssertEqual(valueHash(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
    XCTAssertEqual(valueHash("한글"), "bd87f9bb68b67d2fa1cb82b6751820e946d5b1316d25d5fd96512fb4be44a2a8", "UTF-8, as the harness hashes the text it sent")
  }

  /// The value is read only when the focused window is the named one; otherwise it is never read, and only pids and
  /// bounds are reported.
  func testTheValueIsReadOnlyForTheNamedWindow() {
    let named = NamedWindow(pid: 7, bounds: CGRect(x: 10, y: 20, width: 300, height: 400))
    let reading = FocusReading(appPid: 7, bundleIdentifier: "io.github.ssfskim.cua.fixture.electron", windowPid: 7,
                               windowFrame: CGRect(x: 10, y: 20, width: 300, height: 400))
    var reads = 0
    let report = focusReport(reading, named: named, value: { reads += 1; return "hello" })
    XCTAssertEqual(report["named"] as? Bool, true)
    XCTAssertEqual(report["valueHash"] as? String, valueHash("hello"))
    XCTAssertEqual(reads, 1)
    XCTAssertEqual((report["focusedApp"] as? [String: Any])?["pid"] as? Int, 7)
    XCTAssertEqual((report["focusedWindow"] as? [String: Any])?["pid"] as? Int, 7)

    let elsewhere = focusReport(FocusReading(appPid: 9, bundleIdentifier: "com.apple.finder", windowPid: 9, windowFrame: CGRect(x: 0, y: 0, width: 5, height: 5)),
                                named: named, value: { reads += 1; return "secret" })
    XCTAssertEqual(elsewhere["named"] as? Bool, false)
    XCTAssertTrue(elsewhere["valueHash"] is NSNull)
    XCTAssertEqual(reads, 1, "never read outside the named window")

    let unnamed = focusReport(reading, named: nil, value: { reads += 1; return "x" })
    XCTAssertTrue(unnamed["valueHash"] is NSNull)
    XCTAssertEqual(reads, 1, "with no window named, no value is read")
  }

  func testNoFocusedAppOrWindowReadsAsNull() {
    let report = focusReport(FocusReading(appPid: nil, bundleIdentifier: nil, windowPid: nil, windowFrame: nil), named: nil, value: { nil })
    XCTAssertTrue(report["focusedApp"] is NSNull)
    XCTAssertTrue(report["focusedWindow"] is NSNull)
    XCTAssertEqual(report["named"] as? Bool, false)
  }

  /// The wait for a value after enabling the named pid's accessibility: polled up to 1 s.
  func testTheValueWaitPollsForUpToOneSecond() {
    var clock: Double = 0
    var reads = 0
    XCTAssertEqual(awaitValue(timeoutMs: 1_000, now: { clock }, sleep: { clock += $0 }, read: { reads += 1; return reads >= 3 ? "v" : nil }), "v")
    clock = 0
    reads = 0
    XCTAssertNil(awaitValue(timeoutMs: 1_000, now: { clock }, sleep: { clock += $0 }, read: { reads += 1; return nil }))
    XCTAssertGreaterThanOrEqual(clock, 1_000)
    XCTAssertLessThan(clock, 1_100)
  }
}
