import ApplicationServices
import CoreGraphics
import Foundation
import XCTest
@testable import Engine

// User intervention (the own native engine spec, Design "User intervention"; R/F-helper-logic.md §9): the tap's pinned
// fields, the attribution, the debounce and the re-query flag, the pre-action refusal and the in-flight stop, and the
// monitor with detection off. No tap is created here and nothing is posted: the ledger is fed by hand, as the tap's
// callback would feed it.

// MARK: The tap's pinned fields and the attribution

final class TapFieldsTests: XCTestCase {
  private func event(_ type: CGEventType) -> CGEvent {
    switch type {
    case .keyDown: return CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: true)!
    case .scrollWheel: return CGEvent(scrollWheelEvent2Source: nil, units: .line, wheelCount: 1, wheel1: 1, wheel2: 0, wheel3: 0)!
    default: return CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: .zero, mouseButton: .left)!
    }
  }

  /// The fields the callback touches, from a crafted event, and nothing else: type, 41, 40 and 51 (the spec's "User
  /// intervention" pins this set; the Mirror asserts the struct carries no more, and a timestamped event proves the
  /// timestamp is not among them).
  func testTheCallbackReadsExactlyThePinnedFields() {
    let down = event(.leftMouseDown)
    down.setIntegerValueField(eventField(41), value: 501)
    down.setIntegerValueField(eventField(40), value: 502)
    down.setIntegerValueField(eventField(51), value: 77)
    down.timestamp = 12345  // an event field outside the pinned set: it must not surface
    let fields = tapFields(down)
    XCTAssertEqual(fields.type, .leftMouseDown)
    XCTAssertEqual(fields.sourcePID, 501)
    XCTAssertEqual(fields.targetPID, 502)
    XCTAssertEqual(fields.windowID, 77)
    XCTAssertEqual(Mirror(reflecting: fields).children.compactMap(\.label), ["type", "sourcePID", "targetPID", "windowID"],
                   "the pinned set is exactly the type and the three pids")
    let key = event(.keyDown)
    key.setIntegerValueField(.keyboardEventKeycode, value: 0x24)
    XCTAssertEqual(tapFields(key).type, .keyDown)
    XCTAssertEqual(key.getIntegerValueField(.keyboardEventKeycode), 0x24, "the fixture can set a key code; the fields struct carries none")
  }

  /// The five event types of the vendor's monitor (F §9.2), and no other.
  func testTheMaskIsTheVendorsFiveTypes() {
    let counted: [CGEventType] = [.leftMouseDown, .rightMouseDown, .otherMouseDown, .scrollWheel, .keyDown]
    let ignored: [CGEventType] = [.mouseMoved, .leftMouseDragged, .leftMouseUp, .rightMouseUp, .keyUp, .flagsChanged]
    for type in counted { XCTAssertNotEqual(interventionEventMask & (1 << type.rawValue), 0, "\(type)") }
    for type in ignored { XCTAssertEqual(interventionEventMask & (1 << type.rawValue), 0, "\(type)") }
  }

  func testAttribution() {
    let engine: pid_t = 100, driven: pid_t = 200
    let owners: [Int64: pid_t] = [77: driven, 88: 300]
    func attributed(_ fields: TapEventFields) -> pid_t? {
      attributedPid(fields, enginePID: engine, isDriven: { $0 == driven }, windowOwner: { owners[$0] })
    }
    XCTAssertNil(attributed(TapEventFields(type: .keyDown, sourcePID: engine, targetPID: driven, windowID: 77)),
                 "the engine's own events never count, whatever they reach")
    XCTAssertEqual(attributed(TapEventFields(type: .leftMouseDown, sourcePID: 5, targetPID: 0, windowID: 77)), driven,
                   "a click on the driven app's (background) window counts by the window's owner")
    XCTAssertEqual(attributed(TapEventFields(type: .keyDown, sourcePID: 5, targetPID: driven, windowID: 0)), driven,
                   "no window: the target pid decides")
    XCTAssertEqual(attributed(TapEventFields(type: .leftMouseDown, sourcePID: 5, targetPID: driven, windowID: 99)), driven,
                   "an unresolvable window id falls to the target pid (F §9.3)")
    XCTAssertNil(attributed(TapEventFields(type: .keyDown, sourcePID: 5, targetPID: driven, windowID: 88)),
                 "the user typing in their own window never counts, even when the driven app is the target")
    XCTAssertNil(attributed(TapEventFields(type: .keyDown, sourcePID: 5, targetPID: 400, windowID: 0)), "an undriven app")
    XCTAssertNil(attributed(TapEventFields(type: .keyDown, sourcePID: 5, targetPID: 0, windowID: 0)), "no process at all")
  }
}

