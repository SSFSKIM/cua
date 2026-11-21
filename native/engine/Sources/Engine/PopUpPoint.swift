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
// read to its window takes the record's web area when the record holds one, else keeps main's path. The combo box itself
// has no element action that opens it (AXShowMenu and AXConfirm only), but its arrow does (#458's restore kit, run
// 44888938314: TextEdit's "font size" AXButton, AXPress, its trailing edge 4.0 pt inside the box's): the arrow's AXPress
// opens the list behind 20/20, as a new layer-0 window of the app's above its document window and below the person's,
// raising nothing; that confirms it. Only a combo box whose arrow has no AXPress is refused with the app not frontmost
// (`backgroundClickRefused`); frontmost, the posted click opens it (5/5) and main's path stands. A shared-mode web page
// behind is #282's element route, which already presses a `<select>`; there the same check before the press, effect and
// restore apply (`popUpConfirmingRoute`). Signals that disagree, a hit late or failed, a disabled or already open button,
// one with no AXPress keep main's path, said in `popUpClick.kept`. Opening a menu behind raises the app's window above the
// person's in the window order, which neither the pick nor Escape undoes: as soon as the open is confirmed and the app's
// window has risen, the person's windows that were in front of it are raised back (`popUpRestoreOrder`, design ruling
// 979 item 4, measured 180/180 whole, 232 ms worst, the menu still usable). Everything reads through closures, so the
// rule is unit-tested over fakes.

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
  /// AXChildren; nil when the read failed.
  var children: (Element) -> [Element]?
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
               children: childrenRead, enabled: { (attribute($0, kAXEnabledAttribute) as? NSNumber)?.boolValue },
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

/// How near the combo box's trailing edge its arrow's frame ends, in points.
let comboArrowEdgeSlack: CGFloat = 4

/// The control a hit names: an AXPopUpButton itself, or the AXComboBox whose arrow it is. A hit on the combo box itself
/// is its text, a text field's: none. The arrow is an AXButton child of the combo box at its trailing edge (its frame
/// ending within `comboArrowEdgeSlack` of the box's, no other button child further right); where either frame does not
/// read, only the box's one button child is. Any other child button (a clear or accessory button) keeps its own click.
func popUpControl<Element>(_ hit: Element, reads: PopUpReads<Element>) -> (control: Element, kind: PopUpControl)? {
  switch reads.role(hit) {
  case kAXPopUpButtonRole?: return (hit, .popUpButton)
  case kAXButtonRole?:
    guard let parent = reads.parent(hit), reads.role(parent) == kAXComboBoxRole,
          let buttons = reads.children(parent)?.filter({ reads.role($0) == kAXButtonRole }),
          buttons.contains(where: { reads.same($0, hit) }) else { return nil }
    if let box = reads.frame(parent), let arrow = reads.frame(hit) {
      guard abs(arrow.maxX - box.maxX) <= comboArrowEdgeSlack,
            !buttons.contains(where: { !reads.same($0, hit) && (reads.frame($0)?.maxX ?? -.infinity) > arrow.maxX }) else { return nil }
    } else {
      guard buttons.count == 1 else { return nil }
    }
    return (parent, .comboBoxArrow)
  default: return nil
  }
}

/// The pop-up button or combo box the observation recorded at the point (`recordedAtPoint`, #454's search), with what the
/// record holds around it: the deepest recorded node at the point an AXMenuItem under it, the hit-test answering above it
/// (`holdsOption`: Chrome's closed `<select>` over its recorded option, `hitAboveNode`), and an AXWebArea above it
/// (`inRecordedWebArea`).
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
  func ancestors(from first: Int?) -> [Int] {
    var found: [Int] = []
    var next = first
    while let at = next, at < nodes.count, found.count < stalePointAncestorLevels {
      found.append(at)
      next = nodes[at].ancestor
    }
    return found
  }
  popUp.inRecordedWebArea = ancestors(from: nodes[index].ancestor).contains { nodes[$0].role == "AXWebArea" }
  // The measured shape only (re-review of 75fecad2..1d70a333, item 3): the option is the deepest recorded node at the
  // point, under the pop-up, which the hit-test answers above it (`hitAboveNode`); options recorded elsewhere (parked
  // off the point) are no evidence.
  if verdict.reason == .hitAboveNode, let node = verdict.node, node.role == kAXMenuItemRole {
    popUp.holdsOption = ancestors(from: node.ancestor).contains(index)
  }
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

