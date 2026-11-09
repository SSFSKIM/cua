// #341's hosted probe, the AX side: one JSON line per invocation, run as a child of the job shell (which holds the
// runner image's Accessibility grant).
//   ax seq <pid> <x> <y> <spec-json>   the text field at the screen point (the hit's AXEditableAncestor, else its nearest
//       AXTextArea/AXTextField ancestor, else the hit), then the spec's ops in order, each timed in epoch ms (the page's
//       clock): pre (the field's attributes, settable names, parameterized names, actions, value length, selection,
//       focus), waitBoxes (the box of the probe character, `expect`, polled every 20 ms until it has a size, up to maxMs,
//       nothing written), scan (the offset under the point from AXBoundsForRange: a linear scan from 0 as the engine's,
//       and a binary search over rows, each with its reads and ms), ref (the reference character's box: the pre scan's
//       offset, else `expect`), firstVisible (the first character whose box top is inside the field's frame, by a binary
//       search), focus (AXFocused true), select (AXSelectedTextRange {loc, 0}; loc pre|firstVisible|post|delta|<n>),
//       press (AXPress), scrollToVisible (AXScrollToVisible on the field), delta (#341's candidate 2: the reference box
//       now against the ref read, Δ; the point moved by Δ and scanned), sleep. After each write, a poll every 10 ms for
//       pollMs recording each change of AXFocused, AXSelectedTextRange, the reference box and whether the app's focused
//       element is the field.
//   ax wheel <x> <y> <dy> <steps>       the cursor warped to the point, `steps` scroll-wheel events of dy/steps pixels each
//       posted at the HID tap 30 ms apart (a user's wheel; negative dy scrolls the content down), the cursor parked at
//       (200, 700).
import AppKit
import ApplicationServices
import Foundation

setvbuf(stdout, nil, _IOLBF, 0)
func nowMs() -> Double { (Date().timeIntervalSince1970 * 1000 * 10).rounded() / 10 }
func emit(_ object: Any) {
  print(String(data: try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]), encoding: .utf8)!)
}
func copy(_ e: AXUIElement, _ name: String) -> (CFTypeRef?, Int32) {
  var v: CFTypeRef?
  let r = AXUIElementCopyAttributeValue(e, name as CFString, &v)
  return (r == .success ? v : nil, r.rawValue)
}
func attr(_ e: AXUIElement, _ name: String) -> CFTypeRef? { copy(e, name).0 }
func str(_ e: AXUIElement, _ name: String) -> String? { attr(e, name) as? String }
func orNull(_ s: Any?) -> Any { s ?? NSNull() }
func element(_ ref: CFTypeRef?) -> AXUIElement? {
  guard let ref, CFGetTypeID(ref) == AXUIElementGetTypeID() else { return nil }
  return (ref as! AXUIElement)
}
func param(_ e: AXUIElement, _ name: String, _ p: CFTypeRef) -> (CFTypeRef?, Int32) {
  var v: CFTypeRef?
  let r = AXUIElementCopyParameterizedAttributeValue(e, name as CFString, p, &v)
  return (r == .success ? v : nil, r.rawValue)
}
func names(_ e: AXUIElement) -> [String] { var n: CFArray?; return AXUIElementCopyAttributeNames(e, &n) == .success ? (n as? [String] ?? []) : [] }
func pnames(_ e: AXUIElement) -> [String] { var n: CFArray?; return AXUIElementCopyParameterizedAttributeNames(e, &n) == .success ? (n as? [String] ?? []) : [] }
func actions(_ e: AXUIElement) -> [String]? { var n: CFArray?; return AXUIElementCopyActionNames(e, &n) == .success ? (n as? [String] ?? []) : nil }
func isSettable(_ e: AXUIElement, _ name: String) -> Bool { var b: DarwinBoolean = false; return AXUIElementIsAttributeSettable(e, name as CFString, &b) == .success && b.boolValue }
func rangeValue(_ loc: Int, _ len: Int) -> AXValue { var r = CFRange(location: loc, length: len); return AXValueCreate(.cfRange, &r)! }
func rect(_ ref: CFTypeRef?) -> CGRect? {
  guard let ref, CFGetTypeID(ref) == AXValueGetTypeID() else { return nil }
  var r = CGRect.zero
  return AXValueGetValue(ref as! AXValue, .cgRect, &r) ? r : nil
}
func cfRange(_ ref: CFTypeRef?) -> CFRange? {
  guard let ref, CFGetTypeID(ref) == AXValueGetTypeID() else { return nil }
  var r = CFRange()
  return AXValueGetValue(ref as! AXValue, .cfRange, &r) ? r : nil
}
func point(_ ref: CFTypeRef?) -> CGPoint? {
  guard let ref, CFGetTypeID(ref) == AXValueGetTypeID() else { return nil }
  var p = CGPoint.zero
  return AXValueGetValue(ref as! AXValue, .cgPoint, &p) ? p : nil
}
func size(_ ref: CFTypeRef?) -> CGSize? {
  guard let ref, CFGetTypeID(ref) == AXValueGetTypeID() else { return nil }
  var s = CGSize.zero
  return AXValueGetValue(ref as! AXValue, .cgSize, &s) ? s : nil
}
func boolOf(_ ref: CFTypeRef?) -> Any { guard let ref, CFGetTypeID(ref) == CFBooleanGetTypeID() else { return NSNull() }; return (ref as! NSNumber).boolValue }
func r4(_ r: CGRect?) -> Any { r.map { [($0.minX * 10).rounded() / 10, ($0.minY * 10).rounded() / 10, ($0.width * 10).rounded() / 10, ($0.height * 10).rounded() / 10] as Any } ?? NSNull() }
func rangeWire(_ r: CFRange?) -> Any { r.map { [$0.location, $0.length] as Any } ?? NSNull() }
func box(_ e: AXUIElement, _ i: Int) -> CGRect? { rect(param(e, "AXBoundsForRange", rangeValue(i, 1)).0) }
func usable(_ r: CGRect?) -> CGRect? { guard let r, r.width > 0, r.height > 0 else { return nil }; return r }

