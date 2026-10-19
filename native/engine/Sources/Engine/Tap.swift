import CoreFoundation
import CoreGraphics
import Foundation

// The event tap of probe (d) (the spec's Design, "User intervention"; R/F-helper-logic.md §9.2, R/sky-behaviour.md §18),
// M0's counting probe only: a listen-only tap at the annotated session level on the vendor's five event types (left,
// right and other mouse down, scroll wheel, key down), existing only for the probe's duration. Per event its callback
// reads exactly the type, the timestamp, the source pid (field 41), the target pid (field 40) and the window id
// (private field 51) — never a key code, characters or a stored location — and counts the event as the engine's own
// (source pid), as the driven app's (the window owner is the driven app, or the target pid is when no window is
// present) or as other, the last as counts only. The full intervention behaviour (stopping a sequence in flight, the
// pre-action refusal, the re-query lock) is M2a. The tap is reachable as the spike-only `probe_tap` method
// {op: "start", app, seconds ≤ 600} / {op: "stop"}, one at a time, auto-stopped at its deadline; `stop` returns the
// counts, the times of the own and driven events and the HID idle time. The listen grant is checked with the
// non-prompting preflight only: the design assumes the Input Monitoring grant is never held, and the request variant
// would raise its prompt.

/// The five event types the vendor's monitor taps (F §9.2): moves, drags, ups, key-up and flags-changed do not count.
let tapEventMask = (1 << CGEventType.leftMouseDown.rawValue) | (1 << CGEventType.rightMouseDown.rawValue)
  | (1 << CGEventType.otherMouseDown.rawValue) | (1 << CGEventType.scrollWheel.rawValue) | (1 << CGEventType.keyDown.rawValue)

/// Everything the tap's callback may read of one event, and nothing else (a unit test pins this set).
struct TapEventFields: Equatable {
  let type: CGEventType
  let timestamp: Int64  // uptime nanoseconds
  let sourcePID: pid_t  // field 41
  let targetPID: pid_t  // field 40
  let windowID: Int64   // field 51, private
}

/// Reads the fields the callback touches from an event. This is the only read path; nothing else in the probe touches
/// an event's content.
func tapFields(_ event: CGEvent) -> TapEventFields {
  TapEventFields(
    type: event.type,
    timestamp: Int64(event.timestamp),
    sourcePID: pid_t(truncatingIfNeeded: event.getIntegerValueField(eventField(41))),
    targetPID: pid_t(truncatingIfNeeded: event.getIntegerValueField(eventField(40))),
    windowID: event.getIntegerValueField(eventField(51)))
}

/// Which class an event falls in, from its fields and the driven app's pid: the engine's own by source pid, the driven
/// app's by window owner (or by target pid when no window is present), everything else as counts only.
enum TapEventClass: String {
  case own, driven, other

  static func of(_ fields: TapEventFields, drivenPID: pid_t, enginePID: pid_t, windowOwner: (Int64) -> pid_t?) -> TapEventClass {
    if fields.sourcePID == enginePID { return .own }
    if fields.windowID != 0 {
      if windowOwner(fields.windowID) == drivenPID { return .driven }
    } else if fields.targetPID == drivenPID {
      return .driven
    }
    return .other
  }
}

/// The counting state the callback updates, behind a lock; owned by the probe while the tap runs.
final class TapCounts: @unchecked Sendable {
  let drivenPID: pid_t
  private let lock = NSLock()
  private var counts: [String: [String: Int]] = [:]
  private var ownTimes: [Int64] = []
  private var drivenTimes: [Int64] = []
  private var windowOwners: [Int64: pid_t] = [:]

  init(drivenPID: pid_t) { self.drivenPID = drivenPID }

  /// The window's owner, from the window list, cached for the probe's duration.
  func windowOwner(_ windowID: Int64) -> pid_t? {
    lock.lock()
    if let known = windowOwners[windowID] { lock.unlock(); return known }
    lock.unlock()
    guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return nil }
    var found: pid_t?
    for info in list {
      guard let number = (info[kCGWindowNumber as String] as? NSNumber)?.int64Value else { continue }
      let owner = (info[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value
      lock.lock()
      windowOwners[number] = owner.map { pid_t($0) }
      lock.unlock()
      if number == windowID { found = owner.map { pid_t($0) } }
    }
    return found
  }

  /// One event counted: its type name, its class, and its arrival time for the classes the report carries times for.
  func record(_ fields: TapEventFields, enginePID: pid_t) {
    let eventClass = TapEventClass.of(fields, drivenPID: drivenPID, enginePID: enginePID, windowOwner: windowOwner)
    let name = TapProbe.typeNames[Int(fields.type.rawValue)] ?? "type\(fields.type.rawValue)"
    lock.lock()
    counts[name, default: [:]][eventClass.rawValue, default: 0] += 1
    let time = unixMilliseconds()
    if eventClass == .own, ownTimes.count < 1000 { ownTimes.append(time) }
    if eventClass == .driven, drivenTimes.count < 1000 { drivenTimes.append(time) }
    lock.unlock()
  }

  var report: [String: Any] {
    lock.lock()
    defer { lock.unlock() }
    return [
      "counts": counts,
      "ownTimes": ownTimes,
      "drivenTimes": drivenTimes,
      "drivenPID": Int(drivenPID),
      "hidIdleMs": hidIdleMilliseconds(),
    ]
  }
}

/// The resident probe: one tap at a time, on its own thread and run loop, torn down by `stop`, the deadline or the
/// process's exit (whichever comes first).
final class TapProbe: @unchecked Sendable {
  static let shared = TapProbe()
  static let typeNames: [Int: String] = [
    Int(CGEventType.leftMouseDown.rawValue): "leftMouseDown", Int(CGEventType.rightMouseDown.rawValue): "rightMouseDown",
    Int(CGEventType.otherMouseDown.rawValue): "otherMouseDown", Int(CGEventType.scrollWheel.rawValue): "scrollWheel",
    Int(CGEventType.keyDown.rawValue): "keyDown",
  ]

