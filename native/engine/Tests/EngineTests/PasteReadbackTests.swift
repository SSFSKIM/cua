import AppKit
import ApplicationServices
import XCTest
@testable import Engine

// #361: type_text's paste route read back by #354's machinery (Paste.swift `typeTextByPaste`, TypeReadback.swift). Each
// test drives the real engine path: the paste lock, route 3's activation on GuardSeam's fake desktop, the pasteboard
// (a test pasteboard of its own, never the owner's), ⌘V and Return posted through the seam, and the read-back over a
// fake field the "app" pastes into at ⌘V's key down: TypeReadbackTests' `FakeField`, or SecureTypeReadbackTests'
// `StubPasswordApp` behind the live reads for a password field.

private let owner = "the owner's"
private let frame = CGRect(x: 80, y: 60, width: 610, height: 860)

/// What a paste through the engine answered and what happened on the way.
private struct Pasted {
  var error: EngineError?
  var meta: InputMeta
  /// The keys the app took, in order: "⌘V <text it read>" or "⌘V unread", and "Return".
  var keys: [String]
  /// At the read-back's snapshot: the activation's events posted so far, the pasteboard's contents, the keys so far.
  var atSnapshot: (posts: [GuardPost.Kind], pasteboard: [String], keys: [String])?
  /// At the read-back's last identity check (the final poll's): the events posted so far, the pasteboard's contents.
  var atLastFocusCheck: (posts: [GuardPost.Kind], pasteboard: [String])?
  var pasteboard: [String]

  var record: [String: Any] { meta.wire["typeReadback"] as? [String: Any] ?? [:] }
  var reason: String? { record["reason"] as? String }
}

/// type_text's paste route through the engine: `text` pasted into an app behind GuardSeam whose window lies at `frame`,
/// its activation point at `activationPoint` (nil: outside the frame, so the activation's click is the inert one
/// outside), read back over `reads`. At each ⌘V's key down the app reads the pasteboard and hands the text to `deliver`
/// (unless `readsPaste` is false: it never reads), and at each Return's key down hands it a Return; `onActivation` runs
/// once the activation's subtype 1 is posted (what the app does on being activated), `onDeactivation` once its subtype 2
/// is, and `onCommandV` at each ⌘V's key down before the app reads. A `lateTarget` is Chrome's case in the hosted run
/// 44429799569: at each ⌘V a clipboard manager reads the pasteboard (the hand-over), while the target queues its keys and
/// handles them only when #187's effect watch next reads the field, or after the answer, pasting what the pasteboard
/// holds then.
private func typeByPaste<Element>(_ text: String, reads: ReadbackReads<Element>, deliver: @escaping ([UInt16]) -> Void,
                                  activationPoint: CGPoint? = nil, onActivation: @escaping () -> Void = {},
                                  onDeactivation: @escaping () -> Void = {}, onCommandV: @escaping () -> Void = {}, readsPaste: Bool = true,
                                  selection: NSRange? = nil, deadlineMs: Int64 = 60_000, effectReading: (() -> EffectReading?)? = nil,
                                  lateTarget: Bool = false, handlesAtFieldRead: Bool = false) -> Pasted {
  let seam = GuardSeam(frontmost: 990_002)
  seam.activationPoint = activationPoint ?? CGPoint(x: -1, y: 1_441)
  let pasteboard = TestPasteboard()
  pasteboard.userCopies(owner)
  var keys: [String] = []
  var queued: [CGKeyCode] = []
  func handleQueued() {
    for code in queued {
      if code == 0x09, let pasted = pasteboard.appReads() {
        keys.append("⌘V " + pasted)
        deliver(Array(pasted.utf16))
      } else if code == returnKeyCode {
        keys.append("Return")
        deliver([0x0D])
      }
    }
    queued = []
  }
  var system = seam.system
  let post = system.post
  system.post = { event, pid in
    if event.type == .keyDown, lateTarget {
      let code = CGKeyCode(event.getIntegerValueField(.keyboardEventKeycode))
      if code == 0x09 { _ = pasteboard.appReads() }  // the clipboard manager's read: the hand-over
      if code == 0x09 || code == returnKeyCode { queued.append(code) }
    } else if event.type == .keyDown {
      let code = CGKeyCode(event.getIntegerValueField(.keyboardEventKeycode))
      if code == 0x09 {
        onCommandV()
        if readsPaste, let pasted = pasteboard.appReads() {
          keys.append("⌘V " + pasted)
          deliver(Array(pasted.utf16))
        } else {
          keys.append("⌘V unread")
        }
      }
      if code == returnKeyCode {
        keys.append("Return")
        deliver([0x0D])
      }
    }
    post(event, pid)
    if seam.posts.last?.kind == .appKit(1) { onActivation() }
    if seam.posts.last?.kind == .appKit(2) { onDeactivation() }
  }
  system.windowPlacement = { _, _ in (frame, 41) }
  let engine = Engine(paths: ServerPaths(socket: "/tmp/x.sock", directory: "/tmp", lock: "/tmp/x.lock", usage: "/tmp/cua-engine-test-usage.json"),
                      intervention: InterventionMonitor(listenGranted: { false }), screenLocked: { false },
                      pasteboard: { pasteboard.access }, pasteActivation: system,
                      pasteEffectReading: effectReading.map { read in { _, _ in if lateTarget, !handlesAtFieldRead { handleQueued() }; return read() } })
  let context = ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0,
                                 deadline: unixMilliseconds() + deadlineMs, lineage: nil)
  let target: pid_t = 990_001
  let app = ResolvedApp(appPath: "/Applications/TextEdit.app", bundleIdentifier: nil, displayName: "TextEdit", running: nil)
  let pasteTarget = PasteTarget(app: app, pid: target, application: AXUIElementCreateApplication(target), keyboard: target,
                                guarding: .off(app: "TextEdit"))
  var atSnapshot: (posts: [GuardPost.Kind], pasteboard: [String], keys: [String])?
  var watched = reads
  watched.focused = {
    if atSnapshot == nil { atSnapshot = (seam.posts.map(\.kind), pasteboard.strings(), keys) }
    return reads.focused()
  }
  var atLastFocusCheck: (posts: [GuardPost.Kind], pasteboard: [String])?
  if handlesAtFieldRead {
    let value = reads.value
    watched.value = { element in handleQueued(); return value(element) }  // the queued ⌘V lands as the read-back reads
  }
  watched.stillFocused = { field, found in
    atLastFocusCheck = (seam.posts.map(\.kind), pasteboard.strings())
    return reads.stillFocused(field, found)
  }
  var meta = InputMeta(context)
  var failure: EngineError?
  do {
    _ = try engine.typeTextByPaste(text, pasteTarget, context, selection: selection, settle: { false }, pointerPending: { false },
                                   reads: watched, meta: &meta)
  } catch {
    failure = error as? EngineError
  }
  handleQueued()  // a late target handles what it still holds, after the answer
  return Pasted(error: failure, meta: meta, keys: keys, atSnapshot: atSnapshot, atLastFocusCheck: atLastFocusCheck,
                pasteboard: pasteboard.strings())
}

