import ApplicationServices
import Foundation

// set_value (R/F-helper-logic.md §16.4, R/sky-behaviour.md §16; the Decision Log's M2a vendor reading, item 4): the
// element scrolled into view, its AXValue checked settable, the field focused (focusFieldIfNeeded), the string coerced
// to the type of the element's current value, written through AXValue, and the element kept resolvable by its new
// value (the vendor re-fetches ignoring the value; the value is not read back or compared). No search-field
// auto-submit: the vendor turns it off for a node_repl-class client, cua's kind. Route 1, or route 3 when the app does not
// believe it has focus (its activation held, FocusHold.swift): nothing is posted to the field unless the focus fallback
// clicks. A concealed request (a substituted secret) goes the same way; no sentence here ever carries the
// value.

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
/// click), the coercion, the in-flight intervention check, the write. The app counts as acted on (`acted`) once the
/// write was made, accepted or not.
func setElementValue(_ value: String, on element: AXUIElement, role: String, ax: AXOps, meta: inout InputMeta,
                     focus: (inout InputMeta) throws -> Void, checkInFlight: () throws -> Void, acted: () -> Void) throws {
  guard ax.isSettable(element, kAXValueAttribute) else { throw valueNotSettable }
  try focus(&meta)
  let converted = try coercedValue(value, to: valueKind(of: ax.read(element, kAXValueAttribute), role: role, subrole: ax.subrole(element)))
  try checkInFlight()
  var written = AXError.failure
  meta.posting { written = ax.write(element, kAXValueAttribute, converted); return true }
  acted()
  guard written == .success else { throw EngineError(name: "actionFailed", "The element did not accept the value.") }
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
      try setElementValue(value, on: target.element, role: target.entry.identity.role, ax: .live, meta: &meta,
                          focus: { meta in
                            if route == .activation {
                              try holdElementFocus(target, app: app, appPid: appPid, guarding: guarding, context: context, meta: &meta)
                            }
                            try focusField(target, app: app, appPid: appPid, guarding: guarding, connection: context.connection, meta: &meta)
                          },
                          checkInFlight: guarding.checkInFlight, acted: { context.connection.markActed(app) })
      // The write was accepted (setElementValue throws otherwise): the cursor points at the element, read after the write.
      cursor.act(connection: context.connection.id, app: app.key, window: nil, .element(target.element, storedFrame: target.entry.frame))
      // The vendor's re-check after the write: a re-fetch matching without the value, whose result replaces the stored
      // handle and identity; a failed one propagates, after the write (the interval says it was made).
      _ = try context.connection.element(token, app: app, lineage: context.lineage ?? "", refetch: .ignoringValue) { ElementResolver.live($0, pid: appPid) }
      return ["meta": meta.wire]
    } catch let error as EngineError {
      throw withMeta(error, meta)
    }
  }
}
