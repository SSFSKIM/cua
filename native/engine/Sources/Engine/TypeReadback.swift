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
//   tells the secret's). A secure field's value is never read, concealed or not (#414 confirms it by its length).
// - The expected value is the snapshot's with the selected range replaced by the typed text.
// - After the last event, the same field is polled until its value equals the expected one, at most
//   `typeReadbackBudgetMs`, its role and subrole read again before every value read: a field that turns secure or
//   unreadable is read no further. Equal, and the field still the app's focused element (one that Safari's text-marker
//   route found, #395, still reading AXFocused true itself: `readbackStillFocused`): success, `confirmed` in the
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
// - A password field (#414; the design session's rulings 1ea561bc:826, which applies paste's ruling 808 to type_text, 833
//   on what its success says and 839 on a field that has no count; the native engine spec's Decision Log, the #414
//   entry) is confirmed by its length, never its value. It is a field #405's classification finds secure, with a role
//   read and a field's role (`readbackPasswordField`: AXSecureTextField by role or subrole, or a text-entry role whose
//   subrole cannot be read). A field the lookup already took for one (the marker route's classification, the walk's
//   claim by role) is held to it: the snapshot's own role and subrole reading no password field refuse it
//   `noLongerSecure`, nothing more read. After its role and subrole, every read of it is one batch of its role,
//   subrole, selected range and character count (`readbackLengthAttributes`), classified from that same reply
//   (`readbackLength`): a reply that is no longer such a field ends it. The count and range stay here, compared and
//   never formatted, kept on the record or emitted. A wait for select_text's range is refused `selectionChanged` before
//   any batch (at a field the lookup took for one, before any read of it, its role included), nothing typed, since
//   select_text never selects in a password field; a count read that fails at the
//   snapshot is refused before the settle. The starting point (`readbackLengthBasis`): the count with the range; the
//   count alone in an empty field whose range cannot be read; or, where the field has no count at all (absent, never a
//   read that failed), the caret alone from an empty selection; a count or such a caret past `readbackLengthLimit` is
//   no field's. The expected count is the start's less the selection plus the typed text's UTF-16 units, as AX counts
//   both; whenever the range was read, the caret must also sit right after the text, {location + typed, 0}, in the
//   same reply, whatever the selection held, and a concealed request answers a wrong caret as it answers a wrong count
//   (`lengthMismatch`), so no answer depends on whether a secret is as long as the selection it replaced. A match counts
//   only once the same reply has held for the quiet window (`typeReadbackLengthDwellMs`, ruling 1ea561bc:842): a reply
//   read between an app's last two keys can match when a character was added, and a genuine field never moves away
//   from a final match. The window is read at the poll's interval and lies inside the budget. A literal request's poll
//   ends at a reply that leaves a held match, or one past any genuine field's (`readbackLengthOvershoots`). A concealed
//   request's success ends as a literal one's does; every concealed failure after posting, a snapshot refusal
//   included, answers at one deadline from the last post (`typeReadbackBudgetMs` + `typeReadbackFocusReadCapMs`,
//   `finish`), its reason from the final batch and the final focus read alone, each at a fixed slot from that post,
//   so neither its timing nor its reason depends on its secret. Every read is bounded by the time left to its limit,
//   and a focus check that cannot finish is unknown, never a moved focus. A success
//   that a length check confirmed names its strength (`confirmation: "length"`) and its note says what a length proves
//   (`readbackLengthNote`); a literal request of keys alone confirms no length and claims none; a failure carries its
//   reason alone. A count cannot tell a wrong character from a right one.
// The paste route (Paste.swift, a non-Latin input source) keeps #187's effect check and is not read back here; its
// read-back is #361.

/// The poll's budget after the last event (or before a checkpoint's key), its interval, and the messaging timeout of
/// every read: the spike's soft 1000 ms, 5 ms polls and 100 ms AX timeout, whose confirmed reads took p50 26 to 34 ms.
let typeReadbackBudgetMs: Double = 1_000
let typeReadbackPollIntervalMs: Double = 5
/// A password field's quiet window (#414; the design session's ruling 1ea561bc:842): a length read that matches confirms
/// only once the same read has held unchanged this long, read at `typeReadbackPollIntervalMs` within the budget, so a
/// field must take the text within the budget less this and `messagingTimeoutFloorMs` (730 ms). One constant for every
/// lane, never one per lane, sized at three times the slowest lane's drain in the hosted qualification's full run:
/// AppKit's gap p99 of 72.6 ms (218 ms; direct fixture edit gaps ending after the last post, n=269), above Chrome for
/// Testing's 29 ms, Safari's 24 ms and the parity Electron lane's 25 ms. Raise it if a lane's measured drain p99, times
/// three, passes it.
let typeReadbackLengthDwellMs: Double = 220
/// The cap on a concealed password-field read-back's final focus read (#414; the review of cbce12e2..1f69470e, P1):
/// every concealed failure after posting answers at the last post + `typeReadbackBudgetMs` + this. The read starts at
/// the cutoff with this budget of its own, which nothing before it can take (the review of f217f062..45172367): its AX
/// calls are bounded by that deadline, or by its own start + this if a read before it overran past the cutoff. A read
/// that overruns its timeout is the residual, flagged `lateReply`.
let typeReadbackFocusReadCapMs: Double = 100
/// The scheduler jitter a concealed failure's reply may show past its deadline and still count as on time (#414; the
/// review of f217f062..45172367, 5): one that leaves more than this after the deadline, from a read that overran or a
/// sleep that woke late, is flagged `lateReply`.
let typeReadbackWakeToleranceMs: Double = 10
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
  /// The field's range was not select_text's within the cap (#359), or the field is a password field, which select_text
  /// never selects in (#414): nothing was typed.
  case selectionChanged
  /// A password field's (#414): its count could not be read (a read that failed, none with no empty selection to stand
  /// on instead, or one past any field's); its range could not be read while it held text, or did not lie inside its
  /// count; its count was never the expected one, or a concealed request's caret was not right after the text; a literal
  /// request's caret was not right after the text, with its count, where it has one, as expected; it stopped
  /// classifying as a password field.
  case lengthUnreadable, selectionUnreadable, lengthMismatch, caretMismatch, noLongerSecure
}

