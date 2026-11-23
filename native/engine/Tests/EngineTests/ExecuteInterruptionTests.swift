import AppKit
import XCTest
@testable import Engine

// #212, PR #218's review: a request refused before its action can still end a held activation (a menu span or a focus
// hold) as it begins or as it unwinds, which may send the app a deactivation. The answer then names that end.
// The real execute lifecycle and span releases, only the method behind dispatch replaced (no permission prompt, no live
// input): it refuses as the pre-action check does.
final class ExecuteInterruptionTests: XCTestCase {
  private func engine() -> Engine {
    Engine(paths: ServerPaths(socket: "/tmp/execute-interruption.sock", directory: "/tmp", lock: "/tmp/execute-interruption.lock",
                              usage: "/tmp/execute-interruption-usage.json"),
           intervention: InterventionMonitor(listenGranted: { false }), screenLocked: { false })
  }

  private let app = ResolvedApp(appPath: "/Applications/Fixture.app", bundleIdentifier: "example.fixture", displayName: "Fixture", running: nil)

  /// One execute of `method` on the fixture, its method refusing before its action; answers the error.
  private func refused(_ engine: Engine, _ connection: ConnectionState, method: String, args: [String: Any] = [:], lineage: String? = nil) -> EngineError? {
    var params: [String: Any] = ["method": method, "args": args.merging(["app": "fixture"]) { given, _ in given }]
    if let lineage { params["lineage"] = lineage }
    do {
      _ = try engine.execute(params, connection, unixMilliseconds()) { dispatched, _, context, _ in
        XCTAssertEqual(dispatched, method)
        let guarding = InterventionGuard.reading(app: "fixture", cleared: 0, now: 6_000, latest: { AttributedEvent(sequence: 1, at: 10) })
        do {
          try guarding.checkBeforePosting()
        } catch let error as EngineError {
          throw withMeta(error, InputMeta(context))
        }
        XCTFail("the guard must refuse")
        return [String: Any]()
      }
      XCTFail("the request must fail")
      return nil
    } catch {
      return error as? EngineError
    }
  }

  private func interruption(_ error: EngineError?) -> (phase: String?, effects: [String]) {
    let detail = (error?.wire["meta"] as? [String: Any])?["interruption"] as? [String: Any]
    return (detail?["phase"] as? String, detail?["effects"] as? [String] ?? [])
  }

  func testAFocusHoldOnAnotherAppEndedBeforeTheRefusalIsNamed() throws {
    let engine = engine(), connection = ConnectionState(id: 212, fd: -1, focusHold: ActivationSpan(label: "focus", schedule: { _, _ in }))
    engine.apps.cache.store("fixture", app)
    var released = 0
    connection.focusHold.hold(app: "another-app", release: { released += 1; return true })
    let error = refused(engine, connection, method: "set_value")
    XCTAssertEqual(released, 1, "the hold on another app ends before the request, as it always did")
    XCTAssertEqual(interruption(error).phase, "beforeAction")
    XCTAssertEqual(interruption(error).effects, ["activationRelease"])
    XCTAssertTrue(error?.message.hasPrefix("The user changed 'fixture'.") == true, error?.message ?? "")
    XCTAssertFalse(error?.message.contains("The requested input was refused before its first step.") == true, "a deactivation may have been sent: \(error?.message ?? "")")
    XCTAssertTrue(error?.message.contains("which may have sent the app a deactivation") == true, error?.message ?? "")
    XCTAssertTrue((error?.wire["meta"] as? [String: Any])?["startedAt"] is NSNull, "the release is outside the action's interval")

    // The next request, with nothing held, does not inherit the earlier one's release.
    let next = refused(engine, connection, method: "set_value")
    XCTAssertEqual(interruption(next).effects, [])
    XCTAssertTrue(next?.message.contains("The requested input was refused before its first step.") == true, next?.message ?? "")
  }

  func testAMenuSpanEndedBeforeTheRefusalAndOneEndedWhileItUnwindsAreBothNamed() throws {
    let engine = engine(), connection = ConnectionState(id: 212, fd: -1, menuSpan: ActivationSpan(schedule: { _, _ in }))
    engine.apps.cache.store("fixture", app)
    let lineage = Lineage()
    connection.lineages[app.key] = lineage
    let tree = FakeTree()
    tree.children = [90: [91], 91: [92]]
    let rooted = walk(tree, lineage, window: 90)
    lineage.current?.menuRoot = Engine.element(90)
    let item = try XCTUnwrap(rooted.nodes.last?["token"] as? String)
    var released = 0

    // set_value on the held app ends its span before the method runs.
    connection.recordMenu(Engine.element(90), app: app.key, release: { released += 1; return true })
    let before = refused(engine, connection, method: "set_value", args: ["element": item], lineage: lineage.id)
    XCTAssertEqual(released, 1)
    XCTAssertEqual(interruption(before).effects, ["activationRelease"])

    // A click on an item of the recorded menu keeps the span through the method and ends it as the request unwinds.
    connection.recordMenu(Engine.element(90), app: app.key, release: { released += 1; return true })
    let unwinding = refused(engine, connection, method: "click", args: ["element": item], lineage: lineage.id)
    XCTAssertEqual(released, 2, "the span ends after the refused press, as it always did")
    XCTAssertEqual(interruption(unwinding).phase, "beforeAction")
    XCTAssertEqual(interruption(unwinding).effects, ["activationRelease"])
    XCTAssertNil(connection.menuSpan.app)
  }
}
