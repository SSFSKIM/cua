import ApplicationServices
import Foundation

// One walk of a window and the menu bar's top-level items (the spec's Design, "Observation (skyshot)"; F §1.5, §1.8).
// Depth-first preorder, the order the text prints. Caps, each with its marker: the vendor's 200 levels (cua marks the
// cut, `truncated.depth`); the vendor's width rule (100 children, then the visible subset, children omitted above 499,
// carried on the node as `shown`); and cua's own node budget (4,000), per-value cut (10,000 characters, AX.swift), a
// 6 MiB budget for the serialized tree and a traversal deadline, the last three counted in `truncated.count`. Numbering
// is the lineage's (Lineage.swift): inherited sibling-structurally from the previous revision, new elements taking the
// next unused index.

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
  let total = data.childCount
  if total <= widthThreshold {
    return (data.children.count == total ? data.children : source.allChildren(element), nil)
  }
  if let visible = source.visibleChildren(element), !visible.isEmpty {
    guard visible.count < total else { return (visible, nil) }
    // Positions among all the children: the fetched list when it is whole, else a full read (a capped route).
    let all = data.children.count == total ? data.children : source.allChildren(element)
    var positions: [ElementKey: Int] = [:]
    for (position, child) in all.enumerated() where positions[ElementKey(element: child)] == nil {
      positions[ElementKey(element: child)] = position
    }
    let kept = visible.compactMap { positions[ElementKey(element: $0)] }
    return (visible, Shown(count: visible.count, of: total, subset: "visible", ranges: positionRanges(kept)))
  }
  if total > widthOmitAbove { return ([], Shown(count: 0, of: total, subset: "omitted", ranges: [])) }
  let all = source.allChildren(element)
  guard let visibleFrame else { return (all, nil) }
  let kept = all.indices.filter { source.frame(all[$0]).map { $0.intersects(visibleFrame) } ?? true }
  guard kept.count < all.count else { return (all, nil) }
  return (kept.map { all[$0] }, Shown(count: kept.count, of: max(total, all.count), subset: "visible", ranges: positionRanges(kept)))
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
  let visibleFrame: CGRect?

  private(set) var nodes: [[String: Any]] = []
  private(set) var menuBar: [[String: Any]] = []
  private(set) var revision: Revision
  /// Every element the walk emitted, by handle, to its index.
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
  /// Nodes whose element is a title, with the elements it serves, mapped to indexes once the walk is done.
  private var titles: [(inMenu: Bool, position: Int, targets: [AXUIElement])] = []

  private struct Pending {
    let element: AXUIElement
    let depth: Int
    let parent: Int?
    let inherited: Int?
    let inMenu: Bool
  }

  /// One element read, not yet numbered.
  private struct Read {
    let element: AXUIElement
    let data: ElementData
    let owner: pid_t
    let actions: [String]
    let flags: (settable: Bool, focusable: Bool, selectable: Bool)
    let valueMarkdown: String?
    let children: [AXUIElement]
    let shown: Shown?
  }

  private enum Outcome {
    case read(Read)
    case failed
    case deadline
  }

  init(source: ElementSource, lineage: Lineage, limits: WalkLimits, markdown: Bool, interactionFlags: Bool = true, visibleFrame: CGRect?) {
    self.source = source
    self.lineage = lineage
    previous = lineage.current
    self.limits = limits
    self.markdown = markdown
    self.interactionFlags = interactionFlags
    self.visibleFrame = visibleFrame
    revision = Revision(route: source.route)
  }

  /// Walks `window` then `menuItems`, numbering both in one lineage (the menu bar's items after the window's nodes).
  /// The menu bar's items are read first and their nodes and bytes reserved, so a cut of the window's walk by the node
  /// or byte budget never drops the menu bar.
  func run(window: AXUIElement, menuItems: [AXUIElement]) {
    let menuInherited = previous.map { matchSiblings(old: $0.siblings(of: nil, menu: true), new: menuItems) } ?? Array(repeating: nil, count: menuItems.count)
    let menuPending = zip(menuItems, menuInherited).map { Pending(element: $0, depth: 0, parent: nil, inherited: $1, inMenu: true) }
    var menuReads: [(Pending, Read)] = []
    var menuUnread: [Pending] = []
    var reservedBytes = 0
    for (position, pending) in menuPending.enumerated() {
      if monotonicMilliseconds() >= limits.deadline { menuUnread = Array(menuPending[position...]); break }
      switch read(pending) {
      case .read(let read):
        menuReads.append((pending, read))
        reservedBytes += jsonBytes(wire(read, index: 0, depth: 0)) + 1
      case .failed: failures += 1
      case .deadline:
        menuUnread = Array(menuPending[position...])
      }
      if !menuUnread.isEmpty { break }
    }

    let rootInherited = previous.flatMap { matchSiblings(old: $0.siblings(of: nil, menu: false), new: [window]).first ?? nil }
    walkWindow(Pending(element: window, depth: 0, parent: nil, inherited: rootInherited, inMenu: false),
               nodeLimit: limits.nodes - menuReads.count, byteLimit: limits.bytes - reservedBytes)

    for (pending, read) in menuReads where seen[ElementKey(element: read.element)] == nil { emit(read, pending) }
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
        let index = emit(read, next)
        // A node that kept its index has its children matched against the previous revision's; a new node's are new.
        let inherited: [Int?]
        if let previous, next.inherited != nil {
          inherited = matchSiblings(old: previous.siblings(of: index, menu: false), new: read.children)
        } else {
          inherited = Array(repeating: nil, count: read.children.count)
        }
        for (child, childInherited) in zip(read.children, inherited).reversed() {
          stack.append(Pending(element: child, depth: next.depth + 1, parent: index, inherited: childInherited, inMenu: false))
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

  /// The walk stops: what is left is counted, and the previous revision's entries for it are carried over, so an index
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

  private func attach(_ index: Int, _ pending: Pending) {
    if pending.inMenu { revision.menu.append(index) }
    else if let parent = pending.parent { revision.children[parent, default: []].append(index) }
    else { revision.root = index }
  }

  private func pastDeadline() -> Bool { monotonicMilliseconds() >= limits.deadline }

  /// Reads one element: its attributes, owner, actions, flags, Markdown and the children the width rule keeps. The
  /// deadline is checked between a node's calls, not only between nodes, so one slow element cannot overrun it.
  private func read(_ pending: Pending) -> Outcome {
    let element = prepare(pending.element)
    guard let data = source.data(element, subtree: !pending.inMenu) else { return .failed }
    if pastDeadline() { return .deadline }
    let owner = source.owner(element)
    let actions = source.actions(element)
    if pastDeadline() { return .deadline }
    let settable = data.value != nil && source.isSettable(element, kAXValueAttribute, phase: "settable")
    let focusable = interactionFlags && data.focused != nil && source.isSettable(element, kAXFocusedAttribute, phase: "focusable")
    let selectable = data.selectable ?? (interactionFlags && data.selected != nil && source.isSettable(element, kAXSelectedAttribute, phase: "selectable"))
    if pastDeadline() { return .deadline }
    var valueMarkdown: String?
    if markdown, markdownRoles.contains(data.role), let text = data.value.flatMap({ CFGetTypeID($0) == CFStringGetTypeID() ? ($0 as! String) : nil }) {
      let length = text.utf16.count
      if length > 0 && length <= markdownMaxLength {
        valueMarkdown = source.costs.time("markdown") { markdownRendering(of: element, length: length) }
        markdownFetches += 1
      }
    }
    var children: [AXUIElement] = []
    var shown: Shown?
    if !pending.inMenu {
      if pending.depth < limits.depth {
        (children, shown) = chooseChildren(of: element, data: data, source: source, visibleFrame: visibleFrame)
      } else if data.childCount > 0 {
        depthHit = true
      }
    }
    if pastDeadline() { return .deadline }
    return .read(Read(element: element, data: data, owner: owner, actions: actions, flags: (settable, focusable, selectable),
                      valueMarkdown: valueMarkdown, children: children, shown: shown))
  }

  private func wire(_ read: Read, index: Int, depth: Int) -> [String: Any] {
    nodeWire(index: index, depth: depth, pid: read.owner, data: read.data, actions: read.actions, flags: read.flags,
             valueMarkdown: read.valueMarkdown, children: read.children.count, shown: read.shown)
  }

  /// Numbers a read element (its inherited index, else the next unused) and adds its node and its table entry.
  @discardableResult
  private func emit(_ read: Read, _ pending: Pending) -> Int {
    let index = pending.inherited ?? lineage.allocate()
    seen[ElementKey(element: read.element)] = index
    let node = wire(read, index: index, depth: pending.depth)
    bytes += jsonBytes(node) + 1
    if let targets = read.data.servesAsTitleFor, !targets.isEmpty {
      titles.append((pending.inMenu, pending.inMenu ? menuBar.count : nodes.count, targets))
    }
    if pending.inMenu { menuBar.append(node) } else { nodes.append(node) }
    revision.entries[index] = LineageEntry(element: read.element, identity: ElementIdentity(read.data, pid: read.owner), actions: read.actions, frame: read.data.frame)
    attach(index, pending)
    return index
  }

  /// `servesAsTitleFor`: the emitted indexes of the elements a title serves, known only once the walk is done (a title
  /// often precedes what it names).
  private func resolveTitles() {
    for title in titles {
      let indexes = title.targets.compactMap { seen[ElementKey(element: $0)] }
      guard !indexes.isEmpty else { continue }
      if title.inMenu { menuBar[title.position]["servesAsTitleFor"] = indexes } else { nodes[title.position]["servesAsTitleFor"] = indexes }
      bytes += jsonBytes(indexes) + jsonStringBytes("servesAsTitleFor") + 2
    }
  }
}

/// A Skyshot node (Interfaces, Node): the optional attributes present only when the element carries them, so a tree
/// from either fetch route has the same shape.
func nodeWire(index: Int, depth: Int, pid: pid_t, data: ElementData, actions: [String], flags: (settable: Bool, focusable: Bool, selectable: Bool),
              valueMarkdown: String?, children: Int, shown: Shown?) -> [String: Any] {
  let value = scalar(data.value)
  var flagsWire: [String: Any] = [
    "enabled": data.enabled ?? true,
    "focused": data.focused ?? false,
    "focusable": flags.focusable,
    "selected": data.selected ?? false,
    "selectable": flags.selectable,
    "settable": flags.settable,
  ]
  if let disclosing = data.disclosing {
    flagsWire["disclosable"] = true
    flagsWire["expanded"] = disclosing
  }
  var node: [String: Any] = [
    "index": index, "depth": depth, "pid": Int(pid), "role": data.role, "subrole": data.subrole ?? NSNull(),
    "roleDescription": data.roleDescription ?? "", "title": data.title ?? NSNull(), "description": data.description ?? NSNull(),
    "value": value ?? NSNull(), "valueType": valueType(value), "valueMarkdown": valueMarkdown ?? NSNull(),
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

/// The value's type as the grammar's `settable, <type>` names it: "string", "number", "boolean", or null.
func valueType(_ value: Any?) -> Any {
  switch value {
  case nil: return NSNull()
  case is String: return "string"
  case is Bool: return "boolean"
  case is Int64, is Double: return "number"
  default: return NSNull()
  }
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
