// Scratch-engine experiment only. No value reads; no activate/raise/foreground-assist calls.
import AppKit
import ApplicationServices
import Foundation

func probe360Fields(_ event: CGEvent, target: pid_t, phase: String) -> [String: Any] {
  ["phase": phase, "at": Date().timeIntervalSince1970 * 1000,
   "type": event.type.rawValue, "flags": String(event.flags.rawValue), "flagsHex": String(event.flags.rawValue, radix: 16),
   "keycode": event.getIntegerValueField(.keyboardEventKeycode),
   "window51": event.getIntegerValueField(eventField(51)), "window91": event.getIntegerValueField(eventField(91)),
   "window92": event.getIntegerValueField(eventField(92)), "nsWindowNumber": NSEvent(cgEvent: event)?.windowNumber ?? -1,
   "targetPidField": event.getIntegerValueField(.eventTargetUnixProcessID), "postToPid": target,
   "sourceStateField": event.getIntegerValueField(.eventSourceStateID),
   "sourcePidField": event.getIntegerValueField(.eventSourceUnixProcessID)]
}

func probe360Event(_ spec: KeyEvent, variant: String, poster: EventPoster, window: CGWindowID?) -> CGEvent? {
  let event: CGEvent
  if variant == "nsevent-window", (spec.kind == .down || spec.kind == .up), let window {
    guard let made = NSEvent.keyEvent(with: spec.kind == .down ? .keyDown : .keyUp, location: .zero,
      modifierFlags: NSEvent.ModifierFlags(rawValue: UInt(spec.flags.rawValue)), timestamp: 0,
      windowNumber: Int(window), context: nil, characters: "\u{F702}", charactersIgnoringModifiers: "\u{F702}",
      isARepeat: false, keyCode: spec.keyCode)?.cgEvent else { return nil }
    event = made
  } else {
    guard let made = poster.event(spec) else { return nil }; event = made
  }
  if spec.kind == .down || spec.kind == .up {
    if variant == "numpad" || variant == "arrow-flags" { event.flags.insert(.maskNumericPad) }
    if variant == "function" || variant == "arrow-flags" { event.flags.insert(.maskSecondaryFn) }
  }
  if variant == "window", let window {
    for field in [51, 91, 92] as [UInt32] { event.setIntegerValueField(eventField(field), value: Int64(window)) }
  }
  return event
}

