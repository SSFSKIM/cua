// The key-route diagnostic's Accessibility side (ruling 1198; #117 M5): where a key sent to TextEdit can land while its
// Open panel (drawn by com.apple.appkit.xpc.openAndSavePanelService) is focused, read on the device outside either engine.
// Run as a binary compiled into the run directory (./key-route-device.mjs):
//   key-route read <pid>
//       For the app's AXFocusedUIElement and each AXParent up to the application (at most 64): its role,
//       AXUIElementGetPid and the private _AXUIElementGetActualPid (dlsym; "unavailable" when the symbol is not found),
//       and for every pid met its NSRunningApplication's bundle id, activationPolicy and isFinishedLaunching. Then:
//       `cuaKeyboardTarget`, the pid cua's engine posts keys to since #582, predicted from the observed chain (native/engine/Sources/Engine/KeyTarget.swift:95
//       keyboardTarget and :67 remoteViewKeyOwner, mirrored here, never imported: the engine is not changed), and
//       `cuaPublicPidTarget`, the one it posted to before #582 (the focused element's public AXUIElementGetPid, else
//       the app's), kept apart;
//       `selectedAncestor`, the element the static reading of the vendor's binary says its walk selects (the first in the
//       chain whose actual pid is not the app's and whose owner's activation policy is prohibited; null when none is,
//       "unavailable" without the private call), and `staticReadingTarget`, its pid or else the app's;
//       `routes`, every public route that could name the panel's process, each read or not (`read`, `error`), its pids
//       (an empty list is a lookup that succeeded and found none), and whether they hold the focused element's actual
//       pid (`matchesActual`) and the selected ancestor's (`matchesSelected`), null where that pid is not known.
//       `panel`: the open-panel window found by its AXIdentifier and its frame, the one `panel` and `cancel` are given.
//   key-route panel <pid> [<x,y,w,h>]
//       Whether the app shows its Open panel: a window of the app's (AXFocusedWindow or AXWindows) whose AXIdentifier is
//       open-panel, as the matrix's cells tell it, or, given the panel's frame as `read` found it, an AX window of the
//       app's or an on-screen window (of any owner: macOS 27 lists the panel under the app's pid) at that frame (within
//       2 pt). -> {"trusted", "up", "ax", "windowAtFrame", "frame", "unread"}: each of up, ax and windowAtFrame true,
//       false, or null when it was not read (`unread` names why); up is false only when every reading made says so.
//   key-route cancel <pid> [<x,y,w,h>]
//       That panel cancelled by Accessibility: its AXCancelButton pressed; else the first AXButton titled Cancel (or 취소)
//       under it (breadth first, at most 5000 elements); else the window's AXCancel action. No pointer event, never an
//       engine. Then awaited gone (by `panel`'s reading), up to 5 s. -> {"trusted", "found", "via", "pressed", "closed",
//       "unread"}: closed is true only when the panel reads gone.
// Numbers, roles, bundle ids and booleans only: a title is compared inside, never printed. It reads and writes another
// app's windows, so every command refuses off a GitHub-hosted runner (exit 3) before any Accessibility call. It never
// asks for a grant: an untrusted process answers {"trusted": false} and reads nothing.
import AppKit
import ApplicationServices
import Foundation

func emit(_ object: [String: Any]) {
  let data = try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
  FileHandle.standardOutput.write(data + Data("\n".utf8))
}
let args = CommandLine.arguments
if ProcessInfo.processInfo.environment["RUNNER_ENVIRONMENT"] != "github-hosted" {
  FileHandle.standardError.write(Data("key-route: refused: it runs only on a GitHub-hosted runner (RUNNER_ENVIRONMENT=github-hosted), never on a Mac of the owner's\n".utf8))
  exit(3)
}
/// `x,y,w,h` as a rectangle, or nil.
func rectArg(_ text: String) -> CGRect? {
  let parts = text.split(separator: ",").compactMap { Double($0) }
  return parts.count == 4 ? CGRect(x: parts[0], y: parts[1], width: parts[2], height: parts[3]) : nil
}
guard (args.count == 3 || (args.count == 4 && args[1] != "read")), ["read", "panel", "cancel"].contains(args[1]), let appPid = Int32(args[2]), appPid > 0 else {
  FileHandle.standardError.write(Data("usage: key-route read <pid> | key-route panel|cancel <pid> [<x,y,w,h>]\n".utf8))
  exit(64)
}
let knownFrame: CGRect? = args.count == 4 ? rectArg(args[3]) : nil
if args.count == 4 && knownFrame == nil { FileHandle.standardError.write(Data("key-route: the frame is x,y,w,h\n".utf8)); exit(64) }
guard AXIsProcessTrusted() else { emit(["trusted": false]); exit(0) }

