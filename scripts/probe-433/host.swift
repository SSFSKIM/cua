// The owned cover and activation witness (#395), with lane readiness and AX enablement (#405), copied unchanged from
// ../probe-398/host.swift (probe/398-qual), itself from probe/361-qual, plus #340's `axtext`. The only AXValue read is
// that op's count of the owned page's static texts reading the cell's text before and after its change; only the two
// counts leave the helper.
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
  case "signals": return signals(q, pid: pid)
  case "axtext":
    // Breadth-first from the owned app's windows (depth at most 60, at most 6000 elements): how many AXStaticTexts
    // read `before` and how many read `after` (AXValue, trimmed). Counts only.
    guard let before = q["before"] as? String, let after = q["after"] as? String else { return [:] }
    let app = AXUIElementCreateApplication(pid)
    AXUIElementSetMessagingTimeout(app, 0.5)
    var queue: [(element: AXUIElement, depth: Int)] = (attr(app, "AXWindows") as? [AXUIElement] ?? []).map { ($0, 0) }
    var next = 0, nBefore = 0, nAfter = 0
    while next < queue.count && next < 6000 {
      let (e, depth) = queue[next]
      next += 1
      AXUIElementSetMessagingTimeout(e, 0.5)
      if attr(e, "AXRole") as? String == "AXStaticText", let value = attr(e, "AXValue") as? String {
        let text = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if text == before { nBefore += 1 }
        if text == after { nAfter += 1 }
      }
      if depth < 60, let children = attr(e, "AXChildren") as? [AXUIElement] { queue += children.map { ($0, depth + 1) } }
    }
    return ["before": nBefore, "after": nAfter]
  default: return [:]
  }
}

