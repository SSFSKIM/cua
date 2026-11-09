import ApplicationServices
import Foundation

// #328's scroll confirmation (the design session's ruling b1921fc3; the native engine spec's Decision Log, the #328
// entry). A posted wheel answered success whether or not anything moved. Now the scroll container of the element under
// the point is read before the wheel is posted and polled after it, and the answer says what was seen:
// - moved: success, the move in the meta;
// - the container's bar already at its end in the scroll's direction before the wheel: success at once, the wheel
//   posted (a wheel can chain to an outer scroller) and nothing polled, with a note, `atEnd` and `endBefore` in the
//   meta (the design session's condition 08d673c3: only a container with no readable end pays the whole window);
// - otherwise, after the fallback below: `scrollUnconfirmed`, including when the point has no readable container.
// The fallback, when nothing moved and the container's own bar is settable and not at its end: the bar's AXValue
// written by the requested delta (System Settings' content pane ignores every posted wheel, #328's spike), nothing
// posted, then polled again, where only the content, the tracked descendant or the hit counts (the bar reads back the
// value written whether or not the view moved). Never another container's bar, never at the end.
//
// The read-back is the spike's (`probe/328-measure`, scripts/probe-328/t328.swift `read`, `tracked`, `moved`), which saw
// 808 of 808 moves and no phantom: the bar's AXValue, the content's frame, and one descendant about 40% into the
// viewport (Chrome clips the frame of an element that scrolls off the top, so not one near it). Added here: the element
// under the point itself, when it lies inside the container and is smaller than it, since a nested scroller the tree
// exposes as no boundary at all (an overflow div with no scroll area and no page action) moves it while the container's
// own measures stay put; and the trailing edge of the tracked descendant and of the hit when, and only when, the
// leading edge sits pinned at a clipping edge before and after (`ScrollClips`), since one clipped there moves only its
// trailing edge. An element that merely grows (content appended below) is no move. The container is the nearest boundary of any kind, so the tracked descendant and the
// fallback's bar are both that boundary's own.

/// The poll after the wheel: every `scrollConfirmIntervalMs` until a move reads, at most `scrollConfirmWindowMs` from
/// the post. The spike's first move read at 50 ms p50, 101 ms p95; Chrome's tree trails its page by 150 to 200 ms, and
/// a script-delayed or rAF-animated page scroll read only at 258 to 285 and 712 to 762 ms (the hosted early read of
/// gate b, run 42535468711, where 300 ms left false scrollUnconfirmed answers and 800 none). The poll stops at the first
/// move, so only a scroll that moved nothing pays the whole window. Named so the hosted gate can re-price them.
let scrollConfirmIntervalMs: Double = 15
let scrollConfirmWindowMs: Double = 800
/// A move counts from this many points the asked way (the spike's 0.4, rounded up), or a bar this far the asked way
/// when the content's length cannot be read to scale it.
let scrollMovedMinimumPoints: Double = 0.5
let scrollBarMovedMinimum: Double = 0.0005
/// A bar reads at its end within this of 1 (down, right) or 0 (up, left); the spike's ends read exactly 1.0.
let scrollBarEndTolerance: Double = 0.001
/// The end told without the bar (the hosted A/B, run 42537713415: Settings' sidebar reads 0.976 to 0.986 at its real
/// bottom): a content frame that scrolls reaching the viewport's edge within `scrollEndEdgeTolerance` points; or the bar
/// within `scrollBarNearEnd` of its end while the content's last child (first, scrolling up) lies inside the viewport's
/// edge within that tolerance. 0.03 holds the sidebar's 0.976 to 0.986 and no more (round 4: a virtualized list's bar
/// at 0.96 had 32 points to go).
let scrollEndEdgeTolerance: CGFloat = 1
let scrollBarNearEnd: Double = 0.03
/// The levels walked up from the element under the point to its container, and the tracked descendant's walk: at most
/// this many nodes, this deep below the container, aimed this far into the viewport, stopping at the first candidate
/// whose leading edge lies in `scrollTrackedBand` of it (the hosted A/B: the spike's 800 nodes cost Chrome 96 to 202 ms
/// before every wheel, and the hit and the content did most of the confirming there).
let scrollContainerLevels = 300
let scrollTrackedBudget = 200
let scrollTrackedDepth = 10
let scrollTrackedAim: CGFloat = 0.4
let scrollTrackedBand: (CGFloat, CGFloat) = (0.25, 0.6)
/// The window scan for a hit whose chain holds no container (System Settings' content pane): at most this many nodes,
/// this deep.
let scrollWindowScanBudget = 3000
let scrollWindowScanDepth = 30

