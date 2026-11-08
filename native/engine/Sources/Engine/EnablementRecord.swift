import AppKit
import ApplicationServices
import Foundation
import os

// The enablement record (#293): what survives an engine that runs no release. #292 writes an owned enablement back at
// end_task, at the engine's stop and after its grace, but an engine killed with SIGKILL, or one that crashes, runs none,
// and Chrome keeps AXEnhancedUserInterface (its complete accessibility mode, its screen-reader flag and animated window
// moves) for its whole life. So the engine records every process whose attribute it owns (Enablement.swift's A3 rule:
// only one it read false, or wrote back itself, then set), in its own state directory beside engine.sock, one file per
// process, `enablement/<pid>-<start>.json`: the target's pid and kernel start time (microseconds), the attribute
// written, and the owning engine's pid and start time. The file is written before the attribute is set (an engine
// killed between the two leaves an entry for a process that read false, whose write back is harmless) and removed
// once the write back is done or the process has ended. Each file is written whole to a temporary name and renamed
// into place, so a writer that dies mid-write leaves at most a temporary file no reader takes, and never touches
// another process's entry. No fsync: the record serves only while its target runs, and a machine crash ends the target
// too.
// At its start, after the lock and before the socket is bound (so before any connection), the engine restores what a
// dead engine left: an entry whose owner is gone (no process at its pid with its start time) and whose target still
// runs at the recorded start time gets the attribute written false, under a messaging timeout, and is dropped; an entry
// whose target is gone, or whose pid now belongs to another process, is dropped with nothing written; a live owner's
// entry is left alone, its enablement being that engine's to release. Nothing the record does not name, by pid and start
// time together, is ever written. An unreadable or malformed entry is skipped with a log line, never fatal; a write
// that fails, and every entry past the restore's budget, is kept for the next start.

private let recordLog = Logger(subsystem: "io.github.ssfskim.cua.engine", category: "enablement")

/// The attribute a restore may write: the two the enablement sets (`enablementAttribute`), never another a file names.
private let restorableAttributes: Set<String> = ["AXManualAccessibility", "AXEnhancedUserInterface"]

/// The messaging timeout of a restore's write, so a hung app costs the start a bounded wait.
let enablementRestoreTimeout: Float = 0.5
/// How long a start spends restoring before it leaves the remaining entries for the next start.
let enablementRestoreBudgetMs: Double = 2_000

/// The kernel's start time of process `pid` in microseconds since 1970 (`kp_proc.p_starttime`); nil when there is no
/// such process. Exact, so it can be written and compared as an integer.
func processStartMicros(pid: pid_t) -> Int64? {
  var info = kinfo_proc()
  var size = MemoryLayout<kinfo_proc>.stride
  var name: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, pid]
  guard sysctl(&name, u_int(name.count), &info, &size, nil, 0) == 0, size > 0, info.kp_proc.p_pid == pid else { return nil }
  let start = info.kp_proc.p_starttime
  return Int64(start.tv_sec) * 1_000_000 + Int64(start.tv_usec)
}

/// One process whose enablement an engine owns.
struct EnablementRecordEntry: Codable, Equatable, Sendable {
  /// The target process and its kernel start time (`processStartMicros`).
  var pid: Int32
  var start: Int64
  /// The attribute written true: AXManualAccessibility or AXEnhancedUserInterface.
  var attribute: String
  /// The engine that owns it, and its start time.
  var ownerPid: Int32
  var ownerStart: Int64

  var fileName: String { "\(pid)-\(start).json" }
}

/// What a start's restore did with the record.
struct EnablementRestore: Equatable {
  /// Written false and dropped.
  var restored: [EnablementRecordEntry] = []
  /// Dropped with nothing written: the target is gone, or its pid is another process's.
  var dropped = 0
  /// A live owner's, left alone.
  var live = 0
  /// Unreadable or malformed, skipped and kept.
  var skipped = 0
  /// The write failed: kept for the next start.
  var failed = 0
  /// Past the budget: kept for the next start.
  var deferred = 0
}

/// The record's file store and the process access it needs (seams: the unit tests give a scratch directory, fake start
/// times and a fake write).
final class EnablementRecord: @unchecked Sendable {
  let directory: String
  /// The engine writing: its pid and start time.
  let ownerPid: pid_t
  let ownerStart: Int64
  /// `processStartMicros`.
  let startTime: (pid_t) -> Int64?
  /// Writes `attribute` false on process `pid`'s application element, bounded by `enablementRestoreTimeout`.
  let writeFalse: (pid_t, String) -> AXError
  /// The process's generation as the enablement keys it (`processGeneration`), so a restored process is remembered as
  /// written back.
  let generation: (pid_t) -> Date?
  private let now: () -> Double
  private let log: (String) -> Void

