import XCTest
@testable import Engine

// M2a.4's observation rules (the spec's Design, "Observation (skyshot)", "Settle" and "Result meta"; the Decision Log's
// "M2a pre-flight" item 2, "M2a vendor reading" items 1 and 2, the critique's A3): when an observation settles, what a
// minimized primary window gets, and the enablement that is written once per owned process (#244) and released when the
// last connection that observed the process closes.

final class ObservationSettleTests: XCTestCase {
  func testAFirstObservationOfARunningAppWithItsWindowCapturesAtOnceWebShapedOrNot() {
    XCTAssertEqual(observationSettles(opened: false, armed: false, forced: nil), [], "the vendor's flag starts false (0x1000181f8)")
  }

  func testTheEnginesOwnLaunchOrReopenSettlesOnceBeforeTheObservation() {
    XCTAssertEqual(observationSettles(opened: true, armed: false, forced: nil), [.afterOpen], "the open helper's settle, 0x100164c08")
  }

  func testAnActionSinceTheLastObservationSettlesAsBefore() {
    XCTAssertEqual(observationSettles(opened: false, armed: true, forced: nil), [.afterAction])
    XCTAssertEqual(observationSettles(opened: true, armed: true, forced: nil), [.afterOpen, .afterAction], "both, in the vendor's order: the preparation's, then the deferred one")
  }

  func testTheSpikeSwitchForcesOrSkipsOnlyTheActionsSettle() {
    XCTAssertEqual(observationSettles(opened: false, armed: false, forced: true), [.afterAction])
    XCTAssertEqual(observationSettles(opened: false, armed: true, forced: false), [])
    XCTAssertEqual(observationSettles(opened: true, armed: true, forced: false), [.afterOpen], "the open's settle is not the switch's")
  }

  func testTheOpenSettleSamplesEvery50MsWhateverTheAppsShapeAndTheActionsByShape() {
    XCTAssertEqual(settleSampleMs(.afterOpen, webShaped: false), 50)
    XCTAssertEqual(settleSampleMs(.afterOpen, webShaped: true), 50, "a delay given is used as given (F §8.10)")
    XCTAssertEqual(settleSampleMs(.afterAction, webShaped: false), 100)
    XCTAssertEqual(settleSampleMs(.afterAction, webShaped: true), 250)
  }

  func testTheOpenSettleOfAQuietAppReturnsAtTheQuietPeriodOnItsFirstSamplePastIt() {
    var clock = 0.0
    let report = runSettle(sampleMs: settleSampleMs(.afterOpen, webShaped: false), now: { clock }, sleep: { clock += $0 },
                           drain: { [] }, ready: { true })
    XCTAssertEqual(report.ms, 250, "50 ms ticks reach the 250 ms quiet period exactly")
    XCTAssertFalse(report.capped)
  }

  func testOnlyTheActionsSettleTreeIsReused() {
    XCTAssertTrue(ObservationSettle.afterAction.reusesTree)
    XCTAssertFalse(ObservationSettle.afterOpen.reusesTree, "the vendor destroys the open settle's tree (0x100164c0c)")
  }
}

final class MinimizedWindowTests: XCTestCase {
  func testAWindowOnScreenIsObservedAsEver() throws {
    let plan = try minimizedObservation(minimized: false, exposesTree: true, includeScreenshot: true, app: "TextEdit")
    XCTAssertTrue(plan.capture)
    XCTAssertNil(plan.screenshotOmitted)
  }

  func testAMinimizedWindowWhoseTreeIsExposedIsObservedInPlaceWithNoScreenshotAndTheReason() throws {
    let plan = try minimizedObservation(minimized: true, exposesTree: true, includeScreenshot: true, app: "TextEdit")
    XCTAssertFalse(plan.capture, "a minimized window is not composited: no capture shows its state")
    XCTAssertEqual(plan.screenshotOmitted, "windowMinimized")
  }

  func testNoScreenshotAskedNoReasonGiven() throws {
    let plan = try minimizedObservation(minimized: true, exposesTree: true, includeScreenshot: false, app: "TextEdit")
    XCTAssertFalse(plan.capture)
    XCTAssertNil(plan.screenshotOmitted)
  }

  func testAMinimizedWindowThatExposesNoTreeIsRefusedWithASentenceNamingTheCause() {
    XCTAssertThrowsError(try minimizedObservation(minimized: true, exposesTree: false, includeScreenshot: true, app: "TextEdit")) { error in
      let error = error as? EngineError
      XCTAssertEqual(error?.errorName, "windowMinimized")
      XCTAssertEqual(error?.code, -10005)
      XCTAssertEqual(error?.message, "The TextEdit window is minimized and shows no content to read. Ask the user to restore the window, then get the app's state again.")
    }
  }

  func testAnEmptyWindowOnScreenIsNotTheMinimizedRulesCase() throws {
    XCTAssertTrue(try minimizedObservation(minimized: false, exposesTree: false, includeScreenshot: true, app: "TextEdit").capture)
  }

