import ApplicationServices
import Foundation

// The two attribute-fetch routes the M0 spike prices against each other (the spec's Design, "Observation (skyshot)";
// R/F-helper-logic.md §1.1–1.3, §11): the public `AXUIElementCopyMultipleAttributeValues` per element, and the private
// `AXUIElementCopyHierarchy` the vendor prefetches a whole subtree with (resolved with dlsym and feature-detected, the
// public route its fallback). Both routes decode through `ElementData(values:childCount:)`, so a tree has the same
// shape whichever route produced it; only the timings differ.

/// The attributes read per element: the vendor's 20 in its order (F §1.2), then what the Interfaces' Node adds
/// (AXSelectable, AXDOMClassList), then position, size and children.
let observedAttributes: [String] = [
  "AXRole", "AXSubrole", "AXRoleDescription", "AXTitle", "AXDescription", "AXValue", "AXValueDescription",
  "AXPlaceholderValue", "AXNumberOfCharacters", "AXHelp", "AXIdentifier", "AXSelected", "AXFocused", "AXEnabled",
  "AXDisclosing", "AXURL", "AXTraits", "AXServesAsTitleForUIElements", "AXRowIndexRange", "AXColumnIndexRange",
  "AXSelectable", "AXDOMClassList", "AXPosition", "AXSize", "AXChildren",
]

enum FetchRoute: String {
  case publicFetch = "public"
  case hierarchy = "hierarchy"
}

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
  var servesAsTitle: Bool?
  var rowIndexRange: [Int]?
  var columnIndexRange: [Int]?
  var selected: Bool?
  var focused: Bool?
  var enabled: Bool?
  var disclosing: Bool?
  var selectable: Bool?
  var domClassList: [String]?
  var frame: CGRect?
  /// AXChildren as fetched (the hierarchy route caps it at 100) and the element's full child count.
  var children: [AXUIElement]
  var childCount: Int

  /// Decodes one element's attribute values, keyed by attribute name; `childCount` is the route's own count of the
  /// children when it knows one beyond what it returned.
  init(values: [String: CFTypeRef], childCount: Int? = nil) {
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
    servesAsTitle = values["AXServesAsTitleForUIElements"].map { CFGetTypeID($0) == CFArrayGetTypeID() ? CFArrayGetCount(($0 as! CFArray)) > 0 : false }
    rowIndexRange = indexRange(values["AXRowIndexRange"])
    columnIndexRange = indexRange(values["AXColumnIndexRange"])
    selected = flag("AXSelected")
    focused = flag("AXFocused")
    enabled = flag("AXEnabled")
    disclosing = flag("AXDisclosing")
    selectable = flag("AXSelectable")
    domClassList = values["AXDOMClassList"].flatMap { CFGetTypeID($0) == CFArrayGetTypeID() ? ($0 as! [AnyObject]).compactMap { $0 as? String }.map(bounded) : nil }
    frame = point(values["AXPosition"]).flatMap { origin in size(values["AXSize"]).map { CGRect(origin: origin, size: $0) } }
    children = elementList(values["AXChildren"])
    self.childCount = max(childCount ?? 0, children.count)
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
}

/// Where the walk reads elements from. Everything but `data` is the same public call on either route.
class ElementSource: @unchecked Sendable {
  let costs = FetchCosts()
  var route: FetchRoute { .publicFetch }

  /// The element's attributes; `subtree: false` keeps a prefetching route from fetching the element's whole subtree
  /// for it (the menu bar's items, whose menus are never walked). Nil when the element cannot be read.
  func data(_ element: AXUIElement, subtree: Bool = true) -> ElementData? { publicData(element) }

  final func publicData(_ element: AXUIElement) -> ElementData? {
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

  /// The width rule's inputs, read only for an element over the threshold (or whose route returned a short list).
  func allChildren(_ element: AXUIElement) -> [AXUIElement] {
    costs.time("width") { elementList(attribute(element, kAXChildrenAttribute)) }
  }

  /// The element's visible subset (AXVisibleChildren, else AXVisibleRows), nil when it offers none.
  func visibleChildren(_ element: AXUIElement) -> [AXUIElement]? {
    costs.time("width") {
      for name in ["AXVisibleChildren", kAXVisibleRowsAttribute] {
        let list = elementList(attribute(element, name))
        if !list.isEmpty { return list }
      }
      return nil
    }
  }

  func frame(_ element: AXUIElement) -> CGRect? {
    costs.time("width") {
      var values: CFArray?
      guard AXUIElementCopyMultipleAttributeValues(prepare(element), [kAXPositionAttribute, kAXSizeAttribute] as CFArray, AXCopyMultipleAttributeOptions(rawValue: 0), &values) == .success,
            let slots = values as? [Any], slots.count == 2,
            let origin = point(present(slots[0])), let extent = size(present(slots[1])) else { return nil }
      return CGRect(origin: origin, size: extent)
    }
  }
}

/// The public route: one `AXUIElementCopyMultipleAttributeValues` per element.
final class PublicSource: ElementSource, @unchecked Sendable {}

/// `AXUIElementCopyHierarchy`, the private batched fetch, with its option and result keys; nil when any is absent.
struct HierarchySPI: @unchecked Sendable {
  typealias Function = @convention(c) (AXUIElement, CFArray, CFDictionary?, UnsafeMutablePointer<Unmanaged<CFDictionary>?>) -> AXError
  let call: Function
  let skipInspectionKey: String
  let arrayAttributesKey: String
  let truncateStringsKey: String
  let maxArrayCountKey: String
  let valueKey: String
  let countKey: String
  let errorKey: String
  let incompleteKey: String

