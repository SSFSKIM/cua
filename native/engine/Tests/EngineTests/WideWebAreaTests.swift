import ApplicationServices
import XCTest
@testable import Engine

// #314 (the design session's ruling cb252e88 on #287's findings): above 499 children with no visible subset, the vendor's
// width rule prints none of an element's children, and Firefox answers no AXVisibleChildren, so a big page's web area
// printed empty. cua prints the children that show instead, as #304's rule finds them (`shownChildPositions`), with the
// `(showing …)` marker; an element with a visible subset, or with 499 children or fewer, is printed as before. Over the
// fake tree of WalkTests.swift, shaped as #287's Firefox window.

private let windowFrame = CGRect(x: 0, y: 0, width: 1000, height: 800)
/// The web area's frame: the viewport, below a 100-pt toolbar.
private let viewport = CGRect(x: 0, y: 100, width: 1000, height: 700)
private func row(_ i: Int) -> Int { 100 + i }

/// The window (0) holding a web area (1, the viewport) of `count` rows 20 pt tall (100 + i), scrolled `scroll` rows down,
/// so rows `scroll..<scroll + 35` show; the rows just above them lie under the toolbar, inside the window but outside
/// the web area. `strips` reports what lies off the viewport as Chromium does, a 1-pt strip at its nearer edge.
private func page(count: Int, scroll: Int, strips: Bool = false) -> FakeTree {
  let tree = FakeTree()
  tree.extra[0] = ["AXRole": "AXWindow" as CFString]
  tree.extra[1] = ["AXRole": "AXWebArea" as CFString]
  tree.frames[0] = windowFrame
  tree.frames[1] = viewport
  tree.children = [0: [1], 1: (0..<count).map(row)]
  for i in 0..<count {
    var frame = CGRect(x: 0, y: viewport.minY + Double(i - scroll) * 20, width: 1000, height: 20)
    if strips, frame.maxY <= viewport.minY { frame = CGRect(x: 0, y: viewport.minY, width: 1000, height: 1) }
    if strips, frame.minY >= viewport.maxY { frame = CGRect(x: 0, y: viewport.maxY - 1, width: 1000, height: 1) }
    tree.frames[row(i)] = frame
  }
  return tree
}

private func ids(_ walk: TreeWalk) -> [Int] { walk.nodes.map { Int(($0["title"] as! String).dropFirst(5))! } }
private func shown(_ walk: TreeWalk) -> [String: AnyHashable]? { walk.nodes[1]["shown"] as? [String: AnyHashable] }
private func omitted(_ of: Int) -> [String: AnyHashable] { ["count": 0, "of": of, "subset": "omitted", "ranges": [] as [[Int]]] }

final class WideWebAreaTests: XCTestCase {
  /// The incident's page (#287's `/fixedtail`): 2,501 children, a fixed bar as the last. Above 512 the run that shows is
  /// bisected and the end samples add the bar, so about a hundred frames are read, not 2,501.
  func testAboveFiveHundredTwelveTheBisectedRunAndAShownTailArePrinted() {
    let tree = page(count: 2_501, scroll: 1_000)
    tree.frames[row(2_500)] = CGRect(x: 0, y: 760, width: 1000, height: 40)
    let source = FakeSource(tree)
    let walked = walk(tree, Lineage(), visibleFrame: windowFrame, source: source, recordsScreenshot: true)
    XCTAssertEqual(ids(walked), [0, 1] + (1_000..<1_035).map(row) + [row(2_500)])
    XCTAssertEqual(shown(walked), ["count": 36, "of": 2_501, "subset": "shown", "ranges": [[1_000, 1_035], [2_500, 2_501]]])
    XCTAssertEqual(walked.nodes[1]["children"] as? Int, 36)
    XCTAssertEqual(walked.recordOnlyReads, 0, "the record finds them in the tree")
    XCTAssertLessThan(source.frameReads.count, 300, "bisected, not every child judged")
  }

  /// Up to 512 each child is judged by its own frame: a page in two CSS columns, which no bisection takes as one run,
  /// prints both shown runs.
  func testUpToFiveHundredTwelveEachChildIsJudgedByItsOwnFrame() {
    let tree = page(count: 512, scroll: 0)
    for i in 0..<512 {
      let (columnStart, x) = i < 256 ? (0, 0.0) : (256, 500.0)
      tree.frames[row(i)] = CGRect(x: x, y: viewport.minY + Double(i - columnStart - 100) * 20, width: 500, height: 20)
    }
    let walked = walk(tree, Lineage(), visibleFrame: windowFrame)
    XCTAssertEqual(ids(walked), [0, 1] + (100..<135).map(row) + (356..<391).map(row))
    XCTAssertEqual(shown(walked), ["count": 70, "of": 512, "subset": "shown", "ranges": [[100, 135], [356, 391]]])
  }

