import ApplicationServices
import CoreGraphics
import Foundation

// #458 (design rulings 977 and 979): a coordinate click on a closed pop-up button. #458's kit (`probe/458-measure`,
// scripts/probe-337/README.md §#458 at b55d2908; run 44877626226 on main edbfbd23) found that main's click on TextEdit's
// font pop-up or Script Editor's language pop-up, the app behind in shared mode, opens the menu 110–260 ms in and route
// 3's hold-and-restore closes it again as it puts the person's window order back (ok with no menu showing, 10/10); in
// dedicated mode the menu rarely shows at all. The button's AXPress opens it in every mode (30/30 by route 3, 30/30 by
// route 1), and the next observation lists its items. So once the stale-point guard has kept the point, and before
// anything is posted, a plain left click whose point the app's hit-test answers, in time (`pointHitSignalDeadlineMs`),
// as an enabled closed pop-up button, which is the one the observation recorded there (`recordedPopUp`, over #454's
// search), is that button's AXPress, in every mode, by the element click's own route (`actionRoute`: route 3's focus
// hold when the app does not believe it has focus, else route 1). Just before the press (after the hold) the deadline
// is checked again, the button must still read closed, and the effect's baseline is read; the effect is a window of the
// app's own at the menu layer (101), absent from that baseline, over or next to the button, read at once and every
// `popUpOpenSampleMs` for up to `popUpOpenSettleMs`; seen, the click answers success, else `clickUnconfirmed`. A window
// list that does not read is never taken for "no menu": unread at the decision, main's path is kept; unread just
// before the press, the press goes and answers `clickUnconfirmed`. The menu stays open because nothing after the press
// puts the window order back: the focus hold's guard, which raises the person's window back over the app's, ends before
// the press, and the element route has no delivery guard and no after-action watch (those are route 3's pointer
// delivery's, `deliverPointer`), unlike the posted click, whose delivery guard restores the order after the menu has
// opened and so closes it.
//
// Which controls (the kit's shapes): AppKit's AXPopUpButton, its ancestry established outside every web page; Chrome's
// `<select>`, an AXPopUpButton in the page that has no AXMenu child while closed (125/125 rows) but whose options the
// observation records under it, the deepest recorded node at the point being one of them (`hitAboveNode`, recorded
// AXMenuItem, 15/15), which a page's ARIA pop-up button does not have; and a native AXComboBox's arrow, which hit-tests
// as an AXButton child of the combo box (15/15), its text hitting the combo box itself. A pop-up whose ancestry does not
// read to its window takes the record's web area when the record holds one, else keeps main's path. The combo box has
// no element action that opens it (AXShowMenu and AXConfirm only; AXPress unsupported, AXShowMenu opens nothing), so
// with the app not frontmost it is refused (`backgroundClickRefused`); frontmost, the posted click opens it (5/5) and
// main's path stands. A shared-mode web page behind is #282's element route, which already presses a `<select>`; there
// the same check before the press, effect and order record apply (`popUpConfirmingRoute`). Signals that disagree, a hit
// late or failed, a disabled or already open button, one with no AXPress keep main's path, said in `popUpClick.kept`.
// Opening any menu behind raises the app's window above the person's in the window order, which Escape does not undo;
// the open records the order to put back (`PopUpMenuOrder`, the connection's `popUpMenuOrders`), for #454's pick and
// the key path to restore once its cost is measured (ruling 979, item 4: not yet acted on). Everything reads through
// closures, so the rule is unit-tested over fakes.

/// The wait for the button's menu after its AXPress: read at once, then every 20 ms for up to 500 ms, about twice the
/// slowest open #458's kit measured (260 ms after a posted click began, route 3's activation included).
let popUpOpenSettleMs: Double = 500
let popUpOpenSampleMs: Double = 20
/// How far from the button's frame the menu's window may lie and still be its menu: AppKit's covers the button, and
/// Chrome's `<select>` list opens against its edge (measured: (404, 154, 77×82) for a button at (416, 159, 57×19)).
let popUpMenuMargin: CGFloat = 24
/// The roles whose recorded node at a point #458 looks for.
let popUpRoles: Set<String> = [kAXPopUpButtonRole, kAXComboBoxRole]

