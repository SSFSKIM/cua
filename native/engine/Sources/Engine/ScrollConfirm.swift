import ApplicationServices
import Foundation

// #328's scroll confirmation (the design session's ruling b1921fc3; the native engine spec's Decision Log, the #328
// entry). A posted wheel answered success whether or not anything moved. Now the scroll container of the element under
// the point is read before the wheel is posted and polled after it, and the answer says what was seen:
// - moved: success, the move in the meta;
// - nothing moved and the container reads at its end in the scroll's direction, before and after: success with a note,
//   `atEnd` in the meta;
// - otherwise, after the fallback below: `scrollUnconfirmed`, including when the point has no readable container.
// The fallback, when nothing moved and the container's own bar is settable and not at its end: the bar's AXValue
// written by the requested delta (System Settings' content pane ignores every posted wheel, #328's spike), nothing
// posted, then polled again, where only the content, the tracked descendant or the hit counts (the bar reads back the
// value written whether or not the view moved). Never another container's bar, never at the end.
//
// The read-back is the spike's (`probe/328-measure`, scripts/probe-328/t328.swift `read`, `tracked`, `moved`), which saw
// 808 of 808 moves and no phantom: the bar's AXValue, the content's frame, and one descendant about 40% into the
// viewport (Chrome clips the frame of an element that scrolls off the top, so not one near it). Added here: the element
// under the point itself, when it lies inside the container and is smaller than it, since a nested scroller the
// container's tree does not expose as an AXScrollArea (an overflow div, an iframe) moves it while the container's own
// measures stay put.

/// The poll after the wheel: every `scrollConfirmIntervalMs` until a move reads, at most `scrollConfirmWindowMs` from
/// the post (the spike's first move read at 50 ms p50, 101 ms p95). Named so the hosted gate can re-price them.
let scrollConfirmIntervalMs: Double = 15
let scrollConfirmWindowMs: Double = 300
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

/// What the container is: the nearest AXScrollArea at or above the element under the point, or failing one, the nearest
/// ancestor that advertises AXScrollDownByPage, or an AXWebArea (Catalyst's UIKit has no AXScrollArea).
enum ScrollContainerKind: String { case scrollArea, pageScroller, webArea }

/// The container of `hit` that a scroll there moves, through `ax`: nil when none lies between it and its window.
func scrollContainer(of hit: AXUIElement, ax: AXOps) -> (element: AXUIElement, kind: ScrollContainerKind)? {
  var chain: [(element: AXUIElement, role: String)] = []
  var current: AXUIElement? = hit
  while let node = current, chain.count < scrollContainerLevels {
    let role = ax.role(node) ?? ""
    if role == kAXWindowRole || role == kAXApplicationRole { break }
    if role == kAXScrollAreaRole { return (node, .scrollArea) }
    chain.append((node, role))
    current = ax.parent(node)
  }
  for (node, role) in chain {
    if role == "AXWebArea" { return (node, .webArea) }
    if ax.actions(node).contains("AXScrollDownByPage") { return (node, .pageScroller) }
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

/// One reading of a container: the bar's value and the leading edge, on the axis, of the content, the tracked
/// descendant and the element under the point (nil where it does not read).
struct ScrollReading: Equatable {
  var bar: Double?
  var content: CGFloat?
  var tracked: CGFloat?
  var hit: CGFloat?
}

private func leading(_ frame: CGRect?, horizontal: Bool) -> CGFloat? { frame.map { horizontal ? $0.minX : $0.minY } }

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
                       content: leading(geometry.content.flatMap(ax.frame), horizontal: horizontal),
                       tracked: leading(geometry.tracked.flatMap(ax.frame), horizontal: horizontal),
                       hit: leading(geometry.hit.flatMap(ax.frame), horizontal: horizontal))
}

private func scrollNumber(_ value: CFTypeRef?) -> Double? {
  guard let value, CFGetTypeID(value) == CFNumberGetTypeID() else { return nil }
  return (value as! NSNumber).doubleValue
}

/// +1 when the scroll goes toward the content's end (down, right: the bar's value grows), −1 toward its start.
func scrollSign(_ direction: ScrollDirection) -> Double { direction == .down || direction == .right ? 1 : -1 }

/// The move between two readings the asked way, in points (positive: the way asked), by the first measure that moved
/// at least the minimum that way: the content, the tracked descendant, the element under the point (each moves against
/// the scroll), then the bar times the scrollable length. A bar alone, its length unread, counts by its own minimum
/// with no points. Nil when nothing moved the asked way. `countsBar` false leaves the bar out: after the fallback's
/// write it reads back the value written whether or not the view moved.
func scrollMove(_ before: ScrollReading, _ after: ScrollReading, direction: ScrollDirection, scrollable: CGFloat?,
                countsBar: Bool = true) -> (points: Double?, by: String)? {
  let sign = scrollSign(direction)
  let edges: [(String, CGFloat?, CGFloat?)] = [("content", before.content, after.content), ("tracked", before.tracked, after.tracked),
                                               ("hit", before.hit, after.hit)]
  for (name, a, b) in edges {
    if let a, let b, Double(a - b) * sign >= scrollMovedMinimumPoints { return (Double(a - b) * sign, name) }
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
  var walked = 0
  /// The reading before the wheel (the container, its geometry and the walk), and the whole confirmation.
  var readMs: Double = 0
  var ms: Double = 0

  var wire: [String: Any] {
    var wire: [String: Any] = ["container": container?.rawValue ?? NSNull(), "outcome": outcome.rawValue, "polls": polls,
                               "readMs": rounded(readMs), "ms": rounded(ms)]
    if outcome == .atEnd { wire["atEnd"] = true }
    if let moved { wire["moved"] = rounded(moved) }
    if let by { wire["by"] = by }
    if let barBefore { wire["barBefore"] = rounded(barBefore, 10_000) }
    if let barAfter { wire["barAfter"] = rounded(barAfter, 10_000) }
    if let firstMoveMs { wire["firstMoveMs"] = rounded(firstMoveMs) }
    if let barWrite { wire["barWrite"] = rounded(barWrite, 10_000) }
    if let barWriteError { wire["barWriteError"] = Int(barWriteError) }
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
  let found = hit.flatMap { scrollContainer(of: $0, ax: ax) }
  let geometry = found.map { scrollGeometry($0.element, kind: $0.kind, hit: hit, horizontal: direction.horizontal, ax: ax) }
  let before = geometry.map { readScroll($0, ax: ax) }
  record.container = found?.kind
  record.walked = geometry?.walked ?? 0
  record.barBefore = before?.bar
  record.readMs = ax.now() - started
  try post()
  guard let geometry, let before else { return }

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
  if scrollAtEnd(before, direction: direction) && scrollAtEnd(after, direction: direction) {
    record.outcome = .atEnd
    return
  }
  guard let bar = geometry.bar, let value = after.bar, !scrollAtEnd(after, direction: direction),
        let scrollable = geometry.scrollableLength, ax.isSettable(bar, kAXValueAttribute) else { return }
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
  case .atEnd: return "Nothing moved: what is at that point in \(app) is already scrolled as far \(direction.rawValue) as it goes."
  case .unconfirmed: throw scrollUnconfirmed(app: app)
  }
}

func scrollUnconfirmed(app: String) -> EngineError {
  EngineError(name: "scrollUnconfirmed",
    "The scroll was sent to \(app), but nothing at that point was seen to move. Observe the app (take a screenshot or call getAXState()) before scrolling again.")
}
