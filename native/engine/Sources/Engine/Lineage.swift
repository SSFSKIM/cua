import ApplicationServices
import Foundation

// Indexes and handles (the spec's Design, "Indexes and handles"; R/F-helper-logic.md §3). Per (connection, app) the
// engine keeps a lineage: an id, the previous revision's tree of handles, and a table from index to element handle
// plus the eleven attributes the vendor re-resolves by and the owning pid. Indexes are 0-based in preorder over the
// nodes the engine emits for a fresh lineage. On every observation an element keeps its index when its handle is
// CFEqual to the previous revision's at a matched position (sibling list against sibling list under matched parents);
// a new element takes the next unused index; a vanished element's index is retired and never reused in the lineage
// (cua's departure: the vendor reuses indexes above the surviving maximum). A walk cut short by the node or byte budget
// or the deadline retires nothing past the cut: the previous revision's entries it did not reach are carried over.

/// One connection's state, touched only by that connection's thread.
final class ConnectionState: @unchecked Sendable {
  let id: Int
  let fd: Int32
  /// Lineages by app key (`ResolvedApp.key`).
  var lineages: [String: Lineage] = [:]
  /// Apps whose actions are refused until a fresh get_app_state, after an intervention.
  var requiresRequery: Set<String> = []
  /// Apps acted on since their last observation, whose next get_app_state settles first (the vendor's deferred
  /// settle, F §8.6). An input method calls `markActed` once its events are posted.
  var needsSettle: Set<String> = []

  init(id: Int, fd: Int32) {
    self.id = id
    self.fd = fd
  }

  func markActed(_ app: ResolvedApp) { needsSettle.insert(app.key) }
}

/// What a re-fetch matches an element by: the vendor's eleven attributes (F §3.6; exact equality, nil equal to nil),
/// plus the owning pid input is posted to (not part of the match).
struct ElementIdentity {
  let role: String
  let subrole: String?
  let roleDescription: String?
  let title: String?
  let value: String?
  let valueDescription: String?
  let description: String?
  let placeholder: String?
  let help: String?
  let identifier: String?
  let url: String?
  let pid: pid_t

  init(_ data: ElementData, pid: pid_t) {
    role = data.role
    subrole = data.subrole
    roleDescription = data.roleDescription
    title = data.title
    value = identityValue(data.value)
    valueDescription = data.valueDescription
    description = data.description
    placeholder = data.placeholder
    help = data.help
    identifier = data.identifier
    url = data.url
    self.pid = pid
  }

  func matches(_ other: ElementIdentity) -> Bool {
    role == other.role && subrole == other.subrole && roleDescription == other.roleDescription && title == other.title
      && value == other.value && valueDescription == other.valueDescription && description == other.description
      && placeholder == other.placeholder && help == other.help && identifier == other.identifier && url == other.url
  }
}

/// A value's comparable form: its type and its text (strings bounded as the tree carries them).
private func identityValue(_ value: CFTypeRef?) -> String? {
  guard let value else { return nil }
  let type = CFGetTypeID(value)
  if type == CFBooleanGetTypeID() { return "b:\(CFBooleanGetValue((value as! CFBoolean)))" }
  if type == CFNumberGetTypeID() { return "n:\(value as! NSNumber)" }
  if type == CFURLGetTypeID() { return "u:" + bounded((value as! URL).absoluteString) }
  if type == CFStringGetTypeID() { return "s:" + bounded(value as! String) }
  if type == CFAttributedStringGetTypeID() { return "s:" + bounded((value as! NSAttributedString).string) }
  return nil
}

struct LineageEntry {
  var element: AXUIElement
  let identity: ElementIdentity
  let actions: [String]
  let frame: CGRect?
}

/// One observation's tree of handles: the table, each node's children in order, the window's root and the menu bar's
/// items, and the route that fetched it (a re-fetch reads with the same route, so values compare alike).
final class Revision {
  var entries: [Int: LineageEntry] = [:]
  var children: [Int: [Int]] = [:]
  var root: Int?
  var menu: [Int] = []
  let route: FetchRoute

  init(route: FetchRoute) { self.route = route }

  /// A sibling list of this revision with its handles: the menu bar's items, a node's children, or (no parent) the
  /// window's root.
  func siblings(of parent: Int?, menu inMenu: Bool) -> [(index: Int, element: AXUIElement)] {
    let indexes: [Int] = inMenu ? menu : parent.map { children[$0] ?? [] } ?? (root.map { [$0] } ?? [])
    return indexes.compactMap { index in entries[index].map { (index, $0.element) } }
  }

