import AppKit
import ApplicationServices
import Foundation

// Observation (the spec's Design, "Observation (skyshot)"): get_app_state walks the app's key window (AXFocusedWindow,
// else AXMainWindow) depth-first in preorder, fetching per element in one batched call, then its actions, and returns a
// `Skyshot` JSON tree; rendering to the model's text is the service's. Caps, each with its marker: 40 levels, 4,000
// nodes, 10,000 characters per value, a 6 MiB budget for the serialized tree enforced during the walk, and a 10 s
// traversal deadline apart from the request's. `timings` carries the per-phase durations the M0 spike measures.

let maxDepth = 40
let maxObservedNodes = 4_000
let observationDeadlineMs: Int64 = 10_000
let skyshotByteBudget = 6 * 1024 * 1024
/// `valueMarkdown` is fetched only for text elements whose plain value is at most this long.
let markdownMaxLength = 2_000
/// How long an app that is launching, or a Chromium page just given accessibility, is waited for.
let launchWindowWaitMs: Int64 = 5_000
let webAreaWaitMs = 1_000.0

nonisolated(unsafe) private let walkAttributes = [
  kAXRoleAttribute, kAXSubroleAttribute, kAXRoleDescriptionAttribute, kAXTitleAttribute, kAXDescriptionAttribute,
  kAXValueAttribute, kAXIdentifierAttribute, kAXEnabledAttribute, kAXFocusedAttribute, kAXSelectedAttribute,
  kAXPositionAttribute, kAXSizeAttribute, kAXChildrenAttribute, kAXExpandedAttribute,
] as CFArray

/// Text elements whose value may carry styling worth a Markdown rendering (the ones select_text quotes).
private let markdownRoles: Set<String> = [kAXTextAreaRole, kAXTextFieldRole]
private let checkableRoles: Set<String> = [kAXCheckBoxRole, kAXRadioButtonRole]

/// Per-phase timings and counts of one observation, returned as `Skyshot.timings`.
struct Timings {
  private var phases: [String: Double] = [:]
  private var counts: [String: Int] = [:]
  private var marks: [String: Bool] = [:]

  mutating func add(_ phase: String, _ ms: Double) { phases[phase, default: 0] += ms }
  mutating func count(_ name: String, _ by: Int = 1) { counts[name, default: 0] += by }
  mutating func mark(_ name: String) { marks[name] = true }

  /// Runs `body` and adds its duration to `phase`.
  mutating func time<T>(_ phase: String, _ body: () throws -> T) rethrows -> T {
    let start = monotonicMilliseconds()
    defer { add(phase, monotonicMilliseconds() - start) }
    return try body()
  }

  var wire: [String: Any] {
    var object: [String: Any] = [:]
    for (phase, ms) in phases { object[phase + "Ms"] = (ms * 1000).rounded() / 1000 }
    for (name, count) in counts { object[name] = count }
    for (name, flag) in marks { object[name] = flag }
    return object
  }
}

/// Apps whose web content needs AXManualAccessibility and AXEnhancedUserInterface to expose a tree, by bundle path;
/// and the processes already given them.
final class WebAccessibility: @unchecked Sendable {
  private let lock = NSLock()
  private var chromiumByPath: [String: Bool] = [:]
  private var enabledPids: Set<pid_t> = []

  func isChromium(_ appPath: String) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    if let known = chromiumByPath[appPath] { return known }
    let frameworks = (try? FileManager.default.contentsOfDirectory(atPath: appPath + "/Contents/Frameworks")) ?? []
    let chromium = frameworks.contains { $0.hasSuffix(".framework") && ($0.contains("Electron Framework") || $0.contains("Chrom")) }
    chromiumByPath[appPath] = chromium
    return chromium
  }

  /// Sets both attributes once per process; true when this call set them (the caller then waits for the web area).
  func enable(_ application: AXUIElement, pid: pid_t) -> Bool {
    lock.lock()
    let first = enabledPids.insert(pid).inserted
    lock.unlock()
    guard first else { return false }
    AXUIElementSetAttributeValue(application, "AXManualAccessibility" as CFString, kCFBooleanTrue)
    AXUIElementSetAttributeValue(application, "AXEnhancedUserInterface" as CFString, kCFBooleanTrue)
    return true
  }
}

