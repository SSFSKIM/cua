import ApplicationServices
import CoreGraphics
import Foundation

// The stale-point guard (#296; the spec's Decision Log, the #296 entry). A coordinate is placed in the connection's last
// screenshot of the app (Screenshot.swift), and an app may re-lay out after it: #294's spike measured Chrome for
// Testing's toolbar moving Reload 36 pt right 18-20 s after launch, so a click at the screenshot's Reload point landed on
// the disabled Forward button and answered success. So every observation that returns a screenshot records, with it, each
// tree node's frame, role, title and description (`ScreenshotNode`), and a coordinate pointer action, before anything is
// posted, takes the deepest recorded node whose shown frame holds the point and checks that it is still there: the same
// handle, or a handle re-created in place (the same role, a frame within 2 pt, and the same title, or description where
// neither has a title, whenever both sides can be read). It refuses, with nothing posted, when that node is gone, when
// its frame read now no longer holds the point, or when the hit-test at the point now answers another interactive
// element that is not itself a recorded node the screenshot showed at the point (#305, `recordedHitAtPoint`); any other
// hit inside a node still in place (its label's text, a group) passes. The vendor posts at the point
// blindly. Where #282 element-routes the pointer (the design session's ruling 1ea561bc ca82a6f4, reversing the first
// build's skip), a refused point is refused before anything is pressed, and a kept one's route presses only the recorded
// node or its control, the guard run again after any wait of the route's (`StalePointGate`). #316 adds two rules (the
// design session's ruling 4701abd8): before the tree is read, a window of the app's at layer 0 above the screenshot's
// window that the screenshot's window list did not hold refuses (`newWindowAbove`: Safari's address-field overlay, which
// swallows the next click anywhere in the page), and a recorded node inside an AXWebArea requires the hit inside that
// same web area (`otherWebArea`: Chrome keeps answering the page a tab has left, and Firefox's urlbar list lies over the
// page). #330 adds rule dL (the design session's ruling 11bec0ed): in a web area, a point the rest keeps refuses when the
// hit lies in an element the record lacks, under a parent the record holds with every child and that lists it now
// (`newElementOverPoint`: a page's own suggestion list over the control). Everything here reads through closures, so the
// rule is unit-tested over a fake tree.

/// One node of the tree an observation with a screenshot walked, as the screenshot showed it.
struct ScreenshotNode<Element> {
  let element: Element
  let role: String
  let title: String?
  let description: String?
  /// Its AX frame at the observation, in global screen points (top-left origin), as coordinate clicks are posted.
  let frame: CGRect
  /// The part of the frame its clipping ancestors left showing (`visibleFrame`'s rule over the recorded tree): what the
  /// choice of the node under a point tests, so a row scrolled out of its list, or page content scrolled under the
  /// toolbar, is never taken for what the screenshot showed there.
  let shown: CGRect?
  let depth: Int
  /// Whether the walk recorded every child of the element (no width cut, depth cap, budget or deadline, failed read), and
  /// every child of each frameless descendant it reaches only through frameless ones (those are never chosen at a point,
  /// so what they lack is the nearest framed ancestor's): only then can an interactive element inside it that the record
  /// lacks be taken for new.
  let subtreeRecorded: Bool
  /// Whether it is framed as a strip (1 pt or less either way) and the record lacks some of its children (#301): a
  /// collapsed container's, whose children show outside its frame, or a clipping strip's, whose do not. The record cannot
  /// tell the two apart, so only the live hit can: a hit whose ancestors pass through such a node lies in its unrecorded
  /// interior (`stalePointVerdict`), and anywhere else the strip changes nothing.
  var thinGap = false
  /// The `thinGap` strips in its recorded subtree, itself included: the only ones a hit at a point it is chosen for may
  /// pass through and be kept, so a strip elsewhere (beside it, or above it in the tree) never stands behind a new
  /// control covering it.
  var gapsBelow: [Element] = []
  /// The index in the record of its nearest recorded (framed) ancestor, frameless ones passed through (#305's rule 3).
  var ancestor: Int?
  /// The nearest AXWebArea at or above it in the record, frameless ones included (#316's rule G): the document the
  /// screenshot showed it in, which a hit at its point must still lie in.
  var webArea: Element?
}

/// One element as the walk emitted it, for the record (`screenshotNodes`): its lineage number and its parent's.
struct ScreenshotNodeRead<Element> {
  let element: Element
  let number: Int
  let parent: Int?
  let depth: Int
  let role: String
  let title: String?
  let description: String?
  let frame: CGRect?
  let actions: [String]
  let childCount: Int
  /// Whether the walk read its AXChildren (`ElementData.childrenRead`): a failed read counts no children, so with it
  /// unread the record cannot say whether it holds them all (#330's rule dL).
  var childrenRead = true
}

/// The record of a walk's window tree (`reads` in the walk's preorder, parents before their children): each node with a
/// frame, its shown part cut by every clipping ancestor (a scroll area, a web area, a group that scrolls by the page, a
/// sheet, menu or popover, the window; a window, sheet, menu or popover starts the cut again at its own frame, as the
/// vendor's visible-frame walk stops there; one whose frame is unplaced, `unplacedFrame`, cuts nothing, #312), whether all its children were recorded (a frameless node's unrecorded
/// children counting against its nearest framed ancestor), and whether it is a strip whose children the record lacks
/// (`thinGap`).
func screenshotNodes<Element>(_ reads: [ScreenshotNodeRead<Element>]) -> [ScreenshotNode<Element>] {
  var recordedChildren: [Int: Int] = [:]
  for read in reads { if let parent = read.parent { recordedChildren[parent, default: 0] += 1 } }
  // Children come after their parents, so a backward pass sees a node's whole subtree before the node.
  var incomplete: Set<Int> = []
  var gapsBelow: [Int: [Element]] = [:]
  func thin(_ frame: CGRect) -> Bool { frame.width <= 1 || frame.height <= 1 }
  for read in reads.reversed() {
    if (recordedChildren[read.number] ?? 0) < read.childCount { incomplete.insert(read.number) }
    if read.frame == nil, incomplete.contains(read.number), let parent = read.parent { incomplete.insert(parent) }
    if let frame = read.frame, thin(frame), incomplete.contains(read.number) { gapsBelow[read.number, default: []].append(read.element) }
    if let parent = read.parent, let below = gapsBelow[read.number] { gapsBelow[parent, default: []].append(contentsOf: below) }
  }
  /// What each node leaves showing to its descendants: nil for no cut, `.null` for nothing.
  var bounds: [Int: CGRect?] = [:]
  /// Each read's nearest framed node at or above it, by its index in `nodes`.
  var framed: [Int: Int] = [:]
  /// Each read's nearest AXWebArea at or above it (#316).
  var webAreas: [Int: Element] = [:]
  var nodes: [ScreenshotNode<Element>] = []
  nodes.reserveCapacity(reads.count)
  for read in reads {
    let webArea = read.role == "AXWebArea" ? read.element : read.parent.flatMap { webAreas[$0] }
    if let webArea { webAreas[read.number] = webArea }
    let boundary = clipBoundaryRoles.contains(read.role)
    let inherited: CGRect? = boundary ? nil : read.parent.flatMap { bounds[$0] ?? nil }
    let own = read.frame
    func cut(_ rect: CGRect?) -> CGRect? {
      guard let rect else { return nil }
      guard let inherited else { return rect }
      return rect.intersection(inherited)
    }
    if clipsDescendants(role: read.role, actions: read.actions) {
      if let own, unplacedFrame(own) {
        bounds[read.number] = .some(inherited)  // an unplaced clipping frame (#312): unknown, so it cuts nothing
      } else {
        bounds[read.number] = .some(own.map { cut($0) } ?? CGRect.null)  // a clipping frame unread: nothing known to show
      }
    } else {
      bounds[read.number] = .some(inherited)
    }
    let ancestor = read.parent.flatMap { framed[$0] }
    guard let frame = own else {
      framed[read.number] = ancestor
      continue
    }
    framed[read.number] = nodes.count
    let shown = cut(frame).flatMap { $0.isNull || $0.width <= 0 || $0.height <= 0 ? nil : $0 }
    nodes.append(ScreenshotNode(element: read.element, role: read.role, title: read.title, description: read.description, frame: frame,
                                shown: shown, depth: read.depth, subtreeRecorded: !incomplete.contains(read.number),
                                thinGap: thin(frame) && incomplete.contains(read.number), gapsBelow: gapsBelow[read.number] ?? [],
                                ancestor: ancestor, webArea: webArea))
  }
  return nodes
}

