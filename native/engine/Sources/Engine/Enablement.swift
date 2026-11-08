import AppKit
import ApplicationServices
import Foundation
import os

// Enablement (the spec's Design, "Observation (skyshot)"; F §1.7, §1.9). An application element that lists
// AXManualAccessibility gets it set (Electron, Chromium), else one that lists AXEnhancedUserInterface gets that, never
// both. An observation reads the attribute and sets it when it does not read true (the vendor's rule); once the engine
// has set and owns it (below), later observations of that process generation neither read nor write it, as the
// vendor's per-(app, kind) assertion writes once (Decision Log, #244, 2026-11-01, reversing the critique of 2026-10-19,
// A3, which had withdrawn the once-per-process memory). Electron's getter is computed and keeps reading false, so a
// re-read could not see a reset, and every write restarts Electron's 2 s countdown to its complete mode and fires the
// app's `accessibility-support-changed`; the trade is that a process resetting the attribute itself keeps a missing tree
// until the next release, as with the vendor. A value that read true or could not be read is not owned and is read
// again at every observation. Before the enablement, every observation of an eligible app reads the application
// element's role (`observeEnablement`), which gives Chromium and Electron their Basic mode, and the page's tree, at
// once; that mode lasts the app's lifetime and nothing releases it (a declared difference the vendor shares).
// cua's departures: enablement is set only on web-shaped apps (F §1.7's detection) and the vendor's named bundles
// (`com.apple.iWork*`, `com.spotify.client`), where the vendor sets AXEnhancedUserInterface on any app that lists it in
// its full-UI context, since that attribute changes how an AppKit app (the owner's Finder) behaves while it stays set
// (Decision Log, T1's re-review); and the engine **releases** what it set, writing the attribute back to false at
// whichever comes first (#292): the end of the task of the last connection that observed or acted on the process
// (end_task, the `endTask` request), the engine's stop (a shutdown request or a termination signal; an engine killed
// with SIGKILL, or one that crashes, leaves it on until the next engine's start writes it back from the enablement
// record, #293, EnablementRecord.swift), or `enablementReleaseGraceMs` (30 s) after cua's last observation of or input to the process, whether or not a
// connection is still open (a model that never calls end_task keeps its connection until the 15-minute idle stop); a
// new observation or input within that grace starts it again, and one after it sets the attribute again, owned, an
// input included (`inputEnablement`). It owns, and so releases, only an attribute it read false and then set: one
// that read true, or could not be read, may be VoiceOver's or another assistive client's and is never written back. A
// write that answers kAXErrorNotImplemented (-25208) counts as set when the attribute reads true right after it, and a
// write back that answers it counts as done: Chrome lists AXEnhancedUserInterface (AXManualAccessibility is
// Electron's) and answers its write so while acting on it, its complete mode arriving about 2.2 s later (#288's hosted
// spike; #282's and #283's texts took that answer for a failed AXManualAccessibility write). A failed write back is
// logged and retried at a later close or the stop. The release is a declared difference, since the vendor never unsets,
// and a web app left in full-accessibility mode after cua is done is interference (A3). Once the engine has written a process's attribute
// back, the next observation of that process sets it again, owned, whatever it reads: Chromium's attribute reads true
// after the write-back (AppKit's readback, not Chromium's mode; Surprises, M2a.5 hold), so the rule of setting only
// what does not read true would leave the page's tree gone (Decision Log 2026-10-22). The first observation after
// enabling, and every observation of a Chromium window until a web area has been seen in the process, waits 100 ms and
// then up to 1 s for an AXWebArea to appear. The vendor's Spotify fake activation before enabling is route 3's and is
// not done here.

private let enablementLog = Logger(subsystem: "io.github.ssfskim.cua.engine", category: "enablement")

/// How long an owned enablement outlives cua's last observation of or input to its process, short of an end_task or the
/// engine's stop (#292): long enough that a model's pause between steps does not pay Chrome's 2.2 s debounce again; 0
/// releases at the close of the last connection that observed the process instead.
let enablementReleaseGraceMs: Double = 30_000

let webAreaLeadMs: UInt32 = 100
let webAreaWaitMs = 1_000.0
let webAreaPollMs: UInt32 = 50
private let webAreaSearchLimit = 1_000

