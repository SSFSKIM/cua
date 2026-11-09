import ApplicationServices
import CoreGraphics
import Foundation

// #283: shared mode's focus route. A plain left click into a background Chromium web area whose hit is a text field, a
// text area or a contenteditable region (#282's walk stops there as `editable`) is carried by Accessibility, with no
// mouse event and no window ordering: AXFocused set true on the field, accepted only once it reads back true, then the
// caret placed at the point by AXSelectedTextRange {offset, 0} and read back (#341 reverses that order: the offset and
// the caret's write first, AXFocused the fallback; see `focusPlacingCaret`). #283's hosted probe (probe/283-hosted,
// runs 42146016617 to 42148369195, Chrome for Testing 156 on macOS 26.6.2 and 26.7.2):
// - AXFocused on the field focuses the input, the textarea and the contenteditable region, before Chromium's complete
//   accessibility mode as after it (so #282's re-read never delays this route), with no pointer event, TextEdit left
//   frontmost and Chrome's window order unchanged; AX reads AXFocused true 65 to 142 ms after the write.
// - The contenteditable region's hit is an AXStaticText whose AXFocused is not settable, yet the write answers
//   success and does nothing: the route writes on the nearest text-entry element up the walk, and never counts a
//   write's answer.
// - Focus alone puts the caret at the field's existing selection, else at its start, never at the point.
// - AXRangeForPosition answers {0,0} for every point and AXTextMarkerForPosition answers no value, so the offset comes
//   from the characters' boxes (AXBoundsForRange), scanned for the one that holds the point.
// - Round 2 (run 42150236590): a contenteditable region's static texts, found in order in the region's AXValue, give
//   their starts in its offsets (a <br> has no element but is a character); every box is empty before complete mode.
// The design session's rulings (1ea561bc a9607cd9): a point past a line's last character is the end of that line; an
// empty field is offset 0, placed; a point in no box is not placed, never a guessed offset; a read-back that differs is
// not placed; a secure field is focused only, with no read of its value or ranges.

/// How long the focus write's read-back and the caret's are polled, and how often.
let webAreaFocusSettleMs: Double = 300
let webAreaFocusSampleMs: Double = 20
/// The most characters the caret's linear scan reads boxes for (round 2's probe: 3,074 in 165 to 185 ms). Since #290 the
/// caret is searched for first (`caretOffset`), and the linear scan decides only what the search could not: over the
/// whole range when it is no longer than this, else over this many characters around where the search ended.
let caretScanLimit = 5_000
/// The most unusable boxes (empty, or a failed read) the caret's search steps past from one probe toward the nearest
/// usable box before it leaves the answer to the linear scan (#290).
let caretSearchStepLimit = 64
/// The most nodes `regionTextStart` walks in a contenteditable region before it gives up on mapping the hit.
let regionWalkLimit = 2_000

/// The element a focusing click focuses, as the walk found it.
struct WebAreaFocusTarget<Element> {
  let element: Element
  let role: String
  /// Not the hit itself: an element up the walk (a contenteditable region over its text).
  let ancestor: Bool
  /// A password field: focused only, its value and ranges never read.
  let secure: Bool
}

/// What reading an element's AXSubrole found: a subrole, none (the attribute unsupported or without a value), or a read
/// that failed, which the secure classification counts as a password field's.
enum SubroleRead: Equatable {
  case subrole(String)
  case none
  case failed
}

/// The element's AXSubrole as a `SubroleRead`; a value that is not a string counts as a failed read.
func subroleRead(_ element: AXUIElement) -> SubroleRead {
  let (value, error) = copyAttribute(element, kAXSubroleAttribute)
  switch error {
  case .success:
    guard let value else { return .none }
    return CFGetTypeID(value) == CFStringGetTypeID() ? .subrole(value as! String) : .failed
  case .noValue, .attributeUnsupported: return .none
  default: return .failed
  }
}

/// The text-entry element a plain left click into a web area focuses (#283, the design session's ruling 1): the hit
/// when it is a text-entry role (`webAreaEditableRoles`) whose AXFocused is settable, else the nearest one up its
/// parents, reached through editable elements (an `AXEditableAncestor`) and #282's passable children only, its own
/// parents read up to the AXWebArea. Refused at a text-entry role whose AXFocused is not settable (`notFocusable`), at
/// any other role or the web area itself (`roleNotAllowed`), and on an ancestry it cannot read (`incompleteAncestry`).
/// `walk` records the roles read, as #282's does. Secure (focused only, nothing of it read) by its role or subrole
/// AXSecureTextField, or when its subrole cannot be read: a password field is an AXTextField known by its subrole alone.
func webAreaFocusTarget<Element>(_ hit: Element, role: (Element) -> String?, subrole: (Element) -> SubroleRead, parent: (Element) -> Element?,
                                 editable: (Element) -> Bool, focusSettable: (Element) -> Bool,
                                 walk: inout [String]) -> Result<WebAreaFocusTarget<Element>, WebAreaRefusal> {
  var current = hit
  for level in 0...300 {
    guard let name = role(current) else {
      walk.append("unreadable")
      return .failure(.incompleteAncestry)
    }
    walk.append(name)
    if webAreaEditableRoles.contains(name) {
      guard focusSettable(current) else { return .failure(.notFocusable) }
      if case .failure(let why) = webAreaAncestry(above: current, role: role, parent: parent) { return .failure(why) }
      let secure: Bool
      if name == "AXSecureTextField" { secure = true } else {
        switch subrole(current) {
        case .subrole(let found): secure = found == "AXSecureTextField"
        case .none: secure = false
        case .failed: secure = true
        }
      }
      return .success(WebAreaFocusTarget(element: current, role: name, ancestor: level > 0, secure: secure))
    }
    guard editable(current) || webAreaPassableRoles.contains(name) else { return .failure(.roleNotAllowed) }  // the AXWebArea included
    guard let next = parent(current) else { return .failure(.incompleteAncestry) }
    current = next
  }
  return .failure(.incompleteAncestry)
}