let panelService = "com.apple.appkit.xpc.openAndSavePanelService"
let app = AXUIElementCreateApplication(appPid)
AXUIElementSetMessagingTimeout(app, 1.0)

func copy(_ e: AXUIElement, _ attribute: String) -> (status: AXError, value: CFTypeRef?) {
  var value: CFTypeRef?
  let status = AXUIElementCopyAttributeValue(e, attribute as CFString, &value)
  return (status, status == .success ? value : nil)
}
/// A status that answered: a value, or none (the attribute holds no value or the element has none).
func answered(_ status: AXError) -> Bool { status == .success || status == .noValue || status == .attributeUnsupported }
func element(_ value: CFTypeRef?) -> AXUIElement? {
  guard let value, CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
  let e = value as! AXUIElement
  AXUIElementSetMessagingTimeout(e, 1.0)
  return e
}
func string(_ e: AXUIElement, _ attribute: String) -> String? { copy(e, attribute).value as? String }
func publicPid(_ e: AXUIElement) -> pid_t? {
  var pid: pid_t = 0
  return AXUIElementGetPid(e, &pid) == .success ? pid : nil
}
// The private call the vendor's helper makes (AccessibilitySPI.getActualPID), found at run time.
typealias ActualPidFunction = @convention(c) (AXUIElement, UnsafeMutablePointer<pid_t>) -> AXError
let actualPidFunction: ActualPidFunction? = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "_AXUIElementGetActualPid")
  .map { unsafeBitCast($0, to: ActualPidFunction.self) }
func actualPid(_ e: AXUIElement) -> Any {
  guard let actualPidFunction else { return "unavailable" }
  var pid: pid_t = 0
  let status = actualPidFunction(e, &pid)
  return status == .success ? Int(pid) : ["error": Int(status.rawValue)]
}
func frame(_ e: AXUIElement) -> CGRect? { frameRead(e).rect }
/// An element's frame and whether it was read: `read` false when its position or size failed (not answered), so no
/// frame there is unread, never a frame that does not match.
func frameRead(_ e: AXUIElement) -> (rect: CGRect?, read: Bool) {
  var origin = CGPoint.zero, size = CGSize.zero
  let p = copy(e, kAXPositionAttribute), s = copy(e, kAXSizeAttribute)
  guard let pv = p.value, CFGetTypeID(pv) == AXValueGetTypeID(), AXValueGetValue(pv as! AXValue, .cgPoint, &origin),
        let sv = s.value, CFGetTypeID(sv) == AXValueGetTypeID(), AXValueGetValue(sv as! AXValue, .cgSize, &size) else {
    return (nil, answered(p.status) && answered(s.status))
  }
  return (CGRect(origin: origin, size: size), true)
}
func rectWire(_ r: CGRect?) -> Any {
  guard let r else { return NSNull() }
  return ["x": Double(r.minX), "y": Double(r.minY), "width": Double(r.width), "height": Double(r.height)]
}
func policyName(_ p: NSApplication.ActivationPolicy) -> String {
  switch p {
  case .regular: return "regular"
  case .accessory: return "accessory"
  case .prohibited: return "prohibited"
  @unknown default: return "unknown"
  }
}
func near(_ a: CGRect, _ b: CGRect) -> Bool {
  abs(a.minX - b.minX) <= 2 && abs(a.minY - b.minY) <= 2 && abs(a.width - b.width) <= 2 && abs(a.height - b.height) <= 2
}

/// The on-screen window list, front to back (owner pid, layer and bounds only), or nil when the window server answered
/// no list: unread, never an empty screen.
func windowList() -> [(pid: Int, layer: Int, bounds: CGRect)]? {
  guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return nil }
  return list.compactMap { entry in
    guard let pid = entry[kCGWindowOwnerPID as String] as? Int, let b = entry[kCGWindowBounds as String] as? NSDictionary,
          let bounds = CGRect(dictionaryRepresentation: b as CFDictionary), bounds.width > 1, bounds.height > 1 else { return nil }
    return (pid, entry[kCGWindowLayer as String] as? Int ?? 0, bounds)
  }
}

