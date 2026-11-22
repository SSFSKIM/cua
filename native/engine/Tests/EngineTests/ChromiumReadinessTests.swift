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

  func testASleepThatOversleepsTheDeadlineDispatchesNothing() {
    // The review's probe: a 2,600 ms budget, a 2,500 ms sleep that wakes at 3,000 ms. The window has passed by then, but
    // so has the deadline: timeoutReached, not the ready path.
    let clock = Clock()
    let engine = engine(clock)
    observe(engine, FakeEnablement())
    clock.onWake = { clock.now += 500 }
    do {
      _ = try engine.awaitChromiumReadiness(method: "click", args: [:], app: app("Electron"), pid: 7, launched: launched,
                                            connection: ConnectionState(id: 1, fd: -1), budgetMs: 2_600)
      XCTFail("dispatched past the deadline")
    } catch let error as EngineError {
      XCTAssertEqual(error.errorName, "timeoutReached")
    } catch {
      XCTFail("\(error)")
    }
    XCTAssertEqual(clock.slept, [2_500])
    XCTAssertEqual(clock.now, 13_000)

    // The same oversleep inside the budget is ready.
    let roomy = Clock()
    let other = self.engine(roomy)
    observe(other, FakeEnablement())
    roomy.onWake = { roomy.now += 500 }
    XCTAssertEqual(gate(other, app("Electron"), budgetMs: 3_100), 2_500)
  }
}

// Ruling 772 (diagnostic run 44068144650): the complete mode's arrival keeps the handles but changes what they say, so the
// first observation after a write waits for readiness before it reads the tree; one the deadline cuts marks its entries
// by their read time, and an action's backstop reads a marked target again from its own handle, never re-finding it by
// identity; a set_value whose re-fetch after an accepted write fails answers valueUnconfirmed.

/// A resolver over a fake tree that counts the re-fetch walks it was asked for.
private final class FakeResolving {
  let tree: FakeTree
  var invalidated = false
  var valid: Set<Int>? = nil
  /// How many validations answer before every handle reads as invalid (nil: no limit).
  var validations: Int? = nil
  /// The elements that become unreadable from the second source on (the handle changing after the refresh's read).
  var unreadableAfterFirstSource: Set<Int> = []
  private(set) var treeReads = 0
  private var sources = 0
  private var validated = 0

  init(_ tree: FakeTree) { self.tree = tree }

  var resolver: ElementResolver {
    ElementResolver(
      invalidated: { [self] _ in invalidated },
      stillValid: { [self] element in
        validated += 1
        if let validations, validated > validations { return false }
        return valid.map { $0.contains(tree.id(element)) } ?? true
      },
      source: { [self] in
        sources += 1
        if sources > 1 { tree.unreadable.formUnion(unreadableAfterFirstSource) }
        return FakeSource(tree)
      },
      tree: { [self] _ in
        treeReads += 1
        return (Engine.element(0), [])
      })
  }
}

final class ChromiumMetadataTests: XCTestCase {
  private let launched = Date(timeIntervalSince1970: 1_000)

  /// A window (0) with a page button (1) and a search field (2) as Basic mode shows them: the button offering only
  /// AXShowMenu and AXScrollToVisible (Chrome for Testing's, run 44068144650), the field without its placeholder.
  private func basicMode() -> FakeTree {
    let tree = FakeTree()
    tree.children = [0: [1, 2]]
    tree.extra = [1: ["AXRole": "AXButton" as CFString, "AXTitle": "Go" as CFString],
                  2: ["AXRole": "AXTextField" as CFString, "AXTitle": "Query" as CFString, "AXValue": "" as CFString]]
    tree.actions = [1: ["AXShowMenu", "AXScrollToVisible"]]
    return tree
  }

  /// The complete mode's arrival: the same handles, the button pressable, the field's placeholder exposed.
  private func completeMode(_ tree: FakeTree) {
    tree.actions[1] = ["AXPress", "AXShowMenu", "AXScrollToVisible"]
    tree.extra[2]?["AXPlaceholderValue"] = "Search" as CFString
  }

