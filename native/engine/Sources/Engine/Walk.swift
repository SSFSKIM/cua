import ApplicationServices
import Foundation

// One walk of a window and the menu bar's top-level items (the spec's Design, "Observation (skyshot)"; F §1.5, §1.8).
// Emitted in depth-first preorder, the document's order the text prints. Caps, each with its marker: the vendor's 200
// levels (cua marks the cut, `truncated.depth`); the vendor's width rule (100 children, then the visible subset, children
// omitted above 499, carried on the node as `shown`); and cua's own node budget (4,000), per-value cut (10,000
// characters, AX.swift), a 6 MiB budget for the serialized tree and a traversal deadline, the last three counted in
// `truncated.count`, with how many of the omitted lie above and below what the window shows. The budgets are spent on
// what the window shows first (#301, the design session's ruling aed3f041; a wide list's shown run first, #304's ruling
// 7b2a5a70; `TreeWalk.select`): a walk nothing cuts reads and emits exactly what the plain preorder does. Each node
// carries the lineage's token for its element (Lineage.swift): inherited sibling-structurally from the previous
// revision, a new element taking a new token. The engine numbers nothing for the model; the service does.

let maxDepth = 200
let maxObservedNodes = 4_000
/// The most elements a walk reads for the guard's record alone (#301 item 4), beside the node budget.
let recordOnlyBudget = 1_000
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

/// Whether `frame` shows in `area` by more than a 1-pt strip each way (#301): Chromium reports an offscreen box as such a
/// strip at the viewport's edge, and a collapsed container (a float's parent) as one wherever it lies, so a strip is no
/// evidence that anything of the element shows.
func showsBeyondStrip(_ frame: CGRect, in area: CGRect) -> Bool {
  let shown = frame.intersection(area)
  return !shown.isNull && shown.width > 1 && shown.height > 1
}

/// Where an omitted part of the tree lies (#301), by the frame of the read element it hangs from against what that
/// element's ancestors leave showing: wholly above it or wholly below it, a strip at the top or bottom edge counting as
/// above or below (Chromium's offscreen boxes); anything else (beside it, overlapping it, no frame) is elsewhere.
enum OmittedPlace: Equatable { case above, below, elsewhere }

func omittedPlace(frame: CGRect?, visible: CGRect?) -> OmittedPlace {
  guard let frame, let visible, !visible.isNull else { return .elsewhere }
  if frame.maxY <= visible.minY + 1 { return .above }
  if frame.minY >= visible.maxY - 1 { return .below }
  return .elsewhere
}

/// A long list's children read by their frames alone, for the bisections that find what of them shows (#301 item 4,
/// #304): no frame is read once `expired` answers true.
struct ChildFrames {
  let children: [AXUIElement]
  let frame: (AXUIElement) -> CGRect?
  let expired: () -> Bool
  /// How far a frameless child is judged by the next framed one.
  static let probe = 8
  /// How many children from the end are tried for one that lies wholly past the first (`axis`).
  static let endProbe = 32

  func framed(from start: Int) -> (position: Int, frame: CGRect)? {
    for position in start..<min(children.count, start + Self.probe) {
      guard !expired() else { return nil }
      if let found = frame(children[position]) { return (position, found) }
    }
    return nil
  }

  /// The axis the children lie in order along (a list's rows, a page's blocks; true for vertical), from the first framed
  /// child and a framed child near the end: vertical when the end child's top lies below the first's, horizontal when it
  /// lies wholly to the right of the first. An end child that does neither says nothing, and the next one back is tried,
  /// over `endProbe` children from the last (#309: Safari frames the last child of docs.python.org's body, a 10-pt
  /// group, at the body's top; Chromium lists a table's columns, each from the table's top and overlapping its first
  /// row, after the rows). Nil when no child is framed or none of those says: no order to bisect.
  func axis() -> Bool? {
    guard let first = framed(from: 0) else { return nil }
    var position = children.count - 1
    while position > first.position, position >= children.count - Self.endProbe, !expired() {
      if let last = frame(children[position]) {
        if last.minY > first.frame.minY { return true }
        if last.minX >= first.frame.maxX { return false }
      }
      position -= 1
    }
    return nil
  }

  /// The first position in `range` from which `holds` is taken to hold on (the children lie in order), a frameless child
  /// judged by the next framed one within `probe`, and one with none by `unframed`.
  func bisect(_ range: Range<Int>, unframed: Bool, _ holds: (CGRect) -> Bool) -> Int {
    var low = range.lowerBound, high = range.upperBound
    while low < high {
      let middle = (low + high) / 2
      if framed(from: middle).map({ holds($0.frame) }) ?? unframed { high = middle } else { low = middle + 1 }
    }
    return low
  }
}

