import AppKit
import CoreGraphics
import Foundation
import XCTest
@testable import Engine

// #359 (ClickOrdering.swift; the design session's ruling 1ea561bc:785): a posted pointer press arms a window in which an
// accessibility action on the same process's text first waits for a stable range; select_text's range is what a
// type_text right after expects; set_value inside the window is watched after its write. Everything runs on fake clocks
// and fake reads; the pointer's delivery over the recorded guard seam.

final class ClickOrderingTests: XCTestCase {
  private let target: pid_t = 990_101, app: pid_t = 990_102, user: pid_t = 990_103
  private let window = CGRect(x: 80, y: 60, width: 610, height: 860)
  private let point = CGPoint(x: 300, y: 400)

  private func meta(_ connection: ConnectionState = ConnectionState(id: 1, fd: -1)) -> InputMeta {
    InputMeta(ExecutionContext(connection: connection, receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
  }

  /// A clock that moves only by the wait's sleeps, and a list of reads a wait takes one by one (the last repeated).
  private final class Reads<Sample: Equatable> {
    var clock: Double = 0
    var sleeps: [Double] = []
    var reads = 0
    private var script: [RangeRead<Sample>]
    init(_ script: [RangeRead<Sample>]) { self.script = script }
    func read() -> RangeRead<Sample> {
      reads += 1
      return script.count > 1 ? script.removeFirst() : script[0]
    }
    func now() -> Double { clock }
    func sleep(_ ms: Double) { sleeps.append(ms); clock += ms }
  }

  private func waitFor<S: Equatable>(_ goal: RangeGoal<S>, _ reads: Reads<S>) -> RangeWait {
    awaitRange(goal, read: reads.read, now: reads.now, sleep: reads.sleep)
  }

  private let caret = NSRange(location: 3, length: 0), selected = NSRange(location: 0, length: 29)

  /// Ruling 785's numbers, pinned: the other tests derive from these, so a change here is a change of the ruling.
  func testTheRulingsConstants() {
    XCTAssertEqual(pendingClickWindowMs, 1_000, "about 1 s, past the spike's worst late landing (419 ms)")
    XCTAssertEqual(pendingClickDwellMs, 50, "the stable50 candidate")
    XCTAssertEqual(pendingClickSampleMs, 10)
    XCTAssertEqual(pendingClickCapMs, 300, "about 300 ms")
    XCTAssertEqual(selectedRangeWindowMs, 1_000)
  }

  // MARK: What arms the window

  /// A foreground click's events posted to the process arm the window, at the time they went, for the process and the
  /// app; a drag's too. The window holds through `pendingClickWindowMs` and no further.
  func testAForegroundPostedClickArmsTheWindow() throws {
    let ordering = ClickOrdering()
    var posted = 0
    var clickMeta = meta()
    try deliverClick(ClickTarget(point: point, windowFrame: window, windowID: 41, pid: target), route: .plainPost, button: .left, count: 1,
                     activation: nil, targetActive: { true }, pointerPosted: { ordering.pointerPosted(pids: [self.target, self.app], at: 1_000) },
                     post: { _, _ in posted += 1 }, meta: &clickMeta)
    XCTAssertEqual(posted, 2, "the click's down and up")
    XCTAssertTrue(ordering.pointerPending(pids: [target], at: 1_000))
    XCTAssertTrue(ordering.pointerPending(pids: [app], at: 1_000 + pendingClickWindowMs), "through the window, for the app too")
    XCTAssertFalse(ordering.pointerPending(pids: [target, app], at: 1_000.001 + pendingClickWindowMs), "past it")
    XCTAssertFalse(ordering.pointerPending(pids: [user], at: 1_000), "another process")

    let dragging = ClickOrdering()
    var dragMeta = meta()
    let start = ClickTarget(point: point, windowFrame: window, windowID: 41, pid: target)
    try deliverPointer(to: target, route: .plainPost, activation: nil, pointerPosted: { dragging.pointerPosted(pids: [self.target], at: 5) },
                       post: { _, _ in }, meta: &dragMeta) {
      dragEvents(from: start.point, to: CGPoint(x: 400, y: 500), window: start, flags: [])
    }
    XCTAssertTrue(dragging.pointerPending(pids: [target], at: 5), "a drag's own press")
  }

  /// A pointer stopped before its events (a stale point's refusal) arms nothing.
  func testAPointerRefusedBeforeItsEventsArmsNothing() {
    let ordering = ClickOrdering()
    var pointer = PointerTarget.acceptingFirstMouse
    pointer.staleRefusal = EngineError(name: "screenChangedSinceScreenshot", "changed")
    var clickMeta = meta()
    XCTAssertThrowsError(try deliverClick(ClickTarget(point: point, windowFrame: window, windowID: 41, pid: target), route: .plainPost, button: .left,
                                          count: 1, activation: nil, pointer: pointer, targetActive: { true },
                                          pointerPosted: { ordering.pointerPosted(pids: [self.target], at: 0) }, post: { _, _ in }, meta: &clickMeta))
    XCTAssertFalse(ordering.pointerPending(pids: [target], at: 0))
  }

  /// A background click into a Chromium page goes by #282's element route (#341's caret write for a field): nothing is
  /// posted, so nothing arms.
  func testABackgroundClickByTheAccessibilityRouteDoesNotArmTheWindow() throws {
    let ordering = ClickOrdering()
    let seam = GuardSeam(frontmost: user)
    seam.activationPoint = CGPoint(x: -1, y: 1441)  // Chrome's, outside its frame
    let chrome = FakeActivation(pid: target, window: AXUIElementCreateApplication(target), windowFrame: window, windowID: 41, system: seam.system)
    var routed = 0
    let pointer = PointerTarget(view: .webArea, app: "Google Chrome for Testing", elementRoute: { meta in
      routed += 1
      try deliverAction(kAXSelectedTextRangeAttribute, route: .action, perform: { _ in .success }, meta: &meta)
    })
    var clickMeta = meta()
    try deliverClick(ClickTarget(point: point, windowFrame: window, windowID: 41, pid: target), route: .activation, button: .left, count: 1,
                     activation: chrome, activations: HeldActivations(), pointer: pointer, targetActive: { false },
                     pointerPosted: { ordering.pointerPosted(pids: [self.target], at: 0) }, post: seam.system.post, meta: &clickMeta)
    XCTAssertEqual(routed, 1, "carried by the element route")
    XCTAssertEqual(seam.posts.count, 0, "no pointer event")
    XCTAssertFalse(ordering.pointerPending(pids: [target], at: 0), "the window is not armed")
  }

  // MARK: The wait

  /// A range that holds still: met once it has read the same for the dwell, at the sample interval.
  func testAStableRangeIsMetAfterTheDwell() {
    let reads = Reads<NSRange>([.sample(caret)])
    let wait = waitFor(.stable, reads)
    XCTAssertTrue(wait.met)
    XCTAssertEqual(wait.reads, Int(pendingClickDwellMs / pendingClickSampleMs) + 1)
    XCTAssertEqual(wait.ms, pendingClickDwellMs)
    XCTAssertEqual(Set(reads.sleeps), [pendingClickSampleMs])
    XCTAssertNil(wait.wire["capped"])
  }

  /// The late click landing during the wait (the caret moved back to its point at 20 ms): the dwell starts again, so the
  /// wait ends only once the moved range has held for the dwell, and an action after it comes after the click.
  func testAnAccessibilitySelectionWriteWaitsForTheClickToLand() {
    let reads = Reads<NSRange>([.sample(selected), .sample(selected), .sample(selected), .sample(caret)])
    let wait = waitFor(.stable, reads)
    XCTAssertTrue(wait.met)
    XCTAssertEqual(wait.ms, 3 * pendingClickSampleMs + pendingClickDwellMs, "the dwell restarted at the click's range")
    // An unreadable read restarts it too.
    let gap = Reads<NSRange>([.sample(caret), .sample(caret), .unread, .sample(caret)])
    XCTAssertEqual(waitFor(.stable, gap).ms, 3 * pendingClickSampleMs + pendingClickDwellMs)
  }

  /// A range that never holds still, or never reads: the wait ends at its cap, unmet, and the action proceeds.
  func testTheWaitEndsAtItsCap() {
    var flip = false
    let moving = Reads<NSRange>([.sample(caret)])
    let wait = awaitRange(.stable, read: { () -> RangeRead<NSRange> in
      flip.toggle()
      moving.reads += 1
      return .sample(flip ? caret : selected)
    }, now: moving.now, sleep: moving.sleep)
    XCTAssertFalse(wait.met)
    XCTAssertTrue(wait.capped)
    XCTAssertEqual(wait.ms, pendingClickCapMs)
    XCTAssertEqual(wait.reads, Int(pendingClickCapMs / pendingClickSampleMs) + 1)
    XCTAssertEqual(wait.wire["capped"] as? Bool, true)
    let unread = Reads<NSRange>([.unread])
    XCTAssertEqual(waitFor(.stable, unread).ms, pendingClickCapMs)
    XCTAssertTrue(waitFor(.stable, Reads<NSRange>([.unread])).capped)
  }

  /// A password field closes the wait at its first read: nothing more is read, and it is not capped.
  func testAClosedReadEndsTheWaitAtOnce() {
    let reads = Reads<NSRange>([.closed])
    let wait = waitFor(.stable, reads)
    XCTAssertEqual(wait.reads, 1)
    XCTAssertTrue(reads.sleeps.isEmpty)
    XCTAssertTrue(wait.closed)
    XCTAssertFalse(wait.capped)
  }

  /// select_text's range found at once costs one read and no wait; found late, the wait ends at that read; never found,
  /// it ends unmet at the cap.
  func testTheWaitForARangeEndsWhenTheRangeIsRead() {
    let atOnce = Reads<NSRange>([.sample(selected)])
    let first = waitFor(.equals(selected), atOnce)
    XCTAssertTrue(first.met)
    XCTAssertEqual(first.reads, 1)
    XCTAssertTrue(atOnce.sleeps.isEmpty)
    let late = Reads<NSRange>([.sample(caret), .unread, .sample(selected)])
    XCTAssertEqual(waitFor(.equals(selected), late).ms, 2 * pendingClickSampleMs)
    let never = waitFor(.equals(selected), Reads<NSRange>([.sample(caret)]))
    XCTAssertFalse(never.met)
    XCTAssertEqual(never.ms, pendingClickCapMs)
  }

  /// Outside the window nothing is read and nothing waits; inside it, the wait runs.
  func testNoWaitingOutsideTheWindow() {
    let ordering = ClickOrdering()
    let idle = Reads<NSRange>([.sample(caret)])
    XCTAssertNil(pendingClickWait(ordering, pids: [target], at: 0, read: idle.read, now: idle.now, sleep: idle.sleep), "no click at all")
    ordering.pointerPosted(pids: [target], at: 100)
    XCTAssertNil(pendingClickWait(ordering, pids: [target], at: 100.001 + pendingClickWindowMs, read: idle.read, now: idle.now, sleep: idle.sleep))
    XCTAssertNil(pendingClickWait(ordering, pids: [user], at: 200, read: idle.read, now: idle.now, sleep: idle.sleep), "another process's click")
    XCTAssertEqual(idle.reads, 0)
    XCTAssertTrue(idle.sleeps.isEmpty)
    let waited = pendingClickWait(ordering, pids: [user, target], at: 100 + pendingClickWindowMs, read: idle.read, now: idle.now, sleep: idle.sleep)
    XCTAssertEqual(waited?.met, true, "at the window's end it still waits")
  }

  /// Posted keys never wait and never arm: press_key's record is #354's settle, apart from this window, and a type_text
  /// with only a recent key takes no starting-point wait.
  func testPostedKeysDoNotWait() {
    let ordering = ClickOrdering()
    let keys = RecentKeyPosts()
    keys.record(pid: target, at: 0)
    XCTAssertTrue(keys.settles(pid: target, at: 10))
    XCTAssertFalse(ordering.pointerPending(pids: [target], at: 10), "a key arms no pointer window")
    XCTAssertNil(baselineWait(selection: nil, pointerPending: ordering.pointerPending(pids: [target], at: 10)))
    XCTAssertEqual(baselineWait(selection: nil, pointerPending: true), .stable)
    XCTAssertEqual(baselineWait(selection: selected, pointerPending: true), .selection(selected), "select_text's range comes first")
    XCTAssertEqual(baselineWait(selection: selected, pointerPending: false), .selection(selected))
  }

  // MARK: select_text's range

  /// select_text's range stands for one type_text within its window, on its process; any other input drops it.
  func testSelectTextsRangeIsTakenOnceWithinItsWindow() {
    let ordering = ClickOrdering()
    ordering.selectionWritten(pid: app, range: selected, at: 1_000)
    XCTAssertNil(ordering.takeSelection(pid: user, at: 1_000), "another process")
    XCTAssertEqual(ordering.takeSelection(pid: app, at: 1_000 + selectedRangeWindowMs), selected)
    XCTAssertNil(ordering.takeSelection(pid: app, at: 1_000 + selectedRangeWindowMs), "taken once")
    ordering.selectionWritten(pid: app, range: selected, at: 1_000)
    XCTAssertNil(ordering.takeSelection(pid: app, at: 1_000.001 + selectedRangeWindowMs), "past its window")
    ordering.selectionWritten(pid: app, range: selected, at: 1_000)
    ordering.dropSelection(pid: app)
    XCTAssertNil(ordering.takeSelection(pid: app, at: 1_000), "dropped by another input")
    XCTAssertEqual(selectionKeepingMethods, ["type_text", "scroll"], "every other input method drops it, select_text included")
  }

  // MARK: set_value's watch

  /// The watch over scripted reads; `closedAt`, the classification before that read (1-based) answers closed.
  private func watch(written: String?, length: Int, values: [String?], ranges: [NSRange?],
                     closedAt: Int? = nil) -> (WrittenValueWatch, valueReads: Int, rangeReads: Int) {
    var values = values, ranges = ranges
    var clock = 0.0, valueReads = 0, rangeReads = 0, checks = 0
    let found = watchWrittenValue(written: written, length: length, closed: {
      checks += 1
      return closedAt.map { checks >= $0 } ?? false
    }, value: {
      valueReads += 1
      return values.count > 1 ? values.removeFirst() : values[0]
    }, range: {
      rangeReads += 1
      return ranges.count > 1 ? ranges.removeFirst() : ranges[0]
    }, now: { clock }, sleep: { clock += $0 })
    return (found, valueReads, rangeReads)
  }

  /// Near Chromium's cap a read may lack the written value's end, and only that: a cut prefix confirms, any other
  /// difference of a 10,000-unit value is valueChanged.
  func testAValueAtTheCapIsAcceptedOnlyAsACutPrefix() {
    let written = String(repeating: "a", count: 12_000)
    let cut = String(repeating: "a", count: typeReadbackValueCap)
    let (prefix, _, _) = watch(written: written, length: 12_000, values: [cut], ranges: [NSRange(location: 12_000, length: 0)])
    XCTAssertNil(prefix.drift, "the written value cut at the cap")
    let other = String(repeating: "b", count: typeReadbackValueCap)
    let (different, _, _) = watch(written: written, length: 12_000, values: [cut, other], ranges: [NSRange(location: 12_000, length: 0)])
    XCTAssertEqual(different.drift, .valueChanged, "another 10,000-unit value")
    let (differentFirst, _, _) = watch(written: written, length: 12_000, values: [other], ranges: [NSRange(location: 12_000, length: 0)])
    XCTAssertEqual(differentFirst.drift, .valueChanged, "never landed: the drift at the cap")
    XCTAssertTrue(writtenValueRead(cut, as: written))
    XCTAssertFalse(writtenValueRead(other, as: written))
    XCTAssertTrue(writtenValueRead(cut, as: cut + "x" + String(repeating: "a", count: 10)), "a prefix cut at the cap")
    XCTAssertFalse(writtenValueRead(String(repeating: "a", count: 9_000), as: written), "a prefix short of the cap is no cut")
    XCTAssertFalse(writtenValueRead(cut + "a", as: cut), "longer than written is no cut")
  }

  /// A field that turns secure, or can no longer be classified, is read no further: neither its value nor its caret,
  /// and the watch ends unconfirmed.
  func testAFieldTurningSecureDuringTheWatchIsReadNoFurther() {
    let (turned, valueReads, rangeReads) = watch(written: "NEW359", length: 6, values: ["NEW359"], ranges: [end], closedAt: 3)
    XCTAssertEqual(turned.drift, .fieldClosed)
    XCTAssertEqual(valueReads, 2, "only the reads before it turned")
    XCTAssertEqual(rangeReads, 2)
    let (atOnce, valueReadsAtOnce, rangeReadsAtOnce) = watch(written: "NEW359", length: 6, values: ["NEW359"], ranges: [end], closedAt: 1)
    XCTAssertEqual(atOnce.drift, .fieldClosed)
    XCTAssertEqual(valueReadsAtOnce + rangeReadsAtOnce, 0)
    XCTAssertTrue(writtenValueFieldClosed(role: nil, subrole: .none), "no role")
    XCTAssertTrue(writtenValueFieldClosed(role: "AXSecureTextField", subrole: .none))
    XCTAssertTrue(writtenValueFieldClosed(role: "AXTextField", subrole: .subrole("AXSecureTextField")))
    XCTAssertTrue(writtenValueFieldClosed(role: "AXTextField", subrole: .failed), "a subrole that cannot be read")
    XCTAssertFalse(writtenValueFieldClosed(role: "AXTextField", subrole: .none))
    XCTAssertFalse(writtenValueFieldClosed(role: "AXTextArea", subrole: .subrole("AXSearchField")))
    let error = valueUnconfirmed(app: "Safari", drift: .fieldClosed)
    XCTAssertEqual(error.errorName, "valueUnconfirmed")
    XCTAssertTrue(error.message.contains("turned into a password field or could no longer be read"), error.message)
  }

  private let end = NSRange(location: 6, length: 0)

  /// The write landed and held: no drift, after the dwell.
  func testAWrittenValueThatHoldsIsConfirmed() {
    let (held, _, _) = watch(written: "NEW359", length: 6, values: ["NEW359"], ranges: [end])
    XCTAssertNil(held.drift)
    XCTAssertEqual(held.ms, pendingClickDwellMs)
    // Applied late (the old value first), then held: still confirmed.
    let (late, _, _) = watch(written: "NEW359", length: 6, values: ["Old draft", "Old draft", "NEW359"],
                          ranges: [NSRange(location: 9, length: 0), NSRange(location: 9, length: 0), end])
    XCTAssertNil(late.drift)
    XCTAssertEqual(late.ms, 2 * pendingClickSampleMs + pendingClickDwellMs)
  }

  /// A late click moving the caret off the written end after the write landed: caretMoved, which set_value answers as
  /// valueUnconfirmed, never ok.
  func testSetValueWithAMovedCaretIsValueUnconfirmed() {
    let (moved, _, _) = watch(written: "NEW359", length: 6, values: ["NEW359"], ranges: [end, end, NSRange(location: 3, length: 0)])
    XCTAssertEqual(moved.drift, .caretMoved)
    XCTAssertEqual(moved.reads, 3)
    let error = valueUnconfirmed(app: "Safari", drift: moved.drift)
    XCTAssertEqual(error.errorName, "valueUnconfirmed")
    XCTAssertTrue(error.message.contains("caret moved off the end of the new value"), error.message)
    XCTAssertFalse(error.message.contains("NEW359"), "no sentence carries the value")
    // The click landed before the first read: the caret never reads at the end, which at the cap is the drift.
    let (early, _, _) = watch(written: "NEW359", length: 6, values: ["NEW359"], ranges: [NSRange(location: 3, length: 0)])
    XCTAssertEqual(early.drift, .caretMoved)
    XCTAssertEqual(early.ms, pendingClickCapMs)
  }

  /// A value other than the one written after it landed: valueChanged, whether or not its length changed.
  func testAValueChangedAfterTheWriteIsValueUnconfirmed() {
    let (changed, _, _) = watch(written: "NEW359", length: 6, values: ["NEW359", "NEW35"], ranges: [end, NSRange(location: 5, length: 0)])
    XCTAssertEqual(changed.drift, .valueChanged)
    let (sameLength, _, _) = watch(written: "NEW359", length: 6, values: ["NEW359", "NEW358"], ranges: [end])
    XCTAssertEqual(sameLength.drift, .valueChanged, "the same length, other text")
    XCTAssertTrue(valueUnconfirmed(app: "Safari", drift: .valueChanged).message.contains("read another value just after"))
    XCTAssertEqual(valueUnconfirmed(app: "Safari").message,
                   "The value was sent to Safari and accepted, but the field could not be found again to confirm it. Observe the app (take a screenshot or call getAXState()) before any retry, and never retry blindly.",
                   "ruling 772's sentence unchanged")
  }

  /// A field whose value and range cannot be read tells nothing: one read, no drift. A concealed request's value is never
  /// read, only its caret against the written length.
  func testAnUnreadableFieldAndAConcealedValue() {
    let (unread, _, _) = watch(written: "NEW359", length: 6, values: [nil], ranges: [nil])
    XCTAssertNil(unread.drift)
    XCTAssertEqual(unread.reads, 1)
    let (concealed, valueReads, _) = watch(written: nil, length: 6, values: ["anything"], ranges: [end, NSRange(location: 0, length: 0)])
    XCTAssertEqual(valueReads, 0, "a secret's field value is never read")
    XCTAssertEqual(concealed.drift, .caretMoved)
  }

  /// Only a text field's string is watched; a password field never, and a concealed request without its value.
  func testOnlyATextFieldsStringIsWatched() {
    var asked: [(String?, Int)] = []
    let watcher: (String?, Int) -> WrittenValueWatch = { asked.append(($0, $1)); return WrittenValueWatch() }
    XCTAssertNil(writtenValueWatch("x" as CFString, role: "AXSecureTextField", subrole: .none, concealed: false, watch: watcher))
    XCTAssertNil(writtenValueWatch("x" as CFString, role: "AXTextField", subrole: .subrole("AXSecureTextField"), concealed: false, watch: watcher))
    XCTAssertNil(writtenValueWatch("x" as CFString, role: "AXTextField", subrole: .failed, concealed: false, watch: watcher), "fails closed")
    XCTAssertNil(writtenValueWatch(kCFBooleanTrue, role: "AXCheckBox", subrole: .none, concealed: false, watch: watcher))
    XCTAssertNil(writtenValueWatch(NSNumber(value: 3), role: "AXTextField", subrole: .none, concealed: false, watch: watcher))
    XCTAssertNil(writtenValueWatch("x" as CFString, role: "AXSlider", subrole: .none, concealed: false, watch: watcher))
    XCTAssertTrue(asked.isEmpty)
    XCTAssertNotNil(writtenValueWatch("héllo" as CFString, role: "AXTextArea", subrole: .none, concealed: false, watch: watcher))
    XCTAssertNotNil(writtenValueWatch("😀" as CFString, role: "AXTextField", subrole: .none, concealed: true, watch: watcher))
    XCTAssertEqual(asked.map(\.0), ["héllo", nil])
    XCTAssertEqual(asked.map(\.1), [5, 2], "UTF-16 lengths")
  }

  /// set_value's order: the wait before the in-flight check and the write, the watch only after an accepted write, with
  /// the value as written.
  func testSetValueWaitsBeforeItsWriteAndWatchesOnlyAnAcceptedOne() throws {
    let element = AXUIElementCreateApplication(target)
    for accepted in [true, false] {
      var order: [String] = []
      var ax = AXOps()
      ax.isSettable = { _, _ in true }
      ax.read = { _, _ in "old" as CFString }
      ax.subrole = { _ in nil }
      ax.write = { _, _, _ in order.append("write"); return accepted ? .success : .failure }
      var setMeta = meta()
      let attempt = {
        try setElementValue("new", on: element, role: "AXTextField", ax: ax, meta: &setMeta, focus: { _ in order.append("focus") },
                            beforeWrite: { _ in order.append("wait") },
                            afterWrite: { converted, _ in order.append("watch:\(converted as? String ?? "?")") },
                            checkInFlight: { order.append("inFlight") }, acted: { order.append("acted") })
      }
      if accepted {
        try attempt()
        XCTAssertEqual(order, ["focus", "wait", "inFlight", "write", "acted", "watch:new"])
      } else {
        XCTAssertThrowsError(try attempt())
        XCTAssertEqual(order, ["focus", "wait", "inFlight", "write", "acted"], "no watch after a refused write")
      }
    }
  }

  /// The meta's record: the wait's time and reads, capped or not, and the watch's drift.
  func testThePendingClickRecordsWire() {
    var record = PendingClickRecord(wait: RangeWait(reads: 31, ms: 300, met: false))
    record.watch = WrittenValueWatch(reads: 4, ms: 30, drift: .caretMoved)
    let wire = record.wire
    XCTAssertEqual(wire["waitMs"] as? Double, 300)
    XCTAssertEqual(wire["reads"] as? Int, 31)
    XCTAssertEqual(wire["capped"] as? Bool, true)
    XCTAssertEqual(wire["watchMs"] as? Double, 30)
    XCTAssertEqual(wire["drift"] as? String, "caretMoved")
    var withMeta = meta()
    withMeta.pendingClick = record
    XCTAssertNotNil(withMeta.wire["pendingClick"])
    XCTAssertNil(meta().wire["pendingClick"], "absent when no click was pending")
  }
}