/// #330's rule dL: every element of the walk's record (`reads`), framed or frameless, keyed by `key`, with whether the walk
/// recorded every one of its direct children (its AXChildren read, and none left out by a width cut, the depth cap, the
/// budget or deadline, or a failed read of a child). A child such an element lists now that the record lacks is new since
/// the screenshot. An element whose AXChildren read failed decodes as having none, so it never counts as complete (the
/// review of 364e017d..51ce4138).
func screenshotChildrenRecorded<Element, Key: Hashable>(_ reads: [ScreenshotNodeRead<Element>], key: (Element) -> Key) -> [Key: Bool] {
  var recordedChildren: [Int: Int] = [:]
  for read in reads { if let parent = read.parent { recordedChildren[parent, default: 0] += 1 } }
  var complete: [Key: Bool] = [:]
  complete.reserveCapacity(reads.count)
  for read in reads { complete[key(read.element)] = read.childrenRead && (recordedChildren[read.number] ?? 0) >= read.childCount }
  return complete
}

/// Whether `rect` holds `point`, its edges included.
func holdsPoint(_ rect: CGRect, _ point: CGPoint) -> Bool {
  point.x >= rect.minX && point.x <= rect.maxX && point.y >= rect.minY && point.y <= rect.maxY
}

/// The node the screenshot showed at `point`: the deepest recorded node whose shown frame holds it, the later in the walk's
/// order of two at one depth (a later sibling draws above an earlier one).
func deepestScreenshotNode<Element>(at point: CGPoint, in nodes: [ScreenshotNode<Element>]) -> ScreenshotNode<Element>? {
  var best: ScreenshotNode<Element>?
  for node in nodes {
    guard let shown = node.shown, holdsPoint(shown, point) else { continue }
    if best == nil || node.depth >= best!.depth { best = node }
  }
  return best
}

/// The roles the guard takes for interactive: a hit of one of these that is not the recorded node refuses (the
/// false-positive spike's list, probe/296-hosted `scripts/probe-296/tool.swift`).
let stalePointInteractiveRoles: Set<String> = [
  "AXButton", "AXCheckBox", "AXRadioButton", "AXLink", "AXPopUpButton", "AXMenuButton", "AXMenuItem", "AXTextField", "AXTextArea",
  "AXComboBox", "AXSearchField", "AXSecureTextField", "AXSlider", "AXIncrementor", "AXDisclosureTriangle", "AXTab", "AXSwitch",
  "AXColorWell", "AXSegmentedControl",
]
/// How far a re-created handle is looked for: the hit, its parents up to its window (at most this many levels, the bound
/// of every other parent walk here), and this many of its descendants, breadth-first. The spike's search, which matched
/// every re-created control it met at distance 0, used the same 300 descendants.
let stalePointAncestorLevels = 300
let stalePointDescendantBound = 300
/// When the node's handle is gone and the hit-test at the point answers nothing (or an element whose role cannot be read),
/// the page may be mid-replacement: the old node destroyed, the new one not yet hit-testable (the hosted A/B, run
/// 42184616121, chrome/dedicated/recreate/20s: a button replaced every 500 ms refused once as `nodeGone` with no hit). So
/// the point is hit-tested again up to this many times, this many ms apart, and the re-created search runs on the first
/// real hit; the node is gone only if none comes within the bound (150 ms at most).
let stalePointRehits = 3
let stalePointRehitMs: Double = 50
/// How far a re-created handle's frame may lie from the recorded one, each edge, in points.
let stalePointFrameTolerance: CGFloat = 2

/// Why the guard kept or refused a pointer (the meta's `stalePoint.reason`).
enum StalePointReason: String, Equatable {
  /// Kept: no recorded node holds the point (nothing recorded to compare).
  case unrecorded
  /// Kept: the hit-test answers the node itself.
  case sameElement
  /// Kept: the hit-test answers nothing; the node's frame still holds the point.
  case noHit
  /// Kept: the hit is not interactive (its label's text, a group, an image), and the node is still in place.
  case nonInteractiveHit
  /// Kept: the hit is an interactive ancestor of the node (the control its recorded text belongs to).
  case hitAboveNode
  /// Kept, unguarded inside (a stated limit, the design session's ruling 0a14b51f): the hit (or the element a route acts
  /// on) lies inside the node, whose children the record does not all hold, so the screenshot may have shown it; only the
  /// node itself is guarded, as every node is (its own handle with its frame read now holding the point, no label
  /// compared; or one re-created by role, frame and label): the hit inside it, the node itself or no hit at all.
  case unrecordedDescendant
  /// Refused: no handle of the node answers, and none re-created in place was found.
  case nodeGone
  /// Refused: the node's frame read now no longer holds the point.
  case frameMoved
  /// Refused: the hit-test now answers another interactive element.
  case interactiveHit
  /// Refused: #282's element route (or #283's focus) would act on an element that is neither the node nor an ancestor
  /// of it (its control), nor inside a node whose children the record does not all hold.
  case pressedOther
  /// Kept (#305, the design session's ruling 45f5e5be): the hit (or the element a route acts on) is another interactive
  /// element, but itself a recorded node the screenshot showed at the point (`recordedHitAtPoint`). The deepest recorded
  /// node is not always what the hit-test answers: a same-depth sibling stacked on top, a toolbar over a deeper page view,
  /// a wrapped text's box over its neighbour, a hit region past its frame (an edge, a toolbar item's padding: ruling
  /// a27fc57c, `recordedHitBy`).
  case recordedHit
  /// Refused (#316's rule W): the app has a window at layer 0 above the screenshot's window that the screenshot's window
  /// list did not hold (`newWindowAbove`); nothing of the tree was read.
  case newWindow
  /// Refused (#316's rule G): the recorded node lies in an AXWebArea and the hit does not (`ScreenshotNode.webArea`): the
  /// point reaches another document now, or something over the page.
  case otherWebArea
  /// Refused (#330's rule dL, `newElementOverPoint`): the recorded node lies in an AXWebArea and the hit lies in an element
  /// the page added over the point since the screenshot (a suggestion list, a popup).
  case newElementOverPoint

