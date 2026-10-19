import ApplicationServices
import XCTest
@testable import Engine

// The walk, the lineage's numbering and the width rule against a fake tree. Fake elements are application handles for
// pids no process uses: AXUIElementCreateApplication, CFEqual and CFHash are local, so no message reaches any process,
// and the fake source answers every attribute itself.

private func element(_ id: Int) -> AXUIElement { AXUIElementCreateApplication(pid_t(60_000 + id)) }

/// A tree by id: each node's children and, optionally, a visible subset and a frame.
final class FakeTree {
  var children: [Int: [Int]] = [:]
  var visible: [Int: [Int]] = [:]
  var frames: [Int: CGRect] = [:]
  var unreadable: Set<Int> = []

  func id(_ element: AXUIElement) -> Int { Int(pid(of: element)) - 60_000 }
}

final class FakeSource: ElementSource, @unchecked Sendable {
  let tree: FakeTree
  /// Children per read, as a prefetching route would cap them (nil: all).
  let cap: Int?
  init(_ tree: FakeTree, cap: Int? = nil) {
    self.tree = tree
    self.cap = cap
  }

  override func data(_ element: AXUIElement, subtree: Bool = true) -> ElementData? {
    let id = tree.id(element)
    if tree.unreadable.contains(id) { return nil }
    let all = (tree.children[id] ?? []).map(Engine.element)
    let returned = cap.map { Array(all.prefix($0)) } ?? all
    var values: [String: CFTypeRef] = ["AXRole": "AXGroup" as CFString, "AXTitle": "node \(id)" as CFString,
                                       "AXChildren": returned as CFArray]
    if let frame = tree.frames[id] {
      var origin = frame.origin, extent = frame.size
      values["AXPosition"] = AXValueCreate(.cgPoint, &origin)!
      values["AXSize"] = AXValueCreate(.cgSize, &extent)!
    }
    return ElementData(values: values, childCount: all.count)
  }

  override func owner(_ element: AXUIElement) -> pid_t { 4242 }
  override func actions(_ element: AXUIElement) -> [String] { [] }
  override func isSettable(_ element: AXUIElement, _ attribute: String, phase: String) -> Bool { false }
  override func allChildren(_ element: AXUIElement) -> [AXUIElement] { (tree.children[tree.id(element)] ?? []).map(Engine.element) }
  override func visibleChildren(_ element: AXUIElement) -> [AXUIElement]? { tree.visible[tree.id(element)].map { $0.map(Engine.element) } }
  override func frame(_ element: AXUIElement) -> CGRect? { tree.frames[tree.id(element)] }
}

extension Engine {
  // The test's handle maker, reachable as `Engine.element` from the fake source's closures.
  static func element(_ id: Int) -> AXUIElement { AXUIElementCreateApplication(pid_t(60_000 + id)) }
}

private func walk(_ tree: FakeTree, _ lineage: Lineage, window: Int = 0, menu: [Int] = [], limits: WalkLimits = WalkLimits(deadline: .infinity),
                  cap: Int? = nil, visibleFrame: CGRect? = nil) -> TreeWalk {
  let walk = TreeWalk(source: FakeSource(tree, cap: cap), lineage: lineage, limits: limits, markdown: false, visibleFrame: visibleFrame)
  walk.run(window: element(window), menuItems: menu.map(element))
  lineage.commit(walk.revision)
  return walk
}

/// Index by fake id for the nodes a walk emitted.
private func indexes(_ walk: TreeWalk) -> [Int: Int] {
  var map: [Int: Int] = [:]
  for node in walk.nodes + walk.menuBar { map[Int((node["title"] as! String).dropFirst(5))!] = node["index"] as? Int }
  return map
}

final class WalkTests: XCTestCase {
  func testAFreshLineageNumbersFromZeroInPreorderWithTheMenuBarAfterTheWindow() {
    let tree = FakeTree()
    tree.children = [0: [1, 4], 1: [2, 3], 90: [91]]
    let first = walk(tree, Lineage(), menu: [90, 92])
    XCTAssertEqual(first.nodes.map { $0["title"] as! String }, ["node 0", "node 1", "node 2", "node 3", "node 4"])
    XCTAssertEqual(first.nodes.map { $0["index"] as! Int }, [0, 1, 2, 3, 4])
    XCTAssertEqual(first.nodes.map { $0["depth"] as! Int }, [0, 1, 2, 2, 1])
    XCTAssertEqual(first.menuBar.map { $0["index"] as! Int }, [5, 6])
    XCTAssertEqual(first.menuBar.map { $0["children"] as! Int }, [0, 0], "menu-bar items are not walked into")
    XCTAssertEqual(first.menuBar.map { $0["depth"] as! Int }, [0, 0])
  }

