import ApplicationServices
import Foundation

// type_text's read-back of a password field by its length (#414; the design session's rulings 1ea561bc:826, which applies
// paste's ruling 808 to type_text, 833 on what its success says and 839 on a field that has no count; the native engine
// spec's Decision Log, the #414 entry). TypeReadback.swift takes the snapshot and confirms; this file says what a
// password field is, what one read of it is, what its starting point allows and what one read proves.
//
// Nothing here formats, logs, keeps or emits a count or a range: they are compared, and only a reason or the
// confirmation leaves the read-back.

/// Whether a field is a password field the read-back confirms by its length: #405's classification
/// (`valueClassification`) of its role and subrole says secure (AXSecureTextField by role or subrole, or a text-entry role
/// whose subrole cannot be read), its role is read, and that role is a field's (a text-entry role, or AXSecureTextField).
/// Any other element the classification closes is refused unread (`secure`).
func readbackPasswordField(role: String, subrole: ReadbackSubrole) -> Bool {
  var read = AttributeRead()
  read.values[kAXRoleAttribute] = role as CFString
  switch subrole {
  case .value(let found): read.values[kAXSubroleAttribute] = found as CFString
  case .absent: break
  case .failed: read.unreadable.insert(kAXSubroleAttribute)
  }
  return typeReadbackFocusWalkRoles.contains(role) && valueClassification(read).secure
}

/// A password field's one read: its role and subrole, which classify it in the same reply (ruling 1ea561bc:811's batch
/// rule), its selected range and its character count: the attributes paste's effect reading takes (#405, ruling 808).
let readbackLengthAttributes = classifyingAttributes + [kAXSelectedTextRangeAttribute, kAXNumberOfCharactersAttribute]

/// A batch reply's role: nil when its slot failed, is absent or is not a string.
func readbackBatchRole(_ read: AttributeRead) -> String? {
  guard !read.unreadable.contains(kAXRoleAttribute), let raw = read.values[kAXRoleAttribute], CFGetTypeID(raw) == CFStringGetTypeID() else { return nil }
  return (raw as! String)
}

/// What one length read found (`readbackLength`): that the field is read no further, and why; or its count, split as the
/// walk splits a read (a value; absent, the attribute unsupported or without a value; failed, any other error, or a
/// value that is not a non-negative integer within `readbackLengthLimit`: a floating-point number, which `intValue`
/// would truncate, is a failed read, and so is a count past the limit, which is no field's), and its selected range,
/// nil when it could not be read. So the snapshot's refusal of a failed count, the settle's and the poll's all take a
/// count past the limit as the failed read it is.
enum ReadbackLength {
  case closed(TypeReadbackReason)
  case read(count: ReadbackWalkRead<Int>, range: NSRange?)
}

/// One length read of a password field: the batch, classified from its own reply. A failed request or an unreadable
/// role is `fieldUnreadable`; a reply that is no longer a password field (`readbackPasswordField`'s rule) is
/// `noLongerSecure`; one with another role is `fieldChanged`. The count's slot keeps its error as the batch reported it
/// (`fetchAttributes`: a slot whose error is not the attribute's absence is unreadable).
func readbackLength<Element>(_ field: Element, role: String, reads: ReadbackReads<Element>) -> ReadbackLength {
  guard let read = reads.batch(field, readbackLengthAttributes), let seenRole = readbackBatchRole(read) else { return .closed(.fieldUnreadable) }
  guard typeReadbackFocusWalkRoles.contains(seenRole), valueClassification(read).secure else { return .closed(.noLongerSecure) }
  guard seenRole == role else { return .closed(.fieldChanged) }
  let count: ReadbackWalkRead<Int>
  if read.unreadable.contains(kAXNumberOfCharactersAttribute) {
    count = .failed
  } else if let raw = read.values[kAXNumberOfCharactersAttribute] {
    let number = CFGetTypeID(raw) == CFNumberGetTypeID() && !CFNumberIsFloatType((raw as! CFNumber)) ? (raw as! NSNumber).intValue : -1
    count = number >= 0 && number <= readbackLengthLimit ? .value(number) : .failed
  } else {
    count = .absent
  }
  var range: NSRange?
  if let wire = rangeWire(read.values[kAXSelectedTextRangeAttribute]), let location = wire["location"], let length = wire["length"] {
    range = NSRange(location: location, length: length)
  }
  return .read(count: count, range: range)
}

/// What a password field's confirmation stands on, from its snapshot: its count, with its range when that was read;
/// or (ruling 1ea561bc:839) its caret alone, where the field has no count.
enum ReadbackLengthBasis: Equatable {
  case count(Int, range: NSRange?)
  case caret(NSRange)
}

