// R3's witness control (ruling 1225; ./witness.mjs): one harmless event the harness itself posts to a process, which the
// witness tap on that process must record, so a tap that saw nothing is known to have been able to see. The event is a
// flagsChanged with no modifier held (a Shift key's release with every flag clear): no character, no key that edits or
// moves anything. Posted with CGEventPostToPid by this helper's own process, whose pid the event carries as its source.
// Run as a binary compiled into the run directory (./key-route-device.mjs controlPost):
//   witness-control <pid>
//       -> {"posted", "pid", "kind", "at"}: whether the event was made and posted, this process's pid, its kind and the
//       time of the post (milliseconds since 1970)
// It posts into another app, so it refuses off a GitHub-hosted runner (exit 3) before it makes or posts anything.
import CoreGraphics
import Foundation

func emit(_ object: [String: Any]) {
  let data = try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
  FileHandle.standardOutput.write(data + Data("\n".utf8))
}
guard ProcessInfo.processInfo.environment["RUNNER_ENVIRONMENT"] == "github-hosted" else {
  FileHandle.standardError.write(Data("witness-control: refused: it runs only on a GitHub-hosted runner (RUNNER_ENVIRONMENT=github-hosted), never on a Mac of the owner's\n".utf8))
  exit(3)
}
let args = CommandLine.arguments
guard args.count == 2, let pid = Int32(args[1]), pid > 0 else {
  FileHandle.standardError.write(Data("usage: witness-control <pid>\n".utf8))
  exit(64)
}
let now = { Int((Date().timeIntervalSince1970 * 1000).rounded()) }
// The left Shift key's code (kVK_Shift), released, as a flagsChanged with every flag clear.
guard let event = CGEvent(keyboardEventSource: nil, virtualKey: 0x38, keyDown: false) else {
  emit(["posted": false, "pid": Int(getpid()), "kind": "flagsChanged", "at": now()])
  exit(0)
}
event.type = .flagsChanged
event.flags = []
let at = now()
event.postToPid(pid)
emit(["posted": true, "pid": Int(getpid()), "kind": "flagsChanged", "at": at])
