import AppKit
import Foundation

// The pasteboard a paste writes (the spec's Design, "Paste"; R/F-helper-logic.md §7.2 and §7.6): reached only through
// `PasteboardAccess`, so the engine uses the general pasteboard and the unit tests a pasteboard of their own, never the
// owner's. The item is declared through a lazy data provider, so its data is handed over only when an app asks for it,
// which is the evidence that the app read it (F §7.4), and it carries two marker types the vendor does not write,
// cua's own: `org.nspasteboard.ConcealedType` and `org.nspasteboard.TransientType`, which clipboard managers honour by
// not recording the item. Every call is made on the main thread, as the vendor makes them (MainActor), since the
// provider's requests arrive on the main run loop and a promise the engine itself must fulfil is safe only there.

/// One item's representations, the pasteboard's contents as the snapshot keeps them.
typealias PasteboardSnapshot = [[PasteRepresentation]]

/// The marker types (nspasteboard.org): a clipboard manager that sees either does not keep the item.
let pasteMarkerTypes: [NSPasteboard.PasteboardType] = [
  NSPasteboard.PasteboardType("org.nspasteboard.ConcealedType"),
  NSPasteboard.PasteboardType("org.nspasteboard.TransientType"),
]

/// A write's outcome: the change count that is the engine's own from the moment it took the pasteboard (taking it clears
/// it), and whether the item was then written.
struct PasteboardWrite: Equatable {
  let own: Int
  let written: Bool
}

/// The pasteboard's contents and the change count they were read at, in one main-thread read.
struct PasteboardState {
  let items: PasteboardSnapshot?
  let changeCount: Int
}

protocol PasteboardAccess: AnyObject {
  var changeCount: Int { get }
  /// Every type of every item, its data materialised now, so a previous owner's promise becomes plain data (the vendor's
  /// FUN_10021fd0c), nil items when the pasteboard is empty, with the change count read in the same operation.
  func snapshot() -> PasteboardState
  /// Takes the pasteboard for new contents kept to this Mac (`NSPasteboardContentsCurrentHostOnly`, off Universal
  /// Clipboard), which clears it, and writes `item`, only while the change count is still `expected` (checked in the
  /// same main-thread operation, immediately before the take); nil, nothing taken, when it moved: someone else wrote the
  /// pasteboard since. The own change count is answered whether or not the item was then written, since the previous
  /// contents are gone either way and must be restored.
  func write(_ item: NSPasteboardItem, expecting expected: Int) -> PasteboardWrite?
  /// Clears the pasteboard and, unless the snapshot was empty, writes its items back.
  func restore(_ snapshot: PasteboardSnapshot?)
}

/// An NSPasteboard: the general one for the engine, a uniquely named one in the unit tests.
final class SystemPasteboard: PasteboardAccess, @unchecked Sendable {
  private let pasteboard: NSPasteboard

  init(_ pasteboard: NSPasteboard) { self.pasteboard = pasteboard }

  static func general() -> SystemPasteboard { SystemPasteboard(.general) }

  var changeCount: Int { onMain { pasteboard.changeCount } }

  func snapshot() -> PasteboardState {
    onMain {
      let count = pasteboard.changeCount
      let items = (pasteboard.pasteboardItems ?? []).map { item in
        item.types.compactMap { type in item.data(forType: type).map { PasteRepresentation(type: type, data: $0) } }
      }
      return PasteboardState(items: items.isEmpty ? nil : items, changeCount: count)
    }
  }

  func write(_ item: NSPasteboardItem, expecting expected: Int) -> PasteboardWrite? {
    onMain {
      guard pasteboard.changeCount == expected else { return nil }
      let own = pasteboard.prepareForNewContents(with: .currentHostOnly)
      return PasteboardWrite(own: own, written: pasteboard.writeObjects([item]))
    }
  }

  func restore(_ snapshot: PasteboardSnapshot?) {
    onMain {
      pasteboard.clearContents()
      guard let snapshot else { return }
      let items = snapshot.map { representations in
        let item = NSPasteboardItem()
        for representation in representations { item.setData(representation.data, forType: representation.type) }
        return item
      }
      pasteboard.writeObjects(items)
    }
  }
}

