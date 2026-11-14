import ApplicationServices
import XCTest
@testable import Engine

// #304 and #309 (the design session's ruling 7b2a5a70): a wide list's shown run is found by frames and read first, an
// AXColumn's children wait until nothing else is left, and the bisection's axis survives an end child that overlaps the
// first. Over the fake tree of WalkTests.swift.

private let windowFrame = CGRect(x: 0, y: 0, width: 1000, height: 800)
/// The web area's frame: the viewport, below a 100-pt toolbar.
private let viewport = CGRect(x: 0, y: 100, width: 1000, height: 700)
private let toolbar = 2, table = 3
private let buttons = Array(20..<25)
private func row(_ i: Int) -> Int { 100_000 + i }
private func column(_ c: Int) -> Int { 90 + c }
private func cell(_ i: Int, _ c: Int) -> Int { 200_000 + 10 * i + c }

/// Chromium's window in small: the window (0) holds its web area (1, the viewport) and then, later in the document, its
/// toolbar (2: five buttons, 20–24, above the viewport). The web area holds a table (3) of `rows` rows 20 pt tall,
/// scrolled `scroll` rows down, each row with `columns` cells, then `columns` AXColumn elements listing the cells again;
/// the table answers AXVisibleChildren with every child, as Chromium does. What lies wholly off the viewport is a 1-pt
/// strip at its nearer edge.
private func chromiumTable(rows: Int, columns: Int, scroll: Int, cellsPerRow: Int? = nil) -> FakeTree {
  let tree = FakeTree()
  func place(_ frame: CGRect) -> CGRect {
    if frame.maxY <= viewport.minY { return CGRect(x: frame.minX, y: viewport.minY, width: frame.width, height: 1) }
    if frame.minY >= viewport.maxY { return CGRect(x: frame.minX, y: viewport.maxY - 1, width: frame.width, height: 1) }
    return frame
  }
  func role(_ id: Int, _ role: String) { tree.extra[id] = ["AXRole": role as CFString] }
  role(0, "AXWindow"); role(1, "AXWebArea"); role(toolbar, "AXToolbar"); role(table, "AXTable")
  tree.frames[0] = windowFrame
  tree.frames[1] = viewport
  tree.frames[toolbar] = CGRect(x: 0, y: 0, width: 1000, height: 100)
  tree.children = [0: [1, toolbar], 1: [table], toolbar: buttons]
  for (k, button) in buttons.enumerated() {
    role(button, "AXButton")
    tree.frames[button] = CGRect(x: Double(k) * 40, y: 50, width: 30, height: 30)
  }
  let top = viewport.minY - Double(scroll) * 20
  let span = CGRect(x: 0, y: top, width: 1000, height: Double(rows) * 20)
  tree.frames[table] = place(span)
  let width = columns > 0 ? 1000 / Double(columns) : 1000
  for i in 0..<rows {
    role(row(i), "AXRow")
    let y = top + Double(i) * 20
    tree.frames[row(i)] = place(CGRect(x: 0, y: y, width: 1000, height: 20))
    tree.children[row(i)] = (0..<(cellsPerRow ?? columns)).map { cell(i, $0) }
    for c in 0..<(cellsPerRow ?? columns) {
      role(cell(i, c), "AXCell")
      tree.frames[cell(i, c)] = place(CGRect(x: Double(c) * width, y: y, width: width, height: 20))
    }
  }
  for c in 0..<columns {
    role(column(c), "AXColumn")
    tree.frames[column(c)] = place(CGRect(x: Double(c) * width, y: top, width: width, height: span.height))
    tree.children[column(c)] = (0..<rows).map { cell($0, c) }
  }
  tree.children[table] = (0..<rows).map(row) + (0..<columns).map(column)
  tree.visible[table] = tree.children[table]
  return tree
}

