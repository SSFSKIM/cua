import AppKit
import Foundation

// What a paste puts on the pasteboard per format (the spec's Design, "Paste"; R/F-helper-logic.md §7.2, the vendor's
// FUN_1001b76e0 and FUN_1001b81c8): `text` → plain only; `html` → public.html (the source as given), public.rtf and
// public.utf8-plain-text (the rendered text, not the source), in that order; `md` → converted to HTML first, then as
// `html`, the HTML given to AppKit's import with every image replaced by its alt text. The vendor converts with its own
// RichText graph (Markdown to HTML 0x100ec8064, HTML to an attributed string and RTF through RichTextConverter); cua
// uses Apple's: Foundation's Markdown parser for `md`, rendered here to HTML from its presentation intents, and
// AppKit's HTML import for the attributed string, whose RTF and text are the other two.

/// The facade's paste formats (R/A-contract.md §1.4); absent means `text`, as the facade defaults it.
enum PasteFormat: String {
  case text, md, html

  init(wire: Any?) throws {
    guard let wire else {
      self = .text
      return
    }
    guard let name = wire as? String, let format = PasteFormat(rawValue: name) else {
      throw EngineError.invalidArguments("format must be text, md or html")
    }
    self = format
  }
}

/// One type's data on a pasteboard item.
struct PasteRepresentation: Equatable {
  let type: NSPasteboard.PasteboardType
  let data: Data
}

/// The vendor's write failure (controller error case 4, F §7.2), for every conversion or pasteboard write that fails.
let clipboardWriteFailed = EngineError(name: "clipboardWriteFailed", "Could not write generated content to the clipboard")

/// The representations of `text` in `format`, in the order the vendor declares them.
func pasteRepresentations(_ text: String, format: PasteFormat) throws -> [PasteRepresentation] {
  switch format {
  case .text: return [PasteRepresentation(type: .string, data: Data(text.utf8))]
  case .md: return try htmlRepresentations(try markdownHTML(text))
  case .html: return try htmlRepresentations(text)
  }
}

/// A bound on AppKit's HTML import, which runs on the main thread, whose run loop serves the engine's observers and the
/// pasteboard's provider; the HTML it is given loads nothing (`htmlForImport`), so this is a backstop.
private let htmlImportTimeoutSeconds = 5.0

/// Elements that load a resource (or redirect, or carry CSS), removed with their content; `img` is replaced by its alt
/// text instead.
private let loadingElements: Set<String> = ["link", "iframe", "frame", "frameset", "object", "embed", "applet", "script", "style",
                                            "video", "audio", "source", "track", "picture", "svg", "meta", "base"]
/// Attributes that load a resource or carry CSS (where a `url()` can hide), dropped from every element.
private let loadingAttributes: Set<String> = ["src", "srcset", "lowsrc", "dynsrc", "background", "poster", "data", "codebase",
                                              "archive", "classid", "style", "manifest", "longdesc", "usemap", "action", "formaction",
                                              "xlink:href", "ping"]

/// The HTML AppKit's import is given for the RTF and the rendered text, so the engine fetches nothing at all: the
/// source parsed structurally (`XMLDocument` with HTML tidying, inside a body so text without markup parses too), every
/// `img` replaced by an escaped text node of its alt text, every resource-loading element removed with its content,
/// every loading or CSS-carrying attribute, every event handler and every `href` outside `a` dropped, then serialized.
/// public.html keeps the source as given. HTML the parser refuses is the write failure: nothing is touched.
func htmlForImport(_ html: String) throws -> String {
  guard let document = try? XMLDocument(xmlString: "<html><body>" + html + "</body></html>", options: [.documentTidyHTML]),
        let root = document.rootElement() else { throw clipboardWriteFailed }
  strip(root)
  return root.xmlString
}

private func strip(_ element: XMLElement) {
  for attribute in element.attributes ?? [] {
    let name = (attribute.name ?? "").lowercased()
    if loadingAttributes.contains(name) || name.hasPrefix("on") || (name == "href" && element.localName?.lowercased() != "a") {
      element.removeAttribute(forName: attribute.name ?? "")
    }
  }
  for (index, child) in (element.children ?? []).enumerated().reversed() {
    guard let child = child as? XMLElement else { continue }
    let name = (child.localName ?? "").lowercased()
    if name == "img" {
      element.replaceChild(at: index, with: XMLNode.text(withStringValue: child.attribute(forName: "alt")?.stringValue ?? "") as! XMLNode)
    } else if loadingElements.contains(name) || (name == "input" && child.attribute(forName: "type")?.stringValue?.lowercased() == "image") {
      element.removeChild(at: index)
    } else {
      strip(child)
    }
  }
}

/// HTML as the vendor declares it: the source, then RTF and the rendered text of its attributed string; both are
/// required (a failed import is the write failure).
private func htmlRepresentations(_ html: String) throws -> [PasteRepresentation] {
  let imported = try htmlForImport(html)
  let converted: (rtf: Data, text: String)? = onMain {
    guard let attributed = try? NSAttributedString(
      data: Data(imported.utf8),
      options: [.documentType: NSAttributedString.DocumentType.html, .characterEncoding: String.Encoding.utf8.rawValue,
                .timeout: htmlImportTimeoutSeconds],
      documentAttributes: nil) else { return nil }
    let range = NSRange(location: 0, length: attributed.length)
    guard let rtf = try? attributed.data(from: range, documentAttributes: [.documentType: NSAttributedString.DocumentType.rtf]) else { return nil }
    return (rtf, attributed.string)
  }
  guard let converted else { throw clipboardWriteFailed }
  return [
    PasteRepresentation(type: .html, data: Data(html.utf8)),
    PasteRepresentation(type: .rtf, data: converted.rtf),
    PasteRepresentation(type: .string, data: Data(converted.text.utf8)),
  ]
}

