import AppKit
import CoreGraphics
import Foundation
import XCTest
@testable import Engine

// #296's stale-point guard (StalePoint.swift): what the screenshot's tree had under a coordinate pointer's point, checked
// against what is there now, over a fake tree; then its refusal through deliverPointer over the recorded guard seam, with
// nothing posted, and #282's element route left to carry what it carries.

/// An accessibility element of the fake tree: what it reads now (`frame` nil once destroyed), its parent and children.
private final class Node {
  let role: String
  var title: String?
  var description: String?
  /// Its AXValue and AXSubrole (#298: an AXStaticText's words are its value; Chrome's tab is a radio button whose
  /// subrole is AXTabButton).
  var value: String?
  let subrole: String?
  var frame: CGRect?
  var actions: [String] = []
  /// What its AXEditableAncestor answers (#298's edited-text exemption, ruling 1ea561bc:553): the contenteditable region
  /// it lies in, where the app exposes one.
  weak var editableAncestor: Node?
  /// Label attributes whose read fails, at the observation (for the walk's record) and now (the review of
  /// 7f6eb3dc..b2f00ad5, P2 2): an error, not an attribute the element lacks.
  var unreadable: Set<StalePointLabelPart> = []
  /// Its AXChildren read fails (at the observation, for the walk's record).
  var childrenUnread = false
  weak var parent: Node?
  var children: [Node] = []

  init(_ role: String, _ frame: CGRect?, title: String? = nil, description: String? = nil, value: String? = nil, subrole: String? = nil,
       _ children: [Node] = []) {
    self.role = role
    self.frame = frame
    self.title = title
    self.description = description
    self.value = value
    self.subrole = subrole
    self.children = children
    for child in children { child.parent = self }
  }

  func add(_ child: Node) {
    child.parent = self
    children.append(child)
  }

  /// Destroyed: its handle answers nothing, and it leaves its parent.
  func destroy() {
    frame = nil
    title = nil
    description = nil
    value = nil
    parent?.children.removeAll { $0 === self }
  }
}

private var reads: StalePointReads<Node> {
  StalePointReads<Node>(role: { $0.role }, frame: { $0.frame }, parent: { $0.parent }, children: { $0.children },
                                          // A failed read answers none, as the live seam's `attribute` does.
                                          title: { $0.unreadable.contains(.title) ? nil : $0.title },
                                          description: { $0.unreadable.contains(.description) ? nil : $0.description },
                                          value: { $0.unreadable.contains(.value) ? nil : $0.value },
                                          editableAncestor: { $0.editableAncestor }, actions: { $0.frame == nil ? nil : $0.actions },
                                          label: { node, part in
                                            if node.unreadable.contains(part) { return .unreadable }
                                            switch part {
                                            case .title: return .text(node.title)
                                            case .description: return .text(node.description)
                                            case .value: return .text(node.value)
                                            }
                                          }, same: { $0 === $1 })
}

/// The reads an observation with a screenshot emits for `root`'s tree, every node walked but `skipped` ones (as `TreeWalk`
/// emits them, its labels cut by `bounded` as ElementData cuts them).
private func walked(_ root: Node, skipping skipped: Set<ObjectIdentifier> = []) -> [ScreenshotNodeRead<Node>] {
  var reads: [ScreenshotNodeRead<Node>] = []
  var next = 0
  func walk(_ node: Node, parent: Int?, depth: Int) {
    let number = next
    next += 1
    let children = node.childrenUnread ? [] : node.children  // a failed AXChildren read decodes as none
    func read<T>(_ part: StalePointLabelPart, _ value: T?) -> T? { node.unreadable.contains(part) ? nil : value }  // a failed read decodes as none
    reads.append(ScreenshotNodeRead(element: node, number: number, parent: parent, depth: depth, role: node.role,
                                    title: read(.title, node.title).map(bounded), description: read(.description, node.description).map(bounded),
                                    frame: node.frame, actions: node.actions, childCount: children.count,
                                    childrenRead: !node.childrenUnread, subrole: node.subrole,
                                    value: screenshotLabelValue(role: node.role, read(.value, node.value).map { $0 as CFString }),
                                    editableAncestor: node.editableAncestor,
                                    labelsUnread: screenshotLabelsUnread(role: node.role, Set(node.unreadable.map(\.attribute)))))
    for child in children where !skipped.contains(ObjectIdentifier(child)) { walk(child, parent: number, depth: depth + 1) }
  }
  walk(root, parent: nil, depth: 0)
  return reads
}

/// The record an observation with a screenshot makes of `root`'s tree (`walked`).
private func recorded(_ root: Node, skipping skipped: Set<ObjectIdentifier> = []) -> [ScreenshotNode<Node>] {
  screenshotNodes(walked(root, skipping: skipped))
}

/// #330: every element the same walk recorded, framed or not, with whether it recorded all of the element's children
/// (`screenshotChildrenRecorded`), as the verdict looks it up.
private func recordedMembers(_ root: Node, skipping skipped: Set<ObjectIdentifier> = []) -> (Node) -> Bool? {
  let complete = screenshotChildrenRecorded(walked(root, skipping: skipped)) { ObjectIdentifier($0) }
  return { complete[ObjectIdentifier($0)] }
}

private func verdict(_ nodes: [ScreenshotNode<Node>], at point: CGPoint, shift: CGVector = .zero, hit: Node?) -> StalePointVerdict<Node> {
  stalePointVerdict(at: point, windowShift: shift, nodes: nodes, hit: hit, reads: reads)
}

/// Moves `node` and everything below it by `shift` (the window moved, its layout unchanged).
private func move(_ node: Node, by shift: CGVector) {
  node.frame = node.frame?.offsetBy(dx: shift.dx, dy: shift.dy)
  for child in node.children { move(child, by: shift) }
}

final class StalePointTests: XCTestCase {
  /// Chrome for Testing's window as #294's spike read it: the toolbar's Reload at x 442 before the re-layout, the page
  /// below it with a button whose label is an AXStaticText the tree does not list (Chrome hit-tests into it).
  private struct Chrome {
    let window = Node("AXWindow", CGRect(x: 0, y: 25, width: 620, height: 700))
    let toolbar = Node("AXToolbar", CGRect(x: 0, y: 70, width: 620, height: 48))
    let forward = Node("AXButton", CGRect(x: 478, y: 77, width: 34, height: 34), description: "Forward")
    let reload = Node("AXButton", CGRect(x: 442, y: 77, width: 34, height: 34), description: "Reload")
    let webArea = Node("AXWebArea", CGRect(x: 0, y: 118, width: 620, height: 607))
    let button = Node("AXButton", CGRect(x: 100, y: 300, width: 120, height: 30), title: "Save")
    init() {
      window.add(toolbar)
      toolbar.add(reload)
      window.add(webArea)
      webArea.add(button)
    }
  }
  private let reloadPoint = CGPoint(x: 459, y: 94)

  // MARK: The three load-bearing findings

  /// #294: after the toolbar's re-layout, Chrome's hit-test at the old point still answered the same Reload handle, but
  /// Reload's frame no longer held the point. The frame read again is what refuses.
  func testTheFrameReadAgainWithTheSameHandleRefuses() {
    let chrome = Chrome()
    let nodes = recorded(chrome.window)
    XCTAssertTrue(verdict(nodes, at: reloadPoint, hit: chrome.reload).reason == .sameElement, "before the re-layout: kept")
    chrome.reload.frame = CGRect(x: 478, y: 77, width: 34, height: 34)  // Reload moved 36 pt right
    let moved = verdict(nodes, at: reloadPoint, hit: chrome.reload)  // the hit-test still answers Reload's handle
    XCTAssertEqual(moved.reason, .frameMoved)
    XCTAssertEqual(moved.identity, .handle)
    XCTAssertTrue(moved.refused)
    let outcome = stalePointOutcome(moved, ms: 0.4, reads: reads)
    XCTAssertEqual(outcome.refusal?.errorName, "screenChangedSinceScreenshot")
    XCTAssertEqual(outcome.refusal?.message,
                   "The screen changed since the screenshot: the AXButton \"Reload\" it showed at this point has moved away from it. Nothing was sent. Call getScreenshot for a new screenshot, then give the coordinates in its pixels.",
                   "the hit is the moved node itself: nothing else is named")
    XCTAssertEqual(outcome.record.wire as NSDictionary, ["verdict": "refused", "reason": "frameMoved", "identity": "handle",
                                                         "recordedRole": "AXButton", "hitRole": "AXButton", "ms": 0.4] as NSDictionary)
    // The hit-test answering what lies there now (the disabled Forward button, which came back) names it.
    chrome.toolbar.add(chrome.forward)
    chrome.forward.frame = CGRect(x: 442, y: 77, width: 34, height: 34)
    let forward = stalePointOutcome(verdict(nodes, at: reloadPoint, hit: chrome.forward), ms: 0, reads: reads)
    XCTAssertEqual(forward.refusal?.message,
                   "The screen changed since the screenshot: the AXButton \"Reload\" it showed at this point has moved away from it; AXButton \"Forward\" is there now. Nothing was sent. Call getScreenshot for a new screenshot, then give the coordinates in its pixels.")
  }

  /// Chrome hit-tests a page button to its label's AXStaticText, which the tree does not list (it stops at the AXButton):
  /// a non-interactive hit inside a node still in place passes.
  func testANonInteractiveChildHitInsideANodeInPlacePasses() {
    let chrome = Chrome()
    let nodes = recorded(chrome.window)
    let label = Node("AXStaticText", CGRect(x: 130, y: 306, width: 60, height: 18))
    chrome.button.add(label)  // exposed to the hit-test after the observation
    let point = CGPoint(x: 160, y: 315)
    XCTAssertEqual(deepestScreenshotNode(at: point, in: nodes)?.element === chrome.button, true, "the deepest recorded node")
    let kept = verdict(nodes, at: point, hit: label)
    XCTAssertEqual(kept.reason, .nonInteractiveHit)
    XCTAssertFalse(kept.refused)
    XCTAssertNil(stalePointOutcome(kept, ms: 0, reads: reads).refusal)
    // A group too; and a hit that answers nothing, with the node in place.
    let group = Node("AXGroup", CGRect(x: 100, y: 300, width: 120, height: 30))
    chrome.button.add(group)
    XCTAssertEqual(verdict(nodes, at: point, hit: group).reason, .nonInteractiveHit)
    XCTAssertEqual(verdict(nodes, at: point, hit: nil).reason, .noHit)
  }

  /// A control re-created in place (a React re-render replaces the node): its handle is gone, and the one now there is
  /// looked for among the hit, its ancestors and its descendants, the descendants bounded at 300 breadth-first.
  func testTheReCreatedHandleSearchIsBounded() {
    XCTAssertEqual(stalePointDescendantBound, 300, "the bound this test pins")
    XCTAssertEqual(stalePointAncestorLevels, 300)
    XCTAssertEqual(stalePointFrameTolerance, 2)
    // The re-created button is the hit's ancestor (Chrome hit-tests its label): found, kept.
    do {
      let chrome = Chrome()
      let nodes = recorded(chrome.window)
      chrome.button.destroy()
      let again = Node("AXButton", CGRect(x: 101, y: 300, width: 120, height: 31), title: "Save")
      let label = Node("AXStaticText", CGRect(x: 130, y: 306, width: 60, height: 18))
      again.add(label)
      chrome.webArea.add(again)
      let kept = verdict(nodes, at: CGPoint(x: 160, y: 315), hit: label)
      XCTAssertEqual(kept.identity, .recreated)
      XCTAssertTrue(kept.current === again)
      XCTAssertEqual(kept.reason, .nonInteractiveHit)
      // More than 2 pt off: not the node.
      again.frame = CGRect(x: 103, y: 300, width: 120, height: 30)
      XCTAssertEqual(verdict(nodes, at: CGPoint(x: 160, y: 315), hit: label).reason, .nodeGone)
    }
    // The hit is a container (the page): the re-created button among its first 300 descendants is found, past them not.
    for (filler, found) in [(298, true), (300, false)] {
      let chrome = Chrome()
      let nodes = recorded(chrome.window)
      chrome.button.destroy()
      for index in 0..<filler { chrome.webArea.add(Node("AXGroup", CGRect(x: 0, y: 700 + CGFloat(index), width: 1, height: 1))) }
      let again = Node("AXButton", CGRect(x: 100, y: 300, width: 120, height: 30), title: "Save")
      chrome.webArea.add(again)  // breadth-first position filler + 1
      let judged = verdict(nodes, at: CGPoint(x: 160, y: 315), hit: chrome.webArea)
      XCTAssertEqual(judged.reason, found ? .nonInteractiveHit : .nodeGone, "after \(filler) other descendants")
      XCTAssertEqual(judged.identity, found ? .recreated : nil)
    }
  }

