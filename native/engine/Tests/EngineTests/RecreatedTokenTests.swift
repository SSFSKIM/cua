import ApplicationServices
import XCTest
@testable import Engine

/// #303: Chromium re-creates the AXColumn elements it synthesizes for a table, and the table's header AXGroup, between
/// observations; the old handles read kAXErrorInvalidUIElement. Under the vendor's CFEqual rule each took a new token
/// every time. A re-created element of those roles now keeps its token when it is the old one in every way the engine
/// can read: the same role at the same place among that role's siblings, the same eleven identity attributes, the same
/// frame relative to its parent, the same first child, and the old handle gone. Anything else is the vendor's rule.
final class RecreatedTokenTests: XCTestCase {
  /// window 0 > web area 1 > table 2: rows 3 and 4, then columns 5 and 6 and the header group 7 (Chromium lists them
  /// after the rows). Cells 8 to 11, through the rows and the columns; header cells 12 and 13, under the header group.
  private func table() -> FakeTree {
    let tree = FakeTree()
    tree.children = [0: [1], 1: [2], 2: [3, 4, 5, 6, 7], 3: [8, 10], 4: [9, 11], 5: [12, 8, 9], 6: [13, 10, 11], 7: [12, 13]]
    tree.frames[2] = CGRect(x: 10, y: 100, width: 300, height: 200)
    for id in [5, 6] { tree.frames[id] = CGRect(x: 10, y: 100, width: 300, height: 200) }  // Chromium gives each column the table's frame
    tree.frames[7] = CGRect(x: 10, y: 100, width: 300, height: 20)
    tree.extra[0] = ["AXRole": "AXWindow" as CFString]
    tree.extra[1] = ["AXRole": "AXWebArea" as CFString]
    tree.extra[2] = ["AXRole": "AXTable" as CFString]
    for id in 8...13 { tree.extra[id] = ["AXRole": "AXCell" as CFString, "AXTitle": "cell \(id)" as CFString] }
    for id in [3, 4] { tree.extra[id] = ["AXRole": "AXRow" as CFString] }
    for id in [5, 6] { tree.extra[id] = ["AXRole": "AXColumn" as CFString, "AXTitle": "" as CFString] }
    tree.extra[7] = ["AXRole": "AXGroup" as CFString, "AXTitle": "" as CFString]
    return tree
  }

  /// Replaces each old id with its new one in the table's children (Chromium's re-creation), copying the element's
  /// attributes, frame and children; the old handles read as gone unless `alive`.
  private func recreate(_ tree: FakeTree, _ pairs: [Int: Int], alive: Bool = false) {
    for (old, new) in pairs {
      tree.extra[new] = tree.extra[old]
      tree.frames[new] = tree.frames[old]
      tree.children[new] = tree.children[old]
      tree.children[2] = tree.children[2]!.map { $0 == old ? new : $0 }
      if !alive { tree.gone.insert(old) }
    }
  }

  /// The tokens of the emitted nodes of `role`, in emission order.
  private func tokens(_ walk: TreeWalk, _ role: String) -> [String] {
    walk.nodes.filter { $0["role"] as? String == role }.compactMap { $0["token"] as? String }
  }

  func testRecreatedColumnsAndHeaderGroupKeepTheirTokens() {
    let tree = table(), lineage = Lineage()
    let first = walk(tree, lineage)
    let columns = tokens(first, "AXColumn"), groups = tokens(first, "AXGroup")
    XCTAssertEqual(columns.count, 2)
    recreate(tree, [5: 15, 6: 16, 7: 17])
    let second = walk(tree, lineage)
    XCTAssertEqual(tokens(second, "AXColumn"), columns)
    XCTAssertEqual(tokens(second, "AXGroup").last, groups.last, "the header group")
    recreate(tree, [15: 25, 16: 26, 17: 27])
    XCTAssertEqual(tokens(walk(tree, lineage), "AXColumn"), columns, "a third observation, re-created again")
  }

