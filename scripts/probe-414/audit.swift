// Hosted scratch-build audit for the #414 qualification. Records the ORDER and TIMING of the Accessibility calls a tagged
// type_text issues (reads, writes, actions, posted events, named phases) so plain and concealed schedules can be compared.
// It makes no AX request of its own, never looks at a returned value (the one exception: the string of an AXRole or AXSubrole
// answer, from a single-attribute call or from those two named slots of a batch, kept only when it is a public AX role
// constant; the wrapper hands over no other answer or slot, and the name decides before anything is cast or inspected), keeps
// no value, text, range, marker, byte or length, and does not alter any return or error. Counts of calls, attribute NAMES, element aliases, outcomes and clocks are all it holds.
// Of the posted events only the first is recorded (the pre-input boundary): a count of the rest would show how much was typed.
// Adapted from the #395 qualification. This recorder has no underlying #354 hooks.
import ApplicationServices
import CoreGraphics
import Foundation

final class Probe395Audit: @unchecked Sendable {
  static let shared = Probe395Audit()
  // Api codes of a schedule entry. Mirrored in audit-schedule.mjs (a test keeps the two equal).
  static let apiSingle = 0, apiBatch = 1, apiParam = 2, apiWrite = 3, apiAction = 4, apiEvent = 5
  static let apiPhaseBegin = 6, apiPhaseEnd = 7, apiNames = 8, apiActionNames = 9, apiHit = 10
  private let lock = NSLock()
  private var id: String?
  private var owner: pthread_t?
  private var startNs: UInt64 = 0
  private var entries: [[Int]] = []
  private var names: [String] = []
  private var nameIndex: [String: Int] = [:]
  private var aliases: [AXUIElement] = []
  private var roles: [Int: String] = [:]
  private var subroles: [Int: String] = [:]
  private var dropped = 0
  private var aliasOverflow = 0
  private var eventSeen = false
  private var offThread = 0
  private var offThreadCounts: [String: Int] = [:]
  private var overheadNs: UInt64 = 0
  private var overlaps = 0
  private let entryCap = 60000, aliasCap = 1024

  static func now() -> UInt64 { DispatchTime.now().uptimeNanoseconds }

  func begin(_ args: [String: Any]) -> String? {
    guard let tag = args["probe395Audit"] as? String else { return nil }
    lock.lock(); defer { lock.unlock() }
    if id != nil { overlaps += 1; return nil }
    id = tag; owner = pthread_self(); startNs = Probe395Audit.now()
    entries = []; names = []; nameIndex = [:]; aliases = []; roles = [:]; subroles = [:]
    dropped = 0; aliasOverflow = 0; eventSeen = false; offThread = 0; offThreadCounts = [:]; overheadNs = 0
    return tag
  }

  // A name is a constant of the AX vocabulary; anything else is not recorded as itself.
  private func clean(_ name: String) -> String {
    let ok = !name.isEmpty && name.utf8.count <= 160 && name.utf8.allSatisfy {
      ($0 >= 48 && $0 <= 57) || ($0 >= 65 && $0 <= 90) || ($0 >= 97 && $0 <= 122) || $0 == 95 || $0 == 43
    }
    return ok ? name : "unnamed"
  }
  private func nameRef(_ name: String) -> Int {
    if let known = nameIndex[name] { return known }
    names.append(name); nameIndex[name] = names.count - 1
    return names.count - 1
  }
  private func alias(_ element: AXUIElement?) -> Int {
    guard let element else { return -1 }
    for (i, known) in aliases.enumerated() where CFEqual(known, element) { return i }
    if aliases.count >= aliasCap { aliasOverflow += 1; return -2 }
    aliases.append(element)
    return aliases.count - 1
  }
  private func outcome(_ error: AXError?) -> Int {
    guard let error else { return 0 }
    switch error {
    case .success: return 0
    case .noValue, .attributeUnsupported, .parameterizedAttributeUnsupported, .actionUnsupported, .notImplemented: return 1
    default: return 2
    }
  }
  private func isRoleConstant(_ s: String) -> Bool {
    s.hasPrefix("AX") && s.utf8.count <= 42 && s.utf8.allSatisfy { ($0 >= 65 && $0 <= 90) || ($0 >= 97 && $0 <= 122) }
  }

