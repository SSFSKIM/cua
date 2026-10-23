import CoreFoundation
import CoreGraphics
import Foundation

// User intervention (the spec's Design, "User intervention"; R/F-helper-logic.md §9, R/sky-behaviour.md §18 and §23.4).
// The engine yields to the human: a listen-only event tap at the annotated session level on the vendor's five event
// types (left, right and other mouse down, scroll wheel, key down; the monitoring loop FUN_1000aec08, F §9.2) attributes
// each event to an app by the owner of the window under it (private field 51), else by the event's target pid, with no
// frontmost test (resolveTarget FUN_1000ae58c, F §9.3), and excludes the engine's own events by source pid (field 41
// against getpid(), FUN_1000aed38; the second sitting measured the engine's own pid-posted events reaching the tap, U6,
// so the exclusion is load-bearing). An event attributed to an app a connection drives renews that app's 5 s debounce
// and sets the connection's sticky re-query flag (registerUserInterruptedIntervention 0x1000a248c, F §9.1), which only a
// get_app_state completed after the debounce has expired clears (clearUserInterruptedInterventionAfterStateRequery
// 0x1000a2e5c; the critique of 2026-10-19, R/sky-behaviour.md §23.4).
//
// What cua does with it, two declared differences from the vendor (whose gate FUN_10014db0c waits out the debounce for
// up to 100 s and never stops an action in flight, F §9.5): every input request is refused at once while the debounce is
// live, or while the re-query flag is set, before preparation or input; and an action in flight stops at the next
// check between its events. Both keep code -10016, but report their phase and possible effects separately (#212).
//
// The tap needs Input Monitoring (the owner's decision of 2026-10-20, U5: without the grant a tap is created but receives
// nothing). The engine never requests the grant: it reads the non-prompting preflight, and without it detection is off,
// which every input result reports (`intervention: "off"`). The callback reads exactly the event's type, source pid,
// target pid and window id (TapEventFields, pinned by a unit test), never a key code, characters or a location; the
// arrival time it stamps is the engine's clock. The tap starts when a connection first drives an app with the grant
// present, and is torn down once no connection drives any app (the last driving connection closed).

/// The vendor's debounce, 5 s (`userInteractionDebounceDuration`, built by ComputerUseAppInstanceManager's
/// once-initialiser FUN_1000a0904, F §9.1).
let interventionDebounceMs: Int64 = 5_000

/// The five event types the vendor's monitor taps (F §9.2): moves, drags, ups, key-up and flags-changed do not count.
let interventionEventMask = (1 << CGEventType.leftMouseDown.rawValue) | (1 << CGEventType.rightMouseDown.rawValue)
  | (1 << CGEventType.otherMouseDown.rawValue) | (1 << CGEventType.scrollWheel.rawValue) | (1 << CGEventType.keyDown.rawValue)

/// Everything the tap's callback may read of one event, and nothing else (a unit test pins this set): the type and the
/// three pids.
struct TapEventFields: Equatable {
  let type: CGEventType
  let sourcePID: pid_t  // field 41
  let targetPID: pid_t  // field 40
  let windowID: Int64   // field 51, private
}

/// Reads the fields the callback touches from an event. This is the only read path; nothing else touches an event's
/// content.
func tapFields(_ event: CGEvent) -> TapEventFields {
  TapEventFields(
    type: event.type,
    sourcePID: pid_t(truncatingIfNeeded: event.getIntegerValueField(eventField(41))),
    targetPID: pid_t(truncatingIfNeeded: event.getIntegerValueField(eventField(40))),
    windowID: event.getIntegerValueField(eventField(51)))
}

/// The driven process an event is attributed to, by the vendor's rule (F §9.3): none for the engine's own (source pid);
/// else the owner of the event's window when the window exists, else the target pid; and only a process some connection
/// drives. An event whose window belongs to an undriven app is not attributed, even when its target pid is driven.
func attributedPid(_ fields: TapEventFields, enginePID: pid_t, isDriven: (pid_t) -> Bool, windowOwner: (Int64) -> pid_t?) -> pid_t? {
  guard fields.sourcePID != enginePID else { return nil }
  let app = (fields.windowID != 0 ? windowOwner(fields.windowID) : nil) ?? fields.targetPID
  return app > 0 && isDriven(app) ? app : nil
}