/// The caret offset a click at `point` places in a text of `length` UTF-16 units, from its characters' boxes
/// (`bounds`, screen coordinates, nil or empty for a character with none) over `range`, as #283's linear scan
/// (`linearCaretOffset`) answers it, searched for first (#290): a bisection over the boxes in reading order for the
/// point's line (box y), then for its place on that line (box x), and the linear scan over the few characters it ends
/// at; an offset is taken from there only where that scan places it. Anything else is the linear scan's over the whole
/// range when it is at most `caretScanLimit` characters, so its answer, offset or reason, is the linear scan's; over that
/// many characters around where the search ended when the range is longer. Each box is read at most once.
///
/// The search assumes lines run downward and characters rightward in the text's order. An unusable box (empty, or a
/// failed read) at a probe is stepped past to the nearest usable one, never inferred across, at most
/// `caretSearchStepLimit` of them; two usable boxes read out of that order (a vertical or right-to-left layout), or a
/// step limit reached, end the search with no offset taken from it; out of order, a range past `caretScanLimit` is
/// refused (`pointOutsideText`, #283's answer), since no window near the point is known. The direction is read first
/// (`caretSearch`): vertical or leftward text is not searched. A line end is taken from the search only where the next
/// character lies wholly below (the linear scan's wrap test); characters of other sizes on one line overlap vertically,
/// so a line the bisections cut short at one fails it and the linear scan answers. A character set wholly below its
/// line (vertical-align) would pass it: a stated limit. `searchable` false skips the search: a text holding
/// right-to-left characters (`holdsRightToLeft`), whose short lines may show the search too few boxes to see the order
/// broken. Such a text is #283's exactly: the linear scan within `caretScanLimit` characters, and past it
/// `pointOutsideText` with nothing read, since without the search no window near the point is known.
func caretOffset(at point: CGPoint, length: Int, range: Range<Int>, bounds: (Int) -> CGRect?,
                 isLineBreak: (Int) -> Bool, mayLackBox: (Int) -> Bool, searchable: Bool = true) -> Result<Int, CaretNotPlaced> {
  if length == 0 { return .success(0) }
  let scanned = range.clamped(to: 0..<length)
  if !searchable, scanned.count > caretScanLimit { return .failure(.pointOutsideText) }
  var read: [Int: CGRect?] = [:]
  func box(_ index: Int) -> CGRect? {
    if let known = read[index] { return known }
    let found = bounds(index)
    read[index] = .some(found)
    return found
  }
  let searched = searchable ? caretSearch(at: point, scanned, box: box, isLineBreak: isLineBreak)
                            : .abandoned(at: scanned.lowerBound + scanned.count / 2)
  if case .window(let window) = searched,
     case .success(let offset) = linearCaretOffset(at: point, length: length, range: window, bounds: box, isLineBreak: isLineBreak,
                                                   mayLackBox: mayLackBox) {
    return .success(offset)
  }
  var fallback = scanned
  if scanned.count > caretScanLimit {
    let near: Int
    switch searched {
    case .window(let window): near = window.lowerBound
    case .abandoned(let at): near = at
    case .disordered: return .failure(.pointOutsideText)  // #283's refusal: no window near the point is known
    case .boxless: return .failure(.noCharacterBoxes)  // no usable box read: the wait on boxes re-reads
    }
    let lower = min(max(scanned.lowerBound, near - caretScanLimit / 2), scanned.upperBound - caretScanLimit)
    fallback = lower..<(lower + caretScanLimit)
  }
  return linearCaretOffset(at: point, length: length, range: fallback, bounds: box, isLineBreak: isLineBreak, mayLackBox: mayLackBox)
}

/// Where `caretSearch` ended: the few characters around the point's place for the linear scan to decide, or the index
/// it had reached when it stopped with nothing to offer.
enum CaretSearchEnd: Equatable {
  case window(Range<Int>)
  case abandoned(at: Int)
  /// Two usable boxes read out of reading order: the layout is not the one the search assumes, so no window near the
  /// point is known (#290's review of 93bc212e: a vertical layout, whose fallback window around this index answered an
  /// offset far from the linear scan's).
  case disordered(at: Int)
  /// No usable box among the first characters, so no direction is known: nothing is searched (the review of a2fd1e11:
  /// vertical text whose first boxes were still missing passed the search).
  case boxless
}

/// #290's search over `scanned`'s boxes in reading order (`caretOffset`). Boxes are usable as the linear scan's: with
/// height, and width unless a line break's. First the point's line: the first index whose usable box is not above the
/// point (its bottom below the point's y) and the first whose usable box is below it (its top below the point's y).
/// Then, between them, the first whose usable box is not left of the point (its right edge past the point's x). The
/// window runs from the last usable box before that one (the line's rightmost when the point is past its end) through
/// that one.
func caretSearch(at point: CGPoint, _ scanned: Range<Int>, box: (Int) -> CGRect?, isLineBreak: (Int) -> Bool) -> CaretSearchEnd {
  func usable(_ index: Int) -> CGRect? {
    guard let found = box(index), found.height > 0, isLineBreak(index) || found.width > 0 else { return nil }
    return found
  }
  var samples: [(index: Int, box: CGRect)] = []
  var gaveUp: Int?
  /// The usable box nearest `middle` in `lower..<upper`, looking outward on both sides alternately; nil with `gaveUp`
  /// unset when the interval has none, with it set when more than `caretSearchStepLimit` unusable boxes came first.
  func nearest(_ middle: Int, _ lower: Int, _ upper: Int) -> (index: Int, box: CGRect)? {
    var passed = 0
    var distance = 0
    while middle - distance >= lower || middle + distance < upper {
      for index in distance == 0 ? [middle] : [middle + distance, middle - distance] where index >= lower && index < upper {
        if let found = usable(index) {
          samples.append((index, found))
          return (index, found)
        }
        passed += 1
        if passed > caretSearchStepLimit { gaveUp = middle; return nil }
      }
      distance += 1
    }
    return nil
  }
  /// The first index in `lower..<upper` whose usable box meets `holds`, which every usable box after one that meets it
  /// meets too; unusable boxes count for neither side. Nil when the search gave up.
  func first(_ lower: Int, _ upper: Int, where holds: (CGRect) -> Bool) -> Int? {
    var lower = lower, upper = upper
    while lower < upper {
      guard let (index, found) = nearest(lower + (upper - lower) / 2, lower, upper) else {
        if gaveUp != nil { return nil }
        break  // nothing usable left between: the boundary is anywhere there
      }
      if holds(found) { upper = index } else { lower = index + 1 }
    }
    return lower
  }
  let middle = scanned.lowerBound + scanned.count / 2
  // The text's direction, from the first two neighbouring characters with usable boxes, neither a line break, that do
  // not wrap (the review of 66017fb1): on one line, the later one must not start left of the earlier one; one under
  // the other, overlapping across, is a vertical column. Within `caretSearchStepLimit` characters, or no direction is
  // known and the search is not trusted; none of them with a box, nothing is searched.
  var direction: Bool?, sawABox = false
  var index = scanned.lowerBound
  while direction == nil, index + 1 < min(scanned.upperBound, scanned.lowerBound + caretSearchStepLimit) {
    defer { index += 1 }
    if usable(index) != nil { sawABox = true }
    guard !isLineBreak(index), !isLineBreak(index + 1), let earlier = usable(index), let later = usable(index + 1) else { continue }
    if earlier.minY < later.maxY, later.minY < earlier.maxY {
      direction = later.minX >= earlier.minX
    } else if later.minX < earlier.maxX, earlier.minX < later.maxX {
      direction = false
    }
  }
  // No usable box at all there is no direction either way (boxes not there yet, all empty before Chromium's complete
  // accessibility mode, #283): nothing is searched.
  if direction == nil, !sawABox { return .boxless }
  if direction != true { return .disordered(at: middle) }
  // Every two usable boxes read must run in reading order: the earlier one on a line above the later one's or on its
  // line, and on the point's line starting left of it. Checked on every way out, so a search stopped early by a run of
  // unusable boxes cannot hide what it had already seen.
  let onLine = { (found: CGRect) in found.minY <= point.y && point.y < found.maxY }
  func ordered() -> Bool {
    samples.sort { $0.index < $1.index }
    for (earlier, later) in zip(samples, samples.dropFirst()) where earlier.index != later.index {
      if earlier.box.minY >= later.box.maxY { return false }
      if onLine(earlier.box), onLine(later.box), earlier.box.minX > later.box.minX { return false }
    }
    return true
  }
  guard let lineStart = first(scanned.lowerBound, scanned.upperBound, where: { point.y < $0.maxY }),
        let lineEnd = first(lineStart, scanned.upperBound, where: { point.y < $0.minY }),
        let place = first(lineStart, lineEnd, where: { point.x < $0.maxX }) else {
    let at = gaveUp ?? middle
    return ordered() ? .abandoned(at: at) : .disordered(at: at)
  }
  // The window's start: the last usable box before `place` on the line, if any.
  var start = place
  var passed = 0
  while start > lineStart {
    start -= 1
    if let found = usable(start) { samples.append((start, found)); break }
    passed += 1
    if passed > caretSearchStepLimit { return ordered() ? .abandoned(at: place) : .disordered(at: place) }
  }
  return ordered() ? .window(start..<min(lineEnd, place + 1)) : .disordered(at: place)
}

