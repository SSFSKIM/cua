import ApplicationServices
import Foundation

// type_text's read-back (#354; the design session's ruling 1ea561bc:585 on the spike's findings, the native engine
// spec's Decision Log, the #354 entry). The vendor answers once its events are posted; cua's keyed route answers once
// the field reads what was typed. The rule is the spike's reader (`probe/354-measure`, scripts/probe-354-fences/logic.swift
// and fence.swift `Fence354Readback`), with the ruling's guards added:
// - Before the first event, the focused field is snapshotted in the only order allowed: focus, then role and subrole,
//   and value and selected range (UTF-16, as AX counts) only for a text-entry role (`typeReadbackTextRoles`) that is
//   not secure. Chrome's canvas exposes an empty string value that is not its text, so a string value alone never
//   makes a field readable.
// - A concealed request (a `{{secret:…}}` substitution; the design session's ruling 1ea561bc:589) keeps the read-back as
//   equality only: the expected value is built and compared in buffers the read-back owns, zeroed after each use, and a
//   mismatch says only that the field does not match what was typed, with no excerpt, values or lengths (a length
//   tells the secret's). A secure field is never read, concealed or not.
// - The expected value is the snapshot's with the selected range replaced by the typed text.
// - After the last event, the same field is polled until its value equals the expected one, at most
//   `typeReadbackBudgetMs`, its role and subrole read again before every value read: a field that turns secure or
//   unreadable is read no further. Equal, and the field still the app's focused element: success, `confirmed` in the
//   meta. Anything else is `typeUnconfirmed`, never retried; only a mismatch on a field that stayed readable carries
//   values, a bounded excerpt around the first difference (`readbackExcerpt`) and both lengths.
// - Equality proves nothing when the expected value is the snapshot's own (the selection already held the typed text:
//   the review of 9020bb18..dad56362, P1, #354's race itself, since a late select-all could still rewrite the field). Then
//   the selected range must also read the caret past the insertion, {location + typed length, 0}, which differs from the
//   snapshot's non-empty selection, and only an equal value read taken after that caret read counts (the review of
//   dad56362..af1860ef, P1); without both within the budget, `typeUnconfirmed` (`unchanged`). The same holds at a
//   checkpoint before a key.
// - A value at Chromium's AXValue cap (`typeReadbackValueCap`, #350) may be cut, so it never compares: unconfirmed, with
//   no values. So is an expected value at the cap, which a whole field and a cut one would read alike.
// - Keys in the text (the design session's ruling 1ea561bc:589, call 2). In a multi-line field (an AXTextArea, which is
//   how a text area and a contenteditable read, unless its subrole is one the cells show does not read a Return back,
//   `typeReadbackReturnUnreadSubroles`) a Return is text: "\n" in the expected value, read back like any character. A
//   key that can leave the field or submit it (a Return in a single-line field, a Tab anywhere, any other keyed control
//   character) is a checkpoint: the text typed since the last one must read back before the key is posted, so it never
//   submits text that went in wrong; the key adds nothing to the expected value, and every one posted is counted
//   `keysUnconfirmed`, its effect not confirmed. Text after it is expected in the same field, so focus that moved with a
//   Tab answers `fieldChanged`.
// - A posted click can land after the snapshot and move the caret back (#359, ruling 1ea561bc:785, ClickOrdering.swift):
//   within its window the snapshot first waits for the field's range to hold still, and within a second of select_text
//   for the range select_text wrote, which still missing at the cap means nothing is typed (`selectionChanged`).
// The paste route (Paste.swift, a non-Latin input source) keeps #187's effect check and is not read back here; its
// read-back is #361.

/// The poll's budget after the last event (or before a checkpoint's key), its interval, and the messaging timeout of
/// every read: the spike's soft 1000 ms, 5 ms polls and 100 ms AX timeout, whose confirmed reads took p50 26 to 34 ms.
let typeReadbackBudgetMs: Double = 1_000
let typeReadbackPollIntervalMs: Double = 5
let typeReadbackMessagingTimeout: Float = 0.1
/// Chromium cuts a text field's AXValue at 10,000 (#290's hosted measurement: a 20,499-character ASCII field read back
/// 10,000 long; #350): a read at that length may be cut, and so may compare equal to an expected value that is not the
/// field's (`readbackMayBeTruncated`).
let typeReadbackValueCap = 10_000
/// The mismatch excerpt: this many UTF-16 units before and after the first difference, of each of expected and actual,
/// so a mismatch carries at most about 400 units of the field whatever its length.
let typeReadbackExcerptRadius = 100
/// The roles whose value is their text: a text field (a search field is its subrole), a text area (Chromium, WebKit and
/// Gecko expose a contenteditable region as one), and a combo box, whose value is its field's text.
let typeReadbackTextRoles: Set<String> = [kAXTextFieldRole, kAXTextAreaRole, kAXComboBoxRole]

/// A field's AXSubrole as read: a string, absent (no value, unsupported), or a read that failed.
enum ReadbackSubrole: Equatable {
  case value(String)
  case absent
  case failed
}

/// Why a type_text is unconfirmed (the meta's `typeReadback.reason`). Only `valueMismatch` reports values.
enum TypeReadbackReason: String, Equatable {
  case noFocusedElement, roleUnreadable, secure, notTextField, valueUnreadable, rangeUnreadable, possiblyTruncated
  case valueMismatch, concealedMismatch, unchanged, becameSecure, fieldUnreadable, fieldChanged
  /// The field's range was not select_text's within the cap (#359): nothing was typed.
  case selectionChanged
}