  /// The design session's amendment, both ways: a re-created control whose label changed ('Like (12)' to 'Like (13)', a
  /// React re-render of a counter) is not the node, so the click is refused (the safe direction); a label either side
  /// cannot read never counts against the match.
  func testAReCreatedControlWithAChangedLabelIsRefusedAndAnUnreadableLabelDoesNotCountAgainstIt() {
    func recreate(was: (title: String?, description: String?), now: (title: String?, description: String?)) -> StalePointVerdict<Node> {
      let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 400, height: 400))
      let like = Node("AXButton", CGRect(x: 10, y: 10, width: 80, height: 24), title: was.title, description: was.description)
      window.add(like)
      let nodes = recorded(window)
      like.destroy()
      let again = Node("AXButton", CGRect(x: 10, y: 10, width: 80, height: 24), title: now.title, description: now.description)
      window.add(again)
      return verdict(nodes, at: CGPoint(x: 50, y: 22), hit: again)
    }
    let changed = recreate(was: ("Like (12)", nil), now: ("Like (13)", nil))
    XCTAssertEqual(changed.reason, .nodeGone)
    XCTAssertEqual(stalePointOutcome(changed, ms: 0, reads: reads).refusal?.message,
                   "The screen changed since the screenshot: the AXButton \"Like (12)\" it showed at this point is gone; AXButton \"Like (13)\" is there now. Nothing was sent. Call getScreenshot for a new screenshot, then give the coordinates in its pixels.")
    XCTAssertEqual(recreate(was: ("Like (12)", nil), now: ("Like (12)", nil)).reason, .sameElement)
    XCTAssertEqual(recreate(was: (nil, nil), now: ("Like (13)", nil)).reason, .sameElement, "the recorded title unread")
    XCTAssertEqual(recreate(was: ("Like (12)", nil), now: (nil, nil)).reason, .sameElement, "the title unread now")
    XCTAssertEqual(recreate(was: ("", "Like"), now: (nil, "Like")).reason, .sameElement, "an empty title is none: descriptions agree")
    XCTAssertEqual(recreate(was: (nil, "Like 12"), now: (nil, "Like 13")).reason, .nodeGone, "no titles: the descriptions decide")
    XCTAssertEqual(recreate(was: ("Like", "a"), now: (nil, "b")).reason, .sameElement, "a title on one side only: nothing to compare")
  }

  /// #296's limit (ii), closed by #298's rule `relabelled` (RelabelledGuardTests): a handle that survives and is
  /// relabelled in place (Save to Delete on one element) is refused, its identity and frame unchanged.
  func testASurvivingHandleRelabelledInPlaceRefuses() {
    let chrome = Chrome()
    let nodes = recorded(chrome.window)
    chrome.button.title = "Delete"
    let refused = verdict(nodes, at: CGPoint(x: 160, y: 315), hit: chrome.button)
    XCTAssertEqual(refused.reason, .relabelled)
    XCTAssertEqual(refused.identity, .handle)
    XCTAssertTrue(refused.refused)
  }

  // MARK: The rest of the rule

  /// The hit-test now answers another interactive element over a node still in place (a dialog's Delete over the text the
  /// screenshot showed): refused, naming both.
  func testAnotherInteractiveElementAtThePointRefuses() {
    let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 400, height: 400))
    let text = Node("AXStaticText", CGRect(x: 10, y: 10, width: 200, height: 20), description: "Draft saved")
    window.add(text)
    let nodes = recorded(window)
    let sheet = Node("AXSheet", CGRect(x: 0, y: 0, width: 400, height: 120))
    let delete = Node("AXButton", CGRect(x: 0, y: 0, width: 300, height: 40), title: "Delete")
    sheet.add(delete)
    window.add(sheet)
    let refused = verdict(nodes, at: CGPoint(x: 20, y: 20), hit: delete)
    XCTAssertEqual(refused.reason, .interactiveHit)
    XCTAssertEqual(stalePointOutcome(refused, ms: 0, reads: reads).refusal?.message,
                   "The screen changed since the screenshot: the AXStaticText \"Draft saved\" it showed at this point is no longer what it reaches; AXButton \"Delete\" is there now. Nothing was sent. Call getScreenshot for a new screenshot, then give the coordinates in its pixels.")
  }

  /// An interactive hit related to the node: its control above it (a link whose text the tree lists) passes; one inside it
  /// passes only where the record does not hold all the node's children (the screenshot may have shown it), and refuses
  /// where it does (it is new).
  func testAnInteractiveHitAboveTheNodeOrInsideAnIncompleteRecordPasses() {
    let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 400, height: 400))
    let link = Node("AXLink", CGRect(x: 10, y: 10, width: 100, height: 20))
    let text = Node("AXStaticText", CGRect(x: 12, y: 12, width: 90, height: 16), title: "Docs")
    link.add(text)
    let canvas = Node("AXGroup", CGRect(x: 0, y: 100, width: 400, height: 300))
    let tool = Node("AXButton", CGRect(x: 10, y: 110, width: 40, height: 40), title: "Pen")
    canvas.add(tool)
    window.add(link)
    window.add(canvas)
    XCTAssertEqual(verdict(recorded(window), at: CGPoint(x: 20, y: 20), hit: link).reason, .hitAboveNode)
    let cut = recorded(window, skipping: [ObjectIdentifier(tool)])  // the walk did not reach the canvas's child
    XCTAssertEqual(deepestScreenshotNode(at: CGPoint(x: 20, y: 120), in: cut)?.subtreeRecorded, false)
    XCTAssertEqual(verdict(cut, at: CGPoint(x: 20, y: 120), hit: tool).reason, .unrecordedDescendant)
    let whole = recorded(window)
    canvas.children.removeAll()
    let nodes = recorded(window)  // the canvas recorded empty, every child of it held
    canvas.add(tool)
    XCTAssertEqual(verdict(nodes, at: CGPoint(x: 20, y: 120), hit: tool).reason, .interactiveHit, "a button new in a fully recorded group")
    XCTAssertEqual(verdict(whole, at: CGPoint(x: 20, y: 120), hit: tool).reason, .sameElement)
  }

  /// A node whose handle answers no frame now but which the hit is, or lies inside, counts as found; a node with no handle,
  /// no re-created one and no hit is gone; a point no recorded node holds is kept as unrecorded.
  func testTheNodeIsFoundByItsHandleWhileTheHitReachesIt() {
    let chrome = Chrome()
    let nodes = recorded(chrome.window)
    let frame = chrome.button.frame
    chrome.button.frame = nil  // a read that failed, the element still there
    XCTAssertEqual(verdict(nodes, at: CGPoint(x: 160, y: 315), hit: chrome.button).reason, .sameElement)
    XCTAssertEqual(verdict(nodes, at: CGPoint(x: 160, y: 315), hit: nil).reason, .nodeGone)
    chrome.button.frame = frame
    XCTAssertEqual(verdict(nodes, at: CGPoint(x: 900, y: 900), hit: nil).reason, .unrecorded)
    XCTAssertEqual(StalePointRecord(verdict(nodes, at: CGPoint(x: 900, y: 900), hit: nil), ms: 0.25).wire as NSDictionary,
                   ["verdict": "kept", "reason": "unrecorded", "ms": 0.25] as NSDictionary)
  }

  // MARK: The review of d482bcc2..a7a43b02

  /// The posted point lies in the window as it is now, the record's frames where it was at the screenshot: a window moved
  /// 100 pt with its layout unchanged keeps the node under the model's point (not the one that now lies at the posted
  /// point's old place), and a node that really moved inside the moved window is still refused.
  func testAMovedWindowIsComparedInTheScreenshotsSpace() {
    func window() -> (window: Node, a: Node, b: Node) {
      let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 400, height: 200))
      let a = Node("AXButton", CGRect(x: 10, y: 10, width: 80, height: 30), title: "A")
      let b = Node("AXButton", CGRect(x: 110, y: 10, width: 80, height: 30), title: "B")
      window.add(a)
      window.add(b)
      return (window, a, b)
    }
    let shift = CGVector(dx: 100, dy: 0)
    let posted = CGPoint(x: 130, y: 25)  // A's point in the image (30, 25), placed in the moved window
    do {
      let (root, a, _) = window()
      let nodes = recorded(root)
      move(root, by: shift)
      let kept = verdict(nodes, at: posted, shift: shift, hit: a)
      XCTAssertTrue(kept.node?.element === a, "A, the node the model meant")
      XCTAssertEqual(kept.reason, .sameElement)
      XCTAssertEqual(verdict(nodes, at: posted, hit: a).reason, .frameMoved, "without the shift: B's old place, and B has moved")
      XCTAssertEqual(verdict(nodes, at: CGPoint(x: 520, y: 25), shift: shift, hit: nil).reason, .unrecorded,
                     "beyond the screenshot's window, in the image's space")
    }
    do {
      let (root, a, b) = window()
      let nodes = recorded(root)
      move(root, by: shift)
      a.frame = a.frame?.offsetBy(dx: 40, dy: 0)  // and A itself moved inside the window
      XCTAssertEqual(verdict(nodes, at: posted, shift: shift, hit: b).reason, .frameMoved)
    }
    do {
      let (root, a, _) = window()
      let nodes = recorded(root)
      move(root, by: shift)
      a.destroy()
      let again = Node("AXButton", CGRect(x: 111, y: 10, width: 80, height: 30), title: "A")  // re-created where the window took it
      root.add(again)
      let kept = verdict(nodes, at: posted, shift: shift, hit: again)
      XCTAssertEqual(kept.identity, .recreated, "matched against the recorded frame moved by the window's shift")
      XCTAssertEqual(kept.reason, .sameElement)
    }
  }

  /// A frameless container is never chosen, so what its walk left unrecorded counts against its nearest framed ancestor:
  /// AXWindow, a frameless AXGroup, an AXButton the walk did not reach. The button is an unrecorded descendant, not new.
  func testAFramelessContainersUnrecordedChildCountsAgainstItsFramedAncestor() {
    let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 400, height: 200))
    let group = Node("AXGroup", nil)
    let button = Node("AXButton", CGRect(x: 10, y: 10, width: 80, height: 30), title: "Send")
    group.add(button)
    window.add(group)
    let nodes = recorded(window, skipping: [ObjectIdentifier(button)])
    XCTAssertEqual(nodes.count, 1, "only the window has a frame")
    XCTAssertEqual(nodes.first?.subtreeRecorded, false)
    XCTAssertEqual(verdict(nodes, at: CGPoint(x: 50, y: 25), hit: button).reason, .unrecordedDescendant)
    XCTAssertEqual(recorded(window).first { $0.element === window }?.subtreeRecorded, true, "the whole walk: complete")
  }

  /// The record keeps labels as the walk cuts them (10,000 UTF-16 units); the label read now is cut the same way, so a
  /// control re-created with the same long label is the node.
  func testAReCreatedControlWithALongLabelMatches() {
    let label = String(repeating: "Terms and conditions. ", count: 600)  // 13,200 units
    XCTAssertGreaterThan(label.utf16.count, maxValueLength)
    let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 400, height: 200))
    let accept = Node("AXCheckBox", CGRect(x: 10, y: 10, width: 300, height: 30), title: label)
    window.add(accept)
    let nodes = recorded(window)
    accept.destroy()
    let again = Node("AXCheckBox", CGRect(x: 10, y: 10, width: 300, height: 30), title: label)
    window.add(again)
    let kept = verdict(nodes, at: CGPoint(x: 50, y: 25), hit: again)
    XCTAssertEqual(kept.identity, .recreated)
    XCTAssertEqual(kept.reason, .sameElement)
    XCTAssertEqual(stalePointLabelsAgree(recordedTitle: bounded(label), recordedDescription: nil, title: "Terms", description: nil), false)
  }

  // MARK: The A/B's round (run 42184616121; the design session's ruling 1ea561bc ca82a6f4)

  /// A button replaced every 500 ms: between the old node's destruction and the new one's arrival the hit-test answers
  /// nothing. The point is hit-tested again (3 times, 50 ms apart) and the re-created search runs on the first real hit;
  /// a hit that stays empty is gone after the bound, and the sentence then names nothing there.
  func testAnEmptyHitMidReplacementIsHitTestedAgainWithinTheBound() {
    XCTAssertEqual(stalePointRehits, 3, "the bound this test pins")
    XCTAssertEqual(stalePointRehitMs, 50)
    let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 400, height: 200))
    let button = Node("AXButton", CGRect(x: 10, y: 10, width: 80, height: 30), title: "Again")
    window.add(button)
    let nodes = recorded(window)
    button.destroy()
    let again = Node("AXButton", CGRect(x: 10, y: 10, width: 80, height: 30), title: "Again")
    var answers: [Node?] = [nil, again]
    var sleeps: [Double] = []
    let kept = stalePointVerdict(at: CGPoint(x: 50, y: 25), nodes: nodes, hit: nil, rehit: {
      let next = answers.removeFirst()
      if next != nil { window.add(again) }
      return next
    }, sleep: { sleeps.append($0) }, reads: reads)
    XCTAssertEqual(kept.identity, .recreated, "the second re-hit's handle")
    XCTAssertEqual(kept.reason, .sameElement)
    XCTAssertEqual(sleeps, [50, 50])
    // Still empty after the bound: gone, and nothing is named there.
    sleeps = []
    let dead = Node("AXButton", nil)  // an element whose role cannot be read counts as no hit
    let gone = stalePointVerdict(at: CGPoint(x: 50, y: 25), nodes: nodes, hit: nil, rehit: { nil }, sleep: { sleeps.append($0) }, reads: reads)
    XCTAssertEqual(gone.reason, .nodeGone)
    XCTAssertEqual(sleeps, [50, 50, 50])
    XCTAssertEqual(stalePointOutcome(gone, ms: 0, reads: reads).refusal?.message,
                   "The screen changed since the screenshot: the AXButton \"Again\" it showed at this point is gone. Nothing was sent. Call getScreenshot for a new screenshot, then give the coordinates in its pixels.")
    let unreadable = StalePointReads<Node>(role: { $0 === dead ? nil : $0.role }, frame: { $0.frame }, parent: { $0.parent }, children: { $0.children },
                                           title: { $0.title }, description: { $0.description }, same: { $0 === $1 })
    let blind = stalePointVerdict(at: CGPoint(x: 50, y: 25), nodes: nodes, hit: dead, rehit: { dead }, reads: unreadable)
    XCTAssertEqual(blind.reason, .nodeGone)
    XCTAssertNil(blind.hitRole)
    XCTAssertEqual(stalePointOutcome(blind, ms: 0, reads: unreadable).refusal?.message,
                   "The screen changed since the screenshot: the AXButton \"Again\" it showed at this point is gone. Nothing was sent. Call getScreenshot for a new screenshot, then give the coordinates in its pixels.",
                   "no \"element is there now\"")
    // A live handle never waits.
    sleeps = []
    let live = Node("AXWindow", CGRect(x: 0, y: 0, width: 400, height: 200), [Node("AXButton", CGRect(x: 10, y: 10, width: 80, height: 30))])
    XCTAssertEqual(stalePointVerdict(at: CGPoint(x: 50, y: 25), nodes: recorded(live), hit: nil, rehit: { nil }, sleep: { sleeps.append($0) },
                                     reads: reads).reason, .noHit)
    XCTAssertEqual(sleeps, [])
  }

  /// What an element route may press at a kept point: the node itself or its control (an ancestor, reached from the hit
  /// through its plain children), or anything inside a node whose children the record does not all hold; anything else
  /// is `pressedOther`, refused.
  func testThePressedElementMustBeTheNodeOrItsControl() {
    let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 400, height: 200))
    let link = Node("AXLink", CGRect(x: 10, y: 10, width: 100, height: 20))
    let text = Node("AXStaticText", CGRect(x: 12, y: 12, width: 90, height: 16), description: "Keep")
    link.add(text)
    let remove = Node("AXLink", CGRect(x: 10, y: 40, width: 100, height: 20), title: "Remove")
    window.add(link)
    window.add(remove)
    let nodes = recorded(window)
    let first = verdict(nodes, at: CGPoint(x: 20, y: 20), hit: text)
    XCTAssertEqual(first.reason, .sameElement)
    XCTAssertEqual(stalePointPressVerdict(text, first, reads: reads).reason, .sameElement, "the node")
    XCTAssertEqual(stalePointPressVerdict(link, first, reads: reads).reason, .sameElement, "its control, the walk's ancestor")
    let other = stalePointPressVerdict(remove, first, reads: reads)
    XCTAssertEqual(other.reason, .pressedOther)
    XCTAssertTrue(other.refused)
    XCTAssertEqual(stalePointOutcome(other, ms: 0, reads: reads).refusal?.message,
                   "The screen changed since the screenshot: the AXStaticText \"Keep\" it showed at this point is no longer what it reaches; AXLink \"Remove\" is there now. Nothing was sent. Call getScreenshot for a new screenshot, then give the coordinates in its pixels.")
    // Inside a node the record holds incompletely; at a point nothing recorded holds.
    let canvas = Node("AXGroup", CGRect(x: 0, y: 100, width: 400, height: 100))
    let tool = Node("AXButton", CGRect(x: 10, y: 110, width: 40, height: 40))
    canvas.add(tool)
    window.add(canvas)
    let cut = recorded(window, skipping: [ObjectIdentifier(tool)])
    let inside = verdict(cut, at: CGPoint(x: 20, y: 120), hit: tool)
    XCTAssertEqual(stalePointPressVerdict(tool, inside, reads: reads).reason, .unrecordedDescendant)
    XCTAssertEqual(stalePointPressVerdict(tool, verdict(cut, at: CGPoint(x: 900, y: 900), hit: tool), reads: reads).reason, .unrecorded)
  }

  /// The route's wait (#282's action re-read, #283's box re-read): the guard runs again just before the press, on the
  /// element it is about to press, and a page that changed meanwhile is refused at that second check; without a wait the
  /// first verdict stands. The record says it was rechecked and carries both checks' time.
  func testAChangeDuringTheRouteWaitIsRefusedAtTheSecondCheck() {
    let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 400, height: 200))
    let item = Node("AXButton", CGRect(x: 10, y: 10, width: 200, height: 30), title: "item-9")
    window.add(item)
    let nodes = recorded(window)
    let point = CGPoint(x: 50, y: 25)
    let first = verdict(nodes, at: point, hit: item)
    XCTAssertFalse(first.refused)
    var clock: Double = 0
    let gate = StalePointGate(first: first, firstMs: 1.5) { () -> StalePointVerdict<Node> in
      clock += 0.75
      return verdict(nodes, at: point, hit: item)
    }
    let before = gate.check(item, waited: false, now: { clock }, reads: reads)
    XCTAssertNil(before.refusal, "no wait: the first verdict")
    XCTAssertEqual(before.record.rechecked, false)
    item.frame = CGRect(x: 10, y: 40, width: 200, height: 30)  // a prepend pushed it down during the wait
    XCTAssertNil(gate.check(item, waited: false, now: { clock }, reads: reads).refusal, "without a wait nothing is read again")
    let after = gate.check(item, waited: true, now: { clock }, reads: reads)
    XCTAssertEqual(after.refusal?.errorName, "screenChangedSinceScreenshot")
    XCTAssertEqual(after.record.reason, .frameMoved)
    XCTAssertEqual(after.record.wire["rechecked"] as? Bool, true)
    XCTAssertEqual(after.record.ms, 2.25, "both checks' time")
  }

  // MARK: The re-review of c8f37a93..7f79ca34, and the design session's ruling 0a14b51f

  /// Shared mode, a background Chromium page, the first hit-test empty mid-replacement: the guard's re-hit recovers the
  /// re-created button, and the route is built from it (its view a web area, its control that button, the gate
  /// keeping it), where the empty first hit would have made a possible web area with no route at all.
  func testTheElementRouteIsBuiltFromTheGuardsRecoveredHit() {
    let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 600, height: 400))
    let webArea = Node("AXWebArea", CGRect(x: 0, y: 50, width: 600, height: 350))
    let button = Node("AXButton", CGRect(x: 100, y: 100, width: 120, height: 30), title: "Again")
    webArea.add(button)
    window.add(webArea)
    let nodes = recorded(window)
    button.destroy()
    let again = Node("AXButton", CGRect(x: 100, y: 100, width: 120, height: 30), title: "Again")
    let point = CGPoint(x: 150, y: 115)
    var answers: [Node?] = [again]
    let verdict = stalePointVerdict(at: point, nodes: nodes, hit: nil, rehit: {
      webArea.add(again)
      return answers.removeFirst()
    }, reads: reads)
    XCTAssertEqual(verdict.identity, .recreated)
    guard case .recovered(let recovered) = stalePointRouteHit(nil, verdict, same: { $0 === $1 }) else { return XCTFail("not recovered") }
    XCTAssertTrue(recovered === again)
    func view(_ hit: Node?) -> PointerView {
      pointerView(engine: .chromium, webAreaSeen: true, hit: hit, role: { $0.role }, parent: { $0.parent }, children: { $0.children })
    }
    XCTAssertEqual(view(nil), .possibleWebArea, "the first hit's view: no route to build")
    XCTAssertEqual(view(recovered), .webArea)
    guard case .success(let control) = webAreaControl(recovered, role: { $0.role }, parent: { $0.parent }, editable: { _ in false }) else {
      return XCTFail("no control")
    }
    XCTAssertTrue(control.control === again, "the route presses the recovered button")
    let gate = StalePointGate(first: verdict, firstMs: 0) { verdict }
    XCTAssertNil(gate.check(control.control, waited: false, now: { 0 }, reads: reads).refusal)
    if case .recovered = stalePointRouteHit(again, verdict, same: { $0 === $1 }) { XCTFail("the same hit is unchanged") }
  }

  /// A background app that does not believe it has focus: the route's focus hold runs (its activation guard polls) after
  /// the early check, so the final check runs at the perform, after the hold; a feed prepend during the hold's wait is
  /// refused there, nothing pressed, and the meta and the sentence say the activation ran. With no hold the early verdict
  /// stands and nothing is read again.
  func testAChangeDuringTheFocusHoldsWaitIsRefusedAtTheFinalCheck() {
    let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 400, height: 200))
    let item = Node("AXButton", CGRect(x: 10, y: 10, width: 200, height: 30), title: "item-9")
    window.add(item)
    let nodes = recorded(window)
    let point = CGPoint(x: 50, y: 25)
    let gate = StalePointGate(first: verdict(nodes, at: point, hit: item), firstMs: 1) { verdict(nodes, at: point, hit: item) }
    XCTAssertNil(gate.check(item, waited: false, now: { 0 }, reads: reads).refusal, "the early check passes")
    var steps: [String] = []
    var record: StalePointRecord?
    XCTAssertThrowsError(try pressAfterFinalCheck(holds: true, hold: {
      steps.append("hold")
      item.frame = CGRect(x: 10, y: 40, width: 200, height: 30)  // a prepend during the activation guard's poll
    }, finalCheck: { afterHold in
      steps.append("check")
      let checked = gate.check(item, waited: afterHold, afterActivation: afterHold, now: { 0 }, reads: reads)
      record = checked.record
      if let refusal = checked.refusal { throw refusal }
    }, perform: { steps.append("perform") })) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "screenChangedSinceScreenshot")
      XCTAssertEqual(($0 as? EngineError)?.message,
                     "The screen changed since the screenshot: the AXButton \"item-9\" it showed at this point has moved away from it. The app was activated in the background, but nothing was pressed. Call getScreenshot for a new screenshot, then give the coordinates in its pixels.")
    }
    XCTAssertEqual(steps, ["hold", "check"], "nothing pressed")
    XCTAssertEqual(record?.reason, .frameMoved)
    XCTAssertEqual(record?.wire["afterActivation"] as? Bool, true)
    XCTAssertEqual(record?.wire["rechecked"] as? Bool, true)
    steps = []
    try? pressAfterFinalCheck(holds: false, hold: { steps.append("hold") }, finalCheck: { afterHold in
      steps.append(afterHold ? "recheck" : "check")
    }, perform: { steps.append("perform") })
    XCTAssertEqual(steps, ["check", "perform"])
  }

  /// Rulings 0a14b51f and 2db3ba75: inside a node the record holds incompletely (a budget-cut subtree), a post or a press
  /// goes through only while that container passes the guard as every node does (its live handle's frame read now
  /// holding the point, no label compared; or a handle re-created by role, frame and label), whatever the point reaches
  /// inside it (a hit under it, the container itself, nothing), and its reason says it went unguarded inside
  /// (`unrecordedDescendant`, or `unrecorded` at a point no recorded node holds), on the coordinate path and the element
  /// route alike.
  func testATruncatedContainerPassesOnlyWhileItPassesTheGuardItself() {
    func page() -> (window: Node, list: Node, row: Node, text: Node) {
      let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 600, height: 400))
      let list = Node("AXGroup", CGRect(x: 0, y: 50, width: 600, height: 300), title: "Results")
      let row = Node("AXButton", CGRect(x: 10, y: 60, width: 300, height: 30), title: "Open")
      let text = Node("AXStaticText", CGRect(x: 20, y: 65, width: 100, height: 20))
      row.add(text)
      list.add(row)
      window.add(list)
      return (window, list, row, text)
    }
    let point = CGPoint(x: 50, y: 75)
    // In place: kept, the reason naming the unguarded inside, for an interactive hit, a plain one and a press.
    do {
      let (window, _, row, text) = page()
      let nodes = recorded(window, skipping: [ObjectIdentifier(row)])
      XCTAssertEqual(verdict(nodes, at: point, hit: row).reason, .unrecordedDescendant)
      let plain = verdict(nodes, at: point, hit: text)
      XCTAssertEqual(plain.reason, .unrecordedDescendant, "a plain hit inside too: unguarded, and said so")
      XCTAssertFalse(plain.refused)
      XCTAssertEqual(stalePointPressVerdict(row, plain, reads: reads).reason, .unrecordedDescendant, "the element route's press")
      XCTAssertEqual(StalePointRecord(plain, ms: 0).wire["reason"] as? String, "unrecordedDescendant")
      XCTAssertEqual(stalePointPressVerdict(row, verdict(nodes, at: CGPoint(x: 900, y: 900), hit: row), reads: reads).reason, .unrecorded)
    }
    // The container itself, or nothing, at the point: still its unrecorded interior, kept and said so.
    do {
      let (window, list, row, _) = page()
      let nodes = recorded(window, skipping: [ObjectIdentifier(row)])
      XCTAssertEqual(verdict(nodes, at: point, hit: list).reason, .unrecordedDescendant, "a container-level hit")
      XCTAssertEqual(verdict(nodes, at: point, hit: nil).reason, .unrecordedDescendant, "an empty hit")
    }
    // The container moved: refused, with a hit inside it, a container-level hit and an empty hit, on both paths.
    do {
      let (window, list, row, _) = page()
      let nodes = recorded(window, skipping: [ObjectIdentifier(row)])
      move(list, by: CGVector(dx: 0, dy: 200))
      for (name, hit) in [("a hit inside", row), ("a container-level hit", list), ("an empty hit", nil)] as [(String, Node?)] {
        let moved = verdict(nodes, at: point, hit: hit)
        XCTAssertEqual(moved.reason, .frameMoved, name)
        XCTAssertTrue(stalePointPressVerdict(row, moved, reads: reads).refused, name)
      }
    }
    // A live container relabelled in place (a web area's page title gaining a count): kept, its interior unguarded, as
    // #298's blind spot keeps any live node.
    do {
      let (window, list, row, _) = page()
      let nodes = recorded(window, skipping: [ObjectIdentifier(row)])
      list.title = "(3) Results"
      XCTAssertEqual(verdict(nodes, at: point, hit: row).reason, .unrecordedDescendant)
      XCTAssertEqual(verdict(nodes, at: point, hit: list).reason, .unrecordedDescendant)
      XCTAssertEqual(stalePointPressVerdict(row, verdict(nodes, at: point, hit: nil), reads: reads).reason, .unrecordedDescendant)
    }
    // A container re-created with another title: not the node, refused; with the same title it passes.
    for (title, refused) in [("Ads", true), ("Results", false)] {
      let (window, list, row, _) = page()
      let nodes = recorded(window, skipping: [ObjectIdentifier(row)])
      list.destroy()
      let again = Node("AXGroup", CGRect(x: 0, y: 50, width: 600, height: 300), title: title)
      again.add(row)
      window.add(again)
      let judged = verdict(nodes, at: point, hit: row)
      XCTAssertEqual(judged.refused, refused, title)
      XCTAssertEqual(judged.reason, refused ? .nodeGone : .unrecordedDescendant, title)
    }
  }

  /// The record: each node's shown frame cut by its clipping ancestors, so page content scrolled up under the toolbar
  /// (its frame above the web area's) is never the node at a toolbar point; the deepest node, the later of two at a depth.
  func testTheRecordCutsFramesByClippingAncestorsAndTakesTheDeepestNode() {
    let chrome = Chrome()
    let scrolled = Node("AXButton", CGRect(x: 400, y: 60, width: 200, height: 40), title: "Scrolled away")
    chrome.webArea.add(Node("AXGroup", CGRect(x: 0, y: -400, width: 620, height: 1100), [scrolled]))
    let nodes = recorded(chrome.window)
    XCTAssertNil(nodes.first { $0.element === scrolled }?.shown, "nothing of it shows")
    XCTAssertTrue(deepestScreenshotNode(at: reloadPoint, in: nodes)?.element === chrome.reload, "Reload, not the page's button")
    let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 100, height: 100))
    let first = Node("AXGroup", CGRect(x: 0, y: 0, width: 50, height: 50))
    let second = Node("AXGroup", CGRect(x: 0, y: 0, width: 50, height: 50))
    window.add(first)
    window.add(second)
    XCTAssertTrue(deepestScreenshotNode(at: CGPoint(x: 10, y: 10), in: recorded(window))?.element === second)
    // A popover starts the cut again: its items show where its frame does, beyond the scroll area that holds its button.
    let scroll = Node("AXScrollArea", CGRect(x: 0, y: 0, width: 100, height: 50))
    let popover = Node("AXPopover", CGRect(x: 0, y: 40, width: 100, height: 60))
    let item = Node("AXMenuItem", CGRect(x: 0, y: 60, width: 100, height: 20))
    popover.add(item)
    scroll.add(popover)
    let clipped = Node("AXWindow", CGRect(x: 0, y: 0, width: 100, height: 100), [scroll])
    XCTAssertEqual(recorded(clipped).first { $0.element === item }?.shown, CGRect(x: 0, y: 60, width: 100, height: 20))
  }
}

