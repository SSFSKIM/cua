import AppKit
import CoreGraphics
import Foundation

// Where a cursor's panel sits and what it covers (the spec's Design, "Where it shows" and "The overlay window"), as pure
// functions over a window-list reading: the panel is ordered directly above its target window at that window's level,
// so whatever covers the target covers the cursor (O6); while the target app is frontmost or has a menu open (an
// on-screen window of its pid at the pop-up menu level, 101) it rises to 102, above menus, as the vendor's does (VC §1);
// while the target window is not on screen in the current Space (minimised, closed, another Space) it hides.

/// The pop-up menu window level (a menu, a context menu included) and the level a raised cursor takes.
let popUpMenuLevel = 101
let raisedCursorLevel = 102

/// One on-screen window as `CGWindowListCopyWindowInfo(.optionOnScreenOnly)` lists it, front to back.
struct ListedWindow: Equatable, Sendable {
  let number: CGWindowID
  let owner: pid_t
  let layer: Int
  /// Global points, top-left origin.
  let bounds: CGRect
}

/// The on-screen windows, front to back (no window name is read).
func onScreenWindowList() -> [ListedWindow] {
  guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return [] }
  return list.compactMap { info in
    guard let number = (info[kCGWindowNumber as String] as? NSNumber)?.uint32Value,
          let owner = (info[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value,
          let layer = (info[kCGWindowLayer as String] as? NSNumber)?.intValue,
          let dictionary = info[kCGWindowBounds as String] as? NSDictionary,
          let bounds = CGRect(dictionaryRepresentation: dictionary) else { return nil }
    return ListedWindow(number: number, owner: owner, layer: layer, bounds: bounds)
  }
}

/// Where a cursor's panel is ordered: above `window`, at `level`, shown or not.
struct CursorAttachment: Equatable, Sendable {
  let window: CGWindowID
  let owner: pid_t
  let level: Int
  let visible: Bool
}

/// The attachment of a cursor to `window` now: hidden when the window is not in the on-screen list; at 102 while its
/// owner is the frontmost app or has a menu open; else at the window's own level.
func cursorAttachment(window: CGWindowID, list: [ListedWindow], frontmostPid: pid_t?) -> CursorAttachment {
  guard let target = list.first(where: { $0.number == window }) else {
    return CursorAttachment(window: window, owner: 0, level: 0, visible: false)
  }
  let menuOpen = list.contains { $0.owner == target.owner && $0.layer == popUpMenuLevel }
  let raised = target.owner == frontmostPid || menuOpen
  return CursorAttachment(window: window, owner: target.owner, level: raised ? raisedCursorLevel : target.layer, visible: true)
}

/// The vendor's skip check (FUN_100091650): is something other than the target the topmost window at `point` (global,
/// top-left)? The engine's own windows never count; only the levels a user's windows and menus take (0…19 and the
/// pop-up menu level), not the Dock, the menu bar or the system's overlays.
func occluded(_ point: CGPoint, target: CGWindowID, list: [ListedWindow], enginePid: pid_t) -> Bool {
  guard let top = list.first(where: { $0.owner != enginePid && ($0.layer < 20 || $0.layer == popUpMenuLevel) && $0.bounds.contains(point) })
  else { return false }
  return top.number != target
}

/// A screen as the cursor sees it, in AppKit global coordinates (bottom-left origin at the primary screen).
struct CursorScreen: Equatable, Sendable {
  let frame: CGRect
  let visibleFrame: CGRect

  /// The point of this screen nearest to `point` (AppKit global): where a cursor arriving from another screen starts.
  func nearestPoint(to point: CGPoint) -> CGPoint {
    CGPoint(x: min(max(point.x, frame.minX), frame.maxX), y: min(max(point.y, frame.minY), frame.maxY))
  }
}

/// The screens, and the conversion from the engine's posting space (global, top-left origin at the primary display)
/// to a panel's own coordinates.
struct CursorScreens: Equatable, Sendable {
  let primaryHeight: CGFloat
  let all: [CursorScreen]

  static let none = CursorScreens(primaryHeight: 0, all: [])

  /// A global top-left point in AppKit global coordinates.
  func appKit(_ global: CGPoint) -> CGPoint { CGPoint(x: global.x, y: primaryHeight - global.y) }

  /// The screen whose full frame holds the global point (the menu bar's row and the areas beside a camera housing
  /// included); nil when no screen does.
  func screen(containing global: CGPoint) -> CursorScreen? {
    let p = appKit(global)
    return all.first { p.x >= $0.frame.minX && p.x < $0.frame.maxX && p.y > $0.frame.minY && p.y <= $0.frame.maxY }
  }

  /// The global point in `screen`'s panel coordinates (AppKit, y up, origin at the screen's bottom-left).
  func local(_ global: CGPoint, in screen: CursorScreen) -> CGPoint {
    let p = appKit(global)
    return CGPoint(x: p.x - screen.frame.minX, y: p.y - screen.frame.minY)
  }

  /// The screen's visible frame in its panel's coordinates: the path choice's in-bounds preference.
  func localVisibleFrame(of screen: CursorScreen) -> CGRect {
    screen.visibleFrame.offsetBy(dx: -screen.frame.minX, dy: -screen.frame.minY)
  }

  /// Read from AppKit; main thread only.
  @MainActor static func current() -> CursorScreens {
    let screens = NSScreen.screens
    return CursorScreens(primaryHeight: screens.first?.frame.maxY ?? 0,
                         all: screens.map { CursorScreen(frame: $0.frame, visibleFrame: $0.visibleFrame) })
  }
}
