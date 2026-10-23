import ApplicationServices
import XCTest
@testable import Engine

// No GUI: injected AX and event delivery only. These tests do not establish who committed the reported Save sheet.
final class InterruptionEffectsTests: XCTestCase {
  private func meta() -> InputMeta {
    InputMeta(ExecutionContext(connection: ConnectionState(id: 212, fd: -1), receivedAt: 10, hidIdleMs: 0, deadline: 100, lineage: nil))
  }

  private func interruption(_ error: EngineError, _ meta: InputMeta) -> [String: Any] {
    let wrapped = withMeta(error, meta)
    XCTAssertEqual(wrapped.code, -10016)
    XCTAssertFalse(wrapped.message.contains("The user changed"), "attributed input is not proof of a human")
    return (wrapped.extra["meta"] as? [String: Any])?["interruption"] as? [String: Any] ?? [:]
  }

  func testPreActionRefusalHasNoEffectsForBothGuardConditions() {
    for now: Int64 in [11, 6_000] {
      let guarding = InterventionGuard.reading(app: "fixture", cleared: 0, now: now,
                                             latest: { AttributedEvent(sequence: 1, at: 10) })
      var posts = 0
      do {
        try guarding.checkBeforePosting()
        posts += 1
        XCTFail("must refuse")
      } catch let error as EngineError {
        let detail = interruption(error, meta())
        XCTAssertEqual(detail["phase"] as? String, "before-effects")
        XCTAssertEqual(detail["effects"] as? [String], [])
      } catch { XCTFail("unexpected error: \(error)") }
      XCTAssertEqual(posts, 0)
    }
  }

  func testFocusClickThenInterventionStopsBeforeValueWriteAndRetainsPreparation() throws {
    let ax = FakeAX()
    ax.roles = [1: kAXTextFieldRole]
    ax.settable = [1: [kAXValueAttribute]]
    ax.values = [1: [kAXValueAttribute: "default" as CFString]]
    var latest: AttributedEvent?
    let guarding = InterventionGuard.reading(app: "fixture", cleared: 0, now: 10, latest: { latest })
    var metadata = meta(), marks = 0
    do {
      try guarding.checkBeforePosting()
      try setElementValue("intended", on: Engine.element(1), role: kAXTextFieldRole, ax: ax.ops, meta: &metadata,
                          focus: { meta in
                            try focusingClick(&meta, acted: { marks += 1 }) { click in
                              click.activationClick = .posted
                              click.posting { latest = AttributedEvent(sequence: 1, at: 11); return true }
                            }
                          }, checkInFlight: guarding.checkInFlight, acted: { marks += 1 })
      XCTFail("must stop before AXValue")
    } catch let error as EngineError {
      let detail = interruption(error, metadata)
      XCTAssertEqual(detail["phase"] as? String, "in-flight")
      let effects = detail["effects"] as? [String] ?? []
      XCTAssertTrue(effects.contains("focus-click-posted"))
      XCTAssertTrue(effects.contains("activation-click-posted"))
      XCTAssertFalse(effects.contains("value-write-attempted"))
    }
    XCTAssertTrue(ax.writes.isEmpty)
    XCTAssertEqual(ax.values[1]?[kAXValueAttribute] as? String, "default")
    XCTAssertEqual(marks, 1, "already-posted preparation still arms observation settle")
  }

  func testFocusWriteThenInterventionStopsTheFallbackClickAndValueWrite() throws {
    for takesFocus in [false, true] {
      try checkFocusWriteInterruption(takesFocus: takesFocus)
    }
  }

