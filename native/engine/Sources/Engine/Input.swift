import AppKit
import ApplicationServices
import Foundation

// Input methods (the spec's Design, "Input"; R/F-helper-logic.md §5–6, R/sky-behaviour.md §10–14): click, press_key and
// type_text over routes 1–3. The engine never activates an app on its own (route 4 is not built), never moves the real
// pointer, and posts to the process that owns the target element. Every result and every error raised after the
// arguments validate carries the input meta (Interfaces, EngineProtocol): {inputRoute, startedAt, endedAt, receivedAt,
// hidIdleMs}, startedAt/endedAt null while nothing was posted, inputRoute null until a route is chosen; the guard's
// duration rides as activationGuardMs when route 3 ran one. The settle an action arms runs at the next get_app_state
// (markActed). Spike-only arguments, which the facade never sends and the spike service forwards: `spikeRoute`
// ("1"|"2"|"3", force one route), `spikeEventSource` ("private", post keys from a private event source instead of the
// HID-system one) and `spikeKeyed` (type_text: key through the layout regardless of the source routing, probe (e)'s
// per-context case). A non-concealed type_text that routes to the paste route answers notImplemented naming it, with
// inputRoute "paste"; the paste route itself is M2a.

/// The input meta of one request, whatever it answered. The route and the two times fill in as the action proceeds, so
/// an error thrown midway carries the state reached then.
struct InputMeta {
  var inputRoute: Any? = nil  // Int, "paste", or null before a route is chosen
  var startedAt: Int64? = nil
  var endedAt: Int64? = nil
  var activationGuardMs: Double? = nil
  let context: ExecutionContext

  init(_ context: ExecutionContext) { self.context = context }

  var wire: [String: Any] {
    var wire: [String: Any] = [
      "inputRoute": inputRoute ?? NSNull(),
      "startedAt": startedAt.map { Int($0) } ?? NSNull(),
      "endedAt": endedAt.map { Int($0) } ?? NSNull(),
      "receivedAt": Int(context.receivedAt),
      "hidIdleMs": context.hidIdleMs,
    ]
    if let activationGuardMs { wire["activationGuardMs"] = activationGuardMs }
    return wire
  }
}

/// Attaches `meta` to an error (the wire's `meta` member, beside code, message and errorName).
func withMeta(_ error: EngineError, _ meta: InputMeta) -> EngineError {
  var error = error
  error.extra["meta"] = meta.wire
  return error
}

extension Engine {
  // MARK: click

