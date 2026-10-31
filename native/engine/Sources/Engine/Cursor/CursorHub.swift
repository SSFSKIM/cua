import AppKit
import ApplicationServices
import Foundation
import QuartzCore

// The agent cursor's hub (the spec's Design, "Rendering and the main thread", "Hooks", "Lifecycle and identity"; #235).
// One per engine, one cursor per connection. Thread-safe and never blocking: the hooks call it from request threads,
// where it only bumps a generation under its lock and enqueues; a serial cursor queue (never main) keeps every cursor's
// state, plans the motion and runs the state timers (a second serial queue reads an action's accessibility geometry, so
// a slow app never holds them); one `main.async` block per change hands the renderer the whole
// desired state (a commit), so nothing the cursor does runs on the main thread per frame and no action waits for it
// (O5). Nothing here can fail an action: a cursor that cannot be placed simply does not move.

/// What an action did, for the cursor. Points are global, top-left origin (the engine's posting space).
enum CursorAction: @unchecked Sendable {
  case click(CGPoint)          // coordinate or element click: glide, then the press dip on arrival
  case element(AXUIElement, storedFrame: CGRect?)   // accessibility action: the geometry queue reads the current frame
                                                    // after the action is sent, falls back to storedFrame; glide, dip
  case menuBarItem(AXUIElement, pid: pid_t, storedFrame: CGRect?)  // a recorded menu-bar click: the item's current frame
                                                    // (else storedFrame) and the app's primary window, both read on
                                                    // the geometry queue (an item has no window); glide, dip
  case drag([CGPoint])         // glide to the first point, dip, trace the path, rest at the last
  case scroll(CGPoint)         // glide, no dip
}

/// Where an action sends the cursor, its accessibility geometry resolved: the points (global, top-left), the window it
/// attaches to, whether it dips on arrival and whether it traces a drag.
struct CursorAim {
  let points: [CGPoint]
  let window: CGWindowID?
  let dips: Bool
  let drag: Bool

  init(points: [CGPoint], window: CGWindowID?, dips: Bool, drag: Bool) {
    self.points = points
    self.window = window
    self.dips = dips
    self.drag = drag
  }

  /// An action that names its points itself (nil: one whose geometry must be read first).
  init?(_ action: CursorAction, window: CGWindowID?) {
    switch action {
    case .click(let p): self.init(points: [p], window: window, dips: true, drag: false)
    case .scroll(let p): self.init(points: [p], window: window, dips: false, drag: false)
    case .drag(let path): self.init(points: path, window: window, dips: true, drag: true)
    case .element, .menuBarItem: return nil
    }
  }
}

/// A motion the renderer installs: the trajectory in the panel's coordinates from `beginTime` (host time,
/// CACurrentMediaTime), and the host times of its press dips.
struct CursorMotionInstall: Sendable {
  let id: Int
  let trajectory: Trajectory
  let beginTime: TimeInterval
  let dips: [TimeInterval]
  /// Shown from hidden: it fades in at its target rather than gliding in.
  let fadeIn: Bool
}

/// The whole desired state of one cursor, as the renderer applies it on the main thread. A commit whose generation is
/// no longer current is dropped there, so a late show never resurrects a cursor hidden since.
struct CursorCommit: Sendable {
  let connection: Int
  let generation: Int
  let identity: CursorIdentity
  let screen: CursorScreen
  let attachment: CursorAttachment
  let phase: CursorPhase
  /// When the phase was entered (host time): a fade's start.
  let phaseSince: TimeInterval
  let motion: CursorMotionInstall?
  let reduceMotion: Bool
  let increaseContrast: Bool

  /// The panel shows: a visible phase on an attached window.
  var shown: Bool { phase.visible && attachment.visible }
}

/// The main-thread side: the panels and their layers (CursorPanel.swift), a recording fake in the unit tests.
protocol CursorRenderer: AnyObject, Sendable {
  func apply(_ commit: CursorCommit)
  func close(connection: Int)
}

