import ApplicationServices
import Foundation

// One walk of a window and the menu bar's top-level items (the spec's Design, "Observation (skyshot)"; F §1.5, §1.8).
// Emitted in depth-first preorder, the document's order the text prints. Caps, each with its marker: the vendor's 200
// levels (cua marks the cut, `truncated.depth`); the vendor's width rule (100 children, then the visible subset, children
// omitted above 499, carried on the node as `shown`); and cua's own node budget (4,000), per-value cut (10,000
// characters, AX.swift), a 6 MiB budget for the serialized tree and a traversal deadline, the last three counted in
// `truncated.count`, with how many of the omitted lie above and below what the window shows. The budgets are spent on
// what the window shows first (#301, the design session's ruling aed3f041; `TreeWalk.select`): a walk nothing cuts
// reads and emits exactly what the plain preorder does. Each node carries the lineage's token for its element
// (Lineage.swift): inherited sibling-structurally from the previous revision, a new element taking a new token. The
// engine numbers nothing for the model; the service does.

let maxDepth = 200
let maxObservedNodes = 4_000
/// The grid a Chromium window is hit-tested on when the node budget will cut (#301's seeding), in points: a control
/// smaller than this inside a container Chromium reports as a strip can fall between the points and be missed.
let seedGridSpacing: CGFloat = 80
/// The seeding's cap, inside the observation's deadline (the ruling's "about 500 ms").
let seedCapMs: Double = 500
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
  /// The seeding's cap (#301), inside the deadline.
  var seedMs = seedCapMs
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

/// The seeding's points (#301): a grid `spacing` apart over `window`, each at its cell's centre, coarse to fine (every
/// eighth row and column first, then every fourth, …), so a seeding cut by its cap has still covered the whole window.
func seedPoints(in window: CGRect, spacing: CGFloat = seedGridSpacing) -> [CGPoint] {
  let xs = Array(stride(from: window.minX + spacing / 2, to: window.maxX, by: spacing))
  let ys = Array(stride(from: window.minY + spacing / 2, to: window.maxY, by: spacing))
  guard !xs.isEmpty, !ys.isEmpty else { return [] }
  var step = 1
  while step * 2 < max(xs.count, ys.count) { step *= 2 }
  var taken = Set<Int>()
  var points: [CGPoint] = []
  while step >= 1 {
    for row in stride(from: 0, to: ys.count, by: step) {
      for column in stride(from: 0, to: xs.count, by: step) where taken.insert(row * xs.count + column).inserted {
        points.append(CGPoint(x: xs[column], y: ys[row]))
      }
    }
    step /= 2
  }
  return points
}

/// The positions among `children` (an element the width rule shows none of: more than 499 children, no visible subset)
/// whose frames meet `window`, for the guard's record alone (#301 item 4). The children are taken to lie in order along
/// the axis on which the first and the last framed child differ (a list's rows, a page's blocks): the first child not
/// wholly before the window is found by bisection, then children are taken forward until one lies wholly past it, at most
/// `limit` of them read. Children with no order to bisect (first and last framed alike, or none framed) give none, as
/// before. Once `expired` answers true no frame is read: what was found by then is kept.
func recordedChildPositions(_ children: [AXUIElement], frame: (AXUIElement) -> CGRect?, window: CGRect, limit: Int,
                            expired: () -> Bool = { false }) -> [Int] {
  let probe = 8
  func framed(from start: Int, by step: Int) -> CGRect? {
    var position = start
    for _ in 0..<probe {
      guard children.indices.contains(position), !expired() else { return nil }
      if let found = frame(children[position]) { return found }
      position += step
    }
    return nil
  }
  guard let first = framed(from: 0, by: 1), let last = framed(from: children.count - 1, by: -1) else { return [] }
  let vertical: Bool
  if last.minY > first.minY { vertical = true } else if last.minX > first.minX { vertical = false } else { return [] }
  func before(_ rect: CGRect) -> Bool { vertical ? rect.maxY <= window.minY : rect.maxX <= window.minX }
  func past(_ rect: CGRect) -> Bool { vertical ? rect.minY >= window.maxY : rect.minX >= window.maxX }
  var low = 0, high = children.count
  while low < high {
    let middle = (low + high) / 2
    // A frameless child is judged by the next framed one; none within the probe counts as before.
    if framed(from: middle, by: 1).map(before) ?? true { low = middle + 1 } else { high = middle }
  }
  guard !expired() else { return [] }
  var kept: [Int] = []
  var position = max(0, low - 1)
  let end = min(children.count, position + limit)
  while position < end, !expired() {
    if let rect = frame(children[position]) {
      if past(rect) { break }
      if !before(rect), rect.intersects(window) { kept.append(position) }
    }
    position += 1
  }
  return kept
}