/// The same over a fake field read through `FakeApp`'s reads (or `app`'s, whose focus a test moves). #187's effect
/// watch reads the field's own numbers (its count and reported range, unlogged), as the engine reads the focused
/// element's, unless `effectSeen` is false: then it has no channel, as an app it cannot read.
private func typeByPaste(_ text: String, into field: FakeField, app: FakeApp? = nil, activationPoint: CGPoint? = nil,
                         onActivation: @escaping () -> Void = {}, onDeactivation: @escaping () -> Void = {},
                         onCommandV: @escaping () -> Void = {}, readsPaste: Bool = true, selection: NSRange? = nil,
                         deadlineMs: Int64 = 60_000, effectSeen: Bool = true, lateTarget: Bool = false, deliver: (([UInt16]) -> Void)? = nil) -> Pasted {
  typeByPaste(text, reads: (app ?? FakeApp(field)).reads, deliver: deliver ?? { field.deliver($0) }, activationPoint: activationPoint,
              onActivation: onActivation, onDeactivation: onDeactivation, onCommandV: onCommandV, readsPaste: readsPaste,
              selection: selection, deadlineMs: deadlineMs, effectReading: {
    guard effectSeen else { return EffectReading() }
    return EffectReading(range: field.reportedRange.map { [$0.location, $0.length] }, characters: field.value.map { ($0 as NSString).length })
  }, lateTarget: lateTarget)
}

final class PasteReadbackTests: XCTestCase {
  // MARK: An exact paste confirms

  func testAnExactPasteConfirms() {
    let cases: [(label: String, before: String, range: NSRange, text: String, after: String)] = [
      ("a single line into an empty field", "", NSRange(location: 0, length: 0), "안녕하세요", "안녕하세요"),
      ("over a selection", "Old draft", NSRange(location: 0, length: 9), "새 초안", "새 초안"),
      ("into a prefilled field, at its caret", "Dear , thanks", NSRange(location: 5, length: 0), "김민", "Dear 김민, thanks"),
      ("an emoji and a combining sequence", "", NSRange(location: 0, length: 0), "e\u{301} 😀", "e\u{301} 😀"),
    ]
    for (label, before, range, text, after) in cases {
      let field = FakeField(value: before, range: range)
      field.role = "AXTextField"
      let pasted = typeByPaste(text, into: field)
      XCTAssertNil(pasted.error, label)
      XCTAssertEqual(field.value, after, label)
      XCTAssertEqual(pasted.record["confirmed"] as? Bool, true, label)
      XCTAssertNil(pasted.reason, label)
      XCTAssertEqual(pasted.meta.inputRoute, .paste, label)
      XCTAssertEqual(pasted.meta.entered, text.utf16.count, label)
      XCTAssertEqual(pasted.keys, ["⌘V " + text], label)
      XCTAssertEqual(pasted.pasteboard, [owner], "\(label): restored")
      XCTAssertNil(pasted.meta.note, "\(label): a success with no note")
    }
  }