  /// `click {app, element_index | x, y, mouse_button?, click_count?}`. An element click takes route 1 (AXPick, else
  /// AXPress) when a plain left click's action is advertised and the element is not a menu-bar item; every other
  /// element click synthesizes the events under route 3 (F §5.1: the vendor synthesizes inside a web view and for
  /// menu-bar items; cua takes route 3 for all synthesized element clicks, M0's measured default). A coordinate click
  /// takes route 3 when the point is over web content, else route 2, whose events carry ⌘ when the target app is
  /// inactive (the AppKit convention for a click an inactive window accepts, F §5.4).
  func click(_ args: [String: Any], _ context: ExecutionContext) throws -> Any {
    let hasIndex = (args["element_index"] as? NSNumber).map { CFGetTypeID($0) != CFBooleanGetTypeID() } ?? false
    let hasPoint = numberArg(args["x"]) != nil && numberArg(args["y"]) != nil
    guard hasIndex != hasPoint else {
      throw EngineError.invalidArguments(hasIndex ? "click takes either element_index or coordinates, not both"
                                                  : "click needs element_index or x and y coordinates")
    }
    guard let button = MouseButton(wire: args["mouse_button"]) else {
      throw EngineError.invalidArguments("mouseButton must be left, right, middle, l, r, m, 0, 1, or 2")
    }
    let count = (args["click_count"] as? NSNumber)?.intValue ?? 1
    guard count >= 1 else { throw EngineError.invalidArguments("click_count must be at least 1") }
    let route = try spikeRouteArg(args, usable: hasIndex ? 1...3 : 2...3)

    var meta = InputMeta(context)
    do {
      let app = try resolveApp(args)
      guard let appPid = app.pid else { throw EngineError(.runningApplicationNotFound, "Running application not found: \(app.displayName)") }
      try requireAccessibility()
      try refuseWhenLocked()

      if hasIndex {
        let index = (args["element_index"] as! NSNumber).intValue
        guard index >= 0 else { throw EngineError.invalidArguments("element_index must be an integer") }
        let entry = try context.connection.element(index, app: app, lineage: context.lineage) {
          primaryWindow(of: prepare(AXUIElementCreateApplication(appPid)))
        }
        let advertised = entry.actions.first(where: { $0 == "AXPick" }) ?? entry.actions.first(where: { $0 == "AXPress" })
        let plain = button == .left && count == 1
        let menuBar = entry.identity.role == "AXMenuBarItem"

        if route == 1 || (route == nil && plain && !menuBar), let action = advertised {
          meta.inputRoute = 1
          meta.startedAt = unixMilliseconds()
          let error = AXUIElementPerformAction(entry.element, action as CFString)
          meta.endedAt = unixMilliseconds()
          guard error == .success else { throw EngineError(name: "actionFailed", "The element did not accept the \(action) action.") }
        } else if route == 1 {
          throw EngineError.invalidArguments("spikeRoute 1 cannot carry this click: the element advertises neither AXPick nor AXPress")
        } else {
          guard let elementFrame = entry.frame, elementFrame.width >= 1, elementFrame.height >= 1 else {
            throw EngineError(name: "cannotClickOffscreenElement", "The element is not visible on screen.")
          }
          let owner = ownerPid(of: entry.element)  // a sheet or panel is served by another process
          let window = primaryWindow(of: prepare(AXUIElementCreateApplication(appPid)))
          let windowFrame = window.flatMap { frame(of: $0) }
          let target = ClickTarget(point: CGPoint(x: elementFrame.midX, y: elementFrame.midY), windowFrame: windowFrame,
                                   windowID: window.flatMap { windowNumber(of: $0, pid: appPid, frame: windowFrame) }, pid: owner)
          try synthesizedClick(target, window: window ?? entry.element, pid: owner, button: button, count: count,
                              forced: route, meta: &meta)
        }
      } else {
        guard let x = numberArg(args["x"]), let y = numberArg(args["y"]), x.isFinite, y.isFinite else {
          throw EngineError.invalidArguments("x and y must be finite coordinates")
        }
        let application = prepare(AXUIElementCreateApplication(appPid))
        guard let window = primaryWindow(of: application), let windowFrame = frame(of: window) else {
          throw EngineError(name: "noWindowsAvailable", "noWindowsAvailable")
        }
        let local = windowPoint(fromScreenshot: x, y, scale: pixelScale(of: windowFrame))  // screenshot pixels to points
        let point = CGPoint(x: windowFrame.minX + local.x, y: windowFrame.minY + local.y)
        let hit = hitTest(window: window, at: point)
        let owner = hit.map { ownerPid(of: $0) } ?? appPid
        let target = ClickTarget(point: point, windowFrame: windowFrame, windowID: windowNumber(of: window, pid: appPid, frame: windowFrame), pid: owner)
        let web = hit.map(isWebContent) ?? false
        let chosen = route ?? (web ? 3 : 2)
        if chosen == 3 {
          // `forced` stays nil for a default web click, so the route reported is the one that carried it (a plain
          // pid-post when the app already believed it had focus), not the shape the route-3 branch was entered by.
          try synthesizedClick(target, window: window, pid: owner, button: button, count: count, forced: route, meta: &meta)
        } else {
          meta.inputRoute = 2
          let flags: CGEventFlags = NSRunningApplication(processIdentifier: owner)?.isActive == true ? [] : .maskCommand
          let events = clickEvents(target, button: button, count: count, flags: flags)
          guard !events.isEmpty else { throw EngineError(name: "eventCreationFailed", "The click events could not be created.") }
          let (startedAt, endedAt) = postToProcess(events, pid: owner)
          meta.startedAt = startedAt
          meta.endedAt = endedAt
        }
      }
      context.connection.markActed(app)
      return ["meta": meta.wire]
    } catch let error as EngineError {
      throw withMeta(error, meta)
    }
  }

  /// A synthesized click: forced route 2 posts straight to the owning pid (⌘ added when the target app is inactive);
  /// route 3 (the default for elements and web content) runs the fake activation first and the deactivation after.
  private func synthesizedClick(_ target: ClickTarget, window: AXUIElement, pid: pid_t, button: MouseButton, count: Int,
                                forced: Int?, meta: inout InputMeta) throws {
    let activation = FakeActivation(pid: target.pid, window: window)
    defer { activation.deactivate() }  // every path out of the click, error or success, undoes the activation
    let believedBefore = appBelievesItHasFocus(target.pid)
    if forced != 2 {
      if !believedBefore {
        try activation.activate()
        meta.activationGuardMs = activation.guardMs
      }
      meta.inputRoute = forced ?? (believedBefore ? 2 : 3)
    } else {
      meta.inputRoute = 2
    }
    let flags: CGEventFlags = forced == 2 && NSRunningApplication(processIdentifier: target.pid)?.isActive != true ? .maskCommand : []
    let events = clickEvents(target, button: button, count: count, flags: flags)
    guard !events.isEmpty else {
      throw EngineError(name: "eventCreationFailed", "The click events could not be created.")
    }
    let (startedAt, endedAt) = postToProcess(events, pid: target.pid)
    meta.startedAt = startedAt
    meta.endedAt = endedAt
  }