// MARK: #305: a hit that is itself a recorded node at the point (the design session's ruling 45f5e5be)

/// #305's live check (runs 42251639474, 42256453844, 42262640885) found the deepest recorded node at a point is not always
/// what the hit-test answers on a still page, and #296 refused those clicks as `interactiveHit`. A hit that is itself a
/// recorded node, whose recorded frame and frame read now, each widened by 2 pt, hold the point, is kept as `recordedHit`.
final class RecordedHitTests: XCTestCase {
  /// GitHub's code view: the overlay AXTextArea and the code-lines AXGroup, siblings at one depth and one frame. The tie
  /// goes to the later group; Chromium's hit-test answers the textarea stacked on top.
  private struct Overlay {
    let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 1000, height: 800))
    let main = Node("AXGroup", CGRect(x: 0, y: 100, width: 1000, height: 700))
    let textArea = Node("AXTextArea", CGRect(x: 100, y: 200, width: 800, height: 400), description: "file content")
    let lines = Node("AXGroup", CGRect(x: 100, y: 200, width: 800, height: 400))
    let share = Node("AXButton", CGRect(x: 900, y: 120, width: 60, height: 30), title: "Share")
    init() {
      window.add(main)
      main.add(share)
      main.add(textArea)
      main.add(lines)
    }
  }
  private let codePoint = CGPoint(x: 300, y: 300)

  func testAnOverlaySiblingStackedOnTopIsARecordedHit() {
    let page = Overlay()
    let nodes = recorded(page.window)
    XCTAssertTrue(deepestScreenshotNode(at: codePoint, in: nodes)?.element === page.lines, "the tie goes to the later sibling")
    let kept = verdict(nodes, at: codePoint, hit: page.textArea)
    XCTAssertEqual(kept.reason, .recordedHit)
    XCTAssertFalse(kept.refused)
    XCTAssertNil(stalePointOutcome(kept, ms: 0, reads: reads).refusal)
    XCTAssertEqual(StalePointRecord(kept, ms: 0.5).wire as NSDictionary,
                   ["verdict": "kept", "reason": "recordedHit", "recordedHitBy": "hit", "identity": "handle", "recordedRole": "AXGroup",
                    "hitRole": "AXTextArea", "ms": 0.5] as NSDictionary, "a reason of its own in cua/stalePoint")
    // The window moved 700 pt since: the same reading, the recorded frame taken in the screenshot's space.
    let shift = CGVector(dx: 700, dy: 20)
    move(page.window, by: shift)
    XCTAssertEqual(verdict(nodes, at: CGPoint(x: codePoint.x + 700, y: codePoint.y + 20), shift: shift, hit: page.textArea).reason, .recordedHit)
  }

  /// Safari on macOS 26: the page view AXGroup (depth 4) spans the whole window under the toolbar, whose controls sit at
  /// depth 2 and 3 under AXWindow.
  func testAToolbarControlOverAFullWindowPageViewIsARecordedHit() {
    let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 1200, height: 800))
    let address = Node("AXTextField", CGRect(x: 310, y: 12, width: 540, height: 28), description: "Smart Search Field")
    let reload = Node("AXButton", CGRect(x: 860, y: 12, width: 28, height: 28), description: "Reload this page")
    window.add(Node("AXToolbar", CGRect(x: 0, y: 0, width: 1200, height: 52), [Node("AXGroup", CGRect(x: 300, y: 10, width: 600, height: 32), [address, reload])]))
    let pageView = Node("AXGroup", CGRect(x: 0, y: 0, width: 1200, height: 800))
    window.add(Node("AXSplitGroup", CGRect(x: 0, y: 0, width: 1200, height: 800),
                    [Node("AXTabGroup", CGRect(x: 0, y: 0, width: 1200, height: 800), [Node("AXGroup", CGRect(x: 0, y: 0, width: 1200, height: 800), [pageView])])]))
    let nodes = recorded(window)
    for (control, point) in [(address, CGPoint(x: 400, y: 26)), (reload, CGPoint(x: 874, y: 26))] {
      XCTAssertTrue(deepestScreenshotNode(at: point, in: nodes)?.element === pageView, "the page view is deeper")
      XCTAssertEqual(verdict(nodes, at: point, hit: control).reason, .recordedHit, control.role)
    }
  }

  /// Wikipedia's hatnote: the second link's text wraps across two lines, so its 614 × 44 box takes in the first link,
  /// which is what the hit-test answers.
  func testAWrappedTextsBoxOverItsNeighbourIsARecordedHit() {
    let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 800, height: 600))
    let first = Node("AXLink", CGRect(x: 200, y: 100, width: 150, height: 20), title: "Mercury (planet)",
                     [Node("AXStaticText", CGRect(x: 200, y: 100, width: 150, height: 20), title: "Mercury (planet)")])
    let wrapped = Node("AXStaticText", CGRect(x: 100, y: 100, width: 614, height: 44), title: "Mercury (element), the chemical element")
    let second = Node("AXLink", CGRect(x: 100, y: 100, width: 614, height: 44), title: "Mercury (element)", [wrapped])
    window.add(Node("AXWebArea", CGRect(x: 0, y: 0, width: 800, height: 600), [Node("AXGroup", CGRect(x: 0, y: 100, width: 800, height: 44), [first, second])]))
    let nodes = recorded(window)
    let point = CGPoint(x: 260, y: 110)
    XCTAssertTrue(deepestScreenshotNode(at: point, in: nodes)?.element === wrapped)
    XCTAssertEqual(verdict(nodes, at: point, hit: first).reason, .recordedHit)
  }

  /// Finder's list view: the name AXTextField's frame starts at x 231, and the hit-test answers it at x 230, where the
  /// chosen node is its complete parent AXCell. The hit's own frame widened by 2 pt carries 1 and 2 pt past it; past
  /// that, by ruling a27fc57c, its unmoved parent cell's does, up to 2 pt past the cell. Under a parent that cannot carry
  /// it (an area role), 3 pt past the hit's own frame refuses.
  func testAHitOnePointPastItsFrameIsARecordedHitAndThreeAreNot() {
    func list(_ parentRole: String) -> (nodes: [ScreenshotNode<Node>], name: Node, parent: Node) {
      let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 600, height: 400))
      let name = Node("AXTextField", CGRect(x: 231, y: 101, width: 160, height: 18), title: "report.pdf")
      let parent = Node(parentRole, CGRect(x: 200, y: 100, width: 200, height: 20), [name])
      window.add(Node("AXOutline", CGRect(x: 0, y: 50, width: 600, height: 350), [Node("AXRow", CGRect(x: 0, y: 100, width: 600, height: 20), [parent])]))
      return (recorded(window), name, parent)
    }
    let (nodes, name, cell) = list("AXCell")
    let edge = CGPoint(x: 230, y: 110)
    XCTAssertTrue(deepestScreenshotNode(at: edge, in: nodes)?.element === cell)
    for (x, by, why) in [(230, RecordedHitFrame.hit, "1 pt"), (229, .hit, "2 pt: the hit's bound"), (228, .ancestor, "3 pt: the cell's"),
                         (198, .ancestor, "2 pt past the cell")] as [(CGFloat, RecordedHitFrame, String)] {
      let kept = verdict(nodes, at: CGPoint(x: x, y: 110), hit: name)
      XCTAssertEqual(kept.reason, .recordedHit, why)
      XCTAssertEqual(kept.recordedHitBy, by, why)
    }
    XCTAssertEqual(verdict(nodes, at: CGPoint(x: 197, y: 110), hit: name).reason, .interactiveHit, "3 pt past the cell")
    let (area, field, _) = list("AXWebArea")
    XCTAssertEqual(verdict(area, at: CGPoint(x: 230, y: 110), hit: field).recordedHitBy, .hit, "1 pt: its own frame")
    XCTAssertEqual(verdict(area, at: CGPoint(x: 228, y: 110), hit: field).reason, .interactiveHit, "3 pt, its parent an area")
  }

  /// Ruling a27fc57c (the A/B on 62e9f026): Safari answers its address field anywhere in its toolbar item's padding, so a
  /// click 8 pt above the field's frame (y 58-89) lies in its recorded parent AXGroup (y 40-92), which carries it while
  /// neither has moved. A field that moved inside its unchanged parent, or a parent that moved, refuses.
  func testSafarisToolbarPaddingIsCarriedByTheFieldsRecordedParent() {
    func toolbar() -> (window: Node, item: Node, field: Node) {
      let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 1200, height: 800))
      let field = Node("AXTextField", CGRect(x: 310, y: 58, width: 540, height: 31), description: "Smart Search Field")
      let item = Node("AXGroup", CGRect(x: 300, y: 40, width: 600, height: 52), [field])
      window.add(Node("AXToolbar", CGRect(x: 0, y: 30, width: 1200, height: 70), [item]))
      let full = CGRect(x: 0, y: 0, width: 1200, height: 800)
      window.add(Node("AXSplitGroup", full, [Node("AXTabGroup", full, [Node("AXGroup", full, [Node("AXGroup", full)])])]))  // the page view, depth 4
      return (window, item, field)
    }
    let padding = CGPoint(x: 460, y: 50)
    do {
      let (window, _, field) = toolbar()
      let nodes = recorded(window)
      let kept = verdict(nodes, at: padding, hit: field)
      XCTAssertEqual(kept.reason, .recordedHit)
      XCTAssertEqual(StalePointRecord(kept, ms: 0).wire["recordedHitBy"] as? String, "ancestor", "the meta says which frame carried it")
      XCTAssertEqual(verdict(nodes, at: CGPoint(x: 460, y: 70), hit: field).recordedHitBy, .hit, "inside the field: its own")
      let first = verdict(nodes, at: padding, hit: nil)
      XCTAssertEqual(stalePointPressVerdict(field, first, reads: reads).recordedHitBy, .ancestor, "the element route's counterpart")
    }
    do {
      let (window, item, field) = toolbar()
      let nodes = recorded(window)
      item.frame = item.frame?.offsetBy(dx: 0, dy: 5)
      XCTAssertEqual(verdict(nodes, at: padding, hit: field).reason, .interactiveHit, "the parent moved")
    }
    do {
      let (window, _, field) = toolbar()
      let nodes = recorded(window)
      field.frame = field.frame?.offsetBy(dx: 0, dy: 3)
      XCTAssertEqual(verdict(nodes, at: padding, hit: field).reason, .interactiveHit, "the field moved inside its unchanged parent")
      XCTAssertEqual(verdict(nodes, at: CGPoint(x: 460, y: 70), hit: field).reason, .interactiveHit, "and inside its own frame")
    }
  }

  /// Ruling a27fc57c's bounds: the nearest recorded ancestor carries the point only when it is no area role (AXWindow,
  /// AXWebArea, AXScrollArea, AXSplitGroup, AXApplication) and covers at most a quarter of the window, and never one
  /// further up: a recorded hit unrelated to what the point shows inside such a container is refused.
  func testABigContainersAreaNeverCarriesAnUnrelatedRecordedHit() {
    func container(_ role: String, _ frame: CGRect) -> StalePointVerdict<Node> {
      let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 1000, height: 800))
      let open = Node("AXButton", CGRect(x: 10, y: 10, width: 80, height: 30), title: "Open")
      let note = Node("AXStaticText", CGRect(x: 200, y: 200, width: 100, height: 20), title: "Note")
      window.add(Node(role, frame, [open, note]))
      let nodes = recorded(window)
      let point = CGPoint(x: 250, y: 210)
      XCTAssertTrue(deepestScreenshotNode(at: point, in: nodes)?.element === note, role)
      return verdict(nodes, at: point, hit: open)
    }
    let small = CGRect(x: 0, y: 0, width: 400, height: 300)  // 15% of the window
    for role in ["AXWindow", "AXWebArea", "AXScrollArea", "AXSplitGroup", "AXApplication"] {
      XCTAssertEqual(container(role, small).reason, .interactiveHit, role)
    }
    XCTAssertEqual(container("AXGroup", CGRect(x: 0, y: 0, width: 600, height: 400)).reason, .interactiveHit, "a group over a quarter (30%)")
    XCTAssertEqual(container("AXGroup", CGRect(x: 0, y: 0, width: 500, height: 400)).recordedHitBy, .ancestor, "a group of a quarter")
    XCTAssertEqual(container("AXGroup", small).recordedHitBy, .ancestor, "a small group")
    // The nearest recorded ancestor only: a small group above it does not carry a point outside it.
    let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 1000, height: 800))
    let open = Node("AXButton", CGRect(x: 10, y: 10, width: 80, height: 30), title: "Open")
    let note = Node("AXStaticText", CGRect(x: 200, y: 200, width: 100, height: 20), title: "Note")
    window.add(Node("AXGroup", small, [Node("AXGroup", CGRect(x: 5, y: 5, width: 100, height: 40), [open]), note]))
    XCTAssertEqual(verdict(recorded(window), at: CGPoint(x: 250, y: 210), hit: open).reason, .interactiveHit, "never climbed further")
  }

  /// Rule 1: the hit is itself a recorded node, by its handle, or by #296's re-created identity while the recorded
  /// node's own handle is gone; no looser match.
  func testTheHitMustBeARecordedNodeByHandleOrByTheReCreatedIdentity() {
    func page(_ change: (Overlay) -> Node) -> StalePointReason {
      let page = Overlay()
      let nodes = recorded(page.window)
      return verdict(nodes, at: codePoint, hit: change(page)).reason
    }
    func textArea(_ frame: CGRect = CGRect(x: 100, y: 200, width: 800, height: 400), description: String? = "file content") -> Node {
      Node("AXTextArea", frame, description: description)
    }
    XCTAssertEqual(page { page in
      page.textArea.destroy()
      let again = textArea()
      page.main.add(again)
      return again
    }, .recordedHit, "re-created in place: the same role, frame and label")
    XCTAssertEqual(page { page in
      page.textArea.destroy()
      let again = textArea(CGRect(x: 101, y: 201, width: 800, height: 401))
      page.main.add(again)
      return again
    }, .recordedHit, "within 2 pt")
    XCTAssertEqual(page { page in
      page.textArea.destroy()
      let again = textArea(CGRect(x: 103, y: 200, width: 800, height: 400))
      page.main.add(again)
      return again
    }, .interactiveHit, "3 pt off")
    XCTAssertEqual(page { page in
      page.textArea.destroy()
      let again = textArea(description: "comment box")
      page.main.add(again)
      return again
    }, .interactiveHit, "another label")
    XCTAssertEqual(page { page in
      page.textArea.destroy()
      let field = Node("AXTextField", CGRect(x: 100, y: 200, width: 800, height: 400), description: "file content")
      page.main.add(field)
      return field
    }, .interactiveHit, "another role")
    XCTAssertEqual(page { page in
      let lookalike = textArea()
      page.main.add(lookalike)
      return lookalike
    }, .interactiveHit, "a lookalike over the recorded one, whose handle still answers")
    XCTAssertEqual(page { page in
      let new = Node("AXButton", CGRect(x: 250, y: 250, width: 100, height: 100), title: "Sponsor")
      page.main.add(new)
      return new
    }, .interactiveHit, "a new element")
    // A hit that is a recorded handle is that node and no other: a recorded textarea from elsewhere, moved over the place
    // of a gone lookalike, is refused.
    let page = Overlay()
    let spare = textArea(CGRect(x: 100, y: 650, width: 800, height: 100))
    page.main.add(spare)
    let nodes = recorded(page.window)
    page.textArea.destroy()
    spare.frame = CGRect(x: 100, y: 200, width: 800, height: 400)
    XCTAssertEqual(verdict(nodes, at: codePoint, hit: spare).reason, .interactiveHit, "recorded elsewhere, a lookalike's place taken")
  }

  /// Rule 2 (ruling a27fc57c): the hit has not moved, its frame read now within 2 pt of the recorded one: a hit-test
  /// that answers a recorded node's handle at its old place after it moved (Chrome's, #294), or one whose frame does not
  /// read, is refused.
  func testAHitThatMovedIsRefused() {
    let page = Overlay()
    let nodes = recorded(page.window)
    page.textArea.frame = CGRect(x: 100, y: 700, width: 800, height: 80)
    XCTAssertEqual(verdict(nodes, at: codePoint, hit: page.textArea).reason, .interactiveHit)
    page.textArea.frame = nil
    XCTAssertEqual(verdict(nodes, at: codePoint, hit: page.textArea).reason, .interactiveHit, "its frame unread")
  }

  /// Rule 2 tests the part of the recorded frame the screenshot showed: page content scrolled up under Chrome's toolbar
  /// keeps frames there, and a hit-test that answers it at a toolbar point is refused, wholly or partly clipped.
  func testARecordedNodeClippedOutAtThePointIsRefused() {
    let window = Node("AXWindow", CGRect(x: 0, y: 25, width: 620, height: 700))
    let reload = Node("AXButton", CGRect(x: 442, y: 77, width: 34, height: 34), description: "Reload")
    window.add(Node("AXToolbar", CGRect(x: 0, y: 70, width: 620, height: 48), [reload]))
    let hidden = Node("AXLink", CGRect(x: 400, y: 60, width: 200, height: 40), title: "Scrolled away")
    let partly = Node("AXLink", CGRect(x: 400, y: 80, width: 200, height: 60), title: "Half under the toolbar")
    window.add(Node("AXWebArea", CGRect(x: 0, y: 118, width: 620, height: 607),
                    [Node("AXGroup", CGRect(x: 0, y: -400, width: 620, height: 1100), [hidden, partly])]))
    let nodes = recorded(window)
    XCTAssertNil(nodes.first { $0.element === hidden }?.shown)
    XCTAssertEqual(nodes.first { $0.element === partly }?.shown, CGRect(x: 400, y: 118, width: 200, height: 22))
    let point = CGPoint(x: 459, y: 94)
    XCTAssertTrue(deepestScreenshotNode(at: point, in: nodes)?.element === reload)
    XCTAssertEqual(verdict(nodes, at: point, hit: hidden).reason, .interactiveHit, "wholly clipped out")
    XCTAssertEqual(verdict(nodes, at: point, hit: partly).reason, .interactiveHit, "clipped out at the point")
    XCTAssertEqual(verdict(nodes, at: CGPoint(x: 459, y: 117), hit: partly).reason, .recordedHit, "1 pt from where it showed, the toolbar chosen")
  }

  /// Every stale class #296 refused still refuses: the chosen node's own checks run first, and a hit recorded elsewhere
  /// fails rule 2.
  func testEveryStaleClassOf296StillRefuses() {
    // #294: the frame read again with the same handle, and a recorded Forward that took Reload's place.
    do {
      let window = Node("AXWindow", CGRect(x: 0, y: 25, width: 620, height: 700))
      let reload = Node("AXButton", CGRect(x: 442, y: 77, width: 34, height: 34), description: "Reload")
      let forward = Node("AXButton", CGRect(x: 478, y: 77, width: 34, height: 34), description: "Forward")
      window.add(Node("AXToolbar", CGRect(x: 0, y: 70, width: 620, height: 48), [reload, forward]))
      let nodes = recorded(window)
      let point = CGPoint(x: 459, y: 94)
      reload.frame = CGRect(x: 478, y: 77, width: 34, height: 34)
      XCTAssertEqual(verdict(nodes, at: point, hit: reload).reason, .frameMoved, "#294")
      forward.frame = CGRect(x: 442, y: 77, width: 34, height: 34)
      XCTAssertEqual(verdict(nodes, at: point, hit: forward).reason, .frameMoved, "#294, a recorded control there now")
    }
    // A moved button, a recorded neighbour slid into its place.
    do {
      let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 400, height: 200))
      let a = Node("AXButton", CGRect(x: 10, y: 10, width: 80, height: 30), title: "A")
      let b = Node("AXButton", CGRect(x: 110, y: 10, width: 80, height: 30), title: "B")
      window.add(a)
      window.add(b)
      let nodes = recorded(window)
      a.frame = CGRect(x: 10, y: 60, width: 80, height: 30)
      b.frame = CGRect(x: 10, y: 10, width: 80, height: 30)
      XCTAssertEqual(verdict(nodes, at: CGPoint(x: 50, y: 25), hit: b).reason, .frameMoved, "a moved button")
    }
    // A feed prepend: every item pushed down a row, item-8 now where item-9 was.
    do {
      let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 400, height: 400))
      let feed = Node("AXGroup", CGRect(x: 0, y: 0, width: 400, height: 400))
      let items = (1...10).map { Node("AXButton", CGRect(x: 10, y: CGFloat($0) * 30, width: 300, height: 30), title: "item-\($0)") }
      for item in items { feed.add(item) }
      window.add(feed)
      let nodes = recorded(window)
      for item in items { item.frame = item.frame?.offsetBy(dx: 0, dy: 30) }
      feed.add(Node("AXButton", CGRect(x: 10, y: 30, width: 300, height: 30), title: "item-0"))
      let point = CGPoint(x: 50, y: 9 * 30 + 15)
      XCTAssertEqual(verdict(nodes, at: point, hit: items[7]).reason, .frameMoved, "a feed prepend")
    }
    // Swapped in: a new element, or a recorded one from elsewhere; a link that replaced a button; the same role with a
    // changed label.
    func swapped(_ swap: (_ window: Node, _ save: Node, _ other: Node) -> Node) -> StalePointReason {
      let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 400, height: 200))
      let save = Node("AXButton", CGRect(x: 10, y: 10, width: 80, height: 30), title: "Save")
      let other = Node("AXButton", CGRect(x: 10, y: 100, width: 80, height: 30), title: "Delete")
      window.add(save)
      window.add(other)
      let nodes = recorded(window)
      save.destroy()
      return verdict(nodes, at: CGPoint(x: 50, y: 25), hit: swap(window, save, other))
        .reason
    }
    XCTAssertEqual(swapped { window, _, _ in
      let new = Node("AXCheckBox", CGRect(x: 10, y: 10, width: 80, height: 30), title: "Agree")
      window.add(new)
      return new
    }, .nodeGone, "a swapped-in element")
    XCTAssertEqual(swapped { _, _, other in
      other.frame = CGRect(x: 10, y: 10, width: 80, height: 30)
      return other
    }, .nodeGone, "a recorded element swapped into its place")
    XCTAssertEqual(swapped { window, _, _ in
      let link = Node("AXLink", CGRect(x: 10, y: 10, width: 80, height: 30), title: "Save")
      window.add(link)
      return link
    }, .nodeGone, "a link that replaced a button")
    XCTAssertEqual(swapped { window, _, _ in
      let delete = Node("AXButton", CGRect(x: 10, y: 10, width: 80, height: 30), title: "Delete")
      window.add(delete)
      return delete
    }, .nodeGone, "the same role, a changed label")
    // A recorded node recorded elsewhere, now over a node still in place (rule 2).
    do {
      let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 400, height: 400))
      let text = Node("AXStaticText", CGRect(x: 10, y: 10, width: 200, height: 20), description: "Draft saved")
      let delete = Node("AXButton", CGRect(x: 10, y: 300, width: 100, height: 30), title: "Delete")
      window.add(text)
      window.add(delete)
      let nodes = recorded(window)
      delete.frame = CGRect(x: 10, y: 5, width: 100, height: 30)
      let refused = verdict(nodes, at: CGPoint(x: 20, y: 20), hit: delete)
      XCTAssertEqual(refused.reason, .interactiveHit, "a hit recorded elsewhere")
      XCTAssertEqual(stalePointOutcome(refused, ms: 0, reads: reads).refusal?.message,
                     "The screen changed since the screenshot: the AXStaticText \"Draft saved\" it showed at this point is no longer what it reaches; AXButton \"Delete\" is there now. Nothing was sent. Call getScreenshot for a new screenshot, then give the coordinates in its pixels.")
    }
  }

  /// The element route's counterpart (#282's press, #283's focus): what it would act on, where it would be `pressedOther`,
  /// is kept as `recordedHit` under the same three rules, and refused otherwise.
  func testTheElementRouteKeepsARecordedNodeAtThePoint() {
    let page = Overlay()
    let nodes = recorded(page.window)
    let first = verdict(nodes, at: codePoint, hit: page.lines)
    XCTAssertEqual(first.reason, .sameElement)
    let pressed = stalePointPressVerdict(page.textArea, first, reads: reads)
    XCTAssertEqual(pressed.reason, .recordedHit)
    XCTAssertFalse(pressed.refused)
    let gate = StalePointGate(first: first, firstMs: 0.5) { verdict(nodes, at: self.codePoint, hit: page.textArea) }
    let checked = gate.check(page.textArea, waited: true, now: { 0 }, reads: reads)
    XCTAssertNil(checked.refusal)
    XCTAssertEqual(checked.record.wire["reason"] as? String, "recordedHit", "after the route's wait, the recheck's reading")
    XCTAssertEqual(stalePointPressVerdict(page.share, first, reads: reads).reason, .pressedOther, "recorded elsewhere")
    let new = Node("AXButton", CGRect(x: 250, y: 250, width: 100, height: 100), title: "Sponsor")
    page.main.add(new)
    XCTAssertEqual(stalePointPressVerdict(new, first, reads: reads).reason, .pressedOther, "a new element")
    page.share.frame = CGRect(x: 280, y: 280, width: 60, height: 30)
    XCTAssertEqual(stalePointPressVerdict(page.share, first, reads: reads).reason, .pressedOther, "recorded elsewhere, over the point now")
    page.textArea.frame = CGRect(x: 100, y: 700, width: 800, height: 80)
    XCTAssertEqual(stalePointPressVerdict(page.textArea, first, reads: reads).reason, .pressedOther, "its frame read now off the point")
  }
}

