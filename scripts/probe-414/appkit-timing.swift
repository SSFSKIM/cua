// Hosted scratch-build timing for the #414 AppKit lane. Records, for one `type_text` request, instants on the runner
// machine's Unix millisecond clock (`Date().timeIntervalSince1970 * 1000`, the same clock the harness reads):
//   * lastPostAtMs: right after the last CGEvent `keyDown` the production code actually posted (the post call returned; a post
//     the desktop gate refused never reaches the mark);
//   * confirmReadAtMs: the instant the product's length poll declared its confirmation (the dwell branch that sets `confirmed`,
//     after its condition held; on the older candidate, the batch it judged `.confirmed`), last one of the request;
//   * the product's own `readbackLength` reads after the first posted keyDown, through a wrapper of the same signature (the
//     patch renames the production function): firstReadAtMs, the first such read; sampledAtMs, every later read whose
//     outcome (closed reason, count kind and value, range) differed from the read before it, compared in memory only;
//     finalReadAtMs, the return of the last such read, and finalReadStartedAtMs, the clock just before that read began; sampledDropped counts changes past the 4096 cap. Nothing is filtered by time here:
//     the runner drops samples at or before lastPostAtMs.
// Armed for one request carrying the `probe414AppKit` string in its args; the request's scope exit emits ONE stderr JSON line
// `{"probe414AppKit":{"id","lastPostAtMs","confirmReadAtMs","firstReadAtMs","sampledAtMs","finalReadStartedAtMs","finalReadAtMs","sampledDropped"}}`, each
// instant null when its event never happened. The native reply and the app's consuming key or insertion are measured
// elsewhere. No event count, key, value, count or range is kept past the comparison or emitted, and nothing is read from the system.
import CoreGraphics
import Foundation

final class Probe414AppKit: @unchecked Sendable {
  static let shared = Probe414AppKit()

  private static let sampleCap = 4096
  private let lock = NSLock()
  private var id: String?
  private var owner: pthread_t?
  private var lastPostAtMs: Double?
  private var confirmReadAtMs: Double?
  private var posted = false
  private var previous: [Int]?
  private var firstReadAtMs: Double?
  private var finalReadAtMs: Double?
  private var finalReadStartedAtMs: Double?
  private var sampledAtMs: [Double] = []
  private var sampledDropped = 0

  static func nowMs() -> Double { Date().timeIntervalSince1970 * 1000 }

  /// Arms the recorder for one request that carries a well-formed tag; any other request is untouched.
  func begin(_ args: [String: Any]) -> String? {
    guard let tag = args["probe414AppKit"] as? String, !tag.isEmpty, tag.utf8.count <= 64, tag.utf8.allSatisfy({
      ($0 >= 48 && $0 <= 57) || ($0 >= 65 && $0 <= 90) || ($0 >= 97 && $0 <= 122) || $0 == 45 || $0 == 46 || $0 == 58 || $0 == 95
    }) else { return nil }
    lock.lock(); defer { lock.unlock() }
    guard id == nil else { return nil }
    id = tag; owner = pthread_self(); lastPostAtMs = nil; confirmReadAtMs = nil
    posted = false; previous = nil; firstReadAtMs = nil; finalReadAtMs = nil; finalReadStartedAtMs = nil; sampledAtMs = []; sampledDropped = 0
    return tag
  }

  /// Called right after a gated post returned. Only a key-down on the request's own thread counts; the last one wins.
  func posted(_ event: CGEvent) {
    guard event.type == .keyDown else { return }
    let at = Probe414AppKit.nowMs()
    lock.lock(); defer { lock.unlock() }
    guard id != nil, let owner, pthread_equal(owner, pthread_self()) != 0 else { return }
    lastPostAtMs = at
    posted = true
  }

  /// Called right after the length poll judged a batch `.confirmed`. The last one of the request wins.
  func confirmed() {
    let at = Probe414AppKit.nowMs()
    lock.lock(); defer { lock.unlock() }
    guard id != nil, let owner, pthread_equal(owner, pthread_self()) != 0 else { return }
    confirmReadAtMs = at
  }

  /// Called with each `readbackLength` result the instant it returned. After the first posted keyDown the outcome is compared
  /// with the previous one in memory, and only the time of a change is kept.
  func length(_ result: ReadbackLength, startedAtMs: Double) {
    let at = Probe414AppKit.nowMs()
    let outcome: [Int]
    switch result {
    case .closed(let why): outcome = [0, why.rawValue.hashValue]
    case .read(let count, let range):
      let key: [Int]
      switch count {
      case .value(let n): key = [1, n]
      case .absent: key = [2, 0]
      case .failed: key = [3, 0]
      }
      outcome = key + (range.map { [1, $0.location, $0.length] } ?? [0, 0, 0])
    }
    lock.lock(); defer { lock.unlock() }
    guard id != nil, posted, let owner, pthread_equal(owner, pthread_self()) != 0 else { return }
    finalReadAtMs = at; finalReadStartedAtMs = startedAtMs
    if let before = previous {
      if before != outcome {
        if sampledAtMs.count < Probe414AppKit.sampleCap { sampledAtMs.append(at) } else { sampledDropped += 1 }
      }
    } else {
      firstReadAtMs = at
    }
    previous = outcome
  }

  func finish(_ tag: String?) {
    guard let tag else { return }
    lock.lock()
    let post = lastPostAtMs, confirm = confirmReadAtMs, first = firstReadAtMs, final = finalReadAtMs, finalStarted = finalReadStartedAtMs
    let samples = sampledAtMs, dropped = sampledDropped
    id = nil; owner = nil; lastPostAtMs = nil; confirmReadAtMs = nil; posted = false; previous = nil
    firstReadAtMs = nil; finalReadAtMs = nil; finalReadStartedAtMs = nil; sampledAtMs = []; sampledDropped = 0
    lock.unlock()
    func number(_ v: Double?) -> String { v.map { String(format: "%.3f", $0) } ?? "null" }
    let list = samples.map { String(format: "%.3f", $0) }.joined(separator: ",")
    let line = "{\"probe414AppKit\":{\"confirmReadAtMs\":\(number(confirm)),\"finalReadAtMs\":\(number(final)),"
      + "\"finalReadStartedAtMs\":\(number(finalStarted)),\"firstReadAtMs\":\(number(first)),\"id\":\"\(tag)\",\"lastPostAtMs\":\(number(post)),\"sampledAtMs\":[\(list)],"
      + "\"sampledDropped\":\(dropped)}}\n"
    FileHandle.standardError.write(Data(line.utf8))
  }
}

/// The production `readbackLength` (renamed `readbackLengthUninstrumented` by the patch), unchanged in what it reads and returns.
func readbackLength<Element>(_ field: Element, role: String, reads: ReadbackReads<Element>) -> ReadbackLength {
  let started = Probe414AppKit.nowMs()
  let result = readbackLengthUninstrumented(field, role: role, reads: reads)
  Probe414AppKit.shared.length(result, startedAtMs: started)
  return result
}
