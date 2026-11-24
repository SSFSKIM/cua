// The hosted setup's input sources (./input-sources.mjs; ruling 1189): read, and on a GitHub-hosted runner enable,
// the sources sitting C's input rows select. Enabling goes through TISEnableInputSource, the call System Settings
// makes, so the text input system's own state and its preference stay one.
//   input-sources list <id>...     each source as TIS lists it, with and without the enabled filter, and the
//                                  preference's value (com.apple.HIToolbox AppleEnabledInputSources, through cfprefsd)
//   input-sources enable <id>...   TISEnableInputSource on each installed source not yet enabled, then the same reading
// The script never selects a source. -> one JSON line.
import Carbon
import Foundation

func list(_ id: String, includeAllInstalled: Bool) -> [TISInputSource] {
  let filter = [kTISPropertyInputSourceID as String: id] as CFDictionary
  return (TISCreateInputSourceList(filter, includeAllInstalled)?.takeRetainedValue() as? [TISInputSource]) ?? []
}
func property(_ source: TISInputSource, _ key: CFString) -> AnyObject? {
  guard let raw = TISGetInputSourceProperty(source, key) else { return nil }
  return Unmanaged<AnyObject>.fromOpaque(raw).takeUnretainedValue()
}
func flag(_ source: TISInputSource, _ key: CFString) -> Any {
  guard let value = property(source, key) else { return NSNull() }
  return CFGetTypeID(value) == CFBooleanGetTypeID() ? CFBooleanGetValue((value as! CFBoolean)) : NSNull()
}
func text(_ source: TISInputSource, _ key: CFString) -> Any { (property(source, key) as? String) ?? NSNull() }

// One source: installed (in the list of every installed source), its kind, and as the enabled list holds it.
func reading(_ id: String) -> [String: Any] {
  guard let installed = list(id, includeAllInstalled: true).first else { return ["id": id, "installed": false] }
  var enabledList: [String: Any] = ["listed": false]
  if let enabled = list(id, includeAllInstalled: false).first {
    enabledList = ["listed": true, "enabled": flag(enabled, kTISPropertyInputSourceIsEnabled), "selectCapable": flag(enabled, kTISPropertyInputSourceIsSelectCapable)]
  }
  var out: [String: Any] = ["id": id, "installed": true, "enabledList": enabledList]
  out["category"] = text(installed, kTISPropertyInputSourceCategory)
  out["type"] = text(installed, kTISPropertyInputSourceType)
  out["enableCapable"] = flag(installed, kTISPropertyInputSourceIsEnableCapable)
  out["selectCapable"] = flag(installed, kTISPropertyInputSourceIsSelectCapable)
  return out
}
// The preference's value as cfprefsd holds it: its entries, each a dictionary of strings and numbers, or null.
func preference() -> Any {
  guard let value = CFPreferencesCopyAppValue("AppleEnabledInputSources" as CFString, "com.apple.HIToolbox" as CFString), JSONSerialization.isValidJSONObject(value) else { return NSNull() }
  return value
}

let args = Array(CommandLine.arguments.dropFirst())
guard let command = args.first, ["list", "enable"].contains(command), args.count > 1 else {
  FileHandle.standardError.write("usage: input-sources list|enable <id>...\n".data(using: .utf8)!)
  exit(2)
}
let ids = Array(args.dropFirst())
var out: [String: Any] = [:]
if command == "enable" {
  out["enabled"] = ids.map { id -> [String: Any] in
    guard let source = list(id, includeAllInstalled: true).first else { return ["id": id, "status": NSNull(), "reason": "not installed"] }
    if !list(id, includeAllInstalled: false).isEmpty { return ["id": id, "status": 0, "already": true] }
    return ["id": id, "status": Int(TISEnableInputSource(source))]
  }
}
out["readings"] = ids.map(reading)
out["preference"] = preference()
let data = try! JSONSerialization.data(withJSONObject: out, options: [.sortedKeys])
print(String(data: data, encoding: .utf8)!)