/// The reads #458 makes (the unit tests' seams; `.live` over the Accessibility API).
struct PopUpReads<Element> {
  var role: (Element) -> String?
  var parent: (Element) -> Element?
  /// AXEnabled; nil when it does not read.
  var enabled: (Element) -> Bool?
  /// The advertised actions; nil when the read failed.
  var actions: (Element) -> [String]?
  /// The element's frame in global points, top-left origin; nil when it does not read.
  var frame: (Element) -> CGRect?
  /// AXExpanded; nil when it does not read (AppKit's pop-up button has none).
  var expanded: (Element) -> Bool?
  var same: (Element, Element) -> Bool
}

private func popUpFrame(_ element: AXUIElement) -> CGRect? { frame(of: element) }

extension PopUpReads where Element == AXUIElement {
  static var live: PopUpReads<AXUIElement> {
    PopUpReads(role: { attribute($0, kAXRoleAttribute) as? String }, parent: { elementAttribute($0, kAXParentAttribute) },
               enabled: { (attribute($0, kAXEnabledAttribute) as? NSNumber)?.boolValue },
               actions: { establishedActionNames(of: $0) }, frame: popUpFrame,
               expanded: { (attribute($0, kAXExpandedAttribute) as? NSNumber)?.boolValue }, same: { CFEqual($0, $1) })
  }
}

/// What opens a menu of its own at a point.
enum PopUpControl: Equatable {
  case popUpButton
  /// A combo box's arrow: an AXButton whose parent is the AXComboBox (TextEdit's font size, 15/15).
  case comboBoxArrow
}

/// The control a hit names: an AXPopUpButton itself, or the AXComboBox whose arrow (an AXButton child) it is. A hit on
/// the combo box itself is its text, a text field's: none.
func popUpControl<Element>(_ hit: Element, reads: PopUpReads<Element>) -> (control: Element, kind: PopUpControl)? {
  switch reads.role(hit) {
  case kAXPopUpButtonRole?: return (hit, .popUpButton)
  case kAXButtonRole?:
    guard let parent = reads.parent(hit), reads.role(parent) == kAXComboBoxRole else { return nil }
    return (parent, .comboBoxArrow)
  default: return nil
  }
}

/// The pop-up button or combo box the observation recorded at the point (`recordedAtPoint`, #454's search), with what the
/// record holds around it: an AXMenuItem under it (`holdsOption`: Chrome's `<select>` records its options while closed),
/// and an AXWebArea above it (`inRecordedWebArea`).
struct RecordedPopUp<Element> {
  let element: Element
  let role: String
  var holdsOption = false
  var inRecordedWebArea = false
}

func recordedPopUp<Element>(_ verdict: StalePointVerdict<Element>, same: (Element, Element) -> Bool) -> RecordedPopUp<Element>? {
  guard let found = recordedAtPoint(verdict, roles: popUpRoles) else { return nil }
  var popUp = RecordedPopUp(element: found.element, role: found.role)
  let nodes = verdict.nodes
  let recordedHandle = verdict.node.flatMap { node in same(found.element, verdict.current ?? node.element) ? node.element : nil }
  guard let index = nodes.firstIndex(where: { node in
    same(node.element, found.element) || recordedHandle.map { same(node.element, $0) } == true
  }) else { return popUp }
  func ancestors(of start: Int) -> [Int] {
    var found: [Int] = []
    var next = nodes[start].ancestor
    while let at = next, at < nodes.count, found.count < stalePointAncestorLevels {
      found.append(at)
      next = nodes[at].ancestor
    }
    return found
  }
  popUp.inRecordedWebArea = ancestors(of: index).contains { nodes[$0].role == "AXWebArea" }
  popUp.holdsOption = nodes.indices.contains { nodes[$0].role == kAXMenuItemRole && ancestors(of: $0).contains(index) }
  return popUp
}

/// Where a control lies: established outside every web page (its parents read to its window), in a page, or unknown (a
/// read failed or the bound ran out before a window; the record's web area, where it holds one, answers instead).
enum PopUpPlace: Equatable { case native, web, unknown }

func popUpPlace<Element>(_ control: Element, reads: PopUpReads<Element>, recorded: RecordedPopUp<Element>) -> PopUpPlace {
  switch webAreaWalk(control, role: reads.role, parent: reads.parent) {
  case .inside, .aboveWebArea: return .web
  case .outside: return .native
  case .incomplete: return recorded.inRecordedWebArea ? .web : .unknown
  }
}

