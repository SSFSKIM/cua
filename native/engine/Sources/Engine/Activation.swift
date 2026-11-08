import AppKit
import ApplicationServices
import Foundation

// Route 3, fake activation (the spec's Design, "Input" route 3; R/F-helper-logic.md §5.4–5.5, R/sky-behaviour.md §12):
// the app is made to believe it is active while the user's app stays frontmost. To the target pid: an AppKit-defined
// event of subtype 1 (application activated; flags 0xC0000, the window number) plus a left click at the window's
// AXActivationPoint with route 2's recipe, the click posted there only where a hit-test shows the point inert (the window or
// chrome that is no control) and inside the window's frame (cua's declared differences, U13 and the focus hold's review),
// else at an inert point outside the frame. Around it, when another app is frontmost: screen updates held with the
// private SLSDisableUpdate/SLSReenableUpdate, released when the guard ends or, by a timer, at `activationHoldCapMs`
// (for a shared-mode pointer whose activation clicked its in-window activation point, #321 and #324:
// `activationPointHoldCapMs` after the pointer's events, never past `activationPointHoldCeilingMs` from the hold's start),
// whichever is first, so a slow guard (a raise waiting out its AX timeout included) never freezes the display for long;
// the release itself runs on a serial queue of its own, off the request path (ScreenUpdateReleases), since it blocks
// while one of the engine's own windows animates (the agent cursor's panel, #235); and a 10 ms poll for up to 1 s that
// answers the target's window ordering above the user's focused window with AXRaise on the user's window. The guard fails, and the action is
// refused as activationFailed with its own events never posted (never retried with ⌘), when the poll times out or the
// user's app loses frontmost: when the engine's own action brought the target to the front (the target's process, or
// the bound app's when the target is a panel served by another process) the user's app is made frontmost again first;
// when a third app did (most likely the user's own switch) the front is left alone. After the action's events, the
// matching deactivation (subtype 2) unless the app has really become active.
//
// Per action for synthesized clicks, drags and paste (the second sitting's ruling); held across an interaction for
// element actions and key equivalents (FocusHold.swift) and for a recorded menu (MenuSpan.swift); every one taken
// through HeldActivations, so a process's activation is shared and withdrawn only by its last holder. Only the target's
// pid and window are posted to; the vendor's per-process taps and its SystemFocusStealPreventer, which tap the user's
// own app as well, are not built. The private calls are resolved with dlsym and skipped when absent. F does not give
// the poll's exit test; here it is the user's app frontmost and the target window not above the user's on three
// consecutive samples.
//
// A hold never ends with its arm set (the Decision Log's #187 inert-click entry, 2026-11-01, amended): where the click at
// the activation point is skipped, an inert click stamped with the window's number goes outside its frame
// (`activationClickPlan`), right after subtype 1 for a route with no left mouse down of its own (and for such a holder
// joining an unconsumed hold), else before subtype 2 when the route's own left mouse down never went; it replaced the
// paste slot's outside-frame lift and its engine.json switch. A route with its own left mouse down joining a hold of its
// connection whose arm was spent early re-arms it (`HeldActivations.acquire`, the Decision Log's "#261's hold join"),
// since #282 only into a view known to accept first mouse. #282's device mode (Routes.swift) decides, per connection,
// whether a left pointer defers the inert click (shared) or takes it early (dedicated), and whether one into a Chromium
// web area is refused before subtype 1 (`refusesPointerWithoutActivationPointClick`).

/// How long the screen-update hold may last: well under the guard's 1 s poll, and above the guards the sittings
/// measured (37–58 ms, a coordinate click into TextEdit 82), so a guard of the usual length holds as the vendor's does.
let activationHoldCapMs: Double = 100
/// #321 (the design session's ruling 90ec27dd): a shared-mode pointer action (a click of any button, a drag) whose
/// activation clicked its in-window activation point. Its own mouse down then makes the target's window order itself
/// above the person's (Safari 81 of 100 clicks, TextEdit as a target too; 4 to 160 ms after the activation's first
/// event, measured on the hosted runner), so its delivery guard reads the order on, every `deliveryGuardSampleMs`, for at
/// least `activationPointGuardMinimumMs` after the events and until the order reads back as it was, and its hold is
/// released then, or by the timer at this cap even when the order never reads back. A click without that activation
/// click (Chromium's point lies outside its window) keeps `activationHoldCapMs` and `deliveryGuardMinimumMs`. Any
/// raise of this cap goes back to the design session.
///
/// #324 (the design session's ruling 8c206e91): the cap counts from the pointer's events, not the hold's start, so a
/// slow activation (#321's residue: events 133 to 201 ms into the hold, 65 ms or less of hold after them) still holds
/// 200 ms past its events; and the hold never outlasts `activationPointHoldCeilingMs` from its start, whichever comes
/// first. The worst freeze is the ceiling, on the about 2% of clicks whose activation is slow. Any raise of the ceiling
/// goes back to the design session.
let activationPointHoldCapMs: Double = 200
let activationPointHoldCeilingMs: Double = 300
let activationPointGuardMinimumMs: Double = 150
/// #324's hosted A/B (runs 42480471918, 42480982911): a release by the hold's timer came late, the real freeze a
/// median 68 ms past the 300 ms ceiling (349 to 377 ms frozen) and 26 ms past main's 200 ms cap (up to 79), while a
/// release at the guard's own end came on time (a median 0.1 ms), so the lateness is the timer's, most likely the
/// dispatch timer's coalescing in a background process with no UI. Two remedies, each one constant, both on until the
/// hosted re-measure
/// keeps the smaller (ruling eecaccfe):
/// - `holdTimerStrict`: the hold's timers are a strict dispatch source with no leeway on a queue of their own
///   (`scheduleHoldTimer`); off, the global queue's `asyncAfter` as before.
/// - `holdHoldsActivity`: the process holds a latency-critical activity (`ProcessInfo.beginActivity`, user initiated)
///   from just before SLSDisableUpdate to the hold's release, whichever path releases it (`FakeActivation.takeHold`).
let holdTimerStrict = true
let holdHoldsActivity = true
/// The strict timer's dispatch flags and leeway (`scheduleHoldTimer`).
var holdTimerFlags: DispatchSource.TimerFlags { .strict }
let holdTimerLeewayNs = 0

/// The queue the hold's strict timers fire on: its own, so no other work starves them; the release they run only
/// enqueues the re-enable (ScreenUpdateReleases).
private let holdTimerQueue = DispatchQueue(label: "cua.engine.hold-timer", qos: .userInteractive)

/// Runs `work` once, `ms` milliseconds from now: under `holdTimerStrict` by a one-shot dispatch source timer
/// (`holdTimerFlags`, `holdTimerLeewayNs`) on `holdTimerQueue`, cancelled as it fires; else as before.
func scheduleHoldTimer(_ ms: Double, _ work: @escaping @Sendable () -> Void) {
  let deadline = DispatchTime.now() + .microseconds(Int(max(0, ms) * 1000))
  guard holdTimerStrict else {
    DispatchQueue.global(qos: .userInteractive).asyncAfter(deadline: deadline, execute: work)
    return
  }
  let timer = DispatchSource.makeTimerSource(flags: holdTimerFlags, queue: holdTimerQueue)
  timer.schedule(deadline: deadline, repeating: .never, leeway: .nanoseconds(holdTimerLeewayNs))
  timer.setEventHandler {
    timer.cancel()  // a one-shot: the cancel also lets the source and this handler go
    work()
  }
  timer.resume()
}