/// The outside world the hub reads, the system's in `live`, replaced in the unit tests.
struct CursorEnvironment: @unchecked Sendable {
  /// Host time, seconds (CACurrentMediaTime).
  var now: () -> TimeInterval = { CACurrentMediaTime() }
  /// Runs a block on the main thread, asynchronously.
  var main: (@escaping @Sendable () -> Void) -> Void = { block in DispatchQueue.main.async(execute: block) }
  var screens: () -> CursorScreens = { .none }
  var windowList: () -> [ListedWindow] = { [] }
  var frontmostPid: () -> pid_t? = { nil }
  var elementFrame: (AXUIElement) -> CGRect? = { _ in nil }
  var elementWindow: (AXUIElement) -> CGWindowID? = { _ in nil }
  /// The app's primary window, by its pid (a menu-bar item's attachment).
  var appWindow: (pid_t) -> CGWindowID? = { _ in nil }
  var reduceMotion: () -> Bool = { false }
  var increaseContrast: () -> Bool = { false }
  /// The centres the attachment's events arrive on: NSWorkspace's and the distributed one (the screen lock).
  var workspaceCenter = NotificationCenter()
  var distributedCenter = NotificationCenter()
  /// The application's own centre, where a display reconfiguration arrives (NotificationCenter.default).
  var appCenter = NotificationCenter()
  /// Whether the hub arms real timers (the tests drive `tick` themselves).
  var timers = false
  /// Holds an `NSProcessInfo` activity while any cursor shows, so App Nap cannot delay a motion that is due.
  var activity: (Bool) -> Void = { _ in }
  /// Runs on the cursor queue just before a motion is planned (the generation tests hold it there).
  var beforePlanning: () -> Void = {}
  var log: (String) -> Void = { _ in }
  let enginePid: pid_t = getpid()
}

final class CursorHub: @unchecked Sendable {
  /// The splice lead: a motion planned now starts this far ahead, so its commit lands before it begins.
  static let spliceLead = 0.02
  /// The window-state check's period while a cursor shows (4 Hz).
  static let checkPeriod = 0.25

  let environment: CursorEnvironment
  private let renderer: CursorRenderer?
  private let queue = DispatchQueue(label: "cua.engine.cursor", qos: .userInitiated)
  /// Where an action's accessibility geometry is read (an element's or a menu-bar item's frame, its window): a slow app
  /// can stall each read up to the accessibility timeout, so never on `queue`, whose attachment updates (an app switch,
  /// the window-state check) must stay runnable.
  private let geometry = DispatchQueue(label: "cua.engine.cursor.geometry", qos: .userInitiated)
  private let lock = NSLock()
  /// Per connection, the generation of its newest plan, hide or close; read by the main-thread commit.
  private var generations: [Int: Int] = [:]
  // Below: the cursor queue's own.
  private var cursors: [Int: CursorModel] = [:]
  private var timer: DispatchSourceTimer?
  private var nextCheck: TimeInterval?
  private var motionCounter = 0
  private var activityHeld = false
  private var observers: [(NotificationCenter, NSObjectProtocol)] = []

  /// What keeps the live environment's readings current (CursorSystem), held for the hub's lifetime.
  private let system: AnyObject?

  /// A hub that keeps the cursors' state; `renderer` nil draws nothing (the unit tests' engines, unbundled tools).
  init(environment: CursorEnvironment = CursorEnvironment(), renderer: CursorRenderer? = nil, system: AnyObject? = nil) {
    self.environment = environment
    self.renderer = renderer
    self.system = system
    observeAttachmentEvents()
  }

  deinit {
    for (center, token) in observers { center.removeObserver(token) }
  }

  // MARK: The hooks' interface

  /// Every execute request, in its prologue. Only a change the person can see (a reappearance, a cancelled fade, taken
  /// over cleared, a transition that came due) is rendered; otherwise only the bookkeeping changes, here.
  func begin(connection: Int, app: String?, keyboardOnly: Bool) {
    queue.async { [self] in
      let cursor = model(connection)
      let now = environment.now()
      let before = cursor.lifecycle.phase
      cursor.lifecycle.tick(now: now)
      var changed = false
      switch cursor.lifecycle.begin(app: app, keyboardOnly: keyboardOnly, now: now) {
      case .none: break
      case .reappear(let point): reappear(cursor, at: point, now: now); changed = true
      }
      if changed || cursor.lifecycle.phase != before { commit(cursor) } else { rearm() }
    }
  }

