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
  func restore(_ snapshot: PasteboardSnapshot?) { inner.restore(snapshot) }
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
    for name in ["img", "link", "iframe", "frame", "frameset", "object", "embed", "script", "style", "video", "audio", "source", "meta", "base"] {
      XCTAssertFalse(result.contains("<\(name) ") || result.contains("<\(name)>") || result.contains("<\(name)/"), "\(name): \(result)")
    }
    for attribute in ["style=", "src=", "background=", "poster=", "data=", "url("] {
      XCTAssertFalse(result.contains(attribute), "\(attribute): \(result)")
    }
    XCTAssertFalse(result.contains("127.0.0.1"), result)
    XCTAssertTrue(result.contains("https://example.com/"), "a link's href loads nothing and is kept")
    let text = try rendered(html)
    XCTAssertTrue(text.contains("kept link") && text.contains("cell"), text)
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
    pasteboard.access.restore(snapshot)
    XCTAssertEqual(pasteboard.strings(), ["one", "two"])
    XCTAssertEqual(pasteboard.appReads(.html), "<i>one</i>")
  }

  func testAnEmptyPasteboardSnapshotsAsNilAndRestoresEmpty() {
    let pasteboard = TestPasteboard()
    pasteboard.board.clearContents()
    XCTAssertNil(pasteboard.access.snapshot().items)
    pasteboard.userCopies("ours")
    pasteboard.access.restore(nil)
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
  private func effect(observer: Bool = false, reading: @escaping () -> EffectReading = { EffectReading(range: [0, 0], characters: 0) }) -> PasteEffect {
    PasteEffect(hasObserver: observer, read: reading, now: { [unowned self] in clock }, sleep: { [unowned self] in clock += $0 })
  }

  private func run(_ parts: [PastePart], _ pasteboard: TestPasteboard, effect: PasteEffect, readTimeoutMs: Double = 0,
                   checkInFlight: () throws -> Void = {}, postPaste: () -> Bool, postReturn: () -> Bool = { true },
                   entered: inout Int, meta: inout InputMeta) throws {
    try runPaste(parts, pasteboard: pasteboard.access, effect: effect, readTimeoutMs: readTimeoutMs, checkInFlight: checkInFlight,
                 postPaste: postPaste, postReturn: postReturn, entered: &entered, meta: &meta)
  }

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
    }, postReturn: { log.append("Return"); return true }, entered: &entered, meta: &meta)) {
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
    }, postReturn: { afterReturn = true; log.append("Return"); return true }, entered: &entered, meta: &meta)) {
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

  /// No read within the wait: the vendor's sentence, the previous contents restored, the interval kept (⌘V was posted).
  func testNoReadIsTheReadSentenceAndStillRestores() {
    let pasteboard = TestPasteboard()
    pasteboard.userCopies("the owner's")
    var entered = 0
    var meta = meta()
    XCTAssertThrowsError(try run([.content(plain("x"), units: 1)], pasteboard, effect: effect(), postPaste: { true },
                                 entered: &entered, meta: &meta)) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "clipboardReadTimedOut")
      XCTAssertEqual((error as? EngineError)?.message, "Timed out waiting for the application to read the clipboard")
    }
    XCTAssertEqual(pasteboard.strings(), ["the owner's"])
    XCTAssertEqual(entered, 0)
    XCTAssertNotNil(meta.startedAt, "⌘V was posted")
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

  /// Read, but no effect within 2 s: the same "read the clipboard" sentence (F §7.5), the wait polled every 25 ms.
  func testNoEffectIsTheReadSentenceAfterTwoSeconds() {
    let pasteboard = TestPasteboard()
    var entered = 0
    var meta = meta()
    clock = 0
    XCTAssertThrowsError(try run([.content(plain("x"), units: 1)], pasteboard, effect: effect(), postPaste: {
      _ = pasteboard.appReads()
      return true
    }, entered: &entered, meta: &meta)) { XCTAssertEqual(($0 as? EngineError)?.errorName, "clipboardReadTimedOut") }
    XCTAssertEqual(clock, 2_000, accuracy: 25)
  }

  /// With neither an observer nor a baseline the effect wait is a fixed 100 ms (F §7.5).
  func testWithoutObserverOrBaselineTheEffectWaitIsAFixedPause() throws {
    let pasteboard = TestPasteboard()
    var entered = 0
    var meta = meta()
    clock = 0
    try run([.content(plain("x"), units: 1)], pasteboard, effect: effect(reading: { EffectReading() }), postPaste: {
      _ = pasteboard.appReads()
      return true
    }, entered: &entered, meta: &meta)
    XCTAssertEqual(clock, 100)
  }

  /// The observer's notification counts only once the app has read and ⌘V was posted.
  func testANotificationCountsOnlyAfterTheReadAndThePaste() throws {
    let watch = effect(observer: true, reading: { EffectReading(range: [1, 0], characters: 1) })
    watch.begin()
    watch.notification()  // before the read and before ⌘V: not the paste's
    watch.pasteStarted()
    watch.notification()  // before the read
    clock = 0
    XCTAssertFalse(watch.wait(timeoutMs: 100, intervalMs: 25))
    watch.providerRead()
    watch.notification()
    XCTAssertTrue(watch.wait(timeoutMs: 100, intervalMs: 25))
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
    }, postReturn: { log.append("Return"); return true }, entered: &entered, meta: &meta)
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
    }, postPaste: { _ = pasteboard.appReads(); characters += 2; return true }, entered: &entered, meta: &meta))
    XCTAssertEqual(entered, 3)
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
