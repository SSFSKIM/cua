// #299 probe's side tool (scripts/probe-299/run.mjs runs it as a child of the job shell, which holds the runner image's
// Accessibility grant). A line server on stdin, one JSON answer per line on stdout. Nothing here posts input.
//   {"op":"screen"}                                    the screens' frames (top-left origin)
//   {"op":"grid","pid","window":[x,y,w,h],"step","out"} hit-tests every grid point of the window as the engine's
//       hitTest(window:pid:at:) does (asked of the application, kept only when the hit's AXWindow is the window), and
//       writes each hit's chain (role and frame, the hit up to its window) to `out`; answers the timing
//   {"op":"vwalk","pid","window","prune","cap","deadlineMs"} a geometry-only walk of the window (role, frame, children in
//       one AXUIElementCopyMultipleAttributeValues per element), into a child only when its frame meets the window
//       (prune) or always; answers its node count and time: the price of recording the screenshot's visible part
//   {"op":"descend","pid","window","points":[[x,y],...]} a point-directed descent from the window to the deepest element
//       whose frame holds each point, the price of a click-time targeted re-read; answers per point ms and reads
import AppKit
import ApplicationServices
import Foundation

setvbuf(stdout, nil, _IOFBF, 1 << 20)
func nowMs() -> Double { Double(clock_gettime_nsec_np(CLOCK_UPTIME_RAW)) / 1e6 }
func emit(_ object: Any) {
  print(String(data: try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]), encoding: .utf8)!)
  fflush(stdout)
}
func r1(_ v: Double) -> Double { (v * 10).rounded() / 10 }
func r3(_ v: Double) -> Double { (v * 1000).rounded() / 1000 }
func prepare(_ e: AXUIElement) -> AXUIElement { AXUIElementSetMessagingTimeout(e, 2.0); return e }
func asElement(_ ref: Any?) -> AXUIElement? {
  guard let ref = ref as CFTypeRef?, CFGetTypeID(ref) == AXUIElementGetTypeID() else { return nil }
  return prepare(ref as! AXUIElement)
}
func asElements(_ ref: Any?) -> [AXUIElement] {
  guard let ref = ref as CFTypeRef?, CFGetTypeID(ref) == CFArrayGetTypeID() else { return [] }
  return (ref as! [AnyObject]).compactMap { asElement($0) }
}
var reads = 0
/// One batched read; values in the order asked, nil for an error or no value.
func multi(_ e: AXUIElement, _ names: [String]) -> [Any?] {
  reads += 1
  var values: CFArray?
  guard AXUIElementCopyMultipleAttributeValues(e, names as CFArray, AXCopyMultipleAttributeOptions(rawValue: 0), &values) == .success,
        let list = values as? [AnyObject], list.count == names.count else { return Array(repeating: nil, count: names.count) }
  return list.map { v in
    if CFGetTypeID(v as CFTypeRef) == AXValueGetTypeID(), AXValueGetType(v as! AXValue) == .axError { return nil }
    return v
  }
}
func rect(_ p: Any?, _ s: Any?) -> CGRect? {
  guard let p = p as CFTypeRef?, let s = s as CFTypeRef?, CFGetTypeID(p) == AXValueGetTypeID(), CFGetTypeID(s) == AXValueGetTypeID() else { return nil }
  var pt = CGPoint.zero, sz = CGSize.zero
  guard AXValueGetValue(p as! AXValue, .cgPoint, &pt), AXValueGetValue(s as! AXValue, .cgSize, &sz) else { return nil }
  return CGRect(origin: pt, size: sz)
}
func wire(_ r: CGRect?) -> Any { r.map { [r1($0.origin.x), r1($0.origin.y), r1($0.width), r1($0.height)] } ?? NSNull() }
func diff(_ a: CGRect, _ b: CGRect) -> Double {
  max(abs(a.minX - b.minX), abs(a.minY - b.minY), abs(a.maxX - b.maxX), abs(a.maxY - b.maxY))
}
func holds(_ r: CGRect, _ p: CGPoint) -> Bool { p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY }
func rectArg(_ a: Any?) -> CGRect? {
  guard let a = a as? [Double], a.count == 4 else { return nil }
  return CGRect(x: a[0], y: a[1], width: a[2], height: a[3])
}
func pctl(_ xs: [Double], _ q: Double) -> Double {
  guard !xs.isEmpty else { return 0 }
  let s = xs.sorted()
  return r3(s[min(s.count - 1, Int((Double(s.count - 1) * q).rounded()))])
}