/// How long a delivery guard waits, in real time, for its hold's SLSReenableUpdate to be called on
/// ScreenUpdateReleases' queue (`frozenMs`, #324) before it answers without it.
let screenReenableStampWaitMs: Double = 100
/// The guard's poll: every 10 ms for up to 1 s (F §5.5).
let activationGuardTimeoutMs: Double = 1_000
let activationGuardSampleMs: Double = 10
/// The consecutive stable samples the activation's guard ends on: three, or one when a delivery guard follows the
/// action's events inside the same hold and checks both again (#200).
let activationGuardStableSamples = 3
let activationGuardStableSamplesBeforeDelivery = 1
/// The delivery guard's (#200): the stable samples it ends on, and the least time it waits after the events before it
/// may end, so an app slow to handle the click still raises while the guard watches (60: the first live samples saw
/// TextEdit raise 21 and 38 ms after the click, 2026-11-01).
let deliveryGuardStableSamples = 3
let deliveryGuardMinimumMs: Double = 60
/// The delivery guard's poll inside the hold (a short sleep: the reads themselves take most of a sample under load), and
/// how long after the events a raise is still repaired once the hold is released, by the guard itself past the cap and
/// by the after-action watch on every action (#200's first live samples: the app raised 38 ms after the click, past a
/// hold that began 42 ms before it, and 21 ms after a guard that had settled at 14 ms).
let deliveryGuardSampleMs: Double = 2
let deliveryRepairWindowMs: Double = 1_000

/// SkyLight's update hold (F §11, salts 16 and 17) and the connection it takes.
private enum SkyLight {
  typealias ConnectionID = @convention(c) () -> Int32
  typealias Update = @convention(c) (Int32) -> Int32
  static let mainConnectionID: ConnectionID? = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "SLSMainConnectionID").map { unsafeBitCast($0, to: ConnectionID.self) }
  static let disableUpdate: Update? = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "SLSDisableUpdate").map { unsafeBitCast($0, to: Update.self) }
  static let reenableUpdate: Update? = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "SLSReenableUpdate").map { unsafeBitCast($0, to: Update.self) }

  /// Holds screen updates on the main connection and answers the release (nothing to release when the calls are absent).
  /// `stamp` (#324) is armed once the update is disabled, and stamped just before SLSReenableUpdate is called.
  static func hold(stamping stamp: ReenableStamp) -> () -> Void {
    guard let connection = mainConnectionID?(), let disableUpdate, let reenableUpdate else { return {} }
    _ = disableUpdate(connection)
    stamp.arm()
    return {
      stamp.stamp(monotonicMilliseconds())
      _ = reenableUpdate(connection)
    }
  }
}

/// The process holding key focus, by the private CPSGetKeyFocusProcess and the Process Manager's GetProcessPID (both
/// by dlsym; nil when either is absent or fails). CPSGetKeyFocusProcess takes a second, out Boolean (F §11's
/// `getKeyFocusProcess(_:flag:)`): called with one argument it answers 1003 while the process has no window-server
/// connection and faults once it has one, which the engine always does.
private enum KeyFocus {
  typealias GetKeyFocusProcess = @convention(c) (UnsafeMutablePointer<ProcessSerialNumber>, UnsafeMutablePointer<DarwinBoolean>) -> Int32
  typealias GetProcessPID = @convention(c) (UnsafePointer<ProcessSerialNumber>, UnsafeMutablePointer<pid_t>) -> Int32
  static let getKeyFocusProcess: GetKeyFocusProcess? = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "CPSGetKeyFocusProcess").map { unsafeBitCast($0, to: GetKeyFocusProcess.self) }
  static let getProcessPID: GetProcessPID? = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "GetProcessPID").map { unsafeBitCast($0, to: GetProcessPID.self) }

  static func pid() -> pid_t? {
    guard let getKeyFocusProcess, let getProcessPID else { return nil }
    var process = ProcessSerialNumber()
    var flag = DarwinBoolean(false)
    guard getKeyFocusProcess(&process, &flag) == 0 else { return nil }
    var pid: pid_t = 0
    return getProcessPID(&process, &pid) == 0 && pid > 0 ? pid : nil
  }
}

func frontmostPid() -> pid_t? { NSWorkspace.shared.frontmostApplication?.processIdentifier }

/// What route 3 reads and does outside its own state (the posting, the frontmost app, key focus, the screen-update hold,
/// the user's re-activation, the user's window and the window order, the activation point and the clock) as replaceable
/// calls, the real ones by default: a unit test runs the activation's sequencing through stubs, so nothing is posted,
/// activated, raised or held.
struct ActivationSystem {
  var post: (CGEvent, pid_t) -> Void = gatedPost
  var frontmost: () -> pid_t? = frontmostPid
  var keyFocus: () -> pid_t? = { KeyFocus.pid() }
  /// Answers the release, which returns at once: the re-enable runs on ScreenUpdateReleases' queue, and stamps its
  /// `ReenableStamp` as it is called (#324).
  var holdScreenUpdates: (ReenableStamp) -> () -> Void = { stamp in
    DesktopGate.allows("SLSDisableUpdate") ? ScreenUpdateReleases.shared.hold { SkyLight.hold(stamping: stamp) } : {}
  }
  var reactivate: (pid_t) -> Bool = { DesktopGate.allows("NSRunningApplication.activate") && (NSRunningApplication(processIdentifier: $0)?.activate(options: []) ?? false) }
  /// The user's focused window and its window number, the one the target's window must stay behind.
  var userWindow: (pid_t) -> (element: AXUIElement, id: CGWindowID)? = { user in
    guard let window = elementAttribute(prepare(AXUIElementCreateApplication(user)), kAXFocusedWindowAttribute),
          let id = windowNumber(of: window, pid: user, frame: frame(of: window)) else { return nil }
    return (window, id)
  }
  /// The user's front window by its number alone, from the window list (no Accessibility call on the user's app): the
  /// menu's held activation, whose restore is by activation only.
  var userWindowNumber: (pid_t) -> CGWindowID? = frontWindowNumber
  var isInFront: (CGWindowID, CGWindowID) -> Bool = windowIsInFront
  var raise: (AXUIElement) -> Void = { _ = gatedPerform($0, kAXRaiseAction) }
  var activationPoint: (AXUIElement) -> CGPoint? = { point(attribute($0, "AXActivationPoint")) }
  /// The window's frame and number as an activation reads them (the paste's; the unit tests place a window of their own).
  var windowPlacement: (AXUIElement, pid_t) -> (frame: CGRect?, id: CGWindowID?) = { window, pid in
    let windowFrame = frame(of: window)
    return (windowFrame, windowNumber(of: window, pid: pid, frame: windowFrame))
  }
  /// What the process answers at a global point (the activation click's hit-test), read from its application element.
  var hitAt: (pid_t, CGPoint) -> ActivationHit? = { pid, point in
    hitTest(application: pid, at: point).map { ActivationHit(role: attribute($0, kAXRoleAttribute) as? String, actions: establishedActionNames(of: $0)) }
  }
  var now: () -> Double = monotonicMilliseconds
  var sleep: (Double) -> Void = { usleep(UInt32(max(0, $0) * 1000)) }
  /// Seconds since the last input of any type on the HID system state: a person's input since an action's events stops
  /// the delivery guard's repairs after the hold's release.
  var secondsSinceInput: () -> Double = { CGEventSource.secondsSinceLastEventType(.hidSystemState, eventType: CGEventType(rawValue: ~0)!) }
  /// Runs `work` after the given milliseconds on another thread (the hold's cap, kept while the guard is blocked):
  /// `scheduleHoldTimer`, strict under `holdTimerStrict` (#324).
  var schedule: (Double, @escaping @Sendable () -> Void) -> Void = scheduleHoldTimer
  /// Begins the process's latency-critical activity and answers its end (#324, `holdHoldsActivity`): held for a
  /// screen-update hold's lifetime, so App Nap's timer coalescing never delays the hold's release.
  var beginLatencyCriticalActivity: () -> () -> Void = {
    let activity = ProcessInfo.processInfo.beginActivity(options: [.userInitiated, .latencyCritical], reason: "cua screen-update hold")
    return { ProcessInfo.processInfo.endActivity(activity) }
  }
  /// The wall clock the delivery record's Unix times are read on (Unix ms).
  var unixNow: () -> Int64 = unixMilliseconds
  /// Waits up to the given milliseconds of real time for a hold's re-enable stamp (#324, `ReenableStamp.wait`).
  var awaitReenable: (ReenableStamp, Double) -> Double? = { stamp, ms in stamp.wait(upToMs: ms) }

