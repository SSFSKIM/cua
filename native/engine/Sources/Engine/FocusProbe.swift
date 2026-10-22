import AppKit
import ApplicationServices
import CryptoKit
import Foundation

// `cua-engine --probe focus [--window <pid,x,y,w,h>]` (Interfaces, UserProbe; the spec's Verification system, part 5):
// the system-wide focused application and its focused window, by pid and bounds, through the Accessibility API, plus
// `valueHash`, the SHA-256 of the focused element's value, reported only when the focused window is the one named — the
// harness's own user window, whose value a concurrent-use cell reads back without either engine. Before reading it sets
// AXManualAccessibility on the named pid and waits up to 1 s for the focused element to carry a value, as the engine
// waits for an AXWebArea, since a Chromium or Electron window exposes no value until an assistive client asks (the
// fixture must not enable itself, which would bypass the engine path the scene proves). No title, name or value is ever
// printed; a value is read only inside the named window and leaves as its hash.

/// The window `--window` names: its owner pid and its bounds in global points.
struct NamedWindow: Equatable {
  let pid: pid_t
  let bounds: CGRect

  /// `pid,x,y,w,h`: a positive pid and four numbers.
  static func parse(_ text: String) -> NamedWindow? {
    let parts = text.split(separator: ",", omittingEmptySubsequences: false).map(String.init)
    guard parts.count == 5, let pid = Int32(parts[0]), pid > 0 else { return nil }
    let numbers = parts.dropFirst().compactMap(Double.init)
    guard numbers.count == 4, numbers.allSatisfy(\.isFinite) else { return nil }
    return NamedWindow(pid: pid, bounds: CGRect(x: numbers[0], y: numbers[1], width: numbers[2], height: numbers[3]))
  }

  /// The same owner, and bounds within a point (the front-window probe's tolerance).
  func matches(pid owner: pid_t?, frame: CGRect?) -> Bool {
    guard owner == pid, let frame else { return false }
    return abs(frame.minX - bounds.minX) < 1 && abs(frame.minY - bounds.minY) < 1
      && abs(frame.width - bounds.width) < 1 && abs(frame.height - bounds.height) < 1
  }
}

/// What the probe read of the system's focus: pids, the bundle id and the window's frame only.
struct FocusReading {
  let appPid: pid_t?
  let bundleIdentifier: String?
  let windowPid: pid_t?
  let windowFrame: CGRect?
}

/// The SHA-256 of a value's UTF-8, lowercase hex.
func valueHash(_ value: String) -> String {
  SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined()
}

/// What one poll of the named window's value found.
enum ValuePoll: Equatable {
  /// The focused element, inside the named window, carries this value.
  case value(String)
  /// The named window still has the focus, but its focused element carries no value yet.
  case notYet
  /// The focus left the named window (another window, or the focused element is not inside it): no value is read.
  case focusMoved
}

/// Polls `read` every 50 ms until it answers a value, the focus moves, or `timeoutMs` has passed.
func awaitValue(timeoutMs: Double, now: () -> Double, sleep: (Double) -> Void, read: () -> ValuePoll) -> String? {
  let started = now()
  while true {
    switch read() {
    case .value(let value): return value
    case .focusMoved: return nil
    case .notYet: break
    }
    guard now() - started < timeoutMs else { return nil }
    sleep(50)
  }
}

/// The system's focus as the probe reads it, a seam so the poll's checks are testable.
struct FocusSource {
  /// The focused app and its focused window now.
  var reading: () -> FocusReading
  /// The focused app's focused element now: the owner pid and frame of the window it belongs to, and a reader of its
  /// value (called only once the element is known to sit in the named window).
  var focusedElement: () -> (windowPid: pid_t?, windowFrame: CGRect?, value: () -> String?)?
  /// Opens the process's WindowServer connection, before the first reading: the probe runs before NSApplication, and
  /// until the process has a connection the system-wide AXFocusedApplication answers kAXErrorCannotComplete (-25204)
  /// on every call, so no focused application is ever read (hold 2a).
  var connect: () -> Void = {}
}