/// The rows of a table scrolled `scroll` rows down that the viewport shows (35 of them fill it).
/// An uncut walk's alias, everything in view: a table (1) listing a column (2) before a row (3), both listing one cell
/// (4), the cell and the row describing one system-described action differently (the review of f20a25ee..13805b82).
private func columnBeforeRow() -> FakeTree {
  let tree = FakeTree()
  for (id, role) in [0: "AXWindow", 1: "AXTable", 2: "AXColumn", 3: "AXRow", 4: "AXCell"] { tree.extra[id] = ["AXRole": role as CFString] }
  tree.children = [0: [1], 1: [2, 3], 2: [4], 3: [4]]
  tree.frames = [0: windowFrame, 1: CGRect(x: 0, y: 0, width: 500, height: 100), 2: CGRect(x: 0, y: 0, width: 100, height: 100),
                 3: CGRect(x: 0, y: 0, width: 500, height: 20), 4: CGRect(x: 0, y: 0, width: 100, height: 20)]
  tree.actions = [3: ["AXCustomThing"], 4: ["AXCustomThing"]]
  tree.elementDescriptions = [3: ["AXCustomThing": "row"], 4: ["AXCustomThing": "cell"]]
  return tree
}

/// The alias nested: the column-before-row table with a child (5) under the shared cell, the child, not the cell,
/// describing the action against the row (the re-review of 13805b82..0198ebe7).
private func columnBeforeRowNested() -> FakeTree {
  let tree = columnBeforeRow()
  tree.children[4] = [5]
  tree.frames[5] = CGRect(x: 0, y: 0, width: 50, height: 20)
  tree.actions = [3: ["AXCustomThing"], 5: ["AXCustomThing"]]
  tree.elementDescriptions = [3: ["AXCustomThing": "row"], 5: ["AXCustomThing": "cell child"]]
  return tree
}

/// Rule B's alias: a wide list (1, 101 rows, rows 50-89 in view) whose first row (100), before the shown run, is listed
/// again by a later sibling in view (2); the row and the sibling describe one action differently.
private func wideListChildListedLater() -> FakeTree {
  let tree = FakeTree()
  tree.extra[0] = ["AXRole": "AXWindow" as CFString]
  tree.frames[0] = windowFrame
  tree.children = [0: [1, 2], 1: Array(100..<201), 2: [100]]
  tree.visible[1] = tree.children[1]
  tree.frames[1] = windowFrame
  tree.frames[2] = CGRect(x: 0, y: 700, width: 100, height: 30)
  for i in 0..<101 { tree.frames[100 + i] = CGRect(x: 0, y: Double(i - 50) * 20, width: 1000, height: 20) }
  tree.frames[100] = CGRect(x: 0, y: -1000, width: 1000, height: 20)
  tree.actions = [2: ["AXCustomThing"], 100: ["AXCustomThing"]]
  tree.elementDescriptions = [2: ["AXCustomThing": "later"], 100: ["AXCustomThing": "earlier"]]
  return tree
}

/// Rule B's waiting alias with a subtree: `wideListChildListedLater` with a shown child (300) under the first row.
private func wideListWaitingChildListedLater() -> FakeTree {
  let tree = wideListChildListedLater()
  tree.children[100] = [300]
  tree.frames[300] = CGRect(x: 0, y: 200, width: 100, height: 20)
  return tree
}

private func shownRows(_ scroll: Int, of rows: Int) -> [Int] { Array(scroll..<min(rows, scroll + 35)) }

private func ids(_ walk: TreeWalk) -> [Int] { walk.nodes.map { Int(($0["title"] as! String).dropFirst(5))! } }

private func preorder(_ tree: FakeTree) -> [Int] {
  var out: [Int] = []
  var seen: Set<Int> = []
  func visit(_ id: Int) {
    guard seen.insert(id).inserted else { return }
    out.append(id)
    for child in tree.children[id] ?? [] { visit(child) }
  }
  visit(0)
  return out
}

private func payload(_ walk: TreeWalk) -> String {
  let data = try! JSONSerialization.data(withJSONObject: ["nodes": walk.nodes, "menuBar": walk.menuBar], options: [.sortedKeys])
  return String(decoding: data, as: UTF8.self)
}

