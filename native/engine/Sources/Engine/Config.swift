import Foundation

// The engine's own settings in $HOME/.config/cua/engine.json (the spec's Decision Log, M1a pre-flight item 4). The file
// is shared: `engine`, `signingIdentity` and `routes` are other readers' and left alone here. The engine reads one key,
// `peerPolicy`, which selects the peer check: in #117 its only value is "uid" (absent means "uid"), the policy the owner
// accepted on 2026-10-18; any other value, or a file that is not a JSON object, stops the engine at start with a
// sentence naming the setting, so a policy this build does not have is never silently replaced by a weaker one. A
// second value (#174's trusted-ancestor policy) is a new case of PeerPolicy.

/// Who may hold a connection to the engine (the spec's Design, "Socket and peer check").
enum PeerPolicy: String {
  /// Any process of the engine's own user (getpeereid); the sandbox's seatbelt deny and the forbidden list do the rest.
  case uid

  /// Whether a peer whose uid is `peerUid` may stay connected.
  func admits(peerUid: uid_t) -> Bool {
    switch self {
    case .uid: return peerUid == getuid()
    }
  }
}

struct EngineSettings {
  let peerPolicy: PeerPolicy

  /// A setting the engine cannot run under; `message` names the setting and the file.
  struct Invalid: Error {
    let message: String
  }

  static func path(environment: [String: String] = ProcessInfo.processInfo.environment) -> String {
    let home = environment["HOME"].flatMap { $0.isEmpty ? nil : $0 } ?? NSHomeDirectory()
    return (home as NSString).appendingPathComponent(".config/cua/engine.json")
  }

  /// The settings in `data`, the contents of the file at `path` (nil: no file).
  static func parse(_ data: Data?, path: String) throws -> EngineSettings {
    guard let data else { return EngineSettings(peerPolicy: .uid) }
    guard let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
      throw Invalid(message: "\(path) is not a JSON object; the engine reads peerPolicy from it")
    }
    guard let given = object["peerPolicy"] else { return EngineSettings(peerPolicy: .uid) }
    guard let name = given as? String, let policy = PeerPolicy(rawValue: name) else {
      throw Invalid(message: "peerPolicy in \(path) must be \"uid\" (or absent); this engine has no other peer policy")
    }
    return EngineSettings(peerPolicy: policy)
  }

  /// The settings of this run; a missing file is the defaults, an unreadable one an error.
  static func load(environment: [String: String] = ProcessInfo.processInfo.environment) throws -> EngineSettings {
    let path = path(environment: environment)
    guard FileManager.default.fileExists(atPath: path) else { return try parse(nil, path: path) }
    guard let data = FileManager.default.contents(atPath: path) else { throw Invalid(message: "\(path) cannot be read; the engine reads peerPolicy from it") }
    return try parse(data, path: path)
  }
}