// MARK: The debounce and the re-query flag

final class InterventionRuleTests: XCTestCase {
  func testTheDebounceIsFiveSecondsAfterTheLastEvent() {
    let last = AttributedEvent(sequence: 1, at: 10_000)
    XCTAssertTrue(isDebouncing(last, now: 10_000))
    XCTAssertTrue(isDebouncing(last, now: 14_999))
    XCTAssertFalse(isDebouncing(last, now: 15_000))
    XCTAssertFalse(isDebouncing(nil, now: 0))
  }

  func testTheVerdictTakesTheDebounceFirstThenTheFlag() {
    let last = AttributedEvent(sequence: 3, at: 10_000)
    XCTAssertEqual(interventionVerdict(last: nil, cleared: 0, now: 99_000), .proceed)
    XCTAssertEqual(interventionVerdict(last: last, cleared: 2, now: 12_000), .stillInteracting)
    XCTAssertEqual(interventionVerdict(last: last, cleared: 3, now: 12_000), .stillInteracting,
                   "the debounce refuses whatever this connection cleared: the user is at the app now")
    XCTAssertEqual(interventionVerdict(last: last, cleared: 2, now: 16_000), .userChanged, "the flag outlives the debounce")
    XCTAssertEqual(interventionVerdict(last: last, cleared: 3, now: 16_000), .proceed, "cleared at or after the event")
  }

  func testTheVendorsSentencesAndCode() {
    let still = stillInteracting("/Applications/TextEdit.app")
    XCTAssertEqual(still.code, -10016)
    XCTAssertEqual(still.errorName, "userIntervened")
    XCTAssertEqual(still.message, "The user is still interacting with '/Applications/TextEdit.app'. Wait 5 seconds and retry.")
    let changed = userChanged("/Applications/TextEdit.app")
    XCTAssertEqual(changed.code, -10016)
    XCTAssertEqual(changed.errorName, "userIntervened")
    XCTAssertEqual(changed.message,
                   "The user changed '/Applications/TextEdit.app'. Re-query the latest state with `get_app_state` before sending more actions.")
  }
}

final class InterventionLedgerTests: XCTestCase {
  func testOnlyADrivenProcessIsRecorded() {
    let ledger = InterventionLedger()
    ledger.record(200, at: 1)
    XCTAssertNil(ledger.lastEvent(200), "nothing is kept of an app no connection drives")
    XCTAssertEqual(ledger.drive(200, connection: 1), 0)
    ledger.record(200, at: 5)
    XCTAssertEqual(ledger.lastEvent(200), AttributedEvent(sequence: 1, at: 5))
    XCTAssertEqual(ledger.drive(300, connection: 1), 1, "a new drive starts clean at the sequence now")
  }

  /// A completed observation clears to the sequence now only once the debounce has expired.
  func testTheClearPointWaitsOutTheDebounce() {
    let ledger = InterventionLedger()
    ledger.drive(200, connection: 1)
    XCTAssertEqual(ledger.clearPoint(200, now: 0), 0, "no event: clear")
    ledger.record(200, at: 1_000)
    XCTAssertNil(ledger.clearPoint(200, now: 5_999), "a re-query while the user still works leaves the flag set")
    XCTAssertEqual(ledger.clearPoint(200, now: 6_000), 1)
  }

