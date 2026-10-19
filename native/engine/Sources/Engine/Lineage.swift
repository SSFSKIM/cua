import ApplicationServices
import Foundation

// Tokens and handles (the spec's Design, "Indexes, tokens and handles"; R/F-helper-logic.md §3). Per (connection, app)
// the engine keeps a lineage: an id, the previous revision's tree of handles, and a table from token to element handle
// plus the eleven attributes the vendor re-resolves by and the owning pid. A token is "t" and the lineage's allocation
// number, opaque to the client; the model's indexes are the service's numbering over them. On every observation an
// element keeps its token when its handle is CFEqual to the previous revision's at a matched position (sibling list
// against sibling list under matched parents); a new element takes a new token; a token absent from one revision is
// retired there and never reissued in the lineage, so an element that returns gets a new one (N = 1, the vendor's
// identity rule). A walk cut short by the node or byte budget or the deadline retires nothing past the cut: the
// previous revision's entries it did not reach are carried over. An action names its lineage and a token; the engine
// refuses a token of another lineage or a retired one with the vendor's "no longer valid" sentence.

/// The wire's spelling of a lineage's `number`th token.
func elementToken(_ number: Int) -> String { "t\(number)" }

/// The allocation number a token spells; nil for anything that is not a token as `elementToken` writes one.
func tokenNumber(_ token: String) -> Int? {
  guard token.hasPrefix("t"), let number = Int(token.dropFirst()), number >= 0, elementToken(number) == token else { return nil }
  return number
}

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
/// plus the owning pid input is posted to (not part of the match: a panel's elements are matched whichever process
/// serves them now).
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
  fileprivate(set) var pid: pid_t

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
  var identity: ElementIdentity
  let actions: [String]
  let frame: CGRect?
}

extension ElementIdentity {
  /// The same identity served by another process (a re-fetch found it there).
  func owned(by owner: pid_t) -> ElementIdentity {
    var moved = self
    moved.pid = owner
    return moved
  }
}

/// One observation's tree of handles, by allocation number: the table, each node's children in order, the window's
/// root and the menu bar's items.
final class Revision {
  var entries: [Int: LineageEntry] = [:]
  var children: [Int: [Int]] = [:]
  var root: Int?
  var menu: [Int] = []

  /// A sibling list of this revision with its handles: the menu bar's items, a node's children, or (no parent) the
  /// window's root.
  func siblings(of parent: Int?, menu inMenu: Bool) -> [(index: Int, element: AXUIElement)] {
    let numbers: [Int] = inMenu ? menu : parent.map { children[$0] ?? [] } ?? (root.map { [$0] } ?? [])
    return numbers.compactMap { number in entries[number].map { (number, $0.element) } }
  }

  /// Copies `number` and everything below it in `other` into this revision; false when it is not there or already here.
  func carry(_ number: Int, from other: Revision) -> Bool {
    guard entries[number] == nil, let entry = other.entries[number] else { return false }
    entries[number] = entry
    let below = (other.children[number] ?? []).filter { carry($0, from: other) }
    if !below.isEmpty { children[number] = below }
    return true
  }

  /// The processes serving this revision's elements.
  var owners: Set<pid_t> { Set(entries.values.map(\.identity.pid)) }
}

final class Lineage {
  let id: String
  private(set) var revision = 0
  private(set) var nextNumber = 0
  private(set) var current: Revision?
  /// The screenshot of the lineage's last observation that returned one, which coordinate clicks are placed in
  /// (Screenshot.swift). An observation without a screenshot leaves it: the model's coordinates still come from it.
  var screenshot: ObservedScreenshot?
  /// Per process serving the lineage's elements, the watch over its layout changes and destroyed elements (F §3.5,
  /// which watches the app alone; cua watches every process whose elements the tree holds, a panel's service too).
  private var watches: [pid_t: (state: InvalidationState, monitor: InvalidationMonitor?)] = [:]

  init() { id = "L" + UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(12).lowercased() }

