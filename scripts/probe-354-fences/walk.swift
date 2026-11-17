// Scratch-build-only observation of the focused-field walk during a tagged public type_text. Observation only: it makes no AX
// request, decides nothing, and keeps only counts, timings, AX error codes and a fixed reason name. No element, role, value or
// text is ever held, logged or sent. The hooks that feed it are placed by walk-patch.mjs against the pinned walker source.
import Foundation

/// The fixed vocabulary of a walk's end; the raw values are the wire names the parser (walk.mjs) accepts.
enum Probe354WalkReason: String {
  case node = "node", time = "time", depth = "depth"
  case roleFailed = "role-failed", focusFailed = "focus-failed", childrenFailed = "children-failed"
  case multiple = "multiple", noCandidate = "no-candidate", finished = "finished"
  case unclassified = "unclassified"  // a stop no hook explains: the parser rejects it, so the row is invalid, never guessed
}

/// Where the walk last was, by the hooks it passed. Each production exit is told apart by its stage and the counters.
enum Probe354WalkStage { case start, cap, role, leaf, children, childrenRead }

/// One walker invocation's numeric state, filled by the hooks and read once at the walk's end.
final class Probe354WalkState: @unchecked Sendable {
  var stage = Probe354WalkStage.start
  var atNodeCap = false
  var done = false
  var leaves = 0
  var focused = 0
  var depth: Int?
  var lastAXError: Int?
  func top(atNodeCap: Bool) { stage = .cap; self.atNodeCap = atNodeCap }
  func visit(depth seen: Int) { stage = .role; depth = max(depth ?? seen, seen) }
  func leaf() { stage = .leaf; leaves += 1 }
  func focusedLeaf() { focused += 1 }
  func childrenStart() { stage = .children }
  func childrenRead() { stage = .childrenRead }
  func completed() { done = true }

  /// The exit, read from the last stage: a walk that reached its final `return found` finished or found no field; any other
  /// stop was a `return nil` at the point the stage names.
  var reason: Probe354WalkReason {
    if done { return focused == 1 ? .finished : focused == 0 ? .noCandidate : .unclassified }
    switch stage {
    case .cap: return atNodeCap ? .node : .time
    case .role: return .roleFailed
    case .leaf: return focused >= 2 ? .multiple : .focusFailed
    case .children: return .childrenFailed
    case .childrenRead: return .depth
    case .start: return .unclassified
    }
  }
}

func probe354WalkTagValid(_ tag: String) -> Bool {
  let prefix = "large-page/input/plain/"
  guard tag.hasPrefix(prefix) else { return false }
  let rep = tag.dropFirst(prefix.count)
  return !rep.isEmpty && rep.count <= 6 && rep.first != "0" && rep.allSatisfy { ("0"..."9").contains($0) }
}

final class Probe354WalkTrace: @unchecked Sendable {
  static let shared = Probe354WalkTrace()
  private let lock = NSLock()
  private var id: String?
  private var current: Probe354WalkState?
  private var walks: [[String: Any]] = []

  /// Active only for a public type_text tagged with the one cell shape, and never a concealed one.
  func begin(_ args: [String: Any]) -> String? {
    guard let tag = args["probe354WalkTrace"] as? String, probe354WalkTagValid(tag),
          (args["concealed"] as? NSNumber)?.boolValue != true else { return nil }
    lock.lock(); defer { lock.unlock() }
    guard id == nil else { return nil }
    id = tag; walks = []; current = nil
    return tag
  }
  /// Nil outside a traced request, so a walk anywhere else costs the hooks nothing.
  func beginWalk() -> Probe354WalkState? {
    lock.lock(); defer { lock.unlock() }
    guard id != nil else { return nil }
    let state = Probe354WalkState()
    current = state
    return state
  }
  /// The classifier's answer to one attribute read of the walk: the AX error as the system gave it.
  func noteRead(error: Int32) {
    lock.lock(); defer { lock.unlock() }
    current?.lastAXError = Int(error)
  }
  func endWalk(_ state: Probe354WalkState?, visited: Int, queued: Int, elapsedMs: Double) {
    guard let state else { return }
    let reason = state.reason
    var walk: [String: Any] = ["visited": visited, "queued": queued, "elapsedMs": elapsedMs, "reason": reason.rawValue,
                               "leaves": state.leaves, "focused": state.focused, "claimed": reason == .finished,
                               "cutShort": reason == .node || reason == .time || reason == .depth]
    if let depth = state.depth { walk["depthReached"] = depth } else { walk["depthReached"] = NSNull() }
    let failed = reason == .roleFailed || reason == .focusFailed || reason == .childrenFailed
    if failed, let code = state.lastAXError { walk["failedAXError"] = code } else { walk["failedAXError"] = NSNull() }
    lock.lock(); defer { lock.unlock() }
    if current === state { current = nil }
    guard id != nil else { return }
    walk["index"] = walks.count + 1
    walks.append(walk)
  }
  /// A request with no walker invocation still reports, with an empty list.
  func finish(_ tag: String?) {
    guard let tag else { return }
    lock.lock()
    let result: [String: Any] = ["id": tag, "walks": walks]
    id = nil; current = nil; walks = []
    lock.unlock()
    if let data = try? JSONSerialization.data(withJSONObject: ["probe354FocusWalkTrace": result], options: [.sortedKeys]) {
      FileHandle.standardError.write(data + Data([10]))
    }
  }
}