  func believesItHasFocus(_ pid: pid_t) -> Bool { frontmost() == pid || keyFocus() == pid }
}

/// The on-screen order of two windows: true when `window` is in front of `other` (CGWindowList lists front to back).
func windowIsInFront(_ window: CGWindowID, of other: CGWindowID) -> Bool {
  guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return false }
  for info in list {
    guard let number = (info[kCGWindowNumber as String] as? Int).map({ CGWindowID($0) }) else { continue }
    if number == window { return true }
    if number == other { return false }
  }
  return false
}

/// The frontmost on-screen window of `pid` in the ordinary layer (CGWindowList lists front to back); nil when it has none.
func frontWindowNumber(of pid: pid_t) -> CGWindowID? {
  guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return nil }
  for info in list where (info[kCGWindowOwnerPID as String] as? Int).map(pid_t.init) == pid && (info[kCGWindowLayer as String] as? Int) == 0 {
    if let number = info[kCGWindowNumber as String] as? Int { return CGWindowID(number) }
  }
  return nil
}

/// Thrown, with nothing posted, for a pointer holder its hold refuses (#282, `PointerHold.refusedWithoutActivationPointClick`):
/// the activation it would meet clicks no activation point. Never reaches the wire: its caller answers the refusal, or
/// takes the element route instead (`deliverPointer`).
struct PointerRefused: Error {}

/// Route 3's refusal (Interfaces, input errors): the action's own events were never posted.
func activationFailed(_ detail: String) -> EngineError {
  EngineError(name: "activationFailed", "The action was not performed: \(detail), so the app could not be prepared for input in the background. Nothing was clicked or typed; try again.")
}

/// Route 3's screen-update releases, run off the request path (#235's spec, Decision Log 2026-10-31). SLSReenableUpdate
/// waits on a semaphore for the window server's next frame while the engine's own connection has an on-screen,
/// animating window (the agent cursor's panel): about 5 ms a release, measured, against 0.2 ms with none. So the hold is
/// taken on the request's thread as before, and its release only enqueues the re-enable on one serial queue; the
/// display unfreezes when it did, the request no longer waits for the frame. A screen capture drains the queue first
/// (`drain`), so it never captures a display still held by an action that has returned. A later hold is not ordered
/// after the pending releases: SkyLight counts the holds per connection (SLSDisableUpdate adds an entry to the update
/// manager's outstanding-disable map and tells the window server only on the first; SLSReenableUpdate removes one and
/// `CGSUpdateManager::enable_updates_common` re-enables only when none is left; read from the disassembly on macOS
/// 26.6.2, the task report of 2026-10-31), so a hold taken before an earlier release has run stays held until its own.
final class ScreenUpdateReleases: @unchecked Sendable {
  static let shared = ScreenUpdateReleases(label: "cua.engine.screen-update-release")

  private let queue: DispatchQueue

  init(label: String) {
    queue = DispatchQueue(label: label, qos: .userInteractive)
  }

  /// Takes the hold now (`raw`, on the caller's thread) and answers its release, which enqueues the raw release and
  /// returns. Signposted: the hold from its disable to its re-enable, and the re-enable alone.
  func hold(_ raw: () -> () -> Void) -> () -> Void {
    let held = timingSignposts.isEnabled ? timingSignposts.beginInterval("route3.hold", id: timingSignposts.makeSignpostID()) : nil
    let release = raw()
    let queue = queue
    return {
      queue.async {
        signposted("route3.release") { release() }
        if let held { timingSignposts.endInterval("route3.hold", held) }
      }
    }
  }

  /// Waits until every release asked for so far has run (a capture's first step).
  func drain() { queue.sync {} }
}

/// When a screen-update hold's SLSReenableUpdate was really called (#324), on the monotonic clock: the cap's timer and
/// the release's queue both run late (the spike measured the display frozen a median 12 to 26 ms past `screenHoldMs`,
/// up to about 100 ms), so the release stamps it itself, just before the call. Armed only once a hold was really taken
/// (SLSDisableUpdate called): an unarmed stamp is never waited for.
final class ReenableStamp: @unchecked Sendable {
  private let condition = NSCondition()
  private var armed = false
  private var at: Double?

  func arm() { condition.withLock { armed = true } }

  func stamp(_ time: Double) {
    condition.withLock {
      if at == nil { at = time }
      condition.broadcast()
    }
  }

  /// The stamp, waited for up to `ms` of real time when the hold was taken; nil when it was not, or not stamped by then.
  func wait(upToMs ms: Double) -> Double? {
    condition.lock()
    defer { condition.unlock() }
    guard armed else { return nil }
    let deadline = Date(timeIntervalSinceNow: ms / 1000)
    while at == nil, condition.wait(until: deadline) {}
    return at
  }
}

/// A release that runs once, however many times and from whichever thread it is asked for (the guard's own end, or the
/// cap's timer).
private final class OnceRelease: @unchecked Sendable {
  private let lock = NSLock()
  private var release: (() -> Void)?
  init(_ release: @escaping () -> Void) { self.release = release }
  func callAsFunction() {
    lock.lock()
    let pending = release
    release = nil
    lock.unlock()
    pending?()
  }
}

/// What a pointer action's delivery guard saw and did (#200), for the result's meta (`delivery`).
struct DeliveryGuardOutcome: Equatable {
  /// How many times the target's window was found above the user's and the user's window raised back.
  var restores = 0
  /// The click brought the target's process (or the bound app's) to the front, the user's app was re-activated, and a
  /// later sample saw it frontmost again (kept when the target came back after).
  var frontmostRestored = false
  /// Another app came to the front during the guard (most likely the user's own switch): left alone, the guard ended.
  var otherAppFront = false
  /// From the action's events to the first restore; nil when none was needed.
  var restoreLatencyMs: Double?
  /// From the action's events to the guard's end.
  var guardMs: Double = 0
  /// The screen-update hold, from its start (the activation's, or the guard's own inside a held activation) to its
  /// release, at most the cap.
  var screenHoldMs: Double = 0
  /// #324: the hold's real span, from its start to the moment its SLSReenableUpdate was called (`ReenableStamp`, on the
  /// release's queue), which the cap's timer and the queue make later than `screenHoldMs`'s release; nil when no hold
  /// was taken or the call had not come within `screenReenableStampWaitMs`. It is this hold's own span: SkyLight
  /// re-enables the display only once every hold on the connection is released.
  var frozenMs: Double?
  /// The guard reached the hold's cap before its stable samples: the display was released, the guard ended there.
  var capped = false
  /// The guard's last sample saw the target's window above the user's, or the target's process (or the bound app's) in
  /// front: left as it was, at the cap or after a refused re-activation.
  var raiseLeft = false
  /// When the screen-update hold began (Unix ms; the activation's when this action ran it, else the guard's own): a
  /// raise before it was on the display. Read as `releasedAt` less the hold's own monotonic span, one clock for both.
  var holdStartedAt: Int64 = 0
  /// When the hold was released (Unix ms; the cap's time when the cap released it), for a sitting's own clock.
  var releasedAt: Int64 = 0
  /// When the action's events were posted (Unix ms, on the release's clock): the key of the after-action watch's
  /// repairs (`AfterActionWatches`), which later results report.
  var postedAt: Int64 = 0
  /// A repair (the user's window raised back, or the user's app made frontmost again) made after the hold's release,
  /// inside the repair window: the person may have seen the raise for that long. Counted apart from `restores`.
  var repairedAfterRelease = false
  /// From the action's events to the first repair after the release; nil when none.
  var repairAfterReleaseLatencyMs: Double?
  /// The guard stopped repairing after the release because the person gave input since the action's events.
  var personInput = false
  /// What the guard's samples saw of the target's window ordered above the user's (#321), whatever the hold.
  var transientRaise = TransientRaise()