/// The owner of a window by its id, read from the window list (owner pid only; no window name is read).
func windowOwnerPid(_ windowID: Int64) -> pid_t? {
  guard let id = CGWindowID(exactly: windowID),
        let list = CGWindowListCopyWindowInfo(.optionIncludingWindow, id) as? [[String: Any]],
        let entry = list.first(where: { ($0[kCGWindowNumber as String] as? NSNumber)?.uint32Value == id }),
        let owner = entry[kCGWindowOwnerPID as String] as? NSNumber else { return nil }
  return pid_t(owner.int32Value)
}

/// A process's last attributed event: the ledger's sequence number at it and its arrival (Unix ms, the engine's clock).
struct AttributedEvent: Equatable {
  let sequence: Int
  let at: Int64
}

/// Whether the debounce an event started is still live at `now` (the vendor's isDebouncing 0x1000a0cc8: a deadline
/// exists and lies ahead).
func isDebouncing(_ last: AttributedEvent?, now: Int64) -> Bool {
  guard let last else { return false }
  return now < last.at + interventionDebounceMs
}

/// What the intervention rule answers an input request: the debounce first, then the connection's re-query flag (the
/// vendor's gate order, F §9.5). `cleared` is the sequence the connection's flag was last cleared at (or it began driving
/// the app at): an attributed event after it sets the flag.
enum InterventionVerdict: Equatable {
  case proceed, stillInteracting, userChanged
}

func interventionVerdict(last: AttributedEvent?, cleared: Int, now: Int64) -> InterventionVerdict {
  guard let last else { return .proceed }
  if isDebouncing(last, now: now) { return .stillInteracting }
  return last.sequence > cleared ? .userChanged : .proceed
}

/// A pre-action refusal is the only no-effects guarantee. An in-flight check can follow preparation outside the
/// ordinary action interval; it conservatively reports possible effects, not an atomic cancellation or rollback.
enum InterruptionPhase: String {
  case beforeEffects = "before-effects", inFlight = "in-flight"
}

private func interruptionError(_ app: String, phase: InterruptionPhase) -> EngineError {
  let outcome = phase == .beforeEffects ? "Action refused before any effects." : "Action interrupted after possible effects. Preparation or input may already have affected the app; already dispatched input may still complete. Effects were not rolled back."
  return EngineError(.userIntervened,
                     "\(outcome) Input attributed to '\(app)' triggered the intervention guard; its source is not proven human. Do not retry automatically. Let the user finish, then call getAXState() and inspect the outcome before deciding on another action.",
                     extra: ["meta": ["interruption": ["phase": phase.rawValue, "effects": [String]()]]])
}

func stillInteracting(_ app: String) -> EngineError {
  interruptionError(app, phase: .beforeEffects)
}

func userChanged(_ app: String, phase: InterruptionPhase = .inFlight) -> EngineError {
  interruptionError(app, phase: phase)
}

/// The attributed events of driven processes, shared by the tap's thread and every connection's thread.
final class InterventionLedger: @unchecked Sendable {
  private let lock = NSLock()
  private var sequence = 0
  private var drivers: [pid_t: Set<Int>] = [:]
  private var last: [pid_t: AttributedEvent] = [:]

  /// Connection `connection` drives `pid` from now on; answers the sequence now, which a connection that has just begun
  /// driving the app takes as its cleared point (events before it are not its interventions).
  @discardableResult
  func drive(_ pid: pid_t, connection: Int) -> Int {
    lock.lock()
    defer { lock.unlock() }
    drivers[pid, default: []].insert(connection)
    return sequence
  }

  func isDriven(_ pid: pid_t) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    return drivers[pid] != nil
  }

  /// An event the tap attributed to `pid`, recorded only while some connection drives it.
  func record(_ pid: pid_t, at: Int64) {
    lock.lock()
    defer { lock.unlock() }
    guard drivers[pid] != nil else { return }
    sequence += 1
    last[pid] = AttributedEvent(sequence: sequence, at: at)
  }

  func lastEvent(_ pid: pid_t) -> AttributedEvent? { lastEvent(among: [pid]) }

  /// The latest event attributed to any of an app's processes (its own and a panel service's).
  func lastEvent(among pids: Set<pid_t>) -> AttributedEvent? {
    lock.lock()
    defer { lock.unlock() }
    return Self.latest(pids.compactMap { last[$0] })
  }

  func clearPoint(_ pid: pid_t, now: Int64) -> Int? { clearPoint(among: [pid], now: now) }

  /// The sequence a completed observation clears the flag to: now's, when the debounce of the app's processes has expired
  /// at `now`; nil (the flag stays) while it is live. Read under one lock, so no event slips between the test and the
  /// sequence.
  func clearPoint(among pids: Set<pid_t>, now: Int64) -> Int? {
    lock.lock()
    defer { lock.unlock() }
    return isDebouncing(Self.latest(pids.compactMap { last[$0] }), now: now) ? nil : sequence
  }

  private static func latest(_ events: [AttributedEvent]) -> AttributedEvent? { events.max { $0.sequence < $1.sequence } }

  /// Forgets a closed connection; a process no connection drives any longer loses its record. Answers whether any
  /// process is still driven.
  func release(connection: Int) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    for (pid, connections) in drivers {
      let remaining = connections.subtracting([connection])
      if remaining.isEmpty {
        drivers[pid] = nil
        last[pid] = nil
      } else {
        drivers[pid] = remaining
      }
    }
    return !drivers.isEmpty
  }
}

