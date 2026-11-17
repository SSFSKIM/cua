import ApplicationServices
import Foundation

// set_value (R/F-helper-logic.md §16.4, R/sky-behaviour.md §16; the Decision Log's M2a vendor reading, item 4): the
// element scrolled into view, its AXValue checked settable, the field focused (focusFieldIfNeeded), the string coerced
// to the type of the element's current value, written through AXValue, and the element kept resolvable by its new
// value (the vendor re-fetches ignoring the value; the value is not read back or compared). No search-field
// auto-submit: the vendor turns it off for a node_repl-class client, cua's kind. Route 1, or route 3 when the app does not
// believe it has focus (its activation held, FocusHold.swift): nothing is posted to the field unless the focus fallback
// clicks. A concealed request (a substituted secret) goes the same way; no sentence here ever carries the
// value. Within the window of a posted pointer press to the app (#359, ClickOrdering.swift), the field's range is let
// settle before the write and the field is watched after it: a value other than the one written, or a caret off its
// end, is valueUnconfirmed. A background Chromium page's field that needs focus takes no hold and no fallback click,
// and its value is read back after the write (#390, ValueWithoutFocus.swift).

/// The type a set_value string is coerced to (`stringValueConversionType` 0x1006d4254).
enum ValueKind: Equatable { case float, integer, boolean, string, date }

/// The kind of the element's current value: a switch or toggle checkbox is Boolean whatever it holds; a CFBoolean is
/// Boolean, a CFNumber float or integer by `CFNumberIsFloatType`, a string or attributed string a string, a CFDate a
/// date; no value is a string for a text field or text area; nil (unsupported) otherwise.
func valueKind(of current: CFTypeRef?, role: String, subrole: String?) -> ValueKind? {
  if role == kAXCheckBoxRole, subrole == "AXSwitch" || subrole == "AXToggle" { return .boolean }
  guard let current else { return role == kAXTextFieldRole || role == kAXTextAreaRole ? .string : nil }
  let type = CFGetTypeID(current)
  if type == CFBooleanGetTypeID() { return .boolean }
  if type == CFNumberGetTypeID() { return CFNumberIsFloatType((current as! CFNumber)) ? .float : .integer }
  if type == CFStringGetTypeID() || type == CFAttributedStringGetTypeID() { return .string }
  if type == CFDateGetTypeID() { return .date }
  return nil
}

/// `value` as the element takes it (`setStringValue` 0x1006d4f08): numbers through an en_US decimal NumberFormatter,
/// written as parsed (no rounding or clamping); Booleans from `on`/`off`, else NSString's boolValue (`true`, `yes`, a
/// leading non-zero digit); a date as ISO 8601 (the vendor's date parse was not read: cua's choice). The refusals never
/// carry the value.
func coercedValue(_ value: String, to kind: ValueKind?) throws -> CFTypeRef {
  switch kind {
  case .float?, .integer?:
    let formatter = NumberFormatter()
    formatter.numberStyle = .decimal
    formatter.locale = Locale(identifier: "en_US")
    guard let number = formatter.number(from: value) else {
      throw EngineError(name: "invalidNumber", "The value is not a number, and this element takes a number.")
    }
    return number
  case .boolean?:
    switch value.lowercased() {
    case "on": return kCFBooleanTrue
    case "off": return kCFBooleanFalse
    default: return (value as NSString).boolValue ? kCFBooleanTrue : kCFBooleanFalse
    }
  case .string?:
    return value as CFString
  case .date?:
    guard let date = ISO8601DateFormatter().date(from: value) else {
      throw EngineError(name: "invalidDate", "The value is not an ISO 8601 date, and this element takes a date.")
    }
    return date as CFDate
  case nil:
    throw EngineError(name: "unsupportedValueType", "Cannot set a value for this element: its current value has a type set_value does not convert to.")
  }
}

let valueNotSettable = EngineError(name: "valueNotSettable", "Cannot set a value for an element that is not settable")

