import AppKit
import CoreGraphics
import Foundation
import XCTest
@testable import Engine

// #315 (Routes.swift `pointerView`, `geckoChromeView`; WebAreaFocus.swift `webAreaFocusCarrier`, `pressFocusingField`): a
// shared-mode left pointer into a background Firefox page was posted and lost (#287: 34 of 34 `clickUnconfirmed`, pointer
// 0), since Firefox's AXActivationPoint lies on a toolbar control, so its activation clicks no point, and Gecko refuses a
// click-through mouse down into its page. Its page is now a web area as Chromium's is: a plain click goes by the element's
// own action, a text field is focused by its press and read back (never an AXFocused write, which a background Firefox
// ignores, #313), anything else is refused with nothing posted. Its chrome (toolbar, tabs) is not a web area. The trees are
// Firefox 159's, as #287's hosted recon and #314's A/B printed them.

final class GeckoPointerTests: XCTestCase {
  private let target: pid_t = 990_101, user: pid_t = 990_102
  private let window = CGRect(x: 80, y: 60, width: 610, height: 860)
  private let point = CGPoint(x: 300, y: 400)
  private let activations = HeldActivations()

  private final class Node {
    let role: String?
    let actions: [String]?
    weak var parent: Node?
    var children: [Node] = []
    init(_ role: String?, actions: [String]? = [], parent: Node? = nil) {
      (self.role, self.actions) = (role, actions)
      self.parent = parent
      parent?.children.append(self)
    }
  }

  /// Firefox's window: window → group → (toolbar → Reload) and (group → group → scroll area → web area → page).
  private final class Firefox {
    let window = Node("AXWindow")
    let top: Node, toolbar: Node, reload: Node, scrollArea: Node, page: Node
    init() {
      top = Node("AXGroup", parent: window)
      toolbar = Node("AXToolbar", parent: top)
      reload = Node("AXButton", actions: ["AXShowMenu", "AXScrollToVisible", "AXPress"], parent: toolbar)
      scrollArea = Node("AXScrollArea", parent: Node("AXGroup", parent: Node("AXGroup", parent: top)))
      page = Node("AXWebArea", parent: scrollArea)
    }
  }

  private func view(_ hit: Node?, engine: PageEngine = .gecko, seen: Bool = true) -> PointerView {
    pointerView(engine: engine, webAreaSeen: seen, hit: hit, role: { $0.role }, parent: { $0.parent }, children: { $0.children })
  }

  private func connection(_ desktop: DesktopMode = .shared) -> ConnectionState {
    let connection = ConnectionState(id: 1, fd: -1)
    connection.desktop = desktop
    return connection
  }

