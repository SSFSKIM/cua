import AppKit
import ApplicationServices
import Foundation

// Observation (the spec's Design, "Observation (skyshot)"): get_app_state settles first when the app was acted on since
// its last observation (Settle.swift), enables a web-shaped app's accessibility (Enablement.swift), then walks the
// app's primary window (AXFocusedWindow, else AXMainWindow, else the last of AXWindows) plus the menu bar's top-level
// items (Walk.swift) and returns a `Skyshot` JSON tree; rendering to the model's text is the service's. `timings`
// carries the per-phase durations and counts the M0 spike measures; the request's switches choose what it prices.

/// How long an app that is launching is waited for.
let launchWindowWaitMs: Int64 = 5_000

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

/// The primary window (F §1.7): AXFocusedWindow, else AXMainWindow, else the last of AXWindows.
func primaryWindow(of application: AXUIElement) -> AXUIElement? {
  elementAttribute(application, kAXFocusedWindowAttribute)
    ?? elementAttribute(application, kAXMainWindowAttribute)
    ?? elementList(attribute(application, kAXWindowsAttribute)).last.map(prepare)
}

extension Engine {
  /// `get_app_state {app, disableDiff?, includeScreenshot?, outputDirectory}` → Skyshot. The spike's switches:
  /// `prefetch: "public" | "hierarchy"` (the fetch route, default public), `valueMarkdown: false` (skip the Markdown
  /// fetch), `focusableSelectable: false` (skip the focusable and selectable settability reads), `webAreaWait: false`
  /// (skip the web-area wait), `settle: true | false` (force or skip the settle that an earlier action otherwise arms).
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
    let route: FetchRoute
    switch args["prefetch"] {
    case nil, is NSNull: route = .publicFetch
    case let name as String:
      guard let chosen = FetchRoute(rawValue: name) else { throw EngineError.invalidArguments("prefetch must be \"public\" or \"hierarchy\"") }
      route = chosen
    default: throw EngineError.invalidArguments("prefetch must be \"public\" or \"hierarchy\"")
    }

