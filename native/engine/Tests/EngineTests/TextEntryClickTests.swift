import XCTest
@testable import Engine

/// #313: an element click whose ladder chose an action, on text entry (WebAreaFocus.swift `textEntryClickRoute`,
/// `carryActionClick`). Safari's shape, from #287's hosted cells (run 42379297174): the page's AXTextArea advertises
/// AXPress, which answers success and leaves the focus on the web area.
final class TextEntryClickTests: XCTestCase {
  private final class Node {
    let role: String?
    let parent: Node?
    let editable: Bool
    let focusSettable: Bool
    init(_ role: String?, parent: Node? = nil, editable: Bool = false, focusSettable: Bool = false) {
      (self.role, self.parent, self.editable, self.focusSettable) = (role, parent, editable, focusSettable)
    }
  }

  /// What the fake app does and what the route read of it.
  private final class App {
    /// The element that holds focus.
    var focused: Node?
    /// What AXPress on the field does: WebKit's leaves the focus where it was; a native field's takes it, `pressFocusesAfter`
    /// ms later.
    var pressFocuses = false
    var pressFocusesAfter: Double = 0
    /// Whether an AXFocused write takes, and whether AXFocused reads at all.
    var focusWriteTakes = true
    var focusReadable = true
    var presses = 0
    var writes: [String] = []
    var reads = 0
    var focusReads = 0
    var sleeps = 0
    var clock: Double = 0
    var pressedAt: Double?
    init(focused: Node?) { self.focused = focused }
  }

  /// Safari's page: window → split group → tab group → group → group → scroll area → web area → group → the field.
  private func safariPage() -> Node {
    let window = Node("AXWindow")
    var node = window
    for role in ["AXSplitGroup", "AXTabGroup", "AXGroup", "AXGroup", "AXScrollArea", "AXWebArea"] { node = Node(role, parent: node) }
    return node
  }

  private func route(_ element: Node, role: String? = nil, chromium: Bool = false, pointed: Bool = true, app: App) -> TextEntryClickRoute<Node> {
    textEntryClickRoute(element, role: role ?? element.role ?? "", chromium: chromium, pointed: pointed,
                        roleOf: { app.reads += 1; return $0.role }, subrole: { _ in app.reads += 1; return .none },
                        parent: { app.reads += 1; return $0.parent }, editable: { app.reads += 1; return $0.editable },
                        focusSettable: { app.reads += 1; return $0.focusSettable })
  }

  /// The element click as the engine carries it: `press` the ladder's AXPress, `focus` #283's route (`focusPlacingCaret`,
  /// the caret at offset 3), the read-back on `element`. Answers the record's focus word, if any.
  @discardableResult
  private func click(_ element: Node, route: TextEntryClickRoute<Node>, app: App) throws -> FocusReadback? {
    var noted: FocusReadback?
    try carryActionClick(route, app: "Safari", press: {
      app.presses += 1
      app.pressedAt = app.clock
    }, focus: { target, _ in
      var selection: (location: Int, length: Int)?
      _ = try focusPlacingCaret(
        app: "Safari", secure: target.secure, fresh: false, beforeMutating: {},
        writeFocused: { app.writes.append("AXFocused"); if app.focusWriteTakes { app.focused = target.element } },
        focused: { app.focused === target.element }, offset: { .success(3) }, sameTarget: { true }, valueLength: { 5 },
        writeSelection: { app.writes.append("AXSelectedTextRange \($0)"); selection = ($0, 0) }, selection: { selection },
        now: { app.clock }, sleep: { app.sleeps += 1; app.clock += $0 })
    }, focused: {
      app.focusReads += 1
      guard app.focusReadable else { return nil }
      if app.pressFocuses, let pressed = app.pressedAt, app.clock - pressed >= app.pressFocusesAfter { app.focused = element }
      return app.focused === element
    }, noted: { noted = $0 }, now: { app.clock }, sleep: { app.sleeps += 1; app.clock += $0 })
    return noted
  }

  // MARK: Safari's shape

  func testASafariTextAreaIsFocusedThroughAXFocusedNotPressed() throws {
    let page = safariPage()
    let field = Node("AXTextArea", parent: Node("AXGroup", parent: page), editable: true, focusSettable: true)
    let app = App(focused: page)
    let carried = route(field, app: app)
    guard case .focus(let target, let walk) = carried else { return XCTFail("not the focus route: \(carried)") }
    XCTAssertTrue(target.element === field)
    XCTAssertFalse(target.ancestor)
    XCTAssertEqual(walk, ["AXTextArea"])
    try click(field, route: carried, app: app)
    XCTAssertTrue(app.focused === field, "the focus reads back on the field, not the web area")
    XCTAssertEqual(app.presses, 0, "the AXPress that does nothing is not sent")
    XCTAssertEqual(app.writes, ["AXFocused", "AXSelectedTextRange 3"])
  }