func probe360Press(_ args: [String: Any], application: AXUIElement, presses: [KeyPress], pid: pid_t,
                   target: pid_t, guarding: InterventionGuard, meta: inout InputMeta) throws -> Any {
  let variants = ["baseline", "window", "nsevent-window", "numpad", "function", "arrow-flags", "private-source", "combined-source", "equivalent-prelude", "ax-range"]
  guard let variant = args["probe360Variant"] as? String, variants.contains(variant) else {
    throw EngineError.invalidArguments("unknown probe360 variant")
  }
  if variant == "baseline", args["probe360Trace"] as? Bool == false {
    // Reader-free control uses the original fast four-event poster, without per-event snapshots/JSON.
    let poster = EventPoster.toProcess(target)
    meta.inputRoute = .plainPost
    try keyPresses(presses, checkIntervention: guarding.checkInFlight, post: { poster.post($0) }, meta: &meta)
    return ["meta": meta.wire, "probe360": ["variant": variant, "untraced": true, "posted": [[String: Any]]()]]
  }
  let window = elementAttribute(application, kAXFocusedWindowAttribute) ?? primaryWindow(of: application)
  let number = window.flatMap { windowNumber(of: $0, pid: pid, frame: frame(of: $0)) }
  var posted: [[String: Any]] = [], failedConstruction = 0
  var releaseEvent: CGEvent?
  // Every post names its recipient. Keys go to the keyboard target; the prelude goes to the app pid, as production's
  // FakeActivation does. The two pids are not assumed equal, and each row records the postToPid actually used.
  func post(_ event: CGEvent, _ phase: String, to recipient: pid_t) {
    event.timestamp = DispatchTime.now().uptimeNanoseconds
    var row = probe360Fields(event, target: recipient, phase: phase)
    gatedPost(event, recipient)
    row["afterPost"] = probe360Fields(event, target: recipient, phase: phase)
    posted.append(row)
    if let data = try? JSONSerialization.data(withJSONObject: ["probe360Event": row, "id": args["probe360Id"] as? String ?? ""], options: [.sortedKeys]) {
      FileHandle.standardError.write(data + Data([10]))
    }
  }
  defer { if let event = releaseEvent { post(event, "synthetic-app-inactive-on-error", to: pid) } }
  let source: CGEventSourceStateID = variant == "private-source" ? .privateState : variant == "combined-source" ? .combinedSessionState : .hidSystemState
  let poster = EventPoster.toProcess(target, sourceState: source)
  meta.inputRoute = .plainPost
  var probe: [String: Any] = ["variant": variant, "appPid": pid, "targetPid": target,
    "windowID": number as Any? ?? NSNull(), "requestedSourceState": source.rawValue,
    "routing": "plain post; no production focus hold", "foregroundActivationRequested": false, "raiseRequested": false]
  if variant == "ax-range" {
    meta.inputRoute = .action
    guard let f = elementAttribute(application, kAXFocusedUIElementAttribute),
          let role = attribute(f, kAXRoleAttribute) as? String, ["AXTextArea", "AXTextField"].contains(role),
          (attribute(f, kAXSubroleAttribute) as? String) != "AXSecureTextField",
          let range = args["probe360Range"] as? [Int], range.count == 2, range.allSatisfy({ $0 >= 0 }) else {
      throw EngineError.invalidArguments("probe AX range requires a non-secure text field and a fixture range")
    }
    var code = AXError.failure
    _ = meta.posting { code = gatedWrite(f, kAXSelectedTextRangeAttribute, axRangeValue(CFRange(location: range[0], length: range[1]))); return true }
    probe["axWriteError"] = code.rawValue
    probe["rangeRequested"] = range
    probe["notAKeyEvent"] = true
  } else {
    if ["window", "nsevent-window"].contains(variant), number == nil { throw EngineError.invalidArguments("probe target has no window number") }
    if ["window", "nsevent-window"].contains(variant) { probe["windowNumberRequested"] = number }
    if variant == "window" { probe["windowFieldsRequested"] = [51, 91, 92] }
    if variant == "nsevent-window" { probe["construction"] = "NSEvent with U+F702 characters, requested window; compound construction/source comparison, not a one-field intervention" }
    if variant == "equivalent-prelude" {
      // The route-3 core only: subtype 1 plus the window-stamped inert click which consumes AppKit's arm.
      // Never use FakeActivation's foreground/order repairs: even raising the cover is forbidden in this experiment.
      guard let w = window, let number, let rect = frame(of: w) else {
        throw EngineError.invalidArguments("probe equivalent prelude needs a window and frame")
      }
      func applicationEvent(_ subtype: Int16) -> CGEvent? {
        NSEvent.otherEvent(with: .appKitDefined, location: .zero, modifierFlags: NSEvent.ModifierFlags(rawValue: 0xC0000),
          timestamp: 0, windowNumber: Int(number), context: nil, subtype: subtype, data1: 0, data2: 0)?.cgEvent
      }
      guard let activate = applicationEvent(1), let deactivate = applicationEvent(2) else {
        throw EngineError.invalidArguments("probe cannot construct equivalent prelude")
      }
      let point = CGPoint(x: rect.minX - 8, y: rect.minY - 8)
      let inert = clickEvents(ClickTarget(point: point, windowFrame: rect, windowID: number, pid: pid), button: .left, count: 1, flags: [])
      guard inert.count == 2 else { throw EngineError.invalidArguments("probe cannot construct inert prelude click") }
      post(activate, "synthetic-app-active", to: pid)
      for e in inert { post(e, "inert-outside-click", to: pid) }
      probe["routing"] = "route-3 core prelude, no held registry or repairs; same key modifiers unchanged"
      probe["syntheticAppFocus"] = true
      // Prelude and key events are separate FIFOs when the app pid and keyboard target differ. The core prelude is
      // action-scoped, not a production held activation.
      releaseEvent = deactivate
    }
    try keyPresses(presses, checkIntervention: guarding.checkInFlight, post: { spec in
      guard let event = probe360Event(spec, variant: variant, poster: poster, window: number) else { failedConstruction += 1; return false }
      post(event, "key", to: target)
      return true
    }, meta: &meta)
    if let event = releaseEvent { post(event, "synthetic-app-inactive", to: pid); releaseEvent = nil }
  }
  probe["posted"] = posted
  probe["failedConstruction"] = failedConstruction
  return ["meta": meta.wire, "probe360": probe]
}
