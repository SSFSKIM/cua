import Foundation

// The wait for a Chromium-family app's complete accessibility mode (#366, the design session's ruling 766; the native
// engine spec's Decision Log, "#366"). An AX element action into Electron or Chrome answers success and runs no handler
// when it lands less than about 2.25 s after the engine's enablement write (Electron's AXManualAccessibility, Chrome's
// AXEnhancedUserInterface): every write restarts Electron's debounce to its complete mode, until which a button is
// exposed but its press does not reach the renderer, and nothing signals the mode's arrival (Electron 44.4.5's
// `electron_application.mm`; the spike's hosted runs 44032504512, 0 of 124 presses delivered at 0.92 s or less after the
// write and 283 of 283 at 3.45 s or more, and 44052940748, 30 of 30 at 2.25 s and 7 of 30 at 2 s, in a parity and a
// default Electron window and Chrome for Testing). So a request that may carry an element action into an app whose page
// engine is Chromium's (`PageEngine.chromium`) waits out what remains of `chromiumActionWindowMs` since the engine's last
// accepted write of that process's attribute (`WebAccessibility.lastEnablementWrite`), and not at all once it has
// passed or when the engine wrote none. The cause is the renderer's mode, not the action, so every element action waits:
// a press, a Show Menu, a value or selection write, a scroll into view. The answer is unchanged: a dispatched action
// stays a dispatch, not a confirmation (ruling 757).
//
// No activation is held through the wait: it runs in execute's prologue, before the request takes any hold of its own,
// and a focus hold the connection still keeps on the app from an earlier action ends first (the action takes it again,
// FocusHold.swift: a release costs only a re-activation). A recorded menu's span is the one hold an action keeps, a press
// on the menu's item, which must land inside it (MenuSpan.swift); that press is AppKit's menu, not the page's renderer,
// so it does not wait.

/// The window after the engine's last accepted enablement write within which an element action into a Chromium-family
/// app waits for the rest of it (#366): the threshold sweep's 2.25 s, at which every press delivered, and a 0.25 s margin.
/// The wait is what remains of the window, from 0 up to the whole of it.
let chromiumActionWindowMs: Double = 2_500

/// The methods whose every request may carry an AX element action into its app (#366): an element click's own action,
/// its scroll into view and the focus of a field, a coordinate click's #282 element route, perform_secondary_action's
/// actions (AXShowMenu included), set_value's and select_text's writes. A scroll carries one only when it names an
/// element (`mayCarryElementAction`). press_key, type_text, paste and drag post events only; get_app_state, resolve_app
/// and list_apps act on nothing.
let elementActionMethods: Set<String> = ["click", "perform_secondary_action", "select_text", "set_value"]

/// Whether a request may carry an AX element action into its app (#366): `elementActionMethods`, and a scroll naming an
/// element, whose AXScrollToVisible (or its fallbacks' writes, Positioning.swift) goes to the page before the wheel. A
/// scroll at a point or the window's centre is a posted wheel and its read-back; its fallback's bar write (#328) is
/// never a web area's or a page scroller's (ScrollConfirm.swift), so it does not wait.
func mayCarryElementAction(method: String, args: [String: Any]) -> Bool {
  elementActionMethods.contains(method) || (method == "scroll" && args["element"] != nil)
}

/// How long an element action into an app of page engine `engine` waits at `now` (monotonic ms) when the engine's last
/// accepted enablement write of its process returned at `lastWrite`: what remains of `chromiumActionWindowMs` for a
/// Chromium-family app, else 0; 0 without a write.
func chromiumActionWaitMs(engine: PageEngine, lastWrite: Double?, now: Double) -> Double {
  guard engine == .chromium, let lastWrite else { return 0 }
  return min(chromiumActionWindowMs, max(0, lastWrite + chromiumActionWindowMs - now))
}

/// The readiness the request's deadline cannot wait for (#366): the engine's timeout, as a settle or a launch wait the
/// deadline cuts (Skyshot.swift), with nothing dispatched.
let chromiumReadinessTimeout = EngineError(name: "timeoutReached", "timeoutReached")

/// The wait itself on `connection` (`chromiumActionWaitMs`), with the holds the module comment names: none while its
/// recorded menu's span holds an activation, its focus hold ended before `sleep` runs. `lastWrite` is read again after
/// every sleep: an accepted write another connection made meanwhile (an attribute that could not be read is written but
/// never owned, so a later observation writes it again) restarts the window, which is waited out too, until none of it
/// remains. A wait that would end at or past `budgetMs` from its start, the request's remaining deadline, throws
/// `chromiumReadinessTimeout` before it sleeps, the holds as they were. Answers the milliseconds waited.
@discardableResult
func waitOutChromiumWindow(engine: PageEngine, lastWrite: () -> Double?, connection: ConnectionState, budgetMs: Double,
                           now: () -> Double, sleep: (Double) -> Void) throws -> Double {
  let end = now() + budgetMs
  var waited = 0.0
  while true {
    let started = now()
    let wait = chromiumActionWaitMs(engine: engine, lastWrite: lastWrite(), now: started)
    guard wait > 0, connection.menuSpan.app == nil else { return waited }
    guard started + wait < end else { throw chromiumReadinessTimeout }
    if connection.focusHold.app != nil { connection.endFocusHold() }
    sleep(wait)
    waited += wait
  }
}

extension Engine {
  /// execute's step (#366), after the input's enablement and the holds' steps, before the method runs: for a request that
  /// may carry an element action (`mayCarryElementAction`), the wait for `app`'s process `pid` of generation `launched`,
  /// on the engine's clock and sleeper, within `budgetMs`, the request's remaining deadline. Answers the milliseconds
  /// waited; throws `chromiumReadinessTimeout` when the window outlasts the budget.
  @discardableResult
  func awaitChromiumReadiness(method: String, args: [String: Any], app: ResolvedApp, pid: pid_t, launched: Date?,
                              connection: ConnectionState, budgetMs: Double) throws -> Double {
    guard mayCarryElementAction(method: method, args: args) else { return 0 }
    return try waitOutChromiumWindow(engine: webAccessibility.pageEngine(app.appPath),
                                     lastWrite: { [webAccessibility] in webAccessibility.lastEnablementWrite(pid: pid, launched: launched) },
                                     connection: connection, budgetMs: budgetMs, now: monotonicClock, sleep: pause)
  }
}
