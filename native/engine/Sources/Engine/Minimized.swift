import ApplicationServices
import Foundation

// The minimized primary window (the Decision Log's "M2a pre-flight" item 2, maws-3f's no-screenshot tightening, and
// "M2a vendor reading" item 2; R/sky-behaviour.md §2, "Minimized window"). The engine never un-minimizes the owner's
// window: it never reopens an app whose primary window is minimized (Skyshot.swift's preparation) and never writes
// AXMinimized or performs AXAddToStage. It observes a minimized primary window in place when the Accessibility API
// exposes its tree, with no screenshot, since a minimized window is not composited and any off-screen capture would at
// best show its last frame before minimizing, not the state the model acts on; the Skyshot says why (`screenshotOmitted:
// "windowMinimized"`), which the service carries as the result's meta. Where the window exposes no tree the observation
// is refused. Input that needs the window on screen, a click, drag or scroll at a point (a synthesized element click, a
// coordinate), is refused before anything is posted, while what reaches the element through Accessibility still acts:
// an advertised action (a route-1 click, a secondary action), set_value and select_text, whose focusing click is
// skipped in a minimized window rather than refused (ElementInput.swift's focusField). Keys and typed text are not
// refused: they go to the process, whose menu key equivalents work with no window on screen. An off-stage Stage
// Manager window that reads minimized falls under the same rule. Declared differences from the vendor: its reopen of a
// minimized app and its Stage Manager writes.

/// The reason a requested screenshot was not taken, as the Skyshot and the result's meta carry it.
let windowMinimizedReason = "windowMinimized"

/// Whether a window reads AXMinimized true (unreadable reads as not minimized, as the vendor's preparation reads nil).
func isMinimized(_ window: AXUIElement) -> Bool { bool(attribute(window, kAXMinimizedAttribute)) == true }

/// What an observation does with its primary window: capture it or not, and the reason a requested screenshot is
/// omitted. Refuses a minimized window that exposes no tree (`windowMinimized`) rather than returning an empty one.
func minimizedObservation(minimized: Bool, exposesTree: Bool, includeScreenshot: Bool, app: String) throws -> (capture: Bool, screenshotOmitted: String?) {
  guard minimized else { return (includeScreenshot, nil) }
  guard exposesTree else {
    throw EngineError(name: windowMinimizedReason, "The \(app) window is minimized and shows no content to read. Ask the user to restore the window, then get the app's state again.")
  }
  return (false, includeScreenshot ? windowMinimizedReason : nil)
}

/// Refuses input at a point in a minimized window, before anything is posted, naming what still acts.
func refuseMinimizedWindow(minimized: Bool, app: String) throws {
  guard minimized else { return }
  throw EngineError(name: windowMinimizedReason, "The \(app) window is minimized, so nothing can be clicked, dragged or scrolled at a point in it. Ask the user to restore the window, or use setValue, selectText or performSecondaryAction, which act without it.")
}

/// Pointer input aimed into `window` (a click, drag or scroll at a point): refused when the window is minimized, before
/// `deliver` runs, which holds everything the method does after placing its point (its delta, its in-flight
/// intervention check, any post). No window (a menu-bar item's) is not the rule's case.
func pointerInput<T>(in window: AXUIElement?, app: String, minimized: (AXUIElement) -> Bool = isMinimized, _ deliver: () throws -> T) throws -> T {
  try refuseMinimizedWindow(minimized: window.map(minimized) ?? false, app: app)
  return try deliver()
}

/// A coordinate placed in `window` by `place` (the connection's screenshot of it), refused first when the window is
/// minimized: the cause is the minimized window, not a missing screenshot the model could not get anyway.
func placeCoordinate(in window: AXUIElement, app: String, minimized: (AXUIElement) -> Bool = isMinimized, _ place: () throws -> CGPoint) throws -> CGPoint {
  try pointerInput(in: window, app: app, minimized: minimized, place)
}

/// Whether an element's own window reads minimized, through `ax` (a menu-bar item has no window: not the rule's case).
func elementWindowMinimized(_ element: AXUIElement, ax: AXOps) -> Bool {
  guard let window = ax.element(element, kAXWindowAttribute) else { return false }
  return bool(ax.read(window, kAXMinimizedAttribute)) == true
}

/// An element scroll's placement, the element resolved: its own window refused when minimized before `position` (the
/// scroll into view, then the point) runs, so a minimized element with no visible point answers windowMinimized
/// rather than cannotClickOffscreenElement, and nothing is scrolled into view first.
func elementScrollPlacement<T>(_ element: AXUIElement, app: String, ax: AXOps, _ position: () throws -> T) throws -> T {
  try refuseMinimizedWindow(minimized: elementWindowMinimized(element, ax: ax), app: app)
  return try position()
}

/// focusField's fallback click (set_value, select_text), skipped rather than refused when the element's own window is
/// minimized: both act through Accessibility, which needs no window on screen.
func focusFallbackClick(_ element: AXUIElement, ax: AXOps, _ click: () throws -> Void) rethrows {
  guard !elementWindowMinimized(element, ax: ax) else { return }
  try click()
}
