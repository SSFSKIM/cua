import AppKit
import ApplicationServices
import Foundation

// Input methods (the spec's Design, "Input", "Keys" and "Text"; R/F-helper-logic.md §5–6, R/sky-behaviour.md §10–14):
// click, press_key and type_text on M1a's route table (Routes.swift): keys and typed text by route 2′, the plain post
// with no fake activation; clicks by route 1 where the element advertises the action and the hit-test gate passes,
// else by route 3, whose failed guard is refused as activationFailed with the click's own events never posted. The
// engine never activates an app on its own (route 4 is M2a's), never moves the real pointer, posts to the process that
// owns the target element, and refuses a target served by a forbidden process before anything is posted
// (OwnerPolicy.swift). Every result and every error raised after the arguments validate carries the input meta
// (Interfaces, EngineProtocol): {inputRoute, startedAt, endedAt, receivedAt, hidIdleMs}, startedAt/endedAt null while
// nothing was posted, inputRoute null until a route is chosen; the guard's duration rides as activationGuardMs when
// route 3 ran one. The settle an action arms runs at the next get_app_state (markActed). Spike-only arguments, which the
// facade never sends: `spikeRoute` ("1"|"2'"|"2"|"3", force one route; route 2, the ⌘ post, is reachable only this
// way), `spikeEventSource` ("private", post keys from a private event source instead of the HID-system one) and
// `spikeKeyed` (type_text: key through the layout regardless of the source routing, probe (e)'s per-context case;
// never for a concealed request). A non-concealed type_text that routes to the paste route answers notImplemented
// naming it, with inputRoute "paste"; the paste route itself is M2a's.

/// A route that carried an input (the spec's Design, "Input"; Interfaces, EngineProtocol's
/// `inputRoute: 1 | "2'" | 2 | 3 | 4 | "paste"`). Route 4 is M2a's.
enum InputRoute: Equatable {
  case action       // 1: the element's accessibility action
  case plainPost    // 2′: the events posted to the owning pid, no ⌘ flag, no fake activation
  case commandPost  // 2: the same post, ⌘ added for a click into an inactive app (the vendor's background click); spike only
  case activation   // 3: the fake activation (nothing when the app already believes it has focus), then the plain post
  case paste        // type_text's paste route

  /// The wire's spelling: the numbered routes as numbers, 2′ as the string "2'".
  var wire: Any {
    switch self {
    case .action: return 1
    case .plainPost: return "2'"
    case .commandPost: return 2
    case .activation: return 3
    case .paste: return "paste"
    }
  }

  /// The routes `spikeRoute` may force: every synthesized one, and for an element click also route 1.
  static let synthesized: [InputRoute] = [.plainPost, .commandPost, .activation]
  static let elementClick: [InputRoute] = [.action] + synthesized
}

/// The flags of a synthesized click's events: ⌘ for route 2 into an app that is not active (the AppKit convention for a
/// click an inactive window accepts, F §5.4); none for every other route, 2′'s plain post and route 3's included.
func clickFlags(_ route: InputRoute, targetActive: Bool) -> CGEventFlags {
  route == .commandPost && !targetActive ? .maskCommand : []
}

/// The input meta of one request, whatever it answered. The route and the two times fill in as the action proceeds, so
/// an error thrown midway carries the state reached then.
struct InputMeta {
  var inputRoute: InputRoute? = nil  // null before a route is chosen
  var startedAt: Int64? = nil
  var endedAt: Int64? = nil
  var activationGuardMs: Double? = nil
  let context: ExecutionContext

  init(_ context: ExecutionContext) { self.context = context }

