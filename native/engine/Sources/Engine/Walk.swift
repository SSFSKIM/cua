import ApplicationServices
import Foundation

// One walk of a window and the menu bar's top-level items (the spec's Design, "Observation (skyshot)"; F §1.5, §1.8).
// Depth-first preorder, the order the text prints. Caps, each with its marker: the vendor's 200 levels (cua marks the
// cut, `truncated.depth`); the vendor's width rule (100 children, then the visible subset, children omitted above 499,
// carried on the node as `shown`); and cua's own node budget (4,000), per-value cut (10,000 characters, AX.swift), a
// 6 MiB budget for the serialized tree and a traversal deadline, the last three counted in `truncated.count`. Each node
// carries the lineage's token for its element (Lineage.swift): inherited sibling-structurally from the previous
// revision, a new element taking a new token. The engine numbers nothing for the model; the service does.

let maxDepth = 200
let maxObservedNodes = 4_000
let observationDeadlineMs: Int64 = 10_000
let skyshotByteBudget = 6 * 1024 * 1024
/// The width rule (F §1.5): up to this many children an element shows them all.
let widthThreshold = 100
/// Above this many children, an element with no visible subset shows none.
let widthOmitAbove = 499
/// `valueMarkdown` is fetched only for text elements whose plain value is at most this long.
let markdownMaxLength = 2_000
private let markdownRoles: Set<String> = [kAXTextAreaRole, kAXTextFieldRole]

/// Whether a walk reads an element's value settability: whenever it has a value (the vendor's value branch of
/// FUN_10074cb90 runs only for a value it holds) and the role's settability counts in the window (Derivations.swift).
func readsValueSettable(_ data: ElementData, parentRole: String?, chromium: Bool) -> Bool {
  data.value != nil && readsValueSettability(role: data.role, subrole: data.subrole, parentRole: parentRole, chromium: chromium)
}

/// A node's flags as the walk derives them (FUN_10074cb90; Derivations.swift).
struct NodeFlags {
  var settable = false
  var focusable = false
  var selectable = false
  var selected = false
  /// AXDisclosing listed and settable; nil when the element does not carry AXDisclosing.
  var disclosable: Bool?
}

struct WalkLimits {
  var depth = maxDepth
  var nodes = maxObservedNodes
  var bytes = skyshotByteBudget
  /// Monotonic ms after which the walk stops.
  var deadline: Double
}

/// `shown` on a node whose children the width rule cut: how many it kept of how many, and the positions it kept among
/// the element's children as half-open `[lower, upper]` runs (the vendor's `(showing lo-hi, … of N items)`).
struct Shown {
  let count: Int
  let of: Int
  let subset: String  // "visible" | "omitted"
  let ranges: [[Int]]

  var wire: [String: Any] { ["count": count, "of": of, "subset": subset, "ranges": ranges] }
}

/// Sorted positions as half-open runs: [0, 1, 2, 5] → [[0, 3], [5, 6]].
func positionRanges(_ positions: [Int]) -> [[Int]] {
  var runs: [[Int]] = []
  for position in Set(positions).sorted() {
    if let last = runs.last, last[1] == position { runs[runs.count - 1][1] = position + 1 } else { runs.append([position, position + 1]) }
  }
  return runs
}

/// The width rule (F §1.5): all children up to 100; above that the element's visible subset (AXVisibleChildren, else
/// AXVisibleRows); without one, none above 499, and below that the children whose frames meet `visibleFrame` (children
/// with no frame kept; no frame to meet keeps them all). `shown` is set only when the rule left some out.
func chooseChildren(of element: AXUIElement, data: ElementData, source: ElementSource, visibleFrame: CGRect?) -> (children: [AXUIElement], shown: Shown?) {
  let all = data.children
  let total = all.count
  if total <= widthThreshold { return (all, nil) }
  if let visible = source.visibleChildren(element), !visible.isEmpty {
    guard visible.count < total else { return (visible, nil) }
    var positions: [ElementKey: Int] = [:]
    for (position, child) in all.enumerated() where positions[ElementKey(element: child)] == nil {
      positions[ElementKey(element: child)] = position
    }
    let kept = visible.compactMap { positions[ElementKey(element: $0)] }
    return (visible, Shown(count: visible.count, of: total, subset: "visible", ranges: positionRanges(kept)))
  }
  if total > widthOmitAbove { return ([], Shown(count: 0, of: total, subset: "omitted", ranges: [])) }
  guard let visibleFrame else { return (all, nil) }
  let kept = all.indices.filter { source.frame(all[$0]).map { $0.intersects(visibleFrame) } ?? true }
  guard kept.count < total else { return (all, nil) }
  return (kept.map { all[$0] }, Shown(count: kept.count, of: total, subset: "visible", ranges: positionRanges(kept)))
}

