import ApplicationServices
import Foundation

// The focus hold (the Decision Log's 2026-10-22 entry "route 3 for key equivalents and element actions", amending M2a's
// route table): route 3's activation for an element's own action or attribute write (a click by AXPress or AXPick,
// set_value, select_text, perform_secondary_action) and for a ⌘ chord, taken when the app does not believe it has focus.
//
// Held across the interaction, as the vendor's SyntheticAppFocusEnforcer holds its believed-active state: the enforcer
// is created at the first element interaction, and once the app believes itself active nothing re-activates it or
// withdraws it until the controller's lifecycle ends (R/F-helper-logic.md §5.1, §5.5, §16.9 item 6;
// R/sky-behaviour.md §12 and §23 item 18). So the first such action of a connection on an app runs the activation with
// its guard (the time rides in the meta as `activationGuardMs`), and the actions after it run inside it. A process
// serving a panel of the app is activated in its own process, under the same hold.
//
// The release points are cua's, since the vendor's only one is its controller's lifecycle end (instance removal, app
// termination, an AppModify deactivate whose trigger was not read): the hold ends, with route 3's deactivation (subtype
// 2, only when the app believes itself active but is not), when the connection closes (the vendor's instance removal);
// before the first request on the connection aimed at another app (the conservative reading of a silent vendor); and
// after `focusHoldIdleMs` with no request observing or acting on the held app (the menu span's bound; the vendor has
// none). An action after a release activates again. The activation is the process's: HeldActivations shares one among
// every connection's holds and menu spans, and the last holder's release withdraws it. A per-action activation (a
// synthesized click's, a drag's, a paste's) on a held process neither activates it again nor withdraws it
// (`ActivationSystem.held`), so a click amid the interaction never leaves the hold believing in an activation the app
// no longer has.

/// How long a focus hold outlasts the last request that observed or acted on its app: the menu span's 120 s, which a
/// model's turn between two actions on the app should not outlast. A release costs only a re-activation at the next
/// action (its hooks fire again), not the action.
let focusHoldIdleMs: Double = 120_000

/// The processes one focus hold holds, each with its release; the hold's own release releases them all, from the
/// connection's thread or the idle bound's timer.
final class HeldProcesses: @unchecked Sendable {
  private let lock = NSLock()
  private var releases: [pid_t: () -> Bool] = [:]

  func contains(_ pid: pid_t) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    return releases[pid] != nil
  }

  func add(_ pid: pid_t, release: @escaping () -> Bool) {
    lock.lock()
    defer { lock.unlock() }
    releases[pid] = release
  }

  /// Releases every process; false when a deactivation that was due could not post.
  func releaseAll() -> Bool {
    lock.lock()
    let all = releases
    releases = [:]
    lock.unlock()
    return all.values.reduce(true) { $1() && $0 }
  }
}

/// Whether a request aimed at `app` ends the connection's hold on `heldApp` before it runs: one aimed at another app does;
/// one aimed at no app (list_apps) does not.
func focusHoldEndsBefore(app: String?, heldApp: String?) -> Bool {
  guard let app, let heldApp else { return false }
  return app != heldApp
}

/// The methods whose request on the held app restarts the idle bound: its observation and every input method.
/// resolve_app and list_apps act on nothing.
private let focusHoldRenewingMethods: Set<String> = ["get_app_state", "click", "press_key", "type_text", "paste", "set_value",
                                                     "select_text", "perform_secondary_action", "scroll", "drag"]

func focusHoldRenews(method: String, app: String?, heldApp: String?) -> Bool {
  app != nil && app == heldApp && focusHoldRenewingMethods.contains(method)
}

/// Holds route 3's activation of `pid` for the connection's interaction with `app`: nothing when the hold already has
/// the process; else the process's held activation acquired (HeldActivations: the in-flight intervention check under its
/// lock first, then `activation()`'s run with its guard time into `meta`, or another holder's shared), joining the
/// connection's hold on the app or starting a new one, which releases a hold on another app first. A user event or a
/// failed guard (activationFailed, the activation undone) throws with nothing held.
func holdFocus(app key: String, pid: pid_t, connection: ConnectionState, activations: HeldActivations,
               activation: () -> FakeActivation, beforeActivating: () throws -> Void, meta: inout InputMeta) throws {
  let joining = connection.focusHold.app == key
  if joining && connection.focusHeld.contains(pid) { return }
  let release = try activations.acquire(pid: pid, beforeActivating: beforeActivating, make: activation, meta: &meta)
  if joining {
    connection.focusHeld.add(pid, release: release)
    return
  }
  let processes = HeldProcesses()
  processes.add(pid, release: release)
  connection.focusHeld = processes
  connection.focusHold.hold(app: key) { processes.releaseAll() }
}

extension ConnectionState {
  /// The hold ends: every process it holds released.
  func endFocusHold() { focusHold.end() }
}

extension Engine {
  /// The activation system of a per-action activation: the system's, with the engine's held activations left alone.
  /// Never the system of an activation HeldActivations itself runs, whose registry lock `held` would take again.
  var perActionActivation: ActivationSystem {
    var system = ActivationSystem()
    system.held = { [heldActivations] in heldActivations.holders($0) > 0 }
    return system
  }

  /// An element action's route: 3 when the process serving the element does not believe it has focus, unless the
  /// connection's recorded menu of the app already holds its activation (MenuSpan.swift).
  func actionRoute(for target: ElementTarget, app: ResolvedApp, connection: ConnectionState) -> InputRoute {
    elementActionRoute(believesFocus: ActivationSystem().believesItHasFocus(target.owner), insideHeldMenu: connection.menuSpan.app == app.key)
  }

  /// The focus hold for an element action: the process serving the element, activated for the element's own window (a
  /// panel's is its serving process's; the app's primary window when it has none), the user's window kept on top by
  /// AXRaise as route 3's clicks keep it.
  func holdElementFocus(_ target: ElementTarget, app: ResolvedApp, appPid: pid_t, guarding: InterventionGuard,
                        context: ExecutionContext, meta: inout InputMeta) throws {
    try holdingFocus(pid: target.owner, app: app, guarding: guarding, context: context, meta: &meta) {
      if let window = elementAttribute(target.element, kAXWindowAttribute) {
        return FakeActivation(pid: target.owner, appPid: appPid, window: window)
      }
      let application = prepare(AXUIElementCreateApplication(appPid))
      return FakeActivation(pid: target.owner, appPid: appPid, window: primaryWindow(of: application) ?? application)
    }
  }

  /// The focus hold for a key equivalent: the app, activated for its primary window, as paste's activation is.
  func holdKeyFocus(_ app: ResolvedApp, pid: pid_t, application: AXUIElement, guarding: InterventionGuard,
                    context: ExecutionContext, meta: inout InputMeta) throws {
    try holdingFocus(pid: pid, app: app, guarding: guarding, context: context, meta: &meta) {
      FakeActivation(pid: pid, window: primaryWindow(of: application) ?? application)
    }
  }

  private func holdingFocus(pid: pid_t, app: ResolvedApp, guarding: InterventionGuard, context: ExecutionContext, meta: inout InputMeta,
                            activation: () -> FakeActivation) throws {
    meta.inputRoute = .activation
    try holdFocus(app: app.key, pid: pid, connection: context.connection, activations: heldActivations, activation: activation,
                  beforeActivating: guarding.checkInFlight, meta: &meta)
  }
}