/// Why a click on a pop-up button kept main's path (the meta's `popUpClick.kept`).
enum PopUpKept: String, Equatable {
  /// The record names a pop-up button at the point and the hit-test answered nothing, or past `pointHitSignalDeadlineMs`.
  case noSignal
  /// The hit-test answers a pop-up button the observation did not record at the point (another, or none).
  case notRecorded
  /// The observation recorded a pop-up button at the point, and the hit-test answers another element.
  case notHit
  /// The control's parents did not read to its window, and the record holds no web area above it.
  case ancestryUnread
  /// The button reads disabled, or its AXEnabled does not read.
  case disabled
  /// The button reads expanded, or a menu window of the app's already lies over or next to it.
  case open
  /// The window list did not read, so nothing shows the button closed.
  case windowsUnread
  /// The button advertises no AXPress (a pop-up button) or its actions do not read.
  case noAction
  /// A combo box with no action of its own in the frontmost app, where the posted click opens its list.
  case frontmost
}

/// The button a click is delivered to: its role, the area its menu's window must reach (its frame grown by
/// `popUpMenuMargin`; the point's when the frame does not read), and the window list read at the decision, before any
/// hold: the order the restore seam compares with.
struct PopUpTarget<Element> {
  let element: Element
  let role: String
  let near: CGRect
  let before: [ListedWindow]
}

/// #458's decision at a kept coordinate click's point.
enum PopUpPoint<Element> {
  /// No pop-up button at the point by either signal: main's path, unrecorded.
  case notPopUp
  /// A pop-up button by one signal, or one #458 does not carry: main's path, the reason in the meta.
  case kept(PopUpKept, role: String)
  case press(PopUpTarget<Element>)
  /// A combo box's arrow with no action, the app not frontmost: refused, nothing sent.
  case refuse(role: String)
}

/// Whether `window` is a window of the app's (`pids`) at the menu layer showing something.
func isMenuWindow(_ window: ListedWindow, pids: Set<pid_t>) -> Bool {
  pids.contains(window.owner) && window.layer == menuWindowLayer && window.alpha > 0
}

/// #458's decision (design ruling 977): `hit` is what the app's hit-test answered at the point (`WindowHit.answered` of
/// the hit-test the guard judged; nil when it answered nothing or late), `recorded` what the observation recorded there
/// (`recordedPopUp`). The window list (`windows`, nil when it did not read) is read only once both name the same control,
/// placed, enabled and not expanded, and `frontmost` only for a combo box with no action.
func popUpPoint<Element>(hit: Element?, recorded: RecordedPopUp<Element>?, point: CGPoint, pids: Set<pid_t>,
                         reads: PopUpReads<Element>, frontmost: () -> Bool, windows: () -> [ListedWindow]?) -> PopUpPoint<Element> {
  // An item of an open menu is #454's, whatever pop-up button the record holds above it.
  if let hit, reads.role(hit) == kAXMenuItemRole { return .notPopUp }
  guard let hit, let (control, kind) = popUpControl(hit, reads: reads) else {
    guard let recorded else { return .notPopUp }
    guard let hit else { return .kept(.noSignal, role: recorded.role) }
    // The recorded combo box itself, hit on its text: a click into a text field, main's.
    if reads.same(hit, recorded.element) { return .notPopUp }
    return .kept(.notHit, role: recorded.role)
  }
  let role = reads.role(control) ?? ""
  guard let recorded, reads.same(recorded.element, control) else { return .kept(.notRecorded, role: role) }
  switch popUpPlace(control, reads: reads, recorded: recorded) {
  case .unknown: return .kept(.ancestryUnread, role: role)
  case .web:
    // Chrome's `<select>`, its options recorded under it; a page's ARIA pop-up button or combo box is the page's own.
    guard kind == .popUpButton, recorded.holdsOption else { return .notPopUp }
  case .native: break
  }
  guard reads.enabled(control) == true else { return .kept(.disabled, role: role) }
  guard reads.expanded(control) != true else { return .kept(.open, role: role) }
  let near = (reads.frame(control) ?? CGRect(origin: point, size: .zero)).insetBy(dx: -popUpMenuMargin, dy: -popUpMenuMargin)
  guard let list = windows() else { return .kept(.windowsUnread, role: role) }
  guard !list.contains(where: { isMenuWindow($0, pids: pids) && $0.bounds.intersects(near) }) else { return .kept(.open, role: role) }
  guard let actions = reads.actions(control) else { return .kept(.noAction, role: role) }
  if actions.contains(kAXPressAction) { return .press(PopUpTarget(element: control, role: role, near: near, before: list)) }
  guard kind == .comboBoxArrow else { return .kept(.noAction, role: role) }
  return frontmost() ? .kept(.frontmost, role: role) : .refuse(role: role)
}