/// What the container is: the nearest scrolling boundary at or above the element under the point, whichever kind comes
/// first: an AXScrollArea, an AXWebArea that is not its scroll area's own page (an iframe's document, or a page with no
/// scroll area around it), or an element that advertises a page scroll (Catalyst's UIKit has no AXScrollArea; a page's
/// own scrolling element).
enum ScrollContainerKind: String { case scrollArea, pageScroller, webArea }

/// The container of `hit` that a scroll there moves, through `ax`: the nearest boundary, in one walk up to its window;
/// nil when none lies between them. A nested scroller is its own container, so the fallback never writes the bar of
/// one around it (#328's review, P1). A web area whose parent is an AXScrollArea is that scroll area's page: the scroll
/// area, the next level, is the boundary, and holds the bar.
func scrollContainer(of hit: AXUIElement, ax: AXOps) -> (element: AXUIElement, kind: ScrollContainerKind)? {
  scrollContainerPath(of: hit, ax: ax).map { ($0.element, $0.kind) }
}

/// `scrollContainer` with the path walked below it: the hit and each ancestor up to the container (not included), with
/// their roles.
func scrollContainerPath(of hit: AXUIElement, ax: AXOps)
  -> (element: AXUIElement, kind: ScrollContainerKind, path: [(element: AXUIElement, role: String)])? {
  var path: [(element: AXUIElement, role: String)] = []
  var current: AXUIElement? = hit
  while let node = current, path.count < scrollContainerLevels {
    let role = ax.role(node) ?? ""
    if role == kAXWindowRole || role == kAXApplicationRole { return nil }
    if role == kAXScrollAreaRole { return (node, .scrollArea, path) }
    let parent = ax.parent(node)
    if role == "AXWebArea" {
      if parent.map({ ax.role($0) != kAXScrollAreaRole }) ?? true { return (node, .webArea, path) }
    } else if !pageScrollActions.isDisjoint(with: ax.actions(node)) {
      // UIKit (Catalyst) gives every row and label of a scroll view the page actions: the boundary is the top of the run
      // of ancestors that all advertise them, not the hit itself (the hosted A/B: 3 of 3 false answers on a table).
      // An element with a scroll bar of its own is a boundary: the run stops there (round 4's P1: two genuinely nested
      // page-scrolling groups).
      let ownsBar = { (element: AXUIElement) in
        ax.element(element, kAXVerticalScrollBarAttribute) != nil || ax.element(element, kAXHorizontalScrollBarAttribute) != nil
      }
      var top = (element: node, role: role), up = parent
      while let next = up, path.count < scrollContainerLevels, !ownsBar(top.element) {
        let nextRole = ax.role(next) ?? ""
        if [kAXScrollAreaRole, "AXWebArea", kAXWindowRole, kAXApplicationRole].contains(nextRole)
          || pageScrollActions.isDisjoint(with: ax.actions(next)) { break }
        path.append(top)
        top = (next, nextRole)
        up = ax.parent(next)
      }
      return (top.element, .pageScroller, path)
    }
    path.append((node, role))
    current = parent
  }
  return nil
}

