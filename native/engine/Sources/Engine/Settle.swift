import ApplicationServices
import Foundation

// Settle (the spec's Design, "Settle"; F §8), minimal for the M0 spike. After an action, the next get_app_state on that
// app waits for quiet first (the vendor's deferred settle): an AXObserver on the application for ten notifications,
// sampled every 100 ms (250 ms for a web-shaped app), returning once 250 ms have passed since the last notification (or
// since the wait began), unless the primary window's tree shows a busy sign; at 5 s it gives up, which cua reports as
// "capped" where the vendor is silent. The counts of what arrived go into `timings`, so probe (c') reads notification
// rates from the engine.

/// The ten notifications (F §8.2); `AXValueChanged` is not one.
let settleNotifications: [String] = [
  kAXTitleChangedNotification, kAXLayoutChangedNotification, kAXFocusedWindowChangedNotification,
  kAXFocusedUIElementChangedNotification, "AXElementBusyChanged", kAXMenuOpenedNotification, kAXSheetCreatedNotification,
  kAXWindowCreatedNotification, kAXCreatedNotification, kAXUIElementDestroyedNotification,
]
let settleQuietMs = 250.0
let settleCapMs = 5_000.0
let settleSampleMs = 100.0
let settleWebSampleMs = 250.0
let busyMarkerClass = "macos-mac-parity-spinner"

/// One notification as the settle weighs it: `counts` false for a title change that changed nothing.
struct SettleEvent {
  let name: String
  let at: Double
  let counts: Bool
}

struct SettleReport {
  var capped = false
  var ms = 0.0
  var counts: [String: Int] = [:]
  var ignoredTitleChanges = 0
  var busyWalks = 0
  var busyVetoes = 0
  var observed = true

  var total: Int { counts.values.reduce(0, +) }
}

/// The vendor's loop (F §8.3) over injected time, notifications and readiness, so it can be tested on a fake clock.
/// `ready` answers nil with no window (keep waiting), false when the tree is busy, true when it is quiet.
func runSettle(sampleMs: Double, quietMs: Double = settleQuietMs, capMs: Double = settleCapMs, now: () -> Double,
               sleep: (Double) -> Void, drain: () -> [SettleEvent], ready: () -> Bool?) -> SettleReport {
  var report = SettleReport()
  let start = now()
  var last = start
  while true {
    if now() - start >= capMs {
      report.capped = true
      break
    }
    sleep(sampleMs)
    for event in drain() {
      report.counts[event.name, default: 0] += 1
      if event.counts { last = max(last, event.at) } else { report.ignoredTitleChanges += 1 }
    }
    guard now() - last >= quietMs else { continue }
    report.busyWalks += 1
    let answer = ready()
    if answer == true { break }
    if answer == false { report.busyVetoes += 1 }
  }
  report.ms = now() - start
  return report
}

extension Engine {
  /// Waits for `application` to settle; `webShaped` chooses the 250 ms sampling.
  func settle(_ application: AXUIElement, pid: pid_t, webShaped: Bool, costs: FetchCosts) -> SettleReport {
    let observer = NotificationObserver(pid: pid, names: settleNotifications, keep: true)
    defer { observer?.invalidate() }
    var titles: [ElementKey: String] = [:]
    var report = runSettle(
      sampleMs: webShaped ? settleWebSampleMs : settleSampleMs,
      now: monotonicMilliseconds,
      sleep: { usleep(UInt32($0 * 1000)) },
      drain: {
        (observer?.drain() ?? []).map { notification in
          guard notification.name == kAXTitleChangedNotification else { return SettleEvent(name: notification.name, at: notification.at, counts: true) }
          // A title change counts only when the title is a readable string other than the one last seen (F §8.2).
          let key = ElementKey(element: notification.element)
          guard let title = stringAttribute(prepare(notification.element), kAXTitleAttribute), titles[key] != title else {
            return SettleEvent(name: notification.name, at: notification.at, counts: false)
          }
          titles[key] = title
          return SettleEvent(name: notification.name, at: notification.at, counts: true)
        }
      },
      ready: {
        guard let window = primaryWindow(of: application) else { return nil }
        return costs.time("settleBusyWalk") { !isBusy(window) }
      })
    report.observed = observer != nil
    return report
  }
}

/// The busy walk (F §8.4): an `AXBusyIndicator`, an `AXWebArea` whose `AXLoaded` is false, `AXElementBusy` true, or the
/// DOM class `macos-mac-parity-spinner` anywhere under the window (a progress indicator is not a sign). Bounded by the
/// observation's depth and node caps, the first 100 children of each element as the vendor's prefetch caps them.
func isBusy(_ window: AXUIElement) -> Bool {
  let attributes = [kAXRoleAttribute, "AXElementBusy", "AXLoaded", "AXDOMClassList", kAXChildrenAttribute] as CFArray
  var stack: [(AXUIElement, Int)] = [(window, 0)]
  var visited = 0
  while let (element, depth) = stack.popLast(), visited < maxObservedNodes {
    visited += 1
    var values: CFArray?
    guard AXUIElementCopyMultipleAttributeValues(prepare(element), attributes, AXCopyMultipleAttributeOptions(rawValue: 0), &values) == .success,
          let slots = values as? [Any], slots.count == 5 else { continue }
    let role = present(slots[0]).flatMap { CFGetTypeID($0) == CFStringGetTypeID() ? ($0 as! String) : nil }
    if role == "AXBusyIndicator" { return true }
    if role == "AXWebArea", bool(present(slots[2])) == false { return true }
    if bool(present(slots[1])) == true { return true }
    if let classes = present(slots[3]), CFGetTypeID(classes) == CFArrayGetTypeID(), (classes as! [AnyObject]).contains(where: { ($0 as? String) == busyMarkerClass }) {
      return true
    }
    if depth < maxDepth {
      for child in elementList(present(slots[4])).prefix(widthThreshold).reversed() { stack.append((child, depth + 1)) }
    }
  }
  return false
}
