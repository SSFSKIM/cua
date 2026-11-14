import ApplicationServices
import XCTest
@testable import Engine

// #312: a clipping frame read {0, 0, 0, 0} (`unplacedFrame`) is unknown, not a place. Firefox's AXWebArea answers it on
// the observation that turns Gecko's accessibility on, its page's frames already real (#287's hosted runs, Firefox 159
// and 158.0.1), so every page node had no shown part and every page click from that screenshot was refused as
// `interactiveHit`. On the observation that enabled accessibility the walk polls such a frame every 100 ms until it is
// a place or 1 s after the enablement (ruling 9d97e82a), and a frame still unplaced cuts nothing; a frame of no size at its place still hides what it holds. Over the fake tree of WalkTests.swift,
// shaped as #287's Firefox window.

private let windowFrame = CGRect(x: 400, y: 30, width: 620, height: 680)
private let scrollAreaFrame = CGRect(x: 400, y: 104, width: 620, height: 606)
/// The web area's real frame, a point taller than its scroll area, as Firefox reported it once it arrived.
private let webAreaFrame = CGRect(x: 400, y: 104, width: 620, height: 607)
private let applyFrame = CGRect(x: 519, y: 155, width: 48, height: 22)
private let apply = CGPoint(x: 543, y: 166)

/// The window (0): a toolbar button (3), and the page's scroll area (1) holding its web area (2), whose frame reads
/// `webArea`: the page's Apply button (10), its checkbox (11), a group (12) holding a text area (13), and a link (14)
/// laid out below the scroll area's bottom edge.
private func firefox(webArea: CGRect = .zero) -> FakeTree {
  let tree = FakeTree()
  tree.children = [0: [3, 1], 1: [2], 2: [10, 11, 12, 14], 12: [13]]
  let roles: [Int: String] = [0: "AXWindow", 1: "AXScrollArea", 2: "AXWebArea", 3: "AXButton", 10: "AXButton", 11: "AXCheckBox",
                              12: "AXGroup", 13: "AXTextArea", 14: "AXLink"]
  for (id, role) in roles { tree.extra[id] = ["AXRole": role as CFString] }
  tree.frames = [0: windowFrame, 1: scrollAreaFrame, 2: webArea, 3: CGRect(x: 529, y: 74, width: 22, height: 22), 10: applyFrame,
                 11: CGRect(x: 412, y: 158, width: 14, height: 14), 12: CGRect(x: 408, y: 193, width: 604, height: 180),
                 13: CGRect(x: 408, y: 193, width: 493, height: 178), 14: CGRect(x: 420, y: 720, width: 40, height: 18)]
  return tree
}

private func reads(_ tree: FakeTree, roles: [Int: String] = [:]) -> StalePointReads<AXUIElement> {
  StalePointReads<AXUIElement>(role: { element in roles[tree.id(element)] ?? (tree.extra[tree.id(element)]?["AXRole"] as? String) },
                               frame: { tree.frames[tree.id($0)] },
                               parent: { element in tree.children.first { $0.value.contains(tree.id(element)) }.map { Engine.element($0.key) } },
                               children: { (tree.children[tree.id($0)] ?? []).map(Engine.element) },
                               title: { _ in nil }, description: { _ in nil }, same: { CFEqual($0, $1) })
}

private func id(_ node: ScreenshotNode<AXUIElement>?, _ tree: FakeTree) -> Int? { node.map { tree.id($0.element) } }

/// The element route's visible frame of `id` over the fake tree, read live (`visibleFrame`).
private func liveVisibleFrame(_ id: Int, _ tree: FakeTree) -> CGRect? {
  let reads = reads(tree)
  return visibleFrame(of: Engine.element(id), frame: reads.frame, role: reads.role, parent: reads.parent, actions: { tree.actions[tree.id($0)] ?? [] })
}

/// The poll's clock: the enablement at 0 ms, the walk meeting the clip at `now`; each sleep advances it, and `wakes`
/// runs after each.
private final class PollClock {
  var now: Double
  var sleeps: [Double] = []
  var wakes: (Double) -> Void = { _ in }
  init(_ now: Double) { self.now = now }

  func poll(deadline: Double = 10_000) -> ClipRereadPoll {
    ClipRereadPoll(enabledAt: 0, deadline: deadline, now: { self.now }, sleep: { ms in
      self.sleeps.append(ms)
      self.now += ms
      self.wakes(self.now)
    })
  }
}

