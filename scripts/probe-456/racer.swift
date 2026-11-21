// #456's racer: a second process beside the engine that posts ⌘L and a few characters straight to Chrome's process at a
// wall-clock time, and watches the on-screen window list meanwhile for the app's window over a point (the omnibox popup).
// A line server on stdin, one JSON answer per line on stdout; probe-456's race.mjs runs it as a child of the job shell,
// which holds the runner image's Accessibility grant. It posts only the keys it is asked for, to the pid it is given.
//   {"op":"race","pid","target":n,"point":[x,y],"until":wallMs,"keysAt":wallMs|null,"text":"probe","gapMs":5,"axAtSeen":true}
//     from the request until `until`: the window list read every ~2 ms; for each window of `pid` other than `target`
//     whose bounds hold the point, the first time it was listed and the first time it was listed with alpha above 0
//     (wall ms, number, layer, bounds); with `keysAt`, at that time ⌘L (flags, down, up, flags) then each character of
//     `text` as a unicode key down and up, `gapMs` after the chord; with `axAtSeen`, one application hit-test at the
//     point as the popup is first seen visible, and whether its window is the target's frame; with `asPid`, every key
//     event's source pid (field 41) stamped with that pid.
import AppKit
import ApplicationServices
import Foundation

setvbuf(stdout, nil, _IOFBF, 1 << 20)
func wallMs() -> Double { Date().timeIntervalSince1970 * 1000 }
func emit(_ object: Any) {
  print(String(data: try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]), encoding: .utf8)!)
  fflush(stdout)
}
func r1(_ v: Double) -> Double { (v * 10).rounded() / 10 }
func wire(_ r: CGRect) -> [Double] { [r1(r.origin.x), r1(r.origin.y), r1(r.width), r1(r.height)] }
func sleepUntil(_ t: Double) { while true { let left = t - wallMs(); if left <= 0 { return }; usleep(UInt32(min(left, 2) * 1000)) } }
func attr(_ e: AXUIElement, _ name: String) -> CFTypeRef? {
  var v: CFTypeRef?
  return AXUIElementCopyAttributeValue(e, name as CFString, &v) == .success ? v : nil
}
func frameOf(_ e: AXUIElement) -> CGRect? {
  guard let p = attr(e, kAXPositionAttribute), let s = attr(e, kAXSizeAttribute),
        CFGetTypeID(p) == AXValueGetTypeID(), CFGetTypeID(s) == AXValueGetTypeID() else { return nil }
  var pt = CGPoint.zero, sz = CGSize.zero
  AXValueGetValue(p as! AXValue, .cgPoint, &pt); AXValueGetValue(s as! AXValue, .cgSize, &sz)
  return CGRect(origin: pt, size: sz)
}
func windowFrameOf(_ hit: AXUIElement) -> (role: String?, frame: CGRect?) {
  var e: AXUIElement? = hit
  for _ in 0..<40 {
    guard let cur = e else { break }
    if (attr(cur, kAXRoleAttribute) as? String) == "AXWindow" { return ("AXWindow", frameOf(cur)) }
    guard let p = attr(cur, kAXParentAttribute), CFGetTypeID(p) == AXUIElementGetTypeID() else { break }
    e = (p as! AXUIElement)
  }
  return (nil, nil)
}

let source = CGEventSource(stateID: .hidSystemState)
/// The source pid an event carries (field 41), stamped when the kit asks: the engine's intervention tap excludes its own
/// events by it, so keys stamped with the engine's pid stand for the app's own doing rather than a person's (#456: a
/// popup the app opens itself during the wait; unstamped keys are a user's, refused userIntervened).
var stampPid: pid_t? = nil
func post(_ e: CGEvent?, _ pid: pid_t) {
  guard let e else { return }
  if let stampPid { e.setIntegerValueField(.eventSourceUnixProcessID, value: Int64(stampPid)) }
  e.timestamp = DispatchTime.now().uptimeNanoseconds; e.postToPid(pid)
}
func flags(_ f: CGEventFlags, key: CGKeyCode, _ pid: pid_t) {
  let e = CGEvent(source: source); e?.type = .flagsChanged; e?.flags = f
  e?.setIntegerValueField(.keyboardEventKeycode, value: Int64(key)); post(e, pid)
}
func key(_ code: CGKeyCode, down: Bool, flags f: CGEventFlags, text: String? = nil, _ pid: pid_t) {
  let e = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: down); e?.flags = f
  if let text { let u = Array(text.utf16); e?.keyboardSetUnicodeString(stringLength: u.count, unicodeString: u) }
  post(e, pid)
}
func postKeys(_ pid: pid_t, text: String, gapMs: Double) -> [Double] {
  let start = wallMs()
  flags(.maskCommand, key: 55, pid)
  key(37, down: true, flags: .maskCommand, pid)   // L
  key(37, down: false, flags: .maskCommand, pid)
  flags([], key: 55, pid)
  if gapMs > 0 { usleep(UInt32(gapMs * 1000)) }
  for ch in text { key(0, down: true, flags: [], text: String(ch), pid); key(0, down: false, flags: [], text: String(ch), pid) }
  return [r1(start), r1(wallMs())]
}