// MARK: The refusal through the pointer's delivery

final class StalePointDeliveryTests: XCTestCase {
  private let target: pid_t = 990_001, user: pid_t = 990_002
  private let window = CGRect(x: 80, y: 60, width: 610, height: 860)
  private let point = CGPoint(x: 300, y: 400)
  private let activations = HeldActivations()
  private let stale = screenChangedSinceScreenshot(was: "AXButton \"Reload\"", reason: .frameMoved, now: nil)

  private func meta(_ desktop: DesktopMode = .shared) -> InputMeta {
    let connection = ConnectionState(id: 1, fd: -1)
    connection.desktop = desktop
    var meta = InputMeta(ExecutionContext(connection: connection, receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
    meta.stalePoint = StalePointRecord(StalePointVerdict<Node>(reason: .frameMoved, hitRole: "AXButton"), ms: 1)
    return meta
  }

  /// Chrome's activation (its AXActivationPoint outside the frame: it clicks none), or Electron's (an inert point inside).
  private func activation(_ seam: GuardSeam, clicksActivationPoint: Bool = false) -> FakeActivation {
    seam.activationPoint = clicksActivationPoint ? CGPoint(x: 300, y: 70) : CGPoint(x: -1, y: 1441)
    return FakeActivation(pid: target, window: AXUIElementCreateApplication(target), windowFrame: window, windowID: 41, system: seam.system)
  }

  private func click(_ seam: GuardSeam, _ activation: FakeActivation?, route: InputRoute = .activation, button: MouseButton = .left,
                     pointer: PointerTarget, meta: inout InputMeta) throws {
    try deliverClick(ClickTarget(point: point, windowFrame: window, windowID: 41, pid: target), route: route, button: button, count: 1,
                     activation: activation, activations: activations, pointer: pointer, targetActive: { false }, post: seam.system.post, meta: &meta)
  }

  private func refused(_ view: PointerView, elementRoute: ((inout InputMeta) throws -> Void)? = nil) -> PointerTarget {
    var pointer = PointerTarget(view: view, app: "Google Chrome for Testing", elementRoute: elementRoute)
    pointer.staleRefusal = stale
    return pointer
  }

  private func assertRefusedWithNothingPosted(_ seam: GuardSeam, _ meta: InputMeta, _ attempt: () throws -> Void, _ name: String) {
    XCTAssertThrowsError(try attempt(), name) { XCTAssertEqual(($0 as? EngineError)?.errorName, "screenChangedSinceScreenshot", name) }
    XCTAssertEqual(seam.posts.count, 0, "nothing posted: \(name)")
    XCTAssertEqual(seam.holds, 0, "no screen-update hold: \(name)")
    XCTAssertEqual(activations.holders(target), 0, "nothing held: \(name)")
    XCTAssertNil(meta.startedAt, name)
    XCTAssertNil(meta.activationClickKind, "no activation ran: \(name)")
    XCTAssertEqual(meta.stalePoint?.verdict, .refused, name)
  }

  /// Wherever no element route can take the pointer (a native view, any button but the left, another route, a dedicated
  /// desktop), the refusal is thrown before the activation: nothing is posted, activated or held.
  func testARefusedPointNoElementRouteCanTakeIsRefusedBeforeAnything() {
    let cases: [(String, PointerView, InputRoute, MouseButton, DesktopMode)] = [
      ("a native view, shared", .acceptsFirstMouse, .activation, .left, .shared),
      ("an unknown app, shared", .unknown, .activation, .left, .shared),
      ("a right click into a web area", .webArea, .activation, .right, .shared),
      ("a web area, dedicated", .webArea, .activation, .left, .dedicated),
      ("route 2', forced", .acceptsFirstMouse, .plainPost, .left, .shared),
    ]
    for (name, view, route, button, desktop) in cases {
      let seam = GuardSeam(frontmost: user)
      var clickMeta = meta(desktop)
      assertRefusedWithNothingPosted(seam, clickMeta, {
        try self.click(seam, route == .activation ? self.activation(seam) : nil, route: route, button: button, pointer: self.refused(view), meta: &clickMeta)
      }, name)
    }
    // A drag's start likewise.
    let seam = GuardSeam(frontmost: user)
    var dragMeta = meta()
    assertRefusedWithNothingPosted(seam, dragMeta, {
      try deliverPointer(to: self.target, route: .activation, activation: self.activation(seam), activations: self.activations,
                         pointer: self.refused(.acceptsFirstMouse), post: seam.system.post, meta: &dragMeta) { [] }
    }, "a drag")
  }

  /// The design session's ruling 1ea561bc ca82a6f4: a stale point into a background web area is refused before #282's
  /// element route, which presses nothing (the A/B's feed and link-swap cells had it press what lay there now), and cua
  /// posts nothing; a kept point's element route runs as before.
  func testAStalePointIsRefusedBeforeTheElementRouteAndAKeptOneIsElementRouted() throws {
    let seam = GuardSeam(frontmost: user)
    var clickMeta = meta()
    var pressed = 0
    let press: (inout InputMeta) throws -> Void = { meta in
      pressed += 1
      try deliverAction("AXPress", route: .action, perform: { _ in .success }, meta: &meta)
    }
    assertRefusedWithNothingPosted(seam, clickMeta, {
      try self.click(seam, self.activation(seam), pointer: self.refused(.webArea, elementRoute: press), meta: &clickMeta)
    }, "a stale web-area click")
    XCTAssertEqual(pressed, 0, "nothing pressed")
    XCTAssertEqual(clickMeta.stalePoint?.wire["verdict"] as? String, "refused")
    let kept = GuardSeam(frontmost: user)
    var keptMeta = meta()
    try click(kept, activation(kept), pointer: PointerTarget(view: .webArea, app: "Google Chrome for Testing", elementRoute: press), meta: &keptMeta)
    XCTAssertEqual(pressed, 1, "a kept point: element-routed as before")
    XCTAssertEqual(kept.posts.count, 0)
  }

  /// Where a web-area click in shared mode would be posted rather than element-routed (an activation that clicks its
  /// activation point; an app that already believes it has focus; a join of a hold that clicked one), the guard's
  /// refusal is thrown at that point, before subtype 1, any click or any withdrawal.
  func testAWebAreaClickThatWouldBePostedIsRefusedBeforeAnything() throws {
    do {
      let seam = GuardSeam(frontmost: user)
      var clickMeta = meta()
      assertRefusedWithNothingPosted(seam, clickMeta, {
        try self.click(seam, self.activation(seam, clicksActivationPoint: true), pointer: self.refused(.webArea), meta: &clickMeta)
      }, "an activation point's click")
    }
    do {
      let seam = GuardSeam(frontmost: target)
      var clickMeta = meta()
      assertRefusedWithNothingPosted(seam, clickMeta, {
        try self.click(seam, self.activation(seam), pointer: self.refused(.webArea), meta: &clickMeta)
      }, "the app believing it has focus")
    }
    do {
      let seam = GuardSeam(frontmost: user)
      let holder = ConnectionState(id: 2, fd: -1)
      var keys = InputMeta(ExecutionContext(connection: holder, receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
      try holdFocus(app: "electron", pid: target, connection: holder, activations: activations,
                    activation: { self.activation(seam, clicksActivationPoint: true) }, beforeActivating: {}, meta: &keys)
      let held = seam.posts.map(\.kind)
      var clickMeta = meta()
      XCTAssertThrowsError(try click(seam, activation(seam, clicksActivationPoint: true), pointer: refused(.webArea), meta: &clickMeta)) {
        XCTAssertEqual(($0 as? EngineError)?.errorName, "screenChangedSinceScreenshot")
      }
      XCTAssertEqual(seam.posts.map(\.kind), held, "nothing posted, nothing withdrawn: the hold untouched")
      XCTAssertEqual(activations.holders(target), 1, "the hold's share kept")
      XCTAssertNil(clickMeta.startedAt)
      holder.endFocusHold()
    }
  }

  /// A kept point is delivered as before: the same events as with no guard at all.
  func testAKeptPointIsDeliveredAsBefore() throws {
    let seam = GuardSeam(frontmost: user)
    var clickMeta = meta()
    try click(seam, activation(seam, clicksActivationPoint: true), pointer: PointerTarget(view: .acceptsFirstMouse, app: "TextEdit"), meta: &clickMeta)
    XCTAssertNotNil(clickMeta.startedAt)
    XCTAssertTrue(seam.posts.contains { $0.kind == .mouse(.leftMouseDown) })
  }
}

// MARK: #316's rule W: a new window of the app's over the screenshot's (the design session's ruling 4701abd8)

final class NewWindowGuardTests: XCTestCase {
  private let app: pid_t = 990_011, other: pid_t = 990_012
  private let target: CGWindowID = 41
  /// What the screenshot's window list held: the target, a window of the app's already over it (Chrome's omnibox popup
  /// open at the screenshot), and another app's.
  private let recorded: Set<CGWindowID> = [41, 50, 60]
  private let point = CGPoint(x: 300, y: 400)

  private func window(_ number: CGWindowID, _ owner: pid_t, layer: Int = 0) -> ListedWindow {
    ListedWindow(number: number, owner: owner, layer: layer, bounds: CGRect(x: 80, y: 60, width: 610, height: 860))
  }
  private var targetWindow: ListedWindow { window(target, app) }

  /// The guard over `list` (front to back): its verdict, and whether the tree was read and the window list read.
  private func guarded(_ list: [ListedWindow], recorded: Set<CGWindowID>? = nil, target: CGWindowID? = 41)
    -> (verdict: StalePointVerdict<Node>, treeRead: Bool, listRead: Bool) {
    var treeRead = false, listRead = false
    let verdict = guardedPointVerdict(at: point, hit: Node?.none, target: target, pid: app, recorded: recorded ?? self.recorded,
                                      windows: { listRead = true; return list }) {
      treeRead = true
      return StalePointVerdict<Node>(reason: .sameElement)
    }
    return (verdict, treeRead, listRead)
  }

  /// Safari's ⌘L overlay: a window of Safari's own at layer 0 above the browser window, not in the screenshot's list.
  /// Refused before the tree is read, with the guard's name and a sentence of its own.
  func testANewLayerZeroWindowOfTheAppsAboveTheTargetRefuses() {
    let (verdict, treeRead, _) = guarded([window(77, app), window(50, app), targetWindow])
    XCTAssertEqual(verdict.reason, .newWindow)
    XCTAssertTrue(verdict.refused)
    XCTAssertEqual(verdict.newWindow?.number, 77)
    XCTAssertFalse(treeRead, "nothing of the tree read")
    var outcome = stalePointOutcome(verdict, ms: 0.5, app: "Safari", reads: reads)
    outcome.record.windowsMs = 0.3
    XCTAssertEqual(outcome.refusal?.errorName, "screenChangedSinceScreenshot")
    XCTAssertEqual(outcome.refusal?.message,
                   "The screen changed since the screenshot: Safari has opened a window over the one the screenshot showed, which can take the click. Nothing was sent. Call getScreenshot for a new screenshot, then give the coordinates in its pixels.")
    XCTAssertEqual(outcome.record.wire as NSDictionary, ["verdict": "refused", "reason": "newWindow", "newWindow": 77, "windowsMs": 0.3,
                                                         "ms": 0.5] as NSDictionary)
    // The frontmost of two new ones is named.
    XCTAssertEqual(guarded([window(78, app), window(77, app), targetWindow]).verdict.newWindow?.number, 78)
    // Wherever it lies: one far from the point refuses too.
    let far = ListedWindow(number: 79, owner: app, layer: 0, bounds: CGRect(x: 2000, y: 0, width: 10, height: 10))
    XCTAssertEqual(guarded([far, targetWindow]).verdict.reason, .newWindow)
  }

  /// What W leaves to the tree: a window the screenshot's list held (Chrome's popup open at the screenshot), one below the
  /// target, one at another layer (a menu, a floating panel, the system's), another app's, a list without the target, and
  /// a screenshot or a click without the numbers to compare (the list then never read).
  func testWhatTheRuleLeavesToTheTree() {
    let kept: [(String, [ListedWindow])] = [
      ("in the screenshot's list", [window(50, app), targetWindow]),
      ("below the target", [targetWindow, window(77, app)]),
      ("a pop-up menu's layer", [window(77, app, layer: 101), targetWindow]),
      ("a floating panel's layer", [window(77, app, layer: 3), targetWindow]),
      ("another app's window", [window(77, other), targetWindow]),
      ("no target in the list", [window(77, app)]),
    ]
    for (name, list) in kept {
      let (verdict, treeRead, _) = guarded(list)
      XCTAssertEqual(verdict.reason, .sameElement, name)
      XCTAssertTrue(treeRead, name)
    }
    var listRead = false
    let none = guardedPointVerdict(at: point, hit: Node?.none, target: target, pid: app, recorded: nil,
                                   windows: { listRead = true; return [self.window(77, self.app), self.targetWindow] }) {
      StalePointVerdict<Node>(reason: .sameElement)
    }
    XCTAssertEqual(none.reason, .sameElement, "no recorded list: nothing to compare")
    XCTAssertFalse(listRead, "and the list is not read")
    let noTarget = guarded([window(77, app), targetWindow], target: nil)
    XCTAssertEqual(noTarget.verdict.reason, .sameElement, "no window number for the click's window")
    XCTAssertFalse(noTarget.listRead)
  }

  /// The screenshot keeps the window list its capture read.
  func testTheScreenshotKeepsItsWindowList() {
    let image = CapturedScreenshot(url: "file:///x.jpg", width: 1220, height: 1720, frame: CGRect(x: 0, y: 0, width: 610, height: 860), scale: 2,
                                   windowList: [41, 50])
    XCTAssertEqual(ObservedScreenshot(window: AXUIElementCreateApplication(app), image: image).windowList, [41, 50])
  }

  /// The refusal reaches the pointer's delivery as every guard refusal does: a click's and a drag's start alike, nothing
  /// posted, activated or held.
  func testTheRefusalPostsNothingForAClickOrADragStart() {
    let verdict = guarded([window(77, app), targetWindow]).verdict
    let refusal = stalePointOutcome(verdict, ms: 0, app: "Safari", reads: reads).refusal
    let frame = CGRect(x: 80, y: 60, width: 610, height: 860)
    let activations = HeldActivations()
    for drag in [false, true] {
      let seam = GuardSeam(frontmost: other)
      seam.activationPoint = CGPoint(x: 300, y: 70)
      let activation = FakeActivation(pid: app, window: AXUIElementCreateApplication(app), windowFrame: frame, windowID: target, system: seam.system)
      let connection = ConnectionState(id: 1, fd: -1)
      var meta = InputMeta(ExecutionContext(connection: connection, receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
      var pointer = PointerTarget(view: .acceptsFirstMouse, app: "Safari")
      pointer.staleRefusal = refusal
      XCTAssertThrowsError(try {
        if drag {
          try deliverPointer(to: app, route: .activation, activation: activation, activations: activations, pointer: pointer,
                             post: seam.system.post, meta: &meta) {
            dragEvents(from: point, to: CGPoint(x: 400, y: 500), window: ClickTarget(point: point, windowFrame: frame, windowID: target, pid: app),
                       flags: [])
          }
        } else {
          try deliverClick(ClickTarget(point: point, windowFrame: frame, windowID: target, pid: app), route: .activation, button: .left, count: 1,
                           activation: activation, activations: activations, pointer: pointer, targetActive: { false }, post: seam.system.post, meta: &meta)
        }
      }()) { XCTAssertEqual(($0 as? EngineError)?.errorName, "screenChangedSinceScreenshot") }
      XCTAssertEqual(seam.posts.count, 0, drag ? "a drag" : "a click")
      XCTAssertEqual(seam.holds, 0)
      XCTAssertEqual(activations.holders(app), 0)
      XCTAssertNil(meta.startedAt)
    }
  }
}

// MARK: #316's rule G: the hit in the document the screenshot showed (the design session's ruling 4701abd8)

final class WebAreaGuardTests: XCTestCase {
  /// A browser window: the address field in the toolbar, the page's web area with a link and an iframe whose own web area
  /// holds a button (same-origin or cross-origin, the tree is the same).
  private struct Browser {
    let window = Node("AXWindow", CGRect(x: 0, y: 25, width: 800, height: 700))
    let toolbar = Node("AXToolbar", CGRect(x: 0, y: 25, width: 800, height: 50))
    let address = Node("AXTextField", CGRect(x: 200, y: 35, width: 400, height: 30), description: "Address")
    let page = Node("AXWebArea", CGRect(x: 0, y: 75, width: 800, height: 650))
    let link = Node("AXLink", CGRect(x: 40, y: 100, width: 120, height: 20), title: "Docs")
    let text = Node("AXStaticText", CGRect(x: 40, y: 200, width: 300, height: 20), description: "Some text")
    let frame = Node("AXGroup", CGRect(x: 400, y: 300, width: 300, height: 200))
    let inner = Node("AXWebArea", CGRect(x: 400, y: 300, width: 300, height: 200))
    let pay = Node("AXButton", CGRect(x: 450, y: 350, width: 100, height: 30), title: "Pay")
    init() {
      window.add(toolbar)
      toolbar.add(address)
      window.add(page)
      page.add(link)
      page.add(text)
      page.add(frame)
      frame.add(inner)
      inner.add(pay)
    }
  }
  private let linkPoint = CGPoint(x: 100, y: 110)
  private let payPoint = CGPoint(x: 500, y: 365)

  /// Chrome keeps the page a tab has left: the old link still reads its frame at the point, while the hit-test answers the
  /// new page's text there, a non-interactive hit #296 kept (48 of 48 clicks landed on the new page). Its link refuses
  /// too, now as the other web area.
  func testAHitInAnotherWebAreaRefuses() {
    let browser = Browser()
    let nodes = recorded(browser.window)
    let next = Node("AXWebArea", CGRect(x: 0, y: 75, width: 800, height: 650))
    let heading = Node("AXStaticText", CGRect(x: 40, y: 100, width: 300, height: 30), description: "Welcome")
    let newLink = Node("AXLink", CGRect(x: 40, y: 100, width: 120, height: 20), title: "Sign in")
    next.add(heading)
    next.add(newLink)
    browser.window.add(next)
    let refused = verdict(nodes, at: linkPoint, hit: heading)
    XCTAssertEqual(refused.reason, .otherWebArea)
    XCTAssertTrue(refused.refused)
    XCTAssertEqual(refused.webAreaReads, 3, "the heading's parents to the application: the new page, the window, none")
    let outcome = stalePointOutcome(refused, ms: 0.4, reads: reads)
    XCTAssertEqual(outcome.refusal?.errorName, "screenChangedSinceScreenshot")
    XCTAssertEqual(outcome.refusal?.message,
                   "The screen changed since the screenshot: the AXLink \"Docs\" it showed at this point is in a page the point no longer reaches; AXStaticText \"Welcome\" is there now. Nothing was sent. Call getScreenshot for a new screenshot, then give the coordinates in its pixels.")
    XCTAssertEqual(outcome.record.wire as NSDictionary, ["verdict": "refused", "reason": "otherWebArea", "identity": "handle", "recordedRole": "AXLink",
                                                         "hitRole": "AXStaticText", "webAreaReads": 3, "ms": 0.4] as NSDictionary)
    XCTAssertEqual(verdict(nodes, at: linkPoint, hit: newLink).reason, .otherWebArea)
    // Firefox's urlbar list lies in the window's tree over the page: its row's text answers the point.
    let list = Node("AXList", CGRect(x: 200, y: 65, width: 400, height: 300))
    let row = Node("AXStaticText", CGRect(x: 200, y: 200, width: 400, height: 24), description: "example.com")
    list.add(row)
    browser.toolbar.add(list)
    XCTAssertEqual(verdict(nodes, at: CGPoint(x: 300, y: 210), hit: row).reason, .otherWebArea)
    // A recorded node that is the web area itself (a blank part of the page) is in its own document.
    let blank = CGPoint(x: 600, y: 650)
    XCTAssertEqual(deepestScreenshotNode(at: blank, in: nodes)?.element === browser.page, true)
    XCTAssertEqual(verdict(nodes, at: blank, hit: next).reason, .otherWebArea)
  }

  /// A hit in the same web area is judged as before, the walk stopping at the area.
  func testTheSameWebAreaPasses() {
    let browser = Browser()
    let nodes = recorded(browser.window)
    let label = Node("AXStaticText", CGRect(x: 45, y: 102, width: 60, height: 16))
    browser.link.add(label)  // exposed to the hit-test after the observation
    let kept = verdict(nodes, at: linkPoint, hit: label)
    XCTAssertEqual(kept.reason, .nonInteractiveHit)
    XCTAssertEqual(kept.webAreaReads, 2, "the label's parents: the link, the page")
    XCTAssertEqual(StalePointRecord(kept, ms: 0).wire["webAreaReads"] as? Int, 2)
    let same = verdict(nodes, at: linkPoint, hit: browser.link)
    XCTAssertEqual(same.reason, .sameElement)
    XCTAssertNil(same.webAreaReads, "the node's own handle: nothing walked")
    let blank = CGPoint(x: 600, y: 650)
    XCTAssertEqual(verdict(nodes, at: blank, hit: browser.page).reason, .sameElement)
    let group = Node("AXGroup", CGRect(x: 500, y: 600, width: 200, height: 100))
    browser.page.add(group)
    let inPage = verdict(nodes, at: blank, hit: group)
    XCTAssertEqual(inPage.reason, .nonInteractiveHit)
    XCTAssertEqual(inPage.webAreaReads, 1)
  }

  /// Nested documents pass while the page has not changed: a node of the page over an iframe whose interior the record
  /// lacks, hit inside the iframe's own web area (the page's is further up), and a node inside the iframe hit inside the
  /// iframe's document. A node in the iframe whose point now reaches the outer page refuses: its nearest web area decides.
  func testNestedWebAreasPass() {
    let iframeInPage = Browser()
    let partial = recorded(iframeInPage.window, skipping: [ObjectIdentifier(iframeInPage.inner)])
    XCTAssertEqual(deepestScreenshotNode(at: payPoint, in: partial)?.element === iframeInPage.frame, true, "the page's iframe group")
    XCTAssertEqual(deepestScreenshotNode(at: payPoint, in: partial)?.webArea === iframeInPage.page, true)
    let inFrame = verdict(partial, at: payPoint, hit: iframeInPage.pay)
    XCTAssertEqual(inFrame.reason, .unrecordedDescendant, "the iframe's button, inside the page's iframe group")
    XCTAssertEqual(inFrame.webAreaReads, 3, "the button's parents: the iframe's area, its group, the page")

    let pageInIframe = Browser()
    let nodes = recorded(pageInIframe.window)
    XCTAssertEqual(deepestScreenshotNode(at: payPoint, in: nodes)?.webArea === pageInIframe.inner, true, "the iframe's own document")
    let label = Node("AXStaticText", CGRect(x: 460, y: 355, width: 40, height: 16))
    pageInIframe.pay.add(label)
    XCTAssertEqual(verdict(nodes, at: payPoint, hit: label).reason, .nonInteractiveHit)
    XCTAssertEqual(verdict(nodes, at: payPoint, hit: label).webAreaReads, 2)
    let span = Node("AXGroup", CGRect(x: 440, y: 340, width: 150, height: 60))
    pageInIframe.inner.add(span)
    XCTAssertEqual(verdict(nodes, at: payPoint, hit: span).reason, .nonInteractiveHit, "a group of the iframe's document")

    // The iframe gone from under the point: the outer page answers it.
    let outer = Browser()
    let before = recorded(outer.window)
    let filler = Node("AXGroup", CGRect(x: 400, y: 300, width: 300, height: 200))
    outer.page.add(filler)
    XCTAssertEqual(verdict(before, at: payPoint, hit: filler).reason, .otherWebArea, "the iframe's node, the page's hit")
  }

  /// The review of 73b44561..e62a7454 (P2): an element route's record replaces the first check's in the meta, so it keeps
  /// the first check's window-list read (W) and the walk its verdict was judged after (G), with no recheck and with one.
  func testAnElementRoutesRecordKeepsTheRulesCosts() {
    let browser = Browser()
    let partial = recorded(browser.window, skipping: [ObjectIdentifier(browser.inner)])
    let first = verdict(partial, at: payPoint, hit: browser.pay)
    XCTAssertEqual(first.reason, .unrecordedDescendant)
    var firstRecord = StalePointRecord(first, ms: 1.25)
    firstRecord.windowsMs = 0.4
    let gate = StalePointGate(first: first, record: firstRecord) { verdict(partial, at: self.payPoint, hit: browser.pay) }
    for waited in [false, true] {
      let checked = gate.check(browser.pay, waited: waited, now: { 0 }, reads: reads)
      XCTAssertNil(checked.refusal)
      XCTAssertEqual(checked.record.reason, .unrecordedDescendant, "the press verdict rebuilt: the button inside the iframe group")
      XCTAssertEqual(checked.record.wire["windowsMs"] as? Double, 0.4, "waited: \(waited)")
      XCTAssertEqual(checked.record.wire["webAreaReads"] as? Int, 3, "waited: \(waited)")
      XCTAssertEqual(checked.record.ms, 1.25)
    }
  }

  /// What G leaves as it was: a node outside every web area (the toolbar's), and an empty hit.
  func testANodeOutsideAnyWebAreaAndAnEmptyHitAreUnchanged() {
    let browser = Browser()
    let nodes = recorded(browser.window)
    let addressPoint = CGPoint(x: 300, y: 50)
    XCTAssertNil(deepestScreenshotNode(at: addressPoint, in: nodes)?.webArea)
    let popup = Node("AXStaticText", CGRect(x: 250, y: 40, width: 100, height: 20))
    browser.page.add(popup)  // a page's text answering the toolbar's point
    let outside = verdict(nodes, at: addressPoint, hit: popup)
    XCTAssertEqual(outside.reason, .nonInteractiveHit, "as on main")
    XCTAssertNil(outside.webAreaReads)
    let button = Node("AXButton", CGRect(x: 250, y: 40, width: 100, height: 20))
    browser.page.add(button)
    XCTAssertEqual(verdict(nodes, at: addressPoint, hit: button).reason, .interactiveHit, "as on main")
    // The page left, an empty hit: judged as before, by the node's frame.
    let next = Node("AXWebArea", CGRect(x: 0, y: 75, width: 800, height: 650))
    browser.window.add(next)
    let empty = verdict(nodes, at: linkPoint, hit: nil)
    XCTAssertEqual(empty.reason, .noHit)
    XCTAssertNil(empty.webAreaReads)
  }

  /// The record finds the nearest web area through frameless nodes, a frameless web area included.
  func testTheRecordFindsTheWebAreaThroughFramelessNodes() {
    let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 400, height: 400))
    let area = Node("AXWebArea", nil)
    let wrapper = Node("AXGroup", nil)
    let button = Node("AXButton", CGRect(x: 10, y: 10, width: 50, height: 20))
    window.add(area)
    area.add(wrapper)
    wrapper.add(button)
    let nodes = recorded(window)
    XCTAssertEqual(nodes.first { $0.element === button }?.webArea === area, true)
    XCTAssertNil(nodes.first { $0.element === window }?.webArea)
  }

  /// The walk is bounded: a hit more than `stalePointAncestorLevels` below the area is taken for outside.
  func testTheWalkIsBounded() {
    let area = Node("AXWebArea", CGRect(x: 0, y: 0, width: 10, height: 10))
    var deepest = area
    for _ in 0..<(stalePointAncestorLevels + 1) {
      let child = Node("AXGroup", CGRect(x: 0, y: 0, width: 10, height: 10))
      deepest.add(child)
      deepest = child
    }
    let walk = liesIn(deepest, area, reads)
    XCTAssertFalse(walk.inside)
    XCTAssertEqual(walk.reads, stalePointAncestorLevels)
    XCTAssertTrue(liesIn(deepest.parent!, area, reads).inside, "at the bound itself")
  }
}

/// #330's rule dL (the design session's ruling 11bec0ed): where the recorded node lies in an AXWebArea and the guard would
/// keep the point, the topmost element on the hit's chain up to that web area that the record lacks, under a parent the
/// record holds with every child, and listed by that parent's AXChildren now, refuses as `newElementOverPoint`.
final class NewElementGuardTests: XCTestCase {
  /// A page with a search field and a Go button under it, in a form; typing makes the page add a suggestion list over
  /// the button.
  private struct Page {
    let window = Node("AXWindow", CGRect(x: 0, y: 25, width: 800, height: 700))
    let page: Node
    let form = Node("AXGroup", CGRect(x: 40, y: 100, width: 400, height: 200))
    let field = Node("AXTextField", CGRect(x: 40, y: 100, width: 300, height: 30), description: "Search")
    let button = Node("AXButton", CGRect(x: 40, y: 160, width: 100, height: 30), title: "Go")
    /// The suggestion list as Safari and Firefox expose it: an AXList of rows, each a group around its text.
    let list = Node("AXList", CGRect(x: 40, y: 130, width: 300, height: 150))
    let row = Node("AXGroup", CGRect(x: 40, y: 160, width: 300, height: 30))
    let text = Node("AXStaticText", CGRect(x: 40, y: 165, width: 200, height: 20), description: "apple pie")
    init(webArea: Bool = true, framelessForm: Bool = false) {
      page = Node(webArea ? "AXWebArea" : "AXGroup", CGRect(x: 0, y: 75, width: 800, height: 650))
      if framelessForm { form.frame = nil }
      window.add(page)
      page.add(form)
      form.add(field)
      form.add(button)
      list.add(row)
      row.add(text)
    }
  }
  private let point = CGPoint(x: 90, y: 175)

  private struct Record {
    let nodes: [ScreenshotNode<Node>]
    let members: (Node) -> Bool?
    init(_ root: Node, skipping skipped: Set<ObjectIdentifier> = []) {
      nodes = recorded(root, skipping: skipped)
      members = recordedMembers(root, skipping: skipped)
    }
  }

  private func judged(_ record: Record, hit: Node?) -> StalePointVerdict<Node> {
    stalePointVerdict(at: point, nodes: record.nodes, recorded: record.members, hit: hit, reads: reads)
  }

  /// The suggestion list added to the button's form (Safari and Firefox answer its row's text): main kept the click as a
  /// non-interactive hit and it landed on the list; now it refuses. So do a list appended at the end of the page, whose
  /// row's text Chrome answers but no AXChildren lists (the list, the topmost new element, is listed), one under a
  /// frameless form, and rows filling a list the record held empty.
  func testANewListedElementOnTheHitsChainUnderAFullyRecordedParentRefuses() {
    do {
      let page = Page()
      let record = Record(page.window)
      page.form.add(page.list)
      XCTAssertEqual(stalePointVerdict(at: point, nodes: record.nodes, hit: page.text, reads: reads).reason, .nonInteractiveHit,
                     "with no record of the walk's elements, as on main")
      let refused = judged(record, hit: page.text)
      XCTAssertTrue(refused.node?.element === page.button, "the recorded node at the point")
      XCTAssertEqual(refused.reason, .newElementOverPoint)
      XCTAssertTrue(refused.refused)
      XCTAssertEqual(refused.webAreaReads, 4, "the text's parents to the page: the row, the list, the form, the page")
      XCTAssertEqual(refused.newElementReads, 3, "the form's children, then the button's parents to the page: the form, the page")
    }
    do {  // Chrome's end-of-body list: the row's text is the hit, and no AXChildren lists it.
      let page = Page()
      let record = Record(page.window)
      page.page.add(page.list)
      page.row.children.removeAll()
      XCTAssertTrue(page.text.parent === page.row)
      XCTAssertEqual(judged(record, hit: page.text).reason, .newElementOverPoint, "the list is the topmost new element, listed by the page")
    }
    do {
      let page = Page(framelessForm: true)
      let record = Record(page.window)
      page.form.add(page.list)
      XCTAssertEqual(judged(record, hit: page.text).reason, .newElementOverPoint, "the frameless form is in the record")
    }
    do {  // A listbox present and empty until filled: the row is the topmost new element.
      let page = Page()
      page.list.children.removeAll()
      page.form.add(page.list)
      let record = Record(page.window)
      page.list.add(page.row)
      let refused = judged(record, hit: page.text)
      XCTAssertEqual(refused.reason, .newElementOverPoint)
      XCTAssertTrue(refused.node?.element === page.list, "the empty list, recorded over the button")
    }
    do {  // Rows that are links: #296 already refuses the interactive hit, and its reason stands.
      let page = Page()
      let record = Record(page.window)
      let link = Node("AXLink", CGRect(x: 40, y: 160, width: 300, height: 30), title: "apple pie")
      page.row.add(link)
      page.form.add(page.list)
      XCTAssertEqual(judged(record, hit: link).reason, .interactiveHit)
    }
  }

  /// "Every child recorded": where the walk's budget cut the parent's children, the record cannot tell a new child from
  /// one it never reached, so the rule is silent and reads nothing.
  func testSilentWhenTheBudgetCutTheParentsChildren() {
    let page = Page()
    let record = Record(page.window, skipping: [ObjectIdentifier(page.field)])
    page.form.add(page.list)
    let kept = judged(record, hit: page.text)
    XCTAssertEqual(kept.reason, .nonInteractiveHit)
    XCTAssertNil(kept.newElementReads)
  }

  /// "Listed": Chrome hit-tests a button to its label's AXStaticText, which no AXChildren lists and the walk never records;
  /// it is not new. One read, the parent's children; kept, and the read carried by an element route's record.
  func testSilentWhenTheParentDoesNotListTheElement() {
    let page = Page()
    let record = Record(page.window)
    let label = Node("AXStaticText", CGRect(x: 60, y: 166, width: 40, height: 18))
    label.parent = page.button  // under the button, in none of its children
    let kept = judged(record, hit: label)
    XCTAssertEqual(kept.reason, .nonInteractiveHit)
    XCTAssertFalse(kept.refused)
    XCTAssertEqual(kept.newElementReads, 1)
    XCTAssertEqual(StalePointRecord(kept, ms: 0).wire["newElementReads"] as? Int, 1)
    let elsewhere = Node("AXButton", CGRect(x: 600, y: 600, width: 80, height: 30), title: "Other")
    page.page.add(elsewhere)
    let pressed = stalePointPressVerdict(elsewhere, kept, reads: reads)
    XCTAssertEqual(pressed.reason, .pressedOther)
    XCTAssertEqual(pressed.newElementReads, 1, "the press verdict keeps the reads its verdict was judged after")
  }

  /// An element the record holds is not new: a list the screenshot's tree already held elsewhere on the page and the page
  /// then moved over the button (a stated limit), its row's text answering the point.
  func testSilentWhenTheElementIsInTheRecord() {
    let page = Page()
    page.page.add(page.list)
    move(page.list, by: CGVector(dx: 0, dy: 400))
    let record = Record(page.window)
    move(page.list, by: CGVector(dx: 0, dy: -400))
    let kept = judged(record, hit: page.text)
    XCTAssertTrue(kept.node?.element === page.button)
    XCTAssertEqual(kept.reason, .nonInteractiveHit)
    XCTAssertNil(kept.newElementReads)
  }

  /// Outside a web area the rule does not run: the same window with the page a plain group, judged as on main.
  func testSilentOutsideAWebArea() {
    let page = Page(webArea: false)
    let record = Record(page.window)
    page.form.add(page.list)
    let kept = judged(record, hit: page.text)
    XCTAssertEqual(kept.reason, .nonInteractiveHit)
    XCTAssertNil(kept.webAreaReads)
    XCTAssertNil(kept.newElementReads)
  }

  /// The refusal: `screenChangedSinceScreenshot`, its sentence naming the recorded element and what is there now, telling
  /// the model what appeared and the two ways on; the meta's reason and the rule's reads.
  func testTheReasonAndTheSentence() {
    XCTAssertTrue(StalePointReason.newElementOverPoint.refuses)
    let page = Page()
    let record = Record(page.window)
    page.form.add(page.list)
    let outcome = stalePointOutcome(judged(record, hit: page.text), ms: 0.4, reads: reads)
    XCTAssertEqual(outcome.refusal?.errorName, "screenChangedSinceScreenshot")
    XCTAssertEqual(outcome.refusal?.message,
                   "The screen changed since the screenshot: a new element, such as a suggestion list or popup, has appeared over the AXButton \"Go\" it showed at this point; AXStaticText \"apple pie\" is there now. Nothing was sent. Call getScreenshot for a new screenshot, or press Escape to dismiss what appeared, before clicking.")
    XCTAssertEqual(outcome.record.wire as NSDictionary, ["verdict": "refused", "reason": "newElementOverPoint", "identity": "handle",
                                                         "recordedRole": "AXButton", "hitRole": "AXStaticText", "webAreaReads": 4,
                                                         "newElementReads": 3, "ms": 0.4] as NSDictionary)
    XCTAssertEqual(screenChangedSinceScreenshot(was: "AXButton \"Go\"", reason: .newElementOverPoint, now: nil, afterActivation: true).message,
                   "The screen changed since the screenshot: a new element, such as a suggestion list or popup, has appeared over the AXButton \"Go\" it showed at this point. The app was activated in the background, but nothing was pressed. Call getScreenshot for a new screenshot, or press Escape to dismiss what appeared, before clicking.")
  }

  /// The review of 364e017d..51ce4138 (P2): a hit #305 keeps as a recorded control re-created in place (GitHub's code
  /// view in a page, its overlay textarea re-created with the same role, frame and label) is that control, not new; nor
  /// is a wrapper re-created around it.
  func testARecordedHitReCreatedInPlaceIsNotNew() {
    func codeView() -> (window: Node, main: Node, textArea: Node) {
      let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 1000, height: 800))
      let page = Node("AXWebArea", CGRect(x: 0, y: 50, width: 1000, height: 750))
      let main = Node("AXGroup", CGRect(x: 0, y: 100, width: 1000, height: 700))
      let textArea = Node("AXTextArea", CGRect(x: 100, y: 200, width: 800, height: 400), description: "file content")
      let lines = Node("AXGroup", CGRect(x: 100, y: 200, width: 800, height: 400))
      window.add(page)
      page.add(main)
      main.add(textArea)
      main.add(lines)
      return (window, main, textArea)
    }
    let codePoint = CGPoint(x: 300, y: 300)
    func again() -> Node { Node("AXTextArea", CGRect(x: 100, y: 200, width: 800, height: 400), description: "file content") }
    do {
      let view = codeView()
      let record = Record(view.window)
      view.textArea.destroy()
      let textArea = again()
      view.main.add(textArea)
      let kept = stalePointVerdict(at: codePoint, nodes: record.nodes, recorded: record.members, hit: textArea, reads: reads)
      XCTAssertEqual(kept.reason, .recordedHit)
      XCTAssertFalse(kept.refused)
    }
    do {
      let view = codeView()
      let record = Record(view.window)
      view.textArea.destroy()
      let wrapper = Node("AXGroup", CGRect(x: 100, y: 200, width: 800, height: 400))
      let textArea = again()
      wrapper.add(textArea)
      view.main.add(wrapper)
      XCTAssertEqual(stalePointVerdict(at: codePoint, nodes: record.nodes, recorded: record.members, hit: textArea, reads: reads).reason,
                     .recordedHit)
    }
  }

  /// The review of 364e017d..51ce4138 (P2): an element whose AXChildren read failed at the observation records no
  /// children and says nothing of them, so a child it lists at the click is not new: Chrome's button whose children read
  /// failed then, its label's text listed now.
  func testSilentWhenTheParentsChildrenWereNotRead() {
    let page = Page()
    let label = Node("AXStaticText", CGRect(x: 60, y: 166, width: 40, height: 18), description: "Go")
    page.button.add(label)
    page.button.childrenUnread = true
    let record = Record(page.window)
    page.button.childrenUnread = false
    let kept = judged(record, hit: label)
    XCTAssertEqual(kept.reason, .nonInteractiveHit)
    XCTAssertNil(kept.newElementReads)
  }

  /// The walk's record says whether it read each element's AXChildren: one whose read failed (its data decoding no
  /// children) is not recorded with every child.
  func testTheWalkRecordsAFailedChildrenRead() {
    let tree = FakeTree()
    tree.children = [0: [1], 1: [2, 3], 2: [4]]
    tree.childrenUnread = [2]
    let recording = walk(tree, Lineage(), recordsScreenshot: true)
    let complete = screenshotChildrenRecorded(recording.screenshotReads) { tree.id($0) }
    XCTAssertEqual(complete[1], true)
    XCTAssertEqual(complete[2], false, "its children unread")
    XCTAssertEqual(complete[3], true, "a leaf whose read answered none")
    XCTAssertNil(complete[4])
    XCTAssertTrue(ElementData(values: ["AXChildren": [] as CFArray]).childrenRead)
    XCTAssertFalse(ElementData(values: [:]).childrenRead)
  }

  /// The observed screenshot keeps the record's elements the guard looks the chain up in.
  func testTheScreenshotKeepsItsRecordedElements() {
    let element = AXUIElementCreateApplication(990_003)
    let image = CapturedScreenshot(url: "file:///x.jpg", width: 1220, height: 1720, frame: CGRect(x: 0, y: 0, width: 610, height: 860), scale: 2)
    let observed = ObservedScreenshot(window: element, image: image, recorded: [ElementKey(element: element): false])
    XCTAssertEqual(observed.recorded[ElementKey(element: element)], false)
  }

  /// The recorded node as found now is never new over itself: #296's control re-created in place (its handle new, under
  /// its recorded parent) is kept, and so is one whose wrapper was re-created with it, the hit its label or the control.
  func testTheReCreatedNodeAndWhatHoldsItAreNotNew() {
    do {
      let page = Page()
      let record = Record(page.window)
      page.button.destroy()
      let again = Node("AXButton", CGRect(x: 40, y: 160, width: 100, height: 30), title: "Go")
      page.form.add(again)
      let kept = judged(record, hit: again)
      XCTAssertEqual(kept.identity, .recreated)
      XCTAssertEqual(kept.reason, .sameElement)
      let label = Node("AXStaticText", CGRect(x: 60, y: 166, width: 40, height: 18))
      again.add(label)  // listed, under the re-created control
      XCTAssertEqual(judged(record, hit: label).reason, .nonInteractiveHit)
    }
    do {  // A wrapper re-created around the re-created control.
      let page = Page()
      let record = Record(page.window)
      page.button.destroy()
      page.form.destroy()
      let form = Node("AXGroup", CGRect(x: 40, y: 100, width: 400, height: 200))
      let again = Node("AXButton", CGRect(x: 40, y: 160, width: 100, height: 30), title: "Go")
      form.add(again)
      page.page.add(form)
      XCTAssertEqual(judged(record, hit: again).reason, .sameElement)
    }
    do {  // The node is a link's recorded text; the link and its text re-created: the hit is the new link, which holds it.
      let page = Page()
      let link = Node("AXLink", CGRect(x: 40, y: 160, width: 100, height: 30))
      let text = Node("AXStaticText", CGRect(x: 45, y: 165, width: 80, height: 20), description: "More")
      link.add(text)
      page.button.destroy()
      page.form.add(link)
      let record = Record(page.window)
      link.destroy()
      text.destroy()
      let newLink = Node("AXLink", CGRect(x: 40, y: 160, width: 100, height: 30))
      let newText = Node("AXStaticText", CGRect(x: 45, y: 165, width: 80, height: 20), description: "More")
      newLink.add(newText)
      page.form.add(newLink)
      let kept = judged(record, hit: newLink)
      XCTAssertTrue(kept.current === newText)
      XCTAssertEqual(kept.reason, .hitAboveNode)
    }
  }
}

/// #298's rule `relabelled` (the design session's ruling 31a62775 on the spike's findings, issue comment 6732058816): a
/// node found by its own handle, its frame still holding the point, is refused when its label's words changed since the
/// screenshot; and #296's re-created match compares an AXStaticText's value by the same words.
final class RelabelledGuardTests: XCTestCase {
  private let point = CGPoint(x: 60, y: 120)

  /// A window whose one control lies at `point`.
  private func windowHolding(_ control: Node) -> Node {
    let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 600, height: 400), title: "probe298 page")
    control.frame = CGRect(x: 20, y: 100, width: 120, height: 40)
    window.add(control)
    return window
  }