/// #283's linear scan over `range`: in the box that holds the point, before the character on its left half and after it
/// on its right; past a line's last character (to the right of every box in the line the point's height falls in), the
/// end of that line, before its line break. That end counts only once it is established: a line break's own box, or
/// after the rightmost character read when the next offset is the text's end, a line break, or a character whose
/// non-empty box starts below this one's (a soft wrap; read even outside `range`). Otherwise the rightmost box read need
/// not be the line's last (a failed read, a scan cut short). An empty text is 0. Not placed: `noCharacterBoxes` when the
/// scan read no usable box at all (one with height, and width unless it is a line break's), as every box is before
/// Chromium's complete accessibility mode; `boxesIncomplete` when usable boxes were read but none holds the point and it
/// is past no established line end, while some character that should have a box had none (Chromium's boxes still
/// arriving: `mayLackBox` names those that may legitimately have none, line breaks always among them);
/// `pointOutsideText` for such a miss with every expected box read.
func linearCaretOffset(at point: CGPoint, length: Int, range: Range<Int>, bounds: (Int) -> CGRect?,
                       isLineBreak: (Int) -> Bool, mayLackBox: (Int) -> Bool) -> Result<Int, CaretNotPlaced> {
  if length == 0 { return .success(0) }
  let scanned = range.clamped(to: 0..<length)
  var readABox = false, missedABox = false
  // The rightmost line-end candidate: its offset, its x, and the box of the character it follows (nil for a line break).
  var lineEnd: (offset: Int, x: CGFloat, after: CGRect?)?
  for index in scanned {
    let lineBreak = isLineBreak(index)
    guard let box = bounds(index), box.height > 0, lineBreak || box.width > 0 else {
      if !lineBreak, !mayLackBox(index) { missedABox = true }
      continue
    }
    readABox = true
    guard box.minY <= point.y, point.y < box.maxY else { continue }
    if lineBreak {
      // A line break's box marks where its line ends: the caret goes before it.
      if lineEnd.map({ box.minX >= $0.x }) ?? true { lineEnd = (index, box.minX, nil) }
      continue
    }
    if box.minX <= point.x, point.x < box.maxX { return .success(point.x < box.midX ? index : index + 1) }
    if lineEnd.map({ box.maxX >= $0.x }) ?? true { lineEnd = (index + 1, box.maxX, box) }
  }
  guard readABox else { return .failure(.noCharacterBoxes) }
  let miss = Result<Int, CaretNotPlaced>.failure(missedABox ? .boxesIncomplete : .pointOutsideText)
  guard let lineEnd, point.x >= lineEnd.x else { return miss }
  let end = lineEnd.offset
  guard let after = lineEnd.after, end < length, !isLineBreak(end) else { return .success(end) }
  // Only a usable box (as the scan's own) shows a lower line: an empty one, such as CGRect.zero, is no box at all.
  if let next = bounds(end), next.width > 0, next.height > 0, next.minY >= after.maxY { return .success(end) }
  return miss
}

/// The characters whose box may legitimately be empty, so that an empty one is no sign of boxes still arriving
/// (the design session's condition, 9ba80c48): line breaks, whitespace (a trailing space at a wrap), controls and
/// format characters (U+200B, U+200C, U+200D, U+FEFF, U+00AD) and combining marks.
private let boxlessCharacters = CharacterSet.whitespacesAndNewlines.union(.controlCharacters).union(.nonBaseCharacters)

/// Whether the UTF-16 unit at `index` of `text` may legitimately have an empty box. A surrogate pair is one character:
/// its trailing (low) half never needs a box, its leading (high) half carries the character's, exempt only when the
/// scalar is. A lone surrogate, malformed, is exempt.
func mayLackBox(_ text: NSString, _ index: Int) -> Bool {
  guard index >= 0, index < text.length else { return true }
  let unit = text.character(at: index)
  if UTF16.isTrailSurrogate(unit) { return true }
  if UTF16.isLeadSurrogate(unit) {
    guard index + 1 < text.length, case let trail = text.character(at: index + 1), UTF16.isTrailSurrogate(trail),
          let scalar = Unicode.Scalar(UInt32(0x10000 + ((Int(unit) - 0xD800) << 10) + (Int(trail) - 0xDC00))) else { return true }
    return boxlessCharacters.contains(scalar)
  }
  guard let scalar = Unicode.Scalar(unit) else { return true }
  return boxlessCharacters.contains(scalar)
}