/// Whether nothing of a field's value or range may be read: role or subrole AXSecureTextField, or a role or subrole that
/// cannot be read. Fails closed.
func readbackSecure(role: String?, subrole: ReadbackSubrole) -> Bool {
  guard let role else { return true }
  if role == "AXSecureTextField" { return true }
  switch subrole {
  case .value(let found): return found == "AXSecureTextField"
  case .absent: return false
  case .failed: return true
  }
}

/// `before` with the UTF-16 `range` replaced by `typed`; nil when the range does not lie inside `before`.
func readbackExpected(before: String, range: NSRange, typed: String) -> String? {
  let value = before as NSString
  guard range.location >= 0, range.length >= 0, range.location <= value.length, range.length <= value.length - range.location else { return nil }
  return value.replacingCharacters(in: range, with: typed)
}

/// Whether a value read may be cut at Chromium's cap: its length sits at the cap, counted in UTF-8 bytes (Blink cuts a
/// string attribute to at most that many bytes, at a character boundary, so up to 3 short) or in UTF-16 units (a cut
/// that kept a surrogate pair whole, 1 short). A value past the cap was not cut there (TextEdit's are whole) and
/// compares.
func readbackMayBeTruncated(_ value: String) -> Bool {
  let bytes = value.utf8.count, units = (value as NSString).length
  return (typeReadbackValueCap - 3...typeReadbackValueCap).contains(bytes) || (typeReadbackValueCap - 1...typeReadbackValueCap).contains(units)
}

/// `readbackMayBeTruncated` over a buffer of UTF-16 units, its UTF-8 length counted without making a String of it.
func readbackMayBeTruncated(units: [UInt16]) -> Bool {
  var bytes = 0, index = 0
  while index < units.count {
    let unit = units[index]
    if unit < 0x80 { bytes += 1 } else if unit < 0x800 { bytes += 2 }
    else if UTF16.isLeadSurrogate(unit), index + 1 < units.count, UTF16.isTrailSurrogate(units[index + 1]) { bytes += 4; index += 1 }
    else { bytes += 3 }
    index += 1
  }
  return (typeReadbackValueCap - 3...typeReadbackValueCap).contains(bytes) || (typeReadbackValueCap - 1...typeReadbackValueCap).contains(units.count)
}

/// Overwrites a buffer that held concealed text, in place (memset_s, which the compiler may not drop).
func readbackZero(_ buffer: inout [UInt16]) {
  buffer.withUnsafeMutableBufferPointer { units in
    guard let base = units.baseAddress, units.count > 0 else { return }
    _ = memset_s(base, units.count * 2, 0, units.count * 2)
  }
}

/// The subroles of an AXTextArea whose Return the hosted cells show is not read back as "\n": there a Return counts as a
/// key that can leave or submit. Gecko's contenteditable (AXApplicationGroup, the spike's run 42815192390) flattens its
/// line breaks in AXValue (ruling 1ea561bc:737). Safari's contenteditable carries no subrole, as its text area and
/// Chromium's do; its one failure, an ending Return read with its empty last line's placeholder, is accepted by the
/// caret instead (`readbackPlaceholderLine`).
let typeReadbackReturnUnreadSubroles: Set<String> = ["AXApplicationGroup"]

/// Whether an ending Return's placeholder line may be accepted (the design session's ruling 1ea561bc:737 on #354's A/B,
/// run 43752829833: Safari's contenteditable reads an ending Return as "\n\n", the empty last line's placeholder, in 20
/// of 20, while a Return between lines reads back exactly): in a field that takes a Return as text, when the typed text
/// ends in a Return and nothing of the field follows the insertion, a read of the expected value and exactly one more
/// "\n" is the same text. The caret tells it from a Return typed twice: after an ending Return it sits at the start of
/// the placeholder line, the expected value's length; after a doubled one, one further on.
func readbackPlaceholderLine(returnIsText: Bool, typedEndsInReturn: Bool, suffixEmpty: Bool) -> Bool {
  returnIsText && typedEndsInReturn && suffixEmpty
}

/// Whether a field takes a Return as text: an AXTextArea whose subrole is not one the cells exclude.
func readbackReturnIsText(role: String, subrole: ReadbackSubrole, unread: Set<String> = typeReadbackReturnUnreadSubroles) -> Bool {
  guard role == kAXTextAreaRole else { return false }
  if case .value(let found) = subrole { return !unread.contains(found) }
  return true
}

/// A typed unit whose key is a control character (a Return, a Tab): its effect may not be text.
func readbackKey(_ unit: TypedUnit) -> Bool {
  unit.press != nil && unit.text.count == 1 && (unit.text[0] < 0x20 || unit.text[0] == 0x7F)
}

/// What a unit puts in a field that takes it as text: a Return a newline, anything else its own characters.
func readbackInsertion(_ unit: TypedUnit) -> String {
  unit.text == [0x0D] ? "\n" : String(utf16CodeUnits: unit.text, count: unit.text.count)
}

/// The reads the read-back makes, live or faked.
struct ReadbackReads<Element> {
  var focused: () -> Element?
  var role: (Element) -> String?
  var subrole: (Element) -> ReadbackSubrole
  var value: (Element) -> String?
  /// The value as UTF-16 units in a buffer of its own, for a concealed comparison that zeroes it after use.
  var valueUnits: (Element) -> [UInt16]?
  var range: (Element) -> NSRange?
  var same: (Element, Element) -> Bool
  var now: () -> Double = monotonicMilliseconds
  var sleep: (Double) -> Void = { usleep(UInt32(max(0, $0) * 1000)) }
}