  // MARK: press_key

  /// `press_key {app, key}`: the vendor's grammar (Keyboard.swift), four events per press with no gap, posted to the
  /// app's pid; every keyboard action into an app that does not believe it has focus runs route 3's activation first
  /// (F §6.1).
  func pressKey(_ args: [String: Any], _ context: ExecutionContext) throws -> Any {
    guard let key = args["key"] as? String else { throw EngineError.invalidArguments("key is required") }
    let presses = try parseKeySequence(key)  // validated before anything is resolved, so an unknown name never posts
    let route = try spikeRouteArg(args, usable: 2...3)

    var meta = InputMeta(context)
    do {
      let app = try resolveApp(args)
      guard let pid = app.pid else { throw EngineError(.runningApplicationNotFound, "Running application not found: \(app.displayName)") }
      try requireAccessibility()
      try refuseWhenLocked()
      let application = prepare(AXUIElementCreateApplication(pid))
      let window = primaryWindow(of: application) ?? AXUIElementCreateApplication(pid)
      let activation = FakeActivation(pid: pid, window: window)
      defer { activation.deactivate() }  // every path out of the posting, error or success, undoes the activation
      let believedBefore = appBelievesItHasFocus(pid)
      meta.inputRoute = route ?? (believedBefore ? 2 : 3)
      if route != 2 && !believedBefore {
        try activation.activate()
        meta.activationGuardMs = activation.guardMs
      }
      // Keys go to the process that owns the focused element (a sheet or an open panel is not the app's process,
      // F §5.7's targetForKeyboardEvent), else to the app.
      let target = keyboardTarget(application, fallback: pid)
      let poster = EventPoster.toProcess(target, sourceState: privateSourceArg(args) ? .privateState : .hidSystemState)
      meta.startedAt = unixMilliseconds()
      for press in presses {
        for spec in keyPressEvents(press) { poster.post(spec) }
      }
      meta.endedAt = unixMilliseconds()
      context.connection.markActed(app)
      return ["meta": meta.wire]
    } catch let error as EngineError {
      throw withMeta(error, meta)
    }
  }

  // MARK: type_text

  /// `type_text {app, text, concealed?, spikeKeyed?}`: routed by the active input source (the spec's Design, "Text").
  /// Under a Latin layout the text is keyed as the vendor keys it, with the source checked before every event and after
  /// the last; anything else takes the paste route, which M0 does not build (notImplemented naming it) — unless
  /// `spikeKeyed` bypasses the routing for probe (e). A concealed request never takes the paste route and never keys
  /// under a reading it cannot trust: it fails closed before anything is entered.
  func typeText(_ args: [String: Any], _ context: ExecutionContext) throws -> Any {
    guard let text = args["text"] as? String else { throw EngineError(name: "invalidArguments", "Missing text to type") }
    let concealed = (args["concealed"] as? NSNumber)?.boolValue ?? false
    let spikeKeyed = (args["spikeKeyed"] as? NSNumber)?.boolValue ?? false
    let route = try spikeRouteArg(args, usable: 2...3)

    var meta = InputMeta(context)
    do {
      let app = try resolveApp(args)
      guard let pid = app.pid else { throw EngineError(.runningApplicationNotFound, "Running application not found: \(app.displayName)") }
      try requireAccessibility()
      try refuseWhenLocked()

      let source = currentInputSource()
      let frontmost = frontmostPid() == pid
      let unknown = perContextInputEnabled() && !frontmost  // macOS may hold a source per app; the session's reading says nothing then
      let pasteRoute = !spikeKeyed && (!source.keyboardLayout || unknown)
      if concealed && pasteRoute {
        throw EngineError(name: "concealedInputUnavailable",
                          "Nothing was entered: the active input source (\(source.id)) cannot key this text reliably. Use set_value on a settable element instead.")
      }
      if pasteRoute {
        meta.inputRoute = "paste"
        throw EngineError(name: "notImplemented",
                          "type_text under this input source (\(source.id)) takes the paste route, which this engine build does not implement")
      }
      guard let layout = KeyLayout.current() else {
        throw EngineError(name: "keyboardLayoutUnavailable", "Unable to get the current keyboard layout.")
      }
      let application = prepare(AXUIElementCreateApplication(pid))
      let window = primaryWindow(of: application) ?? AXUIElementCreateApplication(pid)
      let activation = FakeActivation(pid: pid, window: window)
      defer { activation.deactivate() }  // an inputSourceChanged mid-typing undoes the activation too
      let believedBefore = appBelievesItHasFocus(pid)
      meta.inputRoute = route ?? (believedBefore ? 2 : 3)
      if route != 2 && !believedBefore {
        try activation.activate()
        meta.activationGuardMs = activation.guardMs
      }
      // As press_key: the focused element's owning process receives the keys (F §5.7), else the app.
      let target = keyboardTarget(application, fallback: pid)
      let poster = EventPoster.toProcess(target, sourceState: privateSourceArg(args) ? .privateState : .hidSystemState)
      meta.startedAt = unixMilliseconds()

      let initialSource = currentInputSourceID()
      let units = typedUnits(text, press: layout.press(for:))
      var entered = 0
      let total = units.reduce(0) { $0 + $1.consumed }
      for unit in units {
        for spec in unit.events {
          try checkInputSource(initialSource, entered: entered, total: total)
          guard poster.post(spec) else { throw EngineError(name: "eventCreationFailed", "A key event could not be created.") }
          usleep(250)  // the vendor's gap between typed-text events (F §12)
        }
        entered += unit.consumed
      }
      try checkInputSource(initialSource, entered: entered, total: total)
      meta.endedAt = unixMilliseconds()
      context.connection.markActed(app)
      return ["meta": meta.wire]
    } catch let error as EngineError {
      throw withMeta(error, meta)
    }
  }

