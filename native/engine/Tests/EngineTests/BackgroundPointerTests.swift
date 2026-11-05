import AppKit
import CoreGraphics
import Foundation
import XCTest
@testable import Engine

// #282 (Routes.swift, "A background pointer into a view that refuses first mouse"): a route-3 left pointer whose own
// mouse down meets an activation that clicked no activation point (Chrome's lies outside its frame) is taken by AppKit as
// the window's activating click, and a Chromium web area, which refuses first mouse, never sees it. By the connection's
// device mode: shared refuses it (or carries a plain click by the hit's own action) with nothing posted; dedicated posts
// the inert click first, so the down meets a key window, and puts nothing back; everywhere a down that consumed the arm
// into a view not known to accept first mouse answers clickUnconfirmed. Everything runs over the recorded guard seam.

final class BackgroundPointerTests: XCTestCase {
  private let target: pid_t = 990_001, user: pid_t = 990_002
  private let window = CGRect(x: 80, y: 60, width: 610, height: 860)
  private let outside = CGPoint(x: -1, y: 1441)
  private let point = CGPoint(x: 300, y: 400)
  private let activations = HeldActivations()

  private func connection(_ desktop: DesktopMode = .shared, id: Int = 1) -> ConnectionState {
    let connection = ConnectionState(id: id, fd: -1)
    connection.desktop = desktop
    return connection
  }