  /// The children are judged in what the web area leaves showing: the rows under the toolbar, inside the window, are not
  /// printed; and Chromium's offscreen strips are not shown children (the vendor's frame filter, at 499, keeps them).
  func testAtFiveHundredTheRowsAreJudgedInTheWebAreaAndAt499TheVendorsFilterStands() {
    let wide = walk(page(count: 500, scroll: 200, strips: true), Lineage(), visibleFrame: windowFrame)
    XCTAssertEqual(ids(wide), [0, 1] + (200..<235).map(row))
    XCTAssertEqual(shown(wide), ["count": 35, "of": 500, "subset": "shown", "ranges": [[200, 235]]])

    let narrow = walk(page(count: 499, scroll: 200, strips: true), Lineage(), visibleFrame: windowFrame)
    XCTAssertEqual(ids(narrow), [0, 1] + (0..<499).map(row), "every strip meets the window: all kept")
    XCTAssertNil(narrow.nodes[1]["shown"])
    let scrolled = walk(page(count: 499, scroll: 200), Lineage(), visibleFrame: windowFrame)
    XCTAssertEqual(shown(scrolled), ["count": 40, "of": 499, "subset": "visible", "ranges": [[195, 235]]],
                   "the vendor's filter meets the window, the toolbar's rows too")
  }

  /// An element with a visible subset prints it, whatever its frames say.
  func testAVisibleSubsetStandsAboveFiveHundred() {
    let tree = page(count: 600, scroll: 200)
    tree.visible[1] = (10..<20).map(row)
    let walked = walk(tree, Lineage(), visibleFrame: windowFrame)
    XCTAssertEqual(ids(walked), [0, 1] + (10..<20).map(row))
    XCTAssertEqual(shown(walked), ["count": 10, "of": 600, "subset": "visible", "ranges": [[10, 20]]])
  }

  /// With nothing to show, or no frame to judge by, it prints none, as the vendor: none shows (the page's rows all lie
  /// below), no child has a frame (on either path), or no visible frame to judge in. When every child shows, it prints
  /// them all, unmarked.
  func testNothingShownOrNoFramesPrintsNoneAndEverythingShownPrintsAllUnmarked() {
    let below = walk(page(count: 600, scroll: -100), Lineage(), visibleFrame: windowFrame)
    XCTAssertEqual(ids(below), [0, 1])
    XCTAssertEqual(shown(below), omitted(600))
    for count in [505, 600] {
      let frameless = page(count: count, scroll: 0)
      for i in 0..<count { frameless.frames[row(i)] = nil }
      let walked = walk(frameless, Lineage(), visibleFrame: windowFrame)
      XCTAssertEqual(ids(walked), [0, 1], "\(count) frameless children")
      XCTAssertEqual(shown(walked), omitted(count))
    }
    let unjudged = walk(page(count: 600, scroll: 0), Lineage())
    XCTAssertEqual(shown(unjudged), omitted(600), "no visible frame")

    let short = page(count: 505, scroll: 0)
    for i in 0..<505 { short.frames[row(i)] = CGRect(x: 0, y: viewport.minY + Double(i) * 1.2, width: 1000, height: 1.2) }
    let all = walk(short, Lineage(), visibleFrame: windowFrame)
    XCTAssertEqual(all.nodes.count, 507)
    XCTAssertNil(all.nodes[1]["shown"])
  }

  /// Above 512 the bisection and the samples place a row along the list's axis alone: each candidate is kept only when
  /// its own frame shows beyond a strip, or it has none, as up to 512 (the review of 3de863bb..937f49c9). A row in the
  /// run moved off the viewport sideways, and a collapsed 1-pt one, are not printed, a frameless one is, and the marker
  /// counts what is printed.
  func testABisectedCandidateMovedOffSidewaysIsNotPrinted() {
    let tree = page(count: 600, scroll: 200)
    tree.frames[row(210)] = CGRect(x: 2_000, y: viewport.minY + 10 * 20, width: 1000, height: 20)
    tree.frames[row(220)] = CGRect(x: 0, y: viewport.minY + 20 * 20, width: 1000, height: 1)
    tree.frames[row(225)] = nil
    let walked = walk(tree, Lineage(), visibleFrame: windowFrame)
    XCTAssertEqual(ids(walked), [0, 1] + (200..<210).map(row) + (211..<220).map(row) + (221..<235).map(row))
    XCTAssertEqual(shown(walked), ["count": 33, "of": 600, "subset": "shown", "ranges": [[200, 210], [211, 220], [221, 235]]])
  }

