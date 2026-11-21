import ApplicationServices
import CoreGraphics
import Foundation

// #454 (design ruling 946): a coordinate click on an item of an open menu. Every menu the measurement met (Chrome's
// `<select>`, TextEdit's font pop-up, Script Editor's language pop-up; kit `probe/454-measure`, README 4d87ff55) is a
// window of the app's own at the pop-up menu layer (101) over the point, and the click the engine posts there, stamped
// to the observed window, only closes the menu (45/45 answered ok, nothing taken): menu tracking reads the real cursor,
// which the engine never moves. The item's own action takes it (AXPick, 45/45). So once the stale-point guard has kept
// the point, and before anything is posted, a plain left click whose point the app's hit-test answers, in time
// (`pointHitSignalDeadlineMs`), as an AXMenuItem of an AXMenu, with a window of the app's at the menu layer over the
// point, goes by route 1 as that item's AXPick (else AXPress), in every mode, when the item is the one the observation
// recorded there (`recordedMenuItem`) and reads enabled. Otherwise it is refused (`appWindowOverPoint`, with the menu's
// sentence and the ways through: the element click, the keys), as is a record that names an item there while the hit
// names none. No pointer event is posted on either branch. A hit-test that answered nothing or answered late keeps
// main's path (#452's rule: no signal), as does a menu with no window of its own (a web page's ARIA menu, which a posted
// click takes). The action's return is not the effect: the click succeeds only once the menu's window has left the
// screen (or the item's handle has died) and the control the menu belongs to reads the item's title (`menuItemTaken`);
// otherwise it answers `clickUnconfirmed`. Everything reads through closures, so the rule is unit-tested over fakes.

/// NSPopUpMenuWindowLevel (kCGPopUpMenuWindowLevel): the layer of every menu window the measurement listed.
let menuWindowLayer = 101
/// The wait for the item's effect after its action: read at once, then every 20 ms for up to 1 s (the Show Menu's wait,
/// MenuConfirm.swift).
let menuItemSettleMs: Double = 1000
let menuItemSampleMs: Double = 20
/// The controls whose value shows the item their menu took: a pop-up button (AppKit's, the AXMenu's parent) and Chrome's
/// `<select>`, a pop-up button or combo box the app's focus returns to.
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

/// The menu item the observation recorded at the point, as the guard found it: the recorded node itself (its handle as
/// found now), else its nearest recorded AXMenuItem ancestor, else #433's recorded control beneath it (Chrome's menu,
/// which the walk hangs under the window's groups, so the deepest node at the point is the page's group under the menu:
/// `underlyingRole: AXMenuItem`). Nil when the record names none there.
func recordedMenuItem<Element>(_ verdict: StalePointVerdict<Element>) -> Element? {
  if let node = verdict.node {
    if node.role == kAXMenuItemRole { return verdict.current ?? node.element }
    var index = node.ancestor
    var levels = 0
    while let at = index, at < verdict.nodes.count, levels < stalePointAncestorLevels {
      if verdict.nodes[at].role == kAXMenuItemRole { return verdict.nodes[at].element }
      (index, levels) = (verdict.nodes[at].ancestor, levels + 1)
    }
  }
  if let control = verdict.underlying, control.role == kAXMenuItemRole { return control.element }
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

/// #454's decision (design ruling 946): `hit` is what the app's hit-test answered at the point whatever window its chain
/// reads to (`WindowHit.answered`; nil when it answered nothing or late, which keeps main's path), `recorded` the item the
/// observation recorded there (`recordedMenuItem`). The menu window (`menuWindow`, the window list) is read only when one
/// of them names a menu item, so no other click reads it.
func menuItemPoint<Element>(hit: Element?, recorded: Element?, reads: MenuItemReads<Element>,
                            menuWindow: () -> CGWindowID?) -> MenuItemPoint<Element> {
  guard let hit else { return .notMenu }
  let menu = reads.role(hit) == kAXMenuItemRole ? reads.parent(hit).flatMap { reads.role($0) == kAXMenuRole ? $0 : nil } : nil
  guard menu != nil || recorded != nil else { return .notMenu }
  guard let window = menuWindow() else { return .notMenu }
  guard let menu else { return .refuse(.notHit, window: window) }
  guard let recorded, reads.same(recorded, hit) else { return .refuse(.notRecorded, window: window) }
  guard reads.enabled(hit) == true else { return .refuse(.disabled, window: window) }
  guard let action = reads.actions(hit).flatMap({ actions in ["AXPick", "AXPress"].first(where: actions.contains) }) else {
    return .refuse(.noAction, window: window)
  }
  return .deliver(MenuItemTarget(item: hit, menu: menu, action: action, window: window))
}

/// What the control the menu belongs to reads after the action: the item's title (`taken`), another (`other`), or nothing
/// to compare (`unread`: no such control, no title, no value).
enum MenuItemValue: String, Equatable { case taken, other, unread }

/// The meta's `menuItemClick` (#454, value-free): how the click was carried (`delivery: "action"` and the action, "the
/// click delivered as the menu item's AXPick"), or why it was refused; the menu's window; and after the action whether
/// the menu closed, what its control reads, the reads and the milliseconds from the action's return to the last.
struct MenuItemClickRecord: Equatable {
  var action: String?
  var refused: MenuItemRefusal?
  let menuWindow: CGWindowID
  var closed: Bool?
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
    if let closed { wire["menuClosed"] = closed }
    if let value { wire["value"] = value.rawValue }
    if polls > 0 { wire["polls"] = polls }
    if let ms { wire["ms"] = (ms * 1000).rounded() / 1000 }
    return wire
  }
}