  func testAPointInputIntoAMinimizedWindowIsRefusedWithWhatStillActs() {
    XCTAssertNoThrow(try refuseMinimizedWindow(minimized: false, app: "TextEdit"))
    XCTAssertThrowsError(try refuseMinimizedWindow(minimized: true, app: "TextEdit")) { error in
      let error = error as? EngineError
      XCTAssertEqual(error?.errorName, "windowMinimized")
      XCTAssertEqual(error?.message, "The TextEdit window is minimized, so nothing can be clicked, dragged or scrolled at a point in it. Ask the user to restore the window, or use setValue, selectText or performSecondaryAction, which act without it.")
    }
  }
}

/// A fake application's enablement attributes, recording every write, and its role reads, reads and writes in order.
private final class FakeApplication: @unchecked Sendable {
  var names: [String]?
  var values: [String: Bool] = [:]
  var unreadable: Set<String> = []
  var current = true
  var writes: [(String, Bool)] = []
  var namesRead = 0
  var failWrites = false
  /// The application element's calls in order: "role", "read <attribute>", "write <attribute>=<value>".
  var calls: [String] = []
  /// Runs inside every write before it takes effect (a barrier a test holds a release's reset at).
  var duringWrite: (String, Bool) -> Void = { _, _ in }

  init(names: [String]?) { self.names = names }

  var access: EnablementAccess {
    EnablementAccess(
      listed: { self.namesRead += 1; return self.names },
      readRole: { self.calls.append("role") },
      read: {
        self.calls.append("read \($0)")
        return self.unreadable.contains($0) ? nil : self.values[$0] ?? false  // an attribute nobody set reads false
      },
      write: { name, value in
        self.duringWrite(name, value)
        self.calls.append("write \(name)=\(value)")
        self.writes.append((name, value))
        guard !self.failWrites else { return false }
        self.values[name] = value
        return true
      },
      current: { self.current })
  }

  var written: [String] { writes.map { "\($0.0)=\($0.1)" } }
  var reads: Int { calls.filter { $0.hasPrefix("read ") }.count }
}

final class EnablementReleaseTests: XCTestCase {
  private let launched = Date(timeIntervalSince1970: 1_000)

  func testItIsSetWhenItReadsFalseAndThenNeitherReadNorWrittenWhileOwned() {
    // #244: Electron's getter reads false until its complete mode lands (and after), and every write restarts that
    // mode's 2 s countdown and fires the app's accessibility-support-changed, so an owned attribute is written once.
    let web = WebAccessibility()
    let app = FakeApplication(names: ["AXManualAccessibility", "AXEnhancedUserInterface"])
    app.values["AXManualAccessibility"] = false
    XCTAssertEqual(web.enable(pid: 7, launched: launched, connection: 1, access: app.access), "AXManualAccessibility", "never both")
    app.values["AXManualAccessibility"] = false  // Electron's computed getter, or a process that reset it (the A3 trade)
    for _ in 0..<5 { XCTAssertNil(web.enable(pid: 7, launched: launched, connection: 1, access: app.access), "owned: nothing read or written") }
    XCTAssertEqual(app.written, ["AXManualAccessibility=true"], "six observations, one write")
    XCTAssertEqual(app.reads, 1, "read once, before the write")
  }

  func testAnOwnedProcessIsReleasedWithOneWriteOfFalse() {
    let web = WebAccessibility()
    let app = FakeApplication(names: ["AXManualAccessibility"])
    for connection in 1...3 { _ = web.enable(pid: 7, launched: launched, connection: connection, access: app.access) }
    for connection in 1...3 { web.release(connection: connection) }
    web.releaseAll()
    XCTAssertEqual(app.written, ["AXManualAccessibility=true", "AXManualAccessibility=false"])
  }

  func testAReleasedProcessIsEnabledAndOwnedAgainAtTheNextObservation() {
    let web = WebAccessibility()
    let app = FakeApplication(names: ["AXManualAccessibility"])
    _ = web.enable(pid: 7, launched: launched, connection: 1, access: app.access)
    _ = web.enable(pid: 7, launched: launched, connection: 1, access: app.access)
    web.release(connection: 1)
    XCTAssertEqual(web.enable(pid: 7, launched: launched, connection: 2, access: app.access), "AXManualAccessibility", "written again")
    for _ in 0..<3 { XCTAssertNil(web.enable(pid: 7, launched: launched, connection: 2, access: app.access), "owned again: once") }
    web.release(connection: 2)
    XCTAssertEqual(app.written, ["AXManualAccessibility=true", "AXManualAccessibility=false", "AXManualAccessibility=true", "AXManualAccessibility=false"],
                   "owned, so released again")
  }

  func testAnAttributeThatReadsTrueIsNeverOwnedAndIsReReadAtEveryObservation() {
    let web = WebAccessibility()
    let app = FakeApplication(names: ["AXManualAccessibility"])
    app.values["AXManualAccessibility"] = true  // VoiceOver's, or another assistive client's
    for _ in 0..<3 { XCTAssertNil(web.enable(pid: 7, launched: launched, connection: 1, access: app.access)) }
    XCTAssertEqual(app.reads, 3, "not owned: re-read every time")
    web.release(connection: 1)
    XCTAssertTrue(app.writes.isEmpty)
    app.values["AXManualAccessibility"] = false  // the other client let it go
    XCTAssertEqual(web.enable(pid: 7, launched: launched, connection: 2, access: app.access), "AXManualAccessibility", "the re-read sees it")
    XCTAssertNil(web.enable(pid: 7, launched: launched, connection: 2, access: app.access))
    XCTAssertEqual(app.reads, 4, "owned from that write")
  }

