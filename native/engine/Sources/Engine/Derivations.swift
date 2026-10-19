import ApplicationServices
import Foundation

// The vendor's derivations of what a Skyshot node's flags, value type, URL and the header's title carry, read from the
// pinned helper (static reading of the copy under the coordinating session's tier-2 work, 2026-10-19; M1a.2b). The
// per-element ones are the TransformedUIElement initialiser FUN_10074cb90, which `TransformedUIElement.init(element:
// context:)` 0x10074ca70, the tree walk FUN_1007584a4 and `addMenuBarWithImmediateItems` 0x1007569b8 all call, in the
// branch get_app_state takes: UIElementTransformationContext.type 0, `fullUIContext` (type 1, `eventStreamContext`,
// derives settability from a role set instead, FUN_1007500e0, and is never an observation's).

/// The roles whose AXValue settability is read in a Chromium window (the context's `isChromium`, F §1.7): the static set
/// FUN_10074ff74 (DAT_101402820) consulted by FUN_100751614. Every other Chromium element is not settable, whatever it
/// answers: Chromium answers AXValue settable on nearly every native view and web control.
let chromiumValueSettableRoles: Set<String> = ["AXComboBox", "AXIncrementor", "AXTextArea", "AXTextField"]

/// The containers whose incrementor FUN_100751614 leaves unsettable in a Chromium window (its fourth argument, read as
/// the element's parent role [inference: the walk passes it down from FUN_1007584a4's caller]).
private let dateTimeFieldRoles: Set<String> = ["AXDateField", "AXDateTimeArea", "AXTimeField"]

/// Whether an element's AXValue settability is read at all (FUN_10074cb90's value branch, guarded by the context's
/// isChromium byte): always outside Chromium; in a Chromium window only for the roles above, an incrementor that is not
/// a date or time field's, and a tab (AXRadioButton, subrole AXTabButton).
func readsValueSettability(role: String, subrole: String?, parentRole: String?, chromium: Bool) -> Bool {
  guard chromium else { return true }
  if role == "AXIncrementor", let parentRole, dateTimeFieldRoles.contains(parentRole) { return false }
  if chromiumValueSettableRoles.contains(role) { return true }
  return role == "AXRadioButton" && subrole == "AXTabButton"
}

/// The value type the grammar's `settable, <type>` names, `valueTypeName` (FUN_10074a794, indexing the table
/// `float | integer | boolean | string | date | unknown`): a switch or toggle checkbox is boolean whatever its value; a
/// CFNumber is float or integer by CFNumberIsFloatType, so an integral float prints `float`; then CFBoolean, CFString,
/// CFDate; anything else (a point, a range, an element) is unknown.
func valueTypeName(of value: CFTypeRef, role: String, subrole: String?) -> String {
  if role == "AXCheckBox", subrole == "AXSwitch" || subrole == "AXToggle" { return "boolean" }
  let type = CFGetTypeID(value)
  if type == CFNumberGetTypeID() { return CFNumberIsFloatType((value as! CFNumber)) ? "float" : "integer" }
  if type == CFBooleanGetTypeID() { return "boolean" }
  if type == CFStringGetTypeID() { return "string" }
  if type == CFDateGetTypeID() { return "date" }
  return "unknown"
}

/// UIAccessibilityTraitSelected, the bit FUN_10074cb90 reads from AXTraits (FUN_10079d6c4) for an element that does not
/// carry AXSelected (a Catalyst view).
let selectedTrait: Int64 = 1 << 3

/// isSelected (FUN_10074cb90): AXSelected when the element carries it, else the selected trait.
func isSelected(selected: Bool?, traits: Int64?) -> Bool { selected ?? ((traits ?? 0) & selectedTrait != 0) }

/// Whether isSelectable may be true for the role (FUN_10077d1e4): never for a menu item or a menu-bar item, whose
/// AXSelected tracks the open menu, not a selection.
func selectableRole(_ role: String) -> Bool { role != "AXMenuItem" && role != "AXMenuBarItem" }

/// The URL a node carries (FUN_10074cb90): AXURL; a window without one takes its AXDocument, parsed as a URL (Foundation's
/// `URL(string:)`, which percent-encodes what it can and fails on what it cannot, as the vendor's parse does).
func nodeURL(role: String, url: String?, document: () -> String?) -> String? {
  if let url { return url }
  guard role == kAXWindowRole, let document = document(), let parsed = URL(string: document) else { return nil }
  return bounded(parsed.absoluteString)
}

/// The header's window title, `ApplicationWindow.title` 0x10076e174: the window server's name for the window (its
/// CGWindow's kCGWindowName), else its AXTitle; when that is empty, a Finder window at the desktop-icon level is
/// "Desktop". Nil when neither exists, which the renderer prints as `Unknown`, as the vendor's llmDescription 0x10022ac8c
/// defaults it. The window server gives other processes' window names only to a process holding Screen Recording, so an
/// engine without the grant falls back to AXTitle, the vendor's own fallback for a window with no name.
func headerTitle(windowName: String?, axTitle: String?, desktopLevel: Bool, ownerIsFinder: Bool) -> String? {
  let title = windowName ?? axTitle
  if (title ?? "").isEmpty, desktopLevel, ownerIsFinder { return "Desktop" }
  return title
}

/// What the window server says about a window, by its number: its name (present only under Screen Recording) and
/// whether it sits at the desktop-icon level (`CGWindow.isDesktopLevel` 0x10024d3a8).
func windowServerName(of window: CGWindowID) -> (name: String?, desktopLevel: Bool) {
  guard let list = CGWindowListCopyWindowInfo([.optionIncludingWindow], window) as? [[String: Any]],
        let info = list.first(where: { ($0[kCGWindowNumber as String] as? Int).map(CGWindowID.init) == window }) else { return (nil, false) }
  let level = info[kCGWindowLayer as String] as? Int
  return ((info[kCGWindowName as String] as? String).map(bounded), level == Int(CGWindowLevelForKey(.desktopIconWindow)))
}
