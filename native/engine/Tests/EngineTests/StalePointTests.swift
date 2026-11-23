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
  /// #500: label attributes whose read answers kCFNull, in the walk's batched read (its slot) and in a single read now.
  var null: Set<StalePointLabelPart> = []
  /// Its role or its action names fail to read now (the review of b2f00ad5..25b23fbb, P2 2).
  var roleUnread = false
  var actionsUnread = false
  /// Its AXChildren read fails (at the observation, for the walk's record).
  var childrenUnread = false
  /// Its AXChildren read fails now (#431's coverage check).
  var childrenUnreadNow = false
  /// The visible subset the walk's width rule takes in place of its AXChildren (AXVisibleChildren, AXVisibleRows).
  var visibleChildren: [Node]?
  /// Its frame fails to read now while it lives (#431's review of 849bcdad, finding 3).
  var frameUnread = false
  /// Its AXParent fails to read now while it lives (#433's review of 2a1b0368, item 2).
  var parentUnread = false
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

  /// Moved under `parent`, out of the one it was in.
  func reparent(to parent: Node) {
    self.parent?.children.removeAll { $0 === self }
    parent.add(self)
  }

  /// Destroyed: its handle answers nothing, its parent included, and it leaves its parent.
  func destroy() {
    frame = nil
    title = nil
    description = nil
    value = nil
    parent?.children.removeAll { $0 === self }
    parent = nil
  }
}

private var reads: StalePointReads<Node> {
  StalePointReads<Node>(role: { $0.roleUnread ? nil : $0.role }, frame: { $0.frameUnread ? nil : $0.frame },
                                          parent: { $0.parentUnread ? nil : $0.parent },
                                          children: { $0.childrenUnreadNow ? nil : $0.children },
                                          // A failed or null read answers none, as the live seam's `attribute` does.
                                          title: { $0.unreadable.union($0.null).contains(.title) ? nil : $0.title },
                                          description: { $0.unreadable.union($0.null).contains(.description) ? nil : $0.description },
                                          value: { $0.unreadable.union($0.null).contains(.value) ? nil : $0.value },
                                          editableAncestor: { $0.editableAncestor }, actions: { $0.frame == nil || $0.actionsUnread ? nil : $0.actions },
                                          label: { node, part in
                                            if node.unreadable.contains(part) { return .unreadable }
                                            // #500: a single read answering kCFNull, classified as the live seam's is.
                                            if node.null.contains(part) { return stalePointLabelRead(kCFNull, .success) }
                                            switch part {
                                            case .title: return .text(node.title)
                                            case .description: return .text(node.description)
                                            case .value: return .text(node.value)
                                            }
                                          }, same: { $0 === $1 },
                                          // Destroyed, not merely a frame unread (#431's review of 849bcdad, finding 3).
                                          gone: { $0.frame == nil })
}

/// The reads an observation with a screenshot emits for `root`'s tree, every node walked but `skipped` ones (as `TreeWalk`
/// emits them, its labels cut by `bounded` as ElementData cuts them).
private func walked(_ root: Node, skipping skipped: Set<ObjectIdentifier> = []) -> [ScreenshotNodeRead<Node>] {
  var reads: [ScreenshotNodeRead<Node>] = []
  var next = 0
  /// Each element is emitted once, at its first place (an element two parents list, Chromium's cell under its row and
  /// its column, is emitted under the first).
  var seen: Set<ObjectIdentifier> = []
  func walk(_ node: Node, parent: Int?, depth: Int) {
    guard seen.insert(ObjectIdentifier(node)).inserted else { return }
    let number = next
    next += 1
    let children = node.childrenUnread ? [] : node.children  // a failed AXChildren read decodes as none
    // The label's slots decoded as the walk decodes a batched read (#500: a null slot at decode time).
    let labels = decodedLabels(role: node.role, title: node.title, description: node.description, value: node.value, null: node.null,
                               failed: node.unreadable)
    // A failed AXRole read decodes as AXUnknown (ElementData).
    reads.append(ScreenshotNodeRead(element: node, number: number, parent: parent, depth: depth, role: node.roleUnread ? "AXUnknown" : node.role,
                                    title: labels.title, description: labels.description,
                                    frame: node.frame, actions: node.actionsUnread ? [] : node.actions, childCount: children.count,
                                    children: children, actionsRead: !node.actionsUnread, roleRead: !node.roleUnread,
                                    childrenRead: !node.childrenUnread, subrole: node.subrole,
                                    value: screenshotLabelValue(role: node.role, labels.value),
                                    labelsUnread: labels.unread, labelsNull: labels.null))
    // The width rule's visible subset, where the element offers one (#431's review: it may hold elements AXChildren
    // does not, and lack some it does).
    for child in node.visibleChildren ?? children where !skipped.contains(ObjectIdentifier(child)) { walk(child, parent: number, depth: depth + 1) }
  }
  walk(root, parent: nil, depth: 0)
  return reads
}

/// The record an observation with a screenshot makes of `root`'s tree (`walked`).
private func recorded(_ root: Node, skipping skipped: Set<ObjectIdentifier> = []) -> [ScreenshotNode<Node>] {
  screenshotNodes(walked(root, skipping: skipped)) { AnyHashable(ObjectIdentifier($0)) }
}

/// #435: the same walk's frameless elements (`screenshotRecord`), which #431's twin search reads beside the record.
private func recordedFrameless(_ root: Node, skipping skipped: Set<ObjectIdentifier> = []) -> [ScreenshotNode<Node>] {
  screenshotRecord(walked(root, skipping: skipped)) { AnyHashable(ObjectIdentifier($0)) }.frameless
}

/// The whole record an observation makes of `root`'s tree: its framed nodes, its frameless ones and its handle map.
private func walkRecord(_ root: Node, skipping skipped: Set<ObjectIdentifier> = [])
  -> (nodes: [ScreenshotNode<Node>], frameless: [ScreenshotNode<Node>], members: (Node) -> Bool?) {
  (recorded(root, skipping: skipped), recordedFrameless(root, skipping: skipped), recordedMembers(root, skipping: skipped))
}

/// #330: every element the same walk recorded, framed or not, with whether it recorded all of the element's children
/// (`screenshotChildrenRecorded`), as the verdict looks it up.
private func recordedMembers(_ root: Node, skipping skipped: Set<ObjectIdentifier> = []) -> (Node) -> Bool? {
  let complete = screenshotChildrenRecorded(walked(root, skipping: skipped)) { ObjectIdentifier($0) }
  return { complete[ObjectIdentifier($0)] }
}

