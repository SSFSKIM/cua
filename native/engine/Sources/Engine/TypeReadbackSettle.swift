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
/// `retry`, when given, reads again a read that failed (#590).
func readbackSettle<Element>(_ field: Element, role: String, reads: ReadbackReads<Element>, before: inout String, range: inout NSRange,
                             record: inout ReadbackSettle, retry: ReadbackRetry<Element>? = nil) -> TypeReadbackReason? {
  let retry = retry ?? ReadbackRetry(reads: reads, retries: 0)
  let recheck = { retry.fieldClosed(field, role: role, retrying: false) }
  let started = reads.now()
  while reads.now() - started + typeReadbackSettleIntervalMs <= typeReadbackSettleCapMs {
    reads.sleep(typeReadbackSettleIntervalMs)
    if let closed = retry.fieldClosed(field, role: role) { return closed }
    let value: String, next: NSRange
    switch retry.read(.value, recheck: recheck, { reads.value(field) }) {
    case .value(let read): value = read
    case .failed: return .valueUnreadable
    case .closed(let why): return why
    }
    switch retry.read(.range, recheck: recheck, { reads.range(field) }) {
    case .value(let read): next = read
    case .failed: return .rangeUnreadable
    case .closed(let why): return why
    }
    record.reads += 1
    let agrees = value.utf16.elementsEqual(before.utf16) && next == range
    before = value
    range = next
    if agrees { return nil }
  }
  record.capped = true
  return nil
}

// MARK: A read that failed (#590)

/// A read of the field that answers nothing (an AX error, a timeout, a value of the wrong type) is read again before its
/// reason is answered (#590, ruling 1225): at most `typeReadbackReadRetries` times, `typeReadbackRetryIntervalMs`
/// apart, and a retry starts only while its phase has time for it: the snapshot within the request's time left less one
/// messaging timeout, the poll within its own budget, as the poll's own reads start. So a read that keeps failing
/// answers at most 2 × (15 + 100) = 230 ms later than before, every one of its reads timing out. Only a read that failed
/// is read again: one that answered and disagreed (a mismatch, a field that changed or turned secure) is answered as it
/// was, and a password field's length batch keeps its own schedule (TypeReadbackLength.swift). The settle's interval is
/// the retry's: long enough for an app busy with the keys to answer again, short against the poll's budget.
let typeReadbackReadRetries = 2
let typeReadbackRetryIntervalMs = typeReadbackSettleIntervalMs

/// Where a failed read was made: the snapshot before the first key, or a poll after a key (the final one, or a
/// checkpoint's before a Return or Tab).
enum ReadbackPhase: String, Equatable {
  case snapshot, poll
}

/// Which attribute of the field the failed read asked for.
enum ReadbackReadName: String, Equatable {
  case role, subrole, value, range
}

/// The record of the read whose failure a `typeUnconfirmed` answers (the meta's `typeReadback.readFailure`): its phase,
/// attribute, AXError, retries, time after the request's last key (a poll's), and the field's role and subrole as last
/// read successfully (the review of e54eab41..106d2018, P2-8: a failed read never erases them). Never a value or a range.
struct ReadbackReadFailure: Equatable {
  var phase: ReadbackPhase
  var read: ReadbackReadName
  var axError: Int32?
  var retries: Int
  var msSinceLastKey: Double?
  var role: String?
  var subrole: String?

  /// The wire form; `timed` false (a concealed request's or a password field's record) leaves out the retries and the
  /// time, as those records leave out every count and time.
  func wire(timed: Bool) -> [String: Any] {
    var wire: [String: Any] = ["phase": phase.rawValue, "read": read.rawValue]
    if let axError { wire["axError"] = Int(axError) }
    if let role { wire["role"] = role }
    if let subrole { wire["subrole"] = subrole }
    if timed {
      wire["retries"] = retries
      if let msSinceLastKey { wire["msSinceLastKey"] = (msSinceLastKey * 10).rounded() / 10 }
    }
    return wire
  }
}

/// The live reads' last error, shared by their closures.
final class ReadbackErrorBox {
  var last: Int32?
}

/// One read with its retries: the value it answered, a failure that stayed, or the field closed when it was classified
/// again before a retry (`ReadbackRetry.read`'s `recheck`).
enum ReadbackAttempt<Value> {
  case value(Value)
  case failed
  case closed(TypeReadbackReason)
}