  /// The verdict on a control recorded with `was` as its title (or description) and read now with `now`, hit itself.
  private func relabelled(_ was: String?, _ now: String?, role: String = "AXButton", description: Bool = false) -> StalePointVerdict<Node> {
    let control = description ? Node(role, nil, description: was) : Node(role, nil, title: was)
    let nodes = recorded(windowHolding(control))
    if description { control.description = now } else { control.title = now }
    return verdict(nodes, at: point, hit: control)
  }

  /// The word rule as the spike measured it (`scripts/probe-298/analyze.mjs`'s `besideNumbers`, mode `run`): the
  /// lowercased letter runs, less every number and the letter words after it up to the next punctuation mark.
  func testALabelsWords() {
    XCTAssertEqual(stalePointLabelWords("Delete all"), ["delete", "all"])
    XCTAssertEqual(stalePointLabelWords("SAVE"), ["save"], "lowercased")
    XCTAssertEqual(stalePointLabelWords("Elapsed 11.6 s"), ["elapsed"], "a decimal and its unit")
    XCTAssertEqual(stalePointLabelWords("Show 3 more replies"), ["show"], "every word after the number, to the end")
    XCTAssertEqual(stalePointLabelWords("Notifications, 3 new"), ["notifications"])
    XCTAssertEqual(stalePointLabelWords("3 new, Inbox"), ["inbox"], "punctuation ends a number's words")
    XCTAssertEqual(stalePointLabelWords("Delete 3. Then save"), ["delete", "then", "save"], "a period after a number is punctuation")
    XCTAssertEqual(stalePointLabelWords("3:21 PM"), [], "a time")
    XCTAssertEqual(stalePointLabelWords("1,234.5 files left"), [])
    XCTAssertEqual(stalePointLabelWords("Order #1234"), ["order"])
    XCTAssertEqual(stalePointLabelWords("(3) probe298 page"), ["probe"], "a number inside a word ends it and takes what follows")
    XCTAssertEqual(stalePointLabelWords("Don't Allow"), ["don", "t", "allow"])
    XCTAssertEqual(stalePointLabelWords("Straße Ünïcode"), ["straße", "ünïcode"], "letters beyond ASCII")
    XCTAssertEqual(stalePointLabelWords("2 комментария"), [])
    XCTAssertEqual(stalePointLabelWords("3件"), [])
    XCTAssertEqual(stalePointLabelWords("٣ items"), ["items"], "only ASCII digits make a number, as the spike's \\d")
    XCTAssertEqual(stalePointLabelWords("Uploading 45%"), ["uploading"])
    XCTAssertEqual(stalePointLabelWords(""), [])
  }

