// #288 probe's AX side (scripts/probe-288/probe.mjs runs it as a child of the job shell, which holds the runner image's
// Accessibility grant). One JSON object on stdout per invocation. Nothing here posts an event or activates an app.
//   ax trigger <pid> <spec-json>   the spec's steps on the application element at their times (ms from t0), while a
//       sampler every sampleMs for pollMs hit-tests (AXUIElementCopyElementAtPosition, the engine's hit-test) the page's
//       checkbox point and text field point: the checkbox hit's role and action names, the field hit's role and its
//       AXBoundsForRange {k, 1}. Records each change and the first time of: a hit inside the page (Basic: the tree is
//       exposed), the checkbox advertising AXPress, a non-empty character box.
//       steps: role (AXRole+AXSubrole+AXRoleDescription in one request, the engine's readRole), manual
//       (AXManualAccessibility true), eui (AXEnhancedUserInterface true), eui-false, observer (an AXObserver on the
//       application for the notifications a screen reader registers), sr (the reads a screen reader makes: focus, windows,
//       the web area's search predicate, text markers, the field's parameterized text attributes), deep (every attribute,
//       parameterized name and action of every element, up to 4000), webarea (the engine's containsWebArea search).
//       Spec: {steps: [{at, do}], deepEveryMs?, pollMs, sampleMs, cb: {x, y}, tf: {x, y, k}}
//   ax toolbar <pid> <spec-json>   in a process nothing has observed: the hit at the toolbar point and its walk to the
//       window (the engine's webAreaWalk) before anything else; the application's role read; the same hit and walk; then
//       the hit's window searched for an AXWebArea (the engine's containsWebArea) every 10 ms until found or 2 s; a page
//       point's hit and walk. Each step timed. Spec: {reload: {x, y}, page: {x, y}}
//   ax locate <pid>                 the role read, then up to 3 s for the toolbar's Reload button and the checkbox (their
//       frames)
//   ax geom <pid> <spec-json>      the window's scripted move and resize through AX (AXPosition, AXSize) in phases, each
//       write's duration and the window's CG bounds sampled every 4 ms for 1.2 s after it (frames seen, time to settle);
//       between phases a step (as trigger's) and a wait. Spec: {phases: [{label, before: [do], waitMs}]}
import AppKit
import ApplicationServices
import Foundation