extension ReadbackReads where Element == AXUIElement {
  /// The live reads of `pid`'s focused field, each element given the read-back's messaging timeout.
  static func live(pid: pid_t) -> ReadbackReads<AXUIElement> {
    ReadbackReads(focused: {
      let application = AXUIElementCreateApplication(pid)
      AXUIElementSetMessagingTimeout(application, typeReadbackMessagingTimeout)
      func element(_ of: AXUIElement, _ name: String) -> AXUIElement? {
        guard let raw = attribute(of, name), CFGetTypeID(raw) == AXUIElementGetTypeID() else { return nil }
        let found = raw as! AXUIElement
        AXUIElementSetMessagingTimeout(found, typeReadbackMessagingTimeout)
        return found
      }
      return readbackFocusedField(application: application, focused: { element($0, kAXFocusedUIElementAttribute) },
                                  primaryWindow: { element($0, kAXFocusedWindowAttribute) ?? element($0, kAXMainWindowAttribute) },
                                  walk: ReadbackFocusWalk(children: { node in
                                    liveWalkRead(node, kAXChildrenAttribute) { raw in
                                      guard CFGetTypeID(raw) == CFArrayGetTypeID() else { return nil }
                                      return elementList(raw).map { child in
                                        AXUIElementSetMessagingTimeout(child, typeReadbackMessagingTimeout)
                                        return child
                                      }
                                    }
                                  }, isFocused: { liveWalkRead($0, kAXFocusedAttribute, bool) },
                                  role: { liveWalkRead($0, kAXRoleAttribute) { CFGetTypeID($0) == CFStringGetTypeID() ? ($0 as! String) : nil } }))
    }, role: { stringAttribute($0, kAXRoleAttribute) }, subrole: liveReadbackSubrole,
       value: { stringAttribute($0, kAXValueAttribute) }, valueUnits: liveReadbackValueUnits, range: { element in
      guard let range = rangeWire(attribute(element, kAXSelectedTextRangeAttribute)), let location = range["location"],
            let length = range["length"] else { return nil }
      return NSRange(location: location, length: length)
    }, same: { CFEqual($0, $1) })
  }
}

/// The bounds of the walk for the focused field (`readbackFocusedByWalk`), sized from run 44022892172 (Safari 27.2, 10
/// reps): the window to its AXWebArea took 28 nodes at depth 6 in 4.7/10.9 ms p50/p95, the web area to its focused
/// AXTextField 5 nodes at depth 2 in 0.5/1.0 ms. A walk of the whole window, needed to see that only one element is
/// focused, reads more than that path; the bounds leave about 6 times the nodes, 1.5 times the depth and 3 times the
/// time of the measured path.
let typeReadbackFocusWalkNodes = 200
let typeReadbackFocusWalkDepth = 12
let typeReadbackFocusWalkMs: Double = 40
/// The roles the walk claims: the text-entry roles, and a secure field's, which the snapshot then refuses unread.
let typeReadbackFocusWalkRoles: Set<String> = typeReadbackTextRoles.union(["AXSecureTextField"])

/// One attribute read of the walk: its value, absent (the element has none: noValue, attributeUnsupported), or failed
/// (any other error, such as cannotComplete or a timeout, or a value of the wrong type), which leaves the walk unfinished.
enum ReadbackWalkRead<Value> {
  case value(Value)
  case absent
  case failed
}

/// The reads of the walk, live or faked: an element's children, its AXFocused, its role, the clock.
struct ReadbackFocusWalk<Element> {
  var children: (Element) -> ReadbackWalkRead<[Element]>
  var isFocused: (Element) -> ReadbackWalkRead<Bool>
  var role: (Element) -> ReadbackWalkRead<String>
  var now: () -> Double = monotonicMilliseconds
}

/// A live attribute read for the walk, its error kept (the review of 1bac4017..45e5a5ed, P2: a failed read read as an
/// absence could hide a second focused field).
func liveWalkRead<Value>(_ element: AXUIElement, _ name: String, _ convert: (CFTypeRef) -> Value?) -> ReadbackWalkRead<Value> {
  let (raw, error) = copyAttribute(element, name)
  return readbackWalkRead(raw, error, convert)
}

/// What one attribute read answered, as the walk counts it.
func readbackWalkRead<Value>(_ raw: CFTypeRef?, _ error: AXError, _ convert: (CFTypeRef) -> Value?) -> ReadbackWalkRead<Value> {
  switch error {
  case .success: return raw.flatMap(convert).map { .value($0) } ?? .failed
  case .noValue, .attributeUnsupported: return .absent
  default: return .failed
  }
}

/// The field typed keys reach: the application's AXFocusedUIElement, else the one its primary window's walk finds
/// (`readbackFocusedByWalk`; AXFocusedWindow, else AXMainWindow). An app that is not active can answer no focused element
/// at the application (#354's A/B, run 43752829833: background Safari, 120 of 120 cells with no route 3 hold first).
/// Run 44022892172 showed what answers then: the application's AXFocusedUIElement no value (-25212), the windows' focus
/// attributes unsupported (-25205), the web area's AXFocusedUIElement no value; a walk of the window for the element
/// that reads AXFocused true found the text field 10 of 10. Only AX attributes are read; nothing is activated.
func readbackFocusedField<Element>(application: Element, focused: (Element) -> Element?, primaryWindow: (Element) -> Element?,
                                   walk: ReadbackFocusWalk<Element>) -> Element? {
  if let field = focused(application) { return field }
  return primaryWindow(application).flatMap { readbackFocusedByWalk($0, walk) }
}