/// One input request's intervention checks, the one place every input method calls: `checkBeforePosting` before anything
/// is posted (refusing while the debounce is live or the re-query flag is set), then `checkInFlight` between the events
/// of a sequence (stopping at the first event attributed since the check). The reading is taken once, when the guard is
/// made, so the input meta can carry it (`hidIdleMs`) on a refusal too. With detection off both pass and the meta says so.
struct InterventionGuard {
  let detection: Bool
  /// What the rule answered when the guard was made.
  let verdict: InterventionVerdict
  /// The request's own app string, which the sentences name.
  let app: String
  /// The last attributed event's sequence at the check (0 when none).
  let start: Int
  /// The app's last attributed event now.
  let latest: () -> AttributedEvent?
  /// The app's last attributed event at the check, for `hidIdleMs`.
  let lastAtCheck: AttributedEvent?

  /// Detection off (no Input Monitoring grant, or no tap): every check passes.
  static func off(app: String) -> InterventionGuard {
    InterventionGuard(detection: false, verdict: .proceed, app: app, start: 0, latest: { nil }, lastAtCheck: nil)
  }

  /// The guard for a request at `now`, the connection's flag cleared at `cleared`.
  static func reading(app: String, cleared: Int, now: Int64, latest: @escaping () -> AttributedEvent?) -> InterventionGuard {
    let last = latest()
    return InterventionGuard(detection: true, verdict: interventionVerdict(last: last, cleared: cleared, now: now), app: app,
                             start: last?.sequence ?? 0, latest: latest, lastAtCheck: last)
  }

  /// The guard, refusing at once when its verdict does (the tests' shorthand for `reading` then `checkBeforePosting`).
  static func check(app: String, cleared: Int, now: Int64, latest: @escaping () -> AttributedEvent?) throws -> InterventionGuard {
    let guarding = reading(app: app, cleared: cleared, now: now, latest: latest)
    try guarding.checkBeforePosting()
    return guarding
  }

  /// The pre-action check: a refusal before this action's preparation or input.
  func checkBeforePosting() throws {
    switch verdict {
    case .stillInteracting: throw stillInteracting(app)
    case .userChanged: throw userChanged(app, phase: .beforeEffects)
    case .proceed: return
    }
  }

  /// Between two events of a sequence: an event attributed to the app since the check stops the action.
  func checkInFlight() throws {
    guard detection, (latest()?.sequence ?? 0) != start else { return }
    throw userChanged(app)
  }

  /// The milliseconds from the app's last attributed event to `receivedAt`; nil when none was attributed while the app
  /// was driven (or detection is off, where the caller keeps the machine-wide reading).
  func idleMilliseconds(at receivedAt: Int64) -> Int? {
    lastAtCheck.map { Int(max(0, receivedAt - $0.at)) }
  }
}

/// The resident tap and the ledger it feeds; the engine's for the process's lifetime.
final class InterventionMonitor: @unchecked Sendable {
  let ledger = InterventionLedger()
  /// The Input Monitoring grant, read with the non-prompting preflight only (the request variant would raise a prompt).
  private let listenGranted: () -> Bool
  /// False for the tests' monitor: detection runs with no tap, its events arriving through `note` only.
  private let createsTap: Bool
  private let lock = NSLock()
  private var tap: CFMachPort?
  private var runLoop: CFRunLoop?

  init(listenGranted: @escaping () -> Bool = { CGPreflightListenEventAccess() }, createsTap: Bool = true) {
    self.listenGranted = listenGranted
    self.createsTap = createsTap
  }

