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
    /// Its AXValue or AXTitle read fails now (a messaging timeout).
    var valueFails = false
    var titleFails = false
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
    MenuItemReads(role: { $0.role }, parent: { $0.parent }, enabled: { $0.enabled }, actions: { $0.actions },
                  title: { $0.titleFails ? .failed : $0.title.map { .text($0) } ?? .absent },
                  value: { $0.valueFails ? .failed : $0.value.map { .text($0) } ?? .absent }, focused: { [unowned self] in self.focused },
                  children: { $0.children }, gone: { $0.gone }, same: { $0 === $1 })
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
    decide(hit: hit, record: recorded.map { RecordedMenuItem(element: $0, title: $0.title) }, list: list)
  }

  private func decide(hit: Node?, record: RecordedMenuItem<Node>?, list: [ListedWindow]? = nil) -> MenuItemPoint<Node> {
    menuItemPoint(hit: hit, recorded: record.map { [$0] } ?? [], reads: reads) {
      self.listReads += 1
      return menuWindowOverPoint(point, target: observed, pids: [app], list: list ?? [menuWindow, observedWindow()])?.number
    }
  }

  /// The click carried out over a fake clock: `onAction` runs as the item's action is performed (the app taking it).
  private func click(_ decision: MenuItemPoint<Node>, shown: @escaping (CGWindowID) -> Bool?, meta: inout InputMeta,
                     prepareOwner: @escaping (Node) throws -> Void = { _ in }, checkInFlight: @escaping () throws -> Void = {},
                     onAction: @escaping (Node, String) -> AXError) throws -> Bool {
    var clock = 0.0
    return try menuItemClick(decision, app: "TextEdit", reads: reads, menuWindowShown: shown, now: { clock }, sleep: { clock += $0 },
                             prepareOwner: prepareOwner, checkInFlight: checkInFlight, perform: onAction, meta: &meta)
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
    XCTAssertTrue(recordedMenuItem(verdict)?.element === three)
    let decision = decide(hit: hit.answered, record: recordedMenuItem(verdict))
    guard case .deliver(let target) = decision else { return XCTFail("delivered, not \(decision)") }
    XCTAssertEqual(target.action, "AXPress")
    focused = select  // the <select> holds the focus while its parentless menu is open
    var open = true
    var meta = freshMeta()
    XCTAssertTrue(try click(decision, shown: { _ in open }, meta: &meta) { _, _ in
      select.value = "Three"
      open = false
      return .success
    })
    XCTAssertEqual(wire(meta)?["effect"] as? String, "confirmed")
  }

  /// The recorded item is the node itself (its handle as found now), a recorded AXMenuItem above the node, or #433's
  /// control beneath it; none of those, none.
  func testTheRecordedItemIsTheNodeAnItemAboveItOrTheControlBeneath() {
    let scene = textEdit()
    XCTAssertTrue(recordedMenuItem(StalePointVerdict(reason: .sameElement, node: recordedNode(scene.times, depth: 3), current: scene.times))?.element === scene.times)
    let icon = Node("AXImage", parent: scene.times)
    let nodes = [recordedNode(scene.menu, depth: 2), recordedNode(scene.times, depth: 3, ancestor: 0), recordedNode(icon, depth: 4, ancestor: 1)]
    var inside = StalePointVerdict<Node>(reason: .nonInteractiveHit, node: nodes[2], point: point)
    inside.nodes = nodes
    XCTAssertTrue(recordedMenuItem(inside)?.element === scene.times)
    XCTAssertEqual(recordedMenuItem(inside)?.title, "Times", "the item's recorded title rides with it")
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
      (field, scene.times, .notHit, "the item the screenshot showed there is not what the point reaches now"),
    ] as [(Node, Node?, MenuItemRefusal, String)] {
      let decision = decide(hit: hit, recorded: recorded)
      guard case .refuse(let found, window: 77) = decision else { return XCTFail("refused, not \(decision)") }
      XCTAssertEqual(found, why)
      var meta = freshMeta()
      XCTAssertThrowsError(try click(decision, shown: { _ in true }, meta: &meta) { _, _ in XCTFail("nothing performed"); return .success }) { error in
        let error = error as? EngineError
        XCTAssertEqual(error?.errorName, "appWindowOverPoint")
        XCTAssertEqual(error?.message, "TextEdit has a menu open at this point, which a click takes only as its item's own action, but \(cause). Nothing was sent. Use keys instead (the arrow keys to the item, then Return; Escape closes the menu), or call getAXState() and click the menu item it lists, by its element.")
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
  /// window list; a menu item with no menu window of the app's over the point is main's too, as is one whose only
  /// layer-101 window is another app's, behind the observed one, or transparent.
  func testClicksOffAnOpenMenusWindowAreMains() {
    for hit in [Node("AXButton", parent: Node("AXWindow")), Node("AXTextField")] {
      guard case .notMenu = decide(hit: hit, recorded: nil) else { return XCTFail("main's path") }
    }
    XCTAssertEqual(listReads, 0, "no window list read")
    let unwindowed = textEdit()
    guard case .notMenu = decide(hit: unwindowed.times, recorded: unwindowed.times, list: [observedWindow()]) else {
      return XCTFail("a menu with no window of its own over the point")
    }
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

  // MARK: The review of fdd285dd..32787ce3

  /// Item 1: the process serving the item is refused when forbidden and registered as driven before the in-flight check,
  /// whatever main's bounded hit was; a refused owner leaves nothing performed.
  func testTheItemsOwnProcessIsCheckedBeforeTheInFlightCheckAndTheAction() {
    let scene = textEdit()
    var order: [String] = []
    var meta = freshMeta()
    XCTAssertThrowsError(try click(decide(hit: scene.times, recorded: scene.times), shown: { _ in false }, meta: &meta, prepareOwner: { item in
      XCTAssertTrue(item === scene.times, "the item acted on, not main's hit")
      order.append("owner")
      throw EngineError(name: "appNotAllowed", "forbidden")
    }, checkInFlight: { order.append("inFlight") }) { _, _ in order.append("perform"); return .success }) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "appNotAllowed")
    }
    XCTAssertEqual(order, ["owner"])
    XCTAssertNil(meta.startedAt)
    var allowed = freshMeta()
    order = []
    _ = try? click(decide(hit: scene.times, recorded: scene.times), shown: { _ in false }, meta: &allowed, prepareOwner: { _ in order.append("owner") },
                   checkInFlight: { order.append("inFlight") }) { _, _ in order.append("perform"); scene.popup.value = "Times"; return .success }
    XCTAssertEqual(order, ["owner", "inFlight", "perform"])
  }

  /// Item 2: the selection must move to the item. A pop-up button already showing the item gives no evidence
  /// (`unchanged`); a control whose AXTitle is a static label matching the item while its AXValue reads another option is
  /// `other`: the value decides, the title only where there is no value.
  func testTheSelectionMustMoveToTheItemAndALabelNeverOverridesTheValue() {
    let scene = textEdit()
    scene.popup.value = "Times"
    var meta = freshMeta()
    XCTAssertThrowsError(try click(decide(hit: scene.times, recorded: scene.times), shown: { _ in false }, meta: &meta) { _, _ in .success })
    XCTAssertEqual(wire(meta)?["value"] as? String, "unchanged")
    XCTAssertEqual(wire(meta)?["effect"] as? String, "unconfirmed")

    let labelled = textEdit()
    labelled.popup.title = "Times"  // a static label
    var label = freshMeta()
    XCTAssertThrowsError(try click(decide(hit: labelled.times, recorded: labelled.times), shown: { _ in false }, meta: &label) { _, _ in .success })
    XCTAssertEqual(wire(label)?["value"] as? String, "other", "AXValue still reads Helvetica")

    let untitled = textEdit()
    untitled.popup.value = nil
    untitled.popup.title = "Helvetica"
    var byTitle = freshMeta()
    XCTAssertNoThrow(try click(decide(hit: untitled.times, recorded: untitled.times), shown: { _ in false }, meta: &byTitle) { _, _ in
      untitled.popup.title = "Times"
      return .success
    })
    XCTAssertEqual(wire(byTitle)?["value"] as? String, "taken", "no value: the title shows the selection")
  }

  /// Item 3: the control is identified before the action. A context menu's known parent (a text view) has none, so a
  /// pop-up button focused elsewhere confirms nothing; a parentless menu whose focus before the action is no pop-up
  /// button or combo box has none either, whatever takes the focus after.
  func testOnlyAControlIdentifiedBeforeTheActionConfirms() {
    let text = Node("AXTextArea", parent: Node("AXWindow"))
    let copy = Node("AXMenuItem", title: "Copy", parent: Node("AXMenu", parent: text))
    let unrelated = Node("AXPopUpButton", value: "One", parent: Node("AXWindow"))
    focused = unrelated
    var meta = freshMeta()
    XCTAssertThrowsError(try click(decide(hit: copy, recorded: copy), shown: { _ in false }, meta: &meta) { _, _ in
      unrelated.value = "Copy"
      return .success
    })
    XCTAssertEqual(wire(meta)?["value"] as? String, "unread")

    let parentlessMenu = Node("AXMenu")
    let three = Node("AXMenuItem", title: "Three", parent: parentlessMenu)
    let select = Node("AXPopUpButton", value: "One", parent: Node("AXWindow"))
    focused = three
    var parentless = freshMeta()
    XCTAssertThrowsError(try click(decide(hit: three, recorded: three), shown: { _ in false }, meta: &parentless) { _, _ in
      select.value = "Three"
      self.focused = select
      return .success
    })
    XCTAssertEqual(wire(parentless)?["value"] as? String, "unread", "the select was not identified before the action")
  }

  /// Item 4: the guard's re-hits go through `latest` (as the click now gives them), so a menu item the first hit-test
  /// missed and the guard's re-hit found is the timed signal the menu step reads.
  func testAGuardsRecoveredHitIsTheMenuSignal() {
    let scene = textEdit()
    let application = Node("AXApplication")
    let window = Node("AXWindow", parent: application)
    scene.popup.parent = window
    var answers: [Node?] = [nil, scene.times]
    let outcome = { () -> WindowHit<Node> in
      let answer = answers.isEmpty ? nil : answers.removeFirst()
      return windowHit(application: application, window: window, at: self.point, elementAt: { _, _ in (answer == nil ? .noValue : .success, answer) },
                       role: { $0.role }, parent: { $0.parent }, same: { $0 === $1 }, now: { 0 })
    }
    let latest = LatestHit(outcome(), hitTest: outcome)
    XCTAssertNil(latest.outcome.answered, "the first hit-test answered nothing")
    let node = recordedNode(scene.times, depth: 3)
    let staleReads = StalePointReads<Node>(role: { $0.role }, frame: { _ in nil }, parent: { $0.parent }, children: { $0.children },
                                           title: { $0.title }, description: { _ in nil }, same: { $0 === $1 })
    let verdict = stalePointVerdict(at: point, nodes: [node], hit: latest.outcome.element, rehit: latest.rehit, reads: staleReads)
    XCTAssertTrue(verdict.hit === scene.times, "the guard recovered the item")
    XCTAssertTrue(latest.outcome.answered === scene.times, "and the outcome the menu step reads is that re-hit's")
    guard case .deliver = decide(hit: latest.outcome.answered, record: recordedMenuItem(verdict)) else { return XCTFail("delivered") }
  }

  /// Item 5: a recorded item found by its handle (the recorded icon's item, kept by `hitAboveNode`) that reads another
  /// title now, a dynamic menu reusing it for another command, is refused before anything is acted on.
  func testARecordedItemReadingAnotherTitleIsRefused() {
    let scene = textEdit()
    let record = RecordedMenuItem(element: scene.times, title: "Times")
    scene.times.title = "Delete"
    guard case .refuse(.relabelled, window: 77) = decide(hit: scene.times, record: record) else { return XCTFail("relabelled") }
    var meta = freshMeta()
    XCTAssertThrowsError(try click(decide(hit: scene.times, record: record), shown: { _ in false }, meta: &meta) { _, _ in
      XCTFail("nothing performed"); return .success
    }) { error in
      XCTAssertTrue((error as? EngineError)?.message.contains("but the item there no longer reads what the screenshot showed. Nothing was sent.") == true)
    }
    guard case .deliver = decide(hit: scene.times, record: RecordedMenuItem(element: scene.times, title: "Delete")) else { return XCTFail("same title") }
  }

  /// Item 6: a page's ARIA menu item, inside a web area, is main's even with a window of the app's at the menu layer over
  /// the point (a click-through panel), and no window list is read for it.
  func testAnInPageMenuUnderAMenuLayerWindowIsMains() {
    let page = Node("AXWebArea", parent: Node("AXWindow"))
    let ariaMenu = Node("AXMenu", parent: Node("AXGroup", parent: page))
    let aria = Node("AXMenuItem", title: "Rename", parent: ariaMenu)
    guard case .notMenu = decide(hit: aria, recorded: aria) else { return XCTFail("main's path") }
    let field = Node("AXTextField", parent: page)
    guard case .notMenu = decide(hit: field, recorded: aria) else { return XCTFail("main's path: the recorded item is in the page") }
    XCTAssertEqual(listReads, 0)
  }

  /// Item 7: a window list that does not read is unknown, never closed: with the pop-up button reading the item, the
  /// click is still unconfirmed, `menuClosed` null.
  func testAnUnreadWindowListLeavesTheMenuUnknownNotClosed() {
    let scene = textEdit()
    var meta = freshMeta()
    XCTAssertThrowsError(try click(decide(hit: scene.times, recorded: scene.times), shown: { _ in nil }, meta: &meta) { _, _ in
      scene.popup.value = "Times"
      return .success
    }) { error in
      XCTAssertTrue((error as? EngineError)?.message.contains("the menu was not seen to close with the item taken") == true)
    }
    XCTAssertTrue(wire(meta)?["menuClosed"] is NSNull)
    XCTAssertEqual(wire(meta)?["value"] as? String, "taken")
  }

  /// Item 8: a messaging timeout may have taken effect, so the effect is read and decides (the AXError in the meta); a
  /// definite refusal of the action is actionFailed, read no further.
  func testAnAmbiguousActionErrorIsJudgedByItsEffectAndADefiniteOneFails() throws {
    let scene = textEdit()
    var open = true
    var meta = freshMeta()
    XCTAssertTrue(try click(decide(hit: scene.times, recorded: scene.times), shown: { _ in open }, meta: &meta) { _, _ in
      scene.popup.value = "Times"
      open = false
      return .cannotComplete
    })
    XCTAssertEqual(wire(meta)?["effect"] as? String, "confirmed")
    XCTAssertEqual(wire(meta)?["actionError"] as? Int, Int(AXError.cannotComplete.rawValue))
    let other = textEdit()
    var failed = freshMeta()
    XCTAssertThrowsError(try click(decide(hit: other.times, recorded: other.times), shown: { _ in false }, meta: &failed) { _, _ in .actionUnsupported }) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "actionFailed")
    }
    XCTAssertNil(wire(failed)?["polls"], "no effect read")
    XCTAssertNotNil(failed.startedAt, "the action was sent")
  }

  /// Item 9: an intervention stop before the action leaves no delivery in the meta.
  func testAStopBeforeTheActionRecordsNoDelivery() {
    let scene = textEdit()
    var meta = freshMeta()
    XCTAssertThrowsError(try click(decide(hit: scene.times, recorded: scene.times), shown: { _ in false }, meta: &meta,
                                   checkInFlight: { throw EngineError(name: "userIntervened", "stopped") }) { _, _ in
      XCTFail("nothing performed"); return .success
    })
    XCTAssertNil(wire(meta)?["delivery"])
    XCTAssertNil(wire(meta)?["action"])
    XCTAssertNil(meta.startedAt)
  }

  // MARK: The re-review of 32787ce3..3eb2b806

  /// Item 1: the selection's attribute is chosen before the action and read again after it: a value that fails to read
  /// after the action gives no evidence, never the static title beside it; a value that failed before gives none either.
  func testASelectionReadThatFailsGivesNoEvidenceAndTheAttributeNeverChanges() {
    let scene = textEdit()
    scene.popup.title = "Times"  // a static label, the item's title
    var meta = freshMeta()
    XCTAssertThrowsError(try click(decide(hit: scene.times, recorded: scene.times), shown: { _ in false }, meta: &meta) { _, _ in
      scene.popup.valueFails = true
      return .success
    })
    XCTAssertEqual(wire(meta)?["value"] as? String, "unread")

    let failedBefore = textEdit()
    failedBefore.popup.valueFails = true
    var before = freshMeta()
    XCTAssertThrowsError(try click(decide(hit: failedBefore.times, recorded: failedBefore.times), shown: { _ in false }, meta: &before) { _, _ in
      failedBefore.popup.valueFails = false
      failedBefore.popup.value = "Times"
      return .success
    })
    XCTAssertEqual(wire(before)?["value"] as? String, "unread", "no reading before the action: no evidence")
  }

  /// Item 2: the title the decision verified rides into the delivery: an item reading another just before the action is
  /// refused as relabelled, nothing performed, and the selection is judged against the verified title.
  func testTheVerifiedTitleIsReadAgainBeforeTheActionAndJudgesTheSelection() {
    let scene = textEdit()
    let decision = decide(hit: scene.times, recorded: scene.times)
    guard case .deliver(let target) = decision else { return XCTFail("delivered") }
    XCTAssertEqual(target.title, "Times")
    var meta = freshMeta()
    XCTAssertThrowsError(try click(decision, shown: { _ in false }, meta: &meta, checkInFlight: { scene.times.title = "Delete" }) { _, _ in
      XCTFail("nothing performed"); return .success
    }) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "appWindowOverPoint")
      XCTAssertTrue((error as? EngineError)?.message.contains("no longer reads what the screenshot showed") == true)
    }
    XCTAssertEqual(wire(meta)?["refused"] as? String, "relabelled")
    XCTAssertNil(wire(meta)?["delivery"])
    XCTAssertNil(meta.startedAt)
  }

  /// Item 3: a hit on a page's ARIA item while the record holds a native item at the point and its menu window still
  /// covers it is refused, nothing sent; with no menu window, or no native item recorded, it stays main's.
  func testAPageItemUnderAStillOpenNativeMenuIsRefusedWhenTheRecordHoldsANativeItem() {
    let scene = textEdit()
    let page = Node("AXWebArea", parent: Node("AXWindow"))
    let ariaMenu = Node("AXMenu", parent: page)
    let aria = Node("AXMenuItem", title: "Rename", parent: ariaMenu)
    guard case .refuse(.notHit, window: 77) = decide(hit: aria, recorded: scene.times) else { return XCTFail("refused") }
    var meta = freshMeta()
    XCTAssertThrowsError(try click(decide(hit: aria, recorded: scene.times), shown: { _ in true }, meta: &meta) { _, _ in
      XCTFail("nothing performed"); return .success
    })
    XCTAssertNil(meta.startedAt)
    guard case .notMenu = decide(hit: aria, recorded: scene.times, list: [observedWindow()]) else { return XCTFail("no menu window: main's") }
    guard case .notMenu = decide(hit: aria, recorded: aria) else { return XCTFail("no native item recorded: main's") }
  }

  /// Item 4: the identity comparison cuts the live title as the observation cut the recorded one (10,000 UTF-16 units and
  /// the marker), so a long option unchanged is delivered, and its full title judges the selection.
  func testALongTitleComparesAsTheObservationRecordedIt() {
    let scene = textEdit()
    let long = String(repeating: "Garamond ", count: 1500)
    scene.times.title = long
    let record = RecordedMenuItem(element: scene.times, title: bounded(long))
    XCTAssertNotEqual(record.title, long, "the record holds the cut title")
    guard case .deliver(let target) = decide(hit: scene.times, record: record) else { return XCTFail("delivered") }
    XCTAssertEqual(target.title, long, "the full title for the selection")
    var meta = freshMeta()
    XCTAssertNoThrow(try click(.deliver(target), shown: { _ in false }, meta: &meta) { _, _ in
      scene.popup.value = long
      return .success
    })
    XCTAssertEqual(wire(meta)?["value"] as? String, "taken")
    guard case .refuse(.relabelled, _) = decide(hit: scene.times, record: RecordedMenuItem(element: scene.times, title: bounded("Other " + long))) else {
      return XCTFail("another long title")
    }
  }

  // MARK: #454's qualification (run 44860009214)

  /// Chrome's page: the `<select>` (an AXPopUpButton with its own hidden AXMenu of the options) and the app-level menu
  /// open over it, whose items the record holds, the already-selected One over the pop-up button itself.
  private func chromeSelect() -> (popup: Node, hidden: Node, menu: Node, one: Node, three: Node) {
    let popup = Node("AXPopUpButton", title: "Choice", value: "One", parent: Node("AXGroup", parent: Node("AXWebArea", parent: Node("AXWindow"))))
    let hidden = Node("AXMenu", parent: popup)
    for title in ["One", "Two", "Three"] { _ = Node("AXMenuItem", title: title, parent: hidden) }
    let menu = Node("AXMenu")
    let one = Node("AXMenuItem", title: "One", parent: menu)
    _ = Node("AXMenuItem", title: "Two", parent: menu)
    let three = Node("AXMenuItem", title: "Three", parent: menu)
    return (popup, hidden, menu, one, three)
  }

  /// `select-same`: the deepest recorded node at One's point is the page's AXPopUpButton (it acts, so #433 reads no control
  /// beneath it), refused `notRecorded` 15/15 though the record holds One there. Every recorded item holding the point
  /// counts, so One agrees with the hit and is delivered.
  func testAnItemOverADeeperRecordedControlStillAgreesWithTheRecord() {
    let chrome = chromeSelect()
    var popupNode = recordedNode(chrome.popup, depth: 13)
    popupNode.actionable = true
    let nodes = [recordedNode(chrome.one, depth: 9), popupNode]
    var verdict = StalePointVerdict<Node>(reason: .noHit, node: popupNode, identity: .handle, current: chrome.popup, point: point)
    verdict.nodes = nodes
    XCTAssertNil(recordedMenuItem(verdict), "neither the node nor a control beneath it is the item")
    XCTAssertTrue(recordedMenuItems(verdict).first?.element === chrome.one)
    guard case .deliver(let target) = menuItemPoint(hit: chrome.one, recorded: recordedMenuItems(verdict), reads: reads, menuWindow: { 44 }) else {
      return XCTFail("delivered")
    }
    XCTAssertTrue(target.item === chrome.one)
    // Another recorded item at the point than the hit still disagrees.
    guard case .refuse(.notRecorded, _) = menuItemPoint(hit: chrome.three, recorded: recordedMenuItems(verdict), reads: reads, menuWindow: { 44 }) else {
      return XCTFail("notRecorded")
    }
  }

  /// `select`: answered `value: "unread"` 15/15, the focus not on the `<select>` while its menu is open. The parentless
  /// menu's control is the one recorded pop-up whose own AXMenu lists the same options; its AXValue moves One to Three.
  /// Two such pop-ups (the same options) identify none.
  func testAParentlessMenusControlIsTheRecordedPopUpListingItsOptions() {
    let chrome = chromeSelect()
    focused = chrome.three  // not an opener
    guard case .deliver(let target) = decide(hit: chrome.three, recorded: chrome.three) else { return XCTFail("delivered") }
    var open = true
    var meta = freshMeta()
    var clock = 0.0
    XCTAssertTrue(try menuItemClick(.deliver(target), app: "Google Chrome", reads: reads, menuWindowShown: { _ in open }, now: { clock },
                                    sleep: { clock += $0 }, openers: [Node("AXComboBox"), chrome.popup], prepareOwner: { _ in },
                                    checkInFlight: {}, perform: { _, _ in chrome.popup.value = "Three"; open = false; return .success }, meta: &meta))
    XCTAssertEqual(wire(meta)?["value"] as? String, "taken")
    let twin = Node("AXPopUpButton", value: "One")
    let twinMenu = Node("AXMenu", parent: twin)
    for title in ["One", "Two", "Three"] { _ = Node("AXMenuItem", title: title, parent: twinMenu) }
    XCTAssertNil(parentlessMenuOpener(chrome.menu, candidates: [chrome.popup, twin], reads: reads))
    XCTAssertTrue(parentlessMenuOpener(chrome.menu, candidates: [chrome.popup], reads: reads) === chrome.popup)
    chrome.hidden.children.last?.title = "Four"
    XCTAssertNil(parentlessMenuOpener(chrome.menu, candidates: [chrome.popup], reads: reads), "other options: not its menu")
  }

  /// `menubar` and `submenu`: the observation lists no item of the menu at the point (the screenshot does not show it),
  /// so the refusal says so, and names what works with the app behind: a click outside closes it, and the item by its
  /// element once getAXState() lists it (the menu bar's title clicked by its element first), never the keys.
  func testAMenuTheObservationHoldsNoItemOfIsRefusedAsUnobserved() {
    let scene = textEdit()
    guard case .refuse(.unobserved, window: 77) = decide(hit: scene.times, recorded: nil) else { return XCTFail("unobserved") }
    var meta = freshMeta()
    XCTAssertThrowsError(try click(decide(hit: scene.times, recorded: nil), shown: { _ in true }, meta: &meta) { _, _ in
      XCTFail("nothing performed"); return .success
    }) { error in
      let error = error as? EngineError
      XCTAssertEqual(error?.errorName, "appWindowOverPoint")
      XCTAssertEqual(error?.message, "TextEdit has a menu open at this point that the screenshot does not show (a menu-bar menu, a submenu, or a menu opened since the screenshot), so the click cannot be checked against it. Nothing was sent. A click outside the menu closes it. To choose one of its items, call getAXState() and click the item it lists by its element; a menu-bar menu's items are listed once its title in the menu bar has been clicked by its element.")
    }
    XCTAssertEqual(wire(meta)?["refused"] as? String, "unobserved")
    XCTAssertNil(meta.startedAt)
  }
}