/// The guard's verdict over `nodes`, with `members` the same observation's lookup (`recordedMembers`), which a re-created
/// handle must be new to (#431); without it nothing counts as covered, and no re-created handle is taken.
private func verdict(_ nodes: [ScreenshotNode<Node>], frameless: [ScreenshotNode<Node>] = [], members: @escaping (Node) -> Bool? = { _ in nil },
                     at point: CGPoint, shift: CGVector = .zero, hit: Node?) -> StalePointVerdict<Node> {
  stalePointVerdict(at: point, windowShift: shift, nodes: nodes, frameless: frameless, recorded: members, hit: hit, reads: reads)
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
      let nodes = recorded(chrome.window), members = recordedMembers(chrome.window)
      chrome.button.destroy()
      let again = Node("AXButton", CGRect(x: 101, y: 300, width: 120, height: 31), title: "Save")
      let label = Node("AXStaticText", CGRect(x: 130, y: 306, width: 60, height: 18))
      again.add(label)
      chrome.webArea.add(again)
      let kept = verdict(nodes, members: members, at: CGPoint(x: 160, y: 315), hit: label)
      XCTAssertEqual(kept.identity, .recreated)
      XCTAssertTrue(kept.current === again)
      XCTAssertEqual(kept.reason, .nonInteractiveHit)
      // More than 2 pt off: not the node.
      again.frame = CGRect(x: 103, y: 300, width: 120, height: 30)
      XCTAssertEqual(verdict(nodes, members: members, at: CGPoint(x: 160, y: 315), hit: label).reason, .nodeGone)
    }
    // The hit is a container (the page): the re-created button among its first 300 descendants is found, past them not.
    for (filler, found) in [(298, true), (300, false)] {
      let chrome = Chrome()
      let nodes = recorded(chrome.window), members = recordedMembers(chrome.window)
      chrome.button.destroy()
      for index in 0..<filler { chrome.webArea.add(Node("AXGroup", CGRect(x: 0, y: 700 + CGFloat(index), width: 1, height: 1))) }
      let again = Node("AXButton", CGRect(x: 100, y: 300, width: 120, height: 30), title: "Save")
      chrome.webArea.add(again)  // breadth-first position filler + 1
      let judged = verdict(nodes, members: members, at: CGPoint(x: 160, y: 315), hit: chrome.webArea)
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
      let nodes = recorded(window), members = recordedMembers(window)
      like.destroy()
      let again = Node("AXButton", CGRect(x: 10, y: 10, width: 80, height: 24), title: now.title, description: now.description)
      window.add(again)
      return verdict(nodes, members: members, at: CGPoint(x: 50, y: 22), hit: again)
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
      let nodes = recorded(root), members = recordedMembers(root)
      move(root, by: shift)
      a.destroy()
      let again = Node("AXButton", CGRect(x: 111, y: 10, width: 80, height: 30), title: "A")  // re-created where the window took it
      root.add(again)
      let kept = verdict(nodes, members: members, at: posted, shift: shift, hit: again)
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
    let nodes = recorded(window), members = recordedMembers(window)
    accept.destroy()
    let again = Node("AXCheckBox", CGRect(x: 10, y: 10, width: 300, height: 30), title: label)
    window.add(again)
    let kept = verdict(nodes, members: members, at: CGPoint(x: 50, y: 25), hit: again)
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
    let nodes = recorded(window), members = recordedMembers(window)
    button.destroy()
    let again = Node("AXButton", CGRect(x: 10, y: 10, width: 80, height: 30), title: "Again")
    var answers: [Node?] = [nil, again]
    var sleeps: [Double] = []
    let kept = stalePointVerdict(at: CGPoint(x: 50, y: 25), nodes: nodes, recorded: members, hit: nil, rehit: {
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
    let gate = StalePointGate(first: first, firstMs: 1.5) { () -> StalePointRecheck<Node> in
      clock += 0.75
      return StalePointRecheck(verdict(nodes, at: point, hit: item))
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
    let nodes = recorded(window), members = recordedMembers(window)
    button.destroy()
    let again = Node("AXButton", CGRect(x: 100, y: 100, width: 120, height: 30), title: "Again")
    let point = CGPoint(x: 150, y: 115)
    var answers: [Node?] = [again]
    let verdict = stalePointVerdict(at: point, nodes: nodes, recorded: members, hit: nil, rehit: {
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
    let gate = StalePointGate(first: verdict, firstMs: 0) { StalePointRecheck(verdict) }
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
    let gate = StalePointGate(first: verdict(nodes, at: point, hit: item), firstMs: 1) { StalePointRecheck(verdict(nodes, at: point, hit: item)) }
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
    // A container re-created with another title: not the node, refused. With the same title it is refused too since #431
    // (ruling 889): the record of its region is not whole (its row left out), so a re-created match there is refused.
    for title in ["Ads", "Results"] {
      let (window, list, row, _) = page()
      let nodes = recorded(window, skipping: [ObjectIdentifier(row)]), members = recordedMembers(window, skipping: [ObjectIdentifier(row)])
      list.destroy()
      let again = Node("AXGroup", CGRect(x: 0, y: 50, width: 600, height: 300), title: title)
      again.add(row)
      window.add(again)
      XCTAssertEqual(verdict(nodes, members: members, at: point, hit: row).reason, .nodeGone, title)
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
      let nodes = recorded(page.window), members = recordedMembers(page.window)
      return verdict(nodes, members: members, at: codePoint, hit: change(page)).reason
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
    let gate = StalePointGate(first: first, firstMs: 0.5) { StalePointRecheck(verdict(nodes, at: self.codePoint, hit: page.textArea)) }
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

// MARK: #452: a window of the app's own over the observed one at the point (design rulings 928 and 940, #337's sentence)

final class AppWindowOverPointTests: XCTestCase {
  private let app: pid_t = 990_021, other: pid_t = 990_022
  /// #337's measurement (run 44797144792): the browser window 28 at (400, 31, 620×678), the omnibox popup 49 over it at
  /// (499, 56, 458×218), the row clicked at (728, 136).
  private let browser = ListedWindow(number: 28, owner: 990_021, layer: 0, bounds: CGRect(x: 400, y: 31, width: 620, height: 678))
  private let popup = ListedWindow(number: 49, owner: 990_021, layer: 0, bounds: CGRect(x: 499, y: 56, width: 458, height: 218))
  private let row = CGPoint(x: 728, y: 136)
  /// The screenshot's list held every window here (open at the observation), so #316's rule W passes them.
  private let recorded: Set<CGWindowID> = [28, 44, 49, 51, 77, 90]

  private func guarded(_ list: [ListedWindow], place: PointHitPlace, target: CGWindowID? = 28)
    -> (verdict: StalePointVerdict<Node>, treeRead: Bool) {
    var treeRead = false
    let verdict = guardedPointVerdict(at: row, hit: Node?.none, place: place, target: target, pid: app, recorded: recorded,
                                      windows: { list }) {
      treeRead = true
      return StalePointVerdict<Node>(reason: .noHit)
    }
    return (verdict, treeRead)
  }

  /// (a) The app's hit-test answers in another of its windows (the omnibox popup): refused before the tree, with the
  /// window's number and the signal in the meta, and a sentence that names the app's window and the ways through, never
  /// the page.
  func testAHitInAnotherWindowOfTheAppRefusesBeforeTheTree() {
    let (verdict, treeRead) = guarded([popup, browser], place: .otherWindow(49))
    XCTAssertEqual(verdict.reason, .appWindowOverPoint)
    XCTAssertTrue(verdict.refused)
    XCTAssertFalse(treeRead, "nothing of the tree read")
    var outcome = stalePointOutcome(verdict, ms: 0.4, app: "Google Chrome", reads: reads)
    outcome.record.windowsMs = 0.2
    outcome.record.hitMs = 3.25
    XCTAssertEqual(outcome.refusal?.errorName, "appWindowOverPoint")
    XCTAssertEqual(outcome.refusal?.message,
                   "Google Chrome has a window of its own over the one the screenshot showed at this point (a suggestion list, popup or panel), and a click here would reach the window under it, not what the screenshot shows. Nothing was sent. Use keys instead (the arrow keys and Return for a suggestion list, Escape to close it), or call getAXState() and click an element it lists.")
    XCTAssertEqual(outcome.record.wire as NSDictionary, ["verdict": "refused", "reason": "appWindowOverPoint", "overWindow": 49, "by": "axHit",
                                                         "windowsMs": 0.2, "hitMs": 3.25, "ms": 0.4] as NSDictionary)
  }

  /// (a) at any layer: Chrome's `<datalist>` popup at layer 999 refuses, with no number for the observed window too.
  func testAHitInAnotherWindowRefusesAtAnyLayer() {
    let datalist = ListedWindow(number: 77, owner: app, layer: 999, bounds: popup.bounds)
    let atLayer999 = guarded([datalist, browser], place: .otherWindow(77)).verdict
    XCTAssertEqual(atLayer999.reason, .appWindowOverPoint)
    XCTAssertEqual(atLayer999.overWindow, 77)
    XCTAssertEqual(atLayer999.overBy, .axHit)
    XCTAssertEqual(guarded([datalist, browser], place: .otherWindow(77), target: nil).verdict.reason, .appWindowOverPoint,
                   "no number for the observed window")
  }

  /// The review of 023a3bee (P1), run 44822312301: the hit answered in window 44, of alpha 0, with the visible page under
  /// it, which the screenshot showed and main's click reached. (a) refuses only a window the list holds on screen with
  /// alpha above 0; a transparent one, one the list does not hold (not on screen, or the list unread) and an unread
  /// number keep main's verdict.
  func testAHitInATransparentUnlistedOrUnnumberedWindowKeepsMainsVerdict() {
    let transparent = ListedWindow(number: 44, owner: app, layer: 0, bounds: popup.bounds, alpha: 0)
    let cases: [(String, [ListedWindow], PointHitPlace)] = [
      ("alpha 0", [transparent, browser], .otherWindow(44)),
      ("not in the list", [browser], .otherWindow(44)),
      ("an empty list", [], .otherWindow(44)),
      ("its number unread", [popup, browser], .otherWindow(nil)),
    ]
    for (name, list, place) in cases {
      let (verdict, treeRead) = guarded(list, place: place)
      XCTAssertEqual(verdict.reason, .noHit, name)
      XCTAssertTrue(treeRead, name)
    }
  }

  /// The review of 023a3bee..e98276d2 (P1): the hit's window must still cover the point in the list, its bounds holding
  /// it and, the observed window listed, in front of it at any layer; one visible elsewhere, or behind the observed
  /// window, keeps main's verdict. With the observed window unlisted, the bounds alone decide.
  func testAHitWindowThatNoLongerCoversThePointKeepsMainsVerdict() {
    let elsewhere = ListedWindow(number: 49, owner: app, layer: 0, bounds: CGRect(x: 2000, y: 0, width: 300, height: 200))
    let behind = ListedWindow(number: 49, owner: app, layer: 0, bounds: popup.bounds)
    let kept: [(String, [ListedWindow])] = [
      ("its bounds off the point", [elsewhere, browser]),
      ("behind the observed window", [browser, behind]),
    ]
    for (name, list) in kept {
      let (verdict, treeRead) = guarded(list, place: .otherWindow(49))
      XCTAssertEqual(verdict.reason, .noHit, name)
      XCTAssertTrue(treeRead, name)
    }
    XCTAssertEqual(guarded([popup], place: .otherWindow(49)).verdict.reason, .appWindowOverPoint, "observed unlisted, over the point")
    XCTAssertEqual(guarded([elsewhere], place: .otherWindow(49)).verdict.reason, .noHit, "observed unlisted, off the point")
    let menuLayer = ListedWindow(number: 49, owner: app, layer: 101, bounds: popup.bounds)
    XCTAssertEqual(guarded([menuLayer, browser], place: .otherWindow(49)).verdict.reason, .appWindowOverPoint, "in front at any layer")
  }

  /// (b) TextEdit's colour-well popover: the hit is an AXPopover inside the document window's tree, and the list holds a
  /// window of the app's over the document at the point. Refused as `popover`, the list's window named; another app's
  /// window over both changes nothing.
  func testAPopoverOverTheObservedWindowRefuses() {
    let popover = ListedWindow(number: 51, owner: app, layer: 0, bounds: CGRect(x: 700, y: 100, width: 100, height: 100))
    let (verdict, treeRead) = guarded([popover, browser], place: .observedWindow(inPopover: true))
    XCTAssertEqual(verdict.reason, .appWindowOverPoint)
    XCTAssertEqual(verdict.overWindow, 51)
    XCTAssertEqual(verdict.overBy, .popover)
    XCTAssertFalse(treeRead)
    XCTAssertEqual(StalePointRecord(verdict, ms: 1).wire["by"] as? String, "popover")
    let cover = ListedWindow(number: 90, owner: other, layer: 0, bounds: CGRect(x: 0, y: 0, width: 1500, height: 900))
    XCTAssertEqual(guarded([cover, popover, browser], place: .observedWindow(inPopover: true)).verdict.overWindow, 51)
  }

  /// (c) What keeps main's verdict: Chrome's status bubble or tab hover card (a window of the app's over the point, the
  /// hit the observed window's own element), a hit unread, failed or too late over the same window, a popover hit with
  /// no window of the app's over the point (or only another app's, or one at another layer, or of alpha 0), and a hit in
  /// the observed window with nothing over it.
  func testWhatKeepsMainsVerdict() {
    let bubble = ListedWindow(number: 51, owner: app, layer: 0, bounds: CGRect(x: 700, y: 100, width: 100, height: 100))
    let cases: [(String, [ListedWindow], PointHitPlace)] = [
      ("a click-through bubble over the point", [bubble, browser], .observedWindow(inPopover: false)),
      ("a hit unread over it", [bubble, browser], .unread),
      ("a popover hit, nothing of the app's over the point", [browser], .observedWindow(inPopover: true)),
      ("a popover hit, another app's window over it", [ListedWindow(number: 90, owner: other, layer: 0, bounds: bubble.bounds), browser],
       .observedWindow(inPopover: true)),
      ("a popover hit, the app's window at another layer", [ListedWindow(number: 51, owner: app, layer: 101, bounds: bubble.bounds), browser],
       .observedWindow(inPopover: true)),
      ("a popover hit, the app's window of alpha 0", [ListedWindow(number: 51, owner: app, layer: 0, bounds: bubble.bounds, alpha: 0), browser],
       .observedWindow(inPopover: true)),
      ("a popover hit, the observed window topmost", [browser, bubble], .observedWindow(inPopover: true)),
      ("a plain hit, nothing over it", [browser], .observedWindow(inPopover: false)),
    ]
    for (name, list, place) in cases {
      let (verdict, treeRead) = guarded(list, place: place)
      XCTAssertEqual(verdict.reason, .noHit, name)
      XCTAssertTrue(treeRead, name)
    }
    // Only a popover hit reads the window list for #452; without a recorded list to compare (W), nothing else does.
    var listRead = false
    _ = guardedPointVerdict(at: row, hit: Node?.none, place: .observedWindow(inPopover: false), target: 28, pid: app, recorded: nil,
                            windows: { listRead = true; return [bubble, self.browser] }) { StalePointVerdict<Node>(reason: .noHit) }
    XCTAssertFalse(listRead)
    // A popup the screenshot's list lacked is #316's rule W's, with W's sentence.
    let new = guardedPointVerdict(at: row, hit: Node?.none, place: .otherWindow(49), target: 28, pid: app, recorded: [28],
                                  windows: { [self.popup, self.browser] }) { StalePointVerdict<Node>(reason: .noHit) }
    XCTAssertEqual(new.reason, .newWindow)
  }

  /// The refusal is thrown before anything in every mode: shared with the app frontmost, shared with it behind (where #282
  /// would otherwise refuse blaming the page), and a dedicated desktop; a click and a drag's start alike, nothing posted,
  /// activated or held.
  func testTheRefusalPostsNothingInEveryMode() {
    let refusal = stalePointOutcome(guarded([popup, browser], place: .otherWindow(49)).verdict, ms: 0, app: "Google Chrome", reads: reads).refusal
    XCTAssertNotNil(refusal)
    let frame = browser.bounds
    let activations = HeldActivations()
    let modes: [(String, DesktopMode, pid_t)] = [("shared, frontmost", .shared, app), ("shared, behind", .shared, other),
                                                ("dedicated", .dedicated, other)]
    for (mode, desktop, frontmost) in modes {
      for drag in [false, true] {
        let name = "\(mode), \(drag ? "a drag" : "a click")"
        let seam = GuardSeam(frontmost: frontmost)
        seam.activationPoint = CGPoint(x: -1, y: 1441)  // Chrome's: outside the frame
        let activation = FakeActivation(pid: app, window: AXUIElementCreateApplication(app), windowFrame: frame, windowID: 28, system: seam.system)
        let connection = ConnectionState(id: 1, fd: -1)
        connection.desktop = desktop
        var meta = InputMeta(ExecutionContext(connection: connection, receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
        var pointer = PointerTarget(view: .possibleWebArea, app: "Google Chrome", engine: .chromium)
        pointer.staleRefusal = refusal
        let target = ClickTarget(point: row, windowFrame: frame, windowID: 28, pid: app)
        XCTAssertThrowsError(try {
          if drag {
            try deliverPointer(to: app, route: .activation, activation: activation, activations: activations, pointer: pointer,
                               post: seam.system.post, meta: &meta) {
              dragEvents(from: row, to: CGPoint(x: 728, y: 400), window: target, flags: [])
            }
          } else {
            try deliverClick(target, route: .activation, button: .left, count: 1, activation: activation, activations: activations,
                             pointer: pointer, targetActive: { frontmost == self.app }, post: seam.system.post, meta: &meta)
          }
        }(), name) { XCTAssertEqual(($0 as? EngineError)?.errorName, "appWindowOverPoint", name) }
        XCTAssertEqual(seam.posts.count, 0, name)
        XCTAssertEqual(seam.holds, 0, name)
        XCTAssertEqual(activations.holders(app), 0, name)
        XCTAssertNil(meta.startedAt, name)
      }
    }
  }
}

// MARK: #456: the element route's recheck after its wait runs #452's rule on its own fresh hit-test

final class RecheckAppWindowOverPointTests: XCTestCase {
  private let app: pid_t = 990_031
  /// #337's measurement again: the browser window 28, the omnibox popup 49 over it, the row at (728, 136), here over a
  /// page button the screenshot showed (nothing of the app's over it then, so the first check kept the point).
  private let browser = ListedWindow(number: 28, owner: 990_031, layer: 0, bounds: CGRect(x: 400, y: 31, width: 620, height: 678))
  private let popup = ListedWindow(number: 49, owner: 990_031, layer: 0, bounds: CGRect(x: 499, y: 56, width: 458, height: 218))
  private let row = CGPoint(x: 728, y: 136)

  /// The app's AX tree: the browser window holding the page's button at the row, and the popup's window with its row.
  private final class Scene {
    let application = Node("AXApplication", nil)
    let window = Node("AXWindow", CGRect(x: 400, y: 31, width: 620, height: 678))
    let button = Node("AXButton", CGRect(x: 600, y: 120, width: 260, height: 32), title: "Search")
    let popupWindow = Node("AXWindow", CGRect(x: 499, y: 56, width: 458, height: 218))
    let suggestion = Node("AXStaticText", CGRect(x: 510, y: 120, width: 430, height: 32), value: "cua")
    /// TextEdit's colour-well popover as AX folds it into the observed window's tree (#452's (b)).
    let popover = Node("AXPopover", CGRect(x: 650, y: 100, width: 160, height: 120))
    let swatch = Node("AXButton", CGRect(x: 700, y: 120, width: 40, height: 40), description: "Red")
    init() {
      window.add(button)
      application.add(window)
      popupWindow.add(suggestion)
      application.add(popupWindow)
      popover.add(swatch)
    }
  }

  /// The element route's gate over `scene`: the first check kept the button, and the recheck after the wait hit-tests the
  /// row again (`windowHit`, timed by a fake clock, each hit-test taking `hitTakes`) to whatever `answer` gives then,
  /// with the window list `list` then (asked only when the recheck reads it).
  private func gate(_ scene: Scene, answer: @escaping () -> Node?, list: @escaping () -> [ListedWindow],
                    hitTakes: Double = 3) -> StalePointGate<Node> {
    let nodes = recorded(scene.window)
    let first = verdict(nodes, at: row, hit: scene.button)
    XCTAssertEqual(first.reason, .sameElement, "the first check kept the point")
    var firstRecord = StalePointRecord(first, ms: 1)
    firstRecord.hitMs = 2
    return StalePointGate(first: first, record: firstRecord, app: "Google Chrome") { [row, app] in
      var clock = 0.0
      let hit = windowHit(application: scene.application, window: scene.window, at: row, elementAt: { root, _ in
        clock += hitTakes
        let answered = answer()
        return root === scene.application ? (answered == nil ? .noValue : .success, answered) : (.illegalArgument, nil)
      }, role: { $0.role }, parent: { $0.parent }, same: { $0 === $1 },
         number: { window, _ in window === scene.popupWindow ? 49 : nil }, now: { clock })
      let rechecked = recheckedPointVerdict(at: row, hit: hit, target: 28, pid: app, windows: list) {
        verdict(nodes, at: row, hit: $0)
      }
      return StalePointRecheck(rechecked, hitMs: hit.ms)
    }
  }

  /// The route as `webAreaPress` runs it: the early check after its action re-read wait, then the final check after the
  /// focus hold, then the press. Answers the steps taken and the last record, or the refusal thrown.
  private func press(_ gate: StalePointGate<Node>, _ pressed: Node, hold: Bool = false)
    -> (steps: [String], record: StalePointRecord?, refusal: EngineError?) {
    var steps: [String] = []
    var record: StalePointRecord?
    do {
      let early = gate.check(pressed, waited: true, now: { 0 }, reads: reads)
      record = early.record
      if let refusal = early.refusal { throw refusal }
      try pressAfterFinalCheck(holds: hold, hold: { steps.append("hold") }, finalCheck: { afterHold in
        guard afterHold else { return }
        let checked = gate.check(pressed, waited: true, afterActivation: true, now: { 0 }, reads: reads)
        record = checked.record
        if let refusal = checked.refusal { throw refusal }
      }, perform: { steps.append("press") })
      return (steps, record, nil)
    } catch {
      return (steps, record, error as? EngineError)
    }
  }

  /// The omnibox popup opens over the point during the route's wait: the recheck's hit-test answers in its window, which
  /// covers the point in the list, and the route is refused with #452's sentence and meta, nothing pressed; the same
  /// when it opens during the focus hold, the sentence then saying the activation ran.
  func testAPopupThatOpensDuringTheWaitIsRefusedWithNothingPressed() {
    let scene = Scene()
    let refused = press(gate(scene, answer: { scene.suggestion }, list: { [self.popup, self.browser] }), scene.button)
    XCTAssertEqual(refused.steps, [], "nothing pressed")
    XCTAssertEqual(refused.refusal?.errorName, "appWindowOverPoint")
    XCTAssertEqual(refused.refusal?.message,
                   "Google Chrome has a window of its own over the one the screenshot showed at this point (a suggestion list, popup or panel), and a click here would reach the window under it, not what the screenshot shows. Nothing was sent. Use keys instead (the arrow keys and Return for a suggestion list, Escape to close it), or call getAXState() and click an element it lists.")
    XCTAssertEqual(refused.record?.wire["reason"] as? String, "appWindowOverPoint")
    XCTAssertEqual(refused.record?.wire["by"] as? String, "axHit")
    XCTAssertEqual(refused.record?.wire["overWindow"] as? Int, 49)
    XCTAssertEqual(refused.record?.wire["hitMs"] as? Double, 3, "the recheck's own hit-test")
    XCTAssertEqual(refused.record?.wire["rechecked"] as? Bool, true)

    // Opened during the focus hold: the early check keeps, the final one refuses, nothing pressed.
    var opened = false
    var steps: [String] = []
    let held = gate(scene, answer: { opened ? scene.suggestion : scene.button }, list: { opened ? [self.popup, self.browser] : [self.browser] })
    XCTAssertNil(held.check(scene.button, waited: true, now: { 0 }, reads: reads).refusal, "the early check keeps")
    XCTAssertThrowsError(try pressAfterFinalCheck(holds: true, hold: { steps.append("hold"); opened = true }, finalCheck: { afterHold in
      let checked = held.check(scene.button, waited: afterHold, afterActivation: afterHold, now: { 0 }, reads: reads)
      XCTAssertEqual(checked.record.wire["afterActivation"] as? Bool, true)
      if let refusal = checked.refusal { throw refusal }
    }, perform: { steps.append("press") })) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "appWindowOverPoint")
      XCTAssertEqual(($0 as? EngineError)?.message.contains("Google Chrome has a window of its own"), true)
      XCTAssertEqual(($0 as? EngineError)?.message.contains("The app was activated in the background, but nothing was pressed."), true)
    }
    XCTAssertEqual(steps, ["hold"], "nothing pressed")
  }

  /// (b) on the recheck: a popover of the app's opened over the point during the wait (the hit under an AXPopover in the
  /// observed window's tree, a window of the app's over the point in the list) is refused as `popover`.
  func testAPopoverThatOpensDuringTheWaitIsRefused() {
    let scene = Scene()
    let over = ListedWindow(number: 51, owner: app, layer: 0, bounds: CGRect(x: 650, y: 100, width: 160, height: 120))
    let routed = gate(scene, answer: { scene.swatch }, list: { [over, self.browser] })
    scene.window.add(scene.popover)  // opened during the wait
    let refused = press(routed, scene.button)
    XCTAssertEqual(refused.steps, [])
    XCTAssertEqual(refused.refusal?.errorName, "appWindowOverPoint")
    XCTAssertEqual(refused.record?.wire["by"] as? String, "popover")
    XCTAssertEqual(refused.record?.wire["overWindow"] as? Int, 51)
  }

  /// A popup that opened after the first check and is gone by the recheck: the hit is the button again, nothing of the
  /// app's over the point, and the route presses it.
  func testAPopupGoneByTheRecheckKeepsThePoint() {
    let scene = Scene()
    let kept = press(gate(scene, answer: { scene.button }, list: { [self.browser] }), scene.button)
    XCTAssertNil(kept.refusal)
    XCTAssertEqual(kept.steps, ["press"])
    XCTAssertEqual(kept.record?.reason, .sameElement)
  }

  /// A click-through window of the app's over the point at the recheck (Chrome's status bubble, a tab hover card): the
  /// hit answers the observed window's own button, so it keeps, the window list not even read.
  func testAClickThroughWindowOverThePointKeeps() {
    let scene = Scene()
    let bubble = ListedWindow(number: 51, owner: app, layer: 0, bounds: CGRect(x: 700, y: 100, width: 100, height: 100))
    var listReads = 0
    let kept = press(gate(scene, answer: { scene.button }, list: { listReads += 1; return [bubble, self.browser] }), scene.button)
    XCTAssertNil(kept.refusal)
    XCTAssertEqual(kept.steps, ["press"])
    XCTAssertEqual(kept.record?.reason, .sameElement)
    XCTAssertEqual(listReads, 0)
  }

  /// A recheck hit-test past `pointHitSignalDeadlineMs` gives no signal: the popup's row answered late keeps main's
  /// verdict (no hit in the observed window: `noHit`, the button still in place) and the route presses, where the same
  /// answer in time refuses.
  func testALateRecheckHitKeepsMainsVerdict() {
    let scene = Scene()
    let late = press(gate(scene, answer: { scene.suggestion }, list: { [self.popup, self.browser] }, hitTakes: pointHitSignalDeadlineMs + 1),
                     scene.button)
    XCTAssertNil(late.refusal)
    XCTAssertEqual(late.steps, ["press"])
    XCTAssertEqual(late.record?.reason, .noHit)
    XCTAssertEqual(late.record?.wire["hitMs"] as? Double, pointHitSignalDeadlineMs + 1)
    let inTime = press(gate(scene, answer: { scene.suggestion }, list: { [self.popup, self.browser] }, hitTakes: pointHitSignalDeadlineMs - 1),
                       scene.button)
    XCTAssertEqual(inTime.refusal?.errorName, "appWindowOverPoint")
  }

  /// An ordinary element-route click, nothing over the point: the recheck's verdict is the tree's on its hit, as before,
  /// the window list never read, the record carrying none of #452's fields; and with no wait nothing is read again.
  func testAnOrdinaryElementRouteClickIsUnchanged() {
    let scene = Scene()
    var listReads = 0
    var hits = 0
    let routed = gate(scene, answer: { hits += 1; return scene.button }, list: { listReads += 1; return [self.browser] })
    let pressed = press(routed, scene.button, hold: true)
    XCTAssertNil(pressed.refusal)
    XCTAssertEqual(pressed.steps, ["hold", "press"])
    XCTAssertEqual(hits, 2, "the early and the final check each hit-test again")
    XCTAssertEqual(listReads, 0)
    let record = pressed.record?.wire ?? [:]
    XCTAssertEqual(record["reason"] as? String, "sameElement")
    XCTAssertNil(record["by"])
    XCTAssertNil(record["overWindow"])
    XCTAssertEqual(verdict(recorded(scene.window), at: row, hit: scene.button).reason, pressed.record?.reason, "the tree's verdict")
    hits = 0
    XCTAssertNil(routed.check(scene.button, waited: false, now: { 0 }, reads: reads).refusal)
    XCTAssertEqual(hits, 0, "no wait: nothing read again")
  }

  /// The review of edbfbd23..e1a01d42 (P2): a field route's first check follows #359's pending-click wait (up to
  /// `pendingClickCapMs` after a recent pointer press to the app). A popup that opens during that wait, with no other
  /// wait after it (the field's boxes already there; no focus hold), is refused there, nothing focused; with no pointer
  /// press pending nothing waits, and the first verdict stands with no hit-test again.
  func testAPopupThatOpensDuringThePendingClickWaitIsRefusedAtTheFieldsFirstCheck() {
    let scene = Scene()
    var opened = false
    var hits = 0
    let routed = gate(scene, answer: { hits += 1; return opened ? scene.suggestion : scene.button },
                      list: { opened ? [self.popup, self.browser] : [self.browser] })
    let ordering = ClickOrdering()
    ordering.pointerPosted(pids: [app], at: 1_000)
    var clock = 1_100.0
    func pendingWait() -> Bool {
      pendingClickWait(ordering, pids: [app], at: clock, read: { RangeRead.sample(NSRange(location: 3, length: 0)) },
                       now: { clock }, sleep: { clock += $0; opened = true }) != nil
    }
    var focused = false
    let checked = fieldRouteFirstCheck(scene.button, gate: routed, awaitPendingClick: pendingWait, now: { 0 }, reads: reads)
    if checked?.refusal == nil { focused = true }
    XCTAssertTrue(opened, "the popup opened during the pending-click wait")
    XCTAssertFalse(focused, "nothing focused")
    XCTAssertEqual(checked?.refusal?.errorName, "appWindowOverPoint")
    XCTAssertEqual(checked?.record.wire["by"] as? String, "axHit")
    XCTAssertEqual(checked?.record.wire["rechecked"] as? Bool, true)
    XCTAssertEqual(hits, 1)

    // No pointer press pending: no wait, the first verdict, nothing hit-tested again.
    (opened, hits, clock) = (false, 0, 5_000)
    let idle = fieldRouteFirstCheck(scene.button, gate: routed, awaitPendingClick: pendingWait, now: { 0 }, reads: reads)
    XCTAssertNil(idle?.refusal)
    XCTAssertEqual(idle?.record.rechecked, false)
    XCTAssertEqual(hits, 0)
    XCTAssertNil(fieldRouteFirstCheck(scene.button, gate: nil, awaitPendingClick: { true }, now: { 0 }, reads: reads), "no gate")
  }

  /// The review of edbfbd23..e1a01d42 (P2): an early recheck after the action wait, then a final one after the focus
  /// hold. The final record, which replaces the early one in the meta, carries the time and window-list reads of all
  /// three checks, and the final recheck's hit-test time.
  func testTheFinalRecordAddsUpEveryChecksCosts() {
    let scene = Scene()
    let nodes = recorded(scene.window)
    let first = verdict(nodes, at: row, hit: scene.button)
    var firstRecord = StalePointRecord(first, ms: 1)
    (firstRecord.windowsMs, firstRecord.hitMs) = (0.5, 2)
    var clock = 0.0
    var rechecks: [(takes: Double, windowsMs: Double, hitMs: Double)] = [(0.5, 0.25, 3), (0.25, 0.125, 4)]
    let routed = StalePointGate(first: first, record: firstRecord, app: "Google Chrome") { [row] in
      let next = rechecks.removeFirst()
      clock += next.takes
      return StalePointRecheck(verdict(nodes, at: row, hit: scene.button), hitMs: next.hitMs, windowsMs: next.windowsMs)
    }
    let early = routed.check(scene.button, waited: true, now: { clock }, reads: reads).record
    XCTAssertEqual(early.ms, 1.5)
    XCTAssertEqual(early.windowsMs, 0.75)
    XCTAssertEqual(early.hitMs, 3)
    let final = routed.check(scene.button, waited: true, afterActivation: true, now: { clock }, reads: reads).record
    XCTAssertEqual(final.ms, 1.75, "all three checks' time")
    XCTAssertEqual(final.windowsMs, 0.875, "all three checks' window-list reads")
    XCTAssertEqual(final.hitMs, 4, "the final recheck's hit-test")
    XCTAssertEqual(final.wire["afterActivation"] as? Bool, true)
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
    firstRecord.hitMs = 2.5  // #452's hit-test time (the review of 023a3bee, P2)
    // #456: the recheck's own hit-test time, and its window-list read added to the first's.
    let gate = StalePointGate(first: first, record: firstRecord) {
      StalePointRecheck(verdict(partial, at: self.payPoint, hit: browser.pay), hitMs: 1.5, windowsMs: 0.25)
    }
    for waited in [false, true] {
      let checked = gate.check(browser.pay, waited: waited, now: { 0 }, reads: reads)
      XCTAssertNil(checked.refusal)
      XCTAssertEqual(checked.record.reason, .unrecordedDescendant, "the press verdict rebuilt: the button inside the iframe group")
      XCTAssertEqual(checked.record.wire["windowsMs"] as? Double, waited ? 0.65 : 0.4, "waited: \(waited)")
      XCTAssertEqual(checked.record.wire["hitMs"] as? Double, waited ? 1.5 : 2.5, "waited: \(waited)")
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

  /// #431's reviews: the walk's record carries each element's AXChildren, whether its action names read and whether its
  /// role read. A list over the width threshold whose visible subset holds an element AXChildren does not, as many as it
  /// lists, leaves its region uncovered (while #330's count keeps main's answer); an element whose actions or role failed
  /// leaves its descendants' control unknown.
  func testTheWalkRecordsListedChildrenAndUnreadActions() {
    let tree = FakeTree()
    tree.children = [0: [1], 1: Array(2...102), 2: [200]]
    tree.visible = [1: Array(3...103)]  // 101 listed, 101 visible, element 2 never recorded
    tree.frames = [0: CGRect(x: 0, y: 0, width: 400, height: 300), 1: CGRect(x: 0, y: 0, width: 400, height: 300),
                   3: CGRect(x: 0, y: 0, width: 400, height: 10)]
    tree.actionsUnread = [2]
    let recording = walk(tree, Lineage(), recordsScreenshot: true)
    let complete = screenshotChildrenRecorded(recording.screenshotReads) { tree.id($0) }
    XCTAssertNil(complete[2], "listed, not walked")
    XCTAssertEqual(complete[1], true, "#330's count: main's answer")
    XCTAssertEqual(recording.screenshotReads.first { tree.id($0.element) == 1 }?.children?.count, 101)
    XCTAssertEqual(screenshotNodes(recording.screenshotReads) { AnyHashable(tree.id($0)) }.first { tree.id($0.element) == 3 }?.regionCovered,
                   false, "its listed child 2 missing from the record")
    tree.visible = [:]
    tree.children = [0: [1], 1: [2], 2: [3]]
    tree.frames = [0: CGRect(x: 0, y: 0, width: 400, height: 300), 1: CGRect(x: 0, y: 0, width: 400, height: 300),
                   2: CGRect(x: 0, y: 0, width: 200, height: 30), 3: CGRect(x: 10, y: 5, width: 50, height: 20)]
    let unread = walk(tree, Lineage(), recordsScreenshot: true)
    XCTAssertEqual(unread.screenshotReads.first { tree.id($0.element) == 2 }?.actionsRead, false)
    XCTAssertEqual(screenshotNodes(unread.screenshotReads).first { tree.id($0.element) == 3 }?.controlUnknown, true)
    tree.actionsUnread = []
    XCTAssertEqual(screenshotNodes(walk(tree, Lineage(), recordsScreenshot: true).screenshotReads)
                     .first { tree.id($0.element) == 3 }?.controlUnknown, false)
    tree.unreadableAttributes[2] = [kAXRoleAttribute]
    let roleUnread = walk(tree, Lineage(), recordsScreenshot: true)
    XCTAssertEqual(roleUnread.screenshotReads.first { tree.id($0.element) == 2 }?.roleRead, false)
    let roleNodes = screenshotNodes(roleUnread.screenshotReads)
    XCTAssertEqual(roleNodes.first { tree.id($0.element) == 2 }?.roleUnknown, true)
    XCTAssertEqual(roleNodes.first { tree.id($0.element) == 3 }?.controlUnknown, true, "under a role unread")
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
      let nodes = recorded(window), members = recordedMembers(window)
      text.destroy()
      link.add(Node("AXStaticText", CGRect(x: 30, y: 110, width: 80, height: 20), value: now))
      return verdict(nodes, members: members, at: point, hit: link)
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
      let nodes = recorded(window), members = recordedMembers(window)
      button.destroy()
      let frame = CGRect(x: 20, y: 100, width: 120, height: 40)
      let again = description ? Node("AXButton", frame, description: now) : Node("AXButton", frame, title: now)
      window.add(again)
      return verdict(nodes, members: members, at: point, hit: again).reason
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
    let gate = StalePointGate(first: verdict(itemNodes, at: point, hit: item), firstMs: 1) { [point] in StalePointRecheck(verdict(itemNodes, at: point, hit: item)) }
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

  /// Typed text in a contenteditable passes: the record's nearest text-entry ancestor (an AXTextArea, an AXTextField)
  /// named again at the click by the text's AXEditableAncestor, or by the region's role where nothing exposes it; a
  /// text run inside the text; and a text re-created in place as it is typed over.
  func testTypedTextInAnEditableRegionPasses() {
    do {
      let editor = Editor()
      let nodes = recorded(editor.window)
      editor.text.value = "Hello world, see you at 3"
      XCTAssertEqual(judged(nodes, hit: editor.text), .sameElement, "AXEditableAncestor")
      XCTAssertEqual(judged(nodes, hit: editor.region), .hitAboveNode, "the hit the region, above the text: kept")
    }
    for role in ["AXTextArea", "AXTextField"] {
      let editor = Editor(role: role, exposed: false)
      let nodes = recorded(editor.window)
      editor.text.value = "Goodbye"
      XCTAssertEqual(judged(nodes, hit: editor.text), .sameElement, "the nearest \(role)")
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
      let nodes = recorded(editor.window), members = recordedMembers(editor.window)
      editor.text.destroy()
      let again = Node("AXStaticText", CGRect(x: 40, y: 105, width: 200, height: 20), value: "Jello")
      again.editableAncestor = editor.region
      editor.paragraph.add(again)
      let verdict = stalePointVerdict(at: point, nodes: nodes, recorded: members, hit: again, reads: reads)
      XCTAssertEqual(verdict.identity, .recreated)
      XCTAssertEqual(verdict.reason, .sameElement)
    }
    do {  // Re-created in the region with another description: the exemption spares its value only.
      let editor = Editor()
      editor.text.description = "Greeting"
      let nodes = recorded(editor.window)
      editor.text.destroy()
      let again = Node("AXStaticText", CGRect(x: 40, y: 105, width: 200, height: 20), description: "Farewell", value: "Jello")
      again.editableAncestor = editor.region
      editor.paragraph.add(again)
      XCTAssertEqual(stalePointVerdict(at: point, nodes: nodes, hit: again, reads: reads).reason, .nodeGone)
    }
  }

  /// The review of b2f00ad5..25b23fbb (P2 1): where the text answers no AXEditableAncestor, its editable ancestor is the
  /// region its nearest answering ancestor names, not that ancestor. So a link that answers the editor, around text that
  /// answers nothing, is a wrapper the exemption checks (refused), while a plain paragraph's text passes.
  func testPartialExposureResolvesToTheRegionNamed() {
    do {
      let editor = Editor()
      let link = Node("AXLink", CGRect(x: 40, y: 105, width: 200, height: 20))
      link.actions = ["AXPress"]
      link.editableAncestor = editor.region
      editor.paragraph.add(link)
      let label = Node("AXStaticText", CGRect(x: 40, y: 105, width: 200, height: 20), value: "Save")
      link.add(label)
      let nodes = recorded(editor.window)
      XCTAssertTrue(nodes.first { $0.element === label }?.editableAncestor === editor.region)
      label.value = "Delete"
      XCTAssertEqual(judged(nodes, hit: label), .relabelled)
    }
    do {
      let editor = Editor()
      editor.text.editableAncestor = nil
      let nodes = recorded(editor.window)
      XCTAssertTrue(nodes.first { $0.element === editor.text }?.editableAncestor === editor.region)
      editor.text.value = "Goodbye"
      XCTAssertEqual(judged(nodes, hit: editor.text), .sameElement)
    }
    do {  // Only the text answers, at the click: the region the record derived from its role.
      let editor = Editor(exposed: false)
      editor.text.editableAncestor = editor.region
      let nodes = recorded(editor.window)
      XCTAssertTrue(nodes.first { $0.element === editor.text }?.editableAncestor === editor.region)
      editor.text.value = "Goodbye"
      XCTAssertEqual(judged(nodes, hit: editor.text), .sameElement)
    }
  }

  /// The review of b2f00ad5..25b23fbb (P2 2): an element between the text and the region whose role or action names
  /// cannot be read is not known to be inert, so the exemption is withheld; one whose actions read as an empty list is
  /// inert.
  func testAWrapperWhoseRoleOrActionsCannotBeReadWithholdsTheExemption() {
    for (name, fail) in [("actions", { (node: Node) in node.actionsUnread = true }), ("role", { (node: Node) in node.roleUnread = true })] {
      let editor = Editor()
      let nodes = recorded(editor.window)
      fail(editor.paragraph)
      editor.text.value = "Goodbye"
      XCTAssertEqual(judged(nodes, hit: editor.text), .relabelled, name)
    }
    let editor = Editor()
    editor.paragraph.actions = []
    let nodes = recorded(editor.window)
    editor.text.value = "Goodbye"
    XCTAssertEqual(judged(nodes, hit: editor.text), .sameElement, "an empty list read")
  }

  /// The text's own AXEditableAncestor read failing at the click (it decodes as none) still names the same region,
  /// through its paragraph; the observation never reads it (ruling 1ea561bc:565), so a text that answered nothing then
  /// passes as well.
  func testATextsOwnAncestorReadFailingOnOneSideStillPasses() {
    do {  // Answering nothing at the observation.
      let editor = Editor()
      editor.text.editableAncestor = nil
      let nodes = recorded(editor.window)
      editor.text.editableAncestor = editor.region
      editor.text.value = "Goodbye"
      XCTAssertEqual(judged(nodes, hit: editor.text), .sameElement)
    }
    do {  // Failed now.
      let editor = Editor()
      let nodes = recorded(editor.window)
      editor.text.editableAncestor = nil
      editor.text.value = "Goodbye"
      XCTAssertEqual(judged(nodes, hit: editor.text), .sameElement)
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
  /// region, left with none (the region no longer editable), or recorded with none (text outside any editor, or in a
  /// contenteditable group the record's roles cannot tell from any group).
  func testATextWhoseEditableAncestorDiffersIsStillJudged() {
    do {
      let editor = Editor(role: "AXGroup")
      let nodes = recorded(editor.window)
      XCTAssertNil(nodes.first { $0.element === editor.text }?.editableAncestor)
      editor.text.value = "Goodbye"
      XCTAssertEqual(judged(nodes, hit: editor.text), .relabelled, "a contenteditable group")
    }
    do {  // The text answers nothing at the click; its paragraph names another region than the record's.
      let editor = Editor()
      let other = Node("AXTextArea", CGRect(x: 40, y: 450, width: 600, height: 100))
      editor.page.add(other)
      let nodes = recorded(editor.window)
      editor.text.editableAncestor = nil
      editor.paragraph.editableAncestor = other
      editor.text.value = "Delete"
      XCTAssertEqual(judged(nodes, hit: editor.text), .relabelled, "a parent naming another region")
    }
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

  /// The record derives, for an AXStaticText only, its region from what the walk already read (the design session's
  /// ruling 1ea561bc:565): its nearest recorded ancestor of an editable text role (AXTextArea, AXTextField). Nothing the
  /// app answers as AXEditableAncestor counts there, and the walk's batch does not request it.
  func testTheRecordDerivesATextsRegionFromItsReads() {
    func recordedAncestor(_ editor: Editor, _ node: Node) -> Node? {
      recorded(editor.window).first { $0.element === node }?.editableAncestor
    }
    let exposed = Editor()
    XCTAssertTrue(recordedAncestor(exposed, exposed.text) === exposed.region)
    XCTAssertNil(recordedAncestor(exposed, exposed.paragraph), "not a static text")
    let textArea = Editor(exposed: false)
    XCTAssertTrue(recordedAncestor(textArea, textArea.text) === textArea.region)
    let textField = Editor(role: "AXTextField", exposed: false)
    XCTAssertTrue(recordedAncestor(textField, textField.text) === textField.region)
    let group = Editor(role: "AXGroup")
    XCTAssertNil(recordedAncestor(group, group.text), "a group answering AXEditableAncestor: not among the reads")
    // Through the walk, whose batch no longer asks for AXEditableAncestor.
    XCTAssertFalse(observedAttributes.contains("AXEditableAncestor"))
    let tree = FakeTree()
    tree.children = [0: [1], 1: [2]]
    tree.frames = [0: CGRect(x: 0, y: 0, width: 800, height: 600), 1: CGRect(x: 40, y: 100, width: 600, height: 300),
                   2: CGRect(x: 40, y: 105, width: 200, height: 20)]
    tree.extra[1] = ["AXRole": "AXTextArea" as CFString]
    tree.extra[2] = ["AXRole": "AXStaticText" as CFString, "AXValue": "Hello" as CFString]
    let recording = walk(tree, Lineage(), recordsScreenshot: true)
    let text = screenshotNodes(recording.screenshotReads).first { tree.id($0.element) == 2 }
    XCTAssertEqual(text?.editableAncestor.map { tree.id($0) }, 1)
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

/// #500 (rulings 1083, 1131): a label slot that answers kCFNull is neither a value nor an absence nor a failed read. The
/// record keeps it unknown (`labelsUnread`) and null (`labelsNull`), the read now tells it apart too
/// (`StalePointLabelRead.null`), and each label comparison is like with like: a part null on both sides is passed to the
/// next, a part null on one side only is unread. Every null here enters at decode time (`decodedLabels`, the fake source's
/// `nullAttributes`).
final class NullLabelSlotTests: XCTestCase {
  private let point = CGPoint(x: 60, y: 120)

  /// A null slot decodes into `AttributeRead.null` and `ElementData.null` alone, and a single read answering kCFNull is
  /// `.null`; through the walk, the record keeps the part as unread and null, and the observation counts it.
  func testANullSlotIsRecordedUnknownAndCounted() {
    XCTAssertTrue(nullSlot(kCFNull))
    XCTAssertFalse(nullSlot(nil))
    XCTAssertFalse(nullSlot("Save" as CFString))
    var read = AttributeRead()
    read.decode(kAXTitleAttribute, kCFNull)
    XCTAssertEqual(read.null, [kAXTitleAttribute])
    XCTAssertEqual(read.unreadable, [], "a failed read is kept apart")
    XCTAssertEqual(read.absent, [])
    XCTAssertTrue(read.values.isEmpty)
    XCTAssertEqual(stalePointLabelRead(kCFNull, .success), .null)
    let labels = decodedLabels(role: "AXStaticText", title: "Save", description: nil, value: "Save", null: [.title, .value])
    XCTAssertNil(labels.title)
    XCTAssertEqual(labels.unread, [.title, .value])
    XCTAssertEqual(labels.null, [.title, .value])
    XCTAssertEqual(decodedLabels(role: "AXButton", title: nil, description: nil, value: "on", null: [.value]).null, [],
                   "no other role's value is its label")
    let tree = FakeTree()
    tree.children = [0: [1, 2]]
    tree.frames = [0: CGRect(x: 0, y: 0, width: 600, height: 400), 1: CGRect(x: 20, y: 20, width: 100, height: 30),
                   2: CGRect(x: 20, y: 60, width: 100, height: 30)]
    tree.nullAttributes[1] = [kAXTitleAttribute]
    let source = FakeSource(tree)
    let recording = walk(tree, Lineage(), source: source, recordsScreenshot: true)
    let node = recording.screenshotReads.first { tree.id($0.element) == 1 }
    XCTAssertNil(node?.title)
    XCTAssertEqual(node?.labelsUnread, [.title])
    XCTAssertEqual(node?.labelsNull, [.title])
    XCTAssertEqual(screenshotNodes(recording.screenshotReads).first { tree.id($0.element) == 1 }?.label(.title), .null)
    XCTAssertEqual(recording.screenshotReads.first { tree.id($0.element) == 2 }?.labelsNull, [], "a title read is not null")
    XCTAssertEqual(source.costs.counts["nullLabelSlots"], 1, "the observation's value-free count")
  }

  /// A button recorded with `then` null, read now with `now` null, after `change`.
  private func judged(then: Set<StalePointLabelPart>, now: Set<StalePointLabelPart>, title: String?, description: String?,
                      change: (Node) -> Void = { _ in }) -> StalePointReason {
    let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 600, height: 400))
    let button = Node("AXButton", CGRect(x: 20, y: 100, width: 120, height: 40), title: title, description: description)
    window.add(button)
    button.null = then
    let nodes = recorded(window)
    button.null = now
    change(button)
    return stalePointVerdict(at: point, nodes: nodes, hit: button, reads: reads).reason
  }

  /// #298's `relabelled`: a title null at the observation and now is passed over, so the button is judged by its
  /// description, and Open to Delete there still refuses. A title null on one side only is unread, and keeps the point
  /// (main compared the description with the title read now, or the title with the description, and refused).
  func testRelabelledComparesLikeWithLike() {
    XCTAssertEqual(judged(then: [.title], now: [.title], title: nil, description: "Open"), .sameElement)
    XCTAssertEqual(judged(then: [.title], now: [.title], title: nil, description: "Open", change: { $0.description = "Delete" }), .relabelled,
                   "always-null title: the description decides")
    XCTAssertEqual(judged(then: [.title], now: [], title: "Save", description: "Save changes"), .sameElement, "null then, a title now")
    XCTAssertEqual(judged(then: [], now: [.title], title: "Save", description: "Save changes"), .sameElement, "a title then, null now")
    XCTAssertEqual(judged(then: [.title], now: [], title: nil, description: "Open", change: { $0.description = "Delete" }), .sameElement,
                   "null then, absent now: unread, kept as a failed read is")
  }

  /// #443's `controlDiffers`: a title null on both sides is passed over and the description compared; null on one side
  /// only ends the label comparison, so only the frame is checked.
  func testControlDiffersComparesLikeWithLike() {
    let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 600, height: 400))
    let control = Node("AXLink", CGRect(x: 20, y: 100, width: 200, height: 30), description: "Archive")
    window.add(control)
    control.null = [.title]
    guard let record = recorded(window).first(where: { $0.element === control }) else { return XCTFail("recorded") }
    let now = Node("AXLink", CGRect(x: 20, y: 100, width: 200, height: 30), description: "Delete")
    window.add(now)
    now.null = [.title]
    XCTAssertTrue(controlDiffers(now, from: record, windowShift: .zero, reads), "both null: the descriptions differ")
    now.description = "Archive"
    XCTAssertFalse(controlDiffers(now, from: record, windowShift: .zero, reads), "both null, the same description, in place")
    now.description = "Delete"
    now.null = []
    XCTAssertFalse(controlDiffers(now, from: record, windowShift: .zero, reads), "null then, absent now: unread, the frame in place")
    now.frame = CGRect(x: 20, y: 140, width: 200, height: 30)
    XCTAssertTrue(controlDiffers(now, from: record, windowShift: .zero, reads), "the frame is still checked")
  }
}

// MARK: #431: a re-created handle is refused where the record could not tell it from another element

/// #431 (the design session's rulings 1ea561bc:884/885 and 889): #296's re-created match took any element of the node's
/// role, frame and label, so a same-label link that slid into a removed one's place passed (#340's phase-1 `twin`, 10/10
/// on CfT, Safari and Electron). Safari gives a moved link new handles (run 44520748737), so nothing the tree says now
/// tells the twin from the node re-created; the record refuses instead (`recreatedRefused`): a region it did not record
/// whole, another element in it the match could have taken for the node, an unknown control, or a control that lives on
/// without the candidate in it.
final class RecreatedIdentityTests: XCTestCase {
  /// Two links in a list, each a link around its text: A ("Reply") on the first row, B on the second, by default with
  /// A's label (another destination: a twin).
  private final class Thread {
    let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 600, height: 400))
    let page = Node("AXWebArea", CGRect(x: 0, y: 50, width: 600, height: 350))
    let list = Node("AXList", CGRect(x: 0, y: 80, width: 600, height: 200))
    let a: Node
    let aText = Node("AXStaticText", CGRect(x: 30, y: 105, width: 60, height: 20), value: "Reply")
    let b: Node
    let bText: Node
    let label: String
    /// `twin`: B's label ("Reply", A's, or another); `pressable`: each row a plain group that is a control by its AXPress
    /// (a clickable div), not a link.
    init(twin: String = "Reply", pressable: Bool = false) {
      label = twin
      let role = pressable ? "AXGroup" : "AXLink"
      a = Node(role, CGRect(x: 20, y: 100, width: 200, height: 30), title: "Reply")
      b = Node(role, CGRect(x: 20, y: 140, width: 200, height: 30), title: twin)
      bText = Node("AXStaticText", CGRect(x: 30, y: 145, width: 60, height: 20), value: twin)
      if pressable { (a.actions, b.actions) = (["AXPress"], ["AXPress"]) }
      window.add(page)
      page.add(list)
      list.add(a)
      a.add(aText)
      list.add(b)
      b.add(bText)
    }
    /// A removed and B slid up into its place. `webkit`: as Safari, B and its text answer new handles there.
    @discardableResult func slide(webkit: Bool = false) -> (link: Node, text: Node) {
      aText.destroy()
      a.destroy()
      guard webkit else {
        move(b.parent === list ? b : b.parent!, by: CGVector(dx: 0, dy: -40))
        return (b, bText)
      }
      bText.destroy()
      b.destroy()
      return insertAtA(role: "AXLink", label: label)
    }
    /// A re-rendered whole in place: a new link and a new text, A's label, A's frames.
    @discardableResult func rerenderA() -> (link: Node, text: Node) {
      aText.destroy()
      a.destroy()
      return insertAtA(role: "AXLink", label: "Reply")
    }
    func insertAtA(role: String, label: String) -> (link: Node, text: Node) {
      let link = Node(role, CGRect(x: 20, y: 100, width: 200, height: 30), title: label)
      let text = Node("AXStaticText", CGRect(x: 30, y: 105, width: 60, height: 20), value: label)
      link.add(text)
      list.children.insert(link, at: 0)
      link.parent = list
      return (link, text)
    }
    /// B moved into a row of its own (a group around it), before the observation.
    @discardableResult func wrapB() -> Node {
      let row = Node("AXGroup", CGRect(x: 0, y: 140, width: 600, height: 30))
      list.children.removeAll { $0 === b }
      list.add(row)
      row.add(b)
      return row
    }
  }
  /// The model's point on A's text, and on A's link outside its text: the record's node there is A's text, and A.
  private let atText = CGPoint(x: 40, y: 112)
  private let atLink = CGPoint(x: 150, y: 115)
  private let points: [(name: String, point: CGPoint, text: Bool)] = [("the record at the text", CGPoint(x: 40, y: 112), true),
                                                                      ("the record at the link", CGPoint(x: 150, y: 115), false)]

  /// The verdict at `point` after `change`, the record taken before it (with `skipping` left out of the walk).
  private func judged(_ thread: Thread, skipping: [Node] = [], at point: CGPoint, change: (Thread) -> Node?) -> StalePointVerdict<Node> {
    let skipped = Set(skipping.map(ObjectIdentifier.init))
    let (nodes, frameless, members) = walkRecord(thread.window, skipping: skipped)
    let hit = change(thread)
    return verdict(nodes, frameless: frameless, members: members, at: point, hit: hit)
  }

  /// #340's `twin`, and the same with B answering new handles after the slide (Safari): B's label is in the record, so
  /// the match could have taken B for A, and it refuses, at the text and at the link, whatever the hit.
  func testATwinWhoseLabelTheRecordHoldsRefusesWhateverItsHandles() {
    for (name, point, atText) in points {
      for webkit in [false, true] {
        for (hitName, hit) in [("the moved text", true), ("the moved link", false)] {
          let judgedNow = judged(Thread(), at: point) { thread in
            let moved = thread.slide(webkit: webkit)
            return hit ? moved.text : moved.link
          }
          XCTAssertEqual(judgedNow.node?.role, atText ? "AXStaticText" : "AXLink", name)
          XCTAssertEqual(judgedNow.reason, .nodeGone, "\(name), \(webkit ? "new handles" : "its own handles"), the hit \(hitName)")
          XCTAssertNil(judgedNow.identity)
        }
      }
      // A clickable row's twin: the same.
      XCTAssertEqual(judged(Thread(pressable: true), at: point) { $0.slide(webkit: true).text }.reason, .nodeGone, "\(name), pressable rows")
      // B's row alive, moving up with B re-rendered in it (`twinrow`).
      let thread = Thread()
      let row = thread.wrapB()
      XCTAssertEqual(judged(thread, at: point) { thread in
        thread.slide()
        thread.bText.destroy()
        thread.b.destroy()
        let link = Node("AXLink", CGRect(x: 20, y: 100, width: 200, height: 30), title: "Reply")
        let text = Node("AXStaticText", CGRect(x: 30, y: 105, width: 60, height: 20), value: "Reply")
        link.add(text)
        row.add(link)
        return atText ? text : link
      }.reason, .nodeGone, "\(name): twinrow")
    }
  }

  /// Ruling 889 (ii): a twin the record never read refuses because the record did not cover the node's region whole:
  /// past the walk's cap (`twincap`), in a row the walk did not go into (`twindeep`), under a row whose AXChildren read
  /// failed, or listed by its list but outside the visible subset the walk took (the review's finding 5).
  func testATwinTheRecordNeverReadRefusesOnCoverage() {
    for (name, point, _) in points {
      let cap = Thread()
      XCTAssertEqual(recorded(cap.window, skipping: [ObjectIdentifier(cap.b)]).first { $0.element === cap.aText }?.regionCovered, false)
      XCTAssertEqual(recorded(cap.window).first { $0.element === cap.aText }?.regionCovered, true, "the whole walk")
      XCTAssertEqual(judged(cap, skipping: [cap.b], at: point) { $0.slide(webkit: true).link }.reason, .nodeGone, "\(name): twincap")
      let deep = Thread()
      deep.wrapB()
      XCTAssertEqual(judged(deep, skipping: [deep.b], at: point) { $0.slide(webkit: true).text }.reason, .nodeGone, "\(name): twindeep")
      let unread = Thread()
      unread.wrapB().childrenUnread = true
      XCTAssertEqual(judged(unread, at: point) { $0.slide(webkit: true).link }.reason, .nodeGone, "\(name): its row read no children")
      let visible = Thread()
      let other = Node("AXLink", CGRect(x: 20, y: 180, width: 200, height: 30), title: "More")
      other.parent = visible.list
      visible.list.visibleChildren = [visible.a, other]  // AXChildren [A, B]; the visible subset [A, other], as many
      XCTAssertEqual(recorded(visible.window).first { $0.element === visible.aText }?.regionCovered, false, "B listed, never recorded")
      XCTAssertEqual(judged(visible, at: point) { $0.slide(webkit: true).link }.reason, .nodeGone, "\(name): outside the visible subset")
    }
  }

  /// A genuine re-creation in a record that covered the region whole, with no other element the match could take for the
  /// node, stays kept: the same text re-created in its link (`plain`), a same-width count (`like`), and the link
  /// re-rendered whole (`remount`), at the text and at the link.
  func testAGenuineReCreationInACoveredRecordWithNoTwinIsKept() {
    for (name, was, now) in [("plain", "Reply", "Reply"), ("like", "Like (12)", "Like (13)")] {
      let thread = Thread(twin: "Archive")
      thread.aText.value = was
      var again: Node?
      let kept = judged(thread, at: atText) { thread in
        thread.aText.destroy()
        let text = Node("AXStaticText", CGRect(x: 30, y: 105, width: 60, height: 20), value: now)
        thread.a.add(text)
        again = text
        return text
      }
      XCTAssertEqual(kept.identity, .recreated, name)
      XCTAssertTrue(kept.current === again, name)
      XCTAssertEqual(kept.reason, .sameElement, name)
    }
    for (name, point, atText) in points {
      var again: (link: Node, text: Node)?
      let kept = judged(Thread(twin: "Archive"), at: point) { thread in
        again = thread.rerenderA()
        return atText ? again?.text : again?.link
      }
      XCTAssertEqual(kept.identity, .recreated, "remount, \(name)")
      XCTAssertTrue(kept.current === (atText ? again?.text : again?.link), name)
      XCTAssertFalse(kept.refused, name)
    }
  }

  /// The cost ruling 889 accepts: a genuine re-render where the record of the node's web area is not whole refuses
  /// (`capremount`), wherever in the page the walk left something out; outside the web area (the browser's own
  /// toolbar) a gap does not count against a node in it.
  func testAGenuineReCreationWhereTheRecordIsNotWholeRefuses() {
    for (name, point, atText) in points {
      let capped = Thread(twin: "Archive")
      XCTAssertEqual(judged(capped, skipping: [capped.b], at: point) { thread in
        let again = thread.rerenderA()
        return atText ? again.text : again.link
      }.reason, .nodeGone, "\(name): capremount")
      // A group elsewhere in the page whose child the walk left out.
      let elsewhere = Thread(twin: "Archive")
      let filler = Node("AXGroup", CGRect(x: 0, y: 300, width: 600, height: 40))
      let leftOut = Node("AXStaticText", CGRect(x: 0, y: 300, width: 60, height: 20), value: "x")
      filler.add(leftOut)
      elsewhere.page.add(filler)
      XCTAssertEqual(judged(elsewhere, skipping: [leftOut], at: point) { thread in
        let again = thread.rerenderA()
        return atText ? again.text : again.link
      }.reason, .nodeGone, "\(name): a gap elsewhere in the page")
      // The same gap in the browser's toolbar, outside the web area: kept.
      let toolbar = Thread(twin: "Archive")
      let bar = Node("AXToolbar", CGRect(x: 0, y: 0, width: 600, height: 50))
      let button = Node("AXButton", CGRect(x: 10, y: 10, width: 30, height: 30), description: "Back")
      bar.add(button)
      toolbar.window.add(bar)
      XCTAssertEqual(judged(toolbar, skipping: [button], at: point) { thread in
        let again = thread.rerenderA()
        return atText ? again.text : again.link
      }.identity, .recreated, "\(name): a gap outside the web area")
    }
  }

  /// Ruling 889 (i), by the match's own label rule: another element of the node's role in its region whose label agrees
  /// refuses; a label that differs does not; one the match cannot compare (B's title absent where A's is the link's
  /// label, or unread at the observation) agrees, as it would for the match; an element in another web area, or under
  /// the node's own control, is no other control.
  func testAnotherElementTheMatchCouldTakeForTheNodeRefuses() {
    func remount(_ thread: Thread, at point: CGPoint = CGPoint(x: 150, y: 115)) -> StalePointReason {
      judged(thread, at: point) { $0.rerenderA().link }.reason
    }
    XCTAssertEqual(remount(Thread(twin: "Reply")), .nodeGone, "the same title")
    XCTAssertEqual(remount(Thread(twin: "Archive")), .sameElement, "another title")
    let untitled = Thread(twin: "Archive")
    untitled.b.title = nil
    XCTAssertEqual(remount(untitled), .nodeGone, "B with no title: the match could not tell it from A")
    let unread = Thread(twin: "Archive")
    unread.b.unreadable = [.title]
    XCTAssertEqual(remount(unread), .nodeGone, "B's title unread at the observation")
    // In another web area (an iframe's document): kept.
    let framed = Thread(twin: "Archive")
    let frame = Node("AXWebArea", CGRect(x: 0, y: 300, width: 600, height: 80))
    frame.add(Node("AXLink", CGRect(x: 20, y: 310, width: 200, height: 30), title: "Reply"))
    framed.page.add(frame)
    XCTAssertEqual(remount(framed), .sameElement, "the same title in another document")
    // At the text: a second "Reply" text under A itself is A's, not another control's.
    let own = Thread(twin: "Archive")
    own.a.add(Node("AXStaticText", CGRect(x: 120, y: 105, width: 60, height: 20), value: "Reply"))
    XCTAssertEqual(judged(own, at: atText) { thread in
      thread.aText.destroy()
      let text = Node("AXStaticText", CGRect(x: 30, y: 105, width: 60, height: 20), value: "Reply")
      thread.a.add(text)
      return text
    }.reason, .sameElement, "a same-label text under the node's own control")
  }

  /// The review's finding 4: an element whose action names failed to read at the observation leaves its descendants'
  /// control unknown, never inert, and a re-created match for them refuses.
  func testAnUnknownControlInTheRecordRefusesTheMatch() {
    for unread in [false, true] {
      let thread = Thread(twin: "Archive")
      let group = Node("AXGroup", CGRect(x: 30, y: 105, width: 60, height: 20))
      thread.a.children.removeAll { $0 === thread.aText }
      thread.a.add(group)
      group.add(thread.aText)
      group.actionsUnread = unread
      let (nodes, frameless, members) = walkRecord(thread.window)
      group.actionsUnread = false
      thread.aText.destroy()
      let text = Node("AXStaticText", CGRect(x: 30, y: 105, width: 60, height: 20), value: "Reply")
      group.add(text)
      XCTAssertEqual(nodes.first { $0.element === thread.aText }?.controlUnknown, unread)
      XCTAssertEqual(verdict(nodes, frameless: frameless, members: members, at: atText, hit: text).reason, unread ? .nodeGone : .sameElement)
    }
  }

  /// The review's finding 1, as a refusal: while the node's control lives, a re-created node lies inside it. A moves down
  /// with its text re-created, and a new link with A's label comes in at A's place: refused; with A gone, kept.
  func testALivingControlHoldsItsReCreatedNode() {
    for keepA in [true, false] {
      let judgedNow = judged(Thread(twin: "Archive"), at: atText) { thread in
        thread.aText.destroy()
        if keepA {
          move(thread.a, by: CGVector(dx: 0, dy: 150))
          thread.a.add(Node("AXStaticText", CGRect(x: 30, y: 255, width: 60, height: 20), value: "Reply"))
        } else {
          thread.a.destroy()
        }
        return thread.insertAtA(role: "AXLink", label: "Reply").text
      }
      XCTAssertEqual(judgedNow.reason, keepA ? .nodeGone : .sameElement, keepA ? "A alive elsewhere" : "A gone")
    }
  }

  /// The review's finding 1, its role half (`twinbtn`): with the node's control gone, its text re-created under a control
  /// of another role is another control's, a link's text under a button or a clickable row's under a link; under one of
  /// the recorded role it is kept. A role or action-name read that fails on the way refuses.
  func testAReCreatedNodeUnderAControlOfAnotherRoleRefuses() {
    func replaced(pressable: Bool, role: String, actions: [String] = [], unread: Bool = false) -> StalePointReason {
      judged(Thread(twin: "Archive", pressable: pressable), at: atText) { thread in
        thread.aText.destroy()
        thread.a.destroy()
        let again = thread.insertAtA(role: role, label: "Reply")
        again.link.actions = actions
        again.link.actionsUnread = unread
        return again.text
      }.reason
    }
    XCTAssertEqual(replaced(pressable: false, role: "AXButton"), .nodeGone, "a link's text under a button")
    XCTAssertEqual(replaced(pressable: false, role: "AXLink"), .sameElement, "under a link again")
    XCTAssertEqual(replaced(pressable: false, role: "AXGroup", actions: ["AXPress"]), .nodeGone, "a link's text under a clickable row")
    XCTAssertEqual(replaced(pressable: true, role: "AXLink"), .nodeGone, "a clickable row's text under a link")
    XCTAssertEqual(replaced(pressable: true, role: "AXGroup", actions: ["AXPress"]), .sameElement, "under a clickable row again")
    XCTAssertEqual(replaced(pressable: true, role: "AXGroup", actions: ["AXPress"], unread: true), .nodeGone, "its action names unread")
  }

  /// The review's finding 2: #305's re-created identity of a hit, and the element route's, are refused by the record as
  /// #296's is. A surviving overlay group over A takes the point (a later sibling at A's depth); B slides into A's place.
  /// The overlay's own hit is #433's (`OverlayTargetTests`): an inert overlay refuses on A, and one that acts on its own
  /// keeps its point for the route's verdict.
  func testARecordedHitsReCreatedIdentityIsRefusedByTheRecordToo() {
    func overlaid(_ thread: Thread, pressable: Bool = false) -> Node {
      let overlay = Node("AXGroup", CGRect(x: 20, y: 100, width: 200, height: 30))
      if pressable { overlay.actions = ["AXPress"] }
      thread.list.add(overlay)
      return overlay
    }
    // B past the cap: the region not whole.
    for pressable in [false, true] {
      let capped = Thread()
      let overlay = overlaid(capped, pressable: pressable)
      let skipped: Set<ObjectIdentifier> = [ObjectIdentifier(capped.b)]
      let (nodes, frameless, members) = walkRecord(capped.window, skipping: skipped)
      XCTAssertTrue(deepestScreenshotNode(at: atLink, in: nodes)?.element === overlay)
      let moved = capped.slide(webkit: true).link
      XCTAssertEqual(verdict(nodes, frameless: frameless, members: members, at: atLink, hit: moved).reason, .interactiveHit, "the hit B")
      let atOverlay = verdict(nodes, frameless: frameless, members: members, at: atLink, hit: overlay)
      XCTAssertEqual(atOverlay.reason, pressable ? .sameElement : .nodeGone)
      if pressable { XCTAssertEqual(stalePointPressVerdict(moved, atOverlay, reads: reads).reason, .pressedOther, "the route pressing B") }
    }
    // B recorded with A's label: the same.
    let twin = Thread()
    _ = overlaid(twin)
    let (twinNodes, twinFrameless, twinMembers) = walkRecord(twin.window)
    XCTAssertEqual(verdict(twinNodes, frameless: twinFrameless, members: twinMembers, at: atLink, hit: twin.slide(webkit: true).link).reason,
                   .interactiveHit)
    // A re-rendered whole under the overlay, in a whole record with no twin: kept as A.
    let alone = Thread(twin: "Archive")
    _ = overlaid(alone)
    let (aloneNodes, aloneFrameless, aloneMembers) = walkRecord(alone.window)
    XCTAssertEqual(verdict(aloneNodes, frameless: aloneFrameless, members: aloneMembers, at: atLink, hit: alone.rerenderA().link).reason, .recordedHit)
  }

  /// The record keeps each node's control (`ScreenshotNode.control`): its nearest ancestor by an interactive role or
  /// AXPress, never past its web area.
  func testTheRecordKeepsEachNodesControl() {
    let thread = Thread()
    XCTAssertTrue(recorded(thread.window).first { $0.element === thread.aText }?.control === thread.a)
    XCTAssertNil(recorded(thread.window).first { $0.element === thread.a }?.control, "the list is no control")
    thread.page.actions = ["AXPress"]
    thread.window.actions = ["AXPress"]
    XCTAssertNil(recorded(thread.window).first { $0.element === thread.a }?.control, "not past the web area")
    thread.list.actions = ["AXPress"]
    XCTAssertTrue(recorded(thread.window).first { $0.element === thread.a }?.control === thread.list, "a control by its AXPress")
  }

  // MARK: The review of main..849bcdad

  /// A page of one list holding `children`, recorded; `change` runs after the observation and answers the hit.
  private func page(_ children: [Node], at point: CGPoint, change: (Node) -> Node?) -> StalePointVerdict<Node> {
    let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 600, height: 400))
    let web = Node("AXWebArea", CGRect(x: 0, y: 50, width: 600, height: 350))
    let list = Node("AXList", CGRect(x: 0, y: 80, width: 600, height: 300))
    window.add(web)
    web.add(list)
    for child in children { list.add(child) }
    let (nodes, frameless, members) = walkRecord(window)
    let hit = change(list)
    return verdict(nodes, frameless: frameless, members: members, at: point, hit: hit)
  }

  /// Finding 1: two "Reply" links inside one clickable group share it as their control, yet each is its own action: the
  /// other link is a twin. Only inert content of the node's own control is exempt.
  func testASameLabelSiblingThatActsOnItsOwnIsATwinUnderASharedControl() {
    let group = Node("AXGroup", CGRect(x: 0, y: 90, width: 600, height: 120))
    group.actions = ["AXPress"]
    let first = Node("AXLink", CGRect(x: 20, y: 100, width: 200, height: 30), title: "Reply")
    let second = Node("AXLink", CGRect(x: 20, y: 140, width: 200, height: 30), title: "Reply")
    group.add(first)
    group.add(second)
    XCTAssertEqual(page([group], at: atLink) { _ in
      first.destroy()
      second.destroy()
      let again = Node("AXLink", CGRect(x: 20, y: 100, width: 200, height: 30), title: "Reply")
      group.add(again)
      return again
    }.reason, .nodeGone)
  }

  /// Finding 2: the candidate's nearest control must be the recorded one, or none where the record had none: a clickable
  /// row's text re-created inside a new button in that row, and a plain text re-created inside a new button, refuse.
  func testTheCandidatesNearestControlMustBeTheRecordedOne() {
    let row = Node("AXGroup", CGRect(x: 20, y: 100, width: 200, height: 30))
    row.actions = ["AXPress"]
    let text = Node("AXStaticText", CGRect(x: 30, y: 105, width: 60, height: 20), value: "Reply")
    row.add(text)
    XCTAssertEqual(page([row], at: atText) { _ in
      text.destroy()
      let button = Node("AXButton", CGRect(x: 25, y: 102, width: 100, height: 26))
      let again = Node("AXStaticText", CGRect(x: 30, y: 105, width: 60, height: 20), value: "Reply")
      button.add(again)
      row.add(button)
      return again
    }.reason, .nodeGone, "a new button inside the surviving row")
    let plain = Node("AXStaticText", CGRect(x: 30, y: 105, width: 60, height: 20), value: "Reply")
    XCTAssertEqual(page([plain], at: atText) { list in
      plain.destroy()
      let button = Node("AXButton", CGRect(x: 25, y: 102, width: 100, height: 26))
      let again = Node("AXStaticText", CGRect(x: 30, y: 105, width: 60, height: 20), value: "Reply")
      button.add(again)
      list.add(button)
      return again
    }.reason, .nodeGone, "a plain text now inside a button")
    // An ancestor between the text and its control whose action names cannot be read refuses.
    let link = Node("AXLink", CGRect(x: 20, y: 100, width: 200, height: 30), title: "Reply")
    let inner = Node("AXStaticText", CGRect(x: 30, y: 105, width: 60, height: 20), value: "Reply")
    link.add(inner)
    XCTAssertEqual(page([link], at: atText) { _ in
      inner.destroy()
      let wrapper = Node("AXGroup", CGRect(x: 30, y: 105, width: 60, height: 20))
      wrapper.actionsUnread = true
      let again = Node("AXStaticText", CGRect(x: 30, y: 105, width: 60, height: 20), value: "Reply")
      wrapper.add(again)
      link.add(wrapper)
      return again
    }.reason, .nodeGone, "a wrapper's actions unread")
  }

  /// Finding 3: a node whose own handle still lives (its frame read failing) is not gone, so no re-created handle stands
  /// in for it: a top-level link, alive, and a new same-label link at its place.
  func testANodeWhoseHandleLivesIsNeverReCreated() {
    let thread = Thread(twin: "Archive")
    XCTAssertEqual(judged(thread, at: atLink) { thread in
      thread.a.frameUnread = true
      move(thread.a, by: CGVector(dx: 0, dy: 200))
      return thread.insertAtA(role: "AXLink", label: "Reply").link
    }.reason, .nodeGone)
  }

  /// Finding 4: #330's lookup keeps main's input, the count of the children recorded under each element, so its verdicts
  /// are main's: a wide list whose visible subset was recorded, and a text the page added over the point under it, is
  /// `newElementOverPoint`.
  func testTheNewElementRuleKeepsItsInput() {
    let thread = Thread(twin: "Archive")
    let other = Node("AXLink", CGRect(x: 20, y: 180, width: 200, height: 30), title: "More")
    other.parent = thread.list
    thread.list.visibleChildren = [thread.a, other]
    XCTAssertEqual(judged(thread, at: atLink) { thread in
      let over = Node("AXStaticText", CGRect(x: 20, y: 100, width: 200, height: 30), value: "Suggestion")
      thread.list.add(over)
      return over
    }.reason, .newElementOverPoint)
  }

  /// Finding 5: past a label read that failed at the observation, on either side, a lower-priority label does not rule a
  /// twin out: A and B both titled "Reply", their titles unread then, their descriptions differing.
  func testAnUnreadLabelNeverRulesATwinOut() {
    let thread = Thread()
    thread.a.description = "first"
    thread.b.description = "second"
    thread.a.unreadable = [.title]
    thread.b.unreadable = [.title]
    XCTAssertEqual(judged(thread, at: atLink) { thread in
      thread.a.unreadable = []
      let again = thread.rerenderA().link
      again.description = "first"
      return again
    }.reason, .nodeGone)
  }

  /// #500 (rulings 1083, 1131): A's title null at the observation (kCFNull, decoded so) and B's absent is a title unread
  /// on one side, which does not rule B out as a twin: refused. Both null is like with like, and the differing
  /// descriptions rule B out: the re-created A is taken.
  func testANullTitleOnOneSideNeverRulesATwinOut() {
    func judgedNull(_ bNull: Bool) -> StalePointVerdict<Node> {
      let thread = Thread()
      thread.a.description = "first"
      thread.b.description = "second"
      thread.a.null = [.title]
      if bNull { thread.b.null = [.title] } else { thread.b.title = nil }
      return judged(thread, at: atLink) { thread in
        let again = thread.rerenderA().link
        again.description = "first"
        return again
      }
    }
    XCTAssertEqual(judgedNull(false).reason, .nodeGone, "one-sided null: a twin")
    let both = judgedNull(true)
    XCTAssertFalse(both.refused, "both null: compared by the description, no twin (\(both.reason))")
    XCTAssertEqual(both.identity, .recreated)
  }

  /// Finding 6: an element whose role failed to read at the observation (recorded as AXUnknown) may be of the node's
  /// role, so it counts as a twin; and as a control of unknown kind, so a node under it is not re-created.
  func testAnUnreadRoleCountsAsATwinAndAnUnknownControl() {
    let twin = Thread()
    twin.b.roleUnread = true
    let (nodes, frameless, members) = walkRecord(twin.window)
    twin.b.roleUnread = false
    XCTAssertEqual(verdict(nodes, frameless: frameless, members: members, at: atLink, hit: twin.rerenderA().link).reason, .nodeGone, "a twin")
    let control = Thread(twin: "Archive")
    control.a.roleUnread = true
    let (controlNodes, controlFrameless, controlMembers) = walkRecord(control.window)
    control.a.roleUnread = false
    control.aText.destroy()
    let again = Node("AXStaticText", CGRect(x: 30, y: 105, width: 60, height: 20), value: "Reply")
    control.a.add(again)
    XCTAssertEqual(verdict(controlNodes, frameless: controlFrameless, members: controlMembers, at: atText, hit: again).reason, .nodeGone,
                   "an unknown control")
  }

  /// Finding 7: the candidate's nearest web area must be the node's: a same-label link in an iframe's document laid at
  /// A's place is another document's.
  func testACandidateInAnotherDocumentRefuses() {
    XCTAssertEqual(judged(Thread(twin: "Archive"), at: atLink) { thread in
      thread.aText.destroy()
      thread.a.destroy()
      let frame = Node("AXWebArea", CGRect(x: 0, y: 90, width: 600, height: 100))
      let link = Node("AXLink", CGRect(x: 20, y: 100, width: 200, height: 30), title: "Reply")
      frame.add(link)
      thread.list.children.insert(frame, at: 0)
      frame.parent = thread.list
      return link
    }.reason, .nodeGone)
  }

  /// Finding 8: a candidate the record holds as another node is that node, never the gone one re-created: B, recorded as
  /// "Archive", slides into A's place on its own handle and its title fails to read now.
  func testACandidateTheRecordHoldsAsAnotherNodeRefuses() {
    XCTAssertEqual(judged(Thread(twin: "Archive"), at: atLink) { thread in
      thread.slide()
      thread.b.unreadable = [.title]
      return thread.b
    }.reason, .nodeGone)
  }

  /// Finding 9: an element two parents list (Chromium's cell, under its row and its column) is recorded once; the column
  /// that lists it is whole by membership, so a genuine re-creation on that page stays kept.
  func testCoverageIsByMembershipWhereTheHandlesAreKnown() {
    let thread = Thread(twin: "Archive")
    let row = Node("AXRow", CGRect(x: 0, y: 300, width: 600, height: 30))
    let cell = Node("AXCell", CGRect(x: 0, y: 300, width: 100, height: 30))
    row.add(cell)
    let column = Node("AXColumn", CGRect(x: 0, y: 300, width: 100, height: 30))
    column.children = [cell]
    thread.page.add(row)
    thread.page.add(column)
    XCTAssertEqual(recorded(thread.window).first { $0.element === thread.aText }?.regionCovered, true)
    XCTAssertEqual(judged(thread, at: atLink) { $0.rerenderA().link }.identity, .recreated)
  }

  /// Finding 2's other edges: once the node's control is gone, its text re-created with no control at all, or inside
  /// another link the record holds (B, moved up), is not the node; a parent whose role cannot be read now refuses.
  func testAGoneControlsTextIsReCreatedOnlyUnderANewControlOfItsRole() {
    XCTAssertEqual(judged(Thread(twin: "Archive"), at: atText) { thread in
      thread.aText.destroy()
      thread.a.destroy()
      let text = Node("AXStaticText", CGRect(x: 30, y: 105, width: 60, height: 20), value: "Reply")
      thread.list.children.insert(text, at: 0)
      text.parent = thread.list
      return text
    }.reason, .nodeGone, "no control now")
    XCTAssertEqual(judged(Thread(twin: "Archive"), at: atText) { thread in
      thread.slide()
      thread.bText.destroy()
      let text = Node("AXStaticText", CGRect(x: 30, y: 105, width: 60, height: 20), value: "Reply")
      thread.b.add(text)
      return text
    }.reason, .nodeGone, "inside a link the record holds")
    XCTAssertEqual(judged(Thread(twin: "Archive"), at: atText) { thread in
      let again = thread.rerenderA()
      again.link.roleUnread = true
      return again.text
    }.reason, .nodeGone, "its new link's role unread")
  }

  /// A node whose own control is of its role and carries a label (a plain group in a clickable row titled "Reply") is not
  /// its own twin's: the control is exempt, so the group re-created in the row is kept.
  func testTheNodesOwnControlIsNoTwin() {
    let row = Node("AXGroup", CGRect(x: 20, y: 100, width: 200, height: 30), title: "Reply")
    row.actions = ["AXPress"]
    let inner = Node("AXGroup", CGRect(x: 30, y: 105, width: 60, height: 20))
    row.add(inner)
    XCTAssertEqual(page([row], at: atText) { _ in
      inner.destroy()
      let again = Node("AXGroup", CGRect(x: 30, y: 105, width: 60, height: 20))
      row.add(again)
      return again
    }.identity, .recreated)
  }

  /// Finding 4 of the earlier review, at its edge: a wrapper whose action names failed at the observation, though inert,
  /// leaves the node's control unknown, so its text re-created there refuses even where nothing says otherwise now.
  func testAnInertWrapperUnreadThenStillRefuses() {
    let thread = Thread(twin: "Archive")
    let wrapper = Node("AXGroup", CGRect(x: 30, y: 105, width: 60, height: 20))
    thread.list.children.removeAll { $0 === thread.a }
    thread.list.children.insert(wrapper, at: 0)
    wrapper.parent = thread.list
    thread.a.children.removeAll { $0 === thread.aText }
    wrapper.add(thread.aText)
    wrapper.actionsUnread = true
    let (nodes, frameless, members) = walkRecord(thread.window)
    wrapper.actionsUnread = false
    thread.aText.destroy()
    let again = Node("AXStaticText", CGRect(x: 30, y: 105, width: 60, height: 20), value: "Reply")
    wrapper.add(again)
    XCTAssertEqual(nodes.first { $0.element === again || $0.element === thread.aText }?.controlUnknown, true)
    XCTAssertEqual(verdict(nodes, frameless: frameless, members: members, at: atText, hit: again).reason, .nodeGone)
  }

  // MARK: The review of 849bcdad..38a55469

  /// Item 1: the record holds a candidate frameless at the observation too, by the screenshot's whole handle map: B,
  /// recorded without a frame as "Archive", gains one at A's place with its title unread now. #296's path and #305's.
  func testACandidateTheRecordHeldFramelessRefuses() {
    for viaHit in [false, true] {
      let thread = Thread(twin: "Archive")
      let bFrame = thread.b.frame
      thread.b.frame = nil
      var overlay: Node?
      if viaHit {
        let veil = Node("AXGroup", CGRect(x: 20, y: 100, width: 200, height: 30))
        veil.actions = ["AXPress"]  // a veil that acts on its own, which #433 leaves to the route's verdict
        thread.list.add(veil)
        overlay = veil
      }
      let (nodes, frameless, members) = walkRecord(thread.window)
      XCTAssertNil(nodes.first { $0.element === thread.b }, "B frameless: no framed node")
      XCTAssertNotNil(members(thread.b), "B in the handle map")
      thread.b.frame = bFrame
      thread.slide()
      thread.b.unreadable = [.title]
      let judgedNow = verdict(nodes, frameless: frameless, members: members, at: atLink, hit: thread.b)
      XCTAssertEqual(judgedNow.reason, viaHit ? .interactiveHit : .nodeGone, viaHit ? "#305's path" : "#296's path")
      if let overlay {
        let kept = verdict(nodes, frameless: frameless, members: members, at: atLink, hit: overlay)
        XCTAssertEqual(stalePointPressVerdict(thread.b, kept, reads: reads).reason, .pressedOther, "the route pressing B")
      }
    }
  }

  /// Item 3: a re-created match the record refuses is judged on as main judges it, so #330's refusal keeps its reason: B,
  /// with A's label, slides into A's place and the page adds a text inside it over the point. Kept by every other rule, it
  /// is refused as gone.
  func testARefusedReCreatedMatchKeepsAnotherRulesReasonAndNeverCarries() {
    let added = judged(Thread(), at: atLink) { thread in
      thread.slide()
      let over = Node("AXStaticText", CGRect(x: 120, y: 105, width: 80, height: 20), value: "Suggestion")
      thread.b.add(over)
      return over
    }
    XCTAssertEqual(added.reason, .newElementOverPoint)
    let gone = judged(Thread(), at: atLink) { $0.slide().link }
    XCTAssertEqual(gone.reason, .nodeGone, "kept by every other rule: refused")
    XCTAssertNil(gone.identity)
    XCTAssertNil(gone.current)
    XCTAssertEqual(stalePointPressVerdict(gone.hit!, gone, reads: reads).reason, .nodeGone, "the route carries nothing")
  }

  /// Item 2: the observation reads action names as the click does, kAXErrorNoValue being none, so a text with no actions
  /// is inert content of its link: one of two "Reply" fragments of a surviving link, re-created, is kept as on main; a
  /// fragment whose action names failed to read is not known to be inert, and refuses.
  func testActionNamesReadAtTheObservationAsAtTheClick() {
    XCTAssertEqual(decodedActionNames(.success, ["AXPress"] as CFArray), ["AXPress"])
    XCTAssertEqual(decodedActionNames(.success, nil), [])
    XCTAssertEqual(decodedActionNames(.noValue, nil), [], "no actions")
    XCTAssertNil(decodedActionNames(.cannotComplete, nil), "unread")
    XCTAssertNil(decodedActionNames(.failure, nil))
    // The walk's reader (`ElementSource.actions`) decodes the same way.
    let source = AnsweringSource()
    let element = AXUIElementCreateApplication(990_431)
    for (error, failed) in [(AXError.noValue, false), (.success, false), (.cannotComplete, true)] {
      source.answer = (error, nil)
      XCTAssertEqual(source.actions(element), [])
      XCTAssertEqual(source.actionsFailed(element), failed, "\(error.rawValue)")
    }
    for unread in [false, true] {
      let thread = Thread(twin: "Archive")
      let second = Node("AXStaticText", CGRect(x: 100, y: 105, width: 60, height: 20), value: "Reply")
      thread.a.add(second)
      second.actionsUnread = unread
      let (nodes, frameless, members) = walkRecord(thread.window)
      second.actionsUnread = false
      thread.aText.destroy()
      let again = Node("AXStaticText", CGRect(x: 30, y: 105, width: 60, height: 20), value: "Reply")
      thread.a.children.insert(again, at: 0)
      again.parent = thread.a
      XCTAssertEqual(verdict(nodes, frameless: frameless, members: members, at: atText, hit: again).reason, unread ? .nodeGone : .sameElement,
                     unread ? "the other fragment's actions unread" : "both fragments inert")
    }
  }

  // MARK: #435: a twin recorded without a frame

  /// Leaves B and its text frameless for the observation, as the walk reads an element without AXPosition and AXSize (a
  /// hidden or collapsed control, one not yet laid out); the returned closure gives them their frames back.
  private func unframe(_ thread: Thread) -> () -> Void {
    let (link, text) = (thread.b.frame, thread.bText.frame)
    (thread.b.frame, thread.bText.frame) = (nil, nil)
    return { (thread.b.frame, thread.bText.frame) = (link, text) }
  }

  /// A twin the record holds without a frame refuses as a framed one does: B and its text, with A's label, read no frame
  /// at the observation and take A's place with one, on their own handles or on new ones (Safari's), at the text and at
  /// the link. The record carries what the twin search reads of them: role, label, web area and control.
  func testATwinRecordedFramelessRefuses() throws {
    let shape = Thread()
    _ = unframe(shape)
    let (nodes, frameless, _) = walkRecord(shape.window)
    XCTAssertFalse(nodes.contains { $0.element === shape.b || $0.element === shape.bText }, "no framed node")
    let link = try XCTUnwrap(frameless.first { $0.element === shape.b })
    let text = try XCTUnwrap(frameless.first { $0.element === shape.bText })
    XCTAssertEqual(link.role, "AXLink")
    XCTAssertEqual(link.title, "Reply")
    XCTAssertTrue(link.webArea === shape.page)
    XCTAssertNil(link.shown)
    XCTAssertEqual(text.value, "Reply")
    XCTAssertTrue(text.control === shape.b)
    XCTAssertEqual(text.actionable, false)
    for (name, point, atText) in points {
      for webkit in [false, true] {
        let thread = Thread()
        let restore = unframe(thread)
        let judgedNow = judged(thread, at: point) { thread in
          restore()
          let moved = thread.slide(webkit: webkit)
          return atText ? moved.text : moved.link
        }
        XCTAssertEqual(judgedNow.reason, .nodeGone, "\(name), \(webkit ? "new handles" : "its own handles")")
        XCTAssertNil(judgedNow.identity)
      }
    }
  }

  /// The filter is the match's own: a frameless element of another role, or whose label disagrees, is no twin, and
  /// neither is frameless inert content of the node's own control; A re-rendered beside each stays kept.
  func testAFramelessElementTheMatchCouldNotTakeForTheNodeIsNoTwin() {
    for (name, point, atText) in points {
      let archive = Thread(twin: "Archive")
      _ = unframe(archive)
      let button = Thread(twin: "Archive")
      button.list.add(Node("AXButton", nil, title: "Reply"))
      button.list.add(Node("AXButton", nil, [Node("AXStaticText", nil, value: "Archive")]))
      for (other, thread) in [("B frameless as \"Archive\"", archive), ("frameless buttons", button)] {
        var again: (link: Node, text: Node)?
        let kept = judged(thread, at: point) { thread in
          again = thread.rerenderA()
          return atText ? again?.text : again?.link
        }
        XCTAssertEqual(kept.identity, .recreated, "\(name), \(other)")
        XCTAssertEqual(kept.reason, .sameElement, "\(name), \(other)")
      }
    }
    // A second "Reply" text inside A's link, frameless: inert content of the node's own control.
    let thread = Thread(twin: "Archive")
    thread.a.add(Node("AXStaticText", nil, value: "Reply"))
    let kept = judged(thread, at: atText) { thread in
      thread.aText.destroy()
      let again = Node("AXStaticText", CGRect(x: 30, y: 105, width: 60, height: 20), value: "Reply")
      thread.a.children.insert(again, at: 0)
      again.parent = thread.a
      return again
    }
    XCTAssertEqual(kept.reason, .sameElement, "inert content of A")
    XCTAssertEqual(kept.identity, .recreated)
  }

  /// #305's re-created identity of a hit, and the element route's, read the frameless twins too: under a surviving
  /// overlay over A, B (frameless, A's label) slides into A's place on new handles. An inert overlay's own hit refuses
  /// on A (#433); one that acts on its own (AXPress) keeps its point, and the route pressing B is refused.
  func testAFramelessTwinRefusesARecordedHitsReCreatedIdentity() {
    for pressable in [false, true] {
      let thread = Thread()
      let overlay = Node("AXGroup", CGRect(x: 20, y: 100, width: 200, height: 30))
      if pressable { overlay.actions = ["AXPress"] }
      thread.list.add(overlay)
      _ = unframe(thread)
      let (nodes, frameless, members) = walkRecord(thread.window)
      let moved = thread.slide(webkit: true).link
      XCTAssertEqual(verdict(nodes, frameless: frameless, members: members, at: atLink, hit: moved).reason, .interactiveHit, "the hit B")
      let atOverlay = verdict(nodes, frameless: frameless, members: members, at: atLink, hit: overlay)
      XCTAssertEqual(atOverlay.reason, pressable ? .sameElement : .nodeGone)
      if pressable { XCTAssertEqual(stalePointPressVerdict(moved, atOverlay, reads: reads).reason, .pressedOther, "the route pressing B") }
    }
  }

  /// A page of texts under one web area, each labelled as given (`unread`: its value's read failed), the first `framed`
  /// framed and the rest frameless, as the record holds them, the framed ones first.
  private func texts(_ labels: [(value: String?, title: String?, unread: Bool)], framed: Int) -> [ScreenshotNode<Node>] {
    let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 600, height: 400))
    let web = Node("AXWebArea", CGRect(x: 0, y: 0, width: 600, height: 400))
    window.add(web)
    for (index, label) in labels.enumerated() {
      let text = Node("AXStaticText", index < framed ? CGRect(x: 0, y: CGFloat(index % 300), width: 50, height: 1) : nil, title: label.title,
                      value: label.value)
      if label.unread { text.unreadable = [.value] }
      web.add(text)
    }
    let (nodes, frameless, _) = walkRecord(window)
    return (nodes + frameless).filter { $0.role == "AXStaticText" }
  }

  /// #435's review of 66ae2e8d: the search takes the node's words once, and its verdicts are the per-peer rule's. For each
  /// node, each peer is judged after every peer that is no twin of it, in one search, as the rule judges it alone.
  func testTheTwinSearchJudgesAsThePerPeerRule() {
    let labels: [(value: String?, title: String?, unread: Bool)] = [
      ("Reply", nil, false), ("reply!", nil, false), ("Reply 3", nil, false), ("Archive", nil, false), (nil, nil, false), ("", nil, false),
      ("Like (12)", nil, false), ("Like (13)", nil, false), ("Reply", "Send", false), (nil, "Send", false), ("Archive", nil, true),
      ("3:21 PM", nil, false), ("Reply all", nil, false),
    ]
    let nodes = texts(labels, framed: labels.count)
    var twins = 0
    for node in nodes {
      let peers = nodes.filter { $0.element !== node.element }
      let others = peers.filter { !recreatedTwin($0, of: node, reads) }
      for peer in peers {
        let alone = recreatedTwin(peer, of: node, reads)
        twins += alone ? 1 : 0
        XCTAssertEqual(recreatedTwinFound(of: node, among: [others, [peer]], reads), alone,
                       "\(node.value ?? "nil")/\(node.title ?? "nil") against \(peer.value ?? "nil")/\(peer.title ?? "nil")")
      }
      XCTAssertEqual(recreatedTwinFound(of: node, among: [others], reads), false)
    }
    XCTAssertGreaterThan(twins, 0, "the matrix holds twins")
  }

  /// The same review: thousands of frameless texts that are no twin of a long text take its words once, not once each.
  func testTheTwinSearchTakesTheNodesWordsOnce() {
    let long = String(repeating: "lorem ipsum ", count: 1_000)
    let page = texts([(long, nil, false)] + (0..<3_000).map { ("peer \($0)", nil, false) }, framed: 1)
    let (node, peers) = (page[0], Array(page.dropFirst()))
    XCTAssertEqual(peers.count, 3_000)
    XCTAssertTrue(peers.allSatisfy { $0.frame.isNull }, "frameless")
    var taken = 0
    let found = recreatedTwinFound(of: node, among: [[], peers], reads) { text in
      taken += 1
      return stalePointLabelWords(text)
    }
    XCTAssertFalse(found)
    XCTAssertEqual(taken, 1)
  }
}

// MARK: #433: a click recorded on a click-through overlay

/// #433 (found by #431's qualification, cell `twincover`): the record holds a transparent overlay at the point, not the
/// link under it. The link is removed and a same-label link slides into its place; the overlay lives on its own handle,
/// so #296 kept the point, and the click passed through the overlay to the new link (Electron, 22/22). A point kept at a
/// node that does not act on its own, by a hit that names no interactive element, is judged again at the recorded control
/// beneath it (`underlyingTarget`).
final class OverlayTargetTests: XCTestCase {
  /// A list of two links, A ("Open") and B (by default with A's label, another destination: a twin), each around its
  /// text, and an overlay laid over A after them: a plain group at A's depth (the later of the two at the point), or,
  /// `deeper`, a group holding a decorative image the record takes at the point. `layer`: the overlay lies in a layer of
  /// its own after the list (a sibling branch), at A's depth; `bare`: no overlay at all; `pressable`: each row a plain
  /// group that is a control by its AXPress (a clickable div), not a link.
  private final class Page {
    let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 600, height: 400))
    let page = Node("AXWebArea", CGRect(x: 0, y: 50, width: 600, height: 350))
    let list = Node("AXList", CGRect(x: 0, y: 80, width: 600, height: 200))
    let a: Node
    let aText = Node("AXStaticText", CGRect(x: 30, y: 105, width: 60, height: 20), value: "Open")
    let b: Node
    let bText: Node
    let overlay: Node
    let image = Node("AXImage", CGRect(x: 100, y: 100, width: 120, height: 30))
    let pressable: Bool
    init(twin: String = "Open", overlay role: String = "AXGroup", deeper: Bool = false, layer: Bool = false, bare: Bool = false,
         pressable: Bool = false) {
      self.pressable = pressable
      a = Node(pressable ? "AXGroup" : "AXLink", CGRect(x: 20, y: 100, width: 200, height: 30), title: "Open")
      b = Node(pressable ? "AXGroup" : "AXLink", CGRect(x: 20, y: 140, width: 200, height: 30), title: twin)
      if pressable { (a.actions, b.actions) = (["AXPress"], ["AXPress"]) }
      bText = Node("AXStaticText", CGRect(x: 30, y: 145, width: 60, height: 20), value: twin)
      overlay = Node(role, CGRect(x: 20, y: 100, width: 200, height: 30))
      window.add(page)
      page.add(list)
      list.add(a)
      a.add(aText)
      list.add(b)
      b.add(bText)
      if layer {
        let group = Node("AXGroup", CGRect(x: 0, y: 80, width: 600, height: 200))
        page.add(group)
        group.add(overlay)
      } else if !bare {
        list.add(overlay)
      }
      if deeper { overlay.add(image) }
    }
    /// The list rebuilt in place: a new list holding A re-rendered and B on its own handle.
    @discardableResult func rebuildList() -> Node {
      let again = rerenderA()
      let fresh = Node("AXList", list.frame)
      for child in list.children { fresh.add(child) }
      list.children = []
      list.destroy()
      page.children.insert(fresh, at: 0)
      fresh.parent = page
      return again
    }
    /// A removed and B slid up into its place; `webkit`: as Safari, B answers a new handle there.
    @discardableResult func slide(webkit: Bool) -> Node {
      aText.destroy()
      a.destroy()
      guard webkit else {
        move(b, by: CGVector(dx: 0, dy: -40))
        return b
      }
      let label = b.title
      bText.destroy()
      b.destroy()
      return insertAtA(label: label)
    }
    /// A re-rendered whole in place: a new link around a new text, A's label and frames.
    @discardableResult func rerenderA() -> Node {
      aText.destroy()
      a.destroy()
      return insertAtA(label: "Open")
    }
    private func insertAtA(label: String?) -> Node {
      let link = Node(pressable ? "AXGroup" : "AXLink", CGRect(x: 20, y: 100, width: 200, height: 30), title: label)
      if pressable { link.actions = ["AXPress"] }
      link.add(Node("AXStaticText", CGRect(x: 30, y: 105, width: 60, height: 20), value: label))
      list.children.insert(link, at: 0)
      link.parent = list
      return link
    }
  }
  /// The model's point on A, beside its text: under the overlay.
  private let atLink = CGPoint(x: 150, y: 115)

  private func judged(_ page: Page, at point: CGPoint? = nil, shift: CGVector = .zero, change: (Page) -> Node?) -> StalePointVerdict<Node> {
    let (nodes, frameless, members) = walkRecord(page.window)
    let hit = change(page)
    return verdict(nodes, frameless: frameless, members: members, at: point ?? atLink, shift: shift, hit: hit)
  }

  /// `twincover`: B slides into A's place under the overlay, on its own handle (Electron, CfT) or a new one (Safari), with
  /// the overlay recorded at the point or a decorative image inside it. Whatever the hit answers now that names no control
  /// (the overlay, its image, nothing), the point refuses on A, gone with only a twin in its place; a hit on B refuses as
  /// before. The refusal names A.
  func testTwincoverRefusesWhereverTheHitLands() {
    for deeper in [false, true] {
      for webkit in [false, true] {
        let shape = Page(deeper: deeper)
        let chosen = deepestScreenshotNode(at: atLink, in: recorded(shape.window))
        XCTAssertTrue(chosen?.element === (deeper ? shape.image : shape.overlay), "the record at the point is the overlay's")
        let name = "\(deeper ? "the image" : "the overlay") recorded, \(webkit ? "new handles" : "own handles")"
        for hit in ["overlay", "image", "none"] where deeper || hit != "image" {
          let refused = judged(Page(deeper: deeper)) { page in
            page.slide(webkit: webkit)
            return hit == "overlay" ? page.overlay : hit == "image" ? page.image : nil
          }
          XCTAssertEqual(refused.reason, .nodeGone, "\(name), the hit \(hit)")
          XCTAssertEqual(refused.underlying?.role, "AXLink", name)
          XCTAssertNil(refused.underlyingIdentity, name)
          XCTAssertEqual(StalePointRecord(refused, ms: 0).wire["underlyingRole"] as? String, "AXLink")
          let sentence = stalePointOutcome(refused, ms: 0, reads: reads).refusal?.message
          XCTAssertTrue(sentence?.contains("over the AXLink \"Open\" the screenshot showed there, which a click passes through to; that control is gone or was replaced") == true, "\(name): \(sentence ?? "nil")")
        }
        let onB = judged(Page(deeper: deeper)) { $0.slide(webkit: webkit) }
        XCTAssertEqual(onB.reason, .interactiveHit, "\(name), the hit B")
        XCTAssertNil(onB.underlying, "a hit on a control is judged by #296 and #305")
      }
    }
  }

  /// The control case: an overlay over an unchanged A (a tooltip layer, a focus ring) is kept with the reason the overlay
  /// alone gives, A found on its own handle; a window that only moved changes nothing. A hit through to A is #305's.
  func testAnOverlayOverAnUnchangedLinkIsKept() {
    for deeper in [false, true] {
      for hit in ["overlay", "image", "none"] where deeper || hit != "image" {
        let kept = judged(Page(deeper: deeper)) { page in hit == "overlay" ? page.overlay : hit == "image" ? page.image : nil }
        XCTAssertFalse(kept.refused, "the hit \(hit)")
        // The overlay alone: its own hit, or (under its recorded image) a hit on itself that is not interactive.
        let alone: StalePointReason = hit == "none" ? .noHit : deeper && hit == "overlay" ? .nonInteractiveHit : .sameElement
        XCTAssertEqual(kept.reason, alone, "the hit \(hit)")
        XCTAssertEqual(kept.underlying?.title, "Open")
        XCTAssertEqual(kept.underlyingIdentity, .handle)
        XCTAssertEqual(StalePointRecord(kept, ms: 0).wire["underlyingIdentity"] as? String, "handle")
      }
    }
    let shift = CGVector(dx: 300, dy: 40)
    let moved = judged(Page(), at: CGPoint(x: atLink.x + shift.dx, y: atLink.y + shift.dy), shift: shift) { page in
      move(page.window, by: shift)
      return page.overlay
    }
    XCTAssertEqual(moved.reason, .sameElement)
    XCTAssertEqual(moved.underlyingIdentity, .handle)
    let through = judged(Page()) { $0.a }
    XCTAssertEqual(through.reason, .recordedHit)
    XCTAssertNil(through.underlying)
  }

  /// A click-catching backdrop (a modal's scrim, no interactive role, no AXPress) over a live, unchanged link: kept as the
  /// backdrop alone keeps it, whether the record takes the backdrop at the point (at the link's depth) or the link (the
  /// backdrop shallower). AX cannot tell a backdrop that eats the click from an overlay that passes it on (ruling 903).
  func testABackdropOverALiveLinkIsKeptAsBefore() {
    let page = Page(twin: "Archive")
    let scrim = Node("AXGroup", CGRect(x: 0, y: 80, width: 600, height: 200))
    page.list.add(scrim)
    let (nodes, frameless, members) = walkRecord(page.window)
    XCTAssertTrue(deepestScreenshotNode(at: CGPoint(x: 300, y: 250), in: nodes)?.element === scrim)
    for (point, hit) in [(atLink, scrim), (atLink, nil), (CGPoint(x: 300, y: 250), scrim)] as [(CGPoint, Node?)] {
      let kept = verdict(nodes, frameless: frameless, members: members, at: point, hit: hit)
      XCTAssertFalse(kept.refused)
      XCTAssertEqual(kept.reason, hit == nil ? .noHit : .sameElement)
    }
    let shallow = Page(twin: "Archive")
    shallow.list.children.removeAll { $0 === shallow.overlay }
    let veil = Node("AXGroup", CGRect(x: 0, y: 50, width: 600, height: 350))
    shallow.page.add(veil)
    let (shallowNodes, shallowFrameless, shallowMembers) = walkRecord(shallow.window)
    let kept = verdict(shallowNodes, frameless: shallowFrameless, members: shallowMembers, at: CGPoint(x: 150, y: 125), hit: veil)
    XCTAssertTrue(kept.node?.element === shallow.a, "the link is deeper than the backdrop")
    XCTAssertEqual(kept.reason, .nonInteractiveHit)
    XCTAssertNil(kept.underlying)
  }

  /// An overlay with nothing interactive under it is kept as today, and so is a node whose only control at the point is
  /// its own ancestor (a link's text: the guard vouches for the link through it).
  func testNothingInteractiveUnderTheNodeChangesNothing() {
    let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 600, height: 400))
    let web = Node("AXWebArea", CGRect(x: 0, y: 50, width: 600, height: 350))
    let paragraph = Node("AXStaticText", CGRect(x: 20, y: 100, width: 400, height: 40), value: "Terms")
    let overlay = Node("AXGroup", CGRect(x: 20, y: 100, width: 400, height: 40))
    window.add(web)
    web.add(paragraph)
    web.add(overlay)
    let (nodes, frameless, members) = walkRecord(window)
    paragraph.destroy()
    let kept = verdict(nodes, frameless: frameless, members: members, at: CGPoint(x: 100, y: 120), hit: overlay)
    XCTAssertEqual(kept.reason, .sameElement)
    XCTAssertNil(kept.underlying)
    let page = Page()
    let text = deepestScreenshotNode(at: CGPoint(x: 40, y: 112), in: recorded(page.window))
    XCTAssertTrue(text?.element === page.aText)
    XCTAssertTrue(underlyingTargets(of: text!, current: page.aText, at: CGPoint(x: 40, y: 112), in: recorded(page.window), reads).isEmpty,
                  "A is the text's own link")
    let atText = judged(Page(), at: CGPoint(x: 40, y: 112)) { $0.aText }
    XCTAssertEqual(atText.reason, .sameElement)
    XCTAssertNil(atText.underlying)
  }

  /// An overlay that acts on its own (a button, a group with AXPress) is the click's target, judged as today: kept on its
  /// own handle while B slides under it.
  func testAnInteractiveOverlayIsUnchanged() {
    for (role, pressable) in [("AXButton", false), ("AXGroup", true)] {
      let page = Page(overlay: role)
      if pressable { page.overlay.actions = ["AXPress"] }
      let kept = judged(page) { page in
        page.slide(webkit: false)
        return page.overlay
      }
      XCTAssertEqual(kept.reason, .sameElement, role)
      XCTAssertNil(kept.underlying, role)
    }
    // A node whose actions did not read is not known to act: the control beneath is judged.
    let unread = Page()
    unread.overlay.actionsUnread = true
    XCTAssertEqual(judged(unread) { page in
      page.slide(webkit: false)
      return page.overlay
    }.reason, .nodeGone)
  }

  /// A failed read on the control beneath refuses: its frame unread while its handle lives (#431's refusal 3), whatever the
  /// hit; its frame read off the point, or its label's words changed on its own handle (#298), refuse with their reasons.
  func testTheControlBeneathIsJudgedAsARecordedNode() {
    for hit in ["overlay", "none"] {
      let unread = Page(twin: "Archive")
      XCTAssertEqual(judged(unread) { page in
        page.a.frameUnread = true
        return hit == "overlay" ? page.overlay : nil
      }.reason, .nodeGone, "the hit \(hit)")
    }
    let away = judged(Page(twin: "Archive")) { page in
      move(page.a, by: CGVector(dx: 0, dy: 60))
      return page.overlay
    }
    XCTAssertEqual(away.reason, .frameMoved)
    XCTAssertEqual(away.underlyingIdentity, .handle)
    let relabelled = judged(Page(twin: "Archive")) { page in
      page.a.title = "Delete"
      return page.overlay
    }
    XCTAssertEqual(relabelled.reason, .relabelled)
    XCTAssertEqual(stalePointOutcome(relabelled, ms: 0, reads: reads).refusal?.message.contains("over the AXLink \"Open\" the screenshot showed there, which a click passes through to; that control now reads \"Delete\""), true)
    // The hit inside A (its text), A's frame unread: the point reaches it.
    XCTAssertFalse(judged(Page(twin: "Archive")) { page in
      page.a.frameUnread = true
      return page.aText
    }.refused)
  }

  /// A beneath the overlay re-rendered whole in a record that covered it with no twin is found among its recorded
  /// parent's children (the hit on the overlay reaches nothing under it) and kept; with a twin, or past the record's
  /// coverage, #431 refuses it; re-rendered off the point, it refuses as moved.
  func testAReCreatedControlBeneathIsTheRecordsToJudge() {
    let kept = judged(Page(twin: "Archive")) { page in
      page.rerenderA()
      return page.overlay
    }
    XCTAssertEqual(kept.reason, .sameElement)
    XCTAssertEqual(kept.underlyingIdentity, .recreated)
    XCTAssertEqual(judged(Page()) { page in
      page.rerenderA()
      return page.overlay
    }.reason, .nodeGone, "a twin in the record")
    let capped = Page(twin: "Archive")
    let (nodes, frameless, members) = walkRecord(capped.window, skipping: [ObjectIdentifier(capped.b)])
    capped.rerenderA()
    XCTAssertEqual(verdict(nodes, frameless: frameless, members: members, at: atLink, hit: capped.overlay).reason, .nodeGone, "coverage")
    // Re-created 2 pt up, so its frame no longer holds a point at the recorded bottom edge.
    let shifted = judged(Page(twin: "Archive"), at: CGPoint(x: 150, y: 129)) { page in
      page.rerenderA().frame = CGRect(x: 20, y: 98, width: 200, height: 30)
      return page.overlay
    }
    XCTAssertEqual(shifted.reason, .frameMoved)
    XCTAssertEqual(shifted.underlyingIdentity, .recreated)
  }

  /// The review of 0f79602f, item 3 (a regression against main): A's list rebuilt in place around A re-rendered, the
  /// overlay alive in a layer of its own beside the list and the hit on it. A's recorded parent is gone, so A is looked
  /// for from its nearest recorded ancestor that survives (the web area) and kept as main keeps the point; with a twin in
  /// the record, #431 still refuses it. The overlay carried over into the new list is the same.
  func testAControlBeneathWhoseParentWasRebuiltIsFoundFromASurvivingAncestor() {
    for layer in [true, false] {
      let kept = judged(Page(twin: "Archive", layer: layer)) { page in
        page.rebuildList()  // without a layer, the overlay is carried over into the new list on its handle
        return page.overlay
      }
      XCTAssertEqual(kept.reason, .sameElement, layer ? "a layer of its own" : "carried over")
      XCTAssertEqual(kept.underlyingIdentity, .recreated)
    }
    XCTAssertEqual(judged(Page(layer: true)) { page in
      page.rebuildList()
      return page.overlay
    }.reason, .nodeGone, "a twin in the record")
  }

  // MARK: #443: an inert node that outlived its recorded control (kit `probe/433-qual`, `decomove`, run 44715767925: a
  // decoration moved from replaced link A into its replacement B, kept 40/40 on main on CfT and Electron). #433's check of
  // the control beneath does not run for it (an acting control above it in the record); `controlGoneVerdict` does.

  /// `decomove`: A replaced by B at its place, the decoration (an image the size of the link, or A's own text) moved into
  /// B on its own handle, A's handle destroyed. Whatever the hit answers (the decoration, B around it, nothing), the point
  /// refuses `controlGone`, A confirmed gone; so with A recorded without a frame.
  func testADecorationThatOutlivedItsControlRefuses() {
    for (text, hit) in [(false, "deco"), (false, "b"), (false, "none"), (true, "deco"), (true, "b")] {
      let page = Page(twin: "Next", bare: true)
      let deco = text ? page.aText : Node("AXImage", CGRect(x: 20, y: 100, width: 200, height: 30))
      if !text { page.a.add(deco) }
      let refused = judged(page, at: CGPoint(x: 40, y: 112)) { page in
        deco.reparent(to: page.b)  // moved out of A first, so A's removal leaves it alive
        if !text { page.aText.destroy() }
        page.a.destroy()
        page.b.frame = page.b.frame?.offsetBy(dx: 0, dy: -40)  // B alone slides up; the decoration stays at its place
        page.bText.destroy()
        return hit == "deco" ? deco : hit == "b" ? page.b : nil
      }
      XCTAssertTrue(refused.node?.element === deco)
      XCTAssertEqual(refused.reason, .controlGone, "text \(text), hit \(hit)")
      XCTAssertTrue(refused.refused)
      XCTAssertEqual(refused.identity, .handle)
      XCTAssertNil(refused.underlying)
    }
    let frameless = Page(twin: "Next", bare: true)
    let mark = Node("AXImage", CGRect(x: 100, y: 100, width: 120, height: 30))
    frameless.a.add(mark)
    let aFrame = frameless.a.frame
    frameless.a.frame = nil
    let (nodes, framelessNodes, members) = walkRecord(frameless.window)
    frameless.a.frame = aFrame
    XCTAssertTrue(nodes.first { $0.element === mark }?.control === frameless.a)
    frameless.a.children = []
    frameless.slide(webkit: false)
    mark.reparent(to: frameless.b)
    XCTAssertEqual(verdict(nodes, frameless: framelessNodes, members: members, at: atLink, hit: mark).reason, .controlGone,
                   "a frameless control")
  }

  /// The refusal's sentence names the inert node and the control it lay in, and the meta carries that control's role.
  func testTheControlGoneRefusalNamesTheNodeAndItsControl() {
    let page = Page(twin: "Next", bare: true)
    let icon = Node("AXImage", CGRect(x: 100, y: 100, width: 120, height: 30))
    page.a.add(icon)
    let refused = judged(page) { page in
      page.a.children = []
      page.slide(webkit: false)
      icon.reparent(to: page.b)
      return icon
    }
    let outcome = stalePointOutcome(refused, ms: 0, reads: reads)
    XCTAssertEqual(outcome.refusal?.errorName, "screenChangedSinceScreenshot")
    XCTAssertEqual(outcome.refusal?.message,
                   "The screen changed since the screenshot: the point lies on an AXImage that does not act on its own, inside the AXLink \"Open\" the screenshot showed there; that control is gone, and the AXImage now lies in whatever replaced it. Nothing was sent. Call getScreenshot for a new screenshot and aim again from what it shows.")
    XCTAssertEqual(outcome.record.wire["reason"] as? String, "controlGone")
    XCTAssertEqual(outcome.record.wire["verdict"] as? String, "refused")
    XCTAssertEqual(outcome.record.wire["controlRole"] as? String, "AXLink")
    XCTAssertEqual(outcome.record.wire["identity"] as? String, "handle")
    let kept = judged(Page(twin: "Next", bare: true), at: CGPoint(x: 40, y: 112)) { $0.aText }
    XCTAssertNil(StalePointRecord(kept, ms: 0).wire["controlRole"], "only a controlGone refusal carries it")
  }

  /// Only a destroyed handle confirms the control gone: A replaced by B and the decoration moved into B, but A's handle
  /// still answering, its frame, role, actions, parent and children unreadable (any error but an invalid element), keeps
  /// main's verdict; so does a seam that cannot tell a destroyed handle (no `gone`), A's frame reading none.
  func testAControlUnreadableButNotGoneKeepsMainsVerdict() {
    for hitB in [false, true] {
      let page = Page(twin: "Next", bare: true)
      let icon = Node("AXImage", CGRect(x: 100, y: 100, width: 120, height: 30))
      page.a.add(icon)
      let kept = judged(page) { page in
        page.list.children.removeAll { $0 === page.a }
        (page.a.frameUnread, page.a.roleUnread, page.a.actionsUnread) = (true, true, true)
        (page.a.parentUnread, page.a.childrenUnreadNow) = (true, true)
        page.a.children = []
        move(page.b, by: CGVector(dx: 0, dy: -40))
        icon.reparent(to: page.b)
        return hitB ? page.b : icon
      }
      XCTAssertEqual(kept.reason, hitB ? .hitAboveNode : .sameElement)
    }
    let page = Page(twin: "Next", bare: true)
    let icon = Node("AXImage", CGRect(x: 100, y: 100, width: 120, height: 30))
    page.a.add(icon)
    let (nodes, frameless, members) = walkRecord(page.window)
    page.a.children = []
    page.slide(webkit: false)
    icon.reparent(to: page.b)
    var unconfirmed = reads
    unconfirmed.gone = nil
    let kept = stalePointVerdict(at: atLink, nodes: nodes, frameless: frameless, recorded: members, hit: icon, reads: unconfirmed)
    XCTAssertEqual(kept.reason, .sameElement, "no seam confirms A destroyed")
  }

  /// A live control keeps main's verdict: the decoration still inside A, unchanged (the hit on it or on A), or moved out of
  /// A into B while A lives on elsewhere, off the point.
  func testALiveControlKeepsMainsVerdict() {
    let page = Page(twin: "Next", bare: true)
    let icon = Node("AXImage", CGRect(x: 100, y: 100, width: 120, height: 30))
    page.a.add(icon)
    for hit in [icon, page.a] {
      let kept = judged(page) { _ in hit }
      XCTAssertFalse(kept.refused)
      XCTAssertNil(kept.underlying)
    }
    for hitB in [false, true] {
      let page = Page(twin: "Next", bare: true)
      let icon = Node("AXImage", CGRect(x: 100, y: 100, width: 120, height: 30))
      page.a.add(icon)
      let kept = judged(page) { page in
        icon.reparent(to: page.b)
        move(page.a, by: CGVector(dx: 0, dy: 200))
        page.b.frame = page.b.frame?.offsetBy(dx: 0, dy: -40)
        page.bText.destroy()
        return hitB ? page.b : icon
      }
      XCTAssertEqual(kept.reason, hitB ? .hitAboveNode : .sameElement, "A alive, without the decoration")
    }
  }

  /// What the rule leaves to main, A confirmed gone: a node re-created in place with its control (`remount`, A re-rendered
  /// whole), a node that acts on its own (a button that outlived the clickable card around it, the hit answering nothing,
  /// so no hit vouches), and a hit #305 keeps as another recorded control the screenshot showed at the point (on its own
  /// handle, or re-created in place, which no hit's control vouches for).
  func testWhatTheControlGoneRuleLeavesToMain() {
    let remount = judged(Page(twin: "Archive", bare: true), at: CGPoint(x: 40, y: 112)) { page in
      page.rerenderA().children[0]
    }
    XCTAssertEqual(remount.identity, .recreated)
    XCTAssertEqual(remount.reason, .sameElement)
    for hitButton in [true, false] {
      let card = Page(twin: "Next", bare: true, pressable: true)
      let button = Node("AXButton", CGRect(x: 100, y: 100, width: 120, height: 30), title: "Go")
      card.a.add(button)
      let acting = judged(card) { page in
        page.a.children = []
        page.slide(webkit: false)
        button.reparent(to: page.b)
        return hitButton ? button : nil
      }
      XCTAssertEqual(acting.reason, hitButton ? .sameElement : .noHit, "a node that acts on its own")
    }
    for recreate in [false, true] {
      let page = Page(twin: "Archive", bare: true)
      let icon = Node("AXImage", CGRect(x: 100, y: 100, width: 120, height: 30))
      page.a.add(icon)
      let other = Node("AXButton", CGRect(x: 20, y: 100, width: 200, height: 30), title: "Other")
      page.list.add(other)
      let byOther = judged(page) { page in
        page.a.children = []
        page.slide(webkit: false)
        icon.reparent(to: page.b)
        guard recreate else { return other }
        other.destroy()
        let again = Node("AXButton", CGRect(x: 20, y: 100, width: 200, height: 30), title: "Other")
        page.list.add(again)
        return again
      }
      XCTAssertEqual(byOther.reason, .recordedHit, "another recorded control at the point, re-created \(recreate)")
    }
  }

  /// The review of dfe6f443..1d3b0963: links A and F overlap at the point, F in front (later in the list); the record takes
  /// a decoration of A, deeper than F's text. A is removed and the decoration survives. F, recorded at the point and in
  /// place, takes the click as on main, and vouches for it: with the decoration moved into F (the hit on F,
  /// `hitAboveNode`; on the decoration, `sameElement`; on nothing, `noHit`), or moved into a new link N at A's place while
  /// the hit answers F's text (`nonInteractiveHit`; the route presses F, `recordedHit`), in place or re-laid out 3 pt
  /// inside F (then only F, the hit's control, vouches). F moved 3 pt off its place, or a link new at the point with F
  /// gone, does not vouch, and A's loss refuses.
  func testARecordedControlInFrontOfAGoneControlVouchesForTheClick() {
    func scene() -> (page: Page, front: Node, frontText: Node, deco: Node) {
      let page = Page(twin: "Next", bare: true)
      let front = Node("AXLink", CGRect(x: 20, y: 100, width: 200, height: 30), title: "Front")
      let frontText = Node("AXStaticText", CGRect(x: 30, y: 105, width: 60, height: 20), value: "Front")
      front.add(frontText)
      page.list.children.insert(front, at: 1)
      front.parent = page.list
      let wrap = Node("AXGroup", CGRect(x: 20, y: 100, width: 200, height: 30))
      let deco = Node("AXImage", CGRect(x: 20, y: 100, width: 200, height: 30))
      wrap.add(deco)
      page.a.add(wrap)
      return (page, front, frontText, deco)
    }
    let point = CGPoint(x: 40, y: 112)
    for (into, hitOn) in [("F", "F"), ("F", "deco"), ("F", "none"), ("N", "F text"), ("N", "F text moved")] {
      let (page, front, frontText, deco) = scene()
      let (nodes, frameless, members) = walkRecord(page.window)
      XCTAssertTrue(deepestScreenshotNode(at: point, in: nodes)?.element === deco)
      if into == "F" {
        deco.reparent(to: front)
      } else {
        let fresh = Node("AXLink", CGRect(x: 20, y: 100, width: 200, height: 30), title: "Next")
        page.list.add(fresh)
        deco.reparent(to: fresh)
      }
      page.aText.destroy()
      page.a.destroy()
      if hitOn == "F text moved" { frontText.frame = frontText.frame?.offsetBy(dx: 3, dy: 0) }
      let hit = hitOn == "F" ? front : hitOn == "deco" ? deco : hitOn == "none" ? nil : frontText
      let kept = verdict(nodes, frameless: frameless, members: members, at: point, hit: hit)
      let expected: StalePointReason = hitOn == "F" ? .hitAboveNode : hitOn == "deco" ? .sameElement
        : hitOn == "none" ? .noHit : .nonInteractiveHit
      XCTAssertEqual(kept.reason, expected, "into \(into), hit \(hitOn)")
      XCTAssertFalse(stalePointPressVerdict(front, kept, reads: reads).refused, "the route presses F")
      if into == "N" { XCTAssertEqual(stalePointPressVerdict(front, kept, reads: reads).reason, .recordedHit) }
      // F moved off its recorded place: it no longer vouches.
      move(front, by: CGVector(dx: 0, dy: 3))
      XCTAssertEqual(verdict(nodes, frameless: frameless, members: members, at: point, hit: hit).reason, .controlGone,
                     "into \(into), hit \(hitOn), F moved")
    }
    // A link new at the point, F's label, the decoration moved into it, F gone: not recorded there, so A's loss refuses.
    let (page, front, _, deco) = scene()
    let (nodes, frameless, members) = walkRecord(page.window)
    let fresh = Node("AXLink", CGRect(x: 20, y: 100, width: 200, height: 30), title: "Front")
    page.list.add(fresh)
    deco.reparent(to: fresh)
    page.aText.destroy()
    page.a.destroy()
    front.destroy()
    XCTAssertEqual(verdict(nodes, frameless: frameless, members: members, at: point, hit: fresh).reason, .controlGone)
  }

  /// Hosted smoke 44997131965 (`overlaprow`, Electron; main landed on F 2/2, 2a3c7e53 refused 2/2): links A and F overlap
  /// in a row, the record takes A's decoration, A is removed and the decoration stays in the row, under no control,
  /// beneath the unchanged front link F; the hit at F's left padding answers the decoration itself. No control holds it
  /// now, so nothing says it moved into another: main's verdict. So too with the hit on nothing or on F.
  func testADecorationLeftInNoControlKeepsMainsVerdict() {
    for hitOn in ["deco", "none", "F"] {
      let page = Page(twin: "Next", bare: true)
      let row = Node("AXGroup", CGRect(x: 20, y: 100, width: 200, height: 30))
      page.list.children = [row, page.b]
      row.parent = page.list
      row.add(page.a)
      let front = Node("AXLink", CGRect(x: 20, y: 100, width: 200, height: 30), title: "Front")
      row.add(front)
      let wrap = Node("AXGroup", CGRect(x: 20, y: 100, width: 200, height: 30))
      let deco = Node("AXGroup", CGRect(x: 20, y: 100, width: 200, height: 30))
      wrap.add(deco)
      page.a.add(wrap)
      let point = CGPoint(x: 24, y: 112)
      let kept = judged(page, at: point) { page in
        wrap.reparent(to: row)
        page.aText.destroy()
        page.a.destroy()
        return hitOn == "deco" ? deco : hitOn == "F" ? front : nil
      }
      XCTAssertTrue(kept.node?.element === deco)
      XCTAssertFalse(kept.refused, "hit \(hitOn): \(kept.reason)")
    }
  }

  /// Hosted smoke 44997131965 (`rolechange`, Safari; main kept 4/4 as `hitAboveNode` on an AXButton, 2a3c7e53 refused 4/4):
  /// the page sets role="button" on A's own element, and WebKit re-creates A's object as an AXButton with A's label and
  /// frame, the decoration surviving inside it. The control it lies in now is A's in place, whatever its role: main's
  /// verdict. The same new control off A's frame by 3 pt, or reading another label, is another control: refused.
  func testADecorationInItsControlReCreatedWithAnotherRoleKeepsMainsVerdict() {
    for (shift, label, hitButton) in [(0.0, "Open", true), (0.0, "Open", false), (3.0, "Open", true), (0.0, "Next", true)] {
      let page = Page(twin: "Archive", bare: true)
      let icon = Node("AXImage", CGRect(x: 20, y: 100, width: 200, height: 30))
      page.a.add(icon)
      let judgedNow = judged(page, at: CGPoint(x: 150, y: 112)) { page in
        let button = Node("AXButton", CGRect(x: 20, y: 100 + shift, width: 200, height: 30), title: label)
        page.list.children.insert(button, at: 0)
        button.parent = page.list
        icon.reparent(to: button)
        page.aText.reparent(to: button)
        page.a.destroy()
        return hitButton ? button : icon
      }
      let same = shift == 0 && label == "Open"
      XCTAssertEqual(judgedNow.reason, same ? (hitButton ? .hitAboveNode : .sameElement) : .controlGone,
                     "shift \(shift), label \(label), hit the button \(hitButton)")
    }
  }

  /// The re-review of f394677e, item 1: A inside a clickable card, A re-created in place around the decoration, the new
  /// link's role unread (or read inert with its actions unread), the card re-laid out (taller, so it no longer vouches as
  /// a recorded control in place). What holds the decoration now cannot be classified, so the walk stops there,
  /// inconclusive, and never compares the card beyond it with A: main's verdict.
  func testAnUnclassifiedAncestorEndsTheSearchForTheLiveControl() {
    for roleUnread in [true, false] {
      let page = Page(twin: "Next", bare: true)
      let card = Node("AXGroup", CGRect(x: 0, y: 90, width: 600, height: 50))
      card.actions = ["AXPress"]
      page.list.children[0] = card
      card.parent = page.list
      card.add(page.a)
      let icon = Node("AXImage", CGRect(x: 20, y: 100, width: 200, height: 30))
      page.a.add(icon)
      XCTAssertTrue(recorded(page.window).first { $0.element === icon }?.control === page.a)
      let kept = judged(page) { page in
        let again = Node(roleUnread ? "AXLink" : "AXGroup", CGRect(x: 20, y: 100, width: 200, height: 30), title: "Open")
        (again.roleUnread, again.actionsUnread) = (roleUnread, !roleUnread)
        card.frame = CGRect(x: 0, y: 90, width: 600, height: 60)
        card.add(again)
        icon.reparent(to: again)
        page.aText.destroy()
        page.a.destroy()
        return icon
      }
      XCTAssertEqual(kept.reason, .sameElement, "role unread \(roleUnread)")
    }
  }

  /// Item 2: a vouching control must be one the record holds as a control. A row wrapper recorded inert at the point, in
  /// place, gains AXPress after A is removed and the decoration is moved into it: the control the decoration lies in now
  /// is another than A (its frame), and the wrapper, inert in the record, does not vouch: refused.
  func testAWrapperThatGainedAXPressNeverVouches() {
    let page = Page(twin: "Next", bare: true)
    let row = Node("AXGroup", CGRect(x: 0, y: 90, width: 600, height: 50))
    page.list.children[0] = row
    row.parent = page.list
    row.add(page.a)
    let icon = Node("AXImage", CGRect(x: 20, y: 100, width: 200, height: 30))
    page.a.add(icon)
    let refused = judged(page) { page in
      row.actions = ["AXPress"]
      icon.reparent(to: row)
      page.aText.destroy()
      page.a.destroy()
      return icon
    }
    XCTAssertEqual(refused.reason, .controlGone)
  }

  /// Item 3: A re-created in place as an AXButton around the decoration, its title unread at the observation (or now) and
  /// its description another: the title, unknown, ends the label comparison with no difference, so main's verdict; the
  /// same control 3 pt off A's frame still refuses on the frame.
  func testAnUnreadTitleEndsTheLabelComparison() {
    for (recordedUnread, shift) in [(true, 0.0), (false, 0.0), (false, 3.0)] {
      let page = Page(twin: "Next", bare: true)
      page.a.title = nil
      page.a.description = "Open link"
      if recordedUnread { (page.a.title, page.a.unreadable) = ("Open", [.title]) }
      let icon = Node("AXImage", CGRect(x: 20, y: 100, width: 200, height: 30))
      page.a.add(icon)
      let judgedNow = judged(page, at: CGPoint(x: 150, y: 112)) { page in
        let button = Node("AXButton", CGRect(x: 20, y: 100 + shift, width: 200, height: 30), description: "Open button")
        if !recordedUnread { button.unreadable = [.title] }
        page.list.children.insert(button, at: 0)
        button.parent = page.list
        icon.reparent(to: button)
        page.aText.destroy()
        page.a.destroy()
        return button
      }
      XCTAssertEqual(judgedNow.reason, shift == 0 ? .hitAboveNode : .controlGone, "recorded unread \(recordedUnread), shift \(shift)")
    }
  }

  /// Item 4: links A and F overlap, A wider; the record takes A's decoration at a point outside F's own frame, where F's
  /// text overflows. A is removed and the decoration moved into a new link N; the hit is F's text, unchanged, whose
  /// recorded and live owner is F in place: F takes the click, main's verdict. F moved 3 pt off its place does not vouch.
  func testOverflowingContentOfAControlInPlaceVouches() {
    for moved in [false, true] {
      let page = Page(twin: "Next", bare: true)
      page.a.frame = CGRect(x: 20, y: 100, width: 300, height: 30)
      let front = Node("AXLink", CGRect(x: 20, y: 100, width: 200, height: 30), title: "Front")
      let frontText = Node("AXStaticText", CGRect(x: 180, y: 105, width: 100, height: 20), value: "Front")
      front.add(frontText)
      page.list.children.insert(front, at: 1)
      front.parent = page.list
      let wrap = Node("AXGroup", CGRect(x: 20, y: 100, width: 300, height: 30))
      let deco = Node("AXImage", CGRect(x: 20, y: 100, width: 300, height: 30))
      wrap.add(deco)
      page.a.add(wrap)
      let point = CGPoint(x: 250, y: 112)
      let (nodes, frameless, members) = walkRecord(page.window)
      XCTAssertTrue(deepestScreenshotNode(at: point, in: nodes)?.element === deco)
      let fresh = Node("AXLink", CGRect(x: 20, y: 100, width: 300, height: 30), title: "Next")
      page.list.add(fresh)
      deco.reparent(to: fresh)
      page.aText.destroy()
      page.a.destroy()
      if moved { front.frame = front.frame?.offsetBy(dx: 0, dy: 3) }
      let judgedNow = verdict(nodes, frameless: frameless, members: members, at: point, hit: frontText)
      XCTAssertEqual(judgedNow.reason, moved ? .controlGone : .nonInteractiveHit, "F moved \(moved)")
    }
  }

  /// Item 1 (b), a regression against main: A and its text unchanged, a button behind the text (shallower, another
  /// branch) removed. The text still lies in its recorded link, which is what the click reaches: kept as main keeps it.
  func testAnUnrelatedControlBehindALinksTextIsNotJudged() {
    // A link's text, a clickable div's (a control by its AXPress), and one whose div's role did not read but whose
    // AXPress did.
    for (pressable, roleUnread) in [(false, false), (true, false), (true, true)] {
      let page = Page(bare: true, pressable: pressable)
      page.a.roleUnread = roleUnread
      let backdrop = Node("AXButton", CGRect(x: 0, y: 80, width: 600, height: 200), title: "Dismiss")
      page.page.children.insert(backdrop, at: 0)
      backdrop.parent = page.page
      let kept = judged(page, at: CGPoint(x: 40, y: 112)) { page in
        backdrop.destroy()
        return page.aText
      }
      XCTAssertTrue(kept.node?.element === page.aText)
      XCTAssertEqual(kept.reason, .sameElement, "pressable \(pressable), role unread \(roleUnread)")
      XCTAssertNil(kept.underlying)
    }
  }

  /// Item 2: a control beneath whose action names did not read at the observation is unknown, not inert: judged on its own
  /// handle as any control is, and, its handle lost, refused whatever replaced it (here A re-rendered with no twin, which
  /// a known control would pass). The overlay is a transparent image here: an unlabelled group over a clickable row is
  /// itself a twin #431 refuses the row's re-creation on.
  func testAControlBeneathOfUnknownActionsIsJudgedAndNeverReCreated() {
    let unchanged = Page(twin: "Archive", overlay: "AXImage", pressable: true)
    unchanged.a.actionsUnread = true
    let kept = judged(unchanged) { $0.overlay }
    XCTAssertEqual(kept.reason, .sameElement)
    XCTAssertTrue(kept.underlying?.element === unchanged.a)
    XCTAssertEqual(kept.underlyingIdentity, .handle)
    let rerendered = Page(twin: "Archive", overlay: "AXImage", pressable: true)
    rerendered.a.actionsUnread = true
    XCTAssertEqual(judged(rerendered) { page in
      page.rerenderA()
      return page.overlay
    }.reason, .nodeGone)
    // The overlay inside a wrapper whose actions did not read: its control unknown, not inert, so A beneath is still
    // judged (`twincover` refuses).
    let wrapped = Page(bare: true)
    let wrapper = Node("AXGroup", CGRect(x: 20, y: 100, width: 200, height: 30))
    wrapper.actionsUnread = true
    wrapped.list.add(wrapper)
    wrapper.add(wrapped.overlay)
    XCTAssertEqual(recorded(wrapped.window).first { $0.element === wrapped.overlay }?.controlUnknown, true)
    XCTAssertEqual(judged(wrapped) { page in
      page.slide(webkit: false)
      return page.overlay
    }.reason, .nodeGone, "an overlay of unknown control")
    // Its actions known, the same re-render is kept.
    XCTAssertEqual(judged(Page(twin: "Archive", overlay: "AXImage", pressable: true)) { page in
      page.rerenderA()
      return page.overlay
    }.underlyingIdentity, .recreated)
  }

  /// Item 4: the element route's verdict carries the check into the meta; a refusal of its own still names the node.
  func testThePressVerdictCarriesTheCheck() {
    let page = Page()
    let other = Node("AXButton", CGRect(x: 400, y: 300, width: 60, height: 30), title: "Other")
    page.page.add(other)
    let kept = judged(page) { $0.overlay }
    let pressedA = stalePointPressVerdict(page.a, kept, reads: reads)
    XCTAssertEqual(pressedA.reason, .recordedHit)
    XCTAssertEqual(StalePointRecord(pressedA, ms: 0).wire["underlyingRole"] as? String, "AXLink")
    XCTAssertEqual(StalePointRecord(pressedA, ms: 0).wire["underlyingIdentity"] as? String, "handle")
    let pressedOther = stalePointPressVerdict(other, kept, reads: reads)
    XCTAssertEqual(pressedOther.reason, .pressedOther)
    XCTAssertEqual(StalePointRecord(pressedOther, ms: 0).wire["underlyingRole"] as? String, "AXLink")
    let sentence = stalePointOutcome(pressedOther, ms: 0, reads: reads).refusal?.message ?? ""
    XCTAssertTrue(sentence.contains("the AXGroup it showed at this point is no longer what it reaches"), sentence)
  }

  /// Item 5 (design ruling 905, condition 1): the refusal of the control beneath says what happened, an inert layer over
  /// a control that moved or changed, and that the remedy is a new screenshot and a new aim, not this point again.
  func testTheRefusalNamesTheInertLayerAndTheChangedControl() {
    let gone = judged(Page()) { page in
      page.slide(webkit: false)
      return page.overlay
    }
    XCTAssertEqual(stalePointOutcome(gone, ms: 0, reads: reads).refusal?.message,
                   "The screen changed since the screenshot: the point lies on an AXGroup that does not act on its own, over the AXLink \"Open\" the screenshot showed there, which a click passes through to; that control is gone or was replaced. Nothing was sent. Call getScreenshot for a new screenshot and aim again from what it shows; the same point would reach whatever lies under the AXGroup now.")
    let moved = judged(Page(twin: "Archive")) { page in
      move(page.a, by: CGVector(dx: 0, dy: 60))
      return page.overlay
    }
    XCTAssertTrue(stalePointOutcome(moved, ms: 0, reads: reads).refusal?.message.contains("that control has moved away from the point") == true)
    let relabelled = judged(Page(twin: "Archive")) { page in
      page.a.title = "Delete"
      return page.overlay
    }
    XCTAssertTrue(stalePointOutcome(relabelled, ms: 0, reads: reads).refusal?.message.contains("that control now reads \"Delete\"") == true)
  }

  // MARK: Main's verdict for content of an acting control (the coordinator's narrowing after the review of d514da6f):
  // the check runs only for an inert node with no acting ancestor, framed or frameless, up to its document, and a hit
  // that names no interactive element.

  /// Only A's text re-created, drawn outside A's own frame (an overflowing label), the point on it, and A re-rendered
  /// whole: content of a link, so main's verdict, nothing judged beneath.
  func testAReCreatedTextOfALinkIsMainsVerdict() {
    for hitLink in [true, false] {
      let page = Page(twin: "Archive", bare: true)
      page.aText.frame = CGRect(x: 230, y: 105, width: 60, height: 20)
      let point = CGPoint(x: 250, y: 112)
      var again: Node?
      let kept = judged(page, at: point) { page in
        page.aText.destroy()
        let text = Node("AXStaticText", CGRect(x: 230, y: 105, width: 60, height: 20), value: "Open")
        page.a.add(text)
        again = text
        return hitLink ? page.a : text
      }
      XCTAssertTrue(kept.node?.element === page.aText)
      XCTAssertEqual(kept.identity, .recreated)
      XCTAssertTrue(kept.current === again)
      XCTAssertEqual(kept.reason, hitLink ? .hitAboveNode : .sameElement)
      XCTAssertNil(kept.underlying, hitLink ? "the hit the link" : "the hit the new text")
    }
    let remount = judged(Page(twin: "Archive", bare: true), at: CGPoint(x: 40, y: 112)) { page in
      page.rerenderA().children[0]
    }
    XCTAssertEqual(remount.identity, .recreated)
    XCTAssertEqual(remount.reason, .sameElement)
    XCTAssertNil(remount.underlying)
  }

  /// The text unchanged and the hit on it, its AXParent and A's frame unreadable now, A's children listed or unreadable;
  /// a text whose AXParent answers another element: content of a link, so main's verdict. A decoration reparented into B
  /// whose role cannot be read, A destroyed, keeps too (#443): the control it lies in now is unknown, not another one.
  func testUnreadableReadsAroundALinksContentAreMainsVerdict() {
    for childrenUnread in [false, true] {
      let page = Page(twin: "Archive", bare: true)
      let kept = judged(page, at: CGPoint(x: 40, y: 112)) { page in
        page.aText.parentUnread = true
        page.a.frameUnread = true
        page.a.childrenUnreadNow = childrenUnread
        return page.aText
      }
      XCTAssertEqual(kept.reason, .sameElement, childrenUnread ? "A's children unread" : "A lists the text")
      XCTAssertNil(kept.underlying)
    }
    let page = Page(twin: "Next", bare: true)
    let icon = Node("AXImage", CGRect(x: 100, y: 100, width: 120, height: 30))
    page.a.add(icon)
    let moved = judged(page) { page in
      page.slide(webkit: false)
      icon.reparent(to: page.b)
      page.b.roleUnread = true
      return icon
    }
    XCTAssertEqual(moved.reason, .sameElement)
    XCTAssertNil(moved.underlying)
    let elsewhere = judged(Page(twin: "Archive", bare: true), at: CGPoint(x: 40, y: 112)) { page in
      page.aText.parent = page.list
      return page.aText
    }
    XCTAssertEqual(elsewhere.reason, .sameElement)
    XCTAssertNil(elsewhere.underlying)
  }

  /// (a): the control beneath confirmed gone (`StalePointReads.isGone`), something in its place whose role cannot be read:
  /// departed: the overlay's hit refuses on A. The hit on the replacement itself is refused by #330 first, as on main.
  func testAGoneControlBeneathWithAnUnreadableReplacementRefuses() {
    for hitReplacement in [false, true] {
      let refused = judged(Page()) { page in
        page.aText.destroy()
        page.a.destroy()
        let replacement = Node("AXLink", CGRect(x: 20, y: 100, width: 200, height: 30), title: "Open")
        replacement.roleUnread = true
        page.list.children.insert(replacement, at: 0)
        replacement.parent = page.list
        return hitReplacement ? replacement : page.overlay
      }
      XCTAssertEqual(refused.reason, hitReplacement ? .newElementOverPoint : .nodeGone)
      if !hitReplacement { XCTAssertEqual(refused.underlying?.role, "AXLink") }
    }
  }

  /// (b): a text inside a frameless link, under a wrapper whose actions did not read, with a button behind it removed:
  /// the link is an acting ancestor through the frameless owner, so no overlay check, as main.
  func testATextInAFramelessLinkUnderAnUnknownWrapperIsMainsVerdict() {
    let page = Page(twin: "Archive", bare: true)
    let wrapper = Node("AXGroup", CGRect(x: 25, y: 102, width: 100, height: 26))
    wrapper.actionsUnread = true
    page.a.children = []
    page.a.add(wrapper)
    wrapper.add(page.aText)
    let backdrop = Node("AXButton", CGRect(x: 0, y: 80, width: 600, height: 200), title: "Dismiss")
    page.page.children.insert(backdrop, at: 0)
    backdrop.parent = page.page
    let aFrame = page.a.frame
    page.a.frame = nil
    let (nodes, frameless, members) = walkRecord(page.window)
    page.a.frame = aFrame
    XCTAssertFalse(nodes.contains { $0.element === page.a }, "A frameless in the record")
    backdrop.destroy()
    let kept = verdict(nodes, frameless: frameless, members: members, at: CGPoint(x: 40, y: 112), hit: page.aText)
    XCTAssertEqual(kept.reason, .sameElement)
    XCTAssertNil(kept.underlying)
  }

  /// (c): an overlay whose actions did not read at the observation and that has AXPress now acts on its own: its own
  /// target, kept as main, while B slides under it.
  func testAnOverlayOfUnknownActionsThatActsNowIsItsOwnTarget() {
    let page = Page()
    page.overlay.actionsUnread = true
    let kept = judged(page) { page in
      page.overlay.actionsUnread = false
      page.overlay.actions = ["AXPress"]
      page.slide(webkit: false)
      return page.overlay
    }
    XCTAssertEqual(kept.reason, .sameElement)
    XCTAssertNil(kept.underlying)
    // The overlay re-created in place, the new one acting: read as found now, not on the destroyed handle.
    let again = Page(twin: "Archive")
    again.overlay.actionsUnread = true
    let recreated = judged(again) { page in
      page.overlay.destroy()
      let fresh = Node("AXGroup", CGRect(x: 20, y: 100, width: 200, height: 30))
      fresh.actions = ["AXPress"]
      page.list.add(fresh)
      page.slide(webkit: false)
      return fresh
    }
    XCTAssertEqual(recreated.identity, .recreated)
    XCTAssertEqual(recreated.reason, .sameElement)
    XCTAssertNil(recreated.underlying)
  }

  /// The review of 17942ad7, item 1: the hit is a clickable group (AXPress, no listed role) beneath the overlay, in place,
  /// relabelled "Next" to "Continue". The hit names a control, so the gate stands down and main keeps
  /// `nonInteractiveHit`; main's classification of the hit is unchanged.
  func testAHitThatAdvertisesAXPressNamesAControl() {
    let page = Page(twin: "Archive", pressable: true)
    page.a.title = "Next"
    let kept = judged(page) { page in
      page.a.title = "Continue"
      return page.a
    }
    XCTAssertEqual(kept.reason, .nonInteractiveHit)
    XCTAssertEqual(kept.hitRole, "AXGroup")
    XCTAssertNil(kept.underlying)
  }

  /// Item 2: an overlay whose role did not read at the observation but whose AXPress did, its actions unreadable now:
  /// the recorded AXPress makes it its own target, never inert, as main keeps it while B slides under it.
  func testAnOverlayThatRecordedAXPressIsNeverInert() {
    let page = Page()
    page.overlay.roleUnread = true
    page.overlay.actions = ["AXPress"]
    let nodes = recorded(page.window)
    XCTAssertNil(nodes.first { $0.element === page.overlay }?.actionable, "#431's unknown role is unchanged")
    let kept = judged(page) { page in
      page.overlay.actionsUnread = true
      page.slide(webkit: false)
      return page.overlay
    }
    XCTAssertEqual(kept.reason, .sameElement)
    XCTAssertNil(kept.underlying)
  }

  /// Hosted batch B on 17942ad7 (run 44733158011), `bgbutton` as it lies live: under the veil, A and an unrelated button
  /// are siblings in one list, the button later in AXChildren, both frames holding the point. The button removed and A
  /// unchanged: the click still lands on A, so the point is kept, as main keeps it. Both gone or replaced: refused.
  func testSiblingControlsUnderTheVeilKeepWhileOneIsUnchanged() {
    func layout() -> (Page, Node) {
      let page = Page(twin: "Archive", bare: true)
      let button = Node("AXButton", CGRect(x: 0, y: 90, width: 600, height: 60), title: "Dismiss")
      page.list.add(button)
      page.list.add(page.overlay)
      return (page, button)
    }
    let (shape, shapeButton) = layout()
    let nodes = recorded(shape.window)
    XCTAssertTrue(deepestScreenshotNode(at: atLink, in: nodes)?.element === shape.overlay)
    XCTAssertEqual(underlyingTargets(of: nodes.first { $0.element === shape.overlay }!, current: shape.overlay, at: atLink, in: nodes, reads)
                     .map { $0.element === shapeButton ? "button" : $0.element === shape.a ? "A" : "other" }, ["button", "A"],
                   "both siblings, the later first")
    let (page, button) = layout()
    let kept = judged(page) { page in
      button.destroy()
      return page.overlay
    }
    XCTAssertEqual(kept.reason, .sameElement)
    XCTAssertTrue(kept.underlying?.element === page.a, "the control that answered for the point")
    XCTAssertEqual(kept.underlyingIdentity, .handle)
    let (both, bothButton) = layout()
    let refused = judged(both) { page in
      bothButton.destroy()
      page.slide(webkit: false)
      return page.overlay
    }
    XCTAssertEqual(refused.reason, .nodeGone)
    XCTAssertTrue(refused.underlying?.element === bothButton, "the refusal names the first control under the point")
  }

  /// (d): a clickable card around an iframe whose overlay (in a wrapper of unknown actions) lies over link A: the card is
  /// outside the overlay's document, so it owns nothing there, and `twincover` in the iframe refuses.
  func testAnOuterCardNeverOwnsAnIframesOverlay() {
    let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 600, height: 400))
    let page = Node("AXWebArea", CGRect(x: 0, y: 50, width: 600, height: 350))
    let card = Node("AXGroup", CGRect(x: 0, y: 60, width: 600, height: 330))
    card.actions = ["AXPress"]
    let frame = Node("AXWebArea", CGRect(x: 0, y: 70, width: 600, height: 300))
    let list = Node("AXList", CGRect(x: 0, y: 80, width: 600, height: 200))
    let a = Node("AXLink", CGRect(x: 20, y: 100, width: 200, height: 30), title: "Open")
    let b = Node("AXLink", CGRect(x: 20, y: 140, width: 200, height: 30), title: "Open")
    let wrapper = Node("AXGroup", CGRect(x: 20, y: 100, width: 200, height: 30))
    wrapper.actionsUnread = true
    let overlay = Node("AXGroup", CGRect(x: 20, y: 100, width: 200, height: 30))
    window.add(page)
    page.add(card)
    card.add(frame)
    frame.add(list)
    list.add(a)
    list.add(b)
    list.add(wrapper)
    wrapper.add(overlay)
    let (nodes, frameless, members) = walkRecord(window)
    XCTAssertTrue(deepestScreenshotNode(at: atLink, in: nodes)?.element === overlay)
    a.destroy()
    move(b, by: CGVector(dx: 0, dy: -40))
    let refused = verdict(nodes, frameless: frameless, members: members, at: atLink, hit: overlay)
    XCTAssertEqual(refused.reason, .nodeGone)
    XCTAssertTrue(refused.underlying?.element === a)
  }

  /// A group between A and its text whose actions did not read at the observation, so the record cannot name the
  /// text's control, though it holds A above it; a button behind the text removed since. The hit on A (an interactive
  /// ancestor) or on the text itself keeps the point as main does: the text is content of A, its nearest recorded control.
  func testContentUnderAnUnknownWrapperInsideALinkIsTheLinks() {
    for hitLink in [true, false] {
      let page = Page(twin: "Archive", bare: true)
      let wrapper = Node("AXGroup", CGRect(x: 25, y: 102, width: 100, height: 26))
      wrapper.actionsUnread = true
      page.a.children = []
      page.a.add(wrapper)
      wrapper.add(page.aText)
      let backdrop = Node("AXButton", CGRect(x: 0, y: 80, width: 600, height: 200), title: "Dismiss")
      page.page.children.insert(backdrop, at: 0)
      backdrop.parent = page.page
      XCTAssertEqual(recorded(page.window).first { $0.element === page.aText }?.controlUnknown, true)
      let kept = judged(page, at: CGPoint(x: 40, y: 112)) { page in
        backdrop.destroy()
        return hitLink ? page.a : page.aText
      }
      XCTAssertEqual(kept.reason, hitLink ? .hitAboveNode : .sameElement)
      XCTAssertNil(kept.underlying, hitLink ? "the hit A" : "the hit the text")
    }
  }

  /// Several controls under the point: the innermost are the targets (a card around a link is the link, as the browser's
  /// hit reaches the innermost), in `deepestScreenshotNode`'s order, the later of two at one depth first.
  func testTheInnermostControlsBeneathAreTheTargets() {
    let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 600, height: 400))
    let card = Node("AXGroup", CGRect(x: 0, y: 50, width: 600, height: 300))
    card.actions = ["AXPress"]
    let link = Node("AXLink", CGRect(x: 20, y: 100, width: 200, height: 30), title: "Open")
    let early = Node("AXButton", CGRect(x: 20, y: 100, width: 200, height: 30), title: "Early")
    let late = Node("AXButton", CGRect(x: 20, y: 100, width: 200, height: 30), title: "Late")
    let row = Node("AXGroup", CGRect(x: 0, y: 90, width: 600, height: 50))
    // The veil's innermost layer lies deeper than the link.
    let layer = CGRect(x: 0, y: 90, width: 600, height: 50)
    let inner = Node("AXGroup", layer)
    let veil = Node("AXGroup", layer, [Node("AXGroup", layer, [Node("AXGroup", layer, [inner])])])
    window.add(card)
    card.add(row)
    row.add(link)
    window.add(veil)
    let nodes = recorded(window)
    let point = CGPoint(x: 100, y: 115)
    let top = deepestScreenshotNode(at: point, in: nodes)!
    XCTAssertTrue(top.element === inner)
    let first = underlyingTargets(of: top, current: inner, at: point, in: nodes, reads)
    XCTAssertEqual(first.count, 1)
    XCTAssertTrue(first.first?.element === link, "the link, not the card around it")
    row.add(early)
    row.add(late)
    let all = underlyingTargets(of: top, current: inner, at: point, in: recorded(window), reads)
    XCTAssertEqual(all.map { $0.title }, ["Late", "Early", "Open"])
    // A shallower button in another branch, later in the walk: after the deeper ones.
    let shallow = Node("AXButton", CGRect(x: 0, y: 90, width: 600, height: 50), title: "Shallow")
    window.add(shallow)
    XCTAssertEqual(underlyingTargets(of: top, current: inner, at: point, in: recorded(window), reads).map { $0.title },
                   ["Late", "Early", "Open", "Shallow"])
    shallow.destroy()
    // The card alone, its link moved off the point: the card is the target.
    link.frame = CGRect(x: 300, y: 300, width: 100, height: 30)
    (early.frame, late.frame) = (link.frame, link.frame)
    XCTAssertEqual(underlyingTargets(of: top, current: inner, at: point, in: recorded(window), reads).map { $0.element === card }, [true])
  }
}

