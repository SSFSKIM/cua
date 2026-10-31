import Foundation
import os

// The engine's timing signposts (#235's spec, Decision Log 2026-10-31; the timing diagnosis's list): the request, the
// main-thread hops, the cursor's commits and window-state reads, route 3's hold and its release, press_key's parts, the
// request prologue's steps (the HID idle read, the holds' bounds, the lock check, the app's resolution) and a coordinate
// click's (its point, hit test, owner checks, window number, route and delivery), so an attended sitting can attribute
// what a cursor-on run costs. Recorded only while a client records them
// (Instruments' os_signpost template, or `log stream --signpost --predicate 'subsystem == "io.github.ssfskim.cua.engine"'`);
// otherwise each one costs a check of `isEnabled`.

let timingSignposts = OSSignposter(subsystem: "io.github.ssfskim.cua.engine", category: "timing")

/// Runs `body` inside a signposted interval named `name`.
@inline(__always)
func signposted<T>(_ name: StaticString, _ body: () throws -> T) rethrows -> T {
  let state = timingSignposts.beginInterval(name, id: timingSignposts.makeSignpostID())
  defer { timingSignposts.endInterval(name, state) }
  return try body()
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