  private func checkFocusWriteInterruption(takesFocus: Bool) throws {
    let ax = FakeAX()
    ax.roles = [1: kAXTextFieldRole]
    ax.settable = [1: [kAXFocusedAttribute, kAXValueAttribute]]
    ax.values = [1: [kAXFocusedAttribute: kCFBooleanFalse, kAXValueAttribute: "default" as CFString]]
    var latest: AttributedEvent?
    let guarding = InterventionGuard.reading(app: "fixture", cleared: 0, now: 10, latest: { latest })
    ax.onWrite = { _, attribute, _ in
      if attribute == kAXFocusedAttribute {
        // Exercise both the fallback-click boundary and the check immediately before AXValue.
        ax.values[1]?[kAXFocusedAttribute] = takesFocus ? kCFBooleanTrue : kCFBooleanFalse
        latest = AttributedEvent(sequence: 1, at: 11)
      }
    }
    var metadata = meta(), clicks = 0
    do {
      try setElementValue("intended", on: Engine.element(1), role: kAXTextFieldRole, ax: ax.ops, meta: &metadata,
                          focus: { meta in
                            try focusFieldIfNeeded(Engine.element(1), bundleIdentifier: nil, ax: ax.ops,
                                                   beforeMutating: guarding.checkInFlight, effects: meta.effects) { clicks += 1 }
                          }, checkInFlight: guarding.checkInFlight, acted: {})
      XCTFail("must stop after AXFocused")
    } catch let error as EngineError {
      let detail = interruption(error, metadata)
      XCTAssertEqual(detail["phase"] as? String, "in-flight")
      XCTAssertEqual(detail["effects"] as? [String], ["focus-write-attempted"])
      XCTAssertTrue(withMeta(error, metadata).message.contains("focus may have moved"))
    }
    XCTAssertEqual(ax.writes.map(\.attribute), [kAXFocusedAttribute])
    XCTAssertEqual(clicks, 0)
    XCTAssertNil(metadata.startedAt, "AXFocused is preparation outside the ordinary interval")
  }

  func testValueWriteAttemptIsNotLostWhenNextCheckDetectsQueuedInput() throws {
    let ax = FakeAX()
    ax.settable = [1: [kAXValueAttribute]]
    var latest: AttributedEvent?
    let guarding = InterventionGuard.reading(app: "fixture", cleared: 0, now: 10, latest: { latest })
    ax.onWrite = { _, _, _ in latest = AttributedEvent(sequence: 1, at: 11) }
    var metadata = meta()
    try setElementValue("intended", on: Engine.element(1), role: kAXTextFieldRole, ax: ax.ops, meta: &metadata,
                        focus: { _ in }, checkInFlight: guarding.checkInFlight, acted: {})
    XCTAssertThrowsError(try guarding.checkInFlight()) { error in
      let detail = interruption(error as! EngineError, metadata)
      XCTAssertTrue((detail["effects"] as? [String] ?? []).contains("value-write-attempted"))
    }
    XCTAssertEqual(ax.writes.count, 1, "a stop cannot retract a completed write")
  }

  func testAlreadyDispatchedClickGroupCanCompleteBeforeTheNextStopCheck() throws {
    var latest: AttributedEvent?
    let guarding = InterventionGuard.reading(app: "fixture", cleared: 0, now: 10, latest: { latest })
    var metadata = meta(), posted = 0
    let target = ClickTarget(point: .zero, windowFrame: nil, windowID: nil, pid: 60_001)
    try deliverClick(target, route: .plainPost, button: .left, count: 1, activation: nil,
                     targetActive: { true }, beforePosting: guarding.checkInFlight, post: { _, _ in
                       posted += 1
                       latest = AttributedEvent(sequence: 1, at: 11)
                     }, meta: &metadata)
    XCTAssertEqual(posted, 2, "the already-dispatched down/up group is not atomic with the event tap")
    XCTAssertThrowsError(try guarding.checkInFlight()) { error in
      let detail = interruption(error as! EngineError, metadata)
      XCTAssertTrue((detail["effects"] as? [String] ?? []).contains("input-posted"))
    }
    XCTAssertThrowsError(try deliverClick(target, route: .plainPost, button: .left, count: 1, activation: nil,
                                         targetActive: { true }, beforePosting: guarding.checkInFlight,
                                         post: { _, _ in posted += 1 }, meta: &metadata))
    XCTAssertEqual(posted, 2, "a later optional group does not start after the stop")
  }

  func testActivationClickIsAnEffectWithoutAnOrdinaryActionInterval() {
    var metadata = meta()
    metadata.activationClick = .posted
    var latest: AttributedEvent?
    let guarding = InterventionGuard.reading(app: "fixture", cleared: 0, now: 10, latest: { latest })
    latest = AttributedEvent(sequence: 1, at: 11)
    XCTAssertThrowsError(try guarding.checkInFlight()) { error in
      let detail = interruption(error as! EngineError, metadata)
      XCTAssertEqual(detail["phase"] as? String, "in-flight")
      XCTAssertTrue((detail["effects"] as? [String] ?? []).contains("activation-click-posted"))
    }
    XCTAssertNil(metadata.startedAt)
  }
}
