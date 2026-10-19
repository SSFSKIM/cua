import ApplicationServices
import XCTest
@testable import Engine

// The walk, the lineage's numbering and the width rule against a fake tree. Fake elements are application handles for
// pids no process uses: AXUIElementCreateApplication, CFEqual and CFHash are local, so no message reaches any process,
// and the fake source answers every attribute itself.

private func element(_ id: Int) -> AXUIElement { Engine.element(id) }

/// A tree by id: each node's children and, optionally, a visible subset and a frame.
final class FakeTree {
  var children: [Int: [Int]] = [:]
  var visible: [Int: [Int]] = [:]
  var frames: [Int: CGRect] = [:]
  var unreadable: Set<Int> = []
  /// Attributes beyond role, title and children, by id.
  var extra: [Int: [String: CFTypeRef]] = [:]
  /// What the per-element reads answer, by id: the settable attributes, the actions, the Markdown value.
  var settable: [Int: Set<String>] = [:]
  var actions: [Int: [String]] = [:]
  var markdown: [Int: String] = [:]
  /// The process serving each element, by id (4242 when unset): a panel's elements are another process's.
  var owners: [Int: pid_t] = [:]

  func id(_ element: AXUIElement) -> Int { Int(pid(of: element)) - 60_000 }
}

final class FakeSource: ElementSource, @unchecked Sendable {
  let tree: FakeTree
  /// Uncached reads by id, and settability calls by attribute.
  var reads: [Int: Int] = [:]
  var settableCalls: [String: Int] = [:]
  init(_ tree: FakeTree) { self.tree = tree }

  override func read(_ element: AXUIElement) -> ElementData? {
    let id = tree.id(element)
    reads[id, default: 0] += 1
    if tree.unreadable.contains(id) { return nil }
    var values: [String: CFTypeRef] = ["AXRole": "AXGroup" as CFString, "AXTitle": "node \(id)" as CFString,
                                       "AXChildren": (tree.children[id] ?? []).map(Engine.element) as CFArray]
    for (name, value) in tree.extra[id] ?? [:] { values[name] = value }
    if let frame = tree.frames[id] {
      var origin = frame.origin, extent = frame.size
      values["AXPosition"] = AXValueCreate(.cgPoint, &origin)!
      values["AXSize"] = AXValueCreate(.cgSize, &extent)!
    }
    return ElementData(values: values)
  }

  override func owner(_ element: AXUIElement) -> pid_t { tree.owners[tree.id(element)] ?? 4242 }
  var markdownCalls = 0
  override func actions(_ element: AXUIElement) -> [String] { tree.actions[tree.id(element)] ?? [] }
  override func isSettable(_ element: AXUIElement, _ attribute: String, phase: String) -> Bool {
    settableCalls[attribute, default: 0] += 1
    return tree.settable[tree.id(element)]?.contains(attribute) ?? false
  }
  override func markdown(_ element: AXUIElement, length: Int) -> String? {
    markdownCalls += 1
    return tree.markdown[tree.id(element)]
  }
  override func readVisibleChildren(_ element: AXUIElement) -> [AXUIElement]? { tree.visible[tree.id(element)].map { $0.map(Engine.element) } }
  override func readFrame(_ element: AXUIElement) -> CGRect? { tree.frames[tree.id(element)] }
}

extension Engine {
  // The test's handle maker, reachable as `Engine.element` from the fake source's closures.
  static func element(_ id: Int) -> AXUIElement { AXUIElementCreateApplication(pid_t(60_000 + id)) }
}

func walk(_ tree: FakeTree, _ lineage: Lineage, window: Int = 0, menu: [Int] = [], limits: WalkLimits = WalkLimits(deadline: .infinity),
                  visibleFrame: CGRect? = nil, source: FakeSource? = nil, interactionFlags: Bool = true) -> TreeWalk {
  let walk = TreeWalk(source: source ?? FakeSource(tree), lineage: lineage, limits: limits, markdown: false,
                      interactionFlags: interactionFlags, visibleFrame: visibleFrame)
  walk.run(window: element(window), menuItems: menu.map(element))
  lineage.commit(walk.revision)
  return walk
}

/// Token by fake id for the nodes a walk emitted.
private func tokens(_ walk: TreeWalk) -> [Int: String] {
  var map: [Int: String] = [:]
  for node in walk.nodes + walk.menuBar { map[Int((node["title"] as! String).dropFirst(5))!] = node["token"] as? String }
  return map
}

