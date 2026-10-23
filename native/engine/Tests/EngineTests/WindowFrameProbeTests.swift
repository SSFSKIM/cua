import ApplicationServices
import XCTest
@testable import Engine

// The exact-window geometry probe over a fake AXWindows tree and CG readback. No live AX/CG calls.
final class WindowFrameProbeTests: XCTestCase {
  private let arguments = ["--pid", "612", "--window", "92", "--frame", "-100,40,800,600"]
  private let request = WindowFrameRequest(pid: 612, window: 92, frame: CGRect(x: -100, y: 40, width: 800, height: 600))

  private func trace(_ result: WindowFrameResult) throws -> [String: Any] {
    try XCTUnwrap(result.wire(for: request)["trace"] as? [String: Any])
  }

  private func samples(_ result: WindowFrameResult, stage: String) throws -> [[String: Any]] {
    let rows = try XCTUnwrap(try trace(result)["samples"] as? [[String: Any]])
    return rows.filter { $0["stage"] as? String == stage }
  }

  func testDelayedFullFrameCommitCannotBeOverwrittenByPositionUsingStaleSize() throws {
    let tree = Tree(); tree.applySize = false
    var pending: CGRect?
    var positionCalled = false
    var source = tree.source()
    source.setSize = { element, size in
      tree.writes.append((element, "size"))
      pending = CGRect(origin: tree.cg!.origin, size: size)
      tree.timeMs += 3
      return .success
    }
    source.setPosition = { element, point in
      tree.writes.append((element, "position")); positionCalled = true
      // Models two async full-frame commits: an immediate position write would capture old size
      // and replace the pending resize. The production barrier must make that impossible.
      pending = CGRect(origin: point, size: tree.cg!.size)
      tree.timeMs += 7
      return .success
    }
    source.settle = {
      tree.waits += 1; tree.timeMs += 50
      if positionCalled || tree.waits >= 2 { tree.cg = pending }
    }
    let result = runWindowFrame(request, source: source)
    XCTAssertEqual(result.exitStatus, 0)
    XCTAssertTrue(result.matched)
    XCTAssertEqual(result.readBack, request.frame)
    XCTAssertEqual(tree.writes.map { $0.1 }, ["size", "position"])
    XCTAssertEqual(tree.waits, 3)
    let setters = try XCTUnwrap(try trace(result)["setters"] as? [[String: Any]])
    XCTAssertEqual(setters.map { $0["attribute"] as? String }, ["size", "position"])
    XCTAssertEqual(setters[0]["startMs"] as? Double, 0)
    XCTAssertEqual(setters[0]["endMs"] as? Double, 3)
    XCTAssertEqual(setters[1]["startMs"] as? Double, 103)
    XCTAssertEqual(setters[1]["endMs"] as? Double, 110)
    let intermediate = try samples(result, stage: "after-size")
    XCTAssertTrue(intermediate.contains { ($0["atMs"] as? Double) == 53 })
    XCTAssertTrue(intermediate.contains { ($0["frame"] as? [String: Double])?["height"] == 600 })
    XCTAssertEqual(try samples(result, stage: "final").last?["atMs"] as? Double, 160)
  }

  func testSizeNeverConvergesStopsBeforePositionWithDistinctStatusAndBoundedTrace() throws {
    let tree = Tree(); tree.applySize = false
    let result = runWindowFrame(request, source: tree.source())
    XCTAssertEqual(result.exitStatus, 6)
    XCTAssertFalse(result.matched)
    XCTAssertEqual(diagnostic(result)["stage"] as? String, "size-convergence")
    XCTAssertEqual(diagnostic(result)["reason"] as? String, "size-not-converged")
    XCTAssertEqual(tree.writes.map { $0.1 }, ["size"])
    XCTAssertEqual(tree.waits, 10)
    XCTAssertEqual(try samples(result, stage: "after-size").count, 11)
    XCTAssertEqual(try samples(result, stage: "final").count, 0)
    XCTAssertEqual(result.readBack, CGRect(x: 10, y: 20, width: 400, height: 300))
    XCTAssertEqual(try samples(result, stage: "after-size").last?["atMs"] as? Double, 500)
  }