/// What a click is delivered to: the element pressed (the pop-up button, or the combo box's arrow), the control whose
/// state and frame are read (the pop-up button, or the combo box), its kind and role, the area its menu or list must
/// reach (the control's frame grown by `popUpMenuMargin`; the point's when the frame does not read), and the window list
/// read at the decision, before any hold.
struct PopUpTarget<Element> {
  let element: Element
  let control: Element
  let kind: PopUpControl
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
  /// A combo box whose arrow has no action, the app not frontmost: refused, nothing sent.
  case refuse(role: String)
}

/// Whether `window` is a window of the app's (`pids`) at the menu layer showing something.
func isMenuWindow(_ window: ListedWindow, pids: Set<pid_t>) -> Bool {
  pids.contains(window.owner) && window.layer == menuWindowLayer && window.alpha > 0
}

/// Whether a window new since the press can be what it opened: a pop-up button's menu is a window of the app's at the
/// menu layer; a combo box's list a window of the app's at any layer (TextEdit's: a new layer-0 window above the
/// document window, 20/20, run 44888938314), showing something.
func isOpenedWindow(_ window: ListedWindow, kind: PopUpControl, pids: Set<pid_t>) -> Bool {
  kind == .comboBoxArrow ? pids.contains(window.owner) && window.alpha > 0 : isMenuWindow(window, pids: pids)
}

/// #458's decision (design ruling 977): `hit` is what the app's hit-test answered at the point (`WindowHit.answered` of
/// the hit-test the guard judged; nil when it answered nothing or late), `recorded` what the observation recorded there
/// (`recordedPopUp`). The window list (`windows`, nil when it did not read) is read only once both name the same control,
/// placed, enabled and not expanded, and `frontmost` only for a combo box whose arrow has no action.
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
  // The pop-up button's own AXPress; the combo box's arrow's (TextEdit's "font size" button: AXPress, 20/20 opened).
  let pressed = kind == .comboBoxArrow ? hit : control
  guard let actions = reads.actions(pressed) else { return .kept(.noAction, role: role) }
  if actions.contains(kAXPressAction) {
    return .press(PopUpTarget(element: pressed, control: control, kind: kind, role: role, near: near, before: list))
  }
  guard kind == .comboBoxArrow else { return .kept(.noAction, role: role) }
  return frontmost() ? .kept(.frontmost, role: role) : .refuse(role: role)
}

/// The person's windows in front of the app's window (`appWindow`), front to back: layer 0, showing something, of another
/// process than the app's, never the engine's own (`ownPid`, the agent cursor's panel). Empty when the app's window is
/// not listed.
func personWindowsAbove(_ appWindow: CGWindowID?, in list: [ListedWindow], pids: Set<pid_t>, ownPid: pid_t) -> [ListedWindow] {
  guard let appWindow, let index = list.firstIndex(where: { $0.number == appWindow }) else { return [] }
  return list[..<index].filter { $0.layer == 0 && $0.alpha > 0 && !pids.contains($0.owner) && $0.owner != ownPid }
}

/// Whether `list` holds the recorded order: each recorded window still listed lies in front of the app's window, in its
/// recorded order (a window closed since is left out). Nil when the app's window is not listed.
func personOrderHolds(_ persons: [ListedWindow], appWindow: CGWindowID, in list: [ListedWindow]) -> Bool? {
  guard let app = list.firstIndex(where: { $0.number == appWindow }) else { return nil }
  let at = persons.compactMap { person in list.firstIndex(where: { $0.number == person.number }) }
  return at.allSatisfy { $0 < app } && at == at.sorted()
}

/// The restore's bound: about twice the slowest whole restore #458's restore kit measured (232 ms, run 44888938314).
let popUpRestoreBoundMs: Double = 500

