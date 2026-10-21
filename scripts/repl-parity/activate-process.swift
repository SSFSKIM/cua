// Puts one running process in front, for the macOS scenes' put-back of the owner's front app (./scenes-mac.mjs
// reactivateApp). Run with `swift scripts/repl-parity/activate-process.swift <pid> <bundleId>`; one JSON line out.
//
//   {"activated": true}                    NSRunningApplication's activate was accepted for that process
//   {"activated": false, "reason": "…"}    the pid runs no app, a terminated one, or one with another bundle id
//
// The reason never holds the pid: the goldens recorder copies the answer into its meta.json, which records no pid.
//
// The process is addressed by its pid, so of two instances sharing a bundle id only the recorded one is activated, and
// a process that has exited is refused rather than replaced: nothing here asks LaunchServices to open or launch an app,
// as `open -b` would. The bundle id is read off the same NSRunningApplication the activation goes to, so a pid reused by
// another app is refused too. It is the call the engine makes to give the user's app the front back
// (native/engine/Sources/Engine/Activation.swift, ActivationSystem.reactivate); it needs no permission and raises no
// dialog. Whether the app really came to the front is the caller's reading (lsappinfo front), not this answer.
// Exit 0 with the JSON; exit 2 with {"error"} on a usage error.
import AppKit
import Foundation

func emit(_ object: [String: Any], status: Int32 = 0) -> Never {
  let data = try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write("\n".data(using: .utf8)!)
  exit(status)
}

let arguments = CommandLine.arguments.dropFirst()
guard arguments.count == 2, let pid = pid_t(arguments.first!), pid > 0 else {
  emit(["error": "usage: activate-process.swift <pid> <bundleId>"], status: 2)
}
let bundleId = arguments.last!

guard let app = NSRunningApplication(processIdentifier: pid), !app.isTerminated, app.bundleIdentifier == bundleId else {
  emit(["activated": false, "reason": "the process is no longer running as \(bundleId)"])
}
emit(app.activate(options: []) ? ["activated": true] : ["activated": false, "reason": "the activation was refused"])