func race(_ q: [String: Any]) -> [String: Any] {
  guard let pid = (q["pid"] as? NSNumber)?.int32Value, let target = (q["target"] as? NSNumber)?.intValue,
        let pt = q["point"] as? [Double], pt.count == 2, let until = (q["until"] as? NSNumber)?.doubleValue else { return ["error": "args"] }
  let point = CGPoint(x: pt[0], y: pt[1])
  let keysAt = (q["keysAt"] as? NSNumber)?.doubleValue
  let text = q["text"] as? String ?? "probe"
  let gapMs = (q["gapMs"] as? NSNumber)?.doubleValue ?? 5
  let axAtSeen = (q["axAtSeen"] as? Bool) ?? true
  stampPid = (q["asPid"] as? NSNumber)?.int32Value
  var out: [String: Any] = ["startedAt": r1(wallMs())]
  var keysDone = keysAt == nil
  var listed: [Int: [String: Any]] = [:], visible: [Int: [String: Any]] = [:]
  var firstListed: [String: Any]? = nil, firstVisible: [String: Any]? = nil, gone: Double? = nil
  var samples = 0, maxGap = 0.0, last = wallMs()
  var targetFrame: CGRect? = nil
  while true {
    let now = wallMs()
    if !keysDone, let keysAt, now >= keysAt - 0.5 {
      sleepUntil(keysAt)
      out["keys"] = postKeys(pid, text: text, gapMs: gapMs)
      keysDone = true
      continue
    }
    if now >= until && keysDone { break }
    let list = (CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]) ?? []
    let at = wallMs()
    samples += 1; maxGap = max(maxGap, at - last); last = at
    var seenVisible = false
    for w in list {
      guard ((w[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value ?? 0) == pid else { continue }
      let n = (w[kCGWindowNumber as String] as? NSNumber)?.intValue ?? 0
      var b = CGRect.zero
      if let d = w[kCGWindowBounds as String] as? NSDictionary { CGRectMakeWithDictionaryRepresentation(d, &b) }
      if n == target { targetFrame = b; continue }
      guard b.contains(point) else { continue }
      let alpha = (w[kCGWindowAlpha as String] as? NSNumber)?.doubleValue ?? 1
      let layer = (w[kCGWindowLayer as String] as? NSNumber)?.intValue ?? 0
      let rec: [String: Any] = ["t": r1(at), "n": n, "layer": layer, "bounds": wire(b), "alpha": alpha]
      if listed[n] == nil { listed[n] = rec; if firstListed == nil { firstListed = rec } }
      if alpha > 0 {
        seenVisible = true
        if visible[n] == nil {
          visible[n] = rec
          if firstVisible == nil {
            firstVisible = rec
            if axAtSeen {
              let app = AXUIElementCreateApplication(pid)
              AXUIElementSetMessagingTimeout(app, 0.5)
              var hit: AXUIElement?
              let t0 = wallMs()
              let ok = AXUIElementCopyElementAtPosition(app, Float(point.x), Float(point.y), &hit) == .success
              var ax: [String: Any] = ["t0": r1(t0), "ms": r1(wallMs() - t0), "ok": ok]
              if ok, let hit {
                let wf = windowFrameOf(hit)
                ax["role"] = attr(hit, kAXRoleAttribute) as? String ?? NSNull()
                ax["windowFrame"] = wf.frame.map(wire) ?? NSNull()
                if let tf = targetFrame, let f = wf.frame { ax["inTarget"] = abs(tf.minX - f.minX) <= 3 && abs(tf.minY - f.minY) <= 3 && abs(tf.width - f.width) <= 3 }
              }
              out["axAtSeen"] = ax
            }
          }
        }
      }
    }
    if firstVisible != nil, !seenVisible, gone == nil { gone = at }
    usleep(1500)
  }
  out["firstListed"] = firstListed ?? NSNull()
  out["firstVisible"] = firstVisible ?? NSNull()
  out["windows"] = Array(listed.values)
  out["goneAt"] = gone.map(r1) ?? NSNull()
  out["samples"] = samples
  out["maxGapMs"] = r1(maxGap)
  out["endedAt"] = r1(wallMs())
  return out
}

while let line = readLine() {
  guard let data = line.data(using: .utf8), let q = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { emit(["error": "bad request"]); continue }
  switch q["op"] as? String {
  case "race": emit(race(q))
  case "ping": emit(["ok": true, "trusted": AXIsProcessTrusted()])
  default: emit(["error": "unknown op"])
  }
}