/// Before and past `window` along a list's axis, a frame reaching at most `edge` into it counting as outside.
private struct ListOrder {
  let vertical: Bool
  let window: CGRect
  let edge: CGFloat

  func before(_ rect: CGRect) -> Bool { vertical ? rect.maxY <= window.minY + edge : rect.maxX <= window.minX + edge }
  func past(_ rect: CGRect) -> Bool { vertical ? rect.minY >= window.maxY - edge : rect.minX >= window.maxX - edge }
}

/// The positions among `children` (an element the width rule shows none of: more than 499 children, no visible subset)
/// whose frames meet `window`, for the guard's record alone (#301 item 4). The children are taken to lie in order along
/// their axis (`ChildFrames.axis`): the first child not wholly before the window is found by bisection, then children are
/// taken forward until one lies wholly past it, at most `limit` of them read. Children with no order to bisect give none,
/// as before #301. Once `expired` answers true no frame is read: what was found by then is kept.
func recordedChildPositions(_ children: [AXUIElement], frame: @escaping (AXUIElement) -> CGRect?, window: CGRect, limit: Int,
                            expired: @escaping () -> Bool = { false }) -> [Int] {
  let frames = ChildFrames(children: children, frame: frame, expired: expired)
  guard let vertical = frames.axis() else { return [] }
  let order = ListOrder(vertical: vertical, window: window, edge: 0)
  // A frameless child is judged by the next framed one; none within the probe counts as before.
  let low = frames.bisect(children.indices, unframed: false) { !order.before($0) }
  guard !expired() else { return [] }
  var kept: [Int] = []
  var position = max(0, low - 1)
  let end = min(children.count, position + limit)
  while position < end, !expired() {
    if let rect = frame(children[position]) {
      if order.past(rect) { break }
      if !order.before(rect), rect.intersects(window) { kept.append(position) }
    }
    position += 1
  }
  return kept
}

