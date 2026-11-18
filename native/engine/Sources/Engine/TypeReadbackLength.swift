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
/// value that is not a non-negative number), and its selected range, nil when it could not be read.
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
    let number = CFGetTypeID(raw) == CFNumberGetTypeID() ? (raw as! NSNumber).intValue : -1
    count = number >= 0 ? .value(number) : .failed
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

/// The one decision of what a password field's starting point allows. A count read that failed allows nothing
/// (`lengthUnreadable`). A count allows its own confirmation, with a range that lies inside it, and with no range only
/// from an empty field, where nothing can be replaced and the caret can only sit at 0 (else `selectionUnreadable`). No
/// count at all (absent: the attribute unsupported, never a read that failed) allows the caret alone (ruling 839), from
/// a selection that was read and is empty; anything else stays `lengthUnreadable`.
func readbackLengthBasis(count: ReadbackWalkRead<Int>, range: NSRange?) -> ReadbackLengthStart {
  switch count {
  case .failed: return .refused(.lengthUnreadable)
  case .absent:
    guard let range, range.location >= 0, range.length == 0 else { return .refused(.lengthUnreadable) }
    return .basis(.caret(range))
  case .value(let before):
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
/// 839), the caret alone, the count still absent.
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

/// A password field's snapshot, after its role and subrole: #359's wait and the settle, as a text field takes them, each
/// read the length batch; then the starting point (`readbackLengthBasis`), which must still be select_text's range when
/// the wait was for it.
func readbackLengthSnapshot<Element>(field: Element, role: String, returnIsText: Bool, found: ReadbackLookup, reads: ReadbackReads<Element>,
                                     settle: inout ReadbackSettle?, baseline: BaselineWait?, waited: inout RangeWait?) -> ReadbackPlan<Element> {
  if let baseline {
    var closed: TypeReadbackReason?
    let goal: RangeGoal<NSRange>
    switch baseline {
    case .stable: goal = .stable
    case .selection(let written): goal = .equals(written)
    }
    let wait = awaitRange(goal, read: {
      switch readbackLength(field, role: role, reads: reads) {
      case .closed(let why): closed = why; return .closed
      case .read(_, let range): return range.map { .sample($0) } ?? .unread
      }
    }, now: reads.now, sleep: reads.sleep)
    waited = wait
    if let closed { return .refused(closed) }
    if case .selection = baseline, !wait.met { return .refused(.selectionChanged) }
  }
  var count: ReadbackWalkRead<Int>, range: NSRange?
  switch readbackLength(field, role: role, reads: reads) {
  case .closed(let why): return .refused(why)
  case .read(let read, let selection): (count, range) = (read, selection)
  }
  if var settled = settle {
    defer { settle = settled }
    if let closed = readbackLengthSettle(field, role: role, reads: reads, count: &count, range: &range, record: &settled) { return .refused(closed) }
  }
  if case .selection(let written) = baseline, range != written { return .refused(.selectionChanged) }
  switch readbackLengthBasis(count: count, range: range) {
  case .refused(let why): return .refused(why)
  case .basis(let basis): return .expectLength(field: field, role: role, basis: basis, returnIsText: returnIsText, found: found)
  }
}

/// The settle (ruling 1ea561bc:754) of a password field's snapshot: its length batch read again every interval until a
/// read agrees with the one before it, or the cap allows no further interval; `count` and `range` end as the last read.
/// A count read that fails is `lengthUnreadable`, as at the snapshot.
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
