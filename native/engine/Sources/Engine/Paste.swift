import AppKit
import ApplicationServices
import Foundation

// Paste and type_text's paste route (the spec's Design, "Paste" and "Text"; R/F-helper-logic.md §7, R/sky-behaviour.md
// §14–15; the vendor's PasteOperation 0x1001b2d2c–0x1001b8e14). One operation, engine-wide one at a time (the FIFO lock,
// Pasteboard.swift), in the vendor's order: the app given route 3's fake activation when it does not believe it has
// focus, before the pasteboard is touched (FUN_1001b2ed8); the focused element's selected range and character count
// taken as the effect baseline, with an observer on the app for `AXSelectedTextChanged` and `AXValueChanged`; the
// pasteboard snapshotted, then the item written through the lazy provider (FUN_1001b76e0); ⌘V posted to the process
// that owns the focused element, with no gap (FUN_1001b382c); up to 2 s for the app to be handed the data
// (FUN_1001b3cfc); the change count checked against the engine's own, then up to 2 s, every 25 ms, for an effect
// (FUN_1001b493c); and the previous contents restored on every path once the pasteboard was taken (taking it clears it,
// so a write that then fails restores too), only while the change count is still the engine's own, so a human's newer
// clipboard is never overwritten (FUN_1001b5030, FUN_100220174). Every write takes the pasteboard only while its count
// is still the one the engine last saw (the snapshot's, then its own), checked in the same main-thread operation as the
// take, so a human copy before any line's write stops the paste as the conflict and is never overwritten.
// The settle runs at the next observation (markActed), as every action's.
//
// cua's departures (#187, Decision Log 2026-11-01): the two waits answer apart, where the vendor remaps its effect
// timeout to the read sentence (FUN_1001b534c). No read in time is `clipboardReadTimedOut`; a read with no effect seen
// where one could have been is `pasteUnconfirmed`, an error, never a success. Both sentences say that delivery is
// unknown and that the field must be observed before any retry, and type_text's add what was confirmed. When the paste
// has no way to see an effect (the baseline empty and no trusted notification source), it answers as soon as the read
// came, with no wait: success with an unconfirmed note (the result's `note`) when the read came after ⌘V, the vendor's
// blind success gated on that timing, else `pasteUnconfirmed`; a Chromium or Electron app's notifications are trusted only while #244's enablement holds for the
// process. Both waits end at the request's deadline too, with that stage's error. Every paste records value-free
// diagnostics in the meta (`paste`, PasteDiagnostics), among them whether the app held key focus at ⌘V
// (`keyFocusAtPaste`), recorded only: it never refuses.
//
// type_text's paste route is the same operation over its text's lines: each line pasted, each newline a Return press
// posted by route 2′ as typed text's are, one snapshot and one restore around the whole, `entered` counting what
// landed. Every input method's call order holds (the Decision Log's M2a.1 entry, item 5): the intervention guard read,
// its reading put in the meta, the pre-action refusal, then the in-flight check before each ⌘V and each Return. The
// action interval is the posted events' (`InputMeta.posting`): activation and the pasteboard are not input to the app,
// so a paste stopped before its ⌘V keeps startedAt and endedAt null.

/// The vendor's read and effect waits (F §7.4–7.5) and the effect poll's interval.
let pasteReadTimeoutMs: Double = 2_000
let pasteEffectTimeoutMs: Double = 2_000
let pasteEffectIntervalMs: Double = 25

/// The read stage: ⌘V was posted and no app was handed the text in time (the vendor's sentence, then what the model
/// must know: a late read, or a late ⌘V, can still enter something).
let clipboardReadTimedOut = EngineError(name: "clipboardReadTimedOut",
  "Timed out waiting for the application to read the clipboard: ⌘V was sent, but no app read the pasted text in time. Whether anything was entered is unknown: observe the field with get_app_state before any retry, and never retry blindly.")
/// The effect stage: the text was handed over (to some reader: the hand-over names none), but no change was seen in the
/// field, or the field reports none.
let pasteUnconfirmed = EngineError(name: "pasteUnconfirmed",
  "The paste could not be confirmed: ⌘V was sent and the pasted text was read from the clipboard, but no change was seen in the field. The text may have arrived: observe the field with get_app_state before any retry, and never retry blindly.")
