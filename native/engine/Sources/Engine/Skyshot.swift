import AppKit
import ApplicationServices
import Foundation

// Observation (the spec's Design, "Observation (skyshot)"): get_app_state settles first when the app was acted on since
// its last observation (Settle.swift), enables a web-shaped app's accessibility (Enablement.swift), then walks the
// app's primary window (AXFocusedWindow, else AXMainWindow, else the last of AXWindows) plus the menu bar's top-level
// items (Walk.swift) and returns a `Skyshot` JSON tree; rendering to the model's text is the service's. `timings`
// carries the per-phase durations and counts the M0 spike measures; the request's switches choose what it prices.

/// How long an app the observation opened (launched, or reopened with no primary window) is waited for: the vendor's
/// `waitUntilHasPrimaryWindow` 0x1006fbdf0, 5.0 s at 0x100164ae8, polled every 50 ms.
let launchWindowWaitMs: Int64 = 5_000

/// What reading an app's primary window found (F §1.7's three steps): the window; a confirmed absence, every step
/// answered with no window; or a read that failed (the app could not answer, e.g. `kAXErrorCannotComplete`).
enum WindowRead { case window(AXUIElement), absent, failed(AXError) }

/// The errors that confirm an attribute has no window rather than that the app could not be read.
private let absentErrors: Set<AXError> = [.noValue, .attributeUnsupported]

/// The primary window read through `read` (one attribute's value and error).
func readPrimaryWindow(_ read: (String) -> (value: CFTypeRef?, error: AXError)) -> WindowRead {
  var failure: AXError?
  for name in [kAXFocusedWindowAttribute, kAXMainWindowAttribute] {
    let (value, error) = read(name)
    if error == .success, let value, CFGetTypeID(value) == AXUIElementGetTypeID() { return .window(prepare(value as! AXUIElement)) }
    if error != .success, !absentErrors.contains(error) { failure = failure ?? error }
  }
  let (windows, error) = read(kAXWindowsAttribute)
  if error == .success, let last = elementList(windows).last { return .window(prepare(last)) }
  if error != .success, !absentErrors.contains(error) { failure = failure ?? error }
  return failure.map { .failed($0) } ?? .absent
}

/// The observation's preparation, the vendor's (0x10014c494 → 0x10014c4f0, its open helper 0x100164860 →
/// 0x1001648c4): an app that is not running is launched; a running app whose primary window reads as absent gets a
/// non-activating open (a reopen), which some apps (TextEdit, Finder) answer by opening a window. Two declared
/// differences (Decision Log, M1b.5): an app whose read failed is never opened (its read is retried until the deadline,
/// then `timeoutReached`), where the vendor's failed read reads as no window; and a minimized primary window is never
/// reopened, since the reopen would un-minimize the owner's window. The reads are charged to the request's deadline: no
/// open is sent once it has passed. The open's own process is the one observed after it, so an app replaced
/// meanwhile is followed. -> {opened, the open's process (nil when nothing was opened), the pid to observe}.
func prepareTarget<Running>(pid: pid_t?, deadline: Int64, now: () -> Int64, sleep: () -> Void,
                            read: (pid_t) -> WindowRead,
                            open: (_ deadline: Int64) throws -> (running: Running, pid: pid_t)) throws -> (opened: Bool, running: Running?, pid: pid_t) {
  let timeout = EngineError(name: "timeoutReached", "timeoutReached")
  func openNow() throws -> (opened: Bool, running: Running?, pid: pid_t) {
    guard now() < deadline else { throw timeout }
    let (running, openedPid) = try open(min(deadline, now() + launchWindowWaitMs))
    return (true, running, openedPid)
  }
  guard now() < deadline else { throw timeout }
  guard let pid else { return try openNow() }
  while true {
    switch read(pid) {
    case .window: return (false, nil, pid)
    case .absent: return try openNow()
    case .failed:
      guard now() < deadline else { throw timeout }
      sleep()
    }
  }
}

/// Per-phase timings, counts and labels of one observation, returned as `Skyshot.timings`.
struct Timings {
  private var phases: [String: Double] = [:]
  private var values: [String: Any] = [:]