  /// A multi-line field takes each Return as text: no checkpoint, the newline read back like any character.
  func testAMultiLinePasteConfirmsWithItsReturnsAsText() {
    let field = FakeField(value: "", range: NSRange(location: 0, length: 0))  // an AXTextArea
    let pasted = typeByPaste("첫 줄\n둘째 줄\n", into: field)
    XCTAssertNil(pasted.error)
    XCTAssertEqual(field.value, "첫 줄\n둘째 줄\n")
    XCTAssertEqual(pasted.keys, ["⌘V 첫 줄", "Return", "⌘V 둘째 줄", "Return"])
    XCTAssertEqual(pasted.record["confirmed"] as? Bool, true)
    XCTAssertNil(pasted.record["checkpoints"], "no checkpoint: a Return is text here")
    XCTAssertNil(pasted.record["keysUnconfirmed"])
    XCTAssertEqual(pasted.meta.entered, "첫 줄\n둘째 줄\n".utf16.count)
    XCTAssertEqual(pasted.pasteboard, [owner])
    // The paste's diagnostics: #187's, each line's effect seen and the Return between them settled.
    let records = pasted.meta.paste?.wire["perLine"] as? [[String: Any]] ?? []
    XCTAssertEqual(records.map { $0["effectWait"] as? String }, ["reading", "reading"])
    XCTAssertEqual((records.last?["openingReturn"] as? [String: Any])?["settle"] as? String, "reading")
  }

  /// A single-line field and a line no effect showed land (an app with no channel): its Return is pressed only once the
  /// text before it reads back, and its effect is not confirmed; the text after it is expected in the same field, as the
  /// keyed route's.
  func testASingleLineFieldsReturnIsACheckpoint() {
    let field = FakeField(value: "", range: NSRange(location: 0, length: 0))
    field.role = "AXTextField"
    field.returnInserts = false
    let pasted = typeByPaste("검색\n어", into: field, effectSeen: false)
    XCTAssertNil(pasted.error)
    XCTAssertEqual(field.value, "검색어")
    XCTAssertEqual(pasted.keys, ["⌘V 검색", "Return", "⌘V 어"])
    XCTAssertEqual(pasted.record["checkpoints"] as? Int, 1)
    XCTAssertEqual(pasted.record["keysUnconfirmed"] as? Int, 1)
    XCTAssertEqual(pasted.record["confirmed"] as? Bool, true)
    XCTAssertEqual(pasted.pasteboard, [owner])
  }

  /// Where #187's effect wait saw the line land, its Return goes as on main, with no checkpoint, and #187's settle
  /// judges it: a single-line field whose Return changes nothing stops the text there as main does (`pasteUnconfirmed`,
  /// the Return's sentence), the pasteboard restored.
  func testASeenLinesReturnIsSettledAsOnMain() {
    let field = FakeField(value: "", range: NSRange(location: 0, length: 0))
    field.role = "AXTextField"
    field.returnInserts = false
    let pasted = typeByPaste("검색\n어", into: field)
    XCTAssertEqual(pasted.error?.errorName, "pasteUnconfirmed")
    XCTAssertTrue(pasted.error?.message.hasPrefix(returnUnconfirmed.message) == true, pasted.error?.message ?? "")
    XCTAssertEqual(pasted.keys, ["⌘V 검색", "Return"], "the next line not pasted")
    XCTAssertNil(pasted.record["checkpoints"])
    XCTAssertEqual(pasted.pasteboard, [owner])
  }

  /// A single-line field whose text before a Return does not read back, no effect having shown it land: the Return and
  /// everything after it are never sent, the answer is `typeUnconfirmed` with the excerpt (read while the pasteboard held
  /// the engine's item), and the pasteboard is restored.
  func testATextThatDoesNotReadBackBeforeAReturnStopsThere() {
    let field = FakeField(value: "", range: NSRange(location: 0, length: 0))
    field.role = "AXTextField"
    field.returnInserts = false
    field.transform = { $0.uppercased() }
    let pasted = typeByPaste("query\nmore", into: field, effectSeen: false)
    XCTAssertEqual(pasted.error?.errorName, "typeUnconfirmed")
    XCTAssertTrue(pasted.error?.message.hasPrefix("The text before a Return or Tab was typed, but the field does not read as expected, so the key and the text after it were not sent.") == true,
                  pasted.error?.message ?? "")
    XCTAssertEqual(pasted.keys, ["⌘V query"], "neither the Return nor the next line")
    XCTAssertEqual(pasted.record["stoppedBeforeKey"] as? Bool, true)
    XCTAssertEqual(pasted.reason, "valueMismatch")
    XCTAssertEqual(pasted.meta.entered, 5)
    XCTAssertEqual(pasted.pasteboard, [owner], "restored on the checkpoint's error")
  }

