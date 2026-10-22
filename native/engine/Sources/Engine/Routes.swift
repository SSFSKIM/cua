import ApplicationServices
import CoreGraphics
import Foundation

// The input routes (the spec's Design, "Input" after the second sitting, "Keys" and "Text"; Interfaces, InputRoute): typed
// text and plain key presses by route 2′, the plain post with no fake activation; a ⌘ chord (a menu key equivalent) by
// route 3 into an app that does not believe it has focus, and an element's own action or attribute write (a click by
// AXPress, set_value, select_text, perform_secondary_action) likewise, its activation held across the interaction
// (FocusHold.swift; the Decision Log's 2026-10-22 amendment of M2a's table); clicks by the ladder 1 → 3 → 4: route 1,
// the element's own action, for a plain single left click on an element that advertises AXPick or AXPress and whose
// clickable point does not land on a strict descendant of it, and route 3, the fake activation then the plain post, for
// every synthesized click (an element without the action, any other button or count, every coordinate click) — or route
// 4, the foreground assist, in its place for an app the owner's per-app override names (`routes: {<bundle id>: 4}` in
// engine.json), and never otherwise. When route 3's guard has failed three actions in a row for an app, the refusal's
// meta names the override (`routeAdvice`), so the owner learns of the case rather than the engine deciding it. A click
// on a menu-bar item that is not the record path's plain left click (MenuRecord.swift) is refused here. Route 2,
// the ⌘ post, and a forced 2′ click are reachable only through the spike's `spikeRoute`. Everything here is pure, so the
// choice is unit-tested.

/// How an element click is carried.
enum ElementClickPlan: Equatable {
  case action(String)           // route 1, with the action to perform
  case synthesized(InputRoute)  // route 3 by default; 2 or 2′ only when forced
}

/// The clicks' ladder for an element (F §5.1 for the action's choice and the gate). `landsOnDescendant` answers whether
/// the hit-test at the element's clickable point lands on a strict descendant of it (the gate); it is called only for a
/// click route 1 could otherwise carry, and answers false when there is no point to hit-test. A menu-bar item, and the
/// menu bar itself (a synthesized click at its midpoint lands on an item), is refused whatever the click or route,
/// before anything is posted. A forced route (the spike's) skips the gate; a forced route 1
/// needs an advertised action.
func elementClickPlan(forced: InputRoute?, button: MouseButton, count: Int, role: String, actions: [String],
                      synthesized: InputRoute = .activation, landsOnDescendant: () -> Bool) throws -> ElementClickPlan {
  if role == "AXMenuBarItem" || role == "AXMenuBar" { throw menuBarItemUnsupported }
  let advertised = actions.first(where: { $0 == "AXPick" }) ?? actions.first(where: { $0 == "AXPress" })
  if let forced {
    guard forced == .action else { return .synthesized(forced) }
    guard let advertised else {
      throw EngineError.invalidArguments("spikeRoute 1 cannot carry this click: the element advertises neither AXPick nor AXPress")
    }
    return .action(advertised)
  }
  if button == .left, count == 1, let advertised, !landsOnDescendant() { return .action(advertised) }
  return .synthesized(synthesized)
}

/// The refusal of a click on a menu-bar item that the record path does not take (another button, several clicks, a
/// forced route, an item without a menu) and of any click on the menu bar itself: the vendor neither presses nor
/// synthesizes a menu-bar click, and pressing or synthesizing one would open the menu a way the vendor never does (an
/// AXPress may enter the app's menu tracking). Nothing is posted.
let menuBarItemUnsupported = EngineError(name: "menuBarItemUnsupported",
  "Only a plain left click on a menu bar item is supported: it shows the item's menu in the next observation, whose menu items can then be clicked. Nothing was clicked. For anything else, use the app's keyboard shortcut for the command with pressKey.")

/// A coordinate click's route: 3, or 4 for an app the owner's override names, unless the spike forces another.
func coordinateClickRoute(forced: InputRoute?, foreground: Bool = false) -> InputRoute {
  synthesizedClickRoute(forced: forced, foreground: foreground)
}

