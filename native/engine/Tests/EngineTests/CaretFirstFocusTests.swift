import ApplicationServices
import XCTest
@testable import Engine

/// #324 (the design session's ruling 8c206e91): set_value's and select_text's focus of a field that needs it
/// (ElementInput.swift `focusFieldIfNeeded`, `caretFirstFocus`, `fieldFocusRoute`, `focusByCaretFirst`; TextSelection.swift
/// `selectionSettableBeforeFocus`). A WebKit page's text field takes its caret, then its AXPress, each read back, and
/// never an AXFocused write or the fallback click; a password field, an AppKit field, a field outside every web area and
/// a Chromium or Gecko page's keep main's write and click. A fake tree answers every Accessibility call (FakeAX).
final class CaretFirstFocusTests: XCTestCase {
  private func el(_ id: Int) -> AXUIElement { Engine.element(id) }

  /// A field (1) that is not focused and whose AXFocused is settable, under a group (2) under `container` (3): Safari's
  /// page is an AXWebArea, a native field's container its window. `caretFocuses`: an AXSelectedTextRange write focuses
  /// it (Safari's textarea); `pressFocuses`: its AXPress does (`actions` its advertised actions).
  private func field(role: String = kAXTextFieldRole, container: String = "AXWebArea", subrole: String? = nil, caretFocuses: Bool = true,
                     pressFocuses: Bool = false, actions: [String] = ["AXPress", "AXShowMenu"], focusWriteTakes: Bool = false) -> FakeAX {
    let ax = FakeAX()
    ax.roles = [1: role, 2: kAXGroupRole, 3: container, 4: kAXWindowRole]
    ax.parents = [1: 2, 2: 3, 3: 4]
    if let subrole { ax.subroles = [1: subrole] }
    ax.values = [1: [kAXFocusedAttribute: kCFBooleanFalse, kAXValueAttribute: "old" as CFString]]
    ax.settable = [1: [kAXFocusedAttribute, kAXValueAttribute, kAXSelectedTextRangeAttribute]]
    ax.actions = [1: actions]
    ax.onWrite = { id, name, _ in
      guard id == 1 else { return }
      if name == kAXSelectedTextRangeAttribute, caretFocuses { ax.values[1]?[kAXFocusedAttribute] = kCFBooleanTrue }
      if name == kAXFocusedAttribute, !focusWriteTakes { ax.values[1]?[kAXFocusedAttribute] = kCFBooleanFalse }
    }
    ax.onPerform = { id, action in if id == 1, action == "AXPress", pressFocuses { ax.values[1]?[kAXFocusedAttribute] = kCFBooleanTrue } }
    return ax
  }

  private func subrole(_ ax: FakeAX) -> (AXUIElement) -> SubroleRead {
    { element in ax.subroles[FakeAX.id(element)].map(SubroleRead.subrole) ?? .none }
  }

  /// What focusField does through `ax` (its glue, with the live calls replaced): focusFieldIfNeeded asking
  /// `caretFirstFocus` first, the steps counted as the method's interval, the record kept, the fallback click counted.
  private struct Focused {
    var clicks = 0
    var steps = 0
    var record: TextEntryFocusRecord?
  }

  @discardableResult
  private func focus(_ ax: FakeAX, engine: PageEngine = .other, bundle: String? = "com.apple.Safari", ops: AXOps? = nil,
                     _ done: inout Focused) throws -> Bool {
    let ops = ops ?? ax.ops
    return try focusFieldIfNeeded(el(1), bundleIdentifier: bundle, ax: ops, caretFirst: { role in
      try caretFirstFocus(el(1), role: role, engine: engine, app: "Safari", ax: ops, subrole: subrole(ax), beforeMutating: {},
                          stepping: { step in done.steps += 1; step() }, noted: { done.record = $0 })
    }) { done.clicks += 1 }
  }

  private func caretWrite(_ ax: FakeAX) -> CFRange? {
    guard let write = ax.writes.first(where: { $0.attribute == kAXSelectedTextRangeAttribute }) else { return nil }
    var range = CFRange()
    return AXValueGetValue(write.value as! AXValue, .cfRange, &range) ? range : nil
  }

  // MARK: The route

