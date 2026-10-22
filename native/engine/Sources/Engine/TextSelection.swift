import AppKit
import ApplicationServices
import Foundation

// select_text (R/F-helper-logic.md §16.2, R/sky-behaviour.md §16; the Decision Log's M2a vendor reading, item 5): the
// text is found in the element's rendered Markdown value first, then in its plain value; case-sensitive, `prefix` and
// `suffix` immediately adjacent, overlapping occurrences counted, exactly one match required; a Markdown match maps to
// the source's UTF-16 offsets with syntax at its edges skipped inward; `selection_type` text, cursor_before or
// cursor_after gives (L, N), (L, 0) or (L + N, 0), written as AXSelectedTextRange after the settable check and the
// field's focus. No scroll into view. Route 1, or route 3 when the app does not believe it has focus (its activation
// held, FocusHold.swift): nothing is posted to the field unless the focus fallback clicks.

/// A text element's value as an attributed string over its first `length` UTF-16 units (the parameterized read the
/// observation's Markdown comes from); nil when the element gives none.
func attributedValue(of element: AXUIElement, length: Int) -> NSAttributedString? {
  var range = CFRange(location: 0, length: length)
  guard let rangeValue = AXValueCreate(.cfRange, &range) else { return nil }
  var result: CFTypeRef?
  guard AXUIElementCopyParameterizedAttributeValue(element, kAXAttributedStringForRangeParameterizedAttribute as CFString, rangeValue, &result) == .success,
        let result, CFGetTypeID(result) == CFAttributedStringGetTypeID() else { return nil }
  return (result as! NSAttributedString)
}

private let monospaceFamilies = ["menlo", "monaco", "courier", "sf mono", "sfmono", "andale mono", "consolas", "source code"]

/// The Markdown rendering of an attributed value, with its source map: bold, italic and fixed-width runs from the font
/// each run carries, and per UTF-16 unit of the rendering the offset of the source unit it shows, nil for Markdown
/// syntax (the vendor's `sourceOffsets`, F §16.2). Nil when the value carries no such styling.
func markdownMapped(_ attributed: NSAttributedString) -> (text: String, offsets: [Int?])? {
  let text = attributed.string as NSString
  var rendered = ""
  var offsets: [Int?] = []
  var styled = false
  func source(_ piece: Substring, at location: Int) {
    rendered += piece
    offsets += (0..<piece.utf16.count).map { location + $0 }
  }
  func syntax(_ marker: String) {
    rendered += marker
    offsets += Array(repeating: nil, count: marker.utf16.count)
  }
  attributed.enumerateAttributes(in: NSRange(location: 0, length: attributed.length)) { attributes, run, _ in
    let piece = Substring(text.substring(with: run))
    let font = attributes[NSAttributedString.Key("AXFont")] as? [String: Any]
    let name = ((font?["AXFontName"] as? String) ?? "").lowercased()
    let family = ((font?["AXFontFamily"] as? String) ?? "").lowercased()
    let mono = monospaceFamilies.contains { name.contains($0) || family.contains($0) }
    let bold = !mono && ["bold", "black", "heavy", "semibold"].contains { name.contains($0) }
    let italic = !mono && (name.contains("italic") || name.contains("oblique"))
    let marker = mono ? "`" : (bold ? "**" : "") + (italic ? "*" : "")
    let leading = piece.prefix { $0.isWhitespace || $0.isNewline }
    let rest = piece.dropFirst(leading.count)
    let trailing = rest.reversed().prefix { $0.isWhitespace || $0.isNewline }.count
    let core = rest.dropLast(trailing)
    guard !marker.isEmpty, !core.isEmpty else { source(piece, at: run.location); return }
    styled = true
    let coreAt = run.location + leading.utf16.count
    source(leading, at: run.location)
    syntax(marker)
    source(core, at: coreAt)
    syntax(String(marker.reversed()))
    source(rest.suffix(trailing), at: coreAt + core.utf16.count)
  }
  return styled ? (rendered, offsets) : nil
}

/// The one occurrence of `text` in `haystack` with `prefix` immediately before it and `suffix` immediately after it, as
/// a UTF-16 range (the vendor's `rangeOfString:options:0:range:`, case-sensitive; each search restarts one unit after
/// the previous match, so overlapping occurrences count); nil when there is none or more than one.
func uniqueMatch(of text: String, in haystack: String, prefix: String, suffix: String) -> NSRange? {
  let hay = haystack as NSString
  guard !text.isEmpty else { return nil }
  let before = prefix.utf16.count, after = suffix.utf16.count
  var found: NSRange?
  var start = 0
  while start < hay.length {
    let match = hay.range(of: text, options: [], range: NSRange(location: start, length: hay.length - start))
    guard match.location != NSNotFound else { break }
    let end = match.location + match.length
    let prefixed = before == 0 || (match.location >= before && hay.substring(with: NSRange(location: match.location - before, length: before)) == prefix)
    let suffixed = after == 0 || (end + after <= hay.length && hay.substring(with: NSRange(location: end, length: after)) == suffix)
    if prefixed && suffixed {
      if found != nil { return nil }
      found = match
    }
    start = match.location + 1
  }
  return found
}

