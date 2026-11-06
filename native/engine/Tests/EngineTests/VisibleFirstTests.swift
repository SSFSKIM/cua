import ApplicationServices
import XCTest
@testable import Engine

// #301: when the node budget cuts, the walk keeps what the window shows (the design session's ruling aed3f041), over
// the fake tree of WalkTests.swift. The page is #299's shape in small: a long document scrolled part-way down, with a
// budget smaller than the page.

private let windowFrame = CGRect(x: 0, y: 0, width: 1000, height: 800)
/// The web area's frame: the viewport, below a 100-pt toolbar.
private let viewport = CGRect(x: 0, y: 100, width: 1000, height: 700)

/// A long page: the window (0), its web area (1), 50 blocks (100 + j, each 100 pt tall) of 10 leaves (1000 + 10j + k,
/// 100 pt wide), scrolled `scroll` blocks down. `chromium` reports what lies off the viewport as Chromium does, a 1-pt
/// strip at its nearer edge. `collapsed` puts the blocks in a container Chromium reports as a strip mid-viewport (2),
/// after a section scrolled off above (3) whose 300 leaves (5000 + i) come first in the document.
private func page(scroll: Int, chromium: Bool = false, collapsed: Bool = false) -> FakeTree {
  let tree = FakeTree()
  tree.extra[0] = ["AXRole": "AXWindow" as CFString]
  tree.extra[1] = ["AXRole": "AXWebArea" as CFString]
  tree.frames[0] = windowFrame
  tree.frames[1] = viewport
  func place(_ frame: CGRect) -> CGRect {
    guard chromium else { return frame }
    if frame.maxY <= viewport.minY { return CGRect(x: frame.minX, y: viewport.minY, width: frame.width, height: 1) }
    if frame.minY >= viewport.maxY { return CGRect(x: frame.minX, y: viewport.maxY - 1, width: frame.width, height: 1) }
    return frame
  }
  let blocks = Array(100..<150)
  if collapsed {
    tree.children[1] = [3, 2]
    tree.children[2] = blocks
    tree.frames[2] = CGRect(x: 0, y: 300, width: 1000, height: 1)
    tree.children[3] = Array(5000..<5300)
    tree.frames[3] = place(CGRect(x: 0, y: -10_000, width: 1000, height: 300))
    for leaf in 5000..<5300 { tree.frames[leaf] = place(CGRect(x: 0, y: -10_000 + Double(leaf - 5000), width: 1000, height: 1)) }
  } else {
    tree.children[1] = blocks
  }
  tree.children[0] = [1]
  for j in 0..<50 {
    let y = 100 + Double(j - scroll) * 100
    tree.frames[100 + j] = place(CGRect(x: 0, y: y, width: 1000, height: 100))
    tree.children[100 + j] = (0..<10).map { 1000 + 10 * j + $0 }
    for k in 0..<10 { tree.frames[1000 + 10 * j + k] = place(CGRect(x: Double(k) * 100, y: y, width: 100, height: 100)) }
  }
  // The hit-test answers the leaf under a point of the viewport, the window above it.
  tree.hit = { point in
    guard point.y >= viewport.minY else { return 0 }
    let j = scroll + Int((point.y - viewport.minY) / 100)
    return j < 50 ? 1000 + 10 * j + Int(point.x / 100) : nil
  }
  return tree
}

/// The leaves of the blocks the window shows when scrolled `scroll` blocks down (7 blocks fill the viewport).
private func visibleLeaves(scroll: Int) -> Set<Int> { Set((scroll..<scroll + 7).flatMap { j in (0..<10).map { 1000 + 10 * j + $0 } }) }

/// The fake ids of a walk's window nodes, in its order.
private func ids(_ walk: TreeWalk) -> [Int] { walk.nodes.map { Int(($0["title"] as! String).dropFirst(5))! } }
private func tokens(_ walk: TreeWalk) -> [Int: String] {
  Dictionary(uniqueKeysWithValues: walk.nodes.map { (Int(($0["title"] as! String).dropFirst(5))!, $0["token"] as! String) })
}

