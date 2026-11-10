// Runner-only side tool for the #354 fence spike: activate an owned runner app and verify the actual frontmost pid,
// or list an owned runner browser's AX window titles (the fixture's visible-owner nonce). One JSON request per stdin
// line, one JSON answer per stdout line. Reads no field text, values or secrets.
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
  } else {
    answer["error"] = "bad request"
  }
  answer["endedAt"] = now()
  let out = (try? JSONSerialization.data(withJSONObject: answer, options: [.sortedKeys])).flatMap { String(data: $0, encoding: .utf8) } ?? "{\"error\":\"encode\"}"
  print(out)
  fflush(stdout)
}
