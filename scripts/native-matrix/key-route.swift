// The key-route diagnostic's Accessibility side (ruling 1198; #117 M5): where a key sent to TextEdit can land while its
// Open panel (drawn by com.apple.appkit.xpc.openAndSavePanelService) is focused, read on the device outside either engine.
// Run as a binary compiled into the run directory (./key-route-device.mjs):
//   key-route read <pid>
//       For the app's AXFocusedUIElement and each AXParent up to the application (at most 64): its role,
//       AXUIElementGetPid and the private _AXUIElementGetActualPid (dlsym; "unavailable" when the symbol is not found),
//       and for every pid met its NSRunningApplication's bundle id, activationPolicy and isFinishedLaunching. Then the pid
//       cua's engine posts keys to (native/engine/Sources/Engine/Input.swift:1014 keyboardTarget, with :1196 ownerPid,
//       mirrored here, never imported: the engine is not changed), the pid the static reading of the vendor's binary
//       predicts (the first ancestor whose actual pid is not the app's and whose owner's activation policy is
//       prohibited, else the app), and every public route that could name the panel's process, each with whether it
//       matches the focused element's actual pid (the routes read the panel's frame from the focused element's AXWindow).
//       `panel`: the open-panel window found by its AXIdentifier and its frame, the one `panel` and `cancel` are given.
//       -> {"trusted", "pid", "actualPidAvailable", "focused", "chain", "processes", "actualPid", "cuaKeyboardTarget",
//       "staticReadingTarget", "panel", "routes"}
//   key-route panel <pid> [<x,y,w,h>]
//       Whether the app shows its Open panel: a window of the app's (AXFocusedWindow or AXWindows) whose AXIdentifier is
//       open-panel, as the matrix's cells tell it, or, given the panel's frame as `read` found it, an AX window of the
//       app's or an on-screen window (of any owner: macOS 27 lists the panel under the app's pid) at that frame (within
//       2 pt). -> {"trusted", "up", "ax", "windowAtFrame", "frame"}
//   key-route cancel <pid> [<x,y,w,h>]
//       That panel cancelled by Accessibility: its AXCancelButton pressed; else the first AXButton titled Cancel (or 취소)
//       under it (breadth first, at most 5000 elements); else the window's AXCancel action. No pointer event, never an
//       engine. Then awaited gone (by `panel`'s reading), up to 5 s. -> {"trusted", "found", "via", "pressed", "closed"}
// Numbers, roles, bundle ids and booleans only: a title is compared inside, never printed. `cancel` writes to another
// app's window, so it refuses off a GitHub-hosted runner (exit 3) before any Accessibility call. It never asks for a
// grant: an untrusted process answers {"trusted": false} and reads nothing.
import AppKit
import ApplicationServices
import Foundation

func emit(_ object: [String: Any]) {
  let data = try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
  FileHandle.standardOutput.write(data + Data("\n".utf8))
}
let args = CommandLine.arguments
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
if args[1] == "cancel" && ProcessInfo.processInfo.environment["RUNNER_ENVIRONMENT"] != "github-hosted" {
  FileHandle.standardError.write(Data("key-route cancel: refused: it runs only on a GitHub-hosted runner (RUNNER_ENVIRONMENT=github-hosted), never on a Mac of the owner's\n".utf8))
  exit(3)
}
guard AXIsProcessTrusted() else { emit(["trusted": false]); exit(0) }

let panelService = "com.apple.appkit.xpc.openAndSavePanelService"
let app = AXUIElementCreateApplication(appPid)
AXUIElementSetMessagingTimeout(app, 1.0)