  func testSizeBarrierUsesBothDimensionsAndSubpointToleranceWithoutOriginMatching() {
    for delta in [0.5, 1.0] {
      for widthChanged in [false, true] {
        let tree = Tree(); tree.applySize = false
        var source = tree.source()
        source.setSize = { element, size in
          tree.writes.append((element, "size"))
          tree.cg = CGRect(x: 700, y: 900, width: size.width + (widthChanged ? delta : 0),
                           height: size.height + (widthChanged ? 0 : delta))
          return .success
        }
        tree.afterWrite = { tree.cg = self.request.frame }
        let result = runWindowFrame(request, source: source)
        XCTAssertEqual(result.exitStatus, delta < 1 ? 0 : 6)
        XCTAssertEqual(tree.writes.map { $0.1 }, delta < 1 ? ["size", "position"] : ["size"])
      }
    }
  }

  func testIdentityLossWhileWaitingForSizeNeverMovesOrReselects() throws {
    for kind in ["role", "identity", "pid", "cg"] {
      let tree = Tree(); tree.applySize = false
      var source = tree.source()
      source.settle = {
        tree.waits += 1; tree.timeMs += 50
        switch kind {
        case "role": tree.roles[2] = "AXGroup"
        case "identity": tree.identities[2] = .init(pid: 612, window: 93)
        case "pid": tree.allowed = false
        default: tree.cg = nil
        }
      }
      let result = runWindowFrame(request, source: source)
      XCTAssertEqual(result.exitStatus, 2)
      XCTAssertEqual(tree.writes.map { $0.1 }, ["size"])
      XCTAssertEqual(tree.selections, 1)
      XCTAssertEqual(tree.waits, 1)
      XCTAssertFalse(try samples(result, stage: "after-size").isEmpty)
      if kind == "cg" {
        XCTAssertNil(result.readBack)
        XCTAssertTrue(try samples(result, stage: "after-size").last?["frame"] is NSNull)
      }
    }
  }

  func testSizeAppliedThenLostIsDistinguishableFromNeverAppliedAndFinalBoundIsUnchanged() throws {
    let tree = Tree()
    tree.afterWrite = { tree.cg = CGRect(x: -100, y: 40, width: 800, height: 968) }
    let result = runWindowFrame(request, source: tree.source())
    XCTAssertEqual(result.exitStatus, 5)
    XCTAssertEqual(tree.writes.map { $0.1 }, ["size", "position"])
    XCTAssertEqual(tree.waits, 10)
    let afterSize = try samples(result, stage: "after-size")
    XCTAssertTrue(afterSize.contains { ($0["frame"] as? [String: Double])?["height"] == 600 })
    let final = try samples(result, stage: "final")
    XCTAssertEqual(final.count, 11)
    XCTAssertTrue(final.allSatisfy { ($0["frame"] as? [String: Double])?["height"] == 968 })
  }