/// The window walked breadth first, each element's role read: an element with a role the walk claims
/// (`typeReadbackFocusWalkRoles`) is a leaf of the walk, focused or not, its AXFocused read and its children never, so
/// nothing typed into any field is read (the review of 1bac4017..45e5a5ed, P2: a field a concealed request left, its
/// text under it, would otherwise change the reads of the identity check's walk). Any other element is walked through,
/// focused or not: after a key press Safari's AXWebArea reads AXFocused true beside its editor (run 44022892172, 10 of
/// 10). The one focused field is claimed only when the walk finished with nothing left unread: past the node or time
/// bound, a failed read, or an element at `typeReadbackFocusWalkDepth` (the window is depth 0) that has children (that
/// review's P1) leave it unfinished, and an unfinished walk, like one that found several, claims nothing, since what
/// it did not read could be another.
func readbackFocusedByWalk<Element>(_ window: Element, _ walk: ReadbackFocusWalk<Element>) -> Element? {
  let started = walk.now()
  var queue: [(element: Element, depth: Int)] = [(window, 0)]
  var index = 0
  var found: Element?
  while index < queue.count {
    if index >= typeReadbackFocusWalkNodes || walk.now() - started > typeReadbackFocusWalkMs { return nil }
    let (element, depth) = queue[index]
    index += 1
    switch walk.role(element) {
    case .failed: return nil
    case .value(let role) where typeReadbackFocusWalkRoles.contains(role):
      switch walk.isFocused(element) {
      case .failed: return nil
      case .value(true):
        if found != nil { return nil }
        found = element
      case .value(false), .absent: break
      }
      continue
    case .value, .absent: break
    }
    switch walk.children(element) {
    case .failed: return nil
    case .absent: break
    case .value(let children):
      if children.isEmpty { break }
      if depth >= typeReadbackFocusWalkDepth { return nil }
      queue += children.map { ($0, depth + 1) }
    }
  }
  return found
}

/// AXValue copied straight from its CFString into a buffer the caller owns and zeroes (no Swift String is made of it).
/// The CFString the app's reply was decoded into is released, not overwritten: it is immutable and the process's own.
func liveReadbackValueUnits(_ field: AXUIElement) -> [UInt16]? {
  guard let raw = attribute(field, kAXValueAttribute), CFGetTypeID(raw) == CFStringGetTypeID() else { return nil }
  let string = raw as! CFString
  let length = CFStringGetLength(string)
  var units = [UInt16](repeating: 0, count: length)
  units.withUnsafeMutableBufferPointer { CFStringGetCharacters(string, CFRange(location: 0, length: length), $0.baseAddress) }
  return units
}

/// AXSubrole with its error: absent for kAXErrorNoValue and kAXErrorAttributeUnsupported, failed for any other error or
/// a value that is not a string.
func liveReadbackSubrole(_ field: AXUIElement) -> ReadbackSubrole {
  let (raw, error) = copyAttribute(field, kAXSubroleAttribute)
  if error == .success {
    if let raw, CFGetTypeID(raw) == CFStringGetTypeID() { return .value(raw as! String) }
    return .failed
  }
  return error == .noValue || error == .attributeUnsupported ? .absent : .failed
}

/// The snapshot before the first event: the field and what may be expected of it, or why nothing can be.
enum ReadbackPlan<Element> {
  case refused(TypeReadbackReason)
  case expect(field: Element, role: String, before: String, range: NSRange, returnIsText: Bool)
}

/// The snapshot; `settle`, when not nil, settles it first (`readbackSettle`) and records what that did. The settle comes
/// after the secure and text-role checks, so it never reads a field the snapshot would not.
///
/// #359 (ruling 785): `baseline`, when not nil, waits first, after the same checks and before the value is read, on the
/// field's range read every `pendingClickSampleMs` with its role and subrole checked before each read as the settle
/// does (`awaitRange`, recorded in `waited`): for select_text's range, which still not read at the cap refuses the
/// snapshot as `selectionChanged` (nothing is then typed), as does a snapshot whose own range, read after the wait and
/// after any settle, is not that range; for a stable range, which at the cap goes on regardless.
func readbackSnapshot<Element>(reads: ReadbackReads<Element>, settle: inout ReadbackSettle?) -> ReadbackPlan<Element> {
  var waited: RangeWait?
  return readbackSnapshot(reads: reads, settle: &settle, baseline: nil, waited: &waited)
}

func readbackSnapshot<Element>(reads: ReadbackReads<Element>, settle: inout ReadbackSettle?, baseline: BaselineWait?,
                               waited: inout RangeWait?) -> ReadbackPlan<Element> {
  guard let field = reads.focused() else { return .refused(.noFocusedElement) }
  guard let role = reads.role(field) else { return .refused(.roleUnreadable) }
  let subrole = reads.subrole(field)
  if readbackSecure(role: role, subrole: subrole) { return .refused(.secure) }
  guard typeReadbackTextRoles.contains(role) else { return .refused(.notTextField) }
  if let baseline {
    var closed: TypeReadbackReason?
    let goal: RangeGoal<NSRange>
    switch baseline {
    case .stable: goal = .stable
    case .selection(let written): goal = .equals(written)
    }
    let wait = awaitRange(goal, read: {
      if let why = readbackFieldClosed(field, role: role, reads: reads) { closed = why; return .closed }
      return reads.range(field).map { .sample($0) } ?? .unread
    }, now: reads.now, sleep: reads.sleep)
    waited = wait
    if let closed { return .refused(closed) }
    if case .selection = baseline, !wait.met { return .refused(.selectionChanged) }
  }
  guard var before = reads.value(field) else { return .refused(.valueUnreadable) }
  if readbackMayBeTruncated(before) { return .refused(.possiblyTruncated) }
  guard var range = reads.range(field), readbackExpected(before: before, range: range, typed: "") != nil else { return .refused(.rangeUnreadable) }
  if var settled = settle {
    defer { settle = settled }
    if let closed = readbackSettle(field, role: role, reads: reads, before: &before, range: &range, record: &settled) { return .refused(closed) }
    if readbackMayBeTruncated(before) { return .refused(.possiblyTruncated) }
    guard readbackExpected(before: before, range: range, typed: "") != nil else { return .refused(.rangeUnreadable) }
  }
  // The starting point itself, after any settle, must still be select_text's range: a click landing after the wait's
  // read would otherwise be adopted, and the read-back would confirm text typed at its caret.
  if case .selection(let written) = baseline, range != written { return .refused(.selectionChanged) }
  return .expect(field: field, role: role, before: before, range: range, returnIsText: readbackReturnIsText(role: role, subrole: subrole))
}

