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

/// What an element click's result meta records of how it was carried (#188, meta `elementClick`): the plan, why the
/// ladder chose it (`advertised`: a plain left click on an element advertising AXPick or AXPress whose point does not
/// land on a strict descendant; `descendant`: the gate sent it to synthesis; `noAction`: the element advertises neither;
/// `notPlainLeft`: another button or count; `forced`: the spike's route), and what the hit-test at the element's point
/// answered relative to it when one was taken (the gate's, or a synthesized click's reach check), against the owner's
/// application element, where the vendor hit-tests under the element's window (F-helper-logic.md:79). So a click on a
/// text field says whether an AXPress (which keeps the field's selection) or a posted click (which places a caret)
/// carried it. Value-free: action names and enumeration words only.
struct ElementClickRecord: Equatable {
  /// `webArea` (#282): a left pointer into a Chromium web area in shared mode, carried by the action of the element the
  /// pointer's point hits instead of a posted click (a coordinate click's record too).
  /// `focusField` and `focusedNotPlaced` (#283): a plain left click into a web area's text field, carried by
  /// AXFocused, with the caret placed at the point or not (`caret` says why not).
  enum Reason: String { case advertised, descendant, noAction, notPlainLeft, forced, webArea, focusField, focusedNotPlaced }
  let plan: ElementClickPlan
  let reason: Reason
  var hit: HitRelation?
  /// `webArea` only: the role of the control pressed, and whether it was the hit itself or an ancestor the walk reached
  /// through the hit's plain children (`webAreaControl`); `pressed` "hit" | "ancestor" on the wire.
  var pressedRole: String? = nil
  var pressedAncestor: Bool? = nil
  /// `webArea` only: the roles the walk read from the hit up to where it stopped (`webAreaControl`), and on a refusal
  /// why it stopped (`walkStopped`, a `WebAreaRefusal` case name).
  var walk: [String]? = nil
  var walkStopped: String? = nil
  /// `focusField` and `focusedNotPlaced` only: the caret's offset placed (`placed`), or why it was not (a
  /// `CaretNotPlaced` case name).
  var caret: String? = nil

  var wire: [String: Any] {
    var wire: [String: Any] = ["reason": reason.rawValue]
    switch plan {
    case .action(let action): wire["plan"] = "action"; wire["action"] = action
    case .synthesized: wire["plan"] = "synthesized"
    }
    if let hit { wire["hit"] = "\(hit)"; wire["hitTest"] = "application" }
    if let pressedRole { wire["pressedRole"] = pressedRole }
    if let pressedAncestor { wire["pressed"] = pressedAncestor ? "ancestor" : "hit" }
    if let walk { wire["walk"] = walk }
    if let walkStopped { wire["walkStopped"] = walkStopped }
    if let caret { wire["caret"] = caret }
    return wire
  }
}

/// A coordinate click's placement (#259: cua's click landed one text line low in the Electron fixture where the vendor's,
/// given the same point, landed on target), meta `coordinateClick`: the screenshot point as the model gave it (its
/// pixels), the window-local point the conversion computed (points), the global location the events are posted at and
/// the window location they are stamped with (`stampWindow`; nil when no window number names the window and none is
/// stamped), the AX frame the conversion used, and the frame read again just before the events (nil when not read).
/// Value-free: numbers only.
struct CoordinateClickRecord {
  let screenshotPoint: CGPoint
  let windowPoint: CGPoint
  let postedLocation: CGPoint
  let postedWindowLocation: CGPoint?
  let windowFrame: CGRect?
  var frameBeforePost: CGRect?

  init(screenshotPoint: CGPoint, windowPoint: CGPoint, target: ClickTarget) {
    self.screenshotPoint = screenshotPoint
    self.windowPoint = windowPoint
    postedLocation = target.point
    postedWindowLocation = stampedWindowLocation(target.point, id: target.windowID, frame: target.windowFrame)
    windowFrame = target.windowFrame
  }

  var wire: [String: Any] {
    func point(_ point: CGPoint?) -> Any { point.map { ["x": Double($0.x), "y": Double($0.y)] } ?? NSNull() }
    return ["screenshotPoint": point(screenshotPoint), "windowPoint": point(windowPoint), "postedLocation": point(postedLocation),
            "postedWindowLocation": point(postedWindowLocation), "windowFrame": rectWire(windowFrame), "frameBeforePost": rectWire(frameBeforePost)]
  }
}