/// The deepest AXScrollArea in `window` whose frame holds `point`, for a hit whose chain holds no container (System
/// Settings' content pane, whose hit-test answers an element outside its scroll area): still the scroller under the
/// point, never a sibling, nor an outer one when a deeper one holds the point. Subtrees whose frame does not hold the
/// point are not walked.
func scrollAreaUnder(_ point: CGPoint, in window: AXUIElement, ax: AXOps) -> AXUIElement? {
  var budget = scrollWindowScanBudget
  var deepest: (element: AXUIElement, depth: Int)?
  func walk(_ element: AXUIElement, _ depth: Int) {
    guard budget > 0, depth < scrollWindowScanDepth else { return }
    budget -= 1
    if let frame = ax.frame(element), !frame.isEmpty, !frame.contains(point) { return }
    // Passed through when frameless or empty; selected only when its own non-empty frame holds the point (round 4's P1).
    if ax.role(element) == kAXScrollAreaRole, let frame = ax.frame(element), !frame.isEmpty, frame.contains(point),
       depth > (deepest?.depth ?? -1) { deepest = (element, depth) }
    for child in ax.children(element) { walk(child, depth + 1) }
  }
  walk(window, 0)
  return deepest?.element
}

/// Why the fallback may not write the container's bar though nothing moved: the hit lies in web content, where all three
/// browsers expose a nested overflow div as a plain AXGroup with no bar and no page action (and Chrome an iframe too),
/// so a nearer scroller the tree cannot see may have taken the wheel (`web`: a web area on the path, as the container,
/// or as its content); or an element between the hit and the container, smaller than the container on the axis, does
/// not hold the hit's frame there, which is an unexposed scroller clipping it (`clipped`). Nil: the container is the
/// hit's nearest scrollable ancestor as far as the tree can tell, and the fallback may write.
enum ScrollFallbackSkip: String { case web, clipped }

func scrollFallbackSkip(path: [(element: AXUIElement, role: String)], container: AXUIElement, kind: ScrollContainerKind,
                        content: AXUIElement?, horizontal: Bool, ax: AXOps) -> ScrollFallbackSkip? {
  if kind == .webArea || path.contains(where: { $0.role == "AXWebArea" }) || content.flatMap(ax.role) == "AXWebArea" { return .web }
  guard let hit = path.first.flatMap({ ax.frame($0.element) }), let area = ax.frame(container) else { return nil }
  let span = { (frame: CGRect) in horizontal ? (frame.minX, frame.maxX) : (frame.minY, frame.maxY) }
  let (hitStart, hitEnd) = span(hit), (areaStart, areaEnd) = span(area)
  for (element, _) in path.dropFirst() {
    guard let frame = ax.frame(element) else { continue }
    let (start, end) = span(frame)
    if end - start < areaEnd - areaStart, hitStart < start - 0.5 || hitEnd > end + 0.5 { return .clipped }
  }
  return nil
}

/// The fixed parts of a container, read once before the wheel: its frame (the viewport), its content, its bar on the
/// scroll's axis, the content's length on it, the tracked descendant and the element under the point when it counts.
struct ScrollGeometry {
  let container: AXUIElement
  let kind: ScrollContainerKind
  let horizontal: Bool
  let viewport: CGRect?
  let content: AXUIElement?
  let bar: AXUIElement?
  /// The content's length on the axis: its frame's, or the container's AXContentSize where the frame is no longer than
  /// the viewport (a web area whose frame stays put while its page scrolls).
  let contentLength: CGFloat?
  let tracked: AXUIElement?
  let hit: AXUIElement?
  /// The nodes the tracked descendant's walk read.
  let walked: Int
  /// The content's child at the end the scroll goes toward (its last scrolling down or right, its first up or left), for
  /// the end told without the bar; a scroll area's only.
  var edgeChild: AXUIElement? = nil
  /// The leading edges a measure may sit clipped at.
  var clips = ScrollClips()

  /// The content's length beyond the viewport on the axis, which a bar's 0…1 spans; nil when it does not scroll.
  var scrollableLength: CGFloat? {
    guard let contentLength, let viewport else { return nil }
    let length = contentLength - (horizontal ? viewport.width : viewport.height)
    return length > 0 ? length : nil
  }
}