  private func meta(_ connection: ConnectionState) -> InputMeta {
    InputMeta(ExecutionContext(connection: connection, receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
  }

  /// Chrome's activation: its AXActivationPoint outside the frame, so it clicks no activation point.
  private func chrome(_ seam: GuardSeam) -> FakeActivation {
    seam.activationPoint = outside
    return FakeActivation(pid: target, window: AXUIElementCreateApplication(target), windowFrame: window, windowID: 41, system: seam.system)
  }

  /// Electron's: an inert activation point inside the frame, clicked right after subtype 1.
  private func electron(_ seam: GuardSeam) -> FakeActivation {
    seam.activationPoint = CGPoint(x: 300, y: 70)
    return FakeActivation(pid: target, window: AXUIElementCreateApplication(target), windowFrame: window, windowID: 41, system: seam.system)
  }

  private func webArea(_ elementRoute: ((inout InputMeta) throws -> Void)? = nil, noun: String = "click") -> PointerTarget {
    PointerTarget(view: .webArea, app: "Google Chrome for Testing", noun: noun, elementRoute: elementRoute)
  }

  private func click(_ seam: GuardSeam, activation: FakeActivation, pointer: PointerTarget, count: Int = 1, meta: inout InputMeta) throws {
    try deliverClick(ClickTarget(point: point, windowFrame: window, windowID: 41, pid: target), route: .activation, button: .left, count: count,
                     activation: activation, activations: activations, pointer: pointer, targetActive: { false }, post: seam.system.post, meta: &meta)
  }

  private func drag(_ seam: GuardSeam, activation: FakeActivation, pointer: PointerTarget, meta: inout InputMeta) throws {
    let start = ClickTarget(point: point, windowFrame: window, windowID: 41, pid: target)
    try deliverPointer(to: target, route: .activation, activation: activation, activations: activations, postsLeftMouseDown: true,
                       pointer: pointer, post: seam.system.post, meta: &meta) {
      dragEvents(from: start.point, to: CGPoint(x: 400, y: 500), window: start, flags: [])
    }
  }

  private func holdChrome(_ connection: ConnectionState, _ seam: GuardSeam) throws {
    var keys = meta(connection)
    try holdFocus(app: "chrome", pid: target, connection: connection, activations: activations, activation: { self.chrome(seam) },
                  beforeActivating: {}, meta: &keys)
  }

  private let inertClick: [GuardPost.Kind] = [.appKit(1), .mouse(.leftMouseDown), .mouse(.leftMouseUp)]

  // MARK: Shared mode: a Chromium web area's pointer is never posted

  /// A plain left click, a double click and a drag into a background Chrome page: refused with the sentence, nothing
  /// posted (no subtype 1, no inert click, no screen-update hold), nothing left held. The refusal carries the route.
  func testSharedModeRefusesAClickADoubleClickAndADragIntoAWebAreaWithNothingPosted() throws {
    for (name, count) in [("a click", 1), ("a double click", 2), ("a drag", 0)] {
      let seam = GuardSeam(frontmost: user)
      var clickMeta = meta(connection())
      let attempt = {
        if count == 0 { try self.drag(seam, activation: self.chrome(seam), pointer: self.webArea(noun: "drag"), meta: &clickMeta) }
        else { try self.click(seam, activation: self.chrome(seam), pointer: self.webArea(), count: count, meta: &clickMeta) }
      }
      XCTAssertThrowsError(try attempt(), name) {
        let error = $0 as? EngineError
        XCTAssertEqual(error?.errorName, "backgroundClickRefused", name)
        XCTAssertEqual(error?.message, "Google Chrome for Testing's web page does not accept a background click; bring Google Chrome for Testing forward or use a dedicated desktop")
      }
      XCTAssertEqual(seam.posts.count, 0, "nothing posted: \(name)")
      XCTAssertEqual(seam.holds, 0, "no screen-update hold: \(name)")
      XCTAssertEqual(activations.holders(target), 0, name)
      XCTAssertNil(clickMeta.startedAt, name)
      XCTAssertEqual(clickMeta.inputRoute, .activation, name)
      XCTAssertNil(clickMeta.activationClickKind, "no activation ran: \(name)")
    }
  }

  /// A plain click whose hit has an element route goes by it instead: the route's closure runs, cua posts nothing on the
  /// pointer's path, and the meta is the element route's (Chrome may synthesize events of its own for the action).
  func testSharedModeCarriesAPlainClickIntoAWebAreaByTheHitsActionPostingNothingItself() throws {
    let seam = GuardSeam(frontmost: user)
    var clickMeta = meta(connection())
    var pressed = 0
    try click(seam, activation: chrome(seam), pointer: webArea { meta in
      pressed += 1
      try deliverAction("AXPress", route: .action, perform: { _ in .success }, meta: &meta)
    }, meta: &clickMeta)
    XCTAssertEqual(pressed, 1)
    XCTAssertEqual(seam.posts.count, 0, "cua posts nothing: no event, no activation from the pointer's path")
    XCTAssertEqual(clickMeta.inputRoute, .action, "route 1")
    XCTAssertNotNil(clickMeta.startedAt, "the action is the request's input")
    XCTAssertEqual(activations.holders(target), 0)
  }

  /// focusField's fallback inside set_value's held activation: the hold's inert click spent the arm, so the fallback's
  /// down would meet a key window (an ordering click) or, re-armed, the new arm. Refused before anything: the hold's
  /// activation is neither withdrawn nor re-run, and its share kept. Another connection's hold likewise.
  func testSharedModeRefusesAWebAreaPointerJoiningAHoldThatClickedNoActivationPoint() throws {
    for other in [false, true] {
      let seam = GuardSeam(frontmost: user)
      let holder = connection(id: other ? 2 : 1)
      try holdChrome(holder, seam)
      XCTAssertEqual(seam.posts.map(\.kind), inertClick)
      var clickMeta = meta(connection())
      XCTAssertThrowsError(try click(seam, activation: chrome(seam), pointer: webArea(), meta: &clickMeta)) {
        XCTAssertEqual(($0 as? EngineError)?.errorName, "backgroundClickRefused")
      }
      XCTAssertEqual(seam.posts.map(\.kind), inertClick, "no subtype 2, no second activation, no click: other connection \(other)")
      XCTAssertEqual(activations.holders(target), 1, "the hold's share kept")
      XCTAssertNotNil(clickMeta.activationJoin)
      holder.endFocusHold()
      XCTAssertEqual(seam.posts.map(\.kind), inertClick + [.appKit(2)])
    }
  }

  /// Where the activation clicked its point (Electron's, inside the frame), a web area's click is today's: the down meets a
  /// window the activation point's click made key, delivered with the guard repairing any raise.
  func testAWebAreaClickAfterAnActivationPointClickIsPosted() throws {
    let seam = GuardSeam(frontmost: user)
    var clickMeta = meta(connection())
    try click(seam, activation: electron(seam), pointer: webArea(), meta: &clickMeta)
    XCTAssertEqual(seam.posts.map(\.kind), inertClick + [.mouse(.leftMouseDown), .mouse(.leftMouseUp), .appKit(2)])
    XCTAssertEqual(clickMeta.activationClickKind, .activationPoint)
    XCTAssertNotNil(clickMeta.delivery)
  }

  // MARK: Dedicated mode: the down meets a key window, and nothing is put back

  /// The inert click goes right after subtype 1 for a left click and a drag too, before the action's own down, and the
  /// action's events go out with no delivery guard: a raise at the click stays, no restore, no after-action watch.
  func testDedicatedModePostsTheInertClickBeforeThePointersDownAndPutsNothingBack() throws {
    for isDrag in [false, true] {
      let seam = GuardSeam(frontmost: user)
      seam.targetAbove = false
      seam.onMouseDown = { if seam.posts.count > 3 { seam.targetAbove = true } }  // the action's own down raises the window
      let dedicated = connection(.dedicated)
      var clickMeta = meta(dedicated)
      if isDrag { try drag(seam, activation: chrome(seam), pointer: webArea(noun: "drag"), meta: &clickMeta) }
      else { try click(seam, activation: chrome(seam), pointer: webArea(), meta: &clickMeta) }
      let downs = seam.posts.filter { $0.kind == .mouse(.leftMouseDown) }.map(\.location)
      XCTAssertEqual(downs, [outside, point], "the inert click, then the action's own down: drag \(isDrag)")
      XCTAssertEqual(Array(seam.posts.map(\.kind).prefix(3)), inertClick)
      XCTAssertEqual(seam.posts.map(\.kind).last, .appKit(2))
      XCTAssertEqual(clickMeta.activationClickKind, .inertOutside(.activationPoint, .early))
      XCTAssertNil(clickMeta.delivery, "no delivery guard")
      XCTAssertEqual(seam.raises, 0, "the person's window order is not put back")
      XCTAssertEqual(seam.reactivated, [])
      XCTAssertEqual(seam.targetAbove, true, "the window came forward and stays so")
      XCTAssertFalse(dedicated.afterAction.watching, "no after-action watch")
      XCTAssertEqual(seam.holds, seam.releases, "the activation's own hold released by its guard")
    }
  }

  /// Dedicated mode never re-arms a spent hold: the click shares it and its down meets the key window the hold's inert
  /// click made, with no subtype 2/1 pair.
  func testDedicatedModeNeverReArms() throws {
    let seam = GuardSeam(frontmost: user)
    let dedicated = connection(.dedicated)
    try holdChrome(dedicated, seam)
    var clickMeta = meta(dedicated)
    try click(seam, activation: chrome(seam), pointer: .acceptingFirstMouse, meta: &clickMeta)
    XCTAssertEqual(seam.posts.map(\.kind), inertClick + [.mouse(.leftMouseDown), .mouse(.leftMouseUp)])
    XCTAssertEqual(clickMeta.activationJoin, .shared)
    dedicated.endFocusHold()
  }

  // MARK: Everywhere: a consuming down into a view not known to accept first mouse is unconfirmed

  /// A left click and a drag into an app with no known rule, whose activation clicked no activation point: the events go
  /// out, their own down consuming the arm, and the action answers clickUnconfirmed with its meta, never success.
  func testAConsumingDownIntoAViewNotKnownToAcceptFirstMouseAnswersClickUnconfirmed() throws {
    for isDrag in [false, true] {
      let seam = GuardSeam(frontmost: user)
      var clickMeta = meta(connection())
      let unknown = PointerTarget(view: .unknown, app: "Example", noun: isDrag ? "drag" : "click")
      XCTAssertThrowsError(try isDrag ? drag(seam, activation: chrome(seam), pointer: unknown, meta: &clickMeta)
                                      : click(seam, activation: chrome(seam), pointer: unknown, meta: &clickMeta)) {
        let error = $0 as? EngineError
        XCTAssertEqual(error?.errorName, "clickUnconfirmed")
        XCTAssertTrue(error?.message.hasPrefix("The \(isDrag ? "drag" : "click") could not be confirmed: it was sent to Example in the background") == true,
                      error?.message ?? "")
      }
      XCTAssertEqual(seam.posts.filter { $0.kind == .mouse(.leftMouseDown) }.map(\.location), [point], "posted, no inert click before it")
      XCTAssertEqual(clickMeta.activationClickKind, .action)
      XCTAssertNotNil(clickMeta.startedAt, "the events went")
      XCTAssertNotNil(clickMeta.delivery, "the delivery guard ran as ever")
    }
  }

  /// Chromium's native views (its toolbar) are known to accept first mouse: the consuming down answers success.
  func testAConsumingDownIntoAViewKnownToAcceptFirstMouseSucceeds() throws {
    let seam = GuardSeam(frontmost: user)
    var clickMeta = meta(connection())
    try click(seam, activation: chrome(seam), pointer: PointerTarget(view: .acceptsFirstMouse, app: "Chrome"), meta: &clickMeta)
    XCTAssertEqual(clickMeta.activationClickKind, .action)
  }

  /// A dedicated click whose inert click could not be placed (no frame) still consumes the arm with its own down: it too
  /// answers clickUnconfirmed into a web area.
  func testDedicatedModeStillAnswersUnconfirmedWhereNoInertClickCouldGo() throws {
    let seam = GuardSeam(frontmost: user)
    seam.activationPoint = outside
    let unplaced = FakeActivation(pid: target, window: AXUIElementCreateApplication(target), windowFrame: nil, windowID: 41, system: seam.system)
    var clickMeta = meta(connection(.dedicated))
    XCTAssertThrowsError(try click(seam, activation: unplaced, pointer: webArea(), meta: &clickMeta)) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "clickUnconfirmed")
    }
    XCTAssertEqual(clickMeta.activationClickKind, .action)
  }

