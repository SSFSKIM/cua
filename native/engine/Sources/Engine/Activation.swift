import AppKit
import ApplicationServices
import Foundation

// Route 3, fake activation (the spec's Design, "Input" route 3; R/F-helper-logic.md §5.4–5.5, R/sky-behaviour.md §12):
// the app is made to believe it is active while the user's app stays frontmost. To the target pid: an AppKit-defined
// event of subtype 1 (application activated; flags 0xC0000, the window number) plus a left click at the window's
// AXActivationPoint with route 2's recipe. Around it, when another app is frontmost: screen updates held with the
// private SLSDisableUpdate/SLSReenableUpdate, and a 10 ms poll for up to 1 s that answers the target's window ordering
// above the user's focused window with AXRaise on the user's window, and the user's app losing frontmost with
// `activate(options: [])` on it. After the action's events, the matching deactivation (subtype 2) unless the app has
// really become active.
//
// M0 scope (a probe for keyboard actions into a background app and clicks inside a web view): stateless per action,
// and only the target's pid and window are posted to; the vendor's per-process taps and its SystemFocusStealPreventer,
// which tap the user's own app as well, are not built. The private calls are resolved with dlsym and skipped when
// absent. F does not give the poll's exit test; here it is the user's app frontmost and the target window not above
// the user's on three consecutive samples, and the user's app is re-activated as soon as it is seen to lose frontmost
// rather than after the poll.

/// SkyLight's update hold (F §11, salts 16 and 17) and the connection it takes.
private enum SkyLight {
  typealias ConnectionID = @convention(c) () -> Int32
  typealias Update = @convention(c) (Int32) -> Int32
  static let mainConnectionID: ConnectionID? = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "SLSMainConnectionID").map { unsafeBitCast($0, to: ConnectionID.self) }
  static let disableUpdate: Update? = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "SLSDisableUpdate").map { unsafeBitCast($0, to: Update.self) }
  static let reenableUpdate: Update? = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "SLSReenableUpdate").map { unsafeBitCast($0, to: Update.self) }
}

/// The process holding key focus, by the private CPSGetKeyFocusProcess and the Process Manager's GetProcessPID (both
/// by dlsym; nil when either is absent or fails).
private enum KeyFocus {
  typealias GetKeyFocusProcess = @convention(c) (UnsafeMutablePointer<ProcessSerialNumber>) -> Int32
  typealias GetProcessPID = @convention(c) (UnsafePointer<ProcessSerialNumber>, UnsafeMutablePointer<pid_t>) -> Int32
  static let getKeyFocusProcess: GetKeyFocusProcess? = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "CPSGetKeyFocusProcess").map { unsafeBitCast($0, to: GetKeyFocusProcess.self) }
  static let getProcessPID: GetProcessPID? = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "GetProcessPID").map { unsafeBitCast($0, to: GetProcessPID.self) }

  static func pid() -> pid_t? {
    guard let getKeyFocusProcess, let getProcessPID else { return nil }
    var process = ProcessSerialNumber()
    guard getKeyFocusProcess(&process) == 0 else { return nil }
    var pid: pid_t = 0
    return getProcessPID(&process, &pid) == 0 && pid > 0 ? pid : nil
  }
}

func frontmostPid() -> pid_t? { NSWorkspace.shared.frontmostApplication?.processIdentifier }

/// Whether the app believes it has focus: it is frontmost, or holds key focus.
func appBelievesItHasFocus(_ pid: pid_t) -> Bool { frontmostPid() == pid || KeyFocus.pid() == pid }

/// The on-screen order of two windows: true when `window` is in front of `other` (CGWindowList lists front to back).
private func isInFront(_ window: CGWindowID, of other: CGWindowID) -> Bool {
  guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return false }
  for info in list {
    guard let number = (info[kCGWindowNumber as String] as? Int).map({ CGWindowID($0) }) else { continue }
    if number == window { return true }
    if number == other { return false }
  }
  return false
}

