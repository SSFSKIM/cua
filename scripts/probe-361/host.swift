// #395 owned cover and activation witness, with lane readiness/AX enablement from #405 (copied from ../probe-414/host.swift),
// plus #361's synthetic pasteboard content and its input-source selection. No AXValue reads.
import AppKit
import ApplicationServices
import Carbon
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
// The pasteboard's synthetic pre-trial content and its check after the trial: booleans and a count delta only.
var clipTypes: [String] = [], clipCount = 0
func clipSet(_ q: [String: Any]) -> [String: Any] {
  guard let text = q["text"] as? String else { return ["ok": false] }
  let pb = NSPasteboard.general
  pb.clearContents()
  let ok = pb.setString(text, forType: .string)
  clipTypes = (pb.types ?? []).map { $0.rawValue }.sorted()
  clipCount = pb.changeCount
  return ["ok": ok && pb.string(forType: .string) == text]
}
func clipCheck(_ q: [String: Any]) -> [String: Any] {
  guard let text = q["text"] as? String else { return ["ok": false] }
  let pb = NSPasteboard.general
  let types = (pb.types ?? []).map { $0.rawValue }.sorted()
  return ["ok": true, "stringEqual": pb.string(forType: .string) == text, "typesEqual": types == clipTypes,
          "changeCountDelta": pb.changeCount - clipCount]
}