  // MARK: rearmed: only a shared-mode pointer into a view known to accept first mouse

  /// A pointer into a view not known to accept first mouse, joining its own connection's spent hold, shares it: its down
  /// meets the key window the hold's inert click made (delivered, the raise the guard's), never a new arm it may lose.
  func testAPointerIntoAnUnknownViewSharesASpentHoldRatherThanReArming() throws {
    let seam = GuardSeam(frontmost: user)
    let shared = connection()
    try holdChrome(shared, seam)
    var clickMeta = meta(shared)
    try click(seam, activation: chrome(seam), pointer: PointerTarget(view: .unknown, app: "Example"), meta: &clickMeta)
    XCTAssertEqual(seam.posts.map(\.kind), inertClick + [.mouse(.leftMouseDown), .mouse(.leftMouseUp)], "no withdrawal, no new arm")
    XCTAssertEqual(clickMeta.activationJoin, .shared)
    XCTAssertNil(clickMeta.activationClickKind, "its down consumed no arm: no clickUnconfirmed")
    shared.endFocusHold()
  }

  /// The re-arming stays for a view known to accept first mouse (Chrome's toolbar after ⌘L).
  func testAPointerIntoAViewKnownToAcceptFirstMouseStillReArms() throws {
    let seam = GuardSeam(frontmost: user)
    let shared = connection()
    try holdChrome(shared, seam)
    var clickMeta = meta(shared)
    try click(seam, activation: chrome(seam), pointer: PointerTarget(view: .acceptsFirstMouse, app: "Chrome"), meta: &clickMeta)
    XCTAssertEqual(seam.posts.map(\.kind), inertClick + [.appKit(2), .appKit(1), .mouse(.leftMouseDown), .mouse(.leftMouseUp)])
    XCTAssertEqual(clickMeta.activationJoin, .rearmed)
    shared.endFocusHold()
  }

