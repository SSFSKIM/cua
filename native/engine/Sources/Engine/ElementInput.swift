import AppKit
import ApplicationServices
import Foundation

// What every input method shares (the spec's Design, "Input"; the Decision Log's M2a.1 item 5 and M2a vendor reading):
// the prologue in the one call order every input method keeps (the app, the Accessibility grant, the intervention guard
// read, its reading put into the meta, then the pre-action refusal, all before anything is posted; the in-flight check
// runs later, between events); an element token resolved in the request's lineage with its serving process checked
// against the forbidden list; a coordinate placed in the window it was taken in; a synthesized element click at the
// element's clickable point by route 3 (route 4 for an app the owner's override names), which an element click, the
// focus fallback of set_value and select_text share; and the vendor's focusFieldIfNeeded.

/// An element an input method acts on: its lineage entry and the process that serves it, already checked against the
/// forbidden list.
struct ElementTarget {
  let entry: LineageEntry
  let owner: pid_t
  var element: AXUIElement { entry.element }
}

/// Where a synthesized click on an element goes, read live: its own window (a panel's is its serving process's; a
/// menu-bar item has none), the part of it that shows and the point there, and what the hit-test at that point answers
/// relative to it, taken once and only when asked.
final class ElementPointing {
  let element: AXUIElement
  let owner: pid_t
  let window: AXUIElement?
  let windowFrame: CGRect?
  let windowID: CGWindowID?
  let visible: CGRect?
  let point: CGPoint?
  private var hit: HitRelation?
  /// The element the hit-test at the point answered, once `relation` has been taken (nil: no point, or no answer).
  private(set) var hitElement: AXUIElement?

  init(_ element: AXUIElement, owner: pid_t, ax: AXOps = .live) {
    self.element = element
    self.owner = owner
    let window = elementAttribute(element, kAXWindowAttribute)
    let windowFrame = window.flatMap { frame(of: $0) }
    let visible = ax.visible(element)
    self.window = window
    self.windowFrame = windowFrame
    windowID = window.flatMap { windowNumber(of: $0, pid: owner, frame: windowFrame) }
    self.visible = visible
    point = clickablePoint(frame: visible, visibleIn: windowFrame)
  }

  /// The hit-test at the point, classified against the element (no point: no answer).
  var relation: HitRelation {
    if let hit { return hit }
    hitElement = point.flatMap { hitTest(application: owner, at: $0) }
    let found = hitRelation(hitElement, to: element, parent: { elementAttribute($0, kAXParentAttribute) }, same: { CFEqual($0, $1) })
    hit = found
    return found
  }

  /// The hit-test's answer if `relation` has been taken, without taking it (the click's record, ElementClickRecord).
  var taken: HitRelation? { hit }
}

/// The area route 3's activation click must not land in: for a click with any button but the left, the target's own
/// area, so the activation's left down and up never reach the element whose click means something else (a middle click
/// opens a link in a new tab; the Decision Log's M2a vendor reading, item 8). Nil for a left click.
func activationSparing(button: MouseButton, target: CGRect?) -> CGRect? {
  button == .left ? nil : target
}

/// A coordinate click's target area: the frame of the element the hit-test answers at the point, else the point itself.
func pointArea(_ point: CGPoint, hitFrame: CGRect?) -> CGRect {
  hitFrame ?? CGRect(x: point.x - 0.5, y: point.y - 0.5, width: 1, height: 1)
}

/// The roles the vendor's focusFieldIfNeeded acts on (0x10079f46c).
private let focusFieldRoles: Set<String> = [kAXTextFieldRole, kAXTextAreaRole, "AXDateTimeArea"]

/// The vendor's focusFieldIfNeeded (0x10079f46c / 0x10079f6d0), shared by set_value and select_text: a focusable text
/// field, text area or date-time area that is not focused gets AXFocused set true and re-read, and a synthesized click
/// on it (`click`) when focus did not take; Safari's elements exposing AXDOMClassList go straight to the click. Nothing
/// otherwise. `beforeMutating` runs before the write and before the click (the in-flight intervention check: a user
/// event stops the preparation before it moves the user's focus). Answers whether the click ran.
@discardableResult
func focusFieldIfNeeded(_ element: AXUIElement, bundleIdentifier: String?, ax: AXOps, beforeMutating: () throws -> Void = {},
                        click: () throws -> Void) throws -> Bool {
  guard let role = ax.role(element), focusFieldRoles.contains(role), ax.isSettable(element, kAXFocusedAttribute) else { return false }
  if bool(ax.read(element, kAXFocusedAttribute)) == true { return false }
  let straightToClick = bundleIdentifier == "com.apple.Safari" && ax.read(element, "AXDOMClassList") != nil
  if !straightToClick {
    try beforeMutating()
    _ = ax.write(element, kAXFocusedAttribute, kCFBooleanTrue)
    if bool(ax.read(element, kAXFocusedAttribute)) == true { return false }
  }
  try beforeMutating()
  try click()
  return true
}