/// Whether an app's Info.plist makes it web-shaped (F §1.7): a URL type with the `http` scheme, or Electron's or
/// Chromium's principal class.
func webShaped(info: [String: Any]) -> Bool {
  if let principal = info["NSPrincipalClass"] as? String, principal == "AtomApplication" || principal == "BrowserCrApplication" { return true }
  let types = info["CFBundleURLTypes"] as? [[String: Any]] ?? []
  return types.contains { ($0["CFBundleURLSchemes"] as? [String] ?? []).contains { $0.lowercased() == "http" } }
}

/// Whether an app is Chromium's or Electron's by its Info.plist's principal class: the apps whose page posts no
/// accessibility notifications until web accessibility is on, so a paste trusts their notifications only while #244's
/// enablement holds (Paste.swift `notificationSource`).
func chromiumFamily(info: [String: Any]) -> Bool {
  guard let principal = info["NSPrincipalClass"] as? String else { return false }
  return principal == "AtomApplication" || principal == "BrowserCrApplication"
}

/// Whose web engine an app's pages are, by its Info.plist's principal class (#313): Chromium's (`chromiumFamily`),
/// Gecko's (Firefox's `GeckoNSApplication`, #287's recon), or neither, where a page is WebKit's (Safari, a WKWebView).
enum PageEngine: Equatable { case chromium, gecko, other }

func pageEngineOf(info: [String: Any]) -> PageEngine {
  if chromiumFamily(info: info) { return .chromium }
  return info["NSPrincipalClass"] as? String == "GeckoNSApplication" ? .gecko : .other
}

/// Whether an app is enabled at all: web-shaped, or one of the bundles the vendor enables by name (F §1.9).
func enablementEligible(bundleIdentifier: String?, webShaped: Bool) -> Bool {
  if webShaped { return true }
  guard let id = bundleIdentifier?.lowercased() else { return false }
  return id.hasPrefix("com.apple.iwork") || id == "com.spotify.client"
}

/// The attribute the vendor's rule sets on an application listing `names`: AXManualAccessibility when listed, else
/// AXEnhancedUserInterface when listed, else none. Never both.
func enablementAttribute(listed names: [String]) -> String? {
  if names.contains("AXManualAccessibility") { return "AXManualAccessibility" }
  if names.contains("AXEnhancedUserInterface") { return "AXEnhancedUserInterface" }
  return nil
}

/// Whether an observation waits for a web area (the spec's Observation paragraph): after enabling, or on a Chromium
/// window, until a web area has been seen in the process. cua's departure: the vendor waits on every Chromium
/// observation (about 145 ms each on the MacBook shakedown); a window whose web area went away is the settle's busy
/// veto's case (an unloaded AXWebArea).
func webAreaWaitNeeded(switchOn: Bool, enabledNow: Bool, chromium: Bool, seen: Bool) -> Bool {
  switchOn && (enabledNow || chromium) && !seen
}

/// A process's generation, which keys the enablement's per-process state with its pid so a later process reusing the
/// pid is another: LaunchServices' launch date, else (an app launched without LaunchServices, a dev `electron .`) the
/// kernel's start time; nil when neither can be read.
func processGeneration(launchDate: Date?, pid: pid_t) -> Date? {
  launchDate ?? processStartTime(pid: pid)
}

/// The kernel's start time of process `pid` (`kp_proc.p_starttime`); nil when there is no such process.
func processStartTime(pid: pid_t) -> Date? {
  processStartMicros(pid: pid).map { Date(timeIntervalSince1970: Double($0 / 1_000_000) + Double($0 % 1_000_000) / 1_000_000) }
}

/// How the enablement reaches one process's application element: its attribute names (nil while they cannot be read,
/// a process still launching), its role read (`observeEnablement`; the values are not used), one attribute's Boolean
/// value (nil when unreadable), a write, and whether the process is still the one observed (a pid an ended process left
/// behind may be another launch's by the time of a release).
struct EnablementAccess: @unchecked Sendable {
  var listed: () -> [String]?
  var readRole: () -> Void
  var read: (String) -> Bool?
  var write: (String, Bool) -> AXError
  var current: () -> Bool

