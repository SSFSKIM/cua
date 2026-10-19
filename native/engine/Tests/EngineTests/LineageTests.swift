import ApplicationServices
import XCTest
@testable import Engine

// Resolving an action's element token (the spec's Design, "Indexes, tokens and handles"; R/F-helper-logic.md §3.5–3.7):
// the lineage guard, retired tokens, validation without a re-fetch, and the re-fetch by the eleven attributes, including
// an element served by another process (the Open panel's case). The live system is the resolver's seam; here a fake tree
// answers it, and the fake handles are application handles for unused pids, so nothing reaches any process.

/// A resolver over a fake tree: whether the element was invalidated, whether its handle still validates, and the tree a
/// re-fetch walks. It counts the re-fetch walks it was asked for.
private final class FakeResolution {
  let tree: FakeTree
  var invalidated = false
  var valid = true
  var window = 0
  var menu: [Int] = []
  private(set) var treeReads = 0

  init(_ tree: FakeTree) { self.tree = tree }

  var resolver: ElementResolver {
    ElementResolver(
      invalidated: { [self] _ in invalidated },
      stillValid: { [self] _ in valid },
      source: { [self] in FakeSource(tree) },
      tree: { [self] in
        treeReads += 1
        return (Engine.element(window), menu.map(Engine.element))
      })
  }
}

private let app = ResolvedApp(appPath: "/Applications/Fake.app", bundleIdentifier: "com.example.fake", displayName: "Fake", running: nil)

final class TokenResolutionTests: XCTestCase {
  /// A window (0) with a field (1), a button served by another process (2, pid 777) and a label (3), observed once.
  private func observed() -> (FakeTree, Lineage) {
    let tree = FakeTree()
    tree.children = [0: [1, 2, 3]]
    tree.extra = [1: ["AXRole": "AXTextField" as CFString, "AXValue": "draft" as CFString],
                  2: ["AXRole": "AXButton" as CFString, "AXTitle": "Open" as CFString, "AXIdentifier": "OKButton" as CFString],
                  3: ["AXRole": "AXStaticText" as CFString, "AXValue": "Name:" as CFString]]
    tree.owners = [2: 777]
    let lineage = Lineage()
    _ = walk(tree, lineage)
    return (tree, lineage)
  }

  func testTheWalkRecordsTheOwningProcessOfEachElement() throws {
    let (_, lineage) = observed()
    XCTAssertEqual(lineage.entry(2)?.identity.pid, 777, "the panel's button is the panel service's")
    XCTAssertEqual(lineage.entry(1)?.identity.pid, 4242)
  }