  func testTraceRetainsSetterFailureTimingAndOnlyGeometryMetadata() throws {
    for failSize in [false, true] {
      let tree = Tree()
      var source = tree.source()
      if failSize {
        source.setSize = { _, _ in tree.timeMs += 4; return .cannotComplete }
      } else {
        source.setPosition = { _, _ in tree.timeMs += 9; return .cannotComplete }
      }
      let result = runWindowFrame(request, source: source)
      XCTAssertEqual(result.exitStatus, 4)
      let metadata = try trace(result)
      XCTAssertEqual(Set(metadata.keys), Set(["samples", "setters"]))
      let rows = try XCTUnwrap(metadata["samples"] as? [[String: Any]])
      XCTAssertLessThanOrEqual(rows.count, 25)
      XCTAssertFalse(rows.isEmpty)
      for row in rows {
        XCTAssertEqual(Set(row.keys), Set(["stage", "atMs", "frame"]))
        XCTAssertTrue(["initial", "after-size", "final"].contains(row["stage"] as? String ?? ""))
        if let frame = row["frame"] as? [String: Double] {
          XCTAssertEqual(Set(frame.keys), Set(["x", "y", "width", "height"]))
        } else { XCTAssertTrue(row["frame"] is NSNull) }
      }
      let setters = try XCTUnwrap(metadata["setters"] as? [[String: Any]])
      XCTAssertEqual(setters.count, failSize ? 1 : 2)
      for setter in setters { XCTAssertEqual(Set(setter.keys), Set(["attribute", "startMs", "endMs", "axError"])) }
      XCTAssertEqual(setters.last?["axError"] as? Int, Int(AXError.cannotComplete.rawValue))
      XCTAssertEqual(setters.last?["endMs"] as? Double, failSize ? 4 : 9)
      XCTAssertNoThrow(try JSONSerialization.data(withJSONObject: result.wire(for: request)))
    }
  }

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
    var roles: [Int: String] = [1: "AXWindow", 2: "AXWindow"]
    var subroles: [Int: String] = [:]
    var identityReads: [Int] = []
    var trusted = true, allowed = true, settable = true
    var cg: CGRect? = CGRect(x: 10, y: 20, width: 400, height: 300)
    var reads = 0, waits = 0, selections = 0
    var timeMs: Double = 10_000
    var applySize = true
    var writes: [(Int, String)] = []
    var sizes: [CGSize] = [], positions: [CGPoint] = []
    var sizeError: AXError = .success, positionError: AXError = .success
    var afterWrite: (() -> Void)?
    var afterRead: (() -> Void)?

