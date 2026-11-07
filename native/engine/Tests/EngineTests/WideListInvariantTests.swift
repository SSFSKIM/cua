import ApplicationServices
import XCTest
@testable import Engine

// #304's invariant, as the design session's ruling f1a7589f makes it a check: the wide-list rules never leave unread a
// shown child that main's selection would have read before the cut. Each tree is walked twice by the real TreeWalk,
// once with the rules off (main's selection) and once with them on; for every element main took up, each child that
// shows in its clip (its frame against the clip; a frameless child is not judged) and that main read, the rules' walk
// must have read too: any such child it left unread is a loss, with no excuse. Over the regression shapes of the hosted
// A/B and, given CUA_304_TREES, every tree of #304's spike; one stated limit is pinned by its own test.

private let windowFrame = CGRect(x: 0, y: 0, width: 1000, height: 800)
private let viewport = CGRect(x: 0, y: 100, width: 1000, height: 700)

private func ids(_ walk: TreeWalk) -> [Int] { walk.nodes.map { Int(($0["title"] as! String).dropFirst(5))! } }

/// The violations of #304's invariant in `tree`, each as "parent → child".
func wideListInvariantViolations(_ tree: FakeTree, window: CGRect, limits: WalkLimits, chromium: Bool) -> [String] {
  let main = walk(tree, Lineage(), limits: limits, visibleFrame: window, chromium: chromium, wideListRules: false)
  let rules = walk(tree, Lineage(), limits: limits, visibleFrame: window, chromium: chromium)
  var visits = [0]
  var seen: Set<Int> = []
  var found: [String] = []
  while let next = visits.popLast() {
    guard seen.insert(next).inserted, let facts = main.selectionFacts(of: Engine.element(next)) else { continue }
    visits.append(contentsOf: facts.children.reversed().map(tree.id))
    guard facts.takenUp, let clip = facts.childClip else { continue }
    for child in facts.children {
      let c = tree.id(child)
      guard main.selectionFacts(of: child) != nil, let frame = tree.frames[c], showsBeyondStrip(frame, in: clip) else { continue }
      if rules.selectionFacts(of: child) == nil { found.append("\(next) → \(c)") }
    }
  }
  return found.sorted()
}

/// The stated limit's shape (the review of 566e3612..bc4d395f): a list of 600 (4) whose first child (100_000) lies off
/// the viewport above and holds a shown child (600_000), then a section off it below (3, 300 leaves that wait), then a
/// visible group (2) that lists the first child again. Main reads that child through the list, so its children wait
/// first in the document's order; the rules read it later, through the group, so they wait after the section's.
private func aliasedOffscreenChild() -> FakeTree {
  let tree = FakeTree()
  func place(_ frame: CGRect) -> CGRect {
    if frame.maxY <= viewport.minY { return CGRect(x: frame.minX, y: viewport.minY, width: frame.width, height: 1) }
    if frame.minY >= viewport.maxY { return CGRect(x: frame.minX, y: viewport.maxY - 1, width: frame.width, height: 1) }
    return frame
  }
  tree.extra[0] = ["AXRole": "AXWindow" as CFString]
  tree.extra[1] = ["AXRole": "AXWebArea" as CFString]
  tree.frames[0] = windowFrame
  tree.frames[1] = viewport
  tree.children = [0: [1], 1: [4, 3, 2], 2: [100_000], 3: Array(400_000..<400_300), 100_000: [600_000]]
  tree.frames[2] = CGRect(x: 0, y: 700, width: 100, height: 50)
  tree.frames[3] = place(CGRect(x: 0, y: 20_000, width: 1000, height: 300))
  for k in 0..<300 { tree.frames[400_000 + k] = place(CGRect(x: 0, y: 20_000 + Double(k), width: 1000, height: 1)) }
  let top = viewport.minY - 300 * 20
  tree.frames[4] = CGRect(x: 0, y: top, width: 1000, height: 600 * 20)
  for i in 0..<600 { tree.frames[100_000 + i] = place(CGRect(x: 0, y: top + Double(i) * 20, width: 1000, height: 20)) }
  tree.frames[600_000] = CGRect(x: 0, y: 400, width: 100, height: 20)
  tree.children[4] = (0..<600).map { 100_000 + $0 }
  tree.visible[4] = tree.children[4]
  return tree
}