  /// set_value on a Safari page's unfocused text field: its caret is written at {0, 0}, its focus reads back at once,
  /// and the value is written; nothing writes AXFocused, nothing is pressed or posted. Safari's DOM element, which main
  /// sent straight to the click, takes the same route.
  func testSetValueOnAWebKitFieldFocusesItByTheCaretWrite() throws {
    for domElement in [false, true] {
      let ax = field()
      if domElement { ax.values[1]?["AXDOMClassList"] = ["search"] as CFArray }
      var done = Focused()
      var meta = InputMeta(ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
      try setElementValue("new", on: el(1), role: kAXTextFieldRole, ax: ax.ops, meta: &meta, focus: { _ in try focus(ax, &done) },
                          checkInFlight: {}, acted: {})
      let label = domElement ? "a DOM element" : "a field"
      XCTAssertEqual(ax.writes.map(\.attribute), [kAXSelectedTextRangeAttribute, kAXValueAttribute], label)
      XCTAssertEqual(caretWrite(ax)?.location, 0, label)
      XCTAssertEqual(caretWrite(ax)?.length, 0, label)
      XCTAssertTrue(ax.performs.isEmpty, label)
      XCTAssertEqual(done.clicks, 0, "\(label): no fallback click")
      XCTAssertEqual(done.steps, 1, "\(label): the caret's write, in the method's interval")
      XCTAssertEqual(done.record, TextEntryFocusRecord(focus: .readBack, step: .selection), label)
      XCTAssertEqual(ax.clock, 0, "\(label): read focused at once, no settle")
      XCTAssertEqual(ax.values[1]?[kAXValueAttribute] as? String, "new", label)
    }
  }

  /// select_text on the same field: its caret first, then the selection written; its range was settable already.
  func testSelectTextOnAWebKitFieldFocusesItByTheCaretWrite() throws {
    let ax = field()
    var done = Focused()
    let due = try selectionSettableBeforeFocus(el(1), ax: ax.ops)
    XCTAssertFalse(due)
    try focus(ax, &done)
    try selectionSettableAfterFocus(el(1), ax: ax.ops, due: due)
    _ = ax.ops.write(el(1), kAXSelectedTextRangeAttribute, axRangeValue(CFRange(location: 2, length: 3)))
    XCTAssertEqual(ax.writes.map(\.attribute), [kAXSelectedTextRangeAttribute, kAXSelectedTextRangeAttribute])
    XCTAssertEqual(done.clicks, 0)
    XCTAssertEqual(done.record?.step, .selection)
  }

  /// A field the caret leaves unfocused (Safari's text field, whose AXPress focuses it): after the caret's settle, its
  /// AXPress, read back; still no AXFocused write and no click.
  func testAFieldTheCaretDoesNotFocusIsFocusedByItsPress() throws {
    let ax = field(caretFocuses: false, pressFocuses: true)
    var done = Focused()
    try focus(ax, &done)
    XCTAssertEqual(ax.writes.map(\.attribute), [kAXSelectedTextRangeAttribute])
    XCTAssertEqual(ax.performs.map(\.action), ["AXPress"])
    XCTAssertEqual(done.clicks, 0)
    XCTAssertEqual(done.steps, 2)
    XCTAssertEqual(done.record, TextEntryFocusRecord(focus: .readBack, step: .press))
    XCTAssertEqual(ax.clock, textEntryFocusSettleMs, "the caret's settle, then the press read focused at once")
  }

  /// A field neither step focuses is refused after both settles, and set_value writes nothing of its own; one that
  /// advertises no AXPress is refused after the caret's settle alone, nothing pressed. Never a write of AXFocused or a
  /// click.
  func testAFieldNeitherStepFocusesIsRefusedWithNothingWritten() {
    let stuck = field(caretFocuses: false)
    var done = Focused()
    var meta = InputMeta(ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
    XCTAssertThrowsError(try setElementValue("new", on: el(1), role: kAXTextFieldRole, ax: stuck.ops, meta: &meta,
                                             focus: { _ in try focus(stuck, &done) }, checkInFlight: {}, acted: {})) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "clickUnconfirmed")
      XCTAssertEqual(($0 as? EngineError)?.message, "Safari's text field could not be focused: its caret was written through accessibility, then its accessibility action was performed, but the field does not report focus, so the requested value or selection was not written. Observe Safari with get_app_state before any retry, and never retry blindly.")
    }
    XCTAssertEqual(stuck.writes.map(\.attribute), [kAXSelectedTextRangeAttribute], "no value, no AXFocused")
    XCTAssertEqual(stuck.performs.map(\.action), ["AXPress"])
    XCTAssertEqual(stuck.clock, 2 * textEntryFocusSettleMs)
    XCTAssertEqual(done.clicks, 0)
    XCTAssertEqual(done.record, TextEntryFocusRecord(focus: .notReadBack, step: .press))

    let pressless = field(caretFocuses: false, actions: ["AXShowMenu"])
    var none = Focused()
    XCTAssertThrowsError(try focus(pressless, &none)) {
      XCTAssertEqual(($0 as? EngineError)?.message, "Safari's text field could not be focused: its caret was written through accessibility, but the field does not report focus, so the requested value or selection was not written. Observe Safari with get_app_state before any retry, and never retry blindly.")
    }
    XCTAssertTrue(pressless.performs.isEmpty)
    XCTAssertEqual(pressless.clock, textEntryFocusSettleMs)
    XCTAssertEqual(none.clicks, 0)
    XCTAssertEqual(none.record, TextEntryFocusRecord(focus: .notReadBack, step: .selection))
  }