/// Why a snapshotted field is read no further, its role and subrole read again: unreadable, secure, or another role.
func readbackFieldClosed<Element>(_ field: Element, role: String, reads: ReadbackReads<Element>) -> TypeReadbackReason? {
  guard let seenRole = reads.role(field) else { return .fieldUnreadable }
  let subrole = reads.subrole(field)
  if case .failed = subrole { return .fieldUnreadable }
  if readbackSecure(role: seenRole, subrole: subrole) { return .becameSecure }
  if seenRole != role { return .fieldChanged }
  return nil
}

/// What one value read answered against the expected value: unreadable, equal, or different (possibly cut at the
/// cap; `actual` kept only for a plain request's excerpt, never for a concealed one).
enum ReadbackRead: Equatable {
  case unreadable
  case equal
  /// Equal to an expected value that is the snapshot's own (the selection held the typed text), with nothing yet
  /// showing the typing was consumed.
  case equalUnconsumed
  case differs(cut: Bool, actual: String?)
}

/// The value an equal read matched, which the caret evidence is tied to: the expected value, or it and an ending
/// Return's placeholder line (`readbackPlaceholderLine`).
enum ReadbackCandidate: Equatable {
  case expected
  case placeholderLine
}

/// One poll of the snapshotted field: role and subrole re-read before every value read, a field that is no longer the
/// snapshot's role, or is secure or unreadable, read no further. `closed` names such a field; otherwise `last` is what
/// the last value read answered (`compare`).
struct ReadbackPoll: Equatable {
  var matched = false
  var reads = 0
  var last: ReadbackRead?
  var closed: TypeReadbackReason?
}

func readbackPoll<Element>(_ field: Element, role: String, reads: ReadbackReads<Element>, compare: (Element) -> ReadbackRead) -> ReadbackPoll {
  var poll = ReadbackPoll()
  let started = reads.now()
  repeat {
    if let closed = readbackFieldClosed(field, role: role, reads: reads) { return ReadbackPoll(reads: poll.reads, closed: closed) }
    poll.reads += 1
    poll.last = compare(field)
    if poll.last == .equal { poll.matched = true; break }
    if reads.now() - started >= typeReadbackBudgetMs { break }
    reads.sleep(typeReadbackPollIntervalMs)
  } while true
  return poll
}

/// A mismatch's excerpt: `typeReadbackExcerptRadius` UTF-16 units either side of the first unit where expected and
/// actual differ, the same span of each (cut short at either's end), never splitting a surrogate pair.
struct ReadbackExcerpt: Equatable {
  let start: Int
  let expected: String
  let actual: String
  let expectedLength: Int
  let actualLength: Int
}

func readbackExcerpt(expected: String, actual: String, radius: Int = typeReadbackExcerptRadius) -> ReadbackExcerpt {
  let e = Array(expected.utf16), a = Array(actual.utf16)
  var first = 0
  while first < e.count, first < a.count, e[first] == a[first] { first += 1 }
  var start = max(0, first - radius)
  if start > 0, start < max(e.count, a.count), UTF16.isTrailSurrogate((start < e.count ? e : a)[start]) { start -= 1 }
  func cut(_ units: [UInt16]) -> String {
    guard start < units.count else { return "" }
    var end = min(units.count, first + radius)
    if end < units.count, UTF16.isLeadSurrogate(units[end - 1]) { end -= 1 }
    return String(utf16CodeUnits: Array(units[start..<end]), count: end - start)
  }
  return ReadbackExcerpt(start: start, expected: cut(e), actual: cut(a), expectedLength: e.count, actualLength: a.count)
}

/// What the read-back did, the meta's `typeReadback`: value-free (lengths only, and only on a mismatch).
struct TypeReadbackRecord: Equatable {
  var confirmed = false
  var reason: TypeReadbackReason?
  var snapshotMs: Double = 0
  var pollMs: Double = 0
  var reads = 0
  var checkpoints = 0
  var keysUnconfirmed = 0
  var expectedLength: Int?
  var actualLength: Int?
  /// The mismatch stopped the text before a key it was checked ahead of, so the key and what follows were not sent.
  var stoppedBeforeKey = false
  /// Confirmed with an ending Return's placeholder line (`readbackPlaceholderLine`), and whether the caret that told it
  /// from a doubled Return could not be read (accepted all the same, the ruling's residual). A plain request's only.
  var placeholderLine = false
  var placeholderCaretUnread = false
  /// The settle before the snapshot (`readbackSettle`), when a recent key asked for one: its reads after the first, and
  /// whether its cap ended it. A plain request's only; a concealed one's time shows in `snapshotMs`.
  var settleReads = 0
  var settleCapped = false
  /// #359's wait before the snapshot (`readbackSnapshot`'s `baseline`), when a pending click or select_text asked for
  /// one: which, its reads and time, and whether the cap ended it. A plain request's only; a concealed one's time shows
  /// in `snapshotMs`, and its reason says `selectionChanged`.
  var baseline: BaselineWait?
  var baselineWait: RangeWait?
  /// A concealed request's record (the review of dad56362..af1860ef, P2): no count and no poll time on the wire, since the
  /// checkpoints, the keys and the reads and time of each checkpoint's poll tell how many control characters and
  /// segments the secret holds (a secret of keys alone, its length); a key left unconfirmed is a flag.
  var concealed = false

