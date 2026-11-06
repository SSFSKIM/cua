// #296 probe's side tool: the stale-point guard emulated outside the engine (scripts/probe-296/live.mjs runs it as a
// child of the job shell, which holds the runner image's Accessibility grant).
//   tool guard <pid>     a line server on stdin, one JSON answer per line on stdout:
//     {"op":"record","x","y","role","frame":[x,y,w,h]}  finds, in this process, the handle of the engine's recorded node
//         (the deepest node of the observation whose frame holds the point): the hit at the point, its ancestors and its
//         descendants, the element of the same role whose frame is nearest the engine's; else the application's tree
//         breadth-first for one within 0.75 pt.
//     {"op":"check","x","y"}  the guard at click time: the hit-test, the recorded node's frame re-read, its identity
//         (CFEqual while its handle is valid, else a re-created handle of the same role within 2 pt among the hit, its
//         ancestors and descendants), and the verdict with its reason; each step timed.
//   tool cursor          the cursor's location.
import AppKit
import ApplicationServices
import Foundation

setvbuf(stdout, nil, _IOFBF, 1 << 20)
func nowMs() -> Double { Double(clock_gettime_nsec_np(CLOCK_UPTIME_RAW)) / 1e6 }
func emit(_ object: Any) {
  print(String(data: try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]), encoding: .utf8)!)
  fflush(stdout)
}
func r2(_ v: Double) -> Double { (v * 100).rounded() / 100 }
func prepare(_ e: AXUIElement) -> AXUIElement { AXUIElementSetMessagingTimeout(e, 1.0); return e }
func copy(_ e: AXUIElement, _ name: String) -> (CFTypeRef?, AXError) {
  var v: CFTypeRef?
  let r = AXUIElementCopyAttributeValue(e, name as CFString, &v)
  return (r == .success ? v : nil, r)
}
func attr(_ e: AXUIElement, _ name: String) -> CFTypeRef? { copy(e, name).0 }
func str(_ e: AXUIElement, _ name: String) -> String? { (attr(e, name) as? String).map { String($0.prefix(60)) } }
func element(_ ref: CFTypeRef?) -> AXUIElement? {
  guard let ref, CFGetTypeID(ref) == AXUIElementGetTypeID() else { return nil }
  return (ref as! AXUIElement)
}
func elements(_ ref: CFTypeRef?) -> [AXUIElement] {
  guard let ref, CFGetTypeID(ref) == CFArrayGetTypeID() else { return [] }
  return (ref as! [AnyObject]).compactMap { element($0 as CFTypeRef) }
}
/// The frame by AXPosition and AXSize, and the first error.
func frame(_ e: AXUIElement) -> (CGRect?, Int32) {
  let (p, pe) = copy(e, kAXPositionAttribute)
  guard let p else { return (nil, pe.rawValue) }
  let (s, se) = copy(e, kAXSizeAttribute)
  guard let s else { return (nil, se.rawValue) }
  var pt = CGPoint.zero, sz = CGSize.zero
  guard AXValueGetValue(p as! AXValue, .cgPoint, &pt), AXValueGetValue(s as! AXValue, .cgSize, &sz) else { return (nil, -1) }
  return (CGRect(origin: pt, size: sz), 0)
}
func wire(_ r: CGRect?) -> Any { r.map { [r2($0.origin.x), r2($0.origin.y), r2($0.width), r2($0.height)] } ?? NSNull() }
func diff(_ a: CGRect, _ b: CGRect) -> Double {
  max(abs(a.minX - b.minX), abs(a.minY - b.minY), abs(a.maxX - b.maxX), abs(a.maxY - b.maxY))
}
func holds(_ r: CGRect, _ p: CGPoint) -> Bool { p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY }
func role(_ e: AXUIElement) -> String? { attr(e, kAXRoleAttribute) as? String }
func describe(_ e: AXUIElement) -> [String: Any] {
  var actions: CFArray?
  AXUIElementCopyActionNames(e, &actions)
  var d: [String: Any] = ["role": role(e) ?? NSNull(), "subrole": str(e, kAXSubroleAttribute) ?? NSNull(),
                          "title": str(e, kAXTitleAttribute) ?? NSNull(), "desc": str(e, kAXDescriptionAttribute) ?? NSNull(),
                          "value": str(e, kAXValueAttribute) ?? NSNull(), "domId": str(e, "AXDOMIdentifier") ?? NSNull(),
                          "id": str(e, "AXIdentifier") ?? NSNull(), "frame": wire(frame(e).0),
                          "actions": (actions as? [String]) ?? []]
  if let classes = attr(e, "AXDOMClassList") as? [String] { d["classes"] = classes }
  return d
}
/// The roles the guard takes for interactive: a hit of one of these that is not the recorded node refuses.
let interactive: Set<String> = ["AXButton", "AXCheckBox", "AXRadioButton", "AXLink", "AXPopUpButton", "AXMenuButton", "AXMenuItem",
                                "AXTextField", "AXTextArea", "AXComboBox", "AXSearchField", "AXSecureTextField", "AXSlider",
                                "AXIncrementor", "AXDisclosureTriangle", "AXTab", "AXSwitch", "AXColorWell", "AXSegmentedControl"]
