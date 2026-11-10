// Runner-only #354 fence spike: the pure decisions, compiled into a scratch build of the pinned engine (patch.mjs
// copies this file) and into the offline check (logic-check.swift). Never product code.
import Foundation

/// A field's AXSubrole as read: a string, absent (no value / unsupported), or a read that failed.
enum Fence354Subrole: Equatable {
  case value(String)
  case absent
  case failed
}

/// Whether nothing of a field's value or ranges may be read: role or subrole AXSecureTextField, an unreadable role, or
/// a subrole that cannot be read. Fails closed.
func fence354Secure(role: String?, subrole: Fence354Subrole) -> Bool {
  guard let role else { return true }
  if role == "AXSecureTextField" { return true }
  switch subrole {
  case .value(let found): return found == "AXSecureTextField"
  case .absent: return false
  case .failed: return true
  }
}

/// `before` with the UTF-16 range `[location, length]` replaced by `typed` (AX ranges count UTF-16 units); nil when the
/// range is not a range inside `before`.
func fence354Expected(before: String, range: [Int], typed: String) -> String? {
  guard range.count == 2 else { return nil }
  let value = before as NSString
  let location = range[0], length = range[1]
  guard location >= 0, length >= 0, location <= value.length, length <= value.length - location else { return nil }
  return value.replacingCharacters(in: NSRange(location: location, length: length), with: typed)
}

/// What an exact readback can promise before any text is posted.
enum Fence354Plan: Equatable {
  case refused(String)
  case expect(String)

  var reason: String? { if case .refused(let why) = self { return why }; return nil }
  /// Values (before and actual) are reported only for a field the plan read: never secure, concealed or unreadable.
  var reportsValues: Bool { if case .expect = self { return true }; return false }
}

func fence354Plan(concealed: Bool, focused: Bool, role: String?, secure: Bool, value: String?, range: [Int]?, typed: String) -> Fence354Plan {
  if concealed { return .refused("concealed") }
  if !focused { return .refused("noFocusedElement") }
  if role == nil { return .refused("roleUnreadable") }
  if secure { return .refused("secure") }
  guard let value, let range else { return .refused("beforeUnreadable") }
  guard let expected = fence354Expected(before: value, range: range, typed: typed) else { return .refused("beforeRangeInvalid") }
  return .expect(expected)
}

/// A notification acknowledges a key only when it is a selected-text change that arrived once posting began; anything
/// earlier is setup traffic.
func fence354Accepts(name: String, arrivedAt: Double, postStartedAt: Double) -> Bool {
  name == "AXSelectedTextChanged" && arrivedAt >= postStartedAt
}

/// What the readback snapshot read, in the only order allowed: a concealed request reads nothing, not even focus;
/// otherwise focus, then role and subrole, and value and range only once both say the field is not secure. The readers
/// are the engine's AX reads in the patched build and recording fakes in the offline check.
struct Fence354Snapshot<Element> {
  var element: Element?
  var role: String?
  var subrole: Fence354Subrole = .absent
  var secure = true
  var value: String?
  var range: [Int]?
  var plan: Fence354Plan
}

func fence354Snapshot<Element>(concealed: Bool, typed: String, focused: () -> Element?, role: (Element) -> String?,
                               subrole: (Element) -> Fence354Subrole, value: (Element) -> String?,
                               range: (Element) -> [Int]?) -> Fence354Snapshot<Element> {
  if concealed {
    return Fence354Snapshot(plan: fence354Plan(concealed: true, focused: false, role: nil, secure: true, value: nil, range: nil, typed: typed))
  }
  var snapshot = Fence354Snapshot<Element>(plan: .refused("noFocusedElement"))
  guard let element = focused() else { return snapshot }
  snapshot.element = element
  snapshot.role = role(element)
  snapshot.subrole = snapshot.role == nil ? .failed : subrole(element)
  snapshot.secure = fence354Secure(role: snapshot.role, subrole: snapshot.subrole)
  if !snapshot.secure {
    snapshot.value = value(element)
    snapshot.range = range(element)
  }
  snapshot.plan = fence354Plan(concealed: false, focused: true, role: snapshot.role, secure: snapshot.secure,
                               value: snapshot.value, range: snapshot.range, typed: typed)
  return snapshot
}

/// A value the readback may put on the wire: only under a plan that read the field, else null whatever was seen.
func fence354Reported(_ plan: Fence354Plan, _ value: String?) -> String? { plan.reportsValues ? value : nil }

/// Why a field may no longer be read after the input: it became secure, or its role or subrole stopped being readable.
func fence354Closed(role: String?, subrole: Fence354Subrole) -> String? {
  guard role != nil else { return "roleUnreadableAfterInput" }
  if case .failed = subrole { return "subroleUnreadableAfterInput" }
  return fence354Secure(role: role, subrole: subrole) ? "becameSecureAfterInput" : nil
}

/// The post-input readback of the snapshotted field. Role and subrole are re-read immediately before every value read
/// and before the final range read; once the field is secure or unreadable nothing more is read, and `closed` tells the
/// caller to report no before, expected, actual or range at all. `stop` ends the soft budget; `pause` waits between reads.
struct Fence354Poll: Equatable {
  var matched = false
  var reads = 0
  var actual: String?
  var actualRange: [Int]?
  var closed: String?
}

func fence354Poll<Element>(_ element: Element, expected: String, role: (Element) -> String?, subrole: (Element) -> Fence354Subrole,
                           value: (Element) -> String?, range: (Element) -> [Int]?, stop: () -> Bool, pause: () -> Void) -> Fence354Poll {
  var poll = Fence354Poll()
  func closed() -> String? {
    let seenRole = role(element)
    return fence354Closed(role: seenRole, subrole: seenRole == nil ? .failed : subrole(element))
  }
  repeat {
    if let why = closed() { return Fence354Poll(reads: poll.reads, closed: why) }
    poll.reads += 1
    poll.actual = value(element)
    if poll.actual == expected { poll.matched = true; break }
    if stop() { break }
    pause()
  } while true
  if let why = closed() { return Fence354Poll(reads: poll.reads, closed: why) }
  poll.actualRange = range(element)
  return poll
}
