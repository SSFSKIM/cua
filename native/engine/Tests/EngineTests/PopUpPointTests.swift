import ApplicationServices
import CoreGraphics
import Foundation
import XCTest
@testable import Engine

// #458 (design rulings 977 and 979, PopUpPoint.swift): a kept coordinate click on a closed pop-up button, over fakes
// built from the shapes #458's kit measured (run 44877626226, results.json; scripts/probe-337/README.md §#458):
// - TextEdit's font pop-up: an AXPopUpButton in the document window, actions [AXShowMenu, AXPress], no AXExpanded, the
//   guard's `sameElement` on it; its menu a layer-101 window of TextEdit's over the button.
// - Chrome's `<select>` (416, 159, 57×19): an AXPopUpButton in the page, actions [AXPress, AXShowMenu,
//   AXScrollToVisible], AXExpanded false, and no AXMenu child while closed (`openerMenus: []`, 125/125 rows); the
//   deepest recorded node at the point is one of its options, an AXMenuItem under it (`hitAboveNode`, recorded role
//   AXMenuItem, 15/15). Pressed: AXExpanded true, an AXMenu child, and window 45 at layer 101, (404, 154, 77×82).
// - TextEdit's font-size combo box (715, 70, 52×22): an AXComboBox with actions [AXShowMenu, AXConfirm], AXExpanded false;
//   its arrow hit-tests and is recorded as an AXButton child of it (`sameElement`, 15/15).
// Finder's window lies in front of the app's observed window until a menu opens, which raises the app's above it.

final class PopUpPointTests: XCTestCase {
  private final class Node {
    let role: String
    var enabled: Bool? = true
    var actions: [String]? = ["AXShowMenu", "AXPress"]
    var frame: CGRect?
    var expanded: Bool?
    /// Its AXParent read fails now.
    var parentFails = false
    /// Runs as its AXExpanded is read (time passing in a read).
    var onExpandedRead: (() -> Void)?
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
  private let fontFrame = CGRect(x: 535, y: 70, width: 159, height: 22)
  private let fontPoint = CGPoint(x: 586, y: 81)
  private let selectFrame = CGRect(x: 416, y: 159, width: 57, height: 19)
  private let selectPoint = CGPoint(x: 445, y: 169)
  private let comboFrame = CGRect(x: 715, y: 70, width: 52, height: 22)
  private let arrowPoint = CGPoint(x: 760, y: 81)
  private lazy var person = ListedWindow(number: 40, owner: finder, layer: 0, bounds: CGRect(x: 0, y: 40, width: 380, height: 300))
  private lazy var appWindow = ListedWindow(number: observed, owner: app, layer: 0, bounds: CGRect(x: 400, y: 31, width: 620, height: 679))
  /// AppKit's menu, over the button.
  private lazy var fontMenu = ListedWindow(number: 77, owner: app, layer: menuWindowLayer, bounds: CGRect(x: 535, y: 44, width: 159, height: 660))
  /// Chrome's `<select>` list as measured.
  private lazy var selectMenu = ListedWindow(number: 45, owner: app, layer: menuWindowLayer, bounds: CGRect(x: 404, y: 154, width: 77, height: 82))
  /// The window list now (front to back; nil: the read fails), which a fake press changes; how often it was read.
  private lazy var list: [ListedWindow]? = [person, appWindow]
  private var listReads = 0
  private var frontmost = false

  private var reads: PopUpReads<Node> {
    PopUpReads(role: { $0.role }, parent: { $0.parentFails ? nil : $0.parent }, children: { $0.children }, enabled: { $0.enabled }, actions: { $0.actions },
               frame: { $0.frame }, expanded: { node in node.onExpandedRead?(); return node.expanded }, same: { $0 === $1 })
  }

  private func windows() -> [ListedWindow]? {
    listReads += 1
    return list
  }

  // MARK: Scenes, as measured

  /// TextEdit: window > font pop-up; the record holds the window and the pop-up, the guard's node the pop-up.
  private func font() -> (popup: Node, verdict: StalePointVerdict<Node>) {
    let window = Node("AXWindow")
    let popup = Node("AXPopUpButton", frame: fontFrame, parent: window)
    var verdict = StalePointVerdict<Node>(reason: .sameElement, node: recorded(popup, ancestor: 0), current: popup, point: fontPoint)
    verdict.nodes = [recorded(window), recorded(popup, ancestor: 0)]
    return (popup, verdict)
  }