  /// The process keyboard events go to: the owner of the app's focused element, which for a sheet or an open panel is
  /// not the app (F §5.7's targetForKeyboardEvent), else the app.
  private func keyboardTarget(_ application: AXUIElement, fallback pid: pid_t) -> pid_t {
    guard let focused = elementAttribute(application, kAXFocusedUIElementAttribute) else { return pid }
    let owner = ownerPid(of: focused)
    return owner > 0 ? owner : pid
  }

  /// The source check before every event and after the last (the spec's Design, "Text"): a switch mid-request stops it
  /// with how much was entered, rather than letting another input method compose the remaining keys.
  private func checkInputSource(_ initial: String, entered: Int, total: Int) throws {
    guard currentInputSourceID() == initial else {
      throw EngineError(name: "inputSourceChanged",
                        "The input source changed after \(entered) of \(total) characters were entered; get the app's state to see what was typed.")
    }
  }
}

// MARK: Argument helpers

/// A number argument that is not a JSON boolean.
func numberArg(_ value: Any?) -> Double? {
  guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() else { return nil }
  return number.doubleValue
}

/// The spike-only route override: nil (the spec's rule decides) or 1–3. The harness sends the digits as JSON strings
/// ("1", "2", "3"), the protocol tests as numbers; both spellings parse, anything else is an argument error.
func spikeRouteArg(_ args: [String: Any], usable: ClosedRange<Int>) throws -> Int? {
  guard let given = args["spikeRoute"] else { return nil }
  let value: Int?
  switch given {
  case let number as NSNumber where CFGetTypeID(number) != CFBooleanGetTypeID(): value = number.intValue
  case let text as String: value = Int(text)
  default: value = nil
  }
  guard let value, (1...3).contains(value) else { throw EngineError.invalidArguments("spikeRoute must be 1, 2 or 3") }
  guard usable.contains(value) else {
    throw EngineError.invalidArguments("spikeRoute \(value) cannot carry this action (routes \(usable.lowerBound)–\(usable.upperBound) apply)")
  }
  return value
}

/// The spike-only private event source for keys.
func privateSourceArg(_ args: [String: Any]) -> Bool { (args["spikeEventSource"] as? String) == "private" }

/// The element at a global screen point under a window, when the AX hit-test answers one.
func hitTest(window: AXUIElement, at point: CGPoint) -> AXUIElement? {
  var hit: AXUIElement?
  guard AXUIElementCopyElementAtPosition(window, Float(point.x), Float(point.y), &hit) == .success, let hit else { return nil }
  return prepare(hit)
}

/// Web content (the spec's Design, "Input" route 3's web-view case): an AXWebArea at `element` or among its
/// ancestors. The vendor's recovered gate (F §5.1's FUN_1007a1b9c, now decompiled) hit-tests the clickable point and
/// walks the hit element's ancestors, capped at 300 levels, asking whether the clicked element is among them — true
/// exactly when the point lands on a descendant of the target, the nested-content case; cua's M0 test is the simpler
/// role form the design named.
func isWebContent(_ element: AXUIElement) -> Bool {
  var current: AXUIElement? = element
  var depth = 0
  while let element = current, depth < 300 {
    if stringAttribute(element, kAXRoleAttribute) == "AXWebArea" { return true }
    guard let parent = elementAttribute(element, kAXParentAttribute), !CFEqual(parent, element) else { return false }
    current = parent
    depth += 1
  }
  return false
}

/// The process that serves an element (AX.swift's `pid(of:)` under a name click's local `appPid` cannot shadow).
func ownerPid(of element: AXUIElement) -> pid_t { pid(of: element) }
