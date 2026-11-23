import AppKit
import CoreGraphics
import Foundation
import XCTest
@testable import Engine

// #538 (ruling 1173): the key-focus-only state, S. The target holds window-server key focus while another app is
// frontmost, so route 3's activation exits early (the app believes it has focus) and no activation stands. A shared-mode
// pointer is refused there, with nothing posted, by a front read immediately before its events (`FakeActivation.deliver`):
// #282's path then answers by the pointer's element route where it has one, else with the refusal's sentence, and the
// meta records `keyFocusOnly` with the readings. No app frontmost, or the target frontmost, posts as before; dedicated mode,
// the paste route and every delivery with an activation standing are unchanged. Everything runs over the recorded guard seam.

final class KeyFocusOnlyTests: XCTestCase {
  private let target: pid_t = 990_001, user: pid_t = 990_002
  private let window = CGRect(x: 80, y: 60, width: 610, height: 860)
  private let point = CGPoint(x: 300, y: 400)
  private let activations = HeldActivations()
  private let app = "TextEdit"

  private func connection(_ desktop: DesktopMode = .shared, id: Int = 1) -> ConnectionState {
    let connection = ConnectionState(id: id, fd: -1)
    connection.desktop = desktop
    return connection
  }

  private func meta(_ connection: ConnectionState) -> InputMeta {
    InputMeta(ExecutionContext(connection: connection, receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
  }

  /// S: the person's app frontmost, the target holding key focus; the target's window ordered above the person's at the
  /// action's own mouse down (of any button), as an ordering click would.
  private func keyFocusOnly() -> GuardSeam {
    let seam = GuardSeam(frontmost: user)
    seam.keyFocus = target
    seam.targetAbove = false
    seam.mouseDownTypes = [.leftMouseDown, .rightMouseDown, .otherMouseDown]
    seam.onMouseDown = { seam.targetAbove = true }
    return seam
  }

  /// Electron's activation: an inert activation point inside the frame (what it would click, were it to run).
  private func activation(_ seam: GuardSeam) -> FakeActivation {
    seam.activationPoint = CGPoint(x: 300, y: 70)
    return FakeActivation(pid: target, window: AXUIElementCreateApplication(target), windowFrame: window, windowID: 41, system: seam.system)
  }

  private func pointer(_ view: PointerView = .acceptsFirstMouse, noun: String = "click",
                       elementRoute: ((inout InputMeta) throws -> Void)? = nil) -> PointerTarget {
    PointerTarget(view: view, app: app, noun: noun, elementRoute: elementRoute)
  }

  private func click(_ seam: GuardSeam, button: MouseButton = .left, count: Int = 1, pointer: PointerTarget,
                     beforePosting: () throws -> Void = {}, announce: () -> Void = {}, meta: inout InputMeta) throws {
    try deliverClick(ClickTarget(point: point, windowFrame: window, windowID: 41, pid: target), route: .activation, button: button, count: count,
                     activation: activation(seam), activations: activations, pointer: pointer, targetActive: { false },
                     beforePosting: beforePosting, announce: announce, post: seam.system.post, meta: &meta)
  }

  private func drag(_ seam: GuardSeam, pointer: PointerTarget, announce: () -> Void = {}, meta: inout InputMeta) throws {
    let start = ClickTarget(point: point, windowFrame: window, windowID: 41, pid: target)
    try deliverPointer(to: target, route: .activation, activation: activation(seam), activations: activations, postsLeftMouseDown: true,
                       pointer: pointer, announce: announce, post: seam.system.post, meta: &meta) {
      dragEvents(from: start.point, to: CGPoint(x: 400, y: 500), window: start, flags: [])
    }
  }

  private func refusal(_ noun: String, app: String? = nil, keyFocus: Bool = true) -> String {
    let app = app ?? self.app
    return "Another app is in front of \(app)\(keyFocus ? " while \(app) holds keyboard focus" : ""), so nothing was sent: a \(noun) sent now could bring \(app)'s window over the person's. Act on \(app) through its elements' own actions (performSecondaryAction, setValue) or keys (typeText, pressKey), or ask the person to bring \(app) to the front."
  }

  private func record(keyFocus: pid_t?) -> NSDictionary {
    ["reason": "keyFocusOnly", "frontmostPid": Int(user), "keyFocusPid": keyFocus.map { Int($0) } ?? NSNull(),
     "keyFocusIsTarget": keyFocus == target] as NSDictionary
  }

  /// Nothing of the action went out, nothing was held, and the lease was given back.
  private func assertNothingPosted(_ seam: GuardSeam, _ meta: InputMeta, _ name: String, file: StaticString = #filePath, line: UInt = #line) {
    XCTAssertEqual(seam.posts.count, 0, "nothing posted: \(name)", file: file, line: line)
    XCTAssertEqual(seam.holds, 0, "no screen-update hold: \(name)", file: file, line: line)
    XCTAssertEqual(seam.targetAbove, false, "no raise: \(name)", file: file, line: line)
    XCTAssertNil(meta.startedAt, "no action interval: \(name)", file: file, line: line)
    XCTAssertNil(meta.delivery, name, file: file, line: line)
    XCTAssertEqual(activations.holders(target), 0, "the lease given back: \(name)", file: file, line: line)
  }

  // MARK: S: a shared pointer is refused with nothing posted

  /// A left click (an element's strict-descendant hit, a coordinate click: both reach `deliverClick`), a double click, a
  /// right click (an element's; a coordinate one is refused earlier, #463) and a drag, into a view with no element route:
  /// refused with the sentence, nothing posted, `keyFocusOnly` with the readings in the meta, the route kept.
  func testAPointerIntoAnAppHoldingKeyFocusBehindAnotherIsRefusedWithNothingPosted() throws {
    var announced = 0
    let told = { announced += 1 }
    let scenes: [(String, String, (GuardSeam, inout InputMeta) throws -> Void)] = [
      ("a click", "click", { seam, meta in try self.click(seam, pointer: self.pointer(), announce: told, meta: &meta) }),
      ("a double click", "click", { seam, meta in try self.click(seam, count: 2, pointer: self.pointer(), announce: told, meta: &meta) }),
      ("a right click", "click", { seam, meta in try self.click(seam, button: .right, pointer: self.pointer(), announce: told, meta: &meta) }),
      ("a drag", "drag", { seam, meta in try self.drag(seam, pointer: self.pointer(noun: "drag"), announce: told, meta: &meta) }),
      ("a click into a web area with no element route", "click", { seam, meta in
        try self.click(seam, pointer: self.pointer(.webArea), announce: told, meta: &meta)
      }),
    ]
    for (name, noun, scene) in scenes {
      let seam = keyFocusOnly()
      var pointerMeta = meta(connection())
      announced = 0
      defer { XCTAssertEqual(announced, 0, "a refused pointer moves no cursor: \(name)") }
      XCTAssertThrowsError(try scene(seam, &pointerMeta), name) {
        let error = $0 as? EngineError
        XCTAssertEqual(error?.errorName, "backgroundClickRefused", name)
        XCTAssertEqual(error?.message, refusal(noun), name)
      }
      assertNothingPosted(seam, pointerMeta, name)
      XCTAssertEqual(pointerMeta.inputRoute, .activation, "the refusal names its route: \(name)")
      XCTAssertNil(pointerMeta.activationClickKind, "no activation ran: \(name)")
      XCTAssertEqual(pointerMeta.wire["pointerRefusal"] as? NSDictionary, record(keyFocus: target), name)
    }
  }

  /// A web area's click whose hit has an element route (#282's) takes it instead: the route runs with nothing posted on
  /// the pointer's path and no lease held, and the meta records why.
  func testAWebAreaClickInSTakesItsElementRoute() throws {
    let seam = keyFocusOnly()
    var pointerMeta = meta(connection())
    var pressed = 0, announced = 0
    try click(seam, pointer: pointer(.webArea) { meta in
      pressed += 1
      XCTAssertEqual(self.activations.holders(self.target), 0, "the never-activated lease is given back before the route")
      try deliverAction("AXPress", route: .action, perform: { _ in .success }, meta: &meta)
    }, announce: { announced += 1 }, meta: &pointerMeta)
    XCTAssertEqual(pressed, 1)
    XCTAssertEqual(announced, 0, "the refused pointer is never announced; the element route announces its own")
    XCTAssertEqual(seam.posts.count, 0, "cua posts nothing on the pointer's path")
    XCTAssertEqual(seam.holds, 0)
    XCTAssertEqual(pointerMeta.inputRoute, .action, "route 1")
    XCTAssertNil(pointerMeta.delivery)
    XCTAssertEqual(pointerMeta.wire["pointerRefusal"] as? NSDictionary, record(keyFocus: target))
  }

  /// The front changes after the activation's decision and before the events (the target frontmost at `activate`, so
  /// no activation runs; the person's app in front by the events): refused at the read just before them. The sentence
  /// describes the front read then, naming key focus only while the target holds it, and never asks for a retry (ruling
  /// 1174: a retry joining a never-activated hold would meet the same refusal).
  /// `deliver` makes no Accessibility lookup on this path (the person's window is never read), so its front read is the
  /// last step before the events.
  func testTheFrontChangingBeforeTheEventsIsRefusedWithNothingPosted() throws {
    for keyFocus in [target, user] {
      let seam = GuardSeam(frontmost: target)
      seam.targetAbove = false
      seam.onMouseDown = { seam.targetAbove = true }
      var pointerMeta = meta(connection())
      XCTAssertThrowsError(try click(seam, pointer: pointer(), beforePosting: {
        seam.frontmost = self.user
        seam.keyFocus = keyFocus
      }, meta: &pointerMeta)) {
        XCTAssertEqual(($0 as? EngineError)?.errorName, "backgroundClickRefused")
        XCTAssertEqual(($0 as? EngineError)?.message, refusal("click", keyFocus: keyFocus == target), "never 'try again'")
      }
      assertNothingPosted(seam, pointerMeta, "key focus \(keyFocus)")
      XCTAssertEqual(seam.userWindowReads, 0, "no lookup between the read and the events")
      XCTAssertEqual(pointerMeta.wire["pointerRefusal"] as? NSDictionary, record(keyFocus: keyFocus))
    }
  }

  /// A pointer joining a standing entry whose activation never ran (a focus hold taken in S, on this connection or
  /// another): refused the same way while S lasts, the hold's share kept, nothing posted by either.
  func testAPointerJoiningANeverActivatedHoldIsRefused() throws {
    for other in [false, true] {
      let seam = keyFocusOnly()
      let holder = connection(id: other ? 2 : 1)
      var holdMeta = meta(holder)
      try holdFocus(app: "textedit", pid: target, connection: holder, activations: activations, activation: { self.activation(seam) },
                    beforeActivating: {}, meta: &holdMeta)
      XCTAssertEqual(activations.activation(of: target)?.activated, false, "the hold's activation exited early")
      var pointerMeta = meta(connection())
      XCTAssertThrowsError(try click(seam, pointer: pointer(), meta: &pointerMeta)) {
        XCTAssertEqual(($0 as? EngineError)?.message, refusal("click"), "other connection \(other)")
      }
      XCTAssertEqual(pointerMeta.activationJoin, .shared)
      XCTAssertEqual(seam.posts.count, 0, "other connection \(other)")
      XCTAssertEqual(seam.holds, 0)
      XCTAssertEqual(activations.holders(target), 1, "the hold's share kept")
      XCTAssertEqual(pointerMeta.wire["pointerRefusal"] as? NSDictionary, record(keyFocus: target))
      holder.endFocusHold()
      XCTAssertEqual(seam.posts.count, 0, "no subtype 2 for an activation that never ran")
      XCTAssertEqual(activations.holders(target), 0)
    }
  }

  /// Ruling 1174, P1: the registry shares entries by serving process alone, so a pointer bound to app B can join a
  /// never-activated entry made for app A on the same serving process. The front is judged against the pointer's own
  /// bound app: A frontmost is another app in front of B (refused, nothing posted); B frontmost is B's own front (posted
  /// alone, as on main).
  func testACrossAppJoinerIsJudgedAgainstItsOwnBoundApp() throws {
    let helper: pid_t = 990_005, appA: pid_t = 990_011, appB: pid_t = 990_012
    for front in [appA, appB] {
      let seam = GuardSeam(frontmost: front)
      seam.keyFocus = helper
      seam.targetAbove = false
      seam.onMouseDown = { seam.targetAbove = true }
      func made(_ bound: pid_t) -> FakeActivation {
        FakeActivation(pid: helper, appPid: bound, window: AXUIElementCreateApplication(helper), windowFrame: window, windowID: 41, system: seam.system)
      }
      let holder = connection(id: 2)
      var holdMeta = meta(holder)
      try holdFocus(app: "a", pid: helper, connection: holder, activations: activations, activation: { made(appA) },
                    beforeActivating: {}, meta: &holdMeta)
      XCTAssertEqual(activations.activation(of: helper)?.activated, false, "A's hold exited early")
      var pointerMeta = meta(connection())
      let attempt = {
        try deliverClick(ClickTarget(point: self.point, windowFrame: self.window, windowID: 41, pid: helper), route: .activation, button: .left,
                         count: 1, activation: made(appB), activations: self.activations, pointer: self.pointer(), targetActive: { false },
                         post: seam.system.post, meta: &pointerMeta)
      }
      if front == appA {
        XCTAssertThrowsError(try attempt(), "A in front of B") {
          XCTAssertEqual(($0 as? EngineError)?.errorName, "backgroundClickRefused")
        }
        XCTAssertEqual(seam.posts.count, 0, "nothing posted into B behind A")
        XCTAssertEqual(pointerMeta.wire["pointerRefusal"] as? NSDictionary,
                       ["reason": "keyFocusOnly", "frontmostPid": Int(appA), "keyFocusPid": Int(helper), "keyFocusIsTarget": true] as NSDictionary)
      } else {
        try attempt()
        XCTAssertEqual(seam.posts.map(\.kind), [.mouse(.leftMouseDown), .mouse(.leftMouseUp)], "B frontmost: posted alone")
        XCTAssertNil(pointerMeta.wire["pointerRefusal"])
      }
      XCTAssertEqual(seam.holds, 0)
      holder.endFocusHold()
      XCTAssertEqual(activations.holders(helper), 0)
    }
  }

  /// Ruling 1174, P2: a pointer joining a still-held never-activated entry once key focus has left the target is refused
  /// with the current front described and the ways that work, never "try again", which would only meet the hold again.
  func testAJoinerAfterKeyFocusLeftIsToldWhatWorksNotToRetry() throws {
    let seam = keyFocusOnly()
    let holder = connection(id: 2)
    var holdMeta = meta(holder)
    try holdFocus(app: "textedit", pid: target, connection: holder, activations: activations, activation: { self.activation(seam) },
                  beforeActivating: {}, meta: &holdMeta)
    seam.keyFocus = user
    for attempt in 1...2 {
      var pointerMeta = meta(connection())
      XCTAssertThrowsError(try click(seam, pointer: pointer(), meta: &pointerMeta)) {
        let message = ($0 as? EngineError)?.message ?? ""
        XCTAssertEqual(message, refusal("click", keyFocus: false), "attempt \(attempt)")
        XCTAssertFalse(message.contains("try again"))
      }
      XCTAssertEqual(pointerMeta.wire["pointerRefusal"] as? NSDictionary, record(keyFocus: user))
    }
    XCTAssertEqual(seam.posts.count, 0)
    holder.endFocusHold()
  }

  /// Ruling 1174, P3: a right or middle click (an element's, or a coordinate middle click) takes the pointer target its
  /// callers build for every button (`PointerTarget.acceptingFirstMouse(in:)`), so its refusal names the bound app,
  /// never "the app".
  func testANonLeftPointersRefusalNamesTheApp() throws {
    let notes = ResolvedApp(appPath: "/System/Applications/Notes.app", bundleIdentifier: "com.apple.Notes", displayName: "Notes", running: nil)
    for button in [MouseButton.right, .middle] {
      let seam = keyFocusOnly()
      var pointerMeta = meta(connection())
      XCTAssertThrowsError(try click(seam, button: button, pointer: .acceptingFirstMouse(in: notes), meta: &pointerMeta), "\(button)") {
        XCTAssertEqual(($0 as? EngineError)?.message, refusal("click", app: "Notes"), "\(button)")
      }
      XCTAssertEqual(seam.posts.count, 0)
    }
  }

  // MARK: Where main's path stands

  /// No app frontmost (the target holding key focus): the events posted alone, as on main, with no hold or record.
  func testNoAppFrontmostPostsAlone() throws {
    let seam = keyFocusOnly()
    seam.frontmost = nil
    var pointerMeta = meta(connection())
    try click(seam, pointer: pointer(), meta: &pointerMeta)
    XCTAssertEqual(seam.posts.map(\.kind), [.mouse(.leftMouseDown), .mouse(.leftMouseUp)])
    XCTAssertEqual(seam.holds, 0)
    XCTAssertNil(pointerMeta.delivery)
    XCTAssertNil(pointerMeta.wire["pointerRefusal"])
    XCTAssertNotNil(pointerMeta.startedAt)
  }

  /// The target frontmost: posted alone, as on main.
  func testTheTargetFrontmostPostsAlone() throws {
    let seam = keyFocusOnly()
    seam.frontmost = target
    var pointerMeta = meta(connection())
    try click(seam, pointer: pointer(), meta: &pointerMeta)
    XCTAssertEqual(seam.posts.map(\.kind), [.mouse(.leftMouseDown), .mouse(.leftMouseUp)])
    XCTAssertEqual(seam.holds, 0)
    XCTAssertNil(pointerMeta.delivery)
    XCTAssertNil(pointerMeta.wire["pointerRefusal"])
  }

  /// Dedicated mode in S: main's exactly, the click and the drag posted alone with no guard, no watch and no record.
  func testDedicatedModeInSIsMains() throws {
    for isDrag in [false, true] {
      let seam = keyFocusOnly()
      let dedicated = connection(.dedicated)
      var pointerMeta = meta(dedicated)
      if isDrag { try drag(seam, pointer: pointer(noun: "drag"), meta: &pointerMeta) } else { try click(seam, pointer: pointer(), meta: &pointerMeta) }
      XCTAssertEqual(seam.posts.first?.kind, .mouse(.leftMouseDown), "drag \(isDrag)")
      XCTAssertEqual(seam.posts.last?.kind, .mouse(.leftMouseUp), "drag \(isDrag)")
      XCTAssertFalse(seam.posts.contains { if case .appKit = $0.kind { return true } else { return false } }, "no activation: drag \(isDrag)")
      XCTAssertEqual(seam.holds, 0)
      XCTAssertNil(pointerMeta.delivery)
      XCTAssertNil(pointerMeta.wire["pointerRefusal"])
      XCTAssertEqual(seam.targetAbove, true, "nothing put back, as on main")
      XCTAssertFalse(dedicated.afterAction.watching)
    }
  }

  /// The paste route's first event (a ⌘V or a Return, `pointer` false), in S, with the paste's own never-run activation
  /// or another's: posted alone, as on main, whatever the connection's mode (the paste route has none). type_text's
  /// paste route goes the same way.
  func testAPasteInSIsPostedAsOnMain() throws {
    for joined in [false, true] {
      let seam = keyFocusOnly()
      let standing = activation(seam)
      try standing.activate()
      XCTAssertFalse(standing.activated)
      var posted = 0
      let outcome = try standing.deliver(window: 41, watches: connection().afterAction, repairWindow: RepairWindow(),
                                         ranBy: joined ? nil : standing) { posted += 1 }
      XCTAssertEqual(posted, 1, "joined \(joined)")
      XCTAssertNil(outcome, "no guard, as on main: joined \(joined)")
      XCTAssertEqual(seam.holds, 0)
    }
  }

  /// With an activation standing (the ordinary background click and drag), the guarded delivery is main's: the same
  /// events, one hold, the same guard record and the watch after it, also when the target takes key focus once the
  /// activation ran. M5's background cells run here.
  func testAGuardedClickAndDragWithAnActivationStandingAreMains() throws {
    for (isDrag, keyFocusAfter) in [(false, false), (false, true), (true, false), (true, true)] {
      let name = "drag \(isDrag), key focus after \(keyFocusAfter)"
      let seam = GuardSeam(frontmost: user)
      seam.targetAbove = false
      seam.onMouseDown = {
        guard seam.clock > 0 else { return }  // the activation point's click goes at clock 0
        seam.targetAbove = true
      }
      seam.onHold = { if keyFocusAfter { seam.keyFocus = self.target } }
      let shared = connection()
      var pointerMeta = meta(shared)
      if isDrag { try drag(seam, pointer: pointer(noun: "drag"), meta: &pointerMeta) } else { try click(seam, pointer: pointer(), meta: &pointerMeta) }
      let action: [GuardPost.Kind] = isDrag
        ? seam.posts.dropFirst(3).dropLast().map(\.kind)
        : [.mouse(.leftMouseDown), .mouse(.leftMouseUp)]
      XCTAssertEqual(seam.posts.map(\.kind), [.appKit(1), .mouse(.leftMouseDown), .mouse(.leftMouseUp)] + action + [.appKit(2)], name)
      XCTAssertEqual(action.first, .mouse(.leftMouseDown), name)
      XCTAssertEqual(seam.holds, 1, name)
      XCTAssertEqual(seam.releases, 1, name)
      XCTAssertEqual(seam.raises, 1, name)
      XCTAssertEqual(seam.targetAbove, false, "put back: \(name)")
      let delivery = try XCTUnwrap(pointerMeta.delivery, name)
      XCTAssertEqual(delivery.restores, 1, name)
      XCTAssertFalse(delivery.raiseLeft, name)
      XCTAssertFalse(delivery.capped, name)
      XCTAssertEqual(delivery.guardMs, activationPointGuardMinimumMs, "#321's least wait after an activation point's click: \(name)")
      XCTAssertEqual(pointerMeta.activationClickKind, .activationPoint, name)
      XCTAssertNil(pointerMeta.wire["pointerRefusal"], name)
      XCTAssertTrue(shared.afterAction.watching, "the watch runs on: \(name)")
      shared.afterAction.cancel()
    }
  }
}