/// The bytes `value` takes in the engine's JSON (JSONSerialization, slashes unescaped, UTF-8 unescaped above 0x7F):
/// strings with their escapes, numbers at their longest, containers with their punctuation.
func jsonBytes(_ value: Any) -> Int {
  switch value {
  case let string as String: return jsonStringBytes(string)
  case is NSNull: return 4
  case let number as NSNumber:
    return CFGetTypeID(number) == CFBooleanGetTypeID() ? 5 : 24
  case let array as [Any]: return 2 + array.reduce(0) { $0 + jsonBytes($1) + 1 }
  case let object as [String: Any]: return 2 + object.reduce(0) { $0 + jsonStringBytes($1.key) + 2 + jsonBytes($1.value) }
  default: return 24
  }
}

func jsonStringBytes(_ string: String) -> Int {
  var bytes = 2
  for byte in string.utf8 {
    switch byte {
    case 0x22, 0x5C, 0x08, 0x0C, 0x0A, 0x0D, 0x09: bytes += 2
    case 0x00..<0x20: bytes += 6
    default: bytes += 1
    }
  }
  return bytes
}

final class TreeWalk {
  let source: ElementSource
  let lineage: Lineage
  let previous: Revision?
  let limits: WalkLimits
  let markdown: Bool
  /// Whether `focusable` and `selectable` are read (one settability call each per element); the spike's switch.
  let interactionFlags: Bool
  /// Whether the window is Chromium's (`isChromium`, F §1.7), where value settability counts only for some roles.
  let chromium: Bool
  let visibleFrame: CGRect?

  private(set) var nodes: [[String: Any]] = []
  private(set) var menuBar: [[String: Any]] = []
  private(set) var revision: Revision
  /// Every element the walk emitted, by handle, to its allocation number in the lineage.
  private(set) var seen: [ElementKey: Int] = [:]
  private(set) var bytes = 0
  /// Elements left unwalked by the node or byte budget or the deadline.
  private(set) var omitted = 0
  private(set) var depthHit = false
  private(set) var deadlineHit = false
  private(set) var budgetHit = false
  private(set) var nodeCapHit = false
  private(set) var failures = 0
  private(set) var markdownFetches = 0
  /// Nodes whose element is a title, with the elements it serves, mapped to tokens once the walk is done.
  private var titles: [(inMenu: Bool, position: Int, targets: [AXUIElement])] = []
  /// The action descriptions the system was asked for in this walk (its answer, else the action's name), by process
  /// and action name: one description call each.
  private var descriptions: [String: String] = [:]

  private struct Pending {
    let element: AXUIElement
    let depth: Int
    let parent: Int?
    let inherited: Int?
    let inMenu: Bool
    var parentRole: String? = nil
    /// Read through the attributes it lists (the menu bar and its items).
    var listedRead = false
  }

  /// One element read, not yet numbered.
  private struct Read {
    let element: AXUIElement
    let data: ElementData
    let owner: pid_t
    let actions: [String]
    let actionDescriptions: [String?]
    let flags: NodeFlags
    let url: String?
    let valueMarkdown: String?
    let children: [AXUIElement]
    let shown: Shown?
  }

  private enum Outcome {
    case read(Read)
    case failed
    case deadline
  }

