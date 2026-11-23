import ApplicationServices
import XCTest
@testable import Engine

// #212: an intervention's answer tells a refusal (nothing of the request ran) from a stop part-way, and names what may
// have taken effect before the stop. Injected AX and event delivery only, no GUI; these tests do not establish who
// committed the reported save sheet, only what the engine did and said. Ported from PR #218's tests, adjusted to the
// engine on main: the vendor's sentence opens the answer, and the effects ride in the meta's `interruption`.
final class InterruptionEffectsTests: XCTestCase {
  private func meta() -> InputMeta {
    InputMeta(ExecutionContext(connection: ConnectionState(id: 212, fd: -1), receivedAt: 10, hidIdleMs: 0, deadline: 100, lineage: nil))
  }

  /// The error as an input method answers it, its interruption read back from the wire.
  private func answered(_ error: Error, _ meta: InputMeta, file: StaticString = #filePath, line: UInt = #line)
    -> (message: String, phase: String?, effects: [String]) {
    guard let engineError = error as? EngineError else {
      XCTFail("not an engine error: \(error)", file: file, line: line)
      return ("", nil, [])
    }
    let wrapped = withMeta(engineError, meta)
    XCTAssertEqual(wrapped.code, -10016, file: file, line: line)
    XCTAssertEqual(wrapped.errorName, "userIntervened", file: file, line: line)
    let detail = (wrapped.wire["meta"] as? [String: Any])?["interruption"] as? [String: Any]
    XCTAssertNotNil(detail, "every userIntervened answer carries its interruption", file: file, line: line)
    return (wrapped.message, detail?["phase"] as? String, detail?["effects"] as? [String] ?? [])
  }

  func testThePreActionRefusalSaysNothingWasDoneUnderBothGuardConditions() {
    for (now, sentence) in [(Int64(11), "The user is still interacting with 'fixture'. Wait 5 seconds and retry."),
                            (Int64(6_000), "The user changed 'fixture'. Re-query the latest state with `get_app_state` before sending more actions.")] {
      let guarding = InterventionGuard.reading(app: "fixture", cleared: 0, now: now, latest: { AttributedEvent(sequence: 1, at: 10) })
      XCTAssertThrowsError(try guarding.checkBeforePosting()) { error in
        let answer = answered(error, meta())
        XCTAssertEqual(answer.phase, "beforeAction")
        XCTAssertEqual(answer.effects, [])
        XCTAssertTrue(answer.message.hasPrefix(sentence), "the vendor's sentence opens the answer: \(answer.message)")
        XCTAssertTrue(answer.message.contains("Nothing was done"), answer.message)
      }
    }
  }

  func testAStopBeforeAnyStepSaysItStoppedPartWayWithoutClaimingNothingWasDone() {
    var latest: AttributedEvent?
    let guarding = InterventionGuard.reading(app: "fixture", cleared: 0, now: 10, latest: { latest })
    latest = AttributedEvent(sequence: 1, at: 11)
    XCTAssertThrowsError(try guarding.checkInFlight()) { error in
      let answer = answered(error, meta())
      XCTAssertEqual(answer.phase, "inFlight")
      XCTAssertEqual(answer.effects, [])
      XCTAssertTrue(answer.message.hasPrefix("The user changed 'fixture'."), answer.message)
      XCTAssertFalse(answer.message.contains("Nothing was done"), "a stop part-way never claims nothing happened")
      XCTAssertTrue(answer.message.contains("may have taken effect"), answer.message)
    }
  }

  func testAFocusClickThenAnInterventionStopsBeforeTheValueWriteAndNamesThePreparation() throws {
    let ax = FakeAX()
    ax.roles = [1: kAXTextFieldRole]
    ax.settable = [1: [kAXValueAttribute]]
    ax.values = [1: [kAXValueAttribute: "default" as CFString]]
    var latest: AttributedEvent?
    let guarding = InterventionGuard.reading(app: "fixture", cleared: 0, now: 10, latest: { latest })
    var metadata = meta(), marks = 0
    XCTAssertThrowsError(try setElementValue("intended", on: Engine.element(1), role: kAXTextFieldRole, ax: ax.ops, meta: &metadata,
                                             focus: { meta in
                                               try focusingClick(&meta, acted: { marks += 1 }) { click in
                                                 click.activationClick = .posted
                                                 click.posting { latest = AttributedEvent(sequence: 1, at: 11); return true }
                                               }
                                             }, checkInFlight: guarding.checkInFlight, acted: { marks += 1 })) { error in
      let answer = answered(error, metadata)
      XCTAssertEqual(answer.phase, "inFlight")
      XCTAssertEqual(answer.effects, ["activation", "activationClick", "focusClick"], "the click is the focus's, not the action's input")
      XCTAssertTrue(answer.message.contains("a click to focus the field"), answer.message)
      XCTAssertFalse(answer.message.contains("the value written"), answer.message)
    }
    XCTAssertTrue(ax.writes.isEmpty)
    XCTAssertEqual(ax.values[1]?[kAXValueAttribute] as? String, "default")
    XCTAssertEqual(marks, 1, "the posted preparation still arms the observation's settle")
  }

  func testAFocusWriteThenAnInterventionStopsTheFallbackClickAndTheValueWrite() throws {
    for takesFocus in [false, true] {
      let ax = FakeAX()
      ax.roles = [1: kAXTextFieldRole]
      ax.settable = [1: [kAXFocusedAttribute, kAXValueAttribute]]
      ax.values = [1: [kAXFocusedAttribute: kCFBooleanFalse, kAXValueAttribute: "default" as CFString]]
      var latest: AttributedEvent?
      let guarding = InterventionGuard.reading(app: "fixture", cleared: 0, now: 10, latest: { latest })
      ax.onWrite = { _, attribute, _ in
        guard attribute == kAXFocusedAttribute else { return }
        // Both boundaries: the check before the fallback click (focus not taken) and the one before AXValue (taken).
        ax.values[1]?[kAXFocusedAttribute] = takesFocus ? kCFBooleanTrue : kCFBooleanFalse
        latest = AttributedEvent(sequence: 1, at: 11)
      }
      var metadata = meta(), clicks = 0
      XCTAssertThrowsError(try setElementValue("intended", on: Engine.element(1), role: kAXTextFieldRole, ax: ax.ops, meta: &metadata,
                                               focus: { meta in
                                                 try focusFieldIfNeeded(Engine.element(1), bundleIdentifier: nil, ax: ax.ops,
                                                                        beforeMutating: guarding.checkInFlight, effects: meta.effects) { clicks += 1 }
                                               }, checkInFlight: guarding.checkInFlight, acted: {})) { error in
        let answer = answered(error, metadata)
        XCTAssertEqual(answer.phase, "inFlight", "takesFocus \(takesFocus)")
        XCTAssertEqual(answer.effects, ["focus"], "takesFocus \(takesFocus)")
        XCTAssertTrue(answer.message.contains("moving focus to the field"), answer.message)
      }
      XCTAssertEqual(ax.writes.map(\.attribute), [kAXFocusedAttribute])
      XCTAssertEqual(clicks, 0)
      XCTAssertNil(metadata.startedAt, "the AXFocused write is preparation outside the action's interval")
    }
  }

  func testAValueWriteIsNamedWhenTheNextCheckSeesInputQueuedDuringIt() throws {
    let ax = FakeAX()
    ax.settable = [1: [kAXValueAttribute]]
    var latest: AttributedEvent?
    let guarding = InterventionGuard.reading(app: "fixture", cleared: 0, now: 10, latest: { latest })
    ax.onWrite = { _, _, _ in latest = AttributedEvent(sequence: 1, at: 11) }
    var metadata = meta()
    try setElementValue("intended", on: Engine.element(1), role: kAXTextFieldRole, ax: ax.ops, meta: &metadata,
                        focus: { _ in }, checkInFlight: guarding.checkInFlight, acted: {})
    XCTAssertThrowsError(try guarding.checkInFlight()) { error in
      let answer = answered(error, metadata)
      XCTAssertEqual(answer.effects, ["value"])
      XCTAssertTrue(answer.message.contains("the value written to the field"), answer.message)
    }
    XCTAssertEqual(ax.writes.count, 1, "a stop cannot take back a write already made")
  }

  func testAScrollIntoViewIsNamedWhenTheNextStepIsStopped() throws {
    // The field (3) sits below its window's view (0, clipping at y 0…100), as LineageTests' scroll case.
    let ax = FakeAX()
    ax.roles = [0: kAXWindowRole, 3: kAXTextFieldRole]
    ax.parents = [3: 0]
    ax.frames = [0: CGRect(x: 0, y: 0, width: 100, height: 100), 3: CGRect(x: 0, y: 400, width: 100, height: 20)]
    ax.actions = [3: ["AXScrollToVisible"]]
    var latest: AttributedEvent?
    let guarding = InterventionGuard.reading(app: "fixture", cleared: 0, now: 10, latest: { latest })
    ax.onPerform = { _, _ in latest = AttributedEvent(sequence: 1, at: 11) }
    let metadata = meta()
    _ = try positionElement(Engine.element(3), ax: ax.ops, beforeMutating: guarding.checkInFlight, effects: metadata.effects)
    XCTAssertEqual(ax.performs.map(\.action), ["AXScrollToVisible"])
    XCTAssertThrowsError(try guarding.checkInFlight()) { error in
      XCTAssertEqual(answered(error, metadata).effects, ["scroll"])
    }
    // A target already showing scrolls nothing and names nothing.
    let shown = meta()
    ax.frames[3] = CGRect(x: 0, y: 40, width: 100, height: 20)
    _ = try positionElement(Engine.element(3), ax: ax.ops, effects: shown.effects)
    XCTAssertEqual(shown.effects.reached, [])
  }

  func testAnAlreadyDispatchedClickGroupCompletesAndTheNextGroupDoesNotStart() throws {
    var latest: AttributedEvent?
    let guarding = InterventionGuard.reading(app: "fixture", cleared: 0, now: 10, latest: { latest })
    var metadata = meta(), posted = 0
    let target = ClickTarget(point: .zero, windowFrame: nil, windowID: nil, pid: 60_001)
    try deliverClick(target, route: .plainPost, button: .left, count: 1, activation: nil, targetActive: { true },
                     beforePosting: guarding.checkInFlight, post: { _, _ in
                       posted += 1
                       latest = AttributedEvent(sequence: 1, at: 11)
                     }, meta: &metadata)
    XCTAssertEqual(posted, 2, "a posted down and up are not atomic with the event tap")
    XCTAssertThrowsError(try deliverClick(target, route: .plainPost, button: .left, count: 1, activation: nil, targetActive: { true },
                                          beforePosting: guarding.checkInFlight, post: { _, _ in posted += 1 }, meta: &metadata)) { error in
      let answer = answered(error, metadata)
      XCTAssertEqual(answer.effects, ["input"])
      XCTAssertTrue(answer.message.contains("the action's own input"), answer.message)
    }
    XCTAssertEqual(posted, 2, "no later group starts after the stop")
  }

  func testWithMetaIsIdempotentAndKeepsEffectsAlreadyNamed() {
    let metadata = meta()
    metadata.effects.note(.focus)
    let once = withMeta(userChanged("fixture", phase: .inFlight), metadata)
    let twice = withMeta(once, meta())
    XCTAssertEqual(twice.message, once.message, "a second pass neither repeats nor drops the clause")
    XCTAssertEqual(((twice.wire["meta"] as? [String: Any])?["interruption"] as? [String: Any])?["effects"] as? [String], ["focus"])
  }

  func testAnErrorOtherThanUserIntervenedCarriesNoInterruption() {
    let metadata = meta()
    metadata.effects.note(.focus)
    let other = withMeta(EngineError(name: "actionFailed", "The element did not accept the value."), metadata)
    XCTAssertEqual(other.message, "The element did not accept the value.")
    XCTAssertNil((other.wire["meta"] as? [String: Any])?["interruption"])
  }
}

// The reported incident's shape (#212): a save sheet open, set_value on its name field, a user event at each point of
// the action. Whatever point the intervention stops it at, and when it is not stopped at all, set_value performs no
// accessibility action on any element (the sheet's default Save button above all), writes nothing but the name field's
// focus and value, and posts no key: it has no step that commits a sheet. The focus fallback's click goes to the field
// (`focusField` aims `focusFallbackClick` at the target element), here counted by its closure.
final class SaveSheetSetValueTests: XCTestCase {
  private enum Stop: CaseIterable { case none, atFocusWrite, atFocusClick, atValueWrite }

