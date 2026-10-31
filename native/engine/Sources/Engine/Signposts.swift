import os

// The engine's timing signposts (#235's spec, Decision Log 2026-10-31; the timing diagnosis's list): the request, the
// main-thread hops, the cursor's commits and window-state reads, route 3's hold and its release, and press_key's parts,
// so an attended sitting can attribute what a cursor-on run costs. Recorded only while a client records them
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
