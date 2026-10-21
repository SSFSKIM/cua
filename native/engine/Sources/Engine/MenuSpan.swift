import ApplicationServices
import Foundation
import os

// The menu's held activation (the Decision Log's "menu activation held from the record", 2026-10-21; the M2a vendor
// reading §4, items 2 and 6). A background app computes its menu items' enablement when the recorded menu is observed,
// so the app must already believe itself active then, and still when an item is pressed: route 3's activation around
// the press alone left Select All and Bold disabled and inert in the M2a.5 hold. As the vendor does, the activation runs
// once, at the menu-bar record (a plain left click or AXPick on an AXMenuBarItem with an AXMenu child), never on an
// ordinary observation, and holds through the recorded menu's observations and the item press.
//
// The release is cua's declared difference in the owner's favour: the vendor deactivates only at its lifecycle end. The
// span ends, with route 3's deactivation (subtype 2, only when the app believes itself active but is not), when the menu
// interaction ends:
// - after the item press (a click or secondary action on an element of the recorded menu);
// - at the first request aimed elsewhere (another app, or an action on anything outside the recorded menu);
// - when the record clears (AXCancel on the item, a new record, the item gone, the connection closing, shutdown);
// - after `menuSpanIdleMs` with no request on the connection.
// Ending the span clears the record with it: the menu and its activation have one lifetime, so an observation never shows
// the recorded menu's items as an app no longer believing itself active computes them. The activation's guard restores
// the user's window by re-activating the user's app, never by Accessibility (`restoresByActivationOnly`). A release that
// cannot post is logged, never thrown: the request it ends has already been answered or is another's.

/// How long a held menu activation outlasts the connection's last request. The Decision Log names 10 s, "unless the
/// task finds a reason for another value": the span must outlast a model's turn between the menu's observation and the
/// item press, which for an agent that reasons before it acts regularly passes 10 s, and a span lapsed there turns the
/// press into one on items computed disabled (the hold's failure). 30 s covers a long turn while still releasing a menu
/// the model has walked away from well before the user would notice its app behaving as active.
let menuSpanIdleMs: Double = 30_000

private let menuLog = Logger(subsystem: "io.github.ssfskim.cua.engine", category: "menu")

/// One connection's held menu activation: the app it is held for and how to release it, with the idle bound's timer. A
/// connection's requests run one at a time on its thread, the timer on another; the lock serializes the two, and the
/// timer never releases while a request runs.
final class MenuSpan: @unchecked Sendable {
  private let lock = NSLock()
  private var held: (app: String, release: () -> Bool)?
  private var busy = false
  /// The app whose span the idle bound released, until the connection's next request clears its record.
  private var lapsedApp: String?
  /// Bumped by every request's start and end, so only the timer armed by the last request's end may fire.
  private var armed = 0
  /// Bumped by every hold, so a request can tell whether it started a new span.
  private var holds = 0
  private let idleMs: Double
  private let schedule: (Double, @escaping @Sendable () -> Void) -> Void
  private let releaseFailed: (String) -> Void

