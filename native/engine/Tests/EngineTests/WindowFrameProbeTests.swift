import ApplicationServices
import XCTest
@testable import Engine

// The exact-window geometry probe over a fake AXWindows tree and CG readback. No live AX/CG calls.
final class WindowFrameProbeTests: XCTestCase {
  private let arguments = ["--pid", "612", "--window", "92", "--frame", "-100,40,800,600"]
  private let request = WindowFrameRequest(pid: 612, window: 92, frame: CGRect(x: -100, y: 40, width: 800, height: 600))

  func testParserRejectsIncompleteDuplicateAndNonfiniteInput() {
    XCTAssertEqual(WindowFrameRequest.parse(arguments), request)
    XCTAssertEqual(WindowFrameRequest.parse(["--frame", "-100,40,800,600", "--window", "92", "--pid", "612"]), request)
    for bad in [[], ["--pid"], Array(arguments.dropLast()), arguments + ["--pid", "612"],
                arguments + ["--window", "92"], arguments + ["--frame", "0,0,1,1"], arguments + ["extra"]] {
      XCTAssertNil(WindowFrameRequest.parse(bad), "\(bad)")
    }
    for value in ["0", "-1", "2147483648", "nan"] {
      var bad = arguments; bad[1] = value
      XCTAssertNil(WindowFrameRequest.parse(bad))
    }
    for value in ["0", "-1", "4294967296", "1.5"] {
      var bad = arguments; bad[3] = value
      XCTAssertNil(WindowFrameRequest.parse(bad))
    }
    for value in ["0,0,0,20", "0,0,20,-1", "nan,0,20,20", "0,inf,20,20", "0,0,20,", "0,0,20", "0,0,20,20,20"] {
      var bad = arguments; bad[5] = value
      XCTAssertNil(WindowFrameRequest.parse(bad))
    }
  }

  // Fake app tree: root -> AXWindows [1, 2]. Deliberately do not expose titles,
  // children, focus, or an AX frame: none can participate in exact identity.
  private final class Tree {
    var windows: [Int]? = [1, 2]
    var identities: [Int: WindowFrameIdentity] = [
      1: WindowFrameIdentity(pid: 612, window: 91),
      2: WindowFrameIdentity(pid: 612, window: 92),
    ]
    var trusted = true, allowed = true, settable = true
    var cg: CGRect? = CGRect(x: 10, y: 20, width: 400, height: 300)
    var reads = 0, waits = 0, selections = 0
    var writes: [(Int, String)] = []
    var sizes: [CGSize] = [], positions: [CGPoint] = []
    var sizeError: AXError = .success, positionError: AXError = .success
    var afterWrite: (() -> Void)?
    var afterRead: (() -> Void)?

    func source() -> WindowFrameSource<Int> {
      WindowFrameSource(
        trusted: { self.trusted }, allowedPID: { _ in self.allowed },
        windows: { _ in self.selections += 1; return self.windows },
        identity: { self.identities[$0] },
        cgFrame: { _, _ in self.reads += 1; let value = self.cg; self.afterRead?(); return value },
        canSetFrame: { _ in self.settable },
        setSize: { element, size in self.writes.append((element, "size")); self.sizes.append(size); return self.sizeError },
        setPosition: { element, point in self.writes.append((element, "position")); self.positions.append(point); self.afterWrite?(); return self.positionError },
        settle: { self.waits += 1 })
    }
  }

  func testOnlyExactWindowIsWrittenAndDelayedCGConvergenceSucceeds() {
    let tree = Tree()
    tree.afterWrite = { tree.afterRead = { tree.cg = self.request.frame } }
    let result = runWindowFrame(request, source: tree.source())
    XCTAssertEqual(tree.writes.map { $0.0 }, [2, 2])
    XCTAssertEqual(tree.writes.map { $0.1 }, ["size", "position"])
    XCTAssertEqual(tree.sizes, [request.frame.size])
    XCTAssertEqual(tree.positions, [request.frame.origin])
    XCTAssertEqual(tree.waits, 1)
    XCTAssertTrue(result.matched)
    XCTAssertEqual(result.readBack, request.frame)
    XCTAssertEqual(result.exitStatus, 0)
  }

  func testMissingAmbiguousUnknownAndWrongOwnerIdentityNeverWrites() {
    for identities: [Int: WindowFrameIdentity] in [
      [:], [1: .init(pid: 612, window: 91)],
      [1: .init(pid: 612, window: 92), 2: .init(pid: 612, window: 92)],
      [1: .init(pid: 612, window: 91), 2: .init(pid: 999, window: 92)],
    ] {
      let tree = Tree(); tree.identities = identities
      let result = runWindowFrame(request, source: tree.source())
      XCTAssertTrue(tree.writes.isEmpty)
      XCTAssertFalse(result.matched)
      XCTAssertEqual(result.exitStatus, 2)
    }
    let tree = Tree(); tree.windows = nil
    XCTAssertEqual(runWindowFrame(request, source: tree.source()).exitStatus, 2)
    XCTAssertTrue(tree.writes.isEmpty)
  }

