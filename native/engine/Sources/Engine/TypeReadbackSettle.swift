import Foundation

// The settle before type_text's snapshot (#354; the design session's ruling 1ea561bc:754, the native engine spec's
// Decision Log, the #354 entry, item 10.15). TypeReadback.swift takes the snapshot; this file says when it settles and how.

/// The settle before the snapshot (the design session's ruling 1ea561bc:754 on run 44001080688: Firefox's race cells
/// answered unconfirmed 170 of 240 times over the right text, the key's effect landing between the snapshot and the
/// typing). After a key or chord posted to the app within `typeReadbackSettleWindowMs`, the snapshot's value and selected
/// range are read again every `typeReadbackSettleIntervalMs` until two reads in a row agree, for at most
/// `typeReadbackSettleCapMs`, and the snapshot is the last read. Otherwise it is taken at once, as before.
let typeReadbackSettleWindowMs: Double = 1_000
let typeReadbackSettleIntervalMs: Double = 15
let typeReadbackSettleCapMs: Double = 100

/// What the settle before the snapshot did: the reads after the first, and whether the cap ended it before two agreed.
struct ReadbackSettle: Equatable {
  var reads = 0
  var capped = false
}

/// The settle (ruling 1ea561bc:754): the field's value and selected range read again every interval, its role and
/// subrole checked before each read as the poll checks them, until a read agrees with the one before it or the cap
/// allows no further interval; `before` and `range` end as the last read. Nil, or why the field is read no further.
/// Typing still follows the snapshot, so a later snapshot cannot make a success false: it only lets the expected value
/// include an earlier key's effect that had not shown yet.
func readbackSettle<Element>(_ field: Element, role: String, reads: ReadbackReads<Element>, before: inout String, range: inout NSRange,
                             record: inout ReadbackSettle) -> TypeReadbackReason? {
  let started = reads.now()
  while reads.now() - started + typeReadbackSettleIntervalMs <= typeReadbackSettleCapMs {
    reads.sleep(typeReadbackSettleIntervalMs)
    if let closed = readbackFieldClosed(field, role: role, reads: reads) { return closed }
    guard let value = reads.value(field) else { return .valueUnreadable }
    guard let next = reads.range(field) else { return .rangeUnreadable }
    record.reads += 1
    let agrees = value.utf16.elementsEqual(before.utf16) && next == range
    before = value
    range = next
    if agrees { return nil }
  }
  record.capped = true
  return nil
}

/// The keys and chords press_key posted, by the app's pid, at their last post: a type_text soon after settles its
/// snapshot (`settles`), since that key's effect (super+a, super+z, super+v) can land after the snapshot was taken.
final class RecentKeyPosts: @unchecked Sendable {
  private let lock = NSLock()
  private var latest: [pid_t: Double] = [:]

  func record(pid: pid_t, at time: Double = monotonicMilliseconds()) {
    lock.lock()
    defer { lock.unlock() }
    latest = latest.filter { time - $0.value <= typeReadbackSettleWindowMs }  // the others can no longer settle anything
    latest[pid] = time
  }

  /// Whether a key was posted to `pid` within the settle window before `time`.
  func settles(pid: pid_t, at time: Double = monotonicMilliseconds()) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    guard let posted = latest[pid] else { return false }
    return time - posted <= typeReadbackSettleWindowMs
  }
}