/// A fake tree as the wide engine dumps it (`probeReads`, in emission order): each element once, under the first parent
/// the preorder reaches it through, each row carrying its parent's count of the children it lists (`chosen`).
private func probeReads(of tree: FakeTree) -> [[Any]] {
  var rows: [[Any]] = []
  var seen: Set<Int> = []
  var visits: [(id: Int, parent: Int?, depth: Int)] = [(0, nil, 0)]
  while let visit = visits.popLast() {
    guard seen.insert(visit.id).inserted else { continue }
    let kids = tree.children[visit.id] ?? []
    let role = (tree.extra[visit.id]?["AXRole"] as? String) ?? "AXGroup"
    let frame: Any = tree.frames[visit.id].map { ["x": Double($0.minX), "y": Double($0.minY), "width": Double($0.width), "height": Double($0.height)] } ?? NSNull()
    rows.append([visit.id, visit.parent.map { $0 as Any } ?? NSNull(), visit.depth, role, frame, kids.count, kids.count,
                 ["AXWindow", "AXWebArea", "AXScrollArea"].contains(role), 0, rows.count, true, true, false])
    for kid in kids.reversed() { visits.append((kid, visit.id, visit.depth + 1)) }
  }
  return rows
}

/// Chromium's page: the window (0) holds its web area (1, the viewport) and then its toolbar (2, buttons 20–24, above
/// the viewport). The web area holds a section scrolled off above (3, whose 300 leaves 400_000 + k wait) and then a list
/// (4) of `count` items 20 pt tall in two CSS columns, the first `split` down the left (x 24) and the rest down the
/// right (x 511), scrolled `scroll` items down, each item with a link (500_000 + i). Offscreen boxes are 1-pt strips at
/// the viewport's nearer edge; the list answers AXVisibleChildren with every item, as Chromium does.
private func twoColumnPage(count: Int, split: Int, scroll: Int) -> FakeTree {
  let tree = FakeTree()
  func place(_ frame: CGRect) -> CGRect {
    if frame.maxY <= viewport.minY { return CGRect(x: frame.minX, y: viewport.minY, width: frame.width, height: 1) }
    if frame.minY >= viewport.maxY { return CGRect(x: frame.minX, y: viewport.maxY - 1, width: frame.width, height: 1) }
    return frame
  }
  func role(_ id: Int, _ role: String) { tree.extra[id] = ["AXRole": role as CFString] }
  role(0, "AXWindow"); role(1, "AXWebArea"); role(2, "AXToolbar"); role(4, "AXList")
  tree.frames[0] = windowFrame
  tree.frames[1] = viewport
  tree.frames[2] = CGRect(x: 0, y: 0, width: 1000, height: 100)
  tree.children = [0: [1, 2], 1: [3, 4], 2: Array(20..<25), 3: Array(400_000..<400_300)]
  for (k, button) in (20..<25).enumerated() { role(button, "AXButton"); tree.frames[button] = CGRect(x: Double(k) * 40, y: 50, width: 30, height: 30) }
  tree.frames[3] = place(CGRect(x: 0, y: -10_000, width: 1000, height: 300))
  for k in 0..<300 { tree.frames[400_000 + k] = place(CGRect(x: 0, y: -10_000 + Double(k), width: 1000, height: 1)) }
  let top = viewport.minY - Double(scroll) * 20
  tree.frames[4] = CGRect(x: 0, y: top, width: 1000, height: Double(max(split, count - split)) * 20)
  for i in 0..<count {
    let (x, row) = i < split ? (24.0, i) : (511.0, i - split)
    let frame = place(CGRect(x: x, y: top + Double(row) * 20, width: 480, height: 20))
    tree.frames[100_000 + i] = frame
    tree.children[100_000 + i] = [500_000 + i]
    role(500_000 + i, "AXLink")
    tree.frames[500_000 + i] = frame
  }
  tree.children[4] = (0..<count).map { 100_000 + $0 }
  tree.visible[4] = tree.children[4]
  return tree
}