/// The application's window whose frame is `frame` (within 2 pt), else its first.
func findWindow(pid: pid_t, frame: CGRect?) -> AXUIElement? {
  let app = prepare(AXUIElementCreateApplication(pid))
  let windows = asElements(multi(app, [kAXWindowsAttribute])[0])
  if let frame {
    for w in windows {
      let v = multi(w, [kAXPositionAttribute, kAXSizeAttribute])
      if let f = rect(v[0], v[1]), diff(f, frame) <= 2 { return w }
    }
  }
  return windows.first
}

func grid(_ req: [String: Any]) -> [String: Any] {
  guard let pid = (req["pid"] as? NSNumber)?.int32Value, let window = rectArg(req["window"]), let out = req["out"] as? String else {
    return ["error": "bad grid args"]
  }
  let step = (req["step"] as? Double) ?? 20
  let app = prepare(AXUIElementCreateApplication(pid))
  var points: [[String: Any]] = []
  var times: [Double] = []
  let started = nowMs()
  reads = 0
  var y = window.minY + step / 2
  while y < window.maxY {
    var x = window.minX + step / 2
    while x < window.maxX {
      let t0 = nowMs()
      var hit: AXUIElement?
      let error = AXUIElementCopyElementAtPosition(app, Float(x), Float(y), &hit)
      var chain: [[Any]] = []
      var inWindow = false
      var title: Any = NSNull(), desc: Any = NSNull()
      if error == .success, let first = hit.map(prepare) {
        var current: AXUIElement? = first
        var level = 0
        while let e = current, level <= 300 {
          let v = multi(e, [kAXRoleAttribute, kAXPositionAttribute, kAXSizeAttribute, kAXParentAttribute])
          let role = (v[0] as? String) ?? ""
          let f = rect(v[1], v[2])
          chain.append([role, f.map { r1($0.origin.x) } ?? NSNull(), f.map { r1($0.origin.y) } ?? NSNull(),
                        f.map { r1($0.width) } ?? NSNull(), f.map { r1($0.height) } ?? NSNull()])
          if level == 0 {
            let l = multi(e, [kAXTitleAttribute, kAXDescriptionAttribute])
            title = (l[0] as? String).map { String($0.prefix(40)) } ?? NSNull()
            desc = (l[1] as? String).map { String($0.prefix(40)) } ?? NSNull()
          }
          if role == kAXWindowRole {
            inWindow = f.map { diff($0, window) <= 2 } ?? false
            break
          }
          current = asElement(v[3])
          level += 1
        }
      }
      let ms = nowMs() - t0
      times.append(ms)
      var point: [String: Any] = ["x": r1(x), "y": r1(y), "ms": r3(ms), "err": Int(error.rawValue)]
      if inWindow { point["chain"] = chain; point["title"] = title; point["desc"] = desc } else if !chain.isEmpty { point["otherWindow"] = true }
      points.append(point)
      x += step
    }
    y += step
  }
  let data = try! JSONSerialization.data(withJSONObject: ["window": wire(window), "step": step, "points": points])
  FileManager.default.createFile(atPath: out, contents: data)
  return ["points": points.count, "ms": r3(nowMs() - started), "p50": pctl(times, 0.5), "p95": pctl(times, 0.95), "reads": reads]
}

func vwalk(_ req: [String: Any]) -> [String: Any] {
  guard let pid = (req["pid"] as? NSNumber)?.int32Value, let window = rectArg(req["window"]) else { return ["error": "bad vwalk args"] }
  let prune = (req["prune"] as? Bool) ?? true
  let cap = (req["cap"] as? Int) ?? 200_000
  let deadline = nowMs() + ((req["deadlineMs"] as? Double) ?? 60_000)
  guard let root = findWindow(pid: pid, frame: window) else { return ["error": "no window"] }
  let started = nowMs()
  reads = 0
  var stack: [(AXUIElement, Int)] = [(root, 0)]
  var seen: [UInt: [AXUIElement]] = [:]
  var nodes = 0, visible = 0, frameless = 0, maxDepth = 0, maxChildren = 0
  var stopped: String?
  while let (e, depth) = stack.popLast() {
    if nodes >= cap { stopped = "cap"; break }
    if nowMs() >= deadline { stopped = "deadline"; break }
    let key = UInt(CFHash(e))
    if seen[key, default: []].contains(where: { CFEqual($0, e) }) { continue }
    seen[key, default: []].append(e)
    let v = multi(e, [kAXRoleAttribute, kAXPositionAttribute, kAXSizeAttribute, kAXChildrenAttribute, kAXTitleAttribute, kAXDescriptionAttribute])
    nodes += 1
    maxDepth = max(maxDepth, depth)
    let f = rect(v[1], v[2])
    if f == nil { frameless += 1 }
    let meets = f.map { $0.intersects(window) } ?? true
    if meets { visible += 1 }
    if prune && !meets && depth > 0 { continue }
    let children = asElements(v[3])
    maxChildren = max(maxChildren, children.count)
    for c in children.reversed() { stack.append((c, depth + 1)) }
  }
  return ["nodes": nodes, "visible": visible, "frameless": frameless, "maxDepth": maxDepth, "maxChildren": maxChildren, "prune": prune,
          "ms": r3(nowMs() - started), "reads": reads, "stopped": stopped ?? NSNull(), "leftOnStack": stack.count]
}

