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
/// The most recorded controls a parentless menu's control is looked for among; with more, the search answers unknown.
let menuOpenerCandidateLimit = 32

/// The reads #454 makes (the unit tests' seams; `.live` over the Accessibility API).
struct MenuItemReads<Element> {
  var role: (Element) -> String?
  var parent: (Element) -> Element?
  /// AXEnabled; nil when it does not read.
  var enabled: (Element) -> Bool?
  /// The advertised actions; nil when the read failed.
  var actions: (Element) -> [String]?
  /// AXTitle and AXValue as text, a read that failed told from an absent attribute (the re-review of
  /// 32787ce3..3eb2b806, item 1).
  var title: (Element) -> MenuTextRead
  var value: (Element) -> MenuTextRead
  /// The application's focused element.
  var focused: () -> Element?
  /// AXChildren; nil when the read failed.
  var children: (Element) -> [Element]? = { _ in nil }
  /// Whether the handle names a destroyed element.
  var gone: (Element) -> Bool
  var same: (Element, Element) -> Bool
}

extension MenuItemReads where Element == AXUIElement {
  static func live(appPid: pid_t) -> MenuItemReads<AXUIElement> {
    MenuItemReads(role: { attribute($0, kAXRoleAttribute) as? String }, parent: { elementAttribute($0, kAXParentAttribute) },
                  enabled: { (attribute($0, kAXEnabledAttribute) as? NSNumber)?.boolValue },
                  actions: { establishedActionNames(of: $0) },
                  title: { menuTextRead(copyAttribute($0, kAXTitleAttribute)) }, value: { menuTextRead(copyAttribute($0, kAXValueAttribute)) },
                  focused: { elementAttribute(prepare(AXUIElementCreateApplication(appPid)), kAXFocusedUIElementAttribute) },
                  children: childrenRead,
                  gone: { copyAttribute($0, kAXRoleAttribute).error == .invalidUIElement }, same: { CFEqual($0, $1) })
  }
}

/// A text attribute as read: its text (a string, or an attributed string's text, unbounded), absent (the element has
/// no such attribute or no value), or failed (any other error, or a value that is not text): a failed read gives no
/// evidence either way.
enum MenuTextRead: Equatable {
  case text(String)
  case absent
  case failed

  var text: String? { if case .text(let text) = self { return text } else { return nil } }
}

func menuTextRead(_ read: (value: CFTypeRef?, error: AXError)) -> MenuTextRead {
  switch read.error {
  case .success:
    guard let value = read.value else { return .absent }
    let type = CFGetTypeID(value)
    if type == CFStringGetTypeID() { return .text(value as! String) }
    if type == CFAttributedStringGetTypeID() { return .text((value as! NSAttributedString).string) }
    return .failed
  case .noValue, .attributeUnsupported: return .absent
  default: return .failed
  }
}

/// Why a click on a menu's item was refused (the meta's `menuItemClick.refused`).
enum MenuItemRefusal: String, Equatable {
  /// The hit-test answers an item the observation did not record at the point (another, or none).
  case notRecorded
  /// The observation recorded an item at the point, and the hit-test answers no item of an open menu there.
  case notHit
  /// The hit-test answers an item of an open menu, and the observation recorded no menu item at the point at all (a
  /// menu-bar menu, a submenu, a menu opened since; #454's qualification; or the walk's limits).
  case unobserved
  /// The recorded item, its handle the same, reads another title than the observation recorded (a dynamic menu that
  /// reused the item for another command).
  case relabelled
  /// The item reads disabled, or its AXEnabled does not read.
  case disabled
  /// The item advertises neither AXPick nor AXPress, or its actions do not read.
  case noAction
}