/// The run of a wide list's children that shows in `window` (#304), for the selection to read first: from the first
/// child not wholly before the window to the first wholly past it along the list's axis (`ChildFrames.axis`), each found
/// by bisection, a frame reaching at most 1 pt into the window counting as outside (Chromium reports an offscreen box as
/// a 1-pt strip at the viewport's edge). A frameless child is judged by the next framed one; one with none within the
/// probe counts as before the window at the run's start and past it at its end. About 2 log2(N) frame reads plus the
/// axis's, none charged to the node budget. Nil when the children have no axis or `expired` cut the search.
func shownChildRun(_ children: [AXUIElement], frame: @escaping (AXUIElement) -> CGRect?, window: CGRect,
                   expired: @escaping () -> Bool = { false }) -> Range<Int>? {
  let frames = ChildFrames(children: children, frame: frame, expired: expired)
  guard let vertical = frames.axis() else { return nil }
  let order = ListOrder(vertical: vertical, window: window, edge: 1)
  let low = frames.bisect(children.indices, unframed: false) { !order.before($0) }
  let high = frames.bisect(low..<children.count, unframed: true) { order.past($0) }
  guard !expired() else { return nil }
  return low..<high
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
  /// The window's frame: what the width rule's frame filter meets, and what the walk spends its budget on first (#301);
  /// nil (a walk rooted at a recorded menu-bar item) walks in plain preorder.
  let visibleFrame: CGRect?
  /// Whether the walk keeps the guard's record beyond the tree (an observation that returns a screenshot): the children of
  /// an element the width rule shows none of whose frames meet the window, and their subtrees (#301 item 4).
  let recordsScreenshot: Bool

  private(set) var nodes: [[String: Any]] = []
  private(set) var menuBar: [[String: Any]] = []
  private(set) var revision: Revision
  /// Every element the walk emitted, by handle, to its allocation number in the lineage.
  private(set) var seen: [ElementKey: Int] = [:]
  private(set) var bytes = 0
  /// Elements left unread by the node or byte budget or the deadline: each omitted subtree counts once, whatever it holds.
  private(set) var omitted = 0
  /// How many of them lie above and below what the window shows (`omittedPlace`); the rest are elsewhere.
  private(set) var omittedAbove = 0
  private(set) var omittedBelow = 0
  private(set) var depthHit = false
  private(set) var deadlineHit = false
  private(set) var budgetHit = false
  private(set) var nodeCapHit = false
  private(set) var failures = 0
  private(set) var markdownFetches = 0
  /// The nodes read for the guard's record alone (#301 item 4).
  private(set) var recordOnlyReads = 0
  /// The window's nodes as the stale-point record takes them (StalePoint.swift `screenshotNodes`), in document order;
  /// the menu bar's are not in a window's screenshot. A record-only node carries a negative number, outside the lineage.
  private(set) var screenshotReads: [ScreenshotNodeRead<AXUIElement>] = []
  /// Nodes whose element is a title, with the elements it serves, mapped to tokens once the walk is done.
  private var titles: [(inMenu: Bool, position: Int, targets: [AXUIElement])] = []
  /// The action descriptions the system was asked for in this walk (its answer, else the action's name), by process
  /// and action name, each with where the element it was asked for lies in the walk's preorder (the menu bar first, as
  /// it is read first): the answer for the earliest such element stands, as when the walk read in preorder and asked
  /// once per name, whatever order the selection read in (#301). Nodes take theirs at emission.
  private var descriptions: [String: (order: ReadOrder, description: String)] = [:]
  /// How many of the window's selected nodes take each cached description, and what the selection has charged against
  /// the byte budget so far, each node at the descriptions it will be emitted with (`selectionBytes`, `selectionByteLimit`).
  private var descriptionUses: [String: Int] = [:]
  private var selectionBytes = 0
  private var selectionByteLimit = Int.max

  /// Where a read element lies in the order the plain preorder walk read in: the menu bar's elements first, by
  /// position, then the window's, by their paths.
  private struct ReadOrder {
    let inMenu: Bool
    let path: [Int]

    func precedes(_ other: ReadOrder) -> Bool {
      if inMenu != other.inMenu { return inMenu }
      return documentPrecedes(path, other.path)
    }
  }

  /// An element to read: where it lies in the document (`path`, its positions from the root), what its ancestors leave
  /// showing of the window (`clip`; nil with no visible frame), and whether it is read for the guard's record alone.
  private struct Pending {
    let element: AXUIElement
    let depth: Int
    var parentRole: String? = nil
    /// Read through the attributes it lists (the menu bar and its items).
    var listedRead = false
    var inMenu = false
    var path: [Int] = []
    var clip: CGRect? = nil
    var recordOnly = false
  }

  /// One element read, not yet numbered.
  private struct Read {
    let element: AXUIElement
    let data: ElementData
    let owner: pid_t
    let actions: [String]
    let actionDescriptions: [String?]
    /// The description cache's key for each action (nil where the system is not asked), which emission resolves.
    let descriptionKeys: [String?]
    let flags: NodeFlags
    let url: String?
    let valueMarkdown: String?
    let children: [AXUIElement]
    let shown: Shown?
    /// Whether the guard's record looks for this element's shown children itself (`recordedChildPositions`): the width
    /// rule shows none of them, and the walk keeps the record.
    let recordable: Bool
    /// Its node, with a stand-in token the emission replaces (empty for a record-only read).
    var wire: [String: Any] = [:]
  }

  private enum Outcome {
    case read(Read)
    case failed
    case deadline
  }

  /// An element the selection read (#301), for the tree or for the guard's record alone, and whether its children
  /// have been taken up (`expanded`).
  private final class Selected {
    let read: Read
    let depth: Int
    let path: [Int]
    let clip: CGRect?
    let recordOnly: Bool
    var expanded = false
    /// The guard's record-only children (`recordedChildPositions`), past the read's children in the document's order,
    /// found once the tree's selection is done.
    var recordChildren: [AXUIElement] = []

    init(_ read: Read, _ pending: Pending) {
      self.read = read
      depth = pending.depth
      path = pending.path
      clip = pending.clip
      recordOnly = pending.recordOnly
    }
  }

  /// What waits in the selection's deferred queues: a read element's children, or the children of a wide list outside
  /// the run that shows (#304), unread. Its place in the document's order is the first such child's.
  private enum Waiting {
    case children(Selected)
    case unread(Selected, Range<Int>)

    var path: [Int] {
      switch self {
      case .children(let item): return item.path
      case .unread(let item, let positions): return item.path + [positions.lowerBound]
      }
    }
  }

  /// The selection's state: what it read, for the tree and for the record, what failed, and its queues: `stack`, the
  /// elements to read next (depth first); `deferred`, what waits because nothing of it shows (`Waiting`); and `lastly`,
  /// the children of AXColumn elements, taken up only once nothing else is left (#304). Each queue is latest in the
  /// document's order first.
  private var selected: [ElementKey: Selected] = [:]
  private var recorded: [ElementKey: Selected] = [:]
  private var failed: Set<ElementKey> = []
  private var stack: [Pending] = []
  private var deferred: [Waiting] = []
  private var lastly: [Waiting] = []

  init(source: ElementSource, lineage: Lineage, limits: WalkLimits, markdown: Bool, interactionFlags: Bool = true, chromium: Bool = false,
       visibleFrame: CGRect?, recordsScreenshot: Bool = false) {
    self.source = source
    self.lineage = lineage
    previous = lineage.current
    self.limits = limits
    self.markdown = markdown
    self.interactionFlags = interactionFlags
    self.chromium = chromium
    self.visibleFrame = visibleFrame
    self.recordsScreenshot = recordsScreenshot
    revision = Revision()
  }

  /// The token of an element this walk emitted; nil for one it did not.
  func token(of element: AXUIElement) -> String? { seen[ElementKey(element: element)].map(elementToken) }

  /// Walks `window` then the menu bar, numbering both in one lineage (the menu bar after the window's nodes), as the
  /// vendor's `addMenuBarWithImmediateItems` 0x1007569b8 adds it: the AXMenuBar element at depth 0 and, at depth 1
  /// under it, its top-level items (`menuItems`, its AXChildren) but the first, the system's Apple menu, and any whose
  /// title contains `Debug`; each read through the attributes it lists (FUN_1007542cc's fallback; F §1.3). A bar that
  /// cannot be read gives no menu-bar nodes at all. The menu bar is read first and its nodes and bytes reserved, so a
  /// cut of the window's walk by the node or byte budget never drops it. The window is read by `select` (which elements,
  /// in what order) and numbered by `emitWindow` (in the document's order).
  func run(window: AXUIElement, menuBar: AXUIElement?, menuItems: [AXUIElement]) {
    let menuElements = menuBarElements(bar: menuBar, items: menuItems)
    let menuInherited = previous.map { matchSiblings(old: $0.siblings(of: nil, menu: true), new: menuElements) } ?? Array(repeating: nil, count: menuElements.count)
    let menuPending = menuElements.enumerated().map { position, element in
      Pending(element: element, depth: position == 0 ? 0 : 1, parentRole: position == 0 ? nil : kAXMenuBarRole, listedRead: true, inMenu: true,
              path: [position])
    }
    var menuReads: [(Read, inherited: Int?)] = []
    var menuUnread: [Int?] = []
    var reservedBytes = 0
    reading: for (position, pending) in menuPending.enumerated() {
      if pastDeadline() { menuUnread = Array(menuInherited[position...]); break }
      switch read(pending, standIn: lineage.nextNumber) {
      case .read(let read):
        if position > 0, isDebugMenuItem(read.data) { continue }
        menuReads.append((read, menuInherited[position]))
        reservedBytes += jsonBytes(read.wire) + 1
      case .failed:
        failures += 1
        if position == 0 { break reading }
      case .deadline:
        menuUnread = Array(menuInherited[position...])
        break reading
      }
    }

    // A recorded menu-bar item walked as the root (MenuRecord.swift) keeps the token it had as a menu-bar entry.
    let rootInherited = previous.flatMap { matchSiblings(old: $0.siblings(of: nil, menu: false) + $0.siblings(of: nil, menu: true), new: [window]).first ?? nil }
    select(window, nodeLimit: limits.nodes - menuReads.count, byteLimit: limits.bytes - reservedBytes)
    emitWindow(window, inherited: rootInherited)

    for (read, inherited) in menuReads where seen[ElementKey(element: read.element)] == nil {
      emit(read, depth: read.wire["depth"] as? Int ?? 0, parent: nil, inherited: inherited, inMenu: true)
    }
    // The menu bar's node counts the items emitted under it (the walk reads them beside it, not through AXChildren).
    if !self.menuBar.isEmpty { self.menuBar[0]["children"] = self.menuBar.count - 1 }
    if !menuUnread.isEmpty {
      // Unread by the deadline: counted, and the previous revision's entries carried over, so their tokens stay resolvable.
      deadlineHit = true
      omitted += menuUnread.count
      if let previous {
        for inherited in menuUnread {
          if let inherited, revision.carry(inherited, from: previous) { revision.menu.append(inherited) }
        }
      }
    }
    resolveTitles()
  }

  // MARK: Selection (#301)

  /// Reads the window's tree within the budgets, what the window shows first (the design session's rulings aed3f041 and
  /// 66f90453). Depth first from the root, an element's children are taken up when something of it shows in what its
  /// ancestors leave showing of the window (`showsBeyondStrip`) or when it has no frame; any other element is read but
  /// its children wait (`deferred`). Once nothing showing is left, the waiting children are taken up in the document's
  /// order, each again showing first. Two rules keep a wide list from spending the budget on what it does not show
  /// (#304, the design session's ruling 7b2a5a70): of an element taken up with more than 100 children, the run that shows
  /// is found by frames alone (`shownChildRun`) and read first, the rest waiting unread in the document's order with
  /// everything else that waits; and an AXColumn's children, the cells Chromium lists again under their rows, wait until
  /// nothing else is left. So a walk nothing cuts reads every element and emits what the plain preorder does, and one the
  /// budget cuts has spent it on what the screenshot shows. The limits: a visible control under a container that reports
  /// a collapsed (1-pt) frame waits with it, so the budget can still cut it, and the guard checks it container-only (#304
  /// measured none in 234 observations: Chromium gives a collapsed wrapper its descendants' union bounds); and a wide
  /// list whose shown run, with what precedes it, takes the whole budget still starves what follows it.
  private func select(_ window: AXUIElement, nodeLimit: Int, byteLimit: Int) {
    stack = [Pending(element: window, depth: 0, clip: visibleFrame)]
    var kept = 0
    selectionByteLimit = byteLimit
    var cut = false
    while true {
      guard let next = stack.popLast() else {
        if cut { break }
        guard let resumed = nextDeferred() else { break }
        switch resumed {
        case .children(let item): expand(item)
        case .unread(let item, let positions): push(item, positions)
        }
        continue
      }
      let key = ElementKey(element: next.element)
      if selected[key] != nil || failed.contains(key) { continue }
      if cut { continue }
      if selectionBytes >= byteLimit { budgetHit = true; cut = true; continue }
      if kept >= nodeLimit { nodeCapHit = true; cut = true; continue }
      if pastDeadline() { deadlineHit = true; return }
      switch read(next, standIn: lineage.nextNumber + kept) {
      case .failed:
        failures += 1
        failed.insert(key)
      case .deadline:
        deadlineHit = true
        return
      case .read(let read):
        let item = Selected(read, next)
        selected[key] = item
        kept += 1
        selectionBytes += jsonBytes(read.wire) + 1
        for key in read.descriptionKeys { if let key { descriptionUses[key, default: 0] += 1 } }
        if read.children.isEmpty { item.expanded = true }
        else if item.clip != nil, read.data.role == kAXColumnRole { insertInOrder(.children(item), into: &lastly) }
        else if enters(item, key) { expand(item) } else { insertInOrder(.children(item), into: &deferred) }
      }
    }
    describeAtPreorderPlaces(window)
    selectForRecord()
  }

  /// The guard's record-only reads (#301 item 4), only once the tree's selection is done, so they never take time or
  /// budget from the printed tree: under each read element the width rule shows none of, in the document's order, the
  /// children whose frames meet what its ancestors leave showing of the window, and what of their subtrees shows, within
  /// `recordOnlyBudget` and the deadline (which cuts the record, not the tree). An element whose ancestors leave nothing
  /// showing (a list in a scroll area scrolled off) is not searched, so hidden rows never spend the record's budget.
  private func selectForRecord() {
    guard visibleFrame != nil else { return }
    let expired = { [self] in pastDeadline() }
    func find(_ item: Selected) {
      guard let area = childClip(item), showsBeyondStrip(area, in: area) else { return }
      let children = item.read.data.children
      let positions = recordedChildPositions(children, frame: { self.source.frame($0) }, window: area,
                                             limit: recordOnlyBudget, expired: expired)
      item.recordChildren = positions.map { children[$0] }
    }
    let wide = selected.values.filter { $0.read.recordable }.sorted { documentPrecedes($0.path, $1.path) }
    stack = []
    for item in wide {
      guard !expired() else { return }
      find(item)
      let clip = childClip(item)
      for (offset, child) in item.recordChildren.enumerated().reversed() {
        stack.append(Pending(element: child, depth: item.depth + 1, parentRole: item.read.data.role,
                             path: item.path + [item.read.children.count + offset], clip: clip, recordOnly: true))
      }
      while let next = stack.popLast() {
        let key = ElementKey(element: next.element)
        if selected[key] != nil || recorded[key] != nil || failed.contains(key) { continue }
        guard recordOnlyReads < recordOnlyBudget else { stack = []; return }
        guard !expired(), case .read(let read) = readForRecord(next) else { continue }
        let record = Selected(read, next)
        recorded[key] = record
        recordOnlyReads += 1
        if read.recordable, !expired() { find(record) }
        if enters(record, key) { expand(record) }
      }
    }
  }

  /// Whether a read element's children are taken up now: the root, an element with no frame or no visible frame to meet,
  /// or one that shows beyond a strip.
  private func enters(_ item: Selected, _ key: ElementKey) -> Bool {
    guard item.depth > 0, let clip = item.clip, let frame = item.read.data.frame else { return true }
    return showsBeyondStrip(frame, in: clip)
  }

  /// What a read element leaves showing to its children: its own clip, cut by its frame when it clips its descendants
  /// (`clipsDescendants`, the guard's record's rule).
  private func childClip(_ item: Selected) -> CGRect? {
    guard let clip = item.clip else { return nil }
    guard clipsDescendants(role: item.read.data.role, actions: item.read.actions), let frame = item.read.data.frame else { return clip }
    return clip.intersection(frame)
  }

  /// Takes up a read element's children (then its record-only ones), the first to be read next. In the tree's selection,
  /// a list of more than 100 whose clip shows has only the run that shows taken up (`shownChildRun`); the children before
  /// and after it wait, unread, in `deferred` (#304). Without a run (no axis to bisect, or the deadline) all are taken up.
  private func expand(_ item: Selected) {
    item.expanded = true
    let count = item.read.children.count + item.recordChildren.count
    // The record's selection (`selectForRecord`) drains the stack alone, so it takes every child up.
    if !item.recordOnly, item.read.children.count > widthThreshold, let area = childClip(item), showsBeyondStrip(area, in: area),
       let run = shownChildRun(item.read.children, frame: { self.source.frame($0) }, window: area, expired: { [self] in pastDeadline() }) {
      if run.lowerBound > 0 { insertInOrder(.unread(item, 0..<run.lowerBound), into: &deferred) }
      if run.upperBound < count { insertInOrder(.unread(item, run.upperBound..<count), into: &deferred) }
      push(item, run)
    } else {
      push(item, 0..<count)
    }
  }

  /// Puts the children of a read element at `positions` (its record-only ones past its own) on the stack, the first on top.
  private func push(_ item: Selected, _ positions: Range<Int>) {
    let clip = childClip(item)
    let children = item.read.children + item.recordChildren
    for position in positions.reversed() {
      stack.append(Pending(element: children[position], depth: item.depth + 1, parentRole: item.read.data.role, path: item.path + [position],
                           clip: clip, recordOnly: item.recordOnly || position >= item.read.children.count))
    }
  }

  /// Sets what waits aside in `queue`, in the document's order.
  private func insertInOrder(_ waiting: Waiting, into queue: inout [Waiting]) {
    let path = waiting.path
    var low = 0, high = queue.count
    while low < high {
      let middle = (low + high) / 2
      if documentPrecedes(path, queue[middle].path) { low = middle + 1 } else { high = middle }
    }
    queue.insert(waiting, at: low)
  }

  /// The earliest in the document's order of what waits, `lastly`'s only once `deferred` is empty.
  private func nextDeferred() -> Waiting? {
    while let candidate = deferred.popLast() ?? lastly.popLast() {
      if case .children(let item) = candidate, item.expanded { continue }
      return candidate
    }
    return nil
  }

  // MARK: Emission

  /// Numbers what the selection read, in the document's order from the root: each read element keeps the token it
  /// inherits sibling-structurally from the previous revision or takes a new one; each unread child of a read element is
  /// counted as omitted, placed by the element it hangs from (`omittedPlace`), and the previous revision's entry for it is
  /// carried over with its subtree, so a token the budget left unread stays resolvable and is not retired. A child list
  /// is always matched whole (the read element's children, read or not), and the revision's lists are in the document's
  /// order, carried entries in their places.
  private func emitWindow(_ window: AXUIElement, inherited rootInherited: Int?) {
    struct Visit {
      let element: AXUIElement
      let depth: Int
      let parent: Int?
      let inherited: Int?
      let from: Selected?
    }
    var visits = [Visit(element: window, depth: 0, parent: nil, inherited: rootInherited, from: nil)]
    while let visit = visits.popLast() {
      let key = ElementKey(element: visit.element)
      if seen[key] != nil || failed.contains(key) { continue }
      guard let item = selected[key] else {
        omitted += 1
        switch omittedPlace(frame: visit.from?.read.data.frame, visible: visit.from?.clip) {
        case .above: omittedAbove += 1
        case .below: omittedBelow += 1
        case .elsewhere: break
        }
        if let previous, let inherited = visit.inherited, revision.carry(inherited, from: previous) { attach(inherited, parent: visit.parent, inMenu: false) }
        continue
      }
      let number = emit(item.read, depth: visit.depth, parent: visit.parent, inherited: visit.inherited, inMenu: false)
      emitRecord(item.recordChildren, parent: number, depth: visit.depth + 1)
      let children = item.read.children
      // A node that kept its token has its children matched against the previous revision's; a new node's are new.
      let inherited: [Int?]
      if let previous, visit.inherited != nil {
        inherited = matchSiblings(old: previous.siblings(of: number, menu: false), new: children)
      } else {
        inherited = Array(repeating: nil, count: children.count)
      }
      for (child, childInherited) in zip(children, inherited).reversed() {
        visits.append(Visit(element: child, depth: visit.depth + 1, parent: number, inherited: childInherited, from: item))
      }
    }
  }

  /// The guard's record-only nodes under `parent`, depth first: in the record, with numbers outside the lineage, and in
  /// neither the tree nor the revision.
  private var nextRecordNumber = -1
  private func emitRecord(_ elements: [AXUIElement], parent: Int, depth: Int) {
    for element in elements {
      guard let item = recorded.removeValue(forKey: ElementKey(element: element)) else { continue }
      let number = nextRecordNumber
      nextRecordNumber -= 1
      let data = item.read.data
      screenshotReads.append(ScreenshotNodeRead(element: item.read.element, number: number, parent: parent, depth: depth, role: data.role,
                                                title: data.title, description: data.description, frame: data.frame,
                                                actions: item.read.actions, childCount: data.children.count))
      emitRecord(item.read.children + item.recordChildren, parent: number, depth: depth + 1)
    }
  }

  private func attach(_ number: Int, parent: Int?, inMenu: Bool) {
    if inMenu { revision.menu.append(number) }
    else if let parent { revision.children[parent, default: []].append(number) }
    else { revision.root = number }
  }

  private func pastDeadline() -> Bool { monotonicMilliseconds() >= limits.deadline }

  /// Once the tree's selection is done: every read element's action descriptions judged at its place in emission's
  /// preorder (its first place under read parents), as the plain preorder, which reads each element there, judges them.
  /// An element two parents list (Chromium's cell, under its column and its row; a wide list's child another parent
  /// lists later) was read through whichever place the queues reached first, and so was its subtree, so an element read
  /// at another place than its preorder one is asked again there, through `describe`: only for an action whose cached
  /// answer comes from a later place, and with `describe`'s charge to the byte budget, a growth that does not fit
  /// refused. A query past the deadline is not made: the walk is marked cut by it, as a read would be, and keeps the
  /// answers it has.
  private func describeAtPreorderPlaces(_ window: AXUIElement) {
    var visited: Set<ElementKey> = []
    var visits: [(element: AXUIElement, path: [Int])] = [(window, [])]
    while let visit = visits.popLast() {
      let key = ElementKey(element: visit.element)
      guard let item = selected[key], visited.insert(key).inserted else { continue }
      if visit.path != item.path {
        let order = ReadOrder(inMenu: false, path: visit.path)
        for action in item.read.actions where asksSystemForDescription(action) {
          guard let known = descriptions["\(item.read.owner)\u{0}\(action)"], order.precedes(known.order) else { continue }
          if pastDeadline() { deadlineHit = true; return }
          _ = describe(action: action, of: item.read.element, owner: item.read.owner, order: order)
        }
      }
      for (position, child) in item.read.children.enumerated().reversed() { visits.append((child, visit.path + [position])) }
    }
  }

  /// Reads one element: its attributes, owner, actions, flags, Markdown, the children the width rule keeps and its node.
  /// The deadline is checked between a node's calls, not only between nodes, so one slow element cannot overrun it.
  private func read(_ pending: Pending, standIn: Int = 0) -> Outcome {
    let element = prepare(pending.element)
    guard let data = pending.listedRead ? source.listedData(element) : source.data(element) else { return .failed }
    if pastDeadline() { return .deadline }
    let owner = source.owner(element)
    let actions = source.actions(element)
    let order = ReadOrder(inMenu: pending.inMenu, path: pending.path)
    let described = actions.map { describe(action: $0, of: element, owner: owner, order: order) }
    let actionDescriptions = described.map(\.description)
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
    let (children, shown, recordable) = choose(element, data, pending)
    if pastDeadline() { return .deadline }
    var read = Read(element: element, data: data, owner: owner, actions: actions, actionDescriptions: actionDescriptions,
                    descriptionKeys: described.map(\.key), flags: flags,
                    url: url, valueMarkdown: valueMarkdown, children: children, shown: shown, recordable: recordable)
    read.wire = wire(read, number: standIn, depth: pending.depth)
    return .read(read)
  }

  /// Reads one element for the guard's record alone (#301 item 4): what the record keeps (role, labels, frame, the actions
  /// its clipping reads, its children).
  private func readForRecord(_ pending: Pending) -> Outcome {
    let element = prepare(pending.element)
    guard let data = source.data(element) else { return .failed }
    if pastDeadline() { return .deadline }
    let actions = source.actions(element)
    let (children, shown, recordable) = choose(element, data, pending)
    if pastDeadline() { return .deadline }
    return .read(Read(element: element, data: data, owner: 0, actions: actions, actionDescriptions: [], descriptionKeys: [], flags: NodeFlags(), url: nil,
                      valueMarkdown: nil, children: children, shown: shown, recordable: recordable))
  }

  /// The children the width rule keeps (none in the menu bar, none past the depth cap), and, where it keeps none of more
  /// than 499 and the walk keeps the guard's record, the ones whose frames meet the window, for the record alone.
  private func choose(_ element: AXUIElement, _ data: ElementData, _ pending: Pending) -> ([AXUIElement], Shown?, Bool) {
    guard !pending.inMenu else { return ([], nil, false) }
    guard pending.depth < limits.depth else {
      if !data.children.isEmpty, !pending.recordOnly { depthHit = true }
      return ([], nil, false)
    }
    let (children, shown) = chooseChildren(of: element, data: data, source: source, visibleFrame: visibleFrame)
    return (children, shown, recordsScreenshot && visibleFrame != nil && shown?.subset == "omitted")
  }

  /// An action's description, FUN_1007816a0 as FUN_1007515a8 pairs it: nil for an action the fixed table or a custom
  /// `Name:` describes (Derivations.swift; the renderer prints those words, and the system is not asked), else the
  /// system's description, else the action's name. Descriptions are the app's per action name, so a walk asks once per
  /// process and name (cua's; the vendor asks per element).
  /// The system is asked again only for an element earlier in the preorder than the one whose answer is cached. Its
  /// answer replaces the cached one for every node already selected with the name, so the difference is charged to the
  /// byte budget for each of them; a replacement that would take the selection past the budget is refused, the nodes
  /// keeping the cached answer, since bytes already selected cannot be given back. The limit (the spec's #301 entry,
  /// `tech-debt-tracker.md`): each replacement is judged when it comes, so near the budget a growth refused before
  /// another name's shrink frees the room stays refused, and the walk shows the later-in-preorder answer for it.
  private func describe(action: String, of element: AXUIElement, owner: pid_t, order: ReadOrder) -> (key: String?, description: String?) {
    guard asksSystemForDescription(action) else { return (nil, nil) }
    let key = "\(owner)\u{0}\(action)"
    if let known = descriptions[key], !order.precedes(known.order) { return (key, known.description) }
    let description = source.actionDescription(element, action) ?? action
    if let known = descriptions[key] {
      let growth = (jsonStringBytes(description) - jsonStringBytes(known.description)) * (descriptionUses[key] ?? 0)
      if growth > 0, selectionBytes + growth > selectionByteLimit { return (key, known.description) }
      selectionBytes += growth
    }
    descriptions[key] = (order, description)
    return (key, description)
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
  private func emit(_ read: Read, depth: Int, parent: Int?, inherited: Int?, inMenu: Bool) -> Int {
    let number = inherited ?? lineage.allocate()
    seen[ElementKey(element: read.element)] = number
    var node = read.wire
    node["token"] = elementToken(number)
    node["depth"] = depth
    node["actionDescriptions"] = zip(read.descriptionKeys, read.actionDescriptions).map { key, read in
      key.flatMap { descriptions[$0]?.description } ?? read ?? NSNull() as Any
    }
    bytes += jsonBytes(node) + 1
    if let targets = read.data.servesAsTitleFor, !targets.isEmpty {
      titles.append((inMenu, inMenu ? menuBar.count : nodes.count, targets))
    }
    if inMenu { menuBar.append(node) } else { nodes.append(node) }
    revision.entries[number] = LineageEntry(element: read.element, identity: ElementIdentity(read.data, pid: read.owner), actions: read.actions, frame: read.data.frame)
    if !inMenu {
      screenshotReads.append(ScreenshotNodeRead(element: read.element, number: number, parent: parent, depth: depth, role: read.data.role,
                                                title: read.data.title, description: read.data.description, frame: read.data.frame,
                                                actions: read.actions, childCount: read.data.children.count))
    }
    attach(number, parent: parent, inMenu: inMenu)
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

/// Whether `a` comes before `b` in the document's order, each a path of child positions from the root (an ancestor
/// before its descendants).
func documentPrecedes(_ a: [Int], _ b: [Int]) -> Bool {
  for (x, y) in zip(a, b) where x != y { return x < y }
  return a.count < b.count
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

/// The Markdown rendering of a text element's attributed value (`markdownMapped`, TextSelection.swift); nil when the
/// value carries no such styling (the plain value then says everything).
func markdownRendering(of element: AXUIElement, length: Int) -> String? {
  attributedValue(of: element, length: length).flatMap(markdownMapped).map { bounded($0.text) }
}
