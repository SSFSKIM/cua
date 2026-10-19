import ApplicationServices
import Foundation

// The attribute fetch (the spec's Design, "Observation (skyshot)"; R/F-helper-logic.md §1.1–1.3): the public
// `AXUIElementCopyMultipleAttributeValues` per element, then `AXUIElementCopyActionNames`. The private batched
// `_AXUIElementCopyHierarchy` the vendor prefetches with lost to it on every scene in M0 and is not resolved.

/// The attributes read per element: the vendor's 20 in its order (F §1.2), then what the Interfaces' Node adds
/// (AXSelectable, AXDOMClassList), the settle's busy signs (AXElementBusy, AXLoaded; F §8.4), position, size and
/// children. One list for the settle's busy walk and the observation's walk, so the observation can read the tree the
/// settle fetched.
let observedAttributes: [String] = [
  "AXRole", "AXSubrole", "AXRoleDescription", "AXTitle", "AXDescription", "AXValue", "AXValueDescription",
  "AXPlaceholderValue", "AXNumberOfCharacters", "AXHelp", "AXIdentifier", "AXSelected", "AXFocused", "AXEnabled",
  "AXDisclosing", "AXURL", "AXTraits", "AXServesAsTitleForUIElements", "AXRowIndexRange", "AXColumnIndexRange",
  "AXSelectable", "AXDOMClassList", "AXElementBusy", "AXLoaded", "AXTextualContext", "AXPosition", "AXSize", "AXChildren",
]

/// What the walk knows of one element. Every optional is nil when the element does not carry the attribute.
struct ElementData {
  var role: String
  var subrole: String?
  var roleDescription: String?
  var title: String?
  var description: String?
  var value: CFTypeRef?
  var valueDescription: String?
  var placeholder: String?
  var numberOfCharacters: Int?
  var help: String?
  var identifier: String?
  var url: String?
  var traits: Int64?
  /// The elements this one is the title of (AXServesAsTitleForUIElements); the walk maps them to emitted indexes.
  var servesAsTitleFor: [AXUIElement]?
  var rowIndexRange: [Int]?
  var columnIndexRange: [Int]?
  var selected: Bool?
  var focused: Bool?
  var enabled: Bool?
  var disclosing: Bool?
  var selectable: Bool?
  var domClassList: [String]?
  var elementBusy: Bool?
  var loaded: Bool?
  /// AXTextualContext (the vendor's Markdown predicate skips `AXTextualContextSourceCode`).
  var textualContext: String?
  var frame: CGRect?
  /// AXChildren, in order.
  var children: [AXUIElement]

  /// Decodes one element's attribute values, keyed by attribute name.
  init(values: [String: CFTypeRef]) {
    func string(_ name: String) -> String? { values[name].flatMap(stringValue) }
    func flag(_ name: String) -> Bool? { bool(values[name]) }
    role = string("AXRole") ?? "AXUnknown"
    subrole = string("AXSubrole")
    roleDescription = string("AXRoleDescription")
    title = string("AXTitle")
    description = string("AXDescription")
    value = values["AXValue"]
    valueDescription = string("AXValueDescription")
    placeholder = string("AXPlaceholderValue")
    numberOfCharacters = values["AXNumberOfCharacters"].flatMap { CFGetTypeID($0) == CFNumberGetTypeID() ? ($0 as! NSNumber).intValue : nil }
    help = string("AXHelp")
    identifier = string("AXIdentifier")
    url = values["AXURL"].flatMap { CFGetTypeID($0) == CFURLGetTypeID() ? bounded(($0 as! URL).absoluteString) : stringValue($0) }
    traits = values["AXTraits"].flatMap { CFGetTypeID($0) == CFNumberGetTypeID() ? ($0 as! NSNumber).int64Value : nil }
    servesAsTitleFor = values["AXServesAsTitleForUIElements"].map(elementList)
    rowIndexRange = indexRange(values["AXRowIndexRange"])
    columnIndexRange = indexRange(values["AXColumnIndexRange"])
    selected = flag("AXSelected")
    focused = flag("AXFocused")
    enabled = flag("AXEnabled")
    disclosing = flag("AXDisclosing")
    selectable = flag("AXSelectable")
    textualContext = string("AXTextualContext")
    elementBusy = flag("AXElementBusy")
    loaded = flag("AXLoaded")
    domClassList = values["AXDOMClassList"].flatMap { CFGetTypeID($0) == CFArrayGetTypeID() ? ($0 as! [AnyObject]).compactMap { $0 as? String }.map(bounded) : nil }
    frame = point(values["AXPosition"]).flatMap { origin in size(values["AXSize"]).map { CGRect(origin: origin, size: $0) } }
    children = elementList(values["AXChildren"])
  }
}

private func stringValue(_ value: CFTypeRef) -> String? {
  let type = CFGetTypeID(value)
  if type == CFStringGetTypeID() { return bounded(value as! String) }
  if type == CFAttributedStringGetTypeID() { return bounded((value as! NSAttributedString).string) }
  return nil
}