let stops: Set<String> = ["AXWindow", "AXApplication"]
func ancestors(_ e: AXUIElement, limit: Int = 80) -> [AXUIElement] {
  var out: [AXUIElement] = [], current = e
  for _ in 0..<limit {
    guard let p = element(attr(current, kAXParentAttribute)).map(prepare) else { break }
    out.append(p)
    if stops.contains(role(p) ?? "") { break }
    current = p
  }
  return out
}
func descendants(_ e: AXUIElement, limit: Int) -> [AXUIElement] {
  var queue = elements(attr(e, kAXChildrenAttribute)).map(prepare), head = 0
  while head < queue.count && queue.count < limit {
    queue.append(contentsOf: elements(attr(queue[head], kAXChildrenAttribute)).map(prepare)); head += 1
  }
  return Array(queue.prefix(limit))
}
func hitTest(_ app: AXUIElement, _ p: CGPoint) -> (AXUIElement?, Int32) {
  var hit: AXUIElement?
  let r = AXUIElementCopyElementAtPosition(app, Float(p.x), Float(p.y), &hit)
  return (hit.map(prepare), r.rawValue)
}
/// Among the candidates, the one of `wantRole` whose frame is nearest `want` (its distance in pt, the largest edge's).
func nearest(_ list: [AXUIElement], role wantRole: String, frame want: CGRect) -> (AXUIElement, Double, CGRect)? {
  var best: (AXUIElement, Double, CGRect)?
  for e in list where role(e) == wantRole {
    guard let f = frame(e).0 else { continue }
    let d = diff(f, want)
    if best == nil || d < best!.1 { best = (e, d, f) }
  }
  return best
}