/// The open-panel window of the app: its AXFocusedWindow when that is the panel, else one of its AXWindows; failing the
/// identifier, given the panel's known frame, the app's AX window at it. Absence is certified (`read` true, no window)
/// only when the app's windows were read and every candidate's identifier (and, given the frame, its frame) was read
/// and did not match; any reading that failed leaves it unread (`read` false, `error` naming each), never a non-match.
func panelLookup(_ frameHint: CGRect?) -> (window: AXUIElement?, read: Bool, error: String?) {
  let focusedRead = copy(app, kAXFocusedWindowAttribute), windowsRead = copy(app, kAXWindowsAttribute)
  let candidates = [element(focusedRead.value)].compactMap { $0 } + ((windowsRead.value as? [AXUIElement]) ?? [])
  var unread: [String] = answered(windowsRead.status) ? [] : ["AXWindows failed (\(windowsRead.status.rawValue))"]
  var idsUnread = 0, framesUnread = 0
  for candidate in candidates {
    let id = copy(candidate, kAXIdentifierAttribute)
    if id.value as? String == "open-panel" { return (candidate, true, nil) }
    if !answered(id.status) { idsUnread += 1 }
  }
  if let frameHint {
    for candidate in candidates {
      let read = frameRead(candidate)
      if let rect = read.rect, near(rect, frameHint) { return (candidate, true, nil) }
      if !read.read { framesUnread += 1 }
    }
  }
  if idsUnread > 0 { unread.append("the AXIdentifier of \(idsUnread) window(s) unread") }
  if framesUnread > 0 { unread.append("the frame of \(framesUnread) window(s) unread") }
  return (nil, unread.isEmpty, unread.isEmpty ? nil : unread.joined(separator: "; "))
}
/// The panel's state: up by Accessibility, or by an on-screen window at its known frame; false only when every reading
/// made says so, null when one that could say it is up went unread.
func panelState(_ frameHint: CGRect?) -> (up: Bool?, ax: Bool?, windowAtFrame: Bool?, frame: CGRect?, window: AXUIElement?, unread: [String]) {
  let lookup = panelLookup(frameHint)
  var unread: [String] = lookup.error.map { [$0] } ?? []
  let ax: Bool? = lookup.window != nil ? true : lookup.read ? false : nil
  var atFrame: Bool? = nil
  if let frameHint {
    if let windows = windowList() { atFrame = windows.contains { near($0.bounds, frameHint) } } else { unread.append("the window list was unread") }
  }
  let up: Bool? = ax == true || atFrame == true ? true : ax == false && (frameHint == nil || atFrame == false) ? false : nil
  return (up, ax, atFrame, lookup.window.flatMap(frame), lookup.window, unread)
}
func optional(_ value: Bool?) -> Any { value.map { $0 as Any } ?? NSNull() }

