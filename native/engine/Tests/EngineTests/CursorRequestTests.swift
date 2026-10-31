import AppKit
import XCTest
@testable import Engine

// The `cursor` wire request and the per-connection identity and switch (Cursor/CursorSession.swift, Methods.swift; the
// spec's Interfaces and "Lifecycle and identity"): a session's label and colour, its off switch, end_task's hide, the
// device's `"cursor": false` winning, and the switch in `status`.

private final class Recorder: CursorRenderer, @unchecked Sendable {
  private let lock = NSLock()
  private var applied: [CursorCommit] = []
  func apply(_ commit: CursorCommit) { lock.withLock { applied.append(commit) } }
  func close(connection: Int) {}
  var last: CursorCommit? { lock.withLock { applied.last } }
}

final class CursorSessionTests: XCTestCase {
  func testARequestIsAHideOrAnyOfLabelColourAndSwitch() throws {
    XCTAssertEqual(try CursorRequest(["hide": true]), .hide)
    XCTAssertEqual(try CursorRequest(["label": "linux171", "color": "#8250df", "enabled": true]),
                   .configure(label: "linux171", color: RGB(hex: "#8250df"), enabled: true))
    XCTAssertEqual(try CursorRequest(["enabled": false]), .configure(label: nil, color: nil, enabled: false))
    XCTAssertEqual(try CursorRequest([:]), .configure(label: nil, color: nil, enabled: nil))
    XCTAssertEqual(try CursorRequest(["color": "#2F6FEB"]), .configure(label: nil, color: RGB(hex: "#2f6feb"), enabled: nil), "hex digits of either case")
  }

  func testAMalformedRequestIsRefusedAsInvalidParams() {
    for params: [String: Any] in [["hide": false], ["hide": 1], ["label": 7], ["color": "blue"], ["color": "#2f6feb0"], ["color": "2f6feb"],
                                  ["enabled": "false"], ["enabled": 0]] {
      XCTAssertThrowsError(try CursorRequest(params), "\(params)") { error in
        XCTAssertEqual((error as? EngineError)?.code, RPCCode.invalidParams.rawValue, "\(params)")
      }
    }
  }

  func testALabelIsTrimmedStrippedOfControlCharactersAndEmptyMeansNone() {
    XCTAssertEqual(sessionLabel("  Research \n"), "Research")
    XCTAssertEqual(sessionLabel("Re\u{7}se\u{1b}arch"), "Research")
    XCTAssertEqual(sessionLabel("a\u{0}\u{7f}\u{85}b"), "ab", "C0, DEL and C1 alike")
    XCTAssertEqual(sessionLabel("👩‍💻 dev"), "👩‍💻 dev", "a joiner is no control character")
    XCTAssertNil(sessionLabel(" \t\u{7} "))
    XCTAssertNil(sessionLabel(""))
  }

  func testTheIdentityIsTheSessionsOwnWithThePlaceholderForWhatItHasNotSet() {
    var session = CursorSession()
    XCTAssertEqual(session.identity(connection: 3), placeholderIdentity(connection: 3))
    session.apply(.configure(label: "Research", color: nil, enabled: nil))
    XCTAssertEqual(session.identity(connection: 3).label, "Research")
    XCTAssertEqual(session.identity(connection: 3).color, placeholderIdentity(connection: 3).color)
    session.apply(.configure(label: nil, color: RGB(hex: "#2f6feb"), enabled: false))
    XCTAssertEqual(session.identity(connection: 3).label, "Research", "a request without a label keeps it")
    XCTAssertEqual(session.identity(connection: 3).color, RGB(hex: "#2f6feb")!.color)
    XCTAssertFalse(session.enabled)
    session.apply(.configure(label: " \u{7} ", color: nil, enabled: true))
    XCTAssertEqual(session.identity(connection: 3).label, "Research", "an empty label leaves the label as it was")
    XCTAssertTrue(session.enabled)
    session.apply(.configure(label: String(repeating: "x", count: 40), color: nil, enabled: nil))
    XCTAssertEqual(session.identity(connection: 3).label.count, 24, "the pill's cut")
  }
}

final class CursorRequestTests: XCTestCase {
  private let app = "/System/Applications/TextEdit.app#600"

  private func hub(_ renderer: Recorder) -> CursorHub {
    var e = CursorEnvironment()
    e.now = { 100 }
    e.main = { $0() }
    e.screens = { CursorScreens(primaryHeight: 900, all: [CursorScreen(frame: CGRect(x: 0, y: 0, width: 1440, height: 900),
                                                                        visibleFrame: CGRect(x: 0, y: 0, width: 1440, height: 870))]) }
    e.windowList = { [ListedWindow(number: 20, owner: 600, layer: 0, bounds: CGRect(x: 100, y: 100, width: 1200, height: 700))] }
    e.frontmostPid = { 500 }
    return CursorHub(environment: e, renderer: renderer)
  }