let args = CommandLine.arguments
func pointArgs(_ i: Int) -> CGPoint? {
  guard args.count > i + 1, let x = Double(args[i]), let y = Double(args[i + 1]) else { return nil }
  return CGPoint(x: x, y: y)
}

if args.count == 6, args[1] == "wheel", let p = pointArgs(2), let dy = Double(args[4]), let steps = Int(args[5]), steps > 0 {
  let t0 = nowMs()
  CGWarpMouseCursorPosition(p)
  usleep(150_000)
  var posted = 0
  let each = Int32((dy / Double(steps)).rounded())
  for _ in 0..<steps {
    if let e = CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 1, wheel1: each, wheel2: 0, wheel3: 0) {
      e.location = p
      e.post(tap: .cghidEventTap)
      posted += 1
    }
    usleep(30_000)
  }
  usleep(400_000)
  CGWarpMouseCursorPosition(CGPoint(x: 200, y: 700))
  emit(["posted": posted, "each": each, "startMs": t0, "endMs": nowMs()])
  exit(0)
}

guard args.count == 6, args[1] == "seq", let pid = pid_t(args[2]), let p = pointArgs(3),
      let spec = try? JSONSerialization.jsonObject(with: Data(args[5].utf8)) as? [String: Any] else { emit(["usage": true]); exit(2) }
let app = AXUIElementCreateApplication(pid)
AXUIElementSetMessagingTimeout(app, 3)
let expect = (spec["expect"] as? NSNumber)?.intValue
var out: [String: Any] = ["trusted": AXIsProcessTrusted(), "startMs": nowMs(), "point": [p.x, p.y]]
let hitRoles: Set<String> = ["AXTextArea", "AXTextField", "AXStaticText"]
let textRoles: Set<String> = ["AXTextArea", "AXTextField"]
// Gecko answers a coarse group for a while after a new client's first contact: the hit-test is asked again every 50 ms
// for up to 3 s until it answers a text role.
var hitRef: AXUIElement?
var hitTries = 0
let hitStart = nowMs()
repeat {
  hitTries += 1
  hitRef = nil
  out["hitError"] = AXUIElementCopyElementAtPosition(app, Float(p.x), Float(p.y), &hitRef).rawValue
  if let h = hitRef, let r = str(h, kAXRoleAttribute), hitRoles.contains(r) { break }
  usleep(50_000)
} while nowMs() - hitStart < 3000
out["hitTries"] = hitTries
out["hitMs"] = nowMs() - hitStart
guard let hit = hitRef else { emit(out); exit(0) }
func fieldOf(_ hit: AXUIElement) -> AXUIElement {
  if let e = element(attr(hit, "AXEditableAncestor")) { return e }
  var cur: AXUIElement? = hit
  for _ in 0..<12 {
    guard let c = cur else { break }
    if let r = str(c, kAXRoleAttribute), textRoles.contains(r) { return c }
    cur = element(attr(c, kAXParentAttribute))
  }
  return hit
}
let field = fieldOf(hit)
out["hit"] = ["role": orNull(str(hit, kAXRoleAttribute)), "isField": CFEqual(hit, field)]
out["field"] = ["role": orNull(str(field, kAXRoleAttribute)), "dom": orNull(str(field, "AXDOMIdentifier")),
                "description": orNull(str(field, kAXDescriptionAttribute)), "title": orNull(str(field, kAXTitleAttribute))]