func read() {
  let focusedRead = copy(app, kAXFocusedUIElementAttribute)
  let focused = element(focusedRead.value)
  var chain: [[String: Any]] = []
  var pids = Set<pid_t>([appPid])
  var walked = focused
  while let e = walked, chain.count < 64 {
    let role = string(e, kAXRoleAttribute)
    let pid = publicPid(e), actual = actualPid(e)
    if let pid { pids.insert(pid) }
    if let a = actual as? Int { pids.insert(pid_t(a)) }
    chain.append(["depth": chain.count, "role": role ?? NSNull(), "pid": pid.map { Int($0) } ?? NSNull(), "actualPid": actual])
    if role == (kAXApplicationRole as String) { break }
    walked = element(copy(e, kAXParentAttribute).value)
  }
  // Every pid met (and the panel service's instances), as its running application describes it.
  let services = NSRunningApplication.runningApplications(withBundleIdentifier: panelService).map { $0.processIdentifier }
  pids.formUnion(services)
  var processes: [String: Any] = [:]
  for pid in pids.sorted() {
    guard let running = NSRunningApplication(processIdentifier: pid) else { processes[String(pid)] = ["running": false]; continue }
    processes[String(pid)] = ["running": true, "bundleId": running.bundleIdentifier.map { $0 as Any } ?? NSNull(), "activationPolicy": policyName(running.activationPolicy),
                              "finishedLaunching": running.isFinishedLaunching]
  }
  let focusedActual = focused.map { actualPid($0) } as Any? ?? NSNull()
  let reference = focusedActual as? Int

  // cua's target before #582, and still its answer when the walk below finds no remote view: the application's focused
  // element's AXUIElementGetPid when positive, else the app's pid. AXUIElementGetPid leaves 0 when it fails.
  let publicTarget: pid_t = {
    guard let focused else { return appPid }
    var owner: pid_t = 0
    AXUIElementGetPid(focused, &owner)
    return owner > 0 ? owner : appPid
  }()
  // cua's engine since #582: a prediction from the observed chain, not the engine's own answer. It mirrors
  // KeyTarget.swift:95 keyboardTarget, :67 remoteViewKeyOwner and :49 owningProcessKind: from the focused element up
  // its parents, an element whose actual pid is unread or whose process is no finished-launching running application is
  // passed over; the first that classifies ends the walk, its pid the target when that process's policy is prohibited
  // and it is not the app's; any other end keeps the public target. Without the private call the walk is not made. The
  // chain it walks stops at AXApplication or 64 entries, without the engine's 250 ms budget and 300-parent bound.
  let cuaTarget: pid_t = {
    guard focused != nil, actualPidFunction != nil else { return publicTarget }
    for row in chain {
      guard let actual = row["actualPid"] as? Int, actual > 0, let running = NSRunningApplication(processIdentifier: pid_t(actual)),
            running.isFinishedLaunching else { continue }
      return running.activationPolicy == .prohibited && actual != Int(appPid) ? pid_t(actual) : publicTarget
    }
    return publicTarget
  }()
  // The static reading's rule for the vendor's helper: walking the chain, the first element whose actual pid differs
  // from the app's and whose owner's activation policy is prohibited.
  let selected: [String: Any]? = chain.first { row in
    guard let a = row["actualPid"] as? Int, a != Int(appPid) else { return false }
    return NSRunningApplication(processIdentifier: pid_t(a))?.activationPolicy == .prohibited
  }.map { ["depth": $0["depth"]!, "pid": $0["actualPid"]!] }
  let selectedPid = selected?["pid"] as? Int

  // The panel's frame: the focused element's AXWindow, else the app's open-panel window.
  let axWindowRead = focused.map { copy($0, kAXWindowAttribute) }
  let axWindow = element(axWindowRead?.value)
  let panel = panelLookup(nil).window
  let panelFrame = (axWindow.flatMap(frame)) ?? panel.flatMap(frame)
  let windows = windowList()
  func route(_ name: String, _ how: String, _ found: [Int]?, _ error: String? = nil) -> [String: Any] {
    var out: [String: Any] = ["route": name, "how": how, "read": found != nil]
    if let found {
      out["pids"] = found
      out["matchesActual"] = reference.map { found.contains($0) } as Any? ?? NSNull()
      out["matchesSelected"] = selectedPid.map { found.contains($0) } as Any? ?? NSNull()
    } else {
      out["error"] = error ?? "unread"
    }
    return out
  }
  /// The pid of an element an attribute names: [] when the attribute holds none, nil (with why) when it failed.
  func elementPid(_ read: (status: AXError, value: CFTypeRef?)?) -> ([Int]?, String?) {
    guard let read else { return (nil, "no focused element") }
    guard read.status == .success else { return answered(read.status) ? ([], nil) : (nil, "AX error \(read.status.rawValue)") }
    guard let e = element(read.value), let pid = publicPid(e) else { return (nil, "AXUIElementGetPid failed") }
    return ([Int(pid)], nil)
  }
  var routes: [[String: Any]] = []
  let noFrame = panelFrame == nil ? "the panel's frame was not read" : nil, noList = windows == nil ? "the window list was unread" : nil
  let atFrame = panelFrame.flatMap { f in windows.map { Array(Set($0.filter { near($0.bounds, f) }.map { $0.pid })).sorted() } }
  routes.append(route("windowListAtPanelFrame", "kCGWindowOwnerPID of each on-screen window whose bounds are the panel's AX frame (within 2 pt)", atFrame, noFrame ?? noList))
  let top = panelFrame.flatMap { f in windows.map { $0.first { $0.layer == 0 && $0.bounds.contains(CGPoint(x: f.midX, y: f.midY)) }.map { [$0.pid] } ?? [] } }
  routes.append(route("windowListTopAtPanelCenter", "kCGWindowOwnerPID of the frontmost layer-0 window under the panel's centre", top, noFrame ?? noList))
  routes.append(route("frontmostWindowOwner", "kCGWindowOwnerPID of the frontmost layer-0 on-screen window", windows.map { $0.first { $0.layer == 0 }.map { [$0.pid] } ?? [] }, noList))
  routes.append(route("runningApplicationsPanelService", "NSRunningApplication.runningApplications(withBundleIdentifier: \(panelService))", services.map { Int($0) }.sorted()))
  let axWindowPid = elementPid(axWindowRead)
  routes.append(route("axWindowPid", "AXUIElementGetPid of the focused element's AXWindow", axWindowPid.0, axWindowPid.1))
  let focusedWindowPid = elementPid(copy(app, kAXFocusedWindowAttribute))
  routes.append(route("appFocusedWindowPid", "AXUIElementGetPid of the app's AXFocusedWindow", focusedWindowPid.0, focusedWindowPid.1))
  let systemWide = AXUIElementCreateSystemWide()
  AXUIElementSetMessagingTimeout(systemWide, 1.0)
  let wideElement = elementPid(copy(systemWide, kAXFocusedUIElementAttribute)), wideApp = elementPid(copy(systemWide, kAXFocusedApplicationAttribute))
  routes.append(route("systemWideFocusedElementPid", "AXUIElementGetPid of the system-wide AXFocusedUIElement", wideElement.0, wideElement.1))
  routes.append(route("systemWideFocusedApplicationPid", "AXUIElementGetPid of the system-wide AXFocusedApplication", wideApp.0, wideApp.1))
  routes.append(route("frontmostApplication", "NSWorkspace.shared.frontmostApplication", NSWorkspace.shared.frontmostApplication.map { [Int($0.processIdentifier)] } ?? []))

  emit(["trusted": true, "pid": Int(appPid), "actualPidAvailable": actualPidFunction != nil,
        "focused": ["status": Int(focusedRead.status.rawValue), "found": focused != nil],
        "chain": chain, "processes": processes, "actualPid": focusedActual, "cuaKeyboardTarget": Int(cuaTarget), "cuaPublicPidTarget": Int(publicTarget),
        "selectedAncestor": actualPidFunction == nil ? "unavailable" : (selected as Any? ?? NSNull()),
        "staticReadingTarget": actualPidFunction == nil ? "unavailable" : (selectedPid ?? Int(appPid)),
        "panel": ["up": panel != nil, "frame": rectWire(panel.flatMap(frame))], "routes": routes])
}

