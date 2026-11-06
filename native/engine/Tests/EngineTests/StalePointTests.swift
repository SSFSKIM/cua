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
  var frame: CGRect?
  var actions: [String] = []
  weak var parent: Node?
  var children: [Node] = []

  init(_ role: String, _ frame: CGRect?, title: String? = nil, description: String? = nil, _ children: [Node] = []) {
    self.role = role
    self.frame = frame
    self.title = title
    self.description = description
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
    parent?.children.removeAll { $0 === self }
  }
}

private var reads: StalePointReads<Node> {
  StalePointReads<Node>(role: { $0.role }, frame: { $0.frame }, parent: { $0.parent }, children: { $0.children },
                                          title: { $0.title }, description: { $0.description }, same: { $0 === $1 })
}

/// The record an observation with a screenshot makes of `root`'s tree, every node walked (as `TreeWalk` emits them, its
/// labels cut by `bounded` as ElementData cuts them).
private func recorded(_ root: Node, skipping skipped: Set<ObjectIdentifier> = []) -> [ScreenshotNode<Node>] {
  var reads: [ScreenshotNodeRead<Node>] = []
  var next = 0
  func walk(_ node: Node, parent: Int?, depth: Int) {
    let number = next
    next += 1
    reads.append(ScreenshotNodeRead(element: node, number: number, parent: parent, depth: depth, role: node.role, title: node.title.map(bounded),
                                    description: node.description.map(bounded), frame: node.frame, actions: node.actions, childCount: node.children.count))
    for child in node.children where !skipped.contains(ObjectIdentifier(child)) { walk(child, parent: number, depth: depth + 1) }
  }
  walk(root, parent: nil, depth: 0)
  return screenshotNodes(reads)
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

  /// A stated limit (#298): a handle that survives and is relabelled in place (Save to Delete on one element) passes,
  /// since its identity and its frame are unchanged, and refusing a label change on a live handle would refuse every
  /// button whose label ticks.
  func testASurvivingHandleRelabelledInPlacePasses() {
    let chrome = Chrome()
    let nodes = recorded(chrome.window)
    chrome.button.title = "Delete"
    let kept = verdict(nodes, at: CGPoint(x: 160, y: 315), hit: chrome.button)
    XCTAssertEqual(kept.reason, .sameElement)
    XCTAssertEqual(kept.identity, .handle)
    XCTAssertFalse(kept.refused)
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
