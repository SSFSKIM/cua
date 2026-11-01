import AppKit
import ApplicationServices
import Foundation

// Route 3, fake activation (the spec's Design, "Input" route 3; R/F-helper-logic.md §5.4–5.5, R/sky-behaviour.md §12):
// the app is made to believe it is active while the user's app stays frontmost. To the target pid: an AppKit-defined
// event of subtype 1 (application activated; flags 0xC0000, the window number) plus a left click at the window's
// AXActivationPoint with route 2's recipe, the click posted only where a hit-test shows the point inert (the window or
// chrome that is no control) and inside the window's frame (cua's declared differences, U13 and the focus hold's review). Around it, when another app is frontmost: screen updates held with the
// private SLSDisableUpdate/SLSReenableUpdate, released when the guard ends or, by a timer, at `activationHoldCapMs`,
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

/// How long the screen-update hold may last: well under the guard's 1 s poll, and above the guards the sittings
/// measured (37–58 ms, a coordinate click into TextEdit 82), so a guard of the usual length holds as the vendor's does.
let activationHoldCapMs: Double = 100
/// The guard's poll: every 10 ms for up to 1 s (F §5.5).
let activationGuardTimeoutMs: Double = 1_000
let activationGuardSampleMs: Double = 10
/// The consecutive stable samples the activation's guard ends on: three, or one when a delivery guard follows the
/// action's events inside the same hold and checks both again (#200).
let activationGuardStableSamples = 3
let activationGuardStableSamplesBeforeDelivery = 1
/// The delivery guard's (#200): the stable samples it ends on, and the least time it waits after the events before it
/// may end, so an app slow to handle the click still raises inside the hold (0 until the sittings measure it).
let deliveryGuardStableSamples = 3
let deliveryGuardMinimumMs: Double = 0

/// SkyLight's update hold (F §11, salts 16 and 17) and the connection it takes.
private enum SkyLight {
  typealias ConnectionID = @convention(c) () -> Int32
  typealias Update = @convention(c) (Int32) -> Int32
  static let mainConnectionID: ConnectionID? = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "SLSMainConnectionID").map { unsafeBitCast($0, to: ConnectionID.self) }
  static let disableUpdate: Update? = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "SLSDisableUpdate").map { unsafeBitCast($0, to: Update.self) }
  static let reenableUpdate: Update? = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "SLSReenableUpdate").map { unsafeBitCast($0, to: Update.self) }

  /// Holds screen updates on the main connection and answers the release (nothing to release when the calls are absent).
  static func hold() -> () -> Void {
    guard let connection = mainConnectionID?() else { return {} }
    _ = disableUpdate?(connection)
    return { _ = reenableUpdate?(connection) }
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
  var post: (CGEvent, pid_t) -> Void = { event, pid in event.postToPid(pid) }
  var frontmost: () -> pid_t? = frontmostPid
  var keyFocus: () -> pid_t? = { KeyFocus.pid() }
  /// Answers the release, which returns at once: the re-enable runs on ScreenUpdateReleases' queue.
  var holdScreenUpdates: () -> () -> Void = { ScreenUpdateReleases.shared.hold(SkyLight.hold) }
  var reactivate: (pid_t) -> Bool = { NSRunningApplication(processIdentifier: $0)?.activate(options: []) ?? false }
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
  var raise: (AXUIElement) -> Void = { AXUIElementPerformAction($0, kAXRaiseAction as CFString) }
  var activationPoint: (AXUIElement) -> CGPoint? = { point(attribute($0, "AXActivationPoint")) }
  /// What the process answers at a global point (the activation click's hit-test), read from its application element.
  var hitAt: (pid_t, CGPoint) -> ActivationHit? = { pid, point in
    hitTest(application: pid, at: point).map { ActivationHit(role: attribute($0, kAXRoleAttribute) as? String, actions: establishedActionNames(of: $0)) }
  }
  var now: () -> Double = monotonicMilliseconds
  var sleep: (Double) -> Void = { usleep(UInt32(max(0, $0) * 1000)) }
  /// Runs `work` after the given milliseconds on another thread (the hold's cap, kept while the guard is blocked).
  var schedule: (Double, @escaping @Sendable () -> Void) -> Void = { ms, work in
    DispatchQueue.global(qos: .userInteractive).asyncAfter(deadline: .now() + .microseconds(Int(ms * 1000)), execute: work)
  }

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
  /// The guard reached the hold's cap before its stable samples: the display was released, the guard ended there.
  var capped = false
  /// The guard's last sample saw the target's window above the user's, or the target's process (or the bound app's) in
  /// front: left as it was, at the cap or after a refused re-activation.
  var raiseLeft = false
  /// When the hold's release was asked for (Unix ms), for a sitting's own clock.
  var releasedAt: Int64 = 0

  var wire: [String: Any] {
    var wire: [String: Any] = ["restores": restores, "frontmostRestored": frontmostRestored, "otherAppFront": otherAppFront,
                               "guardMs": guardMs, "screenHoldMs": screenHoldMs, "capped": capped, "raiseLeft": raiseLeft,
                               "releasedAt": Int(releasedAt)]
    if let restoreLatencyMs { wire["restoreLatencyMs"] = restoreLatencyMs }
    return wire
  }
}

/// The user a guard keeps in front: the frontmost app, and its window the target's must stay behind with how that
/// window is brought back on top.
private struct GuardedUser {
  let pid: pid_t
  let window: (id: CGWindowID, restore: () -> Void)?
}

/// A screen-update hold kept open for a delivery guard: its release (once, by the guard or the cap's timer), when it
/// began, and the user it keeps in front.
private struct OpenHold {
  let release: OnceRelease
  let startedAt: Double
  let user: GuardedUser
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
  /// `activationSparing`); the click is skipped there.
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

