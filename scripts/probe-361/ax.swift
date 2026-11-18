import ApplicationServices
import Foundation

// #361's hosted AX read-back probe (scripts/probe-361), compiled into an instrumented engine copy only, never a stock one.
// From type_text's paste route until 1.5 s after the operation answered, every 5 ms: the app's AXFocusedUIElement, its role,
// whether its label is the fixture's target field's (or the setup field's), and whether its AXValue equals the expected
// value the harness sent. One JSON line on stderr per request: unix-ms times, counts, roles and booleans; never a value.
final class Probe361Ax: @unchecked Sendable {
  let id: String, expected: String, label: String, setupLabel: String, pid: pid_t
  private let lock = NSLock()
  private var finishedAt: Double?
  let startedAt = Probe361Ax.now()
  static func now() -> Double { Date().timeIntervalSince1970 * 1000 }

  init(id: String, expected: String, label: String, setupLabel: String, pid: pid_t) {
    self.id = id; self.expected = expected; self.label = label; self.setupLabel = setupLabel; self.pid = pid
  }

  static func start(_ args: [String: Any], pid: pid_t) -> Probe361Ax? {
    guard let q = args["probe361Ax"] as? [String: Any], let id = q["id"] as? String, let expected = q["expected"] as? String,
          let label = q["label"] as? String, let setupLabel = q["setupLabel"] as? String else { return nil }
    let probe = Probe361Ax(id: id, expected: expected, label: label, setupLabel: setupLabel, pid: pid)
    Thread.detachNewThread { probe.run() }
    return probe
  }

  func finish() { lock.lock(); if finishedAt == nil { finishedAt = Probe361Ax.now() }; lock.unlock() }

  private func string(_ e: AXUIElement, _ name: String) -> String? {
    var v: CFTypeRef?
    guard AXUIElementCopyAttributeValue(e, name as CFString, &v) == .success, let v, CFGetTypeID(v) == CFStringGetTypeID() else { return nil }
    return (v as! CFString) as String
  }

  private func run() {
    let app = AXUIElementCreateApplication(pid)
    AXUIElementSetMessagingTimeout(app, 0.1)
    var samples = 0, equalSamples = 0, flipsBack = 0, targetEqualSamples = 0
    var firstEqualAt: Double?, firstTargetAt: Double?, lastSampleAt: Double?
    var equalAtFinish: Bool?, focusAtFinish: String?, lastEqual = false, lastFocus = "none"
    var focus: [String: Int] = [:], roles = Set<String>()
    let expectedUnits = Array(expected.utf16)  // compared by UTF-16 units, as #354's read-back compares
    while true {
      let t = Probe361Ax.now()
      lock.lock(); let finished = finishedAt; lock.unlock()
      if let finished, t > finished + 1500 { break }
      if t > startedAt + 12_000 { break }
      samples += 1
      var kind = "none", equal = false
      var ref: CFTypeRef?
      if AXUIElementCopyAttributeValue(app, kAXFocusedUIElementAttribute as CFString, &ref) == .success, let ref,
         CFGetTypeID(ref) == AXUIElementGetTypeID() {
        let element = ref as! AXUIElement
        AXUIElementSetMessagingTimeout(element, 0.1)
        let role = string(element, kAXRoleAttribute)
        roles.insert(role.map { $0.range(of: "^AX[A-Za-z]{1,40}$", options: .regularExpression) != nil ? $0 : "other" } ?? "unreadable")
        let names = [string(element, kAXDescriptionAttribute), string(element, kAXTitleAttribute)]
        kind = names.contains(label) ? "target" : names.contains(setupLabel) ? "setup" : "other"
        if role != "AXSecureTextField", let value = string(element, kAXValueAttribute) { equal = Array(value.utf16) == expectedUnits }
      }
      let readAt = Probe361Ax.now()  // when the sample's last read (its AXValue) returned
      focus[kind, default: 0] += 1
      if kind == "target" && firstTargetAt == nil { firstTargetAt = readAt }
      if equal {
        equalSamples += 1
        if kind == "target" { targetEqualSamples += 1 }
        if firstEqualAt == nil { firstEqualAt = readAt }
      } else if lastEqual { flipsBack += 1 }
      if finished != nil && equalAtFinish == nil { equalAtFinish = equal; focusAtFinish = kind }
      lastEqual = equal; lastFocus = kind; lastSampleAt = readAt
      usleep(5_000)
    }
    lock.lock(); let finished = finishedAt; lock.unlock()
    let record: [String: Any] = ["id": id, "samples": samples, "equalSamples": equalSamples, "targetEqualSamples": targetEqualSamples,
      "flipsBack": flipsBack, "startedAt": startedAt, "finishedAt": finished ?? NSNull(), "lastSampleAt": lastSampleAt ?? NSNull(),
      "firstEqualAt": firstEqualAt ?? NSNull(), "firstTargetAt": firstTargetAt ?? NSNull(),
      "equalAtFinish": equalAtFinish ?? NSNull(), "focusAtFinish": focusAtFinish ?? NSNull(), "equalAtEnd": lastEqual, "focusAtEnd": lastFocus,
      "focus": focus, "roles": roles.sorted()]
    if let data = try? JSONSerialization.data(withJSONObject: ["probe361Ax": record], options: [.sortedKeys]) {
      FileHandle.standardError.write(data + Data("\n".utf8))
    }
  }
}