  func testWithNothingInvalidatedTheHandleIsValidatedNotRefetched() throws {
    let (tree, lineage) = observed()
    let fake = FakeResolution(tree)
    let entry = try lineage.resolve(elementToken(2), resolver: fake.resolver)
    XCTAssertTrue(CFEqual(entry.element, Engine.element(2)))
    XCTAssertEqual(fake.treeReads, 0)
    fake.valid = false
    XCTAssertThrowsError(try lineage.resolve(elementToken(2), resolver: fake.resolver)) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "elementNoLongerValid", "an invalid handle")
    }
  }

  func testARetiredUnknownOrMalformedTokenIsNoLongerValid() {
    let (tree, lineage) = observed()
    tree.children = [0: [1, 2]]                   // the label vanishes: t3 retired
    _ = walk(tree, lineage)
    for token in [elementToken(3), elementToken(99), "x", "3"] {
      XCTAssertThrowsError(try lineage.resolve(token, resolver: FakeResolution(tree).resolver), token) { error in
        XCTAssertEqual((error as? EngineError)?.message,
                       "The element ID is no longer valid. Try to get the on-screen content again and see if that resolves the issue.", token)
      }
    }
  }

  func testAnInvalidatedElementThatStillMatchesIsKept() throws {
    let (tree, lineage) = observed()
    let fake = FakeResolution(tree)
    fake.invalidated = true
    let entry = try lineage.resolve(elementToken(1), resolver: fake.resolver)
    XCTAssertTrue(CFEqual(entry.element, Engine.element(1)))
    XCTAssertEqual(fake.treeReads, 0, "the live re-read matched: no re-fetch walk")
  }

  func testAReplacedElementOfAnotherProcessIsRefetchedByItsElevenAttributes() throws {
    let (tree, lineage) = observed()
    // The panel service redrew its button: the old handle is gone, a new one (4) carries the same attributes, and the
    // service now runs as another process.
    tree.unreadable = [2]
    tree.children = [0: [1, 4, 3]]
    tree.extra[4] = tree.extra[2]
    tree.owners = [4: 778]
    let fake = FakeResolution(tree)
    fake.invalidated = true
    let entry = try lineage.resolve(elementToken(2), resolver: fake.resolver)
    XCTAssertTrue(CFEqual(entry.element, Engine.element(4)), "the one element matching all eleven attributes")
    XCTAssertEqual(entry.identity.pid, 778, "input goes to the process that serves it now")
    XCTAssertTrue(CFEqual(try XCTUnwrap(lineage.entry(2)).element, Engine.element(4)), "the token now names the new handle")
    XCTAssertEqual(lineage.entry(2)?.identity.pid, 778)
    XCTAssertEqual(fake.treeReads, 1)
  }

  func testTheRefetchFindsMenuBarItemsToo() throws {
    let tree = FakeTree()
    tree.children = [0: [1]]
    tree.extra = [90: ["AXRole": "AXMenuBarItem" as CFString, "AXTitle": "File" as CFString]]
    let lineage = Lineage()
    _ = walk(tree, lineage, menu: [90])
    tree.unreadable = [90]
    tree.extra[91] = tree.extra[90]
    let fake = FakeResolution(tree)
    fake.invalidated = true
    fake.menu = [91]
    XCTAssertTrue(CFEqual(try lineage.resolve(elementToken(2), resolver: fake.resolver).element, Engine.element(91)))
  }

  func testTheVendorsSentencesInTheVendorsOrder() {
    let (tree, lineage) = observed()
    let fake = FakeResolution(tree)
    fake.invalidated = true
    tree.unreadable = [2]

    tree.children = [0: [1, 3]]                   // no element matches now
    XCTAssertThrowsError(try lineage.resolve(elementToken(2), resolver: fake.resolver)) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "elementNoLongerValid")
    }
    tree.children = [0: [1, 4, 5, 3]]             // two match now
    tree.extra[4] = tree.extra[2]
    tree.extra[5] = tree.extra[2]
    XCTAssertThrowsError(try lineage.resolve(elementToken(2), resolver: fake.resolver)) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "elementAmbiguousAfterRefetch")
    }

    // Two elements of the observed tree already matched the stored attributes: the re-fetch cannot start.
    let twins = FakeTree()
    twins.children = [0: [1, 2]]
    twins.extra = [1: ["AXRole": "AXButton" as CFString, "AXTitle": "OK" as CFString], 2: ["AXRole": "AXButton" as CFString, "AXTitle": "OK" as CFString]]
    let twinLineage = Lineage()
    _ = walk(twins, twinLineage)
    twins.unreadable = [1]
    let twinFake = FakeResolution(twins)
    twinFake.invalidated = true
    XCTAssertThrowsError(try twinLineage.resolve(elementToken(1), resolver: twinFake.resolver)) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "elementAmbiguousBeforeRefetch")
    }
    XCTAssertEqual(twinFake.treeReads, 0, "nothing is walked when the re-fetch cannot start")
  }

  func testTheLineageGuardRefusesATokenOfAnotherOrAnEndedLineage() throws {
    let (tree, lineage) = observed()
    let connection = ConnectionState(id: 1, fd: -1)
    connection.lineages[app.key] = lineage
    let resolver: (Lineage) -> ElementResolver = { _ in FakeResolution(tree).resolver }
    XCTAssertTrue(CFEqual(try connection.element(elementToken(1), app: app, lineage: lineage.id, resolver: resolver).element, Engine.element(1)))
    for (reason, wanted) in [("another lineage", "Lother"), ("an empty lineage", "")] {
      XCTAssertThrowsError(try connection.element(elementToken(1), app: app, lineage: wanted, resolver: resolver), reason) { error in
        XCTAssertEqual((error as? EngineError)?.errorName, "elementNoLongerValid", reason)
      }
    }
    connection.lineages[app.key] = Lineage()      // disableDiff, or a relaunch: the old lineage ended
    XCTAssertThrowsError(try connection.element(elementToken(1), app: app, lineage: lineage.id, resolver: resolver)) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "elementNoLongerValid", "a stale token across a new lineage")
    }
    connection.lineages[app.key] = nil
    XCTAssertThrowsError(try connection.element(elementToken(1), app: app, lineage: lineage.id, resolver: resolver))
  }

  func testTheElementArgumentIsATokenWithItsLineage() throws {
    XCTAssertNil(try elementTokenArg([:], lineage: nil))
    XCTAssertEqual(try elementTokenArg(["element": "t4"], lineage: "Labc"), "t4")
    for (reason, args, lineage) in [("no lineage", ["element": "t4"], nil), ("an empty lineage", ["element": "t4"], ""),
                                    ("a number", ["element": 4], "Labc"), ("not a token", ["element": "4"], "Labc"),
                                    ("the facade's index", ["element_index": 4], "Labc")] as [(String, [String: Any], String?)] {
      XCTAssertThrowsError(try elementTokenArg(args, lineage: lineage), reason) { error in
        XCTAssertEqual((error as? EngineError)?.errorName, "invalidArguments", reason)
      }
    }
  }
}