  /// The spike's live pairs, read on a live handle: every relabel and every label-changing flip refuses, every count,
  /// plural, tick and suffix passes; and the stated limits hold as stated.
  func testTheWordRuleOverTheMeasuredPairs() {
    let refuses = [("Save", "Delete"), ("Delete", "Delete all"), ("Follow", "Following"), ("Play", "Pause"), ("Show more", "Show less"),
                   ("Save", "Saved"), ("Save changes?", "Delete file?"), ("3 new, Inbox", "4 new, Outbox")]
    let passes = [("Like (12)", "Like (13)"), ("1 item", "2 items"), ("Inbox", "Inbox (3)"), ("Notifications", "Notifications, 3 new"),
                  ("Elapsed 11.6 s", "Elapsed 17.2 s"), ("1 minute ago", "2 minutes ago"), ("Next to", "Next to"), ("Save", "SAVE")]
    for (was, now) in refuses {
      XCTAssertEqual(relabelled(was, now).reason, .relabelled, "\(was) -> \(now)")
      XCTAssertEqual(relabelled(was, now, description: true).reason, .relabelled, "\(was) -> \(now), as the description")
    }
    for (was, now) in passes {
      XCTAssertEqual(relabelled(was, now).reason, .sameElement, "\(was) -> \(now)")
      XCTAssertEqual(relabelled(was, now, description: true).reason, .sameElement, "\(was) -> \(now), as the description")
    }
    // The stated limits: a label that differs only by a number passes (limit 1); a translation refuses (limit 3).
    XCTAssertEqual(relabelled("Order #1234", "Order #1235").reason, .sameElement)
    XCTAssertEqual(relabelled("Delete 1 file", "Delete 3 files").reason, .sameElement)
    XCTAssertEqual(relabelled("Save", "Guardar").reason, .relabelled)
    // Words rolling without a number refuse (limit 2).
    XCTAssertEqual(relabelled("just now", "1 minute ago").reason, .relabelled)
  }

