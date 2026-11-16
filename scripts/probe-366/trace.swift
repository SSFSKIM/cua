import AppKit
import ApplicationServices
import Foundation

// This file exists only in a runner's detached source tree. Logging does no AX read of its own.
nonisolated var spike366Variant: String { Thread.current.threadDictionary["probe366Variant"] as? String ?? "main" }
func spike366Scope(_ args: [String: Any]) -> () -> Void {
  Thread.current.threadDictionary["probe366Variant"] = args["probe366Variant"] as? String ?? "main"
  Thread.current.threadDictionary["probe366Id"] = args["probe366Id"] as? String ?? "unknown"
  spike366Log("scope.begin")
  return {
    spike366Log("scope.end")
    Thread.current.threadDictionary.removeObject(forKey: "probe366Variant")
    Thread.current.threadDictionary.removeObject(forKey: "probe366Id")
  }
}
func spike366Log(_ kind: String, _ fields: [String: Any] = [:]) {
  var record = fields
  record["at"] = Date().timeIntervalSince1970 * 1000
  record["kind"] = kind
  record["trial"] = Thread.current.threadDictionary["probe366Id"] as? String ?? "outside-action"
  record["variant"] = spike366Variant
  record["frontmostPid"] = NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 0
  if let bytes = try? JSONSerialization.data(withJSONObject: record, options: [.sortedKeys]),
     let text = String(data: bytes, encoding: .utf8) {
    FileHandle.standardError.write(Data(("PROBE366 " + text + "\n").utf8))
  }
}
