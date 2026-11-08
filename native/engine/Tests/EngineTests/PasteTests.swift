import AppKit
import Carbon
import Foundation
import XCTest
@testable import Engine

// Paste (the own native engine spec, Design "Paste" and "Text"; R/F-helper-logic.md §7, R/sky-behaviour.md §14–15): the
// representations per format, the lazy provider and the marker types, the snapshot and the restore guarded by the change
// count, the read and effect waits with their sentences, the engine-wide FIFO lock, and type_text's paste route (its
// text pasted, its newlines as Return presses). The owner's pasteboard is never touched: every test writes a pasteboard
// of its own, named uniquely and released after, and the "app" that reads it is the test reading that pasteboard.

private func unitsOf(_ text: String) -> Int { text.utf16.count }

private func plain(_ text: String) -> [PasteRepresentation] { [PasteRepresentation(type: .string, data: Data(text.utf8))] }

private func meta() -> InputMeta {
  InputMeta(ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
}

/// A pasteboard of the test's own, never the general one.
private final class TestPasteboard {
  let board = NSPasteboard(name: NSPasteboard.Name("io.github.ssfskim.cua.engine-test.\(UUID().uuidString)"))
  lazy var access = SystemPasteboard(board)

  /// What an app reading the pasteboard asks for: one type's data, through another handle on the same pasteboard.
  func appReads(_ type: NSPasteboard.PasteboardType = .string) -> String? {
    NSPasteboard(name: board.name).data(forType: type).flatMap { String(data: $0, encoding: .utf8) }
  }

  /// The user copying something of their own.
  func userCopies(_ text: String) {
    board.clearContents()
    board.setString(text, forType: .string)
  }

  func strings() -> [String] { (board.pasteboardItems ?? []).compactMap { $0.string(forType: .string) } }

  deinit { board.releaseGlobally() }
}

/// A pasteboard whose write takes it (clears it, as prepareForNewContents does) and then fails.
private final class ClearThenFail: PasteboardAccess {
  private let inner: SystemPasteboard
  private let board: NSPasteboard
  private(set) var cleared = false

  init(_ board: NSPasteboard) {
    self.board = board
    inner = SystemPasteboard(board)
  }

  var changeCount: Int { inner.changeCount }
  func snapshot() -> PasteboardState { inner.snapshot() }
  func write(_ item: NSPasteboardItem, expecting expected: Int) -> PasteboardWrite? {
    guard board.changeCount == expected else { return nil }
    cleared = true
    return PasteboardWrite(own: board.prepareForNewContents(with: .currentHostOnly), written: false)
  }
  func restore(_ snapshot: PasteboardSnapshot?, expecting own: Int) -> Bool { inner.restore(snapshot, expecting: own) }
}

/// A pasteboard on which the user copies after the engine's last change-count read and before its restore runs: the race
/// a restore that checks ownership apart from its clear would lose (whole-milestone review, P1).
private final class CopyBeforeRestore: PasteboardAccess {
  private let inner: SystemPasteboard
  private let copy: () -> Void

  init(_ pasteboard: TestPasteboard, copy: @escaping () -> Void) {
    inner = pasteboard.access
    self.copy = copy
  }

  var changeCount: Int { inner.changeCount }
  func snapshot() -> PasteboardState { inner.snapshot() }
  func write(_ item: NSPasteboardItem, expecting expected: Int) -> PasteboardWrite? { inner.write(item, expecting: expected) }
  func restore(_ snapshot: PasteboardSnapshot?, expecting own: Int) -> Bool {
    copy()
    return inner.restore(snapshot, expecting: own)
  }
}

// MARK: Formats and representations

final class PasteFormatTests: XCTestCase {
  func testTheFormatDefaultsToTextAndAcceptsOnlyTheVendorsThree() throws {
    XCTAssertEqual(try PasteFormat(wire: nil), .text)
    XCTAssertEqual(try PasteFormat(wire: "text"), .text)
    XCTAssertEqual(try PasteFormat(wire: "md"), .md)
    XCTAssertEqual(try PasteFormat(wire: "html"), .html)
    for bad: Any in ["markdown", "HTML", "", 3, true] {
      XCTAssertThrowsError(try PasteFormat(wire: bad)) { XCTAssertEqual(($0 as? EngineError)?.errorName, "invalidArguments") }
    }
  }

  func testTextIsPlainOnly() throws {
    XCTAssertEqual(try pasteRepresentations("한글 😀\nline", format: .text), plain("한글 😀\nline"))
  }

  /// html: the source as public.html, then RTF, then the rendered text as plain (F §7.2), in that order.
  func testHTMLDeclaresTheSourceTheRTFAndTheRenderedText() throws {
    let source = "<p>Hello <b>bold</b> &amp; <i>more</i></p>"
    let representations = try pasteRepresentations(source, format: .html)
    XCTAssertEqual(representations.map(\.type), [.html, .rtf, .string])
    XCTAssertEqual(String(data: representations[0].data, encoding: .utf8), source)
    XCTAssertTrue(String(data: representations[1].data, encoding: .ascii)?.hasPrefix("{\\rtf") == true)
    let rendered = String(data: representations[2].data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
    XCTAssertEqual(rendered, "Hello bold & more", "the plain representation is the rendered text, not the source")
  }

  /// md: converted to HTML first, then exactly as html.
  func testMarkdownGoesThroughHTML() throws {
    let representations = try pasteRepresentations("# Title\n\nSome **bold**", format: .md)
    XCTAssertEqual(representations.map(\.type), [.html, .rtf, .string])
    XCTAssertEqual(String(data: representations[0].data, encoding: .utf8), "<h1>Title</h1>\n<p>Some <strong>bold</strong></p>\n")
    let rendered = String(data: representations[2].data, encoding: .utf8) ?? ""
    XCTAssertTrue(rendered.contains("Title") && rendered.contains("Some bold"), rendered)
  }
}

final class ImportedHTMLTests: XCTestCase {
  /// The import's HTML as a string, failing the test when it cannot be made.
  private func imported(_ html: String) throws -> String { try XCTUnwrap(try? htmlForImport(html)) }

  /// The text AppKit renders from the import's HTML.
  private func rendered(_ html: String) throws -> String {
    let representations = try pasteRepresentations(html, format: .html)
    XCTAssertEqual(String(data: representations[0].data, encoding: .utf8), html, "public.html is the source as given")
    return (String(data: representations[2].data, encoding: .utf8) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
  }

  /// An image becomes its alt text, escaped, so the engine never fetches its URL (review finding 3, round 2).
  func testAnImageBecomesItsAltText() throws {
    XCTAssertEqual(try rendered(#"<p>Hi <img src="http://127.0.0.1:9/never" alt="pic"></p>"#), "Hi pic")
    XCTAssertEqual(try rendered(#"<p>a <IMG SRC='y.png' ALT='dog'/> b <img src=z.png> c</p>"#), "a dog b c", "an image without alt leaves nothing")
  }

  /// A `>` inside a quoted attribute does not end the tag.
  func testAQuotedGreaterThanStaysInsideTheTag() throws {
    XCTAssertEqual(try rendered(#"<p>a <img alt="1 > 0" src=x.png> b</p>"#), "a 1 > 0 b")
  }

  /// Alt text that looks like markup stays text: no element comes out of it.
  func testMarkupLookingAltTextStaysText() throws {
    let html = #"<p><img alt="<img src='http://127.0.0.1:9/never'" title=">">x</p>"#
    let result = try imported(html)
    XCTAssertFalse(result.lowercased().contains("<img"), result)
    XCTAssertTrue(result.contains("&lt;img"), result)
    XCTAssertEqual(try rendered(html), "<img src='http://127.0.0.1:9/never'x")
  }

  /// Every element that loads a resource is removed, and no attribute that loads one or carries CSS survives.
  func testEveryResourceLoaderIsRemoved() throws {
    let html = """
      <html><head><link rel="stylesheet" href="http://127.0.0.1:9/s.css"><style>p { background: url(http://127.0.0.1:9/b) }</style>
      <script src="http://127.0.0.1:9/s.js"></script><meta http-equiv="refresh" content="0;url=http://127.0.0.1:9/"><base href="http://127.0.0.1:9/"></head>
      <body style="background: url(http://127.0.0.1:9/body)" background="http://127.0.0.1:9/bg">
      <p style="color: red">kept <a href="https://example.com/">link</a></p>
      <iframe src="http://127.0.0.1:9/f"></iframe><object data="http://127.0.0.1:9/o"></object><embed src="http://127.0.0.1:9/e">
      <video poster="http://127.0.0.1:9/p" src="http://127.0.0.1:9/v"><source src="http://127.0.0.1:9/s"></video>
      <audio src="http://127.0.0.1:9/a"></audio><table background="http://127.0.0.1:9/t"><tr><td>cell</td></tr></table>
      <input type="image" src="http://127.0.0.1:9/i"><frameset><frame src="http://127.0.0.1:9/fr"></frameset>
      </body></html>
      """
    let result = try imported(html).lowercased()
    for name in ["img", "link", "iframe", "frame", "frameset", "object", "embed", "script", "video", "audio", "source", "meta", "base"] {
      XCTAssertFalse(result.contains("<\(name) ") || result.contains("<\(name)>") || result.contains("<\(name)/"), "\(name): \(result)")
    }
    for attribute in ["src=", "background=", "poster=", "data=", "url("] {
      XCTAssertFalse(result.contains(attribute), "\(attribute): \(result)")
    }
    XCTAssertFalse(result.contains("127.0.0.1"), result)
    XCTAssertTrue(result.contains("https://example.com/"), "a link's href loads nothing and is kept")
    XCTAssertTrue(result.contains(#"style="color: red""#), "CSS that loads nothing is kept: \(result)")
    XCTAssertFalse(result.contains("<body style"), "a style attribute left with no declaration is dropped: \(result)")
    let text = try rendered(html)
    XCTAssertTrue(text.contains("kept link") && text.contains("cell"), text)
  }

  /// The engine's RTF keeps the formatting CSS gives (review finding, round 3): a style attribute's bold and colour, and a
  /// style element's rule with a child combinator, whose `>` must reach the import unescaped.
  func testTheRTFKeepsStyleFormatting() throws {
    let html = #"<style>p > b { color: #00ff00 }</style><p><span style="font-weight: bold; color: #ff0000">important</span> <b>green</b></p>"#
    let rtf = try pasteRepresentations(html, format: .html)[1].data
    let back = try XCTUnwrap(NSAttributedString(rtf: rtf, documentAttributes: nil))
    func attributes(of word: String) -> (bold: Bool, red: CGFloat, green: CGFloat) {
      let range = (back.string as NSString).range(of: word)
      let font = back.attribute(.font, at: range.location, effectiveRange: nil) as? NSFont
      let color = (back.attribute(.foregroundColor, at: range.location, effectiveRange: nil) as? NSColor)?.usingColorSpace(.sRGB)
      return (font?.fontDescriptor.symbolicTraits.contains(.bold) ?? false, color?.redComponent ?? -1, color?.greenComponent ?? -1)
    }
    let important = attributes(of: "important")
    XCTAssertTrue(important.bold)
    XCTAssertEqual(important.red, 1, accuracy: 0.01)
    XCTAssertEqual(important.green, 0, accuracy: 0.01)
    XCTAssertEqual(attributes(of: "green").green, 1, accuracy: 0.01, "the child combinator survived the serialization")
  }

  /// A sheet that could close its own element in HTML is dropped whole.
  func testASheetThatCouldCloseItsElementIsDropped() throws {
    let result = try imported(#"<style>p::after { content: "</style><img src=http://127.0.0.1:9/x>" }</style><p>t</p>"#).lowercased()
    XCTAssertFalse(result.contains("<img"), result)
    XCTAssertFalse(result.contains("127.0.0.1"), result)
  }

  /// Text with no markup at all, and the empty string, still import.
  func testPlainTextAndEmptyImport() throws {
    XCTAssertEqual(try rendered("just text & more"), "just text & more")
    XCTAssertEqual(try rendered(""), "")
  }
}

final class MarkdownHTMLTests: XCTestCase {
  func testBlocksAndInlines() throws {
    let markdown = """
      # Title

      Some *em* and **strong** `a<b` [link](https://example.com/?a=1&b=2) text
      soft line

      - one
      - two
        - nested

      1. first
      2. second

      > quote

      ```swift
      let a = 1 < 2
      ```

      ---

      br\u{20}\u{20}
      here
      """
    XCTAssertEqual(try markdownHTML(markdown), """
      <h1>Title</h1>
      <p>Some <em>em</em> and <strong>strong</strong> <code>a&lt;b</code> <a href="https://example.com/?a=1&amp;b=2">link</a> text
      soft line</p>
      <ul>
      <li><p>one</p>
      </li>
      <li><p>two</p>
      <ul>
      <li><p>nested</p>
      </li>
      </ul>
      </li>
      </ul>
      <ol>
      <li><p>first</p>
      </li>
      <li><p>second</p>
      </li>
      </ol>
      <blockquote><p>quote</p>
      </blockquote>
      <pre><code class="language-swift">let a = 1 &lt; 2
      </code></pre>
      <hr>
      <p>br<br>
      here</p>

      """)
  }

  func testATable() throws {
    XCTAssertEqual(try markdownHTML("| a | b |\n|---|---|\n| 1 | 2 |"), """
      <table><tr><th>a</th><th>b</th></tr>
      <tr><td>1</td><td>2</td></tr>
      </table>

      """)
  }

  /// An ordered list keeps its start number (review finding 3).
  func testAnOrderedListKeepsItsStart() throws {
    XCTAssertEqual(try markdownHTML("5. five\n6. six"), "<ol start=\"5\">\n<li><p>five</p>\n</li>\n<li><p>six</p>\n</li>\n</ol>\n")
    XCTAssertTrue(try markdownHTML("1. one").hasPrefix("<ol>\n"))
  }

  /// An image survives in the HTML as `img` with its source and alt text; the target app decides what to do with it.
  func testAnImageSurvivesAsImg() throws {
    XCTAssertEqual(try markdownHTML("See ![a \"cat\"](https://example.com/c.png) here"),
                   "<p>See <img src=\"https://example.com/c.png\" alt=\"a &quot;cat&quot;\"> here</p>\n")
  }

  func testPlainTextEscapes() throws {
    XCTAssertEqual(try markdownHTML("a < b & \"c\""), "<p>a &lt; b &amp; &quot;c&quot;</p>\n")
  }
}

// MARK: The pasteboard, the provider and the markers

final class PasteboardTests: XCTestCase {
  /// The item declares the representations lazily and the two marker types clipboard managers honour; its data is handed
  /// over only when asked, and each hand-over counts as a read.
  func testTheLazyItemCarriesTheMarkersAndCountsAReadOnlyOnAHandOver() throws {
    let pasteboard = TestPasteboard()
    let representations = try pasteRepresentations("<p>x</p>", format: .html)
    let provider = LazyPasteProvider(representations)
    let item = try XCTUnwrap(provider.item())
    let write = try XCTUnwrap(pasteboard.access.write(item, expecting: pasteboard.access.changeCount))
    XCTAssertTrue(write.written)
    XCTAssertEqual(pasteboard.access.changeCount, write.own)
    XCTAssertEqual(Set(pasteboard.board.types?.map(\.rawValue) ?? []).isSuperset(of: ["public.html", "public.rtf", "public.utf8-plain-text",
                                                                                       "org.nspasteboard.ConcealedType", "org.nspasteboard.TransientType"]), true)
    XCTAssertFalse(provider.waitForRead(timeoutMs: 0), "nothing has read it yet")
    XCTAssertEqual(pasteboard.appReads(.html), "<p>x</p>")
    XCTAssertTrue(provider.read)
    XCTAssertTrue(provider.waitForRead(timeoutMs: 0))
  }

  func testTheSnapshotMaterialisesEveryTypeOfEveryItemAndTheRestorePutsThemBack() throws {
    let pasteboard = TestPasteboard()
    let first = NSPasteboardItem()
    first.setString("one", forType: .string)
    first.setData(Data("<i>one</i>".utf8), forType: .html)
    let second = NSPasteboardItem()
    second.setString("two", forType: .string)
    pasteboard.board.clearContents()
    pasteboard.board.writeObjects([first, second])
    let state = pasteboard.access.snapshot()
    XCTAssertEqual(state.changeCount, pasteboard.board.changeCount)
    let snapshot = try XCTUnwrap(state.items)
    XCTAssertEqual(snapshot.count, 2)
    XCTAssertEqual(snapshot[0].first { $0.type == .html }?.data, Data("<i>one</i>".utf8))

    pasteboard.userCopies("replaced")
    pasteboard.access.restore(snapshot, expecting: pasteboard.board.changeCount)
    XCTAssertEqual(pasteboard.strings(), ["one", "two"])
    XCTAssertEqual(pasteboard.appReads(.html), "<i>one</i>")
  }

  /// A restore expecting a count the pasteboard has moved past leaves the newer contents alone.
  func testARestoreWithAStaleCountLeavesTheContentsAlone() {
    let pasteboard = TestPasteboard()
    pasteboard.userCopies("ours")
    let own = pasteboard.board.changeCount
    pasteboard.userCopies("newer")
    pasteboard.access.restore(nil, expecting: own)
    XCTAssertEqual(pasteboard.strings(), ["newer"])
  }

  func testAnEmptyPasteboardSnapshotsAsNilAndRestoresEmpty() {
    let pasteboard = TestPasteboard()
    pasteboard.board.clearContents()
    XCTAssertNil(pasteboard.access.snapshot().items)
    pasteboard.userCopies("ours")
    pasteboard.access.restore(nil, expecting: pasteboard.board.changeCount)
    XCTAssertEqual(pasteboard.board.pasteboardItems?.count ?? 0, 0)
  }
}

// MARK: The lock

final class FIFOLockTests: XCTestCase {
  func testWaitersAreServedInArrivalOrder() {
    let lock = FIFOLock()
    XCTAssertTrue(lock.acquire(until: .distantFuture))
    let order = Box<[Int]>()
    order.value = []
    let orderLock = NSLock()
    let done = DispatchGroup()
    for n in 0..<5 {
      done.enter()
      Thread {
        XCTAssertTrue(lock.acquire(until: .distantFuture))
        orderLock.lock(); order.value?.append(n); orderLock.unlock()
        lock.release()
        done.leave()
      }.start()
      // Each waiter is queued before the next one starts.
      let queued = Date().addingTimeInterval(2)
      while lock.waiting < n + 1, Date() < queued { usleep(1_000) }
    }
    lock.release()
    XCTAssertEqual(done.wait(timeout: .now() + 5), .success)
    XCTAssertEqual(order.value, [0, 1, 2, 3, 4])
  }

  /// A waiter whose deadline passes gives its place up, and the line behind it moves on.
  func testAWaiterThatTimesOutLeavesTheLine() {
    let lock = FIFOLock()
    XCTAssertTrue(lock.acquire(until: .distantFuture))
    XCTAssertFalse(lock.acquire(until: Date().addingTimeInterval(0.05)))
    XCTAssertEqual(lock.waiting, 0)
    let served = DispatchSemaphore(value: 0)
    Thread {
      if lock.acquire(until: .distantFuture) { served.signal(); lock.release() }
    }.start()
    let queued = Date().addingTimeInterval(2)
    while lock.waiting < 1, Date() < queued { usleep(1_000) }
    lock.release()
    XCTAssertEqual(served.wait(timeout: .now() + 2), .success)
  }

  /// The engine's wrapper: the request's deadline bounds the wait, refused as timeoutReached with nothing done.
  func testThePasteLockRefusesAtTheDeadline() {
    let lock = FIFOLock()
    XCTAssertTrue(lock.acquire(until: .distantFuture))
    var ran = false
    XCTAssertThrowsError(try withPasteLock(lock, deadline: unixMilliseconds() + 30) { ran = true }) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "timeoutReached")
    }
    XCTAssertFalse(ran)
    lock.release()
    XCTAssertNoThrow(try withPasteLock(lock, deadline: unixMilliseconds() + 1_000) { ran = true })
    XCTAssertTrue(ran)
    XCTAssertTrue(lock.acquire(until: Date()), "released after the body")
  }
}

// MARK: The operation

final class PasteOperationTests: XCTestCase {
  private var clock = 0.0

  /// An effect watch on a fake clock: `reading` is the focused element's state as the test sets it.
  private func effect(observer: Bool = false, source: NotificationSource? = nil,
                      reading: @escaping () -> EffectReading = { EffectReading(range: [0, 0], characters: 0) }) -> PasteEffect {
    PasteEffect(source: source ?? (observer ? .trusted : .none), read: reading, now: { [unowned self] in clock }, sleep: { [unowned self] in clock += $0 })
  }

  @discardableResult
  private func run(_ parts: [PastePart], _ pasteboard: TestPasteboard, effect: PasteEffect, readTimeoutMs: Double = 0,
                   remainingMs: () -> Double = { .infinity }, keyFocusAtPaste: () -> KeyFocusReading? = { nil },
                   mainProbe: (@escaping @Sendable () -> Void) -> Void = { $0() },
                   checkInFlight: () throws -> Void = {}, postPaste: () -> Bool, postReturn: () -> Bool = { true },
                   entered: inout Int, meta: inout InputMeta) throws -> PasteOutcome {
    try runPaste(parts, pasteboard: pasteboard.access, effect: effect, readTimeoutMs: readTimeoutMs, remainingMs: remainingMs,
                 keyFocusAtPaste: keyFocusAtPaste, mainProbe: mainProbe, checkInFlight: checkInFlight,
                 postPaste: postPaste, postReturn: postReturn, entered: &entered, meta: &meta)
  }

  /// The diagnostics' wire, as the service passes it on.
  private func diagnostics(_ meta: InputMeta) -> [String: Any] { meta.paste?.wire ?? [:] }

  func testAPasteLandsAndThePreviousContentsComeBack() throws {
    let pasteboard = TestPasteboard()
    pasteboard.userCopies("the owner's")
    var characters = 0
    let watch = effect { EffectReading(range: [characters, 0], characters: characters) }
    var seen: String?
    var entered = 0
    var meta = meta()
    try run([.content(plain("pasted"), units: 6)], pasteboard, effect: watch, postPaste: {
      seen = pasteboard.appReads()
      characters = 6
      return true
    }, entered: &entered, meta: &meta)
    XCTAssertEqual(seen, "pasted", "the app read the engine's text after ⌘V")
    XCTAssertEqual(pasteboard.strings(), ["the owner's"], "restored")
    XCTAssertEqual(entered, 6)
    XCTAssertNotNil(meta.startedAt)
    XCTAssertNotNil(meta.endedAt)
  }

  /// A human copy after the last ownership read and before the restore's clear: the restore rechecks the count in the
  /// same operation as its clear, so the human's copy is kept, and the answer is the one a restore skipped earlier gives
  /// (whole-milestone review, P1): success for a paste that landed, the paste's own error for one that failed.
  func testAHumanCopyJustBeforeTheRestoreIsKept() throws {
    let pasteboard = TestPasteboard()
    pasteboard.userCopies("the owner's")
    let racing = CopyBeforeRestore(pasteboard) { pasteboard.userCopies("human copy") }
    var characters = 0
    var entered = 0
    var meta = meta()
    try runPaste([.content(plain("pasted"), units: 6)], pasteboard: racing,
                 effect: effect { EffectReading(range: [characters, 0], characters: characters) }, readTimeoutMs: 0,
                 checkInFlight: {}, postPaste: { _ = pasteboard.appReads(); characters = 6; return true }, postReturn: { true },
                 entered: &entered, meta: &meta)
    XCTAssertEqual(pasteboard.strings(), ["human copy"], "the landed paste's restore left the human's copy alone")
    XCTAssertEqual(entered, 6)

    pasteboard.userCopies("the owner's")
    XCTAssertThrowsError(try runPaste([.content(plain("x"), units: 1)], pasteboard: racing, effect: effect(), readTimeoutMs: 0,
                                      checkInFlight: {}, postPaste: { true }, postReturn: { true }, entered: &entered, meta: &meta)) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "clipboardReadTimedOut")
    }
    XCTAssertEqual(pasteboard.strings(), ["human copy"], "the failed paste's restore left the human's copy alone")
  }

  /// The pasteboard taken (cleared) but the write refused: the previous contents come back (review finding 1).
  func testAWriteThatFailsAfterTheClearStillRestores() {
    let pasteboard = TestPasteboard()
    pasteboard.userCopies("the owner's")
    let failing = ClearThenFail(pasteboard.board)
    var posted = false
    var entered = 0
    var meta = meta()
    XCTAssertThrowsError(try runPaste([.content(plain("x"), units: 1)], pasteboard: failing, effect: effect(), readTimeoutMs: 0,
                                      checkInFlight: {}, postPaste: { posted = true; return true }, postReturn: { true },
                                      entered: &entered, meta: &meta)) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "clipboardWriteFailed")
    }
    XCTAssertTrue(failing.cleared, "the write took the pasteboard before it failed")
    XCTAssertFalse(posted)
    XCTAssertEqual(pasteboard.strings(), ["the owner's"])
  }

  /// A human copy during a line's effect wait: the next line never retakes the pasteboard, the paste stops as the
  /// conflict, and the human's copy is kept (review finding 2).
  func testAHumanCopyBetweenLinesStopsTheTypedTextAndIsKept() {
    let pasteboard = TestPasteboard()
    pasteboard.userCopies("older")
    var log: [String] = []
    var characters = 0
    var reads = 0
    var entered = 0
    var meta = meta()
    let reading = {
      reads += 1
      if reads == 2 { pasteboard.userCopies("newer human copy") }  // the first poll of line a's effect wait
      return EffectReading(range: nil, characters: characters)
    }
    XCTAssertThrowsError(try run(pasteParts(typing: "a\nb"), pasteboard, effect: effect(reading: reading), postPaste: {
      log.append("paste " + (pasteboard.appReads() ?? "nil"))
      characters += 1
      return true
    }, postReturn: { log.append("Return"); characters += 1; return true }, entered: &entered, meta: &meta)) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "clipboardConflict")
    }
    XCTAssertEqual(log, ["paste a", "Return"], "line b was never written")
    XCTAssertEqual(pasteboard.strings(), ["newer human copy"])
    XCTAssertEqual(entered, 2)
  }

  /// A human copy while the second line's baseline is read: the write refuses at its own boundary, before taking the
  /// pasteboard, and the human's copy is kept (review finding 1, round 2).
  func testAHumanCopyDuringALaterBaselineIsNeverOverwritten() {
    let pasteboard = TestPasteboard()
    pasteboard.userCopies("older")
    var log: [String] = []
    var characters = 0
    var afterReturn = false
    var copied = false
    var entered = 0
    var meta = meta()
    let reading = {
      if afterReturn && !copied {  // line b's baseline, read in effect.begin() just before its write
        copied = true
        pasteboard.userCopies("newer human copy")
      }
      return EffectReading(range: nil, characters: characters)
    }
    XCTAssertThrowsError(try run(pasteParts(typing: "a\nb"), pasteboard, effect: effect(reading: reading), postPaste: {
      log.append("paste " + (pasteboard.appReads() ?? "nil"))
      characters += 1
      return true
    }, postReturn: { afterReturn = true; characters += 1; log.append("Return"); return true }, entered: &entered, meta: &meta)) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "clipboardConflict")
    }
    XCTAssertTrue(copied)
    XCTAssertEqual(log, ["paste a", "Return"])
    XCTAssertEqual(pasteboard.strings(), ["newer human copy"])
  }

  /// A human copy between the snapshot and the first write: the first write refuses too, so the stale snapshot is
  /// never restored over the human's copy.
  func testAHumanCopyBeforeTheFirstWriteIsNeverOverwritten() {
    let pasteboard = TestPasteboard()
    pasteboard.userCopies("older")
    var posted = false
    var entered = 0
    var meta = meta()
    var reads = 0
    let reading = {
      reads += 1
      if reads == 1 { pasteboard.userCopies("newer human copy") }  // the first line's baseline, after the snapshot
      return EffectReading(range: nil, characters: 0)
    }
    XCTAssertThrowsError(try run([.content(plain("x"), units: 1)], pasteboard, effect: effect(reading: reading),
                                 postPaste: { posted = true; return true }, entered: &entered, meta: &meta)) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "clipboardConflict")
    }
    XCTAssertFalse(posted)
    XCTAssertNil(meta.startedAt)
    XCTAssertEqual(pasteboard.strings(), ["newer human copy"])
  }

  /// No read within the wait: the read stage's error, whose sentence says delivery is unknown and to observe before any
  /// retry (#187); the previous contents restored, the interval kept (⌘V was posted).
  func testNoReadIsTheReadStageAndStillRestores() {
    let pasteboard = TestPasteboard()
    pasteboard.userCopies("the owner's")
    var entered = 0
    var meta = meta()
    XCTAssertThrowsError(try run([.content(plain("x"), units: 1)], pasteboard, effect: effect(), postPaste: { true },
                                 entered: &entered, meta: &meta)) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "clipboardReadTimedOut")
      XCTAssertEqual((error as? EngineError)?.message,
                     "Timed out waiting for the application to read the clipboard: ⌘V was sent, but no app read the pasted text in time. Whether anything was entered is unknown: observe the field with get_app_state before any retry, and never retry blindly.")
    }
    XCTAssertEqual(pasteboard.strings(), ["the owner's"])
    XCTAssertEqual(entered, 0)
    XCTAssertNotNil(meta.startedAt, "⌘V was posted")
    XCTAssertEqual(diagnostics(meta)["readWait"] as? String, "timeout")
    XCTAssertNil(diagnostics(meta)["effectWait"], "the read wait ended it")
    XCTAssertEqual(diagnostics(meta)["stage"] as? String, "read")
    XCTAssertNil(diagnostics(meta)["confirmed"], "never reached the effect stage")
    XCTAssertNil(diagnostics(meta)["readAfterPostMs"], "no read")
    XCTAssertEqual(diagnostics(meta)["restore"] as? String, "restored")
  }

  /// The user copied after the engine wrote: the conflict sentence, and their newer contents are never overwritten.
  func testAUserCopyDuringThePasteIsTheConflictAndIsKept() {
    let pasteboard = TestPasteboard()
    pasteboard.userCopies("older")
    var entered = 0
    var meta = meta()
    XCTAssertThrowsError(try run([.content(plain("x"), units: 1)], pasteboard, effect: effect(), postPaste: {
      _ = pasteboard.appReads()
      pasteboard.userCopies("newer")
      return true
    }, entered: &entered, meta: &meta)) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "clipboardConflict")
      XCTAssertTrue((error as? EngineError)?.message.hasPrefix("The user may have conflicted with your paste operation.") == true)
    }
    XCTAssertEqual(pasteboard.strings(), ["newer"])
  }

  /// A read timeout with a moved count is reported as the conflict (F §7.6), and the newer contents kept.
  func testAReadTimeoutWithAMovedCountIsTheConflict() {
    let pasteboard = TestPasteboard()
    var entered = 0
    var meta = meta()
    XCTAssertThrowsError(try run([.content(plain("x"), units: 1)], pasteboard, effect: effect(), postPaste: {
      pasteboard.userCopies("newer")
      return true
    }, entered: &entered, meta: &meta)) { XCTAssertEqual(($0 as? EngineError)?.errorName, "clipboardConflict") }
    XCTAssertEqual(pasteboard.strings(), ["newer"])
  }

  /// Read, but no effect within 2 s: `pasteUnconfirmed`, an error, where the vendor answers its read sentence (#187;
  /// FUN_1001b534c); the wait polled every 25 ms, the previous contents restored.
  func testNoEffectIsPasteUnconfirmedAfterTwoSeconds() {
    let pasteboard = TestPasteboard()
    pasteboard.userCopies("the owner's")
    var entered = 0
    var meta = meta()
    clock = 0
    XCTAssertThrowsError(try run([.content(plain("x"), units: 1)], pasteboard, effect: effect(), postPaste: {
      _ = pasteboard.appReads()
      return true
    }, entered: &entered, meta: &meta)) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "pasteUnconfirmed")
      XCTAssertEqual((error as? EngineError)?.message,
                     "The paste could not be confirmed: ⌘V was sent and the pasted text was read from the clipboard, but no change was seen in the field. The text may have arrived: observe the field with get_app_state before any retry, and never retry blindly.")
    }
    XCTAssertEqual(clock, 2_000, accuracy: 25)
    XCTAssertEqual(entered, 0)
    XCTAssertEqual(pasteboard.strings(), ["the owner's"])
    XCTAssertEqual(diagnostics(meta)["readWait"] as? String, "handedOver")
    XCTAssertEqual(diagnostics(meta)["effectWait"] as? String, "timeout")
    XCTAssertEqual(diagnostics(meta)["effectWaitMs"] as? Double ?? 0, 2_000, accuracy: 25)
    XCTAssertEqual(diagnostics(meta)["confirmed"] as? Bool, false, "a channel, and no change came")
    XCTAssertEqual(diagnostics(meta)["stage"] as? String, "effect")
    XCTAssertEqual(diagnostics(meta)["restore"] as? String, "restored")
  }

  /// No channel up front (the baseline empty, no trusted notification source) and the read came after ⌘V: success at
  /// once, unconfirmed (the vendor's 100 ms blind success, gated on the read's timing; #187), with no wait at all.
  func testWithNoChannelAReadAfterCommandVIsAnUnconfirmedSuccessAtOnce() throws {
    let pasteboard = TestPasteboard()
    pasteboard.userCopies("the owner's")
    var entered = 0
    var meta = meta()
    clock = 0
    let outcome = try run([.content(plain("x"), units: 1)], pasteboard, effect: effect(reading: { EffectReading() }), postPaste: { [unowned self] in
      clock += 2
      _ = pasteboard.appReads()  // the app's read, 2 ms after ⌘V's post
      return true
    }, entered: &entered, meta: &meta)
    XCTAssertEqual(outcome, PasteOutcome(pastedLines: 1, unconfirmedLines: 1))
    XCTAssertEqual(entered, 1)
    XCTAssertEqual(clock, 2, "no wait")
    XCTAssertEqual(pasteboard.strings(), ["the owner's"])
    XCTAssertEqual(diagnostics(meta)["confirmed"] as? Bool, false)
    XCTAssertEqual(diagnostics(meta)["stage"] as? String, "effect")
    XCTAssertEqual(diagnostics(meta)["effectWait"] as? String, "noChannel")
    XCTAssertEqual(diagnostics(meta)["readAfterPostMs"] as? Double, 2)
    XCTAssertEqual(diagnostics(meta)["unconfirmedLines"] as? Int, 1)
    XCTAssertEqual(diagnostics(meta)["baselineEmpty"] as? Bool, true)
    XCTAssertEqual(diagnostics(meta)["notificationSource"] as? String, "none")
    XCTAssertEqual(diagnostics(meta)["restore"] as? String, "restored")
    XCTAssertEqual(pasteUnconfirmedNote(outcome),
                   "Pasted, unconfirmed: the app read the text after ⌘V, but this field can't be read back, so the change couldn't be seen. Observe the field if the next step depends on it.")
  }

  /// Several representations (an HTML paste): a clipboard manager takes the plain text before ⌘V and the target takes
  /// the HTML after it. Separate hand-overs: the one after ⌘V counts, so with no channel the answer is the unconfirmed
  /// success; the first read's time is kept for the diagnostics (#187 re-review, P2).
  func testWithNoChannelAHandOverAfterCommandVCountsThoughAnotherCameBefore() throws {
    let pasteboard = TestPasteboard()
    pasteboard.userCopies("the owner's")
    let representations = [PasteRepresentation(type: .html, data: Data("<b>x</b>".utf8)), PasteRepresentation(type: .string, data: Data("x".utf8))]
    var entered = 0
    var meta = meta()
    clock = 0
    let outcome = try run([.content(representations, units: 1)], pasteboard, effect: effect(reading: { EffectReading() }),
                          checkInFlight: { [unowned self] in
                            _ = pasteboard.appReads(.string)  // a clipboard manager, 10 ms before ⌘V
                            clock += 10
                          }, postPaste: { [unowned self] in
                            clock += 2
                            _ = pasteboard.appReads(.html)  // the target, 2 ms after ⌘V
                            return true
                          }, entered: &entered, meta: &meta)
    XCTAssertEqual(outcome, PasteOutcome(pastedLines: 1, unconfirmedLines: 1))
    XCTAssertEqual(diagnostics(meta)["readAfterPostMs"] as? Double, -10, "the first hand-over, kept")
    XCTAssertEqual(diagnostics(meta)["firstReadAfterPostMs"] as? Double, 2, "the first hand-over at or after ⌘V")
    XCTAssertEqual(diagnostics(meta)["confirmed"] as? Bool, false)
    XCTAssertEqual(pasteboard.strings(), ["the owner's"])
  }

  /// No channel and the only read came before ⌘V (a foreign reader: the lazy provider is not asked again for the
  /// target): `pasteUnconfirmed`, at once.
  func testWithNoChannelAReadOnlyBeforeCommandVIsPasteUnconfirmed() {
    let pasteboard = TestPasteboard()
    pasteboard.userCopies("the owner's")
    var entered = 0
    var meta = meta()
    clock = 0
    XCTAssertThrowsError(try run([.content(plain("x"), units: 1)], pasteboard, effect: effect(reading: { EffectReading() }),
                                 checkInFlight: { [unowned self] in
                                   _ = pasteboard.appReads()  // a clipboard manager, before ⌘V
                                   clock += 5
                                 }, postPaste: { _ = pasteboard.appReads(); return true }, entered: &entered, meta: &meta)) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "pasteUnconfirmed")
    }
    XCTAssertEqual(clock, 5, "no wait")
    XCTAssertEqual(entered, 0)
    XCTAssertEqual(diagnostics(meta)["readAfterPostMs"] as? Double, -5)
    XCTAssertNil(diagnostics(meta)["firstReadAfterPostMs"], "the same type read again after ⌘V gives no callback")
    XCTAssertEqual(diagnostics(meta)["confirmed"] as? Bool, false)
    XCTAssertEqual(diagnostics(meta)["effectWait"] as? String, "noChannel")
    XCTAssertEqual(pasteboard.strings(), ["the owner's"])
  }

  /// type_text over a field whose lines have no channel for some of them: it goes on to the next line, and the note
  /// counts the unconfirmed lines.
  func testTypedTextGoesOnPastAnUnconfirmedLineAndCountsIt() throws {
    let pasteboard = TestPasteboard()
    pasteboard.userCopies("the owner's")
    var characters = 0
    var line = 1
    var log: [String] = []
    var entered = 0
    var meta = meta()
    let text = "ab\ncd\nef"
    // Line 2's field exposes nothing to read back; lines 1 and 3 show their change.
    let reading = { line == 2 ? EffectReading() : EffectReading(range: nil, characters: characters) }
    let outcome = try run(pasteParts(typing: text), pasteboard, effect: effect(reading: reading), postPaste: {
      log.append("paste " + (pasteboard.appReads() ?? "nil"))
      characters += 2
      return true
    }, postReturn: { line += 1; log.append("Return"); return true }, entered: &entered, meta: &meta)
    XCTAssertEqual(log, ["paste ab", "Return", "paste cd", "Return", "paste ef"])
    XCTAssertEqual(outcome, PasteOutcome(pastedLines: 3, unconfirmedLines: 1))
    XCTAssertEqual(entered, unitsOf(text))
    XCTAssertEqual(diagnostics(meta)["confirmed"] as? Bool, true, "the last line's own")
    XCTAssertEqual(diagnostics(meta)["unconfirmedLines"] as? Int, 1, "the operation's count")
    XCTAssertEqual(pasteUnconfirmedNote(outcome),
                   "3 lines pasted, 1 unconfirmed: the app read each after ⌘V, but this field can't be read back, so the change couldn't be seen. Observe the field if the next step depends on it.")
    XCTAssertNil(pasteUnconfirmedNote(PasteOutcome(pastedLines: 3, unconfirmedLines: 0)), "nothing to say when every line was seen")
    XCTAssertEqual(pasteboard.strings(), ["the owner's"])
  }

  /// A later line's error after an unconfirmed one says how many of the complete lines were unconfirmed.
  func testTheTypedCountClauseNamesUnconfirmedLines() {
    XCTAssertEqual(typedPasteError(pasteUnconfirmed, entered: 6, total: 9, line: 3, lines: 3, unconfirmedLines: 1).message,
                   pasteUnconfirmed.message + " Confirmed entered: 6 of 9 characters (2 of 3 lines complete, 1 of them unconfirmed); line 3 is in an unknown state.")
  }

  /// No read at all with no channel is still the read stage: the read is waited for, the effect never.
  func testWithNoChannelNoReadIsStillTheReadStage() {
    let pasteboard = TestPasteboard()
    var entered = 0
    var meta = meta()
    XCTAssertThrowsError(try run([.content(plain("x"), units: 1)], pasteboard, effect: effect(reading: { EffectReading() }), postPaste: { true },
                                 entered: &entered, meta: &meta)) { XCTAssertEqual(($0 as? EngineError)?.errorName, "clipboardReadTimedOut") }
    XCTAssertNil(diagnostics(meta)["effectWait"])
  }

  /// An untrusted observer (a Chromium or Electron process without #244's enablement) is no source: with an empty
  /// baseline the answer is at once (here a read after ⌘V: unconfirmed), and its notifications never confirm.
  func testAnUntrustedObserverIsNoSource() throws {
    let pasteboard = TestPasteboard()
    pasteboard.userCopies("the owner's")
    var entered = 0
    var meta = meta()
    clock = 0
    let untrusted = effect(source: .untrusted, reading: { EffectReading() })
    let outcome = try run([.content(plain("x"), units: 1)], pasteboard, effect: untrusted, postPaste: {
      _ = pasteboard.appReads()
      untrusted.notification()  // what Chromium may post for its own chrome: not counted
      return true
    }, entered: &entered, meta: &meta)
    XCTAssertEqual(outcome.unconfirmedLines, 1, "not confirmed by the untrusted notification")
    XCTAssertEqual(clock, 0)
    XCTAssertEqual(diagnostics(meta)["notificationSource"] as? String, "untrusted")
    XCTAssertEqual(diagnostics(meta)["effectWait"] as? String, "noChannel")
    XCTAssertEqual(diagnostics(meta)["confirmed"] as? Bool, false)
    XCTAssertEqual(pasteboard.strings(), ["the owner's"])

    let watch = effect(source: .untrusted, reading: { EffectReading(range: [1, 0], characters: 1) })
    watch.begin()
    watch.pasteStarted()
    watch.providerRead()
    watch.notification()
    clock = 0
    XCTAssertEqual(watch.wait(timeoutMs: 100, intervalMs: 25), .timeout, "an untrusted notification never confirms")
  }

  /// The trust rule: no observer is no source; any app's registered observer is trusted, except a Chromium or Electron
  /// process's without #244's enablement.
  func testTheNotificationSourceRule() {
    XCTAssertEqual(notificationSource(registered: false, chromiumFamily: false, enablementHolds: false), .none)
    XCTAssertEqual(notificationSource(registered: false, chromiumFamily: true, enablementHolds: true), .none)
    XCTAssertEqual(notificationSource(registered: true, chromiumFamily: false, enablementHolds: false), .trusted)
    XCTAssertEqual(notificationSource(registered: true, chromiumFamily: true, enablementHolds: false), .untrusted)
    XCTAssertEqual(notificationSource(registered: true, chromiumFamily: true, enablementHolds: true), .trusted)
  }

  /// A trusted observer with an empty baseline keeps the wait: a notification within it confirms, none answers
  /// `pasteUnconfirmed` at its end.
  func testATrustedObserverWithAnEmptyBaselineKeepsTheWait() throws {
    var notifyAt: Double? = 300
    var watch: PasteEffect?
    let made = PasteEffect(source: .trusted, read: { EffectReading() }, now: { [unowned self] in clock }, sleep: { [unowned self] in
      clock += $0
      if let at = notifyAt, clock >= at { watch?.notification() }
    })
    watch = made
    let pasteboard = TestPasteboard()
    var entered = 0
    var meta = meta()
    clock = 0
    try run([.content(plain("x"), units: 1)], pasteboard, effect: made, postPaste: { _ = pasteboard.appReads(); return true },
            entered: &entered, meta: &meta)
    XCTAssertEqual(clock, 300, accuracy: 25)
    XCTAssertEqual(diagnostics(meta)["effectWait"] as? String, "notification")
    XCTAssertEqual(entered, 1)

    notifyAt = nil
    clock = 0
    XCTAssertThrowsError(try run([.content(plain("y"), units: 1)], pasteboard, effect: made, postPaste: { _ = pasteboard.appReads(); return true },
                                 entered: &entered, meta: &meta)) { XCTAssertEqual(($0 as? EngineError)?.errorName, "pasteUnconfirmed") }
    XCTAssertEqual(clock, 2_000, accuracy: 25)
    XCTAssertEqual(diagnostics(meta)["effectWait"] as? String, "timeout")
    XCTAssertEqual(diagnostics(meta)["notificationSource"] as? String, "trusted")
  }

  /// A copy during the effect wait with no effect seen: the conflict still wins over `pasteUnconfirmed`, and the
  /// human's copy is kept.
  func testAMovedCountDuringAnUnconfirmedEffectIsTheConflict() {
    let pasteboard = TestPasteboard()
    pasteboard.userCopies("older")
    var reads = 0
    var entered = 0
    var meta = meta()
    let reading = {
      reads += 1
      if reads == 2 { pasteboard.userCopies("newer") }  // the effect wait's first poll
      return EffectReading(range: [0, 0], characters: 0)
    }
    XCTAssertThrowsError(try run([.content(plain("x"), units: 1)], pasteboard, effect: effect(reading: reading), postPaste: {
      _ = pasteboard.appReads()
      return true
    }, entered: &entered, meta: &meta)) { XCTAssertEqual(($0 as? EngineError)?.errorName, "clipboardConflict") }
    XCTAssertEqual(pasteboard.strings(), ["newer"])
    XCTAssertEqual(diagnostics(meta)["effectWait"] as? String, "timeout")
    XCTAssertEqual(diagnostics(meta)["restore"] as? String, "skippedChanged")
  }

  /// The request's deadline before the effect wait's 2 s: `pasteUnconfirmed` at the deadline, recorded as such.
  func testTheDeadlineEndsTheEffectWaitWithItsStagesError() {
    let pasteboard = TestPasteboard()
    pasteboard.userCopies("the owner's")
    var entered = 0
    var meta = meta()
    clock = 0
    XCTAssertThrowsError(try run([.content(plain("x"), units: 1)], pasteboard, effect: effect(), remainingMs: { [unowned self] in 300 - clock },
                                 postPaste: { _ = pasteboard.appReads(); return true }, entered: &entered, meta: &meta)) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "pasteUnconfirmed")
    }
    XCTAssertEqual(clock, 300, accuracy: 1, "the poll's last sleep is cut at the deadline")
    XCTAssertEqual(diagnostics(meta)["effectWait"] as? String, "deadline")
    XCTAssertEqual(pasteboard.strings(), ["the owner's"])
  }

  /// The request's deadline before the read wait's 2 s: `clipboardReadTimedOut` at the deadline (a real wait, short).
  func testTheDeadlineEndsTheReadWaitWithItsStagesError() {
    let pasteboard = TestPasteboard()
    pasteboard.userCopies("the owner's")
    var entered = 0
    var meta = meta()
    let started = Date()
    XCTAssertThrowsError(try run([.content(plain("x"), units: 1)], pasteboard, effect: effect(), readTimeoutMs: 2_000, remainingMs: { 30 },
                                 postPaste: { true }, entered: &entered, meta: &meta)) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "clipboardReadTimedOut")
    }
    XCTAssertLessThan(Date().timeIntervalSince(started), 1.0, "ended at the deadline, not at 2 s")
    XCTAssertEqual(diagnostics(meta)["readWait"] as? String, "deadline")
    XCTAssertEqual(pasteboard.strings(), ["the owner's"])
  }

  /// The diagnostics of a paste that landed: every field value-free, a read before ⌘V (a clipboard manager's) shown as a
  /// negative latency, the 3a predicate's inputs, the main thread's lag and the restore.
  func testTheDiagnosticsOfALandedPasteShowAReadBeforeCommandV() throws {
    let pasteboard = TestPasteboard()
    pasteboard.userCopies("the owner's")
    var characters = 0
    var entered = 0
    var meta = meta()
    clock = 0
    try run([.content(plain("pasted"), units: 6)], pasteboard, effect: effect { EffectReading(range: [characters, 0], characters: characters) },
            keyFocusAtPaste: { KeyFocusReading(frontmost: false, keyFocusProcess: true, focusedInWindow: true) },
            mainProbe: { [unowned self] work in clock += 3; work() },
            checkInFlight: { [unowned self] in
              _ = pasteboard.appReads()  // read before ⌘V
              clock += 5
            }, postPaste: { characters = 6; return true }, entered: &entered, meta: &meta)
    let wire = diagnostics(meta)
    XCTAssertEqual(Set(wire.keys), ["line", "lines", "notificationSource", "baselineEmpty", "keyFocusAtPaste", "readWait", "readWaitMs",
                                    "readAfterPostMs", "effectWait", "effectWaitMs", "mainLagMs", "restore", "stage", "confirmed", "perLine"])
    XCTAssertEqual(wire["readAfterPostMs"] as? Double, -5, "read 5 ms before ⌘V")
    XCTAssertEqual(wire["readWait"] as? String, "handedOver")
    XCTAssertEqual(wire["effectWait"] as? String, "reading")
    XCTAssertEqual(wire["mainLagMs"] as? Double, 3)
    XCTAssertEqual(wire["baselineEmpty"] as? Bool, false)
    XCTAssertEqual(wire["restore"] as? String, "restored")
    XCTAssertEqual(wire["keyFocusAtPaste"] as? [String: Bool], ["holds": true, "frontmost": false, "keyFocusProcess": true, "focusedInWindow": true])
    XCTAssertEqual(pasteboard.strings(), ["the owner's"])
    XCTAssertNotNil(meta.wire["paste"], "carried in the input meta")
  }

  /// A main thread that had not run the probe by the answer: the lag so far, marked open.
  func testAMainThreadLagStillOpenAtTheAnswerIsMarked() {
    let pasteboard = TestPasteboard()
    var entered = 0
    var meta = meta()
    clock = 0
    XCTAssertThrowsError(try run([.content(plain("x"), units: 1)], pasteboard, effect: effect(), mainProbe: { _ in },
                                 postPaste: { true }, entered: &entered, meta: &meta))
    XCTAssertEqual(diagnostics(meta)["mainLagOpen"] as? Bool, true)
    XCTAssertNotNil(diagnostics(meta)["mainLagMs"])
  }

  /// The 3a predicate: frontmost or key-focus process, and the focused element in the prepared window; recorded only.
  func testTheKeyFocusPredicate() {
    XCTAssertTrue(KeyFocusReading(frontmost: true, keyFocusProcess: false, focusedInWindow: true).holds)
    XCTAssertTrue(KeyFocusReading(frontmost: false, keyFocusProcess: true, focusedInWindow: true).holds)
    XCTAssertFalse(KeyFocusReading(frontmost: false, keyFocusProcess: false, focusedInWindow: true).holds, "hold 3's suspected Chrome state")
    XCTAssertFalse(KeyFocusReading(frontmost: true, keyFocusProcess: true, focusedInWindow: false).holds)
    XCTAssertFalse(KeyFocusReading(frontmost: true, keyFocusProcess: true, focusedInWindow: nil).holds)
    XCTAssertTrue(KeyFocusReading(frontmost: true, keyFocusProcess: false, focusedInWindow: nil).wire["focusedInWindow"] is NSNull)
  }

  /// The predicate's live inputs come from route 3's system (stubs here): no event, no activation.
  func testTheKeyFocusReadingTakesRouteThreesSystem() {
    var system = ActivationSystem()
    system.frontmost = { 990_002 }
    system.keyFocus = { 990_003 }  // the keys' target, a sheet's process
    let application = AXUIElementCreateApplication(990_001)
    let reading = keyFocusReading(pid: 990_001, keyboard: 990_003, application: application, window: nil, system: system)
    XCTAssertEqual(reading, KeyFocusReading(frontmost: false, keyFocusProcess: true, focusedInWindow: nil))
    XCTAssertFalse(reading.holds)
  }

  /// A restore skipped because the human copied just before it is recorded as such; a paste that never took the
  /// pasteboard records that nothing needed restoring.
  func testTheRestoreOutcomeIsRecorded() throws {
    let pasteboard = TestPasteboard()
    pasteboard.userCopies("the owner's")
    let racing = CopyBeforeRestore(pasteboard) { pasteboard.userCopies("human copy") }
    var characters = 0
    var entered = 0
    var meta = meta()
    var later = meta
    try runPaste([.content(plain("pasted"), units: 6)], pasteboard: racing,
                 effect: effect { EffectReading(range: [characters, 0], characters: characters) }, readTimeoutMs: 0,
                 checkInFlight: {}, postPaste: { _ = pasteboard.appReads(); characters = 6; return true }, postReturn: { true },
                 entered: &entered, meta: &meta)
    XCTAssertEqual(diagnostics(meta)["restore"] as? String, "skippedChanged")
    XCTAssertEqual(pasteboard.strings(), ["human copy"])

    var copied = false
    XCTAssertThrowsError(try run([.content(plain("x"), units: 1)], pasteboard, effect: effect(reading: {
      if !copied { copied = true; pasteboard.userCopies("newer") }  // the baseline, after the snapshot
      return EffectReading()
    }), postPaste: { true }, entered: &entered, meta: &later)) { XCTAssertEqual(($0 as? EngineError)?.errorName, "clipboardConflict") }
    XCTAssertEqual(diagnostics(later)["restore"] as? String, "notTaken")
    XCTAssertEqual(pasteboard.strings(), ["newer"])
  }

  /// type_text's sentence names what was confirmed: the units entered, the lines complete, the failed line unknown.
  func testTypedTextUnconfirmedSaysWhatWasConfirmed() {
    let pasteboard = TestPasteboard()
    pasteboard.userCopies("the owner's")
    var characters = 0
    var pastes = 0
    var entered = 0
    var meta = meta()
    let text = "ab\ncd\nef"
    XCTAssertThrowsError(try run(pasteParts(typing: text), pasteboard, effect: effect { EffectReading(range: nil, characters: characters) },
                                 postPaste: {
      _ = pasteboard.appReads()
      pastes += 1
      if pastes == 1 { characters += 2 }  // line 1 lands visibly; line 2's effect is never seen
      return true
    }, postReturn: { characters += 1; return true }, entered: &entered, meta: &meta)) { error in
      let typed = typedPasteError(error as! EngineError, entered: entered, total: unitsOf(text), line: meta.paste?.line, lines: meta.paste?.lines)
      XCTAssertEqual(typed.errorName, "pasteUnconfirmed")
      XCTAssertEqual(typed.message, pasteUnconfirmed.message + " Confirmed entered: 3 of 8 characters (1 of 3 lines complete); line 2 is in an unknown state.")
    }
    XCTAssertEqual(entered, 3, "line 1 and its Return")
    XCTAssertEqual(pasteboard.strings(), ["the owner's"])
  }

  /// The count clause on a one-line text, on the read stage too, and never on another error.
  func testTheTypedCountClause() {
    XCTAssertEqual(typedPasteError(clipboardReadTimedOut, entered: 0, total: 5, line: 1, lines: 1).message,
                   clipboardReadTimedOut.message + " Confirmed entered: 0 of 5 characters; the line being pasted is in an unknown state.")
    XCTAssertEqual(typedPasteError(clipboardConflict, entered: 0, total: 5, line: 1, lines: 1).message, clipboardConflict.message)
    var withMetaError = clipboardReadTimedOut
    withMetaError.extra["meta"] = ["entered": 0]
    XCTAssertNotNil(typedPasteError(withMetaError, entered: 0, total: 5, line: nil, lines: nil).extra["meta"], "the meta kept")
  }

  /// A reading that itself uses up the wait's time (a slow target's AX reply near the deadline) is not accepted: the
  /// wait answers its timeout, not a confirmation that would move multi-line typing on (#187 review, P2). Each read is
  /// given the time left, which the engine's reading turns into its messaging timeouts.
  func testAReadThatUsesUpTheRemainingTimeIsNotAccepted() {
    var budgets: [Double] = []
    var characters = 0
    let watch = PasteEffect(readWithin: { [unowned self] left in
      budgets.append(left)
      if budgets.count > 1 {  // the reads after the baseline: the target answers 500 ms later, changed
        clock += 500
        characters += 1
      }
      return EffectReading(range: nil, characters: characters)
    }, now: { [unowned self] in clock }, sleep: { [unowned self] in clock += $0 })
    clock = 0
    watch.begin()
    watch.pasteStarted()
    watch.providerRead()
    XCTAssertEqual(watch.wait(timeoutMs: 50, intervalMs: 25), .timeout)
    XCTAssertEqual(budgets.first, .infinity, "the baseline, before the write, is not bounded by the wait")
    XCTAssertEqual(budgets.dropFirst().first, 50, "the first poll's read is given the whole budget")

    // Through runPaste with the request's deadline: the stage's error, never a success.
    let pasteboard = TestPasteboard()
    pasteboard.userCopies("the owner's")
    var reads = 0
    let slow = PasteEffect(readWithin: { [unowned self] _ in
      reads += 1
      if reads > 1 { clock += 500 }
      return EffectReading(range: nil, characters: reads > 1 ? 1 : 0)
    }, now: { [unowned self] in clock }, sleep: { [unowned self] in clock += $0 })
    var entered = 0
    var meta = meta()
    clock = 0
    XCTAssertThrowsError(try run(pasteParts(typing: "a\nb"), pasteboard, effect: slow, remainingMs: { [unowned self] in 50 - clock },
                                 postPaste: { _ = pasteboard.appReads(); return true }, entered: &entered, meta: &meta)) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "pasteUnconfirmed")
    }
    XCTAssertEqual(entered, 0, "line b was never reached")
    XCTAssertEqual(diagnostics(meta)["effectWait"] as? String, "deadline")
    XCTAssertEqual(pasteboard.strings(), ["the owner's"])
  }

  /// The AX messaging timeout an effect read gets from the time left: at most the usual 1 s, at least 50 ms, none once
  /// the time is spent (no read is sent).
  func testTheBoundedMessagingTimeout() {
    XCTAssertEqual(boundedMessagingTimeout(leftMs: .infinity), elementMessagingTimeout)
    XCTAssertEqual(boundedMessagingTimeout(leftMs: 5_000), elementMessagingTimeout)
    XCTAssertEqual(boundedMessagingTimeout(leftMs: 300) ?? 0, 0.3, accuracy: 0.0001)
    XCTAssertEqual(boundedMessagingTimeout(leftMs: 10) ?? 0, 0.05, accuracy: 0.0001)
    XCTAssertNil(boundedMessagingTimeout(leftMs: 0))
    XCTAssertNil(effectReading(of: AXUIElementCreateApplication(990_001), withinMs: 0), "nothing read once the time is spent")
  }

  /// The observer's notification counts only once the app has read and ⌘V was posted.
  func testANotificationCountsOnlyAfterTheReadAndThePaste() throws {
    let watch = effect(observer: true, reading: { EffectReading(range: [1, 0], characters: 1) })
    watch.begin()
    watch.notification()  // before the read and before ⌘V: not the paste's
    watch.pasteStarted()
    watch.notification()  // before the read
    clock = 0
    XCTAssertEqual(watch.wait(timeoutMs: 100, intervalMs: 25), .timeout)
    watch.providerRead()
    watch.notification()
    XCTAssertEqual(watch.wait(timeoutMs: 100, intervalMs: 25), .notification)
  }

  /// A user event attributed to the app after the write and before ⌘V stops the paste: nothing posted, contents restored.
  func testAnInterventionBeforeCommandVStopsAndRestores() {
    let pasteboard = TestPasteboard()
    pasteboard.userCopies("the owner's")
    var posted = false
    var entered = 0
    var meta = meta()
    XCTAssertThrowsError(try run([.content(plain("x"), units: 1)], pasteboard, effect: effect(), checkInFlight: {
      throw userChanged("TextEdit")
    }, postPaste: { posted = true; return true }, entered: &entered, meta: &meta)) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "userIntervened")
    }
    XCTAssertFalse(posted)
    XCTAssertNil(meta.startedAt, "nothing posted: the interval stays null")
    XCTAssertEqual(pasteboard.strings(), ["the owner's"])
  }

  /// A ⌘V that could not be posted leaves the interval null and fails as the write does not.
  func testACommandVThatCannotBeMadeIsRefusedWithNothingPosted() {
    let pasteboard = TestPasteboard()
    pasteboard.userCopies("the owner's")
    var entered = 0
    var meta = meta()
    XCTAssertThrowsError(try run([.content(plain("x"), units: 1)], pasteboard, effect: effect(), postPaste: { false },
                                 entered: &entered, meta: &meta)) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "eventCreationFailed")
    }
    XCTAssertNil(meta.startedAt)
    XCTAssertEqual(pasteboard.strings(), ["the owner's"])
  }

  /// type_text's paste route: each line pasted in turn, each newline a Return press, one snapshot and one restore around
  /// the whole; `entered` counts what landed.
  func testTypedTextPastesItsLinesAndPressesReturnBetween() throws {
    let pasteboard = TestPasteboard()
    pasteboard.userCopies("the owner's")
    var log: [String] = []
    var characters = 0
    var entered = 0
    var meta = meta()
    let parts = pasteParts(typing: "줄1\n줄2")
    try run(parts, pasteboard, effect: effect { EffectReading(range: nil, characters: characters) }, postPaste: {
      log.append("paste " + (pasteboard.appReads() ?? "nil"))
      characters += 1
      return true
    }, postReturn: { log.append("Return"); characters += 1; return true }, entered: &entered, meta: &meta)
    XCTAssertEqual(log, ["paste 줄1", "Return", "paste 줄2"])
    XCTAssertEqual(entered, unitsOf("줄1\n줄2"))
    XCTAssertEqual(pasteboard.strings(), ["the owner's"])
  }

  func testPastePartsSplitAtNewlinesAndSkipEmptyLines() {
    XCTAssertEqual(pasteParts(typing: "a\nb"), [.content(plain("a"), units: 1), .returnKey(units: 1), .content(plain("b"), units: 1)])
    XCTAssertEqual(pasteParts(typing: "\r\nx\n\n"), [.returnKey(units: 2), .content(plain("x"), units: 1), .returnKey(units: 1), .returnKey(units: 1)])
    XCTAssertEqual(pasteParts(typing: "한글 😀"), [.content(plain("한글 😀"), units: unitsOf("한글 😀"))])
    XCTAssertEqual(pasteParts(typing: ""), [])
  }

  /// A stop midway counts only what landed: the first line and its Return.
  func testAStopMidwayCountsWhatLanded() {
    let pasteboard = TestPasteboard()
    var checks = 0
    var entered = 0
    var meta = meta()
    var characters = 0
    XCTAssertThrowsError(try run(pasteParts(typing: "ab\ncd"), pasteboard, effect: effect { EffectReading(range: nil, characters: characters) },
                                 checkInFlight: {
      checks += 1
      if checks == 3 { throw userChanged("TextEdit") }
    }, postPaste: { _ = pasteboard.appReads(); characters += 2; return true }, postReturn: { characters += 1; return true },
       entered: &entered, meta: &meta))
    XCTAssertEqual(entered, 3)
  }

  // MARK: The Return between lines (#187, the slot of 2026-11-01)

  /// A field whose Return lands `lateMs` after its post (its newline and caret move), and whose pastes land only while
  /// `lands` says so: the reading on the fake clock, for the tests of the Return between lines.
  private final class LateReturnField {
    var characters = 0
    var returnAt: [Double] = []
    var lateMs: Double = 10
    var returnLands = true
    func reading(_ clock: Double) -> EffectReading {
      let returns = returnLands ? returnAt.filter { clock >= $0 + lateMs }.count : 0
      return EffectReading(range: [characters + returns, 0], characters: characters + returns)
    }
  }

  /// The live false success of 2026-11-01 (B#3.5, `줄1⏎줄2` into Chrome): line 2's ⌘V never landed, but its baseline was
  /// taken right after the Return was posted, before the Return's own effect showed, so the Return's late newline
  /// "confirmed" line 2 a poll later. The Return's effect is settled first: line 2's baseline holds it, and only line 2's
  /// own paste could confirm line 2, which here never lands.
  func testAReturnThatLandsLateNeverConfirmsTheNextLine() {
    let pasteboard = TestPasteboard()
    pasteboard.userCopies("the owner's")
    let field = LateReturnField()
    var pastes = 0
    var entered = 0
    var meta = meta()
    clock = 0
    XCTAssertThrowsError(try run(pasteParts(typing: "a\nb"), pasteboard, effect: effect { [unowned self] in field.reading(clock) }, postPaste: {
      _ = pasteboard.appReads()
      pastes += 1
      if pastes == 1 { field.characters += 1 }  // line 1 lands; line 2 is read and never inserted
      return true
    }, postReturn: { [unowned self] in field.returnAt.append(clock); return true }, entered: &entered, meta: &meta)) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "pasteUnconfirmed")
    }
    XCTAssertEqual(entered, 2, "line 1 and its Return, never line 2")
    XCTAssertEqual(diagnostics(meta)["line"] as? Int, 2)
    XCTAssertEqual(diagnostics(meta)["stage"] as? String, "effect")
    XCTAssertEqual(diagnostics(meta)["confirmed"] as? Bool, false)
    XCTAssertEqual(pasteboard.strings(), ["the owner's"])
    let records = try? XCTUnwrap(diagnostics(meta)["perLine"] as? [[String: Any]])
    XCTAssertEqual(records?.last?["baseline"] as? [String: AnyHashable], ["range": [2, 0], "characters": 2], "line 2's baseline holds the Return")
  }

  /// A Return whose effect never shows within the bound: the line it opens is unconfirmed at the Return's own stage, never
  /// a success; that line is never pasted, the Return is not counted, and the sentence says so with what was confirmed.
  func testAReturnWhoseEffectNeverShowsLeavesItsLineUnconfirmedAtItsStage() throws {
    let pasteboard = TestPasteboard()
    pasteboard.userCopies("the owner's")
    let field = LateReturnField()
    field.returnLands = false
    var log: [String] = []
    var entered = 0
    let bareMeta = meta()
    var meta = bareMeta
    clock = 0
    XCTAssertThrowsError(try run(pasteParts(typing: "ab\ncd"), pasteboard, effect: effect { [unowned self] in field.reading(clock) }, postPaste: {
      log.append("paste " + (pasteboard.appReads() ?? "nil"))
      field.characters += 2
      return true
    }, postReturn: { [unowned self] in log.append("Return"); field.returnAt.append(clock); return true }, entered: &entered, meta: &meta)) { error in
      let typed = typedPasteError(error as! EngineError, entered: entered, total: 5, line: meta.paste?.line, lines: meta.paste?.lines)
      XCTAssertEqual(typed.errorName, "pasteUnconfirmed")
      XCTAssertEqual(typed.message, returnUnconfirmed.message + " Confirmed entered: 2 of 5 characters (1 of 2 lines complete); line 2 is in an unknown state.")
    }
    XCTAssertEqual(log, ["paste ab", "Return"], "line 2 never pasted")
    XCTAssertEqual(entered, 2, "line 1 only: the Return was never seen")
    XCTAssertEqual(clock, 2_000, accuracy: 30, "the effect wait's bound")
    let wire = diagnostics(meta)
    XCTAssertEqual(wire["line"] as? Int, 2)
    XCTAssertEqual(wire["stage"] as? String, "returnEffect")
    XCTAssertEqual(wire["confirmed"] as? Bool, false)
    XCTAssertEqual(wire["restore"] as? String, "restored")
    let records = try XCTUnwrap(wire["perLine"] as? [[String: Any]])
    XCTAssertEqual(records.count, 2)
    XCTAssertEqual(records[1]["stage"] as? String, "returnEffect")
    let opening = try XCTUnwrap(records[1]["openingReturn"] as? [String: Any])
    XCTAssertEqual(opening["settle"] as? String, "timeout")
    XCTAssertEqual(opening["settleMs"] as? Double ?? 0, 2_000, accuracy: 30)
    XCTAssertNil(opening["toCommandVMs"], "no ⌘V followed")
    XCTAssertEqual(pasteboard.strings(), ["the owner's"])

    // The request's deadline ends the settle first: its stage's error, recorded as "deadline".
    let short = LateReturnField()
    short.returnLands = false
    var shortEntered = 0
    var shortMeta = bareMeta
    clock = 0
    XCTAssertThrowsError(try run(pasteParts(typing: "a\nb"), pasteboard, effect: effect { [unowned self] in short.reading(clock) },
                                 remainingMs: { [unowned self] in 300 - clock },
                                 postPaste: { _ = pasteboard.appReads(); short.characters += 1; return true },
                                 entered: &shortEntered, meta: &shortMeta)) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "pasteUnconfirmed")
    }
    let shortOpening = (diagnostics(shortMeta)["perLine"] as? [[String: Any]])?.last?["openingReturn"] as? [String: Any]
    XCTAssertEqual(shortOpening?["settle"] as? String, "deadline")
    XCTAssertEqual(clock, 300, accuracy: 30)
  }

  /// A Return whose effect never shows while the user copies during its settle: the Return's own error, not the
  /// conflict (no one's contents were pasted at that stage), and the human's copy is kept.
  func testAMovedCountDuringAReturnsSettleKeepsItsOwnError() {
    let pasteboard = TestPasteboard()
    pasteboard.userCopies("the owner's")
    var entered = 0
    var meta = meta()
    var characters = 0
    clock = 0
    XCTAssertThrowsError(try run(pasteParts(typing: "a\nb"), pasteboard, effect: effect { EffectReading(range: nil, characters: characters) },
                                 postPaste: { _ = pasteboard.appReads(); characters += 1; return true },
                                 postReturn: { pasteboard.userCopies("human copy"); return true }, entered: &entered, meta: &meta)) {
      XCTAssertEqual(($0 as? EngineError)?.message, returnUnconfirmed.message)
    }
    XCTAssertEqual(pasteboard.strings(), ["human copy"])
  }

  /// The per-line records: one per line reached, oldest first, value-free (counts and offsets, never text), each with
  /// its stage, whether it was confirmed and by which channel, its waits and times against its own ⌘V, and the Return
  /// that opened it with its post-to-settle and post-to-⌘V times; an empty line between two Returns has its Return's
  /// record only, and the top-level fields stay the last line's.
  func testThePerLineRecords() throws {
    let pasteboard = TestPasteboard()
    pasteboard.userCopies("the owner's")
    let field = LateReturnField()
    var entered = 0
    var meta = meta()
    clock = 0
    try run(pasteParts(typing: "ab\n\ncd"), pasteboard, effect: effect { [unowned self] in field.reading(clock) }, postPaste: { [unowned self] in
      _ = pasteboard.appReads()
      clock += 1
      field.characters += 2
      return true
    }, postReturn: { [unowned self] in field.returnAt.append(clock); return true }, entered: &entered, meta: &meta)
    XCTAssertEqual(entered, 6)
    let wire = diagnostics(meta)
    XCTAssertEqual(wire["line"] as? Int, 3, "the top level is the last line's")
    XCTAssertEqual(wire["lines"] as? Int, 3)
    XCTAssertEqual(wire["effectWait"] as? String, "reading")
    let records = try XCTUnwrap(wire["perLine"] as? [[String: Any]])
    XCTAssertEqual(records.map { $0["line"] as? Int }, [1, 2, 3])

    let first = records[0]
    XCTAssertEqual(first["stage"] as? String, "effect")
    XCTAssertEqual(first["confirmed"] as? Bool, true)
    XCTAssertEqual(first["effectWait"] as? String, "reading")
    XCTAssertEqual(first["readWait"] as? String, "handedOver")
    XCTAssertEqual(first["effectAfterPostMs"] as? Double, 1, "seen at the first poll, 1 ms after ⌘V")
    XCTAssertEqual(first["baseline"] as? [String: AnyHashable], ["range": [0, 0], "characters": 0])
    XCTAssertEqual(first["confirming"] as? [String: AnyHashable], ["range": [2, 0], "characters": 2])
    XCTAssertNil(first["openingReturn"])

    let empty = records[1]
    XCTAssertEqual(empty["stage"] as? String, "returnEffect")
    XCTAssertNil(empty["confirmed"], "nothing pasted on it")
    XCTAssertEqual(empty["baseline"] as? [String: AnyHashable], ["range": [2, 0], "characters": 2], "taken before its Return")
    XCTAssertEqual(empty["openingReturn"] as? [String: AnyHashable], ["settle": "reading", "settleMs": 50.0],
                   "moved at the poll after its 10 ms and held one interval more")

    let last = records[2]
    XCTAssertEqual(last["baseline"] as? [String: AnyHashable], ["range": [4, 0], "characters": 4], "both Returns in it")
    XCTAssertEqual(last["confirming"] as? [String: AnyHashable], ["range": [6, 0], "characters": 6])
    let opening = try XCTUnwrap(last["openingReturn"] as? [String: Any])
    XCTAssertEqual(opening["settle"] as? String, "reading")
    XCTAssertEqual(opening["toCommandVMs"] as? Double, 50, "its ⌘V right after the settle")
    for record in records {
      let keys = Set(record.keys)
      XCTAssertTrue(keys.isSubset(of: ["line", "stage", "confirmed", "keyFocusAtPaste", "readWait", "readWaitMs", "readAfterPostMs",
                                       "firstReadAfterPostMs", "effectWait", "effectWaitMs", "effectAfterPostMs", "baseline", "confirming",
                                       "openingReturn"]), "\(keys)")
    }
    XCTAssertEqual(pasteboard.strings(), ["the owner's"])
  }

  /// A Return after the last line is not settled (no later baseline depends on it; a search field's submitting Return
  /// may change nothing), as before: counted, with no record of its own.
  func testATrailingReturnIsNotSettled() throws {
    let pasteboard = TestPasteboard()
    pasteboard.userCopies("the owner's")
    var characters = 0
    var entered = 0
    var meta = meta()
    clock = 0
    try run(pasteParts(typing: "ab\n"), pasteboard, effect: effect { EffectReading(range: nil, characters: characters) },
            postPaste: { _ = pasteboard.appReads(); characters += 2; return true }, entered: &entered, meta: &meta)
    XCTAssertEqual(entered, 3)
    XCTAssertEqual(clock, 0, "no settle waited")
    XCTAssertEqual(diagnostics(meta)["line"] as? Int, 1)
    XCTAssertEqual((diagnostics(meta)["perLine"] as? [[String: Any]])?.count, 1)
  }

  /// With nothing to see a Return by (the baseline empty, no trusted source), the settle answers at once and the next
  /// line is answered by its read after ⌘V, as a line with no channel is.
  func testWithNoChannelAReturnIsNotWaitedFor() throws {
    let pasteboard = TestPasteboard()
    pasteboard.userCopies("the owner's")
    var entered = 0
    var meta = meta()
    clock = 0
    let outcome = try run(pasteParts(typing: "a\nb"), pasteboard, effect: effect(reading: { EffectReading() }), postPaste: { [unowned self] in
      clock += 1
      _ = pasteboard.appReads()
      return true
    }, entered: &entered, meta: &meta)
    XCTAssertEqual(outcome, PasteOutcome(pastedLines: 2, unconfirmedLines: 2))
    XCTAssertEqual(entered, 3)
    XCTAssertEqual(clock, 2, "no wait beyond the two reads")
    let opening = (diagnostics(meta)["perLine"] as? [[String: Any]])?.last?["openingReturn"] as? [String: Any]
    XCTAssertEqual(opening?["settle"] as? String, "noChannel")
  }

  /// A text that begins with a newline into a field seen only by its notifications: the Return's sole notification,
  /// arriving while the Return's delivery guard runs, counts for its settle (the review of 0d888300..c32bec9c, finding
  /// 2): the gate is armed before the Return is posted, as it is for a ⌘V.
  func testAReturnsNotificationDuringItsDeliveryGuardCountsForItsSettle() throws {
    let pasteboard = TestPasteboard()
    pasteboard.userCopies("the owner's")
    let watch = effect(observer: true, reading: { EffectReading() })
    var log: [String] = []
    var entered = 0
    var meta = meta()
    clock = 0
    try runPaste(pasteParts(typing: "\nab"), pasteboard: pasteboard.access, effect: watch, readTimeoutMs: 0, mainProbe: { $0() },
                 deliver: { post in
                   post()
                   watch.notification()  // the field's only report of the event, inside the guard's samples
                   return nil
                 }, checkInFlight: {}, postPaste: {
                   log.append("paste " + (pasteboard.appReads() ?? "nil"))
                   return true
                 }, postReturn: { log.append("Return"); return true }, entered: &entered, meta: &meta)
    XCTAssertEqual(log, ["Return", "paste ab"])
    XCTAssertEqual(entered, 3, "the newline and the line")
    let opening = (diagnostics(meta)["perLine"] as? [[String: Any]])?.last?["openingReturn"] as? [String: Any]
    XCTAssertEqual(opening?["settle"] as? String, "notification")
    XCTAssertEqual(pasteboard.strings(), ["the owner's"])
  }

  /// A Return whose effect half-lands across the settle's bound (the review of 0d888300..c32bec9c, finding 3: the range
  /// moved at 1975 ms, the count at 2025 ms) is unconfirmed at its stage: the settle never saw the reading hold, so it
  /// is no success, and the next line, never pasted, cannot be "confirmed" by the Return's late count.
  func testAReturnThatMovesOnlyAtTheBoundIsUnconfirmed() throws {
    let pasteboard = TestPasteboard()
    pasteboard.userCopies("the owner's")
    var characters = 0
    var returnAt: Double?
    var log: [String] = []
    var entered = 0
    var meta = meta()
    clock = 0
    let reading = { [unowned self] () -> EffectReading in
      let since = returnAt.map { clock - $0 } ?? -1
      return EffectReading(range: [characters + (since >= 1_975 ? 1 : 0), 0], characters: characters + (since >= 2_025 ? 1 : 0))
    }
    XCTAssertThrowsError(try run(pasteParts(typing: "a\nb"), pasteboard, effect: effect(reading: reading), postPaste: {
      log.append("paste " + (pasteboard.appReads() ?? "nil"))
      if log.count == 1 { characters += 1 }  // line 1 lands; a line 2 would be read and never inserted
      return true
    }, postReturn: { [unowned self] in log.append("Return"); returnAt = clock; return true }, entered: &entered, meta: &meta)) {
      XCTAssertEqual(($0 as? EngineError)?.message, returnUnconfirmed.message)
    }
    XCTAssertEqual(log, ["paste a", "Return"], "line 2 never pasted")
    XCTAssertEqual(entered, 1, "line 1 only")
    let wire = diagnostics(meta)
    XCTAssertEqual(wire["stage"] as? String, "returnEffect")
    XCTAssertEqual(wire["confirmed"] as? Bool, false)
    let opening = (wire["perLine"] as? [[String: Any]])?.last?["openingReturn"] as? [String: Any]
    XCTAssertEqual(opening?["settle"] as? String, "timeout")
    XCTAssertEqual(pasteboard.strings(), ["the owner's"])
  }

  /// The settle on its own: a reading must move and then hold one interval; a trusted notification after the Return's
  /// post counts only with no baseline; a reading that came back after the time ran out is not accepted.
  func testTheReturnsSettle() {
    var characters = 0
    var reads = 0
    let watch = effect { reads += 1; return EffectReading(range: nil, characters: characters) }
    clock = 0
    watch.begin()
    watch.keyPosted(at: 0)
    XCTAssertEqual(watch.settle(timeoutMs: 100, intervalMs: 25), .timeout)
    characters = 1
    watch.begin()
    characters = 2
    clock = 0
    XCTAssertEqual(watch.settle(timeoutMs: 100, intervalMs: 25), .reading)
    XCTAssertEqual(clock, 25, "moved at once, held at the next poll")

    let trusted = effect(observer: true, reading: { EffectReading() })
    trusted.begin()
    trusted.notification()  // before the Return: not its effect
    clock = 0
    trusted.keyPosted(at: 0)
    XCTAssertEqual(trusted.settle(timeoutMs: 50, intervalMs: 25), .timeout)
    trusted.notification()
    XCTAssertEqual(trusted.settle(timeoutMs: 50, intervalMs: 25), .notification)

    var slowReads = 0
    let slow = PasteEffect(readWithin: { [unowned self] _ in  // the baseline, then a moved reading 500 ms late
      slowReads += 1
      clock += 500
      return EffectReading(range: nil, characters: slowReads > 1 ? 1 : 0)
    }, now: { [unowned self] in clock }, sleep: { [unowned self] in clock += $0 })
    slow.begin()
    clock = 0
    slow.keyPosted(at: 0)
    XCTAssertEqual(slow.settle(timeoutMs: 100, intervalMs: 25), .timeout)
  }
}


