import AppKit
import ApplicationServices
import Foundation

// Input methods (the spec's Design, "Input", "Keys", "Text" and "User intervention"; R/F-helper-logic.md §5–6 and §9,
// R/sky-behaviour.md §10–14 and §18): click, press_key and type_text on the route table (Routes.swift): keys and typed
// text by route 2′, the plain post with no fake activation; clicks by route 1 where the element advertises the action
// and the hit-test gate passes, else by route 3, whose failed guard is refused as activationFailed with the click's own
// events never posted, or by route 4 in its place for an app the owner's override names (ForegroundAssist.swift). The
// engine never activates an app on its own, never moves the real pointer, posts to the process that owns the target
// element, and refuses a target served by a forbidden process before anything is posted (OwnerPolicy.swift). Every
// input request passes the intervention guard (Intervention.swift) before anything is posted, and a sequence checks it
// again between its events: between the activation and the click, between the presses of a key sequence, between the
// characters of typed text. Every result and every error raised after the arguments validate carries the input meta
// (Interfaces, EngineProtocol): {inputRoute, startedAt, endedAt, receivedAt, hidIdleMs}, startedAt/endedAt null while
// nothing was posted, inputRoute null until a route is chosen; the guard's duration rides as activationGuardMs when
// route 3 ran one, `intervention: "off"` when detection is off, `entered` on a type_text that keyed (never a concealed
// one), and `routeAdvice` once route 3's guard has failed three actions in a row for the app. The settle an action arms
// runs at the next get_app_state (markActed). Spike-only arguments, which the
// facade never sends: `spikeRoute` ("1"|"2'"|"2"|"3", force one route; route 2, the ⌘ post, is reachable only this
// way), `spikeEventSource` ("private", post keys from a private event source instead of the HID-system one) and
// `spikeKeyed` (type_text: key through the layout regardless of the source routing, probe (e)'s per-context case;
// never for a concealed request). A non-concealed type_text that routes to the paste route is pasted (Paste.swift).

/// A route that carried an input (the spec's Design, "Input"; Interfaces, EngineProtocol's
/// `inputRoute: 1 | "2'" | 2 | 3 | 4 | "paste"`).
enum InputRoute: Equatable {
  case action       // 1: the element's accessibility action
  case plainPost    // 2′: the events posted to the owning pid, no ⌘ flag, no fake activation
  case commandPost  // 2: the same post, ⌘ added for a click into an inactive app (the vendor's background click); spike only
  case activation   // 3: the fake activation (nothing when the app already believes it has focus), then the plain post
  case foreground   // 4: the app activated, the plain post, the user's app restored; only by the owner's override
  case paste        // type_text's paste route