  /// One finished call. `name` is a single attribute name, a "+"-joined batch, an action, a key label or a phase name.
  func record(api: Int, name: String, element: AXUIElement?, error: AXError?, started: UInt64, ended: UInt64, roleResult: CFTypeRef? = nil,
              slotRoles: [(String, String)] = []) {
    let t0 = Probe395Audit.now()
    lock.lock(); defer { lock.unlock() }
    guard id != nil else { return }
    let mine = owner.map { pthread_equal($0, pthread_self()) != 0 } ?? false
    let label = clean(name)
    if api == Probe395Audit.apiEvent {
      // The first event on the request's own thread is the boundary; every later one, and any from another thread, is not counted.
      if !mine || eventSeen { return }
      eventSeen = true
    }
    if !mine { offThread += 1; offThreadCounts[label, default: 0] += 1; return }
    if entries.count >= entryCap { dropped += 1 } else {
      let a = alias(element)
      entries.append([api, nameRef(label), a, outcome(error), Int(started &- startNs) / 1000, Int(ended &- started) / 1000])
      // The attribute name decides before the answer is touched: no other attribute's answer is cast, compared or looked at.
      if api == Probe395Audit.apiSingle, a >= 0, error == .success, label == "AXRole" || label == "AXSubrole",
         let roleResult, CFGetTypeID(roleResult) == CFStringGetTypeID() {
        let s = roleResult as! String
        if isRoleConstant(s) { if label == "AXRole" { roles[a] = s } else { subroles[a] = s } }
      }
      // A batch's role and subrole slots, named by the batch's own attribute list; no other slot was handed over.
      if api == Probe395Audit.apiBatch, a >= 0, error == .success {
        for (slot, s) in slotRoles where isRoleConstant(s) { if slot == "AXRole" { roles[a] = s } else { subroles[a] = s } }
      }
    }
    overheadNs &+= Probe395Audit.now() &- t0
  }

  func eventPosted(_ event: CGEvent) {
    let label: String
    switch event.type {
    case .keyDown: label = "keyDown"
    case .keyUp: label = "keyUp"
    case .flagsChanged: label = "flagsChanged"
    case .leftMouseDown: label = "leftMouseDown"
    case .leftMouseUp: label = "leftMouseUp"
    case .rightMouseDown: label = "rightMouseDown"
    case .rightMouseUp: label = "rightMouseUp"
    case .mouseMoved: label = "mouseMoved"
    case .scrollWheel: label = "scrollWheel"
    default: label = "otherEvent"
    }
    let t = Probe395Audit.now()
    record(api: Probe395Audit.apiEvent, name: label, element: nil, error: nil, started: t, ended: t)
  }

  /// A named phase of production code, bracketed by a begin and an end entry (hooks audit-patch.mjs inserts where an anchor is known).
  func phaseBegin(_ name: String) -> UInt64 {
    let t = Probe395Audit.now()
    record(api: Probe395Audit.apiPhaseBegin, name: name, element: nil, error: nil, started: t, ended: t)
    return t
  }
  func phaseEnd(_ name: String, _ began: UInt64) {
    record(api: Probe395Audit.apiPhaseEnd, name: name, element: nil, error: nil, started: began, ended: Probe395Audit.now())
  }

  /// The focused-field walk stopped at its node bound (`nodes`) or its time bound: a zero-length phase named for the bound, inside the
  /// walk phase. audit-patch.mjs calls it from the bound's own branch after the engine has decided, so it reads no clock to decide
  /// (the engine's own check runs first and unchanged) and records only which bound it was.
  func walkCap(nodes: Bool) {
    let name = nodes ? "walkCapNodes" : "walkCapTime"
    phaseEnd(name, phaseBegin(name))
  }

  func finish(_ tag: String?) {
    guard let tag else { return }
    lock.lock()
    let end = Probe395Audit.now()
    let record: [String: Any] = ["v": 1, "id": tag, "spanNs": Int(end &- startNs), "overheadNs": Int(overheadNs), "names": names, "e": entries,
      "dropped": dropped, "aliasOverflow": aliasOverflow, "aliases": aliases.count, "offThread": offThread, "offThreadCounts": offThreadCounts,
      "overlaps": overlaps, "roles": Dictionary(uniqueKeysWithValues: roles.map { (String($0.key), $0.value) }),
      "subroles": Dictionary(uniqueKeysWithValues: subroles.map { (String($0.key), $0.value) })]
    id = nil; owner = nil; entries = []; names = []; nameIndex = [:]; aliases = []; roles = [:]; subroles = [:]; overlaps = 0; eventSeen = false
    lock.unlock()
    if let data = try? JSONSerialization.data(withJSONObject: ["probe395Audit": record], options: [.sortedKeys]) {
      FileHandle.standardError.write(data + Data([10]))
    }
  }
}