  private func engine(_ hub: CursorHub, cursorEnabled: Bool = true) -> Engine {
    Engine(paths: ServerPaths(socket: "/tmp/x.sock", directory: "/tmp", lock: "/tmp/x.lock", usage: "/tmp/cua-engine-test-usage.json"),
           cursor: hub, cursorEnabled: cursorEnabled)
  }

  private func send(_ engine: Engine, _ params: [String: Any], on connection: ConnectionState) -> Result<Any, EngineError> {
    engine.handle(Request(id: 1, method: "cursor", params: params), on: connection, receivedAt: unixMilliseconds()).result
  }

  private func answer(_ result: Result<Any, EngineError>) throws -> [String: Any] {
    try XCTUnwrap(try result.get() as? [String: Any])
  }

  private func click(_ hub: CursorHub, connection: Int) {
    hub.begin(connection: connection, app: app, keyboardOnly: false)
    hub.act(connection: connection, app: app, window: 20, .click(CGPoint(x: 400, y: 300)))
    hub.end(connection: connection)
    hub.drain()
  }

  func testTheSessionsLabelAndColourAreTheCursorsAndTheAnswerIsOn() throws {
    let renderer = Recorder(), hub = hub(renderer), engine = engine(hub), connection = ConnectionState(id: 4, fd: -1)
    let out = try answer(send(engine, ["label": "linux171", "color": "#8250df", "enabled": true], on: connection))
    XCTAssertEqual(out["cursor"] as? String, "on")
    XCTAssertTrue(out["reason"] is NSNull)
    click(hub, connection: 4)
    let identity = try XCTUnwrap(renderer.last?.identity)
    XCTAssertEqual(identity.label, "linux171")
    XCTAssertEqual(identity.color, RGB(hex: "#8250df")!.color)
  }

  func testTheSessionsOffSwitchShowsNoCursorAndSaysSo() throws {
    let renderer = Recorder(), hub = hub(renderer), engine = engine(hub), connection = ConnectionState(id: 4, fd: -1)
    click(hub, connection: 4)
    XCTAssertEqual(renderer.last?.shown, true)
    let out = try answer(send(engine, ["enabled": false], on: connection))
    XCTAssertEqual(out["cursor"] as? String, "off")
    XCTAssertEqual(out["reason"] as? String, "session")
    hub.drain()
    XCTAssertEqual(renderer.last?.phase, .hidden, "a shown cursor goes")
    click(hub, connection: 4)
    XCTAssertEqual(renderer.last?.phase, .hidden, "and no action brings it back")
    let other = ConnectionState(id: 5, fd: -1)
    XCTAssertEqual(try answer(send(engine, [:], on: other))["cursor"] as? String, "on", "another session's cursor is its own")
  }

  func testHideFadesTheCursorAtOnceAndKeepsItOn() throws {
    let renderer = Recorder(), hub = hub(renderer), engine = engine(hub), connection = ConnectionState(id: 4, fd: -1)
    click(hub, connection: 4)
    let out = try answer(send(engine, ["hide": true], on: connection))
    XCTAssertEqual(out["cursor"] as? String, "on")
    hub.drain()
    XCTAssertEqual(hub.phase(connection: 4), .fading)
  }

  func testTheDevicesSwitchWinsOverTheSession() throws {
    let renderer = Recorder(), hub = hub(renderer), engine = engine(hub, cursorEnabled: false), connection = ConnectionState(id: 4, fd: -1)
    let out = try answer(send(engine, ["label": "Research", "enabled": true], on: connection))
    XCTAssertEqual(out["cursor"] as? String, "off")
    XCTAssertEqual(out["reason"] as? String, "engine.json")
    let status = try answer(engine.handle(Request(id: 2, method: "status", params: [:]), on: connection, receivedAt: 0).result)
    XCTAssertEqual(status["cursor"] as? String, "off")
    let on = try answer(self.engine(hub).handle(Request(id: 3, method: "status", params: [:]), on: connection, receivedAt: 0).result)
    XCTAssertEqual(on["cursor"] as? String, "on")
  }

  func testAMalformedRequestIsRefusedAndChangesNothing() throws {
    let renderer = Recorder(), hub = hub(renderer), engine = engine(hub), connection = ConnectionState(id: 4, fd: -1)
    guard case .failure(let error) = send(engine, ["label": "Research", "color": "blue"], on: connection) else { return XCTFail("accepted") }
    XCTAssertEqual(error.code, RPCCode.invalidParams.rawValue)
    XCTAssertNil(connection.cursor.label)
  }
}