private func recordRows(_ walk: TreeWalk, _ tree: FakeTree) -> [[Int]] {
  walk.screenshotReads.map { [tree.id($0.element), $0.number, $0.parent ?? -1, $0.depth, $0.childCount] }
}

final class WideListTests: XCTestCase {
  /// The invariant: a walk nothing cuts reads every element once and emits exactly the plain preorder's tree, tokens,
  /// record and counts, over Chromium's table (rows, then columns relisting the cells) and a list of more than 100.
  func testAWalkNothingCutsEmitsThePlainPreorderOverWideListsAndTables() {
    let cases: [(String, FakeTree)] = [
      ("table, middle", chromiumTable(rows: 300, columns: 3, scroll: 100)),
      ("table, end", chromiumTable(rows: 150, columns: 2, scroll: 115)),
      ("list of 101", chromiumTable(rows: 101, columns: 0, scroll: 40)),
      ("list of 600", chromiumTable(rows: 600, columns: 0, scroll: 300, cellsPerRow: 2)),
      ("a column before a row, one cell", columnBeforeRow()),
      ("a column before a row, the cell's child", columnBeforeRowNested()),
      ("a wide list's row listed again later", wideListChildListedLater()),
      ("a wide list's waiting child listed again later, with a shown child", wideListWaitingChildListedLater()),
    ]
    for (name, tree) in cases {
      let source = FakeSource(tree)
      let ordered = walk(tree, Lineage(), visibleFrame: windowFrame, source: source, chromium: true, recordsScreenshot: true)
      let plain = walk(tree, Lineage(), chromium: true)
      XCTAssertEqual(ids(ordered), preorder(tree), name)
      XCTAssertEqual(payload(ordered), payload(plain), "\(name): the whole payload")
      XCTAssertEqual(recordRows(ordered, tree), recordRows(plain, tree), "\(name): the guard's record")
      XCTAssertEqual([ordered.omitted, ordered.omittedAbove, ordered.omittedBelow], [0, 0, 0], name)
      XCTAssertFalse(ordered.nodeCapHit || ordered.budgetHit || ordered.deadlineHit, name)
      XCTAssertEqual(source.reads.count, preorder(tree).count, name)
      XCTAssertTrue(source.reads.values.allSatisfy { $0 == 1 }, "\(name): each element read once")
    }
    // The aliases' descriptions are the earliest place's, though the queues read the later place first.
    let cells = walk(columnBeforeRow(), Lineage(), visibleFrame: windowFrame, chromium: true)
    XCTAssertEqual(cells.nodes.compactMap { ($0["actionDescriptions"] as? [String])?.first }, ["cell", "cell"])
    let nested = walk(columnBeforeRowNested(), Lineage(), visibleFrame: windowFrame, chromium: true)
    XCTAssertEqual(nested.nodes.compactMap { ($0["actionDescriptions"] as? [String])?.first }, ["cell child", "cell child"])
    let rows = walk(wideListChildListedLater(), Lineage(), visibleFrame: windowFrame, chromium: true)
    XCTAssertEqual(rows.nodes.compactMap { ($0["actionDescriptions"] as? [String])?.first }, ["earlier", "earlier"])
  }