  var wire: [String: Any] {
    var wire: [String: Any] = ["confirmed": confirmed, "snapshotMs": (snapshotMs * 10).rounded() / 10]
    if let reason { wire["reason"] = reason.rawValue }
    if concealed {
      wire["concealed"] = true
      if keysUnconfirmed > 0 { wire["keysUnconfirmed"] = true }
      if stoppedBeforeKey { wire["stoppedBeforeKey"] = true }
      return wire
    }
    wire["pollMs"] = (pollMs * 10).rounded() / 10
    wire["reads"] = reads
    if checkpoints > 0 { wire["checkpoints"] = checkpoints }
    if keysUnconfirmed > 0 { wire["keysUnconfirmed"] = keysUnconfirmed }
    if let expectedLength { wire["expectedLength"] = expectedLength }
    if let actualLength { wire["actualLength"] = actualLength }
    if stoppedBeforeKey { wire["stoppedBeforeKey"] = true }
    if placeholderLine { wire["placeholderLine"] = true }
    if placeholderCaretUnread { wire["placeholderCaretUnread"] = true }
    if settleReads > 0 { wire["settleReads"] = settleReads }
    if settleCapped { wire["settleCapped"] = true }
    if let baseline, let baselineWait {
      var wait = baselineWait.wire
      wait["for"] = baseline == .stable ? "stable" : "selection"
      wire["baselineWait"] = wait
    }
    return wire
  }
}

/// One keyed type_text's read-back: the snapshot taken at creation, `beforeUnit` run before each unit is posted (a
/// checkpoint before a key), `finish` after the last; both throw `typeUnconfirmed`. `record` holds what it did either way.
final class TypeReadback<Element> {
  private let units: [TypedUnit]
  private let reads: ReadbackReads<Element>
  private let plan: ReadbackPlan<Element>
  private let concealed: Bool
  /// Units after the last checkpoint (or the start) that put text in, which a checkpoint or the final poll must confirm.
  private var unchecked = false
  private(set) var record = TypeReadbackRecord()

  init(units: [TypedUnit], concealed: Bool, settle: Bool, baseline: BaselineWait? = nil, reads: ReadbackReads<Element>) {
    self.units = units
    self.reads = reads
    self.concealed = concealed
    record.concealed = concealed
    let started = reads.now()
    var settled: ReadbackSettle? = settle ? ReadbackSettle() : nil
    var waited: RangeWait?
    plan = readbackSnapshot(reads: reads, settle: &settled, baseline: baseline, waited: &waited)
    record.snapshotMs = reads.now() - started
    record.baseline = baseline
    record.baselineWait = waited
    record.settleReads = settled?.reads ?? 0
    record.settleCapped = settled?.capped ?? false
    if case .refused(let reason) = plan { record.reason = reason }
  }

  /// Before unit `index` is posted: a key after text not yet confirmed waits for that text to read back. Never inside a
  /// `{{secret:…}}` substitution (the design session's ruling 1ea561bc:593, on the review of af1860ef..a8e55870, P2):
  /// each checkpoint is a confirmation wait, and the reply's time would tell how the secret's text is segmented. The
  /// wrapper expands a secret only as the whole text of a type_text, so a concealed request is all secret: its keys are
  /// posted with the rest of it, unconfirmed (a flag), and it is read back once, after the last unit.
  func beforeUnit(_ index: Int) throws {
    guard case .expect = plan else { return }
    if leaves(units[index]) {
      if unchecked, !concealed {
        record.checkpoints += 1
        try confirm(through: index, beforeKey: true)
        unchecked = false
      }
    } else {
      unchecked = true
    }
  }

  /// Whether nothing may be typed (#359): select_text's range was gone at the snapshot, so the text would go elsewhere.
  var refusesTyping: Bool {
    if case .refused(.selectionChanged) = plan { return true }
    return false
  }

  /// After the last event: success, or `typeUnconfirmed`.
  func finish() throws {
    guard case .expect = plan else { throw typeUnconfirmed(record.reason ?? .valueUnreadable) }
    // A concealed request is always read back once, whatever its keys, so its number of waits is always one.
    if unchecked || concealed { try confirm(through: units.count, beforeKey: false) }
    record.keysUnconfirmed = units.filter(leaves).count
    record.confirmed = true
    record.reason = nil
  }

  /// Whether a unit's key can leave the field or submit it: any keyed control character but a Return in a field that
  /// takes it as text.
  private func leaves(_ unit: TypedUnit) -> Bool {
    guard readbackKey(unit) else { return false }
    if unit.text == [0x0D], case .expect(_, _, _, _, true) = plan { return false }
    return true
  }

