import Foundation

// The wait for a Chromium-family app's complete accessibility mode (#366, the design session's rulings 766 and 772; the
// native engine spec's Decision Log, "#366", "#366's review" and "#366's observation wait"). An AX element action into
// Electron or Chrome answers success and runs no handler when it lands less than about 2.25 s after the engine's
// enablement write (Electron's AXManualAccessibility, Chrome's AXEnhancedUserInterface): every write restarts Electron's
// debounce to its complete mode, until which a button is exposed but its press does not reach the renderer, and nothing
// signals the mode's arrival (Electron 44.4.5's `electron_application.mm`; the spike's hosted runs 44032504512, 0 of 124
// presses delivered at 0.92 s or less after the write and 283 of 283 at 3.45 s or more, and 44052940748, 30 of 30 at
// 2.25 s and 7 of 30 at 2 s, in a parity and a default Electron window and Chrome for Testing). The process is taken to
// be ready `chromiumActionWindowMs` after the engine's last accepted write of its attribute
// (`WebAccessibility.lastEnablementWrite`, `chromiumReadyAt`).
//
// The mode's arrival also changes what the tree says while its handles stay valid (ruling 772, diagnostic run
// 44068144650): Chrome's buttons gain AXPress, fields their placeholder. So the first observation after a write waits for
// readiness before it reads the tree (`awaitObservationReadiness`), within its deadline; one that cannot reads anyway, and
// its entries carry their read time (`LineageEntry.recordedAt`), earlier than readiness. Then the action side: a request
// that may carry an element action waits for readiness too (`awaitChromiumReadiness`), and its target, when recorded
// before readiness, is read again from its own handle, never re-found by identity (`Lineage.resolve`'s `readiness`).
// The answer is unchanged: a dispatched action stays a dispatch, not a confirmation (ruling 757).
//
// No activation is held through the action's wait: it runs in execute's prologue, before the request takes any hold of
// its own, and a focus hold the connection still keeps on the app from an earlier action ends first (the action takes it
// again, FocusHold.swift: a release costs only a re-activation). A recorded menu's span is the one hold an action keeps,
// a press on the menu's item, which must land inside it (MenuSpan.swift); that press is AppKit's menu, not the page's
// renderer, so it does not wait. An observation's wait leaves the holds as they are, as every observation does.

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

/// When a process of page engine `engine`, whose last accepted enablement write returned at `lastWrite` (monotonic ms),
/// is taken to be in its complete mode: the window's end for a Chromium-family app; nil for any other, or without a write.
func chromiumReadyAt(engine: PageEngine, lastWrite: Double?) -> Double? {
  guard engine == .chromium, let lastWrite else { return nil }
  return lastWrite + chromiumActionWindowMs
}

/// How long an element action into an app of page engine `engine` waits at `now` (monotonic ms) when the engine's last
/// accepted enablement write of its process returned at `lastWrite`: what remains of `chromiumActionWindowMs` for a
/// Chromium-family app, else 0; 0 without a write.
func chromiumActionWaitMs(engine: PageEngine, lastWrite: Double?, now: Double) -> Double {
  guard let readyAt = chromiumReadyAt(engine: engine, lastWrite: lastWrite) else { return 0 }
  return min(chromiumActionWindowMs, max(0, readyAt - now))
}

/// Whether an entry read at `recordedAt` was read before its process's readiness `readyAt` (ruling 772): its identity and
/// actions may be Basic mode's. An entry without a read time (one the unit tests built) is not.
func recordedBeforeReadiness(_ recordedAt: Double?, readyAt: Double) -> Bool {
  guard let recordedAt else { return false }
  return recordedAt < readyAt
}

/// How a wait for readiness ended: ready (after `waitedMs`), or cut by the deadline, either because the rest of the
/// window would end at or past it (nothing slept for it) or because a sleep woke at or past it.
enum ChromiumReadiness: Equatable {
  case ready(waitedMs: Double)
  case deadline(waitedMs: Double)

  var waitedMs: Double {
    switch self {
    case .ready(let ms), .deadline(let ms): return ms
    }
  }
}

