import Foundation
import os

// The engine's timing signposts (#235's spec, Decision Log 2026-10-31; the timing diagnosis's list): the request, the
// main-thread hops, the cursor's commits and window-state reads, route 3's hold and its release, press_key's parts, the
// request prologue's steps (the HID idle read, the holds' bounds, the lock check, the app's resolution) and a coordinate
// click's (its point, hit test, owner checks, window number, route and delivery), so an attended sitting can attribute
// what a cursor-on run costs. Enabled by default on macOS 26 (the log store keeps them, at about 2 µs an interval,
// measured), they cost far more while a client streams them (`log stream --signpost`: about 80 µs an interval, measured
// on the MacBook, #235's task-8 report). Each helper here checks `isEnabled` first, so a configuration that turns the
// subsystem off pays no ID and no interval state.

let timingSignposts = OSSignposter(subsystem: "io.github.ssfskim.cua.engine", category: "timing")

/// What `signposted` needs of a signposter: OSSignposter's, and a counting one in the tests.
protocol TimingIntervals {
  associatedtype Interval
  var isEnabled: Bool { get }
  func beginTimingInterval(_ name: StaticString) -> Interval
  func endTimingInterval(_ name: StaticString, _ interval: Interval)
}

extension OSSignposter: TimingIntervals {
  func beginTimingInterval(_ name: StaticString) -> OSSignpostIntervalState { beginInterval(name, id: makeSignpostID()) }
  func endTimingInterval(_ name: StaticString, _ interval: OSSignpostIntervalState) { endInterval(name, interval) }
}

/// Runs `body` inside an interval named `name` on `poster`; with signposts off, just runs it (no ID, no interval state).
@inline(__always)
func signposted<P: TimingIntervals, T>(_ name: StaticString, on poster: P, _ body: () throws -> T) rethrows -> T {
  guard poster.isEnabled else { return try body() }
  let interval = poster.beginTimingInterval(name)
  defer { poster.endTimingInterval(name, interval) }
  return try body()
}

/// Runs `body` inside a timing interval named `name`.
@inline(__always)
func signposted<T>(_ name: StaticString, _ body: () throws -> T) rethrows -> T {
  try signposted(name, on: timingSignposts, body)
}

/// Host time `host` (CACurrentMediaTime's seconds, the mach absolute clock) as mach continuous ticks, the clock `log show`
/// stamps every signpost with (its `machTimestamp`): a motion's span in these ticks lets the kit count the window server's
/// frames inside it (`cursor.motion`, CursorPanel.swift).
func continuousTicks(host: TimeInterval) -> UInt64 {
  var timebase = mach_timebase_info()
  mach_timebase_info(&timebase)
  let asleep = mach_continuous_time() &- mach_absolute_time()
  return UInt64(max(0, host) * 1e9 * Double(timebase.denom) / Double(timebase.numer)) &+ asleep
}