  func testAnUnreadableAttributeIsReadAndWrittenAtEveryObservationSinceItIsNeverOwned() {
    // Unchanged by #244: an unreadable value may be another client's, so the engine never owns it, and only an owned
    // attribute is remembered; each observation reads it and, by the vendor's rule, sets it.
    let web = WebAccessibility()
    let app = FakeApplication(names: ["AXManualAccessibility"])
    app.unreadable = ["AXManualAccessibility"]
    for _ in 0..<3 { XCTAssertEqual(web.enable(pid: 7, launched: launched, connection: 1, access: app.access), "AXManualAccessibility") }
    XCTAssertEqual(app.reads, 3)
    XCTAssertEqual(app.written, Array(repeating: "AXManualAccessibility=true", count: 3))
  }

  func testTheApplicationsRoleIsReadAtEveryObservationBeforeTheEnablement() {
    // #244's B: reading the application element's role gives Chromium and Electron their Basic mode, and with it the
    // web tree, at once (the vendor's eager ApplicationUIElement.init, F §1.3). Never cached.
    let web = WebAccessibility()
    let app = FakeApplication(names: ["AXManualAccessibility"])
    var timings = Timings()
    for _ in 0..<3 {
      _ = web.observeEnablement(eligible: true, pid: 7, launched: launched, connection: 1, access: app.access, timings: &timings)
    }
    XCTAssertEqual(app.calls, ["role", "read AXManualAccessibility", "write AXManualAccessibility=true", "role", "role"])
    XCTAssertNotNil(timings.wire["appRoleReadMs"], "timed apart from the enablement")
    XCTAssertNotNil(timings.wire["enableMs"])
    let neither = FakeApplication(names: ["AXTitle"])
    let step = web.observeEnablement(eligible: true, pid: 8, launched: launched, connection: 1, access: neither.access, timings: &timings)
    XCTAssertEqual(neither.calls, ["role"], "eligible, so the role is read even where no attribute is listed")
    XCTAssertNil(step?.prior)
  }

  func testAnIneligibleAppGetsNoRoleReadAndNoEnablement() {
    let web = WebAccessibility()
    let app = FakeApplication(names: ["AXManualAccessibility"])
    var timings = Timings()
    XCTAssertNil(web.observeEnablement(eligible: false, pid: 7, launched: launched, connection: 1, access: app.access, timings: &timings))
    XCTAssertTrue(app.calls.isEmpty)
    XCTAssertEqual(app.namesRead, 0)
    XCTAssertNil(timings.wire["appRoleReadMs"])
    XCTAssertTrue(web.observers(pid: 7, launched: launched).isEmpty, "not recorded as observing it")
  }

  /// One observation by `connection` as getAppState composes it, around a settle whose tree `settled` stands for: the
  /// process's enablement count before the settles, `between` (what other connections do meanwhile), the enablement
  /// step, the wait decision on a Chromium window, and whether the settled tree (no web area in it) is adopted.
  private func adoptsSettled(_ web: WebAccessibility, _ app: FakeApplication, connection: Int, between: () -> Void = {}) -> Bool {
    let before = web.enablements(pid: 7, launched: launched)
    between()
    var timings = Timings()
    let step = web.observeEnablement(eligible: true, pid: 7, launched: launched, connection: connection, access: app.access, timings: &timings)
    let waited = webAreaWaitNeeded(switchOn: true, enabledNow: step?.set != nil, chromium: true, seen: web.hasSeenWebArea(pid: 7, launched: launched))
    return adoptsSettledTree(sameWindow: true, enablementsBefore: before, enablementsAfter: web.enablements(pid: 7, launched: launched),
                             waited: waited, loadedWebArea: false)
  }

  func testASettledTreeReadBeforeAnotherConnectionEnabledTheProcessIsNotAdopted() {
    // The review of 59862867: connection A settles; connection B then enables the process (owning it) and sees its web
    // area; A's enablement step finds it owned and writes nothing, and B's web area skips A's wait, so only the
    // process's enablement count shows that A's settled tree was read before the page's tree existed.
    let web = WebAccessibility()
    let app = FakeApplication(names: ["AXManualAccessibility"])
    let adopted = adoptsSettled(web, app, connection: 1) {
      var timings = Timings()
      XCTAssertEqual(web.observeEnablement(eligible: true, pid: 7, launched: self.launched, connection: 2, access: app.access, timings: &timings)?.set,
                     "AXManualAccessibility")
      web.noteWebArea(pid: 7, launched: self.launched)
    }
    XCTAssertFalse(adopted, "read before an enablement of the process")
    XCTAssertEqual(app.written, ["AXManualAccessibility=true"], "still written once")
    XCTAssertTrue(adoptsSettled(web, app, connection: 1), "nothing enabled since this settle: adopted")
  }