/// Where a contenteditable region's static text `hit` starts in the region's own offsets (`editable`'s AXValue, UTF-16):
/// the region's descendants walked depth-first in children order, each AXStaticText's value found in the region's value
/// searching onward from where the previous one ended, and the hit's found location answered. Not a sum of lengths:
/// a <br> has no element yet is a character of the region's value. An empty static text is skipped. Nil when the
/// region's value or a static text's is not a string, a node's role or children list cannot be read, a static text is not found,
/// the hit is not reached, or more than `regionWalkLimit` nodes would be walked. `same` tells the hit apart.
func regionTextStart<Element>(of hit: Element, in editable: Element, children: (Element) -> [Element]?, role: (Element) -> String?,
                              value: (Element) -> Any?, same: (Element, Element) -> Bool) -> Int? {
  guard let whole = value(editable) as? String else { return nil }
  let region = whole as NSString
  var searchFrom = 0
  var visited = 0
  guard let top = children(editable) else { return nil }
  var pending = Array(top.reversed())
  while let node = pending.popLast() {
    visited += 1
    guard visited <= regionWalkLimit else { return nil }
    // An unread role could be a static text whose skip would cost the search its place.
    guard let name = role(node) else { return nil }
    if name == "AXStaticText" {
      guard let text = value(node) as? String else { return nil }
      if text.isEmpty { continue }
      let found = region.range(of: text, options: .literal, range: NSRange(location: searchFrom, length: region.length - searchFrom))
      guard found.location != NSNotFound else { return nil }
      if same(node, hit) { return found.location }
      searchFrom = found.location + found.length
      continue
    }
    guard let below = children(node) else { return nil }
    pending.append(contentsOf: below.reversed())
  }
  return nil
}

/// The element's AXChildren for `regionTextStart`: none when it has none, nil when the read failed.
func childrenRead(_ element: AXUIElement) -> [AXUIElement]? {
  let (value, error) = copyAttribute(element, kAXChildrenAttribute)
  switch error {
  case .success: return elementList(value).map(prepare)
  case .noValue, .attributeUnsupported: return []
  default: return nil
  }
}

/// Why a focused field's caret was not placed at the point (`elementClick.caret`).
enum CaretNotPlaced: String, Error, Equatable {
  /// A password field: never scanned.
  case secure
  /// The field's value could not be read as text, so no offset is known to correspond to the point.
  case unreadable
  /// The scan read no usable character box at all (Chromium before its complete accessibility mode).
  case noCharacterBoxes
  /// Character boxes were read, but none holds the point and it is past no line's end.
  case pointOutsideText
  /// Such a miss while some boxes were still empty: the scan's and its wait's only, never recorded
  /// (`caretAwaitingBoxes` re-reads it where fresh and answers it otherwise as `pointOutsideText`).
  case boxesIncomplete
  /// The caret was written, but AXSelectedTextRange read back otherwise.
  case selectionMismatch
  /// The hit's text could not be mapped to the focused field's offsets: a contenteditable region's hit that is not an
  /// AXStaticText, or one `regionTextStart` does not place.
  case unmapped
  /// #341: the caret was written at the point's offset and read back, but the field's text did not read where it was
  /// before the writes (the reference character's box moved by more than `caretMarkTolerance`, or could not be read
  /// again), so the caret's place against the screenshot is not shown.
  case layoutMoved
}

enum WebAreaFocusOutcome: Equatable {
  case placed(Int)
  case notPlaced(CaretNotPlaced)
}

// #341: AXFocused scrolls Chromium's textarea to its existing caret (scrollTop to 0 within 0 to 8 ms), so boxes read after
// focus describe a layout the screenshot never showed: 46 of 60 placed claims were wrong in a scrolled textarea (run
// 42568677106, https://github.com/SSFSKIM/cua/actions/runs/42568677106). In the same run AXSelectedTextRange {k, 0}
// written on the unfocused textarea focused it by itself (read focused 11 to 63 ms later) with its scroll unchanged,
// 72 of 72 cells right, late and fresh; a fresh Chromium fills the boxes unfocused 1.24 to 1.91 s after the observation.
// So the offset is computed before any write, the caret's write focuses the field, and AXFocused is the fallback. The
// design session's ruling 1ea561bc:544: placed only where the read-back shows the caret at the offset and the field's
// text where it was (`layoutMark`, within `caretMarkTolerance`).

/// How far, in points, the reference character's box may move between the read before the writes and the read after
/// the caret's read-back and still count as the field not having scrolled (#341).
let caretMarkTolerance: CGFloat = 1

/// The character whose box shows whether the field scrolled (#341): the one after the caret where its box is usable
/// (`usable`), else the one before it; nil in an empty text, or when neither has one.
func caretMarkIndex(offset: Int, length: Int, usable: (Int) -> Bool) -> Int? {
  [offset, offset - 1].first { $0 >= 0 && $0 < length && usable($0) }
}

/// What a focusing click did besides its outcome (#341): which write the field took focus from, and how far the
/// reference character's box moved over the writes (the larger of its x and y shifts; nil where it was not read twice).
struct WebAreaFocusRecord: Equatable {
  enum Step: String {
    /// AXSelectedTextRange {offset, 0}, written on the unfocused field.
    case selection
    /// AXFocused: no offset to write, a secure field, or a caret's write that did not focus the field.
    case focused
  }
  let step: Step
  var markShift: Double? = nil
}