  /// The application element of process `pid`, of generation `launched` (`processGeneration`).
  static func live(pid: pid_t, launched: Date?) -> EnablementAccess {
    let application = prepare(AXUIElementCreateApplication(pid))
    return EnablementAccess(
      listed: {
        var names: CFArray?
        return AXUIElementCopyAttributeNames(application, &names) == .success ? (names as? [String] ?? []) : nil
      },
      readRole: {
        var values: CFArray?
        let names = [kAXRoleAttribute, kAXSubroleAttribute, kAXRoleDescriptionAttribute] as CFArray
        _ = AXUIElementCopyMultipleAttributeValues(application, names, AXCopyMultipleAttributeOptions(rawValue: 0), &values)
      },
      read: { bool(attribute(application, $0)) },
      write: { gatedWrite(application, $0, ($1 ? kCFBooleanTrue : kCFBooleanFalse)!) },
      current: {
        NSRunningApplication(processIdentifier: pid).map { !$0.isTerminated && processGeneration(launchDate: $0.launchDate, pid: pid) == launched } ?? false
      })
  }
}

/// What an enablement attribute read before the engine touched it at an observation: the live harness's evidence that
/// a release writes back only what read false (`timings.enablementPrior`); `owned` when nothing was read, because the
/// engine set and owns the attribute since an earlier observation of the process.
enum EnablementPrior: Equatable {
  case readTrue, readFalse, unreadable, owned

  init(_ read: Bool?) { self = read.map { $0 ? .readTrue : .readFalse } ?? .unreadable }

  var wire: String {
    switch self {
    case .readTrue: return "true"
    case .readFalse: return "false"
    case .unreadable: return "unreadable"
    case .owned: return "owned"
    }
  }
}

/// One process's enablement as the engine left it. `io` serializes the process's reads and writes, so a release's write
/// and a new observation's read never interleave; the fields are touched only under it.
private final class EnabledProcess: @unchecked Sendable {
  let io = NSLock()
  let access: EnablementAccess
  /// The attribute the process lists (`enablementAttribute`), once its names could be read; `.some(nil)`: neither.
  var listed: String??
  /// The attribute the engine set after reading it false, which it releases and, until then, neither reads nor writes
  /// again; nil otherwise.
  var owned: String?
  /// Whether the attribute is on as the engine last left or read it: owned, written true, or read true (another
  /// client's); false once written back. What a paste's trust in the process's notifications keys on (#187).
  var on = false
  /// Whether the process's generation is known; a write-back is remembered only then, since a key of the pid alone
  /// would match a later process reusing it.
  let generationKnown: Bool
  /// The process's entry in the enablement record (#293), filed by its pid and start time, while the engine owns its
  /// attribute; nil when it does not, or none could be written.
  var recorded: (pid: pid_t, start: Int64)?
  /// The process's kernel start time as read with its first observation (#293's review): the identity its record entry
  /// is filed under, nil without a record or when it could not be read.
  let start: Int64?

  init(access: EnablementAccess, generationKnown: Bool, start: Int64? = nil) {
    self.access = access
    self.generationKnown = generationKnown
    self.start = start
  }
}

/// Per engine: which bundles are web-shaped, per process (by pid and generation, so a relaunch that reuses a pid starts
/// over) the enablement the engine set and the connections that observed it, the processes a web area was seen in, and
/// the processes whose attribute the engine wrote back and has not set again since.
final class WebAccessibility: @unchecked Sendable {
  private let lock = NSLock()
  private var webShapedByPath: [String: Bool] = [:]
  private var chromiumByPath: [String: Bool] = [:]
  private var pageEngineByPath: [String: PageEngine] = [:]
  private var webAreaSeen: Set<String> = []
  private var writtenBack: Set<String> = []
  private var processes: [String: EnabledProcess] = [:]
  private var observers: [String: Set<Int>] = [:]
  /// Per process, the writes the engine made to its attribute, true or false, by any connection; kept past the
  /// entry's retirement (`enablements`).
  private var writes: [String: UInt64] = [:]
  /// Per process, its first observation's time, moved to every write attempt's (monotonic ms; `freshSince`).
  private var freshSinceByProcess: [String: Double] = [:]
  /// Per process, the token of the grace release armed at its last activity (#292); absent when none is armed. Every
  /// observation and input replaces it, so only the newest armed timer may release.
  private var pendingRelease: [String: Int] = [:]
  private var releaseTokens = 0
  /// Set, under `lock`, once the engine stops (`releaseAll`): from then on no enablement is written and no activity is
  /// recorded, so a request still running on a connection's thread cannot re-enable a process after the stop's reset.
  private var stopping = false
  /// Runs in a grace release between its token's first check and the entry's lock (the unit tests' seam for the review
  /// of d2568c76..96c6f093: activity landing there must not be reset underneath).
  var beforeGraceRelease: () -> Void = {}
  private let releaseGraceMs: Double
  /// Runs `work` after the given milliseconds on another thread (the grace release's timer).
  private let schedule: (Double, @escaping @Sendable () -> Void) -> Void
  /// Told (a bounded, value-free line) when a reset of the attribute the engine set fails; it stays owned.
  private let releaseFailed: (String) -> Void
  /// The enablement record (#293, EnablementRecord.swift): every owned attribute filed before its write and removed
  /// once written back, so the next engine restores what a SIGKILL or a crash left on. Nil keeps no record (the unit
  /// tests' engines).
  private let record: EnablementRecord?

