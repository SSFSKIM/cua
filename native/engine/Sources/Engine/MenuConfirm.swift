import ApplicationServices
import Foundation

// The Show Menu's confirmation (#374; the Linux engine's contract, cua #171 M4, ruling 687, Decision Log 2026-11-14,
// candidate 3): perform_secondary_action "Show Menu" (AXShowMenu) answers success only once a menu is seen to open,
// and `menuUnconfirmed` otherwise, the "sent, effect not seen" family's answer beside clickUnconfirmed and
// scrollUnconfirmed. The vendor answers success as soon as the Accessibility call does, menu or none.
//
// What counts as the menu, read just before the action and then every `menuConfirmIntervalMs` for up to
// `menuConfirmWindowMs` after it, the first read at once (`openMenus`):
// - an AXMenu child of the application element, which is where AppKit, Chromium, Electron, Gecko and Safari put the
//   context menu they pop up (`application`), read under the element's serving process and the app's;
// - an AXMenu child of the element itself, a popup or menu button's own menu (`element`);
// - the application's focused element, or one of its nearest `menuFocusLevels` ancestors, that is an AXMenu
//   (`focus`): a page's ARIA menu (role=menu, which Chrome and Safari expose as AXMenu) sits inside the page, not under
//   the application, and the WAI-ARIA menu pattern moves the focus onto its first item.
// A menu open before the action (by identity, CFEqual) confirms nothing by itself. A page that handles contextmenu
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

/// What the Show Menu's confirmation found (meta `menu`, value-free): where the new menu was seen (`application`,
/// `element` or `focus`; null when none was), how many menus were open before the action, the reads after it and the
/// milliseconds from the action's return to the last of them, and the action's AXError when it was not success (a
/// timeout, `showMenuSent`).
struct MenuConfirmRecord: Equatable {
  enum Seen: String { case application, element, focus }
  var seen: Seen?
  var openBefore: Int
  var polls: Int
  var ms: Double
  var actionError: Int32? = nil

  var wire: [String: Any] {
    var wire: [String: Any] = ["seen": seen?.rawValue ?? NSNull(), "openBefore": openBefore, "polls": polls,
                               "ms": (ms * 10).rounded() / 10]
    if let actionError { wire["actionError"] = Int(actionError) }
    return wire
  }
}

/// Whether a Show Menu's AXError counts as sent, so its menu is looked for: success, or cannotComplete, which is what an
/// app answers when it runs the menu's tracking loop inside the action and so replies only once the menu closes, after
/// the element's 1 s messaging timeout has passed with the menu open. Any other error is the element refusing the
/// action (`actionFailed`, as before).
func showMenuSent(_ performed: AXError) -> Bool { performed == .success || performed == .cannotComplete }

/// The processes a menu is looked for under: the element's serving process, then the app's when it is another.
func menuApplicationPids(owner: pid_t, appPid: pid_t) -> [pid_t] { owner == appPid ? [owner] : [owner, appPid] }

/// The menus open now that a Show Menu on `element` could have opened, each with where it was seen, in the order
/// above. Reads stop once `deadline` (on `ax.now`'s clock) has passed, so a hung app costs at most one read past it.
func openMenus(element: AXUIElement, applications: [AXUIElement], ax: AXOps, deadline: Double = .infinity) -> [(menu: AXUIElement, seen: MenuConfirmRecord.Seen)] {
  var menus: [(menu: AXUIElement, seen: MenuConfirmRecord.Seen)] = []
  let spent = { ax.now() >= deadline }
  for application in applications {
    if spent() { return menus }
    menus += ax.children(application).filter { ax.role($0) == kAXMenuRole }.map { ($0, .application) }
  }
  if spent() { return menus }
  menus += ax.children(element).filter { ax.role($0) == kAXMenuRole }.map { ($0, .element) }
  for application in applications {
    if spent() { return menus }
    var node = ax.element(application, kAXFocusedUIElementAttribute)
    for _ in 0...menuFocusLevels {
      guard let current = node, !spent() else { break }
      if ax.role(current) == kAXMenuRole { menus.append((current, .focus)); break }
      node = ax.parent(current)
    }
  }
  return menus
}

/// The menu wait after a Show Menu that was sent (`showMenuSent`): `openMenus` read at once and every
/// `menuConfirmIntervalMs` until one that is not among `before` (the menus open before the action) appears, or
/// `menuConfirmWindowMs` has passed. The reads stop one interval past the window (`openMenus`'s deadline), so the last
/// poll reads in full and an app whose every read hangs for the messaging timeout ends the wait at one read past it.
func awaitShownMenu(element: AXUIElement, applications: [AXUIElement], before: [AXUIElement], performed: AXError, ax: AXOps) -> MenuConfirmRecord {
  let start = ax.now()
  var record = MenuConfirmRecord(seen: nil, openBefore: before.count, polls: 0, ms: 0,
                                 actionError: performed == .success ? nil : performed.rawValue)
  while true {
    record.polls += 1
    let open = openMenus(element: element, applications: applications, ax: ax, deadline: start + menuConfirmWindowMs + menuConfirmIntervalMs)
    record.ms = ax.now() - start
    if let new = open.first(where: { menu in !before.contains { ax.same($0, menu.menu) } }) {
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
