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
// The sentences are the vendor's. The settle runs at the next observation (markActed), as every action's.
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
/// The effect wait with neither an observer nor a baseline: a fixed pause (FUN_10007f76c).
let pasteBlindEffectMs: Double = 100

let clipboardReadTimedOut = EngineError(name: "clipboardReadTimedOut", "Timed out waiting for the application to read the clipboard")
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

/// The effect wait of one paste (F §7.5): an observer's notification counts once the app was handed the data and ⌘V was
/// posted; otherwise a change of the reading against its baseline. `read` and the clock are replaceable for the tests.
final class PasteEffect: @unchecked Sendable {
  private var hasObserver: Bool
  private let read: () -> EffectReading
  private let now: () -> Double
  private let sleep: (Double) -> Void
  private let lock = NSLock()
  private var handedOver = false
  private var started = false
  private var seen = false
  private var baseline = EffectReading()

  init(hasObserver: Bool, read: @escaping () -> EffectReading, now: @escaping () -> Double = monotonicMilliseconds,
       sleep: @escaping (Double) -> Void = { usleep(UInt32(max(0, $0) * 1000)) }) {
    self.hasObserver = hasObserver
    self.read = read
    self.now = now
    self.sleep = sleep
  }

  /// Before a write: the baseline taken, the flags reset.
  func begin() {
    let reading = read()
    lock.lock()
    handedOver = false
    started = false
    seen = false
    baseline = reading
    lock.unlock()
  }

  /// An observer now reports to this watch (`notification`).
  func observed() { locked { hasObserver = true } }
  func providerRead() { locked { handedOver = true } }
  func pasteStarted() { locked { started = true } }
  /// An observed `AXSelectedTextChanged` or `AXValueChanged`.
  func notification() { locked { if handedOver && started { seen = true } } }

  /// Polls for the effect; false when `timeoutMs` passes without one. With neither an observer nor a baseline there is
  /// nothing to watch, and the wait is a fixed pause.
  func wait(timeoutMs: Double = pasteEffectTimeoutMs, intervalMs: Double = pasteEffectIntervalMs) -> Bool {
    let (baseline, observed) = locked { (self.baseline, hasObserver) }
    guard observed || !baseline.isEmpty else {
      sleep(pasteBlindEffectMs)
      return true
    }
    let start = now()
    while true {
      if locked({ seen }) || (!baseline.isEmpty && read() != baseline) { return true }
      if now() - start >= timeoutMs { return false }
      sleep(intervalMs)
    }
  }

  private func locked<T>(_ body: () -> T) -> T {
    lock.lock()
    defer { lock.unlock() }
    return body()
  }
}

/// The operation over `parts`, the lock already held and the app already prepared: the snapshot first, then per part the
/// write, ⌘V and the two waits, or a Return press; the previous contents restored once anything was written, on every
/// path, while the change count is the engine's own. `entered` counts the units of the parts that landed.
func runPaste(_ parts: [PastePart], pasteboard: PasteboardAccess, effect: PasteEffect, readTimeoutMs: Double = pasteReadTimeoutMs,
              checkInFlight: () throws -> Void, postPaste: () -> Bool, postReturn: () -> Bool,
              entered: inout Int, meta: inout InputMeta) throws {
  let state = pasteboard.snapshot()
  let snapshot = state.items
  var own: Int?
  do {
    for part in parts {
      switch part {
      case .content(let representations, let units):
        let provider = LazyPasteProvider(representations) { effect.providerRead() }
        effect.begin()
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
        effect.pasteStarted()
        guard meta.posting(postPaste) else { throw EngineError(name: "eventCreationFailed", "The paste key events could not be created.") }
        guard provider.waitForRead(timeoutMs: readTimeoutMs) else { throw clipboardReadTimedOut }
        guard pasteboard.changeCount == written else { throw clipboardConflict }
        guard effect.wait() else { throw clipboardReadTimedOut }
        entered += units
      case .returnKey(let units):
        try checkInFlight()
        guard meta.posting(postReturn) else { throw EngineError(name: "eventCreationFailed", "A key event could not be created.") }
        entered += units
      }
    }
  } catch let error as EngineError {
    // A read timeout with the count moved is the conflict (F §7.6): the user's copy, not the app's silence.
    let moved = own.map { pasteboard.changeCount != $0 } ?? false
    restore(snapshot, own: own, on: pasteboard)
    throw moved && error.errorName == clipboardReadTimedOut.errorName ? clipboardConflict : error
  }
  restore(snapshot, own: own, on: pasteboard)
}