  /// The prologue's defer: starts the 5 s idle when no request is left in flight.
  func end(connection: Int) {
    queue.async { [self] in
      let cursor = model(connection)
      cursor.lifecycle.end(now: environment.now())
      rearm()
    }
  }

  /// An action reached a hook. `window` nil: no move (for `.element`, the element's own window is read instead; for
  /// `.menuBarItem`, the app's primary window). An action naming accessibility geometry has it read on the geometry
  /// queue, only for an enabled cursor and a plan not yet superseded, and is planned on the cursor queue when the read
  /// returns, unless superseded meanwhile: by a newer action (the generation), or by any event that sets the cursor's state
  /// while it was read (a hide, a close, the screen locking, the person taking over, the session's cursor turned off:
  /// each bumps the cursor's state epoch on the cursor queue), so a late read restores nothing. An action that arrives
  /// after such an event reads the new epoch and is planned as usual.
  func act(connection: Int, app: String, window: CGWindowID?, _ action: CursorAction) {
    let generation = bump(connection)
    queue.async { [self] in
      guard current(connection) == generation else { return }  // a newer plan, a hide or a close superseded it
      let cursor = model(connection)
      guard cursor.enabled else { commit(cursor); return }
      if let aim = CursorAim(action, window: window) {
        perform(connection: connection, app: app, aim, generation: generation)
        return
      }
      let epoch = cursor.stateEpoch
      geometry.async { [self] in
        guard current(connection) == generation else { return }
        let aim = resolve(action, window: window)
        queue.async { [self] in
          // A state event while it was read (a hide, the screen locking, the person taking over, the cursor turned
          // off) supersedes it; a close removed the cursor.
          guard let cursor = cursors[connection], cursor.stateEpoch == epoch else { return }
          guard let aim else { commit(cursor); return }
          perform(connection: connection, app: app, aim, generation: generation)
        }
      }
    }
  }

  /// The accessibility-only element methods' hook: `operation` runs first, on the caller's thread, and only when it
  /// answers success is the cursor pointed at the element, whose frame the geometry queue then reads (after the action, as
  /// the action may have scrolled it into view). The operation's answer is passed through.
  @discardableResult
  func afterElementAction(connection: Int, app: String, element: AXUIElement, storedFrame: CGRect?, _ operation: () throws -> Bool) rethrows -> Bool {
    let succeeded = try operation()
    if succeeded { act(connection: connection, app: app, window: nil, .element(element, storedFrame: storedFrame)) }
    return succeeded
  }

  /// M2's per-session identity and switch.
  func configure(connection: Int, _ identity: CursorIdentity?, enabled: Bool) {
    queue.async { [self] in
      let cursor = model(connection)
      if let identity { cursor.identity = identity }
      cursor.enabled = enabled
      if !enabled {
        cursor.stateEpoch += 1
        hideNow(cursor)
      }
      commit(cursor)
    }
  }

  /// end_task (M2): fades at once.
  func hide(connection: Int) {
    let generation = bump(connection)
    queue.async { [self] in
      guard let cursor = cursors[connection] else { return }
      cursor.stateEpoch += 1
      hideNow(cursor)
      commit(cursor, generation: generation)
    }
  }

  /// The connection closed: the panel is ordered out and released.
  func closed(connection: Int) {
    _ = bump(connection)
    queue.async { [self] in
      cursors[connection] = nil
      lock.withLock { generations[connection] = nil }
      if let renderer { environment.main { renderer.close(connection: connection) } }
      rearm()
    }
  }

  /// The engine's intervention ledger attributed the person's event to `pid` (Intervention.swift).
  func userActed(pid: pid_t) {
    queue.async { [self] in
      let now = environment.now()
      for cursor in cursors.values where cursor.attachment?.owner == pid {
        let before = cursor.lifecycle.phase
        cursor.lifecycle.userActed(now: now)
        guard cursor.lifecycle.phase != before else { continue }
        cursor.stateEpoch += 1
        cursor.phaseSince = now
        freeze(cursor, now: now)  // taken over is still: whatever plays stops where it is, a dip or the halo's relaxing too
        commit(cursor)
      }
    }
  }