/// The item's action (`perform`), then its effect read (design ruling 946, condition 2): the menu's window gone from the
/// screen (`menuWindowShown`) or the item's handle dead, and the control the menu belongs to (the AXMenu's parent of a
/// `menuOpenerRoles` role, read before the action; else the app's focused element of one, read each time: Chrome's
/// `<select>`, whose menu has no parent) reading the item's title as its value or title. Read at once and every
/// `menuItemSampleMs` for up to `menuItemSettleMs`; seen, it answers; otherwise `clickUnconfirmed`.
func deliverMenuItem<Element>(_ target: MenuItemTarget<Element>, app: String, reads: MenuItemReads<Element>,
                              menuWindowShown: (CGWindowID) -> Bool, now: () -> Double, sleep: (Double) -> Void,
                              perform: (String) throws -> Void, record: inout MenuItemClickRecord) throws {
  func opener(_ element: Element?) -> Element? {
    element.flatMap { reads.role($0).map(menuOpenerRoles.contains) == true ? $0 : nil }
  }
  let title = reads.title(target.item).flatMap { $0.isEmpty ? nil : $0 }
  let parentControl = opener(reads.parent(target.menu))
  try perform(target.action)
  let started = now()
  func valueNow() -> MenuItemValue {
    guard let title, let control = parentControl ?? opener(reads.focused()) else { return .unread }
    let shown = [reads.value(control), reads.title(control)].compactMap { $0 }
    guard !shown.isEmpty else { return .unread }
    return shown.contains(title) ? .taken : .other
  }
  while true {
    record.polls += 1
    record.closed = !menuWindowShown(target.window) || reads.gone(target.item)
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
/// main's path. `checkInFlight` is the intervention guard's in-flight check, `announce` the agent cursor's click.
func menuItemClick<Element>(_ decision: MenuItemPoint<Element>, app: String, reads: MenuItemReads<Element>,
                            menuWindowShown: (CGWindowID) -> Bool, now: () -> Double, sleep: (Double) -> Void,
                            checkInFlight: () throws -> Void, announce: () -> Void = {},
                            perform: (Element, String) -> AXError, meta: inout InputMeta) throws -> Bool {
  switch decision {
  case .notMenu: return false
  case .refuse(let why, let window):
    meta.inputRoute = .action
    meta.menuItemClick = MenuItemClickRecord(refused: why, menuWindow: window)
    throw menuItemRefused(app: app, why)
  case .deliver(let target):
    var record = MenuItemClickRecord(action: target.action, menuWindow: target.window)
    defer { meta.menuItemClick = record }
    try deliverMenuItem(target, app: app, reads: reads, menuWindowShown: menuWindowShown, now: now, sleep: sleep, perform: { action in
      try checkInFlight()
      announce()
      try deliverAction(action, route: .action, perform: { perform(target.item, $0) }, meta: &meta)
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
  case .disabled: cause = "the item there is disabled"
  case .noAction: cause = "the item there takes no action"
  }
  return EngineError(name: "appWindowOverPoint",
    "\(app) has a menu open at this point, which a click takes only as its item's own action, but \(cause). Nothing was sent. Use keys instead (the arrow keys to the item, then Return; Escape closes the menu), or call getScreenshot for a new screenshot and click the menu item its tree lists, by its element.")
}

/// #454's unconfirmed answer: the item's action was performed, but its effect was not seen within the settle.
func menuItemUnconfirmed(app: String, action: String, closed: Bool) -> EngineError {
  let seen = closed ? "the menu closed, but nothing cua can read shows the item taken" : "the menu was not seen to close with the item taken"
  return EngineError(name: "clickUnconfirmed",
    "The click could not be confirmed: it was carried by the menu item's \(action) action in \(app), since a pointer click does not take a menu's item, and \(seen). Observe the app with get_app_state before any retry, and never retry blindly.")
}
