// #304 probe's side tool (scripts/probe-304/run.mjs runs it as a child of the job shell, which holds the runner image's
// Accessibility grant), from #299's (probe/299-hosted scripts/probe-299/tool.swift). A line server on stdin, one JSON
// answer per line on stdout. Nothing here posts input.
//   {"op":"screen"}                                    the screens' frames (top-left origin)
//   {"op":"grid","pid","window":[x,y,w,h],"step","out"} hit-tests every grid point of the window as the engine's
//       hitTest(window:pid:at:) does (asked of the application, kept only when the hit's AXWindow is the window), and
//       writes each hit's chain (role and frame, the hit up to its window) to `out`; answers the timing
//   {"op":"price","pid","window","cap"} the price of the reads the candidate fixes add: up to `cap` elements of the
//       window gathered depth first, then per element one frame read (AXPosition and AXSize in one batched call) and one
//       children read, each timed; and a bare hit-test (no chain) at 50 points
//   {"op":"axscroll","pid","window","frac"} sets the vertical scroll bar of the window's scroll area that holds its web
//       area to `frac` (0...1) through Accessibility (Safari, which no script reaches on the runner), and answers its
//       value before and after
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

func gather(_ root: AXUIElement, cap: Int) -> [AXUIElement] {
  var out: [AXUIElement] = []
  var stack = [root]
  while let e = stack.popLast(), out.count < cap {
    out.append(e)
    for c in asElements(multi(e, [kAXChildrenAttribute])[0]).reversed() { stack.append(c) }
  }
  return out
}

func price(_ req: [String: Any]) -> [String: Any] {
  guard let pid = (req["pid"] as? NSNumber)?.int32Value, let window = rectArg(req["window"]) else { return ["error": "bad price args"] }
  guard let root = findWindow(pid: pid, frame: window) else { return ["error": "no window"] }
  let cap = (req["cap"] as? Int) ?? 2000
  let elements = gather(root, cap: cap)
  var frameMs: [Double] = [], childMs: [Double] = []
  for e in elements {
    let t0 = nowMs()
    _ = multi(e, [kAXPositionAttribute, kAXSizeAttribute])
    let t1 = nowMs()
    _ = multi(e, [kAXChildrenAttribute])
    childMs.append(nowMs() - t1)
    frameMs.append(t1 - t0)
  }
  let app = prepare(AXUIElementCreateApplication(pid))
  var hitMs: [Double] = []
  for i in 0..<50 {
    let x = window.minX + window.width * (Double(i % 10) + 0.5) / 10, y = window.minY + window.height * (Double(i / 10) + 0.5) / 5
    var hit: AXUIElement?
    let t0 = nowMs()
    _ = AXUIElementCopyElementAtPosition(app, Float(x), Float(y), &hit)
    hitMs.append(nowMs() - t0)
  }
  let mean = { (xs: [Double]) -> Double in xs.isEmpty ? 0 : r3(xs.reduce(0, +) / Double(xs.count)) }
  return ["elements": elements.count, "frameMean": mean(frameMs), "frameP50": pctl(frameMs, 0.5), "frameP95": pctl(frameMs, 0.95),
          "childrenMean": mean(childMs), "childrenP50": pctl(childMs, 0.5), "hitMean": mean(hitMs), "hitP50": pctl(hitMs, 0.5), "hitP95": pctl(hitMs, 0.95)]
}

/// The first element of the window (depth first) with more than `over` children, and its children's roles and frames at
/// the first and last 16 positions and every 25th between: what the guard's record-only bisection (#301 item 4,
/// `recordedChildPositions`) had to work with.
func kids(_ req: [String: Any]) -> [String: Any] {
  guard let pid = (req["pid"] as? NSNumber)?.int32Value, let window = rectArg(req["window"]) else { return ["error": "bad kids args"] }
  guard let root = findWindow(pid: pid, frame: window) else { return ["error": "no window"] }
  let over = (req["over"] as? Int) ?? 499
  var stack = [root]
  var visited = 0
  while let e = stack.popLast(), visited < 20_000 {
    visited += 1
    let v = multi(e, [kAXRoleAttribute, kAXPositionAttribute, kAXSizeAttribute, kAXChildrenAttribute])
    let children = asElements(v[3])
    if children.count > over {
      var sample: [[Any]] = []
      for (i, c) in children.enumerated() where i < 16 || i >= children.count - 16 || i % 25 == 0 {
        let w = multi(c, [kAXRoleAttribute, kAXPositionAttribute, kAXSizeAttribute])
        sample.append([i, (w[0] as? String) ?? "", wire(rect(w[1], w[2]))])
      }
      return ["role": (v[0] as? String) ?? "", "frame": wire(rect(v[1], v[2])), "children": children.count, "sample": sample, "visited": visited]
    }
    for c in children.reversed() { stack.append(c) }
  }
  return ["none": true, "visited": visited]
}

func axscroll(_ req: [String: Any]) -> [String: Any] {
  guard let pid = (req["pid"] as? NSNumber)?.int32Value, let window = rectArg(req["window"]), let frac = (req["frac"] as? NSNumber)?.doubleValue else {
    return ["error": "bad axscroll args"]
  }
  guard let root = findWindow(pid: pid, frame: window) else { return ["error": "no window"] }
  // The scroll area that holds a web area, breadth first within a few levels.
  var level: [AXUIElement] = [root]
  var area: AXUIElement?
  search: for _ in 0..<12 {
    var next: [AXUIElement] = []
    for e in level {
      let v = multi(e, [kAXRoleAttribute, kAXChildrenAttribute])
      let kids = asElements(v[1])
      if (v[0] as? String) == kAXScrollAreaRole, kids.contains(where: { (multi($0, [kAXRoleAttribute])[0] as? String) == "AXWebArea" }) {
        area = e
        break search
      }
      next.append(contentsOf: kids)
    }
    level = next
  }
  guard let area else { return ["error": "no web scroll area"] }
  guard let bar = asElement(multi(area, [kAXVerticalScrollBarAttribute])[0]) else { return ["error": "no vertical scroll bar"] }
  let before = (multi(bar, [kAXValueAttribute])[0] as? NSNumber)?.doubleValue
  var settable = DarwinBoolean(false)
  AXUIElementIsAttributeSettable(bar, kAXValueAttribute as CFString, &settable)
  let error = AXUIElementSetAttributeValue(bar, kAXValueAttribute as CFString, NSNumber(value: frac))
  usleep(400_000)
  let after = (multi(bar, [kAXValueAttribute])[0] as? NSNumber)?.doubleValue
  return ["before": before ?? NSNull(), "after": after ?? NSNull(), "settable": settable.boolValue, "error": Int(error.rawValue)]
}

let primaryHeight = NSScreen.screens.first?.frame.height ?? 0
while let line = readLine() {
  guard let data = line.data(using: .utf8), let req = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
    emit(["error": "bad request"])
    continue
  }
  switch req["op"] as? String {
  case "screen":
    emit(["screens": NSScreen.screens.map { s -> Any in
      let f = s.frame
      return [f.origin.x, primaryHeight - f.maxY, f.width, f.height, s.backingScaleFactor]
    }, "trusted": AXIsProcessTrusted()])
  case "grid": emit(grid(req))
  case "price": emit(price(req))
  case "axscroll": emit(axscroll(req))
  case "kids": emit(kids(req))
  default: emit(["error": "unknown op"])
  }
}
