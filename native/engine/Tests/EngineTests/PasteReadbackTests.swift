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
  var pasteboard: [String]

  var record: [String: Any] { meta.wire["typeReadback"] as? [String: Any] ?? [:] }
  var reason: String? { record["reason"] as? String }
}

/// type_text's paste route through the engine: `text` pasted into an app behind GuardSeam whose window lies at `frame`,
/// its activation point at `activationPoint` (nil: outside the frame, so the activation's click is the inert one
/// outside), read back over `reads`. At each ⌘V's key down the app reads the pasteboard and hands the text to `deliver`
/// (unless `readsPaste` is false: it never reads), and at each Return's key down hands it a Return; `onActivation` runs
/// once the activation's subtype 1 is posted (what the app does on being activated).
private func typeByPaste<Element>(_ text: String, reads: ReadbackReads<Element>, deliver: @escaping ([UInt16]) -> Void,
                                  activationPoint: CGPoint? = nil, onActivation: @escaping () -> Void = {}, readsPaste: Bool = true,
                                  selection: NSRange? = nil, deadlineMs: Int64 = 60_000) -> Pasted {
  let seam = GuardSeam(frontmost: 990_002)
  seam.activationPoint = activationPoint ?? CGPoint(x: -1, y: 1_441)
  let pasteboard = TestPasteboard()
  pasteboard.userCopies(owner)
  var keys: [String] = []
  var system = seam.system
  let post = system.post
  system.post = { event, pid in
    if event.type == .keyDown {
      let code = CGKeyCode(event.getIntegerValueField(.keyboardEventKeycode))
      if code == 0x09 {
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
  }
  system.windowPlacement = { _, _ in (frame, 41) }
  let engine = Engine(paths: ServerPaths(socket: "/tmp/x.sock", directory: "/tmp", lock: "/tmp/x.lock", usage: "/tmp/cua-engine-test-usage.json"),
                      intervention: InterventionMonitor(listenGranted: { false }), screenLocked: { false },
                      pasteboard: { pasteboard.access }, pasteActivation: system)
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
  var meta = InputMeta(context)
  var failure: EngineError?
  do {
    _ = try engine.typeTextByPaste(text, pasteTarget, context, selection: selection, settle: { false }, pointerPending: { false },
                                   reads: watched, meta: &meta)
  } catch {
    failure = error as? EngineError
  }
  return Pasted(error: failure, meta: meta, keys: keys, atSnapshot: atSnapshot, pasteboard: pasteboard.strings())
}

/// The same over a fake field read through `FakeApp`'s reads.
private func typeByPaste(_ text: String, into field: FakeField, activationPoint: CGPoint? = nil, onActivation: @escaping () -> Void = {},
                         readsPaste: Bool = true, selection: NSRange? = nil, deadlineMs: Int64 = 60_000,
                         deliver: (([UInt16]) -> Void)? = nil) -> Pasted {
  typeByPaste(text, reads: FakeApp(field).reads, deliver: deliver ?? { field.deliver($0) }, activationPoint: activationPoint,
              onActivation: onActivation, readsPaste: readsPaste, selection: selection, deadlineMs: deadlineMs)
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
    // The paste's diagnostics: one record per line, no effect wait on any (`typeReadback` answers it).
    let paste = pasted.meta.paste?.wire ?? [:]
    XCTAssertNil(paste["notificationSource"])
    XCTAssertNil(paste["effectWait"])
    XCTAssertEqual((paste["perLine"] as? [[String: Any]])?.count, 2)
  }

  /// A single-line field: a Return is pressed only once the text before it reads back, and its effect is not confirmed;
  /// the text after it is expected in the same field, as the keyed route's.
  func testASingleLineFieldsReturnIsACheckpoint() {
    let field = FakeField(value: "", range: NSRange(location: 0, length: 0))
    field.role = "AXTextField"
    field.returnInserts = false
    let pasted = typeByPaste("검색\n어", into: field)
    XCTAssertNil(pasted.error)
    XCTAssertEqual(field.value, "검색어")
    XCTAssertEqual(pasted.keys, ["⌘V 검색", "Return", "⌘V 어"])
    XCTAssertEqual(pasted.record["checkpoints"] as? Int, 1)
    XCTAssertEqual(pasted.record["keysUnconfirmed"] as? Int, 1)
    XCTAssertEqual(pasted.record["confirmed"] as? Bool, true)
    XCTAssertEqual(pasted.pasteboard, [owner])
  }

  /// A single-line field whose text before a Return does not read back: the Return and everything after it are never
  /// sent, the answer is `typeUnconfirmed` with the excerpt, and the pasteboard is restored.
  func testATextThatDoesNotReadBackBeforeAReturnStopsThere() {
    let field = FakeField(value: "", range: NSRange(location: 0, length: 0))
    field.role = "AXTextField"
    field.returnInserts = false
    field.transform = { $0.uppercased() }
    let pasted = typeByPaste("query\nmore", into: field)
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

  /// A page that rewrites one pasted character, or adds one: `typeUnconfirmed` with #354's excerpt, never a success.
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
      XCTAssertTrue(message.contains("expected \"Schöne Grüße\"; the field reads \(readbackQuoted(actual))."), "\(label): \(message)")
      XCTAssertEqual(pasted.record["expectedLength"] as? Int, 12, label)
      XCTAssertEqual(pasted.record["actualLength"] as? Int, (actual as NSString).length, label)
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
    XCTAssertTrue(pasted.error?.message.contains("expected \"¡Hello\"; the field reads \"Hello¡\".") == true, pasted.error?.message ?? "")
    XCTAssertEqual(pasted.pasteboard, [owner])
  }

  /// A field that cannot be read back answers unconfirmed after the paste, as the keyed route's does: here one whose
  /// value reads nothing, and one at Chromium's AXValue cap, whose read may be cut.
  func testAFieldThatCannotBeReadBackIsUnconfirmed() {
    let unreadable = FakeField(value: nil, range: NSRange(location: 0, length: 0))
    var pasted = typeByPaste("텍스트", into: unreadable)
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
                   clipboardReadTimedOut.message + " Sent before it: 0 of 5 characters (0 of 2 lines); line 1 is in an unknown state.")
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
      XCTAssertFalse(reply.contains("\"characters\"") || reply.contains("\"range\"") || reply.contains("\"baseline\""), "\(label): \(reply)")
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
