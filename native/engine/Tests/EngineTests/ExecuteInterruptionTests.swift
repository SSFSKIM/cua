import AppKit
import XCTest
@testable import Engine

// Request-level regression for #212's review: the real execute lifecycle, guard and held-activation release, with
// only the method's AX/input boundary substituted. No permission prompt or live app input.
final class ExecuteInterruptionTests: XCTestCase {
  func testMenuTeardownBeforeDispatchAndWhileUnwindingAreReportedAsPossibleEffects() throws {
    for method in ["set_value", "click"] {
      try checkTeardown(method: method, focusHold: false)
    }
  }

  func testFocusHoldTeardownBeforeDispatchIsReportedAsPossibleEffects() throws {
    try checkTeardown(method: "set_value", focusHold: true)
  }

  private func checkTeardown(method: String, focusHold: Bool) throws {
    let monitor = InterventionMonitor(listenGranted: { true }, createsTap: false)
    let engine = Engine(paths: ServerPaths(socket: "/tmp/execute-interruption.sock", directory: "/tmp",
                                           lock: "/tmp/execute-interruption.lock", usage: "/tmp/execute-interruption-usage.json"),
                        intervention: monitor, screenLocked: { false })
    let connection = ConnectionState(id: 212, fd: -1,
                                     menuSpan: ActivationSpan(schedule: { _, _ in }),
                                     focusHold: ActivationSpan(label: "focus", schedule: { _, _ in }))
    let app = ResolvedApp(appPath: "/Applications/Fixture.app", bundleIdentifier: "example.fixture", displayName: "Fixture", running: nil)
    engine.apps.cache.store("fixture", app)
    let lineage = Lineage()
    connection.lineages[app.key] = lineage
    let tree = FakeTree()
    tree.children = [90: [91], 91: [92]]
    let rooted = walk(tree, lineage, window: 90)
    lineage.current?.menuRoot = Engine.element(90)
    let item = try XCTUnwrap(rooted.nodes.last?["token"] as? String)

    let seam = GuardSeam(frontmost: 990_002)
    var preparation = InputMeta(ExecutionContext(connection: connection, receivedAt: 1, hidIdleMs: 0, deadline: 100, lineage: nil))
    let release = try engine.heldActivations.acquire(pid: 990_001, beforeActivating: {}, make: {
      FakeActivation(pid: 990_001, window: AXUIElementCreateApplication(990_001),
                     windowFrame: CGRect(x: 80, y: 60, width: 610, height: 860), windowID: 41, system: seam.system)
    }, meta: &preparation)
    if focusHold {
      connection.focusHold.hold(app: "another-app", release: release)
    } else {
      connection.recordMenu(Engine.element(90), app: app.key, release: release)
    }
    _ = engine.interventionGuard(app: app, pid: 990_001, requestApp: "fixture", connection: connection)
    monitor.note(TapEventFields(type: .scrollWheel, sourcePID: 5, targetPID: 990_001, windowID: 0), at: unixMilliseconds() - 10_000)

    let params: [String: Any] = ["method": method, "args": ["app": "fixture", "element": item, "value": "intended"], "lineage": lineage.id]
    func executeRefusal() throws -> Any {
      try engine.execute(params, connection, unixMilliseconds()) { dispatched, _, context, resolved in
        XCTAssertEqual(dispatched, method)
        XCTAssertEqual(resolved?.key, app.key)
        let guardRead = engine.interventionGuard(app: app, pid: 990_001, requestApp: "fixture", connection: connection)
        do {
          try guardRead.checkBeforePosting()
          XCTFail("the attributed scroll must refuse input")
          return [:] as [String: Any]
        } catch let error as EngineError {
          var meta = InputMeta(context)
          meta.apply(guardRead)
          throw withMeta(error, meta)
        }
      }
    }
    XCTAssertThrowsError(try executeRefusal()) { thrown in
      let error = thrown as! EngineError
      let meta = error.extra["meta"] as? [String: Any]
      let detail = meta?["interruption"] as? [String: Any]
      XCTAssertEqual(error.code, -10016)
      XCTAssertEqual(detail?["phase"] as? String, "in-flight")
      XCTAssertEqual(detail?["effects"] as? [String], ["activation-teardown-attempted"])
      XCTAssertTrue(error.message.contains("interrupted after possible effects"))
      XCTAssertFalse(error.message.contains("refused before any effects"))
      XCTAssertTrue(error.message.contains("teardown"))
      XCTAssertTrue(meta?["startedAt"] is NSNull, "teardown is outside the ordinary action interval")
    }
    XCTAssertEqual(seam.posts.map(\.kind), [.appKit(1), .appKit(2)], "required cleanup still posts deactivation, never optional input")
    XCTAssertEqual(engine.heldActivations.holders(990_001), 0)
    XCTAssertNil(connection.menuSpan.app)
    XCTAssertNil(connection.focusHold.app)

    // A later ordinary request must not inherit the previous request's teardown classification (nor address the
    // stale menu revision, which correctly has a separate menuActivationLapsed refusal).
    lineage.current?.menuRoot = nil
    XCTAssertThrowsError(try executeRefusal()) { thrown in
      let error = thrown as! EngineError
      let detail = (error.extra["meta"] as? [String: Any])?["interruption"] as? [String: Any]
      XCTAssertEqual(detail?["phase"] as? String, "before-effects")
      XCTAssertEqual(detail?["effects"] as? [String], [])
    }
  }
}
