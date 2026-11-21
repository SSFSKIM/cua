import ApplicationServices
import Foundation

// A posted click's late landing (#359; the design session's ruling 1ea561bc:785, the native engine spec's Decision Log,
// the #359 entry). A posted pointer press answers once its events are posted, but a foreground browser can dequeue it
// later: the spike (runs 44107967517, 44112583792, 44126242634) saw the click's caret land p50 14 to 19 ms after the
// click returned, at worst 419 ms. An accessibility action on the same process that reads or writes its text selection
// or value can overtake it, and the click then moves the caret back to its point: select_text's range, set_value's
// caret, type_text's starting point. Posted keys queue behind the click and never overtake it, so they never wait; a
// background click by #341's accessibility route posts no pointer event and arms nothing.
//
// - `ClickOrdering` records, per process, the last posted pointer press (`deliverPointer`'s events) and select_text's
//   last written range.
// - Within `pendingClickWindowMs` of a posted press, an accessibility action on the process's text first waits for a
//   stable range (`awaitRange` .stable): unchanged and readable for `pendingClickDwellMs`, sampled every
//   `pendingClickSampleMs`, for at most `pendingClickCapMs`. At the cap it proceeds, and the action's own read-back
//   answers what it sees: a stable range is no proof the click has landed.
// - Within `selectedRangeWindowMs` of select_text, type_text's starting point waits until the field's range is the one
//   select_text wrote (`awaitRange` .equals, the same cap); still another range at the cap, nothing is typed and
//   type_text answers typeUnconfirmed (`selectionChanged`).
// - set_value inside the window watches the field after its write (`watchWrittenValue`): a value other than the one
//   written, or a caret off its end, answers valueUnconfirmed.

/// How long after a posted pointer press an accessibility action on the same process's text waits for it (ruling 785:
/// about 1 s, past the spike's worst late landing, 419 ms).
let pendingClickWindowMs: Double = 1_000
/// How long a range must read unchanged to count as stable (ruling 785; the spike's `stable50` candidate).
let pendingClickDwellMs: Double = 50
/// The interval between a wait's reads.
let pendingClickSampleMs: Double = 10
/// The longest a wait reads for (ruling 785: about 300 ms), after which the action proceeds.
let pendingClickCapMs: Double = 300
/// How long after select_text wrote a range type_text's starting point must find it (ruling 785: about 1 s).
let selectedRangeWindowMs: Double = 1_000

/// The posted pointer presses and select_text's written ranges, by process, at their last time (monotonic ms). One for
/// the engine: a click by one connection is pending for another's action on the same process.
final class ClickOrdering: @unchecked Sendable {
  private let lock = NSLock()
  private var pointers: [pid_t: Double] = [:]
  private var selections: [pid_t: (range: NSRange, at: Double)] = [:]

  /// A pointer press posted to `pids` (the process the events went to and the app's).
  func pointerPosted(pids: [pid_t], at time: Double = monotonicMilliseconds()) {
    lock.withLock {
      pointers = pointers.filter { time - $0.value <= pendingClickWindowMs }  // the others can no longer delay anything
      for pid in pids { pointers[pid] = time }
    }
  }

  /// Whether a pointer press was posted to any of `pids` within the window before `time`.
  func pointerPending(pids: [pid_t], at time: Double = monotonicMilliseconds()) -> Bool {
    lock.withLock { pids.contains { pid in pointers[pid].map { time - $0 <= pendingClickWindowMs } ?? false } }
  }

  /// select_text wrote `range` on `pid`'s field.
  func selectionWritten(pid: pid_t, range: NSRange, at time: Double = monotonicMilliseconds()) {
    lock.withLock { selections[pid] = (range, time) }
  }

  /// The range select_text last wrote on `pid` within the window before `time`, taken: a type_text uses it once.
  func takeSelection(pid: pid_t, at time: Double = monotonicMilliseconds()) -> NSRange? {
    lock.withLock {
      guard let written = selections.removeValue(forKey: pid), time - written.at <= selectedRangeWindowMs else { return nil }
      return written.range
    }
  }

  /// Any other input to `pid` (a click, a key, a value) leaves select_text's range no longer the one to type over.
  func dropSelection(pid: pid_t) {
    lock.withLock { _ = selections.removeValue(forKey: pid) }
  }
}

/// The input methods after which select_text's range still stands for type_text: a scroll moves no caret, and
/// type_text takes it itself.
let selectionKeepingMethods: Set<String> = ["type_text", "scroll"]

