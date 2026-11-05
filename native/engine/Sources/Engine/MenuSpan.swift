import AppKit
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

/// One connection's held activation span: the app it is held for and how to release it, with the idle bound's timer. A
/// connection has two, the menu's (here) and the focus hold's (FocusHold.swift); `label` names which in a logged release
/// failure. A connection's requests run one at a time on its thread, the timer on another; the lock serializes the two,
/// and the timer never releases while a request runs.
final class ActivationSpan: @unchecked Sendable {
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
  private let label: String
  private let idleMs: Double
  private let schedule: (Double, @escaping @Sendable () -> Void) -> Void
  private let releaseFailed: (String) -> Void

  init(label: String = "menu", idleMs: Double = menuSpanIdleMs,
       schedule: @escaping (Double, @escaping @Sendable () -> Void) -> Void = { ms, work in
         DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + .microseconds(Int(ms * 1000)), execute: work)
       },
       releaseFailed: @escaping (String) -> Void = { menuLog.error("\($0, privacy: .public)") }) {
    self.label = label
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
      releaseFailed("\(label) activation release failed for \(ending.app): the deactivation event could not be made")
    }
  }
}

/// Who holds a share of a process's activation: the connection (`ConnectionState.id`) whose request or hold acquired it,
/// and whether the share is a recorded menu's span. A connection runs one request at a time, so a holder of the joiner's
/// own connection is a lingering hold, never one mid-action.
struct ActivationHolder: Equatable {
  let connection: Int
  var menuSpan = false
}

/// The held activations of the engine, one per target process however many holders it has: menu spans, focus holds, and
/// the per-action activations of synthesized clicks, drags, pastes and forced keys, each for the action's duration
/// (route 3's state is the process's, not a connection's or an action's). The first holder to acquire a process's
/// activation runs it, the others share it, and the last to release it deactivates. So no holder's end ever withdraws an
/// activation another still relies on: a span ending mid-click waits for the click's release, and a click that began
/// before a span leaves the span's process active.
///
/// A real activation or deactivation of a process (the user brings the app forward, or leaves it) clears its synthetic
/// active state, as the vendor's tap updates its beliefs on real activation events (F §5.5, FUN_10072fd24). Each one
/// bumps the process's real-activation epoch (`realActivationChanged`, whether or not the process is held yet). An
/// activation reads the epoch right after its subtype 1 is posted, and it is stale exactly when the epoch has moved
/// since: a real event before the post leaves it current, one after makes it stale, however the event interleaves with
/// the activation's AX reads, guard or hit-test. A stale activation is replaced by the next acquire or `refresh`, and
/// never deactivated, on its last release or its failed guard's cleanup alike, the system having withdrawn its state.
///
/// A pointer holder (`postsLeftMouseDown`) joining an activation whose arm an earlier holder spent early re-arms it, when
/// every holder is of its own connection and none is a recorded menu's span (the Decision Log's "#261's hold join",
/// 2026-11-05): its own mouse down would otherwise meet a key window of an app that believes itself active, an ordering
/// click (#200's raise). The activation is withdrawn and a new one run in its place, the holders kept.
final class HeldActivations: @unchecked Sendable {
  /// One process's held activation and its holders, each by its acquire's share.
  private struct Entry {
    var activation: FakeActivation
    var holders: [Int: ActivationHolder]
    /// Withdrawn by a re-arming whose new activation failed its guard: replaced as a stale one is, and never deactivated.
    var withdrawn = false
  }

  private let lock = NSLock()
  private var held: [pid_t: Entry] = [:]
  private var shares = 0
  /// The real-activation epochs, behind their own lock: the workspace's notifications bump them from the main thread
  /// without waiting on an activation's guard under `lock`, and an activation reads its process's under its guard.
  private let epochLock = NSLock()
  private var epochs: [pid_t: Int] = [:]

  /// The holders of `pid`'s activation (the unit tests' view).
  func holders(_ pid: pid_t) -> Int {
    lock.lock()
    defer { lock.unlock() }
    return held[pid]?.holders.count ?? 0
  }

  /// The activation `pid`'s holders share; nil when none holds it.
  func activation(of pid: pid_t) -> FakeActivation? {
    lock.lock()
    defer { lock.unlock() }
    return held[pid]?.activation
  }

  /// Whether the registry's lock is held now (the unit tests' view: the intervention check runs under it).
  var isLocked: Bool {
    guard lock.try() else { return true }
    lock.unlock()
    return false
  }

