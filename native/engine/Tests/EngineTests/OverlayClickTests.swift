import ApplicationServices
import CoreGraphics
import Foundation
import XCTest
@testable import Engine

// #453 (ruling 1071, OverlayClick.swift): where #452 refuses a plain left click on a window of the app's own over the
// observed one (`appWindowOverPoint`), a row of one of four overlays that the observation recorded at the point is carried
// by AXPress on its recorded handle, or #452's refusal stands. Fakes shaped as kit `probe/453-measure` found them: the
// omnibox popup (its own AXWindow holding the "Omnibox Popup" web area, whose rows are AXStaticTexts; Chrome's first
// hit-test answers the web area), the `<datalist>` popup (layer 999, an AXList of AXStaticTexts), the permission bubble
// (an alert dialog's AXButtons) and TextEdit's colour-well popover (an AXPopover of swatch AXButtons in the document
// window's tree). The record holds each overlay's tree under the observed window's, as the walk records it.

final class OverlayClickTests: XCTestCase {
  private final class Node {
    let role: String
    var title: String?
    var description: String?
    var value: String?
    var subrole: String?
    var frame: CGRect?
    var enabled: OverlayEnabledRead = .absent
    var gone = false
    /// The role it reads now, when another than the recorded one.
    var roleNow: String?
    /// Its label's reads fail now (a messaging timeout).
    var labelFails = false
    /// Held strongly (no child links, so no cycle): an overlay the record lacks still reads up to its window.
    var parent: Node?

    init(_ role: String, title: String? = nil, description: String? = nil, value: String? = nil, subrole: String? = nil,
         frame: CGRect? = nil, parent: Node? = nil) {
      (self.role, self.title, self.description, self.value, self.subrole, self.frame, self.parent) =
        (role, title, description, value, subrole, frame, parent)
    }
  }

  private let point = CGPoint(x: 300, y: 120)
  private let overWindow: CGWindowID = 49

  /// Runs on every label read (the time those AX reads take, or what happens meanwhile).
  private var duringReads: () -> Void = {}

  private var reads: OverlayReads<Node> {
    let during = duringReads
    let stale = StalePointReads<Node>(
      role: { $0.gone ? nil : $0.roleNow ?? $0.role }, frame: { $0.gone ? nil : $0.frame }, parent: { $0.parent }, children: { _ in nil },
      title: { $0.title }, description: { $0.description }, value: { $0.value },
      label: { node, part in
        during()
        if node.labelFails || node.gone { return .unreadable }
        switch part {
        case .title: return .text(node.title)
        case .description: return .text(node.description)
        case .value: return .text(node.value)
        }
      }, same: { $0 === $1 }, gone: { $0.gone })
    return OverlayReads(stale: stale, enabled: { $0.enabled })
  }

  /// A recorded node, as the walk recorded it then (its labels and frame copied).
  private func recorded(_ node: Node, depth: Int, ancestor: Int?) -> ScreenshotNode<Node> {
    var record = ScreenshotNode(element: node, role: node.role, title: node.title, description: node.description, subrole: node.subrole,
                                value: node.role == "AXStaticText" ? node.value : nil, editableAncestor: nil, labelsUnread: [],
                                frame: node.frame!, shown: node.frame, depth: depth, subtreeRecorded: true)
    record.ancestor = ancestor
    return record
  }

  private func verdict(by: AppWindowSignal = .axHit, overLayer: Int? = 0, observedLayer: Int? = 0) -> StalePointVerdict<Node> {
    StalePointVerdict(reason: .appWindowOverPoint, point: point, overWindow: overWindow, overBy: by, overLayer: overLayer,
                      observedLayer: observedLayer)
  }