/// The tree's preorder from the window, every element.
private func preorder(_ tree: FakeTree) -> [Int] {
  var out: [Int] = []
  func visit(_ id: Int) { out.append(id); for child in tree.children[id] ?? [] { visit(child) } }
  visit(0)
  return out
}

private let budget = WalkLimits(nodes: 150, deadline: .infinity)

/// A walk's whole payload, window nodes then menu bar, as the engine serializes it (keys sorted).
private func payload(_ walk: TreeWalk) -> String {
  let data = try! JSONSerialization.data(withJSONObject: ["nodes": walk.nodes, "menuBar": walk.menuBar], options: [.sortedKeys])
  return String(decoding: data, as: UTF8.self)
}

final class VisibleFirstTests: XCTestCase {
  func testAWalkNothingCutsEmitsExactlyThePlainPreorder() {
    for chromium in [false, true] {
      let tree = page(scroll: 30, chromium: chromium)
      let source = FakeSource(tree)
      let ordered = walk(tree, Lineage(), visibleFrame: windowFrame, source: source, chromium: chromium)
      let plain = walk(tree, Lineage())
      XCTAssertEqual(ids(ordered), preorder(tree), "every element, in the document's order")
      XCTAssertEqual(ids(ordered), ids(plain))
      XCTAssertEqual(ordered.nodes.map { $0["token"] as! String }, plain.nodes.map { $0["token"] as! String }, "tokens allocated in the document's order")
      XCTAssertEqual(ordered.nodes.map { $0["depth"] as! Int }, plain.nodes.map { $0["depth"] as! Int })
      XCTAssertEqual(payload(ordered), payload(plain), "the whole payload")
      XCTAssertEqual(ordered.omitted, 0)
      XCTAssertTrue(source.reads.values.allSatisfy { $0 == 1 }, "each element read once")
      XCTAssertNil(ordered.seeding, "no seeding when the budget does not cut")
      XCTAssertEqual(source.hitTests, 0)
    }
  }

  /// The review of c4057c3a..effffcee: an action's description is the system's answer for the earliest element in
  /// the preorder that asks, as when the walk read in preorder, though the selection reads a visible sibling first.
  func testAnUncutWalksActionDescriptionsAreThePreordersWhateverItReadFirst() {
    let tree = FakeTree()
    tree.extra[0] = ["AXRole": "AXWindow" as CFString]
    tree.frames[0] = windowFrame
    tree.children = [0: [1, 2], 1: [3]]
    tree.frames[1] = CGRect(x: 0, y: 2000, width: 100, height: 100)  // off the window: its child waits
    tree.frames[3] = CGRect(x: 0, y: 2000, width: 100, height: 30)
    tree.frames[2] = CGRect(x: 0, y: 100, width: 100, height: 30)
    tree.actions = [3: ["AXCustomThing"], 2: ["AXCustomThing"]]
    tree.elementDescriptions = [3: ["AXCustomThing": "earlier"], 2: ["AXCustomThing": "later"]]
    let ordered = walk(tree, Lineage(), menuBar: 89, menu: [88, 90], visibleFrame: windowFrame)
    let plain = walk(tree, Lineage(), menuBar: 89, menu: [88, 90])
    XCTAssertEqual(ids(plain), [0, 1, 3, 2])
    XCTAssertEqual(payload(ordered), payload(plain))
    XCTAssertEqual(ordered.nodes.map { $0["actionDescriptions"] as? [String] }, [[], [], ["earlier"], ["earlier"]])
  }

