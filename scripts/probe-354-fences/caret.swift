// Scratch-build-only observer-effect diagnostic. Never reads AXValue or keeps field text.
// The optional poll hook is after the production role/subrole guards. Count probes are ADDED diagnostics.
import ApplicationServices
import Foundation

func probe354CaretNow() -> Double { Date().timeIntervalSince1970 * 1000 }
func probe354CaretRange(_ raw: CFTypeRef?, _ code: AXError) -> [String: Any] {
  var result: [String: Any] = ["axError": code.rawValue, "shape": "missing", "range": NSNull()]
  guard let raw else { return result }
  guard CFGetTypeID(raw) == AXValueGetTypeID() else { result["shape"] = "wrongType"; return result }
  let value = raw as! AXValue
  if AXValueGetType(value) == .cfRange {
    var range = CFRange(location: 0, length: 0)
    if AXValueGetValue(value, .cfRange, &range) {
      result["shape"] = "range"
      // Decimal strings retain CFIndex exactly, including an out-of-safe-JS-integer sentinel.
      result["range"] = ["location": String(range.location), "length": String(range.length)]
      return result
    }
  } else if AXValueGetType(value) == .axError {
    var embedded = AXError.success
    if AXValueGetValue(value, .axError, &embedded) { result["shape"] = "axError"; result["embeddedAXError"] = embedded.rawValue; return result }
  }
  result["shape"] = "wrongType"; return result
}
func probe354CaretCount(_ raw: CFTypeRef?, _ code: AXError) -> [String: Any] {
  var result: [String: Any] = ["axError": code.rawValue, "shape": "missing", "count": NSNull()]
  guard let raw else { return result }
  guard CFGetTypeID(raw) == CFNumberGetTypeID() else { result["shape"] = "wrongType"; return result }
  var count: Int64 = 0
  if CFNumberGetValue(raw as! CFNumber, .sInt64Type, &count) { result["shape"] = "number"; result["count"] = String(count) }
  else { result["shape"] = "wrongType" }
  return result
}

final class Probe354CaretTrace: @unchecked Sendable {
  static let shared = Probe354CaretTrace()
  static let readerHook = "__READER_HOOK__"
  private let lock = NSLock()
  private var id: String?
  private var startedAt: Double = 0
  private var typingStartedAt: Double?
  private var typingCompleteAt: Double?
  private var polls: [[String: Any]] = []
  private var outsidePollRanges: [[String: Any]] = []
  private var current: Int?

  func begin(_ args: [String: Any]) -> String? {
    guard args["probe354CaretTrace"] as? Bool == true, let tag = args["probe354Audit"] as? String else { return nil }
    lock.lock(); defer { lock.unlock() }
    precondition(id == nil, "one caret diagnostic at a time")
    id = tag; startedAt = probe354CaretNow(); typingStartedAt = nil; typingCompleteAt = nil; polls = []; outsidePollRanges = []; current = nil
    return tag
  }
  func typingStarted() {
    lock.lock(); defer { lock.unlock() }; guard id != nil else { return }; typingStartedAt = probe354CaretNow()
  }
  func typingComplete() {
    lock.lock(); defer { lock.unlock() }; guard id != nil else { return }; typingCompleteAt = probe354CaretNow()
  }
  func beginPoll(_ field: AnyObject, readerRead: Int) -> Int? {
    lock.lock(); guard id != nil else { lock.unlock(); return nil }
    let index = polls.count
    polls.append(["index": index + 1, "readerRead": readerRead, "startedAt": probe354CaretNow(), "endedAt": NSNull(), "outcome": "none", "rangeRead": false, "ranges": [[String: Any]](),
      "characterCount": ["source": "diagnostic-added", "attribute": "AXNumberOfCharacters", "queried": false, "startedAt": NSNull(), "endedAt": NSNull(), "axError": NSNull(), "shape": "not-probed", "count": NSNull()]])
    current = index; lock.unlock()
    // No extra role/value reader: the tightly anchored caller has just passed the production guards.
    if CFGetTypeID(field as CFTypeRef) == AXUIElementGetTypeID() {
      let at = probe354CaretNow(); var raw: CFTypeRef?
      // Deliberately direct, not interposed or counted as a production attribute request.
      let code = AXUIElementCopyAttributeValue(field as! AXUIElement, kAXNumberOfCharactersAttribute as CFString, &raw)
      var observation = probe354CaretCount(raw, code)
      observation["source"] = "diagnostic-added"; observation["attribute"] = "AXNumberOfCharacters"; observation["queried"] = true
      observation["startedAt"] = at; observation["endedAt"] = probe354CaretNow()
      lock.lock(); polls[index]["characterCount"] = observation; lock.unlock()
    }
    return index + 1
  }
  func endPoll(_ token: Int?, outcome: String) {
    guard let token else { return }; lock.lock(); defer { lock.unlock() }
    guard id != nil, polls.indices.contains(token - 1) else { return }
    polls[token - 1]["endedAt"] = probe354CaretNow(); polls[token - 1]["outcome"] = outcome; current = nil
  }
  func rangeReply(_ name: String, raw: CFTypeRef?, code: AXError, api: String, started: Double, ended: Double) {
    guard name == "AXSelectedTextRange" else { return }
    lock.lock(); defer { lock.unlock() }; guard id != nil else { return }
    var observation = probe354CaretRange(raw, code)
    observation["source"] = "production"; observation["api"] = api; observation["attribute"] = name
    observation["startedAt"] = started; observation["endedAt"] = ended
    observation["pollIndex"] = NSNull()
    if let current {
      observation["pollIndex"] = current + 1
      var ranges = polls[current]["ranges"] as? [[String: Any]] ?? []; ranges.append(observation)
      polls[current]["ranges"] = ranges; polls[current]["rangeRead"] = true
    } else { outsidePollRanges.append(observation) }
  }
  func batchReplies(_ names: [String], raw: CFArray?, code: AXError, started: Double, ended: Double) {
    let values = (raw as? [AnyObject]) ?? []
    for (index, name) in names.enumerated() where name == "AXSelectedTextRange" {
      let value: CFTypeRef? = values.indices.contains(index) ? values[index] as CFTypeRef : nil
      rangeReply(name, raw: value, code: code, api: "batch", started: started, ended: ended)
    }
  }
  func finish(_ tag: String?) {
    guard let tag else { return }; lock.lock()
    var result: [String: Any] = ["id": tag, "readerHook": Self.readerHook, "startedAt": startedAt,
      "typingStartedAt": NSNull(), "typingCompleteAt": NSNull(), "endedAt": probe354CaretNow(), "polls": polls, "outsidePollRanges": outsidePollRanges]
    if let typingStartedAt { result["typingStartedAt"] = typingStartedAt }
    if let typingCompleteAt { result["typingCompleteAt"] = typingCompleteAt }
    id = nil; current = nil; polls = []; outsidePollRanges = []; lock.unlock()
    if let data = try? JSONSerialization.data(withJSONObject: ["probe354CaretTrace": result], options: [.sortedKeys]) { FileHandle.standardError.write(data + Data([10])) }
  }
}