  /// The tap's lifetime follows the drives: a closed connection's processes are forgotten once no other drives them.
  func testReleasingTheLastDriverForgetsTheProcess() {
    let ledger = InterventionLedger()
    ledger.drive(200, connection: 1)
    ledger.drive(200, connection: 2)
    ledger.drive(300, connection: 2)
    ledger.record(200, at: 7)
    XCTAssertTrue(ledger.release(connection: 1), "connection 2 still drives both")
    XCTAssertNotNil(ledger.lastEvent(200))
    XCTAssertFalse(ledger.release(connection: 2), "nothing is driven any longer")
    XCTAssertNil(ledger.lastEvent(200))
    XCTAssertFalse(ledger.isDriven(200))
    XCTAssertFalse(ledger.isDriven(300))
  }

  /// Each connection has its own flag: a connection that observed after the event proceeds; another that did not is
  /// refused.
  func testTheFlagIsPerConnection() {
    let ledger = InterventionLedger()
    let first = ConnectionState(id: 1, fd: -1), second = ConnectionState(id: 2, fd: -1)
    XCTAssertEqual(first.markDriven("app#200", now: ledger.drive(200, connection: 1)), 0)
    XCTAssertEqual(second.markDriven("app#200", now: ledger.drive(200, connection: 2)), 0)
    ledger.record(200, at: 1_000)
    first.clearIntervention("app#200", point: ledger.clearPoint(200, now: 7_000))
    XCTAssertEqual(first.markDriven("app#200", now: ledger.drive(200, connection: 1)), 1, "a later drive keeps the cleared point")
    XCTAssertEqual(interventionVerdict(last: ledger.lastEvent(200), cleared: first.markDriven("app#200", now: 99), now: 7_000), .proceed)
    XCTAssertEqual(interventionVerdict(last: ledger.lastEvent(200), cleared: second.markDriven("app#200", now: 99), now: 7_000), .userChanged)
  }

  func testClearingTouchesOnlyAnAppTheConnectionDrives() {
    let connection = ConnectionState(id: 1, fd: -1)
    connection.clearIntervention("app#200", point: 5)
    XCTAssertNil(connection.interventionCleared["app#200"])
    connection.interventionCleared["app#200"] = 1
    connection.clearIntervention("app#200", point: nil)
    XCTAssertEqual(connection.interventionCleared["app#200"], 1, "a live debounce leaves the flag")
    connection.clearIntervention("app#200", point: 4)
    XCTAssertEqual(connection.interventionCleared["app#200"], 4)
  }
}

// MARK: The guard every input method calls

final class InterventionGuardTests: XCTestCase {
  private let app = "/Applications/TextEdit.app"

  func testThePreActionCheckRefusesWhileTheDebounceIsLive() {
    XCTAssertThrowsError(try InterventionGuard.check(app: app, cleared: 0, now: 2_000, latest: { AttributedEvent(sequence: 1, at: 1_000) })) { error in
      XCTAssertEqual((error as? EngineError)?.message, stillInteracting(app).message)
    }
  }

  func testThePreActionCheckRefusesUntilARequeryAfterAnIntervention() {
    XCTAssertThrowsError(try InterventionGuard.check(app: app, cleared: 0, now: 9_000, latest: { AttributedEvent(sequence: 1, at: 1_000) })) { error in
      XCTAssertEqual((error as? EngineError)?.message, userChanged(app).message)
    }
    XCTAssertNoThrow(try InterventionGuard.check(app: app, cleared: 1, now: 9_000, latest: { AttributedEvent(sequence: 1, at: 1_000) }))
  }