/// A synthesized click's route: the spike's forced one, else route 4 where the owner's override names the app, else 3.
func synthesizedClickRoute(forced: InputRoute?, foreground: Bool) -> InputRoute {
  forced ?? (foreground ? .foreground : .activation)
}

/// Whether the owner's per-app override gives `bundleIdentifier` route 4; an app without a bundle id is never named.
func routeFourOverride(_ bundleIdentifier: String?, routes: [String: Int]) -> Bool {
  bundleIdentifier.map { routes[$0] == 4 } ?? false
}

/// How many route-3 guard failures in a row for one app make its refusal name the override.
let routeAdviceThreshold = 3

/// The advice a refusal's meta carries once route 3's guard has failed `routeAdviceThreshold` actions in a row for an app.
func routeAdviceSentence(_ bundleIdentifier: String) -> String {
  "Route 3 could not prepare \(bundleIdentifier) for a background click on \(routeAdviceThreshold) actions in a row. If the owner accepts clicks that bring it to the front for a moment, add \"routes\": {\"\(bundleIdentifier)\": 4} to ~/.config/cua/engine.json and restart the engine."
}

/// Route 3's consecutive guard failures per app (engine-wide, by bundle id): a failure counts, any route-3 click that
/// passes its guard resets the run. Its advised list is what status reports for doctor.
final class RouteAdviceTracker: @unchecked Sendable {
  private let lock = NSLock()
  private var failures: [String: Int] = [:]

  /// Records one route-3 click's outcome for the app; answers the advice when this failure reaches the threshold or
  /// goes past it.
  func record(_ bundleIdentifier: String?, guardFailed: Bool) -> String? {
    guard let bundleIdentifier, !bundleIdentifier.isEmpty else { return nil }
    lock.lock()
    defer { lock.unlock() }
    guard guardFailed else {
      failures[bundleIdentifier] = nil
      return nil
    }
    let run = (failures[bundleIdentifier] ?? 0) + 1
    failures[bundleIdentifier] = run
    return run >= routeAdviceThreshold ? routeAdviceSentence(bundleIdentifier) : nil
  }

  /// The apps whose last `routeAdviceThreshold` route-3 clicks or more all failed their guard, sorted.
  var advised: [String] {
    lock.lock()
    defer { lock.unlock() }
    return failures.filter { $0.value >= routeAdviceThreshold }.keys.sorted()
  }
}

/// Typed text's route: 2′, unless the spike forces another (measured and delivered on the four scenes, U12).
func keyRoute(forced: InputRoute?) -> InputRoute { forced ?? .plainPost }

/// A press that is a menu key equivalent: a key with ⌘ (a modifier pressed alone is none).
func isKeyEquivalent(_ press: KeyPress) -> Bool { press.keyCode != nil && press.modifiers.contains(.command) }

/// press_key's route: 3 when the sequence holds a key equivalent and the app does not believe it has focus, since a
/// background app does not perform one (M2a.5: ⌘A in an inactive window had no effect; it computes its menu items'
/// enablement as an inactive app), else 2′; the spike's forced route wins. The activation, held (FocusHold.swift), comes
/// before the sequence's first press.
func pressKeyRoute(forced: InputRoute?, presses: [KeyPress], believesFocus: Bool) -> InputRoute {
  if let forced { return forced }
  return !believesFocus && presses.contains(where: isKeyEquivalent) ? .activation : .plainPost
}

/// The route of an element's own action or attribute write (route 1's AXPress or AXPick click, set_value, select_text,
/// perform_secondary_action): 3, the held activation then the action, when the app does not believe it has focus (an
/// Electron button's AXPress, its field's value and selection writes were ineffective in a background app by route 1
/// alone, M2b's matrix); 1 when it does, or inside a recorded menu whose span already holds the activation.
func elementActionRoute(believesFocus: Bool, insideHeldMenu: Bool) -> InputRoute {
  believesFocus || insideHeldMenu ? .action : .activation
}

