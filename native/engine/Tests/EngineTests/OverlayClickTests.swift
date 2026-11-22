import ApplicationServices
import CoreGraphics
import Foundation
import XCTest
@testable import Engine

// #453 (design ruling 1040, owner ruling 1042; OverlayClick.swift): a click #452 refuses on a row of a window the app shows
// over the observed one, delivered into that window by its kind's route, over fakes shaped as the measurement found the
// overlays (kit `probe/453-measure`, README 72d86db3): Chrome's omnibox popup (its own layer-0 window holding the WebUI
// page "Omnibox Popup", whose first hit-test answers the web area), the `<datalist>` popup (Chromium's autofill list in a
// layer-999 window), the permission bubble (an alert dialog in a layer-0 window) and TextEdit's colour-well popover (an
// AXPopover in the document window's tree, with a window of its own in the list). Then #456's rechecks (`StalePointGate`'s
// overlay rule).

final class OverlayClickTests: XCTestCase {
  private final class Node {
    let role: String
    var title: String?
    var description: String?
    var value: String?
    var subrole: String?
    var frame: CGRect?
    var enabled: Bool?
    var actions: [String]?
    var gone = false
    weak var parent: Node?
    var children: [Node] = []

    init(_ role: String, _ frame: CGRect?, title: String? = nil, description: String? = nil, value: String? = nil,
         subrole: String? = nil, actions: [String]? = [], parent: Node? = nil) {
      self.role = role
      self.frame = frame
      self.title = title
      self.description = description
      self.value = value
      self.subrole = subrole
      self.actions = actions
      if let parent { self.parent = parent; parent.children.append(self) }
    }
  }

  private let pid: pid_t = 20515
  private let browserWindow = ListedWindow(number: 31, owner: 20515, layer: 0, bounds: CGRect(x: 400, y: 31, width: 620, height: 678))
  private var clock = 0.0
  private var reads: OverlayReads<Node> {
    OverlayReads(stale: StalePointReads(role: { $0.role }, frame: { $0.gone ? nil : $0.frame }, parent: { $0.parent }, children: { $0.children },
                                        title: { $0.title }, description: { $0.description }, value: { $0.value },
                                        actions: { $0.actions }, same: { $0 === $1 }, gone: { $0.gone }),
                 subrole: { $0.subrole }, enabled: { $0.enabled })
  }

  private func rect(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) -> CGRect { CGRect(x: x, y: y, width: w, height: h) }

  /// The observation's record of `roots` (each walked preorder, as the walk emits them), as it reads now.
  private func record(_ roots: [Node]) -> [ScreenshotNode<Node>] {
    var reads: [ScreenshotNodeRead<Node>] = []
    func walk(_ node: Node, parent: Int?, depth: Int) {
      let number = reads.count
      reads.append(ScreenshotNodeRead(element: node, number: number, parent: parent, depth: depth, role: node.role, title: node.title,
                                      description: node.description, frame: node.frame, actions: node.actions ?? [],
                                      childCount: node.children.count, subrole: node.subrole,
                                      value: node.role == "AXStaticText" ? node.value : nil))
      for child in node.children { walk(child, parent: number, depth: depth + 1) }
    }
    for root in roots { walk(root, parent: nil, depth: 0) }
    return screenshotNodes(reads)
  }

  // MARK: The overlays, as measured

  /// Chrome's omnibox popup (run C): the popup's AXWindow holds groups, a scroll area, the web area "Omnibox Popup", a
  /// group and the AXList of rows, each an AXStaticText of 426×40 carrying its text, over an AXEmptyGroup.
  private struct Omnibox {
    let window: Node
    let webArea: Node
    let list: Node
    var rows: [Node]
    let listed: ListedWindow
  }

