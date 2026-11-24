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
// Its venue, checked first, in its own process, before it reads, removes or creates any file or installs a tap (the #560
// pattern): RUNNER_ENVIRONMENT=github-hosted, which `open` hands it only as the guarded launcher (./key-route-device.mjs
// startTap, which refuses off a GitHub-hosted runner) passes it, `open --env`. Off it the tap exits 3, having touched
// nothing. Then its launch gate: the launcher writes --admission, {"nonce", "at"}, just before it opens the app; the
// file must hold --nonce and be at most ADMISSION_SECONDS old, and is consumed (removed) only once it held. Without it
// the tap exits 3, having made nothing. The bound is armed right after the arguments, before the admission and the taps,
// so a set-up that hangs still ends.
// One JSON line per fact, written to --out: first {"ready", "pid", "listenAccess", "at", "taps": [{"label", "pid",
// "created"}]}, then {"label", "tapPid", "keycode", "target", "source", "at"} per Escape keyDown, then {"stopped", "why",
// "at"} when --stop appears or --max-seconds pass. A tap the system disabled (its callback too slow, or user input) is
// written {"disabled": "timeout" | "userInput", "label", "tapPid", "reenabled", "at"}, so a span it missed is known.
//
// `--mode events` (ruling 1225: R3's witness, ../native-matrix/witness.mjs): every key, modifier and mouse event delivered
// to each tapped process, written {"label", "tapPid", "kind", "target", "source", "at"}: its kind's name (keyDown,
// keyUp, flagsChanged, mouseDown, mouseUp, scrollWheel), the target and source unix pids, the time. Its keycode, its
// characters and anything else that could tell what was typed are never read. Its bound may run to a whole matrix run.
import AppKit
import CoreGraphics
import Foundation

func refuse(_ why: String) -> Never {
  FileHandle.standardError.write(Data("key-route-tap: refused: \(why)\n".utf8))
  exit(3)
}
// The venue, first, in this process itself, before it reads, removes or creates any file or installs a tap.
guard ProcessInfo.processInfo.environment["RUNNER_ENVIRONMENT"] == "github-hosted" else {
  refuse("it runs only on a GitHub-hosted runner (RUNNER_ENVIRONMENT=github-hosted), never on a Mac of the owner's")
}

var out: String?, stop: String?, admission: String?, nonce: String?, maxSeconds = 120.0, events = false
var targets: [(label: String, pid: pid_t)] = []
var argv = CommandLine.arguments.dropFirst()
while let flag = argv.popFirst() {
  guard let value = argv.popFirst() else { exit(64) }
  switch flag {
  case "--out": out = value
  case "--stop": stop = value
  case "--admission": admission = value
  case "--nonce": nonce = value
  case "--max-seconds": maxSeconds = Double(value) ?? maxSeconds
  case "--mode":
    guard value == "events" || value == "escape" else { exit(64) }
    events = value == "events"
  case "--pid":
    let parts = value.split(separator: ":")
    guard parts.count == 2, let pid = Int32(parts[1]), pid > 0 else { exit(64) }
    targets.append((String(parts[0]), pid))
  default: exit(64)
  }
}
// The escape mode is one press's; the events mode a run's.
maxSeconds = min(maxSeconds, events ? 14_400 : 600)
// The hard bound, armed before the admission and the taps' set-up, so a set-up that hangs still ends.
DispatchQueue.global().asyncAfter(deadline: .now() + maxSeconds + 5) { exit(0) }

let ADMISSION_SECONDS = 60.0
guard let admission, let nonce, !nonce.isEmpty else { refuse("no admission: it is launched only by the hosted launcher (key-route-device.mjs tap start)") }
let admitted: [String: Any]? = (try? Data(contentsOf: URL(fileURLWithPath: admission))).flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
guard let admitted, admitted["nonce"] as? String == nonce, let at = (admitted["at"] as? NSNumber)?.doubleValue,
      abs(Date().timeIntervalSince1970 * 1000 - at) <= ADMISSION_SECONDS * 1000 else { refuse("the admission is missing, another launch's, or stale") }
// Consumed only once it held: a launch gate, one use per launch.
try? FileManager.default.removeItem(atPath: admission)