  mutating func add(_ phase: String, _ ms: Double) { phases[phase, default: 0] += ms }
  mutating func set(_ name: String, _ value: Any) { values[name] = value }
  mutating func count(_ name: String, _ by: Int) { values[name] = ((values[name] as? Int) ?? 0) + by }

  /// Runs `body` and adds its duration to `phase`.
  mutating func time<T>(_ phase: String, _ body: () throws -> T) rethrows -> T {
    let start = monotonicMilliseconds()
    defer { add(phase, monotonicMilliseconds() - start) }
    return try body()
  }

  /// Adds another record's phases and takes its values (a concurrent part of the same observation).
  mutating func merge(_ other: Timings) {
    for (phase, ms) in other.phases { add(phase, ms) }
    for (name, value) in other.values { values[name] = value }
  }

  mutating func merge(_ costs: FetchCosts) {
    for (phase, ms) in costs.ms { add(phase, ms) }
    for (name, n) in costs.counts { count(name, n) }
  }

  var wire: [String: Any] {
    var object = values
    for (phase, ms) in phases { object[phase + "Ms"] = (ms * 1000).rounded() / 1000 }
    return object
  }
}

/// A capture started on its own thread; `wait()` joins it and hands back its result with the timings it recorded.
/// `result` and `timings` are written once on that thread before `done` is signalled and read only after `wait()` has
/// taken the signal, which orders the two.
final class PendingCapture<Value>: @unchecked Sendable {
  private let done = DispatchSemaphore(value: 0)
  private var result: Result<Value, Error> = .failure(EngineError(name: "screenCaptureFailed", "The capture did not run."))
  private var timings = Timings()

  init(_ body: @escaping @Sendable (inout Timings) throws -> Value) {
    let thread = Thread { [self] in
      var recorded = Timings()
      let outcome = Result { try body(&recorded) }
      timings = recorded
      result = outcome
      done.signal()
    }
    thread.name = "cua-engine capture"
    thread.start()
  }

  func wait() -> (result: Result<Value, Error>, timings: Timings) {
    done.wait()
    return (result, timings)
  }
}

/// The primary window (F §1.7): AXFocusedWindow, else AXMainWindow, else the last of AXWindows.
func primaryWindow(of application: AXUIElement) -> AXUIElement? {
  elementAttribute(application, kAXFocusedWindowAttribute)
    ?? elementAttribute(application, kAXMainWindowAttribute)
    ?? elementList(attribute(application, kAXWindowsAttribute)).last.map(prepare)
}