  func testSetValueOnASaveSheetsNameFieldNeverCommitsTheSheetWhereverAnInterventionStopsIt() throws {
    for stop in Stop.allCases {
      let ax = FakeAX()
      let sheet = 10, field = 11, save = 12, cancel = 13
      ax.roles = [sheet: kAXSheetRole, field: kAXTextFieldRole, save: kAXButtonRole, cancel: kAXButtonRole]
      ax.parents = [field: sheet, save: sheet, cancel: sheet]
      ax.children = [sheet: [field, save, cancel]]
      ax.actions = [save: [kAXPressAction], cancel: [kAXPressAction]]
      ax.settable = [field: [kAXFocusedAttribute, kAXValueAttribute]]
      ax.values = [sheet: [kAXDefaultButtonAttribute: Engine.element(save)],
                   field: [kAXFocusedAttribute: kCFBooleanFalse, kAXValueAttribute: "Untitled" as CFString]]
      var latest: AttributedEvent?
      let guarding = InterventionGuard.reading(app: "TextEdit", cleared: 0, now: 10, latest: { latest })
      let user = { latest = AttributedEvent(sequence: 1, at: 11) }
      ax.onWrite = { id, attribute, _ in
        // The sheet's field does not take focus from the write, so the fallback click runs.
        if id == field, attribute == kAXFocusedAttribute { ax.values[field]?[kAXFocusedAttribute] = kCFBooleanFalse }
        if stop == .atFocusWrite, id == field, attribute == kAXFocusedAttribute { user() }
        if stop == .atValueWrite, id == field, attribute == kAXValueAttribute { user() }
      }
      var metadata = InputMeta(ExecutionContext(connection: ConnectionState(id: 212, fd: -1), receivedAt: 10, hidIdleMs: 0, deadline: 100, lineage: nil))
      var focusClicks = 0
      let run = {
        try setElementValue("report.txt", on: Engine.element(field), role: kAXTextFieldRole, ax: ax.ops, meta: &metadata,
                            focus: { meta in
                              try focusFieldIfNeeded(Engine.element(field), bundleIdentifier: "com.apple.TextEdit", ax: ax.ops,
                                                     beforeMutating: guarding.checkInFlight, effects: meta.effects) {
                                try focusingClick(&meta, acted: {}) { click in
                                  click.posting { focusClicks += 1; if stop == .atFocusClick { user() }; return true }
                                }
                              }
                            }, checkInFlight: guarding.checkInFlight, acted: {})
        // The method's own check after the write (as a later step's would be): an event queued during the write stops here.
        try guarding.checkInFlight()
      }
      if stop == .none {
        XCTAssertNoThrow(try run())
      } else {
        XCTAssertThrowsError(try run(), "\(stop)") { error in
          let wrapped = withMeta(error as! EngineError, metadata)
          XCTAssertEqual(wrapped.errorName, "userIntervened", "\(stop)")
          XCTAssertTrue(wrapped.message.contains("may have taken effect"), "\(stop): \(wrapped.message)")
          let effects = ((wrapped.wire["meta"] as? [String: Any])?["interruption"] as? [String: Any])?["effects"] as? [String] ?? []
          XCTAssertEqual(effects.contains("value"), stop == .atValueWrite, "\(stop): \(effects)")
        }
      }
      XCTAssertTrue(ax.performs.isEmpty, "\(stop): no accessibility action, the default button's press above all: \(ax.performs)")
      XCTAssertTrue(ax.writes.allSatisfy { $0.id == field && [kAXFocusedAttribute, kAXValueAttribute].contains($0.attribute) },
                    "\(stop): only the name field's focus and value are written")
      XCTAssertEqual(ax.writes.contains { $0.attribute == kAXValueAttribute }, stop == .none || stop == .atValueWrite,
                     "\(stop): the name is written only when no stop came before the write")
      XCTAssertEqual(focusClicks, stop == .atFocusWrite ? 0 : 1, "\(stop): one click, to focus the field, and none after a stop")
    }
  }
}