setvbuf(stdout, nil, _IOFBF, 1 << 20)
let epoch0 = Date().timeIntervalSince1970 * 1000
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
func str(_ e: AXUIElement, _ name: String) -> String? { attr(e, name) as? String }
func element(_ ref: CFTypeRef?) -> AXUIElement? {
  guard let ref, CFGetTypeID(ref) == AXUIElementGetTypeID() else { return nil }
  return (ref as! AXUIElement)
}
func elements(_ ref: CFTypeRef?) -> [AXUIElement] {
  guard let ref, CFGetTypeID(ref) == CFArrayGetTypeID() else { return [] }
  return (ref as! [AnyObject]).compactMap { element($0 as CFTypeRef) }
}
func param(_ e: AXUIElement, _ name: String, _ p: CFTypeRef) -> (CFTypeRef?, Int32) {
  var v: CFTypeRef?
  let r = AXUIElementCopyParameterizedAttributeValue(e, name as CFString, p, &v)
  return (r == .success ? v : nil, r.rawValue)
}
func names(_ e: AXUIElement) -> [String] { var n: CFArray?; return AXUIElementCopyAttributeNames(e, &n) == .success ? (n as? [String] ?? []) : [] }
func pnames(_ e: AXUIElement) -> [String] { var n: CFArray?; return AXUIElementCopyParameterizedAttributeNames(e, &n) == .success ? (n as? [String] ?? []) : [] }
func actions(_ e: AXUIElement) -> [String]? { var n: CFArray?; return AXUIElementCopyActionNames(e, &n) == .success ? (n as? [String] ?? []) : nil }
func rect(_ ref: CFTypeRef?) -> CGRect? {
  guard let ref, CFGetTypeID(ref) == AXValueGetTypeID() else { return nil }
  var r = CGRect.zero
  return AXValueGetValue(ref as! AXValue, .cgRect, &r) ? r : nil
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
func rangeValue(_ loc: Int, _ len: Int) -> AXValue { var r = CFRange(location: loc, length: len); return AXValueCreate(.cfRange, &r)! }
func hitTest(_ app: AXUIElement, _ x: Double, _ y: Double) -> (AXUIElement?, Int32) {
  var hit: AXUIElement?
  let r = AXUIElementCopyElementAtPosition(app, Float(x), Float(y), &hit)
  return (hit.map(prepare), r.rawValue)
}
func boolValue(_ ref: CFTypeRef?) -> Any {
  guard let ref else { return NSNull() }
  if CFGetTypeID(ref) == CFBooleanGetTypeID() { return (ref as! NSNumber).boolValue }
  if CFGetTypeID(ref) == CFNumberGetTypeID() { return (ref as! NSNumber).intValue != 0 }
  return "<\(CFCopyTypeIDDescription(CFGetTypeID(ref)) as String)>"
}
func appState(_ app: AXUIElement) -> [String: Any] {
  let (eui, euiErr) = copy(app, "AXEnhancedUserInterface"), (man, manErr) = copy(app, "AXManualAccessibility")
  var euiSettable: DarwinBoolean = false, manSettable: DarwinBoolean = false
  let es = AXUIElementIsAttributeSettable(app, "AXEnhancedUserInterface" as CFString, &euiSettable)
  let ms = AXUIElementIsAttributeSettable(app, "AXManualAccessibility" as CFString, &manSettable)
  let ns = names(app)
  return ["eui": eui != nil ? boolValue(eui) : "error \(euiErr)", "manual": man != nil ? boolValue(man) : "error \(manErr)",
          "euiSettable": es == .success ? euiSettable.boolValue : "error \(es.rawValue)" as Any,
          "manualSettable": ms == .success ? manSettable.boolValue : "error \(ms.rawValue)" as Any,
          "listsManual": ns.contains("AXManualAccessibility"), "listsEUI": ns.contains("AXEnhancedUserInterface"), "names": ns]
}

// --- the walk the engine makes (Routes.swift webAreaWalk): from the hit up its parents to its window.
let walkStops: Set<String> = ["AXWindow", "AXSheet", "AXApplication"]
func walk(_ hit: AXUIElement) -> (verdict: String, roles: [String], window: AXUIElement?) {
  var cur = hit, roles: [String] = []
  for level in 0...300 {
    guard let role = str(cur, kAXRoleAttribute) else { roles.append("unreadable"); return ("incomplete", roles, nil) }
    roles.append(role)
    if role == "AXWebArea" { return ("inside", roles, nil) }
    if walkStops.contains(role) { return (level == 0 ? "incomplete" : "outside", roles, role == "AXWindow" ? cur : nil) }
    guard let next = element(attr(cur, kAXParentAttribute)) else { roles.append("noParent"); return ("incomplete", roles, nil) }
    cur = prepare(next)
  }
  return ("incomplete", roles, nil)
}
// The engine's containsWebArea: a breadth-first search under the window for an AXWebArea, up to 1000 elements.
func containsWebArea(_ root: AXUIElement, limit: Int = 1000) -> (found: Bool, visited: Int) {
  let attributes = [kAXRoleAttribute, kAXChildrenAttribute] as CFArray
  var queue = [root], head = 0
  while head < queue.count && head < limit {
    let e = prepare(queue[head]); head += 1
    var values: CFArray?
    guard AXUIElementCopyMultipleAttributeValues(e, attributes, AXCopyMultipleAttributeOptions(rawValue: 0), &values) == .success,
          let slots = values as? [Any], slots.count == 2 else { continue }
    if let role = slots[0] as? String, role == "AXWebArea" { return (true, head) }
    if CFGetTypeID(slots[1] as CFTypeRef) == CFArrayGetTypeID() { queue.append(contentsOf: elements(slots[1] as CFTypeRef)) }
  }
  return (false, head)
}
func findAll(_ root: AXUIElement, limit: Int, _ match: (AXUIElement, String) -> Bool) -> [AXUIElement] {
  var queue = [root], head = 0, out: [AXUIElement] = []
  while head < queue.count && head < limit {
    let e = prepare(queue[head]); head += 1
    if let role = str(e, kAXRoleAttribute), match(e, role) { out.append(e) }
    queue.append(contentsOf: elements(attr(e, kAXChildrenAttribute)))
  }
  return out
}
func frameOf(_ e: AXUIElement) -> [String: Double]? {
  guard let p = point(attr(e, kAXPositionAttribute)), let s = size(attr(e, kAXSizeAttribute)) else { return nil }
  return ["x": p.x, "y": p.y, "w": s.width, "h": s.height]
}

// --- the steps.
var observer: AXObserver?
var notifications: [String: Int] = [:]
let observerCallback: AXObserverCallback = { _, _, name, _ in notifications[name as String, default: 0] += 1 }
func observerStep(_ pid: pid_t, _ app: AXUIElement) -> [String: Any] {
  var o: AXObserver?
  let created = AXObserverCreate(pid, observerCallback, &o)
  guard created == .success, let o else { return ["create": created.rawValue] }
  observer = o
  let list = [kAXFocusedUIElementChangedNotification, kAXFocusedWindowChangedNotification, kAXMainWindowChangedNotification,
              kAXApplicationActivatedNotification, kAXApplicationDeactivatedNotification, kAXWindowCreatedNotification,
              kAXValueChangedNotification, kAXSelectedTextChangedNotification, kAXUIElementDestroyedNotification,
              kAXLayoutChangedNotification, kAXTitleChangedNotification, kAXSelectedChildrenChangedNotification,
              "AXLoadComplete", "AXLiveRegionChanged", "AXFocusChanged", "AXMenuOpened", "AXExpandedChanged"] as [String]
  var errors: [String: Int32] = [:]
  for n in list { let r = AXObserverAddNotification(o, app, n as CFString, nil); if r != .success { errors[n] = r.rawValue } }
  CFRunLoopAddSource(CFRunLoopGetCurrent(), AXObserverGetRunLoopSource(o), .defaultMode)
  return ["registered": list.count - errors.count, "errors": errors]
}
func srStep(_ app: AXUIElement) -> [String: Any] {
  var out: [String: Any] = [:]
  for n in ["AXFocusedWindow", "AXFocusedUIElement", "AXMainWindow", "AXWindows", "AXChildren", "AXTitle", "AXFrontmost", "AXHidden"] { out[n] = copy(app, n).1 }
  guard let window = element(attr(app, "AXFocusedWindow")) ?? elements(attr(app, kAXWindowsAttribute)).first else { out["window"] = "none"; return out }
  let web = findAll(prepare(window), limit: 1500) { _, r in r == "AXWebArea" }.first
  out["webArea"] = web != nil
  guard let web else { return out }
  for n in ["AXFocusedUIElement", "AXStartTextMarker", "AXEndTextMarker", "AXSelectedTextMarkerRange", "AXLinkUIElements", "AXLoaded",
            "AXLoadingProgress", "AXURL", "AXDescription", "AXChildren", "AXVisibleChildren", "AXCaretBrowsingEnabled"] { out["web." + n] = copy(web, n).1 }
  let predicate = ["AXSearchKey": "AXAnyTypeSearchKey", "AXResultsLimit": 100, "AXDirection": "AXDirectionNext",
                   "AXImmediateDescendantsOnly": false, "AXVisibleOnly": false] as [String: Any] as CFDictionary
  out["web.AXUIElementCountForSearchPredicate"] = param(web, "AXUIElementCountForSearchPredicate", predicate).1
  out["web.AXUIElementsForSearchPredicate"] = param(web, "AXUIElementsForSearchPredicate", predicate).1
  if let start = attr(web, "AXStartTextMarker"), let end = attr(web, "AXEndTextMarker") {
    let (range, re) = param(web, "AXTextMarkerRangeForUnorderedTextMarkers", [start, end] as CFArray)
    out["web.AXTextMarkerRangeForUnorderedTextMarkers"] = re
    if let range {
      out["web.AXStringForTextMarkerRange"] = param(web, "AXStringForTextMarkerRange", range).1
      out["web.AXBoundsForTextMarkerRange"] = param(web, "AXBoundsForTextMarkerRange", range).1
      out["web.AXAttributedStringForTextMarkerRange"] = param(web, "AXAttributedStringForTextMarkerRange", range).1
    }
  }
  let fields = findAll(web, limit: 1500) { _, r in r == "AXTextField" || r == "AXTextArea" }
  if let f = fields.first {
    for n in ["AXValue", "AXNumberOfCharacters", "AXSelectedTextRange", "AXVisibleCharacterRange", "AXInsertionPointLineNumber"] { out["field." + n] = copy(f, n).1 }
    out["field.AXBoundsForRange"] = param(f, "AXBoundsForRange", rangeValue(1, 1)).1
    out["field.AXStringForRange"] = param(f, "AXStringForRange", rangeValue(0, 3)).1
    out["field.AXLineForIndex"] = param(f, "AXLineForIndex", 1 as CFNumber).1
    out["field.AXRangeForLine"] = param(f, "AXRangeForLine", 0 as CFNumber).1
  }
  return out
}
func deepStep(_ app: AXUIElement) -> [String: Any] {
  var queue = [app], head = 0, reads = 0
  while head < queue.count && head < 4000 {
    let e = prepare(queue[head]); head += 1
    for n in names(e) { _ = attr(e, n); reads += 1 }
    _ = pnames(e); _ = actions(e)
    queue.append(contentsOf: elements(attr(e, kAXChildrenAttribute)))
  }
  return ["elements": head, "reads": reads]
}
func roleStep(_ app: AXUIElement) -> Int32 {
  var values: CFArray?
  return AXUIElementCopyMultipleAttributeValues(app, [kAXRoleAttribute, kAXSubroleAttribute, kAXRoleDescriptionAttribute] as CFArray,
                                                AXCopyMultipleAttributeOptions(rawValue: 0), &values).rawValue
}
func runStep(_ name: String, pid: pid_t, app: AXUIElement) -> Any {
  switch name {
  case "role": return roleStep(app)
  case "manual": return AXUIElementSetAttributeValue(app, "AXManualAccessibility" as CFString, kCFBooleanTrue).rawValue
  case "manual-false": return AXUIElementSetAttributeValue(app, "AXManualAccessibility" as CFString, kCFBooleanFalse).rawValue
  case "eui": return AXUIElementSetAttributeValue(app, "AXEnhancedUserInterface" as CFString, kCFBooleanTrue).rawValue
  case "eui-false": return AXUIElementSetAttributeValue(app, "AXEnhancedUserInterface" as CFString, kCFBooleanFalse).rawValue
  case "observer": return observerStep(pid, app)
  case "sr": return srStep(app)
  case "deep": return deepStep(app)
  case "webarea":
    guard let w = elements(attr(app, kAXWindowsAttribute)).first else { return "no window" }
    let r = containsWebArea(prepare(w)); return ["found": r.found, "visited": r.visited]
  default: return "unknown step"
  }
}
// Waits while the run loop serves the observer.
func pause(_ ms: Double) { if ms > 0 { CFRunLoopRunInMode(.defaultMode, ms / 1000, false) } }

func num(_ d: [String: Any], _ k: String) -> Double { (d[k] as? NSNumber)?.doubleValue ?? 0 }

let args = CommandLine.arguments
guard args.count >= 3, let pidValue = Int32(args[2]) else { emit(["error": "usage"]); exit(2) }
let pid = pid_t(pidValue)
let app = prepare(AXUIElementCreateApplication(pid))
let spec = args.count > 3 ? ((try? JSONSerialization.jsonObject(with: Data(args[3].utf8))) as? [String: Any] ?? [:]) : [:]

switch args[1] {
case "trigger":
  let steps = (spec["steps"] as? [[String: Any]] ?? []).map { (at: num($0, "at"), name: $0["do"] as? String ?? "") }
  let pollMs = (spec["pollMs"] as? NSNumber)?.doubleValue ?? 4500, sampleMs = (spec["sampleMs"] as? NSNumber)?.doubleValue ?? 20
  let deepEvery = (spec["deepEveryMs"] as? NSNumber)?.doubleValue
  let cb = spec["cb"] as? [String: Any] ?? [:], tf = spec["tf"] as? [String: Any] ?? [:]
  let k = Int(num(tf, "k"))
  let before = appState(app)
  let t0 = nowMs()
  var done: [[String: Any]] = [], next = 0, lastDeep = -1e9
  var changes: [[String: Any]] = [], last = "", samples = 0
  var firstInside: Double?, firstPress: Double?, firstBoxes: Double?, firstTfRole: Double?
  var sampleCost: [Double] = []
  while true {
    let t = nowMs() - t0
    while next < steps.count && steps[next].at <= t {
      let s0 = nowMs() - t0
      let result = runStep(steps[next].name, pid: pid, app: app)
      done.append(["do": steps[next].name, "at": r1(s0), "durMs": r1(nowMs() - t0 - s0), "result": result])
      next += 1
    }
    if let every = deepEvery, t - lastDeep >= every, t > 0 { lastDeep = t; _ = deepStep(app) }
    if t > pollMs { break }
    let st = nowMs()
    let (cbHit, cbErr) = hitTest(app, num(cb, "x"), num(cb, "y"))
    let cbRole = cbHit.flatMap { str($0, kAXRoleAttribute) } ?? "err\(cbErr)"
    let cbActions = cbHit.flatMap(actions) ?? []
    let (tfHit, tfErr) = hitTest(app, num(tf, "x"), num(tf, "y"))
    let tfRole = tfHit.flatMap { str($0, kAXRoleAttribute) } ?? "err\(tfErr)"
    var box = "none"
    if let tfHit {
      let (v, e) = param(tfHit, "AXBoundsForRange", rangeValue(k, 1))
      if let r = rect(v) { box = r.width > 0 && r.height > 0 ? "box" : "empty" } else { box = "err\(e)" }
    }
    sampleCost.append(nowMs() - st)
    samples += 1
    let tt = r1(nowMs() - t0)
    if firstInside == nil && cbRole == "AXCheckBox" { firstInside = tt }
    if firstTfRole == nil && (tfRole == "AXTextField" || tfRole == "AXStaticText") { firstTfRole = tt }
    if firstPress == nil && cbActions.contains("AXPress") { firstPress = tt }
    if firstBoxes == nil && box == "box" { firstBoxes = tt }
    let state = "\(cbRole)|\(cbActions.joined(separator: ","))|\(tfRole)|\(box)"
    if state != last { changes.append(["t": tt, "cb": cbRole, "cbActions": cbActions, "tf": tfRole, "box": box]); last = state }
    if firstPress != nil && firstBoxes != nil && next >= steps.count && tt > (spec["minPollMs"] as? NSNumber)?.doubleValue ?? 0 { break }
    pause(max(1, sampleMs - (nowMs() - st)))
  }
  let sorted = sampleCost.sorted()
  emit(["t0": t0, "before": before, "after": appState(app), "steps": done, "samples": samples, "changes": changes,
        "sampleCostMs": ["median": r1(sorted.isEmpty ? 0 : sorted[sorted.count / 2]), "max": r1(sorted.last ?? 0)],
        "firstCheckboxHit": firstInside ?? NSNull(), "firstFieldHit": firstTfRole ?? NSNull(),
        "firstPress": firstPress ?? NSNull(), "firstBoxes": firstBoxes ?? NSNull(), "notifications": notifications])

case "toolbar":
  let reload = spec["reload"] as? [String: Any] ?? [:], page = spec["page"] as? [String: Any] ?? [:]
  let t0 = nowMs()
  var out: [String: Any] = ["t0": t0]
  func hitWalk(_ p: [String: Any], _ key: String) -> AXUIElement? {
    let s = nowMs()
    let (hit, err) = hitTest(app, num(p, "x"), num(p, "y"))
    let hitMs = nowMs() - s
    guard let hit else { out[key] = ["at": r1(s - t0), "hitMs": r1(hitMs), "error": err]; return nil }
    let w = walk(hit)
    let desc = str(hit, kAXDescriptionAttribute) ?? str(hit, kAXTitleAttribute) ?? str(hit, kAXHelpAttribute)
    out[key] = ["at": r1(s - t0), "hitMs": r1(hitMs), "walkMs": r1(nowMs() - s - hitMs), "verdict": w.verdict, "roles": w.roles, "desc": desc ?? NSNull()]
    return w.window
  }
  _ = hitWalk(reload, "reloadBeforeRole")
  let rs = nowMs(); let roleErr = roleStep(app)
  out["role"] = ["at": r1(rs - t0), "ms": r1(nowMs() - rs), "error": roleErr]
  let window = hitWalk(reload, "reloadAfterRole")
  // The window the hit walked to, searched for an AXWebArea every 10 ms for up to 2 s.
  if let window {
    let ws = nowMs(); var tries = 0, first: [String: Any]? = nil, firstSearchMs = 0.0
    while nowMs() - ws < 2000 {
      let s = nowMs(); let r = containsWebArea(window); tries += 1
      if tries == 1 { firstSearchMs = nowMs() - s; out["firstSearch"] = ["found": r.found, "visited": r.visited, "ms": r1(firstSearchMs)] }
      if r.found { first = ["at": r1(nowMs() - t0), "sinceSearchStartMs": r1(nowMs() - ws), "tries": tries, "visited": r.visited, "lastSearchMs": r1(nowMs() - s)]; break }
      pause(10)
    }
    out["webAreaFound"] = first ?? ["found": false, "tries": tries]
  } else { out["webAreaFound"] = "no window from the walk" }
  _ = hitWalk(reload, "reloadAfterSearch")
  _ = hitWalk(page, "pageAfterSearch")
  out["totalMs"] = r1(nowMs() - t0)
  emit(out)

case "tbtimeline":
  // Round 2: one sample before the role read, then the role read, then every 5 ms for 600 ms: the page point's and the
  // toolbar point's hits, their walks, whether the hit has an AXWebArea among its descendants (2 levels), and the
  // window's web-area search; recording each change.
  let reload = spec["reload"] as? [String: Any] ?? [:], page = spec["page"] as? [String: Any] ?? [:]
  func webBelow(_ e: AXUIElement) -> Bool {
    for c in elements(attr(e, kAXChildrenAttribute)) {
      if str(c, kAXRoleAttribute) == "AXWebArea" { return true }
      for g in elements(attr(prepare(c), kAXChildrenAttribute)) where str(g, kAXRoleAttribute) == "AXWebArea" { return true }
    }
    return false
  }
  func probe(_ p: [String: Any]) -> [String: Any] {
    let (hit, err) = hitTest(app, num(p, "x"), num(p, "y"))
    guard let hit else { return ["error": err] }
    let w = walk(hit)
    return ["roles": w.roles, "verdict": w.verdict, "webBelow": webBelow(hit),
            "children": elements(attr(hit, kAXChildrenAttribute)).prefix(3).map { str($0, kAXRoleAttribute) ?? "?" }]
  }
  let t0 = nowMs()
  var rows: [[String: Any]] = [["t": 0, "phase": "beforeRole", "page": probe(page), "reload": probe(reload)]]
  let rs = nowMs(); let roleErr = roleStep(app)
  var last = ""
  while nowMs() - rs < 600 {
    let t = r1(nowMs() - t0)
    let pg = probe(page), rl = probe(reload)
    let win = elements(attr(app, kAXWindowsAttribute)).first.map { containsWebArea(prepare($0)).found } ?? false
    let key = "\(pg["roles"] ?? "")|\(pg["webBelow"] ?? "")|\(rl["roles"] ?? "")|\(win)"
    if key != last { rows.append(["t": t, "page": pg, "reload": rl, "windowHasWebArea": win]); last = key }
    pause(5)
  }
  emit(["roleAt": r1(rs - t0), "roleError": roleErr, "changes": rows])

case "locate":
  _ = roleStep(app)
  let start = nowMs()
  var out: [String: Any] = [:]
  while nowMs() - start < 3000 {
    if out["reload"] == nil, let b = findAll(app, limit: 3000, { e, r in r == "AXButton" && ([str(e, kAXDescriptionAttribute), str(e, kAXTitleAttribute), str(e, kAXHelpAttribute)].compactMap { $0 }.joined(separator: " ").lowercased().contains("reload")) }).first {
      out["reload"] = frameOf(b) ?? NSNull()
    }
    if out["checkbox"] == nil, let c = findAll(app, limit: 3000, { _, r in r == "AXCheckBox" }).first { out["checkbox"] = frameOf(c) ?? NSNull() }
    if out["reload"] != nil && out["checkbox"] != nil { break }
    pause(100)
  }
  out["window"] = elements(attr(app, kAXWindowsAttribute)).first.flatMap(frameOf) ?? NSNull()
  emit(out)

case "geom":
  // The pid's largest layer-0 window's CG bounds.
  func cgBounds() -> CGRect? {
    let list = (CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]) ?? []
    let mine = list.filter { ($0[kCGWindowOwnerPID as String] as? Int) == Int(pid) && ($0[kCGWindowLayer as String] as? Int) == 0 }
    let rects = mine.compactMap { w -> CGRect? in
      guard let b = w[kCGWindowBounds as String] as? NSDictionary else { return nil }
      return CGRect(dictionaryRepresentation: b as CFDictionary)
    }
    return rects.max { $0.width * $0.height < $1.width * $1.height }
  }
  func rectObj(_ r: CGRect?) -> Any { r.map { ["x": $0.minX, "y": $0.minY, "w": $0.width, "h": $0.height] } ?? NSNull() }
  func write(_ window: AXUIElement, _ name: String, _ value: AXValue, target: CGRect) -> [String: Any] {
    let s = nowMs()
    let err = AXUIElementSetAttributeValue(window, name as CFString, value)
    let writeMs = nowMs() - s
    var frames: [CGRect] = [], settledAt: Double? = nil
    while nowMs() - s < 1200 {
      if let b = cgBounds() {
        if frames.last != b { frames.append(b) }
        if settledAt == nil && b == target { settledAt = nowMs() - s }
      }
      usleep(4000)
    }
    return ["attr": name, "error": err.rawValue, "writeMs": r1(writeMs), "settledMs": settledAt.map(r1) ?? NSNull(),
            "distinctFrames": frames.count, "frames": frames.prefix(12).map { rectObj($0) }, "final": rectObj(frames.last),
            "axFrameAfter": elements(attr(app, kAXWindowsAttribute)).first.flatMap(frameOf) ?? NSNull()]
  }
  var phases: [[String: Any]] = []
  for phase in spec["phases"] as? [[String: Any]] ?? [] {
    var row: [String: Any] = ["label": phase["label"] ?? ""]
    row["steps"] = (phase["before"] as? [String] ?? []).map { ["do": $0, "result": runStep($0, pid: pid, app: app)] as [String: Any] }
    pause(num(phase, "waitMs"))
    row["app"] = appState(app).filter { $0.key != "names" }
    guard let window = elements(attr(app, kAXWindowsAttribute)).first.map(prepare), let start = cgBounds() else { row["error"] = "no window"; phases.append(row); continue }
    row["start"] = rectObj(start)
    // Move by (+40, +30), resize by (-60, -50), then both back.
    var p = CGPoint(x: start.minX + 40, y: start.minY + 30), sz = CGSize(width: start.width - 60, height: start.height - 50)
    var p0 = start.origin, s0 = start.size
    row["move"] = write(window, kAXPositionAttribute, AXValueCreate(.cgPoint, &p)!, target: CGRect(origin: p, size: start.size))
    row["resize"] = write(window, kAXSizeAttribute, AXValueCreate(.cgSize, &sz)!, target: CGRect(origin: p, size: sz))
    row["moveBack"] = write(window, kAXPositionAttribute, AXValueCreate(.cgPoint, &p0)!, target: CGRect(origin: p0, size: sz))
    row["resizeBack"] = write(window, kAXSizeAttribute, AXValueCreate(.cgSize, &s0)!, target: start)
    phases.append(row)
  }
  emit(["phases": phases])

default:
  emit(["error": "unknown command \(args[1])"])
  exit(2)
}