/// An AXRowIndexRange or AXColumnIndexRange as `[lower, upper]`, the half-open bounds of its CFRange.
private func indexRange(_ value: CFTypeRef?) -> [Int]? {
  guard let value, CFGetTypeID(value) == AXValueGetTypeID() else { return nil }
  var range = CFRange()
  guard AXValueGetValue(value as! AXValue, .cfRange, &range) else { return nil }
  return [range.location, range.location + range.length]
}

/// Running costs of one walk's fetches, by phase, and the counts the spike reads.
final class FetchCosts {
  var ms: [String: Double] = [:]
  var counts: [String: Int] = [:]

  func time<T>(_ phase: String, _ body: () throws -> T) rethrows -> T {
    let start = monotonicMilliseconds()
    defer { ms[phase, default: 0] += monotonicMilliseconds() - start }
    return try body()
  }

  func count(_ name: String, _ by: Int = 1) { counts[name, default: 0] += by }

  func merge(_ other: FetchCosts) {
    for (phase, value) in other.ms { ms[phase, default: 0] += value }
    for (name, value) in other.counts { counts[name, default: 0] += value }
  }

  func reset() {
    ms = [:]
    counts = [:]
  }
}

/// Where a walk reads elements from, for one observation: what it read is kept, so the settle's busy walk and the
/// observation's walk that follows it read each element once (F §8.5). The overridable `read…` methods are the uncached
/// reads (the unit tests' fake tree overrides them).
class ElementSource: @unchecked Sendable {
  let costs = FetchCosts()
  private var dataCache: [ElementKey: ElementData] = [:]
  private var visibleCache: [ElementKey: [AXUIElement]?] = [:]
  private var frameCache: [ElementKey: CGRect?] = [:]

  /// The element's attributes; nil when the element cannot be read.
  final func data(_ element: AXUIElement) -> ElementData? {
    let key = ElementKey(element: element)
    if let known = dataCache[key] { return known }
    let read = read(element)
    if let read { dataCache[key] = read }
    return read
  }

  func read(_ element: AXUIElement) -> ElementData? { publicData(element) }

  func publicData(_ element: AXUIElement) -> ElementData? {
    costs.time("attributes") {
      var values: CFArray?
      let error = AXUIElementCopyMultipleAttributeValues(prepare(element), observedAttributes as CFArray, AXCopyMultipleAttributeOptions(rawValue: 0), &values)
      guard error == .success, let slots = values as? [Any], slots.count == observedAttributes.count else { return nil }
      var decoded: [String: CFTypeRef] = [:]
      for (name, slot) in zip(observedAttributes, slots) { if let value = present(slot) { decoded[name] = value } }
      return ElementData(values: decoded)
    }
  }

  func owner(_ element: AXUIElement) -> pid_t { pid(of: element) }

  func actions(_ element: AXUIElement) -> [String] {
    costs.time("actions") {
      var names: CFArray?
      return AXUIElementCopyActionNames(element, &names) == .success ? (names as? [String] ?? []) : []
    }
  }

  /// Whether `attribute` is settable on the element (AXValue for `settable`, AXFocused for `focusable`, AXSelected
  /// for `selectable`), timed under `phase`.
  func isSettable(_ element: AXUIElement, _ attribute: String, phase: String) -> Bool {
    costs.time(phase) {
      var flag = DarwinBoolean(false)
      return AXUIElementIsAttributeSettable(element, attribute as CFString, &flag) == .success && flag.boolValue
    }
  }

  /// The width rule's visible subset, read only for an element over the threshold: the element's visible subset (AXVisibleChildren, else AXVisibleRows), nil when it offers none.
  final func visibleChildren(_ element: AXUIElement) -> [AXUIElement]? {
    let key = ElementKey(element: element)
    if let known = visibleCache[key] { return known }
    let read = readVisibleChildren(element)
    visibleCache[key] = .some(read)
    return read
  }

  final func frame(_ element: AXUIElement) -> CGRect? {
    let key = ElementKey(element: element)
    if let known = frameCache[key] { return known }
    let read = readFrame(element)
    frameCache[key] = .some(read)
    return read
  }

  /// The Markdown rendering of a text element's value (the parameterized attributed-string read), timed.
  func markdown(_ element: AXUIElement, length: Int) -> String? {
    costs.time("markdown") { markdownRendering(of: element, length: length) }
  }

  func readVisibleChildren(_ element: AXUIElement) -> [AXUIElement]? {
    costs.time("width") {
      for name in ["AXVisibleChildren", kAXVisibleRowsAttribute] {
        let list = elementList(attribute(element, name))
        if !list.isEmpty { return list }
      }
      return nil
    }
  }

  func readFrame(_ element: AXUIElement) -> CGRect? {
    costs.time("width") {
      var values: CFArray?
      guard AXUIElementCopyMultipleAttributeValues(prepare(element), [kAXPositionAttribute, kAXSizeAttribute] as CFArray, AXCopyMultipleAttributeOptions(rawValue: 0), &values) == .success,
            let slots = values as? [Any], slots.count == 2,
            let origin = point(present(slots[0])), let extent = size(present(slots[1])) else { return nil }
      return CGRect(origin: origin, size: extent)
    }
  }
}