  /// Connection `connection` drives `pid`, with detection on: the grant reads true and the tap runs, created now when it
  /// does not. Answers the ledger's sequence now (the cleared point of a drive that just began), or nil when detection is
  /// off. Without the grant nothing is created: a tap made then receives nothing (U5), so detection would only look on.
  /// Under the same lock as the teardown, so a drive never lands on a tap a closing connection is tearing down.
  func drive(_ pid: pid_t, connection: Int) -> Int? {
    guard listenGranted() else { return nil }
    lock.lock()
    defer { lock.unlock() }
    guard !createsTap || tap != nil || start() else { return nil }
    return ledger.drive(pid, connection: connection)
  }

  /// A closed connection's drives end; the tap is torn down once no connection drives any app. The tap thread's loop
  /// ends; a callback already running finds no port to re-enable.
  func release(connection: Int) {
    lock.lock()
    let idle = !ledger.release(connection: connection)
    let port = idle ? tap : nil, loop = idle ? runLoop : nil
    if idle {
      tap = nil
      runLoop = nil
    }
    lock.unlock()
    if let port {
      CGEvent.tapEnable(tap: port, enable: false)
      CFMachPortInvalidate(port)
    }
    if let loop { CFRunLoopStop(loop) }
  }

  /// One tapped event: attributed and recorded, or dropped.
  func note(_ fields: TapEventFields, at arrival: Int64) {
    guard let pid = attributedPid(fields, enginePID: getpid(), isDriven: ledger.isDriven, windowOwner: windowOwnerPid) else { return }
    ledger.record(pid, at: arrival)
  }

  /// The system disabled the tap (a timeout or user input): re-enabled while it is still the running one, as the
  /// vendor's tap re-enables itself (FUN_1007222b8, F §9.2).
  private func reenable() {
    lock.lock()
    defer { lock.unlock() }
    if let tap { CGEvent.tapEnable(tap: tap, enable: true) }
  }

  /// Creates the tap on its own thread and run loop; called under `lock`. False when the tap could not be created.
  private func start() -> Bool {
    // The monitor outlives every tap (it is the engine's for the process's lifetime), so the callback's unretained
    // reference never dangles.
    nonisolated(unsafe) let pointer = Unmanaged.passUnretained(self).toOpaque()
    let box = Box<(port: CFMachPort, loop: CFRunLoop)>()
    let ready = DispatchSemaphore(value: 0)
    let thread = Thread {
      guard let port = CGEvent.tapCreate(tap: .cgAnnotatedSessionEventTap, place: .tailAppendEventTap, options: .listenOnly,
                                         eventsOfInterest: CGEventMask(interventionEventMask), callback: InterventionMonitor.callback,
                                         userInfo: pointer) else {
        ready.signal()
        return
      }
      if let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, port, 0) {
        CFRunLoopAddSource(CFRunLoopGetCurrent(), source, CFRunLoopMode.commonModes)
      }
      CGEvent.tapEnable(tap: port, enable: true)
      box.value = (port, CFRunLoopGetCurrent())
      ready.signal()
      CFRunLoopRun()  // returns when stop() stops the loop
    }
    thread.name = "cua-engine intervention tap"
    thread.start()
    ready.wait()
    guard let created = box.value else { return false }
    tap = created.port
    runLoop = created.loop
    return true
  }

  /// The callback: reads only the pinned fields and the clock; the event passes on untouched (listen-only).
  private static let callback: CGEventTapCallBack = { _, type, event, userInfo in
    guard let userInfo else { return Unmanaged.passUnretained(event) }
    let monitor = Unmanaged<InterventionMonitor>.fromOpaque(userInfo).takeUnretainedValue()
    if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
      monitor.reenable()
    } else {
      monitor.note(tapFields(event), at: unixMilliseconds())
    }
    return Unmanaged.passUnretained(event)
  }
}

extension ConnectionState {
  /// This connection drives `app` (by its lineage key) from the ledger's sequence `now` on: its cleared point is set the
  /// first time. Answers the cleared point.
  func markDriven(_ key: String, now: Int) -> Int {
    if let cleared = interventionCleared[key] { return cleared }
    interventionCleared[key] = now
    return now
  }
}