/// The item a click is delivered to: the item, its menu, the action, the menu's window, which must leave the screen,
/// and the item's title as the decision verified it against the record (nil: none), which it must still read just
/// before the action and which its control's selection must move to.
struct MenuItemTarget<Element> {
  let item: Element
  let menu: Element
  let action: String
  let window: CGWindowID
  var title: String? = nil
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

/// The menu items the observation recorded at a point: the one identified (`identified`), and every recorded AXMenuItem
/// whose shown frame holds the point in the screenshot's space (`holding`). The identified one is `recordedMenuItem`'s
/// when it names one; only when it names none (a node of another role won the stale-point check), the one recorded item
/// holding the point, if exactly one does (#454's qualification, run 44860009214, `select-same`: Chrome's
/// already-selected option over the page's own AXPopUpButton, which is deeper in the walk and acts, so neither the node
/// nor #433's control beneath it is the item). Two holding it (a shared edge, rows shifted since) identify none (the
/// review of c83ed846..74c99b92, item 1).
struct RecordedMenuItems<Element> {
  var identified: RecordedMenuItem<Element>?
  var holding: [RecordedMenuItem<Element>] = []
}

func recordedMenuItems<Element>(_ verdict: StalePointVerdict<Element>) -> RecordedMenuItems<Element> {
  var found = RecordedMenuItems(identified: recordedMenuItem(verdict))
  guard let point = verdict.point else { return found }
  let shown = CGPoint(x: point.x - verdict.windowShift.dx, y: point.y - verdict.windowShift.dy)
  found.holding = verdict.nodes.filter { $0.role == kAXMenuItemRole && $0.shown.map { holdsPoint($0, shown) } == true }
    .map { RecordedMenuItem(element: $0.element, title: $0.title) }
  if found.identified == nil, found.holding.count == 1 { found.identified = found.holding[0] }
  return found
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

/// A recorded title and one read now agree when both are absent (nil, empty, or an absent attribute) or equal once the
/// live one is cut as the observation cuts what it records (`bounded`, Fetch.swift); a failed read never agrees.
func sameMenuTitle(recorded: String?, live: MenuTextRead) -> Bool {
  let recorded = recorded.flatMap { $0.isEmpty ? nil : $0 }
  switch live {
  case .failed: return false
  case .absent: return recorded == nil
  case .text(let text): return (text.isEmpty ? nil : bounded(text)) == recorded
  }
}

/// #454's decision (design ruling 946): `hit` is what the app's hit-test answered at the point whatever window its chain
/// reads to (`WindowHit.answered` of the hit-test the guard judged; nil when it answered nothing or late, which keeps
/// main's path), `recorded` the items the observation recorded there (`recordedMenuItems`), which agree with the hit
/// when the identified one is its handle. The menu window (`menuWindow`, the window list) is read only when one of them
/// names a menu item outside a web page, so no other click reads it.
func menuItemPoint<Element>(hit: Element?, recorded: RecordedMenuItems<Element>, reads: MenuItemReads<Element>,
                            menuWindow: () -> CGWindowID?) -> MenuItemPoint<Element> {
  guard let hit else { return .notMenu }
  let hitMenu = reads.role(hit) == kAXMenuItemRole ? reads.parent(hit).flatMap { reads.role($0) == kAXMenuRole ? $0 : nil } : nil
  // A page's own (ARIA) menu is main's, unless the record holds a native item at the point (the re-review's item 3:
  // a page item answered under a native menu window still open over it is not what the screenshot showed).
  let nativeMenu = hitMenu.flatMap { inWebArea($0, reads: reads) ? nil : $0 }
  let identified = recorded.identified.flatMap { inWebArea($0.element, reads: reads) ? nil : $0 }
  let anyNative = identified != nil || recorded.holding.contains { !inWebArea($0.element, reads: reads) }
  guard nativeMenu != nil || anyNative else { return .notMenu }
  guard let window = menuWindow() else { return .notMenu }
  guard let menu = nativeMenu else { return .refuse(.notHit, window: window) }
  guard anyNative else { return .refuse(.unobserved, window: window) }
  guard let recorded = identified, reads.same(recorded.element, hit) else { return .refuse(.notRecorded, window: window) }
  let title = reads.title(hit)
  guard sameMenuTitle(recorded: recorded.title, live: title) else { return .refuse(.relabelled, window: window) }
  guard reads.enabled(hit) == true else { return .refuse(.disabled, window: window) }
  guard let action = reads.actions(hit).flatMap({ actions in ["AXPick", "AXPress"].first(where: actions.contains) }) else {
    return .refuse(.noAction, window: window)
  }
  return .deliver(MenuItemTarget(item: hit, menu: menu, action: action, window: window, title: title.text.flatMap { $0.isEmpty ? nil : $0 }))
}

/// What the control the menu belongs to shows after the action against before it: moved to the item's title (`taken`),
/// the item's title as before (`unchanged`: no evidence the action moved it), another (`other`), or nothing to compare
/// (`unread`: no control identified before the action, no title, or the selection's attribute not read before or now).
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
/// item's title where it showed another before. A control's selection is its AXValue, its AXTitle only where the value
/// is absent (never where its read failed), chosen once before the action and read the same after it, so a static label
/// never stands in for the value and a failed read gives no evidence (the re-review of 32787ce3..3eb2b806, item 1). The
/// item's title is the one the decision verified against the record (`MenuItemTarget.title`), read again just before the
/// action: another, or a failed read, refuses as `relabelled` with nothing performed (item 2). Read at once and every `menuItemSampleMs` for up to
/// `menuItemSettleMs`; seen, it answers; otherwise `clickUnconfirmed`.
func deliverMenuItem<Element>(_ target: MenuItemTarget<Element>, app: String, reads: MenuItemReads<Element>,
                              menuWindowShown: (CGWindowID) -> Bool?, now: () -> Double, sleep: (Double) -> Void,
                              openers: [Element] = [], beforeDispatch: () throws -> Void = {}, perform: (String) -> AXError,
                              record: inout MenuItemClickRecord) throws {
  func opener(_ element: Element?) -> Element? {
    element.flatMap { reads.role($0).map(menuOpenerRoles.contains) == true ? $0 : nil }
  }
  let title = target.title
  let parent = reads.parent(target.menu)
  let control: Element?
  if parent != nil {
    control = opener(parent)
  } else {
    switch parentlessMenuOpener(target.menu, candidates: openers, reads: reads, now: now) {
    case .found(let found): control = found
    case .none: control = opener(reads.focused())
    case .unknown: control = nil
    }
  }
  // The selection's attribute is chosen once, before the action: AXValue when it reads, AXTitle only where the value is
  // absent; a failed read chooses none, so it gives no evidence. After the action the same attribute is read.
  let source: ((Element) -> MenuTextRead)?
  let before: String?
  switch control.map(reads.value) {
  case .text(let value)?: (source, before) = (reads.value, value)
  case .absent?:
    let label = control.map(reads.title)?.text
    (source, before) = (label == nil ? nil : reads.title, label)
  default: (source, before) = (nil, nil)
  }
  try beforeDispatch()
  // The verified title, read once more just before the action (the re-review's item 2): another refuses, nothing sent.
  guard sameMenuTitle(recorded: title.map(bounded), live: reads.title(target.item)) else {
    record.refused = .relabelled
    throw menuItemRefused(app: app, .relabelled)
  }
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
    guard let title, let control, let source, let before, let after = source(control).text else { return .unread }
    guard after == title else { return .other }
    return before == title ? .unchanged : .taken
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

/// The time the search for a parentless menu's control may take before the action (each candidate's reads are AX
/// round trips): past it, the evidence is incomplete.
let menuOpenerBudgetMs: Double = 100

/// What the search for a parentless menu's control found: the control, none among complete evidence (the focused
/// element may still be it), or no answer (`unknown`: two matches, a read that failed, the candidates capped, or the
/// budget spent), which leaves the click unconfirmed (the review of c83ed846..74c99b92, items 2 and 3).
enum MenuOpenerSearch<Element> {
  case found(Element)
  case none
  case unknown
}

/// The page control a menu with no parent belongs to (#454's qualification, run 44860009214: Chrome's `<select>` menu is
/// an app-level AXMenu, and the page's AXPopUpButton, the one control whose value shows the option taken, keeps its own
/// AXMenu child listing the same options while the focus is elsewhere): among the recorded controls of a
/// `menuOpenerRoles` role (`candidates`, the observation's, at most `menuOpenerCandidateLimit`), the one whose own AXMenu
/// child lists the menu's item titles, in order. Only complete evidence answers: every candidate read, within
/// `menuOpenerBudgetMs` on `now`; a second match ends the search as unknown.
func parentlessMenuOpener<Element>(_ menu: Element, candidates: [Element], reads: MenuItemReads<Element>,
                                   now: () -> Double = { 0 }, budgetMs: Double = menuOpenerBudgetMs) -> MenuOpenerSearch<Element> {
  let started = now()
  func titles(_ menu: Element) -> [String]? {
    guard let items = reads.children(menu) else { return nil }
    var read: [String] = []
    for item in items {
      guard let role = reads.role(item) else { return nil }
      guard role == kAXMenuItemRole else { continue }
      guard let title = reads.title(item).text else { return nil }
      read.append(title)
    }
    return read.isEmpty ? nil : read
  }
  guard candidates.count <= menuOpenerCandidateLimit, let shown = titles(menu) else { return .unknown }
  var match: Element?
  for candidate in candidates {
    guard now() - started < budgetMs, let role = reads.role(candidate) else { return .unknown }
    guard menuOpenerRoles.contains(role) else { continue }
    guard let children = reads.children(candidate) else { return .unknown }
    for child in children {
      guard let childRole = reads.role(child) else { return .unknown }
      guard childRole == kAXMenuRole else { continue }
      guard let listed = titles(child) else { return .unknown }
      guard listed == shown else { continue }
      if match != nil { return .unknown }
      match = candidate
    }
  }
  return match.map { .found($0) } ?? MenuOpenerSearch.none
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
                            openers: [Element] = [], deadlinePassed: () -> Bool = { false }, prepareOwner: (Element) throws -> Void,
                            checkInFlight: () throws -> Void,
                            announce: () -> Void = {},
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
    try deliverMenuItem(target, app: app, reads: reads, menuWindowShown: menuWindowShown, now: now, sleep: sleep, openers: openers, beforeDispatch: {
      // The reads before the action (the control's search included) may have used the request's time up.
      if deadlinePassed() { throw menuItemDeadlinePassed }
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
  if why == .unobserved {
    return EngineError(name: "appWindowOverPoint",
      "\(app) has a menu open at this point, and the accessibility record of the screenshot holds no item of it at this point (a menu-bar menu, a submenu, or a menu opened since the screenshot), so the click cannot be checked against what the screenshot showed. Nothing was sent. A click outside the menu closes it. If a fresh getAXState() lists the item (a menu-bar menu's items are listed once its title in the menu bar has been clicked by its element), click the item by its element.")
  }
  let cause: String
  switch why {
  case .unobserved: cause = ""
  case .notRecorded: cause = "the item there is not the one the screenshot showed at this point"
  case .notHit: cause = "the item the screenshot showed there is not what the point reaches now"
  case .relabelled: cause = "the item there no longer reads what the screenshot showed"
  case .disabled: cause = "the item there is disabled"
  case .noAction: cause = "the item there takes no action"
  }
  return EngineError(name: "appWindowOverPoint",
    "\(app) has a menu open at this point, which a click takes only as its item's own action, but \(cause). Nothing was sent. Use keys instead (the arrow keys to the item, then Return; Escape closes the menu), or call getAXState() and click the menu item it lists, by its element.")
}

/// The request's deadline passed before the menu item's action was sent (the review of c83ed846..74c99b92, item 3).
let menuItemDeadlinePassed = EngineError(name: "timeoutReached",
  "timeoutReached: the request's deadline passed before the menu item's action was sent. Nothing was sent.")

/// #454's unconfirmed answer: the item's action was performed, but its effect was not seen within the settle.
func menuItemUnconfirmed(app: String, action: String, closed: Bool) -> EngineError {
  let seen = closed ? "the menu closed, but nothing cua can read shows the item taken" : "the menu was not seen to close with the item taken"
  return EngineError(name: "clickUnconfirmed",
    "The click could not be confirmed: it was carried by the menu item's \(action) action in \(app), since a pointer click does not take a menu's item, and \(seen). Observe the app with get_app_state before any retry, and never retry blindly.")
}