  private func omnibox() -> Omnibox {
    let window = Node(kAXWindowRole, rect(499, 56, 458, 258), title: "", subrole: "AXUnknown")
    let outer = Node("AXGroup", rect(499, 56, 458, 258), parent: window)
    let inner = Node("AXGroup", rect(515, 72, 426, 214), parent: outer)
    let scroll = Node("AXScrollArea", rect(515, 116, 426, 170), parent: inner)
    let webArea = Node("AXWebArea", rect(515, 116, 426, 170), title: omniboxPopupTitle, parent: scroll)
    let group = Node("AXGroup", rect(515, 116, 426, 170), parent: webArea)
    let list = Node("AXList", rect(515, 116, 426, 120), parent: group)
    let texts = ["probe453 page http://127.0.0.1:49171/results-beta location from history, 1 of 3",
                 "probe453 page http://127.0.0.1:49171/results-alpha location from history, press Tab then Enter to Remove Suggestion., 2 of 3",
                 "http://127.0.0.1:49171/results- search, 3 of 3"]
    var rows: [Node] = []
    for (index, text) in texts.enumerated() {
      let y = 116 + CGFloat(index) * 40
      let row = Node("AXStaticText", rect(515, y, 426, 40), value: text, actions: ["AXPress", "AXShowMenu", "AXScrollToVisible"], parent: list)
      row.enabled = true
      _ = Node("AXGroup", rect(515, y, 410, 40), subrole: "AXEmptyGroup", parent: row)
      rows.append(row)
    }
    return Omnibox(window: window, webArea: webArea, list: list, rows: rows,
                   listed: ListedWindow(number: 39, owner: pid, layer: 0, bounds: rect(499, 56, 458, 258)))
  }

  /// The point on the omnibox's second row, as the kit picked it.
  private let rowPoint = CGPoint(x: 728, y: 176)

  private func pointContext(_ nodes: [ScreenshotNode<Node>], overlay: ListedWindow?, by: AppWindowSignal = .axHit, point: CGPoint,
                            recorded: Set<CGWindowID>? = [31, 39, 131, 132, 832, 840], chromium: Bool = true,
                            observedLayer: Int = 0) -> OverlayPointContext<Node> {
    OverlayPointContext(point: point, by: by, overlay: overlay, observedLayer: observedLayer, recordedWindows: recorded, nodes: nodes,
                        chromium: chromium)
  }