/// One read of a wait: a range (with whatever else must hold still beside it), none readable now, or a field that must
/// not be read further (a password field), which ends the wait.
enum RangeRead<Sample: Equatable>: Equatable {
  case sample(Sample)
  case unread
  case closed
}

/// What a wait waits for: a range that holds still, or one range.
enum RangeGoal<Sample: Equatable>: Equatable {
  case stable
  case equals(Sample)
}

/// What a wait did: its reads, its time, whether its goal was met, and whether a read closed it.
struct RangeWait: Equatable {
  var reads = 0
  var ms: Double = 0
  var met = false
  var closed = false

  var capped: Bool { !met && !closed }

  var wire: [String: Any] {
    var wire: [String: Any] = ["waitMs": (ms * 10).rounded() / 10, "reads": reads]
    if capped { wire["capped"] = true }
    if closed { wire["closed"] = true }
    return wire
  }
}

/// Reads every `sampleMs` until `goal` holds: `.stable`, a sample read unchanged over `dwellMs` (an unreadable read
/// starts the dwell again); `.equals`, a sample read equal to it. A closed read ends the wait at once; otherwise it ends
/// unmet once a further read would fall past `capMs`.
func awaitRange<Sample: Equatable>(_ goal: RangeGoal<Sample>, read: () -> RangeRead<Sample>, now: () -> Double, sleep: (Double) -> Void,
                                   dwellMs: Double = pendingClickDwellMs, sampleMs: Double = pendingClickSampleMs,
                                   capMs: Double = pendingClickCapMs) -> RangeWait {
  let started = now()
  var wait = RangeWait()
  var held: (sample: Sample, since: Double)?
  while true {
    let found = read()
    wait.reads += 1
    let at = now()
    switch found {
    case .closed:
      wait.closed = true
    case .unread:
      held = nil
    case .sample(let sample):
      switch goal {
      case .equals(let wanted):
        wait.met = sample == wanted
      case .stable:
        if let current = held, current.sample == sample {
          wait.met = at - current.since >= dwellMs
        } else {
          held = (sample, at)
        }
      }
    }
    if wait.met || wait.closed || at - started + sampleMs > capMs { break }
    sleep(sampleMs)
  }
  wait.ms = now() - started
  return wait
}

/// The starting-point wait type_text's snapshot takes (TypeReadback.swift): for select_text's range when select_text
/// wrote one within its window, else for a stable range when a pointer press is pending, else none.
enum BaselineWait: Equatable {
  case stable
  case selection(NSRange)
}

func baselineWait(selection: NSRange?, pointerPending: Bool) -> BaselineWait? {
  if let selection { return .selection(selection) }
  return pointerPending ? .stable : nil
}

// MARK: The live reads of an element action's wait

/// One read of an element's selection for the wait: its range, and whether the app's focus was elsewhere then (a late
/// click that takes focus to another field can leave this one's range unchanged).
struct ElementRangeSample: Equatable {
  let range: NSRange
  let focusedElsewhere: Bool
}

/// The live read of `element`'s selection in `pid`: closed for a password field, whose range is never read.
func liveElementRangeRead(_ element: AXUIElement, pid: pid_t) -> RangeRead<ElementRangeSample> {
  if secureTextField(role: stringAttribute(element, kAXRoleAttribute), subrole: subroleRead(element)) { return .closed }
  guard let wire = rangeWire(attribute(element, kAXSelectedTextRangeAttribute)), let location = wire["location"],
        let length = wire["length"] else { return .unread }
  let focused = elementAttribute(AXUIElementCreateApplication(pid), kAXFocusedUIElementAttribute)
  return .sample(ElementRangeSample(range: NSRange(location: location, length: length),
                                    focusedElsewhere: focused.map { !CFEqual($0, element) } ?? false))
}

// MARK: set_value's watch after its write

/// Why a set_value inside the window is unconfirmed (the meta's `pendingClick.drift`).
enum WrittenValueDrift: String, Equatable {
  /// The field read a value other than the one written.
  case valueChanged
  /// The field's caret read off the written value's end.
  case caretMoved
  /// The field turned into a password field, or its role or subrole could not be read, so it was read no further: the
  /// write is not confirmed.
  case fieldClosed
}

/// What the watch after set_value's write found: its reads and time, and the drift that makes it unconfirmed.
struct WrittenValueWatch: Equatable {
  var reads = 0
  var ms: Double = 0
  var drift: WrittenValueDrift?
}