  // MARK: What the field does not hold answers unconfirmed

  /// A page that rewrites one pasted character, or adds one: `typeUnconfirmed` with its reason alone, never a success, and
  /// on this route no excerpt and no lengths (the review of main..7897cdeb, P1).
  func testAPageThatRewritesOrAddsACharacterIsUnconfirmed() {
    let cases: [(label: String, transform: (String) -> String, actual: String)] = [
      ("rewrites one", { $0.replacingOccurrences(of: "ö", with: "o") }, "Schone Grüße"),
      ("adds one", { $0 + "!" }, "Schöne Grüße!"),
    ]
    for (label, transform, actual) in cases {
      let field = FakeField(value: "", range: NSRange(location: 0, length: 0))
      field.transform = transform
      let pasted = typeByPaste("Schöne Grüße", into: field)
      XCTAssertEqual(field.value, actual, label)
      XCTAssertEqual(pasted.error?.errorName, "typeUnconfirmed", label)
      XCTAssertEqual(pasted.reason, "valueMismatch", label)
      let message = pasted.error?.message ?? ""
      XCTAssertFalse(message.contains("the field reads") || message.contains("Sch"), "\(label): no excerpt: \(message)")
      XCTAssertNil(pasted.record["expectedLength"], label)
      XCTAssertNil(pasted.record["actualLength"], label)
      XCTAssertEqual(pasted.record["confirmed"] as? Bool, false, label)
      XCTAssertEqual(pasted.pasteboard, [owner], "\(label): restored")
      XCTAssertNil(pasted.meta.note, label)
    }
  }

  /// A paste that lands where the snapshot's selection no longer is (a late click moved the caret after the snapshot):
  /// the field holds the text, but not in place of the selection the snapshot read, so it is unconfirmed.
  func testAPasteAtAStaleSelectionIsUnconfirmed() {
    let field = FakeField(value: "Hello", range: NSRange(location: 0, length: 0))
    let pasted = typeByPaste("¡", into: field, deliver: { units in
      field.range = NSRange(location: 5, length: 0)  // the caret moved to the end before the paste landed
      field.deliver(units)
    })
    XCTAssertEqual(field.value, "Hello¡")
    XCTAssertEqual(pasted.error?.errorName, "typeUnconfirmed")
    XCTAssertEqual(pasted.reason, "valueMismatch")
    XCTAssertFalse(pasted.error?.message.contains("Hello") ?? true, "no excerpt on the paste route")
    XCTAssertEqual(pasted.pasteboard, [owner])
  }

  /// A field that cannot be read back answers unconfirmed after the paste, as the keyed route's does: here one whose
  /// value reads nothing, and one at Chromium's AXValue cap, whose read may be cut.
  func testAFieldThatCannotBeReadBackIsUnconfirmed() {
    let unreadable = FakeField(value: nil, range: NSRange(location: 0, length: 0))
    var pasted = typeByPaste("텍스트", into: unreadable, effectSeen: false)  // no channel either
    XCTAssertEqual(pasted.error?.errorName, "typeUnconfirmed")
    XCTAssertEqual(pasted.reason, "valueUnreadable")
    XCTAssertEqual(pasted.keys, ["⌘V 텍스트"], "pasted all the same, as the keyed route types")
    XCTAssertEqual(pasted.pasteboard, [owner])
    let long = FakeField(value: String(repeating: "a", count: typeReadbackValueCap), range: NSRange(location: 0, length: 0))
    pasted = typeByPaste("텍스트", into: long)
    XCTAssertEqual(pasted.reason, "possiblyTruncated")
    XCTAssertNil(pasted.record["expectedLength"], "no values")
    XCTAssertEqual(pasted.pasteboard, [owner])
  }

  // MARK: What stays from #187

  /// A paste the app never reads keeps #187's error (the read wait, here ended by the request's deadline), with what
  /// was sent before it; the pasteboard is restored and nothing is read back.
  func testAPasteTheAppNeverReadsKeepsItsError() {
    let field = FakeField(value: "", range: NSRange(location: 0, length: 0))
    let pasted = typeByPaste("ab\ncd", into: field, readsPaste: false, deadlineMs: 300)
    XCTAssertEqual(pasted.error?.errorName, "clipboardReadTimedOut")
    XCTAssertEqual(pasted.error?.message,
                   clipboardReadTimedOut.message + " Confirmed entered: 0 of 5 characters (0 of 2 lines complete); line 1 is in an unknown state.")
    XCTAssertEqual(pasted.keys, ["⌘V unread"])
    XCTAssertEqual(pasted.meta.paste?.wire["readWait"] as? String, "deadline")
    XCTAssertEqual(pasted.record["confirmed"] as? Bool, false, "the snapshot's record, no poll")
    XCTAssertEqual(field.calls.filter { $0 == "value" }.count, 1, "the snapshot's read alone")
    XCTAssertEqual(pasted.pasteboard, [owner])
  }

