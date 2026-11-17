import ApplicationServices
import Foundation

// #390: set_value on a background Chromium page's text field, written without the focus preparation that would be
// refused. Main's order there is route 3's focus hold (a fake activation and its inert click), focusFieldIfNeeded's
// AXFocused write, which Chromium applies but reads back only 65 to 142 ms later (#283), so the immediate re-read is
// false, then its fallback click, which shared mode refuses in a Chromium web area (#282): backgroundClickRefused before
// any write. #366's probe (smoke 44016387589) found the write itself delivers on such a field (2/2, 121 to 130 ms).
//
// So a field that needs focus, inside an AXWebArea of a Chromium-family process (Chrome, Electron) that does not
// believe it has focus, in shared mode and with no route-4 override for the app, takes route 1 alone: the AXFocused
// write (#283's carrier, which focuses such a field with no pointer event and no raise), never the hold or the fallback
// click, then the value's write, then the value read back. Only a read of the value as written answers ok. A write the
// field does not accept is refused as main refused it (nothing landed); one accepted but not read back as written, or not
// read at all (a concealed request, a password field), answers valueUnconfirmed. Every other field, app, route and
// device mode keeps main's preparation unchanged.

/// How set_value prepares its field before the write (#390).
enum ValueFocusPlan: Equatable {
  /// Main's: route 3's focus hold first when the app does not believe it has focus (`hold`), then focusField, its
  /// AXFocused write and its fallback click.
  case prepared(hold: Bool)
  /// A background Chromium page's text field (`valueFocusPlan`): focusFieldIfNeeded's AXFocused write alone, by route 1,
  /// with no hold and no fallback click, and the value read back after its write (`unfocusedValueReadback`).
  case withoutFallback
}

/// The plan for `field`, `needsFocus` its role when it needs focusing (`fieldNeedingFocus`, nil otherwise): without the
/// fallback only for a field that needs focus, inside an AXWebArea by its parents (`webAreaAncestry`), in a Chromium
/// process, by route 3 (the app does not believe it has focus), in shared mode and with no route-4 override, where
/// main's fallback click would be refused. Main's otherwise, the hold by `route`.
func valueFocusPlan<Element>(_ field: Element, needsFocus: String?, engine: PageEngine, desktop: DesktopMode, route: InputRoute,
                             foregroundOverride: Bool, roleOf: (Element) -> String?, parent: (Element) -> Element?) -> ValueFocusPlan {
  let main = ValueFocusPlan.prepared(hold: route == .activation)
  guard needsFocus != nil, engine == .chromium, route == .activation, desktop == .shared, !foregroundOverride else { return main }
  guard case .success = webAreaAncestry(above: field, role: roleOf, parent: parent) else { return main }
  return .withoutFallback
}

/// Runs `plan`'s preparation: `focusWrite` alone without the fallback; else `hold` when the plan holds, then `focusField`.
func prepareValueFocus(_ plan: ValueFocusPlan, focusWrite: () throws -> Void, hold: () throws -> Void,
                       focusField: () throws -> Void) rethrows {
  switch plan {
  case .withoutFallback:
    try focusWrite()
  case .prepared(let holds):
    if holds { try hold() }
    try focusField()
  }
}

/// What the read-back after an unfocused write found (the meta's `unfocusedValue.result`). Only `confirmed` is ok.
enum UnfocusedValueResult: String, Equatable {
  /// The field read the value as written.
  case confirmed
  /// The field read a value, never the one written within the budget.
  case mismatch
  /// Its last read sat at Chromium's cap (`readbackMayBeTruncated`), as type_text's read-back counts it: the field may
  /// hold more than the read shows, so the read confirms nothing, even one equal to the value written.
  case possiblyTruncated
  /// No read answered a value.
  case unreadable
  /// A concealed request (a substituted secret): never read back.
  case concealed
  /// A password field, or one whose role or subrole could not be read: never read.
  case passwordField
}

/// The read-back's record: its result, reads and time. It never carries the value or its length.
struct UnfocusedValueReadback: Equatable {
  var result: UnfocusedValueResult
  var reads = 0
  var ms: Double = 0

  var wire: [String: Any] { ["result": result.rawValue, "reads": reads, "ms": (ms * 10).rounded() / 10] }
}

