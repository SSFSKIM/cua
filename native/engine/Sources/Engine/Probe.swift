import Carbon
import Foundation

// `cua-engine --probe <command>` (Interfaces, UserProbe; the spike's minimal seed). A probe binds no socket and exits.
// Built here: `input-source current` (the active source, read only) and `input-source <id>` (selects that source; the
// harness saves and restores the owner's). Other probe commands are later work.
enum Probe {
  static func run(_ arguments: [String]) -> Int32 {
    guard arguments.first == "input-source", arguments.count == 2 else {
      return emit(["error": "usage: --probe input-source current|<id>"], status: 64)
    }
    let previous = currentInputSource()
    if arguments[1] == "current" { return emit(sourceWire(previous), status: 0) }
    let filter = [kTISPropertyInputSourceID as String: arguments[1]] as CFDictionary
    guard let list = TISCreateInputSourceList(filter, true)?.takeRetainedValue() as? [TISInputSource], let source = list.first else {
      return emit(["error": "no input source with that id"], status: 2)
    }
    let status = TISSelectInputSource(source)
    return emit(["previous": sourceWire(previous), "current": sourceWire(currentInputSource()), "selected": status == noErr], status: status == noErr ? 0 : 3)
  }

  private static func sourceWire(_ info: InputSourceInfo) -> [String: Any] {
    var wire = info.wire
    wire["perContextInput"] = perContextInputEnabled()
    return wire
  }

  private static func emit(_ object: [String: Any], status: Int32) -> Int32 {
    if let data = encodeJSON(object) { FileHandle.standardOutput.write(data + Data("\n".utf8)) }
    return status
  }
}