  /// Copies `index` and everything below it in `other` into this revision; false when it is not there or already here.
  func carry(_ index: Int, from other: Revision) -> Bool {
    guard entries[index] == nil, let entry = other.entries[index] else { return false }
    entries[index] = entry
    let below = (other.children[index] ?? []).filter { carry($0, from: other) }
    if !below.isEmpty { children[index] = below }
    return true
  }
}

final class Lineage {
  let id: String
  private(set) var revision = 0
  private(set) var nextIndex = 0
  private(set) var current: Revision?
  /// Watches for the layout changes and destroyed elements that make a re-fetch necessary (F §3.5).
  var monitor: InvalidationMonitor?
  /// The screenshot of the lineage's last observation that returned one, which coordinate clicks are placed in
  /// (Screenshot.swift). An observation without a screenshot leaves it: the model's coordinates still come from it.
  var screenshot: ObservedScreenshot?

  init() { id = "L" + UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(12).lowercased() }

  /// The next unused index; an index is never handed out twice in a lineage.
  func allocate() -> Int {
    defer { nextIndex += 1 }
    return nextIndex
  }

  /// The revision the observation in progress commits as, and so what its Skyshot reports: its screenshot, captured
  /// before the walk commits, is named with this.
  var nextRevision: Int { revision + 1 }

  /// Ends an observation: `next` becomes the revision actions resolve against.
  func commit(_ next: Revision) {
    revision += 1
    current = next
  }

  func entry(_ index: Int) -> LineageEntry? { current?.entries[index] }

  func replace(_ index: Int, element: AXUIElement) { current?.entries[index]?.element = element }
}

/// The vendor's sibling rule (F §3.2), as old indexes for the new list (nil: a new element). The common prefix of
/// CFEqual handles keeps its indexes; of the rest, an element found among the remaining old siblings keeps its index
/// only when it is in the longest run whose old positions increase (the stable set), so a reordered element takes a
/// new one.
func matchSiblings(old: [(index: Int, element: AXUIElement)], new: [AXUIElement]) -> [Int?] {
  var result = [Int?](repeating: nil, count: new.count)
  var prefix = 0
  while prefix < old.count, prefix < new.count, CFEqual(old[prefix].element, new[prefix]) {
    result[prefix] = old[prefix].index
    prefix += 1
  }
  var remaining: [ElementKey: Int] = [:]
  for offset in prefix..<old.count where remaining[ElementKey(element: old[offset].element)] == nil {
    remaining[ElementKey(element: old[offset].element)] = offset
  }
  var candidates: [(position: Int, offset: Int)] = []
  for position in prefix..<new.count {
    if let offset = remaining.removeValue(forKey: ElementKey(element: new[position])) { candidates.append((position, offset)) }
  }
  for chosen in longestIncreasingRun(candidates.map(\.offset)) {
    let candidate = candidates[chosen]
    result[candidate.position] = old[candidate.offset].index
  }
  return result
}

/// The positions in `values` of one longest strictly increasing subsequence.
func longestIncreasingRun(_ values: [Int]) -> [Int] {
  var tails: [Int] = []  // per run length, the position of the smallest value ending such a run
  var previous = [Int](repeating: -1, count: values.count)
  for (position, value) in values.enumerated() {
    var low = 0, high = tails.count
    while low < high {
      let middle = (low + high) / 2
      if values[tails[middle]] < value { low = middle + 1 } else { high = middle }
    }
    if low > 0 { previous[position] = tails[low - 1] }
    if low == tails.count { tails.append(position) } else { tails[low] = position }
  }
  var run: [Int] = []
  var position = tails.last ?? -1
  while position >= 0 {
    run.append(position)
    position = previous[position]
  }
  return run.reversed()
}

enum ElementErrors {
  static let noLongerValid = EngineError(name: "elementNoLongerValid",
    "The element ID is no longer valid. Try to get the on-screen content again and see if that resolves the issue.")
  static let ambiguousBeforeRefetch = EngineError(name: "elementAmbiguousBeforeRefetch",
    "The element was invalidated, and an attempt was made to refetch it, but the refetch couldn't be started because multiple elements were found that match the criteria. Try to get the on-screen content again and see if that resolves the issue.")
  static let ambiguousAfterRefetch = EngineError(name: "elementAmbiguousAfterRefetch",
    "The element was invalidated, and an attempt was made to refetch it, but the refetch couldn't be finished because multiple elements were found that match the criteria. Try to get the on-screen content again and see if that resolves the issue.")
  static func invalid(_ index: Int) -> EngineError { EngineError(name: "invalidElementID", "\(index) is an invalid element ID") }
}