  /// The wire's spelling: the numbered routes as numbers, 2′ as the string "2'".
  var wire: Any {
    switch self {
    case .action: return 1
    case .plainPost: return "2'"
    case .commandPost: return 2
    case .activation: return 3
    case .foreground: return 4
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
  /// A synthesized element click whose hit-test answered nothing or only a container of the element, so the point
  /// could not be confirmed to reach it; reported as `pointUnconfirmed: true`.
  var pointUnconfirmed = false
  /// Intervention detection is off for this request (no Input Monitoring grant, or no tap): `intervention: "off"`.
  var interventionOff = false
  /// A type_text's UTF-16 units entered, on its result and on an error that stopped it; never for a concealed request,
  /// whose count would tell a secret's length.
  var entered: Int?
  /// The per-app route-4 override named once route 3's guard has failed three actions in a row for the app.
  var routeAdvice: String?
  /// With detection on, the milliseconds from the app's last attributed user event to the request's receipt (null when
  /// none was attributed while the app was driven); with detection off, the machine-wide HID idle time at receipt.
  var hidIdleMs: Int?
  let context: ExecutionContext

  init(_ context: ExecutionContext) {
    self.context = context
    hidIdleMs = context.hidIdleMs
  }

  /// What the request's intervention guard says about it: detection off, or the idle time since the app's last
  /// attributed event.
  mutating func apply(_ guarding: InterventionGuard) {
    if guarding.detection {
      hidIdleMs = guarding.idleMilliseconds(at: context.receivedAt)
    } else {
      interventionOff = true
    }
  }

  /// The action interval's one rule, for every method that posts events: `post` posts one event (or one group posted
  /// back to back) and answers whether it was posted. `startedAt` is stamped as the first post that succeeds begins and
  /// `endedAt` after the last one that succeeded, so a request that posts nothing (refused, stopped before its first
  /// event, empty, or whose first event could not be created) keeps both null, which is how the service and the wrapper
  /// know nothing was entered.
  @discardableResult
  mutating func posting(_ post: () -> Bool) -> Bool {
    let begun = unixMilliseconds()
    guard post() else { return false }
    if startedAt == nil { startedAt = begun }
    endedAt = unixMilliseconds()
    return true
  }

  var wire: [String: Any] {
    var wire: [String: Any] = [
      "inputRoute": inputRoute?.wire ?? NSNull(),
      "startedAt": startedAt.map { Int($0) } ?? NSNull(),
      "endedAt": endedAt.map { Int($0) } ?? NSNull(),
      "receivedAt": Int(context.receivedAt),
      "hidIdleMs": hidIdleMs ?? NSNull(),
    ]
    if let activationGuardMs { wire["activationGuardMs"] = activationGuardMs }
    if pointUnconfirmed { wire["pointUnconfirmed"] = true }
    if interventionOff { wire["intervention"] = "off" }
    if let entered { wire["entered"] = entered }
    if let routeAdvice { wire["routeAdvice"] = routeAdvice }
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
/// focus), then the click's events posted back to back to the target's process, then the activation withdrawn; under
/// route 4 the events are posted while the foreground assist holds the app in front. A failed guard throws before any of
/// the click's events is posted, and nothing is retried (never with ⌘). `beforePosting` runs once the app is prepared,
/// just before the events (the intervention guard's in-flight check: a user event during the activation stops the
/// click). The meta carries the route from the start, so a refusal names the route that failed.
func deliverClick(_ target: ClickTarget, route: InputRoute, button: MouseButton, count: Int, activation: FakeActivation?,
                  foreground: ForegroundAssist? = nil, targetActive: () -> Bool, beforePosting: () throws -> Void = {},
                  post: (CGEvent, pid_t) -> Void, meta: inout InputMeta) throws {
  meta.inputRoute = route
  defer { activation?.deactivate() }  // every path out of the click, error or success, undoes the activation
  if route == .activation, let activation {
    try activation.activate()
    meta.activationGuardMs = activation.guardMs
  }
  // The interval is stamped as the events are posted, so an error after them (route 4's restore) still says they were.
  func send() throws {
    try beforePosting()
    let events = clickEvents(target, button: button, count: count, flags: clickFlags(route, targetActive: targetActive()))
    guard !events.isEmpty else { throw EngineError(name: "eventCreationFailed", "The click events could not be created.") }
    meta.posting { _ = postToProcess(events, pid: target.pid, post: post); return true }
  }
  if route == .foreground, let foreground { try foreground.run(send) } else { try send() }
}

/// Typed text keyed unit by unit (the spec's Design, "Text"): the input source checked before every event and after the
/// last, the intervention guard between units (never between a key down and its key up), `pause` after every event. The
/// meta's interval runs from the first event to the last one posted, and `entered` counts the UTF-16 units entered,
/// stopped or not, unless the request is concealed.
func keyText(_ units: [TypedUnit], concealed: Bool, checkSource: (_ entered: Int, _ total: Int) throws -> Void,
             checkIntervention: () throws -> Void, post: (KeyEvent) -> Bool, pause: () -> Void, meta: inout InputMeta) throws {
  let total = units.reduce(0) { $0 + $1.consumed }
  var entered = 0
  defer { if !concealed { meta.entered = entered } }
  for unit in units {
    try checkIntervention()
    for spec in unit.events {
      try checkSource(entered, total)
      guard meta.posting({ post(spec) }) else { throw EngineError(name: "eventCreationFailed", "A key event could not be created.") }
      pause()
    }
    entered += unit.consumed
  }
  try checkSource(entered, total)
}

/// A key sequence's presses, each its four events with no gap (F §6.4), the intervention guard between presses.
func keyPresses(_ presses: [KeyPress], checkIntervention: () throws -> Void, post: (KeyEvent) -> Bool, meta: inout InputMeta) throws {
  for press in presses {
    try checkIntervention()
    for spec in keyPressEvents(press) { meta.posting { post(spec) } }
  }
}

/// An element's own action, route 1: performed, and refused as actionFailed when the element does not accept it (no
/// fall-through to a synthesized click, which could click twice after an action that took effect and still erred).
func deliverAction(_ action: String, perform: (String) -> AXError, meta: inout InputMeta) throws {
  meta.inputRoute = .action
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
  /// descendant of it (the vendor's nested-content gate, applied to every element by cua); every other element click
  /// is synthesized by route 3 at the midpoint of the element's visible frame, refused as not visible when nothing of it
  /// shows, its frame cannot be read now, or the hit-test there answers something unrelated to it (something covers
  /// it), and reported as `pointUnconfirmed` when the hit-test answers nothing or only a container. A click on a
  /// menu-bar item is refused before anything is posted. A coordinate click is in the pixels
  /// of the last screenshot of the app's primary window on this connection, refused (`noScreenshotForCoordinates`,
  /// nothing posted) when there is none, and goes by route 3. Route 4 takes route 3's place for an app the owner's
  /// override names. The process serving the target receives the input, after the forbidden list has been checked
  /// against it.
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
      let guarding = interventionGuard(app: app, pid: appPid, requestApp: args["app"] as? String, connection: context.connection)
      meta.apply(guarding)
      try guarding.checkBeforePosting()
      let foreground = routeFourOverride(app.bundleIdentifier, routes: routes)
      // Route 3's guard outcome per app, for routeAdvice: a refusal by the guard counts, a click past it resets the run.
      func delivering(_ route: InputRoute, _ deliver: () throws -> Void) throws {
        do {
          try deliver()
          if route == .activation { _ = routeAdvice.record(app.bundleIdentifier, guardFailed: false) }
        } catch let error as EngineError where route == .activation && error.errorName == "activationFailed" {
          meta.routeAdvice = routeAdvice.record(app.bundleIdentifier, guardFailed: true)
          throw error
        }
      }

      if let token, let lineage = context.lineage {
        let entry = try context.connection.element(token, app: app, lineage: lineage) { ElementResolver.live($0, pid: appPid) }
        let owner = ownerPid(of: entry.element, fallback: appPid)  // a sheet or panel is served by another process
        try refuseForbiddenOwner(owner)
        actionTargets(owner, app: app, connection: context.connection)
        // The element's own window, which for a panel served by another process is that process's window; a menu-bar
        // item has none. The point is read live: a frame that cannot be read now is not replaced by the observed one.
        let ownWindow = elementAttribute(entry.element, kAXWindowAttribute)
        let ownWindowFrame = ownWindow.flatMap { frame(of: $0) }
        let ownWindowID = ownWindow.flatMap { windowNumber(of: $0, pid: owner, frame: ownWindowFrame) }
        let visible = visibleFrame(of: entry.element, frame: { frame(of: $0) }, role: { stringAttribute($0, kAXRoleAttribute) },
                                   parent: { elementAttribute($0, kAXParentAttribute) }, actions: actionNames(of:))
        let point = clickablePoint(frame: visible, visibleIn: ownWindowFrame)
        // One hit-test and one classification of it, shared by the gate and the reach check, taken only when needed.
        var relation: HitRelation?
        func hitAtPoint() -> HitRelation {
          if let relation { return relation }
          let found = point.map { hitRelation(hitTest(application: owner, at: $0), to: entry.element,
                                              parent: { elementAttribute($0, kAXParentAttribute) }, same: { CFEqual($0, $1) }) } ?? .noAnswer
          relation = found
          return found
        }
        let plan = try elementClickPlan(forced: forced, button: button, count: count, role: entry.identity.role, actions: entry.actions,
                                        synthesized: synthesizedClickRoute(forced: nil, foreground: foreground)) {
          hitAtPoint() == .descendant  // no point, or no answer: the action needs no point
        }
        switch plan {
        case .action(let action):
          try deliverAction(action, perform: { AXUIElementPerformAction(entry.element, $0 as CFString) }, meta: &meta)
        case .synthesized(let route):
          guard let point, !hitAtPoint().covered else {
            throw EngineError(name: "cannotClickOffscreenElement", "The element is not visible on screen.")
          }
          meta.pointUnconfirmed = hitAtPoint().unconfirmed
          // Route 3's activation is for the element's window, else the app's primary window (a menu-bar item's).
          func activation() -> FakeActivation {
            if let ownWindow { return FakeActivation(pid: owner, appPid: appPid, window: ownWindow, windowFrame: ownWindowFrame, windowID: ownWindowID) }
            let application = prepare(AXUIElementCreateApplication(appPid))
            return FakeActivation(pid: owner, appPid: appPid, window: primaryWindow(of: application) ?? application)
          }
          let target = ClickTarget(point: point, windowFrame: ownWindowFrame, windowID: ownWindowID, pid: owner)
          try delivering(route) {
            try deliverClick(target, route: route, button: button, count: count, activation: route == .activation ? activation() : nil,
                             foreground: route == .foreground ? ForegroundAssist(appPid: appPid) : nil,
                             targetActive: { NSRunningApplication(processIdentifier: owner)?.isActive == true },
                             beforePosting: guarding.checkInFlight, post: { $0.postToPid($1) }, meta: &meta)
          }
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
        actionTargets(owner, app: app, connection: context.connection)
        let windowID = windowNumber(of: window, pid: appPid, frame: windowFrame)
        let target = ClickTarget(point: point, windowFrame: windowFrame, windowID: windowID, pid: owner)
        let route = coordinateClickRoute(forced: forced, foreground: foreground)
        let activation = route == .activation
          ? FakeActivation(pid: owner, appPid: appPid, window: window, windowFrame: windowFrame, windowID: windowID) : nil
        try delivering(route) {
          try deliverClick(target, route: route, button: button, count: count, activation: activation,
                           foreground: route == .foreground ? ForegroundAssist(appPid: appPid) : nil,
                           targetActive: { NSRunningApplication(processIdentifier: owner)?.isActive == true },
                           beforePosting: guarding.checkInFlight, post: { $0.postToPid($1) }, meta: &meta)
        }
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
  /// delivered on every scene without firing the app's activation hooks); a sequence stops between presses at a user
  /// event attributed to the app. A spike cell may force route 3's activation first, or label the post route 2.
  func pressKey(_ args: [String: Any], _ context: ExecutionContext) throws -> Any {
    guard let key = args["key"] as? String else { throw EngineError.invalidArguments("key is required") }
    let presses = try parseKeySequence(key)  // validated before anything is resolved, so an unknown name never posts
    let forced = try spikeRouteArg(args, usable: InputRoute.synthesized)

    var meta = InputMeta(context)
    do {
      let app = try resolveApp(args)
      guard let pid = app.pid else { throw EngineError(.runningApplicationNotFound, "Running application not found: \(app.displayName)") }
      try requireAccessibility()
      let guarding = interventionGuard(app: app, pid: pid, requestApp: args["app"] as? String, connection: context.connection)
      meta.apply(guarding)
      try guarding.checkBeforePosting()
      let application = prepare(AXUIElementCreateApplication(pid))
      let target = keyboardTarget(application, fallback: pid)
      try refuseForbiddenOwner(target)
      actionTargets(target, app: app, connection: context.connection)
      meta.inputRoute = keyRoute(forced: forced)
      let activation = try forcedActivation(meta.inputRoute, pid: pid, application: application, meta: &meta)
      defer { activation?.deactivate() }  // every path out of the posting, error or success, undoes a forced activation
      let poster = EventPoster.toProcess(target, sourceState: privateSourceArg(args) ? .privateState : .hidSystemState)
      defer { context.connection.markActed(app) }  // a sequence stopped midway changed the app too
      try keyPresses(presses, checkIntervention: guarding.checkInFlight, post: { poster.post($0) }, meta: &meta)
      return ["meta": meta.wire]
    } catch let error as EngineError {
      throw withMeta(error, meta)
    }
  }

  // MARK: type_text

  /// `type_text {app, text, concealed?, spikeKeyed?}`: routed by the active input source (the spec's Design, "Text").
  /// Under a Latin layout whose reading is reliable the text is keyed as the vendor keys it, by route 2′ with no fake
  /// activation, with the source checked before every event and after the last; anything else takes the paste route
  /// (Paste.swift), its newlines pressed as Return. A concealed request never takes the paste route and never keys
  /// under a reading it cannot trust: it fails closed as concealedInputUnavailable before anything is entered. A keyed
  /// request stops between characters at a user event attributed to the app, reporting what it entered.
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
      let guarding = interventionGuard(app: app, pid: pid, requestApp: args["app"] as? String, connection: context.connection)
      meta.apply(guarding)
      try guarding.checkBeforePosting()
      // The forbidden list on the process the keys would reach comes before anything else is decided.
      let application = prepare(AXUIElementCreateApplication(pid))
      let target = keyboardTarget(application, fallback: pid)
      try refuseForbiddenOwner(target)
      actionTargets(target, app: app, connection: context.connection)

      let source = currentInputSource()
      // macOS may hold a source per app; the session's reading then says nothing about a background app.
      let perContextUnknown = perContextInputEnabled() && frontmostPid() != pid
      switch textRoute(keyboardLayout: source.keyboardLayout, perContextUnknown: perContextUnknown, concealed: concealed, spikeKeyed: spikeKeyed) {
      case .refusedConcealed:
        throw concealedInputUnavailable(sourceID: source.id, perContext: source.keyboardLayout && perContextUnknown)
      case .paste:
        try typeTextByPaste(text, PasteTarget(app: app, pid: pid, application: application, keyboard: target, guarding: guarding),
                            context, meta: &meta)
        return ["meta": meta.wire]
      case .keyed: break
      }
      guard let layout = KeyLayout.current() else {
        throw EngineError(name: "keyboardLayoutUnavailable", "Unable to get the current keyboard layout.")
      }
      meta.inputRoute = keyRoute(forced: forced)
      let activation = try forcedActivation(meta.inputRoute, pid: pid, application: application, meta: &meta)
      defer { activation?.deactivate() }  // an inputSourceChanged mid-typing undoes a forced activation too
      let poster = EventPoster.toProcess(target, sourceState: privateSourceArg(args) ? .privateState : .hidSystemState)
      let initialSource = currentInputSourceID()
      defer { context.connection.markActed(app) }  // text stopped midway changed the app too
      try keyText(typedUnits(text, press: layout.press(for:)), concealed: concealed,
                  checkSource: { try self.checkInputSource(initialSource, entered: $0, total: $1) },
                  checkIntervention: guarding.checkInFlight, post: { poster.post($0) },
                  pause: { usleep(250) },  // the vendor's gap between typed-text events (F §12)
                  meta: &meta)
      return ["meta": meta.wire]
    } catch let error as EngineError {
      throw withMeta(error, meta)
    }
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
  func keyboardTarget(_ application: AXUIElement, fallback pid: pid_t) -> pid_t {
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
