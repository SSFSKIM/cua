import ApplicationServices
import XCTest
@testable import Engine

// #582 (rulings 1202 and 1206): where keyboard events go. The vendor's walk (KeyTarget.swift) over a fake tree, its time
// budget, the engine's keyboard target through its reads (read again after an activation, refused when forbidden on
// either read), the deadline before the first key, and the fallback with `_AXUIElementGetActualPid` forced missing.

/// A fake tree: element n's parent is n + 1 up to `root`, each with its actual pid (nil: unreadable).
private struct FakeChain {
  var actual: [Int: pid_t?]
  var root: Int
  func parent(_ element: Int, _ leftMs: Double) -> Int? { element < root ? element + 1 : nil }
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
  /// parents), with no read of a parent it would not inspect.
  func testTheWalkIsBoundedByDepth() {
    var reads = 0, parents = 0
    let looped = remoteViewKeyOwner(of: 0, appPid: app, parent: { element, _ in parents += 1; return element },
                                    actualPid: { _ in reads += 1; return self.gone }, kind: kind)
    XCTAssertNil(looped)
    XCTAssertEqual(reads, 301)
    XCTAssertEqual(parents, 300, "the 301st element's parent is never read")
    XCTAssertNil(walk(FakeChain(actual: [0: nil, 1: gone], root: 1)))
  }

  /// Ruling 1206: the walk stops before another parent read once its time is spent. Each parent read here takes 100 ms
  /// of a 250 ms budget: three are read (given 250, 150 and 50 ms), none after, so a service at depth 5 is not reached
  /// and the keys stay with the public owner.
  func testTheTimeBudgetStopsTheWalk() {
    var clock = 0.0
    var given: [Double] = []
    var actual: [Int: pid_t?] = [:]
    for depth in 0...4 { actual[depth] = gone }
    actual[5] = service
    let chain = FakeChain(actual: actual, root: 6)
    let cutoff = clock + 250
    let owner = remoteViewKeyOwner(of: 0, appPid: app, parent: { element, left in
      given.append(left)
      clock += 100
      return chain.parent(element, left)
    }, actualPid: chain.actualPid, kind: kind, leftMs: { cutoff - clock })
    XCTAssertNil(owner)
    XCTAssertEqual(given, [250, 150, 50])
    // With time enough the same chain reaches the service.
    XCTAssertEqual(remoteViewKeyOwner(of: 0, appPid: app, parent: chain.parent, actualPid: chain.actualPid, kind: kind), service)
  }

  /// The reads' clock bounds the engine's walk by `keyTargetWalkBudgetMs`, and by the request's deadline: one already
  /// past reads no parent at all, so only the focused element itself is inspected.
  func testTheEnginesWalkIsBoundedByTheBudgetAndTheDeadline() {
    let tree = FakeAXTree(app: app, service: service)
    tree.actual[0] = gone  // the service is one parent up
    var parents: [Double] = []
    var clock = 0.0
    var reads = tree.reads
    let parent = reads.parent
    reads.now = { clock }
    reads.parent = { element, left in parents.append(left); clock += 200; return parent(element, left) }
    XCTAssertEqual(engine(reads).keyboardTarget(tree.application, fallback: app, deadline: unixMilliseconds() + 60_000), service)
    XCTAssertEqual(parents, [keyTargetWalkBudgetMs])
    parents = []
    XCTAssertEqual(engine(reads).keyboardTarget(tree.application, fallback: app, deadline: unixMilliseconds() - 1), app,
                   "past the deadline: no parent read, the public owner")
    XCTAssertEqual(parents, [])
    XCTAssertEqual(keyTargetWalkBudgetMs, 250)
  }

