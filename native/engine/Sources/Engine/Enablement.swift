import ApplicationServices
import Foundation

// Enablement (the spec's Design, "Observation (skyshot)"; F §1.7, §1.9). An application element that lists
// AXManualAccessibility gets it set (Electron, Chromium), else one that lists AXEnhancedUserInterface gets that, never
// both, once per process; the first observation after enabling, and every observation of a Chromium window, waits
// 100 ms and then up to 1 s for an AXWebArea to appear. cua's departure (Decision Log, T1's re-review): enablement is
// set only on web-shaped apps (F §1.7's detection) and the vendor's named bundles (`com.apple.iWork*`,
// `com.spotify.client`), where the vendor sets AXEnhancedUserInterface on any app that lists it in its full-UI context;
// that attribute changes how an AppKit app (the owner's Finder) behaves for as long as it stays set. The vendor's
// Spotify fake activation before enabling is route 3's and is not done here.

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

/// Per engine: which bundles are web-shaped, and which processes were already considered for enablement.
final class WebAccessibility: @unchecked Sendable {
  private let lock = NSLock()
  private var webShapedByPath: [String: Bool] = [:]
  private var considered: Set<pid_t> = []

  func isWebShaped(_ appPath: String) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    if let known = webShapedByPath[appPath] { return known }
    let info = (NSDictionary(contentsOfFile: appPath + "/Contents/Info.plist") as? [String: Any]) ?? [:]
    let shaped = webShaped(info: info)
    webShapedByPath[appPath] = shaped
    return shaped
  }

  /// Sets the one enablement attribute on an eligible process the first time it is observed; returns the attribute
  /// this call set (nil when none is listed, it was already true, or the process was considered before).
  func enable(_ application: AXUIElement, pid: pid_t) -> String? {
    lock.lock()
    let seen = considered.contains(pid)
    lock.unlock()
    guard !seen else { return nil }
    var names: CFArray?
    // A process whose attribute names cannot be read yet (still launching) is considered again next time.
    guard AXUIElementCopyAttributeNames(application, &names) == .success else { return nil }
    lock.lock()
    let first = considered.insert(pid).inserted
    lock.unlock()
    guard first, let name = enablementAttribute(listed: names as? [String] ?? []) else { return nil }
    if bool(attribute(application, name)) == true { return nil }
    return AXUIElementSetAttributeValue(application, name as CFString, kCFBooleanTrue) == .success ? name : nil
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