  /// Waits until everything enqueued so far has run (the tests' and the probe's barrier): the cursor queue, a geometry
  /// read it handed on, and the plan that read handed back.
  func drain() {
    queue.sync {}
    geometry.sync {}
    queue.sync {}
  }

  /// The state timers' work, due now (the live timer calls it; the tests call it after moving their clock).
  func tick() { queue.sync { runDue() } }

  // MARK: Generations

  private func bump(_ connection: Int) -> Int {
    lock.withLock {
      let next = (generations[connection] ?? 0) + 1
      generations[connection] = next
      return next
    }
  }

  private func current(_ connection: Int) -> Int? { lock.withLock { generations[connection] } }

  // MARK: The cursor queue

  private func model(_ connection: Int) -> CursorModel {
    if let cursor = cursors[connection] { return cursor }
    let cursor = CursorModel(connection: connection, identity: placeholderIdentity(connection: connection))
    cursors[connection] = cursor
    // One acquisition: a request thread's bump between a separate check and set would be overwritten with 0, and its
    // queued plan then dropped as superseded.
    lock.withLock { if generations[connection] == nil { generations[connection] = 0 } }
    return cursor
  }

  /// The accessibility reads an action names (on the geometry queue): the point and the window the cursor goes to.
  private func resolve(_ action: CursorAction, window: CGWindowID?) -> CursorAim? {
    switch action {
    case .element(let element, let stored):
      guard let frame = environment.elementFrame(element) ?? stored else { return nil }
      return CursorAim(points: [CGPoint(x: frame.midX, y: frame.midY)], window: window ?? environment.elementWindow(element), dips: true, drag: false)
    case .menuBarItem(let item, let pid, let stored):
      guard let frame = environment.elementFrame(item) ?? stored, let point = clickablePoint(frame: frame, visibleIn: nil) else { return nil }
      return CursorAim(points: [point], window: window ?? environment.appWindow(pid), dips: true, drag: false)
    case .click, .scroll, .drag:
      return CursorAim(action, window: window)
    }
  }

  private func perform(connection: Int, app: String, _ aim: CursorAim, generation: Int) {
    guard current(connection) == generation else { return }  // a newer plan, a hide or a close superseded it
    let cursor = model(connection)
    defer { commit(cursor) }
    guard cursor.enabled else { return }
    // An action with neither a point nor a window does not move.
    let points = aim.points
    let target = aim.window
    let dips = aim.dips
    guard let target, let first = points.first else { return }
    let screens = environment.screens()
    guard let screen = screens.screen(containing: first) else { return }
    let list = environment.windowList()
    let attachment = cursorAttachment(window: target, list: list, frontmostPid: environment.frontmostPid())
    guard attachment.visible else { return }  // the target window is not on screen: nothing to sit on
    environment.beforePlanning()
    let now = environment.now()
    let begin = now + Self.spliceLead
    let bounds = screens.localVisibleFrame(of: screen)
    let local = points.map { screens.local($0, in: screen) }
    let reduce = environment.reduceMotion()
    let wasShown = cursor.lifecycle.phase.visible && cursor.attachment?.visible == true
    // Where it starts: the retained trajectory at the splice time, or the nearest edge point of a new screen, or (hidden)
    // the target itself.
    var start: CursorState?
    if wasShown, let motion = cursor.motion, let oldScreen = cursor.screen {
      let state = motion.trajectory.state(at: begin - motion.beginTime)
      if oldScreen == screen {
        start = state
      } else {
        let global = CGPoint(x: state.position.x + oldScreen.frame.minX, y: state.position.y + oldScreen.frame.minY)
        let edge = screen.nearestPoint(to: global)
        start = .rest(at: CGPoint(x: edge.x - screen.frame.minX, y: edge.y - screen.frame.minY))
      }
    }
    var trajectory: Trajectory
    if let start {
      let startGlobal = CGPoint(x: start.position.x + screen.frame.minX, y: screens.primaryHeight - (start.position.y + screen.frame.minY))
      let skip = occluded(startGlobal, target: target, list: list, enginePid: environment.enginePid)
        && occluded(first, target: target, list: list, enginePid: environment.enginePid)
      trajectory = skip ? snapTrajectory(to: local[0]) : plan(from: start, to: local[0], bounds: bounds, reduceMotion: reduce)
    } else {
      trajectory = snapTrajectory(to: local[0])
    }
    let arrival = trajectory.arrival
    if aim.drag, local.count > 1 {
      for next in local.dropFirst() {
        trajectory = trajectory.followed(by: planStraight(from: trajectory.samples[trajectory.samples.count - 1], to: next,
                                                          bounds: bounds, reduceMotion: reduce))
      }
    }
    guard current(connection) == generation else { return }  // superseded while it was planned: dropped here
    motionCounter += 1
    cursor.motion = CursorMotionInstall(id: motionCounter, trajectory: trajectory, beginTime: begin,
                                        dips: dips ? [begin + arrival] : [], fadeIn: start == nil)
    cursor.plannedReduced = reduce
    cursor.screen = screen
    cursor.attachment = attachment
    cursor.app = app
    let settles = begin + Double(trajectory.settleIndex) * trajectory.step
    cursor.lifecycle.tick(now: now)
    let before = cursor.lifecycle.phase
    _ = cursor.lifecycle.acted(app: app, at: CursorPoint(global: points[points.count - 1], window: target), settlesAt: settles, now: now)
    if cursor.lifecycle.phase != before { cursor.phaseSince = now }
  }