/// #458's restore seam (design ruling 979, item 4; recorded, not yet acted on): the window order an open of a menu of
/// the app's broke, which #454's pick of an item of `menuWindow`, or an Escape the engine sends to the app, is to put
/// back by raising `personWindow` over `appWindow` again. Kept per app on the connection (`popUpMenuOrders`), set by a
/// confirmed open that raised the app's window above the person's front window, cleared by one that did not.
struct PopUpMenuOrder: Equatable {
  let menuWindow: CGWindowID
  /// The app's window the click was aimed at (the observed one), which the open raised.
  let appWindow: CGWindowID
  /// The person's front window before the press (the first layer-0 window of another app's), and its process.
  let personWindow: CGWindowID
  let personPid: pid_t
}

/// Whether the open raised the app's window (`appWindow`) above the person's front window: the person's in front of it
/// in the order read at the decision and behind it after. Nil when either window is not in both lists (nothing to
/// compare); the engine's own windows (`ownPid`, the agent cursor's panel) are never the person's.
func popUpRaisedOrder(before: [ListedWindow], after: [ListedWindow], appWindow: CGWindowID?, pids: Set<pid_t>,
                      ownPid: pid_t) -> (raised: Bool, person: ListedWindow)? {
  guard let appWindow,
        let person = before.first(where: { $0.layer == 0 && $0.alpha > 0 && !pids.contains($0.owner) && $0.owner != ownPid }),
        let personBefore = before.firstIndex(where: { $0.number == person.number }),
        let appBefore = before.firstIndex(where: { $0.number == appWindow }),
        let personAfter = after.firstIndex(where: { $0.number == person.number }),
        let appAfter = after.firstIndex(where: { $0.number == appWindow }) else { return nil }
  return (personBefore < appBefore && appAfter < personAfter, person)
}

/// The meta's `popUpClick` (#458, value-free): the control's role; and either why main's path was kept (`kept`), the
/// refusal (`refused: "noAction"`, a combo box), or the click delivered as the pop-up button's AXPress (`delivery:
/// "action"`, set once the action is dispatched) with its effect, whether the baseline before the press read
/// (`baselineUnread`), the menu's window once seen, whether the open raised the app's window above the person's (null:
/// not comparable), the action's AXError when it was not success, the reads and the milliseconds from the action's
/// return to the last.
struct PopUpClickRecord: Equatable {
  let role: String
  var kept: PopUpKept?
  var refused = false
  var action: String?
  var actionError: Int32?
  var baselineUnread = false
  var menuWindow: CGWindowID?
  var raisedAppWindow: Bool??
  var polls = 0
  var ms: Double?
  var confirmed: Bool { menuWindow != nil }

  var wire: [String: Any] {
    var wire: [String: Any] = ["role": role]
    if let kept { wire["kept"] = kept.rawValue }
    if refused { wire["refused"] = "noAction" }
    if let action {
      wire["delivery"] = "action"
      wire["action"] = action
      wire["effect"] = confirmed ? "confirmed" : "unconfirmed"
    }
    if let actionError { wire["actionError"] = Int(actionError) }
    if baselineUnread { wire["baselineUnread"] = true }
    if let menuWindow { wire["menuWindow"] = Int(menuWindow) }
    if let raisedAppWindow { wire["raisedAppWindow"] = raisedAppWindow.map { $0 as Any } ?? NSNull() }
    if polls > 0 { wire["polls"] = polls }
    if let ms { wire["ms"] = (ms * 1000).rounded() / 1000 }
    return wire
  }
}

/// The check just before the press, after any hold (the review of edbfbd23..75fecad2, items 5–7): the request's
/// deadline again, the button still closed (not expanded, no menu window of the app's at it), and the effect's baseline,
/// the app's menu windows then (nil when the list did not read: the press goes, and cannot be confirmed). A menu opened
/// since the decision refuses with nothing pressed.
func popUpBeforeDispatch<Element>(_ target: PopUpTarget<Element>, app: String, pids: Set<pid_t>, reads: PopUpReads<Element>,
                                  windows: () -> [ListedWindow]?, deadlinePassed: () -> Bool) throws -> Set<CGWindowID>? {
  if deadlinePassed() { throw popUpDeadlinePassed }
  if reads.expanded(target.element) == true { throw popUpOpenedSince }
  guard let list = windows() else { return nil }
  if list.contains(where: { isMenuWindow($0, pids: pids) && $0.bounds.intersects(target.near) }) { throw popUpOpenedSince }
  return Set(list.filter { isMenuWindow($0, pids: pids) }.map(\.number))
}