extension Engine {
  /// `get_app_state {app, disableDiff?, includeScreenshot?, outputDirectory, valueMarkdown?}` → Skyshot. `disableDiff`
  /// is the service's (it diffs); `valueMarkdown: false` is the spike's switch for measuring the Markdown fetch's cost.
  func getAppState(_ args: [String: Any], _ context: ExecutionContext) throws -> [String: Any] {
    var timings = Timings()
    let started = monotonicMilliseconds()
    try requireAccessibility()
    try refuseWhenLocked()
    let includeScreenshot = args["includeScreenshot"] as? Bool ?? false
    let outputDirectory = args["outputDirectory"] as? String
    if includeScreenshot { guard outputDirectory?.hasPrefix("/") == true else { throw EngineError.invalidArguments("outputDirectory must be an absolute path") } }
    let markdownEnabled = args["valueMarkdown"] as? Bool ?? true

    var app = try timings.time("resolve") { try resolveApp(args) }
    var launched = false
    if !app.isRunning {
      let running = try timings.time("launch") { try apps.launch(app, deadline: min(context.deadline, unixMilliseconds() + launchWindowWaitMs)) }
      app = ResolvedApp(appPath: app.appPath, bundleIdentifier: running.bundleIdentifier ?? app.bundleIdentifier, displayName: running.localizedName ?? app.displayName, running: running)
      launched = true
    }
    let appPid = app.pid!
    let application = prepare(AXUIElementCreateApplication(appPid))

    var enabledNow = false
    if webAccessibility.isChromium(app.appPath) { enabledNow = timings.time("enable") { webAccessibility.enable(application, pid: appPid) } }

    let windowDeadline = launched ? min(context.deadline, unixMilliseconds() + launchWindowWaitMs) : unixMilliseconds()
    guard let window = try timings.time("window", { try keyWindow(of: application, until: windowDeadline, launched: launched) }) else {
      throw EngineError(name: "noWindowsAvailable", "noWindowsAvailable")
    }
    if enabledNow { timings.time("webAreaWait") { waitForWebArea(under: window) } }

    let connection = context.connection
    for key in connection.lineages.keys where key.hasPrefix(app.appPath + "#") && key != app.key { connection.lineages[key] = nil }
    let lineage = connection.lineages[app.key] ?? Lineage()
    connection.lineages[app.key] = lineage

    let walkDeadline = monotonicMilliseconds() + Double(min(observationDeadlineMs, max(0, context.deadline - unixMilliseconds())))
    var walk = Walk(lineage: lineage, deadline: walkDeadline, markdown: markdownEnabled)
    timings.time("walk") { walk.run(from: window) }
    timings.add("attributes", walk.attributesMs)
    timings.add("actions", walk.actionsMs)
    timings.add("settable", walk.settableMs)
    timings.add("markdown", walk.markdownMs)
    timings.count("nodes", walk.nodes.count)
    timings.count("markdownFetches", walk.markdownFetches)
    timings.count("estimatedBytes", walk.bytes)
    if walk.deadlineHit { timings.mark("deadlineHit") }
    if walk.budgetHit { timings.mark("budgetHit") }

    var focused: Any = NSNull()
    var selectedText: Any = NSNull()
    timings.time("focus") {
      if let element = elementAttribute(application, kAXFocusedUIElementAttribute) {
        if let index = walk.seen[ElementKey(element: element)] { focused = index }
        if let text = stringAttribute(element, kAXSelectedTextAttribute), !text.isEmpty { selectedText = bounded(text) }
      }
    }
    lineage.commit(walk.observed)
    connection.requiresRequery.remove(app.key)

    let windowFrame = frame(of: window)
    var screenshot: Any = NSNull()
    if includeScreenshot {
      screenshot = try capture(window: window, pid: pid(of: window), frame: windowFrame, into: outputDirectory!, name: app.displayName, revision: lineage.revision, timings: &timings)
    }
    timings.add("total", monotonicMilliseconds() - started)

    var truncated: [String: Any] = [:]
    if walk.depthHit { truncated["depth"] = maxDepth }
    if walk.omitted > 0 { truncated["count"] = walk.omitted }
    return [
      "app": app.appWire,
      "window": ["title": stringAttribute(window, kAXTitleAttribute).map(bounded) ?? "", "frame": rectWire(windowFrame), "pid": Int(pid(of: window))],
      "lineage": lineage.id,
      "revision": lineage.revision,
      "nodes": walk.nodes,
      "truncated": truncated.isEmpty ? NSNull() : truncated,
      "screenshot": screenshot,
      "focused": focused,
      "selectedText": selectedText,
      "timings": timings.wire,
    ]
  }

