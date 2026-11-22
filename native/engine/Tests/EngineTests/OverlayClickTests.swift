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

  private var reads: OverlayReads<Node> {
    let stale = StalePointReads<Node>(
      role: { $0.gone ? nil : $0.roleNow ?? $0.role }, frame: { $0.gone ? nil : $0.frame }, parent: { $0.parent }, children: { _ in nil },
      title: { $0.title }, description: { $0.description }, value: { $0.value },
      label: { node, part in
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
    overlayPoint(scene.verdict, answered: answered ?? scene.answered, nodes: scene.nodes, shift: shift, chromium: scene.chromium, reads: reads)
  }

  private func refusal(_ decision: OverlayPoint<Node>) -> OverlayRefusal? {
    if case .refuse(let why, _, _, _) = decision { return why }
    return nil
  }

  /// The decision carried out over a fake clock; `onPress` runs as the AXPress is performed (the app taking it).
  private func click(_ decision: OverlayPoint<Node>, shown: @escaping (CGWindowID) -> Bool?, meta: inout InputMeta,
                     beforeDispatch: @escaping (Node) throws -> Void = { _ in },
                     onPress: @escaping (Node, String) -> AXError) throws -> Bool {
    var clock = 0.0
    return try overlayClick(decision, app: "Google Chrome", reads: reads, windowShown: shown, now: { clock }, sleep: { clock += $0 },
                            beforeDispatch: beforeDispatch, perform: onPress, meta: &meta)
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

  /// The row dying within the wait confirms too, its window still listed (an overlay that rebuilds as it takes the row).
  func testTheRowDyingConfirmsTheClick() throws {
    let scene = omnibox()
    var meta = freshMeta()
    var clock = 0
    let carried = try overlayClick(decide(scene), app: "Google Chrome", reads: reads, windowShown: { _ in true },
                                   now: { Double(clock) }, sleep: { clock += Int($0); if clock >= 60 { scene.row.gone = true } },
                                   beforeDispatch: { _ in }, perform: { _, _ in .success }, meta: &meta)
    XCTAssertTrue(carried)
    XCTAssertEqual(wire(meta)?["confirmed"] as? Bool, true)
    XCTAssertEqual(wire(meta)?["polls"] as? Int, 4)
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

  /// A press the element refuses is actionFailed; a messaging timeout is read for its effect.
  func testAPressErrorIsActionFailedAndATimeoutIsReadForItsEffect() throws {
    var meta = freshMeta()
    XCTAssertThrowsError(try click(decide(omnibox()), shown: { _ in true }, meta: &meta) { _, _ in .actionUnsupported }) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "actionFailed")
    }
    XCTAssertEqual(wire(meta)?["actionError"] as? Int, Int(AXError.actionUnsupported.rawValue))
    var timedOut = freshMeta()
    var open = true
    XCTAssertTrue(try click(decide(omnibox()), shown: { _ in open }, meta: &timedOut) { _, _ in open = false; return .cannotComplete })
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