  var wire: [String: Any] {
    var wire: [String: Any] = [
      "inputRoute": inputRoute?.wire ?? NSNull(),
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

/// A synthesized click's delivery: under route 3 the fake activation first (nothing when the app already believes it has
/// focus), then the click's events posted back to back to the target's process, then the activation withdrawn. A
/// failed guard throws before any of the click's events is posted, and nothing is retried (never with ⌘). The meta
/// carries the route from the start, so a refusal names the route that failed.
func deliverClick(_ target: ClickTarget, route: InputRoute, button: MouseButton, count: Int, activation: FakeActivation?,
                  targetActive: () -> Bool, post: (CGEvent, pid_t) -> Void, meta: inout InputMeta) throws {
  meta.inputRoute = route
  defer { activation?.deactivate() }  // every path out of the click, error or success, undoes the activation
  if route == .activation, let activation {
    try activation.activate()
    meta.activationGuardMs = activation.guardMs
  }
  let events = clickEvents(target, button: button, count: count, flags: clickFlags(route, targetActive: targetActive()))
  guard !events.isEmpty else { throw EngineError(name: "eventCreationFailed", "The click events could not be created.") }
  let (startedAt, endedAt) = postToProcess(events, pid: target.pid, post: post)
  meta.startedAt = startedAt
  meta.endedAt = endedAt
}

/// An element's own action (route 1): after route 3's activation for a menu-bar item (`activation` given), whose
/// failed guard throws before the action is performed; the activation is withdrawn afterwards. The meta reports route 3
/// when the activation ran, since the app's activation hooks fired, else route 1.
func deliverAction(_ action: String, activation: FakeActivation?, perform: (String) -> AXError, meta: inout InputMeta) throws {
  meta.inputRoute = activation == nil ? .action : .activation
  defer { activation?.deactivate() }
  if let activation {
    try activation.activate()
    meta.activationGuardMs = activation.guardMs
  }
  meta.startedAt = unixMilliseconds()
  let error = perform(action)
  meta.endedAt = unixMilliseconds()
  guard error == .success else { throw EngineError(name: "actionFailed", "The element did not accept the \(action) action.") }
}

extension Engine {
  // MARK: click

  /// `click {app, element | x, y, mouse_button?, click_count?}`, `element` a token of the request's `lineage` (the
  /// service's translation of the facade's element_index). An element click takes route 1 (AXPick, else AXPress) for a
  /// plain left click on an element that advertises the action and whose clickable point does not land on a strict
  /// descendant of it (the vendor's nested-content gate, applied to every element by cua), a menu-bar item's after route
  /// 3's activation; every other element click is synthesized by route 3 at the midpoint of the element's visible frame,
  /// refused as not visible when nothing of it shows or its frame cannot be read now. A coordinate click is in the pixels
  /// of the last screenshot of the app's primary window on this connection, refused (`noScreenshotForCoordinates`,
  /// nothing posted) when there is none, and goes by route 3. The process serving the target receives the input, after the forbidden
  /// list has been checked against it.
  func click(_ args: [String: Any], _ context: ExecutionContext) throws -> Any {
    let token = try elementTokenArg(args, lineage: context.lineage)
    let hasElement = token != nil
    let hasPoint = numberArg(args["x"]) != nil && numberArg(args["y"]) != nil
    guard hasElement != hasPoint else {
      throw EngineError.invalidArguments(hasElement ? "click takes either element or coordinates, not both"
                                                  : "click needs element or x and y coordinates")
    }
    guard let button = MouseButton(wire: args["mouse_button"]) else {
      throw EngineError.invalidArguments("mouseButton must be left, right, middle, l, r, m, 0, 1, or 2")
    }
    let count = (args["click_count"] as? NSNumber)?.intValue ?? 1
    guard count >= 1 else { throw EngineError.invalidArguments("click_count must be at least 1") }
    let forced = try spikeRouteArg(args, usable: hasElement ? InputRoute.elementClick : InputRoute.synthesized)

    var meta = InputMeta(context)
    do {
      let app = try resolveApp(args)
      guard let appPid = app.pid else { throw EngineError(.runningApplicationNotFound, "Running application not found: \(app.displayName)") }
      try requireAccessibility()
      try refuseWhenLocked()

      if let token, let lineage = context.lineage {
        let entry = try context.connection.element(token, app: app, lineage: lineage) { ElementResolver.live($0, pid: appPid) }
        let owner = ownerPid(of: entry.element, fallback: appPid)  // a sheet or panel is served by another process
        try refuseForbiddenOwner(owner)
        // The element's own window, which for a panel served by another process is that process's window; a menu-bar
        // item has none. The point is read live: a frame that cannot be read now is not replaced by the observed one.
        let ownWindow = elementAttribute(entry.element, kAXWindowAttribute)
        let ownWindowFrame = ownWindow.flatMap { frame(of: $0) }
        let ownWindowID = ownWindow.flatMap { windowNumber(of: $0, pid: owner, frame: ownWindowFrame) }
        let visible = visibleFrame(of: entry.element, frame: { frame(of: $0) }, role: { stringAttribute($0, kAXRoleAttribute) },
                                   parent: { elementAttribute($0, kAXParentAttribute) }, actions: actionNames(of:))
        let point = clickablePoint(frame: visible, visibleIn: ownWindowFrame)
        let plan = try elementClickPlan(forced: forced, button: button, count: count, role: entry.identity.role, actions: entry.actions) {
          guard let point else { return false }  // nothing to hit-test: the action needs no point
          return landsOnStrictDescendant(hitTest(application: owner, at: point), of: entry.element,
                                         parent: { elementAttribute($0, kAXParentAttribute) }, same: { CFEqual($0, $1) })
        }
        // Route 3's activation is for the element's window, else the app's primary window (a menu-bar item's).
        func activation() -> FakeActivation {
          if let ownWindow { return FakeActivation(pid: owner, appPid: appPid, window: ownWindow, windowFrame: ownWindowFrame, windowID: ownWindowID) }
          let application = prepare(AXUIElementCreateApplication(appPid))
          return FakeActivation(pid: owner, appPid: appPid, window: primaryWindow(of: application) ?? application)
        }
        switch plan {
        case .action(let action, let activateFirst):
          try deliverAction(action, activation: activateFirst ? activation() : nil,
                            perform: { AXUIElementPerformAction(entry.element, $0 as CFString) }, meta: &meta)
        case .synthesized(let route):
          guard let point else { throw EngineError(name: "cannotClickOffscreenElement", "The element is not visible on screen.") }
          let target = ClickTarget(point: point, windowFrame: ownWindowFrame, windowID: ownWindowID, pid: owner)
          try deliverClick(target, route: route, button: button, count: count, activation: route == .activation ? activation() : nil,
                           targetActive: { NSRunningApplication(processIdentifier: owner)?.isActive == true },
                           post: { $0.postToPid($1) }, meta: &meta)
        }
      } else {
        guard let x = numberArg(args["x"]), let y = numberArg(args["y"]), x.isFinite, y.isFinite else {
          throw EngineError.invalidArguments("x and y must be finite coordinates")
        }
        let application = prepare(AXUIElementCreateApplication(appPid))
        guard let window = primaryWindow(of: application), let windowFrame = frame(of: window) else {
          throw EngineError(name: "noWindowsAvailable", "noWindowsAvailable")
        }
        // Screenshot pixels to points, by the scale of the screenshot the model was given (Screenshot.swift).
        let local = try context.connection.screenshotPoint(x, y, app: app, window: window, lineage: context.lineage)
        let point = CGPoint(x: windowFrame.minX + local.x, y: windowFrame.minY + local.y)
        let owner = hitTest(window: window, at: point).map { ownerPid(of: $0, fallback: appPid) } ?? appPid
        try refuseForbiddenOwner(owner)
        let windowID = windowNumber(of: window, pid: appPid, frame: windowFrame)
        let target = ClickTarget(point: point, windowFrame: windowFrame, windowID: windowID, pid: owner)
        let route = coordinateClickRoute(forced: forced)
        let activation = route == .activation
          ? FakeActivation(pid: owner, appPid: appPid, window: window, windowFrame: windowFrame, windowID: windowID) : nil
        try deliverClick(target, route: route, button: button, count: count, activation: activation,
                         targetActive: { NSRunningApplication(processIdentifier: owner)?.isActive == true },
                         post: { $0.postToPid($1) }, meta: &meta)
      }
      context.connection.markActed(app)
      return ["meta": meta.wire]
    } catch let error as EngineError {
      throw withMeta(error, meta)
    }
  }

  // MARK: press_key

  /// `press_key {app, key}`: the vendor's grammar (Keyboard.swift), four events per press with no gap, posted by route
  /// 2′ to the process that owns the app's focused element, with no fake activation (the second sitting: keys by 2′
  /// delivered on every scene without firing the app's activation hooks). A spike cell may force route 3's activation
  /// first, or label the post route 2.
  func pressKey(_ args: [String: Any], _ context: ExecutionContext) throws -> Any {
    guard let key = args["key"] as? String else { throw EngineError.invalidArguments("key is required") }
    let presses = try parseKeySequence(key)  // validated before anything is resolved, so an unknown name never posts
    let forced = try spikeRouteArg(args, usable: InputRoute.synthesized)

    var meta = InputMeta(context)
    do {
      let app = try resolveApp(args)
      guard let pid = app.pid else { throw EngineError(.runningApplicationNotFound, "Running application not found: \(app.displayName)") }
      try requireAccessibility()
      try refuseWhenLocked()
      let application = prepare(AXUIElementCreateApplication(pid))
      let target = keyboardTarget(application, fallback: pid)
      try refuseForbiddenOwner(target)
      meta.inputRoute = keyRoute(forced: forced)
      let activation = try forcedActivation(meta.inputRoute, pid: pid, application: application, meta: &meta)
      defer { activation?.deactivate() }  // every path out of the posting, error or success, undoes a forced activation
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
  /// Under a Latin layout whose reading is reliable the text is keyed as the vendor keys it, by route 2′ with no fake
  /// activation, with the source checked before every event and after the last; anything else takes the paste route,
  /// which M1a does not build (notImplemented naming it). A concealed request never takes the paste route and never keys
  /// under a reading it cannot trust: it fails closed as concealedInputUnavailable before anything is entered.
  func typeText(_ args: [String: Any], _ context: ExecutionContext) throws -> Any {
    guard let text = args["text"] as? String else { throw EngineError(name: "invalidArguments", "Missing text to type") }
    let concealed = (args["concealed"] as? NSNumber)?.boolValue ?? false
    let spikeKeyed = (args["spikeKeyed"] as? NSNumber)?.boolValue ?? false
    let forced = try spikeRouteArg(args, usable: InputRoute.synthesized)

    var meta = InputMeta(context)
    do {
      let app = try resolveApp(args)
      guard let pid = app.pid else { throw EngineError(.runningApplicationNotFound, "Running application not found: \(app.displayName)") }
      try requireAccessibility()
      try refuseWhenLocked()
      // The forbidden list on the process the keys would reach comes before anything else is decided.
      let application = prepare(AXUIElementCreateApplication(pid))
      let target = keyboardTarget(application, fallback: pid)
      try refuseForbiddenOwner(target)

      let source = currentInputSource()
      // macOS may hold a source per app; the session's reading then says nothing about a background app.
      let perContextUnknown = perContextInputEnabled() && frontmostPid() != pid
      switch textRoute(keyboardLayout: source.keyboardLayout, perContextUnknown: perContextUnknown, concealed: concealed, spikeKeyed: spikeKeyed) {
      case .refusedConcealed:
        throw concealedInputUnavailable(sourceID: source.id, perContext: source.keyboardLayout && perContextUnknown)
      case .paste:
        meta.inputRoute = .paste
        throw EngineError(name: "notImplemented",
                          "type_text under this input source (\(source.id)) takes the paste route, which this engine build does not implement")
      case .keyed: break
      }
      guard let layout = KeyLayout.current() else {
        throw EngineError(name: "keyboardLayoutUnavailable", "Unable to get the current keyboard layout.")
      }
      meta.inputRoute = keyRoute(forced: forced)
      let activation = try forcedActivation(meta.inputRoute, pid: pid, application: application, meta: &meta)
      defer { activation?.deactivate() }  // an inputSourceChanged mid-typing undoes a forced activation too
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

  // MARK: paste

  /// `paste {app, text, format, concealed?}`: the method is M2a's; a concealed paste is refused already, as the Text rule
  /// requires (secrets never take the pasteboard), with nothing entered.
  func paste(_ args: [String: Any], _ context: ExecutionContext) throws -> Any {
    let meta = InputMeta(context)
    if (args["concealed"] as? NSNumber)?.boolValue == true {
      throw withMeta(EngineError(name: "concealedInputUnavailable",
                                 "Nothing was entered: a concealed value is never pasted. Use set_value on a settable element instead."), meta)
    }
    throw withMeta(EngineError(name: "notImplemented", "paste is not implemented by this engine build"), meta)
  }

  /// A spike cell's forced route 3 for keys: the app's activation for its primary window, run before the keys. Nil for
  /// every other route, the default 2′ included.
  private func forcedActivation(_ route: InputRoute?, pid: pid_t, application: AXUIElement, meta: inout InputMeta) throws -> FakeActivation? {
    guard route == .activation else { return nil }
    let activation = FakeActivation(pid: pid, window: primaryWindow(of: application) ?? application)
    do {
      try activation.activate()
    } catch {
      activation.deactivate()
      throw error
    }
    meta.activationGuardMs = activation.guardMs
    return activation
  }

  /// The process keyboard events go to: the owner of the app's focused element, which for a sheet or an open panel is
  /// not the app (F §5.7's targetForKeyboardEvent), else the app.
  private func keyboardTarget(_ application: AXUIElement, fallback pid: pid_t) -> pid_t {
    guard let focused = elementAttribute(application, kAXFocusedUIElementAttribute) else { return pid }
    return ownerPid(of: focused, fallback: pid)
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

/// The spike-only route override: nil (the spec's rule decides) or one of `usable`. The harness sends the routes as JSON
/// strings ("1", "2'", "2", "3"), the protocol tests the numbered ones as numbers; both spellings parse, anything else
/// is an argument error. Route 2′ has only its string spelling, "2'" with an ASCII apostrophe.
func spikeRouteArg(_ args: [String: Any], usable: [InputRoute]) throws -> InputRoute? {
  guard let given = args["spikeRoute"] else { return nil }
  let route: InputRoute?
  switch given {
  case let number as NSNumber where CFGetTypeID(number) != CFBooleanGetTypeID():
    route = [1: InputRoute.action, 2: .commandPost, 3: .activation][number.doubleValue == number.doubleValue.rounded() ? number.intValue : 0]
  case let text as String:
    route = ["1": InputRoute.action, "2'": .plainPost, "2": .commandPost, "3": .activation][text]
  default: route = nil
  }
  guard let route else { throw EngineError.invalidArguments("spikeRoute must be 1, 2', 2 or 3") }
  guard usable.contains(route) else {
    let names = usable.map { "\($0.wire)" }.joined(separator: ", ")
    throw EngineError.invalidArguments("spikeRoute \(route.wire) cannot carry this action (routes \(names) apply)")
  }
  return route
}

/// The spike-only private event source for keys.
func privateSourceArg(_ args: [String: Any]) -> Bool { (args["spikeEventSource"] as? String) == "private" }

/// The element at a global screen point under a window, when the AX hit-test answers one.
func hitTest(window: AXUIElement, at point: CGPoint) -> AXUIElement? {
  var hit: AXUIElement?
  guard AXUIElementCopyElementAtPosition(window, Float(point.x), Float(point.y), &hit) == .success, let hit else { return nil }
  return prepare(hit)
}

/// The element a process's application answers at a global screen point (the gate's hit-test: what that app would
/// deliver a click at the point to, whatever other apps' windows lie above it).
func hitTest(application pid: pid_t, at point: CGPoint) -> AXUIElement? {
  hitTest(window: prepare(AXUIElementCreateApplication(pid)), at: point)
}

/// An element's advertised actions, read now.
func actionNames(of element: AXUIElement) -> [String] {
  var names: CFArray?
  return AXUIElementCopyActionNames(element, &names) == .success ? (names as? [String] ?? []) : []
}

/// The process that serves an element; `fallback` when the Accessibility API cannot say.
func ownerPid(of element: AXUIElement, fallback: pid_t) -> pid_t {
  let owner = pid(of: element)
  return owner > 0 ? owner : fallback
}
