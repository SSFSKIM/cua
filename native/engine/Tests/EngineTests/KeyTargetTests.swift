import ApplicationServices
import XCTest
@testable import Engine

// #582 (ruling 1202): where keyboard events go. The vendor's walk (KeyTarget.swift) over a fake tree, the engine's
// keyboard target through its reads, and the fallback with `_AXUIElementGetActualPid` forced missing.

/// A fake tree: element n's parent is n + 1 up to `root`, each with its actual pid (nil: unreadable).
private struct FakeChain {
  var actual: [Int: pid_t?]
  var root: Int
  func parent(_ element: Int) -> Int? { element < root ? element + 1 : nil }
  func actualPid(_ element: Int) -> pid_t? { actual[element] ?? nil }
}

final class KeyTargetTests: XCTestCase {
  private let app: pid_t = 501, service: pid_t = 777, other: pid_t = 888, gone: pid_t = 999

  private func kind(_ pid: pid_t) -> OwningProcessKind {
    switch pid {
    case app, other: return .application
    case service: return .prohibited
    default: return .unknown
    }
  }

  private func walk(_ chain: FakeChain, appPid: pid_t? = nil) -> pid_t? {
    remoteViewKeyOwner(of: 0, appPid: appPid ?? app, parent: chain.parent, actualPid: chain.actualPid, kind: kind)
  }

  /// C-3's Open panel (run 45339840861): depths 0–5 (AXList up to AXSplitGroup) are the panel service's, depths 6 and 7
  /// (AXWindow, AXApplication) the app's. The service, prohibited-policy, takes the keys.
  func testTheWalkPicksTheProhibitedRemoteOwner() {
    var actual: [Int: pid_t?] = [:]
    for depth in 0...5 { actual[depth] = service }
    actual[6] = app
    actual[7] = app
    XCTAssertEqual(walk(FakeChain(actual: actual, root: 7)), service)
  }

  /// An element whose actual pid is unreadable, or whose process is no running application, is passed over: the walk
  /// goes on to the first that classifies.
  func testUnreadAndUnknownOwnersArePassedOver() {
    XCTAssertEqual(walk(FakeChain(actual: [0: nil, 1: gone, 2: service, 3: app], root: 3)), service)
  }

  /// A different owner of regular (or accessory) policy is not taken, and it ends the walk as the vendor's does: a
  /// prohibited one above it is not reached.
  func testARegularPolicyDifferentOwnerIsNotPicked() {
    XCTAssertNil(walk(FakeChain(actual: [0: other, 1: app], root: 1)))
    XCTAssertNil(walk(FakeChain(actual: [0: other, 1: service, 2: app], root: 2)))
  }

  /// The app's own element ends the walk with no switch, whatever lies above it (the vendor's stop condition, not "the
  /// first prohibited owner anywhere up the chain").
  func testTheSamePidCaseIsUnchanged() {
    XCTAssertNil(walk(FakeChain(actual: [0: app, 1: app], root: 1)))
    XCTAssertNil(walk(FakeChain(actual: [0: app, 1: service], root: 1)))
    // A prohibited-policy app's own pid is no remote owner.
    XCTAssertNil(walk(FakeChain(actual: [0: service], root: 0), appPid: service))
  }

  /// No element classifies, or the chain loops: no switch, and the walk ends at its depth bound (the element and 300
  /// parents).
  func testTheWalkIsBounded() {
    var reads = 0
    let looped = remoteViewKeyOwner(of: 0, appPid: app, parent: { $0 }, actualPid: { _ in reads += 1; return self.gone }, kind: kind)
    XCTAssertNil(looped)
    XCTAssertEqual(reads, 301)
    XCTAssertNil(walk(FakeChain(actual: [0: nil, 1: gone], root: 1)))
  }

  /// The target: the remote owner when the walk finds one; else the focused element's public owner, as before #582; the
  /// app when there is no focused element.
  func testTheTargetFallsBackToThePublicOwnerThenTheApp() {
    let chain = FakeChain(actual: [0: service, 1: app], root: 1)
    func target(_ focused: Int?, actual: ((Int) -> pid_t?)?) -> pid_t {
      keyboardTarget(focused: focused, appPid: app, publicOwner: { _ in 600 }, parent: chain.parent, actualPid: actual, kind: kind)
    }
    XCTAssertEqual(target(0, actual: chain.actualPid), service)
    XCTAssertEqual(target(0, actual: { _ in self.app }), 600, "no switch: the public owner, as before")
    XCTAssertEqual(target(nil, actual: chain.actualPid), app, "no focused element: the app")
  }

