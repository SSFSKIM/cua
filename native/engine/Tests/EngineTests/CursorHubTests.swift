import AppKit
import ApplicationServices
import XCTest
@testable import Engine

// The cursor hub (Cursor/CursorHub.swift): the hooks' interface, the generations, retargeting from the retained
// trajectory, the press dip at arrival, the attachment driven by synthetic notifications, and the hooks' ordering for
// the accessibility-only methods. The renderer is a recording fake, the clock a manual one, the main thread a block run
// in place (or held, to test the main-thread drop).

private final class Clock: @unchecked Sendable {
  var t: TimeInterval = 100
}

private final class RecordingRenderer: CursorRenderer, @unchecked Sendable {
  private let lock = NSLock()
  private var applied: [CursorCommit] = []
  private var closedConnections: [Int] = []
  func apply(_ commit: CursorCommit) { lock.withLock { applied.append(commit) } }
  func close(connection: Int) { lock.withLock { closedConnections.append(connection) } }
  var commits: [CursorCommit] { lock.withLock { applied } }
  var closed: [Int] { lock.withLock { closedConnections } }
  var last: CursorCommit? { commits.last }
}

/// A main thread that holds its blocks until `run`.
private final class HeldMain: @unchecked Sendable {
  private let lock = NSLock()
  private var blocks: [@Sendable () -> Void] = []
  func enqueue(_ block: @escaping @Sendable () -> Void) { lock.withLock { blocks.append(block) } }
  func run() {
    let pending = lock.withLock { () -> [@Sendable () -> Void] in defer { blocks = [] }; return blocks }
    pending.forEach { $0() }
  }
}

private final class World: @unchecked Sendable {
  let clock = Clock()
  var list: [ListedWindow] = [
    ListedWindow(number: 10, owner: 500, layer: 0, bounds: CGRect(x: 0, y: 0, width: 600, height: 400)),
    ListedWindow(number: 20, owner: 600, layer: 0, bounds: CGRect(x: 100, y: 100, width: 1200, height: 700)),
  ]
  var front: pid_t = 500
  var reduceMotion = false
  let workspace = NotificationCenter()
  let distributed = NotificationCenter()
  let appCenter = NotificationCenter()
  var screens = [CursorScreen(frame: CGRect(x: 0, y: 0, width: 1440, height: 900), visibleFrame: CGRect(x: 0, y: 0, width: 1440, height: 870))]
  var activity: [Bool] = []

  func environment(main: ((@escaping @Sendable () -> Void) -> Void)? = nil, beforePlanning: @escaping () -> Void = {},
                   elementFrame: @escaping (AXUIElement) -> CGRect? = { _ in nil }) -> CursorEnvironment {
    var e = CursorEnvironment()
    e.now = { [clock] in clock.t }
    e.main = main ?? { $0() }
    e.screens = { [unowned self] in CursorScreens(primaryHeight: 900, all: screens) }
    e.appCenter = appCenter
    e.windowList = { [unowned self] in list }
    e.frontmostPid = { [unowned self] in front }
    e.reduceMotion = { [unowned self] in reduceMotion }
    e.elementFrame = elementFrame
    e.elementWindow = { _ in 20 }
    e.workspaceCenter = workspace
    e.distributedCenter = distributed
    e.activity = { [unowned self] in activity.append($0) }
    e.beforePlanning = beforePlanning
    return e
  }
}

final class CursorHubTests: XCTestCase {
  private let app = "/System/Applications/TextEdit.app#600"

  private func hub(_ world: World, _ renderer: RecordingRenderer, main: ((@escaping @Sendable () -> Void) -> Void)? = nil,
                   beforePlanning: @escaping () -> Void = {}, elementFrame: @escaping (AXUIElement) -> CGRect? = { _ in nil }) -> CursorHub {
    CursorHub(environment: world.environment(main: main, beforePlanning: beforePlanning, elementFrame: elementFrame), renderer: renderer)
  }

  /// One click request at the global point.
  private func click(_ hub: CursorHub, _ point: CGPoint, window: CGWindowID? = 20) {
    hub.begin(connection: 1, app: app, keyboardOnly: false)
    hub.act(connection: 1, app: app, window: window, .click(point))
    hub.end(connection: 1)
    hub.drain()
  }