/// The focusing click itself, once the target is known (#341's order; #283's before it). A secure field is focused
/// only: `beforeMutating` (the in-flight intervention check), AXFocused written (`writeFocused`, its answer never
/// counted) and polled (`focused`) for up to `webAreaFocusSettleMs`; still not reading true, the click answers
/// `focusUnconfirmed`. Otherwise the caret's offset first, with nothing written (`offset`; `caretAwaitingBoxes` where it
/// finds no character boxes yet), then `beforeCaret` (#296's guard after the boxes' wait, which throws its refusal:
/// nothing has been written yet). With no offset, the field is focused as a secure one is and the reason answered. With one, the reference character's box (`layoutMark`), the in-flight
/// check, and AXSelectedTextRange {offset, 0} (`writeSelection`), which focuses Chromium's field; focus polled for the
/// settle; not focused, the in-flight check, AXFocused and its poll. Then the selection read back (`selection`, polled
/// for the same settle) and the reference box read again: placed only where the caret reads {offset, 0} and the box
/// moved no more than `caretMarkTolerance` (a text empty before the writes and at read-back has no box, and needs
/// none). `noted` gets the step that focused the field and the box's shift.
func focusPlacingCaret(app: String, secure: Bool, fresh: Bool, freshSince: Double? = nil, beforeMutating: () throws -> Void,
                       beforeCaret: () throws -> Void = {}, writeFocused: () -> Void,
                       focused: () -> Bool?, offset: () -> Result<Int, CaretNotPlaced>, sameTarget: () -> Bool, valueLength: () -> Int?,
                       layoutMark: () -> CGRect?, writeSelection: (Int) -> Void, selection: () -> (location: Int, length: Int)?,
                       noted: (WebAreaFocusRecord) -> Void = { _ in }, now: () -> Double, sleep: (Double) -> Void) throws -> WebAreaFocusOutcome {
  func settles(_ condition: () -> Bool) -> Bool {
    let started = now()
    repeat {
      if condition() { return true }
      sleep(webAreaFocusSampleMs)
    } while now() - started < webAreaFocusSettleMs
    return condition()
  }
  /// AXFocused, its read-back required; a field that never reads focused answers clickUnconfirmed.
  func focusByWrite() throws {
    try beforeMutating()
    writeFocused()
    guard settles({ focused() == true }) else { throw focusUnconfirmed(app) }
  }
  /// The field focused by AXFocused with no caret written, and why.
  func focusedOnly(_ why: CaretNotPlaced) throws -> WebAreaFocusOutcome {
    try focusByWrite()
    noted(WebAreaFocusRecord(step: .focused))
    return .notPlaced(why)
  }
  if secure { return try focusedOnly(.secure) }
  let found = caretAwaitingBoxes(fresh: fresh, freshSince: freshSince, offset: offset, sameTarget: sameTarget, valueLength: valueLength,
                                 now: now, sleep: sleep)
  try beforeCaret()
  let target: Int
  switch found {
  case .failure(let why): return try focusedOnly(why)
  case .success(let offset): target = offset
  }
  let markBefore = layoutMark()
  let emptyBefore = target == 0 && valueLength() == 0
  try beforeMutating()
  writeSelection(target)
  var step = WebAreaFocusRecord.Step.selection
  if !settles({ focused() == true }) {
    try focusByWrite()
    step = .focused
  }
  let caretRead = settles({ selection().map { $0.location == target && $0.length == 0 } == true })
  let markAfter = layoutMark()
  var record = WebAreaFocusRecord(step: step)
  if let markBefore, let markAfter {
    record.markShift = Double(max(abs(markAfter.minX - markBefore.minX), abs(markAfter.minY - markBefore.minY)))
  }
  noted(record)
  guard caretRead else { return .notPlaced(.selectionMismatch) }
  // An empty field has no box to read and no text to scroll: exempt only where it was empty before the writes and is
  // still empty at read-back (the review of #341: a focus handler that fills or clears it leaves the caret's place
  // unproven).
  let emptyThroughout = emptyBefore && valueLength() == 0
  guard emptyThroughout || record.markShift.map({ $0 <= Double(caretMarkTolerance) }) == true else { return .notPlaced(.layoutMoved) }
  return .placed(target)
}

/// The caret's offset where a field's boxes may not exist yet (#283, the design session's ruling 37d4c12c), read before
/// anything is written to the field (#341): before Chromium's complete accessibility mode every character box is empty
/// (`noCharacterBoxes`), and while they arrive some are (`boxesIncomplete`, run 42152333871; widened from 37d4c12c under
/// 9ba80c48). In a process whose accessibility is `fresh` (#282's rule) the offset is computed again every
/// `webAreaActionRereadSampleMs` until `webAreaRereadDeadline` (2 s, or up to 3 s just after an enablement write, #292),
/// posting nothing, until it answers anything else (an offset, or a complete miss `pointOutsideText` or `unmapped`,
/// which then is the answer). Each re-read waits on `sameTarget` (still the element the click resolved to, and not a
/// secure one): failing, nothing more is read. An offset found by a re-read counts only if the field is still that
/// element and its value's length (`valueLength`) is the one read when the wait began; it is not focused yet, so focus
/// is no condition. Otherwise, as when the boxes stay empty or the process is not fresh or that length cannot be read
/// (no wait at all), `noCharacterBoxes`; an incomplete miss not waited for, or still incomplete at the bound, is
/// `pointOutsideText`.
func caretAwaitingBoxes(fresh: Bool, freshSince: Double? = nil, offset: () -> Result<Int, CaretNotPlaced>, sameTarget: () -> Bool,
                        valueLength: () -> Int?, now: () -> Double, sleep: (Double) -> Void) -> Result<Int, CaretNotPlaced> {
  func awaited(_ answer: Result<Int, CaretNotPlaced>) -> Bool {
    answer == .failure(.noCharacterBoxes) || answer == .failure(.boxesIncomplete)
  }
  // An incomplete miss that is not waited for, or still incomplete at the bound, is a miss.
  func settled(_ answer: Result<Int, CaretNotPlaced>) -> Result<Int, CaretNotPlaced> {
    answer == .failure(.boxesIncomplete) ? .failure(.pointOutsideText) : answer
  }
  let first = offset()
  guard awaited(first), fresh, let length = valueLength() else { return settled(first) }
  let deadline = webAreaRereadDeadline(started: now(), freshSince: freshSince)
  var answer = first
  while awaited(answer), now() < deadline {
    sleep(webAreaActionRereadSampleMs)
    // Requalified before each read: a field that became another element, or a password field, is not read again.
    guard sameTarget() else { return .failure(.noCharacterBoxes) }
    answer = offset()
  }
  guard case .success = answer else { return settled(answer) }
  guard sameTarget(), valueLength() == length else { return .failure(.noCharacterBoxes) }
  return answer
}

/// A focusing click whose field never read focused: the write went to the app, but nothing shows it took.
func focusUnconfirmed(_ app: String) -> EngineError {
  EngineError(name: "clickUnconfirmed",
    "The click could not be confirmed: \(app)'s text field was asked through accessibility to take focus in the background, but it does not report focus. Observe the app with get_app_state before any retry, and never retry blindly.")
}