  var refuses: Bool {
    self == .nodeGone || self == .frameMoved || self == .interactiveHit || self == .pressedOther || self == .newWindow || self == .otherWebArea
      || self == .newElementOverPoint
  }
}

/// How the recorded node was found now: its own handle, or one re-created in place.
enum StalePointIdentity: String, Equatable { case handle, recreated }

/// The guard's reading at a point.
struct StalePointVerdict<Element> {
  let reason: StalePointReason
  /// The recorded node (nil only for `unrecorded`).
  var node: ScreenshotNode<Element>?
  var identity: StalePointIdentity?
  /// The node's element as found now: its own handle or the re-created one; nil when gone.
  var current: Element?
  var hitRole: String?
  /// The hit the verdict judged: the action's, or a later one's when the first answered nothing (`stalePointRehits`).
  var hit: Element?
  /// The strips whose children the record lacks in the recorded node's subtree (`ScreenshotNode.gapsBelow`), for the
  /// element route's press verdict.
  var gaps: [Element] = []
  /// Where the verdict was read, for the element route's press verdict (`recordedHitAtPoint`): the posted point (nil when
  /// no recorded node held it), the window's shift since the screenshot, and the record.
  var point: CGPoint?
  var windowShift: CGVector = .zero
  var nodes: [ScreenshotNode<Element>] = []
  /// For `recordedHit`, the frame that carried the point (`recordedHitAtPoint`).
  var recordedHitBy: RecordedHitFrame?
  /// #316's rule G: how many parents of the hit were read to find the recorded node's web area (nil when the rule did not
  /// walk: no web area recorded, no hit, or the hit the node itself).
  var webAreaReads: Int?
  /// #330's rule dL: what it read once the record named a new element on the hit's chain (its parent's children, then the
  /// node's parents when the node is not on the chain); nil when it read nothing.
  var newElementReads: Int?
  /// #316's rule W: the new window over the screenshot's, for `newWindow`.
  var newWindow: ListedWindow?
  var refused: Bool { reason.refuses }
}

/// The reads the guard makes (the unit tests' seams; `.live` over the Accessibility API).
struct StalePointReads<Element> {
  var role: (Element) -> String?
  var frame: (Element) -> CGRect?
  var parent: (Element) -> Element?
  var children: (Element) -> [Element]?
  var title: (Element) -> String?
  var description: (Element) -> String?
  var same: (Element, Element) -> Bool
}

extension StalePointReads where Element == AXUIElement {
  static var live: StalePointReads<AXUIElement> {
    StalePointReads(role: { attribute($0, kAXRoleAttribute) as? String }, frame: liveFrameRead,
                    parent: { elementAttribute($0, kAXParentAttribute) }, children: childrenRead,
                    title: { liveLabel($0, kAXTitleAttribute) }, description: { liveLabel($0, kAXDescriptionAttribute) },
                    same: { CFEqual($0, $1) })
  }
}

private func liveFrameRead(_ element: AXUIElement) -> CGRect? { frame(of: element) }

/// A title or description read now as the walk records it (ElementData): a string or an attributed string's text.
private func liveLabel(_ element: AXUIElement, _ name: String) -> String? {
  guard let value = attribute(element, name) else { return nil }
  let type = CFGetTypeID(value)
  if type == CFStringGetTypeID() { return value as? String }
  if type == CFAttributedStringGetTypeID() { return (value as! NSAttributedString).string }
  return nil
}

private func nonEmpty(_ text: String?) -> String? { text.flatMap { $0.isEmpty ? nil : $0 } }

/// Whether a re-created handle's label agrees with the recorded node's (the design session's amendment, 0c0b70f0): the
/// same title when both have one, else the same description when neither has a title and both have one. A label either
/// side cannot read (or does not carry) never counts against the match. The record holds labels as the walk keeps them,
/// cut by `bounded` (10,000 UTF-16 units); the label read now (`title`, `description`) is cut the same way first, so a
/// long label compares like for like.
func stalePointLabelsAgree(recordedTitle: String?, recordedDescription: String?, title: String?, description: String?) -> Bool {
  let title = title.map(bounded), description = description.map(bounded)
  let (oldTitle, newTitle) = (nonEmpty(recordedTitle), nonEmpty(title))
  if let oldTitle, let newTitle { return oldTitle == newTitle }
  if oldTitle == nil, newTitle == nil, let old = nonEmpty(recordedDescription), let new = nonEmpty(description) { return old == new }
  return true
}

/// The largest distance between two frames' corresponding edges.
func frameDistance(_ a: CGRect, _ b: CGRect) -> CGFloat {
  max(abs(a.minX - b.minX), abs(a.minY - b.minY), abs(a.maxX - b.maxX), abs(a.maxY - b.maxY))
}

private let stalePointWalkStops: Set<String> = ["AXWindow", "AXSheet", "AXApplication"]

/// `element`'s parents, nearest first, up to its window, sheet or application (included) or `stalePointAncestorLevels`.
private func ancestors<Element>(of element: Element, _ reads: StalePointReads<Element>) -> [Element] {
  var found: [Element] = []
  var current = element
  for _ in 0..<stalePointAncestorLevels {
    guard let next = reads.parent(current) else { break }
    found.append(next)
    if stalePointWalkStops.contains(reads.role(next) ?? "") { break }
    current = next
  }
  return found
}

/// Whether `element` lies inside `container` (a strict descendant): its parents walked until one is `container`, up to
/// `stalePointAncestorLevels`, reading nothing else.
private func isInside<Element>(_ element: Element, _ container: Element, _ reads: StalePointReads<Element>) -> Bool {
  var current = element
  for _ in 0..<stalePointAncestorLevels {
    guard let next = reads.parent(current) else { return false }
    if reads.same(next, container) { return true }
    current = next
  }
  return false
}

