import ApplicationServices
import CoreGraphics
import Foundation

// The input routes as M1a rules them (the spec's Design, "Input" after the second sitting, "Keys" and "Text";
// Interfaces, InputRoute): key presses and typed text by route 2′, the plain post with no fake activation; clicks by
// the ladder 1 → 3: route 1, the element's own action, for a plain single left click on an element that advertises
// AXPick or AXPress and whose clickable point does not land on a strict descendant of it, and route 3, the fake
// activation then the plain post, for every synthesized click (an element without the action, any other button or
// count, every coordinate click). A click on a menu-bar item is refused: the vendor neither presses nor synthesizes one
// but activates the app and records the item's menu for the next observation (FUN_100083904's role test), a path built
// with that observation later. Route 2, the ⌘ post, and a forced 2′ click are reachable only through the
// spike's `spikeRoute`. Route 4 is M2a's. Everything here is pure, so the choice is unit-tested.

/// How an element click is carried.
enum ElementClickPlan: Equatable {
  case action(String)           // route 1, with the action to perform
  case synthesized(InputRoute)  // route 3 by default; 2 or 2′ only when forced
}

/// The clicks' ladder for an element (F §5.1 for the action's choice and the gate). `landsOnDescendant` answers whether
/// the hit-test at the element's clickable point lands on a strict descendant of it (the gate); it is called only for a
/// click route 1 could otherwise carry, and answers false when there is no point to hit-test. A menu-bar item is refused
/// whatever the click or route, before anything is posted. A forced route (the spike's) skips the gate; a forced route 1
/// needs an advertised action.
func elementClickPlan(forced: InputRoute?, button: MouseButton, count: Int, role: String, actions: [String],
                      landsOnDescendant: () -> Bool) throws -> ElementClickPlan {
  if role == "AXMenuBarItem" { throw menuBarItemUnsupported }
  let advertised = actions.first(where: { $0 == "AXPick" }) ?? actions.first(where: { $0 == "AXPress" })
  if let forced {
    guard forced == .action else { return .synthesized(forced) }
    guard let advertised else {
      throw EngineError.invalidArguments("spikeRoute 1 cannot carry this click: the element advertises neither AXPick nor AXPress")
    }
    return .action(advertised)
  }
  if button == .left, count == 1, let advertised, !landsOnDescendant() { return .action(advertised) }
  return .synthesized(.activation)
}

/// The refusal of a click on a menu-bar item: the vendor opens a menu-bar item by activating the app and recording the
/// item's menu for the next observation (FUN_100071538 → FUN_100083904 → FUN_100071790), which this engine does not do
/// yet; pressing or synthesizing would open it a way the vendor never does. Nothing is posted.
let menuBarItemUnsupported = EngineError(name: "menuBarItemUnsupported",
  "Clicking a menu bar item is not supported by this engine yet; menu bar items open through a path that comes in a later engine release. Nothing was clicked. Use the app's keyboard shortcut for the command with pressKey instead.")

/// A coordinate click's route: 3, unless the spike forces another.
func coordinateClickRoute(forced: InputRoute?) -> InputRoute { forced ?? .activation }

/// A key press's or typed text's route: 2′, unless the spike forces another.
func keyRoute(forced: InputRoute?) -> InputRoute { forced ?? .plainPost }

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
/// which posts the click wherever the point is.
func activationClickPoint(_ activationPoint: CGPoint?, windowFrame: CGRect?) -> CGPoint? {
  guard let activationPoint, let windowFrame, windowFrame.contains(activationPoint) else { return nil }
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