/// The note a focusing click's success carries to the model (the result's `note`): what was done instead of a click, and
/// where typing will go.
func focusNote(_ app: String, _ outcome: WebAreaFocusOutcome) -> String {
  switch outcome {
  case .placed:
    return "\(app)'s text field was focused through accessibility, with the caret at the point. No mouse event was sent, so the page saw no click."
  case .notPlaced(.layoutMoved):
    return "\(app)'s text field was focused through accessibility and its caret was written at the point, but the field's text moved on screen as it took focus, so where the caret is against the screenshot is not confirmed. Take a new screenshot before typing if the position matters. No mouse event was sent."
  case .notPlaced:
    return "\(app)'s text field was focused through accessibility, but the caret could not be placed at the point: typing goes to the field's existing selection, or to its start if it had none. Use select_text or set_value first if the position matters. No mouse event was sent."
  }
}

/// The caret offset a click at `point` places in a field whose value read as `value`, from its characters' boxes
/// (`caretOffset`): all of the value's UTF-16 units, searched, and read linearly within `caretScanLimit`; not searched when
/// it holds right-to-left characters. Only a value read as a string is text: anything else (a failed read, no value,
/// another type) is `unreadable`, never an empty field.
func textCaretOffset(at point: CGPoint, value: Any?, bounds: (Int) -> CGRect?) -> Result<Int, CaretNotPlaced> {
  guard let string = value as? String else { return .failure(.unreadable) }
  let text = string as NSString
  let length = text.length
  return caretOffset(at: point, length: length, range: 0..<length, bounds: bounds,
                     isLineBreak: { $0 < length && [0x0A, 0x0D, 0x2028, 0x2029].contains(text.character(at: $0)) },
                     mayLackBox: { mayLackBox(text, $0) }, searchable: !holdsRightToLeft(text))
}

/// Whether `text` holds a character written right to left, or a mark that orders text so (#290: such a line's boxes do
/// not run rightward in the text's order, so the caret is not searched for): the Hebrew, Arabic, Syriac, Thaana, NKo,
/// Samaritan and Mandaic blocks (U+0590 to U+08FF), their presentation forms (U+FB1D to U+FDFF, U+FE70 to U+FEFE), the
/// right-to-left mark, embedding, override and isolate (U+200F, U+202B, U+202E, U+2067), and the supplementary
/// right-to-left planes' ranges U+10800 to U+10FFF and U+1E800 to U+1EFFF (by their leading surrogates).
func holdsRightToLeft(_ text: NSString) -> Bool {
  for index in 0..<text.length {
    switch text.character(at: index) {
    case 0x0590...0x08FF, 0xFB1D...0xFDFF, 0xFE70...0xFEFE, 0x200F, 0x202B, 0x202E, 0x2067, 0xD802...0xD803, 0xD83A...0xD83B: return true
    default: continue
    }
  }
  return false
}

/// `textCaretOffset` over an element's own AXValue and characters' boxes: a text field, or a contenteditable region's
/// AXStaticText (whose AXNumberOfCharacters reads 0, so its length is its value's). AXVisibleCharacterRange is not read:
/// Chromium answers it with the whole text on a text field even when scrolled (round 2), and {0, 0} on a static text
/// (run 42152333871), so it never narrows the scan correctly.
func fieldCaretOffset(_ field: AXUIElement, at point: CGPoint) -> Result<Int, CaretNotPlaced> {
  textCaretOffset(at: point, value: attribute(field, kAXValueAttribute), bounds: { characterBounds(field, $0) })
}

/// One character's box in screen coordinates (AXBoundsForRange of {index, 1}); nil when the element gives none.
func characterBounds(_ element: AXUIElement, _ index: Int) -> CGRect? {
  var range = CFRange(location: index, length: 1)
  guard let rangeValue = AXValueCreate(.cfRange, &range) else { return nil }
  var result: CFTypeRef?
  guard AXUIElementCopyParameterizedAttributeValue(element, kAXBoundsForRangeParameterizedAttribute as CFString, rangeValue, &result) == .success,
        let result, CFGetTypeID(result) == AXValueGetTypeID() else { return nil }
  var rect = CGRect.zero
  return AXValueGetValue(result as! AXValue, .cgRect, &rect) ? rect : nil
}

// MARK: An element click on text entry (#313)
//
// #287's hosted cells (Safari 27.2, run 42379297174, 2 of 2): an element click by token on a page's AXTextArea took the
// ladder's AXPress, which WebKit answers with success while the focus stays on the web area, so the click answered
// success having done nothing. The hosted A/B of the first fix (run 42402098567, kit probe/313-ab) found #283's AXFocused
// write wrong outside Chromium: WebKit takes it by activating Safari (frontmost, its window over TextEdit within 0 to
// 240 ms, a bare write alike), and a background Firefox ignores it. Measured behind a frontmost TextEdit: an
// AXSelectedTextRange write focuses Safari's textarea without raising Safari, and type_text lands; AXPress focuses
// Safari's text field (not its textarea) and Firefox's fields. The design session's ruling c4108490: outside Chromium an
// element click on a text field never writes AXFocused; its action goes, its focus is read back, and on a WebKit page
// a field still unfocused gets its caret written and its focus read back again; success only on a read of true.

/// How long a text field's focus is read back after each step (#313, the ruling c4108490: 300 ms until Firefox's
/// measured latency sets it, capped at 1 s), sampled every `webAreaFocusSampleMs`.
let textEntryFocusSettleMs: Double = 300

/// How an element click the ladder gave an action (route 1, AXPick or AXPress) is carried (#313).
enum TextEntryClickRoute: Equatable {
  /// Not a text-entry role: the action alone, as before.
  case press
  /// A text-entry role (`webAreaEditableRoles`): the action, then the element's focus read back (`readingFocus`).
  /// `selecting`, a field in a WebKit page (a web area outside Chromium and Gecko): still unfocused, its caret is
  /// written (AXSelectedTextRange) and its focus read back again.
  case pressConfirmingFocus(selecting: Bool)
}

/// The route of an element click whose ladder chose an action (#313). Only a text-entry role reads anything here: in a
/// WebKit process (`engine` .other), its parents up to an AXWebArea (`webAreaAncestry`), which a native field lacks.
func textEntryClickRoute<Element>(_ element: Element, role: String, engine: PageEngine, roleOf: (Element) -> String?,
                                  parent: (Element) -> Element?) -> TextEntryClickRoute {
  guard webAreaEditableRoles.contains(role) else { return .press }
  guard engine == .other else { return .pressConfirmingFocus(selecting: false) }
  if case .success = webAreaAncestry(above: element, role: roleOf, parent: parent) { return .pressConfirmingFocus(selecting: true) }
  return .pressConfirmingFocus(selecting: false)
}