func fieldFrame() -> CGRect? {
  guard let o = point(attr(field, kAXPositionAttribute)), let s = size(attr(field, kAXSizeAttribute)) else { return nil }
  return CGRect(origin: o, size: s)
}
let valueText = (str(field, kAXValueAttribute) ?? "") as NSString
let length = valueText.length

// The offset under a point: the engine's linear scan from 0 (stops at the box holding the point; a line's end when the
// point is right of it is not needed here, every point is on a character), and a binary search over rows.
func linearScan(_ q: CGPoint) -> [String: Any] {
  let t0 = nowMs()
  var calls = 0, readABox = false, found: Int?
  for i in 0..<length {
    calls += 1
    guard let r = usable(box(field, i)) else { continue }
    readABox = true
    if q.x >= r.minX && q.x < r.maxX && q.y >= r.minY && q.y < r.maxY { found = q.x < r.midX ? i : i + 1; break }
  }
  return ["found": orNull(found), "calls": calls, "ms": nowMs() - t0, "readABox": readABox]
}
func binarySearch(_ q: CGPoint) -> [String: Any] {
  let t0 = nowMs()
  var calls = 0, lo = 0, hi = length
  func b(_ i: Int) -> CGRect? { calls += 1; return usable(box(field, i)) }
  // The first character past the point in reading order (its row below the point, or on the point's row and right of it).
  func past(_ i: Int) -> Bool {
    var j = i
    while j < length, valueText.character(at: j) == 0x0A { j += 1 }  // a line break has no usable box
    guard j < length, let r = b(j) else { return false }
    return r.minY > q.y || (r.maxY > q.y && r.maxX > q.x)
  }
  while lo < hi { let mid = (lo + hi) / 2; if past(mid) { hi = mid } else { lo = mid + 1 } }
  var found: Int?
  if lo < length, let r = b(lo), q.x >= r.minX, q.x < r.maxX, q.y >= r.minY, q.y < r.maxY { found = q.x < r.midX ? lo : lo + 1 }
  return ["found": orNull(found), "calls": calls, "ms": nowMs() - t0]
}

var offsets: [String: Int] = [:]
var refBoxes: [String: CGRect] = [:]
var refIndex: Int { offsets["pre"] ?? expect ?? 0 }
var steps: [[String: Any]] = []

func snapshot() -> [String: Any] {
  let appFocus = element(attr(app, kAXFocusedUIElementAttribute))
  return ["focused": boolOf(attr(field, kAXFocusedAttribute)), "sel": rangeWire(cfRange(attr(field, kAXSelectedTextRangeAttribute))),
          "ref": r4(box(field, refIndex)), "appFocusIsField": appFocus.map { CFEqual($0, field) } ?? false]
}
func poll(_ ms: Double, from start: Double) -> [[String: Any]] {
  var rows: [[String: Any]] = [], last: NSDictionary = [:]
  let end = start + ms
  while true {
    let t = nowMs()
    let s = snapshot()
    if !NSDictionary(dictionary: s).isEqual(last) { var row = s; row["t"] = ((t - start) * 10).rounded() / 10; rows.append(row); last = NSDictionary(dictionary: s) }
    if t >= end { break }
    usleep(10_000)
  }
  return rows
}
func resolveLoc(_ v: Any?) -> Int? {
  if let n = v as? NSNumber { return n.intValue }
  if let s = v as? String { return offsets[s] }
  return nil
}