/// set_value once its element is resolved and scrolled into view: the settable check, the focus (`focus`, which may
/// click), the coercion, `beforeWrite` (#359's wait for a pending click), the in-flight intervention check, the write,
/// and once it was accepted `afterWrite` with the value written (#359's watch). The app counts as acted on (`acted`) once
/// the write was made, accepted or not.
///
/// #390: `withoutFocus`, for a write made without the focus fallback (`ValueFocusPlan.withoutFallback`), refuses a write
/// the field does not accept with its refusal, and reads an accepted one back before `afterWrite`, the record in the
/// meta; answers the read-back, which the caller turns into its answer once its re-check has run
/// (`unfocusedValueAnswer`). Nil otherwise.
@discardableResult
func setElementValue(_ value: String, on element: AXUIElement, role: String, ax: AXOps, meta: inout InputMeta,
                     focus: (inout InputMeta) throws -> Void, beforeWrite: (inout InputMeta) -> Void = { _ in },
                     afterWrite: (CFTypeRef, inout InputMeta) -> Void = { _, _ in },
                     checkInFlight: () throws -> Void, acted: () -> Void,
                     withoutFocus: UnfocusedValueWrite? = nil) throws -> UnfocusedValueReadback? {
  guard ax.isSettable(element, kAXValueAttribute) else { throw valueNotSettable }
  try focus(&meta)
  let converted = try coercedValue(value, to: valueKind(of: ax.read(element, kAXValueAttribute), role: role, subrole: ax.subrole(element)))
  beforeWrite(&meta)
  try checkInFlight()
  var written = AXError.failure
  meta.posting { written = ax.write(element, kAXValueAttribute, converted); return true }
  acted()
  guard written == .success else { throw withoutFocus?.refusal ?? EngineError(name: "actionFailed", "The element did not accept the value.") }
  let readback = withoutFocus.map { $0.readBack(converted) }
  if let readback { meta.unfocusedValue = readback }
  afterWrite(converted, &meta)
  return readback
}

/// #359's watch after an accepted write within the window of a posted pointer press (ruling 785, item 3), over a text
/// field's string only: nil for a password field (never read), any other role or a value that is not a string. A
/// concealed request's value is never read: only its caret is, against the written length.
func writtenValueWatch(_ converted: CFTypeRef, role: String?, subrole: SubroleRead, concealed: Bool,
                       watch: (_ written: String?, _ length: Int) -> WrittenValueWatch) -> WrittenValueWatch? {
  guard CFGetTypeID(converted) == CFStringGetTypeID(), let role, typeReadbackTextRoles.contains(role),
        !secureTextField(role: role, subrole: subrole) else { return nil }
  let text = converted as! String
  return watch(concealed ? nil : text, (text as NSString).length)
}

/// set_value's re-check after an accepted write (`refetch`): a re-fetch that fails, whatever its refusal (the element
/// gone, or its metadata changed since it was read, as a Chromium field's placeholder does when the complete mode
/// arrives, ruling 772), is `valueUnconfirmed`, never a refusal: the value was sent.
func confirmingWrittenValue(app: String, _ refetch: () throws -> Void) throws {
  do {
    try refetch()
  } catch is EngineError {
    throw valueUnconfirmed(app: app)
  }
}

/// Whether the watch after set_value's write reads the field no further (#359, the review of ef998db6, P2): its role
/// unreadable, or it is a password field by role or subrole, or its subrole cannot be read (`secureTextField` fails
/// closed).
func writtenValueFieldClosed(role: String?, subrole: SubroleRead) -> Bool {
  guard let role else { return true }
  return secureTextField(role: role, subrole: subrole)
}

/// The answer of a set_value whose value was written and accepted but whose field could not be found again to confirm
/// it (ruling 772), of the family that says "sent, effect not seen" (`clickUnconfirmed`, `scrollUnconfirmed`,
/// `menuUnconfirmed`); with `drift`, one whose field moved off what was written just after, within the window of a
/// posted click (#359, ruling 785). No sentence carries the value.
func valueUnconfirmed(app: String, drift: WrittenValueDrift? = nil) -> EngineError {
  let why: String
  switch drift {
  case nil: why = "the field could not be found again to confirm it"
  case .valueChanged?: why = "the field read another value just after, as when a click sent just before lands late"
  case .caretMoved?: why = "the field's caret moved off the end of the new value just after, as a click sent just before does when it lands late, so typing now could go elsewhere in the field"
  case .fieldClosed?: why = "the field turned into a password field or could no longer be read just after, while a click sent just before may still have been landing, so it was not read to confirm the value"
  }
  return EngineError(name: "valueUnconfirmed",
    "The value was sent to \(app) and accepted, but \(why). Observe the app (take a screenshot or call getAXState()) before any retry, and never retry blindly.")
}