/// The re-fetch's verdict from its two counts (F §3.6): the stored element's matches in the observed tree (anything
/// but one: "couldn't be started"), then in the tree walked now (none: no longer valid; several: "couldn't be
/// finished").
enum RefetchVerdict: Equatable {
  case ambiguousBefore, noLongerValid, ambiguousAfter, found

  static func of(before: Int, after: Int) -> RefetchVerdict {
    guard before == 1 else { return .ambiguousBefore }
    switch after {
    case 0: return .noLongerValid
    case 1: return .found
    default: return .ambiguousAfter
    }
  }
}

extension ConnectionState {
  /// The element an action names: index `index` of the app's current lineage, which must be `lineage` when the action
  /// names one. Without a layout change or the element's destruction since the observation the handle is only
  /// validated (one AXRole read); otherwise it is re-read, then re-fetched by its eleven attributes under `window` and
  /// the app's menu bar.
  func element(_ index: Int, app: ResolvedApp, lineage wanted: String?, window: () -> AXUIElement?) throws -> LineageEntry {
    guard let lineage = lineages[app.key], wanted == nil || wanted == lineage.id else { throw ElementErrors.noLongerValid }
    guard index >= 0, index < lineage.nextIndex else { throw ElementErrors.invalid(index) }
    guard let entry = lineage.entry(index), let observed = lineage.current else { throw ElementErrors.noLongerValid }
    // A lineage without a monitor (it could not be registered) counts as invalidated: the re-fetch is the safe path.
    guard lineage.monitor?.invalidates(entry.element) ?? true else {
      if copyAttribute(entry.element, kAXRoleAttribute).error == .invalidUIElement { throw ElementErrors.noLongerValid }
      return entry
    }
    let source = makeSource(observed.route)
    if let live = source.data(entry.element, subtree: false), ElementIdentity(live, pid: entry.identity.pid).matches(entry.identity) {
      return entry
    }
    let before = observed.entries.values.filter { $0.identity.matches(entry.identity) }.count
    var found: [AXUIElement] = []
    if before == 1 {
      var menuItems: [AXUIElement] = []
      if let pid = app.pid, let menuBar = elementAttribute(prepare(AXUIElementCreateApplication(pid)), kAXMenuBarAttribute) {
        menuItems = elementList(attribute(menuBar, kAXChildrenAttribute))
      }
      found = matching(entry.identity, window: window(), menuItems: menuItems, source: source)
    }
    switch RefetchVerdict.of(before: before, after: found.count) {
    case .ambiguousBefore: throw ElementErrors.ambiguousBeforeRefetch
    case .noLongerValid: throw ElementErrors.noLongerValid
    case .ambiguousAfter: throw ElementErrors.ambiguousAfterRefetch
    case .found:
      lineage.replace(index, element: found[0])
      return lineage.entry(index)!
    }
  }
}

/// The elements an observation would emit now (the window's tree, preorder, within its depth, width and node caps and
/// its deadline, then the menu bar's items) whose eleven attributes equal the identity's.
private func matching(_ identity: ElementIdentity, window: AXUIElement?, menuItems: [AXUIElement], source: ElementSource) -> [AXUIElement] {
  var found: [AXUIElement] = []
  // (element, depth, descend): menu-bar items are matched but never walked into, as the observation does.
  var stack: [(AXUIElement, Int, Bool)] = menuItems.reversed().map { (prepare($0), 0, false) }
  if let window { stack.append((prepare(window), 0, true)) }
  let windowFrame = window.flatMap(frame(of:))
  var visited = 0
  var seen = Set<ElementKey>()
  let deadline = monotonicMilliseconds() + Double(observationDeadlineMs)
  while let (element, depth, descend) = stack.popLast(), visited < maxObservedNodes, monotonicMilliseconds() < deadline {
    guard seen.insert(ElementKey(element: element)).inserted, let data = source.data(element, subtree: descend) else { continue }
    visited += 1
    if ElementIdentity(data, pid: identity.pid).matches(identity) { found.append(element) }
    if descend && depth < maxDepth {
      for child in chooseChildren(of: element, data: data, source: source, visibleFrame: windowFrame).children.reversed() {
        stack.append((prepare(child), depth + 1, true))
      }
    }
  }
  return found
}
