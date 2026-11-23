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
/// The same reply classifies each element by its role and subrole (#405): a closed one keeps none of `valueAttributes`.
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
  /// #453 (rulings 1082, 1083): AXChildren's slot explicitly said absent (kAXErrorAttributeUnsupported or
  /// kAXErrorNoValue): a leaf, whose children are all known (none). A failed read, a null slot or none at all is not.
  var childrenLeaf = false
  /// The attributes whose read failed with an error other than their absence (`failedSlot`): each decodes as none, as
  /// an absent one does, and #298's stale-point record tells the two apart for the label's attributes.
  var unreadable: Set<String> = []
  /// #500 (ruling 1131): the attributes whose slot held kCFNull (`AttributeRead.null`): each decodes as none, and the
  /// stale-point record keeps the label's apart from a failed read and from an absence (`ScreenshotNode.labelsNull`).
  var null: Set<String> = []
  /// #390: read by a source that does not read AXValue (`ElementSource.readsValue` false), so `value` says nothing of the
  /// element's value; an identity made from it leaves the value out of its match. #405: so is a password field's.
  var valueUnread = false
  /// #405: AXValue's slot failed, which is not its omission: an identity made from it matches only another such, and
  /// only for the same handle.
  var valueFailed = false
  /// #405: AXValueDescription's marks, kept apart from the value's: not kept (a password field's), or its slot failed
  /// (as `valueFailed`). A source that leaves out only AXValue (#390) still reads it.
  var descriptionUnread = false
  var descriptionFailed = false
  /// #405: a password field as the read classified it (its role or subrole AXSecureTextField), or presumed one (its role
  /// unreadable, or a text-entry role with its subrole unreadable; rulings 1ea561bc:811, 813): its value, value
  /// description, length, Markdown and selection are dropped from the reply that carried them and never kept, and its
  /// node says `secure` in place of a value.
  var secure = false
  /// #405: the value attributes were dropped because the classification failed (`secure` presumed, or another role whose
  /// subrole is unreadable, whose node says `valueUnread`), not because it found a password field: an identity made from
  /// it matches only another such, for the same handle.
  var classificationFailed = false

  /// Decodes one element's attribute values, keyed by attribute name, and the names whose read failed.
  init(values: [String: CFTypeRef], unreadable: Set<String> = [], absent: Set<String> = [], null: Set<String> = []) {
    self.unreadable = unreadable
    self.null = null
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
    childrenLeaf = values["AXChildren"] == nil && absent.contains("AXChildren")
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

/// The attributes that carry an element's value (#405): the value, its description and its length. Requested with the
/// role and subrole in the element's one batch, and dropped from that reply as it is decoded when it classifies the
/// element closed (`valueReadClosed`).
let valueAttributes: Set<String> = [kAXValueAttribute, kAXValueDescriptionAttribute, kAXNumberOfCharactersAttribute]

/// The attributes every value-bearing request carries, which classify the element, and a classification-only request
/// (before a parameterized read, which no batch can carry) reads alone.
let classifyingAttributes = [kAXRoleAttribute, kAXSubroleAttribute]

/// What a classified read of value-bearing attributes found (#405).
enum GuardedRead {
  /// The element is closed (`valueReadClosed`): what came back of the value-bearing attributes was dropped.
  case closed
  /// The request failed: nothing read.
  case failed
  case read(AttributeRead)
}

/// #405's rule for every value-bearing read outside the walk's own (design ruling 1ea561bc:811): `names` are requested in
/// one batch with the role and subrole, the element classified from that same reply, and the reply dropped whole before
/// it leaves this function when the classification is closed. Nothing formats the reply before then.
func classifiedRead(_ names: [String], request: ([String]) -> AttributeRead?) -> GuardedRead {
  guard let read = request(classifyingAttributes + names.filter { !classifyingAttributes.contains($0) }) else { return .failed }
  return valueReadClosed(read) ? .closed : .read(read)
}

/// One AXUIElementCopyMultipleAttributeValues of `names`, the element given the usual messaging timeout first; nil when
/// the element cannot be read.
func fetchAttributes(_ element: AXUIElement, _ names: [String]) -> AttributeRead? { fetchAttributesAsTimed(prepare(element), names) }

/// `fetchAttributes` under whatever messaging timeout the element already has (a reading bounded by a budget, #405).
func fetchAttributesAsTimed(_ element: AXUIElement, _ names: [String]) -> AttributeRead? {
  var values: CFArray?
  let error = AXUIElementCopyMultipleAttributeValues(element, names as CFArray, AXCopyMultipleAttributeOptions(rawValue: 0), &values)
  guard error == .success, let slots = values as? [Any], slots.count == names.count else { return nil }
  var read = AttributeRead()
  for (name, slot) in zip(names, slots) { read.decode(name, slot) }
  return read
}

/// What one batched request answered: the values present by name, and the names whose read failed with an error other
/// than their absence (`failedSlot`).
struct AttributeRead {
  var values: [String: CFTypeRef] = [:]
  var unreadable: Set<String> = []
  /// #453 (ruling 1083): the names whose slot explicitly said the attribute is absent (`absentSlot`).
  var absent: Set<String> = []
  /// #500 (ruling 1131): the names whose slot held kCFNull (`nullSlot`): unknown, not absent, kept apart from `unreadable`.
  var null: Set<String> = []

  /// One slot of a batched reply: its value, or a failed read, or an explicit absence, or a null slot.
  mutating func decode(_ name: String, _ slot: Any?) {
    if let value = present(slot) { values[name] = value } else if failedSlot(slot) { unreadable.insert(name) } else if absentSlot(slot) {
      absent.insert(name)
    } else if nullSlot(slot) {
      null.insert(name)
    }
  }
}

/// The roles a password field can have when its subrole cannot be read (ruling 1ea561bc:813): a text-entry role.
let presumedSecureRoles: Set<String> = [kAXTextFieldRole, kAXTextAreaRole, kAXComboBoxRole]

/// How a reply classifies its element (#405, rulings 1ea561bc:811 and 813): `closed`, its value attributes dropped,
/// for a password field by role or subrole and whenever the role or subrole could not be read (`failed`); `secure`, the
/// node said to be a password field, for one by role or subrole, an unreadable role, and a text-entry role with an
/// unreadable subrole, never another readable role, which cannot be one.
struct ValueClassification: Equatable {
  var closed = false
  var secure = false
  var failed = false
}

func valueClassification(_ read: AttributeRead) -> ValueClassification {
  // A slot reported failed is failed, whatever else the reply put beside it.
  let role = read.unreadable.contains(kAXRoleAttribute) ? nil
    : read.values[kAXRoleAttribute].flatMap { CFGetTypeID($0) == CFStringGetTypeID() ? ($0 as! String) : nil }
  let subrole: SubroleRead
  if read.unreadable.contains(kAXSubroleAttribute) {
    subrole = .failed
  } else if let value = read.values[kAXSubroleAttribute] {
    subrole = CFGetTypeID(value) == CFStringGetTypeID() ? .subrole(value as! String) : .failed
  } else {
    subrole = .none
  }
  guard let role else { return ValueClassification(closed: true, secure: true, failed: true) }
  if role == "AXSecureTextField" || subrole == .subrole("AXSecureTextField") { return ValueClassification(closed: true, secure: true) }
  guard subrole == .failed else { return ValueClassification() }
  return ValueClassification(closed: true, secure: presumedSecureRoles.contains(role), failed: true)
}

/// #405: whether a reply classifies its element closed (`valueClassification`), its value attributes dropped, by the rule
/// every value read of a field follows (`writtenValueFieldClosed`).
func valueReadClosed(_ read: AttributeRead) -> Bool { valueClassification(read).closed }

/// Where a walk reads elements from, for one observation: what it read is kept, so the settle's busy walk and the
/// observation's walk that follows it read each element once (F §8.5). `fetch` and `attributeNames` are the uncached
/// requests to the app, and the `read…` methods the other uncached reads (the unit tests' fake tree overrides them);
/// every reply above them is classified, and a closed element's value attributes dropped, as it is decoded (#405).
class ElementSource: @unchecked Sendable {
  let costs = FetchCosts()
  /// #390: false for a set_value of a concealed value or into a password field, whose re-reads and re-fetch walk must
  /// not read AXValue: the reads leave it out of the attributes they request, and what they answer is marked
  /// `valueUnread`.
  var readsValue = true
  private var dataCache: [ElementKey: ElementData] = [:]
  private var visibleCache: [ElementKey: [AXUIElement]?] = [:]
  private var frameCache: [ElementKey: CGRect?] = [:]
  private var roleWithFrame: [ElementKey: String] = [:]

  /// The element's attributes, read in one batch (`classifiedData`); nil when the element cannot be read.
  final func data(_ element: AXUIElement) -> ElementData? {
    let key = ElementKey(element: element)
    if let known = dataCache[key] { return known }
    let read = classifiedData(element, names: requestedAttributes)
    if let read { dataCache[key] = read }
    return read
  }

  /// The attributes a read requests: `observedAttributes`, without AXValue when the source does not read values.
  final var requestedAttributes: [String] { readsValue ? observedAttributes : observedAttributes.filter { $0 != kAXValueAttribute } }

  /// The element's attributes read through only those it lists, the vendor's read of an element outside the subtree
  /// its prefetch covered (FUN_1007542cc: AXUIElementCopyAttributeNames intersected with the attribute set, then one
  /// AXUIElementCopyMultipleAttributeValues; F §1.3): the menu bar's. Cached with the other reads, and classified as
  /// they are: the role and subrole are requested whether or not the element lists them, and kept only when it does.
  final func listedData(_ element: AXUIElement) -> ElementData? {
    let key = ElementKey(element: element)
    if let known = dataCache[key] { return known }
    guard let listed = costs.time("attributes", { attributeNames(element) }) else { return nil }
    let names = Set(listed)
    let read = classifiedData(element, names: requestedAttributes.filter(names.contains))
    if let read { dataCache[key] = read }
    return read
  }

  /// `names` in one batch with the role and subrole (design ruling 1ea561bc:811): the element classified from that reply,
  /// and, when it is closed (`valueReadClosed`), its value attributes dropped as the reply is decoded, here, before
  /// anything else reads or formats it, so they reach no data, cache, identity, node or log. The data keeps `names` alone.
  private func classifiedData(_ element: AXUIElement, names: [String]) -> ElementData? {
    guard let read = request(element, names + classifyingAttributes.filter { !names.contains($0) }) else { return nil }
    let classified = valueClassification(read)
    // A closed element's value attributes never reach the decoding (which would keep, convert or bound them).
    let kept = Set(names).subtracting(classified.closed ? valueAttributes : [])
    var data = ElementData(values: read.values.filter { kept.contains($0.key) }, unreadable: read.unreadable.intersection(kept),
                           absent: read.absent.intersection(kept), null: read.null.intersection(kept))
    if classified.closed { ElementSource.markClosed(&data, classified) } else {
      data.valueUnread = !readsValue
      data.valueFailed = readsValue && read.unreadable.contains(kAXValueAttribute)
      data.descriptionFailed = read.unreadable.contains(kAXValueDescriptionAttribute)
    }
    return data
  }

  /// `data` as a closed element's (`classified`): its value attributes gone and their reads marked deliberate, `secure`
  /// as the classification says, and `classificationFailed` when it was the failure that closed it.
  private static func markClosed(_ data: inout ElementData, _ classified: ValueClassification) {
    data.value = nil
    data.valueDescription = nil
    data.numberOfCharacters = nil
    data.secure = classified.secure
    data.classificationFailed = classified.failed
    data.valueUnread = true
    data.valueFailed = false
    data.descriptionUnread = true
    data.descriptionFailed = false
  }

  /// The element's data as the Markdown's classification found it closed or could not make it (#405, `classified`): its
  /// value attributes dropped, here and in the cache, so the node, the identity and every later read of this source carry
  /// none.
  private func close(_ element: AXUIElement, _ data: ElementData, _ classified: ValueClassification) -> ElementData {
    var closed = data
    ElementSource.markClosed(&closed, classified)
    dataCache[ElementKey(element: element)] = closed
    return closed
  }

  /// One request for `names`, timed.
  private func request(_ element: AXUIElement, _ names: [String]) -> AttributeRead? { costs.time("attributes") { fetch(element, names) } }

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
      let answer = copyActionNames(element)
      let read = decodedActionNames(answer.error, answer.names)
      if read != nil { unreadActions.remove(ElementKey(element: element)) } else { unreadActions.insert(ElementKey(element: element)) }
      return read ?? []
    }
  }

  /// The system's answer for the element's action names (the tests' seam).
  func copyActionNames(_ element: AXUIElement) -> (error: AXError, names: CFArray?) {
    var names: CFArray?
    let error = AXUIElementCopyActionNames(element, &names)
    return (error, names)
  }

  /// Whether the element's last `actions` read failed, so the empty list it answered is not known to be none (the stale
  /// point record's control, #431's review, finding 4).
  func actionsFailed(_ element: AXUIElement) -> Bool { unreadActions.contains(ElementKey(element: element)) }
  private var unreadActions: Set<ElementKey> = []

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
    // Fails closed: an element that cannot be classified now (a request that fails reads as its role unreadable) keeps
    // nothing read of it before.
    let classified = request(element, classifyingAttributes).map(valueClassification) ?? ValueClassification(closed: true, secure: true, failed: true)
    if classified.closed {
      data = close(element, data, classified)
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