  /// Chrome: window > AXWebArea > AXGroup > `<select>`, closed: no AXMenu child live; the record holds an option under it,
  /// the deepest node at the point (`hitAboveNode`).
  private func select() -> (popup: Node, verdict: StalePointVerdict<Node>) {
    let web = Node("AXWebArea", parent: Node("AXWindow"))
    let group = Node("AXGroup", parent: web)
    let popup = Node("AXPopUpButton", frame: selectFrame, parent: group)
    popup.actions = ["AXPress", "AXShowMenu", "AXScrollToVisible"]
    popup.expanded = false
    let option = Node("AXMenuItem", frame: CGRect(x: 416, y: 159, width: 57, height: 19))  // recorded, not a live child
    var verdict = StalePointVerdict<Node>(reason: .hitAboveNode, node: recorded(option, ancestor: 2), current: option, point: selectPoint)
    verdict.nodes = [recorded(web), recorded(group, ancestor: 0), recorded(popup, ancestor: 1), recorded(option, ancestor: 2)]
    return (popup, verdict)
  }

  /// TextEdit's font-size combo box: window > AXComboBox > AXButton (its arrow), the guard's node the arrow.
  private func combo() -> (combo: Node, arrow: Node, verdict: StalePointVerdict<Node>) {
    let window = Node("AXWindow")
    let box = Node("AXComboBox", frame: comboFrame, parent: window)
    box.actions = ["AXShowMenu", "AXConfirm"]
    box.expanded = false
    let arrow = Node("AXButton", frame: CGRect(x: 748, y: 70, width: 19, height: 22), parent: box)
    arrow.actions = ["AXPress"]
    var verdict = StalePointVerdict<Node>(reason: .sameElement, node: recorded(arrow, ancestor: 1), current: arrow, point: arrowPoint)
    verdict.nodes = [recorded(window), recorded(box, ancestor: 0), recorded(arrow, ancestor: 1)]
    return (box, arrow, verdict)
  }

  private func recorded(_ node: Node, ancestor: Int? = nil) -> ScreenshotNode<Node> {
    var recorded = ScreenshotNode(element: node, role: node.role, title: nil, description: nil, subrole: nil, value: nil,
                                  editableAncestor: nil, labelsUnread: [], frame: node.frame ?? .zero, shown: node.frame,
                                  depth: ancestor.map { $0 + 1 } ?? 0, subtreeRecorded: true)
    recorded.ancestor = ancestor
    return recorded
  }