/// What a text field's focus read-back found (`elementClick.focus`).
enum FocusReadback: String, Equatable {
  /// The element read focused.
  case readBack
  /// It read unfocused within the settle and never focused: the click answers clickUnconfirmed.
  case notReadBack
  /// No read within the settle answered a boolean (the attribute unsupported, a messaging failure, an element gone): the
  /// click answers clickUnconfirmed too, since nothing shows the field took focus.
  case unread
}

/// `step`, then the element's AXFocused read (#313): true at once costs one read and no wait; anything else (false or no
/// boolean) is polled every `webAreaFocusSampleMs` for up to `textEntryFocusSettleMs`. Only a read of true is success.
func readingFocus(after step: () throws -> Void, focused: () -> Bool?, now: () -> Double, sleep: (Double) -> Void) throws -> FocusReadback {
  try step()
  var read = focused()
  if read == true { return .readBack }
  var readFalse = read == false
  let started = now()
  repeat {
    sleep(webAreaFocusSampleMs)
    read = focused()
    if read == true { return .readBack }
    if read == false { readFalse = true }
  } while now() - started < textEntryFocusSettleMs
  return readFalse ? .notReadBack : .unread
}

/// Where a WebKit page's field's caret is after its write (#313), claimed only as far as AXSelectedTextRange read back.
enum CaretPlacement: Equatable {
  /// The point's offset, written and read back.
  case atPoint(Int)
  /// The point gave no offset (why), so {0, 0} was written, and read back.
  case atStart(CaretNotPlaced)
  /// Not confirmed: the range read back otherwise or not at all (`selectionMismatch`, #283's word), or a password field,
  /// whose ranges are never read (`secure`).
  case unconfirmed(CaretNotPlaced)
}

/// What a text field's element click did (#313): the last read-back's answer, which step focused it, and, where its
/// caret was written, where it is and the write's AXError when it was not success.
struct TextEntryFocusRecord: Equatable {
  enum Step: String { case press, selection }
  let focus: FocusReadback
  let step: Step
  var caret: CaretPlacement? = nil
  var caretWriteError: Int32? = nil
}

/// Whether the field's selection reads back as the caret at `offset`, {offset, 0}: polled every `webAreaFocusSampleMs`
/// for up to `textEntryFocusSettleMs`, true at once on the first read that matches.
func readingCaret(_ offset: Int, selection: () -> (location: Int, length: Int)?, now: () -> Double, sleep: (Double) -> Void) -> Bool {
  func matches() -> Bool { selection().map { $0.location == offset && $0.length == 0 } == true }
  if matches() { return true }
  let started = now()
  repeat {
    sleep(webAreaFocusSampleMs)
    if matches() { return true }
  } while now() - started < textEntryFocusSettleMs
  return false
}

/// An element click whose ladder chose an action, carried by its route (#313): the action alone, or the action with its
/// focus read back and, on a WebKit page's field still unfocused, its caret written (`writeSelection`, at `caretOffset`
/// where that computes one, else at 0; its AXError kept) and its focus read back again. Once focused that way, the caret
/// counts as placed only where `selection` reads it back (`readingCaret`); a password field's range is never read.
/// `noted` records what was done; a field that has not read focused by the last step's settle answers clickUnconfirmed
/// (`textEntryFocusUnconfirmed`). Nothing writes AXFocused.
func carryActionClick(_ route: TextEntryClickRoute, app: String, press: () throws -> Void, focused: () -> Bool?,
                      caretOffset: () -> Result<Int, CaretNotPlaced>, writeSelection: (Int) throws -> AXError,
                      selection: () -> (location: Int, length: Int)?,
                      noted: (TextEntryFocusRecord) -> Void, now: () -> Double, sleep: (Double) -> Void) throws {
  guard case .pressConfirmingFocus(let selecting) = route else { return try press() }
  var record = TextEntryFocusRecord(focus: try readingFocus(after: press, focused: focused, now: now, sleep: sleep), step: .press)
  if record.focus != .readBack, selecting {
    let caret = caretOffset()
    let offset = (try? caret.get()) ?? 0
    var written = AXError.success
    let found = try readingFocus(after: { written = try writeSelection(offset) }, focused: focused, now: now, sleep: sleep)
    record = TextEntryFocusRecord(focus: found, step: .selection, caretWriteError: written == .success ? nil : written.rawValue)
    if found == .readBack {
      switch caret {
      case .failure(.secure): record.caret = .unconfirmed(.secure)
      case _ where !readingCaret(offset, selection: selection, now: now, sleep: sleep): record.caret = .unconfirmed(.selectionMismatch)
      case .success: record.caret = .atPoint(offset)
      case .failure(let why): record.caret = .atStart(why)
      }
    }
  }
  noted(record)
  if record.focus != .readBack { throw textEntryFocusUnconfirmed(app, selected: record.step == .selection) }
}

/// A text field's element click that left it unfocused (#313): its action performed (and, `selected`, its caret written),
/// but the field does not report focus.
func textEntryFocusUnconfirmed(_ app: String, selected: Bool) -> EngineError {
  EngineError(name: "clickUnconfirmed",
    "The click could not be confirmed: it was carried by the text field's accessibility action in \(app)\(selected ? ", then by placing its caret" : ""), but the field does not report focus. Observe the app with get_app_state before any retry, and never retry blindly.")
}

/// The note of a WebKit page's field focused by its caret's write (#313): no mouse event, and where typing goes, claimed
/// only where the caret read back.
func caretFocusNote(_ app: String, _ caret: CaretPlacement) -> String {
  switch caret {
  case .atPoint:
    return "\(app)'s text field was focused through accessibility by placing its caret at the point. No mouse event was sent, so the page saw no click."
  case .atStart:
    return "\(app)'s text field was focused through accessibility with its caret at the start, since the caret's place at the point could not be found. Use select_text or set_value first if the position matters. No mouse event was sent, so the page saw no click."
  case .unconfirmed:
    return "\(app)'s text field was focused through accessibility, but where its caret is could not be confirmed: typing may go elsewhere in the field or replace a selection. Use select_text or set_value first if the position matters. No mouse event was sent, so the page saw no click."
  }
}

/// The offset a WebKit page's field's caret is written at (#313): a password field first (`secure`, so nothing of it is
/// read, whatever its point), then no clickable point (`pointOutsideText`), then #283's box scan at the point (`offset`).
func textEntryCaretOffset(point: CGPoint?, secure: () -> Bool, offset: (CGPoint) -> Result<Int, CaretNotPlaced>) -> Result<Int, CaretNotPlaced> {
  if secure() { return .failure(.secure) }
  guard let point else { return .failure(.pointOutsideText) }
  return offset(point)
}