  init(releaseGraceMs: Double = enablementReleaseGraceMs,
       schedule: @escaping (Double, @escaping @Sendable () -> Void) -> Void = { ms, work in
         DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + .microseconds(Int(ms * 1000)), execute: work)
       },
       releaseFailed: @escaping (String) -> Void = { enablementLog.error("\($0, privacy: .public)") },
       record: EnablementRecord? = nil) {
    self.releaseGraceMs = releaseGraceMs
    self.schedule = schedule
    self.releaseFailed = releaseFailed
    self.record = record
  }

  /// The engine's start (#293), before any connection: restores what dead engines left on (`EnablementRecord.restore`)
  /// and remembers each restored process as written back, under its own generation and only while its pid still runs the
  /// entry's process (`currentGeneration`), so its next observation sets the attribute again, owned, whatever it reads
  /// (Chromium's readback after a write-back, Decision Log 2026-10-22). Nil without a record.
  @discardableResult
  func restoreRecorded() -> EnablementRestore? {
    guard let record else { return nil }
    let report = record.restore()
    let keys = report.restored.compactMap { entry in record.currentGeneration(of: entry).map { Self.process(entry.pid, $0) } }
    lock.lock()
    writtenBack.formUnion(keys)
    lock.unlock()
    return report
  }

  /// The connections observing a process now.
  func observers(pid: pid_t, launched: Date?) -> Set<Int> {
    lock.lock()
    defer { lock.unlock() }
    return observers[Self.process(pid, launched)] ?? []
  }

  private static func process(_ pid: pid_t, _ launched: Date?) -> String { "\(pid)@\(launched?.timeIntervalSince1970 ?? 0)" }

  /// How many times the engine has written a process's enablement attribute, from any connection. An observation reads
  /// it before its settles and after its enablement step: a change means a settled tree was read before the process's
  /// accessibility changed (`adoptsSettledTree`), which the observation's own `enabledNow` does not show once another
  /// connection owns the attribute.
  func enablements(pid: pid_t, launched: Date?) -> UInt64 {
    lock.lock()
    defer { lock.unlock() }
    return writes[Self.process(pid, launched)] ?? 0
  }

  /// Since when the process's accessibility may still be coming up (monotonic ms), or nil when no observation reached
  /// its enablement: the later of its first observation by any connection and the engine's last attempt to write its
  /// attribute, successful or not (#282's hosted runs: a page checkbox's AXPress came 1.6 to 1.7 s after the first
  /// observation, and on Chrome for Testing the write answers -25208 while Chrome reaches its complete mode anyway, 1.1
  /// to 1.6 s after the observation; #292).
  func freshSince(pid: pid_t, launched: Date?) -> Double? {
    lock.lock()
    defer { lock.unlock() }
    return freshSinceByProcess[Self.process(pid, launched)]
  }

  func hasSeenWebArea(pid: pid_t, launched: Date?) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    return webAreaSeen.contains(Self.process(pid, launched))
  }

  func noteWebArea(pid: pid_t, launched: Date?) {
    lock.lock()
    defer { lock.unlock() }
    webAreaSeen.insert(Self.process(pid, launched))
  }

  func isWebShaped(_ appPath: String) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    if let known = webShapedByPath[appPath] { return known }
    let info = (NSDictionary(contentsOfFile: appPath + "/Contents/Info.plist") as? [String: Any]) ?? [:]
    let shaped = webShaped(info: info)
    webShapedByPath[appPath] = shaped
    return shaped
  }

  /// `chromiumFamily` of the app at `appPath`, read once per path.
  func isChromiumFamily(_ appPath: String) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    if let known = chromiumByPath[appPath] { return known }
    let info = (NSDictionary(contentsOfFile: appPath + "/Contents/Info.plist") as? [String: Any]) ?? [:]
    let chromium = chromiumFamily(info: info)
    chromiumByPath[appPath] = chromium
    return chromium
  }

  /// `pageEngine` of the app at `appPath`, read once per path.
  func pageEngine(_ appPath: String) -> PageEngine {
    lock.lock()
    defer { lock.unlock() }
    if let known = pageEngineByPath[appPath] { return known }
    let info = (NSDictionary(contentsOfFile: appPath + "/Contents/Info.plist") as? [String: Any]) ?? [:]
    let engine = pageEngineOf(info: info)
    pageEngineByPath[appPath] = engine
    return engine
  }

  /// Whether the process's enablement holds now (#187): its attribute owned by the engine, or written or read true at
  /// its last observation, and not written back since. False for a process no connection has observed, whose role
  /// read alone (Basic mode) is not counted.
  func enablementHolds(pid: pid_t, launched: Date?) -> Bool {
    lock.lock()
    let entry = processes[Self.process(pid, launched)]
    lock.unlock()
    guard let entry else { return false }
    entry.io.lock()
    defer { entry.io.unlock() }
    return entry.on
  }

  /// getAppState's enablement step, on an eligible app only (`enablementEligible`; nil for any other, which gets
  /// neither): the application element's role read (AXRole, AXSubrole and AXRoleDescription in one request, at every
  /// observation, never cached), then `enableReporting`. Reading the role gives Chromium and Electron their Basic
  /// accessibility mode, and with it the page's tree, at once, where the attribute's complete mode lands 2 s after its
  /// write (#244; the vendor's eager `ApplicationUIElement.init(pid:)`, F §1.3). The two are timed apart, as
  /// `appRoleRead` and `enable`.
  func observeEnablement(eligible: Bool, pid: pid_t, launched: Date?, connection: Int, access: @autoclosure () -> EnablementAccess,
                         timings: inout Timings) -> (set: String?, prior: EnablementPrior?)? {
    guard eligible else { return nil }
    let access = access()
    timings.time("appRoleRead") { access.readRole() }
    let enabling = timings.time("enable") { enableReporting(pid: pid, launched: launched, connection: connection, access: access) }
    // Whether this observation attempted the write and whether it counted as set, value-free: `enablementWrite`
    // "success" | "failed", with the AXError's code as `enablementWriteError` whenever it was not success (#292: Chrome's
    // -25208 with the attribute reading true after it is a success that carries its code).
    if let written = enabling.write {
      timings.set("enablementWrite", enabling.set != nil ? "success" : "failed")
      if written != .success { timings.set("enablementWriteError", Int(written.rawValue)) }
    }
    return (enabling.set, enabling.prior)
  }

  /// An observation of an eligible process by `connection`: the connection is recorded as observing it, and the one
  /// enablement attribute the process lists is left alone while the engine owns it, else set when it does not read true
  /// now, or whatever it reads when the engine wrote it back since it last set it. Returns the attribute this call set
  /// (nil when none is listed, the names cannot be read yet, the engine owns it, it reads true, or the write failed).
  func enable(pid: pid_t, launched: Date?, connection: Int, access: EnablementAccess) -> String? {
    enableReporting(pid: pid, launched: launched, connection: connection, access: access).set
  }

  /// `enable`, also answering what the attribute read before this call touched it (`.owned` when the engine owns it
  /// and read nothing; nil when none is listed, or the names cannot be read yet), which the observation reports as
  /// `timings.enablementPrior`, and the write's AXError when this call attempted one (`write`, nil when it did not). The
  /// process's first observation, and every write attempt, successful or not, moves its `freshSince`. A write answering
  /// kAXErrorNotImplemented counts as set when the attribute reads true right after it (#292: Chrome's answer).
  /// The observation is the process's activity: its grace release is armed again from now.
  func enableReporting(pid: pid_t, launched: Date?, connection: Int, access: EnablementAccess)
    -> (set: String?, prior: EnablementPrior?, write: AXError?) {
    let key = Self.process(pid, launched)
    lock.lock()
    guard !stopping else {
      lock.unlock()
      return (nil, nil, nil)
    }
    let entry = processes[key] ?? EnabledProcess(access: access, generationKnown: launched != nil, start: record?.startTime(pid))
    processes[key] = entry
    observers[key, default: []].insert(connection)
    let token = armLocked(key)
    if freshSinceByProcess[key] == nil { freshSinceByProcess[key] = monotonicMilliseconds() }
    lock.unlock()
    scheduleLapse(key, token)

    entry.io.lock()
    defer { entry.io.unlock() }
    // The stop may have reset this entry while this observation waited for its lock: nothing is written after it.
    guard !isStopping else { return (nil, nil, nil) }
    if entry.listed == nil, let names = entry.access.listed() { entry.listed = .some(enablementAttribute(listed: names)) }
    guard let listed = entry.listed, let name = listed else { return (nil, nil, nil) }
    // Written once per owned process generation (#244): until the release writes it back, or the process ends.
    if entry.owned != nil { return (nil, .owned, nil) }
    let read = entry.access.read(name)
    let prior = EnablementPrior(read)
    lock.lock()
    let reEnabling = writtenBack.contains(key)
    lock.unlock()
    guard read != true || reEnabling else {
      // Not written: on only when it read true and that is not AppKit's readback after the engine's own write-back.
      entry.on = read == true && !reEnabling
      return (nil, prior, nil)
    }
    // Owned, and so released later, only when it read false (A3): an unreadable value may be another client's. A value
    // the engine itself wrote back is its own whatever it reads now. What will be owned is recorded before the write
    // (#293), so an engine killed right after the write leaves an entry the next start restores.
    // The entry is filed under the identity captured with the process's first observation (`EnabledProcess.start`):
    // a pid another process took since is neither recorded nor written.
    let owning = read == false || reEnabling
    var recorded: (pid: pid_t, start: Int64)?
    if owning, let record {
      switch record.add(pid: pid, start: entry.start, attribute: name) {
      case .recorded(let start): recorded = (pid, start)
      case .notWritten: break  // logged; the enablement goes ahead, unrecorded
      case .otherProcess:
        entry.on = false
        return (nil, prior, nil)
      }
    }
    let written = entry.access.write(name, true)
    lock.lock()
    freshSinceByProcess[key] = monotonicMilliseconds()
    lock.unlock()
    let after = written == .success ? true : entry.access.read(name)
    guard written == .success || (written == .notImplemented && after == true) else {
      entry.on = false
      // Not set. Read back false, nothing took: the entry goes. An owned write whose outcome is uncertain (it reads
      // true or cannot be read after a failing answer) is rolled back; a rollback that fails too keeps the ownership
      // and the entry, so a release or the next start writes it back.
      guard owning, after != false else {
        if let recorded { record?.remove(pid: recorded.pid, start: recorded.start) }
        return (nil, prior, written)
      }
      if [.success, .notImplemented].contains(entry.access.write(name, false)) {
        if let recorded { record?.remove(pid: recorded.pid, start: recorded.start) }
        lock.lock()
        if entry.generationKnown { writtenBack.insert(key) }
        lock.unlock()
      } else {
        entry.owned = name
        entry.recorded = recorded
        lock.lock()
        writtenBack.remove(key)
        lock.unlock()
        releaseFailed("enablement write uncertain and its rollback failed: \(name) on pid \(pid); kept owned for a later release")
      }
      return (nil, prior, written)
    }
    entry.on = true
    lock.lock()
    writes[key, default: 0] += 1
    if owning {
      entry.owned = name
      entry.recorded = recorded
      writtenBack.remove(key)
    }
    lock.unlock()
    return (name, prior, written)
  }

  /// Activity on a process by `connection` (#292): an input, or an observation's or input's end. The connection counts
  /// as observing the process, and its grace release is armed again from now. Nothing for a process the engine has no
  /// enablement state for.
  func noteActivity(pid: pid_t, launched: Date?, connection: Int) {
    let key = Self.process(pid, launched)
    lock.lock()
    guard !stopping, processes[key] != nil else {
      lock.unlock()
      return
    }
    observers[key, default: []].insert(connection)
    let token = armLocked(key)
    lock.unlock()
    scheduleLapse(key, token)
  }

  /// An input's enablement step (#292, the design session's ruling 5c2f27a3): in a Chromium-family process the
  /// observation's role read and `enableReporting`, so an action after a grace release with no observation since sets
  /// the attribute again, owned (the write-back is remembered), and the write moves `freshSince`, which opens #282's and
  /// #283's re-reads; in any other process, `noteActivity`.
  func inputEnablement(chromium: Bool, pid: pid_t, launched: Date?, connection: Int, access: @autoclosure () -> EnablementAccess) {
    guard chromium else { return noteActivity(pid: pid, launched: launched, connection: connection) }
    let access = access()
    access.readRole()
    _ = enableReporting(pid: pid, launched: launched, connection: connection, access: access)
  }

  /// A new grace token for `key`, replacing any armed one (under `lock`); nil with a grace of 0, which arms nothing.
  private func armLocked(_ key: String) -> Int? {
    guard releaseGraceMs > 0 else { return nil }
    releaseTokens += 1
    pendingRelease[key] = releaseTokens
    return releaseTokens
  }

  private func scheduleLapse(_ key: String, _ token: Int?) {
    guard let token else { return }
    schedule(releaseGraceMs) { [weak self] in self?.graceLapsed(key, token) }
  }

  /// `connection` stops observing (it closed, or its task ended). A process it observed or acted on that no other
  /// connection does is released at once when `immediately` (the task's end, `endTask`), when the grace is 0, or when
  /// no grace is armed for it (a release that failed: retried now); otherwise its armed grace, timed from its last
  /// activity, releases it. Answers how many processes no connection observes now.
  @discardableResult
  func release(connection: Int, immediately: Bool = false) -> Int {
    lock.lock()
    var emptied: [(String, EnabledProcess)] = []
    var now: [(String, EnabledProcess)] = []
    for (key, var set) in observers where set.contains(connection) {
      set.remove(connection)
      observers[key] = set
      guard set.isEmpty, let entry = processes[key] else { continue }
      emptied.append((key, entry))
      if immediately || releaseGraceMs <= 0 || pendingRelease[key] == nil {
        pendingRelease[key] = nil
        now.append((key, entry))
      }
    }
    lock.unlock()
    for (key, entry) in now { releaseIfUnobserved(key, entry, .unobserved) }
    return emptied.count
  }

  /// A grace release's timer fired, `releaseGraceMs` after the activity that armed it: unless newer activity took the
  /// token since, the process is released whether or not a connection still observes it (the design session's rule:
  /// 30 s after cua's last action on it). The token is checked again under the entry's lock, where the reset is made:
  /// activity takes a new token under `lock` before it touches the entry, so activity landing before the reset makes
  /// this timer stale (no reset), and activity after it waits on the entry's lock and reads after the reset, setting
  /// the attribute again, owned, since the write-back is remembered.
  private func graceLapsed(_ key: String, _ token: Int) {
    lock.lock()
    let entry = pendingRelease[key] == token ? processes[key] : nil
    lock.unlock()
    guard let entry else { return }
    beforeGraceRelease()
    releaseIfUnobserved(key, entry, .grace(token))
  }

  /// The engine stops (a shutdown request or a termination signal): it enters its stopping state under `lock` before
  /// it takes the processes, so a request still running can neither register nor write after that, and every process
  /// is released at once, whoever observes it; no grace release is left pending.
  func releaseAll() {
    lock.lock()
    stopping = true
    let all = Array(processes)
    observers = [:]
    pendingRelease = [:]
    lock.unlock()
    for (key, entry) in all { releaseIfUnobserved(key, entry, .stop) }
  }

  private var isStopping: Bool {
    lock.lock()
    defer { lock.unlock() }
    return stopping
  }

  /// Why a release runs: the last observer went (`unobserved`: skipped if one registered since), a grace token lapsed
  /// (`grace`: skipped if newer activity replaced it), or the engine stops (`stop`: always).
  private enum ReleaseCause {
    case unobserved
    case grace(Int)
    case stop
  }

  /// Writes back what the engine set on a process no connection observes now, then retires the process (with its web
  /// area, whose tree may go with the attribute, so a later enabling waits for it again), remembering the write-back so
  /// the next observation enables again. The entry stays discoverable through the reset, so an observation that begins
  /// meanwhile shares its lock and reads after the reset (setting the attribute again, owned); it is retired only
  /// afterwards, by an atomic re-check that no observer registered. A reset that fails keeps the ownership and the
  /// entry, so a later close or the shutdown retries it, and is logged; one answering kAXErrorNotImplemented counts as
  /// done (#292: Chrome answers so and drops its complete mode in 4 to 150 ms), and is not read back, since Chromium's
  /// attribute may read true after a write-back (AppKit's readback). Its cause is re-checked under the entry's lock: a
  /// grace's release and the stop's are made whether or not a connection observes the process, which is then kept, not
  /// retired.
  private func releaseIfUnobserved(_ key: String, _ entry: EnabledProcess, _ cause: ReleaseCause) {
    entry.io.lock()
    defer { entry.io.unlock() }
    switch cause {
    case .unobserved:
      guard unobserved(key) else { return }
    case .grace(let token):
      lock.lock()
      let current = pendingRelease[key] == token && !stopping
      if current { pendingRelease[key] = nil }
      lock.unlock()
      guard current else { return }
    case .stop:
      break
    }
    var reset = false
    if let owned = entry.owned {
      if !entry.access.current() {
        entry.owned = nil  // the process ended (its pid may be another launch's): nothing to write back
        entry.on = false
      } else if [.success, .notImplemented].contains(entry.access.write(owned, false)) {
        entry.owned = nil
        entry.on = false
        reset = true
      } else {
        releaseFailed("enablement release failed: \(owned) on pid \(key.prefix { $0 != "@" }); kept for a later close or shutdown")
      }
      // Written back, or the process ended: its record entry goes (#293). A failed reset keeps it with the ownership.
      if entry.owned == nil, let recorded = entry.recorded {
        record?.remove(pid: recorded.pid, start: recorded.start)
        entry.recorded = nil
      }
    }
    lock.lock()
    if reset {
      writes[key, default: 0] += 1
      webAreaSeen.remove(key)
      if entry.generationKnown { writtenBack.insert(key) }
    }
    if entry.owned == nil, observers[key]?.isEmpty ?? true, processes[key] === entry {
      observers[key] = nil
      processes[key] = nil
    }
    lock.unlock()
  }

  private func unobserved(_ key: String) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    return observers[key]?.isEmpty ?? true
  }
}