/// An element's leading and trailing edges on the scroll's axis. Both are kept: an element clipped at its scroller's
/// leading edge keeps that edge while the scroll shrinks it from there, and moves only its trailing one (#328's review,
/// P2: an overflow div's text under the point, clipped at the div's top). The trailing edge counts only for such a
/// clipped element (`ScrollClips`, the re-review's P2).
struct ScrollEdges: Equatable {
  var lead: CGFloat
  var trail: CGFloat
}

/// One reading of a container: the bar's value and the edges, on the axis, of the content, the tracked descendant and
/// the element under the point (nil where it does not read).
struct ScrollReading: Equatable {
  var bar: Double?
  var content: ScrollEdges?
  var tracked: ScrollEdges?
  var hit: ScrollEdges?
  /// The geometry's edge child.
  var edgeChild: ScrollEdges? = nil
}

/// The clipping edges, on the axis, a measure's leading edge can sit pinned at: the viewport's (the container's frame)
/// for the tracked descendant and the hit, and for the hit also each ancestor's between it and the container (an
/// unexposed scroller clips it at its own edge), read once before the wheel. The content has none: a scroll area's
/// document is not clipped, and a web area's frame does not move.
struct ScrollClips {
  var viewport: CGFloat?
  var hitAncestors: [CGFloat] = []
}

private func edges(_ frame: CGRect?, horizontal: Bool) -> ScrollEdges? {
  frame.map { horizontal ? ScrollEdges(lead: $0.minX, trail: $0.maxX) : ScrollEdges(lead: $0.minY, trail: $0.maxY) }
}

/// The content a container moves: its AXContents' first element, else its first child that is not a scroll bar (the
/// spike's `contentOf`, for every kind: a Catalyst table's first row moved where nothing else measured did).
private func scrollContent(_ container: AXUIElement, kind: ScrollContainerKind, ax: AXOps) -> AXUIElement? {
  if let first = elementList(ax.read(container, kAXContentsAttribute)).first { return first }
  return ax.children(container).first { ax.role($0) != kAXScrollBarRole }
}

/// A descendant of the container wholly inside the viewport on the axis, its leading edge nearest `scrollTrackedAim`
/// into it, shorter than 30% of it and longer than 2 points (the spike's `tracked`, on either axis). Subtrees whose frame
/// lies wholly outside the viewport are not walked (added to the spike's walk to bound its cost on a long page), nor are
/// scroll bars; the walk stops at the first candidate whose leading edge lies in `scrollTrackedBand` of the viewport.
func trackedDescendant(of container: AXUIElement, viewport: CGRect, horizontal: Bool, ax: AXOps) -> (element: AXUIElement?, walked: Int) {
  let (start, length) = horizontal ? (viewport.minX, viewport.width) : (viewport.minY, viewport.height)
  let aim = start + length * scrollTrackedAim
  let band = (start + length * scrollTrackedBand.0)...(start + length * scrollTrackedBand.1)
  var budget = scrollTrackedBudget
  var best: (element: AXUIElement, distance: CGFloat)?
  var settled = false
  func walk(_ element: AXUIElement, _ depth: Int) {
    guard budget > 0, depth < scrollTrackedDepth, !settled else { return }
    budget -= 1
    if ax.role(element) == kAXScrollBarRole { return }
    let frame = ax.frame(element)
    if depth > 0, let frame {
      if !frame.isEmpty, !frame.intersects(viewport) { return }
      let (lead, extent) = horizontal ? (frame.minX, frame.width) : (frame.minY, frame.height)
      if extent > 2, extent < length * 0.3, lead >= start, lead + extent <= start + length {
        let distance = abs(lead - aim)
        if best == nil || distance < best!.distance { best = (element, distance) }
        if band.contains(lead) { best = (element, distance); settled = true; return }
      }
    }
    for child in ax.children(element) { walk(child, depth + 1) }
  }
  walk(container, 0)
  return (best?.element, scrollTrackedBudget - budget)
}