/// Whether a text field is a password field, whose value and ranges are never read (#283's rule): its role or subrole
/// AXSecureTextField, or a subrole that cannot be read.
func secureTextField(role: String?, subrole: SubroleRead) -> Bool {
  if role == "AXSecureTextField" { return true }
  switch subrole {
  case .subrole(let found): return found == "AXSecureTextField"
  case .none: return false
  case .failed: return true
  }
}

// MARK: Gecko's focus route (#315)
//
// #287's hosted cells: a shared-mode coordinate click into a background Firefox page is lost (34 of 34, pointer 0), since
// Gecko refuses a click-through mouse down into its page (Routes.swift `geckoChromeView`). The design session's ruling
// cb252e88 gives Gecko #282's element route and #283's focus route. But #313's A/B (run 42402098567) found a background
// Firefox ignoring an AXFocused write, while AXPress focuses its fields (p99 234 ms, inside `textEntryFocusSettleMs`), with
// Firefox kept behind. So on Gecko a text field takes #313's press and read-back, never #283's write.

/// How a shared-mode plain left click into a web area's text entry is carried, by the page's engine (`PageEngine`, only
/// Chromium's or Gecko's: `pointerView`'s web areas): Chromium's by #283's focus route (`focusPlacingCaret`: the caret's write, AXFocused its fallback, #341), Gecko's
/// by the field's own action with its focus read back (`pressFocusingField`).
enum WebAreaFocusCarrier: Equatable {
  case focusWrite
  case pressReadingFocus
}

func webAreaFocusCarrier(_ engine: PageEngine) -> WebAreaFocusCarrier {
  engine == .gecko ? .pressReadingFocus : .focusWrite
}

/// Gecko's focus route for the text-entry element the walk reached (`webAreaFocusTarget`): its action (`webAreaAction`:
/// AXPick, else AXPress) through `press`, then its focus read back as #313's is (`readingFocus`); only a read of true is
/// success, recorded through `noted` (step `press`), and a field that never reads focused answers clickUnconfirmed. A
/// field advertising neither action throws `WebAreaRefusal.noAction` with nothing pressed. Nothing writes AXFocused or
/// the selection here. Answers the action taken.
@discardableResult
func pressFocusingField(role: String, actions: [String]?, app: String, press: (String) throws -> Void, focused: () -> Bool?,
                        noted: (TextEntryFocusRecord) -> Void, now: () -> Double, sleep: (Double) -> Void) throws -> String {
  guard let action = webAreaAction(role: role, actions: actions) else { throw WebAreaRefusal.noAction }
  let found = try readingFocus(after: { try press(action) }, focused: focused, now: now, sleep: sleep)
  noted(TextEntryFocusRecord(focus: found, step: .press))
  if found != .readBack { throw textEntryFocusUnconfirmed(app, selected: false) }
  return action
}

/// What a left pointer refused in a web area (#282's `PointerRefused`) is carried by instead (#315): an element click's or
/// a coordinate click's by #282's element route from the hit (`webAreaPress`); focusField's fallback click (set_value's
/// and select_text's) by the field's own press on a Gecko page (`focusFallbackByPress`, the design session's ruling
/// 1cd6ed32: main's posted fallback set the value in a background Firefox, 3 of 3, its reorder inside the screen hold,
/// none visible; corrected 2026-11-08 (#324), the raise first read as 26 to 30 ms after the hold),
/// and by nothing elsewhere, so it stays refused (#282's item 6: an action is no focusing on Chromium).
enum RefusedPointerCarrier: Equatable {
  case elementRoute
  case focusPress
  case none
}

func refusedPointerCarrier(focusingFallback: Bool, engine: PageEngine) -> RefusedPointerCarrier {
  guard focusingFallback else { return .elementRoute }
  return webAreaFocusCarrier(engine) == .pressReadingFocus ? .focusPress : .none
}

/// focusField's fallback click on a Gecko page in shared mode, carried by the field's own action (AXPick, else AXPress)
/// through `press`, then its focus read back as #313's is (`readingFocus`, `textEntryFocusSettleMs`), so set_value or
/// select_text proceeds once it reads focused. Nothing writes AXFocused or a selection here. A field advertising neither
/// action is refused with nothing done (`focusFallbackUnfocusable`); one whose focus never reads back answers
/// `focusFallbackUnconfirmed`. Neither names an element click on the field, which would take the same press.
func focusFallbackByPress(role: String, actions: [String]?, app: String, press: (String) throws -> Void, focused: () -> Bool?,
                          now: () -> Double, sleep: (Double) -> Void) throws {
  guard let action = webAreaAction(role: role, actions: actions) else { throw focusFallbackUnfocusable(app) }
  let found = try readingFocus(after: { try press(action) }, focused: focused, now: now, sleep: sleep)
  if found != .readBack { throw focusFallbackUnconfirmed(app) }
}

/// The refusal of focusField's fallback on a Gecko page whose field has no action to focus it: nothing was done.
func focusFallbackUnfocusable(_ app: String) -> EngineError {
  EngineError(name: "backgroundClickRefused",
    "\(app)'s text field cannot be focused in the background: \(app)'s web page does not accept a background click, and the field exposes no accessibility action to focus it instead, so nothing was changed. Use a dedicated desktop, or ask the person to bring \(app) forward")
}

/// focusField's fallback on a Gecko page whose press did not leave the field reading focused: the action went, and the
/// page may have acted on it (a focus handler changing the value, then blurring the field), so the sentence claims only
/// that the method's own write was skipped (the review of acb88f72..146b76a7, one P2).
func focusFallbackUnconfirmed(_ app: String) -> EngineError {
  EngineError(name: "clickUnconfirmed",
    "\(app)'s text field could not be focused in the background: its accessibility action was performed, but the field does not report focus, so the requested value or selection was not written. Observe \(app) with get_app_state before any retry, and never retry blindly; to change the field, use a dedicated desktop, or ask the person to bring \(app) forward")
}

/// The note of a Gecko field focused by its action (#315): no caret was placed, so the place typing goes is Gecko's.
func pressFocusNote(_ app: String) -> String {
  "\(app)'s text field was focused through its accessibility action rather than a click at the point, so its caret is where \(app) put it, which need not be the point. Use select_text or set_value first if the position matters."
}
