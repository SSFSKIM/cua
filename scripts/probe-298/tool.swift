// #298 probe's side tool: every candidate attribute of a control (or container) on one held handle, read at an
// "observation" and again at "click time", with the hit-test at the observed centre each time. No engine, no click.
//   tool measure <pid>   a line server on stdin, one JSON answer per line on stdout:
//     {"op":"enable"}   AXManualAccessibility on the application (Chromium builds its web tree on it)
//     {"op":"find","cells":[{key, by, ...}]}  walks the application's tree once and holds each cell's handle:
//         by "wrap"   the first descendant carrying DOM class t298 of the element whose AXDOMIdentifier is `id`
//         by "axid"   the element whose AXIdentifier is `id`
//         by "title"  the first element of `role` titled `title` with no AXIdentifier
//         by "window" the application's first AXWindow; by "webarea" its first AXWebArea
//         by "tab"    the first element of a tab role whose title starts with `prefix`
//       and answers each one's reading.
//     {"op":"read"}  re-reads every held handle: its reading, whether the locator now finds the same handle (CFEqual),
//         and the hit-test at the centre of the frame it had when found (the hit, whether it is the handle, inside it,
//         the same element as the first read's hit).
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
func attr(_ e: AXUIElement, _ name: String) -> CFTypeRef? {
  var v: CFTypeRef?
  return AXUIElementCopyAttributeValue(e, name as CFString, &v) == .success ? v : nil
}
func element(_ ref: CFTypeRef?) -> AXUIElement? {
  guard let ref, CFGetTypeID(ref) == AXUIElementGetTypeID() else { return nil }
  return (ref as! AXUIElement)
}
func elements(_ ref: CFTypeRef?) -> [AXUIElement] {
  guard let ref, CFGetTypeID(ref) == CFArrayGetTypeID() else { return [] }
  return (ref as! [AnyObject]).compactMap { element($0 as CFTypeRef) }
}
func text(_ v: CFTypeRef?) -> String? {
  guard let v else { return nil }
  if CFGetTypeID(v) == CFStringGetTypeID() { return String((v as! String).prefix(200)) }
  if CFGetTypeID(v) == CFAttributedStringGetTypeID() { return String((v as! NSAttributedString).string.prefix(200)) }
  return nil
}
/// A value as JSON: a string, a number or boolean, an array of strings; else its type's name.
func json(_ v: CFTypeRef?) -> Any {
  guard let v else { return NSNull() }
  if let s = text(v) { return s }
  if CFGetTypeID(v) == CFBooleanGetTypeID() { return CFBooleanGetValue((v as! CFBoolean)) }
  if CFGetTypeID(v) == CFNumberGetTypeID() { return (v as! NSNumber) }
  if CFGetTypeID(v) == CFArrayGetTypeID() {
    let list = (v as! [AnyObject])
    let strings = list.compactMap { $0 as? String }
    return strings.count == list.count ? strings : "array[\(list.count)]"
  }
  return "type:\(CFCopyTypeIDDescription(CFGetTypeID(v)) as String)"
}
func role(_ e: AXUIElement) -> String? { attr(e, kAXRoleAttribute) as? String }
func frame(_ e: AXUIElement) -> CGRect? {
  guard let p = attr(e, kAXPositionAttribute), let s = attr(e, kAXSizeAttribute) else { return nil }
  var pt = CGPoint.zero, sz = CGSize.zero
  guard AXValueGetValue(p as! AXValue, .cgPoint, &pt), AXValueGetValue(s as! AXValue, .cgSize, &sz) else { return nil }
  return CGRect(origin: pt, size: sz)
}
func wire(_ r: CGRect?) -> Any { r.map { [r2($0.origin.x), r2($0.origin.y), r2($0.width), r2($0.height)] } ?? NSNull() }

/// The candidate attributes, read in one request (as the engine's walk reads its list), then the action names.
let names = ["AXRole", "AXSubrole", "AXRoleDescription", "AXTitle", "AXDescription", "AXValue", "AXValueDescription", "AXHelp",
             "AXIdentifier", "AXDOMIdentifier", "AXDOMClassList", "AXEnabled", "AXSelected", "AXExpanded", "AXPlaceholderValue",
             "AXURL", "AXChildren"]
func describe(_ e: AXUIElement) -> [String: Any] {
  var values: CFArray?
  let t0 = nowMs()
  let err = AXUIElementCopyMultipleAttributeValues(e, names as CFArray, AXCopyMultipleAttributeOptions(rawValue: 0), &values)
  let t1 = nowMs()
  var d: [String: Any] = ["readErr": err.rawValue, "readMs": r2(t1 - t0)]
  let list = (values as? [AnyObject]) ?? []
  for (i, name) in names.enumerated() where i < list.count {
    let v = list[i] as CFTypeRef
    // An attribute the element lacks comes back as an AXValue wrapping an AXError.
    if CFGetTypeID(v) == AXValueGetTypeID(), AXValueGetType(v as! AXValue) == .axError { continue }
    let key = name
    if name == "AXChildren" { d["childCount"] = elements(v).count; continue }
    if name == "AXURL" { d[key] = (v as? URL)?.absoluteString ?? json(v); continue }
    d[key] = json(v)
  }
  var actions: CFArray?
  AXUIElementCopyActionNames(e, &actions)
  d["actions"] = (actions as? [String]) ?? []
  d["frame"] = wire(frame(e))
  d["alive"] = role(e) != nil
  return d
}
let interactive: Set<String> = ["AXButton", "AXCheckBox", "AXRadioButton", "AXLink", "AXPopUpButton", "AXMenuButton", "AXMenuItem",
                                "AXTextField", "AXTextArea", "AXComboBox", "AXSearchField", "AXSecureTextField", "AXSlider",
                                "AXIncrementor", "AXDisclosureTriangle", "AXTab", "AXSwitch", "AXColorWell", "AXSegmentedControl"]