  private func freshMeta() -> InputMeta {
    InputMeta(ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
  }

  // MARK: Scenes

  private struct Scene {
    var nodes: [ScreenshotNode<Node>]
    let answered: Node
    let row: Node
    var verdict: StalePointVerdict<Node>
    var chromium = true
    /// The other row of the overlay, beside the one at the point.
    let neighbour: Node
    /// The windows the screenshot's list held, front to back: the overlay (49) over the observed window (28).
    var windows: [ListedWindow] = [ListedWindow(number: 49, owner: 501, layer: 0, bounds: CGRect(x: 90, y: 60, width: 440, height: 140)),
                                   ListedWindow(number: 28, owner: 501, layer: 0, bounds: CGRect(x: 0, y: 0, width: 1000, height: 800))]
    /// The elements whose children the walk did not all read or record.
    var partial: [Node] = []
  }

  /// The browser window and, under the popup, a deeper page link at the same point (deeper in the record than any of the
  /// popup's rows), which the click must never take for the row.
  private func browser() -> (window: Node, nodes: [ScreenshotNode<Node>]) {
    let window = Node("AXWindow", title: "Page", frame: CGRect(x: 0, y: 0, width: 1000, height: 800))
    let page = Node("AXWebArea", title: "Page", frame: CGRect(x: 0, y: 80, width: 1000, height: 720), parent: window)
    let group = Node("AXGroup", frame: CGRect(x: 0, y: 80, width: 1000, height: 400), parent: page)
    let inner = Node("AXGroup", frame: CGRect(x: 50, y: 90, width: 600, height: 200), parent: group)
    let section = Node("AXGroup", frame: CGRect(x: 80, y: 95, width: 500, height: 100), parent: inner)
    let link = Node("AXLink", title: "Beneath", frame: CGRect(x: 100, y: 100, width: 400, height: 40), parent: section)
    return (window, [recorded(window, depth: 0, ancestor: nil), recorded(page, depth: 1, ancestor: 0), recorded(group, depth: 2, ancestor: 1),
                     recorded(inner, depth: 3, ancestor: 2), recorded(section, depth: 4, ancestor: 3), recorded(link, depth: 5, ancestor: 4)])
  }

  /// Chrome's omnibox popup: its AXWindow > the "Omnibox Popup" web area > a group > two rows; the hit answers the web area.
  private func omnibox() -> Scene {
    var (_, nodes) = browser()
    let popup = Node("AXWindow", frame: CGRect(x: 90, y: 60, width: 440, height: 140))
    let page = Node("AXWebArea", title: omniboxPopupTitle, frame: CGRect(x: 90, y: 92, width: 440, height: 100), parent: popup)
    let list = Node("AXGroup", frame: CGRect(x: 95, y: 98, width: 430, height: 84), parent: page)
    let first = Node("AXStaticText", value: "probe /results-alpha, 1 of 2", frame: CGRect(x: 100, y: 100, width: 426, height: 40), parent: list)
    let second = Node("AXStaticText", value: "probe /results-beta, 2 of 2", frame: CGRect(x: 100, y: 140, width: 426, height: 40), parent: list)
    let base = nodes.count
    nodes += [recorded(popup, depth: 1, ancestor: 0), recorded(page, depth: 2, ancestor: base), recorded(list, depth: 3, ancestor: base + 1),
              recorded(first, depth: 4, ancestor: base + 2), recorded(second, depth: 4, ancestor: base + 2)]
    return Scene(nodes: nodes, answered: page, row: first, verdict: verdict(), neighbour: second)
  }

  /// Chromium's `<datalist>` popup at layer 999: its AXWindow > an AXList > the options; the hit answers the option.
  private func datalist() -> Scene {
    var (_, nodes) = browser()
    let popup = Node("AXWindow", frame: CGRect(x: 95, y: 95, width: 440, height: 90))
    let list = Node("AXList", frame: CGRect(x: 95, y: 95, width: 440, height: 90), parent: popup)
    let apricot = Node("AXStaticText", value: "apricot", frame: CGRect(x: 100, y: 100, width: 426, height: 40), parent: list)
    let banana = Node("AXStaticText", value: "banana", frame: CGRect(x: 100, y: 140, width: 426, height: 40), parent: list)
    let base = nodes.count
    nodes += [recorded(popup, depth: 1, ancestor: 0), recorded(list, depth: 2, ancestor: base), recorded(apricot, depth: 3, ancestor: base + 1),
              recorded(banana, depth: 3, ancestor: base + 1)]
    return Scene(nodes: nodes, answered: apricot, row: apricot, verdict: verdict(overLayer: 999), neighbour: banana)
  }

  /// Chromium's permission bubble: its AXWindow > the alert dialog > "Allow this time" over the point, "Never allow" below.
  private func permission() -> Scene {
    var (_, nodes) = browser()
    let bubble = Node("AXWindow", frame: CGRect(x: 90, y: 60, width: 440, height: 140))
    let dialog = Node("AXGroup", subrole: alertDialogSubrole, frame: CGRect(x: 90, y: 60, width: 440, height: 140), parent: bubble)
    let allow = Node("AXButton", title: "Allow this time", frame: CGRect(x: 100, y: 100, width: 426, height: 40), parent: dialog)
    let never = Node("AXButton", title: "Never allow", frame: CGRect(x: 100, y: 145, width: 426, height: 40), parent: dialog)
    (allow.enabled, never.enabled) = (.enabled, .enabled)
    let base = nodes.count
    nodes += [recorded(bubble, depth: 1, ancestor: 0), recorded(dialog, depth: 2, ancestor: base), recorded(allow, depth: 3, ancestor: base + 1),
              recorded(never, depth: 3, ancestor: base + 1)]
    return Scene(nodes: nodes, answered: allow, row: allow, verdict: verdict(), neighbour: never)
  }

  /// TextEdit's colour-well popover: the document window > an AXPopover > swatches, the document's text beneath at the
  /// point; #452's popover signal, the app not Chromium's.
  private func popover() -> Scene {
    let window = Node("AXWindow", title: "Untitled", frame: CGRect(x: 0, y: 0, width: 1000, height: 800))
    let text = Node("AXTextArea", value: "", frame: CGRect(x: 0, y: 40, width: 1000, height: 760), parent: window)
    let popover = Node("AXPopover", frame: CGRect(x: 90, y: 60, width: 440, height: 140), parent: window)
    let red = Node("AXButton", description: "rgb 1 0 0 1", frame: CGRect(x: 100, y: 100, width: 40, height: 40), parent: popover)
    let blue = Node("AXButton", description: "rgb 0 0 1 1", frame: CGRect(x: 140, y: 100, width: 40, height: 40), parent: popover)
    (red.enabled, blue.enabled) = (.enabled, .enabled)
    let nodes = [recorded(window, depth: 0, ancestor: nil), recorded(text, depth: 1, ancestor: 0), recorded(popover, depth: 1, ancestor: 0),
                 recorded(red, depth: 2, ancestor: 2), recorded(blue, depth: 2, ancestor: 2)]
    var scene = Scene(nodes: nodes, answered: red, row: red, verdict: verdict(by: .popover), neighbour: blue)
    scene.chromium = false
    // The swatch at the point: (110, 120) lies in it and in the text area beneath.
    scene.verdict.point = CGPoint(x: 110, y: 120)
    return scene
  }

  private func decide(_ scene: Scene, shift: CGVector = .zero, answered: Node?? = .none) -> OverlayPoint<Node> {
    let record = OverlayRecord(nodes: scene.nodes, recorded: { node in !scene.partial.contains { $0 === node } }, windows: scene.windows,
                               observedWindow: 28, pid: 501)
    return overlayPoint(scene.verdict, answered: answered ?? scene.answered, record: record, shift: shift, chromium: scene.chromium, reads: reads)
  }

  private func refusal(_ decision: OverlayPoint<Node>) -> OverlayRefusal? {
    if case .refuse(let why, _, _, _) = decision { return why }
    return nil
  }

  /// The decision carried out over a fake clock; `onPress` runs as the AXPress is performed (the app taking it).
  private func click(_ decision: OverlayPoint<Node>, shown: @escaping (CGWindowID) -> Bool?, meta: inout InputMeta,
                     beforeDispatch: @escaping (Node) throws -> Void = { _ in }, beforePress: @escaping () throws -> Void = {},
                     announce: @escaping () -> Void = {}, onPress: @escaping (Node, String) -> AXError) throws -> Bool {
    var clock = 0.0
    return try overlayClick(decision, app: "Google Chrome", reads: reads, windowShown: shown, now: { clock }, sleep: { clock += $0 },
                            prepare: beforeDispatch, beforePress: beforePress, announce: announce, perform: onPress, meta: &meta)
  }

  private func wire(_ meta: InputMeta) -> NSDictionary? { (meta.wire["overlayClick"] as? [String: Any]).map { $0 as NSDictionary } }

  // MARK: Delivered, each kind

  /// Each overlay kind: the recorded row at the point (never the deeper page node beneath it, nor its neighbour) is pressed
  /// by its own handle with AXPress, nothing posted, and the click succeeds once the overlay's window leaves the screen.
  func testEachKindsRecordedRowIsPressedByItsHandleAndConfirmedByTheWindowLeaving() throws {
    let scenes: [(OverlayKind, Scene)] = [(.omniboxPopup, omnibox()), (.datalist, datalist()), (.permissionBubble, permission()),
                                          (.appKitPopover, popover())]
    for (kind, scene) in scenes {
      let decision = decide(scene)
      guard case .deliver(let target) = decision else { XCTFail("\(kind): delivered, not \(decision)"); continue }
      XCTAssertEqual(target.kind, kind)
      XCTAssertTrue(target.row.element === scene.row, "\(kind): the recorded row")
      var pressed: [(Node, String)] = []
      var open = true
      var meta = freshMeta()
      let carried = try click(decision, shown: { $0 == self.overWindow ? open : nil }, meta: &meta) { node, action in
        pressed.append((node, action))
        open = false
        return .success
      }
      XCTAssertTrue(carried, "\(kind)")
      XCTAssertEqual(pressed.count, 1, "\(kind): one press")
      XCTAssertTrue(pressed.first?.0 === scene.row, "\(kind): on the recorded handle")
      XCTAssertEqual(pressed.first?.1, "AXPress")
      XCTAssertEqual(meta.inputRoute, .action)
      XCTAssertEqual(wire(meta), ["window": 49, "by": scene.verdict.overBy!.rawValue, "kind": kind.rawValue, "route": "action",
                                  "confirmed": true, "polls": 1, "ms": 0] as NSDictionary)
    }
  }

  /// Ruling 1072, item 1: the row dying while its window stays (a list rebuilding its rows, the press having changed
  /// nothing) is no confirmation: clickUnconfirmed after the whole wait.
  func testTheRowDyingWithItsWindowOpenIsUnconfirmed() {
    let scene = omnibox()
    var meta = freshMeta()
    var clock = 0.0
    XCTAssertThrowsError(try overlayClick(decide(scene), app: "Google Chrome", reads: reads, windowShown: { _ in true },
                                          now: { clock }, sleep: { clock += $0; if clock >= 60 { scene.row.gone = true } },
                                          prepare: { _ in }, beforePress: {}, perform: { _, _ in .success }, meta: &meta)) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "clickUnconfirmed")
    }
    XCTAssertEqual(wire(meta)?["confirmed"] as? Bool, false)
    XCTAssertEqual(wire(meta)?["ms"] as? Double, 500)
  }

  /// Ruling 1072, item 2: two overlays of the app's over the point in the screenshot (a bubble over the omnibox popup), the
  /// front one closed since, so the hit now reaches the back one's unchanged row, which the screenshot showed covered:
  /// refused. So is a list that did not read, or held only another window over the point than the one the hit reaches.
  func testTwoRecordedOverlaysAtThePointOrAnotherOneRefuse() {
    var scene = omnibox()
    let front = ListedWindow(number: 51, owner: 501, layer: 0, bounds: CGRect(x: 200, y: 90, width: 300, height: 120))
    scene.windows.insert(front, at: 0)
    XCTAssertEqual(refusal(decide(scene)), .notOneOverlay, "two overlays at the point")
    var beside = omnibox()
    beside.windows.insert(ListedWindow(number: 51, owner: 501, layer: 0, bounds: CGRect(x: 600, y: 90, width: 300, height: 120)), at: 0)
    guard case .deliver = decide(beside) else { return XCTFail("another overlay away from the point changes nothing") }
    var otherApp = omnibox()
    otherApp.windows.insert(ListedWindow(number: 60, owner: 777, layer: 0, bounds: front.bounds), at: 0)
    guard case .deliver = decide(otherApp) else { return XCTFail("another app's window is no overlay of the app's") }
    var another = omnibox()
    another.windows[0] = ListedWindow(number: 52, owner: 501, layer: 0, bounds: another.windows[0].bounds)
    XCTAssertEqual(refusal(decide(another)), .notOneOverlay, "the screenshot's overlay is not the one the hit reaches")
    var behind = omnibox()
    behind.windows.reverse()
    XCTAssertEqual(refusal(decide(behind)), .notOneOverlay, "behind the observed window it lay over nothing")
    var unread = omnibox()
    unread.windows = []
    XCTAssertEqual(refusal(decide(unread)), .notOneOverlay, "a list without the observed window")
  }

  /// Ruling 1072, item 3: the row's recorded subtree not whole (its children's read failed, a child of its own child left
  /// out, or its subtree cut): refused.
  func testAPartlyRecordedRowRefuses() {
    var unread = omnibox()
    unread.partial = [unread.row]
    XCTAssertEqual(refusal(decide(unread)), .partlyRecorded, "the row's children not read or recorded")
    var cut = omnibox()
    let at = cut.nodes.firstIndex { $0.element === cut.row }!
    let kept = cut.nodes[at]
    cut.nodes[at] = ScreenshotNode(element: kept.element, role: kept.role, title: kept.title, description: kept.description, subrole: kept.subrole,
                                   value: kept.value, editableAncestor: nil, labelsUnread: [], frame: kept.frame, shown: kept.shown, depth: kept.depth,
                                   subtreeRecorded: false)
    cut.nodes[at].ancestor = kept.ancestor
    XCTAssertEqual(refusal(decide(cut)), .partlyRecorded, "children left out")
    var deeper = omnibox()
    let rowAt = deeper.nodes.firstIndex { $0.element === deeper.row }!
    let icon = Node("AXImage", frame: CGRect(x: 480, y: 105, width: 20, height: 20), parent: deeper.row)
    deeper.nodes.append(recorded(icon, depth: 5, ancestor: rowAt))
    deeper.partial = [icon]
    XCTAssertEqual(refusal(decide(deeper)), .partlyRecorded, "a recorded child's children not all recorded")
    let frameless = omnibox()
    let group = Node("AXGroup", parent: frameless.row)
    var unframed = ScreenshotNode(element: group, role: "AXGroup", title: nil, description: nil, subrole: nil, value: nil, editableAncestor: nil,
                                  labelsUnread: [], frame: .null, shown: nil, depth: 5, subtreeRecorded: true)
    unframed.ancestor = frameless.nodes.firstIndex { $0.element === frameless.row }
    let record = OverlayRecord(nodes: frameless.nodes, frameless: [unframed], recorded: { $0 !== group }, windows: frameless.windows,
                               observedWindow: 28, pid: 501)
    let decision = overlayPoint(frameless.verdict, answered: frameless.answered, record: record, shift: .zero, chromium: true, reads: reads)
    XCTAssertEqual(refusal(decision), .partlyRecorded, "a frameless child's children not read")
    var elsewhere = omnibox()
    elsewhere.partial = [elsewhere.neighbour]
    guard case .deliver = decide(elsewhere) else { return XCTFail("another row's coverage is not the row's") }
  }

  /// Ruling 1072, item 4: each label part compared on its own: a description changed under an unchanged title, or a
  /// recorded description that no longer reads or has gone, refuses (the first non-empty part alone agreed).
  func testEachLabelPartIsComparedOnItsOwn() {
    var scene = permission()
    scene.row.description = "Allows the site to use MIDI devices"
    let at = scene.nodes.firstIndex { $0.element === scene.row }!
    scene.nodes[at] = recorded(scene.row, depth: scene.nodes[at].depth, ancestor: scene.nodes[at].ancestor)
    let dialog = scene.row.parent
    guard case .deliver = decide(scene, answered: .some(dialog)) else { return XCTFail("both parts unchanged") }
    scene.row.description = "Allows the site to use your camera"
    XCTAssertEqual(refusal(decide(scene, answered: .some(dialog))), .labelChanged, "the description changed under the same title")
    scene.row.description = nil
    XCTAssertEqual(refusal(decide(scene, answered: .some(dialog))), .labelChanged, "the recorded description gone")
    let gained = permission()
    gained.row.description = "new"
    XCTAssertEqual(refusal(decide(gained, answered: .some(gained.row.parent))), .labelChanged, "a part gained since")
  }

  /// Ruling 1072, item 5: the identity is read again just before the press, after the owner's and intervention's
  /// preparation: a row relabelled (or moved, or disabled) meanwhile is not pressed, and #452's refusal stands.
  func testARowChangedDuringThePreparationIsNotPressed() throws {
    let changes: [(String, OverlayRefusal, (Node) -> Void)] = [
      ("relabelled", .labelChanged, { $0.title = "Block" }), ("moved", .frameMoved, { $0.frame = $0.frame?.offsetBy(dx: 0, dy: 40) }),
      ("disabled", .disabled, { $0.enabled = .disabled }),
    ]
    for (name, expected, change) in changes {
      let scene = permission()
      var meta = freshMeta()
      var pressed = 0
      let carried = try click(decide(scene), shown: { _ in true }, meta: &meta, beforeDispatch: { change($0) }) { _, _ in pressed += 1; return .success }
      XCTAssertFalse(carried, name)
      XCTAssertEqual(pressed, 0, "\(name): nothing pressed")
      XCTAssertNil(meta.startedAt, "\(name): nothing sent")
      XCTAssertEqual(wire(meta), ["window": 49, "by": "axHit", "kind": "permissionBubble", "refused": expected.rawValue] as NSDictionary, name)
    }
  }

  /// The review of c8858c2a..e7e78424, P1: the request expiring, or the person's input, during the identity's reads just
  /// before the press (each check passed before them) sends no press, with main's answers: timeoutReached and
  /// userIntervened. P3: the agent cursor's click is announced only once every check has passed.
  func testAnExpiryOrAnInterventionDuringTheLastReadsSendsNoPress() {
    let cases: [(String, String)] = [("expired", "timeoutReached"), ("intervened", userChanged("Google Chrome").errorName)]
    for (name, expected) in cases {
      let scene = permission()
      let decision = decide(scene)
      var clock = 0.0
      let deadline = 10.0
      var intervened = false
      duringReads = { if name == "expired" { clock = 20 } else { intervened = true } }
      defer { duringReads = {} }
      func checks() throws {
        if clock >= deadline { throw overlayDeadlinePassed }
        if intervened { throw userChanged("Google Chrome") }
      }
      var meta = freshMeta()
      var pressed = 0
      var announced = 0
      XCTAssertThrowsError(try click(decision, shown: { _ in true }, meta: &meta, beforeDispatch: { _ in try checks() }, beforePress: checks,
                                     announce: { announced += 1 }) { _, _ in pressed += 1; return .success }) {
        XCTAssertEqual(($0 as? EngineError)?.errorName, expected, name)
      }
      XCTAssertEqual(pressed, 0, "\(name): no press")
      XCTAssertEqual(announced, 0, "\(name): no cursor click")
      XCTAssertNil(meta.startedAt, "\(name): nothing sent")
      XCTAssertNil(wire(meta)?["route"], name)
    }
  }

  /// P3: a row the last identity check refuses gets no cursor click; one that passes gets exactly one, before the press.
  func testTheCursorsClickComesOnlyAfterTheLastChecks() throws {
    let refused = permission()
    var announced: [String] = []
    var meta = freshMeta()
    XCTAssertFalse(try click(decide(refused), shown: { _ in true }, meta: &meta, beforeDispatch: { $0.title = "Block" },
                             announce: { announced.append("cursor") }) { _, _ in announced.append("press"); return .success })
    XCTAssertEqual(announced, [], "refused at the last check: no cursor click")
    var open = true
    var delivered = freshMeta()
    XCTAssertTrue(try click(decide(permission()), shown: { _ in open }, meta: &delivered, announce: { announced.append("cursor") }) { _, _ in
      announced.append("press")
      open = false
      return .success
    })
    XCTAssertEqual(announced, ["cursor", "press"])
  }

  /// The review of c8858c2a..e7e78424, P2: a cached capture that fails is retried after the shareable content is listed
  /// again, and the window list kept is the one sampled just before the attempt that captured, not the failed one's.
  func testTheWindowListIsTheOneSampledBeforeTheAttemptThatCaptured() throws {
    struct Failed: Error {}
    var steps: [String] = []
    var samples = 0
    var attempts = 0
    let (image, listed) = try captureSamplingList(cached: true, list: { () -> Int in
      samples += 1
      steps.append("list\(samples)")
      return samples
    }, capture: { () -> String in
      attempts += 1
      steps.append("capture\(attempts)")
      if attempts == 1 { throw Failed() }
      return "image"
    }, refresh: { steps.append("refresh") })
    XCTAssertEqual(image, "image")
    XCTAssertEqual(listed, 2, "the retry's list")
    XCTAssertEqual(steps, ["list1", "capture1", "refresh", "list2", "capture2"])
    var once = 0
    XCTAssertThrowsError(try captureSamplingList(cached: false, list: { () -> Int in 0 }, capture: { () -> String in once += 1; throw Failed() },
                                                 refresh: { XCTFail("an uncached window is not retried") }))
    XCTAssertEqual(once, 1)
  }

  /// Ruling 1072, item 6: a point in a list's padding (the datalist at (99, 120), beside its options) or in the permission
  /// dialog between its buttons lands on no row: refused.
  func testAPointOnAListsOrDialogsPaddingRefuses() {
    var list = datalist()
    list.verdict.point = CGPoint(x: 99, y: 120)
    XCTAssertEqual(refusal(decide(list)), .notARow, "the AXList's padding")
    var dialog = permission()
    dialog.verdict.point = CGPoint(x: 300, y: 142)
    XCTAssertEqual(refusal(decide(dialog, answered: .some(dialog.row.parent))), .notARow, "the dialog's group between its buttons")
  }

  /// The window moved since the screenshot: the row's frame is compared after the window's shift, within 2 pt.
  func testTheRowsFrameIsComparedAfterTheWindowsShiftWithin2Points() {
    let scene = omnibox()
    let shift = CGVector(dx: 30, dy: -12)
    for node in scene.nodes.map(\.element) { node.frame = node.frame?.offsetBy(dx: shift.dx, dy: shift.dy) }
    var moved = scene.verdict
    moved.point = CGPoint(x: point.x + shift.dx, y: point.y + shift.dy)
    var shifted = scene
    shifted.verdict = moved
    guard case .deliver(let target) = decide(shifted, shift: shift) else { return XCTFail("delivered after the shift") }
    XCTAssertTrue(target.row.element === scene.row)
    scene.row.frame = scene.row.frame?.offsetBy(dx: 2, dy: -2)
    guard case .deliver = decide(shifted, shift: shift) else { return XCTFail("2 pt is within the tolerance") }
  }

  /// An element with no AXEnabled (Chromium's row text) is not disabled; one that reads enabled delivers too.
  func testARowWithNoEnabledAttributeOrEnabledDelivers() {
    let scene = omnibox()
    for read in [OverlayEnabledRead.absent, .enabled] {
      scene.row.enabled = read
      guard case .deliver = decide(scene) else { return XCTFail("\(read) delivers") }
    }
  }

  // MARK: Refused: #452's refusal stands, nothing pressed

  /// Each identity read on the recorded handle that fails or differs keeps #452's refusal, the kind told.
  func testEachIdentityFailureKeepsTheRefusal() {
    let cases: [(String, OverlayRefusal, (Scene) -> Void)] = [
      ("a dead handle", .gone, { $0.row.gone = true }),
      ("a changed label", .labelChanged, { $0.row.title = "Block" }),
      ("a label that does not read", .labelChanged, { $0.row.labelFails = true }),
      ("a changed role", .roleChanged, { $0.row.roleNow = "AXCheckBox" }),
      ("a frame moved 3 pt", .frameMoved, { $0.row.frame = $0.row.frame?.offsetBy(dx: 0, dy: 3) }),
      ("a frame resized past 2 pt", .frameMoved, { $0.row.frame?.size.width += 2.5 }),
      ("a frame that does not read", .frameMoved, { $0.row.frame = nil }),
      ("disabled", .disabled, { $0.row.enabled = .disabled }),
      ("AXEnabled unread", .disabled, { $0.row.enabled = .failed }),
    ]
    for (name, expected, change) in cases {
      let scene = permission()
      change(scene)
      // The hit-test answered the dialog around the row (a live element, whatever became of the row).
      let decision = decide(scene, answered: .some(scene.row.parent))
      guard case .refuse(let why, let kind, let window, let by) = decision else { XCTFail("\(name): refused, not \(decision)"); continue }
      XCTAssertEqual(why, expected, name)
      XCTAssertEqual(kind, .permissionBubble, name)
      XCTAssertEqual(window, 49, name)
      XCTAssertEqual(by, .axHit, name)
    }
  }

  /// The record's own label or role unread at the observation: no identity to compare, refused.
  func testARecordWhoseRowLabelOrRoleDidNotReadRefuses() {
    var scene = permission()
    let at = scene.nodes.firstIndex { $0.element === scene.row }!
    let original = scene.nodes[at]
    scene.nodes[at] = recordedCopy(original, labelsUnread: [.title])
    XCTAssertEqual(refusal(decide(scene)), .labelChanged)
    scene.nodes[at] = original
    scene.nodes[at].roleUnknown = true
    XCTAssertEqual(refusal(decide(scene)), .roleChanged)
  }

  /// Two recorded rows of the overlay at the point, neither inside the other (overlapping siblings, or a row shifted
  /// since the walk): refused, whichever is deeper or later.
  func testOverlappingRecordedRowsThatAreNotNestedRefuse() {
    var scene = omnibox()
    let at = scene.nodes.firstIndex { $0.element === scene.neighbour }!
    let overlapping = CGRect(x: 100, y: 110, width: 426, height: 40)
    scene.nodes[at] = recordedCopy(scene.nodes[at], frame: overlapping)
    scene.neighbour.frame = overlapping
    XCTAssertEqual(refusal(decide(scene)), .notNested)
  }

  /// A row's own recorded child at the point is nested in it: the deepest, the child, is the one pressed.
  func testANestedChildIsTheDeepestRecordedNodeAndIsPressed() {
    var scene = omnibox()
    let rowAt = scene.nodes.firstIndex { $0.element === scene.row }!
    let child = Node("AXStaticText", value: "probe", frame: CGRect(x: 110, y: 105, width: 300, height: 20), parent: scene.row)
    scene.nodes.append(recorded(child, depth: 5, ancestor: rowAt))
    guard case .deliver(let target) = decide(scene) else { return XCTFail("delivered") }
    XCTAssertTrue(target.row.element === child)
  }

  /// Overlays not of the four kinds keep #452's refusal: a Chromium window with neither list, dialog nor the omnibox's
  /// page; another page (an extension's popup); the permission bubble's or datalist's shape at the other layer; an axHit
  /// overlay outside Chromium; a popover in Chromium; layers unread.
  func testAnUnknownOverlayKindRefuses() {
    var plain = permission()
    let dialogAt = plain.nodes.firstIndex { $0.subrole == alertDialogSubrole }!
    plain.nodes[dialogAt] = recordedCopy(plain.nodes[dialogAt], subrole: .some(nil))
    var extensionPage = omnibox()
    let pageAt = extensionPage.nodes.firstIndex { $0.title == omniboxPopupTitle }!
    extensionPage.nodes[pageAt] = recordedCopy(extensionPage.nodes[pageAt], title: "My Extension")
    var bubbleAbove = permission()
    bubbleAbove.verdict.overLayer = 999
    var datalistLevel = datalist()
    datalistLevel.verdict.overLayer = 0
    var notChromium = omnibox()
    notChromium.chromium = false
    var chromiumPopover = popover()
    chromiumPopover.chromium = true
    var unlisted = omnibox()
    unlisted.verdict.observedLayer = nil
    for (name, scene) in [("plain window", plain), ("another page", extensionPage), ("bubble above the layer", bubbleAbove),
                          ("list at the layer", datalistLevel), ("not Chromium", notChromium), ("Chromium popover", chromiumPopover),
                          ("observed unlisted", unlisted)] {
      let decision = decide(scene)
      guard case .refuse(.unknownKind, nil, _, _) = decision else { XCTFail("\(name): unknownKind, not \(decision)"); continue }
    }
  }

  private func recordedCopy(_ n: ScreenshotNode<Node>, title: String?? = .none, subrole: String?? = .none, frame: CGRect? = nil,
                            labelsUnread: Set<StalePointLabelPart>? = nil)
    -> ScreenshotNode<Node> {
    var copy = ScreenshotNode(element: n.element, role: n.role, title: title ?? n.title, description: n.description, subrole: subrole ?? n.subrole,
                              value: n.value, editableAncestor: nil, labelsUnread: labelsUnread ?? n.labelsUnread, frame: frame ?? n.frame, shown: frame ?? n.shown,
                              depth: n.depth, subtreeRecorded: n.subtreeRecorded)
    copy.ancestor = n.ancestor
    return copy
  }

  /// No recorded handle for the row: the overlay opened after the screenshot (the record holds none of its elements), or
  /// the record holds the overlay but no row of it at the point (its padding), or only its containers there.
  func testNoRecordedHandleForTheRowRefuses() {
    var unrecorded = omnibox()
    unrecorded.nodes = browser().nodes
    XCTAssertEqual(refusal(decide(unrecorded)), .notRecorded, "the overlay unrecorded")
    var padding = omnibox()
    padding.verdict.point = CGPoint(x: 92, y: 95)
    XCTAssertEqual(refusal(decide(padding)), .notRecorded, "only the window and its page at the point")
  }

  /// The hit-test's answer, read up, reaches no window (or none at all): unread, refused.
  func testAnAnswerThatReadsToNoOverlayRefuses() {
    let scene = omnibox()
    XCTAssertEqual(refusal(decide(scene, answered: .some(nil))), .unread)
    let orphan = Node("AXGroup")
    XCTAssertEqual(refusal(decide(scene, answered: .some(orphan))), .unread)
    var popoverAnswer = popover()
    popoverAnswer.nodes.removeAll()
    XCTAssertEqual(refusal(decide(popoverAnswer, answered: .some(Node("AXButton", parent: Node("AXWindow"))))), .unread,
                   "a popover signal whose answer reads to the window with no popover")
  }

  /// The re-laid-out bubble: the recorded "Allow this time" is gone and the bubble has shrunk, so "Never allow" now lies at
  /// the point and is what the hit-test answers. Refused as gone; "Never allow" is never pressed, and nothing is.
  func testAReLaidOutBubbleWhoseRecordedButtonIsGoneRefusesAndNeverPressesTheNeighbour() throws {
    let scene = permission()
    scene.row.gone = true
    scene.neighbour.frame = CGRect(x: 100, y: 100, width: 426, height: 40)
    let decision = decide(scene, answered: .some(scene.neighbour))
    XCTAssertEqual(refusal(decision), .gone)
    var meta = freshMeta()
    var pressed = 0
    let carried = try click(decision, shown: { _ in true }, meta: &meta) { _, _ in pressed += 1; return .success }
    XCTAssertFalse(carried, "main's refusal stands")
    XCTAssertEqual(pressed, 0)
    XCTAssertNil(meta.startedAt, "nothing sent")
    XCTAssertEqual(wire(meta), ["window": 49, "by": "axHit", "kind": "permissionBubble", "refused": "gone"] as NSDictionary)
  }

  /// The same bubble with the recorded button still alive but moved down out of the point, the neighbour at the point.
  func testAReLaidOutBubbleWhoseRecordedButtonMovedRefuses() {
    let scene = permission()
    scene.row.frame = CGRect(x: 100, y: 145, width: 426, height: 40)
    scene.neighbour.frame = CGRect(x: 100, y: 100, width: 426, height: 40)
    XCTAssertEqual(refusal(decide(scene, answered: .some(scene.neighbour))), .frameMoved)
  }

  // MARK: Unconfirmed and failed

  /// Nothing closes within 500 ms: clickUnconfirmed, after one press, the meta saying it was pressed and not confirmed.
  func testNothingClosingAnswersClickUnconfirmed() {
    let scene = omnibox()
    var meta = freshMeta()
    var pressed = 0
    XCTAssertThrowsError(try click(decide(scene), shown: { _ in true }, meta: &meta) { _, _ in pressed += 1; return .success }) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "clickUnconfirmed")
    }
    XCTAssertEqual(pressed, 1)
    let record = wire(meta)
    XCTAssertEqual(record?["route"] as? String, "action")
    XCTAssertEqual(record?["confirmed"] as? Bool, false)
    XCTAssertEqual(record?["ms"] as? Double, 500)
    XCTAssertEqual(record?["polls"] as? Int, 26)
  }

  /// The window list unread is unknown, never closed: unconfirmed.
  func testAnUnreadWindowListNeverConfirms() {
    var meta = freshMeta()
    XCTAssertThrowsError(try click(decide(omnibox()), shown: { _ in nil }, meta: &meta) { _, _ in .success }) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "clickUnconfirmed")
    }
  }

  /// A press the element refuses is actionFailed; a messaging timeout is clickUnconfirmed even when the window then
  /// leaves (ruling 1072: the window leaving cannot be tied to a press that may not have landed).
  func testAPressErrorIsActionFailedAndATimeoutIsUnconfirmedEvenWhenTheWindowLeaves() throws {
    var meta = freshMeta()
    XCTAssertThrowsError(try click(decide(omnibox()), shown: { _ in true }, meta: &meta) { _, _ in .actionUnsupported }) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "actionFailed")
    }
    XCTAssertEqual(wire(meta)?["actionError"] as? Int, Int(AXError.actionUnsupported.rawValue))
    var timedOut = freshMeta()
    var open = true
    XCTAssertThrowsError(try click(decide(omnibox()), shown: { _ in open }, meta: &timedOut) { _, _ in open = false; return .cannotComplete }) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "clickUnconfirmed")
    }
    XCTAssertEqual(wire(timedOut)?["confirmed"] as? Bool, false)
    XCTAssertEqual(wire(timedOut)?["actionError"] as? Int, Int(AXError.cannotComplete.rawValue))
  }

  /// A check before the press (the deadline, a forbidden owner, the person's input) refuses with nothing pressed or sent.
  func testABeforeDispatchRefusalPressesNothing() {
    var meta = freshMeta()
    var pressed = 0
    XCTAssertThrowsError(try click(decide(omnibox()), shown: { _ in true }, meta: &meta, beforeDispatch: { _ in throw overlayDeadlinePassed }) { _, _ in
      pressed += 1
      return .success
    }) { XCTAssertEqual(($0 as? EngineError)?.errorName, "timeoutReached") }
    XCTAssertEqual(pressed, 0)
    XCTAssertNil(meta.startedAt)
  }

  // MARK: Main's other answers unchanged

  /// Only main's `appWindowOverPoint`, for a plain left click, is replaced: #443's controlGone, #316's newWindow and every
  /// other stale-point verdict, kept or refused, is main's (the decision answers `notOverlay` and nothing is read or
  /// pressed); a right click, a double click, a spike route keep #452's refusal.
  func testMainsOtherVerdictsAndOtherClicksAreUnchanged() throws {
    let scene = omnibox()
    let others: [StalePointReason] = [.controlGone, .newWindow, .nodeGone, .frameMoved, .interactiveHit, .pressedOther, .otherWebArea,
                                      .newElementOverPoint, .relabelled, .sameElement, .unrecorded, .noHit, .recordedHit]
    for reason in others {
      let verdict = StalePointVerdict<Node>(reason: reason, point: point, overWindow: overWindow, overBy: .axHit)
      XCTAssertFalse(overlayPressApplies(verdict, button: .left, count: 1, forced: false), "\(reason)")
      var other = scene
      other.verdict = verdict
      let decision = decide(other)
      guard case .notOverlay = decision else { XCTFail("\(reason): main's, not \(decision)"); continue }
      var meta = freshMeta()
      XCTAssertFalse(try click(decision, shown: { _ in true }, meta: &meta) { _, _ in XCTFail("pressed"); return .success })
      XCTAssertNil(meta.overlayClick, "\(reason)")
    }
    XCTAssertTrue(overlayPressApplies(scene.verdict, button: .left, count: 1, forced: false))
    XCTAssertFalse(overlayPressApplies(scene.verdict, button: .right, count: 1, forced: false), "a right click")
    XCTAssertFalse(overlayPressApplies(scene.verdict, button: .middle, count: 1, forced: false), "a middle click")
    XCTAssertFalse(overlayPressApplies(scene.verdict, button: .left, count: 2, forced: false), "a double click")
    XCTAssertFalse(overlayPressApplies(scene.verdict, button: .left, count: 1, forced: true), "a spike route")
  }

  /// #452's guard still decides first and alone: #316's newWindow before the overlay, and the overlay's verdict carrying
  /// both windows' layers, its refusal and its record as main's.
  func testTheGuardDecidesFirstAndTheOverlayVerdictCarriesTheLayers() {
    let browserListed = ListedWindow(number: 28, owner: 501, layer: 0, bounds: CGRect(x: 0, y: 0, width: 1000, height: 800))
    let datalistListed = ListedWindow(number: 49, owner: 501, layer: 999, bounds: CGRect(x: 95, y: 95, width: 440, height: 90))
    let fresh = ListedWindow(number: 60, owner: 501, layer: 0, bounds: CGRect(x: 0, y: 0, width: 50, height: 50))
    var treeRead = false
    let overlay = guardedPointVerdict(at: point, hit: Node?.none, place: .otherWindow(49), target: 28, pid: 501, recorded: [28, 49],
                                      windows: { [datalistListed, browserListed] }) { treeRead = true; return StalePointVerdict<Node>(reason: .noHit) }
    XCTAssertEqual(overlay.reason, .appWindowOverPoint)
    XCTAssertEqual(overlay.overLayer, 999)
    XCTAssertEqual(overlay.observedLayer, 0)
    XCTAssertFalse(treeRead)
    XCTAssertEqual(StalePointRecord(overlay, ms: 1).wire as NSDictionary,
                   ["verdict": "refused", "reason": "appWindowOverPoint", "overWindow": 49, "by": "axHit", "ms": 1] as NSDictionary,
                   "the guard's record unchanged")
    let newWindow = guardedPointVerdict(at: point, hit: Node?.none, place: .otherWindow(49), target: 28, pid: 501, recorded: [28, 49],
                                        windows: { [fresh, datalistListed, browserListed] }) { StalePointVerdict<Node>(reason: .noHit) }
    XCTAssertEqual(newWindow.reason, .newWindow)
    var scene = datalist()
    scene.verdict = newWindow
    guard case .notOverlay = decide(scene) else { return XCTFail("newWindow is main's") }
  }
}
