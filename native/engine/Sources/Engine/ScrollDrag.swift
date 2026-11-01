import AppKit
import ApplicationServices
import Foundation

// scroll and drag (the spec's Design, "Scroll" and "Drag"; R/F-helper-logic.md §16.5–16.6, R/sky-behaviour.md §11 and
// §16; the Decision Log's M2a vendor reading, items 6 and 7).
//
// scroll: one scroll-wheel event in pixels from an HID-state source, `round(pages × max(length, 100))` with the length
// the element's own frame on the axis (the window's when it has none) or the window's for a coordinate, aimed at the
// element's clickable point after a scroll into view, or at the coordinate, with the window in fields 51, 91 and 92 and
// its window-local point, posted to the process serving the point by route 2′, the plain post (the vendor activates
// nothing for a scroll either). A horizontal scroll carries two wheels, so its delta in the second is read (the
// vendor's wheel count 1 may drop it; a declared difference M2b's matrix checks). A scroll never arms the settle.
//
// drag: the vendor's five events (down, dragged at the start, the midpoint and the end, up), all aimed at the start
// point's window, posted to the process serving the start point; into a background app by route 3's activation like a
// synthesized click, never ⌘ (route 4 under the owner's override). The vendor's AXPress on a menu under the start point
// is not built, as a coordinate click's is not.

enum ScrollDirection: String {
  case up, down, left, right

  var horizontal: Bool { self == .left || self == .right }
}

/// A scroll's delta in pixels (0x100156784): `pages × max(length, 100)`, rounded half away from zero, no minimum of 1;
/// refused past Int32.
func scrollDelta(pages: Double, length: CGFloat?) throws -> Int32 {
  let amount = (pages * Double(max(length ?? 0, 100))).rounded(.toNearestOrAwayFromZero)
  guard let delta = Int32(exactly: amount) else { throw EngineError.invalidArguments("the scroll amount is too large") }
  return delta
}

/// The wheels of a scroll by `delta` pixels: up (0, +n), down (0, −n), left (+n, 0), right (−n, 0) as (x, y), and the
/// wheel count, 2 for a horizontal scroll so its second wheel is read. The second wheel's sign runs as the first's: a
/// positive delta scrolls toward the content's start, up on the first wheel and left on the second (read on TextEdit
/// on 2026-10-21, a +n second wheel moving the horizontal bar 0.5 → 0; the vendor's recovered signs, left −n and
/// right +n, are the other way round).
func scrollWheels(_ direction: ScrollDirection, delta: Int32) -> (count: UInt32, vertical: Int32, horizontal: Int32) {
  switch direction {
  case .up: return (1, delta, 0)
  case .down: return (1, -delta, 0)
  case .left: return (2, 0, delta)
  case .right: return (2, 0, -delta)
  }
}

/// The scroll-wheel event (`SynthesizedEvent.scroll` 0x100743b58): pixel units from an HID-state source, the global
/// point, and the window it is aimed at.
func scrollEvent(_ direction: ScrollDirection, delta: Int32, at target: ClickTarget) -> CGEvent? {
  let wheels = scrollWheels(direction, delta: delta)
  guard let event = CGEvent(scrollWheelEvent2Source: CGEventSource(stateID: .hidSystemState), units: .pixel,
                            wheelCount: wheels.count, wheel1: wheels.vertical, wheel2: wheels.horizontal, wheel3: 0) else { return nil }
  event.location = target.point
  stampWindow(event, id: target.windowID, frame: target.windowFrame, point: target.point, windowIDField: true)
  return event
}

