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
  /// An app that takes the text but reports its selected range where it was before (`initialRange`).
  var moveCaret = true
  /// Once typed into, the selected range the field reports instead of its own (a contenteditable's placeholder line),
  /// or none at all.
  var caretAfterTyping: NSRange?
  var caretUnreadableAfterTyping = false
  /// What a Return adds at the very end of the value, wherever it was typed (a placeholder line far from the caret).
  var lineAtEndAfterReturn = ""
  private(set) var delivered = false
  /// The selected range a read answers.
  var reportedRange: NSRange? {
    guard delivered else { return range }
    if caretUnreadableAfterTyping { return nil }
    if let caretAfterTyping { return caretAfterTyping }
    return moveCaret ? range : initialRange
  }
  /// A change after this many value reads (a field turning secure, unreadable, or re-created).
  var changeAfterReads: Int?
  var change: (FakeField) -> Void = { _ in }
  /// A change after this many selected-range reads (a late key landing between a caret read and the next value read).
  var changeAfterRangeReads: Int?
  var changeAtRange: (FakeField) -> Void = { _ in }
  var calls: [String] = []
  /// Before anything is typed, the value and selected range each value read finds, one per read (an editing key's
  /// effect landing while the snapshot settles); the field keeps the last.
  var statesBeforeTyping: [(String, NSRange)] = []
  /// Before anything is typed, the selected range each range read finds, one per read (a late click moving the caret
  /// while #359's wait reads it); the field keeps the last.
  var rangesBeforeTyping: [NSRange] = []
  private var rangeReads = 0
  private(set) var initialRange: NSRange?
  private var shown: String?
  private var lagLeft = 0
  private var valueReads = 0

  init(value: String?, range: NSRange?) {
    self.value = value
    self.range = range
    initialRange = range
    shown = value
  }

  func deliver(_ text: [UInt16]) {
    guard !ignoresInput, var current = value, let selection = range, NSMaxRange(selection) <= (current as NSString).length else { return }
    let typed = String(utf16CodeUnits: text, count: text.count)
    if typed == "\r" && !returnInserts { return }
    let inserted = transform(typed == "\r" ? "\n" : typed)
    current = (current as NSString).replacingCharacters(in: selection, with: inserted)
    if typed == "\r" { current += lineAtEndAfterReturn }
    shown = value
    value = current
    range = NSRange(location: selection.location + (inserted as NSString).length, length: 0)
    lagLeft = lagReads
    delivered = true
  }

  func readValue() -> String? {
    calls.append("value")
    valueReads += 1
    if !delivered, !statesBeforeTyping.isEmpty { (value, range) = statesBeforeTyping.removeFirst(); shown = value }
    defer { if valueReads == changeAfterReads { change(self) } }
    if lagLeft > 0 { lagLeft -= 1; return shown }
    shown = value
    return value
  }

  func readRange() -> NSRange? {
    calls.append("range")
    rangeReads += 1
    if !delivered, !rangesBeforeTyping.isEmpty { range = rangesBeforeTyping.removeFirst() }
    defer { if rangeReads == changeAfterRangeReads { changeAtRange(self) } }
    return reportedRange
  }

  /// #414: what the length batch's count slot answers: the value's UTF-16 length, nothing (unsupported), or a failure.
  enum Count { case length, absent, failed }
  var count = Count.length
  /// Whether the batch's range slot answers (else absent), and whether the whole request fails.
  var rangeInBatch = true
  var batchFails = false

  /// #414: the length batch (role, subrole, range, count), as AXUIElementCopyMultipleAttributeValues answers it: logged as
  /// "batch", never as a value or range read, its count the value as shown (late like a value read), its range the
  /// reported one; the states before typing and the change after reads count it as a value read.
  func readLength() -> AttributeRead? {
    calls.append("batch")
    valueReads += 1
    if !delivered, !statesBeforeTyping.isEmpty { (value, range) = statesBeforeTyping.removeFirst(); shown = value }
    if !delivered, !rangesBeforeTyping.isEmpty { range = rangesBeforeTyping.removeFirst() }
    defer { if valueReads == changeAfterReads { change(self) } }
    if batchFails { return nil }
    var read = AttributeRead()
    if let role { read.values[kAXRoleAttribute] = role as CFString }
    switch subrole {
    case .value(let found): read.values[kAXSubroleAttribute] = found as CFString
    case .absent: break
    case .failed: read.unreadable.insert(kAXSubroleAttribute)
    }
    let text: String?
    if lagLeft > 0 { lagLeft -= 1; text = shown } else { shown = value; text = value }
    switch count {
    case .length: if let text { read.values[kAXNumberOfCharactersAttribute] = (text as NSString).length as CFNumber }
    case .absent: break
    case .failed: read.unreadable.insert(kAXNumberOfCharactersAttribute)
    }
    if rangeInBatch, let shownRange = reportedRange {
      read.values[kAXSelectedTextRangeAttribute] = axRangeValue(CFRange(location: shownRange.location, length: shownRange.length))
    }
    return read
  }
}

/// The fake app: its focused field, a clock that advances only by the poll's sleeps, and the reads over both.
private final class FakeApp {
  var focused: FakeField?
  var clock: Double = 0
  var sleeps = 0

  init(_ field: FakeField?) { focused = field }