extension Engine {
  /// `get_app_state {app, disableDiff?, includeScreenshot?, outputDirectory}` → Skyshot. The M0 spike's measuring
  /// switches the facade never sends: `valueMarkdown: false` (skip the Markdown fetch), `focusableSelectable: false`
  /// (skip the focusable and selectable settability reads), `webAreaWait: false` (skip the web-area wait), `settle:
  /// true | false` (force or skip the settle that an earlier action otherwise arms). The request's deadline cancels a
  /// settle or a launch wait still running when it passes, as `timeoutReached`.
  func getAppState(_ args: [String: Any], _ context: ExecutionContext) throws -> [String: Any] {
    var timings = Timings()
    let started = monotonicMilliseconds()
    try requireAccessibility()
    try refuseWhenLocked()
    let includeScreenshot = args["includeScreenshot"] as? Bool ?? false
    let outputDirectory = args["outputDirectory"] as? String
    if includeScreenshot { guard outputDirectory?.hasPrefix("/") == true else { throw EngineError.invalidArguments("outputDirectory must be an absolute path") } }
    let markdownEnabled = args["valueMarkdown"] as? Bool ?? true
    let interactionFlags = args["focusableSelectable"] as? Bool ?? true
    let webAreaWaitEnabled = args["webAreaWait"] as? Bool ?? true

    var app = try timings.time("resolve") { try resolveApp(args) }
    let target = try timings.time("prepare") {
      try prepareTarget(pid: app.pid, deadline: context.deadline, now: unixMilliseconds, sleep: { usleep(50_000) },
                        read: { pid in let element = prepare(AXUIElementCreateApplication(pid)); return readPrimaryWindow { copyAttribute(element, $0) } },
                        open: { deadline in let running = try apps.launch(app, deadline: deadline); return (running, running.processIdentifier) })
    }
    if let running = target.running {
      timings.set(app.isRunning ? "reopened" : "launched", true)
      app = ResolvedApp(appPath: app.appPath, bundleIdentifier: running.bundleIdentifier ?? app.bundleIdentifier, displayName: running.localizedName ?? app.displayName, running: running)
    }
    let opened = target.opened
    let appPid = target.pid
    let application = prepare(AXUIElementCreateApplication(appPid))
    let connection = context.connection
    let webShaped = webAccessibility.isWebShaped(app.appPath)
    timings.set("webShaped", webShaped)

    // The settle an earlier action armed (or the request forces) runs before anything is read; its last busy walk's
    // reads are handed to the observation.
    var settleMarker: Any?
    var settled: Settled?
    if args["settle"] as? Bool ?? connection.needsSettle.contains(app.key) {
      let settleCosts = FetchCosts()
      let requestDeadline = monotonicMilliseconds() + Double(context.deadline - unixMilliseconds())
      let outcome = settle(application, pid: appPid, webShaped: webShaped, deadline: requestDeadline, costs: settleCosts)
      settled = outcome
      let report = outcome.report
      // The action's settle stays armed: the next observation settles again.
      if report.timedOut { throw EngineError(name: "timeoutReached", "timeoutReached") }
      timings.add("settle", report.ms)
      for (phase, ms) in settleCosts.ms { timings.add(phase == "settleBusyWalk" ? phase : "settleBusyWalk" + phase.prefix(1).uppercased() + phase.dropFirst(), ms) }
      for (name, n) in settleCosts.counts { timings.count("settleBusyWalk" + name.prefix(1).uppercased() + name.dropFirst(), n) }
      timings.set("settle", report.capped ? "capped" : "settled")
      timings.set("settleNotifications", report.total)
      timings.set("settleNotificationCounts", report.counts)
      timings.set("settleIgnoredTitleChanges", report.ignoredTitleChanges)
      timings.set("settleBusyWalks", report.busyWalks)
      timings.set("settleBusyVetoes", report.busyVetoes)
      timings.set("settleObserved", report.observed)
      timings.add("settleObserver", report.observerMs)
      if let quietAt = report.quietAtMs { timings.set("settleQuietAtMs", (quietAt * 1000).rounded() / 1000) }
      if report.capped { settleMarker = "capped" }
    }
    connection.needsSettle.remove(app.key)

    var enabledNow = false
    let eligible = enablementEligible(bundleIdentifier: app.bundleIdentifier, webShaped: webShaped)
    if eligible, let attribute = timings.time("enable", { webAccessibility.enable(application, pid: appPid) }) {
      timings.set("enabled", attribute)
      enabledNow = true
    }

    let windowDeadline = opened ? min(context.deadline, unixMilliseconds() + launchWindowWaitMs) : unixMilliseconds()
    guard let window = try timings.time("window", { try awaitPrimaryWindow(of: application, until: windowDeadline, opened: opened) }) else {
      throw EngineError(name: "noWindowsAvailable", "noWindowsAvailable")
    }
    // The wait follows any enabling (the named bundles' too) and every Chromium window.
    var waited = false
    var chromium = false
    if webShaped {
      chromium = timings.time("chromiumCheck") { isChromiumWindow(window) }
      timings.set("chromium", chromium)
    }
    let launchDate = app.running?.launchDate
    let seenBefore = webAccessibility.hasSeenWebArea(pid: appPid, launched: launchDate)
    if seenBefore { timings.set("webAreaSeen", true) }
    if webAreaWaitNeeded(switchOn: webAreaWaitEnabled, enabledNow: enabledNow, chromium: chromium, seen: seenBefore) {
      let found = timings.time("webAreaWait") { waitForWebArea(under: window) }
      timings.set("webAreaFound", found)
      if found { webAccessibility.noteWebArea(pid: appPid, launched: launchDate) }
      waited = true
    }

    if args["disableDiff"] as? Bool == true { connection.lineages[app.key] = nil }
    for key in connection.lineages.keys where key.hasPrefix(app.appPath + "#") && key != app.key { connection.lineages[key] = nil }
    let lineage = connection.lineages[app.key] ?? Lineage()
    connection.lineages[app.key] = lineage
    // The watch starts before the walk reads: the app's process and every process whose elements the last revision held.
    timings.time("monitor") {
      lineage.watch(Set([appPid]).union(lineage.current?.owners ?? []), afterRead: false)
      lineage.resetWatches()
    }

    let menuBarElement = timings.time("menuBar") { elementAttribute(application, kAXMenuBarAttribute) }
    let menuItems = timings.time("menuBar") { menuBarElement.map { elementList(attribute($0, kAXChildrenAttribute)) } ?? [] }
    let windowFrame = frame(of: window)
    // The window capture runs beside the tree walk (in-sitting tuning iteration 1): it needs only the window and its
    // frame, and the walk does not depend on it, so the observation costs the longer of the two, not their sum.
    // Its file is named with the revision this observation commits, which the Skyshot reports.
    let captureRevision = lineage.nextRevision, capturePid = pid(of: window), displayName = app.displayName
    // Sound though the SDK does not mark AXUIElement Sendable: the element is an immutable reference (its process and
    // element token never change), and the capture thread only passes it to AX calls, which any thread may make, as
    // the walk's own reads of the same window on this thread do.
    nonisolated(unsafe) let captureWindow = window
    let pendingCapture: PendingCapture<CapturedScreenshot>? = includeScreenshot
      ? PendingCapture { [self] timings in
          try capture(window: captureWindow, pid: capturePid, frame: windowFrame, into: outputDirectory!, name: displayName,
                      revision: captureRevision, timings: &timings)
        }
      : nil
    // The settle's reads stand for the tree only when nothing changed it since (adoptsSettledTree).
    let source: ElementSource
    if let settled, let reused = settled.source, let busyWindow = settled.window,
       adoptsSettledTree(sameWindow: CFEqual(busyWindow, window), enabledNow: enabledNow, waited: waited, loadedWebArea: settled.loadedWebArea) {
      source = reused
      timings.set("settleTreeReused", true)
    } else {
      source = ElementSource()
      if settled != nil { timings.set("settleTreeReused", false) }
    }
    let deadline = monotonicMilliseconds() + Double(min(observationDeadlineMs, max(0, context.deadline - unixMilliseconds())))
    let walk = TreeWalk(source: source, lineage: lineage, limits: WalkLimits(deadline: deadline), markdown: markdownEnabled,
                        interactionFlags: interactionFlags, chromium: chromium, visibleFrame: windowFrame)
    timings.time("walk") { walk.run(window: window, menuBar: menuBarElement, menuItems: menuItems) }
    timings.merge(source.costs)
    timings.set("nodes", walk.nodes.count + walk.menuBar.count)
    timings.set("markdownFetches", walk.markdownFetches)
    timings.set("estimatedBytes", walk.bytes)
    timings.set("fetchFailures", walk.failures)
    // A web area the walk itself emitted counts as seen too, so a process whose page was already exposed never waits.
    if webShaped, walk.nodes.contains(where: { $0["role"] as? String == "AXWebArea" }) {
      webAccessibility.noteWebArea(pid: appPid, launched: launchDate)
    }
    if walk.deadlineHit { timings.set("deadlineHit", true) }
    if walk.budgetHit { timings.set("budgetHit", true) }
    if walk.nodeCapHit { timings.set("nodeCapHit", true) }

    var focused: Any = NSNull()
    var selectedText: Any = NSNull()
    var selectedElements: [String] = []
    var focusRead: String?
    timings.time("focus") {
      // The vendor's focus is the application's AXFocusedUIElement (ApplicationUIElement.focusedUIElementContext()
      // 0x100774a9c, tolerating no value and an unsupported attribute; F §1.7), with no fallback. Why a read answered
      // nothing is kept in the timings, so a live comparison can tell an app that answered no focus from one whose
      // focused element the walk did not reach.
      let read = copyAttribute(application, kAXFocusedUIElementAttribute)
      guard let value = read.value, CFGetTypeID(value) == AXUIElementGetTypeID() else {
        focusRead = read.error == .success ? "notAnElement" : "AXError \(read.error.rawValue)"
        return
      }
      let element = prepare(value as! AXUIElement)
      if let token = walk.token(of: element) { focused = token } else { focusRead = "outsideTheWalk" }
      if let text = stringAttribute(element, kAXSelectedTextAttribute), !text.isEmpty { selectedText = bounded(text) }
      // The selected elements the trailer names: the focused element's selected children, else its selected rows.
      for name in [kAXSelectedChildrenAttribute, kAXSelectedRowsAttribute] {
        let selected = elementList(attribute(element, name)).compactMap { walk.token(of: $0) }
        if !selected.isEmpty { selectedElements = selected; break }
      }
    }
    if let focusRead { timings.set("focusRead", focusRead) }
    lineage.commit(walk.revision)
    // A process the walk met for the first time (a panel's service) is watched from now on; it cannot vouch for the time
    // since its elements were read, so it invalidates until the next observation.
    timings.time("monitor") { lineage.watch(Set([appPid]).union(walk.revision.owners), afterRead: true) }
    timings.set("watchedProcesses", lineage.watched)
    connection.requiresRequery.remove(app.key)

    var screenshot: Any = NSNull()
    if let pendingCapture {
      let joined = timings.time("screenshotJoin") { pendingCapture.wait() }
      timings.merge(joined.timings)
      let image = try joined.result.get()
      screenshot = image.wire
      lineage.screenshot = ObservedScreenshot(window: window, image: image)  // what this window's coordinate clicks divide by
    }
    timings.add("total", monotonicMilliseconds() - started)

    var truncated: [String: Any] = [:]
    if walk.depthHit { truncated["depth"] = maxDepth }
    if walk.omitted > 0 { truncated["count"] = walk.omitted }
    // Whether the app is a Catalyst app, which filterActions consults (FUN_100782c24; the renderer's): the vendor's
    // ApplicationUIElement.isCatalystApp 0x100704c88 reads the application's `exhibitsMacCatalystBehavior`
    // (`_AXExhibitsMacCatalystBehavior`, false when it answers none), and the transformation context's init 0x100747490
    // calls it [inference: the context's isCatalyst is the param_2 filterActions reads].
    var appWire = app.appWire
    appWire["catalyst"] = bool(attribute(application, "_AXExhibitsMacCatalystBehavior")) ?? false
    var skyshot: [String: Any] = [
      "app": appWire,
      "window": ["title": windowTitle(window, pid: pid(of: window), frame: windowFrame) ?? NSNull(), "frame": rectWire(windowFrame), "pid": Int(pid(of: window))],
      "lineage": lineage.id,
      "revision": lineage.revision,
      "nodes": walk.nodes,
      "menuBar": walk.menuBar,
      "truncated": truncated.isEmpty ? NSNull() : truncated,
      "screenshot": screenshot,
      "focused": focused,
      "selectedText": selectedText,
      "selectedElements": selectedElements,
      "timings": timings.wire,
    ]
    if let settleMarker { skyshot["settle"] = settleMarker }
    return skyshot
  }