func copy(_ e: AXUIElement, _ attribute: String) -> (status: AXError, value: CFTypeRef?) {
  var value: CFTypeRef?
  let status = AXUIElementCopyAttributeValue(e, attribute as CFString, &value)
  return (status, status == .success ? value : nil)
}
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
func frame(_ e: AXUIElement) -> CGRect? {
  var origin = CGPoint.zero, size = CGSize.zero
  guard let p = copy(e, kAXPositionAttribute).value, CFGetTypeID(p) == AXValueGetTypeID(), AXValueGetValue(p as! AXValue, .cgPoint, &origin),
        let s = copy(e, kAXSizeAttribute).value, CFGetTypeID(s) == AXValueGetTypeID(), AXValueGetValue(s as! AXValue, .cgSize, &size) else { return nil }
  return CGRect(origin: origin, size: size)
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

/// The open-panel window of the app: its AXFocusedWindow when that is the panel, else one of its AXWindows; failing the
/// identifier, given the panel's known frame, the app's AX window at it.
func panelWindow(_ frameHint: CGRect? = nil) -> AXUIElement? {
  let candidates = [element(copy(app, kAXFocusedWindowAttribute).value)].compactMap { $0 }
    + ((copy(app, kAXWindowsAttribute).value as? [AXUIElement]) ?? [])
  if let byId = candidates.first(where: { string($0, kAXIdentifierAttribute) == "open-panel" }) { return byId }
  guard let frameHint else { return nil }
  return candidates.first { frame($0).map { near($0, frameHint) } ?? false }
}
/// The panel's state: up by Accessibility, or by an on-screen window at its known frame.
func panelState(_ frameHint: CGRect?) -> (up: Bool, ax: Bool, windowAtFrame: Bool?, frame: CGRect?) {
  let window = panelWindow(frameHint)
  let atFrame = frameHint.map { f in windowList().contains { near($0.bounds, f) } }
  return (window != nil || atFrame == true, window != nil, atFrame, window.flatMap(frame))
}

/// The on-screen window list, front to back: owner pid, layer and bounds only.
func windowList() -> [(pid: Int, layer: Int, bounds: CGRect)] {
  let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
  return list.compactMap { entry in
    guard let pid = entry[kCGWindowOwnerPID as String] as? Int, let b = entry[kCGWindowBounds as String] as? NSDictionary,
          let bounds = CGRect(dictionaryRepresentation: b as CFDictionary), bounds.width > 1, bounds.height > 1 else { return nil }
    return (pid, entry[kCGWindowLayer as String] as? Int ?? 0, bounds)
  }
}
func near(_ a: CGRect, _ b: CGRect) -> Bool {
  abs(a.minX - b.minX) <= 2 && abs(a.minY - b.minY) <= 2 && abs(a.width - b.width) <= 2 && abs(a.height - b.height) <= 2
}

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

  // cua's engine, mirrored (Input.swift:1014 keyboardTarget, :1196 ownerPid): the application's focused element's
  // AXUIElementGetPid when positive, else the app's pid. AXUIElementGetPid leaves 0 when it fails.
  let cuaTarget: pid_t = {
    guard let focused else { return appPid }
    var owner: pid_t = 0
    AXUIElementGetPid(focused, &owner)
    return owner > 0 ? owner : appPid
  }()
  // The static reading's rule for the vendor's helper: walking the chain, the first element whose actual pid differs
  // from the app's and whose owner's activation policy is prohibited; else the app.
  let staticTarget: Any = {
    guard actualPidFunction != nil else { return "unavailable" }
    for row in chain {
      guard let a = row["actualPid"] as? Int, a != Int(appPid), NSRunningApplication(processIdentifier: pid_t(a))?.activationPolicy == .prohibited else { continue }
      return a
    }
    return Int(appPid)
  }()

  // The panel's frame: the focused element's AXWindow, else the app's open-panel window.
  let axWindow = focused.flatMap { element(copy($0, kAXWindowAttribute).value) }
  let panel = panelWindow()
  let panelFrame = (axWindow.flatMap(frame)) ?? panel.flatMap(frame)
  let windows = windowList()
  func route(_ name: String, _ found: [Int], _ how: String) -> [String: Any] {
    ["route": name, "pids": found, "how": how, "matchesActual": reference.map { found.contains($0) } as Any? ?? NSNull()]
  }
  var routes: [[String: Any]] = []
  let atFrame = panelFrame.map { f in windows.filter { near($0.bounds, f) }.map { $0.pid } } ?? []
  routes.append(route("windowListAtPanelFrame", Array(Set(atFrame)).sorted(), "kCGWindowOwnerPID of each on-screen window whose bounds are the panel's AX frame (within 2 pt)"))
  let center = panelFrame.map { CGPoint(x: $0.midX, y: $0.midY) }
  let top = center.flatMap { c in windows.first { $0.layer == 0 && $0.bounds.contains(c) } }
  routes.append(route("windowListTopAtPanelCenter", top.map { [$0.pid] } ?? [], "kCGWindowOwnerPID of the frontmost layer-0 window under the panel's centre"))
  routes.append(route("frontmostWindowOwner", windows.first { $0.layer == 0 }.map { [$0.pid] } ?? [], "kCGWindowOwnerPID of the frontmost layer-0 on-screen window"))
  routes.append(route("runningApplicationsPanelService", services.map { Int($0) }.sorted(), "NSRunningApplication.runningApplications(withBundleIdentifier: \(panelService))"))
  routes.append(route("axWindowPid", axWindow.flatMap(publicPid).map { [Int($0)] } ?? [], "AXUIElementGetPid of the focused element's AXWindow"))
  routes.append(route("appFocusedWindowPid", element(copy(app, kAXFocusedWindowAttribute).value).flatMap(publicPid).map { [Int($0)] } ?? [], "AXUIElementGetPid of the app's AXFocusedWindow"))
  let systemWide = AXUIElementCreateSystemWide()
  AXUIElementSetMessagingTimeout(systemWide, 1.0)
  routes.append(route("systemWideFocusedElementPid", element(copy(systemWide, kAXFocusedUIElementAttribute).value).flatMap(publicPid).map { [Int($0)] } ?? [], "AXUIElementGetPid of the system-wide AXFocusedUIElement"))
  routes.append(route("systemWideFocusedApplicationPid", element(copy(systemWide, kAXFocusedApplicationAttribute).value).flatMap(publicPid).map { [Int($0)] } ?? [], "AXUIElementGetPid of the system-wide AXFocusedApplication"))
  routes.append(route("frontmostApplication", NSWorkspace.shared.frontmostApplication.map { [Int($0.processIdentifier)] } ?? [], "NSWorkspace.shared.frontmostApplication"))

  emit(["trusted": true, "pid": Int(appPid), "actualPidAvailable": actualPidFunction != nil,
        "focused": ["status": Int(focusedRead.status.rawValue), "found": focused != nil],
        "chain": chain, "processes": processes, "actualPid": focusedActual,
        "cuaKeyboardTarget": Int(cuaTarget), "staticReadingTarget": staticTarget,
        "panel": ["up": panel != nil, "frame": rectWire(panel.flatMap(frame))], "routes": routes])
}

func cancel() {
  guard let window = panelWindow(knownFrame) else {
    emit(["trusted": true, "found": false, "via": NSNull(), "pressed": NSNull(), "closed": !panelState(knownFrame).up])
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
  var closed = false
  for _ in 0..<25 where !closed {
    usleep(200_000)
    closed = !panelState(knownFrame).up
  }
  emit(["trusted": true, "found": true, "via": via ?? NSNull(), "pressed": pressed.map { Int($0.rawValue) } ?? NSNull(), "closed": closed])
}

switch args[1] {
case "read": read()
case "panel":
  let state = panelState(knownFrame)
  emit(["trusted": true, "up": state.up, "ax": state.ax, "windowAtFrame": state.windowAtFrame as Any? ?? NSNull(), "frame": rectWire(state.frame)])
default: cancel()
}