let clipboardConflict = EngineError(name: "clipboardConflict",
  "The user may have conflicted with your paste operation. Check the app's state to ensure the user's content did not paste instead of your intended content before continuing.")

/// One step of a paste operation.
enum PastePart: Equatable {
  /// Representations to paste, accounting for `units` UTF-16 units of the request.
  case content([PasteRepresentation], units: Int)
  /// A Return press for one newline (`units`: 2 for CR LF).
  case returnKey(units: Int)
}

/// type_text's text for the paste route: its lines as plain text, each newline (LF, CR or CR LF) a Return press, empty
/// lines pasting nothing.
func pasteParts(typing text: String) -> [PastePart] {
  var parts: [PastePart] = []
  var line = ""
  func flush() {
    if !line.isEmpty { parts.append(.content([PasteRepresentation(type: .string, data: Data(line.utf8))], units: line.utf16.count)) }
    line = ""
  }
  for character in text {
    if character.unicodeScalars.allSatisfy({ $0 == "\n" || $0 == "\r" }) {
      flush()
      parts.append(.returnKey(units: character.utf16.count))
    } else {
      line.append(character)
    }
  }
  flush()
  return parts
}

/// The focused element's state the effect is judged against: its selected range (location, length) and character count,
/// each nil where the element does not support it.
struct EffectReading: Equatable {
  var range: [Int]? = nil
  var characters: Int? = nil

  var isEmpty: Bool { range == nil && characters == nil }
}

/// The paste's notification source for the effect wait (#187): none (no observer registered), one whose notifications
/// count (`trusted`), or one registered on an app that may never post them (`untrusted`, a Chromium or Electron process
/// without #244's enablement), which counts as none.
enum NotificationSource: String {
  case trusted, untrusted, none
}

/// Whether a registered observer's notifications can confirm a paste: any app's, except a Chromium or Electron
/// process's while #244's web-accessibility enablement does not hold for it, since such a process posts no
/// `AXValueChanged` for its page with accessibility off.
func notificationSource(registered: Bool, chromiumFamily: Bool, enablementHolds: Bool) -> NotificationSource {
  guard registered else { return .none }
  return !chromiumFamily || enablementHolds ? .trusted : .untrusted
}

/// How the effect wait ended: an effect seen (by a trusted notification, or by the reading's change), its time run
/// out, or nothing to watch at all (`noChannel`: the baseline empty and no trusted source), answered at once.
enum EffectOutcome: String {
  case notification, reading, timeout, noChannel
}

/// The effect wait of one paste (F §7.5): a trusted observer's notification counts once the app was handed the data and
/// ⌘V was posted; otherwise a change of the reading against its baseline. The reading is given the milliseconds the
/// wait has left (infinite for the baseline), which the engine's reading caps its AX messaging timeouts by, and answers
/// nil when it sent no read. The reading and the clock are replaceable for the tests; the clock also times the paste's
/// diagnostics (`runPaste`).
final class PasteEffect: @unchecked Sendable {
  private var source: NotificationSource
  private let read: (Double) -> EffectReading?
  let now: () -> Double
  private let sleep: (Double) -> Void
  private let lock = NSLock()
  private var handedOver = false
  private var readAt: Double?
  private var started = false
  private var seen = false
  private var baseline = EffectReading()

  init(source: NotificationSource = .none, readWithin: @escaping (Double) -> EffectReading?, now: @escaping () -> Double = monotonicMilliseconds,
       sleep: @escaping (Double) -> Void = { usleep(UInt32(max(0, $0) * 1000)) }) {
    self.source = source
    self.read = readWithin
    self.now = now
    self.sleep = sleep
  }

  /// A reading that takes no budget (the unit tests' instant one).
  convenience init(source: NotificationSource = .none, read: @escaping () -> EffectReading, now: @escaping () -> Double = monotonicMilliseconds,
                   sleep: @escaping (Double) -> Void = { usleep(UInt32(max(0, $0) * 1000)) }) {
    self.init(source: source, readWithin: { _ in read() }, now: now, sleep: sleep)
  }

