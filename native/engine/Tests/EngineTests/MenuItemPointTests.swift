import ApplicationServices
import CoreGraphics
import Foundation
import XCTest
@testable import Engine

// #454 (design ruling 946, MenuItemPoint.swift): a kept coordinate click on an open menu's item, over fakes shaped as the
// measurement found the menus (kit `probe/454-measure`, README 4d87ff55): TextEdit's font pop-up, whose AXMenu hangs
// under its pop-up button inside the document window and whose item the guard keeps as `sameElement`; Chrome's
// `<select>`, whose AXMenu has no parent and whose item the record holds beneath the page's group (`underlyingRole`).
// Each menu is a window of the app's own at layer 101 over the point.

final class MenuItemPointTests: XCTestCase {
  private final class Node {
    let role: String
    var title: String?
    var value: String?
    var enabled: Bool? = true
    var actions: [String]? = ["AXCancel", "AXPress", "AXPick"]
    var gone = false
    weak var parent: Node?
    var children: [Node] = []

    init(_ role: String, title: String? = nil, value: String? = nil, parent: Node? = nil) {
      self.role = role
      self.title = title
      self.value = value
      if let parent { self.parent = parent; parent.children.append(self) }
    }
  }

  private let app: pid_t = 501
  private let point = CGPoint(x: 615, y: 104)
  private let observed: CGWindowID = 28
  private let menuWindow = ListedWindow(number: 77, owner: 501, layer: menuWindowLayer, bounds: CGRect(x: 535, y: 44, width: 159, height: 660))
  private var focused: Node?
  /// How often the decision read the window list.
  private var listReads = 0

  private var reads: MenuItemReads<Node> {
    MenuItemReads(role: { $0.role }, parent: { $0.parent }, enabled: { $0.enabled }, actions: { $0.actions }, title: { $0.title },
                  value: { $0.value }, focused: { [unowned self] in self.focused }, gone: { $0.gone }, same: { $0 === $1 })
  }

  private func observedWindow(_ number: CGWindowID = 28) -> ListedWindow {
    ListedWindow(number: number, owner: 501, layer: 0, bounds: CGRect(x: 400, y: 31, width: 620, height: 679))
  }

  /// A recorded node of the observation, as `ScreenshotNode` holds it.
  private func recordedNode(_ node: Node, depth: Int, ancestor: Int? = nil) -> ScreenshotNode<Node> {
    var recorded = ScreenshotNode(element: node, role: node.role, title: node.title, description: nil, subrole: nil, value: nil,
                                  editableAncestor: nil, labelsUnread: [], frame: CGRect(x: 535, y: 90, width: 159, height: 20),
                                  shown: CGRect(x: 535, y: 90, width: 159, height: 20), depth: depth, subtreeRecorded: true)
    recorded.ancestor = ancestor
    return recorded
  }

  /// TextEdit's font pop-up: window > pop-up button "Helvetica" > AXMenu > items.
  private func textEdit() -> (popup: Node, menu: Node, times: Node, helvetica: Node) {
    let window = Node("AXWindow")
    let popup = Node("AXPopUpButton", value: "Helvetica", parent: window)
    let menu = Node("AXMenu", parent: popup)
    let helvetica = Node("AXMenuItem", title: "Helvetica", parent: menu)
    let times = Node("AXMenuItem", title: "Times", parent: menu)
    return (popup, menu, times, helvetica)
  }

