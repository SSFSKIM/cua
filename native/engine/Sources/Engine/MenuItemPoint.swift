import ApplicationServices
import CoreGraphics
import Foundation

// #454 (design ruling 946): a coordinate click on an item of an open menu. Every menu the measurement met (Chrome's
// `<select>`, TextEdit's font pop-up, Script Editor's language pop-up; kit `probe/454-measure`, README 4d87ff55) is a
// window of the app's own at the pop-up menu layer (101) over the point, and the click the engine posts there, stamped
// to the observed window, only closes the menu (45/45 answered ok, nothing taken): menu tracking reads the real cursor,
// which the engine never moves. The item's own action takes it (AXPick, 45/45). So once the stale-point guard has kept
// the point, and before anything is posted, a plain left click whose point the app's hit-test answers, in time
// (`pointHitSignalDeadlineMs`), as an AXMenuItem of an AXMenu outside any web page, with a window of the app's at the
// menu layer over the point, goes by route 1 as that item's AXPick (else AXPress), in every mode, when the item is the
// one the observation recorded there (`recordedMenuItem`), still reading the recorded title, and reads enabled.
// Otherwise it is refused (`appWindowOverPoint`, with the menu's sentence and the ways through: the element click, the
// keys), as is a record that names an item there while the hit names none. No pointer event is posted on either
// branch. A hit-test that answered nothing or answered late keeps main's path (#452's rule: no signal), as does a menu
// with no window of its own or inside a web page (an ARIA menu, which a posted click takes). The action's return is not
// the effect: the click succeeds only once the menu's window has left the screen (or the item's handle has died) and
// the control the menu belongs to, identified before the action, has moved its selection to the item's title
// (`deliverMenuItem`); otherwise it answers `clickUnconfirmed`. Everything reads through closures, so the rule is
// unit-tested over fakes.

/// NSPopUpMenuWindowLevel (kCGPopUpMenuWindowLevel): the layer of every menu window the measurement listed.
let menuWindowLayer = 101
/// The wait for the item's effect after its action: read at once, then every 20 ms for up to 1 s (the Show Menu's wait,
/// MenuConfirm.swift).
let menuItemSettleMs: Double = 1000
let menuItemSampleMs: Double = 20
/// The controls whose value shows the item their menu took: a pop-up button (AppKit's, the AXMenu's parent) and Chrome's
/// `<select>`, a pop-up button or combo box that has the app's focus as its parentless menu is open.
let menuOpenerRoles: Set<String> = ["AXPopUpButton", "AXComboBox"]

/// The reads #454 makes (the unit tests' seams; `.live` over the Accessibility API).
struct MenuItemReads<Element> {
  var role: (Element) -> String?
  var parent: (Element) -> Element?
  /// AXEnabled; nil when it does not read.
  var enabled: (Element) -> Bool?
  /// The advertised actions; nil when the read failed.
  var actions: (Element) -> [String]?
  var title: (Element) -> String?
  /// AXValue as text.
  var value: (Element) -> String?
  /// The application's focused element.
  var focused: () -> Element?
  /// Whether the handle names a destroyed element.
  var gone: (Element) -> Bool
  var same: (Element, Element) -> Bool
}

extension MenuItemReads where Element == AXUIElement {
  static func live(appPid: pid_t) -> MenuItemReads<AXUIElement> {
    MenuItemReads(role: { attribute($0, kAXRoleAttribute) as? String }, parent: { elementAttribute($0, kAXParentAttribute) },
                  enabled: { (attribute($0, kAXEnabledAttribute) as? NSNumber)?.boolValue },
                  actions: { establishedActionNames(of: $0) },
                  title: { attribute($0, kAXTitleAttribute) as? String }, value: { attribute($0, kAXValueAttribute) as? String },
                  focused: { elementAttribute(prepare(AXUIElementCreateApplication(appPid)), kAXFocusedUIElementAttribute) },
                  gone: { copyAttribute($0, kAXRoleAttribute).error == .invalidUIElement }, same: { CFEqual($0, $1) })
  }
}

/// Why a click on a menu's item was refused (the meta's `menuItemClick.refused`).
enum MenuItemRefusal: String, Equatable {
  /// The hit-test answers an item the observation did not record at the point (another, or none).
  case notRecorded
  /// The observation recorded an item at the point, and the hit-test answers no item of an open menu there.
  case notHit
  /// The recorded item, its handle the same, reads another title than the observation recorded (a dynamic menu that
  /// reused the item for another command).
  case relabelled
  /// The item reads disabled, or its AXEnabled does not read.
  case disabled
  /// The item advertises neither AXPick nor AXPress, or its actions do not read.
  case noAction
}

