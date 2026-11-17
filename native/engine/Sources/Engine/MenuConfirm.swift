import ApplicationServices
import Foundation

// The Show Menu's confirmation (#374; the Linux engine's contract, cua #171 M4, ruling 687, Decision Log 2026-11-14,
// candidate 3): perform_secondary_action "Show Menu" (AXShowMenu) answers success only once a menu is seen to open,
// and `menuUnconfirmed` otherwise, the "sent, effect not seen" family's answer beside clickUnconfirmed and
// scrollUnconfirmed. The vendor answers success as soon as the Accessibility call does, menu or none.
//
// What counts as the menu, read just before the action and then every `menuConfirmIntervalMs` for up to
// `menuConfirmWindowMs` after it, the first read at once (`openMenus`):
// - an AXMenu child of the element itself: AppKit's text view's context menu, a popup or menu button's own menu
//   (`element`);
// - an AXMenu child of one of the element's ancestors up to and including its window, past any web area (`ancestor`,
//   `menuHosts`): a context menu hangs under the view that popped it up, which the hosted smoke of 2026-11-16 found
//   for each browser (Chrome for Testing: the web area's parent scroll area; Electron: the window; Firefox and Safari:
//   a group under the window), never under the application element;
// - the application's focused element, or one of its nearest `menuFocusLevels` ancestors, that is an AXMenu
//   (`focus`): a page's ARIA menu (role=menu, which Chrome and Safari expose as AXMenu) sits inside the page, not under
//   the application, and the WAI-ARIA menu pattern moves the focus onto its first item.
// A menu open before the action (by identity, CFEqual) confirms nothing by itself, and neither does a source whose
// baseline read failed (`MenuReading.unread`), where a menu open before may have gone unread. A page that handles contextmenu
// itself and draws its own menu with no menu role, or an app that takes the action and opens nothing, answers
// `menuUnconfirmed`, which says so: cua cannot tell those two apart.
//
// Polled, not notified: AXMenuOpened would need an observer on each process registered before the action and a run
// loop serviced through the wait, for a gain of at most one interval, and the poll would still be needed for an ARIA
// menu (which posts no menu notification on every engine) and as the backstop. The poll also reads the state the model
// will act on: a menu that opened and closed again within the wait (Chromium's on a window that is not focused, per the
// Linux engine's finding) is not open, and the answer says so.

/// The menu wait: 1 s, the Linux engine's MENU_WAIT, read every 20 ms as there.
let menuConfirmWindowMs: Double = 1000
let menuConfirmIntervalMs: Double = 20
/// The ancestors of the focused element read for its menu: an ARIA menu item's menu is its parent, or its grandparent
/// through a group, so a focused element deep in a page is not read up to its window on every poll.
let menuFocusLevels = 3

/// What the Show Menu's confirmation found (meta `menu`, value-free): where the new menu was seen (`element`,
/// `ancestor` or `focus`; null when none was), how many menus were open before the action, the reads after it and the
/// milliseconds from the action's return to the last of them, the action's AXError when it was not success (a timeout,
/// `showMenuSent`), and the sources the baseline could not read in full.
struct MenuConfirmRecord: Equatable {
  enum Seen: String { case element, ancestor, focus }
  var seen: Seen?
  var openBefore: Int
  var polls: Int
  var ms: Double
  var actionError: Int32? = nil
  /// The sources the baseline could not read in full (`MenuReading.unread`), which confirm nothing.
  var unreadBefore: [String] = []

  var wire: [String: Any] {
    var wire: [String: Any] = ["seen": seen?.rawValue ?? NSNull(), "openBefore": openBefore, "polls": polls,
                               "ms": (ms * 10).rounded() / 10]
    if let actionError { wire["actionError"] = Int(actionError) }
    if !unreadBefore.isEmpty { wire["unreadBefore"] = unreadBefore }
    return wire
  }
}

/// Whether a Show Menu's AXError counts as sent, so its menu is looked for: success, or cannotComplete, which is what an
/// app answers when it runs the menu's tracking loop inside the action and so replies only once the menu closes, after
/// the element's 1 s messaging timeout has passed with the menu open. Any other error is the element refusing the
/// action (`actionFailed`, as before).
func showMenuSent(_ performed: AXError) -> Bool { performed == .success || performed == .cannotComplete }


/// The processes whose focus a menu is looked for under: the element's serving process, then the app's when it is
/// another.
func menuApplicationPids(owner: pid_t, appPid: pid_t) -> [pid_t] { owner == appPid ? [owner] : [owner, appPid] }

/// How far up the element's ancestors are read for the menu's host: past any page, to the window.
let menuHostLevels = 40

/// Where a Show Menu's menu is looked for: the element, its hosts (`menuHosts`) and the applications whose focus is read.
struct MenuScope {
  let element: AXUIElement
  let hosts: [AXUIElement]
  let applications: [AXUIElement]
}