  func testTheFirstActionFadesInAtItsTargetAndDipsThere() throws {
    let world = World(), renderer = RecordingRenderer()
    let hub = hub(world, renderer)
    click(hub, CGPoint(x: 400, y: 300))
    let commit = try XCTUnwrap(renderer.last)
    XCTAssertEqual(commit.phase, .acting)
    XCTAssertTrue(commit.shown)
    let motion = try XCTUnwrap(commit.motion)
    XCTAssertTrue(motion.fadeIn)
    XCTAssertEqual(motion.trajectory.mode, .snap)
    XCTAssertEqual(motion.trajectory.end, CGPoint(x: 400, y: 600), "flipped into the panel's y-up coordinates")
    XCTAssertEqual(motion.dips, [motion.beginTime])
    XCTAssertEqual(world.activity, [true], "the activity is held while a cursor shows")
  }

  func testThePressDipPlaysAtArrivalNotAtTheCall() throws {
    let world = World(), renderer = RecordingRenderer()
    let hub = hub(world, renderer)
    click(hub, CGPoint(x: 200, y: 200))
    world.clock.t += 2
    click(hub, CGPoint(x: 1200, y: 700))
    let motion = try XCTUnwrap(renderer.last?.motion)
    XCTAssertEqual(motion.trajectory.mode, .path)
    XCTAssertFalse(motion.fadeIn)
    let dip = try XCTUnwrap(motion.dips.first)
    XCTAssertEqual(dip, motion.beginTime + motion.trajectory.arrival, accuracy: 1e-9)
    XCTAssertGreaterThan(dip - world.clock.t, 0.3, "the glide comes first; the action did not wait for it")
  }

  func testAScrollGlidesWithNoDip() throws {
    let world = World(), renderer = RecordingRenderer()
    let hub = hub(world, renderer)
    click(hub, CGPoint(x: 200, y: 200))
    hub.act(connection: 1, app: app, window: 20, .scroll(CGPoint(x: 260, y: 230)))
    hub.drain()
    XCTAssertEqual(try XCTUnwrap(renderer.last?.motion).dips, [])
  }

  func testADragGlidesToItsStartDipsThenTracesToItsEnd() throws {
    let world = World(), renderer = RecordingRenderer()
    let hub = hub(world, renderer)
    click(hub, CGPoint(x: 200, y: 200))
    world.clock.t += 2
    hub.act(connection: 1, app: app, window: 20, .drag([CGPoint(x: 300, y: 300), CGPoint(x: 900, y: 500)]))
    hub.drain()
    let motion = try XCTUnwrap(renderer.last?.motion)
    XCTAssertEqual(motion.trajectory.end, CGPoint(x: 900, y: 400))
    XCTAssertEqual(motion.dips.count, 1)
    XCTAssertLessThan(motion.dips[0], motion.beginTime + motion.trajectory.duration - 0.2, "the dip at the start, before the trace")
  }

  func testRapidRetargetsSpliceFromTheRetainedTrajectoryAndNeverJumpBack() throws {
    let world = World(), renderer = RecordingRenderer()
    let hub = hub(world, renderer)
    click(hub, CGPoint(x: 150, y: 150))
    var previous = try XCTUnwrap(renderer.last?.motion)
    for (i, target) in [CGPoint(x: 1200, y: 700), CGPoint(x: 1300, y: 200), CGPoint(x: 300, y: 650), CGPoint(x: 700, y: 400)].enumerated() {
      world.clock.t += 0.05 + 0.1 * Double(i)
      click(hub, target)
      let motion = try XCTUnwrap(renderer.last?.motion)
      XCTAssertGreaterThan(motion.beginTime, previous.beginTime)
      let spliced = previous.trajectory.state(at: motion.beginTime - previous.beginTime)
      XCTAssertEqual(motion.trajectory.samples[0].position, spliced.position, "move \(i) starts where the last one was then")
      XCTAssertEqual(motion.beginTime, world.clock.t + CursorHub.spliceLead, accuracy: 1e-9)
      previous = motion
    }
  }