  /// The re-review of effffcee..ab0e019a: an earlier element's longer description, replacing the cached one for nodes
  /// already selected, is charged to the byte budget, and refused past it, so the emitted tree never exceeds the budget.
  func testALaterLongerDescriptionNeverTakesTheTreePastTheByteBudget() {
    let tree = FakeTree()
    tree.extra[0] = ["AXRole": "AXWindow" as CFString]
    tree.frames[0] = windowFrame
    tree.children = [0: [1, 2], 1: [3], 2: Array(100..<200)]
    tree.frames[1] = CGRect(x: 0, y: 2000, width: 100, height: 100)  // off the window: its child waits
    tree.frames[3] = CGRect(x: 0, y: 2000, width: 100, height: 30)
    tree.frames[2] = windowFrame
    tree.actions[3] = ["AXCustomThing"]
    tree.elementDescriptions[3] = ["AXCustomThing": String(repeating: "a", count: 10_000)]
    for id in 100..<200 {
      tree.frames[id] = CGRect(x: 0, y: Double(id - 100) * 5, width: 100, height: 5)
      tree.actions[id] = ["AXCustomThing"]
      tree.elementDescriptions[id] = ["AXCustomThing": "short"]
    }
    let limits = WalkLimits(bytes: 200_000, deadline: .infinity)
    let walked = walk(tree, Lineage(), limits: limits, visibleFrame: windowFrame)
    XCTAssertLessThanOrEqual(jsonBytes(walked.nodes), limits.bytes, "the emitted tree within the byte budget")
    XCTAssertLessThanOrEqual(walked.bytes, limits.bytes)
    XCTAssertEqual(walked.nodes.count, 104, "every element kept")
    XCTAssertTrue(walked.nodes.allSatisfy { ($0["actionDescriptions"] as? [String] ?? ["short"]) == ["short"] || ($0["actionDescriptions"] as? [String]) == [] },
                  "the replacement that would not fit is refused: one answer for the name")
    let plain = walk(tree, Lineage(), limits: limits)
    XCTAssertTrue(plain.budgetHit, "the preorder asks the long answer first and is cut by the bytes")
  }

  /// The same review: the seeding's trigger counts distinct elements, so a tree whose groups share their children, under
  /// the budget, is never seeded.
  func testSharedChildrenUnderTheBudgetNeverSeed() {
    let tree = FakeTree()
    tree.extra[0] = ["AXRole": "AXWindow" as CFString]
    tree.frames[0] = windowFrame
    tree.children[0] = Array(1...40)
    for group in 1...40 {
      tree.children[group] = Array(1000..<1100)
      tree.frames[group] = CGRect(x: 0, y: Double(group) * 10, width: 1000, height: 10)
    }
    tree.hit = { _ in 1000 }
    let source = FakeSource(tree)
    let walked = walk(tree, Lineage(), limits: WalkLimits(nodes: 150, deadline: .infinity), visibleFrame: windowFrame, source: source, chromium: true)
    XCTAssertFalse(walked.nodeCapHit)
    XCTAssertEqual(walked.nodes.count, 141)
    XCTAssertNil(walked.seeding)
    XCTAssertEqual(source.hitTests, 0)
  }

  func testTheBudgetIsSpentOnWhatTheWindowShowsAndTheTreeStaysInTheDocumentsOrder() {
    let tree = page(scroll: 30)
    let cut = walk(tree, Lineage(), limits: budget, visibleFrame: windowFrame)
    XCTAssertTrue(cut.nodeCapHit)
    XCTAssertEqual(cut.nodes.count, 150)
    XCTAssertTrue(visibleLeaves(scroll: 30).isSubset(of: Set(ids(cut))), "every leaf the window shows")
    let kept = Set(ids(cut))
    XCTAssertEqual(ids(cut), preorder(tree).filter(kept.contains), "printed in the document's order")
    // The rest of the budget in the document's order: the blocks first (each read to learn its frame), then from the top.
    XCTAssertTrue(Set(100..<150).isSubset(of: kept))
    XCTAssertTrue(Set(1000..<1020).isSubset(of: kept))
    // Omitted: block 102's last 2 leaves and blocks 103–129's, above; blocks 137–149's below.
    XCTAssertEqual(cut.omitted, 402)
    XCTAssertEqual(cut.omittedAbove, 272)
    XCTAssertEqual(cut.omittedBelow, 130)

    let plain = walk(tree, Lineage(), limits: budget)
    XCTAssertTrue(visibleLeaves(scroll: 30).isDisjoint(with: Set(ids(plain))), "the plain preorder spends it at the top")
  }