/// #316's rule G: whether `hit` is `area` or lies inside it, its parents walked (nothing else read) until one is `area`, up
/// to `stalePointAncestorLevels`, how many were read, and the chain walked: the hit, then each parent read (inside, the
/// area last), which #330's rule dL judges. Inside, the walk stops at the area, so a hit in a nested document (an iframe's
/// web area inside the page's) reaches the page's further up; outside, it ends at the application, whose parent is none.
func liesIn<Element>(_ hit: Element, _ area: Element, _ reads: StalePointReads<Element>) -> (inside: Bool, reads: Int, chain: [Element]) {
  if reads.same(hit, area) { return (true, 0, [hit]) }
  var chain = [hit]
  var current = hit
  for level in 0..<stalePointAncestorLevels {
    guard let next = reads.parent(current) else { return (false, level + 1, chain) }
    chain.append(next)
    if reads.same(next, area) { return (true, level + 1, chain) }
    current = next
  }
  return (false, stalePointAncestorLevels, chain)
}

/// How #330's rule dL reads an element of the hit's chain against the record (`newElementOverPoint`).
private enum ChainStatus { case recorded(allChildren: Bool), new, insideNew, unknown }

/// #330's rule dL (the design session's ruling 11bec0ed): whether the hit lies in an element the page added over the point
/// since the screenshot, and what that took to read. `chain` is the hit and its parents up to the recorded node's web area
/// (rule G's walk, `liesIn`, which found the hit inside); `recorded` answers, for each element of the record, whether the
/// walk recorded every one of its children (`screenshotChildrenRecorded`), and nil for an element the record lacks. From
/// the web area down, an element is recorded; new (the record lacks it, its parent recorded with every child); inside a
/// new one; or unknown (the record lacks it, under a parent whose children the record does not all hold, or under an
/// unknown one). The topmost new element refuses when its parent's AXChildren lists it now, since Chrome hit-tests a
/// button to its label's text, which no AXChildren lists and the walk never records, and when it neither is nor holds one
/// of `found`, the recorded nodes as found now: the node at the point (#296's control re-created in place, and a wrapper
/// re-created around it, are the node, not something over it; the design session's acceptance cd365f0e), and a hit #305
/// kept as a recorded control, perhaps re-created in place (the review of 364e017d..51ce4138). Nothing is read until the
/// record names a new element; then its parent's children, and, for each of `found` not on the chain, its parents up to
/// the new element or the web area.
func newElementOverPoint<Element>(chain: [Element], found: [Element], recorded: (Element) -> Bool?,
                                  reads: StalePointReads<Element>) -> (found: Bool, reads: Int) {
  var parent = ChainStatus.unknown
  var topmost: Int?
  for index in chain.indices.reversed() {
    let status: ChainStatus
    if let allChildren = recorded(chain[index]) {
      status = .recorded(allChildren: allChildren)
    } else {
      switch parent {
      case .new, .insideNew: status = .insideNew
      case .recorded(allChildren: true): status = .new
      case .recorded(allChildren: false), .unknown: status = .unknown
      }
    }
    if case .new = status { topmost = index; break }
    parent = status
  }
  guard let topmost else { return (false, 0) }
  let element = chain[topmost]
  var offChain: [Element] = []
  for node in found {
    if let at = chain.firstIndex(where: { reads.same($0, node) }) {
      if topmost >= at { return (false, 0) }  // a recorded node as found now, or an element holding it
    } else {
      offChain.append(node)
    }
  }
  var count = 1
  guard reads.children(chain[topmost + 1])?.contains(where: { reads.same($0, element) }) == true else { return (false, count) }
  guard let area = chain.last else { return (true, count) }
  for node in offChain {
    var below = node
    for _ in 0..<stalePointAncestorLevels {
      guard let next = reads.parent(below) else { break }
      count += 1
      if reads.same(next, element) { return (false, count) }
      if reads.same(next, area) { break }
      below = next
    }
  }
  return (true, count)
}

/// Up to `stalePointDescendantBound` of `element`'s descendants, breadth-first.
private func descendants<Element>(of element: Element, _ reads: StalePointReads<Element>) -> [Element] {
  var queue = reads.children(element) ?? []
  var head = 0
  while head < queue.count && queue.count < stalePointDescendantBound {
    queue.append(contentsOf: reads.children(queue[head]) ?? [])
    head += 1
  }
  return Array(queue.prefix(stalePointDescendantBound))
}

/// A handle re-created in place of `node` near `hit`: among the hit, its ancestors and its descendants (the bounds above),
/// the element of the node's role whose frame lies nearest the recorded one moved by `windowShift` (the window's move
/// since the screenshot), within `stalePointFrameTolerance`, whose label agrees (`stalePointLabelsAgree`).
func recreatedHandle<Element>(of node: ScreenshotNode<Element>, near hit: Element, windowShift: CGVector = .zero,
                              _ reads: StalePointReads<Element>) -> (element: Element, frame: CGRect)? {
  let expected = node.frame.offsetBy(dx: windowShift.dx, dy: windowShift.dy)
  var best: (element: Element, frame: CGRect, distance: CGFloat)?
  for candidate in [hit] + ancestors(of: hit, reads) + descendants(of: hit, reads) {
    guard reads.role(candidate) == node.role, let frame = reads.frame(candidate) else { continue }
    let distance = frameDistance(frame, expected)
    guard distance <= stalePointFrameTolerance, best.map({ distance < $0.distance }) ?? true else { continue }
    guard stalePointLabelsAgree(recordedTitle: node.title, recordedDescription: node.description,
                                title: reads.title(candidate), description: reads.description(candidate)) else { continue }
    best = (candidate, frame, distance)
  }
  return best.map { ($0.element, $0.frame) }
}