  // MARK: The web-area test and the element route's action

  private final class Node {
    let role: String?
    let parent: Node?
    init(_ role: String?, parent: Node? = nil) { self.role = role; self.parent = parent }
  }

  func testTheWebAreaTestWalksTheHitsParentsToItsWindow() {
    let window = Node("AXWindow")
    let toolbar = Node("AXToolbar", parent: Node("AXGroup", parent: window))
    let area = Node("AXWebArea", parent: Node("AXGroup", parent: window))
    let field = Node("AXTextArea", parent: Node("AXGroup", parent: area))
    let view = { (hit: Node?, chromium: Bool, seen: Bool) in
      pointerView(chromium: chromium, webAreaSeen: seen, hit: hit, role: { $0.role }, parent: { $0.parent })
    }
    XCTAssertEqual(view(field, true, true), .webArea, "inside a web area")
    XCTAssertEqual(view(area, true, true), .webArea, "the web area itself")
    XCTAssertEqual(view(field, true, false), .webArea, "a web area is one whether or not an observation saw it")
    XCTAssertEqual(view(Node("AXButton", parent: toolbar), true, true), .acceptsFirstMouse, "Chrome's toolbar")
    XCTAssertEqual(view(Node("AXButton", parent: toolbar), true, false), .possibleWebArea, "no page tree seen yet: a page point may answer outside one")
    XCTAssertEqual(view(window, true, true), .possibleWebArea, "a coarse answer, the window itself, says nothing of the view")
    XCTAssertEqual(view(nil, true, true), .possibleWebArea, "no hit in a Chromium process")
    XCTAssertEqual(view(field, false, true), .unknown, "not a Chromium process")
    XCTAssertEqual(view(Node("AXButton", parent: Node("AXGroup", parent: Node("AXApplication"))), true, true), .acceptsFirstMouse,
                   "the walk may end at the application too")
    // The walk stops at the window: an AXWebArea above it (none in practice) is not the hit's.
    XCTAssertEqual(webAreaWalk(Node("AXButton", parent: Node("AXWindow", parent: Node("AXWebArea"))), role: { $0.role }, parent: { $0.parent }), .outside)
  }

  /// #282's review: only a walk that reached the window (or the application) with every role and parent read says the
  /// hit is outside every web area. A failed parent read, an unreadable role, or the bound running out with the web area
  /// beyond it is incomplete: in a Chromium process a possible web area, never a view known to accept first mouse.
  func testAnIncompleteWalkIsNeverKnownToAcceptFirstMouse() {
    let view = { (hit: Node) in pointerView(chromium: true, webAreaSeen: true, hit: hit, role: { $0.role }, parent: { $0.parent }) }
    // A parent that could not be read: the chain ends before any window.
    let orphan = Node("AXTextArea", parent: Node("AXGroup"))
    XCTAssertEqual(webAreaWalk(orphan, role: { $0.role }, parent: { $0.parent }), .incomplete)
    XCTAssertEqual(view(orphan), .possibleWebArea, "a failed parent read")
    // An unreadable role on the way up, with the web area above it.
    let unreadable = Node("AXTextArea", parent: Node(nil, parent: Node("AXWebArea", parent: Node("AXWindow"))))
    XCTAssertEqual(webAreaWalk(unreadable, role: { $0.role }, parent: { $0.parent }), .incomplete)
    XCTAssertEqual(view(unreadable), .possibleWebArea, "an unreadable role")
    XCTAssertEqual(view(Node(nil, parent: Node("AXWindow"))), .possibleWebArea, "the hit's own role unreadable")
    // The bound exhausted, an AXWebArea beyond it.
    var deep = Node("AXGroup", parent: Node("AXWebArea", parent: Node("AXWindow")))
    for _ in 0..<301 { deep = Node("AXGroup", parent: deep) }
    XCTAssertEqual(webAreaWalk(deep, role: { $0.role }, parent: { $0.parent }), .incomplete)
    XCTAssertEqual(view(deep), .possibleWebArea, "the bound ran out")
    // A parent loop never hangs the walk.
    final class Loop { var parent: Loop?; init() {} }
    let loop = Loop()
    loop.parent = loop
    XCTAssertEqual(webAreaWalk(loop, role: { _ in "AXGroup" }, parent: { $0.parent }), .incomplete)
  }

