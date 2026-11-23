import AppKit
import CoreGraphics
import Foundation
import XCTest
@testable import Engine

// #258 (Routes.swift `elementClickGate`, `elementClickRoutes`, `elementInsideWebArea`, `frontmostIsTarget`): an element
// click on a web page's text field whose clickable point hits the field itself took the field's AXPress, which keeps its
// selection, where the vendor's click posts a real click there and leaves a caret (#187's slot, cell 3 (i): 20+7 kept on
// cua, a caret at 44 on the vendor's). The vendor's gate inside a web view (F §18) counts the element itself. Ruling 1170
// takes that only for the frontmost app: there the field's click is synthesized at its point and posted with no
// activation; behind another app (Chromium, Electron, Gecko, WebKit) it keeps main's route, decided by route 3's own
// frontmost test, so a target that owns key focus behind the frontmost app keeps it too. A native field, and every other
// control, keeps its action. The trees are the Electron fixture's.

final class WebTextFieldClickTests: XCTestCase {
  private let target: pid_t = 990_201, user: pid_t = 990_202
  private let window = CGRect(x: 80, y: 60, width: 800, height: 600)
  private let activations = HeldActivations()

  private final class Node {
    let role: String?
    let parent: Node?
    init(_ role: String?, parent: Node? = nil) { (self.role, self.parent) = (role, parent) }
  }

  /// The Electron fixture's page: window → group → scroll area → web area → group → the text area.
  private final class Electron {
    let window = Node("AXWindow")
    let page: Node, form: Node, textArea: Node
    init() {
      page = Node("AXWebArea", parent: Node("AXScrollArea", parent: Node("AXGroup", parent: window)))
      form = Node("AXGroup", parent: page)
      textArea = Node("AXTextArea", parent: form)
    }
  }

  private let textEntryRoles = ["AXTextArea", "AXTextField", "AXComboBox", "AXSearchField", "AXSecureTextField"]
  /// The non-text controls the matrix clicks, and the containers a click can name.
  private let otherRoles = ["AXButton", "AXCheckBox", "AXRadioButton", "AXLink", "AXPopUpButton", "AXMenuButton", "AXMenuItem",
                            "AXDisclosureTriangle", "AXTab", "AXRow", "AXCell", "AXGroup", "AXStaticText", "AXImage"]
  private let pressed = ["AXPress", "AXShowMenu", "AXScrollToVisible"]

  private func plan(role: String, actions: [String]? = nil, hit: HitRelation, frontmost: Bool = true, web: Bool,
                    synthesized: InputRoute = .activation, reads: UnsafeMutablePointer<Int>? = nil) throws -> ElementClickPlan {
    try elementClickPlan(forced: nil, button: .left, count: 1, role: role, actions: actions ?? pressed, synthesized: synthesized,
                         frontmost: { reads?.pointee += 1; return frontmost }, insideWebArea: { reads?.pointee += 1; return web }) { hit }
  }

  /// Both of an element click's decisions over a web-area read that counts itself.
  private func routes(role: String, actions: [String]? = nil, hit: HitRelation, frontmost: Bool, web: Bool, engine: PageEngine,
                      webReads: UnsafeMutablePointer<Int>? = nil) throws -> (plan: ElementClickPlan, textEntry: TextEntryClickRoute) {
    try elementClickRoutes(forced: nil, button: .left, count: 1, role: role, actions: actions ?? pressed, engine: engine,
                           frontmost: { frontmost }, insideWebArea: { webReads?.pointee += 1; return web }) { hit }
  }

  // MARK: The frontmost app: synthesized