  /// The app's key window: AXFocusedWindow, else AXMainWindow; for an app just launched, polled until `deadline`.
  func keyWindow(of application: AXUIElement, until deadline: Int64, launched: Bool) throws -> AXUIElement? {
    while true {
      if let window = elementAttribute(application, kAXFocusedWindowAttribute) ?? elementAttribute(application, kAXMainWindowAttribute) {
        return window
      }
      if unixMilliseconds() >= deadline {
        if launched { throw EngineError(name: "timeoutReached", "timeoutReached") }
        return nil
      }
      usleep(50_000)
    }
  }

  /// After enabling a Chromium or Electron process, waits up to 1 s for an AXWebArea with content to appear.
  private func waitForWebArea(under window: AXUIElement) {
    let end = monotonicMilliseconds() + webAreaWaitMs
    repeat {
      var queue = [window]
      var visited = 0
      while !queue.isEmpty && visited < 400 {
        let element = queue.removeFirst()
        visited += 1
        if stringAttribute(element, kAXRoleAttribute) == "AXWebArea",
           let count = attributeCount(element, kAXChildrenAttribute), count > 0 { return }
        queue.append(contentsOf: children(attribute(element, kAXChildrenAttribute)).map(prepare))
      }
      usleep(50_000)
    } while monotonicMilliseconds() < end
  }
}

private func attributeCount(_ element: AXUIElement, _ name: String) -> Int? {
  var count: CFIndex = 0
  return AXUIElementGetAttributeValueCount(element, name as CFString, &count) == .success ? count : nil
}

/// One depth-first walk of a window under the caps.
struct Walk {
  let lineage: Lineage
  let deadline: Double
  let markdown: Bool

  var nodes: [[String: Any]] = []
  var observed: [Int: LineageEntry] = [:]
  var seen: [ElementKey: Int] = [:]
  var bytes = 0
  var omitted = 0
  var depthHit = false
  var deadlineHit = false
  var budgetHit = false
  var attributesMs = 0.0
  var actionsMs = 0.0
  var settableMs = 0.0
  var markdownMs = 0.0
  var markdownFetches = 0

  init(lineage: Lineage, deadline: Double, markdown: Bool) {
    self.lineage = lineage
    self.deadline = deadline
    self.markdown = markdown
  }

  mutating func run(from window: AXUIElement) {
    var stack: [(element: AXUIElement, depth: Int, path: [Int])] = [(prepare(window), 0, [])]
    while let next = stack.popLast() {
      if nodes.count >= maxObservedNodes || bytes >= skyshotByteBudget || monotonicMilliseconds() >= deadline {
        if bytes >= skyshotByteBudget { budgetHit = true } else if nodes.count < maxObservedNodes { deadlineHit = true }
        omitted += stack.count + 1
        return
      }
      let key = ElementKey(element: next.element)
      if seen[key] != nil { continue }
      guard let node = visit(next.element, depth: next.depth, path: next.path, key: key) else { omitted += 1; continue }
      if next.depth < maxDepth {
        for (position, child) in node.children.enumerated().reversed() { stack.append((prepare(child), next.depth + 1, next.path + [position])) }
      } else if !node.children.isEmpty {
        depthHit = true
      }
    }
  }

