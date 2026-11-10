// Hosted fixture AX observer and isolated-step carrier. Compiling this file does not drive a GUI.
import AppKit
import ApplicationServices
import Foundation

func now359() -> Double { Date().timeIntervalSince1970 * 1000 }
func read359(_ e: AXUIElement, _ name: String) -> CFTypeRef? {
  var value: CFTypeRef?; return AXUIElementCopyAttributeValue(e, name as CFString, &value) == .success ? value : nil
}
func element359(_ value: CFTypeRef?) -> AXUIElement? {
  guard let value, CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
  let e = value as! AXUIElement; AXUIElementSetMessagingTimeout(e, 0.1); return e
}
var field359: AXUIElement?
var observer359: AXObserver?
var timer359: Timer?
var events359: [[String: Any]] = []
var pid359: pid_t = 0
var observed359 = false
var registrations359: [[String: Any]] = []
var coverPid359: pid_t = 0
var lastOrder359: Double = 0
func order359() -> [String: Any] {
  let windows = (CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []).filter { ($0[kCGWindowLayer as String] as? Int) == 0 }
  let order = windows.compactMap { w -> [String: Int]? in
    guard let pid = w[kCGWindowOwnerPID as String] as? Int, let id = w[kCGWindowNumber as String] as? Int else { return nil }
    return ["pid": pid, "id": id]
  }
  let b = order.firstIndex { $0["pid"] == Int(pid359) }, c = order.firstIndex { $0["pid"] == Int(coverPid359) }
  return ["order": order, "browserAboveCover": b != nil && c != nil ? (b! < c!) as Any : NSNull()]
}
func event359(_ kind: String, _ extra: [String: Any] = [:]) {
  guard events359.count < 10_000 else { return }
  var e = extra; e["kind"] = kind; e["at"] = now359(); e["monoMs"] = ProcessInfo.processInfo.systemUptime * 1000
  e["seq"] = events359.count; e["frontmostPid"] = NSWorkspace.shared.frontmostApplication?.processIdentifier as Any? ?? NSNull()
  events359.append(e)
}
func sample359() {
  guard let f = field359 else { return }
  if now359() - lastOrder359 >= 50 { lastOrder359 = now359(); event359("window-order", order359()) }
  let started = now359(); var range: [Int]?
  if let value = read359(f, kAXSelectedTextRangeAttribute), CFGetTypeID(value) == AXValueGetTypeID() {
    var r = CFRange(); if AXValueGetValue(value as! AXValue, .cfRange, &r) { range = [r.location, r.length] }
  }
  event359("sample", ["startedAt": started, "range": range as Any? ?? NSNull(), "focused": read359(f, kAXFocusedAttribute) as Any? ?? NSNull()])
}
func disarm359() {
  timer359?.invalidate(); timer359 = nil
  if let observer359 { CFRunLoopRemoveSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(observer359), .defaultMode) }
  observer359 = nil; field359 = nil; observed359 = false
}
func handle359(_ q: [String: Any]) -> [String: Any] {
  let started = now359(), op = q["op"] as? String ?? ""
  var out: [String: Any] = ["startedAt": started]
  if op == "bind" {
    disarm359(); events359 = []; registrations359 = []
    pid359 = (q["pid"] as? NSNumber)?.int32Value ?? 0
    coverPid359 = (q["coverPid"] as? NSNumber)?.int32Value ?? 0
    lastOrder359 = 0
    let app = AXUIElementCreateApplication(pid359); AXUIElementSetMessagingTimeout(app, 0.1)
    let expected = q["title"] as? String ?? ""
    guard expected.hasPrefix("probe354:"), let w = element359(read359(app, kAXFocusedWindowAttribute)),
          (read359(w, kAXTitleAttribute) as? String)?.contains(expected) == true else { return ["error": "visible owner window mismatch", "startedAt": started, "endedAt": now359()] }
    var nodes = [w], i = 0
    while i < nodes.count && i < 5000 {
      let e = nodes[i]; i += 1
      let role = read359(e, kAXRoleAttribute) as? String ?? ""
      let label = [read359(e, kAXTitleAttribute) as? String, read359(e, kAXDescriptionAttribute) as? String].compactMap { $0 }.joined(separator: " ")
      if (role == "AXTextArea" || role == "AXTextField") && (label.contains("Draft control") || label.contains("Message Body")) {
        var subrole: CFTypeRef?
        let err = AXUIElementCopyAttributeValue(e, kAXSubroleAttribute as CFString, &subrole)
        guard err == .success || err == .noValue || err == .attributeUnsupported,
              subrole == nil || CFGetTypeID(subrole!) == CFStringGetTypeID(), (subrole as? String) != "AXSecureTextField" else { break }
        field359 = e; out["element"] = CFHash(e); out["role"] = role; break
      }
      if let list = read359(e, kAXChildrenAttribute) as? [AnyObject] { nodes += list.compactMap { element359($0 as CFTypeRef) } }
    }
    guard let f = field359 else { return ["error": "fixture text field unavailable", "startedAt": started, "endedAt": now359()] }
    observed359 = q["observe"] as? Bool == true
    if observed359 {
      var observer: AXObserver?
      let created = AXObserverCreate(pid359, { _, element, notification, _ in event359("notification", ["name": notification as String, "element": CFHash(element)]) }, &observer)
      out["observerCreateError"] = created.rawValue
      if let observer {
        observer359 = observer
        for (element, name) in [(f, kAXSelectedTextChangedNotification), (f, kAXFocusedUIElementChangedNotification), (app, kAXFocusedUIElementChangedNotification)] {
          let error = AXObserverAddNotification(observer, element, name as CFString, nil)
          registrations359.append(["name": name, "element": CFHash(element), "error": error.rawValue])
        }
        CFRunLoopAddSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(observer), .defaultMode)
      }
      timer359 = Timer.scheduledTimer(withTimeInterval: 0.01, repeats: true) { _ in sample359() }
      sample359()
    }
    out["registrations"] = registrations359
  } else if op == "mutate" {
    guard let f = field359 else { return ["error": "no bound field"] }
    let kind = q["kind"] as? String ?? ""
    // Safari's AXFocused write is known to raise it: it is never an isolation arm.
    guard (kind == "focus-only" && q["browser"] as? String == "cft") || kind == "range-only" || (kind == "press-only" && q["browser"] as? String == "firefox") else { return ["error": "unsupported isolation"] }
    event359("mutation-start", ["name": kind]); var error = AXError.failure
    if kind == "range-only" { var range = CFRange(location: 3, length: 0); error = AXUIElementSetAttributeValue(f, kAXSelectedTextRangeAttribute as CFString, AXValueCreate(.cfRange, &range)!) }
    else if kind == "focus-only" { error = AXUIElementSetAttributeValue(f, kAXFocusedAttribute as CFString, kCFBooleanTrue) }
    else { error = AXUIElementPerformAction(f, kAXPressAction as CFString) }
    event359("mutation-end", ["name": kind, "error": error.rawValue]); out["axError"] = error.rawValue
    if error != .success { out["error"] = "isolated AX step failed" }
  } else if op == "mark" {
    out["windows"] = order359(); event359("mark", ["windows": order359()])
  } else if op == "stop" {
    event359("window-order", order359()); event359("stop"); out["events"] = events359; out["registrations"] = registrations359; out["truncated"] = events359.count >= 10_000
    disarm359()
  } else { out["error"] = "unknown operation" }
  out["endedAt"] = now359(); return out
}
if ProcessInfo.processInfo.environment["RUNNER_ENVIRONMENT"] != "github-hosted" { fputs("hosted fixture only\n", stderr); exit(2) }
let frontObserver359 = NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { note in
  if let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication { event359("workspace-activation", ["pid": app.processIdentifier]) }
}
Thread.detachNewThread {
  while let line = readLine() {
    let data = Data(line.utf8)
    DispatchQueue.main.async {
      do { let q = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        let answer = handle359(q)
        print(String(data: try JSONSerialization.data(withJSONObject: answer, options: [.sortedKeys]), encoding: .utf8)!); fflush(stdout)
      } catch { print("{\"error\":\"bad request\"}"); fflush(stdout) }
    }
  }
  exit(0)
}
// Keep the command loop alive even before the first observer or sampling timer is armed.
let keepAlive359 = Port()
RunLoop.current.add(keepAlive359, forMode: .default)
RunLoop.current.run()
