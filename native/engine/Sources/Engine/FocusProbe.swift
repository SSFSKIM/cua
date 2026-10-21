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

/// Polls `read` every 50 ms until it answers a value or `timeoutMs` has passed.
func awaitValue(timeoutMs: Double, now: () -> Double, sleep: (Double) -> Void, read: () -> String?) -> String? {
  let started = now()
  while true {
    if let value = read() { return value }
    guard now() - started < timeoutMs else { return nil }
    sleep(50)
  }
}

/// The probe's report: the focused app and window, whether the window is the named one, and the hash of the focused
/// element's value — `value` is asked only for the named window.
func focusReport(_ reading: FocusReading, named: NamedWindow?, value: () -> String?) -> [String: Any] {
  let isNamed = named?.matches(pid: reading.windowPid, frame: reading.windowFrame) ?? false
  var report: [String: Any] = [
    "focusedApp": reading.appPid.map { ["pid": Int($0), "bundleId": reading.bundleIdentifier ?? NSNull()] as [String: Any] } ?? NSNull(),
    "focusedWindow": reading.windowPid.map { ["pid": Int($0), "bounds": rectWire(reading.windowFrame)] as [String: Any] } ?? NSNull(),
    "named": isNamed,
    "valueHash": NSNull(),
  ]
  if isNamed, let read = value() { report["valueHash"] = valueHash(read) }
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
    let system = prepare(AXUIElementCreateSystemWide())
    let application = elementAttribute(system, kAXFocusedApplicationAttribute)
    let window = application.flatMap { elementAttribute($0, kAXFocusedWindowAttribute) }
    let appPid = application.map { pid(of: $0) }
    let reading = FocusReading(appPid: appPid, bundleIdentifier: appPid.flatMap { NSRunningApplication(processIdentifier: $0)?.bundleIdentifier },
                               windowPid: window.map { pid(of: $0) }, windowFrame: window.flatMap { frame(of: $0) })
    var report = focusReport(reading, named: named) {
      awaitValue(timeoutMs: 1_000, now: monotonicMilliseconds, sleep: { usleep(UInt32($0 * 1000)) }) {
        // The focused element is read again on every poll: a Chromium window may name it only once it is enabled.
        guard let application, let focused = elementAttribute(application, kAXFocusedUIElementAttribute),
              let value = attribute(focused, kAXValueAttribute) else { return nil }
        if CFGetTypeID(value) == CFStringGetTypeID() { return value as? String }
        if CFGetTypeID(value) == CFAttributedStringGetTypeID() { return (value as? NSAttributedString)?.string }
        return nil
      }
    }
    report["accessibility"] = AXIsProcessTrusted()
    report["at"] = Int(unixMilliseconds())
    return emit(report, status: 0)
  }
}