/// The watch after set_value's write within the window (ruling 785, item 3), read every `sampleMs`: the value as
/// written (`value`, nil when it cannot be read, never read for a concealed request) and the caret at its end,
/// {`length`, 0} (`range`). A read that shows both, of what it can read, has landed the write; once landed, holding
/// still over `dwellMs` confirms it, and any read off either is the drift. A write still not landed when a further read
/// would fall past `capMs` answers the drift its last read showed (an app may apply the write late); a field that reads
/// neither tells nothing and is not held against the write. `closed` is asked before every read, as the range wait and
/// type_text's read-back ask: a field that turned secure or cannot be classified is read no further, its value and
/// caret unread, and the watch ends unconfirmed (`fieldClosed`). A value read at Chromium's cap
/// (`readbackMayBeTruncated`) may lack only an end: it counts as the written value only when it is a prefix of it.
func watchWrittenValue(written: String?, length: Int, closed: () -> Bool, value: () -> String?, range: () -> NSRange?,
                       now: () -> Double, sleep: (Double) -> Void, dwellMs: Double = pendingClickDwellMs,
                       sampleMs: Double = pendingClickSampleMs, capMs: Double = pendingClickCapMs) -> WrittenValueWatch {
  struct Sample: Equatable {
    let value: String?
    let range: NSRange?
  }
  let started = now()
  let end = NSRange(location: length, length: 0)
  var watch = WrittenValueWatch()
  var landed: (sample: Sample, since: Double)?
  var lastDrift: WrittenValueDrift?
  while true {
    if closed() {
      watch.drift = .fieldClosed
      break
    }
    let read = Sample(value: written == nil ? nil : value(), range: range())
    watch.reads += 1
    let at = now()
    var drift: WrittenValueDrift?
    if let found = read.value, let written, !writtenValueRead(found, as: written) {
      drift = .valueChanged
    } else if let caret = read.range, caret != end {
      drift = .caretMoved
    }
    if let drift {
      if landed != nil {
        watch.drift = drift
        break
      }
      lastDrift = drift
    } else if read.value != nil || read.range != nil {
      if let current = landed, current.sample == read {
        if at - current.since >= dwellMs { break }
      } else {
        landed = (read, at)
      }
    } else if landed == nil, lastDrift == nil {
      break  // neither can be read: nothing to watch
    }
    if at - started + sampleMs > capMs {
      if landed == nil { watch.drift = lastDrift }
      break
    }
    sleep(sampleMs)
  }
  watch.ms = now() - started
  return watch
}

/// Whether a value read is the value written: equal in UTF-16 units, or, read at Chromium's cap, the written value cut
/// there (a strict prefix of it); any other difference near the cap is a difference.
func writtenValueRead(_ found: String, as written: String) -> Bool {
  if found.utf16.elementsEqual(written.utf16) { return true }
  guard readbackMayBeTruncated(found) else { return false }
  let read = Array(found.utf16), whole = Array(written.utf16)
  return read.count < whole.count && whole.starts(with: read)
}

/// What an element action's wait and set_value's watch did, the meta's `pendingClick`.
struct PendingClickRecord: Equatable {
  var wait: RangeWait?
  var watch: WrittenValueWatch?

  var wire: [String: Any] {
    var wire = wait?.wire ?? [:]
    if let watch {
      wire["watchMs"] = (watch.ms * 10).rounded() / 10
      wire["watchReads"] = watch.reads
      if let drift = watch.drift { wire["drift"] = drift.rawValue }
    }
    return wire
  }
}

/// Ruling 785's wait before an accessibility action on a field's text: within the window of a pointer press posted to
/// `pids` (`ordering`), a stable range first; outside it nothing is read and nil is answered.
func pendingClickWait<Sample: Equatable>(_ ordering: ClickOrdering, pids: [pid_t], at time: Double = monotonicMilliseconds(),
                                         read: () -> RangeRead<Sample>, now: () -> Double, sleep: (Double) -> Void) -> RangeWait? {
  guard ordering.pointerPending(pids: pids, at: time) else { return nil }
  return awaitRange(.stable, read: read, now: now, sleep: sleep)
}

extension Engine {
  /// `pendingClickWait` on `element`, read live, recorded in the meta; whether it waited.
  @discardableResult
  func awaitPendingClick(on element: AXUIElement, pids: [pid_t], meta: inout InputMeta) -> Bool {
    guard let pid = pids.first else { return false }
    let wait = signposted("clickOrdering.wait") {
      pendingClickWait(clickOrdering, pids: pids, read: { liveElementRangeRead(element, pid: pid) }, now: monotonicMilliseconds,
                       sleep: { usleep(UInt32(max(0, $0) * 1000)) })
    }
    if let wait { meta.pendingClick = PendingClickRecord(wait: wait) }
    return wait != nil
  }
}