  func testAHideWhileAPlanIsComputingDropsThatPlan() {
    let world = World(), renderer = RecordingRenderer()
    let planning = DispatchSemaphore(value: 0), release = DispatchSemaphore(value: 0)
    var held = true
    let hub = hub(world, renderer, beforePlanning: {
      if held { held = false; planning.signal(); release.wait() }
    })
    hub.act(connection: 1, app: app, window: 20, .click(CGPoint(x: 400, y: 300)))
    planning.wait()
    hub.hide(connection: 1)
    release.signal()
    hub.drain()
    XCTAssertFalse(renderer.commits.contains { $0.shown }, "the plan was dropped: nothing showed")
    XCTAssertEqual(hub.phase(connection: 1), .hidden)
  }

  func testACloseWhilePlanningDropsThePlanAndOrdersThePanelOut() {
    let world = World(), renderer = RecordingRenderer()
    let planning = DispatchSemaphore(value: 0), release = DispatchSemaphore(value: 0)
    var held = true
    let hub = hub(world, renderer, beforePlanning: {
      if held { held = false; planning.signal(); release.wait() }
    })
    hub.act(connection: 1, app: app, window: 20, .click(CGPoint(x: 400, y: 300)))
    planning.wait()
    hub.closed(connection: 1)
    release.signal()
    hub.drain()
    XCTAssertTrue(renderer.commits.isEmpty)
    XCTAssertEqual(renderer.closed, [1])
  }

  func testAStaleCommitIsDroppedAtTheMainThread() throws {
    let world = World(), renderer = RecordingRenderer(), main = HeldMain()
    let hub = hub(world, renderer, main: { main.enqueue($0) })
    click(hub, CGPoint(x: 400, y: 300))   // its show waits on the held main thread
    hub.hide(connection: 1)
    hub.drain()
    main.run()
    XCTAssertEqual(renderer.commits.count, 1, "the late show was dropped")
    XCTAssertEqual(renderer.last?.phase, .fading)
  }

  func testAnActionWithNoPointOrNoWindowMovesNothing() {
    let world = World(), renderer = RecordingRenderer()
    let hub = hub(world, renderer)
    click(hub, CGPoint(x: 400, y: 300), window: nil)
    XCTAssertFalse(renderer.commits.contains { $0.shown })
    let element = AXUIElementCreateApplication(getpid())
    hub.act(connection: 1, app: app, window: 20, .element(element, storedFrame: nil))  // no frame now, none stored
    hub.drain()
    XCTAssertFalse(renderer.commits.contains { $0.shown })
    click(hub, CGPoint(x: -500, y: 300))  // off every screen
    XCTAssertFalse(renderer.commits.contains { $0.shown })
    XCTAssertEqual(hub.phase(connection: 1), .hidden)
  }

  func testAnElementActionUsesTheStoredFrameWhenTheCurrentOneCannotBeRead() throws {
    let world = World(), renderer = RecordingRenderer()
    let hub = hub(world, renderer)
    hub.act(connection: 1, app: app, window: nil, .element(AXUIElementCreateApplication(getpid()), storedFrame: CGRect(x: 300, y: 200, width: 100, height: 40)))
    hub.drain()
    XCTAssertEqual(try XCTUnwrap(renderer.last?.motion).trajectory.end, CGPoint(x: 350, y: 680), "the stored frame's midpoint, flipped")
  }

  func testTheAccessibilityOnlyHookReadsTheFrameOnlyAfterTheOperationReturns() throws {
    let world = World(), renderer = RecordingRenderer()
    let marks = NSLock()
    var operationEnded: Double?, frameRead: Double?
    let hub = hub(world, renderer, elementFrame: { _ in
      marks.withLock { frameRead = monotonicMilliseconds() }
      return CGRect(x: 500, y: 300, width: 80, height: 20)
    })
    let element = AXUIElementCreateApplication(getpid())
    let succeeded = hub.afterElementAction(connection: 1, app: app, element: element, storedFrame: nil) {
      usleep(100_000)  // a slow accessibility operation; the cursor queue is free meanwhile
      marks.withLock { operationEnded = monotonicMilliseconds() }
      return true
    }
    hub.drain()
    XCTAssertTrue(succeeded)
    let ended = try XCTUnwrap(marks.withLock { operationEnded }), read = try XCTUnwrap(marks.withLock { frameRead })
    XCTAssertGreaterThanOrEqual(read, ended)
    XCTAssertEqual(try XCTUnwrap(renderer.last?.motion).trajectory.end, CGPoint(x: 540, y: 590))
  }