/// Whether a field's value and range may not be read by themselves: role or subrole AXSecureTextField, or a role or
/// subrole that cannot be read. Fails closed. Such a field that is a password field (`readbackPasswordField`) is read
/// only through its length batch (#414); any other is read no further.
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

/// How the snapshot's field was found (#395), which is how it is asked for again after typing (`readbackStillFocused`).
enum ReadbackLookup: Equatable {
  /// The application's AXFocusedUIElement, or #354's walk of its primary window: looked up again the same way.
  case focus
  /// Safari's text-marker route (TypeReadbackMarker.swift): the field itself is asked, never the marker again.
  case marker
}

/// What the lookup before the first event found: the field and how, and whether the lookup already took it for a
/// password field (#414: the marker route's classification, or the walk's claim by the role AXSecureTextField), which
/// the snapshot then holds it to; or (the marker route's) an element classified closed, refused unread with main's
/// reason for it.
enum ReadbackFound<Element> {
  case field(Element, by: ReadbackLookup, password: Bool = false)
  case closed(TypeReadbackReason)
}

/// The reads the read-back makes, live or faked.
struct ReadbackReads<Element> {
  /// Before the first event: the field typed keys reach (`readbackFocusedField`).
  var focused: () -> ReadbackFound<Element>?
  /// After an event (the final poll's and each checkpoint's): whether the snapshot's field is still that field
  /// (`readbackStillFocused`), never through the marker: focused, moved, or unknown.
  var stillFocused: (Element, ReadbackLookup) -> ReadbackFocus
  var role: (Element) -> String?
  var subrole: (Element) -> ReadbackSubrole
  var value: (Element) -> String?
  /// The value as UTF-16 units in a buffer of its own, for a concealed comparison that zeroes it after use.
  var valueUnits: (Element) -> [UInt16]?
  var range: (Element) -> NSRange?
  /// #414: one batched request of `names`, a password field's only read after its role and subrole
  /// (`readbackLengthAttributes`); nil when the request failed.
  var batch: (Element, [String]) -> AttributeRead? = { _, _ in nil }
  var now: () -> Double = monotonicMilliseconds
  var sleep: (Double) -> Void = { usleep(UInt32(max(0, $0) * 1000)) }
  /// Bounds every read until it is called again by the absolute time `until` on `clock` (the read-back's `now`), or
  /// lifts the bound (nil): each AX call is sent only while time is left, under a messaging timeout of the time left at
  /// most, and the usual timeout is put back after (paste's `effectReading` pattern). A call not sent fails. The poll
  /// itself starts a read only with `messagingTimeoutFloorMs` left.
  var bound: (_ until: Double?, _ clock: @escaping () -> Double) -> Void = { _, _ in }
}