  private mutating func visit(_ element: AXUIElement, depth: Int, path: [Int], key: ElementKey) -> (index: Int, children: [AXUIElement])? {
    let start = monotonicMilliseconds()
    var values: CFArray?
    let error = AXUIElementCopyMultipleAttributeValues(element, walkAttributes, AXCopyMultipleAttributeOptions(rawValue: 0), &values)
    attributesMs += monotonicMilliseconds() - start
    guard error == .success, let slots = values as? [Any], slots.count == 14 else { return nil }
    let string = { (slot: Int) -> String? in present(slots[slot]).flatMap { CFGetTypeID($0) == CFStringGetTypeID() ? bounded($0 as! String) : nil } }
    let role = string(0) ?? "AXUnknown"
    let subrole = string(1)
    let title = string(3)
    let identifier = string(6)
    let rawValue = present(slots[5])
    let value = scalar(rawValue)
    let elementChildren = children(present(slots[12]))
    let elementFrame: CGRect? = point(present(slots[10])).flatMap { origin in size(present(slots[11])).map { CGRect(origin: origin, size: $0) } }
    let ownerPid = pid(of: element)

    let actionsStart = monotonicMilliseconds()
    var names: CFArray?
    let actions = AXUIElementCopyActionNames(element, &names) == .success ? (names as? [String] ?? []) : []
    actionsMs += monotonicMilliseconds() - actionsStart

    var settable = false
    if rawValue != nil {
      let settableStart = monotonicMilliseconds()
      var flag = DarwinBoolean(false)
      if AXUIElementIsAttributeSettable(element, kAXValueAttribute as CFString, &flag) == .success { settable = flag.boolValue }
      settableMs += monotonicMilliseconds() - settableStart
    }

    var valueMarkdown: String?
    if markdown, markdownRoles.contains(role), let text = rawValue.flatMap({ CFGetTypeID($0) == CFStringGetTypeID() ? ($0 as! String) : nil }) {
      let length = text.utf16.count
      if length > 0 && length <= markdownMaxLength {
        let markdownStart = monotonicMilliseconds()
        valueMarkdown = markdownRendering(of: element, length: length)
        markdownMs += monotonicMilliseconds() - markdownStart
        markdownFetches += 1
      }
    }

    var flags: [String: Any] = [
      "enabled": bool(present(slots[7])) ?? true,
      "focused": bool(present(slots[8])) ?? false,
      "selected": bool(present(slots[9])) ?? false,
      "settable": settable,
    ]
    if let expanded = bool(present(slots[13])) { flags["expanded"] = expanded }
    if checkableRoles.contains(role), let number = value as? Int64 { flags["checked"] = number != 0 }

    let index = lineage.index(for: element)
    seen[key] = index
    let roleDescription = string(2) ?? ""
    let description = string(4)
    nodes.append([
      "index": index, "depth": depth, "pid": Int(ownerPid), "role": role, "subrole": subrole ?? NSNull(),
      "roleDescription": roleDescription, "title": title ?? NSNull(), "description": description ?? NSNull(),
      "value": value ?? NSNull(), "valueMarkdown": valueMarkdown ?? NSNull(), "identifier": identifier ?? NSNull(),
      "flags": flags, "actions": actions, "frame": rectWire(elementFrame), "children": elementChildren.count,
    ])
    observed[index] = LineageEntry(element: element, identity: ElementIdentity(role: role, identifier: identifier, title: title, path: path, pid: ownerPid),
                                   actions: actions, frame: elementFrame)
    bytes += 240 + role.utf8.count + roleDescription.utf8.count + (subrole?.utf8.count ?? 0) + (title?.utf8.count ?? 0)
      + (description?.utf8.count ?? 0) + (identifier?.utf8.count ?? 0) + ((value as? String)?.utf8.count ?? 24)
      + (valueMarkdown?.utf8.count ?? 0) + actions.reduce(0) { $0 + $1.utf8.count + 3 }
    return (index, elementChildren)
  }
}

private let monospaceFamilies = ["menlo", "monaco", "courier", "sf mono", "sfmono", "andale mono", "consolas", "source code"]

/// The Markdown rendering of a text element's attributed value: bold, italic and fixed-width runs from the font each
/// run carries; nil when the value carries no such styling (the plain value then says everything).
private func markdownRendering(of element: AXUIElement, length: Int) -> String? {
  var range = CFRange(location: 0, length: length)
  guard let rangeValue = AXValueCreate(.cfRange, &range) else { return nil }
  var result: CFTypeRef?
  guard AXUIElementCopyParameterizedAttributeValue(element, kAXAttributedStringForRangeParameterizedAttribute as CFString, rangeValue, &result) == .success,
        let result, CFGetTypeID(result) == CFAttributedStringGetTypeID() else { return nil }
  let attributed = result as! NSAttributedString
  let text = attributed.string as NSString
  var rendered = ""
  var styled = false
  attributed.enumerateAttributes(in: NSRange(location: 0, length: attributed.length)) { attributes, run, _ in
    let piece = text.substring(with: run)
    let font = attributes[NSAttributedString.Key("AXFont")] as? [String: Any]
    let name = ((font?["AXFontName"] as? String) ?? "").lowercased()
    let family = ((font?["AXFontFamily"] as? String) ?? "").lowercased()
    let mono = monospaceFamilies.contains { name.contains($0) || family.contains($0) }
    let bold = !mono && ["bold", "black", "heavy", "semibold"].contains { name.contains($0) }
    let italic = !mono && (name.contains("italic") || name.contains("oblique"))
    let marker = mono ? "`" : (bold ? "**" : "") + (italic ? "*" : "")
    let core = piece.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !marker.isEmpty, !core.isEmpty else { rendered += piece; return }
    styled = true
    let leading = piece.prefix { $0.isWhitespace || $0.isNewline }
    let trailing = String(piece.reversed().prefix { $0.isWhitespace || $0.isNewline }.reversed())
    rendered += leading + marker + core + String(marker.reversed()) + trailing
  }
  return styled ? bounded(rendered) : nil
}