  func testTheEnablementCountMovesWithEveryWriteTheEngineMakes() {
    let web = WebAccessibility()
    let app = FakeApplication(names: ["AXManualAccessibility"])
    XCTAssertEqual(web.enablements(pid: 7, launched: launched), 0)
    XCTAssertFalse(adoptsSettled(web, app, connection: 1), "this observation's own enablement")
    let enabled = web.enablements(pid: 7, launched: launched)
    _ = web.enable(pid: 7, launched: launched, connection: 1, access: app.access)
    XCTAssertEqual(web.enablements(pid: 7, launched: launched), enabled, "owned: nothing written")
    web.release(connection: 1)
    XCTAssertGreaterThan(web.enablements(pid: 7, launched: launched), enabled, "the write-back too, though the entry is retired")
    XCTAssertEqual(web.enablements(pid: 7, launched: Date(timeIntervalSince1970: 2_000)), 0, "per process generation")
  }

  func testEnhancedUserInterfaceOnlyWhenManualIsNotListed() {
    let web = WebAccessibility()
    let app = FakeApplication(names: ["AXEnhancedUserInterface"])
    XCTAssertEqual(web.enable(pid: 7, launched: launched, connection: 1, access: app.access), "AXEnhancedUserInterface")
    XCTAssertNil(web.enable(pid: 8, launched: launched, connection: 1, access: FakeApplication(names: ["AXTitle"]).access))
  }

  func testItIsReleasedWhenTheLastConnectionThatObservedTheProcessCloses() {
    let web = WebAccessibility()
    let app = FakeApplication(names: ["AXManualAccessibility"])
    XCTAssertEqual(web.enable(pid: 7, launched: launched, connection: 1, access: app.access), "AXManualAccessibility")
    XCTAssertNil(web.enable(pid: 7, launched: launched, connection: 2, access: app.access), "the second connection finds it set")
    web.release(connection: 3)
    web.release(connection: 1)
    XCTAssertEqual(app.written, ["AXManualAccessibility=true"], "connection 2 still observes it")
    web.release(connection: 2)
    XCTAssertEqual(app.written, ["AXManualAccessibility=true", "AXManualAccessibility=false"])
    web.release(connection: 2)
    XCTAssertEqual(app.writes.count, 2, "released once")
  }

  func testAnAttributeThatReadTrueBeforeTheEngineTouchedItIsNeverWritten() {
    let web = WebAccessibility()
    let app = FakeApplication(names: ["AXEnhancedUserInterface"])
    app.values["AXEnhancedUserInterface"] = true  // VoiceOver's, or another assistive client's
    XCTAssertNil(web.enable(pid: 7, launched: launched, connection: 1, access: app.access))
    web.release(connection: 1)
    XCTAssertTrue(app.writes.isEmpty)
  }

  func testAnUnreadableAttributeIsSetButNeverOwnedSoACloseLeavesItEnabled() {
    let web = WebAccessibility()
    let app = FakeApplication(names: ["AXManualAccessibility"])
    app.unreadable = ["AXManualAccessibility"]  // another client may have enabled it: the engine cannot tell
    XCTAssertEqual(web.enable(pid: 7, launched: launched, connection: 1, access: app.access), "AXManualAccessibility", "the vendor's rule: set unless it reads true")
    web.release(connection: 1)
    XCTAssertEqual(app.written, ["AXManualAccessibility=true"], "owned only when it read false (A3): never released")
    XCTAssertEqual(app.values["AXManualAccessibility"], true)
    web.releaseAll()
    XCTAssertEqual(app.writes.count, 1)
  }

  func testAnUnreadableReadDoesNotDropOwnershipTheEngineAlreadyHas() {
    let web = WebAccessibility()
    let app = FakeApplication(names: ["AXManualAccessibility"])
    app.values["AXManualAccessibility"] = false
    _ = web.enable(pid: 7, launched: launched, connection: 1, access: app.access)
    app.unreadable = ["AXManualAccessibility"]
    _ = web.enable(pid: 7, launched: launched, connection: 1, access: app.access)
    XCTAssertEqual(app.reads, 1, "owned: the later observation does not read it")
    web.release(connection: 1)
    XCTAssertEqual(app.written.last, "AXManualAccessibility=false")
  }

  func testAFailedResetKeepsOwnershipSoALaterCloseOrShutdownRetries() {
    var failures: [String] = []
    let web = WebAccessibility(releaseFailed: { failures.append($0) })
    let app = FakeApplication(names: ["AXManualAccessibility"])
    _ = web.enable(pid: 7, launched: launched, connection: 1, access: app.access)
    app.failWrites = true
    web.release(connection: 1)
    XCTAssertEqual(app.values["AXManualAccessibility"], true, "the reset did not take")
    XCTAssertEqual(failures, ["enablement release failed: AXManualAccessibility on pid 7; kept for a later close or shutdown"])
    web.releaseAll()
    XCTAssertEqual(failures.count, 2, "shutdown retried it")
    app.failWrites = false
    XCTAssertNil(web.enable(pid: 7, launched: launched, connection: 2, access: app.access), "still owned: nothing read or set")
    web.release(connection: 2)
    XCTAssertEqual(app.values["AXManualAccessibility"], false, "the next close released what the engine still owns")
    XCTAssertEqual(failures.count, 2)
  }