extension ReadbackReads where Element == AXUIElement {
  /// The live reads of `pid`'s focused field through `ax`, each element given the read-back's messaging timeout; the
  /// text-marker route only when `markerRoute` (`readbackMarkerRoute`, Safari) and its symbols resolved.
  static func live(pid: pid_t, markerRoute: Bool, ax base: ReadbackAX = ReadbackAX()) -> ReadbackReads<AXUIElement> {
    // Every AX call goes through `bounded`: under a bound (`ReadbackReads.bound`), a call is sent only while time is
    // left, its element's messaging timeout the time left at most, and the read-back's usual timeout put back after, as
    // paste's `effectReading` bounds its reads; a call not sent fails as a timeout does. A slot's read whose sleep woke
    // a little late is still sent, under what is left.
    // A call not sent, or one that answered cannotComplete (a messaging timeout's error), marks the reads `starved`: a
    // focus check that saw one and named no field is unknown, not moved.
    let limit = ReadbackBound()
    func bounded<Answer>(_ element: AXUIElement, failed: Answer, _ call: () -> Answer) -> Answer {
      guard let until = limit.until else { return call() }
      let left = until - limit.clock()
      guard left > 0 else { limit.starved = true; return failed }
      base.setTimeout(element, Float(min(Double(typeReadbackMessagingTimeout), left / 1000)))
      defer { base.setTimeout(element, typeReadbackMessagingTimeout) }
      return call()
    }
    func noting(_ answer: (value: CFTypeRef?, error: AXError)) -> (value: CFTypeRef?, error: AXError) {
      if answer.error == .cannotComplete { limit.starved = true }
      return answer
    }
    let ax = ReadbackAX(copy: { element, name in noting(bounded(element, failed: (nil, .cannotComplete)) { base.copy(element, name) }) },
                        copyParameterized: { element, name, parameter in
                          noting(bounded(element, failed: (nil, .cannotComplete)) { base.copyParameterized(element, name, parameter) })
                        }, batch: { element, names in bounded(element, failed: nil) { base.batch(element, names) } },
                        pid: base.pid, markers: base.markers, setTimeout: base.setTimeout)
    func timed(_ element: AXUIElement) -> AXUIElement {
      AXUIElementSetMessagingTimeout(element, typeReadbackMessagingTimeout)
      return element
    }
    func read<Value>(_ element: AXUIElement, _ name: String, _ convert: (CFTypeRef) -> Value?) -> ReadbackWalkRead<Value> {
      let (raw, error) = ax.copy(element, name)
      return readbackWalkRead(raw, error, convert)
    }
    func asElement(_ raw: CFTypeRef) -> AXUIElement? { CFGetTypeID(raw) == AXUIElementGetTypeID() ? timed(raw as! AXUIElement) : nil }
    func element(_ of: AXUIElement, _ name: String) -> AXUIElement? { ax.copy(of, name).value.flatMap(asElement) }
    func string(_ of: AXUIElement, _ name: String) -> String? {
      guard let raw = ax.copy(of, name).value, CFGetTypeID(raw) == CFStringGetTypeID() else { return nil }
      return (raw as! String)
    }
    let walk = ReadbackFocusWalk<AXUIElement>(children: { node in
      read(node, kAXChildrenAttribute) { raw in
        guard CFGetTypeID(raw) == CFArrayGetTypeID() else { return nil }
        return elementList(raw).map(timed)
      }
    }, isFocused: { read($0, kAXFocusedAttribute, bool) },
       role: { read($0, kAXRoleAttribute) { CFGetTypeID($0) == CFStringGetTypeID() ? ($0 as! String) : nil } })
    let marker = ReadbackMarkerReads<AXUIElement>(marked: { readbackMarkedElement($0, ax: ax).map(timed) },
                                                  classify: { readbackClass(ax.batch($0, classifyingAttributes)) },
                                                  parent: { read($0, kAXParentAttribute, asElement) },
                                                  isFocused: walk.isFocused, owned: { ax.pid($0) == pid }, same: { CFEqual($0, $1) })
    let takesMarker = markerRoute && ax.markers != nil
    func lookup(marker: ReadbackMarkerReads<AXUIElement>?) -> ReadbackFound<AXUIElement>? {
      readbackFocusedField(application: timed(AXUIElementCreateApplication(pid)), focused: { read($0, kAXFocusedUIElementAttribute, asElement) },
                           primaryWindow: { element($0, kAXFocusedWindowAttribute) ?? element($0, kAXMainWindowAttribute) },
                           walk: walk, marker: marker, unfinished: { limit.starved = true })
    }
    return ReadbackReads(focused: { lookup(marker: takesMarker ? marker : nil) }, stillFocused: { field, found in
      limit.starved = false
      return readbackStillFocused(field, found: found, again: {
        if case .field(let again, _, _)? = lookup(marker: nil) { return again }
        return nil
      }, isFocused: walk.isFocused, same: { CFEqual($0, $1) }, unfinished: { limit.starved })
    }, role: { string($0, kAXRoleAttribute) }, subrole: { field in
      let (raw, error) = ax.copy(field, kAXSubroleAttribute)
      return readbackSubrole(raw, error)
    }, value: { string($0, kAXValueAttribute) }, valueUnits: { readbackValueUnits(ax.copy($0, kAXValueAttribute).value) }, range: { element in
      guard let range = rangeWire(ax.copy(element, kAXSelectedTextRangeAttribute).value), let location = range["location"],
            let length = range["length"] else { return nil }
      return NSRange(location: location, length: length)
    }, batch: { ax.batch($0, $1) }, bound: { limit.until = $0; limit.clock = $1 })
  }
}

/// The live reads' bound (`ReadbackReads.bound`): the absolute time every AX call must finish by, or none.
private final class ReadbackBound {
  var until: Double?
  var clock: () -> Double = monotonicMilliseconds
  /// Whether a call since the last focus check began was not sent, or timed out, or a walk was left unfinished.
  var starved = false
}

/// The bounds of the walk for the focused field (`readbackFocusedByWalk`), sized from run 44022892172 (Safari 27.2, 10
/// reps): the window to its AXWebArea took 28 nodes at depth 6 in 4.7/10.9 ms p50/p95, the web area to its focused
/// AXTextField 5 nodes at depth 2 in 0.5/1.0 ms. A walk of the whole window, needed to see that only one element is
/// focused, reads more than that path; the bounds leave about 6 times the nodes, 1.5 times the depth and 3 times the
/// time of the measured path.
let typeReadbackFocusWalkNodes = 200
let typeReadbackFocusWalkDepth = 12
let typeReadbackFocusWalkMs: Double = 40
/// The roles the walk claims: the text-entry roles, and a secure field's, which the snapshot then confirms by its length
/// alone (#414), never its value.
let typeReadbackFocusWalkRoles: Set<String> = typeReadbackTextRoles.union(["AXSecureTextField"])

/// One attribute read of the walk: its value, absent (the element has none: noValue, attributeUnsupported), or failed
/// (any other error, such as cannotComplete or a timeout, or a value of the wrong type), which leaves the walk unfinished.
enum ReadbackWalkRead<Value> {
  case value(Value)
  case absent
  case failed
}

