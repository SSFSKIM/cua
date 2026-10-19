import ApplicationServices
import Foundation

// AXObserver on an application element, for the invalidation monitor (F §3.5) and the settle (F §8.2). The observer's
// run-loop source is serviced by the main run loop, which NSApplication.run keeps turning; the callback only records
// the notification and its arrival time, so no Accessibility call runs on the main thread. A connection thread reads
// what was recorded.

/// One notification as the callback saw it.
struct ReceivedNotification {
  let name: String
  let element: AXUIElement
  let at: Double  // monotonic ms
}

/// The callback's state, retained by the run-loop registration until it is removed on the main thread.
private final class ObserverBox: @unchecked Sendable {
  let lock = NSLock()
  var received: [ReceivedNotification] = []
  let keep: Bool
  var onReceive: (@Sendable (ReceivedNotification) -> Void)?

  init(keep: Bool) { self.keep = keep }
}

private let observerCallback: AXObserverCallback = { _, element, name, refcon in
  guard let refcon else { return }
  let box = Unmanaged<ObserverBox>.fromOpaque(refcon).takeUnretainedValue()
  let notification = ReceivedNotification(name: name as String, element: element, at: monotonicMilliseconds())
  box.lock.lock()
  if box.keep { box.received.append(notification) }
  let onReceive = box.onReceive
  box.lock.unlock()
  onReceive?(notification)
}

final class NotificationObserver: @unchecked Sendable {
  private let observer: AXObserver
  private let application: AXUIElement
  private let names: [String]
  private let box: ObserverBox
  private let refcon: UnsafeMutableRawPointer
  /// The notifications the application accepted a registration for.
  let registered: [String]

  /// Registers `names` on `pid`'s application element; nil when the observer cannot be created or no notification
  /// can be registered (no Accessibility grant, a process gone). `keep` records every notification for `drain()`.
  init?(pid: pid_t, names: [String], keep: Bool, onReceive: (@Sendable (ReceivedNotification) -> Void)? = nil) {
    var created: AXObserver?
    guard AXObserverCreate(pid, observerCallback, &created) == .success, let created else { return nil }
    observer = created
    application = prepare(AXUIElementCreateApplication(pid))
    box = ObserverBox(keep: keep)
    box.onReceive = onReceive
    refcon = Unmanaged.passRetained(box).toOpaque()
    var accepted: [String] = []
    for name in names where AXObserverAddNotification(created, application, name as CFString, refcon) == .success { accepted.append(name) }
    self.names = accepted
    registered = accepted
    let source = AXObserverGetRunLoopSource(created)
    CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
    CFRunLoopWakeUp(CFRunLoopGetMain())
    if accepted.isEmpty {
      invalidate()
      return nil
    }
  }

  /// The notifications recorded since the last drain.
  func drain() -> [ReceivedNotification] {
    box.lock.lock()
    defer { box.lock.unlock() }
    let taken = box.received
    box.received = []
    return taken
  }

  /// Removes the registrations and the source on the main thread, after which the callback can no longer run, then
  /// releases its state.
  func invalidate() {
    let registration = Registration(observer: observer, application: application, names: names, refcon: refcon)
    if Thread.isMainThread { registration.remove() } else { DispatchQueue.main.async { registration.remove() } }
  }
}

/// What `invalidate` removes on the main thread, which owns the run loop the callback runs on.
private struct Registration: @unchecked Sendable {
  let observer: AXObserver
  let application: AXUIElement
  let names: [String]
  let refcon: UnsafeMutableRawPointer

  func remove() {
    for name in names { AXObserverRemoveNotification(observer, application, name as CFString) }
    CFRunLoopRemoveSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(observer), .commonModes)
    Unmanaged<ObserverBox>.fromOpaque(refcon).release()
  }
}

/// The vendor's invalidation monitor (F §3.5): `AXLayoutChanged` and `AXUIElementDestroyed` on one process's application
/// element, recorded into `state`.
final class InvalidationMonitor: @unchecked Sendable {
  private let observer: NotificationObserver

  init?(pid: pid_t, state: InvalidationState) {
    guard let observer = NotificationObserver(pid: pid, names: [kAXLayoutChangedNotification, kAXUIElementDestroyedNotification], keep: false,
                                              onReceive: { state.record($0) }) else { return nil }
    self.observer = observer
  }

  deinit { observer.invalidate() }
}

/// What one process's monitor has seen since the observation began: a layout change, and the elements destroyed. A state
/// made `invalidatedUntilReset` counts as a layout change until its first reset.
final class InvalidationState: @unchecked Sendable {
  private let lock = NSLock()
  private var changed: Bool
  private var destroyedElements = Set<ElementKey>()

  init(invalidatedUntilReset: Bool = false) { changed = invalidatedUntilReset }

  func record(_ notification: ReceivedNotification) {
    lock.lock()
    defer { lock.unlock() }
    if notification.name == kAXLayoutChangedNotification { changed = true } else { destroyedElements.insert(ElementKey(element: notification.element)) }
  }

  func reset() {
    lock.lock()
    defer { lock.unlock() }
    changed = false
    destroyedElements = []
  }

  var layoutChanged: Bool {
    lock.lock()
    defer { lock.unlock() }
    return changed
  }

  func destroyed(_ element: AXUIElement) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    return destroyedElements.contains(ElementKey(element: element))
  }
}
