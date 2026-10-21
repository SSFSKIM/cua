import ApplicationServices
import Foundation

// set_value (R/F-helper-logic.md §16.4, R/sky-behaviour.md §16; the Decision Log's M2a vendor reading, item 4): the
// element scrolled into view, its AXValue checked settable, the field focused (focusFieldIfNeeded), the string coerced
// to the type of the element's current value, written through AXValue, and the element kept resolvable by its new
// value (the vendor re-fetches ignoring the value; the value is not read back or compared). No search-field
// auto-submit: the vendor turns it off for a node_repl-class client, cua's kind. Route 1: nothing is posted unless the
// focus fallback clicks. A concealed request (a substituted secret) goes the same way; no sentence here ever carries the
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

extension Engine {
  /// `set_value {app, element, value, concealed?}`.
  func setValue(_ args: [String: Any], _ context: ExecutionContext) throws -> Any {
    guard let value = args["value"] as? String else { throw EngineError.invalidArguments("value is required") }
    let token = try requiredElementToken(args, context, method: "set_value")

    var meta = InputMeta(context)
    do {
      let (app, appPid, guarding) = try inputPrologue(args, context, meta: &meta)
      let target = try targetElement(token, app: app, appPid: appPid, context: context)
      meta.inputRoute = .action
      let ax = AXOps.live
      positionElement(target.element, ax: ax)
      guard ax.isSettable(target.element, kAXValueAttribute) else { throw valueNotSettable }
      try focusField(target, app: app, appPid: appPid, guarding: guarding, meta: &meta)
      let converted = try coercedValue(value, to: valueKind(of: ax.read(target.element, kAXValueAttribute), role: target.entry.identity.role,
                                                          subrole: ax.subrole(target.element)))
      try guarding.checkInFlight()
      if meta.startedAt == nil { meta.startedAt = unixMilliseconds() }
      let written = ax.write(target.element, kAXValueAttribute, converted)
      meta.endedAt = unixMilliseconds()
      context.connection.markActed(app)
      guard written == .success else { throw EngineError(name: "actionFailed", "The element did not accept the value.") }
      // The element stays resolvable by what it holds now (its token's identity re-read, the value included).
      if let number = tokenNumber(token), let data = ElementSource().data(target.element) {
        context.connection.lineages[app.key]?.refreshIdentity(number, data)
      }
      return ["meta": meta.wire]
    } catch let error as EngineError {
      throw withMeta(error, meta)
    }
  }
}
