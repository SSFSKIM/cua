// The owned cover and activation witness (#395), with lane readiness and AX enablement (#405), copied from
// ../probe-361/host.swift (probe/361-qual) without its pasteboard and input-source operations. No AXValue reads.
import AppKit
import ApplicationServices
import Darwin
import Foundation

func ms() -> Double { Double(DispatchTime.now().uptimeNanoseconds) / 1_000_000 }
func attr(_ e: AXUIElement, _ name: String) -> CFTypeRef? {
  var value: CFTypeRef?
  return AXUIElementCopyAttributeValue(e, name as CFString, &value) == .success ? value : nil
}
func frontPID() -> pid_t? { NSWorkspace.shared.frontmostApplication?.processIdentifier }
func ownerPID() -> Int? {
  let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]
  return windows?.first { ($0[kCGWindowLayer as String] as? Int) == 0 }?[kCGWindowOwnerPID as String] as? Int
}

// Continuous witness of any activation other than the cover, from arm to disarm. Counts and a Safari/WebKit flag only.
final class Witness: @unchecked Sendable {
  private let lock = NSLock()
  private var n = 0, webkit = false
  func add(webkit w: Bool) { lock.lock(); n += 1; webkit = webkit || w; lock.unlock() }
  var snapshot: (count: Int, webkit: Bool) { lock.lock(); defer { lock.unlock() }; return (n, webkit) }
}
struct Armed {
  let pid: pid_t, cover: pid_t
  let witness: Witness
  let observer: NSObjectProtocol
}
var armed: Armed?
func boundary(_ a: Armed) -> (reason: String?, wire: [String: Any]) {
  let owner = ownerPID(), front = frontPID(), w = a.witness.snapshot
  var wire: [String: Any] = ["witnesses": w.count, "webkitWitness": w.webkit, "ownerDeterminable": owner != nil]
  if let owner { wire["ownerIsCover"] = owner == Int(a.cover) }
  let reason: String? = front != a.cover ? "presenter-not-front"
    : owner.map { $0 != Int(a.cover) } == true ? "owner-not-cover" : w.count > 0 ? "cover-changed" : nil
  return (reason, wire)
}
let coverBundle = "org.cua.probe395.cover"
func validPair(_ q: [String: Any]) -> (pid: pid_t, cover: pid_t)? {
  guard let pid = (q["pid"] as? NSNumber)?.int32Value, let cover = (q["coverPid"] as? NSNumber)?.int32Value,
        pid > 0, cover > 0,
        NSRunningApplication(processIdentifier: pid)?.isFinishedLaunching == true,
        (pid == cover || NSRunningApplication(processIdentifier: cover)?.bundleIdentifier == coverBundle) else { return nil }
  return (pid, cover)
}
func disarmObserver() {
  if let a = armed { NSWorkspace.shared.notificationCenter.removeObserver(a.observer) }
  armed = nil
}
func arm(_ q: [String: Any]) -> [String: Any] {
  disarmObserver()
  guard let p = validPair(q) else { return ["valid": false, "reason": "request"] }
  let witness = Witness(), center = NSWorkspace.shared.notificationCenter
  // queue nil: delivered synchronously on the posting (main) thread whenever the main run loop runs.
  let observer = center.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: nil) { note in
    guard let a = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication, a.processIdentifier != p.cover else { return }
    let id = a.bundleIdentifier ?? ""
    witness.add(webkit: id == "com.apple.Safari" || id.hasPrefix("com.apple.WebKit"))
  }
  let a = Armed(pid: p.pid, cover: p.cover, witness: witness, observer: observer)
  armed = a
  let b = boundary(a)
  var w = b.wire
  if let reason = b.reason { disarmObserver(); w["valid"] = false; w["reason"] = reason + "-at-arm"; return w }
  w["valid"] = true
  return w
}
func disarm() -> [String: Any] {
  guard let a = armed else { return ["valid": false, "reason": "not-armed"] }
  RunLoop.current.run(until: Date().addingTimeInterval(0.05))
  let b = boundary(a)
  disarmObserver()
  var w = b.wire
  w["valid"] = b.reason == nil
  if let reason = b.reason { w["reason"] = reason + "-at-disarm" }
  return w
}