// MARK: Markdown to HTML

/// CommonMark with GitHub's tables, parsed by Foundation and rendered to HTML from each run's presentation intents: the
/// block intents (innermost first in a run's components) opened and closed by their identity, so consecutive runs of
/// one paragraph or list share their tags, an ordered list keeping its start; the inline intents as `em`, `strong`,
/// `code`, `del`, `a` and `img` (its text the alt, kept for the target app to decide on); inline and block
/// HTML in the source passed through as CommonMark renderers pass it. A failed parse is the write failure.
func markdownHTML(_ markdown: String) throws -> String {
  guard let parsed = try? AttributedString(markdown: markdown, options: .init(interpretedSyntax: .full)) else {
    throw clipboardWriteFailed
  }
  var html = ""
  var open: [PresentationIntent.IntentType] = []  // outermost first
  for run in parsed.runs {
    let blocks = Array((run.presentationIntent?.components ?? []).reversed())
    var shared = 0
    while shared < open.count, shared < blocks.count, open[shared].identity == blocks[shared].identity { shared += 1 }
    html += closeBlocks(open, from: shared)
    for (depth, block) in blocks.enumerated().dropFirst(shared) {
      html += openTag(block, inHeaderRow: inHeaderRow(blocks, below: depth), firstItem: depth + 1 < blocks.count ? blocks[depth + 1] : nil)
    }
    open = blocks
    html += inline(String(parsed[run.range].characters), run: run, block: blocks.last?.kind)
  }
  return html + closeBlocks(open, from: 0)
}

/// Whether the block at `depth` of an outermost-first path sits in a table's header row (its cells are `th`).
private func inHeaderRow(_ path: [PresentationIntent.IntentType], below depth: Int) -> Bool {
  path[..<depth].contains { $0.kind == .tableHeaderRow }
}

/// Closes the blocks of `path` from `start` on, innermost first.
private func closeBlocks(_ path: [PresentationIntent.IntentType], from start: Int) -> String {
  guard start < path.count else { return "" }
  return (start..<path.count).reversed().map { closeTag(path[$0], inHeaderRow: inHeaderRow(path, below: $0)) }.joined()
}

/// A block's opening tag; `firstItem`, the block inside it on the run that opens it, gives an ordered list its start.
private func openTag(_ block: PresentationIntent.IntentType, inHeaderRow: Bool, firstItem: PresentationIntent.IntentType?) -> String {
  switch block.kind {
  case .paragraph: return "<p>"
  case .header(let level): return "<h\(level)>"
  case .orderedList:
    if case .listItem(let ordinal) = firstItem?.kind, ordinal != 1 { return "<ol start=\"\(ordinal)\">\n" }
    return "<ol>\n"
  case .unorderedList: return "<ul>\n"
  case .listItem: return "<li>"
  case .codeBlock(let language):
    return language.map { "<pre><code class=\"language-\(escapeHTML($0))\">" } ?? "<pre><code>"
  case .blockQuote: return "<blockquote>"
  case .thematicBreak: return ""
  case .table: return "<table>"
  case .tableHeaderRow, .tableRow: return "<tr>"
  case .tableCell: return inHeaderRow ? "<th>" : "<td>"
  @unknown default: return ""
  }
}

private func closeTag(_ block: PresentationIntent.IntentType, inHeaderRow: Bool) -> String {
  switch block.kind {
  case .paragraph: return "</p>\n"
  case .header(let level): return "</h\(level)>\n"
  case .orderedList: return "</ol>\n"
  case .unorderedList: return "</ul>\n"
  case .listItem: return "</li>\n"
  case .codeBlock: return "</code></pre>\n"
  case .blockQuote: return "</blockquote>\n"
  case .thematicBreak: return "<hr>\n"
  case .table: return "</table>\n"
  case .tableHeaderRow, .tableRow: return "</tr>\n"
  case .tableCell: return inHeaderRow ? "</th>" : "</td>"
  @unknown default: return ""
  }
}

private func inline(_ text: String, run: AttributedString.Runs.Run, block: PresentationIntent.Kind?) -> String {
  if case .thematicBreak = block { return "" }
  let intent = run.inlinePresentationIntent ?? []
  var body: String
  if intent.contains(.inlineHTML) || intent.contains(.blockHTML) {
    body = text
  } else if intent.contains(.lineBreak) {
    body = "<br>\n"
  } else if intent.contains(.softBreak) {
    body = "\n"
  } else {
    body = escapeHTML(text)
    if intent.contains(.code) { body = "<code>\(body)</code>" }
    if intent.contains(.strikethrough) { body = "<del>\(body)</del>" }
    if intent.contains(.emphasized) { body = "<em>\(body)</em>" }
    if intent.contains(.stronglyEmphasized) { body = "<strong>\(body)</strong>" }
    if let image = run.imageURL { body = "<img src=\"\(escapeHTML(image.absoluteString))\" alt=\"\(escapeHTML(text))\">" }
    if let link = run.link { body = "<a href=\"\(escapeHTML(link.absoluteString))\">\(body)</a>" }
  }
  return body
}

private func escapeHTML(_ text: String) -> String {
  var escaped = ""
  for character in text {
    switch character {
    case "&": escaped += "&amp;"
    case "<": escaped += "&lt;"
    case ">": escaped += "&gt;"
    case "\"": escaped += "&quot;"
    default: escaped.append(character)
    }
  }
  return escaped
}
