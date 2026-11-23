import Foundation

// The permission boundary (own-native-engine spec, Design "Install, signing and permissions"). The system request is
// still made (the owner's decision of 2026-10-24), but its prompt may never appear for this engine, so the sentence
// leads the by-hand path; its steps are src/runtime/engine.mjs's grantSteps, word for word. `meta.permission` is wire
// metadata for the service, never model text: only Screen Recording's arms the service's relaunch on the next
// screenshot, since macOS applies a Screen Recording grant to a relaunched process, while Accessibility applies to the
// running one.
enum EnginePermission: String {
  case accessibility
  case screenRecording

  var pane: String {
    switch self {
    case .accessibility: return "Accessibility"
    case .screenRecording: return "Screen & System Audio Recording"
    }
  }

  /// Returns when `granted()`; otherwise makes the system `request()` once and fails `permissionsPending`.
  func require(bundlePath: String = Bundle.main.bundlePath, granted: () -> Bool, request: () -> Void) throws {
    guard !granted() else { return }
    request()
    // The instruction comes first even when the request changed the grant: a screenshot must not go on in a process
    // whose Screen Recording grant has not taken effect yet.
    let steps = "cua Engine needs \(pane): at the console, open System Settings → Privacy & Security → \(pane), "
      + "click \"+\", press ⌘⇧G and enter \(bundlePath), then switch it on"
    let next = self == .screenRecording
      ? "; a relaunch of the engine is pending before screenshots can use it. Retry after granting it."
      : ", then retry."
    throw EngineError(.permissionsPending, steps + next, extra: ["meta": ["permission": rawValue]])
  }
}
