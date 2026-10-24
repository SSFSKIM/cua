import Foundation

// The permission boundary (own-native-engine spec, Design "Install, signing and permissions"). The by-hand steps
// mirror src/runtime/engine.mjs's grantSteps: prompts may never appear. The marker is wire metadata, not model text;
// only Screen Recording arms the service's next-observation relaunch. Accessibility applies to the running process.
enum EnginePermission: String {
  case accessibility
  case screenRecording

  var pane: String {
    switch self {
    case .accessibility: return "Accessibility"
    case .screenRecording: return "Screen & System Audio Recording"
    }
  }

  func require(bundlePath: String = Bundle.main.bundlePath, granted: () -> Bool, request: () -> Void) throws {
    guard !granted() else { return }
    request()
    // Even if the prompting call changes the grant, return the instruction first. The screenshot request must not
    // continue on a process whose Screen Recording permission has not yet taken effect.
    let steps = "cua Engine needs \(pane): at the console, open System Settings → Privacy & Security → \(pane), "
      + "click \"+\", press ⌘⇧G and enter \(bundlePath), then switch it on"
    let next = self == .screenRecording
      ? "; a relaunch of the engine is pending before screenshots can use it. Retry after granting it."
      : ", then retry."
    throw EngineError(.permissionsPending, steps + next, extra: ["meta": ["permission": rawValue]])
  }
}