/// The kit's `/fixedtail` in small: the web area (1) holds a body (4) of `count` paragraphs 20 pt tall (100_000 + i),
/// scrolled `scroll` down, each with two links, then a position:fixed toolbar as the body's last child (5, buttons 20–24,
/// at the viewport's bottom).
private func fixedTailPage(count: Int, scroll: Int) -> FakeTree {
  let tree = FakeTree()
  func place(_ frame: CGRect) -> CGRect {
    if frame.maxY <= viewport.minY { return CGRect(x: frame.minX, y: viewport.minY, width: frame.width, height: 1) }
    if frame.minY >= viewport.maxY { return CGRect(x: frame.minX, y: viewport.maxY - 1, width: frame.width, height: 1) }
    return frame
  }
  func role(_ id: Int, _ role: String) { tree.extra[id] = ["AXRole": role as CFString] }
  role(0, "AXWindow"); role(1, "AXWebArea"); role(5, "AXToolbar")
  tree.frames[0] = windowFrame
  tree.frames[1] = viewport
  tree.children = [0: [1], 1: [4], 5: Array(20..<25)]
  let top = viewport.minY - Double(scroll) * 20
  tree.frames[4] = CGRect(x: 0, y: top, width: 1000, height: Double(count) * 20)
  for i in 0..<count {
    let frame = place(CGRect(x: 0, y: top + Double(i) * 20, width: 1000, height: 20))
    tree.frames[100_000 + i] = frame
    tree.children[100_000 + i] = [500_000 + 2 * i, 500_001 + 2 * i]
    for k in 0..<2 { role(500_000 + 2 * i + k, "AXLink"); tree.frames[500_000 + 2 * i + k] = CGRect(x: Double(k) * 500, y: frame.minY, width: 400, height: frame.height) }
  }
  tree.frames[5] = CGRect(x: 0, y: 750, width: 1000, height: 50)
  for (k, button) in (20..<25).enumerated() { role(button, "AXButton"); tree.frames[button] = CGRect(x: Double(k) * 40, y: 760, width: 30, height: 30) }
  tree.children[4] = (0..<count).map { 100_000 + $0 } + [5]
  tree.visible[4] = tree.children[4]
  return tree
}

private func element(_ i: Int) -> AXUIElement { Engine.element(i) }

final class WideListInvariantTests: XCTestCase {
  /// Wikipedia's reference list in two CSS columns (215 items, Chrome's wiki-article at 90%): each item is judged by its
  /// frame, so both columns' shown items are read before the toolbar, and nothing main read before the cut is lost.
  func testATwoColumnListReadsBothColumnsShownItemsFirst() {
    let tree = twoColumnPage(count: 215, split: 100, scroll: 60)
    let limits = WalkLimits(nodes: 200, deadline: .infinity)
    let cut = walk(tree, Lineage(), limits: limits, visibleFrame: windowFrame, chromium: true)
    let kept = Set(ids(cut))
    let shown = Array(60..<95) + Array(160..<195)
    XCTAssertTrue(Set(shown.flatMap { [100_000 + $0, 500_000 + $0] }).isSubset(of: kept), "both columns' shown items and links")
    XCTAssertTrue(Set(20..<25).isSubset(of: kept), "the toolbar after the list")
    XCTAssertEqual(wideListInvariantViolations(tree, window: windowFrame, limits: limits, chromium: true), [])
    let items = (0..<215).map { element(100_000 + $0) }
    XCTAssertEqual(shownChildPositions(items, frame: { tree.frames[tree.id($0)] }, window: viewport), shown)
  }

  /// `/fixedtail`: a body of more than 512 children whose last is a fixed toolbar in view, past the node budget of the
  /// rules' walk without it; the end samples read it with the shown run, as main read it.
  func testAFixedToolbarAtTheEndOfALongBodyIsReadWithTheShownRun() {
    let tree = fixedTailPage(count: 600, scroll: 300)
    let limits = WalkLimits(nodes: 1_000, deadline: .infinity)
    let cut = walk(tree, Lineage(), limits: limits, visibleFrame: windowFrame, chromium: true)
    XCTAssertTrue(cut.nodeCapHit)
    XCTAssertTrue(Set([5] + Array(20..<25)).isSubset(of: Set(ids(cut))), "the fixed toolbar and its buttons")
    XCTAssertTrue(Set(ids(walk(tree, Lineage(), limits: limits, visibleFrame: windowFrame, chromium: true, wideListRules: false))).contains(5),
                  "main reads it too")
    XCTAssertEqual(wideListInvariantViolations(tree, window: windowFrame, limits: limits, chromium: true), [])
    let children = tree.children[4]!.map(element)
    XCTAssertEqual(shownChildPositions(children, frame: { tree.frames[tree.id($0)] }, window: viewport), Array(300..<335) + [600])
  }