/// The element's ancestors whose children may hold its context menu, nearest first, read once before the action: from
/// its parent up to and including its window, leaving out every node inside a web area and the web area itself (the
/// page's own nodes, which hold no native menu; a page's ARIA menu is the focus's), so the walk resumes above the
/// outermost web area. The walk stops at the window, at the application, or where a parent does not read; the hosts it
/// reached are still read, so a short walk only looks in fewer places.
func menuHosts(of element: AXUIElement, ax: AXOps) -> [AXUIElement] {
  var chain: [(node: AXUIElement, role: String?)] = []
  var node = ax.parent(element)
  for _ in 0..<menuHostLevels {
    guard let current = node else { break }
    let role = ax.role(current)
    if role == kAXApplicationRole { break }
    chain.append((current, role))
    if role == kAXWindowRole { break }
    node = ax.parent(current)
  }
  let page = chain.lastIndex { $0.role == "AXWebArea" }
  return chain.suffix(from: page.map { $0 + 1 } ?? 0).map(\.node)
}

/// One reading of the menus open now that a Show Menu on `element` could have opened, each with where it was seen, and
/// the sources whose reading was not complete (`unread`): a read that failed (the children or the focused element, a
/// role that did not read, a parent missing below the window) or that the deadline cut short. A source unread in the
/// baseline confirms nothing during the wait, since a menu seen there may have been open before the action.
struct MenuReading {
  var menus: [(menu: AXUIElement, seen: MenuConfirmRecord.Seen)] = []
  var unread: Set<MenuConfirmRecord.Seen> = []
}

/// Reads the menus open now, in the order above. The deadline (on `ax.now`'s clock) is checked before every read, so a
/// hung app costs at most one read past it.
func openMenus(_ scope: MenuScope, ax: AXOps, deadline: Double = .infinity) -> MenuReading {
  var reading = MenuReading()
  let spent = { ax.now() >= deadline }
  /// The AXMenu children of `parent`, read child by child.
  func menuChildren(_ parent: AXUIElement, _ seen: MenuConfirmRecord.Seen) {
    guard !spent() else { reading.unread.insert(seen); return }
    guard let children = ax.childrenRead(parent) else { reading.unread.insert(seen); return }
    for child in children {
      guard !spent() else { reading.unread.insert(seen); return }
      guard let role = ax.role(child) else { reading.unread.insert(seen); continue }
      if role == kAXMenuRole { reading.menus.append((child, seen)) }
    }
  }
  menuChildren(scope.element, .element)
  for host in scope.hosts { menuChildren(host, .ancestor) }
  for application in scope.applications {
    guard !spent() else { reading.unread.insert(.focus); break }
    let focused = ax.focusedElement(application)
    guard focused.readable else { reading.unread.insert(.focus); continue }
    var node = focused.element
    for _ in 0...menuFocusLevels {
      guard let current = node else { break }
      guard !spent() else { reading.unread.insert(.focus); break }
      guard let role = ax.role(current) else { reading.unread.insert(.focus); break }
      if role == kAXMenuRole { reading.menus.append((current, .focus)); break }
      if role == kAXWindowRole || role == kAXApplicationRole { break }
      guard !spent() else { reading.unread.insert(.focus); break }
      node = ax.parent(current)
      if node == nil { reading.unread.insert(.focus) }  // an element below the window always has a parent
    }
  }
  return reading
}

/// The menu wait after a Show Menu that was sent (`showMenuSent`): `openMenus` read at once and every
/// `menuConfirmIntervalMs` until a menu appears that is not among `before`'s (the baseline read before the action)
/// through a source `before` read in full, or `menuConfirmWindowMs` has passed. The reads stop one interval past the
/// window (`openMenus`'s deadline), so the last poll reads in full and an app whose every read hangs for the messaging
/// timeout ends the wait one read past it.
func awaitShownMenu(_ scope: MenuScope, before: MenuReading, performed: AXError, ax: AXOps) -> MenuConfirmRecord {
  let start = ax.now()
  var record = MenuConfirmRecord(seen: nil, openBefore: before.menus.count, polls: 0, ms: 0,
                                 actionError: performed == .success ? nil : performed.rawValue,
                                 unreadBefore: before.unread.map(\.rawValue).sorted())
  while true {
    record.polls += 1
    let open = openMenus(scope, ax: ax, deadline: start + menuConfirmWindowMs + menuConfirmIntervalMs)
    record.ms = ax.now() - start
    if let new = open.menus.first(where: { menu in
      !before.unread.contains(menu.seen) && !before.menus.contains { ax.same($0.menu, menu.menu) }
    }) {
      record.seen = new.seen
      return record
    }
    if record.ms >= menuConfirmWindowMs { return record }
    ax.sleep(min(menuConfirmIntervalMs, menuConfirmWindowMs - record.ms))
  }
}

/// The Show Menu's answer from its confirmation: success (nothing thrown) once a menu was seen, else `menuUnconfirmed`.
func menuAnswer(_ record: MenuConfirmRecord, app: String) throws {
  if record.seen == nil { throw menuUnconfirmed(app: app) }
}

func menuUnconfirmed(app: String) -> EngineError {
  EngineError(name: "menuUnconfirmed",
    "The Show Menu action was sent to \(app), but no menu was seen to open within \(Int(menuConfirmWindowMs / 1000)) s. \(app) may have shown a menu of its own that accessibility does not expose (a web page's own menu, for one), or ignored the request. Observe the app (take a screenshot or call getAXState()) before any retry, and never retry blindly.")
}