// Text Input Sources: the candidates' ids and capability flags (no content), and the selection of one, enabling it (and
// its parent input method) first when it is installed but not enabled.
func tisString(_ s: TISInputSource, _ key: CFString) -> String? {
  guard let p = TISGetInputSourceProperty(s, key) else { return nil }
  return Unmanaged<CFString>.fromOpaque(p).takeUnretainedValue() as String
}
func tisBool(_ s: TISInputSource, _ key: CFString) -> Bool {
  guard let p = TISGetInputSourceProperty(s, key) else { return false }
  return CFBooleanGetValue(Unmanaged<CFBoolean>.fromOpaque(p).takeUnretainedValue())
}
func installed(_ id: String) -> TISInputSource? {
  let filter = [kTISPropertyInputSourceID as String: id] as CFDictionary
  return (TISCreateInputSourceList(filter, true)?.takeRetainedValue() as? [TISInputSource])?.first
}
func currentSource() -> [String: Any] {
  let s = TISCopyCurrentKeyboardInputSource().takeRetainedValue()
  let properties = CFPreferencesCopyAppValue("AppleGlobalTextInputProperties" as CFString, "com.apple.HIToolbox" as CFString) as? [String: Any]
  return ["id": tisString(s, kTISPropertyInputSourceID) ?? "", "keyboardLayout": tisString(s, kTISPropertyInputSourceType) == (kTISTypeKeyboardLayout as String),
          "perContext": (properties?["TextInputGlobalPropertyPerContextInput"] as? NSNumber)?.boolValue ?? false]
}
func sourceFacts(_ s: TISInputSource) -> [String: Any] {
  let type = tisString(s, kTISPropertyInputSourceType) ?? ""
  return ["id": tisString(s, kTISPropertyInputSourceID) ?? "", "category": tisString(s, kTISPropertyInputSourceCategory) ?? "",
          "type": type == (kTISTypeKeyboardLayout as String) ? "layout" : type == (kTISTypeKeyboardInputMode as String) ? "mode" :
            type == (kTISTypeKeyboardInputMethodModeEnabled as String) ? "method-mode-enabled" :
            type == (kTISTypeKeyboardInputMethodWithoutModes as String) ? "method" : "other",
          "enabled": tisBool(s, kTISPropertyInputSourceIsEnabled), "enableCapable": tisBool(s, kTISPropertyInputSourceIsEnableCapable),
          "selectCapable": tisBool(s, kTISPropertyInputSourceIsSelectCapable), "selected": tisBool(s, kTISPropertyInputSourceIsSelected)]
}
func sourcesList() -> [String: Any] {
  let all = TISCreateInputSourceList(nil, true)?.takeRetainedValue() as? [TISInputSource] ?? []
  let wanted = all.filter { s in
    guard let id = tisString(s, kTISPropertyInputSourceID) else { return false }
    return ["Korean", "Kotoeri", "Japanese", "SCIM", "TCIM", "Pinyin"].contains { id.contains($0) }
  }
  return ["sources": wanted.map(sourceFacts), "current": currentSource()]
}
func runFor(_ seconds: Double, until done: () -> Bool) {
  let deadline = Date().addingTimeInterval(seconds)
  while !done() && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.05)) }
}
func sourceSelect(_ q: [String: Any]) -> [String: Any] {
  guard let id = q["id"] as? String, let source = installed(id) else { return ["found": false, "current": currentSource()] }
  var out: [String: Any] = ["found": true, "before": sourceFacts(source)]
  // An input mode is selectable only under an enabled method: the nearest installed ancestor id (Kotoeri's Japanese modes
  // read enabled on the hosted image while their method does not, and their selection then fails with paramErr).
  var parts = id.split(separator: ".").dropLast()
  while !parts.isEmpty, installed(parts.joined(separator: ".")) == nil { parts = parts.dropLast() }
  if !parts.isEmpty, let parent = installed(parts.joined(separator: ".")), !tisBool(parent, kTISPropertyInputSourceIsEnabled) {
    out["parentEnableStatus"] = Int(TISEnableInputSource(parent))
    runFor(2) { installed(parts.joined(separator: ".")).map { tisBool($0, kTISPropertyInputSourceIsEnabled) } ?? false }
  }
  if !tisBool(source, kTISPropertyInputSourceIsEnabled) {
    out["enableStatus"] = Int(TISEnableInputSource(source))
    runFor(2) { installed(id).map { tisBool($0, kTISPropertyInputSourceIsEnabled) } ?? false }
  }
  let fresh = installed(id) ?? source
  let status = TISSelectInputSource(fresh)
  out["selectStatus"] = Int(status)
  if status != noErr {
    // One retry after the system has had a second to register the enablement.
    runFor(1) { false }
    out["selectRetryStatus"] = Int(TISSelectInputSource(installed(id) ?? fresh))
  }
  runFor(3) { (currentSource()["id"] as? String) == id }
  out["after"] = sourceFacts(installed(id) ?? fresh)
  out["current"] = currentSource()
  out["selected"] = (currentSource()["id"] as? String) == id
  return out
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
  switch q["op"] as? String {
  case "clip-set": return clipSet(q)
  case "clip-check": return clipCheck(q)
  case "sources": return sourcesList()
  case "source-select": return sourceSelect(q)
  case "source-current": return currentSource()
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
      // Fixed-label diagnostic, never a pid: whether the request was accepted and where the workspace ended up.
      let now = frontPID(), safari = (q["safariPid"] as? NSNumber)?.int32Value
      let where_ = now == pid ? "target" : now == nil ? "none" : now == safari ? "safari" : "other"
      return ["frontmostPid": now.map { $0 as Any } ?? NSNull(), "activationAccepted": accepted,
              "targetBundle": app?.bundleIdentifier == coverBundle ? "Cover" : app?.bundleIdentifier == "com.apple.Safari" ? "Safari" : app == nil ? "none" : "other",
              "targetTerminated": app?.isTerminated ?? true, "workspaceFront": where_]
    }
    return ["frontmostPid": frontPID().map { $0 as Any } ?? NSNull()]
  case "status":
    let running = NSRunningApplication(processIdentifier: pid)
    let app = AXUIElementCreateApplication(pid)
    AXUIElementSetMessagingTimeout(app, 0.5)
    let windows = attr(app, "AXWindows") as? [AXUIElement] ?? []
    return ["ready": running?.isFinishedLaunching == true && !windows.isEmpty,
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
// A fresh process's reading of the current source: what any other process (the engine included) reads.
if CommandLine.arguments.contains("--source-current") {
  let d = try! JSONSerialization.data(withJSONObject: currentSource(), options: [.sortedKeys])
  print(String(decoding: d, as: UTF8.self)); fflush(stdout)
  exit(0)
}
// Owned AppKit cover (as #390): a regular app with one visible titled window, side by side with the Safari fixture and
// never overlapping it. AppKit runs on this original main thread. Prints only its pid.
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
// does). Running a request inside DispatchQueue.main.sync would hold the main queue for its whole duration, and the
// workspace's activation and frontmost updates are delivered through that queue, so an activation could never complete.
enum Item { case empty, eof, line(String) }
final class Inbox: @unchecked Sendable {
  private let lock = NSLock()
  private var items: [Item] = []
  func push(_ i: Item) { lock.lock(); items.append(i); lock.unlock() }
  // An explicit enum: a String?? popped through a ternary wraps a nil line as .some(nil), so an empty queue read as end of input.
  func pop() -> Item { lock.lock(); defer { lock.unlock() }; return items.isEmpty ? .empty : items.removeFirst() }
}
let inbox = Inbox()
Thread.detachNewThread {
  while let line = readLine() { inbox.push(.line(line)) }
  inbox.push(.eof)  // end of input: the main thread drains what is queued, then exits
}
RunLoop.main.add(NSMachPort(), forMode: .default)  // keeps run(until:) waiting instead of returning at once
while true {
  switch inbox.pop() {
  case .line(let line):
    print(handle(line))
    fflush(stdout)
  case .eof: exit(0)
  case .empty: RunLoop.main.run(mode: .default, before: Date().addingTimeInterval(0.01))
  }
}