  func testTheGuardsRecordChecksTheLeafTheWindowShows() {
    let tree = page(scroll: 30)
    let point = CGPoint(x: 350, y: 450)  // block 133, leaf 3
    let cut = walk(tree, Lineage(), limits: budget, visibleFrame: windowFrame)
    let node = try! XCTUnwrap(deepestScreenshotNode(at: point, in: screenshotNodes(cut.screenshotReads)))
    XCTAssertTrue(CFEqual(node.element, Engine.element(1333)))
    XCTAssertTrue(node.subtreeRecorded, "checked, not container-only")

    let plain = walk(tree, Lineage(), limits: budget)
    let container = try! XCTUnwrap(deepestScreenshotNode(at: point, in: screenshotNodes(plain.screenshotReads)))
    XCTAssertTrue(CFEqual(container.element, Engine.element(1)), "the preorder's record holds only the web area there")
    XCTAssertFalse(container.subtreeRecorded)
  }

  /// The ruling's condition: an element present in consecutive observations keeps its token, though the kept set moves
  /// with the scroll and what the budget leaves unread lies scattered.
  func testTokensSurviveAScrollThatMovesTheKeptSet() {
    let lineage = Lineage()
    let first = walk(page(scroll: 30), lineage, limits: budget, visibleFrame: windowFrame)
    let second = walk(page(scroll: 32), lineage, limits: budget, visibleFrame: windowFrame)
    let (a, b) = (tokens(first), tokens(second))
    let both = Set(a.keys).intersection(b.keys)
    XCTAssertTrue(visibleLeaves(scroll: 32).subtracting(visibleLeaves(scroll: 30)).isDisjoint(with: Set(a.keys)), "blocks 137–138 new to the second")
    XCTAssertTrue(visibleLeaves(scroll: 32).intersection(visibleLeaves(scroll: 30)).isSubset(of: both))
    for id in both { XCTAssertEqual(a[id], b[id], "node \(id) keeps its token") }
    // Blocks 130–131's leaves left the kept set: carried over, still resolvable, and theirs again when they return.
    let leftBehind = visibleLeaves(scroll: 30).subtracting(visibleLeaves(scroll: 32))
    for id in leftBehind {
      XCTAssertNil(b[id])
      XCTAssertNotNil(lineage.entry(tokenNumber(a[id]!)!), "node \(id) carried over")
    }
    let third = tokens(walk(page(scroll: 30), lineage, limits: budget, visibleFrame: windowFrame))
    for id in leftBehind { XCTAssertEqual(third[id], a[id], "node \(id) back in view with its token") }
    for id in Set(third.keys).intersection(b.keys) { XCTAssertEqual(third[id], b[id]) }
  }