  /// select_text's range gone at the snapshot (#359): nothing is pasted and the pasteboard is never touched.
  func testASelectionThatIsGoneAtTheSnapshotPastesNothing() {
    let field = FakeField(value: "Hello world", range: NSRange(location: 11, length: 0))
    let pasted = typeByPaste("x", into: field, selection: NSRange(location: 0, length: 5))
    XCTAssertEqual(pasted.error?.errorName, "typeUnconfirmed")
    XCTAssertTrue(pasted.error?.message.hasPrefix("Nothing was typed") == true)
    XCTAssertEqual(pasted.reason, "selectionChanged")
    XCTAssertEqual(pasted.keys, [])
    XCTAssertNil(pasted.meta.paste, "the operation never ran")
    XCTAssertEqual(pasted.meta.entered, 0)
    XCTAssertEqual(field.value, "Hello world")
    XCTAssertEqual(pasted.pasteboard, [owner])
  }

  // MARK: The snapshot point

  /// The snapshot is taken after the paste's activation and before the pasteboard is touched: the activation's
  /// subtype 1 and its click are posted, the pasteboard still holds the owner's contents and no ⌘V went. What the
  /// activation did to the field is in it: here the page selects the field's text on being activated, the paste replaces
  /// it, and that confirms; a snapshot before the activation would have expected the text at the old caret.
  func testTheSnapshotIsTakenAfterTheActivationAndBeforeThePasteboard() throws {
    let field = FakeField(value: "old", range: NSRange(location: 3, length: 0))
    let pasted = typeByPaste("새", into: field, onActivation: { field.range = NSRange(location: 0, length: 3) })
    let at = try XCTUnwrap(pasted.atSnapshot)
    XCTAssertEqual(at.posts, [.appKit(1), .mouse(.leftMouseDown), .mouse(.leftMouseUp)], "after the activation and its (inert) click")
    XCTAssertEqual(at.pasteboard, [owner], "before the pasteboard is written")
    XCTAssertEqual(at.keys, [], "before ⌘V")
    XCTAssertNil(pasted.error)
    XCTAssertEqual(field.value, "새")
    XCTAssertEqual(pasted.record["confirmed"] as? Bool, true)
    XCTAssertNil(pasted.record["baselineWait"], "the inert click outside the frame lands on no field: no wait")
  }

  /// An activation that clicks its in-window activation point: that click is posted and can land after a read, so the
  /// snapshot first waits for a stable range (#359's), and a caret the click moves while it waits is the starting point.
  func testAnActivationClickInsideTheWindowIsWaitedForBeforeTheSnapshot() throws {
    let field = FakeField(value: "Hello", range: NSRange(location: 0, length: 0))
    // The click lands while the wait reads: the caret moves to the end and stays.
    field.rangesBeforeTyping = [NSRange(location: 0, length: 0), NSRange(location: 0, length: 0), NSRange(location: 5, length: 0)]
    let pasted = typeByPaste("!", into: field, activationPoint: CGPoint(x: 110, y: 76))
    let at = try XCTUnwrap(pasted.atSnapshot)
    XCTAssertEqual(at.posts, [.appKit(1), .mouse(.leftMouseDown), .mouse(.leftMouseUp)])
    XCTAssertEqual(pasted.meta.wire["activationClickKind"] as? NSDictionary, ["kind": "activationPoint", "when": "early"])
    let wait = try XCTUnwrap(pasted.record["baselineWait"] as? [String: Any])
    XCTAssertEqual(wait["for"] as? String, "stable")
    XCTAssertNil(pasted.error)
    XCTAssertEqual(field.value, "Hello!", "the paste at the caret the click left, which the snapshot read")
    XCTAssertEqual(pasted.pasteboard, [owner])
  }

  // MARK: #187's clipboard holding (the hosted run 44429799569, and the review of a1221804..9bfb0b50, P1)

  /// Chrome's case: a clipboard manager reads each line at its ⌘V (the hand-over), and the target handles its ⌘V only
  /// later. #187's pacing keeps each line's item on the pasteboard until that line's effect is seen, so the target pastes
  /// the engine's text, never the person's clipboard, and the read-back confirms it. 9bfb0b50, which restored at the
  /// read, had the person's clipboard in the field and in the excerpt in 108 of 116 such rows.
  func testATargetThatReadsEachLinesCommandVLateNeverPastesTheOwnersClipboard() {
    for text in ["첫 줄\n둘째 줄\n셋째 줄", "한 줄"] {
      let field = FakeField(value: "", range: NSRange(location: 0, length: 0))
      let pasted = typeByPaste(text, into: field, lateTarget: true)
      XCTAssertEqual(field.value, text, "the engine's text, line by line")
      XCTAssertFalse((field.value ?? "").contains(owner))
      XCTAssertNil(pasted.error, pasted.error?.message ?? "")
      XCTAssertEqual(pasted.record["confirmed"] as? Bool, true)
      XCTAssertEqual(pasted.pasteboard, [owner], "restored after the last line's effect")
    }
  }

