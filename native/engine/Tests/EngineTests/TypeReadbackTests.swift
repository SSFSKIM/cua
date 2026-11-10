import XCTest
@testable import Engine

// #354's read-back of a keyed type_text (TypeReadback.swift), over a fake app whose focused field takes the posted text:
// each test drives the real keyText through keyTextReadBack, so the snapshot, the checkpoints and the final poll run in
// the order the engine runs them, every read recorded.

/// A fake field: what its reads answer, and what a posted unit does to it.
private final class FakeField {
  var role: String? = "AXTextArea"
  var subrole: ReadbackSubrole = .absent
  var value: String?
  var range: NSRange?
  /// The value reads that still answer the value from before the latest delivery (a late field).
  var lagReads = 0
  /// What the app does with a delivered text (a substitution): the text it takes in place of the typed one.
  var transform: (String) -> String = { $0 }
  /// Whether a Return inserts a newline (a text area) or does nothing to the value (a single-line field).
  var returnInserts = true
  /// An app that has not consumed the typing (yet): delivered text changes nothing.
  var ignoresInput = false
  /// A change after this many value reads (a field turning secure, unreadable, or re-created).
  var changeAfterReads: Int?
  var change: (FakeField) -> Void = { _ in }
  var calls: [String] = []
  private var shown: String?
  private var lagLeft = 0
  private var valueReads = 0

  init(value: String?, range: NSRange?) {
    self.value = value
    self.range = range
    shown = value
  }

  func deliver(_ text: [UInt16]) {
    guard !ignoresInput, var current = value, let selection = range, NSMaxRange(selection) <= (current as NSString).length else { return }
    let typed = String(utf16CodeUnits: text, count: text.count)
    if typed == "\r" && !returnInserts { return }
    let inserted = transform(typed == "\r" ? "\n" : typed)
    current = (current as NSString).replacingCharacters(in: selection, with: inserted)
    shown = value
    value = current
    range = NSRange(location: selection.location + (inserted as NSString).length, length: 0)
    lagLeft = lagReads
  }

  func readValue() -> String? {
    calls.append("value")
    valueReads += 1
    defer { if valueReads == changeAfterReads { change(self) } }
    if lagLeft > 0 { lagLeft -= 1; return shown }
    shown = value
    return value
  }
}

/// The fake app: its focused field, a clock that advances only by the poll's sleeps, and the reads over both.
private final class FakeApp {
  var focused: FakeField?
  var clock: Double = 0
  var sleeps = 0

  init(_ field: FakeField?) { focused = field }

  var reads: ReadbackReads<FakeField> {
    ReadbackReads(focused: { self.focused?.calls.append("focused"); return self.focused },
                  role: { $0.calls.append("role"); return $0.role },
                  subrole: { $0.calls.append("subrole"); return $0.subrole },
                  value: { $0.readValue() },
                  valueUnits: { field in field.readValue().map { Array($0.utf16) } },
                  range: { $0.calls.append("range"); return $0.range },
                  same: { $0 === $1 },
                  now: { self.clock },
                  sleep: { self.clock += $0; self.sleeps += 1 })
  }
}

