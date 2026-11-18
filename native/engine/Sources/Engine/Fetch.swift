import ApplicationServices
import Foundation

// The attribute fetch (the spec's Design, "Observation (skyshot)"; R/F-helper-logic.md §1.1–1.3): the public
// `AXUIElementCopyMultipleAttributeValues` per element, then `AXUIElementCopyActionNames`. The private batched
// `_AXUIElementCopyHierarchy` the vendor prefetches with lost to it on every scene in M0 and is not resolved.

/// The attributes read per element: the vendor's 20 in its order (F §1.2), then what the Interfaces' Node adds
/// (AXDOMClassList), the settle's busy signs (AXElementBusy, AXLoaded; F §8.4), the text's context, position, size and
/// children. Not AXEditableAncestor: #298's walk cost (the design session's ruling 1ea561bc:565) keeps it to the click.
/// One list for the settle's busy walk and the observation's walk, so the observation can read the tree the
/// settle fetched. The scroll bars are not on it: they are read only for an element with a page scroll (scrollBars).
/// The value's attributes (`valueAttributes`) are requested apart from the rest, once the element is classified (#405).
let observedAttributes: [String] = [
  "AXRole", "AXSubrole", "AXRoleDescription", "AXTitle", "AXDescription", "AXValue", "AXValueDescription",
  "AXPlaceholderValue", "AXNumberOfCharacters", "AXHelp", "AXIdentifier", "AXSelected", "AXFocused", "AXEnabled",
  "AXDisclosing", "AXURL", "AXTraits", "AXServesAsTitleForUIElements", "AXRowIndexRange", "AXColumnIndexRange",
  "AXDOMClassList", "AXElementBusy", "AXLoaded", "AXTextualContext", "AXPosition", "AXSize", "AXChildren",
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
  var domClassList: [String]?
  var elementBusy: Bool?
  var loaded: Bool?
  /// AXTextualContext (the vendor's Markdown predicate skips `AXTextualContextSourceCode`).
  var textualContext: String?
  var frame: CGRect?
  /// AXChildren, in order.
  var children: [AXUIElement]
  /// Whether AXChildren was read: false when its slot held an error or nothing, which decodes as no children (#330's
  /// rule dL then cannot tell a child the page added from one this read missed).
  var childrenRead: Bool
  /// The attributes whose read failed with an error other than their absence (`failedSlot`): each decodes as none, as
  /// an absent one does, and #298's stale-point record tells the two apart for the label's attributes.
  var unreadable: Set<String> = []
  /// #390: read by a source that does not read AXValue (`ElementSource.readsValue` false), so `value` says nothing of the
  /// element's value; an identity made from it leaves the value out of its match. #405: so is an element whose value
  /// attributes (`valueAttributes`) were deliberately not read: a password field, one that could not be classified, or
  /// one read without them (`ElementSource.structure`).
  var valueUnread = false
  /// #405: the value could not be read where it was wanted (its request or its slot failed, or the element could not be
  /// classified to read it), which is not its omission: an identity made from it matches only another that could not
  /// read it either, never one with a value.
  var valueFailed = false
  /// #405: AXValueDescription, kept apart from the value: deliberately not read (a password field, or one read without
  /// its value attributes), or wanted and not read (as `valueFailed`). A source that leaves out only AXValue (#390)
  /// still reads it.
  var descriptionUnread = false
  var descriptionFailed = false
  /// #405: a password field (role or subrole AXSecureTextField, as a read classified it): its value, value description,
  /// length, Markdown and selection are never read, and its node says `secure` in place of a value.
  var secure = false
  /// #405: the read of the other attributes classified the element as one whose value attributes may be read
  /// (`valueReadClosed` false); `ElementSource` reads them only then.
  fileprivate var valueOpen = false

  /// Decodes one element's attribute values, keyed by attribute name, and the names whose read failed.
  init(values: [String: CFTypeRef], unreadable: Set<String> = []) {
    self.unreadable = unreadable
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
    textualContext = string("AXTextualContext")
    elementBusy = flag("AXElementBusy")
    loaded = flag("AXLoaded")
    domClassList = values["AXDOMClassList"].flatMap { CFGetTypeID($0) == CFArrayGetTypeID() ? ($0 as! [AnyObject]).compactMap { $0 as? String }.map(bounded) : nil }
    frame = point(values["AXPosition"]).flatMap { origin in size(values["AXSize"]).map { CGRect(origin: origin, size: $0) } }
    children = elementList(values["AXChildren"])
    childrenRead = values["AXChildren"].map { CFGetTypeID($0) == CFArrayGetTypeID() } ?? false
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

/// The attributes that carry an element's value (#405): the value, its description and its length. Read only through
/// `guardedRead`.
let valueAttributes: Set<String> = [kAXValueAttribute, kAXValueDescriptionAttribute, kAXNumberOfCharactersAttribute]

/// The attributes every value-bearing request carries beside what it reads, and a classification-only request reads.
let classifyingAttributes = [kAXRoleAttribute, kAXSubroleAttribute]

/// What a guarded read of value-bearing attributes found (#405).
enum GuardedRead {
  /// The element is closed, a password field when `secure`, else one whose role or subrole could not be read: nothing
  /// of its value was asked for, or what came back beside a closed classification was dropped. `classification` is the
  /// role and subrole that request answered, nothing else of it.
  case closed(secure: Bool, classification: AttributeRead)
  /// A request failed: nothing read.
  case failed
  case read(AttributeRead)
}

/// #405's rule for every value-bearing read (#390's, for set_value): `names` are requested only in a batch that reads
/// the role and subrole again, and its whole answer is dropped when that classification is closed (`valueReadClosed`);
/// that batch is sent only once a classification made just before leaves the element open: a classification-only
/// request, unless the caller's own request just now classified it open (`classifiedOpen`). A classification older than
/// the read does not authorise it.
func guardedRead(_ names: [String], classifiedOpen: Bool = false, request: ([String]) -> AttributeRead?) -> GuardedRead {
  func closed(_ read: AttributeRead) -> GuardedRead? {
    let classified = valueReadClosed(read)
    guard classified.closed else { return nil }
    let kept = Set(classifyingAttributes)
    return .closed(secure: classified.secure, classification: AttributeRead(values: read.values.filter { kept.contains($0.key) },
                                                                            unreadable: read.unreadable.intersection(kept)))
  }
  if !classifiedOpen {
    guard let preflight = request(classifyingAttributes) else { return .failed }
    if let closed = closed(preflight) { return closed }
  }
  guard let read = request(classifyingAttributes + names) else { return .failed }
  return closed(read) ?? .read(read)
}

/// One AXUIElementCopyMultipleAttributeValues of `names`; nil when the element cannot be read.
func fetchAttributes(_ element: AXUIElement, _ names: [String]) -> AttributeRead? {
  var values: CFArray?
  let error = AXUIElementCopyMultipleAttributeValues(prepare(element), names as CFArray, AXCopyMultipleAttributeOptions(rawValue: 0), &values)
  guard error == .success, let slots = values as? [Any], slots.count == names.count else { return nil }
  var read = AttributeRead()
  for (name, slot) in zip(names, slots) {
    if let value = present(slot) { read.values[name] = value } else if failedSlot(slot) { read.unreadable.insert(name) }
  }
  return read
}

/// What one batched request answered: the values present by name, and the names whose read failed with an error other
/// than their absence (`failedSlot`).
struct AttributeRead {
  var values: [String: CFTypeRef] = [:]
  var unreadable: Set<String> = []
}

/// #405: whether a request's answer leaves the element's value unread, by the rule every value read of a field follows
/// (`writtenValueFieldClosed`): a password field by role or subrole, or a role or subrole it could not read; and whether
/// it is the first, a field known to be a password field.
func valueReadClosed(_ read: AttributeRead) -> (closed: Bool, secure: Bool) {
  let role = read.values[kAXRoleAttribute].flatMap { CFGetTypeID($0) == CFStringGetTypeID() ? ($0 as! String) : nil }
  let subrole: SubroleRead
  if let value = read.values[kAXSubroleAttribute] {
    subrole = CFGetTypeID(value) == CFStringGetTypeID() ? .subrole(value as! String) : .failed
  } else {
    subrole = read.unreadable.contains(kAXSubroleAttribute) ? .failed : .none
  }
  let secure = role == "AXSecureTextField" || subrole == .subrole("AXSecureTextField")
  return (writtenValueFieldClosed(role: role, subrole: subrole), secure)
}

/// Where a walk reads elements from, for one observation: what it read is kept, so the settle's busy walk and the
/// observation's walk that follows it read each element once (F §8.5). `fetch` and `attributeNames` are the uncached
/// requests to the app, and the `read…` methods the other uncached reads (the unit tests' fake tree overrides them);
/// every read above them classifies an element before it reads its value (#405).
class ElementSource: @unchecked Sendable {
  let costs = FetchCosts()
  /// #390: false for a set_value of a concealed value or into a password field, whose re-reads and re-fetch walk must
  /// not read AXValue: the reads leave it out of the attributes they request, and what they answer is marked
  /// `valueUnread`.
  var readsValue = true
  private var dataCache: [ElementKey: ElementData] = [:]
  /// #405: elements read without their value attributes (`structure`), which `data` completes with one request.
  private var structureCache: [ElementKey: ElementData] = [:]
  private var visibleCache: [ElementKey: [AXUIElement]?] = [:]
  private var frameCache: [ElementKey: CGRect?] = [:]
  private var roleWithFrame: [ElementKey: String] = [:]

  /// The element's attributes, its value's only as its classification allows (`classifiedRead`); nil when the element
  /// cannot be read.
  final func data(_ element: AXUIElement) -> ElementData? {
    let key = ElementKey(element: element)
    if let known = dataCache[key] { return known }
    // A structure read earlier (the settle's busy walk) classified the element too long ago to authorise a value read:
    // `completed` classifies it again first.
    let read = structureCache[key].map { completed($0, element, names: requestedAttributes, classifiedOpenNow: false) }
      ?? classifiedRead(element, names: requestedAttributes)
    if let read { dataCache[key] = read }
    return read
  }

  /// The element's attributes but its value's (#405), marked `valueUnread`: what the settle's busy walk needs, and what a
  /// re-fetch first matches by. A `data` after it classifies it again, then reads its value.
  final func structure(_ element: AXUIElement) -> ElementData? {
    let key = ElementKey(element: element)
    if let known = dataCache[key] ?? structureCache[key] { return known }
    let read = structuralRead(element, names: requestedAttributes)
    if let read { structureCache[key] = read }
    return read
  }

  /// The element's data as a later read found it closed (#405, the Markdown's classification, failed or closed): its
  /// value attributes dropped, here and in the cache, so the node, the identity and every later read of this source
  /// carry none.
  private func close(_ element: AXUIElement, _ data: ElementData, secure: Bool) -> ElementData {
    let closed = closed(data, secure: secure)
    dataCache[ElementKey(element: element)] = closed
    return closed
  }

  /// `data` with its value attributes dropped: a password field's (`secure`) deliberately unread, an unclassifiable
  /// element's `unverified`.
  private func closed(_ data: ElementData, secure: Bool) -> ElementData {
    var closed = data
    closed.value = nil
    closed.valueDescription = nil
    closed.numberOfCharacters = nil
    closed.valueOpen = false
    closed.secure = secure
    if secure {
      closed.valueUnread = true
      closed.valueFailed = false
      closed.descriptionUnread = true
      closed.descriptionFailed = false
    } else {
      unverified(&closed)
    }
    return closed
  }

  /// An element whose value attributes were wanted and not read (a failed request, or no classification to read them
  /// by): an identity made from it cannot be matched to one with a value (`valueFailed`), unless the source leaves the
  /// value out anyway (#390).
  private func unverified(_ data: inout ElementData) {
    data.valueUnread = !readsValue
    data.valueFailed = readsValue
    data.descriptionUnread = false
    data.descriptionFailed = true
  }

  /// The attributes a read requests: `observedAttributes`, without AXValue when the source does not read values.
  final var requestedAttributes: [String] { readsValue ? observedAttributes : observedAttributes.filter { $0 != kAXValueAttribute } }

  /// The element's attributes read through only those it lists, the vendor's read of an element outside the subtree
  /// its prefetch covered (FUN_1007542cc: AXUIElementCopyAttributeNames intersected with the attribute set, then one
  /// AXUIElementCopyMultipleAttributeValues; F §1.3): the menu bar's. Cached with the other reads, and classified as
  /// they are: the role and subrole are requested for the classification whether or not the element lists them, and
  /// kept in its data only when it does.
  final func listedData(_ element: AXUIElement) -> ElementData? {
    let key = ElementKey(element: element)
    if let known = dataCache[key] { return known }
    guard let listed = costs.time("attributes", { attributeNames(element) }) else { return nil }
    let names = Set(listed)
    let read = classifiedRead(element, names: requestedAttributes.filter(names.contains))
    if let read { dataCache[key] = read }
    return read
  }

  /// `names` in two requests (#405): all but the value's first, which classifies the element, then the value's through
  /// `guardedRead`, its classification just made standing as the preflight.
  private func classifiedRead(_ element: AXUIElement, names: [String]) -> ElementData? {
    structuralRead(element, names: names).map { completed($0, element, names: names, classifiedOpenNow: true) }
  }

  /// `names` but the value's, in one request with the role and subrole (asked for whatever `names` holds, the
  /// classification's), classified (`valueReadClosed`) and marked `valueUnread`; the data keeps only `names`.
  private func structuralRead(_ element: AXUIElement, names: [String]) -> ElementData? {
    let kept = names.filter { !valueAttributes.contains($0) }
    guard let read = request(element, kept + classifyingAttributes.filter { !kept.contains($0) }) else { return nil }
    let classified = valueReadClosed(read)
    let asked = Set(kept)
    var data = ElementData(values: read.values.filter { asked.contains($0.key) }, unreadable: read.unreadable.intersection(asked))
    data.secure = classified.secure
    data.valueOpen = !classified.closed
    if classified.closed && !classified.secure {
      unverified(&data)
    } else {
      data.valueUnread = true
      data.descriptionUnread = true
    }
    return data
  }

  /// `structure` with the value's attributes among `names`, read through `guardedRead` only when its classification
  /// left them open: `classifiedOpenNow` when that classification was made just now, else it is made again first. A
  /// field found closed keeps none of them (`closed`); a failed read is `valueFailed`, not an omission.
  private func completed(_ structure: ElementData, _ element: AXUIElement, names: [String], classifiedOpenNow: Bool) -> ElementData {
    var data = structure
    guard data.valueOpen else { return data }
    data.valueUnread = !readsValue
    data.descriptionUnread = false
    let wanted = names.filter(valueAttributes.contains)
    guard !wanted.isEmpty else { return data }
    switch guardedRead(wanted, classifiedOpen: classifiedOpenNow, request: { request(element, $0) }) {
    case .closed(let secure, let classification):
      // A password field now: its role and subrole as that request read them, so its identity matches nothing recorded
      // under the structure's older ones.
      if secure { reclassified(&data, by: classification, names: names) }
      return closed(data, secure: secure)
    case .failed:
      data.unreadable.formUnion(wanted)
      unverified(&data)
      return data
    case .read(let read):
      reclassified(&data, by: read, names: names)
      let values = ElementData(values: read.values)
      data.value = values.value
      data.valueDescription = values.valueDescription
      data.numberOfCharacters = values.numberOfCharacters
      data.unreadable.formUnion(read.unreadable.intersection(wanted))
      data.valueFailed = readsValue && read.unreadable.contains(kAXValueAttribute)
      data.descriptionFailed = read.unreadable.contains(kAXValueDescriptionAttribute)
      return data
    }
  }

  /// `data`'s role and subrole as a later request of the value's read them, where `names` keeps them: the fresher read.
  private func reclassified(_ data: inout ElementData, by read: AttributeRead, names: [String]) {
    let fresh = ElementData(values: read.values)
    if names.contains(kAXRoleAttribute), read.values[kAXRoleAttribute] != nil { data.role = fresh.role }
    if names.contains(kAXSubroleAttribute), !read.unreadable.contains(kAXSubroleAttribute) { data.subrole = fresh.subrole }
  }

  /// One request for `names`, keeping only what it asked for whatever else the app answered, timed.
  private func request(_ element: AXUIElement, _ names: [String]) -> AttributeRead? {
    guard var read = costs.time("attributes", { fetch(element, names) }) else { return nil }
    let asked = Set(names)
    read.values = read.values.filter { asked.contains($0.key) }
    read.unreadable.formIntersection(asked)
    return read
  }

  /// One AXUIElementCopyMultipleAttributeValues of `names` (`fetchAttributes`); nil when the element cannot be read.
  func fetch(_ element: AXUIElement, _ names: [String]) -> AttributeRead? { fetchAttributes(element, names) }

  /// The attributes the element lists (AXUIElementCopyAttributeNames); nil when it answers none.
  func attributeNames(_ element: AXUIElement) -> [String]? {
    var names: CFArray?
    guard AXUIElementCopyAttributeNames(prepare(element), &names) == .success else { return nil }
    return names as? [String]
  }

  /// Which scroll bars the element answers (AXHorizontalScrollBar, AXVerticalScrollBar, any value), read only for an
  /// element with a page-scroll action, as the vendor's filterActions (FUN_100782c24) reads them; uncached, since an
  /// element is emitted once per walk.
  func scrollBars(_ element: AXUIElement) -> (horizontal: Bool, vertical: Bool) {
    costs.time("attributes") {
      let names = ["AXHorizontalScrollBar", "AXVerticalScrollBar"]
      var values: CFArray?
      let error = AXUIElementCopyMultipleAttributeValues(prepare(element), names as CFArray, AXCopyMultipleAttributeOptions(rawValue: 0), &values)
      guard error == .success, let slots = values as? [Any], slots.count == names.count else { return (false, false) }
      return (present(slots[0]) != nil, present(slots[1]) != nil)
    }
  }

  /// A window's AXDocument, read only for a window without an AXURL (nodeURL).
  func document(_ element: AXUIElement) -> String? {
    costs.time("attributes") { stringAttribute(element, kAXDocumentAttribute) }
  }

  /// The system's description of one of the element's actions (AXUIElementCopyActionDescription, the vendor's
  /// `AXUIElementRef.description(for:)` 0x1006e8bf8), localized to the app's language; nil when it gives none.
  func actionDescription(_ element: AXUIElement, _ action: String) -> String? {
    costs.time("actionDescriptions") {
      var description: CFString?
      guard AXUIElementCopyActionDescription(element, action as CFString, &description) == .success, let description else { return nil }
      return bounded(description as String)
    }
  }

  func owner(_ element: AXUIElement) -> pid_t { pid(of: element) }

  /// Whether the element's handle names a destroyed element: its AXRole read answers kAXErrorInvalidUIElement (#303,
  /// the previous revision's handle of an element Chromium re-created). Uncached: asked of a handle the walk does not read.
  func isGone(_ element: AXUIElement) -> Bool {
    costs.time("gone") { copyAttribute(element, kAXRoleAttribute).error == .invalidUIElement }
  }

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

  /// The width rule's visible subset (AXVisibleChildren, else AXVisibleRows), read only for an element over the
  /// threshold; nil when it offers none.
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
    costs.count("frameReads")
    let read = readFramedRole(element)
    frameCache[key] = .some(read.frame)
    if let role = read.role { roleWithFrame[key] = role }
    return read.frame
  }

  /// The role read with the element's frame (`frame`, the same call), nil when its frame was not read or gave no role:
  /// #310's AXColumn among a wide list's shown children is known with no read of its own.
  final func roleReadWithFrame(_ element: AXUIElement) -> String? { roleWithFrame[ElementKey(element: element)] }

  /// The Markdown rendering of a text element's value (the parameterized attributed-string read), timed. Its role and
  /// subrole are requested again just before (#405): when that request fails or finds the field closed, nil with no
  /// read, and `data` closed too (here and in the cache), so nothing read of it earlier reaches its node or identity.
  final func markdown(_ element: AXUIElement, data: inout ElementData, length: Int) -> String? {
    guard let read = request(element, classifyingAttributes) else {
      // Fails closed: an element that cannot be classified now keeps nothing read of it before.
      data = close(element, data, secure: false)
      return nil
    }
    let classified = valueReadClosed(read)
    if classified.closed {
      data = close(element, data, secure: classified.secure)
      return nil
    }
    return costs.time("markdown") { readMarkdown(element, length: length) }
  }

  func readMarkdown(_ element: AXUIElement, length: Int) -> String? { markdownRendering(of: element, length: length) }

  func readVisibleChildren(_ element: AXUIElement) -> [AXUIElement]? {
    costs.time("width") {
      for name in ["AXVisibleChildren", kAXVisibleRowsAttribute] {
        let list = elementList(attribute(element, name))
        if !list.isEmpty { return list }
      }
      return nil
    }
  }

  func readFrame(_ element: AXUIElement) -> CGRect? { readFramedRole(element).frame }

  /// The element's frame (AXPosition and AXSize) and, in the same call, its AXRole (#310); each nil when it gives none.
  func readFramedRole(_ element: AXUIElement) -> (frame: CGRect?, role: String?) {
    costs.time("width") {
      var values: CFArray?
      guard AXUIElementCopyMultipleAttributeValues(prepare(element), [kAXPositionAttribute, kAXSizeAttribute, kAXRoleAttribute] as CFArray,
                                                   AXCopyMultipleAttributeOptions(rawValue: 0), &values) == .success,
            let slots = values as? [Any], slots.count == 3 else { return (nil, nil) }
      let role = present(slots[2]) as? String
      guard let origin = point(present(slots[0])), let extent = size(present(slots[1])) else { return (nil, role) }
      return (CGRect(origin: origin, size: extent), role)
    }
  }
}
