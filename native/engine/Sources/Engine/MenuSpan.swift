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
// - after `menuSpanIdleMs` with no request on the record (an observation of the held app, or a press or record on it);
//   a press on its items after that is refused (menuActivationLapsed), never made on items computed unactivated.
// Ending the span clears the record with it: the menu and its activation have one lifetime, so an observation never shows
// the recorded menu's items as an app no longer believing itself active computes them. The activation's guard restores
// the user's window by re-activating the user's app, never by Accessibility (`restoresByActivationOnly`). A release that
// cannot post is logged, never thrown: the request it ends has already been answered or is another's.

/// How long a held menu activation outlasts the last request on the record: 120 s (the coordinator's ruling,
/// 2026-10-21). The span must outlast a model's turn between the menu's observation and the item press, which for an
/// agent that reasons before it acts regularly passes 10 s; a span lapsed there turns the press into one on items the app
/// computes disabled (the hold's failure), so such a press is refused as menuActivationLapsed rather than made.
let menuSpanIdleMs: Double = 120_000

private let menuLog = Logger(subsystem: "io.github.ssfskim.cua.engine", category: "menu")

/// One connection's held menu activation: the app it is held for and how to release it, with the idle bound's timer. A
/// connection's requests run one at a time on its thread, the timer on another; the lock serializes the two, and the
/// timer never releases while a request runs.
final class MenuSpan: @unchecked Sendable {
  private let lock = NSLock()
  private var held: (app: String, release: () -> Bool)?
  private var busy = false
  /// The idle bound passed while a request ran that was not on the record; it releases as that request ends.
  private var lapseDue = false
  /// The app whose span the idle bound released, until the connection's next request clears its record.
  private var lapsedApp: String?
  /// Bumped by every hold and every re-arming, so only the newest timer may fire.
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

  /// Holds a new span for `app`, releasing any earlier one first. The request that recorded it arms the idle bound as it
  /// ends.
  func hold(app: String, release: @escaping () -> Bool) {
    locked {
      releaseHeld()
      held = (app, release)
      holds += 1
      armed += 1
    }
  }

  /// Ends the span now, if one is held.
  func end() { locked { releaseHeld() } }

  /// A request starts; no idle release while it runs. Answers the app whose span lapsed while idle, whose record the
  /// caller clears.
  func requestBegan() -> String? {
    locked {
      busy = true
      defer { lapsedApp = nil }
      return lapsedApp
    }
  }

  /// A request ended. One on the record (`onRecord`: an observation of the held app, or a press or record on it) starts
  /// the idle bound again; any other leaves the bound running, and releases now if it passed meanwhile.
  func requestEnded(onRecord: Bool) {
    locked {
      busy = false
      guard held != nil else {
        lapseDue = false
        return
      }
      if onRecord {
        lapseDue = false
        armed += 1
        let timer = armed
        schedule(idleMs) { [weak self] in self?.lapse(timer) }
      } else if lapseDue {
        lapseDue = false
        lapseNow()
      }
    }
  }

  private func lapse(_ timer: Int) {
    locked {
      guard timer == armed, held != nil else { return }
      if busy { lapseDue = true } else { lapseNow() }
    }
  }

  private func lapseNow() {
    guard let app = held?.app else { return }
    releaseHeld()
    lapsedApp = app
  }

  private func releaseHeld() {
    lapseDue = false
    guard let ending = held else { return }
    held = nil
    if !ending.release() {
      releaseFailed("menu activation release failed for \(ending.app): the deactivation event could not be made")
    }
  }
}

/// The held activations of the engine, one per target process however many connections' spans hold it (route 3's state
/// is the process's, not a connection's): the first span to acquire a process's activation runs it, the others share
/// it, and the last to release it deactivates. So a span ending never withdraws an activation another span (another
/// connection's, or the same connection's new record) still relies on.
final class HeldActivations: @unchecked Sendable {
  private let lock = NSLock()
  private var held: [pid_t: (activation: FakeActivation, holders: Int)] = [:]

  /// The holders of `pid`'s activation (the unit tests' view).
  func holders(_ pid: pid_t) -> Int {
    lock.lock()
    defer { lock.unlock() }
    return held[pid]?.holders ?? 0
  }

  /// Acquires `pid`'s held activation: when no span holds it, `make()`'s activation runs (its guard time into `meta`, a
  /// failed guard's too; a failed guard throws with the activation undone and nothing held); otherwise the running one
  /// is shared. Answers the release, which runs once and deactivates when the last holder releases; it answers false
  /// only when that deactivation could not post.
  func acquire(pid: pid_t, make: () -> FakeActivation, meta: inout InputMeta) throws -> () -> Bool {
    lock.lock()
    defer { lock.unlock() }
    if let shared = held[pid] {
      held[pid] = (shared.activation, shared.holders + 1)
    } else {
      let activation = make()
      do {
        defer { meta.activationGuardMs = activation.guardMs }
        try activation.activate()
      } catch {
        activation.deactivate()
        throw error
      }
      held[pid] = (activation, 1)
    }
    let once = NSLock()
    var released = false
    return { [self] in
      once.lock()
      defer { once.unlock() }
      guard !released else { return true }
      released = true
      return release(pid)
    }
  }