  func testAFailedAccessibilityOperationPointsNowhere() {
    let world = World(), renderer = RecordingRenderer()
    var read = false
    let hub = hub(world, renderer, elementFrame: { _ in read = true; return CGRect(x: 0, y: 0, width: 10, height: 10) })
    XCTAssertFalse(hub.afterElementAction(connection: 1, app: app, element: AXUIElementCreateApplication(getpid()), storedFrame: nil) { false })
    hub.drain()
    XCTAssertFalse(read)
    XCTAssertTrue(renderer.commits.isEmpty)
  }

  func testDeactivatingTheTargetAppDropsTheCursorBackToItsWindowsLevel() throws {
    let world = World(), renderer = RecordingRenderer()
    world.front = 600  // TextEdit in front: raised above menus
    let hub = hub(world, renderer)
    click(hub, CGPoint(x: 400, y: 300))
    XCTAssertEqual(renderer.last?.attachment.level, 102)
    world.front = 500  // the person switches to another app
    world.workspace.post(name: NSWorkspace.didDeactivateApplicationNotification, object: nil)
    hub.drain()
    XCTAssertEqual(renderer.last?.attachment.level, 0)
    XCTAssertEqual(renderer.last?.attachment.window, 20)
    XCTAssertTrue(try XCTUnwrap(renderer.last).shown)
  }

  func testASpaceChangeHidesTheCursorAndChangingBackShowsIt() throws {
    let world = World(), renderer = RecordingRenderer()
    let hub = hub(world, renderer)
    click(hub, CGPoint(x: 400, y: 300))
    let target = world.list[1]
    world.list = [world.list[0]]  // the target window is not on the new Space
    world.workspace.post(name: NSWorkspace.activeSpaceDidChangeNotification, object: nil)
    hub.drain()
    XCTAssertFalse(try XCTUnwrap(renderer.last).shown)
    world.list.append(target)
    world.workspace.post(name: NSWorkspace.activeSpaceDidChangeNotification, object: nil)
    hub.drain()
    XCTAssertTrue(try XCTUnwrap(renderer.last).shown)
  }

  func testTheWindowStateCheckSeesAMenuOpeningAndClosingWithNoRequest() throws {
    let world = World(), renderer = RecordingRenderer()
    let hub = hub(world, renderer)
    click(hub, CGPoint(x: 400, y: 300))
    XCTAssertEqual(renderer.last?.attachment.level, 0)
    world.list.insert(ListedWindow(number: 31, owner: 600, layer: 101, bounds: CGRect(x: 380, y: 300, width: 200, height: 300)), at: 0)
    world.clock.t += CursorHub.checkPeriod
    hub.tick()
    XCTAssertEqual(renderer.last?.attachment.level, 102, "the menu opened: above it")
    world.list.removeFirst()
    world.clock.t += CursorHub.checkPeriod
    hub.tick()
    XCTAssertEqual(renderer.last?.attachment.level, 0, "closed: back under what covers TextEdit within a check")
  }

  func testLockingTheScreenHidesTheCursor() {
    let world = World(), renderer = RecordingRenderer()
    let hub = hub(world, renderer)
    click(hub, CGPoint(x: 400, y: 300))
    world.distributed.post(name: Notification.Name("com.apple.screenIsLocked"), object: nil)
    hub.drain()
    XCTAssertEqual(renderer.last?.phase, .fading)
  }

  func testThePersonActingInTheAppMakesTheCursorTakenOver() {
    let world = World(), renderer = RecordingRenderer()
    let hub = hub(world, renderer)
    click(hub, CGPoint(x: 400, y: 300))
    hub.userActed(pid: 500)  // another app
    hub.drain()
    XCTAssertNotEqual(hub.phase(connection: 1), .takenOver)
    hub.userActed(pid: 600)
    hub.drain()
    XCTAssertEqual(renderer.last?.phase, .takenOver)
  }

  func testTheIdleFadeRunsOnTheHubsTimerAndReleasesTheActivity() {
    let world = World(), renderer = RecordingRenderer()
    let hub = hub(world, renderer)
    click(hub, CGPoint(x: 400, y: 300))
    world.clock.t += 1
    hub.tick()
    XCTAssertEqual(renderer.last?.phase, .thinking)
    world.clock.t += 4.2
    hub.tick()
    XCTAssertEqual(renderer.last?.phase, .fading)
    world.clock.t += 0.5
    hub.tick()
    XCTAssertEqual(hub.phase(connection: 1), .hidden)
    XCTAssertEqual(world.activity, [true, false])
  }