  /// The catching case: the frontmost app's page field that advertises AXPress, its point hitting the field itself, is
  /// synthesized (route 3, or route 4 under the owner's override), as the vendor's click is; AXPick is no exception.
  func testAFrontmostWebTextFieldWhosePointHitsItselfIsSynthesized() throws {
    for role in textEntryRoles {
      XCTAssertEqual(try plan(role: role, hit: .element, web: true), .synthesized(.activation), role)
      XCTAssertEqual(try plan(role: role, hit: .element, web: true, synthesized: .foreground), .synthesized(.foreground), role)
      XCTAssertEqual(try plan(role: role, actions: ["AXPick", "AXPress"], hit: .element, web: true), .synthesized(.activation), role)
    }
    for engine in [PageEngine.chromium, .gecko, .other] {
      XCTAssertEqual(try routes(role: "AXTextArea", hit: .element, frontmost: true, web: true, engine: engine).plan, .synthesized(.activation),
                     "\(engine)")
    }
  }

  /// The frontmost app's plain click goes to the field's center with no activation (the M5 cell), and so does one whose
  /// key focus another process holds: route 3 reads the frontmost app as believing it has focus, so it activates
  /// nothing either way.
  func testAFrontmostPageFieldGetsThePlainClickAtItsCenterWhoeverHoldsKeyFocus() throws {
    for keyFocus in [target, user] {
      let seam = GuardSeam(frontmost: target)
      var system = seam.system
      system.keyFocus = { keyFocus }
      let front = frontmostIsTarget(system.frontmost(), pid: target, appPid: target)
      XCTAssertTrue(front)
      let plan = try plan(role: "AXTextArea", hit: .element, frontmost: front, web: true)
      let activation = FakeActivation(pid: target, window: AXUIElementCreateApplication(target), windowFrame: window, windowID: 41, system: system)
      var clickMeta = meta()
      try deliver(plan, activation: activation, post: system.post,
                  pointer: PointerTarget(view: .webArea, app: "Electron", engine: .chromium), targetActive: true, meta: &clickMeta)
      XCTAssertEqual(seam.posts.map(\.kind), [.mouse(.leftMouseDown), .mouse(.leftMouseUp)], "key focus \(keyFocus)")
      XCTAssertEqual(seam.posts.compactMap(\.location), [CGPoint(x: field.midX, y: field.midY), CGPoint(x: field.midX, y: field.midY)])
      XCTAssertEqual(seam.posts.compactMap(\.flags), [[], []], "no ⌘")
      XCTAssertEqual(clickMeta.inputRoute, .activation)
      XCTAssertNil(clickMeta.activationGuardMs, "no guard ran")
      XCTAssertNil(clickMeta.delivery, "nothing to put back")
    }
  }

  // MARK: Behind another app: main's route

  /// The review's P1: another app is frontmost and the target owns key focus. Route 3 would read it as believing it has
  /// focus, activate nothing, and post the field's mouse down with no hold, order repair or watch; route 3's frontmost
  /// test says it is not the frontmost app, so the field keeps its action, as on main.
  func testATargetOwningKeyFocusBehindTheFrontmostAppKeepsItsAction() throws {
    let seam = GuardSeam(frontmost: user)
    var system = seam.system
    system.keyFocus = { self.target }
    XCTAssertTrue(system.believesItHasFocus(target), "the split: key focus without the front")
    let front = frontmostIsTarget(system.frontmost(), pid: target, appPid: target)
    XCTAssertFalse(front)
    for engine in [PageEngine.chromium, .gecko, .other] {
      let decided = try routes(role: "AXTextArea", hit: .element, frontmost: front, web: true, engine: engine)
      XCTAssertEqual(decided.plan, .action("AXPress"), "\(engine)")
    }
    XCTAssertFalse(frontmostIsTarget(nil, pid: target, appPid: target), "no frontmost app is not the target's")
    XCTAssertTrue(frontmostIsTarget(target + 7, pid: target + 7, appPid: target), "a helper process serving the element")
  }