/// prepareToInteract's positioning (F §16.8; the re-fetch after a reported scroll, 0x1000701f8): the element scrolled
/// into view and, when an operation scrolled, its target resolved again by `refetch`, since the scroll may have replaced
/// the element (a recycled row) rather than moved it, and the process serving the result is checked again. A target that
/// showed already, or that nothing could scroll, is kept as it was resolved.
func scrolledIntoView(_ target: ElementTarget, ax: AXOps, beforeMutating: () throws -> Void = {},
                      refetch: () throws -> ElementTarget) throws -> ElementTarget {
  switch try positionElement(target.element, ax: ax, beforeMutating: beforeMutating) {
  case .visible, .unscrollable: return target
  case .scrolled, .stillHidden: return try refetch()
  }
}

/// The bookkeeping around focusFieldIfNeeded's fallback click (`click`, which fills the meta it is given): once the click
/// has posted, the app counts as acted on (`acted`, arming the settle) whatever follows, a refusal of the action
/// included, and the method's interval spans the click's; its guard time, `pointUnconfirmed` and `routeAdvice` ride in
/// the method's meta, which keeps the method's own route. A click refused or failed reports the meta it reached.
func focusingClick(_ meta: inout InputMeta, acted: () -> Void, click: (inout InputMeta) throws -> Void) throws {
  var clickMeta = meta
  defer { if clickMeta.startedAt != nil { acted() } }
  do {
    try click(&clickMeta)
  } catch {
    meta = clickMeta
    throw error
  }
  meta.startedAt = clickMeta.startedAt
  meta.endedAt = clickMeta.endedAt
  meta.activationGuardMs = clickMeta.activationGuardMs
  meta.pointUnconfirmed = clickMeta.pointUnconfirmed
  meta.routeAdvice = clickMeta.routeAdvice
}

extension Engine {
  /// The prologue of an input method, in the call order every one keeps: the app, the Accessibility grant, the
  /// intervention guard, its reading into the meta, the pre-action refusal. Nothing has been posted by its end.
  func inputPrologue(_ args: [String: Any], _ context: ExecutionContext, meta: inout InputMeta) throws -> (app: ResolvedApp, pid: pid_t, guarding: InterventionGuard) {
    let app = try resolveApp(args)
    guard let pid = app.pid else { throw EngineError(.runningApplicationNotFound, "Running application not found: \(app.displayName)") }
    try requireAccessibility()
    let guarding = interventionGuard(app: app, pid: pid, requestApp: args["app"] as? String, connection: context.connection)
    meta.apply(guarding)
    try guarding.checkBeforePosting()
    return (app, pid, guarding)
  }

  /// The element `token` names in the request's lineage, and the process serving it, which must not be forbidden (a
  /// sheet or panel is served by another process than the app) and whose attributed events count as the user's on the
  /// app from now on. A re-fetch walks what the lineage's current revision walked: the recorded menu-bar item when the
  /// observation was rooted there, else the window and the menu bar.
  func targetElement(_ token: String, app: ResolvedApp, appPid: pid_t, context: ExecutionContext, refetch: Refetch = .ifNeeded) throws -> ElementTarget {
    guard let lineage = context.lineage else { throw EngineError.invalidArguments("lineage is required with an element token") }
    let entry = try context.connection.element(token, app: app, lineage: lineage, refetch: refetch) { ElementResolver.live($0, pid: appPid) }
    let owner = ownerPid(of: entry.element, fallback: appPid)
    try refuseForbiddenOwner(owner)
    actionTargets(owner, app: app, connection: context.connection)
    return ElementTarget(entry: entry, owner: owner)
  }

  /// `target` scrolled into view, re-resolved when the scroll moved the tree (`scrolledIntoView`): the one boundary
  /// every element action that positions passes (click, perform_secondary_action, set_value, an element scroll). The
  /// in-flight intervention check runs before each scroll operation.
  func positionedTarget(_ target: ElementTarget, token: String, app: ResolvedApp, appPid: pid_t, context: ExecutionContext,
                        guarding: InterventionGuard) throws -> ElementTarget {
    try scrolledIntoView(target, ax: .live, beforeMutating: guarding.checkInFlight) {
      try targetElement(token, app: app, appPid: appPid, context: context, refetch: .always)
    }
  }