  // MARK: The symbol, and the fallback without it

  /// The symbol resolves on the macOS the suite runs on (the name is right), and a lookup that finds nothing leaves it
  /// missing.
  func testTheSymbolResolvesAndCanBeForcedMissing() {
    XCTAssertNotNil(ActualPid.resolved, "\(ActualPid.symbol) resolves here")
    XCTAssertNotNil(ActualPid.resolve())
    var asked: [String] = []
    XCTAssertNil(ActualPid.resolve { asked.append($0); return nil })
    XCTAssertEqual(asked, ["_AXUIElementGetActualPid"])
    XCTAssertNil(KeyTargetReads.live(actualPid: nil).actualPid)
    XCTAssertNotNil(KeyTargetReads.live().actualPid)
  }

  /// With the symbol missing the keys go where they went before #582, the public owner, even under a remote view, and
  /// status says it is unavailable; with it, status says available.
  func testTheMissingSymbolFallsBackAndStatusSaysSo() {
    let tree = FakeAXTree(app: app, service: service)
    var missing = tree.reads
    missing.actualPid = nil
    let fallback = engine(missing)
    XCTAssertEqual(fallback.keyboardTarget(tree.application, fallback: app), app, "the public owner (the app), as before")
    XCTAssertEqual(fallback.status(ConnectionState(id: 1, fd: -1))["actualPid"] as? Bool, false)

    let routed = engine(tree.reads)
    XCTAssertEqual(routed.status(ConnectionState(id: 1, fd: -1))["actualPid"] as? Bool, true)
  }

  // MARK: The engine's keyboard target

  /// press_key, type_text (both routes) and paste take their keys' process from `keyboardTarget(_:fallback:)`: through
  /// the engine's reads, a focused element in a remote view goes to its service; an ordinary focused element keeps its
  /// public owner; no focused element keeps the app.
  func testTheEnginesKeyboardTargetTakesTheRemoteViewsService() {
    let tree = FakeAXTree(app: app, service: service)
    XCTAssertEqual(engine(tree.reads).keyboardTarget(tree.application, fallback: app), service)

    var ordinary = tree
    ordinary.focusedIndex = 3  // the window: the app's own element
    XCTAssertEqual(engine(ordinary.reads).keyboardTarget(tree.application, fallback: app), app)

    var none = tree
    none.focusedIndex = nil
    XCTAssertEqual(engine(none.reads).keyboardTarget(tree.application, fallback: app), app)
  }

  private func engine(_ reads: KeyTargetReads) -> Engine {
    Engine(paths: ServerPaths(socket: "/tmp/x.sock", directory: "/tmp", lock: "/tmp/x.lock", usage: "/tmp/cua-engine-test-usage.json"),
           intervention: InterventionMonitor(listenGranted: { false }), screenLocked: { false }, keyTargetReads: reads)
  }
}

/// An Open panel's tree as AX elements, each a token (an application element for a pid of its own) never sent to a
/// process: the panel's list (0) and split group (1), served by the service, then a group (2) and the window (3), the
/// app's, under the application. Every element's public pid is the app's, as C-3 read.
private struct FakeAXTree {
  let app: pid_t
  let service: pid_t
  let application: AXUIElement
  let chain: [AXUIElement]
  let actual: [pid_t]
  var focusedIndex: Int? = 0

  init(app: pid_t, service: pid_t) {
    self.app = app
    self.service = service
    application = AXUIElementCreateApplication(70_000)
    chain = (70_001...70_004).map { AXUIElementCreateApplication($0) }
    actual = [service, service, app, app]
  }

  private func index(_ element: AXUIElement) -> Int? { chain.firstIndex { CFEqual($0, element) } }

  var reads: KeyTargetReads {
    let tree = self
    return KeyTargetReads(
      focused: { CFEqual($0, tree.application) ? tree.focusedIndex.map { tree.chain[$0] } : nil },
      parent: { element in tree.index(element).flatMap { $0 + 1 < tree.chain.count ? tree.chain[$0 + 1] : tree.application } },
      publicPid: { _ in tree.app },
      actualPid: { element in tree.index(element).map { tree.actual[$0] } ?? (CFEqual(element, tree.application) ? tree.app : nil) },
      kind: { $0 == tree.service ? .prohibited : $0 == tree.app ? .application : .unknown })
  }
}