  func testAProcessNoLongerTheOneObservedIsNotWritten() {
    let web = WebAccessibility()
    let app = FakeApplication(names: ["AXManualAccessibility"])
    _ = web.enable(pid: 7, launched: launched, connection: 1, access: app.access)
    app.current = false  // it quit, and its pid may be another process's now
    web.release(connection: 1)
    XCTAssertEqual(app.written, ["AXManualAccessibility=true"])
  }

  func testAProcessWhoseNamesCannotBeReadYetIsAskedAgainNextTime() {
    let web = WebAccessibility()
    let app = FakeApplication(names: nil)
    XCTAssertNil(web.enable(pid: 7, launched: launched, connection: 1, access: app.access))
    app.names = ["AXManualAccessibility"]
    XCTAssertEqual(web.enable(pid: 7, launched: launched, connection: 1, access: app.access), "AXManualAccessibility")
    _ = web.enable(pid: 7, launched: launched, connection: 1, access: app.access)
    XCTAssertEqual(app.namesRead, 2, "the listed attribute is read once per process once it answers")
  }

  func testAReleaseForgetsTheWebAreaSoTheNextEnablingWaitsAgain() {
    let web = WebAccessibility()
    let app = FakeApplication(names: ["AXManualAccessibility"])
    _ = web.enable(pid: 7, launched: launched, connection: 1, access: app.access)
    web.noteWebArea(pid: 7, launched: launched)
    web.release(connection: 1)
    XCTAssertFalse(web.hasSeenWebArea(pid: 7, launched: launched), "the page's tree may be gone with the attribute")
    XCTAssertEqual(web.enable(pid: 7, launched: launched, connection: 4, access: app.access), "AXManualAccessibility", "enabled and owned again")
    web.release(connection: 4)
    XCTAssertEqual(app.written, ["AXManualAccessibility=true", "AXManualAccessibility=false", "AXManualAccessibility=true", "AXManualAccessibility=false"])
  }

  func testAProcessTheEngineDidNotEnableKeepsItsWebAreaAcrossAClose() {
    let web = WebAccessibility()
    let app = FakeApplication(names: ["AXManualAccessibility"])
    app.values["AXManualAccessibility"] = true
    _ = web.enable(pid: 7, launched: launched, connection: 1, access: app.access)
    web.noteWebArea(pid: 7, launched: launched)
    web.release(connection: 1)
    XCTAssertTrue(web.hasSeenWebArea(pid: 7, launched: launched))
  }

  func testARelaunchReusingThePidIsAnotherProcess() {
    let web = WebAccessibility()
    let first = FakeApplication(names: ["AXManualAccessibility"])
    let second = FakeApplication(names: ["AXManualAccessibility"])
    _ = web.enable(pid: 7, launched: launched, connection: 1, access: first.access)
    _ = web.enable(pid: 7, launched: Date(timeIntervalSince1970: 2_000), connection: 2, access: second.access)
    web.release(connection: 2)
    XCTAssertEqual(second.written, ["AXManualAccessibility=true", "AXManualAccessibility=false"])
    XCTAssertEqual(first.written, ["AXManualAccessibility=true"], "connection 1 still observes the first")
  }

  /// One observation's wait decision, composed as getAppState composes it on a Chromium window.
  private func waits(_ web: WebAccessibility, enabledNow: Bool, pid: pid_t = 7, launched: Date) -> Bool {
    webAreaWaitNeeded(switchOn: true, enabledNow: enabledNow, chromium: true, seen: web.hasSeenWebArea(pid: pid, launched: launched))
  }

  func testAProcessTheEngineWroteBackIsSetAgainByTheNextConnectionThoughItReadsTrue() {
    // M2a.5's Surprise: after the write-back, Chromium's attribute reads true (AppKit's readback, not Chromium's mode),
    // while the page's tree went with the mode. The next observation must enable again, owned, so the wait runs.
    let web = WebAccessibility()
    let app = FakeApplication(names: ["AXManualAccessibility"])
    XCTAssertEqual(web.enable(pid: 7, launched: launched, connection: 1, access: app.access), "AXManualAccessibility")
    web.noteWebArea(pid: 7, launched: launched)
    web.release(connection: 1)
    app.values["AXManualAccessibility"] = true  // the readback after the write-back
    let next = web.enableReporting(pid: 7, launched: launched, connection: 2, access: app.access)
    XCTAssertEqual(next.set, "AXManualAccessibility", "re-enabled whatever it reads")
    XCTAssertEqual(next.prior, .readTrue)
    XCTAssertTrue(waits(web, enabledNow: next.set != nil, launched: launched), "the wait runs for the page to come back")
    XCTAssertNil(web.enable(pid: 7, launched: launched, connection: 2, access: app.access), "owned again: the memory is spent")
    web.release(connection: 2)
    XCTAssertEqual(app.written, ["AXManualAccessibility=true", "AXManualAccessibility=false", "AXManualAccessibility=true", "AXManualAccessibility=false"],
                   "owned again, so released again")
  }