  /// The token an element method requires; `method` names the method in the refusal.
  func requiredElementToken(_ args: [String: Any], _ context: ExecutionContext, method: String) throws -> String {
    guard let token = try elementTokenArg(args, lineage: context.lineage) else { throw EngineError.invalidArguments("\(method) needs an element") }
    return token
  }

  /// A coordinate the model sent, in the pixels of the connection's last screenshot of the app's primary window, as a
  /// global point in that window (Screenshot.swift; refused as windowMinimized when that window is minimized, then as
  /// noScreenshotForCoordinates when it cannot be placed).
  func coordinatePoint(_ x: Double, _ y: Double, app: ResolvedApp, appPid: pid_t, context: ExecutionContext) throws -> (point: CGPoint, window: AXUIElement, windowFrame: CGRect) {
    let placed = try coordinatePlacement(x, y, app: app, appPid: appPid, context: context)
    return (placed.point, placed.window, placed.windowFrame)
  }

  /// `coordinatePoint` with the window-local point the conversion computed (`local`), for the click's record (#259).
  func coordinatePlacement(_ x: Double, _ y: Double, app: ResolvedApp, appPid: pid_t, context: ExecutionContext) throws
    -> (point: CGPoint, window: AXUIElement, windowFrame: CGRect, local: CGPoint) {
    guard x.isFinite, y.isFinite else { throw EngineError.invalidArguments("x and y must be finite coordinates") }
    let application = prepare(AXUIElementCreateApplication(appPid))
    guard let window = primaryWindow(of: application), let windowFrame = frame(of: window) else {
      throw EngineError(name: "noWindowsAvailable", "noWindowsAvailable")
    }
    let local = try placeCoordinate(in: window, app: app.displayName) {
      try context.connection.screenshotPoint(x, y, app: app, window: window, lineage: context.lineage)
    }
    return (CGPoint(x: windowFrame.minX + local.x, y: windowFrame.minY + local.y), window, windowFrame, local)
  }

  /// Route 3's guard outcome per app for `routeAdvice`: a refusal by the guard counts, a delivery past it resets the run.
  func recordingRouteAdvice(_ route: InputRoute, app: ResolvedApp, meta: inout InputMeta, _ deliver: (inout InputMeta) throws -> Void) throws {
    do {
      try deliver(&meta)
      if route == .activation { _ = routeAdvice.record(app.bundleIdentifier, guardFailed: false) }
    } catch let error as EngineError where route == .activation && error.errorName == "activationFailed" {
      meta.routeAdvice = routeAdvice.record(app.bundleIdentifier, guardFailed: true)
      throw error
    } catch let error as EngineError where route == .activation && error.errorName == "clickUnconfirmed" {
      _ = routeAdvice.record(app.bundleIdentifier, guardFailed: false)  // its guard passed: the events went (#282)
      throw error
    }
  }