  func testAnUnchangedTreeKeepsEveryIndex() {
    let tree = FakeTree()
    tree.children = [0: [1, 4], 1: [2, 3]]
    let lineage = Lineage()
    let first = indexes(walk(tree, lineage, menu: [90]))
    XCTAssertEqual(indexes(walk(tree, lineage, menu: [90])), first)
  }

  func testANewElementTakesTheNextUnusedIndexAndARetiredIndexIsNeverReused() {
    let tree = FakeTree()
    tree.children = [0: [1, 2, 3]]
    let lineage = Lineage()
    _ = walk(tree, lineage)                       // 0..3
    tree.children = [0: [1, 2]]                   // 3 vanishes: index 3 retired
    let second = indexes(walk(tree, lineage))
    XCTAssertEqual(second, [0: 0, 1: 1, 2: 2])
    XCTAssertNil(lineage.entry(3), "the vanished element's index is retired")
    tree.children = [0: [1, 2, 5]]                // a new element after the retired one
    XCTAssertEqual(indexes(walk(tree, lineage))[5], 4, "the next unused index, never the retired 3")
  }

  func testAReorderedElementOutsideTheStableRunTakesANewIndex() {
    let tree = FakeTree()
    tree.children = [0: [1, 2, 3, 4]]
    let lineage = Lineage()
    _ = walk(tree, lineage)                       // 1→1, 2→2, 3→3, 4→4
    tree.children = [0: [1, 3, 4, 2]]             // 2 moved last: 3, 4 stay in order
    let after = indexes(walk(tree, lineage))
    XCTAssertEqual(after[1], 1)
    XCTAssertEqual(after[3], 3)
    XCTAssertEqual(after[4], 4)
    XCTAssertEqual(after[2], 5, "the moved element is new to the lineage")
  }

  func testAnElementUnderAnotherParentTakesANewIndex() {
    let tree = FakeTree()
    tree.children = [0: [1, 2], 1: [3]]
    let lineage = Lineage()
    _ = walk(tree, lineage)                       // 0, 1, 3→2, 2→3
    tree.children = [0: [1, 2], 2: [3]]
    let after = indexes(walk(tree, lineage))
    XCTAssertEqual(after[1], 1)
    XCTAssertEqual(after[2], 3)
    XCTAssertEqual(after[3], 4)
  }

  func testDisableDiffsFreshLineageRenumbersFromZero() {
    let tree = FakeTree()
    tree.children = [0: [1, 2, 3]]
    let old = Lineage()
    _ = walk(tree, old)
    tree.children = [0: [3]]
    _ = walk(tree, old)
    let fresh = Lineage()                         // what disableDiff gives the observation
    XCTAssertEqual(indexes(walk(tree, fresh)), [0: 0, 3: 1])
    XCTAssertNotEqual(fresh.id, old.id)
  }

  func testAWalkCutByTheNodeBudgetRetiresNothingPastTheCut() {
    let tree = FakeTree()
    tree.children = [0: [1, 2, 3], 3: [4]]
    let lineage = Lineage()
    _ = walk(tree, lineage)                       // 0,1,2,3,4
    let cut = walk(tree, lineage, limits: WalkLimits(nodes: 2, deadline: .infinity))
    XCTAssertEqual(cut.nodes.count, 2)
    XCTAssertTrue(cut.nodeCapHit)
    XCTAssertEqual(cut.omitted, 2, "elements 2 and 3 were left on the stack")
    for index in 0...4 { XCTAssertNotNil(lineage.entry(index), "index \(index) stays resolvable") }
    XCTAssertEqual(indexes(walk(tree, lineage)), [0: 0, 1: 1, 2: 2, 3: 3, 4: 4], "a full walk afterwards still inherits them")
  }