/// The guard at `point` (#296): the deepest recorded node there (`deepestScreenshotNode`) found now, by its own handle
/// while its frame reads (or while the hit or one of its ancestors is it), else by a re-created handle
/// (`recreatedHandle`), and judged against `hit`, the hit-test at the point the action already took.
///
/// `point` is where the events are posted, in the window as it lies now (`coordinatePlacement` offsets the screenshot's
/// point by the window's current origin); the record's frames are where the window lay at the screenshot. So the node
/// is chosen at the point moved back by `windowShift` (the window's current origin less its origin at the screenshot),
/// the point the model meant in the image, while its frame read now is checked against the posted point, and a
/// re-created handle is matched against the recorded frame moved by the shift. A window that only moved keeps every node.
///
/// With the node's handle gone and no real hit (none, or one whose role cannot be read), `rehit` hit-tests the point again
/// (`stalePointRehits` times, `sleep` `stalePointRehitMs` before each) until a real hit comes, which the rest judges.
///
/// `recorded` is the record's every element, framed or frameless, with whether its children all were recorded
/// (`screenshotChildrenRecorded`; nil for an element the record lacks), which #330's rule dL judges the hit's chain by.
func stalePointVerdict<Element>(at point: CGPoint, windowShift: CGVector = .zero, nodes: [ScreenshotNode<Element>],
                                recorded: (Element) -> Bool? = { _ in nil }, hit first: Element?,
                                rehit: () -> Element? = { nil }, sleep: (Double) -> Void = { _ in },
                                reads: StalePointReads<Element>) -> StalePointVerdict<Element> {
  let shown = CGPoint(x: point.x - windowShift.dx, y: point.y - windowShift.dy)
  guard let node = deepestScreenshotNode(at: shown, in: nodes) else { return StalePointVerdict(reason: .unrecorded, hit: first) }
  var hit = first
  var hitRole = hit.flatMap(reads.role)
  let nodeFrame = reads.frame(node.element)
  if nodeFrame == nil, hitRole == nil {
    for _ in 0..<stalePointRehits {
      sleep(stalePointRehitMs)
      guard let again = rehit(), let role = reads.role(again) else { continue }
      (hit, hitRole) = (again, role)
      break
    }
  }
  var verdict = StalePointVerdict(reason: .nodeGone, node: node, hitRole: hitRole, hit: hit, point: point, windowShift: windowShift, nodes: nodes)
  var currentFrame: CGRect?
  if let frame = nodeFrame {
    (verdict.current, verdict.identity, currentFrame) = (node.element, .handle, frame)
  } else if let hit, reads.same(hit, node.element) || isInside(hit, node.element, reads) {
    (verdict.current, verdict.identity) = (node.element, .handle)  // its frame unread, but the point reaches it
  } else if let hit, let found = recreatedHandle(of: node, near: hit, windowShift: windowShift, reads) {
    (verdict.current, verdict.identity, currentFrame) = (found.element, .recreated, found.frame)
  }
  guard let current = verdict.current else { return verdict }
  let gaps = node.gapsBelow
  var webAreaReads: Int?
  var newElementReads: Int?
  func judged(_ reason: StalePointReason) -> StalePointVerdict<Element> {
    StalePointVerdict(reason: reason, node: node, identity: verdict.identity, current: current, hitRole: hitRole, hit: hit, gaps: gaps,
                      point: point, windowShift: windowShift, nodes: nodes, webAreaReads: webAreaReads, newElementReads: newElementReads)
  }
  // Judged in order: the node's identity (above) and its frame, then the hit (the reasons name what was read, kept or
  // refused). A node the record holds incompletely has passed as every node passes by here (the design session's
  // ruling 2db3ba75), and whatever the point reaches inside it (no hit, the node itself, anything under it) is its
  // unrecorded interior, kept unguarded and said so.
  if let currentFrame, !holdsPoint(currentFrame, point) { return judged(.frameMoved) }
  // #316's rule G: a node the screenshot showed in a web area is judged only by a hit in that same web area, its nearest
  // one in the record (so an iframe's hit passes inside the page's, and a page's inside its iframe's own). The hit that is
  // the node's own handle is in it by the record; an empty hit is judged as before.
  var chain: [Element]?
  if let hit, let area = node.webArea, !reads.same(hit, node.element) {
    let walk = liesIn(hit, area, reads)
    webAreaReads = walk.reads
    if !walk.inside { return judged(.otherWebArea) }
    chain = walk.chain
  }
  func judgedByHit() -> StalePointVerdict<Element> {
    if !node.subtreeRecorded, hit.map({ reads.same($0, current) || isInside($0, current, reads) }) ?? true {
      return judged(.unrecordedDescendant)
    }
    guard let hit else { return judged(.noHit) }
    if reads.same(hit, current) { return judged(.sameElement) }
    guard let hitRole, stalePointInteractiveRoles.contains(hitRole) else { return judged(.nonInteractiveHit) }
    if isInside(current, hit, reads) { return judged(.hitAboveNode) }
    // #301: an interactive hit under a strip in the node's recorded subtree whose children the record lacks lies in its
    // unrecorded interior (a collapsed container's control the budget cut), so the node, which passed as every node does,
    // is all that is checked.
    if insideGap(hit, gaps, reads) { return judged(.unrecordedDescendant) }
    // #305: the hit is itself a recorded node the screenshot showed at the point, in its place.
    if let by = recordedHitAtPoint(hit, at: point, windowShift: windowShift, nodes: nodes, reads) {
      var kept = judged(.recordedHit)
      kept.recordedHitBy = by
      return kept
    }
    return judged(.interactiveHit)
  }
  let byHit = judgedByHit()
  // #330's rule dL, after #296's checks and rule G: a point they keep in a web area refuses when the hit lies in an element
  // the page added over it since the screenshot (`newElementOverPoint`), judged on G's walk. A refusal keeps its reason.
  guard !byHit.refused, let chain else { return byHit }
  // The recorded nodes as found now: the node, and a hit #305 kept as a recorded control (its own handle or one
  // re-created in place).
  let found = byHit.reason == .recordedHit ? [current] + (hit.map { [$0] } ?? []) : [current]
  let added = newElementOverPoint(chain: chain, found: found, recorded: recorded, reads: reads)
  if added.reads > 0 { newElementReads = added.reads }
  guard added.found else {
    var kept = byHit
    kept.newElementReads = newElementReads
    return kept
  }
  return judged(.newElementOverPoint)
}

/// Which frame carried a `recordedHit` (#305, the design session's ruling a27fc57c; the meta's `recordedHitBy`): the
/// hit's own shown frame, or its nearest recorded ancestor's.
enum RecordedHitFrame: String, Equatable { case hit, ancestor }

/// The roles whose frame never carries a recorded hit's point as its nearest recorded ancestor (ruling a27fc57c): areas
/// that hold whole regions of controls, not one control's padding. Nor does an ancestor covering more than this share of
/// the window's area.
let recordedHitAreaRoles: Set<String> = ["AXWindow", "AXWebArea", "AXScrollArea", "AXSplitGroup", "AXApplication"]
let recordedHitAncestorShare: CGFloat = 0.25

