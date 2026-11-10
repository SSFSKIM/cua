// Hosted scratch-build audit only. Counts attempted text-bearing AX reads during an explicitly tagged type_text.
// Makes no AX reads of its own, keeps no values, does not alter any return or error, and never implements a reader.
import ApplicationServices
import Foundation

final class Probe354Audit: @unchecked Sendable {
  static let shared = Probe354Audit()
  private let lock = NSLock()
  private var id: String?
  private var counts: [String: Int] = [:]

  func begin(_ args: [String: Any]) -> String? {
    guard let tag = args["probe354Audit"] as? String else { return nil }
    lock.lock(); defer { lock.unlock() }
    precondition(id == nil, "one audited engine request at a time")
    id = tag; counts = [:]
    return tag
  }
  func read(_ names: [String]) {
    lock.lock(); defer { lock.unlock() }
    guard id != nil else { return }
    for name in names where ["AXValue", "AXSelectedText", "AXAttributedValue", "AXStringForRange", "AXAttributedStringForRange"].contains(name) {
      counts[name, default: 0] += 1
    }
  }
  func finish(_ tag: String?) {
    guard let tag else { return }
    lock.lock()
    let result: [String: Any] = ["id": tag, "textReadAttempts": counts.values.reduce(0, +), "byAttribute": counts]
    id = nil; counts = [:]
    lock.unlock()
    if let data = try? JSONSerialization.data(withJSONObject: ["probe354Audit": result], options: [.sortedKeys]) {
      FileHandle.standardError.write(data + Data([10]))
    }
  }
}

func probe354CopyAttributeValue(_ element: AXUIElement, _ name: CFString, _ out: UnsafeMutablePointer<CFTypeRef?>) -> AXError {
  Probe354Audit.shared.read([name as String])
  return AXUIElementCopyAttributeValue(element, name, out)
}
func probe354CopyMultipleAttributeValues(_ element: AXUIElement, _ names: CFArray, _ options: AXCopyMultipleAttributeOptions, _ out: UnsafeMutablePointer<CFArray?>) -> AXError {
  Probe354Audit.shared.read((names as? [String]) ?? [])
  return AXUIElementCopyMultipleAttributeValues(element, names, options, out)
}
func probe354CopyParameterizedAttributeValue(_ element: AXUIElement, _ name: CFString, _ parameter: CFTypeRef, _ out: UnsafeMutablePointer<CFTypeRef?>) -> AXError {
  Probe354Audit.shared.read([name as String])
  return AXUIElementCopyParameterizedAttributeValue(element, name, parameter, out)
}
