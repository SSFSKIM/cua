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

  /// A scripted focus: `windows` answers the focused window per reading (the last one repeats), `element` the focused
  /// element's window per poll, and every value read is counted.
  private final class ScriptedFocus {
    var windows: [(pid: pid_t, frame: CGRect)?]
    var elementWindows: [(pid: pid_t, frame: CGRect)?]
    var value: String?
    var valueReads = 0
    private var readings = 0, polls = 0

    init(windows: [(pid: pid_t, frame: CGRect)?], elementWindows: [(pid: pid_t, frame: CGRect)?], value: String?) {
      self.windows = windows
      self.elementWindows = elementWindows
      self.value = value
    }

    var source: FocusSource {
      FocusSource(
        reading: {
          let window = self.windows[min(self.readings, self.windows.count - 1)]
          self.readings += 1
          return FocusReading(appPid: window?.pid, bundleIdentifier: "io.github.ssfskim.cua.fixture.electron", windowPid: window?.pid, windowFrame: window?.frame)
        },
        focusedElement: {
          let window = self.elementWindows[min(self.polls, self.elementWindows.count - 1)]
          self.polls += 1
          return (window?.pid, window?.frame, { self.valueReads += 1; return self.value })
        })
    }
  }

  private let named = NamedWindow(pid: 7, bounds: CGRect(x: 10, y: 20, width: 300, height: 400))
  private let namedWindow: (pid: pid_t, frame: CGRect) = (7, CGRect(x: 10, y: 20, width: 300, height: 400))
  private let otherWindow: (pid: pid_t, frame: CGRect) = (9, CGRect(x: 0, y: 0, width: 5, height: 5))

  private func report(_ focus: ScriptedFocus, named: NamedWindow?) -> [String: Any] {
    var clock: Double = 0
    return focusReport(named: named, source: focus.source, now: { clock }, sleep: { clock += $0 })
  }

  /// The value is read only when the focused window is the named one; otherwise it is never read, and only pids and
  /// bounds are reported.
  func testTheValueIsReadOnlyForTheNamedWindow() {
    let inside = ScriptedFocus(windows: [namedWindow], elementWindows: [namedWindow], value: "hello")
    let found = report(inside, named: named)
    XCTAssertEqual(found["named"] as? Bool, true)
    XCTAssertEqual(found["valueHash"] as? String, valueHash("hello"))
    XCTAssertEqual(inside.valueReads, 1)
    XCTAssertEqual((found["focusedApp"] as? [String: Any])?["pid"] as? Int, 7)
    XCTAssertEqual((found["focusedWindow"] as? [String: Any])?["pid"] as? Int, 7)

    let elsewhere = ScriptedFocus(windows: [otherWindow], elementWindows: [otherWindow], value: "secret")
    let other = report(elsewhere, named: named)
    XCTAssertEqual(other["named"] as? Bool, false)
    XCTAssertTrue(other["valueHash"] is NSNull)
    XCTAssertEqual(elsewhere.valueReads, 0, "never read outside the named window")

    let unnamed = ScriptedFocus(windows: [namedWindow], elementWindows: [namedWindow], value: "x")
    XCTAssertTrue(report(unnamed, named: nil)["valueHash"] is NSNull)
    XCTAssertEqual(unnamed.valueReads, 0, "with no window named, no value is read")
  }

  /// The focus moves to another window during the wait: the check before each read stops it, and no hash is reported
  /// (never another window's value).
  func testAFocusThatMovesDuringTheWaitReportsNoHash() {
    let moved = ScriptedFocus(windows: [namedWindow, namedWindow, otherWindow], elementWindows: [namedWindow, otherWindow], value: nil)
    let found = report(moved, named: named)
    XCTAssertEqual(found["named"] as? Bool, true, "the window was the named one when the probe began")
    XCTAssertTrue(found["valueHash"] is NSNull)
    XCTAssertEqual(moved.valueReads, 1, "the one read made while the named window still had the focus")
  }

  /// The focused window is still the named one, but the focused element sits in another window (a popover of another
  /// process): its value is never read.
  func testAnElementOutsideTheNamedWindowIsNeverRead() {
    let focus = ScriptedFocus(windows: [namedWindow], elementWindows: [otherWindow], value: "another window's text")
    let found = report(focus, named: named)
    XCTAssertTrue(found["valueHash"] is NSNull)
    XCTAssertEqual(focus.valueReads, 0)
  }

  /// An element that names no window is not read, and the wait goes on until it does.
  func testAnElementWithNoWindowIsWaitedFor() {
    let focus = ScriptedFocus(windows: [namedWindow], elementWindows: [nil, nil, namedWindow], value: "late")
    XCTAssertEqual(report(focus, named: named)["valueHash"] as? String, valueHash("late"))
    XCTAssertEqual(focus.valueReads, 1)
  }

  /// Hold 2a: a probe process with no WindowServer connection reads no system-wide focused application (-25204, every
  /// time), so the report connects first, before its first reading.
  func testTheReportConnectsToTheWindowServerBeforeItsFirstReading() {
    var events: [String] = []
    let source = FocusSource(
      reading: { events.append("reading"); return FocusReading(appPid: 7, bundleIdentifier: nil, windowPid: 7, windowFrame: CGRect(x: 0, y: 0, width: 5, height: 5)) },
      focusedElement: { events.append("element"); return nil },
      connect: { events.append("connect") })
    var clock: Double = 0
    _ = focusReport(named: nil, source: source, now: { clock }, sleep: { clock += $0 })
    XCTAssertEqual(events, ["connect", "reading"])
  }

  func testNoFocusedAppOrWindowReadsAsNull() {
    let found = report(ScriptedFocus(windows: [nil], elementWindows: [nil], value: nil), named: nil)
    XCTAssertTrue(found["focusedApp"] is NSNull)
    XCTAssertTrue(found["focusedWindow"] is NSNull)
    XCTAssertEqual(found["named"] as? Bool, false)
  }

  /// The wait for a value after enabling the named pid's accessibility: polled up to 1 s, ended early by a focus change.
  func testTheValueWaitPollsForUpToOneSecond() {
    var clock: Double = 0
    var reads = 0
    XCTAssertEqual(awaitValue(timeoutMs: 1_000, now: { clock }, sleep: { clock += $0 }, read: { reads += 1; return reads >= 3 ? .value("v") : .notYet }), "v")
    clock = 0
    reads = 0
    XCTAssertNil(awaitValue(timeoutMs: 1_000, now: { clock }, sleep: { clock += $0 }, read: { reads += 1; return .notYet }))
    XCTAssertGreaterThanOrEqual(clock, 1_000)
    XCTAssertLessThan(clock, 1_100)
    clock = 0
    reads = 0
    XCTAssertNil(awaitValue(timeoutMs: 1_000, now: { clock }, sleep: { clock += $0 }, read: { reads += 1; return reads >= 2 ? .focusMoved : .notYet }))
    XCTAssertEqual(reads, 2, "a moved focus ends the wait at once")
  }
}