// MARK: The paste's activation

final class PasteActivationTests: XCTestCase {
  private let target: pid_t = 990_001, user: pid_t = 990_002

  /// The paste's route-3 activation fails its guard: refused before the pasteboard is touched, and the guard's duration
  /// kept in the meta for the diagnosis, as a click's is (whole-milestone review, P3), on paste and on type_text's paste
  /// route alike.
  func testAFailedGuardKeepsItsDurationOnBothPastePaths() throws {
    for typed in [false, true] {
      let seam = GuardSeam(frontmost: user, frontmostAfterPost: target)
      let pasteboard = TestPasteboard()
      pasteboard.userCopies("the owner's")
      let engine = Engine(paths: ServerPaths(socket: "/tmp/x.sock", directory: "/tmp", lock: "/tmp/x.lock", usage: "/tmp/cua-engine-test-usage.json"),
                          intervention: InterventionMonitor(listenGranted: { false }), screenLocked: { false },
                          pasteboard: { pasteboard.access }, pasteActivation: seam.system)
      let context = ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0,
                                     deadline: unixMilliseconds() + 60_000, lineage: nil)
      let app = ResolvedApp(appPath: "/Applications/TextEdit.app", bundleIdentifier: nil, displayName: "TextEdit", running: nil)
      let pasteTarget = PasteTarget(app: app, pid: target, application: AXUIElementCreateApplication(target), keyboard: target,
                                    guarding: .off(app: "TextEdit"))
      var meta = InputMeta(context)
      var entered = 0
      XCTAssertThrowsError(try typed
        ? String(describing: engine.typeTextByPaste("x\ny", pasteTarget, context, meta: &meta))
        : String(describing: engine.pasteOperation([.content(plain("x"), units: 1)], pasteTarget, context, entered: &entered, meta: &meta))) {
        XCTAssertEqual(($0 as? EngineError)?.errorName, "activationFailed", typed ? "type_text" : "paste")
      }
      XCTAssertEqual(meta.inputRoute, .paste)
      XCTAssertNotNil(meta.activationGuardMs, "the failed guard's duration is kept for the diagnosis (\(typed ? "type_text" : "paste"))")
      XCTAssertNil(meta.startedAt, "nothing was posted")
      XCTAssertEqual(pasteboard.strings(), ["the owner's"], "the pasteboard was never touched")
    }
  }
}