/// What the restore reads and does outside its own state (the unit tests' seams; `.live` over the Accessibility API and
/// route 3's screen-update hold): a person's window's element, route 3's repair (`ActivationSystem.raise`, AXRaise),
/// and the hold, which answers its release.
struct PopUpRestoreSystem<Window> {
  var element: (ListedWindow) -> Window?
  var raise: (Window) -> Void
  var hold: () -> () -> Void
}

extension PopUpRestoreSystem where Window == AXUIElement {
  static var live: PopUpRestoreSystem<AXUIElement> {
    let system = ActivationSystem()
    return PopUpRestoreSystem(element: personWindowElement, raise: system.raise, hold: { system.holdScreenUpdates(ReenableStamp()) })
  }
}

/// A listed window's element: the window of its process's AXWindows whose number is the listed one.
func personWindowElement(_ window: ListedWindow) -> AXUIElement? {
  let application = prepare(AXUIElementCreateApplication(window.owner))
  guard let windows = attribute(application, kAXWindowsAttribute) as? [AXUIElement] else { return nil }
  return windows.first { windowNumber(of: $0, pid: window.owner, frame: frame(of: $0)) == window.number }
}

/// The meta's `popUpClick.restored`: how many of the person's windows were put back, the milliseconds from the hold to
/// the end, whether the order came back within the bound, and how many rounds of raises it took.
struct PopUpRestoreRecord: Equatable {
  let windows: Int
  var ms: Double = 0
  var complete = false
  var raises = 0

  var wire: [String: Any] { ["windows": windows, "ms": (ms * 1000).rounded() / 1000, "complete": complete, "raises": raises] }
}

/// #458's restore (design ruling 979, item 4; run 44888938314): the person's windows recorded in front of the app's
/// window before the press (`persons`, front to back) raised back over it, back to front, by route 3's own repair
/// (AXRaise on each window's element, never an activation), inside the screen-update hold, sampled as route 3's delivery
/// guard samples (every `deliveryGuardSampleMs`, raising all of them again whenever the order reads wrong, ending on
/// `deliveryGuardStableSamples` samples holding the recorded order and no sooner than `deliveryGuardMinimumMs`), for up
/// to `popUpRestoreBoundMs`. Only the recorded windows move; the menu stays open and usable (60/60 measured).
func popUpRestoreOrder<Window>(_ persons: [ListedWindow], appWindow: CGWindowID, system: PopUpRestoreSystem<Window>,
                               windows: () -> [ListedWindow]?, now: () -> Double, sleep: (Double) -> Void) -> PopUpRestoreRecord {
  let elements = persons.compactMap(system.element)
  let release = system.hold()
  defer { release() }
  let started = now()
  var record = PopUpRestoreRecord(windows: persons.count)
  var stable = 0
  while true {
    let holds = windows().flatMap { personOrderHolds(persons, appWindow: appWindow, in: $0) }
    if holds == true {
      stable += 1
    } else {
      stable = 0
      if holds == false {
        for element in elements.reversed() { system.raise(element) }
        record.raises += 1
      }
    }
    record.ms = now() - started
    if stable >= deliveryGuardStableSamples && record.ms >= deliveryGuardMinimumMs {
      record.complete = true
      return record
    }
    if record.ms >= popUpRestoreBoundMs {
      record.complete = holds == true
      return record
    }
    sleep(deliveryGuardSampleMs)
  }
}

/// The meta's `popUpClick` (#458, value-free): the control's role; and either why main's path was kept (`kept`), the
/// refusal (`refused: "noAction"`, a combo box whose arrow has no action), or the click delivered as the control's AXPress
/// (`delivery: "action"`, set once the action is dispatched; `arrow: true` for a combo box's arrow) with its effect,
/// whether the baseline before the press read (`baselineUnread`), the window seen to open, the restore of the person's
/// window order when the open had raised the app's window over it (`restored`), the action's AXError when it was not
/// success, the reads and the milliseconds from the action's return to the open.
struct PopUpClickRecord: Equatable {
  let role: String
  var kept: PopUpKept?
  var refused = false
  var action: String?
  var arrow = false
  var actionError: Int32?
  var baselineUnread = false
  var menuWindow: CGWindowID?
  var restored: PopUpRestoreRecord?
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
    if arrow { wire["arrow"] = true }
    if let actionError { wire["actionError"] = Int(actionError) }
    if baselineUnread { wire["baselineUnread"] = true }
    if let menuWindow { wire["menuWindow"] = Int(menuWindow) }
    if let restored { wire["restored"] = restored.wire }
    if polls > 0 { wire["polls"] = polls }
    if let ms { wire["ms"] = (ms * 1000).rounded() / 1000 }
    return wire
  }
}

