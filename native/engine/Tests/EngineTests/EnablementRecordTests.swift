import ApplicationServices
import XCTest
@testable import Engine

/// Which processes run, by pid, at which kernel start time (`processStartMicros`'s seam).
private final class Processes: @unchecked Sendable {
  private let lock = NSLock()
  private var starts: [pid_t: Int64]

  init(_ starts: [pid_t: Int64]) { self.starts = starts }

  func start(_ pid: pid_t) -> Int64? { lock.withLock { starts[pid] } }
  func set(_ pid: pid_t, _ start: Int64?) { lock.withLock { starts[pid] = start } }
}

/// Chrome's application element as the enablement sees it: it lists AXEnhancedUserInterface and answers its writes
/// with kAXErrorNotImplemented while acting on them (#292).
private final class Chrome: @unchecked Sendable {
  var value: Bool? = false
  /// The attribute listed: Chrome's EUI by default; Electron lists AXManualAccessibility.
  var names = ["AXEnhancedUserInterface"]
  /// Electron's computed getter: reads false whatever was written (#244).
  var computedFalse = false
  var answer: AXError = .notImplemented
  /// Answers for the next writes, in order, before `answer`.
  var answers: [AXError] = []
  /// A write true that takes leaves the attribute unreadable (an uncertain outcome).
  var unreadableAfterWrite = false
  var writes: [Bool] = []
  var current = true
  /// Runs inside every write before it takes effect, and inside every read.
  var duringWrite: () -> Void = {}
  var duringRead: () -> Void = {}

  var access: EnablementAccess {
    EnablementAccess(
      listed: { self.names },
      readRole: {},
      read: { _ in
        self.duringRead()
        return self.computedFalse ? false : self.value
      },
      write: { _, value in
        self.duringWrite()
        self.writes.append(value)
        let answer = self.answers.isEmpty ? self.answer : self.answers.removeFirst()
        if answer == .success || answer == .notImplemented { self.value = value && self.unreadableAfterWrite ? nil : value }
        return answer
      },
      current: { self.current })
  }
}

/// A restore's writes, answered with `answer`; each moves the clock by `costMs`.
private final class Restores: @unchecked Sendable {
  var answer: AXError = .notImplemented
  var written: [String] = []
  var clock: Double = 0
  var costMs: Double = 0

  func write(_ pid: pid_t, _ attribute: String) -> AXError {
    written.append("\(pid) \(attribute)=false")
    clock += costMs
    return answer
  }
}

/// #293: the enablement record that lets the next engine restore what a SIGKILLed or crashed engine left on.
final class EnablementRecordTests: XCTestCase {
  private let eui = "AXEnhancedUserInterface"
  private let launched = Date(timeIntervalSince1970: 1_000)
  private var directory = ""

  override func setUpWithError() throws {
    directory = FileManager.default.temporaryDirectory.appendingPathComponent("cua-enablement-\(UUID().uuidString)").path
    try FileManager.default.createDirectory(atPath: directory, withIntermediateDirectories: true)
  }

  override func tearDownWithError() throws {
    try? FileManager.default.removeItem(atPath: directory)
  }

  /// The record of engine `owner` (started at `ownerStart`) in the test's directory.
  private func record(owner: pid_t, ownerStart: Int64, _ processes: Processes, restores: Restores = Restores(),
                      generation: ((pid_t) -> Date?)? = nil, log: @escaping (String) -> Void = { _ in }) -> EnablementRecord {
    EnablementRecord(directory: directory + "/enablement", ownerPid: owner, ownerStart: ownerStart, startTime: processes.start,
                     writeFalse: restores.write, generation: generation ?? { [launched] _ in launched }, now: { restores.clock }, log: log)
  }

  private func entry(_ pid: pid_t, _ start: Int64, owner: pid_t = 900, ownerStart: Int64 = 9_000) -> EnablementRecordEntry {
    EnablementRecordEntry(pid: pid, start: start, attribute: eui, ownerPid: owner, ownerStart: ownerStart)
  }

