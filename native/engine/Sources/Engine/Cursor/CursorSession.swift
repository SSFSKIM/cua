import Foundation

// One connection's cursor settings, as its `cursor` requests set them (the spec's Interfaces, the wire request; "Lifecycle
// and identity"): the session's label and colour, and its off switch. The service sends them at connect, resolved on the
// trusted side (MAWS's CUA_CURSOR_LABEL and CUA_CURSOR_COLOR, the session's sminos name, the project folder's name, the
// hash colour), and `{"hide": true}` at end_task. The wire is a boundary: any client of it may send the request, so it is
// checked here and a malformed one refused, changing nothing. What a session has not set is its placeholder's.

/// A `cursor` request's params.
enum CursorRequest: Equatable {
  /// `{"hide": true}`: end_task, the cursor fades at once.
  case hide
  /// Any of `label`, `color` (`#rrggbb`) and `enabled`; nil leaves that one as it is.
  case configure(label: String?, color: RGB?, enabled: Bool?)

  init(_ params: [String: Any]) throws {
    func invalid(_ what: String) -> EngineError { EngineError(rpc: .invalidParams, "Invalid params: \(what)") }
    if let hide = params["hide"] {
      guard let flag = hide as? NSNumber, CFGetTypeID(flag) == CFBooleanGetTypeID(), flag.boolValue else { throw invalid("hide must be true") }
      self = .hide
      return
    }
    var label: String?
    if let given = params["label"] {
      guard let text = given as? String else { throw invalid("label must be a string") }
      label = text
    }
    var color: RGB?
    if let given = params["color"] {
      guard let text = given as? String, text.count == 7, text.dropFirst().allSatisfy(\.isHexDigit), let rgb = RGB(hex: text) else {
        throw invalid("color must be #rrggbb")
      }
      color = rgb
    }
    var enabled: Bool?
    if let given = params["enabled"] {
      guard let flag = given as? NSNumber, CFGetTypeID(flag) == CFBooleanGetTypeID() else { throw invalid("enabled must be true or false") }
      enabled = flag.boolValue
    }
    self = .configure(label: label, color: color, enabled: enabled)
  }
}

/// A label as a session gives it, ready for the pill: control characters removed, trimmed; nil when nothing is left (the
/// label stays as it was). The pill's 24-character cut is CursorIdentity's.
func sessionLabel(_ text: String) -> String? {
  let kept = String(String.UnicodeScalarView(text.unicodeScalars.filter { $0.properties.generalCategory != .control }))
  let trimmed = kept.trimmingCharacters(in: .whitespacesAndNewlines)
  return trimmed.isEmpty ? nil : trimmed
}

/// What a connection's `cursor` requests have set (ConnectionState.cursor).
struct CursorSession: Equatable {
  var label: String?
  var color: RGB?
  /// The session's own switch; the device's (engine.json) is the engine's.
  var enabled = true

  mutating func apply(_ request: CursorRequest) {
    guard case .configure(let label, let color, let enabled) = request else { return }
    if let label, let kept = sessionLabel(label) { self.label = kept }
    if let color { self.color = color }
    if let enabled { self.enabled = enabled }
  }

  /// The identity the hub draws: the session's label and colour, the connection's placeholder for what it has not set.
  func identity(connection: Int) -> CursorIdentity {
    let placeholder = placeholderIdentity(connection: connection)
    return CursorIdentity(label: label ?? placeholder.label, color: color?.color ?? placeholder.color)
  }
}