extension Engine {
  /// The intervention guard of an input request on `app` (process `pid`), which also starts driving it: the caller puts
  /// its reading into the meta, calls `checkBeforePosting` before anything is posted and `checkInFlight` between the
  /// events of the sequence. `requestApp` is the request's own app string, which the sentences name (the bound path when
  /// the request named a pid). The reading covers every process the connection drives for the app: its own and those an
  /// observation of it met, so a click the user makes on a panel served by another process (an Open panel) counts.
  func interventionGuard(app: ResolvedApp, pid: pid_t, requestApp: String?, connection: ConnectionState) -> InterventionGuard {
    let name = String((requestApp ?? app.appPath).prefix(1024))
    guard let now = intervention.drive(pid, connection: connection.id) else { return .off(app: name) }
    let ledger = intervention.ledger
    let cleared = connection.markDriven(app.key, now: now)
    connection.driveProcesses(app.key, [pid])
    // Read on every check, so a target's process registered after the guard was made (`actionTargets`) counts in flight.
    return InterventionGuard.reading(app: name, cleared: cleared, now: unixMilliseconds(),
                                     latest: { ledger.lastEvent(among: connection.interventionProcesses[app.key] ?? [pid]) })
  }

  /// The process an action's events go to (the owner of its target element, the keyboard's focused process), driven for
  /// `app` from now on when detection is on: the user's own events on it then stop the action in flight and count against
  /// the next one.
  func actionTargets(_ owner: pid_t, app: ResolvedApp, connection: ConnectionState) {
    guard let processes = connection.interventionProcesses[app.key], !processes.contains(owner),
          intervention.drive(owner, connection: connection.id) != nil else { return }
    connection.driveProcesses(app.key, [owner])
  }

  /// An observation of `app` begins: the connection drives it from now on (events during the observation count).
  func observationBegins(_ app: ResolvedApp, pid: pid_t, connection: ConnectionState) {
    guard let now = intervention.drive(pid, connection: connection.id) else { return }
    _ = connection.markDriven(app.key, now: now)
    connection.driveProcesses(app.key, [pid])
  }

  /// The observation has read the app, meeting `owners` (the processes serving its elements: a panel's service among
  /// them): they are driven for the app from now on, and the re-query flag's clearing is taken now, when the tree the
  /// model will see was read, so an event after the read is not cleared by it. The clearing applies only once the
  /// observation answers (`observationAnswered`); one that fails after the read (its screenshot) leaves the flag set.
  func observationRead(_ app: ResolvedApp, owners: Set<pid_t>, connection: ConnectionState) -> PendingClearing {
    guard let processes = connection.interventionProcesses[app.key] else { return PendingClearing(key: app.key, point: nil) }
    let driven = owners.subtracting(processes).filter { intervention.drive($0, connection: connection.id) != nil }
    let all = connection.driveProcesses(app.key, driven)
    // The flag clears only when the debounce has expired by now (the model's re-query while the user still works leaves
    // it set, so the next action is refused rather than posted into their work).
    return PendingClearing(key: app.key, point: intervention.ledger.clearPoint(among: all, now: unixMilliseconds()))
  }

  /// Runs the rest of an observation after its read, `finish` (the screenshot's join), and clears the re-query flag only
  /// when it answers: a failed observation leaves the model without the state the flag asks it to re-query.
  func observationAnswered<Answer>(_ clearing: PendingClearing, connection: ConnectionState, _ finish: () throws -> Answer) rethrows -> Answer {
    let answer = try finish()
    connection.clearIntervention(clearing.key, point: clearing.point)
    return answer
  }

  /// A connection closed: its drives end, and the tap is torn down once no connection drives any app.
  func connectionClosed(_ connection: ConnectionState) {
    intervention.release(connection: connection.id)
  }
}

/// An observation's clearing of the re-query flag, taken when it read the app and applied when it answers.
struct PendingClearing {
  let key: String
  /// The ledger sequence to clear to; nil while the debounce is live (or the app is not driven), leaving the flag set.
  let point: Int?
}

extension ConnectionState {
  /// Adds `pids` to the processes driven for the app `key`; answers them all.
  @discardableResult
  func driveProcesses(_ key: String, _ pids: Set<pid_t>) -> Set<pid_t> {
    interventionProcesses[key, default: []].formUnion(pids)
    return interventionProcesses[key]!
  }

  /// A completed observation's clearing: to `point` when the debounce had expired (a nil point leaves the flag set), and
  /// only for an app this connection drives.
  func clearIntervention(_ key: String, point: Int?) {
    guard interventionCleared[key] != nil, let point else { return }
    interventionCleared[key] = point
  }
}