  init(source: ElementSource, lineage: Lineage, limits: WalkLimits, markdown: Bool, interactionFlags: Bool = true, chromium: Bool = false,
       visibleFrame: CGRect?) {
    self.source = source
    self.lineage = lineage
    previous = lineage.current
    self.limits = limits
    self.markdown = markdown
    self.interactionFlags = interactionFlags
    self.chromium = chromium
    self.visibleFrame = visibleFrame
    revision = Revision()
  }

  /// The token of an element this walk emitted; nil for one it did not.
  func token(of element: AXUIElement) -> String? { seen[ElementKey(element: element)].map(elementToken) }

  /// Walks `window` then the menu bar, numbering both in one lineage (the menu bar after the window's nodes), as the
  /// vendor's `addMenuBarWithImmediateItems` 0x1007569b8 adds it: the AXMenuBar element at depth 0 and, at depth 1
  /// under it, its top-level items (`menuItems`, its AXChildren) but the first, the system's Apple menu, and any whose
  /// title contains `Debug`; each read through the attributes it lists (FUN_1007542cc's fallback; F §1.3). A bar that
  /// cannot be read gives no menu-bar nodes at all. The menu bar is read first and its nodes and bytes reserved, so a
  /// cut of the window's walk by the node or byte budget never drops it.
  func run(window: AXUIElement, menuBar: AXUIElement?, menuItems: [AXUIElement]) {
    let menuElements = menuBarElements(bar: menuBar, items: menuItems)
    let menuInherited = previous.map { matchSiblings(old: $0.siblings(of: nil, menu: true), new: menuElements) } ?? Array(repeating: nil, count: menuElements.count)
    let menuPending = zip(menuElements, menuInherited).enumerated().map { position, pair in
      Pending(element: pair.0, depth: position == 0 ? 0 : 1, parent: nil, inherited: pair.1, inMenu: true,
              parentRole: position == 0 ? nil : kAXMenuBarRole, listedRead: true)
    }
    var menuReads: [(Pending, Read)] = []
    var menuUnread: [Pending] = []
    var reservedBytes = 0
    reading: for (position, pending) in menuPending.enumerated() {
      if monotonicMilliseconds() >= limits.deadline { menuUnread = Array(menuPending[position...]); break }
      switch read(pending) {
      case .read(let read):
        if position > 0, isDebugMenuItem(read.data) { continue }
        menuReads.append((pending, read))
        reservedBytes += jsonBytes(wire(read, number: lineage.nextNumber, depth: pending.depth)) + 1
      case .failed:
        failures += 1
        if position == 0 { break reading }
      case .deadline:
        menuUnread = Array(menuPending[position...])
        break reading
      }
    }

    let rootInherited = previous.flatMap { matchSiblings(old: $0.siblings(of: nil, menu: false), new: [window]).first ?? nil }
    walkWindow(Pending(element: window, depth: 0, parent: nil, inherited: rootInherited, inMenu: false),
               nodeLimit: limits.nodes - menuReads.count, byteLimit: limits.bytes - reservedBytes)

    for (pending, read) in menuReads where seen[ElementKey(element: read.element)] == nil { emit(read, pending) }
    // The menu bar's node counts the items emitted under it (the walk reads them beside it, not through AXChildren).
    if !self.menuBar.isEmpty { self.menuBar[0]["children"] = self.menuBar.count - 1 }
    if !menuUnread.isEmpty { cut(.deadline, remaining: menuUnread) }
    resolveTitles()
  }

  private func walkWindow(_ root: Pending, nodeLimit: Int, byteLimit: Int) {
    var stack = [root]
    while let next = stack.popLast() {
      if let stop = stopReason(nodeLimit: nodeLimit, byteLimit: byteLimit) {
        cut(stop, remaining: [next] + stack.reversed())
        return
      }
      if seen[ElementKey(element: next.element)] != nil { continue }
      switch read(next) {
      case .failed: failures += 1
      case .deadline:
        cut(.deadline, remaining: [next] + stack.reversed())
        return
      case .read(let read):
        let number = emit(read, next)
        // A node that kept its token has its children matched against the previous revision's; a new node's are new.
        let inherited: [Int?]
        if let previous, next.inherited != nil {
          inherited = matchSiblings(old: previous.siblings(of: number, menu: false), new: read.children)
        } else {
          inherited = Array(repeating: nil, count: read.children.count)
        }
        for (child, childInherited) in zip(read.children, inherited).reversed() {
          stack.append(Pending(element: child, depth: next.depth + 1, parent: number, inherited: childInherited, inMenu: false,
                               parentRole: read.data.role))
        }
      }
    }
  }