  /// The deadline stops the candidates' check too: a search whose deadline passes at the first frame only the check
  /// reads (row 215: neither bisection nor any sample reads it) keeps none.
  func testTheDeadlineStopsTheCandidatesCheck() throws {
    let tree = page(count: 600, scroll: 200)
    let source = FakeSource(tree)
    let data = try XCTUnwrap(source.data(Engine.element(1)))
    let chosen = chooseChildren(of: Engine.element(1), data: data, source: source, visibleFrame: windowFrame, shownIn: viewport,
                                expired: { source.frameReads[row(215)] != nil })
    XCTAssertEqual(chosen.children.count, 0)
    XCTAssertEqual(chosen.shown?.subset, "omitted")
  }

  /// The callers' deadlines reach the width rule's search (the review of 3de863bb..937f49c9): the settle's busy walk
  /// over a page whose 500 frames each take 2 ms stops at its deadline, with no verdict rather than a quiet one.
  func testTheBusyWalksDeadlineStopsTheSearchAndGivesNoVerdict() {
    let tree = page(count: 500, scroll: -100)
    for i in 0..<500 { tree.slowFrames[row(i)] = 2_000 }
    let started = monotonicMilliseconds()
    let reading = busyWalk(Engine.element(0), source: FakeSource(tree), visibleFrame: windowFrame, deadline: started + 50)
    XCTAssertNil(reading.busy, "cut by the deadline: no verdict")
    XCTAssertLessThan(monotonicMilliseconds() - started, 400, "the search stopped near the deadline, not after 500 reads")
  }

  /// The token re-fetch's deadline reaches the search too: a re-fetch over such a page stops near its deadline.
  func testTheRefetchsDeadlineStopsTheSearch() throws {
    let tree = page(count: 500, scroll: 0)
    let lineage = Lineage()
    let token = try XCTUnwrap(walk(tree, lineage, visibleFrame: windowFrame).token(of: Engine.element(row(10))))
    tree.unreadable = [row(10)]
    tree.children[1]![10] = 99_999
    tree.extra[99_999] = ["AXTitle": "node \(row(10))" as CFString]
    tree.frames[99_999] = tree.frames[row(10)]
    for i in 0..<500 { tree.slowFrames[row(i)] = 2_000 }
    let resolver = ElementResolver(invalidated: { _ in true }, stillValid: { _ in true }, source: { FakeSource(tree) },
                                   tree: { _ in (Engine.element(0), []) }, refetchDeadlineMs: 50)
    let started = monotonicMilliseconds()
    XCTAssertThrowsError(try lineage.resolve(token, resolver: resolver))
    XCTAssertLessThan(monotonicMilliseconds() - started, 400, "the search stopped near the deadline, not after 500 reads")
  }

  /// The token re-fetch (Lineage.swift `matching`) keeps the children the walk printed, so a printed row the page
  /// re-rendered is found again.
  func testTheRefetchFindsAPrintedRowOfAWideWebArea() throws {
    let tree = page(count: 2_501, scroll: 1_000)
    let lineage = Lineage()
    let token = try XCTUnwrap(walk(tree, lineage, visibleFrame: windowFrame).token(of: Engine.element(row(1_010))))
    tree.unreadable = [row(1_010)]
    tree.children[1]![1_010] = 99_999
    tree.extra[99_999] = ["AXTitle": "node \(row(1_010))" as CFString]
    tree.frames[99_999] = tree.frames[row(1_010)]
    let resolver = ElementResolver(invalidated: { _ in true }, stillValid: { _ in true }, source: { FakeSource(tree) },
                                   tree: { _ in (Engine.element(0), []) })
    XCTAssertTrue(CFEqual(try lineage.resolve(token, resolver: resolver).element, Engine.element(99_999)))
  }

  /// The settle's busy walk walks what the observation prints: a spinner among a wide page's shown rows is found.
  func testTheBusyWalkSeesASpinnerAmongTheShownRows() {
    let tree = page(count: 600, scroll: 200)
    tree.extra[row(210)] = ["AXRole": "AXBusyIndicator" as CFString]
    XCTAssertEqual(busyWalk(Engine.element(0), source: FakeSource(tree), visibleFrame: windowFrame, deadline: .infinity).busy, true)
  }
}