    var app = try timings.time("resolve") { try resolveApp(args) }
    var launched = false
    if !app.isRunning {
      let running = try timings.time("launch") { try apps.launch(app, deadline: min(context.deadline, unixMilliseconds() + launchWindowWaitMs)) }
      app = ResolvedApp(appPath: app.appPath, bundleIdentifier: running.bundleIdentifier ?? app.bundleIdentifier, displayName: running.localizedName ?? app.displayName, running: running)
      launched = true
    }
    let appPid = app.pid!
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
      let outcome = settle(application, pid: appPid, webShaped: webShaped, route: route, costs: settleCosts)
      settled = outcome
      let report = outcome.report
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
      if report.capped { settleMarker = "capped" }
    }
    connection.needsSettle.remove(app.key)

    var enabledNow = false
    let eligible = enablementEligible(bundleIdentifier: app.bundleIdentifier, webShaped: webShaped)
    if eligible, let attribute = timings.time("enable", { webAccessibility.enable(application, pid: appPid) }) {
      timings.set("enabled", attribute)
      enabledNow = true
    }

    let windowDeadline = launched ? min(context.deadline, unixMilliseconds() + launchWindowWaitMs) : unixMilliseconds()
    guard let window = try timings.time("window", { try awaitPrimaryWindow(of: application, until: windowDeadline, launched: launched) }) else {
      throw EngineError(name: "noWindowsAvailable", "noWindowsAvailable")
    }
    // The wait follows any enabling (the named bundles' too) and every Chromium window.
    var waited = false
    var chromium = false
    if webShaped {
      chromium = timings.time("chromiumCheck") { isChromiumWindow(window) }
      timings.set("chromium", chromium)
    }
    if webAreaWaitEnabled && (enabledNow || chromium) {
      timings.set("webAreaFound", timings.time("webAreaWait") { waitForWebArea(under: window) })
      waited = true
    }

    if args["disableDiff"] as? Bool == true { connection.lineages[app.key] = nil }
    for key in connection.lineages.keys where key.hasPrefix(app.appPath + "#") && key != app.key { connection.lineages[key] = nil }
    let lineage = connection.lineages[app.key] ?? Lineage()
    connection.lineages[app.key] = lineage
    timings.time("monitor") {
      if lineage.monitor == nil { lineage.monitor = InvalidationMonitor(pid: appPid) }
      lineage.monitor?.reset()
    }
    timings.set("monitored", lineage.monitor != nil)

    let menuItems = timings.time("menuBar") { elementAttribute(application, kAXMenuBarAttribute).map { elementList(attribute($0, kAXChildrenAttribute)) } ?? [] }
    let windowFrame = frame(of: window)
    // The settle's reads stand for the tree only when nothing changed it since (adoptsSettledTree).
    let source: ElementSource
    if let settled, let reused = settled.source, let busyWindow = settled.window,
       adoptsSettledTree(sameWindow: CFEqual(busyWindow, window), enabledNow: enabledNow, waited: waited, loadedWebArea: settled.loadedWebArea) {
      source = reused
      timings.set("settleTreeReused", true)
    } else {
      source = makeSource(route)
      if settled != nil { timings.set("settleTreeReused", false) }
    }
    timings.set("route", source.route.rawValue)
    let deadline = monotonicMilliseconds() + Double(min(observationDeadlineMs, max(0, context.deadline - unixMilliseconds())))
    let walk = TreeWalk(source: source, lineage: lineage, limits: WalkLimits(deadline: deadline), markdown: markdownEnabled,
                        interactionFlags: interactionFlags, visibleFrame: windowFrame)
    timings.time("walk") { walk.run(window: window, menuItems: menuItems) }
    timings.merge(source.costs)
    timings.set("nodes", walk.nodes.count + walk.menuBar.count)
    timings.set("markdownFetches", walk.markdownFetches)
    timings.set("estimatedBytes", walk.bytes)
    timings.set("fetchFailures", walk.failures)
    if walk.deadlineHit { timings.set("deadlineHit", true) }
    if walk.budgetHit { timings.set("budgetHit", true) }
    if walk.nodeCapHit { timings.set("nodeCapHit", true) }

    var focused: Any = NSNull()
    var selectedText: Any = NSNull()
    var selectedElements: [Int] = []
    timings.time("focus") {
      guard let element = elementAttribute(application, kAXFocusedUIElementAttribute) else { return }
      if let index = walk.seen[ElementKey(element: element)] { focused = index }
      if let text = stringAttribute(element, kAXSelectedTextAttribute), !text.isEmpty { selectedText = bounded(text) }
      // The selected elements the trailer names: the focused element's selected children, else its selected rows.
      for name in [kAXSelectedChildrenAttribute, kAXSelectedRowsAttribute] {
        let selected = elementList(attribute(element, name)).compactMap { walk.seen[ElementKey(element: $0)] }
        if !selected.isEmpty { selectedElements = selected; break }
      }
    }
    lineage.commit(walk.revision)
    connection.requiresRequery.remove(app.key)

    var screenshot: Any = NSNull()
    if includeScreenshot {
      screenshot = try capture(window: window, pid: pid(of: window), frame: windowFrame, into: outputDirectory!, name: app.displayName, revision: lineage.revision, timings: &timings)
    }
    timings.add("total", monotonicMilliseconds() - started)

    var truncated: [String: Any] = [:]
    if walk.depthHit { truncated["depth"] = maxDepth }
    if walk.omitted > 0 { truncated["count"] = walk.omitted }
    var skyshot: [String: Any] = [
      "app": app.appWire,
      "window": ["title": stringAttribute(window, kAXTitleAttribute).map(bounded) ?? "", "frame": rectWire(windowFrame), "pid": Int(pid(of: window))],
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

  /// The app's primary window; for an app just launched, polled until `deadline`.
  func awaitPrimaryWindow(of application: AXUIElement, until deadline: Int64, launched: Bool) throws -> AXUIElement? {
    while true {
      if let window = primaryWindow(of: application) { return window }
      if unixMilliseconds() >= deadline {
        if launched { throw EngineError(name: "timeoutReached", "timeoutReached") }
        return nil
      }
      usleep(50_000)
    }
  }
}
