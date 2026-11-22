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
// Which controls (the kit's shapes): AppKit's AXPopUpButton, its ancestry established outside every web page and its
// AXDOMClassList unsupported (#469, ruling 1036: a Chromium view's pop-up button, whose AXDOMClassList reads, may open a
// bubble that the press brings to the front, so it keeps main's path, `browserView`); Chrome's
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
// window has risen over the person's focused window, that one window is raised back by route 3's own repair, and the
// order is read once; no other window is raised (`popUpRestoreOrder`, design rulings 979 item 4, 1004 and 1005). Everything
// reads through closures, so the rule is unit-tested over fakes.
//
// #463 (rulings 1036 and 1039; kit `probe/463-measure`, scripts/probe-337/README.md §"#463", run 44959835166, and §"#469
// signal", run 44970638020): with the app behind the person's window, the end of route 3's fake activation closes what
// its posted click opened, and the click answers ok: AppKit's AXMenuButton pull-downs, its context menus and the colour
// well's popover 6/6 each, Chrome's page context menu 4/6, its profile and bookmark-star bubbles whenever they opened.
// Frontmost, every one stays up (5/5). So with the app not frontmost, in the cases #458 gates on and on the same
// agreement of the two signals, more clicks are carried by the element's own action, confirmed per kind within the same
// 1.5 s wait, else `clickUnconfirmed`, the focused-window restore unchanged after a confirmed open:
// - AppKit's AXMenuButton (`list style`, `document actions`): AXPress, confirmed by a new window of the app's at the control
//   at any layer (its pull-down is a layer-101 menu; `document actions` a layer-0 popover that opens 0.5–1.5 s in, so it
//   may answer unconfirmed while it opens late);
// - AppKit's AXColorWell: AXPress, confirmed the same way (its popover is a layer-0 window);
// - a right click (`contextMenuPoint`) on an AppKit element outside every page and not text: AXShowMenu, confirmed by a
//   layer-101 menu;
// - a page's `<input list>` (`datalistPoint`): the element click's route (its focus hold, then AXPress; the bare AXPress
//   opened nothing, 0/3), confirmed by Chrome's suggestion window, layer 999.
// And refused, nothing sent, in shared mode with the app not frontmost, naming the ways through (`backgroundClickRefused`,
// `popUpClick.refused`): a right click in a web page (no element action opens a page's context menu behind), a right
// click on AppKit text (AXShowMenu cannot aim at the word under the click; TextEdit's text view is one), and a
// Chromium view's own button outside every page that advertises a popup, an AXPopUpButton (the app menu, tab search, site
// information) or an AXButton whose AXHasPopup reads true (the profile button), whose AXPress opens the bubble but brings
// the app to the front over the person's window. A plain Chromium button (Back, Reload: AXHasPopup false) keeps main's
// click, and so does the bookmark star, which no attribute tells from Back. Dedicated mode keeps main's posted click for
// what shared mode refuses: nobody's window is there to cover, it lets the window come forward (#282), and nothing puts the
// order back, so the posted click left the page's context menu and the profile bubble up (3/3 each).
// An action that brings the app to the front itself is recorded and said in the answer (`popUpClick.activated`), never
// a silent ok (the review of 1a1956b2..5364c10b).

/// The wait for the button's menu or the combo box's list after its AXPress: read at once, then every 20 ms for up to
/// 1.5 s (design ruling 1004): #458's qual saw Chrome's `<select>` open about 940 ms after the click in 2 of 20 rows.
let popUpOpenSettleMs: Double = 1500
let popUpOpenSampleMs: Double = 20
/// How far from the button's frame the menu's window may lie and still be its menu: AppKit's covers the button, and
/// Chrome's `<select>` list opens against its edge (measured: (404, 154, 77×82) for a button at (416, 159, 57×19)).
let popUpMenuMargin: CGFloat = 24
/// The roles whose recorded node at a point #458 and #463 look for.
let popUpRoles: Set<String> = [kAXPopUpButtonRole, kAXComboBoxRole, kAXMenuButtonRole, kAXColorWellRole]
/// The layer of Chrome's suggestion window for a field's `<datalist>` (#463: 999, every row that opened one).
let datalistWindowLayer = 999

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
  /// Whether AXDOMClassList reads (#469): a Chromium view's does, AppKit's answers attribute-unsupported.
  var viewClass: (Element) -> PopUpViewClass
  /// AXHasPopup; nil when it does not read (#463: AppKit's buttons answer unsupported; Chrome's profile button true).
  var hasPopup: (Element) -> Bool? = { _ in nil }
  /// AXPopupValue and AXAutocompleteValue, read on a page's combo box only (#463: `<input list>` answers `listbox` and
  /// `list`, 4/4); nil when they do not read.
  var popupValue: (Element) -> String? = { _ in nil }
  var autocomplete: (Element) -> String? = { _ in nil }
}

/// What a pop-up button's AXDOMClassList read answers (#469's measurement, scripts/probe-337/README.md §"#469 signal" at
/// 4f8c58d1, run 44970638020): every Chrome view answers it, with a value (`BrowserAppMenuButton`, `LocationIconView`,
/// `TabStripFlatEdgeButton`; a page's `<select>` an empty list); every AppKit pop-up button (TextEdit, Script Editor,
/// Finder) answers −25205, attribute unsupported. Any other error (no value, cannot complete, a timeout) is neither.
enum PopUpViewClass: Equatable { case answered, unsupported, unread }

func popUpViewClass(_ error: AXError) -> PopUpViewClass {
  switch error {
  case .success: return .answered
  case .attributeUnsupported: return .unsupported
  default: return .unread
  }
}

private func popUpFrame(_ element: AXUIElement) -> CGRect? { frame(of: element) }

extension PopUpReads where Element == AXUIElement {
  static var live: PopUpReads<AXUIElement> {
    PopUpReads(role: { attribute($0, kAXRoleAttribute) as? String }, parent: { elementAttribute($0, kAXParentAttribute) },
               children: childrenRead, enabled: { (attribute($0, kAXEnabledAttribute) as? NSNumber)?.boolValue },
               actions: { establishedActionNames(of: $0) }, frame: popUpFrame,
               expanded: { (attribute($0, kAXExpandedAttribute) as? NSNumber)?.boolValue }, same: { CFEqual($0, $1) },
               viewClass: { popUpViewClass(copyAttribute($0, "AXDOMClassList").error) },
               hasPopup: { (attribute($0, "AXHasPopup") as? NSNumber)?.boolValue },
               popupValue: { attribute($0, "AXPopupValue") as? String }, autocomplete: { attribute($0, "AXAutocompleteValue") as? String })
  }
}

/// What opens a menu, list or panel of its own at a point, and so what a click there is carried by (the meta's
/// `popUpClick.kind`).
enum PopUpControl: String, Equatable {
  case popUpButton
  /// A combo box's arrow: an AXButton whose parent is the AXComboBox (TextEdit's font size, 15/15).
  case comboBoxArrow
  /// #463: AppKit's AXMenuButton (TextEdit's `list style` pull-down, its title bar's `document actions`), whose AXPress opens
  /// a menu or a popover.
  case menuButton
  /// #463: AppKit's AXColorWell (TextEdit's `text color`), whose AXPress opens its colour popover.
  case colorWell
  /// #463: the element a right click hits, AppKit's, whose AXShowMenu opens its context menu.
  case contextMenu
  /// #463: a page's `<input list>`, whose element click opens its suggestion list.
  case datalist

  /// The action the click is carried by.
  var action: String { self == .contextMenu ? kAXShowMenuAction : kAXPressAction }
}

