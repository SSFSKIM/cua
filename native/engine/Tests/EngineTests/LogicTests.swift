import ApplicationServices
import XCTest
@testable import Engine

// The engine's pure rules: sibling matching, the re-fetch verdict, the settle loop on a fake clock, the byte estimate,
// web-shaped detection and the one enablement attribute, the node's wire shape and tokens, the value type.

private func element(_ id: Int) -> AXUIElement { AXUIElementCreateApplication(pid_t(61_000 + id)) }
private func old(_ ids: [Int]) -> [(index: Int, element: AXUIElement)] { ids.map { ($0 * 10, element($0)) } }

final class SiblingMatchTests: XCTestCase {
  func testTheCommonPrefixKeepsItsIndexes() {
    XCTAssertEqual(matchSiblings(old: old([1, 2, 3]), new: [1, 2, 3].map(element)), [10, 20, 30])
  }

  func testAnInsertionIsNewAndTheRestKeepTheirIndexes() {
    XCTAssertEqual(matchSiblings(old: old([1, 2, 3]), new: [1, 9, 2, 3].map(element)), [10, nil, 20, 30])
  }

  func testOnlyTheLongestIncreasingRunOfMovedElementsKeepsItsIndexes() {
    XCTAssertEqual(matchSiblings(old: old([1, 2, 3, 4, 5]), new: [5, 1, 2, 3, 4].map(element)), [nil, 10, 20, 30, 40])
  }

  func testADuplicatedHandleMatchesOnce() {
    XCTAssertEqual(matchSiblings(old: old([1, 2]), new: [2, 2].map(element)), [20, nil])
  }

  func testLongestIncreasingRun() {
    XCTAssertEqual(longestIncreasingRun([3, 1, 2, 5, 4, 6]).count, 4)
    XCTAssertEqual(longestIncreasingRun([]), [])
    let values = [2, 9, 3, 7, 4, 5]
    let run = longestIncreasingRun(values).map { values[$0] }
    XCTAssertEqual(run, run.sorted())
    XCTAssertEqual(run.count, 4)
  }
}

final class RefetchVerdictTests: XCTestCase {
  func testTheVendorsOrder() {
    XCTAssertEqual(RefetchVerdict.of(before: 2, after: 1), .ambiguousBefore)
    XCTAssertEqual(RefetchVerdict.of(before: 0, after: 1), .ambiguousBefore)
    XCTAssertEqual(RefetchVerdict.of(before: 1, after: 0), .noLongerValid)
    XCTAssertEqual(RefetchVerdict.of(before: 1, after: 1), .found)
    XCTAssertEqual(RefetchVerdict.of(before: 1, after: 3), .ambiguousAfter)
    XCTAssertTrue(ElementErrors.ambiguousBeforeRefetch.message.contains("couldn't be started"))
    XCTAssertTrue(ElementErrors.ambiguousAfterRefetch.message.contains("couldn't be finished"))
  }
}

/// A fake clock the settle loop sleeps on, with notifications scheduled by time.
private final class FakeClock {
  var now = 0.0
  var pending: [SettleEvent] = []

  func drain() -> [SettleEvent] {
    let due = pending.filter { $0.at <= now }
    pending.removeAll { $0.at <= now }
    return due
  }
}

final class SettleTests: XCTestCase {
  private func run(_ clock: FakeClock, sample: Double = settleSampleMs, deadline: Double = .infinity,
                   ready: @escaping () -> Bool? = { true }) -> SettleReport {
    runSettle(sampleMs: sample, deadlineMs: deadline, now: { clock.now }, sleep: { clock.now += $0 }, drain: clock.drain, ready: ready)
  }

  func testAQuietNativeAppSettlesAtTheThirdSample() {
    let report = run(FakeClock())
    XCTAssertFalse(report.capped)
    XCTAssertEqual(report.ms, 300)
    XCTAssertEqual(report.busyWalks, 1)
    XCTAssertEqual(report.quietAtMs, 300, "the third sample is the first at which 250 ms of quiet have passed")
  }

  func testAWebShapedAppSamplesEvery250Ms() {
    XCTAssertEqual(run(FakeClock(), sample: settleWebSampleMs).ms, 250)
  }

  func testANotificationRestartsTheQuietPeriod() {
    let clock = FakeClock()
    clock.pending = [SettleEvent(name: kAXLayoutChangedNotification, at: 150, counts: true)]
    let report = run(clock)
    XCTAssertEqual(report.ms, 400)
    XCTAssertEqual(report.counts, [kAXLayoutChangedNotification: 1])
  }