  func testAWalkPastItsDeadlineStopsAndCarriesOver() {
    let tree = FakeTree()
    tree.children = [0: [1]]
    let lineage = Lineage()
    _ = walk(tree, lineage)
    let late = walk(tree, lineage, limits: WalkLimits(deadline: 0))
    XCTAssertTrue(late.deadlineHit)
    XCTAssertEqual(late.nodes.count, 0)
    XCTAssertNotNil(lineage.entry(0))
    XCTAssertNotNil(lineage.entry(1))
  }

  func testTheDepthCapDropsDeeperLevelsAndMarksTheCut() {
    let tree = FakeTree()
    tree.children = [0: [1], 1: [2], 2: [3]]
    let shallow = walk(tree, Lineage(), limits: WalkLimits(depth: 2, deadline: .infinity))
    XCTAssertEqual(shallow.nodes.map { $0["depth"] as! Int }, [0, 1, 2])
    XCTAssertTrue(shallow.depthHit)
    XCTAssertEqual(maxDepth, 200)
  }

  func testTheByteBudgetStopsTheWalk() {
    let tree = FakeTree()
    tree.children = [0: Array(1...20)]
    let walked = walk(tree, Lineage(), limits: WalkLimits(bytes: 1_000, deadline: .infinity))
    XCTAssertTrue(walked.budgetHit)
    XCTAssertLessThan(walked.nodes.count, 21)
    XCTAssertGreaterThan(walked.omitted, 0)
  }

  func testWidthRuleShowsTheVisibleSubsetAboveOneHundred() {
    let tree = FakeTree()
    tree.children = [0: Array(1...150)]
    tree.visible = [0: Array(41...50)]
    let walked = walk(tree, Lineage())
    XCTAssertEqual(walked.nodes.count, 11)
    XCTAssertEqual(walked.nodes[0]["shown"] as? [String: AnyHashable], ["count": 10, "of": 150, "subset": "visible"])
    XCTAssertEqual(walked.nodes[0]["children"] as? Int, 10)
  }

  func testWidthRuleOmitsChildrenAbove499WithoutAVisibleSubset() {
    let tree = FakeTree()
    tree.children = [0: Array(1...600)]
    let walked = walk(tree, Lineage())
    XCTAssertEqual(walked.nodes.count, 1)
    XCTAssertEqual(walked.nodes[0]["shown"] as? [String: AnyHashable], ["count": 0, "of": 600, "subset": "omitted"])
  }

  func testWidthRuleFiltersByPositionBetween100And499WithoutAVisibleSubset() {
    let tree = FakeTree()
    tree.children = [0: Array(1...120)]
    for id in 1...120 { tree.frames[id] = CGRect(x: 0, y: Double(id) * 20, width: 100, height: 20) }
    let walked = walk(tree, Lineage(), visibleFrame: CGRect(x: 0, y: 0, width: 400, height: 410))
    XCTAssertEqual(walked.nodes[0]["shown"] as? [String: AnyHashable], ["count": 20, "of": 120, "subset": "visible"])
    XCTAssertNil(walked.nodes[1]["shown"])
  }

  func testWidthRuleKeepsUpToOneHundredAndReadsTheFullListWhenARouteCappedIt() {
    let tree = FakeTree()
    tree.children = [0: Array(1...100)]
    let capped = walk(tree, Lineage(), cap: 60)
    XCTAssertEqual(capped.nodes.count, 101)
    XCTAssertNil(capped.nodes[0]["shown"])
  }

  func testTheTreeShapeIsTheSameWhicheverRouteReadIt() {
    let tree = FakeTree()
    tree.children = [0: Array(1...150), 3: [200, 201]]
    tree.visible = [0: Array(1...12)]
    let plain = walk(tree, Lineage())
    let prefetched = walk(tree, Lineage(), cap: widthThreshold)
    XCTAssertEqual(plain.nodes.count, prefetched.nodes.count)
    for (a, b) in zip(plain.nodes, prefetched.nodes) { XCTAssertEqual(NSDictionary(dictionary: a), NSDictionary(dictionary: b)) }
  }

  func testAnUnreadableElementIsSkippedAndCounted() {
    let tree = FakeTree()
    tree.children = [0: [1, 2]]
    tree.unreadable = [1]
    let walked = walk(tree, Lineage())
    XCTAssertEqual(walked.nodes.count, 2)
    XCTAssertEqual(walked.failures, 1)
  }
}
