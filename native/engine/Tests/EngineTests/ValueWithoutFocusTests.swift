import ApplicationServices
import XCTest
@testable import Engine

/// #390 (ValueWithoutFocus.swift): set_value on a background Chromium page's text field that needs focus takes no focus
/// hold and no fallback click, writes AXFocused alone, writes the value and reads it back; ok only on a read as written.
/// Every other field, app, route and device mode keeps main's preparation. A fake tree answers every Accessibility call
/// (FakeAX).
final class ValueWithoutFocusTests: XCTestCase {
  private func el(_ id: Int) -> AXUIElement { Engine.element(id) }

  /// A text field (1) under a group (2) under `container` (3) in a window (4), unfocused, its AXFocused write taken but
  /// read back false at once (Chromium's, #283), holding "old".
  private func field(container: String = "AXWebArea", role: String = kAXTextFieldRole) -> FakeAX {
    let ax = FakeAX()
    ax.roles = [1: role, 2: kAXGroupRole, 3: container, 4: kAXWindowRole]
    ax.parents = [1: 2, 2: 3, 3: 4]
    ax.values = [1: [kAXFocusedAttribute: kCFBooleanFalse, kAXValueAttribute: "old" as CFString]]
    ax.settable = [1: [kAXFocusedAttribute, kAXValueAttribute]]
    ax.onWrite = { id, name, _ in if id == 1, name == kAXFocusedAttribute { ax.values[1]?[kAXFocusedAttribute] = kCFBooleanFalse } }
    return ax
  }

  private func plan(_ ax: FakeAX, engine: PageEngine = .chromium, desktop: DesktopMode = .shared, route: InputRoute = .activation,
                    foregroundOverride: Bool = false) -> ValueFocusPlan {
    valueFocusPlan(el(1), needsFocus: fieldNeedingFocus(el(1), ax: ax.ops), engine: engine, desktop: desktop, route: route,
                   foregroundOverride: foregroundOverride, roleOf: ax.ops.role, parent: ax.ops.parent)
  }