  init(idleMs: Double = menuSpanIdleMs,
       schedule: @escaping (Double, @escaping @Sendable () -> Void) -> Void = { ms, work in
         DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + .microseconds(Int(ms * 1000)), execute: work)
       },
       releaseFailed: @escaping (String) -> Void = { menuLog.error("\($0, privacy: .public)") }) {
    self.idleMs = idleMs
    self.schedule = schedule
    self.releaseFailed = releaseFailed
  }

  private func locked<T>(_ body: () -> T) -> T {
    lock.lock()
    defer { lock.unlock() }
    return body()
  }

  /// The app (by lineage key) the activation is held for, if any.
  var app: String? { locked { held?.app } }

  /// How many spans have been held: unchanged across a request that started none.
  var serial: Int { locked { holds } }

  /// Holds a new span for `app`, releasing any earlier one first.
  func hold(app: String, release: @escaping () -> Bool) {
    locked {
      releaseHeld()
      held = (app, release)
      holds += 1
    }
  }

  /// Ends the span now, if one is held.
  func end() { locked { releaseHeld() } }

  /// A request starts: the idle timer is disarmed. Answers the app whose span lapsed while idle, whose record the caller
  /// clears.
  func requestBegan() -> String? {
    locked {
      busy = true
      armed += 1
      defer { lapsedApp = nil }
      return lapsedApp
    }
  }

  /// A request ended: the idle bound starts again while a span is held.
  func requestEnded() {
    locked {
      busy = false
      armed += 1
      guard held != nil else { return }
      let timer = armed
      schedule(idleMs) { [weak self] in self?.lapse(timer) }
    }
  }

  private func lapse(_ timer: Int) {
    locked {
      guard timer == armed, !busy, let app = held?.app else { return }
      releaseHeld()
      lapsedApp = app
    }
  }

  private func releaseHeld() {
    guard let ending = held else { return }
    held = nil
    if !ending.release() {
      releaseFailed("menu activation release failed for \(ending.app): the deactivation event could not be made")
    }
  }
}

/// What a request does to the held span (the span is held for `heldApp`): `keep` it, end it before the request runs, or
/// let the request run inside it and end it after. Another app ends it; an observation of the app keeps it; a click or
/// secondary action on an element of the recorded menu (`inRecordedMenu`) is the item press; anything else is aimed
/// outside the menu.
enum MenuSpanStep: Equatable { case keep, endBefore, endAfter }

func menuSpanStep(method: String, app: String?, heldApp: String?, inRecordedMenu: Bool) -> MenuSpanStep {
  guard let heldApp, let app else { return .keep }
  guard app == heldApp else { return .endBefore }
  switch method {
  case "get_app_state", "resolve_app": return .keep
  case "click", "perform_secondary_action": return inRecordedMenu ? .endAfter : .endBefore
  default: return .endBefore
  }
}

/// The menu-bar record with its held activation: the in-flight intervention check, route 3's activation for the app's
/// window (its guard time into the meta, a failed guard's too), then the record holding the span. A failed guard
/// refuses the record as activationFailed with the activation undone and nothing recorded.
func recordHeldMenu(_ item: AXUIElement, app key: String, connection: ConnectionState, activation: FakeActivation,
                    beforeActivating: () throws -> Void, meta: inout InputMeta) throws {
  try beforeActivating()
  do {
    defer { meta.activationGuardMs = activation.guardMs }
    try activation.activate()
  } catch {
    activation.deactivate()
    throw error
  }
  connection.recordMenu(item, app: key) { activation.deactivate() }
}

extension Engine {
  /// The record with its activation for the app's primary window (the observed window), restored by activation only.
  func holdMenuRecord(_ item: AXUIElement, app: ResolvedApp, appPid: pid_t, guarding: InterventionGuard, context: ExecutionContext,
                      meta: inout InputMeta) throws {
    let application = prepare(AXUIElementCreateApplication(appPid))
    let activation = FakeActivation(pid: appPid, window: primaryWindow(of: application) ?? application, restoresByActivationOnly: true)
    try recordHeldMenu(item, app: app.key, connection: context.connection, activation: activation,
                       beforeActivating: guarding.checkInFlight, meta: &meta)
  }
}

extension ConnectionState {
  /// Whether the request's element token names an element of the app's recorded menu: the lineage's current revision was
  /// walked from the recorded item, and the token is one of its elements.
  func inRecordedMenu(_ args: [String: Any], app key: String, lineage wanted: String?) -> Bool {
    guard let token = args["element"] as? String, let number = tokenNumber(token), let lineage = lineages[key], lineage.id == wanted,
          let revision = lineage.current, revision.menuRoot != nil else { return false }
    return revision.entries[number] != nil
  }

  /// The menu interaction ends: the span released and its record cleared.
  func endMenuInteraction() {
    if let app = menuSpan.app { menuRecords[app] = nil }
    menuSpan.end()
  }
}