  private func filed(_ record: EnablementRecord) -> [EnablementRecordEntry?] { record.entries().map(\.entry) }

  func testAnOwnedEnableFilesItsEntryBeforeTheWrite() throws {
    let processes = Processes([7: 7_000, 900: 9_000])
    let first = record(owner: 900, ownerStart: 9_000, processes)
    let web = WebAccessibility(releaseGraceMs: 0, record: first)
    let chrome = Chrome()
    var atWrite: [EnablementRecordEntry?] = []
    chrome.duringWrite = { atWrite = self.filed(first) }
    XCTAssertEqual(web.enable(pid: 7, launched: launched, connection: 1, access: chrome.access), eui)
    XCTAssertEqual(atWrite, [entry(7, 7_000)], "filed before the attribute is written: a kill right after the write leaves it")
    XCTAssertEqual(filed(first), [entry(7, 7_000)])
    // The format the next engine, and the hosted check, read.
    let data = try XCTUnwrap(FileManager.default.contents(atPath: directory + "/enablement/7-7000.json"))
    let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    XCTAssertEqual(object as NSDictionary, ["pid": 7, "start": 7_000, "attribute": eui, "ownerPid": 900, "ownerStart": 9_000] as NSDictionary)
    XCTAssertNil(web.enable(pid: 7, launched: launched, connection: 1, access: chrome.access), "owned: nothing written again")
    XCTAssertEqual(filed(first).count, 1)
  }

  func testOnlyAnOwnedAttributeIsFiled() {
    // A3: a value that read true, or could not be read, is not the engine's, so nothing is filed for it; a write that
    // did not take leaves nothing filed either.
    let processes = Processes([7: 7_000, 8: 8_000, 9: 9_100, 900: 9_000])
    let first = record(owner: 900, ownerStart: 9_000, processes)
    let web = WebAccessibility(releaseGraceMs: 0, record: first)
    let voiceOver = Chrome()
    voiceOver.value = true
    XCTAssertNil(web.enable(pid: 7, launched: launched, connection: 1, access: voiceOver.access))
    let unreadable = Chrome()
    unreadable.value = nil
    XCTAssertEqual(web.enable(pid: 8, launched: launched, connection: 1, access: unreadable.access), eui, "set, not owned")
    let refusing = Chrome()
    refusing.answer = .cannotComplete
    XCTAssertNil(web.enable(pid: 9, launched: launched, connection: 1, access: refusing.access))
    XCTAssertEqual(refusing.writes, [true])
    XCTAssertEqual(filed(first), [])
  }

  func testTheWriteBackRemovesTheEntryAndAFailedOneKeepsIt() {
    let processes = Processes([7: 7_000, 8: 8_000, 10: 10_000, 900: 9_000])
    let first = record(owner: 900, ownerStart: 9_000, processes)
    let web = WebAccessibility(releaseGraceMs: 0, record: first)
    let closed = Chrome(), stopped = Chrome(), failing = Chrome()
    _ = web.enable(pid: 7, launched: launched, connection: 1, access: closed.access)
    _ = web.enable(pid: 8, launched: launched, connection: 2, access: stopped.access)
    _ = web.enable(pid: 10, launched: launched, connection: 3, access: failing.access)
    XCTAssertEqual(filed(first).count, 3)
    web.release(connection: 1)
    XCTAssertEqual(closed.writes, [true, false])
    XCTAssertEqual(filed(first), [entry(10, 10_000), entry(8, 8_000)], "the closed connection's process is written back: its entry goes")
    failing.answer = .cannotComplete
    web.releaseAll()
    XCTAssertEqual(stopped.writes, [true, false])
    XCTAssertEqual(filed(first), [entry(10, 10_000)], "the stop's write back removes its entry; a failed one keeps it, still on")
  }

