import ApplicationServices
import CoreGraphics
import Foundation

// The input routes as M1a rules them (the spec's Design, "Input" after the second sitting, "Keys" and "Text";
// Interfaces, InputRoute): key presses and typed text by route 2′, the plain post with no fake activation; clicks by
// the ladder 1 → 3: route 1, the element's own action, for a plain single left click on an element that advertises
// AXPick or AXPress and whose clickable point does not land on a strict descendant of it, and route 3, the fake
// activation then the plain post, for every synthesized click (an element without the action, any other button or
// count, a menu-bar item, every coordinate click). Route 2, the ⌘ post, and a forced 2′ click are reachable only
// through the spike's `spikeRoute`. Route 4 is M2a's. Everything here is pure, so the choice is unit-tested.

/// How an element click is carried.
enum ElementClickPlan: Equatable {
  case action(String)           // route 1, with the action to perform
  case synthesized(InputRoute)  // route 3 by default; 2 or 2′ only when forced
}

/// The clicks' ladder for an element (F §5.1 for the action's choice and the gate). `landsOnDescendant` hit-tests the
/// element's clickable point and is called only for a click route 1 could otherwise carry. A forced route (the spike's)
/// skips the gate; a forced route 1 needs an advertised action.
func elementClickPlan(forced: InputRoute?, button: MouseButton, count: Int, role: String, actions: [String],
                      landsOnDescendant: () -> Bool) throws -> ElementClickPlan {
  let advertised = actions.first(where: { $0 == "AXPick" }) ?? actions.first(where: { $0 == "AXPress" })
  if let forced {
    guard forced == .action else { return .synthesized(forced) }
    guard let advertised else {
      throw EngineError.invalidArguments("spikeRoute 1 cannot carry this click: the element advertises neither AXPick nor AXPress")
    }
    return .action(advertised)
  }
  if button == .left, count == 1, role != "AXMenuBarItem", let advertised, !landsOnDescendant() { return .action(advertised) }
  return .synthesized(.activation)
}

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

/// An element's clickable point: the midpoint of the part of its frame inside `bounds` (its window's frame), nil when
/// no part of at least a point on each side shows. Scrolling the element into view first is not done here (M2a, with
/// `scroll`); an element wholly outside its window is refused as not visible.
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