  func testAnUnchangedTitleIsCountedButDoesNotRestartTheQuietPeriod() {
    let clock = FakeClock()
    clock.pending = [SettleEvent(name: kAXTitleChangedNotification, at: 150, counts: false)]
    let report = run(clock)
    XCTAssertEqual(report.ms, 300)
    XCTAssertEqual(report.ignoredTitleChanges, 1)
  }

  func testContinuousNotificationsAreCappedAtFiveSecondsAndReported() {
    let clock = FakeClock()
    clock.pending = stride(from: 50.0, through: 6_000, by: 100).map { SettleEvent(name: kAXLayoutChangedNotification, at: $0, counts: true) }
    let report = run(clock)
    XCTAssertTrue(report.capped)
    XCTAssertEqual(report.ms, settleCapMs)
    XCTAssertEqual(report.busyWalks, 0)
  }

  func testABusyTreeKeepsTheSettleWaiting() {
    let clock = FakeClock()
    var answers: [Bool?] = [nil, false, false, true]
    let report = run(clock) { answers.removeFirst() }
    XCTAssertFalse(report.capped)
    XCTAssertEqual(report.busyVetoes, 2)
    XCTAssertEqual(report.busyWalks, 4)
    XCTAssertEqual(report.ms, 600)
  }

  func testARequestDeadlineThatPassesMidSettleCancelsItAsTimedOutNotCapped() {
    let clock = FakeClock()
    clock.pending = stride(from: 50.0, through: 6_000, by: 100).map { SettleEvent(name: kAXLayoutChangedNotification, at: $0, counts: true) }
    var walks = 0
    let report = run(clock, deadline: 1_234) { walks += 1; return true }
    XCTAssertTrue(report.timedOut)
    XCTAssertFalse(report.capped, "the request's deadline, not the 5 s cap, ended it")
    XCTAssertEqual(report.ms, 1_234, "the last sleep is cut at the deadline, not run to the next tick")
    XCTAssertEqual(walks, 0, "no busy walk starts once the deadline has passed")
  }

  func testAThreadDescheduledBetweenClockReadsNeverSleepsANegativeTime() {
    // Every read of this clock finds it 70 ms later, as if the thread lost the processor between any two reads.
    var clock = 0.0
    var sleeps: [Double] = []
    let report = runSettle(sampleMs: settleSampleMs, deadlineMs: 100, now: { defer { clock += 70 }; return clock },
                           sleep: { sleeps.append($0); clock += $0 }, drain: { [] }, ready: { true })
    XCTAssertTrue(report.timedOut)
    XCTAssertFalse(sleeps.isEmpty)
    XCTAssertTrue(sleeps.allSatisfy { $0 >= 0 }, "\(sleeps)")
  }

  func testADeadlineAlreadyPastCancelsBeforeTheFirstSample() {
    let report = run(FakeClock(), deadline: 0)
    XCTAssertTrue(report.timedOut)
    XCTAssertEqual(report.ms, 0)
    XCTAssertEqual(report.busyWalks, 0)
  }

  func testADeadlineAfterTheQuietPointOrTheCapChangesNothing() {
    let quiet = run(FakeClock(), deadline: 350)
    XCTAssertFalse(quiet.timedOut, "quiet at 300 ms, before the deadline")
    XCTAssertEqual(quiet.ms, 300)
    let clock = FakeClock()
    clock.pending = stride(from: 50.0, through: 6_000, by: 100).map { SettleEvent(name: kAXLayoutChangedNotification, at: $0, counts: true) }
    let capped = run(clock, deadline: 60_000)
    XCTAssertTrue(capped.capped)
    XCTAssertFalse(capped.timedOut)
    XCTAssertEqual(capped.ms, settleCapMs)
  }

  func testTheTenNotifications() {
    XCTAssertEqual(settleNotifications.count, 10)
    XCTAssertFalse(settleNotifications.contains(kAXValueChangedNotification))
  }
}

final class ByteEstimateTests: XCTestCase {
  private func actual(_ value: Any) -> Int { try! JSONSerialization.data(withJSONObject: [value], options: [.withoutEscapingSlashes]).count - 2 }

