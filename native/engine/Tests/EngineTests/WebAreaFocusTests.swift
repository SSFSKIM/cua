import CoreGraphics
import XCTest
@testable import Engine

/// #283: shared mode's focus route for a plain left click into a background web area's text field (WebAreaFocus.swift).
final class WebAreaFocusTests: XCTestCase {
  private final class Node {
    let role: String?
    let subrole: SubroleRead
    let parent: Node?
    let editable: Bool
    let focusSettable: Bool
    init(_ role: String?, subrole: SubroleRead = .none, parent: Node? = nil, editable: Bool = false, focusSettable: Bool = false) {
      (self.role, self.subrole, self.parent, self.editable, self.focusSettable) = (role, subrole, parent, editable, focusSettable)
    }
  }

  private func page() -> Node { Node("AXWebArea", parent: Node("AXGroup", parent: Node("AXWindow"))) }

  private func target(_ hit: Node, walk: inout [String]) -> Result<WebAreaFocusTarget<Node>, WebAreaRefusal> {
    webAreaFocusTarget(hit, role: { $0.role }, subrole: { $0.subrole }, parent: { $0.parent }, editable: { $0.editable },
                       focusSettable: { $0.focusSettable }, walk: &walk)
  }

  private func target(_ hit: Node) -> Result<WebAreaFocusTarget<Node>, WebAreaRefusal> {
    var walk: [String] = []
    return target(hit, walk: &walk)
  }

  func testAFieldHitIsFocusedItself() throws {
    for role in ["AXTextField", "AXTextArea", "AXComboBox", "AXSearchField"] {
      let field = Node(role, parent: page(), editable: true, focusSettable: true)
      let found = try target(field).get()
      XCTAssertTrue(found.element === field, role)
      XCTAssertEqual(found.role, role)
      XCTAssertFalse(found.ancestor, role)
      XCTAssertFalse(found.secure, role)
    }
  }

  /// The probe's contenteditable region: the hit is its text, whose AXFocused is not settable; the region above it is.
  func testAContentEditableTextHitFocusesItsRegion() throws {
    let region = Node("AXTextArea", parent: page(), editable: true, focusSettable: true)
    let text = Node("AXStaticText", parent: Node("AXGroup", parent: region, editable: true), editable: true)
    var walk: [String] = []
    let found = try target(text, walk: &walk).get()
    XCTAssertTrue(found.element === region)
    XCTAssertTrue(found.ancestor)
    XCTAssertEqual(walk, ["AXStaticText", "AXGroup", "AXTextArea"])
  }

  func testTheWalkRefusesWhereNoFieldTakesFocus() {
    XCTAssertEqual(target(Node("AXTextField", parent: page(), editable: true)).failure, .notFocusable, "a field whose AXFocused is not settable")
    XCTAssertEqual(target(Node("AXStaticText", parent: page())).failure, .roleNotAllowed, "up to the web area, no field")
    XCTAssertEqual(target(Node("AXStaticText", parent: Node("AXSlider", parent: page()))).failure, .roleNotAllowed)
    XCTAssertEqual(target(Node("AXStaticText", parent: Node(nil, parent: page()), editable: true)).failure, .incompleteAncestry)
    let outside = Node("AXTextField", parent: Node("AXGroup", parent: Node("AXWindow")), editable: true, focusSettable: true)
    XCTAssertEqual(target(outside).failure, .roleNotAllowed, "a field outside every web area")
    let orphan = Node("AXTextField", parent: Node("AXGroup"), editable: true, focusSettable: true)
    XCTAssertEqual(target(orphan).failure, .incompleteAncestry, "a field whose ancestry ends unread")
  }

  func testAPasswordFieldIsSecureByRoleOrSubrole() throws {
    XCTAssertTrue(try target(Node("AXTextField", subrole: .subrole("AXSecureTextField"), parent: page(), editable: true, focusSettable: true)).get().secure)
    XCTAssertTrue(try target(Node("AXSecureTextField", parent: page(), focusSettable: true)).get().secure)
    XCTAssertFalse(try target(Node("AXTextField", subrole: .subrole("AXSearchField"), parent: page(), editable: true, focusSettable: true)).get().secure)
  }