  func testAChromiumWalkTheBudgetWillCutIsSeededByHitTestsIntoACollapsedContainer() {
    let tree = page(scroll: 30, chromium: true, collapsed: true)
    let unseeded = walk(tree, Lineage(), limits: budget, visibleFrame: windowFrame)
    XCTAssertTrue(visibleLeaves(scroll: 30).isDisjoint(with: Set(ids(unseeded))), "frames alone: the strip hides what it holds")

    let source = FakeSource(tree)
    let seeded = walk(tree, Lineage(), limits: budget, visibleFrame: windowFrame, source: source, chromium: true)
    XCTAssertTrue(visibleLeaves(scroll: 30).isSubset(of: Set(ids(seeded))), "every leaf the window shows")
    let kept = Set(ids(seeded))
    XCTAssertEqual(ids(seeded), preorder(tree).filter(kept.contains), "printed in the document's order")
    let report = try! XCTUnwrap(seeded.seeding)
    XCTAssertFalse(report.capped)
    XCTAssertEqual(report.points, seedPoints(in: windowFrame).count)
    XCTAssertGreaterThan(report.chains, 0)
    XCTAssertEqual(source.hitTests, report.points)
    // The climb stops at what the walk took up or already seeded: far fewer parent reads than points times depth.
    XCTAssertLessThan(source.parentReads, report.points * 2)
    // Chromium's strips placed by their edge: the section and the blocks above at the top, the blocks below at the bottom.
    XCTAssertGreaterThan(seeded.omittedAbove, 0)
    XCTAssertGreaterThan(seeded.omittedBelow, 0)
    XCTAssertEqual(seeded.omitted, seeded.omittedAbove + seeded.omittedBelow)
  }

  func testPastTheSeedingsCapWhatIsSeededStaysAndTheRestIsReadInTheDocumentsOrder() {
    let tree = page(scroll: 30, chromium: true, collapsed: true)
    let source = FakeSource(tree)
    let capped = walk(tree, Lineage(), limits: WalkLimits(nodes: 150, deadline: .infinity, seedMs: 0), visibleFrame: windowFrame, source: source,
                      chromium: true)
    let report = try! XCTUnwrap(capped.seeding)
    XCTAssertTrue(report.capped)
    XCTAssertEqual(report.points, 0)
    XCTAssertEqual(source.hitTests, 0)
    XCTAssertEqual(capped.nodes.count, 150, "the budget still spent")
    XCTAssertTrue(Set(5000..<5146).isSubset(of: Set(ids(capped))), "in the document's order")
  }

  func testAWidthRuleOmittedListKeepsItsShownRowsInTheGuardsRecordOnly() {
    // A list (1) of 600 rows 20 pt tall (100 + i), each with two cells (2000 + 2i, 2001 + 2i), scrolled 200 rows down.
    let tree = FakeTree()
    tree.extra[0] = ["AXRole": "AXWindow" as CFString]
    tree.frames[0] = windowFrame
    tree.children = [0: [1], 1: Array(100..<700)]
    tree.frames[1] = windowFrame
    for i in 0..<600 {
      let y = Double(i - 200) * 20
      tree.frames[100 + i] = CGRect(x: 0, y: y, width: 1000, height: 20)
      tree.children[100 + i] = [2000 + 2 * i, 2001 + 2 * i]
      tree.frames[2000 + 2 * i] = CGRect(x: 0, y: y, width: 500, height: 20)
      tree.frames[2001 + 2 * i] = CGRect(x: 500, y: y, width: 500, height: 20)
    }
    let shownRows = Set((200..<240).map { 100 + $0 })
    let recording = walk(tree, Lineage(), visibleFrame: windowFrame, recordsScreenshot: true)
    XCTAssertEqual(ids(recording), [0, 1], "the tree keeps the vendor's width rule")
    XCTAssertEqual((recording.nodes[1]["shown"] as? [String: Any])?["subset"] as? String, "omitted")
    XCTAssertEqual(recording.omitted, 0, "nothing the tree's rules keep is omitted")
    let recorded = recording.screenshotReads
    XCTAssertEqual(Set(recorded.filter { $0.depth == 2 }.map { tree.id($0.element) }), shownRows)
    XCTAssertEqual(recorded.filter { $0.depth == 3 }.count, 80, "with their subtrees")
    XCTAssertTrue(recorded.filter { $0.depth >= 2 }.allSatisfy { $0.number < 0 }, "outside the lineage")
    XCTAssertEqual(recording.recordOnlyReads, 120)
    let cell = try! XCTUnwrap(deepestScreenshotNode(at: CGPoint(x: 700, y: 210), in: screenshotNodes(recorded)))
    XCTAssertEqual(tree.id(cell.element), 2001 + 2 * 210)
    XCTAssertTrue(cell.subtreeRecorded)
    XCTAssertFalse(screenshotNodes(recorded)[1].subtreeRecorded, "the list itself is still held in part")

    let plain = walk(tree, Lineage(), visibleFrame: windowFrame)
    XCTAssertEqual(plain.screenshotReads.count, 2, "no record-only reads without a screenshot")
    XCTAssertEqual(plain.recordOnlyReads, 0)
  }