for op in spec["ops"] as? [[String: Any]] ?? [] {
  let name = op["op"] as? String ?? "?"
  let tag = op["tag"] as? String ?? name
  let pollMs = (op["pollMs"] as? NSNumber)?.doubleValue ?? 600
  var rec: [String: Any] = ["op": name, "tag": tag, "atMs": nowMs()]
  switch name {
  case "pre":
    let ns = names(field)
    rec["attributes"] = ns
    rec["settable"] = ns.filter { isSettable(field, $0) }
    rec["parameterized"] = pnames(field)
    rec["actions"] = orNull(actions(field))
    rec["length"] = length
    rec["numberOfCharacters"] = orNull((attr(field, "AXNumberOfCharacters") as? NSNumber)?.intValue)
    rec["visibleRange"] = rangeWire(cfRange(attr(field, "AXVisibleCharacterRange")))
    rec["frame"] = r4(fieldFrame())
    rec["state"] = snapshot()
    rec["expectBox"] = r4(expect.flatMap { box(field, $0) })
  case "waitBoxes":
    let maxMs = (op["maxMs"] as? NSNumber)?.doubleValue ?? 0
    let probe = expect ?? 0
    let t0 = nowMs()
    var reads = 0, first: Any = NSNull(), filled: Double?
    while true {
      reads += 1
      let b = box(field, probe)
      if reads == 1 { first = r4(b) }
      if usable(b) != nil { filled = nowMs() - t0; break }
      if nowMs() - t0 >= maxMs { break }
      usleep(20_000)
    }
    rec["probe"] = probe; rec["first"] = first; rec["filledAfterMs"] = orNull(filled); rec["reads"] = reads
    rec["firstUsable"] = reads == 1 && filled != nil
  case "scan":
    let q = CGPoint(x: (op["x"] as? NSNumber)?.doubleValue ?? p.x, y: (op["y"] as? NSNumber)?.doubleValue ?? p.y)
    let lin = linearScan(q), bin = binarySearch(q)
    rec["linear"] = lin; rec["binary"] = bin
    if let f = lin["found"] as? Int { offsets[tag] = f } else if let f = bin["found"] as? Int { offsets[tag] = f }
    rec["offset"] = orNull(offsets[tag])
  case "ref":
    let r = box(field, refIndex)
    rec["index"] = refIndex; rec["box"] = r4(r)
    if let r = usable(r) { refBoxes[tag] = r }
  case "firstVisible":
    let t0 = nowMs()
    var calls = 0, lo = 0, hi = length
    if let f = fieldFrame() {
      func atOrBelowTop(_ i: Int) -> Bool {
        var j = i
        while j < length, valueText.character(at: j) == 0x0A { j += 1 }
        guard j < length else { return true }
        calls += 1
        guard let r = usable(box(field, j)) else { return false }
        return r.minY >= f.minY - 0.5
      }
      while lo < hi { let mid = (lo + hi) / 2; if atOrBelowTop(mid) { hi = mid } else { lo = mid + 1 } }
      // A line break found first stands for the row after it.
      if lo < length, valueText.character(at: lo) == 0x0A { lo += 1 }
      offsets["firstVisible"] = lo
      rec["box"] = r4(box(field, lo))
    }
    rec["offset"] = orNull(offsets["firstVisible"]); rec["calls"] = calls; rec["ms"] = nowMs() - t0
  case "focus", "select", "press", "scrollToVisible":
    let t = nowMs()
    rec["before"] = snapshot()
    let w0 = nowMs()
    var err: AXError = .success
    switch name {
    case "focus": err = AXUIElementSetAttributeValue(field, kAXFocusedAttribute as CFString, kCFBooleanTrue)
    case "select":
      if let loc = resolveLoc(op["loc"]) { rec["loc"] = loc; err = AXUIElementSetAttributeValue(field, kAXSelectedTextRangeAttribute as CFString, rangeValue(loc, 0)) }
      else { rec["problem"] = "no loc \(op["loc"] ?? "nil")" }
    case "press": err = AXUIElementPerformAction(field, kAXPressAction as CFString)
    default: err = AXUIElementPerformAction(field, "AXScrollToVisible" as CFString)
    }
    rec["writeAtMs"] = w0; rec["error"] = err.rawValue; rec["tookMs"] = nowMs() - w0
    rec["poll"] = poll(pollMs, from: w0)
    rec["after"] = snapshot()
    _ = t
  case "delta":
    let t0 = nowMs()
    guard let r0 = refBoxes["pre"] else { rec["problem"] = "no pre ref box"; break }
    let r1 = usable(box(field, refIndex))
    rec["refNow"] = r4(r1)
    guard let r1 else { rec["problem"] = "no ref box now"; break }
    let dx = r1.minX - r0.minX, dy = r1.minY - r0.minY
    let q = CGPoint(x: p.x + dx, y: p.y + dy)
    rec["dx"] = dx; rec["dy"] = dy; rec["movedPoint"] = [q.x, q.y]
    let lin = linearScan(q), bin = binarySearch(q)
    rec["linear"] = lin; rec["binary"] = bin
    if let f = lin["found"] as? Int { offsets["delta"] = f } else if let f = bin["found"] as? Int { offsets["delta"] = f }
    rec["offset"] = orNull(offsets["delta"])
    rec["ms"] = nowMs() - t0
  case "sleep":
    usleep(UInt32(((op["ms"] as? NSNumber)?.doubleValue ?? 0) * 1000))
  case "state":
    rec["state"] = snapshot(); rec["frame"] = r4(fieldFrame())
  default:
    rec["problem"] = "unknown op"
  }
  rec["endMs"] = nowMs()
  steps.append(rec)
}
out["steps"] = steps
out["offsets"] = offsets
out["refIndex"] = refIndex
out["endMs"] = nowMs()
emit(out)
