import AppKit
import ApplicationServices
import Foundation
import QuartzCore

// The agent cursor's hub (the spec's Design, "Rendering and the main thread", "Hooks", "Lifecycle and identity"; #235).
// One per engine, one cursor per connection. Thread-safe and never blocking: the hooks call it from request threads,
// where it only bumps a generation under its lock and enqueues; a serial cursor queue (never main) keeps every cursor's
// state, plans the motion and runs the state timers; one `main.async` block per change hands the renderer the whole
// desired state (a commit), so nothing the cursor does runs on the main thread per frame and no action waits for it
// (O5). Nothing here can fail an action: a cursor that cannot be placed simply does not move.

/// What an action did, for the cursor. Points are global, top-left origin (the engine's posting space).
enum CursorAction: @unchecked Sendable {
  case click(CGPoint)          // coordinate or element click: glide, then the press dip on arrival
  case element(AXUIElement, storedFrame: CGRect?)   // accessibility action: the cursor queue reads the current frame
                                                    // after the action is sent, falls back to storedFrame; glide, dip
  case drag([CGPoint])         // glide to the first point, dip, trace the path, rest at the last
  case scroll(CGPoint)         // glide, no dip
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

  /// Every execute request, in its prologue.
  func begin(connection: Int, app: String?, keyboardOnly: Bool) {
    queue.async { [self] in
      let cursor = model(connection)
      let now = environment.now()
      cursor.lifecycle.tick(now: now)
      switch cursor.lifecycle.begin(app: app, keyboardOnly: keyboardOnly, now: now) {
      case .none: break
      case .reappear(let point): reappear(cursor, at: point, now: now)
      }
      commit(cursor)
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

  /// An action reached a hook. `window` nil: no move (for `.element`, the element's own window is read instead).
  func act(connection: Int, app: String, window: CGWindowID?, _ action: CursorAction) {
    let generation = bump(connection)
    queue.async { [self] in perform(connection: connection, app: app, window: window, action, generation: generation) }
  }

  /// The accessibility-only element methods' hook: `operation` runs first, on the caller's thread, and only when it
  /// answers success is the cursor pointed at the element, whose frame the cursor queue then reads (after the action, as
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
      if !enabled { cursor.lifecycle.hide(now: environment.now()) }
      commit(cursor)
    }
  }

  /// end_task (M2): fades at once.
  func hide(connection: Int) {
    let generation = bump(connection)
    queue.async { [self] in
      guard let cursor = cursors[connection] else { return }
      cursor.lifecycle.hide(now: environment.now())
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
        if cursor.lifecycle.phase != before { cursor.phaseSince = now; commit(cursor) }
      }
    }
  }

  /// Waits until everything enqueued so far has run (the tests' and the probe's barrier).
  func drain() { queue.sync {} }

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
    if current(connection) == nil { lock.withLock { generations[connection] = 0 } }
    return cursor
  }

  private func perform(connection: Int, app: String, window: CGWindowID?, _ action: CursorAction, generation: Int) {
    guard current(connection) == generation else { return }  // a newer plan, a hide or a close superseded it
    let cursor = model(connection)
    defer { commit(cursor) }
    guard cursor.enabled else { return }
    // The points and the window the action names; an action with neither a point nor a window does not move.
    var points: [CGPoint]
    var target = window
    let dips: Bool
    switch action {
    case .click(let p): points = [p]; dips = true
    case .scroll(let p): points = [p]; dips = false
    case .drag(let path): points = path; dips = true
    case .element(let element, let stored):
      let frame = environment.elementFrame(element) ?? stored
      guard let frame else { return }
      points = [CGPoint(x: frame.midX, y: frame.midY)]
      if target == nil { target = environment.elementWindow(element) }
      dips = true
    }
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
    if case .drag = action, local.count > 1 {
      for next in local.dropFirst() {
        trajectory = trajectory.followed(by: planStraight(from: trajectory.samples[trajectory.samples.count - 1], to: next,
                                                          bounds: bounds, reduceMotion: reduce))
      }
    }
    guard current(connection) == generation else { return }  // superseded while it was planned: dropped here
    motionCounter += 1
    cursor.motion = CursorMotionInstall(id: motionCounter, trajectory: trajectory, beginTime: begin,
                                        dips: dips ? [begin + arrival] : [], fadeIn: start == nil)
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
    let list = environment.windowList()
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

  private func lockScreen() {
    let now = environment.now()
    for cursor in cursors.values where cursor.lifecycle.phase.visible {
      let generation = bump(cursor.connection)
      cursor.lifecycle.hide(now: now)
      cursor.phaseSince = now
      commit(cursor, generation: generation)
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
      self.queue.async { [self] in for cursor in cursors.values { commit(cursor) } }
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
  /// The retained motion: what a splice evaluates.
  var motion: CursorMotionInstall?
  var committed: CursorCommit?

  init(connection: Int, identity: CursorIdentity) {
    self.connection = connection
    self.identity = identity
  }
}