/// #305's rule (the design session's rulings 45f5e5be and a27fc57c): whether `element`, an interactive hit (or an
/// element route's target) the verdict would otherwise refuse, is itself a recorded node the screenshot showed at the
/// point, still there, and which frame carried it. All three hold:
/// 1. it is a recorded node: its handle `CFEqual` to a recorded one; else, while that node's own handle reads no frame
///    (gone, as #296 takes a re-created handle only then), #296's re-created identity: its role, its frame within 2 pt of
///    the recorded one moved by `windowShift`, and its label agreeing (`stalePointLabelsAgree`). A hit that is a recorded
///    handle is that node and no other, so a lookalike elsewhere never stands in for it;
/// 2. it has not moved: its frame read now lies within 2 pt of the recorded one moved by the shift;
/// 3. the point the model meant (`point` less the shift) lies in a shown frame (`ScreenshotNode.shown`, what its clipping
///    ancestors left in the image), widened by 2 pt: its own (`.hit`), or else its nearest recorded ancestor's
///    (`.ancestor`; Safari answers its address field anywhere in the toolbar item's padding), when that ancestor has not
///    moved either, is not one of `recordedHitAreaRoles` and covers at most `recordedHitAncestorShare` of the window's
///    area (the record's root). Never an ancestor further up.
/// Read only where the verdict would refuse: the element's frame, role and labels, a frame read per recorded node of its
/// role and frame that its handle does not match, and the ancestor's frame.
func recordedHitAtPoint<Element>(_ element: Element, at point: CGPoint, windowShift: CGVector, nodes: [ScreenshotNode<Element>],
                                 _ reads: StalePointReads<Element>) -> RecordedHitFrame? {
  let tolerance = stalePointFrameTolerance
  func widened(_ rect: CGRect) -> CGRect { rect.insetBy(dx: -tolerance, dy: -tolerance) }
  func inPlace(_ live: CGRect?, _ node: ScreenshotNode<Element>) -> Bool {
    live.map { frameDistance($0, node.frame.offsetBy(dx: windowShift.dx, dy: windowShift.dy)) <= tolerance } ?? false
  }
  let meant = CGPoint(x: point.x - windowShift.dx, y: point.y - windowShift.dy)
  func showed(_ node: ScreenshotNode<Element>) -> Bool { node.shown.map { holdsPoint(widened($0), meant) } ?? false }
  let windowArea = nodes.first { $0.depth == 0 }.map { $0.frame.width * $0.frame.height }
  func carried(_ node: ScreenshotNode<Element>) -> RecordedHitFrame? {
    if showed(node) { return .hit }
    guard let index = node.ancestor else { return nil }
    let ancestor = nodes[index]
    guard !recordedHitAreaRoles.contains(ancestor.role), let windowArea,
          ancestor.frame.width * ancestor.frame.height <= recordedHitAncestorShare * windowArea,
          showed(ancestor), inPlace(reads.frame(ancestor.element), ancestor) else { return nil }
    return .ancestor
  }
  guard let live = reads.frame(element) else { return nil }
  let handles = nodes.filter { reads.same(element, $0.element) }
  if !handles.isEmpty { return handles.lazy.filter { inPlace(live, $0) }.compactMap(carried).first }
  guard let role = reads.role(element) else { return nil }
  let (title, description) = (reads.title(element), reads.description(element))
  for node in nodes where node.role == role && inPlace(live, node)
    && stalePointLabelsAgree(recordedTitle: node.title, recordedDescription: node.description, title: title, description: description)
    && reads.frame(node.element) == nil {
    if let by = carried(node) { return by }
  }
  return nil
}

/// Whether `element` lies inside one of `gaps` (strips in the chosen node's recorded subtree whose children the record
/// lacks): its parents, read once up to
/// its window, sheet or application (`ancestors`), compared with each. Read only where the verdict would otherwise
/// refuse, and only when the record has a gap.
private func insideGap<Element>(_ element: Element, _ gaps: [Element], _ reads: StalePointReads<Element>) -> Bool {
  guard !gaps.isEmpty else { return false }
  return ancestors(of: element, reads).contains { ancestor in gaps.contains { reads.same(ancestor, $0) } }
}

/// #316's rule W (the design session's ruling 4701abd8): the frontmost window of `pid`'s at layer 0 above `target` in
/// `list` (the window list, front to back) that the screenshot's window list (`recorded`) did not hold; nil when there is
/// none, or when the list does not hold the target, which nothing is then above. Such a window refuses wherever it lies:
/// Safari's address-field overlay takes the next page click anywhere, not only under its bounds. No app is excepted, so
/// Chrome's omnibox popup, also a window of its own, refuses too, which the ruling accepts as one re-observation.
func newWindowAbove(target: CGWindowID, pid: pid_t, recorded: Set<CGWindowID>, list: [ListedWindow]) -> ListedWindow? {
  var found: ListedWindow?
  for window in list {
    if window.number == target { return found }
    if found == nil, window.owner == pid, window.layer == 0, !recorded.contains(window.number) { found = window }
  }
  return nil
}

/// The guard at a coordinate click's or drag start's point (#296, #316): rule W from the window list (`windows`, the
/// on-screen list read once, only when there is a target window number and a recorded list to compare: about 0.3 ms, p95
/// 1 ms, with 30 windows on screen on the MacBook), and only when it keeps the point, the tree's verdict (`tree`,
/// `stalePointVerdict`). Both call sites take this one, so a drag's start is guarded as a click is.
func guardedPointVerdict<Element>(at point: CGPoint, hit: Element?, target: CGWindowID?, pid: pid_t, recorded: Set<CGWindowID>?,
                                  windows: () -> [ListedWindow], tree: () -> StalePointVerdict<Element>) -> StalePointVerdict<Element> {
  if let target, let recorded, let new = newWindowAbove(target: target, pid: pid, recorded: recorded, list: windows()) {
    return StalePointVerdict(reason: .newWindow, hit: hit, point: point, newWindow: new)
  }
  return tree()
}

/// The meta's `stalePoint` (#296): what the guard decided ("kept" | "refused"), why, how it found the node, the recorded
/// node's role and the hit's, for `recordedHit` the frame that carried it (`recordedHitBy`), its time (both checks' when
/// there were two), and `rechecked` when an element route's wait
/// made it run again before the press (`StalePointGate`), whose verdict this then is. Value-free: roles and enumeration
/// words.
struct StalePointRecord: Equatable {
  enum Verdict: String { case kept, refused }
  let verdict: Verdict
  let reason: StalePointReason
  let identity: StalePointIdentity?
  let recordedRole: String?
  let hitRole: String?
  /// For `recordedHit` (#305, ruling a27fc57c): whether the hit's own shown frame or its nearest recorded ancestor's
  /// carried the point.
  let recordedHitBy: RecordedHitFrame?
  let ms: Double
  var rechecked = false
  /// The check that answered ran after the route's focus hold had activated the app (`pressAfterFinalCheck`): a refusal
  /// then pressed nothing, but the activation ran.
  var afterActivation = false
  /// #316's costs, apart from `ms`, which covers them: rule W's window-list read and check, and rule G's parent reads.
  var windowsMs: Double?
  let webAreaReads: Int?
  /// #330's rule dL's reads (`StalePointVerdict.newElementReads`), also inside `ms`.
  let newElementReads: Int?
  /// For `newWindow`, the new window's number.
  let newWindow: CGWindowID?