  /// Before a write: the baseline taken, the flags reset.
  func begin() {
    let reading = read(.infinity) ?? EffectReading()
    lock.lock()
    handedOver = false
    readAt = nil
    started = false
    seen = false
    baseline = reading
    lock.unlock()
  }

  /// An observer now reports to this watch (`notification`), its notifications counting only when `trusted`.
  func observed(_ source: NotificationSource) { locked { self.source = source } }
  /// The provider handed the data over: its first time since `begin` is kept for the diagnostics.
  func providerRead() {
    let at = now()
    locked {
      handedOver = true
      if readAt == nil { readAt = at }
    }
  }
  func pasteStarted() { locked { started = true } }
  /// An observed `AXSelectedTextChanged` or `AXValueChanged`.
  func notification() { locked { if source == .trusted && handedOver && started { seen = true } } }

  /// The notification source, whether the baseline is empty, and the first hand-over's time on `now`'s clock (nil
  /// before one), for the diagnostics.
  var notificationSource: NotificationSource { locked { source } }
  var baselineEmpty: Bool { locked { baseline.isEmpty } }
  var firstReadAt: Double? { locked { readAt } }

  /// Polls for the effect until `timeoutMs` passes. With neither a trusted source nor a baseline there is nothing that
  /// could show one, and it answers `noChannel` at once. Each read is given the time left, and a changed reading that
  /// came back after the time ran out is not accepted (#187 review: a slow target's late reply must not confirm a line).
  func wait(timeoutMs: Double = pasteEffectTimeoutMs, intervalMs: Double = pasteEffectIntervalMs) -> EffectOutcome {
    let (baseline, trusted) = locked { (self.baseline, source == .trusted) }
    guard trusted || !baseline.isEmpty else { return .noChannel }
    let start = now()
    while true {
      if locked({ seen }) { return .notification }
      let left = timeoutMs - (now() - start)
      if left <= 0 { return .timeout }
      let changed = !baseline.isEmpty && read(left).map { $0 != baseline } == true
      if now() - start >= timeoutMs { return .timeout }
      if changed { return .reading }
      sleep(max(0, min(intervalMs, timeoutMs - (now() - start))))
    }
  }

  private func locked<T>(_ body: () -> T) -> T {
    lock.lock()
    defer { lock.unlock() }
    return body()
  }
}

/// The 3a predicate (#187), read just before each ⌘V and recorded only, never refusing: whether the app holds key focus
/// where the paste goes. It holds when the app is frontmost or the window server's key-focus process is the app's (or
/// the keys' target's), and the app's focused element lies in the window route 3 prepared (`primaryWindow`, the app's
/// focused window first). The vendor's analogue is `targetForKeyboardEvent` after `safelyEnforceActiveState`
/// (FUN_1001b382c); cua's activation runs no such step, so a background Chromium can be "active" with no key window.
/// Two process reads and two Accessibility reads: no event, no write.
struct KeyFocusReading: Equatable {
  let frontmost: Bool
  let keyFocusProcess: Bool
  /// Nil when the app's focused element (or its window) could not be read.
  let focusedInWindow: Bool?

  var holds: Bool { (frontmost || keyFocusProcess) && focusedInWindow == true }

  var wire: [String: Any] {
    ["holds": holds, "frontmost": frontmost, "keyFocusProcess": keyFocusProcess, "focusedInWindow": focusedInWindow ?? NSNull()]
  }
}

/// How the read wait ended: a hand-over, the provider released (the item replaced or the pasteboard cleared), its 2 s
/// run out, or the request's deadline first.
enum ReadOutcome: String {
  case handedOver, released, timeout, deadline
}

/// The restore's outcome: done, skipped because someone else wrote the pasteboard since the engine did, or not needed
/// since the pasteboard was never taken.
enum RestoreOutcome: String {
  case restored, skippedChanged, notTaken
}