/// The item a click is delivered to: the item, its menu, the action, and the menu's window, which must leave the screen.
struct MenuItemTarget<Element> {
  let item: Element
  let menu: Element
  let action: String
  let window: CGWindowID
}

/// #454's decision at a kept coordinate click's point.
enum MenuItemPoint<Element> {
  /// No menu item at the point by either signal, no signal, or no menu window over the point: main's path.
  case notMenu
  case deliver(MenuItemTarget<Element>)
  /// Refused; the menu window over the point.
  case refuse(MenuItemRefusal, window: CGWindowID)
}

/// The menu item the observation recorded at a point: its handle as the guard found it, and the title recorded with it,
/// which the live item must still read (the review of fdd285dd..32787ce3, item 5).
struct RecordedMenuItem<Element> {
  let element: Element
  let title: String?
}

/// The menu item the observation recorded at the point, as the guard found it: the recorded node itself (its handle as
/// found now), else its nearest recorded AXMenuItem ancestor, else #433's recorded control beneath it (Chrome's menu,
/// which the walk hangs under the window's groups, so the deepest node at the point is the page's group under the menu:
/// `underlyingRole: AXMenuItem`). Nil when the record names none there.
func recordedMenuItem<Element>(_ verdict: StalePointVerdict<Element>) -> RecordedMenuItem<Element>? {
  if let node = verdict.node {
    if node.role == kAXMenuItemRole { return RecordedMenuItem(element: verdict.current ?? node.element, title: node.title) }
    var index = node.ancestor
    var levels = 0
    while let at = index, at < verdict.nodes.count, levels < stalePointAncestorLevels {
      let ancestor = verdict.nodes[at]
      if ancestor.role == kAXMenuItemRole { return RecordedMenuItem(element: ancestor.element, title: ancestor.title) }
      (index, levels) = (ancestor.ancestor, levels + 1)
    }
  }
  if let control = verdict.underlying, control.role == kAXMenuItemRole { return RecordedMenuItem(element: control.element, title: control.title) }
  return nil
}

/// #454's menu window over a point: the frontmost window of the app's (`pids`, the app's and the hit's process) at the
/// pop-up menu layer that holds the point and shows something (alpha above 0), in front of the observed window (`target`)
/// when the list (front to back) holds it.
func menuWindowOverPoint(_ point: CGPoint, target: CGWindowID?, pids: Set<pid_t>, list: [ListedWindow]) -> ListedWindow? {
  for window in list {
    if let target, window.number == target { return nil }
    if pids.contains(window.owner), window.layer == menuWindowLayer, window.alpha > 0, window.bounds.contains(point) { return window }
  }
  return nil
}

/// Whether `element` lies in a web page (an AXWebArea among its parents, up to its window or application): a page's
/// ARIA menu, drawn in the page, which a posted click takes, whatever window of the app's lies over it (the review of
/// fdd285dd..32787ce3, item 6: a click-through panel at the menu layer over such a menu).
func inWebArea<Element>(_ element: Element, reads: MenuItemReads<Element>) -> Bool {
  var current = reads.parent(element)
  var levels = 0
  while let at = current, levels < stalePointAncestorLevels {
    switch reads.role(at) {
    case "AXWebArea": return true
    case kAXWindowRole, kAXApplicationRole: return false
    default: (current, levels) = (reads.parent(at), levels + 1)
    }
  }
  return false
}

/// Titles agree when both are absent (nil or empty) or equal.
private func sameMenuTitle(_ a: String?, _ b: String?) -> Bool {
  (a.flatMap { $0.isEmpty ? nil : $0 }) == (b.flatMap { $0.isEmpty ? nil : $0 })
}

/// #454's decision (design ruling 946): `hit` is what the app's hit-test answered at the point whatever window its chain
/// reads to (`WindowHit.answered` of the hit-test the guard judged; nil when it answered nothing or late, which keeps
/// main's path), `recorded` the item the observation recorded there (`recordedMenuItem`). The menu window (`menuWindow`,
/// the window list) is read only when one of them names a menu item outside a web page, so no other click reads it.
func menuItemPoint<Element>(hit: Element?, recorded: RecordedMenuItem<Element>?, reads: MenuItemReads<Element>,
                            menuWindow: () -> CGWindowID?) -> MenuItemPoint<Element> {
  guard let hit else { return .notMenu }
  let menu = reads.role(hit) == kAXMenuItemRole ? reads.parent(hit).flatMap { reads.role($0) == kAXMenuRole ? $0 : nil } : nil
  if let menu {
    if inWebArea(menu, reads: reads) { return .notMenu }
  } else {
    guard let recorded, !inWebArea(recorded.element, reads: reads) else { return .notMenu }
  }
  guard let window = menuWindow() else { return .notMenu }
  guard let menu else { return .refuse(.notHit, window: window) }
  guard let recorded, reads.same(recorded.element, hit) else { return .refuse(.notRecorded, window: window) }
  guard sameMenuTitle(recorded.title, reads.title(hit)) else { return .refuse(.relabelled, window: window) }
  guard reads.enabled(hit) == true else { return .refuse(.disabled, window: window) }
  guard let action = reads.actions(hit).flatMap({ actions in ["AXPick", "AXPress"].first(where: actions.contains) }) else {
    return .refuse(.noAction, window: window)
  }
  return .deliver(MenuItemTarget(item: hit, menu: menu, action: action, window: window))
}