    func source() -> WindowFrameSource<Int> {
      WindowFrameSource(
        trusted: { self.trusted }, allowedPID: { _ in self.allowed },
        windows: { _ in self.selections += 1; return self.windows },
        identity: { self.identityReads.append($0); return self.identities[$0] },
        cgFrame: { _, _ in self.reads += 1; let value = self.cg; self.afterRead?(); return value },
        canSetFrame: { _ in self.settable },
        setSize: { element, size in
          self.writes.append((element, "size")); self.sizes.append(size)
          if self.applySize && self.sizeError == .success { self.cg?.size = size }
          return self.sizeError
        },
        setPosition: { element, point in self.writes.append((element, "position")); self.positions.append(point); self.afterWrite?(); return self.positionError },
        settle: { self.waits += 1; self.timeMs += 50 },
        role: { self.roles[$0] }, subrole: { self.subroles[$0] }, now: { self.timeMs })
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
    XCTAssertEqual(tree.reads, 15, "initial identity proof, two write guards, one size sample, eleven final samples")
    XCTAssertEqual(result.readBack, CGRect(x: 10, y: 20, width: 800, height: 600))
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

  // Pin behavior at the JSON boundary so the tests-first revision compiles against the old probe.
  // Dropping or conflating a refusal stage must fail without calling AX or touching a real window.
  private func diagnostic(_ result: WindowFrameResult) -> [String: Any] {
    result.wire(for: request)["diagnostic"] as? [String: Any] ?? [:]
  }

  func testWindowListRefusalsAreDistinctFromNumberMatchingAndNeverWrite() {
    let cases: [([Int]?, String)] = [(nil, "unavailable"), ([], "empty"), (Array(1...129), "limit-exceeded")]
    for (windows, reason) in cases {
      let tree = Tree(); tree.windows = windows
      let result = runWindowFrame(request, source: tree.source())
      XCTAssertEqual(diagnostic(result)["stage"] as? String, "ax-window-list")
      XCTAssertEqual(diagnostic(result)["reason"] as? String, reason)
      XCTAssertEqual(diagnostic(result)["windowCount"] as? Int, windows?.count)
      XCTAssertEqual(result.exitStatus, 2)
      XCTAssertFalse(result.matched)
      XCTAssertTrue(tree.writes.isEmpty)
    }
  }

  func testNumberMatchingReportsUnknownWrongOwnerZeroMissingAndDuplicateWithoutFallback() {
    let cases: [([Int: WindowFrameIdentity], String, Int?)] = [
      ([2: .init(pid: 612, window: 92)], "unknown-identity", nil),
      ([1: .init(pid: 612, window: 92)], "unknown-identity", nil),
      ([1: .init(pid: 999, window: 91), 2: .init(pid: 612, window: 92)], "wrong-owner", nil),
      ([1: .init(pid: 612, window: 0), 2: .init(pid: 612, window: 92)], "invalid-number", nil),
      ([1: .init(pid: 612, window: 91), 2: .init(pid: 612, window: 93)], "no-match", 0),
      ([1: .init(pid: 612, window: 92), 2: .init(pid: 612, window: 92)], "ambiguous-match", 2),
    ]
    for (identities, reason, count) in cases {
      let tree = Tree(); tree.identities = identities
      let result = runWindowFrame(request, source: tree.source())
      XCTAssertEqual(diagnostic(result)["stage"] as? String, "ax-number-match")
      XCTAssertEqual(diagnostic(result)["reason"] as? String, reason)
      XCTAssertEqual(diagnostic(result)["windowCount"] as? Int, 2)
      XCTAssertEqual(diagnostic(result)["matchCount"] as? Int, count)
      XCTAssertEqual(result.exitStatus, 2)
      XCTAssertFalse(result.matched)
      XCTAssertTrue(tree.writes.isEmpty)
    }
  }

  func testRecheckReportsWhichIdentityProofFailedAndWhetherSizeWasAlreadyWritten() {
    for beforePosition in [false, true] {
      for reason in ["disallowed-pid", "ax-identity-changed", "cg-window-unavailable"] {
        let tree = Tree()
        let invalidate = {
          switch reason {
          case "disallowed-pid": tree.allowed = false
          case "ax-identity-changed": tree.identities[2] = .init(pid: 612, window: 93)
          default: tree.cg = nil
          }
        }
        var source = tree.source()
        if beforePosition {
          source.setSize = { element, _ in tree.writes.append((element, "size")); invalidate(); return .success }
        } else {
          source.canSetFrame = { _ in invalidate(); return true }
        }
        let result = runWindowFrame(request, source: source)
        XCTAssertEqual(diagnostic(result)["stage"] as? String,
                       beforePosition ? "identity-recheck-before-position" : "identity-recheck-before-size")
        XCTAssertEqual(diagnostic(result)["reason"] as? String, reason)
        XCTAssertEqual(result.exitStatus, 2)
        XCTAssertFalse(result.matched)
        XCTAssertEqual(tree.writes.map { $0.1 }, beforePosition ? ["size"] : [])
        XCTAssertEqual(tree.selections, 1, "a failed recheck must not reselect")
      }
    }
  }

  func testInitialIdentityRefusalsCannotBeMistakenForAXWindowListFailure() {
    for allowed in [false, true] {
      let tree = Tree(); tree.allowed = allowed; tree.cg = nil
      let result = runWindowFrame(request, source: tree.source())
      XCTAssertEqual(diagnostic(result)["stage"] as? String, "initial-identity")
      XCTAssertEqual(diagnostic(result)["reason"] as? String, allowed ? "cg-window-unavailable" : "disallowed-pid")
      XCTAssertEqual(result.exitStatus, 2)
      XCTAssertEqual(tree.selections, 0)
      XCTAssertTrue(tree.writes.isEmpty)
    }
  }

  func testDiagnosticsSerializeOnlyAllowlistedMetadataAndPreserveRequestedIdentity() throws {
    let tree = Tree(); tree.identities[1] = nil
    let wire = runWindowFrame(request, source: tree.source()).wire(for: request)
    let data = try JSONSerialization.data(withJSONObject: wire)
    let decoded = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    XCTAssertEqual(Set(decoded.keys), Set(["pid", "window", "requested", "readBack", "matched", "exitStatus", "diagnostic", "excludedEntries", "trace"]))
    XCTAssertEqual(decoded["pid"] as? Int, 612)
    XCTAssertEqual(decoded["window"] as? Int, 92)
    let details = try XCTUnwrap(decoded["diagnostic"] as? [String: Any])
    XCTAssertEqual(Set(details.keys), Set(["stage", "reason", "windowCount", "unknownEntry"]))
    XCTAssertEqual(details["stage"] as? String, "ax-number-match")
    XCTAssertEqual(details["reason"] as? String, "unknown-identity")
    XCTAssertEqual(details["windowCount"] as? Int, 2)
  }

  func testSuccessAndNonIdentityFailuresDoNotInventIdentityDiagnostics() {
    let success = Tree(); success.afterWrite = { success.cg = self.request.frame }
    let untrusted = Tree(); untrusted.trusted = false
    let unsettable = Tree(); unsettable.settable = false
    let sizeFailure = Tree(); sizeFailure.sizeError = .cannotComplete
    let positionFailure = Tree(); positionFailure.positionError = .cannotComplete
    for tree in [success, untrusted, unsettable, sizeFailure, positionFailure, Tree()] {
      let result = runWindowFrame(request, source: tree.source())
      XCTAssertTrue(result.wire(for: request)["diagnostic"] is NSNull)
    }
  }

  func testPositiveNonwindowRolesAreExcludedWithoutIdentityReadsAndOnlyExactWindowIsWritten() throws {
    for role in ["AXScrollArea", "AXGroup", "CustomRole-user-content"] {
      let tree = Tree(); tree.roles[1] = role; tree.subroles[1] = "AXDesktop"
      tree.identities[1] = nil
      tree.afterWrite = { tree.cg = self.request.frame }
      let result = runWindowFrame(request, source: tree.source())
      XCTAssertTrue(result.matched)
      XCTAssertEqual(result.exitStatus, 0)
      XCTAssertEqual(tree.writes.map { $0.0 }, [2, 2])
      XCTAssertEqual(tree.writes.map { $0.1 }, ["size", "position"])
      XCTAssertFalse(tree.identityReads.contains(1), "positive nonwindows must not enter window identity resolution")
      let entries = try XCTUnwrap(result.wire(for: request)["excludedEntries"] as? [[String: Any]])
      XCTAssertEqual(entries.count, 1)
      let entry = try XCTUnwrap(entries.first)
      XCTAssertEqual(Set(entry.keys), Set(["index", "role", "subrole"]))
      XCTAssertEqual(entry["index"] as? Int, 0)
      XCTAssertEqual(entry["role"] as? String, role.hasPrefix("CustomRole") ? "other" : role)
      XCTAssertEqual(entry["subrole"] as? String, "AXDesktop")
    }
  }

  func testMissingRoleCannotBeExcludedEvenWhenItsIdentityMatchesOrIsUnknown() throws {
    for identity: WindowFrameIdentity? in [nil, .init(pid: 612, window: 92)] {
      for role: String? in [nil, ""] {
        let tree = Tree(); tree.roles[1] = role; tree.identities[1] = identity
        let result = runWindowFrame(request, source: tree.source())
        XCTAssertEqual(result.exitStatus, 2)
        XCTAssertTrue(tree.writes.isEmpty)
        XCTAssertFalse(tree.identityReads.contains(1))
        let entry = try XCTUnwrap(diagnostic(result)["unknownEntry"] as? [String: Any])
        XCTAssertEqual(entry["index"] as? Int, 0)
        XCTAssertEqual(entry["role"] as? String, "unknown")
        XCTAssertEqual(entry["subrole"] as? String, "unknown")
      }
    }
  }

  func testExclusionDoesNotHideUnknownWindowDuplicateWrongOwnerOrInvalidNumber() throws {
    for identities: [Int: WindowFrameIdentity] in [
      [2: .init(pid: 612, window: 92)],
      [2: .init(pid: 612, window: 92), 3: .init(pid: 612, window: 92)],
      [2: .init(pid: 612, window: 92), 3: .init(pid: 999, window: 93)],
      [2: .init(pid: 612, window: 92), 3: .init(pid: 612, window: 0)],
    ] {
      let tree = Tree(); tree.windows = [1, 2, 3]
      tree.roles = [1: "AXScrollArea", 2: "AXWindow", 3: "AXWindow"]
      tree.identities = identities
      let result = runWindowFrame(request, source: tree.source())
      XCTAssertEqual(result.exitStatus, 2)
      XCTAssertTrue(tree.writes.isEmpty)
      let entries = try XCTUnwrap(result.wire(for: request)["excludedEntries"] as? [[String: Any]])
      XCTAssertEqual(entries.count, 1)
      XCTAssertEqual(entries.first?["index"] as? Int, 0)
      if identities[3] == nil {
        let entry = try XCTUnwrap(diagnostic(result)["unknownEntry"] as? [String: Any])
        XCTAssertEqual(entry["index"] as? Int, 2, "index is in AXWindows, not the filtered list")
        XCTAssertEqual(entry["role"] as? String, "AXWindow")
      }
    }
  }

  func testOnlyNonwindowsCannotBecomeATargetEvenIfTheirNumbersMatch() throws {
    let tree = Tree(); tree.roles = [1: "AXScrollArea", 2: "AXGroup"]
    tree.identities[1] = .init(pid: 612, window: 92)
    let result = runWindowFrame(request, source: tree.source())
    XCTAssertEqual(result.exitStatus, 2)
    XCTAssertEqual(diagnostic(result)["reason"] as? String, "no-match")
    XCTAssertEqual(diagnostic(result)["matchCount"] as? Int, 0)
    XCTAssertTrue(tree.writes.isEmpty)
    XCTAssertTrue(tree.identityReads.isEmpty)
    let entries = try XCTUnwrap(result.wire(for: request)["excludedEntries"] as? [[String: Any]])
    XCTAssertEqual(entries.count, 2)
  }

  func testRoleIsRecheckedOnTheSameTargetBeforeBothWrites() throws {
    for beforePosition in [false, true] {
      for role: String? in [nil, "AXScrollArea"] {
        let tree = Tree(); tree.roles[1] = "AXScrollArea"; tree.identities[1] = nil
        var source = tree.source()
        if beforePosition {
          source.setSize = { element, _ in
            tree.writes.append((element, "size")); tree.roles[element] = role; return .success
          }
        } else {
          source.canSetFrame = { element in tree.roles[element] = role; return true }
        }
        let result = runWindowFrame(request, source: source)
        XCTAssertEqual(result.exitStatus, 2)
        XCTAssertEqual(diagnostic(result)["stage"] as? String,
                       beforePosition ? "identity-recheck-before-position" : "identity-recheck-before-size")
        XCTAssertEqual(tree.writes.map { $0.1 }, beforePosition ? ["size"] : [])
        XCTAssertEqual(tree.selections, 1)
        let entry = try XCTUnwrap(diagnostic(result)["unknownEntry"] as? [String: Any])
        XCTAssertEqual(entry["index"] as? Int, 1)
        XCTAssertEqual(entry["role"] as? String, role ?? "unknown")
      }
    }
  }

  func testExcludedMetadataSurvivesWriteAndReadbackFailuresAndNeverLeaksCustomStrings() throws {
    for status in [4, 5] {
      let tree = Tree(); tree.roles[1] = "PRIVATE-role"; tree.subroles[1] = "PRIVATE-subrole"
      tree.identities[1] = nil
      if status == 4 { tree.sizeError = .cannotComplete }
      let result = runWindowFrame(request, source: tree.source())
      XCTAssertEqual(result.exitStatus, Int32(status))
      let wire = result.wire(for: request)
      let entries = try XCTUnwrap(wire["excludedEntries"] as? [[String: Any]])
      XCTAssertEqual(entries.first?["role"] as? String, "other")
      XCTAssertEqual(entries.first?["subrole"] as? String, "other")
      let json = String(decoding: try JSONSerialization.data(withJSONObject: wire), as: UTF8.self)
      XCTAssertFalse(json.contains("PRIVATE"))
    }
    let tree = Tree(); tree.identities[1] = nil; tree.subroles[1] = "PRIVATE-subrole"
    let wire = runWindowFrame(request, source: tree.source()).wire(for: request)
    let json = String(decoding: try JSONSerialization.data(withJSONObject: wire), as: UTF8.self)
    XCTAssertFalse(json.contains("PRIVATE"))
  }

  func testExclusionMetadataIsBoundedByTheEnumerationLimit() throws {
    let tree = Tree(); tree.windows = Array(1...128)
    tree.roles = Dictionary(uniqueKeysWithValues: (1...128).map { ($0, "AXGroup") })
    let result = runWindowFrame(request, source: tree.source())
    XCTAssertEqual(result.exitStatus, 2)
    XCTAssertTrue(tree.writes.isEmpty)
    let entries = try XCTUnwrap(result.wire(for: request)["excludedEntries"] as? [[String: Any]])
    XCTAssertEqual(entries.count, 128)
    XCTAssertEqual(entries.last?["index"] as? Int, 127)
    tree.windows = Array(1...129)
    let oversized = runWindowFrame(request, source: tree.source())
    XCTAssertEqual(diagnostic(oversized)["reason"] as? String, "limit-exceeded")
    XCTAssertEqual((oversized.wire(for: request)["excludedEntries"] as? [[String: Any]])?.count, 0)
  }

  func testUnknownIdentityIdentifiesTheOriginalEntryWithoutDisclosingOtherWindowIdentity() throws {
    for index in [0, 1] {
      let tree = Tree(); tree.identities[index + 1] = nil
      let result = runWindowFrame(request, source: tree.source())
      XCTAssertEqual(result.exitStatus, 2)
      XCTAssertTrue(tree.writes.isEmpty)
      let entry = try XCTUnwrap(diagnostic(result)["unknownEntry"] as? [String: Any])
      XCTAssertEqual(Set(entry.keys), Set(["index", "role", "subrole"]))
      XCTAssertEqual(entry["index"] as? Int, index)
      XCTAssertEqual(entry["role"] as? String, "AXWindow")
      XCTAssertEqual(entry["subrole"] as? String, "unknown")
      XCTAssertNoThrow(try JSONSerialization.data(withJSONObject: result.wire(for: request)))
    }
  }

  func testResultsRetainAnExplicitEmptyExclusionListWhenNothingWasExcluded() throws {
    let success = Tree(); success.afterWrite = { success.cg = self.request.frame }
    let unknown = Tree(); unknown.identities[1] = nil
    let untrusted = Tree(); untrusted.trusted = false
    let unsettable = Tree(); unsettable.settable = false
    let sizeFailure = Tree(); sizeFailure.sizeError = .cannotComplete
    let positionFailure = Tree(); positionFailure.positionError = .cannotComplete
    for tree in [success, unknown, untrusted, unsettable, sizeFailure, positionFailure, Tree()] {
      let result = runWindowFrame(request, source: tree.source())
      let excluded = try XCTUnwrap(result.wire(for: request)["excludedEntries"] as? [[String: Any]])
      XCTAssertTrue(excluded.isEmpty)
    }
  }

  func testWireAlwaysCarriesTheRequestedIdentityAndNullReadback() throws {
    let result = WindowFrameResult(readBack: nil, matched: false, exitStatus: 2)
    let wire = result.wire(for: request)
    XCTAssertEqual(Set(wire.keys), Set(["pid", "window", "requested", "readBack", "matched", "exitStatus", "diagnostic", "excludedEntries", "trace"]))
    XCTAssertEqual(wire["pid"] as? Int, 612)
    XCTAssertEqual(wire["window"] as? UInt32, 92)
    XCTAssertEqual(wire["requested"] as? [String: Double], ["x": -100, "y": 40, "width": 800, "height": 600])
    XCTAssertTrue(wire["readBack"] is NSNull)
    XCTAssertEqual(wire["exitStatus"] as? Int, 2)
    XCTAssertNoThrow(try JSONSerialization.data(withJSONObject: wire))
  }
}