  /// A password field is an AXTextField known by its subrole alone: a subrole that cannot be read could be one.
  func testAFieldWhoseSubroleReadFailsIsSecure() throws {
    XCTAssertTrue(try target(Node("AXTextField", subrole: .failed, parent: page(), editable: true, focusSettable: true)).get().secure)
    XCTAssertFalse(try target(Node("AXTextField", subrole: .none, parent: page(), editable: true, focusSettable: true)).get().secure,
                   "no subrole is not a failed read")
  }

  // MARK: the focusing click

  private struct Field {
    var focused = false
    var takesFocus = true
    var selection: (location: Int, length: Int)? = (0, 0)
    var takesSelection = true
    var writes: [String] = []
    var offsetAsked = 0
    var checks = 0
  }

  private func focus(_ field: inout Field, secure: Bool = false, offset: Result<Int, CaretNotPlaced> = .success(7)) throws -> WebAreaFocusOutcome {
    var clock: Double = 0
    return try focusPlacingCaret(
      app: "Chrome", secure: secure, beforeMutating: { field.checks += 1 },
      writeFocused: { field.writes.append("AXFocused"); if field.takesFocus { field.focused = true } },
      focused: { field.focused },
      offset: { field.offsetAsked += 1; return offset },
      writeSelection: { offset in field.writes.append("AXSelectedTextRange \(offset)"); if field.takesSelection { field.selection = (offset, 0) } },
      selection: { field.selection },
      now: { clock }, sleep: { clock += $0 })
  }

  func testAFocusedFieldGetsItsCaretAtThePointAndReadsItBack() throws {
    var field = Field()
    XCTAssertEqual(try focus(&field), .placed(7))
    XCTAssertEqual(field.writes, ["AXFocused", "AXSelectedTextRange 7"])
    XCTAssertEqual(field.checks, 2, "the in-flight check before each write")
  }