  private func freshMeta() -> InputMeta {
    InputMeta(ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
  }

  private func decide(hit: Node?, _ verdict: StalePointVerdict<Node>, at point: CGPoint) -> PopUpPoint<Node> {
    popUpPoint(hit: hit, recorded: recordedPopUp(verdict, same: { $0 === $1 }), point: point, pids: [app], reads: reads,
               frontmost: { self.frontmost }, windows: windows)
  }

  /// The click carried out over a fake clock: `held` runs as the hold does, `onPress` as the AXPress is performed.
  private func click(_ decision: PopUpPoint<Node>, route: InputRoute = .activation, meta: inout InputMeta,
                     deadlinePassed: @escaping () -> Bool = { false }, held: @escaping () -> Void = {},
                     opened: @escaping (PopUpMenuOrder?) -> Void = { _ in },
                     onPress: @escaping (Node, String) -> AXError) throws -> Bool {
    var clock = 0.0
    return try popUpClick(decision, app: "TextEdit", route: route, appWindow: observed, pids: [app], ownPid: 999, reads: reads,
                          windows: { self.list }, now: { clock }, sleep: { clock += $0 }, deadlinePassed: deadlinePassed,
                          hold: { _, _ in held() }, checkInFlight: {}, perform: onPress, opened: opened, meta: &meta)
  }

  private func wire(_ meta: InputMeta) -> [String: Any]? { meta.wire["popUpClick"] as? [String: Any] }

  // MARK: Delivered

  /// TextEdit's font pop-up behind Finder: the hit and the record name the same enabled closed button, so the click is its
  /// AXPress after the hold, with nothing posted (the caller returns on `true`), confirmed once a menu window of the app's
  /// appears over the button. The open raised the app's window above Finder's, so the order to put back is recorded.
  func testAnAgreeingClosedPopUpIsItsAXPressWithNothingPostedConfirmedWhenItsMenuWindowAppears() throws {
    let scene = font()
    let decision = decide(hit: scene.popup, scene.verdict, at: fontPoint)
    guard case .press(let target) = decision else { return XCTFail("pressed, not \(decision)") }
    XCTAssertTrue(target.element === scene.popup)
    var performed: [String] = []
    var held = 0
    var order: PopUpMenuOrder?
    var meta = freshMeta()
    let carried = try click(decision, meta: &meta, held: { held += 1 }, opened: { order = $0 }) { button, action in
      XCTAssertTrue(button === scene.popup)
      performed.append(action)
      self.list = [self.fontMenu, self.appWindow, self.person]
      return .success
    }
    XCTAssertTrue(carried, "carried: the caller posts no pointer event")
    XCTAssertEqual(performed, ["AXPress"])
    XCTAssertEqual(held, 1)
    XCTAssertEqual(meta.inputRoute, .activation)
    XCTAssertNotNil(meta.startedAt, "the action's interval")
    XCTAssertEqual(wire(meta)?["delivery"] as? String, "action")
    XCTAssertEqual(wire(meta)?["effect"] as? String, "confirmed")
    XCTAssertEqual(wire(meta)?["menuWindow"] as? Int, 77)
    XCTAssertEqual(wire(meta)?["raisedAppWindow"] as? Bool, true)
    XCTAssertEqual(order, PopUpMenuOrder(menuWindow: 77, appWindow: observed, personWindow: 40, personPid: finder))
  }

  /// Chrome's `<select>` as measured, dedicated mode: closed it has no AXMenu child, and the record's option under it is
  /// the evidence that it is a `<select>`; pressed, its list opens below it (window 45) and the AXMenu child appears.
  func testChromesClosedSelectIsQualifiedByItsRecordedOptionAndConfirmedByItsList() throws {
    let scene = select()
    XCTAssertTrue(scene.popup.children.isEmpty, "measured: no AXMenu child while closed")
    let recorded = recordedPopUp(scene.verdict, same: { $0 === $1 })
    XCTAssertTrue(recorded?.element === scene.popup)
    XCTAssertEqual(recorded?.holdsOption, true)
    XCTAssertEqual(recorded?.inRecordedWebArea, true)
    let decision = decide(hit: scene.popup, scene.verdict, at: selectPoint)
    guard case .press = decision else { return XCTFail("pressed, not \(decision)") }
    var meta = freshMeta()
    XCTAssertTrue(try click(decision, meta: &meta) { button, _ in
      button.expanded = true
      _ = Node("AXMenu", parent: button)
      self.list = [self.selectMenu, self.appWindow, self.person]
      return .success
    })
    XCTAssertEqual(wire(meta)?["menuWindow"] as? Int, 45)
    XCTAssertEqual(wire(meta)?["effect"] as? String, "confirmed")
  }

  /// The app frontmost by route 1: confirmed, and no order to put back (the app's window was in front already).
  func testAFrontmostOpenRecordsNoOrder() throws {
    let scene = font()
    list = [appWindow, person]
    var order: PopUpMenuOrder? = PopUpMenuOrder(menuWindow: 1, appWindow: 1, personWindow: 1, personPid: 1)
    var meta = freshMeta()
    XCTAssertTrue(try click(decide(hit: scene.popup, scene.verdict, at: fontPoint), route: .action, meta: &meta, opened: { order = $0 }) { _, _ in
      self.list = [self.fontMenu, self.appWindow, self.person]
      return .success
    })
    XCTAssertEqual(meta.inputRoute, .action)
    XCTAssertEqual(wire(meta)?["raisedAppWindow"] as? Bool, false)
    XCTAssertNil(order, "nothing to put back: the app's entry is cleared")
  }

  // MARK: Unconfirmed

  /// The action's return is not proof: with no new menu window of the app's at the button, the press answers
  /// clickUnconfirmed after the settle; a far one, another app's, or one up before the press does not count.
  func testNoMenuWindowAppearingAnswersClickUnconfirmed() {
    let scene = font()
    let earlier = ListedWindow(number: 60, owner: app, layer: menuWindowLayer, bounds: CGRect(x: 900, y: 600, width: 50, height: 50))
    list = [earlier, person, appWindow]
    var meta = freshMeta()
    var opened = false
    XCTAssertThrowsError(try click(decide(hit: scene.popup, scene.verdict, at: fontPoint), meta: &meta, opened: { _ in opened = true }) { _, _ in
      self.list = [
        ListedWindow(number: 61, owner: self.app, layer: menuWindowLayer, bounds: CGRect(x: 40, y: 600, width: 50, height: 50)),
        ListedWindow(number: 62, owner: 777, layer: menuWindowLayer, bounds: self.fontFrame),
        ListedWindow(number: 60, owner: self.app, layer: menuWindowLayer, bounds: self.fontFrame),
        self.person, self.appWindow,
      ]
      return .success
    }) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "clickUnconfirmed")
      XCTAssertEqual((error as? EngineError)?.message,
        "The click could not be confirmed: it was carried by the pop-up button's AXPress action in TextEdit, since a posted click can close the menu it opens, and no menu was seen to open at the button. Observe the app with get_app_state before any retry, and never retry blindly.")
    }
    XCTAssertFalse(opened)
    XCTAssertEqual(wire(meta)?["effect"] as? String, "unconfirmed")
    XCTAssertGreaterThanOrEqual(wire(meta)?["ms"] as? Double ?? 0, popUpOpenSettleMs)
  }

