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
// The design session's rulings (1ea561bc a9607cd9): a point past a line's last character is the end of that line; an
// empty field is offset 0, placed; a point in no box is not placed, never a guessed offset; a read-back that differs is
// not placed; a secure field is focused only, with no read of its value or ranges.

/// How long the focus write's read-back and the caret's are polled, and how often.
let webAreaFocusSettleMs: Double = 300
let webAreaFocusSampleMs: Double = 20
/// The most characters a caret scan reads boxes for (about 0.1 ms each on the probe's runner); a longer range is not
/// scanned and the caret is not placed.
let caretScanLimit = 5_000

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
/// characters). An empty text is 0. Nil when no box holds the point and it is past no established line end, or the
/// range is longer than `caretScanLimit`.
func caretOffset(at point: CGPoint, length: Int, range: Range<Int>, bounds: (Int) -> CGRect?, isLineBreak: (Int) -> Bool) -> Int? {
  if length == 0 { return 0 }
  let scanned = range.clamped(to: 0..<length)
  guard scanned.count <= caretScanLimit else { return nil }
  // The rightmost line-end candidate: its offset, its x, and the box of the character it follows (nil for a line break).
  var lineEnd: (offset: Int, x: CGFloat, after: CGRect?)?
  for index in scanned {
    guard let box = bounds(index), box.height > 0, box.minY <= point.y, point.y < box.maxY else { continue }
    if isLineBreak(index) {
      // A line break's box marks where its line ends: the caret goes before it.
      if lineEnd.map({ box.minX >= $0.x }) ?? true { lineEnd = (index, box.minX, nil) }
      continue
    }
    guard box.width > 0 else { continue }
    if box.minX <= point.x, point.x < box.maxX { return point.x < box.midX ? index : index + 1 }
    if lineEnd.map({ box.maxX >= $0.x }) ?? true { lineEnd = (index + 1, box.maxX, box) }
  }
  guard let lineEnd, point.x >= lineEnd.x else { return nil }
  let end = lineEnd.offset
  guard let after = lineEnd.after, end < length, !isLineBreak(end) else { return end }
  // Only a usable box (as the scan's own) shows a lower line: an empty one, such as CGRect.zero, is no box at all.
  if let next = bounds(end), next.width > 0, next.height > 0, next.minY >= after.maxY { return end }
  return nil
}

/// Why a focused field's caret was not placed at the point (`elementClick.caret`).
enum CaretNotPlaced: String, Error, Equatable {
  /// A password field: never scanned.
  case secure
  /// The field's value could not be read as text, so no offset is known to correspond to the point.
  case unreadable
  /// No character's box holds the point, and it is past no line's end (or the text was too long to scan).
  case pointOutsideText
  /// The caret was written, but AXSelectedTextRange read back otherwise.
  case selectionMismatch
  /// The hit's text could not be mapped to the focused field's offsets (a contenteditable region over its text).
  case unmapped
}

enum WebAreaFocusOutcome: Equatable {
  case placed(Int)
  case notPlaced(CaretNotPlaced)
}

/// The focusing click itself, once the target is known: `beforeMutating` (the in-flight intervention check), AXFocused
/// written (`writeFocused`, its answer never counted) and polled (`focused`) for up to `webAreaFocusSettleMs`; still not
/// reading true, the click answers `focusUnconfirmed`. A secure field stops there. Otherwise the caret's offset
/// (`offset`, read once the field holds focus), written (`writeSelection`) and read back (`selection`, polled for the
/// same settle) as {offset, 0}.
func focusPlacingCaret(app: String, secure: Bool, beforeMutating: () throws -> Void, writeFocused: () -> Void, focused: () -> Bool?,
                       offset: () -> Result<Int, CaretNotPlaced>, writeSelection: (Int) -> Void, selection: () -> (location: Int, length: Int)?,
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
  switch offset() {
  case .failure(let why): return .notPlaced(why)
  case .success(let found): target = found
  }
  try beforeMutating()
  writeSelection(target)
  return settles({ selection().map { $0.location == target && $0.length == 0 } == true }) ? .placed(target) : .notPlaced(.selectionMismatch)
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
  let found = caretOffset(at: point, length: length, range: visible ?? 0..<length, bounds: bounds,
                          isLineBreak: { $0 < length && [0x0A, 0x0D, 0x2028, 0x2029].contains(text.character(at: $0)) })
  return found.map { .success($0) } ?? .failure(.pointOutsideText)
}

/// `textCaretOffset` over a text field's own AXValue, AXVisibleCharacterRange and characters' boxes.
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