/// The vendor's nested-content gate (F §5.1, FUN_1007a1b9c): whether the element the hit-test answered is a strict
/// descendant of `target`, found by walking its parents up to 300 levels. A hit on the target itself, on an ancestor,
/// on anything outside its subtree, or no hit at all keeps the action.
func landsOnStrictDescendant<Element>(_ hit: Element?, of target: Element, parent: (Element) -> Element?,
                                      same: (Element, Element) -> Bool) -> Bool {
  guard let hit, !same(hit, target) else { return false }
  var current = parent(hit)
  var level = 0
  while let element = current, level < 300 {
    if same(element, target) { return true }
    current = parent(element)
    level += 1
  }
  return false
}

/// What the hit-test at an element's point answered, relative to the element: one ancestry classification serves both
/// the gate (a strict descendant sends the click to synthesis) and the reach check of a synthesized click.
enum HitRelation: Equatable {
  case noAnswer    // no answer (a timeout, a busy app)
  case element     // the element itself
  case descendant  // inside the element
  case ancestor    // a container of the element (coarse hit-testing: the window, the app)
  case other       // something else covers the point (a list's column header, a sticky page header)

  /// Whether a synthesized click at the point is refused: only when something else is known to cover it.
  var covered: Bool { self == .other }
  /// Whether the point was not confirmed to reach the element, which proceeds but is reported (meta `pointUnconfirmed`).
  var unconfirmed: Bool { self == .noAnswer || self == .ancestor }
}

/// Classifies the hit against `target` by walking parents (each walk up to 300 levels): the hit's to find the target
/// (descendant), and only if that fails the target's to find the hit (ancestor).
func hitRelation<Element>(_ hit: Element?, to target: Element, parent: (Element) -> Element?,
                          same: (Element, Element) -> Bool) -> HitRelation {
  guard let hit else { return .noAnswer }
  if same(hit, target) { return .element }
  if landsOnStrictDescendant(hit, of: target, parent: parent, same: same) { return .descendant }
  if landsOnStrictDescendant(target, of: hit, parent: parent, same: same) { return .ancestor }
  return .other
}

/// The roles whose frame clips what of an element shows: the vendor's (FUN_10078e49c intersects the frames of the
/// ancestors FUN_10078ed70 accepts: a scroll area, a group with a page-scroll action (FUN_10078e9b8), and the window,
/// sheet, menu or popover FUN_10078eb38 names) plus AXWebArea, cua's, whose frame bounds the page's own scrolling where
/// no scroll area encloses it.
private let clippingRoles: Set<String> = ["AXScrollArea", "AXWebArea", "AXWindow", "AXSheet", "AXMenu", "AXPopover"]
/// Where the walk ends after clipping (FUN_10078eb38), and where it ends without (the application).
private let boundaryRoles: Set<String> = ["AXWindow", "AXSheet", "AXMenu", "AXPopover"]
/// A group clips when it can scroll by the page (the vendor's `hasScrollAction`, not decompiled; read as the
/// UIElementAction cases that scroll, E §5).
private let pageScrollActions: Set<String> = ["AXScrollUpByPage", "AXScrollDownByPage", "AXScrollLeftByPage", "AXScrollRightByPage"]