  /// A caret write the app does not accept is recorded with its AXError, and the press still follows.
  func testACaretWriteThatFailsIsRecordedAndThePressFollows() throws {
    let ax = field(caretFocuses: false, pressFocuses: true)
    var ops = ax.ops
    let write = ops.write
    ops.write = { element, name, value in _ = write(element, name, value); return name == kAXSelectedTextRangeAttribute ? .attributeUnsupported : .success }
    var done = Focused()
    try focus(ax, ops: ops, &done)
    XCTAssertEqual(done.record, TextEntryFocusRecord(focus: .readBack, step: .press, caretWriteError: AXError.attributeUnsupported.rawValue))
  }

  /// A user event before either step stops the route before it changes anything more.
  func testTheInFlightCheckRunsBeforeEachStep() {
    let ax = field(caretFocuses: false, pressFocuses: true)
    var checks = 0
    XCTAssertThrowsError(try caretFirstFocus(el(1), role: kAXTextFieldRole, engine: .other, app: "Safari", ax: ax.ops, subrole: subrole(ax), beforeMutating: {
      checks += 1
      if checks == 2 { throw EngineError(name: "userIntervened", "x") }
    }, stepping: { $0() }, noted: { _ in })) { XCTAssertEqual(($0 as? EngineError)?.errorName, "userIntervened") }
    XCTAssertEqual(ax.writes.map(\.attribute), [kAXSelectedTextRangeAttribute])
    XCTAssertTrue(ax.performs.isEmpty, "stopped before the press")
  }

  // MARK: Who keeps main's path

  /// A password field takes the caret route since the hosted check measured it (20 of 20, ruling eecaccfe), by its
  /// subrole or a subrole that cannot be read: its caret written, no AXFocused write, no click, nothing of it read
  /// beyond its focus. With the one switch off it keeps main's write and click.
  func testAPasswordFieldTakesTheCaretRouteWhileItsSwitchIsOn() throws {
    XCTAssertTrue(caretFirstCoversSecureFields)
    let ax = field(subrole: "AXSecureTextField")
    var done = Focused()
    XCTAssertFalse(try focus(ax, &done), "no fallback click")
    XCTAssertEqual(ax.writes.map(\.attribute), [kAXSelectedTextRangeAttribute], "its caret, no AXFocused write")
    XCTAssertEqual(done.clicks, 0)
    XCTAssertEqual(done.record, TextEntryFocusRecord(focus: .readBack, step: .selection))
    for subrole in [SubroleRead.subrole("AXSecureTextField"), .failed] {
      XCTAssertEqual(fieldFocusRoute(el(1), role: kAXTextFieldRole, engine: .other, roleOf: ax.ops.role, parent: ax.ops.parent,
                                     subrole: { subrole }), .caretFirst, "\(subrole), the switch on")
      XCTAssertEqual(fieldFocusRoute(el(1), role: kAXTextFieldRole, engine: .other, roleOf: ax.ops.role, parent: ax.ops.parent,
                                     subrole: { subrole }, coversSecure: false), .focusWrite, "\(subrole), the switch off")
    }
    XCTAssertEqual(fieldFocusRoute(el(1), role: kAXTextFieldRole, engine: .other, roleOf: ax.ops.role, parent: ax.ops.parent,
                                   subrole: { .none }, coversSecure: false), .caretFirst, "not a password field: the switch is no matter")
  }

  /// An AppKit field, a native field in a WebKit app (no web area above it) and a Chromium or Gecko page's field keep
  /// main's AXFocused write, then the click only when it did not take; nothing of the caret route runs.
  func testAppKitNativeChromiumAndGeckoFieldsKeepTheFocusWrite() throws {
    let cases: [(String, String, PageEngine, String?)] = [
      ("an AppKit field", kAXWindowRole, .other, "com.apple.TextEdit"), ("Safari's native field", "AXToolbar", .other, "com.apple.Safari"),
      ("a Chromium page's field", "AXWebArea", .chromium, "com.google.Chrome"), ("a Gecko page's field", "AXWebArea", .gecko, "org.mozilla.firefox"),
    ]
    for (label, container, engine, bundle) in cases {
      let takes = field(container: container, focusWriteTakes: true)
      var done = Focused()
      XCTAssertFalse(try focus(takes, engine: engine, bundle: bundle, &done), label)
      XCTAssertEqual(takes.writes.map(\.attribute), [kAXFocusedAttribute], "\(label): the write took")
      XCTAssertEqual(done.clicks, 0, label)
      XCTAssertNil(done.record, label)
      let refuses = field(container: container)
      var fallback = Focused()
      XCTAssertTrue(try focus(refuses, engine: engine, bundle: bundle, &fallback), label)
      XCTAssertEqual(refuses.writes.map(\.attribute), [kAXFocusedAttribute], label)
      XCTAssertEqual(fallback.clicks, 1, "\(label): the fallback click, as on main")
      XCTAssertTrue(refuses.performs.isEmpty, label)
    }
  }