/// The press's effect: a window of the app's at the menu layer, absent from `baseline`, over or next to the button, read
/// at once and every `popUpOpenSampleMs` for up to `popUpOpenSettleMs` (a read that fails is a sample with nothing seen).
/// Seen, the order it broke goes to `opened` (nil when it broke none); otherwise, or with no baseline, `clickUnconfirmed`.
func popUpAwaitOpen<Element>(_ target: PopUpTarget<Element>, baseline: Set<CGWindowID>?, app: String, appWindow: CGWindowID?,
                             pids: Set<pid_t>, ownPid: pid_t, windows: () -> [ListedWindow]?, now: () -> Double,
                             sleep: (Double) -> Void, opened: (PopUpMenuOrder?) -> Void, record: inout PopUpClickRecord) throws {
  guard let baseline else {
    record.baselineUnread = true
    throw popUpUnconfirmed(app: app)
  }
  let started = now()
  while true {
    record.polls += 1
    let list = windows()
    let menu = list?.first { isMenuWindow($0, pids: pids) && !baseline.contains($0.number) && $0.bounds.intersects(target.near) }
    record.ms = now() - started
    if let list, let menu {
      record.menuWindow = menu.number
      let order = popUpRaisedOrder(before: target.before, after: list, appWindow: appWindow, pids: pids, ownPid: ownPid)
      record.raisedAppWindow = .some(order?.raised)
      if let order, order.raised, let appWindow {
        opened(PopUpMenuOrder(menuWindow: menu.number, appWindow: appWindow, personWindow: order.person.number, personPid: order.person.owner))
      } else {
        opened(nil)
      }
      return
    }
    let ms = record.ms ?? 0
    if ms >= popUpOpenSettleMs { break }
    sleep(min(popUpOpenSampleMs, popUpOpenSettleMs - ms))
  }
  throw popUpUnconfirmed(app: app)
}

/// #458's step in a coordinate click, after the stale-point guard kept the point (and after #454's) and before anything
/// is posted: the decision carried out. True when it carried the click (the AXPress performed and the menu seen; an
/// unconfirmed one throws), so the caller posts nothing; the combo box's refusal throws with nothing sent; false leaves
/// the click to main's path, `kept`'s reason in the meta. Before the press the request's deadline is checked, then
/// `hold` runs (the press owner's forbidden check, the element click's focus hold when `route` is 3, and the stale-point
/// guard's last check after it), then `popUpBeforeDispatch`, the in-flight check and `announce` (the agent cursor's
/// click). A confirmed open hands `opened` the order it broke, or nil when it broke none (`PopUpMenuOrder`).
func popUpClick<Element>(_ decision: PopUpPoint<Element>, app: String, route: InputRoute, appWindow: CGWindowID?, pids: Set<pid_t>,
                         ownPid: pid_t = getpid(), reads: PopUpReads<Element>, windows: () -> [ListedWindow]?, now: () -> Double,
                         sleep: (Double) -> Void, deadlinePassed: () -> Bool = { false }, hold: (Element, inout InputMeta) throws -> Void,
                         checkInFlight: () throws -> Void, announce: () -> Void = {}, perform: (Element, String) -> AXError,
                         opened: (PopUpMenuOrder?) -> Void, meta: inout InputMeta) throws -> Bool {
  switch decision {
  case .notPopUp: return false
  case .kept(let why, let role):
    meta.popUpClick = PopUpClickRecord(role: role, kept: why)
    return false
  case .refuse(let role):
    meta.popUpClick = PopUpClickRecord(role: role, refused: true)
    throw popUpComboRefused(app: app)
  case .press(let target):
    meta.inputRoute = route
    meta.popUpClick = PopUpClickRecord(role: target.role)
    if deadlinePassed() { throw popUpDeadlinePassed }
    try hold(target.element, &meta)
    let baseline = try popUpBeforeDispatch(target, app: app, pids: pids, reads: reads, windows: windows, deadlinePassed: deadlinePassed)
    try checkInFlight()
    announce()
    var record = PopUpClickRecord(role: target.role, action: kAXPressAction)
    defer { meta.popUpClick = record }
    var error = AXError.failure
    meta.posting { error = perform(target.element, kAXPressAction); return true }
    if error != .success {
      record.actionError = error.rawValue
      // A messaging timeout may still have opened the menu (#454's ambiguous errors): the effect decides.
      guard menuItemAmbiguousErrors.contains(error) else {
        throw EngineError(name: "actionFailed", "The element did not accept the \(kAXPressAction) action.")
      }
    }
    try popUpAwaitOpen(target, baseline: baseline, app: app, appWindow: appWindow, pids: pids, ownPid: ownPid, windows: windows,
                       now: now, sleep: sleep, opened: opened, record: &record)
    return true
  }
}