/// The token of a lineage's `n`th allocation, as the engine spells it.
private func t(_ n: Int) -> String { elementToken(n) }

final class WalkTests: XCTestCase {
  func testAFreshLineageTokensThePreorderWithTheMenuBarAfterTheWindowAndNoIndexOnTheWire() {
    let tree = FakeTree()
    tree.children = [0: [1, 4], 1: [2, 3], 90: [91]]
    let first = walk(tree, Lineage(), menu: [90, 92])
    XCTAssertEqual(first.nodes.map { $0["title"] as! String }, ["node 0", "node 1", "node 2", "node 3", "node 4"])
    XCTAssertEqual(first.nodes.map { $0["token"] as! String }, [t(0), t(1), t(2), t(3), t(4)])
    XCTAssertTrue(first.nodes.allSatisfy { $0["index"] == nil }, "the engine numbers nothing for the model: the service does")
    XCTAssertEqual(first.nodes.map { $0["depth"] as! Int }, [0, 1, 2, 2, 1])
    XCTAssertEqual(first.menuBar.map { $0["token"] as! String }, [t(5), t(6)])
    XCTAssertEqual(first.menuBar.map { $0["children"] as! Int }, [0, 0], "menu-bar items are not walked into")
    XCTAssertEqual(first.menuBar.map { $0["depth"] as! Int }, [0, 0])
  }

  func testAnUnchangedTreeKeepsEveryToken() {
    let tree = FakeTree()
    tree.children = [0: [1, 4], 1: [2, 3]]
    let lineage = Lineage()
    let first = tokens(walk(tree, lineage, menu: [90]))
    XCTAssertEqual(tokens(walk(tree, lineage, menu: [90])), first)
  }

  func testANewElementTakesANewTokenAndARetiredTokenIsNeverReissued() {
    let tree = FakeTree()
    tree.children = [0: [1, 2, 3]]
    let lineage = Lineage()
    _ = walk(tree, lineage)                       // t0..t3
    tree.children = [0: [1, 2]]                   // 3 vanishes: t3 retired
    let second = tokens(walk(tree, lineage))
    XCTAssertEqual(second, [0: t(0), 1: t(1), 2: t(2)])
    XCTAssertNil(lineage.entry(3), "the vanished element's token is retired")
    tree.children = [0: [1, 2, 5]]                // a new element after the retired one
    XCTAssertEqual(tokens(walk(tree, lineage))[5], t(4), "a new token, never the retired t3")
  }

  func testAnElementAbsentFromOneRevisionReturnsWithANewToken() {
    let tree = FakeTree()
    tree.children = [0: [1, 2]]
    let lineage = Lineage()
    XCTAssertEqual(tokens(walk(tree, lineage))[2], t(2))
    tree.children = [0: [1]]                      // absent from one revision: retired there (N = 1)
    _ = walk(tree, lineage)
    tree.children = [0: [1, 2]]                   // the same handle returns
    let back = tokens(walk(tree, lineage))
    XCTAssertEqual(back[1], t(1))
    XCTAssertEqual(back[2], t(3), "the returning element is new to the lineage; t2 stays retired")
    XCTAssertNil(lineage.entry(2))
  }

  func testAReorderedElementOutsideTheStableRunTakesANewToken() {
    let tree = FakeTree()
    tree.children = [0: [1, 2, 3, 4]]
    let lineage = Lineage()
    _ = walk(tree, lineage)                       // 1→t1, 2→t2, 3→t3, 4→t4
    tree.children = [0: [1, 3, 4, 2]]             // 2 moved last: 3, 4 stay in order
    let after = tokens(walk(tree, lineage))
    XCTAssertEqual(after[1], t(1))
    XCTAssertEqual(after[3], t(3))
    XCTAssertEqual(after[4], t(4))
    XCTAssertEqual(after[2], t(5), "the moved element is new to the lineage")
  }

  func testAnElementUnderAnotherParentTakesANewToken() {
    let tree = FakeTree()
    tree.children = [0: [1, 2], 1: [3]]
    let lineage = Lineage()
    _ = walk(tree, lineage)                       // 0→t0, 1→t1, 3→t2, 2→t3
    tree.children = [0: [1, 2], 2: [3]]
    let after = tokens(walk(tree, lineage))
    XCTAssertEqual(after[1], t(1))
    XCTAssertEqual(after[2], t(3))
    XCTAssertEqual(after[3], t(4))
  }