  /// The review of main..7897cdeb, P2: the expected value comes from the text, so a leading U+FEFF, which decoding the
  /// pasteboard's bytes would read as a byte order mark and drop, is expected; a target that drops it is unconfirmed, at
  /// the start of the text and at the start of a later line.
  func testALeadingZeroWidthNoBreakSpaceIsExpected() {
    XCTAssertEqual(pasteReadbackUnits(typing: "\u{FEFF}hello").map(\.text), [Array("\u{FEFF}hello".utf16)])
    XCTAssertEqual(pasteReadbackUnits(typing: "a\n\u{FEFF}b").map(\.text), [[0x61], [0x0D], Array("\u{FEFF}b".utf16)])
    XCTAssertEqual(pasteReadbackUnits(typing: "a\r\n\nb").map(\.consumed), [1, 2, 1, 1], "a CR LF counts its two units")
    // #187's delivered count stays main's, which Foundation's decoding gives: 5, a leading U+FEFF read as a byte order mark. The
    // read-back alone expects it (the review of 7897cdeb..81fee7a1, P1: a count of 6 would let an unrelated 6-unit change satisfy
    // a password field's effect wait, and the restore land under a pending ⌘V).
    XCTAssertEqual(deliveredUnits([PasteRepresentation(type: .string, data: Data("\u{FEFF}hello".utf8))]), 5)
    for text in ["\u{FEFF}hello", "a\n\u{FEFF}b"] {
      let field = FakeField(value: "", range: NSRange(location: 0, length: 0))
      let pasted = typeByPaste(text, into: field)  // the fake app decodes the pasteboard as Foundation does, dropping it
      XCTAssertFalse(field.value?.unicodeScalars.contains("\u{FEFF}") ?? true, "the target dropped it")
      XCTAssertEqual(pasted.error?.errorName, "typeUnconfirmed", text.debugDescription)
      XCTAssertEqual(pasted.reason, "valueMismatch", text.debugDescription)
    }
  }

  /// The review of main..7897cdeb, P1: a clipboard manager makes the read, an unrelated change in the field satisfies the
  /// effect wait, and the target's queued ⌘V lands only after the restore, pasting the person's clipboard as the
  /// read-back reads. The answer is `typeUnconfirmed` with its reason alone: nothing of the clipboard reaches the reply.
  func testADelayedCommandVAfterAnUnrelatedEffectLeaksNothingOfTheClipboard() throws {
    let field = FakeField(value: "", range: NSRange(location: 0, length: 0))
    var unrelated = 0
    let pasted = typeByPaste("typed", reads: FakeApp(field).reads, deliver: { field.deliver($0) }, effectReading: {
      unrelated += 1  // the page moves the caret for its own reasons: a change, but not the paste's
      return EffectReading(range: [unrelated, 0], characters: 0)
    }, lateTarget: true, handlesAtFieldRead: true)
    XCTAssertEqual(field.value, owner, "the scenario: the late ⌘V pasted the person's clipboard")
    XCTAssertEqual(pasted.error?.errorName, "typeUnconfirmed")
    XCTAssertEqual(pasted.reason, "valueMismatch")
    var wire = withMeta(try XCTUnwrap(pasted.error), pasted.meta).wire
    wire["meta"] = (wire["meta"] as? [String: Any])?.filter { $0.key != "startedAt" && $0.key != "endedAt" }
    let reply = String(data: try JSONSerialization.data(withJSONObject: wire, options: [.sortedKeys]), encoding: .utf8)!
    XCTAssertFalse(reply.contains("owner"), "nothing of the clipboard: \(reply)")
    XCTAssertNil(pasted.record["expectedLength"])
    XCTAssertNil(pasted.record["actualLength"])
    XCTAssertEqual(pasted.pasteboard, [owner])
  }

  /// A line pasted with no effect seen (an app with no channel) may have had its ⌘V handled after the restore, so a
  /// mismatch's excerpt and lengths are withheld: the field could hold the person's clipboard. The answer stays
  /// `typeUnconfirmed`, never a success.
  func testAMismatchAfterALineNoEffectShowedShowsNoExcerpt() {
    let field = FakeField(value: "", range: NSRange(location: 0, length: 0))
    field.transform = { $0 + "!" }
    let pasted = typeByPaste("비밀 아님", into: field, effectSeen: false)
    XCTAssertEqual(field.value, "비밀 아님!")
    XCTAssertEqual(pasted.error?.errorName, "typeUnconfirmed")
    XCTAssertEqual(pasted.reason, "valueMismatch")
    XCTAssertFalse(pasted.error?.message.contains("the field reads") ?? true, pasted.error?.message ?? "")
    XCTAssertFalse(pasted.error?.message.contains("비밀") ?? true)
    XCTAssertNil(pasted.record["expectedLength"])
    XCTAssertNil(pasted.record["actualLength"])
    XCTAssertEqual(pasted.pasteboard, [owner])
  }

