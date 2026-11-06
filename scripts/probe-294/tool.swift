// #294 probe's side tool (scripts/probe-294/live.mjs runs it as a child of the job shell, which holds the runner image's
// Accessibility, PostEvent and Screen Recording grants). One JSON object on stdout per invocation.
//   tool tap <pid> <ms>            a CGEventTap for the pid (CGEvent.tapCreateForPid, listen-only, else a pass-through
//       default tap), every event type, for ms: each event's type, arrival, timestamp, location, flags and the fields
//       the engine stamps (1 click state, 3 button, 7 subtype, 41 source pid, 51/91/92 window numbers), and for an
//       AppKit-defined event its subtype and window number. Prints "ready" on stderr once the tap is enabled. Also the
//       clocks at start (mach_absolute_time, CLOCK_UPTIME_RAW ns, the timebase) to read the timestamps' unit.
//   tool state <pid> <userPid> <ms> <sampleMs>   samples the target's AXFrontmost (AppKit answers NSApp.isActive), its
//       AXFocusedWindow and AXMainWindow (the key and main window, as the window's title), its first window's AXMain and
//       AXFocused, and the user's app's AXFrontmost, every sampleMs for ms; each change recorded with its time.
//   tool read <pid>                a cheap AX read on the application: AXRole and its focused window's AXTitle.
//   tool hidclick <x> <y>          a real left click at the HID level at the global point (the cursor moves there), the
//       cursor put back where it was 400 ms later.
//   tool cursor                    the cursor's location.
import AppKit
import ApplicationServices
import Foundation

setvbuf(stdout, nil, _IOFBF, 1 << 20)
func nowMs() -> Double { Date().timeIntervalSince1970 * 1000 }
func emit(_ object: Any) {
  print(String(data: try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]), encoding: .utf8)!)
  fflush(stdout)
}
func r1(_ v: Double) -> Double { (v * 10).rounded() / 10 }
func prepare(_ e: AXUIElement) -> AXUIElement { AXUIElementSetMessagingTimeout(e, 1.0); return e }
func copy(_ e: AXUIElement, _ name: String) -> (CFTypeRef?, Int32) {
  var v: CFTypeRef?
  let r = AXUIElementCopyAttributeValue(e, name as CFString, &v)
  return (r == .success ? v : nil, r.rawValue)
}
func attr(_ e: AXUIElement, _ name: String) -> CFTypeRef? { copy(e, name).0 }
func element(_ ref: CFTypeRef?) -> AXUIElement? {
  guard let ref, CFGetTypeID(ref) == AXUIElementGetTypeID() else { return nil }
  return (ref as! AXUIElement)
}
func elements(_ ref: CFTypeRef?) -> [AXUIElement] {
  guard let ref, CFGetTypeID(ref) == CFArrayGetTypeID() else { return [] }
  return (ref as! [AnyObject]).compactMap { element($0 as CFTypeRef) }
}
func boolValue(_ ref: CFTypeRef?) -> Any {
  guard let ref else { return NSNull() }
  if CFGetTypeID(ref) == CFBooleanGetTypeID() { return (ref as! NSNumber).boolValue }
  if CFGetTypeID(ref) == CFNumberGetTypeID() { return (ref as! NSNumber).intValue != 0 }
  return "<other>"
}
func titleOf(_ ref: CFTypeRef?) -> Any {
  guard let e = element(ref) else { return NSNull() }
  return (attr(prepare(e), kAXTitleAttribute) as? String).map { String($0.prefix(40)) } ?? "<untitled>"
}

final class TapBox {
  var events: [[String: Any]] = []
  let t0 = nowMs()
  var tap: CFMachPort?
}