/// What a starting point allows (`readbackLengthBasis`): a basis to confirm from, or why there is none.
enum ReadbackLengthStart: Equatable {
  case basis(ReadbackLengthBasis)
  case refused(TypeReadbackReason)
}

/// The largest count, and caret location of the caret's basis, a field is taken to have: Int32's maximum, far past any
/// field's text. Past it the read is no field's (`NSNotFound` is Int.max), and under it the sums the confirmation makes
/// of the basis and the typed text (`readbackLengthJudged`), the text bounded by the request, cannot overflow.
let readbackLengthLimit = Int(Int32.max)

/// The one decision of what a password field's starting point allows. A count read that failed allows nothing
/// (`lengthUnreadable`); a count past `readbackLengthLimit` is such a read (`readbackLength`), and the guard here only
/// restates that invariant where the confirmation's sums depend on it. A count allows its own confirmation, with a range
/// that lies inside it, and with no range only from an empty field, where nothing can be replaced and the caret can only
/// sit at 0 (else `selectionUnreadable`). No count at all (absent: the attribute unsupported, never a read that failed)
/// allows the caret alone (ruling 839), from a selection that was read, is empty and lies within the limit; anything
/// else stays `lengthUnreadable`.
func readbackLengthBasis(count: ReadbackWalkRead<Int>, range: NSRange?) -> ReadbackLengthStart {
  switch count {
  case .failed: return .refused(.lengthUnreadable)
  case .absent:
    guard let range, range.location >= 0, range.location <= readbackLengthLimit, range.length == 0 else { return .refused(.lengthUnreadable) }
    return .basis(.caret(range))
  case .value(let before):
    guard before <= readbackLengthLimit else { return .refused(.lengthUnreadable) }  // an invariant: no read's count is past it
    guard let range else { return before == 0 ? .basis(.count(0, range: nil)) : .refused(.selectionUnreadable) }
    guard range.location >= 0, range.length >= 0, range.location <= before, range.length <= before - range.location else {
      return .refused(.selectionUnreadable)
    }
    return .basis(.count(before, range: range))
  }
}

/// What a password field's length takes from a typed unit: its UTF-16 units, as AX counts characters and ranges. A
/// Return's unit is its one CR (a CR LF too), which a field that takes it as text takes as one newline; in one that
/// does not, it is a key that adds nothing and is never counted.
func readbackLengthUnits(_ unit: TypedUnit) -> Int { unit.text.count }

/// What one length read shows against the basis, `typed` units typed over its selection.
enum ReadbackLengthRead: Equatable {
  /// No count where the basis has one, or (the caret's basis) a count that is no longer absent.
  case unreadable
  /// A count other than the expected one.
  case differs
  /// The expected count (or, with no count, the caret alone), but the caret not right after the text.
  case caretElsewhere
  case confirmed
}

/// Confirmed when the count is exactly the basis's less its selection plus `typed` and, whenever the snapshot read a
/// range, the caret reads {location + typed, 0} in the same reply, whatever the selection held: a lagging caret then
/// answers the same whether or not a secret is as long as the selection it replaced. With the caret's basis (ruling
/// 839), the caret alone, the count still absent. The basis lies within `readbackLengthLimit`, so neither sum overflows;
/// the read itself is only compared.
func readbackLengthJudged(count: ReadbackWalkRead<Int>, range: NSRange?, basis: ReadbackLengthBasis, typed: Int) -> ReadbackLengthRead {
  let caret: NSRange?
  switch basis {
  case .count(let before, let selection):
    guard case .value(let now) = count else { return .unreadable }
    guard now == before - (selection?.length ?? 0) + typed else { return .differs }
    caret = selection.map { NSRange(location: $0.location + typed, length: 0) }
  case .caret(let start):
    guard case .absent = count else { return .unreadable }
    caret = NSRange(location: start.location + typed, length: 0)
  }
  if let caret, range != caret { return .caretElsewhere }
  return .confirmed
}

/// Whether a read is past where a genuine field can ever be, so the poll ends at it (#414, the hosted qualification's
/// fix): a caret whose location is past the text's end, since a genuine caret rises from the selection's start to
/// location + typed and never beyond; or, from a basis with nothing selected (an empty range, or an empty field read
/// without one), a count past the expected one. Over a non-empty selection a count past the expected one is no
/// overshoot: until the app takes the first key a genuine field's count is the snapshot's own, past the expected count
/// whenever the selection is longer than the text, and ending on it would fail a genuine field and tell, by the reply's
/// time, whether a secret is shorter than the selection. Only a literal request's poll ends on an overshoot
/// (`confirmLength`): each form compares with a value that depends on the text's length. A caret past
/// `readbackLengthLimit` (`{NSNotFound, 0}`, an app's unavailable caret) is never one, on either basis: it is judged as
/// any read and the poll goes on (the review of f35a42b8..cbce12e2, P2).
func readbackLengthOvershoots(count: ReadbackWalkRead<Int>, range: NSRange?, basis: ReadbackLengthBasis, typed: Int) -> Bool {
  switch basis {
  case .count(let before, let selection):
    if let selection, let range, range.location <= readbackLengthLimit, range.location > selection.location + typed { return true }
    guard (selection?.length ?? 0) == 0, case .value(let now) = count else { return false }
    return now > before - (selection?.length ?? 0) + typed
  case .caret(let start):
    guard let range, range.location <= readbackLengthLimit else { return false }
    return range.location > start.location + typed
  }
}