  func testASafariTextAreaWhoseFocusDoesNotReadBackAnswersClickUnconfirmed() {
    let page = safariPage()
    let field = Node("AXTextArea", parent: Node("AXGroup", parent: page), editable: true, focusSettable: true)
    let app = App(focused: page)
    app.focusWriteTakes = false
    XCTAssertThrowsError(try click(field, route: route(field, app: app), app: app)) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "clickUnconfirmed")
    }
    XCTAssertTrue(app.focused === page)
    XCTAssertEqual(app.presses, 0)
    XCTAssertEqual(app.writes, ["AXFocused"], "no caret written into a field that never took focus")
  }

  func testEveryTextEntryRoleAndAContentEditableTextTakeTheFocusRoute() throws {
    for role in ["AXTextField", "AXTextArea", "AXSearchField", "AXComboBox", "AXSecureTextField"] {
      let field = Node(role, parent: safariPage(), editable: true, focusSettable: true)
      let app = App(focused: nil)
      guard case .focus(let target, _) = route(field, app: app) else { XCTFail(role); continue }
      XCTAssertTrue(target.element === field, role)
      XCTAssertEqual(target.secure, role == "AXSecureTextField", role)
    }
    // A contenteditable region's text, clicked by its token: its region is focused.
    let region = Node("AXTextArea", parent: safariPage(), editable: true, focusSettable: true)
    let text = Node("AXStaticText", parent: region, editable: true)
    guard case .focus(let target, let walk) = route(text, app: App(focused: nil)) else { return XCTFail("the region's text") }
    XCTAssertTrue(target.element === region)
    XCTAssertTrue(target.ancestor)
    XCTAssertEqual(walk, ["AXStaticText", "AXTextArea"])
  }

  /// Where the walk does not resolve a page's field (it cannot take focus), the action goes, and its focus is read back.
  func testAPageFieldTheWalkRefusesIsPressedAndReadBack() {
    let page = safariPage()
    let field = Node("AXTextArea", parent: page, editable: true, focusSettable: false)
    let app = App(focused: page)
    XCTAssertEqual(route(field, app: app).name, "pressConfirmingFocus")
    XCTAssertThrowsError(try click(field, route: route(field, app: app), app: app)) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "clickUnconfirmed")
    }
    XCTAssertEqual(app.presses, 1)
    XCTAssertEqual(app.clock, webAreaFocusSettleMs, "polled for the settle, then refused")
  }

  /// Editable content whose walk finds no field to focus keeps its action alone: the node itself is no field to read.
  func testAContentEditableTextWithNoFocusableFieldIsPressedAlone() throws {
    let region = Node("AXGroup", parent: safariPage(), editable: true)
    let text = Node("AXStaticText", parent: region, editable: true)
    let app = App(focused: nil)
    XCTAssertEqual(route(text, app: app).name, "press")
    XCTAssertEqual(try click(text, route: route(text, app: app), app: app), nil)
    XCTAssertEqual(app.focusReads, 0)
  }

  /// With no clickable point there is nowhere to put the caret: the action, read back.
  func testAFieldWithNoPointIsPressedAndReadBack() {
    let field = Node("AXTextField", parent: safariPage(), editable: true, focusSettable: true)
    let app = App(focused: nil)
    XCTAssertEqual(route(field, pointed: false, app: app).name, "pressConfirmingFocus")
  }

  // MARK: Chromium, unchanged

  /// A Chromium page's field takes #283's route through the synthesized path (its record advertises no AXPress); where
  /// the ladder did choose an action, it is pressed, never routed here to AXFocused, and its focus is read back.
  func testChromiumNeverTakesTheFocusRouteHere() {
    let page = safariPage()
    let field = Node("AXTextArea", parent: page, editable: true, focusSettable: true)
    let app = App(focused: page)
    XCTAssertEqual(route(field, chromium: true, app: app).name, "pressConfirmingFocus")
    XCTAssertEqual(app.reads, 0, "nothing walked in Chromium")
    let text = Node("AXStaticText", parent: field, editable: true)
    XCTAssertEqual(route(text, chromium: true, app: app).name, "press")
    XCTAssertEqual(app.reads, 0, "no editable read in Chromium")
  }

  // MARK: native fields

  func testANativeFieldWhoseActionFocusesItAnswersSuccessWithOneReadAndNoWait() throws {
    let window = Node("AXWindow")
    let field = Node("AXTextField", parent: Node("AXGroup", parent: window), focusSettable: true)
    let app = App(focused: nil)
    app.pressFocuses = true
    let carried = route(field, app: app)
    XCTAssertEqual(carried.name, "pressConfirmingFocus", "outside every web area")
    XCTAssertEqual(try click(field, route: carried, app: app), .readBack)
    XCTAssertEqual(app.presses, 1)
    XCTAssertEqual(app.focusReads, 1, "one read")
    XCTAssertEqual(app.sleeps, 0, "no wait")
    XCTAssertEqual(app.writes, [], "no AXFocused write")
  }

  func testANativeFieldFocusedShortlyAfterItsActionAnswersSuccess() throws {
    let field = Node("AXTextArea", parent: Node("AXScrollArea", parent: Node("AXWindow")), focusSettable: true)
    let app = App(focused: nil)
    (app.pressFocuses, app.pressFocusesAfter) = (true, 100)
    XCTAssertEqual(try click(field, route: route(field, app: app), app: app), .readBack)
    XCTAssertEqual(app.clock, 100)
  }

  func testANativeFieldTheActionLeavesUnfocusedAnswersClickUnconfirmed() {
    let field = Node("AXTextField", parent: Node("AXWindow"), focusSettable: true)
    let app = App(focused: nil)
    XCTAssertThrowsError(try click(field, route: route(field, app: app), app: app)) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "clickUnconfirmed")
      XCTAssertTrue((error as? EngineError)?.message.contains("does not report focus") == true)
    }
    XCTAssertEqual(app.presses, 1)
    XCTAssertEqual(app.clock, webAreaFocusSettleMs)
  }

  /// The live read discards every AX error, so no boolean may be a messaging failure or a gone element as well as a field
  /// without the attribute: nothing shows the field took focus, so the click is unconfirmed, recorded `unread`.
  func testAFieldWhoseFocusNeverReadsAnswersClickUnconfirmedRecordedUnread() {
    let field = Node("AXTextField", parent: Node("AXWindow"), focusSettable: true)
    let app = App(focused: nil)
    app.focusReadable = false
    var noted: FocusReadback?
    XCTAssertThrowsError(try carryActionClick(route(field, app: app), app: "TextEdit", press: { app.presses += 1 }, focus: { _, _ in },
                                              focused: { app.focusReads += 1; return nil }, noted: { noted = $0 },
                                              now: { app.clock }, sleep: { app.sleeps += 1; app.clock += $0 })) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "clickUnconfirmed")
    }
    XCTAssertEqual(noted, .unread)
    XCTAssertEqual(app.presses, 1)
    XCTAssertEqual(app.clock, webAreaFocusSettleMs, "polled for the settle")
    XCTAssertGreaterThan(app.focusReads, 1)
  }

  /// A read that fails once (a transient messaging error) and then reads true is success; one that reads false and then
  /// nothing is the field read unfocused.
  func testAnUnreadSampleIsPolledLikeAnUnfocusedOne() throws {
    var clock: Double = 0
    var reads: [Bool?] = [nil, nil, true]
    XCTAssertEqual(try pressReadingFocus(focused: { reads.isEmpty ? nil : reads.removeFirst() }, now: { clock },
                                         sleep: { clock += $0 }, press: {}), .readBack)
    XCTAssertEqual(clock, 2 * webAreaFocusSampleMs)
    clock = 0
    reads = [false]
    XCTAssertEqual(try pressReadingFocus(focused: { reads.isEmpty ? nil : reads.removeFirst() }, now: { clock },
                                         sleep: { clock += $0 }, press: {}), .notReadBack)
    XCTAssertEqual(clock, webAreaFocusSettleMs)
    clock = 0
    reads = [nil, false]
    XCTAssertEqual(try pressReadingFocus(focused: { reads.isEmpty ? nil : reads.removeFirst() }, now: { clock },
                                         sleep: { clock += $0 }, press: {}), .notReadBack, "a false read after an unread one")
  }

  // MARK: everything else

  func testOtherElementsArePressedWithNothingRead() throws {
    for role in ["AXButton", "AXCheckBox", "AXLink", "AXRadioButton", "AXPopUpButton", "AXMenuItem", "AXRow", "AXCell"] {
      let element = Node(role, parent: safariPage(), focusSettable: true)
      let app = App(focused: nil)
      XCTAssertEqual(route(element, app: app).name, "press", role)
      XCTAssertEqual(try click(element, route: route(element, app: app), app: app), nil, role)
      XCTAssertEqual(app.reads, 0, role)
      XCTAssertEqual(app.focusReads, 0, role)
      XCTAssertEqual(app.presses, 1, role)
    }
    // A plain node outside editable content costs its AXEditableAncestor read and is pressed.
    let app = App(focused: nil)
    XCTAssertEqual(route(Node("AXStaticText", parent: safariPage()), app: app).name, "press")
    XCTAssertEqual(app.reads, 1)
  }

  func testTheRecordNamesTheReadBack() {
    var record = ElementClickRecord(plan: .action("AXPress"), reason: .advertised)
    XCTAssertNil(record.wire["focus"])
    record.focus = FocusReadback.readBack.rawValue
    XCTAssertEqual(record.wire["focus"] as? String, "readBack")
  }
}

private extension TextEntryClickRoute {
  var name: String {
    switch self {
    case .focus: return "focus"
    case .pressConfirmingFocus: return "pressConfirmingFocus"
    case .press: return "press"
    }
  }
}