  private func meta(_ connection: ConnectionState) -> InputMeta {
    InputMeta(ExecutionContext(connection: connection, receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
  }

  /// Firefox's activation: its AXActivationPoint inside the frame, on a toolbar control (`activationClick: control`), so
  /// it clicks no activation point (#287, the point (430, 47) on the toolbar).
  private func firefoxActivation(_ seam: GuardSeam) -> FakeActivation {
    seam.activationPoint = CGPoint(x: 300, y: 70)
    seam.activationHit = ActivationHit(role: "AXButton", actions: ["AXShowMenu", "AXScrollToVisible", "AXPress"])
    return FakeActivation(pid: target, window: AXUIElementCreateApplication(target), windowFrame: window, windowID: 41, system: seam.system)
  }

  /// Safari's: its AXActivationPoint inside the frame on chrome that is no control, clicked right after subtype 1.
  private func safari(_ seam: GuardSeam) -> FakeActivation {
    seam.activationPoint = CGPoint(x: 300, y: 70)
    return FakeActivation(pid: target, window: AXUIElementCreateApplication(target), windowFrame: window, windowID: 41, system: seam.system)
  }

  private func pointer(_ view: PointerView, noun: String = "click", _ route: ((inout InputMeta) throws -> Void)? = nil) -> PointerTarget {
    PointerTarget(view: view, app: "Firefox", noun: noun, elementRoute: route)
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

  private func control(_ hit: Node) -> Result<(control: Node, role: String, ancestor: Bool), WebAreaRefusal> {
    webAreaControl(hit, role: { $0.role }, parent: { $0.parent }, editable: { _ in false })
  }

  /// The element route as `webAreaPress` decides it, over the fake tree, not fresh: the control's action pressed
  /// (`pressed`), or the refusal thrown with nothing pressed.
  private func elementRoute(_ hit: Node, pressed: @escaping (Node, String) -> Void) -> (inout InputMeta) throws -> Void {
    { _ in
      guard case .success(let resolved) = self.control(hit) else { throw backgroundClickRefused("Firefox") }
      let decision = webAreaPressDecision(resolved.control, walkedRole: resolved.role, fresh: false, actions: { $0.actions },
                                          role: { $0.role }, parent: { $0.parent }, editable: { _ in false },
                                          now: { 0 }, sleep: { _ in XCTFail("no wait where not fresh") })
      guard case .success(let press) = decision else { throw backgroundClickRefused("Firefox") }
      pressed(resolved.control, press.action)
    }
  }

  // MARK: Where the rule applies: Gecko's page, not its chrome

  /// A hit in Firefox's page is a web area, seen or not; a hit not established outside one (no hit, the scroll area over
  /// the web area, an unread role) is a possible one; its toolbar is `geckoChromeView`, never known to accept first mouse.
  func testGeckosPageIsAWebAreaAndItsChromeIsNot() {
    let firefox = Firefox()
    let button = Node("AXButton", actions: ["AXPress"], parent: Node("AXGroup", parent: firefox.page))
    XCTAssertEqual(view(button), .webArea)
    XCTAssertEqual(view(button, seen: false), .webArea, "a web area whether or not an observation saw it")
    XCTAssertEqual(view(firefox.page), .webArea, "the web area itself")
    XCTAssertEqual(view(nil), .possibleWebArea, "no hit")
    XCTAssertEqual(view(firefox.scrollArea), .possibleWebArea, "the scroll area holding the web area")
    XCTAssertEqual(view(Node(nil, parent: firefox.page)), .possibleWebArea, "an unreadable role")
    XCTAssertEqual(geckoChromeView, .unknown)
    for seen in [true, false] {
      XCTAssertEqual(view(firefox.reload, seen: seen), .unknown, "the toolbar's Reload, seen \(seen)")
      XCTAssertEqual(view(firefox.toolbar, seen: seen), .unknown, "the toolbar, seen \(seen)")
    }
  }

  /// #288's establishment is Chromium's: a Gecko process, its page tree not yet seen, runs none of it.
  func testAGeckoProcessRunsNoEstablishment() {
    let firefox = Firefox()
    let seams = PointerEstablishing<Node>(readAppRole: { XCTFail("no role read") }, windowHasWebArea: { XCTFail("no search"); return true },
                                          noteWebArea: { XCTFail("nothing noted") }, rehit: { XCTFail("no re-hit"); return nil },
                                          now: { 0 }, sleep: { _ in XCTFail("no wait") })
    let result = establishedPointerView(engine: .gecko, webAreaSeen: false, hit: firefox.page, role: { $0.role }, parent: { $0.parent },
                                        children: { $0.children }, establish: seams)
    XCTAssertEqual(result.view, .webArea)
    XCTAssertTrue(result.hit === firefox.page)
    XCTAssertNil(result.record)
  }

  // MARK: Shared mode: the element route, or the refusal, with nothing posted

  /// A plain coordinate click on a page button whose activation clicked a toolbar control: carried by the button's own
  /// action, cua posting nothing; with no element route the click, a double click and a drag are refused, nothing posted.
  func testASharedGeckoPageClickIsElementRoutedOrRefusedWithNothingPosted() throws {
    let firefox = Firefox()
    let button = Node("AXButton", actions: ["AXShowMenu", "AXScrollToVisible", "AXPress"], parent: Node("AXGroup", parent: firefox.page))
    let seam = GuardSeam(frontmost: user)
    var clickMeta = meta(connection())
    var pressed: [String] = []
    try click(seam, activation: firefoxActivation(seam), pointer: pointer(view(button), elementRoute(button) { node, action in
      XCTAssertTrue(node === button)
      pressed.append(action)
    }), meta: &clickMeta)
    XCTAssertEqual(pressed, ["AXPress"])
    XCTAssertEqual(seam.posts.count, 0, "cua posts nothing: no activation, no event")
    XCTAssertEqual(activations.holders(target), 0)
    for (name, count) in [("a click", 1), ("a double click", 2), ("a drag", 0)] {
      let refused = GuardSeam(frontmost: user)
      var refusedMeta = meta(connection())
      let attempt = {
        if count == 0 { try self.drag(refused, activation: self.firefoxActivation(refused), pointer: self.pointer(self.view(button), noun: "drag"), meta: &refusedMeta) }
        else { try self.click(refused, activation: self.firefoxActivation(refused), pointer: self.pointer(self.view(button)), count: count, meta: &refusedMeta) }
      }
      XCTAssertThrowsError(try attempt(), name) {
        XCTAssertEqual(($0 as? EngineError)?.errorName, "backgroundClickRefused", name)
        XCTAssertEqual(($0 as? EngineError)?.message,
                       "Firefox's web page does not accept a background click; bring Firefox forward or use a dedicated desktop", name)
      }
      XCTAssertEqual(refused.posts.count, 0, "nothing posted: \(name)")
      XCTAssertEqual(refused.holds, 0, name)
      XCTAssertNil(refusedMeta.activationClickKind, name)
    }
  }

  /// #314's A/B on `/fixedtail`: a row below the top, an AXLink whose point lands on its text child, so the element
  /// click's ladder synthesizes it; that pointer's hit is in the page, so it is element-routed to the link, nothing posted.
  func testAClickByTokenWhoseHitLandsOnADescendantIsElementRoutedToItsControl() throws {
    let firefox = Firefox()
    let link = Node("AXLink", actions: ["AXShowMenu", "AXScrollToVisible", "AXPress"], parent: Node("AXGroup", parent: firefox.page))
    let text = Node("AXStaticText", parent: link)
    let plan = try elementClickPlan(forced: nil, button: .left, count: 1, role: "AXLink", actions: link.actions ?? []) { true }
    XCTAssertEqual(plan, .synthesized(.activation), "the ladder's gate: the point lands on a strict descendant")
    let resolved = try control(text).get()
    XCTAssertTrue(resolved.control === link)
    XCTAssertTrue(resolved.ancestor)
    let seam = GuardSeam(frontmost: user)
    var clickMeta = meta(connection())
    var pressed: [String] = []
    try click(seam, activation: firefoxActivation(seam), pointer: pointer(view(text), elementRoute(text) { node, action in
      XCTAssertTrue(node === link)
      pressed.append(action)
    }), meta: &clickMeta)
    XCTAssertEqual(pressed, ["AXPress"])
    XCTAssertEqual(seam.posts.count, 0)
  }

  /// Plain text under no control, and a control advertising no action: refused, nothing posted or pressed.
  func testAnElementWithNoActionUnderNoActionableAncestorIsRefusedWithNothingPosted() throws {
    let firefox = Firefox()
    let paragraph = Node("AXGroup", parent: firefox.page)
    let text = Node("AXStaticText", parent: paragraph)
    guard case .failure(.roleNotAllowed) = control(text) else { return XCTFail("plain text walks to the web area") }
    let inert = Node("AXButton", actions: ["AXShowMenu"], parent: paragraph)
    guard case .failure(.noAction) = webAreaPressDecision(inert, walkedRole: "AXButton", fresh: false, actions: { $0.actions },
                                                         role: { $0.role }, parent: { $0.parent }, editable: { _ in false },
                                                         now: { 0 }, sleep: { _ in }) else { return XCTFail("a control with no action") }
    for hit in [text, inert] {
      let seam = GuardSeam(frontmost: user)
      var clickMeta = meta(connection())
      XCTAssertThrowsError(try click(seam, activation: firefoxActivation(seam), pointer: pointer(view(hit), elementRoute(hit) { _, _ in XCTFail("nothing pressed") }),
                                     meta: &clickMeta)) {
        XCTAssertEqual(($0 as? EngineError)?.errorName, "backgroundClickRefused")
      }
      XCTAssertEqual(seam.posts.count, 0, hit.role ?? "")
    }
  }

  // MARK: Text entry: the press and its read-back, never an AXFocused write

  /// The fake field: its press focuses it `focusesAfter` ms later, or never; everything the route did to it.
  private final class Field {
    var focusesAfter: Double? = 200
    var presses: [String] = []
    var pressedAt: Double?
    var focusReads = 0
    var clock: Double = 0
    var record: TextEntryFocusRecord?
  }

  private func focusByPress(_ field: Field, role: String = "AXTextArea", actions: [String]? = ["AXShowMenu", "AXScrollToVisible", "AXPress"]) throws -> String {
    try pressFocusingField(role: role, actions: actions, app: "Firefox", press: {
      field.presses.append($0)
      field.pressedAt = field.clock
    }, focused: {
      field.focusReads += 1
      guard let after = field.focusesAfter, let pressed = field.pressedAt else { return false }
      return field.clock - pressed >= after
    }, noted: { field.record = $0 }, now: { field.clock }, sleep: { field.clock += $0 })
  }

  /// A page's text-entry hit stops #282's walk as editable; on Gecko it is carried by the press with its focus read back
  /// (the route has no write at all), on Chromium by #283's AXFocused write.
  func testAGeckoTextFieldIsFocusedByItsPressAndItsReadBackNeverByAFocusWrite() throws {
    let firefox = Firefox()
    XCTAssertEqual(webAreaFocusCarrier(.gecko), .pressReadingFocus)
    XCTAssertEqual(webAreaFocusCarrier(.chromium), .focusWrite, "Chromium's #283 route unchanged")
    for role in ["AXTextArea", "AXTextField", "AXSearchField", "AXComboBox", "AXSecureTextField"] {
      let hit = Node(role, actions: ["AXShowMenu", "AXScrollToVisible", "AXPress"], parent: Node("AXGroup", parent: firefox.page))
      XCTAssertEqual(view(hit), .webArea, role)
      guard case .failure(.editable) = control(hit) else { return XCTFail("\(role) stops the walk as editable") }
      var walk: [String] = []
      let found = webAreaFocusTarget(hit, role: { $0.role }, subrole: { _ in .none }, parent: { $0.parent }, editable: { _ in false },
                                     focusSettable: { _ in true }, walk: &walk)
      XCTAssertTrue((try? found.get())?.element === hit, role)
      let field = Field()
      XCTAssertEqual(try focusByPress(field, role: role), "AXPress", role)
      XCTAssertEqual(field.presses, ["AXPress"], role)
      XCTAssertEqual(field.record, TextEntryFocusRecord(focus: .readBack, step: .press), role)
      XCTAssertEqual(field.clock, 200, "read back as it arrives: \(role)")
    }
    let note = pressFocusNote("Firefox")
    XCTAssertTrue(note.contains("accessibility action rather than a click at the point"), note)
    XCTAssertFalse(note.contains("at the point."), "no caret claimed at the point")
  }

  /// A field its press leaves unfocused answers clickUnconfirmed after the settle; one advertising no action is refused
  /// with nothing pressed and nothing read.
  func testAGeckoFieldItsPressLeavesUnfocusedIsUnconfirmedAndOneWithNoActionIsRefused() {
    let unfocused = Field()
    unfocused.focusesAfter = nil
    XCTAssertThrowsError(try focusByPress(unfocused)) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "clickUnconfirmed")
    }
    XCTAssertEqual(unfocused.presses, ["AXPress"])
    XCTAssertEqual(unfocused.record, TextEntryFocusRecord(focus: .notReadBack, step: .press))
    XCTAssertEqual(unfocused.clock, textEntryFocusSettleMs)
    let inert = Field()
    XCTAssertThrowsError(try focusByPress(inert, actions: ["AXShowMenu", "AXScrollToVisible"])) {
      XCTAssertEqual($0 as? WebAreaRefusal, .noAction)
    }
    XCTAssertThrowsError(try focusByPress(inert, actions: nil)) { XCTAssertEqual($0 as? WebAreaRefusal, .noAction, "unread actions") }
    XCTAssertEqual(inert.presses, [])
    XCTAssertEqual(inert.focusReads, 0)
    XCTAssertNil(inert.record)
  }

  // MARK: Unchanged: Gecko's chrome, dedicated mode, Safari, native, Chromium

  /// Firefox's toolbar is not a web area: its click is posted as before, and its own down consuming the arm answers
  /// clickUnconfirmed (#318's stated limit), though Gecko delivers it.
  func testTheGeckoToolbarsClickIsPostedAndAnswersClickUnconfirmed() {
    let firefox = Firefox()
    let seam = GuardSeam(frontmost: user)
    var clickMeta = meta(connection())
    XCTAssertThrowsError(try click(seam, activation: firefoxActivation(seam), pointer: pointer(view(firefox.reload)), meta: &clickMeta)) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "clickUnconfirmed")
    }
    XCTAssertEqual(seam.posts.filter { $0.kind == .mouse(.leftMouseDown) }.map(\.location), [point])
    XCTAssertEqual(clickMeta.activationClickKind, .action)
  }

  /// Dedicated mode posts a Gecko page's click and drag as before: the inert click right after subtype 1, then the
  /// action's own down into a key window, no refusal and no element route.
  func testDedicatedModePostsAGeckoPagePointerAsBefore() throws {
    let firefox = Firefox()
    let button = Node("AXButton", actions: ["AXPress"], parent: Node("AXGroup", parent: firefox.page))
    for isDrag in [false, true] {
      let seam = GuardSeam(frontmost: user)
      var clickMeta = meta(connection(.dedicated))
      let routed = pointer(view(button), noun: isDrag ? "drag" : "click") { _ in XCTFail("no element route in dedicated mode") }
      if isDrag { try drag(seam, activation: firefoxActivation(seam), pointer: routed, meta: &clickMeta) }
      else { try click(seam, activation: firefoxActivation(seam), pointer: routed, meta: &clickMeta) }
      XCTAssertEqual(seam.posts.filter { $0.kind == .mouse(.leftMouseDown) }.count, 2, "the inert click, then the action's own: drag \(isDrag)")
      XCTAssertEqual(clickMeta.activationClickKind, .inertOutside(.offset, .early))
      XCTAssertNil(clickMeta.delivery)
    }
  }

  /// Safari's page and a native app have no web-area rule (Safari's activation clicks its in-window point, so its
  /// pointer is delivered, #287); Chromium's toolbar stays known to accept once a web area is seen.
  func testSafariNativeAndChromiumAreUnchanged() throws {
    let firefox = Firefox()  // the same shape under another engine
    let button = Node("AXButton", actions: ["AXPress"], parent: Node("AXGroup", parent: firefox.page))
    XCTAssertEqual(view(button, engine: .other), .unknown, "Safari's page")
    XCTAssertEqual(view(Node("AXButton", parent: Node("AXWindow")), engine: .other), .unknown, "a native button")
    XCTAssertEqual(view(firefox.reload, engine: .chromium), .acceptsFirstMouse, "Chrome's toolbar")
    XCTAssertEqual(view(firefox.reload, engine: .chromium, seen: false), .possibleWebArea)
    XCTAssertEqual(view(button, engine: .chromium), .webArea)
    XCTAssertEqual(pageEngineOf(info: ["NSPrincipalClass": "BrowserApplication"]), .other, "Safari 27.2's principal class")
    let seam = GuardSeam(frontmost: user)
    var clickMeta = meta(connection())
    try click(seam, activation: safari(seam), pointer: pointer(view(button, engine: .other)), meta: &clickMeta)
    XCTAssertEqual(clickMeta.activationClickKind, .activationPoint)
    XCTAssertEqual(seam.posts.filter { $0.kind == .mouse(.leftMouseDown) }.count, 2, "Safari's click posted as before")
  }
}