  private func freshMeta() -> InputMeta {
    InputMeta(ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
  }

  /// The decision with the menu window listed, counting the list's reads.
  private func decide(hit: Node?, recorded: Node?, list: [ListedWindow]? = nil) -> MenuItemPoint<Node> {
    menuItemPoint(hit: hit, recorded: recorded, reads: reads) {
      self.listReads += 1
      return menuWindowOverPoint(point, target: observed, pids: [app], list: list ?? [menuWindow, observedWindow()])?.number
    }
  }

  /// The click carried out over a fake clock: `onAction` runs as the item's action is performed (the app taking it).
  private func click(_ decision: MenuItemPoint<Node>, shown: @escaping (CGWindowID) -> Bool, meta: inout InputMeta,
                     onAction: @escaping (Node, String) -> AXError) throws -> Bool {
    var clock = 0.0
    return try menuItemClick(decision, app: "TextEdit", reads: reads, menuWindowShown: shown, now: { clock }, sleep: { clock += $0 },
                             checkInFlight: {}, perform: onAction, meta: &meta)
  }

  private func wire(_ meta: InputMeta) -> [String: Any]? { meta.wire["menuItemClick"] as? [String: Any] }

  // MARK: Delivered

  /// TextEdit's font menu (the guard's `sameElement`): the hit and the record name the same enabled item, so the click is
  /// the item's AXPick by route 1, carried with nothing posted (the caller returns on `true`), and confirmed once the
  /// menu's window has left the list and the pop-up button reads the item.
  func testAnAgreeingItemIsItsActionWithNothingPostedConfirmedByTheMenuClosingOnTheItem() throws {
    let scene = textEdit()
    let decision = decide(hit: scene.times, recorded: scene.times)
    guard case .deliver(let target) = decision else { return XCTFail("delivered, not \(decision)") }
    XCTAssertEqual(target.action, "AXPick")
    XCTAssertEqual(target.window, 77)
    var performed: [String] = []
    var open = true
    var meta = freshMeta()
    let carried = try click(decision, shown: { $0 == 77 && open }, meta: &meta) { item, action in
      XCTAssertTrue(item === scene.times)
      performed.append(action)
      scene.popup.value = "Times"
      open = false
      return .success
    }
    XCTAssertTrue(carried, "carried: the caller posts no pointer event")
    XCTAssertEqual(performed, ["AXPick"])
    XCTAssertEqual(meta.inputRoute, .action)
    XCTAssertNotNil(meta.startedAt, "the action's interval")
    XCTAssertEqual(wire(meta)?["delivery"] as? String, "action")
    XCTAssertEqual(wire(meta)?["action"] as? String, "AXPick")
    XCTAssertEqual(wire(meta)?["effect"] as? String, "confirmed")
    XCTAssertEqual(wire(meta)?["menuClosed"] as? Bool, true)
    XCTAssertEqual(wire(meta)?["value"] as? String, "taken")
    XCTAssertEqual(wire(meta)?["polls"] as? Int, 1)
    XCTAssertEqual(wire(meta)?["menuWindow"] as? Int, 77)
  }

  /// Chrome's `<select>` (the guard's `noHit`): main's hit is none, its menu's chain reaching no window, but the hit-test
  /// answered the item (`answered`), which is the record's control beneath the page's group; the menu has no parent, so
  /// the `<select>` the focus returns to shows the item. An item advertising only AXPress gets AXPress.
  func testChromesSelectMenuItemIsTakenFromTheRecordBeneathThePageAndConfirmedByTheFocusedSelect() throws {
    let application = Node("AXApplication")
    let window = Node("AXWindow", parent: application)
    let group = Node("AXGroup", parent: Node("AXWebArea", parent: window))
    let select = Node("AXPopUpButton", value: "One", parent: group)
    let menu = Node("AXMenu")  // app-level, no parent
    let three = Node("AXMenuItem", title: "Three", parent: menu)
    three.actions = ["AXPress"]
    let hit = windowHit(application: application, window: window, at: point, elementAt: { _, _ in (.success, three) }, role: { $0.role },
                        parent: { $0.parent }, same: { $0 === $1 }, now: { 0 })
    XCTAssertNil(hit.element, "main's hit: none")
    XCTAssertEqual(hit.place, .unread)
    XCTAssertTrue(hit.answered === three)
    var verdict = StalePointVerdict<Node>(reason: .noHit, node: recordedNode(group, depth: 12), point: point)
    verdict.underlying = recordedNode(three, depth: 9)
    XCTAssertTrue(recordedMenuItem(verdict) === three)
    let decision = decide(hit: hit.answered, recorded: recordedMenuItem(verdict))
    guard case .deliver(let target) = decision else { return XCTFail("delivered, not \(decision)") }
    XCTAssertEqual(target.action, "AXPress")
    focused = three
    var open = true
    var meta = freshMeta()
    XCTAssertTrue(try click(decision, shown: { _ in open }, meta: &meta) { _, _ in
      select.value = "Three"
      self.focused = select
      open = false
      return .success
    })
    XCTAssertEqual(wire(meta)?["effect"] as? String, "confirmed")
  }

  /// The recorded item is the node itself (its handle as found now), a recorded AXMenuItem above the node, or #433's
  /// control beneath it; none of those, none.
  func testTheRecordedItemIsTheNodeAnItemAboveItOrTheControlBeneath() {
    let scene = textEdit()
    XCTAssertTrue(recordedMenuItem(StalePointVerdict(reason: .sameElement, node: recordedNode(scene.times, depth: 3), current: scene.times)) === scene.times)
    let icon = Node("AXImage", parent: scene.times)
    let nodes = [recordedNode(scene.menu, depth: 2), recordedNode(scene.times, depth: 3, ancestor: 0), recordedNode(icon, depth: 4, ancestor: 1)]
    var inside = StalePointVerdict<Node>(reason: .nonInteractiveHit, node: nodes[2], point: point)
    inside.nodes = nodes
    XCTAssertTrue(recordedMenuItem(inside) === scene.times)
    var page = StalePointVerdict<Node>(reason: .noHit, node: recordedNode(Node("AXGroup"), depth: 12), point: point)
    XCTAssertNil(recordedMenuItem(page))
    page.underlying = recordedNode(Node("AXButton"), depth: 9)
    XCTAssertNil(recordedMenuItem(page), "a control beneath that is no menu item")
    XCTAssertNil(recordedMenuItem(StalePointVerdict<Node>(reason: .unrecorded)))
  }

  // MARK: Unconfirmed

  /// The action's return is not proof: a context menu's item (its menu under the text view, the focus on the text view)
  /// leaves no control to read, so the click, its action performed, answers clickUnconfirmed once the settle has passed;
  /// a menu still up with its pop-up button unchanged says so.
  func testAnEffectThatDoesNotReadIsUnconfirmed() {
    let text = Node("AXTextArea", parent: Node("AXScrollArea", parent: Node("AXWindow")))
    let menu = Node("AXMenu", parent: text)
    let copy = Node("AXMenuItem", title: "Copy", parent: menu)
    focused = text
    var open = true
    var meta = freshMeta()
    var performed = 0
    XCTAssertThrowsError(try click(decide(hit: copy, recorded: copy), shown: { _ in open }, meta: &meta) { _, _ in
      performed += 1
      open = false
      return .success
    }) { error in
      let error = error as? EngineError
      XCTAssertEqual(error?.errorName, "clickUnconfirmed")
      XCTAssertEqual(error?.message, "The click could not be confirmed: it was carried by the menu item's AXPick action in TextEdit, since a pointer click does not take a menu's item, and the menu closed, but nothing cua can read shows the item taken. Observe the app with get_app_state before any retry, and never retry blindly.")
    }
    XCTAssertEqual(performed, 1)
    XCTAssertNotNil(meta.startedAt)
    XCTAssertEqual(wire(meta)?["effect"] as? String, "unconfirmed")
    XCTAssertEqual(wire(meta)?["menuClosed"] as? Bool, true)
    XCTAssertEqual(wire(meta)?["value"] as? String, "unread")
    XCTAssertEqual(wire(meta)?["polls"] as? Int, Int(menuItemSettleMs / menuItemSampleMs) + 1, "read at once, then every 20 ms for 1 s")

    let scene = textEdit()
    var still = freshMeta()
    XCTAssertThrowsError(try click(decide(hit: scene.times, recorded: scene.times), shown: { _ in true }, meta: &still) { _, _ in .success }) { error in
      XCTAssertEqual((error as? EngineError)?.message, "The click could not be confirmed: it was carried by the menu item's AXPick action in TextEdit, since a pointer click does not take a menu's item, and the menu was not seen to close with the item taken. Observe the app with get_app_state before any retry, and never retry blindly.")
    }
    XCTAssertEqual(wire(still)?["menuClosed"] as? Bool, false)
    XCTAssertEqual(wire(still)?["value"] as? String, "other", "the pop-up button still reads Helvetica")
  }

  // MARK: Refused

  /// The two signals disagree: the hit's item is another than the record's, or the record has none there (the menu opened
  /// after the screenshot), or the record's item is not what the hit answers now. Refused as appWindowOverPoint, nothing
  /// performed or posted.
  func testDisagreeingSignalsRefuseWithNothingPerformedOrPosted() {
    let scene = textEdit()
    let field = Node("AXTextField", parent: Node("AXWindow"))
    for (hit, recorded, why, cause) in [
      (scene.times, scene.helvetica, MenuItemRefusal.notRecorded, "the item there is not the one the screenshot showed at this point"),
      (scene.times, nil, .notRecorded, "the item there is not the one the screenshot showed at this point"),
      (field, scene.times, .notHit, "the item the screenshot showed there is not what the point reaches now"),
    ] as [(Node, Node?, MenuItemRefusal, String)] {
      let decision = decide(hit: hit, recorded: recorded)
      guard case .refuse(let found, window: 77) = decision else { return XCTFail("refused, not \(decision)") }
      XCTAssertEqual(found, why)
      var meta = freshMeta()
      XCTAssertThrowsError(try click(decision, shown: { _ in true }, meta: &meta) { _, _ in XCTFail("nothing performed"); return .success }) { error in
        let error = error as? EngineError
        XCTAssertEqual(error?.errorName, "appWindowOverPoint")
        XCTAssertEqual(error?.message, "TextEdit has a menu open at this point, which a click takes only as its item's own action, but \(cause). Nothing was sent. Use keys instead (the arrow keys to the item, then Return; Escape closes the menu), or call getScreenshot for a new screenshot and click the menu item its tree lists, by its element.")
      }
      XCTAssertNil(meta.startedAt, "nothing sent")
      XCTAssertEqual(meta.inputRoute, .action)
      XCTAssertEqual(wire(meta)?["refused"] as? String, why.rawValue)
      XCTAssertNil(wire(meta)?["delivery"])
    }
  }

  /// A disabled item (or one whose AXEnabled does not read), and one with neither AXPick nor AXPress (or whose actions do
  /// not read), are refused; an AXPress-only item is pressed.
  func testADisabledOrActionlessItemIsRefused() {
    let scene = textEdit()
    for enabled in [false, nil] as [Bool?] {
      scene.times.enabled = enabled
      guard case .refuse(.disabled, _) = decide(hit: scene.times, recorded: scene.times) else { return XCTFail("disabled \(String(describing: enabled))") }
    }
    scene.times.enabled = true
    for actions in [[], ["AXCancel"], nil] as [[String]?] {
      scene.times.actions = actions
      guard case .refuse(.noAction, _) = decide(hit: scene.times, recorded: scene.times) else { return XCTFail("no action \(String(describing: actions))") }
    }
    var meta = freshMeta()
    XCTAssertThrowsError(try click(decide(hit: scene.times, recorded: scene.times), shown: { _ in true }, meta: &meta) { _, _ in .success }) { error in
      XCTAssertTrue((error as? EngineError)?.message.contains("but the item there takes no action. Nothing was sent.") == true)
    }
    scene.times.actions = ["AXPress"]
    guard case .deliver(let target) = decide(hit: scene.times, recorded: scene.times) else { return XCTFail("pressed") }
    XCTAssertEqual(target.action, "AXPress")
  }

  // MARK: Main's path

  /// A hit-test that answered nothing, or past the deadline, gives no signal: main's path, the window list unread, even
  /// with the record naming an item (#452's rule).
  func testAFailedOrLateHitKeepsMainsPath() {
    let scene = textEdit()
    let application = Node("AXApplication")
    let window = Node("AXWindow", parent: application)
    var clock = 0.0
    let late = windowHit(application: application, window: window, at: point, elementAt: { _, _ in clock += pointHitSignalDeadlineMs + 1; return (.success, scene.times) },
                         role: { $0.role }, parent: { $0.parent }, same: { $0 === $1 }, now: { clock })
    XCTAssertNil(late.answered, "late: no signal")
    let failed = windowHit(application: application, window: window, at: point, elementAt: { _, _ in (.cannotComplete, nil) },
                           role: { $0.role }, parent: { $0.parent }, same: { $0 === $1 }, now: { 0 })
    XCTAssertNil(failed.answered)
    for hit in [late.answered, failed.answered] {
      guard case .notMenu = decide(hit: hit, recorded: scene.times) else { return XCTFail("main's path") }
    }
    XCTAssertEqual(listReads, 0)
    var meta = freshMeta()
    XCTAssertFalse(try click(.notMenu, shown: { _ in true }, meta: &meta) { _, _ in XCTFail("nothing performed"); return .success })
    XCTAssertNil(meta.wire["menuItemClick"])
    XCTAssertNil(meta.inputRoute, "left to main's route")
  }

  /// A click on anything but a menu item (a button, a text field), with no item recorded there, is main's and reads no
  /// window list; a menu item with no menu window of the app's over the point (a web page's ARIA menu, drawn in the
  /// page) is main's too, as is one whose only layer-101 window is another app's, behind the observed one, or transparent.
  func testClicksOffAnOpenMenusWindowAreMains() {
    for hit in [Node("AXButton", parent: Node("AXWindow")), Node("AXTextField")] {
      guard case .notMenu = decide(hit: hit, recorded: nil) else { return XCTFail("main's path") }
    }
    XCTAssertEqual(listReads, 0, "no window list read")
    let aria = Node("AXMenuItem", title: "Rename", parent: Node("AXMenu", parent: Node("AXGroup", parent: Node("AXWebArea"))))
    guard case .notMenu = decide(hit: aria, recorded: aria, list: [observedWindow()]) else { return XCTFail("an in-page menu") }
    let other = ListedWindow(number: 90, owner: 777, layer: menuWindowLayer, bounds: menuWindow.bounds)
    let behind = ListedWindow(number: 91, owner: 501, layer: menuWindowLayer, bounds: menuWindow.bounds)
    var clear = menuWindow
    clear.alpha = 0
    let elsewhere = ListedWindow(number: 92, owner: 501, layer: menuWindowLayer, bounds: CGRect(x: 0, y: 0, width: 10, height: 10))
    let panel = ListedWindow(number: 93, owner: 501, layer: 3, bounds: menuWindow.bounds)
    for list in [[other, observedWindow()], [observedWindow(), behind], [clear, observedWindow()], [elsewhere, observedWindow()],
                 [panel, observedWindow()]] {
      XCTAssertNil(menuWindowOverPoint(point, target: observed, pids: [app], list: list))
    }
    XCTAssertEqual(menuWindowOverPoint(point, target: observed, pids: [app], list: [menuWindow, observedWindow()])?.number, 77)
    XCTAssertEqual(menuWindowOverPoint(point, target: nil, pids: [app], list: [menuWindow])?.number, 77, "the observed window unlisted")
  }
}