  func testAStringCostsItsEscapedLength() {
    for sample in ["plain", "quote \" back\\slash", "line\nbreak\ttab\r", "ctl \u{01}\u{1f}", "a/b/c", "한글 😀 é"] {
      XCTAssertEqual(jsonStringBytes(sample), actual(sample), sample)
    }
  }

  func testANodeIsNeverUnderestimated() {
    let node: [String: Any] = ["token": "t12", "title": "Say \"hi\"\n", "value": NSNull(), "flags": ["enabled": true], "frame": ["x": 1.5, "y": -2.25],
                               "actions": ["AXPress", "AXShowMenu"], "domClassList": ["a", "b"]]
    XCTAssertGreaterThanOrEqual(jsonBytes(node), actual(node))
  }
}

final class EnablementTests: XCTestCase {
  func testWebShapedApps() {
    XCTAssertTrue(webShaped(info: ["NSPrincipalClass": "AtomApplication"]))
    XCTAssertTrue(webShaped(info: ["NSPrincipalClass": "BrowserCrApplication"]))
    XCTAssertTrue(webShaped(info: ["CFBundleURLTypes": [["CFBundleURLSchemes": ["https", "HTTP"]]]]))
    XCTAssertFalse(webShaped(info: ["NSPrincipalClass": "NSApplication", "CFBundleURLTypes": [["CFBundleURLSchemes": ["file", "x-finder"]]]]))
    XCTAssertFalse(webShaped(info: [:]))
  }

  func testEligibleAppsAreTheWebShapedAndTheVendorsNamedBundles() {
    XCTAssertTrue(enablementEligible(bundleIdentifier: "io.github.ssfskim.cua.fixture.electron", webShaped: true))
    XCTAssertTrue(enablementEligible(bundleIdentifier: "com.apple.iWork.Pages", webShaped: false))
    XCTAssertTrue(enablementEligible(bundleIdentifier: "com.apple.iWork.Keynote", webShaped: false))
    XCTAssertTrue(enablementEligible(bundleIdentifier: "com.spotify.client", webShaped: false))
    XCTAssertFalse(enablementEligible(bundleIdentifier: "com.apple.finder", webShaped: false))
    XCTAssertFalse(enablementEligible(bundleIdentifier: "com.apple.TextEdit", webShaped: false))
    XCTAssertFalse(enablementEligible(bundleIdentifier: nil, webShaped: false))
  }

  func testOneAttributeNeverBoth() {
    XCTAssertEqual(enablementAttribute(listed: ["AXEnhancedUserInterface", "AXManualAccessibility"]), "AXManualAccessibility")
    XCTAssertEqual(enablementAttribute(listed: ["AXRole", "AXEnhancedUserInterface"]), "AXEnhancedUserInterface")
    XCTAssertNil(enablementAttribute(listed: ["AXRole"]))
  }

  func testTheInstalledFinderAndTextEditAreNotWebShaped() throws {
    for path in ["/System/Library/CoreServices/Finder.app", "/System/Applications/TextEdit.app"] {
      let info = try XCTUnwrap(NSDictionary(contentsOfFile: path + "/Contents/Info.plist") as? [String: Any], path)
      XCTAssertFalse(webShaped(info: info), path)
    }
  }
}

final class FetchDecodeTests: XCTestCase {
  func testTheNodeCarriesWhatTheElementCarriesAndATokenNotAnIndex() {
    var range = CFRange(location: 3, length: 2)
    let values: [String: CFTypeRef] = [
      "AXRole": "AXRow" as CFString, "AXTitle": "Row" as CFString, "AXValue": 7 as CFNumber, "AXDisclosing": kCFBooleanTrue,
      "AXRowIndexRange": AXValueCreate(.cfRange, &range)!, "AXDOMClassList": ["x", "y"] as CFArray,
      "AXChildren": [element(1), element(2)] as CFArray, "AXHelp": "help" as CFString,
    ]
    let node = nodeWire(token: elementToken(7), depth: 0, pid: 1, data: ElementData(values: values), actions: [],
                        flags: NodeFlags(disclosable: true), valueMarkdown: nil, children: 0, shown: nil)
    XCTAssertEqual(node["token"] as? String, "t7")
    XCTAssertNil(node["index"])
    XCTAssertEqual(node["rowIndexRange"] as? [Int], [3, 5])
    XCTAssertEqual(node["domClassList"] as? [String], ["x", "y"])
    XCTAssertEqual(node["valueType"] as? String, "integer")
    XCTAssertEqual((node["flags"] as? [String: Any])?["expanded"] as? Bool, true)
    XCTAssertEqual((node["flags"] as? [String: Any])?["disclosable"] as? Bool, true)
    XCTAssertNil(node["placeholder"], "an attribute the element does not carry is absent")
    XCTAssertTrue(node["subrole"] is NSNull)
  }