  /// A possible web area is a web area in shared mode: a plain click with an element route takes it, anything else is
  /// refused with nothing posted; in dedicated mode it is posted, and its consuming down answers clickUnconfirmed.
  func testAPossibleWebAreaIsRefusedOrElementRoutedInSharedModeAndUnconfirmedElsewhere() throws {
    let possible = { (route: ((inout InputMeta) throws -> Void)?) in
      PointerTarget(view: .possibleWebArea, app: "Google Chrome for Testing", elementRoute: route)
    }
    let refusedSeam = GuardSeam(frontmost: user)
    var refusedMeta = meta(connection())
    XCTAssertThrowsError(try click(refusedSeam, activation: chrome(refusedSeam), pointer: possible(nil), meta: &refusedMeta)) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "backgroundClickRefused")
    }
    XCTAssertEqual(refusedSeam.posts.count, 0)
    let routedSeam = GuardSeam(frontmost: user)
    var routedMeta = meta(connection())
    var pressed = 0
    try click(routedSeam, activation: chrome(routedSeam), pointer: possible { _ in pressed += 1 }, meta: &routedMeta)
    XCTAssertEqual(pressed, 1)
    XCTAssertEqual(routedSeam.posts.count, 0)
    // Joining a spent hold: refused too, never re-armed.
    let heldSeam = GuardSeam(frontmost: user)
    let holder = connection()
    try holdChrome(holder, heldSeam)
    var heldMeta = meta(holder)
    XCTAssertThrowsError(try click(heldSeam, activation: chrome(heldSeam), pointer: possible(nil), meta: &heldMeta))
    XCTAssertEqual(heldSeam.posts.map(\.kind), inertClick, "nothing withdrawn or re-run")
    holder.endFocusHold()
    // Dedicated mode where no inert click could be placed: posted, and unconfirmed.
    let dedicatedSeam = GuardSeam(frontmost: user)
    dedicatedSeam.activationPoint = outside
    let unplaced = FakeActivation(pid: target, window: AXUIElementCreateApplication(target), windowFrame: nil, windowID: 41, system: dedicatedSeam.system)
    var dedicatedMeta = meta(connection(.dedicated))
    XCTAssertThrowsError(try click(dedicatedSeam, activation: unplaced, pointer: possible(nil), meta: &dedicatedMeta)) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "clickUnconfirmed")
    }
  }

  /// The control a hit resolves to, or why none: the hit's role and its parents under a web area in a window, `editable`
  /// naming the nodes with an AXEditableAncestor.
  private func control(_ hit: Node, editable: Set<ObjectIdentifier> = []) -> Result<(control: Node, role: String, ancestor: Bool), WebAreaRefusal> {
    webAreaControl(hit, role: { $0.role }, parent: { $0.parent }, editable: { editable.contains(ObjectIdentifier($0)) })
  }

  private func page() -> Node { Node("AXWebArea", parent: Node("AXGroup", parent: Node("AXWindow"))) }

  /// The design session's ruling (1ea561bc fe37aee9): the element route presses only roles whose action has a known
  /// effect; an allowlisted button hit passes, as itself, with the element click's action.
  func testAnAllowlistedControlHitPassesWithTheElementClicksAction() throws {
    for role in ["AXButton", "AXCheckBox", "AXRadioButton", "AXLink", "AXPopUpButton", "AXMenuItem", "AXMenuButton", "AXDisclosureTriangle", "AXTab"] {
      let hit = Node(role, parent: page())
      let resolved = try control(hit).get()
      XCTAssertTrue(resolved.control === hit, role)
      XCTAssertEqual(resolved.role, role)
      XCTAssertFalse(resolved.ancestor, "the hit itself: \(role)")
      XCTAssertEqual(webAreaAction(role: role, actions: ["AXPress"]), "AXPress", role)
    }
    XCTAssertEqual(webAreaAction(role: "AXRadioButton", actions: ["AXPress", "AXPick"]), "AXPick")
    XCTAssertNil(webAreaAction(role: "AXButton", actions: nil), "unread actions")
    XCTAssertNil(webAreaAction(role: "AXButton", actions: ["AXShowMenu"]))
  }

  /// The hosted A/B (run 42130746324): AXPress on the page's AXTextArea answered success and did nothing. Text entry is
  /// refused as editable, any other role off the list (and the web area itself) as not allowed; so is a control in an
  /// editable region (#283's), and a hit whose ancestry cannot be read to a control.
  func testTheTextAreaAndAnEditableAncestorHitAreRefused() {
    func refusal(_ result: Result<(control: Node, role: String, ancestor: Bool), WebAreaRefusal>) -> WebAreaRefusal? {
      if case .failure(let why) = result { return why }
      return nil
    }
    for role in ["AXTextArea", "AXTextField", "AXComboBox", "AXSearchField"] {
      XCTAssertEqual(refusal(control(Node(role, parent: page()))), .editable, role)
    }
    for role in ["AXSlider", "AXList", "AXTable", "AXCell", "AXHeading"] {
      XCTAssertEqual(refusal(control(Node(role, parent: page()))), .roleNotAllowed, role)
    }
    XCTAssertEqual(refusal(control(page())), .roleNotAllowed, "the web area itself")
    XCTAssertEqual(refusal(control(Node("AXStaticText", parent: page()))), .roleNotAllowed, "plain text with no control above, up to the web area")
    let button = Node("AXButton", parent: page())
    XCTAssertEqual(refusal(control(button, editable: [ObjectIdentifier(button)])), .editable, "a button in a contenteditable region")
    XCTAssertEqual(refusal(control(Node(nil, parent: page()))), .incompleteAncestry, "an unreadable role")
    XCTAssertEqual(refusal(control(Node("AXStaticText", parent: Node("AXGroup")))), .incompleteAncestry, "a parent unread")
  }

  /// The design session's bounds for the walk (1ea561bc 7a6a3638): a label child under a button presses the button; an
  /// editable element, or another interactive role, between the hit and a control refuses.
  func testALabelChildResolvesToItsButtonAndAnythingInBetweenRefuses() throws {
    let button = Node("AXButton", parent: page())
    let label = Node("AXStaticText", parent: Node("AXGroup", parent: button))
    let resolved = try control(label).get()
    XCTAssertTrue(resolved.control === button, "the nearest allowlisted ancestor")
    XCTAssertEqual(resolved.role, "AXButton")
    XCTAssertTrue(resolved.ancestor)
    XCTAssertTrue(try control(Node("AXImage", parent: button)).get().control === button, "an icon child")
    let checkbox = Node("AXCheckBox", parent: Node("AXButton", parent: page()))
    XCTAssertTrue(try control(Node("AXStaticText", parent: checkbox)).get().control === checkbox, "the nearest control, not one above it")
    let field = Node("AXTextField", parent: Node("AXButton", parent: page()))
    guard case .failure(.editable) = control(Node("AXStaticText", parent: field)) else { return XCTFail("an editable element in between") }
    let group = Node("AXGroup", parent: Node("AXButton", parent: page()))
    guard case .failure(.editable) = control(Node("AXStaticText", parent: group), editable: [ObjectIdentifier(group)]) else {
      return XCTFail("an element with an editable ancestor in between")
    }
    let slider = Node("AXSlider", parent: Node("AXButton", parent: page()))
    guard case .failure(.roleNotAllowed) = control(Node("AXStaticText", parent: slider)) else { return XCTFail("another interactive role in between") }
  }

  /// The walk's chain is recorded, roles only, from the hit up to the pressed control or to where it stopped, and the
  /// click's meta carries it with why it stopped on a refusal.
  func testTheWalksChainIsRecordedOnAPressAndOnARefusal() {
    func walked(_ hit: Node) -> [String] {
      var walk: [String] = []
      _ = webAreaControl(hit, role: { $0.role }, parent: { $0.parent }, editable: { _ in false }, walk: &walk)
      return walk
    }
    let button = Node("AXButton", parent: page())
    XCTAssertEqual(walked(Node("AXStaticText", parent: Node("AXGroup", parent: button))), ["AXStaticText", "AXGroup", "AXButton"])
    XCTAssertEqual(walked(button), ["AXButton"])
    XCTAssertEqual(walked(Node("AXStaticText", parent: Node("AXSlider", parent: button))), ["AXStaticText", "AXSlider"], "stopped at the slider")
    XCTAssertEqual(walked(Node("AXStaticText", parent: page())), ["AXStaticText", "AXWebArea"], "stopped at the web area")
    XCTAssertEqual(walked(Node("AXImage", parent: Node(nil, parent: button))), ["AXImage", "unreadable"])
    var record = ElementClickRecord(plan: .synthesized(.activation), reason: .webArea)
    record.walk = ["AXStaticText", "AXSlider"]
    record.walkStopped = WebAreaRefusal.roleNotAllowed.rawValue
    XCTAssertEqual(record.wire["walk"] as? [String], ["AXStaticText", "AXSlider"])
    XCTAssertEqual(record.wire["walkStopped"] as? String, "roleNotAllowed")
    let pressed = ElementClickRecord(plan: .action("AXPress"), reason: .webArea, pressedRole: "AXButton", pressedAncestor: true,
                                     walk: ["AXStaticText", "AXButton"])
    XCTAssertEqual(pressed.wire["walk"] as? [String], ["AXStaticText", "AXButton"])
    XCTAssertEqual(pressed.wire["pressed"] as? String, "ancestor")
    XCTAssertEqual(pressed.wire["pressedRole"] as? String, "AXButton")
    XCTAssertNil(pressed.wire["walkStopped"])
  }

  /// The bounded re-read (run 42131623237: a fresh Chrome's checkbox advertised AXPress 1.6 to 1.7 s after the engine's
  /// enablement write): where the process's accessibility is fresh, an allowlisted control with no action is re-read every
  /// 100 ms for up to 2 s, posting nothing; found at 1.6 s it is pressed, never found it is refused; not fresh, no wait.
  func testTheReReadFindsALateActionOrTimesOutOnlyWhereAccessibilityIsFresh() {
    var clock: Double = 0
    var reads = 0
    func reread(appearsAt: Double?, fresh: Bool = true) -> String? {
      webAreaActionRereading(role: "AXCheckBox", first: [], fresh: fresh, read: {
        reads += 1
        return appearsAt.map { clock >= $0 } == true ? ["AXPress"] : []
      }, now: { clock }, sleep: { clock += $0 })
    }
    XCTAssertEqual(reread(appearsAt: 1_600), "AXPress", "found at 1.6 s")
    XCTAssertEqual(clock, 1_600)
    clock = 0
    reads = 0
    XCTAssertNil(reread(appearsAt: nil), "never found: refused")
    XCTAssertEqual(clock, webAreaActionRereadMs, "after the whole 2 s, no longer")
    XCTAssertEqual(reads, 20)
    clock = 0
    reads = 0
    XCTAssertNil(reread(appearsAt: 0, fresh: false), "not fresh: no wait at all")
    XCTAssertEqual(clock, 0)
    XCTAssertEqual(reads, 0)
    XCTAssertEqual(webAreaActionRereading(role: "AXButton", first: ["AXPress"], fresh: true, read: { XCTFail("no re-read"); return nil },
                                          now: { clock }, sleep: { _ in XCTFail("no wait") }), "AXPress", "an action at once: no wait")
    // A non-allowlisted role never reaches the re-read: the walk refuses it first, with no wait.
    guard case .failure(.editable) = control(Node("AXTextArea", parent: page())) else { return XCTFail("refused at once") }
    // Fresh: a recent enablement write, or no web area seen yet.
    XCTAssertTrue(webAreaAccessibilityFresh(enabledAt: 1_000, now: 2_700, webAreaSeen: true))
    XCTAssertFalse(webAreaAccessibilityFresh(enabledAt: 1_000, now: 1_000 + webAreaFreshEnablementMs, webAreaSeen: true))
    XCTAssertFalse(webAreaAccessibilityFresh(enabledAt: nil, now: 5, webAreaSeen: true))
    XCTAssertTrue(webAreaAccessibilityFresh(enabledAt: nil, now: 5, webAreaSeen: false))
  }

  /// A checkbox or radio button whose value is unchanged after the press, through the settle, answers clickUnconfirmed;
  /// one whose value changes passes, as does a role with no value to check.
  func testAnUnchangedValueAfterThePressAnswersClickUnconfirmed() throws {
    var clock: Double = 0
    var presses = 0
    func run(_ values: [String?], checks: Bool = true) throws {
      var reads = values.makeIterator()
      var last: String?
      try pressConfirmingValue(app: "Google Chrome for Testing", checksValue: checks, readValue: {
        if let next = reads.next() { last = next }
        return last
      }, now: { clock }, sleep: { clock += $0 }) { presses += 1 }
    }
    XCTAssertThrowsError(try run(["0", "0"])) {
      let error = $0 as? EngineError
      XCTAssertEqual(error?.errorName, "clickUnconfirmed")
      XCTAssertTrue(error?.message.contains("the control's value did not change") == true, error?.message ?? "")
    }
    XCTAssertEqual(presses, 1, "pressed once, never retried")
    XCTAssertGreaterThanOrEqual(clock, webAreaValueSettleMs, "the whole settle waited")
    XCTAssertLessThan(clock, webAreaValueSettleMs + 2 * webAreaValueSampleMs, "and no longer")
    clock = 0
    XCTAssertNoThrow(try run(["0", "0", "0", "1"]), "the value changed within the settle")
    XCTAssertLessThan(clock, webAreaValueSettleMs)
    XCTAssertThrowsError(try run(["1", nil]), "unreadable after a readable value: unconfirmed")
    XCTAssertNoThrow(try run([nil]), "no value to read before: the press stands")
    XCTAssertNoThrow(try run(["0"], checks: false), "a button has no value to check")
    XCTAssertEqual(presses, 5)
  }

  // MARK: The coordinate hit-test asks the application, bounded to the window (#282, found live on the hosted runner)

  /// The AX layer as AppKit answers it: AXUIElementCopyElementAtPosition of a window element is kAXErrorIllegalArgument
  /// (-25201) with no element; of the application, the element at the point.
  private func stub(_ application: Node, answers hit: Node?) -> (Node, CGPoint) -> (AXError, Node?) {
    { root, _ in root === application ? (hit == nil ? .noValue : .success, hit) : (.illegalArgument, nil) }
  }

  private func hitIn(_ application: Node, _ window: Node, _ elementAt: (Node, CGPoint) -> (AXError, Node?)) -> Node? {
    windowHit(application: application, window: window, at: point, elementAt: elementAt, role: { $0.role }, parent: { $0.parent },
                     same: { $0 === $1 })
  }

  /// The hit-test is asked of the application element, never the window (which answers -25201): a page point in the
  /// target window answers its element, and through it the web area; a stub that answers -25201 to every root, as the
  /// window did, leaves the hit nil, a Chromium process's possible web area.
  func testTheCoordinateHitTestAsksTheApplicationAndANilAnswerStaysCovered() {
    let application = Node("AXApplication")
    let window = Node("AXWindow", parent: application)
    let field = Node("AXTextArea", parent: Node("AXGroup", parent: Node("AXWebArea", parent: Node("AXGroup", parent: window))))
    var asked: [Node] = []
    let found = hitIn(application, window) { root, at in asked.append(root); return self.stub(application, answers: field)(root, at) }
    XCTAssertTrue(found === field)
    XCTAssertEqual(asked.count, 1)
    XCTAssertTrue(asked.first === application, "asked of the application, never the window")
    XCTAssertEqual(pointerView(chromium: true, webAreaSeen: true, hit: found, role: { $0.role }, parent: { $0.parent }), .webArea)
    let refused = hitIn(application, window) { _, _ in (.illegalArgument, nil) }  // -25201, the window's answer
    XCTAssertNil(refused)
    XCTAssertEqual(pointerView(chromium: true, webAreaSeen: true, hit: refused, role: { $0.role }, parent: { $0.parent }), .possibleWebArea)
    XCTAssertNil(hitIn(application, window, stub(application, answers: nil)), "no element at the point")
  }

  /// A hit whose AXWindow ancestor is another window of the app (one above the target at the point) counts as nil, as
  /// does one whose ancestry cannot be read to a window; the target window itself, or a sheet's element under it, counts.
  func testAHitInAnotherWindowOfTheAppCountsAsNil() {
    let application = Node("AXApplication")
    let window = Node("AXWindow", parent: application)
    let other = Node("AXWindow", parent: application)
    let covering = Node("AXButton", parent: Node("AXGroup", parent: other))
    XCTAssertNil(hitIn(application, window, stub(application, answers: covering)), "another window's element")
    XCTAssertNil(hitIn(application, window, stub(application, answers: Node("AXButton", parent: Node("AXGroup")))), "no window ancestor read")
    XCTAssertNil(hitIn(application, window, stub(application, answers: application)), "the application itself")
    let inSheet = Node("AXButton", parent: Node("AXSheet", parent: window))
    XCTAssertTrue(hitIn(application, window, stub(application, answers: inSheet)) === inSheet, "a sheet's element is its window's")
    XCTAssertTrue(hitIn(application, window, stub(application, answers: window)) === window, "the window itself")
  }

  // MARK: The mode reaches the connection through its ping

  func testThePingNamesTheConnectionsDeviceMode() throws {
    let engine = Engine(paths: ServerPaths(socket: "/tmp/x.sock", directory: "/tmp", lock: "/tmp/x.lock", usage: "/tmp/cua-engine-test-usage.json"),
                        intervention: InterventionMonitor(listenGranted: { false }))
    let first = ConnectionState(id: 1, fd: -1), second = ConnectionState(id: 2, fd: -1)
    func ping(_ params: [String: Any], on connection: ConnectionState) -> Result<Any, EngineError> {
      engine.handle(Request(id: 1, method: "ping", params: params), on: connection, receivedAt: unixMilliseconds()).result
    }
    XCTAssertNoThrow(try ping(["clientApiVersion": serverApiVersion], on: first).get())
    XCTAssertEqual(first.desktop, .shared, "a ping naming none: shared")
    XCTAssertNoThrow(try ping(["clientApiVersion": serverApiVersion, "desktop": "dedicated"], on: first).get())
    XCTAssertEqual(first.desktop, .dedicated)
    XCTAssertEqual(second.desktop, .shared, "per connection, never the engine's")
    for bad in ["Dedicated", 1, NSNull()] as [Any] {
      guard case .failure(let error) = ping(["clientApiVersion": serverApiVersion, "desktop": bad], on: second) else { return XCTFail("\(bad)") }
      XCTAssertEqual(error.code, RPCCode.invalidParams.rawValue)
    }
    XCTAssertEqual(second.desktop, .shared, "unchanged by an invalid one")
    XCTAssertNoThrow(try ping(["clientApiVersion": serverApiVersion, "desktop": "shared"], on: first).get())
    XCTAssertEqual(first.desktop, .shared)
  }
}