  /// A keyboard request brought the cursor back at its last point in the app: a fade-in there, attached to the window it
  /// pointed in.
  private func reappear(_ cursor: CursorModel, at point: CursorPoint, now: TimeInterval) {
    let screens = environment.screens()
    guard let screen = screens.screen(containing: point.global) else { return }
    let attachment = cursorAttachment(window: point.window, list: environment.windowList(), frontmostPid: environment.frontmostPid())
    motionCounter += 1
    cursor.motion = CursorMotionInstall(id: motionCounter, trajectory: snapTrajectory(to: screens.local(point.global, in: screen)),
                                        beginTime: now + Self.spliceLead, dips: [], fadeIn: true)
    cursor.screen = screen
    cursor.attachment = attachment
    cursor.phaseSince = now
  }

  /// The state the renderer should show, on main, unless superseded by then.
  private func commit(_ cursor: CursorModel, generation: Int? = nil) {
    defer { rearm() }
    guard let renderer, let screen = cursor.screen, let attachment = cursor.attachment,
          let generation = generation ?? current(cursor.connection) else { return }
    let commit = CursorCommit(connection: cursor.connection, generation: generation, identity: cursor.identity, screen: screen,
                              attachment: attachment, phase: cursor.enabled ? cursor.lifecycle.phase : .hidden,
                              phaseSince: cursor.phaseSince, motion: cursor.motion,
                              reduceMotion: environment.reduceMotion(), increaseContrast: environment.increaseContrast())
    cursor.committed = commit
    timingSignposts.emitEvent("cursor.commit")
    environment.main { [weak self] in
      guard let self, self.current(commit.connection) == commit.generation else { return }
      renderer.apply(commit)
    }
  }

  /// The transitions due now, and the window-state check while any cursor shows.
  private func runDue() {
    let now = environment.now()
    for cursor in cursors.values {
      let before = cursor.lifecycle.phase
      cursor.lifecycle.tick(now: now)
      if cursor.lifecycle.phase != before {
        cursor.phaseSince = now
        if cursor.lifecycle.phase == .fading, let fadeAt = cursor.lifecycle.fadeStartedAt { cursor.phaseSince = fadeAt }
        commit(cursor)
      }
    }
    if let check = nextCheck, check <= now { checkAttachments() }
    rearm()
  }