/// One paste's value-free diagnostics (#187), for the last line the operation pasted or tried to (the one that failed,
/// or the last on success), carried in the input meta as `paste`: never the clipboard's contents, the field's text or
/// its reading. Times are milliseconds on the engine's monotonic clock; `readAfterPostMs` is signed, negative for a
/// read before ⌘V was posted (a clipboard manager's, say). The main thread serves the provider's hand-over, so
/// `mainLagMs` is how long a block queued on it at ⌘V waited to run (`mainLagOpen` while it had not run at the answer:
/// the lag is then at least the value).
struct PasteDiagnostics {
  var line: Int
  var lines: Int
  var notificationSource: NotificationSource
  var baselineEmpty: Bool
  var keyFocusAtPaste: KeyFocusReading? = nil
  var readWait: ReadOutcome? = nil
  var readWaitMs: Double? = nil
  var readAfterPostMs: Double? = nil
  /// An `EffectOutcome`'s name, or "deadline" when the request's deadline ended the wait before its 2 s.
  var effectWait: String? = nil
  var effectWaitMs: Double? = nil
  var mainLagMs: Double? = nil
  var mainLagOpen = false
  var restore: RestoreOutcome? = nil
  /// The wait the line reached: "read" once ⌘V was posted, "effect" once the read wait passed; nil before ⌘V.
  var stage: String? = nil
  /// Whether the line's effect was seen, once its effect stage ended (false also for an unconfirmed success).
  var confirmed: Bool? = nil
  /// The operation's lines so far that were pasted with no channel to see them, read after ⌘V (`PasteOutcome`).
  var unconfirmedLines = 0

  var wire: [String: Any] {
    var wire: [String: Any] = ["line": line, "lines": lines, "notificationSource": notificationSource.rawValue, "baselineEmpty": baselineEmpty]
    if let stage { wire["stage"] = stage }
    if let confirmed { wire["confirmed"] = confirmed }
    if unconfirmedLines > 0 { wire["unconfirmedLines"] = unconfirmedLines }
    if let keyFocusAtPaste { wire["keyFocusAtPaste"] = keyFocusAtPaste.wire }
    if let readWait { wire["readWait"] = readWait.rawValue }
    if let readWaitMs { wire["readWaitMs"] = rounded(readWaitMs) }
    if let readAfterPostMs { wire["readAfterPostMs"] = rounded(readAfterPostMs) }
    if let effectWait { wire["effectWait"] = effectWait }
    if let effectWaitMs { wire["effectWaitMs"] = rounded(effectWaitMs) }
    if let mainLagMs { wire["mainLagMs"] = rounded(mainLagMs) }
    if mainLagOpen { wire["mainLagOpen"] = true }
    if let restore { wire["restore"] = restore.rawValue }
    return wire
  }

  private func rounded(_ ms: Double) -> Double { (ms * 10).rounded() / 10 }
}

/// When a block queued on the main thread at ⌘V ran (the main thread's lag, `PasteDiagnostics.mainLagMs`).
private final class MainLag: @unchecked Sendable {
  private let lock = NSLock()
  private var ran: Double?
  var ranAt: Double? { lock.withLock { ran } }
  func mark(_ at: Double) { lock.withLock { ran = at } }
}