/// The container's fixed parts for a scroll on `horizontal`'s axis, and the element under the point when it lies inside
/// the container (not the container itself) and is shorter than the viewport on the axis.
func scrollGeometry(_ container: AXUIElement, kind: ScrollContainerKind, hit: AXUIElement?, horizontal: Bool, ax: AXOps,
                    hitAncestors: [AXUIElement] = [], towardEnd: Bool = true) -> ScrollGeometry {
  let viewport = ax.frame(container)
  let content = scrollContent(container, kind: kind, ax: ax)
  let bar = ax.element(container, horizontal ? kAXHorizontalScrollBarAttribute : kAXVerticalScrollBarAttribute)
  // The document's extent: a scroll area's content frame, or AXContentSize. A page scroller's or a web area's first
  // child is a movement probe only, never the extent (round 4's P2).
  var contentLength = kind == .scrollArea ? content.flatMap(ax.frame).map { horizontal ? $0.width : $0.height } : nil
  if let viewport, (contentLength ?? 0) <= (horizontal ? viewport.width : viewport.height) + 1,
     let extent = size(ax.read(container, "AXContentSize")) {
    let length = horizontal ? extent.width : extent.height
    if length > (horizontal ? viewport.width : viewport.height) { contentLength = length }
  }
  let tracked = viewport.map { trackedDescendant(of: container, viewport: $0, horizontal: horizontal, ax: ax) } ?? (element: nil, walked: 0)
  var counted: AXUIElement?
  if let hit, let viewport, !ax.same(hit, container), let frame = ax.frame(hit),
     (horizontal ? frame.width : frame.height) < (horizontal ? viewport.width : viewport.height) {
    counted = hit
  }
  let lead = { (frame: CGRect) in horizontal ? frame.minX : frame.minY }
  let clips = ScrollClips(viewport: viewport.map(lead), hitAncestors: counted == nil ? [] : hitAncestors.compactMap { ax.frame($0).map(lead) })
  let children = kind == .scrollArea ? (content.map(ax.children) ?? []) : []
  let edgeChild = towardEnd ? children.last : children.first
  return ScrollGeometry(container: container, kind: kind, horizontal: horizontal, viewport: viewport, content: content, bar: bar,
                        contentLength: contentLength, tracked: tracked.element, hit: counted, walked: tracked.walked,
                        edgeChild: edgeChild, clips: clips)
}

func readScroll(_ geometry: ScrollGeometry, ax: AXOps) -> ScrollReading {
  let horizontal = geometry.horizontal
  return ScrollReading(bar: geometry.bar.flatMap { scrollNumber(ax.read($0, kAXValueAttribute)) },
                       content: edges(geometry.content.flatMap(ax.frame), horizontal: horizontal),
                       tracked: edges(geometry.tracked.flatMap(ax.frame), horizontal: horizontal),
                       hit: edges(geometry.hit.flatMap(ax.frame), horizontal: horizontal),
                       edgeChild: edges(geometry.edgeChild.flatMap(ax.frame), horizontal: horizontal))
}

private func scrollNumber(_ value: CFTypeRef?) -> Double? {
  guard let value, CFGetTypeID(value) == CFNumberGetTypeID() else { return nil }
  return (value as! NSNumber).doubleValue
}

/// +1 when the scroll goes toward the content's end (down, right: the bar's value grows), −1 toward its start.
func scrollSign(_ direction: ScrollDirection) -> Double { direction == .down || direction == .right ? 1 : -1 }

