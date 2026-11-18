import ApplicationServices
import XCTest
@testable import Engine

// #414 (rulings 1ea561bc:826, 833 and 839): type_text's read-back of a password field by its length
// (TypeReadbackLength.swift). The live reads (`ReadbackReads.live`) run over a stub app behind `ReadbackAX`, the layer
// the engine's Accessibility calls go through. Its password field holds plaintext and answers it to anyone who asks
// (AXValue, AXValueDescription, AXSelectedText), and its count and range are distinctive numbers. Every call the stub
// gets is logged by name and element, never by value.

/// The stub: the application (0) whose focused element is the password field (1).
private final class StubPasswordApp {
  static let pid: pid_t = 63_000
  static let app = 0, field = 1

  var role: String? = "AXTextField"
  var subrole: String? = "AXSecureTextField"
  var subroleFails = false
  var value: String
  var selection: NSRange
  /// What the length batch's count and range slots answer: their value, nothing (absent), a failure, a value of the
  /// wrong type, or exactly this reply.
  enum Slot { case answers, absent, fails, wrongType, reply(CFTypeRef) }
  var countSlot = Slot.answers
  var rangeSlot = Slot.answers
  var batchFails = false
  /// The element the application names as its focus.
  var focus = StubPasswordApp.field
  /// Whether the field ignores every delivered unit: its count and range stay as they were.
  var ignoresInput = false
  /// Whether a Return inserts a newline (a field that takes it as text) or does nothing (a single-line field).
  var returnInserts = false
  /// What the app does with each delivered unit's text.
  var transform: (String) -> String = { $0 }
  /// After typing, how far off the reported caret is from the true one.
  var caretShift = 0
  /// Runs before each length batch is answered, with how many were answered before it.
  var beforeBatch: (Int) -> Void = { _ in }
  private(set) var batches = 0
  private var delivered = false
  var log: [String] = []

  init(value: String, selection: NSRange) {
    self.value = value
    self.selection = selection
  }

  func el(_ id: Int) -> AXUIElement { AXUIElementCreateApplication(Self.pid + pid_t(id)) }
  func id(_ element: AXUIElement) -> Int { Int(ownerPid(of: element, fallback: 0) - Self.pid) }

  var reportedSelection: NSRange {
    delivered ? NSRange(location: selection.location + caretShift, length: selection.length) : selection
  }

  func copy(_ element: AXUIElement, _ name: String) -> (value: CFTypeRef?, error: AXError) {
    let id = id(element)
    log.append("\(name)@\(id)")
    switch name {
    case kAXFocusedUIElementAttribute where id == Self.app: return (el(focus), .success)
    case kAXRoleAttribute where id == Self.field: return role.map { ($0 as CFString, .success) } ?? (nil, .noValue)
    case kAXSubroleAttribute where id == Self.field:
      if subroleFails { return (nil, .cannotComplete) }
      return subrole.map { ($0 as CFString, .success) } ?? (nil, .noValue)
    // The plaintext, to any request that would read it: none may come.
    case kAXValueAttribute, kAXValueDescriptionAttribute, kAXSelectedTextAttribute: return (value as CFString, .success)
    case kAXNumberOfCharactersAttribute: return ((value as NSString).length as CFNumber, .success)
    case kAXSelectedTextRangeAttribute: return (axRangeValue(CFRange(location: reportedSelection.location, length: reportedSelection.length)), .success)
    default: return (nil, .noValue)
    }
  }

  func batch(_ element: AXUIElement, _ names: [String]) -> AttributeRead? {
    let id = id(element)
    log.append("batch(\(names.joined(separator: ",")))@\(id)")
    beforeBatch(batches)
    batches += 1
    if batchFails || id != Self.field { return nil }
    var read = AttributeRead()
    for name in names {
      switch name {
      case kAXRoleAttribute: if let role { read.values[name] = role as CFString }
      case kAXSubroleAttribute:
        if subroleFails { read.unreadable.insert(name) } else if let subrole { read.values[name] = subrole as CFString }
      case kAXNumberOfCharactersAttribute:
        switch countSlot {
        case .answers: read.values[name] = (value as NSString).length as CFNumber
        case .absent: break
        case .fails: read.unreadable.insert(name)
        case .wrongType: read.values[name] = kCFBooleanTrue
        case .reply(let reply): read.values[name] = reply
        }
      case kAXSelectedTextRangeAttribute:
        switch rangeSlot {
        case .answers: read.values[name] = axRangeValue(CFRange(location: reportedSelection.location, length: reportedSelection.length))
        case .absent: break
        case .fails: read.unreadable.insert(name)
        case .wrongType: read.values[name] = "range" as CFString
        case .reply(let reply): read.values[name] = reply
        }
      // Anything else a batch could ask for, the plaintext among it, is answered too: none may be asked.
      default: read.values[name] = value as CFString
      }
    }
    return read
  }

  var ax: ReadbackAX {
    ReadbackAX(copy: { self.copy($0, $1) }, copyParameterized: { element, name, _ in
      self.log.append("\(name)@\(self.id(element))")
      return (self.value as CFString, .success)
    }, batch: { self.batch($0, $1) }, pid: { _ in Self.pid }, markers: nil)
  }

  func deliver(_ text: [UInt16]) {
    log.append("post")
    if ignoresInput { return }
    if text == [0x09] { return }  // a Tab: nothing in the field
    if text == [0x0D], !returnInserts { return }  // a Return in a single-line field
    guard NSMaxRange(selection) <= (value as NSString).length else { return }
    let typed = transform(text == [0x0D] ? "\n" : String(utf16CodeUnits: text, count: text.count))
    value = (value as NSString).replacingCharacters(in: selection, with: typed)
    selection = NSRange(location: selection.location + (typed as NSString).length, length: 0)
    delivered = true
  }

  /// The reads, without the posts.
  var reads: [String] { log.filter { $0 != "post" } }
  /// Anything that reads a value, its text, its length or a parameterized attribute outside the length batch.
  var forbiddenReads: [String] {
    log.filter { entry in
      [kAXValueAttribute, kAXValueDescriptionAttribute, kAXSelectedTextAttribute, kAXNumberOfCharactersAttribute,
       kAXSelectedTextRangeAttribute, "AXStringForRange", "AXAttributedStringForRange"].contains { entry.hasPrefix("\($0)@") }
        || (entry.hasPrefix("batch(") && !entry.hasPrefix("batch(\(readbackLengthAttributes.joined(separator: ",")))@"))
    }
  }
}