  /// The review of 1abb734d: the record's reads come after the tree's, so a deadline they run into cuts the record and
  /// never the printed tree.
  func testTheRecordsReadsNeverTakeTheTreesTime() {
    let tree = FakeTree()
    tree.slow = [300: 300_000]  // a shown row takes 300 ms to read
    tree.extra[0] = ["AXRole": "AXWindow" as CFString]
    tree.frames[0] = windowFrame
    tree.children = [0: [1, 2], 1: Array(100..<700)]
    tree.frames[1] = windowFrame
    tree.frames[2] = CGRect(x: 0, y: 700, width: 100, height: 30)
    for i in 0..<600 { tree.frames[100 + i] = CGRect(x: 0, y: Double(i - 200) * 20, width: 1000, height: 20) }
    let recording = walk(tree, Lineage(), limits: WalkLimits(deadline: monotonicMilliseconds() + 150), visibleFrame: windowFrame,
                         recordsScreenshot: true)
    XCTAssertEqual(ids(recording), [0, 1, 2], "the button after the list is printed")
    XCTAssertFalse(recording.deadlineHit, "the deadline cut the record, not the tree")
    XCTAssertEqual(recording.recordOnlyReads, 0, "the slow row finished past the deadline: the record stops there")
  }

  /// The re-review of e474396e: a wide list its ancestors hide (in a scroll area scrolled off) is not searched, so its
  /// rows, whose own frames overlap the window, never spend the record's budget before a shown list's.
  func testAHiddenWideListSpendsNothingOfTheRecordsBudget() {
    let tree = FakeTree()
    tree.extra[0] = ["AXRole": "AXWindow" as CFString]
    tree.frames[0] = windowFrame
    // 1: a scroll area off the window holding list 2; 3: a shown list. Both lists' 600 rows overlap the window.
    tree.extra[1] = ["AXRole": "AXScrollArea" as CFString]
    tree.frames[1] = CGRect(x: 0, y: 2000, width: 1000, height: 800)
    tree.children = [0: [1, 3], 1: [2], 2: Array(100..<700), 3: Array(1100..<1700)]
    tree.frames[2] = windowFrame
    tree.frames[3] = windowFrame
    for i in 0..<600 {
      tree.frames[100 + i] = CGRect(x: 0, y: Double(i - 200) * 20, width: 1000, height: 20)
      tree.frames[1100 + i] = CGRect(x: 0, y: Double(i - 200) * 20, width: 1000, height: 20)
    }
    let source = FakeSource(tree)
    let recording = walk(tree, Lineage(), visibleFrame: windowFrame, source: source, recordsScreenshot: true)
    let recorded = Set(recording.screenshotReads.filter { $0.number < 0 }.map { tree.id($0.element) })
    XCTAssertEqual(recorded, Set(1300..<1340), "the shown list's rows, none of the hidden list's")
    XCTAssertTrue((100..<700).allSatisfy { source.reads[$0] == nil }, "the hidden rows are never read")
  }