extension PasteActivationTests {
  /// The paste rechecks the intervention guard once the registry's lock is held: a user event after the paste lock's
  /// check, while the paste waited for the activation, stops it before the activation and the pasteboard (the second
  /// review, finding 5).
  func testAUserEventWhileThePasteWaitsForTheActivationStopsIt() {
    let seam = GuardSeam(frontmost: 990_002)
    let pasteboard = TestPasteboard()
    pasteboard.userCopies("the owner's")
    let engine = Engine(paths: ServerPaths(socket: "/tmp/x.sock", directory: "/tmp", lock: "/tmp/x.lock", usage: "/tmp/cua-engine-test-usage.json"),
                        intervention: InterventionMonitor(listenGranted: { false }), screenLocked: { false },
                        pasteboard: { pasteboard.access }, pasteActivation: seam.system)
    let context = ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0,
                                   deadline: unixMilliseconds() + 60_000, lineage: nil)
    let app = ResolvedApp(appPath: "/Applications/TextEdit.app", bundleIdentifier: nil, displayName: "TextEdit", running: nil)
    var reads = 0
    var lockedAtSecondCheck = false
    // The first check (after the paste lock) sees nothing; the user's event lands before the second (under the registry).
    let guarding = InterventionGuard(detection: true, verdict: .proceed, app: "TextEdit", start: 0, latest: {
      reads += 1
      if reads == 2 { lockedAtSecondCheck = engine.heldActivations.isLocked }
      return reads >= 2 ? AttributedEvent(sequence: 1, at: 2) : nil
    }, lastAtCheck: nil)
    let target: pid_t = 990_001
    let pasteTarget = PasteTarget(app: app, pid: target, application: AXUIElementCreateApplication(target), keyboard: target, guarding: guarding)
    var meta = InputMeta(context)
    var entered = 0
    XCTAssertThrowsError(try engine.pasteOperation([.content(plain("x"), units: 1)], pasteTarget, context, entered: &entered, meta: &meta)) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "userIntervened")
    }
    XCTAssertTrue(lockedAtSecondCheck, "the recheck runs under the registry's lock")
    XCTAssertTrue(seam.posts.isEmpty, "no activation")
    XCTAssertEqual(pasteboard.strings(), ["the owner's"], "the pasteboard was never touched")
  }
}