/// An element source whose action-name answer a test sets (#431's review of 849bcdad..38a55469, item 2).
private final class AnsweringSource: ElementSource, @unchecked Sendable {
  var answer: (error: AXError, names: CFArray?) = (.noValue, nil)
  override func copyActionNames(_ element: AXUIElement) -> (error: AXError, names: CFArray?) { answer }
}

/// #442 (rulings 1073 and 1078): on the guard's keep paths through an inert layer (#433's) and past a non-interactive hit,
/// the corrected hit's control refuses only as a known control moved over the point (`otherControlOnTop`). Kit
/// `probe/442-measure`'s `slideover`: link A under a veil, button B ("Compose") in the second row, slid over A by a
/// transform after the observation, A neither removed nor changed.
final class OtherControlOnTopTests: XCTestCase {
  private final class Page {
    let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 600, height: 400))
    let web = Node("AXWebArea", CGRect(x: 0, y: 50, width: 600, height: 350))
    let list = Node("AXList", CGRect(x: 0, y: 80, width: 600, height: 200))
    let a = Node("AXLink", CGRect(x: 20, y: 100, width: 200, height: 30), title: "Open")
    let aText = Node("AXStaticText", CGRect(x: 30, y: 105, width: 60, height: 20), value: "Open")
    let b = Node("AXButton", CGRect(x: 20, y: 140, width: 200, height: 30), title: "Compose")
    let bText = Node("AXStaticText", CGRect(x: 30, y: 145, width: 60, height: 20), value: "Compose")
    /// The veil over A: a group two layers deep, so the record takes it at A's text as at A (`page.mjs` `cover`); `flat`,
    /// a plain group after the rows in the list, at A's depth.
    let veil = Node("AXGroup", CGRect(x: 20, y: 100, width: 200, height: 30))
    /// `native`: the list straight in the window, no web area (#330's rule, which judges only web areas, stands aside).
    init(veiled: Bool = true, native: Bool = false, flat: Bool = false) {
      if native {
        window.add(list)
      } else {
        window.add(web)
        web.add(list)
      }
      list.add(a)
      a.add(aText)
      list.add(b)
      b.add(bText)
      guard veiled else { return }
      if flat { list.add(veil); return }
      let outer = Node("AXGroup", CGRect(x: 0, y: 80, width: 600, height: 200))
      let inner = Node("AXGroup", CGRect(x: 20, y: 100, width: 200, height: 30))
      list.add(outer)
      outer.add(inner)
      inner.add(veil)
    }
    /// `mark`: B slides over A, its element and text surviving.
    func slide() { move(b, by: CGVector(dx: 0, dy: -40)) }
  }
  private let atLink = CGPoint(x: 150, y: 115)
  private let atText = CGPoint(x: 40, y: 112)

  /// The guard's verdict after `change`, whose answer is the first hit; `corrected`, when given, is what the hit-test answers
  /// after the wait (Chromium), in the observed window unless `place` says otherwise, judged by `windowCheck`. The sleeps
  /// and the second hit-tests it took are counted. `skipping`: elements the walk did not record (a cut record).
  private func judged(_ page: Page, at point: CGPoint, skipping: Set<ObjectIdentifier> = [], corrected: ((Page) -> Node?)? = nil,
                      place: PointHitPlace = .observedWindow(inPopover: false), hitMs: Double? = nil,
                      windowCheck: @escaping (WindowHit<Node>) -> StalePointVerdict<Node>? = { _ in nil },
                      change: (Page) -> Node?) -> (verdict: StalePointVerdict<Node>, sleeps: [Double], rehits: Int) {
    let (nodes, frameless, members) = walkRecord(page.window, skipping: skipping)
    let first = change(page)
    var sleeps: [Double] = []
    var rehits = 0
    let again: (() -> WindowHit<Node>)? = corrected.map { answer in { rehits += 1; return WindowHit(element: answer(page), place: place, ms: hitMs) } }
    let verdict = stalePointVerdict(at: point, nodes: nodes, frameless: frameless, recorded: members, hit: first,
                                    sleep: { sleeps.append($0) }, correctedHit: again, windowCheck: windowCheck, reads: reads)
    return (verdict, sleeps, rehits)
  }

  /// `slideover` on Chromium: the first hit is the veil (main: `sameElement`, kept) and the hit after the wait B or its
  /// text, at the link and at the text: refused, naming B over A. A first hit already on B's text (main:
  /// `nonInteractiveHit`, kept) refuses the same, its second answer unchanged.
  func testSlideoverOnChromiumRefusesOnTheCorrectedHit() {
    for point in [atLink, atText] {
      for corrected in ["b", "bText"] {
        let (verdict, sleeps, rehits) = judged(Page(), at: point, corrected: { corrected == "b" ? $0.b : $0.bText }) { page in
          page.slide()
          return page.veil
        }
        let name = "\(point), the corrected hit \(corrected)"
        XCTAssertEqual(verdict.reason, .otherControlOnTop, name)
        XCTAssertTrue(verdict.refused, name)
        XCTAssertEqual(sleeps, [stalePointCorrectionMs], name)
        XCTAssertEqual(rehits, 1, name)
        XCTAssertEqual(verdict.hitCorrection, .changed, name)
        XCTAssertTrue(verdict.hit === nil || verdict.hit !== verdict.onTop, "the verdict keeps the action's own hit")
        XCTAssertEqual(verdict.underlying?.title, "Open", "#433's check found A unchanged beneath")
        let wire = StalePointRecord(verdict, ms: 0).wire
        XCTAssertEqual(wire["reason"] as? String, "otherControlOnTop")
        XCTAssertEqual(wire["controlRole"] as? String, "AXButton")
        XCTAssertEqual(wire["hitCorrection"] as? String, "changed")
        XCTAssertEqual(wire["underlyingRole"] as? String, "AXLink")
        let refusal = stalePointOutcome(verdict, ms: 0, reads: reads).refusal
        XCTAssertEqual(refusal?.errorName, "screenChangedSinceScreenshot")
        XCTAssertEqual(refusal?.message, "The screen changed since the screenshot: the AXButton \"Compose\" now lies on top at this point, over the AXLink \"Open\" the screenshot showed there, and a click would reach it. Nothing was sent. Call getScreenshot for a new screenshot and aim again from what it shows.", name)
      }
      let already = judged(Page(), at: point, corrected: { $0.bText }) { page in
        page.slide()
        return page.bText
      }
      XCTAssertEqual(already.verdict.reason, .otherControlOnTop, "\(point), B's text first")
      XCTAssertEqual(already.verdict.hitCorrection, .same)
      XCTAssertEqual(StalePointRecord(already.verdict, ms: 0).wire["hitCorrection"] as? String, "same")
    }
  }

  /// Safari-like (no late correction): the first hit is B's text, judged at once, no wait: refused. A first hit on B itself
  /// is main's `interactiveHit`, before this check.
  func testSlideoverWithACorrectFirstAnswerRefusesWithoutWaiting() {
    for point in [atLink, atText] {
      let (verdict, sleeps, _) = judged(Page(), at: point) { page in
        page.slide()
        return page.bText
      }
      XCTAssertEqual(verdict.reason, .otherControlOnTop, "\(point)")
      XCTAssertEqual(sleeps, [])
      XCTAssertNil(verdict.hitCorrection)
      XCTAssertNil(StalePointRecord(verdict, ms: 0).wire["hitCorrection"])
      let onB = judged(Page(), at: point) { page in
        page.slide()
        return page.b
      }
      XCTAssertEqual(onB.verdict.reason, .interactiveHit)
    }
  }

  /// The review of adebc77a's first shape: the veil itself moved into B as B slides over A, the corrected hit the veil or
  /// B: B, a control the screenshot showed elsewhere, refuses; the veil's live parent is not its recorded control.
  func testAVeilMovedIntoBAsItSlidesOverRefuses() {
    for corrected in ["veil", "b"] {
      let (verdict, _, _) = judged(Page(), at: atLink, corrected: { corrected == "veil" ? $0.veil : $0.b }) { page in
        page.slide()
        page.veil.reparent(to: page.b)
        return page.veil
      }
      XCTAssertEqual(verdict.reason, .otherControlOnTop, corrected)
      XCTAssertEqual(verdict.onTopRole, "AXButton", corrected)
    }
  }

  /// Not a known control moved over the point: each keeps the verdict as it came (ruling 1078).
  /// - A link whose text overflows its frame, the record at that text, its parent unread now, the corrected hit on the link
  ///   itself: the node's recorded control.
  /// - A front button the walk omitted (a cut record).
  /// - A recorded inert group, moved over A, that gained AXPress (a declared limit: main keeps it).
  /// - A scrim re-created in place, the corrected hit on the new one; a child Chromium hits that no parent lists; a
  ///   post-wait group the record lacks; a scrim whose post-wait hit is the recorded veil itself; an unread hit; no second
  ///   answer.
  func testWhatIsNotAKnownControlMovedOverThePointKeeps() {
    let overflow = Page(veiled: false)
    overflow.aText.frame = CGRect(x: 30, y: 105, width: 300, height: 20)
    let far = CGPoint(x: 300, y: 112)
    let overflowing = judged(overflow, at: far, corrected: { $0.a }) { page in
      page.aText.parentUnread = true
      return page.list
    }
    XCTAssertTrue(overflowing.verdict.node?.element === overflow.aText)
    XCTAssertEqual(overflowing.verdict.reason, .nonInteractiveHit, "the overflowing link's own text")

    let cut = Page()
    let front = Node("AXButton", CGRect(x: 20, y: 100, width: 200, height: 30), title: "Front")
    cut.list.add(front)
    let omitted = judged(cut, at: atLink, skipping: [ObjectIdentifier(front)], corrected: { _ in front }) { $0.veil }
    XCTAssertFalse(omitted.verdict.refused, "a front button the walk omitted: \(omitted.verdict.reason)")

    let gaining = Page()
    let group = Node("AXGroup", CGRect(x: 20, y: 180, width: 200, height: 30))
    gaining.list.add(group)
    let pressable = judged(gaining, at: atLink, corrected: { _ in group }) { page in
      group.frame = page.a.frame
      group.actions = ["AXPress"]
      return page.veil
    }
    XCTAssertFalse(pressable.verdict.refused, "an inert group that gained AXPress: \(pressable.verdict.reason)")

    let scrim = Page(flat: true)
    let fresh = Node("AXGroup", CGRect(x: 20, y: 100, width: 200, height: 30))
    let recreated = judged(scrim, at: atLink, corrected: { _ in fresh }) { page in
      page.veil.destroy()
      page.list.add(fresh)
      return fresh
    }
    XCTAssertEqual(recreated.verdict.identity, .recreated)
    XCTAssertFalse(recreated.verdict.refused, "a re-created scrim: \(recreated.verdict.reason)")

    let unlisted = Node("AXGroup", CGRect(x: 20, y: 100, width: 200, height: 30))
    let hidden = judged(Page(), at: atLink, corrected: { _ in unlisted }) { page in
      unlisted.parent = page.veil  // its parent answers, but lists no such child
      return page.veil
    }
    XCTAssertFalse(hidden.verdict.refused, "a child no parent lists: \(hidden.verdict.reason)")

    let approximate = Node("AXGroup", CGRect(x: 0, y: 80, width: 600, height: 200))
    let lacking = judged(Page(), at: atLink, corrected: { _ in approximate }) { page in
      page.list.add(approximate)
      page.slide()
      return page.veil
    }
    XCTAssertFalse(lacking.verdict.refused, "a post-wait group the record lacks: \(lacking.verdict.reason)")

    for point in [atLink, atText] {
      let same = judged(Page(), at: point, corrected: { $0.veil }) { $0.veil }
      XCTAssertFalse(same.verdict.refused, "a scrim at \(point)")
      XCTAssertEqual(same.verdict.reason, .sameElement)
      XCTAssertEqual(same.verdict.hitCorrection, .same)
    }
    let unreadB = judged(Page(), at: atLink, corrected: { $0.bText }) { page in
      page.slide()
      page.bText.actionsUnread = true
      return page.veil
    }
    XCTAssertFalse(unreadB.verdict.refused, "B's text whose actions do not read: \(unreadB.verdict.reason)")
    let unanswered = judged(Page(), at: atLink, corrected: { _ in nil }) { page in
      page.slide()
      return page.veil
    }
    XCTAssertFalse(unanswered.verdict.refused)
    XCTAssertEqual(unanswered.verdict.hitCorrection, StalePointHitCorrection.none)
  }

  /// A window of the app's that opened over the point during the wait (a popup): the re-hit answers in it, and #452's
  /// check on that re-hit refuses `appWindowOverPoint`; the verdict keeps the action's own hit.
  func testAPopupArrivingDuringTheWaitRefuses() {
    let pid: pid_t = 990_031
    let browser = ListedWindow(number: 28, owner: pid, layer: 0, bounds: CGRect(x: 0, y: 0, width: 600, height: 400))
    let popup = ListedWindow(number: 49, owner: pid, layer: 0, bounds: CGRect(x: 100, y: 100, width: 200, height: 100))
    var list = [browser]
    let page = Page()
    let (verdict, _, _) = judged(page, at: atLink, corrected: { _ in nil }, place: .otherWindow(49), hitMs: 7.5, windowCheck: { [self] again in
      appWindowVerdict(at: atLink, hit: again.element, place: again.place, target: 28, pid: pid, windows: { list })
    }) { page in
      list = [popup, browser]
      return page.veil
    }
    XCTAssertEqual(verdict.reason, .appWindowOverPoint)
    XCTAssertEqual(verdict.overWindow, 49)
    XCTAssertEqual(verdict.overBy, .axHit)
    XCTAssertEqual(verdict.hitCorrection, StalePointHitCorrection.none)
    XCTAssertEqual(StalePointRecord(verdict, ms: 0).wire["hitCorrection"] as? String, "none")
    // The last review's P3: the delayed hit-test's own time is the one reported, and the action's hit stays the verdict's.
    XCTAssertEqual(verdict.correctedHitMs, 7.5)
    XCTAssertTrue(verdict.hit === page.veil)
    // #453's layers, as on the action's own refusal; but #453's row press never takes a refusal the delayed hit decided.
    XCTAssertEqual(verdict.overLayer, 0)
    XCTAssertEqual(verdict.observedLayer, 0)
    XCTAssertFalse(overlayPressApplies(verdict, button: .left, count: 1, forced: false))
    var first = verdict
    first.hitCorrection = nil
    XCTAssertTrue(overlayPressApplies(first, button: .left, count: 1, forced: false), "the same refusal on the action's own hit")
    // The popup gone again before the re-hit: the observed window answers, and the verdict is the tree's.
    let calm = judged(Page(), at: atLink, corrected: { $0.aText }, windowCheck: { again in
      appWindowVerdict(at: CGPoint(x: 150, y: 115), hit: again.element, place: again.place, target: 28, pid: pid, windows: { [browser] })
    }) { $0.veil }
    XCTAssertFalse(calm.verdict.refused)
  }

  /// #433's candidates beneath the veil: the one the corrected hit names is judged by #433's test, whichever it is. Two
  /// candidates at A's box, the later one (C) the first survivor: the front A widened 10 pt still holds the point with its
  /// label, kept, now as the control beneath; A relabelled refuses as #433 refuses it.
  func testTheCandidateTheHitNamesIsJudgedByTheOverlayTest() {
    func twoCandidates() -> (Page, Node) {
      let page = Page()
      let other = Node("AXLink", CGRect(x: 20, y: 100, width: 200, height: 30), title: "Other")
      page.list.children.insert(other, at: 2)
      other.parent = page.list
      return (page, other)
    }
    let (widenedPage, other) = twoCandidates()
    let widened = judged(widenedPage, at: atLink, corrected: { $0.a }) { page in
      page.a.frame = CGRect(x: 20, y: 100, width: 210, height: 30)
      return page.veil
    }
    XCTAssertFalse(widened.verdict.refused, "\(widened.verdict.reason)")
    XCTAssertTrue(widened.verdict.underlying?.element === widenedPage.a, "the named candidate, not \(other.title ?? "")")
    // A named candidate failing #433's test is not refused for #433's reason; it is left to the moved-control rule,
    // which a control recorded at the point never meets (the last review, item 1): main's verdict.
    let relabelled = judged(twoCandidates().0, at: atLink, corrected: { $0.a }) { page in
      page.a.title = "Delete"
      return page.veil
    }
    XCTAssertEqual(relabelled.verdict.reason, .sameElement)
    XCTAssertFalse(relabelled.verdict.underlyingRefused)
    XCTAssertEqual(relabelled.verdict.hitCorrection, .changed)
  }

  /// The last review, item 1: two controls beneath the veil; the front link A's box shrinks away from the point while its
  /// positioned text stays there, and the corrected hit names that recorded text in A. #433's test on A answers
  /// `frameMoved`, but main keeps and lands on A: kept.
  func testANamedCandidateShrunkFromThePointKeepsMainsVerdict() {
    let page = Page()
    page.aText.frame = CGRect(x: 120, y: 105, width: 60, height: 20)
    let other = Node("AXLink", CGRect(x: 20, y: 100, width: 200, height: 30), title: "Other")
    page.list.children.insert(other, at: 2)
    other.parent = page.list
    let shrunk = judged(page, at: atLink, corrected: { $0.aText }) { page in
      page.a.frame = CGRect(x: 20, y: 100, width: 80, height: 30)
      return page.veil
    }
    XCTAssertFalse(shrunk.verdict.refused, "\(shrunk.verdict.reason)")
    XCTAssertEqual(shrunk.verdict.reason, .sameElement)
  }

  /// The last review, item 2: a link's text drawn outside the link's box, the deeper veil chosen at a point over that
  /// text; the corrected hit is the link itself (its recorded content was shown at the point): kept.
  func testAControlWhoseRecordedContentWasShownAtThePointKeeps() {
    let page = Page()
    page.aText.frame = CGRect(x: 30, y: 105, width: 300, height: 20)
    page.veil.frame = CGRect(x: 20, y: 100, width: 320, height: 30)
    let far = CGPoint(x: 300, y: 112)
    let kept = judged(page, at: far, corrected: { $0.a }) { $0.aText }
    XCTAssertTrue(kept.verdict.node?.element === page.veil)
    XCTAssertEqual(kept.verdict.reason, .nonInteractiveHit, "the link's own text overflowing its box")
  }

  /// The last review, item 3: #305's parent padding. A button inside a small toolbar item, the point in the item's padding
  /// beside the button, the corrected hit the button: in place by its parent's frame (`recordedHitAtPoint` `.ancestor`),
  /// not moved: kept.
  func testAControlInPlaceByItsParentsPaddingKeeps() {
    let window = Node("AXWindow", CGRect(x: 0, y: 0, width: 600, height: 400))
    let web = Node("AXWebArea", CGRect(x: 0, y: 50, width: 600, height: 350))
    let item = Node("AXGroup", CGRect(x: 20, y: 100, width: 200, height: 30))
    let button = Node("AXButton", CGRect(x: 100, y: 105, width: 100, height: 20), title: "Go")
    window.add(web)
    web.add(item)
    item.add(button)
    let (nodes, frameless, members) = walkRecord(window)
    let point = CGPoint(x: 40, y: 115)
    XCTAssertEqual(recordedHitAtPoint(button, at: point, windowShift: .zero, nodes: nodes, frameless: frameless, recorded: members, reads), .ancestor)
    let kept = stalePointVerdict(at: point, nodes: nodes, frameless: frameless, recorded: members, hit: web,
                                 correctedHit: { WindowHit(element: button, place: .observedWindow(inPopover: false)) }, reads: reads)
    XCTAssertTrue(kept.node?.element === item)
    XCTAssertEqual(kept.reason, .nonInteractiveHit)
  }

  /// The last review, item 4: the record's node lies in a wrapper whose actions did not read at the observation, so whose
  /// control it was is unknown (`controlUnknown`): the corrected hit on the link around it keeps.
  func testAnUnknownRecordedOwnershipKeeps() {
    let page = Page(veiled: false)
    let wrapper = Node("AXGroup", CGRect(x: 20, y: 100, width: 200, height: 30))
    page.aText.reparent(to: wrapper)
    page.a.add(wrapper)
    page.aText.frame = CGRect(x: 30, y: 105, width: 300, height: 20)
    wrapper.actionsUnread = true
    let (nodes, frameless, members) = walkRecord(page.window)
    wrapper.actionsUnread = false
    let far = CGPoint(x: 300, y: 112)
    XCTAssertEqual(deepestScreenshotNode(at: far, in: nodes)?.controlUnknown, true)
    let kept = stalePointVerdict(at: far, nodes: nodes, frameless: frameless, recorded: members, hit: page.list,
                                 correctedHit: { WindowHit(element: page.a, place: .observedWindow(inPopover: false)) }, reads: reads)
    XCTAssertTrue(kept.node?.element === page.aText)
    XCTAssertEqual(kept.reason, .nonInteractiveHit)
  }

  /// The last review, item 5: a button recorded with an unplaced frame (CGRect.zero, `unplacedFrame`), laid at A's box
  /// since: the record placed it nowhere, so it is not known to have moved over the point: kept.
  func testAControlRecordedUnplacedIsNotKnownToHaveMoved() {
    let page = Page()
    let unplaced = Node("AXButton", .zero, title: "Later")
    page.list.add(unplaced)
    let kept = judged(page, at: atLink, corrected: { _ in unplaced }) { page in
      unplaced.frame = page.a.frame
      return page.veil
    }
    XCTAssertFalse(kept.verdict.refused, "\(kept.verdict.reason)")
  }

  /// `overcontrol`: the veil over an unchanged A, the corrected hit on A or its text: A is the recorded control beneath,
  /// kept as main keeps it, on Chromium and at once.
  func testTheRecordedControlUnderTheVeilKeeps() {
    for point in [atLink, atText] {
      for corrected in ["a", "aText"] {
        let (kept, sleeps, _) = judged(Page(), at: point, corrected: { corrected == "a" ? $0.a : $0.aText }) { $0.veil }
        XCTAssertFalse(kept.refused, "\(point), \(corrected)")
        XCTAssertEqual(kept.reason, .sameElement)
        XCTAssertEqual(kept.underlyingIdentity, .handle)
        XCTAssertEqual(kept.hitCorrection, .changed)
        XCTAssertEqual(sleeps, [stalePointCorrectionMs])
      }
      let atOnce = judged(Page(), at: point) { $0.aText }
      XCTAssertFalse(atOnce.verdict.refused)
    }
  }

  /// No veil: the record takes A at the link's point. B slid over A, a hit on B's text (main: `nonInteractiveHit`, kept)
  /// refuses on its control; a hit on A's own text keeps, on Chromium and at once, A widened by its count too (`like`).
  func testANonInteractiveHitIsJudgedByItsControl() {
    for corrected in [false, true] {
      let onB = judged(Page(veiled: false), at: atLink, corrected: corrected ? { $0.bText } : nil) { page in
        page.slide()
        return page.bText
      }
      XCTAssertEqual(onB.verdict.node?.role, "AXLink", "the record takes A at the point")
      XCTAssertEqual(onB.verdict.reason, .otherControlOnTop, "Chromium \(corrected)")
      XCTAssertNil(onB.verdict.underlying)
      XCTAssertEqual(stalePointOutcome(onB.verdict, ms: 0, reads: reads).refusal?.message, "The screen changed since the screenshot: the AXButton \"Compose\" now lies on top at this point, over the AXLink \"Open\" the screenshot showed there, and a click would reach it. Nothing was sent. Call getScreenshot for a new screenshot and aim again from what it shows.")
      let onA = judged(Page(veiled: false), at: atLink, corrected: corrected ? { $0.aText } : nil) { $0.aText }
      XCTAssertEqual(onA.verdict.reason, .nonInteractiveHit, "Chromium \(corrected)")
      let grown = judged(Page(veiled: false), at: atLink, corrected: corrected ? { $0.aText } : nil) { page in
        page.a.frame = CGRect(x: 20, y: 100, width: 212, height: 30)
        return page.aText
      }
      XCTAssertEqual(grown.verdict.reason, .nonInteractiveHit, "Chromium \(corrected)")
    }
  }

  /// `siblingstack`'s record (a declared limit, spike #479): B a recorded control at the point in its place, the hit on it,
  /// keeps, as does `bgbutton`'s (an unrelated button behind A removed, the hit on A).
  func testARecordedControlAtThePointKeeps() {
    let stacked = Page()
    stacked.b.frame = stacked.a.frame
    stacked.bText.frame = stacked.aText.frame
    let kept = judged(stacked, at: atLink, corrected: { $0.bText }) { page in
      page.aText.destroy()
      page.a.destroy()
      return page.veil
    }
    XCTAssertFalse(kept.verdict.refused, "\(kept.verdict.reason)")
    let behind = Page()
    behind.b.frame = behind.a.frame
    behind.bText.frame = behind.aText.frame
    let bgbutton = judged(behind, at: atLink, corrected: { $0.aText }) { page in
      page.bText.destroy()
      page.b.destroy()
      return page.veil
    }
    XCTAssertFalse(bgbutton.verdict.refused, "\(bgbutton.verdict.reason)")
  }

  /// The wait is taken only on the two keep paths: a hit on the node itself with no inert layer, a hit through to a
  /// recorded control (`recordedHit`), another control hit (`interactiveHit`), a gone node, a hit on the control above
  /// the node (`hitAboveNode`), and #443's `controlGone` (`decomove`) never wait or hit-test again.
  func testTheWaitIsTakenOnlyOnTheTwoKeepPaths() {
    let corrected: (Page) -> Node? = { $0.b }
    let cases: [(String, Page, CGPoint, (Page) -> Node?, StalePointReason)] = [
      ("the text itself", Page(veiled: false), atText, { $0.aText }, .sameElement),
      ("through to A", Page(), atLink, { $0.a }, .recordedHit),
      ("B over A", Page(veiled: false), atLink, { page in page.slide(); return page.b }, .interactiveHit),
      ("A gone", Page(veiled: false), atLink, { page in page.aText.destroy(); page.a.destroy(); return nil }, .nodeGone),
      ("the link above its text", Page(veiled: false), atText, { $0.a }, .hitAboveNode),
    ]
    for (name, page, point, change, reason) in cases {
      let (verdict, sleeps, rehits) = judged(page, at: point, corrected: corrected, change: change)
      XCTAssertEqual(verdict.reason, reason, name)
      XCTAssertFalse(sleeps.contains(stalePointCorrectionMs), name)
      XCTAssertEqual(rehits, 0, name)
      XCTAssertNil(verdict.hitCorrection, name)
    }
    // `decomove`: A's decoration moved into a new link "Next" at A's place once A is removed: #443 refuses first.
    let page = Page(veiled: false)
    let deco = Node("AXImage", CGRect(x: 20, y: 100, width: 200, height: 30))
    page.a.add(deco)
    let (decomove, sleeps, rehits) = judged(page, at: atText, corrected: corrected) { page in
      let next = Node("AXLink", CGRect(x: 20, y: 100, width: 200, height: 30), title: "Next")
      page.list.children.insert(next, at: 0)
      next.parent = page.list
      deco.reparent(to: next)
      page.aText.destroy()
      page.a.destroy()
      return deco
    }
    XCTAssertEqual(decomove.reason, .controlGone)
    XCTAssertEqual(sleeps, [])
    XCTAssertEqual(rehits, 0)
  }
}
