import XCTest
@testable import Engine

// M2a.4's observation rules (the spec's Design, "Observation (skyshot)", "Settle" and "Result meta"; the Decision Log's
// "M2a pre-flight" item 2, "M2a vendor reading" items 1 and 2, the critique's A3): when an observation settles, what a
// minimized primary window gets, and the enablement that is re-checked per observation and released when the last
// connection that observed the process closes.

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

/// A fake application's enablement attributes, recording every write.
private final class FakeApplication: @unchecked Sendable {
  var names: [String]?
  var values: [String: Bool] = [:]
  var unreadable: Set<String> = []
  var current = true
  var writes: [(String, Bool)] = []
  var namesRead = 0
  var failWrites = false
  /// Runs inside every write before it takes effect (a barrier a test holds a release's reset at).
  var duringWrite: (String, Bool) -> Void = { _, _ in }

  init(names: [String]?) { self.names = names }

  var access: EnablementAccess {
    EnablementAccess(
      listed: { self.namesRead += 1; return self.names },
      read: { self.unreadable.contains($0) ? nil : self.values[$0] ?? false },  // an attribute nobody set reads false
      write: { name, value in
        self.duringWrite(name, value)
        self.writes.append((name, value))
        guard !self.failWrites else { return false }
        self.values[name] = value
        return true
      },
      current: { self.current })
  }

  var written: [String] { writes.map { "\($0.0)=\($0.1)" } }
}

final class EnablementReleaseTests: XCTestCase {
  private let launched = Date(timeIntervalSince1970: 1_000)

  func testItIsSetWhenItReadsFalseAndReCheckedOnEveryObservation() {
    let web = WebAccessibility()
    let app = FakeApplication(names: ["AXManualAccessibility", "AXEnhancedUserInterface"])
    app.values["AXManualAccessibility"] = false
    XCTAssertEqual(web.enable(pid: 7, launched: launched, connection: 1, access: app.access), "AXManualAccessibility", "never both")
    XCTAssertNil(web.enable(pid: 7, launched: launched, connection: 1, access: app.access), "it reads true now: nothing written")
    app.values["AXManualAccessibility"] = false  // the process reset it
    XCTAssertEqual(web.enable(pid: 7, launched: launched, connection: 1, access: app.access), "AXManualAccessibility", "re-checked, not remembered once per process")
    XCTAssertEqual(app.written, ["AXManualAccessibility=true", "AXManualAccessibility=true"])
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
    XCTAssertNil(web.enable(pid: 7, launched: launched, connection: 2, access: app.access), "it still reads true: nothing to set")
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

  func testAReleasedProcessIsEnabledAndOwnedAgainByTheNextConnection() {
    let web = WebAccessibility()
    let app = FakeApplication(names: ["AXManualAccessibility"])
    _ = web.enable(pid: 7, launched: launched, connection: 1, access: app.access)
    web.release(connection: 1)
    XCTAssertEqual(web.enable(pid: 7, launched: launched, connection: 4, access: app.access), "AXManualAccessibility", "enabled and owned again")
    web.release(connection: 4)
    XCTAssertEqual(app.written, ["AXManualAccessibility=true", "AXManualAccessibility=false", "AXManualAccessibility=true", "AXManualAccessibility=false"])
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
    XCTAssertEqual(second.prior?.wire, "true", "set by the engine at the first observation")
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
}

/// The web-area wait (the vendor's rule, Enablement.swift `webAreaWaitNeeded`): it runs after enabling and on every
/// Chromium observation, whatever earlier observations of the process saw. Each observation here is composed as
/// getAppState composes it: the enablement's re-read-and-set, then the wait decision on a Chromium window or not.
final class WebAreaWaitTests: XCTestCase {
  private let launched = Date(timeIntervalSince1970: 1_000)

  /// One observation of pid 7 by `connection`; true when it waits.
  private func observe(_ web: WebAccessibility, _ app: FakeApplication, connection: Int, chromium: Bool = true) -> Bool {
    let enabledNow = web.enable(pid: 7, launched: launched, connection: connection, access: app.access) != nil
    return webAreaWaitNeeded(switchOn: true, enabledNow: enabledNow, chromium: chromium)
  }

  func testTheWaitRunsOnASecondObservationAfterOneThatSawTheWebArea() {
    let web = WebAccessibility()
    let app = FakeApplication(names: ["AXManualAccessibility"])
    XCTAssertTrue(observe(web, app, connection: 1), "the first observation, enabling")
    XCTAssertTrue(observe(web, app, connection: 1), "the page was seen, and the wait runs again (hold 2b: a first read can be an empty container)")
    XCTAssertTrue(observe(web, app, connection: 1))
    XCTAssertEqual(app.written, ["AXManualAccessibility=true"], "re-read and found true: set once")
  }

  func testTheWaitRunsAfterAReleaseWhenANewConnectionObserves() {
    let web = WebAccessibility()
    let owned = FakeApplication(names: ["AXManualAccessibility"])
    XCTAssertTrue(observe(web, owned, connection: 1))
    web.release(connection: 1)
    XCTAssertTrue(observe(web, owned, connection: 2), "re-enabled after the write-back")
    XCTAssertEqual(owned.written, ["AXManualAccessibility=true", "AXManualAccessibility=false", "AXManualAccessibility=true"])

    // An attribute another client set is never released, so the next connection enables nothing; it still waits.
    let other = WebAccessibility()
    let voiceOver = FakeApplication(names: ["AXManualAccessibility"])
    voiceOver.values["AXManualAccessibility"] = true
    XCTAssertTrue(observe(other, voiceOver, connection: 1))
    other.release(connection: 1)
    XCTAssertTrue(observe(other, voiceOver, connection: 2))
    XCTAssertTrue(voiceOver.writes.isEmpty)
  }

  func testTheWaitRunsOnAFreshConnectionWhileAnotherObservesTheProcess() {
    let web = WebAccessibility()
    let app = FakeApplication(names: ["AXManualAccessibility"])
    XCTAssertTrue(observe(web, app, connection: 1))
    XCTAssertTrue(observe(web, app, connection: 2), "nothing enabled now; a Chromium window waits")
    web.release(connection: 1)
    XCTAssertEqual(app.written, ["AXManualAccessibility=true"], "connection 2 still observes it")
  }

  func testANonChromiumWindowWaitsOnlyOnTheObservationThatEnabledIt() {
    let web = WebAccessibility()
    let named = FakeApplication(names: ["AXEnhancedUserInterface"])  // a named bundle (iWork, Spotify): not Chromium
    XCTAssertTrue(observe(web, named, connection: 1, chromium: false), "after enabling (the vendor's rule)")
    XCTAssertFalse(observe(web, named, connection: 1, chromium: false))
    XCTAssertFalse(observe(web, FakeApplication(names: ["AXTitle"]), connection: 1, chromium: false), "nothing to enable: no wait")
    XCTAssertFalse(webAreaWaitNeeded(switchOn: false, enabledNow: true, chromium: true), "the M0 switch off")
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