/// The record of `plan`, chosen by elementClickPlan from the same arguments; `hit` is the hit-test's answer if one was
/// taken.
func elementClickRecord(_ plan: ElementClickPlan, forced: InputRoute?, button: MouseButton, count: Int, actions: [String],
                        hit: HitRelation?) -> ElementClickRecord {
  let reason: ElementClickRecord.Reason
  if forced != nil { reason = .forced }
  else if case .action = plan { reason = .advertised }
  else if !actions.contains("AXPick") && !actions.contains("AXPress") { reason = .noAction }
  else if button != .left || count != 1 { reason = .notPlainLeft }
  else { reason = .descendant }
  return ElementClickRecord(plan: plan, reason: reason, hit: hit)
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

// MARK: A background pointer into a view that refuses first mouse (#282)
//
// Route 3's left pointer actions (a click, a drag, focusField's fallback) post their own left mouse down into an app that
// subtype 1 made believe it is active. Where its activation clicked no AXActivationPoint (Chrome's lies outside its frame),
// that down meets the activation's arm (AppKit's `_mouseActivationInProgress`), makes the window key, and reaches a view
// only if the view accepts first mouse; or, joining a hold whose arm an inert click spent, it meets a key window and
// orders it front (#200's raise). Chromium's web content (`RenderWidgetHostViewCocoa acceptsFirstMouse:`) refuses first
// mouse below the popup levels, so the first loses the click silently and the second raises the window. The owner's
// ruling for that class (the Linux engine's device mode): on a shared desktop cua refuses input an app ignores, and a
// dedicated desktop may bring the window forward. So, per connection (its ping's `desktop`):
// - shared (the default): a left pointer into a Chromium web area, where the activation it meets clicked no activation
//   point, is never posted: a plain click takes the hit element's own action when it advertises one (the element route),
//   anything else is refused (`backgroundClickRefused`), with nothing posted;
// - dedicated: the inert click goes right after subtype 1 for left pointers too, so their own down meets a key window and
//   is delivered, and nothing puts the person's window order back for that action (nobody is at the desktop);
// - everywhere: a pointer whose own down consumed the arm, into a view not known to accept first mouse, answers
//   `clickUnconfirmed`, never plain success.

/// The device mode a connection runs in (#282), as its ping names it (the service passes the session's
/// `CUA_DESKTOP_MODE`, which src/runtime/launch.mjs resolves); shared when it names none.
enum DesktopMode: String {
  case shared, dedicated
}

/// What a left pointer action's point hits, as #282's rules read it.
enum PointerView: Equatable {
  /// Known to accept first mouse: a Chromium process's native views (its toolbar; `BridgedContentView acceptsFirstMouse:`
  /// answers YES), the one rule cua knows. A down that consumes the arm there is delivered.
  case acceptsFirstMouse
  /// A Chromium web area or inside one, whose view refuses first mouse.
  case webArea
  /// A Chromium hit not established outside every web area (no hit, an incomplete walk, a page tree not yet seen):
  /// treated as a web area in shared mode, since the owner's rule refuses input the app may ignore (#282's review).
  case possibleWebArea
  /// Anything else: an app with no known rule.
  case unknown

  /// Whether shared mode refuses a pointer here (or carries a plain click by the hit's action).
  var mayBeWebArea: Bool { self == .webArea || self == .possibleWebArea }
}

/// The roles a web-area walk stops at: the hit's window, or anything above one.
private let webAreaWalkStops: Set<String> = ["AXWindow", "AXSheet", "AXApplication"]

/// What the walk from a hit up its parents established about a web area.
enum WebAreaWalk: Equatable {
  /// The hit is an AXWebArea or lies inside one.
  case inside
  /// Established outside one: the walk reached the hit's window, sheet or application with every role and parent read.
  case outside
  /// Neither: a role or a parent could not be read before a stop, or the bound ran out; an AXWebArea may lie beyond. And
  /// a hit that is itself the window, sheet or application: a coarse answer, which says nothing of the view at the point.
  case incomplete
  /// The hit, or an element on its walk below the stop, has an AXWebArea among its children (#288): Chrome's
  /// web-contents AXScrollArea, which a page point answers for a moment after Basic mode before it resolves inside the
  /// page. Never outside.
  case aboveWebArea
}

/// Whether `hit` is an AXWebArea or lies inside one, its parents walked up to 300 levels (the gate's bound) and no
/// further than its window. Only a walk from an element below a stop that reached one with every role read, none of
/// the elements below the stop having an AXWebArea child (`webAreaChild`), says `outside` (#282's review; #288).
func webAreaWalk<Element>(_ hit: Element, role: (Element) -> String?, parent: (Element) -> Element?,
                          webAreaChild: (Element) -> Bool = { _ in false }) -> WebAreaWalk {
  var current = hit
  for level in 0...300 {
    guard let name = role(current) else { return .incomplete }
    if name == "AXWebArea" { return .inside }
    if webAreaWalkStops.contains(name) { return level == 0 ? .incomplete : .outside }
    if webAreaChild(current) { return .aboveWebArea }
    guard let next = parent(current) else { return .incomplete }
    current = next
  }
  return .incomplete
}

/// Whether `element` has an AXWebArea among its children (`children` nil, unread: not known to).
func hasWebAreaChild<Element>(_ element: Element, children: (Element) -> [Element]?, role: (Element) -> String?) -> Bool {
  children(element)?.contains { role($0) == "AXWebArea" } ?? false
}

/// The view a left pointer's point hits in a process: in a Chromium-family process (`chromiumFamily`, Enablement.swift),
/// a web area when the hit is or lies inside an AXWebArea; a native view known to accept first mouse only when the walk
/// established the hit outside every web area and an observation has seen a web area in the process (`webAreaSeen`: its
/// page's tree is exposed, so a page point would have answered inside one); otherwise, in a Chromium process, a possible
/// web area (no hit, an incomplete walk, a page tree not yet seen, or a hit or element on its walk with an AXWebArea
/// child, #288), and `unknown` outside one.
func pointerView<Element>(chromium: Bool, webAreaSeen: Bool, hit: Element?, role: (Element) -> String?,
                          parent: (Element) -> Element?, children: (Element) -> [Element]? = { _ in nil }) -> PointerView {
  guard chromium else { return .unknown }
  guard let hit else { return .possibleWebArea }
  switch webAreaWalk(hit, role: role, parent: parent, webAreaChild: { hasWebAreaChild($0, children: children, role: role) }) {
  case .inside: return .webArea
  case .outside: return webAreaSeen ? .acceptsFirstMouse : .possibleWebArea
  case .incomplete, .aboveWebArea: return .possibleWebArea
  }
}

/// #288's establishment, at click time, of a Chromium process's page tree no observation has seen: the application's
/// role read (Basic mode), a bounded search of the target window for an AXWebArea (`noteWebArea` when found), then the
/// point hit-tested again; a hit that is itself a container of the web area (`hasWebAreaChild`) is hit-tested again
/// every `pointerEstablishSampleMs` for up to `pointerEstablishRehitMs` until it is something else, the waits ending
/// by `pointerEstablishBoundMs` after the step began. Measured (#288's hosted spike, runs 42161269408 and 42162367095):
/// before any role read a page point answers a coarse AXScrollArea that walks to the window; after it the window's
/// search finds the AXWebArea in 11 to 29 ms, and for 40 to 350 ms more the point may answer the web-contents
/// AXScrollArea, the web area's parent, before it resolves inside the page; the toolbar's Reload is an AXButton whose
/// walk reaches the window with no web area. Nothing is activated or posted.
let pointerEstablishRehitMs: Double = 500
let pointerEstablishSampleMs: Double = 25
let pointerEstablishBoundMs: Double = 600

/// What the establishment did, value-free: the meta's `pointerEstablish` {ms, webAreaFound, rehits}, `rehits` counting
/// every hit-test after the search.
struct PointerEstablishRecord: Equatable {
  var ms: Double
  var webAreaFound: Bool
  var rehits: Int

  var wire: [String: Any] { ["ms": (ms * 1000).rounded() / 1000, "webAreaFound": webAreaFound, "rehits": rehits] }
}

/// The calls the establishment makes (the unit tests' seams).
struct PointerEstablishing<Element> {
  var readAppRole: () -> Void
  var windowHasWebArea: () -> Bool
  var noteWebArea: () -> Void
  var rehit: () -> Element?
  var now: () -> Double
  var sleep: (Double) -> Void
}

/// The view a left pointer by route 3 aims at (`pointerView`), with #288's establishment first in a Chromium process
/// where no web area has been seen, when `establish` is given: answers the view, the hit it was read from (the
/// establishment's last hit-test, else `hit`), and the establishment's record (nil when none ran).
func establishedPointerView<Element>(chromium: Bool, webAreaSeen: Bool, hit: Element?, role: (Element) -> String?,
                                     parent: (Element) -> Element?, children: (Element) -> [Element]?,
                                     establish: PointerEstablishing<Element>?) -> (view: PointerView, hit: Element?, record: PointerEstablishRecord?) {
  guard chromium, !webAreaSeen, let establish else {
    return (pointerView(chromium: chromium, webAreaSeen: webAreaSeen, hit: hit, role: role, parent: parent, children: children), hit, nil)
  }
  let started = establish.now()
  establish.readAppRole()
  let found = establish.windowHasWebArea()
  if found { establish.noteWebArea() }
  var current = establish.rehit()
  var rehits = 1
  let end = min(establish.now() + pointerEstablishRehitMs, started + pointerEstablishBoundMs)
  while let container = current, hasWebAreaChild(container, children: children, role: role) {
    let remaining = end - establish.now()
    guard remaining > 0 else { break }
    establish.sleep(min(pointerEstablishSampleMs, remaining))
    current = establish.rehit()
    rehits += 1
  }
  let view = pointerView(chromium: true, webAreaSeen: found, hit: current, role: role, parent: parent, children: children)
  return (view, current, PointerEstablishRecord(ms: establish.now() - started, webAreaFound: found, rehits: rehits))
}

/// The roles whose action in a Chromium web area has a known effect, the only ones shared mode's element route presses
/// (the design session's ruling on #282, 1ea561bc fe37aee9; the hosted A/B found AXPress on a page's AXTextArea answering
/// success and doing nothing). Chromium's role mapping (ui/accessibility/platform/ax_platform_node_cocoa.mm
/// `nativeRoleFromAXRole`) exposes a toggle button and a switch as AXCheckBox (subroles AXToggleButton, AXSwitch), a tab
/// as AXRadioButton (subrole AXTabButton), a select as AXPopUpButton, and a summary as AXDisclosureTriangle or AXButton:
/// no web element answers AXToggle, so it is not listed, and AXTab is kept for the ruling's list though Chrome's tabs
/// arrive as AXRadioButton.
let webAreaPressableRoles: Set<String> = ["AXButton", "AXCheckBox", "AXRadioButton", "AXLink", "AXPopUpButton", "AXMenuItem",
                                          "AXMenuButton", "AXDisclosureTriangle", "AXTab"]
/// The roles whose AXValue says whether their press took effect (a checkbox's and a radio button's state, so a toggle's,
/// a switch's and a tab's): read before and after it (`pressConfirmingValue`).
let webAreaValueCheckedRoles: Set<String> = ["AXCheckBox", "AXRadioButton"]
/// The settle a value-checked press waits for its value to change: polled every 20 ms for up to 500 ms (Chromium posts the
/// action to the renderer and updates the tree from it, a round trip of tens of ms).
let webAreaValueSettleMs: Double = 500
let webAreaValueSampleMs: Double = 20

/// The roles the walk from a hit to its control may pass through (the design session's bounds, 1ea561bc 7a6a3638): a
/// control's plain, non-interactive children, its label's text, an icon, a wrapping group (Chromium's generic
/// containers arrive as AXGroup). Any other role on the way up refuses.
let webAreaPassableRoles: Set<String> = ["AXStaticText", "AXImage", "AXGroup"]
/// The roles that make an element editable whatever its attributes say: text entry, which a plain click focuses
/// instead (#283, WebAreaFocus.swift).
let webAreaEditableRoles: Set<String> = ["AXTextField", "AXTextArea", "AXComboBox", "AXSearchField", "AXSecureTextField"]

/// Why shared mode refuses a plain left click in a web area rather than pressing a control (#282).
enum WebAreaRefusal: String, Error, Equatable {
  /// Another button or count.
  case notPlainLeft
  /// The hit, or an element on the way up to a control, is neither an allowlisted control nor a passable child; or the
  /// walk reached the AXWebArea before any control.
  case roleNotAllowed
  /// The walk met an editable element (text entry, or one with an `AXEditableAncestor`) before a control.
  case editable
  /// The ancestry could not be read to a control: a role or parent unread, or the bound ran out.
  case incompleteAncestry
  /// The control advertises neither AXPick nor AXPress, after the re-read where the process's accessibility is fresh.
  case noAction
  /// The focus route (#283): the text-entry element the walk reached does not let its AXFocused be set.
  case notFocusable
}

/// The control a plain left click in a web area presses (#282, the design session's bounds): the hit when it is an
/// allowlisted control, else its nearest allowlisted ancestor reached through passable children only
/// (`webAreaPassableRoles`), never past the AXWebArea; refused when the walk meets an editable element, another role,
/// the web area itself or an ancestry it cannot read (up to 300 levels). `ancestor`: the control is not the hit.
func webAreaControl<Element>(_ hit: Element, role: (Element) -> String?, parent: (Element) -> Element?,
                             editable: (Element) -> Bool) -> Result<(control: Element, role: String, ancestor: Bool), WebAreaRefusal> {
  var walk: [String] = []
  return webAreaControl(hit, role: role, parent: parent, editable: editable, walk: &walk)
}

/// `webAreaControl`, recording in `walk` the roles it read from the hit up to where it stopped, the pressed control's
/// or the one it refused at (`unreadable` for a role it could not read): the meta's `elementClick.walk`, value-free.
func webAreaControl<Element>(_ hit: Element, role: (Element) -> String?, parent: (Element) -> Element?, editable: (Element) -> Bool,
                             walk: inout [String]) -> Result<(control: Element, role: String, ancestor: Bool), WebAreaRefusal> {
  var current = hit
  for level in 0...300 {
    guard let name = role(current) else {
      walk.append("unreadable")
      return .failure(.incompleteAncestry)
    }
    walk.append(name)
    if webAreaEditableRoles.contains(name) || editable(current) { return .failure(.editable) }
    if webAreaPressableRoles.contains(name) { return .success((current, name, level > 0)) }
    guard webAreaPassableRoles.contains(name) else { return .failure(.roleNotAllowed) }  // the AXWebArea included
    guard let next = parent(current) else { return .failure(.incompleteAncestry) }
    current = next
  }
  return .failure(.incompleteAncestry)
}

/// The action an element click on a control would take (`elementClickPlan`'s: AXPick else AXPress); nil when it
/// advertises neither, or its actions could not be read.
func webAreaAction(role: String, actions: [String]?) -> String? {
  guard let actions, case .action(let action)? = try? elementClickPlan(forced: nil, button: .left, count: 1, role: role, actions: actions,
                                                                     landsOnDescendant: { false }) else { return nil }
  return action
}

/// How long a control with no action yet is re-read in a process whose accessibility is fresh (#282's hosted probe, run
/// 42131623237: a checkbox began advertising AXPress 1.6 to 1.7 s after the engine's enablement write, with no
/// activation at all): every 100 ms for up to 2 s, posting nothing. Fresh: under `webAreaFreshEnablementMs` since the
/// process's first observation or the engine's last enablement write attempt, failed or not (`WebAccessibility.freshSince`;
/// on Chrome for Testing the write answers -25208, #292), or no observation has seen a web area in it yet.
let webAreaActionRereadMs: Double = 2_000
let webAreaActionRereadSampleMs: Double = 100
let webAreaFreshEnablementMs: Double = 10_000

func webAreaAccessibilityFresh(freshSince: Double?, now: Double, webAreaSeen: Bool) -> Bool {
  !webAreaSeen || freshSince.map { now - $0 < webAreaFreshEnablementMs } == true
}

/// The control's action, re-read every `webAreaActionRereadSampleMs` for up to `webAreaActionRereadMs` when `fresh` and
/// the first read found none; nil when none came (or the process was not fresh: no wait at all).
func webAreaActionRereading(role: String, first: [String]?, fresh: Bool, read: () -> [String]?, now: () -> Double,
                            sleep: (Double) -> Void) -> String? {
  if let action = webAreaAction(role: role, actions: first) { return action }
  guard fresh else { return nil }
  let started = now()
  while now() - started < webAreaActionRereadMs {
    sleep(webAreaActionRereadSampleMs)
    if let action = webAreaAction(role: role, actions: read()) { return action }
  }
  return nil
}

/// Whether the control the walk chose still qualifies, read now (the review of c768d2bb..1c8f2229: a node may change
/// during the re-read's wait): an allowlisted role, not editable, its parents read up to the AXWebArea (no window or
/// application, no unread role or parent, within 300 levels). Answers its role now.
func webAreaControlRequalified<Element>(_ control: Element, role: (Element) -> String?, parent: (Element) -> Element?,
                                        editable: (Element) -> Bool) -> Result<String, WebAreaRefusal> {
  guard let name = role(control) else { return .failure(.incompleteAncestry) }
  if webAreaEditableRoles.contains(name) || editable(control) { return .failure(.editable) }
  guard webAreaPressableRoles.contains(name) else { return .failure(.roleNotAllowed) }
  return webAreaAncestry(above: control, role: role, parent: parent).map { name }
}

/// Whether `element`'s parents read up to an AXWebArea: no window, sheet or application first (`roleNotAllowed`: outside
/// every web area), no unread role or parent and within 300 levels (`incompleteAncestry`).
func webAreaAncestry<Element>(above element: Element, role: (Element) -> String?, parent: (Element) -> Element?) -> Result<Void, WebAreaRefusal> {
  var current = element
  for _ in 0...300 {
    guard let next = parent(current), let above = role(next) else { return .failure(.incompleteAncestry) }
    if above == "AXWebArea" { return .success(()) }
    if webAreaWalkStops.contains(above) { return .failure(.roleNotAllowed) }  // reached its window: outside every web area
    current = next
  }
  return .failure(.incompleteAncestry)
}

/// The press of the control the walk chose (`walkedRole` its role then), decided before anything is posted: its action,
/// re-read where the process's accessibility is fresh (`webAreaActionRereading`), then the control requalified as it is
/// now (`webAreaControlRequalified`) and its action taken again under its current role. Answers the action and the
/// current role, or why it is refused.
func webAreaPressDecision<Element>(_ control: Element, walkedRole: String, fresh: Bool, actions: (Element) -> [String]?,
                                   role: (Element) -> String?, parent: (Element) -> Element?, editable: (Element) -> Bool,
                                   now: () -> Double, sleep: (Double) -> Void) -> Result<(action: String, role: String), WebAreaRefusal> {
  guard webAreaActionRereading(role: walkedRole, first: actions(control), fresh: fresh, read: { actions(control) }, now: now,
                               sleep: sleep) != nil else { return .failure(.noAction) }
  switch webAreaControlRequalified(control, role: role, parent: parent, editable: editable) {
  case .failure(let why): return .failure(why)
  case .success(let current):
    guard let action = webAreaAction(role: current, actions: actions(control)) else { return .failure(.noAction) }
    return .success((action, current))
  }
}

/// A web-area press whose role has a value to check (`webAreaValueCheckedRoles`): the value read before the press and
/// polled after it for up to `webAreaValueSettleMs`; unchanged, or unreadable after a readable one, it answers
/// clickUnconfirmed, never success. A role with no value to check stands on the press. A value-checked role whose
/// baseline could not be read is still pressed (the model's intended action) and answers clickUnconfirmed, since nothing
/// can show the control changed (the review of c768d2bb..1c8f2229). Success means the control changed; the events Chrome
/// itself synthesizes for the action are its own.
func pressConfirmingValue(app: String, checksValue: Bool, readValue: () -> String?, now: () -> Double, sleep: (Double) -> Void,
                          press: () throws -> Void) throws {
  guard checksValue else { return try press() }
  let baseline = readValue()
  try press()
  guard let before = baseline else { throw pressUnconfirmed(app) }
  let started = now()
  repeat {
    if let after = readValue(), after != before { return }
    sleep(webAreaValueSampleMs)
  } while now() - started < webAreaValueSettleMs
  if let after = readValue(), after != before { return }
  throw pressUnconfirmed(app)
}

/// Shared mode's refusal of a left pointer into a Chromium web area (#282), in the Linux engine's form (the cause, then
/// the remedy): nothing was posted.
func backgroundClickRefused(_ app: String) -> EngineError {
  EngineError(name: "backgroundClickRefused", "\(app)'s web page does not accept a background click; bring \(app) forward or use a dedicated desktop")
}

/// The refusal of a control whose action the page has not exposed yet (`WebAreaRefusal.noAction`): its accessibility may
/// still be coming up, so observing the app first may let the next click through.
func backgroundClickRefusedObserveFirst(_ app: String) -> EngineError {
  EngineError(name: "backgroundClickRefused",
    "\(app)'s web page does not accept a background click, and the control there exposes no action yet; observe \(app) with get_app_state first and click again, or bring \(app) forward or use a dedicated desktop")
}

/// The answer of a pointer whose own mouse down consumed route 3's activation arm in a view not known to accept first
/// mouse (#282): posted, but AppKit may have taken it as the window's activating click and passed it to no view.
func clickUnconfirmed(_ app: String, noun: String = "click") -> EngineError {
  EngineError(name: "clickUnconfirmed",
    "The \(noun) could not be confirmed: it was sent to \(app) in the background, but it may only have activated the window without reaching what is under the pointer. Observe the app with get_app_state before any retry, and never retry blindly.")
}

/// `clickUnconfirmed` for shared mode's element route (#282): the control's action was performed, but the value that
/// shows its effect did not change within the settle.
func pressUnconfirmed(_ app: String) -> EngineError {
  EngineError(name: "clickUnconfirmed",
    "The click could not be confirmed: it was carried by the control's accessibility action in \(app)'s background web page, but the control's value did not change. Observe the app with get_app_state before any retry, and never retry blindly.")
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

/// What the hit-test at the window's AXActivationPoint answered: the element's role and its advertised actions, nil
/// when the query for them failed (so nothing says the element is not pressable).
struct ActivationHit: Equatable {
  let role: String?
  let actions: [String]?
}

/// What the inert-point rule decided at the window's AXActivationPoint (the result's meta `activationClick`): posted
/// there, or why not; where a click went instead is `ActivationClickKind`.
enum ActivationClick: String, Equatable {
  case posted
  case noPoint        // the window has no AXActivationPoint
  case outsideFrame   // the point lies outside the window's frame (Chrome's, U13), or the frame is unknown
  case spared         // the point lies in the target of a click with another button than the left
  case control        // the hit-test there answered a control, or an element not known to be inert
  case actionsUnknown // the hit-test answered an element whose actions could not be read
  case hitTestFailed  // the hit-test there answered nothing
}

/// The click that consumed route 3's activation's arm, and when (the result's meta `activationClickKind`, and the paste's
/// `focusEnforcement.click`; #187, 2026-11-01: a hold never ends with its arm set). Subtype 1 arms an inactive app's
/// `_mouseActivationInProgress`, and only a mouse down consumes the arm, making the window key; left armed, the window
/// stays without key status until the person's next real click, and a key equivalent or ⌘V reaches no window. Where the
/// click at the activation point is skipped, an inert click stamped with the window's number goes outside the frame:
/// AppKit routes a pid-posted mouse down by its window number, never by its point, so it reaches that window, takes the
/// armed branch (key and main, no ordering) and, its hit view nil, reaches no view. A holder that posts its own left
/// mouse down lets that consume the arm instead (the same branch, #200's reading), and the inert click goes at the
/// release only when none did.
enum ActivationClickKind: Equatable {
  /// At the window's AXActivationPoint, inert and inside the frame (`ActivationClick.posted`), right after subtype 1.
  case activationPoint
  /// The inert click at the point named: right after subtype 1 or a holder's joining (`early`), or before subtype 2.
  case inertOutside(InertClickPoint, ActivationClickWhen)
  /// The holder's own left mouse down consumed the arm.
  case action
  /// None could be posted, and why.
  case skipped(ActivationClickSkip)

  var wire: [String: Any] {
    switch self {
    case .activationPoint: return ["kind": "activationPoint", "when": "early"]
    case .inertOutside(let point, let when): return ["kind": "inertOutside", "point": point.rawValue, "when": when.rawValue]
    case .action: return ["kind": "action", "when": "consumedByAction"]
    case .skipped(let reason): return ["kind": "skipped", "skippedReason": reason.rawValue]
    }
  }
}

/// When an activation's own click went: before the holder's input (`early`), or before subtype 2 (`release`).
enum ActivationClickWhen: String, Equatable {
  case early, release
}

/// Where the inert click went: the AXActivationPoint itself, far enough outside the frame, or the offset point.
enum InertClickPoint: String, Equatable {
  case activationPoint, offset
}

/// Why an activation posted no click at all.
enum ActivationClickSkip: String, Equatable {
  case spared          // the activation point lies in a non-left click's target (`ActivationClick.spared`)
  case noWindowNumber  // nothing to stamp the click with, and AppKit routes it by that number alone
  case noFrame         // the window's frame is unknown, so no point is known to lie outside it
  #if CUA_CONTROL_NO_INERT_CLICK
  case controlBuild    // the control build (#187's isolating cell): no inert click outside the frame, the arm left set
  #endif
}

/// A titled resizable window's resize band reaches 4 pt outside its frame (`_resizeDirectionForMouseLocation:`, its
/// exterior resize thickness, macOS 26.6.2): a mouse down there hits the theme frame and may start resize tracking. So
/// the inert click uses the AXActivationPoint only when it lies at least `inertClickActivationPointClearance` beyond the
/// frame (twice the band), and otherwise goes `inertClickFrameOffset` left of the frame at its mid-height (six times the
/// band, clear of the corners and the title bar). A point off every screen is fine: AppKit routes by the window number.
let inertClickActivationPointClearance: CGFloat = 8
let inertClickFrameOffset: CGFloat = 24

/// The click an activation makes after subtype 1 and where (nil: none): at the activation point when the inert-point
/// rule posted it there, else the inert click outside the frame (which FakeActivation keeps for the release when its
/// holder posts its own left mouse down), unless the point was spared, the window has no number
/// or its frame is unknown. An inert click that would land in `sparing` is spared too. The control build
/// (`CUA_CONTROL_NO_INERT_CLICK`, defined only in the #187 kit's copied Package.swift, never in a release) skips the
/// inert click here, both its early and its release posting, and nothing else.
func activationClickPlan(_ decision: ActivationClick, activationPoint: CGPoint?, windowFrame: CGRect?, windowID: CGWindowID?,
                         sparing: CGRect?) -> (kind: ActivationClickKind, point: CGPoint?) {
  if decision == .posted { return (.activationPoint, activationPoint) }
  if decision == .spared { return (.skipped(.spared), nil) }
  guard windowID != nil else { return (.skipped(.noWindowNumber), nil) }
  guard let frame = windowFrame else { return (.skipped(.noFrame), nil) }
  let inert: (point: CGPoint, place: InertClickPoint)
  if let point = activationPoint,
     max(frame.minX - point.x, point.x - frame.maxX, frame.minY - point.y, point.y - frame.maxY) >= inertClickActivationPointClearance {
    inert = (point, .activationPoint)
  } else {
    inert = (CGPoint(x: frame.minX - inertClickFrameOffset, y: frame.midY), .offset)
  }
  if let sparing, sparing.contains(inert.point) { return (.skipped(.spared), nil) }
  #if CUA_CONTROL_NO_INERT_CLICK
  return (.skipped(.controlBuild), nil)
  #else
  return (.inertOutside(inert.place, .early), inert.point)
  #endif
}

/// Where the window's AXActivationPoint lies against its frame (the paste's `focusEnforcement`, #187's 3b): value-free,
/// never the point itself.
enum ActivationPointPlace: String, Equatable {
  case inside, outside
  case unknownFrame  // the window's frame could not be read
  case none          // the window has no AXActivationPoint
}

func activationPointPlace(_ point: CGPoint?, windowFrame: CGRect?) -> ActivationPointPlace {
  guard let point else { return .none }
  guard let windowFrame else { return .unknownFrame }
  return windowFrame.contains(point) ? .inside : .outside
}

/// The roles a hit-test may answer at the activation point for the click to go: the window itself and the window's
/// chrome that is not a control (its title, a plain group or toolbar), as U13 read on TextEdit, Finder and Electron.
private let inertActivationRoles: Set<String> = ["AXWindow", "AXStaticText", "AXImage", "AXGroup", "AXToolbar", "AXSplitGroup"]
/// The actions a left click could invoke; an element advertising one is a control whatever its role.
private let clickInvokedActions: Set<String> = ["AXPress", "AXPick", "AXConfirm", "AXIncrement", "AXDecrement", "AXOpen"]

/// Whether a left click at the hit element invokes nothing: an inert role advertising no click-invoked action.
func activationPointIsInert(_ hit: ActivationHit) -> Bool {
  guard let role = hit.role, inertActivationRoles.contains(role), let actions = hit.actions else { return false }
  return clickInvokedActions.isDisjoint(with: actions)
}

/// Whether route 3's activation click goes at the window's AXActivationPoint (maws-3f's ruling, 2026-10-22, on the review
/// of the focus hold): only when the point lies inside the window's frame, outside `sparing` (the target of a click with
/// another button than the left, whose left click there would be one the model never asked for; the M2a vendor reading,
/// item 8), and a hit-test there (`hit`, asked only then) answers the window or chrome that is no control. Otherwise the
/// inert click outside the frame takes its place (`activationClickPlan`, #187 of 2026-11-01, which replaced the skip). A
/// declared difference from the vendor, which posts the click wherever the point is (F §5.5): a click that lands on a
/// control would invoke it before the action the model asked for.
func activationClickDecision(_ activationPoint: CGPoint?, windowFrame: CGRect?, sparing: CGRect?,
                             hit: () -> ActivationHit?) -> ActivationClick {
  guard let activationPoint else { return .noPoint }
  guard let windowFrame, windowFrame.contains(activationPoint) else { return .outsideFrame }
  if let sparing, sparing.contains(activationPoint) { return .spared }
  guard let found = hit() else { return .hitTestFailed }
  if activationPointIsInert(found) { return .posted }
  return found.actions == nil && found.role.map(inertActivationRoles.contains) == true ? .actionsUnknown : .control
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