  private func meta() -> InputMeta {
    var meta = InputMeta(ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
    meta.inputRoute = .action
    return meta
  }

  /// What set_value's glue did besides the writes: the holds taken, the focusField runs (whose fallback is the click) and
  /// the fallback clicks themselves, the value reads.
  private struct Done {
    var holds = 0
    var focusFields = 0
    var clicks = 0
    var valueReads = 0
  }

  /// set_value as Engine.setValue composes it, the live calls replaced: the plan's preparation (`prepareValueFocus`), the
  /// AXFocused write alone without the fallback, main's hold and focusField otherwise (its fallback a counted click), and
  /// the unfocused write's terms only on the plan without the fallback. Answers the method's answer: nil for ok.
  private func setValue(_ value: String, _ ax: FakeAX, plan: ValueFocusPlan, concealed: Bool = false, ops: AXOps? = nil,
                        done: inout Done, meta: inout InputMeta) throws -> EngineError? {
    let ops = ops ?? ax.ops
    var reading = ops
    let read = ops.read
    var reads = 0
    reading.read = { element, name in
      if name == kAXValueAttribute { reads += 1 }
      return read(element, name)
    }
    let withoutFocus = plan != .withoutFallback ? nil : UnfocusedValueWrite(refusal: backgroundClickRefused("Chrome", engine: .chromium)) { written in
      unfocusedValueReadback(written, concealed: concealed, closed: {
        let role = ax.roles[1]
        return role == nil || secureTextField(role: role, subrole: ax.subroles[1].map(SubroleRead.subrole) ?? .none)
      }, value: { reading.read(self.el(1), kAXValueAttribute) }, now: ops.now, sleep: ops.sleep)
    }
    var holds = 0, focusFields = 0, clicks = 0
    defer {
      done = Done(holds: holds, focusFields: focusFields, clicks: clicks, valueReads: plan == .withoutFallback ? reads : 0)
    }
    let readback = try setElementValue(value, on: el(1), role: kAXTextFieldRole, ax: ops, meta: &meta, focus: { meta in
      try prepareValueFocus(plan, focusWrite: {
        try focusFieldIfNeeded(el(1), bundleIdentifier: "com.google.Chrome", ax: ops) {}
      }, hold: {
        holds += 1
        meta.inputRoute = .activation
      }, focusField: {
        focusFields += 1
        try focusFieldIfNeeded(el(1), bundleIdentifier: "com.google.Chrome", ax: ops) { clicks += 1 }
      })
    }, checkInFlight: {}, acted: {}, withoutFocus: withoutFocus)
    return readback.flatMap { unfocusedValueAnswer($0, app: "Chrome") }
  }

  // MARK: The plan

  /// A background Chromium page's unfocused text field in shared mode: without the fallback, whatever its text role.
  func testABackgroundChromiumPageFieldTakesTheWriteWithoutTheFallback() {
    for role in [kAXTextFieldRole, kAXTextAreaRole] {
      XCTAssertEqual(plan(field(role: role)), .withoutFallback, role)
    }
  }

  /// Main's preparation everywhere else: the foreground (route 1, no hold), a native or WebKit app and Firefox (route 3's
  /// hold), dedicated mode and the owner's route-4 override (where the fallback click is delivered), a field already
  /// focused or with no focus to set, a Chromium field outside every web area (the omnibox) or whose parents cannot be
  /// read to one.
  func testEveryOtherFieldAppRouteAndModeKeepsMainsPreparation() {
    XCTAssertEqual(plan(field(), route: .action), .prepared(hold: false), "the foreground")
    XCTAssertEqual(plan(field(), engine: .other), .prepared(hold: true), "an AppKit or WebKit app")
    XCTAssertEqual(plan(field(), engine: .gecko), .prepared(hold: true), "Firefox")
    XCTAssertEqual(plan(field(), desktop: .dedicated), .prepared(hold: true), "dedicated mode")
    XCTAssertEqual(plan(field(), foregroundOverride: true), .prepared(hold: true), "route 4")
    let focused = field()
    focused.values[1]?[kAXFocusedAttribute] = kCFBooleanTrue
    XCTAssertEqual(plan(focused), .prepared(hold: true), "already focused")
    let unfocusable = field()
    unfocusable.settable[1] = [kAXValueAttribute]
    XCTAssertEqual(plan(unfocusable), .prepared(hold: true), "no focus to set")
    XCTAssertEqual(plan(field(container: kAXGroupRole)), .prepared(hold: true), "outside every web area")
    let cut = field()
    cut.parents = [1: 2]
    XCTAssertEqual(plan(cut), .prepared(hold: true), "an ancestry that cannot be read")
  }

  func testThePreparationRunsTheFocusWriteAloneWithoutTheFallback() {
    var steps: [String] = []
    func run(_ plan: ValueFocusPlan) {
      steps = []
      prepareValueFocus(plan, focusWrite: { steps.append("focusWrite") }, hold: { steps.append("hold") }, focusField: { steps.append("focusField") })
    }
    run(.withoutFallback)
    XCTAssertEqual(steps, ["focusWrite"])
    run(.prepared(hold: true))
    XCTAssertEqual(steps, ["hold", "focusField"])
    run(.prepared(hold: false))
    XCTAssertEqual(steps, ["focusField"])
  }

  // MARK: The write and its read-back

  /// The fallback would be refused, the write lands: ok. AXFocused written alone, then the value; no hold (no
  /// activation), no focusField and no click (no pointer event); the route stays 1, and the meta records the read-back.
  func testTheWriteThatLandsAndReadsBackIsOkWithNoActivationAndNoPointer() throws {
    let ax = field()
    var done = Done(), meta = meta()
    XCTAssertNil(try setValue("new", ax, plan: plan(ax), done: &done, meta: &meta))
    XCTAssertEqual(ax.writes.map(\.attribute), [kAXFocusedAttribute, kAXValueAttribute])
    XCTAssertEqual(done.holds, 0, "no focus hold: no activation, no inert click")
    XCTAssertEqual(done.focusFields, 0)
    XCTAssertEqual(done.clicks, 0, "no fallback click")
    XCTAssertEqual(meta.inputRoute, .action)
    XCTAssertEqual(meta.unfocusedValue, UnfocusedValueReadback(result: .confirmed, reads: 1, ms: 0))
    XCTAssertEqual(meta.wire["unfocusedValue"] as? NSDictionary, ["result": "confirmed", "reads": 1, "ms": 0] as NSDictionary)
    XCTAssertNotNil(meta.startedAt, "the write is the method's interval")
  }

  /// Chromium applies the write to its tree a moment later: the read-back polls until it reads the value, then ok.
  func testAWriteThatAppliesLateIsReadUntilItLands() throws {
    let ax = field()
    var ops = ax.ops
    let read = ops.read
    var landsAt: Double?
    ax.onWrite = { id, name, _ in
      if name == kAXFocusedAttribute { ax.values[1]?[kAXFocusedAttribute] = kCFBooleanFalse }
      if id == 1, name == kAXValueAttribute {
        ax.values[1]?[kAXValueAttribute] = "old" as CFString
        landsAt = ax.clock + 40
      }
    }
    ops.read = { element, name in
      if name == kAXValueAttribute, let landsAt, ax.clock >= landsAt { return "new" as CFString }
      return read(element, name)
    }
    var done = Done(), meta = meta()
    XCTAssertNil(try setValue("new", ax, plan: plan(ax), ops: ops, done: &done, meta: &meta))
    XCTAssertEqual(meta.unfocusedValue?.result, .confirmed)
    XCTAssertEqual(meta.unfocusedValue?.ms, 40)
    XCTAssertEqual(done.valueReads, 9, "every 5 ms until it lands")
  }

  /// A value the page puts back (a controlled input that rejects it): sent and accepted, read other than written for the
  /// whole budget, valueUnconfirmed, never ok, and the sentence never carries either value.
  func testAMismatchedReadBackIsValueUnconfirmedNeverOk() throws {
    let ax = field()
    ax.onWrite = { id, name, _ in
      if name == kAXFocusedAttribute { ax.values[1]?[kAXFocusedAttribute] = kCFBooleanFalse }
      if id == 1, name == kAXValueAttribute { ax.values[1]?[kAXValueAttribute] = "old" as CFString }
    }
    var done = Done(), meta = meta()
    let answer = try XCTUnwrap(try setValue("new", ax, plan: plan(ax), done: &done, meta: &meta))
    XCTAssertEqual(answer.errorName, "valueUnconfirmed")
    XCTAssertEqual(answer.message, "The value was sent to Chrome and accepted without a click to focus the field, which Chrome's web page does not take in the background, but the field does not read back as written, so it is not confirmed. Observe the app (take a screenshot or call getAXState()) before any retry, and never retry blindly.")
    XCTAssertFalse(answer.message.contains("new") || answer.message.contains("old"))
    XCTAssertEqual(meta.unfocusedValue?.result, .mismatch)
    XCTAssertLessThanOrEqual(try XCTUnwrap(meta.unfocusedValue?.ms), typeReadbackBudgetMs)
    XCTAssertGreaterThan(try XCTUnwrap(meta.unfocusedValue?.ms), typeReadbackBudgetMs - 2 * typeReadbackPollIntervalMs, "the whole budget")
    XCTAssertEqual(done.clicks + done.holds, 0)
  }

  /// A write the field does not accept: nothing landed, so main's refusal, as before; nothing is read back.
  func testARejectedWriteIsRefusedAsMainRefusedIt() {
    let ax = field()
    var ops = ax.ops
    let write = ops.write
    ops.write = { element, name, value in name == kAXValueAttribute ? .failure : write(element, name, value) }
    var done = Done(), meta = meta()
    XCTAssertThrowsError(try setValue("new", ax, plan: plan(ax), ops: ops, done: &done, meta: &meta)) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "backgroundClickRefused")
      XCTAssertEqual(($0 as? EngineError)?.message, backgroundClickRefused("Chrome", engine: .chromium).message)
    }
    XCTAssertNil(meta.unfocusedValue)
    XCTAssertEqual(done.valueReads, 0)
  }

  /// A field whose value cannot be read: valueUnconfirmed, its own reason.
  func testAnUnreadableValueIsValueUnconfirmed() throws {
    var clock = 0.0
    let readback = unfocusedValueReadback("new" as CFString, concealed: false, closed: { false }, value: { nil }, now: { clock }, sleep: { clock += $0 })
    XCTAssertEqual(readback.result, .unreadable)
    XCTAssertEqual(readback.ms, typeReadbackBudgetMs, "the whole budget")
    XCTAssertEqual(unfocusedValueAnswer(readback, app: "Chrome")?.errorName, "valueUnconfirmed")
    XCTAssertTrue(try XCTUnwrap(unfocusedValueAnswer(readback, app: "Chrome")?.message).contains("the field's value could not be read back"))
  }

  /// #359's wait and watch stay around the write on this route: the wait before it, then the write, the read-back, then
  /// the watch; a write the field does not accept is refused before either the read-back or the watch, as before.
  func testClickOrderingsWaitAndWatchStayAroundTheWrite() throws {
    for accepted in [true, false] {
      let ax = field()
      var ops = ax.ops
      let write = ops.write
      var steps: [String] = []
      ops.write = { element, name, value in
        if name == kAXValueAttribute { steps.append("write") }
        return name == kAXValueAttribute && !accepted ? .failure : write(element, name, value)
      }
      let terms = UnfocusedValueWrite(refusal: backgroundClickRefused("Chrome", engine: .chromium)) { _ in
        steps.append("readBack")
        return UnfocusedValueReadback(result: .confirmed, reads: 1)
      }
      var meta = meta()
      do {
        try setElementValue("new", on: el(1), role: kAXTextFieldRole, ax: ops, meta: &meta, focus: { _ in },
                            beforeWrite: { _ in steps.append("wait") }, afterWrite: { _, _ in steps.append("watch") },
                            checkInFlight: {}, acted: {}, withoutFocus: terms)
        XCTAssertTrue(accepted)
      } catch {
        XCTAssertFalse(accepted)
        XCTAssertEqual((error as? EngineError)?.errorName, "backgroundClickRefused")
      }
      XCTAssertEqual(steps, accepted ? ["wait", "write", "readBack", "watch"] : ["wait", "write"])
    }
  }

  // MARK: Secrets and password fields

  /// A concealed request is written and never read back, not even once: valueUnconfirmed, never a false ok, and the
  /// record and the sentence carry nothing of it.
  func testAConcealedValueIsNeverReadBackAndNeverOk() throws {
    let ax = field()
    var done = Done(), meta = meta()
    let answer = try XCTUnwrap(try setValue("hunter2", ax, plan: plan(ax), concealed: true, done: &done, meta: &meta))
    XCTAssertEqual(ax.values[1]?[kAXValueAttribute] as? String, "hunter2", "written")
    XCTAssertEqual(done.valueReads, 0, "never read back")
    XCTAssertEqual(answer.errorName, "valueUnconfirmed")
    XCTAssertTrue(answer.message.contains("a concealed value is never read back"))
    XCTAssertFalse(answer.message.contains("hunter2"))
    XCTAssertEqual(meta.unfocusedValue, UnfocusedValueReadback(result: .concealed, reads: 0, ms: 0))
  }

  /// A page's password field (Chromium's: AXTextField, subrole AXSecureTextField) is never read: valueUnconfirmed. One
  /// whose role is AXSecureTextField needs no focusing (focusFieldIfNeeded's roles), so it keeps main's path; the
  /// read-back's classification still closes on a role or subrole that cannot be read.
  func testAPasswordFieldIsNeverReadAndNeverOk() throws {
    let ax = field()
    ax.subroles = [1: "AXSecureTextField"]
    var done = Done(), meta = meta()
    let answer = try XCTUnwrap(try setValue("new", ax, plan: plan(ax), done: &done, meta: &meta))
    XCTAssertEqual(done.valueReads, 0)
    XCTAssertEqual(meta.unfocusedValue?.result, .passwordField)
    XCTAssertTrue(answer.message.contains("it is a password field, whose value is never read"))
    XCTAssertEqual(plan(field(role: "AXSecureTextField")), .prepared(hold: true))
    var reads = 0
    let unclassified = unfocusedValueReadback("new" as CFString, concealed: false, closed: { true }, value: { reads += 1; return "new" as CFString },
                                              now: { 0 }, sleep: { _ in })
    XCTAssertEqual(unclassified.result, .passwordField)
    XCTAssertEqual(reads, 0)
  }

  /// A field that turns into a password field during the poll is read no further.
  func testAFieldThatTurnsSecureIsReadNoFurther() {
    var clock = 0.0, reads = 0
    let readback = unfocusedValueReadback("new" as CFString, concealed: false, closed: { reads >= 2 }, value: { reads += 1; return "old" as CFString },
                                          now: { clock }, sleep: { clock += $0 })
    XCTAssertEqual(readback.result, .passwordField)
    XCTAssertEqual(readback.reads, 2)
  }

  // MARK: The match

  func testTheMatchIsExact() {
    XCTAssertTrue(writtenValueMatches("new" as CFString, "new" as CFString))
    XCTAssertTrue(writtenValueMatches(NSAttributedString(string: "new"), "new" as CFString), "an attributed string reads as its text")
    XCTAssertFalse(writtenValueMatches("new " as CFString, "new" as CFString))
    XCTAssertFalse(writtenValueMatches("New" as CFString, "new" as CFString))
    XCTAssertFalse(writtenValueMatches("e\u{301}" as CFString, "\u{e9}" as CFString), "UTF-16 units, not canonical equivalence")
    XCTAssertFalse(writtenValueMatches(nil, "new" as CFString))
    XCTAssertFalse(writtenValueMatches(NSNumber(value: 3), "3" as CFString), "a string written reads only as text")
    XCTAssertTrue(writtenValueMatches(NSNumber(value: 4), NSNumber(value: 4)))
    XCTAssertFalse(writtenValueMatches(NSNumber(value: 3), NSNumber(value: 4)))
  }

  /// A read at Chromium's 10,000 cap never confirms a longer write: a 12,000-character write read back as its first
  /// 10,000 is valueUnconfirmed, its own reason, never ok; only the whole value read confirms, the cap's length included.
  func testACappedReadNeverConfirmsALongerWrite() throws {
    let written = String(repeating: "a", count: 12_000) as CFString
    let cut = String(repeating: "a", count: typeReadbackValueCap) as CFString
    XCTAssertFalse(writtenValueMatches(cut, written))
    XCTAssertTrue(writtenValueCut(cut, written))
    var clock = 0.0
    let readback = unfocusedValueReadback(written, concealed: false, closed: { false }, value: { cut }, now: { clock }, sleep: { clock += $0 })
    XCTAssertEqual(readback.result, .possiblyTruncated)
    let answer = try XCTUnwrap(unfocusedValueAnswer(readback, app: "Chrome"))
    XCTAssertEqual(answer.errorName, "valueUnconfirmed")
    XCTAssertTrue(answer.message.contains("the field holds more text than accessibility reports in full"))

    XCTAssertTrue(writtenValueMatches(cut, cut), "a value of exactly the cap's length, read whole")
    XCTAssertFalse(writtenValueCut(cut, cut))
    let away = String(repeating: "a", count: 9_000) as CFString
    XCTAssertFalse(writtenValueCut(away, written), "a shorter read away from the cap is a mismatch, not a cut")
    clock = 0
    XCTAssertEqual(unfocusedValueReadback(written, concealed: false, closed: { false }, value: { away }, now: { clock },
                                          sleep: { clock += $0 }).result, .mismatch)
  }

  // MARK: Main's paths unchanged

  /// The foreground: route 1's focusField, its fallback click when focus does not read at once, no read-back, no record.
  func testTheForegroundPathIsUnchanged() throws {
    let ax = field()
    var done = Done(), meta = meta()
    XCTAssertNil(try setValue("new", ax, plan: plan(ax, route: .action), done: &done, meta: &meta))
    XCTAssertEqual(done.holds, 0)
    XCTAssertEqual(done.focusFields, 1)
    XCTAssertEqual(done.clicks, 1, "main's fallback click")
    XCTAssertNil(meta.unfocusedValue)
    XCTAssertNil(meta.wire["unfocusedValue"])
  }

  /// A native field in the background (an AppKit app, no web area): route 3's hold, then focusField, as on main; a
  /// rejected write is main's actionFailed.
  func testANonWebAppIsUnchanged() throws {
    let ax = field(container: kAXGroupRole)
    var done = Done(), meta = meta()
    XCTAssertNil(try setValue("new", ax, plan: plan(ax, engine: .other), done: &done, meta: &meta))
    XCTAssertEqual(done.holds, 1)
    XCTAssertEqual(done.focusFields, 1)
    XCTAssertEqual(done.clicks, 1)
    XCTAssertNil(meta.unfocusedValue)

    var ops = ax.ops
    ops.write = { _, _, _ in .failure }
    var rejected = self.meta()
    XCTAssertThrowsError(try setValue("new", ax, plan: plan(ax, engine: .other), ops: ops, done: &done, meta: &rejected)) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "actionFailed")
    }
  }
}