  func testAnExplicitHideStartsItsFadeWhenTheHideComes() throws {
    let world = World(), renderer = RecordingRenderer()
    let hub = hub(world, renderer)
    click(hub, CGPoint(x: 400, y: 300))
    world.clock.t += 1
    hub.tick()
    XCTAssertEqual(renderer.last?.phase, .thinking)
    world.clock.t += 2.5  // well after thinking began, before the idle fade
    hub.hide(connection: 1)
    hub.drain()
    let commit = try XCTUnwrap(renderer.last)
    XCTAssertEqual(commit.phase, .fading)
    XCTAssertEqual(commit.phaseSince, world.clock.t, "the fade starts now, not when thinking began")
  }

  func testTakingOverMidwayThroughALongMoveFreezesTheCursorWhereItIs() throws {
    let world = World(), renderer = RecordingRenderer()
    let hub = hub(world, renderer)
    click(hub, CGPoint(x: 200, y: 200))
    world.clock.t += 2
    click(hub, CGPoint(x: 1200, y: 700))
    let moving = try XCTUnwrap(renderer.last?.motion)
    world.clock.t += 0.3
    hub.userActed(pid: 600)
    hub.drain()
    let commit = try XCTUnwrap(renderer.last)
    XCTAssertEqual(commit.phase, .takenOver)
    let still = try XCTUnwrap(commit.motion)
    XCTAssertNotEqual(still.id, moving.id)
    XCTAssertEqual(still.trajectory.samples.count, 1, "still")
    XCTAssertEqual(still.trajectory.samples[0].position, moving.trajectory.state(at: world.clock.t - moving.beginTime).position)
    XCTAssertEqual(still.dips, [], "the pending dip is cancelled")
  }

  func testTakingOverAtRestHoldsTheCursorWhereItIs() throws {
    let world = World(), renderer = RecordingRenderer()
    let hub = hub(world, renderer)
    click(hub, CGPoint(x: 400, y: 300))
    world.clock.t += 1
    hub.tick()
    hub.userActed(pid: 600)
    hub.drain()
    let still = try XCTUnwrap(renderer.last?.motion)
    XCTAssertEqual(still.trajectory.samples.count, 1)
    XCTAssertEqual(still.trajectory.end, CGPoint(x: 400, y: 600))
    XCTAssertEqual(still.dips, [])
  }

  func testTakingOverWhileTheArrivalsDipPlaysStopsTheDipToo() throws {
    // The tip has settled (a snap from hidden) and its dip began 50 ms ago: the dip must not run on.
    let world = World(), renderer = RecordingRenderer()
    let hub = hub(world, renderer)
    click(hub, CGPoint(x: 400, y: 300))
    let shown = try XCTUnwrap(renderer.last?.motion)
    world.clock.t = try XCTUnwrap(shown.dips.first) + 0.05
    hub.userActed(pid: 600)
    hub.drain()
    let commit = try XCTUnwrap(renderer.last)
    XCTAssertEqual(commit.phase, .takenOver)
    XCTAssertNotEqual(commit.motion?.id, shown.id, "a still motion replaces it, with no dip")
    XCTAssertEqual(commit.motion?.dips, [])
  }

  func testTakingOverWhileTheHaloRelaxesHoldsItsSwell() throws {
    let world = World(), renderer = RecordingRenderer()
    let hub = hub(world, renderer)
    click(hub, CGPoint(x: 100, y: 100))
    world.clock.t += 2
    click(hub, CGPoint(x: 1300, y: 800))
    let moving = try XCTUnwrap(renderer.last?.motion)
    let settled = moving.beginTime + Double(moving.trajectory.settleIndex) * moving.trajectory.step
    XCTAssertGreaterThan(moving.trajectory.duration, Double(moving.trajectory.settleIndex) * moving.trajectory.step, "a relaxing tail")
    world.clock.t = settled + 0.05
    hub.userActed(pid: 600)
    hub.drain()
    let still = try XCTUnwrap(renderer.last?.motion)
    XCTAssertEqual(still.trajectory.samples.count, 1)
    XCTAssertEqual(still.trajectory.samples[0].swell, moving.trajectory.state(at: world.clock.t - moving.beginTime).swell)
  }