  /// A new allocation number; none is handed out twice in a lineage.
  func allocate() -> Int {
    defer { nextNumber += 1 }
    return nextNumber
  }

  /// The revision the observation in progress commits as, and so what its Skyshot reports: its screenshot, captured
  /// before the walk commits, is named with this.
  var nextRevision: Int { revision + 1 }

  /// Ends an observation: `next` becomes the revision actions resolve against.
  func commit(_ next: Revision) {
    revision += 1
    current = next
  }

  func entry(_ number: Int) -> LineageEntry? { current?.entries[number] }

  func replace(_ number: Int, element: AXUIElement, owner: pid_t) {
    current?.entries[number]?.element = element
    if let identity = current?.entries[number]?.identity { current?.entries[number]?.identity = identity.owned(by: owner) }
  }

  // MARK: The invalidation watch

  /// Watches `pids` from now on, dropping the watches of every other process. A watch that starts after the walk read its
  /// process's elements (`afterRead`) cannot vouch for the time between, so it invalidates until the next observation's
  /// reset. A process whose monitor cannot be registered stays unwatched, which `invalidates` treats as invalidated.
  func watch(_ pids: Set<pid_t>, afterRead: Bool) {
    for pid in watches.keys where !pids.contains(pid) { watches[pid] = nil }
    for pid in pids where watches[pid] == nil {
      let state = InvalidationState(invalidatedUntilReset: afterRead)
      guard let monitor = InvalidationMonitor(pid: pid, state: state) else { continue }
      watches[pid] = (state, monitor)
    }
  }

  /// A watch the caller made (the unit tests' seam).
  func adoptWatch(pid: pid_t, _ state: InvalidationState) { watches[pid] = (state, nil) }

  /// Starts a new observation's watch: what happened before it no longer matters.
  func resetWatches() { for watch in watches.values { watch.state.reset() } }

  /// Whether an action on `element`, served by `owner`, needs a re-fetch: a layout change in any watched process, the
  /// element's own destruction, or no watch over its process.
  func invalidates(_ element: AXUIElement, owner: pid_t) -> Bool {
    guard let own = watches[owner] else { return true }
    return own.state.destroyed(element) || watches.values.contains { $0.state.layoutChanged }
  }

  var watched: Int { watches.count }

  // MARK: Resolving a token

  /// The element `token` names in this lineage's current revision (F §3.5–3.7). Without an invalidation since the
  /// observation the handle is only validated (one AXRole read); otherwise it is re-read, then re-fetched by its eleven
  /// attributes under the app's primary window and menu bar, wherever its process. The vendor's sentences in the
  /// vendor's order: no such token → no longer valid; an invalid handle → no longer valid; the stored attributes matched
  /// by more or fewer than one element of the observed tree → "couldn't be started"; none now → no longer valid; several
  /// now → "couldn't be finished".
  func resolve(_ token: String, resolver: ElementResolver) throws -> LineageEntry {
    guard let number = tokenNumber(token), let entry = entry(number), let observed = current else { throw ElementErrors.noLongerValid }
    guard resolver.invalidated(entry) else {
      guard resolver.stillValid(entry.element) else { throw ElementErrors.noLongerValid }
      return entry
    }
    let source = resolver.source()
    if let live = source.data(entry.element), ElementIdentity(live, pid: entry.identity.pid).matches(entry.identity) {
      return entry
    }
    let before = observed.entries.values.filter { $0.identity.matches(entry.identity) }.count
    var found: [AXUIElement] = []
    if before == 1 {
      let tree = resolver.tree()
      found = matching(entry.identity, window: tree.window, menuItems: tree.menuItems, source: source)
    }
    switch RefetchVerdict.of(before: before, after: found.count) {
    case .ambiguousBefore: throw ElementErrors.ambiguousBeforeRefetch
    case .noLongerValid: throw ElementErrors.noLongerValid
    case .ambiguousAfter: throw ElementErrors.ambiguousAfterRefetch
    case .found:
      replace(number, element: found[0], owner: source.owner(found[0]))
      return self.entry(number)!
    }
  }
}