func descend(_ req: [String: Any]) -> [String: Any] {
  guard let pid = (req["pid"] as? NSNumber)?.int32Value, let window = rectArg(req["window"]), let points = req["points"] as? [[Double]] else {
    return ["error": "bad descend args"]
  }
  guard let root = findWindow(pid: pid, frame: window) else { return ["error": "no window"] }
  var rows: [[String: Any]] = []
  for p in points {
    let point = CGPoint(x: p[0], y: p[1])
    let t0 = nowMs()
    reads = 0
    var current = root, levels = 0, childReads = 0
    var role = "AXWindow"
    descent: while levels < 300 {
      var frontier = asElements(multi(current, [kAXChildrenAttribute])[0])
      var hops = 0
      // A frameless child is passed through (its children stand in its place), as a frameless node is never chosen.
      while hops < 4 {
        var next: AXUIElement?, nextRole = "", frameless: [AXUIElement] = []
        for c in frontier {
          let v = multi(c, [kAXRoleAttribute, kAXPositionAttribute, kAXSizeAttribute])
          childReads += 1
          guard let f = rect(v[1], v[2]) else { frameless.append(c); continue }
          if f.width > 0, f.height > 0, holds(f, point) { next = c; nextRole = (v[0] as? String) ?? "" }  // the later sibling wins
        }
        if let next { current = next; role = nextRole; levels += 1; continue descent }
        if frameless.isEmpty { break descent }
        frontier = frameless.flatMap { asElements(multi($0, [kAXChildrenAttribute])[0]) }
        hops += 1
      }
      break
    }
    rows.append(["x": p[0], "y": p[1], "ms": r3(nowMs() - t0), "levels": levels, "childReads": childReads, "reads": reads, "role": role])
  }
  let ms = rows.compactMap { $0["ms"] as? Double }
  return ["rows": rows, "p50": pctl(ms, 0.5), "p95": pctl(ms, 0.95), "max": ms.max() ?? 0]
}

/// #301's record-only search, copied from feat/301-visible-first@effffcee Walk.swift (unchanged at ab0e019a) `recordedChildPositions`, to compare
/// against every child's frame read (whether a wide list's children bisect cleanly).
func recordedChildPositions(_ children: [AXUIElement], frame: (AXUIElement) -> CGRect?, window: CGRect, limit: Int) -> [Int] {
  let probe = 8
  func framed(from start: Int, by step: Int) -> CGRect? {
    var position = start
    for _ in 0..<probe {
      guard children.indices.contains(position) else { return nil }
      if let found = frame(children[position]) { return found }
      position += step
    }
    return nil
  }
  guard let first = framed(from: 0, by: 1), let last = framed(from: children.count - 1, by: -1) else { return [] }
  let vertical: Bool
  if last.minY > first.minY { vertical = true } else if last.minX > first.minX { vertical = false } else { return [] }
  func before(_ rect: CGRect) -> Bool { vertical ? rect.maxY <= window.minY : rect.maxX <= window.minX }
  func past(_ rect: CGRect) -> Bool { vertical ? rect.minY >= window.maxY : rect.minX >= window.maxX }
  var low = 0, high = children.count
  while low < high {
    let middle = (low + high) / 2
    if framed(from: middle, by: 1).map(before) ?? true { low = middle + 1 } else { high = middle }
  }
  var kept: [Int] = []
  var position = max(0, low - 1)
  let end = min(children.count, position + limit)
  while position < end {
    if let rect = frame(children[position]) {
      if past(rect) { break }
      if !before(rect), rect.intersects(window) { kept.append(position) }
    }
    position += 1
  }
  return kept
}

let clippingRoles: Set<String> = ["AXScrollArea", "AXWebArea", "AXWindow", "AXSheet", "AXMenu", "AXPopover"]

