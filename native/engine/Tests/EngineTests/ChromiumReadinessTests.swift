import ApplicationServices
import Foundation
import XCTest
@testable import Engine

// #366 (ruling 766): an element action into a Chromium-family app waits out what remains of 2.5 s after the engine's
// last accepted enablement write (ChromiumReadiness.swift), on the engine's clock and sleeper, with no hold kept through
// the wait; an enablement that reads true is not rewritten, and so does not restart the window.

/// One application element's enablement attribute: what it lists and reads, its writes and how they answer.
private final class FakeEnablement: @unchecked Sendable {
  var names = ["AXManualAccessibility", "AXEnhancedUserInterface"]
  var values: [String: Bool] = [:]
  var answer: AXError = .success
  /// The attribute reads as unreadable: written, but never owned, so every observation writes it again.
  var unreadable = false
  var writes: [String] = []

  var access: EnablementAccess {
    EnablementAccess(
      listed: { self.names },
      readRole: {},
      read: { self.unreadable ? nil : self.values[$0] ?? false },
      write: { name, value in
        self.writes.append("\(name)=\(value)")
        if self.answer == .success || self.answer == .notImplemented { self.values[name] = value }
        return self.answer
      },
      current: { true })
  }
}

private final class Clock: @unchecked Sendable {
  var now = 10_000.0
  var slept: [Double] = []
  /// Runs as the sleeper is called, before the clock moves on.
  var onSleep: () -> Void = {}
  /// Runs once the clock has moved on by the sleep.
  var onWake: () -> Void = {}
}

final class ChromiumReadinessTests: XCTestCase {
  private let launched = Date(timeIntervalSince1970: 1_000)
  private var bundles: URL!

  override func setUpWithError() throws {
    bundles = FileManager.default.temporaryDirectory.appendingPathComponent("cua-366-\(UUID().uuidString)")
    for (name, principal) in [("Electron", "AtomApplication"), ("Chrome", "BrowserCrApplication"), ("Firefox", "GeckoNSApplication"),
                              ("TextEdit", "NSApplication")] {
      let contents = bundles.appendingPathComponent("\(name).app/Contents")
      try FileManager.default.createDirectory(at: contents, withIntermediateDirectories: true)
      XCTAssertTrue(NSDictionary(dictionary: ["NSPrincipalClass": principal]).write(to: contents.appendingPathComponent("Info.plist"), atomically: true))
    }
  }

  override func tearDownWithError() throws { try FileManager.default.removeItem(at: bundles) }

  private func app(_ name: String) -> ResolvedApp {
    ResolvedApp(appPath: bundles.appendingPathComponent("\(name).app").path, bundleIdentifier: nil, displayName: name, running: nil)
  }

  private func engine(_ clock: Clock) -> Engine {
    Engine(paths: ServerPaths(socket: "/tmp/x.sock", directory: "/tmp", lock: "/tmp/x.lock", usage: "/tmp/cua-engine-test-usage.json"),
           screenLocked: { false }, cursorEnabled: false, clock: { clock.now }, sleep: { ms in
             clock.onSleep()
             clock.slept.append(ms)
             clock.now += ms
             clock.onWake()
           })
  }

  /// The engine's observation enablement of process 7 by connection 1, at the clock's now.
  private func observe(_ engine: Engine, _ fake: FakeEnablement, connection: Int = 1) {
    _ = engine.webAccessibility.enable(pid: 7, launched: launched, connection: connection, access: fake.access)
  }

  private func gate(_ engine: Engine, _ app: ResolvedApp, method: String = "click", args: [String: Any] = [:],
                    connection: ConnectionState = ConnectionState(id: 1, fd: -1), budgetMs: Double = 120_000) -> Double {
    do {
      return try engine.awaitChromiumReadiness(method: method, args: args, app: app, pid: 7, launched: launched, connection: connection,
                                               budgetMs: budgetMs)
    } catch {
      XCTFail("refused: \(error)")
      return -1
    }
  }