// #442: what accessibility offers at a screen point (top-left global points), read by the kit beside the engine. Every
// walk is bounded and the whole op keeps a 3 s deadline, so it answers within the harness's 10 s ask.
let interactiveRoles: Set<String> = [
  "AXButton", "AXCheckBox", "AXRadioButton", "AXLink", "AXPopUpButton", "AXMenuButton", "AXMenuItem", "AXTextField", "AXTextArea",
  "AXComboBox", "AXSearchField", "AXSecureTextField", "AXSlider", "AXIncrementor", "AXDisclosureTriangle", "AXTab", "AXSwitch",
  "AXColorWell", "AXSegmentedControl",
]
func since(_ t: Double) -> Double { ((ms() - t) * 100).rounded() / 100 }
func frameOf(_ e: AXUIElement) -> CGRect? {
  guard let p = attr(e, "AXPosition"), let z = attr(e, "AXSize"), CFGetTypeID(p) == AXValueGetTypeID(), CFGetTypeID(z) == AXValueGetTypeID() else { return nil }
  var o = CGPoint.zero, sz = CGSize.zero
  guard AXValueGetValue(p as! AXValue, .cgPoint, &o), AXValueGetValue(z as! AXValue, .cgSize, &sz) else { return nil }
  return CGRect(origin: o, size: sz)
}
func holdsPoint(_ r: CGRect, _ p: CGPoint) -> Bool { r.width > 0 && r.height > 0 && p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY }
func actionsOf(_ e: AXUIElement) -> [String] {
  var names: CFArray?
  return AXUIElementCopyActionNames(e, &names) == .success ? (names as? [String] ?? []) : []
}
func kids(_ e: AXUIElement, _ name: String = "AXChildren") -> [AXUIElement]? { attr(e, name) as? [AXUIElement] }
func trimmed(_ v: String) -> String { String(v.trimmingCharacters(in: .whitespacesAndNewlines).prefix(40)) }
func labelOf(_ e: AXUIElement) -> String {
  for name in ["AXTitle", "AXDescription", "AXValue"] {
    if let v = attr(e, name) as? String, !trimmed(v).isEmpty { return trimmed(v) }
  }
  for c in (kids(e) ?? []).prefix(8) where attr(c, "AXRole") as? String == "AXStaticText" {
    if let v = attr(c, "AXValue") as? String, !trimmed(v).isEmpty { return trimmed(v) }
  }
  return ""
}
func rectOut(_ r: CGRect?) -> Any {
  guard let r else { return NSNull() }
  let q = { (x: CGFloat) in (Double(x) * 100).rounded() / 100 }
  return ["x": q(r.minX), "y": q(r.minY), "width": q(r.width), "height": q(r.height)]
}
func hitAt(_ root: AXUIElement, _ p: CGPoint) -> AXUIElement? {
  var hit: AXUIElement?
  return AXUIElementCopyElementAtPosition(root, Float(p.x), Float(p.y), &hit) == .success ? hit : nil
}
func ancestorsOf(_ e: AXUIElement, limit: Int = 300) -> [AXUIElement] {
  var out: [AXUIElement] = [], at = e
  while out.count < limit, let up = attr(at, "AXParent"), CFGetTypeID(up) == AXUIElementGetTypeID() {
    let u = up as! AXUIElement
    AXUIElementSetMessagingTimeout(u, 0.5)
    out.append(u); at = u
    if attr(u, "AXRole") as? String == "AXApplication" { break }
  }
  return out
}
// A hit's description: its role, its DOM id, and its nearest control (interactive role) at or above it below the web area.
func hitOut(_ h: AXUIElement?) -> [String: Any] {
  guard let h else { return ["role": NSNull()] }
  AXUIElementSetMessagingTimeout(h, 0.5)
  var w: [String: Any] = ["role": attr(h, "AXRole") as? String ?? NSNull(), "dom": attr(h, "AXDOMIdentifier") as? String ?? NSNull()]
  for e in [h] + ancestorsOf(h, limit: 40) {
    let role = attr(e, "AXRole") as? String ?? ""
    if role == "AXWebArea" { break }
    if interactiveRoles.contains(role) { w["control"] = ["role": role, "label": labelOf(e)]; break }
  }
  return w
}
// A depth-first preorder walk from `root` collecting the elements whose frame holds `p` and that act on their own (an
// interactive role or AXPress), each with the index of its nearest such ancestor in the list (`up`, -1 for none).
// `pruned` descends only into elements whose frame holds the point or reads none; `childAttr` names the children
// attribute walked (an element that does not offer it is walked through AXChildren and counted `unsupported`).
func collect(_ root: AXUIElement, _ p: CGPoint, pruned: Bool, childAttr: String, deadline: Double, cap: Int, details: Bool) -> [String: Any] {
  let t0 = ms()
  var stack: [(AXUIElement, Int, Int)] = [(root, 0, -1)]
  var found: [[String: Any]] = [], visited = 0, unsupported = 0, cut = false
  while let (e, depth, up) = stack.popLast() {
    if visited >= cap || ms() > deadline { cut = true; break }
    visited += 1
    AXUIElementSetMessagingTimeout(e, 0.5)
    let role = attr(e, "AXRole") as? String ?? "AXUnknown"
    let frame = frameOf(e)
    let here = frame.map { holdsPoint($0, p) } ?? false
    var mine = up
    if here {
      let press = actionsOf(e).contains("AXPress")
      if interactiveRoles.contains(role) || press {
        var item: [String: Any] = ["role": role, "label": labelOf(e), "frame": rectOut(frame), "press": press, "depth": depth, "up": up,
                                   "dom": attr(e, "AXDOMIdentifier") as? String ?? NSNull()]
        if details, let par = attr(e, "AXParent"), CFGetTypeID(par) == AXUIElementGetTypeID() {
          let pe = par as! AXUIElement
          // Whether its parent's AXVisibleChildren lists it (null: the parent offers none), and its place among AXChildren.
          if let vis = kids(pe, "AXVisibleChildren") { item["visible"] = vis.contains { CFEqual($0, e) } } else { item["visible"] = NSNull() }
          if let all = kids(pe) { item["index"] = all.firstIndex { CFEqual($0, e) } ?? -1; item["siblings"] = all.count }
        }
        mine = found.count
        found.append(item)
      }
    }
    if depth >= 300 || (pruned && frame != nil && !here) { continue }
    var list = kids(e, childAttr)
    if list == nil && childAttr != "AXChildren" { unsupported += 1; list = kids(e) }
    for k in (list ?? []).reversed() { stack.append((k, depth + 1, mine)) }
  }
  return ["found": found, "visited": visited, "ms": since(t0), "cut": cut, "unsupported": unsupported]
}
// The first web area under the application's windows, breadth-first (no hit-test).
func webAreaOf(_ app: AXUIElement) -> AXUIElement? {
  var queue: [AXUIElement] = kids(app, "AXWindows") ?? [], i = 0
  while i < queue.count && i < 4000 {
    let e = queue[i]; i += 1
    AXUIElementSetMessagingTimeout(e, 0.5)
    if attr(e, "AXRole") as? String == "AXWebArea" { return e }
    queue += kids(e) ?? []
  }
  return nil
}
// Hits at one point, 5 ms apart for 300 ms (at most 60): the first answer and every change after it, with its time
// (ms from the first call). Chromium answers a hit from its cache or its tree's bounds and corrects it asynchronously.
func hitSeq(_ app: AXUIElement, _ p: CGPoint) -> [[String: Any]] {
  let t0 = ms()
  var out: [[String: Any]] = [], last = "", n = 0
  while n < 60 && ms() - t0 <= 300 {
    let h = hitOut(hitAt(app, p))
    let ctl = (h["control"] as? [String: Any]).map { "\($0["role"] ?? "")/\($0["label"] ?? "")" } ?? ""
    let key = "\(h["role"] ?? "")|\(h["dom"] ?? "")|\(ctl)"
    if key != last { var w = h; w["t"] = since(t0); out.append(w); last = key }
    n += 1
    usleep(5000)
  }
  return out
}
// `walks`: the four walks for the controls at the point; `hits`: the hit-tests (one from the application, timed, from the
// web area and the hit's ancestors, and the 5 x 5 grid); `seq`: `hitSeq`, before anything else. A hit-test moves
// Chromium's hit cache, which the engine's own hit then reads, so the harness asks for hits only after the click unless
// it means to warm the cache (PROBE_HITS=warm).
func signals(_ q: [String: Any], pid: pid_t) -> [String: Any] {
  guard let x = (q["x"] as? NSNumber)?.doubleValue, let y = (q["y"] as? NSNumber)?.doubleValue else { return ["error": "request"] }
  let walks = q["walks"] as? Bool ?? true, hits = q["hits"] as? Bool ?? true
  let p = CGPoint(x: x, y: y), start = ms(), deadline = start + 3000
  let app = AXUIElementCreateApplication(pid)
  AXUIElementSetMessagingTimeout(app, 0.5)
  var out: [String: Any] = [:]
  if q["seq"] as? Bool == true { out["seq"] = hitSeq(app, p) }
  var hit: AXUIElement?, chain: [AXUIElement] = [], web: AXUIElement?
  if hits {
    let t = ms()
    hit = hitAt(app, p)
    out["hitMs"] = since(t)
    out["hit"] = hitOut(hit)
    chain = hit.map { ancestorsOf($0) } ?? []
    out["ancestorRoles"] = chain.prefix(40).map { attr($0, "AXRole") as? String ?? "AXUnknown" }
    web = chain.first { attr($0, "AXRole") as? String == "AXWebArea" }
  }
  out["webFrom"] = web == nil ? "windows" : "hit"
  if web == nil { web = webAreaOf(app) }
  guard let web else { out["error"] = "no-web-area"; out["ms"] = since(start); return out }
  if walks {
    // (a) the controls whose frames hold the point: the whole web area walked, the walk pruned to the point, and the
    // pruned walk through AXChildrenInNavigationOrder and through AXVisibleChildren.
    out["full"] = collect(web, p, pruned: false, childAttr: "AXChildren", deadline: deadline, cap: 8000, details: true)
    out["pruned"] = collect(web, p, pruned: true, childAttr: "AXChildren", deadline: deadline, cap: 8000, details: false)
    out["nav"] = collect(web, p, pruned: true, childAttr: "AXChildrenInNavigationOrder", deadline: deadline, cap: 8000, details: false)
    out["visible"] = collect(web, p, pruned: true, childAttr: "AXVisibleChildren", deadline: deadline, cap: 8000, details: false)
  }
  if hits {
    // Hit-tests from other roots: the web area, and the hit's ancestors up to the web area (at most 8).
    let t = ms()
    out["hitFromWeb"] = hitOut(hitAt(web, p))
    var fromChain: [[String: Any]] = []
    for a in chain.prefix(8) {
      if ms() > deadline { break }
      var w = hitOut(hitAt(a, p)); w["root"] = attr(a, "AXRole") as? String ?? "AXUnknown"; fromChain.append(w)
      if CFEqual(a, web) { break }
    }
    out["hitFromChain"] = fromChain
    // A 5 x 5 grid of hits 4 pt apart around the point, from the application.
    var grid: [[String: Any]] = []
    for dy in stride(from: -8.0, through: 8.0, by: 4.0) {
      for dx in stride(from: -8.0, through: 8.0, by: 4.0) where ms() <= deadline {
        var w = hitOut(hitAt(app, CGPoint(x: x + dx, y: y + dy))); w["dx"] = dx; w["dy"] = dy; grid.append(w)
      }
    }
    out["grid"] = grid
    out["hitsMs"] = since(t)
  }
  // The attribute names of the hit and of the controls whose frames hold the point (names only, on request).
  if q["names"] as? Bool == true {
    var names = Set<String>()
    var targets: [AXUIElement] = hit.map { [$0] } ?? []
    var stack: [AXUIElement] = [web], n = 0
    while let e = stack.popLast(), n < 4000, ms() <= deadline {
      n += 1
      AXUIElementSetMessagingTimeout(e, 0.5)
      if interactiveRoles.contains(attr(e, "AXRole") as? String ?? ""), let f = frameOf(e), holdsPoint(f, p) { targets.append(e) }
      stack += kids(e) ?? []
    }
    for e in targets.prefix(8) {
      var list: CFArray?
      if AXUIElementCopyAttributeNames(e, &list) == .success, let l = list as? [String] { names.formUnion(l) }
      var param: CFArray?
      if AXUIElementCopyParameterizedAttributeNames(e, &param) == .success, let l = param as? [String] { names.formUnion(l.map { "param:" + $0 }) }
    }
    out["attributeNames"] = names.sorted()
  }
  out["ms"] = since(start)
  return out
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