  /// Every background page field keeps main's plan and #313's route: Chromium and Electron (`selecting` false: the
  /// press, its focus read back), a Chrome `<input list>` combo box (its held AXPress opens the suggestions, #463),
  /// Gecko (the press, never #283's focus), WebKit (the press, then its caret where the press does not focus it).
  func testABackgroundPageFieldKeepsMainsRoute() throws {
    for (name, role, engine, selecting) in [("Chromium's field", "AXTextField", PageEngine.chromium, false),
                                            ("Electron's text area", "AXTextArea", .chromium, false),
                                            ("Chrome's datalist input", "AXComboBox", .chromium, false),
                                            ("Firefox's field", "AXTextField", .gecko, false),
                                            ("Safari's text area", "AXTextArea", .other, true)] {
      var reads = 0
      let decided = try routes(role: role, hit: .element, frontmost: false, web: true, engine: engine, webReads: &reads)
      XCTAssertEqual(decided.plan, .action("AXPress"), name)
      XCTAssertEqual(decided.textEntry, .pressConfirmingFocus(selecting: selecting), name)
      XCTAssertEqual(reads, engine == .other ? 1 : 0, "\(name): the walk as main reads it")
      let record = elementClickRecord(decided.plan, forced: nil, button: .left, count: 1, actions: pressed, hit: .element)
      XCTAssertEqual(record.reason, .advertised, name)
    }
  }

  // MARK: What stays as it was

  /// The vendor gates only inside a web view: a native field whose point hits itself keeps its action.
  func testANativeTextFieldWhosePointHitsItselfKeepsItsAction() throws {
    for role in textEntryRoles {
      XCTAssertEqual(try plan(role: role, hit: .element, web: false), .action("AXPress"), role)
    }
  }

  /// A native field in the frontmost app reads its ancestry once, for the gate and #313's route together.
  func testANativeFieldReadsItsAncestryOnce() throws {
    var reads = 0
    let decided = try routes(role: "AXTextField", hit: .element, frontmost: true, web: false, engine: .other, webReads: &reads)
    XCTAssertEqual(decided.plan, .action("AXPress"))
    XCTAssertEqual(decided.textEntry, .pressConfirmingFocus(selecting: false))
    XCTAssertEqual(reads, 1)
  }

  /// Buttons and the other controls keep their action on a hit of themselves, in a page or not, and neither the front
  /// nor the web area is read for them.
  func testEveryOtherControlKeepsItsActionAndReadsNothing() throws {
    var reads = 0
    for role in otherRoles {
      for web in [true, false] {
        XCTAssertEqual(try plan(role: role, hit: .element, web: web, reads: &reads), .action("AXPress"), "\(role), web \(web)")
      }
    }
    XCTAssertEqual(reads, 0)
  }

  /// A web text field whose point the hit-test does not place in the field (no answer, a container, something else)
  /// keeps its action, as the vendor's does; a strict descendant still synthesizes every role, frontmost or not, as
  /// before, reading neither.
  func testOnlyAHitInsideTheElementSynthesizes() throws {
    var reads = 0
    for role in textEntryRoles + ["AXButton"] {
      for hit in [HitRelation.noAnswer, .ancestor, .other] {
        XCTAssertEqual(try plan(role: role, hit: hit, web: true, reads: &reads), .action("AXPress"), "\(role), \(hit)")
      }
      for frontmost in [true, false] {
        XCTAssertEqual(try plan(role: role, hit: .descendant, frontmost: frontmost, web: false, reads: &reads), .synthesized(.activation), role)
      }
    }
    XCTAssertEqual(reads, 0, "the front and the web area are read only for a text field hitting itself")
  }

  /// The front is read before the web area, so a background field walks nothing for the gate.
  func testABackgroundFieldReadsNoWebAreaForTheGate() throws {
    var order: [String] = []
    let chosen = try elementClickPlan(forced: nil, button: .left, count: 1, role: "AXTextArea", actions: pressed,
                                      frontmost: { order.append("front"); return false }, insideWebArea: { order.append("web"); return true }) { .element }
    XCTAssertEqual(chosen, .action("AXPress"))
    XCTAssertEqual(order, ["front"])
  }