  func testAnActionWaitsOutWhatRemainsOfTheWindowSinceTheWrite() {
    let clock = Clock()
    let engine = engine(clock)
    let fake = FakeEnablement()
    observe(engine, fake)
    XCTAssertEqual(fake.writes, ["AXManualAccessibility=true"])
    XCTAssertEqual(engine.webAccessibility.lastEnablementWrite(pid: 7, launched: launched), 10_000)

    clock.now = 10_500
    XCTAssertEqual(gate(engine, app("Electron")), 2_000, "0.5 s after the write: the 2.0 s that remain")
    XCTAssertEqual(clock.slept, [2_000])
    XCTAssertEqual(gate(engine, app("Electron")), 0, "the window has passed once waited out")

    clock.slept = []
    clock.now = 13_000
    XCTAssertEqual(gate(engine, app("Electron")), 0, "3 s after the write: no wait")
    clock.now = 12_500
    XCTAssertEqual(gate(engine, app("Chrome")), 0, "the window's end")
    clock.now = 12_499
    XCTAssertEqual(gate(engine, app("Chrome")), 1)
    XCTAssertEqual(clock.slept, [1])
  }

  func testTheWaitIsTheWindowsRestWhereverTheClockStands() {
    XCTAssertEqual(chromiumActionWindowMs, 2_500)
    XCTAssertEqual(chromiumActionWaitMs(engine: .chromium, lastWrite: 1_000, now: 1_000), 2_500, "an action at the write waits the whole window")
    XCTAssertEqual(chromiumActionWaitMs(engine: .chromium, lastWrite: 1_000, now: 1_500), 2_000)
    XCTAssertEqual(chromiumActionWaitMs(engine: .chromium, lastWrite: 1_000, now: 3_499), 1)
    XCTAssertEqual(chromiumActionWaitMs(engine: .chromium, lastWrite: 1_000, now: 3_500), 0)
    XCTAssertEqual(chromiumActionWaitMs(engine: .chromium, lastWrite: 1_000, now: 60_000), 0)
    XCTAssertEqual(chromiumActionWaitMs(engine: .chromium, lastWrite: 1_000, now: 0), 2_500, "never more than the window")
    XCTAssertEqual(chromiumActionWaitMs(engine: .chromium, lastWrite: nil, now: 1_000), 0, "no write, no wait")
    XCTAssertEqual(chromiumActionWaitMs(engine: .gecko, lastWrite: 1_000, now: 1_000), 0)
    XCTAssertEqual(chromiumActionWaitMs(engine: .other, lastWrite: 1_000, now: 1_000), 0)
  }

  func testAnAppWhosePagesAreNotChromiumsNeverWaits() {
    let clock = Clock()
    let engine = engine(clock)
    observe(engine, FakeEnablement())
    clock.now = 10_500
    for name in ["Firefox", "TextEdit"] {
      for method in elementActionMethods.union(["scroll"]) {
        XCTAssertEqual(gate(engine, app(name), method: method, args: ["element": "e1"]), 0, "\(name) \(method)")
      }
    }
    XCTAssertEqual(clock.slept, [])
  }

  func testAChromiumAppTheEngineWroteNothingToDoesNotWait() {
    let clock = Clock()
    let engine = engine(clock)
    XCTAssertEqual(gate(engine, app("Electron")), 0)
    let failing = FakeEnablement()
    failing.answer = .cannotComplete
    observe(engine, failing)
    XCTAssertEqual(failing.writes.first, "AXManualAccessibility=true", "attempted")
    XCTAssertNil(engine.webAccessibility.lastEnablementWrite(pid: 7, launched: launched), "a write that failed is not accepted")
    XCTAssertEqual(gate(engine, app("Electron")), 0)
    XCTAssertEqual(clock.slept, [])
  }

  func testChromesNotImplementedAnswerThatTookCountsAsTheWrite() {
    // #292: Chrome answers its AXEnhancedUserInterface write kAXErrorNotImplemented while acting on it.
    let clock = Clock()
    let engine = engine(clock)
    let chrome = FakeEnablement()
    chrome.names = ["AXEnhancedUserInterface"]
    chrome.answer = .notImplemented
    observe(engine, chrome)
    XCTAssertEqual(engine.webAccessibility.lastEnablementWrite(pid: 7, launched: launched), 10_000)
    clock.now = 11_000
    XCTAssertEqual(gate(engine, app("Chrome")), 1_500)
  }