/// Two reads are the same when both are the same value, both absent or both failed (#414's quiet window compares them).
extension ReadbackWalkRead: Equatable where Value: Equatable {}

/// The reads of the walk, live or faked: an element's children, its AXFocused, its role, the clock.
struct ReadbackFocusWalk<Element> {
  var children: (Element) -> ReadbackWalkRead<[Element]>
  var isFocused: (Element) -> ReadbackWalkRead<Bool>
  var role: (Element) -> ReadbackWalkRead<String>
  var now: () -> Double = monotonicMilliseconds
}

/// What one attribute read answered, as the walk counts it, its error kept (the review of 1bac4017..45e5a5ed, P2: a failed
/// read read as an absence could hide a second focused field).
func readbackWalkRead<Value>(_ raw: CFTypeRef?, _ error: AXError, _ convert: (CFTypeRef) -> Value?) -> ReadbackWalkRead<Value> {
  switch error {
  case .success: return raw.flatMap(convert).map { .value($0) } ?? .failed
  case .noValue, .attributeUnsupported: return .absent
  default: return .failed
  }
}

/// The field typed keys reach: the application's AXFocusedUIElement, else, in its primary window (AXFocusedWindow, else
/// AXMainWindow), the one `marker`'s text-marker route finds when it is given and the application answered no focused
/// element (Safari, #395: `readbackMarkedField`), else the one the walk finds (`readbackFocusedByWalk`). A focus read
/// that failed goes to the walk alone, never the marker (ruling 1ea561bc:824). An app that is not active can answer no
/// focused element at the application (#354's A/B, run 43752829833: background Safari, 120 of 120 cells with no route 3
/// hold first). Run 44022892172 showed what answers then: the application's AXFocusedUIElement no value (-25212), the
/// windows' focus attributes unsupported (-25205), the web area's AXFocusedUIElement no value; a walk of the window for
/// the element that reads AXFocused true found the text field 10 of 10, on a page within its bounds. Only AX attributes
/// are read; nothing is activated.
func readbackFocusedField<Element>(application: Element, focused: (Element) -> ReadbackWalkRead<Element>, primaryWindow: (Element) -> Element?,
                                   walk: ReadbackFocusWalk<Element>, marker: ReadbackMarkerReads<Element>? = nil,
                                   unfinished: () -> Void = {}) -> ReadbackFound<Element>? {
  let answer = focused(application)
  if case .value(let field) = answer { return .field(field, by: .focus) }
  guard let window = primaryWindow(application) else { return nil }
  if case .absent = answer, let marker, let found = readbackMarkedField(window: window, walk: walk, marker: marker) { return found }
  // The walk read the role it claimed by, and no subrole: a password field to it is one by its role (#414).
  return readbackFocusedByWalk(window, walk, unfinished: unfinished)
    .map { .field($0.element, by: .focus, password: readbackPasswordField(role: $0.role, subrole: .absent)) }
}

/// The window walked breadth first, each element's role read: an element with a role the walk claims
/// (`typeReadbackFocusWalkRoles`) is a leaf of the walk, focused or not, its AXFocused read and its children never, so
/// nothing typed into any field is read (the review of 1bac4017..45e5a5ed, P2: a field a concealed request left, its
/// text under it, would otherwise change the reads of the identity check's walk). Any other element is walked through,
/// focused or not: after a key press Safari's AXWebArea reads AXFocused true beside its editor (run 44022892172, 10 of
/// 10). The one focused field is claimed only when the walk finished with nothing left unread: past the node or time
/// bound, a failed read, or an element at `typeReadbackFocusWalkDepth` (the window is depth 0) that has children (that
/// review's P1) leave it unfinished, and an unfinished walk, like one that found several, claims nothing, since what
/// it did not read could be another. The claim carries the role the field was claimed by. An unfinished walk says so
/// (`unfinished`), so a focus check can tell it from one that finished and found no field (#414).
func readbackFocusedByWalk<Element>(_ window: Element, _ walk: ReadbackFocusWalk<Element>,
                                    unfinished: () -> Void = {}) -> (element: Element, role: String)? {
  let started = walk.now()
  var queue: [(element: Element, depth: Int)] = [(window, 0)]
  var index = 0
  var found: (element: Element, role: String)?
  while index < queue.count {
    if index >= typeReadbackFocusWalkNodes || walk.now() - started > typeReadbackFocusWalkMs { unfinished(); return nil }
    let (element, depth) = queue[index]
    index += 1
    switch walk.role(element) {
    case .failed: unfinished(); return nil
    case .value(let role) where typeReadbackFocusWalkRoles.contains(role):
      switch walk.isFocused(element) {
      case .failed: unfinished(); return nil
      case .value(true):
        if found != nil { return nil }
        found = (element, role)
      case .value(false), .absent: break
      }
      continue
    case .value, .absent: break
    }
    switch walk.children(element) {
    case .failed: unfinished(); return nil
    case .absent: break
    case .value(let children):
      if children.isEmpty { break }
      if depth >= typeReadbackFocusWalkDepth { unfinished(); return nil }
      queue += children.map { ($0, depth + 1) }
    }
  }
  return found
}