  func testOmittedPartsArePlacedByTheEdgeTheirElementLiesPast() {
    XCTAssertEqual(omittedPlace(frame: CGRect(x: 0, y: 0, width: 10, height: 50), visible: viewport), .above)
    XCTAssertEqual(omittedPlace(frame: CGRect(x: 0, y: 100, width: 10, height: 1), visible: viewport), .above, "a strip at the top edge")
    XCTAssertEqual(omittedPlace(frame: CGRect(x: 0, y: 799, width: 10, height: 1), visible: viewport), .below, "a strip at the bottom edge")
    XCTAssertEqual(omittedPlace(frame: CGRect(x: 0, y: 900, width: 10, height: 50), visible: viewport), .below)
    XCTAssertEqual(omittedPlace(frame: CGRect(x: 0, y: 300, width: 10, height: 1), visible: viewport), .elsewhere, "a strip mid-viewport")
    XCTAssertEqual(omittedPlace(frame: CGRect(x: 2000, y: 300, width: 10, height: 10), visible: viewport), .elsewhere, "beside it")
    XCTAssertEqual(omittedPlace(frame: nil, visible: viewport), .elsewhere)
    XCTAssertEqual(omittedPlace(frame: CGRect(x: 0, y: 0, width: 10, height: 50), visible: nil), .elsewhere)
  }

  func testRecordedChildPositionsBisectAnOrderedListAndGiveNoneWithoutAnOrder() {
    let rows = (0..<1000).map(Engine.element)
    let vertical = { (element: AXUIElement) -> CGRect? in
      let i = Int(pid(of: element)) - 60_000
      return i % 7 == 3 ? nil : CGRect(x: 0, y: Double(i) * 10, width: 100, height: 10)
    }
    let window = CGRect(x: 0, y: 5000, width: 100, height: 100)
    let kept = recordedChildPositions(rows, frame: vertical, window: window, limit: 1000)
    XCTAssertEqual(kept, (500..<510).filter { $0 % 7 != 3 })
    XCTAssertEqual(recordedChildPositions(rows, frame: vertical, window: window, limit: 3), [501],
                   "the limit bounds the children read past the bisection (499 before, 500 frameless), not only those kept")
    var reads = 0
    let counted = { (element: AXUIElement) -> CGRect? in reads += 1; return vertical(element) }
    XCTAssertEqual(recordedChildPositions(rows, frame: counted, window: window, limit: 1000, expired: { reads >= 5 }), [],
                   "no frame read once the deadline has passed, and nothing kept from a search it cut")
    XCTAssertLessThanOrEqual(reads, 5)
    // Rows inside the window's height but beside it: read up to the limit, none kept.
    reads = 0
    let beside = { (element: AXUIElement) -> CGRect? in reads += 1; return CGRect(x: 500, y: Double(Int(pid(of: element)) - 60_000) * 0.01, width: 10, height: 1) }
    XCTAssertEqual(recordedChildPositions(rows, frame: beside, window: CGRect(x: 0, y: 0, width: 100, height: 100), limit: 50), [])
    XCTAssertLessThan(reads, 50 + 40)
    let horizontal = { (element: AXUIElement) -> CGRect? in CGRect(x: Double(Int(pid(of: element)) - 60_000) * 10, y: 0, width: 10, height: 10) }
    XCTAssertEqual(recordedChildPositions(rows, frame: horizontal, window: CGRect(x: 95, y: 0, width: 30, height: 10), limit: 1000), [9, 10, 11, 12])
    let stacked = { (_: AXUIElement) -> CGRect? in CGRect(x: 0, y: 0, width: 10, height: 10) }
    XCTAssertEqual(recordedChildPositions(rows, frame: stacked, window: window, limit: 1000), [], "no order to bisect")
    XCTAssertEqual(recordedChildPositions(rows, frame: { _ in nil }, window: window, limit: 1000), [])
  }

  func testSeedPointsCoverTheGridOnceCoarseFirst() {
    let points = seedPoints(in: windowFrame)
    XCTAssertEqual(points.count, 12 * 10, "80 pt apart over 1000 × 800, each at its cell's centre")
    XCTAssertEqual(Set(points.map { "\($0.x),\($0.y)" }).count, points.count)
    XCTAssertEqual(points.first, CGPoint(x: 40, y: 40))
    XCTAssertTrue(points.prefix(4).contains(CGPoint(x: 680, y: 680)), "the coarse pass spans the window")
  }
}