/// The check just before the press, after any hold (the review of edbfbd23..75fecad2, items 5–7, and the re-review's 5
/// and 6): the control still closed (not expanded, no menu window of the app's at it), the request's deadline checked
/// after those reads (AXExpanded can take the messaging timeout), on every path out, and the list then (nil when it did
/// not read: the press goes, and cannot be confirmed): every window it holds is the effect's baseline, whatever its layer
/// or alpha, and its order is the one the restore puts back. A menu opened since the decision refuses with nothing
/// pressed.
func popUpBeforeDispatch<Element>(_ target: PopUpTarget<Element>, app: String, pids: Set<pid_t>, reads: PopUpReads<Element>,
                                  windows: () -> [ListedWindow]?, deadlinePassed: () -> Bool) throws -> [ListedWindow]? {
  let expanded = reads.expanded(target.control)
  let list = windows()
  if deadlinePassed() { throw popUpDeadlinePassed }
  if expanded == true { throw popUpOpenedSince }
  guard let list else { return nil }
  if list.contains(where: { isMenuWindow($0, pids: pids) && $0.bounds.intersects(target.near) }) { throw popUpOpenedSince }
  return list
}

/// The press's effect: a window of the app's absent from the baseline (`before`, the list just before the press) that
/// can be what it opened (`isOpenedWindow`), over or next to the control, read at once and every `popUpOpenSampleMs` for
/// up to `popUpOpenSettleMs` (a read that fails is a sample with nothing seen); otherwise, or with no baseline,
/// `clickUnconfirmed`. Seen, the person's windows that were in front of the app's window (`personWindowsAbove`) are put
/// back (`restore`, `popUpRestoreOrder`) as soon as the app's window has risen over any of them: in the list that saw the
/// open, or within `deliveryGuardMinimumMs` after it (sampled every `deliveryGuardSampleMs`); none risen, nothing moves.
/// A restore that did not complete puts its note in the meta.
func popUpAwaitOpen<Element>(_ target: PopUpTarget<Element>, before: [ListedWindow]?, app: String, appWindow: CGWindowID?,
                             pids: Set<pid_t>, ownPid: pid_t, windows: () -> [ListedWindow]?, now: () -> Double,
                             sleep: (Double) -> Void, restore: (_ persons: [ListedWindow], _ appWindow: CGWindowID) -> PopUpRestoreRecord,
                             record: inout PopUpClickRecord, meta: inout InputMeta) throws {
  guard let before else {
    record.baselineUnread = true
    throw popUpUnconfirmed(app: app, kind: target.kind)
  }
  let baseline = Set(before.map(\.number))
  let started = now()
  while true {
    record.polls += 1
    let list = windows()
    let opened = list?.first { isOpenedWindow($0, kind: target.kind, pids: pids) && !baseline.contains($0.number) && $0.bounds.intersects(target.near) }
    record.ms = now() - started
    if let list, let opened {
      record.menuWindow = opened.number
      let persons = personWindowsAbove(appWindow, in: before, pids: pids, ownPid: ownPid)
      guard let appWindow, !persons.isEmpty else { return }
      var risen = personOrderHolds(persons, appWindow: appWindow, in: list) == false
      let seen = now()
      while !risen && now() - seen < deliveryGuardMinimumMs {
        sleep(deliveryGuardSampleMs)
        risen = windows().flatMap { personOrderHolds(persons, appWindow: appWindow, in: $0) } == false
      }
      guard risen else { return }
      let restored = restore(persons, appWindow)
      record.restored = restored
      if !restored.complete { meta.note = popUpRestoreIncomplete(app: app) }
      return
    }
    let ms = record.ms ?? 0
    if ms >= popUpOpenSettleMs { break }
    sleep(min(popUpOpenSampleMs, popUpOpenSettleMs - ms))
  }
  throw popUpUnconfirmed(app: app, kind: target.kind)
}