/// The move between two readings the asked way, in points (positive: the way asked), by the first measure that moved
/// at least the minimum that way: the content, the tracked descendant, the element under the point (each moves against
/// the scroll, by its leading edge, or for the descendant and the hit by the trailing one while the leading edge sits
/// pinned at one of `clips`' edges before and after), then the bar times the scrollable length. A bar alone, its length unread, counts by its own minimum
/// with no points. Nil when nothing moved the asked way. `countsBar` false leaves the bar out: after the fallback's
/// write it reads back the value written whether or not the view moved.
func scrollMove(_ before: ScrollReading, _ after: ScrollReading, direction: ScrollDirection, scrollable: CGFloat?,
                countsBar: Bool = true, clips: ScrollClips = ScrollClips()) -> (points: Double?, by: String)? {
  let sign = scrollSign(direction)
  let viewport = clips.viewport.map { [$0] } ?? []
  let measures: [(String, ScrollEdges?, ScrollEdges?, [CGFloat])] = [("content", before.content, after.content, []),
                                                                     ("tracked", before.tracked, after.tracked, viewport),
                                                                     ("hit", before.hit, after.hit, viewport + clips.hitAncestors)]
  for (name, a, b, pins) in measures {
    guard let a, let b else { continue }
    let lead = Double(a.lead - b.lead) * sign
    if lead >= scrollMovedMinimumPoints { return (lead, name) }
    // Clipped at a pin before and after: its visible size changes the way the asked scroll clips it (down or right
    // shrinks it from the pinned edge, up or left uncovers it there), which is its trailing edge moving the asked way.
    guard pins.contains(where: { abs(a.lead - $0) <= 0.5 && abs(b.lead - $0) <= 0.5 }) else { continue }
    let trail = Double(a.trail - b.trail) * sign
    if trail >= scrollMovedMinimumPoints { return (trail, name) }
  }
  if countsBar, let a = before.bar, let b = after.bar {
    let moved = (b - a) * sign
    if let scrollable, moved * Double(scrollable) >= scrollMovedMinimumPoints { return (moved * Double(scrollable), "bar") }
    if scrollable == nil, moved >= scrollBarMovedMinimum { return (nil, "bar") }
  }
  return nil
}

/// Whether a reading is at the content's end in the scroll's direction: its bar at 1 (down or right) or 0 (up or left);
/// or, given the geometry, a content frame longer than the viewport whose edge that way has reached the viewport's
/// within `scrollEndEdgeTolerance` (a content frame no longer than the viewport is clipped to it, as Settings' sidebar
/// outline is, and tells nothing); or the bar within `scrollBarNearEnd` of its end while the content's edge child lies
/// inside the viewport's edge that way. False when nothing tells it.
func scrollAtEnd(_ reading: ScrollReading, direction: ScrollDirection, geometry: ScrollGeometry? = nil) -> Bool {
  let towardEnd = scrollSign(direction) > 0
  if let bar = reading.bar, towardEnd ? bar >= 1 - scrollBarEndTolerance : bar <= scrollBarEndTolerance { return true }
  guard let geometry, let viewport = geometry.viewport else { return false }
  let (viewLead, viewTrail) = geometry.horizontal ? (viewport.minX, viewport.maxX) : (viewport.minY, viewport.maxY)
  let reached = { (edges: ScrollEdges) in
    towardEnd ? edges.trail <= viewTrail + scrollEndEdgeTolerance : edges.lead >= viewLead - scrollEndEdgeTolerance
  }
  // A scroll area's content frame is the document's extent; a page scroller's first child is not (round 4's P2).
  let document = geometry.kind == .scrollArea ? reading.content.flatMap { content in
    content.trail - content.lead > viewTrail - viewLead + scrollEndEdgeTolerance ? content : nil
  } : nil
  if let document { return reached(document) }  // it tells the end, and the edge child never overrides it
  if let bar = reading.bar, towardEnd ? bar >= 1 - scrollBarNearEnd : bar <= scrollBarNearEnd, let child = reading.edgeChild,
     child.lead >= viewLead - scrollEndEdgeTolerance, child.trail <= viewTrail + scrollEndEdgeTolerance {
    return true  // the edge child wholly inside the viewport (round 4's P2)
  }
  return false
}

/// Whether a bar reads within `scrollBarNearEnd` of its end in the scroll's direction; false unread.
func scrollBarNearItsEnd(_ bar: Double?, direction: ScrollDirection) -> Bool {
  guard let bar else { return false }
  return scrollSign(direction) > 0 ? bar >= 1 - scrollBarNearEnd : bar <= scrollBarNearEnd
}

/// The bar value the fallback writes: the current value moved by `delta` points over the scrollable length, the way
/// asked, clamped to 0…1. Its precision is the lengths': the content's and the viewport's frames are in points, so a
/// move lands within the app's own rounding plus delta × (the lengths' error / the scrollable length); a scroll area
/// whose frame includes a bar across the axis overstates the viewport by that bar's thickness.
func scrollBarTarget(from value: Double, delta: Int32, scrollable: CGFloat, direction: ScrollDirection) -> Double {
  min(max(value + scrollSign(direction) * Double(abs(delta)) / Double(scrollable), 0), 1)
}