  func testTokensRoundTripAndNothingElseParsesAsOne() {
    for number in [0, 1, 42, 4_000] { XCTAssertEqual(tokenNumber(elementToken(number)), number) }
    for malformed in ["", "t", "7", "t-1", "t01", "T7", "t7 ", "x7", "t1.5"] { XCTAssertNil(tokenNumber(malformed), malformed) }
  }

  func testPositionRanges() {
    XCTAssertEqual(positionRanges([0, 1, 2, 5, 7, 6]), [[0, 3], [5, 8]])
    XCTAssertEqual(positionRanges([]), [])
  }
}

// The observation's preparation (M1b.5, the vendor's 0x10014c494 → 0x10014c4f0): what it opens before reading, the
// reads charged to the deadline, the replacement followed, and the window wait that follows an open.
final class PreparationTests: XCTestCase {
  private let someWindow = AXUIElementCreateApplication(pid_t(61_500)) as CFTypeRef
  private let windowList = [AXUIElementCreateApplication(pid_t(61_501))] as CFArray

  private func reads(_ answers: [String: (CFTypeRef?, AXError)]) -> (String) -> (value: CFTypeRef?, error: AXError) {
    { name in let answer = answers[name] ?? (nil, .noValue); return (answer.0, answer.1) }
  }

  func testTheFocusedWindowIsRead() {
    guard case .window = readPrimaryWindow(reads([kAXFocusedWindowAttribute: (someWindow, .success)])) else { return XCTFail() }
  }

  func testNoValueAndUnsupportedEverywhereIsAConfirmedAbsence() {
    guard case .absent = readPrimaryWindow(reads([kAXMainWindowAttribute: (nil, .attributeUnsupported), kAXWindowsAttribute: ([] as CFArray, .success)])) else { return XCTFail() }
  }

  func testAFailedReadIsNotAnAbsence() {
    guard case .failed(let error) = readPrimaryWindow(reads([kAXFocusedWindowAttribute: (nil, .cannotComplete)])) else { return XCTFail() }
    XCTAssertEqual(error, .cannotComplete)
  }

  func testAWindowInAXWindowsWinsOverAFailedFocusedRead() {
    guard case .window = readPrimaryWindow(reads([kAXFocusedWindowAttribute: (nil, .cannotComplete), kAXWindowsAttribute: (windowList, .success)])) else { return XCTFail() }
  }

  // A fake clock: every read and sleep advances it.
  private final class Clock { var now: Int64 = 1_000 }

  private func run(pid: pid_t?, deadline: Int64 = 2_000, reads: [WindowRead], readMs: Int64 = 10, openedPid: pid_t = 42, clock: Clock = Clock())
    -> (result: Result<(opened: Bool, running: String?, pid: pid_t), Error>, opens: [Int64], readsDone: Int) {
    var remaining = reads, opens: [Int64] = [], done = 0
    let result = Result {
      try prepareTarget(pid: pid, deadline: deadline, now: { clock.now }, sleep: { clock.now += 50 },
                        read: { _ in done += 1; clock.now += readMs; return remaining.count > 1 ? remaining.removeFirst() : remaining[0] },
                        open: { budget in opens.append(budget); return ("opened", openedPid) })
    }
    return (result, opens, done)
  }

  private func isTimeout(_ result: Result<(opened: Bool, running: String?, pid: pid_t), Error>) -> Bool {
    if case .failure(let error) = result { return (error as? EngineError)?.errorName == "timeoutReached" }
    return false
  }

  func testAnAppThatIsNotRunningIsLaunchedWithTheLaunchBudget() throws {
    let outcome = run(pid: nil, deadline: 99_000, reads: [.absent])
    let target = try outcome.result.get()
    XCTAssertEqual([target.opened, target.pid == 42], [true, true])
    XCTAssertEqual(outcome.opens, [1_000 + launchWindowWaitMs])
    XCTAssertEqual(outcome.readsDone, 0)
  }

  func testARunningAppWithAWindowIsNotOpened() throws {
    let outcome = run(pid: 7, reads: [.window(AXUIElementCreateApplication(7))])
    XCTAssertEqual(try outcome.result.get().opened, false)
    XCTAssertEqual(outcome.opens, [])
  }

