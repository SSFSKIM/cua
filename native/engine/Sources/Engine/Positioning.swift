import ApplicationServices
import Foundation

// Scroll into view, the vendor's positionElement (R/F-helper-logic.md §16.8, R/sky-behaviour.md §16; the Decision Log's
// M2a vendor reading, item 9): before an element click, a secondary action, set_value and an element scroll (not
// select_text), an element whose frame's midpoint does not lie in the region its clipping ancestors show is scrolled
// into view, by the element's own AXScrollToVisible action when it advertises one; on an AXCell by its settable
// AXScrollToVisible attribute; otherwise, at each scroll area between it and its window, sheet, menu or popover, by
// setting the scroll bars' AXValue to the fraction that shows it, or AXMakeScreenRectVisible where the bars cannot. No
// wheel events, no page actions, the pointer never moved. After an operation succeeded, a poll of up to 0.5 s every
// 0.1 s for the midpoint to show, whose timeout is swallowed: an element still hidden is then refused by the caller's
// own visibility rule (a synthesized click's `cannotClickOffscreenElement`), as the vendor's is.

/// The poll after a scroll into view (`pollUntilTrueSync(timeout: 0.5, interval: 0.1)`, 0x10078e244).
let positionPollTimeoutMs: Double = 500
let positionPollIntervalMs: Double = 100

/// What positionElement found or did.
enum PositionOutcome: Equatable {
  case visible       // its midpoint already showed: nothing done
  case scrolled      // scrolled, and its midpoint shows now
  case stillHidden   // scrolled, and its midpoint did not show within the poll
  case unscrollable  // hidden, and no operation applied (or none succeeded)
}

/// Whether the midpoint of `frame` lies in `visible` (the element's frame cut by its clipping ancestors).
func midpointShows(_ frame: CGRect?, in visible: CGRect?) -> Bool {
  guard let frame, let visible else { return false }
  return visible.contains(CGPoint(x: frame.midX, y: frame.midY))
}

/// The vendor's positionElement through `ax`: nothing when the element's midpoint shows; otherwise one scroll-into-view
/// operation per scrolling level, then the poll.
@discardableResult
func positionElement(_ element: AXUIElement, ax: AXOps) -> PositionOutcome {
  if midpointShows(ax.frame(element), in: ax.visible(element)) { return .visible }
  guard scrollIntoView(element, ax: ax) else { return .unscrollable }
  let started = ax.now()
  while true {
    if midpointShows(ax.frame(element), in: ax.visible(element)) { return .scrolled }
    if ax.now() - started >= positionPollTimeoutMs { return .stillHidden }
    ax.sleep(positionPollIntervalMs)
  }
}

/// The operations of `scrollToVisible(frame:)` (0x10078d8f4); true when one succeeded.
func scrollIntoView(_ element: AXUIElement, ax: AXOps) -> Bool {
  if ax.actions(element).contains("AXScrollToVisible") { return ax.perform(element, "AXScrollToVisible") == .success }
  if ax.role(element) == kAXCellRole, ax.isSettable(element, "AXScrollToVisible") {
    return ax.write(element, "AXScrollToVisible", kCFBooleanTrue) == .success
  }
  var scrolled = false
  var current = ax.parent(element)
  var level = 0
  while let node = current, level < 300 {
    let role = ax.role(node) ?? ""
    if role == kAXApplicationRole || scrollBoundaryRoles.contains(role) { break }
    // The target's frame is read again at each level: an inner scroll has moved it.
    if role == kAXScrollAreaRole, let target = ax.frame(element), scrollArea(node, toShow: target, ax: ax) { scrolled = true }
    current = ax.parent(node)
    level += 1
  }
  return scrolled
}

/// Where the walk stops (FUN_10078eb38): the first window, sheet, menu or popover.
private let scrollBoundaryRoles: Set<String> = [kAXWindowRole, kAXSheetRole, kAXMenuRole, "AXPopover"]

/// One scroll area's operation: each bar whose axis does not show the target set to the fraction that does; where no
/// bar could be set and the target lies outside the area, AXMakeScreenRectVisible set to the target's rect.
private func scrollArea(_ area: AXUIElement, toShow target: CGRect, ax: AXOps) -> Bool {
  guard let viewport = ax.frame(area) else { return false }
  let content = elementList(ax.read(area, kAXContentsAttribute)).first.flatMap(ax.frame)
  var scrolled = false
  for (axis, attribute) in [(ScrollAxis.vertical, kAXVerticalScrollBarAttribute), (.horizontal, kAXHorizontalScrollBarAttribute)] {
    guard let content, let fraction = scrollBarFraction(showing: target, viewport: viewport, content: content, axis: axis),
          let bar = ax.element(area, attribute), ax.isSettable(bar, kAXValueAttribute) else { continue }
    if ax.write(bar, kAXValueAttribute, NSNumber(value: fraction)) == .success { scrolled = true }
  }
  if !scrolled && !viewport.contains(target) {
    var rect = target
    if let value = AXValueCreate(.cgRect, &rect), ax.write(area, "AXMakeScreenRectVisible", value) == .success { scrolled = true }
  }
  return scrolled
}

enum ScrollAxis { case vertical, horizontal }

/// The scroll bar value, 0…1, that brings `target` into `viewport` along `axis`, given the scrolled content's frame (all
/// in screen points, top-left origin, so 0 is the top or the left): nil when the target already lies within the
/// viewport on that axis or the content does not scroll. A target before the viewport is aligned to its start, one
/// after it to its end, one longer than the viewport to its start; clamped to 0…1 (0x1007183a4). The vendor's own
/// arithmetic (FUN_10078edbc) was not normalized; this is the geometry it serves.
func scrollBarFraction(showing target: CGRect, viewport: CGRect, content: CGRect, axis: ScrollAxis) -> Double? {
  let (targetMin, targetMax, viewMin, viewLength, contentMin, contentLength) = axis == .vertical
    ? (target.minY, target.maxY, viewport.minY, viewport.height, content.minY, content.height)
    : (target.minX, target.maxX, viewport.minX, viewport.width, content.minX, content.width)
  if targetMin >= viewMin && targetMax <= viewMin + viewLength { return nil }
  let scrollable = contentLength - viewLength
  guard scrollable > 0 else { return nil }
  let offset = targetMin < viewMin || targetMax - targetMin > viewLength
    ? targetMin - contentMin
    : targetMax - contentMin - viewLength
  return Double(min(max(offset / scrollable, 0), 1))
}
