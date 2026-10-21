import Foundation

// CSS for AppKit's HTML import (RichText.swift's `htmlForImport`): the formatting a paste's HTML carries is kept, since an
// app that takes the RTF (TextEdit) gets only what the import rendered, and whatever could load a resource is removed, so
// the engine fetches nothing. A declaration, a rule or a statement is judged on its text with comments removed and CSS
// escapes decoded, case-insensitively: any loading function (`url(`, `image-set(`, `image(`, `cross-fade(`, `element(`,
// `src(`), IE's `expression(` and `behavior`, Firefox's `-moz-binding`, and the `@import`, `@font-face` and `@namespace`
// rules are removed. What is kept is written back as given (the import decodes it as the check did). Text whose structure
// cannot be read with confidence (an unterminated string or comment, unbalanced brackets, a trailing backslash, a
// declaration without a property name, a block at-rule this file does not know) is dropped whole: fail closed.

private let loadingTokens = ["url(", "image-set(", "image(", "cross-fade(", "element(", "src(", "expression(", "behavior",
                             "-moz-binding", "@import", "@font-face", "@namespace"]

/// At-rules whose block holds rules, kept with their rules sanitized; any other block at-rule is dropped.
private let groupingRules: Set<String> = ["media", "supports", "layer", "container", "scope", "starting-style", "document",
                                          "keyframes", "-webkit-keyframes", "-moz-keyframes"]
/// Statement and block at-rules that load, dropped whatever they hold.
private let loadingRules: Set<String> = ["import", "font-face", "namespace"]

private typealias Scalars = [Unicode.Scalar]

/// Text with comments removed and escapes decoded (`\` with one to six hex digits and one optional whitespace, `\` with a
/// newline as nothing, `\` with any other character as that character), lowercased; nil for an unterminated comment or
/// a trailing backslash.
private func decoded(_ text: Scalars) -> String? {
  var result = String.UnicodeScalarView()
  var i = 0
  while i < text.count {
    let c = text[i]
    if c == "/", i + 1 < text.count, text[i + 1] == "*" {
      guard let end = commentEnd(text, i) else { return nil }
      i = end
    } else if c == "\\" {
      guard i + 1 < text.count else { return nil }
      var j = i + 1
      var hex = ""
      while j < text.count, hex.count < 6, text[j].properties.isASCIIHexDigit { hex.unicodeScalars.append(text[j]); j += 1 }
      if hex.isEmpty {
        if text[j] != "\n" { result.append(text[j]) }
        i = j + 1
      } else {
        result.append(UInt32(hex, radix: 16).flatMap { $0 == 0 ? nil : Unicode.Scalar($0) } ?? "\u{FFFD}")
        if j < text.count, [" ", "\t", "\n"].contains(text[j]) { j += 1 }
        i = j
      }
    } else {
      result.append(c)
      i += 1
    }
  }
  return String(result).lowercased()
}

/// The index after a comment opened at `start`; nil when it never closes.
private func commentEnd(_ text: Scalars, _ start: Int) -> Int? {
  var i = start + 2
  while i + 1 < text.count {
    if text[i] == "*" && text[i + 1] == "/" { return i + 2 }
    i += 1
  }
  return nil
}

/// Whether text could load something, or cannot be decoded (which counts as could).
private func loads(_ text: Scalars) -> Bool {
  guard let plain = decoded(text) else { return true }
  return loadingTokens.contains { plain.contains($0) }
}

private enum Boundary {
  case found(Int)
  case end
  case invalid
}

/// The first of `stops` at nesting depth zero from `start`, skipping strings, comments and escapes; `end` when the text
/// ends balanced, `invalid` when it ends inside a string, a comment or a bracket, or closes one it never opened.
private func boundary(_ text: Scalars, from start: Int, stops: Set<Unicode.Scalar>) -> Boundary {
  var depth: [Unicode.Scalar: Int] = ["(": 0, "[": 0, "{": 0]
  let opener: [Unicode.Scalar: Unicode.Scalar] = [")": "(", "]": "[", "}": "{"]
  var i = start
  while i < text.count {
    let c = text[i]
    let level = depth.values.reduce(0, +)
    if level == 0, stops.contains(c) { return .found(i) }
    switch c {
    case "\"", "'":
      i += 1
      while i < text.count, text[i] != c {
        if text[i] == "\n" { return .invalid }
        i += text[i] == "\\" ? 2 : 1
      }
      guard i < text.count else { return .invalid }
      i += 1
    case "/" where i + 1 < text.count && text[i + 1] == "*":
      guard let end = commentEnd(text, i) else { return .invalid }
      i = end
    case "\\":
      guard i + 1 < text.count else { return .invalid }
      i += 2
    case "(", "[", "{":
      depth[c, default: 0] += 1
      i += 1
    case ")", "]", "}":
      guard let open = opener[c], depth[open, default: 0] > 0 else { return .invalid }
      depth[open, default: 0] -= 1
      i += 1
    default:
      i += 1
    }
  }
  return depth.values.allSatisfy { $0 == 0 } ? .end : .invalid
}