  /// A page scrolled between the observations moves the table and its columns together: the frame is compared relative
  /// to the parent's.
  func testAColumnMovedWithItsTableKeepsItsToken() {
    let tree = table(), lineage = Lineage()
    let columns = tokens(walk(tree, lineage), "AXColumn")
    recreate(tree, [5: 15, 6: 16])
    for id in [2, 15, 16] { tree.frames[id]!.origin.y -= 80 }
    XCTAssertEqual(tokens(walk(tree, lineage), "AXColumn"), columns)
  }

  /// An old handle that still reads is a live element: the new one beside it is another element, a new token.
  func testANewColumnBesideALiveOldOneTakesANewToken() {
    let tree = table(), lineage = Lineage()
    let columns = tokens(walk(tree, lineage), "AXColumn")
    recreate(tree, [6: 16], alive: true)
    let now = tokens(walk(tree, lineage), "AXColumn")
    XCTAssertEqual(now.first, columns.first, "the first column kept by its CFEqual handle")
    XCTAssertNotEqual(now.last, columns.last, "the second new")
  }

  /// A column inserted first: every column is re-created, and each now heads other cells than the old column at its
  /// place, so none keeps a token (as under the vendor's rule).
  func testAColumnInsertedFirstTakesNewTokensForEveryShiftedColumn() {
    let tree = table(), lineage = Lineage()
    let columns = tokens(walk(tree, lineage), "AXColumn")
    recreate(tree, [5: 15, 6: 16])
    tree.extra[14] = tree.extra[15]
    tree.frames[14] = tree.frames[15]
    tree.children[14] = [30, 31, 32]
    tree.children[2] = [3, 4, 14, 15, 16, 7]
    let now = tokens(walk(tree, lineage), "AXColumn")
    XCTAssertEqual(now.count, 3)
    XCTAssertTrue(Set(now).isDisjoint(with: columns), "\(now) against \(columns)")
  }

  /// What differs from the old element keeps the vendor's rule: a changed identity attribute, a frame moved within its
  /// parent, another first child.
  func testARecreatedColumnThatDiffersTakesANewToken() {
    let changes: [(String, (FakeTree) -> Void)] = [
      ("title", { $0.extra[16]!["AXTitle"] = "Price" as CFString }),
      ("frame", { $0.frames[16]!.origin.x += 40 }),
      ("first child", { $0.children[16] = [40, 10, 11] }),
    ]
    // Nothing missing counts as a match: a column re-created childless, or frameless, takes a new token even when the old
    // one was childless or frameless too.
    let missing: [(String, (FakeTree) -> Void)] = [
      ("no children on either side", { $0.children[6] = []; $0.children[16] = [] }),
      ("no frame on either side", { $0.frames[6] = nil; $0.frames[16] = nil }),
    ]
    for (what, strip) in missing {
      let tree = table(), lineage = Lineage()
      strip(tree)
      let columns = tokens(walk(tree, lineage), "AXColumn")
      recreate(tree, [5: 15, 6: 16])
      strip(tree)
      let now = tokens(walk(tree, lineage), "AXColumn")
      XCTAssertEqual(now.first, columns.first, what)
      XCTAssertNotEqual(now.last, columns.last, what)
    }
    for (what, change) in changes {
      let tree = table(), lineage = Lineage()
      let columns = tokens(walk(tree, lineage), "AXColumn")
      recreate(tree, [5: 15, 6: 16])
      change(tree)
      let now = tokens(walk(tree, lineage), "AXColumn")
      XCTAssertEqual(now.first, columns.first, what)
      XCTAssertNotEqual(now.last, columns.last, what)
    }
  }

