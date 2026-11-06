import ApplicationServices
import CoreGraphics
import Foundation

// #283: shared mode's focus route. A plain left click into a background Chromium web area whose hit is a text field, a
// text area or a contenteditable region (#282's walk stops there as `editable`) is carried by Accessibility, with no
// mouse event and no window ordering: AXFocused set true on the field, accepted only once it reads back true, then the
// caret placed at the point by AXSelectedTextRange {offset, 0} and read back. #283's hosted probe (probe/283-hosted,
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
/// The most characters a caret scan reads boxes for (round 2's probe: 3,074 in 165 to 185 ms, linear); a longer range is
/// not scanned and the caret is not placed.
let caretScanLimit = 5_000
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
/// (`bounds`, screen coordinates, nil or empty for a character with none) over `range`: in the box that holds the point,
/// before the character on its left half and after it on its right; past a line's last character (to the right of every
/// box in the line the point's height falls in), the end of that line, before its line break. That end counts only
/// once it is established: a line break's own box, or after the rightmost character read when the next offset is the
/// text's end, a line break, or a character whose non-empty box starts below this one's (a soft wrap; read even outside
/// `range`). Otherwise the rightmost box read need not be the line's last (a failed read, a scan cut to the visible
/// characters). An empty text is 0. Not placed: `noCharacterBoxes` when the scan read no usable box at all (one with
/// height, and width unless it is a line break's), as every box is before Chromium's complete accessibility mode;
/// `pointOutsideText` when usable boxes were read but none holds the point and it is past no established line end, or
/// the range is longer than `caretScanLimit`.
func caretOffset(at point: CGPoint, length: Int, range: Range<Int>, bounds: (Int) -> CGRect?,
                 isLineBreak: (Int) -> Bool) -> Result<Int, CaretNotPlaced> {
  if length == 0 { return .success(0) }
  let scanned = range.clamped(to: 0..<length)
  guard scanned.count <= caretScanLimit else { return .failure(.pointOutsideText) }
  var readABox = false
  // The rightmost line-end candidate: its offset, its x, and the box of the character it follows (nil for a line break).
  var lineEnd: (offset: Int, x: CGFloat, after: CGRect?)?
  for index in scanned {
    guard let box = bounds(index), box.height > 0 else { continue }
    let lineBreak = isLineBreak(index)
    guard lineBreak || box.width > 0 else { continue }
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
  guard let lineEnd, point.x >= lineEnd.x else { return .failure(.pointOutsideText) }
  let end = lineEnd.offset
  guard let after = lineEnd.after, end < length, !isLineBreak(end) else { return .success(end) }
  // Only a usable box (as the scan's own) shows a lower line: an empty one, such as CGRect.zero, is no box at all.
  if let next = bounds(end), next.width > 0, next.height > 0, next.minY >= after.maxY { return .success(end) }
  return .failure(.pointOutsideText)
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
  /// Character boxes were read, but none holds the point and it is past no line's end (or the text was too long to scan).
  case pointOutsideText
  /// The caret was written, but AXSelectedTextRange read back otherwise.
  case selectionMismatch
  /// The hit's text could not be mapped to the focused field's offsets: a contenteditable region's hit that is not an
  /// AXStaticText, or one `regionTextStart` does not place.
  case unmapped
}

enum WebAreaFocusOutcome: Equatable {
  case placed(Int)
  case notPlaced(CaretNotPlaced)
}

/// The focusing click itself, once the target is known: `beforeMutating` (the in-flight intervention check), AXFocused
/// written (`writeFocused`, its answer never counted) and polled (`focused`) for up to `webAreaFocusSettleMs`; still not
/// reading true, the click answers `focusUnconfirmed`. A secure field stops there. Otherwise the caret's offset
/// (`offset`, read once the field holds focus; `caretAwaitingBoxes` where it finds no character boxes yet), written
/// (`writeSelection`) and read back (`selection`, polled for the same settle) as {offset, 0}.
func focusPlacingCaret(app: String, secure: Bool, fresh: Bool, beforeMutating: () throws -> Void, writeFocused: () -> Void,
                       focused: () -> Bool?, offset: () -> Result<Int, CaretNotPlaced>, sameTarget: () -> Bool, valueLength: () -> Int?,
                       writeSelection: (Int) -> Void, selection: () -> (location: Int, length: Int)?,
                       now: () -> Double, sleep: (Double) -> Void) throws -> WebAreaFocusOutcome {
  func settles(_ condition: () -> Bool) -> Bool {
    let started = now()
    repeat {
      if condition() { return true }
      sleep(webAreaFocusSampleMs)
    } while now() - started < webAreaFocusSettleMs
    return condition()
  }
  try beforeMutating()
  writeFocused()
  guard settles({ focused() == true }) else { throw focusUnconfirmed(app) }
  if secure { return .notPlaced(.secure) }
  let target: Int
  switch caretAwaitingBoxes(fresh: fresh, offset: offset, focused: focused, sameTarget: sameTarget, valueLength: valueLength,
                            now: now, sleep: sleep) {
  case .failure(let why): return .notPlaced(why)
  case .success(let found): target = found
  }
  try beforeMutating()
  writeSelection(target)
  return settles({ selection().map { $0.location == target && $0.length == 0 } == true }) ? .placed(target) : .notPlaced(.selectionMismatch)
}

/// The caret's offset where a focused field's boxes may not exist yet (#283, the design session's ruling 37d4c12c): before
/// Chromium's complete accessibility mode every character box is empty (`noCharacterBoxes`). In a process whose
/// accessibility is `fresh` (#282's rule) the offset is computed again every `webAreaActionRereadSampleMs` for up to
/// `webAreaActionRereadMs`, posting nothing, until it answers anything else (an offset, or `pointOutsideText` or
/// `unmapped`, which then is the answer). Each re-read waits on `sameTarget` (still the element the click focused, and
/// not a secure one): failing, nothing more is read. An offset found by a re-read counts only if the field still reads
/// focused, is still that element and its value's length (`valueLength`) is the one read when the wait began; otherwise, as when the boxes stay empty or the process is not fresh or that length cannot be read
/// (no wait at all), `noCharacterBoxes`.
func caretAwaitingBoxes(fresh: Bool, offset: () -> Result<Int, CaretNotPlaced>, focused: () -> Bool?, sameTarget: () -> Bool,
                        valueLength: () -> Int?, now: () -> Double, sleep: (Double) -> Void) -> Result<Int, CaretNotPlaced> {
  let first = offset()
  guard first == .failure(.noCharacterBoxes), fresh, let length = valueLength() else { return first }
  let started = now()
  var answer = first
  while answer == .failure(.noCharacterBoxes), now() - started < webAreaActionRereadMs {
    sleep(webAreaActionRereadSampleMs)
    // Requalified before each read: a field that became another element, or a password field, is not read again.
    guard sameTarget() else { return .failure(.noCharacterBoxes) }
    answer = offset()
  }
  guard case .success = answer else { return answer }
  guard focused() == true, sameTarget(), valueLength() == length else { return .failure(.noCharacterBoxes) }
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
  case .notPlaced:
    return "\(app)'s text field was focused through accessibility, but the caret could not be placed at the point: typing goes to the field's existing selection, or to its start if it had none. Use select_text or set_value first if the position matters. No mouse event was sent."
  }
}