/// What the control the menu belongs to shows after the action against before it: moved to the item's title (`taken`),
/// the item's title as before or before unread (`unchanged`: no evidence the action moved it), another (`other`), or
/// nothing to compare (`unread`: no control identified before the action, no title, no selection read).
enum MenuItemValue: String, Equatable { case taken, unchanged, other, unread }

/// The meta's `menuItemClick` (#454, value-free): how the click was carried (`delivery: "action"` and the action, "the
/// click delivered as the menu item's AXPick", set once the action is dispatched), or why it was refused; the menu's
/// window; the action's AXError when it was not success; and after the action whether the menu closed (null when the
/// window list did not read), what its control shows, the reads and the milliseconds from the action's return to the last.
struct MenuItemClickRecord: Equatable {
  var action: String?
  var refused: MenuItemRefusal?
  let menuWindow: CGWindowID
  var actionError: Int32?
  var closed: Bool?
  var closedRead = false
  var value: MenuItemValue?
  var polls = 0
  var ms: Double?
  var confirmed: Bool { closed == true && value == .taken }

  var wire: [String: Any] {
    var wire: [String: Any] = ["menuWindow": Int(menuWindow)]
    if let refused { wire["refused"] = refused.rawValue }
    if let action {
      wire["delivery"] = "action"
      wire["action"] = action
      wire["effect"] = confirmed ? "confirmed" : "unconfirmed"
    }
    if let actionError { wire["actionError"] = Int(actionError) }
    if closedRead { wire["menuClosed"] = closed.map { $0 as Any } ?? NSNull() }
    if let value { wire["value"] = value.rawValue }
    if polls > 0 { wire["polls"] = polls }
    if let ms { wire["ms"] = (ms * 1000).rounded() / 1000 }
    return wire
  }
}

/// The AXErrors after which the action may still have taken effect: a messaging timeout (`cannotComplete`), as an app in
/// menu tracking can answer while it closes the menu on the item. The effect is read after them; any other error is a
/// definite refusal of the action (`actionFailed`).
let menuItemAmbiguousErrors: Set<AXError> = [.cannotComplete]

/// The item's action (`beforeDispatch`'s checks, then `perform`, which answers the action's AXError; the record's action
/// set between them), then its effect read (design ruling 946, condition
/// 2; the review of fdd285dd..32787ce3, items 2, 3 and 7): the menu's window gone from the screen (`menuWindowShown`, nil
/// when the list did not read: unknown, never closed) or the item's handle dead, and the control the menu belongs to,
/// identified before the action (the AXMenu's parent of a `menuOpenerRoles` role; for a menu with no parent, Chrome's
/// `<select>`, the app's focused element of such a role; a menu whose parent is anything else has none), showing the
/// item's title where it showed another before. A control's selection is its AXValue, its AXTitle only where it has no
/// value, so a static label never stands in for the value. Read at once and every `menuItemSampleMs` for up to
/// `menuItemSettleMs`; seen, it answers; otherwise `clickUnconfirmed`.
func deliverMenuItem<Element>(_ target: MenuItemTarget<Element>, app: String, reads: MenuItemReads<Element>,
                              menuWindowShown: (CGWindowID) -> Bool?, now: () -> Double, sleep: (Double) -> Void,
                              beforeDispatch: () throws -> Void = {}, perform: (String) -> AXError,
                              record: inout MenuItemClickRecord) throws {
  func opener(_ element: Element?) -> Element? {
    element.flatMap { reads.role($0).map(menuOpenerRoles.contains) == true ? $0 : nil }
  }
  func selection(_ control: Element) -> String? { reads.value(control) ?? reads.title(control) }
  let title = reads.title(target.item).flatMap { $0.isEmpty ? nil : $0 }
  let parent = reads.parent(target.menu)
  let control = parent != nil ? opener(parent) : opener(reads.focused())
  let before = control.flatMap(selection)
  try beforeDispatch()
  record.action = target.action
  let error = perform(target.action)
  if error != .success {
    record.actionError = error.rawValue
    guard menuItemAmbiguousErrors.contains(error) else {
      throw EngineError(name: "actionFailed", "The element did not accept the \(target.action) action.")
    }
  }
  let started = now()
  func valueNow() -> MenuItemValue {
    guard let title, let control, let after = selection(control) else { return .unread }
    guard after == title else { return .other }
    return before == nil || before == title ? .unchanged : .taken
  }
  record.closedRead = true
  while true {
    record.polls += 1
    record.closed = reads.gone(target.item) ? true : menuWindowShown(target.window).map { !$0 }
    record.value = valueNow()
    let ms = now() - started
    record.ms = ms
    if record.confirmed { return }
    if ms >= menuItemSettleMs { break }
    sleep(min(menuItemSampleMs, menuItemSettleMs - ms))
  }
  throw menuItemUnconfirmed(app: app, action: target.action, closed: record.closed == true)
}