  private enum Stop { case nodes, bytes, deadline }

  private func stopReason(nodeLimit: Int, byteLimit: Int) -> Stop? {
    if bytes >= byteLimit { return .bytes }
    if nodes.count >= nodeLimit { return .nodes }
    if monotonicMilliseconds() >= limits.deadline { return .deadline }
    return nil
  }

  /// The walk stops: what is left is counted, and the previous revision's entries for it are carried over, so a token
  /// past the cut stays resolvable and is not retired.
  private func cut(_ reason: Stop, remaining: [Pending]) {
    switch reason {
    case .nodes: nodeCapHit = true
    case .bytes: budgetHit = true
    case .deadline: deadlineHit = true
    }
    omitted += remaining.count
    guard let previous else { return }
    for pending in remaining {
      guard let inherited = pending.inherited, revision.carry(inherited, from: previous) else { continue }
      attach(inherited, pending)
    }
  }

  private func attach(_ number: Int, _ pending: Pending) {
    if pending.inMenu { revision.menu.append(number) }
    else if let parent = pending.parent { revision.children[parent, default: []].append(number) }
    else { revision.root = number }
  }

  private func pastDeadline() -> Bool { monotonicMilliseconds() >= limits.deadline }

  /// Reads one element: its attributes, owner, actions, flags, Markdown and the children the width rule keeps. The
  /// deadline is checked between a node's calls, not only between nodes, so one slow element cannot overrun it.
  private func read(_ pending: Pending) -> Outcome {
    let element = prepare(pending.element)
    guard let data = pending.listedRead ? source.listedData(element) : source.data(element) else { return .failed }
    if pastDeadline() { return .deadline }
    let owner = source.owner(element)
    let actions = source.actions(element)
    let actionDescriptions = actions.map { describe(action: $0, of: element, owner: owner) }
    if pastDeadline() { return .deadline }
    // FUN_10074cb90's full-UI-context flags (Derivations.swift).
    var flags = NodeFlags()
    flags.settable = readsValueSettable(data, parentRole: pending.parentRole, chromium: chromium)
      && source.isSettable(element, kAXValueAttribute, phase: "settable")
    flags.focusable = interactionFlags && data.focused != nil && source.isSettable(element, kAXFocusedAttribute, phase: "focusable")
    flags.selectable = selectableRole(data.role) && interactionFlags && data.selected != nil
      && source.isSettable(element, kAXSelectedAttribute, phase: "selectable")
    flags.selected = isSelected(selected: data.selected, traits: data.traits)
    if data.disclosing != nil { flags.disclosable = source.isSettable(element, kAXDisclosingAttribute, phase: "disclosable") }
    let url = nodeURL(role: data.role, url: data.url) { source.document(element) }
    if pastDeadline() { return .deadline }
    var valueMarkdown: String?
    if markdown, markdownRoles.contains(data.role),
       let text = data.value.flatMap({ CFGetTypeID($0) == CFStringGetTypeID() ? ($0 as! String) : nil }) {
      let length = text.utf16.count
      if length > 0 && length <= markdownMaxLength {
        valueMarkdown = source.markdown(element, length: length)
        markdownFetches += 1
      }
    }
    var children: [AXUIElement] = []
    var shown: Shown?
    if !pending.inMenu {
      if pending.depth < limits.depth {
        (children, shown) = chooseChildren(of: element, data: data, source: source, visibleFrame: visibleFrame)
      } else if !data.children.isEmpty {
        depthHit = true
      }
    }
    if pastDeadline() { return .deadline }
    return .read(Read(element: element, data: data, owner: owner, actions: actions, actionDescriptions: actionDescriptions, flags: flags,
                      url: url, valueMarkdown: valueMarkdown, children: children, shown: shown))
  }