/// #458's step in a coordinate click, after the stale-point guard kept the point (and after #454's) and before anything
/// is posted: the decision carried out. True when it carried the click (the AXPress performed and the open seen; an
/// unconfirmed one throws), so the caller posts nothing; the combo box's refusal throws with nothing sent; false leaves
/// the click to main's path, `kept`'s reason in the meta. Before the press the request's deadline is checked, then
/// `hold` runs (the press owner's forbidden check, the element click's focus hold when `route` is 3, and the stale-point
/// guard's last check after it), then `popUpBeforeDispatch`, the in-flight check and `announce` (the agent cursor's
/// click); after it, `popUpAwaitOpen` and its restore.
func popUpClick<Element>(_ decision: PopUpPoint<Element>, app: String, route: InputRoute, appWindow: CGWindowID?, pids: Set<pid_t>,
                         ownPid: pid_t = getpid(), reads: PopUpReads<Element>, windows: () -> [ListedWindow]?, now: () -> Double,
                         sleep: (Double) -> Void, deadlinePassed: () -> Bool = { false }, hold: (Element, inout InputMeta) throws -> Void,
                         checkInFlight: () throws -> Void, announce: () -> Void = {}, perform: (Element, String) -> AXError,
                         restore: (_ persons: [ListedWindow], _ appWindow: CGWindowID) -> PopUpRestoreRecord,
                         meta: inout InputMeta) throws -> Bool {
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
    let before = try popUpBeforeDispatch(target, app: app, pids: pids, reads: reads, windows: windows, deadlinePassed: deadlinePassed)
    try checkInFlight()
    announce()
    var record = PopUpClickRecord(role: target.role, action: kAXPressAction, arrow: target.kind == .comboBoxArrow)
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
    try popUpAwaitOpen(target, before: before, app: app, appWindow: appWindow, pids: pids, ownPid: ownPid, windows: windows,
                       now: now, sleep: sleep, restore: restore, record: &record, meta: &meta)
    return true
  }
}

/// #282's element route on a qualifying `<select>` (a shared-mode web page behind, review item 3): the route delivers
/// (`route`, handed the check to run just before its press, on the element it presses, and the judgment of a non-success
/// AX error from that press), and when it pressed the button the same baseline, error handling as the direct route's (a
/// messaging timeout left to the observed menu, re-review item 2), effect, unconfirmed answer and restore follow. A route
/// that pressed another control answers as #282's alone.
func popUpConfirmingRoute<Element>(_ target: PopUpTarget<Element>, app: String, appWindow: CGWindowID?, pids: Set<pid_t>,
                                   ownPid: pid_t = getpid(), reads: PopUpReads<Element>, windows: @escaping () -> [ListedWindow]?,
                                   now: () -> Double, sleep: (Double) -> Void, deadlinePassed: @escaping () -> Bool = { false },
                                   restore: (_ persons: [ListedWindow], _ appWindow: CGWindowID) -> PopUpRestoreRecord,
                                   route: (_ beforePress: (Element, inout InputMeta) throws -> Void,
                                           _ tolerates: (AXError) -> Bool, _ meta: inout InputMeta) throws -> Void,
                                   meta: inout InputMeta) throws {
  var armed: [ListedWindow]??
  var actionError: AXError?
  try route({ pressed, meta in
    guard reads.same(pressed, target.element) else { return }
    meta.popUpClick = PopUpClickRecord(role: target.role)
    armed = .some(try popUpBeforeDispatch(target, app: app, pids: pids, reads: reads, windows: windows, deadlinePassed: deadlinePassed))
  }, { error in
    guard armed != nil else { return false }
    actionError = error
    return menuItemAmbiguousErrors.contains(error)
  }, &meta)
  guard let before = armed else { return }
  var record = PopUpClickRecord(role: target.role, action: kAXPressAction)
  record.actionError = actionError?.rawValue
  defer { meta.popUpClick = record }
  try popUpAwaitOpen(target, before: before, app: app, appWindow: appWindow, pids: pids, ownPid: ownPid, windows: windows,
                     now: now, sleep: sleep, restore: restore, record: &record, meta: &meta)
}