  /// #237's condition 2: end_task now closes the session's connection, so every task boundary is a release. The task
  /// after it (a new connection, the same session) writes the enablement once, at its first observation, which waits
  /// for the page; its warm observations write nothing, as the first task's did not.
  func testATaskAfterEndTaskReEnablesOnceAndItsWarmObservationsWriteNothing() {
    let web = WebAccessibility()
    let app = FakeApplication(names: ["AXManualAccessibility"])
    XCTAssertEqual(web.enable(pid: 7, launched: launched, connection: 1, access: app.access), "AXManualAccessibility", "the first task's first observation")
    web.noteWebArea(pid: 7, launched: launched)
    for _ in 0..<3 { XCTAssertNil(web.enable(pid: 7, launched: launched, connection: 1, access: app.access), "a warm observation") }
    web.release(connection: 1)  // end_task: the connection closes
    app.values["AXManualAccessibility"] = true  // Chromium's readback after the write-back
    let first = web.enableReporting(pid: 7, launched: launched, connection: 2, access: app.access)
    XCTAssertEqual(first.set, "AXManualAccessibility", "the next task's first observation enables again")
    XCTAssertTrue(waits(web, enabledNow: first.set != nil, launched: launched), "and waits for the page, so it is complete")
    web.noteWebArea(pid: 7, launched: launched)
    for _ in 0..<3 {
      let warm = web.enable(pid: 7, launched: launched, connection: 2, access: app.access)
      XCTAssertNil(warm, "a warm observation of the next task writes nothing")
      XCTAssertFalse(waits(web, enabledNow: warm != nil, launched: launched), "nor waits")
    }
    XCTAssertEqual(app.written, ["AXManualAccessibility=true", "AXManualAccessibility=false", "AXManualAccessibility=true"],
                   "one write per task, one release between them")
  }

  func testATrueTheEngineNeverOwnedIsNeverWrittenAcrossConnections() {
    let web = WebAccessibility()
    let voiceOver = FakeApplication(names: ["AXManualAccessibility"])
    voiceOver.values["AXManualAccessibility"] = true
    XCTAssertNil(web.enable(pid: 7, launched: launched, connection: 1, access: voiceOver.access))
    web.release(connection: 1)
    XCTAssertNil(web.enable(pid: 7, launched: launched, connection: 2, access: voiceOver.access))
    web.release(connection: 2)
    let unreadable = FakeApplication(names: ["AXManualAccessibility"])
    unreadable.unreadable = ["AXManualAccessibility"]
    _ = web.enable(pid: 8, launched: launched, connection: 3, access: unreadable.access)  // set, not owned
    web.release(connection: 3)
    unreadable.unreadable = []
    unreadable.values["AXManualAccessibility"] = true
    XCTAssertNil(web.enable(pid: 8, launched: launched, connection: 4, access: unreadable.access), "never written back, so not re-set")
    XCTAssertTrue(voiceOver.writes.isEmpty)
    XCTAssertEqual(unreadable.written, ["AXManualAccessibility=true"])
  }

  func testARelaunchReusingThePidIsNotTakenForTheProcessTheEngineWroteBack() {
    let web = WebAccessibility()
    let first = FakeApplication(names: ["AXManualAccessibility"])
    _ = web.enable(pid: 7, launched: launched, connection: 1, access: first.access)
    web.release(connection: 1)
    let second = FakeApplication(names: ["AXManualAccessibility"])
    second.values["AXManualAccessibility"] = true  // another client's, in the new launch
    XCTAssertNil(web.enable(pid: 7, launched: Date(timeIntervalSince1970: 2_000), connection: 2, access: second.access))
    XCTAssertTrue(second.writes.isEmpty)
  }

  func testAWriteBackIsNotRememberedForAProcessWithNoKnownGeneration() {
    // The review of 447bb209: with no launch date and no start time, the key is the pid alone, so a remembered
    // write-back would outlive the process and match a replacement reusing the pid (a dev `electron .`), which would be
    // written true, owned and released: an attribute cua never owned.
    let web = WebAccessibility()
    let first = FakeApplication(names: ["AXManualAccessibility"])
    XCTAssertEqual(web.enable(pid: 7, launched: nil, connection: 1, access: first.access), "AXManualAccessibility")
    web.release(connection: 1)
    XCTAssertEqual(first.written, ["AXManualAccessibility=true", "AXManualAccessibility=false"], "the release is unchanged")
    let replacement = FakeApplication(names: ["AXManualAccessibility"])
    replacement.values["AXManualAccessibility"] = true
    XCTAssertNil(web.enable(pid: 7, launched: nil, connection: 2, access: replacement.access))
    web.release(connection: 2)
    XCTAssertTrue(replacement.writes.isEmpty)
  }

