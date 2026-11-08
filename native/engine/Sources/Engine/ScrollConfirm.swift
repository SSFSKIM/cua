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
// own measures stay put; and both edges of each element on the axis, since one clipped at its scroller's leading edge
// moves only its trailing one. The container is the nearest boundary of any kind, so the tracked descendant and the
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
/// The levels walked up from the element under the point to its container, and the tracked descendant's walk: at most
/// this many nodes (the spike's 800), this deep below the container, aimed this far into the viewport.
let scrollContainerLevels = 300
let scrollTrackedBudget = 800
let scrollTrackedDepth = 10
let scrollTrackedAim: CGFloat = 0.4

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
      return (node, .pageScroller, path)
    }
    path.append((node, role))
    current = parent
  }
  return nil
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

  /// The content's length beyond the viewport on the axis, which a bar's 0…1 spans; nil when it does not scroll.
  var scrollableLength: CGFloat? {
    guard let contentLength, let viewport else { return nil }
    let length = contentLength - (horizontal ? viewport.width : viewport.height)
    return length > 0 ? length : nil
  }
}

/// An element's leading and trailing edges on the scroll's axis. Both are kept: an element clipped at its scroller's
/// leading edge keeps that edge while the scroll shrinks it from there, and moves only its trailing one (#328's review,
/// P2: an overflow div's text under the point, clipped at the div's top).
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
}

private func edges(_ frame: CGRect?, horizontal: Bool) -> ScrollEdges? {
  frame.map { horizontal ? ScrollEdges(lead: $0.minX, trail: $0.maxX) : ScrollEdges(lead: $0.minY, trail: $0.maxY) }
}

/// The content a scroll area moves: its AXContents' first element, else its first child that is not a scroll bar (the
/// spike's `contentOf`). A page scroller or a web area is its own content.
private func scrollContent(_ container: AXUIElement, kind: ScrollContainerKind, ax: AXOps) -> AXUIElement? {
  guard kind == .scrollArea else { return nil }
  if let first = elementList(ax.read(container, kAXContentsAttribute)).first { return first }
  return ax.children(container).first { ax.role($0) != kAXScrollBarRole }
}

/// A descendant of the container wholly inside the viewport on the axis, its leading edge nearest `scrollTrackedAim`
/// into it, shorter than 30% of it and longer than 2 points (the spike's `tracked`, on either axis). Subtrees whose frame
/// lies wholly outside the viewport are not walked (added to the spike's walk to bound its cost on a long page), nor are
/// scroll bars; the walk stops at a candidate within 2 points of the aim.
private func trackedDescendant(of container: AXUIElement, viewport: CGRect, horizontal: Bool, ax: AXOps) -> (element: AXUIElement?, walked: Int) {
  let (start, length) = horizontal ? (viewport.minX, viewport.width) : (viewport.minY, viewport.height)
  let aim = start + length * scrollTrackedAim
  var budget = scrollTrackedBudget
  var best: (element: AXUIElement, distance: CGFloat)?
  func walk(_ element: AXUIElement, _ depth: Int) {
    guard budget > 0, depth < scrollTrackedDepth, (best?.distance ?? .infinity) > 2 else { return }
    budget -= 1
    if ax.role(element) == kAXScrollBarRole { return }
    let frame = ax.frame(element)
    if depth > 0, let frame {
      if !frame.isEmpty, !frame.intersects(viewport) { return }
      let (lead, extent) = horizontal ? (frame.minX, frame.width) : (frame.minY, frame.height)
      if extent > 2, extent < length * 0.3, lead >= start, lead + extent <= start + length {
        let distance = abs(lead - aim)
        if best == nil || distance < best!.distance { best = (element, distance) }
      }
    }
    for child in ax.children(element) { walk(child, depth + 1) }
  }
  walk(container, 0)
  return (best?.element, scrollTrackedBudget - budget)
}

/// The container's fixed parts for a scroll on `horizontal`'s axis, and the element under the point when it lies inside
/// the container (not the container itself) and is shorter than the viewport on the axis.
func scrollGeometry(_ container: AXUIElement, kind: ScrollContainerKind, hit: AXUIElement?, horizontal: Bool, ax: AXOps) -> ScrollGeometry {
  let viewport = ax.frame(container)
  let content = scrollContent(container, kind: kind, ax: ax)
  let bar = ax.element(container, horizontal ? kAXHorizontalScrollBarAttribute : kAXVerticalScrollBarAttribute)
  var contentLength = content.flatMap(ax.frame).map { horizontal ? $0.width : $0.height }
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
  return ScrollGeometry(container: container, kind: kind, horizontal: horizontal, viewport: viewport, content: content, bar: bar,
                        contentLength: contentLength, tracked: tracked.element, hit: counted, walked: tracked.walked)
}