/// The restore (F §7.6): only after a write, and only while the pasteboard still holds what the engine wrote, which the
/// restore itself checks at its clear.
private func restore(_ snapshot: PasteboardSnapshot?, own: Int?, on pasteboard: PasteboardAccess) {
  guard let own else { return }
  pasteboard.restore(snapshot, expecting: own)
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
      // Converted before the app or the pasteboard is touched, so a conversion that fails changes nothing.
      let representations = try pasteRepresentations(text, format: format)
      var entered = 0
      try pasteOperation([.content(representations, units: text.utf16.count)],
                         PasteTarget(app: app, pid: pid, application: application, keyboard: keyboard, guarding: guarding),
                         context, entered: &entered, meta: &meta)
      return ["meta": meta.wire]
    } catch let error as EngineError {
      throw withMeta(error, meta)
    }
  }

  /// type_text's paste route, after type_text's own checks chose it: the text's lines pasted, its newlines pressed as
  /// Return, `entered` reported as a keyed type_text reports it. Never reached by a concealed request.
  func typeTextByPaste(_ text: String, _ target: PasteTarget, _ context: ExecutionContext, meta: inout InputMeta) throws {
    var entered = 0
    defer { meta.entered = entered }
    try pasteOperation(pasteParts(typing: text), target, context, entered: &entered, meta: &meta)
  }

  /// The operation, holding the engine-wide lock: the app prepared by route 3's activation when it does not believe it
  /// has focus, then pasted into.
  private func pasteOperation(_ parts: [PastePart], _ target: PasteTarget, _ context: ExecutionContext,
                              entered: inout Int, meta: inout InputMeta) throws {
    meta.inputRoute = .paste
    try withPasteLock(pasteLock, deadline: context.deadline) {
      // Waiting for the lock took time: a user event since the guard was read stops the paste before anything is done.
      try target.guarding.checkInFlight()
      let activation = FakeActivation(pid: target.pid, window: primaryWindow(of: target.application) ?? target.application)
      defer { activation.deactivate() }  // every path out, error or success, undoes the activation
      try activation.activate()
      meta.activationGuardMs = activation.guardMs

      let application = target.application
      let effect = PasteEffect(hasObserver: false, read: { effectReading(of: application) })
      let observer = NotificationObserver(pid: target.pid, names: ["AXSelectedTextChanged", "AXValueChanged"], keep: false) { _ in
        effect.notification()
      }
      defer { observer?.invalidate() }
      if observer != nil { effect.observed() }
      defer { context.connection.markActed(target.app) }  // a paste stopped midway may have changed the app too
      // A press's four events go back to back, all of them, so its modifiers are always restored; it counts as posted
      // when any of them went.
      let poster = EventPoster.toProcess(target.keyboard)
      func press(_ key: KeyPress) -> Bool { keyPressEvents(key).map { poster.post($0) }.contains(true) }
      try runPaste(parts, pasteboard: pasteboardAccess(), effect: effect, checkInFlight: target.guarding.checkInFlight,
                   postPaste: { press(commandV) }, postReturn: { press(KeyPress(keyCode: returnKeyCode, modifiers: [])) },
                   entered: &entered, meta: &meta)
    }
  }
}

/// ⌘V as the vendor sends it: `super+v` through the key table (F §7.3).
private let commandV = KeyPress(keyCode: 0x09, modifiers: .command)

/// The application's focused element's selected range and character count (F §7.1's baseline), each where supported.
func effectReading(of application: AXUIElement) -> EffectReading {
  guard let focused = elementAttribute(application, kAXFocusedUIElementAttribute) else { return EffectReading() }
  var reading = EffectReading()
  if let range = rangeWire(attribute(focused, kAXSelectedTextRangeAttribute)), let location = range["location"], let length = range["length"] {
    reading.range = [location, length]
  }
  reading.characters = (attribute(focused, kAXNumberOfCharactersAttribute) as? NSNumber)?.intValue
  return reading
}
