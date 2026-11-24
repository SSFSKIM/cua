// The key-route diagnostic's witness (ruling 1198; #117 M5): listen-only event taps on given processes
// (CGEventTapCreateForPid), each logging the Escape keyDowns (keycode 0x35) delivered to its process with the event's
// target and source unix pids (CGEventField 40 and 41) and which tap saw it. Nothing else of any event is read or kept.
//
// It is the executable of a background-only app of its own (io.github.ssfskim.cua.key-route-tap, built and ad-hoc signed
// by ./key-route-device.mjs buildTapApp, launched through LaunchServices so it is its own responsible process): Input
// Monitoring is granted to that app alone, on a GitHub-hosted runner only, by the hosted kit's TCC writer (ruling 1198,
// under O0), and neither engine under test gets a grant. It never asks for one: CGPreflightListenEventAccess is reported.
//
//   key-route-tap --admission <file> --nonce <hex> --out <file> --stop <file> --max-seconds <n> --pid <label>:<pid> ...
// Admission, checked here, in the LaunchServices process, before it creates its log or any tap: `open` hands it none of
// its caller's environment, so the guarded launcher (./key-route-device.mjs startTap, which refuses off a GitHub-hosted
// runner) writes --admission, {"nonce", "at"}, just before it opens the app. The file must hold --nonce and be at most
// ADMISSION_SECONDS old; it is consumed (removed) when read. Without it the tap exits 3, having made nothing.
// The bound comes first: a deadline of --max-seconds (plus a grace) is armed before anything else, so it never outlives it.
// One JSON line per fact, written to --out: first {"ready", "pid", "listenAccess", "taps": [{"label", "pid", "created"}]},
// then {"label", "tapPid", "keycode", "target", "source", "at"} per Escape keyDown, then {"stopped", "why"} when --stop
// appears or --max-seconds pass.
import AppKit
import CoreGraphics
import Foundation

var out: String?, stop: String?, admission: String?, nonce: String?, maxSeconds = 120.0
var targets: [(label: String, pid: pid_t)] = []
var argv = CommandLine.arguments.dropFirst()
while let flag = argv.popFirst() {
  guard let value = argv.popFirst() else { exit(64) }
  switch flag {
  case "--out": out = value
  case "--stop": stop = value
  case "--admission": admission = value
  case "--nonce": nonce = value
  case "--max-seconds": maxSeconds = min(Double(value) ?? maxSeconds, 600)
  case "--pid":
    let parts = value.split(separator: ":")
    guard parts.count == 2, let pid = Int32(parts[1]), pid > 0 else { exit(64) }
    targets.append((String(parts[0]), pid))
  default: exit(64)
  }
}
// The hard bound, armed before the admission and the taps' set-up, so a set-up that hangs still ends.
DispatchQueue.global().asyncAfter(deadline: .now() + maxSeconds + 5) { exit(0) }

func refuse(_ why: String) -> Never {
  FileHandle.standardError.write(Data("key-route-tap: refused: \(why)\n".utf8))
  exit(3)
}
let ADMISSION_SECONDS = 60.0
guard let admission, let nonce, !nonce.isEmpty else { refuse("no admission: it is launched only by the hosted launcher (key-route-device.mjs tap start)") }
let admitted: [String: Any]? = (try? Data(contentsOf: URL(fileURLWithPath: admission))).flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
try? FileManager.default.removeItem(atPath: admission)
guard let admitted, admitted["nonce"] as? String == nonce, let at = (admitted["at"] as? NSNumber)?.doubleValue,
      abs(Date().timeIntervalSince1970 * 1000 - at) <= ADMISSION_SECONDS * 1000 else { refuse("the admission is missing, another launch's, or stale") }

guard let out, let stop, !targets.isEmpty, FileManager.default.createFile(atPath: out, contents: nil),
      let opened = FileHandle(forWritingAtPath: out) else { exit(64) }

/// What the C callback reaches (it captures nothing): the log, the taps' labels and pids, and their ports.
enum Tap {
  nonisolated(unsafe) static var file: FileHandle?
  nonisolated(unsafe) static var targets: [(label: String, pid: pid_t)] = []
  nonisolated(unsafe) static var ports: [CFMachPort?] = []
  static func write(_ object: [String: Any]) {
    let data = try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
    file?.write(data + Data("\n".utf8))
  }
  static func nowMs() -> Int { Int((Date().timeIntervalSince1970 * 1000).rounded()) }
}
Tap.file = opened
Tap.targets = targets

let callback: CGEventTapCallBack = { _, type, event, userInfo in
  let index = Int(bitPattern: userInfo) - 1
  if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
    if index >= 0 && index < Tap.ports.count, let port = Tap.ports[index] { CGEvent.tapEnable(tap: port, enable: true) }
  } else if type == .keyDown, event.getIntegerValueField(.keyboardEventKeycode) == 0x35, index >= 0 && index < Tap.targets.count {
    Tap.write(["label": Tap.targets[index].label, "tapPid": Int(Tap.targets[index].pid), "keycode": 0x35,
               "target": Int(event.getIntegerValueField(.eventTargetUnixProcessID)), "source": Int(event.getIntegerValueField(.eventSourceUnixProcessID)),
               "at": Tap.nowMs()])
  }
  return Unmanaged.passUnretained(event)
}

NSApplication.shared.setActivationPolicy(.prohibited)
var created: [[String: Any]] = []
for (index, target) in targets.enumerated() {
  let port = CGEvent.tapCreateForPid(pid: target.pid, place: .headInsertEventTap, options: .listenOnly,
                                     eventsOfInterest: CGEventMask(1 << CGEventType.keyDown.rawValue), callback: callback,
                                     userInfo: UnsafeMutableRawPointer(bitPattern: index + 1))
  Tap.ports.append(port)
  if let port, let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, port, 0) {
    CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
    CGEvent.tapEnable(tap: port, enable: true)
  }
  created.append(["label": target.label, "pid": Int(target.pid), "created": port != nil])
}
Tap.write(["ready": true, "pid": Int(getpid()), "listenAccess": CGPreflightListenEventAccess(), "taps": created])

let started = Date()
let stopFile = stop, bound = maxSeconds
Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { _ in
  let stopped = FileManager.default.fileExists(atPath: stopFile)
  guard stopped || Date().timeIntervalSince(started) >= bound else { return }
  Tap.write(["stopped": true, "why": stopped ? "stop" : "max-seconds"])
  try? Tap.file?.synchronize()
  exit(0)
}
NSApplication.shared.run()