/// The lazy data provider of one written item. A request for a type hands that type's data over, and only a hand-over
/// that succeeded counts as the app's read; the pasteboard dropping the provider (`pasteboardFinishedWithDataProvider`,
/// the item replaced or the pasteboard cleared) also ends the wait, as the vendor's stream is fed by both (F §7.4).
final class LazyPasteProvider: NSObject, NSPasteboardItemDataProvider, @unchecked Sendable {
  private let representations: [PasteRepresentation]
  private let onRead: @Sendable () -> Void
  private let signal = DispatchSemaphore(value: 0)
  private let lock = NSLock()
  private var handedOver = false
  private var ended = false

  init(_ representations: [PasteRepresentation], onRead: @escaping @Sendable () -> Void = {}) {
    self.representations = representations
    self.onRead = onRead
  }

  /// The item to write: the representations declared lazily, the marker types set now. Nil when the provider is refused.
  func item() -> NSPasteboardItem? {
    let item = NSPasteboardItem()
    guard item.setDataProvider(self, forTypes: representations.map(\.type)) else { return nil }
    for marker in pasteMarkerTypes { item.setData(Data(), forType: marker) }
    return item
  }

  /// Whether an app has been handed the data.
  var read: Bool {
    lock.lock()
    defer { lock.unlock() }
    return handedOver
  }

  /// Waits up to `timeoutMs` for a hand-over or the provider's release; true when either came.
  func waitForRead(timeoutMs: Double) -> Bool {
    lock.lock()
    let done = handedOver || ended
    lock.unlock()
    if done { return true }
    return signal.wait(timeout: .now() + .microseconds(Int(max(0, timeoutMs) * 1000))) == .success
  }

  func pasteboard(_ pasteboard: NSPasteboard?, item: NSPasteboardItem, provideDataForType type: NSPasteboard.PasteboardType) {
    guard let representation = representations.first(where: { $0.type == type }), item.setData(representation.data, forType: type) else { return }
    lock.lock()
    let first = !handedOver && !ended
    handedOver = true
    lock.unlock()
    onRead()
    if first { signal.signal() }
  }

  func pasteboardFinishedWithDataProvider(_ pasteboard: NSPasteboard) {
    lock.lock()
    let first = !handedOver && !ended
    ended = true
    lock.unlock()
    if first { signal.signal() }
  }
}

// MARK: The engine-wide paste lock

/// A lock served in arrival order: the pasteboard is the Mac's, while one request in flight is the rule per connection,
/// so the engine holds one paste at a time across every connection, from the snapshot through the restore (the critique
/// of 2026-10-19; the vendor's process-wide serial queue, F §7.1). A waiter whose deadline passes leaves the line.
final class FIFOLock: @unchecked Sendable {
  private let condition = NSCondition()
  private var line: [Int] = []
  private var nextTicket = 0
  private var held = false

  /// Waits its turn; false when `deadline` passes first.
  func acquire(until deadline: Date) -> Bool {
    condition.lock()
    defer { condition.unlock() }
    let ticket = nextTicket
    nextTicket += 1
    line.append(ticket)
    while held || line.first != ticket {
      if !condition.wait(until: deadline), held || line.first != ticket {
        line.removeAll { $0 == ticket }
        condition.broadcast()
        return false
      }
    }
    line.removeFirst()
    held = true
    return true
  }

  func release() {
    condition.lock()
    held = false
    condition.broadcast()
    condition.unlock()
  }

  /// How many wait now (the tests' view of the line).
  var waiting: Int {
    condition.lock()
    defer { condition.unlock() }
    return line.count
  }
}

/// Runs `body` holding the paste lock, waiting no later than the request's `deadline` (Unix ms); a wait the deadline
/// ends is `timeoutReached` with nothing done.
func withPasteLock<T>(_ lock: FIFOLock, deadline: Int64, _ body: () throws -> T) throws -> T {
  guard lock.acquire(until: Date(timeIntervalSince1970: Double(deadline) / 1000)) else {
    throw EngineError(name: "timeoutReached", "timeoutReached: another paste held the clipboard until the request's deadline. Nothing was pasted.")
  }
  defer { lock.release() }
  return try body()
}
