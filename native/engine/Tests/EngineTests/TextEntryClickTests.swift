import ApplicationServices
import XCTest
@testable import Engine

/// #313: an element click whose ladder chose an action, on text entry (WebAreaFocus.swift `textEntryClickRoute`,
/// `carryActionClick`; the design session's ruling c4108490). Safari's shape, from #287's hosted cells (run 42379297174)
/// and the A/B (run 42402098567): a page's AXTextArea advertises AXPress, which answers success and leaves the focus on
/// the web area, while an AXSelectedTextRange write focuses it; AXPress focuses Safari's text field and Firefox's fields.
final class TextEntryClickTests: XCTestCase {
  private final class Node {
    let role: String?
    let parent: Node?
    init(_ role: String?, parent: Node? = nil) { (self.role, self.parent) = (role, parent) }
  }

  /// The fake app: what each step does to the focus, and everything the click did to it.
  private final class App {
    var focused: Node?
    /// AXPress takes the focus (`pressFocusesAfter` ms later); an AXSelectedTextRange write does.
    var pressFocuses = false
    var pressFocusesAfter: Double = 0
    var selectionFocuses = false
    /// The caret's write: its AXError, and whether the range it writes sticks (the app may keep its own).
    var selectionWriteError = AXError.success
    var selectionSticks = true
    var selection: (location: Int, length: Int)? = (5, 2)
    var selectionReads = 0
    var focusReadable = true
    var presses = 0
    var writes: [String] = []
    var reads = 0
    var focusReads = 0
    var sleeps = 0
    var clock: Double = 0
    var pressedAt: Double?
    var record: TextEntryFocusRecord?
    init(focused: Node? = nil) { self.focused = focused }

    /// Every attribute write the click makes; an AXFocused write outside Chromium fails the test (the A/B: it raises
    /// Safari, and a background Firefox ignores it).
    func write(_ element: Node, _ attribute: String, _ value: String) {
      if attribute == "AXFocused" { XCTFail("an AXFocused write on \(element.role ?? "?")") }
      writes.append("\(attribute) \(value)")
      if attribute == "AXSelectedTextRange", selectionFocuses { focused = element }
    }

    func writeCaret(_ element: Node, _ offset: Int) -> AXError {
      write(element, "AXSelectedTextRange", "{\(offset), 0}")
      if selectionWriteError == .success, selectionSticks { selection = (offset, 0) }
      return selectionWriteError
    }
  }

  /// Safari's page: window → split group → tab group → group → group → scroll area → web area → group.
  private func page() -> Node {
    var node = Node("AXWindow")
    for role in ["AXSplitGroup", "AXTabGroup", "AXGroup", "AXGroup", "AXScrollArea", "AXWebArea", "AXGroup"] { node = Node(role, parent: node) }
    return node
  }

  private func route(_ element: Node, engine: PageEngine = .other, app: App) -> TextEntryClickRoute {
    textEntryClickRoute(element, role: element.role ?? "", engine: engine, roleOf: { app.reads += 1; return $0.role },
                        parent: { app.reads += 1; return $0.parent })
  }

  /// The element click as the engine carries it: `press` the ladder's AXPress, the caret's write through `App.write`, the
  /// read-back on `element`; the caret's offset `caret`.
  private func click(_ element: Node, engine: PageEngine = .other, caret: Result<Int, CaretNotPlaced> = .success(3), app: App) throws {
    try carryActionClick(route(element, engine: engine, app: app), app: "Safari", press: {
      app.presses += 1
      app.pressedAt = app.clock
    }, focused: {
      app.focusReads += 1
      guard app.focusReadable else { return nil }
      if app.pressFocuses, let pressed = app.pressedAt, app.clock - pressed >= app.pressFocusesAfter { app.focused = element }
      return app.focused === element
    }, caretOffset: { caret }, writeSelection: { app.writeCaret(element, $0) },
       selection: { app.selectionReads += 1; return app.selection },
       noted: { app.record = $0 }, now: { app.clock }, sleep: { app.sleeps += 1; app.clock += $0 })
  }

