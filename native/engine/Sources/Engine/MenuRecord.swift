import ApplicationServices
import Foundation

// The menu-bar item's record (R/F-helper-logic.md §16.9, R/sky-behaviour.md §10; the Decision Log's M2a vendor reading,
// item 10). A plain left click on an AXMenuBarItem whose direct AXChildren include an AXMenu, and the AXPick secondary
// action on one, press nothing and open nothing: the item is recorded for the app on the connection, and while it is
// recorded every observation of the app roots its walk at the item (the item, its menu, the menu items) instead of the
// window and the menu bar, keeps the window's header and takes no screenshot. The record clears after a successful
// element click or secondary action on the app, on the AXCancel secondary action of a menu-bar item (which sends
// nothing), when another item is recorded, and when the item is gone; an observation reads without clearing, and
// keyboard and coordinate actions leave it. No AXCancel, Escape or menu-close event is ever sent.
//
// cua's difference, declared: no activation. The vendor fakes activation for the observed window first
// (safelyEnforceActiveState); a background app's menu items are read and pressed through Accessibility without it, and
// cua's activation is per action. Whether an item AppKit validates against the key window's responder chain reads
// enabled and works without it is M2a.5's live check. The vendor's persistent observer also clears on `menuClosed`;
// cua has no persistent observer and never opens the menu, so that clearing is not built.

/// The menu a menu-bar item opens: the first of its direct AXChildren whose role is AXMenu (FUN_100083904; no
/// recursion, no open-state test: a closed menu's AXMenu child is exposed). Nil for any other element.
func menuOfMenuBarItem(_ element: AXUIElement, ax: AXOps) -> AXUIElement? {
  guard ax.role(element) == kAXMenuBarItemRole else { return nil }
  return ax.children(element).first { ax.role($0) == kAXMenuRole }
}

extension ConnectionState {
  /// Records `item` for the app (by its lineage key), replacing any earlier record.
  func recordMenu(_ item: AXUIElement, app key: String) { menuRecords[key] = item }

  func clearMenuRecord(app key: String) { menuRecords[key] = nil }

  /// The recorded item an observation of the app roots its walk at; a record whose item is gone (its handle no longer
  /// valid) is dropped, and the observation walks the window.
  func menuRoot(app key: String, stillValid: (AXUIElement) -> Bool = { copyAttribute($0, kAXRoleAttribute).error != .invalidUIElement }) -> AXUIElement? {
    guard let item = menuRecords[key] else { return nil }
    guard stillValid(item) else {
      menuRecords[key] = nil
      return nil
    }
    return item
  }
}