final class TypeReadbackTests: XCTestCase {
  private func meta() -> InputMeta {
    InputMeta(ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
  }

  /// The units the keyed route makes of `text` under a layout that keys ASCII letters, space, punctuation and Tab.
  private func units(_ text: String) -> [TypedUnit] {
    typedUnits(text, press: { unit in unit < 0x80 && unit != 0x0D ? KeyPress(keyCode: CGKeyCode(unit), modifiers: []) : nil })
  }

  /// Types `text` into `app` through keyTextReadBack; the error it threw, if any, and the meta.
  @discardableResult
  private func type(_ text: String, into app: FakeApp, concealed: Bool = false) -> (EngineError?, InputMeta) {
    var meta = meta()
    do {
      try keyTextReadBack(units(text), concealed: concealed, reads: app.reads, checkSource: { _, _ in }, checkIntervention: {},
                          post: { event in
                            if event.kind == .down, let text = event.text { app.focused?.deliver(text) }
                            return true
                          }, pause: {}, meta: &meta)
      return (nil, meta)
    } catch {
      return (error as? EngineError, meta)
    }
  }

  private func record(_ meta: InputMeta) -> [String: Any] { meta.wire["typeReadback"] as? [String: Any] ?? [:] }

  // MARK: Equal

  func testAnEqualFieldConfirms() {
    let field = FakeField(value: "Old draft", range: NSRange(location: 0, length: 9))
    let app = FakeApp(field)
    let (error, meta) = type("New", into: app)
    XCTAssertNil(error)
    XCTAssertEqual(field.value, "New")
    XCTAssertEqual(record(meta)["confirmed"] as? Bool, true)
    XCTAssertNil(record(meta)["reason"])
    XCTAssertEqual(record(meta)["reads"] as? Int, 1)
    XCTAssertNil(record(meta)["expectedLength"], "a confirmed answer carries no lengths")
    XCTAssertEqual(meta.entered, 3)
  }

  func testACaretInsertionConfirmsTheValueAroundIt() {
    let field = FakeField(value: "Hello world", range: NSRange(location: 5, length: 0))
    let (error, meta) = type(",", into: FakeApp(field))
    XCTAssertNil(error)
    XCTAssertEqual(record(meta)["confirmed"] as? Bool, true)
  }

  func testALateEqualInsideTheWindowConfirms() {
    let field = FakeField(value: "", range: NSRange(location: 0, length: 0))
    field.lagReads = 40  // 200 ms of 5 ms polls
    let app = FakeApp(field)
    let (error, meta) = type("abc", into: app)
    XCTAssertNil(error)
    XCTAssertEqual(record(meta)["confirmed"] as? Bool, true)
    XCTAssertEqual(record(meta)["reads"] as? Int, 41)
    XCTAssertEqual(app.clock, 200, "polled every 5 ms until it read equal")
  }

  func testAnEqualAfterTheWindowIsTooLate() {
    let field = FakeField(value: "", range: NSRange(location: 0, length: 0))
    field.lagReads = 500
    let app = FakeApp(field)
    let (error, meta) = type("abc", into: app)
    XCTAssertEqual(error?.errorName, "typeUnconfirmed")
    XCTAssertEqual(record(meta)["reason"] as? String, "valueMismatch")
    XCTAssertEqual(app.clock, typeReadbackBudgetMs, "the poll stops at its budget")
    XCTAssertEqual(record(meta)["reads"] as? Int, 201)
  }

  // MARK: Mismatch

  func testAMismatchIsTypeUnconfirmedWithTheExcerptAndBothLengths() {
    let field = FakeField(value: "word", range: NSRange(location: 4, length: 0))
    field.transform = { $0 == " " ? ". " : $0 }  // macOS's "Add period with double-space", near enough
    let (error, meta) = type("  is", into: FakeApp(field))
    XCTAssertEqual(error?.errorName, "typeUnconfirmed")
    let message = error?.message ?? ""
    XCTAssertTrue(message.hasPrefix("The text was typed, but the field does not read as expected, so it is not confirmed and some or all of it may have gone in."), message)
    XCTAssertTrue(message.contains("Observe the field with getAXState() before going on, then use setValue to put it right; do not type the text again."), message)
    XCTAssertTrue(message.contains("From character 1, expected \"word  is\"; the field reads \"word. . is\"."), message)
    XCTAssertTrue(message.contains("The expected text is 8 characters long, the field's 10."), message)
    XCTAssertEqual(record(meta)["confirmed"] as? Bool, false)
    XCTAssertEqual(record(meta)["reason"] as? String, "valueMismatch")
    XCTAssertEqual(record(meta)["expectedLength"] as? Int, 8)
    XCTAssertEqual(record(meta)["actualLength"] as? Int, 10)
    XCTAssertEqual(meta.entered, 4, "what was posted is still reported")
  }

  /// A 20,000-character field: the answer holds at most the two 200-unit windows, about the first difference.
  func testAMismatchInALongFieldCarriesABoundedExcerpt() {
    let long = String(repeating: "a", count: 10_000) + String(repeating: "b", count: 10_000)
    let field = FakeField(value: long, range: NSRange(location: 15_000, length: 0))
    field.transform = { $0.uppercased() }
    let (error, meta) = type("xyz", into: FakeApp(field))
    XCTAssertEqual(error?.errorName, "typeUnconfirmed")
    let message = error?.message ?? ""
    let quoted = message.components(separatedBy: "\"").enumerated().filter { $0.offset % 2 == 1 }.map(\.element)
    guard quoted.count == 2 else { return XCTFail("two quoted excerpts expected: \(message)") }
    XCTAssertEqual(quoted.map(\.count), [200, 200])
    XCTAssertLessThanOrEqual(message.count, 400 + 500, "the field's text in the answer is at most about 400 characters")
    XCTAssertTrue(quoted[0].hasSuffix("xyz" + String(repeating: "b", count: 97)), "the window centred on the first difference")
    XCTAssertTrue(quoted[1].hasSuffix("XYZ" + String(repeating: "b", count: 97)))
    XCTAssertTrue(message.contains("From character 14901,"), message)
    XCTAssertEqual(record(meta)["expectedLength"] as? Int, 20_003)
  }

  func testTheExcerptNeverSplitsASurrogatePairAndQuotesControlCharacters() {
    let emoji = "\u{1F600}"
    let excerpt = readbackExcerpt(expected: "x" + emoji + "ab", actual: "x" + emoji + "ac", radius: 2)
    XCTAssertEqual(excerpt.start, 1, "a window that would start on a trail surrogate starts on its lead")
    XCTAssertEqual(excerpt.expected, emoji + "ab")
    let end = readbackExcerpt(expected: "ab" + emoji, actual: "ac" + emoji, radius: 2)
    XCTAssertEqual(end.expected, "ab", "a window that would end on a lead surrogate ends before it")
    XCTAssertEqual(readbackQuoted("a\"b\\c\nd\te\u{7}"), "\"a\\\"b\\\\c\\nd\\te\\u0007\"")
  }

  // MARK: Fields it cannot read

  func testASecureFieldIsUnconfirmedAndItsValueIsNeverRead() {
    for (name, role, subrole) in [("secure role", "AXSecureTextField", ReadbackSubrole.absent),
                                  ("secure subrole", "AXTextField", .value("AXSecureTextField")),
                                  ("unreadable subrole", "AXTextField", .failed)] {
      let field = FakeField(value: "hunter2", range: NSRange(location: 7, length: 0))
      field.role = role
      field.subrole = subrole
      let (error, meta) = type("pass", into: FakeApp(field))
      XCTAssertEqual(error?.errorName, "typeUnconfirmed", name)
      XCTAssertEqual(record(meta)["reason"] as? String, "secure", name)
      XCTAssertFalse(field.calls.contains("value") || field.calls.contains("range"), "\(name): \(field.calls)")
      XCTAssertFalse(error?.message.contains("hunter2") ?? true, name)
      XCTAssertNil(record(meta)["expectedLength"], name)
      XCTAssertTrue(error?.message.contains("the field is a password field, which is never read back") ?? false, name)
    }
  }

  // MARK: Concealed (a {{secret:…}} substitution, ruling 1ea561bc:589)

  func testAConcealedTextThatReadsBackEqualConfirms() {
    let field = FakeField(value: "token: ", range: NSRange(location: 7, length: 0))
    let (error, meta) = type("s3cr3t-Zebra", into: FakeApp(field), concealed: true)
    XCTAssertNil(error)
    XCTAssertEqual(record(meta)["confirmed"] as? Bool, true)
    XCTAssertNil(meta.entered, "a concealed request never reports a count")
  }

  /// A mismatching secret: its answer, the meta on it and the reads made carry none of its characters, and no length.
  func testAConcealedMismatchCarriesNoneOfTheSecretAndNoLength() throws {
    let secret = "s3cr3t-Zebra", before = "token: "
    let field = FakeField(value: before, range: NSRange(location: 7, length: 0))
    field.transform = { $0.uppercased() }  // a field that changes what it is given
    let (error, meta) = type(secret, into: FakeApp(field), concealed: true)
    let failure = try XCTUnwrap(error)
    XCTAssertEqual(failure.errorName, "typeUnconfirmed")
    XCTAssertTrue(failure.message.hasPrefix("The text was typed, but the field does not match what was typed, so it is not confirmed"), failure.message)
    XCTAssertEqual(record(meta)["reason"] as? String, "concealedMismatch")
    let reply = withMeta(failure, meta).wire
    let data = try JSONSerialization.data(withJSONObject: reply, options: [.sortedKeys])
    let text = String(decoding: data, as: UTF8.self)
    for fragment in [secret, secret.uppercased(), "s3c", "ZEB", "Zebra"] {
      XCTAssertFalse(text.contains(fragment), "the reply carries \(fragment): \(text)")
    }
    XCTAssertFalse(failure.message.contains { $0.isNumber }, "no length or offset in the sentence: \(failure.message)")
    XCTAssertFalse(text.contains("Length"), "no length in the meta: \(text)")
    XCTAssertNil(meta.entered)
    XCTAssertTrue(field.calls.allSatisfy { ["focused", "role", "subrole", "value", "range"].contains($0) }, "the reads log names, never values")
  }

  func testAConcealedTextIntoASecureFieldIsNeverRead() {
    let field = FakeField(value: "", range: NSRange(location: 0, length: 0))
    field.role = "AXSecureTextField"
    let (error, meta) = type("s3cr3t", into: FakeApp(field), concealed: true)
    XCTAssertEqual(error?.errorName, "typeUnconfirmed")
    XCTAssertEqual(record(meta)["reason"] as? String, "secure")
    XCTAssertFalse(field.calls.contains("value") || field.calls.contains("range"), "\(field.calls)")
  }

  func testAConcealedBufferIsZeroedInPlace() {
    var buffer: [UInt16] = Array("s3cr3t".utf16)
    readbackZero(&buffer)
    XCTAssertEqual(buffer, [0, 0, 0, 0, 0, 0])
    XCTAssertTrue(readbackMayBeTruncated(units: Array(String(repeating: "가", count: 3_333).utf16)), "the buffer's UTF-8 length counted as a String's")
    XCTAssertFalse(readbackMayBeTruncated(units: Array(String(repeating: "\u{1F600}", count: 2_000).utf16)), "8,000 bytes, 4,000 units")
    XCTAssertTrue(readbackMayBeTruncated(units: Array(String(repeating: "\u{1F600}", count: 2_500).utf16)), "10,000 bytes")
    XCTAssertTrue(readbackMayBeTruncated(units: Array(String(repeating: "\u{E9}", count: 5_000).utf16)), "two bytes each: 10,000 bytes")
    // A concealed Return in a multi-line field is a newline in the expected buffer, as a plain one is.
    let area = FakeField(value: "", range: NSRange(location: 0, length: 0))
    let (error, meta) = type("pa\nss", into: FakeApp(area), concealed: true)
    XCTAssertNil(error)
    XCTAssertEqual(record(meta)["confirmed"] as? Bool, true)
  }

  func testAFieldTurningSecureIsReadNoFurther() {
    let field = FakeField(value: "", range: NSRange(location: 0, length: 0))
    field.lagReads = 5
    field.changeAfterReads = 2
    field.change = { $0.subrole = .value("AXSecureTextField") }
    let (error, meta) = type("abc", into: FakeApp(field))
    XCTAssertEqual(error?.errorName, "typeUnconfirmed")
    XCTAssertEqual(record(meta)["reason"] as? String, "becameSecure")
    XCTAssertEqual(field.calls.filter { $0 == "value" }.count, 2, "the snapshot's read and one poll, none after the change")
    XCTAssertNil(record(meta)["expectedLength"])
  }

  func testANonTextRoleWithAStringValueIsUnconfirmed() {
    for role in ["AXImage", "AXGroup", "AXOutline", "AXWebArea"] {
      let canvas = FakeField(value: "", range: NSRange(location: 0, length: 0))  // Chrome's canvas: an empty string value
      canvas.role = role
      let (error, meta) = type("abc", into: FakeApp(canvas))
      XCTAssertEqual(error?.errorName, "typeUnconfirmed", role)
      XCTAssertEqual(record(meta)["reason"] as? String, "notTextField", role)
      XCTAssertFalse(canvas.calls.contains("value"), "\(role): \(canvas.calls)")
      XCTAssertTrue(error?.message.contains("the focused element is not a text field") ?? false, role)
    }
    for role in ["AXTextField", "AXTextArea", "AXComboBox"] {
      let field = FakeField(value: "", range: NSRange(location: 0, length: 0))
      field.role = role
      XCTAssertNil(type("abc", into: FakeApp(field)).0, role)
    }
  }

  func testNoFocusAnUnreadableRoleValueOrRangeAreUnconfirmed() {
    XCTAssertEqual(record(type("abc", into: FakeApp(nil)).1)["reason"] as? String, "noFocusedElement")
    let roleless = FakeField(value: "x", range: NSRange(location: 0, length: 0))
    roleless.role = nil
    XCTAssertEqual(record(type("abc", into: FakeApp(roleless)).1)["reason"] as? String, "roleUnreadable")
    XCTAssertFalse(roleless.calls.contains("subrole"))
    XCTAssertEqual(record(type("abc", into: FakeApp(FakeField(value: nil, range: NSRange(location: 0, length: 0)))).1)["reason"] as? String, "valueUnreadable")
    XCTAssertEqual(record(type("abc", into: FakeApp(FakeField(value: "ab", range: nil))).1)["reason"] as? String, "rangeUnreadable")
    XCTAssertEqual(record(type("abc", into: FakeApp(FakeField(value: "ab", range: NSRange(location: 3, length: 0)))).1)["reason"] as? String, "rangeUnreadable")
    // A range outside the value is refused at the snapshot, like every unreadable field: no checkpoint stops the key.
    let outside = FakeField(value: "ab", range: NSRange(location: 3, length: 0))
    let (error, meta) = type("a\tb", into: FakeApp(outside))
    XCTAssertEqual(error?.errorName, "typeUnconfirmed")
    XCTAssertEqual(record(meta)["reason"] as? String, "rangeUnreadable")
    XCTAssertNil(record(meta)["stoppedBeforeKey"])
    XCTAssertEqual(meta.entered, 3, "every unit sent")
  }

  // MARK: Truncation

  func testAValueAtTheCapIsUnconfirmed() {
    let atCap = FakeField(value: String(repeating: "a", count: 10_000), range: NSRange(location: 10_000, length: 0))
    let (error, meta) = type("b", into: FakeApp(atCap))
    XCTAssertEqual(error?.errorName, "typeUnconfirmed")
    XCTAssertEqual(record(meta)["reason"] as? String, "possiblyTruncated")
    XCTAssertNil(record(meta)["expectedLength"], "a cut value's length says nothing")

    // A field just under the cap whose text would reach it: the read would be cut, so it is never compared.
    let below = FakeField(value: String(repeating: "a", count: 9_990), range: NSRange(location: 9_990, length: 0))
    let (reached, reachedMeta) = type(String(repeating: "b", count: 10), into: FakeApp(below))
    XCTAssertEqual(reached?.errorName, "typeUnconfirmed", "the field reads 10,000 long, equal or cut alike")
    XCTAssertEqual(record(reachedMeta)["reason"] as? String, "possiblyTruncated")
    XCTAssertEqual(below.calls.filter { $0 == "value" }.count, 1, "never polled")

    // Blink cuts in UTF-8 bytes: 3,333 three-byte characters read as 9,999 bytes, at the cap.
    XCTAssertTrue(readbackMayBeTruncated(String(repeating: "가", count: 3_333)))
    XCTAssertFalse(readbackMayBeTruncated(String(repeating: "가", count: 3_000)))
    XCTAssertFalse(readbackMayBeTruncated(String(repeating: "a", count: 9_996)))
    XCTAssertFalse(readbackMayBeTruncated(String(repeating: "a", count: 10_001)), "past the cap, nothing was cut there")
  }

  func testAReadCutAtTheCapNeverComparesEqual() {
    // A Chromium field cut at the cap: whatever the text, it reads its first 10,000 characters.
    let field = FakeField(value: String(repeating: "a", count: 9_990), range: NSRange(location: 9_990, length: 0))
    let app = FakeApp(field)
    var meta = meta()
    let reads = app.reads
    var cut = reads
    cut.value = { field in reads.value(field).map { String($0.prefix(10_000)) } }
    XCTAssertThrowsError(try keyTextReadBack(units(String(repeating: "b", count: 20)), concealed: false, reads: cut, checkSource: { _, _ in },
                                             checkIntervention: {}, post: { event in
                                               if event.kind == .down, let text = event.text { field.deliver(text) }
                                               return true
                                             }, pause: {}, meta: &meta)) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "typeUnconfirmed")
    }
    XCTAssertEqual(record(meta)["reason"] as? String, "possiblyTruncated")
  }

  /// The review of 9020bb18..dad56362, P1: typing over a selection that holds the same text leaves the value unchanged,
  /// so equality alone proves nothing; the caret past the insertion must read too.
  func testTypingOverTheSameTextNeedsTheCaretToMove() {
    let idle = FakeField(value: "x abc y", range: NSRange(location: 2, length: 3))
    idle.ignoresInput = true  // never consumed: a late select-all could still rewrite it
    let app = FakeApp(idle)
    let (error, meta) = type("abc", into: app)
    XCTAssertEqual(error?.errorName, "typeUnconfirmed")
    XCTAssertEqual(record(meta)["reason"] as? String, "unchanged")
    XCTAssertEqual(app.clock, typeReadbackBudgetMs, "waited the whole window for the caret")
    XCTAssertNil(record(meta)["expectedLength"])

    let consumed = FakeField(value: "x abc y", range: NSRange(location: 2, length: 3))
    let (none, consumedMeta) = type("abc", into: FakeApp(consumed))
    XCTAssertNil(none, "the range moved to the caret after the insertion, {5, 0}")
    XCTAssertEqual(consumed.range, NSRange(location: 5, length: 0))
    XCTAssertEqual(record(consumedMeta)["confirmed"] as? Bool, true)

    let concealed = FakeField(value: "abc", range: NSRange(location: 0, length: 3))
    concealed.ignoresInput = true
    XCTAssertEqual(record(type("abc", into: FakeApp(concealed), concealed: true).1)["reason"] as? String, "unchanged")
  }

  /// The same at a checkpoint: a Return is never released by the old value reading equal.
  func testACheckpointOverTheSameTextNeedsTheCaretToMove() {
    let field = FakeField(value: "abc", range: NSRange(location: 0, length: 3))
    field.role = "AXTextField"
    field.ignoresInput = true
    var returns = 0
    var meta = meta()
    XCTAssertThrowsError(try keyTextReadBack(units("abc\n"), concealed: false, reads: FakeApp(field).reads, checkSource: { _, _ in },
                                             checkIntervention: {}, post: { event in
                                               if event.kind == .down, event.text == [0x0D] { returns += 1 }
                                               return true
                                             }, pause: {}, meta: &meta))
    XCTAssertEqual(returns, 0, "the Return is never posted")
    XCTAssertEqual(record(meta)["reason"] as? String, "unchanged")
    XCTAssertEqual(record(meta)["stoppedBeforeKey"] as? Bool, true)
  }

  /// The review of 9020bb18..dad56362, P2: equality is of UTF-16 code units, never Swift's canonical ==.
  func testACanonicallyEquivalentValueIsNotEqual() {
    let field = FakeField(value: "", range: NSRange(location: 0, length: 0))
    field.transform = { $0.decomposedStringWithCanonicalMapping }  // é typed, e + U+0301 stored
    let (error, meta) = type("caf\u{E9}", into: FakeApp(field))
    XCTAssertEqual(error?.errorName, "typeUnconfirmed")
    XCTAssertEqual(record(meta)["reason"] as? String, "valueMismatch")
    XCTAssertEqual(record(meta)["expectedLength"] as? Int, 4)
    XCTAssertEqual(record(meta)["actualLength"] as? Int, 5)
    let concealed = FakeField(value: "", range: NSRange(location: 0, length: 0))
    concealed.transform = { $0.decomposedStringWithCanonicalMapping }
    XCTAssertEqual(record(type("caf\u{E9}", into: FakeApp(concealed), concealed: true).1)["reason"] as? String, "concealedMismatch")
  }

  /// The review's probe: 4,999 composed é and two 中 typed (5,001 units, 10,004 bytes: past the cap), stored decomposed
  /// (10,000 units: at it). Swift's == calls them equal; the read may be cut, so it is never accepted.
  func testAReadAtTheCapIsNeverAcceptedEvenWhenItWouldCompareEqual() {
    let field = FakeField(value: "", range: NSRange(location: 0, length: 0))
    field.transform = { $0.decomposedStringWithCanonicalMapping }
    let typed = String(repeating: "\u{E9}", count: 4_999) + "中中"
    XCTAssertFalse(readbackMayBeTruncated(typed))
    let (error, meta) = type(typed, into: FakeApp(field))
    XCTAssertEqual(error?.errorName, "typeUnconfirmed")
    XCTAssertEqual(record(meta)["reason"] as? String, "possiblyTruncated")
    XCTAssertNil(record(meta)["expectedLength"])
    let concealed = FakeField(value: "", range: NSRange(location: 0, length: 0))
    concealed.transform = { $0.decomposedStringWithCanonicalMapping }
    XCTAssertEqual(record(type(typed, into: FakeApp(concealed), concealed: true).1)["reason"] as? String, "possiblyTruncated",
                   "a concealed read at the cap is never compared either")
  }

  // MARK: Identity

  func testTheFieldChangingIdentityIsUnconfirmed() {
    // Focus moved to another field by the time the value read equal.
    let field = FakeField(value: "", range: NSRange(location: 0, length: 0))
    let app = FakeApp(field)
    let other = FakeField(value: "abc", range: NSRange(location: 3, length: 0))
    field.changeAfterReads = 2
    field.change = { _ in app.focused = other }
    let (error, meta) = type("abc", into: app)
    XCTAssertEqual(error?.errorName, "typeUnconfirmed")
    XCTAssertEqual(record(meta)["reason"] as? String, "fieldChanged")
    XCTAssertNil(record(meta)["expectedLength"], "no values once the field is another")

    // The snapshotted handle now answers another role, or none.
    for (role, reason) in [("AXGroup", "fieldChanged"), (nil, "fieldUnreadable")] as [(String?, String)] {
      let changing = FakeField(value: "", range: NSRange(location: 0, length: 0))
      changing.lagReads = 3
      changing.changeAfterReads = 2
      changing.change = { $0.role = role }
      let (error, meta) = type("abc", into: FakeApp(changing))
      XCTAssertEqual(error?.errorName, "typeUnconfirmed", reason)
      XCTAssertEqual(record(meta)["reason"] as? String, reason)
      XCTAssertEqual(changing.calls.filter { $0 == "value" }.count, 2, "\(reason): no value read after the change")
    }
  }

  // MARK: UTF-16

  func testTheReplacementCountsUTF16UnitsWithEmojiAndCombiningMarks() {
    let emoji = "\u{1F600}", combining = "e\u{301}"
    XCTAssertEqual(readbackExpected(before: "a" + emoji + "b", range: NSRange(location: 3, length: 1), typed: "Z"), "a" + emoji + "Z")
    XCTAssertEqual(readbackExpected(before: "a" + emoji + "b", range: NSRange(location: 1, length: 2), typed: "Z"), "aZb")
    XCTAssertEqual(readbackExpected(before: "caf" + combining + "!", range: NSRange(location: 5, length: 1), typed: "?"), "caf" + combining + "?")
    XCTAssertEqual(readbackExpected(before: "abc", range: NSRange(location: 4, length: 0), typed: "Z"), nil)
    XCTAssertEqual(readbackExpected(before: "abc", range: NSRange(location: 1, length: 3), typed: "Z"), nil)
    // Through the typing: an emoji and a combining sequence after a field that already holds one, the selection after it.
    let field = FakeField(value: emoji + "x", range: NSRange(location: 2, length: 1))
    let (error, meta) = type("caf" + combining + " " + emoji, into: FakeApp(field))
    XCTAssertNil(error)
    XCTAssertEqual(field.value, emoji + "caf" + combining + " " + emoji)
    XCTAssertEqual(record(meta)["confirmed"] as? Bool, true)
  }

  // MARK: Keys in the text (ruling 1ea561bc:589, call 2)

  /// In a multi-line field a Return is text: "\n" in the expected value, read back like any character, no checkpoint.
  func testAReturnInAMultiLineFieldIsReadBackAsText() {
    let field = FakeField(value: "", range: NSRange(location: 0, length: 0))
    let (error, meta) = type("one\r\ntwo\nthree\n", into: FakeApp(field))
    XCTAssertNil(error)
    XCTAssertEqual(field.value, "one\ntwo\nthree\n", "a CR LF is one Return, one newline")
    XCTAssertNil(record(meta)["checkpoints"])
    XCTAssertNil(record(meta)["keysUnconfirmed"], "a Return that is text is confirmed with it")
    XCTAssertEqual(record(meta)["confirmed"] as? Bool, true)

    // A text area whose Return did nothing: the newline is missing, so it is a mismatch, not a success.
    let dropped = FakeField(value: "", range: NSRange(location: 0, length: 0))
    dropped.returnInserts = false
    let (missing, missingMeta) = type("line\n", into: FakeApp(dropped))
    XCTAssertEqual(missing?.errorName, "typeUnconfirmed")
    XCTAssertEqual(record(missingMeta)["reason"] as? String, "valueMismatch")
  }

  /// A Return in a single-line field can submit it: the text before it is confirmed first, the Return not.
  func testATrailingReturnInASingleLineFieldIsPostedOnceTheTextBeforeItReadsBack() {
    for role in ["AXTextField", "AXComboBox"] {
      let field = FakeField(value: "", range: NSRange(location: 0, length: 0))
      field.role = role
      field.returnInserts = false  // a search field: Return submits
      let (error, meta) = type("query\n", into: FakeApp(field))
      XCTAssertNil(error, role)
      XCTAssertEqual(record(meta)["confirmed"] as? Bool, true, role)
      XCTAssertEqual(record(meta)["checkpoints"] as? Int, 1, role)
      XCTAssertEqual(record(meta)["keysUnconfirmed"] as? Int, 1, "\(role): what the Return did is not confirmed")
      XCTAssertEqual(meta.entered, 6, role)
    }
  }

  func testAWrongTextIsNeverSubmitted() {
    let field = FakeField(value: "", range: NSRange(location: 0, length: 0))
    field.role = "AXTextField"
    field.transform = { $0 == "q" ? "Q" : $0 }  // autocapitalisation
    var returns = 0
    var meta = meta()
    XCTAssertThrowsError(try keyTextReadBack(units("query\n"), concealed: false, reads: FakeApp(field).reads, checkSource: { _, _ in },
                                             checkIntervention: {}, post: { event in
                                               if event.kind == .down, let text = event.text { if text == [0x0D] { returns += 1 }; field.deliver(text) }
                                               return true
                                             }, pause: {}, meta: &meta)) { error in
      XCTAssertTrue((error as? EngineError)?.message.hasPrefix("The text before a Return or Tab was typed, but the field does not read as expected, so the key and the text after it were not sent.") ?? false)
    }
    XCTAssertEqual(returns, 0, "the Return is never posted")
    XCTAssertEqual(meta.entered, 5)
    XCTAssertEqual(record(meta)["stoppedBeforeKey"] as? Bool, true)
  }

  /// Text after a Return in a single-line field is expected in the same field without it.
  func testTextAfterAReturnInASingleLineFieldIsExpectedWithoutIt() {
    let field = FakeField(value: "", range: NSRange(location: 0, length: 0))
    field.role = "AXTextField"
    field.returnInserts = false
    let (error, meta) = type("a\nb", into: FakeApp(field))
    XCTAssertNil(error)
    XCTAssertEqual(record(meta)["checkpoints"] as? Int, 1)
    XCTAssertEqual(record(meta)["keysUnconfirmed"] as? Int, 1)
  }

  /// A Tab can leave any field: checked before, not confirmed itself, and focus that moved with it answers fieldChanged.
  func testATabIsAKeyThatCanLeaveAnyField() {
    let area = FakeField(value: "", range: NSRange(location: 0, length: 0))
    let (error, meta) = type("name\t", into: FakeApp(area))
    XCTAssertNil(error)
    XCTAssertEqual(record(meta)["checkpoints"] as? Int, 1, "a Tab is a checkpoint even in a text area")
    XCTAssertEqual(record(meta)["keysUnconfirmed"] as? Int, 1)

    let first = FakeField(value: "", range: NSRange(location: 0, length: 0))
    first.role = "AXTextField"
    let next = FakeField(value: "", range: NSRange(location: 0, length: 0))
    next.role = "AXTextField"
    let app = FakeApp(first)
    var moved = self.meta()
    XCTAssertThrowsError(try keyTextReadBack(units("ann\tlee"), concealed: false, reads: app.reads, checkSource: { _, _ in },
                                             checkIntervention: {}, post: { event in
                                               guard event.kind == .down, let text = event.text else { return true }
                                               if text == [0x09] { app.focused = next } else { app.focused?.deliver(text) }
                                               return true
                                             }, pause: {}, meta: &moved))
    XCTAssertEqual(first.value, "ann")
    XCTAssertEqual(next.value, "lee")
    XCTAssertEqual(record(moved)["reason"] as? String, "fieldChanged", "the text after the Tab went to another field")
    XCTAssertNil(record(moved)["expectedLength"])
  }

  /// A Return where the cells show it is not read back counts as a key that can leave; none is listed yet.
  func testAReturnIsTextOnlyInAMultiLineFieldTheCellsHaveNotExcluded() {
    XCTAssertTrue(readbackReturnIsText(role: "AXTextArea", subrole: .absent))
    XCTAssertTrue(readbackReturnIsText(role: "AXTextArea", subrole: .value("AXApplicationGroup")), "Firefox's contenteditable")
    XCTAssertFalse(readbackReturnIsText(role: "AXTextArea", subrole: .value("AXApplicationGroup"), unread: ["AXApplicationGroup"]))
    XCTAssertFalse(readbackReturnIsText(role: "AXTextField", subrole: .absent))
    XCTAssertFalse(readbackReturnIsText(role: "AXTextField", subrole: .value("AXSearchField")))
    XCTAssertFalse(readbackReturnIsText(role: "AXComboBox", subrole: .absent))
    XCTAssertTrue(typeReadbackReturnUnreadSubroles.isEmpty)
  }

  func testOnlyKeysAndEmptyText() {
    let field = FakeField(value: "x", range: NSRange(location: 1, length: 0))
    let (error, meta) = type("\t", into: FakeApp(field))
    XCTAssertNil(error, "nothing typed to confirm; the key is not confirmed")
    XCTAssertEqual(record(meta)["keysUnconfirmed"] as? Int, 1)
    XCTAssertEqual(field.calls.filter { $0 == "value" }.count, 1, "only the snapshot's read")

    let area = FakeField(value: "x", range: NSRange(location: 1, length: 0))
    let (newline, newlineMeta) = type("\n", into: FakeApp(area))
    XCTAssertNil(newline)
    XCTAssertEqual(area.value, "x\n")
    XCTAssertEqual(record(newlineMeta)["reads"] as? Int, 1, "a lone Return in a text area is read back")

    let empty = FakeField(value: "x", range: NSRange(location: 1, length: 0))
    let (none, emptyMeta) = type("", into: FakeApp(empty))
    XCTAssertNil(none)
    XCTAssertNil(emptyMeta.typeReadback, "empty text posts nothing and reads nothing")
    XCTAssertEqual(empty.calls, [])
  }

  func testTheSnapshotReadsInItsOrder() {
    let field = FakeField(value: "ab", range: NSRange(location: 2, length: 0))
    type("c", into: FakeApp(field))
    XCTAssertEqual(field.calls, ["focused", "role", "subrole", "value", "range", "role", "subrole", "value", "focused"],
                   "snapshot: focus, role, subrole, then value and range; each poll re-reads role and subrole; focus checked last")
  }

  /// The checkpoint's wait comes before the intervention guard, so a user event during it stops the key.
  func testTheGuardBeforeAKeyRunsAfterTheCheckpointsWait() throws {
    let field = FakeField(value: "", range: NSRange(location: 0, length: 0))
    field.role = "AXTextField"
    field.lagReads = 10
    let app = FakeApp(field)
    var guardedAt: [Double] = []
    var meta = meta()
    try keyTextReadBack(units("ab\n"), concealed: false, reads: app.reads, checkSource: { _, _ in },
                        checkIntervention: { guardedAt.append(app.clock) }, post: { event in
                          if event.kind == .down, let text = event.text { field.deliver(text) }
                          return true
                        }, pause: {}, meta: &meta)
    XCTAssertEqual(guardedAt, [0, 0, 50], "the Return's guard read after the 50 ms the text took to read back")
  }

  func testAnInterventionStopKeepsTheRecord() {
    let field = FakeField(value: "", range: NSRange(location: 0, length: 0))
    var meta = meta()
    var checks = 0
    XCTAssertThrowsError(try keyTextReadBack(units("abc"), concealed: false, reads: FakeApp(field).reads, checkSource: { _, _ in },
                                             checkIntervention: { checks += 1; if checks == 2 { throw userChanged("x") } },
                                             post: { _ in true }, pause: {}, meta: &meta)) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "userIntervened", "the guard's own error, not the read-back's")
    }
    XCTAssertEqual(record(meta)["confirmed"] as? Bool, false)
    XCTAssertEqual(field.calls.filter { $0 == "value" }.count, 1, "no poll after a stop")
  }

  // MARK: press_key

  func testPressKeysMetaSaysItsEffectIsUnconfirmed() throws {
    var posted = meta()
    try keyPresses([KeyPress(keyCode: 0, modifiers: [.command])], checkIntervention: {}, post: { _ in true }, meta: &posted)
    XCTAssertEqual(posted.wire["keyEffect"] as? String, "unconfirmed")
    var stopped = meta()
    var checks = 0
    XCTAssertThrowsError(try keyPresses([KeyPress(keyCode: 0, modifiers: []), KeyPress(keyCode: 1, modifiers: [])], checkIntervention: {
      checks += 1
      if checks == 2 { throw userChanged("x") }
    }, post: { _ in true }, meta: &stopped))
    XCTAssertEqual(stopped.wire["keyEffect"] as? String, "unconfirmed", "a sequence stopped after a press posted says so too")
    var refused = meta()
    XCTAssertThrowsError(try keyPresses([KeyPress(keyCode: 0, modifiers: [])], checkIntervention: { throw userChanged("x") },
                                        post: { _ in true }, meta: &refused))
    XCTAssertNil(refused.wire["keyEffect"], "nothing posted, nothing to say")
  }
}