extension Engine {
  /// `set_value {app, element, value, concealed?}`.
  func setValue(_ args: [String: Any], _ context: ExecutionContext) throws -> Any {
    guard let value = args["value"] as? String else { throw EngineError.invalidArguments("value is required") }
    let token = try requiredElementToken(args, context, method: "set_value")

    var meta = InputMeta(context)
    do {
      let (app, appPid, guarding) = try inputPrologue(args, context, meta: &meta)
      let resolved = try targetElement(token, app: app, appPid: appPid, context: context)
      meta.inputRoute = .action
      let target = try positionedTarget(resolved, token: token, app: app, appPid: appPid, context: context, guarding: guarding)
      // Once the element is known settable: route 3's held activation when the app does not believe it has focus
      // (FocusHold.swift), before the focus, so a focusing click finds the app believing itself active.
      let route = actionRoute(for: target, app: app, connection: context.connection)
      // #390: a background Chromium page's field that needs focus takes neither the hold nor the fallback click, which
      // shared mode would refuse; its AXFocused write alone, then the value, read back.
      let element = target.element
      let engine = webAccessibility.pageEngine(app.appPath)
      let plan = valueFocusPlan(element, needsFocus: fieldNeedingFocus(element, ax: .live), engine: engine, desktop: context.connection.desktop,
                                route: route, foregroundOverride: routeFourOverride(app.bundleIdentifier, routes: routes),
                                roleOf: { attribute($0, kAXRoleAttribute) as? String }, parent: { elementAttribute($0, kAXParentAttribute) })
      let concealed = (args["concealed"] as? NSNumber)?.boolValue ?? false
      let withoutFocus = plan != .withoutFallback ? nil : UnfocusedValueWrite(refusal: backgroundClickRefused(app.displayName, engine: engine)) { written in
        signposted("setValue.unfocusedReadback") {
          unfocusedValueReadback(written, concealed: concealed, closed: {
            // Classified before every read: a password field, or one that cannot be classified, is never read.
            let role = stringAttribute(element, kAXRoleAttribute)
            return role == nil || secureTextField(role: role, subrole: subroleRead(element))
          }, value: { attribute(element, kAXValueAttribute) }, now: monotonicMilliseconds, sleep: { usleep(UInt32(max(0, $0) * 1000)) })
        }
      }
      let pids = [appPid, target.owner]
      // #359 (ruling 785): within the window of a pointer press posted to the app (an earlier click, or the focus's own
      // fallback click), the field's range is let settle before the write, and the field is watched after it. #390's
      // route posts none of its own, so only an earlier click arms the window there.
      var pending = false
      var drift: WrittenValueDrift?
      let readback = try setElementValue(value, on: element, role: target.entry.identity.role, ax: .live, meta: &meta,
                          focus: { meta in
                            try prepareValueFocus(plan, focusWrite: {
                              try focusFieldIfNeeded(element, bundleIdentifier: app.bundleIdentifier, ax: .live, beforeMutating: guarding.checkInFlight) {}
                            }, hold: {
                              try holdElementFocus(target, app: app, appPid: appPid, guarding: guarding, context: context, meta: &meta)
                            }, focusField: {
                              try focusField(target, app: app, appPid: appPid, guarding: guarding, context: context, meta: &meta)
                            })
                          },
                          beforeWrite: { meta in
                            pending = clickOrdering.pointerPending(pids: pids)
                            awaitPendingClick(on: target.element, pids: pids, meta: &meta)
                          },
                          afterWrite: { converted, meta in
                            guard pending else { return }
                            let watched = signposted("clickOrdering.valueWatch") {
                              writtenValueWatch(converted, role: stringAttribute(element, kAXRoleAttribute), subrole: subroleRead(element),
                                                concealed: concealed) { written, length in
                                watchWrittenValue(written: written, length: length, closed: {
                                  // Re-classified before every read: a field that turned secure or cannot be read is read no further.
                                  writtenValueFieldClosed(role: stringAttribute(element, kAXRoleAttribute), subrole: subroleRead(element))
                                }, value: { stringAttribute(element, kAXValueAttribute) },
                                                  range: {
                                  guard let wire = rangeWire(attribute(element, kAXSelectedTextRangeAttribute)), let location = wire["location"],
                                        let length = wire["length"] else { return nil }
                                  return NSRange(location: location, length: length)
                                }, now: monotonicMilliseconds, sleep: { usleep(UInt32(max(0, $0) * 1000)) })
                              }
                            }
                            guard let watched else { return }
                            if meta.pendingClick == nil { meta.pendingClick = PendingClickRecord() }
                            meta.pendingClick?.watch = watched
                            drift = watched.drift
                          },
                          checkInFlight: guarding.checkInFlight, acted: { context.connection.markActed(app) }, withoutFocus: withoutFocus)
      // The write was accepted (setElementValue throws otherwise): the cursor points at the element, read after the write.
      cursor.act(connection: context.connection.id, app: app.key, window: nil, .element(target.element, storedFrame: target.entry.frame))
      // The vendor's re-check after the write: a re-fetch matching without the value, whose result replaces the stored
      // handle and identity. A failed one is valueUnconfirmed (ruling 772): the write went, accepted, but the field could
      // not be found again to confirm it (the interval says it was made).
      try confirmingWrittenValue(app: app.displayName) {
        _ = try context.connection.element(token, app: app, lineage: context.lineage ?? "", refetch: .ignoringValue) { ElementResolver.live($0, pid: appPid) }
      }
      // #359: after the re-fetch, which keeps the token resolvable, never ok over a field that moved off the write.
      if let drift { throw valueUnconfirmed(app: app.displayName, drift: drift) }
      // #390: nor over an unfocused write not read back as written.
      if let readback, let unconfirmed = unfocusedValueAnswer(readback, app: app.displayName) { throw unconfirmed }
      return ["meta": meta.wire]
    } catch let error as EngineError {
      throw withMeta(error, meta)
    }
  }
}