/// How near the combo box's trailing edge its arrow's frame ends, in points.
let comboArrowEdgeSlack: CGFloat = 4

/// The control a hit names: an AXPopUpButton itself, or the AXComboBox whose arrow it is. A hit on the combo box itself
/// is its text, a text field's: none. The arrow is an AXButton child of the combo box at its trailing edge (its frame
/// ending within `comboArrowEdgeSlack` of the box's, no other button child further right); where either frame does not
/// read, only the box's one button child is. Any other child button (a clear or accessory button) keeps its own click.
/// #463: an AXMenuButton or an AXColorWell is itself the control.
func popUpControl<Element>(_ hit: Element, reads: PopUpReads<Element>) -> (control: Element, kind: PopUpControl)? {
  switch reads.role(hit) {
  case kAXPopUpButtonRole?: return (hit, .popUpButton)
  case kAXMenuButtonRole?: return (hit, .menuButton)
  case kAXColorWellRole?: return (hit, .colorWell)
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
  /// The app is frontmost, where the posted click opens the control's menu, list or panel and leaves it open: a combo
  /// box with no action of its own (#458), and #463's menu button, colour well and `<input list>` (5/5 each).
  case frontmost
  /// A pop-up button outside every web page whose AXDOMClassList reads: a Chromium or Electron view, whose AXPress may
  /// open a bubble rather than a menu (#469: Chrome's site information and tab search); kept with the app frontmost or in
  /// dedicated mode, refused in shared mode behind (#463, ruling 1039). Also a right click's element, or a menu button or
  /// colour well, in such a view (#463: delivered only for AppKit's).
  case browserView
  /// A pop-up button outside every web page whose AXDOMClassList read failed other than as unsupported, so it may be a
  /// browser view.
  case viewClassUnread
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

/// Why a click is refused with nothing sent (the meta's `popUpClick.refused`), each answering `backgroundClickRefused`,
/// the family of #282's and #458's refusals of a click an app in the background does not take.
enum PopUpRefusal: String, Equatable {
  /// #458: a native combo box whose arrow has no action, the app not frontmost.
  case noAction
  /// #463 (ruling 1039): a Chromium view's own button outside every page that advertises a popup, the app not frontmost
  /// in shared mode.
  case browserView
  /// #463: a right click in a web page, the app not frontmost in shared mode.
  case webArea
  /// #463 (the review of 1a1956b2..5364c10b, item 2): a right click on an AppKit text element, the app not frontmost in
  /// shared mode.
  case textElement

  func error(app: String) -> EngineError {
    switch self {
    case .noAction: return popUpComboRefused(app: app)
    case .browserView: return browserPopUpRefused(app: app)
    case .webArea: return webContextMenuRefused(app: app)
    case .textElement: return textContextMenuRefused(app: app)
    }
  }
}

/// #458's decision at a kept coordinate click's point.
enum PopUpPoint<Element> {
  /// No pop-up button at the point by either signal: main's path, unrecorded.
  case notPopUp
  /// A pop-up button by one signal, or one #458 does not carry: main's path, the reason in the meta.
  case kept(PopUpKept, role: String)
  case press(PopUpTarget<Element>)
  /// Refused, nothing sent (`PopUpRefusal`).
  case refuse(PopUpRefusal, role: String)
}

/// Whether #282's element route keeps a shared-mode click into a web page behind once #458 and #463 have decided: a page's
/// `<select>` press, confirmed on that route (`popUpConfirmingRoute`), and every point they do not carry. A refusal and
/// #463's other presses (a page's `<input list>`, by the element click's route) are carried by `popUpClick` instead.
func popUpLeftToWebAreaRoute<Element>(_ decision: PopUpPoint<Element>) -> Bool {
  switch decision {
  case .notPopUp, .kept: return true
  case .press(let target): return target.kind == .popUpButton
  case .refuse: return false
  }
}

/// Whether `window` is a window of the app's (`pids`) at the menu layer showing something.
func isMenuWindow(_ window: ListedWindow, pids: Set<pid_t>) -> Bool {
  pids.contains(window.owner) && window.layer == menuWindowLayer && window.alpha > 0
}

/// Whether `window` shows the control's menu or list already open: a menu window of the app's, and for a page's
/// `<input list>` its suggestion window too (#463).
func isOpenAtControl(_ window: ListedWindow, kind: PopUpControl, pids: Set<pid_t>) -> Bool {
  isMenuWindow(window, pids: pids)
    || (kind == .datalist && pids.contains(window.owner) && window.layer == datalistWindowLayer && window.alpha > 0)
}

/// Whether a window new since the press can be what it opened, a window of the app's showing something: a pop-up
/// button's menu and a context menu (#463) at the menu layer; a combo box's list at any layer (TextEdit's: a new layer-0
/// window above the document window, 20/20, run 44888938314); a menu button's menu or popover and a colour well's popover
/// at any layer (#463: `list style`'s menu at 101, `document actions`' and the colour well's popovers at 0); an `<input
/// list>`'s suggestions at `datalistWindowLayer` (#463).
func isOpenedWindow(_ window: ListedWindow, kind: PopUpControl, pids: Set<pid_t>) -> Bool {
  switch kind {
  case .popUpButton, .contextMenu: return isMenuWindow(window, pids: pids)
  case .comboBoxArrow, .menuButton, .colorWell: return pids.contains(window.owner) && window.alpha > 0
  case .datalist: return pids.contains(window.owner) && window.layer == datalistWindowLayer && window.alpha > 0
  }
}

/// Whether the observation recorded `element` at the point (#463's agreement for a right click's element and a browser
/// view's button, as `recordedPopUp`'s is for a pop-up button): the deepest recorded node there (its handle now or the
/// recorded one), one of its recorded ancestors, or the recorded control beneath it (`underlying`).
func recordedHolds<Element>(_ verdict: StalePointVerdict<Element>, same: @escaping (Element, Element) -> Bool) -> (Element) -> Bool {
  var held: [Element] = []
  if let node = verdict.node {
    held.append(node.element)
    if let current = verdict.current { held.append(current) }
    var index = node.ancestor
    while let at = index, at < verdict.nodes.count, held.count < stalePointAncestorLevels {
      held.append(verdict.nodes[at].element)
      index = verdict.nodes[at].ancestor
    }
  }
  if let control = verdict.underlying { held.append(control.element) }
  return { element in held.contains { same($0, element) } }
}

/// Whether the deepest recorded node at the point is an AXWebArea or lies in one by the record (#463: a page point whose
/// hit-test answers a coarse view that walks to the window, before Chrome's page tree is exposed, #288).
func recordedNodeInWebArea<Element>(_ verdict: StalePointVerdict<Element>) -> Bool {
  guard let node = verdict.node else { return false }
  // The record's own web area (`ScreenshotNode.webArea`), which a frameless web area's descendants carry too.
  if node.role == "AXWebArea" || node.webArea != nil { return true }
  var index = node.ancestor
  var levels = 0
  while let at = index, at < verdict.nodes.count, levels < stalePointAncestorLevels {
    if verdict.nodes[at].role == "AXWebArea" { return true }
    (index, levels) = (verdict.nodes[at].ancestor, levels + 1)
  }
  return false
}

/// #458's decision (design ruling 977): `hit` is what the app's hit-test answered at the point (`WindowHit.answered` of
/// the hit-test the guard judged; nil when it answered nothing or late), `recorded` what the observation recorded there
/// (`recordedPopUp`). The window list (`windows`, nil when it did not read) is read only once both name the same control,
/// placed, enabled and not expanded, and `frontmost` only for a combo box whose arrow has no action.
///
/// #463: `frontmost` (the app's or the hit's process frontmost) is read too for a menu button, a colour well and a page's
/// `<input list>`, carried only with the app behind (`datalistPoint`), and for a Chromium view's popup button, refused
/// only then and only in shared mode (`shared`; `browserButtonPoint` for one whose role is AXButton, its agreement with
/// the record by `recordedAt`).
func popUpPoint<Element>(hit: Element?, recorded: RecordedPopUp<Element>?, point: CGPoint, pids: Set<pid_t>,
                         reads: PopUpReads<Element>, shared: Bool = true, recordedAt: (Element) -> Bool = { _ in false },
                         frontmost: () -> Bool, windows: () -> [ListedWindow]?) -> PopUpPoint<Element> {
  // An item of an open menu is #454's, whatever pop-up button the record holds above it.
  if let hit, reads.role(hit) == kAXMenuItemRole { return .notPopUp }
  guard let hit, let (control, kind) = popUpControl(hit, reads: reads) else {
    if let hit, let refused = browserButtonPoint(hit, reads: reads, shared: shared, recordedAt: recordedAt, frontmost: frontmost) {
      return refused
    }
    guard let recorded else { return .notPopUp }
    guard let hit else { return .kept(.noSignal, role: recorded.role) }
    // The recorded combo box itself, hit on its text: a click into a text field, main's; a page's `<input list>` behind is
    // its element click (#463).
    if reads.same(hit, recorded.element) {
      guard recorded.role == kAXComboBoxRole else { return .notPopUp }
      return datalistPoint(hit, recorded: recorded, point: point, pids: pids, reads: reads, frontmost: frontmost, windows: windows)
    }
    return .kept(.notHit, role: recorded.role)
  }
  let role = reads.role(control) ?? ""
  guard let recorded, reads.same(recorded.element, control) else { return .kept(.notRecorded, role: role) }
  switch popUpPlace(control, reads: reads, recorded: recorded) {
  case .unknown: return .kept(.ancestryUnread, role: role)
  case .web:
    // Chrome's `<select>`, its options recorded under it; a page's ARIA pop-up button or combo box is the page's own,
    // and so is a page's menu button or colour well (#282's).
    guard kind == .popUpButton, recorded.holdsOption else { return .notPopUp }
  case .native:
    // #469 (ruling 1036): outside a page, only AppKit's pop-up button is pressed, the one whose AXDOMClassList is
    // unsupported; a Chromium view's (Chrome's toolbar: site information and tab search open a bubble, which the press
    // brings to the front over the person's window) keeps main's posted click, its app menu included, with the app
    // frontmost or in dedicated mode; in shared mode behind it is refused (#463, ruling 1039: the posted click's menu or
    // bubble is closed by route 3's release). #463's menu button and colour well are AppKit's alone the same way.
    if kind != .comboBoxArrow {
      switch reads.viewClass(control) {
      case .unsupported: break
      case .answered:
        guard kind == .popUpButton, shared, !frontmost() else { return .kept(.browserView, role: role) }
        return .refuse(.browserView, role: role)
      case .unread: return .kept(.viewClassUnread, role: role)
      }
    }
  }
  // #463: AppKit's menu button or colour well with the app frontmost: its posted click opens it and leaves it open (5/5).
  if kind == .menuButton || kind == .colorWell, frontmost() { return .kept(.frontmost, role: role) }
  guard reads.enabled(control) == true else { return .kept(.disabled, role: role) }
  guard reads.expanded(control) != true else { return .kept(.open, role: role) }
  let near = (reads.frame(control) ?? CGRect(origin: point, size: .zero)).insetBy(dx: -popUpMenuMargin, dy: -popUpMenuMargin)
  guard let list = windows() else { return .kept(.windowsUnread, role: role) }
  guard !list.contains(where: { isMenuWindow($0, pids: pids) && $0.bounds.intersects(near) }) else { return .kept(.open, role: role) }
  // The pop-up button's own AXPress; the combo box's arrow's (TextEdit's "font size" button: AXPress, 20/20 opened).
  let pressed = kind == .comboBoxArrow ? hit : control
  // The arrow reads enabled itself too (review of 97344ee7..a094f620, item 6); a disabled one keeps main's path.
  guard kind == .popUpButton || reads.enabled(pressed) == true else { return .kept(.disabled, role: role) }
  guard let actions = reads.actions(pressed) else { return .kept(.noAction, role: role) }
  if actions.contains(kAXPressAction) {
    return .press(PopUpTarget(element: pressed, control: control, kind: kind, role: role, near: near, before: list))
  }
  guard kind == .comboBoxArrow else { return .kept(.noAction, role: role) }
  return frontmost() ? .kept(.frontmost, role: role) : .refuse(.noAction, role: role)
}

/// #463 (ruling 1039): a Chromium view's own AXButton outside every page that advertises a popup (AXHasPopup true: Chrome's
/// profile button, `AvatarToolbarButton`, 4/4), the app not frontmost in shared mode, the hit recorded at the point: its
/// posted click's bubble is closed by route 3's release, and its AXPress opens it but brings the app to the front (5/5),
/// so it is refused. Nil (main's click, unrecorded) for anything else: AppKit's buttons (AXDOMClassList unsupported, the
/// one read most of them cost), a plain Chromium button (Back, Reload, New Tab: AXHasPopup false), and the bookmark star
/// (`PageActionView`, AXHasPopup false), which no attribute measured tells from Back.
func browserButtonPoint<Element>(_ hit: Element, reads: PopUpReads<Element>, shared: Bool, recordedAt: (Element) -> Bool,
                                 frontmost: () -> Bool) -> PopUpPoint<Element>? {
  guard shared, reads.role(hit) == kAXButtonRole, recordedAt(hit), !frontmost(), reads.viewClass(hit) == .answered,
        reads.hasPopup(hit) == true, webAreaWalk(hit, role: reads.role, parent: reads.parent) == .outside else { return nil }
  return .refuse(.browserView, role: kAXButtonRole)
}

/// #463: a page's `<input list>` (Chrome: an AXComboBox in the page whose AXPopupValue reads `listbox` and
/// AXAutocompleteValue `list`, 4/4; nothing else is read unless both hold), hit on itself and recorded there, with the app
/// not frontmost: carried by the element click's route (its focus hold when the app does not believe it has focus, then
/// AXPress, `popUpClick`), which opened its suggestions 5/5 where #282's focus route only placed the caret and the bare
/// AXPress opened nothing (0/3); confirmed by its suggestion window. Main's path for any other field, so a text field's
/// click keeps #283's caret placement; frontmost, the posted click opens the list (5/5): kept.
func datalistPoint<Element>(_ field: Element, recorded: RecordedPopUp<Element>, point: CGPoint, pids: Set<pid_t>,
                            reads: PopUpReads<Element>, frontmost: () -> Bool, windows: () -> [ListedWindow]?) -> PopUpPoint<Element> {
  // The live hit's role as well as the recorded one (the review of 1a1956b2..5364c10b, item 4).
  guard reads.role(field) == kAXComboBoxRole, reads.popupValue(field) == "listbox", reads.autocomplete(field) == "list",
        popUpPlace(field, reads: reads, recorded: recorded) == .web else { return .notPopUp }
  let role = kAXComboBoxRole
  guard !frontmost() else { return .kept(.frontmost, role: role) }
  guard reads.enabled(field) == true else { return .kept(.disabled, role: role) }
  guard reads.expanded(field) != true else { return .kept(.open, role: role) }
  let near = (reads.frame(field) ?? CGRect(origin: point, size: .zero)).insetBy(dx: -popUpMenuMargin, dy: -popUpMenuMargin)
  guard let list = windows() else { return .kept(.windowsUnread, role: role) }
  guard !list.contains(where: { isOpenAtControl($0, kind: .datalist, pids: pids) && $0.bounds.intersects(near) }) else {
    return .kept(.open, role: role)
  }
  guard reads.actions(field)?.contains(kAXPressAction) == true else { return .kept(.noAction, role: role) }
  return .press(PopUpTarget(element: field, control: field, kind: .datalist, role: role, near: near, before: list))
}

/// The roles whose context menu acts on the text under the click (the review of 1a1956b2..5364c10b, item 2): text entry
/// (#283's editable roles) and static text, whose selectable labels offer the same menu.
let contextMenuTextRoles: Set<String> = webAreaEditableRoles.union([kAXStaticTextRole])

/// #463: a right click (`mouse_button: right`, one click) at a kept point, the app not frontmost (frontmost, its posted
/// right click's context menu stays up, 5/5: main's path, nothing read). In a web page by the hit's walk or the record
/// (`recordedInWebArea`): refused in shared mode, since no element action opens a page's context menu behind (the engine's
/// Show Menu and the kit's AXShowMenu 0/8 on Chrome's page) and the posted one closes it (4/6); dedicated mode keeps the
/// posted right click, which left the page's menu up (3/3). The record's web area decides first, with or without a live
/// hit (the review of 1a1956b2..5364c10b, item 3), so a late or missing hit never posts it. Outside every page, on an
/// AppKit element (AXDOMClassList unsupported) that the observation recorded at the point and that advertises
/// AXShowMenu: carried by its AXShowMenu, confirmed by a menu window of the app's at the element. Except on text (item
/// 2): AXShowMenu takes the element and not the point, and a text element's context menu acts on the word or selection
/// under the click, so the menu it opens may be for other text; a right click there (`contextMenuTextRoles`) is refused
/// in shared mode (`textElement`; TextEdit's text view, where the posted one's menu closed 6/6), and dedicated mode keeps
/// the posted one. Signals that disagree, a Chromium view's element, an ancestry or window list that does not read, and
/// an element with no AXShowMenu keep main's path, said in `popUpClick.kept`.
func contextMenuPoint<Element>(hit: Element?, recordedAt: (Element) -> Bool, recordedInWebArea: Bool, point: CGPoint, pids: Set<pid_t>,
                               reads: PopUpReads<Element>, shared: Bool, frontmost: () -> Bool,
                               windows: () -> [ListedWindow]?) -> PopUpPoint<Element> {
  guard !frontmost() else { return .notPopUp }
  if recordedInWebArea { return shared ? .refuse(.webArea, role: hit.flatMap(reads.role) ?? "AXWebArea") : .notPopUp }
  guard let hit else { return .notPopUp }
  let role = reads.role(hit) ?? ""
  let walk = webAreaWalk(hit, role: reads.role, parent: reads.parent)
  if walk == .inside || walk == .aboveWebArea { return shared ? .refuse(.webArea, role: role) : .notPopUp }
  guard walk == .outside else { return .kept(.ancestryUnread, role: role) }
  switch reads.viewClass(hit) {
  case .unsupported: break
  case .answered: return .kept(.browserView, role: role)
  case .unread: return .kept(.viewClassUnread, role: role)
  }
  if contextMenuTextRoles.contains(role) { return shared ? .refuse(.textElement, role: role) : .notPopUp }
  guard recordedAt(hit) else { return .kept(.notRecorded, role: role) }
  guard reads.actions(hit)?.contains(kAXShowMenuAction) == true else { return .kept(.noAction, role: role) }
  let near = (reads.frame(hit) ?? CGRect(origin: point, size: .zero)).insetBy(dx: -popUpMenuMargin, dy: -popUpMenuMargin)
  guard let list = windows() else { return .kept(.windowsUnread, role: role) }
  guard !list.contains(where: { isMenuWindow($0, pids: pids) && $0.bounds.intersects(near) }) else { return .kept(.open, role: role) }
  return .press(PopUpTarget(element: hit, control: hit, kind: .contextMenu, role: role, near: near, before: list))
}

/// The person's windows in front of the app's window (`appWindow`), front to back: layer 0, showing something, of another
/// process than the app's, never the engine's own (`ownPid`, the agent cursor's panel). Empty when the app's window is
/// not listed.
func personWindowsAbove(_ appWindow: CGWindowID?, in list: [ListedWindow], pids: Set<pid_t>, ownPid: pid_t) -> [ListedWindow] {
  guard let appWindow, let index = list.firstIndex(where: { $0.number == appWindow }) else { return [] }
  return list[..<index].filter { $0.layer == 0 && $0.alpha > 0 && !pids.contains($0.owner) && $0.owner != ownPid }
}

/// Whether the app's window has crossed above any recorded window of the person's (all of them in front of it before the
/// press): what starts a restore (the review of 97344ee7..a094f620, item 4). The person's windows reordered among
/// themselves are not a crossing. Nil when the app's window is not listed.
func appWindowCrossed(_ persons: [ListedWindow], appWindow: CGWindowID, in list: [ListedWindow]) -> Bool? {
  guard let app = list.firstIndex(where: { $0.number == appWindow }) else { return nil }
  return persons.contains { person in list.firstIndex(where: { $0.number == person.number }).map { $0 > app } ?? false }
}

/// The restore's bound: an absolute cutoff from the restore's start, covering the windows' resolution, the raises, the
/// read after them and the hold, whose release a timer of its own makes whatever blocks (route 3's
/// `scheduleHoldRelease`); no AX call is made past it.
let popUpRestoreBoundMs: Double = 500
/// How long after its first raise the restore reads the order back, once (design ruling 1004): #458's qual saw AXRaises
/// land 30–150 ms late, so a read sooner catches them in flight.
let popUpRestoreReadMs: Double = 300

/// The person's input and the frontmost app, as route 3's delivery guard reads them (`ActivationSystem.secondsSinceInput`
/// and `frontmost`): from the press's dispatch on, input of the person's or another app brought to the front stops the
/// watch for the app's window's rise and any further raise (the review of 97344ee7..a094f620, item 1).
struct PopUpPersonSignals {
  var secondsSinceInput: () -> Double
  var frontmost: () -> pid_t?

  static var live: PopUpPersonSignals {
    let system = ActivationSystem()
    return PopUpPersonSignals(secondsSinceInput: system.secondsSinceInput, frontmost: system.frontmost)
  }

  /// From `at` on (`now`'s clock): whether the person has given input since, or the frontmost app is no longer the one
  /// read now.
  func since(_ at: Double, now: @escaping () -> Double) -> () -> Bool {
    let front = frontmost()
    return { self.secondsSinceInput() * 1000 < now() - at || self.frontmost() != front }
  }

  /// From `at` on (the review of 1a1956b2..5364c10b, item 1): whether the target app itself (`pids`) has become the
  /// frontmost app with no input of the person's since, so the action it was sent activated it (an app's own action may;
  /// Chrome's toolbar AXPress did, #463), as against the person switching apps, which `since` also reads.
  func activated(since at: Double, pids: Set<pid_t>, now: @escaping () -> Double) -> () -> Bool {
    let front = frontmost()
    return {
      guard let current = self.frontmost(), current != front, pids.contains(current) else { return false }
      return self.secondsSinceInput() * 1000 > now() - at  // input at the press itself counts as the person's
    }
  }
}

/// What the restore reads and does outside its own state (the unit tests' seams; `.live` over the Accessibility API and
/// route 3's screen-update hold): the person's frontmost app (route 3's `frontmost`) and its focused window's own number
/// (`focusedWindowNumber`: AXFocusedWindow numbered by the SPI alone, nil when it does not prove it), the windows'
/// elements, resolved together within what is left of the cutoff (`resolve`, keyed by window number; a window it cannot
/// prove is absent), route 3's repair call (AXRaise, `gatedPerform`, answering whether it succeeded), the hold, which
/// answers its release, and the timer that releases it on its own (`ActivationSystem.scheduleHoldRelease`).
struct PopUpRestoreSystem<Window> {
  var frontmost: () -> pid_t?
  var focusedWindow: (pid_t) -> CGWindowID?
  var resolve: (_ persons: [ListedWindow], _ left: () -> Double) -> [CGWindowID: Window]
  var raise: (Window) -> Bool
  var hold: () -> () -> Void
  var scheduleRelease: (Double, @escaping @Sendable () -> Void) -> Void = { _, _ in }
}

extension PopUpRestoreSystem where Window == AXUIElement {
  static var live: PopUpRestoreSystem<AXUIElement> {
    let system = ActivationSystem()
    return PopUpRestoreSystem(frontmost: system.frontmost, focusedWindow: { pid in
      focusedWindowNumber(elementAttribute(prepare(AXUIElementCreateApplication(pid)), kAXFocusedWindowAttribute), number: axWindowNumber)
    }, resolve: { persons, left in
      resolveByNumber(persons, left: left, windowsOf: { attribute(prepare(AXUIElementCreateApplication($0)), kAXWindowsAttribute) as? [AXUIElement] },
                      number: axWindowNumber)
    }, raise: { gatedPerform($0, kAXRaiseAction) == .success }, hold: { system.holdScreenUpdates(ReenableStamp()) },
       scheduleRelease: system.scheduleHoldRelease)
  }
}

/// The person's focused window's own number (the review of 7e5bb454..67cf8b26, item 2): their app's AXFocusedWindow,
/// numbered by the SPI alone (`axWindowNumber`), never by a window of the same size; nil when either is missing.
func focusedWindowNumber<Window>(_ focused: Window?, number: (Window) -> CGWindowID?) -> CGWindowID? {
  focused.flatMap(number)
}

/// The person's windows' elements by their own window numbers alone (the re-reviews of 97344ee7..a094f620, item 3, and
/// of a094f620..1612abe2, items 1 and 2): one AXWindows scan per process, each window's number read by the SPI
/// (`axWindowNumber`) and no frame, stopping once the process's recorded windows are all found, and no read once the
/// cutoff (`left`) is spent. A window whose number no AXWindow proves is absent: never raised, never guessed by its size.
func resolveByNumber<Window>(_ persons: [ListedWindow], left: () -> Double, windowsOf: (pid_t) -> [Window]?,
                             number: (Window) -> CGWindowID?) -> [CGWindowID: Window] {
  var found: [CGWindowID: Window] = [:]
  var owners: [pid_t] = []
  for person in persons where !owners.contains(person.owner) { owners.append(person.owner) }
  for owner in owners {
    var wanted = Set(persons.filter { $0.owner == owner }.map(\.number))
    guard left() > 0 else { break }
    guard let windows = windowsOf(owner) else { continue }
    for window in windows {
      guard !wanted.isEmpty, left() > 0 else { break }
      if let id = number(window), wanted.remove(id) != nil { found[id] = window }
    }
  }
  return found
}

/// Why a restore did not bring the person's focused window back over the app's (the meta's `restored.stopped`): the
/// person's input or another app brought to the front since the press (`personInput`; their own act is never undone,
/// and no note blames cua), the bound spent (`bound`), the focused window's element not found by its number
/// (`unresolved`), the focused window's number not proven (`focusUnknown`), its raise answering an AX error
/// (`focusRaiseFailed`), or the window list not read, so whether it is covered is unknown (`orderUnread`).
enum PopUpRestoreStop: String, Equatable { case personInput, bound, unresolved, focusUnknown, focusRaiseFailed, orderUnread }

/// The meta's `popUpClick.restored`: how many of the person's windows were in front of the app's before the press, the
/// milliseconds from the restore's start to its read, whether the person's focused window is back over the app's
/// (`complete`), how many AXRaises it made (one at most: the focused window's) and how many answered an error, how many
/// of the other recorded windows the app's window covers at the end, never raised (`leftCovered`), and why it did not
/// complete when it stopped short.
struct PopUpRestoreRecord: Equatable {
  let windows: Int
  var ms: Double = 0
  var complete = false
  var raises = 0
  var failedRaises = 0
  var leftCovered = 0
  var stopped: PopUpRestoreStop?

  var wire: [String: Any] {
    var wire: [String: Any] = ["windows": windows, "ms": (ms * 1000).rounded() / 1000, "complete": complete, "raises": raises,
                               "leftCovered": leftCovered]
    if failedRaises > 0 { wire["failedRaises"] = failedRaises }
    if let stopped { wire["stopped"] = stopped.rawValue }
    return wire
  }
}

/// Whether `list` shows `window` behind the app's window (`appWindow`); nil when either is not listed.
func covered(_ window: CGWindowID, by appWindow: CGWindowID, in list: [ListedWindow]) -> Bool? {
  guard let app = list.firstIndex(where: { $0.number == appWindow }), let at = list.firstIndex(where: { $0.number == window })
  else { return nil }
  return at > app
}

/// #458's restore (design ruling 1005, after rulings 979 item 4 and 1004): route 3's own repair, and only it. When the
/// app's window has crossed above the person's focused window (their frontmost app's AXFocusedWindow, numbered by the SPI
/// alone), that one window is raised once by AXRaise (`gatedPerform`, its AX result read) inside the screen-update hold,
/// and about `popUpRestoreReadMs` later the order is read once: `complete` when the focused window is back over the app's.
/// No other window is ever raised, neither the person's other windows nor a third app's: the full-order pass raised them
/// back to front and moved the person's focus to another window for 13–49 ms in 38/80 and 13/30 rows (#458's qual 2,
/// README §"#458 qual 2" at 5246652f), so they are counted as left covered (`leftCovered`) instead. A focused window the
/// app's window did not cover is not raised. The person's input or another frontmost app (`intervened`) stops it with
/// nothing raised, checked before anything is read and just before the raise; an absolute cutoff of
/// `popUpRestoreBoundMs` covers everything, the hold's release timed no later than route 3's ceiling
/// (`activationPointHoldCeilingMs`), and an end past it is `bound`, never complete. The hard bar, the person's focused
/// window never changes, holds by construction: only that window is raised.
func popUpRestoreOrder<Window>(_ persons: [ListedWindow], appWindow: CGWindowID, system: PopUpRestoreSystem<Window>,
                               windows: () -> [ListedWindow]?, now: () -> Double, sleep: (Double) -> Void,
                               intervened: () -> Bool = { false }) -> PopUpRestoreRecord {
  let started = now()
  let cutoff = started + popUpRestoreBoundMs
  var record = PopUpRestoreRecord(windows: persons.count)
  func left() -> Double { cutoff - now() }
  func ended(_ stop: PopUpRestoreStop?, complete: Bool = false) -> PopUpRestoreRecord {
    record.ms = now() - started
    record.stopped = stop
    record.complete = complete
    return record
  }
  /// The recorded windows other than `focused` that `list` shows under the app's window.
  func othersCovered(_ focused: CGWindowID?, in list: [ListedWindow]) -> Int {
    persons.filter { $0.number != focused && covered($0.number, by: appWindow, in: list) == true }.count
  }
  if intervened() { return ended(.personInput) }
  guard let front = system.frontmost() else { return ended(.focusUnknown) }
  if intervened() { return ended(.personInput) }
  guard left() > 0 else { return ended(.bound) }
  guard let focused = system.focusedWindow(front) else { return ended(.focusUnknown) }
  guard let list = windows() else { return ended(.orderUnread) }
  record.leftCovered = othersCovered(focused, in: list)
  // The trigger: the app's window over the person's focused window, which was in front of it before the press.
  guard let focusedWindow = persons.first(where: { $0.number == focused }), covered(focused, by: appWindow, in: list) == true else {
    return ended(nil, complete: true)
  }
  guard left() > 0 else { return ended(.bound) }
  guard let element = system.resolve([focusedWindow], left)[focused] else { return ended(.unresolved) }
  if intervened() { return ended(.personInput) }
  guard left() > 0 else { return ended(.bound) }
  let release = OnceRelease(system.hold())
  system.scheduleRelease(min(left(), activationPointHoldCeilingMs)) { release() }
  defer { release() }
  let raisedAt = now()
  let raised = system.raise(element)
  record.raises = 1
  guard raised else {
    record.failedRaises = 1
    return ended(.focusRaiseFailed)
  }
  guard left() > 0 else { return ended(.bound) }
  // One read, about `popUpRestoreReadMs` after the raise and inside the cutoff, checked before and after.
  let wait = min(raisedAt + popUpRestoreReadMs, cutoff - deliveryGuardSampleMs) - now()
  if wait > 0 { sleep(wait) }
  if intervened() { return ended(.personInput) }
  guard left() > 0 else { return ended(.bound) }
  let final = windows()
  guard left() > 0 else { return ended(.bound) }
  guard let final else { return ended(.orderUnread) }
  record.leftCovered = othersCovered(focused, in: final)
  return ended(nil, complete: covered(focused, by: appWindow, in: final) == false)
}
/// The meta's `popUpClick` (#458, value-free): the control's role; and either why main's path was kept (`kept`), the
/// refusal (`refused`: `noAction`, a combo box whose arrow has no action; #463's `browserView` and `webArea`), or the click
/// delivered as the control's action (`delivery: "action"`, set once the action is dispatched; `kind` what it was carried
/// as, #463, and `action` the action, AXPress or a right click's AXShowMenu; `arrow: true` for a combo box's arrow) with its effect,
/// whether the baseline before the press read (`baselineUnread`), the window seen to open, the restore of the person's
/// window order when the open had raised the app's window over it (`restored`), the action's AXError when it was not
/// success, the reads and the milliseconds from the action's return to the open.
struct PopUpClickRecord: Equatable {
  let role: String
  var kept: PopUpKept?
  var refused: PopUpRefusal?
  var action: String?
  var arrow = false
  var kind: PopUpControl?
  /// The target app became frontmost through the action itself (the review of 1a1956b2..5364c10b, item 1).
  var activated = false
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
    if let refused { wire["refused"] = refused.rawValue }
    if let kind { wire["kind"] = kind.rawValue }
    if activated { wire["activated"] = true }
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
  if deadlinePassed() { throw popUpDeadlinePassed(target.kind) }
  if expanded == true { throw popUpOpenedSince(target.kind) }
  guard let list else { return nil }
  if list.contains(where: { isOpenAtControl($0, kind: target.kind, pids: pids) && $0.bounds.intersects(target.near) }) {
    throw popUpOpenedSince(target.kind)
  }
  return list
}

/// Whether a window new since the press, in `list`, is what the press opened: over or next to the control, of a kind it
/// can open (`isOpenedWindow`); for a combo box's list also on the measured signals (the review of 97344ee7..a094f620,
/// item 5): above the app's window (the document window; not confirmed when that is not listed), and the combo box not
/// reading AXExpanded false (`expanded`, read only then).
func popUpOpened<Element>(_ window: ListedWindow, target: PopUpTarget<Element>, appWindow: CGWindowID?, list: [ListedWindow],
                          baseline: Set<CGWindowID>, pids: Set<pid_t>, expanded: () -> Bool?) -> Bool {
  guard isOpenedWindow(window, kind: target.kind, pids: pids), !baseline.contains(window.number), window.bounds.intersects(target.near)
  else { return false }
  guard target.kind == .comboBoxArrow else { return true }
  guard let appWindow, let app = list.firstIndex(where: { $0.number == appWindow }),
        let at = list.firstIndex(where: { $0.number == window.number }), at < app else { return false }
  return expanded() != false
}

/// The press's effect: a window new since the baseline (`before`, the list just before the press) that is what it
/// opened (`popUpOpened`), read at once and every `popUpOpenSampleMs` for up to `popUpOpenSettleMs` (a read that fails is
/// a sample with nothing seen); otherwise, or with no baseline, `clickUnconfirmed`. Seen, the restore (`restore`,
/// `popUpRestoreOrder`: the person's focused window raised back over the app's, if the app's covers it; the other
/// windows recorded in front of the app's, `personWindowsAbove`, counted) runs as soon as the app's
/// window has crossed above any of them (`appWindowCrossed`): in the list that saw the open, or within
/// `deliveryGuardMinimumMs` after it (sampled every `deliveryGuardSampleMs`); none crossed, nothing moves. The person's
/// input or another frontmost app since the press (`intervened`) ends the watch and is handed to the restore. A restore
/// that ended short for any other reason puts its note in the meta.
///
/// The target app made frontmost by the action itself (`activated`, `PopUpPersonSignals.activated`) is not the person's
/// input: it is recorded (`popUpClick.activated`) and said in the answer, never a silent ok. A confirmed open answers
/// success with a note that the app came to the front over the person's window (`popUpActivatedNote`), since what the
/// click was for did open and a retry would only repeat the activation; nothing is restored, since cua never takes the
/// front from an app. An unconfirmed one says it in its `clickUnconfirmed` sentence.
func popUpAwaitOpen<Element>(_ target: PopUpTarget<Element>, before: [ListedWindow]?, app: String, appWindow: CGWindowID?,
                             pids: Set<pid_t>, ownPid: pid_t, reads: PopUpReads<Element>, windows: () -> [ListedWindow]?,
                             now: () -> Double, sleep: (Double) -> Void, intervened: @escaping () -> Bool,
                             activated: () -> Bool = { false },
                             restore: (_ persons: [ListedWindow], _ appWindow: CGWindowID, _ intervened: () -> Bool) -> PopUpRestoreRecord,
                             record: inout PopUpClickRecord, meta: inout InputMeta) throws {
  func unconfirmed() -> EngineError {
    record.activated = activated()
    return popUpUnconfirmed(app: app, kind: target.kind, activated: record.activated)
  }
  guard let before else {
    record.baselineUnread = true
    throw unconfirmed()
  }
  let baseline = Set(before.map(\.number))
  let started = now()
  while true {
    record.polls += 1
    let list = windows()
    let opened = list.flatMap { list in
      list.first { popUpOpened($0, target: target, appWindow: appWindow, list: list, baseline: baseline, pids: pids,
                               expanded: { reads.expanded(target.control) }) }
    }
    record.ms = now() - started
    if let list, let opened {
      record.menuWindow = opened.number
      var noted = false
      func activatedNow() -> Bool {
        guard !noted, activated() else { return noted }
        (noted, record.activated) = (true, true)
        meta.note = popUpActivatedNote(app: app, kind: target.kind)
        return true
      }
      defer { _ = activatedNow() }
      let persons = personWindowsAbove(appWindow, in: before, pids: pids, ownPid: ownPid)
      guard let appWindow, !persons.isEmpty else { return }
      var crossed = appWindowCrossed(persons, appWindow: appWindow, in: list) == true
      let seen = now()
      while !crossed && !intervened() && now() - seen < deliveryGuardMinimumMs {
        sleep(deliveryGuardSampleMs)
        crossed = windows().flatMap { appWindowCrossed(persons, appWindow: appWindow, in: $0) } == true
      }
      guard crossed, !activatedNow() else { return }
      let restored = restore(persons, appWindow, intervened)
      record.restored = restored
      if !restored.complete && restored.stopped != .personInput { meta.note = popUpRestoreIncomplete(app: app, kind: target.kind) }
      return
    }
    let ms = record.ms ?? 0
    if ms >= popUpOpenSettleMs { break }
    sleep(min(popUpOpenSampleMs, popUpOpenSettleMs - ms))
  }
  throw unconfirmed()
}

/// #458's step in a coordinate click, after the stale-point guard kept the point (and after #454's) and before anything
/// is posted: the decision carried out. True when it carried the click (the control's action performed, AXPress or #463's
/// AXShowMenu, and the open seen; an unconfirmed one throws), so the caller posts nothing; a refusal throws with nothing
/// sent; false leaves
/// the click to main's path, `kept`'s reason in the meta. Before the press the request's deadline is checked, then
/// `hold` runs (the press owner's forbidden check, the element click's focus hold when `route` is 3, and the stale-point
/// guard's last check after it), then `popUpBeforeDispatch`, the in-flight check and `announce` (the agent cursor's
/// click); at the dispatch the person's baseline (`person`), and after it `popUpAwaitOpen` and its restore.
func popUpClick<Element>(_ decision: PopUpPoint<Element>, app: String, route: InputRoute, appWindow: CGWindowID?, pids: Set<pid_t>,
                         ownPid: pid_t = getpid(), reads: PopUpReads<Element>, windows: () -> [ListedWindow]?,
                         now: @escaping () -> Double, sleep: (Double) -> Void, deadlinePassed: () -> Bool = { false },
                         person: PopUpPersonSignals = PopUpPersonSignals(secondsSinceInput: { .infinity }, frontmost: { nil }),
                         hold: (Element, inout InputMeta) throws -> Void, checkInFlight: () throws -> Void, announce: () -> Void = {},
                         perform: (Element, String) -> AXError,
                         restore: (_ persons: [ListedWindow], _ appWindow: CGWindowID, _ intervened: () -> Bool) -> PopUpRestoreRecord,
                         meta: inout InputMeta) throws -> Bool {
  switch decision {
  case .notPopUp: return false
  case .kept(let why, let role):
    meta.popUpClick = PopUpClickRecord(role: role, kept: why)
    return false
  case .refuse(let why, let role):
    meta.popUpClick = PopUpClickRecord(role: role, refused: why)
    throw why.error(app: app)
  case .press(let target):
    meta.inputRoute = route
    meta.popUpClick = PopUpClickRecord(role: target.role)
    if deadlinePassed() { throw popUpDeadlinePassed(target.kind) }
    try hold(target.element, &meta)
    let before = try popUpBeforeDispatch(target, app: app, pids: pids, reads: reads, windows: windows, deadlinePassed: deadlinePassed)
    try checkInFlight()
    announce()
    let action = target.kind.action
    var record = PopUpClickRecord(role: target.role, action: action, arrow: target.kind == .comboBoxArrow, kind: target.kind)
    defer { meta.popUpClick = record }
    let intervened = person.since(now(), now: now)
    let activated = person.activated(since: now(), pids: pids, now: now)
    var error = AXError.failure
    meta.posting { error = perform(target.element, action); return true }
    if error != .success {
      record.actionError = error.rawValue
      // A messaging timeout may still have opened the menu (#454's ambiguous errors): the effect decides.
      guard menuItemAmbiguousErrors.contains(error) else {
        throw EngineError(name: "actionFailed", "The element did not accept the \(action) action.")
      }
    }
    try popUpAwaitOpen(target, before: before, app: app, appWindow: appWindow, pids: pids, ownPid: ownPid, reads: reads, windows: windows,
                       now: now, sleep: sleep, intervened: intervened, activated: activated, restore: restore, record: &record, meta: &meta)
    return true
  }
}

/// #282's element route on a qualifying `<select>` (a shared-mode web page behind, review item 3): the route delivers
/// (`route`, handed the check to run just before its press, on the element it presses, and the judgment of a non-success
/// AX error from that press), and when it pressed the button the same baseline, error handling as the direct route's (a
/// messaging timeout left to the observed menu, re-review item 2), person baseline, effect, unconfirmed answer and
/// restore follow. A route that pressed another control answers as #282's alone.
func popUpConfirmingRoute<Element>(_ target: PopUpTarget<Element>, app: String, appWindow: CGWindowID?, pids: Set<pid_t>,
                                   ownPid: pid_t = getpid(), reads: PopUpReads<Element>, windows: @escaping () -> [ListedWindow]?,
                                   now: @escaping () -> Double, sleep: (Double) -> Void, deadlinePassed: @escaping () -> Bool = { false },
                                   person: PopUpPersonSignals = PopUpPersonSignals(secondsSinceInput: { .infinity }, frontmost: { nil }),
                                   restore: (_ persons: [ListedWindow], _ appWindow: CGWindowID, _ intervened: () -> Bool) -> PopUpRestoreRecord,
                                   route: (_ beforePress: (Element, inout InputMeta) throws -> Void,
                                           _ tolerates: (AXError) -> Bool, _ meta: inout InputMeta) throws -> Void,
                                   meta: inout InputMeta) throws {
  var armed: [ListedWindow]??
  var intervened: (() -> Bool)?
  var activated: (() -> Bool)?
  var actionError: AXError?
  try route({ pressed, meta in
    guard reads.same(pressed, target.element) else { return }
    meta.popUpClick = PopUpClickRecord(role: target.role)
    armed = .some(try popUpBeforeDispatch(target, app: app, pids: pids, reads: reads, windows: windows, deadlinePassed: deadlinePassed))
    intervened = person.since(now(), now: now)
    activated = person.activated(since: now(), pids: pids, now: now)
  }, { error in
    guard armed != nil else { return false }
    actionError = error
    return menuItemAmbiguousErrors.contains(error)
  }, &meta)
  guard let before = armed else { return }
  var record = PopUpClickRecord(role: target.role, action: kAXPressAction, kind: target.kind)
  record.actionError = actionError?.rawValue
  defer { meta.popUpClick = record }
  try popUpAwaitOpen(target, before: before, app: app, appWindow: appWindow, pids: pids, ownPid: ownPid, reads: reads, windows: windows,
                     now: now, sleep: sleep, intervened: intervened ?? { false }, activated: activated ?? { false }, restore: restore,
                     record: &record, meta: &meta)
}

/// The hooks #282's route runs on its press (`webAreaPress`'s `popUpPress`), set by `popUpConfirmingRoute` while that
/// route runs; none outside it: the check just before the press, and the judgment of a non-success AX error from it.
final class PopUpPressChecks {
  var check: ((AXUIElement, inout InputMeta) throws -> Void)?
  var actionError: ((AXError) -> Bool)?

  func run(_ control: AXUIElement, _ meta: inout InputMeta) throws { try check?(control, &meta) }
  func tolerates(_ error: AXError) -> Bool { actionError?(error) ?? false }
}

/// The restore over the live window list, route 3's raise, hold and hold timer (the click's `restore`).
func livePopUpRestore(_ persons: [ListedWindow], _ appWindow: CGWindowID, _ intervened: () -> Bool) -> PopUpRestoreRecord {
  popUpRestoreOrder(persons, appWindow: appWindow, system: .live, windows: onScreenWindowListRead, now: monotonicMilliseconds,
                    sleep: { usleep(UInt32(max(0, $0) * 1000)) }, intervened: intervened)
}
/// A carried click's result: its meta, and the restore's note when it did not complete.
func popUpResult(_ meta: InputMeta) -> [String: Any] {
  var result: [String: Any] = ["meta": meta.wire]
  if let note = meta.note { result["note"] = note }
  return result
}

/// #458's unconfirmed answer: the control's action was performed, and nothing of the app's was seen to open at it; #463's
/// kinds say what carried the click and what was not seen.
func popUpUnconfirmed(app: String, kind: PopUpControl = .popUpButton, activated: Bool = false) -> EngineError {
  let carried: String, seen: String
  switch kind {
  case .popUpButton: (carried, seen) = ("the pop-up button's AXPress action", "no menu was seen to open at the button")
  case .comboBoxArrow: (carried, seen) = ("the combo box's arrow's AXPress action", "no list was seen to open at the combo box")
  case .menuButton: (carried, seen) = ("the menu button's AXPress action", "no menu or panel was seen to open at the button")
  case .colorWell: (carried, seen) = ("the colour well's AXPress action", "no panel was seen to open at it")
  case .contextMenu: (carried, seen) = ("the element's Show Menu action (AXShowMenu)", "no context menu was seen to open at it")
  case .datalist: (carried, seen) = ("the field's AXPress action", "its suggestion list was not seen to open")
  }
  let closes = kind == .popUpButton || kind == .comboBoxArrow ? "the menu it opens" : "what it opens"
  let front = activated ? " The action brought \(app) to the front over the person's window." : ""
  return EngineError(name: "clickUnconfirmed",
    "The click could not be confirmed: it was carried by \(carried) in \(app), since a posted click can close \(closes), and \(seen).\(front) Observe the app with get_app_state before any retry, and never retry blindly.")
}

/// The note of a confirmed open whose action brought the app to the front itself (the review of 1a1956b2..5364c10b, item
/// 1): the open stands, and the person's window is now under the app's, which cua does not undo.
func popUpActivatedNote(app: String, kind: PopUpControl) -> String {
  "\(app)'s \(popUpOpenedNoun(kind)) is open, but opening it brought \(app) to the front over the person's window, and cua does not take the front back from an app. Tell the person if that is in their way."
}

/// What a kind's control opens, for the notes.
func popUpOpenedNoun(_ kind: PopUpControl) -> String {
  switch kind {
  case .popUpButton, .comboBoxArrow, .menuButton: return "menu"
  case .contextMenu: return "context menu"
  case .colorWell: return "panel"
  case .datalist: return "suggestion list"
  }
}

/// #458's note on an open whose restore did not complete: the open is confirmed, and the app's window may lie over the
/// person's focused window.
func popUpRestoreIncomplete(app: String, kind: PopUpControl = .popUpButton) -> String {
  "\(app)'s \(popUpOpenedNoun(kind)) is open, but the person's front window could not be put back in front of \(app)'s window, so \(app)'s window may now cover it."
}

/// #458's refusal (design ruling 979, item 3, narrowed by the restore measurement): a native combo box whose arrow has no
/// action that opens its list, the app not frontmost.
func popUpComboRefused(app: String) -> EngineError {
  EngineError(name: "backgroundClickRefused",
    "\(app)'s combo box opens its list only for a pointer click, and a click cua sends to \(app) while it is not the frontmost app does not leave that list open; neither the combo box nor its arrow has an accessibility action that opens it. Nothing was sent. Ask the person to bring \(app) to the front, or type the value into the combo box's text field instead (setValue on its element, or click its text and use typeText).")
}

/// #463 (ruling 1039): a Chromium view's own button that opens a menu or a bubble, the app not frontmost in shared mode.
/// The posted click's menu or bubble is closed as route 3 lets the app go, and the button's own action brings the app to
/// the front over the person's window, so nothing is sent; the ways through are the person's, or another route to the
/// same command.
func browserPopUpRefused(app: String) -> EngineError {
  EngineError(name: "backgroundClickRefused",
    "\(app)'s own button here opens a menu or panel, which a click cua sends while \(app) is not the frontmost app does not leave open, and its accessibility action would bring \(app) to the front over the person's window. Nothing was sent. Ask the person to bring \(app) to the front first, or reach the same command another way: a keyboard shortcut, or \(app)'s menu bar by its elements.")
}

/// #463: a right click in a web page, the app not frontmost in shared mode: the posted one's context menu is closed as
/// route 3 lets the app go, and no accessibility action opens a page's context menu behind.
func webContextMenuRefused(app: String) -> EngineError {
  EngineError(name: "backgroundClickRefused",
    "\(app)'s web page does not keep a context menu open for a right click cua sends while \(app) is not the frontmost app, and no accessibility action opens one there. Nothing was sent. Ask the person to bring \(app) to the front first, or act on the page without its context menu: click the element by its ID, or use keys.")
}

/// #463 (the review of 1a1956b2..5364c10b, item 2): a right click on text in a native app, the app not frontmost in shared
/// mode: the posted one's context menu is closed as route 3 lets the app go, and Show Menu cannot aim at the text under
/// the click.
func textContextMenuRefused(app: String) -> EngineError {
  EngineError(name: "backgroundClickRefused",
    "\(app)'s context menu for text acts on the text under the pointer, which no accessibility action can aim at, and a right click cua sends while \(app) is not the frontmost app does not leave the menu open. Nothing was sent. Ask the person to bring \(app) to the front first, or use keys instead: select the text with selectText, then use \(app)'s keyboard shortcuts or its menu bar by its elements.")
}

/// The control opened its menu or list between the decision and the press (during the focus hold): pressing it would
/// close it, so nothing is pressed.
func popUpOpenedSince(_ kind: PopUpControl = .popUpButton) -> EngineError {
  switch kind {
  case .popUpButton, .comboBoxArrow:
    return EngineError(name: "screenChangedSinceScreenshot",
      "The screen changed since the screenshot: the pop-up button at this point now shows its menu open, and a press would close it. The button was not pressed. Take a new screenshot or call getAXState() to see the menu's items before clicking one.")
  case .menuButton, .colorWell, .contextMenu, .datalist:
    return EngineError(name: "screenChangedSinceScreenshot",
      "The screen changed since the screenshot: the control at this point now shows its menu or list open, and its action would close it. Nothing was pressed. Take a new screenshot or call getAXState() to see the items before clicking one.")
  }
}

/// The request's deadline passed before the control's action was sent.
func popUpDeadlinePassed(_ kind: PopUpControl = .popUpButton) -> EngineError {
  switch kind {
  case .popUpButton, .comboBoxArrow:
    return EngineError(name: "timeoutReached",
      "timeoutReached: the request's deadline passed before the pop-up button's AXPress action was sent. The button was not pressed.")
  case .menuButton, .colorWell, .contextMenu, .datalist:
    return EngineError(name: "timeoutReached",
      "timeoutReached: the request's deadline passed before the control's \(kind.action) action was sent. Nothing was pressed.")
  }
}