  /// Re-reads every shown cursor's target window: visibility and level (the spec's Design, "Where it shows": four times a
  /// second while a cursor shows, and at each activation, Space or lock event).
  private func checkAttachments() {
    let shown = cursors.values.filter { $0.lifecycle.phase.visible && $0.attachment != nil }
    nextCheck = nil
    guard !shown.isEmpty else { return }
    let list = signposted("cursor.windowList") { environment.windowList() }
    let front = environment.frontmostPid()
    for cursor in shown {
      guard let previous = cursor.attachment else { continue }
      let now = cursorAttachment(window: previous.window, list: list, frontmostPid: front)
      if now != previous {
        cursor.attachment = CursorAttachment(window: now.window, owner: now.visible ? now.owner : previous.owner, level: now.level, visible: now.visible)
        commit(cursor)
      }
    }
  }

  /// The screen locked: every cursor's pending action is superseded (a hidden cursor's first action still being read
  /// included, so nothing shows until the next action), and a shown cursor fades.
  private func lockScreen() {
    for cursor in cursors.values {
      cursor.stateEpoch += 1
      guard cursor.lifecycle.phase.visible else { continue }
      let generation = bump(cursor.connection)
      hideNow(cursor)
      commit(cursor, generation: generation)
    }
  }

  /// A fade starting now: the renderer starts it from `phaseSince`, so the timestamp is the fade's own start.
  private func hideNow(_ cursor: CursorModel) {
    let now = environment.now()
    let before = cursor.lifecycle.phase
    cursor.lifecycle.hide(now: now)
    if cursor.lifecycle.phase != before { cursor.phaseSince = now }
  }

  /// Whether `cursor`'s retained motion is still playing at `now` (its tip not yet settled, or a dip still to come).
  private func motionInFlight(_ cursor: CursorModel, now: TimeInterval) -> Bool {
    guard let motion = cursor.motion else { return false }
    let settles = motion.beginTime + Double(motion.trajectory.settleIndex) * motion.trajectory.step
    return settles > now || motion.dips.contains { $0 > now }
  }

  /// Stops whatever the retained motion still plays, where it is now: the trajectory's state held, with no dip (one
  /// playing or to come). Unconditional: the tip may have settled while a dip or the halo's relaxation still runs.
  private func freeze(_ cursor: CursorModel, now: TimeInterval) {
    guard let motion = cursor.motion else { return }
    var state = motion.trajectory.state(at: now - motion.beginTime)
    state.velocity = .zero
    motionCounter += 1
    cursor.motion = CursorMotionInstall(id: motionCounter, trajectory: stillTrajectory(at: state), beginTime: now, dips: [], fadeIn: false)
  }

  /// Reduce Motion or Increase Contrast changed: a motion in flight is planned again from where it is now under the new
  /// setting (its dip kept if it had not played yet), and every cursor is committed, so the renderer re-reads the
  /// options (the rock, the stroke).
  private func displayOptionsChanged() {
    let now = environment.now()
    let reduce = environment.reduceMotion()
    let screens = environment.screens()
    for cursor in cursors.values {
      if reduce != cursor.plannedReduced, motionInFlight(cursor, now: now), let motion = cursor.motion, let screen = cursor.screen {
        let begin = now + Self.spliceLead
        let start = motion.trajectory.state(at: begin - motion.beginTime)
        let trajectory = plan(from: start, to: motion.trajectory.end, bounds: screens.localVisibleFrame(of: screen), reduceMotion: reduce)
        let dipPending = motion.dips.contains { $0 > now }
        motionCounter += 1
        cursor.motion = CursorMotionInstall(id: motionCounter, trajectory: trajectory, beginTime: begin,
                                            dips: dipPending ? [begin + trajectory.arrival] : [], fadeIn: false)
        cursor.plannedReduced = reduce
        // One settle deadline for the replacement and the state: thinking begins when this trajectory settles.
        cursor.lifecycle.motionReplaced(settlesAt: begin + Double(trajectory.settleIndex) * trajectory.step)
      }
      commit(cursor)
    }
  }