  func testAnEnablementThatReadsTrueIsNotRewrittenAndDoesNotRestartTheWindow() {
    // Another client's (VoiceOver's) enablement: read true, never written, so the engine started no countdown.
    let clock = Clock()
    let engine = engine(clock)
    let theirs = FakeEnablement()
    theirs.values["AXManualAccessibility"] = true
    observe(engine, theirs)
    observe(engine, theirs, connection: 2)
    XCTAssertEqual(theirs.writes, [], "read true: not rewritten")
    XCTAssertNil(engine.webAccessibility.lastEnablementWrite(pid: 7, launched: launched))
    XCTAssertEqual(gate(engine, app("Electron")), 0)

    // The engine's own, owned once written: later observations and inputs, from any connection, neither read nor write it.
    let ownClock = Clock()
    let own = self.engine(ownClock)
    let fake = FakeEnablement()
    observe(own, fake)
    ownClock.now = 12_000
    observe(own, fake)
    observe(own, fake, connection: 2)
    own.webAccessibility.inputEnablement(chromium: true, pid: 7, launched: launched, connection: 3, access: fake.access)
    XCTAssertEqual(fake.writes, ["AXManualAccessibility=true"], "written once")
    XCTAssertEqual(own.webAccessibility.lastEnablementWrite(pid: 7, launched: launched), 10_000, "the window still runs from the one write")
    ownClock.now = 12_600
    XCTAssertEqual(gate(own, app("Electron")), 0)
    XCTAssertEqual(ownClock.slept, [])
  }

  func testAnInputThatEnablesWaitsTheWholeWindow() {
    // An action with no observation before it (or after a grace release) takes the observation's enablement step itself
    // (#292): its write starts the window, which the action then waits out.
    let clock = Clock()
    let engine = engine(clock)
    let fake = FakeEnablement()
    engine.webAccessibility.inputEnablement(chromium: true, pid: 7, launched: launched, connection: 1, access: fake.access)
    XCTAssertEqual(fake.writes, ["AXManualAccessibility=true"])
    XCTAssertEqual(gate(engine, app("Electron")), chromiumActionWindowMs)
  }

  func testTheEnginesOwnWriteBackIsWrittenAgainAndStartsANewWindow() {
    // Decision Log 2026-10-22: after the engine's own write-back Chromium's attribute reads true (AppKit's readback) with
    // its mode gone, so the next observation writes it again, owned; that write restarts the countdown, and is waited out.
    let clock = Clock()
    let web = WebAccessibility(releaseGraceMs: 0, now: { clock.now })
    let fake = FakeEnablement()
    _ = web.enable(pid: 7, launched: launched, connection: 1, access: fake.access)
    web.release(connection: 1)
    fake.values["AXManualAccessibility"] = true
    clock.now = 40_000
    XCTAssertEqual(web.enable(pid: 7, launched: launched, connection: 2, access: fake.access), "AXManualAccessibility")
    XCTAssertEqual(fake.writes, ["AXManualAccessibility=true", "AXManualAccessibility=false", "AXManualAccessibility=true"])
    XCTAssertEqual(web.lastEnablementWrite(pid: 7, launched: launched), 40_000)
  }

  func testTheWaitNeverRunsWhileAHoldIsActive() {
    let clock = Clock()
    let engine = engine(clock)
    observe(engine, FakeEnablement())
    clock.now = 10_500
    let electron = app("Electron")

    // A focus hold an earlier action left on the app ends before the wait; the action takes it again (FocusHold.swift).
    let connection = ConnectionState(id: 1, fd: -1)
    var released = false
    connection.focusHold.hold(app: electron.key) { released = true; return true }
    clock.onSleep = {
      XCTAssertTrue(released, "the hold's activation released before the wait")
      XCTAssertNil(connection.focusHold.app, "no focus hold through the wait")
      XCTAssertNil(connection.menuSpan.app, "no menu span through the wait")
    }
    XCTAssertEqual(gate(engine, electron, connection: connection), 2_000)

    // A recorded menu's span is kept through its item's press (MenuSpan.swift), so that press does not wait.
    clock.now = 10_500
    clock.slept = []
    let inMenu = ConnectionState(id: 2, fd: -1)
    var menuReleased = false
    inMenu.menuSpan.hold(app: electron.key) { menuReleased = true; return true }
    XCTAssertEqual(gate(engine, electron, connection: inMenu), 0)
    XCTAssertEqual(clock.slept, [])
    XCTAssertFalse(menuReleased)
    XCTAssertEqual(inMenu.menuSpan.app, electron.key, "the span holds on")

    // No hold to end where none is due: a hold is left alone when the window has passed.
    clock.now = 20_000
    let held = ConnectionState(id: 3, fd: -1)
    held.focusHold.hold(app: electron.key) { true }
    XCTAssertEqual(gate(engine, electron, connection: held), 0)
    XCTAssertEqual(held.focusHold.app, electron.key)
  }

