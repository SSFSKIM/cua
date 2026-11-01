import ApplicationServices
import Foundation

// The desktop gate (#237, Decision Log 2026-11-01 amendment): the one chokepoint for every call by which the engine acts
// on the real desktop or another process's GUI: an app's launch or reopen through NSWorkspace, an activation, a CGEvent
// posted to a process or the HID tap, an Accessibility action or attribute write on another process's element, the
// screen-update hold, a write to the general pasteboard, and the agent cursor's panel ordered onto the screen. Reads
// (an observation, the window list, a capture) are not acts and do not pass through it.
//
// In the engine it is open, and passing costs a flag read. It is closed in any process that has XCTest loaded, which is
// to say in the engine's unit tests from the moment the test bundle loads, so no test can forget to close it: a call
// that reaches the real system there instead of a stub is refused (it does nothing, or throws `desktopGateClosed` where
// the call can throw), recorded here, and reported to `onRefusal`, which the test bundle's observer turns into a failure
// of the running test. The probe (`--probe`) and the debug executable the integration tests run directly never load
// XCTest, so they act.
enum DesktopGate {
  /// Whether the gate refuses: XCTest is loaded in this process.
  static let closed: Bool = NSClassFromString("XCTestCase") != nil

  private static let lock = NSLock()
  nonisolated(unsafe) private static var refusedCalls: [String] = []
  nonisolated(unsafe) private static var refusalHandler: (@Sendable (String) -> Void)?

  /// Told each refused call, on the caller's thread (the test bundle's observer, which fails the running test).
  static var onRefusal: (@Sendable (String) -> Void)? {
    get { lock.withLock { refusalHandler } }
    set { lock.withLock { refusalHandler = newValue } }
  }

  /// Every call refused so far, in order (the gate's own record).
  static var refusals: [String] { lock.withLock { refusedCalls } }

  /// True when `call` may act: always while open; while closed it is recorded and reported, and the caller must not act.
  static func allows(_ call: String) -> Bool {
    guard closed else { return true }
    let handler = lock.withLock { () -> (@Sendable (String) -> Void)? in
      refusedCalls.append(call)
      return refusalHandler
    }
    FileHandle.standardError.write(Data("cua-engine: the desktop gate refused \(call) (a unit test reached the real system; stub it through its seam)\n".utf8))
    handler?(call)
    return false
  }

  /// Throws `desktopGateClosed`, naming `call`, when it may not act.
  static func check(_ call: String) throws {
    guard allows(call) else {
      throw EngineError(name: "desktopGateClosed", "The desktop gate is closed (a unit test): \(call) was refused rather than run")
    }
  }
}

// The real acts, each through the gate: the defaults the seams fall back on.

/// Posts `event` to process `pid`.
func gatedPost(_ event: CGEvent, _ pid: pid_t) {
  if DesktopGate.allows("CGEvent.postToPid") { event.postToPid(pid) }
}

/// Posts `event` at the HID event tap (the keystroke probe's stand-in for a person).
func gatedPostToHIDTap(_ event: CGEvent) {
  if DesktopGate.allows("CGEvent.post(tap: .cghidEventTap)") { event.post(tap: .cghidEventTap) }
}

/// Performs an Accessibility action; `.cannotComplete` when refused.
func gatedPerform(_ element: AXUIElement, _ action: String) -> AXError {
  DesktopGate.allows("AXUIElementPerformAction(\(action))") ? AXUIElementPerformAction(element, action as CFString) : .cannotComplete
}

/// Writes an Accessibility attribute; `.cannotComplete` when refused.
func gatedWrite(_ element: AXUIElement, _ attribute: String, _ value: CFTypeRef) -> AXError {
  DesktopGate.allows("AXUIElementSetAttributeValue(\(attribute))") ? AXUIElementSetAttributeValue(element, attribute as CFString, value) : .cannotComplete
}