  /// Polls for the snapshot with its selection replaced by units `0..<end`, then checks the field is still the focus.
  private func confirm(through end: Int, beforeKey: Bool) throws {
    guard case .expect(let field, let role, let before, let range, let returnIsText) = plan else { return }
    let typedUnits = units[0..<end].filter { !leaves($0) }  // a key that can leave adds nothing to the field
    let placeholder = readbackPlaceholderLine(returnIsText: returnIsText, typedEndsInReturn: typedUnits.last?.text == [0x0D],
                                              suffixEmpty: range.location + range.length == (before as NSString).length)
    let poll: ReadbackPoll
    var excerpt: (() -> ReadbackExcerpt)?  // a plain mismatch's, made only once the field is known to be the same
    let started = reads.now()
    defer { record.pollMs += reads.now() - started }
    // Where the expected value is the snapshot's own, equality needs the caret past the insertion as well, and then a
    // value read taken after that caret read (the review of dad56362..af1860ef, P1: a stale value read before a newer
    // caret confirmed what the app had already changed). `equalAfterCaret` judges an equal read: the first one to see the
    // caret only sets `caretSeenWith`, and only a later equal read counts.
    // The caret evidence belongs to the value it was read with (the review of bd63a0cc..5582db9c, P1: a secret's caret seen
    // with its expected value confirmed the placeholder line a doubled Return read as after it). Each read takes the
    // evidence (`seenWith`), and only a read of that same value keeps it or confirms with it; any other read drops it, so
    // a value that matches next has its caret read again.
    let range16 = range, readRange = reads.range
    var caretSeenWith: ReadbackCandidate?
    func equalAfterCaret(_ element: Element, _ candidate: ReadbackCandidate, seenWith: ReadbackCandidate?, unchanged: Bool,
                         inserted: Int) -> ReadbackRead {
      guard unchanged, seenWith != candidate else { return .equal }
      if readRange(element) == NSRange(location: range16.location + inserted, length: 0) { caretSeenWith = candidate }
      return .equalUnconsumed
    }
    if concealed {
      // Equality only, in buffers the read-back owns: the expected value's units and each read's, zeroed after use.
      let value = Array(before.utf16)
      guard range.location >= 0, range.length >= 0, range.location + range.length <= value.count else { throw unconfirmed(.rangeUnreadable, beforeKey) }
      var expected = Array(value[0..<range.location])
      for unit in typedUnits { expected += unit.text == [0x0D] ? [0x0A] : unit.text }
      expected += value[(range.location + range.length)...]
      defer { readbackZero(&expected) }
      if readbackMayBeTruncated(units: expected) { throw unconfirmed(.possiblyTruncated, beforeKey) }
      // A secret's ending Return with its placeholder line: the same caret, at the expected value's length, is required
      // of every concealed confirmation, so accepting it adds no read and no wait (ruling 1ea561bc:737).
      var expectedPlaceholder = placeholder ? expected + [0x0A] : []
      defer { readbackZero(&expectedPlaceholder) }
      // One schedule for every concealed confirmation (the review of a8e55870..8f465bf9, P2): the caret evidence and a
      // value read after it are always required, never only when the secret equals the text it replaced, so the reads
      // and waits do not tell whether a secret matches a selection the caller chose.
      let inserted = expected.count - (value.count - range.length)
      let valueUnits = reads.valueUnits
      poll = readbackPoll(field, role: role, reads: reads) { element in
        let seenWith = caretSeenWith
        caretSeenWith = nil
        guard var read = valueUnits(element) else { return .unreadable }
        defer { readbackZero(&read) }
        if readbackMayBeTruncated(units: read) { return .differs(cut: true, actual: nil) }  // a cut read never counts as equal
        let candidate: ReadbackCandidate
        if read == expected { candidate = .expected } else if placeholder, read == expectedPlaceholder { candidate = .placeholderLine } else {
          return .differs(cut: false, actual: nil)
        }
        return equalAfterCaret(element, candidate, seenWith: seenWith, unchanged: true, inserted: inserted)
      }
    } else {
      let typed = typedUnits.map(readbackInsertion).joined()
      guard let expected = readbackExpected(before: before, range: range, typed: typed) else { throw unconfirmed(.rangeUnreadable, beforeKey) }
      if readbackMayBeTruncated(expected) { throw unconfirmed(.possiblyTruncated, beforeKey) }
      let unchanged = expected.utf16.elementsEqual(before.utf16)
      let inserted = (expected as NSString).length - ((before as NSString).length - range.length)
      let value = reads.value
      // The placeholder line (`readbackPlaceholderLine`): the read must be the expected value and one "\n", the caret at
      // the expected value's length, then a fresh read after that caret read; a caret one further on is a doubled
      // Return, a mismatch; an unreadable caret is accepted, the ruling's stated residual.
      let withPlaceholder = expected + "\n", placeholderCaret = NSRange(location: (expected as NSString).length, length: 0)
      func placeholderAfterCaret(_ element: Element, _ read: String, seenWith: ReadbackCandidate?) -> ReadbackRead {
        if seenWith == .placeholderLine { record.placeholderLine = true; return .equal }
        let caret = readRange(element)
        if let caret, caret != placeholderCaret { return .differs(cut: false, actual: read) }
        caretSeenWith = .placeholderLine
        record.placeholderCaretUnread = caret == nil
        return .equalUnconsumed
      }
      poll = readbackPoll(field, role: role, reads: reads) { element in
        let seenWith = caretSeenWith
        caretSeenWith = nil
        guard let read = value(element) else { return .unreadable }
        if readbackMayBeTruncated(read) { return .differs(cut: true, actual: read) }  // a cut read never counts as equal
        // Code units, never Swift's ==, which takes canonically equivalent strings of different lengths for equal.
        if read.utf16.elementsEqual(expected.utf16) {
          return equalAfterCaret(element, .expected, seenWith: seenWith, unchanged: unchanged, inserted: inserted)
        }
        if placeholder, read.utf16.elementsEqual(withPlaceholder.utf16) { return placeholderAfterCaret(element, read, seenWith: seenWith) }
        return .differs(cut: false, actual: read)
      }
      if case .differs(_, let actual?) = poll.last { excerpt = { readbackExcerpt(expected: expected, actual: actual) } }
    }
    record.reads += poll.reads
    if let closed = poll.closed { throw unconfirmed(closed, beforeKey) }
    guard let focused = reads.focused(), reads.same(focused, field) else { throw unconfirmed(.fieldChanged, beforeKey) }
    switch poll.last {
    case .equal?: return
    case .equalUnconsumed?: throw unconfirmed(.unchanged, beforeKey)
    case .unreadable?, nil: throw unconfirmed(.valueUnreadable, beforeKey)
    case .differs(cut: true, _)?: throw unconfirmed(.possiblyTruncated, beforeKey)
    case .differs?: break
    }
    guard let excerpt = excerpt?() else { throw unconfirmed(.concealedMismatch, beforeKey) }
    record.expectedLength = excerpt.expectedLength
    record.actualLength = excerpt.actualLength
    throw unconfirmed(.valueMismatch, beforeKey, excerpt: excerpt)
  }