  func testUntrustedDisallowedMissingCGAndUnsettableFailBeforeMutation() {
    for kind in 0..<4 {
      let tree = Tree()
      if kind == 0 { tree.trusted = false }
      if kind == 1 { tree.allowed = false }
      if kind == 2 { tree.cg = nil }
      if kind == 3 { tree.settable = false }
      let result = runWindowFrame(request, source: tree.source())
      XCTAssertFalse(result.matched)
      XCTAssertTrue(tree.writes.isEmpty)
      XCTAssertEqual(result.exitStatus, [3, 2, 2, 4][kind])
      if kind < 2 { XCTAssertEqual(tree.selections, 0) }
    }
  }

  func testIdentityIsRevalidatedBeforeEachWrite() {
    let tree = Tree()
    var source = tree.source()
    source.setSize = { element, _ in
      tree.writes.append((element, "size"))
      tree.identities[element] = .init(pid: 612, window: 93)
      return .success
    }
    XCTAssertEqual(runWindowFrame(request, source: source).exitStatus, 2)
    XCTAssertEqual(tree.writes.map { $0.1 }, ["size"])
  }

  func testFailedSizeDoesNotAttemptPositionAndFailedPositionCannotClaimSuccess() {
    let tree = Tree(); tree.sizeError = .cannotComplete
    XCTAssertEqual(runWindowFrame(request, source: tree.source()).exitStatus, 4)
    XCTAssertEqual(tree.writes.map { $0.1 }, ["size"])
    let other = Tree(); other.positionError = .cannotComplete; other.cg = request.frame
    let result = runWindowFrame(request, source: other.source())
    XCTAssertEqual(result.exitStatus, 4)
    XCTAssertEqual(result.readBack, request.frame)
    XCTAssertFalse(result.matched)
  }

  func testReadbackIsBoundedAndDoesNotConfuseAcceptedWritesWithMatchingFrame() {
    let tree = Tree()
    let result = runWindowFrame(request, source: tree.source())
    XCTAssertEqual(result.exitStatus, 5)
    XCTAssertFalse(result.matched)
    XCTAssertEqual(tree.waits, 10)
    XCTAssertEqual(tree.reads, 14, "initial identity proof, two write guards, eleven readback samples")
    XCTAssertEqual(result.readBack, CGRect(x: 10, y: 20, width: 400, height: 300))
  }

  func testWindowDisappearanceReturnsNullRatherThanStaleGeometry() {
    let tree = Tree(); tree.afterWrite = { tree.cg = nil }
    let result = runWindowFrame(request, source: tree.source())
    XCTAssertNil(result.readBack)
    XCTAssertEqual(result.exitStatus, 5)
    XCTAssertFalse(result.matched)
  }

  func testMatchingAllowsSubpointRoundingButNotOnePointOrInvalidGeometry() {
    XCTAssertTrue(windowFrameMatches(CGRect(x: -99.5, y: 40, width: 800, height: 600), request.frame))
    XCTAssertFalse(windowFrameMatches(CGRect(x: -99, y: 40, width: 800, height: 600), request.frame))
    XCTAssertFalse(windowFrameMatches(nil, request.frame))
    XCTAssertFalse(windowFrameMatches(CGRect(x: -100, y: 40, width: -800, height: 600), request.frame))
  }

  func testCGSelectionRequiresExactOwnerNumberAndOneLayerZeroRow() {
    func row(_ owner: Int, _ id: Int, _ layer: Int = 0) -> [String: Any] {
      [kCGWindowOwnerPID as String: owner, kCGWindowNumber as String: id, kCGWindowLayer as String: layer,
       kCGWindowBounds as String: CGRect(x: -100, y: 40, width: 800, height: 600).dictionaryRepresentation]
    }
    XCTAssertEqual(windowFrameCGEntry([row(999, 92), row(612, 92)], pid: 612, window: 92), request.frame)
    XCTAssertNil(windowFrameCGEntry([row(999, 92)], pid: 612, window: 92))
    XCTAssertNil(windowFrameCGEntry([row(612, 91)], pid: 612, window: 92))
    XCTAssertNil(windowFrameCGEntry([row(612, 92), row(612, 92)], pid: 612, window: 92))
    XCTAssertNil(windowFrameCGEntry([row(612, 92, -1)], pid: 612, window: 92))
  }

  func testWireAlwaysCarriesTheRequestedIdentityAndNullReadback() throws {
    let result = WindowFrameResult(readBack: nil, matched: false, exitStatus: 2)
    let wire = result.wire(for: request)
    XCTAssertEqual(Set(wire.keys), Set(["pid", "window", "requested", "readBack", "matched", "exitStatus"]))
    XCTAssertEqual(wire["pid"] as? Int, 612)
    XCTAssertEqual(wire["window"] as? UInt32, 92)
    XCTAssertEqual(wire["requested"] as? [String: Double], ["x": -100, "y": 40, "width": 800, "height": 600])
    XCTAssertTrue(wire["readBack"] is NSNull)
    XCTAssertEqual(wire["exitStatus"] as? Int, 2)
    XCTAssertNoThrow(try JSONSerialization.data(withJSONObject: wire))
  }
}