/// #454's step in a coordinate click, after the stale-point guard kept the point and before anything is posted: the
/// decision carried out. True when it carried the click (its action performed and its effect confirmed; an unconfirmed
/// one throws), so the caller posts nothing; a refusal throws with nothing performed or posted; false leaves the click to
/// main's path. Before the action, `prepareOwner` refuses a forbidden process serving the item and registers it as one
/// the action drives (the review's item 1: the item can be served by another process than main's bounded hit), then
/// `checkInFlight` (the intervention guard's in-flight check) and `announce` (the agent cursor's click) run; the meta's
/// delivery is set as the action is dispatched.
func menuItemClick<Element>(_ decision: MenuItemPoint<Element>, app: String, reads: MenuItemReads<Element>,
                            menuWindowShown: (CGWindowID) -> Bool?, now: () -> Double, sleep: (Double) -> Void,
                            prepareOwner: (Element) throws -> Void, checkInFlight: () throws -> Void, announce: () -> Void = {},
                            perform: (Element, String) -> AXError, meta: inout InputMeta) throws -> Bool {
  switch decision {
  case .notMenu: return false
  case .refuse(let why, let window):
    meta.inputRoute = .action
    meta.menuItemClick = MenuItemClickRecord(refused: why, menuWindow: window)
    throw menuItemRefused(app: app, why)
  case .deliver(let target):
    meta.inputRoute = .action
    var record = MenuItemClickRecord(menuWindow: target.window)
    defer { meta.menuItemClick = record }
    try deliverMenuItem(target, app: app, reads: reads, menuWindowShown: menuWindowShown, now: now, sleep: sleep, beforeDispatch: {
      try prepareOwner(target.item)
      try checkInFlight()
      announce()
    }, perform: { action in
      var error = AXError.failure
      meta.posting { error = perform(target.item, action); return true }
      return error
    }, record: &record)
    return true
  }
}

/// #454's refusal (design ruling 946, condition 3): the app's own menu window lies over the point, which a pointer
/// click does not take an item of, and the item's own action cannot stand in for it. The name is #452's, a window of the
/// app's over the observed one; the sentence names the menu and the ways through. Nothing was posted.
func menuItemRefused(app: String, _ why: MenuItemRefusal) -> EngineError {
  let cause: String
  switch why {
  case .notRecorded: cause = "the item there is not the one the screenshot showed at this point"
  case .notHit: cause = "the item the screenshot showed there is not what the point reaches now"
  case .relabelled: cause = "the item there no longer reads what the screenshot showed"
  case .disabled: cause = "the item there is disabled"
  case .noAction: cause = "the item there takes no action"
  }
  return EngineError(name: "appWindowOverPoint",
    "\(app) has a menu open at this point, which a click takes only as its item's own action, but \(cause). Nothing was sent. Use keys instead (the arrow keys to the item, then Return; Escape closes the menu), or call getAXState() and click the menu item it lists, by its element.")
}

/// #454's unconfirmed answer: the item's action was performed, but its effect was not seen within the settle.
func menuItemUnconfirmed(app: String, action: String, closed: Bool) -> EngineError {
  let seen = closed ? "the menu closed, but nothing cua can read shows the item taken" : "the menu was not seen to close with the item taken"
  return EngineError(name: "clickUnconfirmed",
    "The click could not be confirmed: it was carried by the menu item's \(action) action in \(app), since a pointer click does not take a menu's item, and \(seen). Observe the app with get_app_state before any retry, and never retry blindly.")
}
