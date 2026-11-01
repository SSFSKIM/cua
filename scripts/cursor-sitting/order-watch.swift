// #200's window-order watcher (./raise.mjs): the stacking of two harness windows, `front` (the one the person keeps in
// front: Chrome for Testing's run window) and `back` (the driven one behind it), sampled from the on-screen window list
// (CGWindowListCopyWindowInfo, front to back) every `interval` ms, by window number only: no names, so no Screen
// Recording grant. One JSON line out at the start, one at every change of the pair's order, and one at the end:
//   {"kind": "start", "at", "pid", "front", "back", "intervalMs", "state"}
//   {"kind": "order", "at", "sample", "state"}            state: front-above | back-above (a raise) | front-missing |
//                                                         back-missing | both-missing
//   {"kind": "end", "at", "samples", "maxGapMs", "lateSamples", "state", "why"}
// `at` is wall-clock milliseconds (Node's Date.now()), so the kit attributes each change to the cell whose span holds it.
// A read more than twice the interval after the one before is counted (`lateSamples`) and the longest gap between two
// reads kept (`maxGapMs`): a gap is a span in which a raise undone within it would not show.
// It ends on SIGTERM or SIGINT, when its parent exits, or after `maxSeconds` (a kit that died leaves nothing running).
//   order-watch <front window number> <back window number> [<interval ms> [<max seconds>]]
import CoreGraphics
import Foundation

let wall = { Date().timeIntervalSince1970 * 1000 }
func emit(_ object: [String: Any]) {
  let data = try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
  FileHandle.standardOutput.write(data + Data("\n".utf8))
}

let args = CommandLine.arguments
guard (3...5).contains(args.count), let front = Int(args[1]), let back = Int(args[2]), front != back else {
  FileHandle.standardError.write(Data("usage: order-watch <front window number> <back window number> [<interval ms> [<max seconds>]]\n".utf8))
  exit(64)
}
let intervalMs = args.count > 3 ? max(1, Double(args[3]) ?? 5) : 5
let maxSeconds = args.count > 4 ? max(1, Double(args[4]) ?? 1200) : 1200

final class Flag: @unchecked Sendable {
  private let lock = NSLock()
  private var raised: String? = nil
  func set(_ why: String) { lock.lock(); if raised == nil { raised = why }; lock.unlock() }
  var why: String? { lock.lock(); defer { lock.unlock() }; return raised }
}
let stop = Flag()
var sources: [DispatchSourceSignal] = []
for (number, name) in [(SIGTERM, "SIGTERM"), (SIGINT, "SIGINT")] {
  signal(number, SIG_IGN)
  let source = DispatchSource.makeSignalSource(signal: number, queue: .global())
  source.setEventHandler { stop.set(name) }
  source.resume()
  sources.append(source)
}

// The on-screen window numbers, front to back, by CGWindowListCreate: the same list as CGWindowListCopyWindowInfo
// without a dictionary per window, which on the MacBook took 1.6 ms a read (p95 6 ms) against 0.5 ms (p95 1.7 ms), so
// only this one holds a 5 ms grid. Swift marks it unavailable, so it is reached by its C symbol; the array holds the
// numbers themselves as its values.
typealias WindowListCreate = @convention(c) (UInt32, UInt32) -> Unmanaged<CFArray>?
guard let symbol = dlsym(dlopen(nil, RTLD_NOW), "CGWindowListCreate") else {
  FileHandle.standardError.write(Data("CGWindowListCreate is not in CoreGraphics\n".utf8))
  exit(70)
}
let windowListCreate = unsafeBitCast(symbol, to: WindowListCreate.self)
let onScreen = CGWindowListOption.optionOnScreenOnly.rawValue | CGWindowListOption.excludeDesktopElements.rawValue

// The pair's order in the window list now.
func state() -> String {
  guard let list = windowListCreate(onScreen, kCGNullWindowID)?.takeRetainedValue() else { return "both-missing" }
  var f: Int? = nil, b: Int? = nil
  for index in 0..<CFArrayGetCount(list) {
    let number = Int(UInt(bitPattern: CFArrayGetValueAtIndex(list, index)))
    if number == front { f = index } else if number == back { b = index }
    if f != nil && b != nil { break }
  }
  switch (f, b) {
  case let (f?, b?): return f < b ? "front-above" : "back-above"
  case (nil, nil): return "both-missing"
  case (nil, _): return "front-missing"
  default: return "back-missing"
  }
}

var timebase = mach_timebase_info_data_t()
mach_timebase_info(&timebase)
let ticksPerMs = 1_000_000 * Double(timebase.denom) / Double(timebase.numer)
// The sampling thread under the time-constraint policy (as an audio thread is: a period of one interval, at most 1 ms
// of work, due within 2), woken by mach_wait_until. At the default policy a command-line process's timer wakes were
// coalesced: a read every 7.4 ms on average where 5 were asked, gaps up to 74 ms (measured on the MacBook).
var policy = thread_time_constraint_policy_data_t(period: UInt32(intervalMs * ticksPerMs), computation: UInt32(ticksPerMs),
                                                  constraint: UInt32(2 * ticksPerMs), preemptible: 1)
let policyCount = mach_msg_type_number_t(MemoryLayout<thread_time_constraint_policy_data_t>.size / MemoryLayout<integer_t>.size)
let realtime = withUnsafeMutablePointer(to: &policy) {
  $0.withMemoryRebound(to: integer_t.self, capacity: Int(policyCount)) {
    thread_policy_set(pthread_mach_thread_np(pthread_self()), thread_policy_flavor_t(THREAD_TIME_CONSTRAINT_POLICY), $0, policyCount)
  }
} == KERN_SUCCESS
if !realtime { pthread_set_qos_class_self_np(QOS_CLASS_USER_INTERACTIVE, 0) }
let parent = getppid()
let clock = { Double(mach_absolute_time()) / ticksPerMs }
var current = state()
let started = clock()
emit(["kind": "start", "at": wall(), "pid": Int(getpid()), "front": front, "back": back, "intervalMs": intervalMs, "realtime": realtime, "state": current])
// The reads on a grid of one interval from the first; a read more than one interval past its slot starts the grid again
// from itself rather than catching up in a burst.
var samples = 1, late = 0, maxGap = 0.0, last = started, slot = started
while stop.why == nil {
  slot += intervalMs
  if slot > clock() { mach_wait_until(UInt64(slot * ticksPerMs)) }
  let at = clock()
  if at - slot > intervalMs { slot = at }
  if at - last > 2 * intervalMs { late += 1 }
  maxGap = max(maxGap, at - last)
  last = at
  let next = state()
  samples += 1
  if next != current {
    current = next
    emit(["kind": "order", "at": wall(), "sample": samples, "state": current])
  }
  if getppid() != parent { stop.set("parent exited") } else if at - started > maxSeconds * 1000 { stop.set("max seconds") }
}
emit(["kind": "end", "at": wall(), "samples": samples, "maxGapMs": (maxGap * 10).rounded() / 10, "lateSamples": late, "state": current, "why": stop.why ?? "stopped"])