  /// Document titles are not compared: the window, the web area, and Chrome's tab (a radio button whose subrole is
  /// AXTabButton), which flash ("Gmail" -> "Ann messaged you"). A radio button of another subrole, and a container, are.
  func testTheWindowTheWebAreaAndChromesTabAreNotCompared() {
    do {
      let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 600, height: 400), title: "Gmail")
      let nodes = recorded(window)
      window.title = "Ann messaged you"
      XCTAssertEqual(verdict(nodes, at: point, hit: window).reason, .sameElement, "the window")
    }
    do {
      let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 600, height: 400))
      let page = Node("AXWebArea", CGRect(x: 0, y: 50, width: 600, height: 350), title: "Gmail")
      window.add(page)
      let nodes = recorded(window)
      page.title = "Ann messaged you"
      XCTAssertEqual(verdict(nodes, at: point, hit: page).reason, .sameElement, "the web area")
    }
    XCTAssertEqual(stalePointNode(Node("AXRadioButton", nil, title: "Gmail", subrole: "AXTabButton"), now: "Ann messaged you").reason,
                   .sameElement, "Chrome's tab")
    XCTAssertEqual(stalePointNode(Node("AXRadioButton", nil, title: "Gmail"), now: "Ann messaged you").reason, .relabelled,
                   "a radio button")
    XCTAssertEqual(stalePointNode(Node("AXRadioButton", nil, title: "Gmail", subrole: "AXSortButton"), now: "Ann messaged you").reason,
                   .relabelled, "another subrole")
    XCTAssertEqual(stalePointNode(Node("AXGroup", nil, title: "Save changes?"), now: "Delete file?").reason, .relabelled, "a dialog's group")
    XCTAssertEqual(stalePointNode(Node("AXGroup", nil, title: "Inbox"), now: "Inbox (3)").reason, .sameElement, "a group gaining a count")
  }

  /// The rule judges a node found by its own handle whose frame, read now, holds the point (the ruling's words): a handle
  /// whose frame read fails, kept because the hit reaches it, is not compared; nor is a re-created one, whose label
  /// #296's match already compared.
  func testOnlyAHandleWhoseFrameHoldsThePointIsCompared() {
    let button = Node("AXButton", nil, title: "Save")
    let nodes = recorded(windowHolding(button))
    button.title = "Delete"
    let frame = button.frame
    button.frame = nil  // a read that failed, the element still there
    XCTAssertEqual(verdict(nodes, at: point, hit: button).reason, .sameElement)
    button.frame = frame
    XCTAssertEqual(verdict(nodes, at: point, hit: button).reason, .relabelled)
  }

  private func stalePointNode(_ control: Node, now: String) -> StalePointVerdict<Node> {
    let nodes = recorded(windowHolding(control))
    control.title = now
    return verdict(nodes, at: point, hit: control)
  }

  /// Both labels must be non-empty: a label gained, lost or unreadable now never refuses. The label is the title if
  /// non-empty, else the description.
  func testAnEmptyLabelEitherSideNeverRefuses() {
    XCTAssertEqual(relabelled(nil, "Delete").reason, .sameElement, "no label recorded")
    XCTAssertEqual(relabelled("", "Delete").reason, .sameElement, "an empty label recorded")
    XCTAssertEqual(relabelled("Save", nil).reason, .sameElement, "no label read now")
    XCTAssertEqual(relabelled("Save", "").reason, .sameElement, "an empty label read now")
    // An empty title gives way to the description, on either side.
    let control = Node("AXButton", nil, title: "", description: "Save")
    let nodes = recorded(windowHolding(control))
    control.title = "Save"
    control.description = "Other"
    XCTAssertEqual(verdict(nodes, at: point, hit: control).reason, .sameElement, "\"Save\" both times")
    control.title = ""
    control.description = "Delete"
    XCTAssertEqual(verdict(nodes, at: point, hit: control).reason, .relabelled)
  }

  /// A link's or a clickable div's text is its own AXStaticText, whose words are in its value: on its own handle, a
  /// framework's text update (`nodeValue`) that changes its words refuses, a count passes. Another role's value (a
  /// field's typed text, a checkbox's state) is never its label.
  func testAnAXStaticTextsValueIsItsLabelOnItsHandle() {
    func link(_ was: String, _ now: String, hit: (Node, Node) -> Node) -> StalePointVerdict<Node> {
      let link = Node("AXLink", nil)
      let window = windowHolding(link)
      let text = Node("AXStaticText", CGRect(x: 30, y: 110, width: 80, height: 20), value: was)
      link.add(text)
      let nodes = recorded(window)
      text.value = now
      return verdict(nodes, at: point, hit: hit(link, text))
    }
    XCTAssertEqual(link("Save", "Delete") { $1 }.reason, .relabelled, "linksavenv, the hit its text")
    XCTAssertEqual(link("Save", "Delete") { link, _ in link }.reason, .relabelled, "the hit the link")
    XCTAssertEqual(link("Inbox", "Inbox (3)") { $1 }.reason, .sameElement, "linknv")
    XCTAssertEqual(link("Elapsed 10.7 s", "Elapsed 16.3 s") { $1 }.reason, .sameElement, "divtick")
    // A title or description comes first.
    let status = Node("AXStaticText", nil, title: "Status", value: "Save")
    let nodes = recorded(windowHolding(status))
    status.value = "Delete"
    XCTAssertEqual(verdict(nodes, at: point, hit: status).reason, .sameElement)
    // Another role's value is not compared, and not recorded.
    for role in ["AXTextField", "AXCheckBox"] {
      let field = Node(role, nil, value: "Save")
      let fieldNodes = recorded(windowHolding(field))
      XCTAssertNil(fieldNodes.last?.value, role)
      field.value = "Delete"
      XCTAssertEqual(verdict(fieldNodes, at: point, hit: field).reason, .sameElement, role)
    }
  }

  /// A same-width replacement (`textContent`) re-creates the text: #296's match now requires its words to agree when
  /// neither side has a title or description (linkmono refused, linklike kept); an unreadable value never counts against it.
  func testAnAXStaticTextsValueOnTheReCreatedPath() {
    func recreate(_ was: String, _ now: String?) -> StalePointVerdict<Node> {
      let link = Node("AXLink", nil)
      let window = windowHolding(link)
      let text = Node("AXStaticText", CGRect(x: 30, y: 110, width: 80, height: 20), value: was)
      link.add(text)
      let nodes = recorded(window)
      text.destroy()
      link.add(Node("AXStaticText", CGRect(x: 30, y: 110, width: 80, height: 20), value: now))
      return verdict(nodes, at: point, hit: link)
    }
    XCTAssertEqual(recreate("Save", "Send").reason, .nodeGone, "linkmono")
    let kept = recreate("Like (12)", "Like (13)")
    XCTAssertEqual(kept.identity, .recreated, "linklike")
    XCTAssertEqual(kept.reason, .hitAboveNode)
    XCTAssertEqual(recreate("Save", nil).identity, .recreated, "the value unread now")
    // #305's re-created identity of a recorded hit compares the same way.
    let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 600, height: 400))
    let text = Node("AXStaticText", CGRect(x: 20, y: 100, width: 120, height: 40), value: "Save")
    window.add(text)
    let nodes = recorded(window)
    text.destroy()
    for (now, carried) in [("Send", nil), ("Save", RecordedHitFrame.hit)] as [(String, RecordedHitFrame?)] {
      let again = Node("AXStaticText", CGRect(x: 20, y: 100, width: 120, height: 40), value: now)
      window.add(again)
      XCTAssertEqual(recordedHitAtPoint(again, at: point, windowShift: .zero, nodes: nodes, reads), carried, now)
      again.destroy()
    }
  }

  /// Titles and descriptions keep amendment 0c0b70f0's exact equality on the re-created path: the word rule is for the
  /// live handle and for a text's value only.
  func testTitlesAndDescriptionsKeepExactEqualityOnTheReCreatedPath() {
    func recreate(_ was: String, _ now: String, description: Bool = false) -> StalePointReason {
      let button = description ? Node("AXButton", nil, description: was) : Node("AXButton", nil, title: was)
      let window = windowHolding(button)
      let nodes = recorded(window)
      button.destroy()
      let frame = CGRect(x: 20, y: 100, width: 120, height: 40)
      let again = description ? Node("AXButton", frame, description: now) : Node("AXButton", frame, title: now)
      window.add(again)
      return verdict(nodes, at: point, hit: again).reason
    }
    XCTAssertEqual(recreate("Save", "SAVE"), .nodeGone, "the same words, another title")
    XCTAssertEqual(recreate("Like (12)", "Like (13)"), .nodeGone)
    XCTAssertEqual(recreate("Save", "SAVE", description: true), .nodeGone)
    XCTAssertEqual(recreate("Save", "Save"), .sameElement)
    XCTAssertTrue(stalePointLabelsAgree(recordedTitle: nil, recordedDescription: nil, recordedValue: "Like (12)", title: nil, description: nil,
                                        value: "Like (13)"))
    XCTAssertFalse(stalePointLabelsAgree(recordedTitle: nil, recordedDescription: nil, recordedValue: "Save", title: nil, description: nil,
                                         value: "Send"))
    XCTAssertTrue(stalePointLabelsAgree(recordedTitle: "Go", recordedDescription: nil, recordedValue: "Save", title: "Go", description: nil,
                                        value: "Send"), "the title decides")
    XCTAssertTrue(stalePointLabelsAgree(recordedTitle: nil, recordedDescription: "Go", recordedValue: "Save", title: nil, description: nil,
                                        value: "Send"), "a description on one side: values not compared")
    XCTAssertTrue(stalePointLabelsAgree(recordedTitle: nil, recordedDescription: nil, recordedValue: "Save", title: nil, description: "Go",
                                        value: "Send"), "a description now: values not compared")
  }

  /// The refusal: `screenChangedSinceScreenshot`, reason `relabelled`, a sentence naming the old label and the new and
  /// asking for a new screenshot; a value-free meta. A truncated container relabelled in place refuses too (the design
  /// session's 2db3ba75: the blind spot covered containers), while one gaining a count keeps its unguarded interior.
  func testTheReasonAndTheSentence() {
    XCTAssertTrue(StalePointReason.relabelled.refuses)
    let button = Node("AXButton", nil, title: "Save")
    let nodes = recorded(windowHolding(button))
    button.title = "Delete"
    let outcome = stalePointOutcome(verdict(nodes, at: point, hit: button), ms: 0.4, reads: reads)
    XCTAssertEqual(outcome.refusal?.errorName, "screenChangedSinceScreenshot")
    XCTAssertEqual(outcome.refusal?.message,
                   "The screen changed since the screenshot: the AXButton \"Save\" it showed at this point now reads \"Delete\". Nothing was sent. Call getScreenshot for a new screenshot, then give the coordinates in its pixels.")
    XCTAssertEqual(outcome.record.wire as NSDictionary, ["verdict": "refused", "reason": "relabelled", "identity": "handle",
                                                         "recordedRole": "AXButton", "hitRole": "AXButton", "ms": 0.4] as NSDictionary)
    // A text names its value; a long label is cut at 60 characters, as the recorded one is.
    let text = Node("AXStaticText", nil, value: "Save")
    let textNodes = recorded(windowHolding(text))
    text.value = String(repeating: "Delete ", count: 12)
    XCTAssertEqual(stalePointOutcome(verdict(textNodes, at: point, hit: text), ms: 0, reads: reads).refusal?.message,
                   "The screen changed since the screenshot: the AXStaticText \"Save\" it showed at this point now reads \"\(String(repeating: "Delete ", count: 9).prefix(60))…\". Nothing was sent. Call getScreenshot for a new screenshot, then give the coordinates in its pixels.")
    // After an element route's wait, the recheck refuses with the label read then.
    let item = Node("AXButton", nil, title: "Follow")
    let itemNodes = recorded(windowHolding(item))
    let gate = StalePointGate(first: verdict(itemNodes, at: point, hit: item), firstMs: 1) { [point] in verdict(itemNodes, at: point, hit: item) }
    item.title = "Following"
    let checked = gate.check(item, waited: true, now: { 0 }, reads: reads)
    XCTAssertEqual(checked.record.reason, .relabelled)
    XCTAssertEqual(checked.record.rechecked, true)
    XCTAssertEqual(checked.refusal?.message,
                   "The screen changed since the screenshot: the AXButton \"Follow\" it showed at this point now reads \"Following\". Nothing was sent. Call getScreenshot for a new screenshot, then give the coordinates in its pixels.")
    let activated = gate.check(item, waited: true, afterActivation: true, now: { 0 }, reads: reads)
    XCTAssertEqual(activated.refusal?.message,
                   "The screen changed since the screenshot: the AXButton \"Follow\" it showed at this point now reads \"Following\". The app was activated in the background, but nothing was pressed. Call getScreenshot for a new screenshot, then give the coordinates in its pixels.")
    // A truncated container (its row left out of the record) relabelled in place.
    for (now, reason) in [("Ads", StalePointReason.relabelled), ("(3) Results", .unrecordedDescendant)] {
      let list = Node("AXList", nil, title: "Results")
      let window = windowHolding(list)
      let row = Node("AXButton", CGRect(x: 20, y: 100, width: 120, height: 40), title: "Row")
      list.add(row)
      let cut = recorded(window, skipping: [ObjectIdentifier(row)])
      list.title = now
      XCTAssertEqual(verdict(cut, at: point, hit: row).reason, reason, now)
    }
    // The frame is judged first: a relabelled node that moved is refused as moved.
    let moved = Node("AXButton", nil, title: "Save")
    let movedNodes = recorded(windowHolding(moved))
    moved.title = "Delete"
    moved.frame = CGRect(x: 300, y: 100, width: 120, height: 40)
    XCTAssertEqual(verdict(movedNodes, at: point, hit: moved).reason, .frameMoved)
  }

  /// The record keeps an AXStaticText's value (a string or an attributed string's text, cut as the walk cuts labels) and
  /// every node's subrole; no other role's value.
  func testTheRecordKeepsAStaticTextsValueAndTheSubrole() {
    XCTAssertEqual(screenshotLabelValue(role: "AXStaticText", "Save" as CFString), "Save")
    XCTAssertEqual(screenshotLabelValue(role: "AXStaticText", NSAttributedString(string: "Save") as CFAttributedString), "Save")
    XCTAssertNil(screenshotLabelValue(role: "AXStaticText", 3 as CFNumber))
    XCTAssertNil(screenshotLabelValue(role: "AXStaticText", nil))
    XCTAssertNil(screenshotLabelValue(role: "AXTextField", "Save" as CFString))
    let long = String(repeating: "Terms. ", count: 2000)
    XCTAssertEqual(screenshotLabelValue(role: "AXStaticText", long as CFString), bounded(long))
    // Through the walk.
    let tree = FakeTree()
    tree.children = [0: [1, 2, 3]]
    tree.extra[1] = ["AXRole": "AXStaticText" as CFString, "AXTitle": "" as CFString, "AXValue": "Save" as CFString]
    tree.extra[2] = ["AXRole": "AXTextField" as CFString, "AXValue": "typed" as CFString]
    tree.extra[3] = ["AXRole": "AXRadioButton" as CFString, "AXSubrole": "AXTabButton" as CFString]
    let recording = walk(tree, Lineage(), recordsScreenshot: true)
    func read(_ id: Int) -> ScreenshotNodeRead<AXUIElement>? { recording.screenshotReads.first { tree.id($0.element) == id } }
    XCTAssertEqual(read(1)?.value, "Save")
    XCTAssertNil(read(2)?.value)
    XCTAssertEqual(read(3)?.subrole, "AXTabButton")
    // And into the record's nodes.
    let text = Node("AXStaticText", nil, value: "Save", subrole: "AXSomething")
    let node = recorded(windowHolding(text)).last
    XCTAssertEqual(node?.value, "Save")
    XCTAssertEqual(node?.subrole, "AXSomething")
  }
}