/// A Chromium window (F §1.7): web-shaped, and the window's first child lists `ChromeAXNodeId`.
func isChromiumWindow(_ window: AXUIElement) -> Bool {
  guard let first = elementList(attribute(window, kAXChildrenAttribute)).first else { return false }
  var names: CFArray?
  return AXUIElementCopyAttributeNames(prepare(first), &names) == .success && (names as? [String] ?? []).contains("ChromeAXNodeId")
}

/// The vendor's web-area wait: 100 ms, then up to 1 s polled every 50 ms for an AXWebArea under the window. True when
/// one appeared.
func waitForWebArea(under window: AXUIElement) -> Bool {
  usleep(webAreaLeadMs * 1000)
  let end = monotonicMilliseconds() + webAreaWaitMs
  while true {
    if containsWebArea(window) { return true }
    if monotonicMilliseconds() >= end { return false }
    usleep(webAreaPollMs * 1000)
  }
}

func containsWebArea(_ window: AXUIElement) -> Bool {
  let attributes = [kAXRoleAttribute, kAXChildrenAttribute] as CFArray
  var queue = [window]
  var head = 0
  while head < queue.count && head < webAreaSearchLimit {
    let element = prepare(queue[head])
    head += 1
    var values: CFArray?
    guard AXUIElementCopyMultipleAttributeValues(element, attributes, AXCopyMultipleAttributeOptions(rawValue: 0), &values) == .success,
          let slots = values as? [Any], slots.count == 2 else { continue }
    if let role = present(slots[0]), CFGetTypeID(role) == CFStringGetTypeID(), (role as! String) == "AXWebArea" { return true }
    queue.append(contentsOf: elementList(present(slots[1])))
  }
  return false
}
