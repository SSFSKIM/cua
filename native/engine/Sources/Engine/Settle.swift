import ApplicationServices
import Foundation

// Settle (the spec's Design, "Settle"; F §8), minimal for the M0 spike. After an action, the next get_app_state on that
// app waits for quiet first (the vendor's deferred settle): an AXObserver on the application for ten notifications,
// sampled every 100 ms (250 ms for a web-shaped app), returning once 250 ms have passed since the last notification (or
// since the wait began), unless the primary window's tree shows a busy sign; at 5 s it gives up, which cua reports as
// "capped" where the vendor is silent. The request's deadline ends it sooner, as `timeoutReached` (cua's addition: the
// vendor checks the deadline on receipt only, F §8.9). The counts of what arrived go into `timings`.

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
  /// The request's deadline passed before the app settled or the cap was reached.
  var timedOut = false
  var ms = 0.0
  var counts: [String: Int] = [:]
  var ignoredTitleChanges = 0
  var busyWalks = 0
  var busyVetoes = 0
  var observed = true
  /// When the quiet period was first reached (the first busy walk began), ms after the wait began.
  var quietAtMs: Double?
  /// Creating and registering the observer, and removing it (before and after the wait proper).
  var observerMs = 0.0

  var total: Int { counts.values.reduce(0, +) }
}

/// The vendor's loop (F §8.3) over injected time, notifications and readiness, so it can be tested on a fake clock.
/// `ready` answers nil with no window (keep waiting), false when the tree is busy, true when it is quiet. `deadlineMs`,
/// the request's deadline after the wait's start, cancels the wait once reached: the sleep that would cross it is cut
/// there, and no busy walk starts after it.
func runSettle(sampleMs: Double, quietMs: Double = settleQuietMs, capMs: Double = settleCapMs, deadlineMs: Double = .infinity,
               now: () -> Double, sleep: (Double) -> Void, drain: () -> [SettleEvent], ready: () -> Bool?) -> SettleReport {
  var report = SettleReport()
  let start = now()
  var last = start
  while true {
    if now() - start >= deadlineMs {
      report.timedOut = true
      break
    }
    if now() - start >= capMs {
      report.capped = true
      break
    }
    sleep(min(sampleMs, deadlineMs - (now() - start)))
    if now() - start >= deadlineMs { continue }
    for event in drain() {
      report.counts[event.name, default: 0] += 1
      if event.counts { last = max(last, event.at) } else { report.ignoredTitleChanges += 1 }
    }
    guard now() - last >= quietMs else { continue }
    if report.quietAtMs == nil { report.quietAtMs = now() - start }
    report.busyWalks += 1
    let answer = ready()
    if answer == true { break }
    if answer == false { report.busyVetoes += 1 }
  }
  report.ms = now() - start
  return report
}

/// What the settle hands the observation: its report and, when it settled, the source its last busy walk read through,
/// with that walk's window, so the observation reads the tree once (F §8.5).
struct Settled {
  var report: SettleReport
  var source: ElementSource?
  var window: AXUIElement?
  var loadedWebArea = false
}

extension Engine {
  /// Waits for `application` to settle; `webShaped` chooses the 250 ms sampling; `deadline` (monotonic ms) is the
  /// request's, which cancels the wait (`report.timedOut`). The busy walks' fetch costs accumulate in `costs`.
  func settle(_ application: AXUIElement, pid: pid_t, webShaped: Bool, deadline requestDeadline: Double, costs: FetchCosts) -> Settled {
    let setupStart = monotonicMilliseconds()
    let observer = NotificationObserver(pid: pid, names: settleNotifications, keep: true)
    let setupMs = monotonicMilliseconds() - setupStart
    var titles: [ElementKey: String] = [:]
    var last: (source: ElementSource, window: AXUIElement, loadedWebArea: Bool)?
    let started = monotonicMilliseconds()
    let deadline = min(started + settleCapMs, requestDeadline)
    var report = runSettle(
      sampleMs: webShaped ? settleWebSampleMs : settleSampleMs,
      deadlineMs: requestDeadline - started,
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
        // Each busy walk reads afresh; the last one's reads are what the observation reuses.
        let source = ElementSource()
        let reading = costs.time("settleBusyWalk") { busyWalk(window, source: source, visibleFrame: frame(of: window), deadline: deadline) }
        costs.merge(source.costs)
        source.costs.reset()
        last = (source, window, reading.loadedWebArea)
        // A walk the deadline cut has no verdict: waiting on reaches the cap, which is reported.
        return reading.busy.map { !$0 }
      })
    report.observed = observer != nil
    let teardownStart = monotonicMilliseconds()
    observer?.invalidate()
    report.observerMs = setupMs + monotonicMilliseconds() - teardownStart
    guard !report.capped, !report.timedOut, let last else { return Settled(report: report) }
    return Settled(report: report, source: last.source, window: last.window, loadedWebArea: last.loadedWebArea)
  }
}

/// One busy walk's reading: `busy` true at the first sign, false when the window is quiet, nil when the walk was cut by
/// the settle's deadline (no verdict: the settle waits on and reports "capped"); and whether it passed a loaded
/// AXWebArea, after which the observation's web-area wait finds one at its first check and changes nothing.
struct BusyReading {
  var busy: Bool?
  var loadedWebArea = false
}

/// The busy walk (F §8.4) through the observation's element source: an `AXBusyIndicator`, an `AXWebArea` whose `AXLoaded`
/// is false, `AXElementBusy` true, or the DOM class `macos-mac-parity-spinner` anywhere under the window (a progress
/// indicator is not a sign). It walks what the observation would (the width rule, the depth and node caps), stopping at
/// the first sign or at `deadline`.
func busyWalk(_ window: AXUIElement, source: ElementSource, visibleFrame: CGRect?, deadline: Double) -> BusyReading {
  var reading = BusyReading()
  var stack: [(AXUIElement, Int)] = [(prepare(window), 0)]
  var seen = Set<ElementKey>()
  while let (element, depth) = stack.popLast(), seen.count < maxObservedNodes {
    guard monotonicMilliseconds() < deadline else { return reading }
    guard seen.insert(ElementKey(element: element)).inserted, let data = source.data(element) else { continue }
    if data.role == "AXBusyIndicator" || data.elementBusy == true || data.domClassList?.contains(busyMarkerClass) == true {
      reading.busy = true
      return reading
    }
    if data.role == "AXWebArea" {
      if data.loaded == false {
        reading.busy = true
        return reading
      }
      reading.loadedWebArea = true
    }
    if depth < maxDepth {
      for child in chooseChildren(of: element, data: data, source: source, visibleFrame: visibleFrame).children.reversed() {
        stack.append((prepare(child), depth + 1))
      }
    }
  }
  reading.busy = false
  return reading
}

/// Whether the observation reads the tree the settle's last busy walk fetched (F §8.5): only for the same window, with
/// no enablement since, and no web-area wait unless that walk already passed a loaded web area.
func adoptsSettledTree(sameWindow: Bool, enabledNow: Bool, waited: Bool, loadedWebArea: Bool) -> Bool {
  sameWindow && !enabledNow && (!waited || loadedWebArea)
}