let args = CommandLine.arguments
switch args.count > 1 ? args[1] : "" {
case "tap":
  let pid = pid_t(args[2])!, ms = Double(args[3])!
  var tb = mach_timebase_info_data_t()
  mach_timebase_info(&tb)
  let box = TapBox()
  let clocks: [String: Any] = ["mach": Int64(bitPattern: mach_absolute_time()), "uptimeRawNs": Int64(bitPattern: clock_gettime_nsec_np(CLOCK_UPTIME_RAW)),
                               "timebase": [Int(tb.numer), Int(tb.denom)], "processUptimeS": ProcessInfo.processInfo.systemUptime, "wall": box.t0]
  let callback: CGEventTapCallBack = { _, type, event, refcon in
    let box = Unmanaged<TapBox>.fromOpaque(refcon!).takeUnretainedValue()
    var row: [String: Any] = ["type": Int(type.rawValue), "t": r1(nowMs() - box.t0), "ts": Int64(bitPattern: event.timestamp),
                              "machAtTap": Int64(bitPattern: mach_absolute_time()), "x": r1(event.location.x), "y": r1(event.location.y),
                              "flags": Int64(bitPattern: event.flags.rawValue)]
    if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
      row["disabled"] = true
      if let tap = box.tap { CGEvent.tapEnable(tap: tap, enable: true) }
    } else {
      for f: UInt32 in [1, 3, 7, 39, 40, 41, 51, 91, 92] {
        let field = CGEventField(rawValue: f) ?? unsafeBitCast(f, to: CGEventField.self)
        row["f\(f)"] = event.getIntegerValueField(field)
      }
      if type.rawValue == 13, let ns = NSEvent(cgEvent: event) {
        row["subtype"] = Int(ns.subtype.rawValue)
        row["windowNumber"] = ns.windowNumber
      }
      if [1, 2, 3, 4, 25, 26].contains(Int(type.rawValue)), let ns = NSEvent(cgEvent: event) {
        row["nsTimestamp"] = ns.timestamp
        row["nsWindowNumber"] = ns.windowNumber
        row["nsClickCount"] = ns.clickCount
        row["nsEventNumber"] = ns.eventNumber
      }
    }
    box.events.append(row)
    return Unmanaged.passUnretained(event)
  }
  let mask = CGEventMask.max
  let ref = Unmanaged.passUnretained(box).toOpaque()
  var mode = "listenOnly"
  var tap = CGEvent.tapCreateForPid(pid: pid, place: .headInsertEventTap, options: .listenOnly, eventsOfInterest: mask, callback: callback, userInfo: ref)
  if tap == nil {
    mode = "default"
    tap = CGEvent.tapCreateForPid(pid: pid, place: .headInsertEventTap, options: .defaultTap, eventsOfInterest: mask, callback: callback, userInfo: ref)
  }
  guard let tap else {
    FileHandle.standardError.write("ready\n".data(using: .utf8)!)
    emit(["error": "tapCreateForPid failed in both modes", "clocks": clocks]); exit(0)
  }
  box.tap = tap
  let source = CFMachPortCreateRunLoopSource(nil, tap, 0)
  CFRunLoopAddSource(CFRunLoopGetCurrent(), source, .commonModes)
  CGEvent.tapEnable(tap: tap, enable: true)
  FileHandle.standardError.write("ready\n".data(using: .utf8)!)
  CFRunLoopRunInMode(.defaultMode, ms / 1000, false)
  emit(["mode": mode, "clocks": clocks, "events": box.events, "enabledAtEnd": CGEvent.tapIsEnabled(tap: tap)])

case "state":
  let pid = pid_t(args[2])!, user = pid_t(args[3])!, ms = Double(args[4])!, sampleMs = Double(args[5])!
  let app = prepare(AXUIElementCreateApplication(pid)), userApp = prepare(AXUIElementCreateApplication(user))
  let t0 = nowMs()
  var last: [String: String] = [:]
  var changes: [[String: Any]] = []
  var samples = 0
  while nowMs() - t0 < ms {
    let s0 = nowMs()
    let win = elements(attr(app, kAXWindowsAttribute)).first.map(prepare)
    let row: [String: Any] = [
      "front": boolValue(attr(app, "AXFrontmost")), "key": titleOf(attr(app, kAXFocusedWindowAttribute)),
      "main": titleOf(attr(app, kAXMainWindowAttribute)),
      "winMain": win.map { boolValue(attr($0, kAXMainAttribute)) } ?? NSNull(),
      "winFocused": win.map { boolValue(attr($0, kAXFocusedAttribute)) } ?? NSNull(),
      "userFront": boolValue(attr(userApp, "AXFrontmost"))]
    samples += 1
    let flat = row.mapValues { "\($0)" }
    if flat != last {
      var c = row
      c["t"] = r1(s0 - t0)
      c["readMs"] = r1(nowMs() - s0)
      changes.append(c)
      last = flat
    }
    let left = sampleMs - (nowMs() - s0)
    if left > 0 { usleep(UInt32(left * 1000)) }
  }
  emit(["t0": t0, "samples": samples, "changes": changes])

