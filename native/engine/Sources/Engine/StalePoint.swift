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
// blindly. Where #282 element-routes the pointer (Input.swift `deliverPointer`) the guard does not apply. Everything here
// reads through closures, so the rule is unit-tested over a fake tree.

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
  /// Whether the walk recorded every child of the element (no width cut, depth cap, budget or deadline, failed read): only
  /// then can an interactive element inside it that the record lacks be taken for new.
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
/// vendor's visible-frame walk stops there), and whether all its children were recorded.
func screenshotNodes<Element>(_ reads: [ScreenshotNodeRead<Element>]) -> [ScreenshotNode<Element>] {
  var recordedChildren: [Int: Int] = [:]
  for read in reads { if let parent = read.parent { recordedChildren[parent, default: 0] += 1 } }
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
                                shown: shown, depth: read.depth, subtreeRecorded: (recordedChildren[read.number] ?? 0) >= read.childCount))
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
  /// Kept: the hit is an interactive element inside the node, whose children the record does not all hold, so the
  /// screenshot may have shown it.
  case unrecordedDescendant
  /// Refused: no handle of the node answers, and none re-created in place was found.
  case nodeGone
  /// Refused: the node's frame read now no longer holds the point.
  case frameMoved
  /// Refused: the hit-test now answers another interactive element.
  case interactiveHit

  var refuses: Bool { self == .nodeGone || self == .frameMoved || self == .interactiveHit }
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
                    title: { stringAttribute($0, kAXTitleAttribute) }, description: { stringAttribute($0, kAXDescriptionAttribute) },
                    same: { CFEqual($0, $1) })
  }
}

private func liveFrameRead(_ element: AXUIElement) -> CGRect? { frame(of: element) }

private func nonEmpty(_ text: String?) -> String? { text.flatMap { $0.isEmpty ? nil : $0 } }