  /// A click the ladder already synthesizes (no action, another button or count) takes no hit-test and reads nothing.
  func testAClickAlreadySynthesizedTakesNoHitTestAndReadsNothing() throws {
    var reads = 0
    var hits = 0
    for (button, count, actions) in [(MouseButton.left, 1, ["AXShowMenu"]), (.right, 1, ["AXPress"]), (.left, 2, ["AXPress"])] {
      let chosen = try elementClickPlan(forced: nil, button: button, count: count, role: "AXTextArea", actions: actions,
                                        frontmost: { reads += 1; return true }, insideWebArea: { reads += 1; return true }) { hits += 1; return .element }
      XCTAssertEqual(chosen, .synthesized(.activation))
    }
    XCTAssertEqual(hits, 0)
    XCTAssertEqual(reads, 0)
  }

  // MARK: Inside a web area

  /// The vendor's `isInsideWebView`: the element or an ancestor is an AXWebArea. A field of the page is; a field of the
  /// window's own chrome is not, nor is one whose ancestry cannot be read up to its window.
  func testAFieldIsInsideAWebAreaOnlyWhereAnAncestorIsOne() {
    let electron = Electron()
    func inside(_ node: Node) -> Bool { elementInsideWebArea(node, role: { $0.role }, parent: { $0.parent }) }
    XCTAssertTrue(inside(electron.textArea))
    XCTAssertTrue(inside(Node("AXTextField", parent: Node("AXGroup", parent: electron.form))), "nested deeper in the page")
    XCTAssertTrue(inside(electron.page), "the web area itself")
    XCTAssertFalse(inside(Node("AXTextField", parent: Node("AXToolbar", parent: electron.window))), "the window's chrome")
    XCTAssertFalse(inside(Node("AXTextArea", parent: Node("AXScrollArea", parent: Node("AXWindow")))), "a native text view")
    XCTAssertFalse(inside(Node("AXTextField", parent: Node(nil, parent: electron.page))), "an unreadable parent")
    XCTAssertFalse(inside(Node("AXTextField")), "no parent")
  }

  // MARK: The record

  /// The record names the new rung: synthesized for a frontmost web text field hitting itself (`webTextEntry`), the
  /// gate's `descendant` otherwise, and the hit-test's answer beside it.
  func testTheRecordNamesAWebTextFieldsSynthesis() throws {
    let web = try plan(role: "AXTextArea", hit: .element, web: true)
    let record = elementClickRecord(web, forced: nil, button: .left, count: 1, actions: pressed, hit: .element)
    XCTAssertEqual(record.reason, .webTextEntry)
    XCTAssertEqual(record.wire["plan"] as? String, "synthesized")
    XCTAssertEqual(record.wire["reason"] as? String, "webTextEntry")
    XCTAssertEqual(record.wire["hit"] as? String, "element")
    let gate = try plan(role: "AXTextArea", hit: .descendant, web: true)
    XCTAssertEqual(elementClickRecord(gate, forced: nil, button: .left, count: 1, actions: pressed, hit: .descendant).reason, .descendant)
    let native = try plan(role: "AXTextArea", hit: .element, web: false)
    XCTAssertEqual(elementClickRecord(native, forced: nil, button: .left, count: 1, actions: pressed, hit: .element).reason, .advertised)
  }

  // MARK: Delivery

  private func meta() -> InputMeta {
    InputMeta(ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
  }

  /// The field's frame, wholly visible in its window: its clickable point is the frame's midpoint, the vendor's point.
  private let field = CGRect(x: 200, y: 300, width: 400, height: 120)

  private func deliver(_ plan: ElementClickPlan, activation: FakeActivation, post: @escaping (CGEvent, pid_t) -> Void,
                       pointer: PointerTarget = .acceptingFirstMouse, targetActive: Bool, meta: inout InputMeta) throws {
    guard case .synthesized(let route) = plan, let point = clickablePoint(frame: field, visibleIn: window) else {
      return XCTFail("a frontmost web text field hitting itself is synthesized at a point")
    }
    XCTAssertEqual(point, CGPoint(x: field.midX, y: field.midY))
    try deliverClick(ClickTarget(point: point, windowFrame: window, windowID: 41, pid: target), route: route, button: .left, count: 1,
                     activation: activation, activations: activations, pointer: pointer, targetActive: { targetActive },
                     post: post, meta: &meta)
  }
}