/// #298's edited-text exemption (the design session's ruling 1ea561bc:553): a click on text in an editable region only
/// places a caret, and that text changing is the model's own typing. So an AXStaticText (or a text run inside one) whose
/// nearest editable ancestor is the one recorded for it is not compared, while anything actionable inside the region
/// (a link, a button, a mention or chip with AXPress) still is.
final class RelabelledEditableTests: XCTestCase {
  /// A page with a message body as Chrome exposes a contenteditable region: an AXTextArea whose every node, itself
  /// included, answers it as AXEditableAncestor; a paragraph group holds the typed text.
  private struct Editor {
    let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 800, height: 600))
    let page = Node("AXWebArea", CGRect(x: 0, y: 50, width: 800, height: 550))
    let region: Node
    let paragraph = Node("AXGroup", CGRect(x: 40, y: 100, width: 600, height: 40))
    let text = Node("AXStaticText", CGRect(x: 40, y: 105, width: 200, height: 20), value: "Hello")
    /// `exposed`: the app answers AXEditableAncestor (Chrome, Safari); else only the region's role says it is editable.
    init(role: String = "AXTextArea", exposed: Bool = true) {
      region = Node(role, CGRect(x: 40, y: 100, width: 600, height: 300), description: "Message Body")
      window.add(page)
      page.add(region)
      region.add(paragraph)
      paragraph.add(text)
      if exposed { for node in [region, paragraph, text] { node.editableAncestor = region } }
    }
  }
  private let point = CGPoint(x: 60, y: 115)

  private func judged(_ nodes: [ScreenshotNode<Node>], hit: Node) -> StalePointReason {
    stalePointVerdict(at: point, nodes: nodes, hit: hit, reads: reads).reason
  }

  /// Typed text in a contenteditable passes: by the exposed AXEditableAncestor; by the region's role where nothing
  /// exposes it (an AXTextArea); by a contenteditable group that exposes it while its text does not; a text run inside
  /// the text; and a text re-created in place as it is typed over.
  func testTypedTextInAnEditableRegionPasses() {
    do {
      let editor = Editor()
      let nodes = recorded(editor.window)
      editor.text.value = "Hello world, see you at 3"
      XCTAssertEqual(judged(nodes, hit: editor.text), .sameElement, "AXEditableAncestor")
      XCTAssertEqual(judged(nodes, hit: editor.region), .hitAboveNode, "the hit the region, above the text: kept")
    }
    do {
      let editor = Editor(exposed: false)
      let nodes = recorded(editor.window)
      editor.text.value = "Goodbye"
      XCTAssertEqual(judged(nodes, hit: editor.text), .sameElement, "the nearest AXTextArea")
    }
    do {
      let editor = Editor(role: "AXGroup", exposed: false)
      editor.region.editableAncestor = editor.region
      let nodes = recorded(editor.window)
      editor.text.value = "Goodbye"
      XCTAssertEqual(judged(nodes, hit: editor.text), .sameElement, "a contenteditable group")
    }
    do {
      let editor = Editor()
      let run = Node("AXStaticText", CGRect(x: 45, y: 106, width: 60, height: 18), value: "Hello")
      run.editableAncestor = editor.region
      editor.text.add(run)
      let nodes = recorded(editor.window)
      run.value = "Goodbye"
      XCTAssertEqual(judged(nodes, hit: run), .sameElement, "a text run")
    }
    do {  // Overtyping one character at the same width re-creates the text node.
      let editor = Editor()
      let nodes = recorded(editor.window)
      editor.text.destroy()
      let again = Node("AXStaticText", CGRect(x: 40, y: 105, width: 200, height: 20), value: "Jello")
      again.editableAncestor = editor.region
      editor.paragraph.add(again)
      let verdict = stalePointVerdict(at: point, nodes: nodes, hit: again, reads: reads)
      XCTAssertEqual(verdict.identity, .recreated)
      XCTAssertEqual(verdict.reason, .sameElement)
    }
  }

  /// A relabelled link, button or chip inside the edited region is still refused: its text is the node at the point, but
  /// an actionable element lies between it and the region.
  func testARelabelledActionableElementInsideTheRegionStillRefuses() {
    for (role, actions) in [("AXLink", ["AXPress"]), ("AXButton", []), ("AXGroup", ["AXPress", "AXShowMenu"])] {
      let editor = Editor()
      let control = Node(role, CGRect(x: 40, y: 105, width: 200, height: 20))
      control.actions = actions
      control.editableAncestor = editor.region
      editor.paragraph.add(control)
      let label = Node("AXStaticText", CGRect(x: 40, y: 105, width: 200, height: 20), value: "Save")
      label.editableAncestor = editor.region
      control.add(label)
      let nodes = recorded(editor.window)
      label.value = "Delete"
      XCTAssertEqual(judged(nodes, hit: label), .relabelled, role)
      label.value = "Save"
      XCTAssertEqual(judged(nodes, hit: label), .sameElement, role)
    }
    // A plain group without AXPress between the text and the region does not stand in the way.
    let editor = Editor()
    editor.paragraph.actions = ["AXShowMenu", "AXScrollToVisible"]
    let nodes = recorded(editor.window)
    editor.text.value = "Goodbye"
    XCTAssertEqual(judged(nodes, hit: editor.text), .sameElement)
  }

  /// A static text whose editable ancestor now is not the one recorded for it is still judged: moved into another
  /// region, left with none (the region no longer editable), or recorded with none (text outside any editor).
  func testATextWhoseEditableAncestorDiffersIsStillJudged() {
    do {
      let editor = Editor()
      let other = Node("AXTextArea", CGRect(x: 40, y: 450, width: 600, height: 100))
      editor.page.add(other)
      let nodes = recorded(editor.window)
      editor.text.editableAncestor = other
      editor.text.value = "Delete"
      XCTAssertEqual(judged(nodes, hit: editor.text), .relabelled, "another region")
    }
    do {
      let editor = Editor(role: "AXGroup")
      let nodes = recorded(editor.window)
      for node in [editor.region, editor.paragraph, editor.text] { node.editableAncestor = nil }
      editor.text.value = "Delete"
      XCTAssertEqual(judged(nodes, hit: editor.text), .relabelled, "no longer editable")
    }
    do {
      let editor = Editor(role: "AXGroup", exposed: false)
      let nodes = recorded(editor.window)
      editor.region.editableAncestor = editor.region  // made editable after the screenshot
      editor.text.value = "Delete"
      XCTAssertEqual(judged(nodes, hit: editor.text), .relabelled, "none recorded")
    }
  }

  /// The record keeps, for an AXStaticText only, its nearest editable ancestor: its AXEditableAncestor, else the nearest
  /// ancestor that is an AXTextArea or answers an AXEditableAncestor of its own; the walk reads AXEditableAncestor in its
  /// batch.
  func testTheRecordKeepsATextsEditableAncestor() {
    func recordedAncestor(_ editor: Editor, _ node: Node) -> Node? {
      recorded(editor.window).first { $0.element === node }?.editableAncestor
    }
    let exposed = Editor()
    XCTAssertTrue(recordedAncestor(exposed, exposed.text) === exposed.region)
    XCTAssertNil(recordedAncestor(exposed, exposed.paragraph), "not a static text")
    let textArea = Editor(exposed: false)
    XCTAssertTrue(recordedAncestor(textArea, textArea.text) === textArea.region)
    let group = Editor(role: "AXGroup", exposed: false)
    XCTAssertNil(recordedAncestor(group, group.text), "nothing says the group is editable")
    group.paragraph.editableAncestor = group.region
    XCTAssertTrue(recordedAncestor(group, group.text) === group.paragraph, "the nearest that answers one")
    // Through the walk's batch.
    XCTAssertTrue(observedAttributes.contains("AXEditableAncestor"))
    let region = AXUIElementCreateApplication(990_004)
    XCTAssertTrue(ElementData(values: ["AXEditableAncestor": region]).editableAncestor.map { CFEqual($0, region) } ?? false)
    XCTAssertNil(ElementData(values: ["AXEditableAncestor": "x" as CFString]).editableAncestor)
    let tree = FakeTree()
    tree.children = [0: [1]]
    tree.extra[1] = ["AXRole": "AXStaticText" as CFString, "AXEditableAncestor": Engine.element(0)]
    let recording = walk(tree, Lineage(), recordsScreenshot: true)
    let text = recording.screenshotReads.first { tree.id($0.element) == 1 }
    XCTAssertEqual(text?.editableAncestor.map { tree.id($0) }, 0)
  }
}

/// The review of 7f6eb3dc..b2f00ad5 (P2 2): a label attribute whose read failed is not one the element lacks. The label
/// falls through to the next source only past an absent or empty one; where it would depend on an unreadable
/// higher-priority attribute, at the observation or now, rule `relabelled` does not refuse.
final class UnreadableLabelTests: XCTestCase {
  private let point = CGPoint(x: 60, y: 120)

  /// A button "Save" whose description is "Save changes", recorded with `atRecord` unreadable, read now with `now`.
  private func judged(atRecord: Set<StalePointLabelPart> = [], now: Set<StalePointLabelPart> = [],
                      title: String? = "Save", description: String? = "Save changes", change: (Node) -> Void = { _ in }) -> StalePointReason {
    let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 600, height: 400))
    let button = Node("AXButton", CGRect(x: 20, y: 100, width: 120, height: 40), title: title, description: description)
    window.add(button)
    button.unreadable = atRecord
    let nodes = recorded(window)
    button.unreadable = now
    change(button)
    return stalePointVerdict(at: point, nodes: nodes, hit: button, reads: reads).reason
  }

  /// The title read fails at the click: the description is not compared with the recorded title.
  func testATitleUnreadableNowDoesNotRefuse() {
    XCTAssertEqual(judged(now: [.title]), .sameElement)
    XCTAssertEqual(judged(now: [.title], change: { $0.description = "Delete" }), .sameElement)
    // A title absent now (not failed) is no label, and the description is: it refuses, as before.
    XCTAssertEqual(judged(change: { $0.title = nil }), .relabelled)
  }

  /// The title read failed at the observation: the recorded description is not taken for the label.
  func testATitleUnreadableAtTheObservationDoesNotRefuse() {
    XCTAssertEqual(judged(atRecord: [.title]), .sameElement)
    XCTAssertEqual(judged(atRecord: [.title], change: { $0.title = "Delete" }), .sameElement)
    // Absent at the observation: the description was the label, and a title "Save" now has other words.
    XCTAssertEqual(judged(title: nil, change: { $0.title = "Save" }), .relabelled)
  }

  /// Only a higher-priority attribute counts: a description or a value unreadable behind a title that reads changes
  /// nothing, and the title relabelled refuses.
  func testALowerPriorityUnreadableAttributeChangesNothing() {
    XCTAssertEqual(judged(atRecord: [.description], now: [.description], change: { $0.title = "Delete" }), .relabelled)
    XCTAssertEqual(judged(now: [.description], title: nil, change: { $0.description = "Delete" }), .sameElement,
                   "the description, now the label, unreadable")
    // A text's value, below an empty title and description.
    let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 600, height: 400))
    let text = Node("AXStaticText", CGRect(x: 20, y: 100, width: 120, height: 40), value: "Save")
    window.add(text)
    let nodes = recorded(window)
    text.value = "Delete"
    text.unreadable = [.value]
    XCTAssertEqual(stalePointVerdict(at: point, nodes: nodes, hit: text, reads: reads).reason, .sameElement)
    text.unreadable = [.description]
    XCTAssertEqual(stalePointVerdict(at: point, nodes: nodes, hit: text, reads: reads).reason, .sameElement)
    text.unreadable = []
    XCTAssertEqual(stalePointVerdict(at: point, nodes: nodes, hit: text, reads: reads).reason, .relabelled)
  }

  /// What counts as unreadable: an error other than the attribute's absence (kAXErrorNoValue,
  /// kAXErrorAttributeUnsupported), in the walk's batched read and in a single read now; and the record keeps it for the
  /// label's attributes, the value an AXStaticText's only.
  func testAnUnreadableAttributeIsAnErrorOtherThanAbsence() {
    func errorSlot(_ code: AXError) -> Any { var code = code; return AXValueCreate(.axError, &code)! }
    XCTAssertTrue(failedSlot(errorSlot(.cannotComplete)))
    XCTAssertTrue(failedSlot(errorSlot(.failure)))
    XCTAssertFalse(failedSlot(errorSlot(.noValue)))
    XCTAssertFalse(failedSlot(errorSlot(.attributeUnsupported)))
    XCTAssertFalse(failedSlot("Save" as CFString))
    XCTAssertFalse(failedSlot(nil))
    XCTAssertEqual(stalePointLabelRead("Save" as CFString, .success), .text("Save"))
    XCTAssertEqual(stalePointLabelRead(nil, .noValue), .text(nil))
    XCTAssertEqual(stalePointLabelRead(nil, .attributeUnsupported), .text(nil))
    XCTAssertEqual(stalePointLabelRead(3 as CFNumber, .success), .text(nil))
    XCTAssertEqual(stalePointLabelRead(nil, .cannotComplete), .unreadable)
    XCTAssertEqual(screenshotLabelsUnread(role: "AXButton", ["AXTitle", "AXValue", "AXHelp"]), [.title])
    XCTAssertEqual(screenshotLabelsUnread(role: "AXStaticText", ["AXDescription", "AXValue"]), [.description, .value])
    XCTAssertEqual(ElementData(values: [:], unreadable: ["AXTitle"]).unreadable, ["AXTitle"])
    // Through the walk.
    let tree = FakeTree()
    tree.children = [0: [1]]
    tree.unreadableAttributes[1] = ["AXTitle"]
    let recording = walk(tree, Lineage(), recordsScreenshot: true)
    XCTAssertEqual(recording.screenshotReads.first { tree.id($0.element) == 1 }?.labelsUnread, [.title])
  }
}