  /// An action's description, FUN_1007816a0 as FUN_1007515a8 pairs it: nil for an action the fixed table or a custom
  /// `Name:` describes (Derivations.swift; the renderer prints those words, and the system is not asked), else the
  /// system's description, else the action's name. Descriptions are the app's per action name, so a walk asks once per
  /// process and name (cua's; the vendor asks per element).
  private func describe(action: String, of element: AXUIElement, owner: pid_t) -> String? {
    guard asksSystemForDescription(action) else { return nil }
    let key = "\(owner)\u{0}\(action)"
    if let known = descriptions[key] { return known }
    let description = source.actionDescription(element, action) ?? action
    descriptions[key] = description
    return description
  }

  private func wire(_ read: Read, number: Int, depth: Int) -> [String: Any] {
    var node = nodeWire(token: elementToken(number), depth: depth, pid: read.owner, data: read.data, actions: read.actions, flags: read.flags,
                        valueMarkdown: read.valueMarkdown, children: read.children.count, shown: read.shown)
    node["actionDescriptions"] = read.actionDescriptions.map { $0 ?? NSNull() as Any }
    if let url = read.url { node["url"] = url }
    // The facts filterActions keeps a page scroll by (FUN_100782c24), read only for a node that has one.
    if read.actions.contains(where: { pageScrolls.contains($0) }) {
      let bars = source.scrollBars(read.element)
      node["scrollBars"] = ["horizontal": bars.horizontal, "vertical": bars.vertical]
    }
    return node
  }

  /// Tokens a read element (its inherited token, else a new one) and adds its node and its table entry.
  @discardableResult
  private func emit(_ read: Read, _ pending: Pending) -> Int {
    let number = pending.inherited ?? lineage.allocate()
    seen[ElementKey(element: read.element)] = number
    let node = wire(read, number: number, depth: pending.depth)
    bytes += jsonBytes(node) + 1
    if let targets = read.data.servesAsTitleFor, !targets.isEmpty {
      titles.append((pending.inMenu, pending.inMenu ? menuBar.count : nodes.count, targets))
    }
    if pending.inMenu { menuBar.append(node) } else { nodes.append(node) }
    revision.entries[number] = LineageEntry(element: read.element, identity: ElementIdentity(read.data, pid: read.owner), actions: read.actions, frame: read.data.frame)
    attach(number, pending)
    return number
  }

  /// `servesAsTitleFor`: the tokens of the emitted elements a title serves, known only once the walk is done (a title
  /// often precedes what it names).
  private func resolveTitles() {
    for title in titles {
      let tokens = title.targets.compactMap { token(of: $0) }
      guard !tokens.isEmpty else { continue }
      if title.inMenu { menuBar[title.position]["servesAsTitleFor"] = tokens } else { nodes[title.position]["servesAsTitleFor"] = tokens }
      bytes += jsonBytes(tokens) + jsonStringBytes("servesAsTitleFor") + 2
    }
  }
}

/// The menu-bar elements an observation reads, in order (`addMenuBarWithImmediateItems` 0x1007569b8): the AXMenuBar
/// element, then its top-level items but the first, the system's Apple menu; none without a bar.
func menuBarElements(bar: AXUIElement?, items: [AXUIElement]) -> [AXUIElement] {
  bar.map { [$0] + items.dropFirst() } ?? []
}

/// A menu-bar item the vendor leaves out by its title (0x1007569b8).
func isDebugMenuItem(_ data: ElementData) -> Bool { data.title?.contains("Debug") == true }

private let pageScrolls: Set<String> = ["AXScrollLeftByPage", "AXScrollRightByPage", "AXScrollUpByPage", "AXScrollDownByPage"]