  private func release(_ pid: pid_t) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    guard let entry = held[pid] else { return true }
    guard entry.holders <= 1 else {
      held[pid] = (entry.activation, entry.holders - 1)
      return true
    }
    held[pid] = nil
    return entry.activation.deactivate()
  }
}

/// What a request does to the held span (the span is held for `heldApp`): `keep` it, end it before the request runs, let
/// the request run inside it and end it after, or refuse a press on a menu whose span has ended. Another app ends it; an
/// observation of the app keeps it; a click or secondary action on an item of the recorded menu (`inRecordedMenu`) is
/// the item press; anything else is aimed outside the menu.
enum MenuSpanStep: Equatable { case keep, endBefore, endAfter, refuseLapsed }

/// The refusal of a press on a recorded menu whose activation has ended.
let menuActivationLapsed = EngineError(name: "menuActivationLapsed",
  "The menu's activation has ended (2 minutes passed with no request on it, or another request ended the menu interaction), so its items would not respond. Nothing was pressed. Click the menu bar item again to show its menu, then press the item.")

/// The methods whose request on the held app restarts the idle bound: its observation, and a press or a record on it.
/// resolve_app and list_apps act on nothing, so they never keep a menu the model has walked away from.
let menuSpanRenewingMethods: Set<String> = ["get_app_state", "click", "perform_secondary_action"]

func menuSpanStep(method: String, app: String?, heldApp: String?, inRecordedMenu: Bool) -> MenuSpanStep {
  // A press on an item of a recorded menu that no span holds any more (the idle bound passed, or another request ended
  // the interaction) would act on items computed without the activation: refused, never made silently.
  if method == "click" || method == "perform_secondary_action", inRecordedMenu, app != nil, app != heldApp { return .refuseLapsed }
  guard let heldApp, let app else { return .keep }
  guard app == heldApp else { return .endBefore }
  switch method {
  case "get_app_state", "resolve_app": return .keep
  case "click", "perform_secondary_action": return inRecordedMenu ? .endAfter : .endBefore
  default: return .endBefore
  }
}

/// The menu-bar record with its held activation: the in-flight intervention check, the app's held activation acquired
/// (run by the first span to hold it, its guard time into the meta, a failed guard's too), then the record holding the
/// span. A failed guard refuses the record as activationFailed with the activation undone and nothing recorded.
func recordHeldMenu(_ item: AXUIElement, app key: String, pid: pid_t, connection: ConnectionState, activations: HeldActivations,
                    activation: () -> FakeActivation, beforeActivating: () throws -> Void, meta: inout InputMeta) throws {
  try beforeActivating()
  let release = try activations.acquire(pid: pid, make: activation, meta: &meta)
  connection.recordMenu(item, app: key, release: release)
}

extension Engine {
  /// The record with its activation for the app's primary window (the observed window), restored by activation only.
  func holdMenuRecord(_ item: AXUIElement, app: ResolvedApp, appPid: pid_t, guarding: InterventionGuard, context: ExecutionContext,
                      meta: inout InputMeta) throws {
    try recordHeldMenu(item, app: app.key, pid: appPid, connection: context.connection, activations: heldActivations, activation: {
      let application = prepare(AXUIElementCreateApplication(appPid))
      return FakeActivation(pid: appPid, window: primaryWindow(of: application) ?? application, restoresByActivationOnly: true)
    }, beforeActivating: guarding.checkInFlight, meta: &meta)
  }
}

extension ConnectionState {
  /// Whether the request's element token names an item of the app's recorded menu: the lineage's current revision was
  /// walked from the recorded menu-bar item, and the token is one of its elements other than that item (a click on the
  /// item records its menu anew).
  func inRecordedMenu(_ args: [String: Any], app key: String, lineage wanted: String?) -> Bool {
    guard let token = args["element"] as? String, let number = tokenNumber(token), let lineage = lineages[key], lineage.id == wanted,
          let revision = lineage.current, revision.menuRoot != nil else { return false }
    return revision.entries[number] != nil && number != revision.root
  }

  /// Applies the span decision before the request runs: the span ended when the request is aimed elsewhere, and a press
  /// on a menu no span holds refused with nothing pressed.
  func enterMenuSpan(_ step: MenuSpanStep) throws {
    switch step {
    case .endBefore: endMenuInteraction()
    case .refuseLapsed:
      endMenuInteraction()
      throw menuActivationLapsed
    case .keep, .endAfter: break
    }
  }

  /// The menu interaction ends: the span released and its record cleared.
  func endMenuInteraction() {
    if let app = menuSpan.app { menuRecords[app] = nil }
    menuSpan.end()
  }
}
