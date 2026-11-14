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
///
/// #324: `caretFirst` is asked first, with the field's role, whether it focuses the field itself (a WebKit page's field,
/// `focusByCaretFirst`); when it answers true nothing else here runs, no AXFocused write and no click.
@discardableResult
func focusFieldIfNeeded(_ element: AXUIElement, bundleIdentifier: String?, ax: AXOps, beforeMutating: () throws -> Void = {},
                        caretFirst: (_ role: String) throws -> Bool = { _ in false }, click: () throws -> Void) throws -> Bool {
  guard let role = fieldNeedingFocus(element, ax: ax) else { return false }
  if try caretFirst(role) { return false }
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

/// The role of a field focusFieldIfNeeded acts on (a focusable text field, text area or date-time area that is not
/// focused); nil for any other element, which needs no focusing.
func fieldNeedingFocus(_ element: AXUIElement, ax: AXOps) -> String? {
  guard let role = ax.role(element), focusFieldRoles.contains(role), ax.isSettable(element, kAXFocusedAttribute) else { return nil }
  return bool(ax.read(element, kAXFocusedAttribute)) == true ? nil : role
}

// MARK: Caret first on a WebKit page's field (#324)
//
// #324's spike (runs 42468407027, 42472740707 and 42476788546, kit `probe/324-measure`): on Safari, focusFieldIfNeeded's
// AXFocused write activates Safari (#313's finding), and its posted fallback click joins set_value's held activation and
// takes #321's hold, a freeze of about 300 ms with the reorder hidden inside it. Writing the field's caret
// (AXSelectedTextRange {0, 0}) focused it 32 of 32 with no raise and no pointer event on the page, and the freeze fell to
// the held activation's own, about 120 ms. On an AppKit field the caret and the press both fail and the AXFocused write
// works (16 of 16, no raise), so only a WebKit page's field takes this route (the design session's ruling 8c206e91).

/// Whether a password field (AXSecureTextField, or a subrole that cannot be read) takes the caret-first route too. On
/// since the hosted check measured it (runs 42480471918, 42480982911; ruling eecaccfe): Safari's password set_value
/// 20 of 20 delivered, 0 raises, no page events, a 124 ms freeze. Off, a password field keeps main's AXFocused write and
/// fallback click. Its value and range are never read either way.
let caretFirstCoversSecureFields = true

/// How focusField focuses a field that needs it (#324).
enum FieldFocusRoute: Equatable {
  /// focusFieldIfNeeded's: AXFocused written and read again, then the fallback click (a Safari DOM element straight to
  /// the click).
  case focusWrite
  /// A text-entry field in a WebKit page (#313's classification, `textEntryClickRoute`'s `selecting`): its caret, then
  /// its AXPress, each read back (`focusByCaretFirst`).
  case caretFirst
}

/// The route of a field focusField must focus (`role` its role): caret first for a text-entry role in a web area in a
/// WebKit process, a password field included while `caretFirstCoversSecureFields` is on; focusFieldIfNeeded's otherwise, an
/// AppKit field, a field outside every web area and a Chromium or Gecko page's included. Only a process that is
/// neither Chromium's nor Gecko's reads the field's parents.
func fieldFocusRoute<Element>(_ element: Element, role: String, engine: PageEngine, roleOf: (Element) -> String?, parent: (Element) -> Element?,
                              subrole: () -> SubroleRead, coversSecure: Bool = caretFirstCoversSecureFields) -> FieldFocusRoute {
  guard textEntryClickRoute(element, role: role, engine: engine, roleOf: roleOf, parent: parent) == .pressConfirmingFocus(selecting: true) else {
    return .focusWrite
  }
  if !coversSecure, secureTextField(role: role, subrole: subrole()) { return .focusWrite }
  return .caretFirst
}

/// The caret-first route (#324, ruling 8c206e91): the in-flight check, then the field's caret written at its start
/// (`writeCaret`, AXSelectedTextRange {0, 0}, its AXError kept) and its focus read back (`readingFocus`,
/// `textEntryFocusSettleMs`); still unfocused, the in-flight check again and its AXPress where it advertises one
/// (`actions`), read back again. `noted` records the last step and its read-back. A field that has not read focused by
/// then is refused (`caretFirstUnconfirmed`) before the method writes anything. Nothing writes AXFocused and nothing is
/// posted.
func focusByCaretFirst(app: String, beforeMutating: () throws -> Void, writeCaret: () -> AXError, actions: () -> [String],
                       press: (String) -> Void, focused: () -> Bool?, noted: (TextEntryFocusRecord) -> Void,
                       now: () -> Double, sleep: (Double) -> Void) throws {
  try beforeMutating()
  var written = AXError.success
  let caret = try readingFocus(after: { written = writeCaret() }, focused: focused, now: now, sleep: sleep)
  var record = TextEntryFocusRecord(focus: caret, step: .selection, caretWriteError: written == .success ? nil : written.rawValue)
  if caret != .readBack, actions().contains(kAXPressAction) {
    try beforeMutating()
    let pressed = try readingFocus(after: { press(kAXPressAction) }, focused: focused, now: now, sleep: sleep)
    record = TextEntryFocusRecord(focus: pressed, step: .press, caretWriteError: record.caretWriteError)
  }
  noted(record)
  if record.focus != .readBack { throw caretFirstUnconfirmed(app, pressed: record.step == .press) }
}

/// The caret-first route's refusal: the caret was written (and, `pressed`, the field's AXPress performed), but the field
/// does not report focus, so the method wrote nothing of its own. Neither device mode is named: the route is both's.
func caretFirstUnconfirmed(_ app: String, pressed: Bool) -> EngineError {
  EngineError(name: "clickUnconfirmed",
    "\(app)'s text field could not be focused: its caret was written through accessibility\(pressed ? ", then its accessibility action was performed" : ""), but the field does not report focus, so the requested value or selection was not written. Observe \(app) with get_app_state before any retry, and never retry blindly.")
}

/// focusFieldIfNeeded's `caretFirst` through `ax` (#324): whether the field takes the caret-first route
/// (`fieldFocusRoute`, by `engine` and the field's parents and subrole), and if so the route itself
/// (`focusByCaretFirst`), the caret's write and the press each run inside `stepping` (the method's interval). Answers
/// true once the route ran (the field then reads focused; otherwise it threw).
func caretFirstFocus(_ element: AXUIElement, role: String, engine: PageEngine, app: String, ax: AXOps, subrole: (AXUIElement) -> SubroleRead,
                     beforeMutating: () throws -> Void, stepping: (() -> Void) -> Void, noted: (TextEntryFocusRecord) -> Void) throws -> Bool {
  guard fieldFocusRoute(element, role: role, engine: engine, roleOf: ax.role, parent: ax.parent, subrole: { subrole(element) }) == .caretFirst else {
    return false
  }
  try focusByCaretFirst(app: app, beforeMutating: beforeMutating, writeCaret: {
    var written = AXError.failure
    stepping { written = ax.write(element, kAXSelectedTextRangeAttribute, axRangeValue(CFRange(location: 0, length: 0))) }
    return written
  }, actions: { ax.actions(element) }, press: { action in stepping { _ = ax.perform(element, action) } },
     focused: { bool(ax.read(element, kAXFocusedAttribute)) }, noted: noted, now: ax.now, sleep: ax.sleep)
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
/// included, and the method's interval spans the click's; its guard time, `pointUnconfirmed`, `routeAdvice` and its
/// delivery guard's record (`delivery`, #324: without it the click's raise reads as one outside any hold, #315's misread)
/// ride in the method's meta, which keeps the method's own route. A click refused or failed reports the meta it reached.
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
  meta.delivery = clickMeta.delivery
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
  /// noScreenshotForCoordinates when it cannot be placed). A drag's end (`dragEnd`) outside the screenshot takes #334's
  /// refusal.
  func coordinatePoint(_ x: Double, _ y: Double, app: ResolvedApp, appPid: pid_t, context: ExecutionContext,
                       dragEnd: Bool = false) throws -> (point: CGPoint, window: AXUIElement, windowFrame: CGRect) {
    let placed = try coordinatePlacement(x, y, app: app, appPid: appPid, context: context, dragEnd: dragEnd)
    return (placed.point, placed.window, placed.windowFrame)
  }

  /// `coordinatePoint` with the window-local point the conversion computed (`local`), for the click's record (#259).
  func coordinatePlacement(_ x: Double, _ y: Double, app: ResolvedApp, appPid: pid_t, context: ExecutionContext,
                           dragEnd: Bool = false) throws -> (point: CGPoint, window: AXUIElement, windowFrame: CGRect, local: CGPoint) {
    guard x.isFinite, y.isFinite else { throw EngineError.invalidArguments("x and y must be finite coordinates") }
    let application = prepare(AXUIElementCreateApplication(appPid))
    guard let window = primaryWindow(of: application), let windowFrame = frame(of: window) else {
      throw EngineError(name: "noWindowsAvailable", "noWindowsAvailable")
    }
    let local = try placeCoordinate(in: window, app: app.displayName) {
      try context.connection.screenshotPoint(x, y, app: app, window: window, lineage: context.lineage, dragEnd: dragEnd)
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
  /// one into a Chromium or (#315) Gecko web area takes the hit's own action instead when `webAreaElementRoute` allows it
  /// (an element click's, never focusField's fallback) and it advertises one, else it is refused with nothing posted.
  func synthesizedClick(_ pointing: ElementPointing, route: InputRoute, button: MouseButton, count: Int, app: ResolvedApp, appPid: pid_t,
                        guarding: InterventionGuard, context: ExecutionContext, webAreaElementRoute: Bool = true, meta: inout InputMeta) throws {
    let connection = context.connection.id
    // A point in a minimized window reaches nothing on screen (Minimized.swift); a route-1 action never comes here.
    try refuseMinimizedWindow(minimized: pointing.window.map(isMinimized) ?? false, app: app.displayName)
    guard let point = pointing.point, !pointing.relation.covered else {
      throw EngineError(name: "cannotClickOffscreenElement", "The element is not visible on screen.")
    }
    meta.pointUnconfirmed = pointing.relation.unconfirmed
    var pointer = PointerTarget.acceptingFirstMouse
    var pointerHit = pointing.hitElement
    if route == .activation && button == .left {
      let owner = pointing.owner
      (pointer, pointerHit) = clickPointerTarget(hit: pointing.hitElement, window: pointing.window, rehit: { hitTest(application: owner, at: point) },
                                                 app: app, appPid: appPid, meta: &meta)
    }
    if pointer.view.mayBeWebArea {
      switch refusedPointerCarrier(focusingFallback: !webAreaElementRoute, engine: pointer.engine) {
      case .elementRoute:
        if let hit = pointerHit {
          pointer.elementRoute = webAreaPress(hit, button: button, count: count, point: point, windowID: pointing.windowID, app: app,
                                              appPid: appPid, guarding: guarding, context: context)
        }
      case .focusPress:
        // #315 (ruling 1cd6ed32): set_value's and select_text's fallback on a Gecko page focuses the field by its press.
        let field = pointing.element
        pointer.elementRoute = { [self] meta in
          let owner = ownerPid(of: field, fallback: appPid)
          try refuseForbiddenOwner(owner)
          actionTargets(owner, app: app, connection: context.connection)
          try focusFallbackByPress(role: attribute(field, kAXRoleAttribute) as? String ?? "", actions: establishedActionNames(of: field),
                                   app: app.displayName, press: { action in
            try elementActionClick(field, owner: owner, action: action, route: actionRoute(owner: owner, app: app, connection: context.connection),
                                   point: point, windowID: pointing.windowID, app: app, appPid: appPid, guarding: guarding, context: context,
                                   meta: &meta)
          }, focused: { bool(attribute(field, kAXFocusedAttribute)) }, now: monotonicMilliseconds, sleep: { usleep(UInt32(max(0, $0) * 1000)) })
        }
      case .none: break
      }
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
  /// Inside a Chromium web area in shared mode the click is refused, never pressed (#282): an action is no focusing there.
  /// Inside a Gecko one it is carried by the field's own press, its focus read back (#315, `focusFallbackByPress`).
  /// A WebKit page's text field (#324, `caretFirstFocus`) takes neither the write nor the click, in either device mode:
  /// its caret, then its AXPress, each read back, recorded as `fieldFocus`; once either step has gone the app counts as
  /// acted on, a refusal included.
  func focusField(_ target: ElementTarget, app: ResolvedApp, appPid: pid_t, guarding: InterventionGuard, context: ExecutionContext,
                  meta: inout InputMeta) throws {
    let connection = context.connection
    let engine = webAccessibility.pageEngine(app.appPath)
    var stepped = false
    defer { if stepped { connection.markActed(app) } }
    try focusFieldIfNeeded(target.element, bundleIdentifier: app.bundleIdentifier, ax: .live, beforeMutating: guarding.checkInFlight, caretFirst: { role in
      try caretFirstFocus(target.element, role: role, engine: engine, app: app.displayName, ax: .live, subrole: subroleRead,
                          beforeMutating: guarding.checkInFlight, stepping: { step in
        stepped = true
        meta.posting { step(); return true }
      }, noted: { meta.fieldFocus = $0 })
    }) {
      try focusFallbackClick(target.element, ax: .live) {
        let route = synthesizedClickRoute(forced: nil, foreground: routeFourOverride(app.bundleIdentifier, routes: routes))
        try focusingClick(&meta, acted: { connection.markActed(app) }) { clickMeta in
          try synthesizedClick(ElementPointing(target.element, owner: target.owner), route: route, button: .left, count: 1,
                               app: app, appPid: appPid, guarding: guarding, context: context, webAreaElementRoute: false, meta: &clickMeta)
        }
      }
    }
  }

  /// What a left pointer by route 3 aims at (#282, #315; Routes.swift `pointerView`): the view `hit` is in `app`'s
  /// process, by its page engine, a web area seen there or not (`WebAccessibility`), with the app's name for the
  /// sentences. No element route: the caller adds one where a plain click may take it (`webAreaPress`).
  func pointerTarget(hit: AXUIElement?, app: ResolvedApp, appPid: pid_t, noun: String = "click") -> PointerTarget {
    let engine = webAccessibility.pageEngine(app.appPath)
    let seen = engine != .other && webAccessibility.hasSeenWebArea(pid: appPid, launched: processGeneration(launchDate: app.running?.launchDate, pid: appPid))
    let view = pointerView(engine: engine, webAreaSeen: seen, hit: hit, role: { attribute($0, kAXRoleAttribute) as? String },
                           parent: { elementAttribute($0, kAXParentAttribute) }, children: childrenRead)
    return PointerTarget(view: view, app: app.displayName, noun: noun, engine: engine)
  }

  /// `pointerTarget` for a left click by route 3, with #288's establishment first (Routes.swift `establishedPointerView`)
  /// in a Chromium process where no web area has been seen: the application's role read, `window` searched for an
  /// AXWebArea, and the point hit-tested again by `rehit` (the caller's own hit-test). Answers the target and the hit
  /// it was read from, which the element route walks; the establishment's record goes in the meta.
  func clickPointerTarget(hit: AXUIElement?, window: AXUIElement?, rehit: @escaping () -> AXUIElement?, app: ResolvedApp, appPid: pid_t,
                          meta: inout InputMeta) -> (target: PointerTarget, hit: AXUIElement?) {
    let engine = webAccessibility.pageEngine(app.appPath)
    let generation = processGeneration(launchDate: app.running?.launchDate, pid: appPid)
    let seen = engine != .other && webAccessibility.hasSeenWebArea(pid: appPid, launched: generation)
    let application = prepare(AXUIElementCreateApplication(appPid))
    let establish = PointerEstablishing<AXUIElement>(
      readAppRole: { _ = attribute(application, kAXRoleAttribute) },
      windowHasWebArea: { (window ?? primaryWindow(of: application)).map(containsWebArea) ?? false },
      noteWebArea: { [webAccessibility] in webAccessibility.noteWebArea(pid: appPid, launched: generation) },
      rehit: rehit, now: monotonicMilliseconds, sleep: { usleep(UInt32(max(0, $0) * 1000)) })
    let established = establishedPointerView(engine: engine, webAreaSeen: seen, hit: hit, role: { attribute($0, kAXRoleAttribute) as? String },
                                             parent: { elementAttribute($0, kAXParentAttribute) }, children: childrenRead,
                                             establish: establish)
    if let record = established.record { meta.pointerEstablish = record }
    return (PointerTarget(view: established.view, app: app.displayName, engine: engine), established.hit)
  }

  /// The element route a plain left click refused in a web area takes (#282): the control the hit resolves to
  /// (`webAreaControl`: the hit, or its nearest allowlisted ancestor through plain children), its action read and, where
  /// the process's accessibility is fresh, re-read for up to 2 s, or 3 s just after an enablement write, posting nothing (`webAreaActionRereading`, `webAreaRereadDeadline`), carried as an
  /// element click's is (`elementActionClick`), confirmed by its value where its role has one (`pressConfirmingValue`),
  /// and recorded with the reason `webArea`, the control's role and whether it was the hit. A control with no action
  /// after that is refused, asking for an observation first, as a hit that resolves to none is refused; either refusal
  /// records the walk (`elementClick.walk`, `walkStopped`). Nil for a click that is not a plain left one.
  ///
  /// `stalePoint` (#296, a coordinate click's; nil for an element click's synthesized path): what the route presses must
  /// be the node the screenshot showed at the point or its control (`stalePointPressVerdict`), checked just before the
  /// press, and after the action's re-read wait against the guard run again (`StalePointGate`); refused otherwise as
  /// `screenChangedSinceScreenshot`, nothing pressed. The focus route (#283) checks its field the same way.
  func webAreaPress(_ hit: AXUIElement, button: MouseButton, count: Int, point: CGPoint, windowID: CGWindowID?, app: ResolvedApp,
                    appPid: pid_t, guarding: InterventionGuard, context: ExecutionContext,
                    stalePoint: StalePointGate<AXUIElement>? = nil) -> ((inout InputMeta) throws -> Void)? {
    guard button == .left, count == 1 else { return nil }
    let engine = webAccessibility.pageEngine(app.appPath)
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
      // A text field is focused instead: on Chromium through accessibility (#283; by its caret's write, #341), with no
      // action re-read, since it works before complete mode; on Gecko by its own action, its focus read back (#315),
      // since a background Firefox ignores the write.
      if why == .editable {
        switch webAreaFocusCarrier(engine) {
        case .focusWrite:
          return webAreaFocus(hit, point: point, windowID: windowID, app: app, appPid: appPid, guarding: guarding, context: context, stalePoint: stalePoint)
        case .pressReadingFocus:
          return webAreaFocusPress(hit, point: point, windowID: windowID, app: app, appPid: appPid, guarding: guarding, context: context,
                                   stalePoint: stalePoint)
        }
      }
      return { meta in
        refused(why, &meta)
        throw backgroundClickRefused(app.displayName, engine: engine)
      }
    }
    let control = resolved.control
    return { [self] meta in
      let generation = processGeneration(launchDate: app.running?.launchDate, pid: appPid)
      let freshSince = webAccessibility.freshSince(pid: appPid, launched: generation)
      let fresh = webAreaAccessibilityFresh(freshSince: freshSince,
                                            now: monotonicMilliseconds(), webAreaSeen: webAccessibility.hasSeenWebArea(pid: appPid, launched: generation))
      // The action, re-read where fresh, then the control requalified as it is now, all before anything is posted.
      var waited = false
      let decision = webAreaPressDecision(control, walkedRole: resolved.role, fresh: fresh, freshSince: freshSince, actions: establishedActionNames(of:),
                                          role: { attribute($0, kAXRoleAttribute) as? String },
                                          parent: { elementAttribute($0, kAXParentAttribute) },
                                          editable: { attribute($0, "AXEditableAncestor") != nil },
                                          now: monotonicMilliseconds, sleep: { waited = true; usleep(UInt32($0 * 1000)) })
      let action: String, role: String
      switch decision {
      case .success(let pressed): (action, role) = (pressed.action, pressed.role)
      case .failure(let why):
        refused(why, &meta)
        throw why == .noAction ? backgroundClickRefusedObserveFirst(app.displayName, engine: engine)
                               : backgroundClickRefused(app.displayName, engine: engine)
      }
      // The early check, after the action's re-read; the final one runs at the perform, after any focus hold.
      try checkStalePoint(stalePoint, pressing: control, waited: waited, meta: &meta)
      let owner = ownerPid(of: control, fallback: appPid)
      try refuseForbiddenOwner(owner)
      actionTargets(owner, app: app, connection: context.connection)
      meta.elementClick = ElementClickRecord(plan: .action(action), reason: .webArea, hit: nil, pressedRole: role, pressedAncestor: resolved.ancestor,
                                             walk: walk)
      try pressConfirmingValue(app: app.displayName, checksValue: webAreaValueCheckedRoles.contains(role),
                               readValue: { attribute(control, kAXValueAttribute).map { "\($0)" } }, now: monotonicMilliseconds,
                               sleep: { usleep(UInt32($0 * 1000)) }) {
        try elementActionClick(control, owner: owner, action: action, route: actionRoute(owner: owner, app: app, connection: context.connection),
                               point: point, windowID: windowID, app: app, appPid: appPid, guarding: guarding, context: context,
                               finalCheck: finalStalePointCheck(stalePoint, pressing: control), meta: &meta)
      }
    }
  }

  /// #296's last check of an element route's target, after its focus hold (`elementActionClick`'s `finalCheck`): only a
  /// hold can have waited since the early check, so the guard runs again then, else the early verdict stands.
  func finalStalePointCheck(_ stalePoint: StalePointGate<AXUIElement>?,
                            pressing element: AXUIElement) -> ((_ afterHold: Bool, _ meta: inout InputMeta) throws -> Void)? {
    stalePoint.map { gate in { afterHold, meta in
      guard afterHold else { return }
      let checked = gate.check(element, waited: true, afterActivation: true, now: monotonicMilliseconds, reads: .live)
      meta.stalePoint = checked.record
      if let refusal = checked.refusal { throw refusal }
    } }
  }

  /// The focus route a plain left click into a Gecko web area's text field takes (#315, WebAreaFocus.swift
  /// `pressFocusingField`): the text-entry element the hit resolves to (`webAreaFocusTarget`, #283's walk), refused as
  /// #282's walk is when there is none; else its own action (AXPick, else AXPress) as an element click's, by route 3's
  /// held activation when Firefox does not believe it has focus (measured not raising Firefox, #287 and #313), accepted
  /// once the field reads focused, else `clickUnconfirmed`. A field advertising no action is refused, nothing done.
  /// Nothing writes AXFocused or a selection; the caret is where Gecko puts it, and the note says so. Its refusals name no
  /// alternative (`backgroundFieldAlternative`): a field this route cannot carry, an element click cannot either. Records the walk,
  /// the field's role, whether it was the hit, and the read-back (`elementClick` reason `webArea`, `focus`, `focusStep`).
  func webAreaFocusPress(_ hit: AXUIElement, point: CGPoint, windowID: CGWindowID?, app: ResolvedApp, appPid: pid_t, guarding: InterventionGuard,
                         context: ExecutionContext, stalePoint: StalePointGate<AXUIElement>? = nil) -> (inout InputMeta) throws -> Void {
    var walk: [String] = []
    let resolution = webAreaFocusTarget(hit, role: { attribute($0, kAXRoleAttribute) as? String }, subrole: subroleRead,
                                        parent: { elementAttribute($0, kAXParentAttribute) }, editable: { attribute($0, "AXEditableAncestor") != nil },
                                        focusSettable: { AXOps.live.isSettable($0, kAXFocusedAttribute) }, walk: &walk)
    func refused(_ why: WebAreaRefusal, _ meta: inout InputMeta) {
      if meta.elementClick == nil { meta.elementClick = ElementClickRecord(plan: .synthesized(.activation), reason: .webArea) }
      meta.elementClick?.walk = walk
      meta.elementClick?.walkStopped = why.rawValue
    }
    guard case .success(let target) = resolution else {
      let why: WebAreaRefusal
      if case .failure(let refusal) = resolution { why = refusal } else { why = .incompleteAncestry }
      return { meta in
        refused(why, &meta)
        throw backgroundClickRefused(app.displayName)
      }
    }
    let field = target.element
    return { [self] meta in
      // #296: the field must be the node the screenshot showed at the point or its ancestor, before it is pressed.
      try checkStalePoint(stalePoint, pressing: field, waited: false, meta: &meta)
      let owner = ownerPid(of: field, fallback: appPid)
      try refuseForbiddenOwner(owner)
      actionTargets(owner, app: app, connection: context.connection)
      do {
        try pressFocusingField(role: target.role, actions: establishedActionNames(of: field), app: app.displayName, press: { action in
          meta.elementClick = ElementClickRecord(plan: .action(action), reason: .webArea, hit: nil, pressedRole: target.role,
                                                 pressedAncestor: target.ancestor, walk: walk)
          try elementActionClick(field, owner: owner, action: action, route: actionRoute(owner: owner, app: app, connection: context.connection),
                                 point: point, windowID: windowID, app: app, appPid: appPid, guarding: guarding, context: context,
                                 finalCheck: finalStalePointCheck(stalePoint, pressing: field), meta: &meta)
        }, focused: { bool(attribute(field, kAXFocusedAttribute)) }, noted: { record in
          meta.elementClick?.focus = record.focus.rawValue
          meta.elementClick?.focusStep = record.step.rawValue
        }, now: monotonicMilliseconds, sleep: { usleep(UInt32(max(0, $0) * 1000)) })
      } catch WebAreaRefusal.noAction {
        refused(.noAction, &meta)
        throw backgroundClickRefusedObserveFirst(app.displayName)
      }
      meta.note = pressFocusNote(app.displayName)
    }
  }

  /// The focus route a plain left click into a web area's text field takes (#283, WebAreaFocus.swift; #341's order): the
  /// text-entry element the hit resolves to (`webAreaFocusTarget`), refused as #282's walk is when there is none; else,
  /// with nothing written yet, the caret's offset at the point (`caretOffset` over the field's own characters' boxes when
  /// the hit is the field; over a contenteditable region's AXStaticText hit's boxes, mapped into the region's offsets by
  /// `regionTextStart`; boxes still empty in a process whose accessibility is fresh are re-read for up to 2 s, or 3 s
  /// just after an enablement write, `caretAwaitingBoxes`), then AXSelectedTextRange {offset, 0} written by route 1 with
  /// no activation, which focuses Chromium's field, AXFocused its fallback (and the whole of it where no offset is found
  /// or the field is a password field), each accepted once the field reads focused; the caret read back on the field
  /// and a reference character's box against its place before the writes (`focusPlacingCaret`), the result's note
  /// saying what was done. Records the walk, the focused role, whether it was the hit, the write that focused it
  /// (`focusStep`, also the plan's action), the box's shift and the caret (`elementClick` reason `focusField` or
  /// `focusedNotPlaced`).
  func webAreaFocus(_ hit: AXUIElement, point: CGPoint, windowID: CGWindowID?, app: ResolvedApp, appPid: pid_t, guarding: InterventionGuard,
                    context: ExecutionContext, stalePoint: StalePointGate<AXUIElement>? = nil) -> (inout InputMeta) throws -> Void {
    let role: (AXUIElement) -> String? = { attribute($0, kAXRoleAttribute) as? String }
    func focusTarget(_ walk: inout [String]) -> Result<WebAreaFocusTarget<AXUIElement>, WebAreaRefusal> {
      webAreaFocusTarget(hit, role: role, subrole: subroleRead, parent: { elementAttribute($0, kAXParentAttribute) },
                         editable: { attribute($0, "AXEditableAncestor") != nil },
                         focusSettable: { AXOps.live.isSettable($0, kAXFocusedAttribute) }, walk: &walk)
    }
    var walk: [String] = []
    let resolution = focusTarget(&walk)
    guard case .success(let target) = resolution else {
      let why: WebAreaRefusal
      if case .failure(let refusal) = resolution { why = refusal } else { why = .incompleteAncestry }
      return { meta in
        if meta.elementClick == nil { meta.elementClick = ElementClickRecord(plan: .synthesized(.activation), reason: .webArea) }
        meta.elementClick?.walk = walk
        meta.elementClick?.walkStopped = why.rawValue
        throw backgroundClickRefused(app.displayName)
      }
    }
    let field = target.element
    return { [self] meta in
      // #296: the field must be the node the screenshot showed at the point or its ancestor, before it is focused.
      try checkStalePoint(stalePoint, pressing: field, waited: false, meta: &meta)
      let owner = ownerPid(of: field, fallback: appPid)
      try refuseForbiddenOwner(owner)
      actionTargets(owner, app: app, connection: context.connection)
      meta.inputRoute = .action
      meta.elementClick = ElementClickRecord(plan: .action(kAXFocusedAttribute), reason: .focusField, pressedRole: target.role,
                                             pressedAncestor: target.ancestor, walk: walk)
      var waited = false
      let sleep: (Double) -> Void = { waited = true; usleep(UInt32($0 * 1000)) }
      let generation = processGeneration(launchDate: app.running?.launchDate, pid: appPid)
      let freshSince = webAccessibility.freshSince(pid: appPid, launched: generation)
      let fresh = webAreaAccessibilityFresh(freshSince: freshSince,
                                            now: monotonicMilliseconds(), webAreaSeen: webAccessibility.hasSeenWebArea(pid: appPid, launched: generation))
      // The agent cursor at the point as the first write goes out, once.
      var cursorShown = false
      func showCursor() {
        guard !cursorShown else { return }
        cursorShown = true
        cursor.act(connection: context.connection.id, app: app.key, window: windowID, .click(point))
      }
      // #341: the element whose boxes gave the offset and the offset in its own text; the reference character, chosen at
      // the first read of its box (`caretMarkIndex`).
      var markAt: (element: AXUIElement, offset: Int)?
      var markIndex: Int?
      var focusRecord: WebAreaFocusRecord?
      let outcome = try focusPlacingCaret(
        app: app.displayName, secure: target.secure, fresh: fresh, freshSince: freshSince, beforeMutating: guarding.checkInFlight,
        beforeCaret: {
          // After the boxes' re-read, which precedes every write (#341), the guard again: a changed page is refused with
          // nothing written.
          guard waited, let stalePoint else { return }
          let checked = stalePoint.check(field, waited: true, now: monotonicMilliseconds, reads: .live)
          meta.stalePoint = checked.record
          if let refusal = checked.refusal { throw refusal }
        },
        writeFocused: {
          showCursor()
          _ = meta.posting { _ = gatedWrite(field, kAXFocusedAttribute, kCFBooleanTrue); return true }
        },
        focused: { bool(attribute(field, kAXFocusedAttribute)) },
        offset: {
          guard target.ancestor else {
            let found = fieldCaretOffset(field, at: point)
            markAt = (try? found.get()).map { (field, $0) }
            return found
          }
          // A contenteditable region: the hit's own boxes give its text's offset, mapped into the region's.
          guard role(hit) == "AXStaticText" else { return .failure(.unmapped) }
          let local = fieldCaretOffset(hit, at: point)
          guard case .success(let offset) = local else { return local }
          guard let start = regionTextStart(of: hit, in: field, children: childrenRead, role: role,
                                            value: { attribute($0, kAXValueAttribute) }, same: { CFEqual($0, $1) }) else {
            return .failure(.unmapped)
          }
          markAt = (hit, offset)
          return .success(start + offset)
        },
        sameTarget: {
          // The hit still resolves, as the click first resolved it, to the element focused, and still not a secure one.
          var again: [String] = []
          guard case .success(let now) = focusTarget(&again) else { return false }
          return CFEqual(now.element, field) && !now.secure
        },
        valueLength: { (attribute(field, kAXValueAttribute) as? String).map { ($0 as NSString).length } },
        layoutMark: {
          guard let (element, local) = markAt else { return nil }
          let usableBox = { (index: Int) -> CGRect? in characterBounds(element, index).flatMap { $0.height > 0 ? $0 : nil } }
          if markIndex == nil {
            let length = (attribute(element, kAXValueAttribute) as? String).map { ($0 as NSString).length } ?? 0
            markIndex = caretMarkIndex(offset: local, length: length, usable: { usableBox($0) != nil })
          }
          return markIndex.flatMap(usableBox)
        },
        writeSelection: { offset in
          showCursor()
          _ = meta.posting { _ = gatedWrite(field, kAXSelectedTextRangeAttribute, axRangeValue(CFRange(location: offset, length: 0))); return true }
        },
        selection: {
          guard let range = rangeWire(attribute(field, kAXSelectedTextRangeAttribute)), let location = range["location"],
                let length = range["length"] else { return nil }
          return (location, length)
        },
        noted: { focusRecord = $0 },
        now: monotonicMilliseconds, sleep: sleep)
      // The plan's action is the write the field took focus from (#341).
      let action = focusRecord?.step == .selection ? kAXSelectedTextRangeAttribute : kAXFocusedAttribute
      switch outcome {
      case .placed:
        meta.elementClick = ElementClickRecord(plan: .action(action), reason: .focusField, pressedRole: target.role,
                                               pressedAncestor: target.ancestor, walk: walk, caret: "placed")
      case .notPlaced(let why):
        meta.elementClick = ElementClickRecord(plan: .action(action), reason: .focusedNotPlaced, pressedRole: target.role,
                                               pressedAncestor: target.ancestor, walk: walk, caret: why.rawValue)
      }
      meta.elementClick?.focusStep = focusRecord?.step.rawValue
      meta.elementClick?.caretMarkShift = focusRecord?.markShift
      meta.note = focusNote(app.displayName, outcome)
    }
  }

  /// #296's check of what an element route is about to act on (`StalePointGate.check`): its record into the meta, and its
  /// refusal thrown, nothing pressed. Nothing without a gate.
  func checkStalePoint(_ gate: StalePointGate<AXUIElement>?, pressing element: AXUIElement, waited: Bool, meta: inout InputMeta) throws {
    guard let gate else { return }
    let checked = gate.check(element, waited: waited, now: monotonicMilliseconds, reads: .live)
    meta.stalePoint = checked.record
    if let refusal = checked.refusal { throw refusal }
  }

  /// An element click by its own action (route 1; route 3's held activation first, `route` .activation, when the app does
  /// not believe it has focus, FocusHold.swift): the in-flight check, the agent cursor at `point` as the action goes
  /// out, and the action, refused as actionFailed when the element does not accept it.
  ///
  /// `finalCheck` (#296, a coordinate click's element route): the stale-point guard's last check, just before the action
  /// and after the focus hold (`pressAfterFinalCheck`), told whether the hold ran.
  func elementActionClick(_ element: AXUIElement, owner: pid_t, action: String, route: InputRoute, point: CGPoint?, windowID: CGWindowID?,
                          app: ResolvedApp, appPid: pid_t, guarding: InterventionGuard, context: ExecutionContext,
                          finalCheck: ((_ afterHold: Bool, _ meta: inout InputMeta) throws -> Void)? = nil, meta: inout InputMeta) throws {
    try pressAfterFinalCheck(holds: route == .activation, hold: {
      try holdElementFocus(element: element, owner: owner, app: app, appPid: appPid, guarding: guarding, context: context, meta: &meta)
    }, finalCheck: { afterHold in try finalCheck?(afterHold, &meta) }, perform: {
      try guarding.checkInFlight()
      if let point { cursor.act(connection: context.connection.id, app: app.key, window: windowID, .click(point)) }
      try deliverAction(action, route: route, perform: { gatedPerform(element, $0) }, meta: &meta)
    })
  }
}