extension Engine {
  /// `scroll {app, direction, pages?, element | x, y}`: with neither an element nor a point, at the primary window's
  /// centre (the vendor scrolls at its virtual cursor, which cua has no counterpart of).
  func scroll(_ args: [String: Any], _ context: ExecutionContext) throws -> Any {
    guard let direction = (args["direction"] as? String).flatMap(ScrollDirection.init(rawValue:)) else {
      throw EngineError.invalidArguments("direction must be up, down, left or right")
    }
    let pages: Double
    if args["pages"] == nil || args["pages"] is NSNull {
      pages = 1
    } else {
      guard let given = numberArg(args["pages"]), given.isFinite, given > 0 else {
        throw EngineError(name: "invalidScrollPages", "pages must be a number greater than 0")
      }
      pages = given
    }
    let token = try elementTokenArg(args, lineage: context.lineage)
    let hasPoint = numberArg(args["x"]) != nil || numberArg(args["y"]) != nil
    guard !(token != nil && hasPoint) else { throw EngineError.invalidArguments("scroll takes either element or coordinates, not both") }

    var meta = InputMeta(context)
    do {
      let (app, appPid, guarding) = try inputPrologue(args, context, meta: &meta)
      let target: ClickTarget
      let length: CGFloat?
      let window: AXUIElement?
      if let token {
        let resolved = try targetElement(token, app: app, appPid: appPid, context: context)
        // A minimized own window is refused before the scroll into view and the point (Minimized.swift).
        let (element, pointing, point) = try elementScrollPlacement(resolved.element, app: app.displayName, ax: .live) {
          let element = try positionedTarget(resolved, token: token, app: app, appPid: appPid, context: context, guarding: guarding)
          let pointing = ElementPointing(element.element, owner: element.owner)
          guard let point = pointing.point else { throw EngineError(name: "cannotClickOffscreenElement", "The element is not visible on screen.") }
          return (element, pointing, point)
        }
        target = ClickTarget(point: point, windowFrame: pointing.windowFrame, windowID: pointing.windowID, pid: element.owner)
        let own = frame(of: element.element) ?? pointing.windowFrame
        length = own.map { direction.horizontal ? $0.width : $0.height }
        window = pointing.window
      } else {
        let placed: (point: CGPoint, window: AXUIElement, windowFrame: CGRect)
        if hasPoint {
          guard let x = numberArg(args["x"]), let y = numberArg(args["y"]) else { throw EngineError.invalidArguments("scroll needs both x and y") }
          placed = try coordinatePoint(x, y, app: app, appPid: appPid, context: context)
        } else {
          guard let window = primaryWindow(of: prepare(AXUIElementCreateApplication(appPid))), let windowFrame = frame(of: window) else {
            throw EngineError(name: "noWindowsAvailable", "noWindowsAvailable")
          }
          placed = (CGPoint(x: windowFrame.midX, y: windowFrame.midY), window, windowFrame)
        }
        window = placed.window  // a coordinate's was refused already when placed; the centre's is checked below
        let owner = hitTest(window: placed.window, at: placed.point).map { ownerPid(of: $0, fallback: appPid) } ?? appPid
        try refuseForbiddenOwner(owner)
        actionTargets(owner, app: app, connection: context.connection)
        target = ClickTarget(point: placed.point, windowFrame: placed.windowFrame,
                             windowID: windowNumber(of: placed.window, pid: appPid, frame: placed.windowFrame), pid: owner)
        length = direction.horizontal ? placed.windowFrame.width : placed.windowFrame.height
      }
      // A wheel at a point in a minimized window reaches nothing on screen (Minimized.swift): refused before the delta,
      // the in-flight check and the post.
      try pointerInput(in: window, app: app.displayName) {
        let delta = try scrollDelta(pages: pages, length: length)
        meta.inputRoute = .plainPost
        try guarding.checkInFlight()
        guard let event = scrollEvent(direction, delta: delta, at: target) else {
          throw EngineError(name: "eventCreationFailed", "The scroll event could not be created.")
        }
        cursor.act(connection: context.connection.id, app: app.key, window: target.windowID, .scroll(target.point))
        meta.posting { _ = postToProcess([event], pid: target.pid); return true }
      }
      return ["meta": meta.wire]  // a scroll never arms the settle (F §8.1)
    } catch let error as EngineError {
      throw withMeta(error, meta)
    }
  }

  /// `drag {app, from_x, from_y, to_x, to_y}`, both points in the pixels of the connection's last screenshot of the
  /// app's primary window.
  func drag(_ args: [String: Any], _ context: ExecutionContext) throws -> Any {
    guard let fromX = numberArg(args["from_x"]), let fromY = numberArg(args["from_y"]),
          let toX = numberArg(args["to_x"]), let toY = numberArg(args["to_y"]) else {
      throw EngineError.invalidArguments("drag needs from_x, from_y, to_x and to_y")
    }
    let forced = try spikeRouteArg(args, usable: InputRoute.synthesized)

    var meta = InputMeta(context)
    do {
      let (app, appPid, guarding) = try inputPrologue(args, context, meta: &meta)
      let start = try coordinatePoint(fromX, fromY, app: app, appPid: appPid, context: context)
      let end = try coordinatePoint(toX, toY, app: app, appPid: appPid, context: context)
      // Both points were refused in a minimized window as they were placed (coordinatePoint), before anything below.
      let owner = hitTest(window: start.window, at: start.point).map { ownerPid(of: $0, fallback: appPid) } ?? appPid
      try refuseForbiddenOwner(owner)
      actionTargets(owner, app: app, connection: context.connection)
      let windowID = windowNumber(of: start.window, pid: appPid, frame: start.windowFrame)
      let window = ClickTarget(point: start.point, windowFrame: start.windowFrame, windowID: windowID, pid: owner)
      let route = coordinateClickRoute(forced: forced, foreground: routeFourOverride(app.bundleIdentifier, routes: routes))
      let activation = route == .activation
        ? FakeActivation(pid: owner, appPid: appPid, window: start.window, windowFrame: start.windowFrame, windowID: windowID) : nil
      try armingSettle(&meta, acted: { context.connection.markActed(app) }) { meta in
        try recordingRouteAdvice(route, app: app, meta: &meta) { meta in
          try deliverPointer(to: owner, route: route, activation: activation, activations: heldActivations,
                             foreground: route == .foreground ? ForegroundAssist(appPid: appPid) : nil,
                             beforeActivating: guarding.checkInFlight, beforePosting: guarding.checkInFlight,
                             announce: { cursor.act(connection: context.connection.id, app: app.key, window: windowID, .drag([start.point, end.point])) },
                             post: { $0.postToPid($1) }, meta: &meta) {
            let active = NSRunningApplication(processIdentifier: owner)?.isActive == true
            return dragEvents(from: start.point, to: end.point, window: window, flags: clickFlags(route, targetActive: active))
          }
        }
      }
      return ["meta": meta.wire]
    } catch let error as EngineError {
      throw withMeta(error, meta)
    }
  }
}