  /// The in-flight stop: an event attributed after the pre-action check stops the sequence with "user changed"; none
  /// lets it run.
  func testAnEventAfterTheCheckStopsTheSequence() throws {
    var current: AttributedEvent? = AttributedEvent(sequence: 4, at: 1_000)
    let guarding = try InterventionGuard.check(app: app, cleared: 4, now: 9_000, latest: { current })
    XCTAssertNoThrow(try guarding.checkInFlight())
    current = AttributedEvent(sequence: 5, at: 9_100)
    XCTAssertThrowsError(try guarding.checkInFlight()) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "userIntervened")
      XCTAssertEqual((error as? EngineError)?.message, userChanged(app).message)
    }
  }

  func testAFirstEventDuringTheSequenceStopsItToo() throws {
    var current: AttributedEvent?
    let guarding = try InterventionGuard.check(app: app, cleared: 0, now: 9_000, latest: { current })
    XCTAssertNoThrow(try guarding.checkInFlight())
    current = AttributedEvent(sequence: 1, at: 9_001)
    XCTAssertThrowsError(try guarding.checkInFlight())
  }

  func testWithDetectionOffEveryCheckPasses() {
    let off = InterventionGuard.off(app: app)
    XCTAssertFalse(off.detection)
    XCTAssertNoThrow(try off.checkInFlight())
    XCTAssertNil(off.idleMilliseconds(at: 5))
  }

  /// hidIdleMs: from the app's last attributed event to the request's receipt; nil when none was attributed.
  func testTheIdleTimeIsSinceTheLastAttributedEvent() throws {
    let guarding = try InterventionGuard.check(app: app, cleared: 2, now: 9_000, latest: { AttributedEvent(sequence: 2, at: 3_000) })
    XCTAssertEqual(guarding.idleMilliseconds(at: 8_500), 5_500)
    XCTAssertEqual(guarding.idleMilliseconds(at: 2_000), 0, "an event stamped after the receipt reads as no idle time")
    XCTAssertNil(try InterventionGuard.check(app: app, cleared: 0, now: 9_000, latest: { nil }).idleMilliseconds(at: 8_500))
  }
}

// MARK: The monitor without the grant

final class InterventionMonitorTests: XCTestCase {
  /// Without Input Monitoring nothing is created and detection is off; the preflight is the only read.
  func testWithoutTheGrantDetectionIsOff() {
    var reads = 0
    let monitor = InterventionMonitor(listenGranted: { reads += 1; return false })
    XCTAssertNil(monitor.drive(200, connection: 1))
    XCTAssertEqual(reads, 1)
    XCTAssertFalse(monitor.ledger.isDriven(200), "nothing is driven without detection")
    monitor.release(connection: 1)  // nothing running: a no-op
  }

  /// The callback's body: an event of a driven app is recorded, the engine's own and an undriven app's are not.
  func testTheCallbackBodyRecordsOnlyAttributedEvents() {
    let monitor = InterventionMonitor(listenGranted: { false })
    monitor.ledger.drive(200, connection: 1)
    monitor.note(TapEventFields(type: .keyDown, sourcePID: getpid(), targetPID: 200, windowID: 0), at: 1)
    XCTAssertNil(monitor.ledger.lastEvent(200))
    monitor.note(TapEventFields(type: .keyDown, sourcePID: 5, targetPID: 300, windowID: 0), at: 2)
    XCTAssertNil(monitor.ledger.lastEvent(300))
    monitor.note(TapEventFields(type: .keyDown, sourcePID: 5, targetPID: 200, windowID: 0), at: 3)
    XCTAssertEqual(monitor.ledger.lastEvent(200), AttributedEvent(sequence: 1, at: 3))
  }

