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
    let found = point.map { hitRelation(hitTest(application: owner, at: $0), to: element,
                                        parent: { elementAttribute($0, kAXParentAttribute) }, same: { CFEqual($0, $1) }) } ?? .noAnswer
    hit = found
    return found
  }
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
/// otherwise. Answers whether the click ran.
@discardableResult
func focusFieldIfNeeded(_ element: AXUIElement, bundleIdentifier: String?, ax: AXOps, click: () throws -> Void) throws -> Bool {
  guard let role = ax.role(element), focusFieldRoles.contains(role), ax.isSettable(element, kAXFocusedAttribute) else { return false }
  if bool(ax.read(element, kAXFocusedAttribute)) == true { return false }
  let straightToClick = bundleIdentifier == "com.apple.Safari" && ax.read(element, "AXDOMClassList") != nil
  if !straightToClick {
    _ = ax.write(element, kAXFocusedAttribute, kCFBooleanTrue)
    if bool(ax.read(element, kAXFocusedAttribute)) == true { return false }
  }
  try click()
  return true
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
  /// sheet or panel is served by another process than the app). A re-fetch walks what the lineage's current revision
  /// walked: the recorded menu-bar item when the observation was rooted there, else the window and the menu bar.
  func targetElement(_ token: String, app: ResolvedApp, appPid: pid_t, context: ExecutionContext) throws -> ElementTarget {
    guard let lineage = context.lineage else { throw EngineError.invalidArguments("lineage is required with an element token") }
    let entry = try context.connection.element(token, app: app, lineage: lineage) { ElementResolver.live($0, pid: appPid) }
    let owner = ownerPid(of: entry.element, fallback: appPid)
    try refuseForbiddenOwner(owner)
    actionTargets(owner, app: app, connection: context.connection)
    return ElementTarget(entry: entry, owner: owner)
  }

  /// The token an element method requires; `method` names the method in the refusal.
  func requiredElementToken(_ args: [String: Any], _ context: ExecutionContext, method: String) throws -> String {
    guard let token = try elementTokenArg(args, lineage: context.lineage) else { throw EngineError.invalidArguments("\(method) needs an element") }
    return token
  }

  /// A coordinate the model sent, in the pixels of the connection's last screenshot of the app's primary window, as a
  /// global point in that window (Screenshot.swift; refused as noScreenshotForCoordinates when it cannot be placed).
  func coordinatePoint(_ x: Double, _ y: Double, app: ResolvedApp, appPid: pid_t, context: ExecutionContext) throws -> (point: CGPoint, window: AXUIElement, windowFrame: CGRect) {
    guard x.isFinite, y.isFinite else { throw EngineError.invalidArguments("x and y must be finite coordinates") }
    let application = prepare(AXUIElementCreateApplication(appPid))
    guard let window = primaryWindow(of: application), let windowFrame = frame(of: window) else {
      throw EngineError(name: "noWindowsAvailable", "noWindowsAvailable")
    }
    let local = try context.connection.screenshotPoint(x, y, app: app, window: window, lineage: context.lineage)
    return (CGPoint(x: windowFrame.minX + local.x, y: windowFrame.minY + local.y), window, windowFrame)
  }

  /// Route 3's guard outcome per app for `routeAdvice`: a refusal by the guard counts, a delivery past it resets the run.
  func recordingRouteAdvice(_ route: InputRoute, app: ResolvedApp, meta: inout InputMeta, _ deliver: (inout InputMeta) throws -> Void) throws {
    do {
      try deliver(&meta)
      if route == .activation { _ = routeAdvice.record(app.bundleIdentifier, guardFailed: false) }
    } catch let error as EngineError where route == .activation && error.errorName == "activationFailed" {
      meta.routeAdvice = routeAdvice.record(app.bundleIdentifier, guardFailed: true)
      throw error
    }
  }

  /// A synthesized click on an element at its clickable point: refused as not visible when nothing of it shows, its
  /// frame cannot be read now, or the hit-test there answers something unrelated to it (something covers it), reported
  /// `pointUnconfirmed` when the hit-test answers nothing or only a container; route 3's activation for the element's
  /// own window (the app's primary window for a menu-bar item's), whose click spares the element for any button but the
  /// left; the in-flight intervention check just before the click's events.
  func synthesizedClick(_ pointing: ElementPointing, route: InputRoute, button: MouseButton, count: Int, app: ResolvedApp, appPid: pid_t,
                        guarding: InterventionGuard, meta: inout InputMeta) throws {
    guard let point = pointing.point, !pointing.relation.covered else {
      throw EngineError(name: "cannotClickOffscreenElement", "The element is not visible on screen.")
    }
    meta.pointUnconfirmed = pointing.relation.unconfirmed
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
                       foreground: route == .foreground ? ForegroundAssist(appPid: appPid) : nil,
                       targetActive: { NSRunningApplication(processIdentifier: owner)?.isActive == true },
                       beforePosting: guarding.checkInFlight, post: { $0.postToPid($1) }, meta: &meta)
    }
  }

  /// focusFieldIfNeeded with its fallback click: a plain left click by the synthesized route the app takes (3, or 4
  /// under the owner's override). The meta keeps the route of the method's own action; the click's guard time rides in
  /// it when one ran.
  func focusField(_ target: ElementTarget, app: ResolvedApp, appPid: pid_t, guarding: InterventionGuard, meta: inout InputMeta) throws {
    var clickMeta = meta
    let clicked = try focusFieldIfNeeded(target.element, bundleIdentifier: app.bundleIdentifier, ax: .live) {
      let route = synthesizedClickRoute(forced: nil, foreground: routeFourOverride(app.bundleIdentifier, routes: routes))
      do {
        try synthesizedClick(ElementPointing(target.element, owner: target.owner), route: route, button: .left, count: 1,
                             app: app, appPid: appPid, guarding: guarding, meta: &clickMeta)
      } catch let error as EngineError {
        meta = clickMeta  // a refused focus click reports what it reached
        throw error
      }
    }
    if clicked {
      meta.startedAt = clickMeta.startedAt  // the action's interval begins at the click's first event
      meta.activationGuardMs = clickMeta.activationGuardMs
      meta.pointUnconfirmed = clickMeta.pointUnconfirmed
      meta.routeAdvice = clickMeta.routeAdvice
    }
  }
}