/// The hooks #282's route runs on its press (`webAreaPress`'s `popUpPress`), set by `popUpConfirmingRoute` while that
/// route runs; none outside it: the check just before the press, and the judgment of a non-success AX error from it.
final class PopUpPressChecks {
  var check: ((AXUIElement, inout InputMeta) throws -> Void)?
  var actionError: ((AXError) -> Bool)?

  func run(_ control: AXUIElement, _ meta: inout InputMeta) throws { try check?(control, &meta) }
  func tolerates(_ error: AXError) -> Bool { actionError?(error) ?? false }
}

/// The restore over the live window list, route 3's raise and hold (the click's `restore`).
func livePopUpRestore(_ persons: [ListedWindow], _ appWindow: CGWindowID) -> PopUpRestoreRecord {
  popUpRestoreOrder(persons, appWindow: appWindow, system: .live, windows: onScreenWindowListRead, now: monotonicMilliseconds,
                    sleep: { usleep(UInt32(max(0, $0) * 1000)) })
}

/// A carried click's result: its meta, and the restore's note when it did not complete.
func popUpResult(_ meta: InputMeta) -> [String: Any] {
  var result: [String: Any] = ["meta": meta.wire]
  if let note = meta.note { result["note"] = note }
  return result
}

/// #458's unconfirmed answer: the control's AXPress was performed, and nothing of the app's was seen to open at it.
func popUpUnconfirmed(app: String, kind: PopUpControl = .popUpButton) -> EngineError {
  let carried = kind == .comboBoxArrow ? "the combo box's arrow's AXPress action" : "the pop-up button's AXPress action"
  let seen = kind == .comboBoxArrow ? "no list was seen to open at the combo box" : "no menu was seen to open at the button"
  return EngineError(name: "clickUnconfirmed",
    "The click could not be confirmed: it was carried by \(carried) in \(app), since a posted click can close the menu it opens, and \(seen). Observe the app with get_app_state before any retry, and never retry blindly.")
}

/// #458's note on an open whose restore did not complete within its bound: the open is confirmed, and the app's window
/// may lie over windows of the person's it had been behind.
func popUpRestoreIncomplete(app: String) -> String {
  "\(app)'s menu is open, but the person's windows that were in front of \(app)'s window could not all be put back in front of it, so \(app)'s window may now cover them."
}

/// #458's refusal (design ruling 979, item 3, narrowed by the restore measurement): a native combo box whose arrow has no
/// action that opens its list, the app not frontmost.
func popUpComboRefused(app: String) -> EngineError {
  EngineError(name: "backgroundClickRefused",
    "\(app)'s combo box opens its list only for a pointer click, and a click cua sends to \(app) while it is not the frontmost app does not leave that list open; neither the combo box nor its arrow has an accessibility action that opens it. Nothing was sent. Ask the person to bring \(app) to the front, or type the value into the combo box's text field instead (setValue on its element, or click its text and use typeText).")
}

/// The pop-up button opened its menu between the decision and the press (during the focus hold): pressing it would
/// close the menu, so nothing is pressed.
let popUpOpenedSince = EngineError(name: "screenChangedSinceScreenshot",
  "The screen changed since the screenshot: the pop-up button at this point now shows its menu open, and a press would close it. The button was not pressed. Take a new screenshot or call getAXState() to see the menu's items before clicking one.")

/// The request's deadline passed before the pop-up button's AXPress was sent.
let popUpDeadlinePassed = EngineError(name: "timeoutReached",
  "timeoutReached: the request's deadline passed before the pop-up button's AXPress action was sent. The button was not pressed.")
