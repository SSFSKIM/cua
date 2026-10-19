import Foundation

// Input methods (the spec's Design, "Input"). Not built in this spike task: click, press_key and type_text answer
// `notImplemented` until the input routes are written in a follow-up task (the report records why).
extension Engine {
  func click(_ args: [String: Any], _ context: ExecutionContext) throws -> Any { throw inputNotBuilt("click") }
  func pressKey(_ args: [String: Any], _ context: ExecutionContext) throws -> Any { throw inputNotBuilt("press_key") }
  func typeText(_ args: [String: Any], _ context: ExecutionContext) throws -> Any { throw inputNotBuilt("type_text") }

  private func inputNotBuilt(_ method: String) -> EngineError {
    EngineError(name: "notImplemented", "\(method) is not implemented by this engine build")
  }
}