final class TreeWalk {
  let source: ElementSource
  let lineage: Lineage
  let previous: Revision?
  let limits: WalkLimits
  let markdown: Bool
  /// Whether `focusable` and `selectable` are read (one settability call each per element); the spike's switch.
  let interactionFlags: Bool
  /// Whether the window is Chromium's (`isChromium`, F §1.7), where value settability counts only for some roles, and
  /// where a walk the node budget will cut is seeded by hit-tests (#301).
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
  /// The seeding, when it ran (#301).
  private(set) var seeding: Seeding?
  /// The nodes read for the guard's record alone (#301 item 4).
  private(set) var recordOnlyReads = 0
  /// The window's nodes as the stale-point record takes them (StalePoint.swift `screenshotNodes`), in document order;
  /// the menu bar's are not in a window's screenshot. A record-only node carries a negative number, outside the lineage.
  private(set) var screenshotReads: [ScreenshotNodeRead<AXUIElement>] = []
  /// Nodes whose element is a title, with the elements it serves, mapped to tokens once the walk is done.
  private var titles: [(inMenu: Bool, position: Int, targets: [AXUIElement])] = []
  /// The action descriptions the system was asked for in this walk (its answer, else the action's name), by process
  /// and action name: one description call each.
  private var descriptions: [String: String] = [:]

  /// What the seeding did (#301): its time, the points it hit-tested (and those that answered), the ancestor chains it
  /// joined to the walk, the seeds they gave, the read elements they brought forward, and whether its cap cut it.
  struct Seeding {
    var ms: Double = 0
    var points = 0
    var hits = 0
    var chains = 0
    var seeds = 0
    var promoted = 0
    var capped = false
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

  /// The selection's state: what it read, for the tree and for the record, what failed, and its two queues: `stack`, the
  /// elements to read next (depth first), and `deferred`, read elements whose children wait because nothing of them shows,
  /// latest in the document's order first.
  private var selected: [ElementKey: Selected] = [:]
  private var recorded: [ElementKey: Selected] = [:]
  private var failed: Set<ElementKey> = []
  private var seeds: Set<ElementKey> = []
  private var stack: [Pending] = []
  private var deferred: [Selected] = []
  private var root: AXUIElement?

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
      Pending(element: element, depth: position == 0 ? 0 : 1, parentRole: position == 0 ? nil : kAXMenuBarRole, listedRead: true, inMenu: true)
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

  /// Reads the window's tree within the budgets, what the window shows first (the design session's ruling aed3f041). Depth
  /// first from the root, an element's children are taken up when something of it shows in what its ancestors leave
  /// showing of the window (`showsBeyondStrip`), when it has no frame, or when it is a seed; any other element is read but
  /// its children wait (`deferred`). Once nothing showing is left, the waiting children are taken up in the document's
  /// order, each again showing first. So a walk nothing cuts reads every element, as the plain preorder does, and one the
  /// budget cuts has spent it on what the screenshot shows. On Chromium, whose offscreen boxes and collapsed containers
  /// read as strips, the walk is seeded (`seed`) once it knows the budget will cut: once the elements it has read and the
  /// children they name exceed the budget.
  private func select(_ window: AXUIElement, nodeLimit: Int, byteLimit: Int) {
    root = window
    stack = [Pending(element: window, depth: 0, clip: visibleFrame)]
    var kept = 0, estimated = 0, known = 1
    var cut = false
    while true {
      guard let next = stack.popLast() else {
        if cut { break }
        guard let resumed = nextDeferred() else { break }
        expand(resumed)
        continue
      }
      let key = ElementKey(element: next.element)
      if selected[key] != nil || failed.contains(key) { continue }
      if cut { continue }
      if estimated >= byteLimit { budgetHit = true; cut = true; continue }
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
        estimated += jsonBytes(read.wire) + 1
        known += read.children.count
        if chromium, seeding == nil, visibleFrame != nil, known > nodeLimit { seed() }
        // The seeding may have taken this element up already: a hit's chain can pass through it.
        if item.expanded { continue }
        if read.children.isEmpty { item.expanded = true }
        else if enters(item, key) { expand(item) } else { setAside(item) }
      }
    }
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
  /// one that shows beyond a strip, or (on the tree) a seed.
  private func enters(_ item: Selected, _ key: ElementKey) -> Bool {
    guard item.depth > 0, let clip = item.clip, let frame = item.read.data.frame else { return true }
    return showsBeyondStrip(frame, in: clip) || (!item.recordOnly && seeds.contains(key))
  }