final class UnplacedClipTests: XCTestCase {
  /// The incident: on the observation that enabled accessibility the web area reads {0, 0, 0, 0}, and its real frame
  /// arrives 550 ms after the enablement; the poll takes it at the first read after, well before the 1 s bound.
  func testTheEnablingObservationPollsAnUnplacedWebAreaSoAPageClickIsKept() throws {
    let tree = firefox()
    let source = FakeSource(tree)
    let clock = PollClock(300)
    clock.wakes = { now in if now >= 550 { tree.frames[2] = webAreaFrame } }
    let observed = walk(tree, Lineage(), visibleFrame: windowFrame, source: source, recordsScreenshot: true, clipRereadPoll: clock.poll())
    XCTAssertEqual(clock.sleeps, [100, 100, 100], "stops at the first real frame, at 600 ms")
    XCTAssertEqual(source.frameReads[2], 3, "one read a wake")
    XCTAssertEqual(observed.clipReread?.real, true)
    XCTAssertEqual(observed.clipReread?.reads, 3)
    XCTAssertEqual(observed.clipReread?.ms, 300)
    XCTAssertEqual(observed.unplacedClips, 0)
    let printed = try XCTUnwrap(observed.nodes.first { $0["role"] as? String == "AXWebArea" })
    XCTAssertEqual(printed["frame"] as? [String: Double], rectWire(webAreaFrame) as? [String: Double], "the tree prints the frame the re-read found")
    let nodes = screenshotNodes(observed.screenshotReads)
    XCTAssertEqual(id(deepestScreenshotNode(at: apply, in: nodes), tree), 10, "the screenshot showed Apply at its point")
    XCTAssertEqual(nodes.first { tree.id($0.element) == 2 }?.shown, webAreaFrame.intersection(scrollAreaFrame))
    let verdict = stalePointVerdict(at: apply, nodes: nodes, hit: Engine.element(10), reads: reads(tree))
    XCTAssertEqual(verdict.reason, .sameElement, "a click on Apply from that screenshot is kept, not refused as interactiveHit")
    var timings = Timings()
    observed.reportUnplacedClips(&timings)
    XCTAssertEqual(timings.wire["clipReread"] as? String, "real")
    XCTAssertEqual(timings.wire["clipRereadReads"] as? Int, 3)
    XCTAssertEqual(timings.wire["clipRereadMs"] as? Double, 300)
    XCTAssertNil(timings.wire["unplacedClips"])
  }

  /// The poll ends at its bound, 1 s after the enablement, with the frame still unplaced: unknown for that observation,
  /// so it cuts nothing (the scroll area above still clips the page), and the meta says so.
  func testAFrameStillUnplacedAtThePollsBoundCutsNothingAndTheMetaSaysSo() {
    let tree = firefox()
    let source = FakeSource(tree)
    let clock = PollClock(300)
    let observed = walk(tree, Lineage(), visibleFrame: windowFrame, source: source, recordsScreenshot: true, clipRereadPoll: clock.poll())
    XCTAssertEqual(clock.sleeps, Array(repeating: 100, count: 7), "every 100 ms up to the bound")
    XCTAssertEqual(clock.now, 1_000)
    XCTAssertEqual(source.frameReads[2], 7)
    XCTAssertEqual(observed.clipReread?.real, false)
    XCTAssertEqual(observed.clipReread?.reads, 7)
    XCTAssertEqual(observed.unplacedClips, 1)
    let nodes = screenshotNodes(observed.screenshotReads)
    XCTAssertEqual(id(deepestScreenshotNode(at: apply, in: nodes), tree), 10)
    XCTAssertEqual(nodes.first { tree.id($0.element) == 10 }?.shown, applyFrame)
    XCTAssertNil(nodes.first { tree.id($0.element) == 2 }?.shown, "the web area itself is never chosen at a point")
    XCTAssertNil(nodes.first { tree.id($0.element) == 14 }?.shown, "the scroll area still hides what lies past its edge")
    XCTAssertEqual(stalePointVerdict(at: apply, nodes: nodes, hit: Engine.element(10), reads: reads(tree)).reason, .sameElement)
    var timings = Timings()
    observed.reportUnplacedClips(&timings)
    XCTAssertEqual(timings.wire["unplacedClips"] as? Int, 1)
    XCTAssertEqual(timings.wire["clipReread"] as? String, "unplaced")
    XCTAssertEqual(timings.wire["clipRereadReads"] as? Int, 7)
    XCTAssertEqual(timings.wire["clipRereadMs"] as? Double, 700)
    // The element route reads the same rule live: Apply's visible frame is its frame, the link's is nothing.
    XCTAssertEqual(liveVisibleFrame(10, tree), applyFrame)
    XCTAssertNil(liveVisibleFrame(14, tree))
  }