  /// A list of more than 512 in two columns: the bisection lands on the second column's run, and the middle samples,
  /// finding the first column's items across the window ahead of it, take the list up as on main.
  func testANonMonotonicLongListFallsBackToMain() {
    let tree = twoColumnPage(count: 600, split: 300, scroll: 200)
    let items = (0..<600).map { element(100_000 + $0) }
    XCTAssertNil(shownChildPositions(items, frame: { tree.frames[tree.id($0)] }, window: viewport))
    let limits = WalkLimits(nodes: 400, deadline: .infinity)
    let cut = walk(tree, Lineage(), limits: limits, visibleFrame: windowFrame, chromium: true)
    XCTAssertTrue(Set((200..<235).map { 100_000 + $0 }).isSubset(of: Set(ids(cut))), "the first column's shown items")
    XCTAssertEqual(wideListInvariantViolations(tree, window: windowFrame, limits: limits, chromium: true), [])
  }

  /// The middle samples' three places, each alone: a shown block after the run, and a run whose start a shown block
  /// pulled ahead, so it holds children before the window.
  func testTheMiddleSamplesCheckEachPlace() {
    let rows = (0..<600).map(element)
    let window = CGRect(x: 0, y: 2000, width: 100, height: 700)
    func list(shownBlock: Range<Int>) -> (AXUIElement) -> CGRect? {
      { element in
        let i = Int(pid(of: element)) - 60_000
        return shownBlock.contains(i) ? CGRect(x: 0, y: 2100, width: 100, height: 20) : CGRect(x: 0, y: Double(i) * 20 - 4000, width: 100, height: 20)
      }
    }
    // Rows 300–334 show (y 2000–2700); a block at 400–409, shown after the run: not one run.
    XCTAssertNil(shownChildPositions(rows, frame: list(shownBlock: 400..<410), window: window))
    // A block at 140–160 pulls the run's start to 140, the run then holding rows before the window: not one run.
    XCTAssertNil(shownChildPositions(rows, frame: list(shownBlock: 140..<161), window: window))
    // Without either, the run alone.
    XCTAssertEqual(shownChildPositions(rows, frame: list(shownBlock: 0..<0), window: window), Array(300..<335))
  }

  /// Up to 512 children every frame is read; above, the bisection and the samples only.
  func testEveryChildIsJudgedUpTo512AndSampledAbove() {
    for (count, every) in [(512, true), (513, false)] {
      var reads = 0
      let rows = (0..<count).map(element)
      let frame = { (element: AXUIElement) -> CGRect? in
        reads += 1
        return CGRect(x: 0, y: Double(Int(pid(of: element)) - 60_000) * 20 - 4000, width: 100, height: 20)
      }
      XCTAssertEqual(shownChildPositions(rows, frame: frame, window: CGRect(x: 0, y: 2000, width: 100, height: 700)), Array(300..<335))
      XCTAssertEqual(reads == count, every, "\(count) children, \(reads) frame reads")
      if !every { XCTAssertLessThan(reads, 200) }
    }
    // A frameless child is read first: nothing says it does not show.
    let rows = (0..<200).map(element)
    let frame = { (element: AXUIElement) -> CGRect? in
      let i = Int(pid(of: element)) - 60_000
      return i == 10 ? nil : CGRect(x: 0, y: Double(i) * 20 - 4000, width: 100, height: 20)
    }
    XCTAssertEqual(shownChildPositions(rows, frame: frame, window: CGRect(x: 0, y: -2000, width: 100, height: 700)), [10] + Array(100..<135))
  }

  /// The stated limit, pinned as measured: the rules can postpone an element two parents list that waits (an offscreen
  /// child of a wide list, listed again later by a visible group), so its shown child waits longer than on main, and a
  /// cut main's walk passes takes it. The check reports the loss; nothing excuses it.
  func testTheRulesCanPostponeAWaitingElementTwoParentsList() {
    let tree = aliasedOffscreenChild()
    let limits = WalkLimits(nodes: 620, deadline: .infinity)
    XCTAssertTrue(Set(ids(walk(tree, Lineage(), limits: limits, visibleFrame: windowFrame, chromium: true, wideListRules: false))).contains(600_000),
                  "main reads the shown child")
    XCTAssertFalse(Set(ids(walk(tree, Lineage(), limits: limits, visibleFrame: windowFrame, chromium: true))).contains(600_000),
                   "the rules' walk spends the budget on the section first")
    XCTAssertEqual(wideListInvariantViolations(tree, window: windowFrame, limits: limits, chromium: true), ["100000 → 600000"])
  }