  /// What the activation click did, once the activation pair was posted; nil when none was.
  private(set) var click: ActivationClick?
  /// The process's real-activation epoch (HeldActivations), read once the activation's subtype 1 is posted, or when it
  /// finds the app already believing it has focus; nil when no registry tracks it.
  var realEpoch: (() -> Int)?
  /// The epoch that reading answered: a real activation or deactivation since makes this activation stale.
  private(set) var epoch: Int?

  /// The vendor's safelyEnforceActiveState: nothing when the app believes it has focus; otherwise the activation pair,
  /// guarded so the user's app stays frontmost with its window on top. A throw after the pair (the guard's failure)
  /// leaves the activation in place — every caller's `defer { deactivate() }` undoes it on all of its own paths, so
  /// nothing here may undo it too, or a successful pair is undone before the caller's events are posted.
  func activate() throws {
    guard !system.believesItHasFocus(pid) else {
      epoch = realEpoch?()
      return
    }
    guard let user = system.frontmost(), user != pid else {
      postActivation()
      return
    }
    let system = system
    let guarded = guardedUser(user)
    let userWindow = guarded.window
    let holdStarted = system.now()
    let release = OnceRelease(system.holdScreenUpdates())
    var keepsHold = false
    defer { if !keepsHold { release() } }
    system.schedule(activationHoldCapMs) { release() }
    postActivation()
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
      openHoldLock.withLock { openHold = OpenHold(release: release, startedAt: holdStarted, user: guarded) }
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
  /// At the hold's cap the guard ends and leaves the order as it is, reported (`capped`, `raiseLeft`); a third app in
  /// front is the user's and is left alone. Nil, with `post` run alone, when no fake activation stands or the user's app
  /// is not another app in front: nothing to guard.
  func deliver(window: CGWindowID? = nil, _ post: () -> Void) -> DeliveryGuardOutcome? {
    let system = system
    let hold: OpenHold
    if let open = takeOpenHold() {
      hold = open
    } else {
      guard activated, let user = system.frontmost(), user != pid, user != appPid else {
        post()
        return nil
      }
      let guarded = guardedUser(user)
      let started = system.now()
      let release = OnceRelease(system.holdScreenUpdates())
      system.schedule(activationHoldCapMs) { release() }
      hold = OpenHold(release: release, startedAt: started, user: guarded)
    }
    let targetWindow = window ?? windowID
    var outcome = DeliveryGuardOutcome()
    post()
    let posted = system.now()
    let round = { (ms: Double) in (ms * 1000).rounded() / 1000 }
    // The cap's timer releases the hold on its own, so the deadline is read again after whatever may block (the poll's
    // sleep, the reads, a restore): past it nothing more is repaired, where the user would see the repair.
    let capPassed = { system.now() - hold.startedAt >= activationHoldCapMs }
    var stable = 0
    // What the last sample saw, after every repair made before it: the report rests on it, not on a call's own answer
    // (a re-activation the system accepts may leave the target in front).
    var targetFront = false
    var targetAbove = false
    var reactivationPending = false
    while stable < deliveryGuardStableSamples || system.now() - posted < deliveryGuardMinimumMs {
      // Once the cap has passed, a sample only reads what is left, with no sleep before it.
      if !capPassed() { system.sleep(activationGuardSampleMs) }
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
        } else {
          targetAbove = false
        }
      }
      if capPassed() {
        outcome.capped = true
        break
      }
      if targetFront {
        stable = 0
        let accepted = system.reactivate(hold.user.pid)
        if outcome.restoreLatencyMs == nil { outcome.restoreLatencyMs = round(system.now() - posted) }
        guard accepted else { break }  // refused: the target stays in front, reported
        reactivationPending = true
      } else if targetAbove, let window = hold.user.window {
        window.restore()
        outcome.restores += 1
        if outcome.restoreLatencyMs == nil { outcome.restoreLatencyMs = round(system.now() - posted) }
        stable = 0
      } else {
        stable += 1
      }
    }
    outcome.guardMs = round(system.now() - posted)
    outcome.screenHoldMs = round(min(system.now() - hold.startedAt, activationHoldCapMs))
    outcome.raiseLeft = targetFront || targetAbove
    hold.release()
    outcome.releasedAt = unixMilliseconds()
    return outcome
  }

  /// After the action's events: the deactivation subtype, unless the app really is active now. False only when the
  /// deactivation was due and its event could not be made (the app may still believe itself active).
  @discardableResult
  func deactivate() -> Bool {
    guard activated, system.frontmost() != pid else { return true }
    guard post(subtype: NSEvent.EventSubtype.applicationDeactivated.rawValue) else { return false }
    activated = false
    return true
  }

  /// The vendor's enforceActiveState for an app that does not believe it is active: subtype 1, then a left click at the
  /// window's AXActivationPoint when the point is inert (`activationClickDecision`), else the event alone.
  private func postActivation() {
    post(subtype: NSEvent.EventSubtype.applicationActivated.rawValue)
    activated = true
    epoch = realEpoch?()  // right after subtype 1: a real event from here on supersedes this activation
    let activationPoint = system.activationPoint(window)
    let system = system, pid = pid
    let decision = activationClickDecision(activationPoint, windowFrame: windowFrame, sparing: sparing) {
      activationPoint.flatMap { system.hitAt(pid, $0) }
    }
    click = decision
    guard decision == .posted, let point = activationPoint else { return }
    let target = ClickTarget(point: point, windowFrame: windowFrame, windowID: windowID, pid: pid)
    _ = postToProcess(clickEvents(target, button: .left, count: 1, flags: []), pid: pid, post: system.post)
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