  /// One observation of the tree into `lineage`, its entries read at `recordedAt`, as get_app_state stamps them.
  private func observe(_ tree: FakeTree, _ lineage: Lineage, at recordedAt: Double) {
    let walk = TreeWalk(source: FakeSource(tree), lineage: lineage, limits: WalkLimits(deadline: .infinity), markdown: false, visibleFrame: nil)
    walk.revision.recordedAt = recordedAt
    walk.run(window: Engine.element(0), menuBar: nil, menuItems: [])
    lineage.commit(walk.revision)
  }

  private func electronApp(_ directory: URL) throws -> ResolvedApp {
    let contents = directory.appendingPathComponent("Electron.app/Contents")
    try FileManager.default.createDirectory(at: contents, withIntermediateDirectories: true)
    XCTAssertTrue(NSDictionary(dictionary: ["NSPrincipalClass": "AtomApplication"]).write(to: contents.appendingPathComponent("Info.plist"), atomically: true))
    return ResolvedApp(appPath: directory.appendingPathComponent("Electron.app").path, bundleIdentifier: nil, displayName: "Electron", running: nil)
  }

  /// An engine on the given clock and sleeper whose process 7 was enabled at the clock's now.
  private func enabledEngine(_ now: @escaping () -> Double, sleep: @escaping (Double) -> Void) -> Engine {
    let engine = Engine(paths: ServerPaths(socket: "/tmp/x.sock", directory: "/tmp", lock: "/tmp/x.lock", usage: "/tmp/cua-engine-test-usage.json"),
                        screenLocked: { false }, cursorEnabled: false, clock: now, sleep: sleep)
    _ = engine.webAccessibility.enable(pid: 7, launched: launched, connection: 1, access: EnablementAccess(
      listed: { ["AXManualAccessibility"] }, readRole: {}, read: { _ in false }, write: { _, _ in .success }, current: { true }))
    return engine
  }

  func testTheObservationWaitsTheRestOfTheWindowThenRecordsCompleteModeMetadata() throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("cua-366-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: directory) }
    let electron = try electronApp(directory)
    let tree = basicMode()
    var now = 10_000.0
    var slept: [Double] = []
    let engine = enabledEngine({ now }, sleep: { ms in
      slept.append(ms)
      now += ms
      self.completeMode(tree)  // the mode arrives during the wait
    })
    now = 10_400
    let readiness = engine.awaitObservationReadiness(app: electron, pid: 7, launched: launched, budgetMs: 120_000)
    XCTAssertEqual(readiness, .ready(waitedMs: 2_100))
    XCTAssertEqual(slept, [2_100])
    let lineage = Lineage()
    observe(tree, lineage, at: now)
    let button = try XCTUnwrap(lineage.entry(1))
    XCTAssertEqual(button.actions, ["AXPress", "AXShowMenu", "AXScrollToVisible"], "the complete mode's actions recorded")
    XCTAssertEqual(lineage.entry(2)?.identity.placeholder, "Search")
    XCTAssertFalse(recordedBeforeReadiness(button.recordedAt, readyAt: 12_500))

    // A later observation, the window passed, waits for nothing.
    XCTAssertEqual(engine.awaitObservationReadiness(app: electron, pid: 7, launched: launched, budgetMs: 120_000), .ready(waitedMs: 0))
    XCTAssertEqual(slept, [2_100])
  }

  func testAnObservationTheDeadlineCutsReadsAnywayAndMarksItsEntries() throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("cua-366-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: directory) }
    let electron = try electronApp(directory)
    var now = 10_000.0
    var slept: [Double] = []
    let engine = enabledEngine({ now }, sleep: { slept.append($0); now += $0 })
    now = 10_400
    XCTAssertEqual(engine.awaitObservationReadiness(app: electron, pid: 7, launched: launched, budgetMs: 1_000), .deadline(waitedMs: 0),
                   "no sleep that would end past the deadline")
    XCTAssertEqual(slept, [])
    let lineage = Lineage()
    observe(basicMode(), lineage, at: now)
    let readiness = try XCTUnwrap(engine.entryReadiness(app: electron, pid: 7, launched: launched))
    XCTAssertEqual(readiness.readyAt, 12_500)
    for number in [1, 2] {
      XCTAssertTrue(recordedBeforeReadiness(lineage.entry(number)?.recordedAt, readyAt: readiness.readyAt), "entry \(number) marked")
    }
    XCTAssertFalse(recordedBeforeReadiness(12_500, readyAt: 12_500), "read at readiness is not before it")
    XCTAssertFalse(recordedBeforeReadiness(nil, readyAt: 12_500))
  }

