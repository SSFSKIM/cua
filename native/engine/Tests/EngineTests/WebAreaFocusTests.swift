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

  /// A Chromium textarea as #341's measurement found it (run 42568677106): AXSelectedTextRange written on it unfocused
  /// focuses it and leaves its scroll; AXFocused focuses it and scrolls it to its existing caret, so a character's box
  /// read after focus need not be where it was.
  private struct Field {
    var focused = false
    /// AXFocused focuses it.
    var takesFocus = true
    /// AXSelectedTextRange focuses it (Chromium's textarea, #341).
    var selectionFocuses = true
    var selection: (location: Int, length: Int)? = (0, 0)
    var takesSelection = true
    /// AXFocused puts the selection back where the field kept it (its existing caret).
    var focusRestoresSelection = false
    /// How far each write moves the field's text on screen (a scroll), in points.
    var focusScrolls: CGFloat = 0
    var selectionScrolls: CGFloat = 0
    /// The value's length after the caret's write (a focus handler filling the field), where it changes.
    var lengthAfterSelection: Int? = nil
    /// The reference character's box can be read.
    var markReadable = true
    var markY: CGFloat = 100
    var writes: [String] = []
    /// Every read and write in order: `offset`, `check` (the in-flight check), `mark`, and the writes.
    var trace: [String] = []
    var offsetAsked = 0
    var checks = 0
    /// The in-flight check throws on this call (1-based).
    var intervenesOnCheck: Int? = nil
    /// The process's accessibility is fresh (#282's rule): empty boxes are waited for.
    var fresh = false
    /// What the re-validation after a wait reads (the clock past 0): the element, the value's length (5 before).
    var sameTarget = true
    var lengthAfterWait: Int? = 5
    /// The value's length when nothing has waited (5, or 0 for an empty field).
    var length = 5
    /// From this time the field is a password field: it no longer requalifies, and no read may follow.
    var secureFrom: Double = .infinity
    var readsWhileSecure = 0
    var elapsed: Double = 0
    var record: WebAreaFocusRecord? = nil
  }

  private func focus(_ field: inout Field, secure: Bool = false, offset: Result<Int, CaretNotPlaced> = .success(7),
                     beforeCaret: @escaping () throws -> Void = {}) throws -> WebAreaFocusOutcome {
    try focus(&field, secure: secure, offsetAt: { _ in offset }, beforeCaret: beforeCaret)
  }

  /// `offsetAt` answers by the clock (ms since the click began), so boxes can appear during the wait.
  private func focus(_ field: inout Field, secure: Bool = false, offsetAt: @escaping (Double) -> Result<Int, CaretNotPlaced>,
                     beforeCaret: @escaping () throws -> Void = {}) throws -> WebAreaFocusOutcome {
    var clock: Double = 0
    defer { field.elapsed = clock }
    return try focusPlacingCaret(
      app: "Chrome", secure: secure, fresh: field.fresh,
      beforeMutating: {
        field.checks += 1
        field.trace.append("check")
        if field.checks == field.intervenesOnCheck { throw EngineError(name: "userIntervened", "stop") }
      },
      beforeCaret: beforeCaret,
      writeFocused: {
        field.writes.append("AXFocused"); field.trace.append("AXFocused")
        guard field.takesFocus else { return }
        field.focused = true
        field.markY -= field.focusScrolls
        if field.focusRestoresSelection { field.selection = (0, 0) }
      },
      focused: { field.focused },
      offset: {
        field.offsetAsked += 1
        field.trace.append("offset")
        if clock >= field.secureFrom { field.readsWhileSecure += 1 }
        return offsetAt(clock)
      },
      sameTarget: { field.sameTarget && clock < field.secureFrom },
      valueLength: { clock > 0 ? field.lengthAfterWait : field.length },
      layoutMark: {
        field.trace.append("mark")
        return field.markReadable ? CGRect(x: 40, y: field.markY, width: 10, height: 20) : nil
      },
      writeSelection: { offset in
        field.writes.append("AXSelectedTextRange \(offset)"); field.trace.append("AXSelectedTextRange \(offset)")
        if field.takesSelection { field.selection = (offset, 0) }
        if field.selectionFocuses { field.focused = true }
        field.markY -= field.selectionScrolls
        if let filled = field.lengthAfterSelection { field.length = filled }
      },
      selection: { field.selection },
      noted: { field.record = $0 },
      now: { clock }, sleep: { clock += $0 })
  }

  // MARK: boxes not there yet (the design session's ruling 37d4c12c)

  private func boxesFrom(_ ms: Double) -> (Double) -> Result<Int, CaretNotPlaced> {
    { $0 >= ms ? .success(7) : .failure(.noCharacterBoxes) }
  }

  /// #341: the boxes are waited for before any write (a fresh Chromium fills them unfocused), so the offset comes from
  /// the layout the screenshot showed; the caret's write then focuses the field.
  func testBoxesThatAppearDuringTheWaitInAFreshProcessArePlacedWithNothingWrittenBefore() throws {
    var field = Field(fresh: true)
    XCTAssertEqual(try focus(&field, offsetAt: boxesFrom(1_600)), .placed(7))
    XCTAssertEqual(field.writes, ["AXSelectedTextRange 7"], "nothing written until the boxes came, then the caret alone")
    XCTAssertEqual(field.offsetAsked, 17, "the first read and a re-read every 100 ms up to 1.6 s")
    XCTAssertEqual(Array(field.trace.suffix(5)), ["offset", "mark", "check", "AXSelectedTextRange 7", "mark"],
                   "the offset, the reference box, the in-flight check just before the write, and the box again")
  }

  /// The wait before focus is no longer than the wait after it was (#292's deadline, `webAreaRereadDeadline`).
  func testBoxesThatNeverAppearAreNoCharacterBoxesAtTwoSecondsAndTheFieldIsFocused() throws {
    var field = Field(fresh: true)
    XCTAssertEqual(try focus(&field, offsetAt: boxesFrom(.infinity)), .notPlaced(.noCharacterBoxes))
    XCTAssertEqual(field.writes, ["AXFocused"], "no offset: focused as before, by AXFocused")
    XCTAssertEqual(field.elapsed, webAreaActionRereadMs)
    XCTAssertEqual(field.offsetAsked, 21)
    XCTAssertEqual(field.record?.step, .focused)
  }

  func testAProcessThatIsNotFreshIsNotWaitedFor() throws {
    var field = Field(fresh: false)
    XCTAssertEqual(try focus(&field, offsetAt: boxesFrom(100)), .notPlaced(.noCharacterBoxes))
    XCTAssertEqual(field.offsetAsked, 1)
    XCTAssertEqual(field.elapsed, 0, "no wait at all")
  }

  /// After a wait the field must still be the same element and hold a value of the same length. It is not focused yet
  /// (#341: nothing is written before the offset), so focus is no condition.
  func testAReReadOffsetThatNoLongerValidatesIsNoCharacterBoxesWithNoRangeWritten() throws {
    for (why, change) in [("another element", { (f: inout Field) in f.sameTarget = false }),
                          ("the value's length changed", { (f: inout Field) in f.lengthAfterWait = 6 }),
                          ("the value unreadable", { (f: inout Field) in f.lengthAfterWait = nil })] {
      var field = Field(fresh: true)
      change(&field)
      XCTAssertEqual(try focus(&field, offsetAt: boxesFrom(300)), .notPlaced(.noCharacterBoxes), why)
      XCTAssertEqual(field.writes, ["AXFocused"], why)
    }
    var unfocused = Field(fresh: true)
    XCTAssertEqual(try focus(&unfocused, offsetAt: boxesFrom(300)), .placed(7), "an unfocused field validates")
    XCTAssertEqual(unfocused.writes, ["AXSelectedTextRange 7"])
    var unchanged = Field(fresh: true)
    XCTAssertEqual(try focus(&unchanged, offsetAt: { _ in .success(7) }), .placed(7), "no wait, no re-validation")
  }

  /// A field that turns into a password field during the wait is requalified before each re-read: nothing of it is read.
  func testAFieldThatBecomesSecureDuringTheWaitIsNotReadAgain() throws {
    var field = Field(fresh: true, secureFrom: 500)
    XCTAssertEqual(try focus(&field, offsetAt: boxesFrom(1_600)), .notPlaced(.noCharacterBoxes))
    XCTAssertEqual(field.readsWhileSecure, 0)
    XCTAssertEqual(field.offsetAsked, 5, "the first read and the re-reads at 100 to 400 ms")
    XCTAssertEqual(field.elapsed, 500, "the wait stops there")
    XCTAssertEqual(field.writes, ["AXFocused"], "focused only, as a password field is")
  }

  func testAnotherAnswerOnAReReadIsTheAnswer() throws {
    for found in [CaretNotPlaced.pointOutsideText, .unmapped] {
      var field = Field(fresh: true)
      XCTAssertEqual(try focus(&field, offsetAt: { $0 >= 500 ? .failure(found) : .failure(.noCharacterBoxes) }), .notPlaced(found))
      XCTAssertEqual(field.offsetAsked, 6, "stopped at the first answer that is not noCharacterBoxes")
      XCTAssertEqual(field.writes, ["AXFocused"])
    }
  }

  /// #341: the offset comes first, from the unfocused layout, and the caret's write focuses the field; AXFocused, which
  /// scrolls Chromium's textarea to its existing caret, is not written.
  func testTheCaretIsWrittenFirstAndFocusesTheField() throws {
    var field = Field()
    XCTAssertEqual(try focus(&field), .placed(7))
    XCTAssertEqual(field.writes, ["AXSelectedTextRange 7"])
    XCTAssertEqual(field.trace, ["offset", "mark", "check", "AXSelectedTextRange 7", "mark"])
    XCTAssertEqual(field.record, WebAreaFocusRecord(step: .selection, markShift: 0))
  }

  /// A caret's write that does not focus the field within the settle: AXFocused, the in-flight check before it, and the
  /// selection read back again (not written again).
  func testACaretWriteThatDoesNotFocusFallsBackToAXFocusedAndRereadsTheCaret() throws {
    var field = Field(selectionFocuses: false)
    XCTAssertEqual(try focus(&field), .placed(7))
    XCTAssertEqual(field.writes, ["AXSelectedTextRange 7", "AXFocused"])
    XCTAssertEqual(field.checks, 2, "the in-flight check before each write")
    XCTAssertEqual(field.elapsed, webAreaFocusSettleMs, "the caret's write waited the settle for focus")
    XCTAssertEqual(field.record?.step, .focused)
    var restored = Field(selectionFocuses: false, focusRestoresSelection: true)
    XCTAssertEqual(try focus(&restored), .notPlaced(.selectionMismatch), "focus put the caret back elsewhere")
    XCTAssertEqual(restored.writes, ["AXSelectedTextRange 7", "AXFocused"])
  }

  /// The design session's condition (ruling 1ea561bc:544): placed only where the scroll is shown unchanged, by the
  /// reference character's box read before the writes and after the read-back. A field the focus scrolls, or the caret's
  /// write scrolls, or whose box cannot be read again, is focused with its caret not claimed.
  func testAFieldThatScrollsWhileTakingFocusIsNotPlaced() throws {
    var scrolledByFocus = Field(selectionFocuses: false, focusScrolls: 640)
    XCTAssertEqual(try focus(&scrolledByFocus), .notPlaced(.layoutMoved))
    XCTAssertEqual(scrolledByFocus.writes, ["AXSelectedTextRange 7", "AXFocused"])
    XCTAssertEqual(scrolledByFocus.record, WebAreaFocusRecord(step: .focused, markShift: 640))
    var scrolledByCaret = Field(selectionScrolls: 5)
    XCTAssertEqual(try focus(&scrolledByCaret), .notPlaced(.layoutMoved))
    var withinAPoint = Field(selectionScrolls: 0.75)
    XCTAssertEqual(try focus(&withinAPoint), .placed(7), "a shift within a point is no scroll")
    var unreadable = Field(markReadable: false)
    XCTAssertEqual(try focus(&unreadable), .notPlaced(.layoutMoved), "a box that cannot be read shows nothing")
    XCTAssertNil(unreadable.record?.markShift)
  }

  /// An empty field has no character to scroll: its caret at 0 is placed without a reference box.
  func testAnEmptyFieldIsPlacedWithoutAReferenceBox() throws {
    var field = Field(markReadable: false, length: 0)
    XCTAssertEqual(try focus(&field, offset: .success(0)), .placed(0))
    XCTAssertEqual(field.writes, ["AXSelectedTextRange 0"])
  }

  /// The review of #341 (round 1, P2): the empty field's exemption holds only while it is still empty at read-back. A
  /// focus handler that fills it (and may scroll it) while the caret reads {0, 0} leaves its place unproven, with no
  /// reference box from before the writes.
  func testAFieldFilledWhileTakingFocusIsNotPlacedWithoutAReferenceBox() throws {
    var field = Field(lengthAfterSelection: 100, markReadable: false, length: 0)
    XCTAssertEqual(try focus(&field, offset: .success(0)), .notPlaced(.layoutMoved))
    XCTAssertEqual(field.writes, ["AXSelectedTextRange 0"])
  }

  /// The probe's contenteditable data: a write answers success and does nothing. Only the read-back counts.
  func testAFieldThatNeverReadsFocusedAnswersClickUnconfirmed() {
    var field = Field(takesFocus: false, selectionFocuses: false)
    XCTAssertThrowsError(try focus(&field)) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "clickUnconfirmed")
    }
    XCTAssertEqual(field.writes, ["AXSelectedTextRange 7", "AXFocused"], "the caret, then AXFocused, neither taking")
    var noOffset = Field(takesFocus: false)
    XCTAssertThrowsError(try focus(&noOffset, offset: .failure(.pointOutsideText))) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "clickUnconfirmed")
    }
    XCTAssertEqual(noOffset.writes, ["AXFocused"])
  }

  func testAPasswordFieldIsFocusedOnlyWithNothingOfItRead() throws {
    var field = Field()
    XCTAssertEqual(try focus(&field, secure: true), .notPlaced(.secure))
    XCTAssertEqual(field.writes, ["AXFocused"])
    XCTAssertEqual(field.offsetAsked, 0, "no scan of a secure field")
    XCTAssertFalse(field.trace.contains("mark"), "nor its boxes")
  }

  func testACaretThatReadsBackElsewhereIsNotPlaced() throws {
    var field = Field(takesSelection: false)
    XCTAssertEqual(try focus(&field), .notPlaced(.selectionMismatch))
    XCTAssertEqual(field.writes, ["AXSelectedTextRange 7"])
  }

  func testAPointInNoCharacterAndAnUnmappedRegionAreFocusedNotPlaced() throws {
    var field = Field()
    XCTAssertEqual(try focus(&field, offset: .failure(.pointOutsideText)), .notPlaced(.pointOutsideText))
    XCTAssertEqual(field.writes, ["AXFocused"], "never a guessed offset: focused by AXFocused")
    XCTAssertEqual(field.trace, ["offset", "check", "AXFocused"])
    var region = Field()
    XCTAssertEqual(try focus(&region, offset: .failure(.unmapped)), .notPlaced(.unmapped))
    XCTAssertEqual(region.writes, ["AXFocused"])
  }

  /// #296's guard after the boxes' wait now runs before any write (#341): its refusal is the click's answer, with
  /// nothing written, whether the wait found an offset or not.
  func testAScreenChangedAfterTheWaitIsRefusedWithNothingWritten() throws {
    for offsetAt in [boxesFrom(300), boxesFrom(.infinity)] {
      var field = Field(fresh: true)
      XCTAssertThrowsError(try focus(&field, offsetAt: offsetAt, beforeCaret: { throw EngineError(name: "screenChangedSinceScreenshot", "changed") })) {
        XCTAssertEqual(($0 as? EngineError)?.errorName, "screenChangedSinceScreenshot")
      }
      XCTAssertEqual(field.writes, [])
    }
  }

  func testAUserEventStopsTheClickBeforeTheFirstWrite() {
    for offset in [Result<Int, CaretNotPlaced>.success(7), .failure(.pointOutsideText)] {
      var field = Field(intervenesOnCheck: 1)
      XCTAssertThrowsError(try focus(&field, offset: offset))
      XCTAssertEqual(field.writes, [], "\(offset)")
    }
    var secure = Field(intervenesOnCheck: 1)
    XCTAssertThrowsError(try focus(&secure, secure: true))
    XCTAssertEqual(secure.writes, [])
    var between = Field(selectionFocuses: false, intervenesOnCheck: 2)
    XCTAssertThrowsError(try focus(&between), "a user event during the caret's settle stops the fallback")
    XCTAssertEqual(between.writes, ["AXSelectedTextRange 7"])
  }

  // MARK: the caret's offset

  /// "ab\ncd": two lines of 10-point boxes, the first at y 0..<20 (its line break's box at x 20), the second at y 20..<40.
  private func lines(_ point: CGPoint, range: Range<Int> = 0..<5) -> Result<Int, CaretNotPlaced> {
    let boxes: [CGRect?] = [CGRect(x: 0, y: 0, width: 10, height: 20), CGRect(x: 10, y: 0, width: 10, height: 20),
                            CGRect(x: 20, y: 0, width: 0, height: 20),
                            CGRect(x: 0, y: 20, width: 10, height: 20), CGRect(x: 10, y: 20, width: 10, height: 20)]
    return caretOffset(at: point, length: 5, range: range, bounds: { boxes[$0] }, isLineBreak: { $0 == 2 }, mayLackBox: { _ in false })
  }

  private let outside = Result<Int, CaretNotPlaced>.failure(.pointOutsideText)

  func testTheCaretGoesBeforeOrAfterTheCharacterUnderThePoint() {
    XCTAssertEqual(lines(CGPoint(x: 12, y: 5)), .success(1), "the left half of b")
    XCTAssertEqual(lines(CGPoint(x: 18, y: 5)), .success(2), "the right half of b")
    XCTAssertEqual(lines(CGPoint(x: 2, y: 25)), .success(3), "the left half of c")
  }

  func testAPointPastALinesEndIsTheEndOfThatLine() {
    XCTAssertEqual(lines(CGPoint(x: 90, y: 5)), .success(2), "before the first line's break")
    XCTAssertEqual(lines(CGPoint(x: 90, y: 25)), .success(5), "the end of the text")
  }

  func testAPointInNoBoxAndPastNoLineEndIsNotPlaced() {
    XCTAssertEqual(lines(CGPoint(x: 5, y: 60)), outside, "below every line")
    XCTAssertEqual(lines(CGPoint(x: -4, y: 5)), outside, "left of the first character")
    XCTAssertEqual(lines(CGPoint(x: 12, y: 5), range: 3..<5), outside, "the line's characters outside the scanned range")
  }

  /// #290: a text longer than the linear scan's reach is searched, no longer refused for its length (CaretSearchTests).
  func testATextLongerThanTheScanLimitIsSearched() {
    XCTAssertEqual(caretOffset(at: CGPoint(x: 0.75, y: 0.5), length: caretScanLimit + 1, range: 0..<(caretScanLimit + 1),
                               bounds: { CGRect(x: CGFloat($0), y: 0, width: 1, height: 1) }, isLineBreak: { _ in false }, mayLackBox: { _ in false }),
                   .success(1))
  }

  /// Before Chromium's complete accessibility mode every character's box is empty: that is told apart from boxes read
  /// with none at the point.
  func testATextWithNoUsableBoxIsNoCharacterBoxes() {
    let none = Result<Int, CaretNotPlaced>.failure(.noCharacterBoxes)
    XCTAssertEqual(caretOffset(at: .zero, length: 3, range: 0..<3, bounds: { _ in nil }, isLineBreak: { _ in false }, mayLackBox: { _ in false }), none, "no boxes")
    XCTAssertEqual(caretOffset(at: .zero, length: 3, range: 0..<3, bounds: { _ in .zero }, isLineBreak: { _ in false }, mayLackBox: { _ in false }), none, "empty boxes")
    XCTAssertEqual(caretOffset(at: CGPoint(x: 5, y: 5), length: 3, range: 0..<3, bounds: { CGRect(x: CGFloat($0) * 10, y: 0, width: 0, height: 20) },
                               isLineBreak: { _ in false }, mayLackBox: { _ in false }), none, "zero-width boxes, no line break among them")
    XCTAssertEqual(lines(CGPoint(x: 5, y: 60)), outside, "boxes read, none at the point")
  }

  /// The rightmost box read is not the line's last when a later character's box failed to read: the line's end is
  /// unknown, so nothing is placed; with every box read, the point is past the text's end.
  func testALineEndIsTakenOnlyWhereItIsEstablished() {
    let boxes: [CGRect?] = [CGRect(x: 0, y: 0, width: 10, height: 20), CGRect(x: 10, y: 0, width: 10, height: 20),
                            CGRect(x: 20, y: 0, width: 10, height: 20)]
    let point = CGPoint(x: 25, y: 5)
    XCTAssertEqual(caretOffset(at: point, length: 3, range: 0..<3, bounds: { $0 == 0 ? boxes[0] : nil }, isLineBreak: { _ in false }, mayLackBox: { _ in false }),
                   .failure(.boxesIncomplete), "only the first box readable: a miss with boxes missing")
    XCTAssertEqual(caretOffset(at: point, length: 3, range: 0..<3, bounds: { boxes[$0] }, isLineBreak: { _ in false }, mayLackBox: { _ in false }), .success(3))
    XCTAssertEqual(caretOffset(at: CGPoint(x: 90, y: 5), length: 3, range: 0..<3, bounds: { boxes[$0] }, isLineBreak: { _ in false }, mayLackBox: { _ in false }),
                   .success(3), "the end of the text")
    XCTAssertEqual(caretOffset(at: CGPoint(x: 90, y: 5), length: 3, range: 0..<2, bounds: { boxes[$0] }, isLineBreak: { _ in false }, mayLackBox: { _ in false }),
                   outside, "a scan cut short of the line's last character")
  }

  /// "abcd" soft-wrapped after b: the next character's box starts on the line below, read even outside the scanned range.
  func testASoftWrappedLineEndsBeforeItsNextLinesFirstCharacter() {
    let boxes: [CGRect] = [CGRect(x: 0, y: 0, width: 10, height: 20), CGRect(x: 10, y: 0, width: 10, height: 20),
                           CGRect(x: 0, y: 20, width: 10, height: 20), CGRect(x: 10, y: 20, width: 10, height: 20)]
    for range in [0..<4, 0..<2] {
      XCTAssertEqual(caretOffset(at: CGPoint(x: 90, y: 5), length: 4, range: range, bounds: { boxes[$0] }, isLineBreak: { _ in false }, mayLackBox: { _ in false }),
                     .success(2), "\(range)")
    }
  }

  /// A line on a display above the primary one (y -100..<-80): a next box read as CGRect.zero lies below it in
  /// coordinates, yet is no box, so the line's end is unknown; a real box on the line below still marks a soft wrap.
  func testAnEmptyNextBoxIsNoSoftWrapAtNegativeScreenCoordinates() {
    let line: [CGRect] = [CGRect(x: 0, y: -100, width: 10, height: 20), CGRect(x: 10, y: -100, width: 10, height: 20)]
    let point = CGPoint(x: 90, y: -95)
    XCTAssertEqual(caretOffset(at: point, length: 4, range: 0..<2, bounds: { $0 < 2 ? line[$0] : .zero }, isLineBreak: { _ in false }, mayLackBox: { _ in false }),
                   outside, "the next boxes empty")
    let wrapped = line + [CGRect(x: 0, y: -80, width: 10, height: 20), CGRect(x: 10, y: -80, width: 10, height: 20)]
    XCTAssertEqual(caretOffset(at: point, length: 4, range: 0..<2, bounds: { wrapped[$0] }, isLineBreak: { _ in false }, mayLackBox: { _ in false }),
                   .success(2), "a soft wrap at negative y")
  }

  func testAnEmptyFieldIsPlacedAtZero() {
    XCTAssertEqual(caretOffset(at: CGPoint(x: 50, y: 50), length: 0, range: 0..<0, bounds: { _ in nil }, isLineBreak: { _ in false }, mayLackBox: { _ in false }), .success(0))
    XCTAssertEqual(textCaretOffset(at: CGPoint(x: 50, y: 50), value: "", bounds: { _ in nil }), .success(0))
  }

  /// Only a value read as a string is text: a failed read, no value or another type is never taken for an empty field.
  func testAFieldWhoseValueCannotBeReadIsNotPlaced() {
    for value in [nil, 42 as Any, NSNull() as Any] {
      XCTAssertEqual(textCaretOffset(at: CGPoint(x: 50, y: 50), value: value, bounds: { _ in nil }), .failure(.unreadable))
    }
    XCTAssertEqual(textCaretOffset(at: CGPoint(x: 50, y: 50), value: "ab", bounds: { _ in nil }), .failure(.noCharacterBoxes))
  }

  /// An empty line's only box is its line break: a point there goes before it.
  func testAPointOnAnEmptyLineGoesBeforeItsBreak() {
    let boxes: [CGRect] = [CGRect(x: 0, y: 0, width: 10, height: 20), CGRect(x: 10, y: 0, width: 0, height: 20),
                           CGRect(x: 0, y: 20, width: 0, height: 20)]
    XCTAssertEqual(caretOffset(at: CGPoint(x: 40, y: 30), length: 3, range: 0..<3, bounds: { boxes[$0] }, isLineBreak: { $0 >= 1 }, mayLackBox: { _ in false }), .success(2))
  }

  /// Run 42152333871: a static text reads AXVisibleCharacterRange {0, 0}, which once narrowed the scan to nothing. The
  /// scan now covers the whole value (`fieldCaretOffset` reads no visible range at all).
  func testAStaticTextIsScannedOverItsWholeValue() {
    let row = { (index: Int) in CGRect(x: CGFloat(index) * 10, y: 0, width: 10, height: 20) }
    XCTAssertEqual(textCaretOffset(at: CGPoint(x: 32, y: 5), value: "charlie delta", bounds: row), .success(3))
  }

  /// The characters whose empty box is no sign of boxes still arriving (9ba80c48).
  func testLineBreaksSpacesAndZeroWidthCharactersMayLackABox() {
    for text in ["\n", "\r", "\u{2028}", " ", "\t", "\u{200B}", "\u{200C}", "\u{200D}", "\u{FEFF}", "\u{00AD}", "\u{0301}"] {
      XCTAssertTrue(mayLackBox(text as NSString, 0), text.debugDescription)
    }
    for text in ["a", "0", ".", "\u{4E00}"] { XCTAssertFalse(mayLackBox(text as NSString, 0), text) }
  }

  /// A surrogate pair is one character: its trailing half needs no box, its leading half carries the character's.
  func testASurrogatePairNeedsOneBoxOnItsLeadingHalf() {
    let emoji = "\u{1F600}" as NSString
    XCTAssertFalse(mayLackBox(emoji, 0), "the emoji's leading half")
    XCTAssertTrue(mayLackBox(emoji, 1), "its trailing half")
    let tag = "\u{E0061}" as NSString  // a tag character, a format character beyond the BMP
    XCTAssertTrue(mayLackBox(tag, 0))
  }

  /// "a\n😀": the emoji line still arriving is an incomplete miss (the review's case); with the emoji's box read on its
  /// leading half, a point below every line answers at once.
  func testAnEmojiLineStillArrivingIsIncompleteAndAWholeOneIsNot() throws {
    let value = "a\n\u{1F600}"
    let lineOne = CGRect(x: 0, y: 0, width: 10, height: 20)
    let below = CGPoint(x: 5, y: 90)
    XCTAssertEqual(textCaretOffset(at: below, value: value, bounds: { $0 == 0 ? lineOne : nil }), .failure(.boxesIncomplete))
    let whole = { (index: Int) -> CGRect? in index == 0 ? lineOne : index == 2 ? CGRect(x: 0, y: 20, width: 20, height: 20) : nil }
    XCTAssertEqual(textCaretOffset(at: below, value: value, bounds: whole), .failure(.pointOutsideText))
    var field = Field(fresh: true)
    XCTAssertEqual(try focus(&field, offsetAt: { _ in textCaretOffset(at: below, value: value, bounds: whole) }), .notPlaced(.pointOutsideText))
    XCTAssertEqual(field.offsetAsked, 1, "a complete emoji line answers at once")
  }

  // MARK: boxes still arriving (run 42152333871; the design session's conditions, 9ba80c48)

  /// "ab\ncd": line one's boxes at y 0..<20, line two's at y 20..<40; `lineTwo` false leaves line two's boxes empty, as
  /// while Chromium's boxes arrive. The newline has no box, legitimately.
  private func twoLines(_ point: CGPoint, lineTwo: Bool) -> Result<Int, CaretNotPlaced> {
    textCaretOffset(at: point, value: "ab\ncd", bounds: { index in
      switch index {
      case 0, 1: return CGRect(x: CGFloat(index) * 10, y: 0, width: 10, height: 20)
      case 3, 4: return lineTwo ? CGRect(x: CGFloat(index - 3) * 10, y: 20, width: 10, height: 20) : .zero
      default: return nil
      }
    })
  }

  func testBoxesArrivingPartlyThenWhollyArePlaced() throws {
    let onLineTwo = CGPoint(x: 12, y: 25)
    XCTAssertEqual(twoLines(onLineTwo, lineTwo: false), .failure(.boxesIncomplete))
    var field = Field(fresh: true)
    XCTAssertEqual(try focus(&field, offsetAt: { self.twoLines(onLineTwo, lineTwo: $0 >= 400) }), .placed(4))
    XCTAssertEqual(field.offsetAsked, 5, "re-read until the clicked line's boxes came")
    XCTAssertEqual(field.writes, ["AXSelectedTextRange 4"])
  }

  func testAnIncompleteMissStillIncompleteAtTwoSecondsIsPointOutsideText() throws {
    var field = Field(fresh: true)
    XCTAssertEqual(try focus(&field, offsetAt: { _ in self.twoLines(CGPoint(x: 12, y: 25), lineTwo: false) }), .notPlaced(.pointOutsideText))
    XCTAssertEqual(field.elapsed, webAreaActionRereadMs)
  }

  func testAnIncompleteMissInAProcessThatIsNotFreshIsPointOutsideTextAtOnce() throws {
    var field = Field(fresh: false)
    XCTAssertEqual(try focus(&field, offsetAt: { _ in self.twoLines(CGPoint(x: 12, y: 25), lineTwo: false) }), .notPlaced(.pointOutsideText))
    XCTAssertEqual(field.offsetAsked, 1)
    XCTAssertEqual(field.elapsed, 0)
  }

  /// A complete miss is final at once, fresh or not: a multi-line value whose only empty boxes are at its newlines, a
  /// trailing space and a zero-width space does not wait.
  func testACompleteMissInAFreshProcessIsAnsweredAtOnce() throws {
    let value = "ab \ncd\u{200B}\nef"  // lines start at 0, 4 and 8
    let boxless: Set<Int> = [2, 3, 6, 7]  // the trailing space, the newlines, the zero-width space
    let bounds = { (index: Int) -> CGRect? in
      guard !boxless.contains(index) else { return .zero }
      let line = index < 4 ? 0 : index < 8 ? 1 : 2
      let column = index - [0, 4, 8][line]
      return CGRect(x: CGFloat(column) * 10, y: CGFloat(line) * 20, width: 10, height: 20)
    }
    var field = Field(fresh: true)
    XCTAssertEqual(try focus(&field, offsetAt: { _ in textCaretOffset(at: CGPoint(x: 5, y: 90), value: value, bounds: bounds) }),
                   .notPlaced(.pointOutsideText), "below every line")
    XCTAssertEqual(field.offsetAsked, 1)
    XCTAssertEqual(field.elapsed, 0, "no wait")
    XCTAssertEqual(textCaretOffset(at: CGPoint(x: 12, y: 25), value: value, bounds: bounds), .success(5), "the boxes are usable")
  }

  // MARK: a contenteditable region's text mapped into the region's offsets

  private final class Text {
    let role: String?
    let value: Any?
    let children: [Text]?
    init(_ role: String?, _ value: Any? = nil, _ children: [Text]? = []) { (self.role, self.value, self.children) = (role, value, children) }
    static func text(_ value: Any?) -> Text { Text("AXStaticText", value) }
  }

  private func start(of hit: Text, in region: Text) -> Int? {
    regionTextStart(of: hit, in: region, children: { $0.children }, role: { $0.role }, value: { $0.value }, same: { $0 === $1 })
  }

  /// Round 2's page, `alpha bravo <b>charlie delta</b><br>echo foxtrot <span>golf hotel</span> india`: five static texts
  /// and no element for the <br>, which is a character of the region's value. Its two measured points: node 1 local 3
  /// is 15, node 2 local 7 is 33 (a sum of lengths would say 32).
  func testARegionsTextStartsWhereItIsFoundInTheRegionsValueInOrder() {
    let nodes = ["alpha bravo ", "charlie delta", "echo foxtrot ", "golf hotel", " india"].map { Text.text($0) }
    let region = Text("AXTextArea", "alpha bravo charlie delta\necho foxtrot golf hotel india", nodes)
    XCTAssertEqual(start(of: nodes[1], in: region).map { $0 + 3 }, 15)
    XCTAssertEqual(start(of: nodes[2], in: region).map { $0 + 7 }, 33)
    XCTAssertEqual(nodes.map { start(of: $0, in: region) }, [0, 12, 26, 39, 49])
  }

  func testARegionsNestedTextAndARepeatedWordMapInDocumentOrder() {
    let inner = Text.text("charlie")
    let after = Text.text(" delta")
    let nested = Text("AXTextArea", "alpha bravo charlie delta",
                      [Text.text("alpha "), Text("AXGroup", nil, [Text.text(""), Text.text("bravo "), inner]), after])
    XCTAssertEqual(start(of: inner, in: nested), 12, "inside a group, an empty text skipped")
    XCTAssertEqual(start(of: after, in: nested), 19, "after the group")
    let second = Text.text("go")
    let repeated = Text("AXTextArea", "go stop go", [Text.text("go "), Text.text("stop "), second])
    XCTAssertEqual(start(of: second, in: repeated), 8, "found onward from the previous text, not at the first go")
  }

  func testARegionsTextThatCannotBeMappedIsNil() {
    let hit = Text.text("bravo")
    XCTAssertNil(start(of: hit, in: Text("AXTextArea", nil, [hit])), "the region's value unreadable")
    // The re-review's case: skipping the first go, whose role is unread, would find the hit's go at 0, not 3.
    let second = Text.text("go")
    XCTAssertNil(start(of: second, in: Text("AXTextArea", "go go", [Text(nil, "go"), second])), "a node's role unreadable")
    XCTAssertNil(start(of: hit, in: Text("AXTextArea", "alpha bravo", [Text.text(nil), hit])), "a text's value unreadable")
    XCTAssertNil(start(of: hit, in: Text("AXTextArea", "alpha bravo", [Text.text("zulu"), hit])), "a text not found")
    XCTAssertNil(start(of: hit, in: Text("AXTextArea", "alpha bravo", [Text("AXGroup", nil, nil), hit])), "children unreadable")
    XCTAssertNil(start(of: hit, in: Text("AXTextArea", "alpha bravo", [Text.text("alpha")])), "the hit not under the region")
    let crowd = (0..<regionWalkLimit).map { _ in Text("AXGroup") } + [hit]
    XCTAssertNil(start(of: hit, in: Text("AXTextArea", "alpha bravo", crowd)), "the walk's bound run out")
    XCTAssertEqual(start(of: hit, in: Text("AXTextArea", "alpha bravo", Array(crowd.dropFirst()))), 6, "within the bound")
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

  /// #341: which write focused the field, and how far the reference box moved, are recorded; a field that scrolled says
  /// its caret was written, not that typing goes to its old selection.
  func testTheRecordCarriesTheFocusingWriteAndTheShiftAndTheScrolledNoteSaysSo() {
    var record = ElementClickRecord(plan: .action("AXSelectedTextRange"), reason: .focusField, pressedRole: "AXTextArea", pressedAncestor: false,
                                    walk: ["AXTextArea"], caret: "placed")
    record.focusStep = WebAreaFocusRecord.Step.selection.rawValue
    record.caretMarkShift = 0.25
    XCTAssertEqual(record.wire["action"] as? String, "AXSelectedTextRange")
    XCTAssertEqual(record.wire["focusStep"] as? String, "selection")
    XCTAssertEqual(record.wire["caretMarkShift"] as? Double, 0.3)
    let note = focusNote("Chrome", .notPlaced(.layoutMoved))
    XCTAssertTrue(note.contains("caret was written at the point"), note)
    XCTAssertTrue(note.contains("new screenshot"), note)
    XCTAssertFalse(note.contains("existing selection"), note)
  }

  /// The reference character: the one after the caret where its box is usable, else the one before; none in an empty text.
  func testTheReferenceCharacterIsTheOneAtTheCaretElseBefore() {
    XCTAssertEqual(caretMarkIndex(offset: 3, length: 5, usable: { _ in true }), 3)
    XCTAssertEqual(caretMarkIndex(offset: 3, length: 5, usable: { $0 != 3 }), 2, "a line break with no box at the caret")
    XCTAssertEqual(caretMarkIndex(offset: 5, length: 5, usable: { _ in true }), 4, "the text's end")
    XCTAssertEqual(caretMarkIndex(offset: 0, length: 5, usable: { $0 != 0 }), nil)
    XCTAssertEqual(caretMarkIndex(offset: 0, length: 0, usable: { _ in true }), nil)
  }
}

private extension Result {
  var failure: Failure? { if case .failure(let error) = self { return error } else { return nil } }
}