  private func freshMeta() -> InputMeta {
    InputMeta(ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
  }

  /// The delivery over the fake clock: `onPost` and `onPress` run as the click goes out (the app taking it).
  private func deliver(_ target: OverlayTarget<Node>, point: CGPoint, shown: @escaping (CGWindowID) -> Bool?,
                       onPost: @escaping (ClickTarget) -> Void = { _ in XCTFail("nothing posted") },
                       onPress: @escaping (Node, String) -> AXError = { _, _ in XCTFail("nothing pressed"); return .failure },
                       record: inout OverlayClickRecord, meta: inout InputMeta) throws {
    clock = 0
    try deliverOverlayClick(target, point: point, owner: pid, app: "Google Chrome", reads: reads.stale, windowShown: shown,
                            now: { self.clock }, sleep: { self.clock += $0 }, beforeDispatch: {}, post: onPost, perform: onPress,
                            record: &record, meta: &meta)
  }

  // MARK: Delivered, each kind by its route

  /// The omnibox row: the first hit answers the popup's web area, descended to the row's empty group, whose recorded row is
  /// the AXStaticText; it reads its recorded text at its frame, in window 39 the screenshot listed, so it is delivered by
  /// the post stamped with window 39 at the point (its window location local to the popup), route 2′, no activation;
  /// confirmed by the popup's window leaving the screen.
  func testAnOmniboxRowIsPostedToThePopupsOwnWindowAndConfirmedByThePopupClosing() throws {
    let scene = omnibox()
    let nodes = record([scene.window])
    let decision = overlayPoint(hit: scene.webArea, pointContext(nodes, overlay: scene.listed, point: rowPoint), reads: reads)
    guard case .deliver(let target) = decision else { return XCTFail("delivered, not \(decision)") }
    XCTAssertEqual(target.kind, .omniboxPopup)
    XCTAssertEqual(target.route, .post)
    XCTAssertTrue(target.row === scene.rows[1], "the row is the recorded AXStaticText, not its empty group")
    var open = true
    var posted: [ClickTarget] = []
    var record = OverlayClickRecord(window: 39, by: .axHit)
    var meta = freshMeta()
    try deliver(target, point: rowPoint, shown: { $0 == 39 ? open : true }, onPost: { posted.append($0); open = false },
                record: &record, meta: &meta)
    XCTAssertEqual(posted.count, 1)
    XCTAssertEqual(posted.first?.windowID, 39, "stamped with the popup's own window, not the observed one")
    XCTAssertEqual(posted.first?.windowFrame, scene.listed.bounds)
    XCTAssertEqual(posted.first?.pid, pid)
    XCTAssertEqual(posted.first.flatMap { stampedWindowLocation($0.point, id: $0.windowID, frame: $0.windowFrame) }, CGPoint(x: 229, y: 120),
                   "the kit's window location: the point local to the popup")
    XCTAssertEqual(meta.inputRoute, .plainPost, "route 2′: the post alone, no route 3 activation or hold")
    XCTAssertNotNil(meta.startedAt)
    XCTAssertEqual(record.wire as NSDictionary, ["window": 39, "by": "axHit", "kind": "omniboxPopup", "route": "post", "effect": "closed",
                                                 "polls": 1, "ms": 0])
  }

  /// The stamped events themselves: fields 91 and 92 carry the overlay's number, and the location is the global point.
  func testThePostedEventsAreStampedWithTheOverlaysWindow() {
    let target = overlayPostTarget(rowPoint, window: omnibox().listed, pid: pid)
    let events = clickEvents(target, button: .left, count: 1, flags: [])
    XCTAssertEqual(events.count, 2)
    XCTAssertEqual(stampedWindow(of: events), 39)
    for event in events { XCTAssertEqual(event.location, rowPoint) }
  }

  /// Chrome's `<datalist>` popup (run B): a layer-999 window, its rows AXStaticText "apricot" over an AXStaticText of the
  /// same frame. The hit answers the inner text; the row lists AXPress, which does nothing there, so it takes the post.
  func testADatalistRowIsPostedNeverPressedAndConfirmedByTheRowDying() throws {
    let window = Node(kAXWindowRole, rect(467, 220, 164, 94), title: "", subrole: "AXUnknown")
    let root = Node("AXGroup", rect(467, 220, 164, 94), parent: window)
    let list = Node("AXList", rect(471, 228, 156, 80), title: "Autofill", description: "Autofill", actions: ["AXPress"], parent: root)
    let group = Node("AXGroup", rect(471, 228, 156, 80), parent: list)
    let scroll = Node("AXScrollArea", rect(471, 228, 156, 80), parent: group)
    let rows = Node("AXGroup", rect(471, 228, 156, 80), parent: scroll)
    let apple = Node("AXStaticText", rect(475, 232, 148, 36), value: "apple", actions: ["AXPress"], parent: rows)
    _ = Node("AXStaticText", rect(475, 232, 148, 36), value: "apple", parent: apple)
    let apricot = Node("AXStaticText", rect(475, 268, 148, 36), value: "apricot", actions: ["AXPress"], parent: rows)
    let inner = Node("AXStaticText", rect(475, 268, 148, 36), value: "apricot", parent: apricot)
    let listed = ListedWindow(number: 131, owner: pid, layer: 999, bounds: rect(467, 220, 164, 94))
    let point = CGPoint(x: 549, y: 286)
    let decision = overlayPoint(hit: inner, pointContext(record([window]), overlay: listed, point: point), reads: reads)
    guard case .deliver(let target) = decision else { return XCTFail("delivered, not \(decision)") }
    XCTAssertEqual(target.kind, .datalist)
    XCTAssertEqual(target.route, .post)
    XCTAssertTrue(target.row === inner)
    var record = OverlayClickRecord(window: 131, by: .axHit)
    var meta = freshMeta()
    var posted = 0
    try deliver(target, point: point, shown: { _ in true }, onPost: { _ in posted += 1; inner.gone = true }, record: &record, meta: &meta)
    XCTAssertEqual(posted, 1)
    XCTAssertEqual(record.effect, .rowGone)
  }

  /// Chrome's permission bubble (run C): an alert dialog in a layer-0 window, its AXButton "Never allow", taken by the post
  /// (owner ruling 1042: on).
  func testAPermissionBubblesButtonIsPosted() throws {
    let bubble = permissionBubble()
    let decision = overlayPoint(hit: bubble.never, pointContext(record([bubble.window]), overlay: bubble.listed, point: bubble.point), reads: reads)
    guard case .deliver(let target) = decision else { return XCTFail("delivered, not \(decision)") }
    XCTAssertEqual(target.kind, .permissionBubble)
    XCTAssertTrue(OverlayKind.permissionBubble.delivers, "owner ruling 1042")
    var record = OverlayClickRecord(window: 132, by: .axHit)
    var meta = freshMeta()
    var open = true
    try deliver(target, point: bubble.point, shown: { _ in open }, onPost: { _ in open = false }, record: &record, meta: &meta)
    XCTAssertEqual(record.effect, .closed)
  }

  private func permissionBubble() -> (window: Node, never: Node, allow: Node, listed: ListedWindow, point: CGPoint) {
    let title = "http://127.0.0.1:49264 wants to: Know your location"
    let window = Node(kAXWindowRole, rect(521, 111, 320, 266), title: title, subrole: "AXUnknown")
    let dialog = Node("AXGroup", rect(521, 111, 320, 266), title: title, subrole: alertDialogSubrole, parent: window)
    var parent = Node("AXGroup", rect(521, 111, 320, 266), parent: dialog)
    for frame in [rect(521, 179, 320, 198), rect(521, 233, 320, 144), rect(541, 233, 280, 124)] { parent = Node("AXGroup", frame, parent: parent) }
    let allow = Node("AXButton", rect(541, 277, 280, 36), title: "Allow while visiting the site", description: "Allow while visiting the site",
                     actions: ["AXPress"], parent: parent)
    let never = Node("AXButton", rect(541, 321, 280, 36), title: "Never allow", description: "Never allow", actions: ["AXPress"], parent: parent)
    allow.enabled = true
    never.enabled = true
    return (window, never, allow, ListedWindow(number: 132, owner: pid, layer: 0, bounds: rect(521, 111, 320, 266)), CGPoint(x: 681, y: 339))
  }

  /// TextEdit's colour-well popover behind (run B): an AXPopover in the document window's tree (the hit is the observed
  /// window's, #452's `popover` signal), its swatch an AXButton described "rgb …" listing AXPress, which takes it (12/12;
  /// a background post does not). Pressed, nothing posted; confirmed by the popover's window closing.
  func testAnAppKitPopoversSwatchBehindIsItsAXPress() throws {
    let scene = popover()
    let decision = overlayPoint(hit: scene.swatch, pointContext(record([scene.window]), overlay: scene.listed, by: .popover,
                                                                point: scene.point, chromium: false), reads: reads)
    guard case .deliver(let target) = decision else { return XCTFail("delivered, not \(decision)") }
    XCTAssertEqual(target.kind, .appKitPopover)
    XCTAssertEqual(target.route, .press)
    XCTAssertTrue(target.pressed === scene.swatch)
    var pressed: [String] = []
    var open = true
    var record = OverlayClickRecord(window: 840, by: .popover)
    var meta = freshMeta()
    try deliver(target, point: scene.point, shown: { _ in open }, onPress: { node, action in
      XCTAssertTrue(node === scene.swatch)
      pressed.append(action)
      open = false
      return .success
    }, record: &record, meta: &meta)
    XCTAssertEqual(pressed, ["AXPress"])
    XCTAssertEqual(meta.inputRoute, .action)
    XCTAssertEqual(record.wire["route"] as? String, "AXPress")
    XCTAssertEqual(record.effect, .closed)
  }

  private func popover() -> (window: Node, swatch: Node, listed: ListedWindow, point: CGPoint) {
    let window = Node(kAXWindowRole, rect(400, 31, 620, 679), title: "p453.rtf", subrole: "AXStandardWindow")
    let well = Node("AXColorWell", rect(495, 70, 22, 22), description: "text color", value: "rgb 0 0 0 1", actions: ["AXPress"], parent: window)
    let popover = Node(kAXPopoverRole, rect(393, 91, 225, 246), parent: well)
    let grid = Node("AXGrid", rect(418, 137, 175, 147), parent: popover)
    _ = Node("AXButton", rect(436, 197, 13, 13), description: "rgb 0.1 0.2 0.3 1", actions: ["AXPress"], parent: grid)
    let swatch = Node("AXButton", rect(450, 197, 13, 13), description: "rgb 0.216814 0.102505 0.582303 1", actions: ["AXPress"], parent: grid)
    return (window, swatch, ListedWindow(number: 840, owner: pid, layer: 0, bounds: rect(393, 91, 225, 246)), CGPoint(x: 456.5, y: 203.5))
  }

  // MARK: Unconfirmed

  /// The post went, and the popup stayed for the whole wait: `clickUnconfirmed`, said to have been sent to the overlay.
  func testAnOverlayThatStaysAnswersClickUnconfirmed() throws {
    let scene = omnibox()
    guard case .deliver(let target) = overlayPoint(hit: scene.webArea, pointContext(record([scene.window]), overlay: scene.listed, point: rowPoint),
                                                   reads: reads) else { return XCTFail("delivered") }
    var record = OverlayClickRecord(window: 39, by: .axHit)
    var meta = freshMeta()
    var posted = 0
    XCTAssertThrowsError(try deliver(target, point: rowPoint, shown: { _ in true }, onPost: { _ in posted += 1 }, record: &record, meta: &meta)) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "clickUnconfirmed")
      XCTAssertTrue(($0 as? EngineError)?.message.contains("not seen to close") == true)
    }
    XCTAssertEqual(posted, 1, "sent once, never again")
    XCTAssertEqual(record.effect, .unconfirmed)
    XCTAssertGreaterThanOrEqual(record.ms ?? 0, overlayConfirmMs)
    XCTAssertGreaterThan(record.polls, 1)
    XCTAssertNotNil(meta.startedAt, "the meta says the click was sent")
  }

  /// An unlisted window (nil) is unknown, never closed: still unconfirmed, as the popover's AXPress that left it open.
  func testAPressedPopoverThatStaysAndAnUnreadListAreUnconfirmed() throws {
    let scene = popover()
    guard case .deliver(let target) = overlayPoint(hit: scene.swatch, pointContext(record([scene.window]), overlay: scene.listed, by: .popover,
                                                                                   point: scene.point, chromium: false), reads: reads)
    else { return XCTFail("delivered") }
    var record = OverlayClickRecord(window: 840, by: .popover)
    var meta = freshMeta()
    XCTAssertThrowsError(try deliver(target, point: scene.point, shown: { _ in nil }, onPress: { _, _ in .success }, record: &record, meta: &meta)) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "clickUnconfirmed")
    }
    XCTAssertEqual(record.effect, .unconfirmed)
  }

  // MARK: Refused, #452's refusal standing

  private func refusal(_ decision: OverlayDecision<Node>) -> OverlayRefusal? {
    if case .refuse(let why, _) = decision { return why }
    return nil
  }

  /// The row under the point reads other text than the screenshot's (its handle the same): refused, never taken.
  func testARowReadingOtherTextIsRefused() {
    let scene = omnibox()
    let nodes = record([scene.window])
    scene.rows[1].value = "probe453 page http://127.0.0.1:49171/results-gamma location from history, 2 of 3"
    XCTAssertEqual(refusal(overlayPoint(hit: scene.webArea, pointContext(nodes, overlay: scene.listed, point: rowPoint), reads: reads)), .textChanged)
  }

  /// The row moved off its recorded frame (10 pt down, still under the point): refused.
  func testARowOffItsFrameIsRefused() {
    let scene = omnibox()
    let nodes = record([scene.window])
    scene.rows[1].frame = rect(515, 166, 426, 40)
    scene.rows[1].children[0].frame = rect(515, 166, 410, 40)
    XCTAssertEqual(refusal(overlayPoint(hit: scene.webArea, pointContext(nodes, overlay: scene.listed, point: rowPoint), reads: reads)), .frameMoved)
  }

  /// The popup's window is not one the screenshot's window list held (a popup opened anew, another number): refused.
  func testAnOverlayWindowTheScreenshotDidNotListIsRefused() {
    let scene = omnibox()
    let nodes = record([scene.window])
    XCTAssertEqual(refusal(overlayPoint(hit: scene.webArea, pointContext(nodes, overlay: scene.listed, point: rowPoint, recorded: [31]),
                                        reads: reads)), .otherWindow)
    XCTAssertEqual(refusal(overlayPoint(hit: scene.webArea, pointContext(nodes, overlay: scene.listed, point: rowPoint, recorded: nil),
                                        reads: reads)), .otherWindow, "no list recorded: nothing to compare")
    XCTAssertEqual(refusal(overlayPoint(hit: scene.webArea, pointContext(nodes, overlay: nil, point: rowPoint), reads: reads)), .unread)
  }

  /// The row under the point is not a node the observation recorded (a row added since): refused.
  func testARowTheRecordLacksIsRefused() {
    let scene = omnibox()
    let added = scene.list.children.remove(at: 1)
    let nodes = record([scene.window])
    scene.list.children.insert(added, at: 1)
    XCTAssertEqual(refusal(overlayPoint(hit: scene.webArea, pointContext(nodes, overlay: scene.listed, point: rowPoint), reads: reads)), .notRecorded)
  }

  /// The textless node at the point is the recorded one, but it now lies under another row than the record's: the row
  /// whose text the record compares is not on the hit's chain, so it is refused, never taken for that text.
  func testARecordedRowOffTheHitsChainIsRefused() {
    let scene = omnibox()
    let nodes = record([scene.window])
    scene.rows[1].children[0].parent = scene.rows[0]
    XCTAssertEqual(refusal(overlayPoint(hit: scene.webArea, pointContext(nodes, overlay: scene.listed, point: rowPoint), reads: reads)), .notRecorded)
  }

  /// The hit stops short of the row (it answers the list), so the record's row under it is not what the hit reaches.
  func testAHitShortOfTheRecordedRowIsRefused() {
    let scene = omnibox()
    let nodes = record([scene.window])
    // The list's children do not read now, so the descent stops at it.
    let decision = overlayPoint(hit: scene.list, pointContext(nodes, overlay: scene.listed, point: rowPoint), reads: OverlayReads(
      stale: StalePointReads(role: { $0.role }, frame: { $0.frame }, parent: { $0.parent }, children: { $0 === scene.list ? nil : $0.children },
                             title: { $0.title }, description: { $0.description }, value: { $0.value }, actions: { $0.actions },
                             same: { $0 === $1 }, gone: { $0.gone }),
      subrole: { $0.subrole }, enabled: { $0.enabled }))
    XCTAssertEqual(refusal(decision), .deeperRecorded)
  }

  /// A disabled button in the bubble: refused.
  func testADisabledRowIsRefused() {
    let bubble = permissionBubble()
    let nodes = record([bubble.window])
    bubble.never.enabled = false
    XCTAssertEqual(refusal(overlayPoint(hit: bubble.never, pointContext(nodes, overlay: bubble.listed, point: bubble.point), reads: reads)), .disabled)
  }

  /// Overlays the list does not name: an extension's popup (a web area of another title in a window of Chrome's), a
  /// Chromium bubble that is no alert dialog, a native app's own window over the observed one, and a popover in Chrome.
  func testAnOverlayOfAnUnknownKindIsRefused() {
    let scene = omnibox()
    scene.webArea.title = "Extension"
    XCTAssertEqual(refusal(overlayPoint(hit: scene.webArea, pointContext(record([scene.window]), overlay: scene.listed, point: rowPoint),
                                        reads: reads)), .unknownKind)
    let bubble = permissionBubble()
    bubble.never.parent?.parent?.parent?.parent?.parent?.subrole = "AXApplicationDialog"
    let nodes = record([bubble.window])
    XCTAssertEqual(refusal(overlayPoint(hit: bubble.never, pointContext(nodes, overlay: bubble.listed, point: bubble.point), reads: reads)),
                   .unknownKind, "a dialog that is not an alert")
    let native = permissionBubble()
    XCTAssertEqual(refusal(overlayPoint(hit: native.never, pointContext(record([native.window]), overlay: native.listed, point: native.point,
                                                                       chromium: false), reads: reads)), .unknownKind, "not Chromium's")
    let swatch = popover()
    XCTAssertEqual(refusal(overlayPoint(hit: swatch.swatch, pointContext(record([swatch.window]), overlay: swatch.listed, by: .popover,
                                                                        point: swatch.point, chromium: true), reads: reads)), .unknownKind)
  }

  /// A popover's swatch listing no AXPress: refused, nothing posted in its place.
  func testAPopoverRowWithoutAXPressIsRefused() {
    let scene = popover()
    let nodes = record([scene.window])
    scene.swatch.actions = []
    XCTAssertEqual(refusal(overlayPoint(hit: scene.swatch, pointContext(nodes, overlay: scene.listed, by: .popover, point: scene.point,
                                                                       chromium: false), reads: reads)), .noAction)
  }

  // MARK: A list re-laid out by typing

  /// One more character typed re-lays the rows out (the measurement: 2 to 4 times within about 250 ms, the popup's window
  /// number unchanged). Chromium keeps the row's element and gives it the next suggestion's text: the row under the point
  /// reads other text, refused; where the row under the point still reads the screenshot's text at its frame, it is taken.
  func testAListReLaidOutRefusesARowWithOtherTextAndTakesOneWithTheSame() {
    let scene = omnibox()
    let nodes = record([scene.window])
    // Typed "a": the second row now shows what the third did; the first is unchanged.
    let typed = scene.rows.map { $0.value }
    scene.rows[1].value = typed[2]
    scene.rows[2].value = "http://127.0.0.1:49171/results-a search, 3 of 3"
    XCTAssertEqual(refusal(overlayPoint(hit: scene.webArea, pointContext(nodes, overlay: scene.listed, point: rowPoint), reads: reads)), .textChanged,
                   "the row under the point is another suggestion now")
    let first = CGPoint(x: 728, y: 136)
    guard case .deliver(let target) = overlayPoint(hit: scene.webArea, pointContext(nodes, overlay: scene.listed, point: first), reads: reads) else {
      return XCTFail("the first row reads as the screenshot showed it: taken")
    }
    XCTAssertTrue(target.row === scene.rows[0])
  }

  /// The rows rebuilt as new elements: the one under the point is none the record holds, refused.
  func testAListRebuiltWithNewRowsIsRefused() {
    let scene = omnibox()
    let nodes = record([scene.window])
    for row in scene.rows { row.gone = true }
    scene.list.children = []
    for (index, old) in scene.rows.enumerated() {
      let row = Node("AXStaticText", old.frame, value: old.value, actions: old.actions, parent: scene.list)
      _ = Node("AXGroup", rect(515, 116 + CGFloat(index) * 40, 410, 40), parent: row)
    }
    XCTAssertEqual(refusal(overlayPoint(hit: scene.webArea, pointContext(nodes, overlay: scene.listed, point: rowPoint), reads: reads)), .notRecorded)
  }

  /// The observed window moved since the screenshot: the record's frames are compared shifted with it.
  func testTheWindowsShiftIsAppliedToTheRecord() {
    let scene = omnibox()
    let nodes = record([scene.window])
    func move(_ node: Node) {
      node.frame = node.frame?.offsetBy(dx: 30, dy: 10)
      node.children.forEach(move)
    }
    move(scene.window)
    var context = pointContext(nodes, overlay: scene.listed, point: CGPoint(x: rowPoint.x + 30, y: rowPoint.y + 10))
    context.shift = CGVector(dx: 30, dy: 10)
    guard case .deliver(let target) = overlayPoint(hit: scene.webArea, context, reads: reads) else { return XCTFail("delivered") }
    XCTAssertTrue(target.row === scene.rows[1])
  }

  // MARK: #456's rechecks

  /// An element route's recheck after its wait refuses `appWindowOverPoint`: with the gate's overlay rule delivering, the
  /// route ends with `OverlayClickDelivered` and acts on nothing of its own; with the rule declining, or no rule, #452's
  /// refusal is thrown as before.
  func testARecheckRefusingOverAnOverlayDeliversThroughTheGatesRule() throws {
    let scene = omnibox()
    let nodes = record([scene.window])
    let page = Node("AXButton", rect(600, 160, 80, 30))
    let kept = StalePointVerdict<Node>(reason: .sameElement, node: nil, current: page)
    let over = StalePointVerdict<Node>(reason: .appWindowOverPoint, hit: nil, point: rowPoint, overWindow: 39, overBy: .axHit,
                                       overListed: scene.listed, observedListed: browserWindow, overAnswered: scene.webArea)
    var gate = StalePointGate(first: kept, firstMs: 1) { StalePointRecheck(over) }
    var delivered: [OverlayTarget<Node>] = []
    gate.overlay = { [self] verdict, meta in
      guard case .deliver(let target) = overlayPoint(hit: verdict.overAnswered, pointContext(nodes, overlay: verdict.overListed, point: rowPoint),
                                                     reads: reads) else { return false }
      delivered.append(target)
      meta.inputRoute = .plainPost
      return true
    }
    var meta = freshMeta()
    XCTAssertThrowsError(try stalePointChecked(gate.check(page, waited: true, now: { 0 }, reads: reads.stale), gate: gate, meta: &meta)) {
      XCTAssertTrue($0 is OverlayClickDelivered, "\($0)")
    }
    XCTAssertTrue(delivered.first?.row === scene.rows[1])
    XCTAssertEqual(meta.stalePoint?.reason, .appWindowOverPoint)
    XCTAssertEqual(meta.inputRoute, .plainPost)
    // The row reads other text now: the rule declines, and #452's refusal stands.
    scene.rows[1].value = "other"
    XCTAssertThrowsError(try stalePointChecked(gate.check(page, waited: true, now: { 0 }, reads: reads.stale), gate: gate, meta: &meta)) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "appWindowOverPoint")
    }
    gate.overlay = nil
    XCTAssertThrowsError(try stalePointChecked(gate.check(page, waited: true, now: { 0 }, reads: reads.stale), gate: gate, meta: &meta)) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "appWindowOverPoint")
    }
    // Another refusal never reaches the rule.
    var asked = false
    var other = StalePointGate(first: kept, firstMs: 1) { StalePointRecheck(StalePointVerdict<Node>(reason: .newWindow)) }
    other.overlay = { _, _ in asked = true; return true }
    XCTAssertThrowsError(try stalePointChecked(other.check(page, waited: true, now: { 0 }, reads: reads.stale), gate: other, meta: &meta)) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "screenChangedSinceScreenshot")
    }
    XCTAssertFalse(asked)
  }

  /// `guardedPointVerdict` carries what #453 reads on its refusal: the hit-test's answer and both windows as listed.
  func testTheRefusalCarriesTheAnswerAndBothListings() {
    let scene = omnibox()
    let verdict = guardedPointVerdict(at: rowPoint, hit: Node?.none, place: .otherWindow(39), answered: scene.webArea, target: 31, pid: pid,
                                      recorded: nil, windows: { [scene.listed, self.browserWindow] }) {
      XCTFail("the tree is not read")
      return StalePointVerdict(reason: .unrecorded)
    }
    XCTAssertEqual(verdict.reason, .appWindowOverPoint)
    XCTAssertTrue(verdict.overAnswered === scene.webArea)
    XCTAssertEqual(verdict.overListed, scene.listed)
    XCTAssertEqual(verdict.observedListed, browserWindow)
  }

  // MARK: The meta

  func testTheRecordsWireForARefusal() {
    XCTAssertEqual(OverlayClickRecord(window: 39, by: .axHit, kind: .omniboxPopup, refused: .textChanged).wire as NSDictionary,
                   ["window": 39, "by": "axHit", "kind": "omniboxPopup", "refused": "textChanged"])
    XCTAssertEqual(OverlayClickRecord(window: 132, by: .axHit, kind: .permissionBubble, route: .post, effect: .closed, polls: 2, ms: 20).wire as NSDictionary,
                   ["window": 132, "by": "axHit", "kind": "permissionBubble", "route": "post", "effect": "closed", "polls": 2, "ms": 20])
    XCTAssertEqual(Set(OverlayKind.allCases.filter(\.delivers)), Set(OverlayKind.allCases), "every listed kind is on")
  }
}
