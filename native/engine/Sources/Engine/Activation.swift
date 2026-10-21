import AppKit
import ApplicationServices
import Foundation

// Route 3, fake activation (the spec's Design, "Input" route 3; R/F-helper-logic.md §5.4–5.5, R/sky-behaviour.md §12):
// the app is made to believe it is active while the user's app stays frontmost. To the target pid: an AppKit-defined
// event of subtype 1 (application activated; flags 0xC0000, the window number) plus a left click at the window's
// AXActivationPoint with route 2's recipe, the click skipped when that point lies outside the window's frame (cua's
// declared difference, the second sitting's U13). Around it, when another app is frontmost: screen updates held with the
// private SLSDisableUpdate/SLSReenableUpdate, released when the guard ends or, by a timer, at `activationHoldCapMs`,
// whichever is first, so a slow guard (a raise waiting out its AX timeout included) never freezes the display for long;
// and a 10 ms poll for up to 1 s that answers the target's
// window ordering above the user's focused window with AXRaise on the user's window. The guard fails, and the action is
// refused as activationFailed with its own events never posted (never retried with ⌘), when the poll times out or the
// user's app loses frontmost: when the engine's own action brought the target to the front (the target's process, or
// the bound app's when the target is a panel served by another process) the user's app is made frontmost again first;
// when a third app did (most likely the user's own switch) the front is left alone. After the action's events, the
// matching deactivation (subtype 2) unless the app has really become active.
//
// Stateless per action (the activation stays per action in M2a, the second sitting's ruling), and only the target's
// pid and window are posted to; the vendor's per-process taps and its SystemFocusStealPreventer, which tap the user's
// own app as well, are not built. The private calls are resolved with dlsym and skipped when absent. F does not give the
// poll's exit test; here it is the user's app frontmost and the target window not above the user's on three
// consecutive samples.

/// How long the screen-update hold may last: well under the guard's 1 s poll, and above the guards the sittings
/// measured (37–58 ms, a coordinate click into TextEdit 82), so a guard of the usual length holds as the vendor's does.
let activationHoldCapMs: Double = 100
/// The guard's poll: every 10 ms for up to 1 s (F §5.5).
let activationGuardTimeoutMs: Double = 1_000
let activationGuardSampleMs: Double = 10

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
  var holdScreenUpdates: () -> () -> Void = { SkyLight.hold() }  // answers the release
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

  /// The vendor's safelyEnforceActiveState: nothing when the app believes it has focus; otherwise the activation pair,
  /// guarded so the user's app stays frontmost with its window on top. A throw after the pair (the guard's failure)
  /// leaves the activation in place — every caller's `defer { deactivate() }` undoes it on all of its own paths, so
  /// nothing here may undo it too, or a successful pair is undone before the caller's events are posted.
  func activate() throws {
    guard !system.believesItHasFocus(pid) else { return }
    guard let user = system.frontmost(), user != pid else {
      postActivation()
      return
    }
    // The user's window the target's must stay behind, and how it is brought back on top.
    let userWindow: (id: CGWindowID, restore: () -> Void)?
    let system = system
    if restoresByActivationOnly {
      userWindow = system.userWindowNumber(user).map { id in (id, { _ = system.reactivate(user) }) }
    } else {
      userWindow = system.userWindow(user).map { found in (found.id, { system.raise(found.element) }) }
    }
    let release = OnceRelease(system.holdScreenUpdates())
    defer { release() }
    system.schedule(activationHoldCapMs) { release() }
    postActivation()
    let started = system.now()
    defer { guardMs = ((system.now() - started) * 1000).rounded() / 1000 }
    var stable = 0
    while stable < 3 {
      system.sleep(activationGuardSampleMs)
      let elapsed = system.now() - started
      let front = system.frontmost()
      if front != user {
        if let front, front == pid || front == appPid {
          throw activationFailed(system.reactivate(user)
            ? "the app came to the front, and the frontmost app was restored"
            : "the app came to the front, and the frontmost app could not be restored")
        }
        throw activationFailed("another app came to the front")
      }
      if let windowID, let userWindow, system.isInFront(windowID, userWindow.id) {
        stable = 0
        userWindow.restore()
      } else {
        stable += 1
      }
      if stable < 3 && elapsed >= activationGuardTimeoutMs {
        throw activationFailed("the app's window did not stay behind the frontmost window within 1 s")
      }
    }
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
  /// window's AXActivationPoint when that point lies inside the window's frame and outside the spared area.
  private func postActivation() {
    post(subtype: NSEvent.EventSubtype.applicationActivated.rawValue)
    activated = true
    guard let point = activationClickPoint(system.activationPoint(window), windowFrame: windowFrame, sparing: sparing) else { return }
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
