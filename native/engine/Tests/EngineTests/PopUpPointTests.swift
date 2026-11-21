import ApplicationServices
import CoreGraphics
import Foundation
import XCTest
@testable import Engine

// #458 (design rulings 977 and 979, PopUpPoint.swift): a kept coordinate click on a closed pop-up button, over fakes
// shaped as #458's kit found the controls (scripts/probe-337/README.md §#458 at b55d2908): TextEdit's font pop-up, an
// AXPopUpButton in the document window that the guard keeps as `sameElement` and whose AXPress opens a menu window of the
// app's at layer 101 over it; Chrome's `<select>`, an AXPopUpButton in the page with its AXMenu child; TextEdit's
// font-size combo box, an AXComboBox with no action, clicked on its arrow. The person's Finder window lies in front of
// the app's observed window until a menu opens, which raises the app's window above it.

final class PopUpPointTests: XCTestCase {
  private final class Node {
    let role: String
    var enabled: Bool? = true
    var actions: [String]? = ["AXPress", "AXShowMenu"]
    var frame: CGRect?
    var expanded: Bool?
    weak var parent: Node?
    var children: [Node] = []

    init(_ role: String, frame: CGRect? = nil, parent: Node? = nil) {
      self.role = role
      self.frame = frame
      if let parent { self.parent = parent; parent.children.append(self) }
    }
  }

  private let app: pid_t = 501
  private let finder: pid_t = 300
  private let observed: CGWindowID = 28
  private let buttonFrame = CGRect(x: 535, y: 70, width: 159, height: 22)
  private let point = CGPoint(x: 586, y: 81)
  private let comboFrame = CGRect(x: 720, y: 70, width: 60, height: 22)
  /// The person's window, in front of the app's while no menu is open.
  private lazy var person = ListedWindow(number: 40, owner: finder, layer: 0, bounds: CGRect(x: 0, y: 40, width: 380, height: 300))
  private lazy var appWindow = ListedWindow(number: observed, owner: app, layer: 0, bounds: CGRect(x: 400, y: 31, width: 620, height: 679))
  /// AppKit's menu: over the button.
  private lazy var menu = ListedWindow(number: 77, owner: app, layer: menuWindowLayer, bounds: CGRect(x: 535, y: 44, width: 159, height: 660))
  /// The window list now (front to back), which a fake press changes; how often the decision read it.
  private lazy var list: [ListedWindow] = [person, appWindow]
  private var listReads = 0
  private var frontmost = false

  private var reads: PopUpReads<Node> {
    PopUpReads(role: { $0.role }, parent: { $0.parent }, children: { $0.children }, enabled: { $0.enabled }, actions: { $0.actions },
               frame: { $0.frame }, expanded: { $0.expanded }, same: { $0 === $1 })
  }

  /// TextEdit: window > font pop-up button.
  private func textEdit() -> (window: Node, popup: Node) {
    let window = Node("AXWindow")
    return (window, Node("AXPopUpButton", frame: buttonFrame, parent: window))
  }