/// #282's element route on a qualifying `<select>` (a shared-mode web page behind, review item 3): the route delivers as
/// before (`route`, handed the check to run just before its press, on the element it presses), and when it pressed the
/// button the same baseline, effect, unconfirmed answer and order record follow. A route that pressed another control
/// answers as #282's alone.
func popUpConfirmingRoute<Element>(_ target: PopUpTarget<Element>, app: String, appWindow: CGWindowID?, pids: Set<pid_t>,
                                   ownPid: pid_t = getpid(), reads: PopUpReads<Element>, windows: @escaping () -> [ListedWindow]?,
                                   now: () -> Double, sleep: (Double) -> Void, deadlinePassed: @escaping () -> Bool = { false },
                                   opened: (PopUpMenuOrder?) -> Void,
                                   route: (_ beforePress: (Element, inout InputMeta) throws -> Void, _ meta: inout InputMeta) throws -> Void,
                                   meta: inout InputMeta) throws {
  var armed: Set<CGWindowID>??
  try route({ pressed, meta in
    guard reads.same(pressed, target.element) else { return }
    meta.popUpClick = PopUpClickRecord(role: target.role)
    armed = .some(try popUpBeforeDispatch(target, app: app, pids: pids, reads: reads, windows: windows, deadlinePassed: deadlinePassed))
  }, &meta)
  guard let baseline = armed else { return }
  var record = PopUpClickRecord(role: target.role, action: kAXPressAction)
  defer { meta.popUpClick = record }
  try popUpAwaitOpen(target, baseline: baseline, app: app, appWindow: appWindow, pids: pids, ownPid: ownPid, windows: windows,
                     now: now, sleep: sleep, opened: opened, record: &record)
}

/// The check #282's route runs just before its press (`webAreaPress`'s `beforePress`), set by `popUpConfirmingRoute`
/// while that route runs; none outside it.
final class PopUpPressChecks {
  var check: ((AXUIElement, inout InputMeta) throws -> Void)?

  func run(_ control: AXUIElement, _ meta: inout InputMeta) throws { try check?(control, &meta) }
}

/// #458's unconfirmed answer: the button's AXPress was performed, and no menu of the app's was seen to open at it.
func popUpUnconfirmed(app: String) -> EngineError {
  EngineError(name: "clickUnconfirmed",
    "The click could not be confirmed: it was carried by the pop-up button's AXPress action in \(app), since a posted click can close the menu it opens, and no menu was seen to open at the button. Observe the app with get_app_state before any retry, and never retry blindly.")
}

/// #458's refusal (design ruling 979, item 3): a native combo box's arrow, the app not frontmost.
func popUpComboRefused(app: String) -> EngineError {
  EngineError(name: "backgroundClickRefused",
    "\(app)'s combo box opens its list only for a pointer click, and a click cua sends to \(app) while it is not the frontmost app does not leave that list open; the combo box has no accessibility action that opens it. Nothing was sent. Ask the person to bring \(app) to the front, or type the value into the combo box's text field instead (setValue on its element, or click its text and use typeText).")
}

/// The pop-up button opened its menu between the decision and the press (during the focus hold): pressing it would
/// close the menu, so nothing is pressed.
let popUpOpenedSince = EngineError(name: "screenChangedSinceScreenshot",
  "The screen changed since the screenshot: the pop-up button at this point now shows its menu open, and a press would close it. The button was not pressed. Take a new screenshot or call getAXState() to see the menu's items before clicking one.")

/// The request's deadline passed before the pop-up button's AXPress was sent.
let popUpDeadlinePassed = EngineError(name: "timeoutReached",
  "timeoutReached: the request's deadline passed before the pop-up button's AXPress action was sent. The button was not pressed.")