  private let lock = NSLock()
  private var counts: TapCounts?
  private var countsPointer: UnsafeMutableRawPointer?
  private var tap: CFMachPort?
  private var tapRunLoop: CFRunLoop?
  private var created = false
  private var listenAccess = false
  private var startedAt: Int64 = 0

  /// Starts the tap for the driven app. Answers {created, listenAccess, running, startedAt, seconds}; a tap already
  /// running is refused. When the tap cannot be created the answer says so with the listen grant's state, and nothing
  /// is left behind.
  func start(drivenPID: pid_t, seconds: Int) throws -> [String: Any] {
    lock.lock()
    defer { lock.unlock() }
    guard tap == nil && counts == nil else { throw EngineError(name: "tapBusy", "A probe tap is already running; stop it first") }
    listenAccess = CGPreflightListenEventAccess()  // the non-prompting preflight only; the request variant would raise a prompt
    let counting = TapCounts(drivenPID: drivenPID)
    let pointer = Unmanaged.passRetained(counting).toOpaque()
    let box = Box<(created: Bool, runLoop: CFRunLoop?, tap: CFMachPort?)>()
    let done = DispatchSemaphore(value: 0)
    let thread = Thread {
      let port = CGEvent.tapCreate(tap: .cgAnnotatedSessionEventTap, place: .tailAppendEventTap, options: .listenOnly,
                                  eventsOfInterest: CGEventMask(tapEventMask), callback: TapProbe.callback, userInfo: pointer)
      if let port {
        if let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, port, 0) {
          CFRunLoopAddSource(CFRunLoopGetCurrent(), source, CFRunLoopMode.commonModes)
        }
        CGEvent.tapEnable(tap: port, enable: true)
        box.value = (true, CFRunLoopGetCurrent(), port)
        done.signal()
        CFRunLoopRun()  // returns when the loop is stopped (probe_tap stop) or the sources are gone
      } else {
        box.value = (false, nil, nil)
        done.signal()
      }
    }
    thread.name = "cua-engine-probe-tap"
    thread.start()
    done.wait()
    created = box.value?.created ?? false
    startedAt = unixMilliseconds()
    if created {
      counts = counting
      countsPointer = pointer
      tap = box.value?.tap
      tapRunLoop = box.value?.runLoop
    } else {
      Unmanaged<TapCounts>.fromOpaque(pointer).release()
      throw EngineError(name: "tapNotCreated",
                        "The listen-only event tap could not be created (the Input Monitoring listen grant is \(listenAccess ? "granted" : "not granted")).")
    }
    DispatchQueue.global().asyncAfter(deadline: .now() + .seconds(seconds)) { [weak self] in _ = try? self?.stop() }
    return ["created": true, "listenAccess": listenAccess, "running": true, "startedAt": Int(startedAt), "seconds": seconds]
  }

  /// Stops the tap and answers the report; nothing running is an error.
  func stop() throws -> [String: Any] {
    lock.lock()
    defer { lock.unlock() }
    guard let counting = counts, let pointer = countsPointer else { throw EngineError(name: "tapNotRunning", "No probe tap is running") }
    if let tap, let runLoop = tapRunLoop {
      CGEvent.tapEnable(tap: tap, enable: false)
      CFRunLoopStop(runLoop)  // the tap's own loop ends; the port and the counting state release below
      CFMachPortInvalidate(tap)
    }
    counts = nil
    countsPointer = nil
    tap = nil
    tapRunLoop = nil
    Unmanaged<TapCounts>.fromOpaque(pointer).release()
    var report = counting.report
    report["created"] = created
    report["listenAccess"] = listenAccess
    report["startedAt"] = Int(startedAt)
    report["stoppedAt"] = Int(unixMilliseconds())
    return report
  }

  /// The callback: reads only the pinned fields, counts, and passes the event on untouched (listen-only).
  private static let callback: CGEventTapCallBack = { _, _, event, userInfo in
    if let userInfo {
      let counting = Unmanaged<TapCounts>.fromOpaque(userInfo).takeUnretainedValue()
      counting.record(tapFields(event), enginePID: getpid())
    }
    return Unmanaged.passUnretained(event)
  }
}

extension Engine {
  /// The spike-only `probe_tap` method: start {app | pid, seconds?} for the driven app, stop for the report.
  func probeTap(_ params: [String: Any]) throws -> [String: Any] {
    switch params["op"] as? String {
    case "start":
      let app = try resolveApp(params)
      guard let pid = app.pid else { throw EngineError(.runningApplicationNotFound, "Running application not found: \(app.displayName)") }
      let seconds = (params["seconds"] as? NSNumber)?.intValue ?? 60
      guard (1...600).contains(seconds) else { throw EngineError.invalidArguments("seconds must be between 1 and 600") }
      var answer = try TapProbe.shared.start(drivenPID: pid, seconds: seconds)
      answer["app"] = app.appWire
      return answer
    case "stop":
      return try TapProbe.shared.stop()
    default:
      throw EngineError.invalidArguments("probe_tap needs op \"start\" or \"stop\"")
    }
  }
}