/// One type_text's retries of failed reads: the reads, the phase they are in, the clock time by which a retry must start,
/// the request's last key, and what they found: the failure kept for the record, and how many reads failed and then
/// answered. A retry never reads more than its first try could (the review of e54eab41..106d2018, invariant 1): a value
/// or range read is tried again only after the field's role and subrole are read again and still classify it as the
/// snapshot's field, and a role read that names a password field or another role ends it.
final class ReadbackRetry<Element> {
  private let reads: ReadbackReads<Element>
  /// The retries a failed read gets: `typeReadbackReadRetries`, or none (a caller that reads each once, as before #590).
  private let limit: Int
  var phase = ReadbackPhase.snapshot
  /// A retry starts only while it and its interval end by this time (`reads.now`'s clock), and its read, after any
  /// classification before it, starts by it too.
  var retryBy = Double.infinity
  /// When the request's last key was posted, on `reads.now`'s clock.
  var lastKeyAt: Double?
  /// The field's role and subrole as last read successfully, for the record.
  private(set) var classified: (role: String?, subrole: String?) = (nil, nil)
  private(set) var failure: ReadbackReadFailure?
  /// Reads that failed and then answered within the bound.
  private(set) var recovered = 0

  init(reads: ReadbackReads<Element>, retries: Int = typeReadbackReadRetries) {
    self.reads = reads
    limit = retries
  }

  /// Whether another try may be made after `retries`, its interval slept first when so.
  private func again(_ retries: Int) -> Bool {
    guard retries < limit, reads.now() + typeReadbackRetryIntervalMs <= retryBy else { return false }
    reads.sleep(typeReadbackRetryIntervalMs)
    return true
  }

  /// `attempt` until it answers, or `.failed` once it failed with no retry left, that failure kept. `once` makes a single
  /// try that still records its failure (a field the lookup took for a password field, read once: P2-5). `recheck`,
  /// run before every retry, classifies the field again (`fieldClosed(_:role:retrying: false)`): a reason ends the read.
  func read<T>(_ name: ReadbackReadName, once: Bool = false, recheck: (() -> TypeReadbackReason?)? = nil,
               _ attempt: () -> T?) -> ReadbackAttempt<T> {
    var retries = 0
    while true {
      if let answer = attempt() {
        if retries > 0 { recovered += 1 }
        if name == .role, let role = answer as? String { classified.role = role }
        return .value(answer)
      }
      let error = reads.lastError()
      guard !once, again(retries) else {
        failed(name, error: error, retries: retries)
        return .failed
      }
      if let recheck {
        if let closed = recheck() { return .closed(closed) }
        // The classification's reads take time of their own: the retried read starts only while the bound still
        // allows it (ruling 1247, h).
        guard reads.now() <= retryBy else {
          failed(name, error: error, retries: retries)
          return .failed
        }
      }
      retries += 1
    }
  }

  /// The subrole read at the snapshot, once, for the record (a failed one classifies the field, never retried there).
  func saw(subrole: ReadbackSubrole) {
    if case .value(let found) = subrole { classified.subrole = found }
  }

  /// Why the snapshotted field is read no further (`readbackFieldClosed`), its role and subrole read again, a failed read
  /// of either retried when `retrying`. A role that names a password field or differs from the snapshot's is the end
  /// whatever its subrole reads (P1-4); only a role read that failed, or the snapshot's role with a subrole read that
  /// failed, is tried again, and once no retry is left it is `fieldUnreadable`.
  func fieldClosed(_ field: Element, role: String, retrying: Bool = true) -> TypeReadbackReason? {
    var retries = 0
    while true {
      let seenRole = reads.role(field)
      if let seenRole {
        classified.role = seenRole
        if seenRole == "AXSecureTextField" { return .becameSecure }
        if seenRole != role { return .fieldChanged }
        let subrole = reads.subrole(field)
        if subrole != .failed {
          saw(subrole: subrole)
          if retries > 0 { recovered += 1 }
          return readbackFieldClosed(role: role, seenRole: seenRole, subrole: subrole)
        }
      }
      let error = reads.lastError()
      guard retrying, again(retries) else {
        failed(seenRole == nil ? .role : .subrole, error: error, retries: retries)
        return .fieldUnreadable
      }
      retries += 1
    }
  }

  /// A read that failed and then answered: the poll's value read, which its own loop reads again within its budget.
  func answeredAfterFailing() { recovered += 1 }

  /// A read that failed for good: `retries` after the first try, the error of the last.
  func failed(_ name: ReadbackReadName, error: Int32?, retries: Int) {
    let sinceKey = phase == .poll ? lastKeyAt.map { reads.now() - $0 } : nil
    failure = ReadbackReadFailure(phase: phase, read: name, axError: error, retries: retries, msSinceLastKey: sinceKey,
                                  role: classified.role, subrole: classified.subrole)
  }
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