  private func freshMeta() -> InputMeta {
    InputMeta(ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
  }

  private func decide(hit: Node?, recorded: Node?, at: CGPoint? = nil) -> PopUpPoint<Node> {
    popUpPoint(hit: hit, recorded: recorded.map { ($0, $0.role) }, point: at ?? point, pids: [app], reads: reads,
               frontmost: { self.frontmost }, windows: {
      self.listReads += 1
      return self.list
    })
  }

  /// The click carried out over a fake clock: `onPress` runs as the AXPress is performed (the app opening its menu).
  private func click(_ decision: PopUpPoint<Node>, route: InputRoute = .activation, meta: inout InputMeta,
                     held: @escaping () -> Void = {}, opened: @escaping (PopUpMenuOrder?) -> Void = { _ in },
                     onPress: @escaping (Node, String) -> AXError) throws -> Bool {
    var clock = 0.0
    return try popUpClick(decision, app: "TextEdit", route: route, appWindow: observed, pids: [app], ownPid: 999, windows: { self.list },
                          now: { clock }, sleep: { clock += $0 }, hold: { _, _ in held() }, checkInFlight: {}, perform: onPress,
                          opened: opened, meta: &meta)
  }

  private func wire(_ meta: InputMeta) -> [String: Any]? { meta.wire["popUpClick"] as? [String: Any] }

  // MARK: Delivered

  /// TextEdit's font pop-up, behind Finder (the guard's `sameElement`): the hit and the record name the same enabled
  /// closed button, so the click is its AXPress by the element click's route, after its hold, with nothing posted (the
  /// caller returns on `true`), and confirmed once a menu window of the app's appears over the button. The open raised
  /// the app's window above Finder's, so the order to put back is recorded with the menu's window.
  func testAnAgreeingClosedPopUpIsItsAXPressWithNothingPostedConfirmedWhenItsMenuWindowAppears() throws {
    let scene = textEdit()
    let decision = decide(hit: scene.popup, recorded: scene.popup)
    guard case .press(let target) = decision else { return XCTFail("pressed, not \(decision)") }
    XCTAssertTrue(target.element === scene.popup)
    XCTAssertEqual(listReads, 1)
    var performed: [String] = []
    var held = 0
    var order: PopUpMenuOrder?
    var meta = freshMeta()
    let carried = try click(decision, meta: &meta, held: { held += 1 }, opened: { order = $0 }) { button, action in
      XCTAssertTrue(button === scene.popup)
      performed.append(action)
      self.list = [self.menu, self.appWindow, self.person]
      return .success
    }
    XCTAssertTrue(carried, "carried: the caller posts no pointer event")
    XCTAssertEqual(performed, ["AXPress"])
    XCTAssertEqual(held, 1, "the element click's focus hold and the guard's last check, before the press")
    XCTAssertEqual(meta.inputRoute, .activation)
    XCTAssertNotNil(meta.startedAt, "the action's interval")
    XCTAssertEqual(wire(meta)?["delivery"] as? String, "action")
    XCTAssertEqual(wire(meta)?["action"] as? String, "AXPress")
    XCTAssertEqual(wire(meta)?["effect"] as? String, "confirmed")
    XCTAssertEqual(wire(meta)?["menuWindow"] as? Int, 77)
    XCTAssertEqual(wire(meta)?["role"] as? String, "AXPopUpButton")
    XCTAssertEqual(wire(meta)?["raisedAppWindow"] as? Bool, true)
    XCTAssertEqual(wire(meta)?["polls"] as? Int, 1)
    XCTAssertEqual(order, PopUpMenuOrder(menuWindow: 77, appWindow: observed, personWindow: 40, personPid: finder))
  }

  /// The app frontmost (its window already above the person's), by route 1: confirmed, and no order to put back.
  /// Chrome's `<select>` (in the page, its AXMenu child listing the options) is a pop-up button too; Chrome's list opens
  /// below it, against its edge, and counts as its menu.
  func testAFrontmostOpenRecordsNoOrderAndChromesSelectOpensBelowItsButton() throws {
    let web = Node("AXWebArea", parent: Node("AXWindow"))
    let select = Node("AXPopUpButton", frame: buttonFrame, parent: Node("AXGroup", parent: web))
    _ = Node("AXMenu", parent: select)
    list = [appWindow, person]
    let decision = decide(hit: select, recorded: select)
    guard case .press = decision else { return XCTFail("pressed, not \(decision)") }
    var order: PopUpMenuOrder? = PopUpMenuOrder(menuWindow: 1, appWindow: 1, personWindow: 1, personPid: 1)
    var meta = freshMeta()
    let below = ListedWindow(number: 81, owner: app, layer: menuWindowLayer, bounds: CGRect(x: 535, y: 93, width: 159, height: 80))
    XCTAssertTrue(try click(decision, route: .action, meta: &meta, opened: { order = $0 }) { _, _ in
      self.list = [below, self.appWindow, self.person]
      return .success
    })
    XCTAssertEqual(meta.inputRoute, .action)
    XCTAssertEqual(wire(meta)?["menuWindow"] as? Int, 81)
    XCTAssertEqual(wire(meta)?["raisedAppWindow"] as? Bool, false)
    XCTAssertNil(order, "nothing to put back: the record for the app is cleared")
  }

  // MARK: Unconfirmed

  /// The action's return is not proof: with no new menu window of the app's at the button, the press answers
  /// clickUnconfirmed once the settle has passed, with its sentence; a menu window far from the button, one of another
  /// app's, or one already up before the press does not count.
  func testNoMenuWindowAppearingAnswersClickUnconfirmed() {
    let scene = textEdit()
    let earlier = ListedWindow(number: 60, owner: app, layer: menuWindowLayer, bounds: CGRect(x: 900, y: 600, width: 50, height: 50))
    list = [earlier, person, appWindow]
    let decision = decide(hit: scene.popup, recorded: scene.popup)
    guard case .press = decision else { return XCTFail("pressed, not \(decision)") }
    var meta = freshMeta()
    var opened = false
    XCTAssertThrowsError(try click(decision, meta: &meta, opened: { _ in opened = true }) { _, _ in
      self.list = [
        ListedWindow(number: 61, owner: self.app, layer: menuWindowLayer, bounds: CGRect(x: 40, y: 600, width: 50, height: 50)),
        ListedWindow(number: 62, owner: 777, layer: menuWindowLayer, bounds: self.buttonFrame),
        ListedWindow(number: 60, owner: self.app, layer: menuWindowLayer, bounds: self.buttonFrame),
        self.person, self.appWindow,
      ]
      return .success
    }) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "clickUnconfirmed")
      XCTAssertEqual((error as? EngineError)?.message,
        "The click could not be confirmed: it was carried by the pop-up button's AXPress action in TextEdit, since a posted click can close the menu it opens, and no menu was seen to open at the button. Observe the app with get_app_state before any retry, and never retry blindly.")
    }
    XCTAssertFalse(opened)
    XCTAssertEqual(wire(meta)?["delivery"] as? String, "action")
    XCTAssertEqual(wire(meta)?["effect"] as? String, "unconfirmed")
    XCTAssertNil(wire(meta)?["menuWindow"])
    XCTAssertGreaterThanOrEqual(wire(meta)?["ms"] as? Double ?? 0, popUpOpenSettleMs)
    XCTAssertGreaterThan(wire(meta)?["polls"] as? Int ?? 0, 1)
  }

  /// A messaging timeout from the press may still have opened the menu: the effect decides. Any other error is
  /// actionFailed.
  func testAnAmbiguousErrorIsJudgedByTheEffectAndAnyOtherFails() throws {
    let scene = textEdit()
    var meta = freshMeta()
    XCTAssertTrue(try click(decide(hit: scene.popup, recorded: scene.popup), meta: &meta) { _, _ in
      self.list = [self.menu, self.appWindow, self.person]
      return .cannotComplete
    })
    XCTAssertEqual(wire(meta)?["actionError"] as? Int, Int(AXError.cannotComplete.rawValue))
    XCTAssertEqual(wire(meta)?["effect"] as? String, "confirmed")
    list = [person, appWindow]
    var failed = freshMeta()
    XCTAssertThrowsError(try click(decide(hit: scene.popup, recorded: scene.popup), meta: &failed) { _, _ in .actionUnsupported }) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "actionFailed")
    }
  }

  // MARK: Refused

  /// TextEdit's font-size combo box, its arrow clicked with TextEdit behind: no element action opens it, so the click is
  /// refused with the ways through and nothing held, performed or posted. Frontmost, the posted click opens its list:
  /// main's. A click on its text is a click into a text field: main's, unrecorded.
  func testAComboBoxArrowBehindIsRefusedWithNothingSent() {
    let combo = Node("AXComboBox", frame: comboFrame, parent: Node("AXWindow"))
    combo.actions = []
    let arrow = CGPoint(x: 770, y: 81)
    let decision = decide(hit: combo, recorded: combo, at: arrow)
    guard case .refuse(let role) = decision else { return XCTFail("refused, not \(decision)") }
    XCTAssertEqual(role, "AXComboBox")
    var meta = freshMeta()
    XCTAssertThrowsError(try click(decision, meta: &meta, held: { XCTFail("nothing held") }) { _, _ in
      XCTFail("nothing performed")
      return .success
    }) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "backgroundClickRefused")
      XCTAssertEqual((error as? EngineError)?.message,
        "TextEdit's combo box opens its list only for a pointer click, and a click cua sends to TextEdit while it is not the frontmost app does not leave that list open; the combo box has no accessibility action that opens it. Nothing was sent. Ask the person to bring TextEdit to the front, or type the value into the combo box's text field instead (setValue on its element, or click its text and use typeText).")
    }
    XCTAssertNil(meta.startedAt, "nothing sent")
    XCTAssertEqual(wire(meta)?["refused"] as? String, "noAction")
    frontmost = true
    guard case .kept(.frontmost, _) = decide(hit: combo, recorded: combo, at: arrow) else { return XCTFail("frontmost: main's") }
    guard case .notPopUp = decide(hit: combo, recorded: combo, at: CGPoint(x: 730, y: 81)) else { return XCTFail("its text: main's") }
  }

  // MARK: Main's path

  /// Signals that disagree keep main's path and say so: a hit pop-up the record does not hold at the point
  /// (`notRecorded`), a recorded pop-up where the hit answers another element (`notHit`); so do a failed or late
  /// hit-test (`noSignal`, the record alone never taken), a disabled button and one already open. Nothing is held or
  /// performed, and the caller posts.
  func testDisagreeingSignalsOrALateOrFailedHitKeepMainsPath() throws {
    let scene = textEdit()
    let other = Node("AXPopUpButton", frame: buttonFrame, parent: scene.window)
    let button = Node("AXButton", frame: buttonFrame, parent: scene.window)
    let application = Node("AXApplication")
    var clock = 0.0
    let late = windowHit(application: application, window: scene.window, at: point,
                         elementAt: { _, _ in clock += pointHitSignalDeadlineMs + 1; return (.success, scene.popup) },
                         role: { $0.role }, parent: { $0.parent }, same: { $0 === $1 }, now: { clock })
    let failed = windowHit(application: application, window: scene.window, at: point, elementAt: { _, _ in (.cannotComplete, nil) },
                           role: { $0.role }, parent: { $0.parent }, same: { $0 === $1 }, now: { 0 })
    XCTAssertNil(late.answered)
    XCTAssertNil(failed.answered)
    let cases: [(PopUpPoint<Node>, PopUpKept)] = [
      (decide(hit: scene.popup, recorded: other), .notRecorded),
      (decide(hit: scene.popup, recorded: nil), .notRecorded),
      (decide(hit: button, recorded: scene.popup), .notHit),
      (decide(hit: late.answered, recorded: scene.popup), .noSignal),
      (decide(hit: failed.answered, recorded: scene.popup), .noSignal),
    ]
    for (decision, expected) in cases {
      guard case .kept(let why, _) = decision else { return XCTFail("kept, not \(decision)") }
      XCTAssertEqual(why, expected)
      var meta = freshMeta()
      XCTAssertFalse(try click(decision, meta: &meta, held: { XCTFail("nothing held") }) { _, _ in XCTFail("nothing performed"); return .success })
      XCTAssertEqual(wire(meta)?["kept"] as? String, expected.rawValue)
      XCTAssertNil(meta.inputRoute, "left to main's route")
    }
    XCTAssertEqual(listReads, 0, "no window list read on disagreement")
    scene.popup.enabled = false
    guard case .kept(.disabled, _) = decide(hit: scene.popup, recorded: scene.popup) else { return XCTFail("disabled: main's") }
    scene.popup.enabled = true
    scene.popup.expanded = true
    guard case .kept(.open, _) = decide(hit: scene.popup, recorded: scene.popup) else { return XCTFail("expanded: main's") }
    scene.popup.expanded = nil
    list = [menu, appWindow, person]
    guard case .kept(.open, _) = decide(hit: scene.popup, recorded: scene.popup) else { return XCTFail("its menu up: main's") }
  }

  /// A click on anything but a pop-up button (a button, a page's ARIA pop-up button whose menu is the page's own) is
  /// unchanged: main's, unrecorded, with no window list read.
  func testANonPopUpClickIsUnchanged() throws {
    let scene = textEdit()
    let button = Node("AXButton", frame: buttonFrame, parent: scene.window)
    let aria = Node("AXPopUpButton", frame: buttonFrame, parent: Node("AXWebArea", parent: scene.window))
    for (hit, recorded) in [(button, button), (aria, aria)] {
      let decision = decide(hit: hit, recorded: recorded)
      guard case .notPopUp = decision else { return XCTFail("main's, not \(decision)") }
      var meta = freshMeta()
      XCTAssertFalse(try click(decision, meta: &meta) { _, _ in XCTFail("nothing performed"); return .success })
      XCTAssertNil(meta.wire["popUpClick"])
    }
    XCTAssertEqual(listReads, 0)
  }

  /// An open pop-up's item stays #454's: the hit is an AXMenuItem, so #458 says nothing, even with the pop-up button
  /// recorded above the item, and #454's decision delivers the item.
  func testAnOpenPopUpsItemIsStillTheMenuItemPath() {
    let scene = textEdit()
    let menuNode = Node("AXMenu", parent: scene.popup)
    let item = Node("AXMenuItem", frame: CGRect(x: 535, y: 70, width: 159, height: 20), parent: menuNode)
    var verdict = StalePointVerdict<Node>(reason: .sameElement, node: recorded(item, depth: 3, ancestor: 1), current: item, point: point)
    verdict.nodes = [recorded(scene.popup, depth: 1), recorded(menuNode, depth: 2, ancestor: 0), recorded(item, depth: 3, ancestor: 1)]
    XCTAssertTrue(recordedAtPoint(verdict, roles: popUpRoles)?.element === scene.popup, "the pop-up recorded above the item")
    list = [menu, appWindow, person]
    let popUp = popUpPoint(hit: item, recorded: recordedAtPoint(verdict, roles: popUpRoles).map { ($0.element, $0.role) }, point: point,
                           pids: [app], reads: reads, frontmost: { false }, windows: { self.list })
    guard case .notPopUp = popUp else { return XCTFail("#458 says nothing, not \(popUp)") }
    let menuReads = MenuItemReads<Node>(role: { $0.role }, parent: { $0.parent }, enabled: { $0.enabled }, actions: { _ in ["AXPick"] },
                                        title: { _ in .absent }, value: { _ in .absent }, focused: { nil }, gone: { _ in false },
                                        same: { $0 === $1 })
    let item454 = menuItemPoint(hit: item, recorded: recordedMenuItems(verdict), reads: menuReads) {
      menuWindowOverPoint(self.point, target: self.observed, pids: [self.app], list: self.list)?.number
    }
    guard case .deliver(let target) = item454 else { return XCTFail("#454 delivers, not \(item454)") }
    XCTAssertEqual(target.action, "AXPick")
  }

  private func recorded(_ node: Node, depth: Int, ancestor: Int? = nil) -> ScreenshotNode<Node> {
    var recorded = ScreenshotNode(element: node, role: node.role, title: nil, description: nil, subrole: nil, value: nil,
                                  editableAncestor: nil, labelsUnread: [], frame: node.frame ?? .zero, shown: node.frame,
                                  depth: depth, subtreeRecorded: true)
    recorded.ancestor = ancestor
    return recorded
  }
}