enum ScrollOutcome: String { case moved, atEnd, unconfirmed }

/// The meta's `scroll`: what the confirmation read and decided.
struct ScrollConfirmRecord: Equatable {
  var container: ScrollContainerKind?
  var outcome: ScrollOutcome = .unconfirmed
  /// The move the asked way in points, and the measure that saw it.
  var moved: Double?
  var by: String?
  /// The bar's value before the wheel and at the last reading.
  var barBefore: Double?
  var barAfter: Double?
  /// Milliseconds from the post (or the fallback's write) to the first reading that moved.
  var firstMoveMs: Double?
  var polls = 0
  /// The fallback's write: the bar's value written and the write's AXError when not success.
  var barWrite: Double?
  var barWriteError: Int32?
  /// Why the fallback did not write though it otherwise would have (`scrollFallbackSkip`).
  var fallbackSkipped: ScrollFallbackSkip?
  /// The end was read before the wheel, and the answer given then (always so for `atEnd`).
  var endBefore = false
  /// "window" when the container was found by the window scan (`scrollAreaUnder`), not on the hit's chain.
  var containerBy: String?
  var walked = 0
  /// The reading before the wheel (the container, its geometry and the walk), and the whole confirmation.
  var readMs: Double = 0
  var ms: Double = 0

  var wire: [String: Any] {
    var wire: [String: Any] = ["container": container?.rawValue ?? NSNull(), "outcome": outcome.rawValue, "polls": polls,
                               "readMs": rounded(readMs), "ms": rounded(ms)]
    if outcome == .atEnd { wire["atEnd"] = true }
    if endBefore { wire["endBefore"] = true }
    if let containerBy { wire["containerBy"] = containerBy }
    if let moved { wire["moved"] = rounded(moved) }
    if let by { wire["by"] = by }
    if let barBefore { wire["barBefore"] = rounded(barBefore, 10_000) }
    if let barAfter { wire["barAfter"] = rounded(barAfter, 10_000) }
    if let firstMoveMs { wire["firstMoveMs"] = rounded(firstMoveMs) }
    if let barWrite { wire["barWrite"] = rounded(barWrite, 10_000) }
    if let barWriteError { wire["barWriteError"] = Int(barWriteError) }
    if let fallbackSkipped { wire["fallbackSkipped"] = fallbackSkipped.rawValue }
    if container != nil { wire["walked"] = walked }
    return wire
  }
}

private func rounded(_ value: Double, _ scale: Double = 10) -> Double { (value * scale).rounded() / scale }

/// A scroll confirmed through `ax`: the container of `hit` read, `post` run (the wheel), the container polled; when
/// nothing moved and the end does not explain it, the fallback's bar write (`beforeWriting` first: the in-flight
/// intervention check), polled again. Throws only what `post` or `beforeWriting` throw.
func confirmScroll(hit: AXUIElement?, direction: ScrollDirection, delta: Int32, ax: AXOps, window: AXUIElement? = nil,
                   point: CGPoint? = nil, post: () throws -> Void, beforeWriting: () throws -> Void = {}) throws -> ScrollConfirmRecord {
  let started = ax.now()
  var record = ScrollConfirmRecord()
  try confirming(&record, hit: hit, direction: direction, delta: delta, ax: ax, window: window, point: point, post: post,
                 beforeWriting: beforeWriting)
  record.ms = ax.now() - started
  return record
}