  /// A real activation or deactivation of `pid` was observed.
  func realActivationChanged(_ pid: pid_t) {
    epochLock.lock()
    defer { epochLock.unlock() }
    epochs[pid, default: 0] += 1
  }

  private func epoch(_ pid: pid_t) -> Int {
    epochLock.lock()
    defer { epochLock.unlock() }
    return epochs[pid] ?? 0
  }

  /// Whether a real activation or deactivation of its process came after the activation read the epoch.
  private func isStale(_ activation: FakeActivation) -> Bool {
    activation.epoch.map { $0 != epoch(activation.pid) } ?? false
  }

  /// Whether the entry's activation is to be replaced, never deactivated: stale, or withdrawn.
  private func isSpent(_ entry: Entry) -> Bool { entry.withdrawn || isStale(entry.activation) }

  /// Whether a pointer holder `joining` re-arms the entry's activation rather than sharing it: its arm was spent early,
  /// and no other connection's holder (which may be mid-action under it) nor a recorded menu (which the withdrawal could
  /// close) holds it.
  private func rearms(_ entry: Entry, for joining: ActivationHolder) -> Bool {
    entry.activation.armSpentOutsideActivationPoint
      && entry.holders.values.allSatisfy { $0.connection == joining.connection && !$0.menuSpan }
  }

  /// Runs a new activation, its guard time and click into `meta` (a failed guard's too); a failed guard throws with it
  /// undone, unless a real event already withdrew it (the undoing posts the kept inert click first, so its click kind is
  /// read after it). `postsLeftMouseDown`: the holder posts its own left mouse down (`FakeActivation.defersArmClick`).
  private func run(_ make: () -> FakeActivation, postsLeftMouseDown: Bool = false, meta: inout InputMeta) throws -> FakeActivation {
    let activation = make()
    let pid = activation.pid
    activation.realEpoch = { [self] in epoch(pid) }
    activation.defersArmClick = postsLeftMouseDown
    defer {
      meta.activationGuardMs = activation.guardMs ?? meta.activationGuardMs
      meta.activationClick = activation.click ?? meta.activationClick
      meta.activationClickKind = activation.clickKind ?? meta.activationClickKind
    }
    do {
      try activation.activate()
    } catch {
      if !isStale(activation) { activation.deactivate() }
      throw error
    }
    return activation
  }

  /// Acquires `pid`'s activation. `beforeActivating` (the in-flight intervention check) runs once the lock is held, so a
  /// user event that lands while the request waits behind another holder's activation still stops it before anything is
  /// run, shared or recorded. When no holder has the activation, or it is stale, `make()`'s runs (a failed guard throws
  /// with nothing more held); otherwise the running one is shared, and a holder that posts no left mouse down of its own
  /// (`postsLeftMouseDown` false) consumes its arm first when no mouse down has (the kept inert click, recorded in its
  /// meta; after a pointer holder's events already going out, `FakeActivation.postAction`), so its keys reach a key window.
  /// A holder that does post its own (`postsLeftMouseDown`) joining an activation whose arm was spent early, held only by
  /// `holder`'s connection and by no recorded menu (`rearms`), re-arms it: the shared activation deactivated (subtype 2)
  /// and `make()`'s run in its place, every holder kept, so the holder's own mouse down consumes the new arm with no
  /// ordering. A failed guard there throws with the new one undone and the old one left withdrawn for the holders that
  /// remain (the next acquire or `refresh` runs a new one, as for a stale one). Answers the release, which runs once and
  /// deactivates when the last holder releases; it answers false only when that deactivation could not post.
  func acquire(pid: pid_t, holder: ActivationHolder, postsLeftMouseDown: Bool = false, beforeActivating: () throws -> Void,
               make: () -> FakeActivation, meta: inout InputMeta) throws -> () -> Bool {
    lock.lock()
    defer { lock.unlock() }
    try beforeActivating()
    if var entry = held[pid] {
      if isSpent(entry) {
        entry.activation = try run(make, postsLeftMouseDown: postsLeftMouseDown, meta: &meta)
        entry.withdrawn = false
      } else if postsLeftMouseDown, rearms(entry, for: holder), entry.activation.deactivate() {
        do {
          entry.activation = try run(make, postsLeftMouseDown: true, meta: &meta)
        } catch {
          held[pid]?.withdrawn = true
          throw error
        }
      } else if !postsLeftMouseDown, entry.activation.consumeArm(.early) {
        meta.activationClickKind = entry.activation.clickKind
      }
      shares += 1
      entry.holders[shares] = holder
      held[pid] = entry
    } else {
      let activation = try run(make, postsLeftMouseDown: postsLeftMouseDown, meta: &meta)
      shares += 1
      held[pid] = Entry(activation: activation, holders: [shares: holder])
    }
    let share = shares
    let once = NSLock()
    var released = false
    return { [self] in
      once.lock()
      defer { once.unlock() }
      guard !released else { return true }
      released = true
      return release(pid, share: share)
    }
  }