/// A password field's snapshot, after its role and subrole: #359's wait for a stable range and the settle, as a text
/// field takes them, each read the length batch; then the starting point (`readbackLengthBasis`).
///
/// A wait for select_text's range is refused `selectionChanged` before any read, so nothing is typed: under #359's rule
/// type_text right after select_text types only over select_text's selection, and a password field never holds one,
/// since select_text refuses it (`selectTextSecure`) and the range ClickOrdering keeps per process is then another
/// field's. A count read that fails at the snapshot is refused `lengthUnreadable` before the settle, whose next read
/// could otherwise agree with it as no count at all and leave the caret alone to confirm (ruling 839 takes only an
/// absent count for that).
func readbackLengthSnapshot<Element>(field: Element, role: String, returnIsText: Bool, found: ReadbackLookup, reads: ReadbackReads<Element>,
                                     settle: inout ReadbackSettle?, baseline: BaselineWait?, waited: inout RangeWait?) -> ReadbackPlan<Element> {
  if case .selection? = baseline { return .refused(.selectionChanged) }
  if baseline == .stable {
    var closed: TypeReadbackReason?
    waited = awaitRange(RangeGoal<NSRange>.stable, read: {
      switch readbackLength(field, role: role, reads: reads) {
      case .closed(let why): closed = why; return .closed
      case .read(_, let range): return range.map { .sample($0) } ?? .unread
      }
    }, now: reads.now, sleep: reads.sleep)
    if let closed { return .refused(closed) }
  }
  var count: ReadbackWalkRead<Int>, range: NSRange?
  switch readbackLength(field, role: role, reads: reads) {
  case .closed(let why): return .refused(why)
  case .read(let read, let selection): (count, range) = (read, selection)
  }
  if case .failed = count { return .refused(.lengthUnreadable) }
  if var settled = settle {
    defer { settle = settled }
    if let closed = readbackLengthSettle(field, role: role, reads: reads, count: &count, range: &range, record: &settled) { return .refused(closed) }
  }
  switch readbackLengthBasis(count: count, range: range) {
  case .refused(let why): return .refused(why)
  case .basis(let basis): return .expectLength(field: field, role: role, basis: basis, returnIsText: returnIsText, found: found)
  }
}

/// The settle (ruling 1ea561bc:754) of a password field's snapshot: its length batch read again every interval until a
/// read agrees with the one before it, or the cap allows no further interval; `count` and `range` end as the last read.
/// A count read that fails is `lengthUnreadable` at that read, as at the snapshot, so no read agrees with a failure:
/// `number` compares a count or no count, never a failed read.
func readbackLengthSettle<Element>(_ field: Element, role: String, reads: ReadbackReads<Element>, count: inout ReadbackWalkRead<Int>,
                                   range: inout NSRange?, record: inout ReadbackSettle) -> TypeReadbackReason? {
  func number(_ read: ReadbackWalkRead<Int>) -> Int? {
    if case .value(let value) = read { return value }
    return nil
  }
  let started = reads.now()
  while reads.now() - started + typeReadbackSettleIntervalMs <= typeReadbackSettleCapMs {
    reads.sleep(typeReadbackSettleIntervalMs)
    switch readbackLength(field, role: role, reads: reads) {
    case .closed(let why): return why
    case .read(.failed, _): return .lengthUnreadable
    case .read(let next, let nextRange):
      record.reads += 1
      let agrees = number(next) == number(count) && nextRange == range
      count = next
      range = nextRange
      if agrees { return nil }
    }
  }
  record.capped = true
  return nil
}

/// The note a password field's confirmation carries to the model (the result's `note`; ruling 833): what a length
/// confirms and what it cannot. Fixed text, the same for every request, plain or concealed.
let readbackLengthNote = "Typed into a password field, confirmed by its length only: the field took exactly as many characters as were typed, in place of any selected text, so none was dropped or added. A password field's characters are never read, so whether they are the right ones is not confirmed: a keyboard layout, an input method or the page itself can change what goes in."