  /// The bound: nothing is waited for or re-read when the frame is already a place, and an observation that enabled
  /// nothing (no poll given) re-reads nothing either, its unplaced frame cutting nothing.
  func testNoRereadWhenTheFrameIsRealOrTheObservationEnabledNothing() {
    let real = firefox(webArea: webAreaFrame)
    real.frames[12] = .zero  // a group that does not clip: its {0, 0, 0, 0} is not this rule's
    let realSource = FakeSource(real)
    let clock = PollClock(300)
    let enabling = walk(real, Lineage(), visibleFrame: windowFrame, source: realSource, recordsScreenshot: true, clipRereadPoll: clock.poll())
    XCTAssertEqual(clock.sleeps, [])
    XCTAssertNil(realSource.frameReads[2])
    XCTAssertNil(realSource.frameReads[12])
    XCTAssertNil(enabling.clipReread)
    XCTAssertEqual(enabling.unplacedClips, 0)
    var timings = Timings()
    enabling.reportUnplacedClips(&timings)
    XCTAssertTrue(timings.wire.isEmpty, "no meta when no clipping frame read unplaced")

    let unplaced = firefox()
    let source = FakeSource(unplaced)
    let later = walk(unplaced, Lineage(), visibleFrame: windowFrame, source: source, recordsScreenshot: true)
    XCTAssertNil(source.frameReads[2], "no re-read")
    XCTAssertNil(later.clipReread)
    XCTAssertEqual(later.unplacedClips, 1)
    XCTAssertEqual(id(deepestScreenshotNode(at: apply, in: screenshotNodes(later.screenshotReads)), unplaced), 10)
  }

  /// At most one poll a walk: a second unplaced clipping frame met after the poll is read after it already, and is
  /// neither waited for nor re-read.
  func testAtMostOnePollAWalk() {
    let tree = firefox()
    // A nested scroll area in the page (15), unplaced too, holding a button (16).
    tree.children[12] = [13, 15]
    tree.children[15] = [16]
    tree.extra[15] = ["AXRole": "AXScrollArea" as CFString]
    tree.extra[16] = ["AXRole": "AXButton" as CFString]
    tree.frames[15] = .zero
    tree.frames[16] = CGRect(x: 420, y: 400, width: 60, height: 20)
    let source = FakeSource(tree)
    let clock = PollClock(300)
    clock.wakes = { _ in tree.frames[2] = webAreaFrame }
    let observed = walk(tree, Lineage(), visibleFrame: windowFrame, source: source, recordsScreenshot: true, clipRereadPoll: clock.poll())
    XCTAssertEqual(clock.sleeps, [100])
    XCTAssertEqual(source.frameReads[2], 1)
    XCTAssertNil(source.frameReads[15], "the second is not re-read")
    XCTAssertEqual(observed.clipReread?.real, true)
    XCTAssertEqual(observed.unplacedClips, 1, "the second stays unplaced, counted")
    XCTAssertEqual(id(deepestScreenshotNode(at: CGPoint(x: 450, y: 410), in: screenshotNodes(observed.screenshotReads)), tree), 16)
  }

  /// A clip of no size at its place is a place: a collapsed scroll area still hides what it holds, in the record, the walk
  /// and the element route, and is not re-read.
  func testATrulyCollapsedClipStillHidesItsContent() throws {
    for collapsed in [CGRect(x: 400, y: 300, width: 620, height: 0), CGRect(x: 400, y: 300, width: 0, height: 0), CGRect(x: 0, y: 0, width: 620, height: 0)] {
      let tree = firefox(webArea: webAreaFrame)
      tree.frames[1] = collapsed
      let source = FakeSource(tree)
      let clock = PollClock(300)
      let observed = walk(tree, Lineage(), visibleFrame: windowFrame, source: source, recordsScreenshot: true, clipRereadPoll: clock.poll())
      XCTAssertEqual(clock.sleeps, [], "\(collapsed)")
      XCTAssertEqual(observed.unplacedClips, 0, "\(collapsed)")
      let nodes = screenshotNodes(observed.screenshotReads)
      XCTAssertNil(nodes.first { tree.id($0.element) == 10 }?.shown, "\(collapsed): Apply is hidden")
      XCTAssertEqual(id(deepestScreenshotNode(at: apply, in: nodes), tree), 0, "\(collapsed): the window holds the point")
      XCTAssertNil(liveVisibleFrame(10, tree), "\(collapsed)")
      let facts = try XCTUnwrap(observed.selectionFacts(of: Engine.element(1)))
      XCTAssertFalse(facts.enters, "\(collapsed): its children wait, as a strip's do")
    }
  }

  /// The walk spends its budget as the record clips: an unplaced web area's children are taken up at once, in what its
  /// scroll area leaves showing, so a visible sibling after it cannot starve the page.
  func testAnUnplacedWebAreasChildrenAreTakenUpAtOnce() throws {
    let tree = pageBeforeABusySibling()
    let observed = walk(tree, Lineage(), visibleFrame: windowFrame)
    XCTAssertTrue(observed.nodeCapHit)
    let facts = try XCTUnwrap(observed.selectionFacts(of: Engine.element(2)))
    XCTAssertTrue(facts.enters)
    XCTAssertEqual(facts.childClip, scrollAreaFrame)
    XCTAssertNotNil(observed.token(of: Engine.element(10)), "the page is read before the budget runs out")
  }