  var wire: [String: Any] {
    var wire: [String: Any] = ["restores": restores, "frontmostRestored": frontmostRestored, "otherAppFront": otherAppFront,
                               "guardMs": guardMs, "screenHoldMs": screenHoldMs, "capped": capped, "raiseLeft": raiseLeft,
                               "holdStartedAt": Int(holdStartedAt), "releasedAt": Int(releasedAt), "postedAt": Int(postedAt),
                               "repairedAfterRelease": repairedAfterRelease, "personInput": personInput]
    if let restoreLatencyMs { wire["restoreLatencyMs"] = restoreLatencyMs }
    if let frozenMs { wire["frozenMs"] = frozenMs }
    if let repairAfterReleaseLatencyMs { wire["repairAfterReleaseLatencyMs"] = repairAfterReleaseLatencyMs }
    wire["transientRaise"] = transientRaise.wire
    return wire
  }
}

/// The delivery guard's reading of a reorder (#321): whether a sample saw the target's window above the user's; how long
/// from that first sample to the sample that read the order back as it was after the last one that saw it (to the
/// guard's end when none did); and whether the order had not read back by the hold's release (the person may have seen
/// it). `raiseLeft` is apart: what the guard's last sample saw.
struct TransientRaise: Equatable {
  var seen = false
  var ms: Double?
  var outlivedHold = false

  var wire: [String: Any] {
    var wire: [String: Any] = ["seen": seen, "outlivedHold": outlivedHold]
    if let ms { wire["ms"] = ms }
    return wire
  }
}

/// The user a guard keeps in front: the frontmost app, and its window the target's must stay behind with how that
/// window is brought back on top.
fileprivate struct GuardedUser {
  let pid: pid_t
  let window: (id: CGWindowID, restore: () -> Void)?
}

/// A screen-update hold kept open for a delivery guard: its release (once, by the guard or the cap's timer), when it
/// began, the user it keeps in front, and when its SLSReenableUpdate was called (`stamp`, #324).
private struct OpenHold {
  let release: OnceRelease
  let startedAt: Double
  let user: GuardedUser
  let stamp: ReenableStamp
  /// Held until the order reads back (#321), to `activationPointHoldCapMs` after the events and never past
  /// `activationPointHoldCeilingMs` from its start (#324); else to `activationHoldCapMs`.
  var untilOrderReadsBack = false
  /// The timer set as the hold opens, before any events: the ceiling, or main's cap.
  var openingCapMs: Double { untilOrderReadsBack ? activationPointHoldCeilingMs : activationHoldCapMs }
  /// The cap from the hold's start once the events went at `posted` (#324): whichever comes first of the cap after the
  /// events and the ceiling; main's cap for any other hold.
  func capMs(eventsAt posted: Double) -> Double {
    untilOrderReadsBack ? min(posted - startedAt + activationPointHoldCapMs, activationPointHoldCeilingMs) : activationHoldCapMs
  }
}

/// One action's fake activation of the app `pid` for its window.
final class FakeActivation {
  let pid: pid_t
  /// The bound app, which a panel's process (`pid`) serves; its coming to the front is the engine's doing too.
  let appPid: pid_t
  let window: AXUIElement
  let windowFrame: CGRect?
  let windowID: CGWindowID?
  /// Where the activation click must not land (the target of a click with another button than the left,
  /// `activationSparing`); no activation click goes there, the inert one included.
  let sparing: CGRect?
  /// The guard keeps the user's window on top by re-activating the user's app rather than by AXRaise on its window, and
  /// reads that window from the window list: no Accessibility call on any other app (the menu's held activation).
  let restoresByActivationOnly: Bool
  private let system: ActivationSystem
  private(set) var activated = false
  /// How long the guard held after the activation pair, for the result's meta; nil when no guard ran.
  private(set) var guardMs: Double?
  /// Set by a pointer action before its activation runs (#200): the guard ends on one stable sample and leaves its
  /// screen-update hold open for the delivery guard that follows the action's events (`deliver`).
  var holdsThroughDelivery = false
  /// Set by a shared-mode pointer action before its activation runs (#321): when the activation clicks its in-window
  /// activation point, the hold it leaves open for the delivery guard is held until the order reads back
  /// (`activationPointHoldCapMs` after the events, `activationPointHoldCeilingMs` from its start).
  var holdsUntilOrderReadsBack = false
  private let openHoldLock = NSLock()
  private var openHold: OpenHold?

  init(pid: pid_t, appPid: pid_t? = nil, window: AXUIElement, windowFrame: CGRect?, windowID: CGWindowID?, sparing: CGRect? = nil,
       restoresByActivationOnly: Bool = false, system: ActivationSystem = ActivationSystem()) {
    self.pid = pid
    self.sparing = sparing
    self.restoresByActivationOnly = restoresByActivationOnly
    self.appPid = appPid ?? pid
    self.window = window
    self.windowFrame = windowFrame
    self.windowID = windowID
    self.system = system
  }

  /// The window's frame and number read from the Accessibility API.
  convenience init(pid: pid_t, appPid: pid_t? = nil, window: AXUIElement, sparing: CGRect? = nil, restoresByActivationOnly: Bool = false,
                   system: ActivationSystem = ActivationSystem()) {
    let windowFrame = frame(of: window)
    self.init(pid: pid, appPid: appPid, window: window, windowFrame: windowFrame,
              windowID: windowNumber(of: window, pid: pid, frame: windowFrame), sparing: sparing,
              restoresByActivationOnly: restoresByActivationOnly, system: system)
  }