  /// The loader's alias check (the review of 566e3612..bc4d395f): a dump holds each element once, under its first parent,
  /// so a later parent that also lists it comes back short and the loss above vanishes; the loader counts that list as
  /// alias-incomplete, and a tree without aliases loads whole.
  func testTheLoaderFlagsATreeWhoseDumpLostAnAlias() {
    let tree = aliasedOffscreenChild()
    let limits = WalkLimits(nodes: 620, deadline: .infinity)
    let loaded = try! XCTUnwrap(spikeTree(reads: probeReads(of: tree), menu: 0))
    XCTAssertEqual(loaded.incompleteLists, 1, "the group lists none of its one child")
    XCTAssertEqual(wideListInvariantViolations(loaded.tree, window: loaded.window, limits: limits, chromium: true), [],
                   "reloaded, the loss is gone: why such a tree is never counted as verified")
    let whole = fixedTailPage(count: 600, scroll: 300)
    let reloaded = try! XCTUnwrap(spikeTree(reads: probeReads(of: whole), menu: 0))
    XCTAssertEqual(reloaded.incompleteLists, 0)
    XCTAssertEqual(reloaded.tree.children, whole.children)
  }

  /// The invariant over the earlier shapes: tables of 300, 99 and 6,000 rows with columns relisting their cells.
  func testTheInvariantHoldsOverTablesAndTheRegressionShapes() {
    let cases: [(String, FakeTree, Int)] = [
      ("two columns, 215", twoColumnPage(count: 215, split: 100, scroll: 60), 200),
      ("two columns, 600", twoColumnPage(count: 600, split: 300, scroll: 200), 400),
      ("fixed tail", fixedTailPage(count: 600, scroll: 300), 1_000),
    ]
    for (name, tree, nodes) in cases {
      for budget in [nodes / 2, nodes, nodes * 2] {
        XCTAssertEqual(wideListInvariantViolations(tree, window: windowFrame, limits: WalkLimits(nodes: budget, deadline: .infinity), chromium: true), [],
                       "\(name), budget \(budget)")
      }
    }
  }

  /// Every tree of #304's spike (the wide engine's full trees, `obs-*-wide.json.gz` under the run directories), given
  /// CUA_304_TREES=<the directory holding run-*/>; skipped without it. Each AXColumn's children are rebuilt from its
  /// table's rows, as Chromium lists them (the wide walk emitted each cell once, under its row).
  func testTheInvariantHoldsOverTheSpikesTrees() throws {
    guard let root = ProcessInfo.processInfo.environment["CUA_304_TREES"] else { throw XCTSkip("CUA_304_TREES unset") }
    let runs = try FileManager.default.contentsOfDirectory(atPath: root).filter { $0.hasPrefix("run-") }.sorted()
    var verified = 0, incomplete = 0, incompleteLists = 0, total = 0
    for run in runs {
      let runPath = (root as NSString).appendingPathComponent(run)
      for artifact in try FileManager.default.contentsOfDirectory(atPath: runPath).sorted() {
        let dir = (runPath as NSString).appendingPathComponent(artifact)
        for file in (try? FileManager.default.contentsOfDirectory(atPath: dir))?.sorted() ?? [] where file.hasPrefix("obs-") && file.hasSuffix("-wide.json.gz") {
          let path = (dir as NSString).appendingPathComponent(file)
          guard let spike = try loadSpikeTree(path) else { print("#304 invariant: \(run)/\(artifact)/\(file): no tree"); continue }
          let chromium = !artifact.contains("safari")
          let found = wideListInvariantViolations(spike.tree, window: spike.window, limits: WalkLimits(nodes: maxObservedNodes - spike.menu, deadline: .infinity),
                                                  chromium: chromium)
          if spike.incompleteLists > 0 { incomplete += 1; incompleteLists += spike.incompleteLists } else { verified += 1 }
          total += found.count
          let status = spike.incompleteLists > 0 ? "alias-incomplete (\(spike.incompleteLists) lists)" : "verified"
          print("#304 invariant: \(run)/\(artifact)/\(file): \(spike.nodes) nodes, \(status), \(found.count) violations\(found.isEmpty ? "" : " " + found.prefix(5).joined(separator: ", "))")
        }
      }
    }
    print("#304 invariant: \(verified + incomplete) trees, \(verified) verified, \(incomplete) alias-incomplete (\(incompleteLists) lists), \(total) violations")
    XCTAssertGreaterThan(verified, 0)
    XCTAssertEqual(total, 0)
  }
}