  static let shared: HierarchySPI? = {
    let handle = UnsafeMutableRawPointer(bitPattern: -2) // RTLD_DEFAULT: ApplicationServices is linked
    guard let symbol = dlsym(handle, "AXUIElementCopyHierarchy") else { return nil }
    func key(_ name: String) -> String? {
      guard let pointer = dlsym(handle, name) else { return nil }
      return pointer.assumingMemoryBound(to: CFString?.self).pointee as String?
    }
    guard let skip = key("kAXUIElementCopyHierarchySkipInspectionForAttributesKey"),
          let arrays = key("kAXUIElementCopyHierarchyArrayAttributesKey"),
          let truncate = key("kAXUIElementCopyHierarchyTruncateStringsKey"),
          let maxCount = key("kAXUIElementCopyHierarchyMaxArrayCountKey"),
          let value = key("kAXUIElementCopyHierarchyResultValueKey"),
          let count = key("kAXUIElementCopyHierarchyResultCountKey"),
          let error = key("kAXUIElementCopyHierarchyResultErrorKey"),
          let incomplete = key("kAXUIElementCopyHierarchyIncompleteResultKey") else { return nil }
    return HierarchySPI(call: unsafeBitCast(symbol, to: Function.self), skipInspectionKey: skip, arrayAttributesKey: arrays,
                        truncateStringsKey: truncate, maxArrayCountKey: maxCount, valueKey: value, countKey: count,
                        errorKey: error, incompleteKey: incomplete)
  }()

  /// The vendor's four options (F §1.1): the attribute list uninspected, AXChildren as the array attribute, strings
  /// truncated at the SPI's own length, arrays capped at 100.
  var options: CFDictionary {
    [skipInspectionKey: observedAttributes, arrayAttributesKey: [kAXChildrenAttribute], truncateStringsKey: true,
     maxArrayCountKey: widthThreshold] as CFDictionary
  }

  /// One element's entry of a result: its attribute values, the children's full count, and whether the SPI marked
  /// the element or its children incomplete.
  func decode(_ entry: [String: Any]) -> (values: [String: CFTypeRef], childCount: Int?, incomplete: Bool) {
    var values: [String: CFTypeRef] = [:]
    var childCount: Int?
    var incomplete = (entry[incompleteKey] as? Bool) == true
    for name in observedAttributes {
      guard let slot = entry[name] else { continue }
      if let wrapped = slot as? [String: Any], wrapped[valueKey] != nil || wrapped[errorKey] != nil || wrapped[countKey] != nil || wrapped[incompleteKey] != nil {
        if let value = present(wrapped[valueKey]) { values[name] = value }
        if name == kAXChildrenAttribute {
          childCount = (wrapped[countKey] as? NSNumber)?.intValue
          if (wrapped[incompleteKey] as? Bool) == true { incomplete = true }
        }
      } else if let value = present(slot) {
        values[name] = value
      }
    }
    return (values, childCount, incomplete)
  }
}

/// The hierarchy route: one SPI call per subtree, results kept by element; an element the results lack, or that the
/// SPI marked incomplete, is fetched again by a call rooted at it (once), then by the public call.
final class HierarchySource: ElementSource, @unchecked Sendable {
  private let spi: HierarchySPI
  private var entries: [ElementKey: [String: Any]] = [:]
  private var refetched: Set<ElementKey> = []

  init(spi: HierarchySPI) { self.spi = spi }

  override var route: FetchRoute { .hierarchy }

  override func data(_ element: AXUIElement, subtree: Bool = true) -> ElementData? {
    let key = ElementKey(element: element)
    if let entry = entries[key] {
      let decoded = spi.decode(entry)
      if !decoded.incomplete || !subtree || refetched.contains(key) { return ElementData(values: decoded.values, childCount: decoded.childCount) }
    }
    guard subtree, !refetched.contains(key) else {
      // A menu-bar item (never walked into) is read alone by design; anything else here is a fallback.
      costs.count(subtree ? "fallbackFetches" : "singleFetches")
      return publicData(element)
    }
    refetched.insert(key)
    prefetch(rootedAt: element)
    guard let entry = entries[key] else {
      costs.count("fallbackFetches")
      return publicData(element)
    }
    let decoded = spi.decode(entry)
    return ElementData(values: decoded.values, childCount: decoded.childCount)
  }

  private func prefetch(rootedAt element: AXUIElement) {
    costs.count("prefetchCalls")
    let result: CFDictionary? = costs.time("prefetch") {
      var out: Unmanaged<CFDictionary>?
      let error = spi.call(prepare(element), observedAttributes as CFArray, spi.options, &out)
      let dictionary = out?.takeRetainedValue()
      if error != .success { costs.count("prefetchErrors"); return nil }
      return dictionary
    }
    guard let result else { return }
    costs.time("prefetchDecode") {
      (result as NSDictionary).forEach { key, value in
        let object = key as AnyObject
        guard CFGetTypeID(object) == AXUIElementGetTypeID(), let entry = value as? [String: Any] else { return }
        entries[ElementKey(element: object as! AXUIElement)] = entry
      }
    }
  }
}

/// The source for `route`, falling back to the public route where the SPI is absent.
func makeSource(_ route: FetchRoute) -> ElementSource {
  if route == .hierarchy, let spi = HierarchySPI.shared { return HierarchySource(spi: spi) }
  return PublicSource()
}