  /// The engine's guard with detection off: the meta's intervention reads "off", nothing is driven or refused.
  func testTheEnginesGuardWithDetectionOff() throws {
    let engine = Engine(paths: ServerPaths(socket: "/tmp/x.sock", directory: "/tmp", lock: "/tmp/x.lock", usage: "/tmp/cua-engine-test-usage.json"),
                        intervention: InterventionMonitor(listenGranted: { false }))
    let connection = ConnectionState(id: 1, fd: -1)
    let app = ResolvedApp(appPath: "/Applications/TextEdit.app", bundleIdentifier: "com.apple.TextEdit", displayName: "TextEdit", running: nil)
    let guarding = engine.interventionGuard(app: app, pid: 200, requestApp: nil, connection: connection)
    XCTAssertFalse(guarding.detection)
    XCTAssertEqual(guarding.app, "/Applications/TextEdit.app", "a pid request is named by the bound path")
    XCTAssertTrue(connection.interventionCleared.isEmpty)
    XCTAssertFalse(engine.intervention.ledger.isDriven(200))
  }
}

// MARK: The engine's drives: an observation's clearing, and the processes that count as the app's

final class EngineInterventionTests: XCTestCase {
  private let appPid: pid_t = 200, panelService: pid_t = 300
  private let app = ResolvedApp(appPath: "/Applications/TextEdit.app", bundleIdentifier: "com.apple.TextEdit", displayName: "TextEdit", running: nil)
  private var monitor: InterventionMonitor!
  private var engine: Engine!
  private let connection = ConnectionState(id: 1, fd: -1)

  override func setUp() {
    // Detection on with no tap: events arrive through note, as the tap's callback would deliver them.
    monitor = InterventionMonitor(listenGranted: { true }, createsTap: false)
    engine = Engine(paths: ServerPaths(socket: "/tmp/x.sock", directory: "/tmp", lock: "/tmp/x.lock", usage: "/tmp/cua-engine-test-usage.json"),
                    intervention: monitor)
  }

  /// A user event long enough ago that its debounce has expired: only the re-query flag can refuse.
  private func userClick(on pid: pid_t) {
    monitor.note(TapEventFields(type: .leftMouseDown, sourcePID: 5, targetPID: pid, windowID: 0), at: unixMilliseconds() - 10_000)
  }

  private func verdict() -> InterventionVerdict {
    engine.interventionGuard(app: app, pid: appPid, requestApp: nil, connection: connection).verdict
  }

  /// An observation whose screenshot fails after the tree was read clears nothing: the model has not seen the state the
  /// flag asks it to re-query, so the next action is still refused. One that answers clears it.
  func testAFailedObservationKeepsTheRequeryLock() {
    engine.observationBegins(app, pid: appPid, connection: connection)
    userClick(on: appPid)
    XCTAssertEqual(verdict(), .userChanged)

    let failed = engine.observationRead(app, owners: [appPid], connection: connection)
    XCTAssertThrowsError(try engine.observationAnswered(failed, connection: connection) {
      throw EngineError(name: "screenCaptureFailed", "The capture failed.")
    })
    XCTAssertEqual(verdict(), .userChanged, "a failed capture keeps the lock")

    let answered = engine.observationRead(app, owners: [appPid], connection: connection)
    XCTAssertEqual(engine.observationAnswered(answered, connection: connection) { "skyshot" }, "skyshot")
    XCTAssertEqual(verdict(), .proceed)
  }

  /// The clearing is taken at the read: an event after the tree was read and before the observation answered is not
  /// cleared by it.
  func testAnEventAfterTheReadIsNotClearedByTheObservation() {
    engine.observationBegins(app, pid: appPid, connection: connection)
    let clearing = engine.observationRead(app, owners: [appPid], connection: connection)
    userClick(on: appPid)
    engine.observationAnswered(clearing, connection: connection) {}
    XCTAssertEqual(verdict(), .userChanged)
  }

  /// A panel served by another process (an Open panel): the observation met its service, whose window takes the user's
  /// clicks on the panel, so those clicks count as the user's on the app.
  func testAClickOnAPanelServedByAnotherProcessCounts() {
    engine.observationBegins(app, pid: appPid, connection: connection)
    engine.observationAnswered(engine.observationRead(app, owners: [appPid, panelService], connection: connection), connection: connection) {}
    XCTAssertEqual(verdict(), .proceed)
    userClick(on: panelService)
    XCTAssertEqual(verdict(), .userChanged, "the user's click on the panel is attributed to the app")
  }