  /// The re-review of 13805b82..0198ebe7: asking again at the preorder's places stops at the deadline and marks the walk
  /// cut by it. A column (2) listed before 10 rows (10-19) shares their cells (20-29), each with its own action; each
  /// cell's second query, at the column's earlier place, takes 30 ms against a 100-ms deadline.
  func testAskingDescriptionsAgainStopsAtTheDeadline() {
    let tree = FakeTree()
    tree.extra[0] = ["AXRole": "AXWindow" as CFString]
    tree.extra[1] = ["AXRole": "AXTable" as CFString]
    tree.extra[2] = ["AXRole": "AXColumn" as CFString]
    tree.frames[0] = windowFrame
    tree.children = [0: [1], 1: [2] + Array(10..<20), 2: Array(20..<30)]
    for i in 0..<10 {
      tree.children[10 + i] = [20 + i]
      tree.actions[20 + i] = ["AXCustom\(i)"]
      tree.elementDescriptions[20 + i] = ["AXCustom\(i)": "cell \(i)"]
    }
    var queries: [Int: Int] = [:]
    tree.onDescription = { id, _ in
      queries[id, default: 0] += 1
      if queries[id]! > 1 { usleep(30_000) }
    }
    let walked = walk(tree, Lineage(), limits: WalkLimits(deadline: monotonicMilliseconds() + 100), visibleFrame: windowFrame)
    XCTAssertEqual(walked.nodes.count, 23, "the tree is whole")
    XCTAssertTrue(walked.deadlineHit, "marked cut by the deadline")
    XCTAssertLessThan(queries.values.reduce(0, +), 20, "the queries past the deadline are not made")
  }

  /// Rule B: a long table whose shown rows lie in its middle no longer starves the toolbar after it in the document.
  func testAWideTablesShownRowsAreReadFirstAndTheToolbarAfterItIsNotStarved() {
    let tree = chromiumTable(rows: 300, columns: 0, scroll: 100, cellsPerRow: 2)
    let cut = walk(tree, Lineage(), limits: WalkLimits(nodes: 150, deadline: .infinity), visibleFrame: windowFrame, chromium: true)
    XCTAssertTrue(cut.nodeCapHit)
    let kept = Set(ids(cut))
    XCTAssertTrue(Set([toolbar] + buttons).isSubset(of: kept), "the toolbar the table would starve")
    let shown = shownRows(100, of: 300)
    XCTAssertTrue(Set(shown.flatMap { [row($0), cell($0, 0), cell($0, 1)] }).isSubset(of: kept), "the shown rows with their cells")
    XCTAssertEqual(ids(cut), preorder(tree).filter(kept.contains), "printed in the document's order")
    // 3 + 35 rows + 70 cells + the toolbar's 6 = 114; the other 36 go, in the document's order, to the rows above.
    XCTAssertEqual(Set((0..<300).map(row)).intersection(kept), Set((Array(0..<36) + shown).map(row)))
    // #301's marker: the 229 unread rows hang from the table, which shows (placed elsewhere); the 72 cells of the rows
    // read above the viewport lie above it.
    XCTAssertEqual([cut.omitted, cut.omittedAbove, cut.omittedBelow], [301, 72, 0])
  }

  /// Rule B's threshold: a list of exactly 100 is read whole, as before; one of 101 has its shown run read first.
  func testAListOf101HasItsShownRunReadFirstAndOneOf100IsReadWhole() {
    for (count, toolbarKept) in [(100, false), (101, true)] {
      let tree = chromiumTable(rows: count, columns: 0, scroll: 60)
      let source = FakeSource(tree)
      let cut = walk(tree, Lineage(), limits: WalkLimits(nodes: 50, deadline: .infinity), visibleFrame: windowFrame, source: source, chromium: true)
      let kept = Set(ids(cut))
      XCTAssertEqual(kept.contains(toolbar), toolbarKept, "\(count) children")
      XCTAssertEqual(Set(shownRows(60, of: count).map(row)).isSubset(of: kept), toolbarKept, "\(count) children")
      XCTAssertEqual(ids(cut), preorder(tree).filter(kept.contains))
    }
  }