/// A Skyshot node (Interfaces, Node): the optional attributes present only when the element carries them.
func nodeWire(token: String, depth: Int, pid: pid_t, data: ElementData, actions: [String], flags: NodeFlags,
              valueMarkdown: String?, children: Int, shown: Shown?) -> [String: Any] {
  var flagsWire: [String: Any] = [
    "enabled": data.enabled ?? true,
    "focused": data.focused ?? false,
    "focusable": flags.focusable,
    "selected": flags.selected,
    "selectable": flags.selectable,
    "settable": flags.settable,
  ]
  if let disclosing = data.disclosing {
    flagsWire["disclosable"] = flags.disclosable ?? false
    flagsWire["expanded"] = disclosing
  }
  var node: [String: Any] = [
    "token": token, "depth": depth, "pid": Int(pid), "role": data.role, "subrole": data.subrole ?? NSNull(),
    "roleDescription": data.roleDescription ?? NSNull(), "title": data.title ?? NSNull(), "description": data.description ?? NSNull(),
    "value": scalar(data.value) ?? NSNull(),
    "valueType": data.value.map { valueTypeName(of: $0, role: data.role, subrole: data.subrole) } ?? NSNull(),
    "valueMarkdown": valueMarkdown ?? NSNull(),
    "identifier": data.identifier ?? NSNull(), "flags": flagsWire, "actions": actions, "frame": rectWire(data.frame),
    "children": children,
  ]
  if let valueDescription = data.valueDescription { node["valueDescription"] = valueDescription }
  if let placeholder = data.placeholder { node["placeholder"] = placeholder }
  if let numberOfCharacters = data.numberOfCharacters { node["numberOfCharacters"] = numberOfCharacters }
  if let help = data.help { node["help"] = help }
  if let url = data.url { node["url"] = url }
  if let traits = data.traits { node["traits"] = traits }
  if let rows = data.rowIndexRange { node["rowIndexRange"] = rows }
  if let columns = data.columnIndexRange { node["columnIndexRange"] = columns }
  if let domClassList = data.domClassList { node["domClassList"] = domClassList }
  if let shown { node["shown"] = shown.wire }
  return node
}

private let monospaceFamilies = ["menlo", "monaco", "courier", "sf mono", "sfmono", "andale mono", "consolas", "source code"]

/// The Markdown rendering of a text element's attributed value: bold, italic and fixed-width runs from the font each
/// run carries; nil when the value carries no such styling (the plain value then says everything).
func markdownRendering(of element: AXUIElement, length: Int) -> String? {
  var range = CFRange(location: 0, length: length)
  guard let rangeValue = AXValueCreate(.cfRange, &range) else { return nil }
  var result: CFTypeRef?
  guard AXUIElementCopyParameterizedAttributeValue(element, kAXAttributedStringForRangeParameterizedAttribute as CFString, rangeValue, &result) == .success,
        let result, CFGetTypeID(result) == CFAttributedStringGetTypeID() else { return nil }
  let attributed = result as! NSAttributedString
  let text = attributed.string as NSString
  var rendered = ""
  var styled = false
  attributed.enumerateAttributes(in: NSRange(location: 0, length: attributed.length)) { attributes, run, _ in
    let piece = text.substring(with: run)
    let font = attributes[NSAttributedString.Key("AXFont")] as? [String: Any]
    let name = ((font?["AXFontName"] as? String) ?? "").lowercased()
    let family = ((font?["AXFontFamily"] as? String) ?? "").lowercased()
    let mono = monospaceFamilies.contains { name.contains($0) || family.contains($0) }
    let bold = !mono && ["bold", "black", "heavy", "semibold"].contains { name.contains($0) }
    let italic = !mono && (name.contains("italic") || name.contains("oblique"))
    let marker = mono ? "`" : (bold ? "**" : "") + (italic ? "*" : "")
    let core = piece.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !marker.isEmpty, !core.isEmpty else { rendered += piece; return }
    styled = true
    let leading = piece.prefix { $0.isWhitespace || $0.isNewline }
    let trailing = String(piece.reversed().prefix { $0.isWhitespace || $0.isNewline }.reversed())
    rendered += leading + marker + core + String(marker.reversed()) + trailing
  }
  return styled ? bounded(rendered) : nil
}