  /// A messaging timeout from the press is judged by the effect; any other error is actionFailed.
  func testAnAmbiguousErrorIsJudgedByTheEffectAndAnyOtherFails() throws {
    let scene = font()
    var meta = freshMeta()
    XCTAssertTrue(try click(decide(hit: scene.popup, scene.verdict, at: fontPoint), meta: &meta) { _, _ in
      self.list = [self.fontMenu, self.appWindow, self.person]
      return .cannotComplete
    })
    XCTAssertEqual(wire(meta)?["actionError"] as? Int, Int(AXError.cannotComplete.rawValue))
    list = [person, appWindow]
    var failed = freshMeta()
    XCTAssertThrowsError(try click(decide(hit: scene.popup, scene.verdict, at: fontPoint), meta: &failed) { _, _ in .actionUnsupported }) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "actionFailed")
    }
  }

  /// A window list that does not read is never taken for "no menu" (review item 6): unread at the decision, main's path
  /// is kept (`windowsUnread`), nothing read further; unread just before the press, the press goes and answers
  /// clickUnconfirmed with `baselineUnread`, even when a menu then shows; a poll that fails is a sample with nothing
  /// seen, and a later read still confirms.
  func testAnUnreadWindowListIsNeverProofOfClosedOrOfANewMenu() throws {
    let scene = font()
    list = nil
    guard case .kept(.windowsUnread, _) = decide(hit: scene.popup, scene.verdict, at: fontPoint) else { return XCTFail("main's: unread") }
    list = [person, appWindow]
    let decision = decide(hit: scene.popup, scene.verdict, at: fontPoint)
    var meta = freshMeta()
    XCTAssertThrowsError(try click(decision, meta: &meta, held: { self.list = nil }) { _, _ in
      self.list = [self.fontMenu, self.appWindow, self.person]
      return .success
    }) { XCTAssertEqual(($0 as? EngineError)?.errorName, "clickUnconfirmed") }
    XCTAssertNotNil(meta.startedAt, "pressed")
    XCTAssertEqual(wire(meta)?["baselineUnread"] as? Bool, true)
    XCTAssertNil(wire(meta)?["menuWindow"])
    list = [person, appWindow]
    var later = freshMeta()
    var pressed = false
    var reads = 0
    var clock = 0.0
    XCTAssertTrue(try popUpClick(decision, app: "TextEdit", route: .action, appWindow: observed, pids: [app], ownPid: 999, reads: self.reads,
                                 windows: {
      reads += 1
      guard pressed else { return self.list }
      return reads == 2 ? nil : [self.fontMenu, self.appWindow, self.person]
    }, now: { clock }, sleep: { clock += $0 }, hold: { _, _ in }, checkInFlight: {}, perform: { _, _ in pressed = true; return .success },
                                 opened: { _ in }, meta: &later))
    XCTAssertEqual(wire(later)?["polls"] as? Int, 2, "the failed read a sample, the next confirming")
  }

  /// The decision's list is read before the hold; just before the press (after it) the deadline is checked again and
  /// the button must still read closed (review items 5 and 7): a menu of the app's at the button opened during the hold
  /// refuses with nothing pressed, as does an AXExpanded now true; a deadline passed during the hold is timeoutReached,
  /// nothing pressed. A same-app window that appeared elsewhere during the hold is in the baseline, never the effect.
  func testTheCheckJustBeforeThePressRunsAfterTheHold() throws {
    let scene = font()
    for during in ["menu", "expanded", "deadline"] {
      list = [person, appWindow]
      scene.popup.expanded = nil
      var passed = false
      var meta = freshMeta()
      XCTAssertThrowsError(try click(decide(hit: scene.popup, scene.verdict, at: fontPoint), meta: &meta, deadlinePassed: { passed }, held: {
        switch during {
        case "menu": self.list = [self.fontMenu, self.person, self.appWindow]
        case "expanded": scene.popup.expanded = true
        default: passed = true
        }
      }) { _, _ in XCTFail("not pressed (\(during))"); return .success }) { error in
        XCTAssertEqual((error as? EngineError)?.errorName, during == "deadline" ? "timeoutReached" : "screenChangedSinceScreenshot")
      }
      XCTAssertNil(meta.startedAt, "nothing pressed (\(during))")
    }
    scene.popup.expanded = nil
    list = [person, appWindow]
    let panel = ListedWindow(number: 90, owner: app, layer: menuWindowLayer, bounds: CGRect(x: 700, y: 400, width: 200, height: 200))
    var meta = freshMeta()
    XCTAssertThrowsError(try click(decide(hit: scene.popup, scene.verdict, at: fontPoint), meta: &meta, held: {
      self.list = [panel, self.person, self.appWindow]
    }) { _, _ in
      // The panel grows over the button: it was there before the press, so it is not the press's menu.
      self.list = [ListedWindow(number: 90, owner: self.app, layer: menuWindowLayer, bounds: self.fontFrame), self.person, self.appWindow]
      return .success
    }) { XCTAssertEqual(($0 as? EngineError)?.errorName, "clickUnconfirmed") }
  }

  /// The baseline holds every window the list held before the press (re-review item 5): one of the app's then hidden
  /// (alpha 0) or at another layer that shows at the menu layer at the button after it is not the press's menu.
  func testAWindowInTheBaselineThatLaterShowsAsAMenuIsNotThePressesMenu() {
    let scene = font()
    for hidden in [ListedWindow(number: 91, owner: app, layer: menuWindowLayer, bounds: fontFrame, alpha: 0),
                   ListedWindow(number: 92, owner: app, layer: 0, bounds: CGRect(x: 900, y: 600, width: 10, height: 10))] {
      list = [hidden, person, appWindow]
      var meta = freshMeta()
      XCTAssertThrowsError(try click(decide(hit: scene.popup, scene.verdict, at: fontPoint), meta: &meta) { _, _ in
        self.list = [ListedWindow(number: hidden.number, owner: self.app, layer: menuWindowLayer, bounds: self.fontFrame), self.appWindow, self.person]
        return .success
      }) { XCTAssertEqual(($0 as? EngineError)?.errorName, "clickUnconfirmed", "window \(hidden.number)") }
    }
  }

  /// The deadline is checked after the last read before the press (re-review item 6): passed during the AXExpanded or
  /// window-list read, the press is timeoutReached with nothing pressed, on the unread-baseline path too.
  func testTheDeadlineIsCheckedAfterTheLastReadBeforeThePress() {
    let scene = font()
    for unread in [false, true] {
      list = [person, appWindow]
      let decision = decide(hit: scene.popup, scene.verdict, at: fontPoint)
      var passed = false
      scene.popup.onExpandedRead = {
        passed = true
        if unread { self.list = nil }
      }
      defer { scene.popup.onExpandedRead = nil }
      var meta = freshMeta()
      XCTAssertThrowsError(try click(decision, meta: &meta, deadlinePassed: { passed }) { _, _ in XCTFail("not pressed"); return .success }) {
        XCTAssertEqual(($0 as? EngineError)?.errorName, "timeoutReached", "unread baseline \(unread)")
      }
      XCTAssertNil(meta.startedAt)
    }
  }

  // MARK: Refused

  /// TextEdit's font-size combo box as measured: its arrow is an AXButton child, hit and recorded alike, resolved to the
  /// combo box, which has no action that opens it; with TextEdit behind the click is refused with nothing held,
  /// performed or sent. Frontmost, the posted click opens its list: main's. A hit on the combo box itself is its text:
  /// main's, unrecorded.
  func testAComboBoxArrowBehindIsRefusedWithNothingSent() {
    let scene = combo()
    let decision = decide(hit: scene.arrow, scene.verdict, at: arrowPoint)
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
    guard case .kept(.frontmost, _) = decide(hit: scene.arrow, scene.verdict, at: arrowPoint) else { return XCTFail("frontmost: main's") }
    var text = StalePointVerdict<Node>(reason: .sameElement, node: recorded(scene.combo, ancestor: 0), current: scene.combo,
                                       point: CGPoint(x: 730, y: 81))
    text.nodes = scene.verdict.nodes
    guard case .notPopUp = decide(hit: scene.combo, text, at: CGPoint(x: 730, y: 81)) else { return XCTFail("its text: main's") }
  }

  // MARK: Main's path

  /// Signals that disagree keep main's path and say so (`notRecorded`, `notHit`); so do a failed or late hit-test
  /// (`noSignal`, the record alone never taken), a disabled button and one already open. Nothing is held or performed.
  func testDisagreeingSignalsOrALateOrFailedHitKeepMainsPath() throws {
    let scene = font()
    let other = Node("AXPopUpButton", frame: fontFrame, parent: scene.popup.parent)
    let button = Node("AXButton", frame: fontFrame, parent: scene.popup.parent)
    let application = Node("AXApplication")
    var clock = 0.0
    let late = windowHit(application: application, window: scene.popup.parent!, at: fontPoint,
                         elementAt: { _, _ in clock += pointHitSignalDeadlineMs + 1; return (.success, scene.popup) },
                         role: { $0.role }, parent: { $0.parent }, same: { $0 === $1 }, now: { clock })
    let failed = windowHit(application: application, window: scene.popup.parent!, at: fontPoint, elementAt: { _, _ in (.cannotComplete, nil) },
                           role: { $0.role }, parent: { $0.parent }, same: { $0 === $1 }, now: { 0 })
    XCTAssertNil(late.answered)
    XCTAssertNil(failed.answered)
    let unrecorded = StalePointVerdict<Node>(reason: .unrecorded)
    let cases: [(PopUpPoint<Node>, PopUpKept)] = [
      (decide(hit: other, scene.verdict, at: fontPoint), .notRecorded),
      (decide(hit: scene.popup, unrecorded, at: fontPoint), .notRecorded),
      (decide(hit: button, scene.verdict, at: fontPoint), .notHit),
      (decide(hit: late.answered, scene.verdict, at: fontPoint), .noSignal),
      (decide(hit: failed.answered, scene.verdict, at: fontPoint), .noSignal),
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
    guard case .kept(.disabled, _) = decide(hit: scene.popup, scene.verdict, at: fontPoint) else { return XCTFail("disabled") }
    scene.popup.enabled = true
    scene.popup.expanded = true
    guard case .kept(.open, _) = decide(hit: scene.popup, scene.verdict, at: fontPoint) else { return XCTFail("expanded") }
    scene.popup.expanded = nil
    list = [fontMenu, appWindow, person]
    guard case .kept(.open, _) = decide(hit: scene.popup, scene.verdict, at: fontPoint) else { return XCTFail("its menu up") }
  }

  /// A pop-up whose parents do not read to its window (review item 4) is not taken as native: with no web area in the
  /// record, main's path (`ancestryUnread`); with the record's web area above it, a page's control, which is a `<select>`
  /// only with its options recorded under it.
  func testAnUnreadAncestryIsNotNative() {
    let scene = font()
    scene.popup.parentFails = true
    guard case .kept(.ancestryUnread, _) = decide(hit: scene.popup, scene.verdict, at: fontPoint) else { return XCTFail("unread: main's") }
    let page = select()
    page.popup.parent?.parentFails = true
    guard case .press = decide(hit: page.popup, page.verdict, at: selectPoint) else { return XCTFail("the record's web area, its option recorded") }
    var aria = page.verdict
    aria.nodes.removeLast()
    aria.node = aria.nodes[2]
    aria.current = page.popup
    guard case .notPopUp = decide(hit: page.popup, aria, at: selectPoint) else { return XCTFail("a page's own pop-up: main's") }
  }

  /// A click on anything but a pop-up button (a button, a page's ARIA pop-up button with no option recorded under it) is
  /// unchanged: main's, unrecorded, with no window list read.
  func testANonPopUpClickIsUnchanged() throws {
    let scene = font()
    let button = Node("AXButton", frame: fontFrame, parent: scene.popup.parent)
    var onButton = StalePointVerdict<Node>(reason: .sameElement, node: recorded(button, ancestor: 0), current: button, point: fontPoint)
    onButton.nodes = [recorded(scene.popup.parent!), recorded(button, ancestor: 0)]
    let page = select()
    var aria = page.verdict
    aria.nodes.removeLast()
    aria.node = aria.nodes[2]
    aria.current = page.popup
    for (hit, verdict, point) in [(button, onButton, fontPoint), (page.popup, aria, selectPoint)] {
      let decision = decide(hit: hit, verdict, at: point)
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
    let scene = font()
    let menuNode = Node("AXMenu", parent: scene.popup)
    let item = Node("AXMenuItem", frame: CGRect(x: 535, y: 70, width: 159, height: 20), parent: menuNode)
    var verdict = StalePointVerdict<Node>(reason: .sameElement, node: recorded(item, ancestor: 2), current: item, point: fontPoint)
    verdict.nodes = scene.verdict.nodes + [recorded(menuNode, ancestor: 1), recorded(item, ancestor: 2)]
    XCTAssertTrue(recordedPopUp(verdict, same: { $0 === $1 })?.element === scene.popup, "the pop-up recorded above the item")
    list = [fontMenu, appWindow, person]
    guard case .notPopUp = decide(hit: item, verdict, at: fontPoint) else { return XCTFail("#458 says nothing") }
    let menuReads = MenuItemReads<Node>(role: { $0.role }, parent: { $0.parent }, enabled: { $0.enabled }, actions: { _ in ["AXPick"] },
                                        title: { _ in .absent }, value: { _ in .absent }, focused: { nil }, gone: { _ in false },
                                        same: { $0 === $1 })
    let item454 = menuItemPoint(hit: item, recorded: recordedMenuItems(verdict), reads: menuReads) {
      menuWindowOverPoint(self.fontPoint, target: self.observed, pids: [self.app], list: self.list ?? [])?.number
    }
    guard case .deliver(let target) = item454 else { return XCTFail("#454 delivers, not \(item454)") }
    XCTAssertEqual(target.action, "AXPick")
  }

  // MARK: #282's route

  /// Chrome's `<select>` in a shared-mode page behind is #282's element route (review item 3): it delivers as before, and
  /// on the button the same check runs just before its press, then the effect: confirmed with the order recorded, or
  /// clickUnconfirmed when no list opens; a route that pressed another control answers as #282's alone. The press goes
  /// through `deliverAction` as #282's does: a messaging timeout with the list open is judged by the list (re-review
  /// item 2), on another control it is still actionFailed, and any other error is actionFailed.
  func testAWebAreaRoutesSelectPressGetsTheSameEffectCheckAndOrder() throws {
    let scene = select()
    guard case .press(let target) = decide(hit: scene.popup, scene.verdict, at: selectPoint) else { return XCTFail("qualifies") }
    func run(pressing: Node, opens: Bool, answer: AXError = .success, meta: inout InputMeta,
             opened: @escaping (PopUpMenuOrder?) -> Void = { _ in }) throws {
      list = [person, appWindow]
      var clock = 0.0
      try popUpConfirmingRoute(target, app: "Google Chrome", appWindow: observed, pids: [app], ownPid: 999, reads: reads,
                               windows: { self.list }, now: { clock }, sleep: { clock += $0 }, opened: opened,
                               route: { beforePress, tolerates, meta in
        // #282's route: its hold, then its final checks on the control it presses, then the press.
        try beforePress(pressing, &meta)
        try withoutActuallyEscaping(tolerates) { judge in
          try deliverAction("AXPress", tolerates: judge, perform: { _ in
            if opens { self.list = [self.selectMenu, self.appWindow, self.person] }
            return answer
          }, meta: &meta)
        }
      }, meta: &meta)
    }
    var order: PopUpMenuOrder?
    var meta = freshMeta()
    try run(pressing: scene.popup, opens: true, meta: &meta, opened: { order = $0 })
    XCTAssertEqual(wire(meta)?["effect"] as? String, "confirmed")
    XCTAssertEqual(order, PopUpMenuOrder(menuWindow: 45, appWindow: observed, personWindow: 40, personPid: finder))
    var none = freshMeta()
    XCTAssertThrowsError(try run(pressing: scene.popup, opens: false, meta: &none)) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "clickUnconfirmed")
    }
    var timedOut = freshMeta()
    try run(pressing: scene.popup, opens: true, answer: .cannotComplete, meta: &timedOut)
    XCTAssertEqual(wire(timedOut)?["effect"] as? String, "confirmed", "the observed list decides")
    XCTAssertEqual(wire(timedOut)?["actionError"] as? Int, Int(AXError.cannotComplete.rawValue))
    var refused = freshMeta()
    XCTAssertThrowsError(try run(pressing: scene.popup, opens: false, answer: .actionUnsupported, meta: &refused)) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "actionFailed")
    }
    var other = freshMeta()
    XCTAssertNoThrow(try run(pressing: Node("AXCheckBox"), opens: false, meta: &other))
    XCTAssertNil(other.wire["popUpClick"], "another control pressed: #282's answer alone")
    var otherTimedOut = freshMeta()
    XCTAssertThrowsError(try run(pressing: Node("AXCheckBox"), opens: false, answer: .cannotComplete, meta: &otherTimedOut)) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "actionFailed", "another control's timeout is #282's")
    }
  }

  /// A page pop-up whose recorded AXMenuItems lie off the point (parked offscreen, the deepest node at the point the
  /// pop-up itself) is no `<select>` by the measured shape (re-review item 3): main's path.
  func testAPagePopUpWithItsRecordedItemsOffThePointKeepsMainsPath() {
    let scene = select()
    var parked = StalePointVerdict<Node>(reason: .sameElement, node: scene.verdict.nodes[2], current: scene.popup, point: selectPoint)
    parked.nodes = Array(scene.verdict.nodes.prefix(3)) + [
      recorded(Node("AXMenuItem", frame: CGRect(x: -2000, y: -2000, width: 57, height: 19)), ancestor: 2),
      recorded(Node("AXMenuItem", frame: CGRect(x: -2000, y: -1981, width: 57, height: 19)), ancestor: 2),
    ]
    XCTAssertEqual(recordedPopUp(parked, same: { $0 === $1 })?.holdsOption, false)
    guard case .notPopUp = decide(hit: scene.popup, parked, at: selectPoint) else { return XCTFail("main's path") }
  }

  /// A combo box's other child button (a clear button at its leading edge) is not its arrow (re-review item 4): it keeps
  /// its own click, while the trailing one is still the arrow; with frames unread only a lone button child counts.
  func testOnlyTheComboBoxsTrailingButtonIsItsArrow() {
    let scene = combo()
    let clear = Node("AXButton", frame: CGRect(x: 717, y: 72, width: 16, height: 18), parent: scene.combo)
    var onClear = StalePointVerdict<Node>(reason: .sameElement, node: recorded(clear, ancestor: 1), current: clear, point: CGPoint(x: 724, y: 81))
    onClear.nodes = scene.verdict.nodes + [recorded(clear, ancestor: 1)]
    XCTAssertNil(popUpControl(clear, reads: reads))
    if case .refuse = decide(hit: clear, onClear, at: CGPoint(x: 724, y: 81)) { XCTFail("the clear button keeps its own click") }
    guard case .refuse = decide(hit: scene.arrow, scene.verdict, at: arrowPoint) else { return XCTFail("the trailing arrow") }
    scene.arrow.frame = nil
    XCTAssertNil(popUpControl(scene.arrow, reads: reads), "frames unread and two buttons: none is taken")
    scene.combo.children.removeAll { $0 === clear }
    XCTAssertNotNil(popUpControl(scene.arrow, reads: reads), "frames unread, the lone button")
  }
}