  // MARK: The final poll (#361's hosted probe)

  /// The final poll (here of a text that ends in a Return, which the last line's gate does not cover) runs once the
  /// pasteboard is restored and before the activation ends: a background Safari or Electron names no focused element
  /// once its activation is released (the probe: Electron 100 of 100, Safari 58 of 100), and the poll's identity check
  /// asks for it again, so a poll after the release would answer `fieldChanged`.
  func testTheFinalPollRunsWhileTheActivationHolds() throws {
    let field = FakeField(value: "", range: NSRange(location: 0, length: 0))
    let app = FakeApp(field)
    let pasted = typeByPaste("배경 앱\n", into: field, app: app, onDeactivation: { app.focused = nil })
    XCTAssertNil(pasted.error, pasted.error?.message ?? "")
    XCTAssertEqual(pasted.record["confirmed"] as? Bool, true)
    let at = try XCTUnwrap(pasted.atLastFocusCheck)
    XCTAssertFalse(at.posts.contains(.appKit(2)), "before the deactivation: \(at.posts)")
    XCTAssertEqual(at.pasteboard, [owner], "after the restore")
    XCTAssertNil(app.focused, "the deactivation came after, and the field lost its focus then")
  }

  /// The probe's AppKit case: two lines into a single-line field whose Return selects the whole field, so the second
  /// line replaces the first. #187's effect check answered success (40 of 40): each line's effect, and the Return's,
  /// still shows, but the final poll finds the field short of the text: `typeUnconfirmed`. The browsers' case, where the
  /// Return changes nothing and the next line is never pasted, keeps main's answer, `pasteUnconfirmed`.
  func testASingleLineFieldThatLosesALineIsUnconfirmed() {
    let selects = FakeField(value: "", range: NSRange(location: 0, length: 0))
    selects.role = "AXTextField"
    selects.returnInserts = false
    var pasted = typeByPaste("line one\nline two", into: selects, deliver: { units in
      if units == [0x0D] { selects.range = NSRange(location: 0, length: ((selects.value ?? "") as NSString).length) } else { selects.deliver(units) }
    })
    XCTAssertEqual(selects.value, "line two")
    XCTAssertEqual(pasted.keys, ["⌘V line one", "Return", "⌘V line two"])
    XCTAssertNil(pasted.record["checkpoints"], "the first line's effect seen: its Return goes with no checkpoint, as on main")
    XCTAssertEqual(pasted.error?.errorName, "typeUnconfirmed")
    XCTAssertEqual(pasted.reason, "valueMismatch")
    XCTAssertEqual(pasted.pasteboard, [owner])

    let drops = FakeField(value: "", range: NSRange(location: 0, length: 0))
    drops.role = "AXTextField"
    drops.returnInserts = false
    pasted = typeByPaste("line one\nline two", into: drops, deliver: { units in
      if units == [0x0D] { drops.ignoresInput = true } else { drops.deliver(units) }
    })
    XCTAssertEqual(drops.value, "line one")
    XCTAssertEqual(pasted.error?.errorName, "pasteUnconfirmed", "the Return's settle saw no change: main's answer")
    XCTAssertEqual(pasted.keys, ["⌘V line one", "Return"])
    XCTAssertEqual(pasted.pasteboard, [owner])
  }

  /// Firefox (#419, the probe): accessibility names the field focused before as the focus until about the first ⌘V, so
  /// the snapshot can be of that field while the paste lands in the target. The poll's identity check then finds the
  /// focus moved: `fieldChanged`, with no excerpt of the other field's text, never a success.
  func testAFocusThatSettlesOnlyAtTheFirstCommandVIsFieldChanged() {
    let setup = FakeField(value: "setup text", range: NSRange(location: 10, length: 0))
    let target = FakeField(value: "", range: NSRange(location: 0, length: 0))
    let app = FakeApp(setup)
    let pasted = typeByPaste("목표", into: target, app: app, onCommandV: { app.focused = target })
    XCTAssertEqual(target.value, "목표")
    XCTAssertEqual(setup.value, "setup text")
    XCTAssertEqual(pasted.error?.errorName, "typeUnconfirmed")
    XCTAssertEqual(pasted.reason, "fieldChanged")
    XCTAssertFalse(pasted.error?.message.contains("setup") ?? true, "no excerpt of the other field")
    XCTAssertNil(pasted.record["expectedLength"])
    XCTAssertEqual(pasted.pasteboard, [owner])
  }

  // MARK: The request's deadline (#361's review, P2)