  /// The probe's contenteditable data: a write answers success and does nothing. Only the read-back counts.
  func testAFocusWriteThatNeverReadsBackTrueAnswersClickUnconfirmed() {
    var field = Field(takesFocus: false)
    XCTAssertThrowsError(try focus(&field)) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "clickUnconfirmed")
    }
    XCTAssertEqual(field.writes, ["AXFocused"], "no caret written into a field that never took focus")
    XCTAssertEqual(field.offsetAsked, 0)
  }

  func testAPasswordFieldIsFocusedOnlyWithNothingOfItRead() throws {
    var field = Field()
    XCTAssertEqual(try focus(&field, secure: true), .notPlaced(.secure))
    XCTAssertEqual(field.writes, ["AXFocused"])
    XCTAssertEqual(field.offsetAsked, 0, "no scan of a secure field")
  }

  func testACaretThatReadsBackElsewhereIsNotPlaced() throws {
    var field = Field(takesSelection: false)
    XCTAssertEqual(try focus(&field), .notPlaced(.selectionMismatch))
    XCTAssertEqual(field.writes, ["AXFocused", "AXSelectedTextRange 7"])
  }

  func testAPointInNoCharacterAndAnUnmappedRegionAreFocusedNotPlaced() throws {
    var field = Field()
    XCTAssertEqual(try focus(&field, offset: .failure(.pointOutsideText)), .notPlaced(.pointOutsideText))
    XCTAssertEqual(field.writes, ["AXFocused"], "never a guessed offset")
    var region = Field()
    XCTAssertEqual(try focus(&region, offset: .failure(.unmapped)), .notPlaced(.unmapped))
  }

  func testAUserEventStopsTheClickBeforeTheFirstWrite() {
    var clock: Double = 0
    var writes = 0
    XCTAssertThrowsError(try focusPlacingCaret(app: "Chrome", secure: false, beforeMutating: { throw EngineError(name: "userIntervened", "stop") },
                                               writeFocused: { writes += 1 }, focused: { true }, offset: { .success(0) },
                                               writeSelection: { _ in writes += 1 }, selection: { (0, 0) },
                                               now: { clock }, sleep: { clock += $0 }))
    XCTAssertEqual(writes, 0)
  }

  // MARK: the caret's offset

  /// "ab\ncd": two lines of 10-point boxes, the first at y 0..<20 (its line break's box at x 20), the second at y 20..<40.
  private func lines(_ point: CGPoint, range: Range<Int> = 0..<5) -> Int? {
    let boxes: [CGRect?] = [CGRect(x: 0, y: 0, width: 10, height: 20), CGRect(x: 10, y: 0, width: 10, height: 20),
                            CGRect(x: 20, y: 0, width: 0, height: 20),
                            CGRect(x: 0, y: 20, width: 10, height: 20), CGRect(x: 10, y: 20, width: 10, height: 20)]
    return caretOffset(at: point, length: 5, range: range, bounds: { boxes[$0] }, isLineBreak: { $0 == 2 })
  }

  func testTheCaretGoesBeforeOrAfterTheCharacterUnderThePoint() {
    XCTAssertEqual(lines(CGPoint(x: 12, y: 5)), 1, "the left half of b")
    XCTAssertEqual(lines(CGPoint(x: 18, y: 5)), 2, "the right half of b")
    XCTAssertEqual(lines(CGPoint(x: 2, y: 25)), 3, "the left half of c")
  }

  func testAPointPastALinesEndIsTheEndOfThatLine() {
    XCTAssertEqual(lines(CGPoint(x: 90, y: 5)), 2, "before the first line's break")
    XCTAssertEqual(lines(CGPoint(x: 90, y: 25)), 5, "the end of the text")
  }

  func testAPointInNoBoxAndPastNoLineEndIsNotPlaced() {
    XCTAssertNil(lines(CGPoint(x: 5, y: 60)), "below every line")
    XCTAssertNil(lines(CGPoint(x: -4, y: 5)), "left of the first character")
    XCTAssertNil(lines(CGPoint(x: 12, y: 5), range: 3..<5), "the line's characters outside the scanned range")
    XCTAssertNil(caretOffset(at: .zero, length: 3, range: 0..<3, bounds: { _ in nil }, isLineBreak: { _ in false }), "no boxes")
    XCTAssertNil(caretOffset(at: .zero, length: caretScanLimit + 1, range: 0..<(caretScanLimit + 1),
                             bounds: { _ in CGRect(x: 0, y: 0, width: 1, height: 1) }, isLineBreak: { _ in false }), "too long to scan")
  }

  /// The rightmost box read is not the line's last when a later character's box failed to read: the line's end is
  /// unknown, so nothing is placed; with every box read, the point is past the text's end.
  func testALineEndIsTakenOnlyWhereItIsEstablished() {
    let boxes: [CGRect?] = [CGRect(x: 0, y: 0, width: 10, height: 20), CGRect(x: 10, y: 0, width: 10, height: 20),
                            CGRect(x: 20, y: 0, width: 10, height: 20)]
    let point = CGPoint(x: 25, y: 5)
    XCTAssertNil(caretOffset(at: point, length: 3, range: 0..<3, bounds: { $0 == 0 ? boxes[0] : nil }, isLineBreak: { _ in false }),
                 "only the first box readable")
    XCTAssertEqual(caretOffset(at: point, length: 3, range: 0..<3, bounds: { boxes[$0] }, isLineBreak: { _ in false }), 3)
    XCTAssertEqual(caretOffset(at: CGPoint(x: 90, y: 5), length: 3, range: 0..<3, bounds: { boxes[$0] }, isLineBreak: { _ in false }), 3,
                   "the end of the text")
    XCTAssertNil(caretOffset(at: CGPoint(x: 90, y: 5), length: 3, range: 0..<2, bounds: { boxes[$0] }, isLineBreak: { _ in false }),
                 "a scan cut short of the line's last character")
  }

  /// "abcd" soft-wrapped after b: the next character's box starts on the line below, read even outside the scanned range.
  func testASoftWrappedLineEndsBeforeItsNextLinesFirstCharacter() {
    let boxes: [CGRect] = [CGRect(x: 0, y: 0, width: 10, height: 20), CGRect(x: 10, y: 0, width: 10, height: 20),
                           CGRect(x: 0, y: 20, width: 10, height: 20), CGRect(x: 10, y: 20, width: 10, height: 20)]
    for range in [0..<4, 0..<2] {
      XCTAssertEqual(caretOffset(at: CGPoint(x: 90, y: 5), length: 4, range: range, bounds: { boxes[$0] }, isLineBreak: { _ in false }), 2,
                     "\(range)")
    }
  }

  /// A line on a display above the primary one (y -100..<-80): a next box read as CGRect.zero lies below it in
  /// coordinates, yet is no box, so the line's end is unknown; a real box on the line below still marks a soft wrap.
  func testAnEmptyNextBoxIsNoSoftWrapAtNegativeScreenCoordinates() {
    let line: [CGRect] = [CGRect(x: 0, y: -100, width: 10, height: 20), CGRect(x: 10, y: -100, width: 10, height: 20)]
    let point = CGPoint(x: 90, y: -95)
    XCTAssertNil(caretOffset(at: point, length: 4, range: 0..<2, bounds: { $0 < 2 ? line[$0] : .zero }, isLineBreak: { _ in false }),
                 "the next boxes empty")
    let wrapped = line + [CGRect(x: 0, y: -80, width: 10, height: 20), CGRect(x: 10, y: -80, width: 10, height: 20)]
    XCTAssertEqual(caretOffset(at: point, length: 4, range: 0..<2, bounds: { wrapped[$0] }, isLineBreak: { _ in false }), 2,
                   "a soft wrap at negative y")
  }

  func testAnEmptyFieldIsPlacedAtZero() {
    XCTAssertEqual(caretOffset(at: CGPoint(x: 50, y: 50), length: 0, range: 0..<0, bounds: { _ in nil }, isLineBreak: { _ in false }), 0)
    XCTAssertEqual(textCaretOffset(at: CGPoint(x: 50, y: 50), value: "", visible: nil, bounds: { _ in nil }), .success(0))
  }

  /// Only a value read as a string is text: a failed read, no value or another type is never taken for an empty field.
  func testAFieldWhoseValueCannotBeReadIsNotPlaced() {
    for value in [nil, 42 as Any, NSNull() as Any] {
      XCTAssertEqual(textCaretOffset(at: CGPoint(x: 50, y: 50), value: value, visible: nil, bounds: { _ in nil }), .failure(.unreadable))
    }
    XCTAssertEqual(textCaretOffset(at: CGPoint(x: 50, y: 50), value: "ab", visible: nil, bounds: { _ in nil }), .failure(.pointOutsideText))
  }

  /// An empty line's only box is its line break: a point there goes before it.
  func testAPointOnAnEmptyLineGoesBeforeItsBreak() {
    let boxes: [CGRect] = [CGRect(x: 0, y: 0, width: 10, height: 20), CGRect(x: 10, y: 0, width: 0, height: 20),
                           CGRect(x: 0, y: 20, width: 0, height: 20)]
    XCTAssertEqual(caretOffset(at: CGPoint(x: 40, y: 30), length: 3, range: 0..<3, bounds: { boxes[$0] }, isLineBreak: { $0 >= 1 }), 2)
  }

  // MARK: the record and the note

  func testTheRecordAndTheNoteSayTheFieldWasFocusedAndWhereTypingGoes() {
    let placed = ElementClickRecord(plan: .action("AXFocused"), reason: .focusField, pressedRole: "AXTextField", pressedAncestor: false,
                                    walk: ["AXTextField"], caret: "placed")
    XCTAssertEqual(placed.wire["reason"] as? String, "focusField")
    XCTAssertEqual(placed.wire["action"] as? String, "AXFocused")
    XCTAssertEqual(placed.wire["caret"] as? String, "placed")
    let notPlaced = ElementClickRecord(plan: .action("AXFocused"), reason: .focusedNotPlaced, pressedRole: "AXTextArea", pressedAncestor: true,
                                       walk: ["AXStaticText", "AXTextArea"], caret: CaretNotPlaced.unmapped.rawValue)
    XCTAssertEqual(notPlaced.wire["reason"] as? String, "focusedNotPlaced")
    XCTAssertEqual(notPlaced.wire["caret"] as? String, "unmapped")
    XCTAssertEqual(notPlaced.wire["pressed"] as? String, "ancestor")
    XCTAssertTrue(focusNote("Chrome", .placed(3)).contains("caret at the point"))
    let note = focusNote("Chrome", .notPlaced(.secure))
    XCTAssertTrue(note.contains("existing selection, or to its start"), note)
    XCTAssertTrue(note.contains("select_text or set_value"), note)
  }
}

private extension Result {
  var failure: Failure? { if case .failure(let error) = self { return error } else { return nil } }
}