case "read":
  let pid = pid_t(args[2])!
  let app = prepare(AXUIElementCreateApplication(pid))
  let t0 = nowMs()
  let role = attr(app, kAXRoleAttribute) as? String
  let title = titleOf(attr(app, kAXFocusedWindowAttribute))
  emit(["role": role ?? NSNull(), "title": title, "ms": r1(nowMs() - t0)])

case "hidclick":
  let p = CGPoint(x: Double(args[2])!, y: Double(args[3])!)
  let src = CGEventSource(stateID: .hidSystemState)
  let orig = CGEvent(source: nil)?.location ?? .zero
  let t0 = nowMs()
  CGEvent(mouseEventSource: src, mouseType: .mouseMoved, mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap)
  usleep(80_000)
  for type in [CGEventType.leftMouseDown, .leftMouseUp] {
    let e = CGEvent(mouseEventSource: src, mouseType: type, mouseCursorPosition: p, mouseButton: .left)
    e?.setIntegerValueField(.mouseEventClickState, value: 1)
    e?.post(tap: .cghidEventTap)
    if type == .leftMouseDown { usleep(60_000) }
  }
  usleep(400_000)
  CGEvent(mouseEventSource: src, mouseType: .mouseMoved, mouseCursorPosition: orig, mouseButton: .left)?.post(tap: .cghidEventTap)
  emit(["orig": ["x": orig.x, "y": orig.y], "at": ["x": p.x, "y": p.y], "ms": r1(nowMs() - t0)])

case "eui":
  // tool eui <pid> <toggle|manual>: AXEnhancedUserInterface written false then true, or AXManualAccessibility true.
  let pid = pid_t(args[2])!
  let app = prepare(AXUIElementCreateApplication(pid))
  let t0 = nowMs()
  var out: [String: Any] = ["prior": boolValue(attr(app, "AXEnhancedUserInterface"))]
  if args[3] == "manual" {
    out["manual"] = AXUIElementSetAttributeValue(app, "AXManualAccessibility" as CFString, kCFBooleanTrue).rawValue
  } else {
    out["false"] = AXUIElementSetAttributeValue(app, "AXEnhancedUserInterface" as CFString, kCFBooleanFalse).rawValue
    usleep(100_000)
    out["true"] = AXUIElementSetAttributeValue(app, "AXEnhancedUserInterface" as CFString, kCFBooleanTrue).rawValue
  }
  out["after"] = boolValue(attr(app, "AXEnhancedUserInterface"))
  out["ms"] = r1(nowMs() - t0)
  emit(out)

case "windows":
  // tool windows <pid> [ax]: the pid's on-screen CG windows (no AX), and with "ax" its AX windows too.
  let pid = pid_t(args[2])!
  let list = (CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]) ?? []
  let cg: [[String: Any]] = list.compactMap { info in
    guard (info[kCGWindowOwnerPID as String] as? Int).map(pid_t.init) == pid else { return nil }
    return ["n": info[kCGWindowNumber as String] ?? NSNull(), "layer": info[kCGWindowLayer as String] ?? NSNull(),
            "bounds": info[kCGWindowBounds as String] ?? NSNull(), "name": info[kCGWindowName as String] ?? NSNull(),
            "alpha": info[kCGWindowAlpha as String] ?? NSNull()]
  }
  var out: [String: Any] = ["cg": cg, "total": list.count]
  if args.count > 3 && args[3] == "ax" {
    let app = prepare(AXUIElementCreateApplication(pid))
    out["ax"] = elements(attr(app, kAXWindowsAttribute)).map { w -> [String: Any] in
      let w = prepare(w)
      return ["role": attr(w, kAXRoleAttribute) as? String ?? NSNull(), "subrole": attr(w, kAXSubroleAttribute) as? String ?? NSNull(),
              "title": (attr(w, kAXTitleAttribute) as? String).map { String($0.prefix(40)) } ?? NSNull(),
              "main": boolValue(attr(w, kAXMainAttribute)), "focused": boolValue(attr(w, kAXFocusedAttribute))]
    }
  }
  emit(out)

case "cursor":
  let c = CGEvent(source: nil)?.location ?? .zero
  emit(["x": c.x, "y": c.y])

default:
  emit(["error": "usage: tool tap|state|read|hidclick|cursor ..."])
}