  /// Ruling 1206: keys whose request is past its deadline are refused, never posted late.
  func testKeysPastTheDeadlineAreRefused() {
    XCTAssertThrowsError(try refuseLateKeys(deadline: 1_000, now: { 1_000 })) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "timeoutReached")
      XCTAssertTrue(($0 as? EngineError)?.message.contains("Nothing was sent") == true)
    }
    XCTAssertNoThrow(try refuseLateKeys(deadline: 1_001, now: { 1_000 }))
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

  /// Resolution through an injected lookup: the symbol's name is asked for; a function found is read as the element's
  /// pid, a failed call as none; nothing found leaves it missing, and the live reads then make no walk.
  func testResolutionThroughAnInjectedFunction() throws {
    let answers: ActualPid.Function = { _, pid in pid.pointee = 4242; return .success }
    let fails: ActualPid.Function = { _, _ in .failure }
    var asked: [String] = []
    let found = try XCTUnwrap(ActualPid.resolve { asked.append($0); return unsafeBitCast(answers, to: UnsafeMutableRawPointer.self) })
    XCTAssertEqual(asked, ["_AXUIElementGetActualPid"])
    let element = AXUIElementCreateApplication(70_100)
    XCTAssertEqual(ActualPid.read(found)(element), 4242)
    let failing = try XCTUnwrap(ActualPid.resolve { _ in unsafeBitCast(fails, to: UnsafeMutableRawPointer.self) })
    XCTAssertNil(ActualPid.read(failing)(element))
    XCTAssertNil(ActualPid.resolve { _ in nil })
    XCTAssertNil(KeyTargetReads.live(actualPid: nil).actualPid)
    XCTAssertEqual(KeyTargetReads.live(actualPid: answers).actualPid?(element), 4242)
  }

  /// The live reads agree with the live resolution, whether or not this macOS exports the symbol, and the resolution
  /// with what dlsym finds.
  func testTheLiveReadsAgreeWithTheLiveResolution() {
    let exported = dlsym(UnsafeMutableRawPointer(bitPattern: -2), ActualPid.symbol) != nil
    XCTAssertEqual(ActualPid.resolved != nil, exported)
    XCTAssertEqual(ActualPid.resolve() != nil, exported)
    XCTAssertEqual(KeyTargetReads.live().actualPid != nil, exported)
    XCTAssertEqual(engine(.live()).status(ConnectionState(id: 1, fd: -1))["actualPid"] as? Bool, exported)
  }

  /// The hosted runner's canary: GitHub's macOS still exports the symbol. Skipped anywhere else (a self-hosted runner sets
  /// GITHUB_ACTIONS too, so the runner's environment decides), where its absence is the fallback's case, not a failure.
  func testTheHostedMacOSExportsTheSymbol() throws {
    try XCTSkipUnless(ProcessInfo.processInfo.environment["RUNNER_ENVIRONMENT"] == "github-hosted", "the canary runs on GitHub's hosted runner only")
    XCTAssertNotNil(ActualPid.resolved, "\(ActualPid.symbol) is exported by this macOS")
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

  /// Ruling 1206: the keys' process is read again after the activation, both ways (a document's focus moved into its
  /// panel, the panel's back to the document): the final read names the process the keys go to, and the detector drives
  /// it; the early read only refuses.
  func testTheFinalReadFollowsFocusAcrossTheActivation() throws {
    let tree = FakeAXTree(app: app, service: service)
    let keys = engine(tree.reads)
    tree.focus.index = 3  // the document's window: the app's
    XCTAssertNoThrow(try keys.earlyKeyTarget(tree.application, pid: app, app: textEdit, context: context()))
    tree.focus.index = 0  // the activation brought the panel's list into focus
    XCTAssertEqual(try keys.finalKeyTarget(tree.application, pid: app, app: textEdit, context: context()).pid, service)

    tree.focus.index = 0
    XCTAssertNoThrow(try keys.earlyKeyTarget(tree.application, pid: app, app: textEdit, context: context()))
    tree.focus.index = 3  // and back to the document
    XCTAssertEqual(try keys.finalKeyTarget(tree.application, pid: app, app: textEdit, context: context()).pid, app)
  }

  /// A forbidden process on either read refuses: the early one before anything is touched, the final one after the
  /// activation, before any key.
  func testAForbiddenOwnerOnEitherReadRefuses() {
    let tree = FakeAXTree(app: app, service: service)
    var reads = tree.reads
    reads.refuseForbidden = { if $0 == self.service { throw EngineError(name: "appForbidden", "forbidden") } }
    let keys = engine(reads)
    tree.focus.index = 0
    XCTAssertThrowsError(try keys.earlyKeyTarget(tree.application, pid: app, app: textEdit, context: context())) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "appForbidden", "the early read")
    }
    tree.focus.index = 3
    XCTAssertNoThrow(try keys.earlyKeyTarget(tree.application, pid: app, app: textEdit, context: context()))
    tree.focus.index = 0
    XCTAssertThrowsError(try keys.finalKeyTarget(tree.application, pid: app, app: textEdit, context: context())) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "appForbidden", "the final read")
    }
  }

  /// press_key, type_text (both routes) and paste take their keys' process from `keyboardTarget(_:fallback:)`: through
  /// the engine's reads, a focused element in a remote view goes to its service; an ordinary focused element keeps its
  /// public owner; no focused element keeps the app.
  func testTheEnginesKeyboardTargetTakesTheRemoteViewsService() {
    let tree = FakeAXTree(app: app, service: service)
    XCTAssertEqual(engine(tree.reads).keyboardTarget(tree.application, fallback: app), service)

    tree.focus.index = 3  // the window: the app's own element
    XCTAssertEqual(engine(tree.reads).keyboardTarget(tree.application, fallback: app), app)

    tree.focus.index = nil
    XCTAssertEqual(engine(tree.reads).keyboardTarget(tree.application, fallback: app), app)
  }

  /// Ruling 1207: both reads drive their process for the app (the early one before the lock and activation, so a key
  /// the person types into the panel meanwhile is seen), and only the final read's gets the keys.
  func testBothReadsDriveTheirProcessForTheApp() throws {
    let tree = FakeAXTree(app: app, service: service)
    let keys = Engine(paths: ServerPaths(socket: "/tmp/x.sock", directory: "/tmp", lock: "/tmp/x.lock", usage: "/tmp/cua-engine-test-usage.json"),
                      intervention: InterventionMonitor(listenGranted: { true }, createsTap: false), screenLocked: { false },
                      keyTargetReads: tree.reads)
    let context = context()
    _ = keys.interventionGuard(app: textEdit, pid: app, requestApp: nil, connection: context.connection)
    tree.focus.index = 0
    XCTAssertEqual(try keys.earlyKeyTarget(tree.application, pid: app, app: textEdit, context: context), service)
    XCTAssertEqual(context.connection.interventionProcesses[textEdit.key], [app, service], "the early owner is driven")
    XCTAssertTrue(keys.intervention.ledger.isDriven(service))
  }

  /// The walk reports a stop at its time (`walkCutOff`), and only that: not an answer, not the chain's end.
  func testTheTargetSaysWhenItsWalkWasCutOff() {
    let tree = FakeAXTree(app: app, service: service)
    tree.actual[0] = gone
    var clock = 0.0
    var reads = tree.reads
    let parent = reads.parent
    reads.now = { clock }
    reads.parent = { element, left in clock += 300; return parent(element, left) }
    XCTAssertEqual(reads.target(tree.application, appPid: app), KeyTarget(pid: service, walkCutOff: false), "the first read answers")
    tree.actual[1] = gone
    clock = 0
    XCTAssertEqual(reads.target(tree.application, appPid: app), KeyTarget(pid: app, walkCutOff: true), "cut off after one read")
    clock = 0
    var quick = tree.reads
    quick.now = { clock }
    XCTAssertEqual(quick.target(tree.application, appPid: app), KeyTarget(pid: app, walkCutOff: false), "the app's window ends it in time")
  }

  /// Ruling 1210: a parent read that answers nothing once the budget is spent (its messaging timeout fired) is a cut-off,
  /// not the chain's end; a quick nil is the chain's end. The pid answered is the same either way: the flag changes no
  /// routing.
  func testATimedOutParentReadIsACutOffAndLeavesTheTargetUnchanged() {
    let tree = FakeAXTree(app: app, service: service)
    tree.actual[0] = gone
    var clock = 0.0
    var timedOut = tree.reads
    timedOut.now = { clock }
    timedOut.parent = { _, left in clock += left; return nil }  // the read takes all the time left and answers nothing
    var ended = tree.reads
    ended.now = { clock }
    ended.parent = { _, _ in nil }  // the chain's real end
    let cut = timedOut.target(tree.application, appPid: app)
    clock = 0
    let end = ended.target(tree.application, appPid: app)
    XCTAssertEqual(cut, KeyTarget(pid: app, walkCutOff: true))
    XCTAssertEqual(end, KeyTarget(pid: app, walkCutOff: false))
    XCTAssertEqual(cut.pid, end.pid, "the flag changes no routing")

    // The generic walk answers nil both ways, and only the timed-out read reports the cut-off.
    var cutOffs = 0
    clock = 0
    XCTAssertNil(remoteViewKeyOwner(of: 0, appPid: app, parent: { _, left in clock += left; return nil }, actualPid: { _ in self.gone },
                                    kind: kind, leftMs: { 250 - clock }, cutOff: { cutOffs += 1 }))
    XCTAssertEqual(cutOffs, 1)
    clock = 0
    XCTAssertNil(remoteViewKeyOwner(of: 0, appPid: app, parent: { _, _ in nil }, actualPid: { _ in self.gone },
                                    kind: kind, leftMs: { 250 - clock }, cutOff: { cutOffs += 1 }))
    XCTAssertEqual(cutOffs, 1, "a quick nil is the chain's end")
  }

  /// Rulings 1207 and 1210: the notice names where the keys went, the app by its name when that is the public owner,
  /// else the owner process by its localized name, else its bundle id, else its pid.
  func testTheNoticeNamesWhereTheKeysWent() {
    let none: (pid_t) -> (name: String?, bundleIdentifier: String?) = { _ in (nil, nil) }
    XCTAssertEqual(keyDestinationName(app, appPid: app, appName: "TextEdit", running: { _ in ("Other", nil) }), "TextEdit")
    XCTAssertEqual(keyDestinationName(other, appPid: app, appName: "TextEdit", running: { _ in ("Helper", "com.example.helper") }), "Helper")
    XCTAssertEqual(keyDestinationName(other, appPid: app, appName: "TextEdit", running: { _ in (nil, "com.example.helper") }), "com.example.helper")
    XCTAssertEqual(keyDestinationName(other, appPid: app, appName: "TextEdit", running: none), "process 888")
    XCTAssertEqual(keyTargetCutOffNotice(destination: "TextEdit"),
                   "The check for an Open or Save panel timed out, so the keys went to TextEdit by ordinary routing and may not have reached such a panel.")
    XCTAssertEqual(keyTargetCutOffNotice(destination: "Helper"),
                   "The check for an Open or Save panel timed out, so the keys went to Helper by ordinary routing and may not have reached such a panel.")
  }

  /// The notice reaches a result only once keys were posted after a cut-off final read, first in the note, and in the
  /// meta; with no cut-off, or nothing posted, neither.
  func testACutOffWalkPutsItsNoticeInTheReplyOnceKeysWerePosted() {
    var meta = InputMeta(context())
    XCTAssertNil(keyInputResult(meta, note: nil, appPid: app, appName: "TextEdit")["note"])
    XCTAssertEqual(keyInputResult(meta, note: "own", appPid: app, appName: "TextEdit")["note"] as? String, "own")
    meta.keyTargetCutOff = app
    XCTAssertNil(keyInputResult(meta, note: nil, appPid: app, appName: "TextEdit")["note"], "nothing posted: no notice")
    XCTAssertNil(meta.wire["keyTargetCutOff"], "nor its meta")
    meta.startedAt = 1
    let notice = keyTargetCutOffNotice(destination: "TextEdit")
    XCTAssertEqual(keyInputResult(meta, note: nil, appPid: app, appName: "TextEdit")["note"] as? String, notice)
    XCTAssertEqual(keyInputResult(meta, note: "own", appPid: app, appName: "TextEdit")["note"] as? String, notice + " own")
    XCTAssertEqual((keyInputResult(meta, note: nil, appPid: app, appName: "TextEdit")["meta"] as? [String: Any])?["keyTargetCutOff"] as? NSDictionary,
                   ["pid": Int(app)])
  }

  /// Ruling 1210: within the service's 500-character note. The notice with the real password-field note fits whole for
  /// TextEdit; with a destination long enough to pass 500 the notice still leads, so the service's cut falls inside the
  /// method's note and never in the notice.
  func testTheNoticeAndThePasswordFieldNoteFitTheServicesLimit() throws {
    var meta = InputMeta(context())
    meta.keyTargetCutOff = app
    meta.startedAt = 1
    let note = try XCTUnwrap(keyInputResult(meta, note: readbackLengthNote, appPid: app, appName: "TextEdit")["note"] as? String)
    XCTAssertLessThanOrEqual(note.count, 500, "\(note.count) characters")
    XCTAssertEqual(note, keyTargetCutOffNotice(destination: "TextEdit") + " " + readbackLengthNote)
    let long = String(repeating: "Long Application Name ", count: 3)
    let longNote = try XCTUnwrap(keyInputResult(meta, note: readbackLengthNote, appPid: app, appName: long)["note"] as? String)
    XCTAssertGreaterThan(longNote.count, 500)
    XCTAssertTrue(String(longNote.prefix(500)).hasPrefix(keyTargetCutOffNotice(destination: long)), "the notice whole within the cut")
  }

  /// Ruling 1210: an error after keys were posted following a cut-off final read carries the notice after its own
  /// sentence (a typeUnconfirmed after typed text, a ⌘V that timed out); a refusal before any key does not.
  func testAnErrorAfterThePostCarriesTheNoticeAndARefusalBeforeItDoesNot() {
    var meta = InputMeta(context())
    meta.keyTargetCutOff = other
    let named: (pid_t) -> (name: String?, bundleIdentifier: String?) = { _ in ("Helper", nil) }
    let refused = keyInputError(keysDeadlinePassed, meta, appPid: app, appName: "TextEdit", running: named)
    XCTAssertEqual(refused.message, keysDeadlinePassed.message, "nothing posted: no claim about where keys went")
    XCTAssertNil((refused.extra["meta"] as? [String: Any])?["keyTargetCutOff"])
    meta.startedAt = 1
    let unconfirmed = EngineError(name: "typeUnconfirmed", "typeUnconfirmed: the field did not read back the text.")
    let after = keyInputError(unconfirmed, meta, appPid: app, appName: "TextEdit", running: named)
    XCTAssertEqual(after.message, unconfirmed.message + " " + keyTargetCutOffNotice(destination: "Helper"))
    XCTAssertEqual(after.errorName, "typeUnconfirmed")
    XCTAssertEqual(after.code, unconfirmed.code)
    XCTAssertEqual((after.extra["meta"] as? [String: Any])?["keyTargetCutOff"] as? NSDictionary, ["pid": Int(other)])
  }

  private let textEdit = ResolvedApp(appPath: "/System/Applications/TextEdit.app", bundleIdentifier: nil, displayName: "TextEdit", running: nil)

  private func context() -> ExecutionContext {
    ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: unixMilliseconds() + 60_000, lineage: nil)
  }

  private func engine(_ reads: KeyTargetReads) -> Engine {
    Engine(paths: ServerPaths(socket: "/tmp/x.sock", directory: "/tmp", lock: "/tmp/x.lock", usage: "/tmp/cua-engine-test-usage.json"),
           intervention: InterventionMonitor(listenGranted: { false }), screenLocked: { false }, keyTargetReads: reads)
  }
}

/// An Open panel's tree as AX elements, each a token (an application element for a pid of its own) never sent to a
/// process: the panel's list (0) and split group (1), served by the service, then a group (2) and the window (3), the
/// app's, under the application. Every element's public pid is the app's, as C-3 read.
private final class FakeAXTree {
  final class Focus { var index: Int? = 0 }
  let app: pid_t
  let service: pid_t
  let application: AXUIElement
  let chain: [AXUIElement]
  var actual: [pid_t]
  /// The focused element's index in `chain`, which a test moves (an activation moving focus).
  let focus = Focus()

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
      focused: { CFEqual($0, tree.application) ? tree.focus.index.map { tree.chain[$0] } : nil },
      parent: { element, _ in tree.index(element).flatMap { $0 + 1 < tree.chain.count ? tree.chain[$0 + 1] : tree.application } },
      publicPid: { _ in tree.app },
      actualPid: { element in tree.index(element).map { tree.actual[$0] } ?? (CFEqual(element, tree.application) ? tree.app : nil) },
      kind: { $0 == tree.service ? .prohibited : $0 == tree.app ? .application : .unknown })
  }
}