/// The operation over `parts`, the lock already held and the app already prepared: the snapshot first, then per part the
/// write, ⌘V and the two waits, or a Return press; the previous contents restored once anything was written, on every
/// path, while the change count is the engine's own. `entered` counts the units of the parts that landed. Both waits end
/// at `remainingMs` (the request's deadline from now) when it comes before their own time, with that stage's error;
/// `keyFocusAtPaste` is read just before each ⌘V and `mainProbe` queues the main-thread probe there, both for
/// `meta.paste` only. A line with no channel to see its effect (`EffectOutcome.noChannel`) counts as pasted, unconfirmed,
/// when its read came after ⌘V was posted (positive evidence of delivery, none against it), and is `pasteUnconfirmed`
/// when the only read came before (a foreign reader's: the provider is not asked again for the target).
@discardableResult
func runPaste(_ parts: [PastePart], pasteboard: PasteboardAccess, effect: PasteEffect, readTimeoutMs: Double = pasteReadTimeoutMs,
              remainingMs: () -> Double = { .infinity }, keyFocusAtPaste: () -> KeyFocusReading? = { nil },
              mainProbe: (@escaping @Sendable () -> Void) -> Void = { DispatchQueue.main.async(execute: $0) },
              checkInFlight: () throws -> Void, postPaste: () -> Bool, postReturn: () -> Bool,
              entered: inout Int, meta: inout InputMeta) throws -> PasteOutcome {
  let state = pasteboard.snapshot()
  let snapshot = state.items
  var own: Int?
  let lines = 1 + parts.filter { if case .returnKey = $0 { return true } else { return false } }.count
  var line = 1
  var outcome = PasteOutcome(pastedLines: 0, unconfirmedLines: 0)
  var probe: (postAt: Double, lag: MainLag)?
  /// The answer's diagnostics: the main thread's lag as of now, and the restore's outcome.
  func finish(_ restored: RestoreOutcome) {
    guard meta.paste != nil else { return }
    if let probe {
      let ran = probe.lag.ranAt
      meta.paste?.mainLagMs = (ran ?? effect.now()) - probe.postAt
      meta.paste?.mainLagOpen = ran == nil
    }
    meta.paste?.restore = restored
  }
  do {
    for part in parts {
      switch part {
      case .content(let representations, let units):
        let provider = LazyPasteProvider(representations) { effect.providerRead() }
        effect.begin()
        meta.paste = PasteDiagnostics(line: line, lines: lines, notificationSource: effect.notificationSource, baselineEmpty: effect.baselineEmpty,
                                      unconfirmedLines: outcome.unconfirmedLines)
        probe = nil
        guard let item = provider.item() else { throw clipboardWriteFailed }
        // The write takes the pasteboard only while it still holds what the engine last saw there (the snapshot's count
        // for the first line, its own write's for a later one), checked at the take itself: a human copy at any moment
        // before it, the baseline's reads included, stops the paste as the conflict, and the restore below, guarded by
        // the same count, leaves their contents alone.
        guard let write = pasteboard.write(item, expecting: own ?? state.changeCount) else { throw clipboardConflict }
        // Taking the pasteboard cleared it: the restore is armed from here, whether or not the item was written.
        own = write.own
        guard write.written else { throw clipboardWriteFailed }
        let written = write.own
        try checkInFlight()
        meta.paste?.keyFocusAtPaste = keyFocusAtPaste()
        effect.pasteStarted()
        let postAt = effect.now()
        let lag = MainLag()
        mainProbe { [effect] in lag.mark(effect.now()) }
        probe = (postAt, lag)
        guard meta.posting(postPaste) else { throw EngineError(name: "eventCreationFailed", "The paste key events could not be created.") }
        meta.paste?.stage = "read"

        // The read wait: its 2 s, or the request's deadline when that comes first.
        let readBudget = min(readTimeoutMs, max(0, remainingMs()))
        let readStart = effect.now()
        let handed = provider.waitForRead(timeoutMs: readBudget)
        meta.paste?.readWaitMs = effect.now() - readStart
        meta.paste?.readAfterPostMs = effect.firstReadAt.map { $0 - postAt }
        meta.paste?.readWait = handed ? (provider.read ? .handedOver : .released) : (readBudget < readTimeoutMs ? .deadline : .timeout)
        guard handed else { throw clipboardReadTimedOut }
        guard pasteboard.changeCount == written else { throw clipboardConflict }

        // The effect wait, bounded the same way.
        meta.paste?.stage = "effect"
        let effectBudget = min(pasteEffectTimeoutMs, max(0, remainingMs()))
        let effectStart = effect.now()
        let seen = effect.wait(timeoutMs: effectBudget)
        meta.paste?.effectWaitMs = effect.now() - effectStart
        meta.paste?.effectWait = seen == .timeout && effectBudget < pasteEffectTimeoutMs ? "deadline" : seen.rawValue
        let confirmed = seen == .notification || seen == .reading
        meta.paste?.confirmed = confirmed
        if !confirmed {
          // No channel, and the read came after ⌘V: pasted, unconfirmed. Anything else is unconfirmed as an error.
          guard seen == .noChannel, let after = meta.paste?.readAfterPostMs, after >= 0 else { throw pasteUnconfirmed }
          outcome.unconfirmedLines += 1
          meta.paste?.unconfirmedLines = outcome.unconfirmedLines
        }
        outcome.pastedLines += 1
        entered += units
      case .returnKey(let units):
        try checkInFlight()
        guard meta.posting(postReturn) else { throw EngineError(name: "eventCreationFailed", "A key event could not be created.") }
        entered += units
        line += 1
      }
    }
  } catch let error as EngineError {
    // A read or effect timeout with the count moved is the conflict (F §7.6): the user's copy, not the app's silence.
    let moved = own.map { pasteboard.changeCount != $0 } ?? false
    finish(restore(snapshot, own: own, on: pasteboard))
    throw moved && [clipboardReadTimedOut.errorName, pasteUnconfirmed.errorName].contains(error.errorName) ? clipboardConflict : error
  }
  finish(restore(snapshot, own: own, on: pasteboard))
  return outcome
}