  /// The process an action's events go to is driven for the app from then on, so the user's events on it stop the
  /// action in flight, even when no observation met it.
  func testAnActionsTargetProcessCountsInFlight() {
    engine.observationBegins(app, pid: appPid, connection: connection)
    let guarding = engine.interventionGuard(app: app, pid: appPid, requestApp: nil, connection: connection)
    XCTAssertNoThrow(try guarding.checkBeforePosting())
    engine.actionTargets(panelService, app: app, connection: connection)
    XCTAssertNoThrow(try guarding.checkInFlight())
    userClick(on: panelService)
    XCTAssertThrowsError(try guarding.checkInFlight()) { error in
      XCTAssertEqual((error as? EngineError)?.message, userChanged(app.appPath).message)
    }
  }

  /// With detection off nothing is driven for the app, observation or target alike.
  func testWithDetectionOffNothingIsDriven() {
    let off = Engine(paths: ServerPaths(socket: "/tmp/x.sock", directory: "/tmp", lock: "/tmp/x.lock", usage: "/tmp/cua-engine-test-usage.json"),
                     intervention: InterventionMonitor(listenGranted: { false }))
    off.observationBegins(app, pid: appPid, connection: connection)
    off.observationAnswered(off.observationRead(app, owners: [panelService], connection: connection), connection: connection) {}
    off.actionTargets(panelService, app: app, connection: connection)
    XCTAssertTrue(connection.interventionProcesses.isEmpty)
    XCTAssertFalse(off.intervention.ledger.isDriven(panelService))
  }
}

// MARK: Stopping a keyed sequence