  /// What the inert-point rule decided at the activation point, once subtype 1 was posted; nil when it was not.
  private(set) var click: ActivationClick?
  /// The click that consumed the arm (at the activation point, the inert one, the holder's own) or why none could; nil
  /// before subtype 1, and while a holder's own left mouse down is still awaited (`defersArmClick`).
  var clickKind: ActivationClickKind? { armLock.withLock { kind } }
  /// Set by the registry before the activation runs (#187): its holder posts its own left mouse down within the hold (a
  /// left click, a drag), which consumes the arm on AppKit's armed branch with no ordering (#200's reading), so the
  /// inert click is kept for the release (`consumeArm`) rather than posted early; a click at an inert activation point
  /// is posted as ever.
  var defersArmClick = false
  /// Set by the registry before the activation runs (#282, `PointerHold`): its holder's own left mouse down may not meet
  /// an arm left by an activation that clicks no activation point, so `activate` throws `PointerRefused` there before
  /// anything is posted.
  var refusesPointerWithoutActivationPointClick = false
  /// The arm's state, behind its own lock (a holder joining on another connection may consume it): set from subtype 1
  /// until a mouse down to the process, and the inert click kept for it. `armClaimed`: a pointer holder's events, which
  /// open with its own left mouse down, are going out (`postAction`); an inert click waits until they are out.
  private let armLock = NSCondition()
  private var kind: ActivationClickKind?
  private var armSet = false
  private var armClaimed = false
  private var keptInert: (point: CGPoint, place: InertClickPoint)?
  /// Where the activation point lay against the window's frame, once the activation pair was posted; nil before.
  private(set) var pointPlace: ActivationPointPlace?
  /// When the activation's subtype 1 and its click were posted, on the system's clock; nil when not.
  private(set) var activatedAt: Double?
  private(set) var clickPostedAt: Double?
  /// The process's real-activation epoch (HeldActivations), read once the activation's subtype 1 is posted, or when it
  /// finds the app already believing it has focus; nil when no registry tracks it.
  var realEpoch: (() -> Int)?
  /// The epoch that reading answered: a real activation or deactivation since makes this activation stale.
  private(set) var epoch: Int?

  /// The vendor's safelyEnforceActiveState: nothing when the app believes it has focus; otherwise the activation pair,
  /// guarded so the user's app stays frontmost with its window on top. A throw after the pair (the guard's failure)
  /// leaves the activation in place — every caller's `defer { deactivate() }` undoes it on all of its own paths, so
  /// nothing here may undo it too, or a successful pair is undone before the caller's events are posted.
  ///
  /// The click's plan is read before subtype 1 (the activation point and the hit-test there are window geometry, which
  /// subtype 1 does not move), so a holder refused for it (`refusesPointerWithoutActivationPointClick`, #282) is refused
  /// with nothing posted and no screen-update hold taken.
  func activate() throws {
    guard !system.believesItHasFocus(pid) else {
      epoch = realEpoch?()
      return
    }
    let planned = planClick()
    if refusesPointerWithoutActivationPointClick, planned.kind != .activationPoint { throw PointerRefused() }
    guard let user = system.frontmost(), user != pid else {
      postActivation(planned)
      return
    }
    let system = system
    let guarded = guardedUser(user)
    let userWindow = guarded.window
    let holdStarted = system.now()
    let stamp = ReenableStamp()
    let release = takeHold(stamp)
    var keepsHold = false
    defer { if !keepsHold { release() } }
    let untilOrderReadsBack = holdsThroughDelivery && holdsUntilOrderReadsBack && planned.kind == .activationPoint
    // #324: a hold kept until the order reads back is timed at its ceiling here; its cap after the events is set once
    // they go (`deliver`).
    system.schedule(untilOrderReadsBack ? activationPointHoldCeilingMs : activationHoldCapMs) { release() }
    postActivation(planned)
    let started = system.now()
    defer { guardMs = ((system.now() - started) * 1000).rounded() / 1000 }
    let needed = holdsThroughDelivery ? activationGuardStableSamplesBeforeDelivery : activationGuardStableSamples
    var stable = 0
    while stable < needed {
      system.sleep(activationGuardSampleMs)
      let elapsed = system.now() - started
      let front = signposted("route3.guard.frontmost") { system.frontmost() }
      if front != user {
        if let front, front == pid || front == appPid {
          throw activationFailed(system.reactivate(user)
            ? "the app came to the front, and the frontmost app was restored"
            : "the app came to the front, and the frontmost app could not be restored")
        }
        throw activationFailed("another app came to the front")
      }
      if let windowID, let userWindow, signposted("route3.guard.windowOrder", { system.isInFront(windowID, userWindow.id) }) {
        stable = 0
        userWindow.restore()
      } else {
        stable += 1
      }
      if stable < needed && elapsed >= activationGuardTimeoutMs {
        throw activationFailed("the app's window did not stay behind the frontmost window within 1 s")
      }
    }
    if holdsThroughDelivery {
      keepsHold = true
      openHoldLock.withLock {
        openHold = OpenHold(release: release, startedAt: holdStarted, user: guarded, stamp: stamp, untilOrderReadsBack: untilOrderReadsBack)
      }
    }
  }

  /// A screen-update hold and its one release (#324): under `holdHoldsActivity` the latency-critical activity begins
  /// just before SLSDisableUpdate and ends with the release, whichever path asks for it first (the guard's end, the
  /// cap's or the ceiling's timer, a throw, a stop before the events), since every one goes through this release.
  private func takeHold(_ stamp: ReenableStamp) -> OnceRelease {
    let endActivity = holdHoldsActivity ? system.beginLatencyCriticalActivity() : {}
    let release = system.holdScreenUpdates(stamp)
    return OnceRelease {
      release()
      endActivity()
    }
  }

  /// The user's app and its window the target's must stay behind, read as the guard reads them.
  private func guardedUser(_ user: pid_t) -> GuardedUser {
    let system = system
    if restoresByActivationOnly {
      return GuardedUser(pid: user, window: system.userWindowNumber(user).map { id in (id, { _ = system.reactivate(user) }) })
    }
    return GuardedUser(pid: user, window: system.userWindow(user).map { found in (found.id, { system.raise(found.element) }) })
  }

  /// The hold this activation's guard left open for its delivery (`holdsThroughDelivery`), taken once.
  private func takeOpenHold() -> OpenHold? {
    openHoldLock.withLock {
      defer { openHold = nil }
      return openHold
    }
  }

  /// Releases a hold left open for a delivery that did not happen (a stop before the events, an event not made).
  func releaseOpenHold() { takeOpenHold()?.release() }

