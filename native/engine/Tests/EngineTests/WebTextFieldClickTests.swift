import AppKit
import CoreGraphics
import Foundation
import XCTest
@testable import Engine

// #258 (Routes.swift `elementClickGate`, `elementInsideWebArea`): an element click on a web page's text field whose clickable
// point hits the field itself took the field's AXPress, which keeps its selection, where the vendor's click posts a real
// click there and leaves a caret (#187's slot, cell 3 (i): 20+7 kept on cua, a caret at 44 on the vendor's). The vendor's
// gate inside a web view (F §18) searches the hit and its ancestors for the clicked element, so the element itself counts:
// a text-entry role inside a web area now goes to synthesis on that hit, at the same point, by route 3's delivery and its
// guards; a native field, and every other control, keeps its action. The trees are the Electron fixture's.

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

  private func plan(role: String, actions: [String] = ["AXPress", "AXShowMenu", "AXScrollToVisible"], hit: HitRelation,
                    web: Bool, synthesized: InputRoute = .activation, webReads: UnsafeMutablePointer<Int>? = nil) throws -> ElementClickPlan {
    try elementClickPlan(forced: nil, button: .left, count: 1, role: role, actions: actions, synthesized: synthesized,
                         insideWebArea: { webReads?.pointee += 1; return web }) { hit }
  }

  // MARK: The route choice

  /// The catching case: a page's text field that advertises AXPress, its point hitting the field itself, is synthesized
  /// (route 3, or route 4 under the owner's override), as the vendor's click is; AXPick is no exception.
  func testAWebTextFieldWhosePointHitsItselfIsSynthesized() throws {
    for role in textEntryRoles {
      XCTAssertEqual(try plan(role: role, hit: .element, web: true), .synthesized(.activation), role)
      XCTAssertEqual(try plan(role: role, hit: .element, web: true, synthesized: .foreground), .synthesized(.foreground), role)
      XCTAssertEqual(try plan(role: role, actions: ["AXPick", "AXPress"], hit: .element, web: true), .synthesized(.activation), role)
    }
  }

  /// The vendor gates only inside a web view: a native field whose point hits itself keeps its action.
  func testANativeTextFieldWhosePointHitsItselfKeepsItsAction() throws {
    for role in textEntryRoles {
      XCTAssertEqual(try plan(role: role, hit: .element, web: false), .action("AXPress"), role)
    }
  }

  /// Buttons and the other controls keep their action on a hit of themselves, in a page or not, and the web-area walk
  /// is never read for them.
  func testEveryOtherControlKeepsItsActionAndReadsNoWebArea() throws {
    var reads = 0
    for role in otherRoles {
      for web in [true, false] {
        XCTAssertEqual(try plan(role: role, hit: .element, web: web, webReads: &reads), .action("AXPress"), "\(role), web \(web)")
      }
    }
    XCTAssertEqual(reads, 0)
  }

  /// A web text field whose point the hit-test does not place in the field (no answer, a container, something else)
  /// keeps its action, as the vendor's does; a strict descendant still synthesizes every role, as before, reading no web area.
  func testOnlyAHitInsideTheElementSynthesizes() throws {
    var reads = 0
    for role in textEntryRoles + ["AXButton"] {
      for hit in [HitRelation.noAnswer, .ancestor, .other] {
        XCTAssertEqual(try plan(role: role, hit: hit, web: true, webReads: &reads), .action("AXPress"), "\(role), \(hit)")
      }
      XCTAssertEqual(try plan(role: role, hit: .descendant, web: false, webReads: &reads), .synthesized(.activation), role)
    }
    XCTAssertEqual(reads, 0, "the web area is read only for a text field hitting itself")
  }

  /// A click the ladder already synthesizes (no action, another button or count) takes no hit-test and reads no web area.
  func testAClickAlreadySynthesizedTakesNoHitTestAndReadsNoWebArea() throws {
    var reads = 0
    var hits = 0
    for (button, count, actions) in [(MouseButton.left, 1, ["AXShowMenu"]), (.right, 1, ["AXPress"]), (.left, 2, ["AXPress"])] {
      let chosen = try elementClickPlan(forced: nil, button: button, count: count, role: "AXTextArea", actions: actions,
                                        insideWebArea: { reads += 1; return true }) { hits += 1; return .element }
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

  /// The record names the new rung: synthesized for a web text field hitting itself (`webTextEntry`), the gate's
  /// `descendant` otherwise, and the hit-test's answer beside it.
  func testTheRecordNamesAWebTextFieldsSynthesis() throws {
    let actions = ["AXPress", "AXShowMenu"]
    let web = try plan(role: "AXTextArea", actions: actions, hit: .element, web: true)
    let record = elementClickRecord(web, forced: nil, button: .left, count: 1, actions: actions, hit: .element)
    XCTAssertEqual(record.reason, .webTextEntry)
    XCTAssertEqual(record.wire["plan"] as? String, "synthesized")
    XCTAssertEqual(record.wire["reason"] as? String, "webTextEntry")
    XCTAssertEqual(record.wire["hit"] as? String, "element")
    let gate = try plan(role: "AXTextArea", actions: actions, hit: .descendant, web: true)
    XCTAssertEqual(elementClickRecord(gate, forced: nil, button: .left, count: 1, actions: actions, hit: .descendant).reason, .descendant)
    let native = try plan(role: "AXTextArea", actions: actions, hit: .element, web: false)
    XCTAssertEqual(elementClickRecord(native, forced: nil, button: .left, count: 1, actions: actions, hit: .element).reason, .advertised)
  }

  // MARK: Route 3's delivery and its guards, unchanged

  private func meta() -> InputMeta {
    InputMeta(ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
  }

  private func activation(_ seam: GuardSeam) -> FakeActivation {
    FakeActivation(pid: target, window: AXUIElementCreateApplication(target), windowFrame: window, windowID: 41, system: seam.system)
  }

  /// The field's frame, wholly visible in its window: its clickable point is the frame's midpoint, the vendor's point.
  private let field = CGRect(x: 200, y: 300, width: 400, height: 120)

  private func deliver(_ plan: ElementClickPlan, seam: GuardSeam, pointer: PointerTarget = .acceptingFirstMouse, targetActive: Bool,
                       meta: inout InputMeta) throws {
    guard case .synthesized(let route) = plan, let point = clickablePoint(frame: field, visibleIn: window) else {
      return XCTFail("a web text field hitting itself is synthesized at a point")
    }
    XCTAssertEqual(point, CGPoint(x: field.midX, y: field.midY))
    try deliverClick(ClickTarget(point: point, windowFrame: window, windowID: 41, pid: target), route: route, button: .left, count: 1,
                     activation: activation(seam), activations: activations, pointer: pointer, targetActive: { targetActive },
                     post: seam.system.post, meta: &meta)
  }

  private func webField() throws -> ElementClickPlan { try plan(role: "AXTextArea", hit: .element, web: true) }

  /// The M5 cell's case: the Electron app frontmost, so no activation runs and the plain click goes to the field's
  /// center, which places the caret there.
  func testAFrontmostPageFieldGetsThePlainClickAtItsCenter() throws {
    let seam = GuardSeam(frontmost: target)
    var clickMeta = meta()
    try deliver(try webField(), seam: seam, pointer: PointerTarget(view: .webArea, app: "Electron", engine: .chromium), targetActive: true,
                meta: &clickMeta)
    XCTAssertEqual(seam.posts.map(\.kind), [.mouse(.leftMouseDown), .mouse(.leftMouseUp)])
    XCTAssertEqual(seam.posts.compactMap(\.location), [CGPoint(x: field.midX, y: field.midY), CGPoint(x: field.midX, y: field.midY)])
    XCTAssertEqual(seam.posts.compactMap(\.flags), [[], []], "no ⌘")
    XCTAssertEqual(clickMeta.inputRoute, .activation)
    XCTAssertNil(clickMeta.activationGuardMs, "no guard ran")
  }

  /// In the background, a failed activation guard refuses the click as before, its events never posted.
  func testABackgroundFieldsFailedGuardIsRefusedWithNothingPosted() throws {
    let seam = GuardSeam(frontmost: user, frontmostAfterPost: target)
    var clickMeta = meta()
    XCTAssertThrowsError(try deliver(try webField(), seam: seam, targetActive: false, meta: &clickMeta)) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "activationFailed")
    }
    XCTAssertEqual(seam.posts.map(\.kind), [.appKit(1)], "the click's own events never go out")
  }

  /// #282 in shared mode: a background Chromium page whose activation clicks no activation point takes no pointer, so
  /// the field's click goes by the element route (#283's focus, a stand-in here), nothing posted; with none it is
  /// refused, nothing posted.
  func testABackgroundChromiumFieldTakesTheElementRouteOrIsRefusedWithNothingPosted() throws {
    let routed = GuardSeam(frontmost: user)
    routed.activationPoint = CGPoint(x: -1, y: 1441)  // Chrome's, outside its frame (U13)
    var routedMeta = meta()
    var focused = 0
    try deliver(try webField(), seam: routed, pointer: PointerTarget(view: .webArea, app: "Electron", engine: .chromium,
                                                                     elementRoute: { _ in focused += 1 }),
                targetActive: false, meta: &routedMeta)
    XCTAssertEqual(focused, 1)
    XCTAssertEqual(routed.posts.count, 0, "no activation, no event")
    let refused = GuardSeam(frontmost: user)
    refused.activationPoint = CGPoint(x: -1, y: 1441)
    var refusedMeta = meta()
    XCTAssertThrowsError(try deliver(try webField(), seam: refused, pointer: PointerTarget(view: .webArea, app: "Electron", engine: .chromium),
                                     targetActive: false, meta: &refusedMeta)) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "backgroundClickRefused")
    }
    XCTAssertEqual(refused.posts.count, 0)
  }

  /// #200: a background field's click that raises the target's window at its mouse down is put back inside the
  /// activation's hold, as every route-3 click's is.
  func testABackgroundFieldsRaiseIsUndoneByTheDeliveryGuard() throws {
    let seam = GuardSeam(frontmost: user)
    seam.targetAbove = false
    seam.onMouseDown = { seam.targetAbove = true }
    var clickMeta = meta()
    try deliver(try webField(), seam: seam, targetActive: false, meta: &clickMeta)
    XCTAssertEqual(seam.targetAbove, false, "the user's window is back on top")
    XCTAssertEqual(seam.raises, 1)
    XCTAssertEqual(try XCTUnwrap(clickMeta.delivery).restores, 1)
    XCTAssertEqual(seam.posts.map(\.kind), [.appKit(1), .mouse(.leftMouseDown), .mouse(.leftMouseUp), .appKit(2)])
  }
}