/// The caret offset a click at `point` places in a field whose value read as `value`, from its characters' boxes
/// (`caretOffset`): the value's UTF-16 units, scanned over `visible` (its visible character range) when it reads one,
/// else over all of it. Only a value read as a string is text: anything else (a failed read, no value, another type) is
/// `unreadable`, never an empty field.
func textCaretOffset(at point: CGPoint, value: Any?, visible: Range<Int>?, bounds: (Int) -> CGRect?) -> Result<Int, CaretNotPlaced> {
  guard let string = value as? String else { return .failure(.unreadable) }
  let text = string as NSString
  let length = text.length
  return caretOffset(at: point, length: length, range: visible ?? 0..<length, bounds: bounds,
                     isLineBreak: { $0 < length && [0x0A, 0x0D, 0x2028, 0x2029].contains(text.character(at: $0)) })
}

/// `textCaretOffset` over an element's own AXValue, AXVisibleCharacterRange and characters' boxes: a text field, or a
/// contenteditable region's AXStaticText (whose AXNumberOfCharacters reads 0, so its length is its value's). Chromium
/// answers AXVisibleCharacterRange with the whole text even when the field is scrolled (round 2's probe), so the scan
/// in practice covers all of it; it is still read, and honored, where an element gives less.
func fieldCaretOffset(_ field: AXUIElement, at point: CGPoint) -> Result<Int, CaretNotPlaced> {
  var visible: Range<Int>?
  if let wire = rangeWire(attribute(field, kAXVisibleCharacterRangeAttribute)), let location = wire["location"],
     let count = wire["length"], location >= 0, count >= 0 {
    visible = location..<(location + count)
  }
  return textCaretOffset(at: point, value: attribute(field, kAXValueAttribute), visible: visible, bounds: { characterBounds(field, $0) })
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