/// A paste operation that answered success: the lines it pasted, and how many of them had no channel to see their
/// effect and were pasted on their read after ⌘V alone.
struct PasteOutcome: Equatable {
  var pastedLines: Int
  var unconfirmedLines: Int
}

/// The answer's text for a success with unconfirmed lines, which the service adds to the tool result's content (the
/// result's `note`); nil when every line's effect was seen.
func pasteUnconfirmedNote(_ outcome: PasteOutcome) -> String? {
  guard outcome.unconfirmedLines > 0 else { return nil }
  let tail = "but this field can't be read back, so the change couldn't be seen. Observe the field if the next step depends on it."
  if outcome.pastedLines <= 1 { return "Pasted, unconfirmed: the app read the text after ⌘V, " + tail }
  return "\(outcome.pastedLines) lines pasted, \(outcome.unconfirmedLines) unconfirmed: the app read each after ⌘V, " + tail
}

/// A paste-route result: the input meta, and the note when there is one (the result's `note`, which the service adds to
/// the tool result's content, since the facade returns nothing of an input's result to model code).
func pasteResult(_ meta: InputMeta, note: String?) -> [String: Any] {
  var result: [String: Any] = ["meta": meta.wire]
  if let note { result["note"] = note }
  return result
}

/// The restore (F §7.6): only after a write, and only while the pasteboard still holds what the engine wrote, which the
/// restore itself checks at its clear.
private func restore(_ snapshot: PasteboardSnapshot?, own: Int?, on pasteboard: PasteboardAccess) -> RestoreOutcome {
  guard let own else { return .notTaken }
  return pasteboard.restore(snapshot, expecting: own) ? .restored : .skippedChanged
}

/// type_text's paste-route error, for the two whose delivery is unknown, with what was confirmed: the units entered
/// of the text's, the lines before the failed one complete (how many of them unconfirmed, pasted on their read alone),
/// and that line's state unknown. Any other error is as is.
func typedPasteError(_ error: EngineError, entered: Int, total: Int, line: Int?, lines: Int?, unconfirmedLines: Int = 0) -> EngineError {
  guard [clipboardReadTimedOut.errorName, pasteUnconfirmed.errorName].contains(error.errorName) else { return error }
  let confirmed: String
  if let line, let lines, lines > 1 {
    let unconfirmed = unconfirmedLines > 0 ? ", \(unconfirmedLines) of them unconfirmed" : ""
    confirmed = " Confirmed entered: \(entered) of \(total) characters (\(line - 1) of \(lines) lines complete\(unconfirmed)); line \(line) is in an unknown state."
  } else {
    confirmed = " Confirmed entered: \(entered) of \(total) characters; the line being pasted is in an unknown state."
  }
  return EngineError(name: error.errorName, error.message + confirmed, extra: error.extra)
}

/// What the paste operates on, as the input method's checks found it: the app, its application element, the process that
/// owns its focused element (the keys' target) and the request's intervention guard.
struct PasteTarget {
  let app: ResolvedApp
  let pid: pid_t
  let application: AXUIElement
  let keyboard: pid_t
  let guarding: InterventionGuard
}

extension Engine {
  // MARK: paste

