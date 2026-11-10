// Hosted-only check of the real audit accumulator. Calls no AX API and reads no field or value.
// Compile together with audit.swift; audit-check.mjs checks the emitted records and the privacy verdict.
import Foundation

@main
struct Probe354AuditCheck {
  static func main() {
    let audit = Probe354Audit.shared
    // Untagged traffic must not contaminate the next request.
    audit.read(["AXValue", "AXSelectedTextRange"])
    let clean = audit.begin(["probe354Audit": "zero-read-control"])
    audit.read(["AXRole", "AXSubrole"])
    audit.finish(clean)

    // Negative control: internal selection reads, but no text read and no returned value/range.
    let ranges = audit.begin(["probe354Audit": "range-only-negative-control"])
    audit.read(["AXSelectedTextRange"])
    audit.read(["AXRole", "AXSelectedTextRanges", "AXSelectedTextRange"])
    audit.finish(ranges)

    let text = audit.begin(["probe354Audit": "text-read-control"])
    audit.read(["AXValue", "AXSelectedText", "AXAttributedValue", "AXStringForRange", "AXAttributedStringForRange"])
    audit.finish(text)
  }
}