// Each wrapper times the real call (unchanged) and records only its name.
func probe395CopyAttributeValue(_ element: AXUIElement, _ name: CFString, _ out: UnsafeMutablePointer<CFTypeRef?>) -> AXError {
  let t0 = Probe395Audit.now()
  let code = AXUIElementCopyAttributeValue(element, name, out)
  // Only a role or subrole answer is handed to the recorder; the answer to any other attribute (AXValue among them) never leaves this call.
  let roleAnswer = code == .success && ((name as String) == "AXRole" || (name as String) == "AXSubrole")
  Probe395Audit.shared.record(api: Probe395Audit.apiSingle, name: name as String, element: element, error: code, started: t0, ended: Probe395Audit.now(),
                              roleResult: roleAnswer ? out.pointee : nil)
  return code
}
func probe395CopyMultipleAttributeValues(_ element: AXUIElement, _ names: CFArray, _ options: AXCopyMultipleAttributeOptions, _ out: UnsafeMutablePointer<CFArray?>) -> AXError {
  let t0 = Probe395Audit.now()
  let code = AXUIElementCopyMultipleAttributeValues(element, names, options, out)
  let list = (names as? [String]) ?? []
  // Only the slots the request itself named AXRole or AXSubrole are fetched from the reply, by position; every other slot stays unread.
  var slots: [(String, String)] = []
  if code == .success, let answer = out.pointee, CFArrayGetCount(answer) == list.count {
    for (i, name) in list.enumerated() where name == "AXRole" || name == "AXSubrole" {
      guard let raw = CFArrayGetValueAtIndex(answer, i) else { continue }
      let item = Unmanaged<AnyObject>.fromOpaque(raw).takeUnretainedValue()
      if CFGetTypeID(item) == CFStringGetTypeID(), let s = item as? String { slots.append((name, s)) }
    }
  }
  Probe395Audit.shared.record(api: Probe395Audit.apiBatch, name: list.joined(separator: "+"), element: element, error: code, started: t0, ended: Probe395Audit.now(),
                              slotRoles: slots)
  return code
}
func probe395CopyParameterizedAttributeValue(_ element: AXUIElement, _ name: CFString, _ parameter: CFTypeRef, _ out: UnsafeMutablePointer<CFTypeRef?>) -> AXError {
  let t0 = Probe395Audit.now()
  let code = AXUIElementCopyParameterizedAttributeValue(element, name, parameter, out)
  Probe395Audit.shared.record(api: Probe395Audit.apiParam, name: name as String, element: element, error: code, started: t0, ended: Probe395Audit.now())
  return code
}
func probe395SetAttributeValue(_ element: AXUIElement, _ name: CFString, _ value: CFTypeRef) -> AXError {
  let t0 = Probe395Audit.now()
  let code = AXUIElementSetAttributeValue(element, name, value)
  Probe395Audit.shared.record(api: Probe395Audit.apiWrite, name: name as String, element: element, error: code, started: t0, ended: Probe395Audit.now())
  return code
}
func probe395PerformAction(_ element: AXUIElement, _ action: CFString) -> AXError {
  let t0 = Probe395Audit.now()
  let code = AXUIElementPerformAction(element, action)
  Probe395Audit.shared.record(api: Probe395Audit.apiAction, name: action as String, element: element, error: code, started: t0, ended: Probe395Audit.now())
  return code
}
func probe395CopyAttributeNames(_ element: AXUIElement, _ out: UnsafeMutablePointer<CFArray?>) -> AXError {
  let t0 = Probe395Audit.now()
  let code = AXUIElementCopyAttributeNames(element, out)
  Probe395Audit.shared.record(api: Probe395Audit.apiNames, name: "AttributeNames", element: element, error: code, started: t0, ended: Probe395Audit.now())
  return code
}
func probe395CopyActionNames(_ element: AXUIElement, _ out: UnsafeMutablePointer<CFArray?>) -> AXError {
  let t0 = Probe395Audit.now()
  let code = AXUIElementCopyActionNames(element, out)
  Probe395Audit.shared.record(api: Probe395Audit.apiActionNames, name: "ActionNames", element: element, error: code, started: t0, ended: Probe395Audit.now())
  return code
}
func probe395CopyElementAtPosition(_ element: AXUIElement, _ x: Float, _ y: Float, _ out: UnsafeMutablePointer<AXUIElement?>) -> AXError {
  let t0 = Probe395Audit.now()
  let code = AXUIElementCopyElementAtPosition(element, x, y, out)
  Probe395Audit.shared.record(api: Probe395Audit.apiHit, name: "ElementAtPosition", element: element, error: code, started: t0, ended: Probe395Audit.now())
  return code
}
