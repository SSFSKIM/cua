import ApplicationServices
import Foundation
@testable import Engine

/// #519: a label slot holding a value that is no text (a CFNumber AXTitle), as an app may answer one.
var nonTextLabelSlot: CFTypeRef { 42 as CFNumber }

/// #500: a fake node's label as the walk records it from a batched read: each part's slot as the app answers it (kCFNull
/// for a `null` part, an error placeholder for a `failed` one, #519's `nonTextLabelSlot` for a `nonText` one, the text,
/// or kAXErrorNoValue when it has none), decoded by `AttributeRead.decode` into `ElementData` and kept by
/// `screenshotLabelsUnknown`, so a test's null or non-text slot enters at decode time. #520: the reply carries the role and
/// `subrole` too and is classified by #405's rule (`valueClassification`), a closed element's value left out of the
/// decoding and marked withheld, as the walk's `classifiedData` does, so `valueOpen` is the record's.
struct DecodedLabels {
  let title: String?
  let description: String?
  let value: CFTypeRef?
  let unread: Set<StalePointLabelPart>
  let null: Set<StalePointLabelPart>
  let nonText: Set<StalePointLabelPart>
  let valueOpen: Bool
}

func decodedLabels(role: String, title: String?, description: String?, value: String?, null: Set<StalePointLabelPart> = [],
                   failed: Set<StalePointLabelPart> = [], nonText: Set<StalePointLabelPart> = [], subrole: String? = nil) -> DecodedLabels {
  func errorSlot(_ code: AXError) -> Any { var code = code; return AXValueCreate(.axError, &code)! }
  var classifying = AttributeRead()
  classifying.decode(kAXRoleAttribute, role as CFString)
  classifying.decode(kAXSubroleAttribute, subrole.map { $0 as CFString as Any } ?? errorSlot(.noValue))
  let closed = valueClassification(classifying).closed
  var read = AttributeRead()
  for part in StalePointLabelPart.allCases where !(closed && part == .value) {
    let text = part == .title ? title : part == .description ? description : value
    let slot: Any = null.contains(part) ? kCFNull as Any : failed.contains(part) ? errorSlot(.cannotComplete)
      : nonText.contains(part) ? nonTextLabelSlot : text.map { $0 as CFString } ?? errorSlot(.noValue)
    read.decode(part.attribute, slot)
  }
  var data = ElementData(values: read.values, unreadable: read.unreadable, absent: read.absent, null: read.null)
  data.valueUnread = closed
  let labels = screenshotLabelsUnknown(role: role, data)
  return DecodedLabels(title: data.title, description: data.description, value: data.value, unread: labels.unread, null: labels.null,
                       nonText: labels.nonText, valueOpen: labels.valueOpen)
}