/// A range of the Markdown rendering as a range of the source (FUN_10062b34c): the syntax inside it dropped, so syntax
/// at either edge is skipped inward; nil for an empty range, one of syntax only, or one outside the map.
func sourceRange(_ range: NSRange, offsets: [Int?]) -> NSRange? {
  guard range.length > 0, range.location >= 0, range.location + range.length <= offsets.count else { return nil }
  let mapped = offsets[range.location..<(range.location + range.length)].compactMap { $0 }
  guard let first = mapped.first, let last = mapped.last else { return nil }
  return NSRange(location: first, length: last - first + 1)
}

/// The facade's `selection_type` (the wire's `ComputerUseIPCTextSelection` raw values).
enum TextSelectionType: String {
  case text, cursorBefore = "cursor_before", cursorAfter = "cursor_after"

  /// What is written for the matched (L, N): the range, or the caret before or after it.
  func selection(_ match: NSRange) -> CFRange {
    switch self {
    case .text: return CFRange(location: match.location, length: match.length)
    case .cursorBefore: return CFRange(location: match.location, length: 0)
    case .cursorAfter: return CFRange(location: match.location + match.length, length: 0)
    }
  }
}

/// Where select_text finds `text` (`sourceTextRange(forVisibleText:prefix:suffix:)` 0x10074f348): in the Markdown
/// rendering first, mapped to the source; then in the plain value (never a Boolean's). Nil when neither has exactly one.
func textRange(of text: String, prefix: String, suffix: String, markdown: (text: String, offsets: [Int?])?, plain: String?) -> NSRange? {
  if let markdown, let match = uniqueMatch(of: text, in: markdown.text, prefix: prefix, suffix: suffix),
     let mapped = sourceRange(match, offsets: markdown.offsets) {
    return mapped
  }
  guard let plain else { return nil }
  return uniqueMatch(of: text, in: plain, prefix: prefix, suffix: suffix)
}

/// An element's plain value for the search: a string or an attributed string's text; nil for any other value.
func plainText(_ value: CFTypeRef?) -> String? {
  guard let value else { return nil }
  if CFGetTypeID(value) == CFStringGetTypeID() { return (value as! String) }
  if CFGetTypeID(value) == CFAttributedStringGetTypeID() { return (value as! NSAttributedString).string }
  return nil
}

let selectTextNotSettable = EngineError(name: "selectionNotSettable",
  "Cannot select text for an element that does not support a settable selected text range")
let selectTextNotFound = EngineError(name: "textNotFound", "Could not find the requested text to select in the element")

extension Engine {
  /// `select_text {app, element, text, prefix?, suffix?, selection_type?}`.
  func selectText(_ args: [String: Any], _ context: ExecutionContext) throws -> Any {
    guard let text = args["text"] as? String else { throw EngineError.invalidArguments("text is required") }
    let prefix = args["prefix"] as? String ?? "", suffix = args["suffix"] as? String ?? ""
    let typeName = args["selection_type"] as? String ?? "text"
    guard let selectionType = TextSelectionType(rawValue: typeName) else {
      throw EngineError.invalidArguments("selection_type must be text, cursor_before or cursor_after")
    }
    let token = try requiredElementToken(args, context, method: "select_text")

    var meta = InputMeta(context)
    do {
      let (app, appPid, guarding) = try inputPrologue(args, context, meta: &meta)
      let target = try targetElement(token, app: app, appPid: appPid, context: context)
      meta.inputRoute = .action
      let ax = AXOps.live
      guard ax.isSettable(target.element, kAXSelectedTextRangeAttribute) else { throw selectTextNotSettable }
      let value = ax.read(target.element, kAXValueAttribute)
      let plain = plainText(value)
      let length = plain?.utf16.count ?? 0
      // The Markdown the observation would render: a text field's or area's value within the walk's bound.
      let markdown = [kAXTextAreaRole, kAXTextFieldRole].contains(target.entry.identity.role) && length > 0 && length <= markdownMaxLength
        ? attributedValue(of: target.element, length: length).flatMap(markdownMapped) : nil
      guard let match = textRange(of: text, prefix: prefix, suffix: suffix, markdown: markdown, plain: plain) else { throw selectTextNotFound }
      // Route 3's held activation when the app does not believe it has focus (FocusHold.swift), before the focus.
      if actionRoute(for: target, app: app, connection: context.connection) == .activation {
        try holdElementFocus(target, app: app, appPid: appPid, guarding: guarding, context: context, meta: &meta)
      }
      try focusField(target, app: app, appPid: appPid, guarding: guarding, connection: context.connection, meta: &meta)
      try guarding.checkInFlight()
      var written = AXError.failure
      meta.posting { written = ax.write(target.element, kAXSelectedTextRangeAttribute, axRangeValue(selectionType.selection(match))); return true }
      context.connection.markActed(app)
      guard written == .success else { throw EngineError(name: "actionFailed", "The element did not accept the text selection.") }
      return ["meta": meta.wire]
    } catch let error as EngineError {
      throw withMeta(error, meta)
    }
  }
}
