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
// element; any other hit inside a node still in place (its label's text, a group) passes. The vendor posts at the point
// blindly. Where #282 element-routes the pointer (the design session's ruling 1ea561bc ca82a6f4, reversing the first
// build's skip), a refused point is refused before anything is pressed, and a kept one's route presses only the recorded
// node or its control, the guard run again after any wait of the route's (`StalePointGate`). Everything here reads
// through closures, so the rule is unit-tested over a fake tree.

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
}

/// The record of a walk's window tree (`reads` in the walk's preorder, parents before their children): each node with a
/// frame, its shown part cut by every clipping ancestor (a scroll area, a web area, a group that scrolls by the page, a
/// sheet, menu or popover, the window; a window, sheet, menu or popover starts the cut again at its own frame, as the
/// vendor's visible-frame walk stops there), and whether all its children were recorded, a frameless node's
/// unrecorded children counting against its nearest framed ancestor.
func screenshotNodes<Element>(_ reads: [ScreenshotNodeRead<Element>]) -> [ScreenshotNode<Element>] {
  var recordedChildren: [Int: Int] = [:]
  for read in reads { if let parent = read.parent { recordedChildren[parent, default: 0] += 1 } }
  // Children come after their parents, so a backward pass sees a node's whole subtree before the node.
  var incomplete: Set<Int> = []
  for read in reads.reversed() {
    if (recordedChildren[read.number] ?? 0) < read.childCount { incomplete.insert(read.number) }
    if read.frame == nil, incomplete.contains(read.number), let parent = read.parent { incomplete.insert(parent) }
  }
  /// What each node leaves showing to its descendants: nil for no cut, `.null` for nothing.
  var bounds: [Int: CGRect?] = [:]
  var nodes: [ScreenshotNode<Element>] = []
  nodes.reserveCapacity(reads.count)
  for read in reads {
    let boundary = clipBoundaryRoles.contains(read.role)
    let inherited: CGRect? = boundary ? nil : read.parent.flatMap { bounds[$0] ?? nil }
    let own = read.frame
    func cut(_ rect: CGRect?) -> CGRect? {
      guard let rect else { return nil }
      guard let inherited else { return rect }
      return rect.intersection(inherited)
    }
    if clipsDescendants(role: read.role, actions: read.actions) {
      bounds[read.number] = .some(own.map { cut($0) } ?? CGRect.null)  // a clipping frame unread: nothing known to show
    } else {
      bounds[read.number] = .some(inherited)
    }
    guard let frame = own else { continue }
    let shown = cut(frame).flatMap { $0.isNull || $0.width <= 0 || $0.height <= 0 ? nil : $0 }
    nodes.append(ScreenshotNode(element: read.element, role: read.role, title: read.title, description: read.description, frame: frame,
                                shown: shown, depth: read.depth, subtreeRecorded: !incomplete.contains(read.number)))
  }
  return nodes
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

  var refuses: Bool { self == .nodeGone || self == .frameMoved || self == .interactiveHit || self == .pressedOther }
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
func stalePointVerdict<Element>(at point: CGPoint, windowShift: CGVector = .zero, nodes: [ScreenshotNode<Element>], hit first: Element?,
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
  var verdict = StalePointVerdict(reason: .nodeGone, node: node, hitRole: hitRole, hit: hit)
  var currentFrame: CGRect?
  if let frame = nodeFrame {
    (verdict.current, verdict.identity, currentFrame) = (node.element, .handle, frame)
  } else if let hit, reads.same(hit, node.element) || isInside(hit, node.element, reads) {
    (verdict.current, verdict.identity) = (node.element, .handle)  // its frame unread, but the point reaches it
  } else if let hit, let found = recreatedHandle(of: node, near: hit, windowShift: windowShift, reads) {
    (verdict.current, verdict.identity, currentFrame) = (found.element, .recreated, found.frame)
  }
  guard let current = verdict.current else { return verdict }
  func judged(_ reason: StalePointReason) -> StalePointVerdict<Element> {
    StalePointVerdict(reason: reason, node: node, identity: verdict.identity, current: current, hitRole: hitRole, hit: hit)
  }
  // Judged in order: the node's identity (above) and its frame, then the hit (the reasons name what was read, kept or
  // refused). A node the record holds incompletely has passed as every node passes by here (the design session's
  // ruling 2db3ba75), and whatever the point reaches inside it (no hit, the node itself, anything under it) is its
  // unrecorded interior, kept unguarded and said so.
  if let currentFrame, !holdsPoint(currentFrame, point) { return judged(.frameMoved) }
  if !node.subtreeRecorded, hit.map({ reads.same($0, current) || isInside($0, current, reads) }) ?? true {
    return judged(.unrecordedDescendant)
  }
  guard let hit else { return judged(.noHit) }
  if reads.same(hit, current) { return judged(.sameElement) }
  guard let hitRole, stalePointInteractiveRoles.contains(hitRole) else { return judged(.nonInteractiveHit) }
  if isInside(current, hit, reads) { return judged(.hitAboveNode) }
  return judged(.interactiveHit)
}

/// The meta's `stalePoint` (#296): what the guard decided ("kept" | "refused"), why, how it found the node, the recorded
/// node's role and the hit's, its time (both checks' when there were two), and `rechecked` when an element route's wait
/// made it run again before the press (`StalePointGate`), whose verdict this then is. Value-free: roles and enumeration
/// words.
struct StalePointRecord: Equatable {
  enum Verdict: String { case kept, refused }
  let verdict: Verdict
  let reason: StalePointReason
  let identity: StalePointIdentity?
  let recordedRole: String?
  let hitRole: String?
  let ms: Double
  var rechecked = false
  /// The check that answered ran after the route's focus hold had activated the app (`pressAfterFinalCheck`): a refusal
  /// then pressed nothing, but the activation ran.
  var afterActivation = false

  init<Element>(_ verdict: StalePointVerdict<Element>, ms: Double, rechecked: Bool = false) {
    self.verdict = verdict.refused ? .refused : .kept
    reason = verdict.reason
    identity = verdict.identity
    recordedRole = verdict.node?.role
    hitRole = verdict.hitRole
    self.ms = ms
    self.rechecked = rechecked
  }

  var wire: [String: Any] {
    var wire: [String: Any] = ["verdict": verdict.rawValue, "reason": reason.rawValue, "ms": (ms * 1000).rounded() / 1000]
    if let identity { wire["identity"] = identity.rawValue }
    if let recordedRole { wire["recordedRole"] = recordedRole }
    if let hitRole { wire["hitRole"] = hitRole }
    if rechecked { wire["rechecked"] = true }
    if afterActivation { wire["afterActivation"] = true }
    return wire
  }
}

/// What an element route (#282's press, #283's focus) may act on at a kept point (the design session's ruling 1ea561bc
/// ca82a6f4): the node the screenshot showed there as found now, or an ancestor of it (the control the walk reached
/// from the hit through plain children), or anything inside a node whose children the record does not all hold and
/// which itself passed (the `unrecordedDescendant` limit, its reason then that one), or anything at a point no
/// recorded node holds (`unrecorded`). Otherwise the verdict becomes `pressedOther`, refused.
func stalePointPressVerdict<Element>(_ pressed: Element, _ verdict: StalePointVerdict<Element>,
                                     reads: StalePointReads<Element>) -> StalePointVerdict<Element> {
  guard !verdict.refused, let node = verdict.node, let current = verdict.current else { return verdict }
  if reads.same(pressed, current) || isInside(current, pressed, reads) { return verdict }
  if !node.subtreeRecorded, isInside(pressed, current, reads) {
    return StalePointVerdict(reason: .unrecordedDescendant, node: node, identity: verdict.identity, current: current,
                             hitRole: reads.role(pressed), hit: pressed)
  }
  return StalePointVerdict(reason: .pressedOther, node: node, identity: verdict.identity, current: current, hitRole: reads.role(pressed),
                           hit: pressed)
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
  let recheck: () -> StalePointVerdict<Element>

  /// The verdict on `pressed` just before the route acts on it: the first one, or after a wait the recheck's, each
  /// judged by `stalePointPressVerdict`; its record (`rechecked` after a wait, the time both checks') and its refusal.
  func check(_ pressed: Element, waited: Bool, afterActivation: Bool = false, now: () -> Double,
             reads: StalePointReads<Element>) -> (record: StalePointRecord, refusal: EngineError?) {
    let started = now()
    let verdict = stalePointPressVerdict(pressed, waited ? recheck() : first, reads: reads)
    let outcome = stalePointOutcome(verdict, ms: firstMs + (now() - started), afterActivation: afterActivation, reads: reads)
    var record = outcome.record
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
  let change: String
  switch reason {
  case .frameMoved: change = "has moved away from it"
  case .interactiveHit, .pressedOther: change = "is no longer what it reaches"
  default: change = "is gone"
  }
  let there = now.map { "; \($0) is there now" } ?? ""
  return EngineError(name: "screenChangedSinceScreenshot",
    "The screen changed since the screenshot: the \(was) it showed at this point \(change)\(there). \(afterActivation ? "The app was activated in the background, but nothing was pressed." : "Nothing was sent.") Call getScreenshot for a new screenshot, then give the coordinates in its pixels.")
}

/// The guard's outcome at a point: its meta record, and the refusal to throw (nil when it kept the pointer). The refusal
/// names what is there now (the verdict's hit; for `pressedOther` the element the route would act on) only when it is
/// known (its role read) and is not the node itself (Chrome's hit-test may still answer a moved control's handle at its
/// old point); otherwise it names nothing there.
func stalePointOutcome<Element>(_ verdict: StalePointVerdict<Element>, ms: Double, afterActivation: Bool = false,
                                reads: StalePointReads<Element>) -> (record: StalePointRecord, refusal: EngineError?) {
  let record = StalePointRecord(verdict, ms: ms)
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
  /// time covers the reads it adds. `rehit` hit-tests the point again (the action's own hit-test).
  func stalePointGuard(at point: CGPoint, windowOrigin: CGPoint, hit: AXUIElement?, rehit: () -> AXUIElement?, app: ResolvedApp,
                       context: ExecutionContext) -> (record: StalePointRecord, refusal: EngineError?, verdict: StalePointVerdict<AXUIElement>, shift: CGVector) {
    let started = monotonicMilliseconds()
    let reads = StalePointReads<AXUIElement>.live
    let screenshot = context.connection.observedScreenshot(app: app)
    let shift = screenshot.map { CGVector(dx: windowOrigin.x - $0.windowOrigin.x, dy: windowOrigin.y - $0.windowOrigin.y) } ?? .zero
    let verdict = stalePointVerdict(at: point, windowShift: shift, nodes: screenshot?.nodes ?? [], hit: hit, rehit: rehit,
                                    sleep: { usleep(UInt32($0 * 1000)) }, reads: reads)
    let outcome = stalePointOutcome(verdict, ms: monotonicMilliseconds() - started, reads: reads)
    return (outcome.record, outcome.refusal, verdict, shift)
  }

  /// `stalePointVerdict` again at a point an element route was given (`StalePointGate.recheck`), its hit taken fresh.
  func stalePointRecheck(at point: CGPoint, shift: CGVector, window: AXUIElement, appPid: pid_t, app: ResolvedApp,
                         context: ExecutionContext) -> StalePointVerdict<AXUIElement> {
    let rehit = { hitTest(window: window, pid: appPid, at: point) }
    return stalePointVerdict(at: point, windowShift: shift, nodes: context.connection.observedScreenshot(app: app)?.nodes ?? [], hit: rehit(),
                             rehit: rehit, sleep: { usleep(UInt32($0 * 1000)) }, reads: .live)
  }
}