  /// Rule B over #304's 6,000-row table at 90%: the shown rows and the toolbar are read within the 4,000-node budget,
  /// though the rows before them alone exceed it.
  func testASixThousandRowTableAtNinetyPercentKeepsItsShownRowsAndTheToolbar() {
    let tree = chromiumTable(rows: 6_000, columns: 2, scroll: 5_400)
    let cut = walk(tree, Lineage(), visibleFrame: windowFrame, chromium: true)
    XCTAssertTrue(cut.nodeCapHit)
    XCTAssertEqual(cut.nodes.count, maxObservedNodes)
    let kept = Set(ids(cut))
    XCTAssertTrue(Set([toolbar] + buttons).isSubset(of: kept))
    XCTAssertTrue(Set(shownRows(5_400, of: 6_000).flatMap { [row($0), cell($0, 0), cell($0, 1)] }).isSubset(of: kept))
    XCTAssertEqual(ids(cut), preorder(tree).filter(kept.contains))
  }

  /// Rule C: a table scrolled to its end shows its columns (99 rows and 2 columns, so 101 children and columns of 99
  /// cells, too few for rule B's bisection); since #310 the columns themselves wait until nothing else is left, with the
  /// cells they relist, so they never starve the toolbar, and with the budget cut no column and no offscreen row's cell
  /// is read.
  func testAColumnsRelistedCellsGoLastUnderACut() {
    let tree = chromiumTable(rows: 99, columns: 2, scroll: 64)
    let source = FakeSource(tree)
    let cut = walk(tree, Lineage(), limits: WalkLimits(nodes: 150, deadline: .infinity), visibleFrame: windowFrame, source: source, chromium: true)
    XCTAssertTrue(cut.nodeCapHit)
    let kept = Set(ids(cut))
    XCTAssertTrue(Set([toolbar] + buttons).isSubset(of: kept))
    XCTAssertTrue(kept.isDisjoint(with: [column(0), column(1)]), "the columns wait last (#310)")
    let shown = shownRows(64, of: 99)
    let readCells = Set(source.reads.keys.filter { $0 >= 200_000 })
    XCTAssertEqual(readCells, Set(shown.flatMap { [cell($0, 0), cell($0, 1)] }), "only the shown rows' cells: the columns' wait")
    // 3 + 35 rows + 70 cells + the toolbar's 6 = 114; the other 36 go to the rows above, in order.
    XCTAssertEqual(Set((0..<99).map(row)).intersection(kept), Set((Array(0..<36) + shown).map(row)))
    XCTAssertEqual(ids(cut), preorder(tree).filter(kept.contains))
  }

  /// The stated limit: a shown run whose subtree, with what precedes it, takes the whole budget still starves what
  /// follows it in the document.
  func testAShownRunThatTakesTheWholeBudgetStillStarvesWhatFollows() {
    let tree = chromiumTable(rows: 300, columns: 0, scroll: 100, cellsPerRow: 2)
    let cut = walk(tree, Lineage(), limits: WalkLimits(nodes: 100, deadline: .infinity), visibleFrame: windowFrame, chromium: true)
    let kept = Set(ids(cut))
    XCTAssertFalse(kept.contains(toolbar))
    XCTAssertEqual(cut.nodes.count, 100)
    XCTAssertTrue(Set(shownRows(100, of: 300).prefix(30).map(row)).isSubset(of: kept))
  }

  func testTheShownRunJudgesAFramelessChildByTheNextFramedOne() {
    let rows = (0..<300).map(Engine.element)
    let frame = { (element: AXUIElement) -> CGRect? in
      let i = Int(pid(of: element)) - 60_000
      return (100..<105).contains(i) ? nil : CGRect(x: 0, y: Double(i) * 20, width: 100, height: 20)
    }
    // Rows 105–139 show; 100–104, frameless, are judged by row 105.
    XCTAssertEqual(shownChildRun(rows, frame: frame, window: CGRect(x: 0, y: 2100, width: 100, height: 700)), 100..<140)
    // Chromium's strips at the viewport's edges count as outside it.
    let strips = { (element: AXUIElement) -> CGRect? in
      let i = Int(pid(of: element)) - 60_000
      return i < 100 ? CGRect(x: 0, y: 100, width: 100, height: 1) : i >= 135 ? CGRect(x: 0, y: 799, width: 100, height: 1)
        : CGRect(x: 0, y: 100 + Double(i - 100) * 20, width: 100, height: 20)
    }
    XCTAssertEqual(shownChildRun(rows, frame: strips, window: viewport), 100..<135)
    XCTAssertNil(shownChildRun(rows, frame: { _ in CGRect(x: 0, y: 0, width: 10, height: 10) }, window: viewport), "no axis")
    XCTAssertNil(shownChildRun(rows, frame: { _ in nil }, window: viewport))
  }

