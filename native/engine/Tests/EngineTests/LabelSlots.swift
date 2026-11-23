import ApplicationServices
import Foundation
@testable import Engine

/// #519: a label slot holding a value that is no text (a CFNumber AXTitle), as an app may answer one.
var nonTextLabelSlot: CFTypeRef { 42 as CFNumber }

/// #500: a fake node's label as the walk records it from a batched read: each part's slot as the app answers it (kCFNull
/// for a `null` part, an error placeholder for a `failed` one, #519's `nonTextLabelSlot` for a `nonText` one, the text,
/// or kAXErrorNoValue when it has none), decoded by `AttributeRead.decode` into `ElementData` and kept by
/// `screenshotLabelsUnknown`, so a test's null or non-text slot enters at decode time.
struct DecodedLabels {
  let title: String?
  let description: String?
  let value: CFTypeRef?
  let unread: Set<StalePointLabelPart>
  let null: Set<StalePointLabelPart>
  let nonText: Set<StalePointLabelPart>
}

func decodedLabels(role: String, title: String?, description: String?, value: String?, null: Set<StalePointLabelPart> = [],
                   failed: Set<StalePointLabelPart> = [], nonText: Set<StalePointLabelPart> = []) -> DecodedLabels {
  func errorSlot(_ code: AXError) -> Any { var code = code; return AXValueCreate(.axError, &code)! }
  var read = AttributeRead()
  for part in StalePointLabelPart.allCases {
    let text = part == .title ? title : part == .description ? description : value
    let slot: Any = null.contains(part) ? kCFNull as Any : failed.contains(part) ? errorSlot(.cannotComplete)
      : nonText.contains(part) ? nonTextLabelSlot : text.map { $0 as CFString } ?? errorSlot(.noValue)
    read.decode(part.attribute, slot)
  }
  let data = ElementData(values: read.values, unreadable: read.unreadable, absent: read.absent, null: read.null)
  let labels = screenshotLabelsUnknown(role: role, data)
  return DecodedLabels(title: data.title, description: data.description, value: data.value, unread: labels.unread, null: labels.null,
                       nonText: labels.nonText)
}

/// An error placeholder as a batched read answers one in a failed or absent attribute's slot.
func axErrorSlot(_ code: AXError) -> Any { var code = code; return AXValueCreate(.axError, &code)! }

/// #520: an AXStaticText's value read now as the live seam reads it (`stalePointClassifiedValueRead` over
/// `classifiedRead`): one batch of the role, the subrole and AXValue, each slot as the app answers it, decoded by
/// `AttributeRead.decode`; nil `slots` for a request that fails whole.
func batchValueRead(role: Any = "AXStaticText" as CFString, subrole: Any = axErrorSlot(.noValue), value: Any?) -> StalePointValueRead {
  stalePointClassifiedValueRead(classifiedRead([kAXValueAttribute]) { names in
    guard let value else { return nil }
    let slots: [String: Any] = [kAXRoleAttribute: role, kAXSubroleAttribute: subrole, kAXValueAttribute: value]
    var read = AttributeRead()
    for name in names { read.decode(name, slots[name]) }
    return read
  })
}