  func testAClickThenAScrollBeforeItsArrivalLeavesNoDip() throws {
    let world = World(), renderer = RecordingRenderer()
    let hub = hub(world, renderer)
    click(hub, CGPoint(x: 200, y: 200))
    world.clock.t += 2
    click(hub, CGPoint(x: 1200, y: 700))
    XCTAssertEqual(renderer.last?.motion?.dips.count, 1)
    world.clock.t += 0.1  // before the click's arrival
    hub.act(connection: 1, app: app, window: 20, .scroll(CGPoint(x: 300, y: 300)))
    hub.drain()
    XCTAssertEqual(try XCTUnwrap(renderer.last?.motion).dips, [], "the commit carries no dip: the renderer replaces the old one with none")
  }

  func testReduceMotionTurningOnMidMoveReplansTheMoveFromWhereItIs() throws {
    let world = World(), renderer = RecordingRenderer()
    let hub = hub(world, renderer)
    click(hub, CGPoint(x: 200, y: 200))
    world.clock.t += 2
    click(hub, CGPoint(x: 1200, y: 700))
    let moving = try XCTUnwrap(renderer.last?.motion)
    world.clock.t += 0.2
    world.reduceMotion = true
    world.workspace.post(name: NSWorkspace.accessibilityDisplayOptionsDidChangeNotification, object: nil)
    hub.drain()
    let commit = try XCTUnwrap(renderer.last)
    XCTAssertTrue(commit.reduceMotion)
    let replanned = try XCTUnwrap(commit.motion)
    XCTAssertNotEqual(replanned.id, moving.id)
    XCTAssertEqual(replanned.trajectory.duration, 0.15, accuracy: 1 / 240.0)
    XCTAssertEqual(replanned.trajectory.samples[0].position, moving.trajectory.state(at: replanned.beginTime - moving.beginTime).position)
    XCTAssertEqual(replanned.trajectory.end, moving.trajectory.end)
    XCTAssertEqual(replanned.dips.count, 1, "the click's dip had not played: it plays at the new arrival")
    // One settle deadline: thinking when the shortened move settles, long before the old glide would have.
    let newSettle = replanned.beginTime + Double(replanned.trajectory.settleIndex) * replanned.trajectory.step
    let oldSettle = moving.beginTime + Double(moving.trajectory.settleIndex) * moving.trajectory.step
    XCTAssertLessThan(newSettle, oldSettle)
    world.clock.t = newSettle - 0.001
    hub.tick()
    XCTAssertEqual(hub.phase(connection: 1), .acting)
    world.clock.t = newSettle
    hub.tick()
    XCTAssertEqual(hub.phase(connection: 1), .thinking, "not still acting until the old glide's settle")
  }

  func testReduceMotionTurningOffMidMoveKeepsActingUntilTheLongerGlideSettles() throws {
    let world = World(), renderer = RecordingRenderer()
    world.reduceMotion = true
    let hub = hub(world, renderer)
    click(hub, CGPoint(x: 200, y: 200))
    world.clock.t += 2
    click(hub, CGPoint(x: 1200, y: 700))
    let short = try XCTUnwrap(renderer.last?.motion)
    XCTAssertEqual(short.trajectory.duration, 0.15, accuracy: 1 / 240.0)
    world.clock.t += 0.05
    world.reduceMotion = false
    world.workspace.post(name: NSWorkspace.accessibilityDisplayOptionsDidChangeNotification, object: nil)
    hub.drain()
    let long = try XCTUnwrap(renderer.last?.motion)
    XCTAssertNotEqual(long.id, short.id)
    XCTAssertEqual(long.trajectory.mode, .path)
    let oldSettle = short.beginTime + Double(short.trajectory.settleIndex) * short.trajectory.step
    let newSettle = long.beginTime + Double(long.trajectory.settleIndex) * long.trajectory.step
    XCTAssertGreaterThan(newSettle, oldSettle + 0.2)
    world.clock.t = oldSettle + 0.01
    hub.tick()
    XCTAssertEqual(hub.phase(connection: 1), .acting, "no rock while the replacement glide is underway")
    world.clock.t = newSettle - 0.001
    hub.tick()
    XCTAssertEqual(hub.phase(connection: 1), .acting)
    world.clock.t = newSettle
    hub.tick()
    XCTAssertEqual(hub.phase(connection: 1), .thinking)
    XCTAssertEqual(renderer.last?.phase, .thinking)
  }