func dispatch(_ q: [String: Any]) -> [String: Any] {
  switch q["op"] as? String {
  case "arm": return arm(q)
  case "disarm": return disarm()
  case "witness":
    // The witness so far, still armed: whether the presentation the arm established holds at the action's start.
    guard let a = armed else { return ["valid": false, "reason": "not-armed"] }
    RunLoop.current.run(until: Date().addingTimeInterval(0.02))
    let b = boundary(a)
    var w = b.wire
    w["valid"] = b.reason == nil
    if let reason = b.reason { w["reason"] = reason + "-before-action" }
    return w
  default: break
  }
  if q["op"] as? String == "lookup", let bundle = q["bundle"] as? String {
    return ["pid": NSRunningApplication.runningApplications(withBundleIdentifier: bundle).first?.processIdentifier ?? 0]
  }
  guard let pid = (q["pid"] as? NSNumber)?.int32Value, pid > 0 else { return [:] }
  switch q["op"] as? String {
  case "front":
    if q["activate"] as? Bool == true {
      let app = NSRunningApplication(processIdentifier: pid)
      let accepted = app?.activate(options: []) ?? false
      let deadline = ms() + 2000
      while frontPID() != pid && ms() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.01)) }
      return ["frontmostPid": frontPID().map { $0 as Any } ?? NSNull(), "activationAccepted": accepted]
    }
    return ["frontmostPid": frontPID().map { $0 as Any } ?? NSNull()]
  case "status":
    let running = NSRunningApplication(processIdentifier: pid)
    let app = AXUIElementCreateApplication(pid)
    AXUIElementSetMessagingTimeout(app, 0.5)
    let windows = attr(app, "AXWindows") as? [AXUIElement] ?? []
    return ["ready": running?.isFinishedLaunching == true && !windows.isEmpty, "windows": windows.count,
            "bundle": running?.bundleIdentifier ?? ""]
  case "enable":
    let app = AXUIElementCreateApplication(pid)
    AXUIElementSetMessagingTimeout(app, 0.5)
    return ["manual": AXUIElementSetAttributeValue(app, "AXManualAccessibility" as CFString, kCFBooleanTrue).rawValue,
            "enhanced": AXUIElementSetAttributeValue(app, "AXEnhancedUserInterface" as CFString, kCFBooleanTrue).rawValue]
  case "cover":
    // Fixed-label readiness of the owned cover: its known bundle, and a normal-layer window on screen owned by it.
    let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
    let shown = windows.contains { ($0[kCGWindowLayer as String] as? Int) == 0 && ($0[kCGWindowOwnerPID as String] as? Int) == Int(pid) }
    return ["bundleOk": NSRunningApplication(processIdentifier: pid)?.bundleIdentifier == coverBundle, "onScreen": shown]
  case "titles":
    let app = AXUIElementCreateApplication(pid)
    AXUIElementSetMessagingTimeout(app, 0.5)
    let windows = attr(app, "AXWindows") as? [AXUIElement] ?? []
    return ["titles": windows.compactMap { attr($0, "AXTitle") as? String }]
  default: return [:]
  }
}

func handle(_ line: String) -> String {
  guard let data = line.data(using: .utf8), let q = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
        let reply = try? JSONSerialization.data(withJSONObject: dispatch(q), options: [.sortedKeys]),
        let out = String(data: reply, encoding: .utf8) else { return "{\"valid\":false,\"reason\":\"wire\"}" }
  return out
}

guard ProcessInfo.processInfo.environment["RUNNER_ENVIRONMENT"] == "github-hosted" else { exit(2) }
// Owned AppKit cover (as #390): a regular app with one visible titled window, beside the target and never overlapping
// it. AppKit runs on this original main thread. Prints only its pid.
if CommandLine.arguments.contains("--cover") {
  let app = NSApplication.shared
  app.setActivationPolicy(.regular)
  let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 380, height: 300), styleMask: [.titled], backing: .buffered, defer: false)
  window.title = "probe395 owned cover"
  if let screen = NSScreen.main {
    window.setFrame(NSRect(x: screen.frame.minX, y: screen.frame.maxY - 40 - 300, width: 380, height: 300), display: true)
  }
  window.makeKeyAndOrderFront(nil)
  app.activate(ignoringOtherApps: true)
  print("{\"pid\":\(ProcessInfo.processInfo.processIdentifier)}")
  fflush(stdout)
  app.run()
  exit(0)
}
// Requests are read off the main thread and handled at the top level of the main thread's own run loop (as #354's tool
// does): a request run inside DispatchQueue.main.sync would hold the main queue, through which the workspace delivers
// activation and frontmost updates, so an activation could never complete.
enum Item { case empty, eof, line(String) }
final class Inbox: @unchecked Sendable {
  private let lock = NSLock()
  private var items: [Item] = []
  func push(_ i: Item) { lock.lock(); items.append(i); lock.unlock() }
  func pop() -> Item { lock.lock(); defer { lock.unlock() }; return items.isEmpty ? .empty : items.removeFirst() }
}
let inbox = Inbox()
Thread.detachNewThread {
  while let line = readLine() { inbox.push(.line(line)) }
  inbox.push(.eof)
}
RunLoop.main.add(NSMachPort(), forMode: .default)
while true {
  switch inbox.pop() {
  case .line(let line):
    print(handle(line))
    fflush(stdout)
  case .eof: exit(0)
  case .empty: RunLoop.main.run(mode: .default, before: Date().addingTimeInterval(0.01))
  }
}