  func testAnEndedProcessesEntryGoesAtItsRelease() {
    let processes = Processes([7: 7_000, 900: 9_000])
    let first = record(owner: 900, ownerStart: 9_000, processes)
    let web = WebAccessibility(releaseGraceMs: 0, record: first)
    let chrome = Chrome()
    _ = web.enable(pid: 7, launched: launched, connection: 1, access: chrome.access)
    chrome.current = false
    web.release(connection: 1)
    XCTAssertEqual(chrome.writes, [true], "nothing to write back")
    XCTAssertEqual(filed(first), [])
  }

  func testADeadOwnersEntryIsWrittenFalseWhenItsTargetRunsAtTheSameStartAndReEnabledOwnedAfter() {
    let processes = Processes([7: 7_000, 8: 8_000, 900: 9_000, 902: 9_200])
    let first = record(owner: 900, ownerStart: 9_000, processes)
    let other = record(owner: 902, ownerStart: 9_200, processes)
    let chrome = Chrome(), electron = Chrome()
    _ = WebAccessibility(releaseGraceMs: 0, record: first).enable(pid: 7, launched: launched, connection: 1, access: chrome.access)
    _ = WebAccessibility(releaseGraceMs: 0, record: other).enable(pid: 8, launched: launched, connection: 1, access: electron.access)
    // Both engines are killed: no release runs. 900 is gone; 902's pid now belongs to another process.
    processes.set(900, nil)
    processes.set(902, 4_242)
    let restores = Restores()
    var lines: [String] = []
    let next = WebAccessibility(releaseGraceMs: 0, record: record(owner: 901, ownerStart: 9_100, processes, restores: restores, log: { lines.append($0) }))
    let report = next.restoreRecorded()
    XCTAssertEqual(restores.written, ["7 \(eui)=false", "8 \(eui)=false"])
    XCTAssertEqual(report?.restored, [entry(7, 7_000), entry(8, 8_000, owner: 902, ownerStart: 9_200)])
    XCTAssertEqual(filed(first), [], "dropped once written")
    XCTAssertEqual(lines.count, 2, "each restore logged")
    // Chromium's attribute may read true after a write back (AppKit's readback): the restored process is remembered as
    // written back, so the next engine's first observation sets it again, owned, and its release writes it back.
    chrome.value = true
    XCTAssertEqual(next.enable(pid: 7, launched: launched, connection: 1, access: chrome.access), eui)
    next.release(connection: 1)
    XCTAssertEqual(chrome.writes, [true, true, false])
  }

  func testNothingIsWrittenWhenTheTargetIsGoneOrItsPidIsAnotherProcess() {
    let processes = Processes([7: 7_000, 8: 8_000, 900: 9_000])
    let first = record(owner: 900, ownerStart: 9_000, processes)
    let web = WebAccessibility(releaseGraceMs: 0, record: first)
    _ = web.enable(pid: 7, launched: launched, connection: 1, access: Chrome().access)
    _ = web.enable(pid: 8, launched: launched, connection: 1, access: Chrome().access)
    processes.set(900, nil)  // killed
    processes.set(7, nil)  // Chrome quit
    processes.set(8, 8_001)  // and its pid was reused by another launch
    let restores = Restores()
    let report = WebAccessibility(record: record(owner: 901, ownerStart: 9_100, processes, restores: restores)).restoreRecorded()
    XCTAssertEqual(restores.written, [], "no process the record does not name by pid and start time is written")
    XCTAssertEqual(report?.dropped, 2)
    XCTAssertEqual(filed(first), [], "both dropped")
  }

  func testALiveOwnersEntryIsLeftAlone() {
    let processes = Processes([7: 7_000, 900: 9_000, 901: 9_100])
    let first = record(owner: 900, ownerStart: 9_000, processes)
    _ = WebAccessibility(releaseGraceMs: 0, record: first).enable(pid: 7, launched: launched, connection: 1, access: Chrome().access)
    let restores = Restores()
    let report = WebAccessibility(record: record(owner: 901, ownerStart: 9_100, processes, restores: restores)).restoreRecorded()
    XCTAssertEqual(restores.written, [], "engine 900 still runs: its enablement is its own to release")
    XCTAssertEqual(report?.live, 1)
    XCTAssertEqual(filed(first), [entry(7, 7_000)])
  }