/// One poll: the named window is still the focused one, and the focused element belongs to it, before its value is read.
func pollNamedValue(_ named: NamedWindow, source: FocusSource) -> ValuePoll {
  let now = source.reading()
  guard named.matches(pid: now.windowPid, frame: now.windowFrame) else { return .focusMoved }
  // An element that names no window yet cannot be placed: no read, but the wait goes on.
  guard let element = source.focusedElement(), element.windowPid != nil else { return .notYet }
  guard named.matches(pid: element.windowPid, frame: element.windowFrame) else { return .focusMoved }
  return element.value().map(ValuePoll.value) ?? .notYet
}

/// The probe's report: the focused app and window, whether the window is the named one, and the hash of the focused
/// element's value — read only while the named window keeps the focus and the element sits in it, re-checked before
/// every read, so a focus that moves during the wait reports no hash rather than another window's.
func focusReport(named: NamedWindow?, source: FocusSource, timeoutMs: Double = 1_000, now: () -> Double, sleep: (Double) -> Void) -> [String: Any] {
  source.connect()
  let reading = source.reading()
  let isNamed = named?.matches(pid: reading.windowPid, frame: reading.windowFrame) ?? false
  var report: [String: Any] = [
    "focusedApp": reading.appPid.map { ["pid": Int($0), "bundleId": reading.bundleIdentifier ?? NSNull()] as [String: Any] } ?? NSNull(),
    "focusedWindow": reading.windowPid.map { ["pid": Int($0), "bounds": rectWire(reading.windowFrame)] as [String: Any] } ?? NSNull(),
    "named": isNamed,
    "valueHash": NSNull(),
  ]
  if isNamed, let named, let value = awaitValue(timeoutMs: timeoutMs, now: now, sleep: sleep, read: { pollNamedValue(named, source: source) }) {
    report["valueHash"] = valueHash(value)
  }
  return report
}

extension Probe {
  /// `focus [--window <pid,x,y,w,h>]`: prints the report and exits 0; a malformed argument exits 64.
  static func focus(_ arguments: [String]) -> Int32 {
    var named: NamedWindow?
    switch arguments.count {
    case 0: break
    case 2 where arguments[0] == "--window":
      guard let window = NamedWindow.parse(arguments[1]) else { return emit(["error": "--window needs pid,x,y,w,h"], status: 64) }
      named = window
    default: return emit(["error": "usage: --probe focus [--window <pid,x,y,w,h>]"], status: 64)
    }
    if let named {
      // As the engine enables a web-shaped app: the named window's process exposes its tree and values from here on.
      AXUIElementSetAttributeValue(prepare(AXUIElementCreateApplication(named.pid)), "AXManualAccessibility" as CFString, kCFBooleanTrue)
    }
    var report = focusReport(named: named, source: liveFocusSource(), now: monotonicMilliseconds, sleep: { usleep(UInt32($0 * 1000)) })
    report["accessibility"] = AXIsProcessTrusted()
    report["at"] = Int(unixMilliseconds())
    return emit(report, status: 0)
  }

  /// The system-wide focus through the Accessibility API, read afresh on every call (a Chromium window may name its
  /// focused element only once it is enabled).
  private static func liveFocusSource() -> FocusSource {
    let system = prepare(AXUIElementCreateSystemWide())
    func application() -> AXUIElement? { elementAttribute(system, kAXFocusedApplicationAttribute) }
    return FocusSource(
      reading: {
        let application = application()
        let window = application.flatMap { elementAttribute($0, kAXFocusedWindowAttribute) }
        let appPid = application.map { pid(of: $0) }
        return FocusReading(appPid: appPid, bundleIdentifier: appPid.flatMap { NSRunningApplication(processIdentifier: $0)?.bundleIdentifier },
                            windowPid: window.map { pid(of: $0) }, windowFrame: window.flatMap { frame(of: $0) })
      },
      focusedElement: {
        guard let focused = application().flatMap({ elementAttribute($0, kAXFocusedUIElementAttribute) }) else { return nil }
        let window = elementAttribute(focused, kAXWindowAttribute)
        return (window.map { pid(of: $0) }, window.flatMap { frame(of: $0) }, {
          guard let value = attribute(focused, kAXValueAttribute) else { return nil }
          if CFGetTypeID(value) == CFStringGetTypeID() { return value as? String }
          if CFGetTypeID(value) == CFAttributedStringGetTypeID() { return (value as? NSAttributedString)?.string }
          return nil
        })
      },
      // One window list read opens the connection; nothing of it is kept.
      connect: { _ = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) })
  }
}