  func testReduceMotionTurningOffWhileThinkingIsCommittedWithNoAction() throws {
    let world = World(), renderer = RecordingRenderer()
    world.reduceMotion = true
    let hub = hub(world, renderer)
    click(hub, CGPoint(x: 400, y: 300))
    world.clock.t += 1
    hub.tick()
    XCTAssertEqual(renderer.last?.phase, .thinking)
    XCTAssertEqual(renderer.last?.reduceMotion, true)
    let count = renderer.commits.count
    world.reduceMotion = false
    world.workspace.post(name: NSWorkspace.accessibilityDisplayOptionsDidChangeNotification, object: nil)
    hub.drain()
    XCTAssertGreaterThan(renderer.commits.count, count)
    XCTAssertEqual(renderer.last?.phase, .thinking)
    XCTAssertEqual(renderer.last?.reduceMotion, false, "the renderer's rock starts from this commit (CursorRock)")
  }

  func testADisplayReconfigurationResetsThePanelToItsScreensNewFrame() throws {
    let world = World(), renderer = RecordingRenderer()
    let hub = hub(world, renderer)
    click(hub, CGPoint(x: 400, y: 300))
    world.screens = [CursorScreen(frame: CGRect(x: 0, y: 0, width: 1728, height: 900), visibleFrame: CGRect(x: 0, y: 0, width: 1728, height: 870))]
    world.appCenter.post(name: NSApplication.didChangeScreenParametersNotification, object: nil)
    hub.drain()
    let commit = try XCTUnwrap(renderer.last)
    XCTAssertEqual(commit.screen.frame.width, 1728)
    XCTAssertEqual(try XCTUnwrap(commit.motion).trajectory.end, CGPoint(x: 400, y: 600), "resting at its last point")
  }

  func testReduceMotionPlansStraightEases() throws {
    let world = World(), renderer = RecordingRenderer()
    world.reduceMotion = true
    let hub = hub(world, renderer)
    click(hub, CGPoint(x: 200, y: 200))
    world.clock.t += 1
    click(hub, CGPoint(x: 1200, y: 700))
    let commit = try XCTUnwrap(renderer.last)
    XCTAssertTrue(commit.reduceMotion)
    XCTAssertEqual(try XCTUnwrap(commit.motion).trajectory.duration, 0.15, accuracy: 1 / 240.0)
  }

  func testKeyboardRequestsBringAFadedCursorBackAtItsLastPoint() throws {
    let world = World(), renderer = RecordingRenderer()
    let hub = hub(world, renderer)
    click(hub, CGPoint(x: 400, y: 300))
    world.clock.t += 6
    hub.tick()
    world.clock.t += 0.5
    hub.tick()
    XCTAssertEqual(hub.phase(connection: 1), .hidden)
    hub.begin(connection: 1, app: app, keyboardOnly: true)
    hub.drain()
    let commit = try XCTUnwrap(renderer.last)
    XCTAssertTrue(commit.shown)
    XCTAssertEqual(try XCTUnwrap(commit.motion).trajectory.end, CGPoint(x: 400, y: 600))
  }

  func testKeyboardRequestsThatChangeNothingVisibleRenderNothing() {
    let world = World(), renderer = RecordingRenderer()
    let hub = hub(world, renderer)
    click(hub, CGPoint(x: 400, y: 300))
    let before = renderer.commits.count
    for _ in 0..<100 {
      hub.begin(connection: 1, app: app, keyboardOnly: true)
      hub.end(connection: 1)
    }
    hub.drain()
    XCTAssertEqual(renderer.commits.count, before, "an unchanged cursor is not handed to the main thread again")
    hub.userActed(pid: 600)
    hub.drain()
    XCTAssertEqual(renderer.last?.phase, .takenOver)
    hub.begin(connection: 1, app: app, keyboardOnly: true)
    hub.end(connection: 1)
    hub.drain()
    XCTAssertNotEqual(renderer.last?.phase, .takenOver, "a keyboard request clearing taken over is still rendered")
  }
}