  func testEveryRequestThatMayCarryAnElementActionGoesThroughTheGate() {
    // execute's vocabulary (Methods.swift): the methods that may act on an element through accessibility wait, a scroll
    // only when it names an element (its scroll into view); the ones that only post events, observe or resolve do not.
    let vocabulary = ["list_apps", "resolve_app", "get_app_state", "click", "press_key", "type_text", "paste", "set_value", "select_text",
                      "perform_secondary_action", "scroll", "drag"]
    let elementActions: Set<String> = ["click", "set_value", "select_text", "perform_secondary_action"]
    XCTAssertEqual(elementActionMethods, elementActions)
    let clock = Clock()
    let engine = engine(clock)
    observe(engine, FakeEnablement())
    for method in vocabulary {
      for args in [[:], ["element": "e1"]] as [[String: Any]] {
        clock.now = 10_500
        let waits = elementActions.contains(method) || (method == "scroll" && args["element"] != nil)
        XCTAssertEqual(gate(engine, app("Electron"), method: method, args: args), waits ? 2_000 : 0, "\(method) \(args)")
      }
    }
    XCTAssertFalse(mayCarryElementAction(method: "scroll", args: ["x": 10, "y": 10]), "a scroll at a point posts a wheel")
  }

  func testAWriteLandingMidWaitIsWaitedOutToo() {
    // An attribute that could not be read is written but never owned, so another connection's observation writes it
    // again while this request sleeps: the window restarts there, and the request waits until none of it remains.
    let clock = Clock()
    let engine = engine(clock)
    let fake = FakeEnablement()
    fake.unreadable = true
    observe(engine, fake)
    var wakes = 0
    clock.onWake = {
      wakes += 1
      guard wakes == 1 else { return }
      let woke = clock.now
      clock.now = 11_000
      self.observe(engine, fake, connection: 2)
      clock.now = woke
    }
    XCTAssertEqual(gate(engine, app("Electron")), 3_500)
    XCTAssertEqual(fake.writes, ["AXManualAccessibility=true", "AXManualAccessibility=true"])
    XCTAssertEqual(clock.slept, [2_500, 1_000], "woken at 12.5 s, 1.5 s after the second write: its last 1.0 s waited out")
    XCTAssertEqual(clock.now, 13_500)
  }

  func testAWindowTheDeadlineCannotWaitOutTimesOutWithNothingDispatched() {
    let clock = Clock()
    let engine = engine(clock)
    observe(engine, FakeEnablement())
    let electron = app("Electron")
    let connection = ConnectionState(id: 1, fd: -1)
    var released = false
    connection.focusHold.hold(app: electron.key) { released = true; return true }
    func refused(_ budgetMs: Double) -> String? {
      do {
        _ = try engine.awaitChromiumReadiness(method: "click", args: [:], app: electron, pid: 7, launched: launched,
                                              connection: connection, budgetMs: budgetMs)
        return nil
      } catch let error as EngineError {
        return error.errorName
      } catch {
        return "\(error)"
      }
    }
    XCTAssertEqual(refused(100), "timeoutReached", "a 100 ms deadline on a fresh write")
    XCTAssertEqual(refused(2_500), "timeoutReached", "readiness at the deadline itself is past it")
    XCTAssertEqual(clock.slept, [], "nothing slept")
    XCTAssertFalse(released, "the holds as they were")
    XCTAssertEqual(connection.focusHold.app, electron.key)
    XCTAssertNil(refused(2_501))
    XCTAssertEqual(clock.slept, [2_500])

    // A write landing mid-wait that pushes readiness past the deadline times out at the wake, before any dispatch.
    let late = Clock()
    let other = self.engine(late)
    let fake = FakeEnablement()
    fake.unreadable = true
    observe(other, fake)
    late.onWake = {
      late.onWake = {}
      self.observe(other, fake, connection: 2)
    }
    do {
      _ = try other.awaitChromiumReadiness(method: "click", args: [:], app: electron, pid: 7, launched: launched,
                                           connection: ConnectionState(id: 4, fd: -1), budgetMs: 4_000)
      XCTFail("dispatched past the deadline")
    } catch let error as EngineError {
      XCTAssertEqual(error.errorName, "timeoutReached")
    } catch {
      XCTFail("\(error)")
    }
    XCTAssertEqual(late.slept, [2_500], "the second window's 2.5 s would end past the 4 s budget")
  }
}