extension PasteActivationTests {
  /// The engine's trust decision for a paste's observer (#187): a Chromium app's is untrusted until the engine's
  /// enablement holds for the process, then trusted; another app's is trusted; no observer is no source.
  func testAChromiumAppsObserverIsTrustedOnlyOnceItsEnablementHolds() throws {
    let bundle = FileManager.default.temporaryDirectory.appendingPathComponent("cua-187-\(UUID().uuidString)/Fake Chrome.app")
    try FileManager.default.createDirectory(at: bundle.appendingPathComponent("Contents"), withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: bundle.deletingLastPathComponent()) }
    try (["NSPrincipalClass": "BrowserCrApplication"] as NSDictionary).write(to: bundle.appendingPathComponent("Contents/Info.plist"))
    let engine = Engine(paths: ServerPaths(socket: "/tmp/x.sock", directory: "/tmp", lock: "/tmp/x.lock", usage: "/tmp/cua-engine-test-usage.json"),
                        intervention: InterventionMonitor(listenGranted: { false }), screenLocked: { false })
    let chrome = ResolvedApp(appPath: bundle.path, bundleIdentifier: nil, displayName: "Fake Chrome", running: nil)
    let textEdit = ResolvedApp(appPath: "/System/Applications/TextEdit.app", bundleIdentifier: nil, displayName: "TextEdit", running: nil)
    XCTAssertEqual(engine.pasteNotificationSource(registered: true, app: chrome, pid: target), .untrusted)
    XCTAssertEqual(engine.pasteNotificationSource(registered: true, app: textEdit, pid: target), .trusted)
    XCTAssertEqual(engine.pasteNotificationSource(registered: false, app: textEdit, pid: target), .none)
    var value = false
    let access = EnablementAccess(listed: { ["AXManualAccessibility"] }, readRole: {}, read: { _ in value },
                                  write: { _, written in value = written; return .success }, current: { true })
    let launched = processGeneration(launchDate: nil, pid: target)
    XCTAssertEqual(engine.webAccessibility.enable(pid: target, launched: launched, connection: 1, access: access), "AXManualAccessibility")
    XCTAssertEqual(engine.pasteNotificationSource(registered: true, app: chrome, pid: target), .trusted)
    engine.webAccessibility.release(connection: 1, immediately: true)  // end_task (#292)
    XCTAssertEqual(engine.pasteNotificationSource(registered: true, app: chrome, pid: target), .untrusted, "written back")
  }
}

