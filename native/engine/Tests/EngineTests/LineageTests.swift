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
      tree: { [self] _ in
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
    tree.extra[89] = ["AXRole": "AXMenuBar" as CFString]
    _ = walk(tree, lineage, menuBar: 89, menu: [88, 90])   // the bar t2, File t3
    tree.unreadable = [90]
    tree.extra[91] = tree.extra[90]
    let fake = FakeResolution(tree)
    fake.invalidated = true
    fake.menu = [89, 88, 91]
    XCTAssertTrue(CFEqual(try lineage.resolve(elementToken(3), resolver: fake.resolver).element, Engine.element(91)))
  }

  /// A menu-bar token's identity was recorded through the attributes the element lists, so it is checked and re-fetched
  /// through the same read: a bar that answers an AXRoleDescription it does not list still resolves.
  func testAMenuBarTokenReResolvesThroughItsListedRead() throws {
    let tree = FakeTree()
    tree.children = [0: [1]]
    tree.extra = [89: ["AXRole": "AXMenuBar" as CFString, "AXTitle": "" as CFString, "AXRoleDescription": "menu bar" as CFString],
                  90: ["AXRole": "AXMenuBarItem" as CFString, "AXTitle": "File" as CFString]]
    tree.listed = [89: ["AXRole", "AXTitle", "AXChildren"]]
    let lineage = Lineage()
    _ = walk(tree, lineage, menuBar: 89, menu: [88, 90])   // the bar t2, File t3
    let fake = FakeResolution(tree)
    fake.invalidated = true
    fake.menu = [89, 88, 90]
    XCTAssertTrue(CFEqual(try lineage.resolve(elementToken(2), resolver: fake.resolver).element, Engine.element(89)), "the live check")
    XCTAssertEqual(fake.treeReads, 0)
    tree.unreadable = [89]
    tree.extra[87] = tree.extra[89]
    tree.listed[87] = tree.listed[89]
    fake.menu = [87, 88, 90]
    XCTAssertTrue(CFEqual(try lineage.resolve(elementToken(2), resolver: fake.resolver).element, Engine.element(87)), "the re-fetch")
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

  // MARK: The re-reads that do not wait for the watch (Refetch)

  func testAfterAScrollTheElementIsReReadEvenWithNothingInvalidatedAndAReplacementTakesItsToken() throws {
    let (tree, lineage) = observed()
    let fake = FakeResolution(tree)          // the watch has said nothing yet
    // The scroll recycled the label's row: the old handle is gone, a new one (5) shows the same thing with an action.
    tree.unreadable = [3]
    tree.children = [0: [1, 2, 5]]
    tree.extra[5] = tree.extra[3]
    tree.extra[5]?["AXTitle"] = "node 3" as CFString   // the fake's default title is its id's
    tree.actions[5] = ["AXShowMenu"]
    XCTAssertTrue(CFEqual(try lineage.resolve(elementToken(3), resolver: fake.resolver).element, Engine.element(3)),
                  "if needed: nothing invalidated, the stored handle is only validated")
    let entry = try lineage.resolve(elementToken(3), resolver: fake.resolver, refetch: .always)
    XCTAssertTrue(CFEqual(entry.element, Engine.element(5)))
    XCTAssertEqual(entry.actions, ["AXShowMenu"], "the actions are the replacement's, not the observed element's")
    XCTAssertTrue(CFEqual(try XCTUnwrap(lineage.entry(3)).element, Engine.element(5)), "the token names the new handle")
    XCTAssertEqual(fake.treeReads, 1)
  }

  func testAfterAScrollAnElementThatStillMatchesKeepsItsHandleWithoutAWalk() throws {
    let (tree, lineage) = observed()
    let fake = FakeResolution(tree)
    tree.actions[2] = ["AXPress"]
    let entry = try lineage.resolve(elementToken(2), resolver: fake.resolver, refetch: .always)
    XCTAssertTrue(CFEqual(entry.element, Engine.element(2)))
    XCTAssertEqual(entry.identity.pid, 777)
    XCTAssertEqual(entry.actions, ["AXPress"])
    XCTAssertEqual(fake.treeReads, 0)
  }

  func testAfterAWriteTheSameElementTakesItsNewValueAndStaysResolvable() throws {
    let (tree, lineage) = observed()
    tree.extra[1]?["AXValue"] = "sent" as CFString
    let fake = FakeResolution(tree)
    XCTAssertEqual(try lineage.resolve(elementToken(1), resolver: fake.resolver, refetch: .ignoringValue).identity.value, "s:sent")
    XCTAssertEqual(fake.treeReads, 0)
    fake.invalidated = true
    XCTAssertTrue(CFEqual(try lineage.resolve(elementToken(1), resolver: fake.resolver).element, Engine.element(1)),
                  "a later re-fetch matches the value the write left")
  }

  func testAWriteThatReplacedTheElementIsRefetchedWithoutTheValue() throws {
    let (tree, lineage) = observed()
    // The field was rebuilt by the write: the old handle is gone, and the new one (6) holds the new value.
    tree.unreadable = [1]
    tree.children = [0: [6, 2, 3]]
    tree.extra[6] = ["AXRole": "AXTextField" as CFString, "AXValue": "sent" as CFString, "AXTitle": "node 1" as CFString]
    tree.owners[6] = 4243
    let fake = FakeResolution(tree)
    let entry = try lineage.resolve(elementToken(1), resolver: fake.resolver, refetch: .ignoringValue)
    XCTAssertTrue(CFEqual(entry.element, Engine.element(6)))
    XCTAssertEqual(entry.identity.value, "s:sent", "the stored identity is the one read now")
    XCTAssertEqual(entry.identity.pid, 4243)
    XCTAssertTrue(CFEqual(try XCTUnwrap(lineage.entry(1)).element, Engine.element(6)))
  }

  func testAFailedReCheckAfterAWriteIsRaised() {
    let (tree, lineage) = observed()
    tree.unreadable = [1]
    tree.children = [0: [2, 3]]               // the field is gone
    XCTAssertThrowsError(try lineage.resolve(elementToken(1), resolver: FakeResolution(tree).resolver, refetch: .ignoringValue)) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "elementNoLongerValid")
    }
  }

  func testAScrollThatReplacedTheTargetHandsTheActionTheReplacement() throws {
    let (tree, lineage) = observed()
    let fake = FakeResolution(tree)
    // The label (3) sits below its window's view (0, clipping at y 0…100); its scroll to visible recycles it as 5.
    let ax = FakeAX()
    ax.roles = [0: kAXWindowRole, 3: kAXStaticTextRole]
    ax.parents = [3: 0]
    ax.frames = [0: CGRect(x: 0, y: 0, width: 100, height: 100), 3: CGRect(x: 0, y: 400, width: 100, height: 20)]
    ax.actions = [3: ["AXScrollToVisible"]]
    ax.onPerform = { id, _ in
      ax.frames[3] = nil
      tree.unreadable = [3]
      tree.children = [0: [1, 2, 5]]
      tree.extra[5] = tree.extra[3]
      tree.extra[5]?["AXTitle"] = "node 3" as CFString
    }
    let observedTarget = ElementTarget(entry: try lineage.resolve(elementToken(3), resolver: fake.resolver), owner: 4242)
    var refetches = 0
    let target = try scrolledIntoView(observedTarget, ax: ax.ops) {
      refetches += 1
      return ElementTarget(entry: try lineage.resolve(elementToken(3), resolver: fake.resolver, refetch: .always), owner: 4242)
    }
    XCTAssertEqual(ax.performs.map(\.action), ["AXScrollToVisible"])
    XCTAssertEqual(refetches, 1)
    XCTAssertTrue(CFEqual(target.element, Engine.element(5)), "the action goes to the element the scroll left, not the stale handle")

    ax.frames[3] = CGRect(x: 0, y: 40, width: 100, height: 20)  // showing: nothing scrolled, nothing re-resolved
    _ = try scrolledIntoView(observedTarget, ax: ax.ops) { refetches += 1; return observedTarget }
    XCTAssertEqual(refetches, 1)
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