let args = CommandLine.arguments
switch args.count > 1 ? args[1] : "" {
case "guard":
  let pid = pid_t(args[2])!
  let app = prepare(AXUIElementCreateApplication(pid))
  var recorded: AXUIElement?
  var recordedRole = "", recordedFrame = CGRect.zero
  while let line = readLine() {
    guard let data = line.data(using: .utf8), let cmd = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let op = cmd["op"] as? String else { emit(["error": "bad line"]); continue }
    let p = CGPoint(x: cmd["x"] as? Double ?? 0, y: cmd["y"] as? Double ?? 0)
    if op == "record" {
      let t0 = nowMs()
      let f = cmd["frame"] as! [Double]
      recordedRole = cmd["role"] as! String
      recordedFrame = CGRect(x: f[0], y: f[1], width: f[2], height: f[3])
      let (hit, hitErr) = hitTest(app, p)
      var out: [String: Any] = ["hitErr": hitErr]
      var found: (AXUIElement, Double, CGRect)?
      var method = "none"
      if let hit {
        out["hit"] = describe(hit)
        let chain = [hit] + ancestors(hit) + descendants(hit, limit: 300)
        if let n = nearest(chain, role: recordedRole, frame: recordedFrame), n.1 <= 8 { found = n; method = "hitChain" }
      }
      if found == nil {
        var queue = [app], head = 0
        while head < queue.count && head < 8000 {
          let e = queue[head]; head += 1
          if role(e) == recordedRole, let fr = frame(e).0, diff(fr, recordedFrame) <= 0.75 { found = (e, diff(fr, recordedFrame), fr); method = "appWalk"; break }
          queue.append(contentsOf: elements(attr(e, kAXChildrenAttribute)).map(prepare))
        }
      }
      recorded = found?.0
      out["method"] = method
      out["distance"] = found.map { r2($0.1) } ?? NSNull()
      out["node"] = found.map { describe($0.0) } ?? NSNull()
      out["ms"] = r2(nowMs() - t0)
      emit(out)
    } else if op == "check" {
      guard let rec = recorded else { emit(["error": "nothing recorded"]); continue }
      let t0 = nowMs()
      let (hit, hitErr) = hitTest(app, p)
      let t1 = nowMs()
      let hitRole = hit.flatMap(role)
      let t2 = nowMs()
      let (nowFrame, frameErr) = frame(rec)
      let t3 = nowMs()
      var out: [String: Any] = ["hitErr": hitErr, "frameErr": frameErr,
                                "ms": ["hitTest": r2(t1 - t0), "hitRole": r2(t2 - t1), "frameRead": r2(t3 - t2)]]
      // Identity: the recorded handle while it answers its frame; else a re-created one among the hit's family.
      var node: AXUIElement?, nodeFrame: CGRect?
      var identity = "none"
      if let nowFrame { node = rec; nodeFrame = nowFrame; identity = "cfequal" } else {
        let t4 = nowMs()
        if let hit, let n = nearest([hit] + ancestors(hit) + descendants(hit, limit: 300), role: recordedRole, frame: recordedFrame) {
          out["recreatedBest"] = ["distance": r2(n.1), "node": describe(n.0)]
          if n.1 <= 2 { node = n.0; nodeFrame = n.2; identity = "recreated" }
        }
        var ms = out["ms"] as! [String: Any]; ms["recreateSearch"] = r2(nowMs() - t4); out["ms"] = ms
      }
      out["identity"] = identity
      out["nodeFrame"] = wire(nodeFrame)
      var verdict = "pass", reason = ""
      var relation = "none"
      if node == nil { verdict = "refuse"; reason = "nodeGone" }
      else if !holds(nodeFrame!, p) { verdict = "refuse"; reason = "frameMoved" }
      else if let hit, CFEqual(hit, node!) { reason = "sameHit"; relation = "equal" }
      else if let hit {
        let hitUp = ancestors(hit)
        if hitUp.contains(where: { CFEqual($0, node!) }) { relation = "hitInsideNode" }
        else if ancestors(node!).contains(where: { CFEqual($0, hit) }) { relation = "hitAboveNode" }
        else { relation = "unrelated" }
        if interactive.contains(hitRole ?? "") { verdict = "refuse"; reason = "interactiveHit" } else { reason = "nonInteractiveHit" }
      } else { reason = "noHit" }
      out["verdict"] = verdict
      out["reason"] = reason
      out["relation"] = relation
      var ms = out["ms"] as! [String: Any]; ms["total"] = r2(nowMs() - t0); out["ms"] = ms
      // Beyond the guard, for the analysis: the hit and its ancestors' identities, the node as it reads now.
      if let hit { out["hit"] = describe(hit); out["hitUp"] = ancestors(hit, limit: 12).map { e -> [String: Any] in
        ["role": role(e) ?? NSNull(), "domId": str(e, "AXDOMIdentifier") ?? NSNull(), "id": str(e, "AXIdentifier") ?? NSNull(),
         "title": str(e, kAXTitleAttribute) ?? NSNull(), "frame": wire(frame(e).0)] } }
      if let node { out["node"] = describe(node) }
      emit(out)
    } else { emit(["error": "unknown op \(op)"]) }
  }

case "cursor":
  let c = CGEvent(source: nil)?.location ?? .zero
  emit(["x": c.x, "y": c.y])

default:
  emit(["error": "usage: tool guard <pid> | cursor"])
}