  /// For a holder that already holds `pid`: when its activation went stale (or was withdrawn), `beforeActivating`, then
  /// `make()`'s run in its place (a failed guard throws and leaves the spent one held); otherwise nothing.
  func refresh(pid: pid_t, beforeActivating: () throws -> Void, make: () -> FakeActivation, meta: inout InputMeta) throws {
    lock.lock()
    defer { lock.unlock() }
    guard var entry = held[pid], isSpent(entry) else { return }
    try beforeActivating()
    entry.activation = try run(make, meta: &meta)
    entry.withdrawn = false
    held[pid] = entry
  }

  private func release(_ pid: pid_t, share: Int) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    guard var entry = held[pid], entry.holders.removeValue(forKey: share) != nil else { return true }
    guard entry.holders.isEmpty else {
      held[pid] = entry
      return true
    }
    held[pid] = nil
    return isSpent(entry) || entry.activation.deactivate()
  }
}

/// Bumps a process's real-activation epoch on every real activation or deactivation the workspace reports (`center`, the
/// workspace's notification center in the engine; the notifications arrive on the main run loop).
func observeRealActivations(_ center: NotificationCenter, registry: HeldActivations) -> [NSObjectProtocol] {
  [NSWorkspace.didActivateApplicationNotification, NSWorkspace.didDeactivateApplicationNotification].map { name in
    center.addObserver(forName: name, object: nil, queue: nil) { note in
      guard let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication else { return }
      registry.realActivationChanged(app.processIdentifier)
    }
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

/// The menu-bar record with its held activation: the app's held activation acquired, the in-flight intervention check
/// run under the registry's lock first (run by the first span to hold it, its guard time into the meta, a failed guard's
/// too), then the record holding the span, then `announce` (the agent cursor's hook). A user event refuses the record
/// with nothing activated or recorded; a failed guard refuses it as activationFailed with the activation undone and
/// nothing recorded; neither announces.
func recordHeldMenu(_ item: AXUIElement, app key: String, pid: pid_t, connection: ConnectionState, activations: HeldActivations,
                    activation: () -> FakeActivation, beforeActivating: () throws -> Void, announce: () -> Void = {},
                    meta: inout InputMeta) throws {
  let release = try activations.acquire(pid: pid, holder: ActivationHolder(connection: connection.id, menuSpan: true),
                                        beforeActivating: beforeActivating, make: activation, meta: &meta)
  connection.recordMenu(item, app: key, release: release)
  announce()
}

extension Engine {
  /// The record with its activation for the app's primary window (the observed window), restored by activation only.
  /// Once it holds, the agent cursor acts a click at the item's midpoint: from the agent's side it clicked the menu
  /// title, though nothing is pressed (MenuRecord.swift). The hook only enqueues; the cursor's geometry queue reads the item's frame
  /// (else the observed one) and, as a menu-bar item has no window of its own, the app's primary window, so no
  /// accessibility read for the cursor holds the request. Attached there, the cursor is raised above the menu bar while
  /// the app is frontmost or has a menu open (Cursor/CursorAttachment.swift), else at that window's level.
  func holdMenuRecord(_ item: AXUIElement, storedFrame: CGRect?, app: ResolvedApp, appPid: pid_t, guarding: InterventionGuard,
                      context: ExecutionContext, meta: inout InputMeta) throws {
    try recordHeldMenu(item, app: app.key, pid: appPid, connection: context.connection, activations: heldActivations, activation: {
      let application = prepare(AXUIElementCreateApplication(appPid))
      return FakeActivation(pid: appPid, window: primaryWindow(of: application) ?? application, restoresByActivationOnly: true)
    }, beforeActivating: guarding.checkInFlight, announce: {
      cursor.act(connection: context.connection.id, app: app.key, window: nil, .menuBarItem(item, pid: appPid, storedFrame: storedFrame))
    }, meta: &meta)
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