private func trimmed(_ text: Scalars) -> String {
  String(String.UnicodeScalarView(text)).trimmingCharacters(in: .whitespacesAndNewlines)
}

private let propertyName = try! NSRegularExpression(pattern: #"^\s*-?-?[a-z_][a-z0-9_-]*\s*:"#)

/// A declaration list (a `style` attribute, a rule's block) with every declaration that could load removed, the rest as
/// given and joined by "; "; nil when it cannot be parsed confidently. An empty answer means nothing was kept.
func sanitizedDeclarations(_ text: String) -> String? {
  let scalars = Scalars(text.unicodeScalars)
  var kept: [String] = []
  var start = 0
  while start <= scalars.count {
    let end: Int
    switch boundary(scalars, from: start, stops: [";"]) {
    case .found(let index): end = index
    case .end: end = scalars.count
    case .invalid: return nil
    }
    let declaration = Scalars(scalars[start..<end])
    let text = trimmed(declaration)
    if !text.isEmpty {
      guard let plain = decoded(declaration),
            propertyName.firstMatch(in: plain, range: NSRange(location: 0, length: (plain as NSString).length)) != nil else { return nil }
      if !loads(declaration) { kept.append(text) }
    }
    start = end + 1
  }
  return kept.joined(separator: "; ")
}

/// A style sheet with every rule, declaration and at-rule that could load removed, the rest as given; nil when it cannot
/// be parsed confidently, or when it holds a `<`, which in HTML could close the style element it is written into.
func sanitizedSheet(_ text: String) -> String? {
  guard !text.contains("<") else { return nil }
  return sanitizedRules(Scalars(text.unicodeScalars))
}

private func sanitizedRules(_ scalars: Scalars) -> String? {
  var kept: [String] = []
  var start = 0
  while start < scalars.count {
    switch boundary(scalars, from: start, stops: [";", "{"]) {
    case .invalid: return nil
    case .end:
      // Trailing text with no block or semicolon: whitespace only, or it is dropped whole.
      guard trimmed(Scalars(scalars[start...])).isEmpty else { return nil }
      start = scalars.count
    case .found(let index):
      let prelude = Scalars(scalars[start..<index])
      guard let plainPrelude = decoded(prelude)?.trimmingCharacters(in: .whitespacesAndNewlines) else { return nil }
      let atName = plainPrelude.hasPrefix("@")
        ? String(plainPrelude.dropFirst().prefix { !$0.isWhitespace && $0 != "{" && $0 != ";" && $0 != "(" }) : nil
      if scalars[index] == ";" {
        // A statement: an at-rule (@charset, @import…) or stray text, which is invalid CSS and dropped.
        if let atName, !loadingRules.contains(atName), !loads(prelude) { kept.append(trimmed(prelude) + ";") }
        start = index + 1
        continue
      }
      guard case .found(let close) = boundary(scalars, from: index + 1, stops: ["}"]) else { return nil }
      let block = Scalars(scalars[(index + 1)..<close])
      start = close + 1
      if let atName {
        guard !loadingRules.contains(atName), groupingRules.contains(atName), !loads(prelude) else { continue }
        guard let inner = sanitizedRules(block) else { return nil }
        if !inner.isEmpty { kept.append("\(trimmed(prelude)) { \(inner) }") }
      } else {
        guard !loads(prelude) else { continue }
        guard let declarations = sanitizedDeclarations(String(String.UnicodeScalarView(block))) else { return nil }
        if !declarations.isEmpty { kept.append("\(trimmed(prelude)) { \(declarations) }") }
      }
    }
  }
  return kept.joined(separator: "\n")
}