  private func unconfirmed(_ reason: TypeReadbackReason, _ beforeKey: Bool, excerpt: ReadbackExcerpt? = nil) -> EngineError {
    record.reason = reason
    record.stoppedBeforeKey = beforeKey
    return typeUnconfirmed(reason, excerpt: excerpt, beforeKey: beforeKey)
  }
}

/// The keyed route's text with its read-back: the snapshot before the first unit, a checkpoint before each key, the
/// final poll after the last unit; the record in the meta whatever the answer. Empty text posts nothing and reads nothing.
/// `baseline` is #359's wait before the snapshot (`readbackSnapshot`); one that finds select_text's range gone posts
/// nothing and answers `typeUnconfirmed` (`selectionChanged`).
func keyTextReadBack<Element>(_ units: [TypedUnit], concealed: Bool, settle: Bool = false, baseline: BaselineWait? = nil,
                              reads: ReadbackReads<Element>,
                              checkSource: (_ entered: Int, _ total: Int) throws -> Void, checkIntervention: () throws -> Void,
                              post: (KeyEvent) -> Bool, pause: () -> Void, meta: inout InputMeta) throws {
  guard !units.isEmpty else {
    return try keyText(units, concealed: concealed, checkSource: checkSource, checkIntervention: checkIntervention, post: post,
                       pause: pause, meta: &meta)
  }
  let readback = TypeReadback(units: units, concealed: concealed, settle: settle, baseline: baseline, reads: reads)
  defer { meta.typeReadback = readback.record }
  // #359: select_text's range gone, nothing is typed, so no text lands where the caret moved to.
  if readback.refusesTyping {
    if !concealed { meta.entered = 0 }
    throw typeUnconfirmed(.selectionChanged)
  }
  try keyText(units, concealed: concealed, checkSource: checkSource, beforeUnit: readback.beforeUnit,
              checkIntervention: checkIntervention, post: post, pause: pause, meta: &meta)
  try readback.finish()
}

/// The text the excerpt shows the model: quoted, with its newlines, tabs, quotes and other control characters escaped.
func readbackQuoted(_ text: String) -> String {
  var out = "\""
  for scalar in text.unicodeScalars {
    switch scalar {
    case "\"": out += "\\\""
    case "\\": out += "\\\\"
    case "\n": out += "\\n"
    case "\r": out += "\\r"
    case "\t": out += "\\t"
    default:
      if scalar.value < 0x20 || scalar.value == 0x7F { out += String(format: "\\u%04X", scalar.value) } else { out.unicodeScalars.append(scalar) }
    }
  }
  return out + "\""
}

/// `typeUnconfirmed`: the text was sent, the field does not read as expected or cannot be read, so some of it may have
/// gone in; the remedy is to observe, then setValue. A mismatch shows the excerpt; nothing else shows a value.
func typeUnconfirmed(_ reason: TypeReadbackReason, excerpt: ReadbackExcerpt? = nil, beforeKey: Bool = false) -> EngineError {
  if reason == .selectionChanged {  // #359: answered before anything is typed
    return EngineError(name: "typeUnconfirmed",
      "Nothing was typed: the field's selection is no longer the one selectText made (a click sent just before can land after it and move the caret), so the text would have gone elsewhere. Observe the app (take a screenshot or call getAXState()) first, then select the text again before typing.")
  }
  let why: String
  switch reason {
  case .valueMismatch: why = "the field does not read as expected"
  case .concealedMismatch: why = "the field does not match what was typed"
  case .unchanged: why = "nothing shows the field took the text: it reads as expected, but its caret did not move past the text"
  case .secure, .becameSecure: why = "the field is a password field, which is never read back"
  case .noFocusedElement: why = "no focused field could be found to read back"
  case .notTextField: why = "the focused element is not a text field"
  case .roleUnreadable, .fieldUnreadable, .valueUnreadable, .rangeUnreadable: why = "the field's text could not be read back"
  case .possiblyTruncated: why = "the field holds more text than accessibility reports in full"
  case .fieldChanged: why = "the focused field changed while the text was typed"
  case .selectionChanged: why = "the field's selection changed after selectText"  // answered above
  }
  let sent = beforeKey ? "The text before a Return or Tab was typed, but \(why), so the key and the text after it were not sent. Some of the text may have gone in"
    : "The text was typed, but \(why), so it is not confirmed and some or all of it may have gone in"
  var message = "\(sent). Observe the field with getAXState() before going on, then use setValue to put it right; do not type the text again."
  if let excerpt {
    message += " From character \(excerpt.start + 1), expected \(readbackQuoted(excerpt.expected)); the field reads \(readbackQuoted(excerpt.actual)). The expected text is \(excerpt.expectedLength) characters long, the field's \(excerpt.actualLength)."
  }
  return EngineError(name: "typeUnconfirmed", message)
}