final class SecureTypeReadbackTests: XCTestCase {
  // The distinctive numbers: the field's count before typing, its selection, and what typing "pass" over it makes.
  private let before = 48_611, location = 31_337, selected = 2_777
  private var selection: NSRange { NSRange(location: location, length: selected) }
  private var after: Int { before - selected + 4 }

  private func meta() -> InputMeta {
    InputMeta(ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
  }

  private func units(_ text: String) -> [TypedUnit] {
    typedUnits(text, press: { unit in unit < 0x80 && unit != 0x0D ? KeyPress(keyCode: CGKeyCode(unit), modifiers: []) : nil })
  }

  private func field(count: Int? = nil, selection: NSRange? = nil) -> StubPasswordApp {
    StubPasswordApp(value: String(repeating: "x", count: count ?? before), selection: selection ?? self.selection)
  }

  /// Types `text` into the stub through keyTextReadBack over the live reads: the error, the meta and the reply as the
  /// wire would carry it (its note included), and every unit posted.
  @discardableResult
  private func type(_ text: String, into app: StubPasswordApp, concealed: Bool = false, settle: Bool = false, baseline: BaselineWait? = nil)
    -> (error: EngineError?, meta: InputMeta, reply: String) {
    var reads = ReadbackReads.live(pid: StubPasswordApp.pid, markerRoute: false, ax: app.ax)
    var clock = 0.0
    reads.now = { clock }
    reads.sleep = { clock += $0 }
    var meta = meta()
    var failure: EngineError?
    do {
      try keyTextReadBack(units(text), concealed: concealed, settle: settle, baseline: baseline, reads: reads, checkSource: { _, _ in },
                          checkIntervention: {}, post: { event in
                            if event.kind == .down, let text = event.text { app.deliver(text) }
                            return true
                          }, pause: {}, meta: &meta)
    } catch {
      failure = error as? EngineError
    }
    var wire: [String: Any] = failure.map { withMeta($0, meta).wire } ?? ["meta": meta.wire]
    if failure == nil, let note = meta.note { wire["note"] = note }
    // The posting's own times (`InputMeta.posting`, real Unix milliseconds) are no field's numbers, but could hold a
    // distinctive number's digits by chance: checked to be timestamps (or null, nothing posted), then fixed before any
    // scan of the reply.
    if var times = wire["meta"] as? [String: Any] {
      for key in ["startedAt", "endedAt"] {
        XCTAssertTrue(times[key] is NSNull || (times[key] as? Int).map { $0 > 1_600_000_000_000 } == true, "\(key) is a time or null")
        times[key] = "<time>"
      }
      wire["meta"] = times
    }
    let reply = String(data: try! JSONSerialization.data(withJSONObject: wire, options: [.sortedKeys]), encoding: .utf8)!
    return (failure, meta, reply)
  }

  private func record(_ meta: InputMeta) -> [String: Any] { meta.wire["typeReadback"] as? [String: Any] ?? [:] }
  private func reason(_ meta: InputMeta) -> String? { record(meta)["reason"] as? String }

  // MARK: The leak test (the brief's required test)

  /// The forms a number could take in text (#395's leak test's, and the grouped decimal): decimal, hex either case, its
  /// little-endian bytes as a list and as hex, and their base64.
  private func forms(_ number: Int) -> [String] {
    let word = UInt32(truncatingIfNeeded: number)
    let bytes = (0..<4).map { UInt8((word >> (8 * UInt32($0))) & 0xFF) }
    let grouped = NumberFormatter.localizedString(from: NSNumber(value: number), number: .decimal)
    return [String(number), String(number, radix: 16), String(number, radix: 16, uppercase: true), grouped,
            bytes.map(String.init).joined(separator: ", "), bytes.map { String(format: "%02x", $0) }.joined(),
            Data(bytes).base64EncodedString().replacingOccurrences(of: "=", with: "")]
  }

  /// The forms of `numbers` found in `texts`.
  private func leaks(_ texts: [String], _ numbers: [Int]) -> [String] {
    numbers.flatMap { number in forms(number).flatMap { form in texts.filter { $0.contains(form) }.map { "\(form) in \($0)" } } }
  }

  /// A password field whose count, caret and selection are distinctive numbers: none of them, nor what typing makes of
  /// them (the expected count, the caret after the text, the selection's end, the change, off-by-one reads), reaches the
  /// reply's JSON, the meta, the read-back's record (its wire, and the struct as printed), the note, an error sentence or
  /// the stderr captured over the runs, in any form. The runs: a confirmation plain and concealed, a dropped and an extra
  /// character, a caret elsewhere concealed and plain, a field that ignores the text (its selection as long as the
  /// secret, and not), one shown as text while it is polled, a count read that fails, an unreadable range in a field that
  /// holds text, the caret alone (ruling 839) confirmed and off by one, and a checkpoint before a Return. Then the
  /// positive controls: each path, given a leak, is caught.
  func testNoCountRangeOrCaretReachesTheReplyRecordNoteErrorsOrStderr() throws {
    let caretBasis = { (app: StubPasswordApp) in
      app.countSlot = .absent
      app.selection = NSRange(location: self.location, length: 0)
    }
    var dropped = 0, doubled = 0
    let runs: [(label: String, text: String, concealed: Bool, setUp: (StubPasswordApp) -> Void, reason: String?)] = [
      ("confirmed", "pass", false, { _ in }, nil),
      ("concealed", "pass", true, { _ in }, nil),
      ("dropped", "pass", true, { app in app.transform = { dropped += 1; return dropped == 2 ? "" : $0 } }, "lengthMismatch"),
      ("extra", "pass", false, { app in app.transform = { doubled += 1; return doubled == 2 ? $0 + $0 : $0 } }, "lengthMismatch"),
      ("caret elsewhere", "pass", true, { $0.caretShift = 1 }, "lengthMismatch"),
      ("caret elsewhere, literal", "pass", false, { $0.caretShift = 1 }, "caretMismatch"),
      ("ignored", "pass", true, { $0.ignoresInput = true }, "lengthMismatch"),
      ("ignored, as long as the selection", "pass", true, { app in
        app.ignoresInput = true
        app.selection = NSRange(location: self.location, length: 4)
      }, "lengthMismatch"),
      ("shown as text", "pass", true, { app in app.beforeBatch = { if $0 == 1 { app.subrole = nil } } }, "noLongerSecure"),
      ("count fails", "pass", false, { $0.countSlot = .fails }, "lengthUnreadable"),
      ("no range", "pass", true, { $0.rangeSlot = .absent }, "selectionUnreadable"),
      ("caret alone", "pass", true, caretBasis, nil),
      ("caret alone, off", "pass", false, { app in caretBasis(app); app.caretShift = -1 }, "caretMismatch"),
      ("checkpoint", "pa\nss", false, { _ in }, nil),
    ]
    var texts: [String] = [], metas: [InputMeta] = []
    let captured = try capturingStderr {
      for run in runs {
        let app = field()
        run.setUp(app)
        let (error, meta, reply) = type(run.text, into: app, concealed: run.concealed)
        texts += [reply, String(reflecting: meta.typeReadback as Any), meta.note ?? ""]
        if let error { texts += [error.message, "\(error)", String(reflecting: error)] }
        metas.append(meta)
      }
    }
    for (run, meta) in zip(runs, metas) {
      XCTAssertEqual(reason(meta), run.reason, run.label)
      XCTAssertEqual(record(meta)["secure"] as? Bool, true, run.label)
      XCTAssertEqual(record(meta)["confirmation"] as? String, run.reason == nil ? "length" : nil, run.label)
    }
    let numbers = [before, location, selected, location + selected, after, location + 4, selected - 4, after - 1, after + 1,
                   location + 3, location + 5, before + 4, location - 1, after - 2, location + 2]
    XCTAssertEqual(leaks(texts + [captured], numbers), [])
    // The render: the record carries only its own fields, none of them a number but its snapshot's time.
    let keys: Set<String> = ["confirmed", "snapshotMs", "reason", "secure", "confirmation", "concealed", "checkpoints", "keysUnconfirmed",
                             "stoppedBeforeKey"]
    for meta in metas {
      XCTAssertTrue(Set(record(meta).keys).isSubset(of: keys), "\(record(meta).keys)")
      XCTAssertNil(meta.entered.flatMap { numbers.contains($0) ? $0 : nil }, "entered is the caller's own text")
    }

    // Positive controls: each path that could carry a number is seen to, once given one.
    let sample = texts[0]
    XCTAssertFalse(leaks([sample + "\(after)"], numbers).isEmpty, "the reply")
    XCTAssertFalse(leaks(["caret at 0x" + String(location + 4, radix: 16)], numbers).isEmpty, "an error sentence, in hex")
    var leaking = TypeReadbackRecord()
    leaking.expectedLength = before
    XCTAssertFalse(leaks([String(describing: leaking.wire)], numbers).isEmpty, "the record")
    let stderrLeak = try capturingStderr { fputs("selection \(selected)\n", stderr) }
    XCTAssertFalse(leaks([stderrLeak], numbers).isEmpty, "stderr")
    XCTAssertFalse(leaks([Data([0xE3, 0xBD, 0, 0]).base64EncodedString()], numbers).isEmpty, "the count's bytes, base64")
  }

  /// Runs `body` with the process's stderr sent to a file, and answers what it wrote.
  private func capturingStderr(_ body: () throws -> Void) throws -> String {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("secure-stderr-\(UUID().uuidString)")
    FileManager.default.createFile(atPath: url.path, contents: nil)
    let file = try FileHandle(forWritingTo: url)
    defer {
      try? file.close()
      try? FileManager.default.removeItem(at: url)
    }
    fflush(stderr)
    let saved = dup(STDERR_FILENO)
    guard saved >= 0, dup2(file.fileDescriptor, STDERR_FILENO) >= 0 else { throw CaptureFailed() }
    defer {
      dup2(saved, STDERR_FILENO)
      close(saved)
    }
    try body()
    fflush(stderr)
    guard let text = String(data: try Data(contentsOf: url), encoding: .utf8) else { throw CaptureFailed() }
    return text
  }
  private struct CaptureFailed: Error {}

  // MARK: What is read

  /// The reads, in order: the focus, the role and subrole by themselves, then only the length batch, before typing and
  /// once after (the caret is in the same reply as the count it qualifies), then the focus again. Nothing reads the
  /// value, its description, its selected text, its count or range alone, or any parameterized attribute.
  func testOnlyTheLengthBatchIsReadAfterTheClassification() {
    let app = field()
    let (error, meta, _) = type("pass", into: app)
    XCTAssertNil(error)
    XCTAssertEqual(app.value.count, after)
    let batch = "batch(AXRole,AXSubrole,AXSelectedTextRange,AXNumberOfCharacters)@1"
    XCTAssertEqual(app.reads, ["AXFocusedUIElement@0", "AXRole@1", "AXSubrole@1", batch, batch, "AXFocusedUIElement@0"])
    XCTAssertEqual(app.forbiddenReads, [])
    XCTAssertEqual(record(meta) as NSDictionary, ["confirmed": true, "secure": true, "confirmation": "length", "snapshotMs": 0.0] as NSDictionary)
    XCTAssertEqual(meta.entered, 4, "a literal request still says what it entered: its own text's length")
    XCTAssertEqual(meta.note, readbackLengthNote)
  }

  /// Ruling 833: the success names its strength and says what a length proves and what it cannot, in fixed text.
  func testTheNoteSaysWhatALengthProves() {
    XCTAssertEqual(readbackLengthNote, "Typed into a password field, confirmed by its length only: the field took exactly as many characters as were typed, in place of any selected text, so none was dropped or added. A password field's characters are never read, so whether they are the right ones is not confirmed: a keyboard layout, an input method or the page itself can change what goes in.")
    XCTAssertLessThanOrEqual(readbackLengthNote.count, 500, "within the service's bound on a note")
    XCTAssertFalse(readbackLengthNote.contains { $0.isNumber })
    let (_, meta, _) = type("pass", into: field(), concealed: true)
    XCTAssertEqual(meta.note, readbackLengthNote, "the same for a secret")
    let (failed, failedMeta, _) = type("pass", into: { let app = field(); app.transform = { _ in "" }; return app }())
    XCTAssertEqual(failed?.errorName, "typeUnconfirmed")
    XCTAssertNil(failedMeta.note, "no note on a failure")
  }

  // MARK: Dropped and extra characters

  func testADroppedOrExtraCharacterIsUnconfirmed() {
    for (label, change) in [("dropped", { (text: String) in "" }), ("extra", { (text: String) in text + text })] {
      var delivered = 0
      let app = field(count: 0, selection: NSRange(location: 0, length: 0))
      app.transform = { text in delivered += 1; return delivered == 3 ? change(text) : text }
      let (error, meta, _) = type("hunter2", into: app, concealed: true)
      XCTAssertEqual(error?.errorName, "typeUnconfirmed", label)
      XCTAssertEqual(reason(meta), "lengthMismatch", label)
      XCTAssertTrue(error?.message.contains("the password field's length or caret is not what the text should have made it, so a character may have been dropped or added, or the text gone in elsewhere") ?? false, label)
      XCTAssertTrue(error?.message.contains("a screenshot shows its masked characters; getAXState() shows only that it is a password field") ?? false, label)
      XCTAssertFalse(error?.message.contains { $0.isNumber } ?? true, label)
      XCTAssertEqual(app.batches, 1 + 201, "\(label): the snapshot, then the whole budget polled")
    }
  }

  // MARK: The range

  /// A selection typed over is confirmed by the count less it, plus the text, and the caret after the text.
  func testASelectionReplacedConfirms() {
    let app = field(count: 10, selection: NSRange(location: 2, length: 5))
    XCTAssertNil(type("abc", into: app).error)
    XCTAssertEqual(app.value.count, 8)
  }

  /// A selection as long as the text: the count is the snapshot's own, so it proves nothing alone; the caret right after
  /// the text, in the same reply, is required, and without it a literal request's answer is caretMismatch, a concealed
  /// one's lengthMismatch. The same caret is required of every confirmation whatever the selection held, so a lagging
  /// caret answers alike either way (no answer tells whether a secret is as long as the selection).
  func testTheCaretIsRequiredOfEveryConfirmationWithARange() {
    let unconsumed = field(count: 10, selection: NSRange(location: 2, length: 4))
    unconsumed.transform = { _ in "" }  // the selection deleted, nothing typed: the count drops by four
    XCTAssertEqual(reason(type("abcd", into: unconsumed).meta), "lengthMismatch")
    // Typed over in place, but the caret reads where it was: the count is as before, which alone would confirm.
    for (label, length) in [("as long as the text", 4), ("shorter than the text", 2)] {
      for concealed in [false, true] {
        let stuck = field(count: 10, selection: NSRange(location: 2, length: length))
        stuck.caretShift = -4
        let (error, meta, _) = type("abcd", into: stuck, concealed: concealed)
        XCTAssertEqual(error?.errorName, "typeUnconfirmed", label)
        XCTAssertEqual(reason(meta), concealed ? "lengthMismatch" : "caretMismatch", "\(label), concealed \(concealed)")
        XCTAssertTrue(error?.message.contains(concealed ? "the password field's length or caret is not what the text should have made it"
          : "The text was typed, but the password field's caret is not right after the text, so the text may have gone in elsewhere, so it is")
          ?? false, "\(label): \(error?.message ?? "")")
      }
    }
    let right = field(count: 10, selection: NSRange(location: 2, length: 4))
    XCTAssertNil(type("abcd", into: right).error, "the caret after the text confirms")
  }

  /// No range: only an empty field confirms, by its count alone, since nothing can be replaced and the caret can only be
  /// at 0; a field holding text is refused at the snapshot (the keys are still sent). A range that does not lie inside
  /// the count, or whose read fails, is no range.
  func testARangeThatCannotBeReadConfirmsOnlyFromAnEmptyField() {
    let empty = field(count: 0, selection: NSRange(location: 0, length: 0))
    empty.rangeSlot = .absent
    XCTAssertNil(type("pass", into: empty).error)
    XCTAssertEqual(empty.value, "pass")
    for (label, setUp) in [("absent", { (app: StubPasswordApp) in app.rangeSlot = .absent }),
                           ("failed", { (app: StubPasswordApp) in app.rangeSlot = .fails }),
                           ("not a range", { (app: StubPasswordApp) in app.rangeSlot = .wrongType })] {
      let holding = field(count: 5, selection: NSRange(location: 5, length: 0))
      setUp(holding)
      let (error, meta, _) = type("pass", into: holding)
      XCTAssertEqual(reason(meta), "selectionUnreadable", label)
      XCTAssertEqual(holding.value.count, 9, "\(label): typed all the same")
      XCTAssertEqual(holding.batches, 1, "\(label): refused at the snapshot")
      XCTAssertTrue(error?.message.contains("the password field's selection could not be read while it held text") ?? false, label)
    }
    let outside = field(count: 5, selection: NSRange(location: 4, length: 3))
    XCTAssertEqual(reason(type("pass", into: outside).meta), "selectionUnreadable", "a range past the count")
    XCTAssertEqual(readbackLengthBasis(count: .value(5), range: NSRange(location: 6, length: 0)), .refused(.selectionUnreadable))
    XCTAssertEqual(readbackLengthBasis(count: .value(0), range: nil), .basis(.count(0, range: nil)))
    XCTAssertEqual(readbackLengthBasis(count: .value(5), range: NSRange(location: 0, length: 5)), .basis(.count(5, range: NSRange(location: 0, length: 5))))
  }

  // MARK: No count (ruling 1ea561bc:839)

  /// A field with no count at all (the attribute unsupported: absent) is confirmed by its caret alone when its selection
  /// was read and empty: it must move by exactly the text, at the same strength, with the same reads. A count that failed
  /// (an error, not an absence) stays lengthUnreadable; so does no count with a selection, or with no range; and a count
  /// that appears after the snapshot is no confirmation.
  func testAFieldWithNoCountIsConfirmedByItsCaretFromAnEmptySelection() {
    func countless(_ selection: NSRange = NSRange(location: 31_337, length: 0)) -> StubPasswordApp {
      let app = field(selection: selection)
      app.countSlot = .absent
      return app
    }
    let caret = countless()
    let (error, meta, _) = type("pass", into: caret, concealed: true)
    XCTAssertNil(error)
    XCTAssertEqual(record(meta)["confirmation"] as? String, "length")
    XCTAssertEqual(meta.note, readbackLengthNote)
    let counted = field()
    type("pass", into: counted, concealed: true)
    XCTAssertEqual(caret.reads, counted.reads, "the same batch and schedule as a field with a count")

    for (label, shift) in [("one short", -1), ("one over", 1)] {
      let off = countless()
      off.caretShift = shift
      XCTAssertEqual(reason(type("pass", into: off).meta), "caretMismatch", label)
    }
    let dropped = countless()
    var delivered = 0
    dropped.transform = { delivered += 1; return delivered == 2 ? "" : $0 }
    XCTAssertEqual(reason(type("pass", into: dropped).meta), "caretMismatch", "a dropped character moves the caret one short")

    for slot in [StubPasswordApp.Slot.fails, .wrongType] {
      let failed = field(selection: NSRange(location: 31_337, length: 0))
      failed.countSlot = slot
      XCTAssertEqual(reason(type("pass", into: failed).meta), "lengthUnreadable", "\(slot): a failed count read is never taken for an absent one")
      XCTAssertEqual(failed.batches, 1, "\(slot)")
    }
    XCTAssertEqual(reason(type("pass", into: countless(NSRange(location: 31_337, length: 3))).meta), "lengthUnreadable", "a selection")
    let rangeless = countless()
    rangeless.rangeSlot = .absent
    XCTAssertEqual(reason(type("pass", into: rangeless).meta), "lengthUnreadable", "no count and no range")
    let appearing = countless()
    appearing.beforeBatch = { if $0 == 1 { appearing.countSlot = .answers } }
    XCTAssertEqual(reason(type("pass", into: appearing).meta), "lengthUnreadable", "a count appearing after the snapshot")
    // The split is the walk's: the batch's slot error decides (fetchAttributes' failedSlot), and so the one decision.
    XCTAssertEqual(readbackLengthBasis(count: .absent, range: NSRange(location: 3, length: 0)), .basis(.caret(NSRange(location: 3, length: 0))))
    XCTAssertEqual(readbackLengthBasis(count: .failed, range: NSRange(location: 3, length: 0)), .refused(.lengthUnreadable))
    XCTAssertEqual(readbackLengthBasis(count: .absent, range: NSRange(location: 3, length: 1)), .refused(.lengthUnreadable))
    XCTAssertEqual(readbackLengthBasis(count: .absent, range: nil), .refused(.lengthUnreadable))
  }

  // MARK: Failure paths

  /// A count that cannot be read: at the snapshot the answer is lengthUnreadable at once (the text is still typed); one
  /// whose reads fail after typing is polled for the budget and is lengthUnreadable, never confirmed.
  func testACountThatCannotBeReadIsUnconfirmed() {
    let snapshot = field()
    snapshot.countSlot = .fails
    let (error, meta, _) = type("pass", into: snapshot)
    XCTAssertEqual(reason(meta), "lengthUnreadable")
    XCTAssertTrue(error?.message.contains("the password field's length could not be read, and its text never is") ?? false)
    XCTAssertEqual(snapshot.value.count, after, "typed all the same")
    let later = field()
    later.beforeBatch = { if $0 == 1 { later.countSlot = .fails } }
    XCTAssertEqual(reason(type("pass", into: later).meta), "lengthUnreadable")
    XCTAssertEqual(later.batches, 1 + 201)
    // A read that fails, then one that answers the expected count: confirmed by that one.
    let recovering = field()
    recovering.beforeBatch = { recovering.countSlot = $0 == 1 ? .fails : .answers }
    XCTAssertNil(type("pass", into: recovering).error)
  }

  /// A field that stops being a password field while it is polled (a page's show-password toggle) is read no further:
  /// noLongerSecure; one whose request fails or whose role cannot be read, fieldUnreadable; another password role,
  /// fieldChanged. Each ends at that read.
  func testAFieldThatChangesWhileItIsPolledIsReadNoFurther() {
    let cases: [(String, (StubPasswordApp) -> Void, String)] = [
      ("shown as text", { $0.subrole = nil }, "noLongerSecure"),
      ("another role", { $0.role = "AXGroup" }, "noLongerSecure"),
      ("the request fails", { $0.batchFails = true }, "fieldUnreadable"),
      ("the role unreadable", { $0.role = nil }, "fieldUnreadable"),
      ("the secure role instead", { $0.role = "AXSecureTextField"; $0.subrole = nil }, "fieldChanged"),
    ]
    for (label, change, expected) in cases {
      let app = field(count: 0, selection: NSRange(location: 0, length: 0))
      app.transform = { $0.isEmpty ? $0 : String($0.dropLast()) }  // never confirms, so the poll runs on
      app.beforeBatch = { if $0 == 3 { change(app) } }
      let (error, meta, _) = type("pass", into: app)
      XCTAssertEqual(error?.errorName, "typeUnconfirmed", label)
      XCTAssertEqual(reason(meta), expected, label)
      XCTAssertEqual(app.batches, 4, "\(label): no read after the one that found it changed")
      XCTAssertEqual(app.forbiddenReads, [], label)
    }
    // An unreadable subrole on a text field still presumes a password field (#405, ruling 813): read on.
    let presumed = field(count: 0, selection: NSRange(location: 0, length: 0))
    presumed.beforeBatch = { if $0 == 1 { presumed.subroleFails = true } }
    XCTAssertNil(type("pass", into: presumed).error)
    // The field the application's focus found must still be its focus after typing, as a text field's must.
    let moved = field(count: 0, selection: NSRange(location: 0, length: 0))
    moved.beforeBatch = { if $0 == 1 { moved.focus = 2 } }
    let (_, movedMeta, _) = type("pass", into: moved, concealed: true)
    XCTAssertEqual(reason(movedMeta), "fieldChanged", "the length right, the focus elsewhere")
  }

  /// The settle and #359's wait for a stable range read a password field only through its length batch, and a settled
  /// start is typed over. A wait for select_text's range is refused before any batch, since select_text never selects
  /// in a password field.
  func testTheSettleAndTheWaitReadOnlyTheLengthBatch() {
    let settling = field(count: 7, selection: NSRange(location: 7, length: 0))
    settling.beforeBatch = { if $0 == 1 { settling.selection = NSRange(location: 0, length: 7) } }  // a select-all landing late
    let (error, meta, _) = type("pass", into: settling, settle: true)
    XCTAssertNil(error)
    XCTAssertEqual(settling.value, "pass")
    XCTAssertNil(record(meta)["settleReads"])
    XCTAssertEqual(settling.forbiddenReads, [])
    let waiting = field(count: 7, selection: NSRange(location: 7, length: 0))
    XCTAssertNil(type("pass", into: waiting, baseline: .stable).error)
    XCTAssertEqual(waiting.forbiddenReads, [])
    XCTAssertGreaterThan(waiting.batches, 3, "the wait sampled the batch")
    let gone = field(count: 7, selection: NSRange(location: 7, length: 0))
    let (goneError, goneMeta, _) = type("pass", into: gone, baseline: .selection(NSRange(location: 0, length: 7)))
    XCTAssertEqual(goneError?.errorName, "typeUnconfirmed")
    XCTAssertEqual(reason(goneMeta), "selectionChanged")
    XCTAssertEqual(gone.value.count, 7, "nothing typed")
    XCTAssertEqual(gone.batches, 0, "refused before any batch")
  }

  /// #359's rule at a password field: type_text right after select_text types only over select_text's selection, and
  /// select_text refuses a password field (`selectTextSecure`), so a selection baseline that reaches one is another
  /// field's. It is refused selectionChanged before any batch, even when it reads as the field's own range: nothing is
  /// typed, a literal request enters nothing, and nothing of the field is read but its role and subrole.
  func testASelectTextBaselineAtAPasswordFieldTypesNothing() {
    for concealed in [false, true] {
      let app = field(count: 7, selection: NSRange(location: 2, length: 3))
      let (error, meta, _) = type("pass", into: app, concealed: concealed, baseline: .selection(NSRange(location: 2, length: 3)))
      XCTAssertEqual(error?.errorName, "typeUnconfirmed")
      XCTAssertTrue(error?.message.hasPrefix("Nothing was typed") ?? false)
      XCTAssertEqual(reason(meta), "selectionChanged")
      XCTAssertEqual(app.batches, 0)
      XCTAssertFalse(app.log.contains("post"), "nothing typed")
      XCTAssertEqual(app.value.count, 7)
      XCTAssertEqual(app.reads, ["AXFocusedUIElement@0", "AXRole@1", "AXSubrole@1"])
      XCTAssertEqual(meta.entered, concealed ? nil : 0)
      XCTAssertEqual(record(meta)["secure"] as? Bool, true)
      XCTAssertNil(record(meta)["baselineWait"])
    }
  }

  // MARK: A secret's length is never the reason

  /// A field that ignores the text keeps its count and range. A literal request's stuck caret is caretMismatch, but a
  /// concealed one answers lengthMismatch whether or not the secret is as long as the selection, with the same message
  /// and record: otherwise the reason would tell the secret's length.
  func testAConcealedRequestIntoAFieldThatIgnoresItAnswersAlikeWhateverTheSecretsLength() {
    func ignoring(_ text: String, concealed: Bool) -> (error: EngineError?, meta: InputMeta) {
      let app = field(count: 10, selection: NSRange(location: 2, length: 4))
      app.ignoresInput = true
      let (error, meta, _) = type(text, into: app, concealed: concealed)
      XCTAssertEqual(app.value.count, 10, text)
      return (error, meta)
    }
    let same = ignoring("abcd", concealed: true), other = ignoring("abcdef", concealed: true)
    XCTAssertEqual(reason(same.meta), "lengthMismatch")
    XCTAssertEqual(reason(other.meta), "lengthMismatch")
    XCTAssertEqual(same.error?.message, other.error?.message)
    XCTAssertEqual(record(same.meta) as NSDictionary, record(other.meta) as NSDictionary)
    XCTAssertEqual(same.meta.typeReadback?.reason, other.meta.typeReadback?.reason)
    XCTAssertEqual(reason(ignoring("abcd", concealed: false).meta), "caretMismatch", "a literal request keeps the two reasons apart")
    XCTAssertEqual(reason(ignoring("abcdef", concealed: false).meta), "lengthMismatch")
  }

  /// A caretMismatch claims nothing of the count, which the caret basis (ruling 839) never checked; lengthMismatch is
  /// true of a length or a caret.
  func testTheMismatchSentences() {
    XCTAssertEqual(typeUnconfirmed(.caretMismatch).message,
                   "The text was typed, but the password field's caret is not right after the text, so the text may have gone in elsewhere, so it is not confirmed and some or all of it may have gone in. Observe the field before going on (a screenshot shows its masked characters; getAXState() shows only that it is a password field), then use setValue to put it right; do not type the text again.")
    XCTAssertEqual(typeUnconfirmed(.lengthMismatch).message,
                   "The text was typed, but the password field's length or caret is not what the text should have made it, so a character may have been dropped or added, or the text gone in elsewhere, so it is not confirmed and some or all of it may have gone in. Observe the field before going on (a screenshot shows its masked characters; getAXState() shows only that it is a password field), then use setValue to put it right; do not type the text again.")
  }

  /// A field that stops being a password field may show its text (a show-password toggle): the advice is not to look at
  /// it if it holds a secret, never that a screenshot shows only masked characters. No digits.
  func testNoLongerSecureAdvisesNotToObserveTheShownText() {
    let message = typeUnconfirmed(.noLongerSecure).message
    XCTAssertEqual(message, "The text was typed, but the password field turned into another kind of field while the text was typed, so it was read no further, so it is not confirmed and some or all of it may have gone in. The field may now show its text, so if it holds a secret, do not take a screenshot of it or call getAXState(); put it right with setValue, and do not type the text again.")
    XCTAssertFalse(message.contains { $0.isNumber })
    XCTAssertFalse(message.contains("masked"))
    let before = typeUnconfirmed(.noLongerSecure, beforeKey: true).message
    XCTAssertTrue(before.hasSuffix("Some of the text may have gone in. The field may now show its text, so if it holds a secret, do not take a screenshot of it or call getAXState(); put it right with setValue, and do not type the text again."), before)
  }

  // MARK: A length confirmation that never ran

  /// A literal request of keys alone (a Tab, a Return in a single-line field) makes no length check: it is confirmed as
  /// a plain field's keys-only request is, its keys unconfirmed, with no `confirmation` and no note. Text still carries
  /// both.
  func testKeysAloneIntoAPasswordFieldClaimNoLengthConfirmation() {
    for keys in ["\t", "\n"] {
      let app = field(count: 0, selection: NSRange(location: 0, length: 0))
      let (error, meta, reply) = type(keys, into: app)
      XCTAssertNil(error, keys)
      XCTAssertEqual(record(meta) as NSDictionary, ["confirmed": true, "secure": true, "keysUnconfirmed": 1, "snapshotMs": 0.0] as NSDictionary, keys)
      XCTAssertNil(meta.note, keys)
      XCTAssertFalse(reply.contains("confirmed by its length"), keys)
      XCTAssertEqual(app.batches, 1, "\(keys): the snapshot alone")
    }
    let (_, meta, _) = type("pass", into: field(count: 0, selection: NSRange(location: 0, length: 0)))
    XCTAssertEqual(record(meta)["confirmation"] as? String, "length")
    XCTAssertEqual(meta.note, readbackLengthNote)
    let (_, secret, _) = type("\t", into: field(count: 0, selection: NSRange(location: 0, length: 0)), concealed: true)
    XCTAssertEqual(record(secret)["confirmation"] as? String, "length", "a secret is always read back once")
  }

  // MARK: The count's read

  /// A count that fails at the snapshot is lengthUnreadable before the settle, so a settle read that then finds no count
  /// cannot turn it into the caret's basis (ruling 839). A count that fails at a settle read is lengthUnreadable at that
  /// read, though the next would answer: no batch follows it before typing, and the text is typed all the same.
  func testAFailedCountIsNeverSettledAway() {
    let snapshot = field(selection: NSRange(location: 31_337, length: 0))
    snapshot.countSlot = .fails
    snapshot.beforeBatch = { if $0 == 1 { snapshot.countSlot = .absent } }
    XCTAssertEqual(reason(type("pass", into: snapshot, settle: true).meta), "lengthUnreadable")
    XCTAssertEqual(snapshot.batches, 1, "refused before the settle")
    XCTAssertEqual(snapshot.value.count, before + 4, "typed all the same")

    let settling = field()
    settling.beforeBatch = { settling.countSlot = $0 == 1 ? .fails : .answers }
    XCTAssertEqual(reason(type("pass", into: settling, settle: true).meta), "lengthUnreadable")
    XCTAssertEqual(settling.batches, 2, "no batch after the failed one")
    XCTAssertEqual(settling.value.count, after, "typed all the same")
  }

  /// The settle reads until two reads agree: a select-all that lands in two steps (the caret to the start, then the
  /// whole text selected) is taken at its end.
  func testTheSettleReadsUntilTwoReadsAgree() {
    let app = field(count: 7, selection: NSRange(location: 7, length: 0))
    app.beforeBatch = { index in
      if index == 1 { app.selection = NSRange(location: 0, length: 0) }
      if index == 2 { app.selection = NSRange(location: 0, length: 7) }
    }
    XCTAssertNil(type("pass", into: app, settle: true).error)
    XCTAssertEqual(app.value, "pass")
    XCTAssertEqual(app.batches, 1 + 3 + 1, "the snapshot, three settle reads, one poll")
  }

  /// A count or caret no field has (`NSNotFound` is Int.max; a count past Int32's range) is unreadable at the basis, so
  /// no arithmetic on it can trap: an unconfirmed reason, the text typed all the same.
  func testACountOrCaretNoFieldHasIsUnreadableWithoutATrap() {
    let notFound = axRangeValue(CFRange(location: NSNotFound, length: 0))
    let caret = field()
    caret.countSlot = .absent
    caret.rangeSlot = .reply(notFound)
    XCTAssertEqual(reason(type("pass", into: caret).meta), "lengthUnreadable", "the caret's basis at NSNotFound")
    XCTAssertEqual(caret.batches, 1)
    let huge = field(selection: NSRange(location: 5, length: 0))
    huge.countSlot = .reply(Int.max as CFNumber)
    XCTAssertEqual(reason(type("pass", into: huge).meta), "lengthUnreadable", "a count of Int.max")
    let counted = field()
    counted.rangeSlot = .reply(notFound)
    XCTAssertEqual(reason(type("pass", into: counted).meta), "selectionUnreadable", "a range at NSNotFound beside a count")
    let polled = field()
    polled.beforeBatch = { if $0 == 1 { polled.countSlot = .reply(Int.max as CFNumber); polled.rangeSlot = .reply(notFound) } }
    XCTAssertEqual(reason(type("pass", into: polled).meta), "lengthMismatch", "such a read after typing only differs")

    let bound = Int(Int32.max)
    XCTAssertEqual(readbackLengthBasis(count: .value(bound), range: NSRange(location: bound, length: 0)), .basis(.count(bound, range: NSRange(location: bound, length: 0))))
    XCTAssertEqual(readbackLengthBasis(count: .value(bound + 1), range: NSRange(location: 0, length: 0)), .refused(.lengthUnreadable))
    XCTAssertEqual(readbackLengthBasis(count: .value(Int.max), range: nil), .refused(.lengthUnreadable))
    XCTAssertEqual(readbackLengthBasis(count: .absent, range: NSRange(location: bound, length: 0)), .basis(.caret(NSRange(location: bound, length: 0))))
    XCTAssertEqual(readbackLengthBasis(count: .absent, range: NSRange(location: bound + 1, length: 0)), .refused(.lengthUnreadable))
    XCTAssertEqual(readbackLengthBasis(count: .absent, range: NSRange(location: NSNotFound, length: 0)), .refused(.lengthUnreadable))
    XCTAssertEqual(readbackLengthJudged(count: .value(Int.max), range: NSRange(location: NSNotFound, length: 0),
                                        basis: .count(bound, range: NSRange(location: bound, length: 0)), typed: 1), .differs)
    XCTAssertEqual(readbackLengthJudged(count: .absent, range: NSRange(location: NSNotFound, length: 0),
                                        basis: .caret(NSRange(location: bound, length: 0)), typed: 1), .caretElsewhere)
  }

  /// A count that is a floating-point number is a failed read, never truncated to an integer (−0.5 is not 0).
  func testAFloatCountIsAFailedRead() {
    for number in [-0.5, 0.0, 4.0] {
      let app = field(count: 0, selection: NSRange(location: 0, length: 0))
      app.countSlot = .reply(NSNumber(value: number))
      app.beforeBatch = { if $0 == 1 { app.countSlot = .answers } }
      XCTAssertEqual(reason(type("pass", into: app).meta), "lengthUnreadable", "\(number)")
      XCTAssertEqual(app.batches, 1, "\(number): refused at the snapshot")
    }
  }

  // MARK: Checkpoints and keys

  /// A Return in a single-line password field is posted only once the text before it confirms by its length; the key is
  /// counted keysUnconfirmed. A length that does not confirm stops the text before the Return, which is not posted.
  func testAReturnInAPasswordFieldWaitsForTheTextBeforeIt() {
    let app = field(count: 0, selection: NSRange(location: 0, length: 0))
    let (error, meta, _) = type("pa\nss", into: app)
    XCTAssertNil(error)
    let batch = "batch(\(readbackLengthAttributes.joined(separator: ",")))@1"
    XCTAssertEqual(app.log, ["AXFocusedUIElement@0", "AXRole@1", "AXSubrole@1", batch, "post", "post", batch, "AXFocusedUIElement@0",
                             "post", "post", "post", batch, "AXFocusedUIElement@0"], "the Return posted after the checkpoint's read")
    XCTAssertEqual(record(meta)["checkpoints"] as? Int, 1)
    XCTAssertEqual(record(meta)["keysUnconfirmed"] as? Int, 1)
    XCTAssertEqual(record(meta)["confirmation"] as? String, "length")

    let wrong = field(count: 0, selection: NSRange(location: 0, length: 0))
    var delivered = 0
    wrong.transform = { delivered += 1; return delivered == 2 ? "" : $0 }
    let (stopped, stoppedMeta, _) = type("pa\nss", into: wrong)
    XCTAssertEqual(stopped?.errorName, "typeUnconfirmed")
    XCTAssertEqual(reason(stoppedMeta), "lengthMismatch")
    XCTAssertEqual(record(stoppedMeta)["stoppedBeforeKey"] as? Bool, true)
    XCTAssertEqual(wrong.log.filter { $0 == "post" }.count, 2, "the Return and the text after it were not sent")
    XCTAssertTrue(stopped?.message.hasPrefix("The text before a Return or Tab was typed, but the password field's length") ?? false)

    // A secret's Return makes no checkpoint (ruling 593): read back once, its key a flag.
    let secret = field(count: 0, selection: NSRange(location: 0, length: 0))
    let (secretError, secretMeta, _) = type("pa\nss", into: secret, concealed: true)
    XCTAssertNil(secretError)
    XCTAssertEqual(record(secretMeta)["keysUnconfirmed"] as? Bool, true)
    XCTAssertNil(record(secretMeta)["checkpoints"])
    XCTAssertEqual(secret.batches, 2)
  }

  /// A text area whose subrole cannot be read is presumed a password field that takes a Return as text: the Return counts
  /// one character, and is no checkpoint.
  func testAReturnIsOneCharacterInAPasswordTextArea() {
    let area = field(count: 0, selection: NSRange(location: 0, length: 0))
    area.role = "AXTextArea"
    area.subroleFails = true
    area.returnInserts = true
    let (error, meta, _) = type("pa\nss", into: area)
    XCTAssertNil(error)
    XCTAssertEqual(area.value, "pa\nss")
    XCTAssertNil(record(meta)["checkpoints"])
  }

  /// UTF-16 units, as AX counts: an emoji is two, a combining mark one more.
  func testTheExpectedCountIsInUTF16Units() {
    let app = field(count: 0, selection: NSRange(location: 0, length: 0))
    XCTAssertNil(type("p\u{1F600}e\u{301}", into: app, concealed: true).error)
    XCTAssertEqual((app.value as NSString).length, 5)
    XCTAssertEqual(readbackLengthUnits(TypedUnit(press: nil, text: Array("\u{1F600}".utf16), consumed: 2)), 2)
    XCTAssertEqual(readbackLengthUnits(TypedUnit(press: KeyPress(keyCode: 36, modifiers: []), text: [0x0D], consumed: 2)), 1, "a CR LF is one Return")
  }

  // MARK: The same reads whatever the secret

  /// The reads (which attributes, of which element, in what order, repeated polls collapsed) are the same for secrets of
  /// different lengths and for a literal and a concealed text, into the same field; so is the record.
  func testTheReadsAreTheSameWhateverTheSecretOrTheRequest() {
    func schedule(_ text: String, concealed: Bool, lagging: Bool = false) -> (reads: [String], record: NSDictionary) {
      let app = field(count: 3, selection: NSRange(location: 0, length: 3))
      if lagging { app.beforeBatch = { app.caretShift = $0 < 4 ? -1 : 0 } }  // a caret that shows late
      let (error, meta, _) = type(text, into: app, concealed: concealed)
      XCTAssertNil(error, text)
      var collapsed: [String] = []
      for read in app.reads where read != collapsed.last { collapsed.append(read) }
      var wire = record(meta)
      wire["concealed"] = nil
      return (collapsed, wire as NSDictionary)
    }
    let short = schedule("x", concealed: true), long = schedule("s3cr3t-Zebra-and-more", concealed: true)
    let same = schedule("abc", concealed: true), literal = schedule("s3cr3t-Zebra-and-more", concealed: false)
    XCTAssertEqual(short.reads, long.reads)
    XCTAssertEqual(short.reads, same.reads, "a secret as long as the selection reads as any other")
    XCTAssertEqual(short.reads, literal.reads)
    XCTAssertEqual(short.record, long.record)
    XCTAssertEqual(short.record, same.record)
    XCTAssertEqual(short.record, literal.record)
    // A caret that lags: polls repeat, and still the same reads and answer whatever the secret's length.
    let lagShort = schedule("x", concealed: true, lagging: true), lagSame = schedule("abc", concealed: true, lagging: true)
    XCTAssertEqual(lagShort.reads, lagSame.reads)
    XCTAssertEqual(lagShort.record, lagSame.record)
  }

  // MARK: Classification

  /// The password field's rule is #405's classification: secure, with a readable role that is a field's.
  func testThePasswordFieldRuleIsTheClassifications() {
    let roles = ["AXTextField", "AXTextArea", "AXComboBox", "AXSecureTextField", "AXGroup", "AXStaticText", "AXWebArea"]
    let subroles: [ReadbackSubrole] = [.absent, .failed, .value("AXSecureTextField"), .value("AXSearchField")]
    for role in roles {
      for subrole in subroles {
        var read = AttributeRead()
        read.values[kAXRoleAttribute] = role as CFString
        switch subrole {
        case .value(let found): read.values[kAXSubroleAttribute] = found as CFString
        case .absent: break
        case .failed: read.unreadable.insert(kAXSubroleAttribute)
        }
        let classification = valueClassification(read)
        let field = typeReadbackFocusWalkRoles.contains(role)
        XCTAssertEqual(readbackPasswordField(role: role, subrole: subrole), field && classification.secure, "\(role) \(subrole)")
        XCTAssertEqual(readbackClass(read) == .password(role), field && classification.secure, "\(role) \(subrole)")
        if classification.closed, !(field && classification.secure) { XCTAssertEqual(readbackClass(read), .closed(.secure), "\(role) \(subrole)") }
        XCTAssertEqual(readbackSecure(role: role, subrole: subrole), classification.closed, "\(role) \(subrole)")
      }
    }
    XCTAssertEqual(readbackClass(AttributeRead(unreadable: [kAXRoleAttribute])), .closed(.roleUnreadable))
  }
}