  /// The token re-fetch walks the same order (Lineage.swift `matching`), so it finds again what the observation kept: a
  /// text area below a group in the page, which waits unless the web area's frame both lets its children in and leaves
  /// them its scroll area's clip.
  func testTheRefetchFindsAPageElementUnderAnUnplacedWebArea() throws {
    let tree = pageBeforeABusySibling()
    tree.extra[13]?["AXTitle"] = "Notes" as CFString
    let lineage = Lineage()
    let observed = walk(tree, lineage, visibleFrame: windowFrame)
    let token = try XCTUnwrap(observed.token(of: Engine.element(13)))
    // The page re-rendered the text area: its handle is gone, a new one (9999) takes its place with the same attributes.
    tree.unreadable = [13]
    tree.children[12] = [9999]
    tree.extra[9999] = tree.extra[13]
    tree.frames[9999] = tree.frames[13]
    let resolver = ElementResolver(invalidated: { _ in true }, stillValid: { _ in true }, source: { FakeSource(tree) },
                                   tree: { _ in (Engine.element(0), []) })
    XCTAssertTrue(CFEqual(try lineage.resolve(token, resolver: resolver).element, Engine.element(9999)))
  }
}

/// `firefox()` with a visible sibling after the scroll area (4), 45 groups of 100 visible leaves, more than the node
/// budget leaves once the toolbar and the page are read.
private func pageBeforeABusySibling() -> FakeTree {
  let tree = firefox()
  tree.children[0] = [3, 1, 4]
  tree.frames[4] = windowFrame
  tree.children[4] = Array(20_000..<20_045)
  for group in 0..<45 {
    let id = 20_000 + group
    tree.frames[id] = windowFrame
    tree.children[id] = (0..<100).map { 30_000 + 100 * group + $0 }
    for leaf in tree.children[id]! { tree.frames[leaf] = CGRect(x: 400, y: 30, width: 10, height: 10) }
  }
  return tree
}

final class ClipRereadPollTests: XCTestCase {
  /// The walk met the clip after the bound: one read at once, no wait.
  func testPastTheBoundItReadsOnceWithoutWaiting() {
    let clock = PollClock(1_500)
    var reads = 0
    let polled = clock.poll().run { reads += 1; return .zero }
    XCTAssertEqual(clock.sleeps, [])
    XCTAssertEqual(reads, 1)
    XCTAssertNil(polled.frame)
  }

  /// The last wait is cut to the bound, and an unreadable frame is read again as an unplaced one is.
  func testTheLastWaitEndsAtTheBound() {
    let clock = PollClock(350)
    let polled = clock.poll().run { nil }
    XCTAssertEqual(clock.sleeps, Array(repeating: 100, count: 6) + [50])
    XCTAssertEqual(polled.reads, 7)
    XCTAssertEqual(clock.now, 1_000)
  }

  /// A short deadline: the poll ends halfway from its start to it.
  func testAShortDeadlineEndsThePollHalfwayToIt() {
    let clock = PollClock(300)
    let polled = clock.poll(deadline: 700).run { .zero }
    XCTAssertEqual(clock.sleeps, [100, 100])
    XCTAssertEqual(polled.reads, 2)
  }

  /// A frame of no size at a place is a place: the poll takes it.
  func testAZeroSizedFrameAtAPlaceEndsThePoll() {
    let clock = PollClock(300)
    let collapsed = CGRect(x: 400, y: 300, width: 620, height: 0)
    let polled = clock.poll().run { collapsed }
    XCTAssertEqual(polled.frame, collapsed)
    XCTAssertEqual(polled.reads, 1)
  }
}

final class ClipRereadDueTests: XCTestCase {
  func testTheRereadComesASecondAfterTheEnablementNeverBeforeNowAndNeverPastHalfTheDeadline() {
    XCTAssertEqual(clipRereadDue(now: 1_300, enabledAt: 1_000, deadline: 11_000), 2_000, "the walk's time counts toward the second")
    XCTAssertEqual(clipRereadDue(now: 2_500, enabledAt: 1_000, deadline: 11_000), 2_500, "past it: no wait")
    XCTAssertEqual(clipRereadDue(now: 1_300, enabledAt: 1_000, deadline: 1_900), 1_600, "a short deadline: half of what is left")
    XCTAssertEqual(clipRereadDue(now: 1_300, enabledAt: 1_000, deadline: 1_000), 1_300, "past the deadline: no wait")
  }
}
