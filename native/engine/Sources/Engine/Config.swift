import Foundation

// The engine's own settings in $HOME/.config/cua/engine.json (the spec's Decision Log, M1a pre-flight item 4). The file
// is shared: `engine` and `signingIdentity` are other readers' and left alone here. The engine reads three keys, once at
// launch. `peerPolicy` selects the peer check: in #117 its only value is "uid" (absent means "uid"), the policy the owner
// accepted on 2026-10-18; a second value (#174's trusted-ancestor policy) is a new case of PeerPolicy. `routes` is the
// owner's per-app route-4 override (the spec's Design, "Input" route 4): `{<bundle id>: 4}`, absent or empty meaning no
// app gets route 4. `cursor` is the agent cursor's per-device switch (#235's spec, "Settings"): `false` turns every
// session's cursor off, absent or `true` leaves it on. `cursorDebug` names one diagnostic arm of the cursor for an attended
// sitting (CursorDebug; #235's Decision Log, 2026-10-31), absent meaning none. Any other value of any of them, or a file that is not a JSON
// object, stops the engine at start with a sentence naming the setting, so a policy, an override or a switch the owner
// wrote is never silently replaced or dropped.

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

/// One diagnostic arm of the agent cursor, `cursorDebug` in engine.json, read at launch: each takes one part of what a
/// visible cursor costs the window server away, so a sitting can attribute the cost (#235's Decision Log, 2026-10-31).
enum CursorDebug: String, CaseIterable, Sendable {
  /// The panel is never ordered in; every commit, keyframe install and transition still runs.
  case panelOut
  /// The halo's backdrop blur is hidden, leaving its tint disc (the spec's fallback (a), as an arm).
  case noBackdrop
  /// The cursor never rocks: nothing animates once it settles.
  case noRock
  /// The layers as the sitting's build had them: the rock layer's blur filter installed for the panel's whole life, and
  /// the arrow's shadow with no explicit path.
  case legacyLayers
}

struct EngineSettings {
  let peerPolicy: PeerPolicy
  /// Bundle id → route; the only route an override names is 4.
  var routes: [String: Int] = [:]
  /// Whether sessions on this device draw the agent cursor.
  var cursor = true
  /// The cursor's diagnostic arm, none by default.
  var cursorDebug: CursorDebug?

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
    var policy = PeerPolicy.uid
    if let given = object["peerPolicy"] {
      guard let name = given as? String, let named = PeerPolicy(rawValue: name) else {
        throw Invalid(message: "peerPolicy in \(path) must be \"uid\" (or absent); this engine has no other peer policy")
      }
      policy = named
    }
    return EngineSettings(peerPolicy: policy, routes: try parseRoutes(object["routes"], path: path), cursor: try parseCursor(object["cursor"], path: path),
                          cursorDebug: try parseCursorDebug(object["cursorDebug"], path: path))
  }

  /// `cursorDebug`: absent, or the name of one arm.
  private static func parseCursorDebug(_ given: Any?, path: String) throws -> CursorDebug? {
    guard let given else { return nil }
    guard let name = given as? String, let arm = CursorDebug(rawValue: name) else {
      let arms = CursorDebug.allCases.map { "\"\($0.rawValue)\"" }.joined(separator: ", ")
      throw Invalid(message: "cursorDebug in \(path) must be one of \(arms) (or absent); it names one diagnostic arm of the agent cursor")
    }
    return arm
  }

  /// `cursor`: absent, or a JSON boolean (not a number: NSNumber carries both).
  private static func parseCursor(_ given: Any?, path: String) throws -> Bool {
    guard let given else { return true }
    guard let flag = given as? NSNumber, CFGetTypeID(flag) == CFBooleanGetTypeID() else {
      throw Invalid(message: "cursor in \(path) must be true or false (or absent); false turns the agent cursor off on this device")
    }
    return flag.boolValue
  }

  /// `routes`: absent, or an object of bundle ids each mapped to the number 4.
  private static func parseRoutes(_ given: Any?, path: String) throws -> [String: Int] {
    guard let given else { return [:] }
    let invalid = Invalid(message: "routes in \(path) must map bundle ids to 4, the foreground route (or be absent); this engine has no other route override")
    guard let table = given as? [String: Any] else { throw invalid }
    var routes: [String: Int] = [:]
    for (bundle, route) in table {
      guard !bundle.isEmpty, let number = route as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
            number.doubleValue == 4 else { throw invalid }
      routes[bundle] = 4
    }
    return routes
  }

  /// The settings of this run; a missing file is the defaults, an unreadable one an error.
  static func load(environment: [String: String] = ProcessInfo.processInfo.environment) throws -> EngineSettings {
    let path = path(environment: environment)
    guard FileManager.default.fileExists(atPath: path) else { return try parse(nil, path: path) }
    guard let data = FileManager.default.contents(atPath: path) else { throw Invalid(message: "\(path) cannot be read; the engine reads peerPolicy from it") }
    return try parse(data, path: path)
  }
}
