import AppKit
import ApplicationServices
import Foundation
import os

// Enablement (the spec's Design, "Observation (skyshot)"; F §1.7, §1.9). An application element that lists
// AXManualAccessibility gets it set (Electron, Chromium), else one that lists AXEnhancedUserInterface gets that, never
// both. The attribute is re-read on every observation and set only when it does not read true (the vendor's rule; the
// critique of 2026-10-19, A3, withdrew the once-per-process memory, which a process that resets the attribute defeats).
// cua's departures: enablement is set only on web-shaped apps (F §1.7's detection) and the vendor's named bundles
// (`com.apple.iWork*`, `com.spotify.client`), where the vendor sets AXEnhancedUserInterface on any app that lists it in
// its full-UI context, since that attribute changes how an AppKit app (the owner's Finder) behaves while it stays set
// (Decision Log, T1's re-review); and the engine **releases** what it set: when the last connection that observed the
// process closes (or the engine shuts down), it writes the attribute back to false. It owns, and so releases, only an
// attribute it read false and then set: one that read true, or could not be read, may be VoiceOver's or another
// assistive client's and is never written back. A failed write back is logged and retried at a later close or the
// shutdown. The release is a declared difference, since the vendor never unsets, and a web app left in
// full-accessibility mode after cua is done is interference (A3). The first observation after enabling, and every
// observation of a Chromium window until a web area has been seen in the process, waits 100 ms and then up to 1 s for
// an AXWebArea to appear. The vendor's Spotify fake activation before enabling is route 3's and is not done here.

private let enablementLog = Logger(subsystem: "io.github.ssfskim.cua.engine", category: "enablement")

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

/// How the enablement reaches one process's application element: its attribute names (nil while they cannot be read,
/// a process still launching), one attribute's Boolean value (nil when unreadable), a write, and whether the process is
/// still the one observed (a pid an ended process left behind may be another launch's by the time of a release).
struct EnablementAccess: @unchecked Sendable {
  var listed: () -> [String]?
  var read: (String) -> Bool?
  var write: (String, Bool) -> Bool
  var current: () -> Bool

  /// The application element of process `pid`, launched at `launched`.
  static func live(pid: pid_t, launched: Date?) -> EnablementAccess {
    let application = prepare(AXUIElementCreateApplication(pid))
    return EnablementAccess(
      listed: {
        var names: CFArray?
        return AXUIElementCopyAttributeNames(application, &names) == .success ? (names as? [String] ?? []) : nil
      },
      read: { bool(attribute(application, $0)) },
      write: { AXUIElementSetAttributeValue(application, $0 as CFString, ($1 ? kCFBooleanTrue : kCFBooleanFalse)!) == .success },
      current: { NSRunningApplication(processIdentifier: pid).map { $0.launchDate == launched && !$0.isTerminated } ?? false })
  }
}

/// One process's enablement as the engine left it. `io` serializes the process's reads and writes, so a release's write
/// and a new observation's read never interleave; the fields are touched only under it.
private final class EnabledProcess: @unchecked Sendable {
  let io = NSLock()
  let access: EnablementAccess
  /// The attribute the process lists (`enablementAttribute`), once its names could be read; `.some(nil)`: neither.
  var listed: String??
  /// The attribute the engine set after reading it false, which it releases; nil otherwise.
  var owned: String?

  init(access: EnablementAccess) { self.access = access }
}

/// Per engine: which bundles are web-shaped, per process (by pid and launch date, so a relaunch that reuses a pid starts
/// over) the enablement the engine set and the connections that observed it, and the processes a web area was seen in.
final class WebAccessibility: @unchecked Sendable {
  private let lock = NSLock()
  private var webShapedByPath: [String: Bool] = [:]
  private var webAreaSeen: Set<String> = []
  private var processes: [String: EnabledProcess] = [:]
  private var observers: [String: Set<Int>] = [:]
  /// Told (a bounded, value-free line) when a reset of the attribute the engine set fails; it stays owned.
  private let releaseFailed: (String) -> Void

  init(releaseFailed: @escaping (String) -> Void = { enablementLog.error("\($0, privacy: .public)") }) {
    self.releaseFailed = releaseFailed
  }

  /// The connections observing a process now.
  func observers(pid: pid_t, launched: Date?) -> Set<Int> {
    lock.lock()
    defer { lock.unlock() }
    return observers[Self.process(pid, launched)] ?? []
  }

  private static func process(_ pid: pid_t, _ launched: Date?) -> String { "\(pid)@\(launched?.timeIntervalSince1970 ?? 0)" }

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

  /// An observation of an eligible process by `connection`: the connection is recorded as observing it, and the one
  /// enablement attribute the process lists is set when it does not read true now. Returns the attribute this call set
  /// (nil when none is listed, the names cannot be read yet, it reads true, or the write failed).
  func enable(pid: pid_t, launched: Date?, connection: Int, access: EnablementAccess) -> String? {
    let key = Self.process(pid, launched)
    lock.lock()
    let entry = processes[key] ?? EnabledProcess(access: access)
    processes[key] = entry
    observers[key, default: []].insert(connection)
    lock.unlock()

    entry.io.lock()
    defer { entry.io.unlock() }
    if entry.listed == nil, let names = entry.access.listed() { entry.listed = .some(enablementAttribute(listed: names)) }
    guard let listed = entry.listed, let name = listed else { return nil }
    let prior = entry.access.read(name)
    guard prior != true, entry.access.write(name, true) else { return nil }
    // Owned, and so released later, only when it read false (A3): an unreadable value may be another client's.
    if prior == false { entry.owned = name }
    return name
  }

  /// `connection` closed: every process it observed that no other connection observes is released.
  func release(connection: Int) {
    lock.lock()
    var emptied: [(String, EnabledProcess)] = []
    for (key, var set) in observers where set.contains(connection) {
      set.remove(connection)
      observers[key] = set
      if set.isEmpty, let entry = processes[key] { emptied.append((key, entry)) }
    }
    lock.unlock()
    for (key, entry) in emptied { releaseIfUnobserved(key, entry) }
  }

  /// The engine shuts down: every process is released, whoever observed it.
  func releaseAll() {
    lock.lock()
    let all = Array(processes)
    observers = [:]
    lock.unlock()
    for (key, entry) in all { releaseIfUnobserved(key, entry) }
  }

  /// Writes back what the engine set on a process no connection observes now, then retires the process (with its web
  /// area, whose tree may go with the attribute, so a later enabling waits for it again). The entry stays discoverable
  /// through the reset, so an observation that begins meanwhile shares its lock and reads after the reset (setting the
  /// attribute again, owned); it is retired only afterwards, by an atomic re-check that no observer registered. A reset
  /// that fails keeps the ownership and the entry, so a later close or the shutdown retries it, and is logged.
  private func releaseIfUnobserved(_ key: String, _ entry: EnabledProcess) {
    entry.io.lock()
    defer { entry.io.unlock() }
    guard unobserved(key) else { return }
    var reset = false
    if let owned = entry.owned {
      if !entry.access.current() {
        entry.owned = nil  // the process ended (its pid may be another launch's): nothing to write back
      } else if entry.access.write(owned, false) {
        entry.owned = nil
        reset = true
      } else {
        releaseFailed("enablement release failed: \(owned) on pid \(key.prefix { $0 != "@" }); kept for a later close or shutdown")
      }
    }
    lock.lock()
    if reset { webAreaSeen.remove(key) }
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

private func containsWebArea(_ window: AXUIElement) -> Bool {
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
