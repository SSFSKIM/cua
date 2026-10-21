import ApplicationServices
import Foundation

// perform_secondary_action (R/F-helper-logic.md §16.3, R/sky-behaviour.md §16; the Decision Log's M2a vendor reading,
// item 3): `action` is matched against the description of each action the element offers, the word the tree prints
// under Secondary Actions (`Increment`, not `AXIncrement`), exactly and case-sensitively, first hit, over the element's
// live actions **unfiltered** (filterActions is the renderer's, never applied here) plus the disclosure pseudo-actions
// SAIExpand and SAICollapse, which toggle AXDisclosing. The element is scrolled into view first. A page scroll first
// tries the scroll bar's page button. On a menu-bar item, AXPick with a menu records the item (MenuRecord.swift) and
// AXCancel clears the record; neither sends anything. Any other success clears the app's record. Route 1.

/// One action an element offers: its name and the description the model names it by.
struct OfferedAction: Equatable {
  let name: String
  let description: String
}

/// An action's description as FUN_1007816a0 gives it: the fixed English word, else a custom action's `Name:` text, else
/// the system's description, else the action's own name.
func describedAction(_ action: String, system: () -> String?) -> String {
  vendorActionWords[action] ?? customActionName(action) ?? system() ?? action
}

/// What the element offers now (`actions` 0x10077fc24 and `actionDescriptions` 0x10077ffbc on the refetchable element):
/// its live actions in order, then SAIExpand or SAICollapse when it is disclosable (AXDisclosing supported and settable),
/// by its current AXDisclosing.
func offeredActions(of element: AXUIElement, ax: AXOps) -> [OfferedAction] {
  var offered = ax.actions(element).map { action in OfferedAction(name: action, description: describedAction(action) { ax.describe(element, action) }) }
  if ax.isSettable(element, "AXDisclosing") {
    let name = bool(ax.read(element, "AXDisclosing")) == true ? "SAICollapse" : "SAIExpand"
    offered.append(OfferedAction(name: name, description: vendorActionWords[name]!))
  }
  return offered
}

/// The page-scroll actions and the scroll bar page button each tries first (`scrollUsingScrollBar(direction:)`
/// 0x100717ab8: an AXPress on the bar's page button). That the button is the bar's child with the standard page
/// subrole is cua's reading of it; the vendor's lookup was not decompiled.
private let pageButtons: [String: (bar: String, subrole: String)] = [
  "AXScrollUpByPage": (kAXVerticalScrollBarAttribute, kAXDecrementPageSubrole),
  "AXScrollDownByPage": (kAXVerticalScrollBarAttribute, kAXIncrementPageSubrole),
  "AXScrollLeftByPage": (kAXHorizontalScrollBarAttribute, kAXDecrementPageSubrole),
  "AXScrollRightByPage": (kAXHorizontalScrollBarAttribute, kAXIncrementPageSubrole),
]

/// Performs an offered action (`perform(action:)` 0x10077ffdc): a pseudo-action toggles AXDisclosing after re-checking
/// it is settable (a failed re-check does nothing); a page scroll presses the scroll bar's page button, and performs the
/// action only when that fails; anything else is the AX action.
func performOffered(_ action: OfferedAction, on element: AXUIElement, ax: AXOps) -> AXError {
  switch action.name {
  case "SAIExpand", "SAICollapse":
    guard ax.isSettable(element, "AXDisclosing") else { return .success }
    let open = bool(ax.read(element, "AXDisclosing")) == true
    return ax.write(element, "AXDisclosing", open ? kCFBooleanFalse : kCFBooleanTrue)
  default:
    if let page = pageButtons[action.name], let bar = ax.element(element, page.bar),
       let button = ax.children(bar).first(where: { ax.subrole($0) == page.subrole }),
       ax.perform(button, kAXPressAction) == .success {
      return .success
    }
    return ax.perform(element, action.name)
  }
}

/// The refusal of an action the element does not offer. The vendor's sentence ends with the decimal element index,
/// which only the service knows: it rewrites the sentence by this name (src/services/engine/service.mjs).
func invalidSecondaryAction(_ action: String) -> EngineError {
  EngineError(name: "invalidSecondaryAction", "\(action.prefix(256)) is not a valid secondary action for the element")
}

extension Engine {
  /// `perform_secondary_action {app, element, action}`.
  func performSecondaryAction(_ args: [String: Any], _ context: ExecutionContext) throws -> Any {
    guard let action = args["action"] as? String else { throw EngineError.invalidArguments("action is required") }
    let token = try requiredElementToken(args, context, method: "perform_secondary_action")

    var meta = InputMeta(context)
    do {
      let (app, appPid, guarding) = try inputPrologue(args, context, meta: &meta)
      let resolved = try targetElement(token, app: app, appPid: appPid, context: context)
      meta.inputRoute = .action
      let ax = AXOps.live
      let target = try positionedTarget(resolved, token: token, app: app, appPid: appPid, context: context, guarding: guarding)
      guard let chosen = offeredActions(of: target.element, ax: ax).first(where: { $0.description == action }) else {
        throw invalidSecondaryAction(action)
      }
      if target.entry.identity.role == kAXMenuBarItemRole {
        if chosen.name == kAXPickAction, menuOfMenuBarItem(target.element, ax: ax) != nil {
          context.connection.recordMenu(target.element, app: app.key)
          return ["meta": meta.wire]
        }
        if chosen.name == kAXCancelAction {
          context.connection.clearMenuRecord(app: app.key)
          return ["meta": meta.wire]
        }
      }
      try guarding.checkInFlight()
      var performed = AXError.failure
      meta.posting { performed = performOffered(chosen, on: target.element, ax: ax); return true }
      context.connection.markActed(app)
      guard performed == .success else { throw EngineError(name: "actionFailed", "The element did not accept the \(chosen.description.prefix(256)) action.") }
      context.connection.clearMenuRecord(app: app.key)
      return ["meta": meta.wire]
    } catch let error as EngineError {
      throw withMeta(error, meta)
    }
  }
}