  func testTheBackstopReadsAMarkedTargetAgainFromItsOwnHandleAndLeavesAnUnmarkedOneAlone() throws {
    let tree = basicMode()
    let lineage = Lineage()
    observe(tree, lineage, at: 10_400)  // before readiness at 12 500
    completeMode(tree)
    let fake = FakeResolving(tree)
    let marked = try lineage.resolve(elementToken(1), resolver: fake.resolver, readiness: EntryReadiness(readyAt: 12_500, now: 12_600))
    XCTAssertTrue(CFEqual(marked.element, Engine.element(1)), "the same handle")
    XCTAssertEqual(marked.actions, ["AXPress", "AXShowMenu", "AXScrollToVisible"], "the click plan finds AXPress")
    XCTAssertEqual(marked.recordedAt, 12_600, "read again now")
    XCTAssertEqual(fake.treeReads, 0, "nothing re-found")
    let field = try lineage.resolve(elementToken(2), resolver: fake.resolver, readiness: EntryReadiness(readyAt: 12_500, now: 12_600))
    XCTAssertEqual(field.identity.placeholder, "Search", "the identity a later re-fetch matches against")

    // An entry read after readiness is left as recorded, whatever its handle says now.
    let later = Lineage()
    let unchanged = basicMode()
    observe(unchanged, later, at: 13_000)
    completeMode(unchanged)
    let unmarked = try later.resolve(elementToken(1), resolver: FakeResolving(unchanged).resolver, readiness: EntryReadiness(readyAt: 12_500, now: 13_100))
    XCTAssertEqual(unmarked.actions, ["AXShowMenu", "AXScrollToVisible"], "not refreshed")
    XCTAssertEqual(unmarked.recordedAt, 13_000)
    // Nor is a marked one without readiness (no Chromium write).
    let plain = Lineage()
    let other = basicMode()
    observe(other, plain, at: 10_400)
    completeMode(other)
    XCTAssertEqual(try plain.resolve(elementToken(1), resolver: FakeResolving(other).resolver).actions, ["AXShowMenu", "AXScrollToVisible"])
  }

  func testTheBackstopNeverAdoptsAnotherHandle() throws {
    let tree = basicMode()
    let lineage = Lineage()
    observe(tree, lineage, at: 10_400)
    completeMode(tree)
    // Another element (6) answers the complete mode's identity of the button exactly.
    tree.children[0] = [1, 2, 6]
    tree.extra[6] = ["AXRole": "AXButton" as CFString, "AXTitle": "Go" as CFString]
    tree.actions[6] = ["AXPress", "AXShowMenu", "AXScrollToVisible"]
    let readiness = EntryReadiness(readyAt: 12_500, now: 12_600)

    // The button's own handle still reads: it is the one kept, even under an invalidation that re-reads it.
    let fake = FakeResolving(tree)
    fake.invalidated = true
    let kept = try lineage.resolve(elementToken(1), resolver: fake.resolver, readiness: readiness)
    XCTAssertTrue(CFEqual(kept.element, Engine.element(1)))
    XCTAssertEqual(fake.treeReads, 0)

    // A marked target whose handle no longer validates, or no longer reads, is no longer valid: no walk, no adoption.
    for gone in ["invalid", "unreadable"] {
      let again = Lineage()
      let replaced = basicMode()
      observe(replaced, again, at: 10_400)
      completeMode(replaced)
      replaced.children[0] = [6, 2]
      replaced.extra[6] = ["AXRole": "AXButton" as CFString, "AXTitle": "Go" as CFString]
      replaced.actions[6] = ["AXPress", "AXShowMenu", "AXScrollToVisible"]
      let resolving = FakeResolving(replaced)
      resolving.invalidated = true
      if gone == "invalid" { resolving.valid = [0, 2, 6] } else { replaced.unreadable = [1] }
      XCTAssertThrowsError(try again.resolve(elementToken(1), resolver: resolving.resolver, readiness: readiness), gone) { error in
        XCTAssertEqual((error as? EngineError)?.errorName, "elementNoLongerValid")
      }
      XCTAssertEqual(resolving.treeReads, 0, "\(gone): nothing re-found by identity")
      XCTAssertTrue(CFEqual(try XCTUnwrap(again.entry(1)).element, Engine.element(1)), "\(gone): the entry keeps its own handle")
    }
  }