  /// A synthesized click on an element at its clickable point: refused as not visible when nothing of it shows, its
  /// frame cannot be read now, or the hit-test there answers something unrelated to it (something covers it), reported
  /// `pointUnconfirmed` when the hit-test answers nothing or only a container; route 3's activation for the element's
  /// own window (the app's primary window for a menu-bar item's), whose click spares the element for any button but the
  /// left; the in-flight intervention check just before the click's events.
  ///
  /// A left click by route 3 is a pointer into the view the hit-test answered (#282, `pointerTarget`): in shared mode,
  /// one into a Chromium web area takes the hit's own action instead when `webAreaElementRoute` allows it (an element
  /// click's, never focusField's fallback) and it advertises one, else it is refused with nothing posted.
  func synthesizedClick(_ pointing: ElementPointing, route: InputRoute, button: MouseButton, count: Int, app: ResolvedApp, appPid: pid_t,
                        guarding: InterventionGuard, context: ExecutionContext, webAreaElementRoute: Bool = true, meta: inout InputMeta) throws {
    let connection = context.connection.id
    // A point in a minimized window reaches nothing on screen (Minimized.swift); a route-1 action never comes here.
    try refuseMinimizedWindow(minimized: pointing.window.map(isMinimized) ?? false, app: app.displayName)
    guard let point = pointing.point, !pointing.relation.covered else {
      throw EngineError(name: "cannotClickOffscreenElement", "The element is not visible on screen.")
    }
    meta.pointUnconfirmed = pointing.relation.unconfirmed
    var pointer = route == .activation && button == .left ? pointerTarget(hit: pointing.hitElement, app: app, appPid: appPid) : .acceptingFirstMouse
    if webAreaElementRoute, pointer.view.mayBeWebArea, let hit = pointing.hitElement {
      pointer.elementRoute = webAreaPress(hit, button: button, count: count, point: point, windowID: pointing.windowID, app: app,
                                          appPid: appPid, guarding: guarding, context: context)
    }
    let sparing = activationSparing(button: button, target: pointing.visible)
    let owner = pointing.owner
    func activation() -> FakeActivation {
      if let window = pointing.window {
        return FakeActivation(pid: owner, appPid: appPid, window: window, windowFrame: pointing.windowFrame, windowID: pointing.windowID, sparing: sparing)
      }
      let application = prepare(AXUIElementCreateApplication(appPid))
      return FakeActivation(pid: owner, appPid: appPid, window: primaryWindow(of: application) ?? application, sparing: sparing)
    }
    let target = ClickTarget(point: point, windowFrame: pointing.windowFrame, windowID: pointing.windowID, pid: owner)
    try recordingRouteAdvice(route, app: app, meta: &meta) { meta in
      try deliverClick(target, route: route, button: button, count: count, activation: route == .activation ? activation() : nil,
                       activations: heldActivations,
                       foreground: route == .foreground ? ForegroundAssist(appPid: appPid) : nil, pointer: pointer,
                       targetActive: { NSRunningApplication(processIdentifier: owner)?.isActive == true },
                       beforeActivating: guarding.checkInFlight, beforePosting: guarding.checkInFlight,
                       announce: { cursor.act(connection: connection, app: app.key, window: pointing.windowID, .click(point)) },
                       post: gatedPost, meta: &meta)
    }
  }

  /// focusFieldIfNeeded with its fallback click: a plain left click by the synthesized route the app takes (3, or 4
  /// under the owner's override), kept by `focusingClick`. In a minimized window the click is skipped rather than
  /// refused: set_value and select_text act through Accessibility, which needs no window on screen (Minimized.swift).
  /// Inside a Chromium web area in shared mode the click is refused, never pressed (#282): an action is no focusing.
  func focusField(_ target: ElementTarget, app: ResolvedApp, appPid: pid_t, guarding: InterventionGuard, context: ExecutionContext,
                  meta: inout InputMeta) throws {
    let connection = context.connection
    try focusFieldIfNeeded(target.element, bundleIdentifier: app.bundleIdentifier, ax: .live, beforeMutating: guarding.checkInFlight) {
      try focusFallbackClick(target.element, ax: .live) {
        let route = synthesizedClickRoute(forced: nil, foreground: routeFourOverride(app.bundleIdentifier, routes: routes))
        try focusingClick(&meta, acted: { connection.markActed(app) }) { clickMeta in
          try synthesizedClick(ElementPointing(target.element, owner: target.owner), route: route, button: .left, count: 1,
                               app: app, appPid: appPid, guarding: guarding, context: context, webAreaElementRoute: false, meta: &clickMeta)
        }
      }
    }
  }

  /// What a left pointer by route 3 aims at (#282, Routes.swift `pointerView`): the view `hit` is in `app`'s process, a
  /// web area seen there or not (`WebAccessibility`), with the app's name for the sentences. No element route: the
  /// caller adds one where a plain click may take it (`webAreaPress`).
  func pointerTarget(hit: AXUIElement?, app: ResolvedApp, appPid: pid_t, noun: String = "click") -> PointerTarget {
    let chromium = webAccessibility.isChromiumFamily(app.appPath)
    let seen = chromium && webAccessibility.hasSeenWebArea(pid: appPid, launched: processGeneration(launchDate: app.running?.launchDate, pid: appPid))
    let view = pointerView(chromium: chromium, webAreaSeen: seen, hit: hit, role: { attribute($0, kAXRoleAttribute) as? String },
                           parent: { elementAttribute($0, kAXParentAttribute) })
    return PointerTarget(view: view, app: app.displayName, noun: noun)
  }