  /// The header's title for the observed window (Derivations.swift, `headerTitle`): the window server's name for it,
  /// else its AXTitle; nil when it has neither.
  func windowTitle(_ window: AXUIElement, pid owner: pid_t, frame: CGRect?) -> String? {
    let server = windowNumber(of: window, pid: owner, frame: frame).map(windowServerName) ?? (name: nil, desktopLevel: false)
    let ownerIsFinder = server.desktopLevel && NSRunningApplication(processIdentifier: owner)?.bundleIdentifier == "com.apple.finder"
    return headerTitle(windowName: server.name, axTitle: stringAttribute(window, kAXTitleAttribute).map(bounded),
                       desktopLevel: server.desktopLevel, ownerIsFinder: ownerIsFinder)
  }

}

/// The primary window, polled every 50 ms until `deadline` (Unix ms); past it, `timeoutReached` for an app the
/// observation opened (the vendor's wait throws it, 0x1006fbf70), else nil (`noWindowsAvailable` at the caller).
func awaitPrimaryWindow(of application: AXUIElement, until deadline: Int64, opened: Bool) throws -> AXUIElement? {
  while true {
    if let window = primaryWindow(of: application) { return window }
    if unixMilliseconds() >= deadline {
      if opened { throw EngineError(name: "timeoutReached", "timeoutReached") }
      return nil
    }
    usleep(50_000)
  }
}