/// AXValue copied straight from its CFString into a buffer the caller owns and zeroes (no Swift String is made of it).
/// The CFString the app's reply was decoded into is released, not overwritten: it is immutable and the process's own.
func readbackValueUnits(_ raw: CFTypeRef?) -> [UInt16]? {
  guard let raw, CFGetTypeID(raw) == CFStringGetTypeID() else { return nil }
  let string = raw as! CFString
  let length = CFStringGetLength(string)
  var units = [UInt16](repeating: 0, count: length)
  units.withUnsafeMutableBufferPointer { CFStringGetCharacters(string, CFRange(location: 0, length: length), $0.baseAddress) }
  return units
}

/// AXSubrole with its error: absent for kAXErrorNoValue and kAXErrorAttributeUnsupported, failed for any other error or
/// a value that is not a string.
func readbackSubrole(_ raw: CFTypeRef?, _ error: AXError) -> ReadbackSubrole {
  if error == .success {
    if let raw, CFGetTypeID(raw) == CFStringGetTypeID() { return .value(raw as! String) }
    return .failed
  }
  return error == .noValue || error == .attributeUnsupported ? .absent : .failed
}

/// The snapshot before the first event: the field and what may be expected of it, or why nothing can be.
enum ReadbackPlan<Element> {
  case refused(TypeReadbackReason)
  case expect(field: Element, role: String, before: String, range: NSRange, returnIsText: Bool, found: ReadbackLookup)
  /// #414: a password field, confirmed by its length from `basis`, which holds its count and range and nothing else
  /// holds them (TypeReadbackLength.swift).
  case expectLength(field: Element, role: String, basis: ReadbackLengthBasis, returnIsText: Bool, found: ReadbackLookup)

  /// Whether something is expected of the field, by its value or its length.
  var expects: Bool {
    if case .refused = self { return false }
    return true
  }

  /// Whether the field takes a Return as text (`readbackReturnIsText`).
  var returnIsText: Bool {
    switch self {
    case .refused: return false
    case .expect(_, _, _, _, let returnIsText, _), .expectLength(_, _, _, let returnIsText, _): return returnIsText
    }
  }
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
  var secure = false
  return readbackSnapshot(reads: reads, settle: &settle, baseline: nil, waited: &waited, secure: &secure)
}