/// The read-back after an accepted unfocused write of `written` (the coerced value): a concealed request reads nothing;
/// otherwise the field is classified before every read (`closed`: a password field, or a role or subrole that cannot be
/// read, is read no further) and its value read (`value`) every `sampleMs` until it reads as written
/// (`writtenValueMatches`) or a further read would fall past `budgetMs` (type_text's read-back poll: Chromium applies
/// the write to its tree asynchronously).
func unfocusedValueReadback(_ written: CFTypeRef, concealed: Bool, closed: () -> Bool, value: () -> CFTypeRef?,
                            now: () -> Double, sleep: (Double) -> Void, budgetMs: Double = typeReadbackBudgetMs,
                            sampleMs: Double = typeReadbackPollIntervalMs) -> UnfocusedValueReadback {
  if concealed { return UnfocusedValueReadback(result: .concealed) }
  let started = now()
  var readback = UnfocusedValueReadback(result: .unreadable)
  while true {
    if closed() {
      readback.result = .passwordField
      break
    }
    let found = value()
    readback.reads += 1
    if writtenValueMatches(found, written) {
      readback.result = .confirmed
      break
    }
    if found != nil { readback.result = writtenValueCut(found, written) ? .possiblyTruncated : .mismatch }
    if now() - started + sampleMs > budgetMs { break }
    sleep(sampleMs)
  }
  readback.ms = now() - started
  return readback
}

/// Whether a value read is the value written, exactly: a string written equal in UTF-16 units to a string or an
/// attributed string read; any other value (a number, a Boolean, a date) by CFEqual. Nothing read is no match. Unlike
/// #359's watch (ClickOrdering.swift `writtenValueRead`), a read at Chromium's cap never counts, shorter or equal
/// (`writtenValueCut`): here the read is the only proof the write landed, and such a read cannot show the field holds
/// no more than it.
func writtenValueMatches(_ found: CFTypeRef?, _ written: CFTypeRef) -> Bool {
  guard let found else { return false }
  guard CFGetTypeID(written) == CFStringGetTypeID() else { return CFEqual(found, written) }
  guard let text = readText(found), !readbackMayBeTruncated(text) else { return false }
  return text.utf16.elementsEqual((written as! String).utf16)
}

/// Whether a string written was read as a string at Chromium's cap (`readbackMayBeTruncated`), whatever it holds.
func writtenValueCut(_ found: CFTypeRef?, _ written: CFTypeRef) -> Bool {
  guard let found, CFGetTypeID(written) == CFStringGetTypeID(), let text = readText(found) else { return false }
  return readbackMayBeTruncated(text)
}

/// A string or an attributed string read, as text; nil for any other value.
private func readText(_ found: CFTypeRef) -> String? {
  switch CFGetTypeID(found) {
  case CFStringGetTypeID(): return (found as! String)
  case CFAttributedStringGetTypeID(): return (found as! NSAttributedString).string
  default: return nil
  }
}

/// The unfocused write's terms for `setElementValue`: the refusal a write the field does not accept answers (main's
/// own, `backgroundClickRefused`: nothing landed), and the read-back after an accepted one.
struct UnfocusedValueWrite {
  let refusal: EngineError
  let readBack: (_ written: CFTypeRef) -> UnfocusedValueReadback
}

/// The answer of an unfocused write once the value was sent and accepted: nil when it read back as written (ok), else
/// `valueUnconfirmed`, saying why it is not confirmed. No sentence carries the value.
func unfocusedValueAnswer(_ readback: UnfocusedValueReadback, app: String) -> EngineError? {
  let why: String
  switch readback.result {
  case .confirmed: return nil
  case .mismatch: why = "the field does not read back as written"
  case .possiblyTruncated: why = "the field holds more text than accessibility reports in full"
  case .unreadable: why = "the field's value could not be read back"
  case .concealed: why = "a concealed value is never read back"
  case .passwordField: why = "it is a password field, whose value is never read"
  }
  return EngineError(name: "valueUnconfirmed",
    "The value was sent to \(app) and accepted without a click to focus the field, which \(app)'s web page does not take in the background, but \(why), so it is not confirmed. Observe the app (take a screenshot or call getAXState()) before any retry, and never retry blindly.")
}