  /// `paste {app, text, format?, concealed?}`: the text in its format (RichText.swift) pasted into the app's focused
  /// element, reported as `inputRoute: "paste"`. A concealed request is refused before anything is touched: secrets
  /// never take the pasteboard, which clipboard managers poll and keep.
  func paste(_ args: [String: Any], _ context: ExecutionContext) throws -> Any {
    var meta = InputMeta(context)
    if (args["concealed"] as? NSNumber)?.boolValue == true {
      throw withMeta(EngineError(name: "concealedInputUnavailable",
                                 "Nothing was entered: a concealed value is never pasted. Use set_value on a settable element instead."), meta)
    }
    do {
      guard let text = args["text"] as? String else { throw EngineError.invalidArguments("Missing text to paste") }
      let format = try PasteFormat(wire: args["format"])
      let app = try resolveApp(args)
      guard let pid = app.pid else { throw EngineError(.runningApplicationNotFound, "Running application not found: \(app.displayName)") }
      try requireAccessibility()
      let guarding = interventionGuard(app: app, pid: pid, requestApp: args["app"] as? String, connection: context.connection)
      meta.apply(guarding)
      try guarding.checkBeforePosting()
      let application = prepare(AXUIElementCreateApplication(pid))
      let keyboard = keyboardTarget(application, fallback: pid)
      try refuseForbiddenOwner(keyboard)
      actionTargets(keyboard, app: app, connection: context.connection)
      // A minimized window takes no ⌘V (Minimized.swift): refused before the pasteboard is snapshotted or written.
      try refuseMinimizedKeyboardInput(application: application, app: app.displayName, ax: .live)
      // Converted before the app or the pasteboard is touched, so a conversion that fails changes nothing.
      let representations = try pasteRepresentations(text, format: format)
      var entered = 0
      let outcome = try pasteOperation([.content(representations, units: text.utf16.count)],
                                       PasteTarget(app: app, pid: pid, application: application, keyboard: keyboard, guarding: guarding),
                                       context, entered: &entered, meta: &meta)
      return pasteResult(meta, note: pasteUnconfirmedNote(outcome))
    } catch let error as EngineError {
      throw withMeta(error, meta)
    }
  }

  /// type_text's paste route, after type_text's own checks chose it: the text's lines pasted, its newlines pressed as
  /// Return, `entered` reported as a keyed type_text reports it, and in the sentence of an error whose delivery is
  /// unknown (`typedPasteError`). Answers the note of a success with unconfirmed lines (`pasteUnconfirmedNote`). Never
  /// reached by a concealed request.
  func typeTextByPaste(_ text: String, _ target: PasteTarget, _ context: ExecutionContext, meta: inout InputMeta) throws -> String? {
    var entered = 0
    defer { meta.entered = entered }
    do {
      return pasteUnconfirmedNote(try pasteOperation(pasteParts(typing: text), target, context, entered: &entered, meta: &meta))
    } catch let error as EngineError {
      throw typedPasteError(error, entered: entered, total: text.utf16.count, line: meta.paste?.line, lines: meta.paste?.lines,
                            unconfirmedLines: meta.paste?.unconfirmedLines ?? 0)
    }
  }

  /// The operation, holding the engine-wide lock: the app prepared by route 3's activation when it does not believe it
  /// has focus, then pasted into.
  @discardableResult
  func pasteOperation(_ parts: [PastePart], _ target: PasteTarget, _ context: ExecutionContext,
                      entered: inout Int, meta: inout InputMeta) throws -> PasteOutcome {
    meta.inputRoute = .paste
    return try withPasteLock(pasteLock, deadline: context.deadline) {
      // Waiting for the lock took time: a user event since the guard was read stops the paste before anything is done.
      try target.guarding.checkInFlight()
      // Route 3's activation leased for the paste (shared when a hold keeps the process active); every path out, error
      // or success, ends the lease. A guard that failed still says how long it held. The in-flight check runs again once
      // the registry's lock is held: a user event while the paste waited behind another holder's activation stops it
      // before its activation.
      let release = try heldActivations.acquire(pid: target.pid, beforeActivating: target.guarding.checkInFlight, make: {
        FakeActivation(pid: target.pid, window: primaryWindow(of: target.application) ?? target.application, system: pasteActivation)
      }, meta: &meta)
      defer { _ = release() }

      let application = target.application
      let effect = PasteEffect(readWithin: { effectReading(of: application, withinMs: $0) })
      let observer = NotificationObserver(pid: target.pid, names: ["AXSelectedTextChanged", "AXValueChanged"], keep: false) { _ in
        effect.notification()
      }
      defer { observer?.invalidate() }
      effect.observed(pasteNotificationSource(registered: observer != nil, app: target.app, pid: target.pid))
      defer { context.connection.markActed(target.app) }  // a paste stopped midway may have changed the app too
      // A press's four events go back to back, all of them, so its modifiers are always restored; it counts as posted
      // when any of them went.
      let poster = EventPoster.toProcess(target.keyboard)
      func press(_ key: KeyPress) -> Bool { keyPressEvents(key).map { poster.post($0) }.contains(true) }
      let window = primaryWindow(of: application)
      let system = pasteActivation
      return try runPaste(parts, pasteboard: pasteboardAccess(), effect: effect,
                   remainingMs: { Double(context.deadline - unixMilliseconds()) },
                   keyFocusAtPaste: { keyFocusReading(pid: target.pid, keyboard: target.keyboard, application: application, window: window, system: system) },
                   checkInFlight: target.guarding.checkInFlight,
                   postPaste: { press(commandV) }, postReturn: { press(KeyPress(keyCode: returnKeyCode, modifiers: [])) },
                   entered: &entered, meta: &meta)
    }
  }

