// Runner-only side tool for the #354 fence spike: foreground checks, clipboard writes, window titles and focused AX evidence.
// One JSON request per stdin line, one JSON answer per stdout line. focusEvidence never activates or moves focus;
// only publicValue/public-rendered may read a public fixture's text-entry value. labelsOnly/terminal-tab never reads values.
import AppKit
import ApplicationServices
import Foundation

func windowTitles(_ pid: pid_t) -> [String] {
  let app = AXUIElementCreateApplication(pid)
  AXUIElementSetMessagingTimeout(app, 0.5)
  var raw: CFTypeRef?
  guard AXUIElementCopyAttributeValue(app, kAXWindowsAttribute as CFString, &raw) == .success, let windows = raw as? [AnyObject] else { return [] }
  return windows.compactMap { item in
    guard CFGetTypeID(item as CFTypeRef) == AXUIElementGetTypeID() else { return nil }
    var title: CFTypeRef?
    guard AXUIElementCopyAttributeValue(item as! AXUIElement, kAXTitleAttribute as CFString, &title) == .success else { return nil }
    return title as? String
  }
}

func focusAttributeString(_ element: AXUIElement, _ attribute: String) -> String? {
  var raw: CFTypeRef?
  guard AXUIElementCopyAttributeValue(element, attribute as CFString, &raw) == .success else { return nil }
  return raw as? String
}

func focusEvidence(_ q: [String: Any]) -> [String: Any] {
  let mode = q["mode"] as? String
  let lane = q["lane"] as? String
  let labelsOnly = mode == "labelsOnly"
  // readable means a string AXValue was obtained, not that labels were available.
  // secure is null until classification, or true if either known identifier is secure.
  var evidence: [String: Any] = [
    "ok": false, "role": NSNull(), "subrole": NSNull(), "secure": NSNull(),
    "readable": false, "valueRead": false
  ]
  var labels: [String: Any] = [
    "role": NSNull(), "subrole": NSNull(), "title": NSNull(), "description": NSNull()
  ]
  func failure(_ reason: String) -> [String: Any] {
    var result = evidence
    result["error"] = "focus evidence unavailable"
    result["reason"] = reason
    if labelsOnly { result["labels"] = labels }
    return result
  }
  guard (mode == "publicValue" && lane == "public-rendered") ||
        (labelsOnly && lane == "terminal-tab") else { return failure("invalid-mode-lane") }
  guard let number = q["pid"] as? NSNumber,
        CFGetTypeID(number as CFTypeRef) != CFBooleanGetTypeID(),
        number.int32Value > 0, number.doubleValue == Double(number.int32Value) else {
    return failure("invalid-pid")
  }

  let app = AXUIElementCreateApplication(number.int32Value)
  AXUIElementSetMessagingTimeout(app, 0.5)
  var rawFocus: CFTypeRef?
  guard AXUIElementCopyAttributeValue(app, kAXFocusedUIElementAttribute as CFString, &rawFocus) == .success,
        let rawFocus = rawFocus, CFGetTypeID(rawFocus) == AXUIElementGetTypeID() else {
    return failure("focused-element-unreadable")
  }
  let focus = rawFocus as! AXUIElement
  AXUIElementSetMessagingTimeout(focus, 0.5)
  // Read both identifiers before requesting any labels or value. Only explicit AX absence permits a missing subrole.
  let role = focusAttributeString(focus, kAXRoleAttribute)
  var rawSubrole: CFTypeRef?
  let subroleStatus = AXUIElementCopyAttributeValue(focus, kAXSubroleAttribute as CFString, &rawSubrole)
  let subrole = subroleStatus == .success ? rawSubrole as? String : nil
  let subroleAbsent = subroleStatus == .noValue || subroleStatus == .attributeUnsupported
  if let role = role { evidence["role"] = role; labels["role"] = role }
  if let subrole = subrole { evidence["subrole"] = subrole; labels["subrole"] = subrole }
  let secure = [role, subrole].compactMap { $0 }.contains { identifier in
    let name = identifier.lowercased()
    return name.contains("secure") || name.contains("password")
  }
  if secure { evidence["secure"] = true }
  guard let role = role, !role.isEmpty else { return failure("role-unreadable") }
  guard subroleAbsent || (subroleStatus == .success && subrole != nil) else {
    return failure("subrole-unreadable")
  }
  evidence["secure"] = secure
  guard !secure else { return failure("secure-focus") }

  if labelsOnly {
    if let title = focusAttributeString(focus, kAXTitleAttribute) { labels["title"] = title }
    if let description = focusAttributeString(focus, kAXDescriptionAttribute) { labels["description"] = description }
    evidence["labels"] = labels
    evidence["ok"] = true
    return evidence
  }
  guard role == kAXTextFieldRole || role == kAXTextAreaRole else { return failure("non-text-entry-role") }
  evidence["valueRead"] = true
  guard let value = focusAttributeString(focus, kAXValueAttribute) else { return failure("value-unreadable") }
  evidence["value"] = value
  evidence["readable"] = true
  evidence["ok"] = true
  return evidence
}

func now() -> Double { Date().timeIntervalSince1970 * 1000 }
while let line = readLine() {
  var answer: [String: Any] = ["startedAt": now()]
  if let data = line.data(using: .utf8), let q = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any], q["op"] as? String == "front" {
    let pid = (q["pid"] as? NSNumber)?.int32Value ?? 0
    let activate = q["activate"] as? Bool ?? true
    answer["activationRequested"] = activate
    if activate { answer["activationAccepted"] = NSRunningApplication(processIdentifier: pid)?.activate(options: []) ?? false }
    let deadline = Date().addingTimeInterval(2)
    while NSWorkspace.shared.frontmostApplication?.processIdentifier != pid && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.01)) }
    let actual = NSWorkspace.shared.frontmostApplication?.processIdentifier
    answer["frontmostPid"] = actual.map { Int($0) } ?? NSNull()
    answer["ok"] = actual == pid
    if actual != pid { answer["error"] = "target did not become foreground" }
  } else if let data = line.data(using: .utf8), let q = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any], q["op"] as? String == "clip", let text = q["text"] as? String {
    NSPasteboard.general.clearContents()
    answer["ok"] = NSPasteboard.general.setString(text, forType: .string)
  } else if let data = line.data(using: .utf8), let q = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any], q["op"] as? String == "titles" {
    answer["titles"] = windowTitles((q["pid"] as? NSNumber)?.int32Value ?? 0)
  } else if let data = line.data(using: .utf8), let q = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any], q["op"] as? String == "focusEvidence" {
    answer.merge(focusEvidence(q)) { _, new in new }
  } else {
    answer["error"] = "bad request"
  }
  answer["endedAt"] = now()
  let out = (try? JSONSerialization.data(withJSONObject: answer, options: [.sortedKeys])).flatMap { String(data: $0, encoding: .utf8) } ?? "{\"error\":\"encode\"}"
  print(out)
  fflush(stdout)
}