/// The wait for readiness (`chromiumActionWaitMs`) within `budgetMs`, the request's remaining deadline. `lastWrite` is
/// read again after every sleep: an accepted write another connection made meanwhile (an attribute that could not be
/// read is written but never owned, so a later observation writes it again) restarts the window, which is waited out
/// too, until none of it remains. A wait that would end at or past the deadline is not slept; a wake at or past it ends
/// the wait (a sleep can overshoot). `mayWait` false answers ready at once; `beforeSleep` runs before every sleep.
func waitForChromiumReadiness(engine: PageEngine, lastWrite: () -> Double?, budgetMs: Double, now: () -> Double,
                              sleep: (Double) -> Void, mayWait: () -> Bool = { true },
                              beforeSleep: () -> Void = {}) -> ChromiumReadiness {
  let end = now() + budgetMs
  var waited = 0.0
  while true {
    let started = now()
    let wait = chromiumActionWaitMs(engine: engine, lastWrite: lastWrite(), now: started)
    guard wait > 0, mayWait() else { return .ready(waitedMs: waited) }
    guard started + wait < end else { return .deadline(waitedMs: waited) }
    beforeSleep()
    sleep(wait)
    waited += wait
    // A sleep that overslept into the deadline is not ready, whatever remains of the window.
    guard now() < end else { return .deadline(waitedMs: waited) }
  }
}

/// The readiness the request's deadline cannot wait for (#366): the engine's timeout, as a settle or a launch wait the
/// deadline cuts (Skyshot.swift), with nothing dispatched.
let chromiumReadinessTimeout = EngineError(name: "timeoutReached", "timeoutReached")

/// The action's wait on `connection` (`waitForChromiumReadiness`), with the holds the module comment names: none while
/// its recorded menu's span holds an activation, its focus hold ended before the sleep. A deadline that cuts the wait
/// throws `chromiumReadinessTimeout`; a wait refused before its sleep leaves the holds as they were. Answers the
/// milliseconds waited.
@discardableResult
func waitOutChromiumWindow(engine: PageEngine, lastWrite: () -> Double?, connection: ConnectionState, budgetMs: Double,
                           now: () -> Double, sleep: (Double) -> Void) throws -> Double {
  let outcome = waitForChromiumReadiness(engine: engine, lastWrite: lastWrite, budgetMs: budgetMs, now: now, sleep: sleep,
                                         mayWait: { connection.menuSpan.app == nil },
                                         beforeSleep: { if connection.focusHold.app != nil { connection.endFocusHold() } })
  guard case .ready(let waited) = outcome else { throw chromiumReadinessTimeout }
  return waited
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

  /// get_app_state's wait (ruling 772), after its enablement step and before it reads the tree: the rest of the window
  /// after the last accepted write to `app`'s process, whichever request made it, within `budgetMs`, the request's
  /// remaining deadline. A deadline that cuts it is no error: the observation reads anyway, its entries recorded before
  /// readiness. The holds are left as they are.
  func awaitObservationReadiness(app: ResolvedApp, pid: pid_t, launched: Date?, budgetMs: Double) -> ChromiumReadiness {
    waitForChromiumReadiness(engine: webAccessibility.pageEngine(app.appPath),
                             lastWrite: { [webAccessibility] in webAccessibility.lastEnablementWrite(pid: pid, launched: launched) },
                             budgetMs: budgetMs, now: monotonicClock, sleep: pause)
  }

  /// When `app`'s process `pid` of generation `launched` is taken to be ready (`chromiumReadyAt`), with the engine's now:
  /// what an element target's backstop compares its read time with (`Lineage.resolve`); nil when it has no readiness.
  func entryReadiness(app: ResolvedApp, pid: pid_t, launched: Date?) -> EntryReadiness? {
    chromiumReadyAt(engine: webAccessibility.pageEngine(app.appPath), lastWrite: webAccessibility.lastEnablementWrite(pid: pid, launched: launched))
      .map { EntryReadiness(readyAt: $0, now: monotonicClock()) }
  }
}

/// The readiness an element target is checked against (ruling 772): the process's readiness time, and now, which a
/// refreshed entry takes as its read time.
struct EntryReadiness: Equatable {
  let readyAt: Double
  let now: Double
}