  /// The paste's notification source (`notificationSource`): a Chromium or Electron app's observer is trusted only while
  /// #244's enablement holds for the process generation (`WebAccessibility.enablementHolds`).
  func pasteNotificationSource(registered: Bool, app: ResolvedApp, pid: pid_t) -> NotificationSource {
    guard registered else { return .none }
    let chromium = webAccessibility.isChromiumFamily(app.appPath)
    let holds = chromium && webAccessibility.enablementHolds(pid: pid, launched: processGeneration(launchDate: app.running?.launchDate, pid: pid))
    return notificationSource(registered: true, chromiumFamily: chromium, enablementHolds: holds)
  }
}

/// The 3a predicate's inputs (`KeyFocusReading`) as they stand now: the frontmost app and the key-focus process from
/// route 3's system (its stubs in the unit tests), and whether the app's focused element's window is `window`.
func keyFocusReading(pid: pid_t, keyboard: pid_t, application: AXUIElement, window: AXUIElement?, system: ActivationSystem) -> KeyFocusReading {
  let focus = system.keyFocus()
  var inWindow: Bool?
  if let window, let focused = elementAttribute(application, kAXFocusedUIElementAttribute) {
    inWindow = CFEqual(focused, window) ? true : elementAttribute(focused, kAXWindowAttribute).map { CFEqual($0, window) }
  }
  return KeyFocusReading(frontmost: system.frontmost() == pid, keyFocusProcess: focus == pid || focus == keyboard, focusedInWindow: inWindow)
}

/// ⌘V as the vendor sends it: `super+v` through the key table (F §7.3).
private let commandV = KeyPress(keyCode: 0x09, modifiers: .command)

/// The application's focused element's selected range and character count (F §7.1's baseline), each where supported.
/// Bounded by `withinMs` (the effect wait's time left, #187 review): each of its three requests gets the time left then
/// as its messaging timeout (`boundedMessagingTimeout`), and nil is answered, with no request sent, once it is spent.
/// The application element's usual timeout is put back after.
func effectReading(of application: AXUIElement, withinMs budget: Double = .infinity) -> EffectReading? {
  let end = monotonicMilliseconds() + budget
  func bound(_ element: AXUIElement) -> Bool {
    guard budget.isFinite else { return true }
    guard let timeout = boundedMessagingTimeout(leftMs: end - monotonicMilliseconds()) else { return false }
    AXUIElementSetMessagingTimeout(element, timeout)
    return true
  }
  defer { if budget.isFinite { AXUIElementSetMessagingTimeout(application, elementMessagingTimeout) } }
  guard bound(application) else { return nil }
  guard let focused = elementAttribute(application, kAXFocusedUIElementAttribute) else { return EffectReading() }
  var reading = EffectReading()
  guard bound(focused) else { return nil }
  if let range = rangeWire(attribute(focused, kAXSelectedTextRangeAttribute)), let location = range["location"], let length = range["length"] {
    reading.range = [location, length]
  }
  guard bound(focused) else { return nil }
  reading.characters = (attribute(focused, kAXNumberOfCharactersAttribute) as? NSNumber)?.intValue
  return reading
}