// MARK: The paste's activation click (#187: an activation never leaves an arm)

/// Every event route 3 was asked to post, kept whole (the activation click's window fields are read from them).
private final class PostedEvents {
  var events: [CGEvent] = []
}

extension PasteActivationTests {
  /// Chrome's window and its AXActivationPoint outside the frame (U13's corner).
  private static let chromeFrame = CGRect(x: 80, y: 60, width: 610, height: 860)
  private static let outsidePoint = CGPoint(x: -1, y: 1441)

  /// A paste through the engine into a window the seam places (frame and number 41) whose activation point lies outside
  /// its frame, stopped by a user event at the in-flight check just before ⌘V (the third: after the paste lock's and the
  /// activation's), so nothing reaches the real desktop. The meta it stopped with.
  private func pasteStoppedBeforeCommandV(seam: GuardSeam, posted: PostedEvents, typed: Bool = false) -> InputMeta {
    seam.activationPoint = Self.outsidePoint
    var system = seam.system
    let post = system.post
    system.post = { event, pid in
      posted.events.append(event.copy()!)
      post(event, pid)
    }
    system.windowPlacement = { _, _ in (Self.chromeFrame, 41) }
    let pasteboard = TestPasteboard()
    pasteboard.userCopies("the owner's")
    let engine = Engine(paths: ServerPaths(socket: "/tmp/x.sock", directory: "/tmp", lock: "/tmp/x.lock", usage: "/tmp/cua-engine-test-usage.json"),
                        intervention: InterventionMonitor(listenGranted: { false }), screenLocked: { false },
                        pasteboard: { pasteboard.access }, pasteActivation: system)
    let context = ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0,
                                   deadline: unixMilliseconds() + 60_000, lineage: nil)
    let app = ResolvedApp(appPath: "/Applications/TextEdit.app", bundleIdentifier: nil, displayName: "Chrome", running: nil)
    var checks = 0
    let guarding = InterventionGuard(detection: true, verdict: .proceed, app: "Chrome", start: 0, latest: {
      checks += 1
      return checks >= 3 ? AttributedEvent(sequence: 1, at: 2) : nil
    }, lastAtCheck: nil)
    let pasteTarget = PasteTarget(app: app, pid: target, application: AXUIElementCreateApplication(target), keyboard: target, guarding: guarding)
    var meta = InputMeta(context)
    var entered = 0
    XCTAssertThrowsError(try typed
      ? String(describing: engine.typeTextByPaste("x\ny", pasteTarget, context, meta: &meta))
      : String(describing: engine.pasteOperation([.content(plain("x"), units: 1)], pasteTarget, context, entered: &entered, meta: &meta))) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "userIntervened", "stopped before ⌘V")
    }
    XCTAssertEqual(checks, 3, "the stop is the check just before ⌘V")
    XCTAssertEqual(pasteboard.strings(), ["the owner's"], "restored")
    return meta
  }

  /// The paste route's activation (paste and type_text alike): the inert click pair goes at Chrome's outside point,
  /// which lies far beyond the frame, right after subtype 1, with route 3's activation click recipe (the window's number
  /// in the NSEvent and in fields 91 and 92, no flags, subtype 3), so the window is key before ⌘V. The activation's guard
  /// still runs after it and repairs a raise; the deactivation still follows; the meta records where the point lay and
  /// the click's kind. What the slot's B arm did, now with no switch.
  func testThePastesActivationPostsTheInertClickAtTheOutsidePointAndStillGuards() throws {
    for typed in [false, true] {
      let seam = GuardSeam(frontmost: user)
      seam.targetAbove = true  // the target's window found above the user's at the guard's first sample, repaired
      let posted = PostedEvents()
      let meta = pasteStoppedBeforeCommandV(seam: seam, posted: posted, typed: typed)
      XCTAssertEqual(seam.posts.map(\.kind), [.appKit(1), .mouse(.leftMouseDown), .mouse(.leftMouseUp), .appKit(2)], typed ? "type_text" : "paste")
      XCTAssertEqual(seam.posts[1].location, Self.outsidePoint)
      XCTAssertEqual(seam.posts[2].location, Self.outsidePoint)
      XCTAssertEqual(seam.posts[1].flags, [], "no ⌘: an activation click, not route 2's")
      for event in posted.events[1...2] {
        XCTAssertEqual(event.getIntegerValueField(CGEventField(rawValue: 91)!), 41, "kCGMouseEventWindowUnderMousePointer")
        XCTAssertEqual(event.getIntegerValueField(CGEventField(rawValue: 92)!), 41, "…ThatCanHandleThisEvent")
        XCTAssertEqual(NSEvent(cgEvent: event)?.windowNumber, 41, "the NSEvent's window number")
        XCTAssertEqual(event.getIntegerValueField(.mouseEventSubtype), 3)
      }
      XCTAssertEqual(seam.raises, 1, "the activation's guard repaired the raise")
      XCTAssertNotNil(meta.activationGuardMs)
      XCTAssertEqual(meta.activationClick, .outsideFrame, "the activation point's own decision")
      XCTAssertEqual(meta.wire["activationClickKind"] as? NSDictionary, ["kind": "inertOutside", "point": "activationPoint", "when": "early"])
      let record = try XCTUnwrap(meta.paste?.wire["focusEnforcement"] as? [String: Any])
      XCTAssertEqual(record["activated"] as? Bool, true)
      XCTAssertEqual(record["point"] as? String, "outside")
      XCTAssertEqual(record["click"] as? NSDictionary, ["kind": "inertOutside", "point": "activationPoint", "when": "early"])
      XCTAssertNil(record["arm"], "no switch, no arm")
      XCTAssertNil(record["liftedClick"], "retired: `click` says what was posted")
      XCTAssertNil(record["clickToCommandVMs"], "stopped before ⌘V: no time to it")
      XCTAssertEqual(seam.holds, 1, "one screen-update hold for the paste")
      XCTAssertEqual(seam.releases, 1, "a stop before the first ⌘V ends the hold the activation left open")
      XCTAssertNil(meta.delivery, "no event of the paste's own went out: no delivery guard")
    }
  }

  // MARK: The delivery guard and the after-action watch on the paste route (#200's, the slot of 2026-11-01)

  /// A paste through the engine to its end on the seam, into a window it places (frame and number 41): the paste's keys
  /// go out through route 3's post (the seam's), the fake app reads the pasteboard at each ⌘V's key down, and `onKeyDown`
  /// runs at each key down with its key code (⌘V's 0x09, Return's 0x24). `before` runs on the engine first (another
  /// holder's activation). The meta it answered with.
  private func pasteToItsEnd(_ text: String, typed: Bool, seam: GuardSeam, connection: ConnectionState, pasteboard: TestPasteboard,
                             onKeyDown: @escaping (CGKeyCode) -> Void = { _ in },
                             before: (Engine, ActivationSystem) throws -> Void = { _, _ in }) throws -> InputMeta {
    var system = seam.system
    let post = system.post
    system.post = { event, pid in
      if event.type == .keyDown {
        let code = CGKeyCode(event.getIntegerValueField(.keyboardEventKeycode))
        if code == 0x09 { _ = pasteboard.appReads() }
        onKeyDown(code)
      }
      post(event, pid)
    }
    system.windowPlacement = { _, _ in (Self.chromeFrame, 41) }
    let engine = Engine(paths: ServerPaths(socket: "/tmp/x.sock", directory: "/tmp", lock: "/tmp/x.lock", usage: "/tmp/cua-engine-test-usage.json"),
                        intervention: InterventionMonitor(listenGranted: { false }), screenLocked: { false },
                        pasteboard: { pasteboard.access }, pasteActivation: system)
    let context = ExecutionContext(connection: connection, receivedAt: 1, hidIdleMs: 0, deadline: unixMilliseconds() + 60_000, lineage: nil)
    let app = ResolvedApp(appPath: "/Applications/TextEdit.app", bundleIdentifier: nil, displayName: "TextEdit", running: nil)
    let pasteTarget = PasteTarget(app: app, pid: target, application: AXUIElementCreateApplication(target), keyboard: target,
                                  guarding: .off(app: "TextEdit"))
    try before(engine, system)
    var meta = InputMeta(context)
    var entered = 0
    if typed {
      _ = try engine.typeTextByPaste(text, pasteTarget, context, meta: &meta)
    } else {
      try engine.pasteOperation([.content(plain(text), units: text.utf16.count)], pasteTarget, context, entered: &entered, meta: &meta)
    }
    return meta
  }

  /// The paste's first ⌘V goes out through the delivery guard, inside the screen-update hold its activation left open:
  /// a raise of the target's window at ⌘V is undone before the hold is released, one hold for the whole action, and
  /// the result carries `delivery` as a pointer action's does; the activation's own guard ends on one sample.
  func testThePastesFirstCommandVGoesThroughTheDeliveryGuardInsideTheActivationsHold() throws {
    for typed in [false, true] {
      let seam = GuardSeam(frontmost: user)
      seam.targetAbove = false
      let pasteboard = TestPasteboard()
      pasteboard.userCopies("the owner's")
      var commandVs = 0
      var heldAtRaise = false
      let meta = try pasteToItsEnd(typed ? "a\nb" : "x", typed: typed, seam: seam, connection: ConnectionState(id: 1, fd: -1),
                                   pasteboard: pasteboard) { code in
        guard code == 0x09 else { return }
        commandVs += 1
        if commandVs == 1 {
          seam.targetAbove = true  // the app raises its window at the first ⌘V
          heldAtRaise = seam.holds > seam.releases
        }
      }
      let label = typed ? "type_text" : "paste"
      XCTAssertEqual(commandVs, typed ? 2 : 1, label)
      XCTAssertTrue(heldAtRaise, "the first ⌘V went out inside the activation's hold (\(label))")
      XCTAssertEqual(seam.targetAbove, false, "the user's window is back on top (\(label))")
      XCTAssertEqual(seam.raises, 1, label)
      XCTAssertEqual(seam.repairsOutsideHold, 0, "repaired inside the hold (\(label))")
      XCTAssertEqual(seam.holds, 1, "one hold for the activation and the paste (\(label))")
      XCTAssertEqual(seam.releases, 1, label)
      let delivery = try XCTUnwrap(meta.delivery, label)
      XCTAssertEqual(delivery.restores, 1, label)
      XCTAssertFalse(delivery.raiseLeft, label)
      XCTAssertNotNil(meta.wire["delivery"], "on the wire as a pointer action's (\(label))")
      XCTAssertEqual(meta.activationGuardMs, 10, "the activation's guard settles on one sample when a delivery guard follows (\(label))")
      XCTAssertEqual(pasteboard.strings(), ["the owner's"], "restored (\(label))")
    }
  }

  /// The after-action watch covers the whole paste: it runs while every later line and Return goes out, however long
  /// the lines' waits (here past the first ⌘V's own second), and until a second after the paste's last event; the paste
  /// answers, its pasteboard restored, while the watch still runs. Its repairs are keyed by the delivery's `postedAt`.
  func testTheWatchCoversEveryLineAndASecondAfterThePastesLastEvent() throws {
    let seam = GuardSeam(frontmost: user)
    seam.targetAbove = false
    let pasteboard = TestPasteboard()
    pasteboard.userCopies("the owner's")
    let connection = ConnectionState(id: 7, fd: -1)
    var raisesAtTheReturn: Int?
    var lastCommandVAt: Double?
    var commandVs = 0
    let meta = try pasteToItsEnd("a\nb", typed: true, seam: seam, connection: connection, pasteboard: pasteboard) { code in
      if code == returnKeyCode {
        seam.advance(1_200)  // line 1's waits outlast a second after the first ⌘V
        seam.targetAbove = true
        seam.advance(20)
        raisesAtTheReturn = seam.raises
      } else if code == 0x09 {
        commandVs += 1
        if commandVs == 2 { lastCommandVAt = seam.clock }
      }
    }
    XCTAssertEqual(raisesAtTheReturn, 1, "a raise between the lines, past the first ⌘V's second, is repaired")
    XCTAssertEqual(pasteboard.strings(), ["the owner's"], "the paste answered with its restore done")
    XCTAssertTrue(connection.afterAction.watching, "and the watch still running")
    let last = try XCTUnwrap(lastCommandVAt)
    seam.targetAbove = true
    seam.advance(last + deliveryRepairWindowMs - 100 - seam.clock)
    XCTAssertEqual(seam.raises, 2, "repaired inside the second after the last ⌘V")
    XCTAssertEqual(seam.targetAbove, false)
    seam.advance(200)
    XCTAssertFalse(connection.afterAction.watching, "past it the watch has ended")
    seam.targetAbove = true
    seam.advance(100)
    XCTAssertEqual(seam.raises, 2)
    let wire = try XCTUnwrap(connection.afterAction.wire)
    XCTAssertEqual(wire["repairs"] as? Int, 2)
    let actions = try XCTUnwrap(wire["actions"] as? [[String: Any]])
    XCTAssertEqual(actions.count, 1)
    XCTAssertEqual(actions[0]["postedAt"] as? Int, Int(try XCTUnwrap(meta.delivery).postedAt), "keyed by the paste's delivery")
  }

  /// A paste that joins a hold whose arm no mouse down has consumed (a pointer action's activation on Chrome, awaiting its
  /// own click) posts the kept inert click itself, before its first ⌘V, so ⌘V reaches a key window; its meta records it.
  func testAPasteJoiningAnUnconsumedHoldClicksBeforeItsCommandV() throws {
    let seam = GuardSeam(frontmost: user)
    seam.activationPoint = Self.outsidePoint
    let pasteboard = TestPasteboard()
    pasteboard.userCopies("the owner's")
    var postsAtCommandV: [GuardPost.Kind]?
    var pointerRelease: (() -> Bool)?
    let meta = try pasteToItsEnd("x", typed: false, seam: seam, connection: ConnectionState(id: 1, fd: -1), pasteboard: pasteboard,
                                 onKeyDown: { code in
      if code == 0x09 && postsAtCommandV == nil { postsAtCommandV = seam.posts.map(\.kind) }
    }, before: { engine, system in
      var pointerMeta = InputMeta(ExecutionContext(connection: ConnectionState(id: 2, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
      pointerRelease = try engine.heldActivations.acquire(pid: self.target, holder: ActivationHolder(connection: 2), pointer: PointerHold(), beforeActivating: {}, make: {
        FakeActivation(pid: self.target, window: AXUIElementCreateApplication(self.target), windowFrame: Self.chromeFrame, windowID: 41, system: system)
      }, meta: &pointerMeta)
      XCTAssertEqual(seam.posts.map(\.kind), [.appKit(1)], "the pointer holder's activation, its arm unconsumed")
    })
    XCTAssertEqual(Array(try XCTUnwrap(postsAtCommandV).prefix(3)), [.appKit(1), .mouse(.leftMouseDown), .mouse(.leftMouseUp)],
                   "the inert click before ⌘V")
    XCTAssertEqual(seam.posts[1].location, Self.outsidePoint)
    XCTAssertEqual(meta.wire["activationClickKind"] as? NSDictionary, ["kind": "inertOutside", "point": "activationPoint", "when": "early"])
    XCTAssertEqual((meta.paste?.wire["focusEnforcement"] as? [String: Any])?["activated"] as? Bool, false, "the activation is the other holder's")
    XCTAssertEqual(pasteboard.strings(), ["the owner's"])
    _ = pointerRelease?()
    XCTAssertEqual(seam.posts.filter { $0.kind == .mouse(.leftMouseDown) }.count, 1, "no second click at the release")
    XCTAssertEqual(seam.posts.last?.kind, .appKit(2))
  }

  /// #321's review: a paste that shares a pointer action's activation before the pointer's events (another connection's
  /// click into Safari, its activation point clicked, its hold left open for its own delivery guard) never takes that
  /// pending hold, with its 200 ms cap and 150 ms least wait: it takes one of its own under main's 100 ms cap.
  func testAPasteSharingAPointersPendingHoldTakesItsOwnUnderMainsCap() throws {
    let seam = GuardSeam(frontmost: user)
    seam.targetAbove = false
    seam.activationPoint = CGPoint(x: 110, y: 76)
    let pasteboard = TestPasteboard()
    pasteboard.userCopies("the owner's")
    var pointer: FakeActivation?
    var pointerRelease: (() -> Bool)?
    var raised = false
    seam.onFrontmostRead = { if raised { seam.targetAbove = true } }  // the order never reads back
    let meta = try pasteToItsEnd("x", typed: false, seam: seam, connection: ConnectionState(id: 1, fd: -1), pasteboard: pasteboard,
                                 onKeyDown: { code in if code == 0x09 { raised = true } }, before: { engine, system in
      var pointerMeta = InputMeta(ExecutionContext(connection: ConnectionState(id: 2, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
      pointerRelease = try engine.heldActivations.acquire(pid: self.target, holder: ActivationHolder(connection: 2), pointer: PointerHold(defersArmClick: true),
                                                          beforeActivating: {}, make: {
        let made = FakeActivation(pid: self.target, window: AXUIElementCreateApplication(self.target), windowFrame: Self.chromeFrame, windowID: 41, system: system)
        made.holdsThroughDelivery = true
        made.holdsUntilOrderReadsBack = true
        pointer = made
        return made
      }, meta: &pointerMeta)
      XCTAssertEqual(pointer?.clickKind, .activationPoint)
      XCTAssertEqual(seam.holds - seam.releases, 1, "the pointer's hold pending")
    })
    let delivery = try XCTUnwrap(meta.delivery)
    XCTAssertEqual(seam.holds, 2, "the paste's own hold beside the pointer's")
    XCTAssertEqual(delivery.screenHoldMs, activationHoldCapMs, "main's cap")
    XCTAssertEqual(Double(delivery.releasedAt - delivery.holdStartedAt), activationHoldCapMs)
    XCTAssertTrue(delivery.capped)
    pointer?.releaseOpenHold()
    _ = pointerRelease?()
  }

  /// The retired switch is not in the engine's status: an engine.json still carrying it changes nothing.
  func testTheStatusNoLongerReportsTheRetiredSwitch() {
    let engine = Engine(paths: ServerPaths(socket: "/tmp/x.sock", directory: "/tmp", lock: "/tmp/x.lock", usage: "/tmp/cua-engine-test-usage.json"),
                        intervention: InterventionMonitor(listenGranted: { false }), screenLocked: { false })
    XCTAssertNil(engine.status(ConnectionState(id: 1, fd: -1))["pasteFocusEnforcement"])
  }
}

extension PasteOperationTests {
  /// The paste's activation record rides on every line's diagnostics, with the times from the activation and from its
  /// click to that line's ⌘V on route 3's clock; without a record from the caller there is none.
  func testTheFocusEnforcementRecordTimesEachLinesCommandV() throws {
    var record = PasteFocusEnforcement(activation: nil)
    XCTAssertEqual(record.wire as NSDictionary, ["activated": false], "no activation of the paste's own")
    record.activated = true
    record.point = .outside
    record.click = .inertOutside(.activationPoint, .early)
    record.activatedAt = 100
    record.clickPostedAt = 101
    let pasteboard = TestPasteboard()
    pasteboard.userCopies("the owner's")
    var activationClock = 150.0
    var characters = 0
    var entered = 0
    var bare = meta()
    var meta = meta()
    try runPaste([.content(plain("a"), units: 1), .returnKey(units: 1), .content(plain("b"), units: 1)], pasteboard: pasteboard.access,
                 effect: effect { EffectReading(range: [characters, 0], characters: characters) }, readTimeoutMs: 0,
                 focusEnforcement: record, activationNow: { activationClock }, mainProbe: { $0() }, checkInFlight: {},
                 postPaste: { _ = pasteboard.appReads(); characters += 1; activationClock += 20; return true },
                 postReturn: { characters += 1; return true },
                 entered: &entered, meta: &meta)
    let wire = try XCTUnwrap(meta.paste?.wire["focusEnforcement"] as? [String: Any])
    XCTAssertEqual(wire["point"] as? String, "outside")
    XCTAssertEqual(wire["click"] as? NSDictionary, ["kind": "inertOutside", "point": "activationPoint", "when": "early"])
    XCTAssertEqual(wire["activationToCommandVMs"] as? Double, 70, "line 2's ⌘V, 20 ms after line 1's at 150")
    XCTAssertEqual(wire["clickToCommandVMs"] as? Double, 69)
    try run([.content(plain("c"), units: 1)], pasteboard, effect: effect { EffectReading(range: [characters, 0], characters: characters) },
            postPaste: { _ = pasteboard.appReads(); characters += 1; return true }, entered: &entered, meta: &bare)
    XCTAssertNil(bare.paste?.wire["focusEnforcement"])
  }
}

// MARK: Which sources key and which paste

/// The routing predicate (review finding 4): a source keys when its TIS type is a keyboard layout, whatever its script,
/// since a layout's keys compose nothing; an input method or input mode (Korean, Japanese) takes the paste route. Read
/// from the installed sources by id; nothing is selected.
final class InputSourceRouteTests: XCTestCase {
  private func installed(_ id: String) throws -> InputSourceInfo {
    let filter = [kTISPropertyInputSourceID as String: id] as CFDictionary
    guard let list = TISCreateInputSourceList(filter, true)?.takeRetainedValue() as? [TISInputSource], let source = list.first else {
      throw XCTSkip("\(id) is not installed on this Mac")
    }
    return inputSourceInfo(source)
  }

  private func route(_ info: InputSourceInfo) -> TextRoute {
    textRoute(keyboardLayout: info.keyboardLayout, perContextUnknown: false, concealed: false, spikeKeyed: false)
  }

  func testKeyboardLayoutsOfAnyScriptAreKeyed() throws {
    for id in ["com.apple.keylayout.ABC", "com.apple.keylayout.US", "com.apple.keylayout.Russian", "com.apple.keylayout.Greek"] {
      let info = try installed(id)
      XCTAssertTrue(info.keyboardLayout, id)
      XCTAssertEqual(route(info), .keyed, id)
    }
  }

  func testInputMethodsAndModesPaste() throws {
    for id in ["com.apple.inputmethod.Korean.2SetKorean", "com.apple.inputmethod.Kotoeri.RomajiTyping.Japanese"] {
      let info = try installed(id)
      XCTAssertFalse(info.keyboardLayout, id)
      XCTAssertEqual(route(info), .paste, id)
    }
  }
}


// MARK: CSS

/// Declarations and sheets keep what cannot load and lose what can, matched after comments and escapes are decoded;
/// what cannot be parsed confidently is dropped whole (review finding, round 3).
final class CSSSanitizerTests: XCTestCase {
  func testDeclarationsKeepWhatCannotLoad() {
    XCTAssertEqual(sanitizedDeclarations("font-weight: bold; color: #ff0000"), "font-weight: bold; color: #ff0000")
    XCTAssertEqual(sanitizedDeclarations("color: red; background: url(http://127.0.0.1:9/x); margin: 0;"), "color: red; margin: 0")
    XCTAssertEqual(sanitizedDeclarations("color: red /* url(x) */"), "color: red /* url(x) */", "a comment loads nothing")
  }

  func testEveryLoadingFunctionAndPropertyIsRemoved() {
    for declaration in ["background: URL(x)", "background-image: image-set(\"a.png\" 1x)", "background: -webkit-image-set(\"a.png\" 1x)",
                        "background: image(\"a.png\")", "background: cross-fade(url(a), url(b), 50%)", "background: -moz-element(#a)",
                        "width: expression(alert(1))", "behavior: url(x.htc)", "-moz-binding: url(x.xml#b)", "content: \"url(x)\""] {
      XCTAssertEqual(sanitizedDeclarations("color: red; " + declaration), "color: red", declaration)
    }
  }

  func testAURLBehindAnEscapeOrACommentIsRemoved() {
    for declaration in [#"background: u\72l(x)"#, #"background: \75 rl(x)"#, #"background: \000075\000072\00006c(x)"#,
                        #"background: \u\r\l(x)"#, "background: url/**/(x)", "background: u/* */rl(x)", #"background: \55 RL(x)"#] {
      XCTAssertEqual(sanitizedDeclarations("color: red; " + declaration), "color: red", declaration)
    }
  }

  /// Comment-looking text inside strings is not a comment: a loading token between two such strings is seen and removed
  /// (review finding, round 4), in a declaration list and in a sheet.
  func testCommentDelimitersInsideStringsHideNothing() {
    let hidden = #"background-image: var(--a, "/*"), url(http://127.0.0.1:9/x.png), var(--b, "*/")"#
    XCTAssertEqual(sanitizedDeclarations("--a: none; --b: none; " + hidden), "--a: none; --b: none")
    XCTAssertEqual(sanitizedDeclarations(#"color: red; content: '/*' url(x) '*/'"#), "color: red")
    XCTAssertEqual(sanitizedDeclarations(#"color: red; content: "\"/*" url(x) "*/""#), "color: red", "an escaped quote does not end the string")
    XCTAssertEqual(sanitizedSheet("p { --a: none; --b: none; \(hidden); }"), "p { --a: none; --b: none }")
    XCTAssertEqual(sanitizedSheet(#"p { color: red } i[title="/*"] { background: url(x) } b[title="*/"] { color: blue }"#),
                   #"p { color: red }"# + "\n" + #"b[title="*/"] { color: blue }"#)
  }

  /// The converse: a real comment between two strings still hides nothing and loads nothing.
  func testARealCommentBetweenStringsIsStillAComment() {
    XCTAssertEqual(sanitizedDeclarations(#"color: red; font-family: "a" /* url(x) */ "b""#), #"color: red; font-family: "a" /* url(x) */ "b""#)
    XCTAssertEqual(sanitizedDeclarations(#"color: red; background: "a" /* x */ url(y)"#), "color: red")
  }

  /// A sheet may end with a closed comment.
  func testASheetMayEndWithAComment() {
    XCTAssertEqual(sanitizedSheet("p{font-weight:bold} /* c */"), "p { font-weight:bold }")
    XCTAssertEqual(sanitizedSheet("p{font-weight:bold} /* c */ \n /* d */"), "p { font-weight:bold }")
    XCTAssertNil(sanitizedSheet("p{font-weight:bold} /* open"))
  }

  func testWhatCannotBeParsedIsDroppedWhole() {
    for text in [#"color: red; content: "abc"#, "color: red; /* open", "color: red; width: calc(1px", "color: red; } p { x: y",
                 "color red", #"color: red; background: url(x"#, "color: red\\"] {
      XCTAssertNil(sanitizedDeclarations(text), text)
    }
  }

  func testSheetsKeepTheirRulesAndLoseTheLoadingOnes() {
    let sheet = #"""
      @charset "utf-8";
      @import url(http://127.0.0.1:9/a.css);
      @IMPORT "b.css";
      @\69mport "c.css";
      @namespace svg url(http://www.w3.org/2000/svg);
      @font-face { font-family: X; src: url(x.woff) }
      p > b { color: red; background: url(y) }
      i { background: url(z) }
      @media screen { b { font-weight: bold; list-style-image: url(w) } }
      @keyframes k { from { opacity: 0 } to { opacity: 1 } }
      @unknown-rule { p { color: blue } }
      """#
    XCTAssertEqual(sanitizedSheet(sheet), """
      @charset "utf-8";
      p > b { color: red }
      @media screen { b { font-weight: bold } }
      @keyframes k { from { opacity: 0 }
      to { opacity: 1 } }
      """)
  }

  func testASheetThatCannotBeParsedIsDroppedWhole() {
    for sheet in ["p { color: red", "p { color: red } }", #"p { content: "a }"#, "/* p { color: red }", "p { color: red } <x"] {
      XCTAssertNil(sanitizedSheet(sheet), sheet)
    }
  }
}