func cancel() {
  let state = panelState(knownFrame)
  guard let window = state.window else {
    emit(["trusted": true, "found": false, "via": NSNull(), "pressed": NSNull(), "closed": state.up == false, "unread": state.unread])
    return
  }
  var via: String? = nil, pressed: AXError? = nil
  if let button = element(copy(window, kAXCancelButtonAttribute).value) {
    (via, pressed) = ("cancelButton", AXUIElementPerformAction(button, kAXPressAction as CFString))
  } else {
    var queue = [window], seen = 0
    while !queue.isEmpty && seen < 5000 && via == nil {
      let e = queue.removeFirst()
      seen += 1
      if string(e, kAXRoleAttribute) == (kAXButtonRole as String), ["Cancel", "취소"].contains(string(e, kAXTitleAttribute) ?? "") {
        (via, pressed) = ("button", AXUIElementPerformAction(e, kAXPressAction as CFString))
        break
      }
      queue.append(contentsOf: (copy(e, kAXChildrenAttribute).value as? [AXUIElement]) ?? [])
    }
    if via == nil { (via, pressed) = ("action", AXUIElementPerformAction(window, kAXCancelAction as CFString)) }
  }
  var after = panelState(knownFrame)
  for _ in 0..<25 where after.up != false {
    usleep(200_000)
    after = panelState(knownFrame)
  }
  emit(["trusted": true, "found": true, "via": via ?? NSNull(), "pressed": pressed.map { Int($0.rawValue) } ?? NSNull(), "closed": after.up == false, "unread": after.unread])
}

switch args[1] {
case "read": read()
case "panel":
  let state = panelState(knownFrame)
  emit(["trusted": true, "up": optional(state.up), "ax": optional(state.ax), "windowAtFrame": optional(state.windowAtFrame), "frame": rectWire(state.frame), "unread": state.unread])
default: cancel()
}