  /// A field already focused, or not a field focusFieldIfNeeded acts on (a combo box, a field whose focus is not
  /// settable), is left alone on a WebKit page too.
  func testNothingIsFocusedThatNeedsNoFocusing() throws {
    let focused = field()
    focused.values[1]?[kAXFocusedAttribute] = kCFBooleanTrue
    let combo = field(role: "AXComboBox")
    let unsettable = field()
    unsettable.settable[1]?.remove(kAXFocusedAttribute)
    for ax in [focused, combo, unsettable] {
      var done = Focused()
      XCTAssertFalse(try focus(ax, &done))
      XCTAssertTrue(ax.writes.isEmpty)
      XCTAssertEqual(done.clicks, 0)
      XCTAssertNil(done.record)
    }
  }

  /// The record on the wire (`fieldFocus`).
  func testTheFieldFocusRecordIsOnTheWire() {
    var meta = InputMeta(ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
    XCTAssertNil(meta.wire["fieldFocus"])
    meta.fieldFocus = TextEntryFocusRecord(focus: .readBack, step: .press, caretWriteError: -25205)
    XCTAssertEqual(meta.wire["fieldFocus"] as? NSDictionary, ["focus": "readBack", "focusStep": "press", "caretWriteError": -25205])
    meta.fieldFocus = TextEntryFocusRecord(focus: .readBack, step: .selection)
    XCTAssertEqual(meta.wire["fieldFocus"] as? NSDictionary, ["focus": "readBack", "focusStep": "selection"])
  }

  // MARK: select_text on an AppKit text field (#324's rule 6)

  /// An unfocused NSTextField answers its range not settable until it is focused: select_text focuses it first, by
  /// main's AXFocused write, and checks again, where it was refused before any focus.
  func testSelectTextFocusesAnUnfocusedAppKitFieldBeforeItsRangeCheck() throws {
    let ax = field(container: kAXWindowRole, focusWriteTakes: true)
    ax.settable[1]?.remove(kAXSelectedTextRangeAttribute)
    let editor = ax.onWrite
    ax.onWrite = { id, name, value in
      editor(id, name, value)
      if id == 1, name == kAXFocusedAttribute { ax.settable[1]?.insert(kAXSelectedTextRangeAttribute) }
    }
    var done = Focused()
    let due = try selectionSettableBeforeFocus(el(1), ax: ax.ops)
    XCTAssertTrue(due)
    try focus(ax, bundle: "com.apple.TextEdit", &done)
    XCTAssertNoThrow(try selectionSettableAfterFocus(el(1), ax: ax.ops, due: due))
    XCTAssertEqual(ax.writes.map(\.attribute), [kAXFocusedAttribute])
    XCTAssertEqual(done.clicks, 0)
  }

  /// A field whose range stays unsettable once focused is refused after the focus; an element that needs no focusing
  /// (not a field, or one already focused) is refused before anything is written, as before.
  func testARangeThatStaysUnsettableIsRefused() throws {
    let stays = field(container: kAXWindowRole, focusWriteTakes: true)
    stays.settable[1]?.remove(kAXSelectedTextRangeAttribute)
    let due = try selectionSettableBeforeFocus(el(1), ax: stays.ops)
    var done = Focused()
    try focus(stays, bundle: "com.apple.TextEdit", &done)
    XCTAssertThrowsError(try selectionSettableAfterFocus(el(1), ax: stays.ops, due: due)) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "selectionNotSettable")
    }
    let button = field(role: kAXButtonRole, container: kAXWindowRole)
    button.settable[1]?.remove(kAXSelectedTextRangeAttribute)
    let focused = field(container: kAXWindowRole)
    focused.settable[1]?.remove(kAXSelectedTextRangeAttribute)
    focused.values[1]?[kAXFocusedAttribute] = kCFBooleanTrue
    for ax in [button, focused] {
      XCTAssertThrowsError(try selectionSettableBeforeFocus(el(1), ax: ax.ops)) {
        XCTAssertEqual(($0 as? EngineError)?.errorName, "selectionNotSettable")
      }
      XCTAssertTrue(ax.writes.isEmpty)
    }
  }
}