  /// Only the roles Chromium synthesizes: a DOM-backed element replaced by an identical one is a real replacement and
  /// takes a new token, as is an AXGroup outside a table.
  func testOtherRolesKeepTheVendorsRule() {
    let tree = table(), lineage = Lineage()
    tree.extra[3] = ["AXRole": "AXButton" as CFString, "AXTitle": "Save" as CFString]
    tree.children[1] = [2, 50]
    tree.extra[50] = ["AXRole": "AXGroup" as CFString, "AXTitle": "" as CFString]
    tree.frames[50] = CGRect(x: 10, y: 400, width: 100, height: 20)
    let first = walk(tree, lineage)
    let button = tokens(first, "AXButton"), groups = tokens(first, "AXGroup")
    recreate(tree, [3: 33])
    tree.children[1] = [2, 51]
    tree.extra[51] = tree.extra[50]
    tree.frames[51] = tree.frames[50]
    tree.gone.insert(50)
    let second = walk(tree, lineage)
    XCTAssertNotEqual(tokens(second, "AXButton"), button)
    XCTAssertNotEqual(tokens(second, "AXGroup").last, groups.last, "the group outside the table")
    XCTAssertEqual(tokens(second, "AXGroup").first, groups.first, "the header group, not re-created, kept by CFEqual")
  }

  /// A header cell spanning both columns is each one's first child (Chromium lists a spanning cell under every column
  /// it covers): it tells no column apart, so none keeps a token, also when a column is inserted under the widened
  /// header (the review's case, where the anchor would have handed the first column's token to the new one).
  func testAFirstChildSharedByColumnsAnchorsNone() {
    let tree = table(), lineage = Lineage()
    tree.children[5] = [12, 8, 9]
    tree.children[6] = [12, 10, 11]
    let columns = tokens(walk(tree, lineage), "AXColumn")
    recreate(tree, [5: 15, 6: 16])
    XCTAssertTrue(Set(tokens(walk(tree, lineage), "AXColumn")).isDisjoint(with: columns), "re-created under a spanning header")
    let again = tokens(walk(tree, lineage), "AXColumn")
    recreate(tree, [15: 25, 16: 26])
    tree.extra[24] = tree.extra[25]
    tree.frames[24] = tree.frames[25]
    tree.children[24] = [12, 40, 41]
    tree.children[2] = [3, 4, 24, 25, 26, 7]
    XCTAssertTrue(Set(tokens(walk(tree, lineage), "AXColumn")).isDisjoint(with: again), "a column inserted under it")
  }

  /// Emission's gone checks stop at the observation's deadline: an app that stopped answering after the selection is
  /// asked once, and the columns not asked take new tokens.
  func testNoGoneCheckIsMadePastTheDeadline() {
    let tree = table(), lineage = Lineage()
    let columns = tokens(walk(tree, lineage), "AXColumn")
    recreate(tree, [5: 15, 6: 16])
    tree.goneDelay = 300_000
    let source = FakeSource(tree)
    let now = tokens(walk(tree, lineage, limits: WalkLimits(deadline: monotonicMilliseconds() + 150), source: source), "AXColumn")
    XCTAssertEqual(source.goneReads.values.reduce(0, +), 1, "asked once, then past the deadline")
    XCTAssertNotEqual(now.last, columns.last, "the column not asked takes a new token")
  }

  /// The gone check costs one read per candidate, made only for a re-created element that matched in everything else.
  func testTheOldHandleIsAskedOnlyForACandidate() {
    let tree = table(), lineage = Lineage()
    _ = walk(tree, lineage)
    // One source per observation, as the engine's: a source keeps what it read.
    func gone() -> [Int: Int] { let source = FakeSource(tree); _ = walk(tree, lineage, source: source); return source.goneReads }
    XCTAssertEqual(gone(), [:], "nothing re-created, nothing asked")
    recreate(tree, [5: 15])
    tree.extra[15]!["AXTitle"] = "Other" as CFString
    XCTAssertEqual(gone(), [:], "a differing candidate is not asked")
    recreate(tree, [6: 16])
    XCTAssertEqual(gone(), [6: 1])
  }
}