/// A wide tree of #304's spike (`probeReads`: [number, parent, depth, role, frame, childCount, chosen, clips, bytes,
/// order, enters, expanded, recordOnly], in emission order) as a fake tree: each node's children those it emitted, the
/// record's alone left out; an AXColumn's rebuilt as the cells at its place in each of its table's rows, up to the
/// number Chromium listed; every list of more than 100 answering AXVisibleChildren with all of them, so the width rule
/// keeps what the wide walk kept; an AXGroup that clipped given a page-scroll action, as clipping reads it. The dump holds
/// each element once, under the parent it was emitted at, and not the other parents that list it, so a rebuilt list
/// whose children fall short of the count it listed (`chosen`) lost an alias (or a child the wide walk failed to read):
/// counted in `incompleteLists`, and such a tree is not verified.
private func loadSpikeTree(_ path: String) throws -> SpikeTree? {
  let gunzip = Process()
  gunzip.executableURL = URL(fileURLWithPath: "/usr/bin/gunzip")
  gunzip.arguments = ["-c", path]
  let pipe = Pipe()
  gunzip.standardOutput = pipe
  try gunzip.run()
  let data = pipe.fileHandleForReading.readDataToEndOfFile()
  gunzip.waitUntilExit()
  guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any], let reads = json["probeReads"] as? [[Any]], !reads.isEmpty else { return nil }
  return spikeTree(reads: reads, menu: json["probeMenu"] as? Int ?? 0)
}

private struct SpikeTree {
  let tree: FakeTree
  let window: CGRect
  let menu: Int
  let nodes: Int
  let incompleteLists: Int
}

private func spikeTree(reads: [[Any]], menu: Int) -> SpikeTree? {
  let tree = FakeTree()
  var kids: [Int: [Int]] = [:]
  var role: [Int: String] = [:]
  var chosen: [Int: Int] = [:]
  var parentOf: [Int: Int] = [:]
  func rect(_ value: Any) -> CGRect? {
    guard let f = value as? [String: Any], let x = f["x"] as? Double, let y = f["y"] as? Double, let w = f["width"] as? Double, let h = f["height"] as? Double else { return nil }
    return CGRect(x: x, y: y, width: w, height: h)
  }
  let clipping: Set<String> = ["AXScrollArea", "AXWebArea", "AXWindow", "AXSheet", "AXMenu", "AXPopover"]
  var windowFrame: CGRect?
  for row in reads {
    guard let number = row[0] as? Int, let r = row[3] as? String else { continue }
    if row[12] as? Bool == true { continue }
    role[number] = r
    tree.extra[number] = ["AXRole": r as CFString]
    if let frame = rect(row[4]) { tree.frames[number] = frame }
    if number == 0 || row[1] is NSNull { windowFrame = windowFrame ?? tree.frames[number] }
    chosen[number] = row[6] as? Int ?? 0
    if row[7] as? Bool == true, !clipping.contains(r) { tree.actions[number] = ["AXScrollDownByPage"] }
    if let parent = row[1] as? Int { kids[parent, default: []].append(number); parentOf[number] = parent }
  }
  for (number, r) in role where r == "AXColumn" {
    guard let table = parentOf[number], (kids[number]?.count ?? 0) < (chosen[number] ?? 0) else { continue }
    let columns = (kids[table] ?? []).filter { role[$0] == "AXColumn" }
    guard let j = columns.firstIndex(of: number) else { continue }
    var cells: [Int] = []
    for row in kids[table] ?? [] where role[row] == "AXRow" {
      let rowCells = (kids[row] ?? []).filter { role[$0] == "AXCell" }
      if j < rowCells.count { cells.append(rowCells[j]) }
    }
    kids[number] = Array(cells.prefix(chosen[number] ?? 0))
  }
  for (number, list) in kids {
    tree.children[number] = list
    if list.count > widthThreshold { tree.visible[number] = list }
  }
  let incompleteLists = chosen.filter { number, count in (kids[number]?.count ?? 0) != count }.count
  guard let windowFrame else { return nil }
  return SpikeTree(tree: tree, window: windowFrame, menu: menu, nodes: role.count, incompleteLists: incompleteLists)
}