final class KeyedSequenceStopTests: XCTestCase {
  private func meta() -> InputMeta {
    InputMeta(ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
  }

  private func units(_ count: Int) -> [TypedUnit] {
    (0..<count).map { _ in TypedUnit(press: KeyPress(keyCode: 0, modifiers: []), text: [0x61], consumed: 1) }
  }

  /// type_text stops at the first attributed event, between two characters (never between a key down and its key up),
  /// and reports how many UTF-16 units were entered.
  func testAnInterventionStopsTypingBetweenUnitsAndReportsWhatWasEntered() {
    var meta = meta()
    var posted = 0
    var checks = 0
    XCTAssertThrowsError(try keyText(units(5), concealed: false, checkSource: { _, _ in },
                                     checkIntervention: { checks += 1; if checks == 3 { throw userChanged("/Applications/TextEdit.app") } },
                                     post: { _ in posted += 1; return true }, pause: {}, meta: &meta)) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "userIntervened")
    }
    XCTAssertEqual(meta.entered, 2)
    XCTAssertEqual(posted, 8, "two whole presses of four events")
    XCTAssertNotNil(meta.startedAt)
    XCTAssertNotNil(meta.endedAt, "the interval ends at the stop")
  }

  func testACompletedTypeTextReportsEveryUnitEntered() throws {
    var meta = meta()
    let mixed = units(2) + [TypedUnit(press: nil, text: [0xD83D, 0xDE00], consumed: 2)]
    try keyText(mixed, concealed: false, checkSource: { _, _ in }, checkIntervention: {}, post: { _ in true }, pause: {}, meta: &meta)
    XCTAssertEqual(meta.entered, 4, "UTF-16 units, an emoji counting two")
  }

  /// A secret's length is never reported: a concealed request carries no count, stopped or completed.
  func testAConcealedRequestNeverReportsACount() {
    var completed = meta()
    XCTAssertNoThrow(try keyText(units(3), concealed: true, checkSource: { _, _ in }, checkIntervention: {}, post: { _ in true }, pause: {}, meta: &completed))
    XCTAssertNil(completed.entered)
    var stopped = meta()
    XCTAssertThrowsError(try keyText(units(3), concealed: true, checkSource: { _, _ in }, checkIntervention: { throw userChanged("x") },
                                     post: { _ in true }, pause: {}, meta: &stopped))
    XCTAssertNil(stopped.entered)
  }

  func testASourceChangeStopsWithTheCountToo() {
    var meta = meta()
    XCTAssertThrowsError(try keyText(units(4), concealed: false,
                                     checkSource: { entered, _ in if entered == 2 { throw EngineError(name: "inputSourceChanged", "changed") } },
                                     checkIntervention: {}, post: { _ in true }, pause: {}, meta: &meta)) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "inputSourceChanged")
    }
    XCTAssertEqual(meta.entered, 2)
  }

  /// press_key: the check runs between presses of a sequence, so `cmd+a Delete` stops before Delete.
  func testAKeySequenceStopsBetweenPresses() {
    var meta = meta()
    var posted: [KeyEvent.Kind] = []
    var checks = 0
    let presses = [KeyPress(keyCode: 0, modifiers: [.command]), KeyPress(keyCode: 0x33, modifiers: [])]
    XCTAssertThrowsError(try keyPresses(presses, checkIntervention: { checks += 1; if checks == 2 { throw userChanged("x") } },
                                        post: { posted.append($0.kind); return true }, meta: &meta))
    XCTAssertEqual(posted, [.flags, .down, .up, .restore], "the first press whole, the second never begun")
    XCTAssertNotNil(meta.startedAt)
    XCTAssertNotNil(meta.endedAt)
  }

  /// Nothing posted, no interval: a stop before the first unit, empty text and a first event that cannot be created all
  /// leave startedAt and endedAt null, which is what tells the wrapper nothing was entered (InputMeta.posting).
  func testNothingPostedLeavesTheIntervalNull() {
    var refused = meta()
    var posted = 0
    XCTAssertThrowsError(try keyText(units(3), concealed: false, checkSource: { _, _ in }, checkIntervention: { throw userChanged("x") },
                                     post: { _ in posted += 1; return true }, pause: {}, meta: &refused))
    XCTAssertEqual(posted, 0)
    XCTAssertNil(refused.startedAt)
    XCTAssertNil(refused.endedAt)
    XCTAssertEqual(refused.entered, 0)

    var empty = meta()
    XCTAssertNoThrow(try keyText([], concealed: false, checkSource: { _, _ in }, checkIntervention: {}, post: { _ in true }, pause: {}, meta: &empty))
    XCTAssertNil(empty.startedAt)
    XCTAssertNil(empty.endedAt)

    var uncreated = meta()
    XCTAssertThrowsError(try keyText(units(2), concealed: false, checkSource: { _, _ in }, checkIntervention: {}, post: { _ in false }, pause: {}, meta: &uncreated)) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "eventCreationFailed")
    }
    XCTAssertNil(uncreated.startedAt)
    XCTAssertNil(uncreated.endedAt)

    var pressRefused = meta()
    XCTAssertThrowsError(try keyPresses([KeyPress(keyCode: 0, modifiers: [])], checkIntervention: { throw userChanged("x") },
                                        post: { _ in true }, meta: &pressRefused))
    XCTAssertNil(pressRefused.startedAt)
    XCTAssertNil(pressRefused.endedAt)
  }

  /// The rule itself: started as the first successful post begins, ended after the last one that succeeded.
  func testTheIntervalSpansTheSuccessfulPosts() {
    var meta = meta()
    XCTAssertFalse(meta.posting { false })
    XCTAssertNil(meta.startedAt)
    XCTAssertTrue(meta.posting { true })
    let started = meta.startedAt
    XCTAssertNotNil(started)
    XCTAssertTrue(meta.posting { usleep(2_000); return true })
    XCTAssertEqual(meta.startedAt, started, "the start is the first post's")
    XCTAssertGreaterThan(meta.endedAt!, started!)
    let ended = meta.endedAt
    XCTAssertFalse(meta.posting { false })
    XCTAssertEqual(meta.endedAt, ended, "a failed post does not move the end")
  }
}