func readScroll(_ geometry: ScrollGeometry, ax: AXOps) -> ScrollReading {
  let horizontal = geometry.horizontal
  return ScrollReading(bar: geometry.bar.flatMap { scrollNumber(ax.read($0, kAXValueAttribute)) },
                       content: edges(geometry.content.flatMap(ax.frame), horizontal: horizontal),
                       tracked: edges(geometry.tracked.flatMap(ax.frame), horizontal: horizontal),
                       hit: edges(geometry.hit.flatMap(ax.frame), horizontal: horizontal))
}

private func scrollNumber(_ value: CFTypeRef?) -> Double? {
  guard let value, CFGetTypeID(value) == CFNumberGetTypeID() else { return nil }
  return (value as! NSNumber).doubleValue
}

/// +1 when the scroll goes toward the content's end (down, right: the bar's value grows), −1 toward its start.
func scrollSign(_ direction: ScrollDirection) -> Double { direction == .down || direction == .right ? 1 : -1 }

/// The move between two readings the asked way, in points (positive: the way asked), by the first measure that moved
/// at least the minimum that way: the content, the tracked descendant, the element under the point (each moves against
/// the scroll, by its leading edge or else its trailing one), then the bar times the scrollable length. A bar alone, its length unread, counts by its own minimum
/// with no points. Nil when nothing moved the asked way. `countsBar` false leaves the bar out: after the fallback's
/// write it reads back the value written whether or not the view moved.
func scrollMove(_ before: ScrollReading, _ after: ScrollReading, direction: ScrollDirection, scrollable: CGFloat?,
                countsBar: Bool = true) -> (points: Double?, by: String)? {
  let sign = scrollSign(direction)
  let measures: [(String, ScrollEdges?, ScrollEdges?)] = [("content", before.content, after.content), ("tracked", before.tracked, after.tracked),
                                                          ("hit", before.hit, after.hit)]
  for (name, a, b) in measures {
    guard let a, let b else { continue }
    let lead = Double(a.lead - b.lead) * sign
    if lead >= scrollMovedMinimumPoints { return (lead, name) }
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

/// Whether a reading's bar is at its end in the scroll's direction (1 down or right, 0 up or left); false unread.
func scrollAtEnd(_ reading: ScrollReading, direction: ScrollDirection) -> Bool {
  guard let bar = reading.bar else { return false }
  return scrollSign(direction) > 0 ? bar >= 1 - scrollBarEndTolerance : bar <= scrollBarEndTolerance
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
  var walked = 0
  /// The reading before the wheel (the container, its geometry and the walk), and the whole confirmation.
  var readMs: Double = 0
  var ms: Double = 0

  var wire: [String: Any] {
    var wire: [String: Any] = ["container": container?.rawValue ?? NSNull(), "outcome": outcome.rawValue, "polls": polls,
                               "readMs": rounded(readMs), "ms": rounded(ms)]
    if outcome == .atEnd { wire["atEnd"] = true }
    if endBefore { wire["endBefore"] = true }
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
func confirmScroll(hit: AXUIElement?, direction: ScrollDirection, delta: Int32, ax: AXOps,
                   post: () throws -> Void, beforeWriting: () throws -> Void = {}) throws -> ScrollConfirmRecord {
  let started = ax.now()
  var record = ScrollConfirmRecord()
  try confirming(&record, hit: hit, direction: direction, delta: delta, ax: ax, post: post, beforeWriting: beforeWriting)
  record.ms = ax.now() - started
  return record
}

private func confirming(_ record: inout ScrollConfirmRecord, hit: AXUIElement?, direction: ScrollDirection, delta: Int32, ax: AXOps,
                        post: () throws -> Void, beforeWriting: () throws -> Void) throws {
  let started = ax.now()
  let found = hit.flatMap { scrollContainerPath(of: $0, ax: ax) }
  let geometry = found.map { scrollGeometry($0.element, kind: $0.kind, hit: hit, horizontal: direction.horizontal, ax: ax) }
  let before = geometry.map { readScroll($0, ax: ax) }
  record.container = found?.kind
  record.walked = geometry?.walked ?? 0
  record.barBefore = before?.bar
  record.readMs = ax.now() - started
  try post()
  guard let geometry, let before else { return }
  // At its end before the wheel: answered at once, no poll and no fallback. The wheel went all the same, as before, so a
  // scroller around this one can take it.
  if scrollAtEnd(before, direction: direction) {
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
      if let move = scrollMove(before, last, direction: direction, scrollable: geometry.scrollableLength, countsBar: countsBar) {
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
  guard let bar = geometry.bar, let value = after.bar, !scrollAtEnd(after, direction: direction),
        let scrollable = geometry.scrollableLength, ax.isSettable(bar, kAXValueAttribute), let found else { return }
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
