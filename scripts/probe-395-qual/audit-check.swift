// Offline check of the real schedule accumulator. Calls no AX API that reaches another process and reads no field or value:
// it feeds the recording seam directly, with system-wide elements only for alias identity. Compile with the #354 audit.swift
// (probe-354-fences, which audit.swift's wrappers sit on) and audit.swift; audit-swift.test.mjs decodes the stderr it emits.
import ApplicationServices
import CoreGraphics
import Foundation

@main
struct Probe395AuditCheck {
  static func main() {
    let audit = Probe395Audit.shared
    let t = Probe395Audit.now
    let a = AXUIElementCreateSystemWide(), b = AXUIElementCreateApplication(getpid()), a2 = AXUIElementCreateSystemWide()
    // Untagged traffic is ignored and must not leak into the next request.
    audit.record(api: Probe395Audit.apiSingle, name: "AXValue", element: a, error: .success, started: t(), ended: t())
    let tag = audit.begin(["probe395Audit": "check-1"])
    // A second begin while one is open is refused (and counted), never crashes.
    let overlap = audit.begin(["probe395Audit": "check-2"])
    audit.record(api: Probe395Audit.apiSingle, name: "AXRole", element: a, error: .success, started: t(), ended: t(), roleResult: "AXTextField" as CFString)
    audit.record(api: Probe395Audit.apiSingle, name: "AXSubrole", element: a, error: .success, started: t(), ended: t(), roleResult: "not a role constant!" as CFString)
    audit.record(api: Probe395Audit.apiBatch, name: ["AXRole", "AXValue"].joined(separator: "+"), element: b, error: .success, started: t(), ended: t())
    // The same element again (CFEqual) keeps its alias; a name that is not a constant is not recorded as itself.
    audit.record(api: Probe395Audit.apiParam, name: "AXStringForTextMarkerRange", element: a2, error: .noValue, started: t(), ended: t())
    audit.record(api: Probe395Audit.apiSingle, name: "secret value 123", element: a, error: .failure, started: t(), ended: t())
    let began = audit.phaseBegin("walk")
    audit.record(api: Probe395Audit.apiSingle, name: "AXChildren", element: b, error: .success, started: t(), ended: t())
    audit.phaseEnd("walk", began)
    if let key = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: true) { audit.eventPosted(key) }
    audit.record(api: Probe395Audit.apiWrite, name: "AXFocused", element: b, error: .success, started: t(), ended: t())
    // Another thread's traffic is counted by name, not scheduled.
    let done = DispatchSemaphore(value: 0)
    Thread.detachNewThread {
      audit.record(api: Probe395Audit.apiSingle, name: "AXValue", element: a, error: .success, started: t(), ended: t())
      done.signal()
    }
    done.wait()
    audit.finish(tag)
    audit.finish(overlap)  // nil: nothing is written
    // After finish, traffic is ignored again, and a fresh request starts clean.
    audit.record(api: Probe395Audit.apiSingle, name: "AXValue", element: a, error: .success, started: t(), ended: t())
    let next = audit.begin(["probe395Audit": "check-3"])
    audit.finish(next)
  }
}