  init<Element>(_ verdict: StalePointVerdict<Element>, ms: Double, rechecked: Bool = false) {
    self.verdict = verdict.refused ? .refused : .kept
    reason = verdict.reason
    identity = verdict.identity
    recordedRole = verdict.node?.role
    hitRole = verdict.hitRole
    recordedHitBy = verdict.recordedHitBy
    webAreaReads = verdict.webAreaReads
    newElementReads = verdict.newElementReads
    newWindow = verdict.newWindow?.number
    self.ms = ms
    self.rechecked = rechecked
  }

  var wire: [String: Any] {
    var wire: [String: Any] = ["verdict": verdict.rawValue, "reason": reason.rawValue, "ms": (ms * 1000).rounded() / 1000]
    if let identity { wire["identity"] = identity.rawValue }
    if let recordedRole { wire["recordedRole"] = recordedRole }
    if let hitRole { wire["hitRole"] = hitRole }
    if let recordedHitBy { wire["recordedHitBy"] = recordedHitBy.rawValue }
    if let windowsMs { wire["windowsMs"] = (windowsMs * 1000).rounded() / 1000 }
    if let webAreaReads { wire["webAreaReads"] = webAreaReads }
    if let newElementReads { wire["newElementReads"] = newElementReads }
    if let newWindow { wire["newWindow"] = Int(newWindow) }
    if rechecked { wire["rechecked"] = true }
    if afterActivation { wire["afterActivation"] = true }
    return wire
  }
}

/// What an element route (#282's press, #283's focus) may act on at a kept point (the design session's ruling 1ea561bc
/// ca82a6f4): the node the screenshot showed there as found now, or an ancestor of it (the control the walk reached
/// from the hit through plain children), or anything inside a node whose children the record does not all hold and
/// which itself passed (the `unrecordedDescendant` limit, its reason then that one), or a recorded node the screenshot
/// showed at the point and still there (`recordedHit`, #305), or anything at a point no recorded node holds
/// (`unrecorded`). Otherwise the verdict becomes `pressedOther`, refused.
func stalePointPressVerdict<Element>(_ pressed: Element, _ verdict: StalePointVerdict<Element>,
                                     reads: StalePointReads<Element>) -> StalePointVerdict<Element> {
  guard !verdict.refused, let node = verdict.node, let current = verdict.current else { return verdict }
  if reads.same(pressed, current) || isInside(current, pressed, reads) { return verdict }
  func judged(_ reason: StalePointReason) -> StalePointVerdict<Element> {
    StalePointVerdict(reason: reason, node: node, identity: verdict.identity, current: current, hitRole: reads.role(pressed), hit: pressed,
                      gaps: verdict.gaps, point: verdict.point, windowShift: verdict.windowShift, nodes: verdict.nodes,
                      webAreaReads: verdict.webAreaReads,  // #316: the hit's walk, which this verdict was judged after
                      newElementReads: verdict.newElementReads)  // #330: and rule dL's reads on it
  }
  // Inside a node the record holds incompletely, or under one of its strips whose children it lacks (#301).
  if (!node.subtreeRecorded && isInside(pressed, current, reads)) || insideGap(pressed, verdict.gaps, reads) {
    return judged(.unrecordedDescendant)
  }
  // #305: the element is itself a recorded node the screenshot showed at the point, in its place.
  if let point = verdict.point, let by = recordedHitAtPoint(pressed, at: point, windowShift: verdict.windowShift, nodes: verdict.nodes, reads) {
    var kept = judged(.recordedHit)
    kept.recordedHitBy = by
    return kept
  }
  return judged(.pressedOther)
}

/// The hit an action's element route is built from after the guard (the review of c8f37a93..7f79ca34): the action's own,
/// unless the guard's re-hit recovered another (`stalePointRehits`), whose view the action then classifies again.
enum StalePointRouteHit<Element> {
  case unchanged
  case recovered(Element)
}

func stalePointRouteHit<Element>(_ hit: Element?, _ verdict: StalePointVerdict<Element>, same: (Element, Element) -> Bool) -> StalePointRouteHit<Element> {
  guard let judged = verdict.hit else { return .unchanged }
  if let hit, same(hit, judged) { return .unchanged }
  return .recovered(judged)
}

/// #296's order at an element route's press (the review of c8f37a93..7f79ca34): the focus hold first when the app does
/// not believe it has focus (`hold`, whose activation guard polls), then the final check of the element about to be
/// acted on (`finalCheck`, told whether a hold ran, so whether a wait may have come since the early check), then the
/// action. A refusal there leaves the hold as every refusal after it does (FocusHold.swift).
func pressAfterFinalCheck(holds: Bool, hold: () throws -> Void, finalCheck: (_ afterHold: Bool) throws -> Void,
                          perform: () throws -> Void) throws {
  if holds { try hold() }
  try finalCheck(holds)
  try perform()
}

/// #296's check where a kept point is carried by an element route: the first verdict (the click's), and the guard run
/// again at the point with a fresh hit-test (`recheck`), which the route asks for when it waited (#282's action re-read,
/// #283's focus settle and box re-read; up to `webAreaRereadDeadline`) since the page can change meanwhile.
struct StalePointGate<Element> {
  let first: StalePointVerdict<Element>
  let firstMs: Double
  /// The first check's window-list read (#316's rule W, `StalePointRecord.windowsMs`), which the record this gate
  /// answers replaces in the meta: it is kept there, the recheck reading no window list of its own.
  var firstWindowsMs: Double? = nil
  let recheck: () -> StalePointVerdict<Element>

  /// The first check's verdict and its record (`Engine.stalePointGuard`'s), whose time and window-list read this gate's
  /// record carries on.
  init(first: StalePointVerdict<Element>, record: StalePointRecord, recheck: @escaping () -> StalePointVerdict<Element>) {
    self.init(first: first, firstMs: record.ms, firstWindowsMs: record.windowsMs, recheck: recheck)
  }

  init(first: StalePointVerdict<Element>, firstMs: Double, firstWindowsMs: Double? = nil, recheck: @escaping () -> StalePointVerdict<Element>) {
    self.first = first
    self.firstMs = firstMs
    self.firstWindowsMs = firstWindowsMs
    self.recheck = recheck
  }

  /// The verdict on `pressed` just before the route acts on it: the first one, or after a wait the recheck's, each
  /// judged by `stalePointPressVerdict`; its record (`rechecked` after a wait, the time both checks', the first check's
  /// window-list read) and its refusal.
  func check(_ pressed: Element, waited: Bool, afterActivation: Bool = false, now: () -> Double,
             reads: StalePointReads<Element>) -> (record: StalePointRecord, refusal: EngineError?) {
    let started = now()
    let verdict = stalePointPressVerdict(pressed, waited ? recheck() : first, reads: reads)
    let outcome = stalePointOutcome(verdict, ms: firstMs + (now() - started), afterActivation: afterActivation, reads: reads)
    var record = outcome.record
    record.windowsMs = firstWindowsMs
    record.rechecked = waited
    record.afterActivation = afterActivation
    return (record, outcome.refusal)
  }
}