  func testDisableDiffsFreshLineageStartsItsTokensAfresh() {
    let tree = FakeTree()
    tree.children = [0: [1, 2, 3]]
    let old = Lineage()
    _ = walk(tree, old)
    tree.children = [0: [3]]
    _ = walk(tree, old)
    let fresh = Lineage()                         // what disableDiff gives the observation
    XCTAssertEqual(tokens(walk(tree, fresh)), [0: t(0), 3: t(1)])
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
    for number in 0...4 { XCTAssertNotNil(lineage.entry(number), "\(t(number)) stays resolvable") }
    XCTAssertEqual(tokens(walk(tree, lineage)), [0: t(0), 1: t(1), 2: t(2), 3: t(3), 4: t(4)], "a full walk afterwards still inherits them")
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
    XCTAssertEqual(walked.nodes[0]["shown"] as? [String: AnyHashable], ["count": 10, "of": 150, "subset": "visible", "ranges": [[40, 50]]])
    XCTAssertEqual(walked.nodes[0]["children"] as? Int, 10)
  }

  func testWidthRuleOmitsChildrenAbove499WithoutAVisibleSubset() {
    let tree = FakeTree()
    tree.children = [0: Array(1...600)]
    let walked = walk(tree, Lineage())
    XCTAssertEqual(walked.nodes.count, 1)
    XCTAssertEqual(walked.nodes[0]["shown"] as? [String: AnyHashable], ["count": 0, "of": 600, "subset": "omitted", "ranges": [] as [[Int]]])
  }

  func testWidthRuleFiltersByPositionBetween100And499WithoutAVisibleSubset() {
    let tree = FakeTree()
    tree.children = [0: Array(1...120)]
    for id in 1...120 { tree.frames[id] = CGRect(x: 0, y: Double(id) * 20, width: 100, height: 20) }
    let walked = walk(tree, Lineage(), visibleFrame: CGRect(x: 0, y: 0, width: 400, height: 410))
    XCTAssertEqual(walked.nodes[0]["shown"] as? [String: AnyHashable], ["count": 20, "of": 120, "subset": "visible", "ranges": [[0, 20]]])
    XCTAssertNil(walked.nodes[1]["shown"])
  }

  func testWidthRuleKeepsUpToOneHundredChildrenWhole() {
    let tree = FakeTree()
    tree.children = [0: Array(1...100)]
    let walked = walk(tree, Lineage())
    XCTAssertEqual(walked.nodes.count, 101)
    XCTAssertNil(walked.nodes[0]["shown"])
  }

  func testANodeCutKeepsTheMenuBar() {
    let tree = FakeTree()
    tree.children = [0: Array(1...10)]
    let cut = walk(tree, Lineage(), menu: [90, 91], limits: WalkLimits(nodes: 4, deadline: .infinity))
    XCTAssertEqual(cut.nodes.count, 2, "the window's walk gets the budget less the menu bar's items")
    XCTAssertEqual(cut.menuBar.count, 2)
    XCTAssertEqual(cut.menuBar.map { $0["token"] as! String }, [t(2), t(3)], "still tokened after the window's nodes")
    XCTAssertTrue(cut.nodeCapHit)
  }

  func testAByteCutKeepsTheMenuBar() {
    let tree = FakeTree()
    tree.children = [0: Array(1...30)]
    let cut = walk(tree, Lineage(), menu: [90, 91, 92], limits: WalkLimits(bytes: 2_500, deadline: .infinity))
    XCTAssertTrue(cut.budgetHit)
    XCTAssertEqual(cut.menuBar.count, 3)
    XCTAssertLessThan(cut.nodes.count, 31)
  }

  func testATitleNamesTheTokensItServesOnceTheWalkIsDone() {
    let tree = FakeTree()
    tree.children = [0: [1, 2, 3]]
    tree.extra = [1: ["AXServesAsTitleForUIElements": [Engine.element(3), Engine.element(77)] as CFArray],
                  2: ["AXServesAsTitleForUIElements": [Engine.element(77)] as CFArray]]
    let walked = walk(tree, Lineage())
    XCTAssertEqual(walked.nodes[1]["servesAsTitleFor"] as? [String], [t(3)], "only emitted elements, by token")
    XCTAssertNil(walked.nodes[2]["servesAsTitleFor"], "absent when it serves nothing emitted")
    XCTAssertNil(walked.nodes[3]["servesAsTitleFor"])
  }