guard let out, let stop, !targets.isEmpty, FileManager.default.createFile(atPath: out, contents: nil),
      let opened = FileHandle(forWritingAtPath: out) else { exit(64) }

/// What the C callback reaches (it captures nothing): the log, the taps' labels and pids, and their ports.
enum Tap {
  nonisolated(unsafe) static var file: FileHandle?
  nonisolated(unsafe) static var targets: [(label: String, pid: pid_t)] = []
  nonisolated(unsafe) static var ports: [CFMachPort?] = []
  nonisolated(unsafe) static var events = false
  static func write(_ object: [String: Any]) {
    let data = try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
    file?.write(data + Data("\n".utf8))
  }
  static func nowMs() -> Int { Int((Date().timeIntervalSince1970 * 1000).rounded()) }
}
Tap.file = opened
Tap.targets = targets
Tap.events = events
/// The events mode's kinds by their names; a mouse button's down and up as one kind each, whichever button.
func kindName(_ type: CGEventType) -> String? {
  switch type {
  case .keyDown: return "keyDown"
  case .keyUp: return "keyUp"
  case .flagsChanged: return "flagsChanged"
  case .leftMouseDown, .rightMouseDown, .otherMouseDown: return "mouseDown"
  case .leftMouseUp, .rightMouseUp, .otherMouseUp: return "mouseUp"
  case .scrollWheel: return "scrollWheel"
  default: return nil
  }
}
let eventKinds: [CGEventType] = [.keyDown, .keyUp, .flagsChanged, .leftMouseDown, .leftMouseUp, .rightMouseDown, .rightMouseUp, .otherMouseDown, .otherMouseUp, .scrollWheel]

let callback: CGEventTapCallBack = { _, type, event, userInfo in
  let index = Int(bitPattern: userInfo) - 1
  if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
    var reenabled = false
    if index >= 0 && index < Tap.ports.count, let port = Tap.ports[index] { CGEvent.tapEnable(tap: port, enable: true); reenabled = CGEvent.tapIsEnabled(tap: port) }
    if index >= 0 && index < Tap.targets.count {
      Tap.write(["disabled": type == .tapDisabledByTimeout ? "timeout" : "userInput", "label": Tap.targets[index].label, "tapPid": Int(Tap.targets[index].pid),
                 "reenabled": reenabled, "at": Tap.nowMs()])
    }
  } else if Tap.events {
    // events mode: the kind and the pids alone.
    if let kind = kindName(type), index >= 0 && index < Tap.targets.count {
      Tap.write(["label": Tap.targets[index].label, "tapPid": Int(Tap.targets[index].pid), "kind": kind,
                 "target": Int(event.getIntegerValueField(.eventTargetUnixProcessID)), "source": Int(event.getIntegerValueField(.eventSourceUnixProcessID)),
                 "at": Tap.nowMs()])
    }
    // end events mode
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
  let mask = events ? eventKinds.reduce(CGEventMask(0)) { $0 | CGEventMask(1) << $1.rawValue } : CGEventMask(1 << CGEventType.keyDown.rawValue)
  let port = CGEvent.tapCreateForPid(pid: target.pid, place: .headInsertEventTap, options: .listenOnly, eventsOfInterest: mask, callback: callback,
                                     userInfo: UnsafeMutableRawPointer(bitPattern: index + 1))
  Tap.ports.append(port)
  if let port, let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, port, 0) {
    CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
    CGEvent.tapEnable(tap: port, enable: true)
  }
  created.append(["label": target.label, "pid": Int(target.pid), "created": port != nil])
}
Tap.write(["ready": true, "pid": Int(getpid()), "listenAccess": CGPreflightListenEventAccess(), "at": Tap.nowMs(), "taps": created])

let started = Date()
let stopFile = stop, bound = maxSeconds
Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { _ in
  let stopped = FileManager.default.fileExists(atPath: stopFile)
  guard stopped || Date().timeIntervalSince(started) >= bound else { return }
  Tap.write(["stopped": true, "why": stopped ? "stop" : "max-seconds", "at": Tap.nowMs()])
  try? Tap.file?.synchronize()
  exit(0)
}
NSApplication.shared.run()