/// #414: `secure` is set once the field is found to be a password field (`readbackPasswordField`), which the snapshot
/// then takes by its length (`readbackLengthSnapshot`), whether or not it then refuses it, or as soon as the lookup took
/// it for one (`ReadbackFound.field`'s `password`), whatever the snapshot's own reads then find. A field the lookup took
/// for a password field is refused `selectionChanged` under a select_text baseline before any read of it, its role
/// included, so nothing is typed (`readbackLengthSnapshot` says why); one whose own role and subrole now read as none (a
/// page's show-password toggle in between) is refused `noLongerSecure`, as the poll refuses it, and nothing more is
/// read: it may now show its text.
func readbackSnapshot<Element>(reads: ReadbackReads<Element>, settle: inout ReadbackSettle?, baseline: BaselineWait?,
                               waited: inout RangeWait?, secure: inout Bool) -> ReadbackPlan<Element> {
  let field: Element, found: ReadbackLookup, classified: Bool
  switch reads.focused() {
  case nil: return .refused(.noFocusedElement)
  case .closed(let reason)?: return .refused(reason)  // the marker route's classification: nothing more is read
  case .field(let element, let by, let password)?: (field, found, classified) = (element, by, password)
  }
  if classified {
    secure = true
    if case .selection? = baseline { return .refused(.selectionChanged) }
  }
  guard let role = reads.role(field) else { return .refused(.roleUnreadable) }
  let subrole = reads.subrole(field)
  if classified, !readbackPasswordField(role: role, subrole: subrole) { return .refused(.noLongerSecure) }
  if readbackSecure(role: role, subrole: subrole) {
    // #414: a password field is confirmed by its length; any other element closed is refused unread, as before.
    guard readbackPasswordField(role: role, subrole: subrole) else { return .refused(.secure) }
    secure = true
    return readbackLengthSnapshot(field: field, role: role, returnIsText: readbackReturnIsText(role: role, subrole: subrole), found: found,
                                  reads: reads, settle: &settle, baseline: baseline, waited: &waited)
  }
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
  return .expect(field: field, role: role, before: before, range: range, returnIsText: readbackReturnIsText(role: role, subrole: subrole),
                 found: found)
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
  /// A password field's record (#414): `secure: true`, and on a success a length check confirmed the confirmation's
  /// strength, `confirmation: "length"` (ruling 1ea561bc:833; a confirmed record without it is the exact read-back of a
  /// field's value, or with `secure`, keys alone), with the request's own keys as above; never its reads, poll time,
  /// lengths, settle or wait, so nothing on the wire is a count, a range or a time that depends on them.
  var secure = false
  /// Whether a length check confirmed (`confirmLength`), which alone puts `confirmation: "length"` on the wire. A literal
  /// request of keys alone (a Tab, a Return in a single-line field) makes none: it is confirmed as a plain field's
  /// keys-only request is, its keys unconfirmed. Never on the wire itself.
  var lengthConfirmed = false
  /// A concealed password-field failure whose reply came after its deadline (a read that overran its timeout; #414,
  /// the review of 1f69470e..f217f062): a fixed flag on the secure wire, never a duration.
  var lateReply = false

  var wire: [String: Any] {
    var wire: [String: Any] = ["confirmed": confirmed, "snapshotMs": (snapshotMs * 10).rounded() / 10]
    if let reason { wire["reason"] = reason.rawValue }
    if secure {
      wire["secure"] = true
      if confirmed, lengthConfirmed { wire["confirmation"] = "length" }
      if concealed { wire["concealed"] = true }
      if keysUnconfirmed > 0 { wire["keysUnconfirmed"] = concealed ? true as Any : keysUnconfirmed as Any }
      if !concealed, checkpoints > 0 { wire["checkpoints"] = checkpoints }
      if stoppedBeforeKey { wire["stoppedBeforeKey"] = true }
      if lateReply { wire["lateReply"] = true }
      return wire
    }
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
    var secure = false
    plan = readbackSnapshot(reads: reads, settle: &settled, baseline: baseline, waited: &waited, secure: &secure)
    record.secure = secure
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
    guard plan.expects else { return }
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

  /// After the last event: success, or `typeUnconfirmed`. Every time of the read-back counts from one origin, B,
  /// `postedAt`: the last successful post, on the read-back's clock (the review of 1f69470e..f217f062). From it, the
  /// poll's cutoff C = B + `typeReadbackBudgetMs`, which is also the final focus read's start, and the reply deadline
  /// D = C + `typeReadbackFocusReadCapMs`. A concealed request into a password field (a secure record) answers every
  /// failure, a snapshot refusal after posting included, at D (the review of cbce12e2..1f69470e, P1 and P2): whether and
  /// when a field closes, refuses or loses its match can depend on the secret in some field, so no failure's time may.
  /// The wait is against the clock, so a sleep that wakes early cannot end it. A reply sent more than
  /// `typeReadbackWakeToleranceMs` past D, after a read that overran its timeout or a sleep that woke late, carries
  /// `lateReply`, a fixed flag: the residual. Failures found during delivery (an input-source change, an intervention,
  /// an event not made) throw before this and answer at once: #354's path, outside the deadline. Its success, and a
  /// plain field's concealed request (#354's), answer as before.
  func finish(postedAt: Double? = nil) throws {
    // The one origin (the review of 1f69470e..f217f062): B, the last post (`keyTextReadBack`), and from it the poll's
    // cutoff C and the reply deadline D.
    let boundary = postedAt ?? reads.now()
    let cutoff = boundary + typeReadbackBudgetMs, deadline = cutoff + typeReadbackFocusReadCapMs
    do {
      guard plan.expects else { throw typeUnconfirmed(record.reason ?? .valueUnreadable) }
      // A concealed request is always read back once, whatever its keys, so its number of waits is always one.
      if unchecked || concealed { try confirm(through: units.count, beforeKey: false, cutoff: cutoff, deadline: deadline) }
    } catch {
      if concealed, record.secure {
        while reads.now() < deadline { reads.sleep(deadline - reads.now()) }
        // A read that overran its timeout, or a sleep that woke late, past the tolerance: flagged, with no duration
        // (the review of f217f062..45172367, 5).
        if reads.now() - deadline > typeReadbackWakeToleranceMs { record.lateReply = true }
        record.pollMs = reads.now() - boundary
      }
      throw error
    }
    record.keysUnconfirmed = units.filter(leaves).count
    record.confirmed = true
    record.reason = nil
  }

  /// Whether a unit's key can leave the field or submit it: any keyed control character but a Return in a field that
  /// takes it as text.
  private func leaves(_ unit: TypedUnit) -> Bool {
    guard readbackKey(unit) else { return false }
    if unit.text == [0x0D], plan.returnIsText { return false }
    return true
  }

  /// #414: polls a password field's length batch until one reply confirms units `0..<end` typed over its snapshot
  /// (`readbackLengthJudged`), then checks the field is still the focus. Every time is absolute, passed in: `cutoff`
  /// (C) ends the batches, and `deadline` (D) bounds a concealed request's final focus read; `finish` takes both from
  /// B, the last post (the review of 1f69470e..f217f062), and a literal checkpoint takes its own C from its start. The
  /// count and range never leave this function: only the reason does. A concealed request never answers `caretMismatch`:
  /// a field that ignored a secret typed over a selection keeps its count and range, so the count would match exactly
  /// when the secret is as long as the selection, and the reason would tell its length; its caret is `lengthMismatch`,
  /// as its count is. A literal request keeps the two reasons apart.
  ///
  /// A reply that matches confirms only once the same reply (the same count and range; with the caret's basis, still no
  /// count and the same range) has held for the quiet window, `typeReadbackLengthDwellMs` (ruling 1ea561bc:842), read
  /// at the poll's own interval. The hosted qualification found an app whose extra character, put in before the first
  /// key, made a reply between its last two keys match. A genuine field never moves away from a final match: once it has
  /// taken every key nothing changes it, and before that none of its readings equals the expected one, because its caret
  /// has not yet reached the end of the text (and, from an empty field read without a range, its count is still short of
  /// the text's length). So a reading that matches and then changes means a character was added or dropped.
  ///
  /// Bounded work: each read runs under a messaging timeout of the time left to its limit (`ReadbackReads.bound`), and
  /// none starts with less than `messagingTimeoutFloorMs` left to it. A reply counts toward a success only if it
  /// finished by its limit, its window timed from read starts.
  ///
  /// A literal request's batches run to C and it ends early on success, on a reply that leaves a held match, on a reply
  /// past where a genuine field can be (`readbackLengthOvershoots`), and on a closed reply; then its focus is checked,
  /// as before. A concealed request's two final observations have fixed slots from B, whatever a match did (the review
  /// of f217f062..45172367, 1 and 2): the final batch at C − the floor, bounded by C, and the final focus read at C,
  /// bounded by D. Its regular batches, and a focus check at a match, end by the final batch's slot, and no other read
  /// takes either slot. So a field must take the text within the final slot less the window: 730 ms of B. A concealed
  /// request ends early only on success: held for the window by a regular batch, and a focus check there passing. A
  /// check that cannot start with the floor left before the final slot is not made: the final batch and the final
  /// focus read then decide the success as well. A reply that leaves a held match, a focus check that fails, or a
  /// closed reply (which ends the regular batches) taints it, so it never confirms. Every concealed failure's reason is
  /// a function only of the final batch and the final focus read (`readbackConcealedReason`); `finish` answers it at D.
  private func confirmLength(through end: Int, beforeKey: Bool, cutoff: Double, deadline: Double) throws {
    guard case .expectLength(let field, let role, let basis, _, let found) = plan else { return }
    let typed = units[0..<end].reduce(0) { leaves($1) ? $0 : $0 + readbackLengthUnits($1) }  // a key that can leave adds nothing
    let entered = reads.now()
    defer { record.pollMs += reads.now() - entered }
    func focused(within until: Double) -> ReadbackFocus {
      reads.bound(until, reads.now)
      defer { reads.bound(nil, reads.now) }
      return reads.stillFocused(field, found)
    }
    let finalSlot = cutoff - messagingTimeoutFloorMs
    let limit = concealed ? finalSlot : cutoff  // where the regular batches end
    var final: ReadbackFinalBatch?
    // The held match: its reply, and the end of the read that took it. A later read that starts at least the window
    // after it and still finds the same reply shows the reply held that long.
    var held: (count: ReadbackWalkRead<Int>, range: NSRange?, since: Double)?
    var tainted = false  // a concealed request whose reply left a held match, or whose focus failed at one: it never confirms
    // One length batch, bounded by `until`, judged against the held match.
    func step(until: Double) -> ReadbackLengthStep {
      let at = reads.now()
      reads.bound(until, reads.now)
      let answer = readbackLength(field, role: role, reads: reads)
      reads.bound(nil, reads.now)
      let done = reads.now()
      switch answer {
      case .closed(let why):
        final = .closed(why)
        return .closed(why)
      case .read(let count, let range):
        var judged = readbackLengthJudged(count: count, range: range, basis: basis, typed: typed)
        record.reads += 1
        defer { final = .read(judged) }
        if let match = held {
          if count == match.count, range == match.range {
            return at - match.since >= typeReadbackLengthDwellMs && done <= until ? .holds : .goesOn
          }
          // A changed reply that still judges confirmed differs only by a range its basis (an empty field read without
          // one) never checks: its caret moved.
          if judged == .confirmed { judged = .caretElsewhere }
          held = nil
          if concealed { tainted = true }
          return .changed
        }
        if judged == .confirmed {
          if !tainted { held = (count, range, done) }
        } else if judged != .unreadable, readbackLengthOvershoots(count: count, range: range, basis: basis, typed: typed) {
          // A failed count read is no evidence either way; a readable reply past any genuine field's is.
          return .overshoots
        }
        return .goesOn
      }
    }
    var confirmed = false
    poll: while limit - reads.now() >= messagingTimeoutFloorMs {
      switch step(until: limit) {
      case .closed(let why):
        guard concealed else { throw unconfirmed(why, beforeKey) }
        tainted = true
        held = nil
        break poll  // read no further until the final batch
      case .holds:
        guard concealed else { confirmed = true; break poll }
        // A focus check at the match only if it can end before the final slot; else the final focus read decides.
        if finalSlot - reads.now() >= messagingTimeoutFloorMs {
          if focused(within: finalSlot) == .focused {
            record.lengthConfirmed = true
            return
          }
          tainted = true
          held = nil
        }
      case .changed, .overshoots:
        if !concealed { break poll }  // a concealed request never ends on one: its schedule would tell the secret
      case .goesOn: break
      }
      // No sleep after the last batch: the next could not start with the floor left.
      if limit - (reads.now() + typeReadbackPollIntervalMs) < messagingTimeoutFloorMs { break }
      reads.sleep(typeReadbackPollIntervalMs)
    }
    guard concealed else {
      // A focus that moved is fieldChanged; one not known never confirms, and the reply's length reason stands.
      let focus = reads.stillFocused(field, found)
      if focus == .moved { throw unconfirmed(.fieldChanged, beforeKey) }
      if confirmed, focus == .focused {
        record.lengthConfirmed = true
        return
      }
      switch final {
      // A match that never held for the window (too late before the cutoff), or held with its focus unknown.
      case .read(.confirmed)?, .read(.differs)?: throw unconfirmed(.lengthMismatch, beforeKey)
      case .read(.caretElsewhere)?: throw unconfirmed(.caretMismatch, beforeKey)
      case .read(.unreadable)?, .closed?, nil: throw unconfirmed(.lengthUnreadable, beforeKey)
      }
    }
    // The final batch at its slot, bounded by C; then the final focus read at C, with its own budget, the cap: bounded
    // by D, or, if a read before it overran past C, by its own start + the cap, so nothing before it eats its time (the
    // reply is then late, flagged by `finish`). It reads the app's focus, never the field. Each waits against the clock
    // for its slot.
    while reads.now() < finalSlot { reads.sleep(finalSlot - reads.now()) }
    var holds = false
    if case .holds = step(until: cutoff) { holds = true }
    while reads.now() < cutoff { reads.sleep(cutoff - reads.now()) }
    let focus = focused(within: max(deadline, reads.now() + typeReadbackFocusReadCapMs))
    if holds, focus == .focused {
      record.lengthConfirmed = true
      return
    }
    throw unconfirmed(readbackConcealedReason(finalBatch: final, focus: focus), beforeKey)
  }

  /// Polls for the snapshot with its selection replaced by units `0..<end`, then checks the field is still the focus. A
  /// password field's length confirmation takes `cutoff` and `deadline` from `finish`, or (a literal checkpoint) its own
  /// cutoff from its start.
  private func confirm(through end: Int, beforeKey: Bool, cutoff: Double? = nil, deadline: Double? = nil) throws {
    if case .expectLength = plan {
      let cutoff = cutoff ?? reads.now() + typeReadbackBudgetMs
      return try confirmLength(through: end, beforeKey: beforeKey, cutoff: cutoff, deadline: deadline ?? cutoff + typeReadbackFocusReadCapMs)
    }
    guard case .expect(let field, let role, let before, let range, let returnIsText, let found) = plan else { return }
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
    // Still the field, asked as it was found and never through the marker (#395, ruling 1ea561bc:824): no marker call
    // follows delivered text, whose offset it would carry.
    guard reads.stillFocused(field, found) == .focused else { throw unconfirmed(.fieldChanged, beforeKey) }  // #354's: an unknown focus, as before
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
  // B, the read-back's origin (#414): the instant the last key event was posted, on the read-back's clock, taken where
  // the posting stamps `endedAt` (`InputMeta.posting`), so its deadline counts from what an observer sees; the
  // key-ups, pauses and work after it never move it.
  var lastPost: Double?
  try keyText(units, concealed: concealed, checkSource: checkSource, beforeUnit: readback.beforeUnit,
              checkIntervention: checkIntervention, post: { event in
                guard post(event) else { return false }
                lastPost = reads.now()
                return true
              }, pause: pause, meta: &meta)
  try readback.finish(postedAt: lastPost)
  // #414, ruling 833: a password field's success says what its length proves and what it cannot, once a length check
  // confirmed; keys alone confirm none.
  if readback.record.secure, readback.record.lengthConfirmed { meta.note = readbackLengthNote }
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
  case .secure: why = "the focused element is a secure element that is not a text field, which is never read back"
  case .becameSecure: why = "the field turned into a password field while the text was typed, so it was read no further"
  case .lengthUnreadable: why = "the password field's length could not be read, and its text never is"
  case .selectionUnreadable: why = "the password field's selection could not be read while it held text, so its length cannot show what the text replaced"
  case .lengthMismatch: why = "the password field's length or caret is not what the text should have made it, so a character may have been dropped or added, or the text gone in elsewhere"
  case .caretMismatch: why = "the password field's caret is not right after the text, so the text may have gone in elsewhere"
  case .noLongerSecure: why = "the password field turned into another kind of field while the text was typed, so it was read no further"
  case .noFocusedElement: why = "no focused field could be found to read back"
  case .notTextField: why = "the focused element is not a text field"
  case .roleUnreadable, .fieldUnreadable, .valueUnreadable, .rangeUnreadable: why = "the field's text could not be read back"
  case .possiblyTruncated: why = "the field holds more text than accessibility reports in full"
  case .fieldChanged: why = "the focused field changed while the text was typed"
  case .selectionChanged: why = "the field's selection changed after selectText"  // answered above
  }
  let sent = beforeKey ? "The text before a Return or Tab was typed, but \(why), so the key and the text after it were not sent. Some of the text may have gone in"
    : "The text was typed, but \(why), so it is not confirmed and some or all of it may have gone in"
  // A password field's (#414): an observation shows only that it is one, its text never. One that stopped being a
  // password field (a show-password toggle) may now show its text to either observation.
  let remedy: String
  if reason == .noLongerSecure {
    remedy = "The field may now show its text, so if it holds a secret, do not take a screenshot of it or call getAXState(); put it right with setValue, and do not type the text again."
  } else if [.lengthUnreadable, .selectionUnreadable, .lengthMismatch, .caretMismatch].contains(reason) {
    remedy = "Observe the field before going on (a screenshot shows its masked characters; getAXState() shows only that it is a password field), then use setValue to put it right; do not type the text again."
  } else {
    remedy = "Observe the field with getAXState() before going on, then use setValue to put it right; do not type the text again."
  }
  var message = "\(sent). \(remedy)"
  if let excerpt {
    message += " From character \(excerpt.start + 1), expected \(readbackQuoted(excerpt.expected)); the field reads \(readbackQuoted(excerpt.actual)). The expected text is \(excerpt.expectedLength) characters long, the field's \(excerpt.actualLength)."
  }
  return EngineError(name: "typeUnconfirmed", message)
}