  /// The delivery guard (#200): `post` (the action's events) inside a screen-update hold, then the activation's guard
  /// again on what the events did. A route-3 click's own mouse down raises the target's window above the user's by
  /// AppKit's rule (`isOrderingMouseDown`), after the activation's guard has ended, and may bring its process forward;
  /// AppKit gives no way, from outside the app, to deliver a click to a view that refuses the first mouse without it
  /// (#200's readings). So a target window above the user's is answered with the user's window raised back, and the
  /// target's process (or the bound app's) in front with the user's app made frontmost again, until
  /// `deliveryGuardStableSamples` consecutive samples find both right, no sooner than `deliveryGuardMinimumMs` after the
  /// events, all before the hold is released. The window checked is the action's (`window`, the one its events name),
  /// else the activation's: a held or shared activation keeps its first holder's window, and a later click may aim at
  /// another window of the process (a dialog). The hold is the activation's own when this action ran it
  /// (`holdsThroughDelivery`), else one of the guard's own inside a held or shared activation: one hold an action.
  /// Past the hold's cap it repairs on inside the repair window, unless the person acted, reported apart
  /// (`repairedAfterRelease`), and ends there leaving the order as it is (`capped`, `raiseLeft`); a third app in front is
  /// the user's and is left alone. Once it returns, the after-action watch (`AfterActionWatch`) runs on to the repair
  /// window's end under the same rules, on `watches` (the connection's), so a raise after the guard settled is repaired
  /// too, as a flash a later result reports; the action does not wait for it. Nil, with `post` run alone, when no fake
  /// activation stands or the user's app is not another app in front: nothing to guard. An action whose events go on
  /// after `post` (the paste route's later lines and Returns) passes its `repairWindow`: the watch then runs while the
  /// action does and until the repair window after its last event, not after `post`'s.
  ///
  /// #321: a shared-mode pointer action (`pointer`) whose activation, its own or the one it shares, clicked its
  /// in-window activation point (`clickKind`) holds until the order reads back: the guard samples for at least
  /// `activationPointGuardMinimumMs` after the events and ends on its stable samples as ever, and the hold is released
  /// then, or by the timer whatever the order at `activationPointHoldCapMs` after the events or
  /// `activationPointHoldCeilingMs` after the hold's start, whichever is first (#324). Every other delivery is as
  /// before. Each records what its samples saw of a reorder (`transientRaise`) and the hold's real span (`frozenMs`).
  ///
  /// `ranBy` is the activation the calling action made (nil when it made none): the hold this activation's guard left
  /// open is its own action's alone, cap and least wait included, so an action of another connection sharing the
  /// activation before that action's events (a paste joining a pointer's, or the other way round) takes a hold of its
  /// own under its own classification, never the pending one (#321's review).
  func deliver(window: CGWindowID? = nil, watches: AfterActionWatches? = nil, repairWindow: RepairWindow? = nil, pointer: Bool = false,
               ranBy action: FakeActivation?, _ post: () -> Void) -> DeliveryGuardOutcome? {
    let system = system
    let hold: OpenHold
    if action === self, let open = takeOpenHold() {
      hold = open
    } else {
      guard activated, let user = system.frontmost(), user != pid, user != appPid else {
        post()
        return nil
      }
      let guarded = guardedUser(user)
      let started = system.now()
      let stamp = ReenableStamp()
      let release = takeHold(stamp)
      let opened = OpenHold(release: release, startedAt: started, user: guarded, stamp: stamp,
                            untilOrderReadsBack: pointer && clickKind == .activationPoint)
      system.schedule(opened.openingCapMs) { release() }
      hold = opened
    }
    let minimumMs = hold.untilOrderReadsBack ? activationPointGuardMinimumMs : deliveryGuardMinimumMs
    let targetWindow = window ?? windowID
    var outcome = DeliveryGuardOutcome()
    post()
    let posted = system.now()
    // #324: a hold kept until the order reads back is capped from its events, by a timer of its own beside the ceiling's.
    let capMs = hold.capMs(eventsAt: posted)
    if hold.untilOrderReadsBack {
      let release = hold.release
      system.schedule(max(0, hold.startedAt + capMs - posted)) { release() }
    }
    let round = { (ms: Double) in (ms * 1000).rounded() / 1000 }
    // The cap's timer releases the hold on its own, so the deadline is read again after whatever may block (the poll's
    // sleep, the reads, a restore). Past it a repair shows on the display, so it is made only inside the repair window
    // after the events, only while the person has given no input since them (their own click into the app is never
    // undone), and reported apart (`repairedAfterRelease`).
    let capPassed = { system.now() - hold.startedAt >= capMs }
    let personActed = { system.secondsSinceInput() * 1000 < system.now() - posted }
    var stable = 0
    // What the last sample saw, after every repair made before it: the report rests on it, not on a call's own answer
    // (a re-activation the system accepts may leave the target in front).
    var targetFront = false
    var targetAbove = false
    var reactivationPending = false
    var refused = false
    // A reorder's first sample, and the sample that read the order back after the last that saw it (`transientRaise`).
    var raiseSeen: Double?
    var orderReadBack: Double?
    while stable < deliveryGuardStableSamples || system.now() - posted < minimumMs {
      system.sleep(capPassed() ? activationGuardSampleMs : deliveryGuardSampleMs)
      let front = signposted("route3.delivery.frontmost") { system.frontmost() }
      if front != hold.user.pid {
        guard let front, front == pid || front == appPid else {
          outcome.otherAppFront = true
          targetFront = false
          targetAbove = false
          break
        }
        targetFront = true
        targetAbove = false
      } else {
        targetFront = false
        if reactivationPending { outcome.frontmostRestored = true }
        reactivationPending = false
        if let targetWindow, let window = hold.user.window {
          targetAbove = signposted("route3.delivery.windowOrder") { system.isInFront(targetWindow, window.id) }
          let at = system.now()
          if targetAbove {
            if raiseSeen == nil { raiseSeen = at }
            orderReadBack = nil
          } else if raiseSeen != nil, orderReadBack == nil {
            orderReadBack = at
          }
        } else {
          targetAbove = false
        }
      }
      let released = capPassed()
      if released {
        outcome.capped = outcome.capped || stable < deliveryGuardStableSamples
        if system.now() - posted >= deliveryRepairWindowMs { break }
        if (targetFront || targetAbove) && personActed() {
          outcome.personInput = true
          break
        }
      }
      let repairedAt = { (latency: Double) in
        if released {
          outcome.repairedAfterRelease = true
          if outcome.repairAfterReleaseLatencyMs == nil { outcome.repairAfterReleaseLatencyMs = latency }
        } else if outcome.restoreLatencyMs == nil {
          outcome.restoreLatencyMs = latency
        }
      }
      if targetFront {
        stable = 0
        let accepted = system.reactivate(hold.user.pid)
        repairedAt(round(system.now() - posted))
        guard accepted else { refused = true; break }  // refused: the target stays in front, reported
        reactivationPending = true
      } else if targetAbove, let window = hold.user.window {
        window.restore()
        if !released { outcome.restores += 1 }
        repairedAt(round(system.now() - posted))
        stable = 0
      } else {
        stable += 1
      }
    }
    outcome.guardMs = round(system.now() - posted)
    outcome.screenHoldMs = round(min(system.now() - hold.startedAt, capMs))
    outcome.raiseLeft = targetFront || targetAbove
    let ended = system.now()
    if let raiseSeen {
      let readBackInsideHold = orderReadBack.map { $0 - hold.startedAt < capMs } ?? false
      outcome.transientRaise = TransientRaise(seen: true, ms: round((orderReadBack ?? ended) - raiseSeen), outlivedHold: !readBackInsideHold)
    }
    let held = ended - hold.startedAt
    // The Unix anchor is read with `ended`, before the release and the wait for its stamp (up to
    // `screenReenableStampWaitMs`), so the wait never shifts the hold's, the release's or the events' Unix times.
    let now = system.unixNow()
    hold.release()
    outcome.frozenMs = system.awaitReenable(hold.stamp, screenReenableStampWaitMs).map { round($0 - hold.startedAt) }
    outcome.holdStartedAt = now - Int64(held.rounded())
    outcome.releasedAt = outcome.holdStartedAt + Int64(min(held, capMs).rounded())
    outcome.postedAt = now - Int64((ended - posted).rounded())
    // The watch takes over where the guard could still repair: not past the window, not after the person's input, a
    // third app's front or a refused re-activation.
    if let watches, !outcome.otherAppFront, !outcome.personInput, !refused,
       repairWindow?.contains(ended, firstEvent: posted) ?? (ended - posted < deliveryRepairWindowMs) {
      watches.begin(AfterActionWatch(system: system, user: hold.user, pid: pid, appPid: appPid, window: targetWindow, posted: posted,
                                     postedAt: outcome.postedAt, repairWindow: repairWindow, sink: watches))
    }
    return outcome
  }

  /// After the action's events: the deactivation subtype, unless the app really is active now, after the kept inert click
  /// when no mouse down consumed the arm (a hold never ends with its arm set). False only when the deactivation was due
  /// and its event could not be made (the app may still believe itself active).
  @discardableResult
  func deactivate() -> Bool {
    guard activated, system.frontmost() != pid else { return true }
    consumeArm(.release)
    guard post(subtype: NSEvent.EventSubtype.applicationDeactivated.rawValue) else { return false }
    activated = false
    return true
  }

