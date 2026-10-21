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
// an advertised action (a route-1 click, a secondary action), set_value and select_text. Keys and typed text are not
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