  /// Re-arms the one timer for the earliest of every cursor's next transition and, while any shows, the next check; and
  /// holds the activity while any shows.
  private func rearm() {
    let now = environment.now()
    let showing = cursors.values.contains { $0.lifecycle.phase.visible && $0.attachment?.visible == true }
    if showing != activityHeld {
      activityHeld = showing
      environment.activity(showing)
    }
    if cursors.values.contains(where: { $0.lifecycle.phase.visible && $0.attachment != nil }) {
      if nextCheck == nil { nextCheck = now + Self.checkPeriod }
    } else {
      nextCheck = nil
    }
    let deadlines = cursors.values.compactMap { $0.lifecycle.nextDeadline } + [nextCheck].compactMap { $0 }
    guard environment.timers else { return }
    guard let next = deadlines.min() else {
      timer?.cancel()
      timer = nil
      return
    }
    if timer == nil {
      let source = DispatchSource.makeTimerSource(queue: queue)
      source.setEventHandler { [weak self] in self?.runDue() }
      source.resume()
      timer = source
    }
    timer?.schedule(deadline: .now() + max(next - now, 0.001), leeway: .milliseconds(5))
  }

  // MARK: The attachment's events

  private func observeAttachmentEvents() {
    let workspace = environment.workspaceCenter
    for name in [NSWorkspace.didActivateApplicationNotification, NSWorkspace.didDeactivateApplicationNotification,
                 NSWorkspace.activeSpaceDidChangeNotification] {
      let token = workspace.addObserver(forName: name, object: nil, queue: nil) { [weak self] _ in
        guard let self else { return }
        self.queue.async { [self] in checkAttachments(); rearm() }
      }
      observers.append((workspace, token))
    }
    let reduce = workspace.addObserver(forName: NSWorkspace.accessibilityDisplayOptionsDidChangeNotification, object: nil, queue: nil) { [weak self] _ in
      guard let self else { return }
      self.queue.async { [self] in displayOptionsChanged() }
    }
    observers.append((workspace, reduce))
    let distributed = environment.distributedCenter
    let lock = distributed.addObserver(forName: Notification.Name("com.apple.screenIsLocked"), object: nil, queue: nil) { [weak self] _ in
      guard let self else { return }
      self.queue.async { [self] in lockScreen() }
    }
    observers.append((distributed, lock))
    let app = environment.appCenter
    let screens = app.addObserver(forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: nil) { [weak self] _ in
      guard let self else { return }
      self.queue.async { [self] in rescreen() }
    }
    observers.append((app, screens))
  }

  /// A display reconfiguration: each cursor's panel is re-set to the frame of the screen now holding its last point,
  /// where it rests (a snap, as a move across screens is).
  private func rescreen() {
    let screens = environment.screens()
    let now = environment.now()
    for cursor in cursors.values {
      guard let app = cursor.app, let point = cursor.lifecycle.lastPoints[app], let screen = screens.screen(containing: point.global),
            screen != cursor.screen else { continue }
      motionCounter += 1
      cursor.motion = CursorMotionInstall(id: motionCounter, trajectory: snapTrajectory(to: screens.local(point.global, in: screen)),
                                          beginTime: now + Self.spliceLead, dips: [], fadeIn: false)
      cursor.screen = screen
      commit(cursor)
    }
  }

  // MARK: Test and probe readings

  /// The last state the hub committed for `connection` (read on the cursor queue).
  func lastCommit(connection: Int) -> CursorCommit? { queue.sync { cursors[connection]?.committed } }

  func phase(connection: Int) -> CursorPhase? { queue.sync { cursors[connection]?.lifecycle.phase } }
}

/// One connection's cursor, owned by the cursor queue.
private final class CursorModel {
  let connection: Int
  var identity: CursorIdentity
  var enabled = true
  var lifecycle = CursorLifecycle()
  var phaseSince: TimeInterval = 0
  var app: String?
  var screen: CursorScreen?
  var attachment: CursorAttachment?
  /// The retained motion: what a splice evaluates; and whether it was planned under Reduce Motion.
  var motion: CursorMotionInstall?
  var plannedReduced = false
  var committed: CursorCommit?
  /// Bumped by every event that sets the state other than an action: an action's geometry read across one is dropped.
  var stateEpoch = 0

  init(connection: Int, identity: CursorIdentity) {
    self.connection = connection
    self.identity = identity
  }
}
