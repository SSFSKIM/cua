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
  /// Whether the field ignores every delivered unit: its count stays as it was, and its range as `caretOnIgnore` says.
  var ignoresInput = false
  /// Where a field that ignores input puts its caret on a delivered unit: where it was, collapsed to the selection's end,
  /// or at the end of its text, nothing inserted either way.
  enum CaretOnIgnore { case stays, selectionEnd, textEnd }
  var caretOnIgnore = CaretOnIgnore.stays
  /// Whether a Return inserts a newline (a field that takes it as text) or does nothing (a single-line field).
  var returnInserts = false
  /// What the app does with each delivered unit's text.
  var transform: (String) -> String = { $0 }
  /// After typing, how far off the reported caret is from the true one.
  var caretShift = 0
  /// Runs before each length batch is answered, with how many were answered before it.
  var beforeBatch: (Int) -> Void = { _ in }
  /// Runs at the start of each length batch and focus read once the keys are posted, with the clock's time since the
  /// last post: the field's changes at times, not at reads (the review of f217f062..45172367, 1 and 2).
  var timeline: ((Double) -> Void)?
  /// Whether held units land at the second batch after typing (`lateUnits`); a timeline lands them with `land()`.
  var landsByBatch = true
  /// Text the app puts in at the caret, over the selection, before it applies the first delivered unit (#414's hosted
  /// fixture, which inserts a "z" that way).
  var extraFirst: String?
  /// How many units the app drains late: each unit is applied only once this many have arrived after it, and those
  /// left when the second length batch after typing began is answered, so the poll's first read sees every unit but
  /// the last this many.
  var lateUnits = 0
  private var held: [[UInt16]] = []
  private var heldBatches = 0
  private(set) var batches = 0
  private var delivered = false
  private var posts = 0
  /// The held units go in now.
  func land() { held.forEach(apply); held = [] }
  private func onTimeline() { if posts > 0 { timeline?(clock - postedAt) } }
  /// The read-back's fake clock, in ms: a read takes no time unless a test moves it (in `beforeBatch`), and a sleep
  /// lasts what `wake` makes of the time asked for, at the clock's time.
  var clock = 0.0
  var wake: (Double, Double) -> Double = { asked, _ in asked }
  /// How long a read of the application's focus takes on the clock.
  var focusCostMs = 0.0
  /// Whether a read of the application's focus answers cannotComplete, as one that timed out does.
  var focusFails = false
  /// Whether the application answers no focused element (noValue), as a background app can.
  var focusAbsent = false
  /// What each read costs beyond that, given its name and its messaging timeout (ms).
  var cost: (_ name: String, _ timeoutMs: Double) -> Double = { _, _ in 0 }
  /// Whether a read whose cost passes its timeout answers cannotComplete at the timeout; false forces an overrun.
  var honoursTimeouts = true
  /// The clock when the last event was posted: B.
  private(set) var postedAt = 0.0
  /// What posting an event, and the pause after it, cost on the clock.
  var postCost: () -> Double = { 0 }
  var pauseCost: () -> Double = { 0 }
  /// After each posted event: the boundary moves to it.
  func posted() {
    clock += postCost()
    posts += 1
    postedAt = clock
    logAtPost = log.count
    answersAtPost = answers.count
  }
  /// What each batch and focus read answered, with its times: the property test's own observations.
  struct Answer {
    enum Outcome: Equatable { case failed, noLongerSecure, countFailed, read(count: Int?, range: NSRange?), focus(Bool) }
    let start: Double, end: Double
    let outcome: Outcome
    var isBatch: Bool { if case .focus = outcome { return false }; return true }
  }
  private(set) var answers: [Answer] = []
  /// How many answers came before the last unit was posted.
  private(set) var answersAtPost = 0
  /// How many log entries came before the last unit was posted.
  private(set) var logAtPost = 0
  /// Every AX call after the last post but the length batch: a password field's focus checks, each one call
  /// (the review of 4a005a8c..a1939d2f, P1-2).
  var callsAfterPost: [String] { log[logAtPost...].filter { $0 != "post" && !$0.hasPrefix("batch(") } }
  /// Work a request that timed out left the app doing: a timeout is the caller's, so the app finishes the request
  /// anyway, and the next one waits behind it (wave 8's diagnosis (b)).
  private var backlog = 0.0
  /// A read's cost on the clock: true when it ran into its timeout and failed there.
  private func spend(_ id: Int, _ name: String, extra: Double = 0) -> Bool {
    let timeout = typeReadbackMessagingTimeoutMs  // every element's: the read-back's standard timeout, T
    let spent = backlog + extra + cost(name, timeout)
    backlog = 0
    if honoursTimeouts, spent > timeout {
      backlog = spent - timeout
      clock += timeout
      return true
    }
    clock += spent
    return false
  }
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
    case kAXFocusedUIElementAttribute where id == Self.app:
      onTimeline()
      let start = clock
      let failed = spend(id, name, extra: focusCostMs) || focusFails
      answers.append(Answer(start: start, end: clock, outcome: .focus(!failed && !focusAbsent && focus == Self.field)))
      if focusAbsent, !failed { return (nil, .noValue) }
      return failed ? (nil, .cannotComplete) : (el(focus), .success)
    case _ where posts > 0 && spend(id, name): return (nil, .cannotComplete)
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
    onTimeline()
    if landsByBatch, !held.isEmpty {
      heldBatches += 1
      if heldBatches == 2 { held.forEach(apply); held = [] }
    }
    beforeBatch(batches)
    batches += 1
    let start = clock
    if spend(id, "batch") || batchFails || id != Self.field {
      answers.append(Answer(start: start, end: clock, outcome: .failed))
      return nil
    }
    defer {
      let outcome: Answer.Outcome
      if subrole == nil, role == "AXTextField" { outcome = .noLongerSecure } else if case .fails = countSlot { outcome = .countFailed } else {
        outcome = .read(count: (value as NSString).length, range: reportedSelection)
      }
      answers.append(Answer(start: start, end: clock, outcome: outcome))
    }
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
    if ignoresInput {
      switch caretOnIgnore {
      case .stays: break
      case .selectionEnd: selection = NSRange(location: NSMaxRange(selection), length: 0)
      case .textEnd: selection = NSRange(location: (value as NSString).length, length: 0)
      }
      return
    }
    if let extra = extraFirst {
      extraFirst = nil
      insert(extra)
    }
    held.append(text)
    while held.count > lateUnits { apply(held.removeFirst()) }
  }

  private func apply(_ text: [UInt16]) {
    if text == [0x09] { return }  // a Tab: nothing in the field
    if text == [0x0D], !returnInserts { return }  // a Return in a single-line field
    insert(transform(text == [0x0D] ? "\n" : String(utf16CodeUnits: text, count: text.count)))
  }

  private func insert(_ typed: String) {
    guard NSMaxRange(selection) <= (value as NSString).length else { return }
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

/// A seeded generator (SplitMix64) for the property test: the same seed, the same cases.
private struct SplitMix {
  var state: UInt64
  init(_ seed: UInt64) { state = seed }
  mutating func next() -> UInt64 {
    state &+= 0x9E37_79B9_7F4A_7C15
    var z = state
    z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
    z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
    return z ^ (z >> 31)
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
    reads.now = { app.clock }
    reads.sleep = { app.clock += app.wake($0, app.clock) }
    var meta = meta()
    var failure: EngineError?
    do {
      try keyTextReadBack(units(text), concealed: concealed, settle: settle, baseline: baseline, reads: reads, checkSource: { _, _ in },
                          checkIntervention: {}, post: { event in
                            if event.kind == .down, let text = event.text { app.deliver(text) }
                            app.posted()
                            return true
                          }, pause: { app.clock += app.pauseCost() }, meta: &meta)
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
  /// holds text, the caret alone (ruling 839) confirmed and off by one, a checkpoint before a Return, and an app whose
  /// extra character makes a read between its last two keys match (#414's hosted defect). Then the
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
      ("drains late", "pass", true, { app in app.extraFirst = "z"; app.lateUnits = 1 }, "lengthMismatch"),
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
    XCTAssertEqual(app.reads, ["AXFocusedUIElement@0", "AXRole@1", "AXSubrole@1", batch] + Array(repeating: batch, count: 1 + windowReads) + ["AXFocusedUIElement@0"],
                   "the match, then the quiet window's reads")
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
      // A concealed request never ends early on a read past the text: the extra character polls the budget as well.
      XCTAssertEqual(app.batches, 1 + budgetPolls, "\(label): the snapshot, then the whole budget polled")
    }
  }

  // MARK: The quiet window (ruling 1ea561bc:842)

  /// The quiet window's reads after a match, at the poll's cadence: the match holds until a read
  /// `typeReadbackLengthDwellMs` after it.
  private var windowReads: Int { Int(typeReadbackLengthDwellMs / typeReadbackPollIntervalMs) }

  /// #414's hosted defect: an app that puts a "z" in at the caret before the first key, and is still working through
  /// its queue when the poll begins, answers a read between its last two keys whose count and caret are exactly the
  /// expected ones ("z" and every unit but the last). The next read, the field's final state, is off by one. The match
  /// must hold for the quiet window, so it is unconfirmed, on both bases, plain and concealed, with no confirmation and
  /// no note. Without the window it confirmed. A literal request ends at the read that left the match; a concealed one
  /// polls the budget, as any of its failures does.
  func testAMatchAnAppStillDrainingItsKeysThenLeavesIsUnconfirmed() {
    let bases: [(label: String, count: Bool, selection: NSRange)] = [
      ("a count over a selection", true, selection),
      ("a count at a caret", true, NSRange(location: location, length: 0)),
      ("the caret alone", false, NSRange(location: location, length: 0)),
    ]
    for basis in bases {
      for concealed in [false, true] {
        let label = "\(basis.label), concealed \(concealed)"
        let app = field(selection: basis.selection)
        if !basis.count { app.countSlot = .absent }
        app.extraFirst = "z"
        app.lateUnits = 1
        let (error, meta, reply) = type("pass", into: app, concealed: concealed)
        XCTAssertEqual(error?.errorName, "typeUnconfirmed", label)
        XCTAssertEqual(reason(meta), basis.count || concealed ? "lengthMismatch" : "caretMismatch", label)
        XCTAssertNil(record(meta)["confirmation"], label)
        XCTAssertNil(meta.note, label)
        XCTAssertFalse(reply.contains("confirmed by its length"), label)
        XCTAssertEqual((app.value as NSString).length, before - basis.selection.length + 5, "\(label): the z and every key")
        XCTAssertEqual(app.batches, concealed ? 1 + budgetPolls : 1 + 2, "\(label): the budget, or the read that left the match")
      }
    }
  }

  /// The control: a genuine field that drains late (no extra character, only its last key taken late) never shows the
  /// expected count and caret until it has taken every key, so it confirms once the match has held for the window, on
  /// both bases, plain and concealed: the snapshot, the short read, the match and the window's reads.
  func testAFieldThatTakesItsLastKeyLateConfirmsAfterTheWindow() {
    for (label, count) in [("a count", true), ("the caret alone", false)] {
      for concealed in [false, true] {
        let app = field(selection: count ? selection : NSRange(location: location, length: 0))
        if !count { app.countSlot = .absent }
        app.lateUnits = 1
        let (error, meta, _) = type("pass", into: app, concealed: concealed)
        XCTAssertNil(error, "\(label), concealed \(concealed)")
        XCTAssertEqual(record(meta)["confirmation"] as? String, "length", label)
        XCTAssertEqual(meta.note, readbackLengthNote, label)
        XCTAssertEqual(app.batches, 1 + 2 + windowReads, label)
        XCTAssertEqual(meta.typeReadback?.pollMs, typeReadbackPollIntervalMs + typeReadbackLengthDwellMs, label)
      }
    }
  }

  /// A match is taken only once it has held unchanged for `typeReadbackLengthDwellMs`, read at the poll's interval: a
  /// change at any of the window's reads, its last included, is unconfirmed, and a change after the window is not. So
  /// the window spans at least its length. A literal request ends at the change, judged for its reason; a concealed one
  /// never confirms after it and polls the budget, its reason the last read's. A read in the window that is no longer
  /// a password field ends the poll at once for both, as the poll's own closed reads do; one whose count fails ends a
  /// literal request's poll, and a concealed one's polls on.
  func testAChangeAnywhereInTheQuietWindowIsUnconfirmed() {
    XCTAssertEqual(typeReadbackLengthDwellMs, 220, "ruling 1ea561bc:842's value")
    // Batch 0 is the snapshot, 1 the match, 2 through 1 + windowReads the window's reads.
    for index in 2...(2 + windowReads) {
      let inside = index < 2 + windowReads
      for concealed in [false, true] {
        let label = "a character added at batch \(index), concealed \(concealed)"
        let added = field()
        added.beforeBatch = { if $0 == index { added.value += "y" } }
        let (error, meta, _) = type("pass", into: added, concealed: concealed)
        XCTAssertEqual(reason(meta), inside ? "lengthMismatch" : nil, label)
        XCTAssertEqual(error == nil, !inside, label)
        XCTAssertEqual(added.batches, !inside ? 2 + windowReads : concealed ? 1 + budgetPolls : index + 1, label)

        let caret = field(selection: NSRange(location: location, length: 0))
        caret.countSlot = .absent
        caret.beforeBatch = { if $0 == index { caret.selection.location += 1 } }
        XCTAssertEqual(reason(type("pass", into: caret, concealed: concealed).meta), inside ? (concealed ? "lengthMismatch" : "caretMismatch") : nil,
                       "the caret alone: \(label)")
        XCTAssertEqual(caret.batches, !inside ? 2 + windowReads : concealed ? 1 + budgetPolls : index + 1, "the caret alone: \(label)")
      }
    }
    // A change that comes back: a concealed request never confirms after it, though the match holds again for longer.
    let returning = field()
    returning.beforeBatch = { index in
      if index == 3 { returning.value += "y" }
      if index == 4 { returning.value.removeLast() }
    }
    XCTAssertEqual(reason(type("pass", into: returning, concealed: true).meta), "lengthMismatch", "the last read matches, never held")
    XCTAssertEqual(returning.batches, 1 + budgetPolls)

    let clean = field()
    let (_, meta, _) = type("pass", into: clean)
    XCTAssertEqual(meta.typeReadback?.pollMs, typeReadbackLengthDwellMs, "the window's whole length, at the fake clock")
    XCTAssertEqual(meta.typeReadback?.reads, 1 + windowReads)

    let cases: [(String, (StubPasswordApp) -> Void, String, Bool)] = [
      ("shown as text", { $0.subrole = nil }, "noLongerSecure", true),
      ("the request fails", { $0.batchFails = true }, "fieldUnreadable", true),
      ("the secure role instead", { $0.role = "AXSecureTextField"; $0.subrole = nil }, "fieldChanged", true),
      ("the count fails", { $0.countSlot = .fails }, "lengthUnreadable", false),
    ]
    for (label, change, expected, closes) in cases {
      for concealed in [false, true] {
        let app = field()
        app.beforeBatch = { if $0 == 4 { change(app) } }
        XCTAssertEqual(reason(type("pass", into: app, concealed: concealed).meta), expected, "\(label), concealed \(concealed)")
        // A closed read ends the poll for both; a failed count ends a literal one only.
        XCTAssertEqual(app.batches, !concealed || closes ? 5 : 1 + budgetPolls, "\(label), concealed \(concealed)")
      }
    }
  }

  /// A concealed request's failure never ends before the budget, and its reads never depend on the secret: in a field
  /// where one secret's length makes a read match for a moment and another's never does (an app that puts "zz" in before
  /// the first key and drains its last two keys late), both answer with the same reads, the same number of them, the
  /// same time, reason, message and record.
  func testAConcealedFailureTakesTheBudgetWhetherOrNotAMatchCameAndWent() {
    func failing(_ secret: String) -> (reads: [String], batches: Int, meta: InputMeta, message: String?) {
      let app = field()
      app.extraFirst = "zz"
      app.lateUnits = 2
      let (error, meta, _) = type(secret, into: app, concealed: true)
      var collapsed: [String] = []
      for read in app.reads where read != collapsed.last { collapsed.append(read) }
      return (collapsed, app.batches, meta, error?.message)
    }
    // "pass": "zz" and "pa" match before the last two keys land; "p": "zz" alone is past the text, and "zzp" never matches.
    let matched = failing("pass"), never = failing("p")
    XCTAssertEqual(matched.reads, never.reads)
    XCTAssertEqual(matched.batches, 1 + budgetPolls)
    XCTAssertEqual(matched.batches, never.batches)
    XCTAssertEqual(matched.meta.typeReadback?.pollMs, lastBatchStart, "the budget's last batch, then its focus read")
    XCTAssertEqual(matched.meta.typeReadback?.pollMs, never.meta.typeReadback?.pollMs)
    XCTAssertEqual(reason(matched.meta), "lengthMismatch")
    XCTAssertEqual(reason(never.meta), "lengthMismatch")
    XCTAssertEqual(matched.message, never.message)
    XCTAssertEqual(record(matched.meta) as NSDictionary, record(never.meta) as NSDictionary)
  }

  /// A concealed failure answers when it is known (ruling 1ea561bc:851), measured from the last post: a held match whose
  /// focus check finds the focus moved at once, a closed read at that read, a lost match or a failed count at the
  /// budget's end and its focus read, and a snapshot refusal that still posted the keys at once. Nothing more is read
  /// after a refusal or a closed read. A concealed success ends once the match has held and the focus check passed, and
  /// a literal request ends when it fails, as before.
  func testAConcealedFailureAfterPostingAnswersWhenItIsKnown() {
    XCTAssertEqual(typeReadbackMessagingTimeoutMs, 100, "T, rounded off the Float timeout")
    let cases: [(label: String, setUp: (StubPasswordApp) -> Void, settle: Bool, reason: String, batches: Int, pollMs: Double)] = [
      ("a held match, then the focus moved", { app in app.beforeBatch = { [unowned app] in if $0 == 1 { app.focus = 2 } } }, false, "fieldChanged",
       2 + windowReads, typeReadbackLengthDwellMs + 40),
      ("a lost match", { app in app.beforeBatch = { [unowned app] in if $0 == 3 { app.value += "y" } } }, false, "lengthMismatch",
       1 + budgetPolls, lastBatchStart + 40),
      ("a closed read", { app in app.beforeBatch = { [unowned app] in if $0 == 3 { app.subrole = nil } } }, false, "noLongerSecure",
       4, 2 * typeReadbackPollIntervalMs),
      ("a failed count", { app in app.beforeBatch = { [unowned app] in if $0 >= 1 { app.countSlot = .fails } } }, false, "lengthUnreadable",
       1 + budgetPolls, lastBatchStart + 40),
      ("refused: lengthUnreadable", { $0.countSlot = .fails }, false, "lengthUnreadable", 1, 0),
      ("refused: selectionUnreadable", { $0.rangeSlot = .absent }, false, "selectionUnreadable", 1, 0),
      ("refused: fieldUnreadable", { $0.batchFails = true }, false, "fieldUnreadable", 1, 0),
      ("refused: noLongerSecure in the settle", { app in app.beforeBatch = { [unowned app] in if $0 == 1 { app.subrole = nil } } }, true,
       "noLongerSecure", 2, 0),
    ]
    for (label, setUp, settle, expected, batches, pollMs) in cases {
      let app = field()
      app.focusCostMs = 40
      setUp(app)
      let (error, meta, _) = type("pass", into: app, concealed: true, settle: settle)
      XCTAssertEqual(error?.errorName, "typeUnconfirmed", label)
      XCTAssertEqual(reason(meta), expected, label)
      XCTAssertEqual(meta.typeReadback?.pollMs, pollMs, "\(label): when it is known")
      XCTAssertEqual(app.batches, batches, "\(label): nothing more read")
      XCTAssertTrue(app.log.contains("post"), "\(label): the keys were posted")
    }
    // A concealed success ends once the match has held and the focus check passed.
    let success = field()
    success.focusCostMs = 40
    let (error, meta, _) = type("pass", into: success, concealed: true)
    XCTAssertNil(error)
    XCTAssertEqual(meta.typeReadback?.pollMs, typeReadbackLengthDwellMs + 40)
    // A literal request still ends when it fails: a closed read at its read, a moved focus after its match.
    let closed = field()
    closed.beforeBatch = { [unowned closed] in if $0 == 3 { closed.subrole = nil } }
    XCTAssertEqual(type("pass", into: closed).meta.typeReadback?.pollMs, 2 * typeReadbackPollIntervalMs)
    let moved = field()
    moved.beforeBatch = { [unowned moved] in if $0 == 1 { moved.focus = 2 } }
    let (_, movedMeta, _) = type("pass", into: moved)
    XCTAssertEqual(reason(movedMeta), "fieldChanged")
    XCTAssertEqual(movedMeta.typeReadback?.pollMs, typeReadbackLengthDwellMs)
    XCTAssertEqual(moved.batches, 1 + 1 + windowReads)
  }

  /// A read confirms only if it completes within the budget, its window timed from its start. A confirming read that
  /// starts at the budget's last batch and returns after the cutoff is a too-late match, plain and concealed.
  func testAReadThatReturnsAfterTheBudgetCannotConfirm() {
    for concealed in [false, true] {
      let app = field()
      app.beforeBatch = { [unowned app] index in
        app.caretShift = index < self.lastHolding ? -1 : 0
        // The last batch, started at 900 ms, returns at 1001 ms: past the cutoff, though it started within it.
        if index == self.budgetPolls { app.clock += self.slotMs + 1 }
      }
      let (error, meta, _) = type("pass", into: app, concealed: concealed)
      XCTAssertNotNil(error, "concealed \(concealed)")
      XCTAssertEqual(reason(meta), "lengthMismatch", "concealed \(concealed)")
      let control = field()
      control.beforeBatch = { [unowned control] in control.caretShift = $0 < self.lastHolding ? -1 : 0 }
      XCTAssertNil(type("pass", into: control, concealed: concealed).error, "returned within the budget, concealed \(concealed)")
    }
  }

  /// A batch starts only while T is left of the budget (ruling 1ea561bc:851), the same for literal and concealed. A
  /// match taken off the poll's grid (its read ending 1 ms past the last read that could hold for the window) holds for
  /// the window only at a read that never starts: unconfirmed, a too-late match. A late last wake does the same: the
  /// closing read it would have made never starts.
  func testAMatchConfirmsOnlyByAReadThatStartsWithinTheBudget() {
    let lastHolding = self.lastHolding  // its read at 680 ms
    for concealed in [false, true] {
      let offGrid = field()
      offGrid.beforeBatch = { [unowned offGrid] index in
        offGrid.caretShift = index < lastHolding - 1 ? -1 : 0
        // The matching read, started one interval before the last that could hold, ends 1 ms past that one's time.
        if index == lastHolding - 1 { offGrid.clock += typeReadbackPollIntervalMs + 1 }
      }
      let (offError, offMeta, _) = type("pass", into: offGrid, concealed: concealed)
      XCTAssertNotNil(offError, "off the grid, concealed \(concealed)")
      XCTAssertEqual(reason(offMeta), "lengthMismatch", "off the grid, concealed \(concealed)")
      XCTAssertLessThanOrEqual(offGrid.answers.filter(\.isBatch).last!.start - offGrid.postedAt, lastBatchStart, "no batch after the last slot")

      let late = field()
      late.beforeBatch = { [unowned late] in late.caretShift = $0 < lastHolding ? -1 : 0 }  // the last match that holds, on the grid
      late.wake = { [unowned late] asked, now in now - late.postedAt >= self.lastBatchStart - typeReadbackPollIntervalMs ? asked + 3 : asked }
      let (lateError, lateMeta, _) = type("pass", into: late, concealed: concealed)
      XCTAssertNotNil(lateError, "a late wake into the closing read, concealed \(concealed)")
      XCTAssertEqual(reason(lateMeta), "lengthMismatch", "a late wake, concealed \(concealed)")
      XCTAssertEqual(late.batches, 1 + budgetPolls - 1, "the read the late wake would have made never starts, concealed \(concealed)")
    }
  }

  /// P2: a caret the app reports as unavailable ({NSNotFound, 0}, past `readbackLengthLimit`) is no evidence of a read
  /// past the text: it is judged as any read, and the poll goes on, on either basis. A literal request whose first reply
  /// has it beside the right count, and whose next is right, confirms.
  func testAnUnavailableCaretIsNoOvershoot() {
    let notFound = axRangeValue(CFRange(location: NSNotFound, length: 0))
    for (label, count) in [("a count", true), ("the caret alone", false)] {
      let app = field(selection: count ? selection : NSRange(location: location, length: 0))
      if !count { app.countSlot = .absent }
      app.beforeBatch = { app.rangeSlot = $0 == 1 ? .reply(notFound) : .answers }
      XCTAssertNil(type("pass", into: app).error, label)
      XCTAssertEqual(app.batches, 1 + 2 + windowReads, label)
    }
    let sentinel = NSRange(location: NSNotFound, length: 0)
    XCTAssertFalse(readbackLengthOvershoots(count: .value(after), range: sentinel, basis: .count(before, range: selection), typed: 4))
    XCTAssertFalse(readbackLengthOvershoots(count: .absent, range: sentinel, basis: .caret(NSRange(location: location, length: 0)), typed: 4))
    XCTAssertTrue(readbackLengthOvershoots(count: .value(after), range: NSRange(location: location + 5, length: 0), basis: .count(before, range: selection), typed: 4))
  }

  // MARK: The poll's bounds (ruling 1ea561bc:851)

  /// The read-back's standard messaging timeout, T, in ms: a batch starts only while this much is left of the budget.
  private var slotMs: Double { typeReadbackMessagingTimeoutMs }
  /// The poll's last batch may start this long after B, at most: T before the cutoff, E.
  private var lastBatchStart: Double { typeReadbackBudgetMs - slotMs }
  /// The batches a poll that never confirms reads: one every interval up to `lastBatchStart`.
  private var budgetPolls: Int { Int(lastBatchStart / typeReadbackPollIntervalMs) + 1 }
  /// The read of the last match that can still hold for the window by the last batch: the one at 680 ms.
  private var lastHolding: Int { Int((lastBatchStart - typeReadbackLengthDwellMs) / typeReadbackPollIntervalMs) + 1 }

  /// The closing read and its focus check must both end by E, inclusive: a confirming last batch at 900 ms that takes
  /// its whole timeout ends at the cutoff and, its focus check answering there, succeeds. One that overruns a millisecond
  /// past it (a real AX call can return after its messaging timeout), or whose focus check does, confirms nothing, plain
  /// and concealed (the review of 4a005a8c..a1939d2f, P2's literal overrun): each answers lengthMismatch once the clock
  /// has passed the injected cost.
  func testAClosingReadOrFocusCheckThatEndsPastTheCutoffDoesNotConfirm() {
    let lastMatch = lastHolding  // its read at 680 ms
    for concealed in [false, true] {
      // A closing read past the cutoff is no hold, so no check is made at it: only the poll-end focus read.
      let cases: [(label: String, batch: Double, focus: Double, succeeds: Bool, checks: Int)] = [
        ("the closing read ends at the cutoff", slotMs, 0, true, 1),
        ("the closing read ends 1 ms past it", slotMs + 1, 0, false, 1),
        ("its focus check ends 1 ms past it", slotMs, 1, false, 2),
      ]
      for (label, batch, focus, succeeds, checks) in cases {
        let label = "\(label), concealed \(concealed)"
        let app = field()
        app.honoursTimeouts = false
        app.beforeBatch = { [unowned app] in app.caretShift = $0 < lastMatch ? -1 : 0 }
        app.timeline = { [unowned app] t in app.focusCostMs = t >= self.lastBatchStart ? focus : 0 }
        app.cost = { [unowned app] name, _ in name == "batch" && app.clock - app.postedAt >= self.lastBatchStart ? batch : 0 }
        let (error, meta, _) = type("pass", into: app, concealed: concealed)
        XCTAssertEqual(error == nil, succeeds, label)
        XCTAssertEqual(reason(meta), succeeds ? nil : "lengthMismatch", label)
        if succeeds { XCTAssertEqual(app.clock - app.postedAt, typeReadbackBudgetMs, label) }
        XCTAssertGreaterThanOrEqual(app.clock - app.postedAt, lastBatchStart + batch + focus, "\(label): the clock passed the injected cost")
        XCTAssertEqual(app.answers[app.answersAtPost...].filter { !$0.isBatch }.count, checks, "\(label): focus reads")
      }
    }
  }

  /// B is the last post, the instant `endedAt` stamps, not the read-back's own start: whatever runs after the last post
  /// (its key-up's pause, a settle, `finish`'s own work) never moves it. With posts and the pause after each costing
  /// time, no batch starts past the last post + 900 ms, and the last one starts within an interval of it.
  func testTheCutoffCountsFromTheLastPost() {
    for pause in [0.0, 17, 60] {
      let app = field()
      app.postCost = { 3 }
      app.pauseCost = { pause }
      app.beforeBatch = { [unowned app] in if $0 == 3 { app.value += "y" } }
      let (_, meta, _) = type("pass", into: app, concealed: true)
      XCTAssertEqual(reason(meta), "lengthMismatch", "pause \(pause)")
      let last = app.answers.filter(\.isBatch).last!.start - app.postedAt
      XCTAssertLessThanOrEqual(last, lastBatchStart, "pause \(pause)")
      XCTAssertGreaterThan(last, lastBatchStart - typeReadbackPollIntervalMs, "pause \(pause)")
    }
  }

  /// A read that overruns its timeout adds nothing to the secure record: no time and no flag, only the reason.
  func testAnOverrunAddsNoTimeToTheRecord() {
    let app = field()
    app.beforeBatch = { [unowned app] in if $0 == 3 { app.value += "y" } }
    app.honoursTimeouts = false
    app.timeline = { [unowned app] _ in app.focusCostMs = self.slotMs + 30 }
    let (_, meta, reply) = type("pass", into: app, concealed: true)
    XCTAssertGreaterThan(app.clock - app.postedAt, typeReadbackBudgetMs)
    XCTAssertEqual(Set(record(meta).keys), ["confirmed", "snapshotMs", "reason", "secure", "concealed"], "no duration added")
    XCTAssertFalse(reply.contains("lateReply"))
  }

  /// (3) The exposure warning wins: a last batch closed `noLongerSecure` answers `noLongerSecure` though the focus moved
  /// too, so the wrapper's may-show warning and the native advice are kept; one closed `fieldUnreadable` answers that,
  /// with the same warning for a password field (the review of 4a005a8c..a1939d2f, P1-4). Any other last batch with a
  /// moved focus answers `fieldChanged`. A batch shown as text ends the poll at once, with no focus read after it.
  func testAFieldThatStoppedBeingSecureAnswersSoWhenTheFocusMovedToo() {
    XCTAssertEqual(readbackConcealedReason(finalBatch: .closed(.noLongerSecure), focus: .moved), .noLongerSecure)
    XCTAssertEqual(readbackConcealedReason(finalBatch: .closed(.fieldUnreadable), focus: .moved), .fieldUnreadable)
    XCTAssertEqual(readbackConcealedReason(finalBatch: .read(.confirmed), focus: .moved), .fieldChanged)
    let app = field()
    app.timeline = { [unowned app] t in
      if t >= 100 { app.subrole = nil }
      if t >= 100 { app.focus = 2 }
    }
    let (error, meta, _) = type("pass", into: app, concealed: true)
    XCTAssertEqual(reason(meta), "noLongerSecure")
    XCTAssertTrue(error?.message.contains("may now show its text") ?? false)
    XCTAssertEqual(app.clock - app.postedAt, 100, "at the batch that saw it")
    XCTAssertEqual(app.callsAfterPost, [], "no focus read after it")
  }

  /// A focus read that cannot finish (one slower than its timeout, or answering cannotComplete as a timed-out call does) is
  /// unknown, not a moved focus (the hosted runs on 45172367: about a third of the exact controls, on every lane,
  /// answered fieldChanged in fields that never lost focus). It never confirms, and the last batch gives the reason,
  /// plain and concealed; a focus that answers another element is still fieldChanged.
  func testAFocusReadThatCannotFinishIsUnknownNotMoved() {
    for concealed in [false, true] {
      for (label, setUp) in [("slower than its timeout", { (app: StubPasswordApp) in app.timeline = { [unowned app] _ in app.focusCostMs = typeReadbackMessagingTimeoutMs + 50 } }),
                             ("cannotComplete", { (app: StubPasswordApp) in app.timeline = { [unowned app] _ in app.focusFails = true } })] {
        let label = "\(label), concealed \(concealed)"
        let added = field()
        setUp(added)
        added.beforeBatch = { [unowned added] in if $0 == 3 { added.value += "y" } }
        let (_, addedMeta, _) = type("pass", into: added, concealed: concealed)
        XCTAssertEqual(reason(addedMeta), "lengthMismatch", "\(label): an exact add")
        let genuine = field()
        setUp(genuine)
        let (error, meta, _) = type("pass", into: genuine, concealed: concealed)
        XCTAssertNotNil(error, "\(label): an unknown focus never confirms")
        XCTAssertEqual(reason(meta), "lengthMismatch", label)
      }
      let moved = field()
      moved.beforeBatch = { [unowned moved] in if $0 == 3 { moved.focus = 2 } }
      XCTAssertEqual(reason(type("pass", into: moved, concealed: concealed).meta), "fieldChanged", "another element, concealed \(concealed)")
    }
  }

  /// Batches that cost time up to the budget's end, the last returning within its timeout or past it (a real AX call can
  /// return after its messaging timeout), then a field that never lost focus (wave 7's regression): the focus read is
  /// still made after it and finds the field, so an exact add is lengthMismatch. The focus read is the success path's own
  /// check: the stub answers a fresh handle for the same element each time (CFEqual, not identical), as an app does.
  func testASlowOrOverrunningLastBatchStillEndsOnTheFocusRead() {
    let probe = field()
    XCTAssertFalse(probe.el(StubPasswordApp.field) === probe.el(StubPasswordApp.field), "a fresh handle each time")
    XCTAssertTrue(CFEqual(probe.el(StubPasswordApp.field), probe.el(StubPasswordApp.field)), "for the same element")
    // Concealed: a literal request's poll ends at the exact add's first read.
    for overrun in [slotMs, 150, 230] {
      let label = "a last batch taking \(overrun) ms"
      let app = field()
      app.timeline = { [unowned app] t in
        if t >= 15, !app.value.hasSuffix("y") { app.value += "y" }  // an exact add
        app.honoursTimeouts = t < 850
      }
      app.cost = { [unowned app] name, timeout in
        guard name == "batch" else { return 0 }
        return app.clock - app.postedAt >= 850 ? overrun : min(30, timeout - 1)
      }
      let (_, meta, _) = type("pass", into: app, concealed: true)
      XCTAssertEqual(reason(meta), "lengthMismatch", label)
      let focus = app.answers[app.answersAtPost...].last!
      XCTAssertEqual(focus.outcome, .focus(true), "\(label): the focus read was made and found the field")
      XCTAssertGreaterThanOrEqual(focus.start - app.postedAt, 850 + overrun, label)
    }
  }

  /// The hosted runs on 45172367: fieldChanged on 78 of 150 concealed controls and 0 of 75 literal ones, the same
  /// fields. Both kinds' batches ended the same way, the last starting by 950 ms under a messaging timeout of about 50 ms;
  /// when it returns late, the literal check that follows is unbounded and finds the field, while the concealed final
  /// focus read had less than the floor left to the deadline, was not sent, and read as a moved focus. Reproduced on one
  /// field and one timeline, an exact add and an exact drop, literal and concealed: both answer lengthMismatch. The edit
  /// comes before the first read after posting, so no reply matches and none overshoots, and a literal request too polls
  /// to the overrunning last batch (the review of 4a005a8c..a1939d2f, P2): the clock passes its cost.
  func testAConcealedFinalFocusReadAnswersAsTheLiteralCheckDoes() {
    for (change, edit) in [("an add", { (app: StubPasswordApp) in app.value += "y" }), ("a drop", { (app: StubPasswordApp) in app.value.removeLast() })] {
      for overrun in [110.0, 180] {
        for concealed in [false, true] {
          let label = "\(change), the last batch returning \(overrun) ms after its start, concealed \(concealed)"
          let app = field()
          var edited = false
          app.timeline = { [unowned app] t in
            if !edited { edit(app); edited = true }
            app.honoursTimeouts = t < self.lastBatchStart
          }
          app.cost = { [unowned app] name, _ in name == "batch" && app.clock - app.postedAt >= self.lastBatchStart ? overrun : 0 }
          let (error, meta, _) = type("pass", into: app, concealed: concealed)
          XCTAssertNotNil(error, label)
          XCTAssertEqual(reason(meta), "lengthMismatch", label)
          XCTAssertEqual(app.answers[app.answersAtPost...].last?.outcome, .focus(true), "\(label): the focus read was made and found the field")
          XCTAssertGreaterThanOrEqual(app.clock - app.postedAt, lastBatchStart + overrun, "\(label): the overrun was reached")
        }
      }
    }
  }

  // MARK: The review of 4a005a8c..a1939d2f (ruling 1ea561bc:851)

  /// P1-1: a match confirms only on a hold whose start and end are both sampled reads, at least the window apart, inside
  /// the budget. The reviewer's field matches at 680 ms, differs from 810 to 885 ms, and matches again from 885 ms: the
  /// one poll reads the stretch that differs, so no hold spans it, and it is unconfirmed, plain and concealed.
  func testAHoldMustSpanOnlySampledReadsThatAgree() {
    for concealed in [false, true] {
      let app = field()
      app.timeline = { [unowned app] t in app.caretShift = t < 680 || (t >= 810 && t < 885) ? -1 : 0 }
      let (error, meta, _) = type("pass", into: app, concealed: concealed)
      XCTAssertNotNil(error, "concealed \(concealed): the stretch that differs was read")
      // A literal request ends at the read that left the match, its caret one short; a concealed one polls on, tainted.
      XCTAssertEqual(reason(meta), concealed ? "lengthMismatch" : "caretMismatch", "concealed \(concealed)")
    }
  }

  /// P1-2: a password field's focus check after typing is one AX call, chosen by how the snapshot found the field: the
  /// application's AXFocusedUIElement for one it named, with no fallback to the window or a walk. An application that
  /// then names no focused element gives an unknown focus: never a success, and the last batch's reason.
  func testAPasswordFieldsFocusCheckIsOneCall() {
    for concealed in [false, true] {
      let added = field()
      added.timeline = { [unowned added] _ in added.focusAbsent = true }
      added.beforeBatch = { [unowned added] in if $0 == 3 { added.value += "y" } }
      let (_, addedMeta, _) = type("pass", into: added, concealed: concealed)
      XCTAssertEqual(reason(addedMeta), "lengthMismatch", "concealed \(concealed)")
      XCTAssertEqual(Set(added.callsAfterPost), ["AXFocusedUIElement@0"], "concealed \(concealed): one call per check, no fallback")
      let genuine = field()
      genuine.timeline = { [unowned genuine] _ in genuine.focusAbsent = true }
      let (error, meta, _) = type("pass", into: genuine, concealed: concealed)
      XCTAssertNotNil(error, "concealed \(concealed): an unknown focus never confirms")
      XCTAssertEqual(reason(meta), "lengthMismatch", "concealed \(concealed)")
      XCTAssertEqual(Set(genuine.callsAfterPost), ["AXFocusedUIElement@0"], "concealed \(concealed)")
    }
  }

  /// P1-3: every focus check used for a success completes inside the budget. A hold at the last batch whose focus check
  /// answers focused at 1130 ms does not confirm, plain and concealed. A check at an earlier hold that cannot answer is
  /// unknown: the poll goes on, and the next hold checks again, its check confirming.
  func testAFocusCheckThatCompletesAfterTheCutoffIsUnknown() {
    let lastMatch = lastHolding  // its read at 680 ms
    for concealed in [false, true] {
      let slow = field()
      slow.honoursTimeouts = false
      slow.beforeBatch = { [unowned slow] in slow.caretShift = $0 < lastMatch ? -1 : 0 }
      slow.timeline = { [unowned slow] t in slow.focusCostMs = t >= self.lastBatchStart ? 130 : 0 }
      slow.cost = { [unowned slow] name, _ in name == "batch" && slow.clock - slow.postedAt >= self.lastBatchStart ? self.slotMs : 0 }
      let (error, meta, _) = type("pass", into: slow, concealed: concealed)
      XCTAssertNotNil(error, "concealed \(concealed): focused at 1130 ms, too late to confirm")
      XCTAssertEqual(reason(meta), "lengthMismatch", "concealed \(concealed)")
      let first = slow.answers[slow.answersAtPost...].first { !$0.isBatch }!
      XCTAssertEqual(first.end - slow.postedAt, 1_130, "concealed \(concealed): the hold's check")

      let retried = field()
      retried.timeline = { [unowned retried] t in retried.focusCostMs = t < 300 ? 150 : 0 }  // the first check times out
      let (retriedError, _, _) = type("pass", into: retried, concealed: concealed)
      XCTAssertNil(retriedError, "concealed \(concealed): the next hold's check confirms")
      XCTAssertEqual(retried.answers[retried.answersAtPost...].filter { !$0.isBatch }.count, 2, "concealed \(concealed)")
    }
  }

  /// A focus moved mid-typing: the keys after it go elsewhere, so the field never matches, and the focus read at the
  /// poll's end answers fieldChanged, not lengthMismatch, plain and concealed.
  func testAFocusMovedMidTypingAnswersFieldChanged() {
    for concealed in [false, true] {
      let app = field()
      var delivered = 0
      app.transform = { [unowned app] text in
        delivered += 1
        guard delivered > 1 else { return text }
        app.focus = 2  // from the second key on, the keys reach another element
        return ""
      }
      let (error, meta, _) = type("pass", into: app, concealed: concealed)
      XCTAssertNotNil(error, "concealed \(concealed)")
      XCTAssertEqual(reason(meta), "fieldChanged", "concealed \(concealed)")
      XCTAssertEqual(app.batches, 1 + budgetPolls, "concealed \(concealed): never matched, the budget polled")
      XCTAssertEqual(app.callsAfterPost, ["AXFocusedUIElement@0"], "concealed \(concealed): the poll-end focus read alone")
    }
  }

  /// P1-4: a regular batch that sees the field shown as text answers noLongerSecure at once, with its may-show remedy. A
  /// password field that a batch could not classify (fieldUnreadable) may have stopped being one, so it answers that,
  /// whatever its focus did, with the same remedy and its own reason; a plain field's fieldUnreadable keeps its advice.
  func testAPasswordFieldThatCannotBeClassifiedWarnsItMayShowItsText() {
    for concealed in [false, true] {
      let shown = field()
      shown.timeline = { [unowned shown] t in if t >= 100 { shown.subrole = nil } }
      let (shownError, shownMeta, _) = type("pass", into: shown, concealed: concealed)
      XCTAssertEqual(reason(shownMeta), "noLongerSecure", "concealed \(concealed)")
      XCTAssertTrue(shownError?.message.contains("may now show its text") ?? false, "concealed \(concealed)")
      let unread = field()
      unread.timeline = { [unowned unread] t in
        if t >= 100 { unread.batchFails = true; unread.focus = 2 }
      }
      let (unreadError, unreadMeta, _) = type("pass", into: unread, concealed: concealed)
      XCTAssertEqual(reason(unreadMeta), "fieldUnreadable", "concealed \(concealed): before the moved focus")
      XCTAssertEqual(record(unreadMeta)["secure"] as? Bool, true)
      XCTAssertEqual(unread.callsAfterPost, [], "concealed \(concealed): no focus read")
      XCTAssertTrue(unreadError?.message.contains("the password field could not be read, so it may no longer hide its text") ?? false)
      XCTAssertTrue(unreadError?.message.contains("may now show its text") ?? false, "concealed \(concealed): the may-show remedy")
      XCTAssertFalse(unreadError?.message.contains("Observe the field with getAXState()") ?? true)
    }
    let plain = typeUnconfirmed(.fieldUnreadable)
    XCTAssertFalse(plain.message.contains("may now show its text"), "a plain field's fieldUnreadable keeps its advice")
    XCTAssertTrue(plain.message.contains("the field's text could not be read back"))
    XCTAssertTrue(plain.message.contains("Observe the field with getAXState()"))
  }

  /// The property, seeded and deterministic over 2000 cases, each typed with two secrets of different lengths into one
  /// field timeline. A case draws a field (one that takes the text, one that takes none of it, one whose last key lands
  /// late at a drawn time), up to three changes at drawn times after the last post (its focus away or back, its focus
  /// read failing as a timed-out one does or answering again, shown as text or secure again, its count failing or back,
  /// a character added), and every read's cost as a function of its time, within the timeout; about 1 case in 40 lets
  /// reads from 800 ms overrun it. Posting and the pause after each post cost a drawn amount per event. The two secrets
  /// answer alike: the same outcome and reason. Every success held for the window between two sampled reads, its closing
  /// read started with T left and its closing read and focus check ended by the cutoff; every failure's reason is its
  /// last batch's and the focus read after it. A password field's only call after posting but its batch is the
  /// application's focus.
  func testConcealedTimingAndReasonsHoldOverRandomCases() {
    let seed: UInt64 = 0x414_F217, cases = 2000
    var rng = SplitMix(seed)
    var successes = 0, failures = 0, overrunCases = 0
    enum Change: CaseIterable { case focusAway, focusBack, focusFails, focusAnswers, notSecure, secureAgain, countFails, countBack, grows }
    for index in 0..<cases {
      let label = "seed \(String(seed, radix: 16)), case \(index) of \(cases)"
      let first = 1 + Int(rng.next() % 12), second = 1 + (first + Int(rng.next() % 11)) % 12
      let secrets = [first, second].map { length in String((0..<length).map { _ in Character(UnicodeScalar(UInt8(97 + rng.next() % 26))) }) }
      let count = Int(rng.next() % 12), selected = count == 0 ? 0 : Int(rng.next() % UInt64(count + 1))
      let kind = rng.next() % 3  // takes the text, takes none of it, lands its last key late
      var changes: [(at: Double, change: Change?)] = (0..<Int(rng.next() % 4)).map { _ in
        (Double(rng.next() % 1000), Change.allCases[Int(rng.next() % UInt64(Change.allCases.count))])
      }
      if kind == 2 { changes.append((Double(rng.next() % 1000), nil)) }  // nil: the late key lands
      changes.sort { $0.at < $1.at }
      let overruns = rng.next() % 40 == 0
      if overruns { overrunCases += 1 }
      let costSeed = rng.next(), focusCost = Double(rng.next() % 30)
      let postCost = Double(rng.next() % 4), pauseCost = Double(rng.next() % 3)

      func run(_ secret: String) -> (error: EngineError?, meta: InputMeta, app: StubPasswordApp) {
        let app = field(count: count, selection: NSRange(location: count - selected, length: selected))
        switch kind {
        case 1: app.transform = { _ in "" }
        case 2: app.extraFirst = "z"; app.lateUnits = 1; app.landsByBatch = false
        default: break
        }
        var applied = 0
        app.timeline = { [unowned app] t in
          while applied < changes.count, changes[applied].at <= t {
            switch changes[applied].change {
            case .focusAway?: app.focus = 2
            case .focusBack?: app.focus = StubPasswordApp.field
            case .focusFails?: app.focusFails = true
            case .focusAnswers?: app.focusFails = false
            case .notSecure?: app.subrole = nil
            case .secureAgain?: app.subrole = "AXSecureTextField"
            case .countFails?: app.countSlot = .fails
            case .countBack?: app.countSlot = .answers
            case .grows?: app.value += "y"
            case nil: app.land()
            }
            applied += 1
          }
          app.honoursTimeouts = !(overruns && t >= 800)
        }
        // A read's cost is a function of its time since the last post, so both secrets' reads at one time cost alike.
        app.cost = { [unowned app] name, timeout in
          let t = app.clock - app.postedAt
          var draw = SplitMix(costSeed ^ UInt64((t * 1000).rounded()) ^ (name == "batch" ? 0x5A5A : 0xA5A5))
          let roll = draw.next() % 100
          if overruns, t >= 800, roll < 40 { return timeout + Double(draw.next() % 200) }
          let room = name == "batch" ? timeout : timeout - 30  // a focus read's own cost comes on top
          return roll < 90 ? Double(draw.next() % 4) : Double(draw.next() % UInt64(max(1, min(room, 150))))
        }
        app.focusCostMs = focusCost
        app.postCost = { postCost }
        app.pauseCost = { pauseCost }
        let (error, meta, _) = type(secret, into: app, concealed: true)
        return (error, meta, app)
      }
      let runs = secrets.map(run)
      let a = runs[0], b = runs[1]
      XCTAssertEqual(a.error == nil, b.error == nil, "\(label): both secrets, one outcome")
      XCTAssertEqual(reason(a.meta), reason(b.meta), "\(label): both secrets, one reason")

      for (secret, (error, meta, app)) in zip(secrets, runs) {
        let label = "\(label), a secret of \(secret.count)"
        XCTAssertTrue(app.callsAfterPost.allSatisfy { $0 == "AXFocusedUIElement@0" }, "\(label): one call per focus check")
        let answers = Array(app.answers[app.answersAtPost...])
        let batches = answers.filter(\.isBatch)
        if error == nil {
          successes += 1
          guard let focus = answers.last, case .focus(true) = focus.outcome,
                let confirming = answers.dropLast().last, confirming.isBatch,
                case .read(let seen, let range) = confirming.outcome else {
            XCTFail("\(label): a success must end on a passing focus check after a batch"); continue
          }
          XCTAssertEqual(seen, count - selected + secret.count, label)
          XCTAssertEqual(range, NSRange(location: count - selected + secret.count, length: 0), label)
          XCTAssertLessThanOrEqual(confirming.start - app.postedAt, lastBatchStart, "\(label): started with T left")
          XCTAssertLessThanOrEqual(confirming.end - app.postedAt, typeReadbackBudgetMs, "\(label): ended by the cutoff")
          XCTAssertLessThanOrEqual(focus.end - app.postedAt, typeReadbackBudgetMs, "\(label): its focus check ended by the cutoff")
          var held = batches.count - 1
          while held > 0, batches[held - 1].outcome == confirming.outcome { held -= 1 }
          XCTAssertGreaterThanOrEqual(confirming.start - batches[held].end, typeReadbackLengthDwellMs, "\(label): held for the window")
          continue
        }
        failures += 1
        guard let last = batches.last else { XCTFail("\(label): a failure after posting reads a batch"); continue }
        // The reason, from the last batch and the focus read after it alone.
        switch last.outcome {
        case .noLongerSecure, .failed:
          XCTAssertEqual(reason(meta), last.outcome == .noLongerSecure ? "noLongerSecure" : "fieldUnreadable", label)
          XCTAssertTrue(answers.last!.isBatch, "\(label): decided by the batch alone, no focus read after it")
        case .countFailed, .read:
          let byBatch = last.outcome == .countFailed ? "lengthUnreadable" : "lengthMismatch"
          guard let focus = answers.last, case .focus(let found) = focus.outcome else {
            XCTFail("\(label): a failure that is not closed ends on a focus read"); continue
          }
          // A focus read that found the field gives the batch's reason; one that did not is moved or unknown.
          XCTAssertTrue(found ? reason(meta) == byBatch : [byBatch, "fieldChanged"].contains(reason(meta)), "\(label): \(reason(meta) ?? "nil")")
        case .focus: XCTFail(label)
        }
      }
    }
    print("seed \(String(seed, radix: 16)): \(cases) cases, \(2 * cases) runs, \(successes) successes, \(failures) failures, \(overrunCases) overrun cases")
    XCTAssertGreaterThan(successes, cases / 10, "seed \(String(seed, radix: 16)): enough successes to matter")
    XCTAssertGreaterThan(failures, cases / 4, "seed \(String(seed, radix: 16)): enough failures to matter")
  }

  /// Wave 8: the stub at live costs. Seeded and deterministic over 2000 cases, each typed with two secrets of different
  /// lengths into one field: a genuine one, an exact add (an extra character with the first key) or an exact drop (the
  /// first key lost). Every batch read costs 20 to 90 ms and every focus read 10 to 90 ms, as a background app's do
  /// live, all within the read-back's 100 ms messaging timeout, each cost a function of the read's time since the last
  /// post. An exact control answers lengthMismatch, never fieldUnreadable or fieldChanged; a genuine field confirms; both
  /// secrets answer alike, the same outcome and reason; and each focus check is one call.
  func testExactControlsAnswerLengthMismatchAtLiveCosts() {
    let seed: UInt64 = 0x414_F218, cases = 2000
    var rng = SplitMix(seed)
    var genuine = 0, controls = 0
    for index in 0..<cases {
      let label = "seed \(String(seed, radix: 16)), case \(index) of \(cases)"
      let first = 1 + Int(rng.next() % 12), second = 1 + (first + Int(rng.next() % 11)) % 12
      let secrets = [first, second].map { length in String((0..<length).map { _ in Character(UnicodeScalar(UInt8(97 + rng.next() % 26))) }) }
      let count = Int(rng.next() % 12), selected = count == 0 ? 0 : Int(rng.next() % UInt64(count + 1))
      let kind = rng.next() % 3  // genuine, an exact add, an exact drop
      let costSeed = rng.next(), postCost = Double(rng.next() % 4), pauseCost = Double(rng.next() % 3)
      func run(_ secret: String) -> (error: EngineError?, meta: InputMeta, app: StubPasswordApp) {
        let app = field(count: count, selection: NSRange(location: count - selected, length: selected))
        var firstKey = true
        app.transform = { text in
          defer { firstKey = false }
          guard firstKey else { return text }
          return kind == 1 ? text + "y" : kind == 2 ? "" : text
        }
        app.cost = { [unowned app] name, _ in
          var draw = SplitMix(costSeed ^ UInt64(((app.clock - app.postedAt) * 1000).rounded()) ^ (name == "batch" ? 0x5A5A : 0xA5A5))
          return name == "batch" ? Double(20 + draw.next() % 71) : Double(10 + draw.next() % 81)
        }
        app.postCost = { postCost }
        app.pauseCost = { pauseCost }
        let (error, meta, _) = type(secret, into: app, concealed: true)
        return (error, meta, app)
      }
      let runs = secrets.map(run)
      let a = runs[0], b = runs[1]
      XCTAssertEqual(a.error == nil, b.error == nil, "\(label): both secrets, one outcome")
      XCTAssertEqual(reason(a.meta), reason(b.meta), "\(label): both secrets, one reason")
      for (secret, run) in zip(secrets, runs) {
        let label = "\(label), a secret of \(secret.count)"
        XCTAssertTrue(run.app.callsAfterPost.allSatisfy { $0 == "AXFocusedUIElement@0" }, "\(label): one call per focus check")
        if kind == 0 {
          genuine += 1
          XCTAssertNil(run.error, "\(label): a genuine field confirms")
        } else {
          controls += 1
          XCTAssertEqual(reason(run.meta), "lengthMismatch", "\(label): an exact \(kind == 1 ? "add" : "drop")")
        }
      }
    }
    print("seed \(String(seed, radix: 16)): \(cases) cases, \(2 * cases) runs, \(genuine) genuine runs, \(controls) control runs")
    XCTAssertGreaterThan(genuine, cases / 4, "seed \(String(seed, radix: 16)): enough genuine fields")
    XCTAssertGreaterThan(controls, cases, "seed \(String(seed, radix: 16)): enough controls")
  }

  /// The allowance (ruling 1ea561bc:851): the closing read starts by E − T, so a genuine field must have taken the text
  /// within the budget less T and the window, 680 ms of the last post. A field that takes it at 680 ms is read matching
  /// there and held at the last batch, and confirms; one that takes it at 681 ms is first read matching at 685 ms and
  /// cannot hold for the window, so it is unconfirmed, plain and concealed, answering lengthMismatch. So does a match
  /// first read at the last batch.
  func testAMatchTooLateToHoldBeforeTheBudgetIsUnconfirmed() {
    XCTAssertEqual(typeReadbackBudgetMs - typeReadbackMessagingTimeoutMs - typeReadbackLengthDwellMs, 680, "the documented allowance")
    for concealed in [false, true] {
      for (takesAt, confirms) in [(680.0, true), (681, false)] {
        let label = "taken at \(takesAt) ms, concealed \(concealed)"
        let app = field()
        app.timeline = { [unowned app] t in app.caretShift = t < takesAt ? -1 : 0 }
        let (error, meta, _) = type("pass", into: app, concealed: concealed)
        XCTAssertEqual(error == nil, confirms, label)
        XCTAssertEqual(reason(meta), confirms ? nil : "lengthMismatch", label)
      }
      for (matchAt, confirms) in [(lastHolding, true), (lastHolding + 1, false), (budgetPolls, false)] {
        let label = "a match at batch \(matchAt), concealed \(concealed)"
        let app = field()
        app.beforeBatch = { [unowned app] in app.caretShift = $0 < matchAt ? -1 : 0 }  // a caret that reaches the end only then
        let (error, meta, _) = type("pass", into: app, concealed: concealed)
        XCTAssertEqual(error == nil, confirms, label)
        XCTAssertEqual(reason(meta), confirms ? nil : "lengthMismatch", label)
        XCTAssertEqual(app.batches, 1 + budgetPolls, label)
        XCTAssertEqual(meta.typeReadback?.pollMs, lastBatchStart, label)
      }
    }
  }

  /// A genuine field's caret rises from its selection's start to the end of the text and never past it, and from nothing
  /// selected its count rises to the expected one and never past it. So for a literal request a caret past the text's
  /// end, or from nothing selected a count past the expected one, ends the poll at that read, judged as any read. Over a
  /// non-empty selection a count past the expected one does not: the snapshot's own count is past it whenever the
  /// selection is longer than the text, until the app takes the first key. A concealed request never ends early on
  /// such a read: it polls the budget, as any mismatch does.
  func testAReadPastTheTextEndsALiteralRequestsPollAtOnce() {
    for concealed in [false, true] {
      let polled = concealed ? 1 + budgetPolls : 1 + 1
      let past = field()
      past.caretShift = 1
      XCTAssertEqual(reason(type("pass", into: past, concealed: concealed).meta), concealed ? "lengthMismatch" : "caretMismatch")
      XCTAssertEqual(past.batches, polled, "a caret past the text, over a selection, concealed \(concealed)")
      let caretPast = field(selection: NSRange(location: location, length: 0))
      caretPast.countSlot = .absent
      caretPast.caretShift = 1
      XCTAssertEqual(reason(type("pass", into: caretPast, concealed: concealed).meta), concealed ? "lengthMismatch" : "caretMismatch")
      XCTAssertEqual(caretPast.batches, polled, "the caret alone, past the text, concealed \(concealed)")
      var doubled = 0
      let counted = field(selection: NSRange(location: location, length: 0))
      counted.transform = { doubled += 1; return doubled == 2 ? $0 + $0 : $0 }
      counted.caretShift = -1  // the caret right where the text ends, the count one over
      XCTAssertEqual(reason(type("pass", into: counted, concealed: concealed).meta), "lengthMismatch")
      XCTAssertEqual(counted.batches, polled, "a count past the expected one, from nothing selected, concealed \(concealed)")
    }
    var extra = 0
    let empty = field(count: 0, selection: NSRange(location: 0, length: 0))
    empty.rangeSlot = .absent
    empty.transform = { extra += 1; return extra == 2 ? $0 + $0 : $0 }
    XCTAssertEqual(reason(type("pass", into: empty).meta), "lengthMismatch")
    XCTAssertEqual(empty.batches, 2, "a count past the expected one, from an empty field read without a range")
    var over = 0
    let selected = field(count: 10, selection: NSRange(location: 2, length: 4))
    selected.transform = { over += 1; return over == 1 ? $0 + $0 : $0 }
    selected.caretShift = -1
    XCTAssertEqual(reason(type("ab", into: selected).meta), "lengthMismatch")
    XCTAssertEqual(selected.batches, 1 + budgetPolls, "over a selection a count past the expected one polls the budget")
  }

  /// A concealed request's failure takes the same time whatever its secret's length: every read past the text compares
  /// with an expected count or caret that depends on that length, so a field that ignores the secret but whose caret or
  /// count sits past it for a short secret only would otherwise end early for that one. Each such field, the secret
  /// shorter and longer than what it sits on, answers with the same reads, number of them, time, reason, message and
  /// record: one that ignores it in place (the snapshot's count is past the expected one for a secret shorter than the
  /// selection), one that collapses its selection to the selection's end (past the text's end for a secret shorter than
  /// the selection), and one whose caret jumps to the end of its text (past the text's end for a secret shorter than the
  /// text after the caret).
  func testAFieldThatIgnoresASecretPollsAlikeWhateverTheSecretsLength() {
    let fields: [(label: String, selection: NSRange, caret: StubPasswordApp.CaretOnIgnore, shorter: String, longer: String)] = [
      ("in place", NSRange(location: 2, length: 4), .stays, "ab", "abcdef"),
      ("collapsing its selection to its end", NSRange(location: 2, length: 4), .selectionEnd, "ab", "abcdef"),
      ("jumping its caret to its text's end", NSRange(location: 3, length: 0), .textEnd, "ab", "abcdefghi"),
    ]
    for field in fields {
      func ignoring(_ secret: String) -> (log: [String], batches: Int, meta: InputMeta, message: String?) {
        let app = self.field(count: 10, selection: field.selection)
        app.ignoresInput = true
        app.caretOnIgnore = field.caret
        let (error, meta, _) = type(secret, into: app, concealed: true)
        XCTAssertEqual(app.value.count, 10, "\(field.label): nothing went in")
        return (app.reads, app.batches, meta, error?.message)
      }
      let shorter = ignoring(field.shorter), longer = ignoring(field.longer)
      XCTAssertEqual(shorter.log, longer.log, field.label)
      XCTAssertEqual(shorter.batches, 1 + budgetPolls, field.label)
      XCTAssertEqual(shorter.batches, longer.batches, field.label)
      XCTAssertEqual(shorter.meta.typeReadback?.pollMs, longer.meta.typeReadback?.pollMs, field.label)
      XCTAssertEqual(reason(shorter.meta), "lengthMismatch", field.label)
      XCTAssertEqual(reason(longer.meta), "lengthMismatch", field.label)
      XCTAssertEqual(shorter.message, longer.message, field.label)
      XCTAssertEqual(record(shorter.meta) as NSDictionary, record(longer.meta) as NSDictionary, field.label)
    }
    // The documented limit of a length (the review of f35a42b8..cbce12e2, P2; the DL's item 10): a field that drops the
    // text but collapses a selection exactly as long as it reads as one that replaced the selection with it, and holds
    // that, so it confirms at the window though nothing went in. No length or caret can tell the two apart.
    let collapsed = field(count: 10, selection: NSRange(location: 2, length: 4))
    collapsed.ignoresInput = true
    collapsed.caretOnIgnore = .selectionEnd
    let (error, meta, _) = type("abcd", into: collapsed, concealed: true)
    XCTAssertNil(error, "the limit: a secret as long as the selection confirms")
    XCTAssertEqual(record(meta)["confirmation"] as? String, "length")
    XCTAssertEqual(collapsed.value.count, 10, "nothing went in")
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
    XCTAssertEqual(later.batches, 1 + budgetPolls)
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
    XCTAssertEqual(app.batches, 1 + 3 + 1 + windowReads, "the snapshot, three settle reads, one poll, the quiet window's reads")
  }

  /// A count or caret no field has (`NSNotFound` is Int.max; a count past Int32's range) is unreadable, so no arithmetic
  /// on it can trap: an unconfirmed reason, the text typed all the same. A count past the limit is a failed read
  /// (`readbackLength`; the review of 81a1aebc..52f0109a, P2), refused at the snapshot before any settle and unreadable
  /// to the poll until its budget, as a failed count is; a caret past it is unreadable at the basis.
  func testACountOrCaretNoFieldHasIsUnreadableWithoutATrap() {
    let notFound = axRangeValue(CFRange(location: NSNotFound, length: 0))
    let caret = field()
    caret.countSlot = .absent
    caret.rangeSlot = .reply(notFound)
    XCTAssertEqual(reason(type("pass", into: caret).meta), "lengthUnreadable", "the caret's basis at NSNotFound")
    XCTAssertEqual(caret.batches, 1)
    for count in [Int.max, Int(Int32.max) + 1] {
      let huge = field(selection: NSRange(location: 5, length: 0))
      huge.countSlot = .reply(count as CFNumber)
      XCTAssertEqual(reason(type("pass", into: huge).meta), "lengthUnreadable", "a count of \(count)")
      XCTAssertEqual(huge.batches, 1, "\(count): refused at the snapshot")
    }
    let counted = field()
    counted.rangeSlot = .reply(notFound)
    XCTAssertEqual(reason(type("pass", into: counted).meta), "selectionUnreadable", "a range at NSNotFound beside a count")
    let polled = field()
    polled.beforeBatch = { if $0 == 1 { polled.countSlot = .reply(Int.max as CFNumber); polled.rangeSlot = .reply(notFound) } }
    let (_, polledMeta, _) = type("pass", into: polled)
    XCTAssertEqual(reason(polledMeta), "lengthUnreadable", "such a read after typing is a failed read")
    XCTAssertEqual(polledMeta.typeReadback?.reads, polled.batches - 1, "polled to the budget, every read unreadable")
    XCTAssertGreaterThan(polled.batches, 2, "polled to the budget, every read unreadable")
    XCTAssertEqual(polled.value.count, after, "typed all the same")

    // The settle cannot turn such a count into the caret's basis: a snapshot count of Int.max, then no count at all
    // beside a stable empty selection, is lengthUnreadable at the snapshot, never confirmed by the caret.
    let settled = field(selection: NSRange(location: 5, length: 0))
    settled.countSlot = .reply(Int.max as CFNumber)
    settled.beforeBatch = { if $0 >= 1 { settled.countSlot = .absent } }
    let (settledError, settledMeta, _) = type("pass", into: settled, settle: true)
    XCTAssertEqual(settledError?.errorName, "typeUnconfirmed")
    XCTAssertEqual(reason(settledMeta), "lengthUnreadable")
    XCTAssertEqual(settled.batches, 1, "refused before the settle")

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
    let confirmed = Array(repeating: batch, count: 1 + windowReads)  // the match, then the quiet window's reads
    XCTAssertEqual(app.log, ["AXFocusedUIElement@0", "AXRole@1", "AXSubrole@1", batch, "post", "post"] + confirmed + ["AXFocusedUIElement@0",
                             "post", "post", "post"] + confirmed + ["AXFocusedUIElement@0"], "the Return posted after the checkpoint's window")
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
    XCTAssertEqual(secret.batches, 1 + 1 + windowReads)
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
  /// different lengths and for a literal and a concealed text, into the same field; so is the record. Uncollapsed, so
  /// are the number of reads and the poll's time, the quiet window's included: it starts on the match and has one length.
  func testTheReadsAreTheSameWhateverTheSecretOrTheRequest() {
    func schedule(_ text: String, concealed: Bool, lagging: Bool = false) -> (reads: [String], record: NSDictionary, batches: Int, pollMs: Double?) {
      let app = field(count: 3, selection: NSRange(location: 0, length: 3))
      if lagging { app.beforeBatch = { app.caretShift = $0 < 4 ? -1 : 0 } }  // a caret that shows late
      let (error, meta, _) = type(text, into: app, concealed: concealed)
      XCTAssertNil(error, text)
      var collapsed: [String] = []
      for read in app.reads where read != collapsed.last { collapsed.append(read) }
      var wire = record(meta)
      wire["concealed"] = nil
      return (collapsed, wire as NSDictionary, app.batches, meta.typeReadback?.pollMs)
    }
    let short = schedule("x", concealed: true), long = schedule("s3cr3t-Zebra-and-more", concealed: true)
    let same = schedule("abc", concealed: true), literal = schedule("s3cr3t-Zebra-and-more", concealed: false)
    XCTAssertEqual(short.reads, long.reads)
    XCTAssertEqual(short.reads, same.reads, "a secret as long as the selection reads as any other")
    XCTAssertEqual(short.reads, literal.reads)
    XCTAssertEqual(short.record, long.record)
    XCTAssertEqual(short.record, same.record)
    XCTAssertEqual(short.record, literal.record)
    XCTAssertEqual(short.batches, 1 + 1 + windowReads, "the snapshot, the match and the quiet window's reads")
    XCTAssertEqual(short.pollMs, typeReadbackLengthDwellMs)
    for other in [long, same, literal] {
      XCTAssertEqual(other.batches, short.batches)
      XCTAssertEqual(other.pollMs, short.pollMs)
    }
    // A caret that lags: polls repeat, and still the same reads, window and answer whatever the secret's length.
    let lagShort = schedule("x", concealed: true, lagging: true), lagSame = schedule("abc", concealed: true, lagging: true)
    XCTAssertEqual(lagShort.reads, lagSame.reads)
    XCTAssertEqual(lagShort.record, lagSame.record)
    XCTAssertEqual(lagShort.batches, 1 + 4 + windowReads)
    XCTAssertEqual(lagShort.batches, lagSame.batches)
    XCTAssertEqual(lagShort.pollMs, 3 * typeReadbackPollIntervalMs + typeReadbackLengthDwellMs)
    XCTAssertEqual(lagShort.pollMs, lagSame.pollMs)
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
