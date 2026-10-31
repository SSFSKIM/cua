// The sitting's input-source switch (./input-source.mjs): reads the current keyboard input source, or selects an enabled
// one by its id and reads back what is current, so the kit can put the owner's Mac on ABC for the judged timing series
// and back on the owner's own source afterwards, with the owner's yes (the spec's Decision Log, the second sitting). It
// enables nothing, changes no setting, and reads no keystroke: Text Input Sources only. One JSON line out; exit 0, or 2
// with {"error"} on a usage error.
//
//   current        {"current": {"id", "name"}}
//   select <id>    {"requested", "status" (TISSelectInputSource's OSStatus, or null when no enabled source has that id),
//                   "current": {"id", "name"}}, the current source read until it is the requested one, up to 1 s
import Carbon
import Foundation

func emit(_ object: [String: Any], status: Int32 = 0) -> Never {
  let data = try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
  FileHandle.standardOutput.write(data + Data("\n".utf8))
  exit(status)
}

func property(_ source: TISInputSource, _ key: CFString) -> String? {
  guard let pointer = TISGetInputSourceProperty(source, key) else { return nil }
  return Unmanaged<CFString>.fromOpaque(pointer).takeUnretainedValue() as String
}

func current() -> [String: Any] {
  let source = TISCopyCurrentKeyboardInputSource().takeRetainedValue()
  return ["id": property(source, kTISPropertyInputSourceID) as Any? ?? NSNull(), "name": property(source, kTISPropertyLocalizedName) as Any? ?? NSNull()]
}

let arguments = Array(CommandLine.arguments.dropFirst())
switch arguments.first {
case "current" where arguments.count == 1:
  emit(["current": current()])
case "select" where arguments.count == 2:
  let id = arguments[1]
  let filter = [kTISPropertyInputSourceID as String: id] as CFDictionary
  guard let list = TISCreateInputSourceList(filter, false)?.takeRetainedValue() as? [TISInputSource], let source = list.first else {
    emit(["requested": id, "status": NSNull(), "current": current()])
  }
  let status = TISSelectInputSource(source)
  var now = current()
  let deadline = Date().addingTimeInterval(1)
  while (now["id"] as? String) != id, Date() < deadline {
    RunLoop.current.run(until: Date().addingTimeInterval(0.05))
    now = current()
  }
  emit(["requested": id, "status": Int(status), "current": now])
default:
  emit(["error": "usage: input-source current | select <input source id>"], status: 2)
}