/// The part of an element that shows: its frame cut by the frame of every clipping ancestor up to its window, sheet,
/// menu or popover (the vendor's visible-frame walk, FUN_10078e49c). Nil when the element has no frame or nothing of it
/// shows, so a row scrolled out of its list or web content scrolled out of its page is not clicked through whatever
/// covers its content position. A clipping ancestor whose frame cannot be read leaves nothing known to show (nil, as the
/// vendor's walk answers there); an ancestor of another role without a frame does not clip. A menu-bar item, whose
/// ancestors are the menu bar and the application, keeps its whole frame. Three departures from the vendor: the point
/// is the shown part's midpoint (the vendor takes the frame's midpoint only when the region contains it, FUN_10078cbb0);
/// with no clipping ancestor at all the frame is kept (the vendor answers nil); and nothing is scrolled into view (the
/// vendor does that in prepareToInteract's positionElement, M2a's here with `scroll`).
func visibleFrame<Element>(of element: Element, frame: (Element) -> CGRect?, role: (Element) -> String?,
                           parent: (Element) -> Element?, actions: (Element) -> [String]) -> CGRect? {
  guard var visible = frame(element) else { return nil }
  var current: Element? = element
  var level = 0
  while let node = current, level <= 300 {
    let nodeRole = role(node) ?? ""
    if nodeRole == "AXApplication" { break }
    if level > 0 {
      let clips = clippingRoles.contains(nodeRole) || (nodeRole == "AXGroup" && !pageScrollActions.isDisjoint(with: actions(node)))
      if clips {
        guard let bounds = frame(node) else { return nil }
        visible = visible.intersection(bounds)
        guard !visible.isNull, visible.width >= 1, visible.height >= 1 else { return nil }
      }
    }
    if boundaryRoles.contains(nodeRole) { break }
    current = parent(node)
    level += 1
  }
  return visible
}

/// An element's clickable point: the midpoint of its visible frame, further cut by `bounds` (its own window's frame,
/// when it has one); nil when no part of at least a point on each side shows.
func clickablePoint(frame: CGRect?, visibleIn bounds: CGRect?) -> CGPoint? {
  guard let frame else { return nil }
  let visible = bounds.map { frame.intersection($0) } ?? frame
  guard !visible.isNull, visible.width >= 1, visible.height >= 1 else { return nil }
  return CGPoint(x: visible.midX, y: visible.midY)
}

/// Where route 3's activation click goes: the window's AXActivationPoint when it lies inside the window's frame, else
/// nowhere — the believed-active state then rests on the subtype-1 event alone (the second sitting's U13: Chrome's point
/// is the screen's bottom-left corner, where a click lands on its menu bar). A declared difference from the vendor,
/// which posts the click wherever the point is. Nor in `sparing`, the target of a click with another button than the
/// left (`activationSparing`): a left click there would be a click on the target the model never asked for (the M2a
/// vendor reading, item 8); the subtype-1 event alone then carries the activation, as it does outside the frame.
func activationClickPoint(_ activationPoint: CGPoint?, windowFrame: CGRect?, sparing: CGRect? = nil) -> CGPoint? {
  guard let activationPoint, let windowFrame, windowFrame.contains(activationPoint) else { return nil }
  if let sparing, sparing.contains(activationPoint) { return nil }
  return activationPoint
}

/// What a type_text does with its text (the spec's Design, "Text").
enum TextRoute: Equatable {
  case keyed             // keyed through the layout by route 2′
  case paste             // the paste route (M2a's)
  case refusedConcealed  // a concealed request that cannot be keyed reliably: nothing is entered
}

/// Keyed only under a keyboard-layout source whose reading is reliable (the per-context preference off, or the driven
/// app frontmost); otherwise the paste route, which a concealed request never takes. The spike's `spikeKeyed` keys
/// regardless, except a concealed request, which never keys under a reading it cannot trust.
func textRoute(keyboardLayout: Bool, perContextUnknown: Bool, concealed: Bool, spikeKeyed: Bool) -> TextRoute {
  let reliable = keyboardLayout && !perContextUnknown
  if concealed { return reliable ? .keyed : .refusedConcealed }
  return reliable || spikeKeyed ? .keyed : .paste
}

/// The refusal of concealed text that cannot be keyed reliably: it says nothing was entered and why, names the
/// active input source and the alternative, and never the value (the wrapper renders its own sentence for this name).
func concealedInputUnavailable(sourceID: String, perContext: Bool) -> EngineError {
  let reason = perContext
    ? "the app may hold its own input source (the per-document input source setting is on and the app is not frontmost), so the active source (\(sourceID)) says nothing reliable about it"
    : "the active input source (\(sourceID)) cannot key this text reliably"
  return EngineError(name: "concealedInputUnavailable", "Nothing was entered: \(reason). Use set_value on a settable element instead.")
}