  /// Rule A (#309): an end child framed at its parent's origin, or a run of end children each overlapping the first
  /// (Chromium's columns), leaves the axis to the next child back that says one.
  func testTheBisectionsAxisSurvivesAnEndChildThatOverlapsTheFirst() {
    let rows = (0..<1000).map(Engine.element)
    let window = CGRect(x: 0, y: 5000, width: 100, height: 100)
    let atOrigin = { (element: AXUIElement) -> CGRect? in
      let i = Int(pid(of: element)) - 60_000
      return i == 999 ? CGRect(x: 0, y: 0, width: 100, height: 10) : CGRect(x: 0, y: Double(i) * 10, width: 100, height: 10)
    }
    XCTAssertEqual(recordedChildPositions(rows, frame: atOrigin, window: window, limit: 1000), Array(500..<510))
    let columns = { (element: AXUIElement) -> CGRect? in
      let i = Int(pid(of: element)) - 60_000
      return i >= 980 ? CGRect(x: Double(i - 980) * 5, y: 0, width: 5, height: 9_800) : CGRect(x: 0, y: Double(i) * 10, width: 100, height: 10)
    }
    XCTAssertEqual(recordedChildPositions(rows, frame: columns, window: window, limit: 1000), Array(500..<510))
    // A first child that spans the list's height (a sidebar) beside rows that follow it down: vertical.
    let sidebar = { (element: AXUIElement) -> CGRect? in
      let i = Int(pid(of: element)) - 60_000
      return i == 0 ? CGRect(x: 0, y: 0, width: 20, height: 10_000) : CGRect(x: 20, y: Double(i) * 10, width: 80, height: 10)
    }
    XCTAssertEqual(recordedChildPositions(rows, frame: sidebar, window: window, limit: 1000), Array(500..<510))
    // No axis is real: every child overlaps the first, or none is framed.
    let stacked = { (_: AXUIElement) -> CGRect? in CGRect(x: 0, y: 0, width: 10, height: 10) }
    XCTAssertEqual(recordedChildPositions(rows, frame: stacked, window: window, limit: 1000), [])
    let overlapping = { (element: AXUIElement) -> CGRect? in CGRect(x: 0, y: Double(Int(pid(of: element)) - 60_000) * 0.001, width: 10, height: 10) }
    XCTAssertEqual(recordedChildPositions(rows, frame: overlapping, window: window, limit: 1000), [])
  }

  /// #309 in the walk: Safari's body of more than 499 children, its last child framed at the body's origin, prints its
  /// shown children (#314; before it the width rule printed none, and the guard's record kept them).
  func testAWideBodyWhoseLastChildSitsAtItsOriginPrintsItsShownChildren() {
    let tree = FakeTree()
    tree.extra[0] = ["AXRole": "AXWindow" as CFString]
    tree.frames[0] = windowFrame
    tree.children = [0: [1], 1: Array(100..<700)]
    tree.frames[1] = CGRect(x: 0, y: -4000, width: 1000, height: 12_000)
    for i in 0..<600 { tree.frames[100 + i] = CGRect(x: 0, y: Double(i - 200) * 20, width: 1000, height: 20) }
    tree.frames[699] = CGRect(x: 0, y: -4000, width: 1000, height: 10)
    let recording = walk(tree, Lineage(), visibleFrame: windowFrame, recordsScreenshot: true)
    XCTAssertEqual(ids(recording), [0, 1] + Array(300..<340))
    XCTAssertEqual(recording.recordOnlyReads, 0)
  }
}