  func testACorruptRecordIsSkippedWithALogLineAndTheRestRestored() throws {
    let processes = Processes([7: 7_000, 900: 9_000])
    let first = record(owner: 900, ownerStart: 9_000, processes)
    _ = WebAccessibility(releaseGraceMs: 0, record: first).enable(pid: 7, launched: launched, connection: 1, access: Chrome().access)
    processes.set(900, nil)
    let folder = directory + "/enablement/"
    let write = { (name: String, text: String) in try Data(text.utf8).write(to: URL(fileURLWithPath: folder + name)) }
    try write("3-3000.json", "{\"pid\": 3, \"start\"")  // cut short
    try write("4-4000.json", "{\"pid\":4,\"start\":4000,\"attribute\":\"AXFocused\",\"ownerPid\":900,\"ownerStart\":9000}")  // no enablement attribute
    try write("5-1.json", "{\"pid\":6,\"start\":6000,\"attribute\":\"\(eui)\",\"ownerPid\":900,\"ownerStart\":9000}")  // filed under another name
    try write(".7-7000.json.tmp", "{")  // a writer that died before its rename
    let restores = Restores()
    var lines: [String] = []
    let report = WebAccessibility(record: record(owner: 901, ownerStart: 9_100, processes, restores: restores, log: { lines.append($0) })).restoreRecorded()
    XCTAssertEqual(report?.skipped, 3)
    XCTAssertEqual(restores.written, ["7 \(eui)=false"], "the readable entry is restored; a malformed one names nothing")
    XCTAssertEqual(lines.filter { $0.contains("unreadable or malformed") }.count, 3)
    XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: folder).sorted(), [".7-7000.json.tmp", "3-3000.json", "4-4000.json", "5-1.json"])
    let none = EnablementRecord(directory: directory + "/absent", ownerPid: 901, ownerStart: 9_100, startTime: processes.start,
                                writeFalse: restores.write).restore()
    XCTAssertEqual(none, EnablementRestore(), "no record at all: nothing to do")
  }

  func testConcurrentWritersKeepEveryEntry() {
    let count = 200
    let processes = Processes(Dictionary(uniqueKeysWithValues: (0..<count).map { (pid_t(1_000 + $0), Int64(50_000 + $0)) }))
    let writers = [record(owner: 900, ownerStart: 9_000, processes), record(owner: 901, ownerStart: 9_100, processes)]
    DispatchQueue.concurrentPerform(iterations: count) { i in
      XCTAssertEqual(writers[i % 2].add(pid: pid_t(1_000 + i), start: Int64(50_000 + i), attribute: eui), .recorded(Int64(50_000 + i)))
    }
    let entries = writers[0].entries()
    XCTAssertEqual(entries.count, count)
    XCTAssertEqual(entries.compactMap(\.entry).count, count, "every file whole")
    for case let entry? in entries.map(\.entry) {
      XCTAssertEqual(entry.ownerPid, (entry.pid - 1_000) % 2 == 0 ? 900 : 901)
      XCTAssertEqual(entry.start, Int64(50_000 + entry.pid - 1_000))
    }
  }

  func testAFailedRestoreKeepsTheEntryForTheNextStart() {
    let processes = Processes([7: 7_000, 900: 9_000])
    let first = record(owner: 900, ownerStart: 9_000, processes)
    _ = WebAccessibility(releaseGraceMs: 0, record: first).enable(pid: 7, launched: launched, connection: 1, access: Chrome().access)
    processes.set(900, nil)
    let restores = Restores()
    restores.answer = .cannotComplete  // a hung Chrome past the messaging timeout
    let report = WebAccessibility(record: record(owner: 901, ownerStart: 9_100, processes, restores: restores)).restoreRecorded()
    XCTAssertEqual(report?.failed, 1)
    XCTAssertEqual(filed(first), [entry(7, 7_000)])
    restores.answer = .success
    XCTAssertEqual(WebAccessibility(record: record(owner: 903, ownerStart: 9_300, processes, restores: restores)).restoreRecorded()?.restored,
                   [entry(7, 7_000)], "the next start retries it")
    XCTAssertEqual(filed(first), [])
  }

  func testTheRestoreStopsAtItsBudgetAndLeavesTheRestForTheNextStart() {
    let processes = Processes([7: 7_000, 8: 8_000, 9: 9_500, 900: 9_000])
    let first = record(owner: 900, ownerStart: 9_000, processes)
    let web = WebAccessibility(releaseGraceMs: 0, record: first)
    for pid: pid_t in [7, 8, 9] { _ = web.enable(pid: pid, launched: launched, connection: 1, access: Chrome().access) }
    processes.set(900, nil)
    let restores = Restores()
    restores.costMs = 1_500  // each write waits most of a hung app's timeout
    let report = record(owner: 901, ownerStart: 9_100, processes, restores: restores).restore(budgetMs: 2_000)
    XCTAssertEqual(restores.written, ["7 \(eui)=false", "8 \(eui)=false"], "the third would start past 2 s")
    XCTAssertEqual(report.deferred, 1)
    XCTAssertEqual(filed(first), [entry(9, 9_500)])
    XCTAssertEqual(enablementRestoreBudgetMs, 2_000)
    XCTAssertEqual(enablementRestoreTimeout, 0.5)
  }

  // The review of 81a43091..bc44b120 (three P2s).

  func testAPidAnotherProcessTookSinceTheObservationIsNeitherRecordedNorWritten() {
    // The identity is the start time read with the process's first observation: a pid reused between the false read
    // and the filing would name the replacement, which the next start would write false after a crash.
    let processes = Processes([7: 7_000, 900: 9_000])
    let first = record(owner: 900, ownerStart: 9_000, processes)
    let web = WebAccessibility(releaseGraceMs: 0, record: first)
    let chrome = Chrome()
    chrome.duringRead = { processes.set(7, 7_001) }  // Chrome quits and another launch takes its pid
    XCTAssertNil(web.enable(pid: 7, launched: launched, connection: 1, access: chrome.access))
    XCTAssertNil(web.enable(pid: 7, launched: launched, connection: 1, access: chrome.access), "still not the process observed")
    XCTAssertEqual(chrome.writes, [], "nothing written to the replacement")
    XCTAssertEqual(filed(first), [], "nothing filed under its start")
    XCTAssertEqual(first.add(pid: 7, start: nil, attribute: eui), .otherProcess, "no captured identity: not filed")
  }

  func testARestoredPidReusedMeanwhileInheritsNoWriteBack() {
    // The write-back memory is filed under the restored entry's own process: a pid reused during the restore must not
    // be re-enabled as the engine's (A3) and later written false.
    let processes = Processes([7: 7_000, 900: 9_000])
    let first = record(owner: 900, ownerStart: 9_000, processes)
    _ = WebAccessibility(releaseGraceMs: 0, record: first).enable(pid: 7, launched: launched, connection: 1, access: Chrome().access)
    processes.set(900, nil)
    let restores = Restores()
    let reused = record(owner: 901, ownerStart: 9_100, processes, restores: restores,
                        generation: { [launched] _ in processes.set(7, 7_001); return launched })
    let next = WebAccessibility(releaseGraceMs: 0, record: reused)
    XCTAssertEqual(next.restoreRecorded()?.restored, [entry(7, 7_000)], "the write went to the recorded process")
    let replacement = Chrome()
    replacement.value = true  // another client's, in the new launch
    XCTAssertNil(next.enable(pid: 7, launched: launched, connection: 1, access: replacement.access))
    next.release(connection: 1)
    XCTAssertEqual(replacement.writes, [], "not taken for the process the restore wrote back")
  }

  func testAnUncertainWriteIsRolledBackAndOnlyThenItsEntryRemoved() {
    // -25208 with a read back that fails: it may have taken. The rollback's success settles it.
    let processes = Processes([7: 7_000, 900: 9_000])
    let first = record(owner: 900, ownerStart: 9_000, processes)
    let web = WebAccessibility(releaseGraceMs: 0, record: first)
    let chrome = Chrome()
    chrome.unreadableAfterWrite = true
    XCTAssertNil(web.enable(pid: 7, launched: launched, connection: 1, access: chrome.access))
    XCTAssertEqual(chrome.writes, [true, false], "rolled back")
    XCTAssertEqual(filed(first), [])
    XCTAssertFalse(web.enablementHolds(pid: 7, launched: launched))
  }

  func testAnUncertainWriteWhoseRollbackFailsKeepsItsEntryAndOwnership() {
    let processes = Processes([7: 7_000, 900: 9_000])
    let first = record(owner: 900, ownerStart: 9_000, processes)
    var failures: [String] = []
    let web = WebAccessibility(releaseGraceMs: 0, releaseFailed: { failures.append($0) }, record: first)
    let chrome = Chrome()
    chrome.unreadableAfterWrite = true
    chrome.answers = [.notImplemented, .cannotComplete]  // the rollback times out
    XCTAssertNil(web.enable(pid: 7, launched: launched, connection: 1, access: chrome.access))
    XCTAssertEqual(filed(first), [entry(7, 7_000)], "kept: a crash now leaves it for the next start")
    XCTAssertEqual(failures.count, 1, "logged")
    XCTAssertNil(web.enable(pid: 7, launched: launched, connection: 1, access: chrome.access), "owned: not written again")
    XCTAssertEqual(chrome.writes, [true, false])
    web.release(connection: 1)
    XCTAssertEqual(chrome.writes, [true, false, false], "the release writes it back")
    XCTAssertEqual(filed(first), [])
  }

  func testAFailedManualAccessibilityWriteIsUncertainThoughItReadsBackFalse() {
    // The re-review: Electron's AXManualAccessibility getter keeps reading false after the enablement (#244), so a
    // write answering a timeout may have taken while it reads back false. It is rolled back, or kept owned.
    let processes = Processes([7: 7_000, 900: 9_000])
    let first = record(owner: 900, ownerStart: 9_000, processes)
    let web = WebAccessibility(releaseGraceMs: 0, releaseFailed: { _ in }, record: first)
    let electron = Chrome()
    electron.names = ["AXManualAccessibility"]
    electron.computedFalse = true
    electron.answers = [.cannotComplete, .cannotComplete]  // the write and its rollback time out
    electron.answer = .success
    XCTAssertNil(web.enable(pid: 7, launched: launched, connection: 1, access: electron.access))
    XCTAssertEqual(electron.writes, [true, false], "rolled back though it reads false")
    let manual = EnablementRecordEntry(pid: 7, start: 7_000, attribute: "AXManualAccessibility", ownerPid: 900, ownerStart: 9_000)
    XCTAssertEqual(filed(first), [manual], "kept: the rollback failed")
    web.release(connection: 1)
    XCTAssertEqual(electron.writes, [true, false, false], "owned, so the release writes it back")
    XCTAssertEqual(filed(first), [])
    XCTAssertFalse(enablementReadBackConfirms("AXManualAccessibility"))
    XCTAssertTrue(enablementReadBackConfirms(eui), "Chrome's EUI reads back what it holds")
  }

  func testTheKernelStartTimeIsExactAndGoneWithItsProcess() throws {
    let me = try XCTUnwrap(processStartMicros(pid: getpid()))
    XCTAssertEqual(processStartTime(pid: getpid())?.timeIntervalSince1970 ?? 0, Double(me) / 1_000_000, accuracy: 0.000_001)
    let child = Process()
    child.executableURL = URL(fileURLWithPath: "/usr/bin/true")
    try child.run()
    child.waitUntilExit()
    XCTAssertNil(processStartMicros(pid: child.processIdentifier))
  }
}