/// What resolving a token needs from the live system: the Accessibility API in the engine, a fake tree in the tests.
struct ElementResolver {
  /// Whether the element needs a re-fetch (`Lineage.invalidates`).
  var invalidated: (LineageEntry) -> Bool
  /// The one AXRole read that validates a handle: false only when the handle is no longer valid.
  var stillValid: (AXUIElement) -> Bool
  /// A fresh source for the re-read and the re-fetch's walk.
  var source: () -> ElementSource
  /// What a re-fetch walks: the app's primary window now and the menu bar's items.
  var tree: () -> (window: AXUIElement?, menuItems: [AXUIElement])

  /// The engine's: `lineage`'s watches, the live handle, and `pid`'s application element.
  static func live(_ lineage: Lineage, pid: pid_t) -> ElementResolver {
    ElementResolver(
      invalidated: { lineage.invalidates($0.element, owner: $0.identity.pid) },
      stillValid: { copyAttribute($0, kAXRoleAttribute).error != .invalidUIElement },
      source: { ElementSource() },
      tree: {
        let application = prepare(AXUIElementCreateApplication(pid))
        let menuItems = elementAttribute(application, kAXMenuBarAttribute).map { elementList(attribute($0, kAXChildrenAttribute)) } ?? []
        return (primaryWindow(of: application), menuItems)
      })
  }
}

/// The vendor's sibling rule (F §3.2), as old numbers for the new list (nil: a new element). The common prefix of
/// CFEqual handles keeps its tokens; of the rest, an element found among the remaining old siblings keeps its token
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

/// An action's element argument (Interfaces, EngineProtocol: `args.element`, the service's translation of the facade's
/// element_index): a token, which must come with the lineage it belongs to. Nil when the request names no element.
/// Checked before anything is resolved or read, so a malformed request is refused without touching the app.
func elementTokenArg(_ args: [String: Any], lineage: String?) throws -> String? {
  if args["element_index"] != nil { throw EngineError.invalidArguments("element_index is the facade's; the engine takes element, a token") }
  guard let given = args["element"] else { return nil }
  guard let token = given as? String, tokenNumber(token) != nil else { throw EngineError.invalidArguments("element must be an element token") }
  guard let lineage, !lineage.isEmpty else { throw EngineError.invalidArguments("lineage is required with an element token") }
  return token
}

extension ConnectionState {
  /// The element `token` names in the app's current lineage, which must be `wanted` (the lineage guard: a token of
  /// another lineage, or of one that ended with disableDiff, a relaunch or a reconnect, is no longer valid).
  func element(_ token: String, app: ResolvedApp, lineage wanted: String, resolver: (Lineage) -> ElementResolver) throws -> LineageEntry {
    guard let lineage = lineages[app.key], wanted == lineage.id else { throw ElementErrors.noLongerValid }
    return try lineage.resolve(token, resolver: resolver(lineage))
  }
}

/// The elements an observation would emit now (the window's tree, preorder, within its depth, width and node caps and
/// its deadline, then the menu bar's items) whose eleven attributes equal the identity's, whichever process serves them.
private func matching(_ identity: ElementIdentity, window: AXUIElement?, menuItems: [AXUIElement], source: ElementSource) -> [AXUIElement] {
  var found: [AXUIElement] = []
  // (element, depth, descend): menu-bar items are matched but never walked into, as the observation does.
  var stack: [(AXUIElement, Int, Bool)] = menuItems.reversed().map { (prepare($0), 0, false) }
  if let window { stack.append((prepare(window), 0, true)) }
  let windowFrame = window.flatMap { source.frame($0) }
  var visited = 0
  var seen = Set<ElementKey>()
  let deadline = monotonicMilliseconds() + Double(observationDeadlineMs)
  while let (element, depth, descend) = stack.popLast(), visited < maxObservedNodes, monotonicMilliseconds() < deadline {
    guard seen.insert(ElementKey(element: element)).inserted, let data = source.data(element) else { continue }
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