/// The window's elements with more than 499 children, found breadth-first (their children not entered), each with what
/// its clipping ancestors leave showing of the window; for each, every child's frame read against the bisection.
func wide(_ req: [String: Any]) -> [String: Any] {
  guard let pid = (req["pid"] as? NSNumber)?.int32Value, let window = rectArg(req["window"]) else { return ["error": "bad wide args"] }
  let maxNodes = (req["maxNodes"] as? Int) ?? 30_000
  let deadline = nowMs() + ((req["deadlineMs"] as? Double) ?? 20_000)
  guard let root = findWindow(pid: pid, frame: window) else { return ["error": "no window"] }
  var queue: [(AXUIElement, CGRect)] = [(root, window)]
  var head = 0
  var candidates: [(element: AXUIElement, role: String, children: [AXUIElement], clip: CGRect, frame: CGRect?)] = []
  while head < queue.count, head < maxNodes, nowMs() < deadline {
    let (e, clip) = queue[head]
    head += 1
    let v = multi(e, [kAXRoleAttribute, kAXPositionAttribute, kAXSizeAttribute, kAXChildrenAttribute])
    let role = (v[0] as? String) ?? ""
    let f = rect(v[1], v[2])
    let childClip = clippingRoles.contains(role) ? (f.map { clip.intersection($0) } ?? clip) : clip
    let children = asElements(v[3])
    if children.count > 499 { candidates.append((e, role, children, childClip, f)); continue }
    for c in children { queue.append((c, childClip)) }
  }
  var out: [[String: Any]] = []
  for c in candidates.sorted(by: { $0.children.count > $1.children.count }).prefix(3) {
    let visible = asElements(multi(c.element, ["AXVisibleChildren"])[0]).count
    let visibleRows = asElements(multi(c.element, [kAXVisibleRowsAttribute])[0]).count
    let t0 = nowMs()
    var frames: [CGRect?] = []
    for child in c.children { let v = multi(child, [kAXPositionAttribute, kAXSizeAttribute]); frames.append(rect(v[0], v[1])) }
    let bruteMs = nowMs() - t0
    let brute = frames.indices.filter { frames[$0].map { $0.intersects(c.clip) && $0.width > 0 && $0.height > 0 } ?? false }
    var ordered = 0, pairs = 0, previous: CGRect?
    for f in frames { guard let f else { continue }; if let p = previous { pairs += 1; if f.minY >= p.minY { ordered += 1 } }; previous = f }
    var bisectReads = 0
    let t1 = nowMs()
    let indexOf = Dictionary(c.children.enumerated().map { (UInt(CFHash($0.element)), $0.offset) }, uniquingKeysWith: { a, _ in a })
    let kept = recordedChildPositions(c.children, frame: { child in
      bisectReads += 1
      if let i = indexOf[UInt(CFHash(child))], CFEqual(c.children[i], child) { return frames[i] }
      let v = multi(child, [kAXPositionAttribute, kAXSizeAttribute]); return rect(v[0], v[1])
    }, window: c.clip, limit: 1_000)
    let bisectMs = nowMs() - t1
    let keptSet = Set(kept), bruteSet = Set(brute)
    let contiguous = brute.isEmpty || brute.last! - brute.first! + 1 == brute.count
    out.append(["role": c.role, "children": c.children.count, "visibleChildren": visible, "visibleRows": visibleRows, "frame": wire(c.frame), "clip": wire(c.clip),
                "framed": frames.compactMap { $0 }.count, "orderedPairs": ordered, "pairs": pairs, "bruteMs": r3(bruteMs),
                "brute": brute.count, "bruteFirst": brute.first ?? NSNull(), "bruteLast": brute.last ?? NSNull(), "bruteContiguous": contiguous,
                "bisected": kept.count, "bisectReads": bisectReads, "bisectFrameMsCached": r3(bisectMs),
                "missing": bruteSet.subtracting(keptSet).count, "extra": keptSet.subtracting(bruteSet).count])
  }
  return ["candidates": candidates.count, "scanned": head, "wide": out]
}

let primaryHeight = NSScreen.screens.first?.frame.height ?? 0
while let line = readLine() {
  guard let data = line.data(using: .utf8), let req = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
    emit(["error": "bad request"]); continue
  }
  switch req["op"] as? String {
  case "screen":
    emit(["screens": NSScreen.screens.map { s -> Any in
      let f = s.frame
      return [f.origin.x, primaryHeight - f.maxY, f.width, f.height, s.backingScaleFactor]
    }, "trusted": AXIsProcessTrusted()])
  case "grid": emit(grid(req))
  case "vwalk": emit(vwalk(req))
  case "descend": emit(descend(req))
  case "wide": emit(wide(req))
  default: emit(["error": "unknown op"])
  }
}