private func confirming(_ record: inout ScrollConfirmRecord, hit: AXUIElement?, direction: ScrollDirection, delta: Int32, ax: AXOps,
                        window: AXUIElement?, point: CGPoint?, post: () throws -> Void, beforeWriting: () throws -> Void) throws {
  let started = ax.now()
  var found = hit.flatMap { scrollContainerPath(of: $0, ax: ax) }
  if found == nil, let window, let point, let area = scrollAreaUnder(point, in: window, ax: ax) {
    found = (area, .scrollArea, [])
    record.containerBy = "window"
  }
  let geometry = found.map { scrollGeometry($0.element, kind: $0.kind, hit: hit, horizontal: direction.horizontal, ax: ax,
                                            hitAncestors: $0.path.dropFirst().map(\.element), towardEnd: scrollSign(direction) > 0) }
  let before = geometry.map { readScroll($0, ax: ax) }
  record.container = found?.kind
  record.walked = geometry?.walked ?? 0
  record.barBefore = before?.bar
  record.readMs = ax.now() - started
  try post()
  guard let geometry, let before else { return }
  // At its end before the wheel: answered at once, no poll and no fallback. The wheel went all the same, as before, so a
  // scroller around this one can take it.
  if scrollAtEnd(before, direction: direction, geometry: geometry) {
    record.outcome = .atEnd
    record.endBefore = true
    return
  }

  /// Polls from now for a move against `before`; the last reading.
  func poll(countsBar: Bool) -> ScrollReading {
    let from = ax.now()
    var last = before
    repeat {
      ax.sleep(scrollConfirmIntervalMs)
      last = readScroll(geometry, ax: ax)
      record.polls += 1
      if let move = scrollMove(before, last, direction: direction, scrollable: geometry.scrollableLength, countsBar: countsBar,
                               clips: geometry.clips) {
        record.outcome = .moved
        (record.moved, record.by) = move
        record.firstMoveMs = ax.now() - from
        break
      }
    } while ax.now() - from < scrollConfirmWindowMs
    record.barAfter = last.bar
    return last
  }

  let after = poll(countsBar: true)
  if record.outcome == .moved { return }
  // The end judged after the wheel (the final hosted pass, run 42546633581: Settings' sidebar reads 0.976 at its real
  // bottom with its last row clipped, so the strict rule before the wheel does not call it the end): the wheel went and
  // nothing moved within the window, the bar near its end before and after. A list with content left would have moved.
  if scrollBarNearItsEnd(before.bar, direction: direction) && scrollBarNearItsEnd(after.bar, direction: direction) {
    record.outcome = .atEnd
    return
  }
  // The fallback never writes a bar already near its end, whatever the end rule says.
  guard let bar = geometry.bar, let value = after.bar, !scrollAtEnd(after, direction: direction, geometry: geometry),
        !scrollBarNearItsEnd(value, direction: direction),
        let scrollable = geometry.scrollableLength, ax.isSettable(bar, kAXValueAttribute), let found,
        found.kind == .scrollArea else { return }  // never a page scroller's or a web area's (round 4's P1)
  if let skip = scrollFallbackSkip(path: found.path, container: found.element, kind: found.kind, content: geometry.content,
                                   horizontal: direction.horizontal, ax: ax) {
    record.fallbackSkipped = skip
    return
  }
  let target = scrollBarTarget(from: value, delta: delta, scrollable: scrollable, direction: direction)
  try beforeWriting()
  record.barWrite = target
  let error = ax.write(bar, kAXValueAttribute, NSNumber(value: target))
  guard error == .success else {
    record.barWriteError = error.rawValue
    return
  }
  _ = poll(countsBar: false)  // the move must show in the content, the tracked descendant or the hit
}

/// The scroll's answer from its confirmation: nil (success) when it moved, the at-end note, or `scrollUnconfirmed`.
func scrollAnswer(_ record: ScrollConfirmRecord, direction: ScrollDirection, app: String) throws -> String? {
  switch record.outcome {
  case .moved: return nil
  case .atEnd: return "What is at that point in \(app) is already scrolled as far \(direction.rawValue) as it goes."
  case .unconfirmed: throw scrollUnconfirmed(app: app)
  }
}

func scrollUnconfirmed(app: String) -> EngineError {
  EngineError(name: "scrollUnconfirmed",
    "The scroll was sent to \(app), but nothing at that point was seen to move. Observe the app (take a screenshot or call getAXState()) before scrolling again.")
}