  /// The element route a plain left click refused in a web area takes (#282): the control the hit resolves to
  /// (`webAreaControl`: the hit, or its nearest allowlisted ancestor through plain children), its action read and, where
  /// the process's accessibility is fresh, re-read for up to 2 s posting nothing (`webAreaActionRereading`), carried as an
  /// element click's is (`elementActionClick`), confirmed by its value where its role has one (`pressConfirmingValue`),
  /// and recorded with the reason `webArea`, the control's role and whether it was the hit. A control with no action
  /// after that is refused, asking for an observation first, as a hit that resolves to none is refused; either refusal
  /// records the walk (`elementClick.walk`, `walkStopped`). Nil for a click that is not a plain left one.
  func webAreaPress(_ hit: AXUIElement, button: MouseButton, count: Int, point: CGPoint, windowID: CGWindowID?, app: ResolvedApp,
                    appPid: pid_t, guarding: InterventionGuard, context: ExecutionContext) -> ((inout InputMeta) throws -> Void)? {
    guard button == .left, count == 1 else { return nil }
    var walk: [String] = []
    let resolution = webAreaControl(hit, role: { attribute($0, kAXRoleAttribute) as? String }, parent: { elementAttribute($0, kAXParentAttribute) },
                                    editable: { attribute($0, "AXEditableAncestor") != nil }, walk: &walk)
    // A refusal records the walk too: where it stopped, and why (an element click keeps its own plan's record).
    func refused(_ why: WebAreaRefusal, _ meta: inout InputMeta) {
      if meta.elementClick == nil { meta.elementClick = ElementClickRecord(plan: .synthesized(.activation), reason: .webArea) }
      meta.elementClick?.walk = walk
      meta.elementClick?.walkStopped = why.rawValue
    }
    guard case .success(let resolved) = resolution else {
      guard case .failure(let why) = resolution else { return nil }
      return { meta in
        refused(why, &meta)
        throw backgroundClickRefused(app.displayName)
      }
    }
    let control = resolved.control, role = resolved.role
    return { [self] meta in
      let generation = processGeneration(launchDate: app.running?.launchDate, pid: appPid)
      let fresh = webAreaAccessibilityFresh(enabledAt: webAccessibility.lastEnabledAt(pid: appPid, launched: generation),
                                            now: monotonicMilliseconds(), webAreaSeen: webAccessibility.hasSeenWebArea(pid: appPid, launched: generation))
      guard let action = webAreaActionRereading(role: role, first: establishedActionNames(of: control), fresh: fresh,
                                                read: { establishedActionNames(of: control) }, now: monotonicMilliseconds,
                                                sleep: { usleep(UInt32($0 * 1000)) }) else {
        refused(.noAction, &meta)
        throw backgroundClickRefusedObserveFirst(app.displayName)
      }
      let owner = ownerPid(of: control, fallback: appPid)
      try refuseForbiddenOwner(owner)
      actionTargets(owner, app: app, connection: context.connection)
      meta.elementClick = ElementClickRecord(plan: .action(action), reason: .webArea, hit: nil, pressedRole: role, pressedAncestor: resolved.ancestor,
                                             walk: walk)
      try pressConfirmingValue(app: app.displayName, checksValue: webAreaValueCheckedRoles.contains(role),
                               readValue: { attribute(control, kAXValueAttribute).map { "\($0)" } }, now: monotonicMilliseconds,
                               sleep: { usleep(UInt32($0 * 1000)) }) {
        try elementActionClick(control, owner: owner, action: action, route: actionRoute(owner: owner, app: app, connection: context.connection),
                               point: point, windowID: windowID, app: app, appPid: appPid, guarding: guarding, context: context, meta: &meta)
      }
    }
  }

  /// An element click by its own action (route 1; route 3's held activation first, `route` .activation, when the app does
  /// not believe it has focus, FocusHold.swift): the in-flight check, the agent cursor at `point` as the action goes
  /// out, and the action, refused as actionFailed when the element does not accept it.
  func elementActionClick(_ element: AXUIElement, owner: pid_t, action: String, route: InputRoute, point: CGPoint?, windowID: CGWindowID?,
                          app: ResolvedApp, appPid: pid_t, guarding: InterventionGuard, context: ExecutionContext, meta: inout InputMeta) throws {
    if route == .activation {
      try holdElementFocus(element: element, owner: owner, app: app, appPid: appPid, guarding: guarding, context: context, meta: &meta)
    }
    try guarding.checkInFlight()
    if let point { cursor.act(connection: context.connection.id, app: app.key, window: windowID, .click(point)) }
    try deliverAction(action, route: route, perform: { gatedPerform(element, $0) }, meta: &meta)
  }
}