  func testAProcessWithNoLaunchDateIsIdentifiedByItsStartTimeAndReSetAfterAWriteBack() {
    let pid = getpid()
    let start = processStartTime(pid: pid)
    XCTAssertNotNil(start, "the kernel's start time of a live process")
    XCTAssertLessThan(start!.timeIntervalSinceNow, 0)
    XCTAssertEqual(processGeneration(launchDate: nil, pid: pid), start, "no launch date: the start time")
    XCTAssertEqual(processGeneration(launchDate: launched, pid: pid), launched, "LaunchServices' date when there is one")
    let web = WebAccessibility()
    let app = FakeApplication(names: ["AXManualAccessibility"])
    let generation = processGeneration(launchDate: nil, pid: pid)
    _ = web.enable(pid: pid, launched: generation, connection: 1, access: app.access)
    web.release(connection: 1)
    app.values["AXManualAccessibility"] = true  // the readback after the write-back
    XCTAssertEqual(web.enable(pid: pid, launched: processGeneration(launchDate: nil, pid: pid), connection: 2, access: app.access),
                   "AXManualAccessibility", "the same generation: re-set as before")
  }

  func testAnEndedProcessHasNoStartTime() throws {
    let child = Process()
    child.executableURL = URL(fileURLWithPath: "/usr/bin/true")
    try child.run()
    child.waitUntilExit()  // reaped
    XCTAssertNil(processStartTime(pid: child.processIdentifier))
  }

  func testShutdownReleasesEveryProcessTheEngineEnabled() {
    let web = WebAccessibility()
    let a = FakeApplication(names: ["AXManualAccessibility"])
    let b = FakeApplication(names: ["AXEnhancedUserInterface"])
    _ = web.enable(pid: 7, launched: launched, connection: 1, access: a.access)
    _ = web.enable(pid: 8, launched: launched, connection: 1, access: b.access)
    web.releaseAll()
    XCTAssertEqual(a.written, ["AXManualAccessibility=true", "AXManualAccessibility=false"])
    XCTAssertEqual(b.written, ["AXEnhancedUserInterface=true", "AXEnhancedUserInterface=false"])
  }

  func testEachObservationReportsWhatTheAttributeReadBeforeTheEngineTouchedIt() {
    // timings.enablementPrior, which the live harness reads to show the release's precondition (it read false).
    let web = WebAccessibility()
    let app = FakeApplication(names: ["AXManualAccessibility"])
    let first = web.enableReporting(pid: 7, launched: launched, connection: 1, access: app.access)
    XCTAssertEqual(first.set, "AXManualAccessibility")
    XCTAssertEqual(first.prior?.wire, "false")
    let second = web.enableReporting(pid: 7, launched: launched, connection: 1, access: app.access)
    XCTAssertNil(second.set)
    XCTAssertEqual(second.prior?.wire, "owned", "set and owned by the engine at the first observation: nothing read")
    let other = FakeApplication(names: ["AXEnhancedUserInterface"])
    other.unreadable = ["AXEnhancedUserInterface"]
    XCTAssertEqual(web.enableReporting(pid: 8, launched: launched, connection: 1, access: other.access).prior?.wire, "unreadable")
    XCTAssertNil(web.enableReporting(pid: 9, launched: launched, connection: 1, access: FakeApplication(names: ["AXTitle"]).access).prior,
                 "nothing listed: nothing read, nothing reported")
    XCTAssertNil(web.enableReporting(pid: 10, launched: launched, connection: 1, access: FakeApplication(names: nil).access).prior,
                 "names not readable yet")
  }

  func testAnObservationThatBeginsDuringAReleasesResetWaitsForItAndEnablesAgain() {
    // A barrier holds the release inside its reset of the attribute (still true) while a new connection observes the
    // process. The new observation must not read the not-yet-reset true and skip enabling: it shares the retiring
    // entry's lock, so it reads after the reset and sets the attribute again, owning it.
    let web = WebAccessibility()
    let app = FakeApplication(names: ["AXManualAccessibility"])
    _ = web.enable(pid: 7, launched: launched, connection: 1, access: app.access)
    let inReset = DispatchSemaphore(value: 0)
    let proceed = DispatchSemaphore(value: 0)
    app.duringWrite = { _, value in
      guard !value else { return }
      inReset.signal()
      _ = proceed.wait(timeout: .now() + 5)
    }
    let released = DispatchSemaphore(value: 0)
    Thread { web.release(connection: 1); released.signal() }.start()
    XCTAssertEqual(inReset.wait(timeout: .now() + 5), .success, "the release reached its reset")
    app.duringWrite = { _, _ in }  // read only once the reset is held
    let enabled = Box<String?>()
    let observed = DispatchSemaphore(value: 0)
    let launched = self.launched
    Thread { enabled.value = web.enable(pid: 7, launched: launched, connection: 2, access: app.access); observed.signal() }.start()
    let registered = Date().addingTimeInterval(5)
    while !web.observers(pid: 7, launched: launched).contains(2), Date() < registered { usleep(1_000) }
    XCTAssertTrue(web.observers(pid: 7, launched: launched).contains(2), "the new observation registered during the reset")
    proceed.signal()
    XCTAssertEqual(released.wait(timeout: .now() + 5), .success)
    XCTAssertEqual(observed.wait(timeout: .now() + 5), .success)
    XCTAssertEqual(enabled.value, "AXManualAccessibility", "it read the reset value and enabled again")
    XCTAssertEqual(app.values["AXManualAccessibility"], true, "the process stays enabled under its new observer")
    web.release(connection: 2)
    XCTAssertEqual(app.written, ["AXManualAccessibility=true", "AXManualAccessibility=false", "AXManualAccessibility=true", "AXManualAccessibility=false"])
  }