/// The invalidation watch, per owning process (F §3.5, extended to the processes whose elements a tree holds).
final class InvalidationWatchTests: XCTestCase {
  func testAnElementIsInvalidatedByALayoutChangeAnywhereItsOwnDestructionOrAnUnwatchedOwner() {
    let lineage = Lineage()
    let appWatch = InvalidationState()
    let panelWatch = InvalidationState()
    lineage.adoptWatch(pid: 100, appWatch)
    lineage.adoptWatch(pid: 777, panelWatch)
    let field = Engine.element(1), button = Engine.element(2)
    XCTAssertFalse(lineage.invalidates(field, owner: 100))
    XCTAssertFalse(lineage.invalidates(button, owner: 777))
    XCTAssertTrue(lineage.invalidates(button, owner: 555), "no watch over its process: the safe path")

    panelWatch.record(ReceivedNotification(name: kAXUIElementDestroyedNotification, element: button, at: 0))
    XCTAssertTrue(lineage.invalidates(button, owner: 777))
    XCTAssertFalse(lineage.invalidates(field, owner: 100), "another element's destruction")

    appWatch.record(ReceivedNotification(name: kAXLayoutChangedNotification, element: field, at: 0))
    XCTAssertTrue(lineage.invalidates(field, owner: 100))
    XCTAssertTrue(lineage.invalidates(Engine.element(3), owner: 777), "a layout change in any watched process")

    lineage.resetWatches()
    XCTAssertFalse(lineage.invalidates(field, owner: 100))
    XCTAssertFalse(lineage.invalidates(button, owner: 777))
  }

  func testAWatchStartedAfterTheReadInvalidatesItsOwnProcesssElementsUntilTheNextObservation() {
    let lineage = Lineage()
    lineage.adoptWatch(pid: 100, InvalidationState())
    lineage.adoptWatch(pid: 777, InvalidationState(invalidatedUntilReset: true))
    XCTAssertTrue(lineage.invalidates(Engine.element(2), owner: 777), "it cannot vouch for the time between the read and its start")
    XCTAssertFalse(lineage.invalidates(Engine.element(1), owner: 100), "the app's own elements keep the AXRole validation")
    lineage.resetWatches()
    XCTAssertFalse(lineage.invalidates(Engine.element(2), owner: 777))
  }
}