  /// A checkpoint's poll is capped at the request's time left, not a fresh second: a single-line field whose text reads
  /// back only after the deadline answers unconfirmed at it, and its Return, which could submit, is never sent.
  func testACheckpointEndsAtTheDeadlineAndItsReturnIsNeverSent() {
    let field = FakeField(value: "", range: NSRange(location: 0, length: 0))
    field.role = "AXTextField"
    field.returnInserts = false
    field.lagReads = 1_000  // 5 s of polls: past any deadline here
    let pasted = typeByPaste("query\nmore", into: field, deadlineMs: 200, effectSeen: false)
    XCTAssertEqual(pasted.error?.errorName, "typeUnconfirmed")
    XCTAssertEqual(pasted.record["stoppedBeforeKey"] as? Bool, true)
    XCTAssertEqual(pasted.keys, ["⌘V query"], "no Return after the deadline")
    XCTAssertLessThan(pasted.record["pollMs"] as? Double ?? .infinity, typeReadbackBudgetMs, "the poll ended at the deadline, not after a second")
    XCTAssertEqual(pasted.pasteboard, [owner])
  }

  /// A gate that confirms only after the deadline has passed sends no further part: the Return is withheld, and the
  /// answer is the deadline's, with what was sent before it.
  func testNoPartIsSentAfterTheDeadline() {
    let field = FakeField(value: "", range: NSRange(location: 0, length: 0))
    field.role = "AXTextField"
    field.returnInserts = false
    var reads = FakeApp(field).reads
    let value = reads.value
    reads.value = { element in
      if field.delivered { usleep(400_000) }  // the field answers its read after the deadline
      return value(element)
    }
    let pasted = typeByPaste("query\nmore", reads: reads, deliver: { field.deliver($0) }, deadlineMs: 250)
    XCTAssertEqual(pasted.error?.errorName, "timeoutReached")
    XCTAssertTrue(pasted.error?.message.hasSuffix(" Entered before it: 5 of 10 characters.") == true,
                  pasted.error?.message ?? "")
    XCTAssertEqual(pasted.keys, ["⌘V query"], "the Return was not sent")
    XCTAssertEqual(pasted.pasteboard, [owner])
  }

  // MARK: A password field (#414's length rule)

  /// Literal text pasted into a password field is confirmed by #414's length rule: the count moved by exactly the
  /// paste over the selection, the caret right after it, held for the quiet window; its characters are never read, by
  /// the read-back or by the paste (no effect reading is taken), and its success carries the length note. A paste the
  /// field took one character short of answers `lengthMismatch`, with nothing of the field's.
  func testAPasswordFieldIsConfirmedByItsLengthAndNeverRead() throws {
    for (label, drops) in [("exact", false), ("a character dropped", true)] {
      let app = StubPasswordApp(value: String(repeating: "x", count: 9), selection: NSRange(location: 9, length: 0))
      if drops { app.transform = { String($0.dropLast()) } }
      var reads = ReadbackReads.live(pid: StubPasswordApp.pid, markerRoute: false, ax: app.ax)
      reads.now = { app.clock }
      reads.sleep = { app.clock += $0 }
      let pasted = typeByPaste("hunter2", reads: reads, deliver: { units in
        app.deliver(units)
        app.posted()
      })
      XCTAssertEqual(app.forbiddenReads, [], "\(label): only the length batch reads the field")
      XCTAssertEqual(pasted.keys, ["⌘V hunter2"], label)
      XCTAssertEqual(pasted.pasteboard, [owner], "\(label): restored")
      if drops {
        XCTAssertEqual(pasted.error?.errorName, "typeUnconfirmed", label)
        XCTAssertEqual(pasted.record as NSDictionary, ["confirmed": false, "secure": true, "reason": "lengthMismatch", "snapshotMs": 0.0] as NSDictionary, label)
      } else {
        XCTAssertNil(pasted.error, label)
        XCTAssertEqual(pasted.record as NSDictionary, ["confirmed": true, "secure": true, "confirmation": "length", "snapshotMs": 0.0] as NSDictionary, label)
        XCTAssertEqual(pasted.meta.note, readbackLengthNote, label)
      }
      let reply = String(data: try JSONSerialization.data(withJSONObject: pasted.meta.wire, options: [.sortedKeys]), encoding: .utf8)!
      XCTAssertFalse(reply.contains("\"characters\"") || reply.contains("\"range\""), "\(label): \(reply)")
      for count in ["16", "15"] { XCTAssertFalse((pasted.error?.message ?? "").contains(count), label) }
    }
  }

  // MARK: Concealed text never pastes

  /// A concealed request never reaches the paste route, whatever the source and the spike's switch: the read-back on
  /// the paste route is literal only.
  func testAConcealedRequestNeverPastes() {
    for keyboardLayout in [false, true] {
      for perContextUnknown in [false, true] {
        for spikeKeyed in [false, true] {
          let route = textRoute(keyboardLayout: keyboardLayout, perContextUnknown: perContextUnknown, concealed: true, spikeKeyed: spikeKeyed)
          XCTAssertNotEqual(route, .paste, "layout \(keyboardLayout), per-context unknown \(perContextUnknown), spikeKeyed \(spikeKeyed)")
        }
      }
    }
  }
}