  func testTheFocusableAndSelectableReadsCanBeSwitchedOff() {
    let tree = FakeTree()
    tree.children = [0: [1, 2]]
    for id in 0...2 { tree.extra[id] = ["AXFocused": kCFBooleanFalse, "AXSelected": kCFBooleanFalse] }
    let on = FakeSource(tree)
    _ = walk(tree, Lineage(), source: on)
    XCTAssertEqual(on.settableCalls[kAXFocusedAttribute], 3)
    XCTAssertEqual(on.settableCalls[kAXSelectedAttribute], 3)
    let off = FakeSource(tree)
    let walked = walk(tree, Lineage(), source: off, interactionFlags: false)
    XCTAssertNil(off.settableCalls[kAXFocusedAttribute])
    XCTAssertNil(off.settableCalls[kAXSelectedAttribute])
    XCTAssertEqual((walked.nodes[0]["flags"] as? [String: Any])?["focusable"] as? Bool, false)
  }

  func testTheBusyWalkSeesEachSignAndTheObservationReusesItsReads() {
    let tree = FakeTree()
    tree.children = [0: [1, 2], 2: [3]]
    let source = FakeSource(tree)
    XCTAssertEqual(busyWalk(element(0), source: source, visibleFrame: nil, deadline: .infinity).busy, false)
    let walked = walk(tree, Lineage(), source: source)
    XCTAssertEqual(walked.nodes.count, 4)
    XCTAssertEqual(source.reads, [0: 1, 1: 1, 2: 1, 3: 1], "each element read once across the busy walk and the observation")

    for (signs, label) in [(["AXElementBusy": kCFBooleanTrue] as [String: CFTypeRef], "busy"),
                           (["AXRole": "AXWebArea" as CFString, "AXLoaded": kCFBooleanFalse], "loading web area"),
                           (["AXRole": "AXBusyIndicator" as CFString], "busy indicator"),
                           (["AXDOMClassList": ["x", busyMarkerClass] as CFArray], "spinner class")] {
      tree.extra = [3: signs]
      XCTAssertEqual(busyWalk(element(0), source: FakeSource(tree), visibleFrame: nil, deadline: .infinity).busy, true, label)
    }
    tree.extra = [3: ["AXRole": "AXProgressIndicator" as CFString]]
    XCTAssertEqual(busyWalk(element(0), source: FakeSource(tree), visibleFrame: nil, deadline: .infinity).busy, false, "a progress indicator is not a sign")
  }

  func testTheBusyWalkReportsALoadedWebAreaAndADeadlineCutIsNoVerdict() {
    let tree = FakeTree()
    tree.children = [0: [1, 2]]
    tree.extra = [2: ["AXRole": "AXWebArea" as CFString, "AXLoaded": kCFBooleanTrue]]
    let loaded = busyWalk(element(0), source: FakeSource(tree), visibleFrame: nil, deadline: .infinity)
    XCTAssertEqual(loaded.busy, false)
    XCTAssertTrue(loaded.loadedWebArea)
    tree.extra = [:]
    XCTAssertFalse(busyWalk(element(0), source: FakeSource(tree), visibleFrame: nil, deadline: .infinity).loadedWebArea)
    XCTAssertNil(busyWalk(element(0), source: FakeSource(tree), visibleFrame: nil, deadline: 0).busy, "cut by the deadline: no verdict")
  }

  func testTheObservationAdoptsTheSettlesTreeOnlyWhenNothingChangedIt() {
    XCTAssertTrue(adoptsSettledTree(sameWindow: true, enabledNow: false, waited: false, loadedWebArea: false))
    XCTAssertTrue(adoptsSettledTree(sameWindow: true, enabledNow: false, waited: true, loadedWebArea: true), "the wait found the web area at once")
    XCTAssertFalse(adoptsSettledTree(sameWindow: true, enabledNow: false, waited: true, loadedWebArea: false))
    XCTAssertFalse(adoptsSettledTree(sameWindow: true, enabledNow: true, waited: false, loadedWebArea: true))
    XCTAssertFalse(adoptsSettledTree(sameWindow: false, enabledNow: false, waited: false, loadedWebArea: false))
  }

  func testShownRangesArePositionsAmongTheChildrenTheAttributeReadReturned() {
    let tree = FakeTree()
    tree.children = [0: Array(1...150)]
    tree.visible = [0: [3, 4, 9]]
    let walked = walk(tree, Lineage())
    XCTAssertEqual((walked.nodes[0]["shown"] as? [String: Any])?["ranges"] as? [[Int]], [[2, 4], [8, 9]])
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