  init(directory: String, ownerPid: pid_t, ownerStart: Int64, startTime: @escaping (pid_t) -> Int64?,
       writeFalse: @escaping (pid_t, String) -> AXError, generation: @escaping (pid_t) -> Date? = { _ in nil },
       now: @escaping () -> Double = monotonicMilliseconds,
       log: @escaping (String) -> Void = { recordLog.notice("\($0, privacy: .public)") }) {
    self.directory = directory
    self.ownerPid = ownerPid
    self.ownerStart = ownerStart
    self.startTime = startTime
    self.writeFalse = writeFalse
    self.generation = generation
    self.now = now
    self.log = log
  }

  /// The running engine's record in `directory`.
  static func live(directory: String) -> EnablementRecord {
    let me = getpid()
    return EnablementRecord(
      directory: directory, ownerPid: me, ownerStart: processStartMicros(pid: me) ?? 0, startTime: processStartMicros,
      writeFalse: { pid, attribute in
        let application = AXUIElementCreateApplication(pid)
        AXUIElementSetMessagingTimeout(application, enablementRestoreTimeout)
        return gatedWrite(application, attribute, kCFBooleanFalse)
      },
      generation: { pid in processGeneration(launchDate: NSRunningApplication(processIdentifier: pid)?.launchDate, pid: pid) },
      log: { line in
        recordLog.notice("\(line, privacy: .public)")
        FileHandle.standardError.write(Data("cua-engine: \(line)\n".utf8))
      })
  }

  /// Records that this engine owns `attribute` on process `pid`, before it is written. Answers the start time the entry
  /// is filed under, or nil when nothing was recorded (no such process, or the file could not be written: logged).
  func add(pid: pid_t, attribute: String) -> Int64? {
    guard let start = startTime(pid) else { return nil }
    let entry = EnablementRecordEntry(pid: pid, start: start, attribute: attribute, ownerPid: ownerPid, ownerStart: ownerStart)
    do {
      if mkdir(directory, 0o700) != 0 && errno != EEXIST { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
      try JSONEncoder().encode(entry).write(to: URL(fileURLWithPath: directory + "/" + entry.fileName), options: .atomic)
      return start
    } catch {
      log("enablement record: cannot write \(entry.fileName): \(error.localizedDescription); a crash would leave \(attribute) on")
      return nil
    }
  }

  /// The entry of process `pid` filed under `start` is done with: its write back is made, or the process ended.
  func remove(pid: pid_t, start: Int64) {
    unlink(directory + "/\(pid)-\(start).json")
  }

  /// Every entry file in the directory, in name order, each decoded, or nil when it cannot be read or does not hold a
  /// well-formed entry filed under its own name and naming one of the two attributes.
  func entries() -> [(file: String, entry: EnablementRecordEntry?)] {
    let names = ((try? FileManager.default.contentsOfDirectory(atPath: directory)) ?? []).filter { $0.hasSuffix(".json") }.sorted()
    return names.map { name in
      let data = FileManager.default.contents(atPath: directory + "/" + name)
      let entry = data.flatMap { try? JSONDecoder().decode(EnablementRecordEntry.self, from: $0) }
      guard let entry, entry.fileName == name, restorableAttributes.contains(entry.attribute) else { return (name, nil) }
      return (name, entry)
    }
  }

  /// The start's restore (the header). Bounded: each write by its messaging timeout, the whole by `budgetMs`.
  func restore(budgetMs: Double = enablementRestoreBudgetMs) -> EnablementRestore {
    var report = EnablementRestore()
    let began = now()
    for (file, entry) in entries() {
      guard let entry else {
        report.skipped += 1
        log("enablement record: \(file) is unreadable or malformed; skipped")
        continue
      }
      if startTime(entry.ownerPid) == entry.ownerStart {
        report.live += 1  // its engine still runs: its enablement to release
        continue
      }
      guard startTime(entry.pid) == entry.start else {
        report.dropped += 1  // the target ended, or its pid is another process's now: nothing to write
        remove(pid: entry.pid, start: entry.start)
        continue
      }
      guard now() - began < budgetMs else {
        report.deferred += 1
        continue
      }
      let answer = writeFalse(entry.pid, entry.attribute)
      // Chrome answers the write back with kAXErrorNotImplemented and acts on it (#292): done.
      if answer == .success || answer == .notImplemented {
        remove(pid: entry.pid, start: entry.start)
        report.restored.append(entry)
        log("enablement record: wrote \(entry.attribute) false on pid \(entry.pid), left on by engine pid \(entry.ownerPid), which is gone")
      } else {
        report.failed += 1
        log("enablement record: writing \(entry.attribute) false on pid \(entry.pid) failed (\(answer.rawValue)); kept for the next start")
      }
    }
    if report.deferred > 0 { log("enablement record: \(report.deferred) entries past the \(Int(budgetMs)) ms budget; kept for the next start") }
    return report
  }
}