  /// The vendor's enforceActiveState for an app that does not believe it is active: subtype 1, then a left click at the
  /// window's AXActivationPoint when the point is inert (`activationClickDecision`), else the inert click outside the
  /// window's frame (`activationClickPlan`), so the arm subtype 1 sets is consumed before the holder's input; for a
  /// holder that posts its own left mouse down (`defersArmClick`) the inert click is kept for the release instead, which
  /// posts it only when no mouse down consumed the arm. No click only where none can be stamped and placed safely. The
  /// click goes to the process alone: the agent cursor is told of an action's own events by its route (`announce`),
  /// never of this one.
  private func postActivation(_ planned: PlannedClick) {
    post(subtype: NSEvent.EventSubtype.applicationActivated.rawValue)
    activated = true
    epoch = realEpoch?()  // right after subtype 1: a real event from here on supersedes this activation
    activatedAt = system.now()
    pointPlace = activationPointPlace(planned.activationPoint, windowFrame: windowFrame)
    click = planned.decision
    if case .inertOutside(let place, _) = planned.kind, defersArmClick, let point = planned.point {
      armLock.withLock { (armSet, kind, keptInert) = (true, nil, (point, place)) }
      return
    }
    armLock.withLock { (armSet, kind, keptInert) = (planned.point == nil, planned.kind, nil) }  // a skip leaves the arm set
    guard let point = planned.point else { return }
    postClick(at: point)
  }

  /// What the activation will click after subtype 1, read from the window's AXActivationPoint and the hit-test there.
  private struct PlannedClick {
    let activationPoint: CGPoint?
    let decision: ActivationClick
    let kind: ActivationClickKind
    let point: CGPoint?
  }

  private func planClick() -> PlannedClick {
    let activationPoint = system.activationPoint(window)
    let system = system, pid = pid
    let decision = activationClickDecision(activationPoint, windowFrame: windowFrame, sparing: sparing) {
      activationPoint.flatMap { system.hitAt(pid, $0) }
    }
    let plan = activationClickPlan(decision, activationPoint: activationPoint, windowFrame: windowFrame, windowID: windowID, sparing: sparing)
    return PlannedClick(activationPoint: activationPoint, decision: decision, kind: plan.kind, point: plan.point)
  }

  /// Whether this activation ran and clicked no AXActivationPoint (its arm consumed by an inert click or a holder's own
  /// mouse down, or still set): a pointer joining it meets its arm or a window that click made key, never one the
  /// activation point's click prepared (#282).
  var activatedWithoutActivationPointClick: Bool {
    activated && armLock.withLock { kind } != .activationPoint
  }

  private func postClick(at point: CGPoint) {
    let target = ClickTarget(point: point, windowFrame: windowFrame, windowID: windowID, pid: pid)
    _ = postToProcess(clickEvents(target, button: .left, count: 1, flags: []), pid: pid, post: system.post)
    clickPostedAt = system.now()
  }

  /// Posts the kept inert click when the arm is still set (`when`: a holder with no left mouse down of its own joined, or
  /// the last holder releases); true when it did. It waits out a pointer holder's events going out (`postAction`), whose
  /// own mouse down consumes the arm, and its two events go out under the arm's lock, so no pointer holder's events
  /// interleave with them: never between a drag's down and its up.
  @discardableResult
  func consumeArm(_ when: ActivationClickWhen) -> Bool {
    armLock.lock()
    defer { armLock.unlock() }
    while armClaimed { armLock.wait() }
    guard armSet, let kept = keptInert else { return false }
    (armSet, kind, keptInert) = (false, .inertOutside(kept.place, when), nil)
    postClick(at: kept.point)
    return true
  }

  /// Whether a holder's own left mouse down would meet an arm this activation no longer has, where a new one would give
  /// it one: subtype 1 was posted and its arm consumed early, by the inert click outside the frame or an earlier holder's
  /// own mouse down. Not when the click at an inert activation point consumed it, which a new activation would post
  /// again, nor while the arm is set or claimed.
  var armSpentOutsideActivationPoint: Bool {
    armLock.withLock { !armSet && !armClaimed && kind != nil && kind != .activationPoint }
  }

  /// A holder's own events going out to the process (`post`, which posts them all): a left mouse down stamped with a
  /// window number consumes the arm (AppKit routes by that number alone), so while the arm is set the holder claims it
  /// first, under the arm's lock, and an inert click waits until the events are out (`consumeArm`); true when this one
  /// consumed it. A holder stopped before its events never claims, and the arm stays set for the release's inert click.
  @discardableResult
  func postAction(_ events: [CGEvent], _ post: () -> Void) -> Bool {
    let claimed = events.contains(where: { $0.type == .leftMouseDown && $0.getIntegerValueField(eventField(91)) != 0 }) && armLock.withLock {
      while armClaimed { armLock.wait() }
      guard armSet else { return false }
      armClaimed = true
      return true
    }
    post()
    guard claimed else { return false }
    armLock.withLock {
      (armSet, kind, keptInert, armClaimed) = (false, .action, nil, false)
      armLock.broadcast()
    }
    return true
  }

  @discardableResult
  private func post(subtype: Int16) -> Bool {
    guard let event = NSEvent.otherEvent(with: .appKitDefined, location: .zero, modifierFlags: NSEvent.ModifierFlags(rawValue: 0xC0000),
                                         timestamp: 0, windowNumber: Int(windowID ?? 0), context: nil, subtype: subtype, data1: 0, data2: 0)?.cgEvent
    else { return false }
    event.timestamp = DispatchTime.now().uptimeNanoseconds
    system.post(event, pid)
    return true
  }
}

/// The repair window of an action whose events go on after its delivery guard (the paste route's later lines and their
/// Returns, #200 on the paste route): open while the action runs, however long its waits, and closed
/// `deliveryRepairWindowMs` after its last event once it has ended. The person's input is still read against the
/// action's first event (`AfterActionWatch`), so their input at any point of the action ends the watch.
final class RepairWindow: @unchecked Sendable {
  private let lock = NSLock()
  private var running = true
  private var lastEvent: Double?

  /// One of the action's events was posted at `at`, on the action's system clock.
  func posted(at: Double) { lock.withLock { lastEvent = max(lastEvent ?? at, at) } }

  /// The action has ended: the window closes `deliveryRepairWindowMs` after its last event.
  func ended() { lock.withLock { running = false } }

  /// Whether `now` lies inside the window of an action whose first event was posted at `firstEvent`.
  func contains(_ now: Double, firstEvent: Double) -> Bool {
    lock.withLock { running || now - (lastEvent ?? firstEvent) < deliveryRepairWindowMs }
  }
}

/// One pointer action's after-action watch (#200): from its delivery guard's return to `deliveryRepairWindowMs` after its
/// events (after its last, when the action passed a `RepairWindow`: the paste route's), a sample every
/// `activationGuardSampleMs` on `schedule`'s thread, under the guard's rules: the target's window above the user's is
/// answered with the user's window raised back, the target's process (or the bound app's) in front with the user's app
/// made frontmost again; it ends at the window's end, at the person's first input since the events,
/// when a third app is in front (theirs), when a re-activation is refused, or when cancelled. A sample runs under the
/// watch's lock, which `cancel` takes: once `cancel` returns no repair starts. Each repair is a flash (no hold is open),
/// recorded on the connection (`AfterActionWatches.record`), which the watch holds weakly: the connection holds its live
/// watch, until the watch ends or is cancelled, and never the other way round. A refused re-activation is no repair.
final class AfterActionWatch: @unchecked Sendable {
  private let lock = NSLock()
  private var cancelled = false
  private let system: ActivationSystem
  private let user: GuardedUser
  private let pid: pid_t
  private let appPid: pid_t
  private let window: CGWindowID?
  private let posted: Double
  private let postedAt: Int64
  private let repairWindow: RepairWindow?
  private weak var sink: AfterActionWatches?