  func testARunningAppWithNoWindowIsReopenedWithinTheDeadline() throws {
    let outcome = run(pid: 7, deadline: 2_000, reads: [.absent])
    XCTAssertEqual(try outcome.result.get().opened, true)
    XCTAssertEqual(outcome.opens, [2_000])  // min(deadline, now + 5 s)
  }

  func testTheReopensOwnProcessIsTheOneObserved() throws {
    XCTAssertEqual(try run(pid: 7, reads: [.absent], openedPid: 8).result.get().pid, 8)
  }

  func testAFailedReadIsRetriedAndNeverOpensWhenAWindowAnswers() throws {
    let outcome = run(pid: 7, reads: [.failed(.cannotComplete), .failed(.cannotComplete), .window(AXUIElementCreateApplication(7))])
    XCTAssertEqual(try outcome.result.get().opened, false)
    XCTAssertEqual(outcome.opens, [])
    XCTAssertEqual(outcome.readsDone, 3)
  }

  func testAReadThatKeepsFailingIsTimeoutReachedWithNoOpen() {
    let outcome = run(pid: 7, deadline: 1_500, reads: [.failed(.cannotComplete)])
    XCTAssertTrue(isTimeout(outcome.result))
    XCTAssertEqual(outcome.opens, [])
  }

  func testNoOpenIsSentOnceTheReadsHaveUsedTheDeadline() {
    let outcome = run(pid: 7, deadline: 1_500, reads: [.absent], readMs: 600)
    XCTAssertTrue(isTimeout(outcome.result))
    XCTAssertEqual(outcome.opens, [])
  }

  func testEachAttributeReadGetsWhatIsLeftAndNoneIsSentPastTheDeadline() {
    let clock = Clock()  // 1_000
    var timeouts: [Float] = [], copies: [String] = []
    let read = deadlineBounded(deadline: 2_300, now: { clock.now }, setTimeout: { timeouts.append($0) },
                               copy: { name in copies.append(name); clock.now += 1_000; return (nil, .cannotComplete) })
    guard case .failed = readPrimaryWindow(read) else { return XCTFail() }
    XCTAssertEqual(copies, [kAXFocusedWindowAttribute, kAXMainWindowAttribute])  // the third read would start past 2_300
    XCTAssertEqual(timeouts.count, 2)
    XCTAssertEqual(timeouts[0], 1.0, accuracy: 0.001)
    XCTAssertEqual(timeouts[1], 0.3, accuracy: 0.001)
  }

  func testASleepThatCrossesTheDeadlineStartsNoFurtherRead() {
    let outcome = run(pid: 7, deadline: 1_050, reads: [.failed(.cannotComplete), .window(AXUIElementCreateApplication(7))])
    XCTAssertTrue(isTimeout(outcome.result))
    XCTAssertEqual(outcome.readsDone, 1)
  }

  func testAWindowReadThatEndsPastTheDeadlineIsNotAccepted() {
    let outcome = run(pid: 7, deadline: 1_050, reads: [.window(AXUIElementCreateApplication(7))], readMs: 60)
    XCTAssertTrue(isTimeout(outcome.result))
  }

  func testAPassedDeadlineReadsAndOpensNothing() {
    let outcome = run(pid: 7, deadline: 1_000, reads: [.absent])
    XCTAssertTrue(isTimeout(outcome.result))
    XCTAssertEqual([outcome.opens.count, outcome.readsDone], [0, 0])
  }

  // A pid with no process: no window ever appears.
  private let windowless = AXUIElementCreateApplication(pid_t(Int32.max - 7))

  func testAnOpenedAppWithNoWindowByTheDeadlineIsTimeoutReached() {
    let started = unixMilliseconds()
    XCTAssertThrowsError(try awaitPrimaryWindow(of: windowless, until: started + 150, opened: true)) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "timeoutReached")
    }
    let elapsed = unixMilliseconds() - started
    XCTAssertGreaterThanOrEqual(elapsed, 150)
    XCTAssertLessThan(elapsed, 600)
  }

  func testAnAppTheObservationDidNotOpenIsNotWaitedFor() throws {
    let started = unixMilliseconds()
    XCTAssertNil(try awaitPrimaryWindow(of: windowless, until: started, opened: false))
    XCTAssertLessThan(unixMilliseconds() - started, 100)
  }
}