func activationFailed(_ detail: String) -> EngineError { EngineError(name: "activationFailed", "The app could not be prepared for input: \(detail).") }

/// One action's fake activation of the app `pid` for its window.
final class FakeActivation {
  let pid: pid_t
  let window: AXUIElement
  let windowFrame: CGRect?
  let windowID: CGWindowID?
  private(set) var activated = false
  /// How long the guard held after the activation pair, for the result's meta; nil when no guard ran.
  private(set) var guardMs: Double?

  init(pid: pid_t, window: AXUIElement) {
    self.pid = pid
    self.window = window
    windowFrame = frame(of: window)
    windowID = windowNumber(of: window, pid: pid, frame: windowFrame)
  }

  /// The vendor's safelyEnforceActiveState: nothing when the app believes it has focus; otherwise the activation pair,
  /// guarded so the user's app stays frontmost with its window on top.
  func activate() throws {
    guard !appBelievesItHasFocus(pid) else { return }
    guard let user = NSWorkspace.shared.frontmostApplication, user.processIdentifier != pid else {
      postActivation()
      return
    }
    let userApplication = prepare(AXUIElementCreateApplication(user.processIdentifier))
    let userWindow = elementAttribute(userApplication, kAXFocusedWindowAttribute)
    let userWindowID = userWindow.flatMap { windowNumber(of: $0, pid: user.processIdentifier, frame: frame(of: $0)) }
    let connection = SkyLight.mainConnectionID?()
    if let connection { _ = SkyLight.disableUpdate?(connection) }
    defer { if let connection { _ = SkyLight.reenableUpdate?(connection) } }
    postActivation()
    // A guard that fails after the activation pair was posted still leaves the app believing it is active: undo the
    // activation before the error leaves this method (the deferred deactivate is idempotent).
    defer { if !appBelievesItHasFocus(pid) { deactivate() } }
    let started = monotonicMilliseconds()
    defer { guardMs = ((monotonicMilliseconds() - started) * 1000).rounded() / 1000 }
    let deadline = started + 1_000
    var stable = 0
    while stable < 3 {
      guard monotonicMilliseconds() < deadline else { throw activationFailed("the user's app did not stay frontmost") }
      usleep(10_000)
      var settled = true
      if frontmostPid() != user.processIdentifier {
        settled = false
        guard user.activate(options: []) else { throw activationFailed("the user's app could not be made frontmost again") }
      }
      if let windowID, let userWindowID, let userWindow, isInFront(windowID, of: userWindowID) {
        settled = false
        AXUIElementPerformAction(userWindow, kAXRaiseAction as CFString)
      }
      stable = settled ? stable + 1 : 0
    }
  }

  /// After the action's events: the deactivation subtype, unless the app really is active now.
  func deactivate() {
    guard activated, frontmostPid() != pid else { return }
    post(subtype: NSEvent.EventSubtype.applicationDeactivated.rawValue)
    activated = false
  }

  /// The vendor's enforceActiveState for an app that does not believe it is active: subtype 1, then a left click at the
  /// window's AXActivationPoint (when the window has one).
  private func postActivation() {
    post(subtype: NSEvent.EventSubtype.applicationActivated.rawValue)
    activated = true
    guard let point = point(attribute(window, "AXActivationPoint")) else { return }
    let target = ClickTarget(point: point, windowFrame: windowFrame, windowID: windowID, pid: pid)
    _ = postToProcess(clickEvents(target, button: .left, count: 1, flags: []), pid: pid)
  }

  private func post(subtype: Int16) {
    guard let event = NSEvent.otherEvent(with: .appKitDefined, location: .zero, modifierFlags: NSEvent.ModifierFlags(rawValue: 0xC0000),
                                         timestamp: 0, windowNumber: Int(windowID ?? 0), context: nil, subtype: subtype, data1: 0, data2: 0)?.cgEvent
    else { return }
    event.timestamp = DispatchTime.now().uptimeNanoseconds
    event.postToPid(pid)
  }
}