  fileprivate init(system: ActivationSystem, user: GuardedUser, pid: pid_t, appPid: pid_t, window: CGWindowID?, posted: Double,
                   postedAt: Int64, repairWindow: RepairWindow?, sink: AfterActionWatches) {
    self.system = system
    self.user = user
    self.pid = pid
    self.appPid = appPid
    self.window = window
    self.posted = posted
    self.postedAt = postedAt
    self.repairWindow = repairWindow
    self.sink = sink
  }

  fileprivate func start() { next() }

  /// Ends the watch, waiting out a sample in progress.
  func cancel() { lock.withLock { cancelled = true } }

  /// The next sample, or, once the watch has ended, its release by the connection.
  private func next() {
    system.schedule(activationGuardSampleMs) { [self] in
      if lock.withLock({ !cancelled && sample() }) { next() } else { sink?.ended(self) }
    }
  }

  /// One sample and its repair; false when the watch ends.
  private func sample() -> Bool {
    let system = system
    let now = system.now()
    guard repairWindow?.contains(now, firstEvent: posted) ?? (now - posted < deliveryRepairWindowMs) else { return false }
    let front = signposted("route3.afterAction.frontmost") { system.frontmost() }
    let targetFront: Bool
    if front != user.pid {
      guard let front, front == pid || front == appPid else { return false }  // a third app: the person's front
      targetFront = true
    } else if let window, let userWindow = user.window, signposted("route3.afterAction.windowOrder", { system.isInFront(window, userWindow.id) }) {
      targetFront = false
    } else {
      return true
    }
    guard system.secondsSinceInput() * 1000 >= system.now() - posted else { return false }  // the person acted
    if targetFront {
      guard system.reactivate(user.pid) else { return false }  // refused: no repair, and the watch ends
      sink?.record(postedAt: postedAt, latencyMs: system.now() - posted, kind: "frontmost")
      return true
    }
    user.window?.restore()
    sink?.record(postedAt: postedAt, latencyMs: system.now() - posted, kind: "window")
    return true
  }
}

/// A connection's after-action watches (#200): the one live watch (a connection runs one request at a time, and each
/// action's watch replaces the last), and the repairs they made, which every later input result's meta and observation
/// carry as `afterActionRepairs` {repairs: the connection's total, actions: [{postedAt, repairs, latencyMs}] for the last
/// `reportedActions` actions repaired, each keyed by its delivery's `postedAt`, with its first repair's latency from its
/// events}: the action whose watch repaired had already answered. Each repair is a signpost event too
/// (`route3.afterAction.repair`).
final class AfterActionWatches: @unchecked Sendable {
  static let reportedActions = 8

  private let lock = NSLock()
  private var live: AfterActionWatch?
  /// Run once the live watch ends, on its own or cancelled (`whenLiveEnds`).
  private var whenEnded: (() -> Void)?
  private var repairs = 0
  private var actions: [(postedAt: Int64, repairs: Int, latencyMs: Double)] = []

  /// Ends the live watch, waiting out its sample in progress: no repair starts once this returns. Every request that
  /// acts or observes on the connection calls it first (Methods.swift `execute`), as does every pointer action; a closed
  /// connection's watch is ended by the next such request on any connection (`ClosedConnectionWatches`, #237).
  func cancel() {
    let (watch, done) = lock.withLock { () -> (AfterActionWatch?, (() -> Void)?) in
      defer { live = nil; whenEnded = nil }
      return (live, whenEnded)
    }
    watch?.cancel()
    done?()
  }

  /// Runs `done` once the live watch ends, on its own or cancelled; false, and `done` never run, when none is live.
  func whenLiveEnds(_ done: @escaping () -> Void) -> Bool {
    lock.withLock {
      guard live != nil else { return false }
      whenEnded = done
      return true
    }
  }

  fileprivate func begin(_ watch: AfterActionWatch) {
    cancel()
    lock.withLock { live = watch }
    watch.start()
  }

  /// A watch that ended on its own lets go of it.
  fileprivate func ended(_ watch: AfterActionWatch) {
    let done = lock.withLock { () -> (() -> Void)? in
      guard live === watch else { return nil }
      defer { live = nil; whenEnded = nil }
      return whenEnded
    }
    done?()
  }

  fileprivate func record(postedAt: Int64, latencyMs: Double, kind: StaticString) {
    let latency = (latencyMs * 1000).rounded() / 1000
    lock.withLock {
      repairs += 1
      if let last = actions.indices.last, actions[last].postedAt == postedAt {
        actions[last].repairs += 1
      } else {
        actions.append((postedAt, 1, latency))
        if actions.count > Self.reportedActions { actions.removeFirst() }
      }
    }
    if timingSignposts.isEnabled {
      let kind = "\(kind)"
      timingSignposts.emitEvent("route3.afterAction.repair", "postedAt=\(postedAt) latencyMs=\(latency, format: .fixed(precision: 1)) kind=\(kind, privacy: .public)")
    }
  }

  /// Whether a watch is live (the unit tests').
  var watching: Bool { lock.withLock { live != nil } }

  /// The report, nil until the connection's first after-action repair.
  var wire: [String: Any]? {
    lock.withLock {
      repairs == 0 ? nil : ["repairs": repairs,
                            "actions": actions.map { ["postedAt": Int($0.postedAt), "repairs": $0.repairs, "latencyMs": $0.latencyMs] as [String: Any] }]
    }
  }
}

/// The after-action watches of connections that have closed (#237). A client's close (end_task closes the session's
/// connection) does not end its connection's live watch: the watch runs to its natural end under its own rules (the
/// repair window, the person's input, a third app in front, a refused re-activation), so a raise that comes after the
/// client has gone is still repaired, and the next request that acts or observes, on any connection, ends it first
/// (Methods.swift `execute`): a later client's work is never answered by an earlier client's watch. The registry holds
/// the watches until then, and lets go of them when the watch ends; the closed connection's other state is gone already.
/// An engine shutting down ends them all (Server.swift `stopAndExit`).
final class ClosedConnectionWatches: @unchecked Sendable {
  private let lock = NSLock()
  /// Held for a whole drain: a drain that finds the registry emptied by another still running waits for that one's
  /// cancellations (each waits out its watch's sample), so no caller goes ahead while a watch it raced can still repair
  /// (#237's review). Never taken under `lock`.
  private let draining = NSLock()
  private var held: [ObjectIdentifier: AfterActionWatches] = [:]

  /// A closed connection's watches: held while their watch runs, released at once when none does.
  func adopt(_ watches: AfterActionWatches) {
    let key = ObjectIdentifier(watches)
    lock.withLock { held[key] = watches }
    let live = watches.whenLiveEnds { [weak self] in self?.drop(key) }
    if !live { drop(key) }
  }

  /// Ends every closed connection's watch, each waiting out its sample in progress: no repair of theirs starts once this
  /// returns, whichever drain took them.
  func cancelAll() {
    draining.withLock {
      let all = lock.withLock { () -> [AfterActionWatches] in
        defer { held = [:] }
        return Array(held.values)
      }
      for watches in all { watches.cancel() }
    }
  }

  /// How many closed connections' watches still run (the unit tests').
  var count: Int { lock.withLock { held.count } }

  private func drop(_ key: ObjectIdentifier) { _ = lock.withLock { held.removeValue(forKey: key) } }
}