  var reads: ReadbackReads<FakeField> {
    // The application's own focus, read again after typing (`stillFocused`) as main's lookup reads it.
    ReadbackReads(focused: { self.focused?.calls.append("focused"); return self.focused.map { .field($0, by: .focus) } },
                  stillFocused: { field, _ in self.focused?.calls.append("focused"); return self.focused === field },
                  role: { $0.calls.append("role"); return $0.role },
                  subrole: { $0.calls.append("subrole"); return $0.subrole },
                  value: { $0.readValue() },
                  valueUnits: { field in field.readValue().map { Array($0.utf16) } },
                  range: { $0.readRange() },
                  batch: { field, _ in field.readLength() },
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
  private func type(_ text: String, into app: FakeApp, concealed: Bool = false, settle: Bool = false,
                    baseline: BaselineWait? = nil) -> (EngineError?, InputMeta) {
    var meta = meta()
    do {
      try keyTextReadBack(units(text), concealed: concealed, settle: settle, baseline: baseline, reads: app.reads, checkSource: { _, _ in },
                          checkIntervention: {},
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

  /// #414: a password field (by role, by subrole, or a text-entry role whose subrole cannot be read) is confirmed by its
  /// length, its value and its range never read but in the length batch; its record says only that it is one and how
  /// it was confirmed, and its success carries the note. Any other element the classification closes is refused
  /// unread, as before.
  func testASecureFieldIsConfirmedByItsLengthAndItsValueIsNeverRead() {
    for (name, role, subrole) in [("secure role", "AXSecureTextField", ReadbackSubrole.absent),
                                  ("secure subrole", "AXTextField", .value("AXSecureTextField")),
                                  ("unreadable subrole", "AXTextField", .failed),
                                  ("a text area's unreadable subrole", "AXTextArea", .failed)] {
      let field = FakeField(value: "hunter2", range: NSRange(location: 7, length: 0))
      field.role = role
      field.subrole = subrole
      let (error, meta) = type("pass", into: FakeApp(field))
      XCTAssertNil(error, name)
      XCTAssertEqual(field.value, "hunter2pass", name)
      XCTAssertEqual(record(meta) as NSDictionary, ["confirmed": true, "secure": true, "confirmation": "length", "snapshotMs": 0.0] as NSDictionary, name)
      XCTAssertEqual(meta.note, readbackLengthNote, name)
      XCTAssertEqual(field.calls, ["focused", "role", "subrole", "batch"] + Array(repeating: "batch", count: 1 + Int(typeReadbackLengthDwellMs / typeReadbackPollIntervalMs)) + ["focused"],
                     "\(name): no value or range read; the match, then the quiet window's reads")
    }
    for (name, role, subrole) in [("a group's unreadable subrole", "AXGroup", ReadbackSubrole.failed),
                                  ("a static text marked secure", "AXStaticText", .value("AXSecureTextField"))] {
      let field = FakeField(value: "hunter2", range: NSRange(location: 7, length: 0))
      field.role = role
      field.subrole = subrole
      let (error, meta) = type("pass", into: FakeApp(field))
      XCTAssertEqual(error?.errorName, "typeUnconfirmed", name)
      XCTAssertEqual(record(meta)["reason"] as? String, "secure", name)
      XCTAssertNil(record(meta)["secure"], name)
      XCTAssertEqual(field.calls, ["focused", "role", "subrole"], "\(name): nothing read")
      XCTAssertTrue(error?.message.contains("a secure element that is not a text field, which is never read back") ?? false, name)
    }
    // A plain field's success carries no note and no strength: the exact read-back.
    let plain = FakeField(value: "user", range: NSRange(location: 4, length: 0))
    let (error, meta) = type("name", into: FakeApp(plain))
    XCTAssertNil(error)
    XCTAssertNil(meta.note)
    XCTAssertNil(record(meta)["confirmation"])
    XCTAssertNil(record(meta)["secure"])
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

  /// The review of dad56362..af1860ef, P2: a concealed record counts nothing, so one Return and three in a secret read
  /// alike; a key left unconfirmed is a flag.
  func testAConcealedRecordCountsNoKeysNorSegments() {
    func concealedMeta(_ text: String, role: String) -> NSDictionary {
      let field = FakeField(value: "", range: NSRange(location: 0, length: 0))
      field.role = role
      field.returnInserts = role == "AXTextArea"
      let (error, meta) = type(text, into: FakeApp(field), concealed: true)
      XCTAssertNil(error, "\(role) \(text.debugDescription)")
      return record(meta) as NSDictionary
    }
    for role in ["AXTextField", "AXTextArea"] {
      XCTAssertEqual(concealedMeta("\n", role: role), concealedMeta("\n\n\n", role: role), role)
      XCTAssertEqual(concealedMeta("a\nb", role: role), concealedMeta("a\n\n\nb", role: role), role)
    }
    let single = concealedMeta("a\nb", role: "AXTextField")
    XCTAssertEqual(single["keysUnconfirmed"] as? Bool, true, "a flag, not a count")
    XCTAssertEqual(single["concealed"] as? Bool, true)
    for key in ["checkpoints", "reads", "pollMs", "expectedLength", "actualLength"] { XCTAssertNil(single[key], key) }
    // A plain request keeps its counts.
    let plain = FakeField(value: "", range: NSRange(location: 0, length: 0))
    plain.role = "AXTextField"
    plain.returnInserts = false
    let plainRecord = record(type("a\n\n\nb", into: FakeApp(plain)).1)
    XCTAssertEqual(plainRecord["keysUnconfirmed"] as? Int, 3)
    XCTAssertEqual(plainRecord["checkpoints"] as? Int, 1)
  }

  /// The review of af1860ef..a8e55870, P2, and ruling 1ea561bc:593: a secret's own keys make no checkpoint, so how its
  /// text is segmented sets no number of confirmation waits; it is read back once, after its last unit.
  func testASecretsKeysMakeNoCheckpointSoItsSegmentsSetNoWaits() {
    func waits(_ text: String) -> (confirms: Int, sleeps: Int, record: NSDictionary) {
      let field = FakeField(value: "", range: NSRange(location: 0, length: 0))
      field.role = "AXTextField"
      field.returnInserts = false
      let app = FakeApp(field)
      let (error, meta) = type(text, into: app, concealed: true)
      XCTAssertNil(error, text.debugDescription)
      // The snapshot reads focus once; every confirmation wait ends with one more focus read.
      return (field.calls.filter { $0 == "focused" }.count - 1, app.sleeps, record(meta) as NSDictionary)
    }
    let segmented = waits("a\nb\nc"), joined = waits("abc\n\n")
    XCTAssertEqual(segmented.confirms, 1)
    XCTAssertEqual(joined.confirms, 1)
    XCTAssertEqual(segmented.sleeps, joined.sleeps)
    XCTAssertEqual(segmented.record, joined.record)
    XCTAssertEqual(segmented.record["keysUnconfirmed"] as? Bool, true)
    XCTAssertEqual(waits("\n\n").confirms, 1, "a secret of keys alone is read back once too, so it is not told apart by a missing wait")
    // A secret that would submit wrong text is not stopped before its Return: the mismatch is answered after it.
    let wrong = FakeField(value: "", range: NSRange(location: 0, length: 0))
    wrong.role = "AXTextField"
    wrong.returnInserts = false
    wrong.transform = { $0.uppercased() }
    let (error, meta) = type("pa\nss", into: FakeApp(wrong), concealed: true)
    XCTAssertEqual(error?.errorName, "typeUnconfirmed")
    XCTAssertEqual(record(meta)["reason"] as? String, "concealedMismatch")
    XCTAssertNil(record(meta)["stoppedBeforeKey"])
  }

  /// The caller's own text still checkpoints its keys: a type_text after the secret's, its text the caller's.
  func testALeavingKeyInTheCallersTextAfterASecretStillCheckpoints() {
    let field = FakeField(value: "", range: NSRange(location: 0, length: 0))
    field.role = "AXTextField"
    field.returnInserts = false
    let app = FakeApp(field)
    XCTAssertNil(type("s3cr3t", into: app, concealed: true).0)
    let (error, meta) = type(" ok\n", into: app)
    XCTAssertNil(error)
    XCTAssertEqual(record(meta)["checkpoints"] as? Int, 1, "the caller's Return waits for its text to read back")
    XCTAssertEqual(record(meta)["keysUnconfirmed"] as? Int, 1)
  }

  /// The review of a8e55870..8f465bf9, P2: a secret that equals the selection it replaces takes the same reads and
  /// waits as one that does not, so the schedule is no equality oracle; and a secret whose caret never moves is not
  /// confirmed.
  func testEveryConcealedConfirmationTakesTheSameSchedule() {
    func schedule(_ secret: String) -> (calls: [String], sleeps: Int, record: NSDictionary) {
      let field = FakeField(value: "abc", range: NSRange(location: 0, length: 3))
      let app = FakeApp(field)
      let (error, meta) = type(secret, into: app, concealed: true)
      XCTAssertNil(error, secret)
      XCTAssertEqual(field.value, secret)
      return (field.calls, app.sleeps, record(meta) as NSDictionary)
    }
    let same = schedule("abc"), other = schedule("xyz")
    XCTAssertEqual(same.calls, other.calls, "the same reads, in the same order")
    XCTAssertEqual(same.sleeps, other.sleeps)
    XCTAssertEqual(same.record, other.record)
    XCTAssertTrue(other.calls.contains("range") && other.calls.filter { $0 == "range" }.count == 2,
                  "the snapshot's range and the caret's, for a secret that changed the field too: \(other.calls)")

    let stuck = FakeField(value: "", range: NSRange(location: 0, length: 0))
    stuck.moveCaret = false  // the value takes the text, the caret reads where it was
    let (error, meta) = type("s3cr3t", into: FakeApp(stuck), concealed: true)
    XCTAssertEqual(stuck.value, "s3cr3t")
    XCTAssertEqual(error?.errorName, "typeUnconfirmed")
    XCTAssertEqual(record(meta)["reason"] as? String, "unchanged")
  }

  /// A node of a fake accessibility tree, for the focused field's lookup.
  private final class Node {
    let name: String
    var role: String?
    var focusedFlag = false
    var children: [Node] = []
    var focused: Node?
    var focusedWindow: Node?
    var mainWindow: Node?
    var value: String? = "v"
    /// The walk's reads of this element that fail (a timeout, cannotComplete): "role", "focused", "children"; "noFocus"
    /// makes its AXFocused absent instead.
    var failing: Set<String> = []
    init(_ name: String, role: String? = "AXGroup", children: [Node] = []) { self.name = name; self.role = role; self.children = children }
  }

  /// The walk's reads over a fake tree, each logged; `msPerNode` advances the clock at each element's role read.
  private func walkReads(_ log: @escaping (String) -> Void, clock: @escaping () -> Double = { 0 }, tick: @escaping () -> Void = {}) -> ReadbackFocusWalk<Node> {
    ReadbackFocusWalk(children: { node in
      log("children@\(node.name)")
      return node.failing.contains("children") ? .failed : .value(node.children)
    }, isFocused: { node in
      log("isFocused@\(node.name)")
      if node.failing.contains("focused") { return .failed }
      return node.failing.contains("noFocus") ? .absent : .value(node.focusedFlag)
    }, role: { node in
      tick()
      log("role@\(node.name)")
      if node.failing.contains("role") { return .failed }
      return node.role.map { .value($0) } ?? .absent
    }, now: clock)
  }

  /// The lookup over a fake tree, every read recorded; `msPerNode` advances the clock at each element's role read.
  private func lookup(_ app: Node, reads: inout [String], msPerNode: Double = 0) -> Node? {
    var log: [String] = [], clock = 0.0
    defer { reads = log }
    let found = readbackFocusedField(application: app, focused: { node in
                                       log.append("focused@\(node.name)")
                                       return node.focused.map { .value($0) } ?? .absent
                                     },
                                     primaryWindow: { node in log.append("window"); return node.focusedWindow ?? node.mainWindow },
                                     walk: walkReads({ log.append($0) }, clock: { clock }, tick: { clock += msPerNode }))
    guard case .field(let field, .focus, _)? = found else { return nil }
    return field
  }

  /// Run 44022892172 (Safari 27.2, no key first): the application's AXFocusedUIElement answered no value, the windows'
  /// focus attributes were unsupported and the web area's answered no value, while a walk of the window found the one
  /// element with AXFocused true, the text field, 10 of 10. The application's answer comes first; else the primary
  /// window (focused, else main) is walked, and exactly one focused text-entry element is claimed.
  func testTheFocusedFieldIsFoundByAWalkWhenTheApplicationAnswersNone() {
    func page(_ fields: [Node]) -> Node {
      let web = Node("web", role: "AXWebArea", children: [Node("heading", role: "AXHeading"), Node("form", children: fields)])
      let window = Node("window", role: "AXWindow", children: [Node("toolbar", role: "AXToolbar", children: [Node("back", role: "AXButton")]), web])
      let app = Node("app", role: "AXApplication")
      app.mainWindow = window
      return app
    }
    var reads: [String] = []
    let field = Node("field", role: "AXTextField", children: [Node("text", role: "AXStaticText")])
    field.focusedFlag = true
    let app = page([Node("label", role: "AXStaticText"), field])
    XCTAssertTrue(lookup(app, reads: &reads) === field, "the one focused text field in the web area")
    XCTAssertEqual(Array(reads.prefix(2)), ["focused@app", "window"])
    XCTAssertFalse(reads.contains("children@field"), "nothing inside the field is read: \(reads)")
    XCTAssertFalse(reads.contains("focused@window"), "the window's own focus attribute is not asked")
    XCTAssertFalse(reads.contains("isFocused@heading"), "AXFocused is read only of a text-entry element")

    app.focused = field
    XCTAssertTrue(lookup(app, reads: &reads) === field)
    XCTAssertEqual(reads, ["focused@app"], "the application's own answer first, nothing walked")

    // The focused window before the main one.
    let other = Node("other", role: "AXTextArea")
    other.focusedFlag = true
    let app2 = page([field])
    app2.focusedWindow = Node("front", role: "AXWindow", children: [other])
    XCTAssertTrue(lookup(app2, reads: &reads) === other)

    // A focused element that is not a text-entry role is no claim (a focused button).
    let button = Node("button", role: "AXButton")
    button.focusedFlag = true
    XCTAssertNil(lookup(page([button]), reads: &reads))

    // No window: no field.
    XCTAssertNil(lookup(Node("bare", role: "AXApplication"), reads: &reads))
  }

  /// Run 44022892172: after a key press Safari's AXWebArea itself reads AXFocused true beside the editor, 10 of 10. Only
  /// text-entry elements count, so the web area is walked through, never claimed nor counted against the field.
  func testAFocusedWebAreaIsNeitherClaimedNorCounted() {
    var reads: [String] = []
    let field = Node("editor", role: "AXTextField")
    field.focusedFlag = true
    let web = Node("web", role: "AXWebArea", children: [Node("group", children: [field])])
    web.focusedFlag = true
    let app = Node("app")
    app.mainWindow = Node("window", role: "AXWindow", children: [web])
    XCTAssertTrue(lookup(app, reads: &reads) === field, "the web area and the field both focused: the field")
    let editable = Node("region", role: "AXTextArea")  // a contenteditable region reads as a text area
    editable.focusedFlag = true
    web.children = [editable]
    XCTAssertTrue(lookup(app, reads: &reads) === editable, "a contenteditable region beside a focused web area")
    web.children = [Node("group", children: [Node("editor", role: "AXTextField")])]
    XCTAssertNil(lookup(app, reads: &reads), "only the web area focused: no claim")
  }

  /// Zero or several focused text-entry elements make no claim, and neither does a walk past its node, time or depth
  /// bound: an element left unread could be another.
  func testTheWalkClaimsOnlyOneFocusedFieldWithinItsBounds() {
    var reads: [String] = []
    let one = Node("one", role: "AXTextField"), two = Node("two", role: "AXTextArea")
    one.focusedFlag = true
    two.focusedFlag = true
    let app = Node("app")
    app.mainWindow = Node("window", role: "AXWindow", children: [Node("a", children: [one]), Node("b", children: [two])])
    XCTAssertNil(lookup(app, reads: &reads), "two focused fields: no claim")
    two.focusedFlag = false
    XCTAssertTrue(lookup(app, reads: &reads) === one)
    one.focusedFlag = false
    XCTAssertNil(lookup(app, reads: &reads), "none: no claim")

    // Past the node bound: the field sits after more nodes than the walk visits.
    one.focusedFlag = true
    let filler = (0..<typeReadbackFocusWalkNodes).map { Node("n\($0)") }
    app.mainWindow = Node("window", role: "AXWindow", children: filler + [one])
    XCTAssertNil(lookup(app, reads: &reads), "over the node bound: no claim")
    XCTAssertEqual(reads.filter { $0.hasPrefix("role@") }.count, typeReadbackFocusWalkNodes)
    // Within it: the window, the field and the nodes between them fill the bound exactly.
    app.mainWindow = Node("window", role: "AXWindow", children: Array(filler.prefix(typeReadbackFocusWalkNodes - 2)) + [one])
    XCTAssertTrue(lookup(app, reads: &reads) === one, "the window, the field and the nodes between fit the bound")

    // Past the time bound: each node costing a millisecond, the walk unfinished at the budget.
    let past = Array(filler.prefix(Int(typeReadbackFocusWalkMs) + 5))
    app.mainWindow = Node("window", role: "AXWindow", children: past + [one])
    XCTAssertNil(lookup(app, reads: &reads, msPerNode: 1), "over the time bound: no claim")
    // A second focused field past the bound would be unseen, so only a walk that finished claims.
    app.mainWindow = Node("window", role: "AXWindow", children: [one] + past)
    XCTAssertNil(lookup(app, reads: &reads, msPerNode: 1), "found early, but the walk did not finish: no claim")
    app.mainWindow = Node("window", role: "AXWindow", children: [one] + Array(filler.prefix(Int(typeReadbackFocusWalkMs) - 5)))
    XCTAssertTrue(lookup(app, reads: &reads, msPerNode: 1) === one, "finished inside the time bound")

    // The depth bound: the window is depth 0; an element at the bound is read, and children under it leave the walk
    // unfinished, so it claims nothing.
    func chain(_ depth: Int) -> (top: Node, deep: Node) {
      let field = Node("deep", role: "AXTextField")
      field.focusedFlag = true
      var node = field
      for level in 1..<depth { node = Node("g\(level)", children: [node]) }
      return (node, field)
    }
    app.mainWindow = Node("window", role: "AXWindow", children: [chain(typeReadbackFocusWalkDepth).top])
    XCTAssertEqual(lookup(app, reads: &reads)?.name, "deep", "a field at the depth bound")
    app.mainWindow = Node("window", role: "AXWindow", children: [chain(typeReadbackFocusWalkDepth + 1).top])
    XCTAssertNil(lookup(app, reads: &reads), "a field past the depth bound is not reached")
    XCTAssertFalse(reads.contains("role@deep"))
    // The review of 1bac4017..45e5a5ed (P1): one field near the top and another past the depth bound claim nothing.
    let shallow = Node("shallow", role: "AXTextField")
    shallow.focusedFlag = true
    app.mainWindow = Node("window", role: "AXWindow", children: [shallow, chain(typeReadbackFocusWalkDepth + 1).top])
    XCTAssertNil(lookup(app, reads: &reads), "a subtree left unread at the depth bound could hold another")
    let unfocused = chain(typeReadbackFocusWalkDepth)
    unfocused.deep.focusedFlag = false
    app.mainWindow = Node("window", role: "AXWindow", children: [shallow, unfocused.top])
    XCTAssertTrue(lookup(app, reads: &reads) === shallow, "a field at the depth bound is read whole, nothing left unread")
  }

  /// The review of 1bac4017..45e5a5ed (P2): every text-entry element is a leaf of the walk, focused or not, so nothing
  /// typed into a field is read: after a concealed request moved focus on (a trailing Tab), the identity check's walk
  /// reads the same elements whatever the editor it left now holds.
  func testTheWalkReadsNothingInsideAnyTextEntryElement() {
    func walked(_ lines: Int) -> [String] {
      let previous = Node("previous", role: "AXTextArea", children: (0..<lines).map { Node("line\($0)", role: "AXStaticText") })
      let next = Node("next", role: "AXTextField")
      next.focusedFlag = true
      let app = Node("app")
      app.mainWindow = Node("window", role: "AXWindow", children: [Node("web", role: "AXWebArea", children: [previous, next])])
      var reads: [String] = []
      XCTAssertTrue(lookup(app, reads: &reads) === next)
      return reads
    }
    XCTAssertEqual(walked(1), walked(8), "the same reads with 1 and 8 text elements under the editor left")
    XCTAssertFalse(walked(8).contains { $0.hasPrefix("children@previous") || $0.hasPrefix("role@line") })
  }

  /// The review of 1bac4017..45e5a5ed (P2): a read that fails (a timeout, cannotComplete) leaves the walk unfinished, so
  /// it claims nothing; an attribute the element does not have (noValue, unsupported) is an absence, not a failure.
  func testAFailedReadLeavesTheWalkUnfinished() {
    var reads: [String] = []
    let field = Node("field", role: "AXTextField")
    field.focusedFlag = true
    let group = Node("group", children: [Node("inner")])
    let app = Node("app")
    app.mainWindow = Node("window", role: "AXWindow", children: [field, group])
    XCTAssertTrue(lookup(app, reads: &reads) === field)
    for read in ["children", "role"] {
      group.failing = [read]
      XCTAssertNil(lookup(app, reads: &reads), "a subtree whose \(read) read failed could hold another field")
    }
    group.failing = []
    let other = Node("other", role: "AXTextField")
    other.failing = ["focused"]
    group.children = [other]
    XCTAssertNil(lookup(app, reads: &reads), "a text field whose AXFocused read failed could be focused")
    other.failing = ["noFocus"]  // no AXFocused: not focused
    XCTAssertTrue(lookup(app, reads: &reads) === field)
    other.failing = []
    group.role = nil  // no role: an absence, walked through
    XCTAssertTrue(lookup(app, reads: &reads) === field)
  }

  /// The live reads' errors as the walk counts them: noValue and attributeUnsupported are absences; any other error, and
  /// a value of the wrong type, a failure.
  func testTheWalksReadsKeepTheirErrors() {
    func kind(_ read: ReadbackWalkRead<String>) -> String {
      switch read {
      case .value(let value): return "value \(value)"
      case .absent: return "absent"
      case .failed: return "failed"
      }
    }
    let asString: (CFTypeRef) -> String? = { CFGetTypeID($0) == CFStringGetTypeID() ? ($0 as! String) : nil }
    XCTAssertEqual(kind(readbackWalkRead("AXTextField" as CFString, .success, asString)), "value AXTextField")
    XCTAssertEqual(kind(readbackWalkRead(kCFBooleanTrue, .success, asString)), "failed", "a value of the wrong type")
    XCTAssertEqual(kind(readbackWalkRead(nil, .noValue, asString)), "absent")
    XCTAssertEqual(kind(readbackWalkRead(nil, .attributeUnsupported, asString)), "absent")
    for error in [AXError.cannotComplete, .invalidUIElement, .failure, .notImplemented, .apiDisabled] {
      XCTAssertEqual(kind(readbackWalkRead(nil, error, asString)), "failed", "\(error.rawValue)")
    }
  }

  /// A secure field the walk finds is handled as any secure field (#414): taken by its length, its value and range never
  /// read but in the length batch.
  func testASecureFieldFoundByTheWalkIsNeverRead() {
    let secure = Node("password", role: "AXSecureTextField")
    secure.focusedFlag = true
    secure.value = "hunter2"
    let app = Node("app")
    app.mainWindow = Node("window", role: "AXWindow", children: [Node("web", role: "AXWebArea", children: [secure])])
    var valueReads = 0
    let walk = walkReads({ _ in })
    let reads = ReadbackReads<Node>(
      focused: { readbackFocusedField(application: app, focused: { $0.focused.map { .value($0) } ?? .absent },
                                      primaryWindow: { $0.focusedWindow ?? $0.mainWindow }, walk: walk) },
      stillFocused: { _, _ in true },
      role: { $0.role }, subrole: { _ in .absent }, value: { valueReads += 1; return $0.value },
      valueUnits: { valueReads += 1; return $0.value.map { Array($0.utf16) } },
      range: { _ in valueReads += 1; return NSRange(location: 0, length: 0) }, batch: { node, names in
        XCTAssertEqual(names, readbackLengthAttributes)
        var read = AttributeRead()
        read.values[kAXRoleAttribute] = (node.role ?? "") as CFString
        read.values[kAXNumberOfCharactersAttribute] = 7 as CFNumber
        read.values[kAXSelectedTextRangeAttribute] = axRangeValue(CFRange(location: 7, length: 0))
        return read
      }, now: { 0 }, sleep: { _ in })
    var settle: ReadbackSettle?
    guard case .expectLength(let field, _, let basis, _, _) = readbackSnapshot(reads: reads, settle: &settle) else {
      return XCTFail("a secure field is taken by its length")
    }
    XCTAssertTrue(field === secure)
    XCTAssertEqual(basis, .count(7, range: NSRange(location: 7, length: 0)))
    XCTAssertEqual(valueReads, 0)
  }

  /// The walk claims a field by its role, so one claimed as AXSecureTextField is a password field to the snapshot: shown
  /// as a text field by the snapshot's own role and subrole read (a show-password toggle in between), it is refused
  /// noLongerSecure, and nothing more is read of it, its length batch included. A text field the walk claims is taken by
  /// the snapshot's reads alone.
  func testAPasswordFieldTheWalkFoundThatIsShownAsTextIsReadNoFurther() {
    for claimed in ["AXSecureTextField", "AXTextField"] {
      let found = Node("field", role: claimed)
      found.focusedFlag = true
      found.value = "hunter2"
      let app = Node("app")
      app.mainWindow = Node("window", role: "AXWindow", children: [Node("web", role: "AXWebArea", children: [found])])
      var valueReads = 0, batches = 0
      let walk = walkReads({ _ in })
      let reads = ReadbackReads<Node>(
        focused: { readbackFocusedField(application: app, focused: { $0.focused.map { .value($0) } ?? .absent },
                                        primaryWindow: { $0.focusedWindow ?? $0.mainWindow }, walk: walk) },
        stillFocused: { _, _ in true },
        role: { _ in "AXTextField" }, subrole: { _ in .absent }, value: { valueReads += 1; return $0.value },
        valueUnits: { valueReads += 1; return $0.value.map { Array($0.utf16) } },
        range: { _ in valueReads += 1; return NSRange(location: 7, length: 0) }, batch: { _, _ in batches += 1; return nil },
        now: { 0 }, sleep: { _ in })
      var settle: ReadbackSettle?
      let plan = readbackSnapshot(reads: reads, settle: &settle)
      if claimed == "AXSecureTextField" {
        guard case .refused(.noLongerSecure) = plan else { return XCTFail("refused noLongerSecure: \(plan)") }
        XCTAssertEqual(valueReads, 0)
        XCTAssertEqual(batches, 0)
      } else {
        guard case .expect = plan else { return XCTFail("a text field: \(plan)") }
      }
    }
  }

  func testAConcealedTextIntoASecureFieldIsNeverRead() {
    let field = FakeField(value: "", range: NSRange(location: 0, length: 0))
    field.role = "AXSecureTextField"
    let (error, meta) = type("s3cr3t", into: FakeApp(field), concealed: true)
    XCTAssertNil(error)
    XCTAssertEqual(record(meta) as NSDictionary, ["confirmed": true, "secure": true, "confirmation": "length", "concealed": true,
                                                  "snapshotMs": 0.0] as NSDictionary)
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

  /// The review of dad56362..af1860ef, P1 (its repro): the field takes "a" over a selected "a" as "A" and moves the
  /// caret, but the first value read is still the old "a". A stale value read before the caret never confirms; only a
  /// value read after it counts, and that one reads "A".
  func testAStaleValueReadBeforeTheCaretNeverConfirms() {
    for concealed in [false, true] {
      let field = FakeField(value: "a", range: NSRange(location: 0, length: 1))
      field.transform = { $0.uppercased() }
      field.lagReads = 1
      let (error, meta) = type("a", into: FakeApp(field), concealed: concealed)
      XCTAssertEqual(field.value, "A")
      XCTAssertEqual(field.range, NSRange(location: 1, length: 0))
      XCTAssertEqual(error?.errorName, "typeUnconfirmed", "concealed: \(concealed)")
      XCTAssertEqual(record(meta)["reason"] as? String, concealed ? "concealedMismatch" : "valueMismatch", "concealed: \(concealed)")
    }
    // The same field when the app keeps the text: the read after the caret is equal, and confirms.
    let kept = FakeField(value: "a", range: NSRange(location: 0, length: 1))
    kept.lagReads = 1
    let (none, keptMeta) = type("a", into: FakeApp(kept))
    XCTAssertNil(none)
    XCTAssertEqual(record(keptMeta)["reads"] as? Int, 2, "the stale read, then the one after the caret")
    // At a checkpoint: the Return is held until a read after the caret, which shows the change.
    let field = FakeField(value: "a", range: NSRange(location: 0, length: 1))
    field.role = "AXTextField"
    field.transform = { $0.uppercased() }
    field.lagReads = 1
    var returns = 0
    var meta = meta()
    XCTAssertThrowsError(try keyTextReadBack(units("a\n"), concealed: false, reads: FakeApp(field).reads, checkSource: { _, _ in },
                                             checkIntervention: {}, post: { event in
                                               guard event.kind == .down, let text = event.text else { return true }
                                               if text == [0x0D] { returns += 1 } else { field.deliver(text) }
                                               return true
                                             }, pause: {}, meta: &meta))
    XCTAssertEqual(returns, 0, "the Return is never posted")
    XCTAssertEqual(record(meta)["stoppedBeforeKey"] as? Bool, true)
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
    XCTAssertFalse(readbackReturnIsText(role: "AXTextArea", subrole: .value("AXApplicationGroup")), "Firefox's contenteditable")
    XCTAssertTrue(readbackReturnIsText(role: "AXTextArea", subrole: .value("AXApplicationGroup"), unread: []))
    XCTAssertFalse(readbackReturnIsText(role: "AXTextField", subrole: .absent))
    XCTAssertFalse(readbackReturnIsText(role: "AXTextField", subrole: .value("AXSearchField")))
    XCTAssertFalse(readbackReturnIsText(role: "AXComboBox", subrole: .absent))
    XCTAssertEqual(typeReadbackReturnUnreadSubroles, ["AXApplicationGroup"], "ruling 1ea561bc:737")
    // Through the typing: a Return between lines in Firefox's contenteditable is a key, checked before it.
    let gecko = FakeField(value: "", range: NSRange(location: 0, length: 0))
    gecko.subrole = .value("AXApplicationGroup")
    gecko.returnInserts = false  // its AXValue shows no line break
    let (error, meta) = type("one\ntwo", into: FakeApp(gecko))
    XCTAssertNil(error)
    XCTAssertEqual(record(meta)["checkpoints"] as? Int, 1)
    XCTAssertEqual(record(meta)["keysUnconfirmed"] as? Int, 1)
  }

  /// Ruling 1ea561bc:737 on #354's A/B (run 43752829833): Safari's contenteditable reads an ending Return as "\n\n", its
  /// empty last line's placeholder. In a field that takes a Return as text, a read of the expected value and exactly one
  /// more "\n" confirms when the caret sits at the expected value's length (the placeholder line's start); a doubled
  /// Return, its caret one further on, does not; an unreadable caret is accepted, the stated residual.
  func testAnEndingReturnsPlaceholderLineConfirmsOnlyWithTheCaretAtItsStart() {
    func field(caretAt offset: Int?) -> FakeField {
      // A contenteditable: an ending Return shows the placeholder line, the caret where `offset` says (nil: unreadable).
      let editable = FakeField(value: "", range: NSRange(location: 0, length: 0))
      editable.transform = { $0 == "\n" ? "\n\n" : $0 }
      editable.caretAfterTyping = offset.map { NSRange(location: $0, length: 0) }
      editable.caretUnreadableAfterTyping = offset == nil
      return editable
    }
    let expected = "First line\n"
    let length = (expected as NSString).length
    let editable = field(caretAt: length)
    let (error, meta) = type(expected, into: FakeApp(editable))
    XCTAssertEqual(editable.value, "First line\n\n")
    XCTAssertNil(error, "a contenteditable's ending Return, its caret at the placeholder line's start, confirms")
    XCTAssertEqual(record(meta)["placeholderLine"] as? Bool, true)
    XCTAssertNil(record(meta)["keysUnconfirmed"], "the Return is text, confirmed with the rest (ruling 589)")

    let doubled = field(caretAt: length + 1)  // a text area given the Return twice reads the same value, its caret one on
    let (refused, refusedMeta) = type(expected, into: FakeApp(doubled))
    XCTAssertEqual(refused?.errorName, "typeUnconfirmed")
    XCTAssertEqual(record(refusedMeta)["reason"] as? String, "valueMismatch")

    let unread = field(caretAt: nil)
    let (accepted, acceptedMeta) = type(expected, into: FakeApp(unread))
    XCTAssertNil(accepted, "an unreadable caret is accepted, the ruling's stated residual")
    XCTAssertEqual(record(acceptedMeta)["placeholderCaretUnread"] as? Bool, true)

    // Never when text of the field follows the insertion, nor without an ending Return, nor in a single-line field.
    let middle = FakeField(value: "tail", range: NSRange(location: 0, length: 0))
    middle.transform = { $0 == "\n" ? "\n\n" : $0 }
    XCTAssertEqual(record(type("head\n", into: FakeApp(middle)).1)["reason"] as? String, "valueMismatch")
    let extra = FakeField(value: "", range: NSRange(location: 0, length: 0))
    extra.transform = { $0 == "e" ? "e\n" : $0 }
    extra.caretAfterTyping = NSRange(location: 4, length: 0)  // the caret where a placeholder line's start would be
    XCTAssertEqual(record(type("line", into: FakeApp(extra)).1)["reason"] as? String, "valueMismatch", "no ending Return typed")
    let midField = FakeField(value: "ab", range: NSRange(location: 0, length: 1))
    midField.lineAtEndAfterReturn = "\n"  // reads expected + "\n", the field's own text after the insertion
    midField.caretAfterTyping = NSRange(location: ("x\nb" as NSString).length, length: 0)
    XCTAssertEqual(record(type("x\n", into: FakeApp(midField)).1)["reason"] as? String, "valueMismatch", "the field's text follows")

    // A stale read before the caret never confirms the placeholder line: the read after it shows what the field holds.
    let stale = FakeField(value: "\n\n", range: NSRange(location: 0, length: 2))  // the old value is expected + "\n"
    stale.transform = { _ in "Y" }
    stale.lagReads = 1
    stale.caretAfterTyping = NSRange(location: 1, length: 0)
    let (staleError, staleMeta) = type("\n", into: FakeApp(stale))
    XCTAssertEqual(stale.value, "Y")
    XCTAssertEqual(staleError?.errorName, "typeUnconfirmed")
    XCTAssertEqual(record(staleMeta)["reason"] as? String, "valueMismatch")
    XCTAssertFalse(readbackPlaceholderLine(returnIsText: false, typedEndsInReturn: true, suffixEmpty: true))

    // A secret's ending Return: accepted on the caret every concealed confirmation reads anyway, a doubled one refused.
    let secret = field(caretAt: ("pw\n" as NSString).length)
    XCTAssertNil(type("pw\n", into: FakeApp(secret), concealed: true).0)
    let doubledSecret = field(caretAt: ("pw\n" as NSString).length + 1)
    XCTAssertEqual(record(type("pw\n", into: FakeApp(doubledSecret), concealed: true).1)["reason"] as? String, "unchanged")
  }

  /// The placeholder line costs a secret no read and no wait of its own: the same schedule as any concealed answer.
  func testASecretsPlaceholderLineTakesTheSameSchedule() {
    func schedule(_ placeholderLine: Bool) -> (calls: [String], sleeps: Int) {
      let editable = FakeField(value: "", range: NSRange(location: 0, length: 0))
      if placeholderLine {
        editable.transform = { $0 == "\n" ? "\n\n" : $0 }
        editable.caretAfterTyping = NSRange(location: 3, length: 0)
      }
      let app = FakeApp(editable)
      XCTAssertNil(type("pw\n", into: app, concealed: true).0)
      return (editable.calls, app.sleeps)
    }
    let plain = schedule(false), placeholder = schedule(true)
    XCTAssertEqual(plain.calls, placeholder.calls)
    XCTAssertEqual(plain.sleeps, placeholder.sleeps)
  }

  /// The review of bd63a0cc..5582db9c (P1): the caret confirms only the value it was read with. A text area reads "x\n" with
  /// its caret right, then a late second Return makes it "x\n\n", its caret one on: that is the placeholder line's value,
  /// and the caret seen with "x\n" must not confirm it.
  func testTheCaretConfirmsOnlyTheValueItWasReadWith() {
    func doubling(_ before: String, selected: NSRange) -> FakeField {
      let area = FakeField(value: before, range: selected)
      area.changeAfterRangeReads = 2  // the snapshot's caret read, then the poll's first: the second Return lands after it
      area.changeAtRange = { $0.value = "x\n\n"; $0.range = NSRange(location: 3, length: 0) }
      return area
    }
    let secret = doubling("", selected: NSRange(location: 0, length: 0))
    let (error, meta) = type("x\n", into: FakeApp(secret), concealed: true)
    XCTAssertEqual(secret.value, "x\n\n")
    XCTAssertEqual(error?.errorName, "typeUnconfirmed", "a secret's doubled Return is not confirmed by the caret of the read before")
    XCTAssertEqual(record(meta)["reason"] as? String, "unchanged")
    XCTAssertGreaterThan(secret.calls.filter { $0 == "range" }.count, 2, "the caret is read again with the new value")

    // The plain path's unchanged value (a Return typed over the selected one) and its placeholder line likewise.
    let plain = doubling("x\n", selected: NSRange(location: 1, length: 1))
    let (plainError, plainMeta) = type("\n", into: FakeApp(plain))
    XCTAssertEqual(plain.value, "x\n\n")
    XCTAssertEqual(plainError?.errorName, "typeUnconfirmed")
    XCTAssertEqual(record(plainMeta)["reason"] as? String, "valueMismatch")
  }

  /// The caret evidence lasts only while the reads show its value: a read of anything else drops it, so the same value
  /// coming back has its caret read again (here moved back to where it was, which never confirms).
  func testAReadOfAnotherValueDropsTheCaretEvidence() {
    for concealed in [false, true] {
      let field = FakeField(value: "a", range: NSRange(location: 0, length: 1))  // "a" typed over itself: the caret must move
      field.changeAfterRangeReads = 2  // after the poll's first caret read, which sees it moved
      field.changeAtRange = { $0.value = "b" }
      field.changeAfterReads = 3  // the snapshot's value read, "a", then "b": the value comes back, its caret at the start
      field.change = { $0.value = "a"; $0.range = NSRange(location: 0, length: 0) }
      let (error, meta) = type("a", into: FakeApp(field), concealed: concealed)
      XCTAssertEqual(error?.errorName, "typeUnconfirmed", "concealed: \(concealed)")
      XCTAssertEqual(record(meta)["reason"] as? String, "unchanged", "concealed: \(concealed)")
    }
  }

  // MARK: The settle before the snapshot (ruling 1ea561bc:754)

  /// Only a key or chord posted to the app within the window settles the snapshot; it is the engine's call, by pid.
  func testAKeyPostedWithinTheWindowSettlesTheSnapshot() {
    let keys = RecentKeyPosts()
    XCTAssertFalse(keys.settles(pid: 5, at: 1_000), "no key posted")
    keys.record(pid: 5, at: 1_000)
    XCTAssertTrue(keys.settles(pid: 5, at: 1_000 + typeReadbackSettleWindowMs))
    XCTAssertFalse(keys.settles(pid: 5, at: 1_001 + typeReadbackSettleWindowMs), "a key past the window")
    XCTAssertFalse(keys.settles(pid: 6, at: 1_100), "another app's key")
    keys.record(pid: 5, at: 1_500)
    XCTAssertTrue(keys.settles(pid: 5, at: 1_400 + typeReadbackSettleWindowMs), "the latest key counts")
  }

  /// Without a recent key the snapshot is taken at once, as before; with one, a stable field costs one more value and
  /// range read and one settle interval.
  func testTheSettleRunsOnlyWhenAsked() {
    let plain = FakeField(value: "ab", range: NSRange(location: 2, length: 0))
    let plainApp = FakeApp(plain)
    XCTAssertNil(type("c", into: plainApp).0)
    XCTAssertEqual(Array(plain.calls.prefix(6)), ["focused", "role", "subrole", "value", "range", "role"])
    XCTAssertEqual(plainApp.sleeps, 0)
    XCTAssertNil(record(type("c", into: FakeApp(FakeField(value: "ab", range: NSRange(location: 2, length: 0)))).1)["settleReads"])

    let settled = FakeField(value: "ab", range: NSRange(location: 2, length: 0))
    let settledApp = FakeApp(settled)
    let (error, meta) = type("c", into: settledApp, settle: true)
    XCTAssertNil(error)
    XCTAssertEqual(Array(settled.calls.prefix(10)), ["focused", "role", "subrole", "value", "range", "role", "subrole", "value", "range", "role"],
                   "each settle read checks the role and subrole first, as the poll does")
    XCTAssertEqual(settledApp.sleeps, 1)
    XCTAssertEqual(settledApp.clock, typeReadbackSettleIntervalMs)
    XCTAssertEqual(record(meta)["settleReads"] as? Int, 1)
    XCTAssertNil(record(meta)["settleCapped"])
  }

  /// A key's effect landing while the snapshot settles (an undo taking the text away in steps): the snapshot is the
  /// field once two reads an interval apart agree, so the text typed after it is expected over what the key left.
  func testTheSettleTakesTheSnapshotOnceTwoReadsAgree() {
    let field = FakeField(value: "abc", range: NSRange(location: 3, length: 0))
    field.statesBeforeTyping = [("abc", NSRange(location: 3, length: 0)), ("ab", NSRange(location: 2, length: 0)),
                                ("", NSRange(location: 0, length: 0)), ("", NSRange(location: 0, length: 0))]
    let (error, meta) = type("x", into: FakeApp(field), settle: true)
    XCTAssertNil(error, "expected over the field the undo left")
    XCTAssertEqual(field.value, "x")
    XCTAssertEqual(record(meta)["settleReads"] as? Int, 3)

    // A select-all landing: the same value, the selection changed.
    let selecting = FakeField(value: "hello", range: NSRange(location: 5, length: 0))
    selecting.statesBeforeTyping = [("hello", NSRange(location: 5, length: 0)), ("hello", NSRange(location: 0, length: 5)),
                                    ("hello", NSRange(location: 0, length: 5))]
    let (selected, selectedMeta) = type("x", into: FakeApp(selecting), settle: true)
    XCTAssertNil(selected)
    XCTAssertEqual(selecting.value, "x")
    XCTAssertEqual(record(selectedMeta)["settleReads"] as? Int, 2, "a changed selection is a change")
  }

  /// The settled snapshot keeps the snapshot's checks: a value at the cap, a range outside the value.
  func testASettledSnapshotKeepsTheSnapshotsChecks() {
    let capped = FakeField(value: "a", range: NSRange(location: 1, length: 0))
    let long = String(repeating: "a", count: typeReadbackValueCap)
    capped.statesBeforeTyping = [("a", NSRange(location: 1, length: 0)), (long, NSRange(location: 0, length: 0)),
                                 (long, NSRange(location: 0, length: 0))]
    XCTAssertEqual(record(type("x", into: FakeApp(capped), settle: true).1)["reason"] as? String, "possiblyTruncated")
    let outside = FakeField(value: "ab", range: NSRange(location: 2, length: 0))
    outside.statesBeforeTyping = [("ab", NSRange(location: 2, length: 0)), ("ab", NSRange(location: 5, length: 0)),
                                  ("ab", NSRange(location: 5, length: 0))]
    // Refused at the snapshot, as an unsettled one is: no checkpoint, so a Tab after the text is not held back.
    let (_, outsideMeta) = type("x\t", into: FakeApp(outside), settle: true)
    XCTAssertEqual(record(outsideMeta)["reason"] as? String, "rangeUnreadable")
    XCTAssertNil(record(outsideMeta)["stoppedBeforeKey"])
  }

  /// A field that never holds still is snapshotted from the last read the cap allows, and the meta says so.
  func testTheSettleStopsAtItsCap() {
    let counter = FakeField(value: "0", range: NSRange(location: 1, length: 0))
    counter.statesBeforeTyping = (1...12).map { ("\($0)", NSRange(location: 1, length: 0)) }
    let app = FakeApp(counter)
    let (error, meta) = type("x", into: app, settle: true)
    let reads = Int(typeReadbackSettleCapMs / typeReadbackSettleIntervalMs)
    XCTAssertNil(error)
    XCTAssertEqual(counter.value, "\(1 + reads)x", "the snapshot is the last read")
    XCTAssertEqual(record(meta)["settleReads"] as? Int, reads)
    XCTAssertEqual(record(meta)["settleCapped"] as? Bool, true)
    XCTAssertEqual(record(meta)["snapshotMs"] as? Double, Double(reads) * typeReadbackSettleIntervalMs)
    XCTAssertLessThanOrEqual(Double(reads) * typeReadbackSettleIntervalMs, typeReadbackSettleCapMs)
  }

  /// The settle comes after the secure check: a password field's value and range are never read, settle or not; it
  /// settles on its length batch instead (#414), whose last read is the starting point, so a select-all that lands late
  /// is typed over as the field then holds it.
  func testTheSettleNeverReadsASecureField() {
    let field = FakeField(value: "hunter2", range: NSRange(location: 7, length: 0))
    field.role = "AXSecureTextField"
    field.statesBeforeTyping = [("hunter2", NSRange(location: 7, length: 0)), ("hunter2", NSRange(location: 0, length: 7)),
                                ("hunter2", NSRange(location: 0, length: 7))]
    let app = FakeApp(field)
    let (error, meta) = type("pass", into: app, settle: true)
    XCTAssertNil(error)
    XCTAssertEqual(field.value, "pass")
    XCTAssertEqual(record(meta)["confirmation"] as? String, "length")
    XCTAssertNil(record(meta)["settleReads"], "a password field's record counts nothing")
    XCTAssertFalse(field.calls.contains("value") || field.calls.contains("range"), "\(field.calls)")
    XCTAssertEqual(app.sleeps, 2 + Int(typeReadbackLengthDwellMs / typeReadbackPollIntervalMs), "two settle intervals, until two reads agreed, then the quiet window's")
    // A select-all landing after the snapshot: the starting point is the caret before it, and the length cannot match.
    let unsettled = FakeField(value: "hunter2", range: NSRange(location: 7, length: 0))
    unsettled.role = "AXSecureTextField"
    unsettled.changeAfterReads = 1
    unsettled.change = { $0.range = NSRange(location: 0, length: 7) }
    XCTAssertEqual(record(type("pass", into: FakeApp(unsettled)).1)["reason"] as? String, "lengthMismatch")
    XCTAssertEqual(unsettled.value, "pass")

    // A field that turns secure while the snapshot settles is read no further.
    let turning = FakeField(value: "user", range: NSRange(location: 4, length: 0))
    turning.role = "AXTextField"
    turning.changeAfterReads = 1
    turning.change = { $0.role = "AXSecureTextField" }
    XCTAssertEqual(record(type("pass", into: FakeApp(turning), settle: true).1)["reason"] as? String, "becameSecure")
    XCTAssertEqual(turning.calls.filter { $0 == "value" }.count, 1, "only the snapshot's read, before it turned secure")
  }

  /// The settle reads the field before any of a secret is typed: its reads, waits and meta are the same whatever the
  /// secret, over a field that holds still and over one a key is still changing.
  func testASecretsSettleIsTheSameWhateverTheSecret() {
    func schedule(_ secret: String, moving: Bool) -> (calls: [String], sleeps: Int, record: NSDictionary) {
      let field = FakeField(value: "abc", range: NSRange(location: 0, length: 3))
      if moving {
        field.statesBeforeTyping = [("abc", NSRange(location: 3, length: 0)), ("abc", NSRange(location: 0, length: 3)),
                                    ("abc", NSRange(location: 0, length: 3))]
      }
      let app = FakeApp(field)
      let (error, meta) = type(secret, into: app, concealed: true, settle: true)
      XCTAssertNil(error, secret)
      XCTAssertEqual(field.value, secret)
      return (field.calls, app.sleeps, record(meta) as NSDictionary)
    }
    for moving in [false, true] {
      let same = schedule("abc", moving: moving), other = schedule("xyz", moving: moving)
      XCTAssertEqual(same.calls, other.calls, "moving: \(moving)")
      XCTAssertEqual(same.sleeps, other.sleeps, "moving: \(moving)")
      XCTAssertEqual(same.record, other.record, "moving: \(moving)")
      XCTAssertNil(same.record["settleReads"], "a concealed record counts nothing")
    }
  }

  // MARK: The wait before the snapshot for a late click (#359, ruling 1ea561bc:785)

  private let seed = "Old draft sentence goes here."
  private let whole = NSRange(location: 0, length: 29), clickCaret = NSRange(location: 3, length: 0)

  private func baselineRecord(_ meta: InputMeta) -> [String: Any] { record(meta)["baselineWait"] as? [String: Any] ?? [:] }

  /// select_text then type_text, the late click having moved the caret back past the cap: nothing is typed and the
  /// answer is typeUnconfirmed, never a success over the click's caret (the spike's false success: a starting point read
  /// after the click, self-consistent and wrong).
  func testSelectTextThenTypeTextWithTheRangeRevertedPastTheCapIsUnconfirmedAndTypesNothing() {
    let field = FakeField(value: seed, range: clickCaret)
    let app = FakeApp(field)
    var posted = 0
    var meta = meta()
    XCTAssertThrowsError(try keyTextReadBack(units("NEW359"), concealed: false, baseline: .selection(whole), reads: app.reads,
                                             checkSource: { _, _ in }, checkIntervention: {}, post: { _ in posted += 1; return true },
                                             pause: {}, meta: &meta)) { error in
      let error = error as? EngineError
      XCTAssertEqual(error?.errorName, "typeUnconfirmed")
      XCTAssertTrue(error?.message.hasPrefix("Nothing was typed: the field's selection is no longer the one selectText made") == true,
                    error?.message ?? "")
    }
    XCTAssertEqual(posted, 0, "no key posted")
    XCTAssertNil(meta.startedAt)
    XCTAssertEqual(meta.entered, 0)
    XCTAssertEqual(field.value, seed, "the field untouched")
    XCTAssertEqual(record(meta)["reason"] as? String, "selectionChanged")
    XCTAssertEqual(record(meta)["confirmed"] as? Bool, false)
    XCTAssertEqual(baselineRecord(meta)["for"] as? String, "selection")
    XCTAssertEqual(baselineRecord(meta)["capped"] as? Bool, true)
    XCTAssertEqual(baselineRecord(meta)["waitMs"] as? Double, pendingClickCapMs)
    XCTAssertFalse(field.calls.contains("value"), "refused before the value is read")
  }

  /// select_text's range read at once: one read, no wait, and the text replaces the selection.
  func testSelectTextsRangeReadAtOnceIsTypedOver() {
    let field = FakeField(value: seed, range: whole)
    let app = FakeApp(field)
    let (error, meta) = type("NEW359", into: app, baseline: .selection(whole))
    XCTAssertNil(error)
    XCTAssertEqual(field.value, "NEW359")
    XCTAssertEqual(app.sleeps, 0)
    XCTAssertEqual(baselineRecord(meta)["reads"] as? Int, 1)
    XCTAssertNil(baselineRecord(meta)["capped"])
    XCTAssertEqual(record(meta)["confirmed"] as? Bool, true)
  }

  /// The click landing after the wait read select_text's range, before the snapshot's own range read or during #354's
  /// settle: the starting point is not select_text's range, so nothing is typed (the review of ef998db6, P1).
  func testSelectTextsRangeMovedAfterTheWaitTypesNothing() {
    for settle in [false, true] {
      let field = FakeField(value: seed, range: whole)
      // Without the settle: the wait's read finds the range, the snapshot's finds the click's caret. With it: the
      // snapshot's read finds the range too, the settle's the caret.
      field.rangesBeforeTyping = settle ? [whole, whole, clickCaret, clickCaret] : [whole, clickCaret]
      var posted = 0
      var meta = meta()
      XCTAssertThrowsError(try keyTextReadBack(units("NEW359"), concealed: false, settle: settle, baseline: .selection(whole),
                                               reads: FakeApp(field).reads, checkSource: { _, _ in }, checkIntervention: {},
                                               post: { _ in posted += 1; return true }, pause: {}, meta: &meta), "settle: \(settle)") {
        XCTAssertTrue(($0 as? EngineError)?.message.hasPrefix("Nothing was typed") == true, "settle: \(settle)")
      }
      XCTAssertEqual(posted, 0, "settle: \(settle)")
      XCTAssertEqual(field.value, seed, "settle: \(settle)")
      XCTAssertEqual(record(meta)["reason"] as? String, "selectionChanged", "settle: \(settle)")
      XCTAssertEqual(baselineRecord(meta)["reads"] as? Int, 1, "the wait itself was met: settle: \(settle)")
      if settle { XCTAssertEqual(record(meta)["settleReads"] as? Int, 2) }
    }
    // Only the final starting point counts: a snapshot read the settle then finds back at select_text's range types over it.
    let back = FakeField(value: seed, range: whole)
    back.rangesBeforeTyping = [whole, clickCaret, whole, whole]
    let (error, meta) = type("NEW359", into: FakeApp(back), settle: true, baseline: .selection(whole))
    XCTAssertNil(error)
    XCTAssertEqual(back.value, "NEW359")
    XCTAssertEqual(record(meta)["settleReads"] as? Int, 2)
  }

  /// select_text's range showing late within the cap is waited for, and typed over.
  func testSelectTextsRangeShowingLateIsWaitedFor() {
    let field = FakeField(value: seed, range: clickCaret)
    field.rangesBeforeTyping = [clickCaret, clickCaret, whole]
    let app = FakeApp(field)
    let (error, meta) = type("NEW359", into: app, baseline: .selection(whole))
    XCTAssertNil(error)
    XCTAssertEqual(field.value, "NEW359")
    XCTAssertEqual(baselineRecord(meta)["waitMs"] as? Double, 2 * pendingClickSampleMs)
  }

  /// A click pending without select_text: the starting point is taken once the range has held still, so the click that
  /// lands during the wait is in it, and the text typed at the click's caret confirms.
  func testAPendingClickIsWaitedForBeforeTheStartingPoint() {
    let field = FakeField(value: seed, range: whole)
    field.rangesBeforeTyping = [whole, whole, clickCaret]
    let app = FakeApp(field)
    let (error, meta) = type("NEW359", into: app, baseline: .stable)
    XCTAssertNil(error)
    XCTAssertEqual(field.value, "OldNEW359 draft sentence goes here.", "typed at the click's caret, as the click meant")
    XCTAssertEqual(baselineRecord(meta)["for"] as? String, "stable")
    XCTAssertEqual(baselineRecord(meta)["waitMs"] as? Double, 2 * pendingClickSampleMs + pendingClickDwellMs)
  }

  /// A range that never holds still: the wait ends at its cap and the text is typed, #354's read-back answering what it
  /// sees.
  func testAStableWaitAtItsCapGoesOn() {
    let field = FakeField(value: seed, range: whole)
    field.rangesBeforeTyping = (0..<40).map { $0 % 2 == 0 ? whole : clickCaret }
    let app = FakeApp(field)
    let (_, meta) = type("NEW359", into: app, baseline: .stable)
    XCTAssertNotNil(meta.startedAt, "typed")
    XCTAssertEqual(baselineRecord(meta)["capped"] as? Bool, true)
    XCTAssertEqual(baselineRecord(meta)["waitMs"] as? Double, pendingClickCapMs)
  }

  /// Without a pending click or select_text no wait is taken (the snapshot's reads are #354's alone).
  func testNoWaitWithoutAPendingClick() {
    let field = FakeField(value: seed, range: whole)
    let app = FakeApp(field)
    let (error, meta) = type("NEW359", into: app)
    XCTAssertNil(error)
    XCTAssertEqual(app.sleeps, 0)
    XCTAssertNil(record(meta)["baselineWait"])
  }

  /// The wait comes after the secure check and checks the field before every read: a password field's range is never
  /// read but in its length batch (#414), whose own classification decides each read, and one turning secure is read no
  /// further. A wait for select_text's range at a password field, which select_text never selects in, is refused before
  /// any read.
  func testTheWaitNeverReadsASecureField() {
    let field = FakeField(value: "hunter2", range: NSRange(location: 7, length: 0))
    field.role = "AXSecureTextField"
    let (refused, refusedMeta) = type("pass", into: FakeApp(field), baseline: .selection(whole))
    XCTAssertEqual(record(refusedMeta)["reason"] as? String, "selectionChanged", "select_text's range is another field's")
    XCTAssertEqual(refused?.errorName, "typeUnconfirmed")
    XCTAssertEqual(field.value, "hunter2", "nothing typed")
    XCTAssertNil(record(refusedMeta)["baselineWait"], "a password field's record counts nothing")
    XCTAssertFalse(field.calls.contains("range") || field.calls.contains("value"))
    XCTAssertEqual(field.calls.filter { $0 == "batch" }.count, 0, "refused before any batch")
    // A pending click's stable wait, then the length: confirmed.
    let clicked = FakeField(value: "hunter2", range: NSRange(location: 7, length: 0))
    clicked.role = "AXSecureTextField"
    clicked.rangesBeforeTyping = [NSRange(location: 0, length: 0), NSRange(location: 7, length: 0)]
    let (clickedError, clickedMeta) = type("pass", into: FakeApp(clicked), baseline: .stable)
    XCTAssertNil(clickedError)
    XCTAssertEqual(record(clickedMeta)["confirmation"] as? String, "length")
    XCTAssertFalse(clicked.calls.contains("range") || clicked.calls.contains("value"))
    // A password field turning into a text field while the wait reads it is read no further.
    let showing = FakeField(value: "hunter2", range: NSRange(location: 7, length: 0))
    showing.role = "AXSecureTextField"
    showing.changeAfterReads = 1
    showing.change = { $0.role = "AXTextField" }
    let (shown, shownMeta) = type("pass", into: FakeApp(showing), baseline: .stable)
    XCTAssertEqual(shown?.errorName, "typeUnconfirmed")
    XCTAssertEqual(record(shownMeta)["reason"] as? String, "noLongerSecure")
    XCTAssertEqual(showing.calls.filter { $0 == "batch" }.count, 2, "the wait's first read, then the one that found it changed")
    XCTAssertFalse(showing.calls.contains("value"))
    let turning = FakeField(value: "user", range: clickCaret)
    turning.role = "AXTextField"
    turning.changeAfterRangeReads = 1
    turning.changeAtRange = { $0.role = "AXSecureTextField" }
    let (error, meta) = type("pass", into: FakeApp(turning), baseline: .stable)
    XCTAssertEqual(record(meta)["reason"] as? String, "becameSecure")
    XCTAssertEqual(error?.errorName, "typeUnconfirmed")
    XCTAssertEqual(turning.calls.filter { $0 == "range" }.count, 1, "no range read after it turned secure")
    XCTAssertEqual(baselineRecord(meta)["closed"] as? Bool, true)
  }

  /// A secret after select_text whose range is gone: nothing typed, no count in the meta, the reason alone.
  func testASecretAfterAChangedSelectionTypesNothing() {
    let field = FakeField(value: seed, range: clickCaret)
    let (error, meta) = type("hunter2", into: FakeApp(field), concealed: true, baseline: .selection(whole))
    XCTAssertEqual(error?.errorName, "typeUnconfirmed")
    XCTAssertNil(meta.entered)
    XCTAssertNil(meta.startedAt)
    XCTAssertEqual(record(meta)["reason"] as? String, "selectionChanged")
    XCTAssertNil(record(meta)["baselineWait"], "a concealed record counts nothing")
    XCTAssertEqual(field.value, seed)
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