func walk(_ root: AXUIElement, limit: Int = 12000) -> [AXUIElement] {
  var queue = [root], head = 0
  while head < queue.count && queue.count < limit {
    queue.append(contentsOf: elements(attr(queue[head], kAXChildrenAttribute)).map(prepare)); head += 1
  }
  return queue
}
func isInside(_ e: AXUIElement, _ container: AXUIElement) -> Bool {
  var current = e
  for _ in 0..<80 {
    guard let p = element(attr(current, kAXParentAttribute)) else { return false }
    if CFEqual(p, container) { return true }
    current = p
  }
  return false
}
func locate(_ spec: [String: Any], in all: [AXUIElement]) -> AXUIElement? {
  let by = spec["by"] as? String ?? ""
  switch by {
  case "wrap":
    guard let id = spec["id"] as? String, let wrap = all.first(where: { text(attr($0, "AXDOMIdentifier")) == id }) else { return nil }
    return walk(wrap, limit: 400).first(where: { ((attr($0, "AXDOMClassList") as? [String]) ?? []).contains("t298") })
  case "axid":
    return all.first(where: { text(attr($0, "AXIdentifier")) == spec["id"] as? String })
  case "title":
    return all.first(where: { role($0) == spec["role"] as? String && text(attr($0, kAXTitleAttribute)) == spec["title"] as? String
      && attr($0, "AXIdentifier") == nil })
  case "window":
    return all.first(where: { role($0) == "AXWindow" })
  case "webarea":
    return all.first(where: { role($0) == "AXWebArea" })
  case "tab":
    let prefix = spec["prefix"] as? String ?? "\u{0}"
    return all.first(where: { ["AXRadioButton", "AXTab", "AXButton"].contains(role($0) ?? "") && (text(attr($0, kAXTitleAttribute))?.hasPrefix(prefix) ?? false)
      && (text(attr($0, "AXSubrole")) == "AXTabButton" || role($0) == "AXRadioButton" || role($0) == "AXTab") })
  default: return nil
  }
}

struct Held { let spec: [String: Any]; let handle: AXUIElement; let centre: CGPoint?; let firstHit: AXUIElement? }
let args = CommandLine.arguments
guard args.count > 2, args[1] == "measure", let pid = pid_t(args[2]) else { emit(["error": "usage: tool measure <pid>"]); exit(2) }
let app = prepare(AXUIElementCreateApplication(pid))
var held: [String: Held] = [:]
var order: [String] = []
func hitTest(_ p: CGPoint) -> AXUIElement? {
  var hit: AXUIElement?
  _ = AXUIElementCopyElementAtPosition(app, Float(p.x), Float(p.y), &hit)
  return hit.map(prepare)
}
func hitReading(_ h: Held, _ hit: AXUIElement?) -> [String: Any] {
  guard let hit else { return ["hit": NSNull()] }
  return ["hit": ["role": role(hit) ?? NSNull(), "title": text(attr(hit, kAXTitleAttribute)) ?? NSNull(),
                  "desc": text(attr(hit, kAXDescriptionAttribute)) ?? NSNull(), "value": text(attr(hit, kAXValueAttribute)) ?? NSNull(),
                  "frame": wire(frame(hit))],
          "hitIsHandle": CFEqual(hit, h.handle), "hitInsideHandle": isInside(hit, h.handle), "handleInsideHit": isInside(h.handle, hit),
          "hitSameAsFirst": h.firstHit.map { CFEqual($0, hit) } ?? NSNull()]
}

while let line = readLine() {
  guard let data = line.data(using: .utf8), let cmd = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
        let op = cmd["op"] as? String else { emit(["error": "bad line"]); continue }
  switch op {
  case "enable":
    let r = AXUIElementSetAttributeValue(app, "AXManualAccessibility" as CFString, kCFBooleanTrue)
    emit(["manualAccessibility": r.rawValue])
  case "find":
    let t0 = nowMs()
    let all = walk(app)
    var out: [String: Any] = [:]
    held = [:]; order = []
    for spec in (cmd["cells"] as? [[String: Any]]) ?? [] {
      let key = spec["key"] as! String
      guard let e = locate(spec, in: all) else { out[key] = ["found": false]; continue }
      let f = frame(e)
      let centre = f.map { CGPoint(x: $0.midX, y: $0.midY) }
      let hit = centre.flatMap(hitTest)
      let h = Held(spec: spec, handle: e, centre: centre, firstHit: hit)
      held[key] = h; order.append(key)
      var r: [String: Any] = ["found": true, "node": describe(e)]
      r.merge(hitReading(h, hit)) { a, _ in a }
      out[key] = r
    }
    emit(["walked": all.count, "ms": r2(nowMs() - t0), "cells": out])
  case "read":
    let t0 = nowMs()
    var all: [AXUIElement]?
    var out: [String: Any] = [:]
    for key in order {
      let h = held[key]!
      var r: [String: Any] = ["node": describe(h.handle)]
      if h.spec["by"] as? String != "title" {
        if all == nil { all = walk(app) }
        let again = locate(h.spec, in: all!)
        r["refoundSame"] = again.map { CFEqual($0, h.handle) } ?? NSNull()
        if let again, !CFEqual(again, h.handle) { r["refound"] = describe(again) }
      }
      if let c = h.centre { r.merge(hitReading(h, hitTest(c))) { a, _ in a } }
      out[key] = r
    }
    emit(["ms": r2(nowMs() - t0), "cells": out])
  default:
    emit(["error": "unknown op \(op)"])
  }
}