/// An element as a refusal's sentence names it: its role and its title, else its description, in quotes (at most 60
/// characters).
func stalePointName(role: String?, title: String?, description: String?) -> String {
  let role = role ?? "element"
  guard let label = nonEmpty(title) ?? nonEmpty(description) else { return role }
  let shown = label.count > 60 ? String(label.prefix(60)) + "…" : label
  return "\(role) \"\(shown)\""
}

/// The guard's refusal (#296): the screenshot's element at the point and what became of it, what the point reaches now,
/// and the re-observation that lets the model aim again. Nothing was posted.
func screenChangedSinceScreenshot(was: String, reason: StalePointReason, now: String?, afterActivation: Bool = false) -> EngineError {
  let there = now.map { "; \($0) is there now" } ?? ""
  let sent = afterActivation ? "The app was activated in the background, but nothing was pressed." : "Nothing was sent."
  // #330's rule dL: the recorded element is still there, under something the page added; dismissing that is a way on too.
  if reason == .newElementOverPoint {
    return EngineError(name: "screenChangedSinceScreenshot",
      "The screen changed since the screenshot: a new element, such as a suggestion list or popup, has appeared over the \(was) it showed at this point\(there). \(sent) Call getScreenshot for a new screenshot, or press Escape to dismiss what appeared, before clicking.")
  }
  let change: String
  switch reason {
  case .frameMoved: change = "has moved away from it"
  case .interactiveHit, .pressedOther: change = "is no longer what it reaches"
  case .otherWebArea: change = "is in a page the point no longer reaches"
  default: change = "is gone"
  }
  return EngineError(name: "screenChangedSinceScreenshot",
    "The screen changed since the screenshot: the \(was) it showed at this point \(change)\(there). \(sent) Call getScreenshot for a new screenshot, then give the coordinates in its pixels.")
}

/// #316's rule W's refusal: the same name as the guard's other refusals, since the model's remedy is the same (a new
/// screenshot first), with its own sentence, since no element of the screenshot's is at fault. Nothing was posted.
func newWindowOverScreenshot(app: String) -> EngineError {
  EngineError(name: "screenChangedSinceScreenshot",
    "The screen changed since the screenshot: \(app) has opened a window over the one the screenshot showed, which can take the click. Nothing was sent. Call getScreenshot for a new screenshot, then give the coordinates in its pixels.")
}

/// The guard's outcome at a point: its meta record, and the refusal to throw (nil when it kept the pointer). The refusal
/// names what is there now (the verdict's hit; for `pressedOther` the element the route would act on) only when it is
/// known (its role read) and is not the node itself (Chrome's hit-test may still answer a moved control's handle at its
/// old point); otherwise it names nothing there. A `newWindow` refusal names the app (`app`).
func stalePointOutcome<Element>(_ verdict: StalePointVerdict<Element>, ms: Double, afterActivation: Bool = false, app: String = "The app",
                                reads: StalePointReads<Element>) -> (record: StalePointRecord, refusal: EngineError?) {
  let record = StalePointRecord(verdict, ms: ms)
  if verdict.reason == .newWindow { return (record, newWindowOverScreenshot(app: app)) }
  guard verdict.refused, let node = verdict.node else { return (record, nil) }
  let was = stalePointName(role: node.role, title: node.title, description: node.description)
  var now: String?
  if let hit = verdict.hit, let role = verdict.hitRole, !(verdict.current.map { reads.same(hit, $0) } ?? false) {
    now = stalePointName(role: role, title: reads.title(hit), description: reads.description(hit))
  }
  return (record, screenChangedSinceScreenshot(was: was, reason: verdict.reason, now: now, afterActivation: afterActivation))
}

extension ConnectionState {
  /// The screenshot coordinates are placed in (`ObservedScreenshot`: its recorded nodes and its window's origin then).
  func observedScreenshot(app: ResolvedApp) -> ObservedScreenshot? { lineages[app.key]?.screenshot }
}

extension Engine {
  /// The guard at a coordinate pointer's posted point, live (`stalePointVerdict` over the Accessibility API), with `hit` the
  /// hit-test the action already took there and `windowOrigin` the origin of the window the point was placed in, now; its
  /// time covers the reads it adds. `rehit` hit-tests the point again (the action's own hit-test). `windowID` is the number
  /// of the window the point was placed in, which #316's rule W looks above among `appPid`'s windows.
  func stalePointGuard(at point: CGPoint, windowOrigin: CGPoint, windowID: CGWindowID?, hit: AXUIElement?, rehit: () -> AXUIElement?,
                       app: ResolvedApp, appPid: pid_t, context: ExecutionContext)
    -> (record: StalePointRecord, refusal: EngineError?, verdict: StalePointVerdict<AXUIElement>, shift: CGVector) {
    let started = monotonicMilliseconds()
    let reads = StalePointReads<AXUIElement>.live
    let screenshot = context.connection.observedScreenshot(app: app)
    let shift = screenshot.map { CGVector(dx: windowOrigin.x - $0.windowOrigin.x, dy: windowOrigin.y - $0.windowOrigin.y) } ?? .zero
    var windowsMs: Double?
    let verdict = guardedPointVerdict(at: point, hit: hit, target: windowID, pid: appPid, recorded: screenshot?.windowList, windows: {
      let read = monotonicMilliseconds()
      defer { windowsMs = monotonicMilliseconds() - read }
      return onScreenWindowList()
    }) {
      stalePointVerdict(at: point, windowShift: shift, nodes: screenshot?.nodes ?? [], recorded: { screenshot?.recorded[ElementKey(element: $0)] },
                        hit: hit, rehit: rehit, sleep: { usleep(UInt32($0 * 1000)) }, reads: reads)
    }
    var outcome = stalePointOutcome(verdict, ms: monotonicMilliseconds() - started, app: app.displayName, reads: reads)
    outcome.record.windowsMs = windowsMs
    return (outcome.record, outcome.refusal, verdict, shift)
  }

  /// `stalePointVerdict` again at a point an element route was given (`StalePointGate.recheck`), its hit taken fresh.
  func stalePointRecheck(at point: CGPoint, shift: CGVector, window: AXUIElement, appPid: pid_t, app: ResolvedApp,
                         context: ExecutionContext) -> StalePointVerdict<AXUIElement> {
    let rehit = { hitTest(window: window, pid: appPid, at: point) }
    let screenshot = context.connection.observedScreenshot(app: app)
    return stalePointVerdict(at: point, windowShift: shift, nodes: screenshot?.nodes ?? [], recorded: { screenshot?.recorded[ElementKey(element: $0)] },
                             hit: rehit(), rehit: rehit, sleep: { usleep(UInt32($0 * 1000)) }, reads: .live)
  }
}