  /// What a paste's trust in a Chromium or Electron process's notifications keys on (#187): the enablement holds while
  /// the engine owns the attribute, or it read true; not before any observation, not after the write-back, and not
  /// when the write failed on a value that read false.
  func testTheEnablementHoldsWhileOwnedOrReadTrueAndNotAfterTheWriteBack() {
    let web = WebAccessibility()
    let app = FakeApplication(names: ["AXManualAccessibility"])
    XCTAssertFalse(web.enablementHolds(pid: 7, launched: launched), "never observed: the role read alone is not counted")
    _ = web.enable(pid: 7, launched: launched, connection: 1, access: app.access)
    XCTAssertTrue(web.enablementHolds(pid: 7, launched: launched), "owned")
    XCTAssertFalse(web.enablementHolds(pid: 7, launched: Date(timeIntervalSince1970: 2_000)), "another generation of the pid")
    _ = web.enable(pid: 7, launched: launched, connection: 1, access: app.access)
    XCTAssertTrue(web.enablementHolds(pid: 7, launched: launched), "still owned, nothing re-read")
    web.release(connection: 1)
    XCTAssertFalse(web.enablementHolds(pid: 7, launched: launched), "written back")

    let other = FakeApplication(names: ["AXManualAccessibility"])
    other.values["AXManualAccessibility"] = true  // VoiceOver's
    _ = web.enable(pid: 8, launched: launched, connection: 1, access: other.access)
    XCTAssertTrue(web.enablementHolds(pid: 8, launched: launched), "read true: another client's, on")

    let failing = FakeApplication(names: ["AXManualAccessibility"])
    failing.failWrites = true
    _ = web.enable(pid: 9, launched: launched, connection: 1, access: failing.access)
    XCTAssertFalse(web.enablementHolds(pid: 9, launched: launched), "read false and the write failed")
  }

  /// Chromium and Electron by their principal class; web-shaped by a URL scheme alone is not enough (Safari's own
  /// notifications need no enablement).
  func testChromiumFamilyIsByPrincipalClass() {
    XCTAssertTrue(chromiumFamily(info: ["NSPrincipalClass": "AtomApplication"]))
    XCTAssertTrue(chromiumFamily(info: ["NSPrincipalClass": "BrowserCrApplication"]))
    XCTAssertFalse(chromiumFamily(info: ["NSPrincipalClass": "NSApplication", "CFBundleURLTypes": [["CFBundleURLSchemes": ["http"]]]]))
    XCTAssertFalse(chromiumFamily(info: [:]))
  }
}

/// The minimized rule wired into the pointer methods: scroll and drag (and a click at a point) are refused before their
/// delta, their in-flight intervention check and any post, and a coordinate is refused for the minimized window before
/// it is placed in a screenshot, so the model is told the cause rather than to take a screenshot it cannot get.
final class MinimizedPointerInputTests: XCTestCase {
  private let window = AXUIElementCreateApplication(1)

  /// A scroll's or drag's tail as the methods run it: the delta, the in-flight check, the post.
  private final class Tail {
    var steps: [String] = []
    func run() throws -> String {
      steps.append("delta")
      steps.append("checkInFlight")
      steps.append("post")
      return "posted"
    }
  }

  func testAScrollIntoAMinimizedWindowIsRefusedBeforeItsDeltaCheckAndPost() {
    let tail = Tail()
    XCTAssertThrowsError(try pointerInput(in: window, app: "TextEdit", minimized: { _ in true }) { try tail.run() }) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "windowMinimized")
      XCTAssertTrue((error as? EngineError)?.message.contains("scrolled") == true)
    }
    XCTAssertEqual(tail.steps, [], "nothing of the scroll ran")
  }

  func testAScrollOnScreenOrWithoutAWindowRuns() throws {
    let shown = Tail()
    XCTAssertEqual(try pointerInput(in: window, app: "TextEdit", minimized: { _ in false }) { try shown.run() }, "posted")
    XCTAssertEqual(shown.steps, ["delta", "checkInFlight", "post"])
    let windowless = Tail()  // a scroll at an element with no window of its own (a menu-bar item's)
    XCTAssertEqual(try pointerInput(in: nil, app: "TextEdit", minimized: { _ in true }) { try windowless.run() }, "posted")
  }

  func testADragFromAMinimizedWindowIsRefusedBeforeItsStartIsPlacedInAScreenshot() {
    var placed = 0
    XCTAssertThrowsError(try placeCoordinate(in: window, app: "TextEdit", minimized: { _ in true }) { placed += 1; return CGPoint(x: 1, y: 2) }) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "windowMinimized", "the cause, not noScreenshotForCoordinates")
    }
    XCTAssertEqual(placed, 0)
  }

  func testADragInAWindowOnScreenIsPlaced() throws {
    XCTAssertEqual(try placeCoordinate(in: window, app: "TextEdit", minimized: { _ in false }) { CGPoint(x: 1, y: 2) }, CGPoint(x: 1, y: 2))
  }
}