  private func assertUnconfirmed(_ body: @autoclosure () throws -> Void, _ message: String = "", file: StaticString = #filePath, line: UInt = #line) {
    XCTAssertThrowsError(try body(), message, file: file, line: line) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "clickUnconfirmed", message, file: file, line: line)
    }
  }

  // MARK: never AXFocused outside Chromium

  func testNoTextEntryRoleOutsideChromiumIsEverWrittenAXFocused() {
    for engine in [PageEngine.other, .gecko] {
      for role in ["AXTextField", "AXTextArea", "AXSearchField", "AXComboBox", "AXSecureTextField"] {
        for parent in [page(), Node("AXWindow")] {  // a page's field and a native one
          let field = Node(role, parent: parent)
          let app = App(focused: parent)
          assertUnconfirmed(try click(field, engine: engine, app: app), "\(engine) \(role)")
          XCTAssertEqual(app.presses, 1, "\(engine) \(role)")
          XCTAssertFalse(app.writes.contains { $0.hasPrefix("AXFocused") }, "\(engine) \(role)")
        }
      }
    }
  }

  // MARK: Safari (WebKit)

  func testSafarisTextAreaIsFocusedByItsCaretWhenItsPressDoesNothing() throws {
    let page = page()
    let field = Node("AXTextArea", parent: page)
    let app = App(focused: page)
    app.selectionFocuses = true
    XCTAssertEqual(route(field, app: app), .pressConfirmingFocus(selecting: true))
    try click(field, app: app)
    XCTAssertTrue(app.focused === field, "the focus reads back on the field, not the web area")
    XCTAssertEqual(app.presses, 1)
    XCTAssertEqual(app.writes, ["AXSelectedTextRange {3, 0}"], "the caret at the element's point")
    XCTAssertEqual(app.record, TextEntryFocusRecord(focus: .readBack, step: .selection, caret: .atPoint(3)))
    XCTAssertEqual(app.clock, textEntryFocusSettleMs, "the press's settle, then the caret's focus and range read at once")
    XCTAssertEqual(app.selectionReads, 1)
  }

  func testACaretThePointCannotPlaceIsWrittenAtTheStart() throws {
    let page = page()
    let field = Node("AXTextArea", parent: page)
    let app = App(focused: page)
    app.selectionFocuses = true
    try click(field, caret: .failure(.noCharacterBoxes), app: app)
    XCTAssertEqual(app.writes, ["AXSelectedTextRange {0, 0}"])
    XCTAssertEqual(app.record?.caret, .atStart(.noCharacterBoxes))
    XCTAssertTrue(caretFocusNote("Safari", .atStart(.noCharacterBoxes)).contains("at the start"))
    XCTAssertTrue(caretFocusNote("Safari", .atPoint(3)).contains("at the point"))
  }

  /// The write's answer is not the caret's place: a write that fails while the focus reads true (the earlier press
  /// focusing late) claims no place, and keeps the write's error.
  func testACaretWriteThatFailsWhileFocusReadsTrueClaimsNoPlace() throws {
    let page = page()
    let field = Node("AXTextArea", parent: page)
    let app = App(focused: page)
    (app.pressFocuses, app.pressFocusesAfter) = (true, textEntryFocusSettleMs + 1)  // after the press's settle
    app.selectionWriteError = .cannotComplete
    try click(field, app: app)
    XCTAssertEqual(app.record, TextEntryFocusRecord(focus: .readBack, step: .selection, caret: .unconfirmed(.selectionMismatch),
                                                    caretWriteError: AXError.cannotComplete.rawValue))
    let note = caretFocusNote("Safari", .unconfirmed(.selectionMismatch))
    XCTAssertTrue(note.contains("could not be confirmed"), note)
    XCTAssertFalse(note.contains("at the point") || note.contains("at the start"), note)
  }

  /// The app takes the focus but keeps its own range: no place is claimed, after the range's settle.
  func testARangeThatDoesNotStickClaimsNoPlace() throws {
    let page = page()
    let field = Node("AXTextArea", parent: page)
    let app = App(focused: page)
    (app.selectionFocuses, app.selectionSticks) = (true, false)
    try click(field, app: app)
    XCTAssertEqual(app.record, TextEntryFocusRecord(focus: .readBack, step: .selection, caret: .unconfirmed(.selectionMismatch)))
    XCTAssertEqual(app.clock, 2 * textEntryFocusSettleMs, "the press's settle, then the range's")
    XCTAssertGreaterThan(app.selectionReads, 1)
  }

  /// A range that arrives during the settle is read back.
  func testARangeThatArrivesLateIsPlaced() {
    var clock: Double = 0
    XCTAssertTrue(readingCaret(3, selection: { clock >= 60 ? (3, 0) : (0, 0) }, now: { clock }, sleep: { clock += $0 }))
    XCTAssertEqual(clock, 60)
    clock = 0
    XCTAssertFalse(readingCaret(3, selection: { (3, 1) }, now: { clock }, sleep: { clock += $0 }), "a selection is no caret")
    XCTAssertEqual(clock, textEntryFocusSettleMs)
  }

  /// A password field's caret is written at 0, and its range never read.
  func testAPasswordFieldsRangeIsNeverRead() throws {
    let page = page()
    let field = Node("AXSecureTextField", parent: page)
    let app = App(focused: page)
    app.selectionFocuses = true
    try click(field, caret: .failure(.secure), app: app)
    XCTAssertEqual(app.writes, ["AXSelectedTextRange {0, 0}"])
    XCTAssertEqual(app.record?.caret, .unconfirmed(.secure))
    XCTAssertEqual(app.selectionReads, 0)
  }

  func testSafarisTextFieldIsFocusedByItsPressAlone() throws {
    let page = page()
    let field = Node("AXTextField", parent: page)
    let app = App(focused: page)
    app.pressFocuses = true
    try click(field, app: app)
    XCTAssertEqual(app.writes, [], "no caret written")
    XCTAssertEqual(app.record, TextEntryFocusRecord(focus: .readBack, step: .press))
    XCTAssertEqual([app.focusReads, app.sleeps], [1, 0], "one read, no wait")
  }

  func testAWebKitFieldThatNeitherStepFocusesAnswersClickUnconfirmed() {
    let page = page()
    let field = Node("AXTextArea", parent: page)
    let app = App(focused: page)
    XCTAssertThrowsError(try click(field, app: app)) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "clickUnconfirmed")
      XCTAssertTrue((error as? EngineError)?.message.contains("then by placing its caret") == true)
    }
    XCTAssertEqual(app.writes, ["AXSelectedTextRange {3, 0}"])
    XCTAssertEqual(app.record, TextEntryFocusRecord(focus: .notReadBack, step: .selection))
    XCTAssertEqual(app.selectionReads, 0, "no range read on an unfocused field")
    XCTAssertEqual(app.clock, 2 * textEntryFocusSettleMs, "each step's settle")
  }

  /// Safari's own toolbar (its address field) is native: no web area above it, so no caret step.
  func testANativeFieldInAWebKitAppGetsNoCaretStep() {
    let field = Node("AXTextField", parent: Node("AXToolbar", parent: Node("AXWindow")))
    let app = App()
    XCTAssertEqual(route(field, app: app), .pressConfirmingFocus(selecting: false))
    assertUnconfirmed(try click(field, app: app))
    XCTAssertEqual(app.writes, [])
  }

  // MARK: Firefox (Gecko)

  func testFirefoxsFieldIsFocusedByItsPressWithNoCaretStep() throws {
    let page = page()
    for role in ["AXTextArea", "AXTextField"] {
      let field = Node(role, parent: page)
      let app = App(focused: page)
      (app.pressFocuses, app.pressFocusesAfter) = (true, 200)  // shared mode's focus sometimes reads late
      XCTAssertEqual(route(field, engine: .gecko, app: app), .pressConfirmingFocus(selecting: false), role)
      XCTAssertEqual(app.reads, 0, "nothing walked in Gecko")
      try click(field, engine: .gecko, app: app)
      XCTAssertEqual(app.record, TextEntryFocusRecord(focus: .readBack, step: .press), role)
      XCTAssertEqual(app.clock, 200, role)
      XCTAssertEqual(app.writes, [], role)
    }
  }

  func testAFirefoxFieldItsPressLeavesUnfocusedAnswersClickUnconfirmed() {
    let page = page()
    let field = Node("AXTextArea", parent: page)
    let app = App(focused: page)
    XCTAssertThrowsError(try click(field, engine: .gecko, app: app)) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "clickUnconfirmed")
      XCTAssertFalse((error as? EngineError)?.message.contains("caret") == true)
    }
    XCTAssertEqual(app.writes, [], "no caret step outside WebKit")
    XCTAssertEqual(app.record, TextEntryFocusRecord(focus: .notReadBack, step: .press))
    XCTAssertEqual(app.clock, textEntryFocusSettleMs)
  }

  // MARK: Chromium, unchanged

  /// A Chromium page's field takes #283's route through the synthesized path (its record advertises no AXPress); where
  /// the ladder did choose an action, it is pressed and read back, with nothing walked and no caret step.
  func testChromiumIsPressedAndReadBackWithNothingWalked() {
    let field = Node("AXTextArea", parent: page())
    let app = App()
    XCTAssertEqual(route(field, engine: .chromium, app: app), .pressConfirmingFocus(selecting: false))
    XCTAssertEqual(app.reads, 0)
  }

  // MARK: native fields

  func testANativeFieldWhoseActionFocusesItAnswersSuccessWithOneReadAndNoWait() throws {
    let field = Node("AXTextField", parent: Node("AXGroup", parent: Node("AXWindow")))
    let app = App()
    app.pressFocuses = true
    XCTAssertEqual(route(field, app: app), .pressConfirmingFocus(selecting: false), "outside every web area")
    try click(field, app: app)
    XCTAssertEqual(app.record, TextEntryFocusRecord(focus: .readBack, step: .press))
    XCTAssertEqual([app.presses, app.focusReads, app.sleeps], [1, 1, 0])
    XCTAssertEqual(app.writes, [])
  }

  // MARK: the read-back

  /// The live read discards every AX error, so no boolean may be a messaging failure or a gone element as well as a field
  /// without the attribute: nothing shows the field took focus, so the click is unconfirmed, recorded `unread`.
  func testAFieldWhoseFocusNeverReadsAnswersClickUnconfirmedRecordedUnread() {
    let field = Node("AXTextField", parent: Node("AXWindow"))
    let app = App()
    app.focusReadable = false
    assertUnconfirmed(try click(field, app: app))
    XCTAssertEqual(app.record, TextEntryFocusRecord(focus: .unread, step: .press))
    XCTAssertEqual(app.clock, textEntryFocusSettleMs, "polled for the settle")
    XCTAssertGreaterThan(app.focusReads, 1)
  }

  /// A read that fails once (a transient messaging error) and then reads true is success; false then nothing, or nothing
  /// then false, is the field read unfocused.
  func testAnUnreadSampleIsPolledLikeAnUnfocusedOne() throws {
    var clock: Double = 0
    var reads: [Bool?] = []
    func reading(_ given: [Bool?]) throws -> FocusReadback {
      (clock, reads) = (0, given)
      return try readingFocus(after: {}, focused: { reads.isEmpty ? nil : reads.removeFirst() }, now: { clock }, sleep: { clock += $0 })
    }
    XCTAssertEqual(try reading([nil, nil, true]), .readBack)
    XCTAssertEqual(clock, 2 * webAreaFocusSampleMs)
    XCTAssertEqual(try reading([false]), .notReadBack)
    XCTAssertEqual(clock, textEntryFocusSettleMs)
    XCTAssertEqual(try reading([nil, false]), .notReadBack, "a false read after an unread one")
  }

  func testTheSettleIs300Ms() {
    XCTAssertEqual(textEntryFocusSettleMs, 300)
  }

  // MARK: everything else

  func testOtherElementsArePressedWithNothingRead() throws {
    for role in ["AXButton", "AXCheckBox", "AXLink", "AXRadioButton", "AXPopUpButton", "AXMenuItem", "AXStaticText", "AXGroup"] {
      let element = Node(role, parent: page())
      let app = App()
      XCTAssertEqual(route(element, app: app), .press, role)
      try click(element, app: app)
      XCTAssertEqual([app.reads, app.focusReads, app.presses], [0, 0, 1], role)
      XCTAssertNil(app.record, role)
    }
  }

  func testThePageEngineIsReadFromThePrincipalClass() {
    XCTAssertEqual(pageEngineOf(info: ["NSPrincipalClass": "GeckoNSApplication"]), .gecko)
    XCTAssertEqual(pageEngineOf(info: ["NSPrincipalClass": "BrowserCrApplication"]), .chromium)
    XCTAssertEqual(pageEngineOf(info: ["NSPrincipalClass": "AtomApplication"]), .chromium)
    XCTAssertEqual(pageEngineOf(info: ["NSPrincipalClass": "NSApplication"]), .other)
    XCTAssertEqual(pageEngineOf(info: [:]), .other)
  }

  func testAPasswordFieldIsKnownByRoleSubroleOrAFailedSubroleRead() {
    XCTAssertTrue(secureTextField(role: "AXSecureTextField", subrole: .none))
    XCTAssertTrue(secureTextField(role: "AXTextField", subrole: .subrole("AXSecureTextField")))
    XCTAssertTrue(secureTextField(role: "AXTextField", subrole: .failed))
    XCTAssertFalse(secureTextField(role: "AXTextField", subrole: .subrole("AXSearchField")))
    XCTAssertFalse(secureTextField(role: "AXTextArea", subrole: .none))
  }

  func testTheRecordNamesTheReadBackAndItsStep() {
    var record = ElementClickRecord(plan: .action("AXPress"), reason: .advertised)
    XCTAssertNil(record.wire["focus"])
    XCTAssertNil(record.wire["focusStep"])
    XCTAssertNil(record.wire["caretWriteError"])
    record.focus = FocusReadback.readBack.rawValue
    record.focusStep = TextEntryFocusRecord.Step.selection.rawValue
    record.caretWriteError = AXError.cannotComplete.rawValue
    XCTAssertEqual(record.wire["focus"] as? String, "readBack")
    XCTAssertEqual(record.wire["focusStep"] as? String, "selection")
    XCTAssertEqual(record.wire["caretWriteError"] as? Int, Int(AXError.cannotComplete.rawValue))
  }
}