  /// What a read element leaves showing to its children: its own clip, cut by its frame when it clips its descendants
  /// (`clipsDescendants`, the guard's record's rule).
  private func childClip(_ item: Selected) -> CGRect? {
    guard let clip = item.clip else { return nil }
    guard clipsDescendants(role: item.read.data.role, actions: item.read.actions), let frame = item.read.data.frame else { return clip }
    return clip.intersection(frame)
  }

  /// Takes up a read element's children (then its record-only ones), the first to be read next.
  private func expand(_ item: Selected) {
    item.expanded = true
    let clip = childClip(item)
    let children = item.read.children + item.recordChildren
    for position in children.indices.reversed() {
      stack.append(Pending(element: children[position], depth: item.depth + 1, parentRole: item.read.data.role, path: item.path + [position],
                           clip: clip, recordOnly: item.recordOnly || position >= item.read.children.count))
    }
  }

  /// Sets a read element's children aside, in the document's order.
  private func setAside(_ item: Selected) {
    var low = 0, high = deferred.count
    while low < high {
      let middle = (low + high) / 2
      if documentPrecedes(item.path, deferred[middle].path) { low = middle + 1 } else { high = middle }
    }
    deferred.insert(item, at: low)
  }

  /// The earliest element in the document's order whose children wait, not yet taken up by a seed.
  private func nextDeferred() -> Selected? {
    while let candidate = deferred.popLast() { if !candidate.expanded { return candidate } }
    return nil
  }

  /// The seeding (#301; the design session's ruling aed3f041), on Chromium once the walk knows its budget will cut: the
  /// window's application is hit-tested on a grid `seedGridSpacing` apart (`seedPoints`), and each hit's ancestors, read
  /// up through AXParent until one the walk has taken up or already seeded, become seeds: a read seed's children are
  /// taken up at once, and one read later has them taken up as it is read. Capped at `seedCapMs` inside the
  /// observation's deadline; past the cap, what is seeded stays seeded, and the rest is read in the document's order. A
  /// chain that never meets the walk (a hit in another window) seeds nothing.
  private func seed() {
    guard let window = visibleFrame, let root else { return }
    let started = monotonicMilliseconds()
    let cap = min(started + limits.seedMs, limits.deadline)
    let pid = source.owner(root)
    var report = Seeding()
    for point in seedPoints(in: window) {
      let now = monotonicMilliseconds()
      guard let timeout = boundedMessagingTimeout(leftMs: cap - now) else { report.capped = true; break }
      report.points += 1
      guard let hit = source.hitTest(pid: pid, at: point, timeout: timeout) else { continue }
      report.hits += 1
      var chain: [ElementKey] = []
      var current: AXUIElement? = hit
      var joined = false
      for _ in 0...maxDepth {
        guard let element = current else { break }
        let key = ElementKey(element: element)
        if seeds.contains(key) || selected[key]?.expanded == true { joined = true; break }
        chain.append(key)
        if monotonicMilliseconds() >= cap { break }
        current = source.parent(element)
      }
      guard joined, !chain.isEmpty else { continue }
      report.chains += 1
      for key in chain where seeds.insert(key).inserted {
        if let item = selected[key], !item.expanded {
          expand(item)
          report.promoted += 1
        }
      }
    }
    report.seeds = seeds.count
    report.ms = monotonicMilliseconds() - started
    seeding = report
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

  /// Reads one element: its attributes, owner, actions, flags, Markdown, the children the width rule keeps and its node.
  /// The deadline is checked between a node's calls, not only between nodes, so one slow element cannot overrun it.
  private func read(_ pending: Pending, standIn: Int = 0) -> Outcome {
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
    let (children, shown, recordable) = choose(element, data, pending)
    if pastDeadline() { return .deadline }
    var read = Read(element: element, data: data, owner: owner, actions: actions, actionDescriptions: actionDescriptions, flags: flags,
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
    return .read(Read(element: element, data: data, owner: 0, actions: actions, actionDescriptions: [], flags: NodeFlags(), url: nil,
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
  private func emit(_ read: Read, depth: Int, parent: Int?, inherited: Int?, inMenu: Bool) -> Int {
    let number = inherited ?? lineage.allocate()
    seen[ElementKey(element: read.element)] = number
    var node = read.wire
    node["token"] = elementToken(number)
    node["depth"] = depth
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