/// Whether a re-created handle's label agrees with the recorded node's (the design session's amendment, 0c0b70f0): the
/// same title when both have one, else the same description when neither has a title and both have one. A label either
/// side cannot read (or does not carry) never counts against the match.
func stalePointLabelsAgree(recordedTitle: String?, recordedDescription: String?, title: String?, description: String?) -> Bool {
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
/// the element of the node's role whose frame lies nearest the recorded one, within `stalePointFrameTolerance`, whose
/// label agrees (`stalePointLabelsAgree`).
func recreatedHandle<Element>(of node: ScreenshotNode<Element>, near hit: Element, _ reads: StalePointReads<Element>) -> (element: Element, frame: CGRect)? {
  var best: (element: Element, frame: CGRect, distance: CGFloat)?
  for candidate in [hit] + ancestors(of: hit, reads) + descendants(of: hit, reads) {
    guard reads.role(candidate) == node.role, let frame = reads.frame(candidate) else { continue }
    let distance = frameDistance(frame, node.frame)
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
func stalePointVerdict<Element>(at point: CGPoint, nodes: [ScreenshotNode<Element>], hit: Element?,
                                reads: StalePointReads<Element>) -> StalePointVerdict<Element> {
  guard let node = deepestScreenshotNode(at: point, in: nodes) else { return StalePointVerdict(reason: .unrecorded) }
  let hitRole = hit.flatMap(reads.role)
  var verdict = StalePointVerdict(reason: .nodeGone, node: node, hitRole: hitRole)
  var currentFrame: CGRect?
  if let frame = reads.frame(node.element) {
    (verdict.current, verdict.identity, currentFrame) = (node.element, .handle, frame)
  } else if let hit, reads.same(hit, node.element) || isInside(hit, node.element, reads) {
    (verdict.current, verdict.identity) = (node.element, .handle)  // its frame unread, but the point reaches it
  } else if let hit, let found = recreatedHandle(of: node, near: hit, reads) {
    (verdict.current, verdict.identity, currentFrame) = (found.element, .recreated, found.frame)
  }
  guard let current = verdict.current else { return verdict }
  func judged(_ reason: StalePointReason) -> StalePointVerdict<Element> {
    StalePointVerdict(reason: reason, node: node, identity: verdict.identity, current: current, hitRole: hitRole)
  }
  // Judged in order: the node's frame, then the hit (the reasons name what was read, kept or refused).
  if let currentFrame, !holdsPoint(currentFrame, point) { return judged(.frameMoved) }
  guard let hit else { return judged(.noHit) }
  if reads.same(hit, current) { return judged(.sameElement) }
  guard let hitRole, stalePointInteractiveRoles.contains(hitRole) else { return judged(.nonInteractiveHit) }
  if isInside(current, hit, reads) { return judged(.hitAboveNode) }
  if !node.subtreeRecorded, isInside(hit, current, reads) { return judged(.unrecordedDescendant) }
  return judged(.interactiveHit)
}

/// The meta's `stalePoint` (#296): what the guard decided, why, how it found the node, the recorded node's role and the
/// hit's, and its own time. `verdict` "kept" | "refused" | "skipped", the last when the guard would have refused but #282's
/// element route carried the pointer instead, where the guard does not apply. Value-free: roles and enumeration words.
struct StalePointRecord: Equatable {
  enum Verdict: String { case kept, refused, skipped }
  var verdict: Verdict
  let reason: StalePointReason
  let identity: StalePointIdentity?
  let recordedRole: String?
  let hitRole: String?
  let ms: Double

  init<Element>(_ verdict: StalePointVerdict<Element>, ms: Double) {
    self.verdict = verdict.refused ? .refused : .kept
    reason = verdict.reason
    identity = verdict.identity
    recordedRole = verdict.node?.role
    hitRole = verdict.hitRole
    self.ms = ms
  }

  var wire: [String: Any] {
    var wire: [String: Any] = ["verdict": verdict.rawValue, "reason": reason.rawValue, "ms": (ms * 1000).rounded() / 1000]
    if let identity { wire["identity"] = identity.rawValue }
    if let recordedRole { wire["recordedRole"] = recordedRole }
    if let hitRole { wire["hitRole"] = hitRole }
    return wire
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
func screenChangedSinceScreenshot(was: String, reason: StalePointReason, now: String?) -> EngineError {
  let change: String
  switch reason {
  case .frameMoved: change = "has moved away from it"
  case .interactiveHit: change = "is no longer what it reaches"
  default: change = "is gone"
  }
  let there = now.map { "; \($0) is there now" } ?? ""
  return EngineError(name: "screenChangedSinceScreenshot",
    "The screen changed since the screenshot: the \(was) it showed at this point \(change)\(there). Nothing was sent. Call getScreenshot for a new screenshot, then give the coordinates in its pixels.")
}

/// The guard's outcome at a point: its meta record, and the refusal to throw (nil when it kept the pointer). The refusal
/// names what the point reaches now only when that is not the node itself (Chrome's hit-test may still answer a moved
/// control's handle at its old point).
func stalePointOutcome<Element>(_ verdict: StalePointVerdict<Element>, hit: Element?, ms: Double,
                                reads: StalePointReads<Element>) -> (record: StalePointRecord, refusal: EngineError?) {
  let record = StalePointRecord(verdict, ms: ms)
  guard verdict.refused, let node = verdict.node else { return (record, nil) }
  let was = stalePointName(role: node.role, title: node.title, description: node.description)
  var now: String?
  if let hit, !(verdict.current.map { reads.same(hit, $0) } ?? false) {
    now = stalePointName(role: verdict.hitRole, title: reads.title(hit), description: reads.description(hit))
  }
  return (record, screenChangedSinceScreenshot(was: was, reason: verdict.reason, now: now))
}

extension ConnectionState {
  /// The nodes the screenshot coordinates are placed in recorded (`ObservedScreenshot.nodes`); none without one.
  func screenshotNodes(app: ResolvedApp) -> [ScreenshotNode<AXUIElement>] { lineages[app.key]?.screenshot?.nodes ?? [] }
}

extension Engine {
  /// The guard at a coordinate pointer's posted point, live (`stalePointVerdict` over the Accessibility API), with `hit` the
  /// hit-test the action already took there; its time covers the reads it adds.
  func stalePointGuard(at point: CGPoint, hit: AXUIElement?, app: ResolvedApp, context: ExecutionContext) -> (record: StalePointRecord, refusal: EngineError?) {
    let started = monotonicMilliseconds()
    let reads = StalePointReads<AXUIElement>.live
    let verdict = stalePointVerdict(at: point, nodes: context.connection.screenshotNodes(app: app), hit: hit, reads: reads)
    return stalePointOutcome(verdict, hit: hit, ms: monotonicMilliseconds() - started, reads: reads)
  }
}