  func testAHandleLostAfterTheRefreshIsRefusedNotReplacedByAnIdentityWalk() throws {
    // Round 4's probe: the marked button's handle reads and validates for the refresh, then goes (invalid, unreadable)
    // before anything else reads it, while another element (6) matches the identity the refresh just read. The
    // resolution stays pinned to the handle: refused, no walk, the token still the old handle's.
    let tree = basicMode()
    let lineage = Lineage()
    observe(tree, lineage, at: 10_400)
    completeMode(tree)
    tree.children[0] = [1, 2, 6]
    tree.extra[6] = ["AXRole": "AXButton" as CFString, "AXTitle": "Go" as CFString]
    tree.actions[6] = ["AXPress", "AXShowMenu", "AXScrollToVisible"]
    for refetch in [Refetch.ifNeeded, .always, .ignoringValue] {
      let fake = FakeResolving(tree)
      fake.invalidated = true
      fake.validations = 1
      fake.unreadableAfterFirstSource = [1]
      tree.unreadable = []
      XCTAssertThrowsError(try lineage.resolve(elementToken(1), resolver: fake.resolver, refetch: refetch,
                                               readiness: EntryReadiness(readyAt: 12_500, now: 12_600)), "\(refetch)") { error in
        XCTAssertEqual((error as? EngineError)?.errorName, "elementNoLongerValid")
      }
      XCTAssertEqual(fake.treeReads, 0, "\(refetch): no identity walk")
      XCTAssertTrue(CFEqual(try XCTUnwrap(lineage.entry(1)).element, Engine.element(1)), "\(refetch): handle 6 not adopted")
      XCTAssertEqual(lineage.entry(1)?.recordedAt, 10_400, "\(refetch): left as recorded, still marked")
      XCTAssertEqual(lineage.entry(1)?.actions, ["AXShowMenu", "AXScrollToVisible"], "\(refetch): nothing the lost handle read was kept")
    }
  }

  func testAnAcceptedWriteWhoseReFetchFailsIsValueUnconfirmed() throws {
    // The field read after readiness (unmarked), then its metadata changes between the write and the re-fetch: its
    // label changes, so nothing matches the stored identity any more. (Before #398 the placeholder's arrival did this.)
    let tree = basicMode()
    let lineage = Lineage()
    observe(tree, lineage, at: 13_000)
    tree.extra[2]?["AXValue"] = "cua" as CFString
    tree.extra[2]?["AXTitle"] = "Filter" as CFString
    let fake = FakeResolving(tree)
    XCTAssertThrowsError(try confirmingWrittenValue(app: "Electron") {
      _ = try lineage.resolve(elementToken(2), resolver: fake.resolver, refetch: .ignoringValue)
    }) { error in
      let engineError = error as? EngineError
      XCTAssertEqual(engineError?.errorName, "valueUnconfirmed", "not elementNoLongerValid: the value was sent")
      XCTAssertEqual(engineError?.message, valueUnconfirmed(app: "Electron").message)
    }
    XCTAssertEqual(fake.treeReads, 1, "the re-fetch was tried")

    // A re-fetch that finds the field passes through, the complete mode's placeholder arriving with the write (#398:
    // run 44068144650's case, which answered elementNoLongerValid before #366 and valueUnconfirmed after it).
    let found = basicMode()
    let observed = Lineage()
    observe(found, observed, at: 13_000)
    found.extra[2]?["AXValue"] = "cua" as CFString
    found.extra[2]?["AXPlaceholderValue"] = "Search" as CFString
    XCTAssertNoThrow(try confirmingWrittenValue(app: "Electron") {
      _ = try observed.resolve(elementToken(2), resolver: FakeResolving(found).resolver, refetch: .ignoringValue)
    })
  }
}
